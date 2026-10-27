// Técnico no PC (conversa "Programação por blocos e IA dos clones"): liga as táticas à luta, sem mexer na física.
// Teclas (C11, C26, C30): Tab abre e fecha o Quadro do técnico (aberto = original no automático, D-309; a luta não pausa)
// · 1 a 4 põem em campo a tática da aba (0 = sem tática, IA mínima) · U I O P = sinais · G = grupo de quem nascer agora
// · Enter (com o Quadro aberto) = Aplicar. Com o Quadro aberto, as teclas do Piranbenja ficam paradas (dá para digitar nos blocos).
// Câmera de técnico (D-308): com o Quadro aberto, sobe atrás do original e mostra o ringue inteiro, suave (~0,6 s).
// Tudo aqui fica no PC: o Quest nunca recebe a tática, os grupos nem quem é o original (D-221, D-304).

import * as THREE from 'three';
import type { Luta } from '../simulacao/luta';
import type { V3 } from '../simulacao/regras';
import { COR_GRUPO, GRUPOS, PALAVRAS_CODIGO, TATICAS_PRONTAS, Tecnico, type Grupo, type Tatica } from '../simulacao/taticas';
import { LINGUA } from '../textos';
import type { Quadro } from './quadro_tecnico';
import './tecnico.css';

const TXT = LINGUA === 'en'
  ? { titulo: 'Coach', semTatica: 'no tactic (basic AI)', tatica: 'Tactic', auto: 'Original on auto', sim: 'on', nao: 'off', novos: 'New clones go to', sinais: 'Signals', dica: 'Tab board · 1–4 tactic · 0 none · G group' }
  : { titulo: 'Técnico', semTatica: 'sem tática (IA mínima)', tatica: 'Tática', auto: 'Original no automático', sim: 'ligado', nao: 'desligado', novos: 'Clones novos vão para', sinais: 'Sinais', dica: 'Tab Quadro · 1–4 tática · 0 nenhuma · G grupo' };
/** Teclas padrão dos sinais (trocáveis nas Opções, na etapa de interface) e a palavra de cada uma. */
export const TECLAS_SINAIS = ['u', 'i', 'o', 'p'];
export const PALAVRA_DO_SINAL = [0, 1, 2, 3]; // índices em PALAVRAS_CODIGO

export interface TecnicoPC {
  tecnico: Tecnico; slots: (Tatica | null)[]; ativa: number; automatico: boolean;
  /** Quadro do técnico aberto? */
  aberto(): boolean;
  /** Câmera de técnico (chamada pela tela do PC depois de pôr a câmera normal atrás do original). */
  camera(cam: THREE.PerspectiveCamera, original: V3, alvo: V3, dt: number): void;
  camTecnico: { ligada: boolean; mistura: number };
  quadro: Quadro | null;
  parar(): void;
}

