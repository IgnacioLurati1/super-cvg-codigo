import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { abrirCampana, sacarNotificaciones, sePuedeSacar, useCampana } from '../lib/campana';
import { CAMPUS } from '../lib/moodle';
import { esNueva, haceCuanto, porDia } from '../lib/notificaciones';
import { Cargando, ErrorConReintento } from './Filas';
import { BotonSacar, Sacada } from './SacarNotificacion';
import Simbolo from './Simbolo';
import './campana.css';

const numeroCorto = (n) => (n > 99 ? '99+' : String(n));
// Rings once, from its top: the swing gets smaller each way.
const SUENA = [[0, 0], [14, 0.18], [-11, 0.38], [6, 0.58], [-3, 0.78], [0, 1]].map(([g, offset]) => ({ transform: `rotate(${g}deg)`, offset, easing: 'ease-in-out' }));
const FECHA = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

// Under the bell, inside the header: from the bell's right edge, and never out of the row. Where it doesn't fit, a sheet
// as wide as the header, like the folded menu. With the menu on the left it opens beside the column (Layout.css), and
// grows from the bell's height.
function ubicar(panel, boton) {
  if (!panel || !boton) return;
  panel.removeAttribute('data-hoja');
  panel.style.left = '';
  if (panel.closest('.cabecera[data-lateral]')) {
    const b = boton.getBoundingClientRect();
    panel.style.setProperty('--desde-y', `${Math.max(0, b.top + b.height / 2 - panel.getBoundingClientRect().top)}px`);
    return;
  }
  const fila = panel.offsetParent;
  if (!fila) return;
  const estilo = getComputedStyle(fila);
  const izquierda = parseFloat(estilo.paddingLeft) || 0;
  const derecha = parseFloat(estilo.paddingRight) || 0;
  const ancho = panel.offsetWidth;
  if (ancho >= fila.clientWidth - izquierda - derecha - 1) {
    panel.setAttribute('data-hoja', '');
    return;
  }
  const caja = fila.getBoundingClientRect();
  const b = boton.getBoundingClientRect();
  const desde = Math.min(Math.max(izquierda, b.right - caja.left - ancho), fila.clientWidth - derecha - ancho);
  panel.style.left = `${desde}px`;
  // It grows from the bell.
  panel.style.setProperty('--desde-x', `${b.left + b.width / 2 - caja.left - desde}px`);
}

function Notificacion({ n, nueva, ahora, alIr }) {
  const datos = [n.materia?.nombre, n.autor].filter(Boolean).join(', ');
  const contenido = (
    <>
      <Simbolo id={n.materia?.id} nombre={n.materia?.nombre} sinMateria="campana" />
      <span className="campana__texto">
        <span className="campana__titulo">
          {nueva && <span className="solo-lectores">Nueva. </span>}
          <span className={nueva ? 'marcado' : undefined}>{n.titulo}</span>
        </span>
        {n.cuerpo && <span className="campana__resumen">{n.cuerpo}</span>}
        <span className="campana__dato">
          {datos && `${datos}, `}
          <time dateTime={new Date(n.cuando * 1000).toISOString()} title={FECHA.format(new Date(n.cuando * 1000))}>{haceCuanto(n.cuando, ahora)}</time>
        </span>
        {!n.ruta && n.campus && (
          <span className="campana__campus">Abrir en el campus<span className="solo-lectores">, se abre en otra pestaña</span></span>
        )}
      </span>
    </>
  );
  if (n.ruta) return <Link className="campana__fila" to={n.ruta} onClick={alIr} data-nueva={nueva || undefined}>{contenido}</Link>;
  if (n.campus) return <a className="campana__fila" href={n.campus} target="_blank" rel="noreferrer" data-nueva={nueva || undefined}>{contenido}</a>;
  return <div className="campana__fila" data-nueva={nueva || undefined}>{contenido}</div>;
}

/** The bell of the header: the campus notifications, the new ones marked. It never marks one as read in the campus:
 * opening it leaves them seen only in this browser (campana.js). Without notifications in the campus, it isn't there. */
