// Táticas do técnico (conversa "Programação por blocos e IA dos clones", D-300 a D-499).
// Uma tática é um JSON com uma lista fechada de blocos. Ela é conferida (conferirTatica) e interpretada aqui;
// nunca vira código executado (D-304). Roda só no PC: o Quest nunca recebe a tática (D-221).
// O Tecnico entrega um "cérebro" para luta.definirCerebro (D-501). A física continua sendo da Luta:
// aqui só se decide para onde cada clone vai e o que ele tenta fazer.
//
// Regras do técnico (D-300 a D-302): chapéu (quando) + quem + condições + ações.
// - "Somar regras" ligado: o clone soma os movimentos de todas as regras que servem para ele; ações que brigam
//   entre si (atacar, parar, catapulta) não se somam: vale a regra mais alta da lista.
// - "Somar regras" desligado: vale só a primeira regra que serve.
// - Cada clone reage com atraso (0,2 a 1,2 s) e obedece ~80% das vezes (D-091); sem ordem, segue a IA mínima.
// - O original no automático recebe as ordens como qualquer clone, sem proteção especial (C26).

import type { AtaquePB, Cerebro, DecisaoTatica, OrdemClone, VisaoTatica } from './luta';
import { RINGUE, TIPOS_FORMACAO, type TipoFormacao, type V3 } from './regras';

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
export const RECUAR_DEPOIS = 1.5;      // s recuando depois de "atacar e depois recuar"

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
  | { b: 'livre' };                                  // não está tonto, caído, voando nem em formação
export type Cond =
  | { b: 'ursoSentado' } | { b: 'ursoTonto' } | { b: 'ursoNoAr' }
  | { b: 'ursoFraco'; res: number } | { b: 'ursoNaBorda'; m: number } | { b: 'equilibrio'; maisDe: number }
  | { b: 'ursoFurioso' } | { b: 'ursoHumano' }       // D-307: o urso ainda não tem esses modos (sempre falso)
  | { b: 'agua'; maisDe: number } | { b: 'clonesVivos'; maisDe: number } | { b: 'tempo'; maisDe: number }
  | { b: 'temFormacao'; tipo: TipoFormacao } | { b: 'chance'; pct: number }
  | { b: 'nao'; c: Cond } | { b: 'ou'; a: Cond; c: Cond };
export type Acao =
  | { b: 'atacar'; ataque: AtaquePB; depois?: 'recuar' }
  | { b: 'aproximar' } | { b: 'recuar' } | { b: 'parar' }
  | { b: 'rodear'; m: number; sentido: 1 | -1 }
  | { b: 'juntarNoOriginal' } | { b: 'espalhar' } | { b: 'irPara'; x: number; z: number }
  | { b: 'catapulta' } | { b: 'formar'; tipo: TipoFormacao };
export interface Regra { quando: Chapeu; quem: Quem[]; se: Cond[]; fazer: Acao[] }
export interface Tatica { versao: 1; nome: { pt: string; en: string }; somar: boolean; regras: Regra[] }

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
    case 'todos': case 'clones': case 'original': case 'complexos': case 'simples': case 'armadilhas': case 'livre': return { b: o.b };
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
    case 'ursoSentado': case 'ursoTonto': case 'ursoNoAr': case 'ursoFurioso': case 'ursoHumano': return { b: o.b };
    case 'ursoFraco': return { b: 'ursoFraco', res: numero(o.res, 0, 100, 'urso fraco') };
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
    case 'atacar': { const a: Acao = { b: 'atacar', ataque: umDe(o.ataque, ATAQUES, 'ataque') }; if (o.depois === 'recuar') a.depois = 'recuar'; return a; }
    case 'aproximar': case 'recuar': case 'parar': case 'juntarNoOriginal': case 'espalhar': case 'catapulta': return { b: o.b };
    case 'rodear': return { b: 'rodear', m: numero(o.m, 1, 5, 'rodear'), sentido: o.sentido === -1 ? -1 : 1 };
    case 'irPara': return { b: 'irPara', x: numero(o.x, -RINGUE.raio, RINGUE.raio, 'ir para'), z: numero(o.z, -RINGUE.raio, RINGUE.raio, 'ir para') };
    case 'formar': return { b: 'formar', tipo: umDe(o.tipo, TIPOS_FORMACAO, 'formação') };
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
    const t: Tatica = { versao: 1, nome: { pt: texto(n.pt, 'nome'), en: texto(n.en, 'nome') }, somar: o.somar !== false, regras };
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
interface Agente { numero: number; pos: V3; original: boolean; simples: boolean; armadilha: boolean; livre: boolean; estado: string; dUrso: number; r: Rastro }
/** Memória de cada Piranbenja entre uma pergunta e outra. Os números da rede são sorteados de novo quando nascem
 *  clones (sigilo), então o técnico reconhece cada um pela posição até a Luta ter um código fixo (para a conversa principal). */
