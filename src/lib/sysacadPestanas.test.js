import { afterEach, describe, expect, it } from 'vitest';
import { fijarUsuario, mioActual, sonMiasLasDeSysacad } from './mio';
import { mensajeDeEjemplo } from './demoSysacad';
import { anchosParejos, fechaCompleta, huellaDelPar, filasQueCoinciden, leerPestanas, mismoAlumno, PESTANAS_DE_SYSACAD, vistoHace } from './sysacadPestanas';

const AHORA = Date.UTC(2026, 10, 11, 15);
const tabla = (extra = {}) => ({ t: 'tabla', titulo: null, columnas: ['Fecha', 'Materia', 'Nota'], filas: [['12/02/2026', 'Física I', '7']], ...extra });
const pestana = (extra = {}) => ({ clave: 'examenes', titulo: 'Exámenes', fecha: AHORA - 60_000, bloques: [{ t: 'titulo', texto: 'Exámenes' }, tabla()], ...extra });
const bien = (extra = {}) => ({ fuente: 'sysacad-lindo', para: 'super-cvg', v: 2, tipo: 'pestanas', vinculada: true, guarda: true, alumno: 'PEREZ, Juan', pestanas: [pestana()], ...extra });
const conBloque = (b) => bien({ pestanas: [pestana({ bloques: [b] })] });
const sin = (o, clave) => {
  const copia = { ...o };
  delete copia[clave];
  return copia;
};

