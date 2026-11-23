import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { baseFalsa } from './baseFalsa.fixture';

const HORARIOS = {
  materias: ['Bases de Datos', 'Economía', 'Física II', 'Ciencia de Datos'],
  comisiones: [
    { codigo: '2K01', turno: 'Mañana', clases: [[1, 1, 480, 600, 2, ''], [2, 1, 480, 600, 2, '']] },
    { codigo: '3K02', turno: 'Mañana', clases: [[1, 2, 480, 675, 0, ''], [2, 2, 480, 675, 0, ''], [1, 3, 525, 675, 1, '']] },
    { codigo: '3EK01', turno: 'Mañana', clases: [[2, 5, 435, 600, 3, '']] },
  ],
};
const CURSOS = [{ id: 10, nombre: 'Bases de Datos' }, { id: 11, nombre: 'Economía' }, { id: 12, nombre: 'Física II - 2026 - 2K1' }, { id: 13, nombre: 'Ciencia de Datos' }];

vi.mock('./campus', () => ({ cargarMaterias: vi.fn(async () => ({ enCurso: CURSOS, otras: [] })) }));
vi.mock('./horarioDatos', () => ({ cargarHorarios: vi.fn(async () => HORARIOS) }));

const { planDeDescargas, sincronizarDescargas } = await import('./descargas');
const { archivosDelCurso, conWifi, leerDato, leerLlave, puedeBajarDeNoche, selloDeArchivo, TAG } = await import('./descargasFondo');
const { aplanarContenido } = await import('./datos');
const { selloDe } = await import('./textosPdf');
const { puedeBajarTodo } = await import('./trabajador');
const { ajustesActuales, cambiarAjustes } = await import('./ajustes');
const { cerrarSesion, iniciarSesion } = await import('./sesion');
const { cambiarMio, descargarSeccion, fijarUsuario, mioActual, sanearMio } = await import('./mio');
const sinInternet = await import('./sinInternet');

