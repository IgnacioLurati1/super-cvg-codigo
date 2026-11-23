// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CAMPUS } from './moodle';
import { completarEnFondo, convieneEnPartes, empezarEnPartes, esSinDatos, faltaEn, leerRango, PARTES_DESDE, Partes, tramoCon, transportePara, unirTramos } from './pdfPartes';

const TROZO = 4;
const archivo = (largo = 20) => Uint8Array.from({ length: largo }, (_, i) => i + 1);
const aborto = () => new DOMException('Cerrado', 'AbortError');
const vacio = () => new Promise((ok) => setTimeout(ok, 0));
const sinConexion = () => new TypeError('Failed to fetch');

// A campus that honors Range like Moodle's byteserving: 206 with Content-Range, or 200 with the whole file.
// `responder(rango, n, senal)` may answer instead (a Response, an error to throw, or undefined to go on).
function campus(bytes, { entero = false, sinRango = false, responder = () => undefined } = {}) {
  const rangos = [];
  const pedir = vi.fn(async (rango, senal) => {
    rangos.push(rango);
    if (senal?.aborted) throw aborto();
    const propio = await responder(rango, rangos.length, senal);
    if (propio instanceof Error || propio instanceof DOMException) throw propio;
    if (propio) return propio;
    if (!rango || entero) return new Response(bytes, { status: 200, headers: { 'content-type': 'application/pdf' } });
    const [, a, b] = /^bytes=(\d+)-(\d*)$/.exec(rango);
    const desde = Number(a);
    const hasta = b ? Math.min(Number(b), bytes.length - 1) : bytes.length - 1;
    const headers = { 'content-type': 'application/pdf' };
    if (!sinRango) headers['content-range'] = `bytes ${desde}-${hasta}/${bytes.length}`;
    return new Response(bytes.slice(desde, hasta + 1), { status: 206, headers });
  });
  return { pedir, rangos };
}

const bytesDe = async (blob) => [...new Uint8Array(await blob.arrayBuffer())];
const blobDe = (bytes) => new Blob([bytes]);

afterEach(() => vi.useRealTimers());

describe('leerRango', () => {
  it('reads «bytes a-b/total» and nothing else', () => {
    expect(leerRango('bytes 0-65535/394264')).toEqual({ desde: 0, hasta: 65535, total: 394264 });
    for (const malo of [null, '', 'bytes 0-9/*', 'bytes */100', 'bytes 5-2/10', 'bytes 0-10/10', 'items 0-1/2']) expect(leerRango(malo)).toBeNull();
  });
});

describe('when parts are used', () => {
  const grande = { direccion: `${CAMPUS}/webservice/pluginfile.php/1/mod_resource/content/1/a.pdf`, peso: PARTES_DESDE + 1 };

  it('only for a big campus file, outside the sample mode', () => {
    expect(convieneEnPartes(grande)).toBe(true);
    expect(convieneEnPartes({ ...grande, peso: PARTES_DESDE })).toBe(false);
    expect(convieneEnPartes({ ...grande, peso: 0 })).toBe(false);
    expect(convieneEnPartes({ ...grande, peso: undefined })).toBe(false);
    expect(convieneEnPartes(grande, { demo: true })).toBe(false);
    expect(convieneEnPartes({ ...grande, traer: () => null })).toBe(false);
    expect(convieneEnPartes({ ...grande, direccion: 'https://drive.google.com/x.pdf' })).toBe(false);
  });

  it('finishes in the background only with «Seguir conectado», no data saver and a free connection', () => {
    expect(completarEnFondo({ recordada: true, ahorro: false, libre: true })).toBe(true);
    expect(completarEnFondo({ recordada: false, ahorro: false, libre: true })).toBe(false);
    expect(completarEnFondo({ recordada: true, ahorro: true, libre: true })).toBe(false);
    expect(completarEnFondo({ recordada: true, ahorro: false, libre: false })).toBe(false);
  });
});

