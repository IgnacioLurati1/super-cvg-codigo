import {
  ALINEACIONES_DEL_MENU, ALTO_CONSULTRON, ANCHOS_DEL_MENU, CALIDADES_DEL_FONDO, DESENFOQUE_DEL_FONDO, FILTROS_DEL_FONDO, INTENSIDAD_DEL_FILTRO, TONO_DEL_FILTRO, APARIENCIA_CONSULTRON, BRILLO_PDF, CONTENIDOS, EN_EL_MENU, ESTILOS_DE_MENU, LUGARES_EN_EL_MENU, OPCIONES, PANEL_CONSULTRON, PANEL_PDF,
  PDF_CLAROS, POSICIONES_DEL_MENU, RINCON_CONSULTRON, VISTAS, normalizar,
} from './ajustes';
import { GRUPOS_DE_AVISOS } from './avisos';
import { BLOQUES_DE_HOY, DIAS_DE_HOY, columnaDe, ordenDeHoy } from './hoy';
import { ESTILOS_DE_TARJETA } from './tarjetas';
import { VELOCIDADES } from './voz';

// «Pasar tu estilo», in Configuración: the whole Configuración of a student in a short code a classmate pastes. Every
// setting of this device (ajustes.js) and the student's own of Hoy and the bell (mio.js), except color blindness and
// movement, what each one needs. Nothing of a course (cards of one course, courses out of Hoy): the other one has other
// courses. Nothing goes to a server: the code is the whole thing.
//
// Written in Crockford's base 32 (no i, l, o or u, which read like 1, 0 or v; typed, they count as those). Each setting
// takes a fixed number of characters: its place in its list, a number, a set as bits, an order as its rank among all
// orders. The colors go last, six hex digits or «z» without one, and a last character checks the rest, so a typo
// doesn't pass as someone else's look. The lists only grow at the end; a version goes first, in case that ever changes.

// Version 2 added what a course looks like inside (`contenido`): a code of version 1 still reads, without it. Version 3
// added where the screens of the bar on top go and how wide it is. Version 4, the header's own color, after the others.
// Version 5 came with Diseños, a screen more in the menu: its order and places take more characters. A code of an older
// version, or of 5 made before Diseños, still reads with the screens it had then, and Diseños where it starts. Version 6,
// the background's filters (its strength, the tone and the blur), after the others. Version 7, the color of the line
// under the header in Pizarrón, after the colors. Version 8, Batman's yellow beam (`fogonazo`), after the others: an older
// code reads it on, as it always was. Version 9, the theme's own color with the strong version (`temaColor`), after the
// colors.
const VERSION = '9';
const VERSIONES = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
const PREFIJO = 'CVG';
// The longest a typed code can be (the field in Configuración takes this much too): far more than any code is.
export const MAX_ESCRITO = 200;
const ABC = '0123456789abcdefghjkmnpqrstvwxyz';
const SIN_COLOR = 'z';

const aNumero = (texto) => [...texto].reduce((n, c) => n * 32 + ABC.indexOf(c), 0);
const aTexto = (n, ancho) => {
  let t = '';
  for (let i = 0; i < ancho; i++) {
    t = ABC[n % 32] + t;
    n = Math.floor(n / 32);
  }
  return t;
};

// An order of `n` things as one number (its Lehmer code), and back.
const factorial = (n) => (n <= 1 ? 1 : n * factorial(n - 1));
function rangoDe(orden, todos) {
  const quedan = [...todos];
  return orden.reduce((n, x, i) => {
    const j = quedan.indexOf(x);
    quedan.splice(j, 1);
    return n + j * factorial(todos.length - 1 - i);
  }, 0);
}
function ordenDe(rango, todos) {
  const quedan = [...todos];
  return todos.map((_, i) => {
    const f = factorial(todos.length - 1 - i);
    const j = Math.floor(rango / f);
    rango %= f;
    return quedan.splice(j, 1)[0];
  });
}

const bits = (lista, si) => lista.reduce((n, x, i) => (si(x) ? n + 2 ** i : n), 0);
const deBits = (lista, n) => lista.filter((_, i) => Math.floor(n / 2 ** i) % 2 === 1);
// Three places per menu screen, as one number in base 3.
const enBase3 = (valores) => valores.reduceRight((n, v) => n * 3 + v, 0);
const deBase3 = (n, cuantos) => Array.from({ length: cuantos }, () => {
  const v = n % 3;
  n = Math.floor(n / 3);
  return v;
});

