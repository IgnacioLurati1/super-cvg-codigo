import { afterEach, describe, expect, it, vi } from 'vitest';
import { examenesDeEjemplo, mensajeDeEjemplo } from './demoSysacad';
import { armarCopia, fechaDe, guardarCon, leerCopiaSysacad, nombreEnDrive, piezasParaGuardar, sonDelAlumno, traerCon } from './sysacadEnDrive';

const HORA = 3_600_000;
const AHORA = Date.UTC(2026, 10, 23, 15);
const DEL_CAMPUS = 'Ejemplo Martín Rodríguez';
const finales = (fecha = AHORA - HORA) => ({ fuente: 'sysacad-lindo', para: 'super-cvg', v: 1, vinculada: true, fecha, finales: [{ nombre: 'Física I', nota: 8 }] });
const todas = (ahora = AHORA) => ({ finales: finales(ahora - HORA), pestanas: mensajeDeEjemplo(ahora), examenes: examenesDeEjemplo(ahora) });

// jsdom's Blob has no text().
const textoDe = (blob) =>
  new Promise((ok) => {
    const r = new FileReader();
    r.onload = () => ok(r.result);
    r.readAsText(blob);
  });

function driveFalso() {
  const archivos = new Map();
  let n = 0;
  return {
    archivos,
    listar: async ({ nombre = null } = {}) => [...archivos.values()].filter((f) => nombre === null || f.name === nombre).map(({ id, name }) => ({ id, name })),
    bajar: async (id) => ({ text: async () => archivos.get(id).texto }),
    subir: vi.fn(async ({ id, nombre, blob }) => {
      const nuevo = id ?? `f${++n}`;
      archivos.set(nuevo, { id: nuevo, name: id ? archivos.get(id).name : nombre, texto: await textoDe(blob) });
      return nuevo;
    }),
    borrar: async (id) => archivos.delete(id),
  };
}

describe('qué va a Drive', () => {
  it('lo que la extensión leyó vinculada, y las copias solo si las guarda', () => {
    const t = todas();
    expect(piezasParaGuardar(t)).toEqual(t);
    expect(piezasParaGuardar({ ...t, pestanas: { ...t.pestanas, guarda: false } }).pestanas).toBeNull();
    expect(piezasParaGuardar({ finales: { ...finales(), vinculada: false }, pestanas: null, examenes: null })).toBeNull();
    expect(piezasParaGuardar({ finales: null, pestanas: null, examenes: null })).toBeNull();
  });

  it('solo si las copias dicen que son de este alumno del campus', () => {
    const p = piezasParaGuardar(todas());
    expect(sonDelAlumno(p, DEL_CAMPUS)).toBe(true);
    expect(sonDelAlumno(p, 'Otra Persona Distinta')).toBe(false);
    expect(sonDelAlumno(p, '')).toBe(false);
    // Only the finals say nobody's name: they don't go.
    expect(sonDelAlumno({ finales: finales(), pestanas: null, examenes: null }, DEL_CAMPUS)).toBe(false);
    // One of the two of someone else, and nothing goes.
    expect(sonDelAlumno({ ...p, examenes: { ...p.examenes, alumno: 'Pérez, Juan' } }, DEL_CAMPUS)).toBe(false);
  });
});

