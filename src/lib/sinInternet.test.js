import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// The database is mocked: what is tested here is when conCache and traerArchivo keep, and what they show without network.
const disco = vi.hoisted(() => ({ respuestas: new Map(), archivos: new Map() }));
vi.mock('./sinInternet', async (original) => {
  const real = await original();
  return {
    ...real,
    recordar: vi.fn(async (nombre, datos, { token, alumno, cuando }) => {
      if (real.esGuardable(nombre) && token && alumno) disco.respuestas.set(nombre, { cuando, datos, token, alumno });
    }),
    recuperarTodas: vi.fn(async (token) => [...disco.respuestas].filter(([, r]) => r.token === token).map(([n, r]) => [n, { cuando: r.cuando, datos: r.datos }])),
    recuperar: vi.fn(async (nombre, token) => {
      const r = disco.respuestas.get(nombre);
      return r && r.token === token ? { cuando: r.cuando, datos: r.datos } : null;
    }),
    archivoGuardado: vi.fn(async (direccion, token) => {
      const r = disco.archivos.get(direccion);
      return r && r.token === token ? { blob: r.blob, sello: r.sello } : null;
    }),
    guardarArchivoSinInternet: vi.fn(async (direccion, sello, blob, { token, alumno }) => {
      if (token && alumno) disco.archivos.set(direccion, { sello, blob, token });
    }),
    borrarSinInternet: vi.fn(async () => {
      disco.respuestas.clear();
      disco.archivos.clear();
    }),
  };
});
vi.mock('./moodle', async (original) => ({ ...(await original()), bajarArchivo: vi.fn() }));

const { cerrarSesion, conCache, desdeLoGuardado, iniciarSesion, vaciarCache } = await import('./sesion');
const { esFaltaDeConexion, esGuardable, recordar, recuperarTodas, useSinInternet } = await import('./sinInternet');
const { traerArchivo } = await import('./archivos');
const { bajarArchivo, ErrorCampus } = await import('./moodle');

const sinRed = () => Promise.reject(new TypeError('Failed to fetch'));
const perfil = () => conCache('perfil', 60, async () => ({ id: 7, nombre: 'Ana' }));

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  disco.respuestas.clear();
  disco.archivos.clear();
  vaciarCache();
  vi.clearAllMocks();
});
afterEach(() => vi.useRealTimers());

describe('what is worth keeping', () => {
  it('keeps the courses, tasks, quizzes, forums and messages; not the searches, pictures or videos', () => {
    for (const n of ['perfil', 'materias', 'pendientes', 'avisos', 'contenido.12', 'mes.2026-11', 'tareas.3', 'tarea.4', 'cuestionario.revision.9', 'foros.hilo.5', 'mensajes.charla.3.0']) {
      expect(esGuardable(n), n).toBe(true);
    }
    for (const n of ['inscripcion.areas', 'inscripcion.buscar.0.ana', 'mensajes.personas.ana', 'foto.https://x', 'video.abc', 'contenido.12x']) {
      expect(esGuardable(n), n).toBe(false);
    }
  });

  it('tells the network and a campus down from an answer of the campus', () => {
    expect(esFaltaDeConexion(new TypeError('Failed to fetch'))).toBe(true);
    expect(esFaltaDeConexion(new TypeError('Load failed'))).toBe(true);
    expect(esFaltaDeConexion(new ErrorCampus('caído', 'http_503'))).toBe(true);
    expect(esFaltaDeConexion(new ErrorCampus('venció', 'sesion'))).toBe(false);
    expect(esFaltaDeConexion(new ErrorCampus('no', 'http_404'))).toBe(false);
  });
});

