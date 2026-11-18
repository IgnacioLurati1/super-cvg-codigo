import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArchivoElegido, ArchivoSaliendo, ConectarDrive, TarjetaAdjunto } from '../components/Adjunto';
import Campo from '../components/Campo';
import { Cargando, ErrorConReintento } from '../components/Filas';
import { Bloques } from '../components/TextoConFormato';
import { clienteDeAdjuntos, descartarAdjunto, largoDelAdjunto, PIDE_CONECTAR, prepararAdjunto, problemaDeArchivo, sanearNombre, textoConAdjunto } from '../lib/adjuntos';
import { peso } from '../lib/datos';
import { buscarPersonas, cargarConversaciones, cargarFoto, cargarMensajes, CONVERSACIONES_POR_TANDA, escribirA, marcarComoLeida, responderEn } from '../lib/campus';
import { textoError } from '../lib/errores';
import { conectarGoogle, permisoGoogle, useGoogle } from '../lib/google';
import { cuandoCorto, diaDeMensajes, filtrarConversaciones, horaDeMensaje, iniciales, juntarMensajes, LARGO_MAXIMO, largoEnBytes, porDia } from '../lib/mensajes';
import { CAMPUS } from '../lib/moodle';
import { tituloDe, useSeo } from '../lib/seo';
import { useToken } from '../lib/sesion';
import { clienteDeTemporales, prepararTemporal, TOPE_TEMPORAL, TOPE_TEMPORAL_EN_TEXTO } from '../lib/temporales';
import { useImagenQuieta } from '../lib/imagenQuieta';
import { useConsulta } from '../lib/useConsulta';
import { useQuieto } from '../lib/useQuieto';
import { alMenosSinLeer, restarSinLeer, useNumeroSinLeer } from '../lib/useSinLeer';
import './panel.css';
import './mensajes.css';

// With a keyboard at hand Enter sends; on a touch screen, with no Shift for a new line, only the button does.
const conTeclado = typeof window !== 'undefined' && Boolean(window.matchMedia?.('(hover: hover) and (pointer: fine)').matches);

// Private messages of the campus: the conversations, one of them, and writing. Reading is like the rest of Super CVG,
// in memory only. A message goes when Mandar is touched (or Enter, with a keyboard), and opening a conversation marks it
// as read in the campus, like opening it there. Side by side when there is room; on a phone, one or the other.

// Below this width (in rem, so a bigger letter folds it sooner) the list and the conversation take turns.
const ANGOSTA_EN_REM = 48;
const rem = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
// Two messages of the same person this close make one run: one name over them, less room between them.
const SEGUIDO = 5 * 60;
const CERCA_DEL_TOPE = 300;

// What was typed and didn't go, per conversation, so moving to another one doesn't lose it. In memory only, and per
// session: whoever comes in next starts clean.
const borradores = new Map();
let serie = 0;

function useAngosta(caja) {
  const [angosta, setAngosta] = useState(() => window.innerWidth < ANGOSTA_EN_REM * rem());
  useLayoutEffect(() => {
    const el = caja.current;
    if (!el) return undefined;
    const observador = new ResizeObserver(() => setAngosta(el.clientWidth < ANGOSTA_EN_REM * rem()));
    observador.observe(el);
    return () => observador.disconnect();
  }, [caja]);
  return angosta;
}

/** The blob address of a picture of the campus, once it comes. Null while it comes, and when there is none. */
function useFoto(direccion) {
  const [foto, setFoto] = useState({ de: null, src: null });
  useEffect(() => {
    if (!direccion) return undefined;
    let vivo = true;
    cargarFoto(direccion).then((src) => vivo && setFoto({ de: direccion, src }), () => {});
    return () => {
      vivo = false;
    };
  }, [direccion]);
  return foto.de === direccion ? foto.src : null;
}

const DIBUJO_GRUPO = (
  <svg viewBox="0 0 24 24" focusable="false">
    <circle cx="9" cy="8" r="3" />
    <path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6M16 5.3a3 3 0 0 1 0 5.4M18 14.5c1.9.8 3 2.8 3 5.5" />
  </svg>
);

/** A person or a group: their picture when they uploaded one, otherwise the initials (or people, for a group). Always
 * next to the name, so it says nothing on its own. */
function Avatar({ nombre, foto, id, grupo = false, chico = false }) {
  // With «Sensible a la luz», always still: it is only decoration, with nothing to tap.
  const { src } = useImagenQuieta(useFoto(foto));
  let dentro = iniciales(nombre);
  if (src) dentro = <img src={src} alt="" decoding="async" />;
  else if (grupo) dentro = DIBUJO_GRUPO;
  return (
    <span className={`mensajes__avatar${chico ? ' mensajes__avatar--chico' : ''}`} data-tono={Math.abs(id ?? 0) % 6} aria-hidden="true">
      {dentro}
    </span>
  );
}

function vistaPrevia(c, yo) {
  if (!c.ultimo) return 'Sin mensajes todavía';
  const texto = (c.ultimo.vista ?? c.ultimo.texto) || 'Mensaje sin texto';
  if (c.ultimo.de === yo) return `Vos: ${texto}`;
  if (c.grupo && c.persona) return `${c.persona.nombre.split(' ')[0]}: ${texto}`;
  return texto;
}

const enlaceAlCampus = (c) => {
  if (c.grupo && c.id) return `${CAMPUS}/message/index.php?convid=${c.id}`;
  return c.persona ? `${CAMPUS}/message/index.php?id=${c.persona.id}` : null;
};

