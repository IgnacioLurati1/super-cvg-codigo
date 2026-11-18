// «Explicar la consulta»: what EXPLAIN QUERY PLAN says, as a tree in plain words. SQLite names each table by its alias
// (SCAN a): the statement says which table that is. Pure, with the rows as the worker sends them.
import { sinTextos } from './dialecto';
import { comienzo, final } from './sqlLinea';

const lineaEn = (texto, i) => texto.slice(0, i).split('\n').length;

/**
 * The statement where the cursor (`posicion`) is. Between two: the one before if the cursor is still on the line where
 * it ended, the next one if not (a comment above a query is about it). Null if there's none.
 */
export function sentenciaEn(sql, posicion = 0) {
  const texto = String(sql ?? '');
  let desde = 0;
  let previa = null;
  while (desde < texto.length) {
    const inicio = comienzo(texto, desde);
    if (inicio >= texto.length) break;
    const fin = final(texto, inicio);
    const sentencia = { texto: texto.slice(inicio, fin).replace(/;\s*$/, '').trim(), inicio, fin, linea: lineaEn(texto, inicio) };
    if (sentencia.texto) {
      if (posicion < fin || (posicion <= fin && fin === texto.length)) {
        if (posicion >= inicio || !previa) return sentencia;
        return lineaEn(texto, posicion) === lineaEn(texto, previa.fin) ? previa : sentencia;
      }
      previa = sentencia;
    }
    desde = fin;
  }
  return previa;
}

/** What goes to the engine to explain `sentencia`: on its own line, so an error keeps the line of the editor. */
/** Whether SQLite has a plan for it: a query or a change of rows. A CREATE, DROP or ALTER has none, and EXPLAIN QUERY
 * PLAN before one skips the MySQL translation the run does (a `.sql` from «Crear SQL» would fail on AUTO_INCREMENT). */
