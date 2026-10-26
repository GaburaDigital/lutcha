// A luta, sem rede e sem desenho (protótipo cinza, fase 2).
// Roda no PC do Piranbenja (anfitrião), no Quest no modo solo contra bots e nos testes automáticos.
// Física: Rapier (corpos rígidos). Analogia Godot: é a cena da luta com os RigidBody3D, rodando no _physics_process.
//
// Sigilo do original (GDD seção 13): fora desta classe, os Piranbenjas só existem como "números sorteados";
// quem é o original fica guardado aqui dentro e nunca vai na foto que o Quest recebe.
//
// Rodada 2 do urso (C14/C15): golpes por tipo e direção (soco, soco lateral, gancho, martelada, arranhão, estocada),
// área maior, vizinhos levando 60%, clone atingido fica atordoado e larga o que fazia, ataque "armado" antes de bater,
// comportamentos dos clones para teste, formações e ragdoll (boneco de 6 partes) ao agarrar e nos golpes fortes.

import RAPIER from '@dimforge/rapier3d-compat';
import {
  AGUA, ATORDOA_RASPAO, GOLPES, JANELA_COMBO, MARTELADA_PRESO, MULT_QUALIDADE, PARTE_VIZINHOS, PESO, PIRANBENJA, RINGUE, URSO,
  classificarGolpe, fatorCombo, gerarBlocos, lancamento, modsDaZona, qualidadeDoGolpe, zonaDoContato,
  type NomeGolpe, type Qualidade, type TipoGolpe, type V3, type Zona,
} from './regras';

let pronta = false;
/** Carrega a física (WebAssembly embutido: funciona offline). Chamar uma vez antes de criar a luta. */
export async function prepararFisica(): Promise<void> { if (!pronta) { await RAPIER.init(); pronta = true; } }

export type Lado = 'esq' | 'dir';
export interface MaoUrso { pos: V3; gatilho: number; grip: number }
export interface EntradaUrso { cabeca: V3; maos: Record<Lado, MaoUrso>; tamanhoPata: number }
export interface ControleOriginal { mover: { x: number; z: number }; atacar: TipoGolpe | null; criarClones: boolean }

/** O que o clone está fazendo (aparece nas ajudas visuais do teste). */
export const ESTADOS_IA = ['andando', 'parado', 'aproximando', 'rodeando', 'armando', 'atacando', 'recuando', 'atordoado', 'formacao'] as const;
export type EstadoIA = typeof ESTADOS_IA[number];
export type Comportamento = 'parados' | 'aleatorio' | 'cautelosos' | 'ofensivos';
export type Formacao = 'solto' | 'torre' | 'piramide' | 'muralha' | 'corrente';
export const PARTES = ['cabeca', 'tronco', 'bracoE', 'bracoD', 'pernaE', 'pernaD'] as const;
export type Parte = typeof PARTES[number];
export interface PoseParte { pos: V3; rot: [number, number, number, number] }

/** O que o mundo de fora pode saber de cada Piranbenja (sem dizer quem é o original). */
export interface FotoPiranbenja {
  numero: number; pos: V3; rot: [number, number, number, number]; voando: boolean; agarrado: boolean;
  estado: EstadoIA; ataque: 'morder' | 'socar' | null; achatado: boolean;
  /** Só quando vira boneco solto (ragdoll): pose de cada parte. Ainda não vai pela rede. */
  partes: Record<Parte, PoseParte> | null;
}
export interface Foto {
  tick: number; tempo: number; escalaTempo: number;
  rodada: EstadoRodada; placar: { urso: number; piranbenja: number };
  urso: { res: number; aura: number };
  piranbenjas: FotoPiranbenja[];
}
export type EstadoRodada = 'luta' | 'fim';

export type Evento =
  | { tipo: 'golpe'; mao: Lado; numero: number; zona: Zona; qualidade: Qualidade; golpe: TipoGolpe; nome: NomeGolpe; vizinho: boolean; lancamento: number }
  | { tipo: 'agarrou'; mao: Lado; numero: number }
  | { tipo: 'arremessou'; mao: Lado; numero: number; velocidade: number }
  | { tipo: 'strike'; derrubados: number }
  | { tipo: 'derreteu'; numero: number }
  | { tipo: 'clones'; quantos: number }
  | { tipo: 'cameraLenta'; segundos: number; escala: number }
  | { tipo: 'ursoGolpeado'; golpe: TipoGolpe; combo: number; empurrao: { x: number; z: number } }
  | { tipo: 'fimRodada'; vencedor: 'urso' | 'piranbenja'; placar: { urso: number; piranbenja: number } }
  | { tipo: 'novaRodada' };

interface Ragdoll {
  partes: Record<Parte, RAPIER.RigidBody>;
  juntas: RAPIER.ImpulseJoint[];
  presa: Parte | null;       // a parte que a pata segura (fica rígida, presa na pata)
  offset: V3;                // onde a parte fica em relação à pata
  ate: number;               // fica solto pelo menos até aqui
  quietoDesde: number;
}

interface Piranbenja {
  numero: number;
  original: boolean;
  corpo: RAPIER.RigidBody;   // cápsula (desligada enquanto vira boneco solto)
  res: number;
  voandoAte: number;         // tempo até o qual está "voando" (girando, projétil)
  agarradoPor: Lado | null;
  acertosRecentes: number[]; // tempos dos impactos recebidos (combo)
  cadeia: { derrubados: number };  // boliche: todos derrubados na mesma jogada (o projétil e quem ele derrubou)
  jaBateu: Set<number>;
  // IA
  estado: EstadoIA;
  pensarEm: number; alvo: V3; ataqueEm: number;
  ataquePedido: TipoGolpe | null;
  ataqueTipo: TipoGolpe;     // o que está armando: dano = morder, impacto = socar
  armadoAte: number; atacandoAte: number; recuarAte: number;
  atordoadoAte: number; achatadoAte: number;
  naFormacao: boolean;
  ragdoll: Ragdoll | null;
}

