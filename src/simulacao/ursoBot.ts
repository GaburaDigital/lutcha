// UrsoBura controlado pelo jogo, para o teste solo do Piranbenja no PC.
// Ele "joga" como uma pessoa no Quest: decide onde ficam a cabeça e as patas a cada passo, e a luta trata
// essas patas igual às do Quest (os mesmos golpes, o mesmo agarrar). O bot só vê posições: não sabe quem é o original.
//
// Jeitos (C16): parado (boneco de treino), bobo (anda à toa, patadas lentas que erram, nunca agarra)
// e ofensivo (vai atrás do Piranbenja mais perto, usa todos os golpes, agarra e arremessa para longe,
// sacode o braço ou arranca com a outra pata os clones grudados).
// C20–C23: cai sentado (barra de equilíbrio cheia), fica tonto (não agarra), esbarra nas formações e,
// ofensivo, tenta rebater com um soco quem vem voando da catapulta.

import { eixosDoGiro, soma, menos, vezes, unit, tam, v, type Lado } from './corpoUrso';
import { RINGUE, type V3 } from './regras';

export type JeitoUrso = 'parado' | 'bobo' | 'ofensivo';
type Acao = 'soco' | 'socoLateral' | 'gancho' | 'martelada' | 'arranhao' | 'estocada' | 'agarrar' | 'sacudir';

export interface VisaoDoBot {
  piranbenjas: { numero: number; pos: V3; vel: V3; grudadoEm: string | null; agarrado: boolean; derrubado: boolean; projetil: boolean }[];
  segurando: Record<Lado, number | null>;
  lentidao: number; // 0 a 1: cada clone grudado deixa 5% mais lento
}
export interface SaidaBot { cabeca: V3; giro: number; maos: Record<Lado, { pos: V3; gatilho: number; grip: number }>; tamanhoPata: number }

interface Trecho { ate: V3; dur: number; gatilho: number; grip: number }
interface Plano { lado: Lado; trechos: Trecho[]; i: number; t: number; de: V3; acao: Acao; alvo: number | null }

export class UrsoBot {
  x = 0; z = 3; giro = 0;
  private maos: Record<Lado, { pos: V3; gatilho: number; grip: number }>;
  private plano: Plano | null = null;
  private esperaAte = 0;
  private alvoAndar: V3 | null = null;
  private tempo = 0;
  private empurrao = v(0, 0, 0);       // escorrega depois de levar soco
  private voo: V3 | null = null;       // velocidade enquanto voa (decolou)
  private altura = 0;                  // quanto está acima do chão (ou abaixo, se caiu fora do ringue)
  private pulo = 0;                    // pulinho de um empurrão (C32): velocidade para cima, sem virar voo
  private sentadoAte = 0;              // caiu sentado: não anda nem ataca
  private abaixar = 0;                 // quanto a cabeça desce sentado (m)
  private tontoAte = 0;
  private rebatidos = new Set<number>();

  constructor(public jeito: JeitoUrso, private aleatorio: () => number) {
    this.maos = { esq: { pos: this.descanso('esq', 0), gatilho: 0, grip: 0 }, dir: { pos: this.descanso('dir', 0), gatilho: 0, grip: 0 } };
  }

  reiniciar(): void { this.pulo = 0; this.x = 0; this.z = 3; this.giro = 0; this.plano = null; this.esperaAte = this.tempo + 1; this.alvoAndar = null; this.voo = null; this.altura = 0; this.empurrao = v(0, 0, 0); this.sentadoAte = 0; this.abaixar = 0; this.tontoAte = 0; this.rebatidos.clear(); }
  /** Barra de equilíbrio cheia: senta no chão (a cabeça desce ~0,9 m). */
  sentar(segundos: number): void { this.sentadoAte = this.tempo + segundos; this.plano = null; }
  tonto(segundos: number): void { this.tontoAte = this.tempo + segundos; }
  /** Esbarrou numa formação: volta um pouco (não atravessa). */
  deslocar(dx: number, dz: number): void { this.x += dx; this.z += dz; }