function FilaConversacion({ c, yo, activa, ahora, onAbrir }) {
  const cuando = c.ultimo?.cuando;
  return (
    <li className="mensajes__conversacion-fila" data-conversacion={c.id} data-sin-leer={c.sinLeer > 0 || undefined}>
      <button type="button" className="mensajes__abrir" aria-current={activa ? 'true' : undefined} onClick={() => onAbrir(c)}>
        <Avatar nombre={c.nombre} foto={c.foto} id={c.persona?.id ?? c.id} grupo={c.grupo} />
        <span className="mensajes__fila-texto">
          <span className="mensajes__fila-arriba">
            <span className="mensajes__nombre">
              <span className="mensajes__nombre-texto">{c.nombre}</span>
              {c.detalle && <span className="mensajes__detalle"><span className="solo-lectores">, </span>{c.detalle}</span>}
            </span>
            {cuando > 0 && (
              <time className="mensajes__cuando" dateTime={new Date(cuando * 1000).toISOString()}>
                <span className="solo-lectores">, </span>{cuandoCorto(cuando, ahora)}
              </time>
            )}
          </span>
          <span className="mensajes__fila-abajo">
            <span className="mensajes__ultimo"><span className="solo-lectores">, </span>{vistaPrevia(c, yo)}</span>
            {c.sinLeer > 0 && (
              <span className="mensajes__sin-leer">
                <span className="solo-lectores">, </span>{c.sinLeer}<span className="solo-lectores"> sin leer</span>
              </span>
            )}
          </span>
        </span>
      </button>
    </li>
  );
}

function Lista({ lista, ahora, consulta, onConsulta, activa, onAbrir, onNuevo, onMas, hayNuevos, onActualizar, onReintentar }) {
  const idTitulo = useId();
  const titulo = useRef(null);
  const idFiltro = useId();
  const filtradas = filtrarConversaciones(lista.conversaciones, consulta);
  const conConsulta = consulta.trim().length > 0;
  let cuenta = '';
  if (conConsulta && !lista.cargando) {
    if (!filtradas.length) cuenta = lista.mas ? 'No está entre las que se ven. Tocá Ver más para traer más.' : 'No encontramos conversaciones con eso.';
    else cuenta = filtradas.length === 1 ? 'Una conversación' : `${filtradas.length} conversaciones`;
  }

  return (
    <section className="mensajes__lista-panel" aria-labelledby={idTitulo}>
      <div className="mensajes__lista-cabeza">
        <h1 id={idTitulo} ref={titulo} tabIndex={-1}>Mensajes</h1>
        <button type="button" className="boton boton--chico mensajes__nuevo" onClick={onNuevo}>Mensaje nuevo</button>
      </div>
      {(lista.conversaciones.length > 0 || conConsulta) && (
        <div className="mensajes__filtro">
          <label htmlFor={idFiltro} className="solo-lectores">Buscar en tus conversaciones</label>
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.4-4.4" /></svg>
          <input
            id={idFiltro}
            className="campo__control"
            type="search"
            placeholder="Buscar en tus conversaciones"
            autoComplete="off"
            spellCheck="false"
            enterKeyHint="search"
            value={consulta}
            onChange={(e) => onConsulta(e.target.value)}
          />
        </div>
      )}
      {hayNuevos && (
        <p className="mensajes__llegaron" role="status">
          Te llegaron mensajes nuevos.
          <button
            type="button"
            className="boton boton--secundario boton--chico"
            onClick={() => {
              onActualizar();
              titulo.current?.focus();
            }}
          >
            Actualizar
          </button>
        </p>
      )}
      <p className={cuenta && !filtradas.length ? 'mensajes__nada-filtro' : 'solo-lectores'} role="status">{cuenta}</p>
      <div className="mensajes__lista-cuerpo" aria-busy={lista.cargando ? 'true' : undefined}>
        {lista.cargando && !lista.conversaciones.length && <Cargando texto="Buscando tus conversaciones" cuantas={6} />}
        {lista.error && !lista.conversaciones.length && <ErrorConReintento texto={lista.error} recargar={onReintentar} />}
        {!lista.cargando && !lista.error && !lista.conversaciones.length && (
          <div className="mensajes__vacio">
            <p>Todavía no tenés mensajes en el campus.</p>
            <button type="button" className="boton boton--secundario boton--chico" onClick={onNuevo}>Escribirle a alguien</button>
          </div>
        )}
        {filtradas.length > 0 && (
          <ul className="mensajes__conversaciones">
            {filtradas.map((c) => (
              <FilaConversacion key={c.id} c={c} yo={lista.yo} activa={c.id === activa} ahora={ahora} onAbrir={onAbrir} />
            ))}
          </ul>
        )}
        {lista.mas && (
          <div className="mensajes__mas">
            <button type="button" className="boton boton--secundario boton--chico" aria-disabled={lista.cargandoMas ? 'true' : undefined} onClick={onMas}>
              {lista.cargandoMas ? 'Buscando más' : 'Ver más'}<span className="solo-lectores"> conversaciones</span>
            </button>
            {lista.errorMas && <p className="mensajes__error" role="alert">{lista.errorMas}</p>}
          </div>
        )}
      </div>
    </section>
  );
}

/** The head of the right side: the name, and on a phone, the way back to the list. */
function Cabeza({ angosta, onVolver, titulo, idTitulo, nombre, subtitulo = null, avatar = null, enlace = null }) {
  return (
    <header className="mensajes__cabeza">
      {angosta && <button type="button" className="boton boton--secundario boton--chico mensajes__volver" onClick={onVolver}>Volver</button>}
      {avatar}
      <div className="mensajes__titulos">
        <h2 id={idTitulo} ref={titulo} tabIndex={-1}>{nombre}</h2>
        {subtitulo}
      </div>
      {enlace && (
        <a className="mensajes__campus" href={enlace} target="_blank" rel="noreferrer">
          Abrir en el campus<span className="solo-lectores">, se abre en otra pestaña</span>
        </a>
      )}
    </header>
  );
}

