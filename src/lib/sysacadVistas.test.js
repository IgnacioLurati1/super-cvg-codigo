import { describe, expect, it } from 'vitest';
import { CURSAR, RENDIR } from './carrera.fixture';
import { mensajeDeEjemplo } from './demoSysacad';
import { comparar, datosDe, esTotal, estadoDeMateria, filtrosDe, leerCorrelativas, leerEstadoAcademico, ordenar, pesoDe, sinMayusculas } from './sysacadVistas';

const tabla = (columnas, filas) => ({ t: 'tabla', titulo: null, columnas, filas });
const CORRELATIVIDAD = ['Año', 'Materia', 'Correlatividad', 'Plan'];

// Same shape as the real Estado académico (Sysacad Lindo, pruebas/e2e.mjs), with invented subjects and grades.
const ESTADO_REAL = [
  ['0', 'Matemática', 'Aprobada en 2023', '2008'],
  ['0', 'Física', 'Aprobada en 2023', '2008'],
  ['1', 'Algoritmos y Estructuras de Datos', 'Aprobada con 10 (5 hs.) Tomo: 111 Folio: 22', '2023'],
  ['1', 'Análisis Matemático I', 'Aprobada con 8 (5 hs.) Tomo: 111 Folio: 23', '2023'],
  ['1', 'Compl.de equiv. de Análisis Matemático I', '', '2023'],
  ['1', 'Física I', 'Aprobada con 7 (5 hs.) Tomo: 112 Folio: 1', '2023'],
  ['2', 'Física II', 'Regular en 2024', '2023'],
  ['2', 'Entornos Gráficos (Elec.)', 'Regular en 2024 (1C)', '2023'],
  ['2', 'Formación de Emprendedores (Elec.)', '', '2023'],
  ['2', 'Programación Competitiva (Elec.)', 'Aprobada con 9 (3 hs.) Tomo: 113 Folio: 4', '2023'],
  ['3', 'Sistemas Operativos', '', '2023'],
  ['3', 'Redes de Datos', 'Inscripto', '2023'],
];

describe('datosDe', () => {
  it("takes the date out of Sysacad's title row and drops the row", () => {
    const { al, bloques } = datosDe({ titulo: 'Exámenes', bloques: [{ t: 'titulo', texto: 'Exámenes de Pérez, Ana al 2/11/2026 22:03:03' }, { t: 'texto', texto: 'x' }] });
    expect(al).toBe('2/11/2026 22:03:03');
    expect(bloques).toEqual([{ t: 'texto', texto: 'x' }]);
  });
  it('drops a title that only repeats the tab, and keeps any other', () => {
    expect(datosDe({ titulo: 'Certificados', bloques: [{ t: 'titulo', texto: 'CERTIFICADOS' }] })).toEqual({ al: null, bloques: [] });
    const otro = [{ t: 'titulo', texto: 'Pérez, Ana' }];
    expect(datosDe({ titulo: 'Certificados', bloques: otro })).toEqual({ al: null, bloques: otro });
  });
});

describe('sinMayusculas', () => {
  it('writes a shouted line in sentence case and leaves the rest alone', () => {
    expect(sinMayusculas('IMPORTANTE: AL GENERAR EL CERTIFICADO DE CURSADO NO SE PODRÁN ELIMINAR LAS INSCRIPCIONES')).toBe('Importante: al generar el certificado de cursado no se podrán eliminar las inscripciones');
    expect(sinMayusculas('Ingeniería en Sistemas, plan 2023')).toBe('Ingeniería en Sistemas, plan 2023');
    expect(sinMayusculas('ISI 2023')).toBe('ISI 2023');
  });
});

