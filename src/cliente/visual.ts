// Visual do protótipo cinza: formas simples, sem arte final (fase 2).
// Ringue em blocos (uma malha instanciada: uma chamada de desenho para todos), Piranbenjas iguais entre si,
// urso em blocos e as onomatopeias ("POW!", "STRIKE!") que flutuam e somem.

import * as THREE from 'three';
import type { V3, Zona } from '../simulacao/regras';
import { PIRANBENJA, RINGUE, URSO } from '../simulacao/regras';
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
}

function criarBoneco(): Boneco {
  const grupo = new THREE.Group(), corpo = new THREE.Group(); grupo.add(corpo);
  const partes = {} as Record<Parte, THREE.Group>, mats = {} as Record<Parte, THREE.MeshStandardMaterial[]>;
  const brilho = {} as Boneco['brilho'];
  const parte = (n: Parte, malhas: [THREE.BufferGeometry, string, V3?][]) => {
    const g = new THREE.Group(); const c = LAYOUT_PARTES[n].c; g.position.set(c.x, c.y, c.z);
    mats[n] = [];
    for (const [geo, cor, off] of malhas) { const m = mat(cor); mats[n].push(m); const me = new THREE.Mesh(geo, m); if (off) me.position.set(off.x, off.y, off.z); g.add(me); }
    corpo.add(g); partes[n] = g; brilho[n] = { cor: new THREE.Color(), ate: 0, forca: 0 };
  };
  const r = PIRANBENJA.raio;
  parte('pernaE', [[new THREE.CylinderGeometry(0.065, 0.06, 0.27, 6), '#4a4a4a']]);
  parte('pernaD', [[new THREE.CylinderGeometry(0.065, 0.06, 0.27, 6), '#4a4a4a']]);
  parte('tronco', [[new THREE.CylinderGeometry(r, r * 0.95, 0.315, 8), '#e0103f'], [new THREE.BoxGeometry(r * 1.1, r * 1.2, r * 0.5), '#8a4a2b', { x: 0, y: 0.01, z: r * 0.95 }]]);
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
  return { grupo, corpo, partes, mats, brilho, anel, placa, placaTexto: '', estrelas };
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
        for (const n of PARTES) { const q = p.partes[n]; b.partes[n].position.set(q.pos.x, q.pos.y, q.pos.z); b.partes[n].quaternion.set(q.rot[0], q.rot[1], q.rot[2], q.rot[3]); }
      } else {
        for (const n of PARTES) { const c = LAYOUT_PARTES[n].c; b.partes[n].position.set(c.x, c.y, c.z); b.partes[n].quaternion.identity(); }
        b.grupo.position.set(p.pos.x, p.pos.y, p.pos.z);
        b.grupo.quaternion.set(p.rot[0], p.rot[1], p.rot[2], p.rot[3]);
        const dePe = !p.voando && !p.agarrado && Math.abs(p.rot[0]) + Math.abs(p.rot[2]) < 0.05;
        if (dePe && op.olharPara) b.grupo.rotation.set(0, Math.atan2(op.olharPara.x - p.pos.x, op.olharPara.z - p.pos.z), 0);
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
      const texto = !op.ajudas ? '' : p.estado === 'aproximando' ? T.intencao.aproximando
        : p.estado === 'armando' ? (p.ataque === 'socar' ? T.intencao.armando_socar : T.intencao.armando_morder)
        : p.estado === 'atacando' ? (p.ataque === 'socar' ? T.intencao.atacando_socar : T.intencao.atacando_morder)
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
  /** Ajuda do teste: a parte atingida muda de cor (laranja = dano, ciano = impacto; mais forte = mais em cheio). */
  piscar(numero: number, zona: Zona, cor: string, forca: number, tempo = performance.now() / 1000): void {
    const b = this.bonecos.get(numero); if (!b) return;
    for (const n of PARTES_DA_ZONA[zona]) { b.brilho[n].cor.set(cor); b.brilho[n].ate = tempo + 0.5; b.brilho[n].forca = forca; }
  }
  posicoes(): { numero: number; pos: THREE.Vector3 }[] {
    return [...this.bonecos].map(([numero, b]) => ({ numero, pos: b.grupo.position }));
  }
}

/** Urso cinza visto de fora (no PC): corpo, cabeça com óculos, patas em blocos. */
export class UrsoDeFora {
  readonly grupo = new THREE.Group();
  private corpo: THREE.Mesh; private cabeca: THREE.Group;
  private patas: Record<'esq' | 'dir', THREE.Mesh>;
  constructor(cena: THREE.Scene) {
    this.corpo = new THREE.Mesh(new THREE.CapsuleGeometry(URSO.raioCorpo, URSO.altura - 2 * URSO.raioCorpo - 0.5, 4, 10), mat('#733634'));
    this.grupo.add(this.corpo);
    this.cabeca = new THREE.Group();
    this.cabeca.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.33, 0), mat('#733634')));
    const oculos = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.1, 0.05), mat('#00e5ff')); oculos.position.set(0, 0.05, -0.3); this.cabeca.add(oculos);
    this.grupo.add(this.cabeca);
    const pata = () => new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.3), mat('#5a2a28'));
    this.patas = { esq: pata(), dir: pata() };
    this.grupo.add(this.patas.esq, this.patas.dir);
    cena.add(this.grupo);
  }
  desenhar(cabeca: V3, maos: Record<'esq' | 'dir', { pos: V3 }>): void {
    this.corpo.position.set(cabeca.x, URSO.altura / 2 - 0.25, cabeca.z);
    this.cabeca.position.set(cabeca.x, cabeca.y, cabeca.z);
    // a cabeça olha para o meio das patas
    const meio = new THREE.Vector3((maos.esq.pos.x + maos.dir.pos.x) / 2, cabeca.y, (maos.esq.pos.z + maos.dir.pos.z) / 2);
    if (meio.distanceTo(this.cabeca.position) > 0.05) { this.cabeca.lookAt(meio); this.cabeca.rotateY(Math.PI); }
    for (const l of ['esq', 'dir'] as const) this.patas[l].position.set(maos[l].pos.x, maos[l].pos.y, maos[l].pos.z);
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
