import { useEffect, useId, useRef, useState } from 'react';
import { escribir, mensajes, MAX_MENSAJE } from '../../lib/enVivo/mesa';

const hora = (t) => new Date(t).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

/** The session's chat. Enter sends; Shift+Enter, a new line. */
export default function Chat({ sesion, alVer, enfocar = false }) {
  const [lista, setLista] = useState(() => mensajes(sesion.doc));
  const [texto, setTexto] = useState('');
  const id = useId();
  const fondo = useRef(null);
  const campo = useRef(null);
  useEffect(() => {
    if (enfocar) campo.current?.focus();
  }, [enfocar]);

  useEffect(() => {
    const chat = sesion.doc.getArray('chat');
    const leer = () => setLista(mensajes(sesion.doc));
    chat.observe(leer);
    return () => chat.unobserve(leer);
  }, [sesion]);

  // The last one in sight, unless the student scrolled up to read.
  useEffect(() => {
    const caja = fondo.current;
    if (!caja) return;
    if (caja.scrollHeight - caja.scrollTop - caja.clientHeight < 120) caja.scrollTop = caja.scrollHeight;
    alVer?.(lista.length);
  }, [lista, alVer]);

  const mandar = (e) => {
    e.preventDefault();
    if (escribir(sesion.doc, sesion.yo, texto)) setTexto('');
  };

  return (
    <section className="envivo-chat" aria-labelledby={`${id}-t`}>
      <h2 id={`${id}-t`} className="envivo-chat__titulo">Chat</h2>
      <ol ref={fondo} className="envivo-chat__lista" role="log" aria-live="polite" aria-relevant="additions" tabIndex={0} aria-label="Mensajes de la sesión">
        {lista.length === 0 && <li className="envivo-chat__vacio">Todavía nadie escribió.</li>}
        {lista.map((m, i) => {
          const seguido = i > 0 && lista[i - 1].de === m.de && m.cuando - lista[i - 1].cuando < 120000;
          const mio = m.de === sesion.yo.id;
          return (
            <li key={m.id || i} className={`envivo-chat__mensaje${mio ? ' envivo-chat__mensaje--mio' : ''}`} style={{ '--persona': m.color }}>
              {!seguido && (
                <p className="envivo-chat__quien">
                  <span className="envivo-chat__nombre">{mio ? 'Vos' : m.nombre || 'Alguien'}</span> <time dateTime={new Date(m.cuando).toISOString()}>{hora(m.cuando)}</time>
                </p>
              )}
              {seguido && <span className="solo-lectores">{mio ? 'Vos' : m.nombre || 'Alguien'}: </span>}
              <p className="envivo-chat__texto">{m.texto}</p>
            </li>
          );
        })}
      </ol>
      <form className="envivo-chat__form" onSubmit={mandar}>
        <label className="solo-lectores" htmlFor={`${id}-c`}>Escribir en el chat</label>
        <textarea
          ref={campo}
          id={`${id}-c`}
          className="campo__control envivo-chat__campo"
          rows={2}
          maxLength={MAX_MENSAJE}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) mandar(e);
          }}
        />
        <button type="submit" className="boton boton--chico">Mandar</button>
      </form>
    </section>
  );
}
