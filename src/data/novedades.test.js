import { describe, expect, it } from 'vitest';
import { NOVEDADES } from './novedades';

describe('notas del parche', () => {
  it('cada fecha es real, va una sola vez y de la más nueva a la más vieja', () => {
    const fechas = NOVEDADES.map((n) => n.fecha);
    for (const f of fechas) {
      expect(f).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(new Date(`${f}T12:00:00`).toISOString().slice(0, 10)).toBe(f);
    }
    expect(new Set(fechas).size).toBe(fechas.length);
    expect([...fechas].sort().reverse()).toEqual(fechas);
  });

  it('cada versión tiene título, y lo suyo tiene tipo y texto', () => {
    for (const n of NOVEDADES) {
      expect(n.titulo?.trim().length).toBeGreaterThan(0);
      if (n.cambios) {
        expect(n.cambios.length).toBeGreaterThan(0);
        for (const [tipo, texto] of n.cambios) {
          expect(['nuevo', 'mejora', 'arreglo']).toContain(tipo);
          expect(texto.trim().length).toBeGreaterThan(0);
        }
        continue;
      }
      expect(n.funciones.length + (n.arreglos?.length ?? 0)).toBeGreaterThan(0);
      for (const f of n.funciones) {
        expect(['nuevo', 'mejora']).toContain(f.tipo);
        expect(f.nombre.trim().length).toBeGreaterThan(0);
        expect(f.texto.trim().length).toBeGreaterThan(0);
        for (const p of f.puntos ?? []) expect(p.trim().length).toBeGreaterThan(0);
      }
      for (const a of n.arreglos ?? []) expect(a.trim().length).toBeGreaterThan(0);
    }
  });
});
