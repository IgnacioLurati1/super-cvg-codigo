import { describe, expect, it } from 'vitest';
import { bloquesVisibles, columnaDe, cuentaEnHoy, diasDeHoy, fueraDeHoy, moverBloque, ordenDeHoy, sanearHoy, tipoDePendiente } from './hoy';
import { sanearMio } from './mio';

const conHoy = (hoy) => sanearMio({ hoy });

describe('lo que se guarda de Hoy', () => {
  it('sin elegir nada, Hoy queda como venía', () => {
    const mio = sanearMio({});
    expect(mio.hoy).toEqual({ orden: [], columnas: {}, ocultos: [], cuenta: null, dias: null, fuera: [], semana: null });
    expect(ordenDeHoy(mio)).toEqual({
      principal: ['pendientes', 'hechas', 'tareas', 'fechas'],
      costado: ['facu', 'classroom', 'mensajes', 'cambios', 'avisos', 'ultimo'],
    });
    expect([...cuentaEnHoy(mio)]).toEqual(['entregas', 'cuestionarios', 'classroom', 'propias']);
    expect(diasDeHoy(mio)).toBe(14);
    expect(fueraDeHoy(mio).size).toBe(0);
  });

  it('solo quedan claves de bloque, tipos, días y números de materia conocidos', () => {
    expect(sanearHoy({
      orden: ['avisos', 'nada', 'avisos', 3, 'pendientes'],
      columnas: { facu: 'principal', avisos: 'costado', nada: 'principal', tareas: 'arriba', ultimo: 'principal' },
      ocultos: ['ultimo', '<b>', 'facu'],
      cuenta: ['propias', 'otra', 'entregas'],
      dias: 9,
      fuera: [55, '12', 'x', 0, -3, 55, 'Álgebra'],
    })).toEqual({ orden: ['avisos', 'pendientes'], columnas: { facu: 'principal', ultimo: 'principal' }, ocultos: ['facu', 'ultimo'], cuenta: ['entregas', 'propias'], dias: null, fuera: [12, 55], semana: null });
    expect(sanearHoy('basura')).toEqual({ orden: [], columnas: {}, ocultos: [], cuenta: null, dias: null, fuera: [], semana: null });
    expect(sanearHoy({ columnas: ['principal'] }).columnas).toEqual({});
    expect(sanearHoy({ cuenta: [], dias: 30 })).toMatchObject({ cuenta: [], dias: 30 });
    // The week: only «calendario» is kept; the numbers are what it shows without choosing.
    expect(sanearHoy({ semana: 'calendario' }).semana).toBe('calendario');
    for (const raro of ['numeros', 'Calendario', 1, {}]) expect(sanearHoy({ semana: raro }).semana).toBe(null);
  });

  it('el orden va por columna, y lo que el orden no conoce queda al final', () => {
    const mio = conHoy({ orden: ['avisos', 'fechas', 'facu', 'pendientes'] });
    expect(ordenDeHoy(mio)).toEqual({
      principal: ['fechas', 'pendientes', 'hechas', 'tareas'],
      costado: ['avisos', 'facu', 'classroom', 'mensajes', 'cambios', 'ultimo'],
    });
  });

  it('los ocultos no se ven, pero conservan su lugar', () => {
    const mio = conHoy({ orden: ['tareas', 'pendientes'], ocultos: ['pendientes', 'avisos'] });
    expect(bloquesVisibles(mio).principal).toEqual(['tareas', 'hechas', 'fechas']);
    expect(bloquesVisibles(mio).costado).not.toContain('avisos');
    expect(ordenDeHoy(mio).principal[1]).toBe('pendientes');
  });

  it('mover un bloque lo cambia de lugar dentro de su columna, sin tocar la otra', () => {
    const mio = sanearMio({});
    const arriba = moverBloque(mio, 'fechas', 0);
    expect(ordenDeHoy(conHoy(arriba)).principal).toEqual(['fechas', 'pendientes', 'hechas', 'tareas']);
    expect(ordenDeHoy(conHoy(arriba)).costado).toEqual(ordenDeHoy(mio).costado);
    const abajo = moverBloque(mio, 'facu', 99);
    expect(ordenDeHoy(conHoy(abajo)).costado.at(-1)).toBe('facu');
  });

  it('un bloque pasa a la otra columna, al lugar elegido, y vuelve', () => {
    const mio = sanearMio({});
    const pasado = conHoy(moverBloque(mio, 'facu', 1, 'principal'));
    expect(columnaDe(pasado, 'facu')).toBe('principal');
    expect(ordenDeHoy(pasado)).toEqual({
      principal: ['pendientes', 'facu', 'hechas', 'tareas', 'fechas'],
      costado: ['classroom', 'mensajes', 'cambios', 'avisos', 'ultimo'],
    });
    // Back where it starts, nothing is left saying so.
    const vuelto = moverBloque(pasado, 'facu', 0, 'costado');
    expect(vuelto.columnas).toEqual({});
    expect(ordenDeHoy(conHoy(vuelto)).costado[0]).toBe('facu');
    // Every block in one column: the other is left empty.
    let todo = mio;
    for (const c of ordenDeHoy(mio).costado) todo = conHoy({ ...todo.hoy, ...moverBloque(todo, c, 99, 'principal') });
    expect(ordenDeHoy(todo).costado).toEqual([]);
    expect(ordenDeHoy(todo).principal).toHaveLength(10);
  });

  it('cada pendiente sabe de qué tipo es', () => {
    expect(tipoDePendiente({ id: 5, tipo: 'Entrega', tarea: { cmid: 1 } })).toBe('entregas');
    expect(tipoDePendiente({ id: 6, tipo: 'Actividad' })).toBe('entregas');
    expect(tipoDePendiente({ id: 7, tipo: 'Cuestionario', cuestionario: { cmid: 2 } })).toBe('cuestionarios');
    expect(tipoDePendiente({ id: 'classroom-9', tipo: 'Tarea de Classroom' })).toBe('classroom');
    expect(tipoDePendiente({ id: 'e3', propio: 'evento' })).toBe('propias');
  });
});