// The screens a code carries, always the same so the codes already shared keep reading: a screen that came later
// (Pizarrón) isn't in them, and goes where it starts (ajustes.js). The ones before Diseños: `menu: 'antes'` reads them
// (never written), `menu: 'ahora'` writes and reads all of MENU_DEL_CODIGO.
const DESPUES_DEL_CODIGO = ['pizarron'];
export const MENU_DEL_CODIGO = EN_EL_MENU.filter((s) => !DESPUES_DEL_CODIGO.includes(s));
const ANTES_DE_DISENOS = MENU_DEL_CODIGO.filter((s) => s !== 'disenos');

/** The order of the menu and where each screen is, for the screens of `lista`, in `orden` and `lugares` characters. */
const delMenu = (lista, { orden, lugares, menu }) => [
  { ancho: orden, menu, de: (a) => rangoDe(a.menu.orden.filter((s) => lista.includes(s)), lista), a: (n, c) => { c.ajustes.menu.orden = ordenDe(n, lista); }, tope: factorial(lista.length) },
  {
    ancho: lugares,
    menu,
    de: (a) => enBase3(lista.map((s) => LUGARES_EN_EL_MENU.indexOf(a.menu.lugares[s] ?? 'vista'))),
    a: (n, c) => {
      const donde = deBase3(n, lista.length);
      c.ajustes.menu.lugares = Object.fromEntries(lista.map((s, i) => [s, LUGARES_EN_EL_MENU[donde[i]]]));
    },
    tope: 3 ** lista.length,
  },
];

const BLOQUES = BLOQUES_DE_HOY.map((b) => b.clave);
const COLUMNA_DE_ENTRADA = Object.fromEntries(BLOQUES_DE_HOY.map((b) => [b.clave, b.columna]));
const CUENTAN = ['entregas', 'cuestionarios', 'classroom', 'propias'];
const AVISOS = GRUPOS_DE_AVISOS.map((g) => g.clave);
const NULO_SI = [null, true, false];
const COLORES = [{ clave: 'accion' }, { clave: 'resaltador' }, { clave: 'consultronColor' }, { clave: 'cabecera', desde: '4' }, { clave: 'bandeja', desde: '7' }, { clave: 'temaColor', desde: '9' }];

const eleccion = (clave, lista) => ({
  ancho: 1,
  de: (a) => Math.max(0, lista.indexOf(a[clave])),
  a: (n, c) => {
    c.ajustes[clave] = lista[n];
  },
  tope: lista.length,
});
const medida = (clave, { min, max }) => ({
  ancho: 3,
  de: (a) => a[clave] - min,
  a: (n, c) => {
    c.ajustes[clave] = n + min;
  },
  tope: max - min + 1,
});

