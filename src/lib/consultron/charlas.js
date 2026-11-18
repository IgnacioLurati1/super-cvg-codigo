// Consultron's talks, kept in this browser's database so they can be opened again: what each answer showed (its text,
// its sources with their file, page and piece, the example of a calculator), by student. What was attached isn't kept,
// only its name. Of a source, only what names it and the text of its piece: nothing else of the campus. Salir deletes
// it all (sesion.js), like the text of the PDFs (textosPdf.js). Nothing here throws: without the database (private
// mode, no room) the talk stays only in the memory of the tab, as before.

// El Santo Resumen, as in santoResumen.js (a test checks they match). Not imported: sesion.js loads this file, and
// santoResumen.js would bring the campus with it.
export const SANTO = 'https://lutastudios.com/utn';

const BASE = 'super-cvg-charlas';
const CHARLAS = 'charlas';
/** How many talks are kept per student: past this, the one not touched the longest goes. */
export const TOPE_CHARLAS = 30;
/** How many questions of one talk are kept: the last ones. */
export const TOPE_ENTRADAS = 60;

let abierta = null;
// Bumped by Salir: a write that started before it does not bring anything back.
let generacion = 0;

function abrir() {
  if (!abierta) {
    const esta = new Promise((ok, mal) => {
      if (typeof indexedDB === 'undefined') return mal(new Error('sin base'));
      const pedido = indexedDB.open(BASE, 1);
      pedido.onupgradeneeded = () => {
        const db = pedido.result;
        if (!db.objectStoreNames.contains(CHARLAS)) db.createObjectStore(CHARLAS);
      };
      pedido.onsuccess = () => {
        const db = pedido.result;
        // Salir in another tab deletes the database: this one lets go of it, and the next use opens it again.
        const soltar = () => {
          db.close();
          if (abierta === esta) abierta = null;
        };
        db.onversionchange = soltar;
        db.onclose = soltar;
        ok(db);
      };
      pedido.onerror = () => mal(pedido.error);
      pedido.onblocked = () => mal(new Error('bloqueada'));
    });
    abierta = esta;
    esta.catch(() => {
      if (abierta === esta) abierta = null;
    });
  }
  return abierta;
}

const clave = (alumno, id) => `${alumno}:${id}`;
const deAlumno = (alumno) => IDBKeyRange.bound(`${alumno}:`, `${alumno}:￿`);
const valido = (alumno) => Number.isInteger(alumno);

async function enUna(modo, fn, siFalla) {
  try {
    const db = await abrir();
    return await new Promise((ok) => {
      const hecho = { valor: siFalla };
      let tx;
      try {
        tx = db.transaction(CHARLAS, modo);
        fn(tx.objectStore(CHARLAS), hecho);
      } catch {
        abierta = null;
        ok(siFalla);
        return;
      }
      tx.oncomplete = () => ok(hecho.valor);
      tx.onerror = () => ok(siFalla);
      tx.onabort = () => ok(siFalla);
    });
  } catch {
    return siFalla;
  }
}

