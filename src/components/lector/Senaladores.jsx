import { useId, useMemo, useRef, useState } from 'react';
import { MAX_NOMBRE_SENALADOR, MAX_SENALADORES } from '../../lib/lectura';
import './senaladores.css';

// The bookmarks of a PDF: the student marks pages to jump between them. Saved with the rest of the file (resaltados.js,
// lectura.js): only the page and when it was put.

/** The icon, drawn like the others of the bar (VisorPdf's Trazo): filled while the page has one. */
const Icono = () => <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 4h10v16.5l-5-4-5 4z" /></svg>;

/** The mark on a page and on its small one: a ribbon hanging from its top edge. */
export const Cinta = ({ className }) => <svg className={className} viewBox="0 0 14 20" aria-hidden="true" focusable="false"><path d="M0 0h14v20l-7-5-7 5z" /></svg>;

/** Which pages have one, and putting or taking off the one of a page. `alAvisar`: the reader's notice, for what could
 * not be saved. `anuncio` says what changed, for screen readers (the M key changes it with the focus elsewhere).
 * `notas`: where they are kept, { senalar, sacar, nombrar } (VisorPdf.jsx: the file's, or a live session's), or null. */
export function useSenaladores(notas, senaladores, pagina, alAvisar) {
  const senaladas = useMemo(() => new Set(senaladores.map((s) => s.pagina)), [senaladores]);
  const [anuncio, setAnuncio] = useState('');
  const sacar = (n) => {
    if (!notas?.sacar(n)) return;
    setAnuncio(`Sacaste el señalador de la página ${n}.`);
  };
  const alternar = (n = pagina) => {
    if (!notas) return;
    if (senaladas.has(n)) {
      sacar(n);
      return;
    }
    if (!notas.senalar(n)) {
      alAvisar(senaladores.length >= MAX_SENALADORES
        ? `Llegaste a los ${MAX_SENALADORES} señaladores de este archivo. Sacá alguno para poner otro.`
        : 'No se pudo guardar el señalador. Puede que el navegador no tenga más lugar.');
      return;
    }
    alAvisar('');
    setAnuncio(`Señalaste la página ${n}.`);
  };
  const nombrar = (n, nombre) => {
    if (!notas) return;
    if (notas.nombrar(n, nombre)) alAvisar('');
    else alAvisar('No se pudo guardar el nombre. Puede que el navegador no tenga más lugar.');
  };
  return { senaladas, senalada: senaladas.has(pagina), alternar, sacar, nombrar, anuncio };
}

/** The button of the bar: pressed while the page being read has one. */
export function BotonSenalar({ senalada, anuncio, atajo, onClick }) {
  return (
    <>
      <button type="button" className="lector__boton lector__senalar" aria-pressed={senalada} aria-keyshortcuts={atajo} title="Señalar esta página" onClick={onClick}>
        <Icono /><span className="solo-lectores">Señalar esta página</span>
      </button>
      <span className="solo-lectores" role="status">{anuncio}</span>
    </>
  );
}

/** How a bookmark reads: its name and its page, or only its page. A named one says both in its button's name (spans
 * in a flex row would read «name , página»). */
const Rotulo = ({ s }) => (s.nombre
  ? <><span className="lector__senalada-texto">{s.nombre}</span><span className="lector__senalada-pag">{s.pagina}</span></>
  : <>Página {s.pagina}</>);

/** Its name, written in place of it: Enter or leaving keeps it, Esc leaves it as it was. Empty, it says «Página N». */
function CampoNombre({ s, onListo }) {
  const terminado = useRef(false);
  const terminar = (nombre) => {
    if (terminado.current) return;
    terminado.current = true;
    onListo(nombre);
  };
  return (
    <input
      className="lector__senalada-nombre"
      defaultValue={s.nombre ?? ''}
      placeholder={`Página ${s.pagina}`}
      aria-label={`Nombre del señalador de la página ${s.pagina}`}
      maxLength={MAX_NOMBRE_SENALADOR}
      enterKeyHint="done"
      autoComplete="off"
      autoFocus
      onFocus={(e) => e.target.select()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          terminar(e.currentTarget.value);
        } else if (e.key === 'Escape') {
          // Only the field: the reader, and the sheet it is in, stay open.
          e.preventDefault();
          e.stopPropagation();
          terminar(null);
        }
      }}
      onBlur={(e) => terminar(e.target.value)}
    />
  );
}

/** The list in the panel: each one goes to its page or comes off. The one of the page being read, clicked again (or F2
 * on any), gets a name, like a file in the computer's folders. Taken off, the focus goes to the next one. */
export function ListaSenaladores({ senaladores, pagina, onIr, onSacar, onNombrar }) {
  const id = useId();
  const lista = useRef(null);
  const [editando, setEditando] = useState(null);
  if (!senaladores.length) return null;
  const enfocar = (n) => requestAnimationFrame(() => lista.current?.querySelector(`[data-pagina="${n}"] .lector__senalada-ir`)?.focus());
  const sacar = (n, i) => {
    const otra = senaladores[i + 1]?.pagina ?? senaladores[i - 1]?.pagina;
    const panel = lista.current?.closest('[role="tabpanel"]');
    onSacar(n);
    requestAnimationFrame(() => {
      const ir = otra && lista.current?.querySelector(`[data-pagina="${otra}"] .lector__senalada-ir`);
      if (ir) ir.focus();
      else panel?.focus({ preventScroll: true });
    });
  };
  const listo = (s, nombre) => {
    setEditando(null);
    if (nombre !== null && onNombrar) onNombrar(s.pagina, nombre);
    // Back on its button, unless the click that ended it went somewhere else.
    requestAnimationFrame(() => {
      const ahora = document.activeElement;
      if (!ahora || ahora === document.body || !ahora.isConnected) enfocar(s.pagina);
    });
  };
  const nombrable = Boolean(onNombrar);
  return (
    <section className="lector__senaladas" aria-labelledby={id}>
      <h3 id={id} className="lector__notas-pagina">Páginas señaladas</h3>
      <ul ref={lista}>
        {senaladores.map((s, i) => (
          <li key={s.pagina} className="lector__senalada" data-pagina={s.pagina} data-editando={editando === s.pagina || undefined}>
            {editando === s.pagina ? (
              <CampoNombre s={s} onListo={(nombre) => listo(s, nombre)} />
            ) : (
              <button
                type="button"
                className="lector__senalada-ir"
                aria-label={s.nombre ? `${s.nombre}, página ${s.pagina}` : undefined}
                aria-current={s.pagina === pagina ? 'page' : undefined}
                aria-keyshortcuts={nombrable ? 'F2' : undefined}
                title={nombrable && s.pagina === pagina ? 'Tocalo de nuevo para cambiarle el nombre' : undefined}
                onClick={() => (nombrable && s.pagina === pagina ? setEditando(s.pagina) : onIr(s.pagina))}
                onKeyDown={(e) => {
                  if (e.key !== 'F2' || !nombrable) return;
                  e.preventDefault();
                  setEditando(s.pagina);
                }}
              >
                <Icono /><Rotulo s={s} />
              </button>
            )}
            <button type="button" className="lector__senalada-sacar" aria-label={`Sacar el señalador de la página ${s.pagina}`} title="Sacar el señalador" onClick={() => sacar(s.pagina, i)}>
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 7l10 10M17 7L7 17" /></svg>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
