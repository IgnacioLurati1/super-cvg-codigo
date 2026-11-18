import { describe, expect, it } from 'vitest';
import { mezclarConClassroom } from './propiasVista';

const tuyo = (clave) => ({ clave, tuyo: { bloque: { id: clave } } });
const deClassroom = (clave) => ({ clave, origen: 'classroom' });
const claves = (lista) => lista.map((i) => i.clave);

describe('una sección tuya con cosas de Classroom', () => {
  it('sin nada de Classroom, lo tuyo como está', () => {
    const lista = [tuyo('p1'), tuyo('p2')];
    expect(mezclarConClassroom(lista, [], ['p2', 'p1'])).toBe(lista);
  });

  it('lo de Classroom va donde lo dejó el alumno; lo tuyo, en el orden de la categoría', () => {
    expect(claves(mezclarConClassroom([tuyo('p1'), tuyo('p2')], [deClassroom('c9')], ['p1', 'c9', 'p2']))).toEqual(['p1', 'c9', 'p2']);
    // The category changed its order on another device: the student's own follow it, Classroom keeps its place.
    expect(claves(mezclarConClassroom([tuyo('p2'), tuyo('p1')], [deClassroom('c9')], ['p1', 'c9', 'p2']))).toEqual(['p2', 'c9', 'p1']);
  });

  it('sin orden guardado, lo de Classroom al final; lo nuevo de una categoría, también', () => {
    expect(claves(mezclarConClassroom([tuyo('p1')], [deClassroom('c9'), deClassroom('c8')]))).toEqual(['p1', 'c9', 'c8']);
    expect(claves(mezclarConClassroom([tuyo('p1'), tuyo('p3')], [deClassroom('c9')], ['c9', 'p1']))).toEqual(['c9', 'p1', 'p3']);
  });
});
