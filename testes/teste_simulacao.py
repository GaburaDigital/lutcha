"""Testes da simulação da luta (sem desenho), pelo modo laboratório da página:
golpe em cheio, raspão, boliche, agarrar e jogar, queda do original, ataques combinados no urso e sigilo da foto."""
import sys, time, json
from base import *

AJUDA = """
window.__s = {
  nova(op = {}) { this.l = new __lab.Luta(Object.assign({ semIA: true, clonesIniciais: 4, semente: 7 }, op)); this.ev = []; return this.l.testeNumeros(); },
  urso(cab, esq, dir, ge = [0, 0], gd = [0, 0]) {
    const v = (a) => ({ x: a[0], y: a[1], z: a[2] });
    this.l.definirUrso({ cabeca: v(cab), tamanhoPata: 1.3, maos: { esq: { pos: v(esq), gatilho: ge[0], grip: ge[1] }, dir: { pos: v(dir), gatilho: gd[0], grip: gd[1] } } });
  },
  passos(n, fn) { for (let i = 0; i < n; i++) { if (fn) fn(i); this.l.avancar(1 / 60); this.ev.push(...this.l.tirarEventos()); } return this.ev; },
  clone() { const o = this.l.numeroDoOriginal(); return this.l.testeNumeros().filter((n) => n !== o); },
};
"""
def S(pg, js): return pg.evaluate('() => { const s = window.__s; ' + js + ' }')
erros_teste = []
def confere(nome, ok, info=''):
    print(('OK   ' if ok else 'FALHA') + ' ' + nome + (' · ' + str(info) if info != '' else ''))
    if not ok: erros_teste.append(nome)

