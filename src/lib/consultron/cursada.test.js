import { describe, expect, it } from 'vitest';
import { CALENDARIO } from '../../data/facultad/calendario.js';
import { diaPreguntado, esDeCursada, piezaDeMesasDelMes, piezaDeCalendario, piezaDeClases, piezaDeFacultad, piezaDelDia, piezaDePendientes, piezasDeLoQueViene } from './cursada';

const CAL = {
  cuatrimestres: [{ numero: 2, desde: '2026-07-20', hasta: '2026-11-13' }],
  recesos: [{ titulo: 'Receso de verano', desde: '2026-12-21', hasta: '2027-02-03' }],
  llamados: [{ numero: 5, examenes: ['2026-11-30', '2026-12-04'], consulta: [] }],
  sinClases: [['2026-11-23', 'feriado', 'Día de la Soberanía Nacional']],
};
// Tuesday 10 November 2026, 10:00 in Argentina.
const AHORA = Date.UTC(2026, 10, 10, 13, 0);
const s = (iso) => Date.parse(iso) / 1000;

describe('esDeCursada', () => {
  it('lo que vence, sus clases y las fechas de la facultad', () => {
    for (const q of ['¿Qué tengo esta semana?', '¿Cuándo vence el TP de Redes?', '¿Cuándo es el parcial de Análisis?', '¿Hay clases mañana?', '¿Cuándo son las mesas de diciembre?', 'Mis entregas pendientes', '¿Qué curso los jueves?', 'Cual es la proxima tarea que vence', '¿Qué vence esta semana?', '¿Cuál es mi próxima entrega?', 'Tareas pendientes', '¿Cuándo es el próximo parcial?', 'que tareas me quedan']) {
      expect(esDeCursada(q), q).toBe(true);
    }
  });

  it('las fechas que cargó y las tareas de Classroom', () => {
    for (const q of ['¿Cuáles son mis fechas?', '¿Qué fechas tengo en diciembre?', 'Decime las fechas que cargué', '¿Tengo tareas de Classroom?', '¿Qué entregas en Classroom me faltan?']) {
      expect(esDeCursada(q), q).toBe(true);
    }
  });

  it('no un tema que usa esas palabras', () => {
    for (const q of ['¿Qué es una derivada parcial?', '¿Qué se usa hoy en redes?', '¿Qué es un horario de procesos en planificación?', '¿Cómo se entrega un paquete en TCP?']) {
      expect(esDeCursada(q), q).toBe(false);
    }
  });
});

