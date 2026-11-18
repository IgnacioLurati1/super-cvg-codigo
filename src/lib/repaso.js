import { claveDeFecha, esClaveDeDia, fechaDeClave } from './datos';

// Repaso: cards the student writes (or saves from a practice question of Consultron), each with a front and a back,
// and a day when it comes back. Each answer moves that day: what was hard comes back soon, what was easy goes further.
// The cards are the student's own, like the code of the lab: they live in mio.js (`repaso`) and travel to their Drive
// with the rest. A course goes by its number, never its name.

export const MAX_TARJETAS = 1000;
export const MAX_FRENTE = 1000;
export const MAX_DORSO = 3000;
// New cards that enter a day's round at most: a hundred cards written in one night don't all come at once.
export const NUEVAS_POR_DIA = 20;
// Ease in hundredths: how much an interval grows after «Me acordé». It starts at 2.5 and stays between 1.3 and 3.
const FACILIDAD = { inicial: 250, minima: 130, maxima: 300 };
const MAX_PASO = 3650;

export const esIdDeTarjeta = (id) => typeof id === 'string' && /^r[0-9a-z]{6,24}$/.test(id);
// A campus course (its number) or one of the student's own (its id).
const esMateria = (m) => (typeof m === 'number' && Number.isSafeInteger(m) && m > 0 && m < 1e12) || (typeof m === 'string' && /^p[0-9a-z]{6,20}$/.test(m));
const esMomento = (n) => Number.isSafeInteger(n) && n > 0;
const entero = (n, min, max, si) => (Number.isSafeInteger(n) && n >= min && n <= max ? n : si);
// Lines kept, what doesn't print gone, and within its limit.
const textoDe = (t, max) => (typeof t === 'string' ? t.replace(/\r\n?/g, '\n').replace(/[\p{Cf}\u2028\u2029]|(?![\n\t])\p{Cc}/gu, '').trim().slice(0, max) : '');

export function sanearTarjeta(t) {
  if (!t || typeof t !== 'object' || !esIdDeTarjeta(t.id)) return null;
  const frente = textoDe(t.frente, MAX_FRENTE);
  if (!frente) return null;
  return {
    id: t.id,
    materia: esMateria(t.materia) ? t.materia : null,
    frente,
    dorso: textoDe(t.dorso, MAX_DORSO),
    creada: esMomento(t.creada) ? t.creada : 0,
    // Never answered: no day yet. It comes in the first round with room for new ones.
    vence: esClaveDeDia(t.vence) ? t.vence : null,
    paso: entero(t.paso, 0, MAX_PASO, 0),
    facilidad: entero(t.facilidad, FACILIDAD.minima, FACILIDAD.maxima, FACILIDAD.inicial),
    veces: entero(t.veces, 0, 100_000, 0),
    olvidos: entero(t.olvidos, 0, 100_000, 0),
    // The day it was answered for the first time: the new ones of a day have a limit.
    desde: esClaveDeDia(t.desde) ? t.desde : null,
  };
}

