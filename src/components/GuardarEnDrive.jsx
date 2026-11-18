import { useEffect, useId, useRef, useState } from 'react';
import { cancelarConexion, conectarGoogle } from '../lib/google';
import { apagarDrive, borrarCopiaDrive, correr, cuentaDeDrive, prenderDrive, usarEstaCuenta, useDrive } from '../lib/sincro';
import { useUI } from './ui';

/** «Guardado en tu Drive hace 2 min», from when it last saved. */
export function haceCuanto(ms, ahora = Date.now()) {
  const s = Math.max(0, Math.round((ahora - ms) / 1000));
  if (s < 60) return 'recién';
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86_400) return `hace ${Math.floor(s / 3600)} h`;
  return `el ${new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'numeric' }).format(new Date(ms))}`;
}

const NO_CONECTO = 'No se pudo conectar con Google. Probá de nuevo.';
const textoDe = (e, otro) => (e.conocido && e.message ? e.message : otro);

// One line that says how it is, in the color of how it is. `extra` (when, or which file) goes after it.
function estadoEnUnaLinea(d, ahora) {
  if (!d.prendido) return d.fase === 'borrada' ? { texto: d.error, tono: 'aviso' } : null;
  if (d.fase === 'guardando' || (d.fase === 'esperando' && !d.ultima)) {
    return { texto: 'Guardando en tu Drive', extra: d.avance ? `, ${d.avance.n} de ${d.avance.total}` : '', tono: 'espera' };
  }
  if (d.fase === 'sin-conexion') return { texto: 'Sin conexión, se guarda cuando vuelva', tono: 'aviso' };
  if (d.fase === 'reconectar') return { texto: 'Se cortó la conexión con Google', tono: 'error' };
  if (d.fase === 'otra-cuenta' || d.fase === 'error') return { texto: d.error, tono: 'error' };
  return d.ultima ? { texto: 'Guardado en tu Drive', extra: ` ${haceCuanto(d.ultima, ahora)}`, tono: 'ok' } : { texto: 'Guardando en tu Drive', tono: 'espera' };
}

