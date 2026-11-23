// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { baseFalsa } from './baseFalsa.fixture';
import { borrarDescargas, claveDelDia, conWifi, correr, DE_FONDO, diaQueToca, guardarLlave, leerDato, leerLlave, materiasQueTocan, pedirAlCampus, ponerDato, puedeBajarDeNoche, TOPE_DIARIO } from './descargasFondo';
import { ErrorCampus, LECTURA } from './moodle';
import * as disco from './sinInternetDisco';

const WIFI = { type: 'wifi', effectiveType: '4g' };
const LUNES_10 = new Date(2026, 10, 23, 10, 0);
const LUNES_22 = new Date(2026, 10, 23, 22, 0);
const dir = (n) => `https://frro.cvg.utn.edu.ar/webservice/pluginfile.php/${n}/mod_resource/content/1/f${n}.pdf`;
const archivo = (n, { peso = 100, cuando = 1000 } = {}) => ({ type: 'file', fileurl: dir(n), filesize: peso, timemodified: cuando });
const seccion = (id, archivos, extra = {}) => ({ id, name: `S${id}`, modules: [{ id: id * 10, modname: 'resource', contents: archivos }], ...extra });
const bytes = (n) => new Blob([new Uint8Array(n)]);

// The campus, fake: each course its sections; each file the bytes its listing says.
function campus(cursos) {
  const funciones = [];
  const bajados = [];
  return {
    funciones,
    bajados,
    llamar: vi.fn(async (token, funcion, parametros) => {
      if (!LECTURA.has(funcion)) throw new Error(`Función fuera de la lista de lectura: ${funcion}`);
      funciones.push(funcion);
      return cursos[parametros.courseid] ?? [];
    }),
    pedirArchivo: vi.fn(async (token, direccion) => {
      bajados.push(direccion);
      const c = Object.values(cursos).flat().flatMap((s) => s.modules.flatMap((m) => m.contents)).find((x) => x.fileurl === direccion);
      return { blob: async () => bytes(c.filesize) };
    }),
  };
}

const prender = async ({ dias = { [claveDelDia(LUNES_10)]: [5] }, saltear = {}, ahorro = 'auto' } = {}) => {
  await guardarLlave('clave-1', 7);
  await ponerDato('plan', { alumno: 7, dias, saltear, ahorro });
};
const quien = { token: 'clave-1', alumno: 7 };

beforeEach(() => vi.stubGlobal('indexedDB', baseFalsa()));
afterEach(async () => {
  await disco.borrarSinInternet();
  await borrarDescargas();
  vi.unstubAllGlobals();
});

describe('which courses a night brings', () => {
  it('in the day, the classes of today; from the evening on, the ones of tomorrow', () => {
    const plan = { dias: { '2026-11-23': [5, 6, 5], '2026-11-24': [9], '2026-11-25': ['x', -1, 3] } };
    expect(diaQueToca(LUNES_10)).toBe('2026-11-23');
    expect(materiasQueTocan(plan, LUNES_10)).toEqual([5, 6]);
    expect(diaQueToca(new Date(2026, 10, 23, 17, 59))).toBe('2026-11-23');
    expect(materiasQueTocan(plan, new Date(2026, 10, 23, 18, 0))).toEqual([9]);
    expect(materiasQueTocan(plan, LUNES_22)).toEqual([9]);
    // After midnight, the day that started.
    expect(materiasQueTocan(plan, new Date(2026, 10, 24, 2, 0))).toEqual([9]);
    expect(materiasQueTocan({ dias: { '2026-11-24': [3] } }, new Date(2026, 10, 24, 23, 0))).toEqual([]);
    expect(materiasQueTocan(plan, new Date(2026, 10, 24, 19, 0))).toEqual([3]);
    // End of month and of year.
    expect(diaQueToca(new Date(2026, 11, 31, 21, 0))).toBe('2027-01-01');
    expect(materiasQueTocan(null, LUNES_10)).toEqual([]);
  });
});