/** The list, oldest first, without repeats and within the limit. */
export function sanearRepaso(lista) {
  const limpias = (Array.isArray(lista) ? lista.slice(0, MAX_TARJETAS * 2) : []).map(sanearTarjeta).filter(Boolean);
  limpias.sort((a, b) => a.creada - b.creada || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const vistas = new Set();
  return limpias.filter((t) => !vistas.has(t.id) && vistas.add(t.id)).slice(0, MAX_TARJETAS);
}

const sumarDias = (dia, n) => {
  const f = fechaDeClave(dia);
  f.setDate(f.getDate() + n);
  return claveDeFecha(f);
};
export const hoy = (ahora = new Date()) => claveDeFecha(ahora);

/** The four answers, from worst to best: the student says how well the answer came back. */
export const RESPUESTAS = [
  { clave: 'otra', texto: 'No me acordé' },
  { clave: 'dificil', texto: 'Me costó' },
  { clave: 'bien', texto: 'Me acordé' },
  { clave: 'facil', texto: 'Me salió sola' },
];

/** In a practice round, which changes nothing: it comes back at the end, or it goes. */
export const RESPUESTAS_DE_PRACTICA = [
  { clave: 'otra', texto: 'No me acordé', cuando: 'Vuelve al final' },
  { clave: 'bien', texto: 'Me acordé', cuando: 'Sale de la ronda' },
];

/** The cards of a practice round, mixed: all of them, or those of one course. */
export function paraPracticar(tarjetas, materia, azar = Math.random) {
  const lista = (materia === undefined ? tarjetas : tarjetas.filter((t) => t.materia === materia)).map((t) => t.id);
  for (let i = lista.length - 1; i > 0; i -= 1) {
    const j = Math.floor(azar() * (i + 1));
    [lista[i], lista[j]] = [lista[j], lista[i]];
  }
  return lista;
}

/**
 * The card after an answer on day `dia`. «No me acordé» leaves it for today (it comes back at the end of the round)
 * and starts its count again; the rest move it some days ahead, more the easier it was and the better it went before.
 * Each answer sends it a different distance, also the first time.
 */
export function responder(tarjeta, respuesta, dia = hoy()) {
  let { paso, facilidad, veces, olvidos } = tarjeta;
  const desde = tarjeta.desde ?? dia;
  if (respuesta === 'otra') {
    return { ...tarjeta, desde, vence: dia, paso: 0, facilidad: Math.max(FACILIDAD.minima, facilidad - 20), veces: 0, olvidos: olvidos + (veces > 0 ? 1 : 0) };
  }
  if (veces === 0) {
    paso = respuesta === 'dificil' ? 1 : respuesta === 'bien' ? 2 : 4;
  } else if (veces === 1) {
    paso = respuesta === 'dificil' ? 3 : respuesta === 'bien' ? 5 : 8;
  } else {
    const base = Math.max(1, paso);
    paso = respuesta === 'dificil' ? Math.max(base + 1, Math.round(base * 1.2)) : Math.round((base * facilidad) / 100 * (respuesta === 'facil' ? 1.3 : 1));
  }
  if (respuesta === 'dificil') facilidad = Math.max(FACILIDAD.minima, facilidad - 15);
  if (respuesta === 'facil') facilidad = Math.min(FACILIDAD.maxima, facilidad + 15);
  paso = Math.min(MAX_PASO, Math.max(1, paso));
  return { ...tarjeta, desde, vence: sumarDias(dia, paso), paso, facilidad, veces: veces + 1, olvidos };
}

/** «hoy», «1 día», «3 días», «2 meses», «1 año»: how far an answer sends the card, for its button. */
export function cuantoFalta(tarjeta, respuesta, dia = hoy()) {
  const despues = responder(tarjeta, respuesta, dia);
  if (respuesta === 'otra') return 'hoy';
  const d = despues.paso;
  if (d < 30) return d === 1 ? '1 día' : `${d} días`;
  if (d < 365) {
    const m = Math.round(d / 30);
    return m === 1 ? '1 mes' : `${m} meses`;
  }
  const a = Math.round(d / 365);
  return a === 1 ? '1 año' : `${a} años`;
}

/** The cards of a day's round: the ones due by `dia`, oldest due first, and new ones up to what is left of today's room
 * (`nuevasHechas`: how many new ones were already answered today). `materia`: only that course; undefined, all. */
export function deHoy(tarjetas, { dia = hoy(), materia, nuevasHechas = 0 } = {}) {
  const de = materia === undefined ? tarjetas : tarjetas.filter((t) => t.materia === materia);
  const vencidas = de.filter((t) => t.vence !== null && t.vence <= dia).sort((a, b) => (a.vence < b.vence ? -1 : a.vence > b.vence ? 1 : a.creada - b.creada));
  const nuevas = de.filter((t) => t.vence === null).slice(0, Math.max(0, NUEVAS_POR_DIA - nuevasHechas));
  return [...vencidas, ...nuevas];
}

/** How many new cards were answered for the first time on `dia`. */
export const nuevasDelDia = (tarjetas, dia = hoy()) => tarjetas.filter((t) => t.desde === dia).length;

/** How many cards a course has, how many are due and how many are new, by course (null: without one). */
export function porMateria(tarjetas, dia = hoy()) {
  const salida = new Map();
  for (const t of tarjetas) {
    const c = salida.get(t.materia) ?? { total: 0, vencidas: 0, nuevas: 0 };
    c.total += 1;
    if (t.vence === null) c.nuevas += 1;
    else if (t.vence <= dia) c.vencidas += 1;
    salida.set(t.materia, c);
  }
  return salida;
}

/** The next `dias` days from `dia`: how many cards each one brings. Today, the round as it is (`hoyCuantas`); the
 * others, the cards due that day. */
export function semana(tarjetas, { dia = hoy(), hoyCuantas = 0, dias = 7 } = {}) {
  const inicio = fechaDeClave(dia);
  const salida = [];
  for (let i = 0; i < dias; i += 1) {
    const f = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + i);
    const clave = claveDeFecha(f);
    salida.push({ dia: clave, fecha: f, cuantas: i === 0 ? hoyCuantas : tarjetas.filter((t) => t.vence === clave).length });
  }
  return salida;
}

