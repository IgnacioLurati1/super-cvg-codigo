import { describe, expect, it } from 'vitest';
import { filtrarRutas } from './rutas.mjs';

const FIJAS = [{ ruta: '', titulo: 'Inicio', descripcion: 'x' }, { ruta: 'tienda', titulo: 'Tienda', descripcion: 'x' }];

describe('páginas que salen de la base', () => {
  it('suma las válidas, con la descripción del sitio si les falta', () => {
    const r = filtrarRutas(FIJAS, [{ ruta: 'productos/mate-imperial', titulo: 'Mate' }]);
    expect(r).toHaveLength(3);
    expect(r[2].descripcion).toBeTruthy();
  });

  it('nunca escribe fuera de dist ni rutas raras', () => {
    const malas = ['../afuera', 'a/../../b', '/absoluta', 'a//b', 'con espacio', 'Mayus', 'a\\b', '', null, 'c:/x'];
    expect(filtrarRutas(FIJAS, malas.map((ruta) => ({ ruta, titulo: 'x' })))).toEqual(FIJAS);
  });

  it('sin título no entra, y una repetida tampoco', () => {
    expect(filtrarRutas(FIJAS, [{ ruta: 'a' }, { ruta: 'tienda', titulo: 'Otra' }, { ruta: 'b', titulo: 'B' }, { ruta: 'b', titulo: 'B2' }]).map((p) => p.titulo)).toEqual(['Inicio', 'Tienda', 'B']);
  });
});
