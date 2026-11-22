import { useSyncExternalStore } from 'react';
import { ESTILOS_DE_TARJETA } from './tarjetas';
import { normalizarVelocidad } from './voz';

// Visual settings: one `cl.ajustes` key per device. Leaving keeps it, on purpose: it holds no campus data. With «Guardar en
// tu Google Drive» they also travel with the student (aparienciaQueViaja, apariencia.js).
// Everything is validated when read. public/ajustes.js writes them to <html>; this file keeps them for the screens.
export const CLAVE_AJUSTES = 'cl.ajustes';

export const VISTAS = {
  hoy: ['agenda', 'tablero', 'compacta'],
  materia: ['secciones', 'tarjetas', 'tabla'],
  materias: ['tarjetas', 'lista', 'grandes'],
  calendario: ['mes', 'semana', 'agenda'],
};
// Inside a course, how each file, link or activity looks: with its icon in a square (as it came), a stripe of its color,
// the whole row of its color, one line with a small icon, and two to try: tiles with a big icon, and slips of paper in its
// color. With any view of the course (VISTAS.materia).
export const CONTENIDOS = ['icono', 'franja', 'tenida', 'linea', 'mosaico', 'notas'];

// The view a screen starts with while the student hasn't chosen one: the first of its list, except here. A course opens
// as cards.
const VISTA_DE_ENTRADA = { materia: 'tarjetas' };

export const OPCIONES = {
  // How everything looks, without moving anything: as it came, a ruled school sheet, gradients instead of flat colors (light
  // or dark, or black and yellow), an engineering blueprint, or the classroom's chalkboard. The last three are always dark
  // (public/ajustes.js). The looks are in tokens.css and estilos.css.
  estilo: ['original', 'hoja', 'profesional', 'batman', 'plano', 'pizarron'],
  tema: ['sistema', 'claro', 'oscuro', 'rosa', 'bosque', 'cafe', 'lavanda', 'infierno', 'glaciar'],
  contraste: ['normal', 'alto'],
  daltonismo: ['ninguno', 'rojo-verde', 'azul-amarillo'],
  letra: ['normal', 'grande', 'mas-grande', 'enorme'],
  movimiento: ['sistema', 'reducido', 'ninguno'],
  // The pages of the PDF reader: as they come, sepia (warm paper, brown ink), dark (paper dark, ink light), or as the
  // theme of the site.
  pdf: ['claro', 'sepia', 'oscuro', 'tema'],
};

// How Consultron's chat looks on this device: the size of its letter, the shape of its messages (the question in a
// bubble, both in bubbles, as a document, or close together) and the side of its button in the corner. With
// `consultronColor`, its own color in place of the main one. public/ajustes.js writes them to <html> as
// `data-consultron-letra`, `-forma`, `-lado` and `-color`; consultron.css does the rest.
export const APARIENCIA_CONSULTRON = {
  consultronLetra: ['normal', 'chica', 'grande'],
  consultronForma: ['globos', 'charla', 'documento', 'compacta'],
  consultronLado: ['derecha', 'izquierda'],
};

// Where Consultron appears on this device: 'lateral', beside what is read where it opens so (a reader, the live
// session's table) and in the box down on the right elsewhere; 'modal', always in that box, and its button down on the
// right is its only way in. Apart from APARIENCIA_CONSULTRON: «Pasar tu estilo» reads those in a fixed order.
export const APARICIONES_CONSULTRON = ['modal', 'lateral'];

// The styles that are always dark, whatever the theme says (public/ajustes.js does the same).
export const SIEMPRE_OSCUROS = ['batman'];

// The styles that look better framed (Hoja, Plano): choosing one turns Bordes on, and leaving it turns them off again, unless the
// student had them on before or touched the switch since (`bordesDelEstilo` says the style turned them on).
export const CON_BORDES = ['hoja', 'plano'];

/** What changes when a style is chosen. Another style also drops the header color chosen: the header goes back to the style's own. */
export function cambioDeEstilo(ajustes, estilo) {
  const color = estilo !== ajustes.estilo ? { cabecera: null } : {};
  if (CON_BORDES.includes(estilo)) return ajustes.bordes ? { estilo, ...color } : { estilo, ...color, bordes: true, bordesDelEstilo: true };
  if (ajustes.bordesDelEstilo) return { estilo, ...color, bordes: false, bordesDelEstilo: false };
  return { estilo, ...color };
}