with servidor(), sync_playwright() as p:
    b, pg, erros = abrir(p, 800, 500)
    pg.goto(URL + '?modo=laboratorio'); pg.wait_for_function('() => window.__lab', timeout=60000)
    pg.evaluate('() => {' + AJUDA + '}')

    # 1) soco em cheio no tronco: punho fechado, 8 m/s, reto no clone
    r = S(pg, """s.nova(); const [c] = s.clone(); s.l.testeColocar(s.l.numeroDoOriginal(), { x: 4, y: 0.47, z: -3 });
      s.l.testeColocar(c, { x: 0, y: 0.47, z: 0 }); s.passos(10);
      const ev = s.passos(40, (i) => s.urso([0, 2.45, 2], [-1, 1.2, 2], [0, 0.5, 0.9 - i * 8 / 60], [0, 0], [1, 1]));
      const g = ev.find((e) => e.tipo === 'golpe'); return { g, vel: s.l.testeVelocidade(c) };""")
    g = r['g'] or {}
    confere('soco em cheio no tronco', g.get('qualidade') == 'cheio' and g.get('zona') == 'tronco' and g.get('golpe') == 'impacto', g)

    # 2) raspão: a pata passa de lado, mão aberta (dano): não decola
    r = S(pg, """s.nova(); const [c] = s.clone(); s.l.testeColocar(s.l.numeroDoOriginal(), { x: 4, y: 0.47, z: -3 });
      s.l.testeColocar(c, { x: 0, y: 0.47, z: 0 }); s.passos(10);
      const ev = s.passos(40, (i) => s.urso([0, 2.45, 2], [-2, 1.2, 2], [-1 + i * 5 / 60, 0.5, 0.36]));
      return ev.find((e) => e.tipo === 'golpe') || null;""")
    confere('raspão de lado não decola', bool(r) and r['qualidade'] == 'raspao' and r['lancamento'] <= 3, r)

    # 3) boliche: quatro clones em fila; o primeiro voa e derruba os outros
    r = S(pg, """s.nova({ clonesIniciais: 4 }); const cs = s.clone(); s.l.testeColocar(s.l.numeroDoOriginal(), { x: 4, y: 0.47, z: 3 });
      cs.forEach((c, i) => s.l.testeColocar(c, { x: 0, y: 0.47, z: -i * 0.5 })); s.passos(10);
      const ev = s.passos(120, (i) => s.urso([0, 2.45, 2], [-1, 1.2, 2], [0, 0.5, 0.9 - i * 13 / 60], [0, 0], [1, 1]));
      return { strike: ev.filter((e) => e.tipo === 'strike').length, golpe: ev.find((e) => e.tipo === 'golpe') };""")
    confere('boliche: STRIKE com três derrubados', r['strike'] >= 1, r)

    # 4) agarrar e jogar
    r = S(pg, """s.nova(); const [c] = s.clone(); s.l.testeColocar(s.l.numeroDoOriginal(), { x: 4, y: 0.47, z: -3 });
      s.l.testeColocar(c, { x: 0, y: 0.47, z: 0 }); s.passos(10);
      s.passos(5, () => s.urso([0, 2.45, 1.5], [-1, 1.2, 2], [0, 0.6, 0.15], [0, 0], [0, 0]));
      s.passos(10, () => s.urso([0, 2.45, 1.5], [-1, 1.2, 2], [0, 0.6, 0.15], [0, 0], [0, 1]));
      s.passos(30, (i) => s.urso([0, 2.45, 1.5], [-1, 1.2, 2], [0, 0.6 + i * 0.03, 0.15], [0, 0], [0, 1]));
      s.passos(8, (i) => s.urso([0, 2.45, 1.5], [-1, 1.2, 2], [0, 1.5, 0.15 - i * 10 / 60], [0, 0], [0, 1]));
      s.passos(1, () => s.urso([0, 2.45, 1.5], [-1, 1.2, 2], [0, 1.5, 0.15 - 9 * 10 / 60], [0, 0], [0, 0]));
      return { agarrou: s.ev.some((e) => e.tipo === 'agarrou'), arremesso: s.ev.find((e) => e.tipo === 'arremessou'), vel: s.l.testeVelocidade(c) };""")
    confere('agarrar e arremessar', r['agarrou'] and r['arremesso'] and r['arremesso']['velocidade'] > 6, r)

    # 5) o original cai fora do ringue: ponto do urso
    r = S(pg, """s.nova(); s.l.testeColocar(s.l.numeroDoOriginal(), { x: 0, y: 0.47, z: 6.6 });
      const ev = s.passos(150, () => s.urso([0, 2.45, -2], [-1, 1.2, -2], [1, 1.2, -2]));
      return ev.find((e) => e.tipo === 'fimRodada') || null;""")
    confere('original caiu: ponto do urso', bool(r) and r['vencedor'] == 'urso' and r['placar']['urso'] == 1, r)

    # 6) ataques combinados: três impactos juntos no urso
    r = S(pg, """s.nova({ clonesIniciais: 2 }); const ns = s.l.testeNumeros();
      ns.forEach((n, i) => { const a = i * 2.1; s.l.testeColocar(n, { x: Math.cos(a) * 0.9, y: 0.47, z: Math.sin(a) * 0.9 }); });
      s.passos(3, () => s.urso([0, 2.45, 0], [-0.4, 1.2, -0.4], [0.4, 1.2, -0.4]));
      ns.forEach((n) => s.l.testePedirAtaque(n, 'impacto'));
      const ev = s.passos(2, () => s.urso([0, 2.45, 0], [-0.4, 1.2, -0.4], [0.4, 1.2, -0.4]));
      return ev.filter((e) => e.tipo === 'ursoGolpeado').map((e) => e.combo);""")
    confere('ataque combinado de três Piranbenjas', r == [1, 1.6, 2.2], r)

    # 7) sigilo: a foto não diz quem é o original, e os números mudam quando nascem clones
    r = S(pg, """s.nova({ clonesIniciais: 3 }); s.passos(5);
      const f = s.l.foto(), P = __lab.protocolo; const bin = P.codificarFoto(f), volta = P.decodificarFoto(bin);
      const chaves = [...new Set(f.piranbenjas.flatMap((p) => Object.keys(p)))].sort();
      const antes = s.l.testeNumeros(); s.l.testeCriarClones(2); const depois = s.l.testeNumeros();
      const repetidos = antes.filter((n) => depois.includes(n)).length;
      return { chaves, bytes: bin.byteLength, n: f.piranbenjas.length, iguais: JSON.stringify(volta.piranbenjas.map(p => p.numero)) === JSON.stringify(f.piranbenjas.map(p => p.numero)), repetidos, total: depois.length };""")
    confere('foto sem marca do original', r['chaves'] == ['agarrado', 'numero', 'pos', 'rot', 'voando'], r['chaves'])
    confere('foto binária: 19 + 17 bytes por Piranbenja', r['bytes'] == 19 + 17 * r['n'] and r['iguais'], r['bytes'])
    confere('números sorteados de novo ao criar clones', r['repetidos'] <= 1 and r['total'] == 6, r)

    reais = [e for e in erros if 'GPU stall' not in e and 'WebGL' not in e]
    if reais: print('erros no console:', reais); erros_teste.append('console')
    b.close()
print('sem erros' if not erros_teste else 'FALHAS: ' + ', '.join(erros_teste))
sys.exit(1 if erros_teste else 0)
