// Visual do protótipo cinza: formas simples, sem arte final (fase 2).
// Ringue em blocos (uma malha instanciada: uma chamada de desenho para todos), Piranbenjas iguais entre si,
// urso em blocos e as onomatopeias ("POW!", "STRIKE!") que flutuam e somem.

import * as THREE from 'three';
import type { V3, Zona } from '../simulacao/regras';
import { PIRANBENJA, RINGUE } from '../simulacao/regras';
import { CORPO_URSO, type EsqueletoUrso, type Lado, type SegUrso } from '../simulacao/corpoUrso';
import { LAYOUT_PARTES, PARTES, type EstadoIA, type FotoPiranbenja, type Parte } from '../simulacao/luta';
import { T } from '../textos';

export function criarCena(): { cena: THREE.Scene } {
  const cena = new THREE.Scene();
  cena.background = new THREE.Color('#0c1a24');
  cena.add(new THREE.HemisphereLight('#dfefff', '#2a2320', 0.9));
  const sol = new THREE.DirectionalLight('#ffffff', 1.0); sol.position.set(3, 6, 2); cena.add(sol);
  return { cena };
}

/** Ringue de blocos: cinza com a borda mais escura (as cores do ringue ainda não foram desenhadas). */
export function criarRingue(cena: THREE.Scene, blocos: V3[]): THREE.InstancedMesh {
  const g = new THREE.BoxGeometry(RINGUE.bloco * 0.96, RINGUE.alturaBloco, RINGUE.bloco * 0.96);
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', flatShading: true, roughness: 0.9 });
  const inst = new THREE.InstancedMesh(g, m, blocos.length);
  const mat = new THREE.Matrix4(), cor = new THREE.Color();
  blocos.forEach((b, i) => {
    mat.makeTranslation(b.x, b.y, b.z); inst.setMatrixAt(i, mat);
    const borda = Math.hypot(b.x, b.z) > RINGUE.raio - 0.8;
    cor.set(borda ? '#3b5566' : (Math.round(b.x / RINGUE.bloco) + Math.round(b.z / RINGUE.bloco)) % 2 ? '#5d7280' : '#667b88');
    inst.setColorAt(i, cor);
  });
  cena.add(inst);
  return inst;
}

const mat = (c: string) => new THREE.MeshStandardMaterial({ color: c, flatShading: true });

/** Um Piranbenja em 6 partes (as mesmas do boneco solto da física): todos iguais, original e clones. */
interface Boneco {
  grupo: THREE.Group;              // posição e giro do corpo
  corpo: THREE.Group;              // inclina (armar, atacar) e achata (martelada)
  partes: Record<Parte, THREE.Group>;
  mats: Record<Parte, THREE.MeshStandardMaterial[]>;
  brilho: Record<Parte, { cor: THREE.Color; ate: number; forca: number }>;
  anel: THREE.Mesh;                // ajuda do teste: cor do que está fazendo
  placa: THREE.Sprite;             // ajuda do teste: o que está tentando fazer
  placaTexto: string;
  estrelas: THREE.Group;           // atordoado (efeito de anime, fica também no jogo)
  boca: THREE.Mesh;                // aberta na mordida
  offs: Record<Parte, THREE.Vector3>; // do pivô da parte (ombro, para os braços) até o centro dela
}