export function tienePlan(sentencia) {
  const s = String(sentencia?.texto ?? '').replace(/^\s*EXPLAIN\s+(QUERY\s+PLAN\s+)?/i, '');
  return /^\s*\(?\s*(SELECT|WITH|INSERT|UPDATE|DELETE|REPLACE|VALUES)\b/i.test(s);
}

export function consultaParaExplicar(sentencia) {
  const ya = /^\s*EXPLAIN\b/i.test(sentencia.texto);
  return `${'\n'.repeat(Math.max(0, sentencia.linea - 1))}${ya ? '' : 'EXPLAIN QUERY PLAN '}${sentencia.texto.replace(/^\s*EXPLAIN\s+(QUERY\s+PLAN\s+)?/i, ya ? 'EXPLAIN QUERY PLAN ' : '')};`;
}

const PALABRAS = new Set('on where join left right inner outer cross full natural group order limit using set values union except intersect window having as select from and or not natural returning'.split(' '));
const sinComillas = (n) => String(n).replace(/^[["`]|[\]"`]$/g, '');

/** Which table each alias of `sentencia` is (only names that are tables of `tablas`), and the names of its WITH. */
export function nombresDe(sentencia, tablas = []) {
  const s = sinTextos(String(sentencia ?? ''));
  const conocidas = new Map(tablas.map((t) => [t.nombre.toLowerCase(), t.nombre]));
  const alias = new Map();
  const id = String.raw`(\[[^\]]+\]|"[^"]+"|\x60[^\x60]+\x60|[\w$]+)`;
  const re = new RegExp(String.raw`(?:\bFROM|\bJOIN|\bUPDATE|\bINTO|,)\s+${id}(?:\s+(?:AS\s+)?${id})?`, 'gi');
  for (const m of s.matchAll(re)) {
    const tabla = conocidas.get(sinComillas(m[1]).toLowerCase());
    const otro = m[2] && sinComillas(m[2]);
    if (tabla && otro && !PALABRAS.has(otro.toLowerCase())) alias.set(otro.toLowerCase(), tabla);
  }
  const cte = new Set();
  const conWith = /^\s*WITH\s+(?:RECURSIVE\s+)?/i.exec(s);
  if (conWith) {
    for (const m of s.slice(conWith[0].length).matchAll(new RegExp(String.raw`(?:^|,)\s*${id}\s*(?:\([^)]*\))?\s+AS\s+(?:(?:NOT\s+)?MATERIALIZED\s+)?\(`, 'gi'))) cte.add(sinComillas(m[1]).toLowerCase());
  }
  return { alias, cte, conocidas };
}

/** How to call what SQLite names `n` in a step: a table (with its alias), a WITH or a subquery. */
function quien(n, nombres) {
  const limpio = sinComillas(n);
  const k = limpio.toLowerCase();
  if (/^\(subquery-\d+\)$/.test(limpio)) return { texto: 'la subconsulta', tabla: false };
  if (nombres.alias.has(k)) return { texto: `${nombres.alias.get(k)} (${limpio})`, tabla: true };
  if (nombres.conocidas.has(k)) return { texto: nombres.conocidas.get(k), tabla: true };
  if (nombres.cte.has(k)) return { texto: `${limpio} (la del WITH)`, tabla: false };
  return { texto: limpio, tabla: false };
}

// The columns of «(legajo=? AND anio>?)»: the key is its own thing.
function porQue(condicion) {
  if (!condicion) return '';
  const columnas = [...new Set(condicion.split(/\s+AND\s+/i).map((c) => /^\s*([\w$]+)/.exec(c)?.[1]).filter(Boolean))];
  if (!columnas.length || columnas.every((c) => c === 'rowid')) return '';
  const lista = columnas.length === 1 ? columnas[0] : `${columnas.slice(0, -1).join(', ')} y ${columnas.at(-1)}`;
  return `, por ${lista}`;
}

// The index SQLite made by itself for a key or a UNIQUE has a name of its own: it is said so.
const indice = (i) => (/^sqlite_autoindex_/i.test(i) ? 'el índice automático de la clave o el UNIQUE' : `el índice ${i}`);
const delIndice = (i) => indice(i).replace(/^el /, 'del ');

/** One step of the plan, in words. `bucle`: the table is gone through again for each row of the one before. */
function paso(detalle, nombres) {
  const d = String(detalle ?? '').trim();
  let m;
  const izquierda = / LEFT-JOIN$/.test(d) ? ', del LEFT JOIN' : '';
  const sinLeft = d.replace(/ LEFT-JOIN$/, '');
  if (d === 'SCAN CONSTANT ROW') return { texto: 'No lee ninguna tabla, solo calcula el resultado.' };
  if ((m = /^SCAN (\S+(?: \S+)*?)(?: USING (COVERING )?INDEX (\S+))?(?: VIRTUAL TABLE INDEX .*)?$/.exec(sinLeft))) {
    const q = quien(m[1], nombres);
    if (m[3] && m[2]) return { texto: `Recorre todo ${indice(m[3])}, sin abrir la tabla ${q.texto}${izquierda}.`, bucle: true };
    if (m[3]) return { texto: `Recorre toda la tabla ${q.texto} en el orden ${delIndice(m[3])}${izquierda}.`, bucle: true };
    return { texto: q.tabla ? `Recorre toda la tabla ${q.texto}, fila por fila${izquierda}.` : `Recorre ${q.texto}${izquierda}.`, bucle: true, todo: q.tabla };
  }
  if ((m = /^SEARCH (\S+) USING INTEGER PRIMARY KEY \((rowid[^)]*)\)$/.exec(sinLeft))) {
    const q = quien(m[1], nombres);
    return { texto: /rowid=\?/.test(m[2]) ? `Va directo a ${q.texto} por su clave primaria${izquierda}.` : `Busca en ${q.texto} un tramo de su clave primaria${izquierda}.`, bucle: true };
  }
  if ((m = /^SEARCH (\S+) USING PRIMARY KEY \(([^)]*)\)$/.exec(sinLeft))) {
    const q = quien(m[1], nombres);
    return { texto: `Busca en ${q.texto} por su clave primaria${porQue(m[2])}${izquierda}.`, bucle: true };
  }
  if ((m = /^SEARCH (\S+) USING AUTOMATIC (?:PARTIAL )?(?:COVERING )?INDEX \(([^)]*)\)$/.exec(sinLeft))) {
    const q = quien(m[1], nombres);
    return { texto: `Arma un índice al vuelo sobre ${q.texto}${porQue(m[2])}, para no recorrerla entera cada vez${izquierda}.`, bucle: true };
  }
  if ((m = /^SEARCH (\S+) USING (COVERING )?INDEX (\S+) \(([^)]*)\)$/.exec(sinLeft))) {
    const q = quien(m[1], nombres);
    if (m[2]) return { texto: `Busca con ${indice(m[3])}${porQue(m[4])}, y no necesita abrir la tabla ${q.texto}${izquierda}.`, bucle: true };
    return { texto: `Busca en ${q.texto} con ${indice(m[3])}${porQue(m[4])}${izquierda}.`, bucle: true };
  }
  if ((m = /^BLOOM FILTER ON (\S+) \(([^)]*)\)$/.exec(d))) return { texto: `Arma un filtro rápido sobre ${quien(m[1], nombres).texto}${porQue(m[2])}, para descartar filas sin buscarlas.` };
  if ((m = /^USE TEMP B-TREE FOR (.+)$/.exec(d))) {
    const para = m[1];
    if (para === 'ORDER BY') return { texto: 'Arma una lista aparte para ordenar el resultado (ORDER BY).' };
    if (para === 'GROUP BY') return { texto: 'Arma una lista aparte para agrupar (GROUP BY).' };
    if (para === 'DISTINCT') return { texto: 'Arma una lista aparte para sacar los repetidos (DISTINCT).' };
    if (/ORDER BY$/.test(para)) return { texto: 'Lo trae casi ordenado y arma una lista aparte para terminar de ordenarlo.' };
    return { texto: `Arma una lista aparte (${para}).` };
  }
  if ((m = /^CO-ROUTINE (.+)$/.exec(d))) return { texto: `Arma ${quien(m[1], nombres).texto} de a poco, a medida que hace falta.` };
  if ((m = /^MATERIALIZE (.+)$/.exec(d))) return { texto: `Arma ${quien(m[1], nombres).texto} una sola vez y lo guarda aparte.` };
  if (/^CORRELATED SCALAR SUBQUERY/.test(d)) return { texto: 'Corre una subconsulta por cada fila.' };
  if (/^SCALAR SUBQUERY/.test(d)) return { texto: 'Corre una subconsulta una sola vez.' };
  if (/^CORRELATED LIST SUBQUERY/.test(d)) return { texto: 'Arma la lista del IN con una subconsulta, por cada fila.' };
  if (/^LIST SUBQUERY/.test(d)) return { texto: 'Arma la lista del IN con una subconsulta, una sola vez.' };
  if (d === 'COMPOUND QUERY') return { texto: 'Junta varias consultas.' };
  if (d === 'LEFT-MOST SUBQUERY') return { texto: 'Empieza por la primera consulta.' };
  if (d === 'UNION ALL') return { texto: 'Le suma la siguiente con UNION ALL, con repetidos.' };
  if (d === 'UNION USING TEMP B-TREE') return { texto: 'Le suma la siguiente con UNION, sin repetidos.' };
  if (d === 'EXCEPT USING TEMP B-TREE') return { texto: 'Le saca lo que también trae la siguiente (EXCEPT).' };
  if (d === 'INTERSECT USING TEMP B-TREE') return { texto: 'Se queda con lo que también trae la siguiente (INTERSECT).' };
  if ((m = /^MERGE \((.+)\)$/.exec(d))) {
    const como = { UNION: 'con UNION, sin repetidos', 'UNION ALL': 'con UNION ALL', EXCEPT: 'con EXCEPT, sacando lo de la segunda', INTERSECT: 'con INTERSECT, con lo que está en las dos' }[m[1]] ?? `con ${m[1]}`;
    return { texto: `Junta dos consultas ya ordenadas ${como}.` };
  }
  if (d === 'LEFT') return { texto: 'La primera.' };
  if (d === 'RIGHT') return { texto: 'La segunda.' };
  if (d === 'MULTI-INDEX OR') return { texto: 'Busca cada parte del OR con su propio índice y junta lo que encuentra.' };
  if ((m = /^INDEX (\d+)$/.exec(d))) return { texto: `La parte ${m[1]} del OR.` };
  if (d === 'SETUP') return { texto: 'El comienzo.' };
  if (d === 'RECURSIVE STEP') return { texto: 'El paso que se repite.' };
  if ((m = /^USING ROWID SEARCH ON TABLE (\S+) FOR IN-OPERATOR$/.exec(d))) return { texto: `Busca cada valor del IN por la clave de ${quien(m[1], nombres).texto}.` };
  if ((m = /^USING (?:COVERING )?INDEX (\S+) FOR IN-OPERATOR$/.exec(d))) return { texto: `Busca cada valor del IN con ${indice(m[1])}.` };
  if ((m = /^RIGHT-JOIN (\S+)$/.exec(d))) return { texto: `Completa las filas del RIGHT JOIN de ${quien(m[1], nombres).texto}.` };
  return { texto: d };
}

