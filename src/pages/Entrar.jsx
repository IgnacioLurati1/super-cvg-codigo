import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import Campo from '../components/Campo';
import { vaACompartir } from '../components/ConSesion';
import Cuaderno3D from '../components/cuaderno3d/Cuaderno3D';
import Entrada3D from '../components/entrada3d/Entrada3D';
import { textoError } from '../lib/errores';
import { CLIENTE_GOOGLE, cancelarConexion, conectarGoogle, olvidarGoogle } from '../lib/google';
import { CAMPUS, pedirClave } from '../lib/moodle';
import { SITIO } from '../../sitio.config.js';
import { useDatosEstructurados } from '../lib/seo';
import { iniciarSesion } from '../lib/sesion';

// On a phone «Seguir conectado» goes above Entrar, where it is seen without scrolling; on a computer, last. In the
// markup, not with CSS order, so the keyboard follows what is seen.
const CELU = '(max-width: 40rem)';
const suscribirCelu = (f) => {
  const consulta = window.matchMedia(CELU);
  consulta.addEventListener('change', f);
  return () => consulta.removeEventListener('change', f);
};
const useCelu = () => useSyncExternalStore(suscribirCelu, () => window.matchMedia(CELU).matches, () => false);

// What Google reads about the site, from what's true of it: free, on the web, for studying, by Luta Studios.
const APLICACION = {
  '@type': 'WebApplication',
  name: SITIO.nombre,
  url: `${SITIO.url}/`,
  description: SITIO.descripcion,
  applicationCategory: 'EducationalApplication',
  operatingSystem: 'Web',
  inLanguage: SITIO.idioma,
  isAccessibleForFree: true,
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'ARS' },
  creator: { '@type': 'Organization', name: 'Luta Studios', url: 'https://lutastudios.com/' },
};

