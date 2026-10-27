// Quadro do técnico (conversa "Programação por blocos e IA dos clones", D-309, D-311, D-337 a D-340).
// Fica à direita (um terço da tela), a luta não pausa. Blocos no jeito do Scratch (Blockly, formato 2 das táticas):
// o Quadro só MONTA o JSON; quem confere e interpreta é src/simulacao/taticas.ts (nada vira código executado, D-304).
// As táticas não são salvas (C30: o autor quer testar a programação ao vivo); recarregar a página volta às prontas.
// Mini-grade: ringue de cima com os clones de verdade; pincel, clique, arrastar, + e − (D-339). Sinais no pé (D-337).

import * as Blockly from 'blockly/core';
import * as MsgPt from 'blockly/msg/pt-br';
import * as MsgEn from 'blockly/msg/en';
import type { Luta } from '../simulacao/luta';
import {
  COR_GRUPO, GRUPOS, MAX_BLOCOS, PALAVRAS_CODIGO, TATICAS_PRONTAS, conferirTatica,
  type Bool, type Comando, type Grupo, type Num, type Tatica, type Tecnico,
} from '../simulacao/taticas';
import { LINGUA } from '../textos';

const EN = LINGUA === 'en';
const L = (pt: string, en: string) => (EN ? en : pt);
type Op = [string, string, string]; // pt, en, valor
const op = (lista: Op[]) => lista.map(([pt, en, v]) => [EN ? en : pt, v] as [string, string]);

const TXT = {
  titulo: L('Quadro do técnico', 'Coach board'),
  emCampo: L('Em campo', 'On the field'), nenhuma: L('nenhuma (IA mínima)', 'none (basic AI)'),
  carregar: L('Trocar pela pronta…', 'Load a ready tactic…'),
  somar: L('Somar regras', 'Add up rules'), gerar: L('Original pode gerar clones', 'Original may make clones'),
  itens: L('Original pode usar itens', 'Original may use items'), camera: L('Câmera de técnico', 'Coach camera'),
  aplicar: L('Aplicar (Enter)', 'Apply (Enter)'), blocos: L('blocos', 'blocks'),
  naoAplicado: L('rascunho ainda não aplicado', 'draft not applied yet'), aplicado: L('em campo', 'on the field'),
  pincel: L('pincel', 'brush'), novos: L('Clones novos vão para', 'New clones go to'),
  dicaGrade: L('Clique no nome = pincel · clique ou arraste no ringue = pintar · + puxa o mais perto · − devolve o mais longe',
    'Click a name = brush · click or drag on the ring = paint · + pulls the nearest · − returns the farthest'),
  sinais: L('Sinais', 'Signals'), fechar: L('Tab fecha', 'Tab closes'),
  menos: L('tirar um clone do grupo', 'remove one clone from the group'), mais: L('pôr mais um clone no grupo', 'add one more clone to the group'),
};

