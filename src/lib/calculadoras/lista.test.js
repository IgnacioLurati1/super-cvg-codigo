import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SITIO } from '../../../sitio.config.js';
import { CALCULADORAS, MATERIAS_DE_CALCULADORAS, calculadoraDe } from './lista';

const publico = path.resolve(__dirname, '../../../public');

describe('la lista de calculadoras', () => {
  it('cada una con su dirección, sin repetir', () => {
    const slugs = CALCULADORAS.map((c) => c.slug);
    expect(slugs.length).toBeGreaterThan(20);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) expect(s).toMatch(/^[a-z0-9-]+$/);
  });

  it('cada una tiene su pantalla, y cada pantalla es de una de la lista', () => {
    const slugs = CALCULADORAS.map((c) => c.slug).sort();
    const propias = path.resolve(__dirname, '../../components/calculadoras/propias');
    const piezas = fs.readdirSync(propias).filter((f) => f.endsWith('.jsx') && !f.startsWith('_') && !f.endsWith('.test.jsx'));
    expect(piezas.map((f) => f.replace(/\.jsx$/, '')).sort()).toEqual(slugs);
  });

  it('cada una con nombre corto, descripción de una tarjeta y al menos una materia', () => {
    for (const c of CALCULADORAS) {
      expect(c.nombre.length, c.slug).toBeLessThanOrEqual(32);
      expect(c.descripcion.length, c.slug).toBeLessThanOrEqual(90);
      expect(c.materias.length, c.slug).toBeGreaterThan(0);
    }
    expect(MATERIAS_DE_CALCULADORAS).toEqual([...MATERIAS_DE_CALCULADORAS].sort((a, b) => a.localeCompare(b, 'es')));
  });

  it('cada una trae sus dos fotos', () => {
    for (const c of CALCULADORAS) {
      for (const tema of ['claro', 'oscuro']) expect(fs.existsSync(path.join(publico, 'calculadoras', `${c.slug}-${tema}.webp`)), `${c.slug} ${tema}`).toBe(true);
    }
  });

  it('la lista y cada calculadora son privadas, fuera de los buscadores', () => {
    expect(SITIO.privadas).toContain('calculadoras');
    for (const c of CALCULADORAS) expect(SITIO.privadas).toContain(`calculadoras/${c.slug}`);
    for (const c of CALCULADORAS) expect(SITIO.publicas.map((p) => p.ruta)).not.toContain(`calculadoras/${c.slug}`);
  });

  it('una dirección que no existe no es ninguna', () => {
    expect(calculadoraDe('campo').nombre).toBe('Campo vectorial');
    expect(calculadoraDe('otra')).toBe(null);
    expect(calculadoraDe(undefined)).toBe(null);
  });
});
