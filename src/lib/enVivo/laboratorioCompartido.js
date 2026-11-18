import * as Y from 'yjs';
import { nombreDeArchivo } from '../laboratorio/guardado';
import { esLenguaje, LENGUAJES } from '../laboratorio/lenguajes';
import { EXTENSIONES, MAX_CODIGO, nombreValido as nombreDeArchivoValido, sanearCasos } from '../laboratorio/saneo';
import { derEnTexto, leerDer } from '../laboratorio/der/modelo';
import { entradasDer, leerDerCompartido, ponerDerCompartido } from './derCompartido';

// The Laboratorio of a live session's table (components/enVivo/herramientas/Laboratorio.jsx): the site's own
// (pages/Laboratorio.jsx) over a shared folder of projects that the whole table writes together, in the tab's Y.Map:
//   proyectos         Y.Map of id -> Y.Map { nombre, lenguaje, principal (the id of the file that runs), casos (as
//                     the page keeps them, saneo.js), cuando, archivos: Y.Map of id -> Y.Map { nombre, ext,
//                     codigo: Y.Text, cuando } }. A `.der` has `der` (a Y.Map by element, derCompartido.js) in place
//                     of `codigo`: its text is made from it. One with `codigo` (from before) is turned into one with
//                     `der` by whoever opens the tab (`convertirDers`).
//   salida:<persona>  { nombre, lenguaje, texto, final, cuando }: the last output a student chose to share
// Code runs on each computer, never shared. Everything here can come from the others: it is read back checked and cut.

export const MAX_SALIDA = 4000;
export const MAX_SALIDAS = 12;
export const MAX_PROYECTOS_MESA = 10;
export const MAX_ARCHIVOS_MESA = 20;
export const MAX_ARCHIVOS_TOTAL = 40;
const MAX_FINAL = 160;
const MAX_NOMBRE = 60;
const PREFIJO_SALIDA = 'salida:';
export const PRIMER_PROYECTO = 'Código de la sesión';

// eslint-disable-next-line no-control-regex
const texto = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, max) : '');
const linea = (v, max) => texto(v, max * 2).replace(/\s+/g, ' ').trim().slice(0, max);
const esPersona = (id) => typeof id === 'string' && /^[\w-]{1,40}$/.test(id);
const esIdDeArchivo = (id) => typeof id === 'string' && /^l[0-9a-z]{6,24}$/.test(id);
const esIdDeProyecto = (id) => typeof id === 'string' && /^q[0-9a-z]{6,24}$/.test(id);
const azar = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const nombreLimpio = (n) => nombreDeArchivoValido(n).slice(0, MAX_NOMBRE);
const cuandoDe = (m) => (Number.isSafeInteger(m.get('cuando')) ? m.get('cuando') : 0);

const mapaDe = (datos) => (datos.get('proyectos') instanceof Y.Map ? datos.get('proyectos') : null);

// The shared map of a `.der` from its text (empty, or one that isn't a DER, starts empty).
const derDeTexto = (codigo) => new Y.Map(entradasDer(leerDer(String(codigo ?? '')) ?? undefined));

function archivoNuevo({ nombre, ext, codigo }, cuando = Date.now()) {
  if (ext === 'der') {
    return new Y.Map([
      ['nombre', nombre],
      ['ext', ext],
      ['der', derDeTexto(codigo)],
      ['cuando', cuando],
    ]);
  }
  const t = new Y.Text();
  t.insert(0, String(codigo ?? '').slice(0, MAX_CODIGO));
  return new Y.Map([
    ['nombre', nombre],
    ['ext', ext],
    ['codigo', t],
    ['cuando', cuando],
  ]);
}

// After every other one, also one made in the same millisecond: the order is the one they were made in.
function despuesDe(mapa) {
  let ultimo = 0;
  mapa?.forEach((m) => {
    if (m instanceof Y.Map) ultimo = Math.max(ultimo, cuandoDe(m));
  });
  return Math.max(Date.now(), ultimo + 1);
}

