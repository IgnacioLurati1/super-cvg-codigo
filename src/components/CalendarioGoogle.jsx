import { useEffect, useRef, useState } from 'react';
import { anotarExplicado, BORRADO, correr, desvincularCalendario, leerMarcas, reconectarCalendario, useCalendarioGoogle, vincularCalendario } from '../lib/calendarioSincro';
import { cancelarConexion } from '../lib/google';
import { usuarioActual } from '../lib/mio';
import { haceCuanto } from './GuardarEnDrive';
import { useUI } from './ui';

const textoDe = (e, otro) => (e?.conocido && e.message ? e.message : otro);

/** In Calendario, next to the title: «Vincular Google Calendar», «Cancelar» while Google's window is open, and
 * «Desvincular Google Calendar» once linked. One button that changes, so the focus stays on it. */
export function BotonCalendarioGoogle() {
  const g = useCalendarioGoogle();
  const { confirmar, avisar } = useUI();
  const [ocupado, setOcupado] = useState(false);
  if (!g.disponible) return null;

  // While it works the button keeps the focus: aria-disabled and the click does nothing, never disabled.
  const vincular = async () => {
    if (ocupado) return;
    setOcupado(true);
    try {
      const { listo } = await vincularCalendario();
      await listo;
    } catch (e) {
      if (e.codigo !== 'cancelada') avisar(textoDe(e, 'No se pudo vincular Google Calendar. Probá de nuevo.'), 'error');
    } finally {
      setOcupado(false);
    }
  };

  const desvincular = async () => {
    if (ocupado) return;
    const seguro = await confirmar({
      titulo: '¿Desvincular Google Calendar?',
      texto: 'Se borra el calendario «Super CVG» de tu Google, con todas sus fechas. Las de acá quedan.',
      boton: 'Desvincular',
      peligro: true,
    });
    if (!seguro) return;
    setOcupado(true);
    try {
      await desvincularCalendario();
      avisar('Desvinculaste Google Calendar.');
    } catch (e) {
      avisar(textoDe(e, 'No se pudo desvincular. Probá de nuevo.'), 'error');
    } finally {
      setOcupado(false);
    }
  };

  if (g.fase === 'ventana') {
    return <button type="button" className="boton boton--secundario boton--chico" onClick={cancelarConexion}>Cancelar</button>;
  }
  if (g.prendido) {
    return (
      <button type="button" className="boton boton--secundario boton--chico" aria-disabled={ocupado || undefined} aria-busy={ocupado || undefined} onClick={desvincular}>
        Desvincular Google Calendar
      </button>
    );
  }
  return (
    <button type="button" className="boton boton--secundario boton--chico boton--google" aria-disabled={ocupado || undefined} aria-busy={ocupado || undefined} onClick={vincular}>
      Vincular Google Calendar
    </button>
  );
}

// One line that says how it is, in the color of how it is. `extra` (when it last caught up) goes after it.
function lineaDe(g, ahora) {
  if (g.fase === 'ventana') return { texto: 'Terminá en la ventana de Google.', tono: 'espera' };
  if (!g.prendido) return g.fase === 'borrado' ? { texto: g.error || BORRADO, tono: 'aviso' } : null;
  if (g.fase === 'conectando' || (g.fase === 'pasando' && !g.ultima)) return { texto: 'Pasando tus fechas a Google Calendar.', tono: 'espera' };
  if (g.fase === 'sin-conexion') return { texto: 'Sin conexión. Tus fechas pasan cuando vuelva.', tono: 'aviso' };
  if (g.fase === 'reconectar') return { texto: 'Se cortó la conexión con Google.', tono: 'error' };
  if (g.fase === 'error') return { texto: g.error || 'No se pudieron pasar tus fechas. Probá de nuevo.', tono: 'error' };
  return {
    texto: 'Este calendario y el «Super CVG» de tu Google son el mismo. Tus fechas aparecen en los dos, las cargues acá o allá. Las del campus y las de la facultad llegan cada vez que entrás.',
    extra: g.ultima ? ` Se puso al día ${haceCuanto(g.ultima, ahora)}.` : '',
    tono: 'ok',
  };
}

/** Under the title of Calendario: how the link with Google Calendar is going, and what to do if it stopped. */
export function EstadoCalendarioGoogle() {
  const g = useCalendarioGoogle();
  const { avisar } = useUI();
  const [ahora, setAhora] = useState(() => Date.now());
  const [anuncio, setAnuncio] = useState('');
  // «Hace 2 min» keeps up by itself. It is not announced: it is outside the live region.
  useEffect(() => {
    const reloj = setInterval(() => setAhora(Date.now()), 30_000);
    return () => clearInterval(reloj);
  }, []);
  // Read when the screen opens: the visit that explains it keeps it in sight.
  // The explanation of a working link shows only on the first visit that has it (`explicado` in the marks).
  const [explicado] = useState(() => Boolean(leerMarcas(usuarioActual())?.explicado));
  const completa = g.disponible ? lineaDe(g, ahora) : null;
  const linea = completa?.tono === 'ok' && explicado ? null : completa;
  useEffect(() => {
    if (completa?.tono === 'ok' && !explicado) anotarExplicado();
  }, [completa?.tono, explicado]);
  // Only a change of state is announced, never the minutes going by.
  const paraAnunciar = linea?.texto ?? '';
  const anunciado = useRef(paraAnunciar);
  useEffect(() => {
    if (anunciado.current === paraAnunciar) return;
    anunciado.current = paraAnunciar;
    setAnuncio(paraAnunciar);
  }, [paraAnunciar]);

  const reconectar = () => {
    reconectarCalendario().catch((e) => {
      if (e.codigo !== 'cancelada') avisar(textoDe(e, 'No se pudo conectar con Google. Probá de nuevo.'), 'error');
    });
  };

  return (
    <>
      <p className="solo-lectores" role="status">{anuncio}</p>
      {linea && (
        <div className="gcal" data-tono={linea.tono}>
          <p className="gcal__linea">{linea.texto}{linea.extra}</p>
          {g.prendido && g.fase === 'reconectar' && <button type="button" className="boton boton--chico" onClick={reconectar}>Volver a conectar</button>}
          {g.prendido && g.fase === 'error' && <button type="button" className="boton boton--secundario boton--chico" onClick={() => correr()}>Probar de nuevo</button>}
          {g.prendido && !['reconectar', 'error', 'conectando'].includes(g.fase) && (
            <a className="gcal__abrir" href="https://calendar.google.com/calendar/r" target="_blank" rel="noreferrer">
              Abrir Google Calendar<span className="solo-lectores">, se abre en otra pestaña</span>
            </a>
          )}
        </div>
      )}
    </>
  );
}