export function ligarTecnico(luta: Luta, raiz: HTMLElement, cena: THREE.Scene): TecnicoPC {
  const tecnico = new Tecnico();
  luta.definirCerebro(tecnico.cerebro);
  tecnico.automatico = !!luta.opcoes.originalAutomatico;
  const slots: (Tatica | null)[] = TATICAS_PRONTAS.slice(0, 4).map((t) => JSON.parse(JSON.stringify(t)) as Tatica);
  let aberto = false, mistura = 0;
  const estado: TecnicoPC = { tecnico, slots, ativa: 0, automatico: !!luta.opcoes.originalAutomatico, aberto: () => aberto, camera, camTecnico: { ligada: true, mistura: 0 }, quadro: null, parar };
  const nome = (t: Tatica) => (LINGUA === 'en' ? t.nome.en : t.nome.pt);
  const palavra = (i: number) => { const p = PALAVRAS_CODIGO[PALAVRA_DO_SINAL[i]]; return LINGUA === 'en' ? p.en : p.pt; };
  const jogo = (raiz.querySelector('.jogo') ?? raiz) as HTMLElement;

  // ---------- painel pequeno (aparece com o Quadro fechado) ----------
  const painel = document.createElement('aside');
  painel.className = 'tecnico'; painel.setAttribute('aria-live', 'polite');
  jogo.appendChild(painel);
  let grito = { texto: '', ate: 0 }, ultimoHtml = '';
  function desenharPainel(): void {
    const topo = raiz.querySelector('.placa.topo')?.getBoundingClientRect(), base = raiz.getBoundingClientRect();
    if (topo) painel.style.top = `${Math.round(topo.bottom - base.top + 8)}px`;
    const t = estado.ativa ? slots[estado.ativa - 1] : null, cont = tecnico.contarGrupos();
    const html = `<strong>${TXT.titulo}</strong>
      <div>${TXT.tatica}: <b>${t ? `${estado.ativa} · ${nome(t)}` : TXT.semTatica}</b></div>
      <div>${TXT.auto}: <b class="${estado.automatico ? 'liga' : ''}">${estado.automatico ? TXT.sim : TXT.nao}</b></div>
      <div>${TXT.novos}: <b style="color:${COR_GRUPO[tecnico.grupoDosNovos]}">${tecnico.grupoDosNovos}</b> <kbd>G</kbd>
        <span class="grupos">${GRUPOS.map((g) => `<i style="background:${COR_GRUPO[g]}" title="${g}">${cont[g]}</i>`).join('')}</span></div>
      <div class="sinais">${TXT.sinais}: ${TECLAS_SINAIS.map((k, i) => `<span><kbd>${k.toUpperCase()}</kbd> ${palavra(i)}</span>`).join('')}</div>
      ${performance.now() / 1000 < grito.ate ? `<div class="grito">📣 ${grito.texto}!</div>` : ''}
      <small>${TXT.dica}</small>`;
    if (html !== ultimoHtml) { painel.innerHTML = html; ultimoHtml = html; }
  }
  tecnico.aoSinal = (i) => { grito = { texto: palavra(i), ate: performance.now() / 1000 + 2 }; desenharPainel(); };

  // ---------- Quadro (Blockly só é carregado no PC, na primeira vez que precisa) ----------
  let carregandoQuadro: Promise<Quadro> | null = null;
  function pegarQuadro(): Promise<Quadro> {
    carregandoQuadro ??= import('./quadro_tecnico').then(({ criarQuadro }) => {
      const q = criarQuadro({ raiz, luta, tecnico, slots, ativa: () => estado.ativa, camera: estado.camTecnico,
        aplicar: (i, t) => { slots[i - 1] = t; trocar(i); } });
      estado.quadro = q; return q;
    });
    return carregandoQuadro;
  }
  setTimeout(() => { void pegarQuadro(); }, 300); // já deixa pronto, para o primeiro Tab ser rápido
  function abrirQuadro(abrir: boolean): void {
    aberto = abrir;
    estado.automatico = abrir; luta.opcoes.originalAutomatico = abrir; tecnico.automatico = abrir;
    jogo.classList.toggle('com-quadro', abrir);
    if (abrir) document.exitPointerLock?.();
    painel.hidden = abrir;
    void pegarQuadro().then((q) => { q.mostrar(aberto); });
    dispatchEvent(new Event('resize'));
    desenharPainel();
  }

  // ---------- teclas ----------
  function trocar(n: number): void {
    estado.ativa = n >= 1 && n <= slots.length && slots[n - 1] ? n : 0;
    tecnico.trocar(estado.ativa ? slots[estado.ativa - 1] : null);
    if (estado.ativa) estado.quadro?.verAba(estado.ativa);
    estado.quadro?.atualizar();
    desenharPainel();
  }
  const digitando = (e: Event) => !!(e.target as HTMLElement | null)?.closest?.('input, select, textarea, .blocklyWidgetDiv, .blocklyDropDownDiv, [contenteditable="true"]');
  function aoTeclar(e: KeyboardEvent): void {
    const k = e.key.toLowerCase();
    if (k === 'tab') { e.preventDefault(); e.stopPropagation(); if (!e.repeat) abrirQuadro(!aberto); return; }
    if (digitando(e)) { if (aberto) e.stopPropagation(); return; } // digitando num bloco: nada do jogo
    if (!e.repeat) {
      if (k >= '0' && k <= '4' && k.length === 1) trocar(Number(k));
      else if (TECLAS_SINAIS.includes(k)) tecnico.sinal(TECLAS_SINAIS.indexOf(k));
      else if (k === 'g') { tecnico.grupoDosNovos = GRUPOS[(GRUPOS.indexOf(tecnico.grupoDosNovos) + 1) % GRUPOS.length]; desenharPainel(); }
      else if (k === 'enter' && aberto) { e.preventDefault(); estado.quadro?.aplicarAba(); }
    }
    if (aberto) e.stopPropagation(); // Quadro aberto: o original está no automático; as teclas do Piranbenja ficam paradas
  }
  document.addEventListener('keydown', aoTeclar); // no document: roda antes das teclas do Piranbenja (window)

  // ---------- câmera de técnico ----------
  const pos = new THREE.Vector3(), olho = new THREE.Vector3(), alto = new THREE.Vector3(), olhoAlto = new THREE.Vector3();
  function camera(cam: THREE.PerspectiveCamera, o: V3, alvo: V3, dt: number): void {
    const quer = aberto && estado.camTecnico.ligada ? 1 : 0;
    mistura += Math.sign(quer - mistura) * Math.min(Math.abs(quer - mistura), dt / 0.6);
    estado.camTecnico.mistura = mistura;
    if (mistura <= 0) return;
    // alto, atrás do original (do lado oposto ao centro do ringue), olhando para o centro: o ringue inteiro aparece
    const d = Math.hypot(o.x, o.z), ux = d > 0.5 ? o.x / d : 0, uz = d > 0.5 ? o.z / d : 1;
    alto.set(o.x + ux * 3, 9.5, o.z + uz * 3);
    olhoAlto.set(o.x * 0.35, 0, o.z * 0.35);
    const s = mistura * mistura * (3 - 2 * mistura); // começa e termina devagar
    pos.copy(cam.position).lerp(alto, s);
    olho.set(alvo.x, alvo.y, alvo.z).lerp(olhoAlto, s);
    cam.position.copy(pos); cam.lookAt(olho);
  }

  // ---------- anéis dos grupos no chão (só no PC) ----------
  const geo = new THREE.RingGeometry(0.36, 0.42, 12);
  const mats = Object.fromEntries(GRUPOS.map((g) => [g, new THREE.MeshBasicMaterial({ color: COR_GRUPO[g], side: THREE.DoubleSide, transparent: true, opacity: 0.85 })])) as Record<Grupo, THREE.MeshBasicMaterial>;
  const aneis: THREE.Mesh[] = [];
  let ate = 0, quadro = 0, ultimoAnel = 0;
  function atualizar(agora: number): void {
    quadro = requestAnimationFrame(atualizar);
    if (agora - ultimoAnel < 66) return; // anéis a ~15 por segundo: não pesa no quadro do jogo
    ultimoAnel = agora;
    const f = luta.foto();
    let i = 0;
    for (const p of f.piranbenjas) {
      const g = tecnico.grupoDe(p.numero); if (!g) continue;
      let a = aneis[i]; if (!a) { a = new THREE.Mesh(geo, mats.alpha); a.rotation.x = -Math.PI / 2; a.renderOrder = 9; cena.add(a); aneis.push(a); }
      a.material = mats[g]; a.position.set(p.pos.x, 0.02, p.pos.z); a.visible = true; i++;
    }
    for (; i < aneis.length; i++) aneis[i].visible = false;
    if (!aberto && agora / 1000 > ate) { ate = agora / 1000 + 0.5; desenharPainel(); }
  }
  quadro = requestAnimationFrame(atualizar);
  desenharPainel();

  function parar(): void { document.removeEventListener('keydown', aoTeclar); cancelAnimationFrame(quadro); luta.definirCerebro(null); painel.remove(); estado.quadro?.el.remove(); for (const a of aneis) cena.remove(a); }
  (window as unknown as { __tecnico: TecnicoPC }).__tecnico = estado;
  return estado;
}
