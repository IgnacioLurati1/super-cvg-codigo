import { useEffect, useId, useRef, useState } from 'react';
import { fecha, peso, sinExtension } from '../lib/datos';
import { direccionDeDemo } from '../lib/demoAdjuntos';
import { cancelarConexion, conectarGoogle } from '../lib/google';
import { esDemo } from '../lib/modoDemo';
import { mimeDe } from '../lib/propiasSaneo';
import { tokenActual } from '../lib/sesion';
import { abrirTemporal, venceEl } from '../lib/temporales';
import { useAbrirPrevia } from './Previa';
import { IconoDeItem } from './Simbolo';

// The pieces of a file in Mensajes (lib/adjuntos.js): the card of one that came, the one going up, the one chosen in
// the box, and the first time, what happens with it before Google's window.

const Icono = ({ nombre }) => <IconoDeItem item={{ tipo: 'archivo', archivo: nombre }} />;

// On screen, the number and its unit never split between two lines.
const junto = (texto) => texto.replace(' ', '\u00A0');
const pesoONada = (bytes) => junto(peso(bytes) || '0 KB');

/** A file sent without Drive (temporales.js): it opens here, in the preview, brought and unlocked in memory. Until
 * when, from the time of the message. */
function TarjetaTemporal({ adjunto, cuando }) {
  const abrirPrevia = useAbrirPrevia();
  const vence = cuando ? venceEl(cuando) : null;
  const [ahora] = useState(() => Date.now());
  const vencido = vence && vence.getTime() < ahora;
  let dato = 'Se abre acá';
  if (vence) dato = vencido ? `Venció el ${fecha(vence.getTime() / 1000)}` : `Se abre acá hasta el ${fecha(vence.getTime() / 1000)}`;
  const abrir = () =>
    abrirPrevia({
      id: `temporal-${adjunto.id}`,
      tipo: 'archivo',
      nombre: sinExtension(adjunto.nombre),
      archivo: adjunto.nombre,
      peso: 0,
      mime: mimeDe(adjunto.nombre),
      // Typed by the name the message shows, whatever name came inside.
      traer: async () => new Blob([(await abrirTemporal(adjunto)).blob], { type: mimeDe(adjunto.nombre) }),
    });
  // An expired one is only its name: nothing to open.
  const Caja = vencido ? 'div' : 'button';
  const propias = vencido ? {} : { type: 'button', onClick: abrir, 'aria-haspopup': 'dialog' };
  return (
    <Caja className="adjunto" {...propias}>
      <Icono nombre={adjunto.nombre} />
      <span className="adjunto__texto">
        <span className="adjunto__nombre">{adjunto.nombre}</span>
        <span className="adjunto__dato">
          <span className="solo-lectores">, </span>
          {adjunto.peso ? `${junto(adjunto.peso)}. ` : ''}{dato}
        </span>
      </span>
    </Caja>
  );
}

/** A file in a message: its kind, its name and its size, as the message says. It opens in Google Drive, in another
 * tab, at the address built from its checked id. In the demo (only in npm run dev), the file itself. One sent without
 * Drive opens here. */
export function TarjetaAdjunto({ adjunto, cuando = 0 }) {
  if (adjunto.temporal) return <TarjetaTemporal adjunto={adjunto} cuando={cuando} />;
  const enDemo = import.meta.env.DEV && esDemo(tokenActual()) ? direccionDeDemo(adjunto.id, adjunto.nombre) : null;
  return (
    <a className="adjunto" href={enDemo ?? adjunto.url} target="_blank" rel="noreferrer" title="drive.google.com">
      <Icono nombre={adjunto.nombre} />
      <span className="adjunto__texto">
        <span className="adjunto__nombre">{adjunto.nombre}</span>
        <span className="adjunto__dato">
          <span className="solo-lectores">, </span>
          {adjunto.peso ? `${junto(adjunto.peso)} en Google Drive` : 'En Google Drive'}, se abre en otra pestaña
        </span>
      </span>
    </a>
  );
}

/** A file of a message that is going: how far it went up, then the link and the message. */
export function ArchivoSaliendo({ adjunto, fallo = false }) {
  const { paso, hecho = 0, bytes } = adjunto;
  let dato = peso(bytes);
  if (!fallo && paso === 'compartiendo') dato = 'Armando el link';
  else if (!fallo && paso === 'mandando') dato = 'Mandando el mensaje';
  else if (!fallo) dato = `${adjunto.via === 'temporal' ? 'Subiendo' : 'Subiendo a tu Drive'}, ${pesoONada(hecho)} de ${pesoONada(bytes)}`;
  return (
    <div className="adjunto adjunto--saliendo">
      <Icono nombre={adjunto.nombre} />
      <span className="adjunto__texto">
        <span className="adjunto__nombre">{adjunto.nombre}</span>
        <span className="adjunto__dato"><span className="solo-lectores">, </span>{dato}</span>
        {!fallo && <progress className="adjunto__barra" max={bytes} value={paso === 'subiendo' ? hecho : bytes} aria-label={`Subida de ${adjunto.nombre}`} />}
      </span>
    </div>
  );
}

