import { describe, expect, it } from 'vitest';
import { ariaDe, ATAJOS_DEL_LECTOR, atajo, vigentes } from './atajos';
import { acotar, armarLayout, BORDE, cubre, densidadDe, ENTRE, enCaja, ESCALA_MAX, ESCALA_MIN, escalaAncho, juntarCajas, paginaEn, paginaLeyendo, porcentaje, PUNTO, regionVisible, siguientePaso, ventanaDe } from './geometria';

const A4 = [595, 842];

describe('el lugar de cada página', () => {
  it('ajusta al ancho de la vista y respeta los topes', () => {
    expect(escalaAncho([A4], 595 * PUNTO + 2 * BORDE)).toBeCloseTo(PUNTO);
    expect(escalaAncho([A4, [842, 595]], 842 + 2 * BORDE)).toBeCloseTo(1);
    expect(acotar(100)).toBe(ESCALA_MAX);
    expect(acotar(0)).toBe(ESCALA_MIN);
    expect(porcentaje(PUNTO)).toBe(100);
  });

  it('sube y baja de a un paso', () => {
    expect(porcentaje(siguientePaso(PUNTO, 1))).toBe(110);
    expect(porcentaje(siguientePaso(PUNTO, -1))).toBe(90);
    expect(porcentaje(siguientePaso(1.07 * PUNTO, 1))).toBe(110);
    expect(siguientePaso(ESCALA_MAX, 1)).toBe(ESCALA_MAX);
  });

  it('pone las páginas una abajo de la otra, centradas', () => {
    const l = armarLayout([[100, 200], [50, 100]], 1, 300);
    expect(l.tops).toEqual([BORDE, BORDE + 200 + ENTRE]);
    expect(l.izquierdas).toEqual([100, 125]);
    expect(l.ancho).toBe(300);
    expect(l.alto).toBe(BORDE + 200 + ENTRE + 100 + BORDE);
    // Wider than the view: the whole grows, and it scrolls sideways.
    expect(armarLayout([[400, 200]], 1, 300).ancho).toBe(400 + 2 * BORDE);
  });

  it('deja lugar arriba para las barras que flotan, sin mover nada más', () => {
    const sin = armarLayout([[100, 200], [50, 100]], 1, 300);
    const con = armarLayout([[100, 200], [50, 100]], 1, 300, BORDE, 90);
    expect(con.tops).toEqual(sin.tops.map((t) => t + 90));
    expect(con.alto).toBe(sin.alto + 90);
    expect(con.izquierdas).toEqual(sin.izquierdas);
  });

  it('con Consultron al costado, las páginas quedan donde estaban mientras entran, y si no, se corren lo justo', () => {
    // Without Consultron the view was 700 wide: the 300 page went at 200. With it (300 wide) the view is 400.
    const sin = armarLayout([[300, 200], [200, 100]], 1, 700);
    const con = armarLayout([[300, 200], [200, 100]], 1, 400, BORDE, 0, 300);
    expect(sin.izquierdas).toEqual([200, 250]);
    // Room: 400 - 300 - BORDE = 84 at most to the right of centered (50), so it stops against Consultron.
    expect(con.izquierdas).toEqual([400 - 300 - BORDE, 400 - 300 - BORDE + 50]);
    // A narrow panel beside a wide view: exactly where it was.
    const ancha = armarLayout([[300, 200]], 1, 1000, BORDE, 0, 200);
    expect(ancha.izquierdas[0]).toBe(armarLayout([[300, 200]], 1, 1200).izquierdas[0]);
    // Pages as wide as the view: nothing to keep, they stay centered.
    expect(armarLayout([[400, 200]], 1, 300, BORDE, 0, 300).izquierdas).toEqual([BORDE]);
  });

  it('sabe qué página se lee y cuáles dibujar', () => {
    const l = armarLayout(Array.from({ length: 10 }, () => [100, 100]), 1, 200);
    expect(paginaEn(l.tops, 0)).toBe(0);
    expect(paginaEn(l.tops, l.tops[3] + 1)).toBe(3);
    expect(paginaLeyendo(l, l.tops[4], 90)).toBe(4);
    const [desde, hasta] = ventanaDe(l, l.tops[5], 100, 1);
    expect(desde).toBeLessThanOrEqual(4);
    expect(hasta).toBeGreaterThanOrEqual(6);
    expect(hasta).toBeLessThan(9);
  });
});

