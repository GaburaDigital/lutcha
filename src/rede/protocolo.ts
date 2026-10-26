// Formato das mensagens entre o PC (anfitrião) e o Quest, em binário (pequeno e rápido).
// Posições em milímetros (inteiros de 16 bits: ±32 m), giros comprimidos. ~17 bytes por Piranbenja.
// Todo pacote começa com a versão do formato: versões diferentes não conversam.
//
// Sigilo: a foto só tem número sorteado, posição, giro e duas marcas (voando, agarrado). Nunca quem é o original.

import type { EntradaUrso, Foto } from '../simulacao/luta';

export const VERSAO_FORMATO = 1;
const FOTO = 1, ENTRADA = 2;
const RODADAS = ['luta', 'fim'] as const;

const mm = (v: number) => Math.max(-32767, Math.min(32767, Math.round(v * 1000)));
const q16 = (v: number) => Math.max(-32767, Math.min(32767, Math.round(v * 32767)));

export function codificarFoto(f: Foto): ArrayBuffer {
  const n = Math.min(255, f.piranbenjas.length);
  const buf = new ArrayBuffer(19 + n * 17), d = new DataView(buf);
  let o = 0;
  d.setUint8(o++, VERSAO_FORMATO); d.setUint8(o++, FOTO);
  d.setUint32(o, f.tick); o += 4; d.setFloat32(o, f.tempo); o += 4; d.setUint8(o++, Math.round(f.escalaTempo * 100));
  d.setUint8(o++, RODADAS.indexOf(f.rodada)); d.setUint8(o++, f.placar.urso); d.setUint8(o++, f.placar.piranbenja);
  d.setUint8(o++, f.urso.res); d.setUint8(o++, f.urso.aura); d.setUint8(o++, n);
  d.setUint16(o, 0); o += 2; // reservado
  for (let i = 0; i < n; i++) {
    const p = f.piranbenjas[i];
    d.setUint16(o, p.numero); o += 2;
    d.setInt16(o, mm(p.pos.x)); o += 2; d.setInt16(o, mm(p.pos.y)); o += 2; d.setInt16(o, mm(p.pos.z)); o += 2;
    for (const c of p.rot) { d.setInt16(o, q16(c)); o += 2; }
    d.setUint8(o++, (p.voando ? 1 : 0) | (p.agarrado ? 2 : 0));
  }
  return buf;
}

export function decodificarFoto(buf: ArrayBuffer): Foto | null {
  const d = new DataView(buf);
  if (buf.byteLength < 19 || d.getUint8(0) !== VERSAO_FORMATO || d.getUint8(1) !== FOTO) return null;
  let o = 2;
  const tick = d.getUint32(o); o += 4; const tempo = d.getFloat32(o); o += 4; const escalaTempo = d.getUint8(o++) / 100;
  const rodada = RODADAS[d.getUint8(o++)] ?? 'luta';
  const placar = { urso: d.getUint8(o++), piranbenja: d.getUint8(o++) };
  const urso = { res: d.getUint8(o++), aura: d.getUint8(o++) };
  const n = d.getUint8(o++); o += 2;
  if (buf.byteLength !== 19 + n * 17) return null; // tamanho errado: descarta (conferência das mensagens)
  const piranbenjas: Foto['piranbenjas'] = [];
  for (let i = 0; i < n; i++) {
    const numero = d.getUint16(o); o += 2;
    const pos = { x: d.getInt16(o) / 1000, y: d.getInt16(o + 2) / 1000, z: d.getInt16(o + 4) / 1000 }; o += 6;
    const rot: [number, number, number, number] = [0, 0, 0, 0];
    for (let k = 0; k < 4; k++) { rot[k] = d.getInt16(o) / 32767; o += 2; }
    const fl = d.getUint8(o++);
    piranbenjas.push({ numero, pos, rot, voando: !!(fl & 1), agarrado: !!(fl & 2) });
  }
  return { tick, tempo, escalaTempo, rodada, placar, urso, piranbenjas };
}

export function codificarEntrada(e: EntradaUrso): ArrayBuffer {
  const buf = new ArrayBuffer(2 + 4 + 12 + 2 * 14), d = new DataView(buf);
  let o = 0;
  d.setUint8(o++, VERSAO_FORMATO); d.setUint8(o++, ENTRADA);
  d.setFloat32(o, e.tamanhoPata); o += 4;
  for (const v of [e.cabeca.x, e.cabeca.y, e.cabeca.z]) { d.setFloat32(o, v); o += 4; }
  for (const l of ['esq', 'dir'] as const) {
    const m = e.maos[l];
    for (const v of [m.pos.x, m.pos.y, m.pos.z]) { d.setFloat32(o, v); o += 4; }
    d.setUint8(o++, Math.round(m.gatilho * 255)); d.setUint8(o++, Math.round(m.grip * 255));
  }
  return buf;
}

/** Lê a entrada do Quest e confere se é possível (anti-trapaça básica do plano de segurança). */
export function decodificarEntrada(buf: ArrayBuffer): EntradaUrso | null {
  const d = new DataView(buf);
  if (buf.byteLength !== 46 || d.getUint8(0) !== VERSAO_FORMATO || d.getUint8(1) !== ENTRADA) return null;
  let o = 2;
  const tamanhoPata = d.getFloat32(o); o += 4;
  const v3 = () => { const v = { x: d.getFloat32(o), y: d.getFloat32(o + 4), z: d.getFloat32(o + 8) }; o += 12; return v; };
  const cabeca = v3();
  const maos = {} as EntradaUrso['maos'];
  for (const l of ['esq', 'dir'] as const) {
    const pos = v3(); const gatilho = d.getUint8(o++) / 255, grip = d.getUint8(o++) / 255;
    maos[l] = { pos, gatilho, grip };
  }
  const finito = [tamanhoPata, cabeca.x, cabeca.y, cabeca.z, ...(['esq', 'dir'] as const).flatMap((l) => [maos[l].pos.x, maos[l].pos.y, maos[l].pos.z])].every(Number.isFinite);
  if (!finito || tamanhoPata < 0.8 || tamanhoPata > 2.0) return null;
  // a pata não pode estar longe da cabeça: alcance máximo de um urso de 2,7 m com braço esticado
  for (const l of ['esq', 'dir'] as const) {
    const m = maos[l].pos;
    if (Math.hypot(m.x - cabeca.x, m.y - cabeca.y, m.z - cabeca.z) > 2.6) maos[l].pos = { ...cabeca, y: cabeca.y - 0.8 };
  }
  return { cabeca, maos, tamanhoPata };
}
