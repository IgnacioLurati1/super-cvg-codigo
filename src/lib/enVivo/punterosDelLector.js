import { leerPunto } from './resumenMesa';

// The pointers over an interactive HTML summary at the table (components/enVivo/herramientas/Resumen.jsx). It runs in El
// Santo Resumen's reader, of another origin (components/VisorResumen.jsx `LECTOR`): no pointer event of it reaches here,
// so the reader tells. A place is said as in resumenMesa.js (`puntoEn`), by the summary's content:
//   · `{ tipo: 'visor-puntero', punto }`: where this one points, or null when the pointer leaves;
//   · `{ tipo: 'soltar-puntero' }` goes to it when the pointer is heard on this page (the browser does not always tell a
//     frame of another origin that the pointer left it); it answers null after whatever it still had on its way;
//   · `{ tipo: 'ubicar-punteros', lista: [{ id, punto }] }` goes to it with the others' places;
//   · `{ tipo: 'visor-ubicados', lista: [{ id, x, y } | { id, fuera: true }] }`: where they land in its view.
// Untrusted: the summary's own scripts can send anything. An older reader sends none of these: nothing is drawn then.
// Small and pure, to be tested alone.

/** How many others go to the reader at once (the reader takes no more). */
export const MAX_PUNTEROS = 50;
// The numbers the others go by in the reader: never who they are.
const MAX_NUMERO = 999;
const LEJOS = 1e6;
const numero = (n) => Number.isInteger(n) && n >= 0 && n <= MAX_NUMERO;
const coordenada = (n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= LEJOS;

/** Message `visor-puntero`: undefined when it is not that one; else the place, checked by leerPunto, or null. */
export function punteroDicho(d) {
  if (!d || typeof d !== 'object' || d.tipo !== 'visor-puntero') return undefined;
  return leerPunto(d.punto);
}

/** Message `visor-ubicados`: undefined when it is not that one, null when its list doesn't read; else a Map of number to
 * { x, y } in the frame's view, only of those it places (`fuera` and entries that don't read are left out). */
export function ubicadosDichos(d) {
  if (!d || typeof d !== 'object' || d.tipo !== 'visor-ubicados') return undefined;
  if (!Array.isArray(d.lista) || d.lista.length > MAX_PUNTEROS) return null;
  const lugares = new Map();
  for (const u of d.lista) {
    if (u && typeof u === 'object' && numero(u.id) && u.fuera !== true && coordenada(u.x) && coordenada(u.y)) lugares.set(u.id, { x: u.x, y: u.y });
  }
  return lugares;
}

/** The `ubicar-punteros` message for the others in the tab (mesa.otros) who point somewhere in the summary. `numeros`
 * (person id to number) is the caller's for as long as the reader lives: one keeps their number, so a late answer still
 * lands on its owner. */
export function pedidoDeUbicar(otros, numeros) {
  const lista = [];
  for (const o of otros) {
    if (lista.length >= MAX_PUNTEROS) break;
    const punto = leerPunto(o?.h);
    if (!punto) continue;
    let n = numeros.get(o.id);
    if (n === undefined) {
      if (numeros.size > MAX_NUMERO) continue;
      n = numeros.size;
      numeros.set(o.id, n);
    }
    lista.push({ id: n, punto });
  }
  return { tipo: 'ubicar-punteros', lista };
}