/** A project for the folder: with a main file of its language's example (`conMain`), or empty. */
function proyectoNuevo({ nombre, lenguaje, conMain = false }, cuando = Date.now()) {
  const archivos = new Y.Map();
  let principal = null;
  if (conMain) {
    principal = `l${azar()}`;
    archivos.set(principal, archivoNuevo({ nombre: 'main', ext: LENGUAJES[lenguaje].extension, codigo: LENGUAJES[lenguaje].ejemplo }, cuando));
  }
  return new Y.Map([
    ['nombre', nombre],
    ['lenguaje', lenguaje],
    ['principal', principal],
    ['cuando', cuando],
    ['archivos', archivos],
  ]);
}

/** What the tab starts with, made by whoever opens it: a project of Python with its main file. */
export function inicialDelLaboratorio() {
  return { proyectos: new Y.Map([[`q${azar()}`, proyectoNuevo({ nombre: PRIMER_PROYECTO, lenguaje: 'python', conMain: true })]]) };
}

/** Makes the folder if it isn't there (a tab opened before it had one). */
export function prepararProyectos(datos) {
  if (mapaDe(datos)) return;
  datos.set('proyectos', inicialDelLaboratorio().proyectos);
}

/**
 * The folder as it is now, checked: [{ id, nombre, lenguaje, principal, casos, archivos: [{ id, nombre, ext, texto
 * (its Y.Text), der (a `.der`'s Y.Map, then `texto` is null), codigo }] }]. A project of an unknown language, a file of another type, without its text or with a
 * name already taken in its project (two made it at once), or past the limits, is left out.
 */
export function leerCarpeta(datos) {
  const proyectos = [];
  mapaDe(datos)?.forEach((m, id) => {
    if (!esIdDeProyecto(id) || !(m instanceof Y.Map) || !esLenguaje(m.get('lenguaje'))) return;
    proyectos.push({ id, m, cuando: cuandoDe(m) });
  });
  proyectos.sort((a, b) => a.cuando - b.cuando || a.id.localeCompare(b.id));
  let quedan = MAX_ARCHIVOS_TOTAL;
  return proyectos.slice(0, MAX_PROYECTOS_MESA).map(({ id, m }) => {
    const lenguaje = m.get('lenguaje');
    const lista = [];
    const archivos = m.get('archivos');
    if (archivos instanceof Y.Map) {
      archivos.forEach((a, aid) => {
        if (!esIdDeArchivo(aid) || !(a instanceof Y.Map)) return;
        const der = a.get('ext') === 'der' && a.get('der') instanceof Y.Map ? a.get('der') : null;
        if (!der && !(a.get('codigo') instanceof Y.Text)) return;
        const nombre = nombreLimpio(a.get('nombre'));
        if (!nombre || !EXTENSIONES[lenguaje].includes(a.get('ext'))) return;
        lista.push({ id: aid, nombre, ext: a.get('ext'), texto: der ? null : a.get('codigo'), der, cuando: cuandoDe(a) });
      });
    }
    lista.sort((a, b) => a.cuando - b.cuando || a.id.localeCompare(b.id));
    const usados = new Set();
    const suyos = [];
    for (const a of lista) {
      const completo = nombreDeArchivo(a.nombre, lenguaje, a.ext).toLowerCase();
      if (usados.has(completo) || suyos.length >= MAX_ARCHIVOS_MESA || quedan <= 0) continue;
      usados.add(completo);
      quedan -= 1;
      suyos.push({ id: a.id, nombre: a.nombre, ext: a.ext, texto: a.texto, der: a.der, codigo: a.der ? derEnTexto(leerDerCompartido(a.der)) : a.texto.toString().slice(0, MAX_CODIGO) });
    }
    const deCodigo = suyos.filter((a) => a.ext === LENGUAJES[lenguaje].extension);
    const principal = (deCodigo.find((a) => a.id === m.get('principal')) ?? deCodigo[0])?.id ?? null;
    return { id, nombre: nombreLimpio(m.get('nombre')) || 'Proyecto', lenguaje, principal, casos: sanearCasos(m.get('casos')), archivos: suyos };
  });
}

