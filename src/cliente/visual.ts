// Visual do protótipo cinza: formas simples, sem arte final (fase 2).
// Ringue em blocos (uma malha instanciada: uma chamada de desenho para todos), Piranbenjas iguais entre si,
// urso em blocos e as onomatopeias ("POW!", "STRIKE!") que flutuam e somem.

import * as THREE from 'three';
import type { V3 } from '../simulacao/regras';
import { PIRANBENJA, RINGUE, URSO } from '../simulacao/regras';
import type { FotoPiranbenja } from '../simulacao/luta';

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

/** Um Piranbenja cinza-colorido: todos iguais (original e clones). */
export function criarBonecoPiranbenja(): THREE.Group {
  const g = new THREE.Group();
  const h = PIRANBENJA.altura, r = PIRANBENJA.raio;
  const pernas = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.8, r * 0.8, h * 0.3, 8), mat('#4a4a4a')); pernas.position.y = -h * 0.35; g.add(pernas);
  const tronco = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h * 0.35, 8), mat('#e0103f')); tronco.position.y = -h * 0.025; g.add(tronco);
  const cabeca = new THREE.Mesh(new THREE.IcosahedronGeometry(r * 1.15, 0), mat('#2ca58d')); cabeca.position.y = h * 0.3; g.add(cabeca);
  const crista = new THREE.Mesh(new THREE.ConeGeometry(r * 0.5, r * 0.8, 4), mat('#2b5c8a')); crista.position.y = h * 0.3 + r * 1.1; g.add(crista);
  const bolsa = new THREE.Mesh(new THREE.BoxGeometry(r * 1.1, r * 1.2, r * 0.5), mat('#8a4a2b')); bolsa.position.set(0, -h * 0.02, r * 0.95); g.add(bolsa);
  return g;
}

/** Desenha os Piranbenjas de uma foto: reaproveita os bonecos pelo número sorteado. */
export class Piranbenjas {
  private bonecos = new Map<number, THREE.Group>();
  constructor(private cena: THREE.Scene) {}
  desenhar(lista: FotoPiranbenja[], destaque: number | null = null, marca?: THREE.Object3D): void {
    const vivos = new Set<number>();
    for (const p of lista) {
      vivos.add(p.numero);
      let b = this.bonecos.get(p.numero);
      if (!b) { b = criarBonecoPiranbenja(); this.cena.add(b); this.bonecos.set(p.numero, b); }
      b.position.set(p.pos.x, p.pos.y, p.pos.z);
      b.quaternion.set(p.rot[0], p.rot[1], p.rot[2], p.rot[3]);
      if (destaque === p.numero && marca) { marca.position.set(p.pos.x, 0.02, p.pos.z); marca.visible = true; }
    }
    for (const [n, b] of this.bonecos) if (!vivos.has(n)) { this.cena.remove(b); this.bonecos.delete(n); }
    if (marca && (destaque === null || !vivos.has(destaque))) marca.visible = false;
  }
  posicoes(): { numero: number; pos: THREE.Vector3 }[] {
    return [...this.bonecos].map(([numero, b]) => ({ numero, pos: b.position }));
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
