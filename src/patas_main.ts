// Teste das patas no Quest (primeira página do repositório do LUTCHA).
// Entra no VR, prende as patas do UrsoBura (ou as mãos do Gabura) nos controles e deixa trocar tudo pelos botões,
// para o autor aprovar as mãos na visão do Meta Quest. No computador, mostra as patas para girar com o mouse.
// Analogia Godot: é uma cena de teste com o XROrigin3D, as mãos e um painel de ajuda.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { entrada, ligarControlesVR, lerVR, vibrar, type Lado } from './xr/entrada';
import { criarMaoHumana, criarPata, type CorPelo, type EstadoMao, type Mao, type Personagem } from './xr/patas';

// ---------- mundo ----------
const tela = document.getElementById('tela3d') as HTMLDivElement;
const render = new THREE.WebGLRenderer({ antialias: true });
render.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
render.xr.enabled = true;
render.xr.setReferenceSpaceType('local-floor');
tela.appendChild(render.domElement);

const cena = new THREE.Scene();
cena.background = new THREE.Color('#0c1a24');
cena.add(new THREE.HemisphereLight('#dfefff', '#2a2320', 0.9));
const sol = new THREE.DirectionalLight('#ffffff', 1.0); sol.position.set(2, 4, 1.5); cena.add(sol);

const camera = new THREE.PerspectiveCamera(70, 1, 0.01, 100);
const rig = new THREE.Group(); rig.name = 'jogador'; cena.add(rig);
rig.add(camera); camera.position.set(0, 1.6, 0);

// Ringue de teste: 12 m de diâmetro, 12 lados (as cores do ringue ainda não foram desenhadas).
const ringue = new THREE.Mesh(new THREE.CylinderGeometry(6, 6.1, 0.3, 12), new THREE.MeshStandardMaterial({ color: '#2c4b5c', flatShading: true }));
ringue.position.y = -0.15; cena.add(ringue);
const grade = new THREE.PolarGridHelper(5.9, 12, 6, 48, '#4fd6d0', '#1d3b52'); grade.position.y = 0.004; cena.add(grade);

/** Bonecos de escala (cilindros simples, só para comparar tamanhos): Piranbenja 0,9 m e Gabura 1,30 m. */
function boneco(altura: number, corpo: string, roupa: string, x: number, z: number): void {
  const g = new THREE.Group(); g.position.set(x, 0, z);
  const m = (c: string) => new THREE.MeshStandardMaterial({ color: c, flatShading: true });
  const r = altura * 0.2;
  const pernas = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.8, r * 0.8, altura * 0.3, 8), m('#4a4a4a')); pernas.position.y = altura * 0.15; g.add(pernas);
  const tronco = new THREE.Mesh(new THREE.CylinderGeometry(r, r, altura * 0.35, 8), m(roupa)); tronco.position.y = altura * 0.475; g.add(tronco);
  const cabeca = new THREE.Mesh(new THREE.IcosahedronGeometry(r * 1.05, 0), m(corpo)); cabeca.position.y = altura * 0.83; g.add(cabeca);
  cena.add(g);
}
boneco(0.9, '#2ca58d', '#e0103f', 0.4, -2.0);   // Piranbenja
boneco(1.3, '#d4afaf', '#348a2f', -1.0, -2.6);  // Gabura

// ---------- estado do teste ----------
const OLHOS: Record<Personagem, number> = { urso: 2.45, humano: 1.2 }; // altura dos olhos do personagem (m)
type MaoDoSabre = 'nenhuma' | Lado;
const estado: EstadoMao & { personagem: Personagem; alturaReal: number; sabreMao: MaoDoSabre } = {
  personagem: 'urso', cor: 'normal', agulhas: 0, furadeira: false, carga: 0, sabre: false, sabreMao: 'nenhuma', tamanho: 1.3, alturaReal: 1.6,
};
const CICLO_COR: CorPelo[] = ['normal', 'berserker', 'dourado'];
const CICLO_SABRE: MaoDoSabre[] = ['nenhuma', 'dir', 'esq'];

// cada controle carrega uma pata e uma mão humana; só uma aparece
const maos: Record<Lado, { pata: Mao; humana: Mao }> = {
  esq: { pata: criarPata(-1), humana: criarMaoHumana(-1) },
  dir: { pata: criarPata(1), humana: criarMaoHumana(1) },
};
for (const lado of ['esq', 'dir'] as const) {
  const m = entrada.maos[lado];
  rig.add(m.pose);
  m.pose.add(maos[lado].pata.suporte, maos[lado].humana.suporte);
}
ligarControlesVR(render, rig);

