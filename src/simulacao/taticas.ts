// Táticas do técnico (conversa "Programação por blocos e IA dos clones", D-300 a D-499).
// Uma tática é um JSON com uma lista fechada de blocos. Ela é conferida (conferirTatica) e interpretada aqui;
// nunca vira código executado (D-304). Roda só no PC: o Quest nunca recebe a tática (D-221).
// O Tecnico entrega um "cérebro" para luta.definirCerebro (D-501). A física continua sendo da Luta:
// aqui só se decide para onde cada clone vai e o que ele tenta fazer.
//
// Regras do técnico (D-300 a D-302): chapéu (quando) + quem + condições + ações.
// - "Somar regras" ligado: o clone soma os movimentos de todas as regras que servem para ele; ações que brigam
//   entre si (atacar, parar, rolar, distrair, catapulta, "pensar sozinho") não se somam: vale a regra mais alta.
// - "Somar regras" desligado: vale só a primeira regra que serve.
// - Cada clone reage com atraso (0,2 a 1,2 s) e obedece ~80% das vezes (D-091); sem ordem, segue a IA mínima.
// - O original no automático recebe as ordens como qualquer clone, sem proteção especial (D-324).
// - IA esperta (C28): com uma tática ligada, clone complexo (e o original no automático) sem regra que sirva, ou com o
//   bloco "pensar sozinho", decide sozinho: rodeia
//   para as costas do urso, ataca em turnos as pernas, chuta o urso sentado, cabeceia o urso no ar, aproveita
//   quando ele agarra ou fica tonto, empurra para a borda e foge quando está machucado.
// C28: cada clone tem um código fixo (D-327); os grupos seguem o código, sem reconhecer pela posição.

import type { AtaquePB, Cerebro, DecisaoTatica, OrdemClone, PedidoFormacao, VisaoTatica } from './luta';
import { DISTRACOES, MIRAS, PIRANBENJA, RINGUE, TIPOS_FORMACAO, TOTAL_PALAVRAS, type Distracao, type Mira, type TipoFormacao, type V3 } from './regras';

export const GRUPOS = ['alpha', 'beta', 'gamma', 'sigma'] as const;
export type Grupo = typeof GRUPOS[number];
/** Cores dos grupos (só no PC). */
export const COR_GRUPO: Record<Grupo, string> = { alpha: '#4f9bff', beta: '#ff9a3d', gamma: '#5fd35f', sigma: '#b07cff' };
export const MAX_BLOCOS = 50;          // D-305 (teste)
export const PENSAR_A_CADA = 0.25;     // s (a Luta pergunta neste ritmo)
export const REACAO = { min: 0.2, max: 1.2, simples: 1.3 }; // D-091; clone simples reage 30% mais devagar
export const OBEDIENCIA = 0.8;         // D-091
export const DESOBEDECE = 3;           // s que dura uma desobediência (depois sorteia de novo)
export const DURA_SINAL = 3;           // s em que o chapéu "quando receber o sinal" vale, por padrão
export const DURA_COMECO = 3;          // s do chapéu "quando a tática começa"
export const RECARGA_FORMAR = 3;       // s entre dois pedidos de formação
export const RECARGA_CLONES = 2;       // s entre dois pedidos de clones
export const RECARGA_GRITO = 3;        // s entre dois gritos pedidos pela tática
export const RECUAR_DEPOIS = 1.5;      // s recuando depois de "atacar e depois recuar"
/** IA esperta (C28): quantos complexos atacam ao mesmo tempo, distância de espera e quando fugir. */
export const ESPERTO = { atacantes: 5, espera: 1.6, machucado: 0.4, borda: 2, ursoFraco: 25, morderAte: 30 };

/** Palavras-código dos sinais (aprovadas em C26); o nome pertence à tecla, não à tática. */
export const PALAVRAS_CODIGO: { pt: string; en: string }[] = [
  { pt: 'Tubarão Relâmpago', en: 'Lightning Shark' }, { pt: 'Abacaxi Supremo', en: 'Supreme Pineapple' },
  { pt: 'Pastel Dimensional', en: 'Dimensional Pastry' }, { pt: 'Torpedo de Sushi', en: 'Sushi Torpedo' },
  { pt: 'Olhar do Baiacu', en: 'Pufferfish Glare' }, { pt: 'Despertar das Barbatanas', en: 'Fin Awakening' },
  { pt: 'Tempestade de Escamas', en: 'Scale Storm' }, { pt: 'Ninja de Aquário', en: 'Aquarium Ninja' },
  { pt: 'Kaiju de Bolso', en: 'Pocket Kaiju' }, { pt: 'Rugido do Mar Profundo', en: 'Deep Sea Roar' },
  { pt: 'Punho do Bolinho de Arroz', en: 'Rice Ball Fist' }, { pt: 'Lâmina da Maré Final', en: 'Final Tide Blade' },
];

// ---------------- os blocos (lista fechada) ----------------
export type Chapeu =
  | { b: 'sempre' }
  | { b: 'sinal'; sinal: number; dura?: number }    // sinal 0..3 (teclas U, I, O, P)
  | { b: 'comeco'; dura?: number };                 // nos primeiros segundos da tática
export type Quem =
  | { b: 'todos' } | { b: 'clones' } | { b: 'original' }
  | { b: 'complexos' } | { b: 'simples' } | { b: 'armadilhas' }
  | { b: 'grupo'; grupo: Grupo }
  | { b: 'pertoDoUrso'; m: number } | { b: 'longeDoUrso'; m: number } | { b: 'pertoDoOriginal'; m: number }
  | { b: 'maisPertoDoUrso'; n: number }
  | { b: 'acabouDeNascer'; s: number } | { b: 'nascidoHa'; s: number }
  | { b: 'machucado' } | { b: 'grudados' } | { b: 'noAr' }
  | { b: 'atrasDoUrso' } | { b: 'frenteDoUrso' }
  | { b: 'livre' };                                  // não está tonto, caído, voando nem em formação
