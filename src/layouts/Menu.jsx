import { useEffect, useId, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { SIEMPRE_OSCUROS, useAjustes, useDeNoche } from '../lib/ajustes';

// The screens of the header, in the order they came. Configuración (ajustes.js) says how it looks, where each one goes
// (in sight, inside «Más» or nowhere) and their order, which is also the one of Alt and a number (atajos.js).
export const PANTALLAS_DEL_MENU = [
  { clave: 'hoy', a: '/', texto: 'Hoy' },
  { clave: 'materias', a: '/materias', texto: 'Materias' },
  { clave: 'calendario', a: '/calendario', texto: 'Calendario' },
  { clave: 'buscar', a: '/buscar', texto: 'Buscar' },
  { clave: 'resumenes', a: '/resumenes', texto: 'Resúmenes' },
  { clave: 'horario', a: '/horario', texto: 'Horario' },
  { clave: 'sysacad', a: '/sysacad', texto: 'Sysacad' },
  { clave: 'carrera', a: '/carrera', texto: 'Tu carrera' },
  { clave: 'mensajes', a: '/mensajes', texto: 'Mensajes' },
  { clave: 'configuracion', a: '/configuracion', texto: 'Configuración' },
  { clave: 'laboratorio', a: '/laboratorio', texto: 'Laboratorio' },
  { clave: 'calculadoras', a: '/calculadoras', texto: 'Calculadoras' },
  { clave: 'repaso', a: '/repaso', texto: 'Repaso' },
  { clave: 'consultron', a: '/consultron', texto: 'Consultron' },
  { clave: 'envivo', a: '/en-vivo', texto: 'En vivo' },
  { clave: 'disenos', a: '/disenos', texto: 'Diseños' },
];

// Mensajes and Configuración always go with their drawing; the rest, with the styles that have them.
const CON_DIBUJO_SIEMPRE = new Set(['mensajes', 'configuracion']);

const DIBUJOS = {
  hoy: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
    </>
  ),
  materias: <path d="M4 4.5h4v15H4zM8 4.5h4v15H8zM13.2 5.6l3.9-1 3.6 14.5-3.9 1z" />,
  calendario: (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4M8 13.5h.01M12 13.5h.01M16 13.5h.01M8 17h.01M12 17h.01" />
    </>
  ),
  buscar: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.4 15.4l5.1 5.1" />
    </>
  ),
  resumenes: <path d="M6 3h8.5L19 7.5V21H6zM14 3v5h5M9 12h7M9 15.5h7M9 19h4" />,
  horario: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  // The copies of Sysacad: a sheet over another.
  sysacad: <path d="M8.5 3.5h10v14h-10zM5.5 6.5v14h10M11.5 7.5h4M11.5 10.5h4M11.5 13.5h2.5" />,
  // Tu carrera: steps going up.
  carrera: <path d="M3.5 19.5h5v-5h5v-5h5v-5h2M3.5 19.5h17" />,
  mensajes: (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="2" />
      <path d="M3.8 7l8.2 6.2L20.2 7" />
    </>
  ),
  configuracion: (
    <>
      <path d="M19.03 10.43L21.46 10.35L21.46 13.65L19.03 13.57L18.08 15.86L19.85 17.52L17.52 19.85L15.86 18.08L13.57 19.03L13.65 21.46L10.35 21.46L10.43 19.03L8.14 18.08L6.48 19.85L4.15 17.52L5.92 15.86L4.97 13.57L2.54 13.65L2.54 10.35L4.97 10.43L5.92 8.14L4.15 6.48L6.48 4.15L8.14 5.92L10.43 4.97L10.35 2.54L13.65 2.54L13.57 4.97L15.86 5.92L17.52 4.15L19.85 6.48L18.08 8.14z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  envivo: (
    <>
      <circle cx="8" cy="9" r="3" />
      <circle cx="16" cy="9" r="3" />
      <path d="M2.5 19.5c.6-3 2.8-5 5.5-5s4.9 2 5.5 5M13.8 14.8c.7-.2 1.4-.3 2.2-.3 2.7 0 4.9 2 5.5 5" />
    </>
  ),
  laboratorio: <path d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" />,
  // Diseños: a painter's palette, with three dots of paint.
  disenos: <path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.1 0 1.7-.7 1.7-1.6 0-.5-.2-.8-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.7-1.6 1.6-1.6h1.9a4.3 4.3 0 0 0 4.3-4.3c0-3.9-3.8-7.1-8.5-7.1zM7.5 12h.01M9.5 8h.01M14.5 8h.01" />,
  // Repaso: two index cards, one over the other.
  repaso: <path d="M7.5 4.5h13v10h-13zM3.5 8.5v11h13M10.5 8h7M10.5 11h4.5" />,
  consultron: <path d="M12 4.6V7M13.3 3.3a1.3 1.3 0 1 1-2.6 0 1.3 1.3 0 0 1 2.6 0zM8 7h8a3.5 3.5 0 0 1 3.5 3.5V15a3.5 3.5 0 0 1-3.5 3.5H8A3.5 3.5 0 0 1 4.5 15v-4.5A3.5 3.5 0 0 1 8 7zM2.5 11.5v3M21.5 11.5v3M9.5 11.6v.9M14.5 11.6v.9M10 15.3c1.2.8 2.8.8 4 0" />,
  calculadoras: (
    <>
      <rect x="5" y="2.5" width="14" height="19" rx="2" />
      <path d="M8 6.5h8v3H8zM8.5 13h.01M12 13h.01M15.5 13h.01M8.5 16.5h.01M12 16.5h.01M15.5 16.5h.01" />
    </>
  ),
};

