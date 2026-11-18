import { describe, expect, it } from 'vitest';
import {
  ahoraYDespues, armarSemana, calendarioViejo, codigoDeComision, comisionDe, comisionesCon, comisionesDeLaMateria, comisionesPorAnio, cuatrimestreEl, cuatrimestreQueSigue, esLaMateria, materiaDelCurso, materiasDeLosHorarios,
  cicloDe, eventosDeLaFacultad, horaEnTexto, letraDe, letrasDelAlumno, notaDeCarrera, porCarrera, proximoLlamado, sinClasesEl,
} from './facultad';
import { tipoDe } from './tipos';

const CAL = {
  ciclo: '2026/2027',
  desde: '2026-03-16',
  hasta: '2027-03-14',
  cuatrimestres: [{ numero: 1, desde: '2026-03-16', hasta: '2026-07-03' }, { numero: 2, desde: '2026-07-20', hasta: '2026-11-13' }],
  recesos: [{ titulo: 'Receso de invierno', desde: '2026-07-06', hasta: '2026-07-17' }],
  llamados: [{ numero: 5, examenes: ['2026-11-16', '2026-11-19'], consulta: ['2026-11-09', '2026-11-13'] }],
  tramites: [{ titulo: 'Inscripción a cursar las del segundo cuatrimestre', desde: '2026-07-06', hasta: '2026-07-20' }],
  sinClases: [['2026-09-21', 'sinActividad', 'Día del Estudiante'], ['2026-10-12', 'feriado', 'Día del Respeto a la Diversidad Cultural']],
};

describe('the calendar', () => {
  it('says why a day has no classes', () => {
    expect(sinClasesEl('2026-09-21', CAL)).toEqual({ tipo: 'sinActividad', titulo: 'Día del Estudiante' });
    expect(sinClasesEl('2026-07-10', CAL)).toEqual({ tipo: 'receso', titulo: 'Receso de invierno' });
    expect(sinClasesEl('2026-09-22', CAL)).toBeNull();
  });

  it('knows the cuatrimestre of a day, and the one that comes in between', () => {
    expect(cuatrimestreEl('2026-04-01', CAL)).toBe(1);
    expect(cuatrimestreEl('2026-07-10', CAL)).toBeNull();
    expect(cuatrimestreQueSigue('2026-07-10', CAL)).toBe(2);
    expect(cuatrimestreQueSigue('2026-12-01', CAL)).toBe(2);
    expect(cuatrimestreQueSigue('2026-02-01', CAL)).toBe(1);
  });

  it('gets old once its cycle is over', () => {
    expect(calendarioViejo('2027-03-14', CAL)).toBe(false);
    expect(calendarioViejo('2027-03-15', CAL)).toBe(true);
  });

  it('turns into whole-day events of the faculty, with the exams as finals', () => {
    const eventos = eventosDeLaFacultad(CAL);
    expect(eventos.every((e) => e.propio === 'facultad' && e.sinHora)).toBe(true);
    const titulos = eventos.map((e) => e.titulo);
    expect(titulos).toContain('Mesa de examen');
    expect(titulos).toContain('Consultas para las mesas de examen, hasta el 13 de noviembre');
    expect(titulos).toContain('Último día de inscripción a cursar las del segundo cuatrimestre');
    expect(titulos).toContain('Día del Estudiante (sin clases)');
    expect(titulos).toContain('Día del Respeto a la Diversidad Cultural (feriado)');
    expect(eventos.filter((e) => e.tipo === 'final')).toHaveLength(2);
    // The rest are «otro» on purpose: guessed from the title, the consultations would read as an exam.
    expect(eventos.filter((e) => e.tipo !== 'final').every((e) => e.tipo === 'otro')).toBe(true);
    expect(tipoDe(eventos.find((e) => e.titulo.startsWith('Consultas')))).toBe('otro');
    expect(new Set(eventos.map((e) => e.id)).size).toBe(eventos.length);
  });

  it('finds the next exam call', () => {
    expect(proximoLlamado('2026-11-08', CAL)).toEqual({ numero: 5, desde: '2026-11-16', hasta: '2026-11-19' });
    expect(proximoLlamado('2026-11-20', CAL)).toBeNull();
  });
});

