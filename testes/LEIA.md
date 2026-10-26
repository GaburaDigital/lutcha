# Testes automáticos (computador)

Rodam a página no Chrome sem janela (Playwright), com os controles do Quest simulados, e tiram fotos em `testes/fotos/`.

```bash
pip install playwright && python3 -m playwright install chromium
python3 testes/rodar_todos.py     # monta, liga o servidor uma vez, roda tudo e desliga no fim
python3 testes/teste_patas.py     # só o teste das patas (precisa de npm run build antes)
```

| Arquivo | O que confere |
|---|---|
| `teste_patas.py` | patas e mãos humanas com o Quest simulado: poses do gatilho e do grip, escala do mundo (urso e humano), soco furadeira (carga e vibração crescente), sabre laser nas pontas e nos nós, agulhas 6×, relógio na esquerda, tamanho pelo analógico, sem erros no console |
