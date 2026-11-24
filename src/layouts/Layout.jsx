import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Link, Outlet, useLocation, useMatch, useNavigate, useNavigation } from 'react-router-dom';
import { SITIO } from '../../sitio.config.js';
import Campana from '../components/Campana';
import CargandoPantalla from '../components/CargandoPantalla';
import Paleta, { BotonPaleta } from '../components/Paleta';
import SinInternet from '../components/SinInternet';
import { PreviaProvider } from '../components/Previa';
import { useAdelantar } from '../lib/ahorro';
import { useAjustes } from '../lib/ajustes';
import { useAtajosGlobales } from '../lib/atajos';
import { useBarraDerecha } from '../lib/barraDerecha';
import { leerAlAbrir } from '../lib/consultron/alAbrir';
import { useEscritorio } from '../lib/consultron/panel';
import { disenoEnPrueba, useDisenoEnPrueba } from '../lib/enPrueba';
import { olvidarLaboratorio } from '../lib/laboratorio/pendiente';
import { usePaginaQuieta } from '../lib/quieto';
import { usePorMandarDeLaSesion } from '../lib/mensajesPorMandar';
import { fijarUsuario } from '../lib/mio';
import { cerrarSesion, useToken } from '../lib/sesion';
import { olvidarPestanasSysacad, olvidarSysacad, preguntarSysacad } from '../lib/sysacad';
import { useSinLeer } from '../lib/useSinLeer';
import { useSesionEnVivo } from '../lib/enVivo/estado';
import { Entrada, MasDelMenu, PANTALLAS_DEL_MENU } from './Menu';
import './Layout.css';
import '../pages/panel.css';
import '../pages/propio.css';

// Consultron in a corner of every screen, with a computer: it comes apart, only then.
const Flotante = lazy(() => import('../components/consultron/Flotante'));
// The way back to a live session, away from its table. The session itself comes apart, only when there is one.
const VolverAEnVivo = lazy(() => import('../components/enVivo/Volver'));
const HABIA_EN_VIVO = 'cl.envivo';
// A design tried from Diseños, on every screen until it is used or left: it comes apart, only then.
const BarraDePrueba = lazy(() => import('../components/BarraDePrueba'));

// The header folds into «Menú» when its links don't fit: it depends on the width, the letter size and the
// text, so it is measured instead of guessed with a breakpoint. Measured while unfolded (what it needs),
// then compared with the room there is. A change in the brand's width means the letter changed: while folded,
// what it needs grows in the same proportion, so it doesn't unfold for a frame just to measure. `forma` (the style and
// the screens of the menu) changes what it needs: it measures again from scratch.
function useCabeceraCompacta(fila, activa, cerrarMenu, forma) {
  const [compacta, setCompacta] = useState(false);
  const estado = useRef(false);

  useLayoutEffect(() => {
    const el = fila.current;
    if (!el || !activa) return undefined;
    const marca = el.querySelector('.cabecera__marca');
    const menu = el.querySelector('.cabecera__menu');
    // While it measures from scratch (on loading, or when the menu changes) the header may unfold for a frame and fold
    // again: its links stay hidden and nothing slides until it settles (Layout.css, data-midiendo).
    const cabecera = el.closest('.cabecera');
    let reloj = 0;
    cabecera?.setAttribute('data-midiendo', '');
    const listo = () => {
      cancelAnimationFrame(reloj);
      reloj = requestAnimationFrame(() => {
        reloj = requestAnimationFrame(() => cabecera?.removeAttribute('data-midiendo'));
      });
    };
    const porLasDudas = setTimeout(listo, 1000);
    let necesita = 0;
    let anchoMarca = marca.offsetWidth;
    const poner = (valor) => {
      estado.current = valor;
      setCompacta(valor);
    };
    // Sum of what is shown plus the gaps, against the content box: scrollWidth only grows once the items
    // have already eaten the side padding.
    const ocupa = () => {
      const hijos = [...el.children].filter((n) => n.offsetWidth > 0);
      const hueco = parseFloat(getComputedStyle(el).columnGap) || 0;
      return hijos.reduce((suma, n) => suma + n.getBoundingClientRect().width, 0) + hueco * Math.max(hijos.length - 1, 0);
    };
    const lugar = () => {
      const estilo = getComputedStyle(el);
      return el.clientWidth - parseFloat(estilo.paddingLeft) - parseFloat(estilo.paddingRight);
    };
    const medir = () => {
      if (marca.offsetWidth !== anchoMarca) {
        if (anchoMarca > 0) necesita = (necesita * marca.offsetWidth) / anchoMarca;
        anchoMarca = marca.offsetWidth;
      }
      if (!estado.current) {
        const total = ocupa();
        if (total > lugar() + 0.5) {
          necesita = total;
          poner(true);
        }
        listo();
      } else if (lugar() >= necesita) {
        poner(false);
        // Unfolding closes the menu, so it doesn't come back open the next time it folds.
        cerrarMenu(false);
      }
    };
    const observador = new ResizeObserver(medir);
    [el, marca, menu].forEach((n) => n && observador.observe(n));
    return () => {
      observador.disconnect();
      clearTimeout(porLasDudas);
      cancelAnimationFrame(reloj);
    };
  }, [fila, activa, cerrarMenu, forma]);

  return compacta;
}

