# LUTCHA!!! UrsoBura VS Piranbenja

**Protótipo:** https://gaburadigital.github.io/lutcha/

<img src="docs/qrcode.png" alt="QR code do link do teste" width="160">

> O Quest 3S não lê QR codes sozinho: o QR serve para abrir o link no celular ou com um app leitor de QR da loja do Quest. No óculos, o mais rápido é digitar o link no navegador.

Jogo de luta non-sense do **Gaburaverso**: o **UrsoBura**, gigante, luta no **Meta Quest 3S** (WebXR) com golpes de anime feitos com o corpo; o **Piranbenja**, pequeno, luta no **PC** com clones de água, programação por blocos e equipamentos. Vence quem jogar o outro para fora do ringue.

> **Em desenvolvimento.** Por enquanto o repositório tem o **protótipo cinza** (formas simples, sem arte final) e a página de **teste das patas**.

Acompanhe o desenvolvimento no [DIARIO.md](DIARIO.md).

## O que tem no menu

| Opção | Onde | O que faz |
| --- | --- | --- |
| **Piranbenja solo (PC)** | computador | Sem internet: você contra o urso do jogo (parado, bobo ou ofensivo). Esc abre as opções. |
| **Piranbenja (PC)** | computador | Cria a sala e mostra o código de 5 letras. Enquanto o urso não entra, luta contra um urso de treino. |
| **UrsoBura (Quest)** | Meta Quest | Digite o código da sala, aperte **Conectar** e depois **Entrar no VR**. |
| **Solo contra os clones** | Meta Quest | Luta sem internet: o original e os clones são controlados pelo jogo. |
| **Teste das patas** | Quest ou computador | As patas do urso e a mão do Gabura, com soco furadeira, sabre laser e agulhas. |

O PC e o Quest precisam estar **no mesmo Wi-Fi**. A internet só é usada para os dois se acharem; a luta passa direto entre eles.

### Controles do protótipo

**PC (Piranbenja):** W A S D anda · clique na tela para prender o mouse e girar a câmera (Alt solta) · clique esquerdo dá **tapa** · clique direito dá **soco** · segure **Q** para clones simples ou **E** para clones complexos (quanto mais tempo, mais clones; alguns simples viram armadilhas de morder). Criar clones enquanto você cai do ringue te salva (de 8 em 8 s) · Esc pausa no solo. O anel no chão marca o original (só o PC vê). A faixa de teclas embaixo da tela acende quando você aperta.

**Quest (UrsoBura):** mova os braços para bater. Punho fechado (gatilho + grip) é **soco**: para frente empurra, de lado faz rolar, para cima é gancho e para baixo é martelada. Mão aberta é **arranhão** (de lado) ou **estocada** (reta para frente). Feche a mão devagar perto de um Piranbenja para **agarrar** e solte no meio do movimento para **arremessar**. Abaixo do ombro, o braço do urso estica para alcançar o chão. Analógico esquerdo anda, analógico direito gira 30°. Se os Piranbenjas fizerem o urso decolar, a câmera voa junto; nas opções dá para trocar por escurecer. Para ver resistência, aura e placar, olhe para o relógio no pulso esquerdo.

**Solo contra os clones (teste do urso):** antes de entrar no VR, escolha na página como os clones agem (parados, andando à toa, cautelosos ou ofensivos), quantos são e se começam em formação (torre, pirâmide, muralha ou fila). Dentro do VR, **segure Y por 1 s** para pausar e mudar as opções.

**Teste das patas:** **A** troca urso e Gabura, **B** engatilha o soco furadeira, **X** liga o sabre laser, **Y** carrega as agulhas, o analógico direito muda o tamanho da pata.

> A página tem cerca de 1,9 MB compactada, porque leva junto a física (Rapier). Depois da primeira visita, abre mais rápido.

## Rodar no computador

```bash
npm install
npm run dev          # abre em http://localhost:5173
                     # dica: ?modo=pc&canal=local e ?modo=quest&canal=local em duas abas
                     # do mesmo navegador conectam sem internet
npm run build        # gera dist/ (o GitHub Actions publica sozinho a cada push)
```

Para testar no Quest pelo cabo USB: depuração remota em `chrome://inspect` no Chrome do computador.

### Testes automáticos

Rodam as páginas no Chrome sem janela (Playwright), com os controles do Quest simulados, e tiram fotos em `testes/fotos/`. Conferem a física da luta (golpes, boliche, agarrar, combo), a rede entre PC e Quest em duas abas e as patas.

```bash
pip install playwright && python3 -m playwright install chromium
python3 testes/rodar_todos.py
```

Os testes ligam e desligam o servidor sozinhos: nada fica rodando depois deles.

## Licença

O **código** deste projeto está sob a licença MIT (veja `LICENSE`).

O **logo, o nome Gabura, os personagens e a arte** não estão incluídos na licença MIT:
são de uso reservado do Gabura Digital. Você pode estudar e reutilizar o código,
mas não use a marca nem os personagens em outros projetos sem autorização.