interface Rastro {
  id: number; grupo: Grupo; nasceu: number; pos: V3;
  tipo: string; ordem: OrdemClone | null;              // decisão em vigor
  pendente: { tipo: string; ordem: OrdemClone | null } | null; valeEm: number; ignora: boolean; ignoraAte: number;
  recuarAte: number; estadoAntes: string;
}
const dist = (a: V3, b: V3) => Math.hypot(a.x - b.x, a.z - b.z);

export class Tecnico {
  tatica: Tatica | null = null;
  /** Grupo de quem nascer agora (clone sem grupo escolhido entra no alpha, C26). */
  grupoDosNovos: Grupo = 'alpha';
  readonly cerebro: Cerebro = (v) => this.pensar(v);
  /** Últimos sinais recebidos (para o PC mostrar o grito; o Quest ainda não recebe, para a conversa principal). */
  aoSinal: ((i: number) => void) | null = null;
  private rastros = new Map<number, Rastro>(); // número atual → rastro (clones)
  private rastroOriginal: Rastro | null = null;
  private proximoId = 1;
  private sinalEm = [-1e9, -1e9, -1e9, -1e9];
  private sinaisNovos: number[] = [];
  private comecouEm: number | null = null;
  private formarEm = 0;
  private tempo = 0;

  constructor(private aleatorio: () => number = Math.random) {}

  /** Troca a tática em campo (teclas 1 a 4). null = sem tática: os clones seguem a IA mínima. */
  trocar(t: Tatica | null): void { this.tatica = t; this.comecouEm = null; for (const r of this.rastros.values()) { r.tipo = ''; r.ordem = null; r.pendente = null; } }
  /** O jogador apertou a tecla de um sinal (U, I, O, P). */
  sinal(i: number): void { if (i >= 0 && i <= 3) { this.sinaisNovos.push(i); this.aoSinal?.(i); } }
  /** Grupo de um Piranbenja pelo número atual (para o PC pintar). */
  grupoDe(numero: number): Grupo | null { return this.rastros.get(numero)?.grupo ?? null; }
  /** Quantos clones há em cada grupo (para o painel do PC). */
  contarGrupos(): Record<Grupo, number> { const c = { alpha: 0, beta: 0, gamma: 0, sigma: 0 }; for (const r of this.rastros.values()) c[r.grupo]++; return c; }
  /** Muda o grupo de um Piranbenja (pintar na mini-grade, rodada do Quadro). */
  pintar(numero: number, g: Grupo): void { const r = this.rastros.get(numero); if (r) r.grupo = g; }