describe('codigoDeComision', () => {
  it('reads a commission as the faculty writes it', () => {
    expect(codigoDeComision('Física II - 2026 - 2K3')).toBe('2K03');
    expect(codigoDeComision('Análisis Matemático I - Comisión 1K1')).toBe('1K01');
    expect(codigoDeComision('3k02')).toBe('3K02');
    expect(codigoDeComision('Electiva 3EK01')).toBe('3EK01');
    expect(codigoDeComision('Química General 1V04')).toBe('1V04');
  });

  it('knows the letter of every career, and only those', () => {
    expect(codigoDeComision('Hidráulica General y Aplicada 3O01')).toBe('3O01');
    expect(codigoDeComision('Máquinas Eléctricas I - 3Q1')).toBe('3Q01');
    expect(codigoDeComision('Estabilidad I 2S01')).toBe('2S01');
    expect(codigoDeComision('Física II 2C01')).toBeNull();
    expect(codigoDeComision('Física II 2M01')).toBeNull();
  });

  it('reads the electives of Química with the E last', () => {
    expect(codigoDeComision('Introducción a la Tecnología de los Alimentos 2V02E')).toBe('2EV02');
    expect(codigoDeComision('2EV02')).toBe('2EV02');
  });

  it('is null when there is none', () => {
    expect(codigoDeComision('Física II')).toBeNull();
    expect(codigoDeComision('Redes 2026')).toBeNull();
    expect(codigoDeComision('IPv6')).toBeNull();
  });
});

describe('horaEnTexto', () => {
  it('writes the minutes of the day as a clock, also after midnight', () => {
    expect([435, 600, 1405, 1440, 1450].map(horaEnTexto)).toEqual(['07:15', '10:00', '23:25', '00:00', '00:10']);
  });
});

describe('careers', () => {
  it('takes the letter of a commission', () => {
    expect(['3K02', '3EK01', '3AK01', '2V01', '1O03', 'ninguna', null].map(letraDe)).toEqual(['K', 'K', 'K', 'V', 'O', null, null]);
  });

  it('knows the careers of a student from their commissions and the names of their courses', () => {
    const mio = { materias: { 10: { comision: '2V01' }, 11: { comision: 'ninguna' } }, horario: { extras: [{ id: 1, materia: 'Física I', comision: '1V02' }, { id: 2, materia: 'Economía', comision: null }] } };
    expect(letrasDelAlumno(mio, [{ id: 12, nombre: 'Inglés I - 1K3' }, { id: 13, nombre: 'Física II' }])).toEqual(['V', 'K']);
    expect(letrasDelAlumno(undefined)).toEqual([]);
  });

  it('groups commissions by career, the student\'s first', () => {
    const opciones = [{ codigo: '1K01', turno: 'Mañana' }, { codigo: '1V01', turno: 'Mañana' }, { codigo: '1O02', turno: 'Tarde' }, { codigo: '1K13', turno: 'Noche' }];
    expect(porCarrera(opciones).map((g) => [g.nombre, g.opciones.map((o) => o.codigo)])).toEqual([['Civil', ['1O02']], ['Química', ['1V01']], ['Sistemas', ['1K01', '1K13']]]);
    expect(porCarrera(opciones, ['K']).map((g) => g.nombre)).toEqual(['Sistemas', 'Civil', 'Química']);
    expect(porCarrera([])).toEqual([]);
  });

  it('takes the year of the schedules of the student\'s careers, the oldest', () => {
    const datos = { ciclo: 2027, carreras: [{ letra: 'K', ciclo: 2027 }, { letra: 'V', ciclo: 2026 }, { letra: 'O', ciclo: 2027 }] };
    expect(cicloDe(datos, ['K'])).toBe(2027);
    expect(cicloDe(datos, ['K', 'V'])).toBe(2026);
    expect(cicloDe(datos, [])).toBe(2027);
    expect(cicloDe({ ciclo: 2026 }, ['K'])).toBe(2026);
    expect(cicloDe(null)).toBeNull();
  });

  it('says what the schedules of a career lack', () => {
    const datos = { comisiones: ['1S01', '1S02', '2S01', '1Q01', '2Q01', '1V01'].map((codigo) => ({ codigo, turno: 'Noche', clases: [] })) };
    expect(notaDeCarrera(datos, { letra: 'V', soloBasicas: [], faltan: [] })).toBeNull();
    expect(notaDeCarrera(datos, { letra: 'Q', soloBasicas: ['1Q01', '2Q01'], faltan: [{ texto: '1º 01', motivo: 'no-abre' }] })).toBe('Solo las materias básicas. Los horarios de su página no se pueden leer.');
    expect(notaDeCarrera(datos, { letra: 'S', soloBasicas: ['1S01', '1S02'], faltan: [{ texto: '101', motivo: 'sin-texto' }, { texto: '102', motivo: 'sin-texto' }] })).toBe('De 1S01 y 1S02, solo las materias básicas.');
    expect(notaDeCarrera({ comisiones: [{ codigo: '3O01', clases: [] }] }, { letra: 'O', soloBasicas: [], faltan: [{ texto: '5º Año – Materias Electivas', motivo: 'no-abre' }] })).toBe('No abre «5º Año – Materias Electivas».');
    expect(notaDeCarrera({ comisiones: [{ codigo: '3O01', clases: [] }] }, { letra: 'O', soloBasicas: [], faltan: [{ texto: 'A', motivo: 'no-abre' }, { texto: 'B', motivo: 'no-abre' }, { texto: 'C', motivo: 'sin-texto' }] })).toBe('No abren «A» y «B». Un horario es una imagen y no se puede leer.');
    expect(notaDeCarrera(datos, { letra: 'K', soloBasicas: [], faltan: [] })).toBe('Sus horarios no se pueden leer.');
  });
});

