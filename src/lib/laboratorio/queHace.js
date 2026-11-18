// «Explicar la consulta», first part: what a statement does, in the order a query is evaluated (FROM and its JOINs,
// WHERE, GROUP BY, the aggregates, HAVING, SELECT, ORDER BY, LIMIT), said with the words of the notes of Bases de
// Datos (El Santo Resumen, 2° parcial and álgebra): «combina», «se queda con las filas», «agrupa», «producto
// cartesiano», «producto natural», «tabla común» for a WITH, «quedan en nulo» for a LEFT JOIN.
// A small reader over its own tokens covers what the course writes (the parcialitos, finals and practice of the
// notes): SELECT with JOINs, subqueries (IN, NOT IN, EXISTS, one value, in the FROM), UNION, EXCEPT, INTERSECT, WITH,
// INSERT, UPDATE (also with JOIN, as in MySQL) and DELETE. What it doesn't know it doesn't guess: null, and the screen
// says so. Pure. Each step is [{ texto, codigo }] pieces, with what is SQL as code: nothing is HTML.

class NoEntiendo extends Error {}
const no = () => {
  throw new NoEntiendo();
};

// ---- Tokens ------------------------------------------------------------------------------------------------------

const OPERADORES = ['<=>', '->>', '<>', '<=', '>=', '!=', '==', '||', '<<', '>>', ':=', '->'];
const SIMPLES = '=<>+-*/%(),.;&|~!^?:';

