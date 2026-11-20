import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Caminhos relativos permitem publicar em subdiretório sem quebrar assets.
  base: './',
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/**/*.test.js'],
  },
});