describe('esLaMateria', () => {
  it('matches a course with its subject, with the numerals right', () => {
    expect(esLaMateria('Física II - 2026 - 2K3', 'Física II')).toBe(true);
    expect(esLaMateria('Física II - 2026 - 2K3', 'Física I')).toBe(false);
    expect(esLaMateria('Bases de Datos (3K02)', 'Bases de Datos')).toBe(true);
    expect(esLaMateria('Bases de Datos', 'Comunicación de Datos')).toBe(false);
  });
});

const DATOS = {
  ciclo: 2026,
  materias: ['Bases de Datos', 'Economía', 'Física II', 'Ciencia de Datos'],
  comisiones: [
    { codigo: '2K01', turno: 'Mañana', clases: [[1, 1, 480, 600, 2, 'Ruiz'], [2, 1, 480, 600, 2, 'Ruiz']] },
    { codigo: '3K02', turno: 'Mañana', clases: [[1, 2, 480, 675, 0, 'Reynares'], [2, 2, 480, 675, 0, 'Reynares'], [1, 3, 525, 675, 1, '']] },
    { codigo: '3K04', turno: 'Tarde', clases: [[1, 2, 840, 1000, 0, 'Meca'], [2, 2, 840, 1000, 0, 'Meca']] },
    { codigo: '3EK01', turno: 'Mañana', clases: [[2, 5, 435, 600, 3, 'Bigatti']] },
  ],
};

