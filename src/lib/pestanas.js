// The tabs of this browser with the same session talk over a BroadcastChannel (same origin only): what the campus
// answered goes from one to the others (sesion.js), and the unread count comes from one clock for all (useSinLeer.js).
// Memory to memory: nothing of this reaches the disk. Every message carries a fingerprint of the key (sinInternet.js);
// a tab with another key, or with none (after Salir), ignores it. Without BroadcastChannel each tab works on its own.
import { huellaDe } from './sinInternet';

const CANAL = 'super-cvg-pestanas';

let canal;
const oyentes = new Map();
// The fingerprint of the last key asked for, so a message can be checked and sent without waiting most of the time.
let huella = { token: null, valor: null, promesa: Promise.resolve(null) };

/** The fingerprint of `token`, computed once per key. */
export function huellaDeLaSesion(token) {
  if (!token) return Promise.resolve(null);
  if (huella.token !== token) {
    const esta = { token, valor: null, promesa: null };
    esta.promesa = huellaDe(token).then((valor) => {
      esta.valor = valor;
      return valor;
    });
    huella = esta;
  }
  return huella.promesa;
}

function abrir() {
  if (canal !== undefined) return canal;
  canal = null;
  if (typeof BroadcastChannel === 'undefined') return canal;
  try {
    canal = new BroadcastChannel(CANAL);
    canal.onmessage = ({ data }) => {
      if (!data || typeof data !== 'object' || typeof data.tipo !== 'string' || typeof data.huella !== 'string') return;
      oyentes.get(data.tipo)?.forEach((f) => f(data));
    };
  } catch {
    canal = null;
  }
  return canal;
}

/** Whether this browser lets the tabs talk. */
export const hayPestanas = () => abrir() !== null;

function mandar(c, h, tipo, cuerpo) {
  try {
    c.postMessage({ ...cuerpo, tipo, huella: h });
  } catch {
    // Something that can't be copied to another tab: that tab asks for it itself.
  }
}

/** Tells the other tabs of the session of `token`. Sent at once when the fingerprint is already known (as when the tab
 * is closing), otherwise right after it is. */
export function avisarPestanas(token, tipo, cuerpo = {}) {
  const c = abrir();
  if (!c || !token) return;
  if (huella.token === token && huella.valor) return mandar(c, huella.valor, tipo, cuerpo);
  huellaDeLaSesion(token).then((h) => {
    if (h) mandar(c, h, tipo, cuerpo);
  });
}

// Each tab that asked the campus holds a shared lock named after the key while it lives, so a tab that opens knows
// whether another of the session can hand it what it has.
let presente = { token: null };
const nombreDePresencia = (h) => `super-cvg-sesion-${h}`;

function estarPresente(token, nombre) {
  if (presente.token === token) return;
  presente.soltar?.();
  const esta = { token, tiene: false, soltar: null };
  presente = esta;
  navigator.locks.request(nombre, { mode: 'shared' }, () => new Promise((ok) => {
    esta.tiene = true;
    esta.soltar = ok;
    // Let go before it came (Salir, another key).
    if (presente !== esta) ok();
  })).catch(() => {});
}

/** This tab is no longer of that session. */
export function dejarDeEstar() {
  presente.soltar?.();
  presente = { token: null };
}

/** How many other tabs of the session of `token` are open, or null when the browser can't tell. Marks this one too. */
export async function otrasPestanas(token) {
  if (!token || !abrir() || typeof navigator === 'undefined' || typeof navigator.locks?.query !== 'function') return null;
  const h = await huellaDeLaSesion(token);
  if (!h) return null;
  const nombre = nombreDePresencia(h);
  let otras;
  try {
    const { held = [] } = await navigator.locks.query();
    otras = held.filter((l) => l.name === nombre).length - (presente.token === token && presente.tiene ? 1 : 0);
  } catch {
    return null;
  }
  estarPresente(token, nombre);
  return Math.max(0, otras);
}

/** Calls `fn(mensaje)` for each message of `tipo` from a tab with the same key as `leerToken()` says this one has, now.
 * Gives back how to stop. */
export function escucharPestanas(tipo, leerToken, fn) {
  if (!abrir()) return () => {};
  const oyente = async (mensaje) => {
    const token = leerToken();
    if (!token) return;
    const h = huella.token === token && huella.valor ? huella.valor : await huellaDeLaSesion(token);
    // The key changed while checking (Salir, another student): the message is about a session that isn't this one.
    if (!h || h !== mensaje.huella || leerToken() !== token) return;
    fn(mensaje, token);
  };
  if (!oyentes.has(tipo)) oyentes.set(tipo, new Set());
  oyentes.get(tipo).add(oyente);
  return () => oyentes.get(tipo)?.delete(oyente);
}
