import { beforeEach, describe, expect, it, vi } from 'vitest';

const resumen = (n) => ({ trozo: { doc: `resumen:${n}`, texto: 'Simular es experimentar con un modelo.', fuente: { tipo: 'resumen', nombre: 'Simulación' } } });
const oficial = { trozo: { doc: 'oficial:simulacion/1#a', texto: 'Modelos.', fuente: { tipo: 'oficial', nombre: 'Modelos' } } };
const carrera = { trozo: { doc: 'carrera', texto: '- Para cursar Legislación no te falta nada.', fuente: { tipo: 'guia', nombre: 'Tu carrera' } } };
const enTuCarrera = { trozo: { doc: 'pantalla', texto: 'Tu carrera', fuente: { tipo: 'pantalla', nombre: 'Tu carrera' } } };
const guia = { trozo: { doc: 'sitio:/carrera', texto: 'Tu carrera muestra tu plan.', fuente: { tipo: 'guia', nombre: 'Tu carrera' } } };
const apunte = { trozo: { doc: 'pdf:12', texto: 'Apunte del docente.', fuente: { tipo: 'pdf', nombre: 'Unidad 1.pdf' } } };
const nota = { trozo: { doc: 'nota:m3', texto: 'Mi nota.', fuente: { tipo: 'propia', clase: 'nota' } } };
const cursada = { trozo: { doc: 'cursada:dia', texto: 'El viernes tenés parcial.', fuente: { tipo: 'guia', nombre: 'Calendario' } } };

// Each test with this module new: its state is read from localStorage when it loads.
async function nube() {
  vi.resetModules();
  return import('./nube');
}

beforeEach(() => localStorage.clear());

describe('qué puede ir a Gemini', () => {
  it('solo resúmenes de El Santo Resumen, o su carrera con la guía del sitio', async () => {
    const { deLaNube } = await nube();
    expect(deLaNube([resumen(1), resumen(2), oficial])).toBe('resumenes');
    expect(deLaNube([carrera])).toBe('carrera');
    expect(deLaNube([enTuCarrera, guia])).toBe('carrera');
  });

  it('nunca los apuntes de sus materias, sus notas ni su calendario, tampoco mezclados', async () => {
    const { deLaNube } = await nube();
    for (const elegidos of [[apunte], [nota], [cursada], [resumen(1), apunte], [carrera, nota], [guia], []]) expect(deLaNube(elegidos)).toBe(null);
  });

  it('va con el permiso de cada cosa y mientras le queden preguntas', async () => {
    const { nubePara, permitirNube } = await nube();
    expect(nubePara([resumen(1)])).toBe(null);
    permitirNube('resumenes', true);
    expect(nubePara([resumen(1)])).toBe('resumenes');
    expect(nubePara([carrera]), 'el de los resúmenes no alcanza para su carrera').toBe(null);
    permitirNube('carrera', true);
    expect(nubePara([carrera])).toBe('carrera');
    expect(JSON.parse(localStorage.getItem('cl.consultron.gemini'))).toMatchObject({ resumenes: true, carrera: true });
  });
});