describe('el mensaje de las pestañas de Sysacad Lindo', () => {
  it('toma uno vinculado con sus pestañas', () => {
    expect(leerPestanas(bien(), AHORA)).toEqual({ vinculada: true, guarda: true, alumno: 'PEREZ, Juan', pestanas: [pestana()] });
  });

  it('sin vincular, sin guardar o sin pasar por el menú', () => {
    expect(leerPestanas(bien({ vinculada: false, guarda: false, alumno: null, pestanas: [] }), AHORA)).toEqual({ vinculada: false, guarda: false, alumno: null, pestanas: [] });
    expect(leerPestanas(bien({ guarda: false, pestanas: [] }), AHORA)).toMatchObject({ vinculada: true, guarda: false, pestanas: [] });
    expect(leerPestanas(bien({ alumno: null }), AHORA)).toMatchObject({ alumno: null, pestanas: [pestana()] });
  });

  it('las 7 pestañas, en el orden de la tabla aunque lleguen en otro', () => {
    const todas = PESTANAS_DE_SYSACAD.map((p) => pestana({ clave: p.clave, titulo: p.titulo }));
    expect(leerPestanas(bien({ pestanas: [...todas].reverse() }), AHORA).pestanas.map((p) => p.clave)).toEqual(PESTANAS_DE_SYSACAD.map((p) => p.clave));
  });

  it('limpia los espacios y los caracteres de control, y suelta lo que queda vacío', () => {
    const m = leerPestanas(bien({
      alumno: '  PEREZ,\n Juan ',
      pestanas: [
        pestana({ bloques: [{ t: 'texto', texto: ' Legajo\t\u000099999 ' }, { t: 'texto', texto: '   ' }, tabla({ titulo: ' ', columnas: [' Año '], filas: [['\u0085 1 ']] })] }),
        pestana({ clave: 'plan', titulo: 'Materias del plan', bloques: [{ t: 'texto', texto: ' ' }] }),
      ],
    }), AHORA);
    expect(m.alumno).toBe('PEREZ, Juan');
    expect(m.pestanas).toEqual([pestana({ bloques: [{ t: 'texto', texto: 'Legajo 99999' }, { t: 'tabla', titulo: null, columnas: ['Año'], filas: [['1']] }] })]);
  });

  it('una tabla sin columnas, una fila corta y celdas vacías entran', () => {
    const b = tabla({ columnas: [], filas: [['a', '', 'c'], []] });
    expect(leerPestanas(conBloque(b), AHORA).pestanas[0].bloques).toEqual([b]);
    const total = tabla({ filas: [['Promedio: 7,5']] });
    expect(leerPestanas(conBloque(total), AHORA).pestanas[0].bloques).toEqual([total]);
  });

  it('justo en los topes, entra', () => {
    const celda = 'x'.repeat(300);
    const grande = tabla({ titulo: 't'.repeat(200), columnas: Array(30).fill(celda), filas: Array(500).fill(Array(30).fill(celda)) });
    const bloques = [grande, ...Array(58).fill({ t: 'texto', texto: 'p'.repeat(2000) }), { t: 'titulo', texto: 'h'.repeat(200) }];
    const m = leerPestanas(bien({ alumno: 'a'.repeat(120), pestanas: PESTANAS_DE_SYSACAD.map((p) => pestana({ ...p, bloques })) }), AHORA);
    expect(m.pestanas).toHaveLength(7);
    expect(m.pestanas[0].bloques).toHaveLength(60);
    expect(leerPestanas(bien({ pestanas: [pestana({ fecha: AHORA + 86_400_000 })] }), AHORA)).not.toBeNull();
  });

  it('los datos de ejemplo pasan el mismo control', () => {
    expect(leerPestanas(mensajeDeEjemplo(AHORA), AHORA).pestanas).toHaveLength(7);
  });

  it.each([
    ['nada', null],
    ['un texto', 'hola'],
    ['una lista', [bien()]],
    ['otra fuente', bien({ fuente: 'otra' })],
    ['para otro', bien({ para: 'otro' })],
    ['la versión 1', bien({ v: 1 })],
    ['la versión como texto', bien({ v: '2' })],
    ['otro tipo', bien({ tipo: 'finales' })],
    ['una clave de más', bien({ html: '<b>' })],
    ['sin guarda', sin(bien(), 'guarda')],
    ['sin alumno', sin(bien(), 'alumno')],
    ['sin pestañas', sin(bien(), 'pestanas')],
    ['vinculada como texto', bien({ vinculada: 'true' })],
    ['guarda como número', bien({ guarda: 1 })],
    ['sin vincular y guardando', bien({ vinculada: false, guarda: true, alumno: null, pestanas: [] })],
    ['sin vincular con alumno', bien({ vinculada: false, guarda: false, pestanas: [] })],
    ['sin vincular con pestañas', bien({ vinculada: false, guarda: false, alumno: null })],
    ['un alumno vacío', bien({ alumno: '  ' })],
    ['un alumno largo', bien({ alumno: 'a'.repeat(121) })],
    ['un alumno que no es texto', bien({ alumno: 7 })],
    ['pestañas que no son una lista', bien({ pestanas: { examenes: pestana() } })],
    ['8 pestañas', bien({ pestanas: Array(8).fill(pestana()) })],
    ['una pestaña repetida', bien({ pestanas: [pestana(), pestana()] })],
    ['una pestaña que no existe', bien({ pestanas: [pestana({ clave: 'inscripcion' })] })],
    ['una clave con otro título', bien({ pestanas: [pestana({ titulo: 'Examenes' })] })],
    ['una pestaña con una clave de más', bien({ pestanas: [pestana({ url: 'https://x' })] })],
    ['una pestaña sin fecha', bien({ pestanas: [sin(pestana(), 'fecha')] })],
    ['una fecha del futuro', bien({ pestanas: [pestana({ fecha: AHORA + 86_400_001 })] })],
    ['una fecha negativa', bien({ pestanas: [pestana({ fecha: -1 })] })],
    ['una fecha con decimales', bien({ pestanas: [pestana({ fecha: AHORA - 0.5 })] })],
    ['una fecha como texto', bien({ pestanas: [pestana({ fecha: String(AHORA) })] })],
    ['bloques que no son una lista', bien({ pestanas: [pestana({ bloques: 'hola' })] })],
    ['61 bloques', bien({ pestanas: [pestana({ bloques: Array(61).fill({ t: 'texto', texto: 'x' }) })] })],
    ['un bloque de otra forma', conBloque({ t: 'imagen', src: 'x' })],
    ['un bloque que no es un objeto', conBloque('hola')],
    ['un texto con una clave de más', conBloque({ t: 'texto', texto: 'x', html: '<b>x</b>' })],
    ['un texto que no es texto', conBloque({ t: 'texto', texto: 7 })],
    ['un texto largo', conBloque({ t: 'texto', texto: 'x'.repeat(2001) })],
    ['un título largo', conBloque({ t: 'titulo', texto: 'x'.repeat(201) })],
    ['una tabla sin filas', conBloque(sin(tabla(), 'filas'))],
    ['una tabla con una clave de más', conBloque(tabla({ id: 1 }))],
    ['una tabla con un título largo', conBloque(tabla({ titulo: 'x'.repeat(201) }))],
    ['una tabla con título que no es texto', conBloque(tabla({ titulo: 7 }))],
    ['31 columnas', conBloque(tabla({ columnas: Array(31).fill('c'), filas: [] }))],
    ['501 filas', conBloque(tabla({ filas: Array(501).fill(['a']) }))],
    ['una fila más ancha que las columnas', conBloque(tabla({ filas: [['a', 'b', 'c', 'd']] }))],
    ['sin columnas, una fila de 31 celdas', conBloque(tabla({ columnas: [], filas: [Array(31).fill('a')] }))],
    ['una fila que no es una lista', conBloque(tabla({ filas: ['a b c'] }))],
    ['una celda que no es texto', conBloque(tabla({ filas: [['a', 7, 'c']] }))],
    ['una celda nula', conBloque(tabla({ filas: [['a', null, 'c']] }))],
    ['una celda larga', conBloque(tabla({ filas: [['x'.repeat(301)]] }))],
    ['una columna larga', conBloque(tabla({ columnas: ['x'.repeat(301)] }))],
    ['un objeto con otro prototipo', Object.assign(Object.create({ v: 2 }), sin(bien(), 'v'))],
  ])('ignora %s', (_, datos) => {
    expect(leerPestanas(datos, AHORA)).toBeNull();
  });
});

