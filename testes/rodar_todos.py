"""Roda todos os testes de uma vez: monta a página, liga o servidor UMA vez, roda a lista e desliga no fim.
Uso: python3 testes/rodar_todos.py"""
import subprocess, sys, os, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from base import servidor, RAIZ

TESTES = ['teste_simulacao.py', 'teste_rede.py', 'teste_patas.py']
aqui = os.path.dirname(os.path.abspath(__file__))
print('montando (npm run build)...'); subprocess.run(['npm', 'run', 'build'], cwd=RAIZ, check=True, stdout=subprocess.DEVNULL)
falhas = []
with servidor():
    for t in TESTES:
        inicio = time.time()
        r = subprocess.run([sys.executable, os.path.join(aqui, t)], cwd=aqui, capture_output=True, text=True, timeout=900)
        saida = (r.stdout + r.stderr).strip().splitlines()
        ok = r.returncode == 0 and any('sem erros' in l for l in saida[-3:])
        if not ok: falhas.append(t)
        print(f"{'OK  ' if ok else 'FALHOU'} {t} ({time.time() - inicio:.0f} s)")
        for l in saida[-14:]: print('    ' + l)
print('servidor desligado ·', 'todos passaram' if not falhas else 'falharam: ' + ', '.join(falhas))
sys.exit(1 if falhas else 0)
