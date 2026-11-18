import { describe, expect, it, vi } from 'vitest';
import { CONTADOR, contarVisita } from './visita';

const almacen = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) };
};

describe('contarVisita', () => {
  it('counts once per tab from the published site, with only the type in the body', () => {
    const pedir = vi.fn(() => Promise.resolve(new Response('{}')));
    const a = almacen();
    expect(contarVisita({ origen: 'https://supercvg.lutastudios.com', almacen: a, pedir })).toBe(true);
    expect(contarVisita({ origen: 'https://supercvg.lutastudios.com', almacen: a, pedir })).toBe(false);
    expect(pedir).toHaveBeenCalledTimes(1);
    const [url, op] = pedir.mock.calls[0];
    expect(url).toBe(CONTADOR);
    expect(op).toMatchObject({ method: 'POST', credentials: 'omit', referrerPolicy: 'no-referrer' });
    expect(JSON.parse(op.body)).toEqual({ tipo: 'visita' });
    expect(op.headers).toBeUndefined();
  });

  it('does not count from anywhere else', () => {
    const pedir = vi.fn(() => Promise.resolve());
    for (const origen of ['http://localhost:5330', 'http://127.0.0.1:4173', 'https://lutastudios.com', 'null']) {
      expect(contarVisita({ origen, almacen: almacen(), pedir })).toBe(false);
    }
    expect(pedir).not.toHaveBeenCalled();
  });

  it('still counts without storage, and a failed request does not throw', async () => {
    const roto = { getItem: () => { throw new Error('no'); }, setItem: () => { throw new Error('no'); } };
    const pedir = vi.fn(() => Promise.reject(new TypeError('sin red')));
    expect(contarVisita({ origen: 'https://supercvg.lutastudios.com', almacen: roto, pedir })).toBe(true);
    await Promise.resolve();
    expect(pedir).toHaveBeenCalledTimes(1);
  });
});
