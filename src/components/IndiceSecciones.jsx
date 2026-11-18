import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { sinMovimiento } from '../lib/movimiento';
import './indice.css';

// From this width of the page, in rem, the index fits in the empty room to the left of the content (indice.css says the
// same with `@container pagina`). In rem of the page, not a media query: it follows the letter size (html[data-letra]).
const AL_COSTADO_REM = 100;

const alCostado = () => {
  const pagina = document.getElementById('contenido');
  const ancho = pagina ? pagina.getBoundingClientRect().width : window.innerWidth;
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  return ancho / rem >= AL_COSTADO_REM;
};

/** Whether the index goes to the left of the content, fixed while the page goes down, or folded above the search. */
export function useIndiceAlCostado() {
  return useSyncExternalStore(
    (avisar) => {
      window.addEventListener('resize', avisar);
      // Configuración changes the letter size without a reload.
      const letra = new MutationObserver(avisar);
      letra.observe(document.documentElement, { attributes: true, attributeFilter: ['data-letra'] });
      return () => {
        window.removeEventListener('resize', avisar);
        letra.disconnect();
      };
    },
    alCostado,
    () => false,
  );
}

const quieto = () => sinMovimiento() || ['reducido', 'ninguno'].includes(document.documentElement.dataset.movimiento);
const altoCabecera = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--alto-cabecera')) || 0;

/** The entry being read: the last section whose block is in the upper third of the screen, under the bar on top (so a
 * title that went up past that line marks its section); a Classroom one only with no section there. Right after a
 * touch on the index it's the one touched, until the page stops going there. */
function useLeyendo(entradas) {
  const [leyendo, setLeyendo] = useState(null);
  const lista = useRef(entradas);
  const fija = useRef(null);
  const firma = entradas.map((e) => `${e.clave} ${e.destino}`).join('|');
  useLayoutEffect(() => {
    lista.current = entradas;
  });

  useEffect(() => {
    if (!('IntersectionObserver' in window)) return undefined;
    const vigiladas = lista.current
      .map((e) => ({ clave: e.clave, classroom: Boolean(e.classroom), el: document.getElementById(e.destino)?.closest('section, details') }))
      .filter((v) => v.el);
    const adentro = new Set();
    const io = new IntersectionObserver((registros) => {
      for (const r of registros) {
        const v = vigiladas.find((x) => x.el === r.target);
        if (v && r.isIntersecting) adentro.add(v.clave);
        else if (v) adentro.delete(v.clave);
      }
      if (fija.current) return;
      const ahi = vigiladas.filter((v) => adentro.has(v.clave));
      const elegida = ahi.findLast((v) => !v.classroom) ?? ahi.findLast((v) => v.classroom);
      if (elegida) setLeyendo(elegida.clave);
      // Back above the first section: none is being read yet, and the first one is marked.
      else if (vigiladas[0].el.getBoundingClientRect().top > (registros[0].rootBounds?.bottom ?? Infinity)) setLeyendo(null);
    }, { rootMargin: `-${Math.round(altoCabecera() + 16)}px 0px -70% 0px` });
    for (const v of vigiladas) io.observe(v.el);
    return () => io.disconnect();
  }, [firma]);

  useEffect(() => () => fija.current?.soltar(), []);

  const fijar = (clave) => {
    fija.current?.soltar();
    setLeyendo(clave);
    const soltar = () => {
      clearTimeout(reloj);
      window.removeEventListener('scrollend', soltar);
      if (fija.current?.soltar === soltar) fija.current = null;
    };
    const reloj = setTimeout(soltar, 1200);
    window.addEventListener('scrollend', soltar);
    fija.current = { soltar };
  };
  return [leyendo, fijar];
}

/**
 * The titles of the sections of a course, to go straight to one. Nothing of what they have inside.
 * `secciones` and `classroom`: { clave, nombre, destino (the id of the title that gets the focus) }, in the order of
 * the page. `onIr(entrada)` opens what has to be open before going there. `alCostado`: to the left of the content,
 * fixed while the page goes down; if not, folded under «Ir a una sección», which closes once one is chosen.
 * `vacio`: what it says with no section (a filter left none); null says nothing.
 */
export default function IndiceSecciones({ secciones, classroom = [], alCostado = false, onIr, vacio = 'Ninguna con este filtro.' }) {
  const todas = [...secciones, ...classroom];
  const [leyendo, fijar] = useLeyendo(todas);
  const plegado = useRef(null);
  const actual = todas.some((e) => e.clave === leyendo) ? leyendo : todas[0]?.clave;

  const ir = (e, entrada) => {
    // A new tab or window does what the browser does.
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    if (plegado.current) plegado.current.open = false;
    onIr?.(entrada);
    fijar(entrada.clave);
    requestAnimationFrame(() => {
      const titulo = document.getElementById(entrada.destino);
      if (!titulo) return;
      titulo.focus({ preventScroll: true });
      titulo.scrollIntoView({ block: 'start', behavior: quieto() ? 'auto' : 'smooth' });
    });
  };

  const enlaces = (lista, props) => (
    <ul className="indice__lista" {...props}>
      {lista.map((entrada) => (
        <li key={entrada.clave}>
          <a className="indice__enlace" href={`#${entrada.destino}`} title={entrada.nombre} aria-current={entrada.clave === actual ? 'true' : undefined} onClick={(e) => ir(e, entrada)}>
            <span className="indice__texto">{entrada.nombre}</span>
          </a>
        </li>
      ))}
    </ul>
  );

  const nav = (
    <nav className={alCostado ? 'indice indice--costado' : 'indice'} aria-label="Secciones de la materia">
      {alCostado && <p className="indice__titulo" aria-hidden="true">Secciones</p>}
      {secciones.length ? enlaces(secciones) : vacio && <p className="indice__nada">{vacio}</p>}
      {classroom.length > 0 && (
        <>
          <p className="indice__titulo indice__grupo" id="indice-classroom">Classroom</p>
          {enlaces(classroom, { 'aria-labelledby': 'indice-classroom' })}
        </>
      )}
    </nav>
  );
  if (alCostado) return nav;
  return (
    <details ref={plegado} className="panel indice-plegable">
      <summary>Ir a una sección</summary>
      {nav}
    </details>
  );
}