/** What changes when the switch is touched: from then on, the frames are the student's. */
export const cambioDeBordes = (bordes) => ({ bordes, bordesDelEstilo: false });

// The light pages the student had, apart from `pdf` so that going dark doesn't forget them. The moon of the reader (and
// its O key) goes back to them when it's turned off, and «Como el tema» shows them with the light theme: whoever reads
// in sepia keeps sepia when the site isn't dark. Not a choice of its own on screen: picking «Claras» or «Sepia» sets it, and picking
// «Oscuras» or «Como el tema» leaves it as it was. public/ajustes.js writes it as `data-pdf-claro`.
export const PDF_CLAROS = ['claro', 'sepia'];

// How white the ink of the dark pages is: the amount of `invert()` (lector.css, through `--pdf-brillo`). At 1 the paper
// is black and the ink white; at 0.8, light gray on dark gray. 0.92 by default: #ebebeb on #141414.
export const BRILLO_PDF = { min: 0.8, max: 1, paso: 0.01, porDefecto: 0.92 };

// How wide the side panel of the PDF reader is (notes, pages and index), in pixels, dragged from its edge. The reader
// also keeps it under a tope of its own, so the pages always have most of the room (VisorPdf.jsx).
export const PANEL_PDF = { min: 220, max: 560, porDefecto: 280 };

// How wide Consultron is beside a PDF or a summary, in pixels, dragged from its edge. Each viewer also keeps it under a
// tope of its own, so what is being read keeps most of the room (consultron/EnVisor.jsx).
export const PANEL_CONSULTRON = { min: 320, max: 760, porDefecto: 380 };
// How tall Consultron is in its corner, in pixels, dragged from its top edge. The corner also keeps it under the height
// of the window (consultron/Flotante.jsx).
export const ALTO_CONSULTRON = { min: 360, max: 1400, porDefecto: 720 };
// How wide it is in its corner, dragged from its left edge. The corner also keeps it inside the window.
export const RINCON_CONSULTRON = { min: 360, max: 960, porDefecto: 520 };
// The lab (Laboratorio.jsx), on this device: how wide its files are and how tall the panel under the code, in pixels,
// dragged from their edge or moved with the arrows. The screen also keeps them under topes of its own, so the code always
// has room.
// By default wide enough for «Nuevo», «Nuevo proyecto» and «Subir zip» on one row.
export const LAB_ARCHIVOS = { min: 180, max: 480, porDefecto: 296 };
export const LAB_PANEL = { min: 120, max: 900, porDefecto: 260 };

// The letter of the code (the editor, the console, the steps), on this device: the system's fixed-width one, or one of
// four of open source (OFL) that the site serves (letrasDeCodigo.js), never from outside. public/ajustes.js writes the
// chosen one as `--codigo-letra`, with the same list. Fira Code joins `!=` and `=>` in one sign; the others don't.
const LETRA_DEL_SISTEMA = "ui-monospace, 'Cascadia Mono', 'Cascadia Code', 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace";
// What the editor colors, each with its CSS variable (styles/codigo.css): `labColores` keeps the student's own color of
// each, and public/ajustes.js puts it over the theme's. An example word shows it in Configuración.
export const COLORES_DEL_CODIGO = [
  { clave: 'clave', nombre: 'Palabras clave', ejemplo: 'for' },
  { clave: 'variable', nombre: 'Variables', ejemplo: 'total' },
  { clave: 'funcion', nombre: 'Funciones', ejemplo: 'print' },
  { clave: 'tipo', nombre: 'Tipos y clases', ejemplo: 'int' },
  { clave: 'texto', nombre: 'Textos', ejemplo: '"hola"' },
  { clave: 'numero', nombre: 'Números', ejemplo: '42' },
  { clave: 'comentario', nombre: 'Comentarios', ejemplo: '# nota' },
];

