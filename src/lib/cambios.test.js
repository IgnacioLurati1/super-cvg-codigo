import { describe, expect, it } from 'vitest';
import { compararFoto, fotoDe } from './cambios';

const item = (clave, modificado) => ({ clave, modificado });

describe('compararFoto', () => {
  it('la primera vez no marca nada como nuevo', () => {
    expect(compararFoto(null, [item('1', 5)]).total).toBe(0);
  });

  it('distingue nuevo, cambiado y borrado', () => {
    const foto = fotoDe([item('1', 5), item('2', 5), item('3', 5)]);
    const r = compararFoto(foto, [item('1', 5), item('2', 9), item('4', 1)]);
    expect(r.nuevos.map((i) => i.clave)).toEqual(['4']);
    expect(r.cambiados.map((i) => i.clave)).toEqual(['2']);
    expect(r.borrados).toBe(1);
    expect(r.total).toBe(3);
  });

  it('la foto no guarda nombres', () => {
    expect(JSON.stringify(fotoDe([{ clave: '1', nombre: 'Secreto', modificado: 2 }]))).not.toContain('Secreto');
  });
});