// ---------------- blocos (mesma lista fechada do jogo) ----------------
const COR = { eventos: '#7b4fd6', controle: '#c9862a', sensores: '#2a9d97', operadores: '#4f9d3a', valores: '#3a8fb7', mover: '#3f62d6', atacar: '#c4473d', time: '#8a5fd6', distrair: '#c2478e' };
const TECLA = ['U', 'I', 'O', 'P'];
const OP = {
  quando: op([['sempre', 'always', 'sempre'], ...TECLA.map((k, i): Op => [`receber o sinal ${k}`, `I get signal ${k}`, 'sinal' + i]), ['a tática começar', 'the tactic starts', 'comeco']]),
  eu: op([['eu sou complexo', 'I am complex', 'complexo'], ['eu sou simples', 'I am simple', 'simples'], ['eu sou armadilha', 'I am a trap', 'armadilha'],
    ['eu sou o original', 'I am the original', 'original'], ['estou livre (não tonto)', 'I am free (not dizzy)', 'livre'], ['estou machucado', 'I am hurt', 'machucado'],
    ['estou grudado no urso', 'I am stuck to the bear', 'grudado'], ['estou no ar', 'I am in the air', 'noAr'], ['estou atrás do urso', 'I am behind the bear', 'atrasDoUrso'],
    ['estou na frente do urso', 'I am in front of the bear', 'frenteDoUrso']]),
  sensor: op([['o urso está sentado', 'the bear is sitting', 'ursoSentado'], ['o urso está tonto', 'the bear is dizzy', 'ursoTonto'], ['o urso está no ar', 'the bear is in the air', 'ursoNoAr'],
    ['o urso está agarrando alguém', 'the bear is grabbing someone', 'ursoAgarrando'], ['o urso está furioso', 'the bear is furious', 'ursoFurioso'],
    ['o urso está humano', 'the bear is human', 'ursoHumano'], ['o original está no ar', 'the original is in the air', 'originalNoAr']]),
  valor: op([['resistência do urso', 'bear toughness', 'ursoRes'], ['equilíbrio do urso', 'bear balance', 'ursoEquilibrio'], ['distância do urso à borda', 'bear distance to edge', 'ursoBorda'],
    ['água', 'water', 'agua'], ['clones vivos', 'clones alive', 'clonesVivos'], ['tempo de luta', 'fight time', 'tempo'], ['minha distância ao urso', 'my distance to bear', 'minhaDistancia'],
    ['minha resistência (%)', 'my toughness (%)', 'minhaRes'], ['minha idade (s)', 'my age (s)', 'minhaIdade'], ['minha distância ao original', 'my distance to original', 'distanciaOriginal'],
    ['resistência do original', 'original toughness', 'originalRes']]),
  grupo: GRUPOS.map((g) => [g, g] as [string, string]),
  formacao: op([['muralha', 'wall', 'muralha'], ['catapulta', 'catapult', 'catapulta'], ['torre', 'tower', 'torre'], ['pirâmide', 'pyramid', 'piramide'], ['corrente', 'chain', 'corrente'], ['fila', 'line', 'fila']]),
  ataque: op([['soco', 'punch', 'soco'], ['chute', 'kick', 'chute'], ['cabeçada', 'headbutt', 'cabecada'], ['tapa', 'slap', 'tapa'], ['mordida', 'bite', 'morder']]),
  mira: op([['qualquer parte', 'any part', ''], ['as pernas', 'the legs', 'pernas'], ['a barriga', 'the belly', 'barriga'], ['a cabeça', 'the head', 'cabeca'], ['os braços', 'the arms', 'bracos']]),
  mover: op([['ir para perto do urso', 'go near the bear', 'aproximar'], ['recuar', 'back off', 'recuar'], ['parar', 'stop', 'parar'], ['rolar para fugir', 'roll away', 'rolar'],
    ['juntar perto do original', 'gather near the original', 'juntarNoOriginal'], ['espalhar', 'spread out', 'espalhar'], ['ir para a catapulta', 'go to the catapult', 'catapulta']]),
};
let definidos = false;
function definirBlocos(): void {
  if (definidos) return; definidos = true;
  const dd = (name: string, options: [string, string][]) => ({ type: 'field_dropdown', name, options });
  const nf = (name: string, value: number, min: number, max: number) => ({ type: 'field_number', name, value, min, max });
  const cmd = (type: string, message0: string, args0: unknown[], colour: string) => ({ type, message0, args0, previousStatement: null, nextStatement: null, colour });
  const hex = (type: string, message0: string, args0: unknown[], colour: string) => ({ type, message0, args0, output: 'Boolean', colour });
  const bool = (name: string) => ({ type: 'input_value', name, check: 'Boolean' });
  Blockly.defineBlocksWithJsonArray([
    { type: 'chapeu', message0: L('quando %1', 'when %1'), args0: [dd('QUANDO', OP.quando)], nextStatement: null, colour: COR.eventos },
    { type: 'paraCada', message0: L('para cada clone que %1', 'for each clone that %1'), args0: [bool('FILTRO')], message1: '%1', args1: [{ type: 'input_statement', name: 'CORPO' }], previousStatement: null, nextStatement: null, colour: COR.controle },
    { type: 'se', message0: L('se %1 então', 'if %1 then'), args0: [bool('COND')], message1: '%1', args1: [{ type: 'input_statement', name: 'ENTAO' }], previousStatement: null, nextStatement: null, colour: COR.controle },
    { type: 'se_senao', message0: L('se %1 então', 'if %1 then'), args0: [bool('COND')], message1: '%1', args1: [{ type: 'input_statement', name: 'ENTAO' }], message2: L('senão %1', 'else %1'), args2: [{ type: 'input_statement', name: 'SENAO' }], previousStatement: null, nextStatement: null, colour: COR.controle },
    hex('b_eu', '%1', [dd('S', OP.eu)], COR.sensores),
    hex('b_sensor', '%1', [dd('S', OP.sensor)], COR.sensores),
    hex('b_grupo', L('sou do grupo %1', 'I am in group %1'), [dd('G', OP.grupo)], COR.sensores),
    hex('b_maisPerto', L('estou entre os %1 mais perto do urso', 'I am among the %1 nearest the bear'), [nf('N', 3, 1, 30)], COR.sensores),
    hex('b_formacao', L('existe uma %1', 'there is a %1'), [dd('F', OP.formacao)], COR.sensores),
    { type: 'b_compara', message0: '%1 %2 %3', args0: [{ type: 'input_value', name: 'A', check: 'Number' }, dd('OP', [['<', '<'], ['>', '>'], ['=', '=']]), { type: 'input_value', name: 'B', check: 'Number' }], inputsInline: true, output: 'Boolean', colour: COR.operadores },
    { type: 'b_e', message0: L('%1 e %2', '%1 and %2'), args0: [bool('A'), bool('B')], inputsInline: true, output: 'Boolean', colour: COR.operadores },
    { type: 'b_ou', message0: L('%1 ou %2', '%1 or %2'), args0: [bool('A'), bool('B')], inputsInline: true, output: 'Boolean', colour: COR.operadores },
    { type: 'b_nao', message0: L('não %1', 'not %1'), args0: [bool('A')], output: 'Boolean', colour: COR.operadores },
    hex('b_chance', L('com chance de %1 %%', 'with %1 %% chance'), [nf('N', 30, 0, 100)], COR.operadores),
    { type: 'r_valor', message0: '%1', args0: [dd('V', OP.valor)], output: 'Number', colour: COR.valores },
    { type: 'r_numero', message0: '%1', args0: [nf('NUM', 0, -1000, 1000)], output: 'Number', colour: '#ffffff' },
    cmd('a_atacar', L('atacar com %1 mirando %2', 'attack with %1 aiming at %2'), [dd('A', OP.ataque), dd('M', OP.mira)], COR.atacar),
    cmd('a_atacar_recuar', L('atacar com %1 mirando %2 e depois recuar', 'attack with %1 aiming at %2 then back off'), [dd('A', OP.ataque), dd('M', OP.mira)], COR.atacar),
    cmd('a_esperto', L('pensar sozinho (IA esperta)', 'think alone (smart AI)'), [], COR.atacar),
    cmd('a_mover', '%1', [dd('V', OP.mover)], COR.mover),
    cmd('a_rodear', L('rodear o urso a %1 m %2', 'circle the bear at %1 m %2'), [nf('M', 2, 1, 5), dd('S', [[L('no sentido do relógio', 'clockwise'), '1'], [L('contra o relógio', 'counterclockwise'), '-1']])], COR.mover),
    cmd('a_grupo', L('entrar no grupo %1', 'join group %1'), [dd('G', OP.grupo)], COR.time),
    cmd('a_formar', L('montar %1 perto %2 com %3', 'build %1 near %2 with %3'), [dd('F', OP.formacao), dd('P', [[L('do original', 'the original'), 'original'], [L('do urso', 'the bear'), 'urso']]),
      dd('G', [[L('os mais perto', 'the nearest'), ''], ...GRUPOS.map((g) => [L('o grupo ', 'group ') + g, g] as [string, string])])], COR.time),
    cmd('a_criar', L('criar %1 clones %2', 'make %1 clones %2'), [nf('N', 2, 1, 8), dd('T', [[L('complexos', 'complex'), 'c'], [L('simples', 'simple'), 's']])], COR.time),
    cmd('a_gritar', L('gritar %1', 'shout %1'), [dd('P', PALAVRAS_CODIGO.map((p, i) => [EN ? p.en : p.pt, String(i)] as [string, string]))], COR.time),
    cmd('a_distrair', L('fazer %1', 'do %1'), [dd('D', [[L('dancinha', 'little dance'), 'dancinha'], [L('careta', 'funny face'), 'careta'], [L('pose bizarra', 'bizarre pose'), 'pose']])], COR.distrair),
  ]);
}
const NUM = (v = 0) => ({ shadow: { type: 'r_numero', fields: { NUM: v } } });
const bl = (type: string, extra: object = {}) => ({ kind: 'block', type, ...extra });
const TOOLBOX = () => ({ kind: 'categoryToolbox', contents: [
  { kind: 'category', name: L('Eventos', 'Events'), colour: COR.eventos, contents: [bl('chapeu')] },
  { kind: 'category', name: L('Controle', 'Control'), colour: COR.controle, contents: [bl('paraCada'), bl('se'), bl('se_senao')] },
  { kind: 'category', name: L('Sensores', 'Sensing'), colour: COR.sensores, contents: [bl('b_eu'), bl('b_sensor'), bl('b_grupo'), bl('b_maisPerto'), bl('b_formacao')] },
  { kind: 'category', name: L('Operadores', 'Operators'), colour: COR.operadores, contents: [bl('b_compara', { inputs: { A: { block: { type: 'r_valor' } }, B: NUM(30) } }), bl('b_compara', { inputs: { A: NUM(0), B: NUM(0) } }), bl('b_e'), bl('b_ou'), bl('b_nao'), bl('b_chance')] },
  { kind: 'category', name: L('Valores', 'Values'), colour: COR.valores, contents: OP.valor.map(([, v]) => bl('r_valor', { fields: { V: v } })) },
  { kind: 'category', name: L('Mover', 'Move'), colour: COR.mover, contents: [bl('a_mover'), bl('a_mover', { fields: { V: 'rolar' } }), bl('a_rodear')] },
  { kind: 'category', name: L('Atacar', 'Attack'), colour: COR.atacar, contents: [bl('a_atacar'), bl('a_atacar_recuar'), bl('a_esperto')] },
  { kind: 'category', name: L('Time', 'Team'), colour: COR.time, contents: [bl('a_grupo'), bl('a_formar'), bl('a_criar'), bl('a_gritar')] },
  { kind: 'category', name: L('Distrair', 'Distract'), colour: COR.distrair, contents: [bl('a_distrair')] },
] });

