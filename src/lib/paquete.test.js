import { deflateSync, strToU8 } from 'fflate';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  agregarFecha, agregarTarea, alternarEn, alternarSeccion, cambiarMateria, fijarOrden, fijarUsuario, guardarNota, materiaDe, mioActual, renombrar,
} from './mio';
import {
  aplicarPaquete, archivoDe, armarPaquete, codificarPaquete, decodificarPaquete, filtrarPaquete, hashDe, hayPaqueteEnHash, leerArchivoPaquete, LIMITE_PAQUETE, paqueteDeHash, paqueteDeTexto, paqueteVacio, restaurarMateria, resumirPaquete,
} from './paquete';

const CUANDO = Date.UTC(2026, 10, 20) / 1000;
const base = (extra = {}) => ({ tipo: 'campus-lindo-orden', version: 1, materiaId: 7, secciones: [], ocultos: [], nombres: {}, orden: {}, fechas: [], ...extra });
const crudo = (x) => JSON.stringify(x);
const comprimir = (bytes) => {
  let binario = '';
  for (const b of deflateSync(bytes)) binario += String.fromCharCode(b);
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const enLink = (x) => comprimir(strToU8(typeof x === 'string' ? x : crudo(x)));

const item = (clave, seccionId = 1, nombre = `Campus ${clave}`) => ({ id: `7-${clave}`, clave, seccionId, seccion: `Unidad ${seccionId}`, materiaId: 7, materia: 'Materia', nombre });
const ITEMS = [item('10'), item('11'), item('12'), item('20', 2)];

beforeEach(() => {
  localStorage.clear();
  fijarUsuario(null);
  fijarUsuario(5);
});

describe('armarPaquete', () => {
  it('lleva lo que se comparte y nada de lo privado', () => {
    alternarSeccion(7, 2);
    alternarEn(7, 'ocultos', '10');
    alternarEn(7, 'vistos', '11');
    alternarEn(7, 'parcial', '11');
    renombrar(7, '11', 'Resumen');
    fijarOrden(7, 1, ['12', '11']);
    guardarNota(7, 'NOTA SECRETA');
    agregarTarea(7, 'TAREA SECRETA', null, 1);
    agregarFecha(7, { id: 987654, titulo: 'Parcial', cuando: CUANDO });
    cambiarMateria(7, (m) => ({ ...m, descartes: ['abc'], foto: { 10: 1 } }));

    const p = armarPaquete(7, mioActual());
    expect(Object.keys(p).sort()).toEqual(['fechas', 'materiaId', 'nombres', 'ocultos', 'orden', 'secciones', 'tipo', 'version']);
    expect(p).toMatchObject({ tipo: 'campus-lindo-orden', version: 1, materiaId: 7, secciones: [2], ocultos: ['10'], nombres: { 11: 'Resumen' }, orden: { 1: ['12', '11'] } });
    expect(p.fechas).toEqual([{ id: 1, titulo: 'Parcial', cuando: CUANDO, sinHora: false }]);
    const texto = crudo(p);
    for (const privado of ['SECRETA', 'vistos', 'parcial', 'nota', 'tareas', 'descartes', 'foto', '987654']) expect(texto).not.toContain(privado);
  });

  it('sabe cuando no hay nada para compartir', () => {
    expect(paqueteVacio(armarPaquete(7, mioActual()))).toBe(true);
    guardarNota(7, 'Solo una nota');
    alternarEn(7, 'vistos', '10');
    expect(paqueteVacio(armarPaquete(7, mioActual()))).toBe(true);
    renombrar(7, '10', 'Algo');
    expect(paqueteVacio(armarPaquete(7, mioActual()))).toBe(false);
  });
});

describe('ida y vuelta', () => {
  const paquete = base({ secciones: [2], ocultos: ['10', '11.abc'], nombres: { 12: 'Resumen de la ñandú 🦤' }, orden: { 1: ['12', '11'] }, fechas: [{ id: 1, titulo: 'Parcial', cuando: CUANDO, sinHora: true }] });

  it('por link, con caracteres de cualquier tipo', () => {
    const texto = codificarPaquete(paquete);
    expect(texto).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodificarPaquete(texto)).toEqual(paquete);
    const hash = hashDe(paquete);
    expect(hayPaqueteEnHash(hash)).toBe(true);
    expect(hayPaqueteEnHash('#otra-cosa')).toBe(false);
    expect(paqueteDeHash(hash)).toEqual(paquete);
  });

  it('por archivo, también con marca de orden de bytes', async () => {
    const blob = archivoDe(paquete);
    const archivo = { size: blob.size, text: async () => crudo(paquete) };
    expect(await leerArchivoPaquete(archivo)).toEqual(paquete);
    expect(paqueteDeTexto(`\uFEFF${crudo(paquete)}`)).toEqual(paquete);
  });

  it('no arma un link de un paquete demasiado grande', () => {
    const nombres = Object.fromEntries(Array.from({ length: 2000 }, (_, i) => [String(i + 1), 'x'.repeat(200)]));
    expect(() => codificarPaquete(base({ nombres }))).toThrow(/muy grande/);
  });
});

