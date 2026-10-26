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
//
// Teste solo do Piranbenja (C16): o urso tem corpo inteiro em segmentos (corpoUrso.ts) e ninguém entra dentro dele
// (empurrão leve, sem dano); os Piranbenjas acertam a parte do urso que alcançam; a mordida dos clones gruda
// (o clone vira boneco solto preso pela boca e acompanha a parte mordida); o original não morde (dá tapa ou soco);
// o urso pode ser um bot (parado, bobo ou ofensivo).

import RAPIER from '@dimforge/rapier3d-compat';
import {
  AGUA, ATORDOA_RASPAO, EQUILIBRIO, GOLPES, JANELA_COMBO, MARTELADA_PRESO, MULT_QUALIDADE, PARTE_VIZINHOS, PESO, PIRANBENJA, RINGUE, URSO,
  classificarGolpe, fatorCombo, gerarBlocos, lancamento, modsDaZona, qualidadeDoGolpe, zonaDoContato,
  type NomeGolpe, type Qualidade, type TipoGolpe, type V3, type Zona,
} from './regras';
import {
  CORPO_URSO, baseDoSegmento, esqueletoUrso, pertoEntreSegmentos, pertoNoSegmento,
  type EsqueletoUrso, type SegUrso, type Segmento,
} from './corpoUrso';
import { UrsoBot, type JeitoUrso } from './ursoBot';

let pronta = false;
/** Carrega a física (WebAssembly embutido: funciona offline). Chamar uma vez antes de criar a luta. */
export async function prepararFisica(): Promise<void> { if (!pronta) { await RAPIER.init(); pronta = true; } }

export type Lado = 'esq' | 'dir';
export interface MaoUrso { pos: V3; gatilho: number; grip: number }
/** giro: para onde o urso olha (radianos; 0 = olhando para −z). Define ombros, braços e o corpo inteiro. */
export interface EntradaUrso { cabeca: V3; maos: Record<Lado, MaoUrso>; tamanhoPata: number; giro?: number }
/** Ataques dos Piranbenjas: mordida (só clones, gruda), tapa e soco. */
export type AtaquePB = 'morder' | 'tapa' | 'soco';
export const TIPO_DO_ATAQUE: Record<AtaquePB, TipoGolpe> = { morder: 'dano', tapa: 'dano', soco: 'impacto' };
export interface ControleOriginal {
  mover: { x: number; z: number };
  /** Para onde o original olha (giro da câmera do PC), para o ataque sair para frente. */
  olhar?: number;
  atacar: 'tapa' | 'soco' | null;
  criarClones: boolean;                              // atalho antigo: 2 clones complexos
  pedirClones?: { quantos: number; simples: boolean } | null;
}

/** O que o clone está fazendo (aparece nas ajudas visuais do teste). */
export const ESTADOS_IA = ['andando', 'parado', 'aproximando', 'rodeando', 'armando', 'atacando', 'recuando', 'atordoado', 'formacao'] as const;
export type EstadoIA = typeof ESTADOS_IA[number];
export type Comportamento = 'parados' | 'aleatorio' | 'cautelosos' | 'ofensivos' | 'seguir';
export type Formacao = 'solto' | 'torre' | 'piramide' | 'muralha' | 'corrente';
export const PARTES = ['cabeca', 'tronco', 'bracoE', 'bracoD', 'pernaE', 'pernaD'] as const;
export type Parte = typeof PARTES[number];
export interface PoseParte { pos: V3; rot: [number, number, number, number] }