// Hoy at night: the moon instead of the sun (the hours of «Según la hora», or 20 to 7). Always with Batman, a night style.
const LUNA = <path d="M19.5 14.6A8 8 0 0 1 9.4 4.5a8 8 0 1 0 10.1 10.1z" />;

/** The drawing of a screen of the menu. */
export function IconoMenu({ nombre }) {
  const deNoche = useDeNoche();
  const siempreNoche = SIEMPRE_OSCUROS.includes(useAjustes().estilo);
  return (
    <svg className="icono-menu" viewBox="0 0 24 24" aria-hidden="true" focusable="false" strokeLinecap="round">
      {nombre === 'hoy' && (deNoche || siempreNoche) ? LUNA : DIBUJOS[nombre]}
    </svg>
  );
}

const numeroCorto = (n) => (n > 99 ? '99+' : String(n));

/** Whether `m` is the screen on view. A course of one's own lives under Materias, even if its address doesn't. */
export const esLaActual = (m, ruta) => (m.a === '/' ? ruta === '/' : ruta.startsWith(m.a) || (m.clave === 'materias' && ruta.startsWith('/propias/')));

/**
 * A screen of the menu. In the row, as the style says: its name, its drawing and its name, or only its drawing (with
 * the name for screen readers and on hover; the folded menu shows it). In the list of «Más» (`enLista`), drawing and
 * name, so they line up. Mensajes carries the unread conversations on its envelope, and says how many in its name.
 * In the column on the left (`lateral`) there's room: the envelope and the gear say their names too, except with only
 * the drawings.
 */
export function Entrada({ m, estilo, sinLeer = 0, enLista = false, lateral = false, onIr }) {
  const ruta = useLocation().pathname;
  const dibujo = enLista || estilo === 'iconos' || estilo === 'solo-iconos';
  const conDibujo = dibujo || CON_DIBUJO_SIEMPRE.has(m.clave);
  const soloDibujo = !enLista && conDibujo && (estilo === 'solo-iconos' || (CON_DIBUJO_SIEMPRE.has(m.clave) && estilo !== 'iconos' && !lateral));
  const nombre = m.clave === 'mensajes' && sinLeer > 0 ? `Mensajes, ${sinLeer} sin leer` : m.texto;
  const clases = [
    conDibujo && 'cabecera__icono',
    soloDibujo && 'cabecera__icono--solo',
    m.clave === 'mensajes' && 'cabecera__mensajes',
    m.clave === 'configuracion' && 'cabecera__ajustes',
  ].filter(Boolean).join(' ') || undefined;
  const contenido = (
    <>
      {conDibujo && (
        <span className="cabecera__dibujo">
          <IconoMenu nombre={m.clave} />
          {m.clave === 'mensajes' && sinLeer > 0 && <span className="cabecera__numero" aria-hidden="true">{numeroCorto(sinLeer)}</span>}
        </span>
      )}
      <span className={soloDibujo ? 'cabecera__icono-texto' : undefined}>{m.texto}</span>
    </>
  );
  // The name in one piece: from the visible «Mensajes» and a hidden span, Chrome reads «Mensajes , 1 sin leer».
  const props = { className: clases, title: soloDibujo ? nombre : undefined, 'aria-label': nombre !== m.texto ? nombre : undefined, onClick: onIr };
  if (m.clave === 'materias' && ruta.startsWith('/propias/')) return <Link to={m.a} aria-current="page" {...props}>{contenido}</Link>;
  return <NavLink to={m.a} end={m.a === '/'} {...props}>{contenido}</NavLink>;
}

/**
 * «Más»: the screens the student keeps out of sight, one touch away. A button that opens their list under it (closed
 * by Esc, a touch outside, leaving it with the keyboard or going somewhere). In the folded menu, the same screens under
 * a «Más» of their own, closed until it is touched. `punto`: Mensajes is in it and has something unread.
 * In the column on the left (`lateral`) the list opens under its button, in the column: it stays open until «Más» is
 * touched again, also going from one of its screens to another.
 */
