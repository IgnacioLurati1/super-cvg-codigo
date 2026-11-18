// Practice with the notes: Consultron takes a real piece of the student's notes (a page of a PDF, a summary of El Santo
// Resumen), asks the model for a short open question that the piece answers and for the ideas a good answer names, and
// then checks each of those ideas against what the student wrote. Never a grade: what was there, what was missing and
// the page it comes from. Both go to the model as a form (`extraer`, like calculos.js), and what comes back is checked
// here: an idea that isn't in the piece goes, a question that names «el fragmento» is fixed. If the model fails to
// check an answer, the words in common decide. It only practices with the notes: nothing of the campus's quizzes.
import { palabras, plegar, trozar } from './fragmentos';

/** The kinds of piece worth a question: the notes, never the guide of the site nor what was attached. */
const DE_APUNTES = new Set(['pdf', 'resumen', 'oficial']);
/** A piece shorter than this doesn't give for a question. */
const MINIMO = 220;

// «Tomame preguntas de Redes», «practiquemos subredes», «haceme un parcial de Física», «evaluame sobre normalización».
const VERBO = /^(?:che\s+)?(?:(?:me\s+)?(?:podes|podrias|queres|quiero|vamos\s+a)\s+)?(tomame|tomeme|tomarme|tomar|haceme|hacerme|hacer|armame|armarme|armar|dame|darme|dar|pasame|pasarme|pasar|preguntame|preguntarme|evaluame|evaluarme|examiname|examinarme|testeame|practiquemos|practicar|practico|repasemos)\b/;
const QUE = /^(?:una|unas|un|unos|algunas|algunos|un par de|\d+|otra|otras|mas)?\s*(?:preguntas?|ejercicios? de parcial|parcial(?:es)?|examen(?:es)?|final(?:es)?|quiz|test|cuestionario)\b/;
const NEXO = /^(?:con|de|del|sobre|en|para|acerca de)\b\s*(?:(?:mis|tus|los) apuntes\b\s*(?:de\b)?|la\b|el\b|los\b|las\b|lo de\b)?\s*/;

// What is left of a message once its asking words go: the same words, without its punctuation nor «por favor».
const partes = (texto) => String(texto ?? '').replace(/[¿?¡!.,;:]+/g, ' ').replace(/\b(?:por favor|porfa|plis)\b/gi, ' ').split(/\s+/).filter(Boolean);

/** Whether a message asks to practice: { tema } with the rest of what it says, as the student wrote it (may be empty),
 * or null. */
export function pidePractica(texto) {
  const originales = partes(texto);
  let t = plegar(originales.join(' '));
  const verbo = VERBO.exec(t);
  if (!verbo) return null;
  t = t.slice(verbo[0].length).trim();
  const que = QUE.exec(t);
  const practica = /^(practiquemos|practicar|practico|repasemos)$/.test(verbo[1]);
  // «Dame la fórmula de Little» or «explicame…» isn't practice: those verbs need «preguntas» or «parcial» after them.
  if (!que && !(practica || /^(preguntame|preguntarme|evaluame|evaluarme|examiname|examinarme|testeame)/.test(verbo[1]))) return null;
  if (que) t = t.slice(que[0].length).trim();
  t = t.replace(/^(?:me|un poco|un rato)\b\s*/, '').replace(NEXO, '').trim();
  // The theme in the student's words: the last ones, as many as are left.
  const cuantas = t ? t.split(' ').length : 0;
  return { tema: cuantas ? originales.slice(-cuantas).join(' ').slice(0, 120) : '' };
}

/** The course a theme names, among the student's ({ id, nombre }): the one with most of its words, and the theme
 * without them. «Redes» is «Redes de Información»; «subredes» isn't. */
export function materiaDelTema(tema, materias) {
  const ps = palabras(tema);
  if (!ps.length) return { materia: null, tema: '' };
  let mejor = null;
  let usadas = [];
  for (const m of materias ?? []) {
    const suyas = new Set(palabras(m.nombre));
    const comunes = ps.filter((p) => suyas.has(p));
    if (comunes.length > usadas.length) {
      mejor = m;
      usadas = comunes;
    }
  }
  if (!mejor) return { materia: null, tema };
  const resto = String(tema).split(/\s+/).filter((w) => !palabras(w).some((p) => usadas.includes(p)) && !/^(de|del|la|el|y|e)$/i.test(w));
  return { materia: mejor, tema: palabras(resto.join(' ')).length ? resto.join(' ') : '' };
}

