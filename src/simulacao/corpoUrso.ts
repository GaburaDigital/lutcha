// Corpo do UrsoBura em segmentos (cápsulas): cabeça, tronco, pernas, braços, antebraços e patas.
// A mesma conta serve à física (onde os Piranbenjas acertam, onde grudam, o empurrão que impede atravessar o corpo)
// e ao desenho do urso visto de fora: o que se vê é exatamente o que a luta usa.
//
// Os braços ligam o ombro (estimado pelo giro da cabeça) à pata com um cotovelo calculado (IK de dois ossos).
// Se a pata vai mais longe que o braço alcança (o braço que estica para baixo), os dois ossos esticam juntos.

import type { V3 } from './regras';

export type Lado = 'esq' | 'dir';
export type SegUrso = 'cabeca' | 'tronco' | 'pernaE' | 'pernaD' | 'bracoE' | 'bracoD' | 'antebracoE' | 'antebracoD' | 'pataE' | 'pataD';
export interface Segmento { nome: SegUrso; a: V3; b: V3; r: number }
export interface EsqueletoUrso {
  segs: Segmento[];
  frente: V3; direita: V3; k: number;
  quadril: V3; peito: V3;
  ombro: Record<Lado, V3>; cotovelo: Record<Lado, V3>; pata: Record<Lado, V3>;
}
export interface PoseUrso { cabeca: V3; giro: number; maos: Record<Lado, { pos: V3 }>; tamanhoPata: number }

export const CORPO_URSO = {
  raioCabeca: 0.32, raioTronco: 0.48, raioPerna: 0.2, raioBraco: 0.15, raioAntebraco: 0.13, raioPata: 0.15,
  braco: 0.7, antebraco: 0.7, larguraOmbros: 0.5, larguraPernas: 0.24,
};

