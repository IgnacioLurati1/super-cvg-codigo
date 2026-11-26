import { describe, expect, it } from 'vitest';
import { claseDeAhora, nombreDelPdf } from './clase';
import { detectar, pareceTablero, tipoDeColor } from './detectar';
import { aplicar, enderezar, esConvexo, homografia, tamanoDerecho } from './geometria';
import { limpiar, mascaraDeRepasos, remarcar } from './limpiar';
import { escribible } from './pdf';

// A photo drawn by hand: a wall of one color and, on it, a board of four corners (any quadrilateral) with strokes.
function foto({ W = 320, H = 240, pared = [225, 222, 215], pizarron = [38, 74, 58], tiza = [235, 235, 228], esquinas, trazos = true }) {
  const data = new Uint8ClampedArray(W * H * 4);
  const dentro = (x, y) => {
    let signo = 0;
    for (let i = 0; i < 4; i++) {
      const a = esquinas[i];
      const b = esquinas[(i + 1) % 4];
      const z = Math.sign((b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x));
      if (z === 0) continue;
      if (signo === 0) signo = z;
      else if (z !== signo) return false;
    }
    return true;
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let c = dentro(x + 0.5, y + 0.5) ? pizarron : pared;
      // Thin lines of chalk across the board, every 12 rows.
      if (trazos && c === pizarron && y % 12 === 0 && x % 30 < 20) c = tiza;
      data.set([...c, 255], (y * W + x) * 4);
    }
  }
  return { data, width: W, height: H };
}

const cerca = (p, q, tol) => Math.abs(p.x - q.x) <= tol && Math.abs(p.y - q.y) <= tol;

describe('la geometría del pizarrón', () => {
  it('la homografía lleva cada esquina a la suya', () => {
    const de = [{ x: 10, y: 20 }, { x: 300, y: 5 }, { x: 290, y: 200 }, { x: 15, y: 180 }];
    const a = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 0, y: 50 }];
    const h = homografia(de, a);
    de.forEach((p, i) => expect(cerca(aplicar(h, p.x, p.y), a[i], 1e-6)).toBe(true));
  });

  it('cuatro puntos en línea o cruzados no sirven para enderezar', () => {
    expect(esConvexo([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }])).toBe(false);
    expect(esConvexo([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 0 }, { x: 0, y: 1 }])).toBe(false);
    expect(esConvexo([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }])).toBe(true);
  });

  it('el pizarrón derecho tiene el lado más largo de cada par y nunca más que el tope', () => {
    expect(tamanoDerecho([{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 380, y: 100 }, { x: 0, y: 120 }])).toEqual({ ancho: 400, alto: 120 });
    expect(tamanoDerecho([{ x: 0, y: 0 }, { x: 8000, y: 0 }, { x: 8000, y: 2000 }, { x: 0, y: 2000 }], 2400)).toEqual({ ancho: 2400, alto: 600 });
  });

  it('enderezar saca solo lo de adentro de las esquinas', () => {
    const esquinas = [{ x: 40, y: 30 }, { x: 280, y: 50 }, { x: 270, y: 200 }, { x: 50, y: 210 }];
    const img = foto({ esquinas, trazos: false });
    const r = enderezar(img, esquinas, { ancho: 100, alto: 60 });
    // Every pixel is board, none is wall.
    for (let i = 0; i < r.data.length; i += 4) expect(r.data[i + 1]).toBeLessThan(110);
  });
});

