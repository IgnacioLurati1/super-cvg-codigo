import * as Y from 'yjs';
import * as enc from 'lib0/encoding';
import { MAX_COPIA } from './guardadas';
import { pestanas } from './mesa';

// The copy of a live session that each browser keeps to come back with the same code (guardadoSesion.js), and that goes
// to the student's Drive (sesionesEnDrive.js). It is the session's Y.Doc as a Yjs update, with everything of the campus
// blanked out: the Materia tabs (names of the course, its sections and files), the session's Consultron (its answers
// quote the tabs, campus PDFs too) and the table's notices. What is kept: the chat and the tabs of the tools (document,
// whiteboard, flow diagram, Laboratorio, calculator, review cards, the Apunte and Resumen tabs without their bytes,
// which never were in the Y.Doc).
//
// Blanked, never deleted: each piece keeps its id with an empty value. Whoever still has the session open keeps the real
// one (Yjs never sends again what a browser already has), so a copy merged into a live table takes nothing from it.

// The tools whose tabs are kept. Anything else (Materia, or a kind this version doesn't know) is blanked.
export const GUARDADAS = new Set(['documento', 'pizarra', 'flujo', 'laboratorio', 'calculadora', 'apunte', 'repaso', 'resumen']);

// What comes back from a copy is written with this origin: the session sends it to the others as any change, and the
// table doesn't tell it as new (an old chat message is not news).
export const DE_LA_COPIA = 'copia-guardada';

const nulos = (n) => new Array(n).fill(null);

function enBlanco(content) {
  if (content instanceof Y.ContentType || content instanceof Y.ContentDeleted) return content;
  if (content instanceof Y.ContentString) return new Y.ContentString(' '.repeat(content.getLength()));
  if (content instanceof Y.ContentFormat) return new Y.ContentFormat(content.key, null);
  if (content instanceof Y.ContentEmbed) return new Y.ContentEmbed({});
  if (content instanceof Y.ContentBinary) return new Y.ContentBinary(new Uint8Array(0));
  if (content instanceof Y.ContentJSON) return new Y.ContentJSON(nulos(content.getLength()));
  return new Y.ContentAny(nulos(Math.max(1, content.getLength())));
}

/** The copy of `doc`, without the campus: a Yjs update (v1). */
export function copiaSinCampus(doc) {
  const tabs = new Set(pestanas(doc).filter((p) => GUARDADAS.has(p.tipo)).map((p) => p.id));
  const raices = new Map();
  const raizDe = (tipo) => {
    if (!raices.has(tipo)) raices.set(tipo, Y.findRootTypeKey(tipo));
    return raices.get(tipo);
  };
  const queda = (item) => {
    let tipo = item.parent;
    let clave = item.parentSub;
    while (tipo?._item) {
      clave = tipo._item.parentSub;
      tipo = tipo._item.parent;
    }
    if (!tipo) return false;
    const raiz = raizDe(tipo);
    if (raiz === 'chat') return true;
    if (raiz === 'pestanas') return tabs.has(clave);
    return raiz.startsWith('h:') && tabs.has(raiz.slice(2));
  };

  // The same as Y.encodeStateAsUpdate(doc), piece by piece: what doesn't stay goes with an empty value.
  const e = new Y.UpdateEncoderV1();
  const clientes = [...doc.store.clients.entries()].filter(([, s]) => s.length).sort((a, b) => b[0] - a[0]);
  enc.writeVarUint(e.restEncoder, clientes.length);
  for (const [cliente, piezas] of clientes) {
    enc.writeVarUint(e.restEncoder, piezas.length);
    e.writeClient(cliente);
    enc.writeVarUint(e.restEncoder, piezas[0].id.clock);
    for (const p of piezas) {
      if (p instanceof Y.Item && !queda(p)) {
        const blanca = Object.create(p);
        blanca.content = enBlanco(p.content);
        Y.Item.prototype.write.call(blanca, e, 0);
      } else p.write(e, 0);
    }
  }
  const borrados = Y.createDeleteSetFromStructStore(doc.store);
  const porCliente = [...borrados.clients.entries()].sort((a, b) => b[0] - a[0]);
  enc.writeVarUint(e.restEncoder, porCliente.length);
  for (const [cliente, tramos] of porCliente) {
    e.resetDsCurVal();
    enc.writeVarUint(e.restEncoder, cliente);
    enc.writeVarUint(e.restEncoder, tramos.length);
    for (const t of tramos) {
      e.writeDsClock(t.clock);
      e.writeDsLen(t.len);
    }
  }
  return e.toUint8Array();
}

/** A copy read back (from this browser or from Drive) as a Y.Doc, checked: whole, within the size, and blanked again
 * as if it were saved now. Null if it doesn't read. */
export function leerCopia(bytes) {
  if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > MAX_COPIA) return null;
  const doc = new Y.Doc();
  try {
    Y.applyUpdate(doc, bytes);
    // Missing pieces: a copy cut or tampered with.
    if (doc.store.pendingStructs || doc.store.pendingDs) throw new Error('incompleta');
    const limpia = new Y.Doc();
    Y.applyUpdate(limpia, copiaSinCampus(doc));
    return limpia;
  } catch {
    return null;
  } finally {
    doc.destroy();
  }
}

/** Two copies of the same session in one, checked; null if neither reads. */
export function juntarCopias(a, b) {
  const docA = a && leerCopia(a);
  const docB = b && leerCopia(b);
  if (!docA || !docB) {
    const una = docA ?? docB;
    if (!una) return null;
    const bytes = copiaSinCampus(una);
    una.destroy();
    return bytes;
  }
  Y.applyUpdate(docA, Y.encodeStateAsUpdate(docB));
  docB.destroy();
  const bytes = copiaSinCampus(docA);
  docA.destroy();
  return bytes;
}

/** Whether two copies have the same in them (what was written and what was deleted). */
export function mismaCopia(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  try {
    const igual = (x, y) => x.length === y.length && x.every((v, i) => v === y[i]);
    if (!igual(Y.encodeStateVectorFromUpdate(a), Y.encodeStateVectorFromUpdate(b))) return false;
    const { ds: dsA } = Y.decodeUpdate(a);
    const { ds: dsB } = Y.decodeUpdate(b);
    return Y.equalDeleteSets(dsA, dsB);
  } catch {
    return false;
  }
}

/** The names of the tabs kept in a copy, for the list of sessions to come back to (checked as on the table). */
export const pestanasDeCopia = (doc) => pestanas(doc).filter((p) => GUARDADAS.has(p.tipo)).map((p) => p.titulo);
