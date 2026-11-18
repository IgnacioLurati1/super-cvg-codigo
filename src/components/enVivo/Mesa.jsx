import { Component, Suspense, lazy, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { HERRAMIENTAS } from '../../lib/enVivo/herramientas';
import { abrirPestana, cerrarPestana, enPantalla, leerCerrada, mensajes, pestanas as leerPestanas, MAX_PESTANAS, tituloNuevo } from '../../lib/enVivo/mesa';
import { enUnaLinea, hiloDeLaMesa, preguntas } from '../../lib/enVivo/avisos';
import { mostrarCodigo } from '../../lib/enVivo/codigo';
import { DE_LA_COPIA } from '../../lib/enVivo/copiaDeSesion';
import { MAX_ARCHIVO } from '../../lib/enVivo/sesion';
import { anotarVisto, ultimoVisto } from '../../lib/enVivo/vistos';
import { abrirPanel as abrirCaja, panelAbierto as cajaAbierta, useSoloEnCaja } from '../../lib/consultron/panel';
import { useUI } from '../ui';
import { usePestana, useVersion } from './usePestana';
import Chat from './Chat';
import GuardarEnLoMio from './GuardarEnLoMio';
import Icono from './Iconos';
import './enVivo.css';

// The table of a live session, like a call: the open tool takes the whole screen, and everything else lives in a
// toolbar at the bottom that shows when the mouse moves (always, on a touch screen). The chat and Consultron open at the
// side, one at a time. New chat messages come as notices; Consultron's answers, as a bubble in the middle.

const COMPONENTES = Object.fromEntries(Object.entries(HERRAMIENTAS).map(([tipo, h]) => [tipo, lazy(h.cargar)]));
const ConsultronAlLado = lazy(() => import('./ConsultronFlotante').then((m) => ({ default: m.ConsultronAlLado })));
const DeTusMaterias = lazy(() => import('./AbrirDeAfuera').then((m) => ({ default: m.DeTusMaterias })));
const DelSanto = lazy(() => import('./AbrirDeAfuera').then((m) => ({ default: m.DelSanto })));
const GloboConsultron = lazy(() => import('./ConsultronFlotante').then((m) => ({ default: m.GloboConsultron })));

// A tool that breaks leaves the rest of the table standing.
class Resguardo extends Component {
  constructor(props) {
    super(props);
    this.state = { roto: false };
  }
  static getDerivedStateFromError() {
    return { roto: true };
  }
  render() {
    return this.state.roto ? <p className="mensaje mensaje--error">Esta pestaña se trabó. Probá cerrarla y abrir otra.</p> : this.props.children;
  }
}

function Pestana({ sesion, pestana, siguiendo, soltar, irA, recienAbierta }) {
  const mesa = usePestana(sesion, pestana.id, { siguiendo, soltar, irA, recienAbierta });
  return (
    <Resguardo key={pestana.id}>
      <Suspense fallback={<div className="envivo-mesa__cargando" aria-busy="true">Abriendo {HERRAMIENTAS[pestana.tipo].nombre.toLowerCase()}…</div>}>
        {(() => {
          const Herramienta = COMPONENTES[pestana.tipo];
          return <Herramienta mesa={mesa} />;
        })()}
      </Suspense>
    </Resguardo>
  );
}

const useMedia = (consulta) => useSyncExternalStore(
  (f) => {
    const m = window.matchMedia(consulta);
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  },
  () => window.matchMedia(consulta).matches,
  () => false,
);

// How each tool shows in «Abrir»: the order is the grid's, and the apunte comes from the student's computer.
const ABRIBLES = ['documento', 'pizarra', 'flujo', 'laboratorio', 'calculadora', 'repaso', 'apunte'];
// What «Abrir» brings from outside the table, in a second step of the same box.
const DE_AFUERA = [
  { paso: 'materias', icono: 'materias', nombre: 'De tus materias' },
  { paso: 'santo', icono: 'santo', nombre: 'Del Santo Resumen' },
];
const NOMBRE_EN_ABRIR = { apunte: 'Subir un apunte' };
// How long the toolbar stays after the mouse stops, and how long a notice.
const QUIETO = 2500;
const AVISO = 7000;
const MAX_AVISOS = 3;

// The tab each one was on, by session, in memory: going to the site and back opens it again.
const ultimaPestana = new Map();

// How many of the chat's messages this tab already told or read (`que`), before a reload too.
function hastaVisto(lista, persona, que) {
  const ultimo = ultimoVisto(persona, que);
  return ultimo ? lista.findIndex((m) => m.id === ultimo) + 1 : 0;
}

export default function Mesa({ sesion, codigo, estado, anfitrion, alSalir, alTerminar }) {
  useVersion(sesion);
  const { confirmar, avisar } = useUI();
  const navegar = useNavigate();
  const id = useId();
  const raiz = useRef(null);
  const [lista, setLista] = useState(() => leerPestanas(sesion.doc));
  const [elegida, setElegida] = useState(() => (lista.some((p) => p.id === ultimaPestana.get(codigo)) ? ultimaPestana.get(codigo) : lista[0]?.id ?? null));
  const [siguiendo, setSiguiendo] = useState(null);
  // The tab this browser just opened with «Abrir»: its tool takes the focus.
  const [abiertaAca, setAbiertaAca] = useState(null);

  // While the table is on, the page is the table: no header, no scroll of its own (enVivo.css).
  useLayoutEffect(() => {
    const html = document.documentElement;
    html.dataset.mesaEnVivo = '';
    return () => delete html.dataset.mesaEnVivo;
  }, []);

  // «Aparición» in Configuración: Consultron in its box, from its button down on the right (Flotante.jsx), and not at the
  // side.
  const soloEnCaja = useSoloEnCaja();

  // ---------- Full screen ----------
  const [completa, setCompleta] = useState(false);
  const hayCompleta = typeof document !== 'undefined' && document.fullscreenEnabled;
  useEffect(() => {
    const cambio = () => setCompleta(Boolean(document.fullscreenElement) && [raiz.current, document.documentElement].includes(document.fullscreenElement));
    document.addEventListener('fullscreenchange', cambio);
    return () => document.removeEventListener('fullscreenchange', cambio);
  }, []);
  // Consultron's box is outside the table: with it, the whole page goes to full screen, which is the table anyway.
  const pantallaCompleta = async () => {
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
    else await (soloEnCaja ? document.documentElement : raiz.current).requestFullscreen().catch(() => avisar('Este navegador no deja usar la pantalla completa.', 'error'));
  };

  // ---------- Tabs, the chat and the end ----------
  const [enChat, setEnChat] = useState(() => mensajes(sesion.doc));
  // What came back from the copy kept in this browser (guardadoSesion.js) was already read: up to this many.
  const [deLaCopia, setDeLaCopia] = useState(0);
  useEffect(() => {
    const mapa = sesion.doc.getMap('pestanas');
    const leer = () => setLista(leerPestanas(sesion.doc));
    mapa.observe(leer);
    const chat = sesion.doc.getArray('chat');
    const contar = (evento) => {
      const todos = mensajes(sesion.doc);
      // What came back from the copy kept in this browser was already read.
      if (evento?.transaction.origin === DE_LA_COPIA) setDeLaCopia(todos.length);
      setEnChat(todos);
    };
    chat.observe(contar);
    // Someone else ended it for everyone: this one leaves too.
    const dejar = sesion.alTerminar(alTerminar);
    return () => {
      mapa.unobserve(leer);
      chat.unobserve(contar);
      dejar();
    };
  }, [sesion, alTerminar]);

  // Just in (after a reload too), the table is still on its way from the others: never «vacía» before it arrives.
  const llegando = !lista.length && typeof sesion.cargada === 'function' && !sesion.cargada();

  // ---------- Who leads ----------
  const otros = sesion.otros();
  // Whoever presents («Que me sigan todos») is followed by everyone, unless someone went on their own during that
  // presentation (`ignorada` keeps which one). Choosing someone by hand wins.
  const [presento, setPresento] = useState(false);
  const [ignorada, setIgnorada] = useState(null);
  const presentador = presento ? null : otros.filter((o) => o.presenta).sort((a, b) => b.presenta - a.presenta)[0] ?? null;
  const idPresentacion = presentador ? `${presentador.id}:${presentador.presenta}` : null;
  const porPresentacion = Boolean(presentador) && ignorada !== idPresentacion;
  // Whoever was followed and left is not followed any more.
  const elegido = siguiendo ? otros.find((o) => o.id === siguiendo) ?? null : null;
  const guia = elegido ?? (porPresentacion ? presentador : null);

  // Following, the tab is theirs, and this one's too: letting go stays on it (enPantalla in mesa.js).
  const valida = (pid) => lista.some((p) => p.id === pid);
  const { activa, propia } = enPantalla(lista.map((p) => p.id), guia, elegida);
  if (propia !== elegida) setElegida(propia);
  useEffect(() => {
    sesion.marcarLocal('p', activa);
  }, [sesion, activa]);
  const pestana = lista.find((p) => p.id === activa) ?? null;
  useEffect(() => {
    if (activa) ultimaPestana.set(codigo, activa);
  }, [codigo, activa]);
  // The tabs already seen stay mounted, hidden: the session's Consultron reads them, and coming back is instant.
  const [vistas, setVistas] = useState([]);
  if (activa && !vistas.includes(activa)) setVistas([...vistas, activa]);
  const montadas = lista.filter((p) => vistas.includes(p.id));
  const soltar = useCallback(() => {
    setSiguiendo(null);
    if (idPresentacion) setIgnorada(idPresentacion);
  }, [idPresentacion]);
  const presentar = () => {
    const ahora = !presento;
    setPresento(ahora);
    sesion.marcarLocal('presenta', ahora ? Date.now() : 0);
    if (ahora) setSiguiendo(null);
  };
  // A tool takes the student to another tab (the file of a course just opened).
  const irA = useCallback((pid) => {
    soltar();
    setElegida(pid);
  }, [soltar]);
  const elegir = (pid) => {
    setElegida(pid);
    if (guia && guia.p !== pid) soltar();
  };
  const seguir = (persona) => {
    if (guia?.id === persona.id) {
      soltar();
      return;
    }
    setSiguiendo(persona.id);
    if (valida(persona.p)) setElegida(persona.p);
  };

  // At a narrow width the tabs scroll: the one in use stays in view.
  const tiras = useRef(null);
  useEffect(() => {
    const aLaVista = () => {
      const caja = tiras.current;
      const el = caja && activa ? document.getElementById(`${id}-tab-${activa}`)?.parentElement : null;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const c = caja.getBoundingClientRect();
      if (r.left < c.left) caja.scrollLeft -= c.left - r.left + 8;
      else if (r.right > c.right) caja.scrollLeft += r.right - c.right + 8;
    };
    aLaVista();
    // Also when the window changes size.
    window.addEventListener('resize', aLaVista);
    return () => window.removeEventListener('resize', aLaVista);
  }, [activa, id, lista.length]);

  // ---------- The toolbar and what it opens ----------
  const [panel, setPanel] = useState(null);
  // The second step of «Abrir» (DE_AFUERA), and what is open at the side: 'chat' or 'consultron'.
  const [paso, setPaso] = useState(null);
  const [lado, setLado] = useState(null);
  const botones = useRef({});
  const tactil = useMedia('(hover: none)');
  const ancha = useMedia('(min-width: 48rem)');
  const [aLaVista, setALaVista] = useState(true);
  const [fija, setFija] = useState(false);
  const reloj = useRef(0);
  const mostrar = useCallback(() => {
    setALaVista(true);
    clearTimeout(reloj.current);
    reloj.current = setTimeout(() => setALaVista(false), QUIETO);
  }, []);
  // At first it shows, and goes after a while.
  useEffect(() => {
    reloj.current = setTimeout(() => setALaVista(false), QUIETO);
    return () => clearTimeout(reloj.current);
  }, []);
  const barraVisible = tactil || aLaVista || fija || panel !== null;
  const cerrarPanel = useCallback((volver = false) => {
    setPaso(null);
    setPanel((actual) => {
      if (volver && actual) setTimeout(() => botones.current[actual]?.focus(), 0);
      return null;
    });
  }, []);
  const alternar = (que) => {
    setPaso(null);
    setPanel((p) => (p === que ? null : que));
  };
  const alternarLado = (que) => setLado((l) => (l === que ? null : que));
  const cerrarLado = useCallback((volver = false) => {
    setLado((actual) => {
      if (volver && actual) setTimeout(() => botones.current[actual]?.focus(), 0);
      return null;
    });
  }, []);
  // Back from a second step, the focus goes to the button that opened it.
  const [volvio, setVolvio] = useState(null);
  const volverDe = (que) => {
    setVolvio(que);
    setPaso(null);
  };
  // A tab brought from a course or El Santo Resumen: on the table, and this browser on it.
  const alTraer = (nueva) => {
    setPaso(null);
    setPanel(null);
    soltar();
    setElegida(nueva);
  };
  const ref = (que) => (el) => {
    botones.current[que] = el;
  };

  // ---------- Opening and closing tabs ----------
  const archivo = useRef(null);
  const abrir = (tipo, extra = {}) => {
    const nuevo = abrirPestana(sesion.doc, tipo, { titulo: extra.titulo ?? tituloNuevo(sesion.doc, HERRAMIENTAS[tipo].nombre), datos: extra.datos, por: sesion.yo.nombre });
    if (!nuevo) {
      avisar(`Ya hay ${MAX_PESTANAS} pestañas abiertas. Cerrá alguna para abrir otra.`, 'error');
      return null;
    }
    setPanel(null);
    soltar();
    setElegida(nuevo);
    setAbiertaAca(nuevo);
    return nuevo;
  };
  const elegirArchivo = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > MAX_ARCHIVO) {
      avisar('Ese archivo pasa de 25 MB.', 'error');
      return;
    }
    const idArchivo = sesion.archivos.compartir(f, f.name);
    abrir('apunte', { titulo: f.name.replace(/\.[^.]+$/, ''), datos: { archivo: idArchivo, nombre: f.name, de: sesion.yo.id } });
  };
  const cerrar = async (p) => {
    if (await confirmar({ titulo: `¿Cerrar «${p.titulo}» para todos?`, texto: 'Se pierde lo que tiene.', boton: 'Cerrar pestaña', peligro: true })) cerrarPestana(sesion.doc, p.id, sesion.yo);
  };
  const terminar = async () => {
    if (!(await confirmar({ titulo: '¿Terminar la sesión para todos?', texto: 'Queda en «Tus sesiones» de cada uno.', boton: 'Terminar', peligro: true }))) return;
    // Out once the others heard it and left: leaving first would cut it off.
    await sesion.terminar({ por: sesion.yo.nombre, cuando: Date.now() });
    alSalir();
  };
  const salir = async () => {
    if (await confirmar({ titulo: '¿Salir de la sesión?', texto: otros.length ? 'Los demás siguen. Podés volver con el código.' : 'Sos la única persona. Si salís, la sesión se termina.', boton: 'Salir de la sesión' })) alSalir();
  };
  const alSitio = async () => {
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
    navegar('/');
  };
  // Settings, without leaving the session: «Volver a la sesión» brings the student back.
  const alAjustes = async () => {
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
    navegar('/configuracion');
  };

  const link = useMemo(() => `${location.origin}/en-vivo#${mostrarCodigo(codigo)}`, [codigo]);
  const copiar = async (que) => {
    try {
      await navigator.clipboard.writeText(que === 'link' ? link : mostrarCodigo(codigo));
      avisar(que === 'link' ? 'Copiaste el link' : 'Copiaste el código');
    } catch {
      avisar('No se pudo copiar. Seleccionalo a mano.', 'error');
    }
  };

  // ---------- Notices: the chat and Consultron ----------
  const [avisos, setAvisos] = useState([]);
  const [anuncio, setAnuncio] = useState('');
  const quitarAviso = useCallback((clave) => setAvisos((a) => a.filter((x) => x.clave !== clave)), []);
  const chatAbierto = lado === 'chat';
  const [leidos, setLeidos] = useState(() => enChat.length);
  const alVer = useCallback((n) => setLeidos(n), []);
  // What this tab told and read before a reload stays told and read (vistos.js).
  const persona = sesion.yo.id;
  const sinLeer = chatAbierto ? 0 : enChat.slice(Math.max(leidos, deLaCopia, hastaVisto(enChat, persona, 'chatLeido'))).filter((m) => m.de !== persona).length;
  useEffect(() => {
    if (chatAbierto && enChat.length) anotarVisto(persona, 'chatLeido', enChat.at(-1).id);
  }, [chatAbierto, enChat, persona]);
  const avisados = useRef(enChat.length);
  useEffect(() => {
    const nuevos = enChat.slice(Math.max(avisados.current, deLaCopia, hastaVisto(enChat, persona, 'chatAvisado')));
    avisados.current = enChat.length;
    if (enChat.length) anotarVisto(persona, 'chatAvisado', enChat.at(-1).id);
    if (chatAbierto) return;
    const ajenos = nuevos.filter((m) => m.de !== persona);
    if (!ajenos.length) return;
    const ultimo = ajenos.at(-1);
    const nombre = ultimo.nombre || 'Alguien';
    setAvisos((a) => [...a.filter((x) => x.tipo !== 'chat'), { clave: `chat-${ultimo.id || enChat.length}`, tipo: 'chat', nombre, color: ultimo.color, texto: enUnaLinea(ultimo.texto), mas: ajenos.length - 1 }].slice(-MAX_AVISOS));
    setAnuncio(`${nombre} escribió en el chat. ${enUnaLinea(ultimo.texto)}`);
  }, [enChat, chatAbierto, persona, deLaCopia]);

  // Whoever was on a tab someone else closed is told who and which: the table takes them to another one.
  const activaAntes = useRef(activa);
  useLayoutEffect(() => {
    activaAntes.current = activa;
  });
  useEffect(() => {
    const meta = sesion.doc.getMap('meta');
    const mirar = (evento) => {
      if (!evento.keysChanged.has('cerrada')) return;
      const c = leerCerrada(sesion.doc);
      if (!c || c.de === sesion.yo.id || c.pestana !== activaAntes.current) return;
      const color = sesion.otros().find((o) => o.id === c.de)?.color;
      setAvisos((a) => [...a, { clave: `cerrada-${c.pestana}`, tipo: 'cerrada', nombre: c.nombre, color, texto: `Cerró «${c.titulo}».` }].slice(-MAX_AVISOS));
      setAnuncio(`${c.nombre} cerró «${c.titulo}».`);
    };
    meta.observe(mirar);
    return () => meta.unobserve(mirar);
  }, [sesion]);

  // The session's Consultron: one thread for the table, in its own place of the doc. A new answer floats as a bubble
  // in the middle, unless the thread is open at the side.
  const [globo, setGlobo] = useState(null);
  const [pensando, setPensando] = useState(false);
  const conConsultron = lado === 'consultron' && !soloEnCaja;
  const ladoAbierto = useRef(lado);
  const enCaja = useRef(soloEnCaja);
  useLayoutEffect(() => {
    ladoAbierto.current = lado;
    enCaja.current = soloEnCaja;
  });
  useEffect(() => {
    const datos = hiloDeLaMesa(sesion.doc);
    const listas = new Set(preguntas(datos).filter((q) => q.estado !== 'pensando').map((q) => q.id));
    const mirar = () => {
      const todas = preguntas(datos);
      setPensando(todas.some((q) => q.estado === 'pensando'));
      for (const q of todas) {
        if (q.estado === 'pensando' || listas.has(q.id)) continue;
        listas.add(q.id);
        setAnuncio(q.de === sesion.yo.id ? 'Consultron te contestó.' : `Consultron le contestó a ${q.nombre}.`);
        // Reading the thread itself, no bubble.
        if (enCaja.current ? !cajaAbierta() : ladoAbierto.current !== 'consultron') setGlobo({ pregunta: q.id });
      }
    };
    mirar();
    datos.observe(mirar);
    return () => datos.unobserve(mirar);
  }, [sesion]);
  const verConsultron = () => {
    setGlobo(null);
    if (soloEnCaja) abrirCaja();
    else setLado('consultron');
  };
  const cerrarGlobo = useCallback((volver) => {
    setGlobo(null);
    if (volver) (botones.current.consultron ?? document.querySelector('.flotante__boton'))?.focus();
  }, []);

  const conexionMala = !estado?.conectada;
  const guardable = pestana ? sesion.guardable(pestana.id) : null;

  // ---------- The chip of who leads ----------
  let chip = null;
  if (presento) chip = { color: sesion.yo.color, texto: 'Estás presentando', boton: 'Dejar de presentar', accion: presentar };
  else if (guia && guia === presentador && !elegido) chip = { color: guia.color, texto: `${guia.nombre || 'Alguien'} presenta`, boton: 'Ir por mi cuenta', accion: soltar };
  else if (guia) chip = { color: guia.color, texto: `Siguiendo a ${guia.nombre || 'alguien'}`, boton: 'Dejar de seguir', accion: soltar };
  else if (presentador) chip = { color: presentador.color, texto: `${presentador.nombre || 'Alguien'} presenta`, boton: 'Volver a seguir', accion: () => setIgnorada(null) };

  const botonBarra = (que, icono, texto, extra = {}) => (
    <button
      ref={ref(que)}
      type="button"
      className="envivo-barra__boton"
      aria-expanded={extra.sinPanel ? undefined : extra.expandido ?? panel === que}
      aria-controls={extra.sinPanel ? undefined : `${id}-${que}`}
      aria-pressed={extra.presionado}
      aria-label={extra.etiqueta}
      data-peligro={extra.peligro || undefined}
      onClick={extra.onClick ?? (() => alternar(que))}
    >
      <span className="envivo-barra__icono">
        <Icono nombre={icono} />
        {extra.numero > 0 && <span className="envivo-barra__numero" aria-hidden="true">{extra.numero > 9 ? '9+' : extra.numero}</span>}
        {extra.punto && <span className="envivo-barra__punto" aria-hidden="true" />}
      </span>
      <span className="envivo-barra__texto">{texto}</span>
      {extra.numero > 0 && <span className="solo-lectores">, {extra.numero} sin leer</span>}
    </button>
  );

  const invitar = (
    <div className="envivo-invitar">
      <p className="envivo-invitar__etiqueta" id={`${id}-cod`}>Código de la sesión</p>
      <p className="envivo-invitar__clave" aria-labelledby={`${id}-cod`}>{mostrarCodigo(codigo)}</p>
      <div className="envivo-panel__botones">
        <button type="button" className="boton boton--chico" onClick={() => copiar('codigo')}>Copiar código</button>
        <button type="button" className="boton boton--chico boton--secundario" onClick={() => copiar('link')}>Copiar link</button>
      </div>
    </div>
  );

  return (
    <div
      ref={raiz}
      className="envivo-mesa"
      data-sin-atajos
      data-tactil={tactil || undefined}
      data-lado={lado && ancha ? lado : undefined}
      data-siguiendo={guia || presento ? true : undefined}
      data-guiado={guia ? true : undefined}
      style={guia ? { '--guia': guia.color } : presento ? { '--guia': sesion.yo.color } : undefined}
      onPointerMove={(e) => e.pointerType === 'mouse' && e.buttons === 0 && mostrar()}
    >
      <button type="button" className="boton boton--chico envivo-saltar" onClick={() => botones.current.abrir?.focus()}>Ir a la barra de la sesión</button>

      <div className="envivo-tiras">
        <div ref={tiras} className="envivo-tiras__lista" role="tablist" aria-label="Pestañas de la sesión">
          {lista.map((p) => {
            const ahi = otros.filter((o) => o.p === p.id);
            return (
              <div key={p.id} role="presentation" className="envivo-tira" data-activa={p.id === activa || undefined}>
                <button
                  type="button"
                  role="tab"
                  id={`${id}-tab-${p.id}`}
                  aria-selected={p.id === activa}
                  aria-controls={`${id}-trabajo`}
                  aria-keyshortcuts="Delete"
                  tabIndex={p.id === activa ? 0 : -1}
                  className="envivo-tira__boton"
                  title={p.titulo}
                  onClick={() => elegir(p.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Delete') {
                      e.preventDefault();
                      cerrar(p);
                      return;
                    }
                    const i = lista.findIndex((x) => x.id === p.id);
                    const n = lista.length;
                    const otro = { ArrowRight: lista[(i + 1) % n], ArrowLeft: lista[(i - 1 + n) % n], Home: lista[0], End: lista[n - 1] }[e.key];
                    if (!otro) return;
                    e.preventDefault();
                    elegir(otro.id);
                    document.getElementById(`${id}-tab-${otro.id}`)?.focus();
                  }}
                >
                  <span className="envivo-tira__icono"><Icono nombre={p.tipo} /></span>
                  <span className="envivo-tira__titulo">{p.titulo}</span>
                  {ahi.length > 0 && (
                    <span className="envivo-tira__gente">
                      {ahi.slice(0, 3).map((o) => <span key={o.cliente} className="envivo-punto" style={{ '--persona': o.color }} />)}
                      <span className="solo-lectores">, acá están {ahi.map((o) => o.nombre || 'alguien').join(', ')}</span>
                    </span>
                  )}
                </button>
                <button type="button" className="envivo-tira__cerrar" tabIndex={-1} aria-hidden="true" title={`Cerrar ${p.titulo}`} onClick={() => cerrar(p)}>
                  <Icono nombre="cerrar" />
                </button>
              </div>
            );
          })}
          {llegando && [0, 1].map((n) => <div key={n} className="envivo-tira envivo-tira--esqueleto" aria-hidden="true"><i /></div>)}
        </div>
        <button
          ref={(el) => {
            botones.current.nueva = el;
          }}
          type="button"
          className="envivo-tiras__nueva"
          aria-label="Abrir otra herramienta"
          title="Abrir otra herramienta"
          aria-expanded={panel === 'nueva'}
          aria-controls={`${id}-nueva`}
          onClick={() => alternar('nueva')}
        >
          <Icono nombre="abrir" />
        </button>
        <button type="button" className="envivo-tiras__nueva envivo-tiras__ajustes" aria-label="Configuración" title="Configuración" onClick={alAjustes}>
          <Icono nombre="ajustes" />
        </button>
      </div>

      <div
        id={`${id}-trabajo`}
        className="envivo-mesa__herramienta"
        role="region"
        aria-label={pestana ? pestana.titulo : llegando ? 'Mesa' : 'Mesa vacía'}
        aria-busy={llegando || undefined}
        onFocus={(e) => {
          // A key into the tool: the toolbar gets out of the way, so it never covers what has the focus.
          if (!tactil && e.target.matches(':focus-visible')) setALaVista(false);
        }}
      >
        {montadas.map((p) => (
          <div key={p.id} className="envivo-mesa__una" hidden={p.id !== activa}>
            <Pestana sesion={sesion} pestana={p} siguiendo={p.id === activa && guia && guia.p === p.id ? guia.id : null} soltar={soltar} irA={irA} recienAbierta={p.id === abiertaAca} />
          </div>
        ))}
        {llegando && (
          <div className="envivo-mesa__esqueleto" role="status">
            <span className="solo-lectores">Trayendo lo que hay en la mesa</span>
            <i aria-hidden="true" />
            <i aria-hidden="true" />
            <i aria-hidden="true" />
          </div>
        )}
        {!pestana && !llegando && (
          <div className="envivo-mesa__vacia">
            <p>La mesa está vacía.</p>
            <div className="envivo-mesa__atajos">
              {['documento', 'pizarra', 'laboratorio'].map((tipo) => (
                <button key={tipo} type="button" className="boton boton--secundario" onClick={() => abrir(tipo)}>{HERRAMIENTAS[tipo].nombre}</button>
              ))}
            </div>
            {otros.length === 0 && <p className="envivo-mesa__solo">El código para sumar gente está en Invitar.</p>}
          </div>
        )}
        {globo && !conConsultron && (
          <Suspense fallback={null}>
            <GloboConsultron sesion={sesion} pregunta={globo.pregunta} alCerrar={cerrarGlobo} alVerTodo={verConsultron} />
          </Suspense>
        )}
      </div>

      {lado === 'chat' && (
        <div
          id={`${id}-chat`}
          className="envivo-lado envivo-lado--chat"
          onKeyDown={(e) => {
            if (e.key !== 'Escape' || e.defaultPrevented) return;
            e.preventDefault();
            cerrarLado(true);
          }}
        >
          <button type="button" className="envivo-panel__cerrar envivo-panel__cerrar--suelto" aria-label="Cerrar el chat" onClick={() => cerrarLado(true)}>
            <Icono nombre="cerrar" />
          </button>
          <Chat sesion={sesion} alVer={alVer} enfocar />
        </div>
      )}
      {conConsultron && (
        <Suspense fallback={<div className="envivo-lado" aria-busy="true"><p className="envivo-panel__nota">Abriendo Consultron…</p></div>}>
          <ConsultronAlLado id={`${id}-consultron`} sesion={sesion} angosta={!ancha} alCerrar={cerrarLado} />
        </Suspense>
      )}

      {(chip || conexionMala) && (
        <div className="envivo-chips">
          {conexionMala && <p className="envivo-chip envivo-chip--mal">Reconectando…</p>}
          {chip && (
            <div className="envivo-chip" style={{ '--persona': chip.color }}>
              <span className="envivo-chip__punto" aria-hidden="true" />
              <span>{chip.texto}</span>
              <button type="button" className="envivo-chip__boton" onClick={chip.accion}>{chip.boton}</button>
            </div>
          )}
        </div>
      )}

      <div className="envivo-avisos">
        {avisos.map((a) => (
          <Aviso key={a.clave} aviso={a} alCerrar={() => quitarAviso(a.clave)} alAbrir={() => {
            quitarAviso(a.clave);
            setLado('chat');
          }} />
        ))}
      </div>
      <p className="solo-lectores" role="status" aria-live="polite">{anuncio}</p>
      <p className="solo-lectores" role="status">{conexionMala ? 'Se cortó la conexión. Reconectando.' : ''}</p>

      {(panel === 'abrir' || panel === 'nueva') && (
        <Panel key={paso ?? 'herramientas'} id={`${id}-${panel}`} titulo="Abrir" alCerrar={cerrarPanel} botones={botones} arriba={panel === 'nueva'} ancho={Boolean(paso)}>
          {paso && (
            <Suspense fallback={<p className="envivo-panel__nota" aria-busy="true">Abriendo…</p>}>
              {paso === 'materias' && <DeTusMaterias sesion={sesion} alAbrir={alTraer} alVolver={() => volverDe(paso)} />}
              {paso === 'santo' && <DelSanto sesion={sesion} alAbrir={alTraer} alVolver={() => volverDe(paso)} />}
            </Suspense>
          )}
          {!paso && (
            <ul className="envivo-abrir">
              {ABRIBLES.map((tipo) => (
                <li key={tipo}>
                  <button type="button" className="envivo-abrir__herramienta" onClick={() => {
                    if (tipo !== 'apunte') return abrir(tipo);
                    setPanel(null);
                    archivo.current?.click();
                  }}>
                    <span className="envivo-abrir__icono"><Icono nombre={tipo} /></span>
                    <span>{NOMBRE_EN_ABRIR[tipo] ?? HERRAMIENTAS[tipo].nombre}</span>
                  </button>
                </li>
              ))}
              {DE_AFUERA.map((d) => (
                <li key={d.paso}>
                  <button type="button" className="envivo-abrir__herramienta" data-foco={volvio === d.paso || undefined} onClick={() => setPaso(d.paso)}>
                    <span className="envivo-abrir__icono"><Icono nombre={d.icono} /></span>
                    <span>{d.nombre}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}
      <input ref={archivo} type="file" accept="application/pdf,image/*" className="solo-lectores" tabIndex={-1} aria-hidden="true" onChange={elegirArchivo} />

      {panel === 'personas' && (
        <Panel id={`${id}-personas`} titulo="En la sesión" alCerrar={cerrarPanel} botones={botones}>
          <ul className="envivo-lista">
            <li className="envivo-lista__fila envivo-lista__persona">
              <span className="envivo-punto" style={{ '--persona': sesion.yo.color }} aria-hidden="true" />
              <span className="envivo-lista__titulo">Vos</span>
            </li>
            {otros.map((o) => (
              <li key={o.cliente} className="envivo-lista__fila envivo-lista__persona">
                <span className="envivo-punto" style={{ '--persona': o.color }} aria-hidden="true" />
                <span className="envivo-lista__titulo">
                  {o.nombre || 'Alguien'}
                  {o.anfitrion && <span className="envivo-lista__dato"> armó la sesión</span>}
                </span>
                <button type="button" className="envivo-seguir" data-activo={guia?.id === o.id || undefined} style={{ '--persona': o.color }} onClick={() => seguir(o)}>
                  {guia?.id === o.id ? 'Dejar de seguir' : 'Seguir'}
                  <span className="solo-lectores"> a {o.nombre || 'esta persona'}</span>
                </button>
              </li>
            ))}
          </ul>
          {otros.length === 0 && <p className="envivo-panel__nota">Pasale el código a quien quieras sumar.</p>}
          {otros.length === 0 && invitar}
          {otros.length > 0 && (
            <button type="button" className="boton boton--secundario envivo-panel__ancho" aria-pressed={presento} onClick={presentar}>
              {presento ? 'Dejar de presentar' : 'Que me sigan todos'}
            </button>
          )}
        </Panel>
      )}

      {panel === 'invitar' && (
        <Panel id={`${id}-invitar`} titulo="Invitar" alCerrar={cerrarPanel} botones={botones}>
          {invitar}
        </Panel>
      )}

      {panel === 'guardar' && pestana && guardable && (
        <Panel id={`${id}-guardar`} titulo="Guardar en lo mío" alCerrar={cerrarPanel} botones={botones} ancho sinTitulo>
          <GuardarEnLoMio key={pestana.id} dar={guardable} titulo={pestana.titulo} alCerrar={() => cerrarPanel(true)} />
        </Panel>
      )}

      {panel === 'mas' && (
        <Panel id={`${id}-mas`} titulo="Más" alCerrar={cerrarPanel} botones={botones}>
          <div className="envivo-mas">
            {guardable && <button type="button" className="envivo-abrir__opcion" onClick={() => setPanel('guardar')}>Guardar en lo mío</button>}
            {hayCompleta && <button type="button" className="envivo-abrir__opcion" aria-pressed={completa} onClick={pantallaCompleta}>Pantalla completa</button>}
            <button type="button" className="envivo-abrir__opcion" onClick={alSitio}>Ir al sitio sin salir</button>
            <button type="button" className="envivo-abrir__opcion" onClick={salir}>Salir de la sesión</button>
            {anfitrion && <button type="button" className="envivo-abrir__opcion envivo-abrir__opcion--peligro" onClick={terminar}>Terminar para todos</button>}
          </div>
          <h3 className="envivo-panel__sub">Invitar</h3>
          {invitar}
        </Panel>
      )}

      {panel === 'salir' && (
        <Panel id={`${id}-salir`} titulo="Salir" alCerrar={cerrarPanel} botones={botones}>
          <div className="envivo-mas">
            <button type="button" className="envivo-abrir__opcion" onClick={salir}>Salir de la sesión</button>
            <button type="button" className="envivo-abrir__opcion envivo-abrir__opcion--peligro" onClick={terminar}>Terminar para todos</button>
          </div>
        </Panel>
      )}

      {/* Over a frame (a summary, a page of El Santo Resumen) the table hears no mouse: a strip at the bottom edge,
          while the bar is away, brings it back. */}
      {!barraVisible && <div className="envivo-mesa__borde" aria-hidden="true" onPointerDown={mostrar} />}
      <div
        id={`${id}-barra`}
        className="envivo-barra"
        role="group"
        aria-label="Barra de la sesión"
        data-oculta={barraVisible ? undefined : true}
        // It stays while the keyboard is in it or the mouse is over it.
        onFocus={(e) => e.target.matches(':focus-visible') && setFija(true)}
        onKeyDown={() => setFija(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) setFija(false);
        }}
        onPointerEnter={() => setFija(true)}
        onPointerLeave={(e) => {
          if (!e.currentTarget.querySelector(':focus-visible')) setFija(false);
          mostrar();
        }}
      >
        {botonBarra('abrir', 'abrir', 'Abrir', { etiqueta: 'Abrir otra herramienta' })}
        {botonBarra('personas', 'personas', otros.length ? `Personas (${otros.length + 1})` : 'Personas')}
        {botonBarra('chat', 'chat', 'Chat', { numero: sinLeer, expandido: lado === 'chat', onClick: () => alternarLado('chat') })}
        {!soloEnCaja && botonBarra('consultron', 'consultron', 'Consultron', { punto: pensando, expandido: conConsultron, onClick: () => alternarLado('consultron') })}
        {ancha ? (
          <>
            <span className="envivo-barra__separador" aria-hidden="true" />
            {guardable && botonBarra('guardar', 'guardar', 'Guardar en lo mío')}
            {botonBarra('invitar', 'invitar', 'Invitar')}
            {hayCompleta && botonBarra('completa', completa ? 'achicar' : 'completa', 'Pantalla completa', { sinPanel: true, presionado: completa, onClick: pantallaCompleta })}
            {botonBarra('sitio', 'sitio', 'Ir al sitio', { sinPanel: true, etiqueta: 'Ir al sitio sin salir de la sesión', onClick: alSitio })}
            {botonBarra('salir', 'salir', 'Salir', { sinPanel: !anfitrion, peligro: true, onClick: anfitrion ? undefined : salir })}
          </>
        ) : (
          botonBarra('mas', 'mas', 'Más')
        )}
      </div>
    </div>
  );
}

/** What a button of the toolbar opens: over the table, with the focus inside. Escape or a click outside closes it. */
function Panel({ id, titulo, alCerrar, botones, children, lado = false, ancho = false, sinTitulo = false, arriba = false }) {
  const caja = useRef(null);
  const tituloId = `${id}-t`;
  useEffect(() => {
    const el = caja.current;
    // What it holds may have taken the focus already (the chat's field).
    const primero = el?.contains(document.activeElement) ? document.activeElement : el?.querySelector('[data-foco]') ?? el?.querySelector('textarea, input:not([type="hidden"]), select, button, [href], [tabindex]:not([tabindex="-1"])');
    (primero ?? el)?.focus({ preventScroll: true });
    if (lado) return undefined;
    const afuera = (e) => {
      if (el?.contains(e.target) || Object.values(botones.current).some((b) => b?.contains(e.target))) return;
      // A dialog of the site (a confirmation) is not outside.
      if (e.target.closest?.('dialog, [role="dialog"][aria-modal="true"]')) return;
      alCerrar();
    };
    document.addEventListener('pointerdown', afuera);
    return () => document.removeEventListener('pointerdown', afuera);
  }, [alCerrar, botones, lado]);
  return (
    <section
      ref={caja}
      id={id}
      className={`envivo-panel${lado ? ' envivo-panel--lado' : ''}${ancho ? ' envivo-panel--ancho' : ''}${arriba ? ' envivo-panel--arriba' : ''}`}
      role="dialog"
      aria-labelledby={sinTitulo ? undefined : tituloId}
      aria-label={sinTitulo ? titulo : undefined}
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key !== 'Escape' || e.defaultPrevented) return;
        e.preventDefault();
        e.stopPropagation();
        alCerrar(true);
      }}
    >
      {!sinTitulo && (
        <div className="envivo-panel__cabeza">
          <h2 id={tituloId} className="envivo-panel__titulo">{titulo}</h2>
          <button type="button" className="envivo-panel__cerrar" aria-label="Cerrar" onClick={() => alCerrar(true)}>
            <Icono nombre="cerrar" />
          </button>
        </div>
      )}
      {sinTitulo && (
        <button type="button" className="envivo-panel__cerrar envivo-panel__cerrar--suelto" aria-label="Cerrar" onClick={() => alCerrar(true)}>
          <Icono nombre="cerrar" />
        </button>
      )}
      {children}
    </section>
  );
}