// ---------------- tática (JSON) → blocos ----------------
type B = Record<string, unknown>;
function numBloco(n: Num): B { return 'n' in n ? NUM(n.n) : { ...NUM(0), block: { type: 'r_valor', fields: { V: n.valor } } }; }
function boolBloco(c: Bool | null): B | undefined {
  if (!c) return undefined;
  switch (c.b) {
    case 'e': case 'ou': return { type: 'b_' + c.b, inputs: { A: { block: boolBloco(c.a) }, B: { block: boolBloco(c.c) } } };
    case 'nao': return { type: 'b_nao', inputs: { A: { block: boolBloco(c.a) } } };
    case 'compara': return { type: 'b_compara', fields: { OP: c.op }, inputs: { A: numBloco(c.a), B: numBloco(c.c) } };
    case 'sensor': return { type: 'b_sensor', fields: { S: c.s } };
    case 'eu': return { type: 'b_eu', fields: { S: c.s } };
    case 'grupo': return { type: 'b_grupo', fields: { G: c.grupo } };
    case 'maisPerto': return { type: 'b_maisPerto', fields: { N: c.n } };
    case 'formacao': return { type: 'b_formacao', fields: { F: c.tipo } };
    case 'chance': return { type: 'b_chance', fields: { N: c.pct } };
  }
}
function cmdBloco(c: Comando): B {
  switch (c.b) {
    case 'paraCada': { const o: B & { inputs: B } = { type: 'paraCada', inputs: {} }; if (c.filtro) o.inputs.FILTRO = { block: boolBloco(c.filtro) }; if (c.corpo.length) o.inputs.CORPO = { block: pilhaBloco(c.corpo) }; return o; }
    case 'se': { const o: B & { inputs: B } = { type: c.senao ? 'se_senao' : 'se', inputs: {} }; if (c.cond) o.inputs.COND = { block: boolBloco(c.cond) };
      if (c.entao.length) o.inputs.ENTAO = { block: pilhaBloco(c.entao) }; if (c.senao?.length) o.inputs.SENAO = { block: pilhaBloco(c.senao) }; return o; }
    case 'atacar': return c.depois ? { type: 'a_atacar_recuar', fields: { A: c.ataque, M: c.mirar ?? '' } } : { type: 'a_atacar', fields: { A: c.ataque, M: c.mirar ?? '' } };
    case 'esperto': return { type: 'a_esperto' };
    case 'rodear': return { type: 'a_rodear', fields: { M: c.m, S: String(c.sentido) } };
    case 'entrarGrupo': return { type: 'a_grupo', fields: { G: c.grupo } };
    case 'formar': return { type: 'a_formar', fields: { F: c.tipo, P: c.perto ?? 'original', G: c.grupo ?? '' } };
    case 'criarClones': return { type: 'a_criar', fields: { N: c.quantos, T: c.simples ? 's' : 'c' } };
    case 'gritar': return { type: 'a_gritar', fields: { P: String(c.palavra) } };
    case 'distrair': return { type: 'a_distrair', fields: { D: c.tipo } };
    default: return { type: 'a_mover', fields: { V: c.b } };
  }
}
function pilhaBloco(lista: Comando[]): B | null { return lista.map(cmdBloco).reduceRight<B | null>((prox, b) => (prox ? { ...b, next: { block: prox } } : b), null); }
function taticaBlocos(t: Tatica): object {
  return { blocks: { languageVersion: 0, blocks: t.regras.map((rg, i) => {
    const q = rg.quando.b === 'sempre' ? 'sempre' : rg.quando.b === 'comeco' ? 'comeco' : 'sinal' + rg.quando.sinal;
    const b: B = { type: 'chapeu', fields: { QUANDO: q }, x: 20, y: 20 + i * 40 }; const p = pilhaBloco(rg.corpo); if (p) b.next = { block: p };
    return b;
  }) } };
}

