import { describe, expect, it, vi } from 'vitest';
import {
  ABANDONADO_MS, aplicar, borrarPorMandar, crearFila, despuesDelFallo, DISCO, DUDA, ESPERA, FALLO, filaDe, guardadoEnMemoria, MEMORIA,
  SALIENDO,
} from './porMandar';

// A lock shared by the tabs of one test, like navigator.locks: one at a time, in order.
function cerrojoCompartido() {
  let cola = Promise.resolve();
  return (fn) => {
    const turno = cola.then(() => fn(true));
    cola = turno.catch(() => {});
    return turno;
  };
}

const respuesta = (id) => ({ id, de: 9, texto: 'Hola' });
const deLaRed = () => Object.assign(new TypeError('Failed to fetch'), { sinVerificar: true });
const noDelCampus = () => Object.assign(new Error('El campus no dejó mandarlo.'), { codigo: 'rechazado' });
const sinRespuestaClara = () => Object.assign(new Error('El campus no pudo responder.'), { codigo: 'http_502', sinVerificar: true });

// One tab: its session, its network and what the campus does, with the store and the lock it shares with others.
function pestana({ token = 'clave-a', recordada = false, guardado = guardadoEnMemoria(), cerrojo = cerrojoCompartido(), red = { hay: true }, enviar, buscar, ahora } = {}) {
  const sesion = { token, recordada };
  const tab = {
    sesion,
    red,
    enviar: enviar ?? vi.fn(async () => respuesta(77)),
    buscar: buscar ?? vi.fn(async () => null),
    eventos: [],
  };
  tab.fila = crearFila({
    sesion: () => sesion,
    enviar: (x) => tab.enviar(x),
    buscar: (x) => tab.buscar(x),
    memoria: guardado,
    disco: guardado,
    cerrojo,
    enLinea: () => red.hay,
    huella: async (t) => (t ? `huella-${t}` : null),
    ...(ahora && { ahora }),
  });
  tab.fila.escuchar((e) => tab.eventos.push(e));
  return tab;
}

const mensaje = { destino: { conversacionId: 501 }, nombre: 'Laura Méndez', texto: 'Hola', despuesDe: 40, alumno: 9 };