describe('the courses of each day', () => {
  const mio = sanearMio({ materias: { 10: { comision: '3K02' }, 11: { comision: '3K02' }, 13: { comision: '3EK01' } }, horario: { extras: [{ id: 1, materia: 'Economía', comision: '3K02' }] } });

  it('follows the schedule of «En la facu»: each course in its commission, by the cuatrimestre of that day', () => {
    // Monday 5 to Sunday 11 of October 2026, in the second cuatrimestre. The 7th the faculty has no activity.
    const plan = planDeDescargas({ horarios: HORARIOS, cursos: CURSOS, mio, desde: new Date(2026, 9, 5, 22, 30), dias: 7 });
    expect(plan).toEqual({ '2026-10-05': [12], '2026-10-06': [10], '2026-10-09': [13] });
  });

  it('leaves out holidays, the days out of a cuatrimestre and the courses taken out of Hoy', () => {
    // Monday 12 of October is a holiday; from the 14th of November there are no classes.
    expect(planDeDescargas({ horarios: HORARIOS, cursos: CURSOS, mio, desde: new Date(2026, 9, 12), dias: 1 })).toEqual({});
    expect(planDeDescargas({ horarios: HORARIOS, cursos: CURSOS, mio, desde: new Date(2026, 10, 16), dias: 7 })).toEqual({});
    const fuera = sanearMio({ ...mio, hoy: { fuera: [13] } });
    expect(planDeDescargas({ horarios: HORARIOS, cursos: CURSOS, mio: fuera, desde: new Date(2026, 9, 5), dias: 7 })).toEqual({ '2026-10-05': [12], '2026-10-06': [10] });
  });

  it('a course marked «ninguna» brings nothing, and only numbers go in the plan', () => {
    const plan = planDeDescargas({ horarios: HORARIOS, cursos: CURSOS, mio: sanearMio({ ...mio, materias: { ...mio.materias, 12: { comision: 'ninguna' } } }), desde: new Date(2026, 9, 5), dias: 7 });
    expect(plan).toEqual({ '2026-10-06': [10], '2026-10-09': [13] });
    expect(JSON.stringify(plan)).toMatch(/^[{}[\]":,\d-]+$/);
  });
});

describe('the same files and versions the page keeps', () => {
  it('archivosDelCurso finds the files aplanarContenido shows, with the version of selloDe', () => {
    const secciones = [
      { id: 1, name: 'Uno', modules: [
        { id: 11, modname: 'resource', contents: [{ type: 'file', filename: 'a.pdf', fileurl: 'https://frro.cvg.utn.edu.ar/webservice/pluginfile.php/1/a.pdf', filesize: 120, timemodified: 1700 }] },
        { id: 12, modname: 'folder', contents: [{ type: 'file', filename: 'b.pdf', fileurl: 'https://frro.cvg.utn.edu.ar/webservice/pluginfile.php/1/b.pdf', timecreated: 1600 }, { type: 'url', fileurl: 'https://x.test' }] },
        { id: 13, modname: 'resource', uservisible: false, contents: [{ type: 'file', filename: 'c.pdf', fileurl: 'https://frro.cvg.utn.edu.ar/webservice/pluginfile.php/1/c.pdf', filesize: 5, timemodified: 1 }] },
        { id: 14, modname: 'assign', contents: [{ type: 'file', filename: 'd.pdf', fileurl: 'https://frro.cvg.utn.edu.ar/webservice/pluginfile.php/1/d.pdf', filesize: 5, timemodified: 1 }] },
      ] },
      { id: 2, name: 'Dos', uservisible: false, modules: [{ id: 21, modname: 'resource', contents: [{ type: 'file', filename: 'e.pdf', fileurl: 'https://frro.cvg.utn.edu.ar/webservice/pluginfile.php/1/e.pdf', filesize: 5, timemodified: 1 }] }] },
    ];
    const dePagina = aplanarContenido(secciones, { id: 5, nombre: 'X' }).filter((i) => i.tipo === 'archivo').map((i) => ({ direccion: i.direccion, sello: selloDe(i) }));
    expect(archivosDelCurso(secciones).map(({ direccion, sello }) => ({ direccion, sello }))).toEqual(dePagina);
    expect(selloDeArchivo({ timecreated: 1600 })).toBe('1600:0');
    expect(archivosDelCurso(secciones, [1])).toEqual([]);
  });

  it('the night downloads only where the page would download the rest of the site ahead', () => {
    const conexiones = [{ type: 'wifi' }, { type: 'ethernet', saveData: true }, { type: 'wifi', effectiveType: '2g' }, { type: 'cellular' }, {}, undefined];
    for (const c of conexiones) {
      for (const modo of ['auto', 'siempre', 'nunca']) {
        if (puedeBajarDeNoche(c, modo)) expect(puedeBajarTodo(c, modo)).toBe(true);
        if (!conWifi(c)) expect(puedeBajarDeNoche(c, modo)).toBe(false);
      }
    }
  });
});

describe('the key for the night, from the page', () => {
  let periodico;
  let permiso;
  beforeEach(() => {
    vi.stubGlobal('indexedDB', baseFalsa());
    if (!globalThis.crypto?.subtle) vi.stubGlobal('crypto', webcrypto);
    periodico = { register: vi.fn(async () => {}), unregister: vi.fn(async () => true) };
    permiso = 'granted';
    vi.stubGlobal('ServiceWorkerRegistration', class { get periodicSync() { return periodico; } });
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { getRegistration: async () => ({ periodicSync: periodico }) } });
    Object.defineProperty(navigator, 'permissions', { configurable: true, value: { query: async () => ({ state: permiso }) } });
    localStorage.clear();
    sessionStorage.clear();
  });
  afterEach(() => {
    cerrarSesion();
    vi.unstubAllGlobals();
    delete navigator.serviceWorker;
    delete navigator.permissions;
  });

  const entrar = (token, recordar = true) => {
    iniciarSesion(token, { recordar });
    fijarUsuario(7);
  };
  const esperar = () => new Promise((ok) => setTimeout(ok, 30));

  it('on, with «Seguir conectado»: the key goes to the night, the plan with it, and Chrome is asked', async () => {
    entrar('clave-1');
    cambiarAjustes({ descargas: true });
    await sincronizarDescargas();
    expect(await leerLlave()).toEqual({ token: 'clave-1', alumno: 7 });
    expect(periodico.register).toHaveBeenCalledWith(TAG, { minInterval: 86_400_000 });
    expect((await leerDato('plan')).alumno).toBe(7);
  });

  it('off, without «Seguir conectado» or without periodic sync: no key, and Chrome stops', async () => {
    entrar('clave-1');
    cambiarAjustes({ descargas: true });
    await sincronizarDescargas();
    cambiarAjustes({ descargas: false });
    await sincronizarDescargas();
    expect(await leerLlave()).toBeNull();
    expect(periodico.unregister).toHaveBeenCalledWith(TAG);

    entrar('clave-2', false);
    cambiarAjustes({ descargas: true });
    await sincronizarDescargas();
    expect(await leerLlave()).toBeNull();

    entrar('clave-3');
    cambiarAjustes({ descargas: true });
    permiso = 'denied';
    await sincronizarDescargas();
    expect(await leerLlave()).toBeNull();
    expect(periodico.register).toHaveBeenCalledTimes(1);
  });

  it('Salir takes the key and turns the setting off', async () => {
    entrar('clave-1');
    cambiarAjustes({ descargas: true });
    await sincronizarDescargas();
    cerrarSesion();
    await esperar();
    expect(await leerLlave()).toBeNull();
    expect(ajustesActuales().descargas).toBe(false);
  });

  it('a new key takes the place of the old one: the old one is never left', async () => {
    entrar('clave-1');
    cambiarAjustes({ descargas: true });
    await sincronizarDescargas();
    entrar('clave-2');
    await esperar();
    expect(await leerLlave()).toBeNull();
    await sincronizarDescargas();
    expect(await leerLlave()).toEqual({ token: 'clave-2', alumno: 7 });
  });

  it('the sections skipped go in the plan, by number', async () => {
    entrar('clave-1');
    cambiarAjustes({ descargas: true });
    descargarSeccion(10, 4, false);
    descargarSeccion(10, 9, false);
    descargarSeccion(10, 4, true);
    expect(mioActual().sinDescargar).toEqual({ 10: [9] });
    await sincronizarDescargas();
    expect((await leerDato('plan')).saltear).toEqual({ 10: [9] });
    cambiarMio((m) => ({ ...m, sinDescargar: {} }));
  });
});

