// The messages of Mensajes that wait for the signal. Mandar puts the text here and it goes at once; without signal
// (`navigator.onLine` false, or the send cut by the network before any answer) it waits as «Por mandar» and goes by
// itself when the network comes back. The rules of the writes of moodle.js hold: one tap, one message.
//   - A clear no from the campus is never sent again on its own: it shows as today, with Probar de nuevo.
//   - A send that may have reached the campus (the network fell after it left) is looked up first, with a read, and only
//     sent when it isn't there. When the look can't tell, it waits as «No sabemos si salió», for the student to say.
//   - One tab sends at a time (navigator.locks; without it, the claim in one transaction of the store), so two tabs of
//     the same session never send the same message.
// Where it waits: with «Seguir conectado», in this browser's database, with the owner and fingerprint of the key like
// sinInternet.js (a different student, or a key that isn't that one, never reads it); otherwise only in the memory of
// the tab. Salir deletes both (sesion.js). Only the text, who it goes to and their name: never a file.
import { huellaDe } from './sinInternet';

export const ESPERA = 'espera';
export const SALIENDO = 'saliendo';
export const DUDA = 'duda';
export const FALLO = 'fallo';
const ESTADOS = new Set([ESPERA, SALIENDO, DUDA, FALLO]);

/** A send another tab started and never finished, without navigator.locks to tell whether that tab still lives. */
export const ABANDONADO_MS = 10 * 60_000;

const numero = (n) => Number.isSafeInteger(n) && n > 0;
const texto = (t, largo) => typeof t === 'string' && t.length <= largo;
const destinoValido = (d) => Boolean(d) && (numero(d.conversacionId) || numero(d.personaId));

// What comes back from the store is checked like anything read from disk: one that isn't a message waiting is dropped.
function sano(x) {
  if (!x || typeof x !== 'object' || !texto(x.id, 80) || !x.id || !destinoValido(x.destino)) return null;
  if (!texto(x.texto, 20_000) || !x.texto.trim() || !ESTADOS.has(x.estado) || !Number.isFinite(x.cuando)) return null;
  return {
    id: x.id,
    destino: numero(x.destino.conversacionId) ? { conversacionId: x.destino.conversacionId } : { personaId: x.destino.personaId },
    nombre: texto(x.nombre, 300) ? x.nombre : '',
    texto: x.texto,
    cuando: x.cuando,
    despuesDe: Number.isSafeInteger(x.despuesDe) && x.despuesDe > 0 ? x.despuesDe : 0,
    estado: x.estado,
    tocado: x.tocado === true,
    espero: x.espero === true,
    error: texto(x.error, 500) ? x.error : '',
    codigo: texto(x.codigo, 80) ? x.codigo : '',
    ...(x.estado === SALIENDO && { tab: texto(x.tab, 80) ? x.tab : '', desde: Number.isFinite(x.desde) ? x.desde : 0 }),
  };
}
const sanos = (fila) => (Array.isArray(fila) ? fila.map(sano).filter(Boolean) : []);

// ---------- Whose it is ----------

/** The queue of `registro` ({ dueno: { alumno, huella }, fila }) for the key with that fingerprint, or nothing. */
export const filaDe = (registro, huella) => (huella && registro?.dueno?.huella === huella ? sanos(registro.fila) : []);

/** The record after `cambio(fila)`, which gives back the new queue or null to leave it. Only the owner's key changes it;
 * with `alumno`, another key takes it over empty (another student, or the same after Salir). Null: nothing to write. */
export function aplicar(registro, { huella, alumno } = {}, cambio) {
  if (!huella) return null;
  const suya = registro?.dueno?.huella === huella;
  if (!suya && !numero(alumno)) return null;
  const nueva = cambio(suya ? sanos(registro.fila) : []);
  if (!nueva && suya) return null;
  return { dueno: { alumno: suya ? registro.dueno.alumno : alumno, huella }, fila: sanos(nueva ?? []) };
}

// ---------- Where it waits ----------

/** In the memory of the tab: lost with it. */
export function guardadoEnMemoria() {
  let registro = null;
  return {
    async leer(huella) {
      return filaDe(registro, huella);
    },
    async cambiar(quien, cambio) {
      const nuevo = aplicar(registro, quien, cambio);
      if (nuevo) registro = nuevo;
      return filaDe(registro, quien.huella);
    },
    async borrar() {
      registro = null;
    },
  };
}

const BASE = 'super-cvg-por-mandar';
const ALMACEN = 'fila';
const REGISTRO = 'registro';