/** The file chosen for the next message, with what happens with it, before Mandar. */
export function ArchivoElegido({ adjunto, idAviso, onSacar }) {
  return (
    <div className="mensajes__elegido">
      <Icono nombre={adjunto.nombre} />
      <div id={idAviso} className="mensajes__elegido-texto">
        <p className="mensajes__elegido-nombre">{adjunto.nombre}</p>
        <p className="mensajes__elegido-aviso">
          {adjunto.via === 'temporal'
            ? `${peso(adjunto.bytes)}. Super CVG lo guarda 45 días. Lo abre quien tenga el link del mensaje.`
            : `${peso(adjunto.bytes)}. Se sube a tu Google Drive, en la carpeta «Super CVG». Cualquiera con el link lo puede ver. Lo borrás desde tu Drive.`}
        </p>
      </div>
      <button type="button" className="boton boton--secundario boton--chico" onClick={onSacar}>
        Sacar<span className="solo-lectores"> el archivo</span>
      </button>
    </div>
  );
}

/** Without Drive connected: where the file goes. Without Drive (`onSinDrive`) Super CVG keeps it 45 days; with
 * `conDrive`, the student can connect Google Drive instead, and once connected the file is chosen from here (the browser
 * opens its window only right after a click). `soltado`: the name of a file dropped on the conversation, which goes
 * instead of choosing one. */
export function ConectarDrive({ onElegir, onSinDrive, onCerrar, soltado, conDrive = true }) {
  const idTitulo = useId();
  const [esperando, setEsperando] = useState(false);
  const [listo, setListo] = useState(false);
  const [error, setError] = useState('');
  const conectar = useRef(null);
  const sinDrive = useRef(null);
  const cancelar = useRef(null);
  const elegir = useRef(null);
  useEffect(() => {
    if (esperando) cancelar.current?.focus();
    else (listo ? elegir : sinDrive).current?.focus();
  }, [esperando, listo]);
  const alConectar = () => {
    setError('');
    setEsperando(true);
    conectarGoogle('adjuntos')
      .then(() => setListo(true), (e) => {
        if (e.codigo !== 'cancelada') setError(e.message);
      })
      .finally(() => setEsperando(false));
  };
  let botones;
  if (listo) botones = <button ref={elegir} type="button" className="boton boton--chico" onClick={onElegir}>{soltado ? `Adjuntar ${soltado}` : 'Elegir el archivo'}</button>;
  else if (esperando) {
    botones = (
      <>
        <p className="mensajes__adjuntar-espera" role="status">Terminá en la ventana de Google.</p>
        <button ref={cancelar} type="button" className="boton boton--secundario boton--chico" onClick={cancelarConexion}>Cancelar</button>
      </>
    );
  } else {
    botones = (
      <>
        <button ref={sinDrive} type="button" className="boton boton--chico" onClick={onSinDrive}>{soltado ? `Adjuntar ${soltado}` : 'Elegir el archivo'}</button>
        {conDrive && <button ref={conectar} type="button" className="boton boton--secundario boton--chico" onClick={alConectar}>Conectar Google Drive</button>}
      </>
    );
  }
  return (
    <section className="mensajes__adjuntar" aria-labelledby={idTitulo}>
      <h3 id={idTitulo} className="mensajes__adjuntar-titulo">Mandar un archivo</h3>
      {listo ? (
        <p role="status">{soltado ? 'Tu Drive quedó conectado.' : 'Tu Drive quedó conectado. Elegí el archivo.'}</p>
      ) : (
        <p>
          El campus no recibe archivos. Super CVG lo guarda 45 días y manda un link que se abre acá.
          {conDrive && ' Si conectás tu Google Drive, queda en tu Drive.'}
        </p>
      )}
      <div className="mensajes__adjuntar-botones">
        {botones}
        {!esperando && <button type="button" className="boton boton--secundario boton--chico" onClick={onCerrar}>Ahora no</button>}
      </div>
      {error && <p className="mensaje mensaje--error" role="alert">{error}</p>}
    </section>
  );
}
