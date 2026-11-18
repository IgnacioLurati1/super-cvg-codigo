// A MySQL script or dump (mysqldump, phpMyAdmin, Workbench) as SQLite takes it, for «Cargar tu base». Its rules come from
// mysql2sqlite (github.com/mysql2sqlite/mysql2sqlite, MIT): `/*!40101 … */` and SET, LOCK TABLES and USE go; ENGINE,
// CHARSET, COLLATE, COMMENT, unsigned and AUTO_INCREMENT=n go; an AUTO_INCREMENT key becomes INTEGER PRIMARY KEY
// AUTOINCREMENT; KEY lines become CREATE INDEX, with the table in their name (in MySQL two tables can share one); enum
// and set are TEXT; `\'` and the other backslashes of a text are what they mean. On top of that, read as statements and
// not by lines: what phpMyAdmin adds later with ALTER TABLE (keys, foreign keys, AUTO_INCREMENT) goes into its CREATE
// TABLE, since SQLite can't add them after; names with their schema (Workbench's `mydb`.`tabla`) lose it; DEFAULT in
// VALUES is the column's default; a _binary of a BIT column is its number, of another one a blob. Routines, triggers
// and events have no SQLite equivalent: they are left out, and the screen names them (`afuera`).
// Pure: the worker builds the database with what this returns (sqlBase.js).

const ESCAPES = { 0: '\0', "'": "'", '"': '"', b: '\b', n: '\n', r: '\r', t: '\t', Z: '\x1a', '\\': '\\', '%': '\\%', _: '\\_' };
const OPERADORES = ['<=>', '->>', '<=', '>=', '<>', '!=', '||', '&&', ':=', '<<', '>>', '->'];
const INTRODUCTOR = /^_(binary|utf8mb4|utf8mb3|utf8|latin1|ascii|ucs2|utf16|utf32|cp1252)$/i;