const clave = (t) => `${t.doc}#${t.pagina}#${t.texto.slice(0, 40)}`;

/** The piece to ask about. With a theme, one of the best for it (`elegidos` of buscarPiezas); without one, any piece of
 * the documents (`docs`: [{ doc, fuente, paginas }]). Never one in `usados`. A long one if there is; a slide of a few
 * words, only if that's all. `azar`: 0 to 1. */
export function elegirTrozo({ elegidos = [], docs = [], usados = new Set(), azar = Math.random }) {
  const nuevo = (t) => t && DE_APUNTES.has(t.fuente?.tipo) && palabras(t.texto).length >= 4 && !usados.has(clave(t));
  const candidatos = elegidos.length ? elegidos.map((e) => e.trozo).filter(nuevo) : docs.flatMap((d) => trozar(d.doc, d.paginas).map((t) => ({ ...t, fuente: d.fuente }))).filter(nuevo);
  const largos = candidatos.filter((t) => t.texto.length >= MINIMO);
  // With a theme, among the three best for it.
  const entre = (largos.length ? largos : candidatos).slice(0, elegidos.length ? 3 : undefined);
  return entre.length ? entre[Math.floor(azar() * entre.length) % entre.length] : null;
}

export const claveDeTrozo = clave;

// For the form: the question and up to three ideas, each a field, so a small model can't miss the shape.
export const ESQUEMA_PREGUNTA = {
  type: 'object',
  properties: { pregunta: { type: 'string' }, idea1: { type: 'string' }, idea2: { type: 'string' }, idea3: { type: 'string' } },
  required: ['pregunta', 'idea1', 'idea2', 'idea3'],
  additionalProperties: false,
};

const SISTEMA_PREGUNTA = [
  'Armás una pregunta de parcial para que un alumno de la UTN practique con un fragmento de sus apuntes.',
  'La pregunta se responde solo con lo que dice el fragmento, en dos o tres oraciones. Que sea sobre una idea central, no sobre un detalle suelto.',
  'Escribila en castellano, tratándolo de vos, como la haría un profesor argentino. El alumno no ve el fragmento: no lo nombres.',
  'En idea1, idea2 e idea3 poné lo que tiene que decir una buena respuesta, una idea corta en cada una, con las palabras del fragmento. Si alcanzan una o dos, dejá vacías las demás.',
  'Si el fragmento no sirve para una pregunta (un índice, una bibliografía, una carátula, datos sueltos), dejá todo vacío.',
  'Respondé solo con el JSON pedido.',
].join(' ');

/** The messages that ask for a question about a piece. */
export function pedidoDePregunta(trozo, tema = '') {
  const sobre = tema ? `\nTema que quiere practicar: ${tema}` : '';
  return [
    { role: 'system', content: SISTEMA_PREGUNTA },
    { role: 'user', content: `Fragmento:\n${trozo.texto}${sobre}` },
  ];
}

