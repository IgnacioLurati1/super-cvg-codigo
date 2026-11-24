import { useEffect, useId, useRef, useState } from 'react';
import { buscarEnAjustes, indiceDeAjustes } from '../lib/buscarAjustes';

// The search at the top of Configuración. The index is read from the page as the student types (lib/buscarAjustes.js);
// choosing a result opens its tab (`alIr`), brings it into view, gives its control the focus and marks it a moment.

const MARCA_MS = 1600;

export default function BuscarAjuste({ raiz, pestanas, pantallas, alIr }) {
  const [consulta, setConsulta] = useState('');
  const [activa, setActiva] = useState(0);
  const [abierta, setAbierta] = useState(false);
  const [filas, setFilas] = useState([]);
  const idLista = useId();
  const campo = useRef(null);
  const marcado = useRef(null);
  const idDe = (i) => `${idLista}-${i}`;

  const visibles = abierta ? filas : [];
  const i = Math.min(activa, Math.max(0, visibles.length - 1));

  useEffect(() => () => clearTimeout(marcado.current?.reloj), []);

  const elegir = (fila) => {
    if (!fila) return;
    setAbierta(false);
    alIr({ seccion: fila.seccion, pantalla: fila.pantalla });
    // Once its tab is open: into view, the focus, and the mark.
    requestAnimationFrame(() => {
      fila.el.scrollIntoView({ block: 'center' });
      fila.foco?.focus({ preventScroll: true });
      const antes = marcado.current;
      if (antes) {
        clearTimeout(antes.reloj);
        antes.el.removeAttribute('data-encontrado');
      }
      fila.el.setAttribute('data-encontrado', '');
      marcado.current = { el: fila.el, reloj: setTimeout(() => fila.el.removeAttribute('data-encontrado'), MARCA_MS) };
    });
  };

  const alTeclear = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!filas.length) return;
      e.preventDefault();
      if (!abierta) {
        setAbierta(true);
        setActiva(0);
        return;
      }
      setActiva((i + (e.key === 'ArrowDown' ? 1 : -1) + visibles.length) % visibles.length);
    } else if (e.key === 'Enter') {
      if (!visibles.length) return;
      e.preventDefault();
      elegir(visibles[i]);
    } else if (e.key === 'Escape') {
      if (!consulta) return;
      e.preventDefault();
      if (abierta && filas.length) setAbierta(false);
      else {
        setConsulta('');
        setFilas([]);
      }
    }
  };

  let estado = '';
  if (consulta.trim() && !filas.length) estado = 'No hay nada con eso en Configuración.';
  else if (abierta && filas.length) estado = filas.length === 1 ? 'Un resultado' : `${filas.length} resultados`;

  return (
    <div className="buscar-ajuste">
      <svg className="buscar-ajuste__lupa" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></svg>
      <input
        ref={campo}
        className="campo__control buscar-ajuste__campo"
        type="search"
        role="combobox"
        aria-label="Buscar en Configuración"
        placeholder="Buscar en Configuración"
        aria-autocomplete="list"
        aria-expanded={visibles.length > 0}
        aria-controls={idLista}
        aria-activedescendant={visibles.length ? idDe(i) : undefined}
        autoComplete="off"
        spellCheck="false"
        value={consulta}
        onChange={(e) => {
          setConsulta(e.target.value);
          // Read again with each word typed: what's on the page now, also what just appeared.
          setFilas(e.target.value.trim() && raiz.current ? buscarEnAjustes(indiceDeAjustes(raiz.current, { pestanas, pantallas }), e.target.value) : []);
          setActiva(0);
          setAbierta(true);
        }}
        onFocus={() => setAbierta(true)}
        onBlur={() => setAbierta(false)}
        onKeyDown={alTeclear}
      />
      <ul id={idLista} className="buscar-ajuste__lista" role="listbox" aria-label="Resultados" hidden={!visibles.length}>
        {visibles.map((fila, n) => (
          <li
            key={fila.clave}
            id={idDe(n)}
            className="buscar-ajuste__opcion"
            role="option"
            aria-selected={n === i}
            // The field keeps the focus while the mouse chooses.
            onMouseDown={(e) => e.preventDefault()}
            onMouseMove={() => n !== i && setActiva(n)}
            onClick={() => elegir(fila)}
          >
            <span className="buscar-ajuste__nombre">
              {fila.partes.map((p, k) => (p.marca ? <mark key={k}>{p.texto}</mark> : <span key={k}>{p.texto}</span>))}
              {fila.de && <span className="buscar-ajuste__de"> ({fila.de})</span>}
            </span>
            <span className="buscar-ajuste__donde">{fila.donde}</span>
          </li>
        ))}
      </ul>
      {/* Always in the page, even empty: a screen reader only announces changes in a region it already knew. */}
      <p className={consulta.trim() && !filas.length ? 'buscar-ajuste__estado' : 'solo-lectores'} role="status">{estado}</p>
    </div>
  );
}