/** True if `texto` is written for MySQL: its quotes, its comments, its table options or its client commands. */
export function esMysql(texto) {
  const t = String(texto ?? '');
  if (/^\s*PRAGMA\b|\bsqlite_sequence\b/im.test(t)) return false;
  return /`|\/\*M?!\d*|\bENGINE\s*=|\bAUTO_INCREMENT\b|\bLOCK\s+TABLES\b|^\s*DELIMITER\s|\bUNSIGNED\b|\bCHARSET\b|^\s*SET\s+(NAMES|SQL_MODE|FOREIGN_KEY_CHECKS|time_zone|AUTOCOMMIT)\b|^\s*USE\s|^\s*#|\\'/im.test(t);
}

/** Text that came as bytes (a dump with blobs isn't valid UTF-8): each text of it, back to UTF-8. */
function deBytes(v) {
  if (!/[\u0080-\u00ff]/.test(v)) return v;
  const bytes = Uint8Array.from(v, (c) => c.charCodeAt(0) & 0xff);
  return new TextDecoder('utf-8').decode(bytes);
}

// ---- Reading: statements of tokens -------------------------------------------------------------------------------
// Tokens: { t: 'esp' | 'id' | 'txt' | 'pal' | 'sim', v }. 'esp' is space or a comment (only its line breaks stay);
// 'id' a name between quotes; 'txt' a text, already as it means (`bin`: it came with _binary); 'pal' a word, a number,
// or a blob or bits as SQLite writes them.

function* sentencias(texto, { ansi = false, sinBarra = false } = {}) {
  const n = texto.length;
  let i = 0;
  let delim = ';';
  let tokens = [];
  let inicio = -1;
  let condicional = 0;
  let binario = false;
  const sumar = (t, desde) => {
    if (t.t !== 'esp' && inicio < 0) inicio = desde;
    tokens.push(t);
  };
  const leerTexto = (q) => {
    let j = i + 1;
    let v = '';
    for (;;) {
      if (j >= n) {
        i = n;
        return v;
      }
      const c = texto[j];
      if (c === '\\' && !sinBarra && j + 1 < n) {
        const d = texto[j + 1];
        v += ESCAPES[d] ?? d;
        j += 2;
      } else if (c === q) {
        if (texto[j + 1] === q) {
          v += q;
          j += 2;
        } else {
          i = j + 1;
          return v;
        }
      } else {
        const k = texto.slice(j).search(q === "'" ? /['\\]/ : q === '"' ? /["\\]/ : /`/);
        const hasta = k < 0 ? n : j + k;
        v += texto.slice(j, Math.max(hasta, j + 1));
        j = Math.max(hasta, j + 1);
      }
    }
  };
  const espacio = (desde, hasta) => {
    const saltos = texto.slice(desde, hasta).replace(/[^\n]/g, '');
    tokens.push({ t: 'esp', v: saltos || ' ' });
  };
  while (i < n) {
    const c = texto[i];
    const desde = i;
    // A client command, at the start of a statement: DELIMITER changes what ends one.
    if (inicio < 0 && (c === 'D' || c === 'd')) {
      const m = /DELIMITER[ \t]+(\S+)[^\n]*/iy;
      m.lastIndex = i;
      const r = m.exec(texto);
      if (r) {
        delim = r[1];
        i = m.lastIndex;
        tokens = [];
        continue;
      }
    }
    if (texto.startsWith(delim, i)) {
      if (inicio >= 0) yield { tokens, inicio, fin: i };
      i += delim.length;
      tokens = [];
      inicio = -1;
      continue;
    }
    if (/\s/.test(c)) {
      const m = /\s+/y;
      m.lastIndex = i;
      m.exec(texto);
      i = m.lastIndex;
      tokens.push({ t: 'esp', v: texto.slice(desde, i) });
    } else if (c === '#' || (c === '-' && texto[i + 1] === '-' && (i + 2 >= n || /\s/.test(texto[i + 2])))) {
      const fin = texto.indexOf('\n', i);
      i = fin < 0 ? n : fin;
      tokens.push({ t: 'esp', v: ' ' });
    } else if (c === '/' && texto[i + 1] === '*') {
      // /*!40101 … */ and MariaDB's /*M!100100 … */ are run by MySQL: their inside counts. /*M!999999\- … */ doesn't.
      const m = /\/\*(M?)!(\d*)/y;
      m.lastIndex = i;
      const r = m.exec(texto);
      if (r && r[2] !== '999999') {
        i = m.lastIndex;
        condicional += 1;
        tokens.push({ t: 'esp', v: ' ' });
      } else {
        const fin = texto.indexOf('*/', i + 2);
        i = fin < 0 ? n : fin + 2;
        espacio(desde, i);
      }
    } else if (c === '*' && texto[i + 1] === '/' && condicional > 0) {
      condicional -= 1;
      i += 2;
      tokens.push({ t: 'esp', v: ' ' });
    } else if (c === "'" || (c === '"' && !ansi)) {
      const v = leerTexto(c);
      sumar({ t: 'txt', v, bin: binario }, desde);
      binario = false;
    } else if (c === '`' || c === '"') {
      sumar({ t: 'id', v: leerTexto(c) }, desde);
    } else {
      const hex = /0x([0-9a-fA-F]+)(?![\w$])|[xX]'([0-9a-fA-F]*)'/y;
      const bits = /0b([01]+)(?![\w$])|[bB]'([01]*)'/y;
      const numero = /(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?(?![\w$\u0080-\uffff])/y;
      const palabra = /[\w$\u0080-\uffff]+/y;
      let r;
      hex.lastIndex = bits.lastIndex = numero.lastIndex = palabra.lastIndex = i;
      if ((r = hex.exec(texto))) {
        const h = r[1] ?? r[2];
        sumar({ t: 'pal', v: `X'${h.length % 2 ? `0${h}` : h}'` }, desde);
        i = hex.lastIndex;
      } else if ((r = bits.exec(texto))) {
        sumar({ t: 'pal', v: String(parseInt(r[1] ?? r[2] ?? '0', 2) || 0) }, desde);
        i = bits.lastIndex;
      } else if ((r = numero.exec(texto))) {
        sumar({ t: 'pal', v: r[0] }, desde);
        i = numero.lastIndex;
      } else if ((r = palabra.exec(texto))) {
        // END$$ with DELIMITER $$: the word ends where the delimiter starts.
        const corte = r[0].indexOf(delim);
        if (corte > 0) r[0] = r[0].slice(0, corte);
        i = desde + r[0].length;
        // _utf8mb4'…', _binary '…' and N'…': the text without what says its charset.
        const sigue = /\s*['"]/y;
        sigue.lastIndex = i;
        if ((INTRODUCTOR.test(r[0]) || /^N$/i.test(r[0])) && sigue.exec(texto) && (r[0].length > 1 || texto[i] === "'")) {
          binario = /^_binary$/i.test(r[0]);
          continue;
        }
        sumar({ t: 'pal', v: r[0] }, desde);
      } else {
        const op = OPERADORES.find((o) => texto.startsWith(o, i)) ?? c;
        i += op.length;
        sumar({ t: 'sim', v: op }, desde);
      }
    }
  }
  if (inicio >= 0) yield { tokens, inicio, fin: n };
}

// ---- Writing tokens as SQLite --------------------------------------------------------------------------------------

const comillas = (nombre) => `"${String(nombre).replace(/"/g, '""')}"`;
const literal = (v) => `'${String(v).replace(/\0/g, '').replace(/'/g, "''")}'`;
const hexDe = (v) => [...(/[\u0100-\uffff]/.test(v) ? new TextEncoder().encode(v) : Uint8Array.from(v, (c) => c.charCodeAt(0)))].map((b) => b.toString(16).padStart(2, '0')).join('');

function escritor(crudo) {
  const texto = crudo ? deBytes : (v) => v;
  return (tk) => {
    if (tk.t === 'id') return comillas(texto(tk.v));
    if (tk.t === 'txt') return tk.bin ? `X'${hexDe(tk.v)}'` : literal(texto(tk.v));
    if (tk.t === 'pal') return texto(tk.v);
    return tk.v;
  };
}

const palabra = (tk) => (tk?.t === 'pal' ? tk.v.toUpperCase() : '');
const esSim = (tk, s) => tk?.t === 'sim' && tk.v === s;

// A reader of the tokens of a statement without spaces.
class Lector {
  constructor(ts) {
    this.ts = ts;
    this.i = 0;
  }

  ver(k = 0) {
    return this.ts[this.i + k];
  }

  es(...palabras) {
    return palabras.includes(palabra(this.ver()));
  }

  sim(s) {
    return esSim(this.ver(), s);
  }

  tomar() {
    return this.ts[this.i++];
  }

  tomarSi(...palabras) {
    if (!this.es(...palabras)) return false;
    this.i += 1;
    return true;
  }

  fin() {
    return this.i >= this.ts.length;
  }

  /** What is between the parentheses that open here, without them. */
  grupo() {
    if (!this.sim('(')) return [];
    let nivel = 0;
    const desde = this.i;
    while (!this.fin()) {
      const tk = this.tomar();
      if (esSim(tk, '(')) nivel += 1;
      else if (esSim(tk, ')') && --nivel === 0) return this.ts.slice(desde + 1, this.i - 1);
    }
    return this.ts.slice(desde + 1);
  }

  /** A name, without its schema (`mydb`.`tabla`). */
  nombre() {
    let tk = this.tomar();
    while (this.sim('.') && (this.ver(1)?.t === 'id' || this.ver(1)?.t === 'pal')) {
      this.i += 1;
      tk = this.tomar();
    }
    return tk?.v ?? '';
  }

  resto() {
    const r = this.ts.slice(this.i);
    this.i = this.ts.length;
    return r;
  }
}

/** The tokens split by their commas outside parentheses. */
function partir(ts) {
  const partes = [[]];
  let nivel = 0;
  for (const tk of ts) {
    if (esSim(tk, '(')) nivel += 1;
    if (esSim(tk, ')')) nivel -= 1;
    if (nivel === 0 && esSim(tk, ',')) partes.push([]);
    else partes.at(-1).push(tk);
  }
  return partes.filter((p) => p.length);
}

// ---- Tables ---------------------------------------------------------------------------------------------------------

const ENTEROS = /^(TINYINT|SMALLINT|MEDIUMINT|MIDDLEINT|INT|INTEGER|BIGINT|INT[1-8]|BIT|BOOL|BOOLEAN|SERIAL)$/;
const TEXTOS = /^(TINYTEXT|TEXT|MEDIUMTEXT|LONGTEXT|ENUM|SET|JSON|LONG)$/;
const BINARIOS = /^(TINYBLOB|BLOB|MEDIUMBLOB|LONGBLOB|BINARY|VARBINARY|GEOMETRY|POINT|LINESTRING|POLYGON|MULTIPOINT|MULTILINESTRING|MULTIPOLYGON|GEOMETRYCOLLECTION|GEOMCOLLECTION)$/;
const SIN_FIN = ['UNSIGNED', 'SIGNED', 'ZEROFILL', 'BINARY', 'VISIBLE', 'INVISIBLE', 'FIRST', 'NULL', 'ASCII', 'UNICODE', 'BYTE'];

function tipoSqlite(base, args) {
  if (ENTEROS.test(base)) return 'INTEGER';
  if (/^(FLOAT|DOUBLE|REAL|FLOAT4|FLOAT8)$/.test(base)) return 'REAL';
  if (/^(DECIMAL|DEC|NUMERIC|FIXED)$/.test(base)) return args ? `DECIMAL(${args})` : 'DECIMAL';
  if (/^(CHAR|VARCHAR|NCHAR|NVARCHAR|CHARACTER|VARCHARACTER)$/.test(base)) return args ? `VARCHAR(${args})` : 'VARCHAR';
  if (TEXTOS.test(base)) return 'TEXT';
  if (BINARIOS.test(base)) return 'BLOB';
  if (/^(DATE|DATETIME|TIMESTAMP|TIME|YEAR)$/.test(base)) return base;
  return base || 'TEXT';
}

/** A DEFAULT as SQLite takes it, or undefined if it has none that SQLite could use. */
function leerDefecto(L, escribir) {
  if (L.sim('(')) {
    // An expression: SQLite takes it if it calls no function (uuid() isn't there).
    const expr = L.grupo();
    return expr.some((tk, k) => tk.t === 'pal' && esSim(expr[k + 1], '(')) ? undefined : `(${expr.map(escribir).join(' ')})`;
  }
  let signo = '';
  if (L.sim('-') || L.sim('+')) signo = L.tomar().v;
  const tk = L.tomar();
  const p = palabra(tk);
  const ahora = { CURRENT_TIMESTAMP: 'CURRENT_TIMESTAMP', NOW: 'CURRENT_TIMESTAMP', LOCALTIME: 'CURRENT_TIMESTAMP', LOCALTIMESTAMP: 'CURRENT_TIMESTAMP', CURRENT_DATE: 'CURRENT_DATE', CURDATE: 'CURRENT_DATE', CURRENT_TIME: 'CURRENT_TIME', CURTIME: 'CURRENT_TIME' }[p];
  if (ahora) {
    L.grupo();
    return ahora;
  }
  // Another function (uuid()): SQLite has no such default.
  if (tk?.t === 'pal' && L.sim('(') && !/^\d/.test(tk.v)) {
    L.grupo();
    return undefined;
  }
  return tk ? signo + escribir(tk) : undefined;
}

function leerColumna(ts, escribir) {
  const L = new Lector(ts);
  const col = { nombre: L.tomar()?.v ?? '', tipo: 'TEXT', base: '' };
  col.base = palabra(L.tomar());
  if (col.base === 'NATIONAL' || col.base === 'LONG') col.base = palabra(L.tomar()) || col.base;
  if (col.base === 'DOUBLE') L.tomarSi('PRECISION');
  if (col.base === 'CHARACTER') L.tomarSi('VARYING');
  const args = L.sim('(') ? L.grupo().map(escribir).join('') : '';
  col.tipo = tipoSqlite(col.base, /^(ENUM|SET)$/.test(col.base) ? '' : args);
  col.entero = col.tipo === 'INTEGER';
  if (col.base === 'SERIAL') Object.assign(col, { ai: true, notNull: true, unica: true });
  while (!L.fin()) {
    if (L.tomarSi('NOT')) {
      if (L.tomarSi('NULL')) col.notNull = true;
    } else if (L.tomarSi('DEFAULT')) col.defecto = leerDefecto(L, escribir);
    else if (L.tomarSi('AUTO_INCREMENT')) col.ai = true;
    else if (L.tomarSi('PRIMARY')) {
      L.tomarSi('KEY');
      col.pk = true;
    } else if (L.tomarSi('KEY')) col.pk = true;
    else if (L.tomarSi('UNIQUE')) {
      L.tomarSi('KEY', 'INDEX');
      col.unica = true;
    } else if (L.tomarSi('ON')) {
      // ON UPDATE CURRENT_TIMESTAMP: SQLite would need a trigger.
      L.tomarSi('UPDATE');
      L.tomar();
      L.grupo();
    } else if (L.tomarSi('COMMENT', 'COLLATE', 'CHARSET', 'COLUMN_FORMAT', 'STORAGE', 'SRID', 'AFTER', 'ENGINE_ATTRIBUTE', 'SECONDARY_ENGINE_ATTRIBUTE')) {
      if (L.sim('=')) L.tomar();
      L.tomar();
    } else if (L.tomarSi('CHARACTER')) {
      L.tomarSi('SET');
      L.tomar();
    } else if (L.tomarSi('GENERATED')) L.tomarSi('ALWAYS');
    else if (L.tomarSi('AS')) {
      col.generada = L.grupo().map(escribir).join(' ');
    } else if (L.tomarSi('STORED', 'PERSISTENT')) col.guardada = true;
    else if (L.tomarSi('VIRTUAL')) col.guardada = false;
    else if (L.tomarSi('CHECK')) {
      const expr = L.grupo().map(escribir).join(' ');
      if (L.tomarSi('NOT')) L.tomarSi('ENFORCED');
      else col.check = expr;
      L.tomarSi('ENFORCED');
    } else if (L.tomarSi('REFERENCES')) {
      col.refs = referencias(L);
    } else if (L.tomarSi('CONSTRAINT')) {
      if (!L.es('CHECK')) L.tomar();
    } else if (L.es(...SIN_FIN)) L.tomar();
    else if (L.sim('(')) L.grupo();
    else L.tomar();
  }
  return col;
}

/** After REFERENCES: the table, its columns and what happens on delete or update. */
function referencias(L) {
  const tabla = L.nombre();
  const cols = L.sim('(') ? nombresDe(L.grupo()) : null;
  const acciones = [];
  while (!L.fin()) {
    if (L.tomarSi('ON')) {
      const cuando = palabra(L.tomar());
      const accion = L.tomarSi('SET') ? `SET ${palabra(L.tomar())}` : L.tomarSi('NO') ? `NO ${palabra(L.tomar())}` : palabra(L.tomar());
      if (/^(DELETE|UPDATE)$/.test(cuando)) acciones.push(`ON ${cuando} ${accion}`);
    } else if (L.tomarSi('MATCH')) L.tomar();
    else break;
  }
  return `REFERENCES ${comillas(tabla)}${cols ? ` (${cols.map(comillas).join(', ')})` : ''}${acciones.length ? ` ${acciones.join(' ')}` : ''}`;
}

/** The columns of a key: (`a`(20), `b` DESC) are a and b. Null if one is an expression, which SQLite can't index the same way. */
function nombresDe(ts) {
  const nombres = [];
  for (const parte of partir(ts)) {
    if (parte[0]?.t !== 'id' && parte[0]?.t !== 'pal') return null;
    nombres.push(parte[0].v);
  }
  return nombres;
}

/** A key, index, foreign key or check, of a CREATE TABLE or an ALTER TABLE … ADD, into the table `m`. */
function restriccion(L, m, nombreRestr, escribir) {
  const usar = () => {
    while (L.tomarSi('USING')) L.tomar();
  };
  const nombreOpcional = () => (L.sim('(') || L.es('USING') ? '' : L.nombre());
  if (L.tomarSi('PRIMARY')) {
    L.tomarSi('KEY');
    usar();
    const cols = nombresDe(L.grupo());
    if (cols) m.pk = cols;
  } else if (L.tomarSi('UNIQUE')) {
    L.tomarSi('KEY', 'INDEX');
    nombreOpcional();
    usar();
    const cols = nombresDe(L.grupo());
    if (cols) m.unicas.push(cols);
  } else if (L.es('KEY', 'INDEX', 'FULLTEXT', 'SPATIAL')) {
    if (L.tomarSi('FULLTEXT', 'SPATIAL')) L.tomarSi('KEY', 'INDEX');
    else L.tomar();
    const nombre = nombreOpcional();
    usar();
    const cols = nombresDe(L.grupo());
    if (cols) m.indices.push({ nombre, cols });
  } else if (L.tomarSi('FOREIGN')) {
    L.tomarSi('KEY');
    nombreOpcional();
    const cols = nombresDe(L.grupo());
    if (!L.tomarSi('REFERENCES') || !cols) return;
    m.foraneas.push({ nombre: nombreRestr, cols, refs: referencias(L) });
  } else if (L.tomarSi('CHECK')) {
    const expr = L.grupo().map(escribir).join(' ');
    if (!(L.tomarSi('NOT') && L.tomarSi('ENFORCED'))) m.checks.push({ nombre: nombreRestr, expr });
  }
}

const RESTRICCIONES = ['PRIMARY', 'UNIQUE', 'KEY', 'INDEX', 'FULLTEXT', 'SPATIAL', 'FOREIGN', 'CHECK'];

function itemDeTabla(ts, m, escribir) {
  const L = new Lector(ts);
  let nombreRestr = '';
  if (L.tomarSi('CONSTRAINT')) {
    if (!L.es(...RESTRICCIONES)) nombreRestr = L.nombre();
  }
  // A name in backquotes is a column even if it is called `key`: only a bare word is a key.
  if (L.es(...RESTRICCIONES)) restriccion(L, m, nombreRestr, escribir);
  else m.columnas.push(leerColumna(ts, escribir));
}

const igual = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

/** A column as SQLite declares it; `ai`, if it is the table's INTEGER PRIMARY KEY AUTOINCREMENT. */
function definicion(c, ai = false) {
  const partes = [comillas(c.nombre), c.tipo];
  if (ai) partes.push('PRIMARY KEY AUTOINCREMENT');
  else if (c.notNull) partes.push('NOT NULL');
  if (c.defecto !== undefined && !ai && !c.generada) partes.push(`DEFAULT ${c.defecto}`);
  if (c.generada) partes.push(`GENERATED ALWAYS AS (${c.generada}) ${c.guardada ? 'STORED' : 'VIRTUAL'}`);
  if (c.unica) partes.push('UNIQUE');
  if (c.check) partes.push(`CHECK (${c.check})`);
  if (c.refs) partes.push(c.refs);
  return partes.join(' ');
}

function crearTabla(m, nombresDeIndice) {
  const pk = m.pk.length ? m.pk : m.columnas.filter((c) => c.pk).map((c) => c.nombre);
  const ai = m.columnas.find((c) => c.ai && c.entero && !c.generada && pk.length === 1 && igual(pk[0], c.nombre));
  const lineas = m.columnas.map((c) => definicion(c, c === ai));
  if (pk.length && !ai) lineas.push(`PRIMARY KEY (${pk.map(comillas).join(', ')})`);
  for (const u of m.unicas) lineas.push(`UNIQUE (${u.map(comillas).join(', ')})`);
  for (const ch of m.checks) lineas.push(`${ch.nombre ? `CONSTRAINT ${comillas(ch.nombre)} ` : ''}CHECK (${ch.expr})`);
  for (const f of m.foraneas) lineas.push(`${f.nombre ? `CONSTRAINT ${comillas(f.nombre)} ` : ''}FOREIGN KEY (${f.cols.map(comillas).join(', ')}) ${f.refs}`);
  const sql = [`CREATE ${m.temporal ? 'TEMP ' : ''}TABLE ${m.siNoExiste ? 'IF NOT EXISTS ' : ''}${comillas(m.nombre)} (\n  ${lineas.join(',\n  ')}\n);`];
  for (const ix of m.indices) {
    sql.push(`CREATE INDEX ${m.siNoExiste ? 'IF NOT EXISTS ' : ''}${comillas(nombresDeIndice(m.nombre, ix))} ON ${comillas(m.nombre)} (${ix.cols.map(comillas).join(', ')});`);
  }
  return sql;
}

// ---- The script --------------------------------------------------------------------------------------------------

const SILENCIO = new Set(['SET', 'LOCK', 'UNLOCK', 'USE', 'START', 'BEGIN', 'COMMIT', 'ROLLBACK', 'FLUSH', 'ANALYZE', 'OPTIMIZE', 'REPAIR', 'SAVEPOINT', 'RELEASE', 'GRANT', 'REVOKE']);
const OBJETOS = { PROCEDURE: 'procedimiento', FUNCTION: 'función', TRIGGER: 'disparador', EVENT: 'evento' };
const OPCIONES_DE_TABLA = new Set(['AUTO_INCREMENT', 'ENGINE', 'TYPE', 'DEFAULT', 'CHARACTER', 'CHARSET', 'COLLATE', 'COMMENT', 'ROW_FORMAT', 'DISABLE', 'ENABLE', 'ALGORITHM', 'LOCK', 'KEY_BLOCK_SIZE', 'STATS_PERSISTENT', 'STATS_AUTO_RECALC', 'STATS_SAMPLE_PAGES', 'MAX_ROWS', 'MIN_ROWS', 'PACK_KEYS', 'CHECKSUM', 'DELAY_KEY_WRITE', 'AVG_ROW_LENGTH', 'FORCE', 'ORDER', 'CONVERT']);

/** CREATE … [OR REPLACE] [ALGORITHM=…] [DEFINER=…] [SQL SECURITY …]: the word of what it creates, past all that. */
function saltarCreate(L) {
  const r = { reemplaza: false, temporal: false, unica: false };
  L.tomarSi('CREATE');
  for (;;) {
    if (L.tomarSi('OR')) r.reemplaza = L.tomarSi('REPLACE');
    else if (L.tomarSi('ALGORITHM', 'DEFINER')) {
      if (L.sim('=')) L.tomar();
      L.tomar();
      if (L.sim('@')) {
        L.tomar();
        L.tomar();
      }
      L.grupo();
    } else if (L.tomarSi('SQL')) {
      L.tomarSi('SECURITY');
      L.tomar();
    } else if (L.tomarSi('TEMPORARY')) r.temporal = true;
    else if (L.tomarSi('UNIQUE')) r.unica = true;
    else if (L.tomarSi('FULLTEXT', 'SPATIAL', 'AGGREGATE')) continue;
    else break;
  }
  r.objeto = palabra(L.tomar());
  return r;
}

/**
 * MySQL's `texto` as SQLite statements: { sentencias: [{ sql, linea, exacta }], afuera: [{ que, nombre, linea }] }.
 * `linea` is where it starts in `texto`; `exacta`, if its lines are those of `texto` (an error inside it says its own).
 * `crudo`: the text came byte by byte (a dump with blobs that isn't UTF-8), each text of it is UTF-8 again here.
 */
export function deMysql(texto, { crudo = false } = {}) {
  const fuente = String(texto ?? '');
  const ansi = /ANSI_QUOTES|sql_mode\s*=\s*['"]?ANSI\b/i.test(fuente);
  const sinBarra = /NO_BACKSLASH_ESCAPES/i.test(fuente);
  const escribir = escritor(crudo);
  const saltos = [];
  for (let i = fuente.indexOf('\n'); i >= 0; i = fuente.indexOf('\n', i + 1)) saltos.push(i);
  const lineaDe = (pos) => {
    let a = 0;
    let b = saltos.length;
    while (a < b) {
      const mitad = (a + b) >> 1;
      if (saltos[mitad] < pos) a = mitad + 1;
      else b = mitad;
    }
    return a + 1;
  };

  const salida = [];
  const afuera = [];
  const modelos = new Map();
  const indices = new Set();
  const nombresDeIndice = (tabla, ix) => {
    const base = `${tabla}_${ix.nombre || ix.cols.join('_')}`;
    let nombre = base;
    for (let k = 2; indices.has(nombre.toLowerCase()); k += 1) nombre = `${base}_${k}`;
    indices.add(nombre.toLowerCase());
    return nombre;
  };
  const esquemas = new Set();
  const sacarEsquemas = (tokens) => {
    // `mydb`.`tabla` → "tabla", for the schemas the script creates or uses.
    const ts = tokens.filter((t) => t.t !== 'esp');
    for (let k = 0; k + 2 < ts.length; k += 1) {
      if ((ts[k].t === 'id' || ts[k].t === 'pal') && esSim(ts[k + 1], '.') && esquemas.has(ts[k].v.toLowerCase()) && !esSim(ts[k - 1], '.')) {
        ts[k].v = '';
        ts[k].t = 'esp';
        ts[k + 1].v = '';
        ts[k + 1].t = 'esp';
      }
    }
  };
  const tal = (tokens) => tokens.map(escribir).join('');
  const poner = (sql, linea, original, extra = {}) => {
    const exacta = original !== undefined && (sql.match(/\n/g)?.length ?? 0) === (original.match(/\n/g)?.length ?? 0);
    salida.push({ sql, linea, exacta, ...extra });
  };
  const fuera = (que, nombre, linea) => afuera.push({ que, nombre: crudo ? deBytes(String(nombre)) : String(nombre), linea });

  for (const { tokens, inicio, fin } of sentencias(fuente, { ansi, sinBarra })) {
    const linea = lineaDe(inicio);
    const original = fuente.slice(inicio, fin);
    const propios = tokens.slice(tokens.findIndex((t) => t.t !== 'esp'));
    const primera = palabra(propios[0]);
    const segunda = palabra(propios.find((t, k) => k > 0 && t.t !== 'esp'));
    if (primera === 'USE') {
      esquemas.add(String(propios.find((t, k) => k > 0 && t.t !== 'esp')?.v ?? '').toLowerCase());
      continue;
    }
    if (SILENCIO.has(primera) || (primera === 'CHECK' && segunda === 'TABLE')) continue;
    if (primera === 'CREATE' && /^(DATABASE|SCHEMA)$/.test(segunda)) {
      const D = new Lector(propios.filter((t) => t.t !== 'esp').slice(2));
      if (D.tomarSi('IF')) {
        D.tomarSi('NOT');
        D.tomarSi('EXISTS');
      }
      esquemas.add(String(D.ver()?.v ?? '').toLowerCase());
      continue;
    }
    sacarEsquemas(propios);
    const limpios = conGroupConcat(propios.filter((t) => t.t !== 'esp' || t.v));
    const ts = limpios.filter((t) => t.t !== 'esp');
    const L = new Lector(ts);

    if (primera === 'CREATE') {
      const c = saltarCreate(L);
      if (OBJETOS[c.objeto]) {
        fuera(OBJETOS[c.objeto], L.ver()?.t === 'id' || L.ver()?.t === 'pal' ? L.nombre() : '', linea);
        continue;
      }
      if (c.objeto === 'TABLE') {
        const siNoExiste = L.tomarSi('IF') && L.tomarSi('NOT') && L.tomarSi('EXISTS');
        const nombre = L.nombre();
        // CREATE TABLE … AS SELECT, or (SELECT …): as it is, with AS.
        if (!L.sim('(') || palabra(L.ver(1)) === 'SELECT') {
          const resto = L.resto();
          const k = resto.findIndex((t) => palabra(t) === 'SELECT' || esSim(t, '('));
          if (k < 0 || palabra(resto[0]) === 'LIKE') {
            fuera('tabla copiada con LIKE', nombre, linea);
            continue;
          }
          poner(`CREATE ${c.temporal ? 'TEMP ' : ''}TABLE ${siNoExiste ? 'IF NOT EXISTS ' : ''}${comillas(nombre)} AS ${resto.slice(k).map(escribir).join(' ')};`, linea);
          continue;
        }
        const m = { nombre: crudo ? deBytes(nombre) : nombre, temporal: c.temporal, siNoExiste, columnas: [], pk: [], unicas: [], foraneas: [], checks: [], indices: [] };
        for (const item of partir(L.grupo())) itemDeTabla(item, m, escribir);
        for (const col of m.columnas) if (crudo) col.nombre = deBytes(col.nombre);
        modelos.set(m.nombre.toLowerCase(), m);
        salida.push({ modelo: m, linea });
        continue;
      }
      if (c.objeto === 'INDEX') {
        const nombre = L.nombre();
        while (L.tomarSi('USING')) L.tomar();
        if (!L.tomarSi('ON')) continue;
        const tabla = L.nombre();
        const cols = nombresDe(L.grupo());
        if (!cols) {
          fuera('índice sobre una expresión', nombre, linea);
          continue;
        }
        poner(`CREATE ${c.unica ? 'UNIQUE ' : ''}INDEX ${comillas(nombresDeIndice(tabla, { nombre, cols }))} ON ${comillas(tabla)} (${cols.map(comillas).join(', ')});`, linea);
        continue;
      }
      if (c.objeto === 'VIEW') {
        const nombre = L.nombre();
        const resto = L.resto();
        let hasta = resto.length;
        const conCheck = resto.findIndex((t, k) => palabra(t) === 'WITH' && /^(CASCADED|LOCAL|CHECK)$/.test(palabra(resto[k + 1])));
        if (conCheck >= 0) hasta = conCheck;
        const cuerpo = resto.slice(0, hasta);
        const comoEn = cuerpo.findIndex((t) => palabra(t) === 'AS');
        const antes = cuerpo.slice(0, comoEn).map((tk) => (tk.t === 'pal' ? comillas(tk.v) : escribir(tk))).join(' ');
        // The select as it was written, with its spaces and line breaks.
        const ultimo = cuerpo.at(-1);
        const k0 = limpios.indexOf(cuerpo[comoEn + 1]);
        const k1 = limpios.lastIndexOf(ultimo);
        const select = tal(limpios.slice(k0, k1 + 1));
        const vista = comillas(crudo ? deBytes(nombre) : nombre);
        // A view SQLite doesn't take is left out, not the whole file (sqlBase.js).
        poner(`${c.reemplaza ? `DROP VIEW IF EXISTS ${vista};\n` : ''}CREATE ${c.temporal ? 'TEMP ' : ''}VIEW ${vista}${antes ? ` ${antes}` : ''} AS ${select};`, linea, undefined, { vista: crudo ? deBytes(nombre) : nombre });
        continue;
      }
      if (c.objeto === 'USER' || c.objeto === 'ROLE') continue;
    }

    if (primera === 'ALTER') {
      L.tomar();
      while (L.tomarSi('ONLINE', 'OFFLINE', 'IGNORE'));
      if (!L.tomarSi('TABLE')) {
        if (!L.es('DATABASE', 'SCHEMA')) fuera('cambio', palabra(L.ver()), linea);
        continue;
      }
      const tabla = L.nombre();
      const m = modelos.get(String(crudo ? deBytes(tabla) : tabla).toLowerCase());
      for (const spec of partir(L.resto())) {
        const S = new Lector(spec);
        if (S.tomarSi('ADD')) {
          let nombreRestr = '';
          if (S.tomarSi('CONSTRAINT') && !S.es(...RESTRICCIONES)) nombreRestr = S.nombre();
          if (S.es(...RESTRICCIONES)) {
            if (m) restriccion(S, m, nombreRestr, escribir);
            else fuera('clave de una tabla que no está', tabla, linea);
            continue;
          }
          S.tomarSi('COLUMN');
          const columnas = S.sim('(') ? partir(S.grupo()) : [spec.slice(S.i)];
          for (const def of columnas) {
            const col = leerColumna(def, escribir);
            if (m) m.columnas.push(col);
            else poner(`ALTER TABLE ${comillas(tabla)} ADD COLUMN ${definicion(col)};`, linea);
          }
        } else if (S.es('MODIFY', 'CHANGE')) {
          const cambia = palabra(S.tomar()) === 'CHANGE';
          S.tomarSi('COLUMN');
          const viejo = cambia ? S.nombre() : null;
          const col = leerColumna(spec.slice(S.i), escribir);
          const k = m ? m.columnas.findIndex((x) => igual(x.nombre, viejo ?? col.nombre)) : -1;
          if (k >= 0) {
            // A key or an index on the column keeps it, also with another name.
            if (viejo && !igual(viejo, col.nombre)) {
              const renombrar = (cols) => cols.map((n) => (igual(n, viejo) ? col.nombre : n));
              m.pk = renombrar(m.pk);
              m.unicas = m.unicas.map(renombrar);
              m.indices = m.indices.map((ix) => ({ ...ix, cols: renombrar(ix.cols) }));
            }
            m.columnas[k] = col;
          } else fuera('cambio de columna', `${tabla}.${viejo ?? col.nombre}`, linea);
        } else if (OPCIONES_DE_TABLA.has(palabra(S.ver()))) continue;
        else fuera('cambio de tabla', tabla, linea);
      }
      continue;
    }

    if (primera === 'DROP') {
      L.tomar();
      L.tomarSi('TEMPORARY');
      const objeto = palabra(L.tomar());
      if (objeto !== 'TABLE' && objeto !== 'VIEW') continue;
      const siExiste = L.tomarSi('IF') && L.tomarSi('EXISTS');
      for (const parte of partir(L.resto())) {
        const P = new Lector(parte);
        if (P.es('CASCADE', 'RESTRICT')) continue;
        const nombre = P.nombre();
        if (objeto === 'TABLE') modelos.delete(String(nombre).toLowerCase());
        poner(`DROP ${objeto} ${siExiste ? 'IF EXISTS ' : ''}${comillas(crudo ? deBytes(nombre) : nombre)};`, linea);
      }
      continue;
    }

    if (primera === 'INSERT' || primera === 'REPLACE') {
      poner(insertar(limpios, modelos, escribir, crudo), linea, original);
      continue;
    }

    poner(`${tal(limpios).trimEnd()};`, linea, original);
  }

  const sentenciasFinales = [];
  for (const item of salida) {
    if (item.modelo) {
      const [tabla, ...ixs] = crearTabla(item.modelo, nombresDeIndice);
      sentenciasFinales.push({ sql: tabla, linea: item.linea, exacta: false });
      for (const ix of ixs) sentenciasFinales.push({ sql: ix, linea: item.linea, exacta: false });
    } else sentenciasFinales.push(item);
  }
  return { sentencias: sentenciasFinales, afuera };
}

/** GROUP_CONCAT(x ORDER BY y SEPARATOR 's') as SQLite writes it: group_concat(x, 's' ORDER BY y). With DISTINCT,
 * SQLite takes no separator: it goes with a comma. */
function conGroupConcat(tokens) {
  const lista = [...tokens];
  for (let i = 0; i < lista.length; i += 1) {
    if (palabra(lista[i]) !== 'GROUP_CONCAT') continue;
    const abre = lista.findIndex((t, k) => k > i && t.t !== 'esp');
    if (!esSim(lista[abre], '(')) continue;
    let nivel = 0;
    let separador = -1;
    let orden = -1;
    let distinto = false;
    let cierra = -1;
    for (let k = abre; k < lista.length; k += 1) {
      const tk = lista[k];
      if (esSim(tk, '(')) nivel += 1;
      else if (esSim(tk, ')') && --nivel === 0) {
        cierra = k;
        break;
      } else if (nivel === 1 && palabra(tk) === 'SEPARATOR') separador = k;
      else if (nivel === 1 && palabra(tk) === 'ORDER' && orden < 0) orden = k;
      else if (nivel === 1 && palabra(tk) === 'DISTINCT' && lista.slice(abre + 1, k).every((t) => t.t === 'esp')) distinto = true;
    }
    if (cierra < 0 || separador < 0) continue;
    const texto = lista.slice(separador + 1, cierra).find((t) => t.t === 'txt');
    lista.splice(separador, cierra - separador);
    if (!distinto && texto) lista.splice(orden > 0 && orden < separador ? orden : separador, 0, { t: 'sim', v: ', ' }, { ...texto }, { t: 'esp', v: ' ' });
  }
  return lista;
}

/** An INSERT or REPLACE: IGNORE as SQLite says it, DEFAULT as the column's default, _binary as a number or a blob. */
function insertar(tokens, modelos, escribir, crudo) {
  const ts = tokens.filter((t) => t.t !== 'esp');
  // A word that goes, with the space after it.
  const quitar = (tk) => {
    const k = tokens.indexOf(tk);
    tk.t = 'esp';
    tk.v = '';
    if (tokens[k + 1]?.t === 'esp') tokens[k + 1].v = '';
  };
  let k = 1;
  let ignorar = false;
  while (/^(LOW_PRIORITY|DELAYED|HIGH_PRIORITY|IGNORE)$/.test(palabra(ts[k]))) {
    if (palabra(ts[k]) === 'IGNORE') ignorar = true;
    quitar(ts[k]);
    k += 1;
  }
  const verbo = palabra(ts[0]);
  // SQLite needs INTO: it goes with the verb.
  ts[0].v = `${verbo === 'INSERT' && ignorar ? 'INSERT OR IGNORE' : verbo} INTO`;
  if (palabra(ts[k]) === 'INTO') {
    quitar(ts[k]);
    k += 1;
  }
  const tabla = ts[k]?.v ?? '';
  const m = modelos.get(String(crudo ? deBytes(tabla) : tabla).toLowerCase());
  k += 1;
  let columnas = m ? m.columnas.filter((c) => !c.generada) : null;
  if (esSim(ts[k], '(') && palabra(ts[k + 1]) !== 'SELECT') {
    const nombres = [];
    for (k += 1; k < ts.length && !esSim(ts[k], ')'); k += 1) if (ts[k].t === 'id' || ts[k].t === 'pal') nombres.push(crudo ? deBytes(ts[k].v) : ts[k].v);
    columnas = m ? nombres.map((n) => m.columnas.find((c) => igual(c.nombre, n)) ?? null) : null;
    k += 1;
  }
  if (palabra(ts[k]) === 'VALUE') ts[k].v = 'VALUES';
  let nivel = 0;
  let pos = 0;
  for (k += 1; k < ts.length; k += 1) {
    const tk = ts[k];
    if (esSim(tk, '(')) {
      nivel += 1;
      if (nivel === 1) pos = 0;
      continue;
    }
    if (esSim(tk, ')')) {
      nivel -= 1;
      continue;
    }
    if (nivel === 0 && tk.t === 'pal' && palabra(tk) === 'ON') break;
    if (nivel !== 1) continue;
    if (esSim(tk, ',')) {
      pos += 1;
      continue;
    }
    const col = columnas?.[pos];
    if (tk.t === 'pal' && palabra(tk) === 'DEFAULT') {
      tk.v = col && col.defecto !== undefined && !col.ai ? col.defecto : 'NULL';
    } else if (tk.t === 'txt' && tk.bin && col?.base === 'BIT') {
      tk.t = 'pal';
      tk.v = String([...tk.v].reduce((n, c) => n * 256 + (c.charCodeAt(0) & 0xff), 0));
    } else if (tk.t === 'pal' && /^X'/.test(tk.v) && col?.base === 'BIT') {
      // mysqldump --hex-blob writes a BIT as 0x01.
      tk.v = String(parseInt(tk.v.slice(2, -1) || '0', 16));
    }
  }
  return `${tokens.map(escribir).join('').trimEnd()};`;
}

const PLURALES = {
  procedimiento: 'procedimientos',
  función: 'funciones',
  disparador: 'disparadores',
  evento: 'eventos',
  cambio: 'cambios',
  'cambio de tabla': 'cambios de tabla',
  'cambio de columna': 'cambios de columna',
  'clave de una tabla que no está': 'claves de tablas que no están',
  'tabla copiada con LIKE': 'tablas copiadas con LIKE',
  'índice sobre una expresión': 'índices sobre expresiones',
  vista: 'vistas',
};

/** What was left out, in a line for the screen, or ''. */
export function resumenAfuera(afuera) {
  if (!afuera?.length) return '';
  const cuenta = new Map();
  for (const a of afuera) cuenta.set(a.que, (cuenta.get(a.que) ?? 0) + 1);
  const partes = [...cuenta].map(([que, n]) => (n === 1 ? `1 ${que}` : `${n} ${PLURALES[que] ?? `${que}s`}`));
  const lista = new Intl.ListFormat('es').format(partes);
  return `${afuera.length === 1 ? 'Quedó' : 'Quedaron'} afuera ${lista} de MySQL.`;
}
