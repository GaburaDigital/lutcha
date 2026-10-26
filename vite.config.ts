// Configuração do Vite. "base: './'" faz o site funcionar no GitHub Pages com qualquer nome de repositório.
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 1500 },
});
