import { describe, expect, it } from 'vitest';
import { colorDeMateria, COLORES, fijarCursos, ordenDeColores } from './colores';

describe('el color de cada materia', () => {
  it('uno distinto para cada una: los cursos por número y después las sumadas de los horarios', () => {
    const mapa = ordenDeColores([3, 10, 41, 52], [1_794_000_000_002, 1_794_000_000_001, 1_794_000_000_003]);
    expect([...mapa.entries()]).toEqual([[3, 0], [10, 1], [41, 2], [52, 3], [1_794_000_000_001, 4], [1_794_000_000_002, 5], [1_794_000_000_003, 6]]);
  });

  it('sumar una materia no cambia el color de las otras', () => {
    const antes = ordenDeColores([3, 10], [1_794_000_000_001]);
    const despues = ordenDeColores([3, 10], [1_794_000_000_001, 1_794_000_000_009]);
    for (const [id, color] of antes) expect(despues.get(id)).toBe(color);
    expect(despues.get(1_794_000_000_009)).toBe(3);
  });

  it('con más materias que colores vuelven a empezar', () => {
    const mapa = ordenDeColores(Array.from({ length: COLORES + 2 }, (_, i) => i + 1), []);
    expect(mapa.get(COLORES + 1)).toBe(0);
  });

  it('un curso que no está en la lista conserva el color de su número, como antes', () => {
    fijarCursos([20, 7]);
    expect(colorDeMateria(7)).toBe(0);
    expect(colorDeMateria(20)).toBe(1);
    expect(colorDeMateria(15)).toBe(15 % 6);
    expect(colorDeMateria(null)).toBeUndefined();
  });
});