describe('conCache without internet', () => {
  it('keeps on disk only with «Seguir conectado»', async () => {
    iniciarSesion('k');
    await perfil();
    await conCache('materias', 30, async () => ['Física']);
    expect(recordar).not.toHaveBeenCalled();

    cerrarSesion();
    iniciarSesion('k', { recordar: true });
    await perfil();
    await conCache('materias', 30, async () => ['Física']);
    expect(disco.respuestas.get('materias')).toMatchObject({ datos: ['Física'], alumno: 7, token: 'k' });
  });

  it('shows what the tab already had, past its time, when the network fails', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    iniciarSesion('k');
    await conCache('materias', 30, async () => ['Física']);
    vi.setSystemTime(Date.now() + 31 * 60_000);
    await expect(conCache('materias', 30, sinRed)).resolves.toEqual(['Física']);
  });

  it('after closing the tab, shows what was kept on disk for that key', async () => {
    iniciarSesion('k', { recordar: true });
    await perfil();
    await conCache('materias', 30, async () => ['Física']);
    vaciarCache();
    await expect(conCache('materias', 30, sinRed)).resolves.toEqual(['Física']);
  });

  it('another key never reads it, and an answer of the campus is not hidden', async () => {
    iniciarSesion('k', { recordar: true });
    await perfil();
    await conCache('materias', 30, async () => ['Física']);
    iniciarSesion('otra', { recordar: true });
    await expect(conCache('materias', 30, sinRed)).rejects.toThrow('Failed to fetch');
    iniciarSesion('k', { recordar: true });
    await expect(conCache('materias', 30, () => Promise.reject(new ErrorCampus('venció', 'sesion')))).rejects.toThrow('venció');
  });

  it('Salir deletes it', async () => {
    iniciarSesion('k', { recordar: true });
    await perfil();
    await conCache('materias', 30, async () => ['Física']);
    cerrarSesion();
    iniciarSesion('k', { recordar: true });
    await expect(conCache('materias', 30, sinRed)).rejects.toThrow();
  });
});

describe('traerArchivo without internet', () => {
  const item = { direccion: 'https://frro.cvg.utn.edu.ar/webservice/pluginfile.php/1/a.pdf', modificado: 100, peso: 3 };

  it('keeps the file with its version and does not ask again while it is the same', async () => {
    iniciarSesion('k', { recordar: true });
    await perfil();
    const uno = new Blob(['uno']);
    const dos = new Blob(['dos']);
    bajarArchivo.mockResolvedValueOnce(uno);
    await traerArchivo(item);
    expect(await traerArchivo(item)).toBe(uno);
    expect(bajarArchivo).toHaveBeenCalledTimes(1);

    bajarArchivo.mockResolvedValueOnce(dos);
    expect(await traerArchivo({ ...item, modificado: 200 })).toBe(dos);
  });

  it('without internet opens the one kept, even if the campus says it changed', async () => {
    iniciarSesion('k', { recordar: true });
    await perfil();
    const uno = new Blob(['uno']);
    bajarArchivo.mockResolvedValueOnce(uno);
    await traerArchivo(item);
    bajarArchivo.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    expect(await traerArchivo({ ...item, modificado: 200 })).toBe(uno);
  });

  it('without «Seguir conectado» nothing goes to disk', async () => {
    iniciarSesion('k');
    await perfil();
    bajarArchivo.mockResolvedValue(new Blob(['uno']));
    await traerArchivo(item);
    await traerArchivo(item);
    expect(bajarArchivo).toHaveBeenCalledTimes(2);
    expect(disco.archivos.size).toBe(0);
  });
});

describe('what was kept, at once', () => {
  const estadoSinRed = () => {
    let e;
    const { createElement } = React;
    function Ver() {
      e = useSinInternet();
      return null;
    }
    const caja = document.createElement('div');
    const raiz = createRoot(caja);
    act(() => raiz.render(createElement(Ver)));
    act(() => raiz.unmount());
    return e;
  };

  it('a new tab draws from the disk without asking, and it is not «sin internet»', async () => {
    iniciarSesion('k', { recordar: true });
    await perfil();
    await conCache('materias', 30, async () => ['Física']);
    vaciarCache();
    const pide = vi.fn(async () => ['Química']);
    expect(await desdeLoGuardado(() => conCache('materias', 30, pide))).toEqual({ datos: ['Física'] });
    expect(pide).not.toHaveBeenCalled();
    expect(estadoSinRed().desde).toBeNull();
    // The screen asks as always, and the campus' answer takes the place of the disk's.
    expect(await conCache('materias', 30, pide)).toEqual(['Química']);
    expect(await desdeLoGuardado(() => conCache('materias', 30, pide))).toEqual({ datos: ['Química'] });
  });

  it('without «Seguir conectado» the disk is not read', async () => {
    iniciarSesion('k');
    expect(await desdeLoGuardado(() => conCache('materias', 30, async () => []))).toBeNull();
    expect(recuperarTodas).not.toHaveBeenCalled();
  });

  it('another key draws nothing', async () => {
    iniciarSesion('k', { recordar: true });
    await perfil();
    await conCache('materias', 30, async () => ['Física']);
    iniciarSesion('otra', { recordar: true });
    expect(await desdeLoGuardado(() => conCache('materias', 30, async () => []))).toBeNull();
  });
});
