import { beforeEach, describe, expect, it } from 'vitest';
import {
  agregarEvento, agregarFecha, agregarTarea, alternarEn, borradasDelCampus, borrarEvento, cambiarEvento, conCorrecciones, corregirDelCampus, volverAlCampus, alternarSeccion, alternarTarea, borrarMio, cambiarMateria, estaOculto, eventosPropios, exportarMio, fijarOrden, fijarUsuario, guardarNota, importarMio, materiaDe, mioActual, personalizar, renombrar, ponerEnSeccion, revisadoClassroom, revisarClassroom, sanearMio, SIN_CLASSROOM, unirClassroom,
} from './mio';
import * as mioFns from './mio';
import { ordenarSecciones, plegarSeccion } from './mio';

const crudo =(usuario = 5) => JSON.parse(localStorage.getItem(`cl.mio.${usuario}`) ?? '{}');
const item = (clave, seccionId = 1, materiaId = 7) => ({ id: `${materiaId}-${clave}`, clave, seccionId, materiaId, nombre: `Original ${clave}` });

beforeEach(() => {
  localStorage.clear();
  fijarUsuario(null);
  fijarUsuario(5);
});

describe('por alumno', () => {
  it('oculta y vuelve a mostrar una sección', () => {
    alternarSeccion(7, 55);
    expect(materiaDe(mioActual(), 7).secciones).toEqual([55]);
    alternarSeccion(7, 55);
    expect(materiaDe(mioActual(), 7).secciones).toEqual([]);
  });

  it('separa a cada alumno del mismo navegador', () => {
    alternarSeccion(7, 55);
    fijarUsuario(6);
    expect(materiaDe(mioActual(), 7).secciones).toEqual([]);
    alternarSeccion(7, 56);
    expect(crudo(5).materias[7].secciones).toEqual([55]);
    expect(crudo(6).materias[7].secciones).toEqual([56]);
  });

  it('no guarda nada sin saber de quién es', () => {
    fijarUsuario(null);
    expect(guardarNota(7, 'hola')).toBe(false);
    expect(localStorage.length).toBe(0);
  });

  it('borrar deja al navegador limpio solo de ese alumno', () => {
    guardarNota(7, 'de cinco');
    fijarUsuario(6);
    guardarNota(7, 'de seis');
    borrarMio();
    expect(Object.keys(localStorage)).toEqual(['cl.mio.5']);
  });

  it('trae lo que estaba guardado con el formato anterior', () => {
    localStorage.setItem('cl.pref.ocultas.9', '{"7":[55]}');
    fijarUsuario(9);
    expect(materiaDe(mioActual(), 7).secciones).toEqual([55]);
    expect(localStorage.getItem('cl.pref.ocultas.9')).toBeNull();
  });

  it('un valor roto no rompe', () => {
    localStorage.setItem('cl.mio.8', '{roto');
    fijarUsuario(8);
    expect(mioActual().materias).toEqual({});
    expect(guardarNota(7, 'sigue')).toBe(true);
  });
});

describe('ítems', () => {
  it('estaOculto mira la sección y el ítem', () => {
    alternarSeccion(7, 2);
    alternarEn(7, 'ocultos', '30');
    const mio = mioActual();
    expect(estaOculto(mio, item('10', 2))).toBe(true);
    expect(estaOculto(mio, item('30', 1))).toBe(true);
    expect(estaOculto(mio, item('31', 1))).toBe(false);
    expect(estaOculto(mio, item('30', 1, 8))).toBe(false);
  });

  it('rechaza una clave que no sea un número', () => {
    expect(alternarEn(7, 'vistos', 'Apunte de Ana')).toBe(false);
    expect(renombrar(7, 'Apunte de Ana', 'x')).toBe(false);
    expect(localStorage.length).toBe(0);
  });

  it('personalizar pone el nombre, deja el original y marca lo visto', () => {
    renombrar(7, '10', 'Mío');
    alternarEn(7, 'vistos', '10');
    alternarEn(7, 'parcial', '11');
    const [a, b] = personalizar([item('10'), item('11')], mioActual());
    expect(a).toMatchObject({ nombre: 'Mío', nombreOriginal: 'Original 10', visto: true, parcial: false });
    expect(b).toMatchObject({ nombre: 'Original 11', nombreOriginal: null, visto: false, parcial: true });
  });

  it('renombrar con un texto vacío vuelve al original', () => {
    renombrar(7, '10', 'Mío');
    renombrar(7, '10', '   ');
    expect(materiaDe(mioActual(), 7).nombres).toEqual({});
  });

  it('respeta el orden dentro de la sección y deja lo nuevo al final', () => {
    fijarOrden(7, 1, ['12', '10']);
    const salida = personalizar([item('10'), item('11'), item('12'), item('20', 2)], mioActual());
    expect(salida.map((i) => i.clave)).toEqual(['12', '10', '11', '20']);
  });
});

