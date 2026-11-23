import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NO_ESTA } from './pedido';

// With «Usar Gemini» on and no model on this computer (a phone): everything goes to Gemini (nube.js, motor.js).
const apunte = { trozo: { doc: 'pdf:12', texto: 'Un semáforo protege la sección crítica.', fuente: { tipo: 'pdf', nombre: 'Unidad 1.pdf' } }, puntaje: 3, cubre: 2 };

function respuestas(...textos) {
  const cuerpos = [];
  const pedir = vi.fn(async (_url, init) => {
    cuerpos.push(JSON.parse(init.body));
    const texto = textos.shift();
    return new Response(JSON.stringify(texto === null ? { ok: false, motivo: 'ocupado' } : { ok: true, texto, quedan: 10 }), { status: texto === null ? 503 : 200 });
  });
  vi.stubGlobal('fetch', pedir);
  return cuerpos;
}

async function motor() {
  vi.resetModules();
  localStorage.setItem('cl.consultron.gemini', JSON.stringify({ todo: true }));
  return import('./motor');
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe('Consultron con «Usar Gemini»', () => {
  it('los apuntes del campus van a Gemini con la charla de antes', async () => {
    const cuerpos = respuestas('Lo protege un semáforo [1].', 'Sí, con wait y signal [1].');
    const m = await motor();
    const id = m.empezar('¿Qué protege la sección crítica?');
    m.responder(id, [apunte]);
    const e = await m.alTerminar(id);
    expect(e).toMatchObject({ estado: 'listo', nube: 'todo', texto: 'Lo protege un semáforo [1].' });
    expect(cuerpos[0].mensajes.at(-1).texto).toContain('Un semáforo protege la sección crítica.');
    const otra = m.empezar('¿Y cómo se usa?');
    m.responder(otra, [apunte]);
    await m.alTerminar(otra);
    // The answer before goes with it: with «Usar Gemini», also the ones from the notes.
    expect(cuerpos[1].mensajes.map((x) => x.texto)).toContain('Lo protege un semáforo.');
  });

  it('lo que no está en los apuntes lo contesta Gemini con lo que sabe', async () => {
    const cuerpos = respuestas(NO_ESTA, 'Un monitor es una estructura de sincronización.');
    const m = await motor();
    const id = m.empezar('¿Qué es un monitor?');
    m.responder(id, [apunte]);
    const e = await m.alTerminar(id);
    expect(e).toMatchObject({ estado: 'listo', general: true, nube: 'todo', texto: 'Un monitor es una estructura de sincronización.' });
    expect(cuerpos).toHaveLength(2);
  });

  it('sin trozos (un saludo o algo general), también Gemini', async () => {
    respuestas('Hola, ¿en qué te ayudo?');
    const m = await motor();
    const id = m.empezar('¿Qué es la entropía?');
    m.responder(id, []);
    expect(await m.alTerminar(id)).toMatchObject({ estado: 'listo', general: true, nube: 'todo' });
  });

  it('si Gemini no contesta y no hay modelo, dice por qué', async () => {
    respuestas(null);
    const m = await motor();
    const id = m.empezar('¿Qué protege la sección crítica?');
    m.responder(id, [apunte]);
    expect(await m.alTerminar(id)).toMatchObject({ estado: 'no-esta', texto: 'Gemini no responde. Probá de nuevo en un rato.' });
  });

  it('sin internet y sin modelo, muestra los trozos que encontró, sin salir a la red', async () => {
    const cuerpos = respuestas('No debería llegar.');
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const m = await motor();
    const otro = { trozo: { doc: 'pdf:13', pagina: 4, texto: 'Un monitor\n  agrupa los datos [2] y sus **procedimientos**.', fuente: { tipo: 'pdf', nombre: 'Unidad 2.pdf' } } };
    const id = m.empezar('¿Qué protege la sección crítica?');
    m.responder(id, [apunte, otro]);
    const e = await m.alTerminar(id);
    expect(e).toMatchObject({ estado: 'listo', elegidos: [apunte, otro] });
    expect(e.texto).toBe('Sin internet. Esto encontré en tus apuntes:\n\n- Un semáforo protege la sección crítica. [1]\n- Un monitor agrupa los datos y sus procedimientos. [2]');
    expect(e.nube).toBeUndefined();
    expect(cuerpos).toHaveLength(0);
    // Without pieces there is nothing to show: it says why.
    const general = m.empezar('¿Qué es la entropía?');
    m.responder(general, []);
    expect(await m.alTerminar(general)).toMatchObject({ estado: 'no-esta', texto: 'Sin internet, Gemini no puede contestar.' });
    vi.restoreAllMocks();
  });

  it('sin internet y sin «Usar Gemini», también los trozos', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    vi.resetModules();
    const m = await import('./motor');
    const id = m.empezar('¿Qué protege la sección crítica?');
    m.responder(id, [apunte]);
    expect((await m.alTerminar(id)).texto).toMatch(/^Sin internet\. Esto encontré en tus apuntes:/);
    vi.restoreAllMocks();
  });

  it('los datos de un ejercicio salen de Gemini como JSON, aunque venga en un bloque de código', async () => {
    const cuerpos = respuestas('```json\n{"a": 3}\n```');
    const m = await motor();
    const id = m.empezar('Calculá con a = 3');
    const esquema = { type: 'object', properties: { a: { type: 'number' } } };
    expect(await m.pedirDatos(id, [{ role: 'system', content: 'Datos.' }, { role: 'user', content: 'a = 3' }], esquema)).toBe('{"a": 3}');
    expect(cuerpos[0].mensajes.at(-1).texto).toContain(JSON.stringify(esquema));
  });

  it('un JSON roto de Gemini, sin modelo, no da datos', async () => {
    respuestas('No sé.');
    const m = await motor();
    const id = m.empezar('Calculá');
    expect(await m.pedirDatos(id, [{ role: 'user', content: 'x' }], { type: 'object' })).toBe(null);
  });
});

describe('soloJson', () => {
  it('solo un objeto o una lista', async () => {
    const { soloJson } = await motor();
    expect(soloJson('{"a":1}')).toBe('{"a":1}');
    expect(soloJson('```\n[1]\n```')).toBe('[1]');
    for (const t of ['3', '"x"', 'hola', '', null]) expect(soloJson(t)).toBe(null);
  });
});

describe('el modelo de la compu con «Usar Gemini»', () => {
  it('no se carga solo al abrir Super CVG ni Consultron', async () => {
    const m = await motor();
    const Worker = vi.fn();
    vi.stubGlobal('Worker', Worker);
    await m.precalentar();
    m.cargarSiHaceFalta();
    expect(Worker).not.toHaveBeenCalled();
    expect(m.useConsultron).toBeTypeOf('function');
  });
});