function criarBoneco(): Boneco {
  const grupo = new THREE.Group(), corpo = new THREE.Group(); grupo.add(corpo);
  const partes = {} as Record<Parte, THREE.Group>, mats = {} as Record<Parte, THREE.MeshStandardMaterial[]>;
  const brilho = {} as Boneco['brilho'];
  const offs = {} as Record<Parte, THREE.Vector3>;
  // os braços giram no ombro: o grupo fica no ombro e a malha, abaixo dele
  const OMBRO: Partial<Record<Parte, THREE.Vector3>> = { bracoE: new THREE.Vector3(-0.04, -0.12, 0), bracoD: new THREE.Vector3(0.04, -0.12, 0) };
  const parte = (n: Parte, malhas: [THREE.BufferGeometry, string, V3?][]) => {
    const g = new THREE.Group(); const c = LAYOUT_PARTES[n].c; const o = OMBRO[n] ?? new THREE.Vector3();
    offs[n] = o; g.position.set(c.x - o.x, c.y - o.y, c.z - o.z);
    mats[n] = [];
    for (const [geo, cor, off] of malhas) { const m = mat(cor); mats[n].push(m); const me = new THREE.Mesh(geo, m); me.position.set(o.x + (off?.x ?? 0), o.y + (off?.y ?? 0), o.z + (off?.z ?? 0)); g.add(me); }
    corpo.add(g); partes[n] = g; brilho[n] = { cor: new THREE.Color(), ate: 0, forca: 0 };
  };
  const r = PIRANBENJA.raio;
  parte('pernaE', [[new THREE.CylinderGeometry(0.065, 0.06, 0.27, 6), '#4a4a4a']]);
  parte('pernaD', [[new THREE.CylinderGeometry(0.065, 0.06, 0.27, 6), '#4a4a4a']]);
  parte('tronco', [[new THREE.CylinderGeometry(r, r * 0.95, 0.315, 8), '#e0103f'], [new THREE.BoxGeometry(r * 1.1, r * 1.2, r * 0.5), '#8a4a2b', { x: 0, y: 0.01, z: -r * 0.95 }]]); // mochila nas costas (o boneco olha para +z)
  parte('bracoE', [[new THREE.CylinderGeometry(0.045, 0.04, 0.27, 6), '#2ca58d']]);
  parte('bracoD', [[new THREE.CylinderGeometry(0.045, 0.04, 0.27, 6), '#2ca58d']]);
  parte('cabeca', [[new THREE.IcosahedronGeometry(r * 1.15, 0), '#2ca58d'], [new THREE.ConeGeometry(r * 0.5, r * 0.8, 4), '#2b5c8a', { x: 0, y: r * 1.1, z: 0 }]]);
  const anel = new THREE.Mesh(new THREE.RingGeometry(0.27, 0.33, 14), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
  anel.rotation.x = -Math.PI / 2; anel.visible = false;
  const placa = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false })); placa.renderOrder = 9; placa.visible = false;
  const estrelas = new THREE.Group();
  const mEst = new THREE.MeshBasicMaterial({ color: '#ffe066' });
  for (let i = 0; i < 3; i++) { const e = new THREE.Mesh(new THREE.OctahedronGeometry(0.045, 0), mEst); const a = (i / 3) * Math.PI * 2; e.position.set(Math.cos(a) * 0.2, 0, Math.sin(a) * 0.2); estrelas.add(e); }
  estrelas.visible = false;
  // boca: aparece aberta na mordida (na frente da cabeça, que olha para +z)
  const boca = new THREE.Mesh(new THREE.BoxGeometry(r * 0.9, r * 0.45, r * 0.3), new THREE.MeshBasicMaterial({ color: '#3a0d14' }));
  boca.position.set(0, -r * 0.35, r * 1.0); boca.visible = false; partes.cabeca.add(boca);
  const dentes = new THREE.Mesh(new THREE.BoxGeometry(r * 0.85, r * 0.1, r * 0.32), new THREE.MeshBasicMaterial({ color: '#f4f4f4' }));
  dentes.position.set(0, r * 0.17, 0); boca.add(dentes);
  return { grupo, corpo, partes, mats, brilho, anel, placa, placaTexto: '', estrelas, boca, offs };
}

const PARTES_DA_ZONA: Record<Zona, Parte[]> = { cabeca: ['cabeca'], tronco: ['tronco'], bracos: ['bracoE', 'bracoD'], pernas: ['pernaE', 'pernaD'] };
const COR_ESTADO: Partial<Record<EstadoIA, string>> = { aproximando: '#ffe066', armando: '#ff9a3c', atacando: '#ff4a4a', atordoado: '#8fd0ff', recuando: '#8fd651' };

const texturasPlaca = new Map<string, THREE.CanvasTexture>();
function texturaPlaca(texto: string, cor: string): THREE.CanvasTexture {
  const chave = texto + cor; const t0 = texturasPlaca.get(chave); if (t0) return t0;
  const c = document.createElement('canvas'); c.width = 384; c.height = 96;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(12,26,36,0.85)'; g.beginPath(); g.roundRect(4, 4, 376, 88, 24); g.fill();
  g.strokeStyle = cor; g.lineWidth = 6; g.stroke();
  g.font = '900 54px "Baloo 2", Nunito, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = cor; g.fillText(texto, 192, 52);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; texturasPlaca.set(chave, t); return t;
}

export interface OpcoesDesenho {
  destaque?: number | null;        // só no PC: o original
  marca?: THREE.Object3D;
  olharPara?: V3 | null;           // os clones de pé olham para o urso
  giroDe?: (numero: number) => number | null; // só no PC: o original olha para onde a câmera olha
  ajudas?: boolean;                // anel colorido e placa de intenção (modo de teste)
  tempo?: number;
}