describe('estadoDeMateria', () => {
  it('reads the state the way Sysacad Lindo shows it', () => {
    expect(estadoDeMateria('Aprobada con 10 (5 hs.) Tomo: 111 Folio: 22')).toEqual({ tipo: 'aprobada', dice: 'Aprobada', registro: 'Tomo 111, folio 22', horas: 5, nota: 10 });
    expect(estadoDeMateria('Aprobada en 2023')).toMatchObject({ tipo: 'aprobada', dice: 'Aprobada en 2023', nota: null });
    expect(estadoDeMateria('Regular en 2024 (1C)')).toMatchObject({ tipo: 'regular', dice: 'Regular en 2024 (1C)' });
    expect(estadoDeMateria('Inscripto')).toMatchObject({ tipo: 'cursando', dice: 'Inscripto' });
    expect(estadoDeMateria('')).toMatchObject({ tipo: 'pendiente', dice: 'Sin cursar' });
    expect(estadoDeMateria('', { electiva: true }).dice).toBe('Electiva, sin cursar');
    expect(estadoDeMateria('', { complementaria: true }).dice).toBe('Complementaria, sin cursar');
    expect(estadoDeMateria('Aprobada', { notaAparte: 7 }).nota).toBe(7);
  });
});

describe('leerEstadoAcademico', () => {
  it('counts the career like Sysacad Lindo: electives and a complementary one never taken apart', () => {
    const e = leerEstadoAcademico([tabla(CORRELATIVIDAD.slice(0, 2).concat(['Estado', 'Plan']), ESTADO_REAL)]);
    expect(e.total).toBe(8);
    expect(e.aprobadas).toBe(5);
    expect(e.regulares).toBe(1);
    expect(e.cursando).toBe(1);
    expect(e.sinCursar).toBe(1);
    expect(e.electivas).toEqual({ total: 3, aprobadas: 1, regulares: 1, horas: 3 });
    // Grades of every passed subject with one, electives too.
    expect(e.notas).toBe(4);
    expect(e.promedio).toBe(8.5);
    expect(e.materias.find((m) => m.nombre === 'Matemática')).toMatchObject({ anio: 0, electiva: false, dice: 'Aprobada en 2023' });
  });
  it('for a career El Santo Resumen does not know, only the mark of Sysacad makes an elective', () => {
    const civil = [
      ['1', 'Análisis Matemático I', 'Aprobada con 7 (5 hs.) Tomo: 1 Folio: 2', '2023'],
      ['2', 'Estabilidad', 'Regular en 2025', '2023'],
      ['3', 'Hormigón Armado', '', '2023'],
      ['3', 'Geotecnia', '', '2023'],
      ['3', 'Hidrología y Obras Hidráulicas', '', '2023'],
      ['4', 'Puentes (Elec.)', '', '2023'],
    ];
    const e = leerEstadoAcademico([tabla(['Año', 'Materia', 'Estado', 'Plan'], civil)]);
    expect(e.total).toBe(5);
    expect(e.electivas.total).toBe(1);
    expect(e.materias.find((m) => m.nombre === 'Geotecnia').dice).toBe('Sin cursar');
  });
  it('a grade outside 1 to 10 is no grade', () => {
    expect(estadoDeMateria('Aprobada con 12').nota).toBeNull();
    expect(estadoDeMateria('Aprobada', { notaAparte: 0 }).nota).toBeNull();
  });
  it('is null without the columns it needs, or without rows', () => {
    expect(leerEstadoAcademico([tabla(['Año', 'Materia', 'Estado'], [])])).toBeNull();
    expect(leerCorrelativas([tabla(CORRELATIVIDAD, [])])).toBeNull();
    expect(leerEstadoAcademico([tabla(['Fecha', 'Materia', 'Nota'], [['1/1/2026', 'Física I', '8']])])).toBeNull();
  });
  it('reads the demo', () => {
    const { pestanas } = mensajeDeEjemplo();
    const e = leerEstadoAcademico(datosDe(pestanas[0]).bloques);
    expect(e).toMatchObject({ total: 23, aprobadas: 12, regulares: 3, cursando: 6, sinCursar: 2, notas: 12 });
  });
});