/** O que o mundo de fora pode saber de cada Piranbenja (sem dizer quem é o original). */
export interface FotoPiranbenja {
  numero: number; pos: V3; rot: [number, number, number, number]; voando: boolean; agarrado: boolean;
  estado: EstadoIA; ataque: 'morder' | 'tapa' | 'socar' | null; achatado: boolean;
  /** Preso pela boca numa parte do urso (mordida que gruda). */
  grudado: boolean;
  /** Só quando vira boneco solto (ragdoll): pose de cada parte. Ainda não vai pela rede. */
  partes: Record<Parte, PoseParte> | null;
}
export interface Foto {
  tick: number; tempo: number; escalaTempo: number;
  rodada: EstadoRodada; placar: { urso: number; piranbenja: number };
  urso: { res: number; aura: number; grudados: number };
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
  | { tipo: 'ursoGolpeado'; golpe: TipoGolpe; combo: number; empurrao: { x: number; z: number }; ataque?: AtaquePB; parte?: SegUrso; ponto?: V3; numero?: number }
  | { tipo: 'ursoDecolou'; vel: V3 }
  | { tipo: 'grudou'; numero: number; parte: SegUrso }
  | { tipo: 'soltouGrudado'; numero: number; como: 'sacudida' | 'arrancado' }
  | { tipo: 'fimRodada'; vencedor: 'urso' | 'piranbenja'; placar: { urso: number; piranbenja: number } }
  | { tipo: 'novaRodada' };

interface Ragdoll {
  partes: Record<Parte, RAPIER.RigidBody>;
  juntas: RAPIER.ImpulseJoint[];
  presa: Parte | null;       // a parte que a pata segura (fica rígida, presa na pata)
  offset: V3;                // onde a parte fica em relação à pata
  ate: number;               // fica solto pelo menos até aqui
  quietoDesde: number;
  /** Mordida que gruda: a cabeça fica presa na superfície desta parte do urso. */
  grudado: { seg: SegUrso; t: number; du: number; dv: number; dw: number; ultimo: V3 | null; rapidoDesde: number } | null;
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
  ataquePedido: AtaquePB | null;
  ataqueTipo: AtaquePB;      // o que está armando
  simples: boolean;          // clone simples: mais barato, mais fraco, reage mais devagar e não morde (só a armadilha morde)
  armadilha: boolean;        // armadilha de morder: fica parada onde nasceu e morde o urso que passar perto
  armadoAte: number; atacandoAte: number; recuarAte: number;
  atordoadoAte: number; achatadoAte: number;
  naFormacao: boolean;
  ragdoll: Ragdoll | null;
}

const vec = (x: number, y: number, z: number): V3 => ({ x, y, z });
const sub = (a: V3, b: V3): V3 => vec(a.x - b.x, a.y - b.y, a.z - b.z);
const len = (a: V3) => Math.hypot(a.x, a.y, a.z);
const lenH = (a: V3) => Math.hypot(a.x, a.z);
const dot = (a: V3, b: V3): number => a.x * b.x + a.y * b.y + a.z * b.z;
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
/** Clone simples custa menos água (D-075): proposta para o teste. */
export const CUSTO_SIMPLES = 6; // C19: 8 → 6
/** Grudados: no máximo 6 ao mesmo tempo; cada um tira 1 de resistência por segundo e deixa o urso 5% mais lento (D-083). */
const MAX_GRUDADOS = 6;
/** Sacudir: a parte mordida passando de 6,5 m/s por 0,1 s solta quem está grudado. */
const SACUDIDA = 6.5;
/** Alcance dos ataques do Piranbenja: da cabeça (mordida) ou da mão até a superfície do urso. */
const ALCANCE_ATAQUE = 0.32;

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
  /** O urso é do jogo (teste solo do Piranbenja). */
  ursoBot?: JeitoUrso;
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
  private entrada: EntradaUrso;
  private esqueleto: EsqueletoUrso;
  private bot: UrsoBot | null = null;
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
  /** Até quando o urso está no ar depois de decolar (não golpeia nem agarra). */
  private ursoNoArAte = 0;
  /** Clone salva-vidas: só de novo depois desta hora. */
  private salvaVidasAte = 0;
  /** Testes: quanto alguém chegou a entrar no urso antes de ser empurrado (m). */
  maiorEntrada = 0;
  agua = AGUA.inicial;
  ursoRes = 100;
  ursoAura = 0;
  rodada: EstadoRodada = 'luta';
  placar = { urso: 0, piranbenja: 0 };
  private fimEm = 0;
  controle: ControleOriginal = { mover: { x: 0, z: 0 }, atacar: null, criarClones: false, pedirClones: null };

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
    // Urso: não é um corpo da física. É um esqueleto de cápsulas (corpoUrso.ts) que segue o jogador (ou o bot);
    // a luta empurra para fora quem encosta nele (empurrão leve, sem dano), para ninguém atravessar o corpo.
    this.entrada = { cabeca: vec(0, 2.45, 3), giro: 0, tamanhoPata: 1.3, maos: { esq: { pos: vec(-0.62, 1.15, 2.75), gatilho: 0, grip: 0 }, dir: { pos: vec(0.62, 1.15, 2.75), gatilho: 0, grip: 0 } } };
    this.esqueleto = esqueletoUrso(this.poseUrso());
    if (opcoes.ursoBot) this.bot = new UrsoBot(opcoes.ursoBot, this.aleatorio);
    this.comecarRodada();
  }

  // ---------------- entradas ----------------
  /** Posição da cabeça e das patas do urso no mundo (do Quest, a cada quadro ou pela rede). */
  definirUrso(e: EntradaUrso, agora = this.relogioReal): void {
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
  private poseUrso() { const e = this.entrada; return { cabeca: e.cabeca, giro: e.giro ?? 0, maos: e.maos, tamanhoPata: e.tamanhoPata }; }
  /** Segmentos do corpo do urso agora (para desenhar o urso de fora exatamente como a luta o vê). */
  get esqueletoUrso(): EsqueletoUrso { return this.esqueleto; }
  /** Troca o jeito do urso bot (painel do teste). */
  trocarBot(jeito: JeitoUrso | null): void { this.opcoes.ursoBot = jeito ?? undefined; this.bot = jeito ? new UrsoBot(jeito, this.aleatorio) : null; }
  tirarEventos(): Evento[] { const e = this.eventos; this.eventos = []; return e; }

  // ---------------- rodadas ----------------
  private comecarRodada(): void {
    for (const f of this.juntasFormacao) this.tirarJunta(f.j);
    this.juntasFormacao = [];
    for (const p of this.pbs) { this.apagarRagdoll(p); this.mundo.removeRigidBody(p.corpo); }
    this.pbs = [];
    for (const l of ['esq', 'dir'] as const) this.segurando[l] = null;
    this.bot?.reiniciar(); this.ursoNoArAte = 0; this.salvaVidasAte = 0;
    this.agua = AGUA.inicial; this.ursoRes = 100; this.ursoAura = 0; this.rodada = 'luta';
    const f = this.opcoes.formacao ?? 'solto';
    if (f !== 'solto') { this.montarFormacao(f); return; }
    const original = this.novoPiranbenja(true, vec(0, PIRANBENJA.altura / 2, -3));
    this.pbs.push(original);
    this.espalharClones(this.opcoes.clonesIniciais ?? 4, true);
  }

  /** Recomeça a rodada (opções novas do painel de teste). */
  reiniciar(): void { this.comecarRodada(); this.eventos.push({ tipo: 'novaRodada' }); }

  private novoPiranbenja(original: boolean, pos: V3, simples = false): Piranbenja {
    const corpo = this.mundo.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(pos.x, pos.y, pos.z)
      .setLinearDamping(0.3).setAngularDamping(1.5).lockRotations().setCcdEnabled(true));
    this.mundo.createCollider(RAPIER.ColliderDesc.capsule(PIRANBENJA.altura / 2 - PIRANBENJA.raio, PIRANBENJA.raio)
      .setMass(original ? PESO.original : PESO.clone * (simples ? 0.8 : 1)).setFriction(0.6).setRestitution(0.15), corpo);
    return {
      numero: 0, original, corpo, res: original ? PIRANBENJA.resOriginal : PIRANBENJA.resClone * (simples ? 0.5 : 1), simples, armadilha: false,
      voandoAte: 0, agarradoPor: null, acertosRecentes: [], cadeia: { derrubados: 0 }, jaBateu: new Set(),
      estado: 'andando', pensarEm: 0, alvo: { ...pos }, ataqueEm: 0, ataquePedido: null, ataqueTipo: 'tapa',
      armadoAte: 0, atacandoAte: 0, recuarAte: 0, atordoadoAte: 0, achatadoAte: 0, naFormacao: false, ragdoll: null,
    };
  }

  /** Cria clones em volta do original e muda o original de lugar entre eles (GDD 7: nunca revelar o original). */
  private espalharClones(quantos: number, gratis = false, simples = false): number {
    const custo = simples ? CUSTO_SIMPLES : AGUA.custoClone;
    if (!gratis) quantos = Math.min(quantos, Math.floor(this.agua / custo));
    if (quantos <= 0) return 0;
    if (!gratis) this.agua -= quantos * custo;
    const orig = this.pbs.find((p) => p.original)!;
    // segurado pela pata: os clones nascem, mas o original continua preso (não é fuga)
    const preso = !!orig.agarradoPor;
    const po = this.posDe(orig);
    // clone salva-vidas (C18/C19): se o original está caindo do ringue, ele troca de lugar com um clone novo
    // e volta à plataforma; só funciona de novo depois de 8 s
    const caindo = po.y < PIRANBENJA.altura / 2 - 0.1 || Math.hypot(po.x, po.z) > RINGUE.raio;
    const salva = caindo && !preso && this.tempo >= this.salvaVidasAte;
    if (salva) this.salvaVidasAte = this.tempo + EQUILIBRIO.esperaSalvaVidas;
    const troca = !preso && (!caindo || salva);
    // efeitos que o original mostra (tonto, achatado, armando) passam para um clone novo (C18/C19)
    const tonto = this.tempo < orig.atordoadoAte || !!orig.ragdoll, achatado = this.tempo < orig.achatadoAte, armando = orig.estado === 'armando';
    const efeito = { tonto: Math.max(orig.atordoadoAte - this.tempo, orig.ragdoll ? 1.2 : 0), achatado: orig.achatadoAte - this.tempo, armando, tipo: orig.ataqueTipo, armadoAte: orig.armadoAte };
    const tinhaEfeito = troca && (tonto || achatado || armando);
    if (troca) this.soltarDeTudo(orig);
    const c = troca ? this.posDe(orig) : po;
    const centro = vec(c.x, 0, c.z); const rc = Math.hypot(centro.x, centro.z), mx = RINGUE.raio - 1.2;
    if (rc > mx) { centro.x *= mx / rc; centro.z *= mx / rc; } // em volta de um ponto dentro do ringue
    const vagas: V3[] = [];
    const total = quantos + 1, giro = this.aleatorio() * Math.PI * 2;
    for (let i = 0; i < total; i++) {
      const a = giro + (i / total) * Math.PI * 2, r = 0.8 + this.aleatorio() * 0.5;
      let x = centro.x + Math.cos(a) * r, z = centro.z + Math.sin(a) * r;
      const d = Math.hypot(x, z); if (d > RINGUE.raio - 0.6) { x *= (RINGUE.raio - 0.6) / d; z *= (RINGUE.raio - 0.6) / d; }
      vagas.push(vec(x, PIRANBENJA.altura / 2 + 0.05, z));
    }
    const vagaOrig = Math.floor(this.aleatorio() * total);
    if (troca) {
      orig.corpo.setTranslation(vagas[vagaOrig], true); orig.corpo.setLinvel({ x: 0, y: 0, z: 0 }, true); orig.alvo = { ...vagas[vagaOrig] };
      orig.corpo.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true); orig.corpo.setAngvel({ x: 0, y: 0, z: 0 }, true); orig.corpo.lockRotations(true, true);
      orig.voandoAte = 0;
    }
    vagas.splice(vagaOrig, 1);
    const novos: Piranbenja[] = [];
    vagas.forEach((v, i) => {
      const n = this.novoPiranbenja(false, v, simples);
      // um em cada três clones simples vira "armadilha de morder": fica parado onde nasceu e morde quem passa perto
      if (simples && i % 3 === 2) n.armadilha = true;
      this.pbs.push(n); novos.push(n);
    });
    if (tinhaEfeito && novos.length) {
      const herdeiro = novos[Math.floor(this.aleatorio() * novos.length)];
      if (tonto) { herdeiro.atordoadoAte = this.tempo + efeito.tonto; herdeiro.estado = 'atordoado'; }
      if (achatado) herdeiro.achatadoAte = this.tempo + efeito.achatado;
      if (armando && !tonto) { herdeiro.estado = 'armando'; herdeiro.armadoAte = efeito.armadoAte; herdeiro.ataqueTipo = efeito.tipo === 'morder' ? 'tapa' : efeito.tipo; }
      orig.atordoadoAte = 0; orig.achatadoAte = 0; orig.estado = 'andando'; orig.ataquePedido = null;
    }
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
    if (this.bot) this.moverUrsoBot(dt);
    else if (this.opcoes.ursoDeTreino) this.moverUrsoDeTreino();
    this.posicionarUrso(dt);
    if (this.rodada === 'luta') {
      this.agua = Math.min(AGUA.maximo, this.agua + AGUA.recarga * dt);
      this.ursoRes = Math.min(100, this.ursoRes + 0.2 * dt);
      this.ursoAura = Math.min(100, this.ursoAura + 1 * dt);
      this.controlarOriginal(dt);
      for (const p of this.pbs) this.progredirAtaque(p);
      if (!this.opcoes.semIA) for (const p of this.pbs) if (!p.original || this.opcoes.originalAutomatico) this.pensarClone(p);
      for (const p of this.pbs) if (!this.opcoes.semIA || p.original) this.andar(p);
      this.golpesDasPatas();
      this.agarrarESoltar();
      this.boliche();
      this.ataquesNoUrso();
    }
    this.prenderAchatados();
    this.segurarGrudados(dt);
    this.mundo.step();
    this.afastarDoUrso();
    this.endireitar();
    this.acalmarRagdolls();
    this.quedas();
    if (this.rodada === 'fim' && this.tempo > this.fimEm) { this.comecarRodada(); this.eventos.push({ tipo: 'novaRodada' }); }
  }

  private moverUrsoDeTreino(): void {
    const t = this.tempo, e = this.entrada;
    this.definirUrso({ tamanhoPata: e.tamanhoPata, giro: 0, cabeca: vec(0, 2.45, 2.2), maos: {
      esq: { pos: vec(-0.45 + Math.sin(t * 2) * 0.35, 1.3, 1.5 + Math.cos(t * 2) * 0.4), gatilho: 0, grip: 0 },
      dir: { pos: vec(0.45 + Math.sin(t * 2 + 2) * 0.35, 1.3, 1.5 + Math.cos(t * 2 + 2) * 0.4), gatilho: 0, grip: 0 } } });
  }

  private moverUrsoBot(dt: number): void {
    const visao = {
      piranbenjas: this.pbs.map((p) => ({ numero: p.numero, pos: this.posDe(p), grudadoEm: p.ragdoll?.grudado?.seg ?? null, agarrado: !!p.agarradoPor, derrubado: !!p.ragdoll })),
      segurando: { esq: this.segurando.esq?.numero ?? null, dir: this.segurando.dir?.numero ?? null },
      lentidao: this.grudados().length * 0.05,
    };
    const s = this.bot!.passo(dt, this.tempo, visao);
    this.definirUrso(s, this.tempo);
  }

  private posicionarUrso(_dt: number): void {
    this.esqueleto = esqueletoUrso(this.poseUrso());
    const relogio = this.bot ? this.tempo : this.relogioReal;
    for (const l of ['esq', 'dir'] as const) {
      // sem amostra nova há mais de 0,1 s: a pata parou
      const u = this.ultimaAmostra[l];
      if (u && relogio - u.t > 0.1) this.velMao[l] = vec(0, 0, 0);
    }
  }

  // ---------------- Piranbenja: controle, IA e andar ----------------
  private controlarOriginal(_dt: number): void {
    const o = this.pbs.find((p) => p.original); if (!o) return;
    if (this.controle.criarClones) { this.controle.criarClones = false; this.espalharClones(2); }
    if (this.controle.pedirClones) { const c = this.controle.pedirClones; this.controle.pedirClones = null; this.espalharClones(c.quantos, false, c.simples); }
    if (this.opcoes.originalAutomatico) return;
    // o original também "arma" o ataque como os clones (senão quem bate sem armar seria o original)
    if (this.controle.atacar) {
      const livre = o.estado !== 'armando' && o.estado !== 'atacando' && this.tempo >= o.atordoadoAte && !o.ragdoll && !o.agarradoPor;
      if (livre) this.armar(o, this.controle.atacar);
      this.controle.atacar = null;
    }
    const t = this.posDe(o);
    o.alvo = vec(t.x + this.controle.mover.x, 0, t.z + this.controle.mover.z);
  }

  private quantosAtacando(): number { return this.pbs.filter((p) => p.estado === 'aproximando' || p.estado === 'armando' || p.estado === 'atacando').length; }

  private armar(p: Piranbenja, tipo?: AtaquePB): void {
    p.estado = 'armando'; p.armadoAte = this.tempo + EQUILIBRIO.armar;
    // clones: mordida, tapa ou soco; o simples só dá tapa; o original nunca morde (C16)
    const r = this.aleatorio();
    p.ataqueTipo = tipo ?? (p.armadilha ? 'morder' : p.simples ? 'tapa' : r < 0.45 && !p.original ? 'morder' : r < 0.65 ? 'tapa' : 'soco');
    if (p.original && p.ataqueTipo === 'morder') p.ataqueTipo = 'tapa';
    if (!p.original || this.opcoes.originalAutomatico) p.alvo = this.posDe(p); // o clone para enquanto arma
  }

  /** Armar → atacar → voltar: vale para todos (clones e original), não espera a próxima "pensada". */
  private progredirAtaque(p: Piranbenja): void {
    if (p.ragdoll || p.agarradoPor) return;
    if (this.tempo < p.atordoadoAte) { p.estado = 'atordoado'; return; }
    const u = this.entrada.cabeca;
    if (p.estado === 'armando' && this.tempo >= p.armadoAte) {
      p.estado = 'atacando'; p.ataquePedido = p.ataqueTipo; p.atacandoAte = this.tempo + 0.3;
      // bote para frente: o clone vai na direção do urso; o original, para onde o jogador olha
      const pos = this.posDe(p);
      let d = vec(u.x - pos.x, 0, u.z - pos.z);
      if (p.original && !this.opcoes.originalAutomatico && this.controle.olhar !== undefined) d = vec(-Math.sin(this.controle.olhar), 0, -Math.cos(this.controle.olhar));
      const n = lenH(d) || 1, v = p.corpo.linvel();
      p.corpo.setLinvel({ x: v.x + (d.x / n) * 2.2, y: v.y, z: v.z + (d.z / n) * 2.2 }, true);
      if (!p.original || this.opcoes.originalAutomatico) p.alvo = vec(u.x, 0, u.z);
      return;
    }
    if (p.estado === 'atacando' && this.tempo >= p.atacandoAte) {
      const comp = this.opcoes.comportamento ?? 'cautelosos';
      p.estado = p.original && !this.opcoes.originalAutomatico ? 'andando' : comp === 'cautelosos' || comp === 'seguir' ? 'recuando' : 'aproximando';
      p.recuarAte = this.tempo + 1.5; p.pensarEm = 0;
    }
  }

  private pensarClone(p: Piranbenja): void {
    if (p.naFormacao || p.ragdoll || p.agarradoPor) return;
    if (this.tempo < p.atordoadoAte) { p.estado = 'atordoado'; return; }
    if (p.estado === 'atordoado') { p.estado = 'andando'; p.pensarEm = 0; }
    if (p.estado === 'armando' || p.estado === 'atacando') return;
    const u = this.entrada.cabeca, pos = this.posDe(p), d = this.distanciaAoUrso(pos);
    const comp = this.opcoes.comportamento ?? 'cautelosos';
    if (p.estado === 'aproximando' && d < 0.55 && this.tempo > p.ataqueEm) { this.armar(p); return; }
    if (p.armadilha) {
      // parada onde nasceu; quando o urso encosta quase, arma a mordida
      p.estado = 'parado'; p.alvo = pos;
      if (d < 0.45 && this.tempo > p.ataqueEm) { this.armar(p); p.ataqueEm = this.tempo + 1.5; }
      return;
    }
    if (this.tempo < p.pensarEm) return;
    // pensa a cada ~0,25 s + reação de 0,2 a 1,2 s (o simples reage mais devagar)
    p.pensarEm = this.tempo + (0.25 + 0.2 + this.aleatorio() * 1.0) * (p.simples ? 1.6 : 1);
    const limitar = (a: V3) => { const r = Math.hypot(a.x, a.z), m = RINGUE.raio - 0.7; if (r > m) { a.x *= m / r; a.z *= m / r; } return a; };
    if (comp === 'parados') { p.estado = 'parado'; p.alvo = pos; return; }
    if (comp === 'aleatorio') {
      p.estado = 'andando';
      if (lenH(sub(p.alvo, pos)) < 0.3 || this.aleatorio() < 0.15) { const a = this.aleatorio() * Math.PI * 2, r = this.aleatorio() * 4.5; p.alvo = vec(Math.cos(a) * r, 0, Math.sin(a) * r); }
      return;
    }
    if (comp === 'seguir') {
      // ficam em volta do original; quando o urso chega perto, até três vão atacar
      const o = this.pbs.find((x) => x.original);
      if (p.estado === 'recuando' && this.tempo < p.recuarAte) { const fora = sub(pos, u), n = lenH(fora) || 1; p.alvo = limitar(vec(u.x + (fora.x / n) * 2.3, 0, u.z + (fora.z / n) * 2.3)); return; }
      if (d < 1.6 && this.tempo > p.ataqueEm && this.quantosAtacando() < 3) { p.estado = 'aproximando'; p.ataqueEm = this.tempo + 0.3; }
      if (p.estado === 'aproximando') { p.alvo = limitar(this.alvoJuntoAoUrso(pos)); if (d > 2.5) p.estado = 'andando'; return; }
      p.estado = 'andando';
      if (o && o !== p) { const op = this.posDe(o); const a = this.aleatorio() * Math.PI * 2, r = 0.9 + this.aleatorio() * 0.6; p.alvo = limitar(vec(op.x + Math.cos(a) * r, 0, op.z + Math.sin(a) * r)); }
      if (p.ataqueEm < this.tempo - 4) p.ataqueEm = this.tempo + 1 + this.aleatorio() * 2;
      return;
    }
    if (comp === 'ofensivos') {
      const a = this.aleatorio() * Math.PI * 2;
      const perto = this.alvoJuntoAoUrso(vec(u.x + Math.cos(a) * 2, 0, u.z + Math.sin(a) * 2));
      p.alvo = limitar(d < 1.2 ? this.alvoJuntoAoUrso(pos) : perto); p.estado = 'aproximando';
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
      p.alvo = limitar(this.alvoJuntoAoUrso(pos));
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
      if (vel < EQUILIBRIO.velocidadeMinimaGolpe || this.segurando[l] || this.tempo < this.ursoNoArAte) continue;
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
    p.ragdoll = { partes, juntas, presa: null, offset: vec(0, 0, 0), ate: this.tempo + segundos, quietoDesde: 0, grudado: null };
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
      const rd = p.ragdoll; if (!rd || p.agarradoPor || rd.grudado) continue;
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
    // a pata não entra no Piranbenja (é empurrado para fora), então o alcance de agarrar passa um pouco da superfície
    const alcance = URSO.raioMao * (this.entrada.tamanhoPata / 1.3) + PIRANBENJA.raio + EQUILIBRIO.folgaAgarrar;
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
        if (fechou) { const L = LAYOUT_PARTES[rd.presa]; presa.setNextKinematicTranslation(this.foraDoUrso(vec(m.pos.x + rd.offset.x, m.pos.y + rd.offset.y, m.pos.z + rd.offset.z), L.r + L.hh)); continue; }
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
      if (!fechou || antes || len(this.velMao[l]) > EQUILIBRIO.agarrarAte || this.tempo < this.ursoNoArAte) continue;
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
      if (melhor.ragdoll?.grudado) this.soltarGrudado(melhor, vec(0, 0, 0), 'arrancado'); // arrancar com a pata quem está grudado
      if (!melhor.ragdoll) this.entrarRagdoll(melhor, 0);
      const rd = melhor.ragdoll!;
      if (rd.presa) { rd.partes[rd.presa].setBodyType(RAPIER.RigidBodyType.Dynamic, true); rd.presa = null; }
      // segura a parte mais perto da pata
      let parte: Parte = 'tronco', dp = Infinity;
      for (const n of PARTES) { const t = rd.partes[n].translation(), d = Math.hypot(t.x - m.pos.x, t.y - m.pos.y, t.z - m.pos.z); if (d < dp) { dp = d; parte = n; } }
      const t = rd.partes[parte].translation();
      // a parte segura fica encostada na superfície da pata, nunca dentro dela
      const off = vec(t.x - m.pos.x, t.y - m.pos.y, t.z - m.pos.z), no = len(off) || 1;
      const lp = LAYOUT_PARTES[parte], dist = CORPO_URSO.raioPata * (this.entrada.tamanhoPata / 1.3) + lp.r + lp.hh * 0.5 + 0.01;
      rd.offset = no > 1e-3 ? vec((off.x / no) * dist, (off.y / no) * dist, (off.z / no) * dist) : vec(0, -dist, 0);
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
    for (const p of this.pbs) {
      if (!p.ataquePedido) continue;
      const ataque = p.ataquePedido; p.ataquePedido = null;
      if (p.ragdoll || this.tempo < p.atordoadoAte) continue;
      const c = this.posDe(p);
      // de onde sai o ataque: a boca (mordida) ou a mão (tapa e soco), virada para a parte do urso mais perto
      const alvo = this.pontoMaisPertoDoUrso(c);
      const para = vec(alvo.x - c.x, 0, alvo.z - c.z), n = lenH(para) || 1;
      const origem = ataque === 'morder' ? vec(c.x + (para.x / n) * 0.18, c.y + 0.27, c.z + (para.z / n) * 0.18) : vec(c.x + (para.x / n) * 0.3, c.y + 0.02, c.z + (para.z / n) * 0.3);
      // a parte do urso mais perto (a superfície)
      let melhor: { seg: Segmento; q: V3; t: number; d: number } | null = null;
      for (const seg of this.esqueleto.segs) {
        const { q, t } = pertoNoSegmento(origem, seg.a, seg.b), d = len(sub(origem, q)) - seg.r;
        if (!melhor || d < melhor.d) melhor = { seg, q, t, d };
      }
      if (!melhor || melhor.d > ALCANCE_ATAQUE) continue;
      const tipo = TIPO_DO_ATAQUE[ataque];
      const ponto = vec(melhor.q.x + ((origem.x - melhor.q.x) / Math.max(1e-3, melhor.d + melhor.seg.r)) * melhor.seg.r,
        melhor.q.y + ((origem.y - melhor.q.y) / Math.max(1e-3, melhor.d + melhor.seg.r)) * melhor.seg.r,
        melhor.q.z + ((origem.z - melhor.q.z) / Math.max(1e-3, melhor.d + melhor.seg.r)) * melhor.seg.r);
      const base = { tipo: 'ursoGolpeado' as const, golpe: tipo, ataque, parte: melhor.seg.nome, ponto, numero: p.numero };
      if (tipo === 'dano') {
        this.ursoRes = Math.max(0, this.ursoRes - (ataque === 'morder' ? EQUILIBRIO.danoMordida : EQUILIBRIO.danoTapa) * (p.simples ? 0.6 : 1));
        this.eventos.push({ ...base, combo: 1, empurrao: { x: 0, z: 0 } });
        // mordida de clone gruda (D-082): vira boneco solto preso pela boca na parte mordida
        if (ataque === 'morder' && !p.original && this.grudados().length < MAX_GRUDADOS) this.grudar(p, melhor.seg, melhor.t, origem);
        continue;
      }
      // impacto: ataques combinados (vários Piranbenjas juntos) aumentam muito o empurrão
      this.ursoAcertos = this.ursoAcertos.filter((t) => this.tempo - t < JANELA_COMBO); this.ursoAcertos.push(this.tempo);
      const combo = fatorCombo(this.ursoAcertos.length);
      const L = lancamento(EQUILIBRIO.impactoSoco * (p.simples ? 0.6 : 1), this.ursoRes / 100, PESO.urso, combo);
      this.ursoRes = Math.max(0, this.ursoRes - 1);
      const dx = para.x / n, dz = para.z / n;
      if (L > EQUILIBRIO.decolarUrso && this.tempo >= this.ursoNoArAte) {
        // o urso decola: voa em arco (no Quest, a câmera vai junto ou escurece), não ataca no ar
        // arco de anime: sobe bem (~1,5 m) e vai uns 5 m para trás; perto da borda, cai fora do ringue
        const v = vec(dx * L * 0.8, 3 + L * 0.4, dz * L * 0.8);
        this.ursoNoArAte = this.tempo + (2 * v.y) / 9.81;
        this.eventos.push({ ...base, combo, empurrao: { x: 0, z: 0 } });
        this.eventos.push({ tipo: 'ursoDecolou', vel: v });
        this.bot?.decolar(v);
        this.cameraLenta(1.0);
      } else {
        this.eventos.push({ ...base, combo, empurrao: { x: dx * L, z: dz * L } });
        this.bot?.empurrar(dx * L, dz * L);
      }
    }
  }

  /** Ponto do eixo do urso mais perto da cápsula do Piranbenja (para onde ele vira para atacar). */
  private pontoMaisPertoDoUrso(pos: V3): V3 {
    const a = vec(pos.x, pos.y - 0.25, pos.z), b = vec(pos.x, pos.y + 0.25, pos.z);
    let m = Infinity, q = this.entrada.cabeca;
    for (const seg of this.esqueleto.segs) { const r = pertoEntreSegmentos(a, b, seg.a, seg.b), d = r.d - seg.r; if (d < m) { m = d; q = r.c2; } }
    return q;
  }

  /** Lugar para chegar perto do urso e atacar: ao lado da perna mais perto (o Piranbenja alcança as pernas). */
  private alvoJuntoAoUrso(pos: V3, folga = 0.15): V3 {
    let melhor: Segmento | null = null, md = Infinity;
    for (const seg of this.esqueleto.segs) if (seg.nome.startsWith('perna')) { const d = Math.hypot(pos.x - seg.a.x, pos.z - seg.a.z); if (d < md) { md = d; melhor = seg; } }
    const pe = melhor ? melhor.a : this.entrada.cabeca;
    const d = vec(pos.x - pe.x, 0, pos.z - pe.z), n = lenH(d) || 1, r = CORPO_URSO.raioPerna + PIRANBENJA.raio + folga;
    return vec(pe.x + (d.x / n) * r, 0, pe.z + (d.z / n) * r);
  }

  /** Distância da superfície do Piranbenja (cápsula em pé) até a superfície do urso. */
  private distanciaAoUrso(pos: V3): number {
    const a = vec(pos.x, pos.y - 0.25, pos.z), b = vec(pos.x, pos.y + 0.25, pos.z);
    let m = Infinity;
    for (const seg of this.esqueleto.segs) m = Math.min(m, pertoEntreSegmentos(a, b, seg.a, seg.b).d - seg.r - PIRANBENJA.raio);
    return m;
  }

  private grudados(): Piranbenja[] { return this.pbs.filter((p) => p.ragdoll?.grudado); }

  private grudar(p: Piranbenja, seg: Segmento, t: number, boca: V3): void {
    this.liberarDaFormacao(p);
    if (!p.ragdoll) this.entrarRagdoll(p, 0);
    const rd = p.ragdoll!;
    const { u, w, vv } = baseDoSegmento(seg, this.esqueleto.frente);
    const q = vec(seg.a.x + (seg.b.x - seg.a.x) * t, seg.a.y + (seg.b.y - seg.a.y) * t, seg.a.z + (seg.b.z - seg.a.z) * t);
    const d = sub(boca, q), nd = len(d) || 1;
    const nrm = vec(d.x / nd, d.y / nd, d.z / nd);
    rd.grudado = { seg: seg.nome, t, du: dot(nrm, u), dv: dot(nrm, vv), dw: dot(nrm, w), ultimo: null, rapidoDesde: 0 };
    rd.presa = 'cabeca'; rd.partes.cabeca.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
    p.estado = 'atacando'; p.ataqueTipo = 'morder';
    this.eventos.push({ tipo: 'grudou', numero: p.numero, parte: seg.nome });
  }

  private soltarGrudado(p: Piranbenja, vel: V3, como: 'sacudida' | 'arrancado'): void {
    const rd = p.ragdoll; if (!rd?.grudado) return;
    rd.grudado = null;
    if (rd.presa) { rd.partes[rd.presa].setBodyType(RAPIER.RigidBodyType.Dynamic, true); rd.presa = null; }
    if (como === 'sacudida') {
      for (const n of PARTES) rd.partes[n].setLinvel({ x: vel.x * 0.9, y: vel.y * 0.9 + 1.5, z: vel.z * 0.9 }, true);
      this.voar(p, 1.0, 0); p.cadeia = { derrubados: 0 };
    }
    rd.ate = this.tempo + 0.8; rd.quietoDesde = 0;
    this.atordoar(p, 1.5);
    this.eventos.push({ tipo: 'soltouGrudado', numero: p.numero, como });
  }

  /** Mantém a boca dos grudados na superfície da parte mordida; sacudir forte solta; cada um cansa o urso. */
  private segurarGrudados(dt: number): void {
    for (const p of this.grudados()) {
      const rd = p.ragdoll!, g = rd.grudado!;
      const seg = this.esqueleto.segs.find((s) => s.nome === g.seg); if (!seg) continue;
      const { u, w, vv } = baseDoSegmento(seg, this.esqueleto.frente);
      const q = vec(seg.a.x + (seg.b.x - seg.a.x) * g.t, seg.a.y + (seg.b.y - seg.a.y) * g.t, seg.a.z + (seg.b.z - seg.a.z) * g.t);
      const nrm = vec(u.x * g.du + vv.x * g.dv + w.x * g.dw, u.y * g.du + vv.y * g.dv + w.y * g.dw, u.z * g.du + vv.z * g.dv + w.z * g.dw);
      const nn = len(nrm) || 1, raio = seg.r + LAYOUT_PARTES.cabeca.r + 0.01;
      const cabeca = vec(q.x + (nrm.x / nn) * raio, q.y + (nrm.y / nn) * raio, q.z + (nrm.z / nn) * raio);
      const vel = g.ultimo ? vec((cabeca.x - g.ultimo.x) / dt, (cabeca.y - g.ultimo.y) / dt, (cabeca.z - g.ultimo.z) / dt) : vec(0, 0, 0);
      g.ultimo = cabeca;
      if (len(vel) > SACUDIDA) { if (!g.rapidoDesde) g.rapidoDesde = this.tempo; } else g.rapidoDesde = 0;
      if (g.rapidoDesde && this.tempo - g.rapidoDesde >= 0.1) { this.soltarGrudado(p, vel, 'sacudida'); continue; }
      rd.partes.cabeca.setNextKinematicTranslation(this.foraDoUrso(cabeca, LAYOUT_PARTES.cabeca.r));
      if (this.rodada === 'luta') this.ursoRes = Math.max(0, this.ursoRes - EQUILIBRIO.grudadoPorSegundo * dt);
    }
  }

  /** Para partes presas (na pata ou pela boca): se o lugar desejado cai dentro de outra parte do urso, empurra para fora. */
  private foraDoUrso(p: V3, raio: number): V3 {
    let q = { ...p };
    for (let volta = 0; volta < 3; volta++) {
      let mexeu = false;
      for (const seg of this.esqueleto.segs) {
        const { q: c } = pertoNoSegmento(q, seg.a, seg.b), d = len(sub(q, c)), pen = seg.r + raio + 0.005 - d;
        if (pen <= 0) continue;
        const n = d > 1e-4 ? vec((q.x - c.x) / d, (q.y - c.y) / d, (q.z - c.z) / d) : vec(this.esqueleto.frente.x, 0, this.esqueleto.frente.z);
        q = vec(q.x + n.x * pen, q.y + n.y * pen, q.z + n.z * pen); mexeu = true;
      }
      if (!mexeu) break;
    }
    return q;
  }

  /** Ninguém entra dentro do urso: quem encosta é empurrado para fora devagar (sem dano). */
  private afastarDoUrso(): void {
    const segs = this.esqueleto.segs, u = this.entrada.cabeca;
    // até três passadas: quem fica entre duas partes (entre as pernas, entre o braço e a barriga) sai das duas
    const empurrar = (corpo: RAPIER.RigidBody, eixo: V3, raio: number, noChao: boolean) => {
      let total = 0;
      for (let i = 0; i < 3; i++) { const m = empurrarUmaVez(corpo, eixo, raio, noChao); total = Math.max(total, m); if (m <= 0.002) break; }
      return total;
    };
    const empurrarUmaVez = (corpo: RAPIER.RigidBody, eixo: V3, raio: number, noChao: boolean) => {
      const t = corpo.translation();
      const a = vec(t.x - eixo.x, t.y - eixo.y, t.z - eixo.z), b = vec(t.x + eixo.x, t.y + eixo.y, t.z + eixo.z);
      let dx = 0, dy = 0, dz = 0, soPata = true;
      for (const seg of segs) {
        const r = pertoEntreSegmentos(a, b, seg.a, seg.b), pen = seg.r + raio - r.d;
        if (pen <= 0.002) continue;
        if (!seg.nome.startsWith('pata')) soPata = false;
        let n = r.d > 1e-4 ? vec((r.c1.x - r.c2.x) / r.d, (r.c1.y - r.c2.y) / r.d, (r.c1.z - r.c2.z) / r.d) : vec(t.x - u.x, 0, t.z - u.z);
        if (noChao && n.y < 0) n = vec(n.x, 0, n.z); // no chão, empurra para o lado, nunca para dentro do chão
        if (lenH(n) < 0.3 && n.y <= 0) n = vec(t.x - u.x || 0.01, 0, t.z - u.z); // urso caindo bem em cima: sai para o lado
        const nn = len(n) || 1; n = vec(n.x / nn, n.y / nn, n.z / nn);
        dx += n.x * pen; dy += n.y * pen; dz += n.z * pen;
      }
      if (!dx && !dy && !dz) return 0;
      corpo.setTranslation({ x: t.x + dx, y: t.y + dy, z: t.z + dz }, true);
      const v = corpo.linvel(), m = Math.hypot(dx, dy, dz), n = vec(dx / m, dy / m, dz / m);
      const vn = v.x * n.x + v.y * n.y + v.z * n.z;
      // tira a parte da velocidade que entra no urso e dá um empurrão leve para fora (no máximo 1,2 m/s)
      // a pata não empurra (C19): só não deixa entrar, para dar para agarrar quem está encostado
      const novo = soPata ? Math.max(0, vn) : Math.min(1.2, Math.max(0.25, -vn * 0.3));
      const k = novo - vn;
      corpo.setLinvel({ x: v.x + n.x * k, y: v.y + n.y * k, z: v.z + n.z * k }, true);
      return m;
    };
    for (const p of this.pbs) {
      if (p.agarradoPor && !p.ragdoll) continue;
      if (!p.ragdoll) {
        const r = p.corpo.rotation(), eixo = girar(r, vec(0, PIRANBENJA.altura / 2 - PIRANBENJA.raio, 0));
        this.maiorEntrada = Math.max(this.maiorEntrada, empurrar(p.corpo, eixo, PIRANBENJA.raio, p.corpo.translation().y < 0.6));
        continue;
      }
      for (const nome of PARTES) {
        const b = p.ragdoll.partes[nome]; if (!b.isDynamic()) continue;
        const L = LAYOUT_PARTES[nome], eixo = girar(b.rotation(), vec(0, L.hh, 0));
        this.maiorEntrada = Math.max(this.maiorEntrada, empurrar(b, eixo, L.r, b.translation().y < 0.3));
      }
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
      urso: { res: Math.round(this.ursoRes), aura: Math.round(this.ursoAura), grudados: this.grudados().length },
      piranbenjas: this.pbs.map((p) => {
        const r = this.corpoDe(p).rotation();
        let partes: Record<Parte, PoseParte> | null = null;
        if (p.ragdoll) {
          partes = {} as Record<Parte, PoseParte>;
          for (const n of PARTES) { const b = p.ragdoll.partes[n], t = b.translation(), q = b.rotation(); partes[n] = { pos: vec(t.x, t.y, t.z), rot: [q.x, q.y, q.z, q.w] }; }
        }
        const atacando = p.estado === 'armando' || p.estado === 'atacando' || !!p.ragdoll?.grudado;
        return {
          numero: p.numero, pos: this.posDe(p), rot: [r.x, r.y, r.z, r.w], voando: this.tempo < p.voandoAte, agarrado: !!p.agarradoPor,
          estado: p.estado, ataque: atacando ? (p.ataqueTipo === 'soco' ? 'socar' : p.ataqueTipo) : null,
          achatado: this.tempo < p.achatadoAte, partes, grudado: !!p.ragdoll?.grudado,
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
  testePedirAtaque(numero: number, tipo: AtaquePB): void { const p = this.pbs.find((x) => x.numero === numero); if (p) p.ataquePedido = tipo; }
  testeVelocidade(numero: number): number { const p = this.pbs.find((x) => x.numero === numero); return p ? len(this.velDe(p)) : 0; }
  testeGiro(numero: number): V3 { const p = this.pbs.find((x) => x.numero === numero); const w = p ? this.corpoDe(p).angvel() : { x: 0, y: 0, z: 0 }; return vec(w.x, w.y, w.z); }
  testeEstado(numero: number): { estado: EstadoIA; atordoadoPor: number; ragdoll: boolean; formacao: boolean } | null {
    const p = this.pbs.find((x) => x.numero === numero);
    return p ? { estado: p.estado, atordoadoPor: Math.max(0, p.atordoadoAte - this.tempo), ragdoll: !!p.ragdoll, formacao: p.naFormacao } : null;
  }
  testeCriarClones(n: number, simples = false): number { return this.espalharClones(n, false, simples); }
  testeGrudados(): { numero: number; parte: SegUrso }[] { return this.grudados().map((p) => ({ numero: p.numero, parte: p.ragdoll!.grudado!.seg })); }
  /** Quanto alguém está dentro do urso agora (m): cápsulas e partes dos bonecos soltos contra os segmentos do corpo. */
  ultimaSobreposicao = '';
  testeSobreposicao(ignorarAgarrados = false): number {
    let m = 0;
    let quem = '';
    const medir = (c: V3, eixo: V3, r: number, nome = '') => {
      const a = vec(c.x - eixo.x, c.y - eixo.y, c.z - eixo.z), b = vec(c.x + eixo.x, c.y + eixo.y, c.z + eixo.z);
      for (const seg of this.esqueleto.segs) { const pen = seg.r + r - pertoEntreSegmentos(a, b, seg.a, seg.b).d; if (pen > m) { m = pen; quem = nome + '×' + seg.nome; } }
    };
    for (const p of this.pbs) {
      if (!p.ragdoll) { if (!p.agarradoPor) { const t = p.corpo.translation(); medir(vec(t.x, t.y, t.z), girar(p.corpo.rotation(), vec(0, 0.25, 0)), PIRANBENJA.raio, 'capsula'); } continue; }
      if (ignorarAgarrados && p.agarradoPor) continue;
      for (const n of PARTES) { const b = p.ragdoll.partes[n], t = b.translation(), L = LAYOUT_PARTES[n]; medir(vec(t.x, t.y, t.z), girar(b.rotation(), vec(0, L.hh, 0)), L.r, n + (b.isDynamic() ? '' : '(fixa)') + (p.agarradoPor ? '/agarrado' : p.ragdoll.grudado ? '/grudado' : '')); }
    }
    if (m > 0.03) this.ultimaSobreposicao = quem + ' ' + m.toFixed(2);
    return m;
  }
  testeEhOriginal(numero: number): boolean { return this.pbs.find((p) => p.numero === numero)?.original ?? false; }
}
