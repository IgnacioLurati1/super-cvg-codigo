import { describe, expect, it, vi } from 'vitest';
import { fotosParaGemini, MAX_FOTOS } from './fotosParaGemini';
import { preguntarNube } from './nube';

describe('fotos para Gemini', () => {
  it('hasta tres, sin las que no se pudieron hacer', async () => {
    const hacer = vi.fn(async (a) => (a === 'rota' ? null : { mime: 'image/jpeg', datos: `/9j/${a}` }));
    expect(await fotosParaGemini(['a', 'rota', 'b', 'c', 'd'], hacer)).toEqual([{ mime: 'image/jpeg', datos: '/9j/a' }, { mime: 'image/jpeg', datos: '/9j/b' }]);
    expect(hacer).toHaveBeenCalledTimes(MAX_FOTOS);
  });

  it('van solo en la pregunta y solo con «Usar Gemini»', async () => {
    localStorage.setItem('cl.consultron.gemini', JSON.stringify({ todo: true, resumenes: true }));
    vi.resetModules();
    const { preguntarNube: preguntar } = await import('./nube');
    const cuerpos = [];
    const pedir = async (_u, init) => {
      cuerpos.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ ok: true, texto: 'Bien.', quedan: 9 }));
    };
    const hacerFoto = async () => ({ mime: 'image/jpeg', datos: '/9j/AAAA' });
    const mensajes = [{ role: 'system', content: 'S' }, { role: 'user', content: 'A' }, { role: 'assistant', content: 'C' }, { role: 'user', content: '¿Qué es esto?' }];
    await preguntar(mensajes, 'todo', { fotos: [new Blob(['x'])], pedir, hacerFoto });
    expect(cuerpos[0].mensajes.map((m) => m.fotos)).toEqual([undefined, undefined, undefined, [{ mime: 'image/jpeg', datos: '/9j/AAAA' }]]);
    await preguntar(mensajes, 'resumenes', { fotos: [new Blob(['x'])], pedir, hacerFoto });
    expect(cuerpos[1].mensajes.some((m) => m.fotos)).toBe(false);
    // A service from before the photos: the question goes again without them.
    const viejo = [];
    const pedirViejo = async (_u, init) => {
      const c = JSON.parse(init.body);
      viejo.push(c);
      return c.mensajes.at(-1).fotos ? new Response(JSON.stringify({ ok: false, motivo: 'invalido' }), { status: 400 }) : new Response(JSON.stringify({ ok: true, texto: 'Sin la foto.', quedan: 8 }));
    };
    expect(await preguntar(mensajes, 'todo', { fotos: [new Blob(['x'])], pedir: pedirViejo, hacerFoto })).toBe('Sin la foto.');
    expect(viejo.map((c) => Boolean(c.mensajes.at(-1).fotos))).toEqual([true, false]);
    localStorage.clear();
    expect(typeof preguntarNube).toBe('function');
  });
});
