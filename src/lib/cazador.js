// Finds dates in the text of a course's documents and turns them into suggestions. Pure: no network, no storage.
// It only ever suggests. The student confirms each one (PanelFechas).
import { claveDia, huella, normalizar } from './datos';

export const TOPE_ARCHIVOS = 10;
export const TOPE_BYTES = 15 * 1024 * 1024;

const MAX_CARACTERES = 2_000_000;
const MAX_LINEA = 2000;
const MAX_TITULO = 80;
const MAX_RESULTADOS = 100;
const CERCA = 60;
const LINEA_CORTA = 60;

// ---------- Which documents are worth reading ----------
const NOMBRE_CON_FECHAS = /\b(cronogramas?|fechas?|calendarios?|parcial(es)?|programas?|planificacion(es)?|cursad[oa]s?|entregas?|regularidad|examen(es)?|final(es)?|coloquios?)\b/;
const NOMBRE_SEGURO = /\b(cronogramas?|fechas?|calendarios?|planificacion(es)?)\b/;

const palabrasDe = (t) => normalizar(t).replace(/[^a-z]+/g, ' ');
export const esPdf = (item) => /\.pdf$/i.test(item?.archivo ?? '') || item?.mime === 'application/pdf';
export const esDocx = (item) => /\.docx$/i.test(item?.archivo ?? '') || /wordprocessingml\.document/.test(item?.mime ?? '');

/** Files whose name suggests dates, the likeliest first. `pesados` are too big to read. */
export function candidatos(items) {
  const elegidos = (items ?? []).filter((i) => i.tipo === 'archivo' && (esPdf(i) || esDocx(i)) && NOMBRE_CON_FECHAS.test(palabrasDe(`${i.nombre} ${i.archivo}`)));
  const puesto = (i) => (NOMBRE_SEGURO.test(palabrasDe(`${i.nombre} ${i.archivo}`)) ? 0 : 1);
  const ordenados = elegidos.map((i, n) => [i, n]).sort((a, b) => puesto(a[0]) - puesto(b[0]) || a[1] - b[1]).map(([i]) => i);
  return {
    leibles: ordenados.filter((i) => !(i.peso > TOPE_BYTES)),
    pesados: ordenados.filter((i) => i.peso > TOPE_BYTES),
  };
}

// ---------- Recognizing a date ----------
const MESES = {
  enero: 1, ene: 1, febrero: 2, feb: 2, marzo: 3, mar: 3, abril: 4, abr: 4, mayo: 5, may: 5, junio: 6, jun: 6,
  julio: 7, jul: 7, agosto: 8, ago: 8, septiembre: 9, setiembre: 9, sept: 9, sep: 9, set: 9, octubre: 10, oct: 10,
  noviembre: 11, nov: 11, diciembre: 12, dic: 12,
};
const NOMBRES_MES = Object.keys(MESES).sort((a, b) => b.length - a.length).join('|');
const ABREVIADO = /^(ene|feb|mar|abr|may|jun|jul|ago|sept?|set|oct|nov|dic)$/;
const SEMANA = String.raw`(?:(?<semana>lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|lun|mar|mi[eé]|jue|vie|s[aá]b|dom)\.?,?\s+)?`;

// Only the slash form can go without a year: «TP 1-2» is not a date.
const FORMAS = [
  {
    patron: new RegExp(String.raw`(?<![\p{L}\p{N}_/.#])${SEMANA}(?<d>\d{1,2})/(?<m>\d{1,2})(?:/(?<a>\d{4}|\d{2}))?(?![\p{L}\p{N}/]|[.,]\d)`, 'giu'),
    numerica: true,
  },
  {
    patron: new RegExp(String.raw`(?<![\p{L}\p{N}_/.#-])${SEMANA}(?<d>\d{1,2})-(?<m>\d{1,2})-(?<a>\d{4}|\d{2})(?![\p{L}\p{N}/-])`, 'giu'),
    numerica: true,
  },
  {
    patron: new RegExp(String.raw`(?<![\p{L}\p{N}_/.#-])${SEMANA}(?<d>\d{1,2})\.(?<m>\d{1,2})\.(?<a>\d{4})(?![\p{L}\p{N}/]|\.\d)`, 'giu'),
    numerica: true,
  },
  {
    patron: new RegExp(String.raw`(?<![\p{L}\p{N}_/.#-])${SEMANA}(?<d>\d{1,2})(?:\s*(?:°|º|ro|er))?(?<union>\s+de\s+|\s+|[-/])(?<mes>${NOMBRES_MES})(?!\p{L})\.?(?:\s*(?:,|del?)?\s*(?<a>\d{4})(?!\p{N})|[-/](?<a2>\d{2})(?!\p{N}))?`, 'giu'),
    numerica: false,
  },
];