  /** Levou soco: escorrega um pouco (perde força aos poucos). */
  empurrar(vx: number, vz: number, subida = 0): void {
    this.empurrao = soma(this.empurrao, v(vx, 0, vz));
    if (!this.voo && this.altura <= 0.01 && subida > 0) this.pulo = subida; // C32: pulinho
  }
  /** Saiu do ringue (C32): cai no vazio. */
  cair(): void { if (!this.voo) this.voo = v(this.empurrao.x * 0.5, Math.max(0, this.pulo), this.empurrao.z * 0.5); this.pulo = 0; this.plano = null; }
  /** Decolou: voa em arco; no ar não ataca; se cair fora do ringue, continua caindo. */
  decolar(vel: V3): void { this.voo = { ...vel }; this.plano = null; this.sentadoAte = 0; }
  get noAr(): boolean { return !!this.voo; }

  /** Onde a pata descansa: na frente da barriga, um pouco para o lado, balançando com a respiração. */
  private descanso(l: Lado, t: number): V3 {
    const { frente, direita } = eixosDoGiro(this.giro), lado = l === 'esq' ? -1 : 1;
    const resp = Math.sin(t * 2 + (lado > 0 ? 0.6 : 0)) * 0.03 + (this.voo ? 0.9 : 0); // no ar, braços para cima
    return soma(soma(v(this.x, 1.15 + resp + this.altura - this.abaixar * 0.8, this.z), vezes(direita, 0.62 * lado)), vezes(frente, 0.25));
  }

  passo(dt: number, tempo: number, visao: VisaoDoBot): SaidaBot {
    this.tempo = tempo;
    const veloz = 1 - Math.min(0.6, visao.lentidao);
    // escorregar e voar valem para todos os jeitos (até o parado é empurrado)
    this.x += this.empurrao.x * dt; this.z += this.empurrao.z * dt;
    this.empurrao = vezes(this.empurrao, Math.exp(-2.5 * dt));
    if (!this.voo && (this.altura > 0 || this.pulo > 0)) {
      this.altura += this.pulo * dt; this.pulo -= 9.81 * dt;
      if (this.altura <= 0) { this.altura = 0; this.pulo = 0; }
    }
    if (this.voo) {
      this.x += this.voo.x * dt; this.z += this.voo.z * dt; this.altura += this.voo.y * dt; this.voo.y -= 9.81 * dt;
      const dentro = Math.hypot(this.x, this.z) <= RINGUE.raio;
      if (this.altura <= 0 && dentro) { this.altura = 0; this.voo = null; this.esperaAte = tempo + 0.8; }
      else if (!dentro && this.altura < -6) this.voo.y = 0; // já caiu bem fora: para de calcular
    } else if (this.jeito !== 'parado' && tempo >= this.sentadoAte) this.decidir(visao, veloz, dt);
    const querAbaixar = tempo < this.sentadoAte ? 0.9 : 0;
    this.abaixar += (querAbaixar - this.abaixar) * Math.min(1, dt * 8);
    this.moverMaos(dt, visao);
    const bob = this.jeito === 'parado' ? 0 : Math.sin(tempo * 5) * 0.015;
    const tonto = tempo < this.tontoAte ? Math.sin(tempo * 9) * 0.06 : 0;
    return { cabeca: v(this.x + tonto, 2.45 + bob + this.altura - this.abaixar, this.z), giro: this.giro, maos: { esq: { ...this.maos.esq, pos: { ...this.maos.esq.pos } }, dir: { ...this.maos.dir, pos: { ...this.maos.dir.pos } } }, tamanhoPata: 1.3 };
  }

