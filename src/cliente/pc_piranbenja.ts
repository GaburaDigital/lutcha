// Tela do PC: o jogador do Piranbenja, em terceira pessoa.
// - rede: é o anfitrião; roda a luta e manda as fotos ao Quest (enquanto o Quest não entra, luta contra um urso de treino);
// - solo: teste do Piranbenja sem internet, contra o urso do jogo (parado, bobo ou ofensivo).
//
// Controles do teste (C16, estilo Roblox): W A S D anda · mouse gira a câmera (mouse preso, como o "Shift Lock");
// clique esquerdo = tapa (dano) · clique direito = soco (impacto) · segurar Q = clones simples · segurar E = clones
// complexos (quanto mais tempo, mais clones; a barra mostra quantos) · Esc = pausa (solo) · Alt = soltar o mouse.
// Atalhos antigos continuam: J tapa, K soco, C dois clones. A faixa de teclas embaixo é só do teste.
// C20–C23: a roda do mouse troca o ataque do clique direito (soco, cabeçada, chute); segurar F abre a roda das
// formações (mouse escolhe, soltar F manda montar); Espaço escala a torre/pirâmide, sobe na catapulta ou desce
// (o aviso aparece só quando dá); na catapulta, a câmera mira (arco pontilhado) e o clique lança.

import * as THREE from 'three';
import { CUSTO_SIMPLES, Luta, prepararFisica, type Comportamento, type Evento } from '../simulacao/luta';
import { zonaDoSegmento } from '../simulacao/corpoUrso';
import type { JeitoUrso } from '../simulacao/ursoBot';
import { codificarFoto, decodificarEntrada } from '../rede/protocolo';
import { abrirCanal, type Canal } from '../rede/canal';
import { AGUA, CATAPULTA, TIPOS_FORMACAO, codigoDeSala, saidaCatapulta, type AtaqueImpacto, type TipoFormacao } from '../simulacao/regras';
import { Formacoes, Onomatopeias, Piranbenjas, UrsoDeFora, criarCena, criarRingue } from './visual';
import { T } from '../textos';
import { PALAVRA_DO_SINAL, ligarTecnico } from './tecnico_pc'; // táticas do técnico (conversa "Programação por blocos")

export interface ConfigPcSolo { urso: JeitoUrso; clones: Comportamento; iniciais: number; ajudas: boolean }
const JEITOS: JeitoUrso[] = ['parado', 'bobo', 'ofensivo'];
const CLONES: Comportamento[] = ['seguir', 'cautelosos', 'parados'];
const CHAVE = 'lutcha.pcSolo';

function lerConfig(): ConfigPcSolo {
  const c: ConfigPcSolo = { urso: 'bobo', clones: 'seguir', iniciais: 3, ajudas: true };
  try { Object.assign(c, JSON.parse(localStorage.getItem(CHAVE) ?? '{}')); } catch { /* sem armazenamento */ }
  const q = new URLSearchParams(location.search);
  const u = q.get('urso') as JeitoUrso | null, cl = q.get('clones') as Comportamento | null, n = Number(q.get('iniciais'));
  if (u && JEITOS.includes(u)) c.urso = u;
  if (cl && CLONES.includes(cl)) c.clones = cl;
  if (q.has('iniciais') && n >= 0 && n <= 8) c.iniciais = Math.round(n);
  if (!JEITOS.includes(c.urso)) c.urso = 'bobo';
  if (!CLONES.includes(c.clones)) c.clones = 'seguir';
  c.iniciais = Math.min(8, Math.max(0, Math.round(Number(c.iniciais) || 0)));
  c.ajudas = c.ajudas !== false;
  return c;
}
function guardar(c: ConfigPcSolo): void { try { localStorage.setItem(CHAVE, JSON.stringify(c)); } catch { /* sem armazenamento */ } }