/** Escala do jogador: no VR, o jogador vira o personagem (olhos na altura dele). No PC, 1. */
function escalaMundo(): number {
  return entrada.modo === 'vr' ? OLHOS[estado.personagem] / Math.max(0.9, estado.alturaReal) : 1;
}

// ---------- painel de ajuda (dentro do VR) ----------
const painelCanvas = document.createElement('canvas'); painelCanvas.width = 1024; painelCanvas.height = 560;
const painelTex = new THREE.CanvasTexture(painelCanvas); painelTex.colorSpace = THREE.SRGBColorSpace;
const painel = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.49), new THREE.MeshBasicMaterial({ map: painelTex, transparent: true }));
painel.position.set(0, 1.25, -1.3); painel.rotation.x = -0.12; rig.add(painel);
const NOMES_SABRE: Record<MaoDoSabre, string> = { nenhuma: 'desligado', dir: 'mão direita', esq: 'mão esquerda' };
function desenharPainel(): void {
  const c = painelCanvas.getContext('2d')!; const W = painelCanvas.width, H = painelCanvas.height;
  c.clearRect(0, 0, W, H);
  c.fillStyle = 'rgba(12, 26, 36, 0.92)'; c.beginPath(); c.roundRect(4, 4, W - 8, H - 8, 28); c.fill();
  c.strokeStyle = '#2b5264'; c.lineWidth = 4; c.stroke();
  c.fillStyle = '#4fd6d0'; c.font = '700 40px Nunito, sans-serif'; c.fillText('Teste das patas', 40, 66);
  const urso = estado.personagem === 'urso';
  const linhas: [string, string][] = [
    ['A', urso ? 'UrsoBura (trocar para o Gabura)' : 'Gabura, modo humano (trocar para o urso)'],
    ['B', urso ? 'Soco furadeira: ' + (estado.furadeira ? `engatilhado · carga ${Math.round(estado.carga * 100)}%` : 'desligado') : '—'],
    ['X', urso ? 'Sabre laser: ' + NOMES_SABRE[estado.sabreMao] : '—'],
    ['Y', urso ? 'Agulhas: ' + (estado.agulhas ? estado.agulhas + '×' : 'sem carga') : '—'],
    ['Analógico D ↑↓', urso ? `Tamanho da pata: ${estado.tamanho.toFixed(1).replace('.', ',')}×` : '—'],
    ['Clique analógico D', urso ? 'Cor do pelo (vista pelo Piranbenja): ' + estado.cor : '—'],
    ['Clique analógico E', `Medir altura de novo (agora ${estado.alturaReal.toFixed(2).replace('.', ',')} m)`],
    ['Analógicos', 'E anda · D ←→ gira 30°'],
  ];
  c.font = '600 28px Nunito, sans-serif';
  linhas.forEach(([b, t], i) => {
    const y = 128 + i * 52;
    c.fillStyle = '#8fd651'; c.fillText(b, 40, y);
    c.fillStyle = '#e8f3f2'; c.fillText(t, 330, y);
  });
  painelTex.needsUpdate = true;
}

// ---------- computador: girar as patas com o mouse ----------
const orbita = new OrbitControls(camera, render.domElement);
orbita.target.set(0, 1.3, -0.5); orbita.enableDamping = true; orbita.update();
const POSE_CABO = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(
  new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0.64, 0.77), new THREE.Vector3(0, -0.77, 0.64))); // controle seguro do jeito normal
function posesPC(): void {
  entrada.maos.esq.pose.position.set(-0.32, 1.3, -0.5); entrada.maos.dir.pose.position.set(0.32, 1.3, -0.5);
  for (const m of Object.values(entrada.maos)) m.pose.quaternion.copy(POSE_CABO);
}
posesPC();
const pc = { gatilho: 0, grip: 0 };

// ---------- botões (VR e PC) ----------
function acao(nome: string): void {
  const urso = estado.personagem === 'urso';
  if (nome === 'A') { estado.personagem = urso ? 'humano' : 'urso'; estado.furadeira = false; estado.sabreMao = 'nenhuma'; }
  else if (nome === 'B' && urso) { estado.furadeira = !estado.furadeira; estado.carga = 0; if (estado.furadeira) estado.sabreMao = 'nenhuma'; }
  else if (nome === 'X' && urso) { estado.sabreMao = CICLO_SABRE[(CICLO_SABRE.indexOf(estado.sabreMao) + 1) % 3]; if (estado.sabreMao !== 'nenhuma') estado.furadeira = false; }
  else if (nome === 'Y' && urso) estado.agulhas = estado.agulhas === 0 ? 3 : estado.agulhas === 3 ? 6 : 0;
  else if (nome === 'analogicoD' && urso) estado.cor = CICLO_COR[(CICLO_COR.indexOf(estado.cor) + 1) % 3];
  else if (nome === 'analogicoE') medirAltura();
  else if (nome === 'maior') estado.tamanho = Math.min(2.0, +(estado.tamanho + 0.1).toFixed(1));
  else if (nome === 'menor') estado.tamanho = Math.max(0.8, +(estado.tamanho - 0.1).toFixed(1));
  desenharPainel(); atualizarTelaPC();
}
function medirAltura(): void { if (entrada.modo === 'vr' && camera.position.y > 0.5) estado.alturaReal = camera.position.y; }

