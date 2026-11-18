// A run of the editor of the SQL lab, statement by statement, in the worker's database (sql.worker.js): what each
// statement gives goes out as it comes (`tabla`, `cambios`, and `dialecto` with what MySQL says another way).
//
// A MySQL script that makes tables (the course's, a Workbench one, the one «Crear SQL» writes from a DER) runs as
// «Cargar tu base» loads it: translated by mysql.js, each statement on the line it has in the student's text, so errors
// and results still point there. Everything else runs as it was written.
import { pistasDeDialecto } from './dialecto';
import { TOPE_FILAS } from './lenguajes';
import { deMysql, esMysql } from './mysql';
import { sentenciaDesde, tipoDeColumna } from './sqlBase';
import { lineaDelError } from './sqlLinea';

const HACE_TABLAS = /\b(?:CREATE\s+(?:TEMPORARY\s+)?TABLE|ALTER\s+TABLE)\b/i;
const CREA_TABLA = /^\s*CREATE\s+(?:TEMP\s+)?TABLE\b/i;

/**
 * The text SQLite runs for `codigo`: the same, or, for a MySQL script that makes tables, its translation with each
 * statement on its own line of `codigo`. A script with what SQLite doesn't have (routines, triggers, events) stays as
 * it was, so the dialect hints say what to change.
 */
export function codigoParaSqlite(codigo) {
  const texto = String(codigo ?? '');
  if (!HACE_TABLAS.test(texto) || !esMysql(texto)) return texto;
  let r;
  try {
    r = deMysql(texto);
  } catch {
    return texto;
  }
  if (r.afuera.length || !r.sentencias.length) return texto;
  let fuera = '';
  let linea = 1;
  for (const s of r.sentencias) {
    if (s.linea > linea) {
      fuera += '\n'.repeat(s.linea - linea);
      linea = s.linea;
    } else if (fuera) fuera += ' ';
    // A table rebuilt from its model goes on one line, so the next statement keeps its own.
    const sql = (!s.exacta && CREA_TABLA.test(s.sql) ? s.sql.replace(/\s*\n\s*/g, ' ') : s.sql).trim();
    fuera += sql.endsWith(';') ? sql : `${sql};`;
    linea += sql.match(/\n/g)?.length ?? 0;
  }
  return `${fuera}\n`;
}

// A cell as it can travel and be shown: a blob, only its size.
const celda = (v) => (v instanceof Uint8Array ? { bytes: v.byteLength } : v);

// In the practice database a student's script often meets tables with the same names (it is a real estate agency too):
// the error says so, and how to start from scratch.
const EN_PRACTICA = [
  [/^table (?:"((?:[^"]|"")+)"|`([^`]+)`|(\S+)) already exists/, (t) => `La base de práctica ya trae una tabla ${t}. Para arrancar de cero, vaciá la base en la pestaña Base.`],
  [/^table (?:"((?:[^"]|"")+)"|`([^`]+)`|(\S+)) has no column named/, (t) => `La tabla ${t} es la de la base de práctica, no la tuya. Vaciá la base en la pestaña Base y corré primero el archivo que crea tus tablas.`],
];

/** The hint for `error` when it ran in the practice database, or null. */
export function pistaDePractica(error) {
  for (const [re, texto] of EN_PRACTICA) {
    const m = re.exec(String(error ?? ''));
    if (m) return texto(m[1] ?? m[2] ?? m[3]);
  }
  return null;
}

/**
 * Runs `escrito` in `db`, sending what each statement gives with `enviar`. Returns { error, linea } (null, 0 if fine).
 * `enPractica`: `db` is the practice database, as it comes.
 */
export function correrEnBase(db, escrito, enviar, { enPractica = false } = {}) {
  const codigo = codigoParaSqlite(escrito);
  const cambiosHastaAhora = () => Number(db.exec('SELECT total_changes()')[0].values[0][0]);
  const it = db.iterateStatements(codigo);
  let resto = codigo;
  let error = null;
  let linea = 0;
  const tipoDe = tipoDeColumna(db);
  // What MySQL says another way: under the error, or after the statement that SQLite took doing something else.
  const fallo = (e, lugar) => {
    error = String(e?.message ?? e);
    linea = lineaDelError(codigo, lugar, error);
    const pistas = pistasDeDialecto(sentenciaDesde(codigo, lugar), error, { tipoDe });
    const practica = enPractica && pistaDePractica(error);
    if (practica) pistas.unshift(practica);
    if (pistas.length) enviar({ tipo: 'dialecto', linea, pistas, error: true });
  };
  try {
    for (;;) {
      const lugar = codigo.length - resto.length;
      let paso;
      try {
        paso = it.next();
      } catch (e) {
        fallo(e, lugar);
        break;
      }
      if (paso.done) break;
      const st = paso.value;
      try {
        const antes = cambiosHastaAhora();
        const columnas = st.getColumnNames();
        const filas = [];
        let recortada = false;
        while (st.step()) {
          if (filas.length >= TOPE_FILAS) {
            recortada = true;
            break;
          }
          filas.push(st.get().map(celda));
        }
        const posicion = lineaDelError(codigo, lugar, '');
        if (columnas.length) enviar({ tipo: 'tabla', linea: posicion, columnas, filas, recortada });
        else enviar({ tipo: 'cambios', linea: posicion, cambios: cambiosHastaAhora() - antes });
        const pistas = pistasDeDialecto(sentenciaDesde(codigo, lugar), '');
        if (pistas.length) enviar({ tipo: 'dialecto', linea: posicion, pistas });
      } catch (e) {
        fallo(e, lugar);
        break;
      }
      resto = it.getRemainingSQL();
    }
  } finally {
    // Frees the statement that was left halfway and the text.
    it.return();
  }
  return { error, linea };
}