describe('dónde está el pizarrón', () => {
  it('verde o negro y blanco, por el color del medio', () => {
    expect(tipoDeColor([38, 74, 58])).toBe('verde');
    expect(tipoDeColor([30, 32, 34])).toBe('verde');
    expect(tipoDeColor([228, 230, 226])).toBe('blanco');
  });

  // The colors of the board in photos of Ignacio's classes (26/11/2026).
  it('un verde pálido bajo las luces del aula sigue siendo verde; un proyector es blanco', () => {
    expect(tipoDeColor([125, 143, 128])).toBe('verde');
    expect(tipoDeColor([137, 154, 137])).toBe('verde');
    expect(tipoDeColor([164, 155, 151])).toBe('blanco');
    expect(tipoDeColor([128, 181, 233])).toBe('blanco');
  });

  it('el pelo o la campera de alguien adelante no es el color de un pizarrón', () => {
    expect(pareceTablero([101, 76, 61])).toBe(false);
    expect(pareceTablero([125, 143, 128])).toBe(true);
    expect(pareceTablero([128, 181, 233])).toBe(true);
    expect(pareceTablero([30, 32, 34])).toBe(true);
  });

  it('con una cabeza en el medio, lo busca más arriba', () => {
    const esquinas = [{ x: 30, y: 20 }, { x: 290, y: 20 }, { x: 290, y: 150 }, { x: 30, y: 150 }];
    const img = foto({ esquinas });
    // A head from the bottom to the middle of the photo.
    for (let y = 90; y < 240; y++) for (let x = 110; x < 210; x++) img.data.set([95, 70, 55, 255], (y * 320 + x) * 4);
    const r = detectar(img);
    expect(r.tipo).toBe('verde');
    expect(r.seguro).toBe(true);
    expect(r.esquinas[0].y * 240).toBeLessThan(28);
    expect(r.esquinas[0].x * 320).toBeLessThan(38);
  });

  it('un pizarrón blanco sobre una pared casi igual: lo encuentra por su marco', () => {
    const esquinas = [{ x: 50, y: 40 }, { x: 270, y: 50 }, { x: 265, y: 195 }, { x: 55, y: 200 }];
    const img = foto({ esquinas, pared: [222, 222, 220], pizarron: [232, 232, 230], tiza: [40, 40, 50] });
    // A thin gray frame around it.
    const marco = foto({ esquinas: esquinas.map((p, i) => ({ x: p.x + [-3, 3, 3, -3][i], y: p.y + [-3, -3, 3, 3][i] })), pared: [222, 222, 220], pizarron: [120, 120, 125], trazos: false });
    const adentro = foto({ esquinas, pared: [0, 0, 0], pizarron: [255, 255, 255], trazos: false });
    for (let i = 0; i < img.data.length; i += 4) if (!adentro.data[i]) img.data.set(marco.data.subarray(i, i + 4), i);
    const r = detectar(img);
    expect(r.tipo).toBe('blanco');
    expect(r.seguro).toBe(true);
    r.esquinas.forEach((p, i) => expect(cerca({ x: p.x * 320, y: p.y * 240 }, esquinas[i], 7)).toBe(true));
  });

  it('un pizarrón verde sacado de costado, con tiza: sus cuatro esquinas', () => {
    const esquinas = [{ x: 40, y: 50 }, { x: 290, y: 30 }, { x: 280, y: 190 }, { x: 30, y: 200 }];
    const r = detectar(foto({ esquinas }));
    expect(r.tipo).toBe('verde');
    expect(r.seguro).toBe(true);
    r.esquinas.forEach((p, i) => expect(cerca({ x: p.x * 320, y: p.y * 240 }, esquinas[i], 6)).toBe(true));
  });

  it('un pizarrón blanco sobre una pared oscura', () => {
    const esquinas = [{ x: 60, y: 40 }, { x: 260, y: 40 }, { x: 260, y: 200 }, { x: 60, y: 200 }];
    const r = detectar(foto({ esquinas, pared: [120, 90, 60], pizarron: [235, 236, 232], tiza: [30, 30, 40] }));
    expect(r.tipo).toBe('blanco');
    expect(r.seguro).toBe(true);
    r.esquinas.forEach((p, i) => expect(cerca({ x: p.x * 320, y: p.y * 240 }, esquinas[i], 6)).toBe(true));
  });

  it('una foto sin pizarrón deja las esquinas en toda la foto, para moverlas', () => {
    const W = 320;
    const H = 240;
    const data = new Uint8ClampedArray(W * H * 4);
    // Narrow bands of very different colors (shelves of books): nothing of one color is big.
    const BANDAS = [[200, 40, 40], [30, 30, 160], [240, 220, 60], [20, 120, 30], [250, 250, 250], [90, 50, 20]];
    for (let i = 0; i < W * H; i++) data.set([...BANDAS[Math.floor((i % W) / 16) % BANDAS.length], 255], i * 4);
    const r = detectar({ data, width: W, height: H });
    expect(r.seguro).toBe(false);
    expect(r.esquinas).toEqual([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]);
  });
});

