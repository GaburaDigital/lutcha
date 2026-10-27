// Táticas do técnico (conversa "Programação por blocos e IA dos clones", D-300 a D-499).
// Uma tática é um JSON com uma lista fechada de blocos. Ela é conferida (conferirTatica) e interpretada aqui;
// nunca vira código executado (D-304). Roda só no PC: o Quest nunca recebe a tática (D-221).
// O Tecnico entrega um "cérebro" para luta.definirCerebro (D-501). A física continua sendo da Luta:
// aqui só se decide para onde cada clone vai e o que ele tenta fazer.
//
// Formato 2 (C29), no jeito do Scratch:
// - chapéu: "quando [sempre / sinal U, I, O, P / a tática começa]", com uma pilha de comandos embaixo;
// - comandos: "para cada clone que ⟨…⟩" e "se ⟨…⟩ então … senão …" (blocos em C) e as ações;
// - condições são blocos hexagonais (verdadeiro ou falso): ⟨o urso está sentado⟩, ⟨eu sou complexo⟩,
//   ⟨(…) < (…)⟩, ⟨… e …⟩, ⟨… ou …⟩, ⟨não …⟩, ⟨com chance de (30)%⟩;
// - números são repórteres redondos: (resistência do urso), (minha distância ao urso), (água)…
// A pilha de cada chapéu é lida para cada clone (e para o original no automático): as condições sobre "eu"
// valem para o clone que está pensando, e as ações alcançadas são as dele. Ações do time (montar formação,
// criar clones, gritar) valem uma vez para todos.
// Regras do técnico (D-300 a D-302):
// - "Somar regras" ligado: o clone soma os movimentos de todos os chapéus que deram alguma ação para ele; ações
//   que brigam entre si (atacar, parar, rolar, distrair, catapulta, "pensar sozinho") não se somam: vale a mais alta.
// - "Somar regras" desligado: vale só o primeiro chapéu (de cima para baixo) que deu alguma ação para o clone.
// - Cada clone reage com atraso (0,2 a 1,2 s) e obedece ~80% das vezes (D-091); sem ordem, segue a IA mínima.
// - O original no automático recebe as ordens como qualquer clone, sem proteção especial (D-324).
// - IA esperta (C28): com uma tática ligada, clone complexo (e o original no automático) sem nenhuma ação, ou com
//   o bloco "pensar sozinho", decide sozinho: rodeia para as costas do urso, ataca em turnos as pernas, chuta o
//   urso sentado, cabeceia o urso no ar, aproveita quando ele agarra ou fica tonto, empurra para a borda e foge
//   quando está machucado.
// O formato 1 (rodada 1: quem / se / faça) continua aceito: é convertido para o formato 2 na conferência.

import type { AtaquePB, Cerebro, DecisaoTatica, OrdemClone, PedidoFormacao, VisaoTatica } from './luta';
import { DISTRACOES, MIRAS, PIRANBENJA, RINGUE, TIPOS_FORMACAO, TOTAL_PALAVRAS, type Distracao, type Mira, type TipoFormacao, type V3 } from './regras';

export const GRUPOS = ['alpha', 'beta', 'gamma', 'sigma'] as const;
export type Grupo = typeof GRUPOS[number];
/** Cores dos grupos (só no PC). */
export const COR_GRUPO: Record<Grupo, string> = { alpha: '#4f9bff', beta: '#ff9a3d', gamma: '#5fd35f', sigma: '#b07cff' };
/** Blocos por tática (D-305). Contam comandos, condições e repórteres; números digitados não contam. */
export const MAX_BLOCOS = 100;      // C30: 100 para testar (as táticas prontas usam 44 a 63)
export const MAX_FUNDO = 12;           // encaixes um dentro do outro
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

// ---------------- os blocos (lista fechada) ----------------
export type Chapeu =
  | { b: 'sempre' }
  | { b: 'sinal'; sinal: number; dura?: number }    // sinal 0..3 (teclas U, I, O, P)
  | { b: 'comeco'; dura?: number };                 // nos primeiros segundos da tática
/** Repórteres redondos (números). */
export const VALORES = ['ursoRes', 'ursoEquilibrio', 'ursoBorda', 'agua', 'clonesVivos', 'tempo',
  'minhaDistancia', 'minhaRes', 'minhaIdade', 'distanciaOriginal', 'originalRes'] as const;
