import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { coincidencias } from '../lib/coincidir';
import './combo.css';

// How many rows the list shows at once: past that, typing narrows it.
const MAXIMO = 50;

function Partes({ partes }) {
  return partes.map((p, i) => (p.marca ? <mark key={i}>{p.texto}</mark> : <span key={i}>{p.texto}</span>));
}

/** A field to pick one of many by typing part of its name (an ARIA 1.2 combobox with its listbox). It goes inside
 * Campo, which gives it its label. Focusing or touching it opens the whole list; typing narrows it, by loose words in
 * any order and without minding capitals or accents, and marks what matched. Arrows, Home and End move in the list,
 * Enter picks, Escape closes and goes back to what was chosen.
 *   <Campo etiqueta="Materia">
 *     <Combo opciones={[{ valor, nombre }]} valor={slug} onCambiar={setSlug} todas="Todas las materias"
 *       nombreLista="Materias" vacio="No hay materias con ese nombre." limpiar="Quitar la materia" />
 *   </Campo>
 * `valor` is '' when none is chosen. `todas`, if given, is the first option and chooses none. */
export default function Combo({ opciones, valor, onCambiar, todas, nombreLista, vacio, limpiar, id, ...resto }) {
  const propio = useId();
  const idCampo = id ?? propio;
  const idLista = `${idCampo}-lista`;
  const idOpcion = (i) => `${idCampo}-opcion-${i}`;
  const campo = useRef(null);
  const lista = useRef(null);
  const conTeclado = useRef(false);
  const sinAbrir = useRef(false);
  const recienEnfocado = useRef(false);
  const [abierto, setAbierto] = useState(false);
  // What was typed since it opened. Nothing yet: the whole list.
  const [escrito, setEscrito] = useState(null);
  // The option that Enter would take, by its value and not its place: the list changes as one types.
  const [marcada, setMarcada] = useState(null);

  const elegida = opciones.find((o) => o.valor === valor) ?? null;
  const filtro = escrito ?? '';
  const halladas = useMemo(() => coincidencias(opciones, filtro), [opciones, filtro]);
  const hayFiltro = filtro.trim().length > 0;
  const filas = [
    ...(todas ? [{ valor: '', nombre: todas, partes: [{ texto: todas, marca: false }], todas: true }] : []),
    ...halladas.slice(0, MAXIMO),
  ];
  const primera = todas ? 1 : 0;
  let activa = marcada === null ? -1 : filas.findIndex((f) => f.valor === marcada);
  // Typing, Enter takes the first that matches.
  if (activa === -1 && hayFiltro && filas.length > primera) activa = primera;

  useEffect(() => {
    if (!abierto || !conTeclado.current) return;
    conTeclado.current = false;
    lista.current?.children[activa]?.scrollIntoView?.({ block: 'nearest' });
  }, [abierto, activa]);

  const abrir = () => {
    setAbierto(true);
    setEscrito(null);
    setMarcada(valor);
    conTeclado.current = true;
  };
  const cerrar = () => {
    setAbierto(false);
    setEscrito(null);
    setMarcada(null);
  };
  const elegir = (fila) => {
    cerrar();
    if (fila.valor !== valor) onCambiar(fila.valor);
  };
  const mover = (aca) => {
    if (!filas.length) return;
    conTeclado.current = true;
    setMarcada(filas[(aca + filas.length) % filas.length].valor);
  };

  const alTeclear = (e) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!abierto) abrir();
      else if (e.key === 'ArrowDown') mover(activa === -1 ? 0 : activa + 1);
      else mover(activa === -1 ? -1 : activa - 1);
    } else if ((e.key === 'Home' || e.key === 'End') && abierto && !e.shiftKey) {
      e.preventDefault();
      mover(e.key === 'Home' ? 0 : -1);
    } else if (e.key === 'Enter' && abierto) {
      e.preventDefault();
      if (activa >= 0) elegir(filas[activa]);
      else cerrar();
    } else if (e.key === 'Escape' && abierto) {
      // Only the list closes, not a sheet around it.
      e.preventDefault();
      e.stopPropagation();
      cerrar();
    } else if (e.key === 'Tab' && abierto) {
      cerrar();
    }
  };

  const alEnfocar = (e) => {
    if (sinAbrir.current) {
      sinAbrir.current = false;
      return;
    }
    abrir();
    // What is written goes away with the first letter typed. The press that brought the focus does not undo it.
    const el = e.currentTarget;
    el.setSelectionRange(0, el.value.length);
    recienEnfocado.current = true;
  };

  const quitar = () => {
    onCambiar('');
    // The button goes away with the choice: the focus goes back to the field, without opening the list.
    sinAbrir.current = true;
    campo.current?.focus();
  };

  let estado = '';
  if (abierto && hayFiltro) estado = !halladas.length ? vacio : halladas.length === 1 ? 'Una coincidencia' : `${halladas.length} coincidencias`;
  let nota = '';
  if (hayFiltro && !halladas.length) nota = vacio;
  else if (halladas.length > MAXIMO) nota = 'Escribí para ver más';

  return (
    <div className="combo">
      <div className="combo__caja">
        <input
          {...resto}
          ref={campo}
          id={idCampo}
          className="campo__control combo__campo"
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={abierto}
          aria-controls={idLista}
          aria-activedescendant={abierto && activa >= 0 ? idOpcion(activa) : undefined}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck="false"
          enterKeyHint="done"
          value={escrito ?? elegida?.nombre ?? todas ?? ''}
          onChange={(e) => {
            setEscrito(e.target.value);
            setAbierto(true);
            setMarcada(null);
          }}
          onFocus={alEnfocar}
          onMouseUp={(e) => {
            if (!recienEnfocado.current) return;
            recienEnfocado.current = false;
            e.preventDefault();
          }}
          onClick={() => { if (!abierto) abrir(); }}
          onBlur={() => {
            recienEnfocado.current = false;
            cerrar();
          }}
          onKeyDown={(e) => {
            recienEnfocado.current = false;
            alTeclear(e);
          }}
        />
        {elegida && (
          <button type="button" className="combo__limpiar" onClick={quitar}>
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18" /></svg>
            <span className="solo-lectores">{limpiar}</span>
          </button>
        )}
        <svg className="combo__flecha" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 9l6 6 6-6" /></svg>
      </div>
      {/* The focus never leaves the field: a press on the list does not take it. */}
      <div className="combo__desplegable" hidden={!abierto} onMouseDown={(e) => e.preventDefault()}>
        <ul ref={lista} id={idLista} className="combo__lista" role="listbox" aria-label={nombreLista}>
          {filas.map((f, i) => (
            <li
              key={f.todas ? '' : `v-${f.valor}`}
              id={idOpcion(i)}
              className={`combo__opcion${f.todas ? ' combo__opcion--todas' : ''}`}
              role="option"
              aria-selected={i === activa}
              data-elegida={f.valor === valor ? '' : undefined}
              onMouseMove={() => { if (i !== activa) setMarcada(f.valor); }}
              onClick={() => elegir(f)}
            >
              <svg className="combo__tilde" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
              <span><Partes partes={f.partes} /></span>
            </li>
          ))}
        </ul>
        {nota && <p className="combo__nota">{nota}</p>}
      </div>
      {/* Always in the page, even empty: a screen reader only announces changes in a region it already knew. */}
      <p className="solo-lectores" role="status">{estado}</p>
    </div>
  );
}
