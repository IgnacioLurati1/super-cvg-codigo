// What Consultron knows of the student's career, from any screen: the copies of the Sysacad tabs that Sysacad Lindo
// keeps (sysacad.js), read as Tu carrera reads them (carrera.js). A question like «¿qué necesito para cursar Gestión
// Gerencial?» is answered with that, never with the notes nor with what it knows in general. Everything stays in memory.
import { cargarPerfil } from '../campus.js';
import { armarCarrera, carreraParaConsultron, frenosParaCursar, loQueDestraba } from '../carrera.js';
import { esDemo } from '../modoDemo.js';
import { tokenActual } from '../sesion.js';
import { ESPERA_MS, estadoSysacad, palabrasDe, preguntarSysacad } from '../sysacad.js';
import { mismoAlumno, vistoHace } from '../sysacadPestanas.js';
import { plegar } from './fragmentos.js';

// About their own career: what they can take or sit for, what a subject needs, what they passed or still owe.
const DE_CARRERA =
  /\b(correlativ\w*|requisitos?|(que|cuales) (materias )?(puedo|podria) (cursar|rendir)|(puedo|podria) (cursar|rendir)|que (me falta|me faltan|necesito|tengo que tener|tengo que aprobar|tengo que regularizar) (para|en)|para (cursar|rendir|anotarme|inscribirme) (a |en )?\w+|me falta para recibirme|cuantas materias|materias (aprobadas|regulares|que me faltan|que debo)|mis (finales|aprobadas|regulares|correlativas)|que materia me frena|(que|cual) me conviene (cursar|rendir)|(que|cual|en que) materias? me conviene|me conviene (cursar|rendir|enfocarme|estudiar|priorizar|anotarme)|plan de estudios?|mi carrera|tu carrera|(que|cuanto|cual) (nota|notas) (me saque|saque|tengo|tuve)|mis notas|mi nota|mi promedio|tengo de promedio)\b/;

// A subject named with a verb of the career: «¿puedo rendir Física II?», «qué onda con Gestión Gerencial, la curso?».
const VERBO = /\b(curs\w*|rend\w*|regulariz\w*|aprob\w*|anot\w*|inscrib\w*|necesit\w*|falt\w*|notas?|saqu\w*|me sirve|destrab\w*|habilit\w*|piden|desbloque\w*)\b/;

/**
 * The subject a question names, of `materias` ({ clave, nombre }): the one with every word of its name in the question,
 * the longest if more than one does («Sistemas de Gestión» and «Gestión Gerencial»). Null if none.
 */
export function materiaNombrada(pregunta, materias) {
  const dichas = new Set(palabrasDe(pregunta));
  let mejor = null;
  let largo = 0;
  for (const m of materias) {
    const suyas = palabrasDe(m.nombre);
    if (suyas.length > largo && suyas.every((p) => dichas.has(p))) {
      mejor = m;
      largo = suyas.length;
    }
  }
  return mejor;
}

/** Whether a question is about the student's career. `materias`: the subjects of their plan, if known. */
export const esDeCarrera = (pregunta, materias = []) => {
  const p = plegar(pregunta);
  return DE_CARRERA.test(p) || (VERBO.test(p) && Boolean(materiaNombrada(pregunta, materias)));
};

const materiasDe = (estado) => (estado.copias?.pestanas?.length ? armarCarrera(estado.copias.pestanas).materias : []);

/**
 * The subjects of their career, to tell «¿para qué me sirve Legislación?» from a topic question by its subject. Before
 * the copies arrive (the first question of the visit), it waits for them, but only with a word about taking subjects.
 */
export async function materiasDeLaCarrera(pregunta) {
  const ya = materiasDe(estadoSysacad());
  if (ya.length || !VERBO.test(plegar(pregunta))) return ya;
  const demo = Boolean(import.meta.env?.DEV) && esDemo(tokenActual());
  if (estadoSysacad().sinCopias && !demo) return [];
  return materiasDe(await copiasYa());
}

const SIN_DATOS = 'No tenés la carrera del alumno, así que no sabés qué aprobó ni qué le falta. No lo supongas. Decile que conecte Sysacad Lindo desde la pantalla Sysacad, en el menú Más. Con eso le podés contestar.';
const DE_OTRO = 'Las copias de Sysacad de este navegador son de otra cuenta, no de este alumno. Sin las suyas no sabés qué aprobó ni qué le falta, así que no lo supongas. Que abra Sysacad en Super CVG.';

// The demo has no extension: its made-up copies, as Tu carrera does.
async function copiasDeDemo() {
  if (!import.meta.env?.DEV || !esDemo(tokenActual()) || estadoSysacad().copias?.pestanas?.length) return;
  const { mensajeDeEjemplo } = await import('../demoSysacad.js');
  window.postMessage(mensajeDeEjemplo(), window.location.origin);
}

