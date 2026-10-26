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

/** Vibração do controle (GDD seção 4): [força 0–1, ms]. */
export const VIBRACAO = {
  encostar: [0.15, 20], raspao: [0.3, 30], normal: [0.6, 50], cheio: [1.0, 80],
  agarrar: [0.5, 40], segurando: [0.12, 20], arremessar: [0.6, 60], levarGolpe: [0.8, 150],
} as const;

/** Código da sala: 5 caracteres sem os que confundem (sem O, 0, I, 1, L). */
export const ALFABETO_SALA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function codigoDeSala(aleatorio: () => number = Math.random): string {
  let c = '';
  for (let i = 0; i < 5; i++) c += ALFABETO_SALA[Math.floor(aleatorio() * ALFABETO_SALA.length)];
  return c;
}