describe('the bytes already here', () => {
  const t = (desde, largo) => ({ desde, blob: new Blob([Uint8Array.from({ length: largo }, (_, i) => desde + i)]) });

  it('overlapping or touching runs become one, in order', async () => {
    let lista = [];
    for (const x of [t(10, 5), t(0, 4), t(3, 3), t(6, 4)]) lista = unirTramos(lista, x);
    expect(lista).toHaveLength(1);
    expect(lista[0].desde).toBe(0);
    expect(await bytesDe(lista[0].blob)).toEqual(Array.from({ length: 15 }, (_, i) => i));
    lista = unirTramos(unirTramos(lista, t(2, 2)), t(20, 2));
    expect(lista.map((x) => [x.desde, x.blob.size])).toEqual([[0, 15], [20, 2]]);
  });

  it('knows what is here and the smallest piece missing', () => {
    const lista = unirTramos(unirTramos([], t(0, 4)), t(8, 4));
    expect(tramoCon(lista, 1, 4)?.desde).toBe(0);
    expect(tramoCon(lista, 2, 9)).toBeNull();
    expect(faltaEn(lista, 0, 12)).toEqual([4, 8]);
    expect(faltaEn(lista, 2, 10)).toEqual([4, 8]);
    expect(faltaEn(lista, 0, 16)).toEqual([4, 16]);
    expect(faltaEn(lista, 8, 12)).toBeNull();
  });

  it('kept parts are served first: only what is missing is asked', async () => {
    const bytes = archivo();
    const { pedir, rangos } = campus(bytes);
    const partes = new Partes({ pedir, largo: 20, tramos: [{ desde: 0, blob: blobDe(bytes.slice(0, 8)) }, { desde: 12, blob: blobDe(bytes.slice(12, 16)) }] });
    expect(partes.seguidos).toBe(8);
    expect([...(await partes.rango(12, 16))]).toEqual([13, 14, 15, 16]);
    expect(rangos).toEqual([]);
    expect([...(await partes.rango(4, 16))]).toEqual([...bytes.slice(4, 16)]);
    expect(rangos).toEqual(['bytes=8-11']);
    expect(partes.tramos().map((x) => [x.desde, x.blob.size])).toEqual([[0, 16]]);
    partes.cerrar();
  });

  it('kept parts with every byte are the whole file', async () => {
    const bytes = archivo();
    const partes = new Partes({ pedir: vi.fn(), largo: 20, tramos: [{ desde: 0, blob: blobDe(bytes) }] });
    expect(await bytesDe(partes.blob)).toEqual([...bytes]);
  });

  it('runs outside the file are dropped', () => {
    const partes = new Partes({ pedir: vi.fn(), largo: 20, tramos: [{ desde: 18, blob: blobDe(new Uint8Array(5)) }, { desde: -1, blob: blobDe(new Uint8Array(1)) }, { desde: 2, blob: 'x' }] });
    expect(partes.tramos()).toEqual([]);
    partes.cerrar();
  });
});

