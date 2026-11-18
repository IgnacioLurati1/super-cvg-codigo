import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cargarVoces, crearLectura, elegirVoz, normalizarVelocidad, partirTexto, siguienteVelocidad, textoVelocidad, TRAMO_MAX, VELOCIDADES } from './voz';

const voz = (name, lang, localService = true, extra = {}) => ({ name, lang, localService, default: false, ...extra });

describe('elegir la voz', () => {
  it('solo una del dispositivo, en castellano, la de Argentina primero', () => {
    const voces = [
      voz('Google español', 'es-ES', false, { default: true }),
      voz('Google español de Estados Unidos', 'es-US', false),
      voz('Remota de acá', 'es-AR', false),
      voz('Mónica', 'es-ES'),
      voz('Paulina', 'es-MX'),
      voz('Diego', 'es_AR'),
      voz('Samantha', 'en-US', true, { default: true }),
    ];
    expect(elegirVoz(voces).name).toBe('Diego');
    expect(elegirVoz(voces.filter((v) => v.name !== 'Diego')).name).toBe('Paulina');
    expect(elegirVoz([voz('Mónica', 'es-ES'), voz('Sin región', 'es')]).name).toBe('Sin región');
  });

  it('sin una local en castellano no hay voz, aunque haya remotas o en otro idioma', () => {
    expect(elegirVoz([voz('Google español', 'es-ES', false), voz('Remota', 'es-AR', 'true'), voz('Samantha', 'en-US'), voz('Estonia', 'et-EE')])).toBeNull();
    expect(elegirVoz([])).toBeNull();
    expect(elegirVoz(undefined)).toBeNull();
    expect(elegirVoz([null, { name: 'Sin idioma', localService: true }])).toBeNull();
  });

  it('entre dos del mismo lugar, la que el dispositivo tiene de entrada', () => {
    expect(elegirVoz([voz('Una', 'es-MX'), voz('Otra', 'es-MX', true, { default: true })]).name).toBe('Otra');
  });
});

describe('la velocidad', () => {
  it('queda en uno de los pasos, el más cercano, y lo raro vuelve a 1', () => {
    expect(normalizarVelocidad(1.25)).toBe(1.25);
    expect(normalizarVelocidad(1.3)).toBe(1.25);
    expect(normalizarVelocidad(9)).toBe(2);
    expect(normalizarVelocidad(0.1)).toBe(0.75);
    for (const raro of [null, undefined, '1.5', NaN, Infinity, {}]) expect(normalizarVelocidad(raro)).toBe(1);
  });

  it('el botón pasa por todas y vuelve a la primera', () => {
    const vistas = [];
    let v = 1;
    for (let i = 0; i < VELOCIDADES.length; i++) vistas.push((v = siguienteVelocidad(v)));
    expect(vistas).toEqual([1.25, 1.5, 1.75, 2, 0.75, 1]);
    expect(textoVelocidad(1.25)).toBe('1,25×');
    expect(textoVelocidad(1)).toBe('1×');
  });
});

describe('partir el texto', () => {
  it('por oraciones, sin cortar decimales ni juntar el título con lo que sigue', () => {
    expect(partirTexto('Semáforos\nUn semáforo cuida la sección crítica. Vale 3.5 puntos.\n¿Y después? Sigue.')).toEqual([
      'Semáforos', 'Un semáforo cuida la sección crítica.', 'Vale 3.5 puntos.', '¿Y después?', 'Sigue.',
    ]);
  });

  it('une los renglones de un párrafo y las palabras cortadas con guion', () => {
    expect(partirTexto('El sistema operativo guarda la infor-\nmación en una estructura que se\nllama bloque de control.')).toEqual([
      'El sistema operativo guarda la información en una estructura que se llama bloque de control.',
    ]);
  });

  it('una oración larga se corta donde pausa, sin pasarse del tope', () => {
    const larga = `${'palabra '.repeat(20).trim()}, ${'otra '.repeat(30).trim()}; ${'más '.repeat(40).trim()}.`;
    const tramos = partirTexto(larga);
    expect(tramos.length).toBeGreaterThan(1);
    for (const t of tramos) expect(t.length).toBeLessThanOrEqual(TRAMO_MAX);
    expect(tramos.join(' ').replace(/\s+/g, ' ')).toBe(larga);
    expect(partirTexto('x'.repeat(450), 200).map((t) => t.length)).toEqual([200, 200, 50]);
  });

  it('nada para leer da una lista vacía', () => {
    expect(partirTexto('')).toEqual([]);
    expect(partirTexto(null)).toEqual([]);
    expect(partirTexto(' \n • \n — ')).toEqual([]);
  });
});

// A speechSynthesis that says nothing: each utterance ends only when the test says so.
function sintetizador() {
  const dichos = [];
  let actual = null;
  const s = {
    dichos,
    cancelado: 0,
    speak(u) {
      dichos.push(u);
      actual = u;
    },
    cancel() {
      s.cancelado++;
      const u = actual;
      actual = null;
      // Like Chrome: the cut utterance says so, later.
      if (u) queueMicrotask(() => u.onerror?.({ error: 'interrupted' }));
    },
    terminar() {
      const u = actual;
      actual = null;
      u.onend?.();
    },
    get actual() {
      return actual;
    },
  };
  return s;
}

const decir = (texto, velocidad) => ({ texto, velocidad, onend: null, onerror: null });
const esperar = () => new Promise((r) => setTimeout(r, 0));