describe('las cajas de un resaltado', () => {
  it('junta los pedazos de un mismo renglón y separa los renglones', () => {
    const cajas = juntarCajas([
      [0.1, 0.1, 0.1, 0.02],
      [0.205, 0.1, 0.1, 0.02],
      [0.1, 0.13, 0.3, 0.02],
      [0.6, 0.1, 0.1, 0.02],
    ]);
    expect(cajas).toHaveLength(3);
    expect(cajas[0][0]).toBeCloseTo(0.1);
    expect(cajas[0][2]).toBeCloseTo(0.205);
    expect(cajas[1][0]).toBeCloseTo(0.6);
    expect(cajas[2][1]).toBeCloseTo(0.13);
  });

  it('queda adentro de la página y se toca con un margen', () => {
    const [c] = juntarCajas([[-0.1, 0.95, 0.3, 0.1]]);
    expect(c[0]).toBe(0);
    expect(c[1] + c[3]).toBeCloseTo(1);
    expect(enCaja([0.1, 0.97], c)).toBe(true);
    expect(enCaja([0.5, 0.5], c)).toBe(false);
  });
});

describe('los atajos del lector', () => {
  it('tienen la forma de los del sitio, y aria-keyshortcuts los nombra', () => {
    expect(ATAJOS_DEL_LECTOR.grupo).toBe('En el lector de PDF');
    for (const a of ATAJOS_DEL_LECTOR.lista) {
      expect(Boolean(a.teclas) !== Boolean(a.con)).toBe(true);
      expect((a.teclas ?? a.con).length).toBeGreaterThan(0);
      expect(a.texto).toBeTruthy();
      expect(ariaDe(a)).toMatch(/^[\w+?/=-]+( [\w+?/=-]+)*$/);
    }
    expect(atajo('Buscar en el documento', true)).toBe('Control+F /');
    expect(atajo('Volver al resultado anterior', true)).toBe('Shift+Enter');
    expect(atajo('Ver estos atajos', true)).toBe('Shift+?');
  });

  it('con los de una tecla apagados quedan solo los que andan siempre', () => {
    expect(atajo('Buscar en el documento', false)).toBe('Control+F');
    expect(atajo('Agrandar', false)).toBeUndefined();
    expect(vigentes(false).every((a) => a.siempre)).toBe(true);
    expect(vigentes(false).map(ariaDe)).toContain('Escape');
  });
});

describe('the drawing of a page on a phone', () => {
  it('uses the pixels of the screen while they fit under the tope, and fewer past it', () => {
    expect(densidadDe(400, 560, 2.625, 16e6)).toBe(2.625);
    const d = densidadDe(1900, 2700, 2.625, 5e6);
    expect(d).toBeLessThan(2.625);
    expect(1900 * 2700 * d * d).toBeCloseTo(5e6, -2);
  });

  it('knows the part of a page in view, with a margin, and none when it is out of view', () => {
    const pagina = { left: -100, top: -1000, right: 1900, bottom: 1800 };
    const vista = { left: 0, top: 0, right: 400, bottom: 600 };
    expect(regionVisible(pagina, vista)).toEqual([0.05, 1000 / 2800, 0.25, 1600 / 2800]);
    const [x0, y0, x1, y1] = regionVisible(pagina, vista, 0.25);
    expect(x0).toBe(0);
    expect(y0).toBeCloseTo(850 / 2800);
    expect(x1).toBeCloseTo(0.3);
    expect(y1).toBeCloseTo(1750 / 2800);
    expect(regionVisible({ left: 0, top: 700, right: 400, bottom: 1200 }, vista, 0.5)).toBeNull();
  });

  it('says when a drawn part already holds the one in view', () => {
    expect(cubre([0, 0.2, 0.5, 0.6], [0.1, 0.3, 0.4, 0.5])).toBe(true);
    expect(cubre([0, 0.2, 0.5, 0.6], [0.1, 0.3, 0.4, 0.7])).toBe(false);
  });
});