describe('leerCorrelativas', () => {
  it('reads the real Correlatividad para cursar: who can, what is missing and what holds back the most', () => {
    const c = leerCorrelativas([tabla(CORRELATIVIDAD, CURSAR.filter((f) => f.length))]);
    expect(c.total).toBe(37);
    expect(c.pueden).toBe(25);
    // A name Sysacad cut comes back whole from the requirements.
    expect(c.materias.find((m) => m.nombre.startsWith('Administración de Sistemas'))?.nombre).toBe('Administración de Sistemas de Información');
    expect(c.materias.find((m) => m.nombre === 'Proyecto Final').faltan).toEqual([
      'Regularizar Ingeniería y Calidad de Software',
      'Cursar Redes de Datos',
      'Cursar Administración de Sistemas de Información',
    ]);
    expect(c.frenos[0]).toEqual({ nombre: 'Administración de Sistemas de Información', cuantas: 8 });
    expect(c.frenos.every((f) => f.cuantas >= 2)).toBe(true);
  });
  it('leaves a cut name as Sysacad wrote it when two whole names start like it', () => {
    const c = leerCorrelativas([tabla(CORRELATIVIDAD, [
      ['5', 'Sistemas de Información Integrados para', 'Puede cursar', '2023'],
      ['5', 'Otra', 'No regularizó Sistemas de Información Integrados para la Industria (Elec.) · No regularizó Sistemas de Información Integrados para el Agro', '2023'],
    ])]);
    expect(c.materias[0].nombre).toBe('Sistemas de Información Integrados para');
  });
  it('for the final, a subject not regular yet says so, and it never holds back itself', () => {
    const c = leerCorrelativas([tabla(CORRELATIVIDAD, RENDIR.filter((f) => f.length))]);
    expect(c.materias.find((m) => m.nombre === 'Física II').puede).toBe(true);
    expect(c.materias.find((m) => m.nombre === 'Redes de Datos').faltan).toEqual(['Regularizarla', 'Regularizar Comunicación de Datos']);
    expect(c.frenos.some((f) => f.nombre === 'Proyecto Final')).toBe(false);
    // The elective hours line is said plainly, and the list of codes after it goes.
    const final = c.materias.find((m) => m.nombre === 'Proyecto Final').faltan;
    expect(final).toContain('17 de 20 horas de electivas');
    expect(final.some((f) => /321=|Código materia/.test(f))).toBe(false);
  });
});

describe('any other table', () => {
  it('a row with fewer cells is a total', () => {
    expect(esTotal(['Promedio: 7,50'], ['Fecha', 'Materia', 'Nota'])).toBe(true);
    expect(esTotal(['1/1/2026', 'Física I', 'ocho'], ['Fecha', 'Materia', 'Nota'])).toBe(false);
  });
  it('filters by the columns that repeat, as Sysacad Lindo: never notes, dates or rooms, the two with fewest values', () => {
    const { pestanas } = mensajeDeEjemplo();
    const parciales = datosDe(pestanas[1]).bloques[0];
    expect(filtrosDe(parciales.columnas, parciales.filas).map((f) => f.nombre)).toEqual(['Año', 'Comisión']);
    const examenes = datosDe(pestanas[2]).bloques[0];
    // Especialidad and Plan say the same in every row; Nota and Fecha never filter.
    expect(filtrosDe(examenes.columnas, examenes.filas)).toEqual([]);
    expect(filtrosDe(['Año', 'Materia'], [['1', 'a'], ['2', 'b']])).toEqual([]);
  });
  it('sorts dates, grades in words and numbers by what they weigh, the empty ones last', () => {
    expect(pesoDe('22/04/2024')).toBeGreaterThan(pesoDe('04/01/2023'));
    expect(pesoDe('diez')).toBe(10);
    expect(pesoDe('7,5')).toBe(7.5);
    expect(comparar('nueve', 'diez')).toBeLessThan(0);
    const filas = [['b', ''], ['a', 'ocho'], ['c', 'diez'], ['d', 'Ausen.']];
    expect(ordenar(filas, 1).map((f) => f[0])).toEqual(['a', 'c', 'd', 'b']);
    expect(ordenar(filas, 1, false).map((f) => f[0])).toEqual(['c', 'a', 'd', 'b']);
  });
});