// ---------------- blocos → tática (JSON do formato 2; quem confere é conferirTatica) ----------------
type BB = Blockly.Block | null;
function numJSON(b: BB): Num { if (!b) return { n: 0 }; if (b.type === 'r_numero') return { n: Number(b.getFieldValue('NUM')) }; return { valor: b.getFieldValue('V') } as Num; }
function boolJSON(b: BB): Bool | null {
  if (!b) return null;
  const v = (n: string) => b.getFieldValue(n), x = (n: string) => b.getInputTargetBlock(n);
  switch (b.type) {
    case 'b_e': case 'b_ou': { const a = boolJSON(x('A')), c = boolJSON(x('B')); if (!a || !c) return a ?? c; return { b: b.type === 'b_e' ? 'e' : 'ou', a, c }; }
    case 'b_nao': { const a = boolJSON(x('A')); return a ? { b: 'nao', a } : null; }
    case 'b_compara': return { b: 'compara', op: v('OP'), a: numJSON(x('A')), c: numJSON(x('B')) } as Bool;
    case 'b_sensor': return { b: 'sensor', s: v('S') } as Bool;
    case 'b_eu': return { b: 'eu', s: v('S') } as Bool;
    case 'b_grupo': return { b: 'grupo', grupo: v('G') } as Bool;
    case 'b_maisPerto': return { b: 'maisPerto', n: Number(v('N')) };
    case 'b_formacao': return { b: 'formacao', tipo: v('F') } as Bool;
    case 'b_chance': return { b: 'chance', pct: Number(v('N')) } as Bool;
  }
  return null;
}
function pilhaJSON(b: BB): Comando[] {
  const out: Comando[] = [];
  for (; b; b = b.getNextBlock()) {
    const blk = b, v = (n: string) => blk.getFieldValue(n), x = (n: string) => blk.getInputTargetBlock(n);
    switch (blk.type) {
      case 'paraCada': out.push({ b: 'paraCada', filtro: boolJSON(x('FILTRO')), corpo: pilhaJSON(x('CORPO')) }); break;
      case 'se': out.push({ b: 'se', cond: boolJSON(x('COND')) as Bool, entao: pilhaJSON(x('ENTAO')) }); break;
      case 'se_senao': out.push({ b: 'se', cond: boolJSON(x('COND')) as Bool, entao: pilhaJSON(x('ENTAO')), senao: pilhaJSON(x('SENAO')) }); break;
      case 'a_atacar': { const o: B = { b: 'atacar', ataque: v('A') }; if (v('M')) o.mirar = v('M'); out.push(o as Comando); break; }
      case 'a_atacar_recuar': { const o: B = { b: 'atacar', ataque: v('A'), depois: 'recuar' }; if (v('M')) o.mirar = v('M'); out.push(o as Comando); break; }
      case 'a_esperto': out.push({ b: 'esperto' }); break;
      case 'a_mover': out.push({ b: v('V') } as Comando); break;
      case 'a_rodear': out.push({ b: 'rodear', m: Number(v('M')), sentido: Number(v('S')) } as Comando); break;
      case 'a_grupo': out.push({ b: 'entrarGrupo', grupo: v('G') } as Comando); break;
      case 'a_formar': { const o: B = { b: 'formar', tipo: v('F'), perto: v('P') }; if (v('G')) o.grupo = v('G'); out.push(o as Comando); break; }
      case 'a_criar': out.push({ b: 'criarClones', quantos: Number(v('N')), simples: v('T') === 's' }); break;
      case 'a_gritar': out.push({ b: 'gritar', palavra: Number(v('P')) }); break;
      case 'a_distrair': out.push({ b: 'distrair', tipo: v('D') } as Comando); break;
    }
  }
  return out;
}