  private virarPara(p: V3, dt: number, rapidez = 2.5): number {
    const quer = Math.atan2(-(p.x - this.x), -(p.z - this.z)); // giro em que a frente aponta para p
    let d = quer - this.giro; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
    this.giro += Math.max(-rapidez * dt, Math.min(rapidez * dt, d));
    return Math.abs(d);
  }

  private andarPara(p: V3, vel: number, dt: number, parar = 0.1): boolean {
    const d = Math.hypot(p.x - this.x, p.z - this.z);
    if (d <= parar) return true;
    const passo = Math.min(d - parar, vel * dt);
    this.x += ((p.x - this.x) / d) * passo; this.z += ((p.z - this.z) / d) * passo;
    const r = Math.hypot(this.x, this.z), m = RINGUE.raio - 1.0; // nunca sai do ringue sozinho
    if (r > m) { this.x *= m / r; this.z *= m / r; }
    return false;
  }

  private decidir(visao: VisaoDoBot, veloz: number, dt: number): void {
    if (this.plano) return; // ocupado com um golpe
    const livres = visao.piranbenjas.filter((p) => !p.agarrado && !p.grudadoEm && p.pos.y > -0.5);
    const perto = livres.map((p) => ({ p, d: Math.hypot(p.pos.x - this.x, p.pos.z - this.z) })).sort((a, b) => a.d - b.d);
    if (this.jeito === 'bobo') {
      if (!this.alvoAndar || Math.hypot(this.alvoAndar.x - this.x, this.alvoAndar.z - this.z) < 0.3 || this.aleatorio() < 0.003) {
        const a = this.aleatorio() * Math.PI * 2, r = this.aleatorio() * 3.5; this.alvoAndar = v(Math.cos(a) * r, 0, Math.sin(a) * r);
      }
      this.virarPara(this.alvoAndar, dt, 1.2); this.andarPara(this.alvoAndar, 0.6 * veloz, dt);
      if (this.tempo > this.esperaAte && perto[0] && perto[0].d < 1.9) {
        this.esperaAte = this.tempo + 3 + this.aleatorio() * 2;
        this.golpe(this.aleatorio() < 0.5 ? 'soco' : 'arranhao', perto[0].p, 3.5, 0.55);
      }
      return;
    }
    // ofensivo: quem vem voando da catapulta, tenta rebater com um soco na hora certa (às vezes erra)
    const vindo = visao.piranbenjas.find((p) => p.projetil && !this.rebatidos.has(p.numero) && Math.hypot(p.pos.x - this.x, p.pos.z - this.z) < 3.2
      && (p.vel.x * (this.x - p.pos.x) + p.vel.z * (this.z - p.pos.z)) > 0);
    if (vindo) {
      this.rebatidos.add(vindo.numero);
      if (this.aleatorio() < 0.55) {
        const t = 0.4, previsto = v(vindo.pos.x + vindo.vel.x * t, vindo.pos.y + vindo.vel.y * t - 4.9 * t * t, vindo.pos.z + vindo.vel.z * t);
        this.virarPara(previsto, 1, 10); this.golpe('soco', { numero: vindo.numero, pos: previsto }, 9, 0.05); return;
      }
    }
    // ofensivo: primeiro se livra de quem está grudado nele
    const grudados = visao.piranbenjas.filter((p) => p.grudadoEm);
    if (grudados.length && this.tempo > this.esperaAte) {
      const g = grudados[0];
      const noBraco = g.grudadoEm!.startsWith('braco') || g.grudadoEm!.startsWith('antebraco') || g.grudadoEm!.startsWith('pata');
      if (noBraco && this.aleatorio() < 0.6) { this.sacudir(g.grudadoEm!.endsWith('E') ? 'esq' : 'dir'); return; }
      const lado: Lado = g.grudadoEm!.endsWith('E') ? 'dir' : 'esq'; // arranca com a outra pata
      this.agarrar(g, lado, true); return;
    }
    if (!perto[0]) return;
    const alvo = perto[0].p;
    const erro = this.virarPara(alvo.pos, dt, 2.5);
    if (perto[0].d > 1.25) { this.andarPara(alvo.pos, 0.9 * veloz, dt, 1.15); return; }
    if (this.tempo < this.esperaAte || erro > 0.5) return;
    this.esperaAte = this.tempo + 0.5 + this.aleatorio() * 0.7;
    const r = this.aleatorio();
    const tonto = this.tempo < this.tontoAte; // tonto não agarra
    const acao: Acao = r < 0.3 && !tonto ? 'agarrar' : r < 0.3 ? 'soco' : r < 0.46 ? 'soco' : r < 0.57 ? 'socoLateral' : r < 0.68 ? 'gancho' : r < 0.77 ? 'martelada' : r < 0.9 ? 'arranhao' : 'estocada';
    if (acao === 'agarrar') this.agarrar(alvo, this.aleatorio() < 0.5 ? 'esq' : 'dir', false);
    else this.golpe(acao, alvo, 8, 0.1);
  }

