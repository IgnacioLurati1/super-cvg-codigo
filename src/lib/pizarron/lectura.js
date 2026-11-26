// What Gemini reads on a board photo, and how its answer comes apart: text, formulas (LaTeX), code, tables and an
// entity-relationship diagram (DER), each to show or to take where it's used (the Laboratorio, its DER sheet). Pure
// functions: the request goes through nube.js (leer.js).

import { leerRespuesta } from '../consultron/pedido.js';
import { derVacio, sanearDer } from '../laboratorio/der/modelo.js';

export const SISTEMA_PIZARRON = [
  'Pasás a texto fotos de pizarrones y de diapositivas de clases de una facultad de ingeniería argentina.',
  'Escribí todo lo que está escrito, tal cual y en el orden en que se lee: de arriba abajo y, si el pizarrón está en columnas, columna por columna.',
  'Solo lo escrito: no expliques, no resuelvas, no corrijas, no completes y no agregues nada. Lo que no se lee va como […].',
  'Formato:',
  '- Fórmulas y expresiones matemáticas en LaTeX: $…$ dentro de una línea y $$…$$ solas en su línea.',
  '- Código de programación en un bloque ```python, ```c, ```sql, ```javascript o el lenguaje que sea, con su sangría.',
  '- Todo lo que esté en filas y columnas (una tabla, valores alineados, una lista de códigos) va como tabla de Markdown: una fila por renglón, | entre columnas y la fila de títulos seguida de |---|.',
  '- Un diagrama entidad-relación (DER) en un bloque ```der con un JSON así: {"entidades":[{"nombre":"cliente","debil":false,"atributos":[{"nombre":"id","clave":true}]}],"vinculos":[{"nombre":"hace","atributos":[],"puntas":[{"a":"cliente","card":"1:1"},{"a":"pedido","card":"0:N"}]}]}. El JSON va en una sola línea. La cardinalidad es la que está escrita junto a cada entidad.',
  '- Otro dibujo o gráfico: una línea [Dibujo: qué muestra, en pocas palabras], con los rótulos que tenga.',
  '- Un título del pizarrón, con ### adelante.',
  'Si en la foto no hay nada escrito, respondé solo: [Sin texto]',
].join('\n');

export const PEDIDO_PIZARRON = 'Pasá a texto esta foto.';

