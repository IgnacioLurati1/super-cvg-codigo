// «Cargar tu base»: a .sql, a .db or a .csv of the student, read here and built in the SQL worker (sqlBase.js). It
// stays only in the memory of the tab, as the practice one: it may have someone's data, and on a shared computer
// nothing of it remains. The motor keeps where it came from (`fuente`), so a new worker after «Parar» starts from it;
// leaving or another student coming in drops it.
import { decodificar } from './csv';
import { motorDe } from './motor';
import { alOlvidarLaboratorio } from './pendiente';
import { nombreValido } from './saneo';
import { esSqlite } from './sqlBase';

export const MAX_DB = 50 * 1024 * 1024;
export const MAX_TEXTO = 10 * 1024 * 1024;
export const ACEPTA = '.sql,.csv,.tsv,.txt,.db,.sqlite,.sqlite3,.db3,text/csv,text/plain,application/sql,application/x-sqlite3,application/vnd.sqlite3,application/octet-stream';

const sql = () => motorDe('sql');

/** What the screen shows of the database in use: its file and the tables added. Null: the practice one, as it came. */
export function resumenDe(fuente) {
  if (!fuente || (!fuente.origen && !fuente.tablas?.length)) return null;
  return { origen: fuente.origen ? { tipo: fuente.origen.tipo, nombre: fuente.origen.nombre } : null, tablas: (fuente.tablas ?? []).map((t) => t.tabla) };
}

/** How it went back after «Parar» or «Reiniciar la base». */
export const comoVolvio = (base) => (base?.origen?.tipo === 'vacia' ? 'La base volvió a estar vacía.' : base?.origen ? 'Tu base volvió a como la cargaste.' : base?.tablas?.length ? 'La base volvió a como estaba, con las tablas que sumaste.' : 'La base de práctica volvió a como venía.');

/**
 * A file the student chose, read here: { tipo: 'db', bytes } | { tipo: 'sql', texto } | { tipo: 'csv', texto }, with
 * its name, or { problema }: 'vacio', 'grande' or 'leer'.
 */
export async function leerArchivo(archivo) {
  // The name is shown on screen: one line, without what doesn't print (saneo.js).
  const nombre = nombreValido(String(archivo?.name ?? '')) || 'base';
  const ext = /\.([^.]+)$/.exec(nombre)?.[1]?.toLowerCase() ?? '';
  if (!archivo?.size) return { problema: 'vacio', nombre };
  let cabeza;
  try {
    cabeza = new Uint8Array(await archivo.slice(0, 16).arrayBuffer());
  } catch {
    return { problema: 'leer', nombre };
  }
  const db = esSqlite(cabeza);
  if (archivo.size > (db ? MAX_DB : MAX_TEXTO)) return { problema: 'grande', nombre, tope: db ? MAX_DB : MAX_TEXTO };
  let bytes;
  try {
    bytes = new Uint8Array(await archivo.arrayBuffer());
  } catch {
    return { problema: 'leer', nombre };
  }
  if (db) return { tipo: 'db', nombre, bytes };
  if (['db', 'sqlite', 'sqlite3', 'db3'].includes(ext)) return { problema: 'no-es-base', nombre };
  // A mysqldump with blobs isn't UTF-8 (they go as they are): read byte by byte, each text goes back to UTF-8 later
  // (mysql.js), and the blobs stay whole.
  if (ext !== 'csv' && ext !== 'tsv' && !esUtf8(bytes) && conBlobsDeMysql(bytes)) return { tipo: 'sql', nombre, texto: porBytes(bytes), crudo: true };
  const texto = decodificar(bytes);
  if (!texto.trim()) return { problema: 'vacio', nombre };
  if (ext === 'csv' || ext === 'tsv') return { tipo: 'csv', nombre, texto };
  if (ext === 'sql') return { tipo: 'sql', nombre, texto };
  // Another text: SQL if it starts like a script, a table if not.
  return { tipo: /^\s*(--|\/\*|(CREATE|INSERT|BEGIN|PRAGMA|DROP|WITH|SELECT)\b)/i.test(texto) ? 'sql' : 'csv', nombre, texto };
}

function esUtf8(bytes) {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

function porBytes(bytes) {
  const partes = [];
  for (let i = 0; i < bytes.length; i += 8192) partes.push(String.fromCharCode(...bytes.subarray(i, i + 8192)));
  return partes.join('');
}

const conBlobsDeMysql = (bytes) => /_binary\s*'|ENGINE=|LOCK TABLES/.test(porBytes(bytes.subarray(0, 1024 * 1024)));

async function cambiar(cambio, nueva) {
  const m = sql();
  let pistas = [];
  let afuera = [];
  const r = await m.correr('', {
    ...cambio,
    alEvento: (d) => {
      if (d.tipo === 'dialecto' && Array.isArray(d.pistas)) pistas = d.pistas.map(String).slice(0, 2);
      // A MySQL script: what SQLite doesn't have was left out (mysql.js).
      if (d.tipo === 'importado' && Array.isArray(d.afuera)) afuera = d.afuera.map((a) => ({ que: String(a?.que ?? ''), nombre: String(a?.nombre ?? '') }));
    },
  });
  if (r && !r.falla && !r.cortado && !r.error) {
    m.fuente = nueva;
    m.poner({ base: resumenDe(nueva) });
  }
  return r ? { ...r, pistas, afuera } : null;
}

/** The whole database, from a .sql or a .db read with `leerArchivo`, or the practice one again (null). */
export function usarBase(leido) {
  // `{ tipo: 'vacia' }`: a database without tables, for a script of the student's own (a DER's, say).
  const origen = leido?.tipo === 'vacia' ? { tipo: 'vacia', nombre: 'Base vacía' } : leido ? (leido.tipo === 'db' ? { tipo: 'db', nombre: leido.nombre, bytes: leido.bytes } : { tipo: 'sql', nombre: leido.nombre, texto: leido.texto, ...(leido.crudo ? { crudo: true } : {}) }) : null;
  const nueva = origen ? { origen, tablas: [] } : null;
  return cambiar({ base: nueva }, nueva);
}

/** One more table, from a CSV the student reviewed: { archivo, tabla, separador, encabezado, columnas, texto }. */
export function sumarTablaCsv(tabla) {
  const antes = sql().fuente ?? null;
  return cambiar({ tabla }, { origen: antes?.origen ?? null, tablas: [...(antes?.tablas ?? []), tabla] });
}

// Leaving: the student's database doesn't wait for the next one.
alOlvidarLaboratorio(() => {
  const m = sql();
  m.fuente = null;
  m.poner({ base: null });
});
