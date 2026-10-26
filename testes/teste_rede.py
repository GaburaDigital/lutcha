"""PC (Piranbenja, anfitrião) e Quest simulado (UrsoBura) em duas abas do mesmo navegador, pelo canal local:
conexão, fotos chegando ao Quest, mãos chegando ao PC, golpe pela rede com vibração, números sorteados
de novo ao criar clones e o sigilo do original. Também abre o modo solo."""
import sys, time
from base import *

VR = """
window.__vr = {
  ligar() { const t = window.__teste; t.entrada.modo = 'vr';
    for (const [lado, h] of [['esq', 'left'], ['dir', 'right']]) { const m = t.entrada.maos[lado];
      m.fonte = { handedness: h, gamepad: { buttons: [...Array(7)].map(() => ({ pressed: false, touched: false, value: 0 })), axes: [0, 0, 0, 0],
        hapticActuators: [{ pulse: (v, d) => { (window.__vib ||= []).push([lado, +v.toFixed(2), d]); return Promise.resolve(true); } }] } };
      m.conectada = true; }
    t.camera.position.set(0, 1.6, 0); t.camera.rotation.set(-0.45, 0, 0); },
  maoMundo(lado, x, y, z) { const t = window.__teste; const v = new t.THREE.Vector3(x, y, z); t.rig.worldToLocal(v); t.entrada.maos[lado].pose.position.copy(v); },
  dedos(l, g, gr) { const b = window.__teste.entrada.maos[l].fonte.gamepad.buttons; b[0].value = g; b[0].pressed = g > 0.5; b[1].value = gr; b[1].pressed = gr > 0.5; },
};
"""
falhas = []
def confere(nome, ok, info=''):
    print(('OK   ' if ok else 'FALHA') + ' ' + nome + (' · ' + str(info) if info != '' else ''))
    if not ok: falhas.append(nome)
def J(pg, js): return pg.evaluate('() => { const t = window.__teste; ' + js + ' }')

