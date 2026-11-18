import { describe, expect, it } from 'vitest';
import { hayVistos } from './vistos';

describe('marcar lo que ya viste', () => {
  it('cuenta como usado solo si hay algo marcado en alguna materia', () => {
    expect(hayVistos(null)).toBe(false);
    expect(hayVistos({ materias: {} })).toBe(false);
    expect(hayVistos({ materias: { 1: { vistos: [] }, 2: {} } })).toBe(false);
    expect(hayVistos({ materias: { 1: { vistos: [] }, 2: { vistos: ['10'] } } })).toBe(true);
  });
});