// Text from disk, as text, cut to a size.
const texto = (v, largo) => (typeof v === 'string' ? v.slice(0, largo) : '');
const numero = (v) => (Number.isSafeInteger(v) && v > 0 ? v : null);
// A link of the site (a screen, a calculator), or a page of El Santo Resumen: nothing else opens from a saved talk.
const enlaceDelSitio = (a) => (typeof a === 'string' && /^\/[\w\-/#?=.]*$/.test(a) && !a.startsWith('//') ? a : undefined);
const deSanto = (url) => (typeof url === 'string' && url.startsWith(`${SANTO}/`) && /^[\w\-/#?=.%:]*$/.test(url) ? url : undefined);
const deClassroom = (url) => (typeof url === 'string' && url.startsWith('https://classroom.google.com/') && /^[\w\-/#?=.%:]*$/.test(url) ? url : undefined);
const TIPOS = new Set(['pdf', 'resumen', 'oficial', 'calculadora', 'guia', 'adjunto', 'propia', 'classroom', 'pantalla']);
const CLASES = { adjunto: ['pdf', 'foto', 'texto'], propia: ['foto', 'texto', 'nota'], classroom: ['Tarea', 'Material', 'Mensaje'] };

/** What is kept of where a piece comes from: what names it. Never the campus's item, the attached file nor the
 * student's own file. Of a post of Classroom, its title and its link. */
export function fuenteParaGuardar(f = {}) {
  const tipo = TIPOS.has(f.tipo) ? f.tipo : 'pdf';
  const guardada = { tipo, nombre: texto(f.nombre, 200), guardada: true };
  if (f.materia) guardada.materia = texto(f.materia, 200);
  if (CLASES[tipo]) guardada.clase = CLASES[tipo].includes(f.clase) ? f.clase : tipo === 'classroom' ? undefined : 'texto';
  const a = enlaceDelSitio(f.a);
  if (a && (tipo === 'calculadora' || tipo === 'guia' || tipo === 'propia')) guardada.a = a;
  const url = deSanto(f.url);
  if (url && tipo === 'oficial') guardada.url = url;
  const post = deClassroom(f.url);
  if (post && tipo === 'classroom') guardada.url = post;
  return guardada;
}

/** A piece as it's kept: its document, page and text, with its source. Of what was attached and of what Classroom
 * says (a post, or the tasks not turned in), not even its text: Classroom stays in memory. */
export function trozoParaGuardar(t = {}) {
  const fuente = fuenteParaGuardar(t.fuente);
  return { doc: texto(t.doc, 300), pagina: numero(t.pagina) ?? 1, texto: fuente.tipo === 'adjunto' || fuente.tipo === 'classroom' || t.doc === 'cursada:classroom' ? '' : texto(t.texto, 4000), fuente };
}

const filas = (v) => (Array.isArray(v) ? v.filter((f) => Array.isArray(f) && f.length === 2).slice(0, 20).map(([a, b]) => [texto(a, 200), texto(b, 600)]) : []);
const calculadora = (c) => c && typeof c.slug === 'string' && /^[\w-]+$/.test(c.slug) && { slug: c.slug, nombre: texto(c.nombre, 120) };
const esDato = (v) => ['string', 'number', 'boolean'].includes(typeof v) || v === null;
// What a calculator keeps of an exercise (calculos.js, `leerDatos`): plain values, maybe one level of lists or objects.
function datosLimpios(d, hondo = 0) {
  if (esDato(d)) return typeof d === 'string' ? d.slice(0, 2000) : d;
  if (hondo > 2 || !d || typeof d !== 'object') return null;
  if (Array.isArray(d)) return d.slice(0, 50).map((x) => datosLimpios(x, hondo + 1));
  return Object.fromEntries(Object.entries(d).slice(0, 40).map(([k, v]) => [texto(k, 60), datosLimpios(v, hondo + 1)]));
}

// The states an entry is kept in: one cut halfway shows as stopped.
const QUIETOS = new Set(['listo', 'no-esta', 'calculo', 'frenado', 'falla', 'practica']);

/** An entry of the talk (motor.js) as it's kept: what its answer showed. Attachments by name only. */
export function entradaParaGuardar(e) {
  const g = {
    id: numero(e.id) ?? 1,
    pregunta: texto(e.pregunta, 1000),
    estado: QUIETOS.has(e.estado) ? e.estado : 'frenado',
    texto: texto(e.texto, 20000),
    donde: texto(e.donde, 200),
    elegidos: (Array.isArray(e.elegidos) ? e.elegidos : []).slice(0, 8).map((x) => ({ trozo: trozoParaGuardar(x?.trozo) })),
    adjuntos: (Array.isArray(e.adjuntos) ? e.adjuntos : []).slice(0, 10).map((a) => ({ nombre: texto(a?.nombre, 200), clase: ['pdf', 'foto', 'texto'].includes(a?.clase) ? a.clase : 'texto' })),
  };
  if (e.general) g.general = e.general === 'humor' ? 'humor' : true;
  if (e.soloSitio) g.soloSitio = true;
  if (e.enResumen) g.enResumen = e.enResumen === 'archivo' ? 'archivo' : true;
  if (e.nube === 'resumenes' || e.nube === 'carrera') g.nube = e.nube;
  if (e.nubeFallo) g.nubeFallo = true;
  const sugerida = calculadora(e.sugerida);
  if (sugerida) g.sugerida = sugerida;
  if (e.ejemplo && calculadora(e.ejemplo)) {
    g.ejemplo = { ...calculadora(e.ejemplo), clave: texto(e.ejemplo.clave, 120) || undefined, ejemplo: texto(e.ejemplo.ejemplo, 200), modo: typeof e.ejemplo.modo === 'string' ? e.ejemplo.modo.slice(0, 60) : null };
  }
  if (e.estado === 'calculo' && e.calculo && calculadora(e.calculo)) {
    g.calculo = { ...calculadora(e.calculo), clave: texto(e.calculo.clave, 120) || undefined, filas: filas(e.calculo.filas), datos: datosLimpios(e.calculo.datos) };
  } else if (g.estado === 'calculo') g.estado = 'frenado';
  if (e.practica) g.practica = practicaParaGuardar(e.practica);
  return g;
}

const FASES = new Set(['pregunta', 'corregida', 'sin-trozo', 'falla']);
const NIVELES = new Set(['si', 'en-parte', 'no']);

/** A practice question (practica.js) as it's kept. One being made or corrected goes back to its question. */
export function practicaParaGuardar(p = {}) {
  const fase = FASES.has(p.fase) ? p.fase : p.pregunta ? 'pregunta' : 'sin-trozo';
  const g = {
    materia: texto(String(p.materia ?? ''), 40),
    nombre: texto(p.nombre, 200),
    tema: texto(p.tema, 200),
    fase,
    pregunta: texto(p.pregunta, 400),
    ideas: (Array.isArray(p.ideas) ? p.ideas : []).slice(0, 3).map((i) => texto(i, 400)).filter(Boolean),
    respuesta: texto(p.respuesta, 2000),
  };
  if (fase === 'corregida' && p.resultado) {
    g.resultado = {
      ideas: (Array.isArray(p.resultado.ideas) ? p.resultado.ideas : []).slice(0, 3).map((n) => (NIVELES.has(n) ? n : 'no')),
      error: texto(p.resultado.error, 400),
    };
  } else if (fase === 'corregida') g.fase = 'pregunta';
  return g;
}

/** A talk read back from disk, checked again: what doesn't have the shape goes. */
export function charlaLeida(c) {
  if (!c || typeof c !== 'object' || !numero(c.id) || !Array.isArray(c.entradas)) return null;
  const entradas = c.entradas.filter((e) => e && typeof e === 'object').map(entradaParaGuardar);
  return { id: c.id, creada: numero(c.creada) ?? c.id, cambiada: numero(c.cambiada) ?? c.id, entradas };
}

/** The talks of a student, the last one touched first: { id, primera, creada, cambiada, cuantas }. */
export async function listarCharlas(alumno) {
  if (!valido(alumno)) return [];
  return enUna('readonly', (charlas, hecho) => {
    const todas = charlas.getAll(deAlumno(alumno));
    todas.onsuccess = () => {
      hecho.valor = todas.result
        .map(charlaLeida)
        .filter((c) => c?.entradas.length)
        .sort((a, b) => b.cambiada - a.cambiada || b.id - a.id)
        .map((c) => ({ id: c.id, primera: c.entradas[0].pregunta, creada: c.creada, cambiada: c.cambiada, cuantas: c.entradas.length }));
    };
  }, []);
}

/** One talk of a student, with its entries, or null. */
export async function leerCharla(alumno, id) {
  if (!valido(alumno) || !numero(id)) return null;
  return enUna('readonly', (charlas, hecho) => {
    const pedido = charlas.get(clave(alumno, id));
    pedido.onsuccess = () => {
      hecho.valor = charlaLeida(pedido.result);
    };
  }, null);
}

/** Keeps a talk ({ id, creada, entradas }), in place of what it had. Makes room by the one not touched the longest. */
export async function guardarCharla(alumno, { id, creada, entradas }) {
  if (!valido(alumno) || !numero(id) || !Array.isArray(entradas)) return false;
  const guardar = entradas.slice(-TOPE_ENTRADAS).map(entradaParaGuardar);
  if (!guardar.length) return false;
  const nacida = generacion;
  return enUna('readwrite', (charlas, hecho) => {
    if (nacida !== generacion) return;
    charlas.put({ id, creada: numero(creada) ?? id, cambiada: Date.now(), entradas: guardar }, clave(alumno, id));
    hecho.valor = true;
    const todas = charlas.getAll(deAlumno(alumno));
    todas.onsuccess = () => {
      const viejas = todas.result.filter((c) => c?.id !== id).sort((a, b) => (b.cambiada ?? 0) - (a.cambiada ?? 0)).slice(TOPE_CHARLAS - 1);
      for (const c of viejas) charlas.delete(clave(alumno, c.id));
    };
  }, false);
}

/** Deletes one talk of a student. */
export async function borrarCharla(alumno, id) {
  if (!valido(alumno) || !numero(id)) return;
  await enUna('readwrite', (charlas) => {
    charlas.delete(clave(alumno, id));
  });
}

/** Salir: the talks of every student go away from this browser (sesion.js). Never fails. */
export async function borrarCharlas() {
  generacion += 1;
  const antes = abierta;
  abierta = null;
  try {
    (await antes)?.close();
  } catch {
    // It never opened: nothing to let go of.
  }
  if (typeof indexedDB === 'undefined') return;
  await new Promise((ok) => {
    try {
      const pedido = indexedDB.deleteDatabase(BASE);
      pedido.onsuccess = () => ok();
      pedido.onerror = () => ok();
      pedido.onblocked = () => ok();
    } catch {
      ok();
    }
  });
}
