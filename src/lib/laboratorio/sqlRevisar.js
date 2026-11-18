// The SQL of a file checked while the student types, without running it (revisar.js): each statement is prepared in a
// database apart, with the tables of the tab's one and none of its rows, so the tab's database isn't touched. There
// only what makes, changes or drops a table, a view, an index or a trigger runs, so the next statements find them;
// never a SELECT or what fills a table (a recursive query could go on forever). The first error, as a run says it.
import { sinTextos } from './dialecto';
import { lineaDelError } from './sqlLinea';

const ESTRUCTURA = /^\s*(?:create\s+(?:temp(?:orary)?\s+)?(?:table|(?:unique\s+)?index|view|trigger)|drop|alter)\b/i;
const YA_ESTA = /^table (?:"((?:[^"]|"")+)"|(\S+)) already exists/;

const comillas = (nombre) => `"${nombre.replace(/"/g, '""')}"`;

/** In `prueba`, the tables, views, indexes and triggers of `db`, empty. */
function copiarEstructura(db, prueba) {
  const filas = db?.exec("SELECT sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY rowid")[0]?.values ?? [];
  for (const [sql] of filas) {
    try {
      prueba.run(String(sql));
    } catch {
      // What doesn't come again (a view of a table that went) stays out.
    }
  }
}

/** { error, linea } of the first statement of `codigo` that SQLite doesn't take, or { error: null, linea: 0 }. */
export function revisarSql(SQL, db, codigo) {
  const texto = String(codigo ?? '');
  const prueba = new SQL.Database();
  // A table made from a SELECT doesn't run: what names it or its columns can't be checked.
  let sinRevisar = false;
  // Where a table the database had is made again: the file's replaces it, once.
  const rehechas = new Set();
  let r = { error: null, linea: 0 };
  let it = null;
  try {
    copiarEstructura(db, prueba);
    let resto = texto;
    it = prueba.iterateStatements(resto);
    for (;;) {
      const lugar = texto.length - resto.length;
      let paso;
      try {
        paso = it.next();
      } catch (e) {
        const error = String(e?.message ?? e);
        const ya = YA_ESTA.exec(error);
        if (ya && !rehechas.has(lugar)) {
          rehechas.add(lugar);
          prueba.run(`DROP TABLE IF EXISTS ${comillas(ya[1]?.replace(/""/g, '"') ?? ya[2])}`);
          it = prueba.iterateStatements(resto);
          continue;
        }
        if (!(sinRevisar && /^no such (?:table|column)/.test(error))) r = { error, linea: lineaDelError(texto, lugar, error) };
        break;
      }
      if (paso.done) break;
      const st = paso.value;
      const sentencia = sinTextos(st.getSQL());
      if (ESTRUCTURA.test(sentencia)) {
        if (/^\s*create\b[^(]*\btable\b/i.test(sentencia) && /\bselect\b/i.test(sentencia)) sinRevisar = true;
        else {
          try {
            st.step();
          } catch {
            // As it was: what follows says it.
          }
        }
      }
      resto = it.getRemainingSQL();
    }
  } finally {
    it?.return();
    prueba.close();
  }
  return r;
}
