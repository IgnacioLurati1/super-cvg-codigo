import { describe, expect, it } from 'vitest';
import { normalizarEvento, normalizarEventoMes } from './datos';
import { claveDeHecha, conHechas, esHecha, estaHecha, hechaDe, hechasEnTexto } from './hechas';
import { pendientesDe } from './classroom';

const CAMPUS = 'https://frro.cvg.utn.edu.ar';
const CURSO = { id: 1, fullname: 'Materia A' };
const pendiente = (id, modulename, url) => normalizarEvento({ id, activityname: 'Algo', modulename, timesort: 1_800_000_000, course: CURSO, action: { url } });
const delMes = (id, url) => normalizarEventoMes({ id, name: 'Algo', eventtype: 'due', course: CURSO, timesort: 1_800_000_000, url });

describe('la clave de cada cosa', () => {
  it('una tarea y un cuestionario del campus van por su módulo, en Hoy y en el calendario', () => {
    expect(claveDeHecha(pendiente(2, 'assign', `${CAMPUS}/mod/assign/view.php?id=2`))).toBe('t2');
    expect(claveDeHecha(delMes(31, `${CAMPUS}/mod/assign/view.php?id=2`))).toBe('t2');
    expect(claveDeHecha(pendiente(3, 'quiz', `${CAMPUS}/mod/quiz/view.php?id=15`))).toBe('q15');
    expect(claveDeHecha(delMes(40, `${CAMPUS}/mod/quiz/view.php?id=15`))).toBe('q15');
  });

  it('otra fecha del campus va por su número, y una tarea de Classroom por el suyo', () => {
    expect(claveDeHecha(pendiente(7, 'forum', `${CAMPUS}/mod/forum/view.php?id=9`))).toBe('e7');
    expect(claveDeHecha(delMes(7, `${CAMPUS}/mod/forum/view.php?id=9`))).toBe('e7');
    const [tarea] = pendientesDe({ tareas: [{ id: '905', title: 'Informe', state: 'PUBLISHED', dueDate: { year: 2030, month: 1, day: 2 }, alternateLink: 'https://classroom.google.com/c/1/a/905' }] }, new Set(), { id: 1, nombre: 'Materia A' }, 1_800_000_000);
    expect(claveDeHecha(tarea)).toBe('c905');
  });

  it('lo propio del alumno y lo de la facultad no tienen', () => {
    expect(claveDeHecha({ id: 'e5', propio: 'evento' })).toBeNull();
    expect(claveDeHecha({ id: 't7-1', propio: 'tarea' })).toBeNull();
    expect(claveDeHecha({ id: 'fac-1', propio: 'facultad' })).toBeNull();
    expect(claveDeHecha({ id: 'otra-cosa' })).toBeNull();
    expect(claveDeHecha(null)).toBeNull();
  });
});

describe('si está hecha', () => {
  const mio = { hechas: { t2: 1_800_000_000, q15: -1_800_000_000 } };

  it('una marca sacada cuenta como pendiente', () => {
    expect(estaHecha(mio, 't2')).toBe(true);
    expect(estaHecha(mio, 'q15')).toBe(false);
    expect(estaHecha(mio, 't9')).toBe(false);
    expect(estaHecha(mio, null)).toBe(false);
    expect(estaHecha({}, 't2')).toBe(false);
  });

  it('en el calendario queda, con `hecha`', () => {
    const eventos = [delMes(31, `${CAMPUS}/mod/assign/view.php?id=2`), delMes(40, `${CAMPUS}/mod/quiz/view.php?id=15`), { id: 'e5', propio: 'evento' }];
    const con = conHechas(eventos, mio);
    expect(con.map((e) => Boolean(e.hecha))).toEqual([true, false, false]);
    expect(esHecha(mio, eventos[0])).toBe(true);
    // Without marks, the same list.
    expect(conHechas(eventos, { hechas: {} })).toBe(eventos);
  });

  it('se dice con el género de cada cosa y cuántas del día', () => {
    expect(hechaDe('q15')).toBe('hecho');
    expect(hechaDe('t2')).toBe('hecha');
    expect(hechaDe('c905')).toBe('hecha');
    // A forum or any other activity of the calendar: «hecho», the neutral word («Foro de presentación» no es «hecha»).
    expect(hechaDe('e77')).toBe('hecho');
    expect(hechasEnTexto([{}, {}])).toBe('');
    expect(hechasEnTexto([{ hecha: true }])).toBe(', hecha');
    expect(hechasEnTexto([{ hecha: true }, {}])).toBe(', una hecha');
    expect(hechasEnTexto([{ hecha: true }, { hecha: true }, {}])).toBe(', 2 hechas');
    expect(hechasEnTexto([{ hecha: true }, { hecha: true }])).toBe(', todas hechas');
  });
});
