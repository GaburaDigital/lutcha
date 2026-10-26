// Textos que aparecem dentro do jogo, em português e inglês (regra do Project: sempre nas duas línguas).
// Por enquanto só os do modo de teste do urso; português por padrão, inglês com ?lingua=en.

const PT = {
  golpe: { soco: 'SOCO!', socoLateral: 'SOCO LATERAL!', gancho: 'GANCHO!', martelada: 'MARTELADA!', arranhao: 'ARRANHÃO!', estocada: 'ESTOCADA!' },
  zona: { cabeca: 'cabeça', tronco: 'tronco', bracos: 'braço', pernas: 'pernas' },
  intencao: { aproximando: 'CHEGANDO', armando_morder: 'MORDIDA!', armando_socar: 'SOCO!', armando_tapa: 'TAPA!', atacando_morder: 'NHAC!', atacando_socar: 'TOMA!', atacando_tapa: 'PAF!', atordoado: 'TONTO', recuando: 'RECUANDO' },
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
  comportamentos: { parados: 'parados', aleatorio: 'andando à toa', cautelosos: 'cautelosos', ofensivos: 'ofensivos', seguir: 'seguem você' },
  jeitosUrso: { parado: 'parado', bobo: 'bobo', ofensivo: 'ofensivo' },
  partesUrso: { cabeca: 'cabeça', tronco: 'barriga', braco: 'braço', pata: 'pata', perna: 'perna' },
  ataquePB: { morder: 'NHAC!', tapa: 'PAF!', soco: 'TOMA!' },
  grudou: 'GRUDOU!', soltou: 'SOLTOU!',
  teclas: { andar: 'Andar', camera: 'Câmera', tapa: 'Tapa', soco: 'Soco', simples: 'Clones simples', complexos: 'Clones complexos', pausa: 'Pausa', mouse: 'Soltar o mouse' },
  pc: {
    titulo: 'Piranbenja solo (teste)', urso: 'Urso', clones: 'Clones', iniciais: 'Clones no começo', ajudas: 'Ajudas visuais',
    recomecar: 'Recomeçar', continuar: 'Continuar', clique: 'Clique na tela para jogar', agua: 'Água', resUrso: 'Urso',
    placar: 'Placar', vivos: 'Clones', segure: 'segure para criar mais', grudados: 'grudados no urso', curtoGrudados: 'grudados', pausa: 'Pausa',
  },
  formacoes: { solto: 'soltos', torre: 'torre de 3', piramide: 'pirâmide 3-2-1', muralha: 'muralha', corrente: 'fila em corrente' },
  relogio: { res: 'Res', aura: 'Aura', placar: 'Placar', acertos: 'Acertos' },
};
type Textos = typeof PT;

const EN: Textos = {
  golpe: { soco: 'PUNCH!', socoLateral: 'SIDE PUNCH!', gancho: 'UPPERCUT!', martelada: 'HAMMER FIST!', arranhao: 'SCRATCH!', estocada: 'STAB!' },
  zona: { cabeca: 'head', tronco: 'body', bracos: 'arm', pernas: 'legs' },
  intencao: { aproximando: 'COMING', armando_morder: 'BITE!', armando_socar: 'PUNCH!', armando_tapa: 'SLAP!', atacando_morder: 'CHOMP!', atacando_socar: 'TAKE THIS!', atacando_tapa: 'SMACK!', atordoado: 'DIZZY', recuando: 'BACKING OFF' },
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
  comportamentos: { parados: 'standing still', aleatorio: 'wandering', cautelosos: 'cautious', ofensivos: 'aggressive', seguir: 'follow you' },
  jeitosUrso: { parado: 'standing still', bobo: 'clumsy', ofensivo: 'aggressive' },
  partesUrso: { cabeca: 'head', tronco: 'belly', braco: 'arm', pata: 'paw', perna: 'leg' },
  ataquePB: { morder: 'CHOMP!', tapa: 'SLAP!', soco: 'TAKE THIS!' },
  grudou: 'STUCK!', soltou: 'SHAKEN OFF!',
  teclas: { andar: 'Move', camera: 'Camera', tapa: 'Slap', soco: 'Punch', simples: 'Simple clones', complexos: 'Complex clones', pausa: 'Pause', mouse: 'Free the mouse' },
  pc: {
    titulo: 'Piranbenja solo (test)', urso: 'Bear', clones: 'Clones', iniciais: 'Clones at start', ajudas: 'Visual helpers',
    recomecar: 'Restart', continuar: 'Resume', clique: 'Click the screen to play', agua: 'Water', resUrso: 'Bear',
    placar: 'Score', vivos: 'Clones', segure: 'hold to make more', grudados: 'stuck on the bear', curtoGrudados: 'stuck', pausa: 'Pause',
  },
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
