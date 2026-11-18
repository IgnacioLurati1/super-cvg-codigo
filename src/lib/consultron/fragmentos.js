// Consultron reads the student's PDFs in pieces and gives the model only the few that best match the question: a model
// that runs in the browser can't read a whole subject at once. The pieces, in memory. The text of the PDFs, indicePdf.js.

// Words that say nothing about the subject: question words, and the ones of asking for something («armame», «explicame»).
const VACIAS = new Set(
  (
    'que cual cuales como cuando donde quien quienes por para con sin del las los una uno unos unas el la lo al de en y o ' +
    'u a e es son ser se su sus le les mas muy tambien esta este estos estas ese esa eso esos esas hay sobre entre segun ' +
    'desde hasta puede pueden debe deben tiene tienen cuanto cuanta cuantos cuantas respecto apunte apuntes explica ' +
    'explicame establece armame arma hace hacer dame decime resumime resumen preguntas pregunta repaso respuestas ' +
    'respuesta dice dicen materia'
  ).split(' '),
);

/** Lowercase and without accents (the ñ stays). */
export const plegar = (t) => String(t ?? '').toLowerCase().normalize('NFD').replace(/(?!̃)[̀-ͯ]/g, '').normalize('NFC');

// A rough root: «contratos» and «contrato» count as the same word.
function raiz(p) {
  if (p.length > 5 && p.endsWith('es')) return p.slice(0, -2);
  if (p.length > 4 && p.endsWith('s')) return p.slice(0, -1);
  return p;
}

// «M/M/1» and «mm1» are the same word: short pieces joined by slashes go together.
const juntarBarras = (t) => t.replace(/\b[a-z0-9]{1,2}(?:\/[a-z0-9]{1,3})+\b/g, (m) => m.replaceAll('/', ''));

/** The words of a text that count for the search, by their root. */
export function palabras(texto) {
  return (juntarBarras(plegar(texto)).match(/[a-z0-9ñ]+/g) ?? []).filter((p) => (p.length > 2 || /\d/.test(p)) && !VACIAS.has(p)).map(raiz);
}

// What every page of a document starts with (the name of the course, the professor): it is not content.
function encabezado(paginas) {
  if (paginas.length < 3) return '';
  let comun = paginas[0];
  for (const p of paginas.slice(1)) {
    let i = 0;
    while (i < comun.length && comun[i] === p[i]) i++;
    comun = comun.slice(0, i);
    if (!comun) return '';
  }
  comun = comun.slice(0, comun.lastIndexOf(' ') + 1);
  return comun.length >= 20 ? comun : '';
}

// Words of a greeting or of talking with Consultron itself, not of a subject.
const CHARLA = new Set(
  (
    'hola holis buenas buen buenos dia dias tarde tardes noche noches gracias chau adios saludo saludos tal todo bien ' +
    'andas anda estas sabes saber sabe podes puedes haces hacer sos eres quien ayuda ayudas ayudar ayudame che genial joya ' +
    'dale bueno buena perfecto capo crack leiste leer leido materias consultron hey hello ok okey listo'
  ).split(' '),
);

/** Whether a message is a greeting or talk with Consultron (`hola`, `qué sabés`), not a question about a subject. */
export function esCharla(texto) {
  const ps = plegar(texto).match(/[a-z0-9ñ]+/g) ?? [];
  return ps.length > 0 && ps.every((p) => CHARLA.has(p) || VACIAS.has(p) || p.length < 3);
}

/** Pieces of about `largo` letters of one document, cut at the end of a sentence. `paginas`: the text of each page.
 * Each piece: { doc, pagina, texto }, with `doc` whatever the caller uses to know the document. */
export function trozar(doc, paginas, largo = 900) {
  const sobra = encabezado(paginas);
  const trozos = [];
  paginas.forEach((crudo, i) => {
    const texto = String(crudo ?? '').replace(/\s+/g, ' ').trim();
    const limpio = sobra && texto.startsWith(sobra) ? texto.slice(sobra.length) : texto;
    let actual = '';
    // A sentence longer than a piece (a table read as text) is cut where it goes.
    const partes = limpio.split(/(?<=[.?!:;])\s+/).flatMap((o) => Array.from({ length: Math.ceil(o.length / largo) }, (_, k) => o.slice(k * largo, (k + 1) * largo)));
    for (const parte of partes) {
      if (actual && actual.length + parte.length > largo) {
        trozos.push({ doc, pagina: i + 1, texto: actual.trim() });
        actual = '';
      }
      actual += `${parte} `;
    }
    if (actual.trim().length > 30) trozos.push({ doc, pagina: i + 1, texto: actual.trim() });
  });
  return trozos;
}

/** What the search needs of each piece: its words, counted once. */
export function prepararTrozos(trozos) {
  return trozos.map((t) => {
    // `buscar`, if it has it: the words to find it by, besides its text (the guide of the site, sitio.js).
    const ps = palabras(t.buscar ?? t.texto);
    const tf = new Map();
    for (const p of ps) tf.set(p, (tf.get(p) ?? 0) + 1);
    return { t, tf, largo: ps.length };
  });
}

/** The index of some prepared pieces (`prepararTrozos`), which can come from several documents. */
export function juntar(docs) {
  const df = new Map();
  for (const d of docs) for (const p of d.tf.keys()) df.set(p, (df.get(p) ?? 0) + 1);
  const medio = docs.reduce((s, d) => s + d.largo, 0) / Math.max(docs.length, 1);
  return { docs, df, medio, n: docs.length };
}

/** What the search needs of some pieces, counted once. */
export const indexar = (trozos) => juntar(prepararTrozos(trozos));

/** The `cuantos` pieces that best match a question (BM25), at most `porPagina` of the same page, best first. Each:
 * { trozo, puntaje, cubre }, `cubre` being how many of the question's words it has. Nothing if no word of the question
 * is in them. */
export function elegir(indice, pregunta, { cuantos = 6, porPagina = 2 } = {}) {
  const k1 = 1.2;
  const b = 0.75;
  const ps = [...new Set(palabras(pregunta))];
  if (!ps.length || !indice.n) return [];
  const puntajes = indice.docs.map((d) => {
    let s = 0;
    let cubre = 0;
    for (const p of ps) {
      const f = d.tf.get(p);
      if (!f) continue;
      cubre += 1;
      const df = indice.df.get(p);
      const idf = Math.log(1 + (indice.n - df + 0.5) / (df + 0.5));
      s += (idf * f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.largo) / indice.medio));
    }
    return { trozo: d.t, puntaje: s, cubre };
  });
  puntajes.sort((x, y) => y.puntaje - x.puntaje);
  const elegidos = [];
  const usadas = new Map();
  for (const p of puntajes) {
    if (p.puntaje <= 0 || elegidos.length >= cuantos) break;
    const clave = `${p.trozo.doc}#${p.trozo.pagina}`;
    if ((usadas.get(clave) ?? 0) >= porPagina) continue;
    usadas.set(clave, (usadas.get(clave) ?? 0) + 1);
    elegidos.push(p);
  }
  return elegidos;
}
