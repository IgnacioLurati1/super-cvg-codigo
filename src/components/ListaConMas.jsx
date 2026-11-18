import { useLayoutEffect, useRef, useState } from 'react';
import './listaConMas.css';

// A long list shows its first rows and a button for the next ones: a section of a course, the stream or a topic of
// Classroom.
export const PASO = 10;

/**
 * The rows that show: the first `limite` that count, each with the ones that hang from it (`cuenta(item)` false: an
 * attachment right under its message). Never fewer than needed to keep the rows of `fijos` (by `clave`): the one with
 * the focus, or one that just arrived. `faltan`: how many that count are left. Pure, so it can be tested alone.
 */
export function cortar(items, limite, { cuenta = () => true, fijos = [], clave = (i) => i.id } = {}) {
  let grupo = -1;
  const grupos = items.map((i, n) => (n === 0 || cuenta(i) ? ++grupo : grupo));
  const total = grupo + 1;
  const quiere = new Set(fijos);
  let hasta = Math.min(limite, total);
  items.forEach((i, n) => {
    if (quiere.has(clave(i))) hasta = Math.max(hasta, grupos[n] + 1);
  });
  return { visibles: items.filter((_, n) => grupos[n] < hasta), faltan: total - hasta };
}

/**
 * A list (`<ul>`) of `items`, `render(item)` each row (exactly one `<li>`: the row with the focus is found by its
 * place), that shows `paso` of them and «Ver 10 más» for the next ones. The row with the focus stays even if it moves past the ones on screen (Subir, Bajar), and so do the ones
 * of `fijos`. The focus goes to the first row that comes in. `nombre`: what the list is, for screen readers.
 */
export default function ListaConMas({ items, render, nombre, paso = PASO, cuenta, clave = (i) => i.id, fijos = [], className = 'lista' }) {
  const [limite, setLimite] = useState(paso);
  const [foco, setFoco] = useState(null);
  const lista = useRef(null);
  const enfocarDesde = useRef(null);
  const { visibles, faltan } = cortar(items, limite, { cuenta, clave, fijos: foco === null ? fijos : [...fijos, foco] });

  useLayoutEffect(() => {
    const n = enfocarDesde.current;
    if (n === null) return;
    enfocarDesde.current = null;
    // A row with nothing to press (something of the campus this reader can't open) takes the focus itself.
    const fila = lista.current?.children[n];
    const destino = fila?.querySelector('a[href], button:not([disabled])') ?? fila;
    if (destino === fila && fila) fila.tabIndex = -1;
    destino?.focus();
  });

  // The row that has the focus, by its key.
  const alEnfocar = (e) => {
    let fila = e.target;
    while (fila && fila.parentElement !== lista.current) fila = fila.parentElement;
    const item = fila ? visibles[[...lista.current.children].indexOf(fila)] : null;
    if (item && clave(item) !== foco) setFoco(clave(item));
  };

  // The visible ones are always the first: the ones that count among them, and `paso` more.
  const mas = () => {
    enfocarDesde.current = visibles.length;
    setLimite(visibles.filter((i, n) => n === 0 || !cuenta || cuenta(i)).length + paso);
  };

  let texto = `Ver ${paso} más`;
  if (faltan === 1) texto = 'Ver el que queda';
  else if (faltan <= paso) texto = `Ver los ${faltan} que quedan`;

  return (
    <>
      <ul ref={lista} className={className} aria-label={nombre} onFocus={alEnfocar}>{visibles.map((i) => render(i))}</ul>
      {faltan > 0 && (
        <div className="lista__mas">
          <button type="button" className="boton boton--secundario boton--chico" onClick={mas}>
            {texto}
            {nombre && <span className="solo-lectores"> de {nombre}</span>}
            {faltan > paso && <span className="solo-lectores">, quedan {faltan}</span>}
          </button>
          {faltan > paso && <span className="lista__quedan" aria-hidden="true">Quedan {faltan}</span>}
        </div>
      )}
    </>
  );
}