with servidor(), sync_playwright() as p:
    # as duas abas precisam rodar ao mesmo tempo (no uso real são dois aparelhos): sem pausar a aba de trás
    b = p.chromium.launch(headless=False, args=['--headless=new', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
                                                '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'])
    ctx = b.new_context(viewport={'width': 1100, 'height': 650})
    erros = []
    pc = ctx.new_page(); quest = ctx.new_page()
    for pg in (pc, quest):
        pg.set_default_timeout(60000)
        pg.on('pageerror', lambda e: erros.append('PAGEERROR ' + str(e)))
        pg.on('console', lambda m: erros.append(m.type + ' ' + m.text) if m.type == 'error' else None)
    pc.goto(URL + '?modo=pc&canal=local&codigo=TESTE'); pc.wait_for_function('() => window.__teste && window.__teste.luta')
    quest.goto(URL + '?modo=quest&canal=local&codigo=TESTE'); quest.wait_for_function('() => window.__teste')
    quest.evaluate('() => {' + VR + '}'); J(quest, '__vr.ligar()')
    quest.wait_for_function('() => window.__teste.canal && window.__teste.canal.conectado()', timeout=15000)
    time.sleep(2)
    confere('PC e Quest conectados', J(pc, 'return t.canal.conectado()') and J(quest, 'return t.canal.conectado()'))
    confere('o urso de treino sai quando o Quest entra', J(pc, 'return t.luta.opcoes.ursoDeTreino') is False)
    nq = J(quest, 'return t.fotos.length'); npb = J(pc, 'return t.luta.foto().piranbenjas.length'); nqpb = J(quest, 'return t.fotos.at(-1).f.piranbenjas.length')
    confere('fotos chegando ao Quest', nq > 5 and nqpb == npb, f'{nq} fotos, {nqpb} de {npb} Piranbenjas')
    cab_q = J(quest, 'const c = t.camera.getWorldPosition(new t.THREE.Vector3()); return [c.x, c.y, c.z].map(v => +v.toFixed(2))')
    cab_pc = J(pc, 'const c = t.luta.entradaUrso.cabeca; return [c.x, c.y, c.z].map(v => +v.toFixed(2))')
    confere('cabeça do urso chegando ao PC', all(abs(a - b) < 0.05 for a, b in zip(cab_q, cab_pc)), f'Quest {cab_q} · PC {cab_pc}')
    chaves = J(quest, "return [...new Set(t.fotos.at(-1).f.piranbenjas.flatMap(p => Object.keys(p)))].sort()")
    confere('o Quest não recebe quem é o original', chaves == ['agarrado', 'numero', 'pos', 'rot', 'voando'], chaves)
    # números sorteados de novo quando o PC cria clones (tecla C)
    antes = J(quest, 'return t.fotos.at(-1).f.piranbenjas.map(p => p.numero)')
    pc.bring_to_front(); pc.keyboard.press('c'); time.sleep(1.5)
    depois = J(quest, 'return t.fotos.at(-1).f.piranbenjas.map(p => p.numero)')
    confere('clones novos e números sorteados de novo', len(depois) == len(antes) + 2 and len(set(antes) & set(depois)) <= 1, f'{len(antes)} → {len(depois)}')
    # golpe pela rede: a pata direita passa rápido pelo Piranbenja mais perto, com o punho fechado.
    # O alvo fica ao alcance do braço (até 2,6 m da cabeça; o PC recusa pata mais longe).
    # Cada passo é mandado na hora, porque o Chromium sem tela desenha só uns 4 quadros por segundo.
    alvo = J(quest, """const f = t.fotos.at(-1).f; const c = t.camera.getWorldPosition(new t.THREE.Vector3());
      const p = f.piranbenjas.slice().sort((a, b) => Math.hypot(a.pos.x - c.x, a.pos.z - c.z) - Math.hypot(b.pos.x - c.x, b.pos.z - c.z))[0];
      return [p.pos.x, p.pos.y, p.pos.z, p.numero];""")
    J(pc, "t.luta.opcoes.semIA = true")  # o alvo fica parado durante o golpe
    J(pc, f"t.luta.testeColocar({alvo[3]}, {{ x: 0, y: 0.47, z: 1.7 }})"); time.sleep(0.8)
    quest.evaluate("""async () => { window.__vib = []; __vr.dedos('dir', 1, 1);
      for (let i = 0; i <= 14; i++) { __vr.maoMundo('dir', 0, 0.6, 2.4 - i * 0.08); window.__teste.enviarAgora(); await new Promise(r => setTimeout(r, 30)); } }""")
    time.sleep(1.2)
    log = pc.inner_text('#log')
    vib = quest.evaluate('() => window.__vib || []')
    confere('golpe da pata do Quest registrado no PC', 'Pata direita' in log, log.splitlines()[:3])
    # a força depende da velocidade medida no Quest; sem tela ele desenha poucos quadros e a mão parece lenta,
    # então aqui basta a vibração de golpe (raspão, normal ou cheio) na pata certa
    confere('vibração no Quest ao acertar', any(v[0] == 'dir' and [v[1], v[2]] in ([0.3, 30], [0.6, 50], [1, 80]) for v in vib), vib[:4])
    J(pc, 't.luta.opcoes.semIA = false')
    quest.evaluate("() => { __vr.maoMundo('esq', -0.4, 1.7, 2.3); __vr.maoMundo('dir', 0.4, 1.7, 2.3); __vr.dedos('dir', 0, 0); }"); time.sleep(0.6)
    pc.screenshot(path=F + 'rede_01_pc_piranbenja.png'); quest.screenshot(path=F + 'rede_02_quest_urso.png')
    # modo solo (sem internet)
    solo = ctx.new_page(); solo.on('pageerror', lambda e: erros.append('PAGEERROR ' + str(e)))
    solo.goto(URL + '?modo=solo'); solo.wait_for_function('() => window.__teste && window.__teste.luta')
    solo.evaluate('() => {' + VR + '}'); solo.evaluate('() => window.__vr.ligar()'); solo.evaluate("() => { __vr.maoMundo('esq', -0.4, 1.7, 2.3); __vr.maoMundo('dir', 0.4, 1.7, 2.3); }"); time.sleep(3)
    confere('modo solo com clones da IA', J(solo, 'return t.luta.foto().piranbenjas.length') >= 5)
    solo.screenshot(path=F + 'rede_03_quest_solo.png')
    reais = [e for e in erros if 'GPU stall' not in e and 'WebGL' not in e]
    if reais: print('erros no console:', reais[:5]); falhas.append('console')
    b.close()
print('sem erros' if not falhas else 'FALHAS: ' + ', '.join(falhas))
sys.exit(1 if falhas else 0)