describe('preguntar a Gemini', () => {
  const mensajes = [{ role: 'system', content: 'Instrucciones' }, { role: 'assistant', content: 'Antes' }, { role: 'user', content: 'Fragmentos… Pregunta: ¿Por qué simulamos?' }];
  const responde = (cuerpo, status = 200) => vi.fn(async () => new Response(JSON.stringify(cuerpo), { status }));

  it('manda solo los mensajes y el número del navegador, y anota cuántas le quedan', async () => {
    const { permitirNube, preguntarNube, quedanHoy, usePermisosNube } = await nube();
    permitirNube('resumenes', true);
    const pedir = responde({ ok: true, texto: 'Para experimentar [1].', quedan: 14 });
    expect(await preguntarNube(mensajes, 'resumenes', { pedir })).toBe('Para experimentar [1].');
    const [url, opciones] = pedir.mock.calls[0];
    expect(url).toBe('https://spltnoksgdkbaamskuau.supabase.co/functions/v1/supercvg-consultron');
    expect(opciones.credentials).toBe('omit');
    const cuerpo = JSON.parse(opciones.body);
    expect(Object.keys(cuerpo).sort()).toEqual(['dispositivo', 'mensajes']);
    expect(cuerpo.mensajes.map((m) => m.rol)).toEqual(['sistema', 'consultron', 'alumno']);
    expect(cuerpo.dispositivo).toMatch(/^[0-9a-f-]{36}$/);
    expect(quedanHoy()).toBe(14);
    expect(usePermisosNube).toBeTypeOf('function');
    // The same number every time: it counts its 15.
    await preguntarNube(mensajes, 'resumenes', { pedir });
    expect(JSON.parse(pedir.mock.calls[1][1].body).dispositivo).toBe(cuerpo.dispositivo);
  });

  it('sin permiso no pregunta', async () => {
    const { preguntarNube } = await nube();
    const pedir = responde({ ok: true, texto: 'x', quedan: 1 });
    expect(await preguntarNube(mensajes, 'resumenes', { pedir })).toBe(null);
    expect(pedir).not.toHaveBeenCalled();
  });

  it('con el tope del día, Google saturado o sin conexión, contesta la compu', async () => {
    const { nubePara, permitirNube, preguntarNube, quedanHoy } = await nube();
    permitirNube('resumenes', true);
    expect(await preguntarNube(mensajes, 'resumenes', { pedir: responde({ ok: false, motivo: 'ocupado' }, 503) })).toBe(null);
    expect(await preguntarNube(mensajes, 'resumenes', { pedir: vi.fn(async () => { throw new TypeError('Failed to fetch'); }) })).toBe(null);
    expect(await preguntarNube(mensajes, 'resumenes', { pedir: responde({ ok: false, motivo: 'tope_alumno', quedan: 0 }, 429) })).toBe(null);
    expect(quedanHoy()).toBe(0);
    expect(nubePara([resumen(1)]), 'sin preguntas hoy, ni lo intenta').toBe(null);
  });

  it('frenada, no espera a Google', async () => {
    const { permitirNube, preguntarNube } = await nube();
    permitirNube('resumenes', true);
    const control = new AbortController();
    const pedir = vi.fn((_, { signal }) => new Promise((_ok, falla) => signal.addEventListener('abort', () => falla(new DOMException('', 'AbortError')))));
    const espera = preguntarNube(mensajes, 'resumenes', { pedir, senal: control.signal });
    control.abort();
    expect(await espera).toBe(null);
  });
});

