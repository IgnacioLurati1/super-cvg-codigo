import { afterEach, describe, expect, it, vi } from 'vitest';
import { puedeDictar, textoParaDecir } from './voz';

describe('textoParaDecir', () => {
  it('sin números de fuente, marcas ni código, y las fórmulas como texto', () => {
    const texto = `<think>x</think>Una **cola** es \`FIFO\` [1, 2].\n\n- Con ${String.raw`$\rho = \lambda / \mu$`} [3].\n\n\`\`\`python\nprint(1)\n\`\`\``;
    expect(textoParaDecir(texto)).toBe('Una cola es FIFO.\n\nCon ρ = λ / μ.\n\nHay un bloque de código.');
  });
});

describe('puedeDictar', () => {
  afterEach(() => {
    delete window.SpeechRecognition;
  });

  it('solo si el navegador reconoce la voz en la compu', async () => {
    expect(await puedeDictar()).toBeNull();
    window.SpeechRecognition = class {};
    expect(await puedeDictar(), 'sin available no se sabe si es local').toBeNull();
    window.SpeechRecognition.available = vi.fn(async () => 'available');
    expect(await puedeDictar()).toBe('listo');
    expect(window.SpeechRecognition.available).toHaveBeenCalledWith({ langs: ['es-AR'], processLocally: true });
    window.SpeechRecognition.available = async () => 'downloadable';
    expect(await puedeDictar()).toBe('bajar');
    window.SpeechRecognition.available = async () => 'unavailable';
    expect(await puedeDictar()).toBeNull();
  });
});