  private pensar(v: VisaoTatica): DecisaoTatica {
    this.tempo = v.tempo;
    for (const i of this.sinaisNovos) this.sinalEm[i] = v.tempo;
    this.sinaisNovos = [];
    const agentes = this.reconhecer(v);
    const t = this.tatica;
    if (!t) return {};
    if (this.comecouEm === null) this.comecouEm = v.tempo;
    const decisao: DecisaoTatica = { ordens: {} };
    let formar: TipoFormacao | null = null;
    // "o mais perto do urso": ordem por distância, uma vez por pergunta
    const porDistancia = [...agentes].sort((a, b) => a.dUrso - b.dUrso).map((a) => a.numero);
    const ativas = t.regras.map((r, i) => ({ r, i, vale: this.chapeuVale(r.quando, v) && r.se.every((c) => temChance(c) || this.cond(c, v, null, i)) }));
    for (const ag of agentes) {
      const servem = ativas.filter((x) => x.vale && x.r.quem.every((q) => this.quem(q, ag, v, porDistancia)) && x.r.se.every((c) => !temChance(c) || this.cond(c, v, ag, x.i)));
      const usadas = t.somar ? servem : servem.slice(0, 1);
      if (!usadas.length) { this.decidir(ag, '', null); continue; }
      let exclusiva: { tipo: string; ordem: OrdemClone } | null = null;
      let mx = 0, mz = 0, moveu = false;
      for (const { r } of usadas) {
        for (const a of r.fazer) {
          if (a.b === 'formar') { formar ??= a.tipo; continue; }
          const e = this.exclusiva(a, ag);
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
      this.decidir(ag, '', null);
    }
    for (const ag of agentes) { const o = this.ordemEmVigor(ag); if (o) decisao.ordens![ag.numero] = o; }
    // formação: uma de cada tipo, sem repetir o pedido o tempo todo
    if (formar && v.tempo >= this.formarEm && !v.formacoes.some((f) => f.tipo === formar)) { decisao.formar = formar; this.formarEm = v.tempo + RECARGA_FORMAR; }
    return decisao;
  }

  /** Reconhece cada Piranbenja (mesmo depois de os números serem sorteados de novo) e marca quem acabou de nascer. */
  private reconhecer(v: VisaoTatica): Agente[] {
    const todos = v.clones.map((c) => ({ ...c, original: false }));
    const antigos = [...this.rastros.entries()], usados = new Set<Rastro>(), novo = new Map<number, Rastro>();
    const achado = new Map<number, Rastro>();
    // 1) mesmo número e perto de onde estava
    for (const p of todos) { const r = this.rastros.get(p.numero); if (r && dist(r.pos, p.pos) < 1.0) { achado.set(p.numero, r); usados.add(r); } }
    // 2) números trocados: o rastro livre mais perto (até 1,5 m)
    for (const p of todos) {
      if (achado.has(p.numero)) continue;
      let melhor: Rastro | null = null, md = 1.5;
      for (const [, r] of antigos) { if (usados.has(r)) continue; const d = dist(r.pos, p.pos); if (d < md) { md = d; melhor = r; } }
      if (melhor) { achado.set(p.numero, melhor); usados.add(melhor); }
    }
    const lista: Agente[] = [];
    for (const p of todos) {
      let r = achado.get(p.numero);
      if (!r) r = this.novoRastro(v, p.pos);
      // ataque saiu: começa o recuo de "atacar e depois recuar"
      if (p.estado === 'atacando' && r.estadoAntes !== 'atacando' && r.ordem?.atacar && r.tipo.endsWith(':recuar')) r.recuarAte = v.tempo + RECUAR_DEPOIS;
      r.estadoAntes = p.estado; r.pos = { ...p.pos };
      novo.set(p.numero, r);
      const livre = !p.emFormacao && !['atordoado', 'caido', 'projetil', 'formacao', 'escalando'].includes(p.estado);
      lista.push({ numero: p.numero, pos: p.pos, original: p.original, simples: p.simples, armadilha: p.armadilha, livre, estado: p.estado, dUrso: p.distanciaAoUrso, r });
    }
    this.rastros = novo;
    // o original é sempre reconhecido pela visão (só existe no PC); ele também troca de lugar quando nascem clones
    if (v.original) {
      const o = v.original;
      this.rastroOriginal ??= this.novoRastro(v, o.pos);
      const r = this.rastroOriginal; r.pos = { ...o.pos };
      lista.push({ numero: o.numero, pos: o.pos, original: true, simples: false, armadilha: false, livre: true, estado: 'andando', dUrso: dist(o.pos, v.urso.cabeca), r });
    }
    return lista;
  }

  private novoRastro(v: VisaoTatica, pos: V3): Rastro {
    return { id: this.proximoId++, grupo: this.grupoDosNovos, nasceu: v.tempo, pos: { ...pos }, tipo: '', ordem: null, pendente: null, valeEm: 0, ignora: false, ignoraAte: 0, recuarAte: 0, estadoAntes: '' };
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
      case 'ursoFurioso': case 'ursoHumano': return false;
      case 'ursoFraco': return u.res < c.res;
      case 'ursoNaBorda': return Math.hypot(u.cabeca.x, u.cabeca.z) > RINGUE.raio - c.m;
      case 'equilibrio': return u.equilibrio > c.maisDe;
      case 'agua': return v.agua > c.maisDe;
      case 'clonesVivos': return v.clones.length > c.maisDe;
      case 'tempo': return v.tempo > c.maisDe;
      case 'temFormacao': return v.formacoes.some((f) => f.tipo === c.tipo);
      case 'chance': return ag ? sorteioFixo(ag.r.id, regra, Math.floor(v.tempo / 2)) * 100 < c.pct : true;
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
      case 'maisPertoDoUrso': return porDistancia.indexOf(ag.numero) < q.n;
      case 'acabouDeNascer': return v.tempo - ag.r.nasceu < q.s;
      case 'nascidoHa': return v.tempo - ag.r.nasceu >= q.s;
      case 'livre': return ag.livre;
    }
  }

  private exclusiva(a: Acao, ag: Agente): { tipo: string; ordem: OrdemClone } | null {
    if (a.b === 'atacar') return { tipo: `atacar:${a.ataque}${a.depois ? ':recuar' : ''}`, ordem: { atacar: a.ataque } };
    if (a.b === 'parar') return { tipo: 'parar', ordem: { parar: true } };
    if (a.b === 'catapulta') return ag.simples || ag.armadilha ? null : { tipo: 'catapulta', ordem: { catapulta: true } };
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
        // D-320: mira um ponto sorteado perto do original (às vezes perto de outro clone), para não entregá-lo
        const s1 = sorteioFixo(ag.r.id, 91, Math.floor(v.tempo / 3)), s2 = sorteioFixo(ag.r.id, 92, Math.floor(v.tempo / 3));
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

  /** Nova decisão para o clone: só vale depois do tempo de reação, e às vezes ele não obedece (D-091). */
  private decidir(ag: Agente, tipo: string, ordem: OrdemClone | null): void {
    const r = ag.r;
    if (tipo === r.tipo) {                                       // mesma decisão: só atualiza o alvo
      r.pendente = null;
      // a desobediência passa: depois de alguns segundos o clone volta a tentar obedecer
      if (r.ignora && this.tempo >= r.ignoraAte) r.ignora = this.aleatorio() > OBEDIENCIA, r.ignoraAte = this.tempo + DESOBEDECE;
      r.ordem = r.ignora ? null : ordem; return;
    }
    if (r.pendente && r.pendente.tipo === tipo) { r.pendente.ordem = ordem; }
    else {
      const reacao = (REACAO.min + this.aleatorio() * (REACAO.max - REACAO.min)) * (ag.simples ? REACAO.simples : 1);
      r.pendente = { tipo, ordem }; r.valeEm = this.tempo + reacao; r.ignora = tipo !== '' && this.aleatorio() > OBEDIENCIA; r.ignoraAte = r.valeEm + DESOBEDECE;
    }
    if (this.tempo >= r.valeEm) { r.tipo = tipo; r.ordem = r.ignora ? null : ordem; r.pendente = null; }
  }
  private ordemEmVigor(ag: Agente): OrdemClone | null { return ag.r.ordem; }
}

const temChance = (c: Cond): boolean => c.b === 'chance' || (c.b === 'nao' && temChance(c.c)) || (c.b === 'ou' && (temChance(c.a) || temChance(c.c)));
/** Sorteio repetível (0..1) por clone, regra e janela de tempo: "com chance de 30%" não pisca a cada 0,25 s. */
function sorteioFixo(a: number, b: number, c: number): number {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// ---------------- táticas prontas (iniciantes, D-313) ----------------
// Os quatro sinais valem em todas: U recua, I ataca junto, O monta muralha, P manda a fila.
const SINAIS: Regra[] = [
  { quando: { b: 'sinal', sinal: 0 }, quem: [{ b: 'clones' }], se: [], fazer: [{ b: 'recuar' }, { b: 'espalhar' }] },
  { quando: { b: 'sinal', sinal: 1 }, quem: [{ b: 'clones' }, { b: 'livre' }], se: [], fazer: [{ b: 'atacar', ataque: 'soco' }] },
  { quando: { b: 'sinal', sinal: 2 }, quem: [{ b: 'todos' }], se: [], fazer: [{ b: 'formar', tipo: 'muralha' }] },
  { quando: { b: 'sinal', sinal: 3 }, quem: [{ b: 'todos' }], se: [], fazer: [{ b: 'formar', tipo: 'fila' }] },
];
const sempre: Chapeu = { b: 'sempre' };
export const TATICAS_PRONTAS: Tatica[] = [
  { versao: 1, nome: { pt: 'Enxame', en: 'Swarm' }, somar: true, regras: [...SINAIS,
    // os 4 mais perto atacam; os outros complexos rodeiam esperando a vez (todos juntos, o urso pega todos de tabela)
    { quando: sempre, quem: [{ b: 'complexos' }, { b: 'maisPertoDoUrso', n: 4 }], se: [], fazer: [{ b: 'atacar', ataque: 'soco' }] },
    { quando: sempre, quem: [{ b: 'complexos' }], se: [], fazer: [{ b: 'rodear', m: 2.2, sentido: 1 }] },
    { quando: sempre, quem: [{ b: 'simples' }], se: [], fazer: [{ b: 'atacar', ataque: 'tapa' }] },
    { quando: sempre, quem: [{ b: 'original' }], se: [], fazer: [{ b: 'rodear', m: 2.5, sentido: 1 }] },
  ] },
  { versao: 1, nome: { pt: 'Morde e foge', en: 'Bite and Run' }, somar: true, regras: [...SINAIS,
    { quando: sempre, quem: [{ b: 'complexos' }], se: [], fazer: [{ b: 'atacar', ataque: 'morder', depois: 'recuar' }] },
    { quando: sempre, quem: [{ b: 'simples' }], se: [], fazer: [{ b: 'atacar', ataque: 'tapa', depois: 'recuar' }] },
    { quando: sempre, quem: [{ b: 'original' }], se: [], fazer: [{ b: 'rodear', m: 3, sentido: -1 }] },
  ] },
  { versao: 1, nome: { pt: 'Derruba e bate', en: 'Trip and Pound' }, somar: true, regras: [...SINAIS,
    { quando: sempre, quem: [{ b: 'complexos' }], se: [{ b: 'ursoSentado' }], fazer: [{ b: 'atacar', ataque: 'chute' }] },
    { quando: sempre, quem: [{ b: 'simples' }], se: [{ b: 'ursoSentado' }], fazer: [{ b: 'atacar', ataque: 'tapa' }] },
    { quando: sempre, quem: [{ b: 'todos' }], se: [{ b: 'nao', c: { b: 'temFormacao', tipo: 'corrente' } }, { b: 'nao', c: { b: 'ursoSentado' } }], fazer: [{ b: 'formar', tipo: 'corrente' }] },
    { quando: sempre, quem: [{ b: 'complexos' }], se: [], fazer: [{ b: 'rodear', m: 2, sentido: 1 }] },
    { quando: sempre, quem: [{ b: 'simples' }], se: [], fazer: [{ b: 'atacar', ataque: 'tapa' }] },
    { quando: sempre, quem: [{ b: 'original' }], se: [], fazer: [{ b: 'rodear', m: 3, sentido: 1 }] },
  ] },
  { versao: 1, nome: { pt: 'Malabarismo', en: 'Juggling' }, somar: true, regras: [...SINAIS,
    { quando: sempre, quem: [{ b: 'clones' }, { b: 'livre' }], se: [{ b: 'ursoNoAr' }], fazer: [{ b: 'atacar', ataque: 'cabecada' }] },
    { quando: sempre, quem: [{ b: 'todos' }], se: [{ b: 'nao', c: { b: 'temFormacao', tipo: 'catapulta' } }], fazer: [{ b: 'formar', tipo: 'catapulta' }] },
    { quando: sempre, quem: [{ b: 'complexos' }, { b: 'longeDoUrso', m: 2 }], se: [{ b: 'temFormacao', tipo: 'catapulta' }], fazer: [{ b: 'catapulta' }] },
    { quando: sempre, quem: [{ b: 'complexos' }], se: [], fazer: [{ b: 'atacar', ataque: 'soco' }] },
    { quando: sempre, quem: [{ b: 'simples' }], se: [], fazer: [{ b: 'atacar', ataque: 'tapa' }] },
    { quando: sempre, quem: [{ b: 'original' }], se: [], fazer: [{ b: 'rodear', m: 3, sentido: 1 }] },
  ] },
  { versao: 1, nome: { pt: 'Chute na borda', en: 'Edge Kick' }, somar: true, regras: [...SINAIS,
    { quando: sempre, quem: [{ b: 'complexos' }], se: [{ b: 'ou', a: { b: 'ursoNaBorda', m: 2.5 }, c: { b: 'ursoFraco', res: 30 } }], fazer: [{ b: 'atacar', ataque: 'chute' }] },
    { quando: sempre, quem: [{ b: 'complexos' }], se: [], fazer: [{ b: 'atacar', ataque: 'soco' }] },
    { quando: sempre, quem: [{ b: 'simples' }], se: [], fazer: [{ b: 'atacar', ataque: 'tapa' }] },
    { quando: sempre, quem: [{ b: 'original' }], se: [], fazer: [{ b: 'rodear', m: 3, sentido: 1 }] },
  ] },
];