// In this order, never another: a code made before still reads the same.
const CAMPOS = [
  ...['estilo', 'tema', 'contraste', 'letra', 'pdf'].map((c) => eleccion(c, OPCIONES[c])),
  eleccion('pdfClaro', PDF_CLAROS),
  { ancho: 1, de: (a) => Math.round((a.pdfBrillo - BRILLO_PDF.min) * 100), a: (n, c) => { c.ajustes.pdfBrillo = BRILLO_PDF.min + n / 100; }, tope: 21 },
  ...Object.keys(VISTAS).map((v) => ({ ancho: 1, de: (a) => Math.max(0, VISTAS[v].indexOf(a.vistas[v])), a: (n, c) => { c.ajustes.vistas[v] = VISTAS[v][n]; }, tope: VISTAS[v].length })),
  ...['lectura', 'facultad', 'atajos'].map((clave) => ({ ancho: 1, de: (a) => (a[clave] ? 1 : 0), a: (n, c) => { c.ajustes[clave] = n === 1; }, tope: 2 })),
  { ancho: 1, de: (a) => (a.bordes ? (a.bordesDelEstilo ? 2 : 1) : 0), a: (n, c) => { c.ajustes.bordes = n > 0; c.ajustes.bordesDelEstilo = n === 2; }, tope: 3 },
  { ancho: 1, de: (a) => NULO_SI.indexOf(a.vistos), a: (n, c) => { c.ajustes.vistos = NULO_SI[n]; }, tope: 3 },
  { ancho: 1, de: (a) => Math.max(0, VELOCIDADES.indexOf(a.velocidadVoz)), a: (n, c) => { c.ajustes.velocidadVoz = VELOCIDADES[n]; }, tope: VELOCIDADES.length },
  medida('anchoPanelPdf', PANEL_PDF),
  medida('anchoConsultron', PANEL_CONSULTRON),
  medida('altoConsultron', ALTO_CONSULTRON),
  medida('anchoRincon', RINCON_CONSULTRON),
  eleccion('tarjeta', ESTILOS_DE_TARJETA),
  ...Object.entries(APARIENCIA_CONSULTRON).map(([c, lista]) => eleccion(c, lista)),
  // The menu: how it looks, where it goes, its order and where each screen is.
  { ancho: 1, de: (a) => ESTILOS_DE_MENU.indexOf(a.menu.estilo), a: (n, c) => { c.ajustes.menu.estilo = ESTILOS_DE_MENU[n]; }, tope: ESTILOS_DE_MENU.length },
  { ancho: 1, de: (a) => POSICIONES_DEL_MENU.indexOf(a.menu.posicion), a: (n, c) => { c.ajustes.menu.posicion = POSICIONES_DEL_MENU[n]; }, tope: POSICIONES_DEL_MENU.length },
  ...delMenu(ANTES_DE_DISENOS, { orden: 8, lugares: 5, menu: 'antes' }),
  ...delMenu(MENU_DEL_CODIGO, { orden: 9, lugares: 6, menu: 'ahora' }),
  // Hoy, from mio: its blocks in order, the column of each, the hidden ones, what enters «Vencimientos» and how far it looks.
  {
    ancho: 5,
    de: (_, m) => {
      const o = ordenDeHoy(m);
      return rangoDe([...o.principal, ...o.costado], BLOQUES);
    },
    a: (n, c) => {
      c.hoy.orden = ordenDe(n, BLOQUES);
    },
    tope: factorial(BLOQUES.length),
  },
  { ancho: 2, de: (_, m) => bits(BLOQUES, (b) => columnaDe(m, b) !== COLUMNA_DE_ENTRADA[b]), a: (n, c) => { c.hoy.columnas = Object.fromEntries(deBits(BLOQUES, n).map((b) => [b, COLUMNA_DE_ENTRADA[b] === 'principal' ? 'costado' : 'principal'])); }, tope: 2 ** BLOQUES.length },
  { ancho: 2, de: (_, m) => bits(BLOQUES, (b) => m.hoy.ocultos.includes(b)), a: (n, c) => { c.hoy.ocultos = deBits(BLOQUES, n); }, tope: 2 ** BLOQUES.length },
  // As the student left it: 16 is «as it comes», which follows what's added later.
  { ancho: 1, de: (_, m) => (m.hoy.cuenta === null ? 16 : bits(CUENTAN, (t) => m.hoy.cuenta.includes(t))), a: (n, c) => { c.hoy.cuenta = n === 16 ? null : deBits(CUENTAN, n); }, tope: 17 },
  { ancho: 1, de: (_, m) => (m.hoy.dias === null ? 0 : DIAS_DE_HOY.indexOf(m.hoy.dias) + 1), a: (n, c) => { c.hoy.dias = n === 0 ? null : DIAS_DE_HOY[n - 1]; }, tope: DIAS_DE_HOY.length + 1 },
  { ancho: 2, de: (_, m) => bits(AVISOS, (g) => m.avisosOcultos.includes(g)), a: (n, c) => { c.avisosOcultos = deBits(AVISOS, n); }, tope: 2 ** AVISOS.length },
  { ...eleccion('contenido', CONTENIDOS), desde: '2' },
  { ancho: 1, de: (a) => ALINEACIONES_DEL_MENU.indexOf(a.menu.alineacion), a: (n, c) => { c.ajustes.menu.alineacion = ALINEACIONES_DEL_MENU[n]; }, tope: ALINEACIONES_DEL_MENU.length, desde: '3' },
  { ancho: 1, de: (a) => ANCHOS_DEL_MENU.indexOf(a.menu.ancho), a: (n, c) => { c.ajustes.menu.ancho = ANCHOS_DEL_MENU[n]; }, tope: ANCHOS_DEL_MENU.length, desde: '3' },
  { ancho: 1, de: (a) => (a.potente ? 1 : 0) + (a.fondoMueve ? 2 : 0) + CALIDADES_DEL_FONDO.indexOf(a.fondoCalidad) * 4, a: (n, c) => { c.ajustes.potente = (n & 1) > 0; c.ajustes.fondoMueve = (n & 2) > 0; c.ajustes.fondoCalidad = CALIDADES_DEL_FONDO[n >> 2]; }, tope: 16, desde: '5' },
  { ...eleccion('fondoFiltro', FILTROS_DEL_FONDO), desde: '6' },
  { ancho: 1, de: (a) => a.fondoIntensidad / INTENSIDAD_DEL_FILTRO.paso, a: (n, c) => { c.ajustes.fondoIntensidad = n * INTENSIDAD_DEL_FILTRO.paso; }, tope: INTENSIDAD_DEL_FILTRO.max / INTENSIDAD_DEL_FILTRO.paso + 1, desde: '6' },
  { ancho: 2, de: (a) => a.fondoTono / TONO_DEL_FILTRO.paso, a: (n, c) => { c.ajustes.fondoTono = n * TONO_DEL_FILTRO.paso; }, tope: TONO_DEL_FILTRO.max / TONO_DEL_FILTRO.paso + 1, desde: '6' },
  { ancho: 1, de: (a) => a.fondoDesenfoque / DESENFOQUE_DEL_FONDO.paso, a: (n, c) => { c.ajustes.fondoDesenfoque = n * DESENFOQUE_DEL_FONDO.paso; }, tope: DESENFOQUE_DEL_FONDO.max / DESENFOQUE_DEL_FONDO.paso + 1, desde: '6' },
  { ancho: 1, de: (a) => (a.fogonazo ? 0 : 1), a: (n, c) => { c.ajustes.fogonazo = n === 0; }, tope: 2, desde: '8' },
];