export type Cond =
  | { b: 'ursoSentado' } | { b: 'ursoTonto' } | { b: 'ursoNoAr' } | { b: 'ursoAgarrando' }
  | { b: 'ursoFraco'; res: number } | { b: 'ursoNaBorda'; m: number } | { b: 'equilibrio'; maisDe: number }
  | { b: 'ursoFurioso' } | { b: 'ursoHumano' }       // D-307: o urso ainda não tem esses modos (sempre falso)
  | { b: 'originalMachucado'; res: number } | { b: 'originalNoAr' }
  | { b: 'agua'; maisDe: number } | { b: 'clonesVivos'; maisDe: number } | { b: 'tempo'; maisDe: number }
  | { b: 'temFormacao'; tipo: TipoFormacao } | { b: 'chance'; pct: number }
  | { b: 'nao'; c: Cond } | { b: 'ou'; a: Cond; c: Cond };
export type Acao =
  | { b: 'atacar'; ataque: AtaquePB; mirar?: Mira; depois?: 'recuar' }
  | { b: 'aproximar' } | { b: 'recuar' } | { b: 'parar' } | { b: 'rolar' }
  | { b: 'rodear'; m: number; sentido: 1 | -1 }
  | { b: 'juntarNoOriginal' } | { b: 'espalhar' } | { b: 'irPara'; x: number; z: number }
  | { b: 'catapulta' } | { b: 'distrair'; tipo: Distracao } | { b: 'esperto' }
  | { b: 'formar'; tipo: TipoFormacao; perto?: 'urso' | 'original'; grupo?: Grupo }
  | { b: 'criarClones'; quantos: number; simples: boolean }
  | { b: 'gritar'; palavra: number };
export interface Regra { quando: Chapeu; quem: Quem[]; se: Cond[]; fazer: Acao[] }
/** original: checkboxes do Quadro para o original no automático (D-310). */
export interface Tatica { versao: 1; nome: { pt: string; en: string }; somar: boolean; original: { gerarClones: boolean; usarItens: boolean }; regras: Regra[] }

// ---------------- conferência (nada fora da lista passa) ----------------
type Resultado = { ok: true; tatica: Tatica; blocos: number } | { ok: false; erro: string };
const ATAQUES: AtaquePB[] = ['morder', 'tapa', 'soco', 'cabecada', 'chute'];
class Recusa extends Error {}
const obj = (x: unknown, onde: string): Record<string, unknown> => { if (!x || typeof x !== 'object' || Array.isArray(x)) throw new Recusa(`${onde}: esperava um bloco`); return x as Record<string, unknown>; };
const numero = (x: unknown, min: number, max: number, onde: string, padrao?: number): number => {
  if (x === undefined && padrao !== undefined) return padrao;
  if (typeof x !== 'number' || !Number.isFinite(x)) throw new Recusa(`${onde}: número inválido`);
  return Math.min(max, Math.max(min, x));
};
const umDe = <T extends string>(x: unknown, lista: readonly T[], onde: string): T => { if (!lista.includes(x as T)) throw new Recusa(`${onde}: valor fora da lista`); return x as T; };
const texto = (x: unknown, onde: string): string => { if (typeof x !== 'string') throw new Recusa(`${onde}: texto inválido`); return x.slice(0, 40); };

function conferirChapeu(x: unknown): Chapeu {
  const o = obj(x, 'quando');
  if (o.b === 'sempre') return { b: 'sempre' };
  if (o.b === 'sinal') return { b: 'sinal', sinal: Math.round(numero(o.sinal, 0, 3, 'sinal')), dura: numero(o.dura, 0.5, 10, 'sinal', DURA_SINAL) };
  if (o.b === 'comeco') return { b: 'comeco', dura: numero(o.dura, 0.5, 30, 'começo', DURA_COMECO) };
  throw new Recusa('quando: bloco desconhecido');
}
function conferirQuem(x: unknown): Quem {
  const o = obj(x, 'quem');
  switch (o.b) {
    case 'todos': case 'clones': case 'original': case 'complexos': case 'simples': case 'armadilhas': case 'livre':
    case 'machucado': case 'grudados': case 'noAr': case 'atrasDoUrso': case 'frenteDoUrso': return { b: o.b };
    case 'grupo': return { b: 'grupo', grupo: umDe(o.grupo, GRUPOS, 'grupo') };
    case 'pertoDoUrso': case 'longeDoUrso': case 'pertoDoOriginal': return { b: o.b, m: numero(o.m, 0.5, 12, String(o.b)) };
    case 'maisPertoDoUrso': return { b: 'maisPertoDoUrso', n: Math.round(numero(o.n, 1, 30, 'mais perto')) };
    case 'acabouDeNascer': case 'nascidoHa': return { b: o.b, s: numero(o.s, 0.5, 120, String(o.b)) };
  }
  throw new Recusa('quem: bloco desconhecido');
}
function conferirCond(x: unknown, fundo = 0): Cond {
  if (fundo > 4) throw new Recusa('condição: encaixes demais');
  const o = obj(x, 'se');
  switch (o.b) {
    case 'ursoSentado': case 'ursoTonto': case 'ursoNoAr': case 'ursoAgarrando': case 'ursoFurioso': case 'ursoHumano': case 'originalNoAr': return { b: o.b };
    case 'ursoFraco': return { b: 'ursoFraco', res: numero(o.res, 0, 100, 'urso fraco') };
    case 'originalMachucado': return { b: 'originalMachucado', res: numero(o.res, 0, 100, 'original machucado') };
    case 'ursoNaBorda': return { b: 'ursoNaBorda', m: numero(o.m, 0, RINGUE.raio, 'urso na borda') };
    case 'equilibrio': case 'agua': return { b: o.b, maisDe: numero(o.maisDe, 0, 100, String(o.b)) };
    case 'clonesVivos': return { b: 'clonesVivos', maisDe: Math.round(numero(o.maisDe, 0, 30, 'clones vivos')) };
    case 'tempo': return { b: 'tempo', maisDe: numero(o.maisDe, 0, 900, 'tempo') };
    case 'temFormacao': return { b: 'temFormacao', tipo: umDe(o.tipo, TIPOS_FORMACAO, 'formação') };
    case 'chance': return { b: 'chance', pct: numero(o.pct, 0, 100, 'chance') };
    case 'nao': return { b: 'nao', c: conferirCond(o.c, fundo + 1) };
    case 'ou': return { b: 'ou', a: conferirCond(o.a, fundo + 1), c: conferirCond(o.c, fundo + 1) };
  }
  throw new Recusa('se: bloco desconhecido');
}
function conferirAcao(x: unknown): Acao {
  const o = obj(x, 'fazer');
  switch (o.b) {
    case 'atacar': {
      const a: Acao = { b: 'atacar', ataque: umDe(o.ataque, ATAQUES, 'ataque') };
      if (o.mirar !== undefined) a.mirar = umDe(o.mirar, MIRAS, 'mirar');
      if (o.depois === 'recuar') a.depois = 'recuar';
      return a;
    }
    case 'aproximar': case 'recuar': case 'parar': case 'rolar': case 'juntarNoOriginal': case 'espalhar': case 'catapulta': case 'esperto': return { b: o.b };
    case 'rodear': return { b: 'rodear', m: numero(o.m, 1, 5, 'rodear'), sentido: o.sentido === -1 ? -1 : 1 };
    case 'irPara': return { b: 'irPara', x: numero(o.x, -RINGUE.raio, RINGUE.raio, 'ir para'), z: numero(o.z, -RINGUE.raio, RINGUE.raio, 'ir para') };
    case 'distrair': return { b: 'distrair', tipo: umDe(o.tipo, DISTRACOES, 'distração') };
    case 'formar': {
      const a: Acao = { b: 'formar', tipo: umDe(o.tipo, TIPOS_FORMACAO, 'formação') };
      if (o.perto !== undefined) a.perto = umDe(o.perto, ['urso', 'original'] as const, 'perto');
      if (o.grupo !== undefined) a.grupo = umDe(o.grupo, GRUPOS, 'grupo');
      return a;
    }
    case 'criarClones': return { b: 'criarClones', quantos: Math.round(numero(o.quantos, 1, 8, 'criar clones')), simples: o.simples === true };
    case 'gritar': return { b: 'gritar', palavra: Math.round(numero(o.palavra, 0, TOTAL_PALAVRAS - 1, 'gritar')) };
  }
  throw new Recusa('fazer: bloco desconhecido');
}
const contarCond = (c: Cond): number => c.b === 'nao' ? 1 + contarCond(c.c) : c.b === 'ou' ? 1 + contarCond(c.a) + contarCond(c.c) : 1;
export function contarBlocos(t: Tatica): number {
  return t.regras.reduce((s, r) => s + 1 + r.quem.length + r.se.reduce((a, c) => a + contarCond(c), 0) + r.fazer.length, 0);
}

