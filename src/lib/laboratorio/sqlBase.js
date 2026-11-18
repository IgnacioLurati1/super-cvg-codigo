// The database the SQL lab works on, built in its worker: the practice one, or the student's own from a file (a .db as
// it is, a .sql run as a script) plus the tables they added from CSVs. The worker keeps where it came from (`fuente`),
// so «Reiniciar la base» and a new worker after «Parar» build it again the same way.
//
// fuente: null (the practice one) or { origen, tablas }. origen: null, { tipo: 'db', nombre, bytes } or
// { tipo: 'sql', nombre, texto, crudo }: a script for MySQL goes through mysql.js first (`crudo`, see tuBase.js). tablas: [{ archivo, tabla, separador, encabezado, columnas: [{ nombre, tipo }], texto }].
import { BASE_DE_EJEMPLO } from './baseDeEjemplo';
import { leerCsv, TIPOS, valoresDeFila } from './csv';
import { pistasDeDialecto } from './dialecto';
import { deMysql, esMysql } from './mysql';
import { comienzo, final, lineaDelError } from './sqlLinea';

export const comillas = (nombre) => `"${String(nombre).replace(/"/g, '""')}"`;
const filasDe = (db, sql) => db.exec(sql)[0]?.values ?? [];

/** The type a column was declared with, to explain an error (dialecto.js). */
export const tipoDeColumna = (db) => (tabla, columna) => {
  try {
    return String(filasDe(db, `PRAGMA table_info(${comillas(tabla)})`).find((c) => String(c[1]).toLowerCase() === String(columna).toLowerCase())?.[2] ?? '');
  } catch {
    return '';
  }
};

/** The tables and views there are now, with their columns and foreign keys: the student may have made more. */
export function esquemaDe(db) {
  const lista = filasDe(db, "SELECT name, type FROM sqlite_schema WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY type = 'view', name");
  return lista.slice(0, 50).map(([nombre, tipo]) => {
    const columnas = filasDe(db, `PRAGMA table_info(${comillas(nombre)})`).map(([, columna, clase, , , clave]) => ({ nombre: String(columna), tipo: String(clase || ''), clave: Number(clave) || 0 }));
    const porId = new Map();
    if (tipo === 'table') {
      for (const [id, , destino, desde, hacia] of filasDe(db, `PRAGMA foreign_key_list(${comillas(nombre)})`)) {
        if (!porId.has(id)) porId.set(id, { tabla: String(destino), desde: [], hacia: [] });
        porId.get(id).desde.push(String(desde));
        porId.get(id).hacia.push(hacia === null ? null : String(hacia));
      }
    }
    const foraneas = [...porId.values()].map((f) => ({ ...f, hacia: f.hacia.every((h) => h === null) ? null : f.hacia }));
    return { nombre: String(nombre), vista: tipo === 'view', columnas, foraneas };
  });
}

/**
 * Runs a whole script, statement by statement, without keeping what they return. Returns null if it went well, or where
 * and why it stopped: { error, linea, pistas }.
 */
export function correrScript(db, texto) {
  const it = db.iterateStatements(texto);
  let resto = texto;
  try {
    for (;;) {
      const lugar = texto.length - resto.length;
      let paso;
      try {
        paso = it.next();
      } catch (e) {
        return fallaEn(db, texto, lugar, e);
      }
      if (paso.done) return null;
      try {
        while (paso.value.step());
      } catch (e) {
        return fallaEn(db, texto, lugar, e);
      }
      resto = it.getRemainingSQL();
    }
  } finally {
    it.return();
  }
}

/** The statement that starts at `lugar` of `texto`, past spaces and comments. */
export function sentenciaDesde(texto, lugar) {
  const inicio = comienzo(texto, lugar);
  return texto.slice(inicio, final(texto, inicio));
}

function fallaEn(db, texto, lugar, e) {
  const error = String(e?.message ?? e);
  return { error, linea: lineaDelError(texto, lugar, error), pistas: pistasDeDialecto(sentenciaDesde(texto, lugar), error, { tipoDe: tipoDeColumna(db) }) };
}

