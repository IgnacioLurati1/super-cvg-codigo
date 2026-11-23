import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ajustesActuales, aparienciaQueViaja, cambiarAjustes, conApariencia, normalizar, volverAjustesOriginales } from './ajustes';
import { fijarUsuario, mioActual, ponerMioUnido, sanearMio } from './mio';
import { arrancarApariencia } from './apariencia';

beforeAll(() => arrancarApariencia());

beforeEach(() => {
  fijarUsuario(null);
  // Starting over keeps it off: each test starts with it on.
  cambiarAjustes({ mismaEnTodos: true });
  localStorage.clear();
  volverAjustesOriginales();
});

describe('lo que viaja', () => {
  it('solo lo que no está como venía, sin el tamaño de los paneles', () => {
    expect(aparienciaQueViaja({ estilo: 'hoja', tema: 'sistema', anchoPanelPdf: 400, menu: { posicion: 'arriba' } })).toEqual({ estilo: 'hoja' });
    expect(aparienciaQueViaja({ estilo: 'nada', letra: 'grande' })).toEqual({ letra: 'grande' });
  });

  it('la alineación y el ancho de la barra de arriba viajan a Drive y vuelven igual', () => {
    const menu = aparienciaQueViaja({ menu: { alineacion: 'medio', ancho: 'pantalla' } }).menu;
    expect(menu).toMatchObject({ alineacion: 'medio', ancho: 'pantalla' });
    expect(sanearMio({ apariencia: { menu } }).apariencia.menu).toMatchObject({ alineacion: 'medio', ancho: 'pantalla' });
  });

  it.each(['rosa', 'bosque', 'cafe', 'lavanda', 'infierno', 'glaciar', 'cosmico'])('la paleta %s viaja a Drive y vuelve igual', (tema) => {
    expect(aparienciaQueViaja({ estilo: 'hoja', tema })).toEqual({ estilo: 'hoja', tema });
    expect(sanearMio({ apariencia: { estilo: 'hoja', tema } }).apariencia).toEqual({ estilo: 'hoja', tema });
    // The same through the union of the devices: the student's Drive says it and this device shows it.
    fijarUsuario(5);
    ponerMioUnido({ ...mioActual(), apariencia: { estilo: 'hoja', tema } });
    expect([ajustesActuales().estilo, ajustesActuales().tema]).toEqual(['hoja', tema]);
    expect(mioActual().apariencia).toEqual({ estilo: 'hoja', tema });
  });

  it('los filtros del fondo viajan a Drive, se unen entre dispositivos y vuelven iguales', () => {
    const filtros = { fondoFiltro: 'sepia', fondoIntensidad: 35, fondoTono: 290, fondoDesenfoque: 40 };
    expect(aparienciaQueViaja(filtros)).toEqual(filtros);
    expect(sanearMio({ apariencia: filtros }).apariencia).toEqual(filtros);
    // Another device: what its Drive says is what it shows.
    fijarUsuario(5);
    ponerMioUnido({ ...mioActual(), apariencia: filtros });
    const a = ajustesActuales();
    expect([a.fondoFiltro, a.fondoIntensidad, a.fondoTono, a.fondoDesenfoque]).toEqual(['sepia', 35, 290, 40]);
    // Changed here, it goes to mio (and so to Drive).
    cambiarAjustes({ fondoTono: 100 });
    expect(mioActual().apariencia.fondoTono).toBe(100);
  });

  it('un Drive de antes de las paletas sigue entrando igual, y una paleta que no existe se descarta', () => {
    expect(sanearMio({ apariencia: { estilo: 'hoja', tema: 'oscuro' } }).apariencia).toEqual({ estilo: 'hoja', tema: 'oscuro' });
    expect(sanearMio({ apariencia: { estilo: 'hoja', tema: 'violeta' } }).apariencia).toEqual({ estilo: 'hoja' });
  });

  it('lo que llega reemplaza la configuración entera, salvo el tamaño de los paneles', () => {
    const aca = normalizar({ estilo: 'batman', letra: 'grande', anchoPanelPdf: 400 });
    const r = conApariencia(aca, { estilo: 'hoja' });
    expect([r.estilo, r.letra, r.anchoPanelPdf]).toEqual(['hoja', 'normal', 400]);
  });
});