/** Confere um JSON vindo do Quadro (ou de um arquivo) e devolve uma tática limpa, ou o motivo da recusa. */
export function conferirTatica(x: unknown): Resultado {
  try {
    const o = obj(x, 'tática');
    if (o.versao !== 1) throw new Recusa('tática: versão desconhecida');
    const n = obj(o.nome, 'nome');
    if (!Array.isArray(o.regras)) throw new Recusa('tática: sem regras');
    if (o.regras.length > MAX_BLOCOS) throw new Recusa(`tática: mais de ${MAX_BLOCOS} blocos`);
    const lista = <T>(v: unknown, f: (y: unknown) => T, onde: string): T[] => { if (v === undefined) return []; if (!Array.isArray(v) || v.length > MAX_BLOCOS) throw new Recusa(`${onde}: lista inválida`); return v.map(f); };
    const regras: Regra[] = o.regras.map((r) => { const q = obj(r, 'regra'); return { quando: conferirChapeu(q.quando), quem: lista(q.quem, conferirQuem, 'quem'), se: lista(q.se, (c) => conferirCond(c), 'se'), fazer: lista(q.fazer, conferirAcao, 'fazer') }; });
    const orig = o.original && typeof o.original === 'object' ? o.original as Record<string, unknown> : {};
    const t: Tatica = { versao: 1, nome: { pt: texto(n.pt, 'nome'), en: texto(n.en, 'nome') }, somar: o.somar !== false,
      original: { gerarClones: orig.gerarClones !== false, usarItens: orig.usarItens !== false }, regras };
    const blocos = contarBlocos(t);
    if (blocos > MAX_BLOCOS) throw new Recusa(`tática: ${blocos} blocos (máximo ${MAX_BLOCOS})`);
    return { ok: true, tatica: t, blocos };
  } catch (e) {
    if (e instanceof Recusa) return { ok: false, erro: e.message };
    return { ok: false, erro: 'tática inválida' };
  }
}

// ---------------- o técnico (interpretador) ----------------
/** Quem está em campo, do ponto de vista da tática (clone ou o original). */
interface Agente {
  numero: number; codigo: number; pos: V3; original: boolean; simples: boolean; armadilha: boolean; livre: boolean; estado: string;
  dUrso: number; resFrac: number; grudado: boolean; noAr: boolean; idade: number;
  /** cosseno entre a frente do urso e a direção urso → este (1 = bem na frente, −1 = bem nas costas). */
  frente: number; r: Rastro;
}
/** Memória de cada Piranbenja entre uma pergunta e outra, pelo código fixo (D-327). */
interface Rastro {
  grupo: Grupo;
  tipo: string; ordem: OrdemClone | null;              // decisão em vigor
  pendente: { tipo: string; ordem: OrdemClone | null } | null; valeEm: number; ignora: boolean; ignoraAte: number;
  recuarAte: number; estadoAntes: string;
}
const dist = (a: V3, b: V3) => Math.hypot(a.x - b.x, a.z - b.z);
/** Frente do urso pelo giro (0 = olhando para −z), no chão. */
const frenteDoGiro = (g: number) => ({ x: -Math.sin(g), z: -Math.cos(g) });