/** Adds the table of a CSV to `db`, in one go: if something fails, nothing of it stays. */
export function sumarTabla(db, t) {
  const columnas = t.columnas.map((c) => ({ nombre: String(c.nombre), tipo: TIPOS.includes(c.tipo) ? c.tipo : 'TEXT' }));
  const filas = leerCsv(t.texto, t.separador);
  const datos = t.encabezado ? filas.slice(1) : filas;
  db.exec('SAVEPOINT csv');
  try {
    db.exec(`CREATE TABLE ${comillas(t.tabla)} (${columnas.map((c) => `${comillas(c.nombre)} ${c.tipo}`).join(', ')})`);
    const st = db.prepare(`INSERT INTO ${comillas(t.tabla)} VALUES (${columnas.map(() => '?').join(', ')})`);
    try {
      for (const f of datos) st.run(valoresDeFila(f, columnas, t.separador));
    } finally {
      st.free();
    }
    db.exec('RELEASE csv');
  } catch (e) {
    db.exec('ROLLBACK TO csv');
    db.exec('RELEASE csv');
    throw e;
  }
  return datos.length;
}

// A .db saved with WAL says so in its header, and in memory it wouldn't open: it's read as a classic one.
function bytesParaAbrir(bytes) {
  const b = new Uint8Array(bytes);
  if (b.length > 19 && b[18] === 2 && b[19] === 2) {
    const copia = b.slice();
    copia[18] = 1;
    copia[19] = 1;
    return copia;
  }
  return b;
}

export const esSqlite = (bytes) => new TextDecoder('latin1').decode(new Uint8Array(bytes).subarray(0, 16)) === 'SQLite format 3\0';

/** A MySQL script, translated (mysql.js), statement by statement: null if it went well, or where it stopped in it. A
 * view SQLite doesn't take goes to `afuera`. */
function correrDeMysql(db, sentencias, afuera) {
  for (const s of sentencias) {
    const falla = correrScript(db, s.sql);
    if (falla && s.vista) afuera.push({ que: 'vista', nombre: s.vista, linea: s.linea });
    else if (falla) return { ...falla, linea: s.exacta ? s.linea + falla.linea - 1 : s.linea };
  }
  return null;
}

/**
 * A new database from `fuente`. Returns { db, afuera } or, if its origin doesn't build, { error, linea, pistas,
 * noEsBase } (`linea` in the .sql). `afuera`: what of a MySQL script SQLite doesn't have (mysql.js). A CSV table that
 * no longer fits (its name is taken) is left out.
 */
export function armarBase(SQL, fuente) {
  const origen = fuente?.origen ?? null;
  let db;
  let afuera = [];
  if (origen?.tipo === 'db') {
    if (!esSqlite(origen.bytes)) return { noEsBase: true };
    try {
      db = new SQL.Database(bytesParaAbrir(origen.bytes));
      db.exec('SELECT count(*) FROM sqlite_schema');
    } catch {
      db?.close();
      return { noEsBase: true };
    }
  } else {
    db = new SQL.Database();
    if (!origen) db.exec(BASE_DE_EJEMPLO);
    else {
      const texto = String(origen.texto ?? '');
      // MySQL loads a dump with its foreign keys off: the tables come in any order.
      const mysql = origen.crudo || esMysql(texto) ? deMysql(texto, { crudo: Boolean(origen.crudo) }) : null;
      db.exec(`PRAGMA foreign_keys = ${mysql ? 'OFF' : 'ON'}`);
      afuera = mysql ? [...mysql.afuera] : [];
      const falla = mysql ? correrDeMysql(db, mysql.sentencias, afuera) : correrScript(db, texto);
      if (falla) {
        db.close();
        return falla;
      }
    }
  }
  try {
    db.exec('PRAGMA foreign_keys = ON');
  } catch {
    // Inside a transaction left open by the script: it stays as it was.
  }
  for (const t of fuente?.tablas ?? []) {
    try {
      sumarTabla(db, t);
    } catch {
      // Its name is taken in the database as it came: that table is left out.
    }
  }
  return { db, afuera };
}