  /** Golpe em três partes: armar (devagar), bater (rápido, pelo caminho do golpe) e voltar ao descanso. */
  private golpe(acao: Exclude<Acao, 'agarrar' | 'sacudir'>, alvo: { numero: number; pos: V3 }, vel: number, erro: number): void {
    const lado: Lado = this.aleatorio() < 0.5 ? 'esq' : 'dir';
    const T = soma(alvo.pos, v((this.aleatorio() - 0.5) * erro * 2, 0.05, (this.aleatorio() - 0.5) * erro * 2));
    const d = unit(v(T.x - this.x, 0, T.z - this.z), eixosDoGiro(this.giro).frente);
    const lat = vezes(v(-d.z, 0, d.x), lado === 'esq' ? -1 : 1);
    const punho = acao === 'soco' || acao === 'socoLateral' || acao === 'gancho' || acao === 'martelada' ? 1 : 0;
    let W: V3, E: V3;
    switch (acao) {
      case 'soco': W = soma(soma(T, vezes(d, -0.8)), v(0, 0.1, 0)); E = soma(T, vezes(d, 0.35)); break;
      case 'socoLateral': W = soma(T, vezes(lat, 0.9)); E = soma(T, vezes(lat, -0.5)); break;
      case 'gancho': W = soma(soma(T, v(0, -0.45, 0)), vezes(d, -0.35)); W.y = Math.max(0.05, W.y); E = soma(T, v(0, 0.75, 0)); break;
      case 'martelada': W = soma(T, v(0, 0.95, 0)); E = soma(T, v(0, -0.4, 0)); break;
      case 'arranhao': W = soma(soma(T, vezes(lat, 0.8)), v(0, 0.25, 0)); E = soma(soma(T, vezes(lat, -0.8)), v(0, -0.15, 0)); break;
      default: W = soma(T, vezes(d, -0.8)); E = soma(T, vezes(d, 0.3));
    }
    const durBater = tam(menos(E, W)) / vel;
    this.plano = { lado, acao, alvo: alvo.numero, i: 0, t: 0, de: { ...this.maos[lado].pos }, trechos: [
      { ate: W, dur: 0.35, gatilho: punho, grip: punho },
      { ate: E, dur: Math.max(0.06, durBater), gatilho: punho, grip: punho },
      { ate: E, dur: 0.1, gatilho: punho, grip: punho },
      { ate: this.descanso(lado, this.tempo), dur: 0.4, gatilho: 0, grip: 0 },
    ] };
  }