export class Tecnico {
  tatica: Tatica | null = null;
  /** Grupo de quem nascer agora (clone sem grupo escolhido entra no alpha, C26). */
  grupoDosNovos: Grupo = 'alpha';
  /** O original está no automático (Tab)? Só então as ações do original contam como do técnico. */
  automatico = false;
  readonly cerebro: Cerebro = (v) => this.pensar(v);
  /** Avisa o PC quando um sinal é dado (painel e evento "fala"). */
  aoSinal: ((i: number) => void) | null = null;
  private rastros = new Map<number, Rastro>(); // código fixo → rastro
  private codigoDoNumero = new Map<number, number>();
  private sinalEm = [-1e9, -1e9, -1e9, -1e9];
  private sinaisNovos: number[] = [];
  private comecouEm: number | null = null;
  private formarEm = 0; private clonesEm = 0; private gritoEm = -1e9;
  private tempo = 0;

  constructor(private aleatorio: () => number = Math.random) {}

  /** Troca a tática em campo (teclas 1 a 4). null = sem tática: todos na IA mínima (as opções do teste valem).
   *  Com tática, complexo sem regra que sirva pensa sozinho (IA esperta). */
  trocar(t: Tatica | null): void { this.tatica = t; this.comecouEm = null; for (const r of this.rastros.values()) { r.tipo = ''; r.ordem = null; r.pendente = null; } }
  /** O jogador apertou a tecla de um sinal (U, I, O, P). */
  sinal(i: number): void { if (i >= 0 && i <= 3) { this.sinaisNovos.push(i); this.aoSinal?.(i); } }
  /** Grupo de um Piranbenja pelo número atual da rede (para o PC pintar). */
  grupoDe(numero: number): Grupo | null { const c = this.codigoDoNumero.get(numero); return c === undefined ? null : this.rastros.get(c)?.grupo ?? null; }
  /** Quantos clones há em cada grupo (para o painel do PC). */
  contarGrupos(): Record<Grupo, number> { const c = { alpha: 0, beta: 0, gamma: 0, sigma: 0 }; for (const r of this.rastros.values()) c[r.grupo]++; return c; }
  /** Muda o grupo de um Piranbenja (pintar na mini-grade). */
  pintar(numero: number, g: Grupo): void { const c = this.codigoDoNumero.get(numero); const r = c === undefined ? null : this.rastros.get(c); if (r) r.grupo = g; }

  private pensar(v: VisaoTatica): DecisaoTatica {
    this.tempo = v.tempo;
    for (const i of this.sinaisNovos) this.sinalEm[i] = v.tempo;
    this.sinaisNovos = [];
    const agentes = this.reconhecer(v);
    const t = this.tatica;
    if (t && this.comecouEm === null) this.comecouEm = v.tempo;
    const decisao: DecisaoTatica = { ordens: {} };
    let formar: Extract<Acao, { b: 'formar' }> | null = null, criar: Extract<Acao, { b: 'criarClones' }> | null = null, gritar: number | null = null;
    const porDistancia = [...agentes].sort((a, b) => a.dUrso - b.dUrso).map((a) => a.codigo);
    const turno = this.escolherTurno(agentes, v);
    const ativas = (t?.regras ?? []).map((r, i) => ({ r, i, vale: this.chapeuVale(r.quando, v) && r.se.every((c) => temChance(c) || this.cond(c, v, null, i)) }));
    for (const ag of agentes) {
      const servem = ativas.filter((x) => x.vale && x.r.quem.every((q) => this.quem(q, ag, v, porDistancia)) && x.r.se.every((c) => !temChance(c) || this.cond(c, v, ag, x.i)));
      const usadas = t?.somar ? servem : servem.slice(0, 1);
      let exclusiva: { tipo: string; ordem: OrdemClone } | null = null;
      let mx = 0, mz = 0, moveu = false;
      for (const { r } of usadas) {
        for (const a of r.fazer) {
          // ações do time (valem uma vez, não por clone)
          if (a.b === 'formar') { formar ??= a; continue; }
          if (a.b === 'criarClones') { criar ??= a; continue; }
          if (a.b === 'gritar') { gritar ??= a.palavra; continue; }
          const e = this.exclusiva(a, ag, v, turno);
          if (e) { if (!exclusiva) exclusiva = e; continue; }
          const f = this.forca(a, ag, v, agentes); if (f) { mx += f.x; mz += f.z; moveu = true; }
        }
      }
      // "atacar e depois recuar": depois que o ataque sai, recua por um tempo
      if (ag.r.recuarAte > v.tempo) exclusiva = { tipo: 'recuar', ordem: { recuar: true } };
      if (exclusiva) { this.decidir(ag, exclusiva.tipo, exclusiva.ordem); continue; }
      if (moveu) {
        const n = Math.hypot(mx, mz);
        if (n < 0.05) { this.decidir(ag, 'parar', { parar: true }); continue; }
        const passo = Math.min(2, n * 2);
        this.decidir(ag, 'mover', { ir: { x: ag.pos.x + (mx / n) * passo, y: 0, z: ag.pos.z + (mz / n) * passo } });
        continue;
      }
      // sem regra: o complexo (e o original no automático) pensa sozinho; o simples fica na IA mínima
      if (t && !usadas.length && !ag.simples && !ag.armadilha) { const e = this.esperto(ag, v, turno); this.decidir(ag, e.tipo, e.ordem); continue; }
      this.decidir(ag, '', null);
    }
    for (const ag of agentes) { const o = ag.r.ordem; if (o) decisao.ordens![ag.numero] = o; }
    // ações do time, sem repetir o pedido o tempo todo
    if (formar && v.tempo >= this.formarEm && !v.formacoes.some((f) => f.tipo === formar!.tipo)) {
      const pedido: PedidoFormacao = { tipo: formar.tipo };
      if (formar.perto) pedido.perto = formar.perto;
      if (formar.grupo) pedido.com = agentes.filter((a) => !a.original && a.r.grupo === formar!.grupo).map((a) => a.codigo);
      decisao.formar = pedido.perto || pedido.com ? pedido : formar.tipo;
      this.formarEm = v.tempo + RECARGA_FORMAR;
    }
    if (criar && t?.original.gerarClones && v.tempo >= this.clonesEm) { decisao.criarClones = { quantos: criar.quantos, simples: criar.simples }; this.clonesEm = v.tempo + RECARGA_CLONES; }
    if (gritar !== null && v.tempo - this.gritoEm >= RECARGA_GRITO) { decisao.falar = gritar; this.gritoEm = v.tempo; }
    return decisao;
  }

