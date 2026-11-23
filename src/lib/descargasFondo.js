// «Descargas inteligentes» (Configuración): with Super CVG closed, the service worker brings the material of the courses
// the student has that day, so a classroom without signal still has it. It runs when Chrome fires `periodicsync` (TAG),
// about once a day, only for an app installed on Android. No imports: scripts/trabajador.mjs puts this file whole in
// sw.js, next to moodle.js (the reads, LECTURA) and sinInternetDisco.js (where it keeps). The page's side, deciding
// whether it is on and what each day has, is descargas.js.
// Its own database, apart from what is kept for without internet:
//   - `llave`: the campus key, encrypted with a key of the browser that can't be taken out of it (only this origin can
//     use it), with the student's number. Only while the setting is on and the student chose «Seguir conectado». Salir,
//     turning it off and a new key delete it. Never in a URL, a log, a cache name or a file.
//   - `plan`: what the page left for it, only numbers: the courses of each day, the sections the student skips and
//     «Ahorro de datos».
//   - `registro`: how much came today (TOPE_DIARIO) and the last download, for Configuración.
// Only on wifi or a cable, as the browser says (`navigator.connection.type`): a connection it doesn't name is not one.
// Only the functions of DE_FONDO, which are reads of LECTURA too: never a write.

/** The name of the periodic sync, and how often it asks for it (Chrome decides when). */
export const TAG = 'cvg-descargas';
export const CADA_MS = 24 * 60 * 60 * 1000;
/** What a day may bring at most, in bytes: the course answers and the files. */
export const TOPE_DIARIO = 200 * 1024 * 1024;
/** From this hour on, the classes are the next day's. */
export const DESDE_LA_NOCHE = 18;
/** The only functions of the campus the night asks for. Each one is in LECTURA of moodle.js (tested). */
export const DE_FONDO = new Set(['core_course_get_contents']);

const BASE = 'super-cvg-descargas';
const ALMACEN = 'datos';
const LENTAS = ['slow-2g', '2g', '3g'];

// ---------- When ----------

/** Wifi or a cable, as the browser says. Unknown is not. */
export const conWifi = (conexion) => Boolean(conexion) && (conexion.type === 'wifi' || conexion.type === 'ethernet');

/** Whether the night may download now: on wifi always, and «Ahorro de datos» as in puedeBajarTodo of trabajador.js
 * («Siempre» never; «Automático» not with the browser's saver or a slow connection; «Nunca» doesn't stop it). */
export function puedeBajarDeNoche(conexion, modo) {
  if (modo === 'siempre' || !conWifi(conexion)) return false;
  if (modo === 'nunca') return true;
  return conexion.saveData !== true && !LENTAS.includes(conexion.effectiveType);
}

const dos = (n) => String(n).padStart(2, '0');
/** A day as the calendar keys it (datos.js, claveDeFecha), with the clock of the device. */
export const claveDelDia = (fecha) => `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())}`;

/** The day whose classes are coming: today, or tomorrow from DESDE_LA_NOCHE on. */
export function diaQueToca(fecha = new Date()) {
  const d = new Date(fecha.getTime());
  if (d.getHours() >= DESDE_LA_NOCHE) d.setDate(d.getDate() + 1);
  return claveDelDia(d);
}

const esNumero = (n) => Number.isSafeInteger(n) && n > 0;

/** The courses of the day that is coming, by number, as the page planned them. */
export function materiasQueTocan(plan, fecha = new Date()) {
  const ids = plan?.dias?.[diaQueToca(fecha)];
  return Array.isArray(ids) ? [...new Set(ids.filter(esNumero))] : [];
}

// ---------- What ----------

/** The version of a campus file, the same selloDe of textosPdf.js gives the item aplanarContenido makes of it. */
export function selloDeArchivo(c) {
  const modificado = c?.timemodified || c?.timecreated || 0;
  if (!esNumero(modificado)) return null;
  return `${modificado}:${Number.isSafeInteger(c.filesize) ? c.filesize : 0}`;
}

/** The files of a course as the campus answers core_course_get_contents: the ones the page shows (aplanarContenido of
 * datos.js), out of the sections in `saltear`. Each { direccion, sello, peso }. */