export const LETRAS_DE_CODIGO = {
  sistema: LETRA_DEL_SISTEMA,
  'jetbrains-mono': `'JetBrains Mono', ${LETRA_DEL_SISTEMA}`,
  'fira-code': `'Fira Code', ${LETRA_DEL_SISTEMA}`,
  'source-code-pro': `'Source Code Pro', ${LETRA_DEL_SISTEMA}`,
  atkinson: `'Atkinson Hyperlegible Mono', ${LETRA_DEL_SISTEMA}`,
};
// How big the code is in the editor, in pixels (`--codigo-tamano`, and the row of the sheet grows with it: `--codigo-alto`).
export const LAB_TAMANO = { min: 12, max: 22, porDefecto: 15 };
// The drawing of the database: side by side when there's room (as it came), always side by side, or one under the other,
// with the lines of the margin (DibujoBase.jsx).
export const LAB_BASES = ['auto', 'lado', 'abajo'];
// How much a level of code goes in: four spaces (as it came) or two. In C, also a Tab (`labTabEnC`).
export const LAB_SANGRIAS = [4, 2];

// The menu of the header: how it looks, and where each screen goes (in sight, inside «Más» or nowhere). In the order of
// the menu, which is also the one of Alt and a number (atajos.js). Configuración never hides: it's the way back.
// Some screens start inside «Más» (`LUGAR_DE_ENTRADA`): the ones that came later, so the header the student had doesn't
// grow, and Horario, which is looked at now and then. «A la vista» brings any of them back.
export const ESTILOS_DE_MENU = ['texto', 'iconos', 'solo-iconos', 'pastillas'];
export const EN_EL_MENU = ['hoy', 'materias', 'calendario', 'buscar', 'resumenes', 'horario', 'sysacad', 'carrera', 'mensajes', 'configuracion', 'laboratorio', 'calculadoras', 'repaso', 'consultron', 'envivo'];
export const LUGARES_EN_EL_MENU = ['vista', 'mas', 'oculta'];
const LUGAR_DE_ENTRADA = { horario: 'mas', sysacad: 'mas', carrera: 'mas', laboratorio: 'mas', calculadoras: 'mas', repaso: 'mas', consultron: 'mas', envivo: 'mas' };
const lugarValido = (clave, lugar) =>
  lugar === 'mas' || (lugar === 'oculta' && clave !== 'configuracion') || (lugar === 'vista' && clave in LUGAR_DE_ENTRADA);

// Where the menu goes: the bar on top, or a column on the left (only on wide screens: a phone keeps the bar on top).
// public/ajustes.js writes it to <html> as `data-menu-lado`, so the column is there before the first paint.
export const POSICIONES_DEL_MENU = ['arriba', 'izquierda'];
// The bar on top: where its screens go along it (as it came, to the right), and how wide it is (as the page, or the
// whole window, with more room before it folds).
export const ALINEACIONES_DEL_MENU = ['derecha', 'medio', 'izquierda'];
export const ANCHOS_DEL_MENU = ['pagina', 'pantalla'];

/** The order of the menu: the known screens as the student left them, each once, and the missing ones (a screen that
 * came later) after them, in the order they came. */
export function ordenValido(orden) {
  const elegidas = Array.isArray(orden) ? [...new Set(orden.filter((c) => EN_EL_MENU.includes(c)))] : [];
  return [...elegidas, ...EN_EL_MENU.filter((c) => !elegidas.includes(c))];
}

function normalizarMenu(crudo) {
  const menu = crudo && typeof crudo === 'object' ? crudo : {};
  const lugares = menu.lugares && typeof menu.lugares === 'object' ? menu.lugares : {};
  return {
    estilo: entre(ESTILOS_DE_MENU, menu.estilo),
    // Only the ones out of sight, and «A la vista» for the ones that start elsewhere: the rest are in sight.
    lugares: Object.fromEntries(EN_EL_MENU.map((c) => [c, lugares[c] ?? LUGAR_DE_ENTRADA[c]]).filter(([c, l]) => lugarValido(c, l))),
    orden: ordenValido(menu.orden),
    posicion: entre(POSICIONES_DEL_MENU, menu.posicion),
    alineacion: entre(ALINEACIONES_DEL_MENU, menu.alineacion),
    ancho: entre(ANCHOS_DEL_MENU, menu.ancho),
  };
}

