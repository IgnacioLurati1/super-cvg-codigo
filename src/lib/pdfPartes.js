// A big campus PDF opened in the reader comes by parts: only what the pages being read need, for students on scarce
// mobile data. The campus (Moodle's byteserving) answers a Range with 206 and Content-Range, which it lets this origin
// read. The key goes in the body as for any file (moodle.js, pedirArchivo), never in the URL.
// Always safe: a whole answer (200) is used as it is, never asked twice; a part that doesn't fit (no Content-Range, a
// different size) brings the rest of the file in one request, and the reader keeps going with it. Without connection a
// part waits, and comes when the connection does (reintentar): the reader shows the pages it has (VisorPdf.jsx).
// With «Seguir conectado» the parts already here stay in this browser (archivos.js, sinInternet.js) and a PDF opened
// again starts from them.
// Only the reader uses this (VisorPdf.jsx through archivos.js, abrirPdf): everything else still asks for the whole file.

import { esArchivoDelCampus } from './moodle';

/** The size of each part pdf.js asks for. Small: pdf.js reads the description of every page when it opens a PDF, and
 * in most PDFs each one is next to its page, so each costs a part. With six PDFs of the campus, to show page 1: at
 * 512 KB, 38 to 100 % of the file; at 64 KB, 7 to 70 %; at 32 KB, 6 to 54 %, with a few more requests (6 to 84). */
export const TROZO = 32 * 1024;
/** Lighter than this, the whole file at once. */
export const PARTES_DESDE = 2 * 1024 * 1024;
/** Parts asked for at the same time, at most: the campus is shared by every student. */
export const EN_PARALELO = 2;
/** How long without asking for a part before the rest comes in the background (completarEnReposo). */
export const REPOSO_MS = 1500;
/** Without connection, how often the parts that wait are asked again (also when the browser says it is back). */
export const REINTENTO_MS = 20_000;

const abortado = () => new DOMException('Cerrado', 'AbortError');
class ParteRara extends Error {}
class SinDatos extends Error {}

/** Whether a drawing stopped because its data isn't here and there is no connection (mientrasHaya). */
export const esSinDatos = (error) => error instanceof SinDatos;

const faltaDeRedComun = (error) => error instanceof TypeError || (typeof navigator !== 'undefined' && navigator.onLine === false);

/** «bytes a-b/total» as numbers, or null if it isn't that. */
export function leerRango(cabecera) {
  const m = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(String(cabecera ?? '').trim());
  if (!m) return null;
  const [desde, hasta, total] = m.slice(1).map(Number);
  if (![desde, hasta, total].every(Number.isSafeInteger) || desde > hasta || hasta >= total) return null;
  return { desde, hasta, total };
}

/** Whether a file opened in the reader comes by parts: a campus file, known to be big, and not in the sample mode.
 * The copy kept for without internet is checked apart (archivos.js). */
export function convieneEnPartes(item, { demo = false } = {}) {
  return !demo && !item?.traer && esArchivoDelCampus(item?.direccion) && Number.isSafeInteger(item.peso) && item.peso > PARTES_DESDE;
}

/** Whether the rest comes by itself after the first pages, to keep it whole for without internet: only with «Seguir
 * conectado», without saving data and on a connection that doesn't cost (wifi, a cable, a computer). */
export function completarEnFondo({ recordada, ahorro, libre }) {
  return Boolean(recordada) && !ahorro && Boolean(libre);
}

// ---------- The bytes already here: runs { desde, blob }, in order, apart from each other ----------

const finDe = (t) => t.desde + t.blob.size;

/** The runs with one more: overlapping or touching runs become one. */
export function unirTramos(lista, nuevo) {
  const todos = [...lista, nuevo].filter((t) => t.blob.size > 0).sort((a, b) => a.desde - b.desde);
  const unidos = [];
  for (const t of todos) {
    const ultimo = unidos.at(-1);
    if (ultimo && t.desde <= finDe(ultimo)) {
      if (finDe(t) > finDe(ultimo)) unidos[unidos.length - 1] = { desde: ultimo.desde, blob: new Blob([ultimo.blob, t.blob.slice(finDe(ultimo) - t.desde)]) };
    } else unidos.push(t);
  }
  return unidos;
}

/** The run that has all of [desde, hasta), or null. */
export const tramoCon = (lista, desde, hasta) => lista.find((t) => t.desde <= desde && finDe(t) >= hasta) ?? null;

