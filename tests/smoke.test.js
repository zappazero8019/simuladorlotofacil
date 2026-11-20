import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const pkg = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);

describe('Fase 0 - estrutura inicial', () => {
  it('define os scripts de desenvolvimento', () => {
    expect(pkg.scripts).toMatchObject({
      dev: 'vite',
      build: 'vite build',
      preview: 'vite preview',
      test: 'vitest run',
    });
  });

  it('registra as dependências da estrutura', () => {
    expect(pkg.dependencies).toHaveProperty('three');
    expect(pkg.devDependencies).toHaveProperty('vite');
    expect(pkg.devDependencies).toHaveProperty('vitest');
  });
});