export function MasDelMenu({ entradas, estilo, sinLeer, compacta, lateral = false, onIr }) {
  const ruta = useLocation().pathname;
  const [abierto, setAbierto] = useState(false);
  // Going to another page closes it (also coming back with Atrás to the one where it was opened).
  const [rutaVista, setRutaVista] = useState(ruta);
  if (rutaVista !== ruta) {
    setRutaVista(ruta);
    if (!lateral) setAbierto(false);
  }
  const lugar = useRef(null);
  const boton = useRef(null);
  const lista = useRef(null);
  const id = useId();
  const punto = sinLeer > 0 && entradas.some((m) => m.clave === 'mensajes');
  const actual = entradas.find((m) => esLaActual(m, ruta));
  // What only shows (the screen on view is inside, something unread), said too.
  const nombre = ['Más', actual && `estás en ${actual.texto}`, punto && 'tenés mensajes sin leer'].filter(Boolean).join(', ');

  useEffect(() => {
    if (!abierto || lateral || compacta) return undefined;
    const fuera = (e) => {
      if (!lugar.current?.contains(e.target)) setAbierto(false);
    };
    document.addEventListener('pointerdown', fuera);
    return () => document.removeEventListener('pointerdown', fuera);
  }, [abierto, lateral, compacta]);

  if (!entradas.length) return null;
  // The list goes away with the focus in it: back to «Más», also when the screen chosen is the one on view. In the
  // column it stays: the page takes the focus, as with any link.
  const ir = () => {
    if (lateral) return onIr?.();
    setAbierto(false);
    boton.current?.focus();
    onIr?.();
  };
  // Folded, under a «Más» of their own that opens them in the folded menu itself. It starts closed.
  if (compacta) {
    return (
      <div className="cabecera__grupo-mas">
        <button
          type="button"
          className="cabecera__mas-boton cabecera__grupo-boton"
          aria-expanded={abierto}
          aria-controls={abierto ? id : undefined}
          aria-label={nombre !== 'Más' ? nombre : undefined}
          data-actual={actual ? true : undefined}
          onClick={() => setAbierto(!abierto)}
        >
          Más
          <svg className="cabecera__mas-flecha" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 9l6 6 6-6" /></svg>
          {punto && <span className="cabecera__punto" aria-hidden="true" />}
        </button>
        {abierto && (
          <div id={id} className="cabecera__grupo-lista" role="group" aria-label="Más">
            {entradas.map((m) => <Entrada key={m.clave} m={m} estilo={estilo} sinLeer={sinLeer} onIr={onIr} />)}
          </div>
        )}
      </div>
    );
  }

  const enlaces = () => [...(lista.current?.querySelectorAll('a') ?? [])];
  const enfocar = (n) => {
    const todos = enlaces();
    todos[(n + todos.length) % todos.length]?.focus();
  };
  const alTeclear = (e) => {
    if (e.key === 'Escape' && abierto) {
      e.stopPropagation();
      setAbierto(false);
      boton.current?.focus();
      return;
    }
    // The arrows go through the list, as in a menu of the system; Tab works too.
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const dentro = enlaces().indexOf(document.activeElement);
    if (!abierto) {
      if (e.target !== boton.current) return;
      setAbierto(true);
      requestAnimationFrame(() => enfocar(e.key === 'ArrowDown' ? 0 : -1));
    } else enfocar(dentro === -1 ? (e.key === 'ArrowDown' ? 0 : -1) : dentro + (e.key === 'ArrowDown' ? 1 : -1));
    e.preventDefault();
  };
  // Leaving it with the keyboard closes it, except in the column.
  const alSalir = (e) => {
    if (abierto && !lateral && e.relatedTarget && !lugar.current?.contains(e.relatedTarget)) setAbierto(false);
  };

  return (
    <div ref={lugar} className="cabecera__mas" onKeyDown={alTeclear} onBlur={alSalir}>
      <button
        ref={boton}
        type="button"
        className="cabecera__mas-boton"
        aria-expanded={abierto}
        aria-controls={abierto ? id : undefined}
        aria-label={nombre !== 'Más' ? nombre : undefined}
        data-actual={actual ? true : undefined}
        onClick={() => setAbierto(!abierto)}
      >
        Más
        <svg className="cabecera__mas-flecha" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 9l6 6 6-6" /></svg>
        {punto && <span className="cabecera__punto" aria-hidden="true" />}
      </button>
      {abierto && (
        <ul ref={lista} id={id} className="cabecera__panel-mas">
          {entradas.map((m) => <li key={m.clave}><Entrada m={m} estilo={estilo} sinLeer={sinLeer} enLista={!lateral} lateral={lateral} onIr={ir} /></li>)}
        </ul>
      )}
    </div>
  );
}