// Each place weighs differently (all odd), so one wrong character or most swaps change it.
const PESOS = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31];
const control = (texto) => ABC[[...texto].reduce((t, c, i) => t + ABC.indexOf(c) * PESOS[i % PESOS.length] + 3, 0) % 32];

/** The code of these settings and this `mio`, as it is shown: «CVG-» and groups of five. */
export function codigoDeEstilo(ajustes, mio) {
  const a = normalizar(ajustes);
  let texto = VERSION;
  for (const campo of CAMPOS) if (campo.menu !== 'antes') texto += aTexto(campo.de(a, mio), campo.ancho);
  for (const { clave: c } of COLORES) texto += a[c] ? a[c].slice(1) : SIN_COLOR;
  texto += control(texto);
  return `${PREFIJO}-${texto.toUpperCase().match(/.{1,5}/g).join('-')}`;
}

/** What a code says, or null when it isn't one: `ajustes`, a change for cambiarAjustes (color blindness and movement
 * stay as in `actuales`), and `hoy` and `avisosOcultos` for mio. Takes it as typed: with or without «CVG», dashes or
 * spaces, in any case. */
export function leerCodigoDeEstilo(escrito, actuales) {
  if (typeof escrito !== 'string' || escrito.length > MAX_ESCRITO) return null;
  let texto = escrito.toLowerCase().replace(/[\s-]/g, '');
  if (texto.startsWith(PREFIJO.toLowerCase())) texto = texto.slice(PREFIJO.length);
  texto = texto.replace(/o/g, '0').replace(/[il]/g, '1');
  if (![...texto].every((c) => ABC.includes(c)) || !VERSIONES.includes(texto[0])) return null;
  const version = texto[0];
  const cuerpo = texto.slice(0, -1);
  if (control(cuerpo) !== texto.at(-1)) return null;

  // A code of version 5 has the menu with Diseños, or without it if it was made before. Never both: the two differ
  // by 2 characters and the colors take 1 or 6 each, so only one ends where the code ends. From 6 on, always with it.
  const base = normalizar(actuales);
  const menus = version === '5' ? ['ahora', 'antes'] : version > '5' ? ['ahora'] : ['antes'];
  for (const menu of menus) {
    const cambio = leer(cuerpo, version, menu, base);
    if (cambio) return cambio;
  }
  return null;
}

function leer(cuerpo, version, menu, base) {
  const cambio = {
    ajustes: { vistas: { ...base.vistas }, menu: { ...base.menu } },
    hoy: {},
    avisosOcultos: [],
  };
  let i = 1;
  for (const campo of CAMPOS) {
    if (campo.desde > version || (campo.menu && campo.menu !== menu)) continue;
    const pedazo = cuerpo.slice(i, i + campo.ancho);
    i += campo.ancho;
    if (pedazo.length !== campo.ancho) return null;
    const n = aNumero(pedazo);
    if (n >= campo.tope) return null;
    campo.a(n, cambio);
  }
  for (const { clave: c, desde } of COLORES) {
    if (desde > version) {
      cambio.ajustes[c] = null;
      continue;
    }
    if (cuerpo[i] === SIN_COLOR) {
      cambio.ajustes[c] = null;
      i += 1;
    } else {
      const hex = cuerpo.slice(i, i + 6);
      if (!/^[0-9a-f]{6}$/.test(hex)) return null;
      cambio.ajustes[c] = `#${hex}`;
      i += 6;
    }
  }
  if (i !== cuerpo.length) return null;
  if (version < '8') cambio.ajustes.fogonazo = true;
  cambio.ajustes.pdfBrillo = Math.round(cambio.ajustes.pdfBrillo * 100) / 100;
  return cambio;
}