describe('eventosPropios', () => {
  it('tareas con fecha sin hacer y fechas confirmadas', () => {
    agregarTarea(7, 'Estudiar', '2026-11-20', 1);
    agregarTarea(7, 'Sin fecha', '', 2);
    agregarTarea(7, 'Hecha', '2026-11-21', 3);
    alternarTarea(7, 3);
    agregarFecha(7, { id: 4, titulo: 'Parcial', cuando: 1_800_000_000 });
    const eventos = eventosPropios(mioActual(), { 7: 'Física' });
    expect(eventos.map((e) => e.titulo)).toEqual(['Estudiar', 'Parcial']);
    expect(eventos[0]).toMatchObject({ materia: 'Física', materiaId: 7, propio: 'tarea', sinHora: true, url: null });
    expect(new Date(eventos[0].cuando * 1000).getDate()).toBe(20);
  });
});

describe('fechas del campus corregidas o borradas', () => {
  const campus = [
    { id: 501, titulo: 'Parcial 1', materia: 'Física I', materiaId: 7, vencimiento: false, cuando: 1_800_000_000, url: 'https://campus.frro.utn.edu.ar/mod/x' },
    { id: 502, titulo: 'Entrega TP', materia: 'Física I', materiaId: 7, vencimiento: true, cuando: 1_800_100_000, url: null },
  ];

  it('una corregida se ve como la dejó el alumno, con su enlace al campus, y una borrada no se ve', () => {
    expect(corregirDelCampus(501, { titulo: ' Recuperatorio del 1 ', cuando: 1_800_500_000, sinHora: true, tipo: 'parcial', materiaId: 7, vence: false })).toBe(true);
    expect(corregirDelCampus(502, { borrado: true })).toBe(true);
    expect(conCorrecciones(campus, mioActual())).toEqual([{
      id: 501, titulo: 'Recuperatorio del 1', materia: 'Física I', materiaId: 7, vencimiento: true, cuando: 1_800_500_000, sinHora: true, tipo: 'parcial',
      url: 'https://campus.frro.utn.edu.ar/mod/x', vence: false, corregida: true,
    }]);
    expect(borradasDelCampus(campus, mioActual()).map((e) => e.id)).toEqual([502]);
    // Nothing of the campus is kept: only what the student confirmed, and numbers.
    expect(JSON.stringify(crudo())).not.toMatch(/campus\.frro|Parcial 1|Entrega TP/);
  });

  it('una corregida a otro mes se ve aunque el campus no la traiga, con el nombre de su materia', () => {
    corregirDelCampus(501, { titulo: 'Parcial', cuando: 1_805_000_000, tipo: 'parcial', materiaId: 7 });
    expect(conCorrecciones([], mioActual(), { 7: 'Física I' })).toMatchObject([{ id: 501, materia: 'Física I', url: null, corregida: true, cuando: 1_805_000_000 }]);
  });

  it('volver al campus la deja como estaba', () => {
    corregirDelCampus(501, { titulo: 'Otro', cuando: 1_800_000_000, tipo: 'otro', materiaId: 7 });
    corregirDelCampus(502, { borrado: true });
    volverAlCampus(501);
    volverAlCampus(502);
    expect(conCorrecciones(campus, mioActual())).toEqual(campus);
    expect(mioActual().campus).toEqual({});
  });

  it('solo entra lo que sirve', () => {
    expect(corregirDelCampus('abc', { borrado: true })).toBe(false);
    expect(corregirDelCampus(501, { titulo: '  ', cuando: 1_800_000_000 })).toBe(false);
    expect(corregirDelCampus(501, { titulo: 'T', cuando: -3 })).toBe(false);
    expect(sanearMio({
      campus: {
        501: { borrado: true, titulo: 'x' },
        502: { titulo: 'T', cuando: 1_800_000_000, tipo: 'raro', materiaId: 'x', vence: 'si', url: 'https://malo.com' },
        '../x': { borrado: true },
        0: { borrado: true },
        503: 'nada',
      },
    }).campus).toEqual({ 501: { borrado: true }, 502: { titulo: 'T', cuando: 1_800_000_000, sinHora: false, tipo: 'otro', materiaId: 0, vence: false } });
  });
});