// The menu on the left needs a wide screen: below this, the bar on top (Layout.css, with the same width).
export const ANCHO_PARA_COSTADO = '(min-width: 1024px)';
const suscribirAncho = (avisar) => {
  const consulta = window.matchMedia(ANCHO_PARA_COSTADO);
  consulta.addEventListener('change', avisar);
  return () => consulta.removeEventListener('change', avisar);
};
const useAncha = () => useSyncExternalStore(suscribirAncho, () => window.matchMedia(ANCHO_PARA_COSTADO).matches, () => false);

export default function Layout() {
  const [abierto, setAbierto] = useState(false);
  const token = useToken();
  // A screen still downloading its code (CargandoPantalla shows it).
  const cargandoPantalla = useNavigation().state !== 'idle';
  const navegar = useNavigate();
  const enLaboratorio = Boolean(useMatch('/laboratorio'));
  const enPrueba = useDisenoEnPrueba();
  // Consultron's screen is a chat the height of the window, like the lab.
  const enConsultron = Boolean(useMatch('/consultron'));
  // How the menu looks and where each screen goes, as the student left it in Configuración.
  const { estilo, lugares, orden, posicion, alineacion, ancho } = useAjustes().menu;
  const enOrden = orden.map((c) => PANTALLAS_DEL_MENU.find((m) => m.clave === c)).filter(Boolean);
  const aLaVista = enOrden.filter((m) => (lugares[m.clave] ?? 'vista') === 'vista');
  const enMas = enOrden.filter((m) => lugares[m.clave] === 'mas');
  // The menu as a column on the left: chosen, on a wide screen, with a session (without one there's only the name).
  const ancha = useAncha();
  const lateral = posicion === 'izquierda' && ancha && Boolean(token);
  // On the left, the page keeps the place it has with the menu on top while the column leaves it room (Layout.css).
  const principal = useRef(null);
  usePaginaQuieta(principal, lateral);
  // «Más» goes after the screens and before the envelope and the gear; folded, at the end.
  const deUso = new Set(['mensajes', 'configuracion']);
  const fila = useRef(null);
  const marca = useRef(null);
  const botonMenu = useRef(null);
  // On the left it never folds: the column has room for every screen, one under the other.
  const compacta = useCabeceraCompacta(fila, Boolean(token) && !lateral, setAbierto, `${estilo} ${JSON.stringify(lugares)} ${orden.join()}`) && !lateral;
  const menuAbierto = abierto && compacta && Boolean(token);
  const sinLeer = useSinLeer(token);
  // The messages that wait for the signal go even outside Mensajes (mensajesPorMandar.js).
  usePorMandarDeLaSesion(token);
  // Folded, only the bell and the envelope (when in sight) stay in the row; the rest goes in «Menú», the quick menu and
  // the gear too. «Menú» says something is unread only when Mensajes is inside it, in «Más». With Mensajes hidden from
  // the menu, nothing says it.
  const avisaMensajes = sinLeer > 0 && lugares.mensajes === 'mas';
  const deUsoALaVista = aLaVista.filter((m) => deUso.has(m.clave));
  const sobreEnLaFila = compacta ? deUsoALaVista.filter((m) => m.clave === 'mensajes') : [];
  useAtajosGlobales(Boolean(token));
  const escritorio = useEscritorio();
  const enVivo = useSesionEnVivo();
  const { pathname } = useLocation();
  useBarraDerecha();
  // After a reload, back into the live session this tab was in (its code is only in this tab).
  useEffect(() => {
    let habia = false;
    try {
      habia = Boolean(sessionStorage.getItem(HABIA_EN_VIVO));
    } catch {
      // Private mode.
    }
    if (token && habia) import('../lib/enVivo/conexion').then((m) => m.volverSiHabia()).catch(() => {});
  }, [token]);
  // Consultron, already on this computer: it starts loading as the page opens, slowly (motor.js), unless the student
  // turned that off or is saving data (ahorro.js): then, on its screen. The rest of Consultron comes only then.
  useAdelantar(() => {
    if (leerAlAbrir() === 'a-mano') return undefined;
    const espera = setTimeout(() => {
      import('../lib/consultron/motor').then((m) => m.precalentar()).catch(() => {});
    }, 800);
    return () => clearTimeout(espera);
  }, Boolean(token), token);

  const alTeclear = (e) => {
    if (e.key !== 'Escape' || !menuAbierto) return;
    setAbierto(false);
    botonMenu.current?.focus();
  };

  // What one student added must not show while the next one is coming in. The Sysacad finals leave memory too, and
  // are asked for again when someone comes in. Leaving a session also tells Sysacad Lindo to delete its copies of the
  // tabs of Sysacad: the next one to use this browser does not see them.
  const habiaSesion = useRef(Boolean(token));
  useEffect(() => {
    if (!token) {
      fijarUsuario(null);
      if (habiaSesion.current) olvidarPestanasSysacad();
      olvidarSysacad();
      olvidarLaboratorio();
      // The design being tried goes with the session: the next one sees their own.
      if (disenoEnPrueba()) import('../lib/disenos').then((m) => m.terminarPrueba()).catch(() => {});
      // Leaving the site leaves the live session too.
      import('../lib/enVivo/conexion').then((m) => m.salir()).catch(() => {});
    } else if (!habiaSesion.current) {
      preguntarSysacad();
    }
    habiaSesion.current = Boolean(token);
  }, [token]);

  const salir = () => {
    cerrarSesion();
    setAbierto(false);
    navegar('/');
    // The button goes away with the session: the focus stays in the header.
    marca.current?.focus();
  };

  return (
    <div className="sitio" data-con-menu={token ? true : undefined}>
      <a className="saltar" href="#contenido">Ir al contenido</a>
      <header className="cabecera" data-compacta={compacta || undefined} data-lateral={lateral || undefined} data-estilo={estilo} data-alineacion={lateral ? undefined : alineacion} data-ancho={lateral ? undefined : ancho} onKeyDown={alTeclear}>
        <div ref={fila} className="contenedor cabecera__fila">
          <Link ref={marca} to="/" className="cabecera__marca">{SITIO.nombre}</Link>
          {token && (
            <>
              {!compacta && <BotonPaleta />}
              {/* Out of the menu, so it stays at hand when the header folds. Opening it closes the menu. */}
              <Campana alAbrir={() => setAbierto(false)} />
              {sobreEnLaFila.length > 0 && (
                <div className="cabecera__fijos">
                  {sobreEnLaFila.map((m) => <Entrada key={m.clave} m={m} estilo="solo-iconos" sinLeer={sinLeer} onIr={() => setAbierto(false)} />)}
                </div>
              )}
              <button ref={botonMenu} type="button" className="cabecera__boton" aria-expanded={menuAbierto} aria-controls="menu" aria-label={avisaMensajes ? 'Menú, tenés mensajes sin leer' : 'Menú'} title="Menú" onClick={() => setAbierto((a) => !a)}>
                <svg className="cabecera__hamburguesa" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
                {/* With Mensajes inside «Más», a dot says there is something to read, and the name says it too, since the
                    envelope is out of reach until the menu opens. */}
                {avisaMensajes && <span className="cabecera__punto" aria-hidden="true" />}
              </button>
              <nav id="menu" className="cabecera__menu" data-abierto={menuAbierto || undefined} aria-label="Principal">
                {compacta && <BotonPaleta alTocar={() => { setAbierto(false); botonMenu.current?.focus(); }} />}
                {aLaVista.filter((m) => !deUso.has(m.clave)).map((m) => <Entrada key={m.clave} m={m} estilo={estilo} sinLeer={sinLeer} onIr={() => setAbierto(false)} />)}
                {!compacta && <MasDelMenu entradas={enMas} estilo={estilo} sinLeer={sinLeer} lateral={lateral} onIr={() => setAbierto(false)} />}
                {/* On the left, the envelope, the gear and Salir go to the bottom of the column. */}
                {lateral && <span className="cabecera__resorte" aria-hidden="true" />}
                {deUsoALaVista.filter((m) => !sobreEnLaFila.includes(m)).map((m) => <Entrada key={m.clave} m={m} estilo={estilo} sinLeer={sinLeer} lateral={lateral} onIr={() => setAbierto(false)} />)}
                {compacta && <MasDelMenu entradas={enMas} estilo={estilo} sinLeer={sinLeer} compacta onIr={() => setAbierto(false)} />}
                <button type="button" className="cabecera__salir" onClick={salir}>Salir</button>
              </nav>
            </>
          )}
        </div>
      </header>
      <CargandoPantalla />
      <main ref={principal} id="contenido" tabIndex={-1} aria-busy={cargandoPantalla || undefined}>
        {/* What shows is what was kept, without internet or with the campus down (sinInternet.js). Inside main, so the
            menu on the left keeps its grid. */}
        {token && <SinInternet />}
        <PreviaProvider>
          <Outlet />
          {token && <Paleta />}
          {token && enVivo && pathname !== '/en-vivo' && (
            <Suspense fallback={null}>
              <VolverAEnVivo sesion={enVivo.sesion} />
            </Suspense>
          )}
          {token && escritorio && lugares.consultron !== 'oculta' && (
            <Suspense fallback={null}>
              <Flotante />
            </Suspense>
          )}
          {token && enPrueba && (
            <Suspense fallback={null}>
              <BarraDePrueba diseno={enPrueba} conHueco={!enLaboratorio && !enConsultron} />
            </Suspense>
          )}
        </PreviaProvider>
      </main>
      {/* The lab and Consultron are one screen, the height of the window: without the footer, nothing scrolls the page. */}
      {!enLaboratorio && !enConsultron && (
        <footer className="pie">
          <div className="contenedor pie__fila">
            <p>Herramienta no oficial, sin relación con UTN. <span className="pie__enlaces"><Link to="/preguntas">Preguntas frecuentes</Link> <Link to="/privacidad">Tu privacidad</Link> <Link to="/novedades">Notas del parche</Link> <Link to="/opinar">Opinar</Link></span></p>
            <p>
              <span lang="en">Powered by</span> <a href="https://lutastudios.com/" target="_blank" rel="noreferrer">Luta Studios<span className="solo-lectores"> Se abre en otra pestaña.</span></a>
            </p>
          </div>
        </footer>
      )}
    </div>
  );
}