export type Valor = typeof VALORES[number];
export type Num = { n: number } | { valor: Valor };
/** Condições sobre o urso e o original. */
export const SENSORES = ['ursoSentado', 'ursoTonto', 'ursoNoAr', 'ursoAgarrando', 'ursoFurioso', 'ursoHumano', 'originalNoAr'] as const;
export type Sensor = typeof SENSORES[number];
/** Condições sobre o clone que está pensando ("eu"). */
export const EU = ['complexo', 'simples', 'armadilha', 'original', 'livre', 'machucado', 'grudado', 'noAr', 'atrasDoUrso', 'frenteDoUrso'] as const;
export type Eu = typeof EU[number];
/** Blocos hexagonais (verdadeiro ou falso). */
export type Bool =
  | { b: 'e' | 'ou'; a: Bool; c: Bool } | { b: 'nao'; a: Bool }
  | { b: 'compara'; op: '<' | '>' | '='; a: Num; c: Num }
  | { b: 'sensor'; s: Sensor } | { b: 'eu'; s: Eu } | { b: 'grupo'; grupo: Grupo }
  | { b: 'maisPerto'; n: number } | { b: 'formacao'; tipo: TipoFormacao }
  | { b: 'chance'; pct: number; id?: number };     // id: posição do bloco (sorteio estável por clone)
export type Acao =
  | { b: 'atacar'; ataque: AtaquePB; mirar?: Mira; depois?: 'recuar' }
  | { b: 'aproximar' } | { b: 'recuar' } | { b: 'parar' } | { b: 'rolar' }
  | { b: 'rodear'; m: number; sentido: 1 | -1 }
  | { b: 'juntarNoOriginal' } | { b: 'espalhar' } | { b: 'irPara'; x: number; z: number }
  | { b: 'catapulta' } | { b: 'distrair'; tipo: Distracao } | { b: 'esperto' }
  | { b: 'entrarGrupo'; grupo: Grupo }
  | { b: 'formar'; tipo: TipoFormacao; perto?: 'urso' | 'original'; grupo?: Grupo }
  | { b: 'criarClones'; quantos: number; simples: boolean }
  | { b: 'gritar'; palavra: number };
/** Comandos: as ações e os dois blocos em C. Condição vazia: "para cada" vale para todos; "se" não entra. */
export type Comando = Acao
  | { b: 'paraCada'; filtro: Bool | null; corpo: Comando[] }
  | { b: 'se'; cond: Bool | null; entao: Comando[]; senao?: Comando[] };
export interface Regra { quando: Chapeu; corpo: Comando[] }
/** original: checkboxes do Quadro para o original no automático (D-310). */
export interface Tatica { versao: 2; nome: { pt: string; en: string }; somar: boolean; original: { gerarClones: boolean; usarItens: boolean }; regras: Regra[] }

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

