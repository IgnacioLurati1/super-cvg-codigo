import { idDeYoutube, normalizar } from './datos';
import { leerEnlace } from './drivePublico';

// Each course gets a symbol from its name, and the same one on every screen.
// The order matters: «Algoritmos Genéticos» has to find «genetic» before «algoritmo».
const POR_NOMBRE = [
  ['adn', /genetic|biolog/],
  ['chispa', /inteligencia artificial|machine learning|neuronal|aprendizaje/],
  ['antena', /comunicacion|redes|telecomunic|telefonia|transmision/],
  ['balanza', /legislacion|derecho|etica|legal/],
  ['barras', /probabilidad|estadistic/],
  ['sigma', /analisis|algebra|matematic|calculo|discreta|numeric/],
  ['atomo', /fisica/],
  ['matraz', /quimica/],
  ['burbuja', /ingles|idioma|frances|portugues/],
  ['base', /bases? de datos|gestion de datos/],
  ['codigo', /programacion|algoritmo|paradigma|sintaxis|lenguaje|compilador|software/],
  ['chip', /arquitectura|sistemas operativos|hardware|tecnologia/],
  ['escudo', /seguridad/],
  ['moneda', /econom|costo|finanz/],
  ['maletin', /administracion|gerencia|organizacion|gestion/],
  ['compas', /diseno|dibujo|geometria/],
  ['cubo', /simulacion|modelo|investigacion operativa/],
  ['bandera', /proyecto final|tesis/],
  ['personas', /sociedad|sociolog|psicolog/],
];

const POR_NUMERO = ['libro', 'estrella', 'hoja', 'hexagono', 'rombo', 'brujula'];

// The departments of the campus, by their name (Básicas, Civil…). Any other area gets a folder.
const POR_DEPARTAMENTO = [
  ['sigma', /basicas/],
  ['puente', /civil/],
  ['rayo', /electric/],
  ['engranaje', /mecanica/],
  ['matraz', /quimica/],
  ['codigo', /sistemas|informacion/],
];

export function simboloDeDepartamento(nombre) {
  const texto = normalizar(nombre);
  return POR_DEPARTAMENTO.find(([, patron]) => patron.test(texto))?.[0] ?? 'carpeta';
}

export function simboloDe(nombre, id) {
  if (!id) return 'calendario';
  const texto = normalizar(nombre);
  const hallado = POR_NOMBRE.find(([, patron]) => patron.test(texto));
  return hallado ? hallado[0] : POR_NUMERO[id % POR_NUMERO.length];
}

