import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { documentoDeTexto } from '../lib/consultron/adjuntar';
import { ponerEnVisor, useEnVisor, useHayConsultron } from '../lib/consultron/enVisor';
import { useSoloEnCaja } from '../lib/consultron/panel';
import { IconoMenu } from '../layouts/Menu';
import { useSesionEnVivo } from '../lib/enVivo/estado';
import { llevarResumen } from '../lib/enVivo/llevar';
import { docDeResumen } from '../lib/lectura';
import { cargarTextos, FORMATOS } from '../lib/santoResumen';
import { lugarDeBarra, seleccionDicha, textoMarcado } from '../lib/seleccionEnMarco';
import { useConsulta } from '../lib/useConsulta';
import { FORMA, traerHtml, traerParaLeer, traerPdf, traerVista, urlDeBajar } from '../lib/verResumen';
import { ErrorConReintento } from './Filas';
import LlevarALaSesion from './enVivo/LlevarALaSesion';
import EsperaLector from './lector/Espera';
import { BarraSeleccion } from './lector/Resaltar';

const VisorPdf = lazy(() => import('./VisorPdf'));
const ConsultronEnVisor = lazy(() => import('./consultron/EnVisor'));
// From here Consultron goes beside the summary (resumenes.css, 62.5rem).
const ANCHO_AL_LADO = 1000;
const useAncho = () => useSyncExternalStore((f) => (window.addEventListener('resize', f), () => window.removeEventListener('resize', f)), () => window.innerWidth, () => 1280);
const otraPestana = <span className="solo-lectores">, se abre en otra pestaña</span>;
// The reader of El Santo Resumen for an HTML whose scripts were turned on there, and how long it has to say it is ready.
// In development only, another reader on this computer (VITE_LECTOR_LOCAL, as http://localhost:<port>/visor/), to try a
// change of it before it is published. A build always takes the published one.
const LECTOR_LOCAL = import.meta.env.DEV ? (import.meta.env.VITE_LECTOR_LOCAL ?? '') : '';
const LECTOR = /^http:\/\/(localhost|127\.0\.0\.1):\d{1,5}\/visor\/$/.test(LECTOR_LOCAL) ? LECTOR_LOCAL : 'https://demo.lutastudios.com/visor/';
const ESPERA_LECTOR = 10_000;

// While it comes: a sheet of the size of what is coming, with the container marked busy. Not a live region: it is born
// with its text, and that is not announced.
function Espera({ forma }) {
  return (
    <div className={`visor__espera visor__espera--${forma}`} aria-busy="true">
      <span className="solo-lectores">Abriendo el resumen</span>
      <i aria-hidden="true" />
    </div>
  );
}

// What the viewer downloads. Closing it or trying again stops the download on its way; useConsulta drops the answer of
// a round that is no longer the last one, so the stop of an old one shows nothing.
function useDescarga(traer, deps) {
  const control = useRef(null);
  useEffect(() => () => control.current?.abort(), []);
  return useConsulta(() => {
    control.current?.abort();
    control.current = new AbortController();
    return traer(control.current.signal);
  }, deps);
}

// `enMesa`: open in a tab of a live session (ResumenEnLaMesa): `pdf` is what the reader gets from the table, and
// `alListo({ caja, texto })` hears, once each body has it, the box that scrolls (or null) and the summary's text.
function Pdf({ r, enMesa }) {
  const { datos, error, recargar } = useDescarga((senal) => traerPdf(r.id, senal), [r.id]);
  // Its Consultron is the reader's: it answers with this summary alone, as beside an HTML one.
  const abierto = useTextoDe(r, useEnVisor());
  const resumenDelPdf = useMemo(() => ({ abierto, doc: `resumen:${r.id}`, fuente: fuenteDeResumen(r) }), [abierto, r]);
  if (error && !datos) return <ErrorConReintento texto={error} recargar={recargar} />;
  if (!datos) return <EsperaLector />;
  return (
    <div className="visor__pdf">
      <Suspense fallback={<EsperaLector />}><VisorPdf blob={datos} nombre={r.titulo} doc={enMesa ? null : docDeResumen(r.id)} origen={{ materia: null, apunte: r.titulo }} resumen={resumenDelPdf} compartido={enMesa?.pdf ?? null} /></Suspense>
    </div>
  );
}