  /** Cada Piranbenja pelo código fixo (D-327); quem nasceu agora entra no grupo escolhido. */
  private reconhecer(v: VisaoTatica): Agente[] {
    const lista: Agente[] = [], vivos = new Set<number>(), u = v.urso, f = frenteDoGiro(u.giro);
    this.codigoDoNumero.clear();
    const frente = (p: V3) => { const dx = p.x - u.cabeca.x, dz = p.z - u.cabeca.z, n = Math.hypot(dx, dz) || 1; return (dx * f.x + dz * f.z) / n; };
    const pegar = (codigo: number) => { let r = this.rastros.get(codigo); if (!r) { r = { grupo: this.grupoDosNovos, tipo: '', ordem: null, pendente: null, valeEm: 0, ignora: false, ignoraAte: 0, recuarAte: 0, estadoAntes: '' }; this.rastros.set(codigo, r); } vivos.add(codigo); return r; };
    for (const p of v.clones) {
      const r = pegar(p.codigo);
      // ataque saiu: começa o recuo de "atacar e depois recuar"
      if (p.estado === 'atacando' && r.estadoAntes !== 'atacando' && r.ordem?.atacar && r.tipo.endsWith(':recuar')) r.recuarAte = v.tempo + RECUAR_DEPOIS;
      r.estadoAntes = p.estado;
      this.codigoDoNumero.set(p.numero, p.codigo);
      const livre = !p.emFormacao && !p.grudado && !['atordoado', 'caido', 'projetil', 'formacao', 'escalando'].includes(p.estado);
      const resMax = p.simples ? PIRANBENJA.resClone / 2 : PIRANBENJA.resClone;
      lista.push({ numero: p.numero, codigo: p.codigo, pos: p.pos, original: false, simples: p.simples, armadilha: p.armadilha, livre, estado: p.estado,
        dUrso: p.distanciaAoUrso, resFrac: p.res / resMax, grudado: p.grudado, noAr: p.noAr, idade: p.idade, frente: frente(p.pos), r });
    }
    if (v.original) {
      const o = v.original, r = pegar(o.codigo);
      this.codigoDoNumero.set(o.numero, o.codigo);
      lista.push({ numero: o.numero, codigo: o.codigo, pos: o.pos, original: true, simples: false, armadilha: false, livre: !o.noAr, estado: 'andando',
        dUrso: dist(o.pos, u.cabeca), resFrac: o.res / PIRANBENJA.resOriginal, grudado: false, noAr: o.noAr, idade: v.tempo, frente: frente(o.pos), r });
    }
    for (const c of [...this.rastros.keys()]) if (!vivos.has(c)) this.rastros.delete(c); // derreteu
    return lista;
  }

  /** Turno de ataque da IA esperta: os complexos livres melhor colocados (perto e nas costas do urso). */
  private escolherTurno(agentes: Agente[], v: VisaoTatica): Set<number> {
    const n = v.urso.sentado || v.urso.noAr || v.urso.agarrando || v.urso.tonto ? ESPERTO.atacantes + 3 : ESPERTO.atacantes;
    const cand = agentes.filter((a) => !a.simples && !a.armadilha && a.livre && a.resFrac >= ESPERTO.machucado && (!a.original || this.automatico));
    cand.sort((a, b) => (a.dUrso + a.frente * 0.6) - (b.dUrso + b.frente * 0.6));
    return new Set(cand.slice(0, n).map((a) => a.codigo));
  }

  /** IA esperta dos clones complexos (C28): aproveita as aberturas do urso e ataca em turnos pelas costas. */
  private esperto(ag: Agente, v: VisaoTatica, turno: Set<number>): { tipo: string; ordem: OrdemClone } {
    const u = v.urso, c = u.cabeca, p = ag.pos;
    const dx = p.x - c.x, dz = p.z - c.z, n = Math.hypot(dx, dz) || 1;
    // 1) machucado e perto: foge (rola se o urso está colado)
    if (ag.resFrac < ESPERTO.machucado && n < 2.5) return n < 1.4 ? { tipo: 'e:rolar', ordem: { rolar: true } } : { tipo: 'e:recuar', ordem: { recuar: true } };
    // 2) aberturas: no ar = cabeçada (malabarismo); sentado = chute (impacto vale o dobro); agarrando ou tonto = pernas
    if (u.noAr && n < 3.5) return { tipo: 'e:cabecada', ordem: { atacar: 'cabecada' } };
    if (u.sentado) return { tipo: 'e:chute', ordem: { atacar: 'chute', mirar: 'barriga' } };
    if ((u.agarrando || u.tonto) && n < 3) return { tipo: 'e:pernas', ordem: { atacar: 'soco', mirar: 'pernas' } };
    // 3) urso fraco ou perto da borda: chuta de dentro para fora (chega pelo lado do centro antes)
    const dc = Math.hypot(c.x, c.z);
    if (turno.has(ag.codigo) && (u.res < ESPERTO.ursoFraco || dc > RINGUE.raio - ESPERTO.borda) && dc > 0.5) {
      const cx = -c.x / dc, cz = -c.z / dc; // do urso para o centro
      if ((dx * cx + dz * cz) / n > 0.4) return { tipo: 'e:empurrar', ordem: { atacar: 'chute', mirar: 'barriga' } };
      return { tipo: 'e:posicionar', ordem: { ir: { x: c.x + cx * 1.6, y: 0, z: c.z + cz * 1.6 } } };
    }
    // 4) é a vez dele: com o urso forte, morde as pernas (dano que gruda e tira resistência, e ainda enche o equilíbrio);
    //    com o urso já fraco, soca as pernas; equilíbrio quase cheio, chuta a perna para ele sentar
    if (turno.has(ag.codigo)) {
      if (u.equilibrio > 60) return { tipo: 'e:chutePerna', ordem: { atacar: 'chute', mirar: 'pernas' } };
      if (u.res > ESPERTO.morderAte && !ag.original) return { tipo: 'e:morder', ordem: { atacar: 'morder', mirar: 'pernas' } };
      return { tipo: 'e:pernas', ordem: { atacar: 'soco', mirar: 'pernas' } };
    }
    // 5) esperando a vez: rodeia para as costas do urso, espalhado (junto, o urso pega todos de tabela)
    const f = frenteDoGiro(u.giro), lado = (sorteioFixo(ag.codigo, 7, 0) - 0.5) * 2.2; // cada um num ângulo das costas
    const atras = Math.atan2(-f.z, -f.x) + lado;
    const alvo = { x: c.x + Math.cos(atras) * ESPERTO.espera, z: c.z + Math.sin(atras) * ESPERTO.espera };
    const r = Math.hypot(alvo.x, alvo.z), m = RINGUE.raio - 0.8; if (r > m) { alvo.x *= m / r; alvo.z *= m / r; }
    // na frente do urso e perto: sai de lado antes (passa por fora, não pela frente)
    if (ag.frente > 0.5 && n < 2) { const lx = -dz / n, lz = dx / n, s = lado >= 0 ? 1 : -1; return { tipo: 'e:sair', ordem: { ir: { x: p.x + lx * s * 1.5 + (dx / n) * 0.6, y: 0, z: p.z + lz * s * 1.5 + (dz / n) * 0.6 } } }; }
    return { tipo: 'e:esperar', ordem: { ir: { x: alvo.x, y: 0, z: alvo.z } } };
  }

