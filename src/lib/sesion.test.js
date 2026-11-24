import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { alumnoRecordado, cerrarSesion, conCache, cursosRecordados, desdeLoGuardado, enCache, exigirCampus, iniciarSesion, olvidar, recordarAlumno, recordarCursos, tokenActual, vaciarCache } from './sesion';
import { huellaDe } from './sinInternet';

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  vaciarCache();
});

describe('sesion', () => {
  it('keeps the key only for this tab by default', () => {
    iniciarSesion('k');
    expect(tokenActual()).toBe('k');
    expect(localStorage.length).toBe(0);
  });

  it('survives closing the tab only when asked', () => {
    iniciarSesion('k', { recordar: true });
    expect(sessionStorage.length).toBe(0);
    expect(tokenActual()).toBe('k');
  });

  it('leaving erases the key and all cached data everywhere', async () => {
    iniciarSesion('k', { recordar: true });
    sessionStorage.setItem('cl.sesion', 'k2');
    const fn = vi.fn(async () => ({ privado: true }));
    await conCache('materias', 5, fn);
    localStorage.setItem('otra-app', 'queda');
    cerrarSesion();
    expect(tokenActual()).toBeNull();
    expect(Object.keys(sessionStorage)).toEqual([]);
    expect(Object.keys(localStorage)).toEqual(['otra-app']);
    await conCache('materias', 5, fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('keeps the campus number next to the key, and it goes with the key', () => {
    expect(alumnoRecordado()).toBeNull();
    recordarAlumno(5);
    expect(alumnoRecordado()).toBeNull();
    iniciarSesion('k');
    recordarAlumno(5);
    expect(sessionStorage.getItem('cl.sesion.alumno')).toMatch(/^[a-z0-9]+:5$/);
    expect(alumnoRecordado()).toBe(5);
    recordarAlumno(-1);
    recordarAlumno(1.5);
    expect(alumnoRecordado()).toBe(5);
    // Another key, after leaving, starts without it.
    cerrarSesion();
    iniciarSesion('k2', { recordar: true });
    expect(alumnoRecordado()).toBeNull();
    recordarAlumno(7);
    expect(localStorage.getItem('cl.sesion.alumno')).toMatch(/^[a-z0-9]+:7$/);
    expect(sessionStorage.getItem('cl.sesion.alumno')).toBeNull();
    cerrarSesion();
    expect(alumnoRecordado()).toBeNull();
    expect(localStorage.getItem('cl.sesion.alumno')).toBeNull();
  });

  it('keeps only the numbers of the courses in progress, and they go with the key', () => {
    recordarCursos([3, 4]);
    expect(cursosRecordados()).toEqual([]);
    iniciarSesion('k');
    recordarCursos([3, 4]);
    expect(sessionStorage.getItem('cl.sesion.cursos')).toMatch(/^[a-z0-9]+:3,4$/);
    expect(cursosRecordados()).toEqual([3, 4]);
    for (const malo of [[3, 'Física'], [0], [1.5], 'x']) recordarCursos(malo);
    expect(cursosRecordados()).toEqual([3, 4]);
    sessionStorage.setItem('cl.sesion.cursos', '3,<b>');
    expect(cursosRecordados()).toEqual([]);
    recordarCursos(Array.from({ length: 40 }, (_, i) => i + 1));
    expect(cursosRecordados()).toHaveLength(30);
    cerrarSesion();
    expect(cursosRecordados()).toEqual([]);
    expect(sessionStorage.getItem('cl.sesion.cursos')).toBeNull();
  });

  it('a number kept for another key is not taken, nor kept when the key changed meanwhile', () => {
    iniciarSesion('de-ana', { recordar: true });
    recordarAlumno(5);
    recordarCursos([3]);
    const deAna = { alumno: localStorage.getItem('cl.sesion.alumno'), cursos: localStorage.getItem('cl.sesion.cursos') };
    // Another tab signs Beto in: what Ana's tab left behind, copied next to his key, is not his.
    cerrarSesion();
    iniciarSesion('de-beto', { recordar: true });
    localStorage.setItem('cl.sesion.alumno', deAna.alumno);
    localStorage.setItem('cl.sesion.cursos', deAna.cursos);
    expect(alumnoRecordado()).toBeNull();
    expect(cursosRecordados()).toEqual([]);
    // Ana's profile, coming late with her key: nothing is kept for Beto.
    recordarAlumno(5, 'de-ana');
    recordarCursos([3], 'de-ana');
    expect(alumnoRecordado()).toBeNull();
    expect(cursosRecordados()).toEqual([]);
    recordarAlumno(8, 'de-beto');
    expect(alumnoRecordado()).toBe(8);
  });

  it('a number left without its key is not taken', () => {
    sessionStorage.setItem('cl.sesion.alumno', '5');
    expect(alumnoRecordado()).toBeNull();
  });
});

describe('conCache', () => {
  it('asks once within the window', async () => {
    const fn = vi.fn(async () => 1);
    await conCache('a', 5, fn);
    await conCache('a', 5, fn);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('shares one request between callers at the same time', async () => {
    const fn = vi.fn(async () => 1);
    await Promise.all([conCache('b', 5, fn), conCache('b', 5, fn)]);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('asks again after the window', async () => {
    const fn = vi.fn(async () => 1);
    await conCache('a', 0, fn);
    await new Promise((r) => setTimeout(r, 2));
    await conCache('a', 0, fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('asks again after emptying the cache', async () => {
    const fn = vi.fn(async () => 1);
    await conCache('a', 5, fn);
    vaciarCache();
    await conCache('a', 5, fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('keeps campus data away from the disk', async () => {
    await conCache('notas', 5, async () => ({ nota: 'privada' }));
    expect(JSON.stringify({ ...sessionStorage, ...localStorage })).not.toContain('privada');
  });

  it('a late answer from the previous student is not stored for the next one', async () => {
    let responder;
    const lenta = new Promise((r) => { responder = r; });
    const deA = conCache('notas', 5, () => lenta);
    cerrarSesion();
    iniciarSesion('b');
    responder('notas de A');
    await deA;
    expect(await conCache('notas', 5, async () => 'notas de B')).toBe('notas de B');
  });

  it('the next student does not join a request still running for the previous one', async () => {
    let responder;
    const deA = conCache('notas', 5, () => new Promise((r) => { responder = r; }));
    cerrarSesion();
    iniciarSesion('b');
    expect(await conCache('notas', 5, async () => 'notas de B')).toBe('notas de B');
    responder('notas de A');
    await deA;
    expect(await conCache('notas', 5, async () => 'no se pide')).toBe('notas de B');
  });

  it('leaving from another tab empties this one', async () => {
    iniciarSesion('k', { recordar: true });
    const fn = vi.fn(async () => 1);
    await conCache('a', 5, fn);
    window.dispatchEvent(new StorageEvent('storage', { key: 'cl.salida', newValue: '1' }));
    expect(tokenActual()).toBeNull();
    await conCache('a', 5, fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not store a failed answer', async () => {
    await expect(conCache('a', 5, async () => { throw new Error('x'); })).rejects.toThrow('x');
    expect(await conCache('a', 5, async () => 3)).toBe(3);
  });
});

describe('desdeLoGuardado', () => {
  // An answer already past its window: what a screen finds when it comes back after a while.
  const vieja = async (nombre, datos) => {
    await conCache(nombre, 0, async () => datos);
  };

  it('draws from what was kept without asking, and the campus is asked as always afterwards', async () => {
    await vieja('materias', 'viejo');
    const pide = vi.fn(async () => 'nuevo');
    expect(await desdeLoGuardado(() => conCache('materias', 0, pide))).toEqual({ datos: 'viejo' });
    expect(pide).not.toHaveBeenCalled();
    expect(await conCache('materias', 0, pide)).toBe('nuevo');
    expect(pide).toHaveBeenCalledTimes(1);
  });

  it('follows a screen that asks one thing after another', async () => {
    await vieja('perfil', { id: 5 });
    await vieja('materias', [11]);
    await vieja('contenido.11', ['Unidad 1']);
    const pide = vi.fn(async () => 'no');
    const r = await desdeLoGuardado(async () => {
      await conCache('perfil', 0, pide);
      const [id] = await conCache('materias', 0, pide);
      return conCache(`contenido.${id}`, 0, pide);
    });
    expect(r).toEqual({ datos: ['Unidad 1'] });
    expect(pide).not.toHaveBeenCalled();
  });

  it('gives nothing when a part is not kept, even if the screen catches the error, and asks nobody', async () => {
    await vieja('perfil', { id: 5 });
    const pide = vi.fn(async () => 'no');
    expect(await desdeLoGuardado(() => conCache('materias', 0, pide))).toBeNull();
    expect(await desdeLoGuardado(async () => (await conCache('materias', 0, pide).catch(() => null)) ?? 'vacío')).toBeNull();
    expect(pide).not.toHaveBeenCalled();
    expect(() => exigirCampus()).not.toThrow();
  });

  it('another caller at the same time still gets the campus, not what was kept', async () => {
    await vieja('materias', 'viejo');
    const pasada = desdeLoGuardado(async () => {
      const a = await conCache('materias', 0, async () => 'no');
      await new Promise((ok) => setTimeout(ok, 30));
      return a;
    });
    // The pass is waiting on something else: another task asks meanwhile.
    await new Promise((ok) => setTimeout(ok, 10));
    expect(await conCache('materias', 0, async () => 'nuevo')).toBe('nuevo');
    // And the pass ended where it waited, giving nothing.
    expect(await pasada).toBeNull();
  });

  it('forgets nothing and asks nothing outside conCache during the pass', async () => {
    await vieja('materias', 'viejo');
    let lanzo = false;
    const r = await desdeLoGuardado(async () => {
      olvidar(['materias']);
      try {
        exigirCampus();
      } catch {
        lanzo = true;
      }
      return conCache('materias', 0, async () => 'no');
    });
    expect(lanzo).toBe(true);
    expect(r).toBeNull();
    expect(enCache('materias')).toBe('viejo');
  });

  it('what was forgotten is not drawn again', async () => {
    await vieja('tarea.3', 'sin entregar');
    olvidar(['tarea.']);
    expect(await desdeLoGuardado(() => conCache('tarea.3', 5, async () => 'no'))).toBeNull();
  });

  it('nothing of the previous student', async () => {
    await vieja('materias', 'de A');
    const pasada = desdeLoGuardado(() => conCache('materias', 0, async () => 'no'));
    cerrarSesion();
    expect(await pasada).toBeNull();
  });
});

describe('the tabs of the session', () => {
  const otra = new BroadcastChannel('super-cvg-pestanas');
  const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));
  const recibidos = [];
  otra.onmessage = ({ data }) => recibidos.push(data);
  beforeEach(() => {
    recibidos.length = 0;
    iniciarSesion('k');
  });
  afterAll(() => otra.close());

  it('takes what another tab of the session brought, without asking', async () => {
    const huella = await huellaDe('k');
    otra.postMessage({ tipo: 'campus.respuesta', huella, nombre: 'materias', cuando: Date.now(), desde: Date.now(), datos: ['Física II'] });
    await vi.waitFor(() => expect(enCache('materias')).toEqual(['Física II']));
    const fn = vi.fn(async () => 'no');
    expect(await conCache('materias', 5, fn)).toEqual(['Física II']);
    expect(fn).not.toHaveBeenCalled();
  });

  it('ignores another student, and everything after Salir', async () => {
    otra.postMessage({ tipo: 'campus.respuesta', huella: await huellaDe('otra'), nombre: 'materias', cuando: Date.now(), desde: Date.now(), datos: ['ajena'] });
    await esperar(30);
    expect(enCache('materias')).toBeUndefined();
    const huella = await huellaDe('k');
    cerrarSesion();
    otra.postMessage({ tipo: 'campus.respuesta', huella, nombre: 'materias', cuando: Date.now(), desde: Date.now(), datos: ['tarde'] });
    await esperar(30);
    expect(enCache('materias')).toBeUndefined();
  });

  it('does not take what was asked before this tab forgot it', async () => {
    const huella = await huellaDe('k');
    const desde = Date.now() - 1000;
    olvidar(['tarea.']);
    otra.postMessage({ tipo: 'campus.respuesta', huella, nombre: 'tarea.3', cuando: Date.now(), desde, datos: 'antes de entregar' });
    await esperar(30);
    expect(enCache('tarea.3')).toBeUndefined();
  });

  it('waits for what another tab is asking for instead of asking again', async () => {
    const huella = await huellaDe('k');
    otra.postMessage({ tipo: 'campus.pidiendo', huella, nombre: 'materias', desde: Date.now() });
    await esperar(30);
    const fn = vi.fn(async () => 'propio');
    const pedido = conCache('materias', 5, fn);
    await esperar(30);
    otra.postMessage({ tipo: 'campus.respuesta', huella, nombre: 'materias', cuando: Date.now(), desde: Date.now(), datos: 'de la otra' });
    expect(await pedido).toBe('de la otra');
    expect(fn).not.toHaveBeenCalled();
  });

  it('two tabs that start together agree on one asking', async () => {
    const huella = await huellaDe('k');
    // Something from another tab first: this one knows it is not alone.
    otra.postMessage({ tipo: 'campus.fallo', huella, nombre: 'nada' });
    otra.postMessage({ tipo: 'campus.pidiendo', huella, nombre: 'nada', desde: Date.now(), de: 'z' });
    await esperar(30);
    const fn = vi.fn(async () => 'propio');
    const pedido = conCache('contenido.5', 5, fn);
    // The other one started a moment before.
    otra.postMessage({ tipo: 'campus.pidiendo', huella, nombre: 'contenido.5', desde: Date.now() - 5, de: 'z' });
    await esperar(100);
    otra.postMessage({ tipo: 'campus.respuesta', huella, nombre: 'contenido.5', cuando: Date.now(), desde: Date.now() - 5, datos: 'de la otra' });
    expect(await pedido).toBe('de la otra');
    expect(fn).not.toHaveBeenCalled();
  });

  it('asks itself when the other tab could not', async () => {
    const huella = await huellaDe('k');
    otra.postMessage({ tipo: 'campus.pidiendo', huella, nombre: 'materias', desde: Date.now() });
    await esperar(30);
    const pedido = conCache('materias', 5, async () => 'propio');
    otra.postMessage({ tipo: 'campus.fallo', huella, nombre: 'materias' });
    expect(await pedido).toBe('propio');
  });

  it('a tab that opens takes what another of the session has, without asking', async () => {
    const huella = await huellaDe('k');
    // Another tab of the session is open: it holds its lock, and answers the greeting.
    const otraPresente = { name: `super-cvg-sesion-${huella}`, mode: 'shared' };
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: { request: (nombre, opciones, fn) => fn(), query: async () => ({ held: [otraPresente] }) },
    });
    const saludos = new BroadcastChannel('super-cvg-pestanas');
    saludos.onmessage = ({ data }) => {
      if (data.tipo !== 'campus.hola' || data.huella !== huella) return;
      saludos.postMessage({ tipo: 'campus.entrega', huella, nombre: 'materias', cuando: Date.now(), desde: Date.now(), datos: ['de la otra'] });
      saludos.postMessage({ tipo: 'campus.entregado', huella });
    };
    try {
      const fn = vi.fn(async () => ['propias']);
      expect(await conCache('materias', 5, fn)).toEqual(['de la otra']);
      expect(fn).not.toHaveBeenCalled();
    } finally {
      saludos.close();
      delete navigator.locks;
    }
  });

  it('tells the others what it asks for and what came', async () => {
    await conCache('contenido.77', 5, async () => ['Unidad 1']);
    const huella = await huellaDe('k');
    const estos = () => recibidos.filter((m) => m.nombre === 'contenido.77');
    await vi.waitFor(() => expect(estos().map((m) => m.tipo)).toEqual(['campus.pidiendo', 'campus.respuesta']));
    expect(estos().every((m) => m.huella === huella)).toBe(true);
    expect(estos()[1].datos).toEqual(['Unidad 1']);
  });
});