/** In Configuración, «Tus datos»: turns saving in the student's Google Drive on and off, and says how it goes. */
export default function GuardarEnDrive() {
  const d = useDrive();
  const { confirmar, avisar } = useUI();
  const [esperando, setEsperando] = useState(false);
  const [problema, setProblema] = useState('');
  const [ahora, setAhora] = useState(() => Date.now());
  const [anuncio, setAnuncio] = useState('');
  const interruptor = useRef(null);
  const cancelar = useRef(null);
  // A button pressed here may go away with what it did: then the focus goes back to the switch.
  const devolverFoco = useRef(false);
  const ayuda = useId();
  const control = useId();
  // «Hace 2 min» keeps up by itself. It is not announced: it is outside the live region.
  useEffect(() => {
    const reloj = setInterval(() => setAhora(Date.now()), 30_000);
    return () => clearInterval(reloj);
  }, []);
  useEffect(() => {
    if (esperando) {
      cancelar.current?.focus();
      return;
    }
    if (!devolverFoco.current) return;
    const activo = document.activeElement;
    if (activo && activo !== document.body && activo.isConnected) return;
    devolverFoco.current = false;
    interruptor.current?.focus();
  });

  const linea = esperando ? { texto: 'Terminá en la ventana de Google.', tono: 'espera' } : estadoEnUnaLinea(d, ahora);
  const avisos = d.prendido && !esperando ? d.avisos : [];
  // Only a change of state is announced, never the minutes going by nor each file.
  const paraAnunciar = [linea?.texto ?? '', ...avisos].filter(Boolean).join('. ').replace(/\.\./g, '.');
  const anunciado = useRef(paraAnunciar);
  useEffect(() => {
    if (anunciado.current === paraAnunciar) return;
    anunciado.current = paraAnunciar;
    setAnuncio(paraAnunciar);
  }, [paraAnunciar]);

  if (!d.disponible) return null;

  const conGoogle = (paso, alTerminar = () => {}) => {
    setProblema('');
    setEsperando(true);
    devolverFoco.current = true;
    paso()
      .then(alTerminar)
      .catch((e) => {
        if (e.codigo !== 'cancelada') setProblema(textoDe(e, NO_CONECTO));
      })
      .finally(() => setEsperando(false));
  };

  const alCambiar = (e) => {
    if (e.target.checked) conGoogle(prenderDrive);
    else {
      setProblema('');
      apagarDrive();
      avisar('Dejaste de guardar en tu Drive. Lo de este navegador queda.');
    }
  };

  // With the account it was saving in, so Google doesn't ask which one.
  const reconectar = () => conGoogle(() => conectarGoogle('drive', { cuenta: cuentaDeDrive() }), () => {
    correr();
  });

  const otraVez = () => {
    devolverFoco.current = true;
    correr();
  };

  const estaCuenta = () => {
    devolverFoco.current = true;
    usarEstaCuenta();
  };

  const borrarCopia = async () => {
    setProblema('');
    const seguro = await confirmar({
      titulo: '¿Borrar la copia de tu Drive?',
      texto: 'Se borra lo que guardaste en tu Drive y se deja de guardar. Lo de este navegador queda.',
      boton: 'Borrar la copia',
      peligro: true,
    });
    if (!seguro) return;
    devolverFoco.current = true;
    // Without the permission, Google's window opens for it.
    if (!d.conectado) setEsperando(true);
    try {
      await borrarCopiaDrive();
      avisar('Borraste la copia de tu Drive');
    } catch (e) {
      if (e.codigo !== 'cancelada') setProblema(textoDe(e, 'No se pudo borrar la copia. Probá de nuevo.'));
    } finally {
      setEsperando(false);
    }
  };

  const reconecta = !esperando && d.prendido && (d.fase === 'reconectar' || d.fase === 'otra-cuenta');
  const reintenta = !esperando && d.prendido && d.fase === 'error';
  const borra = !esperando && d.copia;
  return (
    <div className="ajuste-drive">
      <div className="ajuste-drive__fila">
        <span className="ajuste-drive__texto">
          <label htmlFor={control} className="ajuste-drive__nombre">Guardar en tu Google Drive</label>
          <span id={ayuda} className="ajuste-drive__ayuda">Lo que sumás, los archivos de tus materias y tu configuración aparecen en tus otros dispositivos.</span>
        </span>
        <input
          ref={interruptor}
          id={control}
          className="interruptor"
          type="checkbox"
          role="switch"
          checked={d.prendido}
          disabled={esperando}
          aria-describedby={ayuda}
          onChange={alCambiar}
        />
      </div>
      <p className="solo-lectores" role="status">{anuncio}</p>
      {(linea || avisos.length > 0) && (
        <div className="ajuste-drive__estado">
          {linea && <p className="ajuste-drive__linea" data-tono={linea.tono}>{linea.texto}{linea.extra}</p>}
          {avisos.map((a) => <p key={a} className="ajuste-drive__faltan">{a}</p>)}
          {!esperando && d.prendido && d.fase === 'listo' && d.faltan > 0 && (
            <p className="ajuste-drive__faltan">{d.faltan === 1 ? 'Un archivo de tus materias no está en este navegador ni en tu Drive.' : `${d.faltan} archivos de tus materias no están en este navegador ni en tu Drive.`}</p>
          )}
          {!esperando && d.prendido && d.conectado && d.email && <p className="ajuste-drive__cuenta">En la cuenta {d.email}</p>}
        </div>
      )}
      {(esperando || reconecta || reintenta || borra) && (
        <div className="ajustes__botones">
          {esperando && <button ref={cancelar} type="button" className="boton boton--secundario boton--chico" onClick={cancelarConexion}>Cancelar</button>}
          {reconecta && <button type="button" className="boton boton--chico" onClick={reconectar}>Volver a conectar</button>}
          {reconecta && d.fase === 'otra-cuenta' && <button type="button" className="boton boton--secundario boton--chico" onClick={estaCuenta}>Usar esta cuenta</button>}
          {reintenta && <button type="button" className="boton boton--secundario boton--chico" onClick={otraVez}>Probar de nuevo</button>}
          {borra && <button type="button" className="boton boton--secundario boton--chico ajustes__borrar" onClick={borrarCopia}>Borrar la copia de tu Drive</button>}
        </div>
      )}
      {problema && <p className="mensaje mensaje--error" role="alert">{problema}</p>}
    </div>
  );
}
