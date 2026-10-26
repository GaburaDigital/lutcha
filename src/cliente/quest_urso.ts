// Tela do Quest: o jogador do UrsoBura, em primeira pessoa, com as patas nos controles.
// - online: entra na sala do PC (código de 5 caracteres), manda cabeça e patas e desenha as fotos que chegam;
// - solo: roda a luta aqui mesmo, contra o original e os clones controlados pela IA (offline). É o modo de teste do urso.
// A vibração não espera a rede: no online, o Quest confere o contato das próprias patas com o que está vendo (GDD seção 4);
// no solo, vibra direto com os golpes da luta local.
//
// Rodada 2 do urso (C14/C15): braço que estica para baixo, relógio que acende ao olhar o pulso, pausa com opções
// (segurar Y por 1 s, só no solo), painel de configuração do solo, cores dos acertos e placas de intenção.

import * as THREE from 'three';
import { entrada, ligarControlesVR, lerVR, vibrar, type Lado } from '../xr/entrada';
import { criarPata, type EstadoMao, type Mao } from '../xr/patas';
import { Luta, prepararFisica, type Comportamento, type EntradaUrso, type Evento, type Formacao, type Foto } from '../simulacao/luta';
import { GOLPES, OMBRO_ABAIXO_DOS_OLHOS, PIRANBENJA, URSO, VIBRACAO, classificarGolpe, esticarAltura, gerarBlocos, qualidadeDoGolpe } from '../simulacao/regras';
import { codificarEntrada, decodificarFoto } from '../rede/protocolo';
import { abrirCanal, type Canal } from '../rede/canal';
import { Onomatopeias, Piranbenjas, criarCena, criarRingue } from './visual';
import { T } from '../textos';

export interface OpcoesQuest { modo: 'online' | 'solo'; tipoCanal: 'trystero' | 'local'; codigo?: string }

/** Opções do solo de teste (ficam guardadas neste navegador). */
export interface ConfigSolo { comportamento: Comportamento; quantidade: number; formacao: Formacao; cores: boolean; placas: boolean; esticar: number }
const COMPORTAMENTOS: Comportamento[] = ['parados', 'aleatorio', 'cautelosos', 'ofensivos'];
const FORMACOES: Formacao[] = ['solto', 'torre', 'piramide', 'muralha', 'corrente'];
const CHAVE_CONFIG = 'lutcha.soloTeste';

function lerConfig(): ConfigSolo {
  const c: ConfigSolo = { comportamento: 'cautelosos', quantidade: 6, formacao: 'solto', cores: true, placas: true, esticar: 1.6 };
  try { Object.assign(c, JSON.parse(localStorage.getItem(CHAVE_CONFIG) ?? '{}')); } catch { /* sem armazenamento: usa o padrão */ }
  // a página também aceita as opções no endereço (testes automáticos e links prontos)
  const q = new URLSearchParams(location.search);
  const comp = q.get('comportamento') as Comportamento | null, form = q.get('formacao') as Formacao | null;
  if (comp && COMPORTAMENTOS.includes(comp)) c.comportamento = comp;
  if (form && FORMACOES.includes(form)) c.formacao = form;
  const qtd = Number(q.get('quantidade')), est = Number(q.get('esticar'));
  if (qtd >= 1 && qtd <= 15) c.quantidade = Math.round(qtd);
  if (est >= 1 && est <= 2.2) c.esticar = est;
  // conferência do que veio guardado
  if (!COMPORTAMENTOS.includes(c.comportamento)) c.comportamento = 'cautelosos';
  if (!FORMACOES.includes(c.formacao)) c.formacao = 'solto';
  c.quantidade = Math.min(15, Math.max(1, Math.round(Number(c.quantidade) || 6)));
  c.esticar = Math.min(2.2, Math.max(1, Number(c.esticar) || 1.6));
  c.cores = c.cores !== false; c.placas = c.placas !== false;
  return c;
}
function guardarConfig(c: ConfigSolo): void { try { localStorage.setItem(CHAVE_CONFIG, JSON.stringify(c)); } catch { /* sem armazenamento */ } }

