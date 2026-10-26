// Canal entre o PC (anfitrião) e o Quest (convidado).
// - CanalTrystero: WebRTC de verdade; a Trystero só ajuda os dois a se acharem (redes públicas, aperto de mão
//   criptografado com o código da sala). Depois, um canal "rápido" sem reenvio leva as fotos e as mãos.
// - CanalLocal: duas abas do mesmo navegador (BroadcastChannel). Serve para os testes automáticos e para
//   testar no computador sem óculos.
// Os dois têm a mesma cara: o resto do jogo não sabe qual está usando.

import { joinRoom, type Room } from 'trystero';

export const VERSAO_JOGO = 'prototipo-4';
export type Papel = 'anfitriao' | 'convidado';
export type TipoConexao = 'local' | 'internet' | 'desconhecida';

export interface Canal {
  readonly papel: Papel;
  enviarRapido(dados: ArrayBuffer): void;
  enviarEvento(evento: unknown): void;
  aoRapido: (dados: ArrayBuffer) => void;
  aoEvento: (evento: unknown) => void;
  aoConectar: () => void;
  aoSair: () => void;
  aoRecusar: (motivo: string) => void;
  conectado(): boolean;
  tipoConexao(): Promise<TipoConexao>;
  fechar(): void;
}

const vazio = () => { /* ninguém ouvindo ainda */ };

// ------------------------------------------------------------------------------------------
/** Duas abas do mesmo navegador. */
export class CanalLocal implements Canal {
  private bc: BroadcastChannel;
  private eu = Math.random().toString(36).slice(2);
  private outro: string | null = null;
  aoRapido: (d: ArrayBuffer) => void = vazio; aoEvento: (e: unknown) => void = vazio;
  aoConectar = vazio; aoSair = vazio; aoRecusar: (m: string) => void = vazio;

  constructor(readonly papel: Papel, codigo: string) {
    this.bc = new BroadcastChannel('lutcha-' + codigo);
    this.bc.onmessage = (m) => this.receber(m.data as { de: string; para?: string; tipo: string; dados?: unknown });
    if (papel === 'convidado') this.bc.postMessage({ de: this.eu, tipo: 'oi', dados: VERSAO_JOGO });
  }
  private receber(m: { de: string; para?: string; tipo: string; dados?: unknown }): void {
    if (m.de === this.eu || (m.para && m.para !== this.eu)) return;
    if (m.tipo === 'oi' && this.papel === 'anfitriao') {
      if (m.dados !== VERSAO_JOGO) { this.bc.postMessage({ de: this.eu, para: m.de, tipo: 'recusa', dados: 'versao' }); return; }
      if (this.outro && this.outro !== m.de) { this.bc.postMessage({ de: this.eu, para: m.de, tipo: 'recusa', dados: 'cheia' }); return; }
      this.outro = m.de; this.bc.postMessage({ de: this.eu, para: m.de, tipo: 'bemvindo' }); this.aoConectar(); return;
    }
    if (m.tipo === 'bemvindo' && this.papel === 'convidado') { this.outro = m.de; this.aoConectar(); return; }
    if (m.tipo === 'recusa') { this.aoRecusar(String(m.dados)); return; }
    if (m.de !== this.outro) return;
    if (m.tipo === 'rapido') this.aoRapido(m.dados as ArrayBuffer);
    else if (m.tipo === 'evento') this.aoEvento(m.dados);
    else if (m.tipo === 'tchau') { this.outro = null; this.aoSair(); }
  }
  enviarRapido(d: ArrayBuffer): void { if (this.outro) this.bc.postMessage({ de: this.eu, para: this.outro, tipo: 'rapido', dados: d }); }
  enviarEvento(e: unknown): void { if (this.outro) this.bc.postMessage({ de: this.eu, para: this.outro, tipo: 'evento', dados: e }); }
  conectado(): boolean { return !!this.outro; }
  async tipoConexao(): Promise<TipoConexao> { return 'local'; }
  fechar(): void { if (this.outro) this.bc.postMessage({ de: this.eu, para: this.outro, tipo: 'tchau' }); this.bc.close(); }
}

