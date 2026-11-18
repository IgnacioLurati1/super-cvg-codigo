import { beforeEach, describe, expect, it } from 'vitest';
import { anotarVisto, olvidarVistos, ultimoVisto, vistos } from './vistos';

const ANA = 'a1b2c3d4e5f60718';

describe('lo ya visto de una sesión, en esta pestaña', () => {
  beforeEach(() => sessionStorage.clear());

  it('sobrevive a recargar, por persona', () => {
    anotarVisto(ANA, 'chatAvisado', '0a1b2c3d4e5f');
    anotarVisto(ANA, 'salidasVistas', ['r1:1700000000000', 'r1:1700000000000', 'r2:1700000000500']);
    expect(ultimoVisto(ANA, 'chatAvisado')).toBe('0a1b2c3d4e5f');
    expect(vistos(ANA, 'salidasVistas')).toEqual(['r1:1700000000000', 'r2:1700000000500']);
    // Another person (another session, or a duplicated tab): nothing seen.
    expect(ultimoVisto('ffffffffffffffff', 'chatAvisado')).toBeNull();
    anotarVisto('ffffffffffffffff', 'chatLeido', 'abc');
    expect(ultimoVisto(ANA, 'chatAvisado')).toBeNull();
  });

  it('guarda solo ids, con tope, y salir lo borra', () => {
    anotarVisto(ANA, 'salidasAvisadas', Array.from({ length: 40 }, (_, i) => `r1:${i}`));
    expect(vistos(ANA, 'salidasAvisadas')).toHaveLength(24);
    anotarVisto(ANA, 'chatLeido', '<b>no</b>');
    expect(ultimoVisto(ANA, 'chatLeido')).toBeNull();
    sessionStorage.setItem('cl.envivo.vistos', '{roto');
    expect(vistos(ANA, 'salidasAvisadas')).toEqual([]);
    anotarVisto(ANA, 'chatLeido', 'abc');
    olvidarVistos();
    expect(ultimoVisto(ANA, 'chatLeido')).toBeNull();
  });
});