describe('entrada hostil', () => {
  const rechaza = (x, patron) => expect(() => decodificarPaquete(enLink(x))).toThrow(patron);

  it('rechaza base64 roto', () => {
    for (const roto of ['', '!!!!', 'abc def', 'a', 'AAAA', 'ñandú', 'a=b', null, undefined, 5, {}]) {
      expect(() => decodificarPaquete(roto)).toThrow(/no es un orden/);
    }
  });

  it('rechaza un link cortado', () => {
    const entero = codificarPaquete(base({ nombres: { 10: 'Un nombre bastante largo para que comprima algo' } }));
    expect(() => decodificarPaquete(entero.slice(0, entero.length / 2))).toThrow(/no es un orden/);
  });

  it('rechaza lo que no es JSON, el tipo o la versión', () => {
    rechaza('no soy json', /no es un orden/);
    rechaza('[]', /no es un orden/);
    rechaza('null', /no es un orden/);
    rechaza('"campus-lindo-orden"', /no es un orden/);
    rechaza({ tipo: 'campus-lindo-mis-datos', version: 1, materiaId: 7 }, /no es un orden/);
    rechaza(base({ version: 2 }), /versión/);
    expect(() => paqueteDeTexto('no soy json')).toThrow(/no es un orden/);
  });

  it('rechaza una materia rara', () => {
    for (const materiaId of [0, -1, 1.5, '__proto__', 'constructor', '7; drop', null, undefined, {}, [7], 1e30]) {
      rechaza(base({ materiaId }), /no es un orden/);
    }
  });

  it('frena una bomba de compresión sin inflarla entera', () => {
    const bomba = comprimir(new Uint8Array(50 * 1024 * 1024));
    expect(bomba.length).toBeLessThan(100_000);
    const antes = performance.now();
    expect(() => decodificarPaquete(bomba)).toThrow(/pesa demasiado/);
    expect(performance.now() - antes).toBeLessThan(500);
  });

  it('frena justo pasado el límite y deja pasar lo que entra', () => {
    const relleno = (n) => `${crudo(base())}${' '.repeat(n)}`;
    const largo = crudo(base()).length;
    expect(decodificarPaquete(enLink(relleno(LIMITE_PAQUETE - largo))).materiaId).toBe(7);
    expect(() => decodificarPaquete(enLink(relleno(LIMITE_PAQUETE - largo + 1)))).toThrow(/pesa demasiado/);
  });

  it('frena un texto o un archivo enorme antes de leerlo', async () => {
    expect(() => decodificarPaquete('A'.repeat(LIMITE_PAQUETE * 2))).toThrow(/pesa demasiado/);
    let leido = false;
    const archivo = { size: LIMITE_PAQUETE + 1, text: async () => { leido = true; return '{}'; } };
    await expect(leerArchivoPaquete(archivo)).rejects.toThrow(/pesa demasiado/);
    expect(leido).toBe(false);
  });

  it('solo deja los campos conocidos', () => {
    const p = decodificarPaquete(enLink(base({
      nota: 'pisada', tareas: [{ id: 1, texto: 'x' }], vistos: ['10'], parcial: ['10'], descartes: ['a'], foto: { 10: 1 }, html: '<img src=x onerror=alert(1)>', url: 'https://malo.example',
    })));
    expect(Object.keys(p).sort()).toEqual(['fechas', 'materiaId', 'nombres', 'ocultos', 'orden', 'secciones', 'tipo', 'version']);
  });

  it('descarta las claves raras', () => {
    const texto = `{"tipo":"campus-lindo-orden","version":1,"materiaId":7,
      "nombres":{"__proto__":"x","constructor":"x","<b>":"x","../../etc":"x","10":"bien"},
      "orden":{"__proto__":["10"],"":["10"],"1e3":["10"]," 1":["10"],"0x10":["10"],"1":["10","__proto__","javascript:alert(1)",7]},
      "ocultos":["__proto__","10",7,null,{"a":1}],
      "secciones":[1,"2",-1,1.5,null,{}],
      "__proto__":{"nota":"contaminada"}}`;
    const p = decodificarPaquete(enLink(texto));
    expect(p.nombres).toEqual({ 10: 'bien' });
    expect(p.orden).toEqual({ 1: ['10'] });
    expect(p.ocultos).toEqual(['10']);
    expect(p.secciones).toEqual([1]);
    expect({}.nota).toBeUndefined();
    expect(Object.getPrototypeOf(p.nombres)).toBe(Object.prototype);
    expect(p.nota).toBeUndefined();
  });

  it('no confunde una lista con un objeto', () => {
    const p = decodificarPaquete(enLink(base({ nombres: 'hola', orden: [['10']], ocultos: 'hola', secciones: { 0: 1 }, fechas: 'hola' })));
    expect(p).toMatchObject({ nombres: {}, orden: {}, ocultos: [], secciones: [], fechas: [] });
    const q = decodificarPaquete(enLink(base({ nombres: ['a'] })));
    expect(q.nombres).toEqual({});
  });

  it('deja el HTML y las URL como texto, sin esconder nada con caracteres invisibles', () => {
    const p = decodificarPaquete(enLink(base({ nombres: {
      10: '<img src=x onerror=alert(1)>',
      11: 'javascript:alert(1)',
      12: 'evil\u202Efdp.exe\u200B',
      13: 'dos\n\nlíneas\t\u0007juntas',
      14: '\u200B \u202E',
    } })));
    expect(p.nombres).toEqual({ 10: '<img src=x onerror=alert(1)>', 11: 'javascript:alert(1)', 12: 'evilfdp.exe', 13: 'dos líneas juntas' });
  });

  it('corta los textos largos y descarta fechas imposibles', () => {
    const p = decodificarPaquete(enLink(base({
      nombres: { 10: 'x'.repeat(5000) },
      fechas: [
        { titulo: 'y'.repeat(5000), cuando: CUANDO },
        { titulo: 'Sin fecha' },
        { titulo: 'Texto', cuando: '2026' },
        { titulo: 'Decimal', cuando: CUANDO + 0.5 },
        { titulo: 'Lejísimos', cuando: 1e20 },
        { titulo: 'Negativa', cuando: -5 },
        { titulo: '   ', cuando: CUANDO },
        { titulo: 5, cuando: CUANDO },
        'no soy objeto',
        null,
        { titulo: 'Repetida', cuando: CUANDO, sinHora: 'sí' },
        { titulo: 'Repetida', cuando: CUANDO, id: 1e300, html: '<b>' },
      ],
    })));
    expect(p.nombres[10]).toHaveLength(200);
    expect(p.fechas.map((f) => f.titulo)).toEqual(['y'.repeat(200), 'Repetida']);
    expect(p.fechas[1]).toEqual({ id: 2, titulo: 'Repetida', cuando: CUANDO, sinHora: false });
  });

  it('trae a raya las listas enormes', () => {
    const p = decodificarPaquete(enLink(base({ ocultos: Array.from({ length: 5000 }, (_, i) => String(i)), fechas: Array.from({ length: 300 }, (_, i) => ({ titulo: `F${i}`, cuando: CUANDO + i })) })));
    expect(p.ocultos).toHaveLength(3000);
    expect(p.fechas).toHaveLength(200);
  });

  it('un archivo pasa por lo mismo', () => {
    const p = paqueteDeTexto(crudo(base({ nota: 'pisada', nombres: { __x: 'mal', 10: '  bien  ' } })));
    expect(p.nombres).toEqual({ 10: 'bien' });
    expect(p.nota).toBeUndefined();
    expect(() => paqueteDeTexto(crudo({ tipo: 'otro' }))).toThrow(/no es un orden/);
  });
});