/** The smallest [a, b) inside [desde, hasta) with every byte missing from the runs in it, or null when none is. */
export function faltaEn(lista, desde, hasta) {
  let a = desde;
  for (const t of lista) if (t.desde <= a && finDe(t) > a) a = finDe(t);
  let b = hasta;
  for (const t of [...lista].reverse()) if (t.desde < b && finDe(t) >= b) b = t.desde;
  return a < b ? [a, b] : null;
}

/** Runs kept in the browser, checked: inside the file and as Blobs. Anything else is dropped. */
export function tramosValidos(tramos, largo) {
  if (!Array.isArray(tramos) || !Number.isSafeInteger(largo) || largo <= 0) return [];
  return tramos
    .filter((t) => t && Number.isSafeInteger(t.desde) && t.desde >= 0 && t.blob instanceof Blob && finDe(t) <= largo)
    .reduce((lista, t) => unirTramos(lista, { desde: t.desde, blob: t.blob }), []);
}

/**
 * The first part of a file. `pedir(rango, senal)` gives the campus' answer (pedirArchivo with the key), `rango` null for
 * the whole file. Gives { blob } when what came is the whole file (a 200, or a part that is all of it; a part that can't
 * be placed is dropped and the whole file is asked for once), or { partes }. `soloPartes`: what isn't parts isn't
 * downloaded, and it gives { sinPartes: true } (a very big file, that the student asks for by hand).
 */
export async function empezarEnPartes(pedir, { trozo = TROZO, senal, soloPartes = false, ...opciones } = {}) {
  const respuesta = await pedir(`bytes=0-${trozo - 1}`, senal);
  const sinPartes = () => {
    respuesta.body?.cancel().catch(() => {});
    return { sinPartes: true, como: 'sin partes' };
  };
  if (respuesta.status !== 206) return soloPartes ? sinPartes() : { blob: await respuesta.blob(), como: 'entero' };
  const tipo = respuesta.headers.get('content-type') || 'application/pdf';
  const rango = leerRango(respuesta.headers.get('content-range'));
  if (soloPartes && (!rango || rango.desde !== 0)) return sinPartes();
  const bytes = new Uint8Array(await respuesta.arrayBuffer());
  if (!rango || rango.desde !== 0 || rango.hasta !== bytes.length - 1) {
    if (soloPartes) return { sinPartes: true, como: 'sin partes' };
    return { blob: await (await pedir(null, senal)).blob(), como: 'otra vez' };
  }
  if (rango.total === bytes.length) return { blob: new Blob([bytes], { type: tipo }), como: 'entero' };
  return { partes: new Partes({ pedir, largo: rango.total, tramos: [{ desde: 0, blob: new Blob([bytes]) }], tipo, ...opciones }), como: 'partes' };
}

/**
 * A file coming by parts. `rango(desde, hasta)` gives those bytes (hasta not included), from what is here or from the
 * campus; `completar()` brings the rest in one request and gives the whole Blob; `cerrar()` stops everything.
 * `tramos`: runs already here (kept in the browser). `soloLoGuardado`: an older version kept, opened without connection:
 * nothing is asked to the campus, which has another one. `pedidos` counts the requests to the campus.
 * Listeners (escuchar): alLeer({ desde, bytes }) the rest as it comes, alSumar() new bytes here, alTerminar(blob),
 * alFallar(error) the file can't be shown, alCambiar() sinRed changed, alCerrar().
 */
export class Partes {
  #pedir;
  #tipo;
  #enParalelo;
  #reposoMs;
  #reintentoMs;
  #esFaltaDeRed;
  #soloLoGuardado;
  // 'partes', 'completo', 'roto' or 'cerrado'.
  #estado = 'partes';
  #control = new AbortController();
  #cola = [];
  #enCurso = new Set();
  // Parts that failed for lack of connection: asked again by reintentar.
  #esperando = [];
  #sinRed = false;
  #tramos;
  #completando = null;
  #forzado = false;
  #rarezas = 0;
  #blob = null;
  #error = null;
  #reloj = null;
  #relojRed = null;
  #enReposo = false;
  #oyentes = new Set();
  #alVolver = () => this.reintentar();

