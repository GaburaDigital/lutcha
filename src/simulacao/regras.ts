// Regras da luta em números (GDD, seções 4 e 15). Tudo aqui é valor inicial para teste.
// Funções puras: a mesma conta roda no PC (anfitrião), no Quest (previsão da vibração) e nos testes.

export type Zona = 'cabeca' | 'tronco' | 'bracos' | 'pernas';
export type Qualidade = 'cheio' | 'normal' | 'raspao';
export type TipoGolpe = 'dano' | 'impacto';

export const RINGUE = { raio: 6, bloco: 0.5, alturaBloco: 0.4 };

/** Centros dos blocos do ringue (grade de 0,5 m dentro do círculo de 12 m). Igual no PC e no Quest. */
export function gerarBlocos(): V3[] {
  const blocos: V3[] = [];
  const n = Math.ceil(RINGUE.raio / RINGUE.bloco);
  for (let i = -n; i < n; i++) for (let k = -n; k < n; k++) {
    const x = (i + 0.5) * RINGUE.bloco, z = (k + 0.5) * RINGUE.bloco;
    if (Math.hypot(x, z) > RINGUE.raio - RINGUE.bloco * 0.25) continue;
    blocos.push({ x, y: -RINGUE.alturaBloco / 2, z });
  }
  return blocos;
}

export const PIRANBENJA = { altura: 0.9, raio: 0.2, velocidade: 2.8, resOriginal: 100, resClone: 30 };
export const URSO = { altura: 2.7, raioCorpo: 0.5, raioMao: 0.15 };
export const PESO = { urso: 4, original: 1, clone: 0.8 };

export const AGUA = { maximo: 100, recarga: 2, custoClone: 15, inicial: 100 };

/** Combo de impacto: acertos no mesmo alvo dentro de 0,4 s. */
export const JANELA_COMBO = 0.4;
export function fatorCombo(acertos: number): number {
  return acertos <= 1 ? 1 : acertos === 2 ? 1.6 : acertos === 3 ? 2.2 : 2.8;
}

export const MULT_QUALIDADE: Record<Qualidade, number> = { cheio: 1.5, normal: 1, raspao: 0.4 };

/** Lançamento (m/s de mudança de velocidade): impacto × (1 + 2 × (1 − resistência)) ÷ peso × combo × modificadores. */
export function lancamento(impacto: number, resistencia01: number, peso: number, combo = 1, mods = 1): number {
  return (impacto * (1 + 2 * (1 - Math.max(0, Math.min(1, resistencia01)))) / peso) * combo * mods;
}

export interface V3 { x: number; y: number; z: number }

/** Zona do corpo pela altura do ponto de contato (base = pés) e pelo afastamento lateral do eixo. */
export function zonaDoContato(contatoY: number, baseY: number, altura: number, afastamentoLateral: number, raio: number): Zona {
  const rel = (contatoY - baseY) / altura;
  if (rel < 0.33) return 'pernas';
  if (rel > 0.72) return 'cabeca';
  if (afastamentoLateral > raio * 0.8) return 'bracos';
  return 'tronco';
}

/** Qualidade pelo ângulo (golpe reto ou de lado) e pela velocidade da mão. */
export function qualidadeDoGolpe(velMao: V3, paraOCentro: V3): Qualidade {
  const vh = Math.hypot(velMao.x, velMao.z), v = Math.hypot(velMao.x, velMao.y, velMao.z);
  const dh = Math.hypot(paraOCentro.x, paraOCentro.z) || 1;
  const cos = vh > 0.01 ? (velMao.x * paraOCentro.x + velMao.z * paraOCentro.z) / (vh * dh) : 0;
  if (cos > 0.7 && v > 3.5) return 'cheio';
  if (cos < 0.4 || v < 2) return 'raspao';
  return 'normal';
}

/** Modificadores de zona (GDD seção 4): cabeça tira mais, tronco empurra mais, pernas dão rasteira. */
export function modsDaZona(zona: Zona, tipo: TipoGolpe): { dano: number; empurrao: number; subida: number } {
  switch (zona) {
    case 'cabeca': return { dano: 1.5, empurrao: 1, subida: 0.45 };
    case 'tronco': return { dano: 1, empurrao: tipo === 'impacto' ? 1.2 : 1, subida: 0.4 };
    case 'bracos': return { dano: 0.7, empurrao: 0.8, subida: 0.35 };
    case 'pernas': return { dano: 0.7, empurrao: 0.6, subida: 0.15 };
  }
}

/** Vibração do controle: [força 0–1, ms]. Rodada 2 do urso (C14): mínimo de 60 ms, porque pulsos de 20 a 50 ms
 *  quase não se sentem no Quest 3S. */
export const VIBRACAO = {
  encostar: [0.25, 60], raspao: [0.45, 60], normal: [0.75, 90], cheio: [1.0, 140],
  agarrar: [0.6, 70], segurando: [0.15, 60], arremessar: [0.8, 90], levarGolpe: [0.9, 180],
} as const;

