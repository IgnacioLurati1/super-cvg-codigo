// The values of a spreadsheet (.xlsx, .xlsm or .csv), sheet by sheet, read in the browser without running anything of it:
// an .xlsx is a ZIP of XML. Each cell comes out as the text Excel shows for it, as near as its number format allows:
// dates, times, percents, decimals and thousands. No formulas, colors, charts or images. The old binary .xls isn't read.
import { strFromU8, unzipSync } from 'fflate';

// A ZIP that unpacks to far more than a spreadsheet's values is left alone.
const TOPE_XML = 40 * 1024 * 1024;
export const TOPES = { hojas: 50, filas: 5000, columnas: 60 };

export { tipoDePlanilla } from './planillaTipo';

// ---------- The cells' text ----------

const NUMERO = (decimales, miles) => new Intl.NumberFormat('es-AR', { minimumFractionDigits: decimales, maximumFractionDigits: decimales, useGrouping: miles });
const GENERAL = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 10, useGrouping: false });
const dos = (n) => String(n).padStart(2, '0');

// Excel's own formats that are dates or times (the others of its list are plain numbers).
const FECHAS_PROPIAS = { 14: 'f', 15: 'f', 16: 'f', 17: 'f', 18: 'h', 19: 'hs', 20: 'h', 21: 'hs', 22: 'fh', 45: 'ms', 46: 'hs', 47: 'ms' };
const NUMEROS_PROPIOS = { 1: '0', 2: '0.00', 3: '#,##0', 4: '#,##0.00', 9: '0%', 10: '0.00%', 11: '0.00E+00', 37: '#,##0', 38: '#,##0', 39: '#,##0.00', 40: '#,##0.00' };

