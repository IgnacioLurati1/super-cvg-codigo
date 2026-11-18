import { describe, expect, it } from 'vitest';
import { carrilesDelDia } from './horarioCarriles';

const clase = (id, desde, hasta) => ({ id, desde, hasta });

describe('carrilesDelDia', () => {
  it('sola, una clase ocupa todo el ancho', () => {
    const lugares = carrilesDelDia([clase('a', 480, 600), clase('b', 600, 720)], 480, 720);
    expect(lugares.get('a')).toMatchObject({ carril: 0, carriles: 1 });
    expect(lugares.get('b')).toMatchObject({ carril: 0, carriles: 1 });
  });

  it('las que se pisan van una al lado de la otra, y el grupo sigue mientras se encadenen', () => {
    // Materia C de 8:00 a 11:15 y una de 10:00 a 12:45; una tuya de 11:30 a 12:00 pisa solo a la segunda.
    const lugares = carrilesDelDia([clase('c', 480, 675), clase('x', 600, 765), clase('k', 690, 720), clase('d', 780, 840)], 480, 840);
    expect(lugares.get('c')).toMatchObject({ carril: 0, carriles: 2 });
    expect(lugares.get('x')).toMatchObject({ carril: 1, carriles: 2 });
    // C ya terminó: la tuya usa su carril, del mismo grupo.
    expect(lugares.get('k')).toMatchObject({ carril: 0, carriles: 2 });
    expect(lugares.get('d')).toMatchObject({ carril: 0, carriles: 1 });
  });

  it('tres a la vez son tres carriles', () => {
    const lugares = carrilesDelDia([clase('a', 480, 600), clase('b', 490, 560), clase('c', 500, 520)], 480, 600);
    expect([...lugares.values()].map((l) => [l.carril, l.carriles])).toEqual([[0, 3], [1, 3], [2, 3]]);
  });

  it('el lugar libre arriba y abajo, hasta la clase de al lado o el borde de la semana', () => {
    const lugares = carrilesDelDia([clase('a', 480, 600), clase('corta', 610, 620), clase('b', 660, 720)], 480, 780);
    expect(lugares.get('corta')).toMatchObject({ antes: 10, despues: 40 });
    expect(lugares.get('a')).toMatchObject({ antes: 0, despues: 10 });
    expect(lugares.get('b')).toMatchObject({ antes: 40, despues: 60 });
  });
});