describe('only on wifi', () => {
  it('wifi or a cable; mobile data, an unknown type or no connection info never', () => {
    expect(conWifi({ type: 'wifi' })).toBe(true);
    expect(conWifi({ type: 'ethernet' })).toBe(true);
    for (const c of [{ type: 'cellular' }, { type: 'unknown' }, { type: 'none' }, { type: 'bluetooth' }, { effectiveType: '4g' }, {}, undefined, null]) {
      expect(conWifi(c)).toBe(false);
      expect(puedeBajarDeNoche(c, 'nunca')).toBe(false);
    }
  });

  it('with «Ahorro de datos»: «Siempre» never, «Automático» not with the saver or a slow line, «Nunca» on any wifi', () => {
    expect(puedeBajarDeNoche(WIFI, 'auto')).toBe(true);
    expect(puedeBajarDeNoche(WIFI, 'siempre')).toBe(false);
    expect(puedeBajarDeNoche({ ...WIFI, saveData: true }, 'auto')).toBe(false);
    expect(puedeBajarDeNoche({ type: 'wifi', effectiveType: '3g' }, 'auto')).toBe(false);
    expect(puedeBajarDeNoche({ type: 'wifi', effectiveType: '3g', saveData: true }, 'nunca')).toBe(true);
  });

  it('a night off wifi asks the campus nothing, and stops when the wifi goes', async () => {
    await prender({ dias: { [claveDelDia(LUNES_10)]: [5, 6] } });
    for (const c of [{ type: 'cellular' }, {}, undefined]) {
      const falso = campus({});
      expect((await correr({ ahora: () => LUNES_10, conexion: () => c, ...falso, disco })).estado).toBe('sin-wifi');
      expect(falso.llamar).not.toHaveBeenCalled();
    }
    const falso = campus({ 5: [seccion(1, [archivo(1), archivo(2)])], 6: [seccion(2, [archivo(3)])] });
    let conexion = WIFI;
    const pedir = falso.pedirArchivo;
    falso.pedirArchivo = vi.fn(async (...a) => {
      conexion = { type: 'cellular' };
      return pedir(...a);
    });
    const r = await correr({ ahora: () => LUNES_10, conexion: () => conexion, ...falso, disco });
    expect(r.estado).toBe('sin-wifi');
    expect(falso.bajados).toEqual([dir(1)]);
    expect(falso.funciones).toEqual(['core_course_get_contents']);
  });
});

describe('a night', () => {
  it('keeps the courses of the day and their files, and counts what came', async () => {
    await prender();
    const falso = campus({ 5: [seccion(1, [archivo(1, { peso: 300 }), archivo(2, { peso: 200 })])] });
    const r = await correr({ ahora: () => LUNES_10, conexion: () => WIFI, ...falso, disco });
    expect(r.estado).toBe('listo');
    expect(r.archivos).toBe(2);
    expect(falso.funciones).toEqual(['core_course_get_contents']);
    expect((await disco.recuperar('noche.contenido.5', 'clave-1')).datos.secciones[0].id).toBe(1);
    expect((await disco.archivoGuardado(dir(1), 'clave-1')).sello).toBe('1000:300');
    const registro = await leerDato('registro');
    expect(registro.dia).toBe('2026-11-23');
    expect(registro.bytes).toBe(r.bytes);
    expect(r.bytes).toBeGreaterThan(500);
    expect(registro.ultima).toMatchObject({ cuando: LUNES_10.getTime(), archivos: 2 });
  });

  it('stops at the 200 MB of the day, counting the earlier nights of that day; a new day starts again', async () => {
    await prender({ dias: { '2026-11-23': [5], '2026-11-24': [5] } });
    await ponerDato('registro', { dia: '2026-11-23', bytes: TOPE_DIARIO - 2000 });
    const falso = campus({ 5: [seccion(1, [archivo(1, { peso: 100 }), archivo(2, { peso: 5000 }), archivo(3, { peso: 10 })])] });
    const r = await correr({ ahora: () => LUNES_10, conexion: () => WIFI, ...falso, disco });
    expect(r.estado).toBe('tope');
    // The course answer counts too; the second file would go past it, and the third never comes.
    expect(falso.bajados).toEqual([dir(1)]);
    expect((await leerDato('registro')).bytes).toBeLessThanOrEqual(TOPE_DIARIO);
    const otroDia = campus({ 5: [seccion(1, [archivo(1, { peso: 100 }), archivo(2, { peso: 5000 }), archivo(3, { peso: 10 })])] });
    const r2 = await correr({ ahora: () => new Date(2026, 10, 24, 9, 0), conexion: () => WIFI, ...otroDia, disco });
    expect(r2.estado).toBe('listo');
    expect((await leerDato('registro')).dia).toBe('2026-11-24');
    expect((await leerDato('registro')).bytes).toBe(r2.bytes);
  });

  it('with no day planned, or a plan of another student, asks nothing', async () => {
    await prender({ dias: { '2026-11-30': [5] } });
    const falso = campus({});
    expect((await correr({ ahora: () => LUNES_10, conexion: () => WIFI, ...falso, disco })).estado).toBe('sin-clases');
    await ponerDato('plan', { alumno: 8, dias: { '2026-11-23': [5] } });
    expect((await correr({ ahora: () => LUNES_10, conexion: () => WIFI, ...falso, disco })).estado).toBe('sin-plan');
    expect(falso.llamar).not.toHaveBeenCalled();
  });
});