/** What a number format is: { fecha, hora, segundos } for a date or a time, or { decimales, miles, porcentaje, moneda }. */
export function claseDeFormato(id, codigo) {
  const propia = FECHAS_PROPIAS[id];
  if (propia) return { fecha: propia.includes('f'), hora: /h|m/.test(propia.replace('f', '')), segundos: propia.includes('s') };
  // Only the first section counts (positive numbers), without what is quoted, escaped or in brackets.
  const crudo = codigo ?? NUMEROS_PROPIOS[id] ?? 'General';
  const limpio = crudo.split(';')[0].replace(/"[^"]*"/g, '').replace(/\\./g, '').replace(/\[[^\]]*\]/g, '').replace(/_./g, '');
  if (/^general$/i.test(limpio.trim()) || !limpio.trim()) return { general: true };
  if (/[dy]/i.test(limpio) || /[hs]/i.test(limpio)) {
    return { fecha: /[dy]/i.test(limpio) || (/m/i.test(limpio) && !/[hs]/i.test(limpio)), hora: /[hs]/i.test(limpio), segundos: /s/i.test(limpio) };
  }
  const decimales = /\.([0#?]+)/.exec(limpio)?.[1].length ?? 0;
  return {
    decimales: Math.min(decimales, 10),
    miles: /[#0?],[#0?]/.test(limpio),
    porcentaje: limpio.includes('%'),
    moneda: /\$/.test(crudo) || /\[\$/.test(crudo) ? '$ ' : '',
    cientifica: /E[+-]/i.test(limpio),
  };
}

/** The text Excel shows for a number with that format. `en1904`: the workbook counts days from 1904 (old Macs). */
export function textoDeNumero(n, clase, en1904 = false) {
  if (clase.fecha || clase.hora) {
    const dias = n + (en1904 ? 1462 : 0);
    // Day 60 of 1900 doesn't exist (Lotus' leap year): from 61 on, 25569 days before 1970.
    const ms = Math.round((dias - (dias < 61 ? 25568 : 25569)) * 86400) * 1000;
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return GENERAL.format(n);
    const fecha = `${dos(d.getUTCDate())}/${dos(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
    const hora = `${dos(d.getUTCHours())}:${dos(d.getUTCMinutes())}${clase.segundos ? `:${dos(d.getUTCSeconds())}` : ''}`;
    return [clase.fecha && fecha, clase.hora && hora].filter(Boolean).join(' ');
  }
  if (clase.general) return GENERAL.format(Number(n.toPrecision(11)));
  if (clase.cientifica) return n.toExponential(clase.decimales).replace('.', ',').toUpperCase();
  const valor = clase.porcentaje ? n * 100 : n;
  return `${clase.moneda}${NUMERO(clase.decimales, clase.miles).format(valor)}${clase.porcentaje ? '%' : ''}`;
}

// ---------- xlsx ----------

const columnaDe = (letras) => [...letras.toUpperCase()].reduce((n, l) => n * 26 + l.charCodeAt(0) - 64, 0) - 1;
/** A, B … Z, AA, AB …: the name of a column, from 0. */
export function letrasDe(columna) {
  let n = columna + 1;
  let letras = '';
  while (n > 0) {
    letras = String.fromCharCode(65 + ((n - 1) % 26)) + letras;
    n = Math.floor((n - 1) / 26);
  }
  return letras;
}
const celda = (ref) => {
  const r = /^\$?([A-Z]{1,3})\$?(\d{1,7})$/i.exec(ref ?? '');
  return r ? { columna: columnaDe(r[1]), fila: Number(r[2]) - 1 } : null;
};

const hijos = (el, nombre) => [...el.childNodes].filter((n) => n.localName === nombre);
const todos = (el, nombre) => [...el.getElementsByTagNameNS('*', nombre)];
// The text of a shared or inline string: its runs, without the phonetic guides of Japanese (<rPh>).
const textoDeRica = (el) => todos(el, 't').filter((t) => t.parentNode?.localName !== 'rPh').map((t) => t.textContent).join('');

function leerXml(archivos, ruta) {
  const bytes = archivos[ruta];
  if (!bytes) return null;
  const doc = new DOMParser().parseFromString(strFromU8(bytes), 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error(`XML roto: ${ruta}`);
  return doc;
}

/** [{ nombre, leer }] or throws if it isn't an .xlsx. Hidden sheets are left out. `leer()` gives { filas: [[{ texto,
 * numero }]], unidas: [{ fila, columna, filas, columnas }], recortada }. */
export function leerXlsx(bytes) {
  let total = 0;
  const archivos = unzipSync(new Uint8Array(bytes), {
    filter: (f) => {
      if (!/^xl\/.*\.xml$|^xl\/_rels\/workbook\.xml\.rels$/.test(f.name)) return false;
      total += f.originalSize;
      if (total > TOPE_XML) throw new Error('demasiado grande');
      return true;
    },
  });
  const libro = leerXml(archivos, 'xl/workbook.xml');
  if (!libro) throw new Error('no es una planilla');
  const en1904 = todos(libro, 'workbookPr').some((p) => ['1', 'true'].includes(p.getAttribute('date1904')));

  const destinos = new Map();
  const rels = leerXml(archivos, 'xl/_rels/workbook.xml.rels');
  for (const r of rels ? todos(rels, 'Relationship') : []) {
    const destino = r.getAttribute('Target') ?? '';
    destinos.set(r.getAttribute('Id'), destino.startsWith('/') ? destino.slice(1) : `xl/${destino}`);
  }

  const compartidos = [];
  const cadenas = leerXml(archivos, 'xl/sharedStrings.xml');
  for (const si of cadenas ? hijos(cadenas.documentElement, 'si') : []) compartidos.push(textoDeRica(si));

  // Each style (the `s` of a cell) with its number format.
  const clases = [];
  const estilos = leerXml(archivos, 'xl/styles.xml');
  if (estilos) {
    const codigos = new Map(todos(estilos, 'numFmt').map((f) => [Number(f.getAttribute('numFmtId')), f.getAttribute('formatCode')]));
    const xfs = todos(estilos, 'cellXfs')[0];
    for (const xf of xfs ? hijos(xfs, 'xf') : []) {
      const id = Number(xf.getAttribute('numFmtId') ?? 0);
      clases.push(claseDeFormato(id, codigos.get(id)));
    }
  }
  const hojas = [];
  for (const h of todos(libro, 'sheet')) {
    if (hojas.length >= TOPES.hojas) break;
    if (['hidden', 'veryHidden'].includes(h.getAttribute('state'))) continue;
    const rid = h.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') ?? h.getAttribute('r:id');
    const nombre = h.getAttribute('name') ?? '';
    const ruta = destinos.get(rid);
    hojas.push({ nombre, leer: unaVez(() => leerHoja(leerXml(archivos, ruta), compartidos, clases, en1904)) });
  }
  if (!hojas.length) throw new Error('sin hojas');
  return hojas;
}

// Each sheet is read when it's opened, and once: a book of many big sheets doesn't freeze the page all at once.
const unaVez = (leer) => {
  let hecho = null;
  return () => (hecho ??= leer());
};

function leerHoja(doc, compartidos, clases, en1904) {
  if (!doc) return { filas: [], unidas: [], recortada: false };
  const clasePorDefecto = { general: true };
  const filas = [];
  let recortada = false;
  let siguienteFila = 0;
  for (const fila of todos(doc, 'row')) {
    const f = fila.getAttribute('r') ? Number(fila.getAttribute('r')) - 1 : siguienteFila;
    siguienteFila = f + 1;
    if (f >= TOPES.filas) {
      recortada = true;
      break;
    }
    let siguienteColumna = 0;
    for (const c of hijos(fila, 'c')) {
      const columna = celda(c.getAttribute('r'))?.columna ?? siguienteColumna;
      siguienteColumna = columna + 1;
      if (columna >= TOPES.columnas) {
        recortada = true;
        continue;
      }
      const valor = textoDeCelda(c, compartidos, clases, clasePorDefecto, en1904);
      if (!valor) continue;
      (filas[f] ??= [])[columna] = valor;
    }
  }
  const unidas = [];
  for (const u of todos(doc, 'mergeCell')) {
    const [a, b] = (u.getAttribute('ref') ?? '').split(':').map(celda);
    if (!a || !b || a.fila >= TOPES.filas || a.columna >= TOPES.columnas) continue;
    unidas.push({
      fila: a.fila,
      columna: a.columna,
      filas: Math.min(b.fila, TOPES.filas - 1) - a.fila + 1,
      columnas: Math.min(b.columna, TOPES.columnas - 1) - a.columna + 1,
    });
  }
  return { ...enRectangulo(filas, unidas), recortada };
}

function textoDeCelda(c, compartidos, clases, clasePorDefecto, en1904) {
  const tipo = c.getAttribute('t');
  if (tipo === 'inlineStr') {
    const is = hijos(c, 'is')[0];
    return is ? { texto: textoDeRica(is) } : null;
  }
  const v = hijos(c, 'v')[0]?.textContent;
  if (v === undefined || v === '') return null;
  if (tipo === 's') return { texto: compartidos[Number(v)] ?? '' };
  if (tipo === 'b') return { texto: v === '1' ? 'VERDADERO' : 'FALSO' };
  if (tipo === 'str' || tipo === 'e') return { texto: v };
  const n = Number(v);
  if (!Number.isFinite(n)) return { texto: v };
  const clase = clases[Number(c.getAttribute('s') ?? 0)] ?? clasePorDefecto;
  return { texto: textoDeNumero(n, clase, en1904), numero: !clase.fecha && !clase.hora };
}

// Every row with as many cells as the widest, and nothing after the last cell with something (merged ones count).
function enRectangulo(dispersas, unidas) {
  let alto = dispersas.length;
  let ancho = 0;
  dispersas.forEach((f) => { if (f) ancho = Math.max(ancho, f.length); });
  for (const u of unidas) {
    alto = Math.max(alto, u.fila + u.filas);
    ancho = Math.max(ancho, u.columna + u.columnas);
  }
  const filas = Array.from({ length: alto }, (_, i) => Array.from({ length: ancho }, (_, j) => dispersas[i]?.[j] ?? null));
  return { filas, unidas };
}

// ---------- csv ----------

/** The text of a CSV: UTF-8 (the decoder drops its BOM), or the Windows encoding Excel saves in when it isn't. */
export function textoDeCsv(bytes) {
  const datos = new Uint8Array(bytes);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(datos);
  } catch {
    return new TextDecoder('windows-1252').decode(datos);
  }
}

/** The CSV as one sheet, split by what its first line uses most: semicolon (Excel in Spanish), comma or tab. */
export function leerCsv(texto) {
  const primera = texto.slice(0, texto.search(/\r?\n|$/)).replace(/"[^"]*"/g, '');
  const cuenta = (s) => primera.split(s).length - 1;
  const separador = [';', ',', '\t'].reduce((a, b) => (cuenta(b) > cuenta(a) ? b : a));
  const dispersas = [];
  let fila = [];
  let campo = '';
  let comillas = false;
  let recortada = false;
  const cerrarCampo = () => {
    if (fila.length < TOPES.columnas) fila.push(campo ? { texto: campo, numero: /^-?\d+([.,]\d+)?$/.test(campo.trim()) } : null);
    else if (campo) recortada = true;
    campo = '';
  };
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (comillas) {
      if (ch === '"' && texto[i + 1] === '"') { campo += '"'; i++; } else if (ch === '"') comillas = false;
      else campo += ch;
    } else if (ch === '"') comillas = true;
    else if (ch === separador) cerrarCampo();
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && texto[i + 1] === '\n') i++;
      cerrarCampo();
      dispersas.push(fila);
      fila = [];
      if (dispersas.length >= TOPES.filas) {
        recortada = i < texto.length - 1;
        break;
      }
    } else campo += ch;
  }
  if (campo || fila.length) {
    cerrarCampo();
    if (dispersas.length < TOPES.filas) dispersas.push(fila);
  }
  while (dispersas.length && !dispersas.at(-1).some(Boolean)) dispersas.pop();
  const ancho = Math.max(0, ...dispersas.map((f) => f.findLastIndex(Boolean) + 1));
  const datos = { filas: dispersas.map((f) => Array.from({ length: ancho }, (_, j) => f[j] ?? null)), unidas: [], recortada };
  return [{ nombre: '', leer: () => datos }];
}

/** The sheets of a spreadsheet file, by its kind (tipoDePlanilla). */
export async function leerPlanilla(blob, tipo) {
  const bytes = await blob.arrayBuffer();
  return tipo === 'csv' ? leerCsv(textoDeCsv(bytes)) : leerXlsx(bytes);
}