// The kind of file, by its extension (or its type, when the name has none).
const CLASES_DE_ARCHIVO = [
  ['pdf', /^pdf$/, /pdf/],
  ['planilla', /^(xlsx?|xlsm|ods|csv|tsv)$/, /spreadsheet|excel|csv/],
  ['presentacion', /^(pptx?|ppsx?|odp|key)$/, /presentation|powerpoint/],
  ['imagen', /^(png|jpe?g|gif|webp|svg|bmp|heic|avif)$/, /^image\//],
  ['doc', /^(docx?|odt|rtf|txt|md)$/, /word|opendocument\.text|^text\//],
];

function claseDeArchivo(item) {
  const nombre = String(item.archivo ?? item.nombre ?? '');
  const ext = nombre.includes('.') ? nombre.split('.').at(-1).toLowerCase() : '';
  const mime = String(item.mime ?? '').toLowerCase();
  return CLASES_DE_ARCHIVO.find(([, porExt, porMime]) => (ext ? porExt.test(ext) : mime && porMime.test(mime)))?.[0] ?? null;
}

const DIBUJO_DE_ARCHIVO = { planilla: 'planilla', presentacion: 'presentacion', imagen: 'imagen' };

// Services that show up in courses all the time, told apart by their address: each one with a drawing and the color of
// its kind. Forms before the other Google documents: they share docs.google.com.
const SERVICIOS = [
  ['formulario', 'formulario', /^(docs\.google\.com\/forms|(forms\.gle|forms\.google\.com|forms\.office\.com)\/)/],
  ['documento', 'doc', /^docs\.google\.com\/document/],
  ['planilla', 'planilla', /^(docs\.google\.com\/spreadsheets|sheets\.google\.com\/)/],
  ['presentacion', 'presentacion', /^(docs\.google\.com\/presentation|slides\.google\.com\/)/],
  ['carpeta', 'drive', /^(drive\.google\.com|1drv\.ms|onedrive\.live\.com|[a-z0-9-]+\.sharepoint\.com)\//],
  ['videollamada', 'videollamada', /^([a-z0-9-]+\.)?(zoom\.us|meet\.google\.com|teams\.microsoft\.com|teams\.live\.com|meet\.jit\.si)\//],
  ['codigo', 'codigo', /^(github\.com|gitlab\.com)\//],
];

/** The drawing and color of a link: a YouTube video, a known service or, if none, a plain link. */
export function iconoDeEnlace(destino, video = idDeYoutube(destino)) {
  if (video) return { simbolo: 'video', tono: 'video' };
  let clave;
  try {
    const url = new URL(destino);
    clave = `${url.hostname.toLowerCase().replace(/^www\./, '')}${url.pathname}`;
  } catch {
    return { simbolo: 'enlace', tono: 'enlace' };
  }
  const hallado = SERVICIOS.find(([, , patron]) => patron.test(clave));
  return hallado ? { simbolo: hallado[0], tono: hallado[1] } : { simbolo: 'enlace', tono: 'enlace' };
}

// Google's own documents, by their address: drawn as the file they are, not as a service.
const DOCUMENTOS_DE_GOOGLE = new Set(['documento', 'planilla', 'presentacion']);

/** The drawing and color of a link to a file in Drive, as the file it is: by the extension of its name in Drive
 * (`titulo`, else the name shown) or, if a Google document, by its address. `enlace` says to draw it with the
 * link badge, so it is not taken for a file of the course. A folder or any other link: null. `esArchivo`: Classroom
 * already said it is a file, whatever the address looks like. */
export function dibujoDeArchivoEnlazado(destino, titulo, esArchivo = false) {
  const servicio = iconoDeEnlace(destino);
  if (DOCUMENTOS_DE_GOOGLE.has(servicio.simbolo)) return { simbolo: servicio.simbolo, tono: servicio.tono, enlace: true };
  const enDrive = leerEnlace(destino);
  if (esArchivo ? enDrive?.carpeta : !enDrive || enDrive.carpeta) return null;
  const clase = claseDeArchivo({ nombre: titulo });
  return { simbolo: DIBUJO_DE_ARCHIVO[clase] ?? 'documento', tono: clase ?? 'drive', enlace: true };
}

/** The drawing, color and link badge of an item. A link to a file in Drive is drawn as that file, with the badge. */
export function dibujoDeItem(item) {
  if (item.tipo === 'archivo') return { simbolo: DIBUJO_DE_ARCHIVO[claseDeArchivo(item)] ?? 'documento', tono: claseDeArchivo(item), enlace: false };
  if (item.tipo === 'enlace') {
    if (!item.video) {
      const archivo = dibujoDeArchivoEnlazado(item.destino, item.tituloEnDrive ?? item.nombre, Boolean(item.tituloEnDrive));
      if (archivo) return archivo;
    }
    return { ...iconoDeEnlace(item.destino, item.video), enlace: false };
  }
  if (item.tipo === 'texto') return { simbolo: 'texto', tono: 'texto', enlace: false };
  return { simbolo: 'actividad', tono: 'actividad', enlace: false };
}

export const simboloDeItem = (item) => dibujoDeItem(item).simbolo;

/** The color of an item's symbol, so a PDF, a spreadsheet, a link or a task are told apart at a glance. A file of an
 * unknown kind has none. */
export const tonoDeItem = (item) => dibujoDeItem(item).tono;
