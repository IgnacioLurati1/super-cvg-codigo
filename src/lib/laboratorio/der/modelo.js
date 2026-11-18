// The `.der` file of the Laboratorio: an E-R diagram in the notation of Bases de Datos (docs/laboratorio-der.md). What
// comes in (a file, a zip, Drive) is untrusted: `leerDer` keeps only what it reads, cut to size, and never throws.
// Pure: no DOM, no storage.

export const VERSION = 1;

// Caps: far above any exam's DER, low enough that a crafted file can't hang the page.
const MAX_TEXTO = 1_000_000;
const MAX = { entidades: 200, vinculos: 300, jerarquias: 100, agregaciones: 100, atributos: 60, partes: 20, puntas: 8, subclases: 30, cp: 40, tipos: 3000 };
const MAX_NOMBRE = 64;
const MAX_ROL = 40;
const PROFUNDIDAD_PARTES = 3;
const COORDENADA = 100_000;
// How far an oval may sit from its shape (its middle from the shape's middle).
const OVALO = 2_000;
const PASAJES = ['superclase', 'completa', 'subclases'];
const PROHIBIDAS = new Set(['__proto__', 'constructor', 'prototype']);

/** The MySQL types the table view accepts: one of these, with its size if it has one. */
export const TIPO_VALIDO = /^(INT|INTEGER|TINYINT|SMALLINT|MEDIUMINT|BIGINT|DECIMAL\(\d{1,2},\s?\d{1,2}\)|FLOAT|DOUBLE|VARCHAR\(\d{1,5}\)|CHAR\(\d{1,3}\)|TEXT|DATE|DATETIME|TIME|TIMESTAMP|YEAR|BOOLEAN)( UNSIGNED)?( AUTO_INCREMENT)?$/;

export const derVacio = () => ({ v: VERSION, entidades: [], vinculos: [], jerarquias: [], agregaciones: [], decisiones: { cp: {}, lado11: {}, tipos: {} } });

const esObjeto = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
const lista = (l, max) => (Array.isArray(l) ? l.slice(0, max) : []);
// Control characters, and the invisible ones that turn text around (bidi) or hide in it.
const invisible = (c) => c < 0x20 || (c >= 0x7f && c <= 0x9f) || (c >= 0x200b && c <= 0x200f) || (c >= 0x2028 && c <= 0x202e) || (c >= 0x2066 && c <= 0x2069) || c === 0xfeff;
const sinControl = (s) => [...s].filter((ch) => !invisible(ch.codePointAt(0))).join('');

/** A name as the student wrote it: one line, trimmed, at most `max` characters. */
export function nombreLimpio(n, max = MAX_NOMBRE) {
  if (typeof n !== 'string') return '';
  return sinControl(n.slice(0, max * 4).replace(/\s+/g, ' ')).trim().slice(0, max).trim();
}

const idValido = (id) => (typeof id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(id) && !PROHIBIDAS.has(id) ? id : null);
const coordenada = (n, tope = COORDENADA) => (typeof n === 'number' && Number.isFinite(n) ? Math.round(Math.max(-tope, Math.min(tope, n)) * 10) / 10 : 0);
// Where the oval of attributes sits, from the middle of its shape. Without it, it sits over the shape.
const conOvalo = (o) => (esObjeto(o.ovalo) ? { ovalo: { dx: coordenada(o.ovalo.dx, OVALO), dy: coordenada(o.ovalo.dy, OVALO) } } : {});

/**
 * A cardinality as the course writes it, `min:max` (`0:N`, `1:1`, `1:M`): max is 1, a number or a letter that means
 * «many». The old `0..N` reads the same. Anything else is '' (missing).
 */
export function cardLimpia(c) {
  if (typeof c !== 'string') return '';
  const m = /^\s*(\d{1,2})\s*(?::|\.\.)\s*([1-9]\d?|[A-Za-z])\s*$/.exec(c);
  return m ? `${Number(m[1])}:${m[2].toUpperCase()}` : '';
}

/** { min, muchos } of a clean cardinality, or null if missing. */
export function leerCard(c) {
  const m = /^(\d+):(\d+|[A-Z])$/.exec(c ?? '');
  if (!m) return null;
  return { min: Number(m[1]), muchos: !/^\d+$/.test(m[2]) || Number(m[2]) > 1 };
}

