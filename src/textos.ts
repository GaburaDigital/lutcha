// Textos que aparecem dentro do jogo, em português e inglês (regra do Project: sempre nas duas línguas).
// Por enquanto só os do modo de teste do urso; português por padrão, inglês com ?lingua=en.

const PT = {
  golpe: { soco: 'SOCO!', socoLateral: 'SOCO LATERAL!', gancho: 'GANCHO!', martelada: 'MARTELADA!', arranhao: 'ARRANHÃO!', estocada: 'ESTOCADA!' },
  zona: { cabeca: 'cabeça', tronco: 'tronco', bracos: 'braço', pernas: 'pernas' },
  intencao: { aproximando: 'CHEGANDO', armando_morder: 'MORDIDA!', armando_socar: 'SOCO!', atacando_morder: 'NHAC!', atacando_socar: 'TOMA!', atordoado: 'TONTO', recuando: 'RECUANDO' },
  vizinho: 'de tabela',
  strike: 'STRIKE!',
  fimUrso: 'O original caiu! Ponto seu!', fimPiranbenja: 'Você saiu do ringue!',
  pausa: 'PAUSA (teste)', reconectando: 'Reconectando…',
  painel: {
    titulo: 'Solo de teste', comportamento: 'Clones', quantidade: 'Quantidade', formacao: 'Formação', cores: 'Cores dos acertos',
    placas: 'Placas de intenção', esticar: 'Esticar o braço', vibracao: 'Testar vibração', recomecar: 'Recomeçar com estas opções', continuar: 'Continuar',
    sim: 'sim', nao: 'não',
    ajuda: 'Analógico direito ↑↓ escolhe · ←→ muda · A confirma · B continua',
    dicaPausa: 'Segure Y por 1 s para pausar e abrir as opções',
  },
  comportamentos: { parados: 'parados', aleatorio: 'andando à toa', cautelosos: 'cautelosos', ofensivos: 'ofensivos' },
  formacoes: { solto: 'soltos', torre: 'torre de 3', piramide: 'pirâmide 3-2-1', muralha: 'muralha', corrente: 'fila em corrente' },
  relogio: { res: 'Res', aura: 'Aura', placar: 'Placar', acertos: 'Acertos' },
};
type Textos = typeof PT;

const EN: Textos = {
  golpe: { soco: 'PUNCH!', socoLateral: 'SIDE PUNCH!', gancho: 'UPPERCUT!', martelada: 'HAMMER FIST!', arranhao: 'SCRATCH!', estocada: 'STAB!' },
  zona: { cabeca: 'head', tronco: 'body', bracos: 'arm', pernas: 'legs' },
  intencao: { aproximando: 'COMING', armando_morder: 'BITE!', armando_socar: 'PUNCH!', atacando_morder: 'CHOMP!', atacando_socar: 'TAKE THIS!', atordoado: 'DIZZY', recuando: 'BACKING OFF' },
  vizinho: 'splash',
  strike: 'STRIKE!',
  fimUrso: 'The original fell! Your point!', fimPiranbenja: 'You left the ring!',
  pausa: 'PAUSED (test)', reconectando: 'Reconnecting…',
  painel: {
    titulo: 'Solo test', comportamento: 'Clones', quantidade: 'Amount', formacao: 'Formation', cores: 'Hit colors',
    placas: 'Intent signs', esticar: 'Arm stretch', vibracao: 'Test vibration', recomecar: 'Restart with these options', continuar: 'Resume',
    sim: 'yes', nao: 'no',
    ajuda: 'Right stick ↑↓ picks · ←→ changes · A confirms · B resumes',
    dicaPausa: 'Hold Y for 1 s to pause and open the options',
  },
  comportamentos: { parados: 'standing still', aleatorio: 'wandering', cautelosos: 'cautious', ofensivos: 'aggressive' },
  formacoes: { solto: 'loose', torre: 'tower of 3', piramide: 'pyramid 3-2-1', muralha: 'wall', corrente: 'chain line' },
  relogio: { res: 'Res', aura: 'Aura', placar: 'Score', acertos: 'Hits' },
};

function escolherLingua(): 'pt' | 'en' {
  try {
    const q = new URLSearchParams(location.search).get('lingua');
    return q === 'en' ? 'en' : 'pt'; // a escolha da língua nas Opções vem na etapa de interface
  } catch { return 'pt'; }
}
export const LINGUA = escolherLingua();
export const T: Textos = LINGUA === 'en' ? EN : PT;