/** In this browser's database, for «Seguir conectado». Without it (private mode, an old browser), in memory. */
export function guardadoEnDisco() {
  const memoria = guardadoEnMemoria();
  let abierta = null;
  let generacion = 0;
  const abrir = () => {
    if (!abierta) {
      const esta = new Promise((ok, mal) => {
        if (typeof indexedDB === 'undefined') return mal(new Error('sin base'));
        const pedido = indexedDB.open(BASE, 1);
        pedido.onupgradeneeded = () => {
          if (!pedido.result.objectStoreNames.contains(ALMACEN)) pedido.result.createObjectStore(ALMACEN);
        };
        pedido.onsuccess = () => {
          const db = pedido.result;
          // Salir in another tab deletes the database: this one lets go of it, and the next use opens it again.
          const soltar = () => {
            db.close();
            if (abierta === esta) abierta = null;
          };
          db.onversionchange = soltar;
          db.onclose = soltar;
          ok(db);
        };
        pedido.onerror = () => mal(pedido.error);
        pedido.onblocked = () => mal(new Error('bloqueada'));
      });
      abierta = esta;
      esta.catch(() => {
        if (abierta === esta) abierta = null;
      });
    }
    return abierta;
  };
  // One transaction: what it reads and what it writes, with no other tab in between.
  const enUna = async (modo, fn) => {
    const db = await abrir();
    return new Promise((ok, mal) => {
      const tx = db.transaction(ALMACEN, modo);
      const almacen = tx.objectStore(ALMACEN);
      const hecho = { valor: null };
      const pedido = almacen.get(REGISTRO);
      pedido.onsuccess = () => fn(pedido.result, almacen, hecho);
      tx.oncomplete = () => ok(hecho.valor);
      tx.onerror = () => mal(tx.error);
      tx.onabort = () => mal(tx.error);
    });
  };
  return {
    async leer(huella) {
      try {
        return await enUna('readonly', (registro, _a, hecho) => {
          hecho.valor = filaDe(registro, huella);
        });
      } catch {
        return memoria.leer(huella);
      }
    },
    async cambiar(quien, cambio) {
      const nacida = generacion;
      try {
        return await enUna('readwrite', (registro, almacen, hecho) => {
          // After Salir: nothing of the session that left comes back.
          if (nacida !== generacion) return;
          const nuevo = aplicar(registro, quien, cambio);
          if (nuevo) almacen.put(nuevo, REGISTRO);
          hecho.valor = filaDe(nuevo ?? registro, quien.huella);
        });
      } catch {
        return memoria.cambiar(quien, cambio);
      }
    },
    async borrar() {
      generacion += 1;
      await memoria.borrar();
      const antes = abierta;
      abierta = null;
      try {
        (await antes)?.close();
      } catch {
        // It never opened: nothing to let go of.
      }
      if (typeof indexedDB === 'undefined') return;
      await new Promise((ok) => {
        try {
          const pedido = indexedDB.deleteDatabase(BASE);
          pedido.onsuccess = () => ok();
          pedido.onerror = () => ok();
          pedido.onblocked = () => ok();
        } catch {
          ok();
        }
      });
    },
  };
}

/** The two of this browser: Salir empties them (borrarPorMandar). */
export const MEMORIA = guardadoEnMemoria();
export const DISCO = guardadoEnDisco();

/** Salir: nothing waiting stays, in this tab or in the database. Never fails. */
export async function borrarPorMandar() {
  await Promise.all([MEMORIA.borrar(), DISCO.borrar()]).catch(() => {});
  oyentesDeSalir.forEach((f) => f());
}
const oyentesDeSalir = new Set();

// ---------- One tab at a time ----------

const CERROJO = 'super-cvg-por-mandar';

/** Runs `fn(propio)` with the lock of every tab of this browser. `propio` false: there is no lock (an old browser), and
 * the claim in one transaction is what keeps two tabs apart. */
export async function cerrojoDelNavegador(fn) {
  if (typeof navigator === 'undefined' || typeof navigator.locks?.request !== 'function') return fn(false);
  let corrio = false;
  try {
    return await navigator.locks.request(CERROJO, () => {
      corrio = true;
      return fn(true);
    });
  } catch (error) {
    if (corrio) throw error;
    return fn(false);
  }
}

const nuevoId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
const enLineaDelNavegador = () => typeof navigator === 'undefined' || navigator.onLine !== false;