// A table longer than this shows its first rows: a board doesn't have more.
const MAX_FILAS = 200;
const VALLA =/^\s*```\s*([\w+#-]*)\s*$/;
const FILA = /^\s*\|.*\|\s*$/;
const SEPARADOR = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

/** The cells of a row of a Markdown table. */
const celdas = (linea) => linea.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

/**
 * Gemini's answer in blocks: the ones of Consultron's answers ({ tipo: 'parrafo' | 'lista' | 'codigo' }, pedido.js),
 * plus { tipo: 'tabla', filas } (the first row, the titles) and { tipo: 'der', der } (a .der of the Laboratorio, or
 * a block of code if it doesn't read as one).
 */
export function leerLectura(texto) {
  const lineas = String(texto ?? '').replace(/\r/g, '').split('\n');
  const bloques = [];
  let suelto = [];
  const soltar = () => {
    if (suelto.some((l) => l.trim())) bloques.push(...leerRespuesta(suelto.join('\n'), 0));
    suelto = [];
  };
  for (let i = 0; i < lineas.length; i++) {
    const valla = VALLA.exec(lineas[i]);
    if (valla && valla[1].toLowerCase() === 'der') {
      // The DER's block whole, up to its closing fence (or the end, if the answer was cut).
      let fin = i + 1;
      while (fin < lineas.length && !VALLA.test(lineas[fin])) fin++;
      soltar();
      const crudo = lineas.slice(i + 1, fin).join('\n');
      const der = derDeGemini(crudo);
      bloques.push(der ? { tipo: 'der', der } : { tipo: 'codigo', lenguaje: '', texto: crudo.trim() });
      i = fin;
      continue;
    }
    if (valla) {
      // Any other code goes whole to Consultron's reader, with its fences.
      let fin = i + 1;
      while (fin < lineas.length && !VALLA.test(lineas[fin])) fin++;
      suelto.push(...lineas.slice(i, fin + 1));
      i = fin;
      continue;
    }
    if (FILA.test(lineas[i]) && FILA.test(lineas[i + 1] ?? '') && SEPARADOR.test(lineas[i + 1])) {
      soltar();
      const filas = [celdas(lineas[i])];
      let j = i + 2;
      for (; j < lineas.length && FILA.test(lineas[j]); j++) if (filas.length < MAX_FILAS) filas.push(celdas(lineas[j]));
      bloques.push({ tipo: 'tabla', filas });
      i = j - 1;
      continue;
    }
    suelto.push(lineas[i]);
  }
  soltar();
  return bloques;
}

/** Whether Gemini found nothing written. */
export const sinTexto = (texto) => /^\s*\[sin texto\]\s*$/i.test(String(texto ?? ''));

// Where the shapes go on the sheet: entities in a grid, each relationship between its ends. Two entities side by side
// fit a phone at the smallest zoom of «Ver todo» (VER_TODO_ANGOSTA, Hoja.jsx).
const PASO_X = 190;
const PASO_Y = 200;

/**
 * The DER Gemini wrote (its JSON, with names in place of ids) as a .der of the Laboratorio, laid out in a grid, or null
 * if it isn't one. Everything goes through sanearDer, as anything that comes from outside.
 */
export function derDeGemini(crudo) {
  let o;
  try {
    o = JSON.parse(String(crudo ?? '').trim());
  } catch {
    return null;
  }
  if (!o || typeof o !== 'object' || !Array.isArray(o.entidades) || !o.entidades.length) return null;
  let n = 0;
  const id = (p) => `${p}${++n}`;
  const atributos = (lista) => (Array.isArray(lista) ? lista : []).filter((a) => a && typeof a.nombre === 'string').map((a) => ({ id: id('t'), nombre: a.nombre, clave: Boolean(a.clave), multivaluado: false, derivado: false, partes: [] }));
  const columnas = Math.max(1, Math.ceil(Math.sqrt(o.entidades.length)));
  const porNombre = new Map();
  const entidades = o.entidades
    .filter((e) => e && typeof e.nombre === 'string' && e.nombre.trim())
    .map((e, i) => {
      const ent = { id: id('e'), nombre: e.nombre, debil: Boolean(e.debil), x: (i % columnas) * PASO_X * 2, y: Math.floor(i / columnas) * PASO_Y * 2, atributos: atributos(e.atributos) };
      porNombre.set(e.nombre.trim().toLowerCase(), ent);
      return ent;
    });
  const vinculos = (Array.isArray(o.vinculos) ? o.vinculos : [])
    .map((v) => {
      const puntas = (Array.isArray(v?.puntas) ? v.puntas : []).map((p) => ({ ent: porNombre.get(String(p?.a ?? '').trim().toLowerCase()), card: String(p?.card ?? '') })).filter((p) => p.ent);
      if (puntas.length < 2) return null;
      // Between its ends, a bit below so it doesn't cover a straight line between them.
      const x = puntas.reduce((s, p) => s + p.ent.x, 0) / puntas.length;
      const y = puntas.reduce((s, p) => s + p.ent.y, 0) / puntas.length + (puntas.every((p) => p.ent.y === puntas[0].ent.y) ? PASO_Y : 0);
      return { id: id('v'), nombre: typeof v.nombre === 'string' ? v.nombre : '', identificador: false, x, y, atributos: atributos(v.atributos), puntas: puntas.map((p) => ({ a: p.ent.id, card: p.card, rol: '' })) };
    })
    .filter(Boolean);
  const der = sanearDer({ ...derVacio(), entidades, vinculos });
  return der?.entidades?.length ? der : null;
}

/** A table as text to paste in a spreadsheet: tabs between cells, a line per row. */
export const tablaEnTexto = (filas) => filas.map((f) => f.join('\t')).join('\n');

/** A DER in words: «Entidad cliente: id (clave), nombre.» and «Vínculo hace entre cliente (1:1) y pedido (0:N): fecha.» */
export function derEnPalabras(der) {
  const atrs = (lista) => lista.map((a) => (a.clave ? `${a.nombre} (clave)` : a.nombre)).join(', ');
  const nombre = new Map(der.entidades.map((e) => [e.id, e.nombre]));
  return [
    ...der.entidades.map((e) => `Entidad${e.debil ? ' débil' : ''} ${e.nombre}${e.atributos.length ? `: ${atrs(e.atributos)}` : ''}.`),
    ...der.vinculos.map((v) => `Vínculo ${v.nombre} entre ${v.puntas.map((p) => `${nombre.get(p.a)} (${p.card})`).join(' y ')}${v.atributos.length ? `: ${atrs(v.atributos)}` : ''}.`),
  ].join('\n');
}

/** The whole reading as plain text, for search and for Consultron (the PDF's hidden text): without the LaTeX marks. */
export function lecturaEnTexto(texto) {
  return String(texto ?? '')
    .replace(/\r/g, '')
    .replace(/^[ \t]*```der[ \t]*\n([\s\S]*?)(?:\n[ \t]*```[ \t]*$|$(?![\s\S]))/gm, (todo, json) => {
      const der = derDeGemini(json);
      return der ? derEnPalabras(der) : json;
    })
    .replace(/^\s*```\w*\s*$/gm, '')
    .replace(/^\s*\|?\s*:?-{2,}[-:|\s]*$/gm, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\$\$([^$]+)\$\$/g, '$1')
    // A dollar before a number is pesos, not math.
    .replace(/\$(?!\d)([^$\n]+)\$/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * The reading as the hidden lines of a page of the PDF (pdf.js): Gemini doesn't say where each line is, so they go one
 * under the other down the page, in order. Enough to find the page searching.
 */
export function lineasDeLectura(texto) {
  const lineas = lecturaEnTexto(texto)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const alto = 0.96 / Math.max(lineas.length, 24);
  return lineas.map((t, i) => ({ texto: t, x0: 0.02, x1: 0.98, y0: 0.02 + i * alto, y1: 0.02 + (i + 0.9) * alto }));
}

// The languages the Laboratorio runs, by the names Gemini gives a block of code.
const DEL_LAB = { python: 'python', py: 'python', c: 'c', 'c++': 'c', cpp: 'c', sql: 'sql', mysql: 'sql', postgresql: 'sql', javascript: 'javascript', js: 'javascript' };

/** The Laboratorio's language for a block of code, or null if it doesn't run there (MATLAB, Pascal). */
export const lenguajeDelLab = (lenguaje) => DEL_LAB[String(lenguaje ?? '').toLowerCase()] ?? null;