describe('empezarEnPartes', () => {
  it('a 206 starts by parts with the first one, and each part is asked for alone', async () => {
    const bytes = archivo();
    const { pedir, rangos } = campus(bytes);
    const { partes, blob } = await empezarEnPartes(pedir, { trozo: TROZO });
    expect(blob).toBeUndefined();
    expect(partes.largo).toBe(20);
    expect(partes.seguidos).toBe(4);
    expect([...(await partes.bytes(0, 4))]).toEqual([1, 2, 3, 4]);
    expect([...(await partes.rango(16, 20))]).toEqual([17, 18, 19, 20]);
    expect([...(await partes.rango(8, 12))]).toEqual([9, 10, 11, 12]);
    expect(rangos).toEqual(['bytes=0-3', 'bytes=16-19', 'bytes=8-11']);
    expect(partes.pedidos).toBe(3);
    expect(partes.blob).toBeNull();
  });

  it('a 200 is the whole file, used as it came and never asked again', async () => {
    const bytes = archivo();
    const { pedir, rangos } = campus(bytes, { entero: true });
    const r = await empezarEnPartes(pedir, { trozo: TROZO });
    expect(r.partes).toBeUndefined();
    expect(await bytesDe(r.blob)).toEqual([...bytes]);
    expect(rangos).toHaveLength(1);
  });

  it('a 206 without Content-Range brings the whole file once', async () => {
    const bytes = archivo();
    const { pedir, rangos } = campus(bytes, { sinRango: true });
    const r = await empezarEnPartes(pedir, { trozo: TROZO });
    expect(r.partes).toBeUndefined();
    expect(await bytesDe(r.blob)).toEqual([...bytes]);
    expect(rangos).toEqual(['bytes=0-3', null]);
  });

  it('a part that is the whole file is the file', async () => {
    const { pedir, rangos } = campus(archivo(3));
    const r = await empezarEnPartes(pedir, { trozo: TROZO });
    expect(await bytesDe(r.blob)).toEqual([1, 2, 3]);
    expect(rangos).toHaveLength(1);
  });

  it('a part that is not as long as it says is not used', async () => {
    const bytes = archivo();
    const raro = new Response(bytes.slice(0, 3), { status: 206, headers: { 'content-range': 'bytes 0-3/20' } });
    const { pedir, rangos } = campus(bytes, { responder: (r, n) => (n === 1 ? raro : undefined) });
    const r = await empezarEnPartes(pedir, { trozo: TROZO });
    expect(await bytesDe(r.blob)).toEqual([...bytes]);
    expect(rangos).toEqual(['bytes=0-3', null]);
  });

  it('soloPartes: a 200 is not downloaded, and nothing else is asked', async () => {
    const cancelar = vi.fn(async () => {});
    const entera = new Response(archivo(), { status: 200 });
    Object.defineProperty(entera, 'body', { value: { cancel: cancelar } });
    const { pedir, rangos } = campus(archivo(), { responder: () => entera });
    const r = await empezarEnPartes(pedir, { trozo: TROZO, soloPartes: true });
    expect(r).toMatchObject({ sinPartes: true });
    expect(r.blob).toBeUndefined();
    expect(cancelar).toHaveBeenCalled();
    expect(rangos).toEqual(['bytes=0-3']);
  });

  it('soloPartes: a part that cannot be placed does not bring the whole file', async () => {
    const { pedir, rangos } = campus(archivo(), { sinRango: true });
    expect(await empezarEnPartes(pedir, { trozo: TROZO, soloPartes: true })).toMatchObject({ sinPartes: true });
    const raro = new Response(archivo().slice(0, 3), { status: 206, headers: { 'content-range': 'bytes 0-3/20' } });
    const otro = campus(archivo(), { responder: () => raro });
    expect(await empezarEnPartes(otro.pedir, { trozo: TROZO, soloPartes: true })).toMatchObject({ sinPartes: true });
    expect([...rangos, ...otro.rangos]).toEqual(['bytes=0-3', 'bytes=0-3']);
  });

  it('soloPartes: a 206 starts by parts as always', async () => {
    const { pedir } = campus(archivo());
    const { partes } = await empezarEnPartes(pedir, { trozo: TROZO, soloPartes: true });
    expect(partes.largo).toBe(20);
  });
});