describe('aplicar y deshacer', () => {
  const paquete = base({
    secciones: [2],
    ocultos: ['11'],
    nombres: { 10: 'Del paquete' },
    orden: { 1: ['12', '10'] },
    fechas: [{ id: 1, titulo: 'Parcial', cuando: CUANDO, sinHora: false }, { id: 2, titulo: 'Final', cuando: CUANDO + 1, sinHora: true }],
  });

  beforeEach(() => {
    alternarSeccion(7, 9);
    alternarEn(7, 'ocultos', '12');
    alternarEn(7, 'vistos', '10');
    alternarEn(7, 'parcial', '10');
    renombrar(7, '10', 'Mío');
    renombrar(7, '12', 'Se queda');
    fijarOrden(7, 1, ['10', '12']);
    fijarOrden(7, 2, ['20']);
    guardarNota(7, 'Mi nota');
    agregarTarea(7, 'Mi tarea', null, 1);
    agregarFecha(7, { id: 1, titulo: 'Parcial', cuando: CUANDO });
  });

  it('pisa nombres y orden, une secciones y ocultos, suma fechas sin repetir', () => {
    aplicarPaquete(paquete);
    const m = materiaDe(mioActual(), 7);
    expect(m.nombres).toEqual({ 10: 'Del paquete', 12: 'Se queda' });
    expect(m.orden).toEqual({ 1: ['12', '10'], 2: ['20'] });
    expect(m.secciones).toEqual([9, 2]);
    expect(m.ocultos).toEqual(['12', '11']);
    expect(m.fechas.map((f) => f.titulo)).toEqual(['Parcial', 'Final']);
    expect(new Set(m.fechas.map((f) => f.id)).size).toBe(2);
  });

  it('no toca nota, tareas, vistos ni parcial, aunque el paquete los traiga', () => {
    aplicarPaquete({ ...paquete, nota: 'pisada', tareas: [], vistos: [], parcial: [] });
    expect(materiaDe(mioActual(), 7)).toMatchObject({ nota: 'Mi nota', vistos: ['10'], parcial: ['10'] });
    expect(materiaDe(mioActual(), 7).tareas).toHaveLength(1);
  });

  it('deshace dejando lo que había, sin perder lo escrito en el medio', () => {
    const antes = materiaDe(mioActual(), 7);
    const copia = aplicarPaquete(paquete);
    guardarNota(7, 'Nota nueva');
    restaurarMateria(7, copia);
    const m = materiaDe(mioActual(), 7);
    expect({ ...m, nota: antes.nota }).toEqual(antes);
    expect(m.nota).toBe('Nota nueva');
  });

  it('aplicar dos veces da lo mismo que una', () => {
    aplicarPaquete(paquete);
    const una = materiaDe(mioActual(), 7);
    aplicarPaquete(paquete);
    expect(materiaDe(mioActual(), 7)).toEqual(una);
  });

  it('anda en una materia sin nada y no se pasa del tope de fechas', () => {
    const muchas = Array.from({ length: 200 }, (_, i) => ({ id: i + 1, titulo: `F${i}`, cuando: CUANDO + i, sinHora: false }));
    const antes = aplicarPaquete({ ...base({ materiaId: 8 }), fechas: muchas });
    expect(antes).toEqual({ secciones: [], ocultos: [], nombres: {}, orden: {}, fechas: [] });
    aplicarPaquete({ ...base({ materiaId: 8 }), fechas: [{ id: 1, titulo: 'Una más', cuando: CUANDO, sinHora: false }] });
    expect(materiaDe(mioActual(), 8).fechas).toHaveLength(200);
  });

  it('avisa si no se pudo guardar', () => {
    fijarUsuario(null);
    expect(() => aplicarPaquete(paquete)).toThrow(/guardar/);
  });
});

