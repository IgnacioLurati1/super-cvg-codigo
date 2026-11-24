import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CLAVE_AJUSTES, CLAVES_DEL_DISENO, ajustesActuales, aparienciaQueViaja, cambiarAjustes, cambiarSegunLaHora, conApariencia, disenoQueSeVe, editarDiseno, esDeNoche,
  horasDeLaNoche, normalizar, volverAjustesOriginales,
} from './ajustes';

const SCRIPT = readFileSync(resolve(import.meta.dirname, '../../public/ajustes.js'), 'utf8');
const a = (h, m = 0) => new Date(2026, 10, 23, h, m);

describe('cuándo es de noche', () => {
  it('cruzando la medianoche, sin cruzarla y con las mismas horas', () => {
    const n = { desde: '20:00', hasta: '07:00' };
    expect([a(19, 59), a(20), a(23, 30), a(3), a(6, 59), a(7), a(12)].map((d) => esDeNoche(d, n))).toEqual([false, true, true, true, true, false, false]);
    expect([a(0, 30), a(1), a(5, 59), a(6)].map((d) => esDeNoche(d, { desde: '01:00', hasta: '06:00' }))).toEqual([false, true, true, false]);
    expect(esDeNoche(a(3), { desde: '08:00', hasta: '08:00' })).toBe(false);
  });

  it('public/ajustes.js tiene la misma lista de lo que hace un diseño', () => {
    const lista = JSON.parse(/var CLAVES_DEL_DISENO = (\[[^\]]*\]);/.exec(SCRIPT)[1].replace(/'/g, '"'));
    expect(lista).toEqual(CLAVES_DEL_DISENO);
  });
});

describe('un diseño de día y uno de noche', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(a(12));
    volverAjustesOriginales();
    cambiarAjustes({ mismaEnTodos: true });
  });
  afterEach(() => {
    editarDiseno(null);
    volverAjustesOriginales();
    vi.useRealTimers();
  });

  it('al prenderlo, la noche arranca oscura; lo que cambiás queda en el que estás viendo', () => {
    cambiarAjustes({ estilo: 'hoja', tema: 'claro' });
    cambiarSegunLaHora(true);
    const s = ajustesActuales().segunLaHora;
    expect([s.desde, s.hasta, s.dia.tema, s.noche.tema, s.noche.estilo]).toEqual(['20:00', '07:00', 'claro', 'oscuro', 'hoja']);
    expect(disenoQueSeVe()).toBe('dia');
    cambiarAjustes({ accion: '#123456' });
    expect([ajustesActuales().segunLaHora.dia.accion, ajustesActuales().segunLaHora.noche.accion]).toEqual(['#123456', null]);
    // The letter is not the design: it stays in both.
    cambiarAjustes({ letra: 'grande' });
    expect(ajustesActuales().segunLaHora.noche.letra).toBeUndefined();
  });

  it('editar el de noche de día: se ve ese, guarda en ese, y al volver se ve el de día', () => {
    cambiarSegunLaHora(true);
    editarDiseno('noche');
    expect([disenoQueSeVe(), ajustesActuales().tema]).toEqual(['noche', 'oscuro']);
    cambiarAjustes({ estilo: 'batman' });
    expect(ajustesActuales().segunLaHora.noche.estilo).toBe('batman');
    expect(ajustesActuales().segunLaHora.dia.estilo).toBe('original');
    // What travels to other devices is the design of the hour, never the one shown only to edit it.
    expect(aparienciaQueViaja(ajustesActuales()).estilo).toBeUndefined();
    editarDiseno(null);
    expect([ajustesActuales().estilo, ajustesActuales().tema]).toEqual(['original', 'sistema']);
  });

  it('llega la hora: cambia solo, y lo guardado se lee con el de la hora', () => {
    cambiarSegunLaHora(true);
    vi.setSystemTime(a(20, 30));
    // The minute's check (its interval started with the module, before these fake timers), as on coming back to the tab.
    document.dispatchEvent(new Event('visibilitychange'));
    expect([disenoQueSeVe(), ajustesActuales().tema]).toEqual(['noche', 'oscuro']);
    // Other hours: at 20:30 it's day again.
    horasDeLaNoche('22:00', '06:00');
    expect([disenoQueSeVe(), ajustesActuales().tema]).toEqual(['dia', 'sistema']);
    expect(JSON.parse(localStorage.getItem(CLAVE_AJUSTES)).segunLaHora.desde).toBe('22:00');
  });

  it('lo que llega de otro dispositivo no pisa el de la otra hora', () => {
    cambiarSegunLaHora(true);
    const otro = aparienciaQueViaja({ ...ajustesActuales(), segunLaHora: { ...ajustesActuales().segunLaHora, noche: { ...ajustesActuales().segunLaHora.noche, estilo: 'plano' } } });
    editarDiseno('noche');
    cambiarAjustes(conApariencia(ajustesActuales(), otro));
    expect([ajustesActuales().segunLaHora.dia.estilo, ajustesActuales().segunLaHora.noche.estilo]).toEqual(['original', 'plano']);
  });

  it('apagarlo deja lo que se ve; algo roto se lee como apagado', () => {
    cambiarSegunLaHora(true);
    vi.setSystemTime(a(22));
    // The minute's check (its interval started with the module, before these fake timers), as on coming back to the tab.
    document.dispatchEvent(new Event('visibilitychange'));
    cambiarSegunLaHora(false);
    expect([ajustesActuales().segunLaHora, ajustesActuales().tema]).toEqual([null, 'oscuro']);
    expect(normalizar({ segunLaHora: { dia: 1 } }).segunLaHora).toBeNull();
    expect(normalizar({ segunLaHora: { dia: {}, noche: { estilo: '<x>' }, desde: '25:00' } }).segunLaHora).toMatchObject({ desde: '20:00', noche: { estilo: 'original' } });
  });

  it('apagarlo y prenderlo de nuevo devuelve los dos diseños y las horas que tenías', () => {
    cambiarSegunLaHora(true);
    editarDiseno('noche');
    cambiarAjustes({ estilo: 'batman' });
    editarDiseno(null);
    horasDeLaNoche('21:30', '06:00');
    cambiarSegunLaHora(false);
    // Off: what shows stays, and meanwhile the look changes freely.
    cambiarAjustes({ estilo: 'plano' });
    expect(ajustesActuales().segunLaHora).toBeNull();
    cambiarSegunLaHora(true);
    const s = ajustesActuales().segunLaHora;
    expect([s.desde, s.hasta, s.dia.estilo, s.noche.estilo]).toEqual(['21:30', '06:00', 'original', 'batman']);
    // At noon, the day's shows again.
    expect(ajustesActuales().estilo).toBe('original');
    expect(ajustesActuales().segunLaHoraAntes).toBeNull();
    // Off twice in a row keeps them too.
    cambiarSegunLaHora(false);
    cambiarSegunLaHora(false);
    cambiarSegunLaHora(true);
    expect(ajustesActuales().segunLaHora.noche.estilo).toBe('batman');
  });
});

describe('public/ajustes.js antes del primer pintado', () => {
  afterEach(() => {
    delete window.aplicarAjustes;
    vi.useRealTimers();
    localStorage.clear();
  });

  it('pinta el diseño de la hora', () => {
    window.matchMedia = () => ({ matches: false, addEventListener() {} });
    vi.useFakeTimers();
    const guardado = { estilo: 'original', tema: 'claro', segunLaHora: { desde: '20:00', hasta: '07:00', dia: { estilo: 'original', tema: 'claro' }, noche: { estilo: 'pizarron', tema: 'oscuro' } } };
    localStorage.setItem(CLAVE_AJUSTES, JSON.stringify(guardado));
    vi.setSystemTime(a(23));
    new Function(SCRIPT)();
    expect(document.documentElement.getAttribute('data-estilo')).toBe('pizarron');
    vi.setSystemTime(a(9));
    window.aplicarAjustes();
    expect(document.documentElement.getAttribute('data-estilo')).toBe('original');
    delete window.matchMedia;
  });
});