/** Leitor com contagem de blocos e de encaixes. */
class Leitor {
  blocos = 0; chances = 0;
  chapeu(x: unknown): Chapeu {
    const o = obj(x, 'quando');
    if (o.b === 'sempre') return { b: 'sempre' };
    if (o.b === 'sinal') return { b: 'sinal', sinal: Math.round(numero(o.sinal, 0, 3, 'sinal')), dura: numero(o.dura, 0.5, 10, 'sinal', DURA_SINAL) };
    if (o.b === 'comeco') return { b: 'comeco', dura: numero(o.dura, 0.5, 30, 'começo', DURA_COMECO) };
    throw new Recusa('quando: bloco desconhecido');
  }
  num(x: unknown, fundo: number): Num {
    if (fundo > MAX_FUNDO) throw new Recusa('número: encaixes demais');
    const o = obj(x, 'número');
    if ('n' in o) return { n: numero(o.n, -1000, 1000, 'número') };
    this.blocos++;
    return { valor: umDe(o.valor, VALORES, 'repórter') };
  }
  bool(x: unknown, fundo: number): Bool {
    if (fundo > MAX_FUNDO) throw new Recusa('condição: encaixes demais');
    const o = obj(x, 'condição');
    this.blocos++;
    switch (o.b) {
      case 'e': case 'ou': return { b: o.b, a: this.bool(o.a, fundo + 1), c: this.bool(o.c, fundo + 1) };
      case 'nao': return { b: 'nao', a: this.bool(o.a, fundo + 1) };
      case 'compara': return { b: 'compara', op: umDe(o.op, ['<', '>', '='] as const, 'comparação'), a: this.num(o.a, fundo + 1), c: this.num(o.c, fundo + 1) };
      case 'sensor': return { b: 'sensor', s: umDe(o.s, SENSORES, 'sensor') };
      case 'eu': return { b: 'eu', s: umDe(o.s, EU, 'eu') };
      case 'grupo': return { b: 'grupo', grupo: umDe(o.grupo, GRUPOS, 'grupo') };
      case 'maisPerto': return { b: 'maisPerto', n: Math.round(numero(o.n, 1, 30, 'mais perto')) };
      case 'formacao': return { b: 'formacao', tipo: umDe(o.tipo, TIPOS_FORMACAO, 'formação') };
      case 'chance': return { b: 'chance', pct: numero(o.pct, 0, 100, 'chance'), id: this.chances++ };
    }
    throw new Recusa('condição: bloco desconhecido');
  }
  acao(o: Record<string, unknown>): Acao {
    switch (o.b) {
      case 'atacar': {
        const a: Acao = { b: 'atacar', ataque: umDe(o.ataque, ATAQUES, 'ataque') };
        if (o.mirar !== undefined && o.mirar !== '') a.mirar = umDe(o.mirar, MIRAS, 'mirar');
        if (o.depois === 'recuar') a.depois = 'recuar';
        return a;
      }
      case 'aproximar': case 'recuar': case 'parar': case 'rolar': case 'juntarNoOriginal': case 'espalhar': case 'catapulta': case 'esperto': return { b: o.b };
      case 'rodear': return { b: 'rodear', m: numero(o.m, 1, 5, 'rodear'), sentido: o.sentido === -1 ? -1 : 1 };
      case 'irPara': return { b: 'irPara', x: numero(o.x, -RINGUE.raio, RINGUE.raio, 'ir para'), z: numero(o.z, -RINGUE.raio, RINGUE.raio, 'ir para') };
      case 'distrair': return { b: 'distrair', tipo: umDe(o.tipo, DISTRACOES, 'distração') };
      case 'entrarGrupo': return { b: 'entrarGrupo', grupo: umDe(o.grupo, GRUPOS, 'grupo') };
      case 'formar': {
        const a: Acao = { b: 'formar', tipo: umDe(o.tipo, TIPOS_FORMACAO, 'formação') };
        if (o.perto !== undefined) a.perto = umDe(o.perto, ['urso', 'original'] as const, 'perto');
        if (o.grupo !== undefined && o.grupo !== '') a.grupo = umDe(o.grupo, GRUPOS, 'grupo');
        return a;
      }
      case 'criarClones': return { b: 'criarClones', quantos: Math.round(numero(o.quantos, 1, 8, 'criar clones')), simples: o.simples === true };
      case 'gritar': return { b: 'gritar', palavra: Math.round(numero(o.palavra, 0, TOTAL_PALAVRAS - 1, 'gritar')) };
    }
    throw new Recusa('comando: bloco desconhecido');
  }
  pilha(x: unknown, fundo: number): Comando[] {
    if (x === undefined || x === null) return [];
    if (!Array.isArray(x) || x.length > MAX_BLOCOS) throw new Recusa('pilha de comandos inválida');
    if (fundo > MAX_FUNDO) throw new Recusa('comandos: encaixes demais');
    return x.map((y) => {
      const o = obj(y, 'comando');
      this.blocos++;
      if (o.b === 'paraCada') return { b: 'paraCada', filtro: o.filtro ? this.bool(o.filtro, fundo + 1) : null, corpo: this.pilha(o.corpo, fundo + 1) };
      if (o.b === 'se') { const c: Comando = { b: 'se', cond: o.cond ? this.bool(o.cond, fundo + 1) : null, entao: this.pilha(o.entao, fundo + 1) }; if (o.senao !== undefined) c.senao = this.pilha(o.senao, fundo + 1); return c; }
      return this.acao(o);
    });
  }
}