export function archivosDelCurso(secciones, saltear = []) {
  const fuera = new Set(Array.isArray(saltear) ? saltear : []);
  const vistos = new Set();
  const archivos = [];
  for (const seccion of Array.isArray(secciones) ? secciones : []) {
    if (seccion?.uservisible === false || fuera.has(seccion?.id)) continue;
    for (const modulo of seccion.modules ?? []) {
      if (modulo?.uservisible === false || (modulo.modname !== 'resource' && modulo.modname !== 'folder')) continue;
      for (const c of modulo.contents ?? []) {
        if (c?.type !== 'file' || typeof c.fileurl !== 'string' || vistos.has(c.fileurl)) continue;
        const sello = selloDeArchivo(c);
        if (!sello) continue;
        vistos.add(c.fileurl);
        archivos.push({ direccion: c.fileurl, sello, peso: Number.isSafeInteger(c.filesize) && c.filesize > 0 ? c.filesize : 0 });
      }
    }
  }
  return archivos;
}

/** A read of the night: only DE_FONDO, through `llamar` of moodle.js, which only sends LECTURA. */
export function pedirAlCampus(llamar, token, funcion, parametros) {
  if (!DE_FONDO.has(funcion)) return Promise.reject(new Error(`Función fuera de la lista de la noche: ${funcion}`));
  return llamar(token, funcion, parametros);
}

// ---------- Its database ----------

function abrirBase() {
  return new Promise((ok, mal) => {
    if (typeof indexedDB === 'undefined') return mal(new Error('sin base'));
    const pedido = indexedDB.open(BASE, 1);
    pedido.onupgradeneeded = () => {
      if (!pedido.result.objectStoreNames.contains(ALMACEN)) pedido.result.createObjectStore(ALMACEN);
    };
    pedido.onsuccess = () => ok(pedido.result);
    pedido.onerror = () => mal(pedido.error);
    pedido.onblocked = () => mal(new Error('bloqueada'));
  });
}

// One request in its own transaction, the database closed right after: Salir in a tab can delete it at any moment.
async function enLaBase(modo, fn, siFalla) {
  let db;
  try {
    db = await abrirBase();
  } catch {
    return siFalla;
  }
  try {
    return await new Promise((ok) => {
      const tx = db.transaction([ALMACEN], modo);
      const pedido = fn(tx.objectStore(ALMACEN));
      tx.oncomplete = () => ok(modo === 'readonly' ? pedido.result : true);
      tx.onerror = () => ok(siFalla);
      tx.onabort = () => ok(siFalla);
    });
  } catch {
    return siFalla;
  } finally {
    db.close();
  }
}

export const leerDato = (clave) => enLaBase('readonly', (a) => a.get(clave), undefined);
export const ponerDato = (clave, valor) => enLaBase('readwrite', (a) => a.put(valor, clave), false);

/** Everything of the night downloads goes: the key, the plan and the record. Never fails. */
export function borrarDescargas() {
  if (typeof indexedDB === 'undefined') return Promise.resolve();
  return new Promise((ok) => {
    try {
      const pedido = indexedDB.deleteDatabase(BASE);
      pedido.onsuccess = () => ok();
      pedido.onerror = () => ok();
      pedido.onblocked = () => ok();
    } catch {
      ok();
    }
  });
}

/** Stops asking Chrome for the periodic sync: from the page, or from the worker itself. Never fails. */
export async function soltarPeriodico() {
  try {
    const registro = typeof self !== 'undefined' && self.registration ? self.registration : await navigator.serviceWorker?.getRegistration?.();
    await registro?.periodicSync?.unregister(TAG);
  } catch {
    // Without periodic sync there is nothing to stop.
  }
}

// ---------- The key ----------

/** Keeps the campus key for the night, encrypted with a new key that never leaves the browser. */
export async function guardarLlave(token, alumno) {
  if (typeof token !== 'string' || !token || !esNumero(alumno) || !globalThis.crypto?.subtle) return false;
  try {
    const llave = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cifrada = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, llave, new TextEncoder().encode(token));
    return await ponerDato('llave', { alumno, llave, iv, cifrada });
  } catch {
    return false;
  }
}

/** { token, alumno } kept for the night, or null. */
export async function leerLlave() {
  const r = await leerDato('llave');
  if (!r || !esNumero(r.alumno) || !r.llave || !r.iv || !r.cifrada || !globalThis.crypto?.subtle) return null;
  try {
    const claro = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: r.iv }, r.llave, r.cifrada);
    return { token: new TextDecoder().decode(claro), alumno: r.alumno };
  } catch {
    return null;
  }
}

// ---------- A night ----------