  constructor({ pedir, largo, tramos = [], tipo = 'application/pdf', enParalelo = EN_PARALELO, reposoMs = REPOSO_MS, reintentoMs = REINTENTO_MS, esFaltaDeRed = faltaDeRedComun, soloLoGuardado = false }) {
    this.#pedir = pedir;
    this.#tipo = tipo;
    this.#enParalelo = enParalelo;
    this.#reposoMs = reposoMs;
    this.#reintentoMs = reintentoMs;
    this.#esFaltaDeRed = esFaltaDeRed;
    this.#soloLoGuardado = soloLoGuardado;
    this.largo = largo;
    this.#tramos = tramosValidos(tramos, largo);
    this.pedidos = soloLoGuardado ? 0 : 1;
    if (typeof window !== 'undefined') window.addEventListener('online', this.#alVolver);
    if (this.#tramos[0]?.desde === 0 && this.#tramos[0].blob.size === largo) this.#terminar(this.#tramos[0].blob);
  }

  /** The whole file once it is here, or null. */
  get blob() {
    return this.#blob;
  }

  get estado() {
    return this.#estado;
  }

  /** Some part waits for the connection. */
  get sinRed() {
    return this.#sinRed;
  }

  /** The bytes from 0 that are here with no hole. */
  get seguidos() {
    if (this.#blob) return this.largo;
    const t = this.#tramos[0];
    return t?.desde === 0 ? t.blob.size : 0;
  }

  /** The runs here, to keep them (a copy of the list; the Blobs are not copied). */
  tramos() {
    return this.#blob ? [{ desde: 0, blob: this.#blob }] : this.#tramos.slice();
  }

  /** Those bytes, when they are all here. */
  async bytes(desde, hasta) {
    const t = this.#blob ? { desde: 0, blob: this.#blob } : tramoCon(this.#tramos, desde, hasta);
    if (!t) throw new SinDatos('No están');
    return new Uint8Array(await t.blob.slice(desde - t.desde, hasta - t.desde).arrayBuffer());
  }

  escuchar(oyente) {
    this.#oyentes.add(oyente);
    return () => this.#oyentes.delete(oyente);
  }

  #avisar(que, valor) {
    for (const o of [...this.#oyentes]) {
      try {
        o[que]?.(valor);
      } catch {
        // A listener that broke doesn't stop the others.
      }
    }
  }

  #sumar(desde, blob) {
    if (this.#blob || !blob.size) return;
    this.#tramos = unirTramos(this.#tramos, { desde, blob });
    this.#avisar('alSumar');
    const t = this.#tramos[0];
    if (t.desde === 0 && t.blob.size === this.largo) this.#terminar(t.blob);
  }

  rango(desde, hasta) {
    if (this.#blob || tramoCon(this.#tramos, desde, hasta)) return this.bytes(desde, hasta);
    if (this.#estado === 'cerrado') return Promise.reject(abortado());
    if (this.#estado === 'roto') return Promise.reject(this.#error);
    // While the rest comes, it brings this too: pdf.js gets it as it arrives. If that fails, the part is asked alone.
    if (this.#completando) return this.#completando.then(() => this.rango(desde, hasta), () => this.rango(desde, hasta));
    clearTimeout(this.#reloj);
    return new Promise((ok, mal) => {
      this.#cola.push({ desde, hasta, ok, mal });
      this.#seguir();
    });
  }

  #seguir() {
    while (this.#enCurso.size < this.#enParalelo && this.#cola.length) {
      const pedido = this.#cola.shift();
      if (this.#blob || tramoCon(this.#tramos, pedido.desde, pedido.hasta)) this.bytes(pedido.desde, pedido.hasta).then(pedido.ok, pedido.mal);
      else this.#traer(pedido);
    }
    this.#programarReposo();
  }

  async #traer(pedido) {
    const { desde, hasta, ok, mal } = pedido;
    const falta = faltaEn(this.#tramos, desde, hasta);
    if (!falta) {
      this.bytes(desde, hasta).then(ok, mal);
      return;
    }
    // An older version kept: the campus has another one, its parts wouldn't fit.
    if (this.#soloLoGuardado) {
      this.#esperar(pedido);
      return;
    }
    const control = new AbortController();
    const soltar = () => control.abort();
    this.#control.signal.addEventListener('abort', soltar);
    this.#enCurso.add(control);
    try {
      const [a, b] = falta;
      this.pedidos += 1;
      const respuesta = await this.#pedir(`bytes=${a}-${b - 1}`, control.signal);
      if (respuesta.status === 200) {
        // The whole file instead of the part: kept, never asked again.
        const blob = await respuesta.blob();
        if (blob.size !== this.largo) throw new ParteRara('Otro tamaño');
        this.#sumar(0, blob);
      } else {
        const rango = leerRango(respuesta.headers.get('content-range'));
        const bytes = await respuesta.blob();
        if (!rango || rango.desde !== a || rango.hasta !== b - 1 || rango.total !== this.largo || bytes.size !== b - a) throw new ParteRara('Parte rara');
        this.#sumar(a, bytes);
      }
      ok(await this.bytes(desde, hasta));
    } catch (error) {
      if (this.#blob || tramoCon(this.#tramos, desde, hasta)) this.bytes(desde, hasta).then(ok, mal);
      else if (this.#estado === 'cerrado') mal(abortado());
      else if (this.#esFaltaDeRed(error) || this.#rarezas > 0) this.#esperar(pedido);
      else {
        // A part that didn't fit: the rest of the file in one request, and this part from it.
        this.#rarezas += 1;
        this.completar({ forzado: true }).then(
          () => this.rango(desde, hasta),
          (e) => (this.#estado === 'roto' ? Promise.reject(e) : this.rango(desde, hasta)),
        ).then(ok, mal);
      }
    } finally {
      this.#control.signal.removeEventListener('abort', soltar);
      this.#enCurso.delete(control);
      this.#seguir();
    }
  }

  #esperar(pedido) {
    this.#esperando.push(pedido);
    if (!this.#sinRed) {
      this.#sinRed = true;
      this.#avisar('alCambiar');
    }
    clearTimeout(this.#relojRed);
    if (!this.#soloLoGuardado) this.#relojRed = setTimeout(() => this.reintentar(), this.#reintentoMs);
  }

  /** The parts that wait for the connection are asked again. */
  reintentar() {
    clearTimeout(this.#relojRed);
    if (!this.#sinRed || this.#estado !== 'partes' || this.#soloLoGuardado) return;
    this.#sinRed = false;
    this.#cola.push(...this.#esperando.splice(0));
    this.#avisar('alCambiar');
    this.#seguir();
  }

  /** `promesa`, or SinDatos if it is still waiting a moment after some part couldn't come for lack of connection: a page
   * that needs it doesn't hold the others (VisorPdf.jsx). */
  mientrasHaya(promesa, gracia = 400) {
    return new Promise((ok, mal) => {
      let hecho = false;
      let reloj = null;
      const terminar = (fn, valor) => {
        if (hecho) return;
        hecho = true;
        clearTimeout(reloj);
        dejar();
        fn(valor);
      };
      const revisar = () => {
        clearTimeout(reloj);
        if (this.#sinRed) reloj = setTimeout(() => this.#sinRed && terminar(mal, new SinDatos('Sin conexión')), gracia);
      };
      const dejar = this.escuchar({ alCambiar: revisar });
      revisar();
      promesa.then((v) => terminar(ok, v), (e) => terminar(mal, e));
    });
  }

  /** Brings the rest of the file in one request (from where the bytes with no hole end) and gives the whole Blob. Called
   * by the reader when it needs every page, by «Bajar archivo» and in the background (completarEnReposo). `forzado`: a
   * part didn't fit, so if the rest doesn't either the file can't be shown (alFallar). */
  completar({ forzado = false } = {}) {
    if (this.#blob) return Promise.resolve(this.#blob);
    if (this.#estado === 'cerrado') return Promise.reject(abortado());
    if (this.#estado === 'roto') return Promise.reject(this.#error);
    if (this.#soloLoGuardado) return Promise.reject(new TypeError('Solo lo guardado'));
    this.#forzado ||= forzado;
    if (this.#completando) return this.#completando;
    clearTimeout(this.#reloj);
    const esta = this.#traerResto().then(
      (blob) => blob,
      (error) => {
        this.#completando = null;
        if (this.#estado === 'cerrado') throw abortado();
        if (this.#blob) return this.#blob;
        if (this.#forzado && !this.#esFaltaDeRed(error)) this.#romper(error);
        else this.#programarReposo();
        throw error;
      },
    );
    this.#completando = esta;
    esta.catch(() => {});
    return esta;
  }

  async #traerResto() {
    const desde = this.seguidos;
    this.pedidos += 1;
    const respuesta = await this.#pedir(`bytes=${desde}-`, this.#control.signal);
    let en = 0;
    if (respuesta.status === 206) {
      const rango = leerRango(respuesta.headers.get('content-range'));
      if (!rango || rango.desde !== desde || rango.hasta !== this.largo - 1 || rango.total !== this.largo) throw new ParteRara('Resto raro');
      en = desde;
    }
    // A 200 is the whole file from 0: what is already here is skipped.
    let hasta = desde;
    const nuevos = [];
    const sumar = (bytes) => {
      const fin = en + bytes.length;
      if (fin > hasta) {
        const nuevo = bytes.subarray(Math.max(0, hasta - en));
        if (hasta + nuevo.length > this.largo) throw new ParteRara('Más largo');
        nuevos.push(nuevo);
        // pdf.js may take the buffer it gets to its worker: a copy, so the one kept stays.
        this.#avisar('alLeer', { desde: hasta, bytes: nuevo.slice() });
        hasta += nuevo.length;
      }
      en = fin;
    };
    try {
      const lector = respuesta.body?.getReader?.();
      if (lector) {
        for (;;) {
          const { value, done } = await lector.read();
          if (done) break;
          sumar(value);
        }
      } else sumar(new Uint8Array(await respuesta.arrayBuffer()));
    } finally {
      // What came stays, also when the connection was lost halfway.
      if (nuevos.length) this.#sumar(desde, new Blob(nuevos));
    }
    if (this.#blob) return this.#blob;
    throw new ParteRara('Incompleto');
  }

  #terminar(blob) {
    if (this.#blob) return;
    this.#blob = blob.type ? blob : new Blob([blob], { type: this.#tipo });
    this.#estado = 'completo';
    this.#tramos = [];
    clearTimeout(this.#reloj);
    clearTimeout(this.#relojRed);
    if (typeof window !== 'undefined') window.removeEventListener('online', this.#alVolver);
    // The parts still on the way or waiting aren't needed: they come from the whole file.
    for (const control of this.#enCurso) control.abort();
    for (const p of this.#esperando.splice(0)) this.bytes(p.desde, p.hasta).then(p.ok, p.mal);
    if (this.#sinRed) {
      this.#sinRed = false;
      this.#avisar('alCambiar');
    }
    this.#avisar('alTerminar', this.#blob);
  }

  #romper(error) {
    if (this.#estado !== 'partes') return;
    this.#estado = 'roto';
    this.#error = error;
    clearTimeout(this.#reloj);
    clearTimeout(this.#relojRed);
    for (const p of [...this.#cola.splice(0), ...this.#esperando.splice(0)]) p.mal(error);
    this.#avisar('alFallar', error);
  }

  /** The rest comes by itself once no part was asked for a while (the first pages are drawn). Never fails. */
  completarEnReposo() {
    this.#enReposo = true;
    this.#programarReposo();
  }

  #programarReposo() {
    clearTimeout(this.#reloj);
    if (!this.#enReposo || this.#estado !== 'partes' || this.#soloLoGuardado || this.#completando || this.#enCurso.size || this.#cola.length) return;
    this.#reloj = setTimeout(() => {
      if (!this.#enCurso.size && !this.#cola.length) this.completar().catch(() => {});
    }, this.#reposoMs);
  }

  /** The reader closed: nothing more is asked, what was on the way stops. */
  cerrar() {
    if (this.#estado === 'cerrado') return;
    this.#avisar('alCerrar');
    this.#estado = 'cerrado';
    clearTimeout(this.#reloj);
    clearTimeout(this.#relojRed);
    if (typeof window !== 'undefined') window.removeEventListener('online', this.#alVolver);
    this.#control.abort();
    for (const p of [...this.#cola.splice(0), ...this.#esperando.splice(0)]) p.mal(abortado());
    this.#oyentes.clear();
  }
}

/** The pdf.js side: a PDFDataRangeTransport (of the pdfjs given, so this file doesn't load it) fed by `partes`, while
 * the whole file isn't here (then pdf.js gets it as data). Closing the document lets go of it without stopping
 * `partes`, which belongs to the sheet that opened it. */
export async function transportePara(PDFDataRangeTransport, partes) {
  let hasta = partes.seguidos;
  const inicial = hasta > 0 ? await partes.bytes(0, hasta) : null;
  const transporte = new PDFDataRangeTransport(partes.largo, inicial, false);
  let vivo = true;
  // pdf.js reads the rest in order from where it has everything: what comes from somewhere else it asks as parts.
  const leer = ({ desde, bytes }) => {
    if (!vivo || desde !== hasta) return;
    transporte.onDataProgressiveRead(bytes);
    hasta += bytes.length;
  };
  const terminar = () => {
    if (!vivo) return;
    if (hasta >= partes.largo) return transporte.onDataProgressiveDone();
    partes.bytes(hasta, partes.largo).then((resto) => {
      leer({ desde: hasta, bytes: resto });
      if (vivo) transporte.onDataProgressiveDone();
    }, () => {});
    return undefined;
  };
  const dejar = partes.escuchar({ alLeer: leer, alTerminar: terminar });
  if (partes.blob) terminar();
  transporte.requestDataRange = (desde, fin) => {
    partes.rango(desde, fin).then(
      (bytes) => {
        if (!vivo) return;
        try {
          transporte.onDataRange(desde, bytes);
        } catch {
          // pdf.js already had it (it came with the rest) and stopped waiting for this part.
        }
      },
      () => {},
    );
  };
  transporte.abort = () => {
    vivo = false;
    dejar();
  };
  return transporte;
}
