// The text of the PDFs already read (indicePdf.js), in this browser's database, so a file that did not change is not
// downloaded and read again on the next visit. Only the text of each page, never the file. Keyed by student and file,
// so a student never sees another's, and stamped with the version of the file in the campus (when it changed and its
// size): a stamp that does not match is a file that changed, and its text goes away. Salir deletes it all (sesion.js).
// Bounded: past TOPE_DISCO, what was used longest ago goes first. Nothing here throws: without the database (private
// mode, no room, an old browser) the text stays only in the memory of the tab, as before.

/** The text kept of all the PDFs of every student, in letters: some 60 MB, two bytes each. */
export const TOPE_DISCO = 30_000_000;

const BASE = 'super-cvg-textos';
const TEXTOS = 'textos';
// How long each one is and when it was last used, apart from the text: making room reads only these.
const FICHAS = 'fichas';

let abierta = null;
// Bumped by Salir: a write that started before it does not bring anything back.
let generacion = 0;

function abrir() {
  if (!abierta) {
    const esta = new Promise((ok, mal) => {
      if (typeof indexedDB === 'undefined') return mal(new Error('sin base'));
      const pedido = indexedDB.open(BASE, 1);
      pedido.onupgradeneeded = () => {
        const db = pedido.result;
        for (const almacen of [TEXTOS, FICHAS]) if (!db.objectStoreNames.contains(almacen)) db.createObjectStore(almacen);
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
}

const clave = (alumno, doc) => `${alumno}:${doc}`;
const largoDe = (paginas) => paginas.reduce((n, p) => n + p.length, 0);
const sonPaginas = (p) => Array.isArray(p) && p.every((t) => typeof t === 'string');

/** The version of a file of the campus, or null when the campus does not say it (then nothing of it goes to disk). */
export function selloDe(item) {
  if (!Number.isSafeInteger(item?.modificado) || item.modificado <= 0) return null;
  return `${item.modificado}:${Number.isSafeInteger(item.peso) ? item.peso : 0}`;
}

// Runs `fn` with both stores in one transaction. Gives back what `fn` left in `hecho.valor`, or `siFalla`.
async function enUna(fn, siFalla) {
  try {
    const db = await abrir();
    return await new Promise((ok) => {
      const hecho = { valor: siFalla };
      let tx;
      try {
        tx = db.transaction([TEXTOS, FICHAS], 'readwrite');
        fn(tx.objectStore(TEXTOS), tx.objectStore(FICHAS), hecho);
      } catch {
        // A database the browser closed under our feet: the next try opens it again.
        abierta = null;
        ok(siFalla);
        return;
      }
      tx.oncomplete = () => ok(hecho.valor);
      tx.onerror = () => ok(siFalla);
      tx.onabort = () => ok(siFalla);
    });
  } catch {
    return siFalla;
  }
}

/** The text of each page of a PDF read before, if its stamp matches: [texto] or null. A changed file loses its text. */
export async function textoGuardado(alumno, doc, sello) {
  if (alumno === null || alumno === undefined || !doc || !sello) return null;
  const k = clave(alumno, doc);
  return enUna((textos, fichas, hecho) => {
    const pedido = textos.get(k);
    pedido.onsuccess = () => {
      const guardado = pedido.result;
      if (!guardado) return;
      if (guardado.sello === sello && sonPaginas(guardado.paginas)) {
        hecho.valor = guardado.paginas;
        fichas.put({ largo: largoDe(guardado.paginas), usado: Date.now() }, k);
      } else {
        textos.delete(k);
        fichas.delete(k);
      }
    };
  }, null);
}

/** Keeps the text of each page of a PDF, with its stamp, in place of what there was. Makes room by the oldest used. */
export async function guardarTexto(alumno, doc, sello, paginas, tope = TOPE_DISCO) {
  if (alumno === null || alumno === undefined || !doc || !sello || !sonPaginas(paginas)) return;
  const largo = largoDe(paginas);
  if (largo > tope) return;
  const nacida = generacion;
  const k = clave(alumno, doc);
  await enUna((textos, fichas) => {
    // After Salir: nothing of the session that left.
    if (nacida !== generacion) return;
    textos.put({ sello, paginas }, k);
    fichas.put({ largo, usado: Date.now() }, k);
    const todas = [];
    const cursor = fichas.openCursor();
    cursor.onsuccess = () => {
      const c = cursor.result;
      if (c) {
        const { largo: l, usado: u } = c.value ?? {};
        todas.push({ k: c.key, largo: Number.isFinite(l) ? l : 0, usado: Number.isFinite(u) ? u : 0 });
        c.continue();
        return;
      }
      let total = todas.reduce((n, f) => n + f.largo, 0);
      for (const f of todas.sort((a, b) => a.usado - b.usado)) {
        if (total <= tope) break;
        if (f.k === k) continue;
        textos.delete(f.k);
        fichas.delete(f.k);
        total -= f.largo;
      }
    };
  });
}

/** Salir: the text of every student goes away from this browser (sesion.js). Never fails. */
export async function borrarTextosPdf() {
  generacion += 1;
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
    } catch {
      ok();
    }
  });
}