// The reader did not say it was ready: the summary is still there, in El Santo Resumen.
function SinLector({ r, reintentar }) {
  return (
    <div className="mensaje mensaje--error visor__sin-lector" role="alert">
      <p>Este resumen no se pudo abrir acá.</p>
      <p className="visor__salidas">
        <button type="button" className="boton boton--secundario boton--chico" onClick={reintentar}>Probar de nuevo</button>
        {r.url && <a className="boton boton--secundario boton--chico" href={r.url} target="_blank" rel="noreferrer">Abrir en El Santo Resumen{otraPestana}</a>}
      </p>
    </div>
  );
}

// «Preguntar» over what is selected in a summary's frame, for both ways of showing one. Esc on it hides it and goes back
// to the summary, without closing the reader.
function BarraDelMarco({ sel, marco, alPreguntar, ocultar, soltar }) {
  const alTecla = (e) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    ocultar();
    marco.current?.focus({ preventScroll: true });
  };
  return (
    <div className="visor__barra" onKeyDown={alTecla}>
      <BarraSeleccion
        estilo={sel.estilo}
        nombre="Preguntar sobre lo seleccionado"
        onPreguntar={() => {
          alPreguntar(sel.texto);
          soltar();
        }}
      />
    </div>
  );
}

// What the reader says is selected in a summary with scripts: Super CVG cannot read that frame, its reader tells it
// (message `visor-seleccion`, checked by seleccionDicha) and clears it when asked (`soltar-seleccion`).
function useSeleccionDelLector(marco, activo) {
  const [sel, setSel] = useState(null);
  useEffect(() => {
    if (!activo) return undefined;
    const oir = (e) => {
      const el = marco.current;
      if (!el || e.source !== el.contentWindow) return;
      const s = seleccionDicha(e.data);
      if (s === undefined) return;
      const caja = el.parentElement;
      const estilo = s && caja && lugarDeBarra({ marco: el.getBoundingClientRect(), caja: caja.getBoundingClientRect(), primera: s.primera, ultima: s.ultima });
      setSel(estilo ? { texto: s.texto, estilo } : null);
    };
    window.addEventListener('message', oir);
    return () => {
      window.removeEventListener('message', oir);
      setSel(null);
    };
  }, [marco, activo]);
  const soltar = () => {
    // '*': the reader's frame has no origin of its own (sandbox), and the message carries nothing.
    marco.current?.contentWindow?.postMessage({ tipo: 'soltar-seleccion' }, '*');
    setSel(null);
  };
  return { sel, ocultar: () => setSel(null), soltar };
}

// An HTML whose scripts were turned on in El Santo Resumen runs as it does there: in its reader, at another address
// made only for this, inside a frame that may run scripts and nothing else (no origin, nothing of Super CVG at hand).
// The reader gets the HTML once, when it says it is ready.
function ConScripts({ r, html, alPreguntar, enMesa }) {
  const marco = useRef(null);
  const [vez, setVez] = useState(0);
  const [fallo, setFallo] = useState(false);
  // Until its reader says it's ready, the sheet that waits: the frame loads behind it.
  const [listo, setListo] = useState(false);
  // Its frame is of another origin: the table reads its text from the HTML, and nothing follows its scroll. The
  // reader's frame (`lector`) once it has the summary: it tells where the pointer is (enVivo/punterosDelLector.js).
  const alListo = enMesa?.alListo;
  const texto = useMemo(() => (alListo ? textoDeHtml(html) : ''), [alListo, html]);
  useEffect(() => alListo?.({ caja: null, texto, lector: listo && !fallo ? marco.current : null }), [alListo, texto, listo, fallo, vez]);
  const titulo = `Resumen: ${r.titulo}`;
  const { sel, ocultar, soltar } = useSeleccionDelLector(marco, Boolean(alPreguntar) && listo && !fallo);

  // Before anything can arrive from the frame, which starts loading as soon as it is in the page.
  useLayoutEffect(() => {
    if (fallo) return undefined;
    const el = marco.current;
    let tarde = null;
    const entregar = (e) => {
      if (e.source !== el.contentWindow || e.data?.tipo !== 'visor-listo') return;
      soltar();
      setListo(true);
      el.contentWindow.postMessage({ tipo: 'resumen', html, titulo }, '*');
    };
    const soltar = () => {
      clearTimeout(tarde);
      window.removeEventListener('message', entregar);
    };
    window.addEventListener('message', entregar);
    tarde = setTimeout(() => {
      soltar();
      setFallo(true);
    }, ESPERA_LECTOR);
    return soltar;
  }, [html, titulo, vez, fallo]);

  if (fallo) {
    return <SinLector r={r} reintentar={() => { setFallo(false); setListo(false); setVez((v) => v + 1); }} />;
  }
  return (
    <>
      {!listo && <Espera forma="html" />}
      <iframe
      key={vez}
      ref={marco}
        className={`visor__marco visor__marco--scripts${listo ? '' : ' visor__marco--esperando'}`}
        title={titulo}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        src={LECTOR}
      />
      {alPreguntar && sel && <BarraDelMarco sel={sel} marco={marco} alPreguntar={alPreguntar} ocultar={ocultar} soltar={soltar} />}
    </>
  );
}

