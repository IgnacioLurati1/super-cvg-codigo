// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const estado = vi.hoisted(() => ({ recordada: true, guardado: null, partes: null, ahorro: false, libre: true, token: 'clave' }));

vi.mock('./sesion', () => ({
  enCache: () => ({ id: 7 }),
  sesionRecordada: () => estado.recordada,
  tokenActual: () => estado.token,
}));
vi.mock('./sinInternet', () => ({
  archivoGuardado: vi.fn(async () => estado.guardado),
  partesGuardadas: vi.fn(async () => estado.partes),
  esFaltaDeConexion: (e) => e instanceof TypeError,
  guardarArchivoSinInternet: vi.fn(async () => {}),
  guardarPartesSinInternet: vi.fn(async () => {}),
  pedirQueSeQuede: () => {},
}));
vi.mock('./ahorro', () => ({ ahorrarDatos: () => estado.ahorro }));
vi.mock('./trabajador', () => ({ puedeBajarTodo: () => estado.libre }));

const { abrirPdf, seguirEnFondo, SIN_PARTES } = await import('./archivos');
const { CAMPUS } = await import('./moodle');
const { Partes, PARTES_DESDE, TROZO } = await import('./pdfPartes');
const { guardarArchivoSinInternet, guardarPartesSinInternet } = await import('./sinInternet');

const LARGO = PARTES_DESDE + 1000;
const bytes = Uint8Array.from({ length: LARGO }, (_, i) => i % 251);
const item = { direccion: `${CAMPUS}/webservice/pluginfile.php/1/mod_resource/content/1/a.pdf`, peso: LARGO, modificado: 100 };
const SELLO = `100:${LARGO}`;
const parte = (desde, hasta) => ({ desde, blob: new Blob([bytes.slice(desde, hasta)]) });