// ---------------- golpes do urso por tipo e direção (rodada 2 do urso, C14/C15) ----------------
/** Soco = punho fechado (gatilho + grip). Mão aberta = arranhão (de lado ou diagonal) ou estocada (reta para frente). */
export type Ataque = 'soco' | 'arranhao' | 'estocada';
export type Direcao = 'direto' | 'lateral' | 'gancho' | 'martelada' | 'diagonal';
export type NomeGolpe = 'soco' | 'socoLateral' | 'gancho' | 'martelada' | 'arranhao' | 'estocada';

/** Como cada golpe mexe no Piranbenja.
 *  area: quanto a área do golpe passa da pata (m); vizinhos: distância (m) em que outros clones levam 60%;
 *  empurrao: fator do lançamento na horizontal; subida: quanto vai para cima; atordoa: segundos parado;
 *  giro: 'rolar' de lado, 'mortal' para trás ou nada. */
export const GOLPES: Record<NomeGolpe, { tipo: TipoGolpe; area: number; vizinhos: number; empurrao: number; subida: number; atordoa: number; giro: 'rolar' | 'mortal' | null }> = {
  soco:        { tipo: 'impacto', area: 0.20, vizinhos: 0.55, empurrao: 1.0,  subida: 0.30, atordoa: 1.5, giro: null },
  socoLateral: { tipo: 'impacto', area: 0.20, vizinhos: 0.55, empurrao: 0.9,  subida: 0.12, atordoa: 1.5, giro: 'rolar' },
  gancho:      { tipo: 'impacto', area: 0.18, vizinhos: 0.45, empurrao: 0.35, subida: 1.6,  atordoa: 2.0, giro: 'mortal' },
  martelada:   { tipo: 'impacto', area: 0.18, vizinhos: 0,    empurrao: 0.05, subida: 0,    atordoa: 2.5, giro: null },
  arranhao:    { tipo: 'dano',    area: 0.32, vizinhos: 0.60, empurrao: 0.30, subida: 0.10, atordoa: 0.7, giro: null },
  estocada:    { tipo: 'dano',    area: 0.10, vizinhos: 0.35, empurrao: 0.15, subida: 0.05, atordoa: 2.5, giro: null },
};
/** Vizinhos de quem levou o golpe recebem esta parte da força (C15: 60%). */
export const PARTE_VIZINHOS = 0.6;
/** Raspão atordoa só um instante. */
export const ATORDOA_RASPAO = 0.3;
/** Martelada prende o Piranbenja achatado no chão por este tempo (e pega só um por vez). */
export const MARTELADA_PRESO = 2.5;

/** Classifica o golpe pela mão (punho ou aberta) e pela direção da pata.
 *  "frente" é a direção da cabeça do urso até a pata (no chão): soco reto anda junto dela; soco lateral, de través. */
export function classificarGolpe(v: V3, frente: V3, punho: boolean): NomeGolpe {
  const n = Math.hypot(v.x, v.y, v.z) || 1, vh = Math.hypot(v.x, v.z);
  const fh = Math.hypot(frente.x, frente.z) || 1;
  const cos = vh > 0.01 ? (v.x * frente.x + v.z * frente.z) / (vh * fh) : 0;
  const subindo = v.y / n;
  if (punho) {
    if (subindo > 0.6) return 'gancho';
    if (subindo < -0.6) return 'martelada';
    return cos < Math.cos((50 * Math.PI) / 180) ? 'socoLateral' : 'soco';
  }
  // mão aberta: reta para frente (até 35°) e quase sem subir ou descer = estocada; o resto risca = arranhão
  if (cos > Math.cos((35 * Math.PI) / 180) && Math.abs(subindo) < 0.4) return 'estocada';
  return 'arranhao';
}

/** Braço que estica para baixo (C14): acima do ombro a pata acompanha a mão; abaixo, desce "fator" vezes mais.
 *  Recebe e devolve a altura em metros reais (antes da escala do urso). */
export function esticarAltura(yMao: number, yOmbro: number, fator: number): number {
  return yMao >= yOmbro ? yMao : yOmbro - (yOmbro - yMao) * fator;
}
/** O ombro fica ~25 cm abaixo dos olhos (estimativa para gente de 1,40 a 1,90 m). */
export const OMBRO_ABAIXO_DOS_OLHOS = 0.25;

/** Código da sala: 5 caracteres sem os que confundem (sem O, 0, I, 1, L). */
export const ALFABETO_SALA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function codigoDeSala(aleatorio: () => number = Math.random): string {
  let c = '';
  for (let i = 0; i < 5; i++) c += ALFABETO_SALA[Math.floor(aleatorio() * ALFABETO_SALA.length)];
  return c;
}
