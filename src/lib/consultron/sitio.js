// What Consultron knows of Super CVG itself: what each screen is for (guia.js) and what each calculator does and asks
// (the catalog and calculos.js). A question about the site («¿qué es esta página?», «¿cómo uso la calculadora de
// cola?») is answered with these pieces, each with a link to its screen, instead of the notes.
import { CALCULADORAS } from '../calculadoras/lista.js';
import { CALCULOS } from './calculos.js';
import { elegir, indexar, palabras, plegar } from './fragmentos.js';
import { PANTALLAS } from './guia.js';

const formaDe = new Map(CALCULOS.map((c) => [c.slug, c]));

/** What a calculator does and what it asks, in words. */
function textoDeCalculadora(c) {
  const forma = formaDe.get(c.slug);
  const campos = forma ? Object.values(forma.campos) : [];
  const pide = campos.map((f) => (f.describe ? `${f.titulo} (${f.describe.replace(/\.$/, '')})` : f.titulo));
  return [
    `La calculadora ${c.nombre} está en Calculadoras. ${c.descripcion}`,
    `Sale de los apuntes de ${c.materias.join(', ')}.`,
    pide.length ? `Le cargás ${pide.join('; ')}.` : '',
    pide.length ? 'También podés pasarle el enunciado a Consultron: saca los datos y te la abre cargada.' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

// The list of calculators goes with the screen that lists them.
const LISTA = `Hay ${CALCULADORAS.length}: ${CALCULADORAS.map((c) => c.nombre).join(', ')}.`;

const TROZOS = [
  ...CALCULADORAS.map((c) => ({
    doc: `sitio:calc:${c.slug}`,
    pagina: 1,
    texto: textoDeCalculadora(c),
    buscar: `calculadora ${c.nombre} ${formaDe.get(c.slug)?.palabras ?? ''} ${c.descripcion}`,
    fuente: { tipo: 'calculadora', nombre: c.nombre, a: `/calculadoras/${c.slug}` },
  })),
  ...PANTALLAS.map((p) => {
    const texto = p.ruta === '/calculadoras' ? `${p.texto} ${LISTA}` : p.texto;
    return {
      doc: `sitio:${p.ruta ?? p.nombre}`,
      pagina: 1,
      texto,
      buscar: `${p.nombre} ${p.palabras ?? ''} ${texto}`,
      // A screen with a number in its address («/materias/:id») has no link of its own.
      fuente: { tipo: 'guia', nombre: p.nombre, a: p.ruta && !p.ruta.includes(':') ? p.ruta : null },
      ruta: p.ruta ? new RegExp(`^${p.ruta.replace(/:[^/]+/g, '[^/]+')}/?$`) : null,
    };
  }),
];

let indice = null;

/** The piece of the screen at an address: its calculator, or its entry of the guide. */
export function pantallaDe(direccion) {
  const calc = /^\/calculadoras\/([^/?#]+)/.exec(direccion ?? '')?.[1];
  if (calc) return TROZOS.find((t) => t.doc === `sitio:calc:${calc}`) ?? null;
  return TROZOS.find((t) => t.ruta?.test(direccion ?? '')) ?? null;
}

// The question is about Super CVG: a screen, a calculator, a setting, how to do something here.
const DEL_SITIO =
  /\b(super ?cvg|sitio|pagina|pantalla|seccion|menu|boton|calculadoras?|configuracion|ajustes?|atajos?|tema|oscuro|classroom|drive|sysacad|laboratorio|mensajes|calendario|horario|notificacion(es)?|campana|instalar|app|aplicacion|como (hago|puedo|uso|agrego|sumo|subo|cambio|borro|bajo|pongo|saco|encuentro|activo|abro|vinculo|conecto|comparto|veo|oculto|muevo|marco|guardo)|donde (veo|esta|estan|encuentro|pongo|cambio)|para que sirve)\b/;
// It's about the screen the student has open.
const ACA = /\b(esta|este) (pagina|pantalla|seccion|lugar|sitio|calculadora)\b|\bque (hay|hago|es) aca\b|\bque es esto\b|\bdonde estoy\b/;
// Only about the site: the notes don't need to be read.
const SOLO = /\b(super ?cvg|calculadoras?|(esta|la) (pagina|pantalla)|configuracion|atajos?)\b/;

/**
 * The pieces of the guide for a question, and whether it's only about the site ({ piezas, solo }). `donde`: the
 * address of the screen the student has open. `calculo`: the calculator the question names (calculos.js), first when
 * it says «calculadora».
 */
export function delSitio(pregunta, { donde = null, calculo = null } = {}) {
  const plano = plegar(pregunta);
  const aca = ACA.test(plano);
  if (!aca && !DEL_SITIO.test(plano)) return { piezas: [], solo: false };
  indice ??= indexar(TROZOS);
  const primeras = [];
  if (aca) {
    const t = pantallaDe(donde);
    if (t) primeras.push({ ...t, fuente: { ...t.fuente, abierta: true } });
  }
  // «Qué calculadoras hay»: the screen that lists them. «La calculadora de colas»: that one.
  if (/\bcalculadoras\b/.test(plano)) primeras.push(pantallaDe('/calculadoras'));
  else if (calculo && /\bcalculadora\b/.test(plano)) primeras.push(TROZOS.find((x) => x.doc === `sitio:calc:${calculo.slug}`));
  const unicas = primeras.filter((t, i) => t && primeras.findIndex((x) => x?.doc === t.doc) === i);
  const solo = aca || SOLO.test(plano);
  // Next to the notes, a piece of the guide goes only if it has most of the question's words: «¿cómo hago una integral?»
  // isn't about the site.
  const necesita = solo ? 1 : Math.max(2, Math.ceil(new Set(palabras(pregunta)).size * 0.6));
  const resto = elegir(indice, pregunta, { cuantos: 3, porPagina: 1 }).filter((e) => e.cubre >= necesita && !unicas.some((p) => p.doc === e.trozo.doc));
  const piezas = [...unicas.map((trozo) => ({ trozo, puntaje: Infinity, cubre: 0 })), ...resto].slice(0, 3);
  return { piezas, solo };
}
