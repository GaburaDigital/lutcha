// Patas do UrsoBura e mãos do Gabura (modo humano), vistas pelo próprio jogador no VR.
// Vêm da luva da Nave (src/xr/luvas.ts do jogo-xp-vr-gaburaverso): mesmos blocos chanfrados, mesma ideia de
// "posar(gatilho, grip)" e mesma posição no controle. Só a forma muda (página "Patas do UrsoBura", rodada 3).
//
// Espaço da mão: pulso na origem, dedos para -Z, costas da mão para +Y (palma para -Y).
// lado = 1 (direita: polegar em -X) ou -1 (esquerda: polegar em +X).
// Medidas em metros, na escala do jogo (urso de 2,7 m; Gabura de 1,30 m).

import * as THREE from 'three';

export type Personagem = 'urso' | 'humano';
export type CorPelo = 'normal' | 'berserker' | 'dourado';

export const CORES = {
  normal: '#733634', berserker: '#b22626', dourado: '#f9f76b',
  almofada: '#7b5c5c', garra: '#4d4d4d', pele: '#d4afaf',
  pulseira: '#1d3b52', caixaRelogio: '#d9d4c4', telaRelogio: '#4fd6d0',
  vento: '#eefcff', ventoAqua: '#4fd6d0', laminaFora: '#ff7a1a', laminaMiolo: '#ffe066',
} as const;

/** Pata do urso (escala 1,0×). */
export const PATA = {
  palmaL: 0.20, palmaC: 0.19, esp: 0.08, ch: 0.012,
  dedoL: 0.056, dedoEsp: 0.066, vao: 0.006, seg1: 0.055, seg2: 0.045, xDedos: 0.062,
  polL: 0.05, polEsp: 0.058, polSeg1: 0.05, polSeg2: 0.042, polZ: -0.11,
  garraR: 0.016, garraC: 0.075, garraInclina: 0.4,   // 23° para baixo
  almL: 0.13, almC: 0.085, almZ: -0.105, almEsp: 0.012,
  almDedoR: 0.022, almDedoEsp: 0.01,
  punhoL: 0.06, punhoC: 0.035, punhoZ: -0.03,
  // punho e antebraço: [largura, altura, comprimento, z do centro]
  braco: [[0.17, 0.085, 0.07, 0.03], [0.18, 0.10, 0.18, 0.155], [0.20, 0.115, 0.18, 0.338]] as [number, number, number, number][],
  relogioZ: 0.19,          // um pouco acima do meio do antebraço (rodada 2)
  laminaComprimento: 1.2,  // sabre laser: ~120 cm no mundo, qualquer que seja o tamanho da pata (rodada 3)
};

/** Mão do Gabura: mão de verdade (4 dedos separados, 3 segmentos), sem unhas e sem almofadas. */
export const MAO = {
  palmaL: 0.088, palmaC: 0.095, esp: 0.03, ch: 0.004, vao: 0.002,
  // do lado do polegar para fora: indicador, médio, anelar, mínimo
  dedos: [
    { largura: 0.020, segs: [0.042, 0.026, 0.020], recuo: 0 },
    { largura: 0.021, segs: [0.046, 0.029, 0.021], recuo: -0.004 },
    { largura: 0.020, segs: [0.043, 0.027, 0.020], recuo: 0 },
    { largura: 0.017, segs: [0.034, 0.021, 0.017], recuo: 0.008 },
  ],
  polegar: { largura: 0.024, segs: [0.040, 0.030], z: -0.03 },
  braco: [[0.07, 0.04, 0.03, 0.013], [0.09, 0.066, 0.12, 0.09], [0.10, 0.075, 0.12, 0.212]] as [number, number, number, number][],
  relogioZ: 0.11,
};

export interface EstadoMao {
  cor: CorPelo;
  agulhas: 0 | 3 | 6;
  furadeira: boolean;     // engatilhada: punho fechado e tornado no pulso
  carga: number;          // 0 a 1
  sabre: boolean;         // sabre laser nesta mão (geralmente só em uma): lâminas nas pontas dos dedos
  tamanho: number;        // tamanho da pata no mundo (1,0× = medidas acima)
}

