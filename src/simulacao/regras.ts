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

export const AGUA = { maximo: 100, recarga: 3, custoClone: 15, inicial: 100 }; // recarga 2 → 3 (C19)

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
/** Equilíbrio aprovado para testar (C19). */
export const EQUILIBRIO = {
  velocidadeMinimaGolpe: 3.0,   // m/s da pata: abaixo disso a pata só encosta (agarrar fica mais fácil)
  agarrarAte: 3.0,              // m/s: até essa velocidade, fechar a mão perto agarra
  folgaAgarrar: 0.3,            // m além da superfície do Piranbenja
  danoTapa: 4, danoMordida: 5, grudadoPorSegundo: 2,
  impactoSoco: 4.5,             // empurrão do soco no urso: ~1,1 m/s inteiro, ~2,7 m/s com resistência 30
  decolarUrso: 4.0,             // m/s: acima disso o urso decola (voa em arco)
  armar: 0.75,                  // s de aviso antes de atacar (original e clones)
  esperaSalvaVidas: 8,          // s entre dois "clones salva-vidas"
};

// ---------------- o urso apanhando (C20–C23) ----------------
/** Empurrão de UM soco no urso (m/s), pela resistência dele (0 a 1): 100 → 0,8 · 50 → 2,0 · 20 → 3,7 · 10 → 4,5 · 0 → 5,4.
 *  Acima de EQUILIBRIO.decolarUrso (4 m/s) ele decola: com resistência 10 ou menos, um soco sozinho já decola um pouco. */
export function empurraoNoUrso(res01: number): number {
  const r = Math.max(0, Math.min(1, res01));
  return 0.8 + 4.6 * (1 - r) * (1 - r);
}
/** Decolagem proporcional: perto do limite é um pulinho (~50 cm); quanto mais passa, maior o arco. */
export function velocidadeDeDecolagem(L: number, dirX: number, dirZ: number, subida = 0): V3 {
  const sobra = Math.max(0, L - EQUILIBRIO.decolarUrso);
  const vy = Math.min(7.5, 3.1 + 0.8 * sobra + subida), h = (1.5 + 1.0 * sobra) * (1 - Math.min(0.7, subida * 0.25));
  return { x: dirX * h, y: vy, z: dirZ * h };
}
/** O que cada parte do urso faz quando leva impacto: perna enche a barra de equilíbrio (cai sentado),
 *  barriga empurra, cabeça deixa tonto 1 s, braço e pata empurram menos (é quase uma defesa). */
export const URSO_APANHANDO = {
  equilibrioPorImpacto: 25,     // pontos por impacto na perna com resistência 100 (×3 com resistência 0)
  equilibrioPorTapa: 6,         // tapa e mordida na perna desequilibram pouco
  equilibrioCai: 100,
  equilibrioVolta: 15,          // pontos por segundo que a barra esvazia (depois de 1 s sem levar nada na perna)
  sentado: 2.0,                 // s sentado no chão: não anda, patas mais fracas, leva o dobro
  forcaSentado: 0.5, impactoSentado: 2,
  tonto: 1.0,                   // s tonto depois de impacto na cabeça (não agarra)
  empurraoPerna: 0.4, empurraoBraco: 0.6, empurraoCabeca: 0.8,
  correnteEquilibrio: 40,       // pontos por segundo com a corrente enrolada na perna
};

// ---------------- ataques de impacto do Piranbenja (roda do mouse) ----------------
export type AtaqueImpacto = 'soco' | 'cabecada' | 'chute';
/** armar: s de aviso · forca: × do soco · subida: quanto vai para cima · caido: s deitado depois (vulnerável). */
export const ATAQUES_IMPACTO: Record<AtaqueImpacto, { armar: number; forca: number; subida: number; caido: number; alcance: number }> = {
  soco:     { armar: 0.75, forca: 1.0, subida: 0,   caido: 0,   alcance: 0.32 },
  cabecada: { armar: 0.5,  forca: 0.8, subida: 2.2, caido: 0,   alcance: 0.32 },
  chute:    { armar: 1.0,  forca: 2.2, subida: 0,   caido: 1.5, alcance: 0.42 },
};

// ---------------- formações (C21–C23) ----------------
export type TipoFormacao = 'muralha' | 'catapulta' | 'torre' | 'piramide' | 'corrente' | 'fila';
export const TIPOS_FORMACAO: TipoFormacao[] = ['muralha', 'catapulta', 'torre', 'piramide', 'corrente', 'fila'];
/** clones: quantos precisa (fila aceita de 3 a 5) · minimo: abaixo disso, depois de puxões, desfaz (sem strike) ·
 *  montar: s em que fica vulnerável (um golpe do urso desmancha como strike) · res: resistência da formação inteira. */
export const FORMACOES: Record<TipoFormacao, { clones: number; maximo: number; minimo: number; montar: number; res: number }> = {
  muralha:   { clones: 4, maximo: 4, minimo: 3, montar: 1.0, res: 30 },
  catapulta: { clones: 2, maximo: 2, minimo: 2, montar: 1.2, res: 10 },
  torre:     { clones: 3, maximo: 3, minimo: 2, montar: 1.5, res: 30 },
  piramide:  { clones: 6, maximo: 6, minimo: 4, montar: 2.5, res: 50 },
  corrente:  { clones: 4, maximo: 4, minimo: 3, montar: 1.2, res: 20 },
  fila:      { clones: 3, maximo: 5, minimo: 2, montar: 0.8, res: 20 },
};
/** Clones que entram numa formação: os mais perto do original, até esta distância (m). */
export const ALCANCE_FORMAR = 4;
/** Catapulta: ângulo de saída e distância que a mira alcança (m). Sem aviso e sem câmera lenta (C23). */
export const CATAPULTA = { angulo: (40 * Math.PI) / 180, minimo: 2, maximo: 9, forcaProjetil: 1.5, recarga: 2.5, subir: 0.4 };
/** Escalar a torre ou a pirâmide (s). */
export const ESCALAR = 0.6;

/** Velocidade de saída da catapulta para cair a "distancia" metros (no chão), no ângulo da catapulta. */
export function saidaCatapulta(giro: number, distancia: number): V3 {
  const d = Math.max(CATAPULTA.minimo, Math.min(CATAPULTA.maximo, distancia));
  const v = Math.sqrt((d * 9.81) / Math.sin(2 * CATAPULTA.angulo));
  const h = v * Math.cos(CATAPULTA.angulo);
  return { x: -Math.sin(giro) * h, y: v * Math.sin(CATAPULTA.angulo), z: -Math.cos(giro) * h };
}

/** Mão meio fechada (grip apertado, gatilho solto) não golpeia: só agarra (C22). Arranhão e estocada só com a mão aberta. */
export function maoMeioFechada(gatilho: number, grip: number): boolean { return grip >= 0.5 && gatilho < 0.6; }
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