  private chapeuVale(c: Chapeu, v: VisaoTatica): boolean {
    if (c.b === 'sempre') return true;
    if (c.b === 'sinal') return v.tempo - this.sinalEm[c.sinal] <= (c.dura ?? DURA_SINAL);
    return this.comecouEm !== null && v.tempo - this.comecouEm <= (c.dura ?? DURA_COMECO);
  }

  /** Condições. "chance" depende do clone (sorteio estável por 2 s) e só é avaliada com o clone em mãos. */
  private cond(c: Cond, v: VisaoTatica, ag: Agente | null, regra: number): boolean {
    const u = v.urso;
    switch (c.b) {
      case 'ursoSentado': return u.sentado;
      case 'ursoTonto': return u.tonto;
      case 'ursoNoAr': return u.noAr;
      case 'ursoAgarrando': return u.agarrando;
      case 'ursoFurioso': case 'ursoHumano': return false;
      case 'ursoFraco': return u.res < c.res;
      case 'ursoNaBorda': return Math.hypot(u.cabeca.x, u.cabeca.z) > RINGUE.raio - c.m;
      case 'equilibrio': return u.equilibrio > c.maisDe;
      case 'originalMachucado': return !!v.original && v.original.res < c.res;
      case 'originalNoAr': return !!v.original?.noAr;
      case 'agua': return v.agua > c.maisDe;
      case 'clonesVivos': return v.clones.length > c.maisDe;
      case 'tempo': return v.tempo > c.maisDe;
      case 'temFormacao': return v.formacoes.some((f) => f.tipo === c.tipo);
      case 'chance': return ag ? sorteioFixo(ag.codigo, regra, Math.floor(v.tempo / 2)) * 100 < c.pct : true;
      case 'nao': return !this.cond(c.c, v, ag, regra);
      case 'ou': return this.cond(c.a, v, ag, regra) || this.cond(c.c, v, ag, regra);
    }
  }

  private quem(q: Quem, ag: Agente, v: VisaoTatica, porDistancia: number[]): boolean {
    switch (q.b) {
      case 'todos': return true;
      case 'clones': return !ag.original;
      case 'original': return ag.original;
      case 'complexos': return !ag.original && !ag.simples && !ag.armadilha;
      case 'simples': return !ag.original && ag.simples && !ag.armadilha;
      case 'armadilhas': return ag.armadilha;
      case 'grupo': return ag.r.grupo === q.grupo;
      case 'pertoDoUrso': return ag.dUrso < q.m;
      case 'longeDoUrso': return ag.dUrso >= q.m;
      case 'pertoDoOriginal': return !!v.original && !ag.original && dist(ag.pos, v.original.pos) < q.m;
      case 'maisPertoDoUrso': return porDistancia.indexOf(ag.codigo) < q.n;
      case 'acabouDeNascer': return ag.idade < q.s;
      case 'nascidoHa': return ag.idade >= q.s;
      case 'machucado': return ag.resFrac < 0.5;
      case 'grudados': return ag.grudado;
      case 'noAr': return ag.noAr;
      case 'atrasDoUrso': return ag.frente < -0.3;
      case 'frenteDoUrso': return ag.frente > 0.5;
      case 'livre': return ag.livre;
    }
  }

  private exclusiva(a: Acao, ag: Agente, v: VisaoTatica, turno: Set<number>): { tipo: string; ordem: OrdemClone } | null {
    if (a.b === 'atacar') { const o: OrdemClone = { atacar: a.ataque }; if (a.mirar) o.mirar = a.mirar; return { tipo: `atacar:${a.ataque}:${a.mirar ?? ''}${a.depois ? ':recuar' : ''}`, ordem: o }; }
    if (a.b === 'parar') return { tipo: 'parar', ordem: { parar: true } };
    if (a.b === 'rolar') return { tipo: 'rolar', ordem: { rolar: true } };
    if (a.b === 'distrair') return { tipo: `distrair:${a.tipo}`, ordem: { distrair: a.tipo } };
    if (a.b === 'catapulta') return ag.simples || ag.armadilha ? null : { tipo: 'catapulta', ordem: { catapulta: true } };
    if (a.b === 'esperto') return ag.simples || ag.armadilha ? null : this.esperto(ag, v, turno);
    return null;
  }

