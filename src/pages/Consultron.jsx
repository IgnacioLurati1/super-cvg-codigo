import { useEffect, useId, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import Charla, { Robot } from '../components/consultron/Charla';
import { Anuncio, Arranque, Pie } from '../components/consultron/Modelo';
import { useAjustes } from '../lib/ajustes';
import { materiaDeRuta } from '../lib/consultron/donde';
import { cargarSiHaceFalta, porPoderPreguntar, respondiendo, revisar, sePuedePreguntar, usar, useConsultron } from '../lib/consultron/motor';
import { usePermisosNube } from '../lib/consultron/nube';
import { abrirPanel, useEscritorio } from '../lib/consultron/panel';
import { tituloDe, useSeo } from '../lib/seo';
import '../components/consultron/consultron.css';

// Consultron in the whole screen, as a chat: the talks on one side, the one open in the middle and the box to write at
// the bottom (Charla.jsx, `vista="pagina"`). How the model is and the permissions go in a window of their own,
// «Ajustes». With a computer it also lives in a corner of every screen (Flotante.jsx), with the same questions:
// «Achicar» goes back to where the student was, with the corner open.

/** The window of settings: the model (its download, its loading) while it can already be asked, the settings of this
 * computer and a way to how the talk looks. A click on the shade around it closes it. */
function Ajustes({ dialogo, idTitulo, estado, preguntar, ocupado, sinModelo, conPie }) {
  const cerrar = () => dialogo.current?.close();
  const alTocar = (e) => {
    if (e.target === e.currentTarget) cerrar();
  };
  return (
    <dialog ref={dialogo} className="consultron__ajustes" aria-labelledby={idTitulo} onClick={alTocar}>
      <div className="consultron__ajustes-cuerpo">
        <div className="consultron__ajustes-cabeza">
          <h2 id={idTitulo}>Ajustes</h2>
          <button type="button" className="charla__icono" aria-label="Cerrar" onClick={cerrar}>
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        {preguntar && estado.fase !== 'listo' && <Arranque estado={estado} nivel={3} sinCerrar />}
        <Pie ocupado={ocupado} sinModelo={sinModelo || !conPie} nivel={3} />
        <Link className="consultron__ajustes-letra" to="/configuracion#consultron">Letra y forma de la charla</Link>
      </div>
    </dialog>
  );
}

/** While the computer is looked at: the shape of the two cards that usually come after it (Gemini and «Bajá
 * Consultron»), so the greeting doesn't jump up when they arrive. */
function EsperaArranque() {
  return (
    <div className="consultron__opciones consultron__espera">
      <p className="solo-lectores" role="status">Revisando tu compu…</p>
      <div className="consultron__oferta" aria-hidden="true"><i /><i /><i /><b /></div>
      <div className="consultron__arranque" aria-hidden="true"><i /><i /><i /><b /></div>
    </div>
  );
}

export default function Consultron() {
  useSeo({ titulo: tituloDe('Consultron'), noindex: true });
  const { estado, hilo } = useConsultron();
  const navigate = useNavigate();
  const { state } = useLocation();
  const escritorio = useEscritorio();
  const { lugares } = useAjustes().menu;
  // «Achicar» only where the corner is: on a computer, and Consultron not hidden from the menu.
  const conRincon = escritorio && lugares.consultron !== 'oculta';
  const desde = typeof state?.desde === 'string' && state.desde.startsWith('/') && !state.desde.startsWith('//') ? state.desde : null;
  const listo = estado.fase === 'listo';
  const permisos = usePermisosNube();
  const preguntar = sePuedePreguntar(estado, permisos);
  // While the computer is looked at, the talk is already drawn if it'll end there: nothing jumps once it's done.
  const conCharla = preguntar || porPoderPreguntar(estado, permisos);
  // Where only Gemini answers: the settings only once it's approved, to turn it off.
  const sinModelo = estado.fase === 'no-puede';
  // The settings of the model, once it's there or loading. Before, only «Usar Gemini».
  const conPie = listo || estado.fase === 'bajado' || (sinModelo && permisos.todo);
  const conAjustes = !['quieto', 'revisando', 'borrando'].includes(estado.fase);
  // Downloading or loading while it can be asked: the progress is in «Ajustes», and its button says so.
  const cargando = preguntar && ['bajando', 'preparando'].includes(estado.fase);
  const dialogo = useRef(null);
  const idAjustes = useId();

  useEffect(() => usar(), []);
  useEffect(() => {
    revisar();
  }, []);
  // Already in the browser: it loads by itself, nothing to download.
  useEffect(() => {
    if (estado.fase === 'bajado') cargarSiHaceFalta();
  }, [estado.fase]);

  const achicar = () => {
    abrirPanel();
    navigate(desde ?? '/');
  };

  const titulo = (
    <div className="consultron__titulo">
      <Robot />
      <h1>Consultron</h1>
    </div>
  );
  const acciones = (
    <>
      {conRincon && (
        <button type="button" className="charla__icono consultron__achicar" aria-label="Achicar" title="Achicar" onClick={achicar}>
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 4v5H4M15 20v-5h5M4 9l6-6M20 15l-6 6" /></svg>
        </button>
      )}
      {/* While the computer is looked at it keeps its place, off: it doesn't pop in afterwards. */}
      {(conAjustes || estado.fase !== 'borrando') && (
        <button type="button" className="consultron__abrir-ajustes" aria-haspopup="dialog" disabled={!conAjustes} data-cargando={cargando || undefined} onClick={() => dialogo.current?.showModal()}>
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 7h10M18 7h2M4 17h4M12 17h8M14 4.5v5M8 14.5v5" /></svg>
          <span className="consultron__abrir-ajustes-texto">Ajustes</span>
          {cargando && <span className="solo-lectores">, {estado.fase === 'bajando' ? 'bajando Consultron' : 'preparando Consultron'}</span>}
        </button>
      )}
    </>
  );

  return (
    <div className="consultron consultron--chat">
      <Anuncio estado={estado} />
      {conCharla ? (
        <Charla inicial={materiaDeRuta(desde)} alIr={conRincon ? abrirPanel : undefined} pagina="/consultron" vista="pagina" barra={{ titulo, acciones }} />
      ) : (
        // Before it can be asked: what it takes, in the middle of the screen.
        <div className="charla" data-vista="pagina" data-vacia="">
          <div className="charla__centro">
            <header className="charla__barra">
              {titulo}
              {acciones}
            </header>
            <div className="charla__lista">
              <div className="charla__columna">
                <div className="charla__saludo">
                  <Robot grande />
                  <p className="charla__hola">¿Qué estudiamos hoy?</p>
                  <p className="charla__bajada">Preguntale a tus apuntes o pasale un ejercicio para las calculadoras. Busca en los PDF del campus y en El Santo Resumen.</p>
                </div>
                {['quieto', 'revisando'].includes(estado.fase) ? <EsperaArranque /> : <Arranque estado={estado} />}
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Always there, so a change of the model while it's open doesn't close it. */}
      <Ajustes dialogo={dialogo} idTitulo={idAjustes} estado={estado} preguntar={preguntar} ocupado={respondiendo(hilo)} sinModelo={sinModelo} conPie={conPie} />
    </div>
  );
}