/** Desenha os Piranbenjas de uma foto: reaproveita os bonecos pelo número sorteado. */
export class Piranbenjas {
  private bonecos = new Map<number, Boneco>();
  constructor(private cena: THREE.Scene) {}
  desenhar(lista: FotoPiranbenja[], op: OpcoesDesenho = {}): void {
    const vivos = new Set<number>(), agora = op.tempo ?? performance.now() / 1000;
    for (const p of lista) {
      vivos.add(p.numero);
      let b = this.bonecos.get(p.numero);
      if (!b) { b = criarBoneco(); this.cena.add(b.grupo, b.anel, b.placa, b.estrelas); this.bonecos.set(p.numero, b); }
      if (p.partes) {
        // boneco solto: cada parte na pose da física
        b.grupo.position.set(0, 0, 0); b.grupo.quaternion.identity(); b.corpo.rotation.set(0, 0, 0); b.corpo.scale.setScalar(1); b.corpo.position.set(0, 0, 0);
        for (const n of PARTES) {
          const q = p.partes[n], g = b.partes[n];
          g.quaternion.set(q.rot[0], q.rot[1], q.rot[2], q.rot[3]);
          const o = b.offs[n].clone().applyQuaternion(g.quaternion);
          g.position.set(q.pos.x - o.x, q.pos.y - o.y, q.pos.z - o.z);
        }
        b.boca.visible = p.grudado;
      } else {
        for (const n of PARTES) { const c = LAYOUT_PARTES[n].c, o = b.offs[n]; b.partes[n].position.set(c.x - o.x, c.y - o.y, c.z - o.z); b.partes[n].quaternion.identity(); }
        b.grupo.position.set(p.pos.x, p.pos.y, p.pos.z);
        b.grupo.quaternion.set(p.rot[0], p.rot[1], p.rot[2], p.rot[3]);
        const dePe = !p.voando && !p.agarrado && Math.abs(p.rot[0]) + Math.abs(p.rot[2]) < 0.05;
        const giro = op.giroDe?.(p.numero);
        if (dePe && giro != null) b.grupo.rotation.set(0, giro + Math.PI, 0); // giro da câmera: frente = −z; o boneco olha para +z
        else if (dePe && op.olharPara) b.grupo.rotation.set(0, Math.atan2(op.olharPara.x - p.pos.x, op.olharPara.z - p.pos.z), 0);
        this.posarAtaque(b, p);
        // armar inclina para trás (o aviso do ataque); atacar joga para frente; martelada achata
        const incl = p.estado === 'armando' ? -0.38 : p.estado === 'atacando' ? 0.45 : 0;
        b.corpo.rotation.x += (incl - b.corpo.rotation.x) * 0.3;
        if (p.achatado) { b.corpo.scale.set(1.35, 0.45, 1.35); b.corpo.position.y = -PIRANBENJA.altura * 0.27; }
        else { b.corpo.scale.setScalar(1); b.corpo.position.y = 0; }
      }
      // parte atingida brilha e apaga em 0,5 s
      for (const n of PARTES) {
        const br = b.brilho[n], k = Math.max(0, (br.ate - agora) / 0.5) * br.forca;
        for (const m of b.mats[n]) { m.emissive.copy(br.cor); m.emissiveIntensity = k; }
      }
      const cabeca = p.partes ? p.partes.cabeca.pos : { x: p.pos.x, y: p.pos.y + 0.27 * (p.achatado ? 0.45 : 1), z: p.pos.z };
      b.estrelas.visible = p.estado === 'atordoado' && !p.agarrado;
      if (b.estrelas.visible) { b.estrelas.position.set(cabeca.x, cabeca.y + 0.32, cabeca.z); b.estrelas.rotation.y = agora * 5; }
      const corEstado = COR_ESTADO[p.estado];
      b.anel.visible = !!op.ajudas && !!corEstado && !p.partes;
      if (b.anel.visible) { b.anel.position.set(p.pos.x, 0.02, p.pos.z); (b.anel.material as THREE.MeshBasicMaterial).color.set(corEstado!); }
      const texto = !op.ajudas || p.grudado ? '' : p.estado === 'aproximando' ? T.intencao.aproximando
        : p.estado === 'armando' ? (p.ataque === 'morder' ? T.intencao.armando_morder : p.ataque === 'tapa' ? T.intencao.armando_tapa : T.intencao.armando_socar)
        : p.estado === 'atacando' ? (p.ataque === 'morder' ? T.intencao.atacando_morder : p.ataque === 'tapa' ? T.intencao.atacando_tapa : T.intencao.atacando_socar)
        : p.estado === 'recuando' ? T.intencao.recuando : ''; // atordoado já mostra as estrelinhas
      b.placa.visible = !!texto;
      if (texto) {
        if (b.placaTexto !== texto + corEstado) { (b.placa.material as THREE.SpriteMaterial).map = texturaPlaca(texto, corEstado ?? '#e8f3f2'); (b.placa.material as THREE.SpriteMaterial).needsUpdate = true; b.placaTexto = texto + corEstado; }
        b.placa.position.set(cabeca.x, cabeca.y + 0.5, cabeca.z); b.placa.scale.set(0.4, 0.1, 1);
      }
      if (op.destaque === p.numero && op.marca) { op.marca.position.set(p.pos.x, 0.02, p.pos.z); op.marca.visible = true; }
    }
    for (const [n, b] of this.bonecos) if (!vivos.has(n)) { this.cena.remove(b.grupo, b.anel, b.placa, b.estrelas); this.bonecos.delete(n); }
    if (op.marca && (op.destaque == null || !vivos.has(op.destaque))) op.marca.visible = false;
  }
  /** Braços e boca de cada ataque: socar puxa o braço para trás e soca para frente; tapa abre o braço para o lado
   *  e bate; mordida abre a boca e joga a cabeça para frente. */
  private posarAtaque(b: Boneco, p: FotoPiranbenja): void {
    const D = b.partes.bracoD, E = b.partes.bracoE, cab = b.partes.cabeca;
    let dx = 0, dz = 0, ex = 0, ez = 0, cabZ = 0;
    const armando = p.estado === 'armando', atacando = p.estado === 'atacando';
    if (p.ataque === 'socar') { if (armando) dx = 0.9; if (atacando) dx = -1.55; }
    if (p.ataque === 'tapa') { if (armando) { dz = 1.3; dx = -0.3; } if (atacando) { dz = -0.2; dx = -1.3; } }
    if (p.ataque === 'morder' && atacando) cabZ = 0.1;
    if (p.estado === 'atordoado') { ez = -0.5; dz = 0.5; } // braços abertos, tontinho
    D.rotation.x += (dx - D.rotation.x) * 0.45; D.rotation.z += (dz - D.rotation.z) * 0.45;
    E.rotation.x += (ex - E.rotation.x) * 0.45; E.rotation.z += (ez - E.rotation.z) * 0.45;
    cab.position.z = LAYOUT_PARTES.cabeca.c.z + cabZ;
    b.boca.visible = p.ataque === 'morder' && (armando || atacando);
  }
  /** Ajuda do teste: a parte atingida muda de cor (laranja = dano, ciano = impacto; mais forte = mais em cheio). */
  piscar(numero: number, zona: Zona, cor: string, forca: number, tempo = performance.now() / 1000): void {
    const b = this.bonecos.get(numero); if (!b) return;
    for (const n of PARTES_DA_ZONA[zona]) { b.brilho[n].cor.set(cor); b.brilho[n].ate = tempo + 0.5; b.brilho[n].forca = forca; }
  }
  posicoes(): { numero: number; pos: THREE.Vector3 }[] {
    return [...this.bonecos].map(([numero, b]) => ({ numero, pos: b.grupo.position }));
  }
}

