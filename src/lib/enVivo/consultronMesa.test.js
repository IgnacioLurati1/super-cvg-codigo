// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { permitirNube, preguntarNube } from '../consultron/nube';
import { NO_ESTA } from '../consultron/pedido';
import { contestar, contextoDeLaMesa, hilo, hiloDeLaMesa, hiloEnTexto, MAX_HILO, MAX_RESPUESTA, preguntarEnMesa, responderEnMesa } from './consultronMesa';
import { abrirPestana } from './mesa';
import { CADA_CAMBIOS, crearSesion, redesLocales } from './sesion';

const abiertas = [];
function armar(n) {
  const redes = redesLocales(n);
  const sesiones = redes.map((red, k) => crearSesion({ red, yo: { nombre: `Alumno ${k}`, color: '#123456' } }));
  abiertas.push(...sesiones);
  return sesiones;
}
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
afterEach(() => {
  abiertas.splice(0).forEach((s) => s.cerrar());
  permitirNube('mesa', false);
});

// A table with a document and the Consultron, and texts registered that aren't tabs of the table.
function mesaConTextos(a) {
  const documento = abrirPestana(a.doc, 'documento', { titulo: 'Resumen de Ohm' });
  a.paraConsultron(documento, () => 'La ley de Ohm dice que la tensión es la corriente por la resistencia.');
  a.paraConsultron('privado', () => 'NOTA DEL PARCIAL: 4');
  return { documento };
}

describe('Consultron de la mesa', () => {
  it('la pregunta y la respuesta les llegan a todos, con quién preguntó y quién contestó', async () => {
    const [a, b] = armar(2);
    mesaConTextos(a);
    const datosA = hiloDeLaMesa(a.doc);
    const id = preguntarEnMesa(a.doc, datosA, a.yo, '¿Qué dice la ley de Ohm?');
    await esperar(CADA_CAMBIOS + 30);
    const datosB = hiloDeLaMesa(b.doc);
    expect(hilo(datosB)).toMatchObject([{ id, pregunta: '¿Qué dice la ley de Ohm?', de: a.yo.id, nombre: 'Alumno 0', estado: 'pensando', respuesta: '' }]);

    permitirNube('mesa', true);
    const pedir = vi.fn(async () => ({ json: async () => ({ ok: true, texto: 'La tensión es **corriente por resistencia** [1].', quedan: 14 }) }));
    const compu = vi.fn();
    const r = await responderEnMesa({
      pregunta: '¿Qué dice la ley de Ohm?',
      docs: contextoDeLaMesa(a.doc, a.textos()),
      entradas: hilo(datosA),
      id,
      conGemini: true,
      nube: (mensajes) => preguntarNube(mensajes, 'mesa', { pedir }),
      compu,
    });
    contestar(datosA, id, r);
    await esperar(CADA_CAMBIOS + 30);
    expect(hilo(datosB)[0]).toMatchObject({ estado: 'listo', quien: 'gemini', fuentes: ['Resumen de Ohm'], general: false, respuesta: 'La tensión es **corriente por resistencia** [1].' });
    expect(compu).not.toHaveBeenCalled();

    // To Google went the question and the text of the table's tabs, and nothing else.
    const cuerpo = pedir.mock.calls[0][1].body;
    expect(cuerpo).toContain('La ley de Ohm dice');
    expect(cuerpo).toContain('Resumen de Ohm');
    expect(cuerpo).not.toContain('NOTA DEL PARCIAL');
    expect(cuerpo).not.toContain('el hilo mismo');
    expect(Object.keys(JSON.parse(cuerpo))).toEqual(['dispositivo', 'mensajes']);
  });

  it('sin Gemini contesta la compu de quien preguntó; si la mesa no lo tiene, contesta en general', async () => {
    const [a] = armar(1);
    mesaConTextos(a);
    const nube = vi.fn();
    const compu = vi.fn().mockResolvedValueOnce(NO_ESTA).mockResolvedValueOnce('La fotosíntesis es cómo las plantas hacen su alimento.');
    const r = await responderEnMesa({ pregunta: '¿Qué es la fotosíntesis?', docs: contextoDeLaMesa(a.doc, a.textos()), compu, nube });
    expect(nube).not.toHaveBeenCalled();
    expect(compu).toHaveBeenCalledTimes(2);
    expect(r).toMatchObject({ estado: 'listo', quien: 'compu', general: true, fuentes: [] });
    expect(compu.mock.calls[1][0][0].content).not.toContain('fragmentos');
  });

  it('si no contesta nadie, la pregunta queda sin respuesta', async () => {
    const r = await responderEnMesa({ pregunta: 'hola', docs: [], conGemini: true, nube: async () => null, compu: async () => null });
    expect(r.estado).toBe('falla');
  });

  it('lo que otro escribe mal armado se ignora o se corta', async () => {
    const [a, b] = armar(2);
    const datosB = hiloDeLaMesa(b.doc);
    b.doc.transact(() => {
      datosB.set('q:nohex', { pregunta: 'x', de: 'r1', estado: 'listo' });
      datosB.set('q:aaaaaaaaaaaa', 'texto suelto');
      datosB.set('q:bbbbbbbbbbbb', { pregunta: 'hola', de: '<b>', estado: 'listo' });
      datosB.set('q:cccccccccccc', { pregunta: '   ', de: 'r1' });
      datosB.set('q:dddddddddddd', { pregunta: 'vale', de: 'r1', estado: 'hackeado', respuesta: 'r'.repeat(MAX_RESPUESTA + 50), quien: 'yo', fuentes: 'x', cuando: 1 });
    });
    await esperar(CADA_CAMBIOS + 30);
    const visto = hilo(hiloDeLaMesa(a.doc));
    expect(visto).toHaveLength(1);
    expect(visto[0]).toMatchObject({ id: 'dddddddddddd', estado: 'falla', quien: '', fuentes: [] });
    expect(visto[0].respuesta.length).toBe(MAX_RESPUESTA);
  });

  it('el hilo no crece sin fin', () => {
    const [a] = armar(1);
    const datos = hiloDeLaMesa(a.doc);
    for (let i = 0; i < MAX_HILO + 5; i += 1) preguntarEnMesa(a.doc, datos, a.yo, `pregunta ${i}`);
    expect(hilo(datos)).toHaveLength(MAX_HILO);
  });

  it('«Guardar en lo mío» se lleva las preguntas y sus respuestas como texto con formato del sitio', async () => {
    const { leerFormato } = await import('../formato');
    const [a] = armar(1);
    const datos = hiloDeLaMesa(a.doc);
    const q1 = preguntarEnMesa(a.doc, datos, a.yo, '¿Qué dice la ley de Ohm?');
    contestar(datos, q1, { estado: 'listo', respuesta: 'Que **V = I R** [1].\n\n- Tensión $V$\n- Corriente', quien: 'gemini', fuentes: ['Apunte de Ohm'] });
    preguntarEnMesa(a.doc, datos, a.yo, 'Sin respuesta todavía');
    const texto = hiloEnTexto(hilo(datos));
    expect(texto).toBe('# ¿Qué dice la ley de Ohm?\n*Preguntó Alumno 0.*\nQue **V = I R**.\n- Tensión V\n- Corriente\n*Sale de «Apunte de Ohm».*');
    expect(leerFormato(texto).map((b) => b.tipo)).toContain('lista');
  });
});