// ---------------- o Quadro ----------------
export interface OpcoesQuadro {
  raiz: HTMLElement; luta: Luta; tecnico: Tecnico; slots: (Tatica | null)[];
  /** aba em campo (1 a 4; 0 = nenhuma) */
  ativa(): number;
  /** põe a tática conferida em campo, na aba i (1 a 4) */
  aplicar(i: number, t: Tatica): void;
  camera: { ligada: boolean; mistura: number };
}
export interface Quadro { el: HTMLElement; mostrar(aberto: boolean): void; verAba(i: number): void; aplicarAba(): void; atualizar(): void; estado(): { aba: number; blocos: number; erro: string; alterado: boolean } }

export function criarQuadro(o: OpcoesQuadro): Quadro {
  definirBlocos();
  Blockly.setLocale((EN ? MsgEn : MsgPt) as unknown as { [k: string]: string });
  const el = document.createElement('aside');
  el.className = 'quadro'; el.hidden = true; el.setAttribute('aria-label', TXT.titulo);
  const nome = (t: Tatica | null) => (t ? (EN ? t.nome.en : t.nome.pt) : '—');
  el.innerHTML = `
    <header><strong>${TXT.titulo}</strong><span class="emcampo"></span><small>${TXT.fechar}</small></header>
    <nav class="abas">${[1, 2, 3, 4].map((i) => `<button type="button" class="aba" data-aba="${i}"></button>`).join('')}</nav>
    <div class="opcoes">
      <select class="carregar" aria-label="${TXT.carregar}"><option value="">${TXT.carregar}</option>${TATICAS_PRONTAS.map((t, i) => `<option value="${i}">${nome(t)}</option>`).join('')}</select>
      <label><input type="checkbox" data-op="somar"> ${TXT.somar}</label>
      <label><input type="checkbox" data-op="gerar"> ${TXT.gerar}</label>
      <label><input type="checkbox" data-op="itens"> ${TXT.itens}</label>
      <label><input type="checkbox" data-op="camera"> ${TXT.camera}</label>
    </div>
    <div class="blockly"></div>
    <div class="aplicar"><span class="conta"></span><span class="msg"></span><button type="button" class="botao principal">${TXT.aplicar}</button></div>
    <section class="grade">
      <svg viewBox="-6.6 -6.6 13.2 13.2" aria-hidden="true"></svg>
      <div class="lado"><div class="grupos"></div><div class="novos"></div><small>${TXT.dicaGrade}</small></div>
    </section>
    <footer class="sinais"><b>${TXT.sinais}</b>${TECLA.map((k, i) => `<button type="button" data-sinal="${i}"><kbd>${k}</kbd> ${EN ? PALAVRAS_CODIGO[i].en : PALAVRAS_CODIGO[i].pt}</button>`).join('')}</footer>`;
  o.raiz.appendChild(el);
  const $ = <E extends Element>(s: string) => el.querySelector(s) as E;
  const caixa = $<HTMLDivElement>('.blockly'), conta = $<HTMLElement>('.conta'), msg = $<HTMLElement>('.msg');
  const chk = (n: string) => $<HTMLInputElement>(`[data-op="${n}"]`);
  chk('camera').checked = o.camera.ligada;
  chk('camera').addEventListener('change', () => { o.camera.ligada = chk('camera').checked; });

  // um rascunho por aba (só na memória: nada é salvo, C30)
  const rascunho: (object | null)[] = [null, null, null, null, null];
  const nomes: (Tatica['nome'] | null)[] = o.slots.map((t) => t?.nome ?? null);
  const alterado = [false, false, false, false, false];
  const base: string[] = ['', '', '', '', '']; // o que a aba mostrava ao carregar a tática em campo (ou ao aplicar)
  const chave = () => { const r = conferirTatica(dadosDaTela()); return r.ok ? JSON.stringify(r.tatica) : '!'; };
  let aba = Math.max(1, o.ativa()), ws: Blockly.WorkspaceSvg | null = null, ultimo = { blocos: 0, erro: '' };

  function montar(): void {
    if (ws) return;
    const tema = Blockly.Theme.defineTheme('lutcha', { name: 'lutcha', base: Blockly.Themes.Classic, startHats: true,
      componentStyles: { workspaceBackgroundColour: '#0a1720', toolboxBackgroundColour: '#183449', toolboxForegroundColour: '#e8f3f2', flyoutBackgroundColour: '#12283a',
        flyoutForegroundColour: '#e8f3f2', flyoutOpacity: 0.97, scrollbarColour: '#2a4a60', insertionMarkerColour: '#8fd651', cursorColour: '#8fd651' },
      fontStyle: { family: 'Nunito, sans-serif', weight: '700', size: 11 } });
    ws = Blockly.inject(caixa, { toolbox: TOOLBOX(), theme: tema, renderer: 'zelos', trashcan: false, sounds: false, media: `${import.meta.env.BASE_URL}blockly/`, // imagens do Blockly dentro do jogo (offline)
     
      zoom: { controls: false, startScale: 0.62, minScale: 0.35, maxScale: 1.4, pinch: true, wheel: true }, grid: { spacing: 24, length: 2, colour: '#16303f', snap: true },
      move: { scrollbars: true, drag: true, wheel: false } });
    ws.addChangeListener((e) => { if (!e.isUiEvent) atualizar(); }); // "não aplicado" sai da comparação com a tática em campo
    carregarAba(aba);
  }
  function dadosDaTela(): Tatica {
    const regras = ws ? ws.getTopBlocks(true).filter((b) => b.type === 'chapeu').map((b) => {
      const q = b.getFieldValue('QUANDO') as string;
      return { quando: q === 'sempre' ? { b: 'sempre' as const } : q === 'comeco' ? { b: 'comeco' as const } : { b: 'sinal' as const, sinal: Number(q.slice(5)) }, corpo: pilhaJSON(b.getNextBlock()) };
    }) : [];
    const n = nomes[aba - 1] ?? { pt: `Tática ${aba}`, en: `Tactic ${aba}` };
    return { versao: 2, nome: n, somar: chk('somar').checked, original: { gerarClones: chk('gerar').checked, usarItens: chk('itens').checked }, regras } as Tatica;
  }
  function carregarAba(i: number): void {
    if (!ws) return;
    try {
      ws.clear();
      const salvo = rascunho[i], t = o.slots[i - 1];
      if (salvo) Blockly.serialization.workspaces.load(salvo, ws);
      else if (t) { Blockly.serialization.workspaces.load(taticaBlocos(t), ws); ws.cleanUp(); }
      const base = t ?? TATICAS_PRONTAS[0];
      if (!salvo) { chk('somar').checked = base.somar; chk('gerar').checked = base.original.gerarClones; chk('itens').checked = base.original.usarItens; }
    } catch { /* rascunho estragado: aba vazia */ }
    if (!rascunho[i]) base[i] = chave();
    atualizar();
  }
  function guardarAba(): void { if (ws) rascunho[aba] = Blockly.serialization.workspaces.save(ws); }
  function verAba(i: number): void {
    if (i < 1 || i > 4) return;
    if (i !== aba) { guardarAba(); aba = i; carregarAba(i); }
    desenharTopo();
  }
  function atualizar(): void {
    const r = conferirTatica(dadosDaTela());
    ultimo = r.ok ? { blocos: r.blocos, erro: '' } : { blocos: 0, erro: r.erro };
    alterado[aba] = !r.ok || JSON.stringify(r.tatica) !== base[aba];
    conta.textContent = r.ok ? `${r.blocos} / ${MAX_BLOCOS} ${TXT.blocos}` : '';
    conta.classList.toggle('passou', !r.ok);
    msg.textContent = !r.ok ? r.erro : alterado[aba] || o.ativa() !== aba ? TXT.naoAplicado : TXT.aplicado;
    msg.className = 'msg' + (!r.ok ? ' erro' : alterado[aba] || o.ativa() !== aba ? ' rascunho' : ' ok');
    desenharTopo();
  }
  function aplicarAba(): void {
    const r = conferirTatica(dadosDaTela());
    if (!r.ok) { atualizar(); return; }
    o.slots[aba - 1] = r.tatica; base[aba] = JSON.stringify(r.tatica); guardarAba();
    o.aplicar(aba, r.tatica);
    atualizar();
  }
  function desenharTopo(): void {
    const a = o.ativa();
    $<HTMLElement>('.emcampo').textContent = `${TXT.emCampo}: ${a ? `${a} · ${nome(o.slots[a - 1])}` : TXT.nenhuma}`;
    el.querySelectorAll<HTMLButtonElement>('.aba').forEach((b) => {
      const i = Number(b.dataset.aba), t = nomes[i - 1];
      b.textContent = `${i} · ${t ? (EN ? t.en : t.pt) : '—'}${alterado[i] ? ' *' : ''}`;
      b.setAttribute('aria-pressed', String(i === aba)); b.classList.toggle('campo', i === a);
    });
  }
  el.querySelector('.abas')!.addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.aba'); if (b) verAba(Number(b.dataset.aba)); });
  $<HTMLButtonElement>('.aplicar button').addEventListener('click', aplicarAba);
  for (const n of ['somar', 'gerar', 'itens']) chk(n).addEventListener('change', () => atualizar());
  $<HTMLSelectElement>('.carregar').addEventListener('change', (e) => {
    const s = e.target as HTMLSelectElement, t = TATICAS_PRONTAS[Number(s.value)]; s.value = '';
    if (!t || !ws) return;
    nomes[aba - 1] = t.nome; rascunho[aba] = null;
    try { ws.clear(); Blockly.serialization.workspaces.load(taticaBlocos(t), ws); ws.cleanUp(); } catch { /* nada */ }
    chk('somar').checked = t.somar; chk('gerar').checked = t.original.gerarClones; chk('itens').checked = t.original.usarItens;
    atualizar();
  });
  el.querySelector('.sinais')!.addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-sinal]'); if (b) o.tecnico.sinal(Number(b.dataset.sinal)); });

  // ---------- mini-grade ----------
  const svg = $<SVGSVGElement>('svg'), gruposEl = $<HTMLElement>('.grupos'), novosEl = $<HTMLElement>('.novos');
  let pincel: Grupo = 'beta', arrasto: { x0: number; y0: number; x1: number; y1: number; alvo: number | null } | null = null;
  const posicoes = () => o.luta.foto().piranbenjas.map((p) => ({ numero: p.numero, pos: p.pos }));
  function ponto(e: PointerEvent): { x: number; y: number } { const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; const m = svg.getScreenCTM(); return m ? p.matrixTransform(m.inverse()) : { x: 0, y: 0 }; }
  function desenharGrade(): void {
    const f = o.luta.foto(), orig = o.luta.numeroDoOriginal(), u = o.luta.esqueletoUrso.quadril, fr = o.luta.esqueletoUrso.frente;
    let s = `<circle r="6" fill="#1d3a4c" stroke="#2f5a70" stroke-width=".08"/><circle cx="${u.x.toFixed(2)}" cy="${u.z.toFixed(2)}" r=".55" fill="#7a5233"/>
      <line x1="${u.x.toFixed(2)}" y1="${u.z.toFixed(2)}" x2="${(u.x + fr.x * 0.9).toFixed(2)}" y2="${(u.z + fr.z * 0.9).toFixed(2)}" stroke="#e8f3f2" stroke-width=".1"/>`;
    for (const p of f.piranbenjas) {
      const g = o.tecnico.grupoDe(p.numero) ?? 'alpha', x = p.pos.x.toFixed(2), y = p.pos.z.toFixed(2);
      if (p.numero === orig) s += `<circle cx="${x}" cy="${y}" r=".42" fill="none" stroke="#4fd6d0" stroke-width=".08"/>`;
      s += `<rect x="${(p.pos.x - 0.22).toFixed(2)}" y="${(p.pos.z - 0.22).toFixed(2)}" width=".44" height=".44" transform="rotate(45 ${x} ${y})" fill="${COR_GRUPO[g]}" stroke="#08131b" stroke-width=".05" data-n="${p.numero}"/>`;
    }
    if (arrasto) { const x = Math.min(arrasto.x0, arrasto.x1), y = Math.min(arrasto.y0, arrasto.y1);
      s += `<rect x="${x}" y="${y}" width="${Math.abs(arrasto.x1 - arrasto.x0)}" height="${Math.abs(arrasto.y1 - arrasto.y0)}" fill="${COR_GRUPO[pincel]}" fill-opacity=".18" stroke="${COR_GRUPO[pincel]}" stroke-width=".06" stroke-dasharray=".2 .15"/>`; }
    svg.innerHTML = s;
    const cont = o.tecnico.contarGrupos();
    const html = GRUPOS.map((g) => `<div class="grupo${g === pincel ? ' pincel' : ''}"><span class="cor" style="background:${COR_GRUPO[g]}"></span>
      <button type="button" class="nome" data-g="${g}" aria-pressed="${g === pincel}">${g}</button><b>${cont[g]}</b>
      <button type="button" class="mm" data-g="${g}" data-d="-1" aria-label="${TXT.menos} ${g}">−</button><button type="button" class="mm" data-g="${g}" data-d="1" aria-label="${TXT.mais} ${g}">+</button></div>`).join('');
    if (gruposEl.innerHTML !== html) gruposEl.innerHTML = html;
    const nv = `${TXT.novos}: <b style="color:${COR_GRUPO[o.tecnico.grupoDosNovos]}">${o.tecnico.grupoDosNovos}</b> <kbd>G</kbd> · ${TXT.pincel}: <b style="color:${COR_GRUPO[pincel]}">${pincel}</b>`;
    if (novosEl.innerHTML !== nv) novosEl.innerHTML = nv;
  }
  gruposEl.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button'); if (!b) return;
    const g = b.dataset.g as Grupo;
    if (b.dataset.d) o.tecnico.mudarQuantidade(g, Number(b.dataset.d) as 1 | -1, posicoes()); else pincel = g;
    desenharGrade();
  });
  svg.addEventListener('pointerdown', (e) => { const p = ponto(e), n = (e.target as Element).getAttribute('data-n'); arrasto = { x0: p.x, y0: p.y, x1: p.x, y1: p.y, alvo: n === null ? null : Number(n) }; svg.setPointerCapture(e.pointerId); });
  svg.addEventListener('pointermove', (e) => { if (!arrasto) return; const p = ponto(e); arrasto.x1 = p.x; arrasto.y1 = p.y; });
  svg.addEventListener('pointerup', () => {
    if (!arrasto) return;
    const a = arrasto; arrasto = null;
    if (Math.hypot(a.x1 - a.x0, a.y1 - a.y0) < 0.3) { if (a.alvo !== null) o.tecnico.pintar(a.alvo, pincel); }
    else {
      const x0 = Math.min(a.x0, a.x1), x1 = Math.max(a.x0, a.x1), y0 = Math.min(a.y0, a.y1), y1 = Math.max(a.y0, a.y1);
      for (const p of posicoes()) if (p.pos.x >= x0 && p.pos.x <= x1 && p.pos.z >= y0 && p.pos.z <= y1) o.tecnico.pintar(p.numero, pincel);
    }
    desenharGrade();
  });
  let laco = 0, antes = 0;
  function rodar(agora: number): void { laco = requestAnimationFrame(rodar); if (agora - antes < 110) return; antes = agora; desenharGrade(); } // ~9 por segundo

  function mostrar(aberto: boolean): void {
    el.hidden = !aberto;
    cancelAnimationFrame(laco);
    if (!aberto) { (document.activeElement as HTMLElement | null)?.blur?.(); Blockly.hideChaff?.(); return; }
    montar();
    requestAnimationFrame(() => { if (ws) Blockly.svgResize(ws); });
    if (o.ativa() && o.ativa() !== aba) verAba(o.ativa()); else { atualizar(); }
    laco = requestAnimationFrame(rodar); desenharGrade();
  }
  addEventListener('resize', () => { if (ws && !el.hidden) Blockly.svgResize(ws); });
  return { el, mostrar, verAba, aplicarAba, atualizar,
    estado: () => ({ aba, blocos: ultimo.blocos, erro: ultimo.erro, alterado: alterado[aba] }) };
}
