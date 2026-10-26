# LUTCHA!!! UrsoBura VS Piranbenja

**Teste das patas:** https://gaburadigital.github.io/lutcha/

<img src="docs/qrcode.png" alt="QR code do link do teste" width="160">

> O Quest 3S não lê QR codes sozinho: o QR serve para abrir o link no celular ou com um app leitor de QR da loja do Quest. No óculos, o mais rápido é digitar o link no navegador.

Jogo de luta non-sense do **Gaburaverso**: o **UrsoBura**, gigante, luta no **Meta Quest 3S** (WebXR) com golpes de anime feitos com o corpo; o **Piranbenja**, pequeno, luta no **PC** com clones de água, programação por blocos e equipamentos. Vence quem jogar o outro para fora do ringue.

> **Em desenvolvimento.** Por enquanto o repositório tem só a página de **teste das patas**: as mãos do UrsoBura (e do Gabura, no modo humano) presas aos controles do Quest, com o soco furadeira, o sabre laser e as agulhas.

Acompanhe o desenvolvimento no [DIARIO.md](DIARIO.md).

## Como testar no Quest

1. No navegador do Quest, abra o link acima.
2. Aperte **Entrar no VR**.
3. O painel à sua frente mostra os botões: **A** troca urso e Gabura, **B** engatilha o soco furadeira, **X** liga o sabre laser, **Y** carrega as agulhas, o analógico direito muda o tamanho da pata.

No computador, a mesma página mostra as patas para girar com o mouse.

## Rodar no computador

```bash
npm install
npm run dev          # abre em http://localhost:5173
npm run build        # gera dist/ (o GitHub Actions publica sozinho a cada push)
```

Para testar no Quest pelo cabo USB: depuração remota em `chrome://inspect` no Chrome do computador.

### Testes automáticos

Rodam a página no Chrome sem janela (Playwright), com os controles do Quest simulados, e tiram fotos em `testes/fotos/`.

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