describe('fechas propias del calendario', () => {
  it('se agregan con o sin materia, se cambian y se borran', () => {
    expect(agregarEvento({ id: 1, titulo: '  Parcial de Física ', cuando: 1_800_000_000, tipo: 'parcial', materiaId: 7 })).toBe(true);
    expect(agregarEvento({ id: 2, titulo: 'Turno del dentista', cuando: 1_800_100_000, sinHora: true, tipo: 'otro', materiaId: null })).toBe(true);
    expect(mioActual().eventos).toEqual([
      { id: 1, titulo: 'Parcial de Física', cuando: 1_800_000_000, sinHora: false, tipo: 'parcial', materiaId: 7 },
      { id: 2, titulo: 'Turno del dentista', cuando: 1_800_100_000, sinHora: true, tipo: 'otro', materiaId: null },
    ]);
    expect(cambiarEvento(1, { tipo: 'final', titulo: 'Final de Física' })).toBe(true);
    expect(mioActual().eventos[0]).toMatchObject({ id: 1, tipo: 'final', titulo: 'Final de Física', materiaId: 7 });
    expect(cambiarEvento(1, { titulo: '   ' })).toBe(false);
    expect(cambiarEvento(99, { titulo: 'No está' })).toBe(false);
    borrarEvento(2);
    expect(mioActual().eventos.map((e) => e.id)).toEqual([1]);
  });

  it('no se pierden al tocar una materia', () => {
    agregarEvento({ id: 1, titulo: 'Entrega', cuando: 1_800_000_000, tipo: 'entrega' });
    alternarSeccion(7, 55);
    guardarNota(7, 'hola');
    expect(mioActual().eventos).toHaveLength(1);
  });

  it('llegan al calendario con su tipo, y sin materia no inventan una', () => {
    agregarEvento({ id: 1, titulo: 'Parcial', cuando: 1_800_000_000, tipo: 'parcial', materiaId: 7 });
    agregarEvento({ id: 2, titulo: 'Cumple de Juan', cuando: 1_800_100_000, tipo: 'otro' });
    const [conMateria, sinMateria] = eventosPropios(mioActual(), { 7: 'Física' });
    expect(conMateria).toMatchObject({ id: 'e1', eventoId: 1, materia: 'Física', materiaId: 7, propio: 'evento', tipo: 'parcial', vencimiento: true });
    expect(sinMateria).toMatchObject({ id: 'e2', materia: null, materiaId: null, tipo: 'otro', vencimiento: false });
  });

  it('lo que entra de un archivo pasa por el mismo filtro', () => {
    const limpio = sanearMio({ eventos: [
      { id: 1, titulo: 'Ok', cuando: 5, tipo: 'raro', materiaId: 'x', extra: '<script>' },
      { id: 'no', titulo: 'Sin id', cuando: 5 },
      { id: 3, titulo: '', cuando: 5 },
      { id: 4, titulo: 'Sin fecha' },
      { id: 5, titulo: 'x'.repeat(500), cuando: 5, materiaId: '12' },
    ] });
    expect(limpio.eventos).toEqual([
      { id: 1, titulo: 'Ok', cuando: 5, sinHora: false, tipo: 'otro', materiaId: null },
      { id: 5, titulo: 'x'.repeat(200), cuando: 5, sinHora: false, tipo: 'otro', materiaId: 12 },
    ]);
    expect(sanearMio({ eventos: 'nada' }).eventos).toEqual([]);
  });

  it('viajan en la copia de mis datos', () => {
    agregarEvento({ id: 1, titulo: 'Final', cuando: 1_800_000_000, tipo: 'final' });
    const copia = exportarMio();
    borrarMio();
    expect(mioActual().eventos).toEqual([]);
    importarMio(copia);
    expect(mioActual().eventos).toHaveLength(1);
  });

  it('una nacida en Google Calendar recuerda su id allá, también al cambiarla desde el formulario', () => {
    agregarEvento({ id: 9, titulo: 'Cumple', cuando: 1_800_000_000, sinHora: true, tipo: 'otro', gid: '3k1v5ab0c9e7' });
    agregarEvento({ id: 9, titulo: 'Cumple de Beto', cuando: 1_800_000_000, sinHora: true, tipo: 'otro' });
    cambiarEvento(9, { titulo: 'Cumple de Beto, en casa' });
    expect(mioActual().eventos[0]).toMatchObject({ titulo: 'Cumple de Beto, en casa', gid: '3k1v5ab0c9e7' });
    expect(eventosPropios(mioActual())[0].gid).toBe('3k1v5ab0c9e7');
    expect(sanearMio({ eventos: [{ id: 1, titulo: 'x', cuando: 1, gid: 'a b"<' }] }).eventos[0].gid).toBeUndefined();
  });
});