export interface Mao {
  personagem: Personagem;
  lado: 1 | -1;
  /** Vai dentro do "grip" do controle. */
  suporte: THREE.Group;
  raiz: THREE.Group;
  triangulos: number;
  /** escalaMundo = escala da plataforma do jogador (o pai do grip); a mão compensa para ficar no tamanho certo. */
  atualizar(gatilho: number, grip: number, estado: EstadoMao, escalaMundo: number, tempo: number, dt: number): void;
  /** IK simples: o antebraço aponta para o cotovelo estimado (posição no mundo) e encolhe até ele; null = reto. */
  apontarAntebraco(cotovelo: THREE.Vector3 | null): void;
}

/** Antebraço que gira em volta do pulso: blocos (esticam até o cotovelo) + relógio (não estica, só acompanha). */
function criarAntebraco(raiz: THREE.Group, comprimento: number, relogioZ: number): { grupo: THREE.Group; blocos: THREE.Group; apontar: (c: THREE.Vector3 | null) => void; relogioPai: THREE.Group } {
  const grupo = new THREE.Group(); grupo.name = 'antebraco'; raiz.add(grupo);
  const blocos = new THREE.Group(); grupo.add(blocos);
  const relogioPai = new THREE.Group(); grupo.add(relogioPai);
  const eixo = new THREE.Vector3(0, 0, 1), alvo = new THREE.Vector3();
  function apontar(cotovelo: THREE.Vector3 | null): void {
    let s = 1;
    if (!cotovelo) grupo.quaternion.identity();
    else {
      raiz.updateWorldMatrix(true, false);
      alvo.copy(cotovelo); raiz.worldToLocal(alvo);
      const d = alvo.length();
      if (d > 1e-4) { grupo.quaternion.setFromUnitVectors(eixo, alvo.multiplyScalar(1 / d)); s = THREE.MathUtils.clamp(d / comprimento, 0.35, 1.2); }
    }
    blocos.scale.set(1, 1, s);
    relogioPai.position.z = (s - 1) * relogioZ; // o relógio desliza junto, sem amassar
  }
  return { grupo, blocos, apontar, relogioPai };
}

/** Bloco reto ou com cantos chanfrados (extrusão com bisel de 1 segmento: continua low-poly). Igual ao da luva. */
function geometria(l: number, a: number, c: number, ch: number): THREE.BufferGeometry {
  if (!ch || Math.min(l, a, c) < ch * 3) return new THREE.BoxGeometry(l, a, c);
  const f = new THREE.Shape(); const x = l / 2 - ch, y = a / 2 - ch;
  f.moveTo(-x, -y); f.lineTo(x, -y); f.lineTo(x, y); f.lineTo(-x, y); f.lineTo(-x, -y);
  const g = new THREE.ExtrudeGeometry(f, { depth: c - 2 * ch, bevelEnabled: true, bevelThickness: ch, bevelSize: ch, bevelSegments: 1 });
  g.translate(0, 0, -(c - 2 * ch) / 2);
  return g;
}

const plano = (cor: string) => new THREE.MeshStandardMaterial({ color: cor, roughness: 0.8, metalness: 0.02, flatShading: true });
const brilho = (cor: string) => new THREE.MeshBasicMaterial({ color: cor });

/** Almofada grande da palma: feijão facetado (reentrância do lado do punho). */
function formaFeijao(l: number, c: number, lados = 16): THREE.Shape {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i < lados; i++) {
    const a = (i / lados) * Math.PI * 2;
    const x = (l / 2) * Math.cos(a);
    let y = (c / 2) * Math.sin(a);
    if (y > 0) y -= c * 0.32 * Math.exp(-Math.pow(x / (l * 0.22), 2));
    pts.push(new THREE.Vector2(x, y));
  }
  return new THREE.Shape(pts);
}

/** Relógio provisório (o do LUTCHA será desenhado na etapa de interface): pulseira em volta do antebraço e caixa por cima. */
function relogio(pai: THREE.Object3D, larg: number, alt: number, z: number, r: number): void {
  const g = new THREE.Group(); g.name = 'relogio'; g.position.set(0, 0, z); pai.add(g);
  g.add(new THREE.Mesh(new THREE.BoxGeometry(larg + 0.01, alt + 0.012, r * 0.85), plano(CORES.pulseira)));
  const caixa = new THREE.Mesh(new THREE.CylinderGeometry(r, r, r * 0.4, 8), plano(CORES.caixaRelogio));
  caixa.position.y = alt / 2 + 0.006 + r * 0.2; caixa.rotation.y = Math.PI / 8; g.add(caixa);
  const tela = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.8, r * 0.8, r * 0.1, 8), brilho(CORES.telaRelogio));
  tela.position.y = caixa.position.y + r * 0.25; tela.rotation.y = Math.PI / 8; g.add(tela);
}