describe('de quién son las copias', () => {
  it.each([
    ['PEREZ, Juan Ignacio', 'Juan Pérez', true],
    ['PEREZ, Juan', 'Juan Ignacio Pérez', true],
    ['PEREZ, Juan Ignacio', 'Juan Ignacio PEREZ', true],
    ['DE LA FUENTE, María José', 'María José de la Fuente', true],
    ['MUÑOZ, Ana', 'Ana Muñoz', true],
    ['GOMEZ, Ana', 'Juan Pérez', false],
    ['PEREZ, Ana', 'Juan Pérez', false],
    ['PEREZ, Juan', 'Juan', false],
    ['PEREZ', 'Pérez', false],
    ['PEREZ, Juan', '', false],
    ['', '', false],
  ])('«%s» y «%s»: %s', (deSysacad, delCampus, igual) => {
    expect(mismoAlumno(deSysacad, delCampus)).toBe(igual);
    expect(mismoAlumno(delCampus, deSysacad)).toBe(igual);
  });
});

describe('¿son tuyas?', () => {
  afterEach(() => {
    fijarUsuario(null);
    localStorage.clear();
  });

  it('un nombre distinto en el campus vale después de que el alumno dice que son suyas, solo ese par', () => {
    fijarUsuario(7);
    expect(mismoAlumno('PEREZ, Juan Ignacio', 'Juancito Gamer')).toBe(false);
    sonMiasLasDeSysacad(huellaDelPar('PEREZ, Juan Ignacio', 'Juancito Gamer'));
    // Accents, capitals and order don't change the pair; the names never get stored.
    expect(mismoAlumno('Juan Ignacio Pérez', 'GAMER, juancito')).toBe(true);
    expect(mismoAlumno('GOMEZ, Ana', 'Juancito Gamer')).toBe(false);
    expect(JSON.stringify(mioActual())).not.toMatch(/perez|juancito/i);
    // Another student of the same browser doesn't inherit it.
    fijarUsuario(8);
    expect(mismoAlumno('PEREZ, Juan Ignacio', 'Juancito Gamer')).toBe(false);
  });

  it('sin nombre de un lado, nunca', () => {
    fijarUsuario(7);
    sonMiasLasDeSysacad(huellaDelPar('', 'Juancito Gamer'));
    expect(mismoAlumno('', 'Juancito Gamer')).toBe(false);
  });
});

describe('cuándo se vio', () => {
  const ahora = new Date(2026, 10, 11, 15, 0).getTime();
  it.each([
    [new Date(2026, 10, 11, 14, 59, 30), 'recién'],
    [new Date(2026, 10, 11, 14, 40), 'hace 20 min'],
    [new Date(2026, 10, 11, 9, 0), 'hace 6 h'],
    [new Date(2026, 10, 10, 23, 0), 'ayer'],
    [new Date(2026, 10, 8, 10, 0), 'hace 3 días'],
    [new Date(2026, 9, 3, 10, 0), 'el 3 de octubre'],
    [new Date(2025, 11, 20, 10, 0), 'el 20 de diciembre de 2025'],
  ])('%s', (fecha, texto) => {
    expect(vistoHace(fecha.getTime(), ahora)).toBe(texto);
  });

  it('la fecha entera', () => {
    expect(fechaCompleta(new Date(2026, 10, 10, 14, 5).getTime())).toBe('martes, 10 de noviembre de 2026, 14:05');
  });
});

describe('buscar en una tabla', () => {
  const filas = [['1', 'Análisis Matemático I', 'Aprobada'], ['2', 'Análisis Matemático II', 'Regular'], ['1', 'Física I', 'Aprobada']];
  it('sin tildes ni mayúsculas, con todas las palabras', () => {
    expect(filasQueCoinciden(filas, 'analisis')).toHaveLength(2);
    expect(filasQueCoinciden(filas, 'ANÁLISIS regular')).toEqual([filas[1]]);
    expect(filasQueCoinciden(filas, '  ')).toBe(filas);
    expect(filasQueCoinciden(filas, 'química')).toEqual([]);
  });
});

describe('the tables of a tab line up', () => {
  const tabla = (columnas, filas) => ({ t: 'tabla', titulo: null, columnas, filas });
  it('the ones with the same columns share their widths; one alone, or a single column, keeps its own', () => {
    const bloques = [
      tabla(['Instancia', 'Fecha', 'Nota'], [['Primer parcial', '18/09/2026', '7']]),
      { t: 'titulo', texto: 'Otra' },
      tabla(['Instancia', 'Fecha', 'Nota'], [['Recuperatorio del segundo parcial', '09/10/2026', '8']]),
      tabla(['Materia', 'Estado'], [['Física I', 'Aprobada']]),
      tabla(['Solo'], [['x']]),
    ];
    const a = anchosParejos(bloques);
    expect(a[0]).toBe(a[2]);
    expect(a[0].partes.map(Math.round)).toEqual([70, 21, 9]);
    expect(a[0].minimo).toBe(33 + 10 + 4 + 2 * 3);
    expect([a[1], a[3], a[4]]).toEqual([null, null, null]);
  });
});
