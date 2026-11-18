import { describe, expect, it } from 'vitest';
import { turnosGuardados } from './agente';

describe('el chat de Código guardado en la pestaña', () => {
  it('vuelve con lo que tenía, y un pedido cortado por la recarga queda frenado', () => {
    const guardado = JSON.stringify([
      { id: 7, pedido: 'hola', pasos: [{ tipo: 'lista' }, { tipo: 'lee', nombre: 'main.py' }], respuesta: 'Hola.', motivo: null, trabajando: false },
      { id: 8, pedido: 'arreglalo', pasos: [{ tipo: 'lista' }], respuesta: null, motivo: null, trabajando: true },
    ]);
    const turnos = turnosGuardados(guardado);
    expect(turnos).toEqual([
      { id: 1, pedido: 'hola', pasos: [{ tipo: 'lista' }, { tipo: 'lee', nombre: 'main.py' }], respuesta: 'Hola.', motivo: null, trabajando: false },
      { id: 2, pedido: 'arreglalo', pasos: [{ tipo: 'lista' }], respuesta: null, motivo: 'recargada', trabajando: false },
    ]);
  });

  it('lo que no tiene su forma no entra', () => {
    expect(turnosGuardados('no es json')).toEqual([]);
    expect(turnosGuardados('{"a":1}')).toEqual([]);
    expect(turnosGuardados(null)).toEqual([]);
    const raro = turnosGuardados(JSON.stringify([{ pedido: 3, pasos: [] }, { pedido: 'x', pasos: [{ tipo: 'otra' }, null] }]));
    expect(raro).toEqual([{ id: 1, pedido: 'x', pasos: [], respuesta: null, motivo: null, trabajando: false }]);
  });
});