describe('limpiar', () => {
  // A board with uneven light: darker to the right, with strokes.
  function conLuz(tipo) {
    const W = 200;
    const H = 100;
    const data = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const luz = 1 - (x / W) * 0.4;
        const trazo = y % 10 < 2 && x % 20 < 14;
        const c = tipo === 'blanco' ? (trazo ? [30, 40, 160] : [230, 230, 225]) : trazo ? [225, 225, 215] : [40, 80, 60];
        data.set([...c.map((v) => v * luz), 255], (y * W + x) * 4);
      }
    }
    return { data, width: W, height: H };
  }
  const px = (img, x, y) => Array.from(img.data.slice((y * img.width + x) * 4, (y * img.width + x) * 4 + 3));

  it('un pizarrón blanco queda en blanco parejo y el fibrón azul sigue azul', () => {
    const r = limpiar(conLuz('blanco'), 'blanco', 'hoja');
    for (const x of [15, 100, 195]) px(r, x, 5).forEach((v) => expect(v).toBeGreaterThan(245));
    const [rr, , b] = px(r, 100, 0);
    expect(b).toBeGreaterThan(rr + 60);
  });

  it('un pizarrón verde pasa a hoja: fondo blanco y tiza oscura', () => {
    const r = limpiar(conLuz('verde'), 'verde', 'hoja');
    for (const x of [15, 100, 195]) px(r, x, 5).forEach((v) => expect(v).toBeGreaterThan(240));
    px(r, 5, 0).forEach((v) => expect(v).toBeLessThan(90));
  });

  it('en «Pizarrón» el fondo queda de un solo verde', () => {
    const r = limpiar(conLuz('verde'), 'verde', 'pizarron');
    const a = px(r, 15, 5);
    const b = px(r, 195, 5);
    a.forEach((v, k) => expect(Math.abs(v - b[k])).toBeLessThan(6));
  });

  it('«Sin limpiar» la deja como está', () => {
    const img = conLuz('verde');
    expect(limpiar(img, 'verde', 'original').data).toEqual(img.data);
  });
});

describe('la clase de la foto', () => {
  const clases = [
    { dia: 3, desde: 8 * 60, hasta: 10 * 60 + 15, cursoId: 11, nombre: 'Análisis' },
    { dia: 3, desde: 10 * 60 + 30, hasta: 12 * 60, cursoId: 22, nombre: 'Física' },
    { dia: 3, desde: 14 * 60, hasta: 16 * 60, cursoId: null, extra: 5, nombre: 'Química' },
  ];
  // 26/11/2026 is a Thursday: these are Wednesdays.
  const miercoles = (h, m = 0) => new Date(2026, 10, 25, h, m);

  it('la que está pasando, la que recién terminó o la que está por empezar', () => {
    expect(claseDeAhora(clases, miercoles(9))?.cursoId).toBe(11);
    expect(claseDeAhora(clases, miercoles(10, 20))?.cursoId).toBe(11);
    expect(claseDeAhora(clases, miercoles(10, 25))?.cursoId).toBe(22);
    expect(claseDeAhora(clases, miercoles(12, 25))?.cursoId).toBe(22);
  });

  it('fuera de hora, otro día o una materia que no es del campus: ninguna', () => {
    expect(claseDeAhora(clases, miercoles(13))).toBeNull();
    expect(claseDeAhora(clases, new Date(2026, 10, 26, 9))).toBeNull();
    expect(claseDeAhora(clases, miercoles(15))).toBeNull();
    expect(claseDeAhora([], miercoles(9))).toBeNull();
  });

  it('el PDF lleva el día', () => {
    expect(nombreDelPdf(new Date(2026, 2, 5))).toBe('Pizarrón del 05-03.pdf');
  });
});

describe('el texto del PDF', () => {
  it('solo lo que la letra puede escribir, sin espacios de más', () => {
    const puede = new Set([...'abcdefghijklmnopqrstuvwxyzáé =+()2'].map((c) => c.codePointAt(0)));
    expect(escribible('  área =  ∫ f(x)  ', puede)).toBe('área = ? f(x)');
    expect(escribible('', puede)).toBe('');
  });
});

