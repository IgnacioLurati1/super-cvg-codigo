import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { tituloDe, useSeo } from '../lib/seo';
import { leerCodigo, mostrarCodigo, nuevoCodigo, tomarInvitacion } from '../lib/enVivo/codigo';
import { entrar, nombreParaLaSesion, salir } from '../lib/enVivo/conexion';
import { useSesionEnVivo } from '../lib/enVivo/estado';
import { prepararVuelta } from '../lib/enVivo/guardadoSesion';
import { useUI } from '../components/ui';
import Guardadas from '../components/enVivo/Guardadas';
import Mesa from '../components/enVivo/Mesa';
import '../components/enVivo/enVivo.css';

// Estudiar en vivo: a session made here or entered with a code. The code of an invitation comes in the link's #fragment,
// which never reaches a server, and leaves the address before anything else happens. A link opened without signing in
// waits in memory for whoever signs in (ConSesion.jsx).

function codigoDelLink() {
  let codigo = null;
  try {
    codigo = leerCodigo(decodeURIComponent(location.hash.slice(1)));
  } catch {
    // A broken address: no invitation.
  }
  if (location.hash) history.replaceState(history.state, '', location.pathname + location.search);
  return codigo;
}

export default function EnVivo() {
  const actual = useSesionEnVivo();
  const { avisar } = useUI();
  const id = useId();
  const [invitacion, setInvitacion] = useState(() => codigoDelLink() ?? tomarInvitacion());
  const [escrito, setEscrito] = useState(() => (invitacion ? mostrarCodigo(invitacion) : ''));
  const [error, setError] = useState('');
  // Who ended the session for everyone: said here until something else is done, not only in a passing notice.
  const [terminada, setTerminada] = useState('');
  const [errorArmar, setErrorArmar] = useState('');
  const [entrando, setEntrando] = useState(false);
  useSeo({ titulo: tituloDe('Estudiar en vivo'), noindex: true });
  const campo = useRef(null);
  const titulo = useRef(null);
  const enSesion = Boolean(actual);
  const primera = useRef(true);
  useEffect(() => {
    if (primera.current) {
      primera.current = false;
      return;
    }
    if (enSesion) titulo.current?.focus();
  }, [enSesion]);

  // The link pasted in this same tab: only the #fragment changes, and the page does not load again.
  const enSesionCon = actual?.codigo;
  useEffect(() => {
    const alCambiar = () => {
      const codigo = codigoDelLink();
      if (!codigo || codigo === enSesionCon) return;
      setInvitacion(codigo);
      setEscrito(mostrarCodigo(codigo));
      setError('');
      setTerminada('');
      if (enSesionCon) avisar('Te invitaron a otra sesión. Salí de esta para entrar.');
      else campo.current?.focus();
    };
    window.addEventListener('hashchange', alCambiar);
    return () => window.removeEventListener('hashchange', alCambiar);
  }, [enSesionCon, avisar]);

  const ocupado = useRef(false);
  const unirse = useCallback(async (codigo, armada) => {
    if (ocupado.current) return;
    ocupado.current = true;
    setEntrando(true);
    setError('');
    setErrorArmar('');
    setTerminada('');
    try {
      // Back to a session kept here: the same person (still the one who made it, if it was), and its files come back.
      const vuelta = armada ? null : await prepararVuelta(codigo).catch(() => null);
      const nombre = await nombreParaLaSesion();
      if (vuelta?.terminada) {
        // Ended for everyone: it does not open again. Its copy does, in a new session with another code.
        await entrar({ codigo: nuevoCodigo(), nombre, anfitrion: true, armada: true, persona: vuelta.persona, copia: vuelta.copia });
        avisar('Esa sesión terminó. Esta es tu copia, con otro código.');
        return;
      }
      await entrar({ codigo, nombre, anfitrion: armada || Boolean(vuelta?.anfitrion), armada, persona: vuelta?.persona ?? null });
    } catch (e) {
      if (e.reemplazada) return;
      const texto = e.conocido ? e.message : 'No se pudo entrar. Revisá internet y probá de nuevo.';
      // Said next to the button that was pressed; the focus stays there when it was «Armar sesión».
      if (armada) setErrorArmar(texto);
      else {
        setError(texto);
        campo.current?.focus();
      }
    } finally {
      ocupado.current = false;
      setEntrando(false);
    }
  }, [avisar]);

  const armar = () => unirse(nuevoCodigo(), true);
  const conCodigo = (e) => {
    e.preventDefault();
    const codigo = leerCodigo(escrito);
    if (!codigo) {
      setError('Ese código no es de una sesión. Son 12 letras y números, como ABCD-EFGH-JKMN.');
      campo.current?.focus();
      return;
    }
    unirse(codigo, false);
  };

  const alSalir = useCallback(() => {
    salir();
    titulo.current?.focus();
  }, []);
  const alTerminar = useCallback((fin) => {
    salir();
    const texto = `${fin?.por || 'Quien la armó'} terminó la sesión.`;
    avisar(texto);
    // Its invitation is over: the page goes back to how it is without one.
    setInvitacion(null);
    setEscrito('');
    setTerminada(texto);
    titulo.current?.focus();
  }, [avisar]);

  if (actual) {
    return (
      <article className="envivo" aria-labelledby={`${id}-t`}>
        <h1 id={`${id}-t`} ref={titulo} tabIndex={-1} className="solo-lectores">Estudiar en vivo</h1>
        <Mesa sesion={actual.sesion} codigo={actual.codigo} estado={actual.estado} anfitrion={actual.anfitrion} alSalir={alSalir} alTerminar={alTerminar} />
      </article>
    );
  }

  return (
    <article className="contenedor pagina envivo-entrada" aria-labelledby={`${id}-t`} aria-busy={entrando || undefined}>
      <h1 id={`${id}-t`} ref={titulo} tabIndex={-1}>Estudiar en vivo</h1>
      <p className="envivo-entrada__bajada">Armá una sesión, pasale el código a tus compañeros y trabajen en la misma mesa. Documento, pizarra, Laboratorio, apuntes y Consultron.</p>
      {invitacion && <p className="envivo-entrada__invitacion">Te invitaron a una sesión. Entrá cuando quieras.</p>}
      {terminada && <p className="envivo-entrada__invitacion">{terminada} Quedó en «Tus sesiones».</p>}
      <div className="envivo-entrada__opciones">
        <section className="envivo-entrada__opcion" aria-labelledby={`${id}-codigo`}>
          <h2 id={`${id}-codigo`}>Entrar con un código</h2>
          <form onSubmit={conCodigo} noValidate>
            <div className="campo">
              <label className="campo__etiqueta" htmlFor={`${id}-c`}>Código de la sesión</label>
              <input
                ref={campo}
                id={`${id}-c`}
                className="campo__control envivo-entrada__campo"
                value={escrito}
                onChange={(e) => setEscrito(e.target.value.toUpperCase())}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                placeholder="ABCD-EFGH-JKMN"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${id}-e` : undefined}
              />
              {error && <span id={`${id}-e`} className="campo__error" role="alert">{error}</span>}
            </div>
            <button type="submit" className="boton" aria-disabled={entrando || undefined}>{entrando ? 'Entrando…' : 'Entrar'}</button>
          </form>
        </section>
        {!invitacion && (
          <section className="envivo-entrada__opcion" aria-labelledby={`${id}-armar`}>
            <h2 id={`${id}-armar`}>Armar una sesión</h2>
            <p>Te damos un código para pasar por Discord o WhatsApp. Entran hasta 10 personas.</p>
            <button type="button" className="boton boton--secundario" onClick={armar} aria-disabled={entrando || undefined}>{entrando ? 'Armando…' : 'Armar sesión'}</button>
            {errorArmar && <p className="campo__error" role="alert">{errorArmar}</p>}
          </section>
        )}
      </div>
      <Guardadas alVolver={(codigo) => unirse(codigo, false)} ocupado={entrando} />
      <p className="envivo-entrada__nota">Todo viaja cifrado y el servidor no guarda nada. La mesa queda en tu navegador para volver con el código.</p>
    </article>
  );
}