export default function Campana({ alAbrir }) {
  const c = useCampana();
  const [abierta, setAbierta] = useState(false);
  const [saliendo, setSaliendo] = useState(false);
  const [vistoAntes, setVistoAntes] = useState(0);
  const [ahora, setAhora] = useState(0);
  // Taken out while it is open: in their place, the way back. `todasFuera`: the ones «Sacar todas» took.
  const [recien, setRecien] = useState([]);
  const [todasFuera, setTodasFuera] = useState(null);
  const lugar = useRef(null);
  const boton = useRef(null);
  const panel = useRef(null);
  const salida = useRef(null);
  const dibujo = useRef(null);
  const timbre = useRef(c.timbre);
  const id = useId();

  // Rings when something new comes in while the page is open (campana.js counts it), never when it appears.
  useEffect(() => {
    const antes = timbre.current;
    timbre.current = c.timbre;
    if (c.timbre <= antes || !dibujo.current?.animate) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    dibujo.current.animate(SUENA, 520);
  }, [c.timbre]);

  const cerrar = useCallback((devolverFoco) => {
    setAbierta(false);
    setSaliendo(true);
    setRecien([]);
    setTodasFuera(null);
    clearTimeout(salida.current);
    salida.current = setTimeout(() => setSaliendo(false), 150);
    if (devolverFoco) boton.current?.focus();
  }, []);

  const abrir = () => {
    clearTimeout(salida.current);
    setSaliendo(false);
    // What was new until now stays marked while it is open; the next time, it is seen.
    setVistoAntes(c.visto);
    setAhora(Date.now());
    setAbierta(true);
    alAbrir?.();
    abrirCampana();
    // Opened again while it was leaving: the same panel, back in its place.
    if (panel.current) {
      ubicar(panel.current, boton.current);
      panel.current.focus({ preventScroll: true });
    }
  };

  const ponerPanel = useCallback((el) => {
    panel.current = el;
    if (!el) return;
    ubicar(el, boton.current);
    el.focus({ preventScroll: true });
  }, []);

  // While it is open: a touch outside closes it, and it follows the header when the window changes.
  useEffect(() => {
    if (!abierta) return undefined;
    const fuera = (e) => {
      if (!lugar.current?.contains(e.target)) cerrar(false);
    };
    const reubicar = () => ubicar(panel.current, boton.current);
    document.addEventListener('pointerdown', fuera);
    window.addEventListener('resize', reubicar);
    return () => {
      document.removeEventListener('pointerdown', fuera);
      window.removeEventListener('resize', reubicar);
    };
  }, [abierta, cerrar]);

  useEffect(() => {
    const pendiente = salida;
    return () => clearTimeout(pendiente.current);
  }, []);

  if (!c.disponible) return null;

  const alTeclear = (e) => {
    if (e.key !== 'Escape' || !abierta) return;
    e.stopPropagation();
    cerrar(true);
  };
  // Leaving it with the keyboard closes it.
  const alSalir = (e) => {
    if (abierta && e.relatedTarget && !lugar.current?.contains(e.relatedTarget)) cerrar(false);
  };

  const nombre = c.sinVer > 0 ? `Notificaciones, ${c.sinVer} ${c.sinVer === 1 ? 'nueva' : 'nuevas'}` : 'Notificaciones';
  const todas = c.todas ?? [];
  const lista = todas.filter((n) => !c.sacadas.has(n.id) || recien.includes(n.id));
  const paraSacar = lista.filter((n) => sePuedeSacar(n) && !c.sacadas.has(n.id));
  const visible = abierta || saliendo;
  // Put back, the focus goes to its button again, or to the list.
  const enfocar = (id) => requestAnimationFrame(() => (panel.current?.querySelector(`[data-sacar="${id}"]`) ?? panel.current)?.focus({ preventScroll: true }));
  const sacar = (n) => {
    setRecien((r) => [...r, n.id]);
    sacarNotificaciones([n.id]);
  };
  const volver = (n) => {
    sacarNotificaciones([n.id], true);
    setRecien((r) => r.filter((id) => id !== n.id));
    enfocar(n.id);
  };
  const sacarTodas = () => {
    const ids = paraSacar.map((n) => n.id);
    setTodasFuera(ids);
    setRecien([]);
    sacarNotificaciones(ids);
  };
  const volverTodas = () => {
    sacarNotificaciones(todasFuera, true);
    setTodasFuera(null);
    enfocar(null);
  };

  const cuantasFuera = todasFuera?.length ?? 0;
  const avisoDeTodas = todasFuera && (
    <Sacada
      como="div"
      texto={lista.length ? `Sacaste ${cuantasFuera === 1 ? 'una notificación' : `${cuantasFuera} notificaciones`}.` : 'Sacaste todas las notificaciones.'}
      onDeshacer={volverTodas}
    />
  );

  let cuerpo;
  if (c.error && !c.lista) cuerpo = <ErrorConReintento texto={c.error} recargar={abrirCampana} />;
  else if (!c.lista) cuerpo = <Cargando texto="Buscando tus notificaciones" cuantas={3} />;
  else if (!lista.length) {
    let vacia = 'No tenés notificaciones.';
    if (todas.length) vacia = 'Sacaste todas. Las nuevas van a aparecer acá.';
    else if (c.filtradas) vacia = 'No tenés avisos de los que elegiste ver.';
    cuerpo = avisoDeTodas || <p className="campana__vacia">{vacia}</p>;
  }
  else {
    cuerpo = porDia(lista, ahora).map((dia) => (
      <div key={dia.clave} className="campana__dia">
        <h3 className="campana__fecha">{dia.titulo}</h3>
        <ul className="campana__lista">
          {dia.items.map((n) => (c.sacadas.has(n.id)
            ? <Sacada key={n.clave} texto={`Sacaste «${n.titulo}».`} onDeshacer={() => volver(n)} />
            : (
              <li key={n.clave} className={sePuedeSacar(n) ? 'con-sacar' : undefined}>
                <Notificacion n={n} nueva={esNueva(n, vistoAntes)} ahora={ahora} alIr={() => cerrar(false)} />
                {sePuedeSacar(n) && <BotonSacar id={n.id} titulo={n.titulo} onSacar={() => sacar(n)} />}
              </li>
            )))}
        </ul>
      </div>
    ));
    if (avisoDeTodas) cuerpo = <>{avisoDeTodas}{cuerpo}</>;
  }

  return (
    <div ref={lugar} className="campana" onKeyDown={alTeclear} onBlur={alSalir}>
      <button
        ref={boton}
        type="button"
        className="campana__boton"
        aria-expanded={abierta}
        aria-controls={visible ? id : undefined}
        aria-label={nombre}
        title={nombre}
        onClick={() => (abierta ? cerrar(false) : abrir())}
      >
        <span className="campana__dibujo">
          <svg ref={dibujo} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 8 2.5 8h-17S6 15 6 9zM10 20.5a2.2 2.2 0 0 0 4 0" />
          </svg>
          {c.sinVer > 0 && <span className="campana__numero" aria-hidden="true">{numeroCorto(c.sinVer)}</span>}
        </span>
      </button>
      {visible && (
        <div
          ref={ponerPanel}
          id={id}
          className="campana__panel"
          role="dialog"
          aria-labelledby={`${id}-titulo`}
          tabIndex={-1}
          data-saliendo={!abierta || undefined}
        >
          <div className="campana__cabeza">
            <h2 id={`${id}-titulo`} className="campana__encabezado">Notificaciones</h2>
            {paraSacar.length > 1 && !todasFuera && <button type="button" className="campana__sacar-todas" onClick={sacarTodas}>Sacar todas</button>}
          </div>
          <div className="campana__cuerpo" aria-busy={c.cargando || undefined}>{cuerpo}</div>
          <div className="campana__pie">
            <Link className="campana__todas" to="/configuracion#avisos" onClick={() => cerrar(false)}>Elegir qué avisos ves</Link>
            <a className="campana__todas" href={`${CAMPUS}/message/output/popup/notifications.php`} target="_blank" rel="noreferrer">
              Ver todas en el campus<span className="solo-lectores">, se abre en otra pestaña</span>
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