describe('las piezas', () => {
  it('lo pendiente, lo próximo primero y lo vencido dicho', () => {
    const p = piezaDePendientes(
      [
        { tipo: 'Entrega', titulo: 'TP 2', materia: 'Redes', vence: s('2026-11-12T23:59:00-03:00') },
        { tipo: 'Cuestionario', titulo: 'Unidad 3', materia: 'Simulación', vence: s('2026-11-10T08:00:00-03:00') },
        { tipo: 'Entrega', titulo: 'Viejo', materia: 'Física', vence: s('2026-10-01T10:00:00-03:00') },
      ],
      AHORA,
    );
    expect(p.trozo.texto).toMatch(/^Lo que tiene pendiente en el campus: Cuestionario «Unidad 3» de Simulación, vence el martes, 10 de noviembre .*\(ya venció\); Entrega «TP 2» de Redes, vence el jueves, 12 de noviembre/);
    expect(p.trozo.texto).not.toContain('Viejo');
    expect(p.trozo.fuente).toEqual({ tipo: 'guia', nombre: 'Tus pendientes', a: '/' });
    expect(piezaDePendientes([], AHORA).trozo.texto).toBe('No tiene nada pendiente en el campus.');
  });

  it('el calendario del campus de los próximos días', () => {
    const p = piezaDeCalendario([{ titulo: 'Parcial 2', materia: 'Análisis', cuando: s('2026-11-18T18:00:00-03:00') }, { titulo: 'Lejos', materia: 'X', cuando: s('2027-03-01T10:00:00-03:00') }], AHORA);
    expect(p.trozo.texto).toContain('«Parcial 2» de Análisis, el miércoles, 18 de noviembre a las 18:00');
    expect(p.trozo.texto).not.toContain('Lejos');
    expect(piezaDeCalendario([], AHORA)).toBeNull();
  });

  it('una fecha del campus corregida sin hora, y una marcada como hecha', () => {
    const p = piezaDeCalendario(
      [
        { titulo: 'Parcial 2', materia: 'Análisis', cuando: s('2026-11-18T12:00:00-03:00'), sinHora: true },
        { titulo: 'TP 4', materia: 'Redes', cuando: s('2026-11-12T23:59:00-03:00'), momento: 'vence', hecha: true },
      ],
      AHORA,
    );
    expect(p.trozo.texto).toBe('En el calendario del campus: vence «TP 4» de Redes, el jueves, 12 de noviembre a las 23:59 (ya lo marcó como hecho); «Parcial 2» de Análisis, el miércoles, 18 de noviembre.');
  });

  it('con fechas suyas o tareas de Classroom, todo va en una sola lista por fecha', () => {
    const campus = [{ tipo: 'Entrega', titulo: 'TP 4', materia: 'Redes', vence: s('2026-11-12T23:59:00-03:00') }];
    const propias = [
      { titulo: 'Coloquio', materia: 'Física II', cuando: s('2027-02-10T09:00:00-03:00'), tipo: 'final', propio: 'evento' },
      { titulo: 'Leer capítulo 3', materia: 'Redes', cuando: s('2026-11-11T12:00:00-03:00'), sinHora: true, propio: 'tarea' },
      { titulo: 'Juntada de estudio', materia: null, cuando: s('2026-11-14T16:30:00-03:00'), tipo: 'otro', propio: 'evento' },
      { titulo: 'Recuperatorio', materia: 'Análisis', cuando: s('2026-11-20T18:00:00-03:00'), propio: 'fecha' },
      { titulo: 'Ya fue', materia: 'Redes', cuando: s('2026-10-01T10:00:00-03:00'), tipo: 'parcial', propio: 'evento' },
    ];
    const [p, ...mas] = piezasDeLoQueViene({ campus, propias }, AHORA);
    expect(mas).toEqual([]);
    expect(p.trozo.texto).toBe(
      'Lo que tiene por delante, por fecha: tarea «Leer capítulo 3» de Redes, el miércoles, 11 de noviembre; Entrega «TP 4» de Redes, vence el jueves, 12 de noviembre a las 23:59; fecha «Juntada de estudio», el sábado, 14 de noviembre a las 16:30; parcial «Recuperatorio» de Análisis, el viernes, 20 de noviembre a las 18:00; final «Coloquio» de Física II, el miércoles, 10 de febrero a las 09:00.',
    );
    expect(p.trozo.doc).toBe('cursada:pendientes');
    expect(p.trozo.fuente).toEqual({ tipo: 'guia', nombre: 'Tus pendientes y fechas', a: '/' });
  });

  it('lo que falta entregar en Classroom entra en la lista, y su texto no queda en una charla guardada', () => {
    const classroom = [{ titulo: 'TP 1', materia: 'Física II', vence: s('2026-11-20T23:59:00-03:00') }, { titulo: 'Guía 2', materia: 'Física II', vence: s('2026-11-09T23:59:00-03:00') }];
    const [p] = piezasDeLoQueViene({ campus: [], classroom }, AHORA);
    expect(p.trozo.texto).toBe('Lo que tiene por delante, por fecha: tarea de Classroom «Guía 2» de Física II, vence el lunes, 9 de noviembre a las 23:59 (ya venció); tarea de Classroom «TP 1» de Física II, vence el viernes, 20 de noviembre a las 23:59.');
    // charlas.js keeps no text of this piece.
    expect(p.trozo.doc).toBe('cursada:classroom');
  });

  it('solo con el campus, su fragmento de siempre; sin poder preguntarle y sin nada más, ninguno', () => {
    const [p, ...mas] = piezasDeLoQueViene({ campus: [] }, AHORA);
    expect(mas).toEqual([]);
    expect(p.trozo.texto).toBe('No tiene nada pendiente en el campus.');
    expect(p.trozo.fuente).toEqual({ tipo: 'guia', nombre: 'Tus pendientes', a: '/' });
    expect(piezasDeLoQueViene({ campus: null }, AHORA)).toEqual([]);
  });

  it('las clases por día, de lunes a domingo', () => {
    const p = piezaDeClases([
      { dia: 4, desde: 18 * 60, hasta: 21 * 60, nombre: 'Redes', aula: '305' },
      { dia: 1, desde: 8 * 60, hasta: 10 * 60 + 30, nombre: 'Análisis', aula: '' },
    ]);
    expect(p.trozo.texto).toBe('Sus clases de cada semana: el lunes, Análisis de 08:00 a 10:30; el jueves, Redes de 18:00 a 21:00, aula 305.');
    expect(piezaDeClases([])).toBeNull();
  });

  it('las fechas de la facultad desde hoy', () => {
    const p = piezaDeFacultad('2026-11-10', CAL);
    expect(p.trozo.texto).toContain('El 2.º cuatrimestre va del lunes, 20 de julio al viernes, 13 de noviembre.');
    expect(p.trozo.texto).toContain('Los llamados a finales que vienen: el 5.º, con mesas el lunes 30 de noviembre, viernes 4 de diciembre.');
    expect(p.trozo.texto).toContain('No hay clases el lunes, 23 de noviembre (Día de la Soberanía Nacional).');
    expect(p.trozo.texto).toContain('El receso de verano va del lunes, 21 de diciembre');
  });
});

