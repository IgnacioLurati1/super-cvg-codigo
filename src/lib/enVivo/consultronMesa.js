import { documentoDeTexto, piezasPropias } from '../consultron/adjuntar';
import { SISTEMA, SISTEMA_GENERAL, armarPedido, esPuntual, leerRespuesta, noEsta, sinLatex, sinPensar } from '../consultron/pedido';
import { pestanas } from './mesa';

// The Consultron of a live session: one thread for the whole table. Anyone asks; the browser of whoever asked answers
// (Gemini, if that student turned it on for the table, or the model of their computer) and writes the answer in the
// thread. It reads only the text of the table's tabs (`paraConsultron` of each tool): never anyone's campus, their
// Classroom, their dates nor their own talks with Consultron.
//
// In the tab's map, each question is its own key (`q:<id>`): only whoever asked writes it, so two at once never step on
// each other. Everything read back from there is checked and cut, and shown as text.

export const MAX_PREGUNTA = 600;
export const MAX_RESPUESTA = 6000;
export const MAX_HILO = 40;
// What each tab gives, at most, and how many pieces of all of it go with a question.
export const TOPE_PESTANA = 20_000;
const PIEZAS = 6;
// The answers before it that go with a question («¿y eso?»).
const MEMORIA = 2;
const ESTADOS = new Set(['pensando', 'listo', 'falla']);
const QUIEN = new Set(['gemini', 'compu']);
const CLAVE = /^q:[0-9a-f]{12}$/;
const ID_PAR = /^[\w-]{1,64}$/;

// eslint-disable-next-line no-control-regex
const texto = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ').slice(0, max) : '');
const nuevoId = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, '0')).join('');

/** The thread, oldest first: [{ id, pregunta, de, nombre, color, cuando, estado, respuesta, quien, fuentes, general }]. */
export function hilo(datos) {
  const lista = [];
  datos.forEach((v, clave) => {
    if (!CLAVE.test(clave) || !v || typeof v !== 'object') return;
    const pregunta = texto(v.pregunta, MAX_PREGUNTA).trim();
    if (!pregunta || typeof v.de !== 'string' || !ID_PAR.test(v.de)) return;
    const estado = ESTADOS.has(v.estado) ? v.estado : 'falla';
    lista.push({
      id: clave.slice(2),
      pregunta,
      de: v.de,
      nombre: texto(v.nombre, 60).trim() || 'Alguien',
      color: texto(v.color, 40),
      cuando: Number.isFinite(v.cuando) ? v.cuando : 0,
      estado,
      respuesta: estado === 'pensando' ? '' : texto(v.respuesta, MAX_RESPUESTA),
      quien: QUIEN.has(v.quien) ? v.quien : '',
      fuentes: Array.isArray(v.fuentes) ? v.fuentes.slice(0, PIEZAS).map((f) => texto(f, 80).trim() || 'Pestaña') : [],
      general: v.general === true,
    });
  });
  return lista.sort((a, b) => a.cuando - b.cuando || a.id.localeCompare(b.id));
}

/** A question in the thread, «pensando» for everyone. Returns its id, or null if it's empty. */
export { hiloDeLaMesa } from './avisos';

export function preguntarEnMesa(doc, datos, yo, pregunta) {
  const limpia = texto(pregunta, MAX_PREGUNTA).trim();
  if (!limpia) return null;
  const id = nuevoId();
  doc.transact(() => {
    datos.set(`q:${id}`, { pregunta: limpia, de: yo.id, nombre: yo.nombre, color: yo.color, cuando: Date.now(), estado: 'pensando' });
    // The oldest go: a long session doesn't grow without end.
    const viejas = hilo(datos);
    viejas.slice(0, Math.max(0, viejas.length - MAX_HILO)).forEach((e) => datos.delete(`q:${e.id}`));
  });
  return id;
}

/** The answer of one's own question: { estado, respuesta, quien, fuentes, general }. */
export function contestar(datos, id, respuesta) {
  const actual = datos.get(`q:${id}`);
  if (!actual) return;
  datos.set(`q:${id}`, {
    ...actual,
    estado: respuesta.estado,
    respuesta: texto(respuesta.respuesta, MAX_RESPUESTA),
    quien: respuesta.quien ?? '',
    fuentes: (respuesta.fuentes ?? []).slice(0, PIEZAS),
    general: Boolean(respuesta.general),
  });
}

/** The tabs' text as documents to search, each with its tab's name. `textos`: [{ id, texto }] (sesion.textos()); the
 * tab of the Consultron itself is left out. */
export function contextoDeLaMesa(doc, textos, propia = null) {
  const titulos = new Map(pestanas(doc).map((p) => [p.id, p.titulo]));
  return textos.flatMap(({ id, texto: t }) => {
    const cuerpo = String(t ?? '').slice(0, TOPE_PESTANA).trim();
    if (id === propia || !cuerpo || !titulos.has(id)) return [];
    return [documentoDeTexto(`mesa:${id}`, { tipo: 'mesa', nombre: titulos.get(id) }, cuerpo)];
  });
}

