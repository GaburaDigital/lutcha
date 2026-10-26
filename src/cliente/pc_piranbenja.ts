// Tela do PC: o jogador do Piranbenja, em terceira pessoa. É o anfitrião: roda a luta e manda as fotos ao Quest.
// Controles do protótipo: W A S D anda, mouse gira a câmera (clique para prender), J ataque de dano,
// K ataque de impacto, C cria 2 clones (custa água), R começa de novo.

import * as THREE from 'three';
import { Luta, prepararFisica, type Evento } from '../simulacao/luta';
import { codificarFoto, decodificarEntrada } from '../rede/protocolo';
import { abrirCanal, type Canal } from '../rede/canal';
import { codigoDeSala } from '../simulacao/regras';
import { Onomatopeias, Piranbenjas, UrsoDeFora, criarCena, criarRingue } from './visual';

export async function iniciarPC(raiz: HTMLElement, tipoCanal: 'trystero' | 'local', codigoFixo?: string): Promise<void> {
  await prepararFisica();
  const luta = new Luta({ ursoDeTreino: true, clonesIniciais: 4 });
  const codigo = codigoFixo ?? codigoDeSala();
  raiz.innerHTML = `
    <div class="jogo"><div class="tela" id="tela"></div>
      <div class="placa topo"><span class="rotulo">Sala</span><strong class="codigo" id="codigo">${codigo}</strong>
        <span id="conexao">Esperando o UrsoBura… (por enquanto, um urso de treino)</span></div>
      <div class="placa base">
        <span>Água <b id="agua">100</b></span><span>Urso: resistência <b id="ursoRes">100</b></span>
        <span>Placar <b id="placar">0 × 0</b></span>
        <span class="dica">W A S D anda · mouse gira (clique) · J dano · K impacto · C clones · Esc solta o mouse</span>
      </div>
      <ol class="log" id="log" aria-live="polite"></ol>
    </div>`;
  const tela = raiz.querySelector('#tela') as HTMLDivElement;
  const render = new THREE.WebGLRenderer({ antialias: true });
  render.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  tela.appendChild(render.domElement);
  const { cena } = criarCena();
  criarRingue(cena, luta.blocos);
  const camera = new THREE.PerspectiveCamera(65, 1, 0.05, 200);
  const pbs = new Piranbenjas(cena), urso = new UrsoDeFora(cena), onos = new Onomatopeias(cena);
  // só nesta tela: um anel aqua no chão marca o original (o jogador sabe quem ele é; o Quest nunca sabe)
  const marca = new THREE.Mesh(new THREE.RingGeometry(0.26, 0.34, 12), new THREE.MeshBasicMaterial({ color: '#4fd6d0', side: THREE.DoubleSide }));
  marca.rotation.x = -Math.PI / 2; cena.add(marca);

  // ---------- rede ----------
  const canal: Canal = abrirCanal(tipoCanal, 'anfitriao', codigo);
  const conexao = raiz.querySelector('#conexao') as HTMLSpanElement;
  canal.aoConectar = () => {
    luta.opcoes.ursoDeTreino = false;
    conexao.textContent = 'UrsoBura conectado';
    void canal.tipoConexao().then((t) => { conexao.textContent = `UrsoBura conectado · ${t === 'local' ? 'conexão local' : t === 'internet' ? 'pela internet' : 'conexão aberta'}`; });
  };
  canal.aoSair = () => { conexao.textContent = 'O UrsoBura saiu. Esperando reconectar (até 30 s)…'; };
  canal.aoRapido = (d) => { const e = decodificarEntrada(d); if (e) luta.definirUrso(e); };

  // ---------- controles ----------
  const teclas = new Set<string>();
  let yaw = Math.PI, pitch = -0.25; // começa de frente para o urso
  addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase(); teclas.add(k);
    if (e.repeat) return;
    if (k === 'j') luta.controle.atacar = 'dano';
    if (k === 'k') luta.controle.atacar = 'impacto';
    if (k === 'c') luta.controle.criarClones = true;
  });
  addEventListener('keyup', (e) => teclas.delete(e.key.toLowerCase()));
  addEventListener('blur', () => teclas.clear());
  render.domElement.addEventListener('click', () => { try { void render.domElement.requestPointerLock(); } catch { /* sem mouse preso */ } });
  addEventListener('mousemove', (e) => {
    if (document.pointerLockElement !== render.domElement) return;
    yaw -= e.movementX * 0.0025; pitch = THREE.MathUtils.clamp(pitch - e.movementY * 0.0025, -1.1, 0.4);
  });

  // ---------- painel ----------
  const log = raiz.querySelector('#log') as HTMLOListElement;
  const escrever = (t: string) => { const li = document.createElement('li'); li.textContent = t; log.prepend(li); while (log.children.length > 6) log.lastChild?.remove(); };
  const ZONAS = { cabeca: 'na cabeça', tronco: 'no tronco', bracos: 'no braço', pernas: 'nas pernas' } as const;
  const NOMES = { soco: 'soco', socoLateral: 'soco lateral', gancho: 'gancho', martelada: 'martelada', arranhao: 'arranhão', estocada: 'estocada' } as const;
  const QUAL = { cheio: 'em cheio', normal: 'normal', raspao: 'de raspão' } as const;
  function reagir(ev: Evento): void {
    const f = luta.foto();
    const onde = (n: number) => f.piranbenjas.find((p) => p.numero === n)?.pos;
    if (ev.tipo === 'golpe') { const p = onde(ev.numero); if (p) onos.mostrar(ev.qualidade === 'cheio' ? 'POW!' : ev.qualidade === 'raspao' ? 'tsk' : 'PAF!', { ...p, y: p.y + 0.8 }, ev.qualidade === 'cheio' ? '#ffe066' : '#e8f3f2', 0.45); escrever(`Pata ${ev.mao === 'esq' ? 'esquerda' : 'direita'}: ${NOMES[ev.nome]} (${ev.golpe}) ${QUAL[ev.qualidade]} ${ZONAS[ev.zona]}${ev.vizinho ? ', de tabela' : ''} (lançamento ${ev.lancamento.toFixed(1)})`); }
    if (ev.tipo === 'strike') { escrever('STRIKE!'); onos.mostrar('STRIKE!', { x: 0, y: 2.5, z: 0 }, '#ff7a6b', 1.0, 1.4); }
    if (ev.tipo === 'derreteu') escrever('Um clone derreteu');
    if (ev.tipo === 'clones') escrever(`${ev.quantos} clones novos`);
    if (ev.tipo === 'agarrou') escrever('O urso agarrou um Piranbenja');
    if (ev.tipo === 'arremessou') escrever(`Arremesso a ${ev.velocidade.toFixed(1)} m/s`);
    if (ev.tipo === 'ursoGolpeado') { escrever(`Urso levou ${ev.golpe}${ev.combo > 1 ? ' (combinado ×' + ev.combo + ')' : ''}`); const u = luta.entradaUrso.cabeca; onos.mostrar(ev.combo > 1 ? 'KA-POW!' : 'BAM!', { ...u, y: u.y + 0.4 }, '#4fd6d0', 0.6); }
    if (ev.tipo === 'fimRodada') { escrever(ev.vencedor === 'urso' ? 'O original caiu! Ponto do UrsoBura.' : 'O urso saiu do ringue! Ponto do Piranbenja.'); onos.mostrar(ev.vencedor === 'urso' ? 'URSO VENCE!' : 'PIRANBENJA VENCE!', { x: 0, y: 3, z: 0 }, '#8fd651', 1.1, 2.5); }
  }

  // ---------- quadro a quadro ----------
  const relogio = new THREE.Clock();
  let ateFoto = 0;
  function quadro(): void {
    const dt = Math.min(0.05, relogio.getDelta());
    // WASD em relação à câmera
    const f = (teclas.has('w') ? 1 : 0) - (teclas.has('s') ? 1 : 0), l = (teclas.has('d') ? 1 : 0) - (teclas.has('a') ? 1 : 0);
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    // frente = (−sen, −cos) do giro da câmera; direita = (cos, −sen)
    luta.controle.mover = { x: fx * f + Math.cos(yaw) * l, z: fz * f - Math.sin(yaw) * l };
    luta.avancar(dt);
    for (const ev of luta.tirarEventos()) { reagir(ev); canal.enviarEvento(ev); }
    ateFoto -= dt;
    if (ateFoto <= 0 && canal.conectado()) { ateFoto = 1 / 30; canal.enviarRapido(codificarFoto(luta.foto())); }
    const foto = luta.foto(), orig = luta.numeroDoOriginal();
    pbs.desenhar(foto.piranbenjas, { destaque: orig, marca, olharPara: luta.entradaUrso.cabeca });
    urso.desenhar(luta.entradaUrso.cabeca, luta.entradaUrso.maos);
    // câmera atrás do original
    const o = foto.piranbenjas.find((p) => p.numero === orig)?.pos ?? { x: 0, y: 0.45, z: -3 };
    const dist = 3.4;
    camera.position.set(o.x - fx * dist * Math.cos(pitch), o.y + 1.2 - Math.sin(pitch) * dist, o.z - fz * dist * Math.cos(pitch));
    camera.lookAt(o.x + fx * 0.5, o.y + 0.5, o.z + fz * 0.5);
    onos.atualizar(dt);
    (raiz.querySelector('#agua') as HTMLElement).textContent = String(Math.floor(luta.aguaAtual));
    (raiz.querySelector('#ursoRes') as HTMLElement).textContent = String(foto.urso.res);
    (raiz.querySelector('#placar') as HTMLElement).textContent = `${foto.placar.urso} × ${foto.placar.piranbenja}`;
    render.render(cena, camera);
  }
  function tamanho(): void { const r = tela.getBoundingClientRect(); render.setSize(r.width, r.height, false); camera.aspect = r.width / Math.max(1, r.height); camera.updateProjectionMatrix(); }
  new ResizeObserver(tamanho).observe(tela); tamanho();
  render.setAnimationLoop(quadro);
  (window as unknown as { __teste: unknown }).__teste = { luta, canal, codigo, THREE };
}