describe('revisión', () => {
  it('ignora lo que no existe en la materia', () => {
    const p = filtrarPaquete(base({
      secciones: [1, 99],
      ocultos: ['10', '999'],
      nombres: { 10: 'Bien', 999: 'No existe' },
      orden: { 1: ['11', '20', '999'], 99: ['10'], 2: ['999'] },
    }), ITEMS);
    expect(p).toMatchObject({ secciones: [1], ocultos: ['10'], nombres: { 10: 'Bien' }, orden: { 1: ['11'] } });
  });

  it('cuenta con nombres reales qué va a cambiar', () => {
    renombrar(7, '12', 'Mío');
    const r = resumirPaquete(base({
      secciones: [2],
      ocultos: ['11'],
      nombres: { 10: 'Nuevo', 12: 'Otro', 999: 'No existe' },
      orden: { 1: ['12', '10'] },
      fechas: [{ id: 1, titulo: 'Parcial', cuando: CUANDO, sinHora: false }],
    }), ITEMS, mioActual());
    expect(r.renombrados).toEqual([{ clave: '10', campus: 'Campus 10', nuevo: 'Nuevo' }, { clave: '12', campus: 'Campus 12', nuevo: 'Otro' }]);
    expect(r.ocultos).toEqual([{ clave: '11', nombre: 'Campus 11' }]);
    expect(r.secciones).toEqual([{ id: 2, nombre: 'Unidad 2' }]);
    expect(r.orden).toEqual([{ id: '1', nombre: 'Unidad 1' }]);
    expect(r.fechas).toHaveLength(1);
    expect(r.hayCambios).toBe(true);
    expect(r.paquete.nombres[999]).toBeUndefined();
  });

  it('no cuenta lo que ya está igual', () => {
    alternarSeccion(7, 2);
    alternarEn(7, 'ocultos', '11');
    renombrar(7, '10', 'Igual');
    fijarOrden(7, 1, ['12', '10']);
    agregarFecha(7, { id: 3, titulo: 'Parcial', cuando: CUANDO });
    const r = resumirPaquete(base({
      secciones: [2],
      ocultos: ['11'],
      nombres: { 10: 'Igual', 11: 'Campus 11' },
      orden: { 1: ['12', '10'], 2: ['20'] },
      fechas: [{ id: 1, titulo: 'Parcial', cuando: CUANDO, sinHora: false }],
    }), ITEMS, mioActual());
    expect(r.hayCambios).toBe(false);
  });

  it('sin nada para aplicar dice que no hay cambios', () => {
    expect(resumirPaquete(base({ nombres: { 999: 'No existe' } }), ITEMS, mioActual()).hayCambios).toBe(false);
  });

  it('una sección con nombre vacío igual se puede mostrar', () => {
    const r = resumirPaquete(base({ secciones: [3] }), [{ ...item('30', 3), seccion: '' }], mioActual());
    expect(r.secciones[0].nombre).toBe('Sección sin nombre');
  });
});
