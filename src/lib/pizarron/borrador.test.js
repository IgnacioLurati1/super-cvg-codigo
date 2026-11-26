// @vitest-environment node
// The fake database clones with structuredClone: only Node's own Blob comes back as a Blob.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { baseFalsa } from '../baseFalsa.fixture';
import { borrarBorradores, guardarBorrador, guardarFotoEnBorrador, leerBorrador } from './borrador';

const foto = (texto) => new Blob([texto], { type: 'image/jpeg' });
const esquinas = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];

beforeEach(async () => {
  vi.stubGlobal('indexedDB', baseFalsa());
  await borrarBorradores();
});
afterEach(() => vi.unstubAllGlobals());

describe('las fotos sin guardar, en el navegador', () => {
  it('vuelven en orden, como las dejó: esquinas, limpieza y lo que leyó Gemini', async () => {
    await guardarFotoEnBorrador(7, 'f1', new File([foto('uno')], 'uno.jpg', { type: 'image/jpeg' }));
    await guardarFotoEnBorrador(7, 'f2', foto('dos'));
    await guardarBorrador(7, [
      { id: 'f2', nombre: 'dos.jpg', esquinas, tipo: 'verde', modo: 'original', tiza: 'birome', intensidad: 0.8, grosor: 0.3, repasos: [{ puntos: [[0.1, 0.2]], r: 0.01 }], lectura: { estado: 'lista', texto: '$x$' } },
      { id: 'f1', nombre: 'uno.jpg', esquinas, tipo: 'blanco', modo: 'hoja', lectura: { estado: 'leyendo' } },
    ]);
    const vuelta = await leerBorrador(7);
    expect(vuelta.map((f) => f.id)).toEqual(['f2', 'f1']);
    expect(vuelta[0].ficha).toMatchObject({ esquinas, tipo: 'verde', modo: 'original', tiza: 'birome', intensidad: 0.8, grosor: 0.3, repasos: [{ puntos: [[0.1, 0.2]], r: 0.01 }], lectura: { estado: 'lista', texto: '$x$' } });
    expect(vuelta[1].ficha.lectura).toBe(null);
    expect(await vuelta[1].archivo.text()).toBe('uno');
    expect(vuelta[1].archivo.name).toBe('uno.jpg');
  });

  it('una foto que todavía se abría vuelve sin ficha, para detectarla de nuevo', async () => {
    await guardarFotoEnBorrador(7, 'f1', foto('uno'));
    const [f] = await leerBorrador(7);
    expect(f.ficha).toBe(null);
  });

  it('la que se borra o se guarda en la materia se va con su foto; las de otro alumno no se tocan', async () => {
    await guardarFotoEnBorrador(7, 'f1', foto('uno'));
    await guardarFotoEnBorrador(7, 'f2', foto('dos'));
    await guardarFotoEnBorrador(8, 'g1', foto('otro'));
    await guardarBorrador(7, [{ id: 'f2', esquinas }]);
    expect((await leerBorrador(7)).map((f) => f.id)).toEqual(['f2']);
    await guardarBorrador(7, []);
    expect(await leerBorrador(7)).toEqual([]);
    expect((await leerBorrador(8)).map((f) => f.id)).toEqual(['g1']);
  });

  it('Salir las borra a todas', async () => {
    await guardarFotoEnBorrador(7, 'f1', foto('uno'));
    await borrarBorradores();
    expect(await leerBorrador(7)).toEqual([]);
  });

  it('sin base de datos no falla: queda todo en la pestaña', async () => {
    vi.stubGlobal('indexedDB', undefined);
    await borrarBorradores();
    expect(await guardarFotoEnBorrador(7, 'f1', foto('uno'))).toBe(false);
    expect(await guardarBorrador(7, [])).toBe(false);
    expect(await leerBorrador(7)).toEqual([]);
  });
});