describe('un día puntual', () => {
  // Wednesday 11 November 2026, 21:45.
  const miercoles = new Date(2026, 10, 11, 21, 45);
  it('las preguntas de Ignacio van a su cursada, con el día que nombran', () => {
    for (const q of ['Y para el viernes?', 'No no, que hay en mi calendario el viernes?', 'que tengo mañana?']) expect(esDeCursada(q), q).toBe(true);
    expect(diaPreguntado('Y para el viernes?', miercoles)).toEqual(new Date(2026, 10, 13));
    expect(diaPreguntado('que tengo mañana?', miercoles)).toEqual(new Date(2026, 10, 12));
    expect(diaPreguntado('¿qué hay hoy?', miercoles)).toEqual(new Date(2026, 10, 11));
    expect(diaPreguntado('¿Qué tengo esta semana?', miercoles)).toBeNull();
  });

  it('solo lo de ese día, también lo de la facultad', () => {
    const viernes = new Date(2026, 10, 13);
    const s = (d, h) => Math.floor(new Date(2026, 10, d, h).getTime() / 1000);
    const p = piezaDelDia(viernes, {
      campus: [{ tipo: 'Entrega', titulo: 'TP 2', materia: 'Redes', vence: s(13, 21) }, { tipo: 'Entrega', titulo: 'TP 3', materia: 'Redes', vence: s(16, 21) }],
      calendario: [{ titulo: 'TP 2', materia: 'Redes', cuando: s(13, 21), momento: 'vence' }, { titulo: 'Clase', materia: 'Redes', cuando: s(11, 22), momento: '' }],
      clases: [{ dia: 5, desde: 18 * 60, hasta: 20 * 60, nombre: 'Física II', aula: '' }],
    }, { ...CAL, cuatrimestres: [{ numero: 2, desde: '2026-07-20', hasta: '2026-11-13' }], llamados: [], recesos: [], tramites: [] });
    expect(p.trozo.texto).toBe('Lo que tiene el viernes, 13 de noviembre: vence entrega «TP 2» de Redes, a las 21:00; tiene clase de Física II de 18:00 a 20:00; termina el 2.º cuatrimestre. Nada más ese día.');
    const nada = piezaDelDia(new Date(2026, 10, 14), {}, { ...CAL, llamados: [], recesos: [], tramites: [] });
    expect(nada.trozo.texto).toMatch(/^El sábado, 14 de noviembre no tiene nada/);
  });
});

describe('las mesas de un mes', () => {
  it('todas las de ese mes, por llamado', () => {
    const p = piezaDeMesasDelMes('cuando son las mesas de diciembre?', '2026-11-11', CALENDARIO);
    expect(p.trozo.texto).toBe('Mesas de finales en diciembre: el 6.º llamado, el martes 1 de diciembre, miércoles 2 de diciembre, jueves 3 de diciembre, viernes 4 de diciembre; el 7.º llamado, el lunes 14 de diciembre, martes 15 de diciembre, miércoles 16 de diciembre, jueves 17 de diciembre, viernes 18 de diciembre. No hay otras mesas en diciembre.');
    expect(piezaDeMesasDelMes('¿Qué tengo en diciembre?', '2026-11-11', CALENDARIO)).toBeNull();
    expect(piezaDeMesasDelMes('mesas de enero', '2026-11-11', CALENDARIO).trozo.texto).toBe('No hay mesas de finales en enero.');
  });
});