describe('lo que entra de afuera', () => {
  it('sanearMio deja solo lo conocido', () => {
    const limpio = sanearMio({
      materias: {
        7: {
          secciones: [1, 'x', -1], ocultos: ['10', '<b>'], nombres: { 10: 'Bien', '<x>': 'Mal', 11: 5 }, orden: { 1: ['10', 'x'], z: ['10'] },
          tareas: [{ id: 1, texto: 'ok', hecha: 'si', fecha: 'mañana', extra: 1 }, { id: 'x', texto: 'mal' }],
          fechas: [{ id: 1, titulo: 'a', cuando: 5 }, { id: 2, titulo: 'b', cuando: 'hoy' }],
          url: 'javascript:x',
        },
        '__proto__x': { nota: 'mal' },
      },
    });
    expect(Object.keys(limpio.materias)).toEqual(['7']);
    const m = limpio.materias[7];
    expect(m.secciones).toEqual([1]);
    expect(m.ocultos).toEqual(['10']);
    expect(m.nombres).toEqual({ 10: 'Bien' });
    expect(m.orden).toEqual({ 1: ['10'] });
    expect(m.tareas).toEqual([{ id: 1, texto: 'ok', hecha: false, fecha: null }]);
    expect(m.fechas).toHaveLength(1);
    expect(m.url).toBeUndefined();
  });

  it('el curso de Classroom de una materia: su número, nada más («no tiene» de antes se borra solo)', () => {
    unirClassroom(7, '700001');
    expect(materiaDe(mioActual(), 7).classroom).toBe('700001');
    unirClassroom(7, 'no');
    expect(materiaDe(mioActual(), 7).classroom).toBeNull();
    unirClassroom(7, '');
    expect(materiaDe(mioActual(), 7).classroom).toBeNull();
    for (const malo of ['abc', '1'.repeat(25), 5, 'no', 'no ', 'Ninguno']) expect(sanearMio({ materias: { 7: { classroom: malo } } }).materias[7].classroom).toBeNull();
  });

  it('una materia sin Classroom queda así: no se le vuelve a buscar curso por el nombre', () => {
    unirClassroom(7, '700001');
    unirClassroom(7, SIN_CLASSROOM);
    expect(materiaDe(mioActual(), 7).classroom).toBe('ninguno');
    expect(sanearMio({ materias: { 7: { classroom: 'ninguno' } } }).materias[7].classroom).toBe('ninguno');
    unirClassroom(7, '700002');
    expect(materiaDe(mioActual(), 7).classroom).toBe('700002');
  });

  it('copia y restaura', () => {
    guardarNota(7, 'importante');
    const copia = exportarMio();
    borrarMio();
    expect(importarMio(copia)).toBe(true);
    expect(materiaDe(mioActual(), 7).nota).toBe('importante');
  });

  it('los señaladores de un PDF entran solo con su página y su fecha, y viajan en la copia', () => {
    const lecturas = { '7-101': { senaladores: [{ pagina: 3, creado: 1_790_000_000_000, texto: 'Semáforos' }, { pagina: '9' }, { pagina: 3, creado: 2 }] }, 'apunte.pdf': { senaladores: [{ pagina: 2 }] } };
    const esperadas = { '7-101': { pagina: null, resaltados: [], senaladores: [{ pagina: 3, creado: 1_790_000_000_000 }] } };
    expect(sanearMio({ lecturas }).lecturas).toEqual(esperadas);
    expect(importarMio(JSON.stringify({ tipo: 'campus-lindo-mis-datos', version: 1, lecturas }))).toBe(true);
    expect(mioActual().lecturas).toEqual(esperadas);
    const copia = exportarMio();
    borrarMio();
    expect(importarMio(copia)).toBe(true);
    expect(mioActual().lecturas).toEqual(esperadas);
  });

  it('rechaza un archivo que no es una copia', () => {
    expect(() => importarMio('{"materias":{}}')).toThrow();
    expect(() => importarMio('no es json')).toThrow();
  });

  it('cambiarMateria rechaza un id raro', () => {
    expect(cambiarMateria('__proto__', (m) => m)).toBe(false);
  });
});

describe('lugares y Classroom', () => {
  const item = (clave, seccionId, seccion) => ({ id: `7-${clave}`, clave, seccionId, seccion, materiaId: 7, nombre: clave });
  const items = [item('10', 1, 'Unidad 1'), item('11', 1, 'Unidad 1'), item('20', 2, 'Unidad 2'), item('c901.ab', 'c55', 'Tema de Classroom')];

  it('una tarjeta movida va a su sección nueva, en su lugar, y vuelve a la suya', () => {
    expect(ponerEnSeccion(7, 'c901.ab', 2, ['c901.ab', '20'])).toBe(true);
    expect(ponerEnSeccion(7, '10', 2, ['c901.ab', '20', '10'])).toBe(true);
    const ahora = personalizar(items, mioActual());
    expect(ahora.filter((i) => i.seccionId === 2).map((i) => i.clave)).toEqual(['c901.ab', '20', '10']);
    expect(ahora.find((i) => i.clave === '10')).toMatchObject({ seccion: 'Unidad 2', seccionOriginal: 1 });
    ponerEnSeccion(7, 'c901.ab', null);
    expect(personalizar(items, mioActual()).find((i) => i.clave === 'c901.ab')).toMatchObject({ seccionId: 'c55', seccion: 'Tema de Classroom' });
  });

  it('si la sección ya no está, la tarjeta queda donde estaba', () => {
    ponerEnSeccion(7, '20', 9);
    expect(personalizar(items, mioActual()).find((i) => i.clave === '20').seccionId).toBe(2);
  });

  it('las claves de Classroom se ocultan y marcan; lo raro no entra', () => {
    alternarEn(7, 'ocultos', 'c901.ab');
    expect(estaOculto(mioActual(), items[3])).toBe(true);
    const limpio = sanearMio({ materias: { 7: { lugares: { 'c1.a': 2, x: 2, 10: 'c3', 11: -1 } } }, cursos: { 700001: 5, abc: 5, 700002: 'x' } });
    expect(limpio.materias[7].lugares).toEqual({ 'c1.a': 2 });
    expect(limpio.cursos).toEqual({ 700001: 5 });
  });

  it('una sección tuya recibe tarjetas aunque esté vacía, y las tuyas van a las del campus', () => {
    const tuyo = item('p1700000000000001', 'p1700000000000009', 'Para el final');
    const extras = [{ materiaId: 7, id: 'p1700000000000009', nombre: 'Para el final' }, { materiaId: 7, id: 'p1700000000000008', nombre: 'Vacía' }];
    expect(ponerEnSeccion(7, '10', 'p1700000000000008', ['10'])).toBe(true);
    expect(ponerEnSeccion(7, 'p1700000000000001', 2)).toBe(true);
    const ahora = personalizar([...items, tuyo], mioActual(), extras);
    expect(ahora.find((i) => i.clave === '10')).toMatchObject({ seccionId: 'p1700000000000008', seccion: 'Vacía', seccionOriginal: 1 });
    expect(ahora.find((i) => i.clave === 'p1700000000000001')).toMatchObject({ seccionId: 2, seccion: 'Unidad 2' });
    // Without that section (it was deleted), the card stays where it was.
    expect(personalizar(items, mioActual()).find((i) => i.clave === '10').seccionId).toBe(1);
    const limpio = sanearMio({ materias: { 7: { lugares: { 10: 'p12', p5: 3, 11: 'p', 12: 'px1' }, orden: { p12: ['10', 'p5', 'x'], 'p': ['10'] }, vistos: ['p5', 'p'] } } });
    expect(limpio.materias[7].lugares).toEqual({ 10: 'p12', p5: 3 });
    expect(limpio.materias[7].orden).toEqual({ p12: ['10', 'p5'] });
    expect(limpio.materias[7].vistos).toEqual(['p5']);
  });

  it('lo nuevo de Classroom: desde la última revisión, o la última semana', () => {
    expect(revisadoClassroom(mioActual(), '700001', 1_000_000)).toBe(1_000_000 - 7 * 86_400);
    revisarClassroom('700001', 999);
    expect(revisadoClassroom(mioActual(), '700001', 1_000_000)).toBe(999);
  });
});

