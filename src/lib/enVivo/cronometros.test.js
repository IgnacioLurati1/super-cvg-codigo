import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import {
  DURACION, MAX_CRONOMETROS, agregar, cambiarDuracion, cronometros, cuandoTermina, enPalabras, enReloj, iniciar, pausar, quitar, reiniciar,
  renombrar, restante, termino, transcurrido,
} from './cronometros';

const mapa = () => new Y.Doc().getMap('h:abcdefabcdef');

describe('Cronómetro de la mesa', () => {
  it('cuenta desde que arranca, pausa donde está y sigue desde ahí', () => {
    const datos = mapa();
    const id = agregar(datos, 'cronometro', 1000);
    iniciar(datos, id, 10_000);
    expect(transcurrido(cronometros(datos)[0], 15_000)).toBe(5000);
    pausar(datos, id, 15_000);
    expect(transcurrido(cronometros(datos)[0], 99_000)).toBe(5000);
    iniciar(datos, id, 100_000);
    expect(transcurrido(cronometros(datos)[0], 102_000)).toBe(7000);
    reiniciar(datos, id);
    expect(cronometros(datos)[0]).toMatchObject({ acumulado: 0, desde: null });
  });

  it('iniciar dos veces no lo vuelve a cero', () => {
    const datos = mapa();
    const id = agregar(datos, 'cronometro');
    iniciar(datos, id, 10_000);
    iniciar(datos, id, 20_000);
    expect(transcurrido(cronometros(datos)[0], 30_000)).toBe(20_000);
  });

  it('una cuenta regresiva termina, dice cuándo y no baja de cero', () => {
    const datos = mapa();
    const id = agregar(datos, 'cuenta');
    cambiarDuracion(datos, id, 60_000);
    iniciar(datos, id, 1000);
    const c = cronometros(datos)[0];
    expect(cuandoTermina(c, 10_000)).toBe(61_000);
    expect(restante(c, 60_500)).toBe(500);
    expect(termino(c, 60_999)).toBe(false);
    expect(termino(c, 61_000)).toBe(true);
    expect(restante(c, 90_000)).toBe(0);
    expect(cuandoTermina(c, 90_000)).toBeNull();
  });

  it('cambiar el tiempo la vuelve a cero, dentro del mínimo y el máximo', () => {
    const datos = mapa();
    const id = agregar(datos, 'cuenta');
    iniciar(datos, id, 1000);
    cambiarDuracion(datos, id, 1);
    expect(cronometros(datos)[0]).toMatchObject({ duracion: DURACION.min, acumulado: 0, desde: null });
    cambiarDuracion(datos, id, 1e12);
    expect(cronometros(datos)[0].duracion).toBe(DURACION.max);
  });

  it('tiene un tope, se renombra y se quita', () => {
    const datos = mapa();
    const ids = Array.from({ length: MAX_CRONOMETROS }, (_, i) => agregar(datos, 'cronometro', i));
    expect(agregar(datos, 'cuenta')).toBeNull();
    renombrar(datos, ids[0], 'Parcial\u0007 de física '.repeat(10));
    expect(cronometros(datos)[0].nombre.length).toBeLessThanOrEqual(40);
    expect(cronometros(datos)[0].nombre.startsWith('Parcial  de física')).toBe(true);
    renombrar(datos, ids[1], '   ');
    expect(cronometros(datos)[1].nombre).toBe('Cronómetro');
    quitar(datos, ids[0]);
    expect(cronometros(datos)).toHaveLength(MAX_CRONOMETROS - 1);
  });

  it('lo que llega roto de otro no rompe la lista', () => {
    const datos = mapa();
    datos.set('c:abcdefabcdef', { modo: 'bomba' });
    datos.set('c:xyz', { modo: 'cuenta' });
    datos.set('otra', { modo: 'cuenta' });
    datos.set('c:000000000001', { modo: 'cuenta', duracion: 'mucho', acumulado: -5, desde: 'ayer', nombre: 7 });
    expect(cronometros(datos)).toEqual([{ id: '000000000001', nombre: 'Cuenta regresiva', modo: 'cuenta', duracion: DURACION.porDefecto, acumulado: 0, desde: null, cuando: 0 }]);
  });

  it('el reloj y las palabras', () => {
    expect(enReloj(0)).toBe('0:00');
    expect(enReloj(65_400)).toBe('1:05');
    expect(enReloj(64_100, { arriba: true })).toBe('1:05');
    expect(enReloj(3_729_000)).toBe('1:02:09');
    expect(enPalabras(0)).toBe('0 segundos');
    expect(enPalabras(61_000)).toBe('1 minuto y 1 segundo');
    expect(enPalabras(3_725_000)).toBe('1 hora, 2 minutos y 5 segundos');
  });
});
