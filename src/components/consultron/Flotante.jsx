import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { IconoMenu } from '../../layouts/Menu';
import { useAdelantar } from '../../lib/ahorro';
import { RINCON_CONSULTRON, useAjustes } from '../../lib/ajustes';
import { revisarCompu } from '../../lib/consultron/compu';
import { materiaDeRuta } from '../../lib/consultron/donde';
import { cargarSiHaceFalta, revisar, sePuedePreguntar, usar, useConsultron } from '../../lib/consultron/motor';
import { usePermisosNube } from '../../lib/consultron/nube';
import { abrirPanel, cerrarPanel, usePanel, useSoloEnCaja } from '../../lib/consultron/panel';
import { useSesionEnVivo } from '../../lib/enVivo/estado';
import { Borde, BordeDeAlto, BotonesDeAlto, BotonesDeAncho, useAlto, useAncho } from './Ancho';
import Charla from './Charla';
import { Anuncio, Arranque } from './Modelo';
import './consultron.css';

// What the box shows only in one place, loaded apart: brought as that screen opens, before the box does, so the box
// doesn't change what it shows while it appears.
function traido(traer) {
  let listo = null;
  const pedir = () =>
    traer().then((c) => {
      listo = c;
      return c;
    });
  function Traido(props) {
    const [Listo, setListo] = useState(() => listo);
    const [error, setError] = useState(null);
    useEffect(() => {
      if (!Listo) pedir().then((c) => setListo(() => c), setError);
    }, [Listo]);
    if (error) throw error;
    return Listo ? <Listo {...props} /> : <p className="flotante__arranque">Cargando…</p>;
  }
  return { Traido, traer: () => (listo ? Promise.resolve(listo) : pedir()) };
}
// «Código», only in the lab: the agent that reads, proposes and runs (Codigo.jsx).
const codigo = traido(() => import('./Codigo').then((m) => m.default));
const Codigo = codigo.Traido;
// At the table of a live session, with Consultron only in its box (Configuración, «Aparición»): the session's thread,
// as at the side of the table.
const hilo = traido(() => import('../enVivo/ConsultronFlotante').then((m) => m.HiloEnCaja));
const HiloDeLaSesion = hilo.Traido;

// How long the box takes to appear (.flotante in consultron.css): what loads the model, which takes the video card and
// the disk, waits for it.
const APARECE_MS = 240;

// Consultron in a corner of every screen, with a computer: a button down on the right that opens a small chat, which
// goes to the whole screen and comes back. In a course's screen it looks first in that course. It isn't there in its own
// screen, nor if this browser can't run it.
// It stands over the page, which stays where it is. It's as wide and as tall as the student drags its left and top
// edges (Ancho.jsx), up to what the window leaves. In a calculator and in the lab it reads what the screen shows
// (pantalla.js).

// What the window keeps at its two sides, however wide it is dragged.
const MARGEN = 40;

// The screens it reads.
const LEE = /^\/(calculadoras\/[^/]+|laboratorio|carrera|repaso)(\/|$)/;

// Whether this browser can run it, looked at once per tab.
let compu = null;
// In the lab: 'codigo' (the agent, with Groq or Gemini), as it opens there, or 'preguntar' (the notes, with the model of
// the computer).
let modoElegido = 'codigo';