describe('el orden de las secciones y las plegadas', () => {
  it('se guardan por materia y por alumno', () => {
    expect(ordenarSecciones(7, ['p12', 3, 1])).toBe(true);
    expect(plegarSeccion(7, 3)).toBe(true);
    expect(plegarSeccion(7, 'p12', true)).toBe(true);
    expect(materiaDe(mioActual(), 7)).toMatchObject({ ordenSecciones: ['p12', 3, 1], plegadas: [3, 'p12'] });
    expect(materiaDe(mioActual(), 8).plegadas).toEqual([]);
    fijarUsuario(6);
    expect(materiaDe(mioActual(), 7)).toMatchObject({ ordenSecciones: [], plegadas: [] });
  });

  it('plegar sin el valor la da vuelta, y con el valor no la repite', () => {
    plegarSeccion(7, 3);
    plegarSeccion(7, 3, true);
    expect(materiaDe(mioActual(), 7).plegadas).toEqual([3]);
    plegarSeccion(7, 3);
    expect(materiaDe(mioActual(), 7).plegadas).toEqual([]);
    expect(plegarSeccion(7, 'x')).toBe(false);
    expect(plegarSeccion('x', 3)).toBe(false);
  });

  it('lo que entra de afuera queda solo con secciones válidas, sin repetir y con tope', () => {
    const raro = [3, 'p12', 3, -1, 1.5, 'x', 'p', '<b>', null, { id: 1 }, 'p12'];
    const m = sanearMio({ materias: { 7: { ordenSecciones: raro, plegadas: raro } } }).materias[7];
    expect(m.ordenSecciones).toEqual([3, 'p12']);
    expect(m.plegadas).toEqual([3, 'p12']);
    expect(sanearMio({ materias: { 7: { ordenSecciones: 'p12', plegadas: { 3: true } } } }).materias[7]).toMatchObject({ ordenSecciones: [], plegadas: [] });
    const muchas = Array.from({ length: 900 }, (_, i) => i);
    expect(sanearMio({ materias: { 7: { ordenSecciones: muchas } } }).materias[7].ordenSecciones).toHaveLength(500);
  });

  it('viajan en la copia de mis datos', () => {
    ordenarSecciones(7, [2, 1]);
    plegarSeccion(7, 2);
    const copia = exportarMio();
    borrarMio();
    importarMio(copia);
    expect(materiaDe(mioActual(), 7)).toMatchObject({ ordenSecciones: [2, 1], plegadas: [2] });
  });
});

describe('lo del tablón de Classroom pasado a una sección', () => {
  it('un mensaje y un adjunto suyo guardan su lugar solo con su clave y la sección', () => {
    expect(ponerEnSeccion(7, 't904', 3)).toBe(true);
    expect(ponerEnSeccion(7, 't904.1x2y3z', 'p12')).toBe(true);
    expect(materiaDe(mioActual(), 7).lugares).toEqual({ t904: 3, 't904.1x2y3z': 'p12' });
    ponerEnSeccion(7, 't904', null);
    expect(materiaDe(mioActual(), 7).lugares).toEqual({ 't904.1x2y3z': 'p12' });
  });

  it('se ve en su sección y, si Classroom lo borra, no queda nada', () => {
    ponerEnSeccion(7, 't904', 3);
    ponerEnSeccion(7, 't905.ab', 3);
    const mensaje = { ...item('t904', 'ct'), seccion: 'Tablón' };
    const campus = { ...item('101', 3), seccion: 'Unidad 1' };
    const r = personalizar([campus, mensaje], mioActual());
    expect(r.find((i) => i.clave === 't904')).toMatchObject({ seccionId: 3, seccion: 'Unidad 1', seccionOriginal: 'ct' });
    // t905.ab is gone from Classroom: no row and no error.
    expect(r.map((i) => i.clave)).toEqual(['101', 't904']);
  });

  it('lo que entra de afuera con otra forma de clave no se guarda', () => {
    const lugares = { t904: 3, 't904.ab': 1, t: 3, 'tx1': 3, 't1.<b>': 3, m904: 3, [`t${'1'.repeat(25)}`]: 3 };
    expect(sanearMio({ materias: { 7: { lugares, ocultos: ['t904', 'tt1'] } } }).materias[7]).toMatchObject({ lugares: { t904: 3, 't904.ab': 1 }, ocultos: ['t904'] });
  });
});