/** A notice of the chat: who and what, to open it or let it go. It goes by itself, unless the mouse or the focus is on it. */
function Aviso({ aviso, alCerrar, alAbrir }) {
  const [quieto, setQuieto] = useState(false);
  const cerrarRef = useRef(alCerrar);
  useLayoutEffect(() => {
    cerrarRef.current = alCerrar;
  });
  useEffect(() => {
    if (quieto) return undefined;
    const t = setTimeout(() => cerrarRef.current(), AVISO);
    return () => clearTimeout(t);
  }, [quieto]);
  return (
    <div
      className="envivo-aviso"
      style={{ '--persona': aviso.color }}
      onPointerEnter={() => setQuieto(true)}
      onPointerLeave={() => setQuieto(false)}
      onFocus={() => setQuieto(true)}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setQuieto(false)}
    >
      <p className="envivo-aviso__quien">
        <Icono nombre={aviso.tipo === 'chat' ? 'chat' : 'pestanas'} />
        {aviso.nombre}
        {aviso.mas > 0 && <span className="envivo-aviso__mas">y {aviso.mas} más</span>}
      </p>
      <p className="envivo-aviso__texto">{aviso.texto}</p>
      <div className="envivo-aviso__botones">
        {aviso.tipo === 'chat' ? <button type="button" className="boton boton--chico" onClick={alAbrir}>Abrir el chat</button> : <span />}
        <button type="button" className="envivo-aviso__cerrar" aria-label="Cerrar el aviso" onClick={alCerrar}>
          <Icono nombre="cerrar" />
        </button>
      </div>
    </div>
  );
}