describe('entre el dispositivo y lo del alumno', () => {
  it('la primera vez, la configuración de este dispositivo pasa a ser la del alumno', () => {
    cambiarAjustes({ estilo: 'hoja' });
    fijarUsuario(5);
    expect(mioActual().apariencia).toEqual({ estilo: 'hoja' });
  });

  it('un dispositivo como venía no guarda nada al entrar', () => {
    fijarUsuario(6);
    expect(localStorage.getItem('cl.mio.6')).toBe(null);
    expect(mioActual().apariencia).toBe(null);
  });

  it('un cambio acá va a lo del alumno, y volver todo a como venía también', () => {
    fijarUsuario(5);
    cambiarAjustes({ letra: 'grande', estilo: 'plano' });
    expect(mioActual().apariencia).toEqual({ estilo: 'plano', letra: 'grande' });
    volverAjustesOriginales();
    expect(mioActual().apariencia).toEqual({});
  });

  it('lo que llega de Drive se ve en este dispositivo, con sus paneles', () => {
    fijarUsuario(5);
    cambiarAjustes({ letra: 'grande', anchoPanelPdf: 400 });
    ponerMioUnido({ ...mioActual(), apariencia: { estilo: 'pizarron' } });
    const a = ajustesActuales();
    expect([a.estilo, a.letra, a.anchoPanelPdf]).toEqual(['pizarron', 'normal', 400]);
  });

  it('al entrar, manda lo que se ve en este dispositivo', () => {
    fijarUsuario(5);
    cambiarAjustes({ estilo: 'hoja' });
    fijarUsuario(null);
    cambiarAjustes({ estilo: 'batman' });
    fijarUsuario(5);
    expect(mioActual().apariencia).toEqual({ estilo: 'batman' });
    expect(ajustesActuales().estilo).toBe('batman');
  });
});

describe('misma configuración en todos tus dispositivos', () => {
  it('viene prendida y no viaja: es de cada dispositivo', () => {
    expect(ajustesActuales().mismaEnTodos).toBe(true);
    expect(aparienciaQueViaja({ estilo: 'hoja', mismaEnTodos: false })).toEqual({ estilo: 'hoja' });
  });

  it('apagada, este dispositivo no manda ni toma', () => {
    fijarUsuario(5);
    cambiarAjustes({ estilo: 'hoja' });
    cambiarAjustes({ mismaEnTodos: false });
    cambiarAjustes({ estilo: 'batman' });
    expect(mioActual().apariencia).toEqual({ estilo: 'hoja' });
    ponerMioUnido({ ...mioActual(), apariencia: { estilo: 'pizarron' } });
    expect(ajustesActuales().estilo).toBe('batman');
    fijarUsuario(null);
    fijarUsuario(5);
    expect(mioActual().apariencia).toEqual({ estilo: 'pizarron' });
  });

  it('apagada, un dispositivo cambiado no siembra su configuración al entrar', () => {
    cambiarAjustes({ estilo: 'hoja', mismaEnTodos: false });
    fijarUsuario(5);
    expect(mioActual().apariencia).toBe(null);
  });

  it('prendida otra vez, toma la del alumno como un dispositivo nuevo', () => {
    fijarUsuario(5);
    cambiarAjustes({ mismaEnTodos: false });
    ponerMioUnido({ ...mioActual(), apariencia: { estilo: 'pizarron', letra: 'grande' } });
    cambiarAjustes({ estilo: 'batman' });
    cambiarAjustes({ mismaEnTodos: true });
    const a = ajustesActuales();
    expect([a.estilo, a.letra, a.mismaEnTodos]).toEqual(['pizarron', 'grande', true]);
    expect(mioActual().apariencia).toEqual({ estilo: 'pizarron', letra: 'grande' });
  });
});

describe('volver a como venía', () => {
  it('un dispositivo con su configuración la sigue teniendo aparte', () => {
    fijarUsuario(5);
    ponerMioUnido({ ...mioActual(), apariencia: { estilo: 'pizarron' } });
    cambiarAjustes({ mismaEnTodos: false });
    volverAjustesOriginales();
    expect([ajustesActuales().estilo, ajustesActuales().mismaEnTodos]).toEqual(['original', false]);
  });
});