/**
 * The plan of `sentencia` from the rows of EXPLAIN QUERY PLAN ([id, padre, _, detalle]) as a tree:
 * [{ texto, todo, hijos }]. `todo`: it goes through a whole table. Inside one step, a table read after another one is
 * read again for each row of that one: it says so.
 */
export function explicarPlan(filas, { tablas = [], sentencia = '' } = {}) {
  const nombres = nombresDe(sentencia, tablas);
  const nodos = new Map();
  const raiz = [];
  for (const f of Array.isArray(filas) ? filas.slice(0, 500) : []) {
    const [id, padre, , detalle] = f;
    const p = paso(detalle, nombres);
    const nodo = { texto: p.texto, todo: Boolean(p.todo), bucle: Boolean(p.bucle), hijos: [] };
    nodos.set(Number(id), nodo);
    (nodos.get(Number(padre))?.hijos ?? raiz).push(nodo);
  }
  const anidar = (lista) => {
    let visto = false;
    for (const n of lista) {
      if (n.bucle) {
        if (visto) n.texto = `Por cada una de esas filas, ${n.texto[0].toLowerCase()}${n.texto.slice(1)}`;
        visto = true;
      }
      anidar(n.hijos);
      delete n.bucle;
    }
    return lista;
  };
  return anidar(raiz);
}
