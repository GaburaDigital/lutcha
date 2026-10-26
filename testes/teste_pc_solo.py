"""Teste solo do Piranbenja no PC (sem internet), contra o urso do jogo:
tapa e soco do original acertando partes do urso, clones criados segurando Q, mordida que gruda no urso,
urso ofensivo batendo e agarrando, pausa com opções e fotos para conferir o visual."""
import sys, time
from base import *

falhas = []
def confere(nome, ok, info=''):
    print(('OK   ' if ok else 'FALHA') + ' ' + nome + (' · ' + str(info) if info != '' else ''))
    if not ok: falhas.append(nome)
def J(pg, js): return pg.evaluate('() => { const t = window.__teste; ' + js + ' }')
# o Chromium sem tela desenha poucos quadros: a luta é avançada direto em passos de 1/60 s
AVANCA = 'const ev = []; for (let i = 0; i < N; i++) { t.luta.avancar(1 / 60); ev.push(...t.luta.tirarEventos()); } return ev.map((e) => e.tipo + ":" + (e.ataque || e.parte || e.nome || ""));'
def avancar(pg, n): return J(pg, AVANCA.replace('N', str(n)))

with servidor(), sync_playwright() as p:
    b, pg, erros = abrir(p, 1100, 650)
    pg.goto(URL + '?modo=pcsolo&urso=parado&clones=parados&iniciais=2'); pg.wait_for_function('() => window.__teste && window.__teste.luta', timeout=60000)
    time.sleep(1.5)
    confere('PC solo abre sem rede', J(pg, 'return t.canal') is None and J(pg, 'return t.luta.foto().piranbenjas.length') == 3)
    confere('faixa de teclas com 8 teclas', pg.locator('.tecla').count() == 8, pg.locator('.tecla').count())
    # original perto da perna do urso, olhando para ele
    J(pg, 't.luta.testeColocar(t.luta.numeroDoOriginal(), { x: -0.3, y: 0.47, z: 2.6 })'); time.sleep(0.5)
    pg.keyboard.press('j')
    ev = avancar(pg, 50); time.sleep(0.3)
    log = pg.inner_text('#log')  # a tela também consome eventos a cada quadro: o registro mostra todos
    confere('tapa do original acerta o urso (sem morder)', (any(e.startswith('ursoGolpeado:tapa') for e in ev) or 'Urso levou tapa' in log) and 'morder' not in log, log.splitlines()[:3])
    time.sleep(0.25); pg.screenshot(path=F + 'pc_01_tapa_no_urso.png')
    # segurar Q cria clones simples (a barra mostra quantos)
    antes = J(pg, 'return t.luta.foto().piranbenjas.length')
    pg.keyboard.down('q'); time.sleep(1.2)
    barra = pg.locator('#carga').is_visible(); n_barra = int(pg.inner_text('#cargaN'))
    pg.screenshot(path=F + 'pc_02_segurando_q.png')
    pg.keyboard.up('q'); avancar(pg, 3); time.sleep(0.3)
    depois = J(pg, 'return t.luta.foto().piranbenjas.length')
    confere('segurar Q cria vários clones simples', barra and n_barra >= 3 and depois - antes >= n_barra, {'barra': n_barra, 'antes': antes, 'depois': depois})
    # clones ofensivos mordem e grudam no urso parado
    J(pg, "t.luta.opcoes.comportamento = 'ofensivos'")
    J(pg, 't.luta.testeNumeros().forEach((n, i, a) => { if (n === t.luta.numeroDoOriginal()) return; const ang = Math.PI + (i - a.length / 2) * 0.5; t.luta.testeColocar(n, { x: Math.sin(ang) * 1.3, y: 0.47, z: 3 + Math.cos(ang) * 1.3 }); })')
    grudou = False
    for _ in range(12):
        ev = avancar(pg, 120)
        if J(pg, 'return t.luta.foto().urso.grudados') > 0: grudou = True; break
    time.sleep(0.4); pg.screenshot(path=F + 'pc_03_clone_grudado.png')
    confere('clone morde e gruda no urso', grudou, J(pg, 'return t.luta.testeGrudados()'))
    # urso ofensivo: bate e agarra
    J(pg, "t.luta.trocarBot('ofensivo')")
    tipos = {}
    for _ in range(10):
        for e in avancar(pg, 120): tipos[e.split(':')[0]] = tipos.get(e.split(':')[0], 0) + 1
    time.sleep(0.4); pg.screenshot(path=F + 'pc_04_urso_ofensivo.png')
    confere('urso ofensivo bate e agarra', tipos.get('golpe', 0) >= 1 and (tipos.get('agarrou', 0) >= 1 or tipos.get('soltouGrudado', 0) >= 1), tipos)
    # pausa com opções
    J(pg, 't.abrirPausa()'); time.sleep(0.4)
    confere('pausa abre com as opções', J(pg, 'return t.pausado') is True and pg.locator('#pausa').is_visible())
    pg.screenshot(path=F + 'pc_05_pausa.png')
    pg.select_option('#cfgUrso', 'bobo'); pg.click('#recomecar'); time.sleep(0.5)
    confere('recomeçar com o urso bobo', J(pg, 'return t.luta.opcoes.ursoBot') == 'bobo' and J(pg, 'return t.pausado') is False)
    reais = [e for e in erros if 'GPU stall' not in e and 'WebGL' not in e and 'pointer' not in e.lower()]
    if reais: print('erros no console:', reais[:5]); falhas.append('console')
    b.close()
print('sem erros' if not falhas else 'FALHAS: ' + ', '.join(falhas))
sys.exit(1 if falhas else 0)
