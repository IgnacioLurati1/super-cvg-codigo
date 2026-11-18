// The tools of a live session's table (Sesión en vivo, docs/sesiones-en-vivo.md). Each one is a tab of the table that
// everyone shares: anyone opens one, anyone works on it, and anyone can follow where another is looking.
//
// A tool is a React component, loaded apart, that receives one prop, `mesa`:
//
//   mesa.doc          the Y.Doc of the whole session (Yjs). Do not touch other tabs' data.
//   mesa.datos        the Y.Map of this tab only: everything shared of the tool lives under it (Y.Text, Y.Array, Y.Map).
//                     Whoever opens the tab may leave starting fields in it (which calculator, which file).
//   mesa.id           the id of this tab.
//   mesa.yo           { id, nombre, color }: who is on this browser (the color is a CSS color, readable on the page).
//                     `id` is the person's, the same after a reload (what goes in `de`).
//   mesa.presente(id) the person with that id: { nombre, desde } while here, { nombre, volviendo } while a reload may
//                     bring them back, null once they left (sesion.js `presente`).
//   mesa.conciencia   the Awareness of y-protocols, for cursors and selections. A tool writes only under its own field:
//                     conciencia.setLocalStateField('h', { [mesa.id]: { ... } }) through mesa.marcar(estado).
//   mesa.marcar(e)    publish this browser's small, passing state in this tab (cursor, selection): merged and sent at
//                     most a few times per second by the core. `null` clears it.
//   mesa.otros        [{ id, nombre, color, h }] the others now in this tab, with what they marked (re-renders on change).
//   mesa.vista        the view of the person being followed in this tab, or null. A tool that receives one moves to it
//                     (page, scroll, zoom, which sheet) without asking.
//   mesa.mover(v)     the tool says where it is looking: a small plain object of its own design (page, scroll, zoom).
//                     The core throttles it. Call it on scroll, page change and zoom.
//   mesa.soltar()     the student moved on their own while following someone: the core stops following.
//   mesa.archivos     files too big for the Y.Doc (a PDF): compartir(blob, nombre, id?) -> id (`id`: the one it had, to
//                     put it back), pedir(id, de) -> Promise<Blob>, estado(id) -> { tiene, parte, de, hay, nadie } (`hay`:
//                     how many others here have it; `nadie`: lost). Everyone keeps a copy in memory and it comes from
//                     whoever has it. Bytes travel encrypted, in parts; nothing is kept on a server.
//   mesa.paraConsultron(fn)   register a function that returns this tab's plain text (what the session's Consultron
//                     may read). Returns the function that unregisters it.
//   mesa.textosDeLaMesa()     what every tab registered with paraConsultron on this browser: [{ id, texto }]. Only the
//                     session's Consultron reads it.
//   mesa.paraGuardar(fn)  register what «Guardar en lo mío» saves of this tab (the table shows the button only then).
//                     fn() returns (or resolves to) { nombre, texto } (text with the site's little formatting, formato.js)
//                     or { nombre, archivo: Blob } (a PDF or a PNG/JPG image: what a section of a course can open).
//                     The table asks where (a course and a section of the student) and saves it there. Returns the
//                     function that unregisters it.
//   mesa.irA(id)      take this browser to another tab of the table (one the tool just opened), as a click on it does.
//   mesa.recienAbierta  this browser just opened the tab with «Abrir»: a tool that is written in takes the focus.
//
// A tool never sends anything by itself: everything goes through the Y.Doc, the awareness or mesa.archivos.
// Everything the others send is untrusted: shown as text (or drawn), never as HTML, and cut to a size.
//
// `inicial()` (optional): the Yjs types a tool needs in `datos` from the start, made with the tab by whoever opens it.
// Made later by each one who opens the tool, two at once would each make their own and only one would stay.

import * as Y from 'yjs';
import { inicialDelLaboratorio } from './laboratorioCompartido';

export const HERRAMIENTAS = {
  documento: { nombre: 'Documento', inicial: () => ({ texto: new Y.XmlFragment() }), cargar: () => import('../../components/enVivo/herramientas/Documento.jsx') },
  pizarra: { nombre: 'Pizarra', cargar: () => import('../../components/enVivo/herramientas/Pizarra.jsx') },
  flujo: { nombre: 'Diagrama de flujo', cargar: () => import('../../components/enVivo/herramientas/Flujo.jsx') },
  laboratorio: { nombre: 'Laboratorio', inicial: () => inicialDelLaboratorio(), cargar: () => import('../../components/enVivo/herramientas/Laboratorio.jsx') },
  calculadora: { nombre: 'Calculadora', cargar: () => import('../../components/enVivo/herramientas/Calculadora.jsx') },
  apunte: { nombre: 'Apunte', cargar: () => import('../../components/enVivo/herramientas/Apunte.jsx') },
  repaso: { nombre: 'Repaso en grupo', cargar: () => import('../../components/enVivo/herramientas/Repaso.jsx') },
  // Opened only from a summary or a course («Llevar a la sesión»), not from the table's menu.
  resumen: { nombre: 'Resumen', cargar: () => import('../../components/enVivo/herramientas/Resumen.jsx') },
  materia: { nombre: 'Materia', cargar: () => import('../../components/enVivo/herramientas/Materia.jsx') },
};

export const TIPOS = Object.keys(HERRAMIENTAS);