describe('el archivo en Drive', () => {
  it('ida y vuelta: se lee con los mismos controles que los mensajes de la extensión', () => {
    const p = todas();
    const leida = leerCopiaSysacad(JSON.stringify(armarCopia(7, p, AHORA)), 7, AHORA);
    expect(leida.guardado).toBe(AHORA);
    expect(leida.piezas).toEqual(p);
    expect(leida.finales.finales).toEqual([{ nombre: 'Física I', nota: 8 }]);
    expect(leida.copias.alumno).toBe('Rodríguez, Ejemplo Martín');
    expect(leida.examenes.examenes.length).toBeGreaterThan(0);
  });

  it('de otro alumno, rota, de una versión más nueva o con una pieza que no pasa', () => {
    const texto = JSON.stringify(armarCopia(7, todas(), AHORA));
    expect(leerCopiaSysacad(texto, 8, AHORA)).toBeNull();
    expect(leerCopiaSysacad('{', 7, AHORA)).toBeNull();
    expect(leerCopiaSysacad(JSON.stringify({ ...armarCopia(7, todas(), AHORA), version: 2 }), 7, AHORA)).toEqual({ nueva: true });
    const mala = armarCopia(7, todas(), AHORA);
    mala.pestanas.pestanas[0].bloques.push({ t: 'html', texto: '<b>x</b>' });
    expect(leerCopiaSysacad(JSON.stringify(mala), 7, AHORA)).toBeNull();
    expect(leerCopiaSysacad(JSON.stringify({ ...armarCopia(7, todas(), AHORA), finales: { ...finales(), nota: 3 } }), 7, AHORA)).toBeNull();
  });

  it('guarda, no repite lo mismo y nunca pisa una copia más nueva', async () => {
    const drive = driveFalso();
    expect(await guardarCon(drive, 7, todas(), AHORA)).toBe('guardada');
    expect([...drive.archivos.values()].map((f) => f.name)).toEqual([nombreEnDrive(7)]);
    expect(await guardarCon(drive, 7, todas(), AHORA)).toBe('igual');
    // Another computer read Sysacad later: this older one doesn't go over it.
    const despues = todas(AHORA + 5 * HORA);
    expect(await guardarCon(drive, 7, despues, AHORA)).toBe('guardada');
    expect(await guardarCon(drive, 7, todas(), AHORA)).toBe('mas-nueva');
    expect(drive.subir).toHaveBeenCalledTimes(2);
    expect(fechaDe((await traerCon(drive, 7)).piezas)).toBe(fechaDe(despues));
  });

  it('sin copia, o de otro alumno, no trae nada (false: lo guardado sin internet también se va)', async () => {
    const drive = driveFalso();
    expect(await traerCon(drive, 7)).toBe(false);
    await guardarCon(drive, 8, todas(), AHORA);
    expect(await traerCon(drive, 7)).toBe(false);
  });
});

describe('en la memoria de Sysacad', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  async function sinExtension() {
    vi.resetModules();
    vi.useFakeTimers();
    vi.spyOn(window, 'postMessage').mockImplementation(() => {});
    const s = await import('./sysacad');
    s.preguntarSysacad();
    vi.advanceTimersByTime(s.ESPERA_MS + 10);
    return s;
  }

  it('lo de Drive se muestra solo donde la extensión no contesta, marcado como de Drive', async () => {
    const s = await sinExtension();
    const leida = leerCopiaSysacad(JSON.stringify(armarCopia(7, todas(), Date.now())), 7);
    s.ponerDesdeDrive(leida);
    const e = s.estadoSysacad();
    expect([e.estado, e.deDrive !== null, e.copias.alumno, e.finales.length]).toEqual(['vinculada', true, 'Rodríguez, Ejemplo Martín', 1]);
    // Salir: it leaves memory, as the rest.
    s.olvidarSysacad();
    expect([s.estadoSysacad().estado, s.estadoSysacad().copias, s.estadoSysacad().deDrive]).toEqual(['sin-extension', null, null]);
  });

  it('si la extensión contesta, manda ella', async () => {
    const s = await sinExtension();
    s.iniciarSysacad();
    s.ponerDesdeDrive(leerCopiaSysacad(JSON.stringify(armarCopia(7, todas(), Date.now())), 7));
    window.dispatchEvent(new MessageEvent('message', { data: { fuente: 'sysacad-lindo', para: 'super-cvg', v: 1, vinculada: false }, origin: window.location.origin, source: window }));
    const e = s.estadoSysacad();
    expect([e.estado, e.deDrive, e.copias]).toEqual(['sin-vincular', null, null]);
    // And once it has answered, Drive doesn't come over it.
    s.ponerDesdeDrive(leerCopiaSysacad(JSON.stringify(armarCopia(7, todas(), Date.now())), 7));
    expect(s.estadoSysacad().deDrive).toBeNull();
    expect(s.crudosSysacad().finales.vinculada).toBe(false);
  });
});

describe('cuándo le pide a Drive', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.doUnmock('./sincro');
  });

  // On 23/11, with Drive off, every «nothing there» asked again right away: the page hung.
  it('sin Drive prendido pregunta una vez y espera, nunca en bucle', async () => {
    vi.resetModules();
    const conDrive = vi.fn(async () => null);
    vi.doMock('./sincro', () => ({ conDrive }));
    vi.useFakeTimers();
    vi.spyOn(window, 'postMessage').mockImplementation(() => {});
    const { fijarUsuario } = await import('./mio');
    const s = await import('./sysacad');
    const { arrancarSysacadEnDrive } = await import('./sysacadEnDrive');
    fijarUsuario(7);
    s.preguntarSysacad();
    vi.advanceTimersByTime(s.ESPERA_MS + 10);
    arrancarSysacadEnDrive();
    for (let i = 0; i < 50; i++) await Promise.resolve();
    expect(conDrive).toHaveBeenCalledTimes(1);
    expect(s.estadoSysacad().buscandoDrive).toBe(false);
    // In a while it tries again, once.
    vi.advanceTimersByTime(31_000);
    document.dispatchEvent(new Event('visibilitychange'));
    for (let i = 0; i < 50; i++) await Promise.resolve();
    expect(conDrive).toHaveBeenCalledTimes(2);
    fijarUsuario(null);
  });
});

