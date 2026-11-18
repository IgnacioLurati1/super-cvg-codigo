import { describe, expect, it, vi } from 'vitest';
import { anguloCerca, avanzar, crearSuave, desde, pasoSuave } from './suave';

const CUADRO = 1 / 60;

// Steps one number at 60 frames per second, `segundos` long.
function correr(x, v, objetivo, segundos) {
  const camino = [];
  for (let t = 0; t < segundos - 1e-9; t += CUADRO) {
    [x, v] = pasoSuave(x, v, objetivo, CUADRO);
    camino.push(x);
  }
  return { x, v, camino };
}

// A clock and frames by hand: `cuadros(n)` runs n frames of 1/60 s.
function relojDePrueba() {
  let ahora = 0;
  let pendiente = null;
  return {
    ahora: () => ahora,
    pedir: (fn) => {
      pendiente = fn;
      return 1;
    },
    cancelar: () => {
      pendiente = null;
    },
    cuadros(n) {
      for (let i = 0; i < n && pendiente; i++) {
        ahora += 1000 / 60;
        const fn = pendiente;
        pendiente = null;
        fn();
      }
    },
  };
}

describe('pasoSuave', () => {
  it('arrives in about a third of a second, softly and without going past', () => {
    const { camino } = correr(0, 0, 100, 0.6);
    const en = (s) => camino[Math.round(s * 60) - 1];
    // Soft start: a plain exponential with the same pace would be past 60 here.
    expect(en(0.05)).toBeLessThan(35);
    expect(en(0.15)).toBeGreaterThan(50);
    expect(en(0.35)).toBeGreaterThan(99);
    expect(Math.max(...camino)).toBeLessThanOrEqual(100);
    camino.slice(1).forEach((x, i) => expect(x).toBeGreaterThanOrEqual(camino[i]));
  });

  it('a new target mid-way keeps the place and the speed it had, and arrives there', () => {
    const ida = correr(0, 0, 100, 0.1);
    const [x, v] = pasoSuave(ida.x, ida.v, 300, CUADRO);
    expect(x).toBeGreaterThan(ida.x);
    expect(x - ida.x).toBeLessThan(25);
    expect(v).toBeGreaterThan(0);
    expect(correr(x, v, 300, 0.5).x).toBeCloseTo(300, 0);
  });

  it('does not run away with a long frame', () => {
    const [x] = pasoSuave(0, 0, 100, 2);
    expect(x).toBeGreaterThan(0);
    expect(x).toBeLessThanOrEqual(100);
  });
});

describe('anguloCerca', () => {
  const grados = (g) => (g * Math.PI) / 180;
  it('goes the short way round', () => {
    expect(anguloCerca(grados(350), grados(10))).toBeCloseTo(grados(370));
    expect(anguloCerca(grados(10), grados(350))).toBeCloseTo(grados(-10));
    expect(anguloCerca(grados(720 + 30), grados(40))).toBeCloseTo(grados(760));
  });
});

describe('avanzar', () => {
  it('glides a zoom in proportion and lands exactly on the target', () => {
    let estado = desde({ cx: 0, cy: 0, z: 1 }, ['z']);
    const objetivo = { cx: 200, cy: -100, z: 4 };
    const opciones = { logs: ['z'], eps: { cx: 0.5, cy: 0.5, z: 0.001 } };
    let r = avanzar(estado, objetivo, 0.1, opciones);
    // A third of the way in logarithms is a zoom between 1 and 2, not near 2.5.
    expect(r.vista.z).toBeGreaterThan(1);
    expect(r.vista.z).toBeLessThan(2.5);
    expect(r.listo).toBe(false);
    for (let i = 0; i < 60 && !r.listo; i++) {
      estado = r.estado;
      r = avanzar(estado, objetivo, CUADRO, opciones);
    }
    expect(r.listo).toBe(true);
    expect(r.vista).toEqual(objetivo);
  });

  it('turns an angle the short way', () => {
    const r = avanzar(desde({ giro: 6.1 }), { giro: 0.1 }, 0.05, { angulos: ['giro'], eps: { giro: 0.001 } });
    expect(r.vista.giro).toBeGreaterThan(6.1);
  });
});

describe('crearSuave', () => {
  const armar = (extra = {}) => {
    const reloj = relojDePrueba();
    const vistas = [];
    let actual = { top: 0 };
    const suave = crearSuave({
      aplicar: (v) => {
        actual = v;
        vistas.push(v.top);
      },
      leer: () => actual,
      eps: { top: 0.5 },
      reloj,
      menos: () => false,
      ...extra,
    });
    return { reloj, vistas, suave, ver: () => actual };
  };

  it('glides over frames and stops once there', () => {
    const { reloj, vistas, suave, ver } = armar();
    suave.ir({ top: 500 });
    expect(vistas).toEqual([]);
    reloj.cuadros(5);
    expect(ver().top).toBeGreaterThan(0);
    expect(ver().top).toBeLessThan(500);
    reloj.cuadros(60);
    expect(ver().top).toBe(500);
    expect(suave.andando).toBe(false);
  });

  it('takes the new place mid-way without a jump back', () => {
    const { reloj, vistas, suave, ver } = armar();
    suave.ir({ top: 500 });
    reloj.cuadros(6);
    const antes = ver().top;
    suave.ir({ top: 800 });
    reloj.cuadros(1);
    expect(ver().top).toBeGreaterThan(antes);
    reloj.cuadros(60);
    expect(ver().top).toBe(800);
    vistas.slice(1).forEach((y, i) => expect(y).toBeGreaterThanOrEqual(vistas[i]));
  });

  it('jumps a long way at once, with its fade', () => {
    const alSaltar = vi.fn();
    const { suave, ver } = armar({ saltar: (a, b) => Math.abs(a.top - b.top) > 1000, alSaltar });
    suave.ir({ top: 5000 });
    expect(ver().top).toBe(5000);
    expect(alSaltar).toHaveBeenCalledTimes(1);
  });

  it('goes at once with less motion, or with nothing to start from', () => {
    const menos = armar({ menos: () => true });
    menos.suave.ir({ top: 300 });
    expect(menos.ver().top).toBe(300);
    const sinLugar = armar({ leer: () => null });
    sinLugar.suave.ir({ top: 300 });
    expect(sinLugar.ver().top).toBe(300);
  });

  it('stops where it is when told, and goes to the end when the page hides', () => {
    const { reloj, suave, ver } = armar();
    suave.ir({ top: 500 });
    reloj.cuadros(3);
    suave.parar();
    const quieto = ver().top;
    reloj.cuadros(30);
    expect(ver().top).toBe(quieto);
    suave.ir({ top: 900 });
    reloj.cuadros(2);
    suave.terminar();
    expect(ver().top).toBe(900);
    expect(suave.andando).toBe(false);
  });
});