export const ORIGINALES = {
  claro: { accion: '#17324d', resaltador: '#ffe14d' },
  oscuro: { accion: '#3578bd', resaltador: '#ffe14d' },
  // The palettes of tokens.css (`data-paleta`): Rosa oscuro, Verde bosque, Café, Infierno and Glaciar are dark, Lavanda is light.
  rosa: { accion: '#c2306e', resaltador: '#ffe14d' },
  bosque: { accion: '#17805a', resaltador: '#ffe14d' },
  cafe: { accion: '#b8531a', resaltador: '#ffe14d' },
  lavanda: { accion: '#5b3fb0', resaltador: '#ffe14d' },
  infierno: { accion: '#c4320a', resaltador: '#ffe14d' },
  glaciar: { accion: '#0e7490', resaltador: '#ffe14d' },
  // Lavanda with an always-dark style: the same violet, lighter.
  'lavanda-oscuro': { accion: '#7456d0', resaltador: '#ffe14d' },
};

const ES_COLOR = /^#[0-9a-f]{6}$/i;
const BLANCO = '#ffffff';
const OSCURO = '#0f1c28';
export const CONTRASTE_MINIMO = 4.5;

const entre = (lista, valor) => (lista.includes(valor) ? valor : lista[0]);
const colorValido = (valor) => (typeof valor === 'string' && ES_COLOR.test(valor) ? valor.toLowerCase() : null);
// Only the kinds the editor colors, each with a valid color.
const coloresDelCodigo = (valor) => Object.fromEntries(COLORES_DEL_CODIGO.flatMap(({ clave }) => {
  const c = colorValido(valor?.[clave]);
  return c ? [[clave, c]] : [];
}));
// A number between the ends, in hundredths. Anything else, the default.
const anchoPanelValido = (valor) =>
  typeof valor === 'number' && Number.isFinite(valor) ? Math.round(Math.min(PANEL_PDF.max, Math.max(PANEL_PDF.min, valor))) : PANEL_PDF.porDefecto;
const anchoConsultronValido = (valor) =>
  typeof valor === 'number' && Number.isFinite(valor) ? Math.round(Math.min(PANEL_CONSULTRON.max, Math.max(PANEL_CONSULTRON.min, valor))) : PANEL_CONSULTRON.porDefecto;
const altoConsultronValido = (valor) =>
  typeof valor === 'number' && Number.isFinite(valor) ? Math.round(Math.min(ALTO_CONSULTRON.max, Math.max(ALTO_CONSULTRON.min, valor))) : ALTO_CONSULTRON.porDefecto;
const anchoRinconValido = (valor) =>
  typeof valor === 'number' && Number.isFinite(valor) ? Math.round(Math.min(RINCON_CONSULTRON.max, Math.max(RINCON_CONSULTRON.min, valor))) : RINCON_CONSULTRON.porDefecto;
const medidaValida = (valor, { min, max, porDefecto }) => (typeof valor === 'number' && Number.isFinite(valor) ? Math.round(Math.min(max, Math.max(min, valor))) : porDefecto);
const brilloValido = (valor) =>
  typeof valor === 'number' && Number.isFinite(valor)
    ? Math.round(Math.min(BRILLO_PDF.max, Math.max(BRILLO_PDF.min, valor)) * 100) / 100
    : BRILLO_PDF.porDefecto;

