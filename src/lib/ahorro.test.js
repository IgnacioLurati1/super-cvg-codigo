import { afterEach, describe, expect, it, vi } from 'vitest';
import { ahorrarDatos, conexionLimitada, escucharAhorro } from './ahorro';
import { aparienciaQueViaja, ajustesActuales, cambiarAjustes, conApariencia, normalizar, volverAjustesOriginales } from './ajustes';

// A connection of the Network Information API, with its `change`.
function conexion(datos) {
  const c = new EventTarget();
  Object.assign(c, datos);
  Object.defineProperty(navigator, 'connection', { value: c, configurable: true });
  return c;
}

afterEach(() => {
  delete navigator.connection;
  volverAjustesOriginales();
  cambiarAjustes({ ahorro: 'auto', luz: false });
});

describe('la conexión pide ahorrar', () => {
  it('con el ahorro de datos del navegador', () => {
    expect(conexionLimitada({ saveData: true, effectiveType: '4g' })).toBe(true);
  });

  it('con una conexión de 3G para abajo', () => {
    for (const lenta of ['slow-2g', '2g', '3g']) expect(conexionLimitada({ effectiveType: lenta })).toBe(true);
    expect(conexionLimitada({ effectiveType: '4g', saveData: false })).toBe(false);
  });

  it('sin saber nada de la conexión, no', () => {
    expect(conexionLimitada(undefined)).toBe(false);
    expect(conexionLimitada({})).toBe(false);
  });
});

describe('ahorrar datos', () => {
  it('Automático sigue a la conexión', () => {
    expect(ahorrarDatos({ modo: 'auto', conexion: { saveData: true } })).toBe(true);
    expect(ahorrarDatos({ modo: 'auto', conexion: { effectiveType: '2g' } })).toBe(true);
    expect(ahorrarDatos({ modo: 'auto', conexion: { effectiveType: '4g' } })).toBe(false);
  });

  it('Siempre y Nunca mandan sobre la conexión', () => {
    expect(ahorrarDatos({ modo: 'siempre', conexion: { effectiveType: '4g' } })).toBe(true);
    expect(ahorrarDatos({ modo: 'nunca', conexion: { saveData: true, effectiveType: 'slow-2g' } })).toBe(false);
  });

  it('sin argumentos lee el ajuste y la conexión de este navegador', () => {
    conexion({ effectiveType: '3g' });
    expect(ahorrarDatos()).toBe(true);
    cambiarAjustes({ ahorro: 'nunca' });
    expect(ahorrarDatos()).toBe(false);
    cambiarAjustes({ ahorro: 'siempre' });
    navigator.connection.effectiveType = '4g';
    expect(ahorrarDatos()).toBe(true);
  });

  it('avisa cuando cambia la conexión o el ajuste, y deja de avisar', () => {
    const c = conexion({ effectiveType: '4g' });
    const avisar = vi.fn();
    const dejar = escucharAhorro(avisar);
    c.effectiveType = '2g';
    c.dispatchEvent(new Event('change'));
    expect(avisar).toHaveBeenCalledTimes(1);
    expect(ahorrarDatos()).toBe(true);
    cambiarAjustes({ ahorro: 'nunca' });
    expect(avisar).toHaveBeenCalledTimes(2);
    dejar();
    c.dispatchEvent(new Event('change'));
    cambiarAjustes({ ahorro: 'siempre' });
    expect(avisar).toHaveBeenCalledTimes(2);
  });
});

describe('el ajuste', () => {
  it('es Automático salvo que se elija otro válido', () => {
    expect(normalizar(null).ahorro).toBe('auto');
    expect(normalizar({ ahorro: 'siempre' }).ahorro).toBe('siempre');
    expect(normalizar({ ahorro: 'nunca' }).ahorro).toBe('nunca');
    for (const raro of ['si', true, 1, null, {}]) expect(normalizar({ ahorro: raro }).ahorro).toBe('auto');
  });

  it('es de cada dispositivo: no viaja ni se pisa con lo que viene de Drive', () => {
    expect(aparienciaQueViaja({ ahorro: 'siempre' })).not.toHaveProperty('ahorro');
    expect(conApariencia(normalizar({ ahorro: 'siempre' }), { ahorro: 'nunca' }).ahorro).toBe('siempre');
  });

  it('Volver todo a como venía no lo toca', () => {
    cambiarAjustes({ ahorro: 'siempre', tema: 'oscuro' });
    volverAjustesOriginales();
    expect(ajustesActuales().ahorro).toBe('siempre');
    expect(ajustesActuales().tema).toBe('sistema');
    cambiarAjustes({ ahorro: 'siempre', luz: true });
    volverAjustesOriginales();
    expect(ajustesActuales()).toMatchObject({ ahorro: 'siempre', luz: true });
  });
});
