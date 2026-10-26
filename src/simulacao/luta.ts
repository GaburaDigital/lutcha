// A luta, sem rede e sem desenho (protótipo cinza, fase 2).
// Roda no PC do Piranbenja (anfitrião), no Quest no modo solo contra bots e nos testes automáticos.
// Física: Rapier (corpos rígidos). Analogia Godot: é a cena da luta com os RigidBody3D, rodando no _physics_process.
//
// Sigilo do original (GDD seção 13): fora desta classe, os Piranbenjas só existem como "números sorteados";
// quem é o original fica guardado aqui dentro e nunca vai na foto que o Quest recebe.

import RAPIER from '@dimforge/rapier3d-compat';
import {
  AGUA, JANELA_COMBO, MULT_QUALIDADE, PESO, PIRANBENJA, RINGUE, URSO, fatorCombo, lancamento, modsDaZona,
  gerarBlocos, qualidadeDoGolpe, zonaDoContato, type Qualidade, type TipoGolpe, type V3, type Zona,
} from './regras';

let pronta = false;
/** Carrega a física (WebAssembly embutido: funciona offline). Chamar uma vez antes de criar a luta. */
export async function prepararFisica(): Promise<void> { if (!pronta) { await RAPIER.init(); pronta = true; } }

export type Lado = 'esq' | 'dir';
export interface MaoUrso { pos: V3; gatilho: number; grip: number }
export interface EntradaUrso { cabeca: V3; maos: Record<Lado, MaoUrso>; tamanhoPata: number }
export interface ControleOriginal { mover: { x: number; z: number }; atacar: TipoGolpe | null; criarClones: boolean }

/** O que o mundo de fora pode saber de cada Piranbenja (sem dizer quem é o original). */
export interface FotoPiranbenja { numero: number; pos: V3; rot: [number, number, number, number]; voando: boolean; agarrado: boolean }
export interface Foto {
  tick: number; tempo: number; escalaTempo: number;
  rodada: EstadoRodada; placar: { urso: number; piranbenja: number };
  urso: { res: number; aura: number };
  piranbenjas: FotoPiranbenja[];
}
export type EstadoRodada = 'luta' | 'fim';

export type Evento =
  | { tipo: 'golpe'; mao: Lado; numero: number; zona: Zona; qualidade: Qualidade; golpe: TipoGolpe; lancamento: number }
  | { tipo: 'agarrou'; mao: Lado; numero: number }
  | { tipo: 'arremessou'; mao: Lado; numero: number; velocidade: number }
  | { tipo: 'strike'; derrubados: number }
  | { tipo: 'derreteu'; numero: number }
  | { tipo: 'clones'; quantos: number }
  | { tipo: 'cameraLenta'; segundos: number; escala: number }
  | { tipo: 'ursoGolpeado'; golpe: TipoGolpe; combo: number; empurrao: { x: number; z: number } }
  | { tipo: 'fimRodada'; vencedor: 'urso' | 'piranbenja'; placar: { urso: number; piranbenja: number } }
  | { tipo: 'novaRodada' };

interface Piranbenja {
  numero: number;
  original: boolean;
  corpo: RAPIER.RigidBody;
  res: number;
  voandoAte: number;        // tempo até o qual está "voando" (girando, projétil)
  agarradoPor: Lado | null;
  acertosRecentes: number[];// tempos dos impactos recebidos (combo)
  batidasProjetil: number;  // quantos derrubou como projétil (boliche)
  jaBateu: Set<number>;
  // IA simples
  pensarEm: number; alvo: V3; ataqueEm: number;
  ataquePedido: TipoGolpe | null;
}

const vec = (x: number, y: number, z: number): V3 => ({ x, y, z });
const sub = (a: V3, b: V3): V3 => vec(a.x - b.x, a.y - b.y, a.z - b.z);
const len = (a: V3) => Math.hypot(a.x, a.y, a.z);
const lenH = (a: V3) => Math.hypot(a.x, a.z);