// What the student selects in the frame of a clean copy, read from here: only its text, as plain text, and where it
// is (seleccionEnMarco.js). Nothing else of the summary is read, and nothing is written into it. While the mouse is
// down it waits, as the PDF reader does; it follows the frame's scroll, and Esc hides it.
function useSeleccionEnMarco(marco, activo) {
  const [sel, setSel] = useState(null);
  // Each load of the frame (onLoad), to listen to the document it has now.
  const [carga, setCarga] = useState(0);

  useEffect(() => {
    const el = marco.current;
    const ventana = el?.contentWindow;
    const doc = el?.contentDocument;
    if (!activo || !carga || !ventana || !doc) return undefined;
    let mostrado = false;
    const poner = (s) => {
      mostrado = Boolean(s);
      setSel(s);
    };
    const leer = () => {
      const s = ventana.getSelection();
      if (!s?.rangeCount || s.isCollapsed) return null;
      const texto = textoMarcado(s.toString());
      const cajas = [...s.getRangeAt(0).getClientRects()].filter((c) => c.width || c.height);
      const caja = el.parentElement;
      if (!texto || !cajas.length || !caja) return null;
      const estilo = lugarDeBarra({ marco: el.getBoundingClientRect(), caja: caja.getBoundingClientRect(), primera: cajas[0], ultima: cajas[cajas.length - 1] });
      return estilo && { texto, estilo };
    };
    let espera = null;
    let apretado = false;
    const revisar = () => {
      clearTimeout(espera);
      espera = setTimeout(() => {
        if (!apretado) poner(leer());
      }, 140);
    };
    const alApretar = (e) => {
      apretado = e.pointerType === 'mouse';
      if (apretado) poner(null);
    };
    const alSoltar = () => {
      if (!apretado) return;
      apretado = false;
      revisar();
    };
    // It follows the selection while the frame scrolls, hides while it's out of sight and comes back with it.
    let cuadro = null;
    const alScrollear = () => {
      if (apretado || cuadro) return;
      cuadro = requestAnimationFrame(() => {
        cuadro = null;
        if (!apretado) poner(leer());
      });
    };
    const alTecla = (e) => {
      if (e.key !== 'Escape' || !mostrado) return;
      e.preventDefault();
      poner(null);
    };
    doc.addEventListener('selectionchange', revisar);
    doc.addEventListener('pointerdown', alApretar);
    doc.addEventListener('pointerup', alSoltar);
    doc.addEventListener('keydown', alTecla);
    ventana.addEventListener('scroll', alScrollear, { passive: true });
    // A drag that ends outside the frame ends here.
    document.addEventListener('pointerup', alSoltar);
    return () => {
      clearTimeout(espera);
      cancelAnimationFrame(cuadro);
      doc.removeEventListener('selectionchange', revisar);
      doc.removeEventListener('pointerdown', alApretar);
      doc.removeEventListener('pointerup', alSoltar);
      doc.removeEventListener('keydown', alTecla);
      ventana.removeEventListener('scroll', alScrollear);
      document.removeEventListener('pointerup', alSoltar);
      setSel(null);
    };
  }, [marco, activo, carga]);

  const soltar = () => {
    marco.current?.contentWindow?.getSelection()?.removeAllRanges();
    setSel(null);
  };
  return { sel, cargado: () => setCarga((n) => n + 1), ocultar: () => setSel(null), soltar };
}