export function normalizar(crudo) {
  const datos = crudo && typeof crudo === 'object' ? crudo : {};
  const vistas = datos.vistas && typeof datos.vistas === 'object' ? datos.vistas : {};
  const pdf = entre(OPCIONES.pdf, datos.pdf);
  return {
    ...Object.fromEntries(Object.entries(OPCIONES).map(([clave, lista]) => [clave, entre(lista, datos[clave])])),
    // Light pages chosen are the ones to go back to; otherwise, the ones from before.
    pdfClaro: PDF_CLAROS.includes(pdf) ? pdf : entre(PDF_CLAROS, datos.pdfClaro),
    pdfBrillo: brilloValido(datos.pdfBrillo),
    accion: colorValido(datos.accion),
    resaltador: colorValido(datos.resaltador),
    // The header's own color, apart from the buttons' (public/ajustes.js). null: the style's.
    cabecera: colorValido(datos.cabecera),
    vistas: Object.fromEntries(Object.entries(VISTAS).map(([pantalla, lista]) => [pantalla, lista.includes(vistas[pantalla]) ? vistas[pantalla] : (VISTA_DE_ENTRADA[pantalla] ?? lista[0])])),
    // «Sensible a la luz», for photosensitivity: no jumps of brightness, softer whites, animated pictures still until
    // tapped, and everything still as with «Sin animaciones» (public/ajustes.js writes `data-luz`, styles/luz.css does
    // the rest). Off unless turned on. The student's own, like daltonismo and movimiento: «Pasar tu estilo» doesn't take
    // it, and «Volver todo» leaves it as it is.
    luz: datos.luz === true,
    // Reading mode: the tools to arrange a course (options, dragging, hiding, sections) go away until it's turned off.
    lectura: datos.lectura === true,
    // Each block in a frame of its own, in any style. Off unless turned on: the site doesn't box everything, on purpose.
    bordes: datos.bordes === true,
    bordesDelEstilo: datos.bordes === true && datos.bordesDelEstilo === true,
    // «Marcar lo que ya viste»: null until the student chooses (vistos.js decides then).
    vistos: typeof datos.vistos === 'boolean' ? datos.vistos : null,
    // The page of the live Documento, dark or light: null follows the theme of the site, until the student chooses.
    documentoOscuro: typeof datos.documentoOscuro === 'boolean' ? datos.documentoOscuro : null,
    // Consultron's short note «Contesta Gemini… Bajar Consultron», while Gemini answers: until the student closes it.
    avisoBajarConsultron: datos.avisoBajarConsultron !== false,
    // The faculty's academic calendar in Calendario: on unless the student turns it off.
    facultad: datos.facultad !== false,
    // Calendario's filters, kept on this device: Hoy's week follows them too. A course by its number, '' for all.
    calSoloVencimientos: datos.calSoloVencimientos === true,
    calMateria: typeof datos.calMateria === 'string' && /^\d{1,10}$/.test(datos.calMateria) ? datos.calMateria : '',
    // The one-key shortcuts (atajos.js): on unless turned off.
    atajos: datos.atajos !== false,
    // «Modo sin mouse» (sinMouse.js): the buttons that do what a drag does. Off unless turned on.
    sinMouse: datos.sinMouse === true,

    // How fast the PDF reader reads aloud (voz.js): one of its steps, 1 until it's changed.
    velocidadVoz: normalizarVelocidad(datos.velocidadVoz),
    // The width of the side panel of the PDF reader, on this device.
    anchoPanelPdf: anchoPanelValido(datos.anchoPanelPdf),
    // The width of Consultron beside a PDF or a summary, on this device.
    anchoConsultron: anchoConsultronValido(datos.anchoConsultron),
    // How tall it is in its corner, on this device.
    altoConsultron: altoConsultronValido(datos.altoConsultron),
    // How wide it is in its corner, on this device.
    anchoRincon: anchoRinconValido(datos.anchoRincon),
    // The lab: its files and its panel, their size and whether they are hidden.
    labArchivos: medidaValida(datos.labArchivos, LAB_ARCHIVOS),
    labPanel: medidaValida(datos.labPanel, LAB_PANEL),
    labSinArchivos: datos.labSinArchivos === true,
    labSinPanel: datos.labSinPanel === true,
    // The lab's own section of Configuración: how its editor writes and shows the code.
    labAutocompletar: datos.labAutocompletar !== false,
    labLetra: entre(Object.keys(LETRAS_DE_CODIGO), datos.labLetra),
    labTamano: medidaValida(datos.labTamano, LAB_TAMANO),
    // The error of the last run at the end of its line, as Error Lens: on unless turned off.
    labErrores: datos.labErrores !== false,
    // The engine checks the code while the student types, without running it (laboratorio/revisar.js): on unless turned off.
    labRevisar: datos.labRevisar !== false,
    labBase: entre(LAB_BASES, datos.labBase),
    labAjuste: datos.labAjuste === true,
    labSangria: entre(LAB_SANGRIAS, datos.labSangria),
    labTabEnC: datos.labTabEnC === true,
    labNumeros: datos.labNumeros !== false,
    labCerrar: datos.labCerrar === true,
    labLineaActual: datos.labLineaActual !== false,
    labColores: coloresDelCodigo(datos.labColores),

    menu: normalizarMenu(datos.menu),

    // Materias: the look of every card (tarjetas.js), unless a course has its own.
    tarjeta: entre(ESTILOS_DE_TARJETA, datos.tarjeta),
    // Inside a course: the look of what it has.
    contenido: entre(CONTENIDOS, datos.contenido),
    // Consultron's chat.
    ...Object.fromEntries(Object.entries(APARIENCIA_CONSULTRON).map(([clave, lista]) => [clave, entre(lista, datos[clave])])),
    consultronColor: colorValido(datos.consultronColor),
    consultronAparicion: entre(APARICIONES_CONSULTRON, datos.consultronAparicion),
  };
}