/** The next day with something due after `dia`, or null. */
export function proximoDia(tarjetas, dia = hoy()) {
  const dias = tarjetas.map((t) => t.vence).filter((v) => v !== null && v > dia).sort();
  return dias[0] ?? null;
}

let contador = 0;
/** A new id for a card. */
export const nuevoId = (ahora = Date.now()) => `r${ahora.toString(36).padStart(8, '0')}${(contador++ % 1296).toString(36).padStart(2, '0')}`;

/** A practice question of Consultron as a card: the question in front, the ideas of a good answer behind. */
export const tarjetaDePractica = ({ pregunta, ideas }) => ({
  frente: String(pregunta ?? '').trim(),
  dorso: (ideas ?? []).map((i) => `- ${i}`).join('\n'),
});

// What Consultron reads of Repaso (consultron/pantalla.js), in its words.
const MAX_LEIDAS = 40;
const recorte = (t, tope) => (t.length > tope ? `${t.slice(0, tope)}…` : t);
const enTarjetas = (n) => (n === 1 ? '1 tarjeta' : `${n} tarjetas`);

/**
 * The Repaso page as Consultron reads it: what is due today, the week, each course with its count and the cards with
 * their answers (the student wrote both and sees them in the list). `grupos`: [{ nombre, hoy, lista }];
 * `semanaDe`: what semana() gave; `proxima`: the next round in words, when nothing is due today.
 */
export function repasoParaConsultron({ grupos, paraHoy, semanaDe = [], proxima = '' }) {
  const total = grupos.reduce((n, g) => n + g.lista.length, 0);
  const datos = [];
  if (!total) {
    return { titulo: 'Repaso', datos, resultado: [], notas: 'El alumno todavía no escribió tarjetas. Se escriben abajo, con la pregunta de un lado y la respuesta del otro.' };
  }
  datos.push(['Para hoy', paraHoy ? enTarjetas(paraHoy) : `nada${proxima ? `, la próxima vuelta es ${proxima}` : ''}`]);
  const vienen = semanaDe.slice(1).filter((d) => d.cuantas);
  if (vienen.length) datos.push(['Los próximos días', vienen.map((d) => `${d.fecha.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric' })}: ${enTarjetas(d.cuantas)}`).join('; ')]);
  for (const g of grupos) datos.push([g.nombre, `${enTarjetas(g.lista.length)}${g.hoy ? `, ${g.hoy} para hoy` : ''}`]);
  const conPunto = (t) => (/[.?!:…]$/.test(t) ? t : `${t}.`);
  let cortadas = false;
  const corta = (t, tope) => {
    cortadas ||= t.length > tope;
    return recorte(t, tope);
  };
  const resultado = grupos
    .flatMap((g) => g.lista.map((t) => [`Tarjeta de ${g.nombre}`, `${conPunto(corta(t.frente, 200))} Respuesta: ${corta(t.dorso, 300) || 'sin escribir'}`]))
    .slice(0, MAX_LEIDAS);
  return {
    titulo: 'Repaso',
    datos,
    resultado,
    notas: `El alumno escribió ${enTarjetas(total)}. Cada una vuelve según si se acordó. Lo que le cuesta vuelve antes. Practicar no cambia cuándo le toca.${total > MAX_LEIDAS ? ` Acá van las primeras ${MAX_LEIDAS}.` : ''}${cortadas ? ' Las más largas van cortadas.' : ''}`,
  };
}

/**
 * A card of a round as Consultron reads it. The answer only once the student turned it: before that, a hint at most.
 */
export function rondaParaConsultron({ tarjeta, materia, vuelta, practica, quedan, total }) {
  const datos = [['Materia', materia], ['Pregunta', tarjeta.frente]];
  if (vuelta) datos.push(['Respuesta que escribió', tarjeta.dorso || 'sin escribir']);
  datos.push(['Quedan', `${quedan} de ${total}`]);
  return {
    titulo: practica ? 'Repaso, práctica' : 'Repaso, ronda de hoy',
    datos,
    resultado: [],
    notas: vuelta
      ? 'El alumno ya dio vuelta la tarjeta y vio su respuesta. Si te pregunta, ayudalo a entenderla.'
      : 'El alumno todavía no dio vuelta la tarjeta. No le digas la respuesta. Si te pide ayuda, dale una pista.',
  };
}