describe('the queue of messages', () => {
  it('sends a tapped message once, and nothing is left waiting', async () => {
    const a = pestana();
    await a.fila.encolar(mensaje);
    await a.fila.procesar();
    await a.fila.procesar();
    expect(a.enviar).toHaveBeenCalledTimes(1);
    expect(a.enviar.mock.calls[0][0]).toMatchObject({ destino: { conversacionId: 501 }, texto: 'Hola', despuesDe: 40 });
    expect(a.fila.actuales()).toEqual([]);
    expect(a.eventos).toEqual([expect.objectContaining({ tipo: 'salio', resultado: respuesta(77), item: expect.objectContaining({ espero: false }) })]);
  });

  it('without signal it waits as «Por mandar», and goes once when the network comes back', async () => {
    const a = pestana({ red: { hay: false } });
    await a.fila.encolar(mensaje);
    await a.fila.procesar();
    expect(a.enviar).not.toHaveBeenCalled();
    expect(a.fila.actuales()).toMatchObject([{ estado: ESPERA, texto: 'Hola', espero: true }]);
    a.red.hay = true;
    await a.fila.procesar();
    await a.fila.procesar();
    expect(a.enviar).toHaveBeenCalledTimes(1);
    expect(a.fila.actuales()).toEqual([]);
    // It waited: the news goes everywhere.
    expect(a.eventos.at(-1)).toMatchObject({ tipo: 'salio', item: { espero: true, nombre: 'Laura Méndez' } });
  });

  it('can be cancelled before it goes, and then never goes', async () => {
    const a = pestana({ red: { hay: false } });
    const { id } = await a.fila.encolar(mensaje);
    expect(await a.fila.cancelar(id)).toMatchObject({ texto: 'Hola' });
    a.red.hay = true;
    await a.fila.procesar();
    expect(a.enviar).not.toHaveBeenCalled();
    expect(a.fila.actuales()).toEqual([]);
  });

  it('does not cancel one already going out', async () => {
    let soltar;
    const a = pestana({ enviar: vi.fn(() => new Promise((ok) => (soltar = ok))) });
    const { id } = await a.fila.encolar(mensaje);
    await vi.waitFor(() => expect(a.enviar).toHaveBeenCalled());
    expect(a.fila.actuales()).toMatchObject([{ estado: SALIENDO }]);
    expect(await a.fila.cancelar(id)).toBeNull();
    soltar(respuesta(80));
    await a.fila.procesar();
    expect(a.fila.actuales()).toEqual([]);
  });

  it('shows a clear no from the campus and never sends it again on its own', async () => {
    const a = pestana({ enviar: vi.fn(async () => { throw noDelCampus(); }) });
    const { id } = await a.fila.encolar(mensaje);
    await a.fila.procesar();
    await a.fila.procesar();
    expect(a.enviar).toHaveBeenCalledTimes(1);
    expect(a.fila.actuales()).toMatchObject([{ estado: FALLO, error: 'El campus no dejó mandarlo.', codigo: 'rechazado' }]);
    expect(a.buscar).not.toHaveBeenCalled();
    // Probar de nuevo is one more tap: one more send.
    a.enviar.mockResolvedValueOnce(respuesta(81));
    await a.fila.reintentar(id);
    expect(a.enviar).toHaveBeenCalledTimes(2);
    expect(a.fila.actuales()).toEqual([]);
  });

  it('with no clear answer and no way to look, it says «No sabemos si salió» and waits for the student', async () => {
    const a = pestana({ enviar: vi.fn(async () => { throw sinRespuestaClara(); }) });
    const { id } = await a.fila.encolar(mensaje);
    await a.fila.procesar();
    a.red.hay = true;
    await a.fila.procesar();
    expect(a.enviar).toHaveBeenCalledTimes(1);
    expect(a.fila.actuales()).toMatchObject([{ estado: DUDA, tocado: true }]);
    // Reintentar looks first: it was there, so nothing is sent.
    a.buscar.mockResolvedValueOnce(respuesta(82));
    await a.fila.reintentar(id);
    expect(a.buscar).toHaveBeenCalledTimes(1);
    expect(a.enviar).toHaveBeenCalledTimes(1);
    expect(a.fila.actuales()).toEqual([]);
    expect(a.eventos.at(-1)).toMatchObject({ tipo: 'salio', resultado: respuesta(82) });
  });

  it('a send cut by the network waits, and is looked up before it goes again', async () => {
    const a = pestana({ enviar: vi.fn(async () => { throw deLaRed(); }) });
    await a.fila.encolar(mensaje);
    await a.fila.procesar();
    expect(a.fila.actuales()).toMatchObject([{ estado: ESPERA, tocado: true, espero: true }]);
    // Still no network: the look fails and nothing is sent.
    a.buscar.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await a.fila.procesar();
    expect(a.enviar).toHaveBeenCalledTimes(1);
    expect(a.fila.actuales()).toMatchObject([{ estado: ESPERA }]);
    // Back: it had got there, so it is not sent twice.
    a.buscar.mockResolvedValueOnce(respuesta(83));
    await a.fila.procesar();
    expect(a.enviar).toHaveBeenCalledTimes(1);
    expect(a.fila.actuales()).toEqual([]);
  });

  it('a send cut by the network that did not get there goes once more', async () => {
    const a = pestana({ enviar: vi.fn(async () => { throw deLaRed(); }) });
    await a.fila.encolar(mensaje);
    await a.fila.procesar();
    a.enviar.mockResolvedValueOnce(respuesta(84));
    await a.fila.procesar();
    expect(a.buscar).toHaveBeenCalledTimes(1);
    expect(a.enviar).toHaveBeenCalledTimes(2);
    expect(a.fila.actuales()).toEqual([]);
  });

  it('a look that fails with an answer of the campus leaves it in doubt', async () => {
    const a = pestana({ enviar: vi.fn(async () => { throw deLaRed(); }) });
    await a.fila.encolar(mensaje);
    await a.fila.procesar();
    a.buscar.mockRejectedValueOnce(Object.assign(new Error('Tu sesión venció.'), { codigo: 'sesion' }));
    await a.fila.procesar();
    expect(a.enviar).toHaveBeenCalledTimes(1);
    expect(a.fila.actuales()).toMatchObject([{ estado: DUDA }]);
  });

  it('goes in order, and without signal the rest waits too', async () => {
    const a = pestana({ red: { hay: false } });
    await a.fila.encolar(mensaje);
    await a.fila.encolar({ ...mensaje, texto: 'Segundo' });
    a.red.hay = true;
    a.enviar.mockRejectedValueOnce(deLaRed());
    await a.fila.procesar();
    expect(a.enviar).toHaveBeenCalledTimes(1);
    expect(a.fila.actuales().map((x) => x.estado)).toEqual([ESPERA, ESPERA]);
    await a.fila.procesar();
    expect(a.enviar.mock.calls.map(([x]) => x.texto)).toEqual(['Hola', 'Hola', 'Segundo']);
    expect(a.fila.actuales()).toEqual([]);
  });

  it('two tabs of the session never send the same message, with the lock', async () => {
    const guardado = guardadoEnMemoria();
    const cerrojo = cerrojoCompartido();
    const enviar = vi.fn(async () => {
      await new Promise((ok) => setTimeout(ok, 5));
      return respuesta(85);
    });
    const a = pestana({ guardado, cerrojo, enviar, red: { hay: false } });
    const b = pestana({ guardado, cerrojo, enviar, red: { hay: false } });
    await a.fila.encolar(mensaje);
    await b.fila.refrescar();
    expect(b.fila.actuales()).toHaveLength(1);
    a.red.hay = true;
    b.red.hay = true;
    await Promise.all([a.fila.procesar(), b.fila.procesar(), a.fila.procesar(), b.fila.procesar()]);
    expect(enviar).toHaveBeenCalledTimes(1);
    await b.fila.refrescar();
    expect(b.fila.actuales()).toEqual([]);
  });

  it('two tabs never send the same message without the lock either: the claim is one change of the store', async () => {
    const guardado = guardadoEnMemoria();
    const sinCerrojo = (fn) => fn(false);
    const enviar = vi.fn(async () => {
      await new Promise((ok) => setTimeout(ok, 5));
      return respuesta(86);
    });
    const a = pestana({ guardado, cerrojo: sinCerrojo, enviar, red: { hay: false } });
    const b = pestana({ guardado, cerrojo: sinCerrojo, enviar });
    await a.fila.encolar(mensaje);
    a.red.hay = true;
    await Promise.all([a.fila.procesar(), b.fila.procesar()]);
    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it('a message whose tab closed while it went out is looked up before another tab sends it', async () => {
    const guardado = guardadoEnMemoria();
    const huella = 'huella-clave-a';
    await guardado.cambiar({ huella, alumno: 9 }, () => [{
      id: 'x1', destino: { conversacionId: 501 }, nombre: 'Laura', texto: 'Hola', cuando: 1, estado: SALIENDO, tab: 'otra', desde: 1,
    }]);
    // With the lock, a message marked as going out while nobody holds it has no tab behind it.
    const b = pestana({ guardado, buscar: vi.fn(async () => respuesta(87)) });
    await b.fila.procesar();
    expect(b.buscar).toHaveBeenCalledTimes(1);
    expect(b.enviar).not.toHaveBeenCalled();
    expect(b.fila.actuales()).toEqual([]);
  });

  it('without the lock, another tab waits ABANDONADO_MS before taking a message that was going out', async () => {
    const guardado = guardadoEnMemoria();
    let ahora = 1_000;
    await guardado.cambiar({ huella: 'huella-clave-a', alumno: 9 }, () => [{
      id: 'x2', destino: { conversacionId: 501 }, texto: 'Hola', cuando: 1, estado: SALIENDO, tab: 'otra', desde: ahora,
    }]);
    const b = pestana({ guardado, cerrojo: (fn) => fn(false), ahora: () => ahora });
    await b.fila.procesar();
    expect(b.buscar).not.toHaveBeenCalled();
    expect(b.enviar).not.toHaveBeenCalled();
    ahora += ABANDONADO_MS + 1;
    await b.fila.procesar();
    expect(b.buscar).toHaveBeenCalledTimes(1);
    expect(b.enviar).toHaveBeenCalledTimes(1);
  });

  it('another student, or another key, never reads it', async () => {
    const guardado = guardadoEnMemoria();
    const a = pestana({ guardado, red: { hay: false } });
    await a.fila.encolar(mensaje);
    const otraClave = pestana({ guardado, token: 'clave-b', red: { hay: false } });
    await otraClave.fila.refrescar();
    expect(otraClave.fila.actuales()).toEqual([]);
    expect(await otraClave.fila.cancelar(a.fila.actuales()[0].id)).toBeNull();
    // Another student writing takes the store over empty: what waited for the first one goes.
    await otraClave.fila.encolar({ ...mensaje, texto: 'Otro', alumno: 12 });
    await a.fila.refrescar();
    expect(a.fila.actuales()).toEqual([]);
    expect(otraClave.fila.actuales().map((x) => x.texto)).toEqual(['Otro']);
  });

  it('Salir deletes what waits, in the tab and in the database, and nothing comes back from a send on its way', async () => {
    const sesion = { token: 'clave-a', recordada: true };
    let soltar;
    const enviar = vi.fn(() => new Promise((ok, mal) => (soltar = mal)));
    const red = { hay: false };
    const fila = crearFila({ sesion: () => sesion, enviar, buscar: async () => null, enLinea: () => red.hay, huella: async (t) => `huella-${t}` });
    await fila.encolar(mensaje);
    sesion.recordada = false;
    await fila.encolar({ ...mensaje, texto: 'En la pestaña' });
    sesion.recordada = true;
    await fila.encolar({ ...mensaje, texto: 'Se está yendo' });
    red.hay = true;
    const yendo = fila.procesar();
    await vi.waitFor(() => expect(enviar).toHaveBeenCalled());
    await borrarPorMandar();
    sesion.token = null;
    soltar(deLaRed());
    await yendo;
    expect(fila.actuales()).toEqual([]);
    expect(await DISCO.leer('huella-clave-a')).toEqual([]);
    expect(await MEMORIA.leer('huella-clave-a')).toEqual([]);
    sesion.token = 'clave-a';
    await fila.refrescar();
    expect(fila.actuales()).toEqual([]);
  });

  it('a message on its way in another tab shows its news here too, and only for one this tab had', async () => {
    const guardado = guardadoEnMemoria();
    const a = pestana({ guardado, red: { hay: false } });
    const b = pestana({ guardado, red: { hay: false } });
    const item = await a.fila.encolar(mensaje);
    await b.fila.refrescar();
    a.red.hay = true;
    await a.fila.procesar();
    const evento = a.eventos.at(-1);
    await b.fila.deOtraPestana(evento);
    expect(b.eventos).toEqual([expect.objectContaining({ tipo: 'salio', item: expect.objectContaining({ id: item.id }) })]);
    await b.fila.deOtraPestana(evento);
    expect(b.eventos).toHaveLength(1);
  });
});

describe('whose the queue is', () => {
  const uno = { id: 'a', destino: { conversacionId: 5 }, texto: 'Hola', cuando: 1, estado: ESPERA };

  it('reads only with the fingerprint of the owner, and drops what is not a message waiting', () => {
    const registro = { dueno: { alumno: 9, huella: 'h1' }, fila: [uno, { id: 'b', texto: '' }, { ...uno, id: 'c', destino: { conversacionId: -1 } }, null] };
    expect(filaDe(registro, 'h1').map((x) => x.id)).toEqual(['a']);
    expect(filaDe(registro, 'h2')).toEqual([]);
    expect(filaDe(null, 'h1')).toEqual([]);
  });

  it('changes only for the owner; another key takes it over empty, and only saying whose', () => {
    const registro = { dueno: { alumno: 9, huella: 'h1' }, fila: [uno] };
    expect(aplicar(registro, { huella: 'h1' }, (f) => [...f, { ...uno, id: 'b' }]).fila.map((x) => x.id)).toEqual(['a', 'b']);
    expect(aplicar(registro, { huella: 'h2' }, (f) => [...f, { ...uno, id: 'b' }])).toBeNull();
    expect(aplicar(registro, { huella: 'h2', alumno: 12 }, (f) => [...f, { ...uno, id: 'b' }])).toEqual({ dueno: { alumno: 12, huella: 'h2' }, fila: [expect.objectContaining({ id: 'b' })] });
    expect(aplicar(registro, {}, () => [])).toBeNull();
  });
});

describe('despuesDelFallo', () => {
  it('waits for the network, doubts a lost answer, and shows a clear no', () => {
    expect(despuesDelFallo(deLaRed(), true)).toBe(ESPERA);
    expect(despuesDelFallo(Object.assign(new Error('x'), { codigo: 'http_502', sinVerificar: true }), false)).toBe(ESPERA);
    expect(despuesDelFallo(sinRespuestaClara(), true)).toBe(DUDA);
    expect(despuesDelFallo(noDelCampus(), true)).toBe(FALLO);
    // Looked up and not there: it didn't go, as today.
    expect(despuesDelFallo(new TypeError('Failed to fetch'), true)).toBe(FALLO);
  });
});
