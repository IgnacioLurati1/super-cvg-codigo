import { beforeEach, describe, expect, it } from 'vitest';
import { CAMPUS } from './moodle';
import {
  discusionDeEnlace, esNueva, esVieja, filtrarDiscusiones, guardarVistas, leerDiscusiones, leerForos, leerHilo, leerVistas, ordenarDiscusiones, postsNuevos, sinCita, sinRe,
} from './foros';

const MATERIAS = { 1: 'Física I', 2: 'Análisis Matemático I' };

describe('leerForos', () => {
  it('keeps the forums of the courses given, announcements first in each course', () => {
    const foros = leerForos([
      { id: 5, cmid: 50, course: 1, name: 'Consultas', type: 'general', numdiscussions: 3 },
      { id: 6, cmid: 60, course: 1, name: 'Avisos', type: 'news', numdiscussions: 9 },
      { id: 7, cmid: 70, course: 9, name: 'De otra materia', type: 'general' },
      { id: 'x', cmid: 80, course: 2, name: 'Sin número' },
    ], MATERIAS);
    expect(foros.map((f) => f.id)).toEqual([6, 5]);
    expect(foros[0]).toMatchObject({ tipo: 'avisos', materia: 'Física I', discusiones: 9, cmid: 60 });
  });
  it('shows the name as text', () => {
    expect(leerForos([{ id: 1, cmid: 2, course: 2, name: '<b>Foro</b> <script>x</script>de dudas' }], MATERIAS)[0].nombre).toBe('Foro xde dudas');
  });
});

describe('leerDiscusiones', () => {
  const foro = { id: 6, cmid: 60, nombre: 'Avisos', tipo: 'avisos', materiaId: 1, materia: 'Física I' };
  const lista = leerDiscusiones({ discussions: [
    { id: 100, discussion: 10, name: 'Re: Re: Cambio de aula', message: '<p>El jueves vamos al <b>aula 305</b>.</p>', userfullname: 'Ana Docente', usermodifiedfullname: 'Juan Alumno', created: 1000, timemodified: 2000, numreplies: 2, pinned: true, attachment: '1' },
    { id: 101, discussion: 11, name: 'Parcial', message: '', userfullname: 'Ana Docente', created: 1500, modified: 1500, numreplies: 0 },
    { id: 102, name: 'Sin número de discusión' },
  ] }, foro);
  it('reads each discussion with its forum and course', () => {
    expect(lista).toHaveLength(2);
    expect(lista[0]).toMatchObject({ id: 10, titulo: 'Cambio de aula', autor: 'Ana Docente', ultimo: 'Juan Alumno', actividad: 2000, respuestas: 2, fijada: true, adjuntos: true, avisos: true, materia: 'Física I', foroCmid: 60 });
    expect(lista[0].resumen).toBe('El jueves vamos al aula 305.');
    expect(lista[1].actividad).toBe(1500);
  });
  it('orders pinned first, then by the latest activity', () => {
    expect(ordenarDiscusiones([{ id: 1, actividad: 5 }, { id: 2, actividad: 9 }, { id: 3, actividad: 1, fijada: true }]).map((d) => d.id)).toEqual([3, 2, 1]);
  });
  it('searches without accents or case', () => {
    expect(filtrarDiscusiones(lista, 'AULA fisica').map((d) => d.id)).toEqual([10]);
    expect(filtrarDiscusiones(lista, '  ')).toHaveLength(2);
  });
});

describe('sinRe', () => {
  it('drops every answer prefix', () => {
    expect(sinRe('Re: RE: Re[2]: Rta: Consulta TP')).toBe('Consulta TP');
    expect(sinRe('Reunión de cátedra')).toBe('Reunión de cátedra');
  });
});

describe('sinCita', () => {
  it('drops the message a mail answer quotes', () => {
    const { html, citaba } = sinCita('<p>Gracias, ya lo vi.</p><div class="gmail_quote"><p>El mar, Ana escribió:</p><blockquote>texto viejo</blockquote></div>');
    expect(citaba).toBe(true);
    expect(html).toContain('Gracias');
    expect(html).not.toContain('texto viejo');
  });
  it('drops what comes after «… escribió:»', () => {
    const { html, citaba } = sinCita('<p>Sí, entra.</p><p>El mar, 3 nov 2026 a las 10:12, Ana Docente escribió:</p><p>¿Entra la unidad 3?</p>');
    expect(citaba).toBe(true);
    expect(html).toContain('Sí, entra.');
    expect(html).not.toContain('unidad 3');
  });
  it('keeps a quote the teacher put on purpose, and a post that is only a quote', () => {
    expect(sinCita('<blockquote>Enunciado</blockquote><p>Resuelvan esto.</p>')).toMatchObject({ citaba: false });
    const solo = sinCita('<p>Ana escribió:</p>');
    expect(solo.citaba).toBe(false);
    expect(solo.html).toContain('Ana escribió');
  });
  it('drops lines of a plain mail that start with «>»', () => {
    const { html } = sinCita('<p>Dale.</p><p>&gt; ¿Vamos?</p>');
    expect(html).not.toContain('Vamos');
  });
});