export default function Flotante() {
  const abierto = usePanel();
  const { estado } = useConsultron();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [puede, setPuede] = useState(compu);
  const boton = useRef(null);
  const panel = useRef(null);
  // Closed from the corner, the focus goes back to its button as soon as it's there.
  const volver = useRef(false);
  const estabaAbierto = useRef(false);
  const materia = materiaDeRuta(pathname);
  const enSuPantalla = pathname === '/consultron';
  // In the lab the agent works without the model of the computer: there it's there even if this browser can't run it.
  const enLab = /^\/laboratorio(\/|$)/.test(pathname);
  const [modo, setModo] = useState(modoElegido);
  const conCodigo = enLab && (modo === 'codigo' || puede === false);
  // At the table of a live session it's there only if it opens only here; then it's the session's thread, which Gemini
  // answers too.
  const vivo = useSesionEnVivo();
  const soloEnCaja = useSoloEnCaja();
  const enMesa = soloEnCaja && pathname === '/en-vivo' && Boolean(vivo?.sesion);
  const sinModelo = conCodigo || enMesa;
  const elegirModo = (m) => {
    modoElegido = m;
    setModo(m);
  };
  const listo = estado.fase === 'listo';
  // With a permission of Gemini on, it answers before the model is ready (nube.js).
  const preguntar = sePuedePreguntar(estado, usePermisosNube());
  const [ventana, setVentana] = useState(() => ({ ancho: window.innerWidth, alto: window.innerHeight }));
  useEffect(() => {
    const medir = () => setVentana({ ancho: window.innerWidth, alto: window.innerHeight });
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  }, []);
  const altura = useAlto({ ventana: ventana.alto, contenedor: () => document.body });
  // On the left (Configuración), its edge to drag is on its right.
  const aLaDerecha = useAjustes().consultronLado === 'izquierda';
  const anchura = useAncho({ fila: ventana.ancho, resto: MARGEN, contenedor: () => document.body, clave: 'anchoRincon', limites: RINCON_CONSULTRON, aLaDerecha });
  // In a window as narrow as a phone there's nothing to change.
  const conAncho = anchura.tope > RINCON_CONSULTRON.min;

  useEffect(() => {
    if (compu !== null) return undefined;
    let vivo = true;
    revisarCompu()
      .then((r) => r.puede)
      .catch(() => false)
      .then((si) => {
        compu = si;
        if (vivo) setPuede(si);
      });
    return () => {
      vivo = false;
    };
  }, []);
  // Saving data (ahorro.js), they come when the box opens.
  useAdelantar(() => {
    codigo.traer().catch(() => {});
  }, enLab);
  useAdelantar(() => {
    hilo.traer().catch(() => {});
  }, enMesa);
  // Open, it's in use: it checks the computer, and the model stays on the video card. After the box appeared: in use,
  // a model loading slowly in the background goes at full speed.
  useEffect(() => {
    if (!abierto || enSuPantalla || sinModelo) return undefined;
    let soltar = null;
    const espera = setTimeout(() => {
      revisar();
      soltar = usar();
    }, APARECE_MS);
    return () => {
      clearTimeout(espera);
      soltar?.();
    };
  }, [abierto, enSuPantalla, sinModelo]);
  useEffect(() => {
    if (!abierto || enSuPantalla || sinModelo || estado.fase !== 'bajado') return undefined;
    const espera = setTimeout(cargarSiHaceFalta, APARECE_MS);
    return () => clearTimeout(espera);
  }, [abierto, enSuPantalla, sinModelo, estado.fase]);
  // Opening it, the focus goes to where to write. While it gets ready, to its button or its title. When it gets ready
  // later, the focus moves only if it was in the panel or nowhere: someone writing in the page keeps their place.
  useEffect(() => {
    const recien = abierto && !estabaAbierto.current;
    estabaAbierto.current = abierto;
    if (!abierto || enSuPantalla || !panel.current) return;
    const donde = document.activeElement;
    if (!recien && donde && donde !== document.body && !panel.current.contains(donde)) return;
    (panel.current.querySelector('textarea') ?? panel.current.querySelector('.flotante__arranque .boton') ?? panel.current.querySelector('h2'))?.focus();
  }, [abierto, enSuPantalla, listo, preguntar, puede, enLab, conCodigo, enMesa]);
  useLayoutEffect(() => {
    if (abierto || !volver.current) return;
    volver.current = false;
    boton.current?.focus();
  }, [abierto]);

  // Also where the computer can't run the model: Gemini answers there (Ignacio, 22/11/2026), and the box offers it.
  if (enSuPantalla) return null;
  const cerrar = () => {
    volver.current = true;
    cerrarPanel();
  };
  const agrandar = () => navigate('/consultron', { state: { desde: pathname } });
  // Escape closes it, but not from a window opened over it (a PDF, a summary).
  const alTeclear = (e) => {
    if (e.key === 'Escape' && !e.target.closest('dialog, [role="dialog"]:not(.flotante)')) cerrar();
  };
  const cargando = estado.fase === 'preparando' || estado.fase === 'bajando';
  const nombre = cargando ? 'Consultron, cargando' : listo ? 'Consultron, listo' : 'Consultron';

  if (!abierto) {
    return (
      <button
        ref={boton}
        type="button"
        className="flotante__boton"
        aria-haspopup="dialog"
        data-cargando={cargando || undefined}
        data-listo={listo || undefined}
        data-en-mesa={enMesa || undefined}
        title={nombre}
        onClick={abrirPanel}
      >
        <IconoMenu nombre="consultron" />
        <span className="solo-lectores">{nombre}</span>
      </button>
    );
  }
  return (
    <section id="consultron-panel" ref={panel} className="flotante" role="dialog" aria-labelledby="flotante-titulo" data-en-mesa={enMesa || undefined} style={{ width: anchura.ancho, height: altura.alto }} onKeyDown={alTeclear}>
      {conAncho && <Borde de="consultron-panel" medida={anchura} />}
      <BordeDeAlto de="consultron-panel" medida={altura} />
      <header className="flotante__cabeza">
        <IconoMenu nombre="consultron" />
        <h2 id="flotante-titulo" tabIndex={-1}>Consultron</h2>
        {conAncho && <BotonesDeAncho medida={anchura} />}
        <BotonesDeAlto medida={altura} />
        {!enMesa && (
          <button type="button" className="flotante__accion" aria-label="Pantalla completa" onClick={agrandar}>
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 9V4h5M20 15v5h-5M4 4l6 6M20 20l-6-6" /></svg>
          </button>
        )}
        <button type="button" className="flotante__accion" aria-label="Cerrar Consultron" onClick={cerrar}>
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </header>
      {enLab && puede && (
        <div className="cvg-modos" role="group" aria-label="Qué hace Consultron">
          <button type="button" className="cvg-modos__boton" aria-pressed={!conCodigo} onClick={() => elegirModo('preguntar')}>Preguntar</button>
          <button type="button" className="cvg-modos__boton" aria-pressed={conCodigo} onClick={() => elegirModo('codigo')}>Código</button>
        </div>
      )}
      {enMesa ? (
        <HiloDeLaSesion sesion={vivo.sesion} />
      ) : conCodigo ? (
        <Codigo nivel={3} />
      ) : (
        <>
          <Anuncio estado={estado} />
          {preguntar ? (
            <>
              {!listo && (
                <div className="consultron__con-nube">
                  <Arranque estado={estado} nivel={3} />
                </div>
              )}
              <Charla inicial={materia} nivel={3} compacta pagina={pathname} conPantalla={LEE.test(pathname)} />
            </>
          ) : (
            <div className="flotante__arranque">
              <Arranque estado={estado} nivel={3} />
            </div>
          )}
        </>
      )}
    </section>
  );
}
