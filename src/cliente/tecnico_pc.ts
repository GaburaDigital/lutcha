// Técnico no PC (conversa "Programação por blocos e IA dos clones"): liga as táticas à luta, sem mexer na física.
// Teclas (C11, C26): 1 a 4 trocam a tática (0 = sem tática) · U I O P = sinais · Tab = original no automático
// · G = grupo de quem nascer agora (alpha, beta, gamma, sigma). Tecla 5 = 5ª tática pronta, só até o Quadro existir.
// O Quadro do técnico (Blockly) vem na rodada 2; por enquanto, um painel pequeno mostra o que está valendo.
// Tudo aqui fica no PC: o Quest nunca recebe a tática, os grupos nem quem é o original (D-221, D-304).

import * as THREE from 'three';
import type { Luta } from '../simulacao/luta';
import { COR_GRUPO, GRUPOS, PALAVRAS_CODIGO, TATICAS_PRONTAS, Tecnico, type Grupo, type Tatica } from '../simulacao/taticas';
import { LINGUA } from '../textos';
import './tecnico.css';

const TXT = LINGUA === 'en'
  ? { titulo: 'Coach', semTatica: 'no tactic (basic AI)', tatica: 'Tactic', auto: 'Original on auto', sim: 'on', nao: 'off', novos: 'New clones go to', sinais: 'Signals', dica: '1–5 tactic · 0 none · Tab auto · G group' }
  : { titulo: 'Técnico', semTatica: 'sem tática (IA mínima)', tatica: 'Tática', auto: 'Original no automático', sim: 'ligado', nao: 'desligado', novos: 'Clones novos vão para', sinais: 'Sinais', dica: '1–5 tática · 0 nenhuma · Tab automático · G grupo' };
/** Teclas padrão dos sinais (trocáveis nas Opções, na etapa de interface) e a palavra de cada uma. */
export const TECLAS_SINAIS = ['u', 'i', 'o', 'p'];
export const PALAVRA_DO_SINAL = [0, 1, 2, 3]; // índices em PALAVRAS_CODIGO

export interface TecnicoPC { tecnico: Tecnico; slots: (Tatica | null)[]; ativa: number; automatico: boolean; parar(): void }

export function ligarTecnico(luta: Luta, raiz: HTMLElement, cena: THREE.Scene): TecnicoPC {
  const tecnico = new Tecnico();
  luta.definirCerebro(tecnico.cerebro);
  const slots: (Tatica | null)[] = TATICAS_PRONTAS.slice(0, 5);
  const estado: TecnicoPC = { tecnico, slots, ativa: 0, automatico: !!luta.opcoes.originalAutomatico, parar };
  const nome = (t: Tatica) => (LINGUA === 'en' ? t.nome.en : t.nome.pt);
  const palavra = (i: number) => { const p = PALAVRAS_CODIGO[PALAVRA_DO_SINAL[i]]; return LINGUA === 'en' ? p.en : p.pt; };

  // ---------- painel ----------
  const painel = document.createElement('aside');
  painel.className = 'tecnico'; painel.setAttribute('aria-live', 'polite');
  (raiz.querySelector('.jogo') ?? raiz).appendChild(painel);
  let grito = { texto: '', ate: 0 }, ultimoHtml = '';
  function desenharPainel(): void {
    // fica logo abaixo da placa do topo (que muda de altura com a largura da tela)
    const topo = raiz.querySelector('.placa.topo')?.getBoundingClientRect(), base = raiz.getBoundingClientRect();
    if (topo) painel.style.top = `${Math.round(topo.bottom - base.top + 8)}px`;
    const t = estado.ativa ? slots[estado.ativa - 1] : null, cont = tecnico.contarGrupos();
    const html = `<strong>${TXT.titulo}</strong>
      <div>${TXT.tatica}: <b>${t ? `${estado.ativa} · ${nome(t)}` : TXT.semTatica}</b></div>
      <div>${TXT.auto}: <b class="${estado.automatico ? 'liga' : ''}">${estado.automatico ? TXT.sim : TXT.nao}</b> <kbd>Tab</kbd></div>
      <div>${TXT.novos}: <b style="color:${COR_GRUPO[tecnico.grupoDosNovos]}">${tecnico.grupoDosNovos}</b> <kbd>G</kbd>
        <span class="grupos">${GRUPOS.map((g) => `<i style="background:${COR_GRUPO[g]}" title="${g}">${cont[g]}</i>`).join('')}</span></div>
      <div class="sinais">${TXT.sinais}: ${TECLAS_SINAIS.map((k, i) => `<span><kbd>${k.toUpperCase()}</kbd> ${palavra(i)}</span>`).join('')}</div>
      ${performance.now() / 1000 < grito.ate ? `<div class="grito">📣 ${grito.texto}!</div>` : ''}
      <small>${TXT.dica}</small>`;
    if (html !== ultimoHtml) { painel.innerHTML = html; ultimoHtml = html; } // só mexe na página quando muda
  }
  tecnico.aoSinal = (i) => { grito = { texto: palavra(i), ate: performance.now() / 1000 + 2 }; desenharPainel(); };

  // ---------- teclas ----------
  function trocar(n: number): void {
    estado.ativa = n >= 1 && n <= slots.length && slots[n - 1] ? n : 0;
    tecnico.trocar(estado.ativa ? slots[estado.ativa - 1] : null);
    desenharPainel();
  }
  function aoTeclar(e: KeyboardEvent): void {
    if (e.repeat || (e.target as HTMLElement | null)?.closest?.('input, select, textarea')) return;
    const k = e.key.toLowerCase();
    if (k >= '0' && k <= '5' && k.length === 1) { trocar(Number(k)); return; }
    const s = TECLAS_SINAIS.indexOf(k); if (s >= 0) { tecnico.sinal(s); return; }
    if (k === 'tab') { e.preventDefault(); estado.automatico = !estado.automatico; luta.opcoes.originalAutomatico = estado.automatico; desenharPainel(); return; }
    if (k === 'g') { tecnico.grupoDosNovos = GRUPOS[(GRUPOS.indexOf(tecnico.grupoDosNovos) + 1) % GRUPOS.length]; desenharPainel(); }
  }
  addEventListener('keydown', aoTeclar);

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
    if (agora / 1000 > ate) { ate = agora / 1000 + 0.5; desenharPainel(); } // contagem dos grupos e fim do grito
  }
  quadro = requestAnimationFrame(atualizar);
  desenharPainel();

  function parar(): void { removeEventListener('keydown', aoTeclar); cancelAnimationFrame(quadro); luta.definirCerebro(null); painel.remove(); for (const a of aneis) cena.remove(a); }
  (window as unknown as { __tecnico: TecnicoPC }).__tecnico = estado;
  return estado;
}