/** UrsoBura visto de fora (no PC): corpo inteiro desenhado em cima do mesmo esqueleto que a luta usa
 *  (corpoUrso.ts), então o que se vê é exatamente onde os Piranbenjas acertam e grudam. Visual de teste, mais
 *  perto do model sheet (marrom, barriga clara, orelhas redondas, óculos ciano), sem pretender ser a arte final. */
const COR_URSO = '#7a4030', COR_BARRIGA = '#d9a066', COR_FOCINHO = '#e3b47f', COR_ESCURO = '#3b1d16';
export class UrsoDeFora {
  readonly grupo = new THREE.Group();
  private mats = new Map<SegUrso, THREE.MeshStandardMaterial>();
  private brilho = new Map<SegUrso, { cor: THREE.Color; ate: number }>();
  private membros: { seg: SegUrso; cil: THREE.Mesh; juntas: THREE.Mesh[] }[] = [];
  private cabeca = new THREE.Group();
  private barriga: THREE.Mesh;
  private patas: Record<Lado, THREE.Group>;
  private barra: THREE.Sprite; private barraCanvas: HTMLCanvasElement; private barraTex: THREE.CanvasTexture; private barraTxt = '';
  constructor(cena: THREE.Scene) {
    const m = (seg: SegUrso, cor = COR_URSO) => { const x = mat(cor); this.mats.set(seg, x); this.brilho.set(seg, { cor: new THREE.Color(), ate: 0 }); return x; };
    const cil = new THREE.CylinderGeometry(1, 1, 1, 8), bola = new THREE.IcosahedronGeometry(1, 1);
    for (const seg of ['tronco', 'pernaE', 'pernaD', 'bracoE', 'bracoD', 'antebracoE', 'antebracoD'] as SegUrso[]) {
      const material = m(seg);
      const c = new THREE.Mesh(cil, material), j1 = new THREE.Mesh(bola, material), j2 = new THREE.Mesh(bola, material);
      this.grupo.add(c, j1, j2); this.membros.push({ seg, cil: c, juntas: [j1, j2] });
    }
    this.barriga = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), mat(COR_BARRIGA)); this.grupo.add(this.barriga);
    // cabeça: bola, orelhas, focinho, nariz e óculos ciano (olha para −z quando o giro é 0)
    const mc = m('cabeca');
    const cab = new THREE.Mesh(new THREE.IcosahedronGeometry(CORPO_URSO.raioCabeca, 1), mc); this.cabeca.add(cab);
    for (const lado of [-1, 1]) { const o = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11, 0), mc); o.position.set(lado * 0.22, 0.26, 0); this.cabeca.add(o); }
    const foc = new THREE.Mesh(new THREE.IcosahedronGeometry(0.15, 0), mat(COR_FOCINHO)); foc.scale.set(1.1, 0.8, 0.9); foc.position.set(0, -0.1, -0.26); this.cabeca.add(foc);
    const nariz = new THREE.Mesh(new THREE.IcosahedronGeometry(0.05, 0), mat(COR_ESCURO)); nariz.position.set(0, -0.06, -0.39); this.cabeca.add(nariz);
    const oculos = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.11, 0.06), mat('#00e5ff')); oculos.position.set(0, 0.07, -0.28); this.cabeca.add(oculos);
    this.grupo.add(this.cabeca);
    // patas: bloco com três garras, viradas para a direção do antebraço
    const pata = (l: Lado) => {
      const g = new THREE.Group(), mp = m(l === 'esq' ? 'pataE' : 'pataD', '#6a3428');
      const palma = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.14, 0.28), mp); g.add(palma);
      for (const x of [-0.08, 0, 0.08]) { const garra = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.09, 4), mat('#f2eadf')); garra.rotation.x = Math.PI / 2; garra.position.set(x, -0.02, 0.18); g.add(garra); }
      this.grupo.add(g); return g;
    };
    this.patas = { esq: pata('esq'), dir: pata('dir') };
    // barra de resistência flutuando acima da cabeça (só no teste)
    this.barraCanvas = document.createElement('canvas'); this.barraCanvas.width = 256; this.barraCanvas.height = 64;
    this.barraTex = new THREE.CanvasTexture(this.barraCanvas); this.barraTex.colorSpace = THREE.SRGBColorSpace;
    this.barra = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.barraTex, transparent: true, depthTest: false })); this.barra.renderOrder = 8;
    this.barra.scale.set(0.8, 0.2, 1); this.barra.visible = false; cena.add(this.barra);
    cena.add(this.grupo);
  }

  private membro(c: THREE.Mesh, juntas: THREE.Mesh[], a: V3, b: V3, r: number): void {
    const A = new THREE.Vector3(a.x, a.y, a.z), B = new THREE.Vector3(b.x, b.y, b.z), d = B.clone().sub(A), l = d.length();
    c.position.copy(A).add(B).multiplyScalar(0.5);
    c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), l > 1e-4 ? d.normalize() : new THREE.Vector3(0, 1, 0));
    c.scale.set(r, Math.max(1e-3, l), r);
    juntas[0].position.copy(A); juntas[1].position.copy(B); juntas[0].scale.setScalar(r); juntas[1].scale.setScalar(r);
  }

  desenhar(esq: EsqueletoUrso, giro: number, tempo = performance.now() / 1000): void {
    for (const mb of this.membros) { const s = esq.segs.find((x) => x.nome === mb.seg)!; this.membro(mb.cil, mb.juntas, s.a, s.b, s.r); }
    const cab = esq.segs.find((x) => x.nome === 'cabeca')!;
    this.cabeca.position.set(cab.a.x, cab.a.y, cab.a.z); this.cabeca.rotation.set(0, giro, 0);
    // barriga clara na frente do tronco
    const tr = esq.segs.find((x) => x.nome === 'tronco')!, f = esq.frente;
    this.barriga.position.set((tr.a.x + tr.b.x) / 2 + f.x * 0.3, (tr.a.y + tr.b.y) / 2 + 0.05, (tr.a.z + tr.b.z) / 2 + f.z * 0.3);
    this.barriga.scale.set(0.34, 0.45, 0.22); this.barriga.rotation.set(0, giro, 0);
    for (const l of ['esq', 'dir'] as const) {
      const p = esq.pata[l], c = esq.cotovelo[l], g = this.patas[l];
      g.position.set(p.x, p.y, p.z);
      const d = new THREE.Vector3(p.x - c.x, p.y - c.y, p.z - c.z).normalize();
      g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d);
    }
    // parte atingida brilha e apaga em 0,5 s
    for (const [seg, m] of this.mats) { const b = this.brilho.get(seg)!, k = Math.max(0, (b.ate - tempo) / 0.5); m.emissive.copy(b.cor); m.emissiveIntensity = k; }
    this.barra.position.set(cab.a.x, cab.a.y + 0.55, cab.a.z);
  }

  /** Ajuda do teste: a parte do urso atingida brilha (laranja = dano, ciano = impacto). */
  piscar(seg: SegUrso, cor: string, tempo = performance.now() / 1000): void {
    const b = this.brilho.get(seg); if (!b) return;
    b.cor.set(cor); b.ate = tempo + 0.5;
  }

  /** Barra de resistência (e quantos estão grudados) acima da cabeça. */
  mostrarBarra(res: number, grudados: number, visivel = true): void {
    this.barra.visible = visivel; if (!visivel) return;
    const txt = Math.round(res) + '/' + grudados; if (txt === this.barraTxt) return; this.barraTxt = txt;
    const g = this.barraCanvas.getContext('2d')!; g.clearRect(0, 0, 256, 64);
    g.fillStyle = 'rgba(12,26,36,0.85)'; g.beginPath(); g.roundRect(2, 8, 252, 48, 14); g.fill();
    g.fillStyle = '#2a3d48'; g.fillRect(14, 20, 228, 24);
    g.fillStyle = res > 50 ? '#8fd651' : res > 25 ? '#ffe066' : '#ff6b5b'; g.fillRect(14, 20, 228 * Math.max(0, Math.min(1, res / 100)), 24);
    g.fillStyle = '#ffffff'; g.font = '800 22px Nunito, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(Math.round(res) + (grudados ? '  · ' + grudados + ' ' + T.pc.curtoGrudados : ''), 128, 33);
    this.barraTex.needsUpdate = true;
  }
}