export const v = (x: number, y: number, z: number): V3 => ({ x, y, z });
export const soma = (a: V3, b: V3): V3 => v(a.x + b.x, a.y + b.y, a.z + b.z);
export const menos = (a: V3, b: V3): V3 => v(a.x - b.x, a.y - b.y, a.z - b.z);
export const vezes = (a: V3, s: number): V3 => v(a.x * s, a.y * s, a.z * s);
export const ponto = (a: V3, b: V3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const cruz = (a: V3, b: V3): V3 => v(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
export const tam = (a: V3): number => Math.hypot(a.x, a.y, a.z);
export const unit = (a: V3, reserva: V3 = v(0, 1, 0)): V3 => { const n = tam(a); return n > 1e-6 ? vezes(a, 1 / n) : reserva; };

/** Frente e direita a partir do giro (giro 0 = olhando para −z, como a câmera do Three.js). */
export function eixosDoGiro(giro: number): { frente: V3; direita: V3 } {
  return { frente: v(-Math.sin(giro), 0, -Math.cos(giro)), direita: v(Math.cos(giro), 0, -Math.sin(giro)) };
}

/** Cotovelo por IK de dois ossos, dobrando para baixo, para fora e um pouco para trás. */
function cotoveloIK(ombro: V3, pata: V3, lado: number, frente: V3, direita: V3): V3 {
  const L1 = CORPO_URSO.braco, L2 = CORPO_URSO.antebraco;
  const para = menos(pata, ombro), d = tam(para);
  const dir = unit(para, v(0, -1, 0));
  if (d >= L1 + L2 - 1e-3) return soma(ombro, vezes(dir, d * (L1 / (L1 + L2)))); // esticado: os dois ossos crescem juntos
  const a = (L1 * L1 - L2 * L2 + d * d) / (2 * Math.max(d, 1e-3));
  const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  let polo = soma(soma(vezes(direita, 0.6 * lado), v(0, -1, 0)), vezes(frente, -0.4));
  polo = unit(menos(polo, vezes(dir, ponto(polo, dir))), vezes(direita, lado));
  return soma(soma(ombro, vezes(dir, a)), vezes(polo, h));
}

export function esqueletoUrso(e: PoseUrso): EsqueletoUrso {
  const C = CORPO_URSO;
  const { frente, direita } = eixosDoGiro(e.giro);
  const k = Math.min(1.15, Math.max(0.55, e.cabeca.y / 2.45)); // agachar encolhe pernas e tronco
  const base = soma(v(e.cabeca.x, 0, e.cabeca.z), vezes(frente, -0.15)); // o corpo fica um pouco atrás da cabeça
  const quadril = soma(base, v(0, 1.0 * k, 0));
  const peito = soma(base, v(0, Math.max(quadril.y + 0.25, e.cabeca.y - 0.62), 0));
  const segs: Segmento[] = [
    { nome: 'cabeca', a: e.cabeca, b: e.cabeca, r: C.raioCabeca },
    { nome: 'tronco', a: soma(quadril, v(0, 0.05, 0)), b: peito, r: C.raioTronco },
  ];
  for (const [nome, lado] of [['pernaE', -1], ['pernaD', 1]] as const) {
    const p = soma(base, vezes(direita, C.larguraPernas * lado));
    segs.push({ nome, a: soma(p, v(0, C.raioPerna, 0)), b: soma(p, v(0, 0.95 * k, 0)), r: C.raioPerna });
  }
  const ombro = {} as Record<Lado, V3>, cotovelo = {} as Record<Lado, V3>, pata = {} as Record<Lado, V3>;
  const raioPata = C.raioPata * (e.tamanhoPata / 1.3);
  for (const l of ['esq', 'dir'] as const) {
    const lado = l === 'esq' ? -1 : 1, s = l === 'esq' ? 'E' : 'D';
    ombro[l] = soma(soma(peito, vezes(direita, C.larguraOmbros * lado)), v(0, 0.05, 0));
    pata[l] = e.maos[l].pos;
    cotovelo[l] = cotoveloIK(ombro[l], pata[l], lado, frente, direita);
    segs.push({ nome: ('braco' + s) as SegUrso, a: ombro[l], b: cotovelo[l], r: C.raioBraco });
    segs.push({ nome: ('antebraco' + s) as SegUrso, a: cotovelo[l], b: pata[l], r: C.raioAntebraco });
    segs.push({ nome: ('pata' + s) as SegUrso, a: pata[l], b: pata[l], r: raioPata });
  }
  return { segs, frente, direita, k, quadril, peito, ombro, cotovelo, pata };
}

/** Ponto mais perto de p no segmento ab (t de 0 a 1). */
export function pertoNoSegmento(p: V3, a: V3, b: V3): { q: V3; t: number } {
  const ab = menos(b, a), l2 = ponto(ab, ab);
  const t = l2 < 1e-9 ? 0 : Math.max(0, Math.min(1, ponto(menos(p, a), ab) / l2));
  return { q: soma(a, vezes(ab, t)), t };
}

/** Pontos mais perto entre dois segmentos (p1q1 e p2q2). */
export function pertoEntreSegmentos(p1: V3, q1: V3, p2: V3, q2: V3): { c1: V3; c2: V3; s: number; t: number; d: number } {
  const d1 = menos(q1, p1), d2 = menos(q2, p2), r = menos(p1, p2);
  const a = ponto(d1, d1), e = ponto(d2, d2), f = ponto(d2, r);
  let s = 0, t = 0;
  if (a <= 1e-9 && e <= 1e-9) { s = 0; t = 0; }
  else if (a <= 1e-9) { s = 0; t = Math.max(0, Math.min(1, f / e)); }
  else {
    const c = ponto(d1, r);
    if (e <= 1e-9) { t = 0; s = Math.max(0, Math.min(1, -c / a)); }
    else {
      const b = ponto(d1, d2), den = a * e - b * b;
      s = den > 1e-9 ? Math.max(0, Math.min(1, (b * f - c * e) / den)) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = Math.max(0, Math.min(1, -c / a)); }
      else if (t > 1) { t = 1; s = Math.max(0, Math.min(1, (b - c) / a)); }
    }
  }
  const c1 = soma(p1, vezes(d1, s)), c2 = soma(p2, vezes(d2, t));
  return { c1, c2, s, t, d: tam(menos(c1, c2)) };
}

/** Base do segmento para guardar onde algo grudou: eixo u (ao longo), w e v (em volta). */
export function baseDoSegmento(seg: Segmento, frente: V3): { u: V3; w: V3; vv: V3 } {
  const u = unit(menos(seg.b, seg.a), v(0, 1, 0));
  let w = cruz(u, v(0, 1, 0));
  if (tam(w) < 0.2) w = cruz(u, frente);
  w = unit(w, v(1, 0, 0));
  return { u, w, vv: cruz(w, u) };
}

/** Zona do urso para mostrar e para os efeitos (perna, braço, pata, tronco, cabeça). */
export function zonaDoSegmento(nome: SegUrso): 'cabeca' | 'tronco' | 'braco' | 'pata' | 'perna' {
  return nome.startsWith('perna') ? 'perna' : nome.startsWith('pata') ? 'pata' : nome.startsWith('braco') || nome.startsWith('antebraco') ? 'braco' : nome === 'cabeca' ? 'cabeca' : 'tronco';
}
