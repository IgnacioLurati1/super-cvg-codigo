// What the reader of PDFs keeps and how it finds words. Pure: no storage, no network and no PDF library.
//
// The student's highlights and notes (mio.js, `lecturas`) are kept by file, under a key made only of numbers: the course
// and the campus key of the file (module number, and which file of it), or «a» and the id of a file of one's own. Of
// each highlight only where it is (its page, its boxes from 0 to 1 of the page and its place in the page's text), its
// color, the student's note and two dates. Of each bookmark, its page and when it was put. Never the text of the PDF:
// the quote is read from the open file.

export const COLORES = ['amarillo', 'verde', 'celeste', 'rosa'];
export const MAX_NOTA_RESALTADO = 2000;
const MAX_DOCS = 1000;
const MAX_RESALTADOS = 500;
export const MAX_SENALADORES = 200;
export const MAX_NOMBRE_SENALADOR = 60;
const MAX_CAJAS = 80;
const MAX_PAGINA = 100_000;
const MAX_LARGO = 50_000;

const LECTURA_VACIA = Object.freeze({ pagina: null, resaltados: Object.freeze([]), senaladores: Object.freeze([]) });
export { LECTURA_VACIA };

/** A file of the campus: «<course>-<key>». One of the student's own: «a<id>». A summary of El Santo Resumen (someone
 * else's or the student's own): «r» and its id without dashes. */
export const esDoc = (k) => typeof k === 'string' && /^(\d{1,12}-\d{1,12}(\.[0-9a-z]{1,12})?|a[0-9a-z]{8,32}|r[0-9a-f]{32})$/.test(k);

/** The key of a summary of El Santo Resumen read here, or null if its id is not one. */
export function docDeResumen(id) {
  if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
  return `r${id.replaceAll('-', '').toLowerCase()}`;
}

/** The key of the file an item opens, or null if it has none (then nothing of it is kept). */
export function docDe(item) {
  if (!item) return null;
  if (typeof item.archivoId === 'string' && /^[0-9a-z]{8,32}$/.test(item.archivoId)) return `a${item.archivoId}`;
  if (item.propio || item.origen === 'classroom' || !Number.isSafeInteger(item.materiaId) || typeof item.clave !== 'string') return null;
  const k = `${item.materiaId}-${item.clave}`;
  return esDoc(k) ? k : null;
}

const redondo = (n) => Math.round(n * 10_000) / 10_000;
const esFecha = (n) => Number.isSafeInteger(n) && n > 0;