/** The tokens of `sql`, without spaces or comments (also MySQL's #). Throws on what it doesn't know. */
function fichas(sql) {
  const s = String(sql ?? '');
  const ts = [];
  let i = 0;
  const con = (re) => {
    re.lastIndex = i;
    return re.exec(s)?.[0] ?? null;
  };
  while (i < s.length) {
    const c = s[i];
    let m;
    if (/\s/.test(c)) i += 1;
    else if (s.startsWith('--', i) || c === '#') {
      const f = s.indexOf('\n', i);
      i = f === -1 ? s.length : f;
    } else if (s.startsWith('/*', i)) {
      const f = s.indexOf('*/', i + 2);
      if (f === -1) no();
      i = f + 2;
    } else if (c === "'") {
      let j = i + 1;
      while (j < s.length && !(s[j] === "'" && s[j + 1] !== "'")) j += s[j] === "'" ? 2 : 1;
      if (j >= s.length) no();
      ts.push({ t: 'txt', v: s.slice(i, j + 1) });
      i = j + 1;
    } else if (c === '`' || c === '"' || c === '[') {
      const f = s.indexOf(c === '[' ? ']' : c, i + 1);
      if (f === -1) no();
      ts.push({ t: 'id', v: s.slice(i + 1, f), q: c });
      i = f + 1;
    } else if ((m = con(/0x[\da-f]+|(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/iy))) {
      ts.push({ t: 'num', v: m });
      i += m.length;
    } else if ((m = con(/@@?(?:[\w$.]+|'[^']*'|`[^`]*`)/y))) {
      ts.push({ t: 'var', v: m });
      i += m.length;
    } else if ((m = con(/[A-Za-z_À-￿][\w$À-￿]*/y))) {
      ts.push({ t: 'pal', v: m, u: m.toUpperCase() });
      i += m.length;
    } else {
      const op = OPERADORES.find((o) => s.startsWith(o, i)) ?? (SIMPLES.includes(c) ? c : null);
      if (!op) no();
      ts.push({ t: 'op', v: op });
      i += op.length;
    }
  }
  return ts;
}

const esPal = (t, ...ps) => t?.t === 'pal' && ps.includes(t.u);
const esOp = (t, v) => t?.t === 'op' && t.v === v;
const esNombre = (t) => t?.t === 'pal' || t?.t === 'id';
const esConsulta = (t) => esPal(t, 'SELECT', 'WITH');
const clave = (t) => String(t.v).toLowerCase();

/** A token as it shows: a name between ` without them (the screen marks code with its own style). */
function comoSeEscribe(t) {
  if (t.t !== 'id') return t.v;
  if (t.q === '`') return /^[\p{L}_][\p{L}\p{N}_$]*$/u.test(t.v) ? t.v : `"${t.v}"`;
  return t.q === '[' ? `[${t.v}]` : `"${t.v}"`;
}

// ---- Reading ------------------------------------------------------------------------------------------------------

const FIN_CLAUSULA = new Set(['FROM', 'INTO', 'WHERE', 'GROUP', 'HAVING', 'ORDER', 'LIMIT', 'UNION', 'EXCEPT', 'INTERSECT', 'WINDOW', 'RETURNING', 'WITH']);
const JUNTAS = ['JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'CROSS', 'NATURAL', 'STRAIGHT_JOIN', 'OUTER'];
const FIN_ON = new Set([...FIN_CLAUSULA, ...JUNTAS, 'SET']);
const FIN_ORDEN = new Set([...FIN_CLAUSULA, 'ASC', 'DESC', 'NULLS']);
const FIN_LIMITE = new Set([...FIN_CLAUSULA, 'OFFSET']);
const FIN_SET = new Set(['WHERE', 'FROM', 'ORDER', 'LIMIT', 'RETURNING']);
// What can't be the alias of a table: it is what comes after it.
const FIN_DE_FUENTE = new Set([...FIN_ON, 'ON', 'USING', 'VALUES', 'SELECT', 'WITH', 'DEFAULT', 'INDEXED', 'NOT', 'USE', 'FORCE', 'IGNORE', 'OFFSET', 'AS']);
// Words of an expression: a column is never called like this, so they are never an alias.
const RESERVADAS = new Set(['AND', 'OR', 'NOT', 'IS', 'NULL', 'LIKE', 'IN', 'BETWEEN', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'DISTINCT', 'ESCAPE', 'COLLATE', 'EXISTS', 'AS', 'TRUE', 'FALSE', 'GLOB', 'REGEXP', 'MATCH', 'INTERVAL', 'BINARY', 'DIV', 'MOD', 'XOR', 'ALL', 'ANY', 'SOME']);
// LEFT( and RIGHT( are also functions of MySQL.
const TAMBIEN_FUNCION = new Set(['LEFT', 'RIGHT', 'REPLACE', 'INSERT']);

/** Each query, while it's being read, collects the names defined inside it (to tell what comes from outside). */
function nombrar(P, nombre) {
  for (const a of P.abiertas) a.definidos.add(nombre);
}

/**
 * The tokens of an expression up to a word of `fin` (or a comma, or the `)` that closes it) outside parentheses. A
 * SELECT between parentheses is read as a query of its own and stays as one token, with how it is used.
 */
function expresion(P, fin, { coma = true } = {}) {
  const c = P.c;
  const salida = [];
  let hondo = 0;
  while (!c.fin()) {
    const t = c.ver();
    if (hondo === 0) {
      if (esOp(t, ')') || esOp(t, ';') || (coma && esOp(t, ','))) break;
      if (t.t === 'pal' && fin.has(t.u) && !(TAMBIEN_FUNCION.has(t.u) && esOp(c.ver(1), '('))) break;
    }
    // A window function, or comparing against ANY/ALL of a list: not in the notes.
    if (esPal(t, 'OVER', 'ANY', 'SOME') || (esPal(t, 'ALL') && esOp(c.ver(1), '('))) no();
    if (esOp(t, '(') && esConsulta(c.ver(1))) {
      c.tomar();
      const sub = consulta(P);
      tomarOp(c, ')');
      const a = salida.at(-1);
      const negada = esPal(salida.at(-2), 'NOT');
      const uso = esPal(a, 'IN') ? (negada ? 'not in' : 'in') : esPal(a, 'EXISTS') ? (negada ? 'not exists' : 'exists') : 'valor';
      salida.push({ t: 'sub', sub, uso });
      continue;
    }
    if (esOp(t, '(')) hondo += 1;
    if (esOp(t, ')')) hondo -= 1;
    salida.push(c.tomar());
  }
  if (!salida.length || hondo !== 0) no();
  return salida;
}

function tomarPal(c, p) {
  if (!esPal(c.ver(), p)) no();
  return c.tomar();
}

function tomarOp(c, v) {
  if (!esOp(c.ver(), v)) no();
  return c.tomar();
}

function separadas(P, fin) {
  const lista = [expresion(P, fin)];
  while (esOp(P.c.ver(), ',')) {
    P.c.tomar();
    lista.push(expresion(P, fin));
  }
  return lista;
}

function nombresEntreParentesis(c) {
  tomarOp(c, '(');
  const lista = [];
  do {
    const t = c.tomar();
    if (!esNombre(t)) no();
    lista.push(comoSeEscribe(t));
  } while (esOp(c.ver(), ',') && c.tomar());
  tomarOp(c, ')');
  return lista;
}

function aliasSiHay(c) {
  if (esPal(c.ver(), 'AS')) {
    c.tomar();
    const t = c.tomar();
    if (!esNombre(t)) no();
    return t;
  }
  const t = c.ver();
  if (t?.t === 'id' || (t?.t === 'pal' && !FIN_DE_FUENTE.has(t.u))) return c.tomar();
  return null;
}

/** A table, a WITH or a subquery of the FROM, with its alias. */
function fuente(P, nombres, { destino = false } = {}) {
  const c = P.c;
  const t = c.ver();
  if (esOp(t, '(')) {
    if (!esConsulta(c.ver(1))) no();
    c.tomar();
    const sub = consulta(P);
    tomarOp(c, ')');
    const alias = aliasSiHay(c);
    if (alias) {
      nombres.add(clave(alias));
      nombrar(P, clave(alias));
    }
    return { tipo: 'sub', sub, alias: alias && comoSeEscribe(alias) };
  }
  if (!(t?.t === 'id' || (t?.t === 'pal' && !FIN_DE_FUENTE.has(t.u)))) no();
  c.tomar();
  let tabla = t;
  let nombre = comoSeEscribe(t);
  if (esOp(c.ver(), '.')) {
    c.tomar();
    tabla = c.tomar();
    if (!esNombre(tabla)) no();
    nombre = `${nombre}.${comoSeEscribe(tabla)}`;
  }
  // A function as a table isn't in the notes. Where rows go (INSERT INTO t (a, b)), the parenthesis is the columns.
  if (esOp(c.ver(), '(') && !destino) no();
  const alias = esOp(c.ver(), '(') ? null : aliasSiHay(c);
  if (esPal(c.ver(), 'INDEXED', 'USE', 'FORCE', 'IGNORE') || (esPal(c.ver(), 'NOT') && esPal(c.ver(1), 'INDEXED'))) no();
  for (const n of [clave(tabla), alias && clave(alias)].filter(Boolean)) {
    nombres.add(n);
    nombrar(P, n);
  }
  return { tipo: 'tabla', nombre, alias: alias && comoSeEscribe(alias), comun: P.comunes.has(clave(tabla)) };
}

/** The kind of JOIN that comes, taking its words; null if none comes. */
function juntaSiHay(c) {
  if (esPal(c.ver(), 'STRAIGHT_JOIN')) {
    c.tomar();
    return 'inner';
  }
  const palabras = [];
  let k = 0;
  while (esPal(c.ver(k), 'NATURAL', 'LEFT', 'RIGHT', 'FULL', 'OUTER', 'INNER', 'CROSS')) palabras.push(c.ver(k++).u);
  if (!esPal(c.ver(k), 'JOIN')) return null;
  for (let i = 0; i <= k; i++) c.tomar();
  if (palabras.includes('FULL')) no();
  if (palabras.includes('NATURAL')) return palabras.some((p) => p === 'LEFT' || p === 'RIGHT') ? no() : 'natural';
  if (palabras.includes('LEFT')) return 'left';
  if (palabras.includes('RIGHT')) return 'right';
  return palabras.includes('CROSS') ? 'cross' : 'inner';
}

/** The FROM: the tables in order, each with how it joins the ones before. */
function desde(P, nombres) {
  const c = P.c;
  const fuentes = [{ ...fuente(P, nombres), junta: null }];
  for (;;) {
    if (esOp(c.ver(), ',')) {
      c.tomar();
      fuentes.push({ ...fuente(P, nombres), junta: { clase: 'producto' } });
      continue;
    }
    const clase = juntaSiHay(c);
    if (!clase) break;
    const f = fuente(P, nombres);
    const junta = { clase, on: null, using: null };
    if (esPal(c.ver(), 'ON')) {
      c.tomar();
      junta.on = expresion(P, FIN_ON);
    } else if (esPal(c.ver(), 'USING')) {
      c.tomar();
      junta.using = nombresEntreParentesis(c);
    }
    const condicion = junta.on || junta.using;
    if (clase === 'natural' && condicion) no();
    if ((clase === 'left' || clase === 'right') && !condicion) no();
    // A JOIN without a condition (MySQL takes it) and a CROSS JOIN are the cartesian product; a CROSS JOIN with ON,
    // in MySQL, is a JOIN.
    if ((clase === 'inner' || clase === 'cross') && !condicion) junta.clase = 'producto';
    else if (clase === 'cross') junta.clase = 'inner';
    fuentes.push({ ...f, junta });
  }
  return fuentes;
}

function destinos(c) {
  tomarPal(c, 'INTO');
  if (esPal(c.ver(), 'OUTFILE', 'DUMPFILE')) no();
  const lista = [];
  do {
    const t = c.tomar();
    if (!(t.t === 'var' || esNombre(t))) no();
    lista.push(comoSeEscribe(t));
  } while (esOp(c.ver(), ',') && c.tomar());
  return lista;
}

// Where an expression has a word at its first level.
function enCero(ts, prueba) {
  let hondo = 0;
  for (let i = 0; i < ts.length; i++) {
    if (esOp(ts[i], '(')) hondo += 1;
    else if (esOp(ts[i], ')')) hondo -= 1;
    else if (hondo === 0 && prueba(ts[i])) return i;
  }
  return -1;
}

/** A column of the SELECT: *, t.*, or an expression with its alias (with AS or without it, as the notes write it). */
function columna(P) {
  const ts = expresion(P, FIN_CLAUSULA);
  if (ts.length === 1 && esOp(ts[0], '*')) return { todo: true };
  if (ts.length === 3 && esNombre(ts[0]) && esOp(ts[1], '.') && esOp(ts[2], '*')) return { todoDe: comoSeEscribe(ts[0]) };
  const k = enCero(ts, (t) => esPal(t, 'AS'));
  if (k !== -1) {
    if (k !== ts.length - 2 || !(esNombre(ts[k + 1]) || ts[k + 1].t === 'txt')) no();
    return { ts: ts.slice(0, k), alias: comoSeEscribe(ts[k + 1]) };
  }
  const u = ts.at(-1);
  const p = ts.at(-2);
  const aliasPosible = u?.t === 'id' || u?.t === 'txt' || (u?.t === 'pal' && !RESERVADAS.has(u.u));
  const antesPosible = p && (p.t === 'id' || p.t === 'num' || p.t === 'var' || p.t === 'sub' || esOp(p, ')') || (p.t === 'pal' && (!RESERVADAS.has(p.u) || p.u === 'END')) || (p.t === 'txt' && u?.t !== 'txt'));
  if (ts.length > 1 && aliasPosible && antesPosible && !(esOp(p, '.'))) return { ts: ts.slice(0, -1), alias: comoSeEscribe(u) };
  return { ts, alias: null };
}

function nucleo(P) {
  const c = P.c;
  tomarPal(c, 'SELECT');
  const n = { distinct: false, columnas: [], into: null, fuentes: null, donde: null, grupo: null, tener: null, nombres: new Set() };
  if (esPal(c.ver(), 'DISTINCT')) {
    c.tomar();
    n.distinct = true;
  } else if (esPal(c.ver(), 'ALL')) c.tomar();
  if (esPal(c.ver(), 'DISTINCTROW', 'SQL_CALC_FOUND_ROWS', 'HIGH_PRIORITY', 'STRAIGHT_JOIN', 'TOP')) no();
  n.columnas.push(columna(P));
  while (esOp(c.ver(), ',')) {
    c.tomar();
    n.columnas.push(columna(P));
  }
  if (esPal(c.ver(), 'INTO')) n.into = destinos(c);
  if (esPal(c.ver(), 'FROM')) {
    c.tomar();
    n.fuentes = desde(P, n.nombres);
  }
  if (esPal(c.ver(), 'WHERE')) {
    c.tomar();
    n.donde = expresion(P, FIN_CLAUSULA);
  }
  if (esPal(c.ver(), 'GROUP')) {
    c.tomar();
    tomarPal(c, 'BY');
    n.grupo = separadas(P, FIN_CLAUSULA);
    if (esPal(c.ver(), 'WITH')) no();
  }
  if (esPal(c.ver(), 'HAVING')) {
    c.tomar();
    n.tener = expresion(P, FIN_CLAUSULA);
  }
  if (esPal(c.ver(), 'WINDOW')) no();
  return n;
}

function parte(P) {
  const c = P.c;
  if (esOp(c.ver(), '(') && esConsulta(c.ver(1))) {
    c.tomar();
    const q = consulta(P);
    tomarOp(c, ')');
    return { anidada: q };
  }
  return nucleo(P);
}

function comunes(P, q) {
  const c = P.c;
  tomarPal(c, 'WITH');
  if (esPal(c.ver(), 'RECURSIVE')) no();
  do {
    const t = c.tomar();
    if (!esNombre(t)) no();
    if (esOp(c.ver(), '(')) nombresEntreParentesis(c);
    tomarPal(c, 'AS');
    if (esPal(c.ver(), 'NOT')) {
      c.tomar();
      tomarPal(c, 'MATERIALIZED');
    } else if (esPal(c.ver(), 'MATERIALIZED')) c.tomar();
    tomarOp(c, '(');
    const sub = consulta(P);
    tomarOp(c, ')');
    q.comunes.push({ nombre: comoSeEscribe(t), q: sub });
    P.comunes.add(clave(t));
    nombrar(P, clave(t));
  } while (esOp(c.ver(), ',') && c.tomar());
}

function orden(P) {
  const c = P.c;
  tomarPal(c, 'ORDER');
  tomarPal(c, 'BY');
  const lista = [];
  do {
    const ts = expresion(P, FIN_ORDEN);
    const dir = esPal(c.ver(), 'ASC', 'DESC') ? c.tomar().u : null;
    if (esPal(c.ver(), 'NULLS')) no();
    lista.push({ ts, dir });
  } while (esOp(c.ver(), ',') && c.tomar());
  return lista;
}

function limite(P) {
  const c = P.c;
  tomarPal(c, 'LIMIT');
  const a = expresion(P, FIN_LIMITE);
  if (esOp(c.ver(), ',')) {
    c.tomar();
    return { cuantas: expresion(P, FIN_LIMITE), saltea: a };
  }
  if (esPal(c.ver(), 'OFFSET')) {
    c.tomar();
    return { cuantas: a, saltea: expresion(P, FIN_LIMITE) };
  }
  return { cuantas: a, saltea: null };
}

// Each name.column written inside a query: what the query takes from outside, if the name isn't defined in it.
function calificadas(ts) {
  const m = new Map();
  for (let i = 0; i + 2 < ts.length; i++) {
    const [a, p, b] = [ts[i], ts[i + 1], ts[i + 2]];
    if (esNombre(a) && esOp(p, '.') && (esNombre(b) || esOp(b, '*')) && !esOp(ts[i - 1], '.')) {
      if (!m.has(clave(a))) m.set(clave(a), []);
      const texto = `${comoSeEscribe(a)}.${comoSeEscribe(b)}`;
      if (!m.get(clave(a)).includes(texto)) m.get(clave(a)).push(texto);
    }
  }
  return m;
}

/** A whole query: WITH, its SELECTs joined by UNION, EXCEPT or INTERSECT, ORDER BY and LIMIT. */
function consulta(P, previa = null) {
  const c = P.c;
  const q = { tipo: 'select', comunes: previa?.comunes ?? [], partes: [], ops: [], orden: null, limite: null, definidos: new Set(), desde: c.i };
  P.abiertas.push(q);
  if (!previa && esPal(c.ver(), 'WITH')) comunes(P, q);
  q.partes.push(parte(P));
  while (esPal(c.ver(), 'UNION', 'EXCEPT', 'INTERSECT')) {
    let op = c.tomar().u;
    if (op === 'UNION' && esPal(c.ver(), 'ALL')) {
      c.tomar();
      op = 'UNION ALL';
    } else if (esPal(c.ver(), 'DISTINCT')) c.tomar();
    q.ops.push(op);
    q.partes.push(parte(P));
  }
  if (esPal(c.ver(), 'ORDER')) q.orden = orden(P);
  if (esPal(c.ver(), 'LIMIT')) q.limite = limite(P);
  // MySQL also takes the INTO at the end.
  if (esPal(c.ver(), 'INTO')) {
    const [unica] = q.partes;
    if (q.partes.length > 1 || unica.anidada || unica.into) no();
    unica.into = destinos(c);
  }
  P.abiertas.pop();
  q.calificadas = calificadas(c.ts.slice(q.desde, c.i));
  return q;
}

function insertar(P) {
  const c = P.c;
  const s = { tipo: 'insert', columnas: null, filas: null, valores: [], consulta: null, defecto: false, nombres: new Set(), definidos: new Set() };
  P.abiertas.push(s);
  tomarPal(c, 'INSERT');
  tomarPal(c, 'INTO');
  s.tabla = fuente(P, s.nombres, { destino: true });
  if (s.tabla.tipo !== 'tabla') no();
  if (esOp(c.ver(), '(') && !esConsulta(c.ver(1))) s.columnas = nombresEntreParentesis(c);
  if (esPal(c.ver(), 'VALUES', 'VALUE')) {
    c.tomar();
    s.filas = 0;
    do {
      tomarOp(c, '(');
      s.valores.push(...separadas(P, new Set()));
      tomarOp(c, ')');
      s.filas += 1;
    } while (esOp(c.ver(), ',') && c.tomar());
  } else if (esPal(c.ver(), 'DEFAULT')) {
    c.tomar();
    tomarPal(c, 'VALUES');
    s.defecto = true;
  } else if (esConsulta(c.ver()) || (esOp(c.ver(), '(') && esConsulta(c.ver(1)))) {
    s.consulta = consulta(P);
  } else no();
  P.abiertas.pop();
  return s;
}

function actualizar(P) {
  const c = P.c;
  const s = { tipo: 'update', set: [], donde: null, nombres: new Set(), definidos: new Set() };
  P.abiertas.push(s);
  tomarPal(c, 'UPDATE');
  if (esPal(c.ver(), 'OR', 'LOW_PRIORITY', 'IGNORE')) no();
  s.fuentes = desde(P, s.nombres);
  tomarPal(c, 'SET');
  do {
    const ts = expresion(P, FIN_SET);
    if (enCero(ts, (t) => esOp(t, '=')) < 1) no();
    s.set.push(ts);
  } while (esOp(c.ver(), ',') && c.tomar());
  if (esPal(c.ver(), 'WHERE')) {
    c.tomar();
    s.donde = expresion(P, FIN_SET);
  }
  P.abiertas.pop();
  return s;
}

function borrar(P) {
  const c = P.c;
  const s = { tipo: 'delete', donde: null, nombres: new Set(), definidos: new Set() };
  P.abiertas.push(s);
  tomarPal(c, 'DELETE');
  tomarPal(c, 'FROM');
  s.tabla = fuente(P, s.nombres);
  if (s.tabla.tipo !== 'tabla') no();
  if (esPal(c.ver(), 'WHERE')) {
    c.tomar();
    s.donde = expresion(P, FIN_SET);
  }
  P.abiertas.pop();
  return s;
}

function sentencia(P) {
  const c = P.c;
  if (esPal(c.ver(), 'EXPLAIN')) {
    c.tomar();
    if (esPal(c.ver(), 'QUERY')) {
      c.tomar();
      tomarPal(c, 'PLAN');
    }
  }
  let previa = null;
  if (esPal(c.ver(), 'WITH')) {
    previa = { comunes: [], definidos: new Set() };
    P.abiertas.push(previa);
    comunes(P, previa);
    P.abiertas.pop();
  }
  const t = c.ver();
  let s;
  if (esPal(t, 'SELECT') || (esOp(t, '(') && esConsulta(c.ver(1)))) s = consulta(P, previa);
  else if (esPal(t, 'INSERT')) s = insertar(P);
  else if (esPal(t, 'UPDATE')) s = actualizar(P);
  else if (esPal(t, 'DELETE')) s = borrar(P);
  else no();
  if (previa && s.tipo !== 'select') s.comunes = previa.comunes;
  if (esOp(c.ver(), ';')) c.tomar();
  if (!c.fin()) no();
  return s;
}

function cursor(ts) {
  let i = 0;
  return {
    ts,
    get i() {
      return i;
    },
    ver: (k = 0) => ts[i + k],
    tomar: () => {
      if (i >= ts.length) no();
      return ts[i++];
    },
    fin: () => i >= ts.length,
  };
}

// ---- Writing ------------------------------------------------------------------------------------------------------

const texto = (t) => ({ texto: t });
const cod = (t) => ({ texto: t, codigo: true });

/** Pieces from strings (text) and cod() (code), joining the text that comes together. */
function frase(...partes) {
  const trozos = [];
  for (const p of partes.flat()) {
    const t = typeof p === 'string' ? texto(p) : p;
    if (!t.texto) continue;
    const ultimo = trozos.at(-1);
    if (ultimo && !ultimo.codigo && !t.codigo) ultimo.texto += t.texto;
    else trozos.push({ ...t });
  }
  return trozos;
}

// «y» is «e» before a word that sounds like i.
const conY = (t) => (!t.codigo && /^h?i(?![aeiouáéíóú])/i.test(t.texto) ? ' e ' : ' y ');

/** Items (each one pieces) as «a, b y c». */
function lista(items) {
  const salida = [];
  items.forEach((it, i) => {
    if (i > 0) salida.push(texto(i === items.length - 1 ? conY(it[0]) : ', '));
    salida.push(...it);
  });
  return salida;
}

const NO_ESPACIO_ANTES = new Set([',', ')', '.']);
const NO_ESPACIO_DESPUES = new Set(['(', '.', '~', '!']);
// Words that keep a space before their parenthesis: they aren't a function.
const PALABRA_Y_PARENTESIS = new Set(['IN', 'EXISTS', 'AND', 'OR', 'NOT', 'ON', 'AS', 'VALUES', 'THEN', 'ELSE', 'WHEN', 'LIKE', 'BETWEEN', 'IS', 'CASE', 'DISTINCT', 'USING', 'SELECT', 'FROM', 'WHERE', 'SET', 'INTERVAL']);

function numero(t, ctx) {
  if (t.n == null) t.n = ++ctx.cuenta.n;
  return t.n;
}

/** The tokens of an expression as text, with the spaces even. A subquery says its number. */
function escribir(ts, ctx) {
  let s = '';
  ts.forEach((t, i) => {
    const v = t.t === 'sub' ? (ctx ? `(subconsulta ${numero(t, ctx)})` : '(subconsulta)') : comoSeEscribe(t);
    const previo = ts[i - 1];
    if (previo) {
      const unario = (esOp(previo, '-') || esOp(previo, '+')) && (i === 1 || (ts[i - 2].t === 'op' && ts[i - 2].v !== ')') || (ts[i - 2].t === 'pal' && RESERVADAS.has(ts[i - 2].u)));
      const funcion = esOp(t, '(') && ((previo.t === 'pal' && !PALABRA_Y_PARENTESIS.has(previo.u)) || previo.t === 'id');
      const pegado = (t.t === 'op' && NO_ESPACIO_ANTES.has(t.v)) || (previo.t === 'op' && NO_ESPACIO_DESPUES.has(previo.v)) || funcion || unario;
      if (!pegado) s += ' ';
    }
    s += v;
  });
  return s;
}

const AGREGADAS = new Set(['COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'GROUP_CONCAT']);

/** The functions of group (or aggregation, as the notes say) of an expression, outside its subqueries. */
function agregadas(ts) {
  const salida = [];
  for (let i = 0; i < ts.length; i++) {
    const t = ts[i];
    if (!(t.t === 'pal' && AGREGADAS.has(t.u) && esOp(ts[i + 1], '('))) continue;
    let hondo = 0;
    let j = i + 1;
    for (; j < ts.length; j++) {
      if (esOp(ts[j], '(')) hondo += 1;
      else if (esOp(ts[j], ')') && --hondo === 0) break;
    }
    const adentro = ts.slice(i + 2, j);
    // min(a, b) and max(a, b) of SQLite compare two values of the same row.
    if ((t.u === 'MIN' || t.u === 'MAX') && enCero(adentro, (x) => esOp(x, ',')) !== -1) continue;
    const distinct = esPal(adentro[0], 'DISTINCT');
    const arg = esPal(adentro[0], 'DISTINCT', 'ALL') ? adentro.slice(1) : adentro;
    salida.push({ fn: t.u, distinct, arg, clave: escribir(ts.slice(i, j + 1)).toLowerCase() });
    i = j;
  }
  return salida;
}

function fraseDeAgregada(a, grupo, ctx) {
  const x = cod(escribir(a.arg, ctx));
  const en = grupo ? ' en cada grupo' : '';
  const de = grupo ? ' de cada grupo' : '';
  const todas = a.arg.length === 1 && (esOp(a.arg[0], '*') || a.arg[0].t === 'num');
  switch (a.fn) {
    case 'COUNT':
      if (todas && !a.distinct) return frase(`Cuenta las filas${de}.`);
      return a.distinct ? frase('Cuenta los valores diferentes de ', x, `${en}.`) : frase(`Cuenta las filas${de} con `, x, ' no nulo.');
    case 'SUM':
      return frase(a.distinct ? 'Suma los valores diferentes de ' : 'Suma ', x, `${en}.`);
    case 'AVG':
      return frase(a.distinct ? 'Saca el promedio de los valores diferentes de ' : 'Saca el promedio de ', x, `${en}.`);
    case 'MIN':
      return frase('Busca el menor ', x, `${de}.`);
    case 'MAX':
      return frase('Busca el mayor ', x, `${de}.`);
    default:
      return frase('Junta los valores de ', x, ` en un texto${grupo ? ' por grupo' : ''}.`);
  }
}

const paso = (trozos, hijos = []) => ({ trozos, hijos });
const de = (nombre) => (nombre.startsWith('el ') ? `del ${nombre.slice(3)}` : `de ${nombre}`);
const y = (nombre) => conY(texto(nombre)).trim();

/** What a subquery is for, and what it takes from the query outside (then it runs again for each row). */
function subconsulta(t, ctx) {
  const n = numero(t, ctx);
  const uso = {
    in: [`La subconsulta ${n} arma la lista del `, cod('IN'), '.'],
    'not in': [`La subconsulta ${n} arma la lista del `, cod('NOT IN'), '.'],
    exists: [`La subconsulta ${n} es la del `, cod('EXISTS'), '. Cumple si trae al menos una fila.'],
    'not exists': [`La subconsulta ${n} es la del `, cod('NOT EXISTS'), '. Cumple si no trae ninguna fila.'],
    valor: [`La subconsulta ${n} da un solo valor.`],
  }[t.uso];
  const deAfuera = [...t.sub.calificadas].filter(([q]) => !t.sub.definidos.has(q) && ctx.afuera.some((s) => s.has(q))).flatMap(([, textos]) => textos);
  const afuera = deAfuera.length ? [' Usa ', ...lista(deAfuera.map((d) => [cod(d)])), ' de la consulta de afuera. Se corre de nuevo para cada fila.'] : [];
  return paso(frase(...uso, ...afuera), pasosConsulta(t.sub, { ...ctx, verbo: 'devuelve' }));
}

/** A step and, below it, each subquery of `listas` (the tokens it says), in the order they're written. */
function conSubs(trozos, listas, ctx) {
  const hijos = [];
  for (const ts of listas) for (const t of ts) if (t.t === 'sub') hijos.push(subconsulta(t, ctx));
  return paso(trozos, hijos);
}

function nombreDe(f) {
  if (f.tipo === 'sub') return f.alias ? `la subconsulta ${f.alias}` : 'la subconsulta';
  if (f.comun) return `la tabla común ${f.nombre}`;
  return f.alias ? `${f.nombre} (${f.alias})` : f.nombre;
}

// A subquery of the FROM shows below how it's made. It never takes from the query that uses it.
const hijosDeFuente = (f, ctx) => (f.tipo === 'sub' ? pasosConsulta(f.sub, { ...ctx, verbo: 'devuelve' }) : []);

/** The FROM and its JOINs, in the words of the notes: the first table, and each one combined with what came before. */
function pasosDesde(fuentes, ctx) {
  const [primera] = fuentes;
  if (fuentes.length === 1) return [paso(frase(`Toma las filas ${de(nombreDe(primera))}.`), hijosDeFuente(primera, ctx))];
  const pasos = [];
  for (let i = 1; i < fuentes.length; i++) {
    const f = fuentes[i];
    const { clase, on, using } = f.junta;
    const izq = i === 1 ? nombreDe(primera) : 'el resultado';
    const der = nombreDe(f);
    const hijos = [...(i === 1 ? hijosDeFuente(primera, ctx) : []), ...hijosDeFuente(f, ctx)];
    const cuando = on ? [' cuando ', cod(escribir(on, ctx))] : using ? [' cuando coinciden en ', ...lista(using.map((u) => [cod(u)]))] : [];
    let trozos;
    if (clase === 'producto') trozos = frase(`Arma el producto cartesiano ${de(izq)} ${y(der)} ${der}. Son todas las combinaciones de filas.`);
    else if (clase === 'natural') trozos = frase(`Hace el producto natural ${de(izq)} ${y(der)} ${der}. Combina por las columnas que se llaman igual.`);
    else if (clase === 'inner') trozos = frase(`Combina ${izq} con ${der}`, cuando, i === 1 ? '. Quedan solo las filas con coincidencia en las dos tablas.' : '. Quedan solo las filas con coincidencia.');
    else if (clase === 'left') trozos = frase(`Combina ${izq} con ${der}`, cuando, `. Quedan todas las filas ${de(izq)}. Las ${de(der)}, si hay. Si no hay, quedan en nulo.`);
    else trozos = frase(`Combina ${izq} con ${der}`, cuando, `. Quedan todas las filas ${de(der)}. Las ${de(izq)}, si hay. Si no hay, quedan en nulo.`);
    pasos.push(paso(trozos, [...hijos, ...conSubs(trozos, on ? [on] : [], ctx).hijos]));
  }
  return pasos;
}

const numeroSolo = (ts) => (ts.length === 1 && ts[0].t === 'num' ? ts[0].v : null);

// A column of GROUP BY or ORDER BY: by its number, or as it is written.
const referencia = (ts, ctx) => (numeroSolo(ts) ? [texto(`la columna ${numeroSolo(ts)}`)] : [cod(escribir(ts, ctx))]);

function pasoOrden(lista_, ctx) {
  const items = lista_.map((o) => [...referencia(o.ts, ctx), ...(o.dir === 'DESC' ? [texto(' descendente')] : o.dir === 'ASC' ? [texto(' ascendente')] : [])]);
  return conSubs(frase('Ordena por ', lista(items), '.'), lista_.map((o) => o.ts), ctx);
}

function pasoLimite({ cuantas, saltea }, ctx) {
  const como = (ts) => (numeroSolo(ts) ? texto(numeroSolo(ts)) : cod(escribir(ts, ctx)));
  const n = numeroSolo(cuantas);
  if (saltea) {
    const s = numeroSolo(saltea);
    return paso(frase('Saltea ', como(saltea), s === '1' ? ' fila' : ' filas', n === '1' ? '. Se queda con la siguiente.' : ['. Se queda con las ', como(cuantas), ' siguientes.']));
  }
  return paso(n === '1' ? frase('Se queda con la primera fila.') : frase('Se queda con las primeras ', como(cuantas), ' filas.'));
}

const VERBOS = { muestra: 'Muestra', devuelve: 'Devuelve', arma: 'Arma cada fila nueva con' };

/** The SELECT: what it shows (or returns, or what each new row of an INSERT has), or where MySQL keeps it (INTO). */
function proyeccion(n, ctx) {
  const items = n.columnas.map((c) => {
    if (c.todo) return [texto('todas las columnas')];
    if (c.todoDe) return [texto(`todas las columnas de ${c.todoDe}`)];
    return [cod(escribir(c.ts, ctx)), ...(c.alias ? [texto(' como '), cod(c.alias)] : [])];
  });
  const listas = n.columnas.map((c) => c.ts ?? []);
  if (n.into) {
    if (n.into.length !== n.columnas.length || !n.columnas.every((c) => c.ts)) no();
    const pares = n.columnas.map((c, i) => [cod(escribir(c.ts, ctx)), texto(' en '), cod(n.into[i])]);
    return conSubs(frase('Guarda ', lista(pares), '.'), listas, ctx);
  }
  const verbo = VERBOS[ctx.verbo];
  if (items.length > 4) return paso(frase(`${verbo} estas columnas:`), items.map((trozos, i) => conSubs(trozos, [listas[i]], ctx)));
  return conSubs(frase(`${verbo} `, lista(items), '.'), listas, ctx);
}

function pasosNucleo(n, ctx, { orden: ordenDeAfuera = null } = {}) {
  const aca = { ...ctx, afuera: [...ctx.afuera, n.nombres] };
  const pasos = [];
  if (n.fuentes) pasos.push(...pasosDesde(n.fuentes, aca));
  if (n.donde) pasos.push(conSubs(frase('Se queda con las filas que cumplen ', cod(escribir(n.donde, aca)), '.'), [n.donde], aca));
  const vistas = new Set();
  const aggs = [...n.columnas.map((c) => c.ts ?? []), n.tener ?? [], ...(ordenDeAfuera ?? []).map((o) => o.ts)].flatMap(agregadas).filter((a) => !vistas.has(a.clave) && vistas.add(a.clave));
  if (n.grupo) pasos.push(conSubs(frase('Agrupa las filas por ', lista(n.grupo.map((g) => referencia(g, aca))), '.'), n.grupo, aca));
  else if ((aggs.length || n.tener) && n.fuentes) pasos.push(paso(frase('Toma todas las filas como un solo grupo.')));
  for (const a of aggs) pasos.push(paso(fraseDeAgregada(a, Boolean(n.grupo), aca)));
  if (n.tener) pasos.push(conSubs(frase('Se queda con los grupos que cumplen ', cod(escribir(n.tener, aca)), '.'), [n.tener], aca));
  pasos.push(proyeccion(n, aca));
  if (n.distinct) pasos.push(paso(frase('Saca las filas repetidas (', cod('DISTINCT'), ').')));
  return pasos;
}

function fraseDeOp(op, i) {
  const k = i + 2;
  const primera = i === 0;
  switch (op) {
    case 'UNION':
    case 'UNION ALL': {
      const resto = op === 'UNION' ? '). Saca las repetidas.' : '). Deja las repetidas.';
      return frase(primera ? 'Une las filas de las consultas 1 y 2 (' : `Le suma las filas de la consulta ${k} (`, cod(op), resto);
    }
    case 'EXCEPT':
      return frase(primera ? 'Se queda con las filas de la consulta 1 que no están en la 2 (' : `Le saca las filas que están en la consulta ${k} (`, cod(op), ').');
    default:
      return frase(primera ? 'Se queda con las filas que están en las consultas 1 y 2 (' : `Se queda con las filas que también están en la consulta ${k} (`, cod(op), ').');
  }
}

function pasosComunes(comunes_, ctx) {
  return comunes_.map((cte) => paso(frase('Arma la tabla común ', cod(cte.nombre), '.'), pasosConsulta(cte.q, { ...ctx, verbo: 'devuelve' })));
}

function pasosConsulta(q, ctx) {
  const pasos = pasosComunes(q.comunes, ctx);
  if (q.partes.length === 1) {
    const [p] = q.partes;
    pasos.push(...(p.anidada ? pasosConsulta(p.anidada, ctx) : pasosNucleo(p, ctx, { orden: q.orden })));
  } else {
    q.partes.forEach((p, i) => pasos.push(paso(frase(`Consulta ${i + 1}.`), p.anidada ? pasosConsulta(p.anidada, { ...ctx, verbo: 'devuelve' }) : pasosNucleo(p, { ...ctx, verbo: 'devuelve' }))));
    q.ops.forEach((op, i) => pasos.push(paso(fraseDeOp(op, i))));
  }
  if (q.orden) pasos.push(pasoOrden(q.orden, ctx));
  if (q.limite) pasos.push(pasoLimite(q.limite, ctx));
  return pasos;
}

// INSERT, UPDATE and DELETE: which rows they change, and how. The notes: «DELETE borra filas y la tabla sigue».
function pasosDeCambio(s, ctx) {
  const aca = { ...ctx, afuera: [...ctx.afuera, s.nombres] };
  const pasos = pasosComunes(s.comunes ?? [], ctx);
  const completa = s.columnas ? [' Completa ', ...lista(s.columnas.map((c) => [cod(c)])), '.'] : [];
  if (s.tipo === 'insert') {
    const tabla = nombreDe(s.tabla);
    if (s.filas != null) pasos.push(conSubs(frase(s.filas === 1 ? `Agrega 1 fila a ${tabla}.` : `Agrega ${s.filas} filas a ${tabla}.`, completa), s.valores, aca));
    else if (s.defecto) pasos.push(paso(frase(`Agrega 1 fila a ${tabla}, con los valores por defecto.`)));
    else {
      pasos.push(...pasosConsulta(s.consulta, { ...ctx, verbo: 'arma' }));
      pasos.push(paso(frase(`Agrega esas filas a ${tabla}.`, completa)));
    }
    return pasos;
  }
  const fuentes = s.tipo === 'update' ? s.fuentes : [{ ...s.tabla, junta: null }];
  const tabla = nombreDe(fuentes[0]);
  if (fuentes.length > 1) {
    pasos.push(...pasosDesde(fuentes, aca));
    if (s.donde) pasos.push(conSubs(frase('Se queda con las filas que cumplen ', cod(escribir(s.donde, aca)), '.'), [s.donde], aca));
  } else if (s.donde) pasos.push(conSubs(frase(`Toma las filas ${de(tabla)} que cumplen `, cod(escribir(s.donde, aca)), '.'), [s.donde], aca));
  else pasos.push(paso(frase(`Toma todas las filas ${de(tabla)}, porque no tiene `, cod('WHERE'), '.')));
  if (s.tipo === 'update') pasos.push(conSubs(frase('En esas filas pone ', lista(s.set.map((ts) => [cod(escribir(ts, aca))])), '.'), s.set, aca));
  else pasos.push(paso(frase('Borra esas filas. La tabla sigue.')));
  return pasos;
}

/**
 * What the statement `sql` does, step by step in the order it's evaluated: [{ trozos: [{ texto, codigo }], hijos }].
 * Null if it isn't a SELECT, INSERT, UPDATE or DELETE this reader knows: it never guesses.
 */
export function queHace(sql) {
  try {
    const P = { c: cursor(fichas(sql)), abiertas: [], comunes: new Set() };
    const s = sentencia(P);
    const ctx = { cuenta: { n: 0 }, afuera: [], verbo: 'muestra' };
    const pasos = s.tipo === 'select' ? pasosConsulta(s, ctx) : pasosDeCambio(s, ctx);
    return pasos.length ? pasos : null;
  } catch (e) {
    if (e instanceof NoEntiendo || e instanceof RangeError) return null;
    throw e;
  }
}

/** The steps as text, with the code between `: for the tests and for whoever reads them without a screen. */
export function comoTexto(pasos) {
  return pasos.map((p) => {
    const linea = p.trozos.map((t) => (t.codigo ? `\`${t.texto}\`` : t.texto)).join('');
    return p.hijos.length ? [linea, comoTexto(p.hijos)] : linea;
  });
}