const proyectoMapa = (datos, id) => {
  const m = mapaDe(datos)?.get(id);
  return m instanceof Y.Map ? m : null;
};
const deArchivo = (datos, id) => {
  const carpeta = leerCarpeta(datos);
  const p = carpeta.find((x) => x.archivos.some((a) => a.id === id));
  return p ? { carpeta, p, a: p.archivos.find((a) => a.id === id) } : null;
};
const ocupado = (p, nombre, ext, menos = null) => {
  const completo = nombreDeArchivo(nombre, p.lenguaje, ext).toLowerCase();
  return p.archivos.some((a) => a.id !== menos && nombreDeArchivo(a.nombre, p.lenguaje, a.ext).toLowerCase() === completo);
};

/** A new project for everyone, empty. Returns its id, or null (no name, an unknown language or too many). */
export function crearProyectoDeLaMesa(datos, { nombre, lenguaje }) {
  const n = nombreLimpio(nombre);
  if (!n || !esLenguaje(lenguaje)) return null;
  prepararProyectos(datos);
  if (leerCarpeta(datos).length >= MAX_PROYECTOS_MESA) return null;
  const id = `q${azar()}`;
  mapaDe(datos).set(id, proyectoNuevo({ nombre: n, lenguaje }, despuesDe(mapaDe(datos))));
  return id;
}

export function renombrarProyecto(datos, id, nombre) {
  const n = nombreLimpio(nombre);
  const m = proyectoMapa(datos, id);
  if (!n || !m) return false;
  m.set('nombre', n);
  return true;
}

/** Deletes it for everyone, with its files. The last one stays: the folder always has one. */
export function borrarProyectoDeLaMesa(datos, id) {
  if (leerCarpeta(datos).length <= 1 || !proyectoMapa(datos, id)) return false;
  mapaDe(datos).delete(id);
  return true;
}

/** Past the limit, the rest of a file goes for everyone: a peer can't fill the editor without end. */
export function recortarCodigo(t) {
  if (t.length > MAX_CODIGO) t.delete(MAX_CODIGO, t.length - MAX_CODIGO);
}

/** Puts `nuevo` in a shared text changing only what differs, so what another is writing elsewhere in it stays. */
export function ponerCodigo(t, nuevo) {
  const antes = t.toString();
  const despues = String(nuevo ?? '').slice(0, MAX_CODIGO);
  if (antes === despues) return;
  let i = 0;
  while (i < antes.length && i < despues.length && antes[i] === despues[i]) i += 1;
  let j = 0;
  while (j < antes.length - i && j < despues.length - i && antes[antes.length - 1 - j] === despues[despues.length - 1 - j]) j += 1;
  t.doc.transact(() => {
    if (antes.length - i - j > 0) t.delete(i, antes.length - i - j);
    if (despues.length - i - j > 0) t.insert(i, despues.slice(i, despues.length - j));
  });
}

/** A `.der` of the tab still as text (made before, or by someone with an older page) becomes one shared by element. */
export function convertirDers(datos) {
  const viejos = leerCarpeta(datos).flatMap((p) => p.archivos.filter((a) => a.ext === 'der' && a.texto).map((a) => ({ p, a })));
  if (!viejos.length) return;
  datos.doc.transact(() => {
    for (const { p, a } of viejos) {
      const m = proyectoMapa(datos, p.id)?.get('archivos')?.get(a.id);
      if (!(m instanceof Y.Map) || m.get('der') instanceof Y.Map) continue;
      m.set('der', derDeTexto(a.codigo));
      m.delete('codigo');
    }
  });
}

/** A `.der` of the tab as the sheet wrote it, by element. False if it isn't one or doesn't fit. */
export function ponerDer(datos, id, der, origen = null) {
  const a = leerCarpeta(datos).flatMap((p) => p.archivos).find((x) => x.id === id);
  return Boolean(a?.der) && ponerDerCompartido(a.der, der, origen);
}