describe('what was already kept', () => {
  it('skips what a night brought in that version, and brings a new version of it', async () => {
    await prender();
    await disco.guardarDeNoche(dir(1), '1000:100', bytes(100), quien);
    await disco.guardarDeNoche(dir(2), '900:100', bytes(100), quien);
    const falso = campus({ 5: [seccion(1, [archivo(1), archivo(2)])] });
    await correr({ ahora: () => LUNES_10, conexion: () => WIFI, ...falso, disco });
    expect(falso.bajados).toEqual([dir(2)]);
    expect((await disco.fichaGuardada(dir(2), 'clave-1')).sello).toBe('1000:100');
  });

  it('never touches what the student kept: not a newer version, not their parts', async () => {
    await prender();
    await disco.guardarArchivoSinInternet(dir(1), '500:80', bytes(80), quien);
    await disco.guardarPartesSinInternet(dir(2), '500:100', { largo: 100, tramos: [{ desde: 0, blob: bytes(10) }] }, quien);
    const falso = campus({ 5: [seccion(1, [archivo(1), archivo(2), archivo(3)])] });
    await correr({ ahora: () => LUNES_10, conexion: () => WIFI, ...falso, disco });
    expect(falso.bajados).toEqual([dir(3)]);
    expect((await disco.archivoGuardado(dir(1), 'clave-1')).sello).toBe('500:80');
    expect((await disco.partesGuardadas(dir(2), 'clave-1')).sello).toBe('500:100');
    // And if it's kept between the look and the write, the write leaves it as it is.
    expect(await disco.guardarDeNoche(dir(1), '1000:100', bytes(100), quien)).toBe('suyo');
    expect((await disco.archivoGuardado(dir(1), 'clave-1')).sello).toBe('500:80');
  });

  it('a file the night brought and the student opened is theirs from then on', async () => {
    await disco.guardarDeNoche(dir(1), '1000:100', bytes(100), quien);
    expect((await disco.fichaGuardada(dir(1), 'clave-1')).noche).toBe(true);
    await disco.archivoGuardado(dir(1), 'clave-1');
    expect((await disco.fichaGuardada(dir(1), 'clave-1')).noche).toBe(false);
    expect(await disco.guardarDeNoche(dir(1), '2000:100', bytes(100), quien)).toBe('suyo');
  });

  it('makes room only among its own earlier files; when that is not enough, nothing goes and it stops', async () => {
    const tope = 100;
    await disco.guardarArchivoSinInternet(dir(1), 's', bytes(60), quien, tope);
    expect(await disco.guardarDeNoche(dir(2), 's', bytes(30), quien, tope)).toBe('guardado');
    // 60 + 30 + 30 is over: the night's earlier file goes, the student's stays.
    expect(await disco.guardarDeNoche(dir(3), 's', bytes(30), quien, tope)).toBe('guardado');
    expect(await disco.fichaGuardada(dir(2), 'clave-1')).toBeNull();
    expect(await disco.fichaGuardada(dir(1), 'clave-1')).toMatchObject({ noche: false });
    // 60 + 50 doesn't fit even without every night file: none of them goes.
    expect(await disco.guardarDeNoche(dir(4), 's', bytes(50), quien, tope)).toBe('lleno');
    expect(await disco.fichaGuardada(dir(3), 'clave-1')).toMatchObject({ noche: true });
    expect(await disco.fichaGuardada(dir(4), 'clave-1')).toBeNull();
    expect(await disco.fichaGuardada(dir(1), 'clave-1')).toMatchObject({ noche: false });
  });

  it('the night stops at the first file that finds no room', async () => {
    await prender();
    const falso = campus({ 5: [seccion(1, [archivo(1), archivo(2), archivo(3)])] });
    const lleno = { ...disco, guardarDeNoche: vi.fn(async () => 'lleno') };
    const r = await correr({ ahora: () => LUNES_10, conexion: () => WIFI, ...falso, disco: lleno });
    expect(r.estado).toBe('lleno');
    expect(falso.bajados).toEqual([dir(1)]);
  });

  it('skips the sections the student chose, and skipping one later deletes nothing kept', async () => {
    await prender();
    const cursos = { 5: [seccion(1, [archivo(1)]), seccion(2, [archivo(2)]), seccion(3, [archivo(3)], { uservisible: false })] };
    const primera = campus(cursos);
    await correr({ ahora: () => LUNES_10, conexion: () => WIFI, ...primera, disco });
    expect(primera.bajados).toEqual([dir(1), dir(2)]);
    await prender({ saltear: { 5: [2] } });
    const segunda = campus({ 5: [seccion(1, [archivo(1, { cuando: 2000 })]), seccion(2, [archivo(2, { cuando: 2000 })])] });
    await correr({ ahora: () => LUNES_10, conexion: () => WIFI, ...segunda, disco });
    expect(segunda.bajados).toEqual([dir(1)]);
    expect((await disco.archivoGuardado(dir(2), 'clave-1')).sello).toBe('1000:100');
  });
});

