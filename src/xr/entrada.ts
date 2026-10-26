// Leitura dos controles do Quest (WebXR) e vibração.
// Vem do src/xr/entrada.ts da Nave (jogo-xp-vr-gaburaverso), reduzido ao que o teste das patas usa.
//
// Quest (xr-standard): botões[0] gatilho, [1] grip, [3] clique do analógico, [4] A/X, [5] B/Y; eixos[2,3] analógico.
// O botão ≡ do controle esquerdo não chega ao navegador no WebXR.

import * as THREE from 'three';

export type Lado = 'esq' | 'dir';

export interface MaoControle {
  lado: Lado;
  conectada: boolean;
  /** Onde a mão está (espaço do "grip"): as patas ficam presas aqui. */
  pose: THREE.Group;
  fonte: XRInputSource | null;
  gatilhoValor: number;  // 0 a 1
  gripValor: number;     // 0 a 1
  analogico: THREE.Vector2;
}

function novaMao(lado: Lado): MaoControle {
  return { lado, conectada: false, pose: new THREE.Group(), fonte: null, gatilhoValor: 0, gripValor: 0, analogico: new THREE.Vector2() };
}

export const entrada = {
  modo: 'pc' as 'vr' | 'pc',
  maos: { esq: novaMao('esq'), dir: novaMao('dir') } as Record<Lado, MaoControle>,
  /** Botões que acabaram de ser apertados neste quadro (ex.: 'A', 'B', 'X', 'Y', 'analogicoE', 'analogicoD'). */
  apertou: new Set<string>(),
  /** Tela dos botões ao vivo (modo de teste). */
  botoesVivos: new Set<string>(),
};

/** Liga os controles do WebXR: os grupos "pose" ficam dentro do grip que o Three.js move. */
export function ligarControlesVR(renderizador: THREE.WebGLRenderer, rig: THREE.Object3D): void {
  for (let i = 0; i < 2; i++) {
    const grip = renderizador.xr.getControllerGrip(i);
    rig.add(grip);
    grip.addEventListener('connected', (e) => {
      const fonte = (e as unknown as { data: XRInputSource }).data;
      const lado: Lado = fonte.handedness === 'left' ? 'esq' : 'dir';
      const m = entrada.maos[lado];
      m.conectada = true; m.fonte = fonte;
      m.pose.position.set(0, 0, 0); m.pose.quaternion.identity();
      grip.add(m.pose);
    });
    grip.addEventListener('disconnected', () => {
      for (const m of Object.values(entrada.maos)) if (m.pose.parent === grip) { m.conectada = false; m.fonte = null; }
    });
  }
}

const antes = new Map<string, boolean>();
function borda(chave: string, agora: boolean): boolean { const a = antes.get(chave) ?? false; antes.set(chave, agora); return agora && !a; }

/** Lê os dois controles (uma vez por quadro). Funciona também com controles simulados nos testes. */
export function lerVR(): void {
  entrada.apertou.clear(); entrada.botoesVivos.clear();
  for (const m of Object.values(entrada.maos)) {
    const gp = m.fonte?.gamepad;
    const bt = (i: number) => !!gp?.buttons[i]?.pressed;
    m.gatilhoValor = gp?.buttons[0]?.value ?? 0;
    m.gripValor = gp?.buttons[1]?.value ?? 0;
    const ax = gp?.axes ?? [];
    const morto = (v: number) => (Math.abs(v) < 0.15 ? 0 : v);
    m.analogico.set(morto(ax.length >= 4 ? ax[2] : ax[0] ?? 0), morto(ax.length >= 4 ? ax[3] : ax[1] ?? 0));
    const nomes = m.lado === 'dir' ? { 3: 'analogicoD', 4: 'A', 5: 'B' } : { 3: 'analogicoE', 4: 'X', 5: 'Y' };
    for (const [i, nome] of Object.entries(nomes)) {
      if (bt(Number(i))) entrada.botoesVivos.add(nome);
      if (borda(nome, bt(Number(i)))) entrada.apertou.add(nome);
    }
  }
}

/** Vibração curta no controle: força de 0 a 1, duração em ms. */
export function vibrar(lado: Lado, forca: number, ms: number): void {
  if (entrada.modo !== 'vr') return;
  const gp = entrada.maos[lado].fonte?.gamepad as (Gamepad & { hapticActuators?: { pulse: (v: number, d: number) => Promise<boolean> }[] }) | undefined;
  try { void gp?.hapticActuators?.[0]?.pulse(Math.min(1, Math.max(0, forca)), ms); } catch { /* sem vibração */ }
}