/** A new file in a project, for everyone. Returns its id, or why not: 'nombre', 'tipo', 'ocupado' or 'muchos'. */
export function sumarArchivo(datos, proyecto, { nombre, ext, codigo = '' }) {
  const carpeta = leerCarpeta(datos);
  const p = carpeta.find((x) => x.id === proyecto);
  const n = nombreLimpio(nombre);
  if (!p) return { problema: 'muchos' };
  if (!n) return { problema: 'nombre' };
  if (!EXTENSIONES[p.lenguaje].includes(ext)) return { problema: 'tipo' };
  if (p.archivos.length >= MAX_ARCHIVOS_MESA || carpeta.reduce((s, x) => s + x.archivos.length, 0) >= MAX_ARCHIVOS_TOTAL) return { problema: 'muchos' };
  if (ocupado(p, n, ext)) return { problema: 'ocupado' };
  const m = proyectoMapa(datos, proyecto);
  if (!(m.get('archivos') instanceof Y.Map)) m.set('archivos', new Y.Map());
  const id = `l${azar()}`;
  datos.doc.transact(() => {
    m.get('archivos').set(id, archivoNuevo({ nombre: n, ext, codigo }, despuesDe(m.get('archivos'))));
    if (!p.principal && ext === LENGUAJES[p.lenguaje].extension) m.set('principal', id);
  });
  return { id };
}

/** Its new name. False if it isn't there, the name is empty or taken in its project. */
export function renombrarArchivo(datos, id, nombre) {
  const d = deArchivo(datos, id);
  const n = nombreLimpio(nombre);
  if (!d || !n || ocupado(d.p, n, d.a.ext, id)) return false;
  proyectoMapa(datos, d.p.id).get('archivos').get(id).set('nombre', n);
  return true;
}

/** Deletes it for everyone. The last file of the folder stays. */
export function quitarArchivo(datos, id) {
  const d = deArchivo(datos, id);
  if (!d || d.carpeta.reduce((s, x) => s + x.archivos.length, 0) <= 1) return false;
  proyectoMapa(datos, d.p.id).get('archivos').delete(id);
  return true;
}

export function elegirPrincipal(datos, proyecto, id) {
  const p = leerCarpeta(datos).find((x) => x.id === proyecto);
  if (!p?.archivos.some((a) => a.id === id && a.ext === LENGUAJES[p.lenguaje].extension)) return false;
  proyectoMapa(datos, proyecto).set('principal', id);
  return true;
}

export function guardarCasosDeLaMesa(datos, proyecto, casos) {
  const limpios = sanearCasos(casos);
  const m = proyectoMapa(datos, proyecto);
  if (!m || limpios.length !== casos.length) return false;
  m.set('casos', limpios);
  return true;
}

/** The shared text of every file, to keep each under the limit. */
export const textosDeLaCarpeta = (datos) => leerCarpeta(datos).flatMap((p) => p.archivos.map((a) => a.texto).filter(Boolean));

/** The folder as the page's Laboratorio reads the student's (mio.js): its projects and their files. */
export function comoMio(datos) {
  const carpeta = leerCarpeta(datos);
  return {
    laboratorio: carpeta.flatMap((p) => p.archivos.map((a) => ({ id: a.id, nombre: a.nombre, ext: a.ext, lenguaje: p.lenguaje, codigo: a.codigo, texto: a.texto, der: a.der, proyecto: p.id, materia: null }))),
    proyectosLab: carpeta.map((p) => ({ id: p.id, nombre: p.nombre, lenguaje: p.lenguaje, principal: p.principal, materia: null, ...(p.casos.length ? { casos: p.casos } : {}) })),
  };
}