// ------------------------------------------------------------------------------------------
/** WebRTC pela Trystero. */
export class CanalTrystero implements Canal {
  private sala: Room;
  private outro: string | null = null;
  private rapido: RTCDataChannel | null = null;
  private acaoRapida; private acaoEvento;
  aoRapido: (d: ArrayBuffer) => void = vazio; aoEvento: (e: unknown) => void = vazio;
  aoConectar = vazio; aoSair = vazio; aoRecusar: (m: string) => void = vazio;

  constructor(readonly papel: Papel, codigo: string) {
    this.sala = joinRoom({ appId: 'gaburadigital-lutcha', password: 'lutcha-' + codigo }, 'sala-' + codigo, {
      // aperto de mão: os dois precisam ser o mesmo jogo, na mesma versão
      onPeerHandshake: async (_id, enviar, receber) => {
        await enviar({ jogo: 'lutcha', versao: VERSAO_JOGO });
        const { data } = await receber();
        const d = data as { jogo?: string; versao?: string } | undefined;
        if (d?.jogo !== 'lutcha' || d.versao !== VERSAO_JOGO) { this.aoRecusar('versao'); throw new Error('versão diferente'); }
      },
    });
    this.acaoRapida = this.sala.makeAction<ArrayBuffer>('rap');
    this.acaoEvento = this.sala.makeAction<string>('evt');
    this.acaoRapida.onMessage = (d) => this.aoRapido(d);
    this.acaoEvento.onMessage = (d, { peerId }) => {
      if (peerId !== this.outro) return;
      try { this.aoEvento(JSON.parse(d)); } catch { /* mensagem estragada: descarta */ }
    };
    this.sala.onPeerJoin = (id) => {
      if (this.outro && this.outro !== id) { this.acaoEvento.send(JSON.stringify({ tipo: 'recusa', motivo: 'cheia' }), { target: id }); return; }
      this.outro = id;
      this.abrirCanalRapido(id);
      this.aoConectar();
    };
    this.sala.onPeerLeave = (id) => { if (id === this.outro) { this.outro = null; this.rapido = null; this.aoSair(); } };
  }

  /** Canal sem reenvio e sem ordem, combinado nos dois lados com o mesmo número: foto velha perdida não atrasa a nova. */
  private abrirCanalRapido(id: string): void {
    try {
      const pc = this.sala.getPeers()[id];
      const c = pc.createDataChannel('lutcha-rapido', { negotiated: true, id: 9, ordered: false, maxRetransmits: 0 });
      c.binaryType = 'arraybuffer';
      c.onmessage = (m) => this.aoRapido(m.data as ArrayBuffer);
      this.rapido = c;
    } catch { this.rapido = null; }
  }

  enviarRapido(d: ArrayBuffer): void {
    if (!this.outro) return;
    if (this.rapido && this.rapido.readyState === 'open') this.rapido.send(d);
    else this.acaoRapida.send(d, { target: this.outro });
  }
  enviarEvento(e: unknown): void { if (this.outro) this.acaoEvento.send(JSON.stringify(e), { target: this.outro }); }
  conectado(): boolean { return !!this.outro; }

  /** "local" quando o par de candidatos escolhido é da rede de casa (host); "internet" quando passa por fora. */
  async tipoConexao(): Promise<TipoConexao> {
    if (!this.outro) return 'desconhecida';
    try {
      const stats = await this.sala.getPeers()[this.outro].getStats();
      let par: { localCandidateId?: string } | undefined;
      stats.forEach((s) => { if (s.type === 'candidate-pair' && s.state === 'succeeded' && s.nominated) par = s; });
      if (!par) return 'desconhecida';
      let tipo = '';
      stats.forEach((s) => { if (s.id === par!.localCandidateId) tipo = s.candidateType; });
      return tipo === 'host' ? 'local' : tipo ? 'internet' : 'desconhecida';
    } catch { return 'desconhecida'; }
  }
  fechar(): void { void this.sala.leave(); }
}

export function abrirCanal(tipo: 'trystero' | 'local', papel: Papel, codigo: string): Canal {
  return tipo === 'local' ? new CanalLocal(papel, codigo) : new CanalTrystero(papel, codigo);
}