export async function iniciarPC(raiz: HTMLElement, tipoCanal: 'trystero' | 'local', codigoFixo?: string, solo = false): Promise<void> {
  await prepararFisica();
  const config = lerConfig();
  const luta = solo
    ? new Luta({ ursoBot: config.urso, clonesIniciais: config.iniciais, comportamento: config.clones })
    : new Luta({ ursoDeTreino: true, clonesIniciais: 4, comportamento: 'seguir' });
  const codigo = codigoFixo ?? codigoDeSala();
  const ops = (lista: string[], nomes: Record<string, string>, atual: string) => lista.map((v) => `<option value="${v}"${v === atual ? ' selected' : ''}>${nomes[v]}</option>`).join('');
  const tecla = (id: string, k: string, nome: string) => `<div class="tecla" id="tk-${id}"><kbd>${k}</kbd><span>${nome}</span></div>`;
  raiz.innerHTML = `
    <div class="jogo"><div class="tela" id="tela"></div>
      <div class="placa topo">
        ${solo ? `<span class="rotulo">${T.pc.titulo}</span>` : `<span class="rotulo">Sala</span><strong class="codigo" id="codigo">${codigo}</strong>`}
        <span id="conexao">${solo ? '' : 'Esperando o UrsoBura… (por enquanto, um urso de treino)'}</span>
        <div class="hud">
          <span>${T.pc.agua}</span><span class="barra"><i id="barAgua"></i></span>
          <span>${T.pc.vivos} <b id="nClones">0</b></span>
          <span>${T.pc.resUrso}</span><span class="barra urso"><i id="barUrso"></i></span>
          <span>${T.urso.equilibrio}</span><span class="barra equilibrio"><i id="barEquilibrio"></i></span>
          <span>${T.pc.placar} <b id="placar">0 × 0</b></span>
        </div>
      </div>
      <div class="aviso-espaco" id="avisoEspaco" hidden></div>
      <div class="roda-formacoes" id="roda" hidden>
        <strong>${T.roda.titulo}</strong><small id="rodaPerto"></small>
        ${TIPOS_FORMACAO.map((t, i) => { const a = (i / TIPOS_FORMACAO.length) * Math.PI * 2 - Math.PI / 2; return `<div class="fatia" id="fatia-${t}" style="left:${(50 + Math.cos(a) * 36).toFixed(1)}%;top:${(50 + Math.sin(a) * 36).toFixed(1)}%"><b>${T.gritos[t].replace('!', '')}</b><span></span></div>`; }).join('')}
        <em>${T.roda.solte}</em>
      </div>
      <div class="carga" id="carga" hidden><b id="cargaN">1</b> <span id="cargaTipo"></span><span class="barra"><i id="cargaBar"></i></span><small>${T.pc.segure}</small></div>
      <div class="teclas">
        ${tecla('wasd', 'W A S D', T.teclas.andar)}${tecla('mouse', '🖱', T.teclas.camera)}
        ${tecla('tapa', '🖱 esq', T.teclas.tapa)}<div class="tecla" id="tk-soco"><kbd>🖱 dir</kbd><span><b id="nomeImpacto">${T.impacto.soco}</b> <small>${T.teclas.roda}</small></span></div>
        ${tecla('q', 'Q', T.teclas.simples)}${tecla('e', 'E', T.teclas.complexos)}
        ${tecla('f', 'F', T.teclas.formacoes)}${tecla('espaco', 'Espaço', T.teclas.espaco)}
        ${solo ? tecla('esc', 'Esc', T.teclas.pausa) : ''}${tecla('alt', 'Alt', T.teclas.mouse)}
      </div>
      <ol class="log" id="log" aria-live="polite"></ol>
      <button type="button" class="clique" id="clique">${T.pc.clique}</button>
      ${solo ? `<form class="pausa" id="pausa" hidden aria-label="${T.pc.pausa}">
        <h2>${T.pc.pausa}</h2>
        <label>${T.pc.urso} <select id="cfgUrso">${ops(JEITOS, T.jeitosUrso, config.urso)}</select></label>
        <label>${T.pc.clones} <select id="cfgClones">${ops(CLONES, T.comportamentos, config.clones)}</select></label>
        <label>${T.pc.iniciais} <input id="cfgIniciais" type="number" min="0" max="8" value="${config.iniciais}"></label>
        <label><input id="cfgAjudas" type="checkbox"${config.ajudas ? ' checked' : ''}> ${T.pc.ajudas}</label>
        <div class="acoes"><button type="button" class="botao" id="recomecar">${T.pc.recomecar}</button><button type="button" class="botao principal" id="continuar">${T.pc.continuar}</button></div>
      </form>` : ''}
    </div>`;
  const $ = <E extends HTMLElement>(s: string) => raiz.querySelector(s) as E;
  const tela = $<HTMLDivElement>('#tela');
  const render = new THREE.WebGLRenderer({ antialias: true });
  render.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  tela.appendChild(render.domElement);
  const { cena } = criarCena();
  criarRingue(cena, luta.blocos);
  const camera = new THREE.PerspectiveCamera(65, 1, 0.05, 200);
  const pbs = new Piranbenjas(cena), urso = new UrsoDeFora(cena), onos = new Onomatopeias(cena), formacoes = new Formacoes(cena);
  // arco pontilhado da catapulta (só aparece com o original em cima dela)
  const arco = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(40 * 3), 3)),
    new THREE.PointsMaterial({ color: '#ffe066', size: 0.09, transparent: true, opacity: 0.9, depthTest: false }));
  arco.renderOrder = 11; arco.visible = false; arco.frustumCulled = false; cena.add(arco);
  // só nesta tela: um anel aqua no chão marca o original (o jogador sabe quem ele é; o Quest nunca sabe)
  const marca = new THREE.Mesh(new THREE.RingGeometry(0.26, 0.34, 12), new THREE.MeshBasicMaterial({ color: '#4fd6d0', side: THREE.DoubleSide }));
  marca.rotation.x = -Math.PI / 2; cena.add(marca);
  const tecnicoPC = ligarTecnico(luta, raiz, cena); // Tab Quadro do técnico, 1–4 táticas, U I O P sinais, G grupo
  // grito do sinal (D-330): além do painel do PC, vira evento "fala" da luta (só o número da palavra vai para o Quest)
  { const antes = tecnicoPC.tecnico.aoSinal; tecnicoPC.tecnico.aoSinal = (i) => { antes?.(i); luta.falar(PALAVRA_DO_SINAL[i] ?? i); }; }

  // ---------- rede (só no modo de rede) ----------
  let canal: Canal | null = null;
  if (!solo) {
    canal = abrirCanal(tipoCanal, 'anfitriao', codigo);
    const conexao = $<HTMLSpanElement>('#conexao');
    canal.aoConectar = () => {
      luta.opcoes.ursoDeTreino = false;
      conexao.textContent = 'UrsoBura conectado';
      void canal!.tipoConexao().then((t) => { conexao.textContent = `UrsoBura conectado · ${t === 'local' ? 'conexão local' : t === 'internet' ? 'pela internet' : 'conexão aberta'}`; });
    };
    canal.aoSair = () => { conexao.textContent = 'O UrsoBura saiu. Esperando reconectar (até 30 s)…'; };
    canal.aoRapido = (d) => { const e = decodificarEntrada(d); if (e) luta.definirUrso(e); };
  }

  // ---------- controles ----------
  const teclas = new Set<string>();
  let yaw = Math.PI, pitch = -0.25; // começa de frente para o urso
  let pausado = false, soltouComAlt = false;
  const carga = { tecla: '' as '' | 'q' | 'e', desde: 0 };
  // ataque de impacto do clique direito (a roda do mouse troca)
  const IMPACTOS: AtaqueImpacto[] = ['soco', 'cabecada', 'chute'];
  let impacto: AtaqueImpacto = 'soco';
  // roda das formações (segurar F)
  const roda = { aberta: false, x: 0, y: 0, escolha: null as TipoFormacao | null };
  const acender = (id: string, sim: boolean) => raiz.querySelector('#tk-' + id)?.classList.toggle('ativa', sim);
  const travado = () => document.pointerLockElement === render.domElement;
  const prender = () => { try { void render.domElement.requestPointerLock(); } catch { /* sem mouse preso */ } };
  const quantosNaCarga = () => {
    const simples = carga.tecla === 'q', custo = simples ? CUSTO_SIMPLES : AGUA.custoClone;
    return Math.max(0, Math.min(8, 1 + Math.floor((performance.now() / 1000 - carga.desde) / 0.35), Math.floor(luta.aguaAtual / custo)));
  };
  addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase(); teclas.add(k);
    if (k === 'alt') { e.preventDefault(); soltouComAlt = true; document.exitPointerLock?.(); acender('alt', true); }
    if (pausado || e.repeat) return;
    if ('wasd'.includes(k) && k.length === 1) acender('wasd', true);
    if (k === 'j') { luta.controle.atacar = 'tapa'; acender('tapa', true); }
    if (k === 'k') { luta.controle.atacar = 'soco'; acender('soco', true); }
    if (k === 'c') luta.controle.criarClones = true;
    if (k === 'f' && !roda.aberta) { roda.aberta = true; roda.x = 0; roda.y = 0; roda.escolha = null; acender('f', true); }
    if (k === ' ') { e.preventDefault(); luta.controle.espaco = true; acender('espaco', true); }
    if ((k === 'q' || k === 'e') && !carga.tecla) { carga.tecla = k; carga.desde = performance.now() / 1000; acender(k, true); }
  });
  addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase(); teclas.delete(k);
    if (k === 'alt') acender('alt', false);
    if (!['w', 'a', 's', 'd'].some((x) => teclas.has(x))) acender('wasd', false);
    if (k === 'j') acender('tapa', false);
    if (k === ' ') acender('espaco', false);
    if (k === 'f' && roda.aberta) {
      roda.aberta = false; acender('f', false);
      if (roda.escolha) { const pos = luta.formacoesPossiveis()[roda.escolha]; if (pos.tem >= pos.precisa) luta.controle.formar = roda.escolha; }
    }
    if (k === 'k') acender('soco', false);
    if (k === carga.tecla) {
      const n = quantosNaCarga();
      if (n > 0) luta.controle.pedirClones = { quantos: n, simples: carga.tecla === 'q' };
      acender(carga.tecla, false); carga.tecla = '';
    }
  });
  addEventListener('blur', () => { teclas.clear(); carga.tecla = ''; roda.aberta = false; });
  addEventListener('wheel', (e) => {
    if (pausado) return;
    const i = (IMPACTOS.indexOf(impacto) + (e.deltaY > 0 ? 1 : -1) + IMPACTOS.length) % IMPACTOS.length;
    impacto = IMPACTOS[i]; $<HTMLElement>('#nomeImpacto').textContent = T.impacto[impacto];
  }, { passive: true });
  render.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
  render.domElement.addEventListener('mousedown', (e) => {
    if (tecnicoPC.aberto()) return; // Quadro do técnico aberto: o mouse é do Quadro
    if (!travado()) { if (!pausado) prender(); return; }
    if (e.button === 0) { luta.controle.atacar = 'tapa'; acender('tapa', true); }
    if (e.button === 2) { luta.controle.atacar = impacto; acender('soco', true); }
  });
  addEventListener('mouseup', (e) => { if (e.button === 0) acender('tapa', false); if (e.button === 2) acender('soco', false); });
  addEventListener('mousemove', (e) => {
    if (!travado()) return;
    // com a roda aberta, o mouse escolhe a formação (a câmera fica parada)
    if (roda.aberta) { roda.x += e.movementX; roda.y += e.movementY; return; }
    yaw -= e.movementX * 0.0025; pitch = THREE.MathUtils.clamp(pitch - e.movementY * 0.0025, -1.1, 0.4);
    acender('mouse', true); clearTimeout(apagaMouse); apagaMouse = setTimeout(() => acender('mouse', false), 200);
  });
  let apagaMouse = 0 as unknown as ReturnType<typeof setTimeout>;
  const clique = $<HTMLButtonElement>('#clique');
  clique.addEventListener('click', () => prender());
  document.addEventListener('pointerlockchange', () => {
    clique.hidden = travado() || pausado;
    // Esc solta o mouse pelo navegador: no solo, isso abre a pausa (Alt só solta o mouse)
    if (!travado() && solo && !soltouComAlt && !tecnicoPC.aberto()) abrirPausa(); // abrir o Quadro solta o mouse sem pausar
    soltouComAlt = false;
  });

  // ---------- pausa com opções (só no solo) ----------
  const pausa = solo ? $<HTMLFormElement>('#pausa') : null;
  function abrirPausa(): void { if (!pausa) return; pausado = true; pausa.hidden = false; clique.hidden = true; }
  function fecharPausa(): void { if (!pausa) return; pausado = false; pausa.hidden = true; prender(); clique.hidden = travado(); }
  if (pausa) {
    const ler = () => {
      config.urso = ($<HTMLSelectElement>('#cfgUrso')).value as JeitoUrso;
      config.clones = ($<HTMLSelectElement>('#cfgClones')).value as Comportamento;
      config.iniciais = Math.min(8, Math.max(0, Math.round(Number(($<HTMLInputElement>('#cfgIniciais')).value) || 0)));
      config.ajudas = ($<HTMLInputElement>('#cfgAjudas')).checked;
      guardar(config);
    };
    pausa.addEventListener('submit', (e) => e.preventDefault());
    pausa.addEventListener('change', ler);
    $<HTMLButtonElement>('#continuar').addEventListener('click', () => { ler(); luta.trocarBot(config.urso); luta.opcoes.comportamento = config.clones; fecharPausa(); });
    $<HTMLButtonElement>('#recomecar').addEventListener('click', () => {
      ler(); luta.trocarBot(config.urso); luta.opcoes.comportamento = config.clones; luta.opcoes.clonesIniciais = config.iniciais; luta.reiniciar(); fecharPausa();
    });
  }

  // ---------- o que aparece quando alguém acerta ----------
  const log = $<HTMLOListElement>('#log');
  const escrever = (t: string) => { const li = document.createElement('li'); li.textContent = t; log.prepend(li); while (log.children.length > 5) log.lastChild?.remove(); };
  const ZONAS = { cabeca: 'na cabeça', tronco: 'no tronco', bracos: 'no braço', pernas: 'nas pernas' } as const;
  const NOMES = { soco: 'soco', socoLateral: 'soco lateral', gancho: 'gancho', martelada: 'martelada', arranhao: 'arranhão', estocada: 'estocada' } as const;
  const QUAL = { cheio: 'em cheio', normal: 'normal', raspao: 'de raspão' } as const;
  const COR = { dano: '#ff8a1f', impacto: '#2fe0ff' } as const;
  let ultimaPalavra = 0;
  function reagir(ev: Evento): void {
    const f = luta.foto();
    const onde = (n: number) => f.piranbenjas.find((p) => p.numero === n)?.pos;
    if (ev.tipo === 'golpe') {
      const p = onde(ev.numero);
      if (config.ajudas) pbs.piscar(ev.numero, ev.zona, COR[ev.golpe], ev.qualidade === 'cheio' ? 1 : ev.qualidade === 'raspao' ? 0.35 : 0.7);
      if (p && !ev.vizinho) onos.mostrar(T.golpe[ev.nome], { ...p, y: p.y + 0.95 }, ev.qualidade === 'cheio' ? '#ffe066' : '#e8f3f2', 0.4);
      escrever(`Pata ${ev.mao === 'esq' ? 'esquerda' : 'direita'}: ${NOMES[ev.nome]} (${ev.golpe}) ${QUAL[ev.qualidade]} ${ZONAS[ev.zona]}${ev.vizinho ? ', de tabela' : ''} (lançamento ${ev.lancamento.toFixed(1)})`);
    }
    if (ev.tipo === 'ursoGolpeado') {
      // onde o Piranbenja pegou no urso: a parte brilha e o nome aparece
      const pt = ev.ponto ?? { ...luta.entradaUrso.cabeca, y: 1.2 };
      if (ev.parte && config.ajudas) urso.piscar(ev.parte, COR[ev.golpe]);
      // vários acertos juntos não empilham palavras: no máximo uma onomatopeia a cada 0,3 s
      const agora = performance.now() / 1000;
      if (agora - ultimaPalavra > 0.3) {
        ultimaPalavra = agora;
        onos.mostrar(ev.ataque ? T.ataquePB[ev.ataque] : ev.combo > 1 ? 'KA-POW!' : 'BAM!', { ...pt, y: pt.y + 0.35 }, ev.golpe === 'dano' ? '#ffb15c' : '#4fd6d0', 0.45);
        if (ev.parte && config.ajudas) onos.mostrar(T.partesUrso[zonaDoSegmento(ev.parte)], { ...pt, y: pt.y + 0.08 }, COR[ev.golpe], 0.2, 0.8);
      }
      escrever(`Urso levou ${ev.ataque ?? ev.golpe}${ev.parte ? ': ' + T.partesUrso[zonaDoSegmento(ev.parte)] : ''}${ev.combo > 1 ? ' (combinado ×' + ev.combo + ')' : ''}`);
    }
    if (ev.tipo === 'grudou') { const p = onde(ev.numero); if (p && performance.now() / 1000 - ultimaPalavra > 0.3) onos.mostrar(T.grudou, { ...p, y: p.y + 0.6 }, '#ffb15c', 0.35); escrever(`Clone grudou: ${T.partesUrso[zonaDoSegmento(ev.parte)]}`); }
    if (ev.tipo === 'soltouGrudado') { const p = onde(ev.numero); if (p) onos.mostrar(T.soltou, { ...p, y: p.y + 0.6 }, '#e8f3f2', 0.35); escrever(ev.como === 'sacudida' ? 'O urso sacudiu e soltou um clone' : 'O urso arrancou um clone com a pata'); }
    if (ev.tipo === 'ursoDecolou') { escrever('O urso decolou!'); const c = luta.entradaUrso.cabeca; onos.mostrar(T.decolou, { ...c, y: c.y + 0.7 }, '#ffe066', 0.9, 1.6); }
    if (ev.tipo === 'ursoCaiu') { escrever('O urso caiu sentado!'); const c = luta.entradaUrso.cabeca; onos.mostrar(T.urso.caiu, { ...c, y: c.y + 0.6 }, '#c58fff', 0.7, 1.4); }
    if (ev.tipo === 'ursoTonto') { const c = luta.entradaUrso.cabeca; onos.mostrar(T.urso.tonto, { ...c, y: c.y + 0.6 }, '#8fd0ff', 0.45, 1.0); }
    if (ev.tipo === 'rebatida') { const p = onde(ev.numero); escrever('O urso rebateu quem vinha da catapulta!'); if (p) onos.mostrar(T.urso.rebatida, { ...p, y: p.y + 0.8 }, '#ff7a6b', 0.6, 1.2); }
    if (ev.tipo === 'ursoGolpeado' && ev.bloqueio) { const pt = ev.ponto ?? luta.entradaUrso.cabeca; onos.mostrar(T.urso.bloqueio, { ...pt, y: pt.y + 0.6 }, '#e8f3f2', 0.4, 1.0); }
    if (ev.tipo === 'formacao') onos.mostrar(T.gritos[ev.nome], { ...ev.centro, y: 2.2 }, '#c58fff', 0.55, 1.4);
    if (ev.tipo === 'formacaoDesfeita') escrever(ev.strike ? 'Formação desmanchou: STRIKE!' : 'Formação desfeita');
    if (ev.tipo === 'catapulta') escrever(`Catapulta: lançou a ${Math.hypot(ev.vel.x, ev.vel.y, ev.vel.z).toFixed(1)} m/s`);
    if (ev.tipo === 'fala') escrever(`Sinal: palavra ${ev.palavra + 1}`);
    if (ev.tipo === 'correnteEnrolou') { escrever('A corrente enrolou na perna do urso'); const c = luta.entradaUrso.cabeca; onos.mostrar(T.urso.enrolou, { ...c, y: 1.0 }, '#c58fff', 0.45, 1.2); }
    if (ev.tipo === 'strike') { escrever('STRIKE!'); onos.mostrar(T.strike, { x: 0, y: 2.5, z: 0 }, '#ff7a6b', 1.0, 1.4); }
    if (ev.tipo === 'derreteu') escrever('Um clone derreteu');
    if (ev.tipo === 'clones') escrever(`${ev.quantos} clones novos`);
    if (ev.tipo === 'agarrou') escrever('O urso agarrou um Piranbenja');
    if (ev.tipo === 'arremessou') escrever(`Arremesso a ${ev.velocidade.toFixed(1)} m/s`);
    if (ev.tipo === 'fimRodada') { escrever(ev.vencedor === 'urso' ? 'O original caiu! Ponto do UrsoBura.' : 'O urso saiu do ringue! Ponto do Piranbenja.'); onos.mostrar(ev.vencedor === 'urso' ? 'URSO VENCE!' : 'PIRANBENJA VENCE!', { x: 0, y: 3, z: 0 }, '#8fd651', 1.1, 2.5); }
  }

  // ---------- quadro a quadro ----------
  const relogio = new THREE.Clock();
  let ateFoto = 0;
  const barAgua = $<HTMLElement>('#barAgua'), barUrso = $<HTMLElement>('#barUrso'), nClones = $<HTMLElement>('#nClones'), placar = $<HTMLElement>('#placar');
  const barEquilibrio = $<HTMLElement>('#barEquilibrio'), avisoEspaco = $<HTMLElement>('#avisoEspaco'), rodaEl = $<HTMLElement>('#roda'), rodaPerto = $<HTMLElement>('#rodaPerto');
  /** Distância da mira da catapulta pela inclinação da câmera: olhando para baixo, perto; para cima, longe. */
  const mira = () => CATAPULTA.minimo + ((pitch + 1.1) / 1.5) * (CATAPULTA.maximo - CATAPULTA.minimo);
  function desenharRoda(): void {
    rodaEl.hidden = !roda.aberta; if (!roda.aberta) return;
    const poss = luta.formacoesPossiveis(), tem = poss.muralha.tem;
    rodaPerto.textContent = `${tem} ${T.roda.perto}`;
    // a direção do mouse escolhe a fatia (precisa mexer um pouco)
    if (Math.hypot(roda.x, roda.y) > 30) {
      const a = Math.atan2(roda.y, roda.x) + Math.PI / 2, n = TIPOS_FORMACAO.length;
      roda.escolha = TIPOS_FORMACAO[((Math.round((a / (Math.PI * 2)) * n) % n) + n) % n];
    }
    for (const t of TIPOS_FORMACAO) {
      const el = $<HTMLElement>('#fatia-' + t), ok = poss[t].tem >= poss[t].precisa;
      el.classList.toggle('desligada', !ok); el.classList.toggle('escolhida', roda.escolha === t);
      el.querySelector('span')!.textContent = `${T.roda.precisa} ${t === 'fila' ? '3–5' : poss[t].precisa} ${T.roda.clones}`;
    }
  }
  const cargaEl = $<HTMLElement>('#carga'), cargaN = $<HTMLElement>('#cargaN'), cargaTipo = $<HTMLElement>('#cargaTipo'), cargaBar = $<HTMLElement>('#cargaBar');
  function quadro(): void {
    const dt = Math.min(0.05, relogio.getDelta());
    // WASD em relação à câmera: frente = (−sen, −cos) do giro; direita = (cos, −sen)
    const f = (teclas.has('w') ? 1 : 0) - (teclas.has('s') ? 1 : 0), l = (teclas.has('d') ? 1 : 0) - (teclas.has('a') ? 1 : 0);
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    luta.controle.mover = pausado ? { x: 0, z: 0 } : { x: fx * f + Math.cos(yaw) * l, z: fz * f - Math.sin(yaw) * l };
    luta.controle.olhar = yaw; luta.controle.mira = mira();
    if (!pausado) luta.avancar(dt);
    for (const ev of luta.tirarEventos()) { reagir(ev); canal?.enviarEvento(ev); }
    ateFoto -= dt;
    if (canal && ateFoto <= 0 && canal.conectado()) { ateFoto = 1 / 30; canal.enviarRapido(codificarFoto(luta.foto())); }
    const foto = luta.foto(), orig = luta.numeroDoOriginal();
    pbs.desenhar(foto.piranbenjas, { destaque: orig, marca, olharPara: luta.entradaUrso.cabeca, ajudas: config.ajudas, giroDe: (n) => (n === orig ? yaw : null) });
    urso.desenhar(luta.esqueletoUrso, luta.entradaUrso.giro ?? 0, performance.now() / 1000, luta.bonecoUrso()); // C32: decolagem forte = boneco solto
    urso.mostrarBarra(foto.urso.res, foto.urso.grudados, config.ajudas, foto.urso.equilibrio);
    formacoes.desenhar(foto.formacoes);
    // aviso do Espaço só quando dá para usar; na catapulta, o arco mostra para onde vai
    const acao = luta.acaoDeEspaco(), lanc = luta.pontoDaCatapultaDoOriginal();
    avisoEspaco.hidden = !acao;
    if (acao) avisoEspaco.textContent = lanc ? `${T.espaco.mirar} · ${T.espaco.descer}` : T.espaco[acao];
    arco.visible = !!lanc;
    if (lanc) {
      const v = saidaCatapulta(yaw, mira()), pos = arco.geometry.getAttribute('position') as THREE.BufferAttribute;
      const voo = (2 * v.y) / 9.81;
      for (let i = 0; i < 40; i++) { const t = (i / 39) * voo * 1.15; pos.setXYZ(i, lanc.x + v.x * t, lanc.y + v.y * t - 4.9 * t * t, lanc.z + v.z * t); }
      pos.needsUpdate = true;
    }
    desenharRoda();
    // câmera atrás do original
    const o = foto.piranbenjas.find((p) => p.numero === orig)?.pos ?? { x: 0, y: 0.45, z: -3 };
    const dist = 3.4;
    camera.position.set(o.x - fx * dist * Math.cos(pitch), Math.max(0.3, o.y + 1.2 - Math.sin(pitch) * dist), o.z - fz * dist * Math.cos(pitch));
    camera.lookAt(o.x + fx * 0.5, o.y + 0.9, o.z + fz * 0.5); // mira um pouco acima: o urso (2,7 m) cabe na tela
    tecnicoPC.camera(camera, o, { x: o.x + fx * 0.5, y: o.y + 0.9, z: o.z + fz * 0.5 }, dt); // câmera de técnico com o Quadro aberto (D-308)
    onos.atualizar(dt);
    barAgua.style.width = `${Math.round(luta.aguaAtual)}%`;
    barUrso.style.width = `${foto.urso.res}%`;
    barEquilibrio.style.width = `${foto.urso.equilibrio}%`;
    nClones.textContent = String(foto.piranbenjas.length - 1);
    placar.textContent = `${foto.placar.urso} × ${foto.placar.piranbenja}`;
    cargaEl.hidden = !carga.tecla;
    if (carga.tecla) {
      const n = quantosNaCarga(), custo = carga.tecla === 'q' ? CUSTO_SIMPLES : AGUA.custoClone;
      cargaN.textContent = String(n); cargaTipo.textContent = `${carga.tecla === 'q' ? T.teclas.simples : T.teclas.complexos} · ${T.pc.agua} −${n * custo}`;
      cargaBar.style.width = `${(n / 8) * 100}%`;
    }
    render.render(cena, camera);
  }
  function tamanho(): void { const r = tela.getBoundingClientRect(); render.setSize(r.width, r.height, false); camera.aspect = r.width / Math.max(1, r.height); camera.updateProjectionMatrix(); }
  new ResizeObserver(tamanho).observe(tela); tamanho();
  render.setAnimationLoop(quadro);
  (window as unknown as { __teste: unknown }).__teste = { luta, get canal() { return canal; }, codigo, THREE, config, get pausado() { return pausado; }, abrirPausa, fecharPausa, urso, pbs,
    get impacto() { return impacto; }, medirOnomatopeia: (t: string) => Onomatopeias.medida(t), get roda() { return roda; }, get avisoEspaco() { return avisoEspaco.hidden ? '' : avisoEspaco.textContent; }, get arcoVisivel() { return arco.visible; } };
}