function Burbuja({ m, mio, autor, conAutor, seguido, onProbar, onEditar, onCancelar }) {
  const hora = m.cuando ? horaDeMensaje(m.cuando) : '';
  let contenido = null;
  if (m.bloques?.length) contenido = <Bloques bloques={m.bloques} />;
  else if (m.estado) contenido = m.texto ? <p className="mensajes__plano">{m.texto}</p> : null;
  else if (!m.adjunto) contenido = <p className="mensajes__sin-texto">Trae algo que acá no se ve. Miralo en el campus.</p>;
  let archivo = null;
  if (m.adjunto?.url) archivo = <TarjetaAdjunto adjunto={m.adjunto} cuando={m.cuando} />;
  else if (m.adjunto) archivo = <ArchivoSaliendo adjunto={m.adjunto} fallo={m.estado === 'fallo'} />;
  // Until the link is in the campus: once the message goes, it can't come back.
  const cancelable = m.estado === 'saliendo' && m.adjunto && !m.adjunto.url && m.adjunto.paso !== 'mandando';
  return (
    <li className="mensajes__burbuja" data-mio={mio || undefined} data-estado={m.estado} data-seguido={seguido || undefined} data-subiendo={(m.adjunto && !m.adjunto.url) || undefined}>
      {conAutor && <p className="mensajes__autor" aria-hidden="true">{autor}</p>}
      <div className="mensajes__globo">
        <span className="solo-lectores">{m.estado === 'saliendo' ? `${autor}, saliendo. ` : `${autor}${hora ? `, ${hora}` : ''}. `}</span>
        {archivo}
        {contenido}
        <span className="mensajes__hora" aria-hidden="true">{m.estado === 'saliendo' ? 'Saliendo' : hora}</span>
      </div>
      {cancelable && (
        <button type="button" className="boton boton--secundario boton--chico mensajes__cancelar" onClick={() => onCancelar(m)}>
          Cancelar<span className="solo-lectores"> el envío de {m.adjunto.nombre}</span>
        </button>
      )}
      {m.estado === 'fallo' && (
        <div className="mensajes__fallo">
          <p><strong>No salió.</strong> {m.error}</p>
          <div className="mensajes__fallo-botones">
            <button type="button" className="boton boton--secundario boton--chico" onClick={() => onProbar(m)}>Probar de nuevo</button>
            <button type="button" className="boton boton--secundario boton--chico" onClick={() => onEditar(m)}>Editar</button>
          </div>
        </div>
      )}
    </li>
  );
}

const porId = (personas) => Object.fromEntries(personas.map((p) => [p.id, p]));