describe('the sections skipped, in mio', () => {
  it('only course and section numbers survive', () => {
    expect(sanearMio({ sinDescargar: { 10: [3, 3, 1, -2, 'x', 1.5], abc: [1], p123456: [1], 11: [], 12: 'x' } }).sinDescargar).toEqual({ 10: [1, 3] });
    expect(sanearMio({ sinDescargar: [1, 2] }).sinDescargar).toEqual({});
    expect(sanearMio(null).sinDescargar).toEqual({});
  });
});

describe('what the night brought, read by the page', () => {
  beforeEach(() => {
    vi.stubGlobal('indexedDB', baseFalsa());
    if (!globalThis.crypto?.subtle) vi.stubGlobal('crypto', webcrypto);
  });
  afterEach(async () => {
    await sinInternet.borrarSinInternet();
    vi.unstubAllGlobals();
  });
  const quien = { token: 'k', alumno: 7 };
  const SECCIONES = [{ id: 1, name: 'Unidad 1', modules: [{ id: 11, modname: 'resource', name: 'Apunte', contents: [{ type: 'file', filename: 'a.pdf', fileurl: 'https://frro.cvg.utn.edu.ar/webservice/pluginfile.php/1/a.pdf', filesize: 3, timemodified: 9 }] }] }];

  it('shows as the course the page keeps, with its name, when it is newer; the page\'s own wins otherwise', async () => {
    await sinInternet.recordar('materias', { enCurso: [{ id: 5, nombre: 'Física II' }], otras: [] }, { ...quien, cuando: 1 });
    await sinInternet.recordar('noche.contenido.5', { secciones: SECCIONES }, { ...quien, cuando: 200 });
    const r = await sinInternet.recuperar('contenido.5', 'k');
    expect(r.cuando).toBe(200);
    expect(r.datos[0]).toMatchObject({ tipo: 'archivo', materia: 'Física II', materiaId: 5, seccion: 'Unidad 1', direccion: SECCIONES[0].modules[0].contents[0].fileurl });
    const todas = new Map(await sinInternet.recuperarTodas('k'));
    expect(todas.has('noche.contenido.5')).toBe(false);
    expect(todas.get('contenido.5').cuando).toBe(200);
    // The page brings the course: its answer replaces the night's.
    await sinInternet.recordar('contenido.5', [{ id: 'propio' }], { ...quien, cuando: 300 });
    expect((await sinInternet.recuperar('contenido.5', 'k')).datos).toEqual([{ id: 'propio' }]);
    expect(await sinInternet.recuperar('noche.contenido.5', 'k')).toBeNull();
  });

  it('another key reads none of it', async () => {
    await sinInternet.recordar('noche.contenido.5', { secciones: SECCIONES }, { ...quien, cuando: 200 });
    expect(await sinInternet.recuperar('contenido.5', 'otra')).toBeNull();
    expect(await sinInternet.recuperarTodas('otra')).toEqual([]);
  });
});
