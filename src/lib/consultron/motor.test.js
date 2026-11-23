import { afterEach, describe, expect, it, vi } from 'vitest';

// What motor.js hands to charlas.js to keep, as the talk changes.
const guardadas = vi.hoisted(() => []);
vi.mock('../mio', () => ({ usuarioActual: () => 7 }));
vi.mock('../sesion', () => ({ tokenActual: () => 'sesion' }));
vi.mock('./charlas', () => ({
  guardarCharla: vi.fn(async (_alumno, charla) => {
    guardadas.push(charla.entradas.map((e) => ({ estado: e.estado, fase: e.practica?.fase })));
    return true;
  }),
  leerCharla: vi.fn(async () => null),
  borrarCharla: vi.fn(async () => {}),
}));

afterEach(() => vi.useRealTimers());

describe('las charlas que se guardan', () => {
  it('una pregunta de práctica que se está corrigiendo sigue guardada: si se recarga, vuelve la pregunta', async () => {
    vi.useFakeTimers();
    const m = await import('./motor');
    const antes = m.empezar('Practicar semáforos');
    m.ponerPractica(antes, { fase: 'sin-trozo' }, 'practica');
    const id = m.empezar('Tomame preguntas de monitores');
    m.ponerPractica(id, { fase: 'pregunta', pregunta: '¿Qué hace un monitor?', ideas: ['Junta los datos'], respuesta: '' }, 'practica');
    vi.advanceTimersByTime(300);
    expect(guardadas.at(-1)).toEqual([{ estado: 'practica', fase: 'sin-trozo' }, { estado: 'practica', fase: 'pregunta' }]);

    m.ponerPractica(id, { fase: 'corrigiendo', respuesta: 'Los cuida' }, 'leyendo');
    vi.advanceTimersByTime(300);
    expect(guardadas.at(-1)).toEqual([{ estado: 'practica', fase: 'sin-trozo' }, { estado: 'leyendo', fase: 'corrigiendo' }]);

    // One still being made has no question yet: it isn't kept.
    m.empezar('Practicar');
    vi.advanceTimersByTime(300);
    expect(guardadas.at(-1)).toHaveLength(2);
  });
});
