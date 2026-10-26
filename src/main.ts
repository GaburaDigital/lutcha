// Entrada do protótipo cinza: o menu escolhe a tela pelo endereço (?modo=pc, ?modo=quest, ?modo=solo).
// ?canal=local troca a rede de verdade (WebRTC) por duas abas do mesmo navegador (testes e computador sem óculos).
// ?codigo=ABC23 já preenche o código da sala.
import './estilo.css';
import { iniciarPC } from './cliente/pc_piranbenja';
import { iniciarQuest } from './cliente/quest_urso';
import { Luta, prepararFisica } from './simulacao/luta';
import * as protocolo from './rede/protocolo';
import * as regras from './simulacao/regras';

const q = new URLSearchParams(location.search);
const modo = q.get('modo');
const tipoCanal = q.get('canal') === 'local' ? 'local' : 'trystero';
const codigo = (q.get('codigo') ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5) || undefined;
const app = document.getElementById('app')!;
if (modo === 'pc') void iniciarPC(app, tipoCanal, codigo);
else if (modo === 'quest') void iniciarQuest(app, { modo: 'online', tipoCanal, codigo });
else if (modo === 'solo') void iniciarQuest(app, { modo: 'solo', tipoCanal });
else if (modo === 'laboratorio') {
  // testes automáticos da simulação: a luta sem desenho, controlada pelo teste
  void prepararFisica().then(() => {
    (window as unknown as { __lab: unknown }).__lab = { Luta, protocolo, regras };
    app.textContent = 'laboratório pronto';
  });
}