/** Tornado do soco furadeira: anéis facetados e lascas girando em volta do pulso (efeito do jogo, não do modelo). */
function criarTornado(): { grupo: THREE.Group; atualizar: (carga: number, tempo: number, dt: number) => void } {
  const grupo = new THREE.Group(); grupo.name = 'tornado';
  const mBranco = new THREE.MeshBasicMaterial({ color: CORES.vento, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide });
  const mAqua = new THREE.MeshBasicMaterial({ color: CORES.ventoAqua, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide });
  const aneis: { malha: THREE.Mesh; vel: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const t = i / 5; // 0 = antebraço, 1 = frente do punho (mais largo, como uma broca)
    const anel = new THREE.Mesh(new THREE.TorusGeometry(0.13 + 0.06 * t, 0.008 + 0.004 * t, 3, 9), i % 2 ? mAqua : mBranco);
    anel.position.z = 0.16 - 0.32 * t; anel.scale.set(1, 0.82, 1); anel.rotation.x = 0.12 * (i % 2 ? 1 : -1);
    grupo.add(anel); aneis.push({ malha: anel, vel: (i % 2 ? -1 : 1) * (1 + 0.25 * i) });
  }
  const lascas: { malha: THREE.Mesh; fase: number; z: number }[] = [];
  for (let i = 0; i < 12; i++) {
    const l = new THREE.Mesh(new THREE.TetrahedronGeometry(0.014), i % 3 ? mBranco : mAqua);
    grupo.add(l); lascas.push({ malha: l, fase: (i / 12) * Math.PI * 2, z: (i % 6) / 5 });
  }
  function atualizar(carga: number, tempo: number, dt: number): void {
    grupo.scale.setScalar(0.75 + 0.5 * carga);
    mBranco.opacity = 0.3 + 0.4 * carga; mAqua.opacity = 0.25 + 0.4 * carga;
    const vel = 3 + 6 * carga; // rodada 2: na carga cheia estava rápido demais (era 3 + 9)
    for (const a of aneis) a.malha.rotation.z += a.vel * vel * dt;
    const t = tempo * vel * 0.6;
    for (const l of lascas) {
      const ang = l.fase + t + l.z * 2.5, r = 0.15 + 0.05 * l.z;
      l.malha.position.set(Math.cos(ang) * r, Math.sin(ang) * r * 0.82, 0.16 - 0.32 * l.z);
      l.malha.rotation.set(ang, ang * 0.7, 0);
    }
  }
  return { grupo, atualizar };
}

/** Lâmina do sabre laser (~120 cm): prisma de 4 lados afinando na ponta; miolo amarelo dentro da capa laranja translúcida. */
function criarLamina(mFora: THREE.Material, mMiolo: THREE.Material): THREE.Group {
  const g = new THREE.Group(); g.name = 'lamina';
  const fora = new THREE.CylinderGeometry(0.002, 0.014, 1, 4); fora.rotateX(-Math.PI / 2); fora.translate(0, 0, -0.5);
  const miolo = new THREE.CylinderGeometry(0.001, 0.007, 0.96, 4); miolo.rotateX(-Math.PI / 2); miolo.translate(0, 0, -0.48);
  const mf = new THREE.Mesh(fora, mFora); mf.rotation.z = Math.PI / 4; g.add(mf);
  const mm = new THREE.Mesh(miolo, mMiolo); mm.rotation.z = Math.PI / 4; g.add(mm);
  return g;
}

/** Posição no "grip" do controle (WebXR), igual à luva da Nave: -Z para o lado do polegar, ao longo do cabo;
 *  +X para fora das costas da mão direita (na esquerda, -X); a mão sobe 30° em relação ao cabo. */
export const AJUSTE_GRAUS = 30;
function orientarNoGrip(suporte: THREE.Group, lado: 1 | -1): void {
  const B = lado > 0
    ? new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0))
    : new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, -1), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0));
  const ajuste = new THREE.Matrix4().makeRotationX(THREE.MathUtils.degToRad(AJUSTE_GRAUS));
  suporte.quaternion.setFromRotationMatrix(ajuste.multiply(B));
}

