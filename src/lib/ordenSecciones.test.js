import { describe, expect, it } from 'vitest';
import { conTuyasEnOrden, enOrdenGuardado, moverA, segun } from './ordenSecciones';

describe('el orden de las secciones', () => {
  it('sin nada guardado queda el del campus', () => {
    expect(enOrdenGuardado([1, 2, 'p5'], [])).toEqual([1, 2, 'p5']);
  });

  it('respeta lo guardado e ignora lo que ya no está', () => {
    expect(enOrdenGuardado([1, 2, 3, 'p5'], ['p5', 3, 9, 1, 2, 'p8'])).toEqual(['p5', 3, 1, 2]);
  });

  it('una sección nueva del campus va donde la pone el campus; una tuya nueva, al final', () => {
    // The campus added 4 between 2 and 3, and 0 at the start; the student made p6.
    expect(enOrdenGuardado([0, 1, 2, 4, 3, 'p5', 'p6'], ['p5', 3, 2, 1])).toEqual(['p5', 3, 2, 4, 0, 1, 'p6']);
  });

  it('una nueva al principio del campus queda justo antes de la que la sigue en el campus', () => {
    expect(enOrdenGuardado([0, 1, 2, 'p5'], ['p5', 2, 1])).toEqual(['p5', 2, 0, 1]);
  });

  it('ordena una lista según otra, con lo que no conoce al final', () => {
    expect(segun([{ id: 1 }, { id: 2 }, { id: 3 }], [3, 1]).map((x) => x.id)).toEqual([3, 1, 2]);
  });

  it('mover una a un lugar de las que se ven deja las ocultas donde estaban', () => {
    // 7 is hidden: it stays between 2 and 3.
    const orden = [1, 2, 7, 3, 'p5'];
    const visibles = [1, 2, 3, 'p5'];
    expect(moverA(orden, visibles, 'p5', 0)).toEqual(['p5', 1, 2, 7, 3]);
    expect(moverA(orden, visibles, 1, 3)).toEqual([2, 7, 3, 'p5', 1]);
    expect(moverA(orden, visibles, 3, 1)).toEqual([1, 3, 2, 7, 'p5']);
    expect(moverA(orden, visibles, 2, 1)).toEqual(orden);
  });

  it('una que el orden no tenía también se mueve', () => {
    expect(moverA([1, 2], [1, 2, 'p5'], 'p5', 1)).toEqual([1, 'p5', 2]);
  });
});

describe('una materia propia con Classroom', () => {
  it('un tema nuevo va donde lo pone Classroom, no al final como una sección tuya', () => {
    expect(enOrdenGuardado(['p1', 'c801', 'c805', 'c802'], ['c802', 'p1', 'c801'])).toEqual(['c802', 'p1', 'c801', 'c805']);
    expect(enOrdenGuardado(['p1', 'c805', 'c802'], ['c802', 'p1'])).toEqual(['c805', 'c802', 'p1']);
  });

  it('sus secciones quedan en el orden de sus categorías, en los lugares que tienen entre los temas', () => {
    expect(conTuyasEnOrden(['c1', 'p2', 'c3', 'p1'], ['p1', 'p2'])).toEqual(['c1', 'p1', 'c3', 'p2']);
    expect(conTuyasEnOrden(['p1', 'p2'], ['p2', 'p1'])).toEqual(['p2', 'p1']);
    expect(conTuyasEnOrden([3, 'c1'], [])).toEqual([3, 'c1']);
  });
});