// The campus, honoring Range. Records the Range of each request (null: the whole file).
let rangos;
beforeEach(() => {
  Object.assign(estado, { recordada: true, guardado: null, partes: null, ahorro: false, libre: true });
  rangos = [];
  vi.mocked(guardarArchivoSinInternet).mockClear();
  vi.mocked(guardarPartesSinInternet).mockClear();
  vi.stubGlobal('fetch', vi.fn(async (url, opciones) => {
    const rango = opciones.headers?.Range ?? null;
    rangos.push(rango);
    if (!rango) return new Response(bytes, { status: 200, headers: { 'content-type': 'application/pdf' } });
    const [, a, b] = /^bytes=(\d+)-(\d*)$/.exec(rango);
    const hasta = b ? Math.min(Number(b), LARGO - 1) : LARGO - 1;
    return new Response(bytes.slice(Number(a), hasta + 1), { status: 206, headers: { 'content-type': 'application/pdf', 'content-range': `bytes ${a}-${hasta}/${LARGO}` } });
  }));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('abrirPdf', () => {
  it('a small file comes whole, as always', async () => {
    const r = await abrirPdf({ ...item, peso: 1000 });
    expect(r).toBeInstanceOf(Blob);
    expect(rangos).toEqual([null]);
  });

  it('a whole copy kept with the same version opens without asking the campus', async () => {
    const blob = new Blob([bytes]);
    estado.guardado = { blob, sello: SELLO };
    expect(await abrirPdf(item)).toBe(blob);
    expect(rangos).toEqual([]);
  });

  it('a big file comes by parts, keeps what was read and then the whole file in its place', async () => {
    vi.useFakeTimers();
    const partes = await abrirPdf(item);
    expect(partes).toBeInstanceOf(Partes);
    expect(rangos).toEqual([`bytes=0-${TROZO - 1}`]);
    await partes.rango(LARGO - 1000, LARGO);
    await vi.advanceTimersByTimeAsync(2000);
    const [direccion, sello, { largo, tramos }] = vi.mocked(guardarPartesSinInternet).mock.calls.at(-1);
    expect([direccion, sello, largo]).toEqual([item.direccion, SELLO, LARGO]);
    expect(tramos.map((t) => [t.desde, t.blob.size])).toEqual([[0, TROZO], [LARGO - 1000, 1000]]);
    await partes.completar();
    expect(guardarArchivoSinInternet).toHaveBeenCalledWith(item.direccion, SELLO, partes.blob, { token: 'clave', alumno: 7 });
  });

  it('parts kept of the same version are used first: only what is missing is asked', async () => {
    estado.partes = { sello: SELLO, largo: LARGO, tramos: [parte(0, TROZO), parte(TROZO * 4, TROZO * 6)] };
    const partes = await abrirPdf(item);
    expect([...(await partes.rango(TROZO * 4, TROZO * 5))]).toEqual([...bytes.slice(TROZO * 4, TROZO * 5)]);
    expect(rangos).toEqual([]);
    await partes.rango(TROZO * 5, TROZO * 7);
    expect(rangos).toEqual([`bytes=${TROZO * 6}-${TROZO * 7 - 1}`]);
  });

  it('parts kept of another version are left aside: the new one is kept in their place', async () => {
    vi.useFakeTimers();
    estado.partes = { sello: 'viejo', largo: LARGO, tramos: [parte(0, TROZO)] };
    const partes = await abrirPdf(item);
    expect(rangos).toEqual([`bytes=0-${TROZO - 1}`]);
    await vi.advanceTimersByTimeAsync(2000);
    expect(vi.mocked(guardarPartesSinInternet).mock.calls.at(-1)[1]).toBe(SELLO);
    partes.cerrar();
  });

  it('without internet, the parts kept of another version open as they are, and ask nothing', async () => {
    estado.partes = { sello: 'viejo', largo: LARGO, tramos: [parte(0, TROZO)] };
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const partes = await abrirPdf(item);
    expect([...(await partes.rango(0, 10))]).toEqual([...bytes.slice(0, 10)]);
    const falta = partes.mientrasHaya(partes.rango(TROZO, TROZO * 2), 10);
    await expect(falta).rejects.toThrow();
    expect(partes.sinRed).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(guardarPartesSinInternet).not.toHaveBeenCalled();
    partes.cerrar();
  });

  it('without «Seguir conectado» nothing is kept', async () => {
    vi.useFakeTimers();
    estado.recordada = false;
    const partes = await abrirPdf(item);
    await partes.rango(LARGO - 1000, LARGO);
    await vi.advanceTimersByTimeAsync(2000);
    await partes.completar();
    expect(guardarPartesSinInternet).not.toHaveBeenCalled();
    expect(guardarArchivoSinInternet).not.toHaveBeenCalled();
  });

  it('without internet, an older whole copy kept opens', async () => {
    const blob = new Blob([bytes]);
    estado.guardado = { blob, sello: 'viejo' };
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Failed to fetch'));
    expect(await abrirPdf(item)).toBe(blob);
  });

  it('anything else wrong with the first part brings the whole file', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('', { status: 416 }));
    const r = await abrirPdf(item);
    expect(r).toBeInstanceOf(Blob);
    expect(r.size).toBe(LARGO);
    expect(rangos).toEqual([null]);
  });

  it('soloPartes: when it cannot come by parts, nothing is downloaded whole', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(bytes, { status: 200 }));
    expect(await abrirPdf(item, { soloPartes: true })).toBe(SIN_PARTES);
    vi.mocked(fetch).mockResolvedValueOnce(new Response('', { status: 416 }));
    expect(await abrirPdf(item, { soloPartes: true })).toBe(SIN_PARTES);
    expect(await abrirPdf({ ...item, direccion: 'https://otro.example/a.pdf' }, { soloPartes: true })).toBe(SIN_PARTES);
    expect(vi.mocked(fetch).mock.calls.map(([, o]) => o.headers?.Range ?? null)).toEqual([`bytes=0-${TROZO - 1}`, `bytes=0-${TROZO - 1}`]);
  });

  it('soloPartes: by parts, or a whole copy kept, open as always', async () => {
    expect(await abrirPdf(item, { soloPartes: true })).toBeInstanceOf(Partes);
    const blob = new Blob([bytes]);
    estado.guardado = { blob, sello: SELLO };
    expect(await abrirPdf(item, { soloPartes: true })).toBe(blob);
  });
});

describe('seguirEnFondo', () => {
  const probar = async (cambios) => {
    Object.assign(estado, cambios);
    const partes = { completarEnReposo: vi.fn() };
    seguirEnFondo(partes);
    return partes.completarEnReposo.mock.calls.length;
  };

  it('finishes the file only when it may be kept and the connection is free', async () => {
    expect(await probar({})).toBe(1);
    expect(await probar({ recordada: false })).toBe(0);
    expect(await probar({ recordada: true, ahorro: true })).toBe(0);
    expect(await probar({ ahorro: false, libre: false })).toBe(0);
  });
});
