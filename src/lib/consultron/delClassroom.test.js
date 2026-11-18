import { describe, expect, it } from 'vitest';
import { cargarUnidos, docsDeClassroom, pendientesDeUnidos, unirCursos } from './delClassroom';

const CURSOS = [
  { id: '111', nombre: 'Redes de Datos 2026' },
  { id: '222', nombre: 'Física II' },
  { id: '333', nombre: 'Taller de robótica' },
  { id: '444', nombre: 'Análisis Matemático II' },
];
const EN_CURSO = [
  { id: 7, nombre: 'Física II' },
  { id: 8, nombre: 'Comunicaciones' },
  { id: 9, nombre: 'Análisis Matemático II' },
];

describe('unirCursos', () => {
  it('el curso elegido, el que se llama igual, y el de una materia propia, una vez cada uno', () => {
    const mio = {
      // Comunicaciones goes with «Redes de Datos», chosen by hand. Análisis, with none.
      materias: { 8: { classroom: '111' }, 9: { classroom: 'ninguno' } },
      propias: [
        { id: 'p1', nombre: 'Robótica', classroom: '333' },
        { id: 'p2', nombre: 'Otra', classroom: '222' },
        { id: 'p3', nombre: 'Sin curso', classroom: null },
      ],
    };
    expect(unirCursos(EN_CURSO, CURSOS, mio).map((u) => [u.curso.id, u.materia, u.propia])).toEqual([
      ['222', { id: 7, nombre: 'Física II' }, null],
      ['111', { id: 8, nombre: 'Comunicaciones' }, null],
      ['333', { id: undefined, nombre: 'Robótica' }, 'p1'],
    ]);
  });

  it('las secciones propias de una materia del campus llevan su nombre', () => {
    const mio = { materias: { 7: { classroom: 'ninguno' } }, propias: [{ id: 'p9', nombre: '', de: 7, classroom: '333' }] };
    expect(unirCursos(EN_CURSO.slice(0, 1), CURSOS, mio)).toEqual([{ curso: CURSOS[2], materia: { id: 7, nombre: 'Física II' }, propia: 'p9' }]);
  });

  it('sin materias propias ni cursos, nada', () => {
    expect(unirCursos([], CURSOS, { materias: {} })).toEqual([]);
    expect(unirCursos(EN_CURSO, [], { materias: {}, propias: [] })).toEqual([]);
  });
});

const UNIDOS = [
  {
    curso: CURSOS[1],
    materia: { id: 7, nombre: 'Física II' },
    propia: null,
    entregadas: new Set(['913']),
    datos: {
      tareas: [
        { id: '911', title: 'TP 1', creationTime: '2026-10-02T00:00:00Z', alternateLink: 'https://classroom.google.com/c/1/a/911', dueDate: { year: 2026, month: 11, day: 20 }, description: 'Resolver los ejercicios 4 a 9 de la guía de óptica.' },
        { id: '913', title: 'Entregado', dueDate: { year: 2026, month: 11, day: 25 } },
      ],
      avisos: [{ id: '921', text: 'El parcial se pasa al aula 305.', creationTime: '2026-11-04T12:00:00Z', alternateLink: 'https://classroom.google.com/c/1/p/921' }],
    },
  },
  {
    curso: CURSOS[2],
    materia: { id: undefined, nombre: 'Robótica' },
    propia: 'p1',
    entregadas: new Set(),
    datos: { materiales: [{ id: '901', title: 'Lista de componentes', description: 'Traer un Arduino Uno y un protoboard.', creationTime: '2026-10-01T00:00:00Z' }] },
  },
];

describe('lo que Consultron toma de Classroom', () => {
  it('las tareas sin entregar de todos los cursos', () => {
    const ahora = Date.UTC(2026, 10, 5) / 1000;
    expect(pendientesDeUnidos(UNIDOS, ahora).map((p) => [p.titulo, p.materia, p.id])).toEqual([['TP 1', 'Física II', 'classroom-911']]);
  });

  it('cada tarea, material y mensaje es un documento para buscar, con su curso y su enlace', () => {
    const docs = docsDeClassroom(UNIDOS);
    expect(docs.map((d) => d.doc)).toEqual(['classroom:222:a921', 'classroom:222:t911', 'classroom:222:t913', 'classroom:333:m901']);
    expect(docs[1].fuente).toEqual({ tipo: 'classroom', nombre: 'TP 1', clase: 'Tarea', materia: 'Física II', url: 'https://classroom.google.com/c/1/a/911' });
    expect(docs[1].trozos[0].texto).toContain('Resolver los ejercicios 4 a 9 de la guía de óptica.');
    expect(docs[0].trozos[0].texto).toContain('El parcial se pasa al aula 305.');
    expect(docs[3].fuente).toMatchObject({ clase: 'Material', materia: 'Robótica', url: null });
  });

  it('solo los de las materias donde busca', () => {
    expect(docsDeClassroom(UNIDOS, { materias: new Set([7]), propias: new Set() }).map((d) => d.doc)).toEqual(['classroom:222:a921', 'classroom:222:t911', 'classroom:222:t913']);
    expect(docsDeClassroom(UNIDOS, { materias: new Set(), propias: new Set(['p1']) }).map((d) => d.doc)).toEqual(['classroom:333:m901']);
    expect(docsDeClassroom(UNIDOS, { materias: new Set([99]), propias: new Set() })).toEqual([]);
  });

  it('sin la cuenta de Google conectada no pide nada', async () => {
    expect(await cargarUnidos()).toEqual([]);
  });
});
