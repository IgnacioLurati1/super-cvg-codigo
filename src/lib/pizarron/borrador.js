// The photos of the class not saved yet, also in this browser's database: closing the tab, reloading it or the phone
// letting it go while the camera is open doesn't lose them. Keyed by student, each photo as it was taken and, apart,
// what the student did with it (corners, cleaning, what Gemini read). It goes once they're saved in a course, when one is
// deleted, and with Salir (sesion.js), for every student. Nothing here throws: without the database (private mode, no
// room) the photos stay only in the memory of the tab, as before, and the page asks before closing it.

const BASE = 'super-cvg-pizarron';
const ALMACEN = 'fotos';

let abierta = null;
// Bumped by Salir: a write that started before it does not bring anything back.
let generacion = 0;

function abrir() {
  if (!abierta) {
    const esta = new Promise((ok, mal) => {
      if (typeof indexedDB === 'undefined') return mal(new Error('sin base'));
      const pedido = indexedDB.open(BASE, 1);
      pedido.onupgradeneeded = () => {
        if (!pedido.result.objectStoreNames.contains(ALMACEN)) pedido.result.createObjectStore(ALMACEN);
      };
      pedido.onsuccess = () => {
        // Salir in another tab deletes the database: this one lets go, or the deleting waits for ever.
        pedido.result.onversionchange = () => {
          pedido.result.close();
          if (abierta === esta) abierta = null;
        };
        ok(pedido.result);
      };
      pedido.onerror = () => mal(new Error('sin base'));
      pedido.onblocked = () => mal(new Error('sin base'));
    });
    abierta = esta;
    esta.catch(() => {
      if (abierta === esta) abierta = null;
    });
  }
  return abierta;
}

const valido = (alumno) => alumno !== null && alumno !== undefined && String(alumno) !== '';
// Per student, one list: the photos kept, in order ({ ids }), and what the student did with each ({ fichas }).
const deIndice = (alumno) => `i:${alumno}`;
const deArchivo = (alumno, id) => `a:${alumno}:${id}`;
const indiceVacio = () => ({ ids: [], fichas: {} });
const indiceDe = (crudo) => (crudo && Array.isArray(crudo.ids) && crudo.fichas && typeof crudo.fichas === 'object' ? crudo : indiceVacio());

// One transaction: `fn` gets the store and a way to leave the answer, given once the transaction completes.
async function hacer(modo, fn) {
  const antes = generacion;
  const db = await abrir();
  if (antes !== generacion) throw new Error('salió');
  return new Promise((ok, mal) => {
    const tx = db.transaction(ALMACEN, modo);
    let respuesta;
    fn(tx.objectStore(ALMACEN), (r) => {
      respuesta = r;
    });
    tx.oncomplete = () => ok(respuesta);
    tx.onerror = () => mal(tx.error);
    tx.onabort = () => mal(tx.error);
  });
}

// Reads the student's list and hands it to `cambiar`, which changes it in place, in the same transaction.
const conIndice = (alumno, cambiar) =>
  hacer('readwrite', (s) => {
    const pedido = s.get(deIndice(alumno));
    pedido.onsuccess = () => {
      const indice = indiceDe(pedido.result);
      cambiar(indice, s);
      s.put(indice, deIndice(alumno));
    };
  });

/** Keeps the photo as it was taken. True if it was kept. */
export async function guardarFotoEnBorrador(alumno, id, archivo) {
  if (!valido(alumno) || !(archivo instanceof Blob)) return false;
  try {
    await conIndice(alumno, (indice, s) => {
      s.put(archivo, deArchivo(alumno, id));
      if (!indice.ids.includes(id)) indice.ids.push(id);
    });
    return true;
  } catch {
    return false;
  }
}

// What is kept of each photo besides the picture: only what the screen needs to show it as it was.
const fichaDe = (f) => ({
  nombre: typeof f.nombre === 'string' ? f.nombre : '',
  esquinas: f.esquinas,
  tipo: f.tipo ?? null,
  modo: f.modo ?? 'hoja',
  tiza: ['auto', 'remarcada', 'birome'].includes(f.tiza) ? f.tiza : 'como',
  intensidad: Number.isFinite(f.intensidad) ? Math.min(1, Math.max(0, f.intensidad)) : 0.5,
  grosor: Number.isFinite(f.grosor) ? Math.min(1, Math.max(0, f.grosor)) : 0.5,
  repasos: Array.isArray(f.repasos) ? f.repasos.slice(0, 200) : [],
  lectura: f.lectura?.estado === 'lista' ? { estado: 'lista', texto: String(f.lectura.texto ?? '') } : null,
});

/**
 * Leaves the draft as the list: in its order, with what each one has now; the ones no longer in it go, picture and all.
 * The ones still opening keep what they had. True if it was written.
 */
export async function guardarBorrador(alumno, fotos) {
  if (!valido(alumno)) return false;
  try {
    await conIndice(alumno, (indice, s) => {
      const actuales = fotos.map((f) => f.id);
      for (const id of indice.ids) {
        if (!actuales.includes(id)) {
          s.delete(deArchivo(alumno, id));
          delete indice.fichas[id];
        }
      }
      indice.ids = actuales.filter((id) => indice.ids.includes(id));
      for (const f of fotos) if (f.esquinas && indice.ids.includes(f.id)) indice.fichas[f.id] = fichaDe(f);
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * The photos kept of this student, in order: [{ id, archivo: File, ficha }], `ficha` null for one the tab closed before
 * it opened. Empty if there are none or it can't read.
 */
export async function leerBorrador(alumno) {
  if (!valido(alumno)) return [];
  try {
    return await hacer('readonly', (s, responder) => {
      const pedido = s.get(deIndice(alumno));
      pedido.onsuccess = () => {
        const indice = indiceDe(pedido.result);
        const fotos = [];
        responder(fotos);
        indice.ids.forEach((id, i) => {
          const blob = s.get(deArchivo(alumno, id));
          blob.onsuccess = () => {
            const b = blob.result;
            if (!(b instanceof Blob) || !b.size) return;
            const ficha = indice.fichas[id] ?? null;
            fotos[i] = { id, ficha, archivo: new File([b], ficha?.nombre || 'Pizarrón.jpg', { type: b.type || 'image/jpeg' }) };
          };
        });
      };
    }).then((fotos) => (fotos ?? []).filter(Boolean));
  } catch {
    return [];
  }
}

/** Deletes everything kept, of every student (Salir). Never fails. */
export async function borrarBorradores() {
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
      pedido.onblocked = () => ok();
    } catch {
      ok();
    }
  });
}
