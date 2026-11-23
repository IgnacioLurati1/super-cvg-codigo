import { describe, expect, it } from 'vitest';
import { queDibujar } from './fondo';
import { azar, aRgb, crearRuido } from './ruido';

const base = { potente: 'si', estilo: 'original', contraste: 'normal', movimiento: 'sistema', mueve: 'si', calidad: 'baja', paleta: null, tema: 'oscuro' };

describe('queDibujar', () => {
  it('sin versión potente no dibuja nada; en cualquier estilo y con alto contraste, sí', () => {
    expect(queDibujar({ ...base, potente: 'no' })).toBeNull();
    for (const estilo of ['hoja', 'plano', 'pizarron', 'batman', 'profesional']) expect(queDibujar({ ...base, estilo })).not.toBeNull();
    expect(queDibujar({ ...base, estilo: 'batman', paleta: 'lavanda', tema: 'oscuro' }).tema).toBe('lavandaNoche');
    expect(queDibujar({ ...base, contraste: 'alto' })).not.toBeNull();
    expect(queDibujar({ ...base, mueve: 'no' })).toBeNull();
  });

  it('el movimiento se apaga con menos animaciones, del sitio o del dispositivo', () => {
    expect(queDibujar(base)).toEqual({ tema: 'oscuro', calidad: null, mueve: true });
    expect(queDibujar({ ...base, movimiento: 'reducido' })).toBeNull();
    expect(queDibujar({ ...base, movimiento: 'ninguno' })).toBeNull();
    expect(queDibujar(base, true)).toBeNull();
    // Still, high quality paints the sky anyway.
    expect(queDibujar({ ...base, calidad: 'alta', movimiento: 'ninguno' })).toEqual({ tema: 'oscuro', calidad: 'alta', mueve: false });
    expect(queDibujar({ ...base, calidad: 'otra', mueve: 'no' })).toBeNull();
  });

  it('el tema es la paleta, o claro u oscuro', () => {
    expect(queDibujar({ ...base, paleta: 'cosmico' }).tema).toBe('cosmico');
    expect(queDibujar({ ...base, tema: 'claro' }).tema).toBe('claro');
  });
});

describe('ruido', () => {
  it('la misma semilla da lo mismo, y entre 0 y 1', () => {
    const a = azar(3);
    const b = azar(3);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    const n = crearRuido(5);
    for (let i = 0; i < 200; i++) {
      const v = n.capas(i * 0.37, i * 0.11, 5);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    expect(crearRuido(5).ruido(1.5, 2.5)).toBe(n.ruido(1.5, 2.5));
  });

  it('lee los colores como los da el navegador', () => {
    expect(aRgb('#0b0717')).toEqual([11, 7, 23]);
    expect(aRgb(' rgb(11, 7, 23)')).toEqual([11, 7, 23]);
    expect(aRgb('rgb(11 7 23)')).toEqual([11, 7, 23]);
    expect(aRgb('nada')).toEqual([0, 0, 0]);
  });
});

describe('calidad del fondo', () => {
  it('el interruptor de antes, prendido, es «media»; cualquier otra cosa, «baja»', async () => {
    const { normalizar } = await import('../ajustes');
    expect(normalizar({ fondoDetalle: true }).fondoCalidad).toBe('media');
    expect(normalizar({ fondoCalidad: 'alta', fondoDetalle: true }).fondoCalidad).toBe('alta');
    expect(normalizar({ fondoCalidad: 'maxima' }).fondoCalidad).toBe('media');
    expect(normalizar({}).fondoCalidad).toBe('media');
  });
});

describe('ultra', () => {
  it('se dibuja, y cada tema con partículas tiene su capa viva', async () => {
    expect(queDibujar({ ...base, calidad: 'ultra', mueve: 'no' })).toEqual({ tema: 'oscuro', calidad: 'ultra', mueve: false });
    const { TEMAS_CON_VIDA } = await import('./vida');
    const { TEMAS_CON_PARTICULAS } = await import('./particulas');
    expect([...TEMAS_CON_VIDA].sort()).toEqual([...TEMAS_CON_PARTICULAS].sort());
  });
});

describe('el filtro del fondo', () => {
  it('se guarda dentro de sus límites, en pasos de 5', async () => {
    const { normalizar } = await import('../ajustes');
    expect(normalizar({}).fondoFiltro).toBe('ninguno');
    expect(normalizar({ fondoFiltro: 'invertir' }).fondoFiltro).toBe('ninguno');
    expect(normalizar({ fondoIntensidad: 37 }).fondoIntensidad).toBe(35);
    expect(normalizar({ fondoIntensidad: 400 }).fondoIntensidad).toBe(100);
    expect(normalizar({ fondoIntensidad: '80' }).fondoIntensidad).toBe(60);
    expect(normalizar({ fondoTono: 359 }).fondoTono).toBe(355);
    expect(normalizar({ fondoTono: -20 }).fondoTono).toBe(0);
    expect(normalizar({}).fondoDesenfoque).toBe(0);
    expect(normalizar({ fondoDesenfoque: 101 }).fondoDesenfoque).toBe(100);
    expect(normalizar({ fondoFiltro: 'desenfocado' }).fondoFiltro).toBe('ninguno');
  });
});