export interface OpcoesLuta {
  /** Bots: o original também é controlado pela IA (Quest solo, testes). */
  originalAutomatico?: boolean;
  clonesIniciais?: number;
  semente?: number;
  /** Urso de treino: boneco parado que abana as patas (PC sem Quest conectado). */
  ursoDeTreino?: boolean;
  /** Testes: os clones não andam nem atacam sozinhos. */
  semIA?: boolean;
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
  private ursoCorpo: RAPIER.RigidBody;
  private patas: Record<Lado, RAPIER.RigidBody>;
  private entrada: EntradaUrso;
  private velMao: Record<Lado, V3> = { esq: vec(0, 0, 0), dir: vec(0, 0, 0) };
  // amostras das patas (chegam do Quest a ~36 por segundo; a física roda a 60): o caminho entre duas amostras
  // é conferido inteiro, para um golpe rápido não atravessar o Piranbenja sem encostar
  private ultimaAmostra: Record<Lado, { pos: V3; t: number } | null> = { esq: null, dir: null };
  private caminho: Record<Lado, { de: V3; ate: V3 } | null> = { esq: null, dir: null };
  private gripAntes: Record<Lado, boolean> = { esq: false, dir: false };
  private segurando: Record<Lado, Piranbenja | null> = { esq: null, dir: null };
  private recargaGolpe = new Map<string, number>();
  private ursoAcertos: number[] = [];
  agua = AGUA.inicial;
  ursoRes = 100;
  ursoAura = 0;
  rodada: EstadoRodada = 'luta';
  placar = { urso: 0, piranbenja: 0 };
  private fimEm = 0;
  controle: ControleOriginal = { mover: { x: 0, z: 0 }, atacar: null, criarClones: false };

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
    // Urso: corpo e patas cinemáticos (quem manda é o jogador no Quest)
    const meia = URSO.altura / 2 - URSO.raioCorpo;
    this.ursoCorpo = this.mundo.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, URSO.altura / 2, 3));
    this.mundo.createCollider(RAPIER.ColliderDesc.capsule(meia, URSO.raioCorpo), this.ursoCorpo);
    const pata = () => {
      const c = this.mundo.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 1.5, 2.4));
      this.mundo.createCollider(RAPIER.ColliderDesc.ball(URSO.raioMao), c);
      return c;
    };
    this.patas = { esq: pata(), dir: pata() };
    this.entrada = { cabeca: vec(0, 2.45, 3), tamanhoPata: 1.3, maos: { esq: { pos: vec(-0.35, 1.5, 2.5), gatilho: 0, grip: 0 }, dir: { pos: vec(0.35, 1.5, 2.5), gatilho: 0, grip: 0 } } };
    this.comecarRodada();
  }

  // ---------------- entradas ----------------
  /** Posição da cabeça e das patas do urso no mundo (do Quest, a cada quadro ou pela rede). */
  definirUrso(e: EntradaUrso): void {
    const agora = this.relogioReal;
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
  tirarEventos(): Evento[] { const e = this.eventos; this.eventos = []; return e; }

  // ---------------- rodadas ----------------
  private comecarRodada(): void {
    for (const p of this.pbs) this.mundo.removeRigidBody(p.corpo);
    this.pbs = [];
    for (const l of ['esq', 'dir'] as const) this.segurando[l] = null;
    this.agua = AGUA.inicial; this.ursoRes = 100; this.ursoAura = 0; this.rodada = 'luta';
    const original = this.novoPiranbenja(true, vec(0, PIRANBENJA.altura / 2, -3));
    this.pbs.push(original);
    this.espalharClones(this.opcoes.clonesIniciais ?? 4, true);
  }

  private novoPiranbenja(original: boolean, pos: V3): Piranbenja {
    const corpo = this.mundo.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(pos.x, pos.y, pos.z)
      .setLinearDamping(0.3).setAngularDamping(1.5).lockRotations().setCcdEnabled(true));
    this.mundo.createCollider(RAPIER.ColliderDesc.capsule(PIRANBENJA.altura / 2 - PIRANBENJA.raio, PIRANBENJA.raio)
      .setMass(original ? PESO.original : PESO.clone).setFriction(0.6).setRestitution(0.15), corpo);
    return {
      numero: 0, original, corpo, res: original ? PIRANBENJA.resOriginal : PIRANBENJA.resClone,
      voandoAte: 0, agarradoPor: null, acertosRecentes: [], batidasProjetil: 0, jaBateu: new Set(),
      pensarEm: 0, alvo: pos, ataqueEm: 0, ataquePedido: null,
    };
  }

  /** Cria clones em volta do original e muda o original de lugar entre eles (GDD 7: nunca revelar o original). */
  private espalharClones(quantos: number, gratis = false): number {
    if (!gratis) quantos = Math.min(quantos, Math.floor(this.agua / AGUA.custoClone));
    if (quantos <= 0) return 0;
    if (!gratis) this.agua -= quantos * AGUA.custoClone;
    const orig = this.pbs.find((p) => p.original)!;
    const c = orig.corpo.translation();
    const vagas: V3[] = [];
    const total = quantos + 1, giro = this.aleatorio() * Math.PI * 2;
    for (let i = 0; i < total; i++) {
      const a = giro + (i / total) * Math.PI * 2, r = 0.8 + this.aleatorio() * 0.5;
      let x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
      const d = Math.hypot(x, z); if (d > RINGUE.raio - 0.6) { x *= (RINGUE.raio - 0.6) / d; z *= (RINGUE.raio - 0.6) / d; }
      vagas.push(vec(x, PIRANBENJA.altura / 2 + 0.05, z));
    }
    const vagaOrig = Math.floor(this.aleatorio() * total);
    orig.corpo.setTranslation(vagas[vagaOrig], true); orig.corpo.setLinvel({ x: 0, y: 0, z: 0 }, true);
    vagas.splice(vagaOrig, 1);
    for (const v of vagas) this.pbs.push(this.novoPiranbenja(false, v));
    this.sortearNumeros();
    this.eventos.push({ tipo: 'clones', quantos });
    return quantos;
  }

  /** Números novos e ordem nova para todos: quem estava olhando um número não acompanha o original. */
  private sortearNumeros(): void {
    const usados = new Set<number>();
    for (const p of this.pbs) {
      let n = 0; do { n = 1 + Math.floor(this.aleatorio() * 65000); } while (usados.has(n));
      usados.add(n); p.numero = n;
    }
    for (let i = this.pbs.length - 1; i > 0; i--) { const j = Math.floor(this.aleatorio() * (i + 1)); [this.pbs[i], this.pbs[j]] = [this.pbs[j], this.pbs[i]]; }
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
    if (this.opcoes.ursoDeTreino) this.moverUrsoDeTreino();
    this.posicionarUrso(dt);
    if (this.rodada === 'luta') {
      this.agua = Math.min(AGUA.maximo, this.agua + AGUA.recarga * dt);
      this.ursoRes = Math.min(100, this.ursoRes + 0.2 * dt);
      this.ursoAura = Math.min(100, this.ursoAura + 1 * dt);
      this.controlarOriginal(dt);
      if (!this.opcoes.semIA) for (const p of this.pbs) if (!p.original || this.opcoes.originalAutomatico) this.pensarClone(p);
      for (const p of this.pbs) if (!this.opcoes.semIA || p.original) this.andar(p);
      this.golpesDasPatas();
      this.agarrarESoltar();
      this.boliche();
      this.ataquesNoUrso();
    }
    this.mundo.step();
    this.endireitar();
    this.quedas();
    if (this.rodada === 'fim' && this.tempo > this.fimEm) { this.comecarRodada(); this.eventos.push({ tipo: 'novaRodada' }); }
  }

  private moverUrsoDeTreino(): void {
    const t = this.tempo, e = this.entrada;
    this.definirUrso({ tamanhoPata: e.tamanhoPata, cabeca: vec(0, 2.45, 2.2), maos: {
      esq: { pos: vec(-0.45 + Math.sin(t * 2) * 0.35, 1.3, 1.5 + Math.cos(t * 2) * 0.4), gatilho: 0, grip: 0 },
      dir: { pos: vec(0.45 + Math.sin(t * 2 + 2) * 0.35, 1.3, 1.5 + Math.cos(t * 2 + 2) * 0.4), gatilho: 0, grip: 0 } } });
  }

  private posicionarUrso(_dt: number): void {
    const c = this.entrada.cabeca;
    this.ursoCorpo.setNextKinematicTranslation({ x: c.x, y: URSO.altura / 2, z: c.z });
    for (const l of ['esq', 'dir'] as const) {
      this.patas[l].setNextKinematicTranslation(this.entrada.maos[l].pos);
      // sem amostra nova há mais de 0,1 s: a pata parou
      const u = this.ultimaAmostra[l];
      if (u && this.relogioReal - u.t > 0.1) this.velMao[l] = vec(0, 0, 0);
    }
  }

  // ---------------- Piranbenja: controle, IA simples e andar ----------------
  private controlarOriginal(_dt: number): void {
    const o = this.pbs.find((p) => p.original); if (!o) return;
    if (this.controle.criarClones) { this.controle.criarClones = false; this.espalharClones(2); }
    if (this.opcoes.originalAutomatico) return;
    if (this.controle.atacar) { o.ataquePedido = this.controle.atacar; this.controle.atacar = null; }
    o.alvo = vec(o.corpo.translation().x + this.controle.mover.x, 0, o.corpo.translation().z + this.controle.mover.z);
  }

  private pensarClone(p: Piranbenja): void {
    if (this.tempo < p.pensarEm) return;
    p.pensarEm = this.tempo + 0.25 + 0.2 + this.aleatorio() * 1.0; // pensa a cada ~0,25 s + reação de 0,2 a 1,2 s
    const u = this.entrada.cabeca, a = this.aleatorio() * Math.PI * 2;
    p.alvo = vec(u.x + Math.cos(a) * 0.9, 0, u.z + Math.sin(a) * 0.9);
    const d = Math.hypot(p.alvo.x, p.alvo.z);
    if (d > RINGUE.raio - 0.7) { p.alvo.x *= (RINGUE.raio - 0.7) / d; p.alvo.z *= (RINGUE.raio - 0.7) / d; }
    const pos = p.corpo.translation();
    if (lenH(sub(pos, u)) < 1.25 && this.tempo > p.ataqueEm) {
      p.ataquePedido = this.aleatorio() < 0.5 ? 'dano' : 'impacto';
      p.ataqueEm = this.tempo + 1.2 + this.aleatorio();
    }
  }

  private andar(p: Piranbenja): void {
    if (p.agarradoPor || this.tempo < p.voandoAte) return;
    const pos = p.corpo.translation();
    if (pos.y > PIRANBENJA.altura / 2 + 0.25) return; // no ar não anda
    const para = sub(p.alvo, pos); para.y = 0;
    const d = lenH(para);
    const v = p.corpo.linvel();
    const vel = d > 0.15 ? PIRANBENJA.velocidade * Math.min(1, d) : 0;
    const nx = d > 0.001 ? (para.x / d) * vel : 0, nz = d > 0.001 ? (para.z / d) * vel : 0;
    // segue a velocidade desejada aos poucos (não anula empurrões de uma vez)
    p.corpo.setLinvel({ x: v.x + (nx - v.x) * 0.25, y: v.y, z: v.z + (nz - v.z) * 0.25 }, true);
  }

  // ---------------- golpes das patas ----------------
  private golpesDasPatas(): void {
    const raioMao = URSO.raioMao * (this.entrada.tamanhoPata / 1.3);
    for (const l of ['esq', 'dir'] as const) {
      const v = this.velMao[l], vel = len(v);
      const cam = this.caminho[l]; this.caminho[l] = null;
      // pontos do caminho da pata desde a última amostra (ou só a posição atual)
      const pontos: V3[] = [];
      if (cam) for (let i = 1; i <= 6; i++) { const k = i / 6; pontos.push(vec(cam.de.x + (cam.ate.x - cam.de.x) * k, cam.de.y + (cam.ate.y - cam.de.y) * k, cam.de.z + (cam.ate.z - cam.de.z) * k)); }
      else pontos.push(this.entrada.maos[l].pos);
      const mao = this.entrada.maos[l];
      for (const p of this.pbs) {
        if (p.agarradoPor || vel < 1.6) continue;
        const c = p.corpo.translation();
        const baseY = c.y - PIRANBENJA.altura / 2;
        let ponto: V3 | null = null;
        for (const q of pontos) {
          const yEixo = Math.max(baseY + PIRANBENJA.raio, Math.min(baseY + PIRANBENJA.altura - PIRANBENJA.raio, q.y));
          if (Math.hypot(q.x - c.x, q.y - yEixo, q.z - c.z) <= raioMao + PIRANBENJA.raio + 0.03) { ponto = q; break; }
        }
        if (!ponto) continue;
        const m = { pos: ponto, gatilho: mao.gatilho, grip: mao.grip };
        const chave = l + p.numero;
        if ((this.recargaGolpe.get(chave) ?? -1) > this.tempo) continue;
        this.recargaGolpe.set(chave, this.tempo + 0.35);
        const punho = m.gatilho > 0.6 && m.grip > 0.6;
        const tipo: TipoGolpe = punho ? 'impacto' : 'dano';
        // desvio lateral: quanto o golpe passa de lado em relação ao eixo do corpo (0 = bem no meio)
        const vh = Math.hypot(v.x, v.z) || 1;
        const desvio = Math.abs((v.x / vh) * (c.z - m.pos.z) - (v.z / vh) * (c.x - m.pos.x));
        const zona = zonaDoContato(m.pos.y, baseY, PIRANBENJA.altura, desvio, PIRANBENJA.raio);
        const qualidade = qualidadeDoGolpe(v, vec(c.x - m.pos.x, 0, c.z - m.pos.z));
        this.aplicarGolpe(p, l, v, tipo, zona, qualidade);
      }
    }
  }

  private aplicarGolpe(p: Piranbenja, mao: Lado, v: V3, tipo: TipoGolpe, zona: Zona, qualidade: Qualidade): void {
    const mz = modsDaZona(zona, tipo), mq = MULT_QUALIDADE[qualidade];
    p.acertosRecentes = p.acertosRecentes.filter((t) => this.tempo - t < JANELA_COMBO);
    if (tipo === 'impacto') p.acertosRecentes.push(this.tempo);
    const combo = tipo === 'impacto' ? fatorCombo(p.acertosRecentes.length) : 1;
    const peso = p.original ? PESO.original : PESO.clone;
    const impacto = len(v) * (tipo === 'impacto' ? 0.55 : 0.25);
    let L = lancamento(impacto, p.res / (p.original ? PIRANBENJA.resOriginal : PIRANBENJA.resClone), peso, combo, mq * mz.empurrao);
    if (qualidade === 'raspao') L = Math.min(L, 3); // raspão nunca decola
    L = Math.min(L, 18);
    p.res -= (tipo === 'dano' ? 12 : 4) * mq * mz.dano;
    const vh = Math.hypot(v.x, v.z) || 1;
    const dir = vec(v.x / vh, mz.subida + (tipo === 'impacto' ? 0.25 : 0), v.z / vh);
    const n = len(dir);
    const atual = p.corpo.linvel();
    p.corpo.setLinvel({ x: atual.x + (dir.x / n) * L, y: Math.max(atual.y, 0) + (dir.y / n) * L, z: atual.z + (dir.z / n) * L }, true);
    if (L > 5) this.voar(p, 0.9, L);
    this.ursoAura = Math.min(100, this.ursoAura + (p.original ? 6 : 3));
    this.eventos.push({ tipo: 'golpe', mao, numero: p.numero, zona, qualidade, golpe: tipo, lancamento: +L.toFixed(2) });
    if (L > 9 || (p.original && L > 6)) this.cameraLenta(0.8);
    if (p.res <= 0 && !p.original) this.derreter(p);
  }

  private voar(p: Piranbenja, segundos: number, forca: number): void {
    p.voandoAte = this.tempo + segundos;
    p.corpo.setEnabledRotations(true, true, true, true);
    const a = Math.min(12, forca);
    p.corpo.setAngvel({ x: (this.aleatorio() - 0.5) * a, y: (this.aleatorio() - 0.5) * a, z: (this.aleatorio() - 0.5) * a }, true);
    p.batidasProjetil = 0; p.jaBateu.clear();
  }

  private cameraLenta(segundosReais: number): void {
    if (this.relogioReal < this.lentaAte) return;
    this.lentaAte = this.relogioReal + segundosReais;
    this.eventos.push({ tipo: 'cameraLenta', segundos: segundosReais, escala: 0.35 });
  }

  // ---------------- agarrar e jogar ----------------
  private agarrarESoltar(): void {
    const alcance = URSO.raioMao * (this.entrada.tamanhoPata / 1.3) + PIRANBENJA.raio + 0.12;
    for (const l of ['esq', 'dir'] as const) {
      const m = this.entrada.maos[l];
      const fechou = m.grip > 0.7, antes = this.gripAntes[l];
      this.gripAntes[l] = fechou;
      const seg = this.segurando[l];
      if (seg) {
        if (!this.pbs.includes(seg)) { this.segurando[l] = null; continue; }
        if (fechou) { seg.corpo.setNextKinematicTranslation({ x: m.pos.x, y: m.pos.y - 0.35, z: m.pos.z }); continue; }
        // soltou: vira projétil com a velocidade da pata
        const v = this.velMao[l];
        seg.corpo.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
        seg.corpo.setLinvel({ x: v.x * 1.1, y: v.y * 1.1 + 1, z: v.z * 1.1 }, true);
        seg.agarradoPor = null; this.segurando[l] = null;
        const vel = len(v);
        if (vel > 3) this.voar(seg, 1.2, vel);
        this.eventos.push({ tipo: 'arremessou', mao: l, numero: seg.numero, velocidade: +vel.toFixed(2) });
        continue;
      }
      if (!fechou || antes) continue;
      let melhor: Piranbenja | null = null, md = alcance;
      for (const p of this.pbs) {
        if (p.agarradoPor) continue;
        const c = p.corpo.translation();
        const yEixo = Math.max(c.y - PIRANBENJA.altura / 2 + PIRANBENJA.raio, Math.min(c.y + PIRANBENJA.altura / 2 - PIRANBENJA.raio, m.pos.y));
        const d = Math.hypot(m.pos.x - c.x, m.pos.y - yEixo, m.pos.z - c.z);
        if (d < md) { md = d; melhor = p; }
      }
      if (!melhor) continue;
      melhor.agarradoPor = l; this.segurando[l] = melhor;
      melhor.corpo.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
      melhor.corpo.setEnabledRotations(true, true, true, true);
      this.eventos.push({ tipo: 'agarrou', mao: l, numero: melhor.numero });
    }
  }

  // ---------------- boliche ----------------
  private boliche(): void {
    for (const p of this.pbs) {
      if (this.tempo >= p.voandoAte && !p.agarradoPor) continue;
      if (p.agarradoPor) continue;
      const v = p.corpo.linvel(), vel = len(v);
      if (vel < 4) continue;
      const a = p.corpo.translation();
      for (const q of this.pbs) {
        if (q === p || q.agarradoPor || p.jaBateu.has(q.numero)) continue;
        const b = q.corpo.translation();
        if (Math.hypot(a.x - b.x, a.z - b.z) > PIRANBENJA.raio * 2 + 0.08 || Math.abs(a.y - b.y) > PIRANBENJA.altura * 0.9) continue;
        p.jaBateu.add(q.numero);
        const qv = q.corpo.linvel();
        q.corpo.setLinvel({ x: qv.x + v.x * 0.6, y: Math.max(qv.y, 0) + 1.5, z: qv.z + v.z * 0.6 }, true);
        p.corpo.setLinvel({ x: v.x * 0.7, y: v.y, z: v.z * 0.7 }, true);
        q.res -= 4; p.res -= 5;
        this.voar(q, 0.9, vel * 0.6);
        p.batidasProjetil++;
        if (p.batidasProjetil === 3) this.eventos.push({ tipo: 'strike', derrubados: 3 });
        if (q.res <= 0 && !q.original) this.derreter(q);
      }
    }
  }

  // ---------------- Piranbenjas atacando o urso ----------------
  private ataquesNoUrso(): void {
    const u = this.entrada.cabeca;
    for (const p of this.pbs) {
      if (!p.ataquePedido) continue;
      const tipo = p.ataquePedido; p.ataquePedido = null;
      const c = p.corpo.translation();
      const dir = vec(u.x - c.x, 0, u.z - c.z), d = lenH(dir);
      if (d > URSO.raioCorpo + PIRANBENJA.raio + 0.45) continue;
      if (tipo === 'dano') { this.ursoRes = Math.max(0, this.ursoRes - 3); this.eventos.push({ tipo: 'ursoGolpeado', golpe: tipo, combo: 1, empurrao: { x: 0, z: 0 } }); continue; }
      // impacto: ataques combinados (vários Piranbenjas juntos) aumentam muito o empurrão
      this.ursoAcertos = this.ursoAcertos.filter((t) => this.tempo - t < JANELA_COMBO); this.ursoAcertos.push(this.tempo);
      const combo = fatorCombo(this.ursoAcertos.length);
      const L = lancamento(2.2, this.ursoRes / 100, PESO.urso, combo);
      this.ursoRes = Math.max(0, this.ursoRes - 1);
      this.eventos.push({ tipo: 'ursoGolpeado', golpe: tipo, combo, empurrao: { x: (dir.x / (d || 1)) * L, z: (dir.z / (d || 1)) * L } });
    }
  }

  // ---------------- endireitar, quedas e rodadas ----------------
  private endireitar(): void {
    for (const p of this.pbs) {
      if (p.agarradoPor || this.tempo < p.voandoAte) continue;
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
    this.mundo.removeRigidBody(p.corpo);
    this.pbs = this.pbs.filter((x) => x !== p);
    this.eventos.push({ tipo: 'derreteu', numero: p.numero });
  }

  private quedas(): void {
    if (this.rodada !== 'luta') return;
    for (const p of [...this.pbs]) {
      if (p.corpo.translation().y > -1.5) continue;
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
      urso: { res: Math.round(this.ursoRes), aura: Math.round(this.ursoAura) },
      piranbenjas: this.pbs.map((p) => {
        const t = p.corpo.translation(), r = p.corpo.rotation();
        return { numero: p.numero, pos: vec(t.x, t.y, t.z), rot: [r.x, r.y, r.z, r.w], voando: this.tempo < p.voandoAte, agarrado: !!p.agarradoPor };
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
    p.corpo.setTranslation(pos, true); p.corpo.setLinvel({ x: 0, y: 0, z: 0 }, true); p.alvo = { ...pos };
  }
  testePedirAtaque(numero: number, tipo: TipoGolpe): void { const p = this.pbs.find((x) => x.numero === numero); if (p) p.ataquePedido = tipo; }
  testeVelocidade(numero: number): number { const p = this.pbs.find((x) => x.numero === numero); return p ? len(p.corpo.linvel()) : 0; }
  testeCriarClones(n: number): number { return this.espalharClones(n); }
}