// ---------- tela do navegador ----------
const botaoVR = document.getElementById('entrarVR') as HTMLButtonElement;
const avisoVR = document.getElementById('avisoVR') as HTMLParagraphElement;
const estadoPC = document.getElementById('estadoPC') as HTMLParagraphElement;
function atualizarTelaPC(): void {
  const urso = estado.personagem === 'urso';
  estadoPC.textContent = urso
    ? `UrsoBura · pata ${estado.tamanho.toFixed(1).replace('.', ',')}× · furadeira ${estado.furadeira ? 'engatilhada' : 'desligada'} · sabre ${NOMES_SABRE[estado.sabreMao]} · agulhas ${estado.agulhas || 'sem carga'} · pelo ${estado.cor}`
    : 'Gabura (modo humano): sem especiais, só soca e agarra';
  for (const b of document.querySelectorAll<HTMLButtonElement>('.so-urso')) b.disabled = !urso;
}
for (const b of document.querySelectorAll<HTMLButtonElement>('[data-acao]')) b.addEventListener('click', () => acao(b.dataset.acao!));
for (const id of ['gatilho', 'grip'] as const) {
  const r = document.getElementById(id) as HTMLInputElement;
  r.addEventListener('input', () => { pc[id] = Number(r.value); });
}

async function prepararVR(): Promise<void> {
  if (!navigator.xr || !(await navigator.xr.isSessionSupported('immersive-vr').catch(() => false))) {
    botaoVR.disabled = true; avisoVR.textContent = 'Este navegador não abre o VR. No Quest, abra este link no navegador do óculos. Aqui no computador, gire as patas com o mouse.';
    return;
  }
  botaoVR.addEventListener('click', async () => {
    try {
      const sessao = await navigator.xr!.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor'] });
      await render.xr.setSession(sessao);
    } catch (e) { avisoVR.textContent = 'Não foi possível entrar no VR: ' + (e as Error).message; }
  });
}
render.xr.addEventListener('sessionstart', () => {
  entrada.modo = 'vr'; orbita.enabled = false;
  camera.position.set(0, 0, 0); rig.position.set(0, 0, 0.6); rig.rotation.set(0, 0, 0);
  for (const m of Object.values(entrada.maos)) { m.pose.position.set(0, 0, 0); m.pose.quaternion.identity(); }
  medidaPendente = 30; // mede a altura dos olhos depois de alguns quadros (o óculos ainda está se ajeitando)
  desenharPainel();
});
render.xr.addEventListener('sessionend', () => {
  entrada.modo = 'pc'; orbita.enabled = true; rig.scale.setScalar(1); rig.position.set(0, 0, 0);
  camera.position.set(0, 1.6, 0.6); for (const m of Object.values(entrada.maos)) rig.add(m.pose); posesPC(); orbita.update();
});
let medidaPendente = 0;