// The copies, once Sysacad Lindo answered or said nothing for a moment.
async function copiasYa() {
  await copiasDeDemo();
  if (!estadoSysacad().copias?.pestanas?.length) preguntarSysacad();
  const hasta = Date.now() + ESPERA_MS + 500;
  while (Date.now() < hasta) {
    const s = estadoSysacad();
    // «sinCopias» may be from before this question: only the copies, or the time, end the wait.
    if (s.copias?.pestanas?.length) break;
    await new Promise((listo) => setTimeout(listo, 100));
  }
  return estadoSysacad();
}

/**
 * The career for a question about it: { nombre, a, texto }, the text as Consultron reads Tu carrera, with the subject
 * the question names as the one open. Without the student's own copies, a text that says so and how to get them.
 */
export async function deLaCarrera(pregunta) {
  const { copias, finales } = await copiasYa();
  const fuente = { nombre: 'Tu carrera', a: '/carrera' };
  if (!copias?.vinculada || !copias.guarda || !copias.pestanas?.length || !copias.alumno) return { ...fuente, nombre: 'Sysacad', a: '/sysacad', texto: SIN_DATOS };
  const perfil = await cargarPerfil().catch(() => null);
  if (!perfil?.completo || !mismoAlumno(copias.alumno, perfil.completo)) return { ...fuente, nombre: 'Sysacad', a: '/sysacad', texto: DE_OTRO };
  const carrera = armarCarrera(copias.pestanas, finales);
  return { ...fuente, texto: carreraParaLaPregunta(carrera, pregunta, vistoHace(carrera.fecha)) };
}

const fila = ([etiqueta, valor]) => (etiqueta ? `- ${etiqueta}: ${valor}` : `- ${valor}`);
const nota = (n) => String(n).replace('.', ',');

/**
 * One subject in sentences a small model can't turn around: what it needs comes with the subject's own name as the
 * one being taken («Para cursar Legislación no te falta nada»), and what asks for it only when the question is about
 * that. «Te la piden para cursar Gestión Gerencial» came back as «Legislación pide Gestión Gerencial».
 */
export function lineaDeMateria(carrera, m, pregunta = '') {
  const p = plegar(pregunta);
  const porClave = new Map(carrera.materias.map((x) => [x.clave, x]));
  // «No aprobó ni está inscripto a Física II», as one can read it: approved, or signed up to sit its final.
  const requisito = (r) => {
    const n = porClave.get(r.clave)?.nombre ?? r.texto;
    return r.accion === 'Aprobar o inscribirte a' ? `aprobar ${n} (o estar anotado para rendir ${n})` : `${r.accion.toLowerCase()} ${n}`;
  };
  const requisitos = (lado) => [...lado.faltan.map(requisito), ...lado.otros.map((o) => o.charAt(0).toLowerCase() + o.slice(1))].join(', ');
  const frases = [];
  if (/\brend\w*/.test(p) && ['cursar', 'falta', 'cursando'].includes(m.estado))
    frases.push(m.estado === 'cursando' ? `Todavía no podés rendir ${m.nombre}. Primero tenés que terminar de cursarla y regularizarla.` : `Todavía no podés rendir ${m.nombre}. Primero tenés que cursarla y regularizarla.`);
  if (m.estado === 'aprobada') frases.push(`${m.nombre} ya la aprobaste${m.nota ? `, con ${nota(m.nota)}` : ''}.`);
  else if (m.estado === 'cursando') frases.push(`${m.nombre} la estás cursando ahora.`);
  else if (m.estado === 'cursar' && !/\brend\w*/.test(p)) frases.push(`Para cursar ${m.nombre} no te falta nada. Ya podés cursarla.`);
  else if (m.estado === 'falta') frases.push(`Para cursar ${m.nombre} te falta ${requisitos(m.cursar)}.`);
  else if (m.estado === 'regular') {
    // The answer first: a small model keeps the first sentence and drops the rest.
    if (!m.rendir || m.rendir.puede) frases.push(`Sí, ya podés rendir ${m.nombre}. La cursada ya la regularizaste.`);
    else frases.push(`Todavía no podés rendir ${m.nombre}. Te falta ${requisitos(m.rendir)}. La cursada ya la regularizaste.`);
  } else frases.push(`De ${m.nombre}, Sysacad todavía no dice nada.`);
  if (/\b(destraba|habilita|sirve|para que|piden|abre|libera|desbloquea|necesitan)\b/.test(p)) {
    const d = loQueDestraba(carrera, m.clave);
    const lista = new Intl.ListFormat('es', { type: 'conjunction' });
    const piden = [
      ...(d.cursar.length ? [`${m.nombre} es requisito para cursar ${lista.format(d.cursar.map((x) => x.nombre))}.`] : []),
      ...(d.rendir.length ? [`${m.nombre} es requisito para rendir ${lista.format(d.rendir.map((x) => x.nombre))}.`] : []),
    ];
    const lasQuePiden = piden.length ? piden : [`${m.nombre} no es requisito de ninguna materia que te falte.`];
    if (!/\b(curs|rend|aprob|regulariz)\w*/.test(p)) return lasQuePiden.join(' ');
    frases.unshift(...lasQuePiden);
  }
  return frases.join(' ');
}

