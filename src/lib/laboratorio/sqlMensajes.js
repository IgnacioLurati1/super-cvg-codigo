// What SQLite says when a statement fails (sql.worker.js), in the student's words, with the original under it so it can be
// looked up. It's one line, with no place: where the error is comes apart (sqlLinea.js). The ones the engine writes that
// aren't known stay as they came. As cMensajes.js (C), jsMensajes.js (JavaScript) and pyMensajes.js (Python).
import { conOriginal } from './error';

const codigo = (t) => `\`${t}\``;
const PLURAL = (n, uno, varios) => (n === 1 ? uno : varios);
// A name as SQLite writes it, with or without quotes.
const nombre = (t) => codigo(String(t).replace(/^"(.*)"$/, '$1').replace(/^main\./, ''));
// «n.a, n.b» → the table and the columns.
const columnasDe = (lista) => {
  const partes = String(lista).split(/,\s*/);
  const tabla = partes[0].split('.')[0];
  return { tabla, columnas: partes.map((p) => p.split('.').slice(1).join('.') || p) };
};
const juntar = (cols) => new Intl.ListFormat('es').format(cols.map(codigo));

const TRADUCCIONES = [
  // Syntax
  [/^near "(.*)": syntax error$/s, (m) => `Algo está mal escrito cerca de ${codigo(m[1])}. Fijate esa palabra y también lo de justo antes, por si falta una coma o está mal escrita una palabra como \`SELECT\` o \`FROM\`.`],
  [/^incomplete input$/, () => 'La consulta está incompleta. Falta algo al final, como una condición, el nombre de una tabla o un paréntesis que cerrar.'],
  [/^unrecognized token: "(['"].*)"$/s, () => 'Falta cerrar las comillas de un texto.'],
  [/^unrecognized token: "(.*)"$/s, (m) => `SQL no entiende el símbolo ${codigo(m[1])}.`],
  // Names that don't exist
  [/^no such table: (.+)$/, (m) => `No existe la tabla ${nombre(m[1])}. Fijate cómo se escribe y que la hayas creado antes con \`CREATE TABLE\`.`],
  [/^no such column: (.+)$/, (m) => `No existe la columna ${nombre(m[1])}. Fijate cómo se escribe y que sea de una de las tablas del \`FROM\`.`],
  [/^table (\S+) has no column named (.+)$/, (m) => `La tabla ${nombre(m[1])} no tiene una columna ${nombre(m[2])}.`],
  [/^no such function: (.+)$/, (m) => `No existe la función ${codigo(`${m[1]}()`)}. Fijate cómo se escribe.`],
  [/^no such (index|trigger|view|savepoint): (.+)$/, (m) => `No existe ${{ index: 'el índice', trigger: 'el trigger', view: 'la vista', savepoint: 'el punto de guardado' }[m[1]]} ${nombre(m[2])}.`],
  [/^unknown database (.+)$/, (m) => `En el laboratorio hay una sola base. No hace falta escribir ${codigo(`${m[1]}.`)} antes del nombre.`],
  [/^ambiguous column name: (.+)$/, (m) => `La columna ${nombre(m[1])} está en más de una tabla y SQL no sabe cuál querés. Escribila con la tabla adelante, como ${codigo(`tabla.${m[1]}`)}.`],
  [/^duplicate column name: (.+)$/, (m) => `La columna ${nombre(m[1])} está repetida.`],
  [/^(table|index|view|trigger) (\S+) already exists$/, (m) => `Ya existe ${{ table: 'la tabla', index: 'el índice', view: 'la vista', trigger: 'el trigger' }[m[1]]} ${nombre(m[2])}. Usá otro nombre${m[1] === 'table' ? ', o `CREATE TABLE IF NOT EXISTS`, o borrala antes con `DROP TABLE`' : ''}.`],
  // Rules of the table
  [/^UNIQUE constraint failed: (.+)$/, (m) => {
    const { tabla, columnas } = columnasDe(m[1]);
    return columnas.length > 1
      ? `Ya existe una fila de ${codigo(tabla)} con esa combinación de ${juntar(columnas)}, y no pueden repetirse.`
      : `Ya existe una fila de ${codigo(tabla)} con ese valor en ${codigo(columnas[0])}, y ahí no pueden repetirse. Es una clave primaria o una columna \`UNIQUE\`.`;
  }],
  [/^NOT NULL constraint failed: (.+)$/, (m) => {
    const { tabla, columnas } = columnasDe(m[1]);
    return `La columna ${codigo(columnas[0])} de ${codigo(tabla)} no puede quedar vacía (\`NULL\`) y no le diste un valor.`;
  }],
  [/^FOREIGN KEY constraint failed$/, () => 'Ese valor apunta a una fila que no existe en la otra tabla, o querés borrar una fila a la que otras todavía apuntan. Revisá la clave foránea.'],
  [/^CHECK constraint failed: (.+)$/, (m) => `El valor no cumple la condición ${codigo(m[1])} que pide la tabla.`],
  [/^foreign key mismatch - "(.+)" referencing "(.+)"$/, (m) => `La clave foránea de ${codigo(m[1])} apunta a columnas de ${codigo(m[2])} que no son su clave primaria ni \`UNIQUE\`.`],
  [/^table "?(\w+)"? has more than one primary key$/, (m) => `La tabla ${codigo(m[1])} tiene más de una clave primaria. Si es compuesta va en una sola, como \`PRIMARY KEY (a, b)\`.`],
  [/^datatype mismatch$/, () => 'Un valor no es del tipo que se espera. Por ejemplo, un texto donde va un número entero.'],
  // Values
  [/^table (\S+) has (\d+) columns? but (\d+) values? were supplied$/, (m) => `La tabla ${nombre(m[1])} tiene ${m[2]} ${PLURAL(Number(m[2]), 'columna', 'columnas')} y le diste ${m[3]} ${PLURAL(Number(m[3]), 'valor', 'valores')}. Tienen que coincidir, o nombrá las columnas.`],
  [/^(\d+) values? for (\d+) columns?$/, (m) => `Nombraste ${m[2]} ${PLURAL(Number(m[2]), 'columna', 'columnas')} y diste ${m[1]} ${PLURAL(Number(m[1]), 'valor', 'valores')}. Tienen que ser la misma cantidad.`],
  [/^all VALUES must have the same number of terms$/, () => 'Todas las filas de `VALUES` tienen que tener la misma cantidad de valores.'],
  [/^sub-select returns (\d+) columns? - expected (\d+)$/, (m) => `Una subconsulta devuelve ${m[1]} ${PLURAL(Number(m[1]), 'columna', 'columnas')} y ahí se ${PLURAL(Number(m[2]), 'espera', 'esperan')} ${m[2]}.`],
  [/^SELECTs to the left and right of (UNION ALL|UNION|INTERSECT|EXCEPT) do not have the same number of result columns$/, (m) => `Los dos \`SELECT\` de un ${codigo(m[1])} tienen que devolver la misma cantidad de columnas.`],
  [/^(\d+)(?:st|nd|rd|th) (ORDER|GROUP) BY term out of range - should be between 1 and (\d+)$/, (m) => `Ese ${codigo(`${m[2]} BY`)} usa un número de columna que no existe. Tiene que ir del 1 al ${m[3]}.`],
  [/^cannot join using column (.+) - column not present in both tables$/, (m) => `La columna ${nombre(m[1])} del \`USING\` tiene que estar en las dos tablas.`],
  [/^no tables specified$/, () => '`SELECT *` necesita un `FROM` para saber de qué tabla sacar las columnas.'],
  // Functions and groups
  [/^wrong number of arguments to function (.+)$/, (m) => `${codigo(m[1])} no recibe esa cantidad de argumentos.`],
  [/^misuse of aggregate(?: function)?:? (.+)$/, (m) => `No se puede usar ${codigo(m[1])} ahí. Las funciones de agregación no van en el \`WHERE\` (para filtrar por un total se usa \`HAVING\`) ni adentro de otra.`],
  [/^HAVING clause on a non-aggregate query$/, () => '`HAVING` va con `GROUP BY` o con funciones como `COUNT`. Para filtrar filas comunes se usa `WHERE`.'],
  [/^DISTINCT aggregates must have exactly one argument$/, () => '`DISTINCT` dentro de una función lleva una sola columna.'],
  // Transactions
  [/^cannot commit - no transaction is active$/, () => 'No hay ninguna transacción abierta para hacer `COMMIT`. Se abre con `BEGIN`.'],
  [/^cannot rollback - no transaction is active$/, () => 'No hay ninguna transacción abierta para hacer `ROLLBACK`. Se abre con `BEGIN`.'],
  [/^cannot start a transaction within a transaction$/, () => 'Ya hay una transacción abierta. Cerrala con `COMMIT` o `ROLLBACK` antes de abrir otra.'],
];

/** The message of SQLite in Spanish, with the original under it, or as it came if it's not a known one. */
export function explicarSql(mensaje) {
  const original = String(mensaje ?? '');
  for (const [patron, dicho] of TRADUCCIONES) {
    const m = patron.exec(original);
    if (m) return conOriginal(dicho(m), original);
  }
  return original;
}
