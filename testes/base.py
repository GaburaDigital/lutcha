"""Funções comuns dos testes automáticos no computador (Playwright + Chrome sem janela).
Vem do testes/base.py da Nave: o próprio teste liga o servidor e SEMPRE o desliga no fim (nada fica rodando)."""
import time, os, signal, subprocess, atexit, urllib.request
from contextlib import contextmanager
from playwright.sync_api import sync_playwright  # noqa: F401 (usado pelos testes)
F = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fotos') + '/'
os.makedirs(F, exist_ok=True)
PORTA = 4181
URL = os.environ.get('URL_JOGO', f'http://localhost:{PORTA}/')
URL_PATAS = URL + 'patas.html'
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def _respondendo():
    try: urllib.request.urlopen(URL, timeout=1); return True
    except Exception: return False

@contextmanager
def servidor():
    """Liga o `vite preview` (o jogo já montado em dist/), espera responder e desliga no fim, mesmo se o teste falhar."""
    if _respondendo():
        yield; return
    proc = subprocess.Popen(['npx', 'vite', 'preview', '--port', str(PORTA), '--strictPort'], cwd=RAIZ,
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    def desligar():
        try: os.killpg(proc.pid, signal.SIGTERM); proc.wait(timeout=5)
        except Exception: pass
    atexit.register(desligar)
    try:
        for _ in range(80):
            if _respondendo(): break
            time.sleep(0.25)
        yield
    finally:
        desligar()

def abrir(p, w=1280, h=720):
    b = p.chromium.launch(headless=False, args=['--headless=new', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    pg = b.new_page(viewport={'width': w, 'height': h}); pg.set_default_timeout(60000)
    erros = []
    pg.on('pageerror', lambda e: erros.append('PAGEERROR ' + str(e)))
    pg.on('console', lambda m: erros.append(m.type + ' ' + m.text) if m.type in ('error', 'warning') else None)
    return b, pg, erros

def T(pg, js):
    """Roda um trecho de JS com `t` = window.__teste."""
    return pg.evaluate('() => { const t = window.__teste; ' + js + ' }')

def ate(pg, js, segundos=6.0, passo=0.1):
    """Espera até o trecho de JS (com `t` = window.__teste) devolver algo verdadeiro e devolve o último valor.
    O Chrome sem tela desenha poucos quadros e numa máquina lenta menos ainda: esperar um tempo fixo deixava os
    testes instáveis (D-336). Esperar a condição, com limite, deixa o teste certo nas máquinas rápidas e nas lentas."""
    fim = time.time() + segundos
    v = None
    while True:
        v = T(pg, js)
        if v or time.time() >= fim: return v
        time.sleep(passo)