/**
 * The part of the career a question needs, and only that: a small model mixes up the sections of the whole of it
 * («¿qué puedo cursar?» answered with what it's taking). A subject named, its line; «cursar», what it can take;
 * «rendir», the regular ones; a grade, the passed ones; «cuántas», the count already made. Anything else, all of it.
 */
export function carreraParaLaPregunta(carrera, pregunta, fecha = '', { elegida = null, supuestas = new Set(), abren } = {}) {
  const p = plegar(pregunta);
  const materia = materiaNombrada(pregunta, carrera.materias);
  // On Tu carrera: the subject open there and what is being supposed.
  const toda = carreraParaConsultron(carrera, { elegida: materia?.clave ?? elegida, fecha, preguntada: Boolean(materia), supuestas, ...(abren && { abren }) });
  const dato = (etiqueta) => toda.datos.find(([e]) => e === etiqueta);
  const laMateria = materia ?? (elegida ? carrera.materias.find((x) => x.clave === elegida) : null);
  // Its sentences alone: with a label the model answers with the label («Legislación es la materia por la que preguntás»).
  const deLaMateria = laMateria && ['', lineaDeMateria(carrera, laMateria, pregunta)];
  const suponiendo = toda.resultado.find(([e]) => e.startsWith('Suponiendo'));
  const total = carrera.materias.filter((m) => !m.electiva).length;
  const aprobadas = carrera.materias.filter((m) => !m.electiva && m.estado === 'aprobada').length;
  let filas;
  if (materia) filas = [deLaMateria];
  else if (deLaMateria && /\b(esta|esa|abierta|la que abri)\b/.test(p)) filas = [deLaMateria];
  else if (suponiendo && /\b(supon\w*|si (apruebo|regularizo|tengo|curso|rindo))\b/.test(p)) filas = [suponiendo];
  else if (/\b(cuantas|cuanto)\b/.test(p) && !/\bnota/.test(p)) filas = [['', `Te faltan ${total - aprobadas} materias de ${total}, sin contar electivas.`], ['', `Ya aprobaste ${aprobadas}.`]];
  else if (/\b(nota|notas|promedio|aprobadas|aprobe)\b/.test(p)) filas = [dato('Aprobadas')];
  else if (/\b(frena|conviene|priorizar|primero|enfocarme)\b/.test(p)) {
    // The advice already made, with the count of Tu carrera: of what it can sit for (or take), the one that opens the
    // most right away first, then the one that holds back the most down the chain. In words a small model can't turn
    // around.
    const materias = (n) => (n === 1 ? '1 materia' : `${n} materias`);
    const consejo = (lista, verbo) => {
      if (!lista.length) return [];
      const [primera, ...resto] = lista;
      const destraba = (f) => (f.frena === 0 ? 'no destraba ninguna otra' : `${f.abre ? `te abre ${materias(f.abre)} ya y ` : ''}frena ${materias(f.frena)} contando la cadena`);
      return [
        [`Te conviene ${verbo} primero`, `${primera.nombre}, porque ${destraba(primera)}`],
        ...(resto.length ? [[`Después, para ${verbo}`, resto.map((f) => `${f.nombre} (${destraba(f)})`).join('; ')]] : []),
      ];
    };
    const rendir = consejo(carrera.paraRendir, 'rendir');
    const cursar = consejo(frenosParaCursar(carrera.materias, new Set(carrera.materias.filter((m) => m.estado === 'cursar').map((m) => m.clave))), 'cursar');
    filas = /\brend\w*/.test(p) ? rendir : /\bcurs\w*/.test(p) ? cursar : [...rendir, ...cursar];
  }
  else if (/\brend\w*/.test(p)) filas = [dato('Regulares')];
  else if (/\bcurs\w*/.test(p)) filas = [dato('Podés cursar'), dato('Cursando') && ['Ya las está cursando (no van como «podés cursar»)', dato('Cursando')[1]]];
  else filas = [...toda.datos, ...toda.resultado];
  filas = filas.filter(Boolean);
  const cuerpo = filas.length ? filas.map(fila).join('\n') : '- Nada de eso en lo que abrió de Sysacad.';
  return `Tu carrera, de lo que el alumno abrió de Sysacad${fecha ? ` ${fecha}` : ''}. Son sus datos de Sysacad, no sus apuntes.\n${cuerpo}\n«Podés cursar» y «podés rendir» son lo que dice Sysacad hoy.`;
}
