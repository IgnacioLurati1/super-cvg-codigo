import { claves, dentroDe, lineaAntes, palabraAlFinal, parametroComun, plantilla, resultado } from './comun';
import { CLAVES_SQL, FUNCIONES_SQL } from './datosSql';

// SQL: the words and functions of SQLite and the tables and columns of the database loaded (the same that Base draws,
// `esquema` of the engine). `tabla.` or `alias.` suggests its columns. What is written in lowercase gets it in lowercase.

const NO_ACA = new Set(['LineComment', 'BlockComment', 'String', 'QuotedIdentifier']);

// Each template in capitals and in lowercase, as the student writes. After its keyword: `sel` and Enter is SELECT.
const MOLDES = [
  ['SELECT … FROM … WHERE', 'SELECT ${columnas}\nFROM ${tabla}\nWHERE ${condición};'],
  ['INSERT INTO … VALUES', 'INSERT INTO ${tabla} (${columnas})\nVALUES (${valores});'],
  ['JOIN … ON', 'JOIN ${tabla} ON ${condición}'],
];
const enMinusculas = (t) => t.replace(/\b[A-Z]{2,}\b/g, (m) => m.toLowerCase());
const PLANTILLAS = MOLDES.map(([label, molde]) => ({ ...plantilla(label, molde, 'plantilla', { entera: false }), boost: -3 }));
const PLANTILLAS_MIN = MOLDES.map(([label, molde]) => ({ ...plantilla(enMinusculas(label), enMinusculas(molde), 'plantilla', { entera: false }), boost: -3 }));
const FUNCIONES = FUNCIONES_SQL.map((f) => ({ label: /^\w+/.exec(f)[0], type: 'function', detail: f.slice(f.indexOf('(')) }));
const PALABRAS = claves(CLAVES_SQL);

// The words after which a name isn't an alias: `FROM persona WHERE …`.
const NO_ALIAS = new Set('where on join inner left right full cross natural using group order having limit set values union except intersect as select'.split(' '));

/** The tables of the statement with their alias: `FROM persona age` → age → persona. */
export function alias(texto, tablas) {
  const m = new Map();
  for (const x of texto.matchAll(/\b(?:from|join|update|into)\s+([\p{L}_][\p{L}\p{N}_]*)(?:\s+(?:as\s+)?([\p{L}_][\p{L}\p{N}_]*))?/giu)) {
    const tabla = tablas.get(x[1].toLowerCase());
    if (!tabla) continue;
    m.set(x[1].toLowerCase(), tabla);
    if (x[2] && !NO_ALIAS.has(x[2].toLowerCase())) m.set(x[2].toLowerCase(), tabla);
  }
  return m;
}

const columnasDe = (t) => t.columnas.map((c) => ({ label: c.nombre, type: 'property', detail: c.tipo || undefined, boost: 1 }));

/** Every column of the database, once: the tables it is in, as its detail. */
function todasLasColumnas(esquema) {
  const donde = new Map();
  for (const t of esquema) for (const c of t.columnas) donde.set(c.nombre, [...(donde.get(c.nombre) ?? []), t.nombre]);
  return [...donde].map(([label, tablas]) => ({ label, type: 'property', detail: tablas.length > 2 ? `${tablas.slice(0, 2).join(', ')}…` : tablas.join(', '), boost: 1 }));
}

const enMinuscula = (o) => ({ ...o, label: o.label.toLowerCase() });

/** The source of SQL. `contexto()`: { esquema } of the database loaded, or nothing yet. */
export function fuenteSql(contexto) {
  return (cx) => {
    const { state, pos } = cx;
    if (dentroDe(state, pos, NO_ACA)) return null;
    const antes = lineaAntes(state, pos);
    const palabra = palabraAlFinal(antes);
    const previo = antes.slice(0, antes.length - palabra.length);
    const esquema = contexto?.()?.esquema ?? [];
    const tablas = new Map(esquema.map((t) => [t.nombre.toLowerCase(), t]));

    // `persona.`, `age.`: the columns of that table.
    const punto = /([\p{L}_][\p{L}\p{N}_]*)\.$/u.exec(previo);
    if (punto) {
      const tabla = alias(state.doc.toString(), tablas).get(punto[1].toLowerCase()) ?? tablas.get(punto[1].toLowerCase());
      return tabla ? resultado(cx, palabra, columnasDe(tabla)) : null;
    }
    const deLaBase = [...esquema.map((t) => ({ label: t.nombre, type: 'class', detail: t.vista ? 'vista' : 'tabla', boost: 2 })), ...todasLasColumnas(esquema)];
    const minuscula = palabra && palabra === palabra.toLowerCase();
    const delLenguaje = minuscula ? [...FUNCIONES, ...PALABRAS].map(enMinuscula) : [...FUNCIONES, ...PALABRAS];
    return resultado(cx, palabra, [...deLaBase, ...delLenguaje, ...(minuscula ? PLANTILLAS_MIN : PLANTILLAS)], { sinCaso: true, parametro: parametroComun });
  };
}
