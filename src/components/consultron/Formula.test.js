import katex from 'katex';
import { describe, expect, it } from 'vitest';
import { dibujar } from './Formula';

describe('dibujar', () => {
  it('una fórmula queda en MathML, sin estilos ni letras de afuera', () => {
    const html = dibujar(katex, String.raw`P(X=k) = \frac{e^{-\lambda} \lambda^k}{k!}`, true);
    expect(html).toContain('<math');
    expect(html).toContain('<mfrac>');
    expect(html).toContain('λ');
    expect(html).not.toMatch(/<link|<style|url\(/);
  });

  it('una fórmula con el punto del medio y sin LaTeX también se dibuja', () => {
    expect(dibujar(katex, 'CT(Q) = D/Q · C + Q/2 · (C · i)/D', true)).toContain('<math');
    expect(dibujar(katex, 'Q(t)', false)).toContain('<math');
  });

  it('un LaTeX roto no se dibuja', () => {
    expect(dibujar(katex, String.raw`\frac{1}{`, false)).toBeNull();
  });

  it('nada que lleve afuera ni HTML de la respuesta', () => {
    expect(dibujar(katex, String.raw`\href{https://ejemplo.com}{x}`, false) ?? '').not.toContain('ejemplo.com"');
    expect(dibujar(katex, '<img src=x onerror=alert(1)>', false) ?? '').not.toContain('<img');
  });
});