describe('Partes', () => {
  it('asks for two parts at a time, at most', async () => {
    let enCurso = 0;
    let maximo = 0;
    const { pedir } = campus(archivo(40), {
      responder: async (rango, n) => {
        if (n === 1) return undefined;
        enCurso += 1;
        maximo = Math.max(maximo, enCurso);
        await vacio();
        enCurso -= 1;
        return undefined;
      },
    });
    const { partes } = await empezarEnPartes(pedir, { trozo: TROZO });
    const todas = await Promise.all([4, 8, 12, 16, 20, 24].map((d) => partes.rango(d, d + 4)));
    expect(todas.map((b) => b[0])).toEqual([5, 9, 13, 17, 21, 25]);
    expect(maximo).toBe(2);
  });

  it('a part that fails for lack of connection waits, and comes when the connection does', async () => {
    const bytes = archivo();
    let red = false;
    const { pedir, rangos } = campus(bytes, { responder: (r) => (r === 'bytes=12-15' && !red ? sinConexion() : undefined) });
    const { partes } = await empezarEnPartes(pedir, { trozo: TROZO });
    const alCambiar = vi.fn();
    partes.escuchar({ alCambiar });
    let llego = null;
    partes.rango(12, 16).then((b) => (llego = [...b]));
    await vi.waitFor(() => expect(partes.sinRed).toBe(true));
    expect(llego).toBeNull();
    // A page that needs it stops waiting a moment later; one whose data is here goes on.
    await expect(partes.mientrasHaya(partes.rango(12, 16), 10)).rejects.toSatisfy(esSinDatos);
    expect([...(await partes.mientrasHaya(partes.rango(0, 4), 10))]).toEqual([1, 2, 3, 4]);
    red = true;
    partes.reintentar();
    await vi.waitFor(() => expect(llego).toEqual([13, 14, 15, 16]));
    expect(partes.sinRed).toBe(false);
    expect(alCambiar).toHaveBeenCalledTimes(2);
    expect(rangos).not.toContain('bytes=4-');
    expect(partes.estado).toBe('partes');
    partes.cerrar();
  });

  it('without connection it asks again by itself, a while later', async () => {
    vi.useFakeTimers();
    const bytes = archivo();
    let red = false;
    const { pedir } = campus(bytes, { responder: (r, n) => (n > 1 && !red ? sinConexion() : undefined) });
    const { partes } = await empezarEnPartes(pedir, { trozo: TROZO, reintentoMs: 1000 });
    const parte = partes.rango(8, 12);
    await vi.advanceTimersByTimeAsync(10);
    expect(partes.sinRed).toBe(true);
    red = true;
    await vi.advanceTimersByTimeAsync(1000);
    expect([...(await parte)]).toEqual([9, 10, 11, 12]);
    partes.cerrar();
  });

  it('a part that does not fit (another total) brings the rest in one request, and the reader keeps going', async () => {
    const bytes = archivo();
    const otra = new Response(bytes.slice(8, 12), { status: 206, headers: { 'content-range': 'bytes 8-11/99' } });
    const { pedir, rangos } = campus(bytes, { responder: (r) => (r === 'bytes=8-11' ? otra : undefined) });
    const { partes } = await empezarEnPartes(pedir, { trozo: TROZO });
    const leidos = [];
    const alTerminar = vi.fn();
    partes.escuchar({ alLeer: ({ desde, bytes: b }) => leidos.push([desde, ...b]), alTerminar });
    expect([...(await partes.rango(8, 12))]).toEqual([9, 10, 11, 12]);
    expect(rangos).toEqual(['bytes=0-3', 'bytes=8-11', 'bytes=4-']);
    // What pdf.js gets after the first part, in order and once.
    expect(leidos.flatMap(([, ...b]) => b)).toEqual([...bytes.slice(4)]);
    expect(leidos[0][0]).toBe(4);
    expect(await bytesDe(partes.blob)).toEqual([...bytes]);
    expect(alTerminar).toHaveBeenCalledTimes(1);
    // Then nothing more is asked.
    expect([...(await partes.rango(0, 4))]).toEqual([1, 2, 3, 4]);
    expect(rangos).toHaveLength(3);
  });

  it('a 200 to a part is the whole file: kept, never asked again', async () => {
    const bytes = archivo();
    const { pedir, rangos } = campus(bytes, { responder: (r) => (r === 'bytes=8-11' ? new Response(bytes, { status: 200 }) : undefined) });
    const { partes } = await empezarEnPartes(pedir, { trozo: TROZO });
    const alTerminar = vi.fn();
    partes.escuchar({ alTerminar });
    expect([...(await partes.rango(8, 12))]).toEqual([9, 10, 11, 12]);
    expect(alTerminar).toHaveBeenCalledTimes(1);
    expect(await bytesDe(partes.blob)).toEqual([...bytes]);
    await partes.rango(16, 20);
    expect(rangos).toEqual(['bytes=0-3', 'bytes=8-11']);
  });

  it('a part that does not fit and a rest that does not either: the file can not be shown, it says so once', async () => {
    const raro = () => new Response(new Uint8Array(4), { status: 206 });
    const { pedir } = campus(archivo(), { responder: (r, n) => (n > 1 ? raro() : undefined) });
    const { partes } = await empezarEnPartes(pedir, { trozo: TROZO });
    const alFallar = vi.fn();
    partes.escuchar({ alFallar });
    await expect(partes.rango(8, 12)).rejects.toThrow();
    expect(partes.estado).toBe('roto');
    expect(alFallar).toHaveBeenCalledTimes(1);
    await expect(partes.rango(12, 16)).rejects.toThrow();
  });

  it('a part that does not fit and no connection for the rest: it waits, nothing breaks', async () => {
    const raro = new Response(new Uint8Array(4), { status: 206 });
    const { pedir } = campus(archivo(), { responder: (r, n) => (n === 2 ? raro : n > 2 ? sinConexion() : undefined) });
    const { partes } = await empezarEnPartes(pedir, { trozo: TROZO });
    partes.rango(8, 12).catch(() => {});
    await vi.waitFor(() => expect(partes.sinRed).toBe(true));
    expect(partes.estado).toBe('partes');
    partes.cerrar();
  });

  it('a rest asked for by the reader that fails leaves the parts going, and keeps what came', async () => {
    const bytes = archivo();
    // The rest stops after 6 bytes.
    const cortado = () => {
      let vez = 0;
      const cuerpo = new ReadableStream({
        pull(c) {
          vez += 1;
          if (vez === 1) c.enqueue(bytes.slice(4, 10));
          else c.error(sinConexion());
        },
      });
      return new Response(cuerpo, { status: 206, headers: { 'content-range': 'bytes 4-19/20' } });
    };
    const { pedir, rangos } = campus(bytes, { responder: (r) => (r === 'bytes=4-' ? cortado() : undefined) });
    const { partes } = await empezarEnPartes(pedir, { trozo: TROZO });
    const alFallar = vi.fn();
    partes.escuchar({ alFallar });
    const resto = partes.completar();
    const parte = partes.rango(12, 16);
    await expect(resto).rejects.toThrow();
    expect([...(await parte)]).toEqual([13, 14, 15, 16]);
    expect(partes.seguidos).toBe(10);
    expect(partes.estado).toBe('partes');
    expect(alFallar).not.toHaveBeenCalled();
    expect(rangos).toEqual(['bytes=0-3', 'bytes=4-', 'bytes=12-15']);
    // The next rest starts where the bytes with no hole end.
    await partes.completar();
    expect(rangos.at(-1)).toBe('bytes=10-');
    expect(await bytesDe(partes.blob)).toEqual([...bytes]);
  });

  it('closing stops what is on the way and asks for nothing more', async () => {
    const senales = [];
    const { pedir, rangos } = campus(archivo(), {
      responder: (r, n, senal) => (n === 1 ? undefined : new Promise((_, mal) => {
        senales.push(senal);
        senal.addEventListener('abort', () => mal(aborto()));
      })),
    });
    const { partes } = await empezarEnPartes(pedir, { trozo: TROZO });
    const alCerrar = vi.fn();
    partes.escuchar({ alCerrar });
    const parte = partes.rango(8, 12);
    await vacio();
    partes.cerrar();
    await expect(parte).rejects.toMatchObject({ name: 'AbortError' });
    expect(senales[0].aborted).toBe(true);
    expect(alCerrar).toHaveBeenCalledTimes(1);
    await expect(partes.rango(12, 16)).rejects.toMatchObject({ name: 'AbortError' });
    await expect(partes.completar()).rejects.toMatchObject({ name: 'AbortError' });
    expect(rangos).toHaveLength(2);
  });

  it('the rest comes by itself only once no part was asked for a while', async () => {
    vi.useFakeTimers();
    const bytes = archivo();
    const { pedir, rangos } = campus(bytes);
    const partes = new Partes({ pedir, tramos: [{ desde: 0, blob: blobDe(bytes.slice(0, 4)) }], largo: 20, reposoMs: 1000 });
    partes.completarEnReposo();
    await vi.advanceTimersByTimeAsync(500);
    await partes.rango(16, 20);
    await vi.advanceTimersByTimeAsync(900);
    expect(rangos).toEqual(['bytes=16-19']);
    await vi.advanceTimersByTimeAsync(200);
    expect(rangos).toEqual(['bytes=16-19', 'bytes=4-']);
    await vi.waitFor(() => expect(partes.blob).not.toBeNull());
    expect(await bytesDe(partes.blob)).toEqual([...bytes]);
  });

  it('without completarEnReposo nothing comes by itself', async () => {
    vi.useFakeTimers();
    const bytes = archivo();
    const { pedir, rangos } = campus(bytes);
    const partes = new Partes({ pedir, tramos: [{ desde: 0, blob: blobDe(bytes.slice(0, 4)) }], largo: 20, reposoMs: 1000 });
    await partes.rango(16, 20);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(rangos).toEqual(['bytes=16-19']);
    partes.cerrar();
  });

  it('an older version kept never asks the campus: what is missing waits', async () => {
    const bytes = archivo();
    const pedir = vi.fn();
    const partes = new Partes({ pedir, largo: 20, tramos: [{ desde: 0, blob: blobDe(bytes.slice(0, 8)) }], soloLoGuardado: true });
    expect([...(await partes.rango(0, 8))]).toEqual([...bytes.slice(0, 8)]);
    partes.rango(8, 12).catch(() => {});
    await vi.waitFor(() => expect(partes.sinRed).toBe(true));
    partes.reintentar();
    await expect(partes.completar()).rejects.toThrow();
    expect(pedir).not.toHaveBeenCalled();
    partes.cerrar();
  });
});

