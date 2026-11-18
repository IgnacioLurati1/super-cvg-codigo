import { describe, expect, it } from 'vitest';
import { INSTRUMENTOS } from './instrumentos.fixture';
import { derEnTexto, sanearDer } from './modelo';
import { derParaLeer } from './paraLeer';

describe('el DER como lo lee Consultron', () => {
  const texto = derEnTexto(sanearDer(INSTRUMENTOS));
  const leido = derParaLeer(texto);

  it('el alquiler de instrumentos entero, en palabras y sin el JSON', () => {
    expect(texto.length).toBeGreaterThan(8000);
    expect(leido.length).toBeLessThan(8000);
    expect(leido).not.toMatch(/"x":|"id":/);
    expect(leido).toContain('Entidades:');
    expect(leido).toMatch(/^- persona: id \[identificador\]/m);
    expect(leido).toMatch(/^- musico_alquiler: musico 1:1, alquiler 0:N/m);
    expect(leido).toContain('Pasaje a tablas');
    expect(leido).toMatch(/^CF\(id_musico\) -> persona\(id\) NN$/m);
  });

  it('lo que no es un DER queda como está', () => {
    expect(derParaLeer('no es json')).toBe('no es json');
    expect(derParaLeer('')).toBe('');
  });
});