// The HTML lives in a frame with no scripts, as in El Santo Resumen. One whose scripts were turned on there runs them in
// its reader. `alPreguntar(texto)`: what the student selected goes to Consultron (only when it's here).
function Html({ r, alPreguntar, enMesa }) {
  const { datos, error, recargar } = useDescarga((senal) => traerParaLeer(r.id, r.js, senal), [r.id, r.js]);
  const marco = useRef(null);
  const { sel, cargado, ocultar, soltar } = useSeleccionEnMarco(marco, Boolean(alPreguntar));
  const alCargar = () => {
    cargado();
    const doc = marco.current?.contentDocument;
    if (enMesa && doc) enMesa.alListo({ caja: doc.scrollingElement, texto: textoDeHtml(doc.documentElement.outerHTML) });
  };
  if (error && !datos) return <ErrorConReintento texto={error} recargar={recargar} />;
  if (!datos) return <Espera forma="html" />;
  if (datos.scripts) return <ConScripts r={r} html={datos.html} alPreguntar={alPreguntar} enMesa={enMesa} />;
  const notas = [
    r.js && 'Tiene partes interactivas que andan solo en El Santo Resumen.',
    datos.formulas && 'Las fórmulas se ven bien solo en El Santo Resumen.',
  ].filter(Boolean);
  return (
    <>
      {notas.length > 0 && <p className="visor__nota visor__nota--arriba">{notas.join(' ')}</p>}
      {/* allow-same-origin lets this page read what is selected in it. It must NEVER go with allow-scripts: together,
          the summary's own scripts would run as Super CVG, with the student's key and data at hand (and could even
          take the sandbox off its own frame). Without allow-scripts nothing in it runs (documentoAislado takes the
          scripts out too), so its origin gives it no power. Guarded by VisorResumen.test.js. */}
      <iframe
        ref={marco}
        className="visor__marco"
        title={`Resumen: ${r.titulo}`}
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer"
        srcDoc={datos.documento}
        onLoad={alCargar}
      />
      {alPreguntar && sel && <BarraDelMarco sel={sel} marco={marco} alPreguntar={alPreguntar} ocultar={ocultar} soltar={soltar} />}
    </>
  );
}

// A Word or a PowerPoint: the text El Santo Resumen takes out of it, in paragraphs.
function Vista({ r, enMesa }) {
  const { datos, error, recargar } = useDescarga((senal) => traerVista(r.id, senal), [r.id]);
  const hoja = useRef(null);
  const alListo = enMesa?.alListo;
  useEffect(() => {
    if (datos && alListo) alListo({ caja: hoja.current?.closest('.visor__cuerpo') ?? null, texto: datos.texto });
  }, [datos, alListo]);
  if (error && !datos) return <ErrorConReintento texto={error} recargar={recargar} />;
  if (!datos) return <Espera forma="vista" />;
  const parrafos = datos.texto.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (!parrafos.length) return <p className="visor__nota">Este resumen no trae texto para mostrar. Puede que sea de imágenes. Bajalo para verlo.</p>;
  return (
    <div ref={hoja} className="visor__vista">
      <div className="visor__hoja">
        {parrafos.map((p, i) => <p key={i}>{p}</p>)}
      </div>
      <p className="visor__nota">{datos.cortado ? 'Es solo el comienzo del texto, sin formato. Bajalo para verlo entero.' : 'Es solo el texto, sin formato ni imágenes.'}</p>
    </div>
  );
}

// A Google Docs or Slides lives in Google: it opens there.
function Afuera({ r, enMesa }) {
  const nombre = FORMATOS[r.formato] ?? 'Google';
  const alListo = enMesa?.alListo;
  useEffect(() => alListo?.({ caja: null, texto: '' }), [alListo]);
  return (
    <div className="visor__afuera">
      <p>Este resumen es un {nombre}. Se abre en Google.</p>
      <a className="boton" href={urlDeBajar(r.id)} target="_blank" rel="noreferrer">Abrir en {nombre}{otraPestana}</a>
    </div>
  );
}

const CUERPOS = { pdf: Pdf, html: Html, vista: Vista, afuera: Afuera };

