// MySQL and SQLite: what a student writes following the notes of Bases de Datos (El Santo Resumen), where the course
// works in MySQL, and SQLite takes another way. Every rule comes from the SQL of those notes (their exams, exercises
// and proposed solutions): `start transaction`, temporary tables made from a select, variables with @, `delimiter` and
// routines, `current_date()`, `now()`, `datediff`, `month`, `last_insert_id()`, `auto_increment`, `engine=InnoDB`,
// `alter table` with several changes, `update … inner join`, comments with #, dates as '20250101'. When a statement
// fails because of one of those, one line with how SQLite says it. A few don't fail but do something else (a variable
// is NULL, '20250101' compares wrong, an integer division loses the decimals): those are said even without an error.
// Pure: the worker calls it with the statement and SQLite's message; the screen shows each line as text, with what
// goes between ` as code.

const MAXIMO = 2;

/** The statement without comments and with every '…' emptied, so what is written inside a text doesn't count. */
export function sinTextos(sql) {
  let salida = '';
  let i = 0;
  while (i < sql.length) {
    if (sql.startsWith('--', i)) {
      const fin = sql.indexOf('\n', i);
      i = fin === -1 ? sql.length : fin;
      salida += ' ';
    } else if (sql.startsWith('/*', i)) {
      const fin = sql.indexOf('*/', i + 2);
      i = fin === -1 ? sql.length : fin + 2;
      salida += ' ';
    } else if (sql[i] === "'") {
      let j = i + 1;
      while (j < sql.length && !(sql[j] === "'" && sql[j + 1] !== "'")) j += sql[j] === "'" ? 2 : 1;
      salida += "''";
      i = j + 1;
    } else {
      salida += sql[i];
      i += 1;
    }
  }
  return salida;
}