export default function Entrar() {
  useDatosEstructurados(APLICACION);
  const [usuario, setUsuario] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [recordar, setRecordar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [faltantes, setFaltantes] = useState({});
  // «Entrar con Google» (entrarConGoogle.js), while Google's window is open and the file is read.
  const [conGoogle, setConGoogle] = useState(false);
  const campoUsuario = useRef(null);
  const campoContrasena = useRef(null);
  const botonGoogle = useRef(null);
  const volverAlBoton = useRef(false);
  const ayudaRecordar = useId();
  const enCelu = useCelu();
  // Something shared from another app waits for whoever signs in (ConSesion.jsx).
  const [aCompartir] = useState(vaACompartir);
  const formulario = useRef(null);
  // On a phone the form is below the fold: it comes into sight with the reason to sign in.
  useEffect(() => {
    if (aCompartir) formulario.current?.scrollIntoView({ block: 'start' });
  }, [aCompartir]);

  useEffect(() => {
    if (conGoogle || !volverAlBoton.current) return;
    volverAlBoton.current = false;
    botonGoogle.current?.focus();
  }, [conGoogle]);

  const entrar = async (evento) => {
    evento.preventDefault();
    if (enviando || conGoogle) return;
    const faltan = { usuario: usuario.trim() ? '' : 'Escribí tu usuario del campus.', contrasena: contrasena ? '' : 'Escribí tu contraseña del campus.' };
    setFaltantes(faltan);
    setError('');
    if (faltan.usuario || faltan.contrasena) {
      (faltan.usuario ? campoUsuario : campoContrasena).current.focus();
      return;
    }
    setEnviando(true);
    try {
      iniciarSesion(await pedirClave(usuario.trim(), contrasena), { recordar });
    } catch (e) {
      setError(textoError(e));
      setEnviando(false);
    }
  };

  // Google's window opens on this same click: later the browser would block it.
  const entrarGoogle = async () => {
    if (conGoogle || enviando) return;
    setError('');
    setFaltantes({});
    setConGoogle(true);
    const ventana = conectarGoogle('cuenta');
    try {
      // The rest loads only now: whoever comes in with the password never downloads it.
      const [{ entrarConGoogle }] = await Promise.all([import('../lib/entrarConGoogle'), ventana]);
      await entrarConGoogle({ recordar });
    } catch (e) {
      // The permission asked only for this goes, without telling Google: the other devices use it.
      olvidarGoogle();
      if (e.codigo !== 'cancelada') setError(e.conocido && e.message ? e.message : textoError(e));
      volverAlBoton.current = true;
      setConGoogle(false);
    }
  };

  // For both ways in: with Google too.
  const seguirConectado = (
    <div className="entrar__recordar">
      <label className="entrar__recordar-casilla">
        <input type="checkbox" checked={recordar} onChange={(e) => setRecordar(e.target.checked)} aria-describedby={ayudaRecordar} />
        Seguir conectado en este dispositivo
      </label>
      <p id={ayudaRecordar} className="entrar__recordar-ayuda">{CLIENTE_GOOGLE && 'Vale también para Entrar con Google. '}También ves tus materias y los archivos que abriste sin internet. Si no lo marcás, cada pestaña nueva te pide entrar otra vez.</p>
    </div>
  );

  return (
    <section className="contenedor pagina entrar" aria-labelledby="entrar-titulo">
      {/* Behind the whole page, only with a real graphics card: the faculty's entrance (also at /entrada). */}
      <Entrada3D modo="fondo" />
      <div className="entrar__texto">
        <h1 id="entrar-titulo" data-aparece="">Todo lo que tenés que entregar, en una sola pantalla</h1>
        <p className="entrar__bajada" data-aparece="" style={{ '--orden': 1 }}>Entregas, archivos y notas de tus materias del CVG, el campus virtual de UTN FRRO.{CLIENTE_GOOGLE && ' Si tu materia usa Google Classroom, también sus temas, avisos y tareas.'}</p>
        <Cuaderno3D />
        <ul className="entrar__promesas" data-aparece="" style={{ '--orden': 2 }}>
          <li>Tu contraseña va directo al campus y no se guarda.</li>
          <li>Solo lee, salvo cuando te inscribís a una materia, entregás una tarea o mandás un mensaje. Antes de inscribirte o entregar, te pregunta. No publica nada{CLIENTE_GOOGLE ? ', tampoco en Classroom' : ''}, y lo único que marca son los mensajes que abrís, como leídos.</li>
          <li>No es una página oficial de UTN. Si preferís, seguí usando <a href={CAMPUS} target="_blank" rel="noreferrer">el campus</a>.</li>
        </ul>
      </div>
      <form ref={formulario} className="entrar__formulario" onSubmit={entrar} noValidate>
        <h2>Entrá con tu cuenta del campus</h2>
        {aCompartir && <p className="mensaje">Entrá para seguir con lo que compartiste.</p>}
        <Campo etiqueta="Usuario" error={faltantes.usuario}>
          <input ref={campoUsuario} className="campo__control" name="username" autoComplete="username" autoCapitalize="none" spellCheck="false" value={usuario} onChange={(e) => setUsuario(e.target.value)} />
        </Campo>
        <Campo etiqueta="Contraseña" error={faltantes.contrasena}>
          <input ref={campoContrasena} className="campo__control" name="password" type="password" autoComplete="current-password" value={contrasena} onChange={(e) => setContrasena(e.target.value)} />
        </Campo>
        {error && <div className="mensaje mensaje--error" role="alert"><p>{error}</p></div>}
        {enCelu && seguirConectado}
        <button type="submit" className="boton entrar__boton" aria-disabled={enviando || conGoogle ? 'true' : undefined}>{enviando ? 'Entrando' : 'Entrar'}</button>
        {CLIENTE_GOOGLE && (
          <div className="entrar__google">
            <p className="entrar__o">¿Lo vinculaste con Google en Configuración?</p>
            <button ref={botonGoogle} type="button" className="boton boton--secundario entrar__boton" onClick={entrarGoogle} aria-disabled={conGoogle ? 'true' : undefined}>
              {conGoogle ? 'Terminá en la ventana de Google' : 'Entrar con Google'}
            </button>
            {conGoogle && <button type="button" className="boton boton--secundario" onClick={cancelarConexion}>Cancelar</button>}
          </div>
        )}
        {!enCelu && seguirConectado}
      </form>
    </section>
  );
}