const luminancia = (color) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const s = parseInt(color.slice(i, i + 2), 16) / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export function contraste(a, b) {
  const [x, y] = [luminancia(a), luminancia(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

export const textoSobre = (color) => (contraste(color, BLANCO) >= contraste(color, OSCURO) ? BLANCO : OSCURO);

/** True when even the best text color can't be read comfortably on this one. */
export const cuestaLeerSobre = (color) => contraste(color, textoSobre(color)) < CONTRASTE_MINIMO;

function leer() {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_AJUSTES));
  } catch {
    return null;
  }
}

let actual = normalizar(leer());
const POR_DEFECTO = normalizar(null);

// The sizes of the panels fit the screen of each device, and a mouse is in one device: they don't travel.
const DE_ESTE_DISPOSITIVO = ['anchoPanelPdf', 'anchoConsultron', 'altoConsultron', 'anchoRincon', 'sinMouse'];

/** The settings that travel with the student (mio.apariencia, joined through their Drive by union.js): only what differs
 * from the default, so a device where nothing was changed has nothing to send. */
export function aparienciaQueViaja(crudo) {
  const n = normalizar(crudo);
  const r = {};
  for (const [k, v] of Object.entries(n)) {
    if (!DE_ESTE_DISPOSITIVO.includes(k) && JSON.stringify(v) !== JSON.stringify(POR_DEFECTO[k])) r[k] = v;
  }
  return r;
}

/** This device's settings with what travelled: the rest goes back to the default, the sizes of the panels stay. */
export function conApariencia(ajustes, apariencia) {
  const r = normalizar(apariencia);
  for (const k of DE_ESTE_DISPOSITIVO) r[k] = ajustes[k];
  return r;
}
const avisados = new Set();
const avisar = () => avisados.forEach((f) => f());

function suscribir(f) {
  avisados.add(f);
  return () => avisados.delete(f);
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== CLAVE_AJUSTES && e.key !== null) return;
    actual = normalizar(leer());
    window.aplicarAjustes?.();
    avisar();
  });
}

function guardar(ajustes) {
  actual = ajustes;
  let guardado = true;
  try {
    localStorage.setItem(CLAVE_AJUSTES, JSON.stringify(ajustes));
  } catch {
    guardado = false;
  }
  window.aplicarAjustes?.(guardado ? undefined : ajustes);
  avisar();
  return guardado;
}

/** False when the browser refused to save: the change still lasts until the tab closes. */
export const cambiarAjustes = (cambio) => guardar(normalizar({ ...actual, ...cambio }));

export const elegirVista = (pantalla, vista) => cambiarAjustes({ vistas: { ...actual.vistas, [pantalla]: vista } });

export function volverAjustesOriginales() {
  // «Sensible a la luz» stays: whoever needs it shouldn't get the flashes back by starting over.
  const queda = actual.luz ? { luz: true } : null;
  actual = queda ? normalizar(queda) : POR_DEFECTO;
  try {
    if (queda) localStorage.setItem(CLAVE_AJUSTES, JSON.stringify(queda));
    else localStorage.removeItem(CLAVE_AJUSTES);
  } catch {
    // Nothing was stored in the first place, or it can't be: the choice still applies to this tab.
  }
  window.aplicarAjustes?.(actual);
  avisar();
}

