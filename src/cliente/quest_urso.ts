// Tela do Quest: o jogador do UrsoBura, em primeira pessoa, com as patas nos controles.
// - online: entra na sala do PC (código de 5 caracteres), manda cabeça e patas e desenha as fotos que chegam;
// - solo: roda a luta aqui mesmo, contra o original e os clones controlados pela IA (offline).
// A vibração não espera a rede: o Quest confere o contato das próprias patas com o que está vendo (GDD seção 4).

import * as THREE from 'three';
import { entrada, ligarControlesVR, lerVR, vibrar, type Lado } from '../xr/entrada';
import { criarPata, type EstadoMao, type Mao } from '../xr/patas';
import { Luta, prepararFisica, type EntradaUrso, type Evento, type Foto } from '../simulacao/luta';
import { PIRANBENJA, URSO, VIBRACAO, gerarBlocos, qualidadeDoGolpe } from '../simulacao/regras';
import { codificarEntrada, decodificarFoto } from '../rede/protocolo';
import { abrirCanal, type Canal } from '../rede/canal';
import { Onomatopeias, Piranbenjas, criarCena, criarRingue } from './visual';

export interface OpcoesQuest { modo: 'online' | 'solo'; tipoCanal: 'trystero' | 'local'; codigo?: string }

export async function iniciarQuest(raiz: HTMLElement, op: OpcoesQuest): Promise<void> {
  raiz.innerHTML = `
    <div class="jogo"><div class="tela" id="tela"></div>
      <div class="placa topo">
        ${op.modo === 'online' ? `<label class="campo" for="codigoSala">Código da sala <input id="codigoSala" maxlength="5" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABC23"></label>
        <button type="button" class="botao" id="conectar">Conectar</button>` : '<span class="rotulo">Solo contra os clones</span>'}
        <button type="button" class="botao principal" id="entrarVR">Entrar no VR</button>
        <span id="estado">${op.modo === 'online' ? 'Digite o código que aparece no PC do Piranbenja.' : 'Offline: a luta roda aqui no óculos.'}</span>
      </div>
    </div>`;
  const tela = raiz.querySelector('#tela') as HTMLDivElement;
  const estadoTxt = raiz.querySelector('#estado') as HTMLSpanElement;
  const render = new THREE.WebGLRenderer({ antialias: true });
  render.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  render.xr.enabled = true; render.xr.setReferenceSpaceType('local-floor');
  tela.appendChild(render.domElement);
  const { cena } = criarCena();
  criarRingue(cena, gerarBlocos());
  const camera = new THREE.PerspectiveCamera(70, 1, 0.01, 200);
  const rig = new THREE.Group(); cena.add(rig); rig.add(camera); camera.position.set(0, 1.6, 0);
  rig.position.set(0, 0, 3);
  const pbs = new Piranbenjas(cena), onos = new Onomatopeias(cena);

  // ---------- patas ----------
  const estadoPata: EstadoMao = { cor: 'normal', agulhas: 0, furadeira: false, carga: 0, sabre: false, tamanho: 1.3 };
  const patas: Record<Lado, Mao> = { esq: criarPata(-1), dir: criarPata(1) };
  for (const l of ['esq', 'dir'] as const) { rig.add(entrada.maos[l].pose); entrada.maos[l].pose.add(patas[l].suporte); }
  ligarControlesVR(render, rig);
  let alturaReal = 1.6, medirEm = 0;
  const escala = () => (entrada.modo === 'vr' ? 2.45 / Math.max(0.9, alturaReal) : 1);

  // ---------- painel no pulso: resistência, aura e placar ----------
  const pc = document.createElement('canvas'); pc.width = 256; pc.height = 128;
  const pt = new THREE.CanvasTexture(pc); pt.colorSpace = THREE.SRGBColorSpace;
  const painelPulso = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.08), new THREE.MeshBasicMaterial({ map: pt, transparent: true }));
  painelPulso.position.set(0, 0.07, 0.12); painelPulso.rotation.x = -Math.PI / 2;
  entrada.maos.esq.pose.add(painelPulso);
  function desenharPulso(f: Foto | null): void {
    const g = pc.getContext('2d')!; g.clearRect(0, 0, 256, 128);
    g.fillStyle = 'rgba(12,26,36,0.9)'; g.fillRect(0, 0, 256, 128);
    g.fillStyle = '#4fd6d0'; g.font = '700 30px Nunito, sans-serif';
    g.fillText(`Res ${f?.urso.res ?? 100}  Aura ${f?.urso.aura ?? 0}`, 12, 50);
    g.fillStyle = '#8fd651'; g.fillText(`Placar ${f?.placar.urso ?? 0} × ${f?.placar.piranbenja ?? 0}`, 12, 100);
    pt.needsUpdate = true;
  }
  // ---------- aviso grande à frente (fim de rodada, conexão) ----------
  const ac = document.createElement('canvas'); ac.width = 1024; ac.height = 256;
  const at = new THREE.CanvasTexture(ac); at.colorSpace = THREE.SRGBColorSpace;
  const aviso = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.3), new THREE.MeshBasicMaterial({ map: at, transparent: true, depthTest: false }));
  aviso.position.set(0, 1.9, -1.6); aviso.renderOrder = 20; rig.add(aviso); aviso.visible = false;
  let avisoAte = 0;
  function avisar(t: string, segundos = 3): void {
    const g = ac.getContext('2d')!; g.clearRect(0, 0, 1024, 256);
    g.fillStyle = 'rgba(12,26,36,0.88)'; g.fillRect(0, 40, 1024, 176);
    g.fillStyle = '#e8f3f2'; g.font = '800 72px "Baloo 2", Nunito, sans-serif'; g.textAlign = 'center'; g.fillText(t, 512, 152);
    at.needsUpdate = true; aviso.visible = true; avisoAte = performance.now() / 1000 + segundos;
  }

  // ---------- fonte das fotos: a luta local (solo) ou a rede (online) ----------
  let luta: Luta | null = null, canal: Canal | null = null;
  const fotos: { t: number; f: Foto }[] = [];
  const eventosRecebidos: Evento[] = [];
  if (op.modo === 'solo') {
    await prepararFisica();
    luta = new Luta({ originalAutomatico: true, clonesIniciais: 5 });
  } else {
    const conectar = (codigo: string) => {
      canal?.fechar();
      canal = abrirCanal(op.tipoCanal, 'convidado', codigo);
      estadoTxt.textContent = 'Procurando a sala ' + codigo + '…';
      canal.aoConectar = () => { estadoTxt.textContent = 'Conectado à sala ' + codigo + '. Aperte "Entrar no VR".'; void canal?.tipoConexao().then((t) => { if (t !== 'desconhecida') estadoTxt.textContent += t === 'local' ? ' (conexão local)' : ' (pela internet)'; }); };
      canal.aoRecusar = (m) => { estadoTxt.textContent = m === 'versao' ? 'Versões diferentes: atualize o jogo nos dois aparelhos.' : 'Essa sala já tem um UrsoBura.'; };
      canal.aoSair = () => { estadoTxt.textContent = 'O PC saiu da sala.'; avisar('Reconectando…', 30); };
      canal.aoRapido = (d) => { const f = decodificarFoto(d); if (f) { fotos.push({ t: performance.now() / 1000, f }); if (fotos.length > 20) fotos.shift(); } };
      canal.aoEvento = (e) => { if (e && typeof e === 'object' && 'tipo' in e) eventosRecebidos.push(e as Evento); };
    };
    const campo = raiz.querySelector('#codigoSala') as HTMLInputElement;
    campo.addEventListener('input', () => { campo.value = campo.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
    raiz.querySelector('#conectar')!.addEventListener('click', () => { if (campo.value.length === 5) conectar(campo.value); else estadoTxt.textContent = 'O código tem 5 caracteres.'; });
    if (op.codigo) { campo.value = op.codigo; conectar(op.codigo); }
  }

  // ---------- entrar no VR ----------
  const botaoVR = raiz.querySelector('#entrarVR') as HTMLButtonElement;
  if (!navigator.xr || !(await navigator.xr.isSessionSupported('immersive-vr').catch(() => false))) {
    botaoVR.disabled = true; botaoVR.title = 'Abra no navegador do Quest';
  } else botaoVR.addEventListener('click', async () => {
    try { await render.xr.setSession(await navigator.xr!.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor'] })); }
    catch (e) { estadoTxt.textContent = 'Não foi possível entrar no VR: ' + (e as Error).message; }
  });
  render.xr.addEventListener('sessionstart', () => { entrada.modo = 'vr'; camera.position.set(0, 0, 0); medirEm = 30; for (const m of Object.values(entrada.maos)) { m.pose.position.set(0, 0, 0); m.pose.quaternion.identity(); } });
  render.xr.addEventListener('sessionend', () => { entrada.modo = 'pc'; camera.position.set(0, 1.6, 0); });

  // ---------- vibração prevista no Quest ----------
  const recarga = new Map<string, number>();
  const anterior: Record<Lado, THREE.Vector3 | null> = { esq: null, dir: null };
  const v3 = new THREE.Vector3();
  function preverContatos(dt: number, agora: number): void {
    const raioMao = URSO.raioMao * (estadoPata.tamanho / 1.3);
    for (const l of ['esq', 'dir'] as const) {
      const p = entrada.maos[l].pose.getWorldPosition(new THREE.Vector3());
      const a = anterior[l]; anterior[l] = p.clone();
      if (!a) continue;
      const vel = { x: (p.x - a.x) / dt, y: (p.y - a.y) / dt, z: (p.z - a.z) / dt }, rapidez = Math.hypot(vel.x, vel.y, vel.z);
      for (const b of pbs.posicoes()) {
        const yEixo = Math.max(b.pos.y - PIRANBENJA.altura / 2 + PIRANBENJA.raio, Math.min(b.pos.y + PIRANBENJA.altura / 2 - PIRANBENJA.raio, p.y));
        v3.set(p.x - b.pos.x, p.y - yEixo, p.z - b.pos.z);
        if (v3.length() > raioMao + PIRANBENJA.raio + 0.03) continue;
        const chave = l + b.numero;
        if ((recarga.get(chave) ?? 0) > agora) continue;
        if (rapidez < 1.6) { recarga.set(chave, agora + 0.5); vibrar(l, ...VIBRACAO.encostar); continue; }
        recarga.set(chave, agora + 0.35);
        const q = qualidadeDoGolpe(vel, { x: b.pos.x - p.x, y: 0, z: b.pos.z - p.z });
        const [forca, ms] = VIBRACAO[q]; vibrar(l, forca, ms);
        onos.mostrar(q === 'cheio' ? 'POW!' : q === 'raspao' ? 'tsk' : 'PAF!', { x: b.pos.x, y: b.pos.y + 0.8, z: b.pos.z }, q === 'cheio' ? '#ffe066' : '#e8f3f2', 0.45);
      }
    }
  }

  // ---------- eventos da luta ----------
  const empurrao = new THREE.Vector3();
  function reagir(ev: Evento): void {
    if ((ev as unknown as { tipo: string }).tipo === 'recusa') { estadoTxt.textContent = 'Essa sala já tem um UrsoBura.'; return; }
    if (ev.tipo === 'ursoGolpeado') {
      vibrar('esq', ...VIBRACAO.levarGolpe); vibrar('dir', ...VIBRACAO.levarGolpe);
      empurrao.x += ev.empurrao.x; empurrao.z += ev.empurrao.z;
      const c = camera.getWorldPosition(new THREE.Vector3());
      if (ev.combo > 1) onos.mostrar('KA-POW!', { x: c.x, y: c.y - 0.4, z: c.z - 1.2 }, '#4fd6d0', 0.4);
    }
    if (ev.tipo === 'agarrou') vibrar(ev.mao, ...VIBRACAO.agarrar);
    if (ev.tipo === 'arremessou') vibrar(ev.mao, ...VIBRACAO.arremessar);
    if (ev.tipo === 'strike') { const c = camera.getWorldPosition(new THREE.Vector3()); onos.mostrar('STRIKE!', { x: c.x, y: c.y + 0.2, z: c.z - 3 }, '#ff7a6b', 0.9, 1.4); }
    if (ev.tipo === 'fimRodada') avisar(ev.vencedor === 'urso' ? 'O original caiu! Ponto seu!' : 'Você saiu do ringue!');
    if (ev.tipo === 'novaRodada') { rig.position.set(0, 0, 3); rig.rotation.set(0, 0, 0); empurrao.set(0, 0, 0); }
  }

  // ---------- quadro a quadro ----------
  const relogio = new THREE.Clock();
  let ateEnvio = 0, atePulso = 0, giroArmado = true;
  let ultimaFoto: Foto | null = null;
  function entradaDoUrso(): EntradaUrso {
    const c = camera.getWorldPosition(new THREE.Vector3());
    const mao = (l: Lado) => { const p = entrada.maos[l].pose.getWorldPosition(new THREE.Vector3()); return { pos: { x: p.x, y: p.y, z: p.z }, gatilho: entrada.maos[l].gatilhoValor, grip: entrada.maos[l].gripValor }; };
    return { cabeca: { x: c.x, y: c.y, z: c.z }, maos: { esq: mao('esq'), dir: mao('dir') }, tamanhoPata: estadoPata.tamanho };
  }
  function fotoInterpolada(agora: number): Foto | null {
    if (!fotos.length) return null;
    const alvo = agora - 0.1; // desenha 100 ms atrás, suavizando
    let i = fotos.length - 1; while (i > 0 && fotos[i - 1].t > alvo) i--;
    const b = fotos[i], a = fotos[Math.max(0, i - 1)];
    if (a === b || b.t <= a.t) return b.f;
    const k = THREE.MathUtils.clamp((alvo - a.t) / (b.t - a.t), 0, 1);
    const antes = new Map(a.f.piranbenjas.map((p) => [p.numero, p]));
    return { ...b.f, piranbenjas: b.f.piranbenjas.map((p) => {
      const q = antes.get(p.numero); if (!q) return p;
      return { ...p, pos: { x: q.pos.x + (p.pos.x - q.pos.x) * k, y: q.pos.y + (p.pos.y - q.pos.y) * k, z: q.pos.z + (p.pos.z - q.pos.z) * k } };
    }) };
  }
  function quadro(): void {
    const dt = Math.min(0.05, relogio.getDelta()), agora = performance.now() / 1000;
    if (entrada.modo === 'vr') {
      lerVR();
      if (medirEm > 0 && --medirEm === 0 && camera.position.y > 0.5) alturaReal = camera.position.y;
      // analógico esquerdo anda (o gigante anda mais por passo); direito gira 30°
      const a = entrada.maos.esq.analogico;
      if (a.lengthSq() > 0.01) {
        const fr = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion())); fr.y = 0; fr.normalize();
        const la = new THREE.Vector3(-fr.z, 0, fr.x);
        rig.position.addScaledVector(fr.multiplyScalar(-a.y).add(la.multiplyScalar(a.x)), 1.4 * rig.scale.x * dt);
      }
      const d = entrada.maos.dir.analogico;
      if (Math.abs(d.x) < 0.3) giroArmado = true;
      if (giroArmado && Math.abs(d.x) > 0.7) {
        giroArmado = false; const c = camera.getWorldPosition(new THREE.Vector3()), ang = -Math.sign(d.x) * Math.PI / 6;
        const r = rig.position.clone().sub(c); r.applyAxisAngle(new THREE.Vector3(0, 1, 0), ang); rig.position.copy(c).add(r); rig.position.y = 0; rig.rotation.y += ang;
      }
    }
    rig.scale.setScalar(escala());
    // empurrão recebido: desliza e perde força
    rig.position.addScaledVector(empurrao, dt); empurrao.multiplyScalar(Math.exp(-2.5 * dt));
    const e = entradaDoUrso();
    let foto: Foto | null;
    if (luta) {
      luta.definirUrso(e); luta.avancar(dt);
      for (const ev of luta.tirarEventos()) reagir(ev);
      foto = luta.foto();
    } else {
      ateEnvio -= dt;
      if (ateEnvio <= 0 && canal?.conectado()) { ateEnvio = 1 / 36; canal.enviarRapido(codificarEntrada(e)); }
      while (eventosRecebidos.length) reagir(eventosRecebidos.shift()!);
      foto = fotoInterpolada(agora);
    }
    if (foto) { pbs.desenhar(foto.piranbenjas); ultimaFoto = foto; }
    preverContatos(dt, agora);
    for (const l of ['esq', 'dir'] as const) {
      patas[l].atualizar(entrada.maos[l].gatilhoValor, entrada.maos[l].gripValor, estadoPata, rig.scale.x, agora, dt);
      patas[l].apontarAntebraco(null);
    }
    atePulso -= dt; if (atePulso <= 0) { atePulso = 0.25; desenharPulso(ultimaFoto); }
    if (aviso.visible && agora > avisoAte) aviso.visible = false;
    onos.atualizar(dt);
    render.render(cena, camera);
  }
  function tamanho(): void { const r = tela.getBoundingClientRect(); render.setSize(r.width, r.height, false); camera.aspect = r.width / Math.max(1, r.height); camera.updateProjectionMatrix(); }
  new ResizeObserver(tamanho).observe(tela); tamanho();
  desenharPulso(null);
  render.setAnimationLoop(quadro);
  (window as unknown as { __teste: unknown }).__teste = { THREE, entrada, rig, camera, patas, get luta() { return luta; }, get canal() { return canal; }, fotos,
    // só para os testes: o Chromium sem tela desenha poucos quadros; isto manda a entrada na hora
    enviarAgora: () => { if (canal?.conectado()) canal.enviarRapido(codificarEntrada(entradaDoUrso())); } };
}