function armar(bloques, extra = {}) {
  const synth = sintetizador();
  const cambios = [];
  const cola = [...bloques];
  const lectura = crearLectura({ synth, decir, siguiente: async () => cola.shift() ?? null, alCambiar: (c) => cambios.push(c), demora: 0, ...extra });
  return { synth, cambios, lectura };
}

describe('la lectura', () => {
  beforeEach(() => vi.useRealTimers());
  afterEach(() => vi.useRealTimers());

  it('dice cada tramo de cada página en orden, salta las vacías y termina', async () => {
    const { synth, cambios, lectura } = armar([{ pagina: 2, tramos: ['Uno.', 'Dos.'] }, { pagina: 3, tramos: [] }, { pagina: 4, tramos: ['Tres.'] }]);
    lectura.empezar();
    await esperar();
    expect(synth.actual.texto).toBe('Uno.');
    synth.terminar();
    await esperar();
    expect(synth.actual.texto).toBe('Dos.');
    synth.terminar();
    await esperar();
    expect(synth.actual.texto).toBe('Tres.');
    synth.terminar();
    await esperar();
    expect(synth.dichos.map((d) => d.texto)).toEqual(['Uno.', 'Dos.', 'Tres.']);
    expect(lectura.estado).toBeNull();
    expect(cambios.map((c) => `${c.estado}:${c.pagina}`)).toEqual(['leyendo:null', 'leyendo:2', 'leyendo:4', 'null:4']);
    expect(cambios.at(-1).terminada).toBe(true);
  });

  it('si no se le puede poner la voz, no dice nada', async () => {
    const { synth, cambios, lectura } = armar([{ pagina: 1, tramos: ['Uno.'] }], { decir: () => { throw new TypeError('voice'); } });
    lectura.empezar();
    await esperar();
    expect(synth.dichos).toEqual([]);
    expect(cambios.at(-1)).toMatchObject({ estado: null, error: 'voz' });
  });

  it('pausar calla y seguir vuelve a decir el mismo tramo; parar termina', async () => {
    const { synth, lectura } = armar([{ pagina: 1, tramos: ['Uno.', 'Dos.'] }]);
    lectura.empezar();
    await esperar();
    synth.terminar();
    await esperar();
    lectura.pausar();
    await esperar();
    expect(lectura.estado).toBe('pausa');
    expect(synth.actual).toBeNull();
    expect(synth.dichos.length).toBe(2);
    lectura.seguir();
    await new Promise((r) => setTimeout(r, 5));
    expect(lectura.estado).toBe('leyendo');
    expect(synth.actual.texto).toBe('Dos.');
    lectura.parar();
    await esperar();
    expect(lectura.estado).toBeNull();
    expect(synth.actual).toBeNull();
    expect(synth.dichos.map((d) => d.texto)).toEqual(['Uno.', 'Dos.', 'Dos.']);
  });

  it('la velocidad nueva entra con el tramo que se está diciendo', async () => {
    const { synth, lectura } = armar([{ pagina: 1, tramos: ['Uno.'] }], { velocidad: 1 });
    lectura.empezar();
    await esperar();
    expect(synth.actual.velocidad).toBe(1);
    lectura.velocidad(1.5);
    await new Promise((r) => setTimeout(r, 5));
    expect(synth.actual).toMatchObject({ texto: 'Uno.', velocidad: 1.5 });
  });

  it('una pausa mientras llega la página siguiente no se la saltea', async () => {
    let soltar;
    const cola = [{ pagina: 1, tramos: ['Uno.'] }, new Promise((r) => { soltar = r; }), { pagina: 3, tramos: ['Tres.'] }];
    const synth = sintetizador();
    const lectura = crearLectura({ synth, decir, siguiente: () => cola.shift() ?? null, demora: 0 });
    lectura.empezar();
    await esperar();
    synth.terminar();
    lectura.pausar();
    lectura.seguir();
    soltar({ pagina: 2, tramos: ['Dos.'] });
    await new Promise((r) => setTimeout(r, 5));
    expect(synth.actual.texto).toBe('Dos.');
  });

  it('cortada por otra cosa queda en pausa; un error de la voz termina y lo dice', async () => {
    const { synth, cambios, lectura } = armar([{ pagina: 1, tramos: ['Uno.', 'Dos.'] }]);
    lectura.empezar();
    await esperar();
    synth.actual.onerror({ error: 'interrupted' });
    expect(lectura.estado).toBe('pausa');
    lectura.seguir();
    await new Promise((r) => setTimeout(r, 5));
    synth.actual.onerror({ error: 'synthesis-failed' });
    expect(lectura.estado).toBeNull();
    expect(cambios.at(-1)).toMatchObject({ estado: null, error: 'synthesis-failed' });
  });
});

describe('las voces', () => {
  it('espera a que Chrome las tenga, y no más de lo que se le dice', async () => {
    let voces = [];
    const oyentes = new Set();
    const synth = { getVoices: () => voces, addEventListener: (_, f) => oyentes.add(f), removeEventListener: (_, f) => oyentes.delete(f) };
    const promesa = cargarVoces(synth, 1000);
    voces = [voz('Diego', 'es-AR')];
    oyentes.forEach((f) => f());
    expect((await promesa).map((v) => v.name)).toEqual(['Diego']);
    expect(oyentes.size).toBe(0);
    voces = [];
    expect(await cargarVoces(synth, 5)).toEqual([]);
  });
});
