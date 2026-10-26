"""Teste das patas com o Quest simulado: os controles viram objetos falsos (botões, eixos e vibração) e a página
roda igual ao óculos. Tira fotos de cada pose e de cada poder, confere a vibração da furadeira e o tamanho do mundo."""
import sys, time, json
from base import *

VR = """
window.__vr = {
  ligar() { const t = window.__teste; t.entrada.modo = 'vr';
    for (const [lado, h] of [['esq', 'left'], ['dir', 'right']]) { const m = t.entrada.maos[lado];
      m.fonte = { handedness: h, gamepad: { buttons: [...Array(7)].map(() => ({ pressed: false, touched: false, value: 0 })), axes: [0, 0, 0, 0],
        hapticActuators: [{ pulse: (v, d) => { (window.__vib ||= []).push([lado, +v.toFixed(2), d]); return Promise.resolve(true); } }] } };
      m.conectada = true; }
    t.orbita.enabled = false; t.camera.position.set(0, 1.6, 0); t.camera.rotation.set(-0.55, 0, 0); t.estado.alturaReal = 1.6; },
  // mãos à frente do peito, segurando o controle do jeito normal (cabo inclinado para frente)
  maos(dx = 0.2, y = 1.2, z = -0.42) { const t = window.__teste, T = t.THREE;
    const q = new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(new T.Vector3(1, 0, 0), new T.Vector3(0, 0.64, 0.77), new T.Vector3(0, -0.77, 0.64)));
    t.entrada.maos.esq.pose.position.set(-dx, y, z); t.entrada.maos.dir.pose.position.set(dx, y, z);
    for (const m of Object.values(t.entrada.maos)) m.pose.quaternion.copy(q); },
  botao(lado, i, v) { const b = window.__teste.entrada.maos[lado].fonte.gamepad.buttons[i]; b.pressed = v; b.value = v ? 1 : 0; },
  apertar(lado, i) { this.botao(lado, i, true); return new Promise((r) => setTimeout(() => { this.botao(lado, i, false); setTimeout(r, 400); }, 400)); },
  dedos(g, gr) { for (const l of ['esq', 'dir']) { this.botao(l, 0, g > 0.5); this.botao(l, 1, gr > 0.5);
    const b = window.__teste.entrada.maos[l].fonte.gamepad.buttons; b[0].value = g; b[1].value = gr; } },
};
"""
def vr(pg, js): return pg.evaluate('async () => { const t = window.__teste; ' + js + ' }')