describe('transportePara', () => {
  class Base {
    constructor(length, initialData, progressiveDone) {
      Object.assign(this, { length, initialData, progressiveDone });
      this.rangos = [];
      this.leidos = [];
      this.hecho = false;
    }
    onDataRange(begin, chunk) {
      this.rangos.push([begin, [...chunk]]);
    }
    onDataProgressiveRead(chunk) {
      this.leidos.push(...chunk);
    }
    onDataProgressiveDone() {
      this.hecho = true;
    }
  }

  it('answers what pdf.js asks and passes on the rest when it comes', async () => {
    const bytes = archivo();
    const { pedir } = campus(bytes);
    const { partes } = await empezarEnPartes(pedir, { trozo: TROZO });
    const t = await transportePara(Base, partes);
    expect(t.length).toBe(20);
    expect([...t.initialData]).toEqual([1, 2, 3, 4]);
    t.requestDataRange(16, 20);
    await vi.waitFor(() => expect(t.rangos).toEqual([[16, [17, 18, 19, 20]]]));
    await partes.completar();
    await vi.waitFor(() => expect(t.hecho).toBe(true));
    expect(t.leidos).toEqual([...bytes.slice(4)]);
  });

  it('a file that ends with parts (not the rest) still gives pdf.js everything it lacks', async () => {
    const bytes = archivo();
    const { pedir } = campus(bytes);
    const partes = new Partes({ pedir, largo: 20, tramos: [{ desde: 0, blob: blobDe(bytes.slice(0, 4)) }, { desde: 8, blob: blobDe(bytes.slice(8)) }] });
    const t = await transportePara(Base, partes);
    await partes.rango(4, 8);
    await vi.waitFor(() => expect(t.hecho).toBe(true));
    expect(t.leidos).toEqual([...bytes.slice(4)]);
  });

  it('after abort, nothing reaches pdf.js and the parts keep going for the sheet', async () => {
    const bytes = archivo();
    const { pedir } = campus(bytes);
    const { partes } = await empezarEnPartes(pedir, { trozo: TROZO });
    const t = await transportePara(Base, partes);
    t.requestDataRange(16, 20);
    t.abort();
    await partes.completar();
    await vacio();
    expect(t.rangos).toEqual([]);
    expect(t.leidos).toEqual([]);
    expect(partes.estado).toBe('completo');
  });
});