describe('materias de los horarios sin aula en el campus', () => {
  it('se suman con su comisión, sin repetir, cambian su comisión y su aula, y se quitan', async () => {
    const { sumarMateriaDeLaFacultad, elegirComisionDeExtra, guardarAulaDeExtra, quitarMateriaDeLaFacultad } = await import('./mio');
    const id = sumarMateriaDeLaFacultad('Ingeniería y Calidad de Software', '4K01');
    expect(id).toBeTypeOf('number');
    expect(sumarMateriaDeLaFacultad('Ingeniería y Calidad de Software', '4K02')).toBe(false);
    expect(sumarMateriaDeLaFacultad('   ', '4K01')).toBe(false);
    elegirComisionDeExtra(id, '4K02');
    guardarAulaDeExtra(id, 3, 'Aula 210');
    expect(mioActual().horario.extras).toEqual([{ id, materia: 'Ingeniería y Calidad de Software', comision: '4K02', aulas: { 3: 'Aula 210' } }]);
    elegirComisionDeExtra(id, 'cualquiera');
    guardarAulaDeExtra(id, 3, '');
    expect(mioActual().horario.extras[0]).toMatchObject({ comision: null, aulas: {} });
    quitarMateriaDeLaFacultad(id);
    expect(mioActual().horario.extras).toEqual([]);
  });

  it('lo que llega de un archivo pasa por el saneo', () => {
    const { horario } = sanearMio({ horario: { extras: [{ id: 1, materia: 'A'.repeat(500), comision: '<b>', aulas: { 9: 'x', 2: 'Lab' } }, { id: 1, materia: 'Otra' }, { id: -3, materia: 'Mala' }] } });
    expect(horario.extras).toEqual([{ id: 1, materia: 'A'.repeat(120), comision: null, aulas: { 2: 'Lab' } }]);
  });
});

describe('horarios de una materia cambiados a mano', () => {
  const clase = (dia, desde, hasta, extra = {}) => ({ dia, desde, hasta, aula: '', cuatrimestre: 0, ...extra });

  it('se guardan por materia, también vacíos, y vuelven al horario de la facultad', async () => {
    const { guardarClasesAMano } = await import('./mio');
    expect(guardarClasesAMano('cursos', 7, [clase(2, 480, 600, { aula: ' Lab 1 ', cuatrimestre: 1 })])).toBe(true);
    expect(guardarClasesAMano('cursos', 9, [])).toBe(true);
    expect(mioActual().horario.aMano.cursos).toEqual({ 7: [clase(2, 480, 600, { aula: 'Lab 1', cuatrimestre: 1 })], 9: [] });
    expect(crudo().horario.aMano.cursos[7]).toHaveLength(1);
    guardarClasesAMano('cursos', 7, null);
    expect(mioActual().horario.aMano.cursos).toEqual({ 9: [] });
  });

  it('rechaza una clase rota, un id raro, un tipo raro y más clases que el tope', async () => {
    const { guardarClasesAMano, MAX_CLASES_A_MANO } = await import('./mio');
    expect(guardarClasesAMano('cursos', 7, [clase(2, 600, 540)])).toBe(false);
    expect(guardarClasesAMano('cursos', 7, [clase(9, 480, 600)])).toBe(false);
    expect(guardarClasesAMano('cursos', '7<b>', [clase(2, 480, 600)])).toBe(false);
    expect(guardarClasesAMano('otros', 7, [clase(2, 480, 600)])).toBe(false);
    expect(guardarClasesAMano('cursos', 7, Array.from({ length: MAX_CLASES_A_MANO + 1 }, () => clase(2, 480, 600)))).toBe(false);
    expect(mioActual().horario.aMano.cursos).toEqual({});
  });

  it('los de una materia sumada se van con ella, y lo que llega de un archivo pasa por el saneo', async () => {
    const { guardarClasesAMano, sumarMateriaDeLaFacultad, quitarMateriaDeLaFacultad } = await import('./mio');
    const id = sumarMateriaDeLaFacultad('Economía', null);
    expect(guardarClasesAMano('extras', id, [clase(4, 1080, 1140)])).toBe(true);
    quitarMateriaDeLaFacultad(id);
    expect(mioActual().horario.aMano.extras).toEqual({});
    const { horario } = sanearMio({ horario: { extras: [], aMano: { cursos: { 7: [clase(1, 480, 600, { aula: 'x'.repeat(500), cuatrimestre: 5 }), { dia: 1 }], x: [clase(1, 480, 600)] }, extras: { 3: [clase(1, 480, 600)] } } } });
    expect(horario.aMano).toEqual({ cursos: { 7: [clase(1, 480, 600, { aula: 'x'.repeat(horario.aMano.cursos[7][0].aula.length) })] }, extras: {} });
    expect(horario.aMano.cursos[7][0].aula.length).toBeLessThan(500);
    // The last class of the night ends after midnight: kept until 2:00.
    expect(sanearMio({ horario: { extras: [], aMano: { cursos: { 7: [clase(1, 1405, 1450), clase(2, 1405, 1600), clase(3, 1440, 1500)] }, extras: {} } } }).horario.aMano.cursos[7]).toEqual([clase(1, 1405, 1450)]);
  });
});