describe('una extensión que solo manda las copias', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('pisa lo de Drive igual que una que manda todo', async () => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.spyOn(window, 'postMessage').mockImplementation(() => {});
    const s = await import('./sysacad');
    s.iniciarSysacad();
    vi.advanceTimersByTime(s.ESPERA_MS + 10);
    s.ponerDesdeDrive(leerCopiaSysacad(JSON.stringify(armarCopia(7, todas(), Date.now())), 7));
    expect(s.estadoSysacad().deDrive).not.toBeNull();
    window.dispatchEvent(new MessageEvent('message', { data: mensajeDeEjemplo(), origin: window.location.origin, source: window }));
    const e = s.estadoSysacad();
    expect([e.deDrive, e.finales, e.estado, e.copias.pestanas.length > 0]).toEqual([null, null, 'sin-extension', true]);
  });
});

describe('en el celu: sin internet y con otro nombre', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.doUnmock('./sincro');
    vi.doUnmock('./sesion');
    vi.doUnmock('./sinInternet');
    vi.doUnmock('./campus');
    localStorage.clear();
  });

  async function celu({ enDrive, delCampus = DEL_CAMPUS }) {
    vi.resetModules();
    const disco = new Map();
    const conDrive = vi.fn(async () => enDrive());
    vi.doMock('./sincro', () => ({ conDrive }));
    vi.doMock('./sesion', () => ({ tokenActual: () => 'clave', sesionRecordada: () => true }));
    vi.doMock('./sinInternet', () => ({
      recordar: vi.fn(async (nombre, datos) => disco.set(nombre, { cuando: 1, datos })),
      recuperar: vi.fn(async (nombre) => disco.get(nombre) ?? null),
    }));
    vi.doMock('./campus', () => ({ cargarPerfil: async () => ({ completo: delCampus }) }));
    vi.useFakeTimers();
    vi.spyOn(window, 'postMessage').mockImplementation(() => {});
    const mio = await import('./mio');
    const s = await import('./sysacad');
    const m = await import('./sysacadEnDrive');
    mio.fijarUsuario(7);
    s.preguntarSysacad();
    vi.advanceTimersByTime(s.ESPERA_MS + 10);
    const esperar = async () => {
      for (let i = 0; i < 80; i++) await Promise.resolve();
    };
    return { s, m, mio, disco, conDrive, esperar };
  }

  it('lo que trajo de Drive queda para cuando no hay internet; Drive sin copia lo borra', async () => {
    const copia = leerCopiaSysacad(JSON.stringify(armarCopia(7, todas(Date.now()), Date.now())), 7);
    let enDrive = () => copia;
    const { s, m, disco, esperar } = await celu({ enDrive: () => enDrive() });
    m.arrancarSysacadEnDrive();
    await esperar();
    expect(s.estadoSysacad().deDrive).not.toBeNull();
    expect(typeof disco.get('sysacad').datos).toBe('string');

    // Without internet: Drive answers nothing, and what was kept shows.
    s.olvidarSysacad();
    enDrive = () => null;
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    vi.advanceTimersByTime(6 * 60_000);
    document.dispatchEvent(new Event('visibilitychange'));
    await esperar();
    expect(s.estadoSysacad().copias?.alumno).toBe('Rodríguez, Ejemplo Martín');

    // Back online, the copy was deleted in Drive: this device forgets it too.
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    s.olvidarSysacad();
    enDrive = () => false;
    vi.advanceTimersByTime(6 * 60_000);
    document.dispatchEvent(new Event('visibilitychange'));
    await esperar();
    expect(disco.get('sysacad').datos).toBe('');
    expect(s.estadoSysacad().copias).toBeNull();
  });

  it('con otro nombre en el campus espera el «Sí, son mías» que llega de la compu', async () => {
    const copia = leerCopiaSysacad(JSON.stringify(armarCopia(7, todas(Date.now()), Date.now())), 7);
    const { s, m, mio, esperar } = await celu({ enDrive: () => copia, delCampus: 'Martincito Gamer' });
    m.arrancarSysacadEnDrive();
    await esperar();
    expect(s.estadoSysacad().copias).toBeNull();
    const { huellaDelPar } = await import('./sysacadPestanas');
    // The examenes say the same name as the copies.
    mio.sonMiasLasDeSysacad(huellaDelPar('Rodríguez, Ejemplo Martín', 'Martincito Gamer'));
    await esperar();
    expect(s.estadoSysacad().deDrive).not.toBeNull();
  });
});