/** The thread before a question, as turns of the talk. */
function charlaAntes(entradas, id) {
  const hasta = entradas.findIndex((e) => e.id === id);
  return entradas
    .slice(0, hasta < 0 ? entradas.length : hasta)
    .filter((e) => e.estado === 'listo' && e.respuesta)
    .slice(-MEMORIA)
    .flatMap((e) => [
      { role: 'user', content: e.pregunta.slice(0, 400) },
      { role: 'assistant', content: e.respuesta.replace(/\s*\[\d+\]/g, '').slice(0, 700) },
    ]);
}

const EN_GRUPO = 'Ahora estudian en grupo, en una sesión en vivo: los fragmentos son lo que tienen en la mesa compartida.';

/** What goes to the model: { mensajes, elegidos, general, corto }. Without anything on the table that matches, it
 * answers with what it knows, and the thread says so. */
export function armarMensajes(pregunta, docs, entradas = [], id = null) {
  const elegidos = docs.length ? piezasPropias(docs, pregunta, PIEZAS) : [];
  const corto = elegidos.length > 0 && esPuntual(pregunta);
  const antes = charlaAntes(entradas, id);
  if (!elegidos.length) {
    return { elegidos, general: true, corto: false, mensajes: [{ role: 'system', content: SISTEMA_GENERAL }, ...antes, { role: 'user', content: pregunta }] };
  }
  return {
    elegidos,
    general: false,
    corto,
    mensajes: [{ role: 'system', content: `${SISTEMA} ${EN_GRUPO}` }, ...antes, { role: 'user', content: armarPedido(pregunta, elegidos, { puntual: corto }) }],
  };
}

/**
 * Answers a question of the thread on this browser: Gemini if `conGemini` and it answers, else the model of this
 * computer. `nube(mensajes)` and `compu(mensajes, { corto })` resolve with the text or null (nube.js and motor.js,
 * passed in so tests don't touch either). If the table doesn't have it, it answers again with what it knows, and says
 * so. Resolves with what `contestar` writes.
 */
export async function responderEnMesa({ pregunta, docs, entradas = [], id = null, conGemini = false, nube, compu }) {
  const preguntar = async (mensajes, corto) => {
    const deGemini = conGemini ? await nube(mensajes) : null;
    if (deGemini) return { texto: sinPensar(deGemini).trim(), quien: 'gemini' };
    const deCompu = await compu(mensajes, { corto });
    return deCompu ? { texto: sinPensar(deCompu).trim(), quien: 'compu' } : null;
  };
  let armado = armarMensajes(pregunta, docs, entradas, id);
  let r = await preguntar(armado.mensajes, armado.corto);
  if (r && !armado.general && noEsta(r.texto)) {
    armado = armarMensajes(pregunta, [], entradas, id);
    r = (await preguntar(armado.mensajes, false)) ?? r;
  }
  if (!r?.texto) return { estado: 'falla', respuesta: '', quien: '', fuentes: [], general: false };
  return { estado: 'listo', respuesta: r.texto, quien: r.quien, fuentes: armado.elegidos.map((e) => e.trozo.fuente?.nombre ?? 'Pestaña'), general: armado.general };
}

// What «Guardar en lo mío» keeps of the thread, at most: what a text of one's own course takes.
const TOPE_GUARDADO = 20_000;
const SALTO = '\n';

/** The thread as text with the site's little formatting (formato.js): each question as a title with who asked it, and
 * its answer in paragraphs and lists. Only what was answered. */
export function hiloEnTexto(entradas) {
  const linea = (partes) => partes.map((p) => {
    if (p.cita) return '';
    if (p.formula !== undefined) return sinLatex(`$${p.formula}$`);
    if (p.fuerte) return `**${p.texto}**`;
    return p.texto ?? '';
  }).join('').replace(/ +([.,;:])/g, '$1').trim();
  const partes = [];
  for (const e of entradas) {
    if (e.estado !== 'listo') continue;
    const cuerpo = leerRespuesta(e.respuesta, e.fuentes.length).map((b) => {
      if (b.tipo === 'codigo') return b.texto;
      if (b.tipo === 'lista') return b.items.map((it, i) => (b.numerada ? `${b.inicio + i}. ${linea(it)}` : `- ${linea(it)}`)).join(SALTO);
      return linea(b.partes);
    }).filter(Boolean);
    const pie = e.fuentes.length ? `*Sale de ${e.fuentes.map((f) => `«${f}»`).join(', ')}.*` : '';
    partes.push([`# ${e.pregunta.replace(/\s+/g, ' ')}`, `*Preguntó ${e.nombre}.*`, ...cuerpo, pie].filter(Boolean).join(SALTO));
  }
  return partes.join(SALTO + SALTO).slice(0, TOPE_GUARDADO);
}