const vec = (x: number, y: number, z: number): V3 => ({ x, y, z });
const sub = (a: V3, b: V3): V3 => vec(a.x - b.x, a.y - b.y, a.z - b.z);
const len = (a: V3) => Math.hypot(a.x, a.y, a.z);
const lenH = (a: V3) => Math.hypot(a.x, a.z);
const cruz = (a: V3, b: V3): V3 => vec(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
/** Gira o vetor v pelo quatérnio q. */
function girar(q: { x: number; y: number; z: number; w: number }, v: V3): V3 {
  const u = vec(q.x, q.y, q.z), t = cruz(u, v); t.x *= 2; t.y *= 2; t.z *= 2;
  const c = cruz(u, t);
  return vec(v.x + q.w * t.x + c.x, v.y + q.w * t.y + c.y, v.z + q.w * t.z + c.z);
}

// ---------------- boneco solto (ragdoll): 6 partes ligadas por juntas ----------------
// Medidas em relação ao centro da cápsula (0,45 m do chão). As partes do mesmo boneco não batem entre si.
export const LAYOUT_PARTES: Record<Parte, { c: V3; bola: boolean; r: number; hh: number; massa: number }> = {
  cabeca: { c: vec(0, 0.27, 0), bola: true, r: 0.19, hh: 0, massa: 0.15 },
  tronco: { c: vec(0, -0.03, 0), bola: false, r: 0.16, hh: 0.04, massa: 0.35 },
  bracoE: { c: vec(-0.25, -0.02, 0), bola: false, r: 0.045, hh: 0.09, massa: 0.05 },
  bracoD: { c: vec(0.25, -0.02, 0), bola: false, r: 0.045, hh: 0.09, massa: 0.05 },
  pernaE: { c: vec(-0.08, -0.315, 0), bola: false, r: 0.065, hh: 0.07, massa: 0.1 },
  pernaD: { c: vec(0.08, -0.315, 0), bola: false, r: 0.065, hh: 0.07, massa: 0.1 },
};
const JUNTAS: [Parte, Parte, V3][] = [
  ['tronco', 'cabeca', vec(0, 0.12, 0)],
  ['tronco', 'bracoE', vec(-0.21, 0.1, 0)], ['tronco', 'bracoD', vec(0.21, 0.1, 0)],
  ['tronco', 'pernaE', vec(-0.08, -0.17, 0)], ['tronco', 'pernaD', vec(0.08, -0.17, 0)],
];
const GRUPO_RAGDOLL = (0x0002 << 16) | 0xfffd; // é do grupo 2 e não bate no grupo 2
const MAX_RAGDOLLS = 4;

export interface OpcoesLuta {
  /** Bots: o original também é controlado pela IA (Quest solo, testes). */
  originalAutomatico?: boolean;
  clonesIniciais?: number;
  semente?: number;
  /** Urso de treino: boneco parado que abana as patas (PC sem Quest conectado). */
  ursoDeTreino?: boolean;
  /** Testes: os clones não andam nem atacam sozinhos. */
  semIA?: boolean;
  /** Como os clones agem (solo de teste). Padrão: cautelosos. */
  comportamento?: Comportamento;
  /** Começar em formação (solo de teste). */
  formacao?: Formacao;
}

export class Luta {
  readonly mundo: RAPIER.World;
  readonly blocos: V3[] = [];
  private pbs: Piranbenja[] = [];
  private tempo = 0;
  private tick = 0;
  private acumulado = 0;
  private escalaTempo = 1;
  private lentaAte = 0;          // tempo REAL (s) até o fim da câmera lenta
  private relogioReal = 0;
  private aleatorio: () => number;
  private eventos: Evento[] = [];
  private ursoCorpo: RAPIER.RigidBody;
  private patas: Record<Lado, RAPIER.RigidBody>;
  private entrada: EntradaUrso;
  private velMao: Record<Lado, V3> = { esq: vec(0, 0, 0), dir: vec(0, 0, 0) };
  // amostras das patas (chegam do Quest a ~36 por segundo; a física roda a 60): o caminho entre duas amostras
  // é conferido inteiro, para um golpe rápido não atravessar o Piranbenja sem encostar
  private ultimaAmostra: Record<Lado, { pos: V3; t: number } | null> = { esq: null, dir: null };
  private caminho: Record<Lado, { de: V3; ate: V3 } | null> = { esq: null, dir: null };
  private gripAntes: Record<Lado, boolean> = { esq: false, dir: false };
  private segurando: Record<Lado, Piranbenja | null> = { esq: null, dir: null };
  private recargaGolpe = new Map<string, number>();
  private recargaMartelada: Record<Lado, number> = { esq: 0, dir: 0 };
  private ursoAcertos: number[] = [];
  private juntasFormacao: { a: Piranbenja; b: Piranbenja; j: RAPIER.ImpulseJoint }[] = [];
  agua = AGUA.inicial;
  ursoRes = 100;
  ursoAura = 0;
  rodada: EstadoRodada = 'luta';
  placar = { urso: 0, piranbenja: 0 };
  private fimEm = 0;
  controle: ControleOriginal = { mover: { x: 0, z: 0 }, atacar: null, criarClones: false };

  constructor(public opcoes: OpcoesLuta = {}) {
    let s = opcoes.semente ?? (Date.now() & 0xffff);
    this.aleatorio = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    this.mundo = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.mundo.timestep = 1 / 60;
    // Ringue em grade de blocos (o buraco do "arrancar bloco" será a falta de blocos)
    for (const p of gerarBlocos()) {
      const b = this.mundo.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(p.x, p.y, p.z));
      this.mundo.createCollider(RAPIER.ColliderDesc.cuboid(RINGUE.bloco / 2, RINGUE.alturaBloco / 2, RINGUE.bloco / 2).setFriction(0.9), b);
      this.blocos.push(p);
    }
    // Urso: corpo e patas cinemáticos (quem manda é o jogador no Quest)
    const meia = URSO.altura / 2 - URSO.raioCorpo;
    this.ursoCorpo = this.mundo.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, URSO.altura / 2, 3));
    this.mundo.createCollider(RAPIER.ColliderDesc.capsule(meia, URSO.raioCorpo), this.ursoCorpo);
    const pata = () => {
      const c = this.mundo.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 1.5, 2.4));
      this.mundo.createCollider(RAPIER.ColliderDesc.ball(URSO.raioMao), c);
      return c;
    };
    this.patas = { esq: pata(), dir: pata() };
    this.entrada = { cabeca: vec(0, 2.45, 3), tamanhoPata: 1.3, maos: { esq: { pos: vec(-0.35, 1.5, 2.5), gatilho: 0, grip: 0 }, dir: { pos: vec(0.35, 1.5, 2.5), gatilho: 0, grip: 0 } } };
    this.comecarRodada();
  }

  // ---------------- entradas ----------------
  /** Posição da cabeça e das patas do urso no mundo (do Quest, a cada quadro ou pela rede). */
  definirUrso(e: EntradaUrso): void {
    const agora = this.relogioReal;
    for (const l of ['esq', 'dir'] as const) {
      const p = e.maos[l].pos, u = this.ultimaAmostra[l];
      if (u && Math.hypot(p.x - u.pos.x, p.y - u.pos.y, p.z - u.pos.z) < 1e-6) continue;
      if (u) {
        const dt = Math.max(1 / 90, agora - u.t);
        const v = vec((p.x - u.pos.x) / dt, (p.y - u.pos.y) / dt, (p.z - u.pos.z) / dt), n = len(v);
        // conferência: nenhuma pata real passa de ~20 m/s (mão humana ~10 m/s × escala do urso); acima disso é salto da rede
        this.velMao[l] = n > 20 ? vec((v.x / n) * 20, (v.y / n) * 20, (v.z / n) * 20) : v;
        // várias amostras antes do próximo passo: o caminho vai do começo da primeira ao fim da última
        const cam = this.caminho[l];
        this.caminho[l] = cam ? { de: cam.de, ate: { ...p } } : { de: { ...u.pos }, ate: { ...p } };
      }
      this.ultimaAmostra[l] = { pos: { ...p }, t: agora };
    }
    this.entrada = e;
  }
  tirarEventos(): Evento[] { const e = this.eventos; this.eventos = []; return e; }

  // ---------------- rodadas ----------------
  private comecarRodada(): void {
    for (const f of this.juntasFormacao) this.tirarJunta(f.j);
    this.juntasFormacao = [];
    for (const p of this.pbs) { this.apagarRagdoll(p); this.mundo.removeRigidBody(p.corpo); }
    this.pbs = [];
    for (const l of ['esq', 'dir'] as const) this.segurando[l] = null;
    this.agua = AGUA.inicial; this.ursoRes = 100; this.ursoAura = 0; this.rodada = 'luta';
    const f = this.opcoes.formacao ?? 'solto';
    if (f !== 'solto') { this.montarFormacao(f); return; }
    const original = this.novoPiranbenja(true, vec(0, PIRANBENJA.altura / 2, -3));
    this.pbs.push(original);
    this.espalharClones(this.opcoes.clonesIniciais ?? 4, true);
  }

  /** Recomeça a rodada (opções novas do painel de teste). */
  reiniciar(): void { this.comecarRodada(); this.eventos.push({ tipo: 'novaRodada' }); }

  private novoPiranbenja(original: boolean, pos: V3): Piranbenja {
    const corpo = this.mundo.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(pos.x, pos.y, pos.z)
      .setLinearDamping(0.3).setAngularDamping(1.5).lockRotations().setCcdEnabled(true));
    this.mundo.createCollider(RAPIER.ColliderDesc.capsule(PIRANBENJA.altura / 2 - PIRANBENJA.raio, PIRANBENJA.raio)
      .setMass(original ? PESO.original : PESO.clone).setFriction(0.6).setRestitution(0.15), corpo);
    return {
      numero: 0, original, corpo, res: original ? PIRANBENJA.resOriginal : PIRANBENJA.resClone,
      voandoAte: 0, agarradoPor: null, acertosRecentes: [], cadeia: { derrubados: 0 }, jaBateu: new Set(),
      estado: 'andando', pensarEm: 0, alvo: { ...pos }, ataqueEm: 0, ataquePedido: null, ataqueTipo: 'dano',
      armadoAte: 0, atacandoAte: 0, recuarAte: 0, atordoadoAte: 0, achatadoAte: 0, naFormacao: false, ragdoll: null,
    };
  }

  /** Cria clones em volta do original e muda o original de lugar entre eles (GDD 7: nunca revelar o original). */
  private espalharClones(quantos: number, gratis = false): number {
    if (!gratis) quantos = Math.min(quantos, Math.floor(this.agua / AGUA.custoClone));
    if (quantos <= 0) return 0;
    if (!gratis) this.agua -= quantos * AGUA.custoClone;
    const orig = this.pbs.find((p) => p.original)!;
    this.soltarDeTudo(orig);
    const c = orig.corpo.translation();
    const vagas: V3[] = [];
    const total = quantos + 1, giro = this.aleatorio() * Math.PI * 2;
    for (let i = 0; i < total; i++) {
      const a = giro + (i / total) * Math.PI * 2, r = 0.8 + this.aleatorio() * 0.5;
      let x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
      const d = Math.hypot(x, z); if (d > RINGUE.raio - 0.6) { x *= (RINGUE.raio - 0.6) / d; z *= (RINGUE.raio - 0.6) / d; }
      vagas.push(vec(x, PIRANBENJA.altura / 2 + 0.05, z));
    }
    const vagaOrig = Math.floor(this.aleatorio() * total);
    orig.corpo.setTranslation(vagas[vagaOrig], true); orig.corpo.setLinvel({ x: 0, y: 0, z: 0 }, true); orig.alvo = { ...vagas[vagaOrig] };
    vagas.splice(vagaOrig, 1);
    for (const v of vagas) this.pbs.push(this.novoPiranbenja(false, v));
    this.sortearNumeros();
    this.eventos.push({ tipo: 'clones', quantos });
    return quantos;
  }

  /** Formações de teste, na frente do urso (ele começa em z = 3 olhando para −z). O original fica num lugar sorteado. */
  private montarFormacao(f: Exclude<Formacao, 'solto'>): void {
    const C = vec(0, 0, 1.5), h = PIRANBENJA.altura + 0.02, y0 = PIRANBENJA.altura / 2 + 0.01;
    let vagas: V3[] = []; let ligas: [number, number, 'fixa' | 'mao'][] = [];
    if (f === 'torre') { vagas = [vec(0, y0, 0), vec(0, y0 + h, 0), vec(0, y0 + 2 * h, 0)]; ligas = [[0, 1, 'fixa'], [1, 2, 'fixa']]; }
    if (f === 'piramide') {
      vagas = [vec(-0.42, y0, 0), vec(0, y0, 0), vec(0.42, y0, 0), vec(-0.21, y0 + h, 0), vec(0.21, y0 + h, 0), vec(0, y0 + 2 * h, 0)];
      ligas = [[3, 0, 'fixa'], [3, 1, 'fixa'], [4, 1, 'fixa'], [4, 2, 'fixa'], [5, 3, 'fixa'], [5, 4, 'fixa']];
    }
    if (f === 'muralha') { for (let i = 0; i < 5; i++) vagas.push(vec(-0.9 + i * 0.45, y0, 0)); for (let i = 0; i < 4; i++) ligas.push([i, i + 1, 'mao']); }
    if (f === 'corrente') { for (let i = 0; i < 5; i++) vagas.push(vec(0, y0, -i * 0.45)); for (let i = 0; i < 4; i++) ligas.push([i, i + 1, 'mao']); }
    const vagaOrig = Math.floor(this.aleatorio() * vagas.length);
    const membros = vagas.map((v, i) => {
      const p = this.novoPiranbenja(i === vagaOrig, vec(C.x + v.x, v.y, C.z + v.z));
      p.naFormacao = true; p.estado = 'formacao'; this.pbs.push(p); return p;
    });
    for (const [i, k, tipo] of ligas) {
      const a = membros[i], b = membros[k];
      const pa = a.corpo.translation(), pb = b.corpo.translation();
      const meio = vec((pa.x + pb.x) / 2, (pa.y + pb.y) / 2 + (tipo === 'mao' ? 0.05 : 0), (pa.z + pb.z) / 2);
      const a1 = sub(meio, pa), a2 = sub(meio, pb);
      const dados = tipo === 'fixa'
        ? RAPIER.JointData.fixed(a1, { x: 0, y: 0, z: 0, w: 1 }, a2, { x: 0, y: 0, z: 0, w: 1 })
        : RAPIER.JointData.spherical(a1, a2);
      this.juntasFormacao.push({ a, b, j: this.mundo.createImpulseJoint(dados, a.corpo, b.corpo, true) });
    }
    this.sortearNumeros();
  }

  /** Solta da formação: as juntas dele somem; quem estava em cima perde o apoio e cai. */
  private liberarDaFormacao(p: Piranbenja, propagar = true): void {
    if (!p.naFormacao) return;
    p.naFormacao = false; p.estado = 'andando';
    this.juntasFormacao = this.juntasFormacao.filter((f) => {
      if (f.a !== p && f.b !== p) return true;
      this.tirarJunta(f.j); return false;
    });
    if (!propagar) return;
    const y = this.posDe(p).y;
    for (const q of this.pbs) {
      if (!q.naFormacao || this.posDe(q).y < y + 0.3) continue;
      this.liberarDaFormacao(q, false);
      const v = q.corpo.linvel();
      q.corpo.setLinvel({ x: v.x + (this.aleatorio() - 0.5) * 1.5, y: v.y, z: v.z + (this.aleatorio() - 0.5) * 1.5 }, true);
      this.voar(q, 0.8, 4);
    }
  }
  private tirarJunta(j: RAPIER.ImpulseJoint): void { try { if (j.isValid()) this.mundo.removeImpulseJoint(j, true); } catch { /* já saiu */ } }

  /** Números novos e ordem nova para todos: quem estava olhando um número não acompanha o original. */
  private sortearNumeros(): void {
    const usados = new Set<number>();
    for (const p of this.pbs) {
      let n = 0; do { n = 1 + Math.floor(this.aleatorio() * 65000); } while (usados.has(n));
      usados.add(n); p.numero = n;
    }
    for (let i = this.pbs.length - 1; i > 0; i--) { const j = Math.floor(this.aleatorio() * (i + 1)); [this.pbs[i], this.pbs[j]] = [this.pbs[j], this.pbs[i]]; }
  }

  // ---------------- onde está cada um (cápsula ou boneco solto) ----------------
  /** Ainda está na luta (não derreteu nem caiu neste passo). */
  private vivo(p: Piranbenja): boolean { return this.pbs.includes(p); }
  private corpoDe(p: Piranbenja): RAPIER.RigidBody { return p.ragdoll ? p.ragdoll.partes.tronco : p.corpo; }
  private posDe(p: Piranbenja): V3 {
    const t = this.corpoDe(p).translation();
    return p.ragdoll ? vec(t.x, t.y + 0.03, t.z) : vec(t.x, t.y, t.z); // o tronco fica 3 cm abaixo do centro da cápsula
  }
  private velDe(p: Piranbenja): V3 { const v = this.corpoDe(p).linvel(); return vec(v.x, v.y, v.z); }
  private definirVel(p: Piranbenja, v: V3): void {
    if (!p.ragdoll) { p.corpo.setLinvel(v, true); return; }
    for (const n of PARTES) { const b = p.ragdoll.partes[n]; if (b.isDynamic()) b.setLinvel(v, true); }
  }

  // ---------------- passo ----------------
  /** Avança o tempo real dt (s). A física roda em passos fixos de 1/60 s, mais devagar na câmera lenta. */
  avancar(dtReal: number): void {
    this.relogioReal += dtReal;
    this.escalaTempo = this.relogioReal < this.lentaAte ? 0.35 : 1;
    this.acumulado += Math.min(0.1, dtReal) * this.escalaTempo;
    while (this.acumulado >= 1 / 60) { this.acumulado -= 1 / 60; this.passo(1 / 60); }
  }

  private passo(dt: number): void {
    this.tempo += dt; this.tick++;
    if (this.opcoes.ursoDeTreino) this.moverUrsoDeTreino();
    this.posicionarUrso(dt);
    if (this.rodada === 'luta') {
      this.agua = Math.min(AGUA.maximo, this.agua + AGUA.recarga * dt);
      this.ursoRes = Math.min(100, this.ursoRes + 0.2 * dt);
      this.ursoAura = Math.min(100, this.ursoAura + 1 * dt);
      this.controlarOriginal(dt);
      if (!this.opcoes.semIA) for (const p of this.pbs) if (!p.original || this.opcoes.originalAutomatico) this.pensarClone(p);
      for (const p of this.pbs) if (!this.opcoes.semIA || p.original) this.andar(p);
      this.golpesDasPatas();
      this.agarrarESoltar();
      this.boliche();
      this.ataquesNoUrso();
    }
    this.prenderAchatados();
    this.mundo.step();
    this.endireitar();
    this.acalmarRagdolls();
    this.quedas();
    if (this.rodada === 'fim' && this.tempo > this.fimEm) { this.comecarRodada(); this.eventos.push({ tipo: 'novaRodada' }); }
  }

  private moverUrsoDeTreino(): void {
    const t = this.tempo, e = this.entrada;
    this.definirUrso({ tamanhoPata: e.tamanhoPata, cabeca: vec(0, 2.45, 2.2), maos: {
      esq: { pos: vec(-0.45 + Math.sin(t * 2) * 0.35, 1.3, 1.5 + Math.cos(t * 2) * 0.4), gatilho: 0, grip: 0 },
      dir: { pos: vec(0.45 + Math.sin(t * 2 + 2) * 0.35, 1.3, 1.5 + Math.cos(t * 2 + 2) * 0.4), gatilho: 0, grip: 0 } } });
  }

  private posicionarUrso(_dt: number): void {
    const c = this.entrada.cabeca;
    this.ursoCorpo.setNextKinematicTranslation({ x: c.x, y: URSO.altura / 2, z: c.z });
    for (const l of ['esq', 'dir'] as const) {
      this.patas[l].setNextKinematicTranslation(this.entrada.maos[l].pos);
      // sem amostra nova há mais de 0,1 s: a pata parou
      const u = this.ultimaAmostra[l];
      if (u && this.relogioReal - u.t > 0.1) this.velMao[l] = vec(0, 0, 0);
    }
  }

  // ---------------- Piranbenja: controle, IA e andar ----------------
  private controlarOriginal(_dt: number): void {
    const o = this.pbs.find((p) => p.original); if (!o) return;
    if (this.controle.criarClones) { this.controle.criarClones = false; this.espalharClones(2); }
    if (this.opcoes.originalAutomatico) return;
    if (this.controle.atacar) { o.ataquePedido = this.controle.atacar; this.controle.atacar = null; }
    const t = this.posDe(o);
    o.alvo = vec(t.x + this.controle.mover.x, 0, t.z + this.controle.mover.z);
  }

  private quantosAtacando(): number { return this.pbs.filter((p) => p.estado === 'aproximando' || p.estado === 'armando' || p.estado === 'atacando').length; }

  private armar(p: Piranbenja): void {
    p.estado = 'armando'; p.armadoAte = this.tempo + 0.6;
    p.ataqueTipo = this.aleatorio() < 0.5 ? 'dano' : 'impacto';
    p.alvo = this.posDe(p); // para enquanto arma
  }

  private pensarClone(p: Piranbenja): void {
    if (p.naFormacao || p.ragdoll || p.agarradoPor) return;
    if (this.tempo < p.atordoadoAte) { p.estado = 'atordoado'; return; }
    if (p.estado === 'atordoado') { p.estado = 'andando'; p.pensarEm = 0; }
    const u = this.entrada.cabeca, pos = this.posDe(p), d = lenH(sub(pos, u));
    const comp = this.opcoes.comportamento ?? 'cautelosos';
    // armar e atacar não esperam a próxima "pensada"
    if (p.estado === 'armando') {
      if (this.tempo >= p.armadoAte) { p.estado = 'atacando'; p.ataquePedido = p.ataqueTipo; p.atacandoAte = this.tempo + 0.3; p.alvo = vec(u.x, 0, u.z); }
      return;
    }
    if (p.estado === 'atacando') {
      if (this.tempo < p.atacandoAte) return;
      p.estado = comp === 'cautelosos' ? 'recuando' : 'aproximando'; p.recuarAte = this.tempo + 1.5; p.pensarEm = 0;
    }
    if (p.estado === 'aproximando' && d < 1.25 && this.tempo > p.ataqueEm) { this.armar(p); return; }
    if (this.tempo < p.pensarEm) return;
    p.pensarEm = this.tempo + 0.25 + 0.2 + this.aleatorio() * 1.0; // pensa a cada ~0,25 s + reação de 0,2 a 1,2 s
    const limitar = (a: V3) => { const r = Math.hypot(a.x, a.z), m = RINGUE.raio - 0.7; if (r > m) { a.x *= m / r; a.z *= m / r; } return a; };
    if (comp === 'parados') { p.estado = 'parado'; p.alvo = pos; return; }
    if (comp === 'aleatorio') {
      p.estado = 'andando';
      if (lenH(sub(p.alvo, pos)) < 0.3 || this.aleatorio() < 0.15) { const a = this.aleatorio() * Math.PI * 2, r = this.aleatorio() * 4.5; p.alvo = vec(Math.cos(a) * r, 0, Math.sin(a) * r); }
      return;
    }
    if (comp === 'ofensivos') {
      const a = this.aleatorio() * Math.PI * 2;
      p.alvo = limitar(vec(u.x + Math.cos(a) * 0.9, 0, u.z + Math.sin(a) * 0.9)); p.estado = 'aproximando';
      if (p.ataqueEm < this.tempo - 3) p.ataqueEm = this.tempo + 0.5 + this.aleatorio();
      return;
    }
    // cautelosos: rodeiam a ~1,9 m, um ou dois de cada vez chegam perto para atacar e depois recuam
    if (p.estado === 'recuando' && this.tempo < p.recuarAte) {
      const fora = sub(pos, u), n = lenH(fora) || 1;
      p.alvo = limitar(vec(u.x + (fora.x / n) * 2.3, 0, u.z + (fora.z / n) * 2.3)); return;
    }
    if (p.estado !== 'aproximando' && this.tempo > p.ataqueEm && this.quantosAtacando() < 2 && this.aleatorio() < 0.35) {
      p.estado = 'aproximando'; p.ataqueEm = this.tempo + 0.4;
    }
    if (p.estado === 'aproximando') {
      const para = sub(pos, u), n = lenH(para) || 1;
      p.alvo = limitar(vec(u.x + (para.x / n) * 0.95, 0, u.z + (para.z / n) * 0.95));
      if (this.tempo > p.ataqueEm + 4) { p.estado = 'rodeando'; p.ataqueEm = this.tempo + 3 + this.aleatorio() * 2; } // desistiu
      return;
    }
    p.estado = 'rodeando';
    if (p.ataqueEm < this.tempo - 6) p.ataqueEm = this.tempo + 2 + this.aleatorio() * 3;
    const ang = Math.atan2(pos.z - u.z, pos.x - u.x) + (this.aleatorio() < 0.5 ? 0.5 : -0.5);
    p.alvo = limitar(vec(u.x + Math.cos(ang) * 1.9, 0, u.z + Math.sin(ang) * 1.9));
  }

  private andar(p: Piranbenja): void {
    if (p.agarradoPor || p.ragdoll || p.naFormacao || this.tempo < p.voandoAte || this.tempo < p.atordoadoAte) return;
    const pos = p.corpo.translation();
    if (pos.y > PIRANBENJA.altura / 2 + 0.25) return; // no ar não anda
    const para = sub(p.alvo, pos); para.y = 0;
    const d = lenH(para);
    const v = p.corpo.linvel();
    const rapido = p.estado === 'atacando' ? 1.3 : p.estado === 'rodeando' || p.estado === 'andando' ? 0.6 : 1;
    const vel = d > 0.15 ? PIRANBENJA.velocidade * rapido * Math.min(1, d) : 0;
    const nx = d > 0.001 ? (para.x / d) * vel : 0, nz = d > 0.001 ? (para.z / d) * vel : 0;
    // segue a velocidade desejada aos poucos (não anula empurrões de uma vez)
    p.corpo.setLinvel({ x: v.x + (nx - v.x) * 0.25, y: v.y, z: v.z + (nz - v.z) * 0.25 }, true);
  }

  private atordoar(p: Piranbenja, segundos: number): void {
    p.atordoadoAte = Math.max(p.atordoadoAte, this.tempo + segundos);
    p.ataquePedido = null; p.estado = 'atordoado'; // larga o que estava fazendo (armar, atacar, andar)
  }

  // ---------------- golpes das patas ----------------
  private golpesDasPatas(): void {
    const raioMao = URSO.raioMao * (this.entrada.tamanhoPata / 1.3);
    for (const l of ['esq', 'dir'] as const) {
      const v = this.velMao[l], vel = len(v);
      const cam = this.caminho[l]; this.caminho[l] = null;
      if (vel < 1.6 || this.segurando[l]) continue;
      // pontos do caminho da pata desde a última amostra (ou só a posição atual)
      const pontos: V3[] = [];
      if (cam) for (let i = 1; i <= 6; i++) { const k = i / 6; pontos.push(vec(cam.de.x + (cam.ate.x - cam.de.x) * k, cam.de.y + (cam.ate.y - cam.de.y) * k, cam.de.z + (cam.ate.z - cam.de.z) * k)); }
      else pontos.push(this.entrada.maos[l].pos);
      const mao = this.entrada.maos[l], cab = this.entrada.cabeca;
      const punho = mao.gatilho > 0.6 && mao.grip > 0.6;
      const nome = classificarGolpe(v, vec(mao.pos.x - cab.x, 0, mao.pos.z - cab.z), punho);
      const G = GOLPES[nome];
      // o golpe pega uma área em volta da pata (o "sopro" do soco, o rastro do arranhão), não só a pata
      const alcance = raioMao + G.area + PIRANBENJA.raio + 0.03;
      let diretos: { p: Piranbenja; ponto: V3; d: number }[] = [];
      for (const p of this.pbs) {
        if (p.agarradoPor) continue;
        const c = this.posDe(p), baseY = c.y - PIRANBENJA.altura / 2;
        let melhor: { ponto: V3; d: number } | null = null;
        for (const q of pontos) {
          const yEixo = Math.max(baseY + PIRANBENJA.raio, Math.min(baseY + PIRANBENJA.altura - PIRANBENJA.raio, q.y));
          const d = Math.hypot(q.x - c.x, q.y - yEixo, q.z - c.z);
          if (d <= alcance && (!melhor || d < melhor.d)) melhor = { ponto: q, d };
        }
        if (melhor) diretos.push({ p, ...melhor });
      }
      diretos = diretos.filter((x) => (this.recargaGolpe.get(l + x.p.numero) ?? -1) <= this.tempo).sort((a, b) => a.d - b.d);
      if (!diretos.length) continue;
      if (nome === 'martelada') {
        // a martelada pega um só (C15), e a mesma pata só martela de novo depois de 0,6 s
        if ((this.recargaMartelada[l] ?? 0) > this.tempo) continue;
        diretos = diretos.slice(0, 1); this.recargaMartelada[l] = this.tempo + 0.6;
      }
      const atingidos = new Set(diretos.map((x) => x.p));
      for (const x of diretos) {
        if (!this.vivo(x.p)) continue;
        const c = this.posDe(x.p), baseY = c.y - PIRANBENJA.altura / 2;
        const vh = Math.hypot(v.x, v.z) || 1;
        // desvio lateral: quanto o golpe passa de lado em relação ao eixo do corpo (0 = bem no meio)
        const desvio = Math.abs((v.x / vh) * (c.z - x.ponto.z) - (v.z / vh) * (c.x - x.ponto.x));
        const zona = zonaDoContato(x.ponto.y, baseY, PIRANBENJA.altura, desvio, PIRANBENJA.raio);
        // passou longe do meio do corpo (só a beirada da área pegou): é raspão
        const longe = desvio > PIRANBENJA.raio + raioMao * 0.6 + G.area * 0.5;
        const qualidade = longe ? 'raspao' : qualidadeDoGolpe(v, vec(c.x - x.ponto.x, 0, c.z - x.ponto.z));
        this.recargaGolpe.set(l + x.p.numero, this.tempo + 0.35);
        this.aplicarGolpe(x.p, l, v, nome, zona, qualidade, 1, false);
      }
      // quem está colado em quem levou o golpe leva 60% (ficar junto é perigoso)
      if (G.vizinhos <= 0) continue;
      for (const q of [...this.pbs]) {
        if (!this.vivo(q) || atingidos.has(q) || q.agarradoPor || (this.recargaGolpe.get(l + q.numero) ?? -1) > this.tempo) continue;
        const pq = this.posDe(q);
        const perto = diretos.some((x) => { if (!this.vivo(x.p)) return false; const px = this.posDe(x.p); return lenH(sub(px, pq)) <= G.vizinhos && Math.abs(px.y - pq.y) < PIRANBENJA.altura; });
        if (!perto) continue;
        this.recargaGolpe.set(l + q.numero, this.tempo + 0.35);
        this.aplicarGolpe(q, l, v, nome, 'tronco', 'normal', PARTE_VIZINHOS, true);
      }
    }
  }

  private aplicarGolpe(p: Piranbenja, mao: Lado, v: V3, nome: NomeGolpe, zona: Zona, qualidade: Qualidade, fator: number, vizinho: boolean): void {
    const G = GOLPES[nome], tipo = G.tipo;
    this.liberarDaFormacao(p);
    if (!vizinho) p.cadeia = { derrubados: 0 }; // jogada nova de boliche
    const mz = modsDaZona(zona, tipo), mq = MULT_QUALIDADE[qualidade];
    p.acertosRecentes = p.acertosRecentes.filter((t) => this.tempo - t < JANELA_COMBO);
    if (tipo === 'impacto') p.acertosRecentes.push(this.tempo);
    const combo = tipo === 'impacto' ? fatorCombo(p.acertosRecentes.length) : 1;
    const peso = p.original ? PESO.original : PESO.clone;
    const impacto = len(v) * (tipo === 'impacto' ? 0.55 : 0.25);
    let L = lancamento(impacto, p.res / (p.original ? PIRANBENJA.resOriginal : PIRANBENJA.resClone), peso, combo, mq * mz.empurrao) * fator;
    if (qualidade === 'raspao') L = Math.min(L, 3); // raspão nunca decola
    L = Math.min(L, 18);
    p.res -= (tipo === 'dano' ? 12 : 4) * mq * mz.dano * fator;
    const atual = this.velDe(p);
    const vh = Math.hypot(v.x, v.z), hx = vh > 0.01 ? v.x / vh : 0, hz = vh > 0.01 ? v.z / vh : 0;
    const u = this.entrada.cabeca, pos = this.posDe(p);
    const fora = vec(pos.x - u.x, 0, pos.z - u.z), nf = lenH(fora) || 1; fora.x /= nf; fora.z /= nf;
    if (nome === 'martelada') {
      // achata no chão e fica preso (um só por martelada)
      this.definirVel(p, vec(0, -3, 0));
      p.achatadoAte = this.tempo + MARTELADA_PRESO;
    } else if (nome === 'gancho') {
      // sobe girando para trás: a cabeça vai para longe do urso (mortal de costas)
      this.definirVel(p, vec(atual.x + fora.x * L * G.empurrao, Math.max(atual.y, 0) + L * (G.subida * 0.55), atual.z + fora.z * L * G.empurrao));
    } else {
      this.definirVel(p, vec(atual.x + hx * L * G.empurrao, Math.max(atual.y, 0) + L * (G.subida + mz.subida * 0.6), atual.z + hz * L * G.empurrao));
    }
    if (!p.ragdoll) {
      if (G.giro === 'rolar' && L > 2) {
        // rola de lado: gira em volta do eixo "para cima × direção do golpe"
        const eixo = cruz(vec(0, 1, 0), vec(hx, 0, hz)), w = Math.min(14, L * 2.5);
        this.voar(p, 1.0, 0); p.corpo.setAngvel({ x: eixo.x * w, y: 0, z: eixo.z * w }, true);
      } else if (G.giro === 'mortal' && L > 2) {
        const eixo = cruz(vec(0, 1, 0), fora), w = Math.min(12, 4 + L);
        this.voar(p, 1.2, 0); p.corpo.setAngvel({ x: eixo.x * w, y: 0, z: eixo.z * w }, true);
      } else if (L > 5 && nome !== 'martelada') this.voar(p, 0.9, L);
    }
    // golpe muito forte: vira boneco solto por 1 a 2 s (no máximo 4 ao mesmo tempo)
    if (L > 9 && !p.ragdoll && !vizinho && this.pbs.filter((x) => x.ragdoll).length < MAX_RAGDOLLS) this.entrarRagdoll(p, 1.5);
    this.atordoar(p, qualidade === 'raspao' ? ATORDOA_RASPAO : G.atordoa * (vizinho ? 0.6 : 1));
    this.ursoAura = Math.min(100, this.ursoAura + (p.original ? 6 : 3) * fator);
    this.eventos.push({ tipo: 'golpe', mao, numero: p.numero, zona, qualidade, golpe: tipo, nome, vizinho, lancamento: +L.toFixed(2) });
    if (L > 9 || (p.original && L > 6)) this.cameraLenta(0.8);
    if (p.res <= 0 && !p.original) this.derreter(p);
  }

  private voar(p: Piranbenja, segundos: number, forca: number): void {
    p.voandoAte = this.tempo + segundos;
    p.jaBateu.clear();
    if (p.ragdoll) return;
    p.corpo.setEnabledRotations(true, true, true, true);
    const a = Math.min(12, forca);
    if (a > 0) p.corpo.setAngvel({ x: (this.aleatorio() - 0.5) * a, y: (this.aleatorio() - 0.5) * a, z: (this.aleatorio() - 0.5) * a }, true);
  }

  private prenderAchatados(): void {
    for (const p of this.pbs) {
      if (p.ragdoll || this.tempo >= p.achatadoAte) continue;
      const v = p.corpo.linvel(); p.corpo.setLinvel({ x: 0, y: Math.min(v.y, 0), z: 0 }, true);
    }
  }

  private cameraLenta(segundosReais: number): void {
    if (this.relogioReal < this.lentaAte) return;
    this.lentaAte = this.relogioReal + segundosReais;
    this.eventos.push({ tipo: 'cameraLenta', segundos: segundosReais, escala: 0.35 });
  }

  // ---------------- boneco solto (ragdoll) ----------------
  private entrarRagdoll(p: Piranbenja, segundos: number): void {
    if (p.ragdoll) return;
    const t = p.corpo.translation(), q = p.corpo.rotation(), v = p.corpo.linvel(), w = p.corpo.angvel();
    const partes = {} as Record<Parte, RAPIER.RigidBody>;
    for (const nome of PARTES) {
      const L = LAYOUT_PARTES[nome], r = girar(q, L.c), vw = cruz(vec(w.x, w.y, w.z), r);
      const b = this.mundo.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(t.x + r.x, t.y + r.y, t.z + r.z).setRotation(q)
        .setLinvel(v.x + vw.x, v.y + vw.y, v.z + vw.z).setAngvel(w).setLinearDamping(0.2).setAngularDamping(2).setCcdEnabled(nome === 'tronco'));
      const forma = L.bola ? RAPIER.ColliderDesc.ball(L.r) : RAPIER.ColliderDesc.capsule(L.hh, L.r);
      this.mundo.createCollider(forma.setMass(L.massa * (p.original ? 1.25 : 1)).setFriction(0.7).setRestitution(0.1).setCollisionGroups(GRUPO_RAGDOLL), b);
      partes[nome] = b;
    }
    const juntas = JUNTAS.map(([a, b, J]) => this.mundo.createImpulseJoint(RAPIER.JointData.spherical(sub(J, LAYOUT_PARTES[a].c), sub(J, LAYOUT_PARTES[b].c)), partes[a], partes[b], true));
    p.corpo.setEnabled(false);
    p.ragdoll = { partes, juntas, presa: null, offset: vec(0, 0, 0), ate: this.tempo + segundos, quietoDesde: 0 };
  }

  private apagarRagdoll(p: Piranbenja): void {
    const rd = p.ragdoll; if (!rd) return;
    for (const j of rd.juntas) this.tirarJunta(j);
    for (const n of PARTES) this.mundo.removeRigidBody(rd.partes[n]);
    p.ragdoll = null;
  }

  /** Volta a ser cápsula de pé, onde o tronco caiu. */
  private sairRagdoll(p: Piranbenja): void {
    const rd = p.ragdoll; if (!rd) return;
    const t = rd.partes.tronco.translation();
    this.apagarRagdoll(p);
    p.corpo.setEnabled(true);
    p.corpo.setTranslation({ x: t.x, y: Math.max(t.y + 0.03, PIRANBENJA.altura / 2 + 0.02), z: t.z }, true);
    p.corpo.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    p.corpo.setLinvel({ x: 0, y: 0, z: 0 }, true); p.corpo.setAngvel({ x: 0, y: 0, z: 0 }, true);
    p.corpo.lockRotations(true, true);
  }

  private acalmarRagdolls(): void {
    for (const p of this.pbs) {
      const rd = p.ragdoll; if (!rd || p.agarradoPor) continue;
      const t = rd.partes.tronco.translation(), v = rd.partes.tronco.linvel();
      const quieto = Math.hypot(v.x, v.y, v.z) < 0.8 && t.y < 0.6;
      if (!quieto) { rd.quietoDesde = 0; if (this.tempo > rd.ate + 4) this.sairRagdoll(p); continue; }
      if (!rd.quietoDesde) rd.quietoDesde = this.tempo;
      if (this.tempo >= rd.ate && this.tempo - rd.quietoDesde > 0.3) this.sairRagdoll(p);
    }
  }

  /** Sai de formação e de boneco solto (antes de ser teletransportado). */
  private soltarDeTudo(p: Piranbenja): void { this.liberarDaFormacao(p, false); if (p.ragdoll && !p.agarradoPor) this.sairRagdoll(p); }

  // ---------------- agarrar e jogar ----------------
  private agarrarESoltar(): void {
    const alcance = URSO.raioMao * (this.entrada.tamanhoPata / 1.3) + PIRANBENJA.raio + 0.12;
    for (const l of ['esq', 'dir'] as const) {
      const m = this.entrada.maos[l];
      const fechou = m.grip > 0.7, antes = this.gripAntes[l];
      this.gripAntes[l] = fechou;
      const seg = this.segurando[l];
      if (seg) {
        const rd = seg.ragdoll;
        if (!this.pbs.includes(seg) || !rd || !rd.presa) { this.segurando[l] = null; seg.agarradoPor = null; continue; }
        const presa = rd.partes[rd.presa];
        // a parte segura fica rígida, presa na pata; o resto balança solto
        if (fechou) { presa.setNextKinematicTranslation({ x: m.pos.x + rd.offset.x, y: m.pos.y + rd.offset.y, z: m.pos.z + rd.offset.z }); continue; }
        // soltou: vira projétil com a velocidade da pata, ainda como boneco solto
        const v = this.velMao[l];
        presa.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
        for (const n of PARTES) rd.partes[n].setLinvel({ x: v.x * 1.1, y: v.y * 1.1 + 1, z: v.z * 1.1 }, true);
        rd.presa = null; rd.ate = this.tempo + 0.8; rd.quietoDesde = 0;
        seg.agarradoPor = null; this.segurando[l] = null; seg.cadeia = { derrubados: 0 };
        const vel = len(v);
        if (vel > 3) this.voar(seg, 1.2, vel);
        this.atordoar(seg, 1.5);
        this.eventos.push({ tipo: 'arremessou', mao: l, numero: seg.numero, velocidade: +vel.toFixed(2) });
        continue;
      }
      // agarra quando a mão fecha perto de alguém e a pata está devagar; pata rápida de punho fechado é soco
      if (!fechou || antes || len(this.velMao[l]) > 2.5) continue;
      let melhor: Piranbenja | null = null, md = alcance;
      for (const p of this.pbs) {
        if (p.agarradoPor) continue;
        const c = this.posDe(p);
        const yEixo = Math.max(c.y - PIRANBENJA.altura / 2 + PIRANBENJA.raio, Math.min(c.y + PIRANBENJA.altura / 2 - PIRANBENJA.raio, m.pos.y));
        const d = Math.hypot(m.pos.x - c.x, m.pos.y - yEixo, m.pos.z - c.z);
        if (d < md) { md = d; melhor = p; }
      }
      if (!melhor) continue;
      this.liberarDaFormacao(melhor);
      if (!melhor.ragdoll) this.entrarRagdoll(melhor, 0);
      const rd = melhor.ragdoll!;
      // segura a parte mais perto da pata
      let parte: Parte = 'tronco', dp = Infinity;
      for (const n of PARTES) { const t = rd.partes[n].translation(), d = Math.hypot(t.x - m.pos.x, t.y - m.pos.y, t.z - m.pos.z); if (d < dp) { dp = d; parte = n; } }
      const t = rd.partes[parte].translation();
      const off = vec(t.x - m.pos.x, t.y - m.pos.y, t.z - m.pos.z), no = len(off);
      rd.offset = no > 0.18 ? vec((off.x / no) * 0.18, (off.y / no) * 0.18, (off.z / no) * 0.18) : off;
      rd.presa = parte;
      rd.partes[parte].setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
      melhor.agarradoPor = l; this.segurando[l] = melhor;
      this.atordoar(melhor, 0.5);
      this.eventos.push({ tipo: 'agarrou', mao: l, numero: melhor.numero });
    }
  }

  // ---------------- boliche ----------------
  private boliche(): void {
    for (const p of [...this.pbs]) {
      if (!this.vivo(p) || p.agarradoPor || this.tempo >= p.voandoAte) continue;
      const v = this.velDe(p), vel = len(v);
      if (vel < 4) continue;
      const a = this.posDe(p);
      for (const q of [...this.pbs]) {
        if (!this.vivo(p)) break;
        if (q === p || !this.vivo(q) || q.agarradoPor || p.jaBateu.has(q.numero)) continue;
        const b = this.posDe(q);
        if (Math.hypot(a.x - b.x, a.z - b.z) > PIRANBENJA.raio * 2 + 0.08 || Math.abs(a.y - b.y) > PIRANBENJA.altura * 0.9) continue;
        p.jaBateu.add(q.numero);
        this.liberarDaFormacao(q);
        const qv = this.velDe(q);
        this.definirVel(q, vec(qv.x + v.x * 0.6, Math.max(qv.y, 0) + 1.5, qv.z + v.z * 0.6));
        this.definirVel(p, vec(v.x * 0.7, v.y, v.z * 0.7));
        q.res -= 4; p.res -= 5;
        this.voar(q, 0.9, vel * 0.6);
        q.jaBateu.add(p.numero); // quem foi derrubado não "rebate" em quem o derrubou (senão os dois se derretem num vaivém)
        this.atordoar(q, 1.2);
        // a jogada continua em quem caiu: um derruba outro, que derruba outro… três na mesma jogada = STRIKE
        q.cadeia = p.cadeia; p.cadeia.derrubados++;
        if (p.cadeia.derrubados === 3) this.eventos.push({ tipo: 'strike', derrubados: 3 });
        if (q.res <= 0 && !q.original) this.derreter(q);
      }
    }
  }

  // ---------------- Piranbenjas atacando o urso ----------------
  private ataquesNoUrso(): void {
    const u = this.entrada.cabeca;
    for (const p of this.pbs) {
      if (!p.ataquePedido) continue;
      const tipo = p.ataquePedido; p.ataquePedido = null;
      if (p.ragdoll || this.tempo < p.atordoadoAte) continue;
      const c = this.posDe(p);
      const dir = vec(u.x - c.x, 0, u.z - c.z), d = lenH(dir);
      if (d > URSO.raioCorpo + PIRANBENJA.raio + 0.45) continue;
      if (tipo === 'dano') { this.ursoRes = Math.max(0, this.ursoRes - 3); this.eventos.push({ tipo: 'ursoGolpeado', golpe: tipo, combo: 1, empurrao: { x: 0, z: 0 } }); continue; }
      // impacto: ataques combinados (vários Piranbenjas juntos) aumentam muito o empurrão
      this.ursoAcertos = this.ursoAcertos.filter((t) => this.tempo - t < JANELA_COMBO); this.ursoAcertos.push(this.tempo);
      const combo = fatorCombo(this.ursoAcertos.length);
      const L = lancamento(2.2, this.ursoRes / 100, PESO.urso, combo);
      this.ursoRes = Math.max(0, this.ursoRes - 1);
      this.eventos.push({ tipo: 'ursoGolpeado', golpe: tipo, combo, empurrao: { x: (dir.x / (d || 1)) * L, z: (dir.z / (d || 1)) * L } });
    }
  }

  // ---------------- endireitar, quedas e rodadas ----------------
  private endireitar(): void {
    for (const p of this.pbs) {
      if (p.agarradoPor || p.ragdoll || p.naFormacao || this.tempo < p.voandoAte) continue;
      const pos = p.corpo.translation(), v = p.corpo.linvel();
      if (pos.y < PIRANBENJA.altura / 2 + 0.2 && len(v) < 1.5) {
        const r = p.corpo.rotation();
        if (Math.abs(r.x) + Math.abs(r.z) > 0.001) {
          p.corpo.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true); p.corpo.setAngvel({ x: 0, y: 0, z: 0 }, true);
          p.corpo.setTranslation({ x: pos.x, y: PIRANBENJA.altura / 2 + 0.02, z: pos.z }, true);
        }
        p.corpo.lockRotations(true, true);
      }
    }
  }

  private derreter(p: Piranbenja): void {
    for (const l of ['esq', 'dir'] as const) if (this.segurando[l] === p) this.segurando[l] = null;
    this.liberarDaFormacao(p, false);
    this.apagarRagdoll(p);
    this.mundo.removeRigidBody(p.corpo);
    this.pbs = this.pbs.filter((x) => x !== p);
    this.eventos.push({ tipo: 'derreteu', numero: p.numero });
  }

  private quedas(): void {
    if (this.rodada !== 'luta') return;
    for (const p of [...this.pbs]) {
      if (this.posDe(p).y > -1.5) continue;
      if (p.original) { this.fim('urso'); return; }
      this.derreter(p);
    }
    if (lenH(this.entrada.cabeca) > RINGUE.raio + 0.3 && !this.opcoes.ursoDeTreino) this.fim('piranbenja');
  }

  private fim(vencedor: 'urso' | 'piranbenja'): void {
    this.rodada = 'fim'; this.placar[vencedor]++; this.fimEm = this.tempo + 3;
    this.eventos.push({ tipo: 'fimRodada', vencedor, placar: { ...this.placar } });
    this.cameraLenta(1.2);
  }

  // ---------------- foto ----------------
  /** O que pode sair desta classe: nada aqui diz quem é o original. */
  foto(): Foto {
    return {
      tick: this.tick, tempo: +this.tempo.toFixed(3), escalaTempo: this.escalaTempo, rodada: this.rodada, placar: { ...this.placar },
      urso: { res: Math.round(this.ursoRes), aura: Math.round(this.ursoAura) },
      piranbenjas: this.pbs.map((p) => {
        const r = this.corpoDe(p).rotation();
        let partes: Record<Parte, PoseParte> | null = null;
        if (p.ragdoll) {
          partes = {} as Record<Parte, PoseParte>;
          for (const n of PARTES) { const b = p.ragdoll.partes[n], t = b.translation(), q = b.rotation(); partes[n] = { pos: vec(t.x, t.y, t.z), rot: [q.x, q.y, q.z, q.w] }; }
        }
        const atacando = p.estado === 'armando' || p.estado === 'atacando';
        return {
          numero: p.numero, pos: this.posDe(p), rot: [r.x, r.y, r.z, r.w], voando: this.tempo < p.voandoAte, agarrado: !!p.agarradoPor,
          estado: p.estado, ataque: atacando ? (p.ataqueTipo === 'dano' ? 'morder' : 'socar') : null,
          achatado: this.tempo < p.achatadoAte, partes,
        };
      }),
    };
  }

  /** Só no PC do Piranbenja (a tela dele mostra quem ele é). Nunca vai para a rede. */
  numeroDoOriginal(): number { return this.pbs.find((p) => p.original)?.numero ?? 0; }
  get entradaUrso(): EntradaUrso { return this.entrada; }
  get aguaAtual(): number { return this.agua; }

  // ---------------- só para os testes automáticos ----------------
  testeNumeros(): number[] { return this.pbs.map((p) => p.numero); }
  testeColocar(numero: number, pos: V3): void {
    const p = this.pbs.find((x) => x.numero === numero); if (!p) return;
    this.soltarDeTudo(p);
    p.corpo.setTranslation(pos, true); p.corpo.setLinvel({ x: 0, y: 0, z: 0 }, true); p.alvo = { ...pos };
    p.atordoadoAte = 0; p.achatadoAte = 0; p.voandoAte = 0;
    p.corpo.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true); p.corpo.setAngvel({ x: 0, y: 0, z: 0 }, true); p.corpo.lockRotations(true, true);
  }
  testePedirAtaque(numero: number, tipo: TipoGolpe): void { const p = this.pbs.find((x) => x.numero === numero); if (p) p.ataquePedido = tipo; }
  testeVelocidade(numero: number): number { const p = this.pbs.find((x) => x.numero === numero); return p ? len(this.velDe(p)) : 0; }
  testeGiro(numero: number): V3 { const p = this.pbs.find((x) => x.numero === numero); const w = p ? this.corpoDe(p).angvel() : { x: 0, y: 0, z: 0 }; return vec(w.x, w.y, w.z); }
  testeEstado(numero: number): { estado: EstadoIA; atordoadoPor: number; ragdoll: boolean; formacao: boolean } | null {
    const p = this.pbs.find((x) => x.numero === numero);
    return p ? { estado: p.estado, atordoadoPor: Math.max(0, p.atordoadoAte - this.tempo), ragdoll: !!p.ragdoll, formacao: p.naFormacao } : null;
  }
  testeCriarClones(n: number): number { return this.espalharClones(n); }
}
