// Configuração do Vite. "base: './'" faz o site funcionar no GitHub Pages com qualquer nome de repositório.
// Duas páginas: o protótipo (index.html) e o teste das patas (patas.html).
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    chunkSizeWarningLimit: 4000,
    rollupOptions: { input: { index: 'index.html', patas: 'patas.html' } },
  },
});
