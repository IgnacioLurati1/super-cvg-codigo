import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { fila } from '../lib/mensajesPorMandar';
import { DUDA, FALLO } from '../lib/porMandar';
import { useSinInternet } from '../lib/sinInternet';
import './sinInternet.css';

// The strip under the header when what shows is what was kept (sinInternet.js): without internet, with the campus down,
// and once the network comes back, to bring it fresh. Also what happened to a message that waited for the signal
// (porMandar.js), wherever the student is when it goes.
const mismoDia = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
// In 24 hours, as the faculty says them («23:32», never «11:32 p. m.»).
const HORA = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const DIA = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });

export function cuandoSeGuardo(ms, ahora = Date.now()) {
  const hora = HORA.format(new Date(ms));
  return mismoDia(ms, ahora) ? `hoy a las ${hora}` : `el ${DIA.format(new Date(ms)).replace(',', '')} a las ${hora}`;
}

/** How long the news of a message that waited stays. */
export const AVISO_MS = 10_000;

/** The news of the messages that waited: { tipo, nombre, cuantos } → { texto, aMensajes }. */
export function textoDelAviso({ tipo, nombre = '', cuantos = 1 }) {
  const para = nombre ? ` para ${nombre}` : '';
  if (tipo === DUDA) return { texto: `No sabemos si salió tu mensaje${para}.`, aMensajes: true };
  if (tipo === FALLO) return { texto: `Tu mensaje${para} no salió.`, aMensajes: true };
  if (cuantos > 1) return { texto: `Salieron ${cuantos} mensajes que estaban por mandar.`, aMensajes: false };
  return { texto: `Salió tu mensaje${para}.`, aMensajes: false };
}

function useAvisoDeMensajes() {
  const [aviso, setAviso] = useState(null);
  useEffect(() => {
    let reloj = null;
    const dejar = fila.escuchar(({ tipo, item }) => {
      // Only the ones that waited: one that went at once is news on its own screen.
      if (!item?.espero || (tipo !== 'salio' && tipo !== DUDA && tipo !== FALLO)) return;
      setAviso((a) => (tipo === 'salio' && a?.tipo === 'salio' ? { ...a, cuantos: a.cuantos + 1 } : { tipo, nombre: item.nombre, cuantos: 1 }));
      clearTimeout(reloj);
      reloj = setTimeout(() => setAviso(null), AVISO_MS);
    });
    return () => {
      dejar();
      clearTimeout(reloj);
    };
  }, []);
  return aviso && textoDelAviso(aviso);
}

export default function SinInternet() {
  const { sinRed, desde, volvio } = useSinInternet();
  const mensajes = useAvisoDeMensajes();
  const deRed = sinRed || desde !== null;
  const visible = deRed || Boolean(mensajes);
  const franja = useRef(null);
  // Its height, for the screens as high as the window (Consultron, Laboratorio): they leave it room.
  useLayoutEffect(() => {
    const raiz = document.documentElement.style;
    const caja = franja.current;
    if (!caja || typeof ResizeObserver === 'undefined') return undefined;
    const medir = () => raiz.setProperty('--alto-sin-internet', `${caja.offsetHeight}px`);
    const ojo = new ResizeObserver(medir);
    ojo.observe(caja);
    medir();
    return () => {
      ojo.disconnect();
      raiz.removeProperty('--alto-sin-internet');
    };
  }, []);
  let texto = '';
  if (!deRed) texto = '';
  else if (volvio && !sinRed) texto = 'Volvió la conexión.';
  else if (desde === null) texto = 'Sin internet. Ves lo que quedó guardado en este dispositivo.';
  else texto = `${sinRed ? 'Sin internet' : 'El campus no responde'}. Ves lo guardado ${cuandoSeGuardo(desde)}.`;
  // The live region is always there, empty when there is nothing to say: a reader announces what appears inside it.
  return (
    <div ref={franja} className="sin-internet" role="status">
      {visible && (
        <div className="contenedor sin-internet__fila">
          {texto && <p>{texto}</p>}
          {deRed && volvio && !sinRed && <button type="button" className="boton boton--secundario sin-internet__boton" onClick={() => window.location.reload()}>Traer lo nuevo</button>}
          {mensajes && (
            <p className="sin-internet__mensajes">
              {mensajes.texto}
              {mensajes.aMensajes && <> <Link to="/mensajes">Miralo en Mensajes</Link>.</>}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
