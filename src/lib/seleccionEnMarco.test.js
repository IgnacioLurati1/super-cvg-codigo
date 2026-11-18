import { describe, expect, it } from 'vitest';
import { lugarDeBarra, seleccionDicha, textoMarcado, TOPE_MARCADO } from './seleccionEnMarco';

describe('lo seleccionado en un resumen HTML', () => {
  it('es texto plano, sin espacios de más y con tope', () => {
    expect(textoMarcado('  Un   párrafo\n\n con\tsaltos  ')).toBe('Un párrafo con saltos');
    expect(textoMarcado('<b>negrita</b>')).toBe('<b>negrita</b>');
    expect(textoMarcado('a'.repeat(TOPE_MARCADO + 50))).toHaveLength(TOPE_MARCADO);
    expect(textoMarcado(null)).toBe('');
    expect(textoMarcado({ toString: () => 'x' })).toBe('');
    expect(textoMarcado('   ')).toBe('');
  });
});

describe('lo seleccionado que cuenta el lector de un resumen con scripts', () => {
  const bien = { tipo: 'visor-seleccion', texto: ' Un  semáforo\n', cajas: [[10, 20, 110, 40], [10, 60, 80, 80]] };

  it('da el texto y sus cajas como las de un rango', () => {
    expect(seleccionDicha(bien)).toEqual({
      texto: 'Un semáforo',
      primera: { left: 10, top: 20, right: 110, bottom: 40, width: 100, height: 20 },
      ultima: { left: 10, top: 60, right: 80, bottom: 80, width: 70, height: 20 },
    });
    expect(seleccionDicha({ ...bien, texto: 'a'.repeat(TOPE_MARCADO + 9) }).texto).toHaveLength(TOPE_MARCADO);
  });

  it('otro mensaje no es suyo', () => {
    for (const d of [null, undefined, 'visor-seleccion', 3, [], { tipo: 'visor-listo' }, { tipo: 'resumen', html: '' }]) expect(seleccionDicha(d)).toBeUndefined();
  });

  it('sin nada marcado, o con algo que no sirve, no hay barra', () => {
    const malos = [
      { ...bien, texto: '' },
      { ...bien, texto: '   ' },
      { ...bien, texto: 42 },
      { ...bien, texto: { toString: () => 'x' } },
      { ...bien, cajas: [] },
      { ...bien, cajas: [[1, 2, 3, 4]] },
      { ...bien, cajas: [[1, 2, 3, 4], [1, 2, 3, 4], [1, 2, 3, 4]] },
      { ...bien, cajas: 'nada' },
      { ...bien, cajas: [[1, 2, 3], [1, 2, 3, 4]] },
      { ...bien, cajas: [[1, 2, 3, '4'], [1, 2, 3, 4]] },
      { ...bien, cajas: [[1, 2, 3, NaN], [1, 2, 3, 4]] },
      { ...bien, cajas: [[1, 2, Infinity, 4], [1, 2, 3, 4]] },
      { ...bien, cajas: [[1, 2, 3, 4], [1, 2, 3, 1e9]] },
      { ...bien, cajas: [[50, 2, 3, 4], [1, 2, 3, 4]] },
      { ...bien, cajas: [[1, 40, 3, 4], [1, 2, 3, 4]] },
      { ...bien, cajas: [{ 0: 1, 1: 2, 2: 3, 3: 4, length: 4 }, [1, 2, 3, 4]] },
    ];
    for (const d of malos) expect(seleccionDicha(d)).toBeNull();
  });
});

describe('dónde va «Preguntar»', () => {
  const marco = { top: 100, left: 20, width: 800, height: 600 };
  const caja = { top: 60, left: 0, width: 840, height: 700 };
  const linea = (top, left = 50) => ({ top, bottom: top + 20, left, right: left + 300 });

  it('arriba de la primera línea, en el espacio de la caja', () => {
    expect(lugarDeBarra({ marco, caja, primera: linea(200), ultima: linea(260) })).toEqual({ left: 70, top: 40 + 200 - 44 - 8 });
  });

  it('sin lugar arriba, abajo de la última; sin lugar en ninguno, arriba de todo sobre el texto', () => {
    expect(lugarDeBarra({ marco, caja, primera: linea(10), ultima: linea(60) })).toEqual({ left: 70, top: 40 + 80 + 8 });
    expect(lugarDeBarra({ marco, caja, primera: linea(10), ultima: linea(590) })).toEqual({ left: 70, top: 48 });
  });

  it('no se sale de la caja por los costados', () => {
    expect(lugarDeBarra({ marco, caja, primera: linea(200, 780), ultima: linea(200, 780) }).left).toBe(840 - 132 - 8);
    expect(lugarDeBarra({ marco, caja, primera: linea(200, -40), ultima: linea(200) }).left).toBe(8);
  });

  it('con lo seleccionado fuera de la vista, no va', () => {
    expect(lugarDeBarra({ marco, caja, primera: linea(-200), ultima: linea(-100) })).toBeNull();
    expect(lugarDeBarra({ marco, caja, primera: linea(700), ultima: linea(760) })).toBeNull();
    expect(lugarDeBarra({ marco, caja, primera: null, ultima: null })).toBeNull();
  });
});