function sanearCaja(c) {
  if (!Array.isArray(c) || c.length !== 4) return null;
  const [x, y, w, h] = c;
  if (![x, y, w, h].every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
  if (x < 0 || y < 0 || w <= 0 || h <= 0 || x + w > 1.001 || y + h > 1.001) return null;
  return [redondo(x), redondo(y), redondo(w), redondo(h)];
}

/** A highlight as it is kept, or null. */
export function sanearResaltado(r) {
  if (!r || typeof r !== 'object' || !Number.isSafeInteger(r.id) || r.id <= 0) return null;
  if (!Number.isInteger(r.pagina) || r.pagina < 1 || r.pagina > MAX_PAGINA) return null;
  const cajas = (Array.isArray(r.cajas) ? r.cajas : []).slice(0, MAX_CAJAS).map(sanearCaja).filter(Boolean);
  if (!cajas.length) return null;
  const conTexto = Number.isInteger(r.desde) && Number.isInteger(r.hasta) && r.desde >= 0 && r.hasta > r.desde && r.hasta - r.desde <= MAX_LARGO;
  const creado = esFecha(r.creado) ? r.creado : esFecha(r.cambiado) ? r.cambiado : 1;
  return {
    id: r.id,
    pagina: r.pagina,
    cajas,
    desde: conTexto ? r.desde : null,
    hasta: conTexto ? r.hasta : null,
    color: COLORES.includes(r.color) ? r.color : COLORES[0],
    nota: typeof r.nota === 'string' ? r.nota.trim().slice(0, MAX_NOTA_RESALTADO) : '',
    creado,
    cambiado: esFecha(r.cambiado) && r.cambiado >= creado ? r.cambiado : creado,
  };
}

/** The name the student gave a bookmark: one line of text, or '' for none. */
export const nombreDeSenalador = (n) => (typeof n === 'string' ? n.replace(/[\p{Cc}\p{Cf}\u2028\u2029]+/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_NOMBRE_SENALADOR).trim() : '');

/** A bookmark as it is kept, or null: its page, when it was put and, if the student gave it one, its name. */
export function sanearSenalador(s) {
  if (!s || typeof s !== 'object' || !Number.isInteger(s.pagina) || s.pagina < 1 || s.pagina > MAX_PAGINA) return null;
  const nombre = nombreDeSenalador(s.nombre);
  return { pagina: s.pagina, creado: esFecha(s.creado) ? s.creado : 1, ...(nombre ? { nombre } : {}) };
}

// One per page, in the order of the pages, up to the tope.
function sanearSenaladores(lista) {
  const porPagina = new Map();
  for (const s of (Array.isArray(lista) ? lista : []).slice(0, MAX_SENALADORES * 2)) {
    const limpio = sanearSenalador(s);
    if (limpio && !porPagina.has(limpio.pagina)) porPagina.set(limpio.pagina, limpio);
  }
  return [...porPagina.values()].sort((a, b) => a.pagina - b.pagina).slice(0, MAX_SENALADORES);
}

// By page, then from top to bottom and left to right.
const enOrden = (a, b) => a.pagina - b.pagina || a.cajas[0][1] - b.cajas[0][1] || a.cajas[0][0] - b.cajas[0][0] || a.id - b.id;

function sanearLectura(l) {
  if (!l || typeof l !== 'object') return null;
  const vistos = new Set();
  const resaltados = [];
  for (const r of (Array.isArray(l.resaltados) ? l.resaltados : []).slice(0, MAX_RESALTADOS)) {
    const limpio = sanearResaltado(r);
    if (limpio && !vistos.has(limpio.id)) {
      vistos.add(limpio.id);
      resaltados.push(limpio);
    }
  }
  // Page 1 is where every file opens: it is not kept.
  const pagina = Number.isInteger(l.pagina) && l.pagina > 1 && l.pagina <= MAX_PAGINA ? l.pagina : null;
  const senaladores = sanearSenaladores(l.senaladores);
  if (!pagina && !resaltados.length && !senaladores.length) return null;
  return { pagina, resaltados: resaltados.sort(enOrden), senaladores };
}

/** Everything that enters (mio.js) goes through here: only known keys, fields, types and sizes. */
export function sanearLecturas(x) {
  const salida = {};
  if (!x || typeof x !== 'object' || Array.isArray(x)) return salida;
  for (const [doc, l] of Object.entries(x)) {
    if (Object.keys(salida).length >= MAX_DOCS) break;
    const limpia = esDoc(doc) && sanearLectura(l);
    if (limpia) salida[doc] = limpia;
  }
  return salida;
}

export const lecturaEn = (lecturas, doc) => lecturas?.[doc] ?? LECTURA_VACIA;

/** Whether one more file fits. */
export const cabeOtro = (lecturas, doc) => Boolean(lecturas?.[doc]) || Object.keys(lecturas ?? {}).length < MAX_DOCS;

export const conResaltado = (l, r) => ({ ...l, resaltados: [...l.resaltados.filter((x) => x.id !== r.id), r] });
export const sinResaltado = (l, id) => ({ ...l, resaltados: l.resaltados.filter((x) => x.id !== id) });
export function cambiarResaltadoEn(l, id, cambios, ahora) {
  return { ...l, resaltados: l.resaltados.map((x) => (x.id === id ? { ...x, ...cambios, id, pagina: x.pagina, cajas: x.cajas, cambiado: Math.max(ahora, x.cambiado) } : x)) };
}
export const conPagina = (l, pagina) => ({ ...l, pagina });

export const estaSenalada = (l, pagina) => l.senaladores.some((s) => s.pagina === pagina);
/** Whether one more bookmark fits in the file (one already there always does). */
export const cabeSenalador = (l, pagina) => estaSenalada(l, pagina) || l.senaladores.length < MAX_SENALADORES;
export const conSenalador = (l, s) => ({ ...l, senaladores: [...l.senaladores.filter((x) => x.pagina !== s.pagina), s].sort((a, b) => a.pagina - b.pagina) });
export const sinSenalador = (l, pagina) => ({ ...l, senaladores: l.senaladores.filter((x) => x.pagina !== pagina) });
export function nombrarSenaladorEn(l, pagina, nombre) {
  const limpio = nombreDeSenalador(nombre);
  return { ...l, senaladores: l.senaladores.map((x) => (x.pagina !== pagina ? x : limpio ? { pagina, creado: x.creado, nombre: limpio } : { pagina, creado: x.creado })) };
}

let serie = 0;
/** A whole number of its own, safe on every device: the time and a little more. */
export const idNuevo = (ahora = Date.now()) => ahora * 1000 + (serie++ % 1000);

// ---------- The text of a page ----------

/** The text of a page as one string, from the pieces pdf.js gives (`getTextContent().items`), and where each piece
 * starts in it. A piece that ends a line gets a line break. The offsets of a highlight point into this text. */
export function textoDePagina(items) {
  let texto = '';
  const inicios = [];
  for (const item of items ?? []) {
    if (typeof item?.str !== 'string') continue;
    inicios.push(texto.length);
    texto += item.str;
    if (item.hasEOL) texto += '\n';
  }
  return { texto, inicios };
}

/** Which piece holds a place of the text: the last one that starts at or before it. */
export function piezaEn(inicios, lugar) {
  let bajo = 0;
  let alto = inicios.length - 1;
  if (alto < 0) return -1;
  while (bajo < alto) {
    const medio = (bajo + alto + 1) >> 1;
    if (inicios[medio] <= lugar) bajo = medio;
    else alto = medio - 1;
  }
  return bajo;
}

const MARCAS = /[̀-ͯ]/g;
const ESPACIO = /\s/;
const LETRA = /[\p{L}\p{N}]/u;

/** The text folded to compare: no accents, in lowercase, every run of spaces as one. `origen[i]` says from which
 * letter of the text the i-th one of `plano` came. */
export function plegar(texto) {
  const salida = [];
  const origen = [];
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    const codigo = c.charCodeAt(0);
    if (codigo === 0xad) continue;
    if (ESPACIO.test(c)) {
      if (salida.length && salida[salida.length - 1] !== ' ') {
        salida.push(' ');
        origen.push(i);
      }
      continue;
    }
    if (codigo < 128) {
      salida.push(codigo >= 65 && codigo <= 90 ? String.fromCharCode(codigo + 32) : c);
      origen.push(i);
      continue;
    }
    for (const parte of c.normalize('NFKD').replace(MARCAS, '').toLowerCase()) {
      salida.push(parte);
      origen.push(i);
    }
  }
  return { plano: salida.join(''), origen };
}