/** Triângulos do modelo (os efeitos do jogo, como tornado e lâminas, ficam de fora). */
function contarTriangulos(o: THREE.Object3D, efeitos: THREE.Object3D[]): number {
  const fora = new Set<THREE.Object3D>();
  for (const e of efeitos) e.traverse((x) => fora.add(x));
  let n = 0;
  o.traverse((x) => {
    if (!(x instanceof THREE.Mesh) || fora.has(x)) return;
    const g = x.geometry as THREE.BufferGeometry; n += (g.index ? g.index.count : g.attributes.position.count) / 3;
  });
  return Math.round(n);
}

// ---------------------------------------------------------------------------------------------
export function criarPata(lado: 1 | -1): Mao {
  const P = PATA;
  const suporte = new THREE.Group(); suporte.name = 'pata_' + (lado > 0 ? 'direita' : 'esquerda');
  orientarNoGrip(suporte, lado);
  const raiz = new THREE.Group(); suporte.add(raiz);
  const mPelo = plano(CORES.normal), mAlm = plano(CORES.almofada), mGarra = plano(CORES.garra), mBrilho = brilho('#ffffff');
  const bloco = (l: number, a: number, c: number, m: THREE.Material, ch: number) => new THREE.Mesh(geometria(l, a, c, ch), m);

  const palma = bloco(P.palmaL, P.esp, P.palmaC, mPelo, P.ch); palma.position.set(0, 0, -P.palmaC / 2); raiz.add(palma);
  const fim = P.braco[P.braco.length - 1];
  const ab = criarAntebraco(raiz, fim[3] + fim[2] / 2, P.relogioZ);
  for (const [l, a, c, z] of P.braco) { const b = bloco(l, a, c, mPelo, 0.009); b.position.set(0, 0, z); ab.blocos.add(b); }
  // almofadas um pouco embutidas na palma: a face que aparece nunca fica no mesmo plano da palma
  const gAlm = new THREE.ExtrudeGeometry(formaFeijao(P.almL, P.almC), { depth: P.almEsp - 0.006, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 1 });
  gAlm.rotateX(Math.PI / 2);
  const alm = new THREE.Mesh(gAlm, mAlm); alm.position.set(0, -P.esp / 2 + 0.003, P.almZ); raiz.add(alm);
  const almP = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.01, 8), mAlm); almP.scale.set(P.punhoL / 2, 1, P.punhoC / 2);
  almP.position.set(0, -P.esp / 2 - 0.002, P.punhoZ); raiz.add(almP);

  const mFora = new THREE.MeshBasicMaterial({ color: CORES.laminaFora, transparent: true, opacity: 0.8, depthWrite: false });
  const mMiolo = brilho(CORES.laminaMiolo);
  const juntas: Record<string, [THREE.Group, THREE.Group]> = {};
  const garras: { malha: THREE.Mesh; frente: boolean; ponta: THREE.Group }[] = [];
  const laminasPonta: THREE.Group[] = [];
  function dedo(nome: string, x: number): void {
    const base = new THREE.Group(); base.position.set(x, 0, -P.palmaC - P.vao + 0.008); raiz.add(base);
    const s1 = bloco(P.dedoL, P.dedoEsp, P.seg1, mPelo, 0.007); s1.position.z = -P.seg1 / 2; base.add(s1);
    const j = new THREE.Group(); j.position.z = -P.seg1; base.add(j);
    const s2 = bloco(P.dedoL * 0.94, P.dedoEsp * 0.9, P.seg2, mPelo, 0.007); s2.position.z = -P.seg2 / 2 + 0.006; j.add(s2);
    const a = new THREE.Mesh(new THREE.CylinderGeometry(P.almDedoR, P.almDedoR * 0.92, P.almDedoEsp, 6), mAlm);
    a.rotation.y = Math.PI / 6; a.position.set(0, -(P.dedoEsp * 0.9) / 2 - 0.003, -P.seg2 / 2 + 0.006); j.add(a);
    const ponta = new THREE.Group(); ponta.position.set(0, -P.dedoEsp * 0.18, -P.seg2 + 0.012); j.add(ponta);
    const gg = new THREE.ConeGeometry(P.garraR, P.garraC, 4); gg.rotateX(-Math.PI / 2); gg.translate(0, 0, -P.garraC / 2);
    const g = new THREE.Mesh(gg, mGarra); g.rotation.x = -P.garraInclina; ponta.add(g);
    const lam = criarLamina(mFora, mMiolo); lam.visible = false; ponta.add(lam); laminasPonta.push(lam);
    garras.push({ malha: g, frente: nome === 'frente', ponta });
    juntas[nome] = [base, j];
  }
  dedo('frente', -lado * P.xDedos); dedo('meio', 0); dedo('fora', lado * P.xDedos);

  const pol = new THREE.Group(); pol.position.set(-lado * (P.palmaL / 2 - 0.004), -0.008, P.polZ); raiz.add(pol);
  const p1 = bloco(P.polSeg1, P.polEsp, P.polL, mPelo, 0.007); p1.position.x = -lado * P.polSeg1 / 2; pol.add(p1);
  const pj = new THREE.Group(); pj.position.x = -lado * P.polSeg1; pol.add(pj);
  const p2 = bloco(P.polSeg2, P.polEsp * 0.9, P.polL * 0.94, mPelo, 0.007); p2.position.x = -lado * (P.polSeg2 / 2 - 0.006); pj.add(p2);
  const ap = new THREE.Mesh(new THREE.CylinderGeometry(P.almDedoR, P.almDedoR * 0.92, P.almDedoEsp, 6), mAlm);
  ap.rotation.y = Math.PI / 6; ap.position.set(-lado * (P.polSeg2 / 2 - 0.006), -(P.polEsp * 0.9) / 2 - 0.003, 0); pj.add(ap);
  const gp = new THREE.ConeGeometry(P.garraR, P.garraC, 4); gp.rotateZ(lado * Math.PI / 2); gp.translate(-lado * P.garraC / 2, 0, 0);
  const gPol = new THREE.Mesh(gp, mGarra); gPol.position.set(-lado * (P.polSeg2 - 0.006), -P.polEsp * 0.15, 0); gPol.rotation.z = lado * P.garraInclina; pj.add(gPol);

  if (lado < 0) relogio(ab.relogioPai, P.braco[1][0], P.braco[1][1], P.relogioZ, 0.04);
  const tornado = criarTornado(); tornado.grupo.visible = false; raiz.add(tornado.grupo);
  const triangulos = contarTriangulos(raiz, [tornado.grupo, ...laminasPonta]);

  function posar(gat: number, grp: number): void { // mesmas curvas da luva da Nave
    const [fb, fj] = juntas.frente;
    fb.rotation.x = -(0.12 + 1.05 * gat); fj.rotation.x = -(0.15 + 1.25 * gat);
    for (const n of ['meio', 'fora']) { const [b, j] = juntas[n]; b.rotation.x = -(0.2 + 1.2 * grp); j.rotation.x = -(0.2 + 1.35 * grp); }
    pol.rotation.z = lado * (0.15 + 0.55 * grp); pol.rotation.y = -lado * (0.9 * grp); pj.rotation.z = lado * (0.2 + 0.9 * grp);
  }

  function atualizar(gatilho: number, grip: number, e: EstadoMao, escalaMundo: number, tempo: number, dt: number): void {
    const local = e.tamanho / escalaMundo;
    raiz.scale.setScalar(local);
    raiz.position.set(0, 0, (P.palmaC / 2) * local); // o meio da palma fica no centro do grip, como na luva
    mPelo.color.set(CORES[e.cor]);
    // poses travadas: sabre e furadeira mandam nos dedos; gatilho e grip param de mexer
    // sabre: dedos esticados e travados, lâminas saindo das pontas (rodada 3: opção A)
    if (e.sabre) {
      posar(0, 0); for (const [b, j] of Object.values(juntas)) { b.rotation.x = 0; j.rotation.x = 0; }
    } else if (e.furadeira) posar(1, 1);
    else posar(gatilho, grip);
    for (const g of garras) {
      g.malha.visible = !e.sabre;
      g.malha.material = e.agulhas === 6 || (e.agulhas === 3 && g.frente) ? mBrilho : mGarra;
    }
    const compr = P.laminaComprimento / e.tamanho; // ~120 cm no mundo
    for (const l of laminasPonta) { l.visible = e.sabre; l.scale.set(1, 1, compr); }
    mFora.opacity = 0.7 + 0.12 * Math.sin(tempo * 23) * Math.sin(tempo * 7); // brasa tremendo
    tornado.grupo.visible = e.furadeira && !e.sabre;
    if (tornado.grupo.visible) tornado.atualizar(e.carga, tempo, dt);
  }
  return { personagem: 'urso', lado, suporte, raiz, triangulos, atualizar, apontarAntebraco: ab.apontar };
}