const pesoDe = (datos) => {
  try {
    return new TextEncoder().encode(JSON.stringify(datos) ?? '').length;
  } catch {
    return 0;
  }
};

/** One download of the night. Everything it needs comes in, so it can be tested alone; in sw.js, the real ones:
 *   `conexion()`: navigator.connection now, asked again before each request.
 *   `llamar`, `pedirArchivo`: the ones of moodle.js.
 *   `disco`: sinInternetDisco.js (recordar, fichaGuardada, guardarDeNoche, ARCHIVO_MAXIMO).
 *   `soltar`: stops the periodic sync, when the campus says the key is dead.
 * Gives back { estado, bytes, archivos }: 'listo', 'sin-llave', 'sin-plan', 'sin-wifi', 'sin-clases', 'tope' (the
 * day's 200 MB), 'lleno' (no room without touching the student's files), 'sesion' (dead key) or 'cortado'. */
export async function correr({ ahora = () => new Date(), conexion, llamar, pedirArchivo, disco, soltar = soltarPeriodico }) {
  const llave = await leerLlave();
  if (!llave) return { estado: 'sin-llave', bytes: 0, archivos: 0 };
  const plan = await leerDato('plan');
  if (!plan || plan.alumno !== llave.alumno) return { estado: 'sin-plan', bytes: 0, archivos: 0 };
  const libre = () => puedeBajarDeNoche(conexion(), plan.ahorro);
  if (!libre()) return { estado: 'sin-wifi', bytes: 0, archivos: 0 };
  const ids = materiasQueTocan(plan, ahora());
  if (!ids.length) return { estado: 'sin-clases', bytes: 0, archivos: 0 };

  const { token, alumno } = llave;
  const quien = { token, alumno };
  const hoy = claveDelDia(ahora());
  const antes = await leerDato('registro');
  let delDia = antes?.dia === hoy && Number.isFinite(antes.bytes) ? antes.bytes : 0;
  const esta = { cuando: ahora().getTime(), bytes: 0, archivos: 0 };
  const sumar = (n) => {
    delDia += n;
    esta.bytes += n;
  };
  // Salir or turning it off while this runs takes the key: from then on nothing is written.
  const sigue = async () => (await leerLlave())?.token === token;
  const anotar = async () => {
    if (await sigue()) await ponerDato('registro', { dia: hoy, bytes: delDia, ultima: { ...esta } });
  };
  let estado = 'listo';
  try {
    afuera: for (const id of ids) {
      if (delDia >= TOPE_DIARIO) {
        estado = 'tope';
        break;
      }
      if (!libre()) {
        estado = 'sin-wifi';
        break;
      }
      const secciones = await pedirAlCampus(llamar, token, 'core_course_get_contents', { courseid: id });
      sumar(pesoDe(secciones));
      if (!(await sigue())) {
        estado = 'sin-llave';
        break;
      }
      await disco.recordar(`noche.contenido.${id}`, { secciones }, { ...quien, cuando: Date.now() });
      for (const a of archivosDelCurso(secciones, plan.saltear?.[id])) {
        if (a.peso > disco.ARCHIVO_MAXIMO) continue;
        // What the student keeps stays as it is, also an older version; what an earlier night brought, if it's the same.
        const ficha = await disco.fichaGuardada(a.direccion, token);
        if (ficha && (!ficha.noche || ficha.sello === a.sello)) continue;
        if (delDia >= TOPE_DIARIO || delDia + a.peso > TOPE_DIARIO) {
          estado = 'tope';
          break afuera;
        }
        if (!libre()) {
          estado = 'sin-wifi';
          break afuera;
        }
        const blob = await (await pedirArchivo(token, a.direccion)).blob();
        sumar(blob.size);
        if (!(await sigue())) {
          estado = 'sin-llave';
          break afuera;
        }
        const guardado = await disco.guardarDeNoche(a.direccion, a.sello, blob, quien);
        if (guardado === 'lleno') {
          estado = 'lleno';
          break afuera;
        }
        if (guardado === 'guardado') esta.archivos += 1;
        await anotar();
      }
      await anotar();
    }
  } catch (error) {
    if (error?.codigo === 'sesion') {
      // A key the campus no longer takes: nothing of it stays, and Chrome stops waking the worker for it.
      await borrarDescargas();
      await soltar();
      return { estado: 'sesion', bytes: esta.bytes, archivos: esta.archivos };
    }
    estado = 'cortado';
  }
  await anotar();
  return { estado, bytes: esta.bytes, archivos: esta.archivos };
}