  /** Agarrar: leva a pata aberta até o Piranbenja, fecha devagar, levanta e arremessa para longe do meio do ringue. */
  private agarrar(alvo: { numero: number; pos: V3 }, lado: Lado, soDeixarCair: boolean): void {
    const T = soma(alvo.pos, v(0, 0.12, 0));
    const fora = unit(v(this.x, 0, this.z), eixosDoGiro(this.giro).frente); // para fora do ringue, do lado do urso
    const { frente } = eixosDoGiro(this.giro);
    const lado1 = lado === 'esq' ? -1 : 1, { direita } = eixosDoGiro(this.giro);
    const alto = soma(soma(v(this.x, 2.3, this.z), vezes(frente, 0.85)), vezes(direita, 0.5 * lado1)); // levanta na frente, longe da própria cabeça
    const longe = soma(soma(alto, vezes(fora, 1.4)), vezes(frente, 0.6));
    this.plano = { lado, acao: 'agarrar', alvo: alvo.numero, i: 0, t: 0, de: { ...this.maos[lado].pos }, trechos: [
      { ate: soma(T, v(0, 0.35, 0)), dur: 0.35, gatilho: 0, grip: 0 },
      { ate: T, dur: 0.2, gatilho: 0, grip: 0 },
      { ate: T, dur: 0.25, gatilho: 0, grip: 1 },          // fecha a mão devagar (agarrar)
      { ate: alto, dur: 0.55, gatilho: 0, grip: 1 },       // levanta
      soDeixarCair
        ? { ate: soma(alto, vezes(fora, 0.6)), dur: 0.3, gatilho: 0, grip: 0 }
        : { ate: longe, dur: 0.16, gatilho: 0, grip: 1 },  // arremesso rápido
      { ate: longe, dur: 0.05, gatilho: 0, grip: 0 },      // solta no fim do movimento
      { ate: this.descanso(lado, this.tempo), dur: 0.5, gatilho: 0, grip: 0 },
    ] };
  }

  /** Sacudir o braço para soltar quem está grudado: vai e volta bem rápido. */
  private sacudir(lado: Lado): void {
    const base = this.descanso(lado, this.tempo), { direita } = eixosDoGiro(this.giro);
    const trechos: Trecho[] = [];
    for (let i = 0; i < 6; i++) trechos.push({ ate: soma(base, soma(vezes(direita, i % 2 ? 0.45 : -0.45), v(0, i % 2 ? 0.3 : -0.1, 0))), dur: 0.08, gatilho: 0, grip: 0 });
    trechos.push({ ate: base, dur: 0.3, gatilho: 0, grip: 0 });
    this.plano = { lado, acao: 'sacudir', alvo: null, i: 0, t: 0, de: { ...this.maos[lado].pos }, trechos };
    this.esperaAte = this.tempo + 1.2;
  }

  private moverMaos(dt: number, visao: VisaoDoBot): void {
    for (const l of ['esq', 'dir'] as const) {
      if (this.plano?.lado === l) continue;
      const alvo = this.descanso(l, this.tempo), m = this.maos[l], k = Math.min(1, dt * 6);
      m.pos = soma(m.pos, vezes(menos(alvo, m.pos), k)); m.gatilho = 0; m.grip = 0;
    }
    const p = this.plano; if (!p) return;
    const tr = p.trechos[p.i];
    // o agarrar desiste se a pata fechou e não pegou ninguém
    if (p.acao === 'agarrar' && p.i === 3 && p.t === 0 && visao.segurando[p.lado] == null) { p.i = p.trechos.length - 1; p.de = { ...this.maos[p.lado].pos }; }
    p.t += dt;
    const k = Math.min(1, p.t / p.trechos[p.i].dur);
    const s = k * k * (3 - 2 * k); // começa e termina suave
    const m = this.maos[p.lado];
    m.pos = soma(p.de, vezes(menos(p.trechos[p.i].ate, p.de), p.acao === 'sacudir' || p.i === 1 || (p.acao === 'agarrar' && p.i === 4) ? k : s));
    m.gatilho = tr.gatilho; m.grip = tr.grip;
    if (k >= 1) { p.de = { ...p.trechos[p.i].ate }; p.i++; p.t = 0; if (p.i >= p.trechos.length) this.plano = null; }
  }
}
