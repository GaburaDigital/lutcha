"""Testes da simulação da luta (sem desenho), pelo modo laboratório da página:
golpe em cheio, raspão, boliche, agarrar e jogar, queda do original, ataques combinados no urso e sigilo da foto.
Batalha (C20–C23): empurrão pela resistência, chute, cabeçada, tonto, pata na superfície, formações, catapulta, rebater, escalar.
Rodada 2 do urso: golpes por direção (gancho, soco lateral, martelada, estocada, arranhão), vizinhos levando 60%,
atordoamento, ataque armado antes de bater, formações, boneco solto (ragdoll) ao agarrar e o braço que estica."""
import sys, time, json
from base import *

AJUDA = """
window.__s = {
  nova(op = {}) { this.l = new __lab.Luta(Object.assign({ semIA: true, clonesIniciais: 4, semente: 7 }, op)); this.ev = []; return this.l.testeNumeros(); },
  urso(cab, esq, dir, ge = [0, 0], gd = [0, 0], giro = 0) {
    const v = (a) => ({ x: a[0], y: a[1], z: a[2] });
    this.l.definirUrso({ cabeca: v(cab), giro, tamanhoPata: 1.3, maos: { esq: { pos: v(esq), gatilho: ge[0], grip: ge[1] }, dir: { pos: v(dir), gatilho: gd[0], grip: gd[1] } } });
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
    confere('soco em cheio no tronco', g.get('qualidade') == 'cheio' and g.get('zona') == 'tronco' and g.get('golpe') == 'impacto' and g.get('nome') == 'soco', g)

    # 2) raspão: a pata passa de lado, mão aberta (dano): não decola
    r = S(pg, """s.nova(); const [c] = s.clone(); s.l.testeColocar(s.l.numeroDoOriginal(), { x: 4, y: 0.47, z: -3 });
      s.l.testeColocar(c, { x: 0, y: 0.47, z: 0 }); s.passos(10);
      const ev = s.passos(40, (i) => s.urso([0, 2.45, 2], [-2, 1.2, 2], [-1 + i * 5 / 60, 0.5, 0.55]));
      return ev.find((e) => e.tipo === 'golpe') || null;""")
    confere('raspão de lado não decola', bool(r) and r['qualidade'] == 'raspao' and r['lancamento'] <= 3, r)

    # 3) boliche: quatro clones em fila; o primeiro voa e derruba os outros (três derrubados na mesma jogada = STRIKE)
    r = S(pg, """s.nova({ clonesIniciais: 4 }); const cs = s.clone(); s.l.testeColocar(s.l.numeroDoOriginal(), { x: 4, y: 0.47, z: 3 });
      cs.forEach((c, i) => s.l.testeColocar(c, { x: 0, y: 0.47, z: -i * 0.7 })); // mais longe que 0,55 m: sem golpe de tabela s.passos(10);
      const ev = s.passos(150, (i) => s.urso([0, 2.45, 2], [-1, 1.2, 2], [0, 0.5, Math.max(0.35, 0.9 - i * 13 / 60)], [0, 0], [1, 1])); // a pata para depois do golpe
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
      ns.forEach((n, i) => { const a = i * 2.1; s.l.testeColocar(n, { x: Math.cos(a) * 0.7, y: 0.47, z: 0.15 + Math.sin(a) * 0.7 }); }); // em volta das pernas
      s.passos(3, () => s.urso([0, 2.45, 0], [-0.4, 1.2, -0.4], [0.4, 1.2, -0.4]));
      ns.forEach((n) => s.l.testePedirAtaque(n, 'soco'));
      const ev = s.passos(2, () => s.urso([0, 2.45, 0], [-0.4, 1.2, -0.4], [0.4, 1.2, -0.4]));
      return ev.filter((e) => e.tipo === 'ursoGolpeado').map((e) => e.combo);""")
    confere('ataque combinado de três Piranbenjas', r == [1, 1.6, 2.2], r)

    # 7) sigilo: a foto não diz quem é o original, e os números mudam quando nascem clones
    r = S(pg, """s.nova({ clonesIniciais: 3 }); s.passos(5);
      const f = s.l.foto(), P = __lab.protocolo; const bin = P.codificarFoto(f), volta = P.decodificarFoto(bin);
      const chaves = [...new Set(f.piranbenjas.flatMap((p) => Object.keys(p)))].sort();
      const antes = s.l.testeNumeros(); s.l.testeCriarClones(2); const depois = s.l.testeNumeros();
      const repetidos = antes.filter((n) => depois.includes(n)).length;
      return { chaves, bytes: bin.byteLength, n: f.piranbenjas.length, nf: f.formacoes.length, iguais: JSON.stringify(volta.piranbenjas.map(p => p.numero)) === JSON.stringify(f.piranbenjas.map(p => p.numero)), repetidos, total: depois.length };""")
    confere('foto sem marca do original', r['chaves'] == ['achatado', 'agarrado', 'ataque', 'estado', 'grudado', 'numero', 'partes', 'pos', 'rot', 'voando'], r['chaves'])
    confere('foto binária: 21 + 18 por Piranbenja + 9 por formação', r['bytes'] == 21 + 18 * r['n'] + 9 * r['nf'] and r['iguais'], r['bytes'])
    confere('números sorteados de novo ao criar clones', r['repetidos'] <= 1 and r['total'] == 6, r)

    # ---------- rodada 2 do urso ----------
    PREP = """s.nova(); const [c, d] = s.clone(); s.l.testeColocar(s.l.numeroDoOriginal(), { x: 4, y: 0.47, z: -3 });
      s.l.testeColocar(c, { x: 0, y: 0.47, z: 0 }); s.l.testeColocar(d, { x: -4, y: 0.47, z: 3 }); s.passos(10);"""
    # 8) gancho: punho subindo por baixo do clone: sobe girando para trás (cabeça para longe do urso, giro em −x)
    r = S(pg, PREP + """const ev = s.passos(20, (i) => s.urso([0, 2.45, 1.2], [-1, 1.2, 2], [0, 0.1 + i * 7 / 60, 0.75 - i * 4 / 60], [0, 0], [1, 1]));
      s.passos(4); const g = ev.find((e) => e.tipo === 'golpe'); return { g, giro: s.l.testeGiro(c), vel: s.l.testeVelocidade(c), est: s.l.testeEstado(c) };""")
    confere('gancho: sobe girando para trás', (r['g'] or {}).get('nome') == 'gancho' and r['giro']['x'] < -2, {'nome': (r['g'] or {}).get('nome'), 'giro': r['giro']})
    # 9) soco lateral: o clone rola de lado
    r = S(pg, PREP + """const ev = s.passos(20, (i) => s.urso([0, 2.45, 1.4], [-1, 1.2, 2], [-0.9 + i * 8 / 60, 0.45, 0.05], [0, 0], [1, 1]));
      s.passos(3); const g = ev.find((e) => e.tipo === 'golpe'); return { g, giro: s.l.testeGiro(c) };""")
    confere('soco lateral: rola de lado', (r['g'] or {}).get('nome') == 'socoLateral' and abs(r['giro']['z']) > 2, {'nome': (r['g'] or {}).get('nome'), 'giro': r['giro']})
    # 10) martelada em dois clones colados: pega um só, que fica achatado no chão
    r = S(pg, """s.nova(); const [c, d] = s.clone(); s.l.testeColocar(s.l.numeroDoOriginal(), { x: 4, y: 0.47, z: -3 });
      s.l.testeColocar(c, { x: -0.21, y: 0.47, z: 0 }); s.l.testeColocar(d, { x: 0.21, y: 0.47, z: 0 }); s.passos(10);
      const ev = s.passos(20, (i) => s.urso([0, 2.45, 1.2], [-1, 1.2, 2], [0, 1.4 - i * 7 / 60, 0], [0, 0], [1, 1]));
      const gs = ev.filter((e) => e.tipo === 'golpe'); const f = s.l.foto();
      return { nomes: gs.map((g) => g.nome), achatados: f.piranbenjas.filter((p) => p.achatado).length };""")
    confere('martelada pega um só e achata', r['nomes'] == ['martelada'] and r['achatados'] == 1, r)
    # 11) soco no clone da frente: o de trás, colado, leva 60% "de tabela"; os dois ficam atordoados
    r = S(pg, """s.nova(); const [c, d] = s.clone(); s.l.testeColocar(s.l.numeroDoOriginal(), { x: 4, y: 0.47, z: -3 });
      s.l.testeColocar(c, { x: 0, y: 0.47, z: 0 }); s.l.testeColocar(d, { x: 0, y: 0.47, z: -0.5 }); s.passos(10);
      let ec = null, ed = null;
      const ev = s.passos(30, (i) => { s.urso([0, 2.45, 2], [-1, 1.2, 2], [0, 0.5, Math.max(0.25, 0.9 - i * 5 / 60)], [0, 0], [1, 1]);
        if (!ec && s.ev.some((e) => e.tipo === 'golpe')) { ec = s.l.testeEstado(c); ed = s.l.testeEstado(d); } });
      const gs = ev.filter((e) => e.tipo === 'golpe');
      return { gs: gs.map((g) => [g.nome, g.vizinho]), ec, ed };""")
    confere('vizinho colado leva o golpe de tabela', [['soco', False], ['soco', True]] == r['gs'] and (r['ec'] or {}).get('estado') == 'atordoado' and (r['ed'] or {}).get('estado') == 'atordoado', r)
    # 12) estocada (mão aberta, reta) atordoa mais que o arranhão (mão aberta, de lado) e empurra menos
    r = S(pg, PREP + """const ev = s.passos(20, (i) => s.urso([0, 2.45, 2], [-1, 1.2, 2], [0, 0.55, Math.max(-0.1, 0.9 - i * 7 / 60)], [0, 0], [0, 0]));
      const g = ev.find((e) => e.tipo === 'golpe'); const est = s.l.testeEstado(c), vel = s.l.testeVelocidade(c); return { g, est, vel };""")
    r2 = S(pg, PREP + """const ev = s.passos(20, (i) => s.urso([0, 2.45, 1.4], [-1, 1.2, 2], [-0.9 + i * 7 / 60, 0.55, 0.05], [0, 0], [0, 0]));
      const g = ev.find((e) => e.tipo === 'golpe'); const est = s.l.testeEstado(c), vel = s.l.testeVelocidade(c); return { g, est, vel };""")
    confere('estocada atordoa mais que o arranhão', (r['g'] or {}).get('nome') == 'estocada' and (r2['g'] or {}).get('nome') == 'arranhao'
            and r['est']['atordoadoPor'] > r2['est']['atordoadoPor'] + 1, {'estocada': r['est'], 'arranhao': r2['est']})
    # 13) ataque armado: o clone ofensivo sempre "arma" (~0,6 s) antes de bater no urso
    r = S(pg, """s.nova({ semIA: false, comportamento: 'ofensivos', clonesIniciais: 1 }); const ns = s.l.testeNumeros();
      s.l.testeColocar(ns[0], { x: 0.9, y: 0.47, z: 0 }); s.l.testeColocar(ns[1], { x: -0.9, y: 0.47, z: 0 });
      const linha = []; let primeiro = -1;
      for (let i = 0; i < 360; i++) { s.urso([0, 2.45, 0], [-0.4, 2.2, -0.2], [0.4, 2.2, -0.2]); s.l.avancar(1 / 60);
        for (const e of s.l.tirarEventos()) if (e.tipo === 'ursoGolpeado' && primeiro < 0) primeiro = i;
        linha.push(s.l.foto().piranbenjas.map((p) => p.estado).join(',')); }
      const armouAntes = primeiro > 0 && linha.slice(Math.max(0, primeiro - 40), primeiro).some((l) => l.includes('armando'));
      return { primeiro, armouAntes };""")
    confere('clone arma o ataque antes de bater', r['primeiro'] > 0 and r['armouAntes'], r)
    # 14) pirâmide (C21): fica de pé; um soco tira da resistência dela (ninguém voa); zerou, desmancha como STRIKE
    r = S(pg, """s.nova({ formacao: 'piramide' }); s.passos(60); const f0 = s.l.foto();
      const alturas = f0.piranbenjas.map((p) => +p.pos.y.toFixed(2)).sort((a, b) => a - b);
      const parar = () => s.passos(25, () => s.urso([0, 2.45, 2.6], [-1, 1.2, 2.6], [0, 0.5, 2.3]));
      const soco = () => s.passos(12, (i) => s.urso([0, 2.45, 2.6], [-1, 1.2, 2.6], [0, 0.5, Math.max(1.75, 2.2 - i * 8 / 60)], [0, 0], [1, 1]));
      parar(); soco(); const res1 = s.l.testeUnidades()[0]?.res; const livres1 = s.l.testeNumeros().filter((n) => !s.l.testeEstado(n).formacao).length;
      for (let k = 0; k < 4; k++) { parar(); soco(); }
      s.passos(240, () => s.urso([0, 2.45, 2.6], [-1, 1.2, 2.6], [0, 1.6, 2.2]));
      const topo = Math.max(...s.l.foto().piranbenjas.map((p) => p.pos.y));
      return { n: f0.piranbenjas.length, alturas, res1, livres1, strike: s.ev.filter((e) => e.tipo === 'strike').length, unidades: s.l.testeUnidades().length, topo: +topo.toFixed(2) };""")
    confere('pirâmide de pé; soco tira resistência; desmancha em STRIKE', r['n'] == 7 and r['alturas'][-1] > 2.1 and r['res1'] is not None and r['res1'] < 50 and r['livres1'] == 1
            and r['strike'] >= 1 and r['unidades'] == 0 and r['topo'] < 1.2, r)
    # 15) agarrar vira boneco solto: a parte segura acompanha a pata e as pernas ficam penduradas
    r = S(pg, PREP + """s.passos(5, () => s.urso([0, 2.45, 1.5], [-1, 1.2, 2], [0, 0.6, 0.15], [0, 0], [0, 0]));
      s.passos(90, (i) => s.urso([0, 2.45, 1.5], [-1, 1.2, 2], [0, 0.6 + Math.min(i, 20) * 0.04, 0.15], [0, 0], [0, 1])); // sobe e espera o balanço assentar
      const p = s.l.foto().piranbenjas.find((x) => x.numero === c);
      return { agarrado: p.agarrado, partes: !!p.partes, tronco: p.partes && p.partes.tronco.pos.y, perna: p.partes && p.partes.pernaE.pos.y };""")
    confere('agarrado vira boneco solto pendurado', r['agarrado'] and r['partes'] and r['tronco'] > 0.9 and r['perna'] < r['tronco'], r)
    # 16) braço que estica: abaixo do ombro desce 1,6× mais (meio da coxa alcança o chão no urso)
    r = pg.evaluate('() => { const R = __lab.regras; return [R.esticarAltura(1.5, 1.35, 1.6), R.esticarAltura(0.5, 1.35, 1.6)].map((v) => +v.toFixed(2)); }')
    confere('braço estica para baixo', r == [1.5, -0.01], r)

    # ---------- teste solo do Piranbenja (C16) ----------
    # 17) o Piranbenja acerta a parte do urso que alcança: tapa perto da perna esquerda
    r = S(pg, """s.nova({ clonesIniciais: 1 }); const [c] = s.clone(); s.l.testeColocar(s.l.numeroDoOriginal(), { x: 4, y: 0.47, z: -3 });
      s.l.testeColocar(c, { x: -0.55, y: 0.47, z: 1.9 }); s.passos(5, () => s.urso([0, 2.45, 2], [-0.6, 1.4, 1.7], [0.6, 1.4, 1.7]));
      s.l.testePedirAtaque(c, 'tapa'); const ev = s.passos(2, () => s.urso([0, 2.45, 2], [-0.6, 1.4, 1.7], [0.6, 1.4, 1.7]));
      return ev.filter((e) => e.tipo === 'ursoGolpeado').map((e) => [e.ataque, e.parte]);""")
    confere('tapa na perna do urso', r == [['tapa', 'pernaE']], r)
    # 18) mordida gruda no braço, acompanha o braço subindo e solta quando o urso sacode
    r = S(pg, """s.nova({ clonesIniciais: 1 }); const [c] = s.clone(); s.l.testeColocar(s.l.numeroDoOriginal(), { x: 4, y: 0.47, z: -3 });
      s.l.testeColocar(c, { x: 0.35, y: 0.47, z: 0.3 }); const pata = [0.35, 0.75, 0.8];
      s.passos(10, () => s.urso([0, 2.45, 2], [-0.6, 1.4, 1.7], pata));
      s.l.testePedirAtaque(c, 'morder'); s.passos(2, () => s.urso([0, 2.45, 2], [-0.6, 1.4, 1.7], pata));
      const gr = s.l.testeGrudados();
      s.passos(60, (i) => s.urso([0, 2.45, 2], [-0.6, 1.4, 1.7], [0.35, 0.75 + i * 0.015, 0.8]));
      const p1 = s.l.foto().piranbenjas.find((p) => p.numero === c);
      const ev = s.passos(40, (i) => s.urso([0, 2.45, 2], [-0.6, 1.4, 1.7], [0.35 + (i % 2 ? 0.45 : -0.45), 1.65, 0.8]));
      return { gr, cab: p1.partes && +p1.partes.cabeca.pos.y.toFixed(2), grudado: p1.grudado, soltou: ev.filter((e) => e.tipo === 'soltouGrudado').map((e) => e.como), depois: s.l.testeGrudados().length, res: s.l.foto().urso.res };""")
    confere('mordida gruda no braço e sobe com ele', len(r['gr']) == 1 and r['gr'][0]['parte'] in ('antebracoD', 'pataD') and r['grudado'] and r['cab'] > 1.1, r)
    confere('sacudir o braço solta o grudado', 'sacudida' in r['soltou'] and r['depois'] == 0, r)
    # 19) arrancar com a outra pata: agarra o grudado e ele sai do braço
    r = S(pg, """s.nova({ clonesIniciais: 1 }); const [c] = s.clone(); s.l.testeColocar(s.l.numeroDoOriginal(), { x: 4, y: 0.47, z: -3 });
      s.l.testeColocar(c, { x: 0.35, y: 0.47, z: 0.3 }); const pata = [0.35, 0.75, 0.8];
      s.passos(10, () => s.urso([0, 2.45, 2], [-0.6, 1.4, 1.7], pata));
      s.l.testePedirAtaque(c, 'morder'); s.passos(3, () => s.urso([0, 2.45, 2], [-0.6, 1.4, 1.7], pata));
      const cab = s.l.foto().piranbenjas.find((p) => p.numero === c).partes.tronco.pos;
      s.passos(20, () => s.urso([0, 2.45, 2], [cab.x, cab.y + 0.05, cab.z], pata));
      s.passos(10, () => s.urso([0, 2.45, 2], [cab.x, cab.y + 0.05, cab.z], pata, [0, 1]));
      return { ev: s.ev.filter((e) => e.tipo === 'soltouGrudado' || e.tipo === 'agarrou').map((e) => e.tipo + ':' + (e.como || e.mao)), grudados: s.l.testeGrudados().length };""")
    confere('arrancar o grudado com a outra pata', 'soltouGrudado:arrancado' in r['ev'] and 'agarrou:esq' in r['ev'] and r['grudados'] == 0, r)
    # 20) o original nunca morde: pedir mordida vira tapa, e ele não gruda
    r = S(pg, """s.nova({ clonesIniciais: 0 }); const o = s.l.numeroDoOriginal();
      s.l.testeColocar(o, { x: -0.55, y: 0.47, z: 1.9 }); s.passos(5, () => s.urso([0, 2.45, 2], [-0.6, 1.4, 1.7], [0.6, 1.4, 1.7]));
      s.l.controle.atacar = 'tapa'; s.l.controle.olhar = -Math.PI / 2;
      const ev = s.passos(60, () => s.urso([0, 2.45, 2], [-0.6, 1.4, 1.7], [0.6, 1.4, 1.7]));
      return { ataques: ev.filter((e) => e.tipo === 'ursoGolpeado').map((e) => e.ataque), grudados: s.l.testeGrudados().length };""")
    confere('o original dá tapa (não morde nem gruda)', r['ataques'] == ['tapa'] and r['grudados'] == 0, r)
    # 21) urso ofensivo contra clones: bate, agarra e arremessa; e ninguém fica dentro do urso
    r = S(pg, """s.nova({ semIA: false, ursoBot: 'ofensivo', clonesIniciais: 6, comportamento: 'ofensivos', semente: 11 });
      let pior = 0, acima = 0; const tipos = {};
      for (let i = 0; i < 2400; i++) { s.l.avancar(1 / 60); for (const e of s.l.tirarEventos()) tipos[e.tipo] = (tipos[e.tipo] || 0) + 1; const m = s.l.testeSobreposicao(); if (m > 0.03) acima++; pior = Math.max(pior, s.l.testeSobreposicao(true)); }
      return { tipos, pior: +pior.toFixed(3), acima };""")
    t = r['tipos']
    confere('urso ofensivo bate, agarra e arremessa', t.get('golpe', 0) >= 3 and t.get('agarrou', 0) >= 1 and t.get('arremessou', 0) >= 1, t)
    # boneco solto balançando pode encostar até ~8 cm por um quadro (a junta puxa, o empurrão devolve); fora isso, até 3 cm.
    # O Piranbenja segurado durante um arremesso rápido (9 m/s) pode passar mais por um quadro: conta só nos quadros acima de 3 cm
    confere('ninguém fica dentro do urso', r['pior'] <= 0.08 and r['acima'] <= 15, {'pior': r['pior'], 'quadros acima de 3 cm': r['acima']})
    # 22) urso parado não sai do lugar; urso bobo anda
    r = S(pg, """const pos = (j) => { s.nova({ semIA: true, ursoBot: j }); s.passos(240); const c = s.l.entradaUrso.cabeca; return Math.hypot(c.x, c.z - 3); };
      return { parado: +pos('parado').toFixed(2), bobo: +pos('bobo').toFixed(2) };""")
    confere('urso parado fica; urso bobo anda', r['parado'] < 0.01 and r['bobo'] > 0.3, r)
    # 23) clones simples custam menos água
    r = S(pg, """s.nova({ clonesIniciais: 0 }); const a0 = s.l.aguaAtual; s.l.testeCriarClones(2, true); const a1 = s.l.aguaAtual; s.l.testeCriarClones(2, false);
      return [Math.round(a0 - a1), Math.round(a1 - s.l.aguaAtual)];""")
    confere('clone simples custa menos água (4 e 8)', r == [8, 16], r)

    # ---------- equilíbrio e correções (C19) ----------
    # 24) três socos juntos no urso cansado: ele decola, voa e cai
    r = S(pg, """s.nova({ semIA: true, ursoBot: 'parado', clonesIniciais: 3 }); s.passos(30);
      s.l.ursoRes = 30; const ns = s.l.testeNumeros();
      ns.forEach((n, i) => { const a = i * 2.1; s.l.testeColocar(n, { x: Math.cos(a) * 0.7, y: 0.47, z: 3.15 + Math.sin(a) * 0.7 }); });
      s.passos(3); ns.forEach((n) => s.l.testePedirAtaque(n, 'soco'));
      let alto = 0; const ev = s.passos(200, () => { alto = Math.max(alto, s.l.entradaUrso.cabeca.y); });
      return { decolou: ev.filter((e) => e.tipo === 'ursoDecolou').length, alto: +alto.toFixed(2), fim: +s.l.entradaUrso.cabeca.y.toFixed(2) };""")
    confere('soco combinado decola o urso cansado', r['decolou'] >= 1 and r['alto'] > 3.4 and r['fim'] < 2.6, r)
    # 25) ao criar clones, o original passa as estrelinhas para um clone novo e fica livre
    r = S(pg, """s.nova({ clonesIniciais: 0 }); s.passos(5); const o = s.l.pbs.find((p) => p.original); o.atordoadoAte = s.l.tempo + 3; o.estado = 'atordoado';
      s.l.testeCriarClones(2); const tontos = s.l.foto().piranbenjas.filter((p) => s.l.testeEstado(p.numero).atordoadoPor > 1);
      return { originalLivre: s.l.testeEstado(s.l.numeroDoOriginal()).atordoadoPor === 0, tontos: tontos.length, tontoEhOriginal: tontos.some((p) => p.numero === s.l.numeroDoOriginal()) };""")
    confere('estrelinhas passam do original para um clone', r['originalLivre'] and r['tontos'] == 1 and not r['tontoEhOriginal'], r)
    # 26) clone salva-vidas: caindo do ringue, criar clones devolve o original; de novo só depois de 8 s
    r = S(pg, """s.nova({ clonesIniciais: 0 }); const o = s.l.numeroDoOriginal();
      const cair = () => { s.l.testeColocar(s.l.numeroDoOriginal(), { x: 0, y: 0.47, z: 6.3 }); s.l.pbs.find((p) => p.original).corpo.setLinvel({ x: 0, y: 0, z: 3 }, true); s.passos(25); };
      cair(); const y0 = s.l.foto().piranbenjas.find((p) => p.numero === s.l.numeroDoOriginal()).pos.y;
      s.l.testeCriarClones(2); s.passos(10); const p1 = s.l.foto().piranbenjas.find((p) => p.numero === s.l.numeroDoOriginal()).pos;
      cair(); s.l.testeCriarClones(2); const ev = s.passos(90);
      return { caindo: +y0.toFixed(2), salvo: Math.hypot(p1.x, p1.z) < 5.6 && p1.y > 0.2, depois: ev.filter((e) => e.tipo === 'fimRodada').map((e) => e.vencedor) };""")
    confere('clone salva-vidas (e espera de 8 s)', r['caindo'] < 0.4 and r['salvo'] and r['depois'] == ['urso'], r)
    # 27) um em cada três clones simples vira armadilha de morder
    r = S(pg, """s.nova({ clonesIniciais: 0 }); s.l.testeCriarClones(6, true); return s.l.pbs.filter((p) => p.armadilha).length;""")
    confere('armadilhas de morder entre os clones simples', r == 2, r)
    # 28) pata devagar não golpeia (só encosta) e agarra
    r = S(pg, """s.nova(); const [c] = s.clone(); s.l.testeColocar(s.l.numeroDoOriginal(), { x: 4, y: 0.47, z: -3 });
      s.l.testeColocar(c, { x: 0, y: 0.47, z: 0 }); s.passos(10);
      const ev = s.passos(40, (i) => s.urso([0, 2.45, 2], [-1, 1.2, 2], [0, 0.55, Math.max(0.45, 1.2 - i * 2.5 / 60)], [0, 0], [0, 0]));
      const golpes = ev.filter((e) => e.tipo === 'golpe').length;
      const ev2 = s.passos(10, () => s.urso([0, 2.45, 2], [-1, 1.2, 2], [0, 0.55, 0.45], [0, 0], [0, 1]));
      return { golpes, agarrou: ev2.some((e) => e.tipo === 'agarrou') };""")
    confere('pata devagar não golpeia e agarra', r['golpes'] == 0 and r['agarrou'], r)

    # ---------- batalha (C20–C23) ----------
    # 29) empurrão pela resistência: urso inteiro quase não sai do lugar; fraquinho, um soco sozinho já decola um pouco
    r = S(pg, """const um = (res) => { s.nova({ semIA: true, ursoBot: 'parado', clonesIniciais: 1 }); s.passos(30); const [c] = s.clone();
        s.l.testeColocar(s.l.numeroDoOriginal(), { x: 4, y: 0.47, z: -3 }); s.l.testeColocar(c, { x: 0, y: 0.47, z: 2.45 }); s.passos(3);
        s.l.ursoRes = res; s.l.testePedirAtaque(c, 'soco'); let alto = 0; const ev = s.passos(120, () => { alto = Math.max(alto, s.l.entradaUrso.cabeca.y); });
        const g = ev.find((e) => e.tipo === 'ursoGolpeado');
        return { parte: g && g.parte, emp: g ? +Math.hypot(g.empurrao.x, g.empurrao.z).toFixed(2) : -1, decolou: ev.some((e) => e.tipo === 'ursoDecolou'), alto: +alto.toFixed(2) }; };
      return { forte: um(100), fraco: um(10) };""")
    confere('urso inteiro: soco na barriga só empurra um pouco', r['forte']['parte'] == 'tronco' and 0.6 < r['forte']['emp'] < 1.0 and not r['forte']['decolou'], r['forte'])
    confere('urso fraco: um soco sozinho decola um pulinho', r['fraco']['decolou'] and 2.8 < r['fraco']['alto'] < 3.4, r['fraco'])
    # 30) chute com as duas pernas na perna do urso: enche a barra de equilíbrio, ele cai sentado; quem chutou fica caído
    r = S(pg, """s.nova({ semIA: true, ursoBot: 'parado', clonesIniciais: 1 }); s.passos(30); const [c] = s.clone();
      s.l.testeColocar(s.l.numeroDoOriginal(), { x: 4, y: 0.47, z: -3 }); s.l.testeColocar(c, { x: 0, y: 0.47, z: 2.45 }); s.passos(3);
      s.l.ursoRes = 50; s.l.testePedirAtaque(c, 'chute'); const ev = s.passos(2); const caido = s.l.testeEstado(c).estado;
      s.passos(30); const cab = s.l.entradaUrso.cabeca.y, sentado = s.l.testeUrso().sentado;
      const g = ev.find((e) => e.tipo === 'ursoGolpeado');
      return { parte: g && g.parte, caiu: ev.some((e) => e.tipo === 'ursoCaiu'), decolou: ev.some((e) => e.tipo === 'ursoDecolou'), caido, sentado, cab: +cab.toFixed(2) };""")
    confere('chute na perna: urso cai sentado e quem chutou fica caído', (r['parte'] or '').startswith('perna') and r['caiu'] and not r['decolou'] and r['caido'] == 'caido' and r['sentado'] and r['cab'] < 1.8, r)
    # 31) cabeçada: joga o urso mais para cima do que para trás
    r = S(pg, """s.nova({ semIA: true, ursoBot: 'parado', clonesIniciais: 1 }); s.passos(30); const [c] = s.clone();
      s.l.testeColocar(s.l.numeroDoOriginal(), { x: 4, y: 0.47, z: -3 }); s.l.testeColocar(c, { x: 0, y: 0.47, z: 2.45 }); s.passos(3);
      s.l.ursoRes = 0; s.l.testePedirAtaque(c, 'cabecada'); const ev = s.passos(2); const d = ev.find((e) => e.tipo === 'ursoDecolou');
      return d ? { vy: +d.vel.y.toFixed(2), vh: +Math.hypot(d.vel.x, d.vel.z).toFixed(2) } : null;""")
    confere('cabeçada joga o urso para cima', bool(r) and r['vy'] > 3 * r['vh'], r)
    # 32) impacto na cabeça deixa o urso tonto (e tonto ele não agarra)
    r = S(pg, """s.nova({ clonesIniciais: 1 }); const [c] = s.clone(); s.l.testeColocar(s.l.numeroDoOriginal(), { x: 4, y: 0.47, z: -3 });
      s.passos(3, () => s.urso([0, 2.45, 3], [-0.7, 1.2, 2.8], [0.7, 1.2, 2.8])); s.l.testeColocar(c, { x: 0, y: 2.15, z: 2.5 });
      s.l.testePedirAtaque(c, 'soco'); const ev = s.passos(1, () => s.urso([0, 2.45, 3], [-0.7, 1.2, 2.8], [0.7, 1.2, 2.8]));
      const g = ev.find((e) => e.tipo === 'ursoGolpeado'); return { parte: g && g.parte, tonto: ev.some((e) => e.tipo === 'ursoTonto'), estado: s.l.testeUrso().tonto };""")
    confere('impacto na cabeça deixa o urso tonto', r['parte'] == 'cabeca' and r['tonto'] and r['estado'], r)
    # 33) mão meio fechada (indo agarrar) não golpeia, mesmo rápida
    r = S(pg, """s.nova(); const [c] = s.clone(); s.l.testeColocar(s.l.numeroDoOriginal(), { x: 4, y: 0.47, z: -3 });
      s.l.testeColocar(c, { x: 0, y: 0.47, z: 0 }); s.passos(10);
      const ev = s.passos(40, (i) => s.urso([0, 2.45, 2], [-1, 1.2, 2], [0, 0.5, 0.9 - i * 8 / 60], [0, 0], [0, 0.6]));
      return { golpes: ev.filter((e) => e.tipo === 'golpe').length, vel: +s.l.testeVelocidade(c).toFixed(2) };""")
    confere('mão meio fechada não golpeia', r['golpes'] == 0, r)
    # 34) a pata para na superfície: empurrar devagar para dentro do clone não o empurra
    r = S(pg, """s.nova(); const [c] = s.clone(); s.l.testeColocar(s.l.numeroDoOriginal(), { x: 4, y: 0.47, z: -3 });
      s.l.testeColocar(c, { x: 0, y: 0.47, z: 0 }); s.passos(10);
      s.passos(60, (i) => s.urso([0, 2.45, 2], [-1, 1.2, 2], [0, 0.55, Math.max(0.05, 1.2 - i * 2 / 60)], [0, 0], [0, 0]));
      const p = s.l.foto().piranbenjas.find((x) => x.numero === c).pos, pata = s.l.pataNaLuta('dir');
      return { x: +p.x.toFixed(3), z: +p.z.toFixed(3), pataZ: +pata.z.toFixed(3), vel: +s.l.testeVelocidade(c).toFixed(2) };""")
    confere('pata para na superfície e não empurra', abs(r['z']) < 0.03 and abs(r['x']) < 0.03 and 0.33 < r['pataZ'] < 0.38 and r['vel'] < 0.1, r)

    # formações: o original em z = −2 olhando para o urso (cabeça em z = 3); os clones em volta dele
    FORMAR = """s.nova({ clonesIniciais: N, semIA: SEMIA, comportamento: 'parados' }); const o = s.l.numeroDoOriginal(); const cs = s.clone();
      s.l.testeColocar(o, { x: 0, y: 0.47, z: -2 }); cs.forEach((c, i) => s.l.testeColocar(c, { x: -1.2 + (i % 4) * 0.8, y: 0.47, z: -1.2 - Math.floor(i / 4) * 0.6 })); s.passos(5);"""
    def formar(n, semia='true'): return FORMAR.replace('N', str(n)).replace('SEMIA', semia)
    # 35) muralha: golpe durante a montagem desmancha como STRIKE
    r = S(pg, formar(4) + """const ok = s.l.testeFormar('muralha'); s.passos(20);
      const m = s.l.testeUnidades()[0]; const alvo = s.l.foto().piranbenjas.find((p) => p.numero === m.membros[1]).pos;
      const ev = s.passos(20, (i) => s.urso([alvo.x, 2.45, alvo.z + 1.6], [-1, 1.2, 2], [alvo.x, 0.5, alvo.z + 0.9 - i * 8 / 60], [0, 0], [1, 1]));
      return { ok, montada: m.montada, strike: ev.filter((e) => e.tipo === 'strike').length, desfeita: ev.filter((e) => e.tipo === 'formacaoDesfeita').map((e) => e.strike) };""")
    confere('muralha montando: um golpe desmancha em STRIKE', r['ok'] and not r['montada'] and r['strike'] == 1 and r['desfeita'] == [True], r)
    # 36) muralha montada: o golpe tira resistência e ninguém voa; agarrar um tira 1/3; com menos de 3, desfaz sem strike
    r = S(pg, formar(4) + """s.l.testeFormar('muralha'); s.passos(80);
      const m = s.l.testeUnidades()[0]; const pos = (n) => s.l.foto().piranbenjas.find((p) => p.numero === n).pos;
      const a = pos(m.membros[1]);
      s.passos(20, (i) => s.urso([a.x, 2.45, a.z + 1.6], [-1, 1.2, 2], [a.x, 0.5, a.z + 0.9 - i * 8 / 60], [0, 0], [1, 1]));
      const depois = s.l.testeUnidades()[0], vel = s.l.testeVelocidade(m.membros[1]);
      // muralha nova só para as puxadas (a pata saindo de trás da muralha arranharia no caminho)
      { s.nova({ clonesIniciais: 4, semIA: true, comportamento: 'parados' }); const o2 = s.l.numeroDoOriginal();
        s.l.testeColocar(o2, { x: 0, y: 0.47, z: -2 }); s.clone().forEach((c, i) => s.l.testeColocar(c, { x: -1.2 + i * 0.8, y: 0.47, z: -1.2 })); s.passos(5);
        s.l.testeFormar('muralha'); s.passos(80); s.urso([0, 2.45, 1.6], [-1, 1.2, 2], [1.5, 1.2, 1.2]); s.passos(10); }
      const m2 = s.l.testeUnidades()[0];
      // a pata vai devagar (menos de 3 m/s: só encosta), fecha, levanta devagar e solta
      let pata = [1.5, 1.2, 1.2];
      const ir = (alvo, n, g) => { const de = pata; s.passos(n, (i) => { const k = (i + 1) / n; pata = de.map((v, j) => v + (alvo[j] - v) * k); s.urso([0, 2.45, 1.6], [-1, 1.2, 2], pata, [0, 0], g); }); };
      const puxar = (n) => { const p = pos(n); ir([p.x, 0.6, p.z + 0.36], 50, [0, 0]); ir([p.x, 0.6, p.z + 0.36], 5, [0, 1]); ir([p.x, 1.2, p.z + 0.8], 40, [0, 1]); ir([p.x, 1.2, p.z + 0.8], 5, [0, 0]); ir([1.5, 1.2, 1.2], 50, [0, 0]); s.passos(20); };
      puxar(m2.membros[0]); const um = s.l.testeUnidades()[0];
      puxar(m2.membros[3]);
      return { res0: m.res, res1: depois && +depois.res.toFixed(1), vel: +vel.toFixed(2), um: um && { res: +um.res.toFixed(1), n: um.membros.length }, res2: m2.res,
        fim: s.l.testeUnidades().length, desfeita: s.ev.filter((e) => e.tipo === 'formacaoDesfeita').map((e) => e.strike), agarrou: s.ev.filter((e) => e.tipo === 'agarrou').length };""")
    confere('muralha montada: golpe tira resistência e ninguém voa', r['res1'] is not None and r['res1'] < r['res0'] and r['vel'] < 0.5, r)
    confere('agarrar tira 1/3 e, com poucos, desfaz sem strike', r['agarrou'] == 2 and r['um'] and r['um']['n'] == 3 and abs(r['um']['res'] - (r['res2'] - 10)) < 0.1 and r['fim'] == 0 and r['desfeita'] == [False], r)
    # 37) catapulta: um clone que chega perto sobe sozinho e é lançado no urso (soco ×1,5)
    r = S(pg, formar(4, 'false') + """s.l.testeFormar('catapulta'); s.passos(80);
      const u = s.l.testeUnidades()[0]; const livre = s.clone().find((c) => !u.membros.includes(c));
      s.l.testeColocar(livre, { x: 0.5, y: 0.47, z: -0.4 });
      let lancou = null, golpe = null;
      for (let i = 0; i < 400 && !golpe; i++) { s.urso([0, 2.45, 3], [-0.7, 1.2, 2.8], [0.7, 1.2, 2.8]); s.l.avancar(1 / 60);
        for (const e of s.l.tirarEventos()) { if (e.tipo === 'catapulta') lancou = e; if (e.tipo === 'ursoGolpeado' && e.projetil) golpe = e; } }
      return { tipo: u.tipo, lancou: !!lancou, golpe: golpe && { parte: golpe.parte, bloqueio: golpe.bloqueio, combo: golpe.combo } };""")
    confere('catapulta lança o clone no urso', r['tipo'] == 'catapulta' and r['lancou'] and r['golpe'] is not None, r)
    # 38) rebater: um soco no projétil antes de ele chegar no corpo; o urso não leva nada
    r = S(pg, formar(4, 'false') + """s.l.testeFormar('catapulta'); s.passos(80);
      const u = s.l.testeUnidades()[0]; const livre = s.clone().find((c) => !u.membros.includes(c));
      s.l.testeColocar(livre, { x: 0.5, y: 0.47, z: -0.4 });
      let rebateu = false, golpeado = false, socou = false;
      for (let i = 0; i < 400 && !rebateu && !golpeado; i++) {
        const voando = s.l.foto().piranbenjas.find((p) => p.estado === 'projetil');
        let dir = [0.7, 1.2, 2.8], g = [0, 0];
        if (voando && voando.pos.z > 1.2 && !socou) { socou = true; const q = voando.pos;
          s.urso([0, 2.45, 3], [-0.7, 1.2, 2.8], [q.x, q.y, q.z + 0.6], [0, 0], [0, 0]); s.l.avancar(1 / 60); for (const e of s.l.tirarEventos()) { if (e.tipo === 'rebatida') rebateu = true; if (e.tipo === 'ursoGolpeado' && e.projetil) golpeado = true; }
          dir = [q.x, q.y, q.z - 0.3]; g = [1, 1]; }
        s.urso([0, 2.45, 3], [-0.7, 1.2, 2.8], dir, [0, 0], g); s.l.avancar(1 / 60);
        for (const e of s.l.tirarEventos()) { if (e.tipo === 'rebatida') rebateu = true; if (e.tipo === 'ursoGolpeado' && e.projetil) golpeado = true; } }
      return { rebateu, golpeado };""")
    confere('urso rebate o projétil com um soco na hora certa', r['rebateu'] and not r['golpeado'], r)
    # 39) escalar: o original encosta na torre, Espaço, troca de lugar com o do topo; Espaço de novo desce
    r = S(pg, formar(4) + """s.l.testeFormar('torre'); s.passos(100); const u = s.l.testeUnidades()[0];
      s.l.testeColocar(o, { x: 0, y: 0.47, z: -0.55 }); s.passos(2); const antes = s.l.acaoDeEspaco();
      s.l.controle.espaco = true; s.passos(50); const yTopo = s.l.foto().piranbenjas.find((p) => p.numero === s.l.numeroDoOriginal()).pos.y;
      const naTorre = s.l.testeUnidades()[0].membros.includes(s.l.numeroDoOriginal()), membros = s.l.testeUnidades()[0].membros.length, agora = s.l.acaoDeEspaco();
      s.l.controle.espaco = true; s.passos(60); const yChao = s.l.foto().piranbenjas.find((p) => p.numero === s.l.numeroDoOriginal()).pos.y;
      return { antes, agora, yTopo: +yTopo.toFixed(2), naTorre, membros, yChao: +yChao.toFixed(2) };""")
    confere('escalar a torre com Espaço (e descer)', r['antes'] == 'escalar' and r['naTorre'] and r['yTopo'] > 2 and r['membros'] == 3 and r['agora'] == 'descer' and r['yChao'] < 0.7, r)
    # 40) corrente: a ponta vai até a perna do urso, enrola e o urso cai sentado
    r = S(pg, formar(5) + """s.l.testeFormar('corrente'); let enrolou = null, caiu = false;
      for (let i = 0; i < 420 && !caiu; i++) { s.l.avancar(1 / 60); for (const e of s.l.tirarEventos()) { if (e.tipo === 'correnteEnrolou') enrolou = e.parte; if (e.tipo === 'ursoCaiu') caiu = true; } }
      return { enrolou, caiu, unidades: s.l.testeUnidades().length };""")
    confere('corrente enrola na perna e o urso cai sentado', (r['enrolou'] or '').startswith('perna') and r['caiu'] and r['unidades'] == 0, r)
    # 41) fila: investe em linha; os impactos quase juntos fazem combo
    r = S(pg, formar(5) + """s.l.testeFormar('fila'); const n = s.l.testeUnidades()[0].membros.length; const ev = s.passos(240);
      const gs = ev.filter((e) => e.tipo === 'ursoGolpeado'); return { n, combos: gs.map((g) => g.combo), unidades: s.l.testeUnidades().length };""")
    confere('fila investe e faz combo', r['n'] >= 3 and len(r['combos']) >= 3 and max(r['combos']) >= 2.2 and r['unidades'] == 0, r)
    # 42) roda das formações: precisa de clones perto (até 4 m)
    r = S(pg, formar(3) + """const p = s.l.formacoesPossiveis(); return { muralha: p.muralha, catapulta: p.catapulta, pode: s.l.testeFormar('muralha') };""")
    confere('formação só com clones suficientes perto', r['muralha']['tem'] == 3 and r['muralha']['precisa'] == 4 and not r['pode'], r)
    # 44) teto de 30 clones
    r = S(pg, """s.nova({ clonesIniciais: 26 }); s.l.agua = 100; s.l.testeCriarClones(8, true); return s.l.testeNumeros().length - 1;""")
    confere('no máximo 30 clones', r == 30, r)
    # 45) cérebro externo (tática do técnico): ordens por clone; a tática com erro não trava a luta
    r = S(pg, """s.nova({ semIA: false, comportamento: 'parados', clonesIniciais: 3, ursoBot: 'parado' }); const cs = s.clone();
      const o = s.l.numeroDoOriginal(); s.l.testeColocar(o, { x: -4, y: 0.47, z: -3 });
      cs.forEach((c, i) => s.l.testeColocar(c, { x: -1 + i, y: 0.47, z: -1 }));
      let vistas = 0, temOriginal = false;
      s.l.definirCerebro((v) => { vistas++; temOriginal = !!v.original; return { ordens: { [cs[0]]: { atacar: 'soco' }, [cs[1]]: { ir: { x: 3, y: 0, z: -1 } }, [cs[2]]: { ir: { x: 99, y: 0, z: 0 } } } }; });
      const ev = s.passos(600); const pos = (n) => s.l.foto().piranbenjas.find((p) => p.numero === n).pos;
      const p1 = pos(cs[1]), p2 = pos(cs[2]);
      s.l.definirCerebro(() => { throw new Error('tática com erro'); }); s.passos(30);
      return { vistas, temOriginal, socos: ev.filter((e) => e.tipo === 'ursoGolpeado' && e.numero === cs[0]).length,
        foi: Math.hypot(p1.x - 3, p1.z + 1) < 0.5, dentro: Math.hypot(p2.x, p2.z) < 5.5 };""")
    confere('tática do técnico manda nos clones (com proteções)', r['vistas'] > 10 and r['temOriginal'] and r['socos'] >= 1 and r['foi'] and r['dentro'], r)
    # 43) onomatopeia: o quadro do texto cresce com a palavra (antes era fixo em 512 e cortava)
    r = pg.evaluate("""() => { const c = document.createElement('canvas').getContext('2d'); c.font = '900 104px "Baloo 2", "Trebuchet MS", sans-serif';
      return { longa: c.measureText('SOCO LATERAL!').width, curta: c.measureText('PAF!').width }; }""")
    confere('palavra longa passa de 512 px (por isso o quadro agora é medido)', r['longa'] > 512, r)

    reais = [e for e in erros if 'GPU stall' not in e and 'WebGL' not in e]
    if reais: print('erros no console:', reais); erros_teste.append('console')
    b.close()
print('sem erros' if not erros_teste else 'FALHAS: ' + ', '.join(erros_teste))
sys.exit(1 if erros_teste else 0)