/** Onomatopeias: texto com contorno que sobe e some (sprite sempre de frente para a câmera). */
export class Onomatopeias {
  private vivas: { s: THREE.Sprite; ate: number; vel: number }[] = [];
  constructor(private cena: THREE.Scene) {}
  mostrar(texto: string, pos: V3, cor = '#ffe066', tamanho = 0.6, segundos = 0.9): void {
    const c = document.createElement('canvas'); c.width = 512; c.height = 160;
    const g = c.getContext('2d')!;
    g.font = '900 104px "Baloo 2", "Trebuchet MS", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 16; g.strokeStyle = '#0c1a24'; g.strokeText(texto, 256, 84);
    g.fillStyle = cor; g.fillText(texto, 256, 84);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false }));
    s.scale.set(tamanho * 3.2, tamanho, 1); s.position.set(pos.x, pos.y, pos.z); s.renderOrder = 10;
    this.cena.add(s); this.vivas.push({ s, ate: performance.now() / 1000 + segundos, vel: 0.6 });
  }
  atualizar(dt: number): void {
    const agora = performance.now() / 1000;
    this.vivas = this.vivas.filter((v) => {
      if (agora > v.ate) { this.cena.remove(v.s); (v.s.material as THREE.SpriteMaterial).map?.dispose(); v.s.material.dispose(); return false; }
      v.s.position.y += v.vel * dt; (v.s.material as THREE.SpriteMaterial).opacity = Math.min(1, (v.ate - agora) * 3);
      return true;
    });
  }
}