/** One conversation, or a new one with someone (`c.id` empty): the messages from the oldest on, and writing. */
function Charla({ c, yo, angosta, pulso, ahora, enfocar, onVolver, onLeida, onEnviado, onCreada }) {
  const token = useToken();
  const clave = `${token}:${c.id ?? `p${c.persona?.id}`}`;
  const nueva = !c.id;
  const idTitulo = useId();
  const idCampo = useId();
  const idLargo = useId();
  const titulo = useRef(null);
  const campo = useRef(null);
  const hiloRef = useRef(null);
  // How the thread scrolls after the next change: to the bottom, or keeping what was in view when older ones come in.
  const ajuste = useRef(null);
  const marcando = useRef(false);
  const pulsoVisto = useRef(pulso);
  const inicial = c.inicial ?? [];
  const [hilo, setHilo] = useState(() => ({ mensajes: inicial, miembros: {}, mas: false, desde: inicial.length, cargando: !nueva && !inicial.length, error: '', cargandoMas: false, errorMas: '' }));
  const [intento, setIntento] = useState(0);
  const [propios, setPropios] = useState(() => borradores.get(clave)?.propios ?? []);
  const [texto, setTexto] = useState(() => borradores.get(clave)?.texto ?? '');
  // The file chosen for the next message (lib/adjuntos.js), and the first time, what happens with it.
  const [adjunto, setAdjunto] = useState(() => borradores.get(clave)?.adjunto ?? null);
  const [soltando, setSoltando] = useState(false);
  const [soltado, setSoltado] = useState(null);
  const [adjuntar, setAdjuntar] = useState(false);
  const [problema, setProblema] = useState('');
  const google = useGoogle('adjuntos');
  const elegir = useRef(null);
  // Where the file of the browser's window goes: 'drive' or 'temporal' (without Drive, temporales.js).
  const via = useRef('drive');
  // Where the page was before the notice of where the file goes: it grows the page, and «Ahora no» brings it back.
  const alturaAntes = useRef(null);
  const volverAlCerrar = useRef(false);
  const abrirAviso = () => {
    alturaAntes.current = window.scrollY;
    setAdjuntar(true);
  };
  useLayoutEffect(() => {
    if (adjuntar || !volverAlCerrar.current) return;
    volverAlCerrar.current = false;
    if (alturaAntes.current !== null) window.scrollTo({ top: alturaAntes.current });
  }, [adjuntar]);
  const botonAdjuntar = useRef(null);
  const controles = useRef(new Map());
  const idElegido = useId();
  const idProblema = useId();
  const [aviso, setAviso] = useState('');
  // The same words twice are only read again if something changes: a trailing dot does.
  const anunciar = (t) => setAviso((a) => (a === t ? `${t}.` : t));

  useEffect(() => {
    if (enfocar === 'campo') campo.current?.focus();
    else titulo.current?.focus({ preventScroll: true });
    // Only when it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const fallidos = propios.filter((p) => p.estado === 'fallo');
    if (texto || adjunto || fallidos.length) borradores.set(clave, { texto, adjunto, propios: fallidos });
    else borradores.delete(clave);
  }, [clave, texto, adjunto, propios]);

  useEffect(() => {
    if (nueva) return undefined;
    let vivo = true;
    cargarMensajes(c.id, 0, { fresco: intento > 0 }).then(
      (t) => {
        if (!vivo) return;
        ajuste.current = 'abajo';
        setHilo((h) => {
          const mensajes = juntarMensajes(h.mensajes, t.mensajes);
          return { ...h, mensajes, miembros: { ...h.miembros, ...porId(t.miembros) }, mas: t.mas, desde: Math.max(h.desde, t.mensajes.length), cargando: false, error: '' };
        });
      },
      (e) => vivo && setHilo((h) => ({ ...h, cargando: false, error: textoError(e) })),
    );
    return () => {
      vivo = false;
    };
  }, [c.id, nueva, intento]);

  // «Actualizar» in the list also brings what came into this conversation.
  useEffect(() => {
    if (pulso === pulsoVisto.current || nueva) return;
    pulsoVisto.current = pulso;
    cargarMensajes(c.id, 0, { fresco: true }).then((t) => {
      ajuste.current = 'abajo';
      setHilo((h) => {
        const vistos = new Set(h.mensajes.map((m) => m.id));
        const llegaron = t.mensajes.filter((m) => !vistos.has(m.id)).length;
        return { ...h, mensajes: juntarMensajes(h.mensajes, t.mensajes), miembros: { ...h.miembros, ...porId(t.miembros) }, desde: h.desde + llegaron };
      });
    }, () => {});
  }, [pulso, c.id, nueva]);

  // Opened with unread messages: marked as read in the campus, like opening it there. It doesn't ask.
  const cargada = !hilo.cargando && !hilo.error;
  useEffect(() => {
    if (nueva || !cargada || !(c.sinLeer > 0) || marcando.current) return;
    marcando.current = true;
    marcarComoLeida(c.id).then(
      () => {
        restarSinLeer();
        onLeida(c.id);
      },
      () => {},
    ).finally(() => {
      marcando.current = false;
    });
  }, [nueva, cargada, c.sinLeer, c.id, onLeida]);

  useLayoutEffect(() => {
    const el = hiloRef.current;
    const a = ajuste.current;
    if (!el || !a) return;
    ajuste.current = null;
    el.scrollTop = a === 'abajo' ? el.scrollHeight : el.scrollHeight - a.desdeAbajo;
  });

  // When the box below grows (a file chosen, a long text) and the last message was in sight, it stays in sight.
  useEffect(() => {
    const el = hiloRef.current;
    if (!el) return undefined;
    let alFondo = true;
    let alto = el.clientHeight;
    // The browser can move the scroll while the box changes size, before the observer hears it: against the taller one.
    const alMover = () => {
      alFondo = el.scrollHeight - el.scrollTop - Math.max(alto, el.clientHeight) < 8;
    };
    const observador = new ResizeObserver(() => {
      if (el.clientHeight < alto && alFondo) el.scrollTop = el.scrollHeight;
      alto = el.clientHeight;
    });
    el.addEventListener('scroll', alMover, { passive: true });
    observador.observe(el);
    return () => {
      observador.disconnect();
      el.removeEventListener('scroll', alMover);
    };
  }, []);

  useLayoutEffect(() => {
    const el = campo.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight + 2, 200)}px`;
  }, [texto]);

  const anteriores = async () => {
    if (hilo.cargandoMas) return;
    setHilo((h) => ({ ...h, cargandoMas: true, errorMas: '' }));
    try {
      const t = await cargarMensajes(c.id, hilo.desde);
      const el = hiloRef.current;
      ajuste.current = el ? { desdeAbajo: el.scrollHeight - el.scrollTop } : null;
      setHilo((h) => ({ ...h, mensajes: juntarMensajes(h.mensajes, t.mensajes), miembros: { ...h.miembros, ...porId(t.miembros) }, mas: t.mas, desde: h.desde + t.mensajes.length, cargandoMas: false }));
    } catch (e) {
      setHilo((h) => ({ ...h, cargandoMas: false, errorMas: textoError(e) }));
    }
  };

  const p = c.persona;
  let noPuede = '';
  if (!c.grupo && p?.borrada) noPuede = 'Esta cuenta ya no está en el campus.';
  else if (!c.grupo && p?.bloqueada) noPuede = 'Bloqueaste a esta persona en el campus. Para escribirle, desbloqueala ahí.';
  else if (!c.grupo && p?.puedeRecibir === false) noPuede = 'Esta persona no recibe mensajes tuyos por ahora.';

  // The two lines of the file count too.
  const delArchivo = (a) => (a ? largoDelAdjunto(a.nombre, a.bytes) : 0);
  const quedan = LARGO_MAXIMO - largoEnBytes(texto.trim()) - delArchivo(adjunto);
  let largo = '';
  if (quedan < 0) largo = `Es muy largo para el campus. Sacale ${-quedan} caracteres.`;
  else if (quedan <= CERCA_DEL_TOPE) largo = `Quedan ${quedan} caracteres.`;
  const vacio = !texto.trim() && !adjunto;

  // A file that went up to the Drive and is not going to be sent leaves it. One without Drive just expires.
  const descartar = async (a) => {
    if (a?.via !== 'temporal' && a?.subida?.id) descartarAdjunto(await clienteDeAdjuntos(), a.subida);
  };

  const mandar = async (escrito, reintento = null) => {
    const limpio = escrito.trim();
    const previo = reintento ? propios.find((x) => x.id === reintento) : null;
    const archivo = previo ? (previo.adjunto ?? null) : adjunto;
    if ((!limpio && !archivo) || largoEnBytes(limpio) + delArchivo(archivo) > LARGO_MAXIMO || noPuede) {
      campo.current?.focus();
      return;
    }
    // Google's window, when it has to show, opens right here, still in the click: after a wait the browser blocks it.
    const conDrive = archivo && archivo.via !== 'temporal';
    const conexion = conDrive && (PIDE_CONECTAR.has(previo?.codigo) || !permisoGoogle('adjuntos')) ? conectarGoogle('adjuntos') : null;
    conexion?.catch(() => {});
    const id = reintento ?? `local-${(serie += 1)}`;
    const control = archivo ? new AbortController() : null;
    if (control) controles.current.set(id, control);
    const saliendo = archivo && { archivo: archivo.archivo, nombre: archivo.nombre, bytes: archivo.bytes, via: archivo.via, subida: archivo.subida ?? {}, paso: 'subiendo', hecho: archivo.subida?.desde ?? 0 };
    ajuste.current = 'abajo';
    setPropios((lista) => [...lista.filter((x) => x.id !== id), { id, texto: limpio, estado: 'saliendo', cuando: Math.floor(Date.now() / 1000), adjunto: saliendo || null }]);
    if (!reintento) {
      setTexto('');
      setAdjunto(null);
      setProblema('');
    }
    anunciar(archivo ? 'Subiendo el archivo' : 'Mandando el mensaje');
    const avanzar = (cambio) => setPropios((lista) => lista.map((x) => (x.id === id && x.adjunto ? { ...x, adjunto: { ...x.adjunto, ...cambio } } : x)));
    try {
      let final = limpio;
      if (saliendo) {
        if (conexion) await conexion;
        const listo = saliendo.via === 'temporal'
          ? await prepararTemporal(saliendo.archivo, { cliente: await clienteDeTemporales(), nombre: saliendo.nombre, estado: saliendo.subida, senal: control.signal, alAvanzar: avanzar })
          : await prepararAdjunto(saliendo.archivo, { cliente: await clienteDeAdjuntos(), estado: saliendo.subida, senal: control.signal, alAvanzar: avanzar });
        avanzar({ paso: 'mandando' });
        final = textoConAdjunto(limpio, listo);
      }
      if (nueva) {
        const r = await escribirA(p.id, final);
        setPropios((lista) => lista.filter((x) => x.id !== id));
        anunciar('Mensaje enviado');
        onCreada(r, p);
        return;
      }
      const despuesDe = hilo.mensajes.reduce((max, m) => Math.max(max, m.id), 0);
      const m = await responderEn(c.id, final, { despuesDe });
      ajuste.current = 'abajo';
      setPropios((lista) => lista.filter((x) => x.id !== id));
      setHilo((h) => ({ ...h, mensajes: juntarMensajes(h.mensajes, [m]), desde: h.mensajes.some((x) => x.id === m.id) ? h.desde : h.desde + 1 }));
      anunciar('Mensaje enviado');
      onEnviado(c.id, m);
    } catch (e) {
      if (e.codigo === 'cancelada') {
        // Cancelled before it went: what was written and the file come back to the box.
        setPropios((lista) => lista.filter((x) => x.id !== id));
        if (limpio) setTexto((t) => (t.trim() ? `${t.trimEnd()}\n${limpio}` : limpio));
        if (saliendo) setAdjunto((a) => a ?? { archivo: saliendo.archivo, nombre: saliendo.nombre, bytes: saliendo.bytes, via: saliendo.via, subida: saliendo.subida });
        anunciar('Cancelaste el envío');
        campo.current?.focus();
        return;
      }
      setPropios((lista) => lista.map((x) => (x.id === id ? { ...x, estado: 'fallo', error: textoError(e), codigo: e.codigo } : x)));
      anunciar('El mensaje no salió');
    } finally {
      controles.current.delete(id);
    }
  };

  // The text comes back to the box, after what is already there, and the file in place of the one chosen.
  const editar = (m) => {
    setPropios((lista) => lista.filter((x) => x.id !== m.id));
    if (m.texto) setTexto((t) => (t.trim() ? `${t.trimEnd()}\n${m.texto}` : m.texto));
    if (m.adjunto) {
      descartar(adjunto);
      setAdjunto({ archivo: m.adjunto.archivo, nombre: m.adjunto.nombre, bytes: m.adjunto.bytes, via: m.adjunto.via, subida: m.adjunto.subida });
    }
    campo.current?.focus();
  };

  // With Google connected, the browser's window to pick a file; without it, where the file goes.
  const elegirArchivo = (donde) => {
    via.current = donde;
    elegir.current?.click();
  };
  const tocarAdjuntar = () => {
    setProblema('');
    if (google.conectado) elegirArchivo('drive');
    else abrirAviso();
  };

  // A file chosen in the browser's window or dropped on the conversation: it waits next to the message until Mandar.
  const tomar = (archivo, donde = via.current) => {
    setAdjuntar(false);
    setSoltado(null);
    const mal = donde === 'temporal' && archivo?.size > TOPE_TEMPORAL
      ? `Ese archivo pesa ${peso(archivo.size)}. Sin Google Drive, el tope es de ${TOPE_TEMPORAL_EN_TEXTO}.`
      : problemaDeArchivo(archivo);
    if (mal) {
      setProblema(mal);
      botonAdjuntar.current?.focus();
      return;
    }
    setProblema('');
    descartar(adjunto);
    setAdjunto({ archivo, nombre: sanearNombre(archivo.name), bytes: archivo.size, via: donde, subida: {} });
    campo.current?.focus();
  };

  const alElegir = (e) => {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (archivo) tomar(archivo);
  };

  // Dragged from a folder onto the conversation. Without Drive connected it waits for the notice of where it goes.
  const puedeSoltar = !noPuede;
  const conArchivos = (e) => [...(e.dataTransfer?.types ?? [])].includes('Files');
  const arrastres = useRef(0);
  // A file dropped where it can't go doesn't leave the page: the browser would open it and lose what was being written.
  const alArrastrar = (e) => {
    if (!conArchivos(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = puedeSoltar ? 'copy' : 'none';
  };
  const alEntrar = (e) => {
    if (!puedeSoltar || !conArchivos(e)) return;
    arrastres.current += 1;
    setSoltando(true);
  };
  const alSalir = () => {
    if (!arrastres.current) return;
    arrastres.current -= 1;
    if (!arrastres.current) setSoltando(false);
  };
  const alSoltar = (e) => {
    if (!conArchivos(e)) return;
    e.preventDefault();
    if (!puedeSoltar) return;
    arrastres.current = 0;
    setSoltando(false);
    const archivos = e.dataTransfer.files;
    if (!archivos?.length) return;
    if (google.conectado) tomar(archivos[0], 'drive');
    else {
      setProblema('');
      setSoltado(archivos[0]);
      abrirAviso();
    }
    if (archivos.length > 1 && !problemaDeArchivo(archivos[0])) setProblema('Va un archivo por mensaje. Quedó el primero.');
  };

  const sacar = () => {
    descartar(adjunto);
    setAdjunto(null);
    botonAdjuntar.current?.focus();
  };

  const alTeclear = (e) => {
    if (!conTeclado || e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
    e.preventDefault();
    if (!e.repeat) mandar(texto);
  };

  const miembros = { ...(c.persona ? { [c.persona.id]: c.persona } : {}), ...hilo.miembros };
  const autorDe = (m) => {
    if (m.de === yo) return 'Vos';
    return miembros[m.de]?.nombre ?? (c.grupo ? 'Alguien del grupo' : c.nombre);
  };
  const todos = [...hilo.mensajes, ...propios.map((x) => ({ ...x, de: yo }))];
  let detalle = null;
  if (c.grupo) detalle = <p className="mensajes__subtitulo">{[c.detalle, c.personas > 1 ? `${c.personas} personas` : c.personas === 1 ? 'Una persona' : ''].filter(Boolean).join(', ')}</p>;
  else if (nueva) detalle = <p className="mensajes__subtitulo">Conversación nueva</p>;

  return (
    <section className="mensajes__panel" aria-labelledby={idTitulo} data-soltando={soltando || undefined} onDragEnter={alEntrar} onDragOver={alArrastrar} onDragLeave={alSalir} onDrop={alSoltar}>
      {soltando && (
        <div className="mensajes__soltar" aria-hidden="true">
          <span>Soltalo para adjuntarlo</span>
        </div>
      )}
      <Cabeza
        angosta={angosta}
        onVolver={onVolver}
        titulo={titulo}
        idTitulo={idTitulo}
        avatar={<Avatar nombre={c.nombre} foto={c.foto} id={c.persona?.id ?? c.id} grupo={c.grupo} />}
        enlace={enlaceAlCampus(c)}
        nombre={c.nombre}
        subtitulo={detalle}
      />
      <div ref={hiloRef} className="mensajes__hilo" tabIndex={0} role="region" aria-label={`Mensajes con ${c.nombre}`} aria-busy={hilo.cargando ? 'true' : undefined}>
        {hilo.cargando && (
          <div className="mensajes__esqueleto" role="status">
            <span className="solo-lectores">Trayendo los mensajes</span>
            {['otro', 'otro', 'mio', 'otro', 'mio'].map((lado, i) => <span key={i} data-lado={lado} aria-hidden="true" />)}
          </div>
        )}
        {hilo.error && (
          <ErrorConReintento
            texto={hilo.error}
            recargar={() => {
              setHilo((h) => ({ ...h, cargando: true, error: '' }));
              setIntento((n) => n + 1);
            }}
          />
        )}
        {hilo.mas && (
          <div className="mensajes__anteriores">
            <button type="button" className="boton boton--secundario boton--chico" aria-disabled={hilo.cargandoMas ? 'true' : undefined} onClick={anteriores}>
              {hilo.cargandoMas ? 'Trayendo anteriores' : 'Ver anteriores'}
            </button>
            {hilo.errorMas && <p className="mensajes__error" role="alert">{hilo.errorMas}</p>}
          </div>
        )}
        {cargada && !todos.length && (
          <p className="mensajes__primero">{nueva ? `Escribile a ${c.nombre}.` : 'Todavía no hay mensajes acá.'}</p>
        )}
        {porDia(todos).map((dia) => (
          <div key={dia.clave} className="mensajes__dia">
            <h3 className="mensajes__fecha"><span>{diaDeMensajes(dia.cuando, ahora)}</span></h3>
            <ol className="mensajes__burbujas">
              {dia.mensajes.map((m, i) => {
                const antes = dia.mensajes[i - 1];
                const seguido = Boolean(antes) && antes.de === m.de && m.cuando - antes.cuando < SEGUIDO && !antes.estado;
                return (
                  <Burbuja
                    key={m.id}
                    m={m}
                    mio={m.de === yo}
                    autor={autorDe(m)}
                    conAutor={c.grupo && m.de !== yo && !seguido}
                    seguido={seguido}
                    onProbar={(x) => {
                      campo.current?.focus();
                      mandar(x.texto, x.id);
                    }}
                    onEditar={editar}
                    onCancelar={(x) => controles.current.get(x.id)?.abort()}
                  />
                );
              })}
            </ol>
          </div>
        ))}
      </div>
      <p className="solo-lectores" role="status">{aviso}</p>
      {noPuede ? (
        <p className="mensajes__no-puede">{noPuede}</p>
      ) : (
        <form
          className="mensajes__escribir"
          data-adjuntar
          onSubmit={(e) => {
            e.preventDefault();
            mandar(texto);
          }}
        >
          {adjuntar && (
            <ConectarDrive
              soltado={soltado?.name}
              conDrive={google.disponible}
              onElegir={() => (soltado ? tomar(soltado, 'drive') : elegirArchivo('drive'))}
              onSinDrive={() => (soltado ? tomar(soltado, 'temporal') : elegirArchivo('temporal'))}
              onCerrar={() => {
                volverAlCerrar.current = true;
                setAdjuntar(false);
                setSoltado(null);
                botonAdjuntar.current?.focus({ preventScroll: true });
              }}
            />
          )}
          {problema && <p id={idProblema} className="mensajes__problema" role="alert">{problema}</p>}
          {adjunto && <ArchivoElegido adjunto={adjunto} idAviso={idElegido} onSacar={sacar} />}
          <button ref={botonAdjuntar} type="button" className="boton boton--secundario mensajes__clip" aria-label="Adjuntar un archivo" title="Adjuntar un archivo" onClick={tocarAdjuntar}>
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20 11.4l-7.8 7.8a5 5 0 0 1-7.1-7.1l8.4-8.4a3.3 3.3 0 0 1 4.7 4.7l-8.4 8.4a1.7 1.7 0 0 1-2.4-2.4l7.7-7.7" /></svg>
          </button>
          <input ref={elegir} type="file" hidden tabIndex={-1} onChange={alElegir} />
          <label htmlFor={idCampo} className="solo-lectores">{`Mensaje para ${c.nombre}`}</label>
          <textarea
            ref={campo}
            id={idCampo}
            className="campo__control mensajes__campo"
            rows={1}
            placeholder="Escribí un mensaje"
            enterKeyHint={conTeclado ? 'send' : 'enter'}
            aria-invalid={quedan < 0 ? 'true' : undefined}
            aria-describedby={[adjunto ? idElegido : '', largo ? idLargo : ''].filter(Boolean).join(' ') || undefined}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={alTeclear}
          />
          <button type="submit" className="boton mensajes__mandar" aria-disabled={vacio || quedan < 0 ? 'true' : undefined}>Mandar</button>
          <p className="mensajes__ayuda">
            {/* Always there, so a screen reader hears it when it starts saying something. */}
            <span id={idLargo} className="mensajes__largo" data-pasado={quedan < 0 || undefined} aria-live="polite">{largo}</span>
          </p>
        </form>
      )}
    </section>
  );
}

function NuevoMensaje({ angosta, onVolver, onElegir }) {
  const idTitulo = useId();
  const titulo = useRef(null);
  const campo = useRef(null);
  const [texto, setTexto] = useState('');
  const quieto = useQuieto(texto.trim(), 300);
  const consulta = quieto.length >= 2 ? quieto : '';
  const busqueda = useConsulta(() => (consulta ? buscarPersonas(consulta) : Promise.resolve(null)), [consulta]);
  const personas = consulta && busqueda.datos ? busqueda.datos : [];
  const buscando = Boolean(consulta) && busqueda.cargando;

  useEffect(() => {
    campo.current?.focus();
  }, []);

  let estado = '';
  if (consulta && !buscando && !busqueda.error) {
    if (!personas.length) estado = 'No encontramos a nadie con ese nombre. Probá con el apellido.';
    else estado = personas.length === 1 ? 'Una persona' : `${personas.length} personas`;
  }

  return (
    <section className="mensajes__panel mensajes__panel--nuevo" aria-labelledby={idTitulo}>
      <Cabeza angosta={angosta} onVolver={onVolver} titulo={titulo} idTitulo={idTitulo} nombre="Mensaje nuevo" />
      <div className="mensajes__buscar-persona">
        <Campo etiqueta="¿A quién le escribís?" ayuda="Nombre o apellido, con tildes como en el campus">
          <input
            ref={campo}
            className="campo__control"
            type="search"
            autoComplete="off"
            spellCheck="false"
            enterKeyHint="search"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
        </Campo>
        <p className={estado && !personas.length ? 'mensajes__nada-filtro' : 'solo-lectores'} role="status">{estado}</p>
        {consulta && busqueda.error && <ErrorConReintento texto={busqueda.error} recargar={busqueda.recargar} />}
        <div aria-busy={buscando ? 'true' : undefined}>
          {buscando && !personas.length && <Cargando texto="Buscando personas" cuantas={3} />}
          {personas.length > 0 && (
            <ul className={`mensajes__personas${buscando ? ' mensajes__personas--viejas' : ''}`}>
              {personas.map((p) => (
                <li key={p.id}>
                  <button type="button" className="mensajes__persona" onClick={() => onElegir(p)}>
                    <Avatar nombre={p.nombre} foto={p.foto} id={p.id} chico />
                    <span className="mensajes__persona-nombre">{p.nombre}</span>
                    {p.conversacion && <span className="mensajes__persona-dato">Ya hablaron</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function Nada({ onNuevo }) {
  return (
    <div className="mensajes__panel mensajes__panel--nada">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <rect x="3" y="5.5" width="18" height="13" rx="2" />
        <path d="M3.8 7l8.2 6.2L20.2 7" />
      </svg>
      <p>Elegí una conversación para leerla, o escribile a alguien.</p>
      <button type="button" className="boton boton--secundario boton--chico" onClick={onNuevo}>Mensaje nuevo</button>
    </div>
  );
}

const LISTA_INICIAL = { conversaciones: [], mas: false, desde: 0, yo: 0, cargando: true, error: '', cargandoMas: false, errorMas: '' };
const unicas = (lista) => [...new Map(lista.map((c) => [c.id, c])).values()];

export default function Mensajes() {
  useSeo({ titulo: tituloDe('Mensajes'), noindex: true });
  // A file dropped outside the conversation (on the list, on the margin) stays here instead of opening in the tab.
  useEffect(() => {
    const frenar = (e) => {
      if ([...(e.dataTransfer?.types ?? [])].includes('Files')) e.preventDefault();
    };
    window.addEventListener('dragover', frenar);
    window.addEventListener('drop', frenar);
    return () => {
      window.removeEventListener('dragover', frenar);
      window.removeEventListener('drop', frenar);
    };
  }, []);
  const caja = useRef(null);
  const angosta = useAngosta(caja);
  const navegar = useNavigate();
  const ubicacion = useLocation();
  const enCharla = Boolean(ubicacion.state?.charla);
  const [ahora] = useState(() => Date.now());
  const [lista, setLista] = useState(LISTA_INICIAL);
  const [intento, setIntento] = useState(0);
  const [consulta, setConsulta] = useState('');
  // { modo: 'charla', c, enfocar } or { modo: 'nuevo' }.
  const [elegida, setElegida] = useState(null);
  const [pulso, setPulso] = useState(0);
  const total = useNumeroSinLeer();

  useEffect(() => {
    let vivo = true;
    cargarConversaciones(0, { fresco: intento > 0 }).then(
      (r) => {
        if (!vivo) return;
        setLista((l) => ({ ...l, conversaciones: r.conversaciones, mas: r.mas, desde: CONVERSACIONES_POR_TANDA, yo: r.yo, cargando: false, error: '' }));
        alMenosSinLeer(r.conversaciones.filter((c) => c.sinLeer > 0).length);
      },
      (e) => vivo && setLista((l) => ({ ...l, cargando: false, error: textoError(e) })),
    );
    return () => {
      vivo = false;
    };
  }, [intento]);

  // Back to this page with the history of a conversation that is no longer in memory (a reload): the list.
  useEffect(() => {
    if (enCharla && !elegida) navegar('/mensajes', { replace: true, state: null });
  }, [enCharla, elegida, navegar]);

  const vista = angosta && !(enCharla && elegida) ? 'lista' : 'charla';
  // From a conversation back to the list on a phone: the focus goes to the row it was on.
  const vistaAntes = useRef(vista);
  useEffect(() => {
    const antes = vistaAntes.current;
    vistaAntes.current = vista;
    if (!angosta || antes !== 'charla' || vista !== 'lista') return;
    const destino = elegida?.modo === 'charla' ? `[data-conversacion="${elegida.c.id}"] .mensajes__abrir` : '.mensajes__nuevo';
    caja.current?.querySelector(destino)?.focus();
  }, [vista, angosta, elegida]);

  const abrir = (sel) => {
    setElegida(sel);
    if (angosta && !enCharla) {
      navegar('/mensajes', { state: { charla: true } });
      window.scrollTo(0, 0);
    }
  };
  const volver = () => {
    if (enCharla) navegar(-1);
    else setElegida(null);
  };

  const abrirConversacion = (c) => abrir({ modo: 'charla', c, enfocar: 'titulo' });
  const nuevo = () => abrir({ modo: 'nuevo' });

  const elegirPersona = (p) => {
    const ya = lista.conversaciones.find((c) => !c.grupo && c.persona?.id === p.id);
    const c = ya ?? { id: p.conversacion, grupo: false, nombre: p.nombre, detalle: '', foto: p.foto, persona: p, sinLeer: 0, ultimo: null };
    setElegida({ modo: 'charla', c, enfocar: 'campo' });
  };

  const verMas = async () => {
    if (lista.cargandoMas) return;
    setLista((l) => ({ ...l, cargandoMas: true, errorMas: '' }));
    try {
      const r = await cargarConversaciones(lista.desde);
      setLista((l) => ({ ...l, conversaciones: unicas([...l.conversaciones, ...r.conversaciones]), mas: r.mas, desde: l.desde + CONVERSACIONES_POR_TANDA, cargandoMas: false }));
    } catch (e) {
      setLista((l) => ({ ...l, cargandoMas: false, errorMas: textoError(e) }));
    }
  };

  const actualizar = () => {
    setIntento((n) => n + 1);
    setPulso((n) => n + 1);
  };

  // Stable, so the conversation doesn't mark itself again on every render.
  const [alLeer] = useState(() => (id) => {
    setLista((l) => ({ ...l, conversaciones: l.conversaciones.map((c) => (c.id === id ? { ...c, sinLeer: 0 } : c)) }));
    setElegida((e) => (e?.c?.id === id ? { ...e, c: { ...e.c, sinLeer: 0 } } : e));
  });

  const alEnviar = (id, m) => {
    setLista((l) => {
      const c = l.conversaciones.find((x) => x.id === id);
      return c ? { ...l, conversaciones: [{ ...c, ultimo: m }, ...l.conversaciones.filter((x) => x.id !== id)] } : l;
    });
  };

  const alCrear = ({ conversacionId, mensaje }, persona) => {
    if (!conversacionId) {
      setIntento((n) => n + 1);
      return;
    }
    const c = { id: conversacionId, grupo: false, nombre: persona.nombre, detalle: '', foto: persona.foto, persona, sinLeer: 0, ultimo: mensaje };
    setLista((l) => ({ ...l, conversaciones: [c, ...l.conversaciones.filter((x) => x.id !== conversacionId)] }));
    setElegida({ modo: 'charla', c: { ...c, inicial: mensaje ? [mensaje] : [] }, enfocar: 'campo' });
  };

  const enLaLista = lista.conversaciones.filter((c) => c.sinLeer > 0).length;
  const hayNuevos = !lista.cargando && total > enLaLista;
  const activa = elegida?.modo === 'charla' ? elegida.c.id : null;

  let derecha = null;
  if (elegida?.modo === 'nuevo') derecha = <NuevoMensaje angosta={angosta} onVolver={volver} onElegir={elegirPersona} />;
  else if (elegida?.modo === 'charla') {
    derecha = (
      <Charla
        key={elegida.c.id ?? `p${elegida.c.persona?.id}`}
        c={elegida.c}
        yo={lista.yo}
        angosta={angosta}
        pulso={pulso}
        ahora={ahora}
        enfocar={elegida.enfocar}
        onVolver={volver}
        onLeida={alLeer}
        onEnviado={alEnviar}
        onCreada={alCrear}
      />
    );
  } else if (!angosta) derecha = <Nada onNuevo={nuevo} />;

  return (
    <div ref={caja} className="contenedor mensajes" data-angosta={angosta || undefined} data-vista={vista}>
      <div className="mensajes__caja">
        {/* On a phone, inside a conversation, the page keeps its name for screen readers. */}
        {angosta && vista === 'charla' && <h1 className="solo-lectores">Mensajes</h1>}
        {(!angosta || vista === 'lista') && (
          <Lista
            lista={lista}
            ahora={ahora}
            consulta={consulta}
            onConsulta={setConsulta}
            activa={activa}
            onAbrir={abrirConversacion}
            onNuevo={nuevo}
            onMas={verMas}
            hayNuevos={hayNuevos}
            onActualizar={actualizar}
            onReintentar={() => {
              setLista(LISTA_INICIAL);
              setIntento((n) => n + 1);
            }}
          />
        )}
        {(!angosta || vista === 'charla') && derecha}
      </div>
    </div>
  );
}
