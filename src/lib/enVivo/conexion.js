import { abrirRed } from './red';
import { canalSupabase, canalesDelNavegador } from './canal';
import { crearSesion, COLORES } from './sesion';
import { fijarSesionEnVivo, sesionEnVivo } from './estado';
import { leerCodigo } from './codigo';
import { cargarPerfil } from '../campus';
import { olvidarOrigenes } from './origenes';
import { olvidarVistos } from './vistos';
import { esDemo } from '../modoDemo';
import { tokenActual } from '../sesion';

// Entering and leaving a live session. The code stays in this tab only (sessionStorage), so a reload comes back in;
// Salir of the site and «Salir de la sesión» forget it. What was on the table lives in the others' browsers.
export const MAX_PERSONAS = 10;
const GUARDADO = 'cl.envivo';

// In the flows and with ?envivo=local in dev, the tabs of this browser talk among themselves, without Realtime.
const enLocal = () => import.meta.env.MODE === 'flujos' || (import.meta.env.DEV && new URLSearchParams(location.search).get('envivo') === 'local');

/** «Juan Pérez» is «Juan P.»: enough to tell two Juanes apart, without the whole name. */
export async function nombreParaLaSesion() {
  try {
    const p = await cargarPerfil();
    const resto = (p.completo || '').replace(p.nombre, '').trim();
    return `${p.nombre}${resto ? ` ${resto[0].toUpperCase()}.` : ''}`.trim() || 'Alguien';
  } catch {
    return 'Alguien';
  }
}

const colorDe = (id) => COLORES[parseInt(id.slice(0, 4), 16) % COLORES.length];

// In the demo every browser is the same sample student: each one takes a name from who it is in the session.
const DEMO = ['Ana E.', 'Bruno M.', 'Carla P.', 'Diego E.', 'Elena M.', 'Fabián P.', 'Gala R.', 'Hugo S.', 'Inés T.', 'Juan V.', 'Lara C.', 'Mateo F.'];
export const nombreDeDemo = (persona) => DEMO[parseInt(persona.slice(4, 8), 16) % DEMO.length];

// Who this tab is in the session (sesion.js `yo.id`): kept with the code, so after a reload it is the same person. A
// duplicated tab brings a copy of both: the lock, held while the page lives, tells them apart and the copy is someone
// else. A reload lets go of it as the page goes.
const PERSONA = /^[0-9a-f]{16}$/;
let tomada = null;
function tomar(id) {
  if (tomada?.id === id) return tomada.promesa;
  soltar();
  const t = { id, soltar: () => {} };
  t.promesa = !globalThis.navigator?.locks
    ? Promise.resolve(true)
    : new Promise((listo) => {
      const corte = new AbortController();
      const reloj = setTimeout(() => corte.abort(), 3000);
      navigator.locks
        .request(`cvg-envivo-${id}`, { signal: corte.signal }, () => {
          clearTimeout(reloj);
          listo(true);
          return new Promise((r) => {
            t.soltar = r;
          });
        })
        .catch(() => {
          clearTimeout(reloj);
          listo(false);
        });
    });
  tomada = t;
  return t.promesa;
}
function soltar() {
  tomada?.soltar();
  tomada = null;
}
function leerGuardada() {
  try {
    return JSON.parse(sessionStorage.getItem(GUARDADO) || 'null');
  } catch {
    return null;
  }
}

/**
 * Into the session of `codigo`: just made here if `armada`, and `anfitrion` if this browser made it (now or before: it
 * can end it for everyone). Resolves with the session, or rejects with a known error
 * (`llena`, or no network).
 */
// Each entry has its turn: one that started later wins, and an earlier one still connecting closes itself, so a tab
// never stays in the session twice (a reload rejoins from two places at once).
let turno = 0;