describe('quién contesta', () => {
  const hoy = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  // Each case: the permission, the model ready (only on a computer with a video card), questions left today, and
  // whether the pieces may go to Gemini at all.
  const casos = [];
  for (const prendido of [true, false])
    for (const placa of [true, false])
      for (const conModelo of placa ? [true, false] : [false])
        for (const tope of [true, false])
          for (const sePuede of [true, false]) casos.push({ prendido, placa, conModelo, tope, sePuede });

  it.each(casos)('permiso $prendido, placa $placa, modelo listo $conModelo, tope $tope, lugar de Gemini $sePuede', async ({ prendido, conModelo, tope, sePuede }) => {
    const { quienContesta } = await nube();
    const permisos = { resumenes: prendido, carrera: false, ...(tope ? { quedan: 0, dia: hoy() } : {}) };
    const esperado = prendido && sePuede && !tope ? 'nube' : conModelo ? 'compu' : null;
    expect(quienContesta(sePuede ? 'resumenes' : null, { permisos, conModelo })).toBe(esperado);
  });

  it('con el permiso prendido, Gemini primero aunque el modelo esté listo', async () => {
    const { nubePara, permitirNube, quienContesta } = await nube();
    permitirNube('resumenes', true);
    expect(quienContesta('resumenes', { conModelo: true })).toBe('nube');
    expect(nubePara([resumen(1)])).toBe('resumenes');
    // Their notes, Classroom and their dates, never: the model, as always.
    for (const elegidos of [[apunte], [nota], [cursada], [resumen(1), apunte]]) expect(nubePara(elegidos)).toBe(null);
  });

  it('cada lugar con sus permisos: al lado de un resumen, el de los resúmenes; al lado de otro archivo, ninguno', async () => {
    const { nubeEnElLugar, permisosDelLugar } = await nube();
    expect(permisosDelLugar({ enResumen: true })).toEqual(['resumenes']);
    expect(permisosDelLugar({ enResumen: 'archivo' })).toEqual([]);
    expect(permisosDelLugar()).toEqual(['resumenes', 'carrera']);
    expect(nubeEnElLugar({ carrera: true }, { enResumen: true }), 'su carrera no contesta al lado de un resumen').toBe(false);
    expect(nubeEnElLugar({ resumenes: true }, { enResumen: 'archivo' }), 'un PDF del campus no va a Gemini').toBe(false);
    expect(nubeEnElLugar({ carrera: true })).toBe(true);
  });

  it('se puede preguntar con Gemini prendido aunque el modelo no esté, y sin él solo con el modelo listo', async () => {
    const { sePuedePreguntar } = await import('./motor');
    const con = { resumenes: true };
    for (const fase of ['sin-bajar', 'bajando', 'preparando', 'bajado', 'falla', 'no-puede']) {
      expect(sePuedePreguntar({ fase }, con, { enResumen: true }), fase).toBe(true);
      expect(sePuedePreguntar({ fase }, {}, { enResumen: true }), fase).toBe(false);
      expect(sePuedePreguntar({ fase }, con, { enResumen: 'archivo' }), `${fase}, un PDF del campus`).toBe(false);
    }
    for (const fase of ['quieto', 'revisando', 'borrando']) expect(sePuedePreguntar({ fase }, con), fase).toBe(false);
    expect(sePuedePreguntar({ fase: 'listo' }, {}, { enResumen: 'archivo' })).toBe(true);
  });

  it('sin Gemini ni el modelo, dice por qué', async () => {
    const { permitirNube, porQueNoNube, preguntarNube, sinCompu } = await nube();
    expect(sinCompu('no-puede')).toMatch(/^Esta compu no puede correr Consultron\./);
    expect(sinCompu('sin-bajar')).toBe('Esto lo contesta Consultron en tu compu. Bajalo para preguntarle.');
    expect(sinCompu('preparando')).toBe('Consultron todavía se está preparando en tu compu.');
    permitirNube('resumenes', true);
    const responde = (cuerpo, status) => vi.fn(async () => new Response(JSON.stringify(cuerpo), { status }));
    const m = [{ role: 'user', content: 'x' }];
    await preguntarNube(m, 'resumenes', { pedir: responde({ ok: false, motivo: 'agotado' }, 429) });
    expect(porQueNoNube()).toBe('Gemini ya no contesta por hoy en todo el sitio. Probá mañana.');
    await preguntarNube(m, 'resumenes', { pedir: responde({ ok: false, motivo: 'ocupado' }, 503) });
    expect(porQueNoNube()).toBe('Gemini no contestó. Probá de nuevo en un rato.');
    await preguntarNube(m, 'resumenes', { pedir: vi.fn(async () => { throw new TypeError('Failed to fetch'); }) });
    expect(porQueNoNube()).toBe('Sin internet, Gemini no puede contestar.');
    await preguntarNube(m, 'resumenes', { pedir: responde({ ok: false, motivo: 'tope_alumno', quedan: 0 }, 429) });
    expect(porQueNoNube()).toBe('Por hoy no te quedan preguntas con Gemini.');
    expect(sinCompu('sin-bajar')).toBe('Por hoy no te quedan preguntas con Gemini. Esto lo contesta Consultron en tu compu. Bajalo para preguntarle.');
    expect(sinCompu('no-puede')).toBe('Por hoy no te quedan preguntas con Gemini.');
  });
});