  /** Movimentos que se somam (vetor no chão). */
  private forca(a: Acao, ag: Agente, v: VisaoTatica, todos: Agente[]): { x: number; z: number } | null {
    const p = ag.pos, u = v.urso.cabeca;
    const para = (alvo: { x: number; z: number }, peso = 1) => { const dx = alvo.x - p.x, dz = alvo.z - p.z, n = Math.hypot(dx, dz); return n < 0.15 ? { x: 0, z: 0 } : { x: (dx / n) * peso * Math.min(1, n), z: (dz / n) * peso * Math.min(1, n) }; };
    switch (a.b) {
      case 'aproximar': return ag.dUrso < 1.3 ? { x: 0, z: 0 } : para(u);
      case 'recuar': { const dx = p.x - u.x, dz = p.z - u.z, n = Math.hypot(dx, dz) || 1, peso = Math.max(0, Math.min(1, (3.5 - n) / 2)); return { x: (dx / n) * peso, z: (dz / n) * peso }; }
      case 'rodear': {
        const dx = p.x - u.x, dz = p.z - u.z, n = Math.hypot(dx, dz) || 1;
        const radial = Math.max(-1, Math.min(1, (a.m - n) * 0.8)); // volta para o raio pedido
        return { x: (dx / n) * radial + (-dz / n) * 0.7 * a.sentido, z: (dz / n) * radial + (dx / n) * 0.7 * a.sentido };
      }
      case 'juntarNoOriginal': {
        if (!v.original || ag.original) return null;
        // D-324: mira um ponto sorteado perto do original (às vezes perto de outro clone), para não entregá-lo
        const s1 = sorteioFixo(ag.codigo, 91, Math.floor(v.tempo / 3)), s2 = sorteioFixo(ag.codigo, 92, Math.floor(v.tempo / 3));
        const outro = todos.filter((x) => !x.original && x !== ag);
        const base = s1 < 0.3 && outro.length ? outro[Math.floor(s2 * outro.length)].pos : v.original.pos;
        const ang = s2 * Math.PI * 2, raio = 0.8 + s1 * 0.9;
        return para({ x: base.x + Math.cos(ang) * raio, z: base.z + Math.sin(ang) * raio });
      }
      case 'espalhar': {
        let fx = 0, fz = 0;
        for (const o of todos) { if (o === ag) continue; const dx = p.x - o.pos.x, dz = p.z - o.pos.z, n = Math.hypot(dx, dz); if (n < 1.5 && n > 1e-3) { fx += (dx / n) * (1.5 - n); fz += (dz / n) * (1.5 - n); } }
        return { x: fx, z: fz };
      }
      case 'irPara': return para({ x: a.x, z: a.z });
      default: return null;
    }
  }

  /** Nova decisão para o clone: só vale depois do tempo de reação, e às vezes ele não obedece (D-091).
   *  A IA esperta é do próprio clone: reage no mesmo ritmo, mas não "desobedece" a si mesma. */
  private decidir(ag: Agente, tipo: string, ordem: OrdemClone | null): void {
    const r = ag.r, proprio = tipo.startsWith('e:');
    if (tipo === r.tipo) {                                       // mesma decisão: só atualiza o alvo
      r.pendente = null;
      if (r.ignora && this.tempo >= r.ignoraAte) r.ignora = this.aleatorio() > OBEDIENCIA, r.ignoraAte = this.tempo + DESOBEDECE;
      r.ordem = r.ignora ? null : ordem; return;
    }
    if (r.pendente && r.pendente.tipo === tipo) { r.pendente.ordem = ordem; }
    else {
      const reacao = (REACAO.min + this.aleatorio() * (REACAO.max - REACAO.min)) * (ag.simples ? REACAO.simples : 1);
      r.pendente = { tipo, ordem }; r.valeEm = this.tempo + (proprio ? reacao * 0.5 : reacao);
      r.ignora = tipo !== '' && !proprio && this.aleatorio() > OBEDIENCIA; r.ignoraAte = r.valeEm + DESOBEDECE;
    }
    if (this.tempo >= r.valeEm) { r.tipo = tipo; r.ordem = r.ignora ? null : ordem; r.pendente = null; }
  }
}