/** How much moves on this device: «Sensible a la luz» keeps everything still, whatever Movimiento says. */
export const movimientoDe = (ajustes) => (ajustes.luz ? 'ninguno' : ajustes.movimiento);

export const useAjustes = () => useSyncExternalStore(suscribir, () => actual, () => POR_DEFECTO);

/** The settings now, and their changes, outside the screens (calendarioSincro.js follows the academic calendar). */
export const ajustesActuales = () => actual;
export const escucharAjustes = suscribir;

export const useVista = (nombre) => useAjustes().vistas[nombre];

export const useLectura = () => useAjustes().lectura;

export const useContenido = () => useAjustes().contenido;

export const ponerEstiloDeMenu = (estilo) => cambiarAjustes({ menu: { ...actual.menu, estilo } });

/** Where a screen of the menu goes: 'vista', 'mas' or 'oculta'. */
export const ponerEnElMenu = (clave, lugar) => cambiarAjustes({ menu: { ...actual.menu, lugares: { ...actual.menu.lugares, [clave]: lugar } } });

/** The screens of the menu in a new order (Configuración, dragging or with the keyboard). */
export const ordenarMenu = (orden) => cambiarAjustes({ menu: { ...actual.menu, orden: ordenValido(orden) } });

export const ponerPosicionDelMenu = (posicion) => cambiarAjustes({ menu: { ...actual.menu, posicion } });

/** Where the screens of the bar on top go along it, and how wide the bar is. */
export const ponerAlineacionDelMenu = (alineacion) => cambiarAjustes({ menu: { ...actual.menu, alineacion } });
export const ponerAnchoDelMenu = (ancho) => cambiarAjustes({ menu: { ...actual.menu, ancho } });

const suscribirTema = (avisar) => {
  const observador = new MutationObserver(avisar);
  observador.observe(document.documentElement, { attributes: true, attributeFilter: ['data-tema'] });
  return () => observador.disconnect();
};

/** Whether the site shows dark now: public/ajustes.js marks it in <html>, also when the device changes («Del sistema»). */
export const useTemaOscuro = () => useSyncExternalStore(suscribirTema, () => document.documentElement.dataset.tema === 'oscuro', () => false);

/** Whether the pages of the PDF reader look dark: chosen, or as the theme of the site (`temaOscuro`, useTemaOscuro). */
export const pdfOscuro = (pdf, temaOscuro) => pdf === 'oscuro' || (pdf === 'tema' && temaOscuro);

/** The moon of the reader: from dark pages back to the light ones the student had (claras or sepia), and back again. */
export const alternarPdfOscuro = (oscuro) => cambiarAjustes({ pdf: oscuro ? actual.pdfClaro : 'oscuro' });

export const cambiarDocumentoOscuro = (oscuro) => cambiarAjustes({ documentoOscuro: Boolean(oscuro) });
export const cambiarLectura = (lectura) => cambiarAjustes({ lectura: Boolean(lectura) });

/** What the color control should show: the chosen color or the one the current theme brings. */
export function colorActual(ajustes, clave) {
  const { tema: marca, paleta } = document.documentElement.dataset;
  const delTema = paleta === 'lavanda' && marca === 'oscuro' ? 'lavanda-oscuro' : paleta;
  const tema = delTema in ORIGINALES ? delTema : marca === 'oscuro' ? 'oscuro' : 'claro';
  // Consultron's own color starts as the main one.
  if (clave === 'consultronColor') return ajustes.consultronColor ?? ajustes.accion ?? ORIGINALES[tema].accion;
  // The header's starts as the one on screen, the one public/ajustes.js gives the browser's bar.
  if (clave === 'cabecera') return ajustes.cabecera ?? document.querySelector('meta[name="theme-color"]')?.getAttribute('content') ?? ORIGINALES[tema].accion;
  return ajustes[clave] ?? ORIGINALES[tema][clave];
}
