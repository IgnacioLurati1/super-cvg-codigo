import { afterEach, describe, expect, it } from 'vitest';
import { claveFuera, conTimbre, leerFuera, olvidarSacadas, sacarNotificaciones, sePuedeSacar } from './campana';
import { fijarUsuario } from './mio';

describe('sacar notificaciones', () => {
  afterEach(() => {
    localStorage.clear();
    fijarUsuario(null);
  });

  it('guarda solo sus números, por alumno, y vuelven con Deshacer', () => {
    fijarUsuario(5);
    sacarNotificaciones([41, 42, 'x', -1, 1.5, null]);
    expect([...leerFuera(5)]).toEqual([41, 42]);
    expect(localStorage.getItem(claveFuera(5))).toBe('[41,42]');
    expect(leerFuera(6).size).toBe(0);
    sacarNotificaciones([41], true);
    expect([...leerFuera(5)]).toEqual([42]);
    olvidarSacadas();
    expect(localStorage.getItem(claveFuera(5))).toBe(null);
  });

  it('sin sesión no guarda nada, y lo guardado roto no rompe', () => {
    sacarNotificaciones([41]);
    expect(Object.keys(localStorage)).toEqual([]);
    localStorage.setItem(claveFuera(5), '{roto');
    expect(leerFuera(5).size).toBe(0);
    localStorage.setItem(claveFuera(5), '[7, "<b>", 8]');
    expect([...leerFuera(5)]).toEqual([7, 8]);
  });

  it('se queda con las últimas 500', () => {
    fijarUsuario(5);
    sacarNotificaciones(Array.from({ length: 520 }, (_, i) => i + 1));
    const guardadas = leerFuera(5);
    expect(guardadas.size).toBe(500);
    expect(guardadas.has(20)).toBe(false);
    expect(guardadas.has(21)).toBe(true);
    // Taken out again, it goes last and stays.
    sacarNotificaciones([21]);
    sacarNotificaciones([600]);
    expect(leerFuera(5).has(21)).toBe(true);
    expect(leerFuera(5).has(22)).toBe(false);
  });

  it('se puede sacar solo con su número del campus', () => {
    expect(sePuedeSacar({ id: 41 })).toBe(true);
    expect(sePuedeSacar({ id: null })).toBe(false);
    expect(sePuedeSacar({ id: '41' })).toBe(false);
  });
});

const INICIO = { conteo: 0, contado: false, lista: null, visto: 0, numero: null, timbre: 0 };
const aviso = (cuando, leida = false) => ({ cuando, leida });
// The states one after the other, as campana.js puts them: each change over the last one.
const recorrer = (...cambios) => cambios.reduce((e, c) => conTimbre({ ...e, ...c }), INICIO);

describe('el timbre de la campana', () => {
  it('no suena al abrir la página con nuevas, aunque la lista llegue después del número', () => {
    // Opened it before: the count comes first and the list says which are new.
    const conVisto = recorrer({ conteo: 2, contado: true, visto: 100 }, { lista: [aviso(300), aviso(200)] });
    expect(conVisto.numero).toBe(2);
    expect(conVisto.timbre).toBe(0);
    // Never opened it: the campus count is the number from the start.
    expect(recorrer({ conteo: 3, contado: true }, { lista: [aviso(300)] }).timbre).toBe(0);
  });

  it('suena cuando llega una nueva con la página abierta, también si arrancó sin ninguna', () => {
    const quieta = recorrer({ conteo: 0, contado: true, visto: 100 });
    expect(quieta.numero).toBe(0);
    // The count goes up, and the list that says it is new comes after: one ring, when it is known.
    const conteo = conTimbre({ ...quieta, conteo: 1 });
    expect(conteo.timbre).toBe(0);
    expect(conTimbre({ ...conteo, lista: [aviso(300)] }).timbre).toBe(1);
    // Never opened it: it rings with the count.
    expect(recorrer({ conteo: 2, contado: true }, { conteo: 3 }).timbre).toBe(1);
  });

  it('con la lista vieja espera a la nueva, y no suena cuando baja ni antes del primer número', () => {
    const lista = [aviso(300)];
    const antes = recorrer({ conteo: 1, contado: true, visto: 100, lista });
    const vieja = conTimbre({ ...antes, conteo: 2 });
    expect(vieja.timbre).toBe(0);
    expect(conTimbre({ ...vieja, lista: [aviso(400), ...lista] }).timbre).toBe(1);
    // Opening the bell leaves them seen: the number goes down, quietly.
    expect(conTimbre({ ...antes, visto: 300 })).toMatchObject({ numero: 0, timbre: 0 });
    // A list asked before any count says nothing yet.
    expect(recorrer({ lista, visto: 100 })).toMatchObject({ numero: null, timbre: 0 });
  });
});
