import { useEffect, useRef, useState } from 'react';
import { igualA, lista, n } from '../../../lib/calculadoras/decir';

// What the two graphers share (graficadora.jsx and graficadora-3d.jsx): how a number is written on the sheet, and
// the pieces of the board and of the foot of the drawing that are the same in both.

export const entrada = { type: 'text', inputMode: 'text', autoComplete: 'off', autoCapitalize: 'off', spellCheck: 'false' };

// ---------- Numbers on the sheet ----------
export { igualA, lista, n };
/** «2 funciones y 1 ecuación»: how many things of each kind are drawn. `nombres`: { kind: [one, many] }. */
export function cuenta(trazos, nombres) {
  const cuantos = new Map();
  for (const t of trazos) cuantos.set(t.tipo, (cuantos.get(t.tipo) ?? 0) + 1);
  return lista([...cuantos].map(([tipo, c]) => `${c} ${nombres[tipo][c === 1 ? 0 : 1]}`));
}

/** The last board that could be drawn. While a field has a mistake the sheet keeps what it had, so the page doesn't
 * jump on every key and the buttons of the drawing stay at hand. */
export function useUltimoBueno(m) {
  const [bueno, setBueno] = useState(m.error ? null : m);
  if (!m.error && m !== bueno) setBueno(m);
  return m.error ? bueno : m;
}

// ---------- The board ----------
/** «x de −5 a 5», two short fields in one line. */
export function Entre({ id, nombre, decir, desde, hasta, alDesde, alHasta, malDesde, malHasta, errorId, vacio, ancho = 4.25 }) {
  const campo = (sufijo, valor, alCambiar, mal, cual) => (
    <input
      {...entrada}
      id={`${id}-${sufijo}`}
      className="pz-dato__control"
      style={{ '--ancho': `${ancho}rem` }}
      value={valor}
      maxLength={24}
      placeholder={vacio}
      aria-label={cual === 'comienzo' ? `${nombre} de, ${decir}, comienzo` : `a, ${decir}, final`}
      aria-invalid={mal || undefined}
      aria-describedby={mal ? errorId : undefined}
      onChange={(ev) => alCambiar(ev.target.value)}
    />
  );
  return (
    <div className="pz-dato">
      <span className="pz-dato__nombre" aria-hidden="true">{`${nombre} de`}</span>
      {campo('a', desde, alDesde, malDesde, 'comienzo')}
      <span className="pz-dato__nombre" aria-hidden="true">
        a
      </span>
      {campo('b', hasta, alHasta, malHasta, 'final')}
    </div>
  );
}

/** An equation, written whole with its =. */
export function Ecuacion({ id, valor, alCambiar, invalido, errorId }) {
  return (
    <div className="pz-formula">
      <label className="gr-trazo__rotulo" htmlFor={id}>
        Ecuación
      </label>
      <input
        {...entrada}
        id={id}
        className="pz-formula__control"
        value={valor}
        maxLength={200}
        aria-invalid={invalido || undefined}
        aria-describedby={invalido ? errorId : undefined}
        onChange={(ev) => alCambiar(ev.target.value)}
      />
    </div>
  );
}

/** The way out of one thing of the board. `renglon`: its place, since two of a kind are called the same. */
export function Borrar({ queEs, renglon, alBorrar }) {
  return (
    <button type="button" className="gr-trazo__borrar" aria-label={`Borrar ${queEs}, renglón ${renglon}`} onClick={alBorrar}>
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  );
}

/** What the board does with its lines: add one, delete one and bring the last deleted one back. Deleting leaves the
 * focus on «Deshacer el borrado», which says what happened and takes it back. */
export function useRenglones(estado, setEstado, tope, nuevoTrazo) {
  const [recien, setRecien] = useState(null);
  const [borrado, setBorrado] = useState(null);
  const lleno = estado.trazos.length >= tope;
  return {
    recien,
    lleno,
    // The line deleted last, to tell one deletion from the next.
    borrado: borrado?.trazo.id ?? null,
    agregar(tipo) {
      if (lleno) return;
      const nuevo = Math.max(0, ...estado.trazos.map((t) => t.id)) + 1;
      setEstado((e) => ({ ...e, trazos: [...e.trazos, { id: nuevo, ...nuevoTrazo(tipo) }] }));
      setRecien(nuevo);
      setBorrado(null);
    },
    borrar(idTrazo) {
      const en = estado.trazos.findIndex((t) => t.id === idTrazo);
      if (en < 0) return;
      setBorrado({ trazo: estado.trazos[en], en });
      setRecien(null);
      setEstado((e) => ({ ...e, trazos: e.trazos.filter((t) => t.id !== idTrazo) }));
    },
    deshacer() {
      if (!borrado) return;
      setEstado((e) => {
        const trazos = [...e.trazos];
        trazos.splice(Math.min(borrado.en, trazos.length), 0, borrado.trazo);
        return { ...e, trazos };
      });
      setRecien(borrado.trazo.id);
      setBorrado(null);
    },
    olvidar: () => setBorrado(null),
  };
}

/** It takes the focus as it appears, once: the delete button the focus was on is gone. */
function Deshacer({ alTocar }) {
  const boton = useRef(null);
  useEffect(() => {
    boton.current?.focus();
  }, []);
  return (
    <button type="button" className="ejemplos__boton" ref={boton} onClick={alTocar}>
      Deshacer el borrado
    </button>
  );
}

/** The chalk buttons that add one more thing to draw, and the one that brings back the last one deleted. */
export function Sumar({ id, caja, tipos, nombres, lleno, hay, alSumar, alDeshacer, claveDeshacer }) {
  return (
    <div className="gr-sumar" ref={caja}>
      <p className="ejemplos__titulo" id={id}>
        {hay ? 'Sumar' : 'Sumá algo para dibujar'}
      </p>
      <ul className="ejemplos__lista" aria-labelledby={id}>
        {tipos.map((tipo) => (
          <li key={tipo}>
            <button type="button" className="ejemplos__boton" aria-disabled={lleno || undefined} onClick={() => alSumar(tipo)}>
              {nombres[tipo]}
            </button>
          </li>
        ))}
        {alDeshacer && (
          <li>
            <Deshacer key={claveDeshacer} alTocar={alDeshacer} />
          </li>
        )}
      </ul>
    </div>
  );
}

// ---------- The foot of the drawing ----------
const ICONOS = {
  menos: 'M5 12h14',
  mas: 'M5 12h14M12 5v14',
  izquierda: 'M14 6l-6 6 6 6',
  derecha: 'M10 6l6 6-6 6',
  arriba: 'M6 14l6-6 6 6',
  abajo: 'M6 10l6 6 6-6',
};

/** A round button under the drawing, with a sign, or a long one with its words. */
export function Mando({ nombre, icono, alTocar, apagado }) {
  if (!icono) {
    return (
      <button type="button" className="gr-mando gr-mando--texto" aria-disabled={apagado || undefined} onClick={alTocar}>
        {nombre}
      </button>
    );
  }
  return (
    <button type="button" className="gr-mando" aria-label={nombre} aria-disabled={apagado || undefined} onClick={alTocar}>
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d={ICONOS[icono]} />
      </svg>
    </button>
  );
}
