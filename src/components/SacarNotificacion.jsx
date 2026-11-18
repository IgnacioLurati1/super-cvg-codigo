import { useEffect, useId, useRef } from 'react';
import './sacarNotificacion.css';

/** The button that takes a notification out of the bell and of Hoy (campana.js). Next to its row: a button can't go in
 * a link. */
export function BotonSacar({ id, titulo, onSacar }) {
  return (
    <button type="button" className="sacar-notificacion" data-sacar={id} aria-label={`Sacar ${titulo}`} title="Sacar" onClick={onSacar}>
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 7l10 10M17 7L7 17" /></svg>
    </button>
  );
}

/** Where what was taken out was: what happened and the way back. It takes the focus, as the button that had it is gone. */
export function Sacada({ texto, onDeshacer, como: Caja = 'li' }) {
  const deshacer = useRef(null);
  const id = useId();
  useEffect(() => {
    deshacer.current?.focus({ preventScroll: true });
  }, []);
  return (
    <Caja className="sacada">
      <p id={id} className="sacada__texto">{texto}</p>
      <button ref={deshacer} type="button" className="boton boton--secundario boton--chico" aria-describedby={id} onClick={onDeshacer}>Deshacer</button>
    </Caja>
  );
}