/** The words of what was searched, folded. */
export const palabrasDe = (consulta) => plegar(String(consulta ?? '')).plano.split(' ').filter(Boolean);

const empiezaPalabra = (plano, i) => i === 0 || !LETRA.test(plano[i - 1]);

/** Where something is in a folded text, as [from, to) pairs in order, without overlaps. `alInicio`: only where a word
 * starts. */
export function hallarEn(plano, buscado, { alInicio = false, tope = 10_000 } = {}) {
  const halladas = [];
  if (!buscado) return halladas;
  let i = plano.indexOf(buscado);
  while (i !== -1 && halladas.length < tope) {
    if (!alInicio || empiezaPalabra(plano, i)) {
      halladas.push([i, i + buscado.length]);
      i = plano.indexOf(buscado, i + buscado.length);
    } else {
      i = plano.indexOf(buscado, i + 1);
    }
  }
  return halladas;
}

/** Several words at once: each one where it is, joined in order. */
export function hallarPalabras(plano, palabras, opciones) {
  const todas = palabras.flatMap((p) => hallarEn(plano, p, opciones)).sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const salida = [];
  for (const h of todas) {
    const ultima = salida[salida.length - 1];
    if (ultima && h[0] < ultima[1]) ultima[1] = Math.max(ultima[1], h[1]);
    else salida.push([...h]);
  }
  return salida;
}

/** A place of the folded text back in the text: [from, to). */
export const enTexto = (origen, [desde, hasta]) => [origen[desde], origen[hasta - 1] + 1];

// Find in the document: less than this many letters finds everything, and more matches than the tope are not marked
// (one letter in a long PDF would be tens of thousands of marks).
export const MIN_BUSCADO = 2;
export const TOPE_HALLAZGOS = 500;

const buscadoDe = (consulta) => plegar(String(consulta ?? '')).plano.trim();
const letras = (t) => t.replace(/ /g, '').length;

/** Whether what was typed is long enough to look for. */
export const alcanzaParaBuscar = (consulta) => letras(buscadoDe(consulta)) >= MIN_BUSCADO;

/** Find in the document: what was typed as it is, and if it is nowhere, each of its words. `paginas`: the folded text
 * of each page (null if not read yet). Gives [{ pagina, desde, hasta }] in order, with the places in the page's text,
 * at most `tope` of them. */