describe('lo que el alumno marcó como hecho', () => {
  const ahora = () => Math.floor(Date.now() / 1000);

  it('marca, desmarca y vuelve a como estaba, guardando solo números', async () => {
    const { marcarHecha, desmarcarHecha, volverHecha } = await import('./mio');
    const vence = ahora() + 2 * 86_400;
    expect(marcarHecha('t2', vence)).toBe(true);
    expect(mioActual().hechas).toEqual({ t2: vence });
    expect(desmarcarHecha('t2')).toBe(true);
    expect(mioActual().hechas).toEqual({ t2: -vence });
    expect(volverHecha('t2', vence)).toBe(true);
    expect(mioActual().hechas).toEqual({ t2: vence });
    expect(volverHecha('t2', undefined)).toBe(true);
    expect(mioActual().hechas).toEqual({});
    marcarHecha('q15', vence);
    marcarHecha('c905', vence);
    marcarHecha('e31', vence);
    expect(Object.values(crudo().hechas).every((v) => typeof v === 'number')).toBe(true);
    expect(Object.keys(crudo().hechas).sort()).toEqual(['c905', 'e31', 'q15']);
  });

  it('sin fecha guarda cuándo se marcó, y una clave rara no se guarda', async () => {
    const { marcarHecha } = await import('./mio');
    const antes = ahora();
    expect(marcarHecha('t9', null)).toBe(true);
    expect(mioActual().hechas.t9).toBeGreaterThanOrEqual(antes);
    for (const mala of ['x9', 't', 't9.5', 'T9', 't<b>', 9, null]) expect(marcarHecha(mala, antes)).toBe(false);
    expect(Object.keys(mioActual().hechas)).toEqual(['t9']);
  });

  it('lo que marca el campus solo no pisa lo que el alumno decidió', async () => {
    const { desmarcarHecha, marcarHecha, marcarHechaSola } = await import('./mio');
    const vence = ahora() + 86_400;
    expect(marcarHechaSola('t2', vence)).toBe(true);
    expect(mioActual().hechas.t2).toBe(vence);
    desmarcarHecha('t2', vence);
    expect(marcarHechaSola('t2', vence)).toBe(true);
    expect(mioActual().hechas.t2).toBe(-vence);
    // Handed in from here, it is marked again.
    marcarHecha('t2', vence);
    expect(mioActual().hechas.t2).toBe(vence);
  });

  it('lo que entra de afuera pasa por el saneo: solo claves y segundos, se olvida a los 60 días y tiene tope', () => {
    const hoy = ahora();
    const { hechas } = sanearMio({ hechas: {
      t2: hoy, q15: -hoy, c905: hoy - 59 * 86_400, e31: hoy - 61 * 86_400, t3: -(hoy - 61 * 86_400),
      t4: 'hoy', t5: 1.5, t6: 0, t7: null, 'x8': hoy, '<b>': hoy, t9: { v: hoy }, t10: 1e12,
    } });
    expect(hechas).toEqual({ t2: hoy, q15: -hoy, c905: hoy - 59 * 86_400 });
    expect(sanearMio({ hechas: [1, 2] }).hechas).toEqual({});
    expect(sanearMio({}).hechas).toEqual({});
    const muchas = Object.fromEntries(Array.from({ length: 450 }, (_, i) => [`t${i + 1}`, hoy + i]));
    const topadas = sanearMio({ hechas: muchas }).hechas;
    expect(Object.keys(topadas)).toHaveLength(400);
    // The latest ones stay.
    expect(topadas.t450).toBe(hoy + 449);
    expect(topadas.t50).toBeUndefined();
  });

  it('viajan en la copia de tus datos y «Borrar» se las lleva', async () => {
    const { marcarHecha } = await import('./mio');
    const vence = ahora() + 86_400;
    marcarHecha('t2', vence);
    const copia = exportarMio();
    borrarMio();
    expect(mioActual().hechas).toEqual({});
    expect(localStorage.getItem('cl.mio.5')).toBeNull();
    importarMio(copia);
    expect(mioActual().hechas).toEqual({ t2: vence });
  });
});

