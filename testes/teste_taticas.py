"""Testes das táticas do técnico (conversa "Programação por blocos e IA dos clones"), pelo modo laboratório:
conferência do JSON (lista fechada, limite de 50 blocos), somar regras ligado e desligado, ação exclusiva (atacar)
vencendo movimento, sinais, grupos que sobrevivem ao sorteio dos números, original no automático, obediência,
formação pedida pela tática e as táticas prontas rodando sem erro. Termina com a tela do PC (painel e teclas)."""
import sys
from base import *

AJUDA = """
window.__s = {
  nova(op = {}) { this.l = new __lab.Luta(Object.assign({ semIA: false, comportamento: 'parados', clonesIniciais: 4, semente: 7, ursoBot: 'parado' }, op)); this.ev = []; return this.l.testeNumeros(); },
  tec(sorte = 0.5) { this.t = new __lab.taticas.Tecnico(() => sorte); this.l.definirCerebro(this.t.cerebro); return this.t; },
  tatica(regras, somar = true) { const r = __lab.taticas.conferirTatica({ versao: 1, nome: { pt: 't', en: 't' }, somar, regras }); if (!r.ok) throw new Error(r.erro); this.t.trocar(r.tatica); },
  passos(n, fn) { for (let i = 0; i < n; i++) { if (fn) fn(i); this.l.avancar(1 / 60); this.ev.push(...this.l.tirarEventos()); } return this.ev; },
  clone() { const o = this.l.numeroDoOriginal(); return this.l.testeNumeros().filter((n) => n !== o); },
  pos(n) { return this.l.foto().piranbenjas.find((p) => p.numero === n).pos; },
  alinhar() { const o = this.l.numeroDoOriginal(); this.l.testeColocar(o, { x: -4, y: 0.47, z: 3 }); this.clone().forEach((c, i) => this.l.testeColocar(c, { x: -1.5 + i, y: 0.47, z: 2.5 })); },
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

    # 1) conferência: bloco desconhecido, código no lugar de bloco, limite de blocos, valores fora da faixa
    r = S(pg, """const c = __lab.taticas.conferirTatica, base = (regras) => ({ versao: 1, nome: { pt: 'a', en: 'a' }, somar: true, regras });
      const regra = { quando: { b: 'sempre' }, quem: [{ b: 'clones' }], se: [], fazer: [{ b: 'aproximar' }] };
      return { desconhecido: c(base([{ ...regra, fazer: [{ b: 'explodir' }] }])).ok,
        codigo: c(base([{ ...regra, fazer: ['alert(1)'] }])).ok,
        demais: c(base(Array(17).fill(regra))).ok, cabe: c(base(Array(16).fill(regra))).ok,
        faixa: c(base([{ ...regra, quem: [{ b: 'pertoDoUrso', m: 999 }] }])).tatica.regras[0].quem[0].m,
        prontas: __lab.taticas.TATICAS_PRONTAS.map((t) => { const x = c(JSON.parse(JSON.stringify(t))); return x.ok ? x.blocos : x.erro; }) };""")
    confere('conferência recusa bloco desconhecido e código', not r['desconhecido'] and not r['codigo'], r)
    confere('limite de 50 blocos', not r['demais'] and r['cabe'], r)
    confere('valor fora da faixa é limitado', r['faixa'] == 12, r)
    confere('táticas prontas passam na conferência (até 50 blocos)', all(isinstance(x, int) and x <= 50 for x in r['prontas']), r['prontas'])

    # 2) somar regras: ligado soma os movimentos (diagonal); desligado vale só a primeira regra
    js_somar = """s.nova(); s.alinhar(); s.tec(0.5); const [c] = s.clone();
      s.tatica([{ quando: { b: 'sempre' }, quem: [{ b: 'clones' }], se: [], fazer: [{ b: 'irPara', x: 4, z: 2.5 }] },
                { quando: { b: 'sempre' }, quem: [{ b: 'clones' }], se: [], fazer: [{ b: 'irPara', x: -1.5, z: -3 }] }], SOMAR);
      const a = s.pos(c); s.passos(90); const d = s.pos(c); return { dx: d.x - a.x, dz: d.z - a.z };"""
    lig = S(pg, js_somar.replace('SOMAR', 'true'))
    des = S(pg, js_somar.replace('SOMAR', 'false'))
    confere('somar ligado: anda na diagonal (as duas regras)', lig['dx'] > 0.3 and lig['dz'] < -0.3, lig)
    confere('somar desligado: só a primeira regra', des['dx'] > 0.8 and abs(des['dz']) < 0.4, des)

    # 3) atacar (exclusiva) vence o movimento: o clone vai bater no urso
    r = S(pg, """s.nova(); s.alinhar(); s.tec(0.5); const cs = s.clone();
      s.tatica([{ quando: { b: 'sempre' }, quem: [{ b: 'clones' }], se: [], fazer: [{ b: 'irPara', x: 5, z: 0 }, { b: 'atacar', ataque: 'soco' }] }]);
      const ev = s.passos(600); return ev.filter((e) => e.tipo === 'ursoGolpeado' && cs.includes(e.numero)).length;""")
    confere('atacar vence o movimento (clones batem no urso)', r >= 2, r)

    # 4) sinal: só vale depois da tecla e por alguns segundos
    r = S(pg, """s.nova(); s.alinhar(); s.tec(0.5); const [c] = s.clone();
      s.tatica([{ quando: { b: 'sinal', sinal: 2, dura: 2 }, quem: [{ b: 'clones' }], se: [], fazer: [{ b: 'irPara', x: 4, z: 2.5 }] }]);
      const a = s.pos(c); s.passos(60); const antes = s.pos(c).x - a.x;
      s.t.sinal(2); s.passos(120); const depois = s.pos(c).x - a.x;
      s.passos(180); const o = s.l.foto().piranbenjas.find((p) => p.numero === c); return { antes, depois, ordensDepois: s.t.tatica ? 1 : 0 };""")
    confere('sinal: nada antes da tecla, anda depois', abs(r['antes']) < 0.2 and r['depois'] > 1.0, r)

    # 5) grupos: clones novos vão para o grupo escolhido e continuam nele depois do sorteio dos números
    r = S(pg, """s.nova({ clonesIniciais: 2 }); s.alinhar(); const t = s.tec(0.5); s.passos(20);
      const velhos = s.clone(); const gVelhos = velhos.map((n) => t.grupoDe(n));
      t.grupoDosNovos = 'beta'; s.l.agua = 100; s.l.testeCriarClones(3, false); s.passos(20);
      const contagem = t.contarGrupos(); s.passos(60); const depois = t.contarGrupos();
      s.tatica([{ quando: { b: 'sempre' }, quem: [{ b: 'grupo', grupo: 'beta' }], se: [], fazer: [{ b: 'irPara', x: 4, z: -4 }] }]);
      const alvo = (n) => Math.hypot(s.pos(n).x - 4, s.pos(n).z + 4);
      const antes = Object.fromEntries(s.clone().map((n) => [n, alvo(n)])); s.passos(360);
      const mud = s.clone().map((n) => ({ g: t.grupoDe(n), chegou: antes[n] - alvo(n) }));
      return { gVelhos, contagem, depois, betaAndou: mud.filter((x) => x.g === 'beta' && x.chegou > 2).length, alphaParado: mud.filter((x) => x.g === 'alpha' && Math.abs(x.chegou) < 0.3).length };""")
    confere('clones antigos no alpha, novos no beta', r['gVelhos'] == ['alpha', 'alpha'] and r['contagem']['beta'] == 3 and r['depois']['beta'] == 3, r)
    confere('regra do grupo beta só move o beta', r['betaAndou'] == 3 and r['alphaParado'] == 2, r)

    # 6) original no automático recebe ordens como um clone; sem automático, não
    js_auto = """s.nova({ originalAutomatico: AUTO }); s.alinhar(); s.tec(0.5); const o = s.l.numeroDoOriginal();
      s.tatica([{ quando: { b: 'sempre' }, quem: [{ b: 'original' }], se: [], fazer: [{ b: 'irPara', x: 0, z: 4.5 }] }]);
      const a = s.pos(o); s.passos(180); const d = s.pos(o); return Math.hypot(d.x - a.x, d.z - a.z);"""
    com = S(pg, js_auto.replace('AUTO', 'true')); sem = S(pg, js_auto.replace('AUTO', 'false'))
    confere('original no automático segue a tática', com > 1.5, com)
    confere('original fora do automático não é mexido pela tática', sem < 0.3, sem)

    # 7) obediência: quem "não obedece" segue a IA mínima (aqui, parados)
    r = S(pg, """s.nova(); s.alinhar(); s.tec(0.95); const [c] = s.clone();
      s.tatica([{ quando: { b: 'sempre' }, quem: [{ b: 'clones' }], se: [], fazer: [{ b: 'irPara', x: 4, z: 2.5 }] }]);
      const a = s.pos(c); s.passos(120); return s.pos(c).x - a.x;""")
    confere('clone que não obedece fica na IA mínima', abs(r) < 0.3, r)

    # 8) formação pedida pela tática (uma vez, sem repetir)
    r = S(pg, """s.nova({ clonesIniciais: 5 }); const o = s.l.numeroDoOriginal(); s.l.testeColocar(o, { x: -3, y: 0.47, z: 3 });
      s.clone().forEach((c, i) => s.l.testeColocar(c, { x: -3.6 + i * 0.5, y: 0.47, z: 2.2 })); s.tec(0.5);
      s.tatica([{ quando: { b: 'sempre' }, quem: [{ b: 'todos' }], se: [{ b: 'nao', c: { b: 'temFormacao', tipo: 'muralha' } }], fazer: [{ b: 'formar', tipo: 'muralha' }] }]);
      s.passos(240); return s.l.foto().formacoes.map((f) => f.tipo);""")
    confere('tática monta a muralha (uma só)', r == ['muralha'], r)

    # 9) as cinco táticas prontas rodam 30 s contra o urso ofensivo, com sinais, sem erro
    r = S(pg, """const out = [];
      for (let i = 0; i < __lab.taticas.TATICAS_PRONTAS.length; i++) {
        s.nova({ clonesIniciais: 8, ursoBot: 'ofensivo', comportamento: 'seguir' }); let q = 12345 + i; const rnd = () => { q = (q * 1103515245 + 12345) % 2147483648; return q / 2147483648; }; s.t = new __lab.taticas.Tecnico(rnd); let ordensAtaque = 0; s.l.definirCerebro((v) => { const d = s.t.cerebro(v); ordensAtaque += Object.values(d.ordens ?? {}).filter((o) => o.atacar).length; return d; });
        s.t.trocar(__lab.taticas.TATICAS_PRONTAS[i]); s.ev = [];
        const ev = s.passos(1800, (k) => { if (k === 300) s.t.sinal(1); if (k === 700) s.t.sinal(2); });
        out.push({ ordensAtaque, golpes: ev.filter((e) => e.tipo === 'ursoGolpeado').length, formacoes: ev.filter((e) => e.tipo === 'formacao').length });
      } return out;""")
    confere('táticas prontas rodam, mandam atacar e batem no urso', all(x['ordensAtaque'] > 20 for x in r) and sum(x['golpes'] for x in r) >= 10, r)

    # 10) tela do PC: painel do técnico, teclas 1–5, Tab e G
    pg.goto(URL + '?modo=pcsolo&urso=parado&iniciais=4'); pg.wait_for_function('() => window.__tecnico', timeout=60000)
    pg.keyboard.press('3'); pg.keyboard.press('Tab'); pg.keyboard.press('g'); pg.keyboard.press('o'); pg.wait_for_timeout(600)
    r = pg.evaluate("""() => { const t = window.__tecnico; return { ativa: t.ativa, auto: t.automatico, autoLuta: !!window.__teste.luta.opcoes.originalAutomatico,
      grupo: t.tecnico.grupoDosNovos, painel: document.querySelector('.tecnico')?.textContent ?? '' }; }""")
    pg.screenshot(path=F + 'taticas_painel.png')
    confere('teclas: 3 escolhe a tática, Tab liga o automático, G troca o grupo', r['ativa'] == 3 and r['auto'] and r['autoLuta'] and r['grupo'] == 'beta', r)
    confere('painel mostra a tática e o grito do sinal', 'Derruba e bate' in r['painel'] and 'Pastel Dimensional' in r['painel'], r['painel'][:160])

    reais = [e for e in erros if 'GPU stall' not in e and 'WebGL' not in e]
    if reais: print('erros no console:', reais); erros_teste.append('console')
    b.close()

print('sem erros' if not erros_teste else 'falhas: ' + ', '.join(erros_teste))
sys.exit(1 if erros_teste else 0)
