import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ajustesActuales, cambiarAjustes, cambiarLuz, cambiarSegunLaHora, normalizar, volverAjustesOriginales } from './ajustes';

const a = (h) => new Date(2026, 10, 23, h);

describe('Sensible a la luz devuelve el diseño de antes', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(a(12));
    volverAjustesOriginales();
  });
  afterEach(() => {
    cambiarLuz(false);
    volverAjustesOriginales();
    vi.useRealTimers();
  });

  it('prendido pone todo oscuro; apagado vuelve el tema y el PDF que tenías', () => {
    cambiarAjustes({ tema: 'glaciar', pdf: 'sepia', accion: '#0e7490' });
    cambiarLuz(true);
    expect([ajustesActuales().tema, ajustesActuales().pdf]).toEqual(['oscuro', 'oscuro']);
    cambiarLuz(true);
    cambiarLuz(false);
    const { tema, pdf, accion, luz, luzAntes } = ajustesActuales();
    expect({ tema, pdf, accion, luz, luzAntes }).toEqual({ tema: 'glaciar', pdf: 'sepia', accion: '#0e7490', luz: false, luzAntes: null });
  });

  it('lo que cambiaste mientras estaba prendido queda', () => {
    cambiarAjustes({ tema: 'glaciar', pdf: 'claro' });
    cambiarLuz(true);
    cambiarAjustes({ tema: 'bosque' });
    cambiarLuz(false);
    expect([ajustesActuales().tema, ajustesActuales().pdf]).toEqual(['bosque', 'claro']);
  });

  it('con Según la hora, si cambió la hora, vuelve el diseño que se oscureció', () => {
    cambiarAjustes({ tema: 'glaciar' });
    cambiarSegunLaHora(true);
    cambiarLuz(true);
    expect(ajustesActuales().segunLaHora.dia.tema).toBe('oscuro');
    vi.setSystemTime(a(22));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(ajustesActuales().tema).toBe(ajustesActuales().segunLaHora.noche.tema);
    cambiarLuz(false);
    expect(ajustesActuales().segunLaHora.dia.tema).toBe('glaciar');
    cambiarSegunLaHora(false);
  });

  it('lo guardado a mano que no se lee no devuelve nada', () => {
    for (const raro of [null, 'glaciar', { tema: 'x', pdf: 'claro' }, { tema: 'glaciar' }]) expect(normalizar({ luz: true, luzAntes: raro }).luzAntes).toBeNull();
    expect(normalizar({ luz: false, luzAntes: { tema: 'glaciar', pdf: 'claro' } }).luzAntes).toBeNull();
  });
});
