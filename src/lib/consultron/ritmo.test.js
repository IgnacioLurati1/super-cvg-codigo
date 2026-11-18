import { describe, expect, it } from 'vitest';
import { TROZO, repartirLectura, respiroTras } from './ritmo.js';

// web-llm's pipeline, as far as this leans on it.
function tuboDeMentira({ trozo = 1024 } = {}) {
  const pasos = [];
  return {
    pasos,
    prefillChunkSize: trozo,
    device: { sync: async () => { pasos.push('placa libre'); } },
    async embedAndForward(datos, largo) {
      pasos.push(`lee ${largo}`);
      return { logits: largo, de: this };
    },
  };
}

describe('el ritmo de Consultron en la placa de video', () => {
  it('el respiro crece con lo que tardó el trabajo, entre un mínimo y un tope', () => {
    expect(respiroTras(0)).toBe(15);
    expect(respiroTras(43)).toBe(15);
    expect(respiroTras(200)).toBe(40);
    expect(respiroTras(480)).toBe(96);
    expect(respiroTras(5000)).toBe(300);
    expect(respiroTras(NaN)).toBe(15);
  });

  it('la pregunta se lee en pedazos chicos: espera a la placa y respira después de cada uno', async () => {
    const tubo = tuboDeMentira();
    const reloj = [0, 200, 1000, 1010];
    const esperas = [];
    expect(repartirLectura(tubo, { esperar: async (ms) => { esperas.push(ms); tubo.pasos.push(`respira ${ms}`); }, ahora: () => reloj.shift() })).toBe(true);
    expect(tubo.prefillChunkSize).toBe(TROZO);
    const salida = await tubo.embedAndForward(['a'], 64);
    // What web-llm gave back, with its own `this`.
    expect(salida).toEqual({ logits: 64, de: tubo });
    await tubo.embedAndForward(['b'], 20);
    expect(tubo.pasos).toEqual(['lee 64', 'placa libre', 'respira 40', 'lee 20', 'placa libre', 'respira 15']);
    expect(esperas).toEqual([40, 15]);
  });

  it('si la lectura falla, la falla sale igual y no queda esperando', async () => {
    const tubo = tuboDeMentira();
    tubo.embedAndForward = async () => { throw new Error('sin memoria'); };
    const esperas = [];
    repartirLectura(tubo, { esperar: async (ms) => { esperas.push(ms); } });
    await expect(tubo.embedAndForward([], 3)).rejects.toThrow('sin memoria');
    expect(esperas).toEqual([]);
  });

  it('con otra versión de web-llm, o con pedazos que ya son chicos, no toca nada', () => {
    expect(repartirLectura(undefined)).toBe(false);
    expect(repartirLectura({ prefillChunkSize: 1024 })).toBe(false);
    expect(repartirLectura({ prefillChunkSize: 1024, embedAndForward: async () => {} })).toBe(false);
    const chico = tuboDeMentira({ trozo: 32 });
    const lectura = chico.embedAndForward;
    expect(repartirLectura(chico)).toBe(false);
    expect(chico.prefillChunkSize).toBe(32);
    expect(chico.embedAndForward).toBe(lectura);
  });
});