function atributo(a, usados, profundidad) {
  if (!esObjeto(a)) return null;
  const id = idValido(a.id);
  if (!id || usados.has(id)) return null;
  usados.add(id);
  const partes = profundidad < PROFUNDIDAD_PARTES ? lista(a.partes, MAX.partes).map((p) => atributo(p, usados, profundidad + 1)).filter(Boolean) : [];
  return { id, nombre: nombreLimpio(a.nombre), clave: a.clave === true, multivaluado: a.multivaluado === true, derivado: a.derivado === true, partes };
}

const atributos = (l, usados) => lista(l, MAX.atributos).map((a) => atributo(a, usados, 1)).filter(Boolean);

function decisiones(d, vinculos) {
  const fuera = { cp: {}, lado11: {}, tipos: {} };
  if (!esObjeto(d)) return fuera;
  const porId = new Map(vinculos.map((v) => [v.id, v]));
  if (esObjeto(d.cp)) {
    for (const [vid, cols] of Object.entries(d.cp)) {
      if (!porId.has(vid) || !Array.isArray(cols)) continue;
      const limpias = [...new Set(cols.slice(0, MAX.cp).map((c) => nombreLimpio(c)).filter(Boolean))];
      if (limpias.length) fuera.cp[vid] = limpias;
    }
  }
  if (esObjeto(d.lado11)) {
    for (const [vid, lado] of Object.entries(d.lado11)) {
      if (porId.get(vid)?.puntas.some((p) => p.a === lado)) fuera.lado11[vid] = lado;
    }
  }
  if (esObjeto(d.tipos)) {
    for (const [clave, tipo] of Object.entries(d.tipos).slice(0, MAX.tipos)) {
      const k = nombreLimpio(clave, MAX_NOMBRE * 2 + 1);
      const t = tipoLimpio(tipo);
      if (k.includes('.') && !PROHIBIDAS.has(k) && t) fuera.tipos[k] = t;
    }
  }
  return fuera;
}

/** A MySQL type the table view accepts, uppercase and with single spaces, or '' if it isn't one. */
export function tipoLimpio(t) {
  if (typeof t !== 'string') return '';
  const n = t.trim().replace(/\s+/g, ' ').replace(/\s*\(\s*/g, '(').replace(/\s*\)/g, ')').replace(/\s*,\s*/g, ',').toUpperCase();
  return TIPO_VALIDO.test(n) ? n : '';
}

// What a student writes for a type in Spanish, or in MySQL without its size, and the MySQL type it is.
const PARECIDOS = [
  [/^(entero|enteros|numero|numero entero|nro|integer)$/, 'INT'],
  [/^(entero|numero) sin signo$/, 'INT UNSIGNED'],
  [/^entero (largo|grande)$/, 'BIGINT'],
  [/^entero (corto|chico)$/, 'SMALLINT'],
  [/^int\(\d{1,3}\)$/, 'INT'],
  [/^(decimal|real|reales|flotante|numero (real|decimal|con coma)|moneda|dinero|importe|plata)$/, 'DECIMAL(10,2)'],
  [/^(texto|cadena|cadena de caracteres|caracteres|string|palabra|varchar|alfanumerico)$/, 'VARCHAR(100)'],
  [/^texto (largo|grande)$/, 'TEXT'],
  [/^(caracter|char|letra)$/, 'CHAR(1)'],
  [/^fecha$/, 'DATE'],
  [/^(fecha (y|con) hora|fechahora|fecha_hora|fecha hora)$/, 'DATETIME'],
  [/^hora$/, 'TIME'],
  [/^(ano|anio)$/, 'YEAR'],
  [/^(booleano|logico|bool|si ?\/ ?no|si o no|verdadero ?\/ ?falso|verdadero o falso)$/, 'BOOLEAN'],
];

/** The MySQL type a type that isn't one most likely means (`entero` → INT), or ''. */
export function tipoParecido(t) {
  if (typeof t !== 'string' || tipoLimpio(t)) return '';
  const n = t.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().replace(/\s+/g, ' ').toLowerCase();
  return PARECIDOS.find(([re]) => re.test(n))?.[1] ?? '';
}