/** The outputs shared, newest first: [{ de, nombre, lenguaje, texto, final, cuando }]. */
// A shared output's blocks (consolaEnBloques), checked as they come: text, or a table of plain cells. Within limits, so
// one output can't swell the table's document.
const MAX_BLOQUES = 8;
const MAX_COLUMNAS = 20;
const MAX_FILAS = 30;
const MAX_CELDA = 200;
const celda = (v) => (v === null || v === undefined ? null : typeof v === 'number' ? (Number.isFinite(v) ? v : String(v)) : typeof v === 'object' ? null : texto(String(v), MAX_CELDA));

export function bloquesValidos(v) {
  if (!Array.isArray(v)) return null;
  const fuera = [];
  for (const b of v.slice(0, MAX_BLOQUES)) {
    if (b?.tipo === 'texto') {
      const t = texto(b.texto, MAX_SALIDA);
      if (t.trim()) fuera.push({ tipo: 'texto', texto: t });
    } else if (b?.tipo === 'tabla' && Array.isArray(b.columnas) && b.columnas.length && Array.isArray(b.filas)) {
      const columnas = b.columnas.slice(0, MAX_COLUMNAS).map((c) => linea(String(c), MAX_NOMBRE));
      const filas = b.filas.slice(0, MAX_FILAS).filter(Array.isArray).map((f) => columnas.map((_, j) => celda(f[j])));
      fuera.push({ tipo: 'tabla', linea: Number.isSafeInteger(b.linea) && b.linea > 0 ? b.linea : 0, columnas, filas, recortada: b.recortada === true || b.filas.length > MAX_FILAS, tope: MAX_FILAS });
    }
  }
  return fuera.length ? fuera : null;
}

export function salidas(datos) {
  const lista = [];
  datos.forEach((v, clave) => {
    if (!clave.startsWith(PREFIJO_SALIDA)) return;
    const de = clave.slice(PREFIJO_SALIDA.length);
    if (!esPersona(de) || !v || typeof v !== 'object' || Array.isArray(v)) return;
    const cuerpo = texto(v.texto, MAX_SALIDA);
    const final = linea(v.final, MAX_FINAL);
    if (!cuerpo.trim() && !final) return;
    lista.push({ de, nombre: linea(v.nombre, MAX_NOMBRE) || 'Alguien', lenguaje: esLenguaje(v.lenguaje) ? v.lenguaje : null, texto: cuerpo, bloques: bloquesValidos(v.bloques), final, cuando: Number.isSafeInteger(v.cuando) ? v.cuando : 0 });
  });
  return lista.sort((a, b) => b.cuando - a.cuando || a.de.localeCompare(b.de)).slice(0, MAX_SALIDAS);
}

/** Shares this student's last output with everyone, in place of the one before. */
export function compartirSalida(datos, yo, { lenguaje, texto: cuerpo, bloques, final }) {
  if (!esPersona(yo.id)) return;
  // The text stays too: Consultron reads it, and so does a browser of before the blocks.
  const conBloques = bloquesValidos(bloques);
  datos.set(`${PREFIJO_SALIDA}${yo.id}`, {
    nombre: linea(yo.nombre, MAX_NOMBRE),
    lenguaje: esLenguaje(lenguaje) ? lenguaje : null,
    texto: texto(cuerpo, MAX_SALIDA),
    ...(conBloques ? { bloques: conBloques } : {}),
    final: linea(final, MAX_FINAL),
    cuando: Date.now(),
  });
}

export const sacarSalida = (datos, yo) => datos.delete(`${PREFIJO_SALIDA}${yo.id}`);


/**
 * What «Guardar en lo mío» keeps of the tab: the project of the file in view (`archivo`; the first one, if none), named
 * by its own name. Its file that runs as `texto` (`lenguaje` says it is code) and, with more than one file, all of them
 * (`archivos`), to keep as a project.
 */
