// Consultron with Gemini (Google's free plan), through the function supercvg-consultron of utn-apuntes. With its one
// permission (`todo`, «Usar Gemini»), everything Consultron answers goes to Gemini: the notes, the PDF, Classroom, their
// dates, their career and what it knows in general (Ignacio, 22/11/2026: «habilitá Gemini para absolutamente todo»,
// also on a phone). The Laboratorio's code mode is apart (codigo.js, Groq first). Without it, nothing leaves the
// computer, but for the two older permissions a student may still have on: the summaries of El Santo Resumen and their
// career. Gemini answers first, also on a computer that runs the model. When Gemini can't, the function asks Groq
// (Ignacio, 22/11/2026); with any other failure (the day's limit, both busy, offline), the model of the computer
// answers if it's in the browser.
import { useSyncExternalStore } from 'react';

export const NUBE = 'https://lomhlulbgfovtnljbqzp.supabase.co/functions/v1/supercvg-consultron';
const CLAVE = 'cl.consultron.gemini';
// What it waits for Google before the computer answers: the function itself gives up at 25 s and tries once more.
const ESPERA_MS = 45_000;
export const POR_DIA = 15;

const leer = () => {
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE) ?? 'null');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
};

let actual = { todo: false, resumenes: false, carrera: false, mesa: false, quedan: null, ...leer() };
const avisados = new Set();
const guardar = (cambio) => {
  actual = { ...actual, ...cambio };
  try {
    const { todo, resumenes, carrera, mesa, dispositivo, quedan, dia } = actual;
    localStorage.setItem(CLAVE, JSON.stringify({ todo, resumenes, carrera, mesa, dispositivo, quedan, dia }));
  } catch {
    // Without storage the permission lasts while the page is open.
  }
  for (const f of avisados) f();
};
const suscribir = (f) => {
  avisados.add(f);
  return () => avisados.delete(f);
};

// Google's day (California): when the free plan and the 15 of each student start again.
export const diaDeGoogle = (ahora = new Date()) => ahora.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });

export const usePermisosNube = () => useSyncExternalStore(suscribir, () => actual, () => actual);
export const quedanHoy = (p = actual) => (p.dia === diaDeGoogle() ? p.quedan : null);
/** Whether «Usar Gemini» is on: then the model of the computer doesn't load by itself (motor.js), only when Gemini
 * fails. */
export const usaGemini = (p = actual) => Boolean(p.todo);

/** Whether the student turned on Gemini for something. */
export const conNube = (p = actual) => Boolean(p.todo || p.resumenes || p.carrera);

/** The permissions a place lets Gemini answer with: `todo` everywhere and, of the older ones, by `enResumen` as
 * Charla's: beside a summary of El Santo Resumen (true), the summaries'; beside another file ('archivo', a PDF of the
 * campus or theirs), none; anywhere else, the summaries' and their career's (fuentes.js looks in both). */
export const permisosDelLugar = ({ enResumen = false } = {}) => ['todo', ...(enResumen === true ? ['resumenes'] : enResumen ? [] : ['resumenes', 'carrera'])];

/** Whether Gemini takes questions in a place: one of its permissions on. */
export const nubeEnElLugar = (p = actual, lugar = {}) => permisosDelLugar(lugar).some((c) => p[c]);

/**
 * Who answers a question: 'nube' (Gemini) when its pieces may go (`cual`, deLaNube), the student let them and has
 * questions left today, even with the model ready; else 'compu' if the model is ready (`conModelo`); else null.
 */
export function quienContesta(cual, { permisos = actual, conModelo = false } = {}) {
  if (cual && permisos[cual] && quedanHoy(permisos) !== 0) return 'nube';
  return conModelo ? 'compu' : null;
}

// Why the last question didn't come back from Gemini: the function's motivo, 'red', 'frenado' or null.
let motivo = null;
// Who answered the last one: 'gemini' or 'groq'.
let modelo = null;

/** Whether Groq answered the last question, because Gemini couldn't. */
export const contestoGroq = () => modelo === 'groq';

/** What Consultron says when neither Gemini nor the model of the computer takes a question. `fase`: of the model
 * (motor.js). */
export function sinCompu(fase = 'no-puede') {
  const tope = conNube() && quedanHoy() === 0 ? 'Por hoy no te quedan preguntas con Gemini.' : '';
  if (fase === 'no-puede') return tope || (actual.todo ? porQueNoNube() : 'Acá Consultron contesta con Gemini. Prendé «Usar Gemini» para preguntarle.');
  const compu = ['bajando', 'preparando', 'bajado'].includes(fase)
    ? 'Consultron todavía se está preparando en tu compu.'
    : fase === 'falla' ? 'Esto lo contesta Consultron en tu compu, que no pudo arrancar.' : 'Esto lo contesta Consultron en tu compu. Bajalo para preguntarle.';
  return tope ? `${tope} ${compu}` : compu;
}

