import { describe, expect, it } from 'vitest';
import { crearCola } from './cola';

const esperar = (ms = 5) => new Promise((r) => setTimeout(r, ms));
// Until the line is empty and nothing runs (timers are coarse on some systems).
const vaciar = async (cola) => {
  for (let i = 0; i < 200 && cola.pendientes; i++) await esperar(2);
  await esperar(20);
};

describe('crearCola', () => {
  it('draws one page at a time, the closest to the view first', async () => {
    const lejos = { 1: 900, 2: 0, 3: 300, 4: 0 };
    const cola = crearCola((n) => lejos[n]);
    const orden = [];
    let enCurso = 0;
    let maximo = 0;
    const dibujo = (n) => async () => {
      enCurso++;
      maximo = Math.max(maximo, enCurso);
      orden.push(n);
      await esperar(2);
      enCurso--;
    };
    for (const n of [1, 2, 3, 4]) cola.pedir(n, dibujo(n));
    await vaciar(cola);
    expect(orden).toEqual([2, 4, 3, 1]);
    expect(maximo).toBe(1);
  });

  it('puts the detail of a page after the whole drawings of the pages in view', async () => {
    const cola = crearCola((n) => (n === 3 ? 400 : 0));
    const orden = [];
    cola.pedir(1, async () => orden.push('detalle 1'), 0.5);
    cola.pedir(2, async () => orden.push('hoja 2'));
    cola.pedir(3, async () => orden.push('hoja 3'));
    await vaciar(cola);
    expect(orden).toEqual(['hoja 2', 'detalle 1', 'hoja 3']);
  });

  it('asks the distance again for each drawing: the view may have moved meanwhile', async () => {
    let vista = 1;
    const cola = crearCola((n) => Math.abs(n - vista));
    const orden = [];
    cola.pedir(1, async () => {
      orden.push(1);
      vista = 5;
    });
    for (const n of [2, 4, 5]) cola.pedir(n, async () => orden.push(n));
    await vaciar(cola);
    expect(orden).toEqual([1, 5, 4, 2]);
  });

  it('takes out what is no longer wanted, and goes on after one that fails', async () => {
    const cola = crearCola(() => 0);
    const orden = [];
    cola.pedir(1, async () => {
      throw new Error('cancelado');
    });
    const sacar = cola.pedir(2, async () => orden.push(2));
    cola.pedir(3, async () => orden.push(3));
    sacar();
    await vaciar(cola);
    expect(orden).toEqual([3]);
    expect(cola.pendientes).toBe(0);
  });
});