// A failure that is the network, not an answer: offline, a cut fetch or the campus not answering in time.
const esDeLaRed = (error) => !enLineaDelNavegador() || error instanceof TypeError || /^(http_5\d\d|tiempo)$/.test(String(error?.codigo ?? ''));

/** What a failed send means for the queue. `sinVerificar`: campus.js could not look whether it got there anyway. */
export function despuesDelFallo(error, enLinea = enLineaDelNavegador()) {
  if (error?.sinVerificar && (!enLinea || error instanceof TypeError)) return ESPERA;
  if (error?.sinVerificar) return DUDA;
  return FALLO;
}

// ---------- The queue ----------

/** A queue of one tab. `sesion()`: { token, recordada } of now. `enviar(item)` sends it once and gives back what the
 * campus answered; `buscar(item)` looks whether it got there (what it found, or null). `explicar(error)`: its words.
 * `avisar(evento)`: to the other tabs, which call `deOtraPestana`. */
const NADA = Object.freeze([]);
const SIN_SENAL = Symbol('sin señal');

export function crearFila({
  sesion,
  enviar,
  buscar,
  explicar = (e) => String(e?.message ?? ''),
  memoria = MEMORIA,
  disco = DISCO,
  cerrojo = cerrojoDelNavegador,
  enLinea = enLineaDelNavegador,
  huella = huellaDe,
  avisar = () => {},
  ahora = () => Date.now(),
  tab = nuevoId(),
} = {}) {
  let items = NADA;
  let deQuien = null;
  const oyentes = new Set();
  const escuchas = new Set();
  // The ones this tab is sending right now: any other one marked as going out has no tab behind it.
  const enVuelo = new Set();
  let corriendo = null;
  let otraVez = false;

  const huellas = { token: null, valor: null };
  const huellaDeHoy = async (token) => {
    if (huellas.token !== token) {
      huellas.token = token;
      huellas.valor = huella(token);
    }
    return huellas.valor;
  };
  const guardado = (s) => (s.recordada ? disco : memoria);
  const fijar = (token, fila) => {
    if (sesion().token !== token) return;
    deQuien = token;
    items = fila;
    oyentes.forEach((f) => f());
  };
  const emitir = (evento) => escuchas.forEach((f) => f(evento));

  async function cambiar(cambio, alumno) {
    const s = sesion();
    if (!s.token) return [];
    const h = await huellaDeHoy(s.token);
    const fila = await guardado(s).cambiar({ huella: h, alumno }, cambio);
    fijar(s.token, fila);
    return fila;
  }

  async function refrescar() {
    const s = sesion();
    if (!s.token) {
      deQuien = null;
      items = NADA;
      oyentes.forEach((f) => f());
      return NADA;
    }
    const fila = await guardado(s).leer(await huellaDeHoy(s.token));
    fijar(s.token, fila);
    return fila;
  }

  // One message, once. It was perhaps there already (`tocado`): it is looked up before anything goes.
  async function mandarUno(x) {
    if (x.tocado) {
      try {
        const ya = await buscar(x);
        if (ya) return { estado: null, resultado: ya };
      } catch (error) {
        return esDeLaRed(error) ? { estado: ESPERA, tocado: true } : { estado: DUDA, tocado: true };
      }
    }
    try {
      return { estado: null, resultado: await enviar(x) };
    } catch (error) {
      const estado = despuesDelFallo(error, enLinea());
      if (estado === ESPERA) return { estado, tocado: true };
      return { estado, tocado: x.tocado || estado === DUDA, error: estado === FALLO ? explicar(error) : '', codigo: String(error?.codigo ?? '') };
    }
  }

  async function vuelta(propio) {
    for (;;) {
      const s = sesion();
      if (!s.token || !enLinea()) return;
      const h = await huellaDeHoy(s.token);
      const g = guardado(s);
      let tomado = null;
      const momento = ahora();
      const fila = await g.cambiar({ huella: h }, (lista) => {
        let cambio = false;
        const nueva = lista.map((x) => {
          const solo = x.estado === SALIENDO && !enVuelo.has(x.id) && (propio || momento - (x.desde ?? 0) > ABANDONADO_MS);
          if (!solo) return x;
          // Its tab closed while it was going out: it may have got there, so it is looked up before sending.
          cambio = true;
          return { ...x, estado: ESPERA, tocado: true, espero: true };
        });
        const i = nueva.findIndex((x) => x.estado === ESPERA);
        if (i >= 0) {
          tomado = { ...nueva[i], estado: SALIENDO, tab, desde: momento };
          nueva[i] = tomado;
          cambio = true;
        }
        return cambio ? nueva : null;
      });
      fijar(s.token, fila);
      if (!tomado) return;
      avisar({});
      enVuelo.add(tomado.id);
      let r;
      try {
        r = await mandarUno(tomado);
      } finally {
        enVuelo.delete(tomado.id);
      }
      // Salir, or another student, while it was on its way: nothing of the one who left is written.
      if (sesion().token !== s.token) return;
      const despues = await g.cambiar({ huella: h }, (lista) => {
        if (!r.estado) return lista.filter((x) => x.id !== tomado.id);
        return lista.map((x) => (x.id === tomado.id
          ? { ...x, estado: r.estado, tocado: r.tocado ?? x.tocado, espero: x.espero || r.estado === ESPERA, error: r.error ?? '', codigo: r.codigo ?? '' }
          : x));
      });
      fijar(s.token, despues);
      const evento = { tipo: r.estado ?? 'salio', item: { ...tomado, estado: r.estado ?? 'salio', espero: tomado.espero || r.estado === ESPERA }, resultado: r.resultado ?? null };
      emitir(evento);
      avisar(evento);
      // No signal: the rest waits too, also what came while this one tried.
      if (r.estado === ESPERA) return SIN_SENAL;
    }
  }

  /** Sends what waits, while there is signal, one at a time and in order. */
  function procesar() {
    if (corriendo) {
      otraVez = true;
      return corriendo;
    }
    corriendo = (async () => {
      let fin;
      do {
        otraVez = false;
        try {
          fin = await cerrojo(vuelta);
        } catch {
          // The database or the lock failed this time: the next signal tries again.
        }
      } while (otraVez && fin !== SIN_SENAL);
    })().finally(() => {
      corriendo = null;
    });
    return corriendo;
  }

  return {
    /** Puts a message tapped with Mandar in the queue and sends it if there is signal. `alumno`: the campus number, so
     * the queue knows whose it is. */
    async encolar({ destino, nombre = '', texto: escrito, despuesDe = 0, alumno }) {
      const item = {
        id: nuevoId(), destino, nombre, texto: escrito, cuando: ahora(), despuesDe, estado: ESPERA, tocado: false, espero: !enLinea(),
      };
      if (!sano(item)) throw new Error('Mensaje inválido');
      const fila = await cambiar((lista) => [...lista, item], alumno);
      if (!fila.some((x) => x.id === item.id)) throw new Error('No quedó en la fila');
      avisar({});
      procesar();
      return item;
    },
    /** Takes a message out before it goes: what it was, or null when it is already going out (or gone). */
    async cancelar(id) {
      let quitado = null;
      await cambiar((lista) => {
        const x = lista.find((i) => i.id === id);
        if (!x || x.estado === SALIENDO) return null;
        quitado = x;
        return lista.filter((i) => i.id !== id);
      });
      if (quitado) avisar({});
      return quitado;
    },
    /** Reintentar or Probar de nuevo: one more send of that message, looked up first when it may have got there. */
    async reintentar(id) {
      await cambiar((lista) => {
        const x = lista.find((i) => i.id === id);
        if (!x || (x.estado !== DUDA && x.estado !== FALLO)) return null;
        return lista.map((i) => (i === x ? { ...i, estado: ESPERA, tocado: i.tocado || i.estado === DUDA, espero: !enLinea(), error: '', codigo: '' } : i));
      });
      avisar({});
      return procesar();
    },
    procesar,
    refrescar,
    /** Another tab changed the queue: read again, and its news of the ones this tab showed come out here too. */
    async deOtraPestana(evento = {}) {
      const antes = new Set(items.map((x) => x.id));
      await refrescar();
      if (evento?.tipo && evento.item && antes.has(evento.item.id)) emitir(evento);
    },
    /** What waits now, for the key of this tab. */
    actuales: () => (deQuien && deQuien === sesion().token ? items : NADA),
    suscribir(f) {
      oyentes.add(f);
      return () => oyentes.delete(f);
    },
    /** `f({ tipo: 'salio' | ESPERA | DUDA | FALLO, item, resultado })` after each send. */
    escuchar(f) {
      escuchas.add(f);
      return () => escuchas.delete(f);
    },
    /** Salir happened: what this tab shows goes away too. */
    olvidar() {
      items = NADA;
      deQuien = null;
      oyentes.forEach((f) => f());
    },
  };
}

/** `f()` after Salir, in this tab. */
export function alBorrarPorMandar(f) {
  oyentesDeSalir.add(f);
  return () => oyentesDeSalir.delete(f);
}
