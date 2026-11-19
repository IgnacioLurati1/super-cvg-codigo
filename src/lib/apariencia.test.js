import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ajustesActuales, aparienciaQueViaja, cambiarAjustes, conApariencia, normalizar, volverAjustesOriginales } from './ajustes';
import { fijarUsuario, mioActual, ponerMioUnido, sanearMio } from './mio';
import { arrancarApariencia } from './apariencia';

beforeAll(() => arrancarApariencia());

beforeEach(() => {
  fijarUsuario(null);
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

  it.each(['rosa', 'bosque', 'cafe', 'lavanda', 'infierno', 'glaciar'])('la paleta %s viaja a Drive y vuelve igual', (tema) => {
    expect(aparienciaQueViaja({ estilo: 'hoja', tema })).toEqual({ estilo: 'hoja', tema });
    expect(sanearMio({ apariencia: { estilo: 'hoja', tema } }).apariencia).toEqual({ estilo: 'hoja', tema });
    // The same through the union of the devices: the student's Drive says it and this device shows it.
    fijarUsuario(5);
    ponerMioUnido({ ...mioActual(), apariencia: { estilo: 'hoja', tema } });
    expect([ajustesActuales().estilo, ajustesActuales().tema]).toEqual(['hoja', tema]);
    expect(mioActual().apariencia).toEqual({ estilo: 'hoja', tema });
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
