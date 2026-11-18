import { describe, expect, it, vi } from 'vitest';
import { largoOpinion, limpiarOpinion, mandarOpinion, MAX_OPINION, MOTIVOS } from './opinion';
import { CONTADOR } from './visita';

const SITIO = 'https://supercvg.lutastudios.com';
const responde = (status, cuerpo) => vi.fn(async () => new Response(typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo), { status }));

describe('el texto de una opinión', () => {
  it('se limpia y se cuenta como lo guarda el panel', () => {
    expect(limpiarOpinion('  hola\r\nchau\u0007  ')).toBe('hola\nchau');
    expect(largoOpinion('👍👍')).toBe(2);
    expect(largoOpinion('   ')).toBe(0);
  });
});

describe('mandar una opinión', () => {
  it('desde el sitio publicado manda solo el tipo y el texto, sin cookies ni de dónde viene', async () => {
    const pedir = responde(200, { ok: true });
    expect(await mandarOpinion('  Falta el modo oscuro en el calendario ', { origen: SITIO, pedir })).toEqual({ ok: true });
    expect(pedir).toHaveBeenCalledTimes(1);
    const [url, op] = pedir.mock.calls[0];
    expect(url).toBe(CONTADOR);
    expect(op).toMatchObject({ method: 'POST', credentials: 'omit', referrerPolicy: 'no-referrer' });
    expect(op.headers).toBeUndefined();
    expect(JSON.parse(op.body)).toEqual({ tipo: 'opinion', texto: 'Falta el modo oscuro en el calendario' });
  });

  it('desde cualquier otro lado no manda nada: la respuesta es de mentira', async () => {
    const pedir = vi.fn();
    for (const origen of ['http://localhost:5330', 'http://127.0.0.1:4173', 'https://lutastudios.com']) {
      expect(await mandarOpinion('hola', { origen, pedir })).toEqual({ ok: true });
    }
    expect(pedir).not.toHaveBeenCalled();
  });

  it('vacía o larga no sale', async () => {
    const pedir = vi.fn();
    expect(await mandarOpinion(' \n ', { origen: SITIO, pedir })).toEqual({ ok: false, motivo: 'vacio' });
    expect(await mandarOpinion('a'.repeat(MAX_OPINION + 1), { origen: SITIO, pedir })).toEqual({ ok: false, motivo: 'largo' });
    expect(pedir).not.toHaveBeenCalled();
    const justa = responde(200, { ok: true });
    expect(await mandarOpinion('a'.repeat(MAX_OPINION), { origen: SITIO, pedir: justa })).toEqual({ ok: true });
  });

  it.each([
    [429, { ok: false, motivo: 'seguido' }, 'seguido'],
    [429, { ok: false, motivo: 'tope' }, 'tope'],
    [503, { ok: false, motivo: 'pausado' }, 'pausado'],
    [400, { ok: false, motivo: 'vacio' }, 'vacio'],
    [400, { ok: false, motivo: 'largo' }, 'largo'],
    [403, { ok: false, motivo: 'origen' }, 'error'],
    [500, { ok: false, motivo: 'error' }, 'error'],
    [500, '<html>caído</html>', 'error'],
    [200, { ok: false, motivo: 'raro' }, 'error'],
    [200, '{}', 'error'],
  ])('un %i con %j se cuenta como «%s»', async (status, cuerpo, motivo) => {
    expect(await mandarOpinion('hola', { origen: SITIO, pedir: responde(status, cuerpo) })).toEqual({ ok: false, motivo });
    expect(MOTIVOS[motivo]).toBeTruthy();
  });

  it('sin conexión lo dice, sin tirar un error', async () => {
    const pedir = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
    expect(await mandarOpinion('hola', { origen: SITIO, pedir })).toEqual({ ok: false, motivo: 'red' });
  });
});
