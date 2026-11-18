import { useEffect, useId, useState } from 'react';
import { estaHecha, hechaDe } from '../lib/hechas';
import { desmarcarHecha, marcarHecha, marcarHechaSola, useMio } from '../lib/mio';
import { useUI } from './ui';
import './hechas.css';

export const NO_SE_GUARDO = 'No se pudo guardar. Fijate si el navegador deja guardar datos.';

/** The tick of what is done. The word always goes with it, for whoever can't see it. */
export function IconoHecha({ className = 'icono-hecha' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

/** The quiet button of each pending row: a circle with the tick. */
export function IconoMarcar() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="9" />
      <path d="M8.2 12.4l2.7 2.7 5-5.3" />
    </svg>
  );
}

/** Marked as done by itself once the campus says it is handed in or graded (`listo`), unless the student already marked
 * it or took the mark off. With what the screen already brought: never a request of its own. */
export function useHechaSola(clave, vence, listo) {
  const valor = useMio().hechas[clave];
  useEffect(() => {
    if (clave && listo && valor === undefined) marcarHechaSola(clave, vence);
  }, [clave, vence, listo, valor]);
}

/** In the card of a campus task or quiz: whether it is marked as done, so it leaves Hoy, and the button to mark it or
 * take the mark off. `listo` is how the campus says it is finished («Está entregada»), or null. The button stays the
 * same element, so the focus stays on it. */
export default function MarcaHecha({ clave, vence, listo }) {
  const mio = useMio();
  const { avisar } = useUI();
  const ayuda = useId();
  const [anuncio, setAnuncio] = useState('');
  useHechaSola(clave, vence, listo);
  if (!clave) return null;
  const hecha = estaHecha(mio, clave);
  const palabra = hechaDe(clave);
  // A quiz is «el cuestionario»; a task, «la entrega».
  const o = palabra === 'hecho' ? 'o' : 'a';
  const texto = listo ?? `L${o} marcaste como ${palabra}`;
  const cambiar = () => {
    if (!(hecha ? desmarcarHecha(clave, vence) : marcarHecha(clave, vence))) {
      avisar(NO_SE_GUARDO, 'error');
      return;
    }
    setAnuncio(hecha ? `Desmarcad${o}. Vuelve a aparecer en Hoy.` : `Marcad${o} como ${palabra}. Ya no aparece en Hoy.`);
  };
  return (
    <div className="marca-hecha" data-hecha={hecha || undefined}>
      {hecha && <p className="marca-hecha__texto"><IconoHecha />{`${texto}. Ya no te aparece en Hoy.`}</p>}
      <button type="button" className="boton boton--secundario boton--chico" aria-describedby={hecha ? undefined : ayuda} onClick={cambiar}>
        {hecha ? 'Desmarcar' : `Marcar como ${palabra}`}
      </button>
      {!hecha && <p id={ayuda} className="marca-hecha__ayuda">Deja de aparecer en Hoy. En el campus no cambia nada.</p>}
      <span className="solo-lectores" role="status">{anuncio}</span>
    </div>
  );
}