describe('leerHilo', () => {
  const hilo = leerHilo({ posts: [
    { id: 3, parentid: 2, subject: 'Re: Re: Consulta', message: '<p>Igual que el año pasado.</p>', author: { id: 9, fullname: 'Ana Docente' }, timecreated: 300 },
    { id: 1, parentid: 0, subject: 'Consulta', message: '<p>¿Qué entra en el parcial?</p><p><img src="' + CAMPUS + '/webservice/pluginfile.php/5/mod_forum/post/1/foto.png"></p>', author: { id: 7, fullname: 'Juan Alumno' }, timecreated: 100,
      attachments: [{ filename: 'guia.pdf', url: `${CAMPUS}/webservice/pluginfile.php/5/mod_forum/attachment/1/guia.pdf`, filesize: 1200, mimetype: 'application/pdf' }] },
    { id: 2, parentid: 1, subject: 'Re: Consulta', message: '<p>Unidades 1 a 3, como en el programa de la materia.</p>', author: { id: 9, fullname: 'Ana Docente' }, timecreated: 200 },
    { id: 4, parentid: 1, subject: 'Otra cosa', message: '', author: { fullname: 'Alguien' }, timecreated: 400, isdeleted: true },
  ] }, { materia: 'Física I', materiaId: 1 });
  it('goes in the order they were written, the first post on top', () => {
    expect(hilo.map((p) => p.id)).toEqual([1, 2, 3, 4]);
    expect(hilo[0].primero).toBe(true);
  });
  it('says whom an answer answers only when it is not the first post', () => {
    expect(hilo[1].responde).toBeNull();
    expect(hilo[2].responde).toMatchObject({ id: 2, autor: 'Ana Docente', inicio: 'Unidades 1 a 3, como en el programa de la materia.' });
  });
  it('keeps a subject only when it says something new', () => {
    expect(hilo[1].asunto).toBe('');
    expect(hilo[3].asunto).toBe('Otra cosa');
  });
  it('shows the files and the pictures of a post as files the visor opens', () => {
    expect(hilo[0].adjuntos.map((a) => a.archivo)).toEqual(['guia.pdf', 'foto.png']);
    expect(hilo[0].adjuntos[1].direccion).toBe(`${CAMPUS}/webservice/pluginfile.php/5/mod_forum/post/1/foto.png`);
    expect(hilo[0].adjuntos[0]).toMatchObject({ tipo: 'archivo', materia: 'Física I', materiaId: 1 });
  });
  it('may be answered unless the campus says no or it was deleted', () => {
    expect(hilo[0].puedeResponder).toBe(true);
    expect(hilo[3].puedeResponder).toBe(false);
    expect(leerHilo({ posts: [{ id: 1, parentid: 0, message: '<p>x</p>', author: { fullname: 'A' }, capabilities: { reply: false } }] })[0].puedeResponder).toBe(false);
  });
  it('a deleted post keeps its place without its text', () => {
    expect(hilo[3]).toMatchObject({ borrado: true, bloques: [], adjuntos: [] });
  });
});

describe('what is new', () => {
  beforeEach(() => localStorage.clear());
  it('starts with the last two weeks as new', () => {
    const vistas = leerVistas(5, 10_000_000);
    expect(esNueva({ id: 1, actividad: 10_000_000 - 3 * 86_400 }, vistas)).toBe(true);
    expect(esNueva({ id: 1, actividad: 10_000_000 - 30 * 86_400 }, vistas)).toBe(false);
  });
  it('a discussion opened is new again only when it moves', () => {
    guardarVistas(5, { desde: 100, vistas: { 1: 500 } });
    const vistas = leerVistas(5);
    expect(vistas).toEqual({ desde: 100, vistas: { 1: 500 } });
    expect(esNueva({ id: 1, actividad: 500 }, vistas)).toBe(false);
    expect(esNueva({ id: 1, actividad: 501 }, vistas)).toBe(true);
  });
  it('keeps only numbers, per student', () => {
    localStorage.setItem('cl.foros.5', JSON.stringify({ desde: 100, vistas: { 1: 'x', abc: 5, 2: 7 } }));
    expect(leerVistas(5).vistas).toEqual({ 2: 7 });
    expect(leerVistas(6, 42).desde).toBe(42);
  });
  it('the posts written after the last visit', () => {
    expect([...postsNuevos([{ id: 1, cuando: 10 }, { id: 2, cuando: 30 }], 20)]).toEqual([2]);
    expect(postsNuevos([{ id: 1, cuando: 10 }], 0).size).toBe(0);
  });
});

describe('esVieja', () => {
  it('a discussion without activity for a year is old', () => {
    const ahora = 100_000_000;
    expect(esVieja({ actividad: ahora - 366 * 86_400 }, ahora)).toBe(true);
    expect(esVieja({ actividad: ahora - 300 * 86_400 }, ahora)).toBe(false);
  });
});

describe('discusionDeEnlace', () => {
  it('reads the discussion of a campus forum address only', () => {
    expect(discusionDeEnlace(`${CAMPUS}/mod/forum/discuss.php?d=12#p44`)).toBe(12);
    expect(discusionDeEnlace('https://otro.com/mod/forum/discuss.php?d=12')).toBeNull();
    expect(discusionDeEnlace(`${CAMPUS}/mod/forum/view.php?id=3`)).toBeNull();
  });
});