const temChance = (c: Cond): boolean => c.b === 'chance' || (c.b === 'nao' && temChance(c.c)) || (c.b === 'ou' && (temChance(c.a) || temChance(c.c)));
/** Sorteio repetível (0..1) por clone, regra e janela de tempo: "com chance de 30%" não pisca a cada 0,25 s. */
function sorteioFixo(a: number, b: number, c: number): number {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// ---------------- táticas prontas (iniciantes, D-322) ----------------
// Os quatro sinais valem em todas: U recua rolando, I ataca junto, O monta muralha perto do urso, P manda a fila.
const SINAIS: Regra[] = [
  { quando: { b: 'sinal', sinal: 0 }, quem: [{ b: 'clones' }, { b: 'pertoDoUrso', m: 1.5 }], se: [], fazer: [{ b: 'rolar' }] },
  { quando: { b: 'sinal', sinal: 0 }, quem: [{ b: 'clones' }], se: [], fazer: [{ b: 'recuar' }, { b: 'espalhar' }] },
  { quando: { b: 'sinal', sinal: 1 }, quem: [{ b: 'clones' }, { b: 'livre' }], se: [], fazer: [{ b: 'atacar', ataque: 'soco', mirar: 'pernas' }] },
  { quando: { b: 'sinal', sinal: 2 }, quem: [{ b: 'todos' }], se: [], fazer: [{ b: 'formar', tipo: 'muralha', perto: 'urso' }] },
  { quando: { b: 'sinal', sinal: 3 }, quem: [{ b: 'todos' }], se: [], fazer: [{ b: 'formar', tipo: 'fila' }] },
];
const sempre: Chapeu = { b: 'sempre' };
const ORIGINAL = { gerarClones: true, usarItens: true };
/** Comum a todas: machucado foge rolando; simples batem nas pernas; armadilhas ficam na IA mínima. */
const FUGIR: Regra = { quando: sempre, quem: [{ b: 'clones' }, { b: 'machucado' }, { b: 'pertoDoUrso', m: 1.6 }], se: [{ b: 'nao', c: { b: 'ursoSentado' } }], fazer: [{ b: 'rolar' }] };
export const TATICAS_PRONTAS: Tatica[] = [
  { versao: 1, nome: { pt: 'Enxame', en: 'Swarm' }, somar: true, original: ORIGINAL, regras: [...SINAIS, FUGIR,
    // os complexos pensam sozinhos (IA esperta: turnos pelas costas, aproveitam as aberturas)
    { quando: sempre, quem: [{ b: 'complexos' }], se: [], fazer: [{ b: 'esperto' }] },
    { quando: sempre, quem: [{ b: 'simples' }], se: [], fazer: [{ b: 'atacar', ataque: 'tapa', mirar: 'pernas' }] },
    { quando: sempre, quem: [{ b: 'original' }], se: [], fazer: [{ b: 'rodear', m: 2.8, sentido: 1 }] },
  ] },
  { versao: 1, nome: { pt: 'Morde e foge', en: 'Bite and Run' }, somar: true, original: ORIGINAL, regras: [...SINAIS, FUGIR,
    { quando: sempre, quem: [{ b: 'complexos' }, { b: 'maisPertoDoUrso', n: 5 }], se: [], fazer: [{ b: 'atacar', ataque: 'morder', mirar: 'pernas', depois: 'recuar' }] },
    { quando: sempre, quem: [{ b: 'complexos' }], se: [], fazer: [{ b: 'rodear', m: 2.5, sentido: -1 }, { b: 'espalhar' }] },
    { quando: sempre, quem: [{ b: 'simples' }], se: [], fazer: [{ b: 'atacar', ataque: 'tapa', mirar: 'pernas', depois: 'recuar' }] },
    { quando: sempre, quem: [{ b: 'original' }], se: [], fazer: [{ b: 'rodear', m: 3, sentido: -1 }] },
  ] },
  { versao: 1, nome: { pt: 'Derruba e bate', en: 'Trip and Pound' }, somar: true, original: ORIGINAL, regras: [...SINAIS,
    { quando: sempre, quem: [{ b: 'complexos' }], se: [{ b: 'ursoSentado' }], fazer: [{ b: 'atacar', ataque: 'chute', mirar: 'barriga' }] },
    FUGIR,
    { quando: sempre, quem: [{ b: 'todos' }], se: [{ b: 'nao', c: { b: 'temFormacao', tipo: 'corrente' } }, { b: 'nao', c: { b: 'ursoSentado' } }], fazer: [{ b: 'formar', tipo: 'corrente', perto: 'urso' }] },
    { quando: sempre, quem: [{ b: 'complexos' }, { b: 'maisPertoDoUrso', n: 3 }], se: [], fazer: [{ b: 'atacar', ataque: 'soco', mirar: 'pernas' }] },
    { quando: sempre, quem: [{ b: 'complexos' }], se: [], fazer: [{ b: 'rodear', m: 2, sentido: 1 }, { b: 'espalhar' }] },
    { quando: sempre, quem: [{ b: 'simples' }], se: [], fazer: [{ b: 'atacar', ataque: 'tapa', mirar: 'pernas' }] },
    { quando: sempre, quem: [{ b: 'original' }], se: [], fazer: [{ b: 'rodear', m: 3, sentido: 1 }] },
  ] },
  { versao: 1, nome: { pt: 'Malabarismo', en: 'Juggling' }, somar: true, original: ORIGINAL, regras: [...SINAIS,
    { quando: sempre, quem: [{ b: 'clones' }, { b: 'livre' }], se: [{ b: 'ursoNoAr' }], fazer: [{ b: 'atacar', ataque: 'cabecada' }] },
    FUGIR,
    { quando: sempre, quem: [{ b: 'todos' }], se: [{ b: 'nao', c: { b: 'temFormacao', tipo: 'catapulta' } }], fazer: [{ b: 'formar', tipo: 'catapulta' }] },
    { quando: sempre, quem: [{ b: 'complexos' }, { b: 'longeDoUrso', m: 2 }], se: [{ b: 'temFormacao', tipo: 'catapulta' }], fazer: [{ b: 'catapulta' }] },
    { quando: sempre, quem: [{ b: 'complexos' }], se: [], fazer: [{ b: 'esperto' }] },
    { quando: sempre, quem: [{ b: 'simples' }], se: [], fazer: [{ b: 'atacar', ataque: 'tapa', mirar: 'pernas' }] },
    { quando: sempre, quem: [{ b: 'original' }], se: [], fazer: [{ b: 'rodear', m: 3, sentido: 1 }] },
  ] },
  { versao: 1, nome: { pt: 'Chute na borda', en: 'Edge Kick' }, somar: true, original: ORIGINAL, regras: [...SINAIS, FUGIR,
    { quando: sempre, quem: [{ b: 'complexos' }, { b: 'frenteDoUrso' }], se: [{ b: 'ou', a: { b: 'ursoNaBorda', m: 2.5 }, c: { b: 'ursoFraco', res: 30 } }], fazer: [{ b: 'distrair', tipo: 'careta' }] },
    { quando: sempre, quem: [{ b: 'complexos' }], se: [{ b: 'ou', a: { b: 'ursoNaBorda', m: 2.5 }, c: { b: 'ursoFraco', res: 30 } }], fazer: [{ b: 'atacar', ataque: 'chute', mirar: 'barriga' }] },
    { quando: sempre, quem: [{ b: 'complexos' }], se: [], fazer: [{ b: 'esperto' }] },
    { quando: sempre, quem: [{ b: 'simples' }], se: [], fazer: [{ b: 'atacar', ataque: 'tapa', mirar: 'pernas' }] },
    { quando: sempre, quem: [{ b: 'original' }], se: [], fazer: [{ b: 'rodear', m: 3, sentido: 1 }] },
  ] },
];