/**
 * A clean DER from an object of unknown origin, or null if it isn't one. What doesn't read (a bad id, a point to
 * nothing, a repeated id) is dropped; names and numbers are cut to size.
 */
export function sanearDer(o) {
  try {
    if (!esObjeto(o) || o.v !== VERSION) return null;
    const usados = new Set();
    const tomar = (id) => {
      const ok = idValido(id);
      if (!ok || usados.has(ok)) return null;
      usados.add(ok);
      return ok;
    };
    const entidades = [];
    for (const e of lista(o.entidades, MAX.entidades)) {
      const id = esObjeto(e) && tomar(e.id);
      if (id) entidades.push({ id, nombre: nombreLimpio(e.nombre), debil: e.debil === true, x: coordenada(e.x), y: coordenada(e.y), ...conOvalo(e), atributos: atributos(e.atributos, usados) });
    }
    const entidadIds = new Set(entidades.map((e) => e.id));
    // Aggregations point to a vínculo and vínculos to aggregations: the ids of both are taken first.
    const crudosV = lista(o.vinculos, MAX.vinculos).filter(esObjeto).map((v) => ({ v, id: tomar(v.id) })).filter((x) => x.id);
    const vinculoIds = new Set(crudosV.map((x) => x.id));
    const agregaciones = [];
    for (const g of lista(o.agregaciones, MAX.agregaciones)) {
      if (!esObjeto(g) || !vinculoIds.has(g.vinculo) || agregaciones.some((x) => x.vinculo === g.vinculo)) continue;
      const id = tomar(g.id);
      if (id) agregaciones.push({ id, nombre: nombreLimpio(g.nombre), vinculo: g.vinculo });
    }
    const extremos = new Set([...entidadIds, ...agregaciones.map((g) => g.id)]);
    const vinculos = crudosV.map(({ v, id }) => ({
      id,
      nombre: nombreLimpio(v.nombre),
      identificador: v.identificador === true,
      x: coordenada(v.x),
      y: coordenada(v.y),
      ...conOvalo(v),
      atributos: atributos(v.atributos, usados),
      puntas: lista(v.puntas, MAX.puntas)
        .filter((p) => esObjeto(p) && extremos.has(p.a))
        .map((p) => ({ a: p.a, card: cardLimpia(p.card), rol: nombreLimpio(p.rol, MAX_ROL) })),
    }));
    const jerarquias = [];
    for (const j of lista(o.jerarquias, MAX.jerarquias)) {
      if (!esObjeto(j) || !entidadIds.has(j.superclase)) continue;
      const id = tomar(j.id);
      if (!id) continue;
      const subclases = [...new Set(lista(j.subclases, MAX.subclases).filter((s) => entidadIds.has(s) && s !== j.superclase))];
      jerarquias.push({
        id,
        x: coordenada(j.x),
        y: coordenada(j.y),
        superclase: j.superclase,
        subclases,
        tipo: j.tipo === 'S' ? 'S' : 'D',
        total: j.total === true,
        pasaje: PASAJES.includes(j.pasaje) ? j.pasaje : 'superclase',
      });
    }
    return { v: VERSION, entidades, vinculos, jerarquias, agregaciones, decisiones: decisiones(o.decisiones, vinculos) };
  } catch {
    return null;
  }
}

/** The DER of a `.der` file's text, clean, or null if it isn't one. */
export function leerDer(texto) {
  if (typeof texto !== 'string' || texto.length > MAX_TEXTO) return null;
  try {
    return sanearDer(JSON.parse(texto));
  } catch {
    return null;
  }
}

const ordenado = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));

/**
 * The text of a `.der` file: the same DER always gives the same text (keys in a fixed order). Compact, so a big
 * diagram fits in a file of the Laboratorio; the indented files saved before read the same.
 */
export function derEnTexto(der) {
  const limpio = sanearDer(der) ?? derVacio();
  const d = limpio.decisiones;
  return `${JSON.stringify({ ...limpio, decisiones: { cp: ordenado(d.cp), lado11: ordenado(d.lado11), tipos: ordenado(d.tipos) } })}\n`;
}