// ---------- quadro a quadro ----------
const relogioQuadro = new THREE.Clock();
let vibracaoEspera = 0, giroArmado = true, tamanhoArmado = true;
function quadro(): void {
  const dt = Math.min(0.05, relogioQuadro.getDelta()), t = relogioQuadro.elapsedTime;
  if (entrada.modo === 'vr') {
    lerVR();
    for (const n of entrada.apertou) acao(n);
    if (medidaPendente > 0 && --medidaPendente === 0) { medirAltura(); desenharPainel(); }
    // analógico direito: ↑↓ tamanho (um passo por empurrão), ←→ giro de 30° em volta da cabeça
    const d = entrada.maos.dir.analogico;
    if (Math.abs(d.y) < 0.3) tamanhoArmado = true;
    if (tamanhoArmado && Math.abs(d.y) > 0.7) { acao(d.y < 0 ? 'maior' : 'menor'); tamanhoArmado = false; }
    if (Math.abs(d.x) < 0.3) giroArmado = true;
    if (giroArmado && Math.abs(d.x) > 0.7) { girar(-Math.sign(d.x) * Math.PI / 6); giroArmado = false; }
    andar(dt);
  }
  rig.scale.setScalar(escalaMundo());
  // carga da furadeira: sobe com o punho fechado, cai ao abrir
  const punho = (['esq', 'dir'] as const).some((l) => valores(l)[0] > 0.7 && valores(l)[1] > 0.7);
  if (estado.furadeira) estado.carga = THREE.MathUtils.clamp(estado.carga + (punho || entrada.modo === 'pc' ? 0.5 : -1) * dt, 0, 1);
  vibracaoEspera -= dt;
  if (vibracaoEspera <= 0 && estado.personagem === 'urso') {
    if (estado.furadeira) { for (const l of ['esq', 'dir'] as const) vibrar(l, 0.1 + 0.5 * estado.carga, 60); vibracaoEspera = 0.1; }
    else if (estado.sabreMao !== 'nenhuma') { vibrar(estado.sabreMao, 0.06, 40); vibracaoEspera = 0.2; }
  }
  if (estado.furadeira && Math.round(t * 4) !== Math.round((t - dt) * 4)) desenharPainel();
  for (const lado of ['esq', 'dir'] as const) {
    const urso = estado.personagem === 'urso', par = maos[lado];
    par.pata.suporte.visible = urso; par.humana.suporte.visible = !urso;
    const [g, gr] = valores(lado);
    const mao = urso ? par.pata : par.humana;
    mao.atualizar(g, gr, { ...estado, sabre: estado.sabreMao === lado }, rig.scale.x, t, dt);
    mao.apontarAntebraco(entrada.modo === 'vr' ? cotovelo(lado) : null);
  }
  if (entrada.modo === 'pc') orbita.update();
  render.render(cena, camera);
}
/** Cotovelo estimado (IK simples): ombro a partir da cabeça; o cotovelo fica no caminho do pulso até o ombro,
 *  a ~27 cm do pulso (antebraço de um adulto) e um pouco abaixo. Contas no espaço real do jogador (dentro da plataforma). */
const ombro = new THREE.Vector3(), pulso = new THREE.Vector3(), frenteC = new THREE.Vector3(), direitaC = new THREE.Vector3();
function cotovelo(lado: Lado): THREE.Vector3 | null {
  const m = entrada.maos[lado]; if (!m.conectada) return null;
  const q = camera.quaternion; // a câmera é filha direta da plataforma
  frenteC.set(0, 0, -1).applyQuaternion(q); frenteC.y = 0; frenteC.normalize();
  direitaC.set(-frenteC.z, 0, frenteC.x);
  ombro.copy(camera.position).addScaledVector(direitaC, lado === 'dir' ? 0.17 : -0.17).addScaledVector(frenteC, -0.05); ombro.y -= 0.22;
  m.pose.getWorldPosition(pulso); rig.worldToLocal(pulso);
  const ate = ombro.sub(pulso); const d = ate.length(); if (d < 0.05) return null;
  const c = pulso.clone().addScaledVector(ate.normalize(), Math.min(0.27, d * 0.6)); c.y -= 0.06;
  return rig.localToWorld(c);
}
function valores(lado: Lado): [number, number] {
  return entrada.modo === 'vr' ? [entrada.maos[lado].gatilhoValor, entrada.maos[lado].gripValor] : [pc.gatilho, pc.grip];
}
const cabeca = new THREE.Vector3();
function girar(angulo: number): void {
  camera.getWorldPosition(cabeca);
  const d = rig.position.clone().sub(cabeca); d.applyAxisAngle(new THREE.Vector3(0, 1, 0), angulo);
  rig.position.copy(cabeca).add(d); rig.position.y = 0; rig.rotation.y += angulo;
}
function andar(dt: number): void {
  const a = entrada.maos.esq.analogico; if (a.lengthSq() < 0.01) return;
  const frente = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion())); frente.y = 0; frente.normalize();
  const lado = new THREE.Vector3(-frente.z, 0, frente.x);
  const v = frente.multiplyScalar(-a.y).add(lado.multiplyScalar(a.x)); if (v.lengthSq() > 1) v.normalize();
  rig.position.addScaledVector(v, 1.4 * rig.scale.x * dt); // o gigante anda mais por passo
}

function tamanhoTela(): void {
  const r = tela.getBoundingClientRect();
  render.setSize(r.width, r.height, false); camera.aspect = r.width / Math.max(1, r.height); camera.updateProjectionMatrix();
}
new ResizeObserver(tamanhoTela).observe(tela); tamanhoTela();
camera.position.set(0, 1.6, 0.6);
desenharPainel(); atualizarTelaPC(); void prepararVR();
render.setAnimationLoop(quadro);

// Para os testes automáticos (Playwright): acesso ao estado e aos controles simulados.
declare global { interface Window { __teste?: unknown } }
window.__teste = { THREE, entrada, estado, maos, rig, camera, acao, pc, orbita, triangulos: () => ({ pata: maos.dir.pata.triangulos, humana: maos.dir.humana.triangulos }) };