export function hallarEnDocumento(paginas, consulta, tope = TOPE_HALLAZGOS) {
  const buscado = buscadoDe(consulta);
  if (letras(buscado) < MIN_BUSCADO) return [];
  const correr = (fn) => {
    const salida = [];
    for (let i = 0; i < paginas.length && salida.length < tope; i++) {
      const p = paginas[i];
      if (!p) continue;
      for (const h of fn(p.plano, tope - salida.length)) {
        const [desde, hasta] = enTexto(p.origen, h);
        salida.push({ pagina: i + 1, desde, hasta });
        if (salida.length >= tope) break;
      }
    }
    return salida;
  };
  const juntas = correr((plano, queda) => hallarEn(plano, buscado, { tope: queda }));
  if (juntas.length || !buscado.includes(' ')) return juntas;
  const palabras = buscado.split(' ').filter((w) => w.length >= MIN_BUSCADO);
  return palabras.length ? correr((plano) => hallarPalabras(plano, palabras)) : [];
}

// ---------- A piece of a page with the words marked ----------

/** The text near the first word found, at most `largo` letters, in parts: [{ texto, marca }]. Cut at spaces, with «…»
 * where it was cut. */
export function recorte(texto, palabras, { largo = 160, antes = 50 } = {}) {
  const { plano, origen } = plegar(texto);
  const halladas = hallarPalabras(plano, palabras, { alInicio: true }).map((h) => enTexto(origen, h));
  if (!halladas.length) return [];
  let desde = Math.max(0, halladas[0][0] - antes);
  if (desde > 0) {
    const espacio = texto.slice(desde, halladas[0][0]).search(/\s/);
    if (espacio !== -1) desde += espacio + 1;
  }
  let hasta = Math.min(texto.length, desde + largo);
  if (hasta < texto.length) {
    const espacio = texto.slice(Math.max(halladas[0][1], hasta - 30), hasta).search(/\s\S*$/);
    if (espacio !== -1) hasta = Math.max(halladas[0][1], hasta - 30) + espacio;
  }
  const partes = [];
  const sumar = (t, marca) => {
    const limpio = t.replace(/\s+/g, ' ');
    if (limpio) partes.push({ texto: limpio, marca });
  };
  let cursor = desde;
  for (const [a, b] of halladas) {
    if (b <= desde || a >= hasta) continue;
    sumar(texto.slice(cursor, Math.max(cursor, a)), false);
    sumar(texto.slice(Math.max(cursor, a), Math.min(b, hasta)), true);
    cursor = Math.min(b, hasta);
  }
  sumar(texto.slice(cursor, hasta), false);
  if (!partes.length) return partes;
  // The «…» go outside the marks.
  if (partes[0].marca) partes.unshift({ texto: '', marca: false });
  if (partes[partes.length - 1].marca) partes.push({ texto: '', marca: false });
  const n = partes.length - 1;
  partes[0] = { ...partes[0], texto: (desde > 0 ? '…' : '') + partes[0].texto.trimStart() };
  partes[n] = { ...partes[n], texto: partes[n].texto.trimEnd() + (hasta < texto.length ? '…' : '') };
  return partes.filter((p) => p.texto);
}

// ---------- Search inside the PDFs of Buscar ----------

/** In the text of the PDFs read (`indice`: Map of key to { paginas: [{ texto, plano }] }), the files where every word
 * is, each word at the start of a word. For each one, the first page with all of them (or with most), how many pages
 * have them all and a piece of that page with the words marked: Map of key to { pagina, otras, partes }. */
export function buscarEnIndice(indice, consulta) {
  const palabras = palabrasDe(consulta);
  const salida = new Map();
  if (!palabras.length) return salida;
  for (const [doc, { paginas }] of indice) {
    const enDoc = new Set();
    let mejor = null;
    let completas = 0;
    paginas.forEach((p, i) => {
      const estan = palabras.filter((w) => hallarEn(p.plano, w, { alInicio: true, tope: 1 }).length > 0);
      for (const w of estan) enDoc.add(w);
      if (estan.length === palabras.length) completas += 1;
      if (estan.length && (!mejor || estan.length > mejor.cuantas)) mejor = { pagina: i + 1, cuantas: estan.length };
    });
    if (enDoc.size < palabras.length || !mejor) continue;
    salida.set(doc, {
      pagina: mejor.pagina,
      otras: Math.max(0, completas - (mejor.cuantas === palabras.length ? 1 : 0)),
      partes: recorte(paginas[mejor.pagina - 1].texto, palabras),
    });
  }
  return salida;
}