// The text of the summary for Consultron, the one El Santo Resumen gives it (santoResumen.js `cargarTextos`), as the
// document it answers with. Without it, the summary's own text: its HTML or its Word or PowerPoint text. Undefined
// while it comes, null if the summary has none.
// What a summary is for Consultron (fuentes.js): one of El Santo Resumen, open on the screen.
const fuenteDeResumen = (r) => ({ tipo: 'resumen', nombre: r.titulo, materia: r.materiaNombre ?? r.materia, resumen: r, abierta: true });

// Block elements end their line, so the text keeps its paragraphs and titles apart.
const BLOQUES = 'p, li, h1, h2, h3, h4, h5, h6, div, section, article, header, footer, pre, blockquote, tr, dt, dd, figcaption, br';

/** The text of a summary's HTML, read without running anything of it (DOMParser makes an inert document). */
export function textoDeHtml(html) {
  const pagina = new DOMParser().parseFromString(String(html), 'text/html');
  pagina.querySelectorAll('script, style, noscript, template, svg').forEach((e) => e.remove());
  pagina.querySelectorAll(BLOQUES).forEach((e) => e.append('\n'));
  pagina.querySelectorAll('td, th').forEach((e) => e.append(' '));
  return (pagina.body?.textContent ?? '')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

async function textoPropio(r) {
  const forma = FORMA[r.formato];
  if (forma === 'html') return textoDeHtml(await traerHtml(r.id));
  if (forma === 'vista') return (await traerVista(r.id)).texto;
  return '';
}

function useTextoDe(r, pedido) {
  const [doc, setDoc] = useState(undefined);
  useEffect(() => {
    if (!pedido) return undefined;
    let vivo = true;
    (r.materia ? cargarTextos(r.materia).catch(() => []) : Promise.resolve([]))
      .then(async (textos) => textos.find((t) => t.id === r.id)?.texto || (await textoPropio(r).catch(() => '')))
      .then((texto) => {
        if (vivo) setDoc(texto?.trim() ? documentoDeTexto(`resumen:${r.id}`, fuenteDeResumen(r), texto) : null);
      })
      .catch(() => {
        if (vivo) setDoc(null);
      });
    return () => {
      vivo = false;
    };
  }, [r, pedido]);
  return doc;
}

// Consultron beside a summary, as in the PDF reader (a PDF brings its own), and what was selected to ask it.
// `botonConsultron`: the ref of its button in the bar, where the focus goes back when it closes. Also for a tab of a
// live session (enVivo/herramientas/Resumen.jsx), with Acciones and Fila: the same viewer without its sheet.
// `enMesa`: at the table of a live session, where with Consultron only in its box (Configuración, «Aparición») the
// table's box is the one.
export function useConsultronDelResumen(r, forma, botonConsultron, { enMesa = false } = {}) {
  const caja = useSoloEnCaja();
  const hayConsultron = useHayConsultron({ resumen: true }) && forma !== 'pdf' && !(caja && enMesa);
  const conConsultron = useEnVisor() && hayConsultron;
  const abierto = useTextoDe(r, conConsultron);
  // Narrow, Consultron goes over the summary: what's behind it is out of reach.
  const encima = useAncho() < ANCHO_AL_LADO;
  // What was selected in an HTML summary goes to Consultron beside it, marked, as from the PDF reader: { trozo, vez }.
  const [marcado, setMarcado] = useState(null);
  const preguntar = hayConsultron
    ? (texto) => {
        const fuente = { tipo: 'resumen', nombre: r.titulo, materia: r.materiaNombre ?? r.materia, resumen: r, abierta: true };
        setMarcado({ trozo: { doc: `resumen:${r.id}`, pagina: null, texto, fuente, marcado: true }, vez: Date.now() });
        ponerEnVisor(true);
      }
    : undefined;
  const cerrarConsultron = () => {
    ponerEnVisor(false);
    // Its button down on the right comes back once the box is gone.
    const volver = () => botonConsultron.current?.focus({ preventScroll: true });
    if (caja) requestAnimationFrame(volver);
    else volver();
  };
  return { hayConsultron, conConsultron, abierto, encima, caja, marcado, soltar: () => setMarcado(null), preguntar, cerrarConsultron };
}

// What to do with it: «Abrir en El Santo Resumen», «Bajar» and Consultron; in the viewer, its «me gusta» and taking it
// to a live session too.
export function Acciones({ r, forma, c, boton, antes = null }) {
  return (
    <div className="visor__acciones">
      {antes}
      {r.url && <a className="boton boton--secundario boton--chico" href={r.url} target="_blank" rel="noreferrer">Abrir en El Santo Resumen{otraPestana}</a>}
      {forma !== 'afuera' && <a className="boton boton--secundario boton--chico" href={urlDeBajar(r.id)} target="_blank" rel="noreferrer">Bajar{otraPestana}</a>}
      {c.hayConsultron && !c.caja && (
        <button ref={boton} type="button" className="boton boton--secundario boton--chico visor__consultron" aria-pressed={c.conConsultron} onClick={() => (c.conConsultron ? c.cerrarConsultron() : ponerEnVisor(true))}>
          <IconoMenu nombre="consultron" />
          Consultron
        </button>
      )}
    </div>
  );
}

// The summary and, beside it, Consultron. `boton`: the ref of Consultron's button, as for Acciones.
export function Fila({ r, forma, c, boton, alIr, enMesa = null }) {
  const Cuerpo = CUERPOS[forma];
  return (
    <div className="visor__fila">
      <div className="visor__cuerpo" inert={c.conConsultron && c.encima && !c.caja ? true : undefined}>
        <Cuerpo r={r} alPreguntar={c.preguntar} enMesa={enMesa} />
      </div>
      {c.hayConsultron && c.caja && !c.conConsultron && (
        <button ref={boton} type="button" className="flotante__boton" title="Consultron" onClick={() => ponerEnVisor(true)}>
          <IconoMenu nombre="consultron" />
          <span className="solo-lectores">Consultron</span>
        </button>
      )}
      {c.conConsultron && (
        <Suspense fallback={null}>
          <ConsultronEnVisor abierto={c.abierto} marcado={c.marcado} alSoltar={c.soltar} enResumen alLado={!c.encima && !c.caja} caja={c.caja} alCerrar={c.cerrarConsultron} alIr={alIr} />
        </Suspense>
      )}
    </div>
  );
}

/** A published summary of El Santo Resumen, open on the whole screen. `gusto`: its «me gusta», if it has one here. */
export default function VisorResumen({ resumen: r, gusto, onCerrar }) {
  const dialogo = useRef(null);
  const cerrar = useRef(null);
  const forma = FORMA[r.formato] ?? 'afuera';
  const enVivo = useSesionEnVivo();
  const botonConsultron = useRef(null);
  const c = useConsultronDelResumen(r, forma, botonConsultron);
  // Esc inside Consultron closes it, not the summary.
  const alCancelar = (e) => {
    if (c.conConsultron && e.target === dialogo.current && document.activeElement?.closest('.lector__consultron')) {
      e.preventDefault();
      c.cerrarConsultron();
    }
  };

  // showModal gives the focus to the first control, which is the heart: it starts on «Cerrar».
  useEffect(() => {
    const el = dialogo.current;
    if (!el.open) el.showModal();
    cerrar.current.focus();
  }, []);

  const antes = (
    <>
      {gusto}
      {enVivo?.sesion && <LlevarALaSesion key={r.id} sesion={enVivo.sesion} className="boton boton--secundario boton--chico" llevar={llevarResumen(r)} />}
    </>
  );
  return (
    <dialog ref={dialogo} className="visor" aria-labelledby="visor-titulo" data-forma={forma} data-consultron={c.conConsultron || undefined} onClose={onCerrar} onCancel={alCancelar}>
      <div className="visor__caja">
        <div className="visor__cabeza">
          <div className="visor__nombre">
            <h2 id="visor-titulo">{r.titulo}</h2>
            {r.dato && <p className="visor__dato">{r.dato}</p>}
          </div>
          <Acciones r={r} forma={forma} c={c} boton={botonConsultron} antes={antes} />
          <button ref={cerrar} type="button" className="boton boton--chico visor__cerrar" onClick={() => dialogo.current.close()}>Cerrar</button>
        </div>
        <Fila r={r} forma={forma} c={c} boton={botonConsultron} alIr={() => dialogo.current?.close()} />
      </div>
    </dialog>
  );
}