// `persona`: who this browser was in that session, coming back to it by hand (guardadoSesion.js `prepararVuelta`).
// `copia`: the copy of an ended session, to open in this one just made (guardadoSesion.js `guardarMientras`).
export async function entrar({ codigo, nombre, anfitrion = false, armada = false, persona: deAntes = null, copia = null, alEstado = () => {} }) {
  const limpio = leerCodigo(codigo);
  if (!limpio) throw Object.assign(new Error('Ese código no es de una sesión. Son 12 letras y números.'), { conocido: true });
  // Read before closing: a reload can rejoin from two places at once, and both are the same person.
  const guardada = leerGuardada();
  cerrarActual();
  const mio = (turno += 1);
  const canal = enLocal() ? canalesDelNavegador() : await canalSupabase();
  let actual = null;
  const red = await abrirRed({
    codigo: limpio,
    canal,
    alEstado: (e) => {
      // Only while this is still the session: leaving closes the network, and that must not bring it back.
      if (actual && sesionEnVivo()?.sesion === actual.sesion) {
        actual.estado = e;
        fijarSesionEnVivo({ ...actual });
      }
      alEstado(e);
    },
  });
  let persona = guardada && leerCodigo(guardada.codigo) === limpio && PERSONA.test(guardada.persona) ? guardada.persona : PERSONA.test(deAntes ?? '') ? deAntes : red.yo;
  // Where the files of another session came from is of no use here.
  if (persona === red.yo) olvidarOrigenes();
  if (!(await tomar(persona))) {
    persona = red.yo;
    await tomar(persona);
  }
  if (mio !== turno) {
    red.cerrar();
    throw Object.assign(new Error('Otra entrada a la sesión la reemplazó.'), { conocido: true, reemplazada: true });
  }
  // Just made here: nothing on the table to wait for. A reload or a coming back of the one who made it does wait.
  const nueva = armada && leerCodigo(guardada?.codigo) !== limpio;
  const sesion = crearSesion({ red, nueva, yo: { id: persona, nombre: esDemo(tokenActual()) ? nombreDeDemo(persona) : String(nombre || 'Alguien').slice(0, 60), color: colorDe(persona), anfitrion } });
  actual = { sesion, codigo: limpio, anfitrion, estado: red.estado() };
  fijarSesionEnVivo(actual);
  // What this browser shared before a reload, and nobody else still has, comes back by itself.
  import('./recuperar').then((m) => m.recuperar(sesion)).catch(() => {});
  // The table is kept in this browser, to come back with the same code (guardadoSesion.js).
  import('./guardadoSesion').then((m) => m.guardarMientras(sesion, limpio, copia ? { copia } : undefined)).catch(() => {});
  try {
    sessionStorage.setItem(GUARDADO, JSON.stringify({ codigo: limpio, anfitrion, persona }));
  } catch {
    // Private mode: a reload leaves the session.
  }
  // A full session: whoever came last goes. The others are already there, so wait to hear them.
  await new Promise((r) => setTimeout(r, 2500));
  if (sesionEnVivo()?.sesion === sesion && sesion.otros().length >= MAX_PERSONAS) {
    salir();
    throw Object.assign(new Error(`La sesión ya tiene ${MAX_PERSONAS} personas.`), { conocido: true, llena: true });
  }
  return sesion;
}

function cerrarActual() {
  const actual = sesionEnVivo();
  if (actual) actual.sesion.cerrar();
  fijarSesionEnVivo(null);
}

export function salir() {
  cerrarActual();
  soltar();
  olvidarOrigenes();
  olvidarVistos();
  try {
    sessionStorage.removeItem(GUARDADO);
  } catch {
    // Nothing to forget.
  }
}

/** The session this tab was in before a reload: { codigo, anfitrion } or null. */
export function sesionGuardada() {
  const g = leerGuardada();
  return g && leerCodigo(g.codigo) ? { codigo: leerCodigo(g.codigo), anfitrion: Boolean(g.anfitrion) } : null;
}

/** After a reload, back into the session this tab was in. */
let volviendo = null;
export function volverSiHabia() {
  const guardada = sesionGuardada();
  if (!guardada || sesionEnVivo()) return Promise.resolve();
  volviendo ??= (async () => {
    try {
      await entrar({ ...guardada, nombre: await nombreParaLaSesion() });
    } catch {
      // Full or gone: the student enters again by hand.
    } finally {
      volviendo = null;
    }
  })();
  return volviendo;
}