// A number right after one of these words is not a date: «Ley 26/04», «Página 3/12», «Tel 15-11-26», «Nota 8/10».
const NUMERO_DE_OTRA_COSA = /(?:^|[^a-z])(ley(es)?|decreto|dec|res|resolucion|disp|disposicion|art|articulo|ord|ordenanza|exp(te)?|expediente|n[°º.]|nro|num|numero|pag|pagina|hoja|folio|pp?|tomo|inciso|ref|tel|telefono|cel|celular|whatsapp|wsp|fax|int|interno|cuit|dni|legajo|isbn|unidad(es)?|temas?|capitulo|cap|modulo|version|ver\.|v|comision|com|aula|ano|nivel|curso|cuatrimestre|semestre|nota|puntaje|puntos|calificacion|ej|ejercicios?)[\s.:#°º-]*$/;
// «TP 1/2» or «Parcial 2/3» count things. «TP 11/12» is the 11th of December.
const CONTEO = /(?:^|[^a-z])(tps?|trabajos?|practicos?|parcial(es)?|guias?|clases?|semanas?)[\s.:#°º-]*$/;
const FRACCION_DESPUES = /^\s*(%|[=+*×÷]|x\s|(tazas?|cucharad\w*|kg|kilos?|gr?|mg|ml|l|lts?|litros?|cm|mm|km|m|metros?|pulgadas?|partes?|porcion(es)?|horas?|hs?)(?![\p{L}\p{N}])|del?\s+(?!\d))/iu;
const FRACCION_ANTES = /[=+*×÷≈]\s*$|\sx\s*$/i;
const NUMERO_ANTES = /\d\s+$/;

const PALABRA_FUERTE = /(?<![a-z])(parcial(es)?|final(es)?|entregas?|entregar|recuperatorios?|recup|trabajos? practicos?|tps?|t\.p\.|coloquios?|examen(es)?|evaluacion(es)?|vence[n]?|vencimiento|cierre|cierra)(?![a-z])/;

const tienePalabra = (t) => PALABRA_FUERTE.test(normalizar(t));

function fechaReal(anio, mes, dia) {
  const d = new Date(anio, mes - 1, dia, 12);
  return d.getFullYear() === anio && d.getMonth() === mes - 1 && d.getDate() === dia ? d : null;
}

function fechasDeLinea(linea, anioActual) {
  const halladas = [];
  for (const { patron, numerica } of FORMAS) {
    for (const m of linea.matchAll(patron)) {
      const { d, m: mesNumero, a, a2, mes, union, semana } = m.groups;
      const textoAnio = a ?? a2;
      const anio = textoAnio ? Number(textoAnio.length === 2 ? `20${textoAnio}` : textoAnio) : anioActual;
      const nombreMes = mes ? normalizar(mes) : null;
      const numeroMes = numerica ? Number(mesNumero) : MESES[nombreMes];
      const dia = Number(d);
      if (!fechaReal(anio, numeroMes, dia)) continue;
      halladas.push({
        inicio: m.index,
        fin: m.index + m[0].length,
        anio,
        mes: numeroMes,
        dia,
        conAnio: Boolean(textoAnio),
        anioCompleto: textoAnio?.length === 4,
        semana: Boolean(semana),
        numerica,
        barraSinAnio: numerica && !textoAnio,
        soloAbreviada: !numerica && !textoAnio && !semana && /^\s+$/.test(union) && ABREVIADO.test(nombreMes),
      });
    }
  }
  halladas.sort((x, y) => x.inicio - y.inicio);
  return halladas.filter((f, i) => i === 0 || f.inicio >= halladas[i - 1].fin);
}

/** What looks like a date but is a law, a page, a phone, a fraction or a grade. */
function noEsFecha(linea, f) {
  const antes = linea.slice(0, f.inicio);
  const despues = linea.slice(f.fin);
  const antesNormal = normalizar(antes.slice(-24));
  if (f.numerica && NUMERO_DE_OTRA_COSA.test(antesNormal)) return true;
  if (f.soloAbreviada && !tienePalabra(`${antes.slice(-CERCA)} ${despues.slice(0, CERCA)}`)) return true;
  if (!f.barraSinAnio) return false;
  if (f.dia === 24 && f.mes === 7) return true;
  if (f.mes === f.dia + 1 && f.dia <= 4 && CONTEO.test(antesNormal)) return true;
  if (FRACCION_DESPUES.test(despues) || FRACCION_ANTES.test(antes)) return true;
  return NUMERO_ANTES.test(antes) && !tienePalabra(linea);
}

// ---------- The time next to a date ----------
const UNIDAD = String.raw`(?:hs|h|horas?)\.?(?!\p{L})`;
const FORMAS_HORA = [
  // «de 18 a 20 hs» starts at 18.
  new RegExp(String.raw`(?<![\p{L}\p{N}:./-])(?:de\s+)?(\d{1,2})(?:[:.](\d{2}))?\s*(?:a|-|–|al)\s*\d{1,2}(?:[:.]\d{2})?\s*${UNIDAD}`, 'giu'),
  new RegExp(String.raw`(?<![\p{L}\p{N}])(?:a\s+las?|desde\s+las?|de\s+las?|las)\s+(\d{1,2})(?:[:.h](\d{2}))?(?:\s*${UNIDAD})?(?!\p{N})`, 'giu'),
  new RegExp(String.raw`(?<![\p{L}\p{N}:./-])(\d{1,2})[:.](\d{2})\s*${UNIDAD}`, 'giu'),
  new RegExp(String.raw`(?<![\p{L}\p{N}:./-])(\d{1,2}):(\d{2})(?!\p{N})(?:\s*${UNIDAD})?`, 'giu'),
  new RegExp(String.raw`(?<![\p{L}\p{N}:./-])(\d{1,2})h(\d{2})(?!\p{N})`, 'giu'),
  new RegExp(String.raw`(?<![\p{L}\p{N}:./-])(\d{1,2})()\s*${UNIDAD}`, 'giu'),
];
const DURACION_ANTES = /(duracion|durante|dura|carga|total|de|unas?|cada)\s*$/;
const DURACION_DESPUES = /^\s*(catedra|reloj|semanales?|por|de\s+(clase|cursado|duracion)|totales)/;

function horasDe(texto) {
  const halladas = [];
  FORMAS_HORA.forEach((patron, forma) => {
    for (const m of texto.matchAll(patron)) {
      const hora = Number(m[1]);
      const minutos = Number(m[2] || 0);
      if (hora > 23 || minutos > 59) continue;
      // A bare «2 hs» is how long something lasts, not when it starts.
      if (forma === FORMAS_HORA.length - 1) {
        const antes = normalizar(texto.slice(0, m.index));
        const despues = normalizar(texto.slice(m.index + m[0].length));
        if (hora < 7 || DURACION_ANTES.test(antes) || DURACION_DESPUES.test(despues)) continue;
      }
      halladas.push({ hora, minutos, inicio: m.index, fin: m.index + m[0].length, forma });
    }
  });
  return halladas.sort((a, b) => a.inicio - b.inicio || a.forma - b.forma);
}

const CERCA_HORA = 40;

function horaCercana(antes, despues) {
  const [delante] = horasDe(despues.slice(0, CERCA_HORA));
  if (delante) return delante;
  return horasDe(antes.slice(-CERCA_HORA)).at(-1) ?? null;
}

function sinHoras(texto) {
  const partes = horasDe(texto);
  let salida = '';
  let desde = 0;
  for (const h of partes) {
    if (h.inicio < desde) continue;
    salida += `${texto.slice(desde, h.inicio)} `;
    desde = h.fin;
  }
  return salida + texto.slice(desde);
}

// ---------- The title ----------
const BORDE = /^(?:[\s\-–—:;,.|·•*/\\[\]_=>]+|(?:el|la|los|las|del|de|al|a|y|e|o|para|hasta|desde|en|fechas?|dia|hora|horas|hs|h)(?![\p{L}\p{N}]))+/iu;
const BORDE_FINAL = /(?:[\s\-–—:;,.|·•*/\\[\]_=<]+|(?<![\p{L}\p{N}])(?:el|la|los|las|del|de|al|a|y|e|o|para|hasta|desde|en|fechas?|dia|hora|horas|hs|h))+$/iu;

function limpiarTitulo(crudo) {
  let t = sinHoras(crudo).replace(/\(\s*\)/g, ' ').replace(/\s+/g, ' ').replace(/(?:\s*[-–—:]\s*){2,}/g, ': ').trim();
  for (let previo = null; previo !== t;) {
    previo = t;
    t = t.replace(BORDE, '').replace(BORDE_FINAL, '').trim();
  }
  const abre = (t.match(/\(/g) ?? []).length;
  const cierra = (t.match(/\)/g) ?? []).length;
  if (abre !== cierra) t = t.replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();
  if ((t.match(/\p{L}/gu) ?? []).length < 2) return '';
  return t.charAt(0).toLocaleUpperCase('es') + t.slice(1);
}

function acortar(texto) {
  const letras = Array.from(texto);
  if (letras.length <= MAX_TITULO) return texto;
  const corte = letras.slice(0, MAX_TITULO - 1).join('');
  const espacio = corte.lastIndexOf(' ');
  return `${(espacio > 40 ? corte.slice(0, espacio) : corte).trimEnd()}…`;
}

function tituloDe(antes, despues) {
  // Before the date with no letters, it's a table's row number.
  let junto = `${/\p{L}/u.test(antes) ? antes : ''} ${despues}`;
  if (junto.length > MAX_TITULO) {
    // A long paragraph: only the sentence that holds the date.
    junto = `${antes.split(/[.;:!?]\s+/).at(-1)} ${despues.split(/[.;!?]\s+/)[0]}`;
  }
  return acortar(limpiarTitulo(junto));
}

const normalTitulo = (t) => normalizar(t).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const huellaDe = (cuando, titulo) => huella(`${claveDia(cuando)}|${normalTitulo(titulo)}`);

// ---------- Reading a document ----------
function limpiarLinea(linea) {
  return linea
    .replace(/\s+/g, ' ')
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .replace(/(?<=\d)[‐‑–](?=\d)/g, '-')
    .replace(/(?<!\d)(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})(?!\d)/g, '$1/$2/$3')
    .trim()
    .slice(0, MAX_LINEA);
}

// A date alone on its line takes its title from the line around it. A page number alone does too, so
// without a year or a weekday it needs one of the words: «3/12» at the foot of a page is not a date.
function tituloVecino(lineas, i, tieneFuerza) {
  const vecinos = [lineas[i - 1], lineas[i + 1]]
    .filter((l) => l && l.length <= MAX_TITULO && !fechasDeLinea(l, 2000).length)
    .map((l) => ({ titulo: limpiarTitulo(l), fuerte: tienePalabra(l) }))
    .filter((v) => v.titulo);
  const conPalabra = vecinos.find((v) => v.fuerte);
  if (conPalabra) return conPalabra;
  return tieneFuerza ? (vecinos[0] ?? null) : null;
}

function buscarEnLinea(lineas, i, limites) {
  const linea = lineas[i];
  const fechas = fechasDeLinea(linea, limites.anio).filter((f) => !noEsFecha(linea, f));
  if (!fechas.length) return [];

  // The label goes after the dates if the line starts with one, and before them if not.
  const etiquetaDespues = !/\p{L}/u.test(linea.slice(0, fechas[0].inicio));
  const partes = fechas.map((f, n) => {
    const previa = fechas[n - 1];
    const siguiente = fechas[n + 1];
    const antes = linea.slice(previa?.fin ?? 0, f.inicio);
    const despues = linea.slice(f.fin, siguiente?.inicio ?? linea.length);
    const soloUna = fechas.length === 1;
    return {
      f,
      hora: horaCercana(antes, despues),
      titulo: tituloDe(soloUna || !etiquetaDespues ? antes : '', soloUna || etiquetaDespues ? despues : ''),
      fuerte: tienePalabra(`${soloUna || !etiquetaDespues ? antes.slice(-CERCA) : ''} ${soloUna || etiquetaDespues ? despues.slice(0, CERCA) : ''}`),
    };
  });

  // «Entrega del 15/11 al 20/11»: the date with no words of its own takes those of its neighbor.
  for (let n = 1; n < partes.length; n++) {
    if (!partes[n].titulo) Object.assign(partes[n], { titulo: partes[n - 1].titulo, fuerte: partes[n].fuerte || partes[n - 1].fuerte });
  }
  for (let n = partes.length - 2; n >= 0; n--) {
    if (!partes[n].titulo) Object.assign(partes[n], { titulo: partes[n + 1].titulo, fuerte: partes[n].fuerte || partes[n + 1].fuerte });
  }

  const salida = [];
  for (const p of partes) {
    const { f } = p;
    let { titulo, fuerte } = p;
    if (!titulo) {
      const vecino = tituloVecino(lineas, i, f.conAnio || f.semana);
      if (!vecino && !f.conAnio && !f.semana) continue;
      titulo = vecino?.titulo ?? 'Fecha del documento';
      fuerte = fuerte || Boolean(vecino?.fuerte);
    }
    if (!fuerte && f.anioCompleto && linea.length <= LINEA_CORTA) fuerte = true;

    const cuando = cuandoDe(f, p.hora);
    if (!enElPlazo(cuando, !p.hora, limites)) continue;
    salida.push({ titulo, cuando, sinHora: !p.hora, fuerte, huella: huellaDe(cuando, titulo) });
  }
  return salida;
}

function cuandoDe(f, hora) {
  const d = new Date(f.anio, f.mes - 1, f.dia, hora ? hora.hora : 12, hora ? hora.minutos : 0);
  return Math.floor(d.getTime() / 1000);
}

function enElPlazo(cuando, sinHora, { ahora, hasta }) {
  if (cuando > hasta) return false;
  if (!sinHora) return cuando >= ahora;
  const fin = new Date(cuando * 1000);
  fin.setHours(23, 59, 59, 999);
  return fin.getTime() / 1000 >= ahora;
}

/** The same event seen twice keeps its time if either of them had one, and stays strong if either was. */
function juntar(a, b) {
  const base = a.sinHora && !b.sinHora ? b : a;
  return { ...base, fuerte: a.fuerte || b.fuerte };
}

/**
 * Dates in a document's text, from now up to 18 months ahead: [{ titulo, cuando, sinHora, fuerte, huella }].
 * `cuando` is in seconds; with no time it is noon of that day, like the rest of the student's dates.
 */
export function buscarFechas(texto, ahoraSegundos) {
  const lineas = String(texto ?? '').slice(0, MAX_CARACTERES).split(/\r\n|\r|\n|\f/).map(limpiarLinea).filter(Boolean);
  const ahora = new Date(ahoraSegundos * 1000);
  const tope = new Date(ahora);
  tope.setMonth(tope.getMonth() + 18);
  const limites = { ahora: ahoraSegundos, hasta: tope.getTime() / 1000, anio: ahora.getFullYear() };

  const unicas = new Map();
  for (let i = 0; i < lineas.length; i++) {
    for (const s of buscarEnLinea(lineas, i, limites)) {
      const previa = unicas.get(s.huella);
      unicas.set(s.huella, previa ? juntar(previa, s) : s);
    }
  }
  return [...unicas.values()].sort((a, b) => a.cuando - b.cuando).slice(0, MAX_RESULTADOS);
}

// ---------- What the screen needs ----------
/** Adds what one file gave to what's already found. The same suggestion from two files keeps both names. */
export function unirHallazgos(lista, nuevos, archivo) {
  const salida = new Map(lista.map((h) => [h.huella, h]));
  for (const n of nuevos) {
    const previa = salida.get(n.huella);
    if (!previa) {
      salida.set(n.huella, { ...n, archivos: [archivo] });
      continue;
    }
    const archivos = previa.archivos.includes(archivo) ? previa.archivos : [...previa.archivos, archivo];
    salida.set(n.huella, { ...juntar(previa, n), archivos });
  }
  return [...salida.values()].sort((a, b) => a.cuando - b.cuando);
}

/** Already in the student's dates: same moment and same title. */
export const yaSumada = (sugerencia, fechas) =>
  fechas.some((f) => f.cuando === sugerencia.cuando && normalTitulo(f.titulo) === normalTitulo(sugerencia.titulo));