/** Why Gemini didn't answer the last question, short, when the model of the computer isn't ready to answer it. */
export function porQueNoNube() {
  if (motivo === 'tope_alumno' || quedanHoy() === 0) return 'Por hoy no te quedan preguntas con Gemini.';
  if (motivo === 'agotado') return 'Gemini y Groq ya no contestan por hoy en todo el sitio. Probá mañana.';
  if (motivo === 'red') return 'Sin internet, Gemini no puede contestar.';
  return 'Gemini no responde. Probá de nuevo en un rato.';
}

/** Whether the last question didn't reach Gemini for lack of network. */
export const nubeSinRed = () => motivo === 'red';

/** Turns one permission on or off: `todo`, `resumenes`, `carrera` or `mesa` (the table of a live session, src/lib/enVivo/
 * consultronMesa.js). */
export const permitirNube = (cual, si) => guardar({ [cual]: Boolean(si) });

/**
 * Which permission a question needs, by the pieces it is answered with: 'resumenes' if all are summaries of El Santo
 * Resumen, 'carrera' if they are their career (with the guide of the site, which is public), or null: anything else
 * stays on the computer.
 */
export function deLaNube(elegidos) {
  if (!elegidos?.length) return null;
  const piezas = elegidos.map((e) => ({ doc: String(e.trozo?.doc ?? ''), fuente: e.trozo?.fuente ?? {} }));
  if (piezas.every(({ fuente }) => fuente.tipo === 'resumen' || fuente.tipo === 'oficial')) return 'resumenes';
  const deCarrera = ({ doc, fuente }) => doc === 'carrera' || (doc === 'pantalla' && fuente.nombre === 'Tu carrera');
  if (piezas.some(deCarrera) && piezas.every((p) => deCarrera(p) || p.doc.startsWith('sitio:'))) return 'carrera';
  return null;
}

/** The permission a question goes to Gemini with, if the student gave it and has questions left today; else null.
 * With `todo` on, any question: with pieces, without them (a greeting, what it knows in general) or for the data of an
 * exercise. */
export function nubePara(elegidos, permisos = actual) {
  const cual = permisos.todo ? 'todo' : deLaNube(elegidos);
  return quienContesta(cual, { permisos }) === 'nube' ? cual : null;
}

// The number of this browser, to count its 15 a day (and its pedidos of code, codigo.js). Made at random here: it says
// nothing of who they are.
export function dispositivo() {
  if (!actual.dispositivo) guardar({ dispositivo: crypto.randomUUID() });
  return actual.dispositivo;
}

const ROL = { system: 'sistema', user: 'alumno', assistant: 'consultron' };

/**
 * Asks Gemini with the messages Consultron would give the model ({ role, content }). Resolves with the text, or null
 * if it should be answered on the computer (no permission, the day's limit, Google busy, offline, stopped).
 */
export async function preguntarNube(mensajes, cual, { senal, pedir = (...a) => fetch(...a) } = {}) {
  motivo = null;
  modelo = null;
  if (!cual || !actual[cual] || quedanHoy() === 0) return null;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    motivo = 'red';
    return null;
  }
  const tiempo = AbortSignal.timeout(ESPERA_MS);
  try {
    const r = await pedir(NUBE, {
      method: 'POST',
      // A text body keeps it a simple request: no preflight.
      body: JSON.stringify({ dispositivo: dispositivo(), mensajes: mensajes.map((m) => ({ rol: ROL[m.role], texto: m.content })) }),
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: senal ? AbortSignal.any([senal, tiempo]) : tiempo,
    });
    const d = await r.json().catch(() => null);
    if (d?.ok && typeof d.texto === 'string' && d.texto.trim()) {
      guardar({ quedan: Number(d.quedan) || 0, dia: diaDeGoogle() });
      modelo = d.modelo === 'groq' ? 'groq' : 'gemini';
      return d.texto;
    }
    motivo = typeof d?.motivo === 'string' ? d.motivo : 'error';
    if (d?.motivo === 'tope_alumno') guardar({ quedan: 0, dia: diaDeGoogle() });
    return null;
  } catch {
    // Offline only when the browser says so: with a connection, it's the service that didn't answer.
    if (senal?.aborted) motivo = 'frenado';
    else motivo = typeof navigator !== 'undefined' && navigator.onLine === false ? 'red' : 'error';
    return null;
  }
}