// A name as it is written (propiedad, `propiedad`, "propiedad"), without its quotes, short.
const nombre = (n) => String(n ?? '').replace(/^[`"[]|[`"\]]$/g, '').slice(0, 40);
const NOMBRE = String.raw`(?:\x60[^\x60]+\x60|"[^"]+"|\[[^\]]+\]|[\w$]+)`;

// '20250101', '20251231T235959' or '01-01-2018', as SQLite compares dates: '2025-01-01', '2025-12-31 23:59:59'.
function fechaComoSqlite(t) {
  let m = /^(\d{4})(\d{2})(\d{2})(?:T?(\d{2})(\d{2})(\d{2}))?$/.exec(t);
  if (m) return `${m[1]}-${m[2]}-${m[3]}${m[4] ? ` ${m[4]}:${m[5]}:${m[6]}` : ''}`;
  m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(t);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}
const FECHA_SIN_GUIONES = /(?:\bBETWEEN|\bAND|<>|[<>=]=?)\s*'(\d{8}(?:T?\d{6})?|\d{2}-\d{2}-\d{4})'/i;

const PARTES_DE_FECHA = { YEAR: '%Y', MONTH: '%m', DAY: '%d', DAYOFMONTH: '%d' };

// Each rule: `si` gets { s (without texts), original, e (SQLite's message), sintaxis, funcion, tabla, base, nulo,
// tipoDe } and returns something truthy when it applies; `pista` turns that into the line. `callada`: it also applies
// when the statement didn't fail, because SQLite takes it and does something else.
const REGLAS = [
  // Comments and quotes that came from MySQL or from a PDF.
  {
    si: ({ e }) => /unrecognized token: "#/i.test(e),
    pista: () => 'En SQLite los comentarios van con `--`.',
  },
  {
    si: ({ s }) => /[‘’“”]/.test(s),
    pista: ({ original }) => {
      const t = /[‘“]([^’”']{0,30})[’”]/.exec(original)?.[1];
      return `Las comillas van rectas, \`'${t ?? 'texto'}'\`.`;
    },
  },
  // Transactions.
  {
    si: ({ s, sintaxis }) => sintaxis && /^\s*START\s+TRANSACTION\b/i.test(s),
    pista: () => 'En SQLite la transacción empieza con `BEGIN;`.',
  },
  {
    si: ({ s, sintaxis }) => sintaxis && /^\s*SET\s+(?:@@)?(?:SESSION\s+|GLOBAL\s+)?autocommit\b/i.test(s),
    pista: () => 'SQLite no tiene `autocommit`. Usá `BEGIN;` y `COMMIT;`.',
  },
  // Variables with @.
  {
    si: ({ s, sintaxis }) => sintaxis && (/^\s*SET\s+@/i.test(s) || /\bINTO\s+@\w+/i.test(s) || /^\s*DECLARE\b/i.test(s)),
    pista: () => 'SQLite no tiene variables con `@`. Usá una subconsulta o `WITH`.',
  },
  // Temporary tables made from a select, as the notes write them.
  {
    si: ({ s, sintaxis }) => sintaxis && new RegExp(String.raw`^\s*CREATE\s+(TEMP(?:ORARY)?\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(${NOMBRE})\s*\(?\s*(?:SELECT|WITH)\b`, 'i').exec(s),
    pista: (_, m) => `En SQLite es \`CREATE ${m[1] ? 'TEMP ' : ''}TABLE ${nombre(m[2])} AS SELECT …\`, sin paréntesis.`,
  },
  {
    si: ({ s, sintaxis }) => sintaxis && new RegExp(String.raw`^\s*DROP\s+TEMP(?:ORARY)?\s+TABLE\s+(?:IF\s+EXISTS\s+)?(${NOMBRE})`, 'i').exec(s),
    pista: (_, m) => `En SQLite es \`DROP TABLE IF EXISTS ${nombre(m[1])};\`.`,
  },
  // Routines: delimiter, procedures, functions, triggers.
  {
    si: ({ s }) => /^\s*DELIMITER\b/i.test(s),
    pista: () => 'En SQLite `DELIMITER` sobra.',
  },
  {
    si: ({ s, sintaxis }) => sintaxis && /^\s*(CALL\b|(CREATE|DROP)\s+(DEFINER\s*=\s*\S+\s+)?(PROCEDURE|FUNCTION)\b)/i.test(s),
    pista: () => 'SQLite no tiene procedimientos ni funciones. Escribí las consultas con los valores.',
  },
  {
    si: ({ s, sintaxis }) => sintaxis && /^\s*CREATE\s+DEFINER\b/i.test(s),
    pista: () => 'En SQLite `DEFINER` sobra. Queda `CREATE TRIGGER …`.',
  },
  {
    si: ({ s, sintaxis }) => sintaxis && /^\s*CREATE\s+TRIGGER\b[\s\S]*\bFOR\s+EACH\s+ROW\s+(?!BEGIN\b)/i.test(s),
    pista: () => 'En SQLite el cuerpo del trigger va entre `BEGIN` y `END;`.',
  },
  // One database, and no users.
  {
    si: ({ s, sintaxis }) => sintaxis && /^\s*USE\s+\S+/i.test(s),
    pista: () => 'En SQLite el `USE` sobra.',
  },
  {
    // «no such table: inmobiliaria.persona» in a query, «unknown database inmobiliaria» creating one.
    si: ({ s, base, tabla }) => {
      if (tabla?.includes('.') && !/^(main|temp)\./i.test(tabla)) return tabla.split('.');
      if (!base) return null;
      const n = new RegExp(String.raw`${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\x60?\s*\.\s*(${NOMBRE})`, 'i').exec(s)?.[1];
      return [base, n ? nombre(n) : null];
    },
    pista: (_, [b, n]) => (n ? `En SQLite va \`${n}\`, sin \`${b}.\`.` : `En SQLite va sin \`${b}.\` adelante.`),
  },
  {
    si: ({ s, sintaxis }) => sintaxis && /^\s*(GRANT|REVOKE|(CREATE|DROP|ALTER)\s+USER)\b/i.test(s),
    pista: () => 'SQLite no tiene usuarios ni permisos.',
  },
  // Dates and functions.
  {
    si: ({ s, sintaxis }) => sintaxis && /\bCURRENT_(DATE|TIME|TIMESTAMP)\s*\(\s*\)/i.exec(s),
    pista: (_, m) => {
      const f = m[1].toUpperCase();
      return `En SQLite es \`${f === 'DATE' ? 'date' : f === 'TIME' ? 'time' : 'datetime'}('now', 'localtime')\`.`;
    },
  },
  {
    si: ({ funcion }) => /^(NOW|SYSDATE|CURDATE|CURTIME|UTC_TIMESTAMP|LOCALTIME|LOCALTIMESTAMP)$/i.exec(funcion ?? ''),
    pista: (_, m) => {
      const f = m[1].toUpperCase();
      return `En SQLite es \`${f === 'CURDATE' ? 'date' : f === 'CURTIME' ? 'time' : 'datetime'}('now', 'localtime')\`.`;
    },
  },
  {
    si: ({ funcion }) => /^DATEDIFF$/i.test(funcion ?? ''),
    pista: () => 'En SQLite es `julianday(fin) - julianday(inicio)`.',
  },
  {
    si: ({ funcion }) => PARTES_DE_FECHA[String(funcion ?? '').toUpperCase()],
    pista: (_, formato) => `En SQLite es \`CAST(strftime('${formato}', fecha) AS INTEGER)\`.`,
  },
  {
    si: ({ funcion }) => /^LAST_INSERT_ID$/i.test(funcion ?? ''),
    pista: () => 'En SQLite es `last_insert_rowid()`.',
  },
  // Creating and changing tables.
  {
    si: ({ s, sintaxis }) => sintaxis && /\bAUTO_INCREMENT\b/i.test(s) && !/\)\s*AUTO_INCREMENT\s*=/i.test(s),
    pista: () => 'SQLite no tiene `AUTO_INCREMENT`. Una columna `INTEGER PRIMARY KEY` se numera sola.',
  },
  {
    si: ({ s, sintaxis }) => sintaxis && /\)\s*(ENGINE|DEFAULT\s+CHARSET|CHARSET|CHARACTER\s+SET|COLLATE|AUTO_INCREMENT)\s*=?/i.test(s),
    pista: () => 'En SQLite `ENGINE`, `CHARSET` y `COLLATE` sobran.',
  },
  {
    si: ({ s, sintaxis }) => sintaxis && /\bCOMMENT\s+'/i.test(s),
    pista: () => 'En SQLite `COMMENT` sobra. Usá `--`.',
  },
  {
    si: ({ s, sintaxis }) => sintaxis && /^\s*ALTER\s+TABLE\b[\s\S]*,\s*(ADD|DROP|MODIFY|CHANGE|ALTER|RENAME)\b/i.test(s),
    pista: () => 'En SQLite va un `ALTER TABLE` por cada cambio.',
  },
  {
    si: ({ s, sintaxis }) => sintaxis && /^\s*ALTER\s+TABLE\b[\s\S]*\s(AFTER\s+\S+|FIRST)\s*;?\s*$/i.test(s),
    pista: () => 'En SQLite `AFTER` sobra. La columna va al final.',
  },
  {
    si: ({ s, sintaxis }) => sintaxis && /^\s*ALTER\s+TABLE\b[\s\S]*\b(MODIFY|CHANGE|ALTER)\s+(COLUMN\b|\w+\s+\w)/i.test(s),
    pista: () => 'SQLite no cambia una columna. Hay que armar la tabla de nuevo.',
  },
  {
    si: ({ s, sintaxis }) => sintaxis && new RegExp(String.raw`^\s*ALTER\s+TABLE\s+(${NOMBRE})[\s\S]*\bADD\s+(?:UNIQUE\s+)?(?:INDEX|KEY)\s+(${NOMBRE})?\s*\(([^)]*)\)`, 'i').exec(s),
    pista: (_, m) => `En SQLite es \`CREATE INDEX ${nombre(m[2] ?? 'nombre')} ON ${nombre(m[1])} (${m[3].replace(/\s+(ASC|DESC)\b/gi, '').replace(/[`"]/g, '').trim()});\`.`,
  },
  {
    si: ({ s, sintaxis }) => sintaxis && /^\s*ALTER\s+TABLE\b[\s\S]*\bADD\s+(CONSTRAINT|PRIMARY|FOREIGN|UNIQUE|CHECK)\b/i.test(s),
    pista: () => 'En SQLite las restricciones van en el `CREATE TABLE`.',
  },
  {
    si: ({ s, sintaxis }) => sintaxis && /^\s*ALTER\s+TABLE\b[\s\S]*\bDROP\s+(FOREIGN\s+KEY|PRIMARY\s+KEY|CONSTRAINT|INDEX|KEY)\b/i.test(s),
    pista: () => 'SQLite no saca restricciones. Hay que armar la tabla de nuevo.',
  },
  {
    si: ({ s, sintaxis }) => sintaxis && new RegExp(String.raw`^\s*UPDATE\s+(${NOMBRE})(?:\s+(?:AS\s+)?((?!INNER\b|LEFT\b|JOIN\b)\w+))?\s+(?:INNER\s+|LEFT\s+(?:OUTER\s+)?)?JOIN\s+(${NOMBRE})(?:\s+(?:AS\s+)?((?!ON\b)\w+))?`, 'i').exec(s),
    pista: (_, m) => `En SQLite es \`UPDATE ${nombre(m[1])}${m[2] ? ` AS ${m[2]}` : ''} SET … FROM ${nombre(m[3])}${m[4] ? ` ${m[4]}` : ''} WHERE …\`.`,
  },
  {
    si: ({ s, sintaxis }) => sintaxis && /^\s*UPDATE\b[\s\S]*?\bSET\s+(\w+)\.(\w+)\s*=/i.exec(s),
    pista: (_, m) => `En SQLite es \`SET ${m[2]} = …\`, sin la tabla.`,
  },
  {
    si: ({ s }) => new RegExp(String.raw`^\s*TRUNCATE\s+(?:TABLE\s+)?(${NOMBRE}(?:\s*\.\s*${NOMBRE})?)`, 'i').exec(s),
    pista: (_, m) => `En SQLite es \`DELETE FROM ${nombre(m[1].split('.').at(-1).trim())};\`.`,
  },
  {
    // An INSERT without a number for a column made with AUTO_INCREMENT: SQLite took it as part of the type.
    si: ({ nulo, tipoDe }) => nulo && /\bAUTO_INCREMENT\b/i.test(tipoDe?.(nulo[0], nulo[1]) ?? ''),
    pista: () => 'En SQLite `AUTO_INCREMENT` no numera. Para eso va `INTEGER PRIMARY KEY`.',
  },
  // What SQLite takes without a word, doing something else.
  {
    callada: true,
    si: ({ s }) => /(^|[^\w@'])@(\w+)/.exec(s),
    pista: (_, m) => `En SQLite \`@${m[2]}\` vale NULL. Usá una subconsulta o \`WITH\`.`,
  },
  {
    callada: true,
    si: ({ original }) => FECHA_SIN_GUIONES.exec(original),
    pista: (_, m) => `En SQLite las fechas van con guiones, \`'${fechaComoSqlite(m[1]) ?? m[1]}'\`.`,
  },
  {
    // Right after the type, SQLite takes «after nombre» as part of it.
    callada: true,
    si: ({ s }) => /^\s*ALTER\s+TABLE\b[\s\S]*\bADD\b[\s\S]*\sAFTER\s+\S+\s*;?\s*$/i.test(s),
    pista: () => 'En SQLite `AFTER` quedó como parte del tipo. Borrá la columna y creala sin él.',
  },
  {
    callada: true,
    si: ({ s }) => /^\s*CREATE\s+(TEMP(ORARY)?\s+)?TABLE\b/i.test(s) && /\bAUTO_INCREMENT\b/i.test(s),
    pista: () => 'En SQLite `AUTO_INCREMENT` no numera. Para eso va `INTEGER PRIMARY KEY`.',
  },
  {
    callada: true,
    si: ({ s }) => /\bCURRENT_(DATE|TIMESTAMP)\b(?!\s*\()/i.exec(s),
    pista: (_, m) => (m[1].toUpperCase() === 'DATE'
      ? "En SQLite `CURRENT_DATE` va en UTC y de 21 a 24 ya es mañana. Usá `date('now', 'localtime')`."
      : "En SQLite `CURRENT_TIMESTAMP` va en UTC, tres horas adelante. Usá `datetime('now', 'localtime')`."),
  },
  {
    callada: true,
    si: ({ s }) => /\bCOUNT\s*\([^()]*\)\s*(\*\s*\d+\s*)?\/(?!\s*\d+\.\d)|\/\s*COUNT\s*\(/i.test(s),
    pista: () => 'En SQLite `7 / 2` da 3. Multiplicá por `1.0` antes de dividir.',
  },
];

/**
 * How SQLite says what `sentencia` wrote as in MySQL: up to two lines. `error` is SQLite's message (empty when it went
 * well: then only what SQLite takes doing something else). `tipoDe(tabla, columna)` gives a column's declared type.
 */
export function pistasDeDialecto(sentencia, error = '', { tipoDe } = {}) {
  const original = String(sentencia ?? '');
  const e = String(error ?? '');
  const ctx = {
    original,
    s: sinTextos(original),
    e,
    sintaxis: /syntax error|incomplete input|unrecognized token/i.test(e),
    funcion: /no such function: (\w+)/i.exec(e)?.[1] ?? null,
    tabla: /no such table: ([\w.]+)/i.exec(e)?.[1] ?? null,
    base: /unknown database (\S+)/i.exec(e)?.[1]?.replace(/^[`"[]|[`"\]]$/g, '') ?? null,
    nulo: /NOT NULL constraint failed: (\w+)\.(\w+)/i.exec(e)?.slice(1) ?? null,
    tipoDe,
  };
  const pistas = [];
  // With an error, what explains it; without one, only what SQLite took doing something else.
  for (const regla of REGLAS) {
    if (Boolean(regla.callada) === Boolean(e)) continue;
    const m = regla.si(ctx);
    if (!m) continue;
    const texto = regla.pista(ctx, m);
    if (!pistas.includes(texto)) pistas.push(texto);
    if (pistas.length >= MAXIMO) break;
  }
  return pistas;
}

/** A line of a hint in pieces: text, and code where it goes between `. */
export function partirPista(texto) {
  return String(texto).split('`').map((t, i) => ({ codigo: i % 2 === 1, texto: t })).filter((p) => p.texto);
}