describe('the student\'s week', () => {
  const cursos = [{ id: 10, nombre: 'Bases de Datos' }, { id: 11, nombre: 'Economía' }, { id: 12, nombre: 'Física II - 2026 - 2K1' }, { id: 13, nombre: 'Ciencia de Datos' }];

  it('takes each course from its own commission or the one in its name, never one for all', () => {
    const mio = { horario: { extras: [] }, materias: { 10: { comision: '3K04', aulas: { 2: 'Aula 302' } }, 11: { comision: '3K02' } } };
    expect(comisionDe(cursos[0], mio)).toEqual({ codigo: '3K04', origen: 'elegida' });
    expect(comisionDe(cursos[2], mio)).toEqual({ codigo: '2K01', origen: 'nombre' });
    // An old commission «for the whole week» is not used any more.
    expect(comisionDe(cursos[3], mio)).toEqual({ codigo: null, origen: null });
    const { clases, sinHorario, materias } = armarSemana({ datos: DATOS, cursos, mio, cuatrimestre: 1 });
    expect(clases.map((c) => [c.nombre, c.dia, c.desde, c.comision, c.aula])).toEqual([
      ['Física II - 2026 - 2K1', 1, 480, '2K01', ''],
      ['Bases de Datos', 2, 840, '3K04', 'Aula 302'],
      ['Economía', 3, 525, '3K02', ''],
    ]);
    // Without a commission yet: the student picks one for it.
    expect(sinHorario.map((s) => s.curso.id)).toEqual([13]);
    expect(materias.map((m) => [m.clave, m.codigo, m.origen])).toEqual([['c10', '3K04', 'elegida'], ['c11', '3K02', 'elegida'], ['c12', '2K01', 'nombre'], ['c13', null, null]]);
    expect(comisionesCon(DATOS, 'Ciencia de Datos')).toEqual([{ codigo: '3EK01', turno: 'Mañana' }]);
  });

  it('adds a subject of the schedules without a campus course, in its commission', () => {
    const mio = { horario: { clases: [], extras: [{ id: 5, materia: 'Ciencia de Datos', comision: '3EK01', aulas: { 5: 'Lab 2' } }, { id: 6, materia: 'Economía', comision: null, aulas: {} }] } };
    const { clases, sinHorario, materias } = armarSemana({ datos: DATOS, cursos: [], mio, cuatrimestre: 2 });
    expect(clases.map((c) => [c.id, c.extra, c.cursoId, c.nombre, c.dia, c.desde, c.comision, c.aula])).toEqual([['x5-5-435-0', 5, null, 'Ciencia de Datos', 5, 435, '3EK01', 'Lab 2']]);
    expect(sinHorario.map((s) => s.extra.id)).toEqual([6]);
    expect(materias.map((m) => m.clave)).toEqual(['x5', 'x6']);
    expect(comisionesDeLaMateria(DATOS, 'Economía')).toEqual([{ codigo: '3K02', turno: 'Mañana' }]);
    expect(comisionesDeLaMateria(DATOS, 'Otra')).toEqual([]);
    expect(materiasDeLosHorarios(DATOS)).toEqual(['Bases de Datos', 'Ciencia de Datos', 'Economía', 'Física II']);
  });

  it('leaves out a course marked as not taken, also with its classes changed by hand', () => {
    const mio = {
      horario: { aMano: { cursos: { 11: [{ dia: 4, desde: 1080, hasta: 1140, aula: '', cuatrimestre: 0 }] }, extras: {} } },
      materias: { 13: { comision: 'ninguna' }, 10: { comision: '3K02' }, 11: { comision: 'ninguna' } },
    };
    const { clases, sinHorario, materias } = armarSemana({ datos: DATOS, cursos, mio, cuatrimestre: 2 });
    expect(sinHorario).toEqual([]);
    expect(clases.map((c) => c.nombre)).toEqual(['Física II - 2026 - 2K1', 'Bases de Datos']);
    expect(materias.filter((m) => m.noLaCursa).map((m) => [m.clave, m.aMano])).toEqual([['c11', false], ['c13', false]]);
  });

  it('a subject changed by hand takes those classes in place of the faculty\'s, each in its cuatrimestre', () => {
    const k = (dia, desde, hasta, cuatrimestre, aula = '') => ({ dia, desde, hasta, aula, cuatrimestre });
    const mio = {
      horario: {
        extras: [{ id: 5, materia: 'Ciencia de Datos', comision: '3EK01', aulas: { 5: 'Lab 2' } }],
        aMano: { cursos: { 10: [k(1, 600, 720, 1, 'Aula 9'), k(5, 480, 540, 2), k(3, 1080, 1140, 0)], 13: [] }, extras: { 5: [k(5, 435, 520, 0)] } },
      },
      materias: { 10: { comision: '3K04', aulas: { 3: 'Aula 302' } } },
    };
    const { clases, sinHorario, materias } = armarSemana({ datos: DATOS, cursos, mio, cuatrimestre: 1 });
    const deBases = clases.filter((c) => c.cursoId === 10);
    expect(deBases.map((c) => [c.id, c.indice, c.dia, c.desde, c.aula, c.materia, c.aMano, c.comision])).toEqual([
      ['10-m0', 0, 1, 600, 'Aula 9', 'Bases de Datos', true, '3K04'],
      ['10-m2', 2, 3, 1080, '', 'Bases de Datos', true, '3K04'],
    ]);
    expect(clases.find((c) => c.extra === 5)).toMatchObject({ id: 'x5-m0', aMano: true, cambiada: true, desde: 435, hasta: 520, aula: '' });
    // One the same as the faculty's (only its classroom is new) isn't a changed one.
    const igual = { ...mio, horario: { ...mio.horario, aMano: { cursos: { 10: [k(2, 840, 1000, 1, 'Aula 9')] }, extras: {} } } };
    expect(armarSemana({ datos: DATOS, cursos, mio: igual, cuatrimestre: 1 }).clases.find((c) => c.cursoId === 10)).toMatchObject({ aMano: true, cambiada: false, aula: 'Aula 9' });
    // An empty list is a subject without classes by choice: not one to pick a commission for (Economía is).
    expect(sinHorario.map((s) => s.curso.id)).toEqual([11]);
    expect(materias.map((m) => [m.clave, m.aMano])).toEqual([['c10', true], ['c11', false], ['c12', false], ['c13', true], ['x5', true]]);
    // The faculty's classes stay at hand, with their cuatrimestre, to start changing them.
    expect(materias[0].deLaFacultad).toEqual([k(2, 840, 1000, 1), k(2, 840, 1000, 2)]);
    expect(materias[4].deLaFacultad).toEqual([k(5, 435, 600, 2, 'Lab 2')]);
    expect(armarSemana({ datos: DATOS, cursos, mio, cuatrimestre: 2 }).clases.filter((c) => c.cursoId === 10).map((c) => c.dia)).toEqual([3, 5]);
  });

  it('knows which official subject a course is, the longest that matches, none on a tie', async () => {
    expect(materiaDelCurso(DATOS, 'Física II - 2026 - 2K1')).toBe('Física II');
    expect(materiaDelCurso(DATOS, 'Seminario')).toBe(null);
    const { HORARIOS_DEMO } = await import('./demoHorario');
    expect(['Materia de ejemplo A', 'Materia de ejemplo B', 'Materia de ejemplo C'].map((n) => materiaDelCurso(HORARIOS_DEMO, n))).toEqual(['Materia de ejemplo A', 'Materia de ejemplo B', 'Materia de ejemplo C']);
    expect(comisionesDeLaMateria(HORARIOS_DEMO, 'Ingeniería y calidad de ejemplo').map((c) => c.codigo)).toEqual(['3K01', '3K04', '3V01']);
    expect(HORARIOS_DEMO.carreras.map((c) => notaDeCarrera(HORARIOS_DEMO, c))).toEqual([null, 'No abre «5V01 turno noche».']);
  });

  it('says what goes on now and what comes next today', () => {
    const clases = [{ dia: 2, desde: 480, hasta: 600, nombre: 'A' }, { dia: 2, desde: 660, hasta: 720, nombre: 'B' }];
    const martes = (h, m) => new Date(2026, 10, 10, h, m);
    expect(ahoraYDespues(clases, martes(9, 0))).toEqual({ ahora: clases[0], despues: clases[1] });
    expect(ahoraYDespues(clases, martes(10, 30))).toEqual({ ahora: null, despues: clases[1] });
    expect(ahoraYDespues(clases, martes(13, 0))).toEqual({ ahora: null, despues: null });
  });

  it('lists the commissions by year, without electives', () => {
    expect(comisionesPorAnio(DATOS)).toEqual([[2, [{ codigo: '2K01', turno: 'Mañana' }]], [3, [{ codigo: '3K02', turno: 'Mañana' }, { codigo: '3K04', turno: 'Tarde' }]]]);
  });
});