/** Confere um JSON vindo do Quadro (ou de um arquivo) e devolve uma tática limpa, ou o motivo da recusa. */
export function conferirTatica(x: unknown): Resultado {
  try {
    let o = obj(x, 'tática');
    if (o.versao === 1) o = doFormato1(o);
    if (o.versao !== 2) throw new Recusa('tática: versão desconhecida');
    const n = obj(o.nome, 'nome');
    if (!Array.isArray(o.regras) || o.regras.length > MAX_BLOCOS) throw new Recusa('tática: lista de chapéus inválida');
    const ler = new Leitor();
    const regras: Regra[] = o.regras.map((r) => { const q = obj(r, 'chapéu'); ler.blocos++; return { quando: ler.chapeu(q.quando), corpo: ler.pilha(q.corpo, 1) }; });
    const orig = o.original && typeof o.original === 'object' ? o.original as Record<string, unknown> : {};
    const t: Tatica = { versao: 2, nome: { pt: texto(n.pt, 'nome'), en: texto(n.en, 'nome') }, somar: o.somar !== false,
      original: { gerarClones: orig.gerarClones !== false, usarItens: orig.usarItens !== false }, regras };
    if (ler.blocos > MAX_BLOCOS) throw new Recusa(`tática: ${ler.blocos} blocos (máximo ${MAX_BLOCOS})`);
    return { ok: true, tatica: t, blocos: ler.blocos };
  } catch (e) {
    if (e instanceof Recusa) return { ok: false, erro: e.message };
    return { ok: false, erro: 'tática inválida' };
  }
}
/** Quantos blocos uma tática já conferida tem. */
export function contarBlocos(t: Tatica): number { const r = conferirTatica(t); return r.ok ? r.blocos : MAX_BLOCOS + 1; }

