import { useId, useRef, useState } from 'react';
import { apagarEntrarConGoogle, prenderEntrarConGoogle, useEntrarConGoogle } from '../lib/entrarConGoogle';
import { cancelarConexion, mailGoogle } from '../lib/google';
import { useUI } from './ui';

/** In Configuración, «Tus dispositivos»: turns «Entrar con Google» on and off, warning before it goes on. */
export default function EntrarConGoogle() {
  const e = useEntrarConGoogle();
  const { confirmar, avisar } = useUI();
  const [esperando, setEsperando] = useState(false);
  const [problema, setProblema] = useState('');
  const interruptor = useRef(null);
  const control = useId();
  const ayuda = useId();

  if (!e.disponible) return null;

  const hacer = async (paso, listo) => {
    setEsperando(true);
    try {
      await paso();
      avisar(listo);
    } catch (err) {
      if (err.codigo !== 'cancelada') setProblema(err.conocido && err.message ? err.message : 'No se pudo conectar con Google. Probá de nuevo.');
    } finally {
      setEsperando(false);
      interruptor.current?.focus();
    }
  };

  const alCambiar = async (ev) => {
    setProblema('');
    if (ev.target.checked) {
      const contrasena = await confirmar({
        titulo: '¿Entrar con Google?',
        texto: 'Tu sesión del campus queda guardada en tu Google Drive. Quien entre a tu cuenta de Google va a poder entrar a tu campus, leer tus mensajes y entregar por vos. Apagalo acá cuando quieras.',
        contrasena: 'Tu contraseña del campus',
        boton: 'Prender',
        peligro: true,
      });
      if (!contrasena) return;
      hacer(() => prenderEntrarConGoogle(contrasena), 'Ya podés entrar con Google');
      return;
    }
    const seguro = await confirmar({
      titulo: '¿Dejar de entrar con Google?',
      texto: 'Se borra tu sesión del campus de tu Drive. Para entrar en otro dispositivo vas a necesitar tu contraseña.',
      boton: 'Apagar',
    });
    if (!seguro) return;
    hacer(apagarEntrarConGoogle, 'Dejaste de entrar con Google');
  };

  const mail = e.prendido && mailGoogle();
  return (
    <div className="ajuste-drive">
      <div className="ajuste-drive__fila">
        <span className="ajuste-drive__texto">
          <label htmlFor={control} className="ajuste-drive__nombre">Entrar con Google</label>
          <span id={ayuda} className="ajuste-drive__ayuda">En cualquier dispositivo entrás con tu cuenta de Google, sin la contraseña del campus. Cada uno guarda en tu Google Drive y recibe lo tuyo, tu configuración, El Santo Resumen y tu calendario.</span>
        </span>
        <input
          ref={interruptor}
          id={control}
          className="interruptor"
          type="checkbox"
          role="switch"
          checked={e.prendido}
          disabled={esperando}
          aria-describedby={ayuda}
          onChange={alCambiar}
        />
      </div>
      {esperando && (
        <div className="ajustes__botones">
          <p className="ajuste-drive__linea" data-tono="espera" role="status">Terminá en la ventana de Google.</p>
          <button type="button" className="boton boton--secundario boton--chico" onClick={cancelarConexion}>Cancelar</button>
        </div>
      )}
      {mail && !esperando && <p className="ajuste-drive__cuenta">Con la cuenta {mail}</p>}
      {problema && <p className="mensaje mensaje--error" role="alert">{problema}</p>}
    </div>
  );
}