describe('remarcar la tiza', () => {
  const W = 300;
  const H = 120;
  // A board with grain; a strong line at y 30 and a faint one at y 80, broken into dots (one pixel of three).
  const tablero = () => {
    const fuerza = new Uint8Array(W * H);
    let semilla = 3;
    const azar = () => ((semilla = (semilla * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < fuerza.length; k++) fuerza[k] = azar() * 20;
    for (let x = 20; x < 280; x++) {
      for (let y = 28; y < 33; y++) fuerza[y * W + x] = 240;
      if (x % 3 === 0) for (let y = 79; y < 82; y++) fuerza[y * W + x] = 70;
    }
    return fuerza;
  };
  const media = (f, y0, y1, x0 = 20, x1 = 280) => {
    let s = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) s += f[y * W + x];
    return s / ((y1 - y0) * (x1 - x0));
  };

  it('la tiza punteada sale como una línea', () => {
    const f = tablero();
    remarcar(f, new Uint8Array(W * H * 3), W, H);
    // Joined: no pixel along the line is left as board.
    let hueco = 0;
    for (let x = 22; x < 278; x++) hueco = Math.max(hueco, 70 - f[80 * W + x]);
    expect(hueco).toBeLessThan(15);
  });

  it('el pizarrón vacío queda vacío y la línea fuerte no se engorda de más', () => {
    const f = tablero();
    remarcar(f, new Uint8Array(W * H * 3), W, H);
    expect(media(f, 50, 70)).toBeLessThan(30);
    expect(media(f, 38, 42)).toBeLessThan(40);
  });

  it('un pixel que era pizarrón toma el color de la tiza que lo alcanza', () => {
    const f = tablero();
    const color = new Uint8Array(W * H * 3);
    for (let x = 21; x < 280; x += 3) for (let y = 79; y < 82; y++) color.set([200, 40, 40], (y * W + x) * 3);
    remarcar(f, color, W, H);
    expect([...color.subarray((80 * W + 100) * 3, (80 * W + 100) * 3 + 3)]).toEqual([200, 40, 40]);
  });
});

describe('la tiza débil', () => {
  // A green board: a strong line at y 20, a faint one at y 60 and, far from both, a stain of chalk at (100, 100).
  const W = 200;
  const H = 120;
  const tablero = () => {
    const data = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let c = [40, 80, 60];
        if (x >= 20 && x < 180 && y >= 20 && y < 24) c = [225, 225, 215];
        if (x >= 20 && x < 180 && y >= 60 && y < 63) c = [70, 105, 85];
        if (Math.abs(x - 100) <= 1 && Math.abs(y - 100) <= 1) c = [120, 150, 130];
        data.set([...c, 255], (y * W + x) * 4);
      }
    }
    return { data, width: W, height: H };
  };
  const gris = (img, x, y) => img.data[(y * W + x) * 4 + 1];

  it('con más intensidad la tiza débil sale más oscura y el pizarrón sigue blanco', () => {
    const normal = limpiar(tablero(), 'verde', 'hoja');
    const fuerte = limpiar(tablero(), 'verde', 'hoja', { intensidad: 1 });
    expect(gris(fuerte, 100, 61)).toBeLessThan(gris(normal, 100, 61) - 15);
    expect(gris(fuerte, 100, 40)).toBeGreaterThan(245);
  });

  it('repasada con el dedo, sale solo donde pasó el dedo', () => {
    const repasos = [{ puntos: [[0.1, 61 / H], [0.5, 61 / H]], r: 0.02 }];
    const r = limpiar(tablero(), 'verde', 'hoja', { repasos });
    expect(gris(r, 60, 61)).toBeLessThan(120);
    expect(gris(r, 150, 61)).toBeGreaterThan(200);
    expect(gris(r, 60, 40)).toBeGreaterThan(245);
  });

  it('en birome la mancha suelta se va y la línea queda entera', () => {
    const como = limpiar(tablero(), 'verde', 'hoja');
    const birome = limpiar(tablero(), 'verde', 'hoja', { tiza: 'birome' });
    expect(gris(como, 100, 100)).toBeLessThan(230);
    expect(gris(birome, 100, 100)).toBeGreaterThan(240);
    for (const x of [30, 100, 170]) expect(gris(birome, x, 21)).toBeLessThan(60);
  });

  it('borrar con el dedo saca lo que hay abajo, también en un pizarrón blanco', () => {
    const repasos = [{ puntos: [[0.2, 21 / H], [0.4, 21 / H]], r: 0.03, borra: true }];
    const r = limpiar(tablero(), 'verde', 'hoja', { repasos });
    expect(gris(r, 60, 21)).toBeGreaterThan(245);
    expect(gris(r, 150, 21)).toBeLessThan(60);
    const blanco = limpiar(tablero(), 'blanco', 'hoja', { repasos });
    expect(gris(blanco, 60, 21)).toBe(255);
  });

  it('el grosor de la birome engorda o afina el trazo', () => {
    const oscuros = (img) => {
      let n = 0;
      for (let y = 0; y < H; y++) if (gris(img, 100, y) < 128) n++;
      return n;
    };
    const [fino, medio, grueso] = [0, 0.5, 1].map((grosor) => oscuros(limpiar(tablero(), 'verde', 'hoja', { tiza: 'birome', grosor })));
    expect(fino).toBeLessThan(medio);
    expect(grueso).toBeGreaterThan(medio);
  });

  it('los repasos raros no rompen nada', () => {
    expect(mascaraDeRepasos(null, W, H)).toBeNull();
    const m = mascaraDeRepasos([{ puntos: 'x' }, { puntos: [[NaN, 1], [0.5, 0.5]], r: 9 }], W, H);
    // The width is held to 5 % of the longer side: 10 pixels here.
    expect(m[60 * W + 100]).toBe(1);
    expect(m[60 * W + 115]).toBe(0);
  });
});