// ---------------------------------------------------------------------------------------------
export function criarMaoHumana(lado: 1 | -1): Mao {
  const M = MAO;
  const suporte = new THREE.Group(); suporte.name = 'mao_' + (lado > 0 ? 'direita' : 'esquerda');
  orientarNoGrip(suporte, lado);
  const raiz = new THREE.Group(); suporte.add(raiz);
  const mPele = plano(CORES.pele);
  const bloco = (l: number, a: number, c: number, ch = M.ch) => new THREE.Mesh(geometria(l, a, c, ch), mPele);

  const palma = bloco(M.palmaL, M.esp, M.palmaC); palma.position.set(0, 0, -M.palmaC / 2); raiz.add(palma);
  const fim = M.braco[M.braco.length - 1];
  const ab = criarAntebraco(raiz, fim[3] + fim[2] / 2, M.relogioZ);
  for (const [l, a, c, z] of M.braco) { const b = bloco(l, a, c, 0.005); b.position.set(0, 0, z); ab.blocos.add(b); }

  // 4 dedos separados, 3 segmentos cada, um pouco mais finos na ponta (sem unhas)
  const dedos: { juntas: THREE.Group[]; gatilho: boolean }[] = [];
  const total = M.dedos.reduce((s, d) => s + d.largura, 0) + M.vao * (M.dedos.length - 1);
  let x = -total / 2;
  M.dedos.forEach((d, i) => {
    const cx = x + d.largura / 2; x += d.largura + M.vao;
    // i = 0 (indicador) fica do lado do polegar: -X na mão direita, +X na esquerda
    const base = new THREE.Group(); base.position.set(lado * cx, 0, -M.palmaC + 0.003 + d.recuo); raiz.add(base);
    const juntas: THREE.Group[] = [base];
    let pai: THREE.Group = base;
    d.segs.forEach((comp, k) => {
      const esp = M.esp * (0.78 - 0.08 * k), larg = d.largura * (1 - 0.05 * k);
      const s = bloco(larg, esp, comp, 0.003); s.position.z = -comp / 2 + (k ? 0.002 : 0); pai.add(s);
      if (k < d.segs.length - 1) { const j = new THREE.Group(); j.position.z = -comp; pai.add(j); juntas.push(j); pai = j; }
    });
    dedos.push({ juntas, gatilho: i === 0 });
  });

  // polegar na lateral, perto do punho, apontando para frente e para fora
  const pg = M.polegar;
  const pol = new THREE.Group(); pol.position.set(-lado * (M.palmaL / 2 - 0.008), -0.006, pg.z); raiz.add(pol);
  const p1 = bloco(pg.largura, M.esp * 0.75, pg.segs[0], 0.003); p1.position.z = -pg.segs[0] / 2; pol.add(p1);
  const pj = new THREE.Group(); pj.position.z = -pg.segs[0]; pol.add(pj);
  const p2 = bloco(pg.largura * 0.92, M.esp * 0.68, pg.segs[1], 0.003); p2.position.z = -pg.segs[1] / 2 + 0.002; pj.add(p2);

  if (lado < 0) relogio(ab.relogioPai, M.braco[1][0], M.braco[1][1], M.relogioZ, 0.02);
  const triangulos = contarTriangulos(raiz, []);

  function posar(gat: number, grp: number): void {
    for (const d of dedos) {
      const v = d.gatilho ? gat : grp;
      d.juntas[0].rotation.x = -(0.08 + 1.3 * v);
      if (d.juntas[1]) d.juntas[1].rotation.x = -(0.1 + 1.45 * v);
      if (d.juntas[2]) d.juntas[2].rotation.x = -(0.08 + 1.0 * v);
    }
    pol.rotation.set(-0.25 - 0.2 * grp, lado * (0.55 - 0.75 * grp), 0);
    pj.rotation.x = -(0.1 + 0.9 * grp);
  }
  function atualizar(gatilho: number, grip: number, _e: EstadoMao, escalaMundo: number): void {
    const local = 1 / escalaMundo;
    raiz.scale.setScalar(local);
    raiz.position.set(0, 0, (M.palmaC / 2) * local);
    posar(gatilho, grip); // sem especiais: só soca e agarra
  }
  return { personagem: 'humano', lado, suporte, raiz, triangulos, atualizar, apontarAntebraco: ab.apontar };
}