describe('nombres de las secciones del campus y marcas de una materia propia', () => {
  it('una sección del campus con el nombre del alumno, también para lo que pasó a ella', () => {
    const { renombrarSeccion } = mioFns;
    expect(renombrarSeccion(7, 3, '  Prácticos  ')).toBe(true);
    ponerEnSeccion(7, '20', 3);
    const lista = personalizar([item('10', 3), item('20', 1)], mioActual());
    expect(lista.map((i) => [i.clave, i.seccionId, i.seccion])).toEqual([['10', 3, 'Prácticos'], ['20', 3, 'Prácticos']]);
    expect(materiaDe(mioActual(), 7).nombres).toEqual({ s3: 'Prácticos' });
    renombrarSeccion(7, 3, '');
    expect(materiaDe(mioActual(), 7).nombres).toEqual({});
  });

  it('solo las del campus: las propias se renombran en su categoría', () => {
    expect(mioFns.renombrarSeccion(7, 'p12', 'Otra')).toBe(false);
    expect(sanearMio({ materias: { 7: { nombres: { s3: 'Bien', sx: 'Mal', 's-1': 'Mal' } } } }).materias[7].nombres).toEqual({ s3: 'Bien' });
  });

  it('una materia propia guarda sus marcas por su id, y nada más que se le parezca', () => {
    expect(alternarEn('pabc1234', 'vistos', 'p11')).toBe(true);
    expect(plegarSeccion('pabc1234', 'p1', true)).toBe(true);
    expect(materiaDe(mioActual(), 'pabc1234')).toMatchObject({ vistos: ['p11'], plegadas: ['p1'] });
    expect(Object.keys(sanearMio({ materias: { pabc1234: {}, 'p-x': {}, '<p>': {}, p1: {} } }).materias)).toEqual(['pabc1234']);
  });

  it('los temas de Classroom de una materia propia son secciones: nombre, lugar, orden, pliegue y ocultas', () => {
    const { renombrarSeccion, nombreDeSeccion } = mioFns;
    const p = 'pabc1234';
    const tema = (clave, seccionId) => ({ ...item(clave, 0), materiaId: p, seccionId, seccion: `Tema ${seccionId}` });
    expect(renombrarSeccion(p, 'c801', 'Teoría')).toBe(true);
    expect(nombreDeSeccion(materiaDe(mioActual(), p), 'c801')).toBe('Teoría');
    expect(ponerEnSeccion(p, 'c902', 'c801', ['c901', 'c902'])).toBe(true);
    expect(plegarSeccion(p, 'c0', true)).toBe(true);
    expect(mioFns.alternarSeccion(p, 'c802')).toBe(true);
    expect(mioFns.ordenarSecciones(p, ['c802', 'p1', 'c801', 'ct', 'x'])).toBe(true);
    const lista = personalizar([tema('c901', 'c801'), tema('c902', 'c802')], mioActual());
    expect(lista.map((i) => [i.clave, i.seccionId, i.seccion, i.seccionOriginal])).toEqual([['c901', 'c801', 'Teoría', undefined], ['c902', 'c801', 'Teoría', 'c802']]);
    const guardada = sanearMio(JSON.parse(JSON.stringify(mioActual()))).materias[p];
    expect(guardada).toMatchObject({ nombres: { sc801: 'Teoría' }, lugares: { c902: 'c801' }, plegadas: ['c0'], secciones: ['c802'], ordenSecciones: ['c802', 'p1', 'c801'] });
    // The stream is not a section, nor is anything else that starts with «c».
    expect(renombrarSeccion(p, 'ct', 'No')).toBe(false);
    expect(sanearMio({ materias: { [p]: { nombres: { sc1: 'Bien', 'sc-1': 'Mal', sct: 'Mal' }, lugares: { c1: 'cx' } } } }).materias[p]).toMatchObject({ nombres: { sc1: 'Bien' }, lugares: {} });
  });

  it('conMarcas pone el nombre y las marcas sin mover nada', () => {
    renombrar(7, '10', 'Mío');
    alternarEn(7, 'parcial', '10');
    expect(mioFns.conMarcas(item('10', 3), materiaDe(mioActual(), 7))).toMatchObject({ nombre: 'Mío', nombreOriginal: 'Original 10', parcial: true, visto: false, seccionId: 3 });
  });
});

describe('Materias: fijadas, archivadas y la tarjeta de cada una', () => {
  it('fija, archiva y vuelve a su grupo, en una del campus y en una tuya', () => {
    expect(mioFns.ponerEnLista(7, 'fijada')).toBe(true);
    expect(mioFns.ponerEnLista('pabc1234', 'archivada')).toBe(true);
    expect(materiaDe(mioActual(), 7).enLista).toBe('fijada');
    expect(materiaDe(mioActual(), 'pabc1234').enLista).toBe('archivada');
    mioFns.ponerEnLista(7, null);
    expect(materiaDe(mioActual(), 7).enLista).toBe(null);
    // Only numbers of the campus on disk: nothing of its name.
    expect(Object.keys(crudo().materias).sort()).toEqual(['7', 'pabc1234']);
  });

  it('la tarjeta de una materia: una de la lista, o null para la de todas', () => {
    mioFns.ponerTarjeta(7, 'portada');
    expect(materiaDe(mioActual(), 7).tarjeta).toBe('portada');
    mioFns.ponerTarjeta(7, 'arcoiris');
    expect(materiaDe(mioActual(), 7).tarjeta).toBe(null);
  });

  it('lo raro que entra de un archivo o un link se va', () => {
    const { materias } = sanearMio({ materias: { 7: { enLista: 'arriba', tarjeta: '<b>' }, 8: { enLista: 'archivada', tarjeta: 'minima' } } });
    expect(materias[7]).toMatchObject({ enLista: null, tarjeta: null });
    expect(materias[8]).toMatchObject({ enLista: 'archivada', tarjeta: 'minima' });
    expect(materiaDe(sanearMio({}), 9)).toMatchObject({ enLista: null, tarjeta: null });
  });

  it('un id que no es de una materia no se guarda', () => {
    expect(mioFns.ponerEnLista('../x', 'fijada')).toBe(false);
  });
});