export function paraGuardarCodigo(datos, archivo = null) {
  const carpeta = leerCarpeta(datos);
  const p = carpeta.find((x) => x.archivos.some((a) => a.id === archivo)) ?? carpeta[0];
  if (!p) return { nombre: PRIMER_PROYECTO, texto: '', lenguaje: 'python' };
  const principal = p.archivos.find((a) => a.id === p.principal) ?? p.archivos[0];
  const base = { nombre: `${p.nombre}.${LENGUAJES[p.lenguaje].extension}`, texto: principal?.codigo ?? '', lenguaje: p.lenguaje };
  if (p.archivos.length < 2) return base;
  return { ...base, archivos: p.archivos.map((a) => ({ nombre: a.nombre, ext: a.ext, codigo: a.codigo, principal: a.id === principal?.id })) };
}

/** What the session's Consultron reads of the tab. */
export function textoDelLaboratorio(datos) {
  const carpeta = leerCarpeta(datos);
  const partes = ['Laboratorio de la sesión, una carpeta compartida.'];
  if (!carpeta.some((p) => p.archivos.some((a) => a.codigo.trim()))) partes.push('Todavía no hay código.');
  for (const p of carpeta) {
    partes.push(`Proyecto ${p.nombre}, en ${LENGUAJES[p.lenguaje].nombre}.`);
    for (const a of p.archivos) partes.push(`Archivo ${nombreDeArchivo(a.nombre, p.lenguaje, a.ext)}${a.id === p.principal ? ', el que corre' : ''}:\n${a.codigo}`);
  }
  const compartidas = salidas(datos);
  if (compartidas.length) {
    partes.push(`Salidas que compartieron (cada uno lo corrió en su compu):\n${compartidas
      .map((s) => `${s.nombre}${s.lenguaje ? ` (${LENGUAJES[s.lenguaje].nombre})` : ''}${s.final ? `, ${s.final}` : ''}:\n${s.texto}`)
      .join('\n\n')}`);
  }
  return partes.join('\n\n');
}

// --- The others' carets and selections in the editor (y-codemirror.next), through the tab's own field of the awareness.

const ID = (v) => v === null || (v && typeof v === 'object' && Number.isSafeInteger(v.client) && v.client >= 0 && Number.isSafeInteger(v.clock) && v.clock >= 0);
const posicionValida = (p) =>
  Boolean(p) && typeof p === 'object' && ID(p.type ?? null) && ID(p.item ?? null) && (p.tname == null || (typeof p.tname === 'string' && p.tname.length <= 200)) && (p.assoc == null || Number.isSafeInteger(p.assoc));
/** A caret that came from someone: { anchor, head } as relative positions of Yjs, or null. */
export const cursorValido = (c) => (c && typeof c === 'object' && posicionValida(c.anchor) && posicionValida(c.head) ? { anchor: c.anchor, head: c.head } : null);

// A color goes into a style: only a plain hex, or the site's ink.
export const colorValido = (c) => (typeof c === 'string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(c) ? c : 'var(--texto-suave)');
export const nombreValido = (n) => linea(n, 40) || 'Alguien';

/**
 * What y-codemirror.next takes as an Awareness, but only of this tab: this browser's caret goes under its own field
 * (`marcar`, the contract's mesa.marcar), and of the others only those in the tab, checked, with their name and color.
 */
export function concienciaDePestana(conciencia, id, marcar) {
  const propio = () => conciencia.getLocalState()?.h?.[id] ?? null;
  return {
    doc: conciencia.doc,
    getLocalState: () => (conciencia.getLocalState() ? propio() ?? {} : null),
    setLocalStateField(campo, valor) {
      if (campo === 'cursor') marcar({ ...propio(), cursor: valor ?? null });
    },
    getStates() {
      const estados = new Map();
      conciencia.getStates().forEach((s, cliente) => {
        if (cliente === conciencia.doc.clientID || s?.p !== id) return;
        const cursor = cursorValido(s?.h?.[id]?.cursor);
        if (!cursor) return;
        const color = colorValido(s.color);
        estados.set(cliente, { cursor, user: { name: nombreValido(s.nombre), color, colorLight: `color-mix(in srgb, ${color} 24%, transparent)` } });
      });
      return estados;
    },
    on: (evento, fn) => conciencia.on(evento, fn),
    off: (evento, fn) => conciencia.off(evento, fn),
  };
}