with servidor(), sync_playwright() as p:
    b, pg, erros = abrir(p, 1100, 700)
    pg.goto(URL); pg.wait_for_function('() => window.__teste', timeout=60000); time.sleep(1.5)
    pg.screenshot(path=F + '00_tela_pc.png')
    print('triângulos:', T(pg, 'return t.triangulos()'))
    pg.evaluate('() => {' + VR + '}')
    vr(pg, '__vr.ligar(); __vr.maos();'); time.sleep(0.6)
    print('escala do mundo (urso, olhos reais 1,60 m):', T(pg, 'return +t.rig.scale.x.toFixed(3)'))
    fotos = [('01_urso_aberta', 0, 0), ('02_urso_gatilho', 1, 0), ('03_urso_apontar', 0, 1), ('04_urso_punho', 1, 1)]
    for nome, g, gr in fotos:
        vr(pg, f'__vr.dedos({g}, {gr})'); time.sleep(0.5); pg.screenshot(path=F + nome + '.png')
    # soco furadeira: B engatilha; com o punho fechado a carga sobe e a vibração cresce
    vr(pg, "window.__vib = []; await __vr.apertar('dir', 5); __vr.dedos(1, 1);"); time.sleep(2.4)
    carga = T(pg, 'return +t.estado.carga.toFixed(2)')
    vib = pg.evaluate('() => window.__vib')
    print('furadeira: engatilhada =', T(pg, 'return t.estado.furadeira'), '· carga depois de 2,4 s =', carga,
          '· vibrações:', len(vib), '· força da primeira e da última:', vib[0][1] if vib else None, vib[-1][1] if vib else None)
    pg.screenshot(path=F + '05_furadeira_carregada.png')
    vr(pg, "__vr.dedos(0, 0);"); time.sleep(0.6)
    print('furadeira com a mão aberta (pose travada no punho?):', T(pg, "const j = t.maos.dir.pata; return +j.raiz.children.find(c => c.type === 'Group' && c.children.length && c.position.z < -0.15).rotation.x.toFixed(2)"))
    vr(pg, "await __vr.apertar('dir', 5);")  # desliga
    # sabre: X → mão direita → mão esquerda → desligado; dedos esticados e travados, lâminas de ~120 cm nas pontas
    vr(pg, "await __vr.apertar('esq', 4); __vr.dedos(1, 1);"); time.sleep(0.5)
    print('sabre:', T(pg, 'return t.estado.sabreMao'), '· lâminas visíveis (direita, esquerda):',
          T(pg, "const n = (m) => { let k = 0; m.raiz.traverse(o => { if (o.name === 'lamina' && o.visible) k++; }); return k; }; return [n(t.maos.dir.pata), n(t.maos.esq.pata)]"),
          '· comprimento no mundo (m):', T(pg, "const T = t.THREE; let l = null; t.maos.dir.pata.raiz.traverse(o => { if (o.name === 'lamina' && o.visible && !l) l = o; }); return +(new T.Box3().setFromObject(l).getSize(new T.Vector3()).length()).toFixed(2)"))
    vr(pg, "t.camera.rotation.set(-0.3, 0, 0)"); time.sleep(0.3); pg.screenshot(path=F + '06_sabre_mao_direita.png')
    vr(pg, "await __vr.apertar('esq', 4);"); time.sleep(0.4)
    print('sabre:', T(pg, 'return t.estado.sabreMao'))
    pg.screenshot(path=F + '07_sabre_mao_esquerda.png')
    vr(pg, "await __vr.apertar('esq', 4); __vr.dedos(0, 0); t.camera.rotation.set(-0.55, 0, 0);")
    # agulhas 6×: todas as garras brancas
    vr(pg, "await __vr.apertar('esq', 5); await __vr.apertar('esq', 5); __vr.dedos(0, 1);"); time.sleep(0.4)
    print('agulhas:', T(pg, 'return t.estado.agulhas'))
    pg.screenshot(path=F + '08_agulhas_6x.png')
    vr(pg, "await __vr.apertar('esq', 5); __vr.dedos(0, 0);")
    # relógio na pata esquerda, virada para os olhos
    vr(pg, """const T = t.THREE; const m = t.entrada.maos.esq.pose; m.position.set(-0.05, 1.32, -0.32);
      const para = new T.Vector3(0, 1.6, 0).sub(m.position).normalize();
      m.quaternion.setFromUnitVectors(new T.Vector3(-1, 0, 0), para); t.entrada.maos.dir.pose.position.set(5, 0, 0);
      t.camera.lookAt(t.rig.localToWorld(m.position.clone()));"""); time.sleep(0.5)
    pg.screenshot(path=F + '09_relogio_esquerda.png')
    vr(pg, "__vr.maos(); t.camera.rotation.set(-0.55, 0, 0);")
    # tamanho: analógico direito para cima = pata maior
    vr(pg, "const ax = t.entrada.maos.dir.fonte.gamepad.axes; ax[3] = -1; await new Promise(r => setTimeout(r, 150)); ax[3] = 0;"); time.sleep(0.3)
    print('tamanho padrão 1,3; depois de empurrar para cima:', T(pg, 'return t.estado.tamanho'))
    # modo humano: A
    vr(pg, "await __vr.apertar('dir', 4);"); time.sleep(0.5)
    print('personagem:', T(pg, 'return t.estado.personagem'), '· escala do mundo:', T(pg, 'return +t.rig.scale.x.toFixed(3)'))
    for nome, g, gr in [('10_humano_aberta', 0, 0), ('11_humano_gatilho', 1, 0), ('12_humano_punho', 1, 1)]:
        vr(pg, f'__vr.dedos({g}, {gr})'); time.sleep(0.5); pg.screenshot(path=F + nome + '.png')
    reais = [e for e in erros if 'GPU stall' not in e and 'WebGL' not in e]
    print('erros no console:', reais if reais else 'nenhum')
    b.close()
    print('sem erros' if not reais else 'COM ERROS')
    sys.exit(1 if reais else 0)
