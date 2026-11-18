import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Charla, { Robot } from '../components/consultron/Charla';
import { Anuncio, Arranque, Pie } from '../components/consultron/Modelo';
import { useAjustes } from '../lib/ajustes';
import { materiaDeRuta } from '../lib/consultron/donde';
import { cargar, respondiendo, revisar, sePuedePreguntar, usar, useConsultron } from '../lib/consultron/motor';
import { usePermisosNube } from '../lib/consultron/nube';
import { abrirPanel, useEscritorio } from '../lib/consultron/panel';
import { tituloDe, useSeo } from '../lib/seo';
import '../components/consultron/consultron.css';

// Consultron in the whole screen. With a computer it also lives in a corner of every screen (Flotante.jsx), with the
// same questions: «Achicar» goes back to where the student was, with the corner open.

/** The address it came from, if it was a screen of the site: the course of a course's screen. */

export default function Consultron() {
  useSeo({ titulo: tituloDe('Consultron'), noindex: true });
  const { estado, hilo } = useConsultron();
  const navigate = useNavigate();
  const { state } = useLocation();
  const escritorio = useEscritorio();
  const { lugares } = useAjustes().menu;
  // «Achicar» only where the corner is: with a computer that can run it, and Consultron not hidden from the menu.
  const conRincon = escritorio && lugares.consultron !== 'oculta' && estado.fase !== 'no-puede';
  const desde = typeof state?.desde === 'string' && state.desde.startsWith('/') && !state.desde.startsWith('//') ? state.desde : null;
  const listo = estado.fase === 'listo';
  const preguntar = sePuedePreguntar(estado, usePermisosNube());

  useEffect(() => usar(), []);
  useEffect(() => {
    revisar();
  }, []);
  // Already in the browser: it loads by itself, nothing to download.
  useEffect(() => {
    if (estado.fase === 'bajado') cargar();
  }, [estado.fase]);

  const achicar = () => {
    abrirPanel();
    navigate(desde ?? '/');
  };

  return (
    <div className="contenedor pagina consultron">
      <div className="consultron__cabeza">
        <Robot grande />
        <h1>Consultron</h1>
        {conRincon && (
          <button type="button" className="boton boton--secundario boton--chico consultron__achicar" onClick={achicar}>
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 4v5H4M15 20v-5h5M4 9l6-6M20 15l-6 6" /></svg>
            Achicar
          </button>
        )}
      </div>
      <p className="consultron__bajada">Preguntale a tus apuntes o pasale un ejercicio para las calculadoras. Busca en los PDF del campus y en El Santo Resumen.</p>
      <Anuncio estado={estado} />

      {!listo && <Arranque estado={estado} />}
      {preguntar && <Charla inicial={materiaDeRuta(desde)} alIr={conRincon ? abrirPanel : undefined} pagina="/consultron" />}
      {(listo || estado.fase === 'bajado') && <Pie ocupado={respondiendo(hilo)} />}
    </div>
  );
}