function json(respuesta) {
  try {
    const t = String(respuesta ?? '').replace(/<think>[\s\S]*?(<\/think>|$)/g, '');
    const desde = t.indexOf('{');
    const hasta = t.lastIndexOf('}');
    const v = JSON.parse(desde >= 0 && hasta > desde ? t.slice(desde, hasta + 1) : t);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

const limpio = (v, largo) => (typeof v === 'string' ? v.replace(/\p{Cc}/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, largo) : '');

/** How many of the words of `a` are in `b` (0 to 1), by their roots. */
export function parecido(a, b) {
  const ps = [...new Set(palabras(a))];
  if (!ps.length) return 0;
  const suyas = new Set(palabras(b));
  return ps.filter((p) => suyas.has(p)).length / ps.length;
}

// «Según el fragmento», «en el texto»: the student doesn't see it.
const NOMBRA_FRAGMENTO = /\s*,?\s*\b(?:seg[uú]n|de acuerdo (?:con|a)|en|como (?:dice|indica|explica))\s+(?:el|este|lo que dice el)\s+(?:fragmento|texto|apunte)\b\s*,?\s*/gi;

/** The question the model wrote, checked: { pregunta, ideas } or null. Each idea has to be in the piece (most of its
 * words); one that isn't was made up and goes. */
export function leerPregunta(respuesta, trozo) {
  const v = json(respuesta);
  if (!v) return null;
  let pregunta = limpio(v.pregunta, 300).replace(NOMBRA_FRAGMENTO, ' ').replace(/\s+/g, ' ').trim();
  if (/fragmento/i.test(pregunta)) return null;
  pregunta = pregunta.replace(/^¿?\s*/, (m) => (m.includes('¿') ? '¿' : '')).replace(/^(¿?)(\p{Ll})/u, (_, a, b) => a + b.toUpperCase());
  if (pregunta.length < 12 || !/\p{L}{3}/u.test(pregunta)) return null;
  // A question without its marks gets them, unless it asks with a verb («Explicá…», «Compará…»).
  if (pregunta.endsWith('?') && !pregunta.startsWith('¿')) pregunta = `¿${pregunta}`;
  if (pregunta.startsWith('¿') && !pregunta.endsWith('?')) pregunta = `${pregunta.replace(/[.:]$/, '')}?`;
  const ideas = [];
  for (const crudo of [v.idea1, v.idea2, v.idea3]) {
    const idea = limpio(crudo, 300).replace(/^[-•*\d.)\s]+/, '');
    if (!idea || !palabras(idea).length || parecido(idea, trozo.texto) < 0.6) continue;
    if (ideas.some((i) => parecido(i, idea) > 0.8)) continue;
    ideas.push(idea.replace(/^\p{Ll}/u, (l) => l.toUpperCase()));
  }
  if (!ideas.length) return null;
  // A question that already says its own answer isn't one.
  if (ideas.every((i) => parecido(i, pregunta) > 0.9)) return null;
  return { pregunta, ideas };
}

/** The form to check an answer: for each idea, whether it says it, and a mistake if it has one. */
export function esquemaDeCorreccion(cuantas) {
  const properties = {};
  for (let i = 1; i <= cuantas; i += 1) properties[`idea${i}`] = { type: 'string', enum: ['si', 'en-parte', 'no'] };
  properties.error = { type: 'string' };
  return { type: 'object', properties, required: Object.keys(properties), additionalProperties: false };
}

const SISTEMA_CORRECCION = [
  'Corregís la respuesta de un alumno a una pregunta de práctica, con el fragmento de sus apuntes de donde sale.',
  'Para cada idea, poné si la respuesta la dice: si, en-parte o no. Vale aunque la diga con otras palabras.',
  'En error, si la respuesta afirma algo que el fragmento contradice, escribilo en una oración corta, tratándolo de vos. Si no, dejalo vacío.',
  'No pongas notas ni puntajes.',
  'Respondé solo con el JSON pedido.',
].join(' ');

/** The messages that ask to check an answer. */
export function pedidoDeCorreccion(practica, trozo) {
  const ideas = practica.ideas.map((i, k) => `idea${k + 1}: ${i}`).join('\n');
  return [
    { role: 'system', content: SISTEMA_CORRECCION },
    { role: 'user', content: `Fragmento:\n${trozo.texto}\n\nPregunta: ${practica.pregunta}\n\nIdeas de una buena respuesta:\n${ideas}\n\nRespuesta del alumno: ${practica.respuesta}` },
  ];
}

/** Without the model, by the words in common: most of the idea is «si», a part «en-parte». */
export const porPalabras = (idea, respuesta) => {
  const n = parecido(idea, respuesta);
  return n >= 0.5 ? 'si' : n >= 0.25 ? 'en-parte' : 'no';
};

/** Whether an answer says nothing to check: empty, or «no sé». */
export const sinRespuesta = (respuesta) => !palabras(String(respuesta ?? '').replace(/\bno\s+(se|sé|lo se|lo sé|tengo idea|me acuerdo)\b/gi, '')).length;

/** The check of an answer: { ideas: ['si' | 'en-parte' | 'no'], error }. What the model left out or got out of shape,
 * the words in common decide. A mistake that copies the answer or names the piece isn't one. */
export function leerCorreccion(respuesta, practica) {
  const v = json(respuesta) ?? {};
  const ideas = practica.ideas.map((idea, k) => {
    const dicho = v[`idea${k + 1}`];
    const local = porPalabras(idea, practica.respuesta);
    if (!['si', 'en-parte', 'no'].includes(dicho)) return local;
    // The model says «no» to an idea the answer copies almost word for word: it's there.
    if (dicho === 'no' && parecido(idea, practica.respuesta) >= 0.8) return 'si';
    return dicho;
  });
  let error = limpio(v.error, 300);
  if (/fragmento/i.test(error) || parecido(error, practica.respuesta) > 0.9 || !/\p{L}{3}/u.test(error) || /^(ning|nada|no hay|-)/i.test(error)) error = '';
  return { ideas, error };
}