// ---------------- formato 1 (rodada 1) → formato 2 ----------------
type Bruto = Record<string, unknown>;
const e2 = (lista: Bruto[]): Bruto | null => lista.reduce<Bruto | null>((acc, x) => (acc ? { b: 'e', a: acc, c: x } : x), null);
const cmp = (op: string, valor: string, n: unknown): Bruto => ({ b: 'compara', op, a: { valor }, c: { n } });
function quem1(q: Bruto): Bruto | null {
  switch (q.b) {
    case 'todos': return null;
    case 'clones': return { b: 'nao', a: { b: 'eu', s: 'original' } };
    case 'original': return { b: 'eu', s: 'original' };
    case 'complexos': return { b: 'eu', s: 'complexo' };
    case 'simples': return { b: 'eu', s: 'simples' };
    case 'armadilhas': return { b: 'eu', s: 'armadilha' };
    case 'livre': case 'machucado': case 'noAr': case 'atrasDoUrso': case 'frenteDoUrso': return { b: 'eu', s: q.b };
    case 'grudados': return { b: 'eu', s: 'grudado' };
    case 'grupo': return { b: 'grupo', grupo: q.grupo };
    case 'pertoDoUrso': return cmp('<', 'minhaDistancia', q.m);
    case 'longeDoUrso': return cmp('>', 'minhaDistancia', q.m);
    case 'pertoDoOriginal': return { b: 'e', a: { b: 'nao', a: { b: 'eu', s: 'original' } }, c: cmp('<', 'distanciaOriginal', q.m) };
    case 'maisPertoDoUrso': return { b: 'maisPerto', n: q.n };
    case 'acabouDeNascer': return cmp('<', 'minhaIdade', q.s);
    case 'nascidoHa': return cmp('>', 'minhaIdade', q.s);
  }
  return q; // desconhecido: a conferência do formato 2 recusa
}
function cond1(c: Bruto): Bruto {
  switch (c.b) {
    case 'ursoSentado': case 'ursoTonto': case 'ursoNoAr': case 'ursoAgarrando': case 'ursoFurioso': case 'ursoHumano': case 'originalNoAr': return { b: 'sensor', s: c.b };
    case 'ursoFraco': return cmp('<', 'ursoRes', c.res);
    case 'ursoNaBorda': return cmp('<', 'ursoBorda', c.m);
    case 'equilibrio': return cmp('>', 'ursoEquilibrio', c.maisDe);
    case 'agua': return cmp('>', 'agua', c.maisDe);
    case 'clonesVivos': return cmp('>', 'clonesVivos', c.maisDe);
    case 'tempo': return cmp('>', 'tempo', c.maisDe);
    case 'originalMachucado': return cmp('<', 'originalRes', c.res);
    case 'temFormacao': return { b: 'formacao', tipo: c.tipo };
    case 'chance': return { b: 'chance', pct: c.pct };
    case 'nao': return { b: 'nao', a: cond1(obj(c.c, 'não')) };
    case 'ou': return { b: 'ou', a: cond1(obj(c.a, 'ou')), c: cond1(obj(c.c, 'ou')) };
  }
  return c;
}
function doFormato1(o: Bruto): Bruto {
  if (!Array.isArray(o.regras)) throw new Recusa('tática: sem regras');
  const regras = o.regras.map((r) => {
    const q = obj(r, 'regra'), lista = (v: unknown) => (Array.isArray(v) ? v.map((x) => obj(x, 'bloco')) : []);
    const filtro = e2(lista(q.quem).map(quem1).filter((x): x is Bruto => !!x));
    const cond = e2(lista(q.se).map(cond1));
    const fazer = lista(q.fazer);
    const dentro = cond ? [{ b: 'se', cond, entao: fazer }] : fazer;
    return { quando: q.quando, corpo: [{ b: 'paraCada', filtro, corpo: dentro }] };
  });
  return { ...o, versao: 2, regras };
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
interface Contexto { porDistancia: number[] }

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
   *  Com tática, complexo sem nenhuma ação pensa sozinho (IA esperta). */
  trocar(t: Tatica | null): void { this.tatica = t; this.comecouEm = null; for (const r of this.rastros.values()) { r.tipo = ''; r.ordem = null; r.pendente = null; } }
  /** O jogador apertou a tecla de um sinal (U, I, O, P). */
  sinal(i: number): void { if (i >= 0 && i <= 3) { this.sinaisNovos.push(i); this.aoSinal?.(i); } }
  /** Grupo de um Piranbenja pelo número atual da rede (para o PC pintar). */
  grupoDe(numero: number): Grupo | null { const c = this.codigoDoNumero.get(numero); return c === undefined ? null : this.rastros.get(c)?.grupo ?? null; }
  /** Quantos clones há em cada grupo (para o painel do PC). */
  contarGrupos(): Record<Grupo, number> { const c = { alpha: 0, beta: 0, gamma: 0, sigma: 0 }; for (const r of this.rastros.values()) c[r.grupo]++; return c; }
  /** Muda o grupo de um Piranbenja (pintar na mini-grade). */
  pintar(numero: number, g: Grupo): void { const c = this.codigoDoNumero.get(numero); const r = c === undefined ? null : this.rastros.get(c); if (r) r.grupo = g; }
  /** "+" de um grupo na mini-grade: o clone mais perto do centro do grupo, vindo de outro grupo, passa para ele.
   *  "−": o clone do grupo mais longe do centro dele volta para o alpha (ou para o beta, se o grupo é o alpha). */
  mudarQuantidade(g: Grupo, sinal: 1 | -1, posicoes: { numero: number; pos: V3 }[]): boolean {
    const doGrupo = posicoes.filter((p) => this.grupoDe(p.numero) === g), outros = posicoes.filter((p) => this.grupoDe(p.numero) !== g);
    const ref = doGrupo.length ? { x: doGrupo.reduce((s, p) => s + p.pos.x, 0) / doGrupo.length, z: doGrupo.reduce((s, p) => s + p.pos.z, 0) / doGrupo.length } : { x: 0, z: 0 };
    const d = (p: { pos: V3 }) => Math.hypot(p.pos.x - ref.x, p.pos.z - ref.z);
    if (sinal > 0) { const c = outros.sort((a, b) => d(a) - d(b))[0]; if (!c) return false; this.pintar(c.numero, g); return true; }
    const c = doGrupo.sort((a, b) => d(b) - d(a))[0]; if (!c) return false; this.pintar(c.numero, g === 'alpha' ? 'beta' : 'alpha'); return true;
  }

  private pensar(v: VisaoTatica): DecisaoTatica {
    this.tempo = v.tempo;
    for (const i of this.sinaisNovos) this.sinalEm[i] = v.tempo;
    this.sinaisNovos = [];
    const agentes = this.reconhecer(v);
    const t = this.tatica;
    if (t && this.comecouEm === null) this.comecouEm = v.tempo;
    const decisao: DecisaoTatica = { ordens: {} };
    let formar: Extract<Acao, { b: 'formar' }> | null = null, criar: Extract<Acao, { b: 'criarClones' }> | null = null, gritar: number | null = null;
    const ctx: Contexto = { porDistancia: [...agentes].sort((a, b) => a.dUrso - b.dUrso).map((a) => a.codigo) };
    const turno = this.escolherTurno(agentes, v);
    const ativas = (t?.regras ?? []).filter((r) => this.chapeuVale(r.quando, v));
    for (const ag of agentes) {
      const listas: Acao[][] = [];
      for (const r of ativas) { const acoes: Acao[] = []; this.rodar(r.corpo, ag, v, ctx, acoes); if (acoes.length) listas.push(acoes); }
      const usadas = t?.somar ? listas : listas.slice(0, 1);
      let exclusiva: { tipo: string; ordem: OrdemClone } | null = null;
      let mx = 0, mz = 0, moveu = false;
      for (const acoes of usadas) {
        for (const a of acoes) {
          // ações do time (valem uma vez, não por clone) e a troca de grupo
          if (a.b === 'formar') { formar ??= a; continue; }
          if (a.b === 'criarClones') { criar ??= a; continue; }
          if (a.b === 'gritar') { gritar ??= a.palavra; continue; }
          if (a.b === 'entrarGrupo') { ag.r.grupo = a.grupo; continue; }
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
      // sem nenhuma ação: o complexo (e o original no automático) pensa sozinho; o simples fica na IA mínima
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

  /** Lê uma pilha de comandos para um clone e junta as ações que ele alcançou, em ordem. */
  private rodar(pilha: Comando[], ag: Agente, v: VisaoTatica, ctx: Contexto, saida: Acao[]): void {
    for (const c of pilha) {
      if (c.b === 'paraCada') { if (!c.filtro || this.bool(c.filtro, ag, v, ctx)) this.rodar(c.corpo, ag, v, ctx, saida); continue; }
      if (c.b === 'se') { if (c.cond && this.bool(c.cond, ag, v, ctx)) this.rodar(c.entao, ag, v, ctx, saida); else if (c.senao) this.rodar(c.senao, ag, v, ctx, saida); continue; }
      saida.push(c);
    }
  }

  /** Repórteres redondos. */
  private valor(x: Num, ag: Agente, v: VisaoTatica): number {
    if ('n' in x) return x.n;
    const u = v.urso;
    switch (x.valor) {
      case 'ursoRes': return u.res;
      case 'ursoEquilibrio': return u.equilibrio;
      case 'ursoBorda': return RINGUE.raio - Math.hypot(u.cabeca.x, u.cabeca.z);
      case 'agua': return v.agua;
      case 'clonesVivos': return v.clones.length;
      case 'tempo': return v.tempo;
      case 'minhaDistancia': return ag.dUrso;
      case 'minhaRes': return Math.round(ag.resFrac * 100);
      case 'minhaIdade': return ag.idade;
      case 'distanciaOriginal': return ag.original || !v.original ? 0 : dist(ag.pos, v.original.pos);
      case 'originalRes': return v.original?.res ?? 0;
    }
  }

  /** Blocos hexagonais. "com chance de" sorteia por clone e fica igual por 2 s (não pisca a cada 0,25 s). */
  private bool(c: Bool, ag: Agente, v: VisaoTatica, ctx: Contexto): boolean {
    const u = v.urso;
    switch (c.b) {
      case 'e': return this.bool(c.a, ag, v, ctx) && this.bool(c.c, ag, v, ctx);
      case 'ou': return this.bool(c.a, ag, v, ctx) || this.bool(c.c, ag, v, ctx);
      case 'nao': return !this.bool(c.a, ag, v, ctx);
      case 'compara': {
        const a = this.valor(c.a, ag, v), b = this.valor(c.c, ag, v);
        return c.op === '<' ? a < b : c.op === '>' ? a > b : Math.round(a) === Math.round(b);
      }
      case 'sensor':
        switch (c.s) {
          case 'ursoSentado': return u.sentado;
          case 'ursoTonto': return u.tonto;
          case 'ursoNoAr': return u.noAr;
          case 'ursoAgarrando': return u.agarrando;
          case 'ursoFurioso': case 'ursoHumano': return false; // D-307: o urso ainda não tem esses modos
          case 'originalNoAr': return !!v.original?.noAr;
        }
        return false;
      case 'eu':
        switch (c.s) {
          case 'complexo': return !ag.original && !ag.simples && !ag.armadilha;
          case 'simples': return !ag.original && ag.simples && !ag.armadilha;
          case 'armadilha': return ag.armadilha;
          case 'original': return ag.original;
          case 'livre': return ag.livre;
          case 'machucado': return ag.resFrac < 0.5;
          case 'grudado': return ag.grudado;
          case 'noAr': return ag.noAr;
          case 'atrasDoUrso': return ag.frente < -0.3;
          case 'frenteDoUrso': return ag.frente > 0.5;
        }
        return false;
      case 'grupo': return ag.r.grupo === c.grupo;
      case 'maisPerto': return ctx.porDistancia.indexOf(ag.codigo) < c.n;
      case 'formacao': return v.formacoes.some((f) => f.tipo === c.tipo);
      case 'chance': return sorteioFixo(ag.codigo, 100 + (c.id ?? 0), Math.floor(v.tempo / 2)) * 100 < c.pct;
    }
  }


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
/** Sorteio repetível (0..1) por clone, regra e janela de tempo: "com chance de 30%" não pisca a cada 0,25 s. */
function sorteioFixo(a: number, b: number, c: number): number {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}


/** Palavras-código dos sinais (aprovadas em C26); o nome pertence à tecla, não à tática. */
export const PALAVRAS_CODIGO: { pt: string; en: string }[] = [
  { pt: 'Tubarão Relâmpago', en: 'Lightning Shark' }, { pt: 'Abacaxi Supremo', en: 'Supreme Pineapple' },
  { pt: 'Pastel Dimensional', en: 'Dimensional Pastry' }, { pt: 'Torpedo de Sushi', en: 'Sushi Torpedo' },
  { pt: 'Olhar do Baiacu', en: 'Pufferfish Glare' }, { pt: 'Despertar das Barbatanas', en: 'Fin Awakening' },
  { pt: 'Tempestade de Escamas', en: 'Scale Storm' }, { pt: 'Ninja de Aquário', en: 'Aquarium Ninja' },
  { pt: 'Kaiju de Bolso', en: 'Pocket Kaiju' }, { pt: 'Rugido do Mar Profundo', en: 'Deep Sea Roar' },
  { pt: 'Punho do Bolinho de Arroz', en: 'Rice Ball Fist' }, { pt: 'Lâmina da Maré Final', en: 'Final Tide Blade' },
];
// ---------------- táticas prontas (iniciantes, D-322, D-333), no formato 2 ----------------
// Montadas com os mesmos blocos do Quadro: o Quadro carrega estas pilhas nas abas 1 a 4.
const sempre: Chapeu = { b: 'sempre' };
const chapeu = (quando: Chapeu, ...corpo: Comando[]): Regra => ({ quando, corpo });
const cada = (filtro: Bool | null, ...corpo: Comando[]): Comando => ({ b: 'paraCada', filtro, corpo });
const se = (cond: Bool, entao: Comando[], senao?: Comando[]): Comando => (senao ? { b: 'se', cond, entao, senao } : { b: 'se', cond, entao });
const eu = (s: Eu): Bool => ({ b: 'eu', s });
const sensor = (s: Sensor): Bool => ({ b: 'sensor', s });
const e = (a: Bool, c: Bool): Bool => ({ b: 'e', a, c });
const ou = (a: Bool, c: Bool): Bool => ({ b: 'ou', a, c });
const nao = (a: Bool): Bool => ({ b: 'nao', a });
const menor = (valor: Valor, n: number): Bool => ({ b: 'compara', op: '<', a: { valor }, c: { n } });
const maior = (valor: Valor, n: number): Bool => ({ b: 'compara', op: '>', a: { valor }, c: { n } });
const atacar = (ataque: AtaquePB, mirar?: Mira, depois?: 'recuar'): Acao => { const a: Acao = { b: 'atacar', ataque }; if (mirar) a.mirar = mirar; if (depois) a.depois = depois; return a; };
const clone = nao(eu('original'));
const ORIGINAL = { gerarClones: true, usarItens: true };
/** Os quatro sinais valem em todas: U rola (perto do urso) ou recua, I ataca as pernas, O muralha perto do urso, P fila. */
const SINAIS: Regra[] = [
  chapeu({ b: 'sinal', sinal: 0 }, cada(clone, se(menor('minhaDistancia', 1.5), [{ b: 'rolar' }], [{ b: 'recuar' }, { b: 'espalhar' }]))),
  chapeu({ b: 'sinal', sinal: 1 }, cada(e(clone, eu('livre')), atacar('soco', 'pernas'))),
  chapeu({ b: 'sinal', sinal: 2 }, { b: 'formar', tipo: 'muralha', perto: 'urso' }),
  chapeu({ b: 'sinal', sinal: 3 }, { b: 'formar', tipo: 'fila' }),
];
/** Comum: machucado e perto do urso foge rolando (menos com o urso sentado). */
const FUGIR = chapeu(sempre, cada(e(clone, eu('machucado')), se(e(menor('minhaDistancia', 1.6), nao(sensor('ursoSentado'))), [{ b: 'rolar' }])));
const SIMPLES_E_ORIGINAL = (raio: number, sentido: 1 | -1, depois?: 'recuar'): Comando[] => [
  cada(eu('simples'), atacar('tapa', 'pernas', depois)),
  cada(eu('original'), { b: 'rodear', m: raio, sentido }),
];
const pronta = (pt: string, en: string, regras: Regra[]): Tatica => ({ versao: 2, nome: { pt, en }, somar: true, original: ORIGINAL, regras });
export const TATICAS_PRONTAS: Tatica[] = [
  pronta('Enxame', 'Swarm', [...SINAIS, FUGIR,
    // os complexos pensam sozinhos (IA esperta: turnos pelas costas, aproveitam as aberturas)
    chapeu(sempre, cada(eu('complexo'), { b: 'esperto' }), ...SIMPLES_E_ORIGINAL(2.8, 1)),
  ]),
  pronta('Morde e foge', 'Bite and Run', [...SINAIS, FUGIR,
    chapeu(sempre, cada(eu('complexo'), se({ b: 'maisPerto', n: 5 }, [atacar('morder', 'pernas', 'recuar')], [{ b: 'rodear', m: 2.5, sentido: -1 }, { b: 'espalhar' }])),
      ...SIMPLES_E_ORIGINAL(3, -1, 'recuar')),
  ]),
  pronta('Derruba e bate', 'Trip and Pound', [...SINAIS,
    chapeu(sempre, se(sensor('ursoSentado'), [cada(eu('complexo'), atacar('chute', 'barriga'))])),
    FUGIR,
    chapeu(sempre,
      se(e(nao({ b: 'formacao', tipo: 'corrente' }), nao(sensor('ursoSentado'))), [{ b: 'formar', tipo: 'corrente', perto: 'urso' }]),
      cada(eu('complexo'), se({ b: 'maisPerto', n: 3 }, [atacar('soco', 'pernas')], [{ b: 'rodear', m: 2, sentido: 1 }, { b: 'espalhar' }])),
      ...SIMPLES_E_ORIGINAL(3, 1)),
  ]),
  pronta('Malabarismo', 'Juggling', [...SINAIS,
    chapeu(sempre, se(sensor('ursoNoAr'), [cada(e(clone, eu('livre')), atacar('cabecada'))])),
    FUGIR,
    chapeu(sempre,
      se(nao({ b: 'formacao', tipo: 'catapulta' }), [{ b: 'formar', tipo: 'catapulta' }], [cada(e(eu('complexo'), maior('minhaDistancia', 2)), { b: 'catapulta' })]),
      cada(eu('complexo'), { b: 'esperto' }),
      ...SIMPLES_E_ORIGINAL(3, 1)),
  ]),
  pronta('Chute na borda', 'Edge Kick', [...SINAIS, FUGIR,
    chapeu(sempre,
      se(ou(menor('ursoBorda', 2.5), menor('ursoRes', 30)), [cada(eu('complexo'), se(eu('frenteDoUrso'), [{ b: 'distrair', tipo: 'careta' }], [atacar('chute', 'barriga')]))]),
      cada(eu('complexo'), { b: 'esperto' }),
      ...SIMPLES_E_ORIGINAL(3, 1)),
  ]),
];