describe('the campus, from the night', () => {
  it('only the functions of DE_FONDO, and each one is a read of LECTURA', async () => {
    for (const f of DE_FONDO) expect(LECTURA.has(f)).toBe(true);
    const llamar = vi.fn(async () => []);
    for (const f of ['mod_assign_save_submission', 'enrol_self_enrol_user', 'core_message_send_instant_messages', 'core_webservice_get_site_info']) {
      await expect(pedirAlCampus(llamar, 't', f, {})).rejects.toThrow(/fuera de la lista/);
    }
    expect(llamar).not.toHaveBeenCalled();
    await pedirAlCampus(llamar, 't', 'core_course_get_contents', { courseid: 5 });
    expect(llamar).toHaveBeenCalledWith('t', 'core_course_get_contents', { courseid: 5 });
  });

  it('a key the campus no longer takes deletes everything of the night and stops the periodic sync', async () => {
    await prender();
    const soltar = vi.fn(async () => {});
    const llamar = vi.fn(async () => {
      throw new ErrorCampus('Tu sesión venció. Volvé a entrar.', 'sesion');
    });
    const r = await correr({ ahora: () => LUNES_10, conexion: () => WIFI, llamar, pedirArchivo: vi.fn(), disco, soltar });
    expect(r.estado).toBe('sesion');
    expect(soltar).toHaveBeenCalled();
    expect(await leerLlave()).toBeNull();
  });

  it('Salir while it runs: nothing more is written', async () => {
    await prender({ dias: { '2026-11-23': [5, 6] } });
    const falso = campus({ 5: [seccion(1, [archivo(1)])], 6: [seccion(2, [archivo(2)])] });
    const pedir = falso.pedirArchivo;
    falso.pedirArchivo = vi.fn(async (...a) => {
      await borrarDescargas();
      return pedir(...a);
    });
    const r = await correr({ ahora: () => LUNES_10, conexion: () => WIFI, ...falso, disco });
    expect(r.estado).toBe('sin-llave');
    expect(await disco.fichaGuardada(dir(1), 'clave-1')).toBeNull();
    expect(falso.funciones).toHaveLength(1);
    expect(await leerDato('registro')).toBeUndefined();
  });
});

describe('the key for the night', () => {
  it('is kept encrypted, with a browser key that cannot be taken out, and comes back as it was', async () => {
    expect(await guardarLlave('clave-secreta', 7)).toBe(true);
    const guardado = await leerDato('llave');
    expect(JSON.stringify(guardado)).not.toContain('clave-secreta');
    expect(new TextDecoder().decode(guardado.cifrada)).not.toContain('clave-secreta');
    expect(guardado.llave.extractable).toBe(false);
    expect(await leerLlave()).toEqual({ token: 'clave-secreta', alumno: 7 });
    await borrarDescargas();
    expect(await leerLlave()).toBeNull();
  });

  it('refuses what isn\'t a key and a student', async () => {
    expect(await guardarLlave('', 7)).toBe(false);
    expect(await guardarLlave('x', 0)).toBe(false);
    expect(await leerLlave()).toBeNull();
  });
});