export async function iniciarQuest(raiz: HTMLElement, op: OpcoesQuest): Promise<void> {
  const config = lerConfig();
  const solo = op.modo === 'solo';
  const opcoesHtml = (lista: string[], nomes: Record<string, string>, atual: string) => lista.map((v) => `<option value="${v}"${v === atual ? ' selected' : ''}>${nomes[v]}</option>`).join('');
  raiz.innerHTML = `
    <div class="jogo"><div class="tela" id="tela"></div>
      <div class="placa topo">
        ${!solo ? `<label class="campo" for="codigoSala">Código da sala <input id="codigoSala" maxlength="5" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABC23"></label>
        <button type="button" class="botao" id="conectar">Conectar</button>` : `<span class="rotulo">${T.painel.titulo}</span>`}
        <button type="button" class="botao principal" id="entrarVR">Entrar no VR</button>
        <span id="estado">${!solo ? 'Digite o código que aparece no PC do Piranbenja.' : 'Offline: a luta roda aqui no óculos. ' + T.painel.dicaPausa + '.'}</span>
      </div>
      <form class="placa configuracao" id="config" aria-label="${T.painel.titulo}">
        ${solo ? `<label>${T.painel.comportamento} <select id="cfgComportamento">${opcoesHtml(COMPORTAMENTOS, T.comportamentos, config.comportamento)}</select></label>
        <label>${T.painel.quantidade} <input id="cfgQuantidade" type="number" min="1" max="15" value="${config.quantidade}"></label>
        <label>${T.painel.formacao} <select id="cfgFormacao">${opcoesHtml(FORMACOES, T.formacoes, config.formacao)}</select></label>
        <label><input id="cfgCores" type="checkbox"${config.cores ? ' checked' : ''}> ${T.painel.cores}</label>
        <label><input id="cfgPlacas" type="checkbox"${config.placas ? ' checked' : ''}> ${T.painel.placas}</label>` : ''}
        <label>${T.painel.esticar} <input id="cfgEsticar" type="range" min="1" max="2.2" step="0.1" value="${config.esticar}"> <b id="cfgEsticarValor">${config.esticar.toFixed(1)}×</b></label>
      </form>
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

  // ---------- patas: presas num "alvo" que segue o controle, mas desce mais (braço que estica) ----------
  const estadoPata: EstadoMao = { cor: 'normal', agulhas: 0, furadeira: false, carga: 0, sabre: false, tamanho: 1.3 };
  const patas: Record<Lado, Mao> = { esq: criarPata(-1), dir: criarPata(1) };
  const alvoPata: Record<Lado, THREE.Group> = { esq: new THREE.Group(), dir: new THREE.Group() };
  for (const l of ['esq', 'dir'] as const) { rig.add(entrada.maos[l].pose); rig.add(alvoPata[l]); alvoPata[l].add(patas[l].suporte); }
  ligarControlesVR(render, rig);
  let alturaReal = 1.6, medirEm = 0;
  const escala = () => (entrada.modo === 'vr' ? 2.45 / Math.max(0.9, alturaReal) : 1);
  const tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), rigQInv = new THREE.Quaternion();
  /** Põe a pata no lugar: igual ao controle acima do ombro; abaixo, desce "esticar" vezes mais (em metros reais). */
  function posicionarPatas(): void {
    rig.updateMatrixWorld(true);
    rigQInv.copy(rig.getWorldQuaternion(tmpQ)).invert();
    const olhos = camera.position.y, ombro = olhos - OMBRO_ABAIXO_DOS_OLHOS;
    for (const l of ['esq', 'dir'] as const) {
      const pose = entrada.maos[l].pose;
      const p = rig.worldToLocal(pose.getWorldPosition(tmpV));
      alvoPata[l].position.set(p.x, esticarAltura(p.y, ombro, config.esticar), p.z);
      alvoPata[l].quaternion.copy(rigQInv).multiply(pose.getWorldQuaternion(tmpQ));
      // cotovelo estimado (metros reais): do ombro em direção à mão, um pouco caído; estica junto
      const lado = l === 'esq' ? -1 : 1, yaw = Math.atan2(-camera.matrix.elements[8], -camera.matrix.elements[10]);
      // direita de quem olha para (sen yaw, cos yaw) é (−cos yaw, sen yaw)
      const om = new THREE.Vector3(camera.position.x - Math.cos(yaw) * 0.18 * lado, ombro, camera.position.z + Math.sin(yaw) * 0.18 * lado);
      const para = om.clone().sub(p); const d = para.length();
      const cot = d > 0.05 ? p.clone().addScaledVector(para, Math.min(0.28, d * 0.6) / d) : om.clone();
      cot.y = esticarAltura(cot.y - 0.08, ombro, config.esticar);
      patas[l].apontarAntebraco(rig.localToWorld(cot), 2.4);
    }
  }
  const posPata = (l: Lado) => alvoPata[l].getWorldPosition(new THREE.Vector3());

  // ---------- relógio no pulso esquerdo: só acende quando você olha para ele ----------
  const pc = document.createElement('canvas'); pc.width = 256; pc.height = 160;
  const pt = new THREE.CanvasTexture(pc); pt.colorSpace = THREE.SRGBColorSpace;
  const painelPulso = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.1), new THREE.MeshBasicMaterial({ map: pt, transparent: true }));
  // nas costas do pulso esquerdo (no espaço do grip, as costas da mão esquerda ficam em −X): aparece quando você vira o pulso para olhar
  painelPulso.position.set(-0.08, 0, 0.11); painelPulso.rotation.y = -Math.PI / 2; painelPulso.visible = false;
  alvoPata.esq.add(painelPulso);
  let acertos = 0;
  function desenharPulso(f: Foto | null): void {
    const g = pc.getContext('2d')!; g.clearRect(0, 0, 256, 160);
    g.fillStyle = 'rgba(12,26,36,0.9)'; g.fillRect(0, 0, 256, 160);
    g.fillStyle = '#4fd6d0'; g.font = '700 28px Nunito, sans-serif';
    g.fillText(`${T.relogio.res} ${f?.urso.res ?? 100}  ${T.relogio.aura} ${f?.urso.aura ?? 0}`, 12, 40);
    g.fillStyle = '#8fd651'; g.fillText(`${T.relogio.placar} ${f?.placar.urso ?? 0} × ${f?.placar.piranbenja ?? 0}`, 12, 80);
    g.fillStyle = '#ffe066'; g.fillText(`${T.relogio.acertos} ${acertos}`, 12, 120);
    if (solo) { g.fillStyle = '#e8f3f2'; g.font = '600 17px Nunito, sans-serif'; g.fillText(T.painel.dicaPausa, 12, 150); }
    pt.needsUpdate = true;
  }
  const normalPulso = new THREE.Vector3();
  function olhandoOPulso(): boolean {
    if (entrada.modo !== 'vr') return true; // no computador, sempre à mostra
    painelPulso.getWorldPosition(tmpV);
    normalPulso.set(0, 0, 1).applyQuaternion(painelPulso.getWorldQuaternion(tmpQ));
    const paraOlho = camera.getWorldPosition(new THREE.Vector3()).sub(tmpV);
    const d = paraOlho.length(); paraOlho.normalize();
    return normalPulso.dot(paraOlho) > 0.6 && d < 0.9 * rig.scale.x;
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
  const aplicarConfigNaLuta = (recomecar: boolean) => {
    if (!luta) return;
    luta.opcoes.comportamento = config.comportamento; luta.opcoes.formacao = config.formacao; luta.opcoes.clonesIniciais = Math.max(0, config.quantidade - 1);
    if (recomecar) luta.reiniciar();
  };
  if (solo) {
    await prepararFisica();
    luta = new Luta({ originalAutomatico: true, clonesIniciais: config.quantidade - 1, comportamento: config.comportamento, formacao: config.formacao });
  } else {
    const conectar = (codigo: string) => {
      canal?.fechar();
      canal = abrirCanal(op.tipoCanal, 'convidado', codigo);
      estadoTxt.textContent = 'Procurando a sala ' + codigo + '…';
      canal.aoConectar = () => { estadoTxt.textContent = 'Conectado à sala ' + codigo + '. Aperte "Entrar no VR".'; void canal?.tipoConexao().then((t) => { if (t !== 'desconhecida') estadoTxt.textContent += t === 'local' ? ' (conexão local)' : ' (pela internet)'; }); };
      canal.aoRecusar = (m) => { estadoTxt.textContent = m === 'versao' ? 'Versões diferentes: atualize o jogo nos dois aparelhos.' : 'Essa sala já tem um UrsoBura.'; };
      canal.aoSair = () => { estadoTxt.textContent = 'O PC saiu da sala.'; avisar(T.reconectando, 30); };
      canal.aoRapido = (d) => { const f = decodificarFoto(d); if (f) { fotos.push({ t: performance.now() / 1000, f }); if (fotos.length > 20) fotos.shift(); } };
      canal.aoEvento = (e) => { if (e && typeof e === 'object' && 'tipo' in e) eventosRecebidos.push(e as Evento); };
    };
    const campo = raiz.querySelector('#codigoSala') as HTMLInputElement;
    campo.addEventListener('input', () => { campo.value = campo.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
    raiz.querySelector('#conectar')!.addEventListener('click', () => { if (campo.value.length === 5) conectar(campo.value); else estadoTxt.textContent = 'O código tem 5 caracteres.'; });
    if (op.codigo) { campo.value = op.codigo; conectar(op.codigo); }
  }

  // ---------- painel de configuração na página (antes de entrar no VR) ----------
  const form = raiz.querySelector('#config') as HTMLFormElement;
  const valorEsticar = raiz.querySelector('#cfgEsticarValor') as HTMLElement;
  form.addEventListener('submit', (e) => e.preventDefault());
  form.addEventListener('change', () => {
    const v = (id: string) => form.querySelector<HTMLInputElement | HTMLSelectElement>('#' + id);
    const antes = JSON.stringify([config.comportamento, config.formacao, config.quantidade]);
    if (v('cfgComportamento')) config.comportamento = v('cfgComportamento')!.value as Comportamento;
    if (v('cfgFormacao')) config.formacao = v('cfgFormacao')!.value as Formacao;
    if (v('cfgQuantidade')) config.quantidade = Math.min(15, Math.max(1, Math.round(Number(v('cfgQuantidade')!.value) || 6)));
    if (v('cfgCores')) config.cores = (v('cfgCores') as HTMLInputElement).checked;
    if (v('cfgPlacas')) config.placas = (v('cfgPlacas') as HTMLInputElement).checked;
    config.esticar = Number(v('cfgEsticar')!.value) || 1.6;
    valorEsticar.textContent = config.esticar.toFixed(1) + '×';
    guardarConfig(config);
    if (antes !== JSON.stringify([config.comportamento, config.formacao, config.quantidade])) aplicarConfigNaLuta(true);
  });
  form.addEventListener('input', () => { const r = form.querySelector('#cfgEsticar') as HTMLInputElement; config.esticar = Number(r.value); valorEsticar.textContent = config.esticar.toFixed(1) + '×'; });

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

  // ---------- pausa com opções (só no solo de teste): segurar Y por 1 s ----------
  const linhas = ['comportamento', 'quantidade', 'formacao', 'cores', 'placas', 'esticar', 'vibracao', 'recomecar', 'continuar'] as const;
  let pausado = false, linha = 0, seguraY = 0, eixoArmado = true;
  const pp = document.createElement('canvas'); pp.width = 640; pp.height = 640;
  const ptx = new THREE.CanvasTexture(pp); ptx.colorSpace = THREE.SRGBColorSpace;
  const painelPausa = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), new THREE.MeshBasicMaterial({ map: ptx, transparent: true, depthTest: false }));
  painelPausa.renderOrder = 30; painelPausa.visible = false; rig.add(painelPausa);
  function valorLinha(n: typeof linhas[number]): string {
    switch (n) {
      case 'comportamento': return T.comportamentos[config.comportamento];
      case 'quantidade': return String(config.quantidade);
      case 'formacao': return T.formacoes[config.formacao];
      case 'cores': return config.cores ? T.painel.sim : T.painel.nao;
      case 'placas': return config.placas ? T.painel.sim : T.painel.nao;
      case 'esticar': return config.esticar.toFixed(1) + '×';
      default: return '';
    }
  }
  function desenharPausa(): void {
    const g = pp.getContext('2d')!; g.clearRect(0, 0, 640, 640);
    g.fillStyle = 'rgba(12,26,36,0.94)'; g.beginPath(); g.roundRect(0, 0, 640, 640, 28); g.fill();
    g.fillStyle = '#4fd6d0'; g.font = '900 44px "Baloo 2", Nunito, sans-serif'; g.fillText(T.pausa, 28, 62);
    g.font = '700 30px Nunito, sans-serif';
    linhas.forEach((n, i) => {
      const y = 120 + i * 52, sel = i === linha;
      if (sel) { g.fillStyle = 'rgba(79,214,208,0.22)'; g.fillRect(16, y - 36, 608, 48); }
      g.fillStyle = sel ? '#ffe066' : '#e8f3f2';
      g.fillText(T.painel[n], 28, y);
      const v = valorLinha(n); if (v) { g.textAlign = 'right'; g.fillText((sel ? '◀ ' : '') + v + (sel ? ' ▶' : ''), 612, y); g.textAlign = 'left'; }
    });
    g.fillStyle = '#9fb3bd'; g.font = '600 22px Nunito, sans-serif'; g.fillText(T.painel.ajuda, 28, 620);
    ptx.needsUpdate = true;
  }
  function abrirPausa(): void {
    pausado = true; linha = linhas.length - 1;
    // à frente dos olhos, um pouco abaixo (coordenadas do rig = metros reais)
    const fr = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion); fr.y = 0; fr.normalize();
    painelPausa.position.copy(camera.position).addScaledVector(fr, 0.55); painelPausa.position.y -= 0.12;
    painelPausa.lookAt(rig.localToWorld(camera.position.clone()));
    painelPausa.visible = true; desenharPausa();
  }
  function fecharPausa(): void { pausado = false; painelPausa.visible = false; guardarConfig(config); }
  function mudarLinha(d: number): void {
    const n = linhas[linha];
    const gira = <X>(lista: X[], atual: X) => lista[(lista.indexOf(atual) + d + lista.length) % lista.length];
    if (n === 'comportamento') config.comportamento = gira(COMPORTAMENTOS, config.comportamento);
    if (n === 'formacao') config.formacao = gira(FORMACOES, config.formacao);
    if (n === 'quantidade') config.quantidade = Math.min(15, Math.max(1, config.quantidade + d));
    if (n === 'cores') config.cores = !config.cores;
    if (n === 'placas') config.placas = !config.placas;
    if (n === 'esticar') config.esticar = Math.round(Math.min(2.2, Math.max(1, config.esticar + d * 0.1)) * 10) / 10;
  }
  function confirmarLinha(): void {
    const n = linhas[linha];
    if (n === 'vibracao') { vibrar('esq', 1, 300); vibrar('dir', 1, 300); }
    else if (n === 'recomecar') { aplicarConfigNaLuta(true); acertos = 0; fecharPausa(); }
    else if (n === 'continuar') fecharPausa();
    else mudarLinha(1);
  }
  function controlarPausa(): void {
    if (!solo) return;
    // tempo real segurando Y (não o dt do quadro, que é limitado a 0,05 s)
    const agora = performance.now() / 1000;
    if (!entrada.botoesVivos.has('Y')) seguraY = 0;
    else if (seguraY === 0) seguraY = agora;
    else if (seguraY > 0 && agora - seguraY >= 1) { seguraY = -1; if (pausado) fecharPausa(); else abrirPausa(); }
    if (!pausado) return;
    const a = entrada.maos.dir.analogico;
    if (Math.abs(a.x) < 0.3 && Math.abs(a.y) < 0.3) eixoArmado = true;
    if (eixoArmado && Math.abs(a.y) > 0.7) { eixoArmado = false; linha = (linha + (a.y > 0 ? 1 : -1) + linhas.length) % linhas.length; }
    if (eixoArmado && Math.abs(a.x) > 0.7) { eixoArmado = false; mudarLinha(a.x > 0 ? 1 : -1); }
    if (entrada.apertou.has('A')) confirmarLinha();
    if (entrada.apertou.has('B')) fecharPausa();
    if (pausado) desenharPausa();
  }

  // ---------- vibração prevista no Quest (online) ----------
  const recarga = new Map<string, number>();
  const anterior: Record<Lado, THREE.Vector3 | null> = { esq: null, dir: null };
  const v3 = new THREE.Vector3();
  function preverContatos(dt: number, agora: number): void {
    const raioMao = URSO.raioMao * (estadoPata.tamanho / 1.3), cab = camera.getWorldPosition(new THREE.Vector3());
    for (const l of ['esq', 'dir'] as const) {
      const p = posPata(l);
      const a = anterior[l]; anterior[l] = p.clone();
      if (!a) continue;
      const vel = { x: (p.x - a.x) / dt, y: (p.y - a.y) / dt, z: (p.z - a.z) / dt }, rapidez = Math.hypot(vel.x, vel.y, vel.z);
      const m = entrada.maos[l], punho = m.gatilhoValor > 0.6 && m.gripValor > 0.6;
      const area = rapidez < 1.6 ? 0 : GOLPES[classificarGolpe(vel, { x: p.x - cab.x, y: 0, z: p.z - cab.z }, punho)].area;
      for (const b of pbs.posicoes()) {
        const yEixo = Math.max(b.pos.y - PIRANBENJA.altura / 2 + PIRANBENJA.raio, Math.min(b.pos.y + PIRANBENJA.altura / 2 - PIRANBENJA.raio, p.y));
        v3.set(p.x - b.pos.x, p.y - yEixo, p.z - b.pos.z);
        if (v3.length() > raioMao + area + PIRANBENJA.raio + 0.03) continue;
        const chave = l + b.numero;
        if ((recarga.get(chave) ?? 0) > agora) continue;
        if (rapidez < 1.6) { recarga.set(chave, agora + 0.5); vibrar(l, ...VIBRACAO.encostar); continue; }
        recarga.set(chave, agora + 0.35);
        const q = qualidadeDoGolpe(vel, { x: b.pos.x - p.x, y: 0, z: b.pos.z - p.z });
        const [forca, ms] = VIBRACAO[q]; vibrar(l, forca, ms);
      }
    }
  }

  // ---------- eventos da luta ----------
  const empurrao = new THREE.Vector3();
  const FORCA_QUAL = { cheio: 1, normal: 0.7, raspao: 0.35 } as const;
  let vibrouNoQuadro: Record<Lado, number> = { esq: 0, dir: 0 };
  let nomeNoQuadro: Record<Lado, boolean> = { esq: false, dir: false };
  function reagir(ev: Evento): void {
    if ((ev as unknown as { tipo: string }).tipo === 'recusa') { estadoTxt.textContent = 'Essa sala já tem um UrsoBura.'; return; }
    if (ev.tipo === 'golpe') {
      acertos++;
      const alvo = ultimaFoto?.piranbenjas.find((p) => p.numero === ev.numero);
      if (solo) {
        // no solo a luta está aqui: vibra com o golpe de verdade (o mais forte do quadro, uma vez por pata)
        const [f, ms] = VIBRACAO[ev.vizinho ? 'raspao' : ev.qualidade];
        if (f > vibrouNoQuadro[ev.mao]) { vibrouNoQuadro[ev.mao] = f; vibrar(ev.mao, f, ms); }
      }
      if (config.cores) pbs.piscar(ev.numero, ev.zona, ev.golpe === 'dano' ? '#ff8a1f' : '#2fe0ff', FORCA_QUAL[ev.qualidade] * (ev.vizinho ? 0.6 : 1));
      if (alvo) {
        const p = alvo.pos;
        // o nome do golpe aparece uma vez por pata no quadro (vários acertos juntos não empilham palavras)
        if (!ev.vizinho && !nomeNoQuadro[ev.mao]) { nomeNoQuadro[ev.mao] = true; onos.mostrar(T.golpe[ev.nome], { x: p.x, y: p.y + 0.95, z: p.z }, ev.qualidade === 'cheio' ? '#ffe066' : ev.qualidade === 'raspao' ? '#9fb3bd' : '#e8f3f2', 0.32); }
        if (config.cores) onos.mostrar(ev.vizinho ? T.vizinho : T.zona[ev.zona], { x: p.x, y: p.y + 0.62, z: p.z }, ev.golpe === 'dano' ? '#ff8a1f' : '#2fe0ff', 0.13, 0.7);
      }
    }
    if (ev.tipo === 'ursoGolpeado') {
      // mordida ou tapa no braço vibra mais forte naquela mão; no corpo, nas duas
      const lado: Lado | null = ev.parte && /E$/.test(ev.parte) && ev.parte !== 'cabeca' ? 'esq' : ev.parte && /D$/.test(ev.parte) && !ev.parte.startsWith('perna') ? 'dir' : null;
      if (lado) vibrar(lado, 1, 160); else { vibrar('esq', ...VIBRACAO.levarGolpe); vibrar('dir', ...VIBRACAO.levarGolpe); }
      empurrao.x += ev.empurrao.x; empurrao.z += ev.empurrao.z;
      const c = camera.getWorldPosition(new THREE.Vector3());
      if (ev.combo > 1) onos.mostrar('KA-POW!', { x: c.x, y: c.y - 0.4, z: c.z - 1.2 }, '#4fd6d0', 0.4);
    }
    if (ev.tipo === 'agarrou') vibrar(ev.mao, ...VIBRACAO.agarrar);
    if (ev.tipo === 'arremessou') vibrar(ev.mao, ...VIBRACAO.arremessar);
    if (ev.tipo === 'strike') { const c = camera.getWorldPosition(new THREE.Vector3()); onos.mostrar(T.strike, { x: c.x, y: c.y + 0.2, z: c.z - 3 }, '#ff7a6b', 0.9, 1.4); }
    if (ev.tipo === 'fimRodada') avisar(ev.vencedor === 'urso' ? T.fimUrso : T.fimPiranbenja);
    if (ev.tipo === 'novaRodada') { rig.position.set(0, 0, 3); rig.rotation.set(0, 0, 0); empurrao.set(0, 0, 0); }
  }

  // ---------- quadro a quadro ----------
  const relogio = new THREE.Clock();
  let ateEnvio = 0, atePulso = 0, giroArmado = true;
  let ultimaFoto: Foto | null = null;
  function entradaDoUrso(): EntradaUrso {
    const c = camera.getWorldPosition(new THREE.Vector3());
    const mao = (l: Lado) => { const p = posPata(l); return { pos: { x: p.x, y: p.y, z: p.z }, gatilho: entrada.maos[l].gatilhoValor, grip: entrada.maos[l].gripValor }; };
    // giro: para onde a cabeça olha (no chão), para a luta saber onde ficam os ombros e o corpo
    const fr = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()));
    const giro = Math.atan2(-fr.x, -fr.z);
    return { cabeca: { x: c.x, y: c.y, z: c.z }, giro, maos: { esq: mao('esq'), dir: mao('dir') }, tamanhoPata: estadoPata.tamanho };
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
    vibrouNoQuadro = { esq: 0, dir: 0 }; nomeNoQuadro = { esq: false, dir: false };
    if (entrada.modo === 'vr') {
      lerVR();
      if (medirEm > 0 && --medirEm === 0 && camera.position.y > 0.5) alturaReal = camera.position.y;
      controlarPausa();
      if (!pausado) {
        // analógico esquerdo anda (o gigante anda mais por passo); direito gira 30°
        const a = entrada.maos.esq.analogico;
        if (a.lengthSq() > 0.01) {
          const fr = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion())); fr.y = 0; fr.normalize();
          const la = new THREE.Vector3(-fr.z, 0, fr.x);
          const lento = 1 - Math.min(0.6, (ultimaFoto?.urso.grudados ?? 0) * 0.05); // cada clone grudado: 5% mais lento (D-083)
          rig.position.addScaledVector(fr.multiplyScalar(-a.y).add(la.multiplyScalar(a.x)), 1.4 * rig.scale.x * dt * lento);
        }
        const d = entrada.maos.dir.analogico;
        if (Math.abs(d.x) < 0.3) giroArmado = true;
        if (giroArmado && Math.abs(d.x) > 0.7) {
          giroArmado = false; const c = camera.getWorldPosition(new THREE.Vector3()), ang = -Math.sign(d.x) * Math.PI / 6;
          const r = rig.position.clone().sub(c); r.applyAxisAngle(new THREE.Vector3(0, 1, 0), ang); rig.position.copy(c).add(r); rig.position.y = 0; rig.rotation.y += ang;
        }
      }
    }
    rig.scale.setScalar(escala());
    posicionarPatas();
    // empurrão recebido: desliza e perde força
    if (!pausado) { rig.position.addScaledVector(empurrao, dt); empurrao.multiplyScalar(Math.exp(-2.5 * dt)); }
    const e = entradaDoUrso();
    let foto: Foto | null;
    if (luta) {
      if (!pausado) { luta.definirUrso(e); luta.avancar(dt); }
      for (const ev of luta.tirarEventos()) reagir(ev);
      foto = luta.foto();
    } else {
      ateEnvio -= dt;
      if (ateEnvio <= 0 && canal?.conectado()) { ateEnvio = 1 / 36; canal.enviarRapido(codificarEntrada(e)); }
      while (eventosRecebidos.length) reagir(eventosRecebidos.shift()!);
      foto = fotoInterpolada(agora);
    }
    if (foto) { pbs.desenhar(foto.piranbenjas, { olharPara: e.cabeca, ajudas: config.placas, tempo: agora }); ultimaFoto = foto; }
    if (!luta) preverContatos(dt, agora);
    for (const l of ['esq', 'dir'] as const) patas[l].atualizar(entrada.maos[l].gatilhoValor, entrada.maos[l].gripValor, estadoPata, rig.scale.x, agora, dt);
    painelPulso.visible = olhandoOPulso();
    atePulso -= dt; if (atePulso <= 0) { atePulso = 0.25; if (painelPulso.visible) desenharPulso(ultimaFoto); }
    if (aviso.visible && agora > avisoAte) aviso.visible = false;
    onos.atualizar(dt);
    render.render(cena, camera);
  }
  function tamanho(): void { const r = tela.getBoundingClientRect(); render.setSize(r.width, r.height, false); camera.aspect = r.width / Math.max(1, r.height); camera.updateProjectionMatrix(); }
  new ResizeObserver(tamanho).observe(tela); tamanho();
  desenharPulso(null);
  render.setAnimationLoop(quadro);
  (window as unknown as { __teste: unknown }).__teste = { THREE, entrada, rig, camera, patas, alvoPata, config, pbs, get luta() { return luta; }, get canal() { return canal; }, fotos,
    get pausado() { return pausado; }, get acertos() { return acertos; }, get pulsoVisivel() { return painelPulso.visible; },
    abrirPausa, fecharPausa,
    // só para os testes: o Chromium sem tela desenha poucos quadros; isto manda a entrada na hora
    enviarAgora: () => { posicionarPatas(); if (canal?.conectado()) canal.enviarRapido(codificarEntrada(entradaDoUrso())); } };
}
