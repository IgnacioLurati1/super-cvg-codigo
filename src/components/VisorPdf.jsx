import { lazy, Suspense, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { alternarPdfOscuro, cambiarAjustes, PANEL_PDF, pdfOscuro, useAjustes, useTemaOscuro } from '../lib/ajustes';
import { documentoDePaginas } from '../lib/consultron/adjuntar';
import { ponerEnVisor, useEnVisor, useHayConsultron } from '../lib/consultron/enVisor';
import { useSoloEnCaja } from '../lib/consultron/panel';
import { hallarTrozo } from '../lib/hallarTrozo';
import { alcanzaParaBuscar, hallarEnDocumento, idNuevo, LECTURA_VACIA, plegar, textoDePagina, TOPE_HALLAZGOS } from '../lib/lectura';
import { adivinarLenguaje, pareceCodigo } from '../lib/laboratorio/adivinar';
import { esLenguaje } from '../lib/laboratorio/lenguajes';
import { borradorEscrito, llevarAlLaboratorio } from '../lib/laboratorio/pendiente';
import { mioActual, useMio } from '../lib/mio';
import { opcionesPdf } from '../lib/opcionesPdf';
import { TROZO, transportePara } from '../lib/pdfPartes';
import { borrarResaltado, cambiarResaltado, lecturaDe, nombrarSenalador, recordarPagina, resaltar, sacarSenalador, senalar } from '../lib/resaltados';
import { useUI } from './ui';
import { IconoMenu } from '../layouts/Menu';
import { ariaDe, atajo, LEER_EN_VOZ, vigentes } from './lector/atajos';
import EsperaLector from './lector/Espera';
import Flotante from './lector/Flotante';
import { BotonPantalla, usePantallaCompleta } from './lector/PantallaCompleta';
import { crearCola } from './lector/cola';
import { acotar, armarLayout, BORDE, PUNTO, enCaja, escalaAncho, paginaEn, paginaLeyendo, porcentaje, siguientePaso, ventanaDe } from './lector/geometria';
import { imprimir, MUCHAS_PARA_IMPRIMIR } from './lector/imprimir';
import Pagina, { cajasDeRango, lugarDe } from './lector/Pagina';
import Panel from './lector/Panel';
import { codigoDeRango } from './lector/codigoDeSeleccion';
import { BarraSeleccion, Globo } from './lector/Resaltar';
import { BotonSenalar, useSenaladores } from './lector/Senaladores';
import { BarraVoz, BotonVoz, useVoz } from './lector/Voz';
import { useSobreTeclado } from './lector/sobreTeclado';
import './lector/lector.css';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

// Consultron beside the pages: the rest of it comes only when it opens.
const ConsultronEnVisor = lazy(() => import('./consultron/EnVisor'));
// What is marked to ask Consultron, at most this long: as an attachment that goes whole (adjuntar.js, ENTERO).
const TOPE_MARCADO = 1800;

const NADA = Object.freeze([]);
// With the panel open, a reader at least this wide keeps it on the side; a narrower one shows it over the pages.
const ANCHO_CON_PANEL = 880;
// However wide the side panel gets, the pages keep this much of the reader, and never less than MIN_PAGINAS pixels.
const PARTE_PAGINAS = 0.55;
const MIN_PAGINAS = 440;
const ANCHO_ANGOSTO = 560;
// How far the pages go down (or up) before the floating bars of a phone go away (or come back).
const CORRIDO_BARRAS = 24;
// A tool's name, the same in the bar (its title) and in «Más herramientas» (its text).
const nombreDeHerramienta = (boton) => boton.getAttribute('title') ?? boton.textContent;
// With Consultron open, a reader at least this wide keeps it beside the pages; a narrower one shows it over them.
const ANCHO_CON_CONSULTRON = 1000;
// How much the scroll moves before the page in view is counted again.
const PASO_SCROLL = 24;
// Opening on a wide screen, the page goes up to this size and not to the whole width.
const MAX_AUTO = 1.25 * PUNTO;
// How long «Deshacer» stays after deleting a highlight, while the pointer and the focus are elsewhere.
const DESHACER_MS = 8000;
// The keys that scroll the pages: the first of them takes away the notice of where it opened.
const TECLAS_SCROLL = new Set(['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'PageDown', 'PageUp', 'Home', 'End', ' ']);

const TRAZOS = {
  panel: 'M4 5h16v14H4zM9.5 5v14',
  menos: 'M5 12h14',
  mas: 'M12 5v14M5 12h14',
  buscar: 'M10.5 4a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0-13M15.6 15.6L20 20',
  imprimir: 'M7 9V4h10v5M7 17H5a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2M7 14h10v6H7z',
  arriba: 'M6 15l6-6 6 6',
  abajo: 'M6 9l6 6 6-6',
  cerrar: 'M6 6l12 12M18 6L6 18',
  teclado: 'M3 7h18v10H3zM7 10.5h.01M10.5 10.5h.01M14 10.5h.01M17.5 10.5h.01M7.5 14h9',
  luna: 'M19.5 14.6A7.5 7.5 0 0 1 9.4 4.5a7.5 7.5 0 1 0 10.1 10.1z',
  puntos: 'M4.2 12a1.3 1.3 0 1 0 2.6 0a1.3 1.3 0 1 0-2.6 0M10.7 12a1.3 1.3 0 1 0 2.6 0a1.3 1.3 0 1 0-2.6 0M17.2 12a1.3 1.3 0 1 0 2.6 0a1.3 1.3 0 1 0-2.6 0',
};
// Where a file's highlights, notes and bookmarks are kept: with the student's things (resaltados.js), by `doc`.
const notasEnDisco = (doc) => ({
  resaltar: (r) => resaltar(doc, r),
  cambiar: (id, cambios, ahora) => cambiarResaltado(doc, id, cambios, ahora),
  borrar: (id) => borrarResaltado(doc, id),
  senalar: (n) => senalar(doc, n),
  sacar: (n) => sacarSenalador(doc, n),
  nombrar: (n, nombre) => nombrarSenalador(doc, n, nombre),
});
const SIN_LUGAR = 'No se pudo guardar el resaltado. Puede que el navegador no tenga más lugar.';

// The scale of a zoom, with the scale that fills the width of the view: in full screen the page takes the whole width;
// out of it, up to a size that reads well.
const escalaDeZoom = (zoom, alAncho, pantallaCompleta) => (zoom.modo === 'libre' ? zoom.escala : zoom.modo === 'ancho' || pantallaCompleta ? alAncho : Math.min(alAncho, MAX_AUTO));

// How far a page (from 1) is from the view of the reader, in pixels: 0 when some of it is in view.
const distanciaALaVista = (marco, ultimo) => (n) => {
  const el = marco.current;
  const L = ultimo.current.layout;
  if (!el || L?.tops[n - 1] === undefined) return 0;
  const arriba = el.scrollTop;
  const abajo = arriba + el.clientHeight;
  const top = L.tops[n - 1];
  const fin = top + L.altos[n - 1];
  return fin < arriba ? arriba - fin : top > abajo ? top - abajo : 0;
};

const Trazo = ({ nombre }) => <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d={TRAZOS[nombre]} /></svg>;

// Keys as the keyboard shows them, as in Configuración.
const Teclas = ({ atajo: a }) => (a.con ?? a.teclas).map((t, i) => <span key={t}>{i > 0 && (a.con ? ' + ' : ' y luego ')}<kbd>{t}</kbd></span>);

/** A PDF drawn here, with its text to select and find, the student's highlights and notes, and its index.
 * `doc`: the key of the file (lectura.js) to keep its highlights and the page it was left at; without it, neither.
 * `inicio`: { pagina, buscar } to open at a page with words found, from Buscar, or { pagina, fragmento } with a piece of
 * a source of Consultron to mark on it. A new one, with the reader open, goes there. `origen`: { materia, apunte }, what
 * code selected here takes with it to the lab. `fuente`: what this PDF is for Consultron (fuentes.js), for what is
 * marked here to ask it. `resumen`: it is a summary of El Santo Resumen, with `abierto`, its text for Consultron
 * (VisorResumen.jsx), which answers with it alone. `compartido`: open in a live session (enVivo/herramientas/apunte/
 * LectorCompartido.jsx): its highlights, notes and bookmarks are the table's (`notas`, `lectura`, each with its
 * `autor`), it says where it is (`mover`), goes where the one it follows is (`guia`, gliding with `desplazar(marco,
 * top)`) and stops following when the student moves on their own (`soltar`). `capa(layout)` draws over the pages,
 * `barra` goes in the bar, and `alAbrir` gets the text of the pages. Nothing of it goes to `doc`, which comes null.
 * `partes`: in place of `blob`, a big campus PDF coming by parts (pdfPartes.js): pdf.js asks only for what the pages
 * drawn need. Finding in it, Consultron beside it and printing bring the rest of the file in one request. */
export default function VisorPdf({ blob, partes = null, nombre = 'documento.pdf', doc = null, inicio = null, origen = null, fuente = null, resumen = null, compartido = null, cabeza = null }) {
  const [estado, setEstado] = useState({ pdf: null, base: null, error: null });
  const red = useRedDePartes(partes);

  useEffect(() => {
    let vivo = true;
    let tarea = null;
    (async () => {
      try {
        if (partes && !partes.blob) {
          const range = await transportePara(pdfjs.PDFDataRangeTransport, partes);
          if (!vivo) return range.abort();
          tarea = pdfjs.getDocument({ ...opcionesPdf(pdfjs), range, length: partes.largo, rangeChunkSize: TROZO, disableAutoFetch: true });
        } else {
          const data = new Uint8Array(await (partes?.blob ?? blob).arrayBuffer());
          tarea = pdfjs.getDocument(opcionesPdf(pdfjs, data));
        }
        const pdf = await tarea.promise;
        const primera = (await pdf.getPage(1)).getViewport({ scale: 1 });
        if (vivo) setEstado({ pdf, base: [primera.width, primera.height], error: null });
      } catch (e) {
        if (vivo) setEstado({ pdf: null, base: null, error: e?.name === 'PasswordException' ? 'clave' : 'roto' });
      }
    })();
    return () => {
      vivo = false;
      tarea?.destroy();
    };
  }, [blob, partes]);

  if (estado.error) {
    return (
      <>
        {cabeza}
        <p className="previa__aviso lector__error" role="alert">
          {estado.error === 'clave' ? 'Este PDF tiene contraseña. Bajalo para abrirlo.' : 'No se pudo mostrar este PDF. Bajalo para abrirlo.'}
        </p>
      </>
    );
  }
  if (!estado.pdf) {
    // A PDF by parts that can't open without connection: it opens by itself when the connection comes back.
    if (red.sinRed) return <>{cabeza}<p className="previa__aviso lector__error" role="status">Este PDF no quedó guardado. Abrilo con internet.</p></>;
    return <>{cabeza}<EsperaLector /></>;
  }
  return <Lector pdf={estado.pdf} base={estado.base} partes={partes} nombre={nombre} doc={doc} inicio={inicio} origen={origen} fuente={fuente} resumen={resumen} compartido={compartido} cabeza={cabeza} />;
}

// For a PDF by parts (pdfPartes.js): whether some part waits for the connection, and how many times it came back.
function useRedDePartes(partes) {
  const [red, setRed] = useState({ partes, sinRed: Boolean(partes?.sinRed), vuelta: 0 });
  useEffect(() => partes?.escuchar({
    alCambiar: () => setRed((r) => ({ partes, sinRed: partes.sinRed, vuelta: (r.partes === partes ? r.vuelta : 0) + (partes.sinRed ? 0 : 1) })),
  }), [partes]);
  return red.partes === partes ? red : { partes, sinRed: Boolean(partes?.sinRed), vuelta: 0 };
}

// Whether the whole file is here: always, but for a PDF still coming by parts (pdfPartes.js).
function useEntero(partes) {
  const [entero, setEntero] = useState(() => !partes || Boolean(partes.blob));
  useEffect(() => partes?.escuchar({ alTerminar: () => setEntero(true) }), [partes]);
  return entero || !partes || Boolean(partes.blob);
}

function Lector({ pdf, base, partes, nombre, doc, inicio, origen, fuente, resumen, compartido, cabeza }) {
  const total = pdf.numPages;
  const id = useId();
  const { confirmar } = useUI();
  // The one-key shortcuts, turned off in Configuración: Ctrl + F, F3 and Esc always work.
  const ajustes = useAjustes();
  const unaTecla = ajustes.atajos;
  // Dark pages (public/ajustes.js marks it in <html> and lector.css paints it): from here it's chosen for every PDF.
  // Turned off, back to the light ones the student had: claras or sepia.
  const oscuro = pdfOscuro(ajustes.pdf, useTemaOscuro());
  const alternarOscuro = () => alternarPdfOscuro(oscuro);
  const raiz = useRef(null);
  const barraRef = useRef(null);
  const botonAyuda = useRef(null);
  const cajaAyuda = useRef(null);
  const volverDeAyuda = useRef(null);
  const marco = useRef(null);
  const contenido = useRef(null);
  const campoPagina = useRef(null);
  const campoBuscar = useRef(null);
  const textos = useRef(new Map());
  const registro = useRef(new Map());
  const planosListos = useRef([]);
  const ancla = useRef(null);
  const ultimo = useRef({ layout: null, escala: 1, pagina: 1, inicial: false, salto: null, teclas: null, enBarra: false });
  // The drawings of the pages, one at a time, the closest to the view first (lector/cola.js).
  const [cola] = useState(crearCola);
  useEffect(() => cola.medirCon(distanciaALaVista(marco, ultimo)), [cola]);
  const impresion = useRef(null);

  const mio = useMio();
  // Where the highlights, notes and bookmarks are kept: the file's, a live session's, or nowhere (then there are none).
  const notas = useMemo(() => compartido?.notas ?? (doc ? notasEnDisco(doc) : null), [compartido?.notas, doc]);
  const lectura = compartido ? compartido.lectura : doc ? lecturaDe(mio, doc) : LECTURA_VACIA;
  const [arranque] = useState(() => {
    const guardada = doc ? lecturaDe(mioActual(), doc).pagina : null;
    const pagina = Math.min(total, Math.max(1, inicio?.pagina ?? guardada ?? 1));
    return { pagina, retomada: !inicio?.pagina && guardada > 1 ? guardada : null };
  });
  const [tactil] = useState(() => window.matchMedia?.('(pointer: coarse)').matches ?? false);

  const [tamanos, setTamanos] = useState(() => Array.from({ length: total }, () => base));
  const [vista, setVista] = useState({ ancho: 0, alto: 0, raiz: 0, lado: 0 });
  // 'auto': the width of the view, up to a size that reads well on a big screen; 'ancho': the width, whatever it is.
  const [zoom, setZoom] = useState({ modo: 'auto', escala: 1 });
  const [arriba, setArriba] = useState(0);
  const [panel, setPanel] = useState(null);
  const [pestana, setPestana] = useState(null);
  const [indice, setIndice] = useState(null);
  const [busqueda, setBusqueda] = useState({ abierta: Boolean(inicio?.buscar), consulta: inicio?.buscar ?? '' });
  const [planos, setPlanos] = useState(NADA);
  const [leyendoTexto, setLeyendoTexto] = useState(false);
  const [elegido, setElegido] = useState({ pagina: arranque.pagina, desde: -1, pedido: inicio?.buscar ? 1 : 0 });
  const [seleccion, setSeleccion] = useState(null);
  const [globo, setGlobo] = useState(null);
  const [color, setColor] = useState('amarillo');
  const [destello, setDestello] = useState(null);
  const [retomada, setRetomada] = useState(arranque.retomada);
  const [valorPagina, setValorPagina] = useState(null);
  const [ayuda, setAyuda] = useState(false);
  const [mas, setMas] = useState(false);
  const botonMas = useRef(null);
  const [imprimiendo, setImprimiendo] = useState(null);
  const [aviso, setAviso] = useState('');
  // The highlight just deleted, to bring it back: { r, desdePanel, vez }.
  const [borrado, setBorrado] = useState(null);
  // Consultron beside the pages (consultron/EnVisor.jsx), and what was marked to ask it: { trozo, vez }, in memory.
  // Only in its box (Configuración, «Aparición»): down on the right, opened from its button there; at the table of a
  // live session, the table's box is the one.
  const soloEnCaja = useSoloEnCaja();
  const hayConsultron = useHayConsultron() && !(soloEnCaja && compartido);
  const conConsultron = useEnVisor() && hayConsultron;
  const [marcado, setMarcado] = useState(null);
  const botonConsultron = useRef(null);
  // The piece of a source of Consultron marked on its page: { pagina, desde, hasta, clave }.
  const [marca, setMarca] = useState(null);

  // Full screen: what is under the top of the view stays there when going in and out (anclar).
  const pantalla = usePantallaCompleta(raiz, { antes: () => anclar(0, 0) });

  const alAncho = escalaAncho(tamanos, vista.ancho);
  // In full screen the page takes the whole width; out of it, up to a size that reads well.
  const escala = escalaDeZoom(zoom, alAncho, pantalla.modo);
  const angosto = vista.raiz > 0 && vista.raiz < ANCHO_ANGOSTO;
  // On a phone the bars float over the pages and go away while reading down, as in the phone's own browser; they come
  // back scrolling up, touching a page or near the top (lector__techo). The pages start under them, so nothing is
  // covered at the top. With the panel or Consultron open, they stay in their place.
  const techoRef = useRef(null);
  const [techo, setTecho] = useState(0);
  const flotante = tactil && angosto && panel === null && !conConsultron;
  const techoPaginas = flotante ? techo : 0;
  const layout = useMemo(() => armarLayout(tamanos, escala, vista.ancho, BORDE, techoPaginas, vista.lado), [tamanos, escala, vista.ancho, techoPaginas, vista.lado]);
  // The zoom as a live session shares it: 'auto', 'ancho' or the percent.
  const zoomCompartido = zoom.modo === 'libre' ? porcentaje(escala) : zoom.modo;
  const altoVista = vista.alto || 700;
  const pagina = vista.ancho ? paginaLeyendo(layout, arriba, altoVista) + 1 : arranque.pagina;
  const [desde, hasta] = vista.ancho ? ventanaDe(layout, arriba, altoVista, 1) : [0, -1];
  const conPanel = panel !== null;
  const panelAlLado = vista.raiz >= ANCHO_CON_PANEL;
  const consultronAlLado = vista.raiz >= ANCHO_CON_CONSULTRON;
  // The side panel, as wide as the student dragged it, under a tope that leaves the pages most of the reader: widening it
  // never pushes them out of sight. `arrastrePanel`: the width while its edge is being dragged, saved when it's let go.
  const [arrastrePanel, setArrastrePanel] = useState(null);
  const topePanel = Math.max(PANEL_PDF.min, Math.min(PANEL_PDF.max, Math.floor(vista.raiz - Math.max(MIN_PAGINAS, vista.raiz * PARTE_PAGINAS))));
  const anchoPanel = Math.min(topePanel, arrastrePanel ?? ajustes.anchoPanelPdf);
  const acotarPanel = (w) => Math.min(topePanel, Math.max(PANEL_PDF.min, Math.round(w)));
  const empezarArrastrePanel = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const borde = e.currentTarget;
    borde.setPointerCapture(e.pointerId);
    const x0 = e.clientX;
    const w0 = anchoPanel;
    let ultimo = w0;
    const mover = (ev) => {
      ultimo = acotarPanel(w0 + ev.clientX - x0);
      setArrastrePanel(ultimo);
    };
    const soltar = () => {
      borde.removeEventListener('pointermove', mover);
      borde.removeEventListener('pointerup', soltar);
      borde.removeEventListener('pointercancel', soltar);
      if (ultimo !== w0) cambiarAjustes({ anchoPanelPdf: ultimo });
      setArrastrePanel(null);
    };
    borde.addEventListener('pointermove', mover);
    borde.addEventListener('pointerup', soltar);
    borde.addEventListener('pointercancel', soltar);
  };
  // From the keyboard: the arrows move it 16 pixels (64 with Shift), Home and End take it to its ends.
  const teclaBordePanel = (e) => {
    const paso = e.shiftKey ? 64 : 16;
    const nuevo = { ArrowLeft: anchoPanel - paso, ArrowRight: anchoPanel + paso, Home: PANEL_PDF.min, End: topePanel }[e.key];
    if (nuevo === undefined) return;
    e.preventDefault();
    cambiarAjustes({ anchoPanelPdf: acotarPanel(nuevo) });
  };
  // On a phone the bar keeps what is used while reading; the rest goes under «Más herramientas», in a row of its own
  // that opens under the bar (a list over the pages would be cut by the bar, which scrolls sideways).
  const masAbierto = mas && angosto;
  // Choosing one of its tools closes it, so it doesn't keep a row of the screen (also in full screen); the focus goes
  // back to «Más herramientas».
  const cerrarMas = () => {
    setMas(false);
    botonMas.current?.focus({ preventScroll: true });
  };
  // The bar changing between the phone's and the computer's (the window or the phone turned) takes some buttons out of it.
  // If the focus was on one of them, it goes to the same one in its new place, or to «Más herramientas»: never to the page.
  // `enfocadoEnBarra`: the button the student last put the focus on, and its name, which stays the same in both places.
  // Sent to «Más herramientas» for a moment, the name is kept, so turning back finds the same button again.
  const enfocadoEnBarra = useRef(null);
  const restaurandoFoco = useRef(false);
  const alEnfocarHerramienta = (e) => {
    if (restaurandoFoco.current || !(e.target instanceof HTMLButtonElement)) return;
    enfocadoEnBarra.current = { el: e.target, nombre: nombreDeHerramienta(e.target) };
  };
  useLayoutEffect(() => {
    const antes = enfocadoEnBarra.current;
    if (!antes || antes.el.isConnected) return;
    const ahora = document.activeElement;
    if (ahora && ahora !== document.body) return;
    const igual = [...(raiz.current?.querySelectorAll('.lector__barra button, .lector__mas button') ?? [])].find((x) => nombreDeHerramienta(x) === antes.nombre);
    const destino = igual ?? botonMas.current;
    if (!destino) return;
    restaurandoFoco.current = true;
    destino.focus({ preventScroll: true });
    restaurandoFoco.current = false;
    enfocadoEnBarra.current = { el: destino, nombre: antes.nombre };
  }, [angosto]);
  const senal = useSenaladores(notas, lectura.senaladores, pagina, setAviso);

  const porPagina = useMemo(() => {
    const m = new Map();
    for (const r of lectura.resaltados) m.set(r.pagina, [...(m.get(r.pagina) ?? []), r]);
    return m;
  }, [lectura.resaltados]);

  const hallazgos = useMemo(() => (busqueda.abierta ? hallarEnDocumento(planos, busqueda.consulta) : NADA), [busqueda, planos]);
  const hallazgosPorPagina = useMemo(() => {
    const m = new Map();
    for (const h of hallazgos) m.set(h.pagina, [...(m.get(h.pagina) ?? []), h]);
    return m;
  }, [hallazgos]);
  // The match chosen: the one asked for, or the first from the page it was asked from.
  const posicionActual = useMemo(() => {
    if (!hallazgos.length) return -1;
    const exacta = hallazgos.findIndex((h) => h.pagina === elegido.pagina && h.desde === elegido.desde);
    if (exacta !== -1) return exacta;
    const siguiente = hallazgos.findIndex((h) => h.pagina > elegido.pagina || (h.pagina === elegido.pagina && h.desde >= elegido.desde));
    return siguiente === -1 ? 0 : siguiente;
  }, [hallazgos, elegido]);
  const hallazgo = posicionActual === -1 ? null : hallazgos[posicionActual];
  const claveActual = hallazgo ? `${elegido.pedido}|${hallazgo.pagina}|${hallazgo.desde}` : null;
  const actual = useMemo(() => (hallazgo ? { pagina: hallazgo.pagina, desde: hallazgo.desde, clave: claveActual } : null), [hallazgo, claveActual]);

  // ---------- The text of each page, read once ----------
  const obtenerTexto = useCallback((n) => {
    if (!textos.current.has(n)) {
      const promesa = pdf.getPage(n).then((hoja) => hoja.getTextContent()).then((contenidoTexto) => {
        const { texto, inicios } = textoDePagina(contenidoTexto.items);
        return { contenido: contenidoTexto, texto, inicios, ...plegar(texto) };
      });
      promesa.catch(() => textos.current.delete(n));
      textos.current.set(n, promesa);
    }
    return textos.current.get(n);
  }, [pdf]);

  // ---------- What Consultron beside it reads: this PDF alone, page by page ----------
  // undefined while it reads, null if the PDF has no text (a scan). A summary whose PDF has none uses the text El Santo
  // Resumen gives, if it does.
  const [delPdf, setDelPdf] = useState(undefined);
  const leerParaConsultron = useEnVisor() && hayConsultron;
  // Finding in it and Consultron beside it read every page: a PDF coming by parts brings the rest in one request, rather
  // than a part for each page.
  useEffect(() => {
    if (partes && (busqueda.abierta || leerParaConsultron)) partes.completar().catch(() => {});
  }, [partes, busqueda.abierta, leerParaConsultron]);
  useEffect(() => {
    if (!leerParaConsultron) return undefined;
    let vivo = true;
    Promise.all(Array.from({ length: Math.min(pdf.numPages, 400) }, (_, i) => obtenerTexto(i + 1)))
      .then((hojas) => {
        if (!vivo) return;
        const paginas = hojas.map((h) => h.texto);
        const nombreDoc = resumen?.doc ?? doc ?? `visor:${nombre}`;
        setDelPdf(paginas.some((t) => t.trim()) ? documentoDePaginas(nombreDoc, resumen?.fuente ?? fuente ?? { tipo: 'marcado', nombre }, paginas) : null);
      })
      .catch(() => vivo && setDelPdf(null));
    return () => {
      vivo = false;
    };
  }, [leerParaConsultron, pdf, obtenerTexto, resumen?.doc, resumen?.fuente, doc, nombre, fuente]);
  // A live session reads the text of the pages for its own Consultron.
  const alAbrir = compartido?.alAbrir;
  useEffect(() => alAbrir?.({ obtenerTexto, total }), [alAbrir, obtenerTexto, total]);
  const abiertoParaConsultron = delPdf === null ? (resumen?.abierto ?? null) : delPdf;

  const registrar = useCallback((n, datos) => {
    if (datos) registro.current.set(n, datos);
    else registro.current.delete(n);
  }, []);

  // ---------- Sizes, view and scroll ----------
  useLayoutEffect(() => {
    const u = ultimo.current;
    u.layout = layout;
    u.tamanos = tamanos;
    u.zoom = zoom;
    u.pantallaCompleta = pantalla.modo;
    u.anchoVista = vista.ancho;
    u.escala = escala;
    u.pagina = pagina;
    u.compartido = compartido;
    u.zoomCompartido = zoomCompartido;
    u.ventana = [desde, hasta, pagina];
    u.techo = techoPaginas;
    u.flotante = flotante;
    const el = marco.current;
    if (!el || !vista.ancho) return;
    if (!u.inicial) {
      u.inicial = true;
      el.scrollTop = Math.max(0, layout.tops[arranque.pagina - 1] - BORDE / 2 - techoPaginas);
      return;
    }
    const a = ancla.current;
    if (!a) return;
    ancla.current = null;
    // A pinch leaves the pages scaled until the new size is in place, in this same frame.
    if (a.pellizco) {
      contenido.current.style.transform = '';
      contenido.current.style.transformOrigin = '';
      contenido.current.style.willChange = '';
    }
    // Writing the same place again would stop a fling on a phone.
    const top = layout.tops[a.i] + a.fy * layout.altos[a.i] - a.py;
    const izquierda = layout.izquierdas[a.i] + a.fx * layout.anchos[a.i] - a.px;
    if (Math.abs(el.scrollTop - top) >= 1) el.scrollTop = top;
    if (Math.abs(el.scrollLeft - izquierda) >= 1) el.scrollLeft = izquierda;
  });

  // What is under a point of the view stays under it after the size changes.
  const lugarEn = useCallback((px, py) => {
    const el = marco.current;
    const L = ultimo.current.layout;
    if (!el || !L?.tops.length) return null;
    const x = el.scrollLeft + px;
    const y = el.scrollTop + py;
    const i = paginaEn(L.tops, y);
    return { i, fy: (y - L.tops[i]) / L.altos[i], fx: (x - L.izquierdas[i]) / L.anchos[i], px, py };
  }, []);
  const anclar = useCallback((px, py) => {
    const lugar = lugarEn(px, py);
    if (lugar) ancla.current = lugar;
  }, [lugarEn]);
  // With the place to keep (`ancla`) and a new zoom or width, where the scroll will be: the pages near the view are
  // counted from there in that same render. Counted from the old scroll, the pages on screen were taken away for a
  // moment and drawn again from nothing (a white page after each zoom).
  const preverArriba = useCallback((z, ancho) => {
    const u = ultimo.current;
    const a = ancla.current;
    const el = marco.current;
    if (!a || !el || !u.tamanos || !ancho) return;
    const L = armarLayout(u.tamanos, escalaDeZoom(z, escalaAncho(u.tamanos, ancho), u.pantallaCompleta), ancho, BORDE, u.techo ?? 0);
    if (L.tops[a.i] === undefined) return;
    setArriba(Math.max(0, Math.min(L.alto - el.clientHeight, L.tops[a.i] + a.fy * L.altos[a.i] - a.py)));
  }, []);
  const cambiarZoom = useCallback((z) => {
    preverArriba(z, ultimo.current.anchoVista);
    setZoom(z);
  }, [preverArriba]);

  useEffect(() => {
    const el = marco.current;
    const caja = raiz.current;
    const ro = new ResizeObserver(() => {
      // Hidden (a tab of a live session in the background), it loses its scroll: back in view, it goes where it was.
      const u = ultimo.current;
      if (!el.clientWidth) u.oculto = true;
      else if (u.oculto) {
        u.oculto = false;
        if (u.lugar) ancla.current = u.lugar;
      } else if (u.inicial) anclar(0, 0);
      if (el.clientWidth && el.clientWidth !== u.anchoVista) preverArriba(u.zoom, el.clientWidth);
      // Consultron beside the pages (EnVisor.jsx says how wide): they stay where they were without it while they fit.
      const lado = parseFloat(getComputedStyle(el).getPropertyValue('--lado-consultron')) || 0;
      setVista({ ancho: el.clientWidth, alto: el.clientHeight, raiz: caja.clientWidth, lado });
    });
    ro.observe(el);
    ro.observe(caja);
    return () => ro.disconnect();
  }, [anclar, preverArriba]);

  // The sizes of the other pages, in the background: most PDFs have them all equal and nothing moves. A PDF still coming
  // by parts would bring most of the file for them: then each page says its size when it is drawn (medir).
  const entero = useEntero(partes);
  const red = useRedDePartes(partes);
  const esperarDatos = useMemo(() => (partes && !entero ? (promesa) => partes.mientrasHaya(promesa) : null), [partes, entero]);
  const medir = useCallback((n, ancho, alto) => {
    const [a, b] = ultimo.current.tamanos?.[n - 1] ?? [];
    if (Math.abs(a - ancho) <= 0.5 && Math.abs(b - alto) <= 0.5) return;
    anclar(0, 0);
    setTamanos((t) => t.map((x, i) => (i === n - 1 ? [ancho, alto] : x)));
  }, [anclar]);
  useEffect(() => {
    if (!entero) return undefined;
    let vivo = true;
    (async () => {
      const nuevos = [base];
      let distinto = false;
      for (let n = 2; n <= total && vivo; n++) {
        try {
          const v = (await pdf.getPage(n)).getViewport({ scale: 1 });
          nuevos.push([v.width, v.height]);
          if (Math.abs(v.width - base[0]) > 0.5 || Math.abs(v.height - base[1]) > 0.5) distinto = true;
        } catch {
          nuevos.push(base);
        }
      }
      if (vivo && distinto) {
        anclar(0, 0);
        setTamanos(nuevos);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [pdf, base, total, anclar, entero]);

  useEffect(() => {
    let vivo = true;
    pdf.getOutline().then((o) => vivo && setIndice(o?.length ? o : null)).catch(() => {});
    return () => {
      vivo = false;
    };
  }, [pdf]);

  // The reader is drawn again only when the pages near the view or the page being read change: scrolling a long
  // PDF on a phone, a render every few pixels took the time of the scroll itself.
  const alScrollear = () => {
    const el = marco.current;
    const y = el.scrollTop;
    const u = ultimo.current;
    if (y === 0 || (Math.abs(y - arriba) >= PASO_SCROLL && cambiaLaVentana(u, y))) setArriba(y);
    if (u.flotante) seguirConBarras(u, y, el.clientHeight);
    if (el.clientWidth) u.lugar = lugarEn(0, 0);
    if (compartido && !u.cuadro) {
      u.cuadro = requestAnimationFrame(() => {
        u.cuadro = 0;
        avisarVista();
      });
    }
  };

  // The floating bars: down a bit (not a jump of the reader, bigger than the view) they go, up a bit or near the top
  // they come back. Only the attribute changes, with no render: the bars slide by the compositor.
  const mostrarBarras = useCallback((ver) => {
    const t = techoRef.current;
    if (!t || Boolean(ultimo.current.barrasFuera) === !ver) return;
    if (!ver && t.contains(document.activeElement)) return;
    ultimo.current.barrasFuera = !ver;
    t.toggleAttribute('data-fuera', !ver);
  }, []);
  const seguirConBarras = (u, y, alto) => {
    const dy = y - (u.yBarras ?? y);
    u.yBarras = y;
    // Writing a note, the keyboard opening moves the scroll: that isn't reading.
    if (document.activeElement?.closest?.('.lector__globo')) return;
    if (y <= u.techo) {
      u.corrido = 0;
      mostrarBarras(true);
      return;
    }
    if (!dy || Math.abs(dy) > alto * 0.9) return;
    u.corrido = Math.sign(dy) === Math.sign(u.corrido ?? 0) ? u.corrido + dy : dy;
    if (u.corrido > CORRIDO_BARRAS) mostrarBarras(false);
    else if (u.corrido < -CORRIDO_BARRAS) mostrarBarras(true);
  };
  useEffect(() => {
    if (!flotante) mostrarBarras(true);
  }, [flotante, mostrarBarras]);
  useLayoutEffect(() => {
    const t = techoRef.current;
    if (!flotante || !t) return undefined;
    const ro = new ResizeObserver(() => setTecho(t.offsetHeight));
    ro.observe(t);
    setTecho(t.offsetHeight);
    return () => ro.disconnect();
  }, [flotante]);

  const cambiaLaVentana = (u, y) => {
    const L = u.layout;
    if (!L || !u.ventana) return true;
    const [d, h] = ventanaDe(L, y, altoVista, 1);
    return d !== u.ventana[0] || h !== u.ventana[1] || paginaLeyendo(L, y, altoVista) + 1 !== u.ventana[2];
  };

  // ---------- A live session: where this one is, for the others, and following someone ----------
  const avisarVista = useCallback(() => {
    const el = marco.current;
    const u = ultimo.current;
    const L = u.layout;
    if (!u.compartido || !el?.clientWidth || !L?.tops.length) return;
    const i = paginaEn(L.tops, el.scrollTop + 1);
    const y = Math.min(1, Math.max(0, (el.scrollTop - L.tops[i]) / L.altos[i]));
    u.compartido.mover({ pagina: i + 1, y: Math.round(y * 1000) / 1000, zoom: u.zoomCompartido });
  }, []);
  useEffect(() => {
    if (compartido && vista.ancho) avisarVista();
  }, [compartido, avisarVista, zoomCompartido, vista.ancho]);
  // Moving on one's own (the wheel, a finger, the keys, the zoom, a jump) stops following.
  const propio = useCallback(() => ultimo.current.compartido?.soltar(), []);
  const guia = compartido?.guia ?? null;
  const claveGuia = guia ? `${guia.pagina}|${guia.y.toFixed(3)}|${guia.zoom}` : '';
  useLayoutEffect(() => {
    const el = marco.current;
    const u = ultimo.current;
    const L = u.layout;
    if (!guia || !vista.ancho || !el || !L?.tops.length) return;
    const i = Math.min(total, Math.max(1, guia.pagina)) - 1;
    if (guia.zoom !== u.zoomCompartido) {
      ancla.current = { i, fy: guia.y, fx: 0, px: 0, py: 0 };
      cambiarZoom(typeof guia.zoom === 'number' ? { modo: 'libre', escala: acotar((guia.zoom / 100) * PUNTO) } : { modo: guia.zoom, escala: u.escala });
    } else {
      // The session glides there (`desplazar`); the reader alone jumps.
      const top = L.tops[i] + guia.y * L.altos[i];
      if (u.compartido.desplazar) u.compartido.desplazar(el, top);
      else el.scrollTop = top;
    }
    // The key says when the place changed; the object is new every time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveGuia, vista.ancho, total]);
  useEffect(() => {
    if (!compartido) return undefined;
    const el = marco.current;
    const alTeclear = (e) => {
      if (e.target === el && TECLAS_SCROLL.has(e.key)) propio();
    };
    // Its scrollbar, dragged.
    const alApretar = (e) => {
      if (e.target === el) propio();
    };
    el.addEventListener('wheel', propio, { passive: true });
    el.addEventListener('touchmove', propio, { passive: true });
    el.addEventListener('keydown', alTeclear);
    el.addEventListener('pointerdown', alApretar);
    return () => {
      el.removeEventListener('wheel', propio);
      el.removeEventListener('touchmove', propio);
      el.removeEventListener('keydown', alTeclear);
      el.removeEventListener('pointerdown', alApretar);
    };
  }, [compartido, propio]);
  useEffect(() => {
    const u = ultimo.current;
    return () => cancelAnimationFrame(u.cuadro);
  }, []);

  const irAPagina = useCallback((n, ajuste = 0) => {
    propio();
    const el = marco.current;
    const L = ultimo.current.layout;
    const i = Math.min(total, Math.max(1, n)) - 1;
    if (!el || !L) return;
    mostrarBarras(true);
    el.scrollTop = Math.max(0, L.tops[i] - BORDE / 2 - (ultimo.current.techo ?? 0) + ajuste);
  }, [total, propio, mostrarBarras]);

  // Reading aloud (lector/Voz.jsx).
  const paginaActual = useCallback(() => ultimo.current.pagina, []);
  const voz = useVoz({ pdf, total, obtenerTexto, paginaActual, irAPagina, paginas: contenido, marco });

  // ---------- A source of Consultron ----------
  // Opened at a source, its piece is looked for in the text of the page and marked. Not found, it stays at the page.
  // Another source asked with the reader open (the chat beside it) comes as a new `inicio`: it goes to its page.
  const inicioVisto = useRef(inicio);
  useEffect(() => {
    if (inicioVisto.current === inicio) return;
    inicioVisto.current = inicio;
    if (inicio?.pagina) irAPagina(inicio.pagina);
  }, [inicio, irAPagina]);
  useEffect(() => {
    const texto = inicio?.fragmento;
    if (!texto) return undefined;
    const n = Math.min(total, Math.max(1, inicio.pagina ?? 1));
    let vivo = true;
    obtenerTexto(n)
      .then((t) => {
        const h = hallarTrozo(t.texto, texto);
        if (vivo) setMarca(h ? { de: inicio, pagina: n, desde: h.desde, hasta: h.hasta, clave: `${n}|${h.desde}|${Date.now()}` } : null);
      })
      .catch(() => vivo && setMarca(null));
    return () => {
      vivo = false;
    };
  }, [inicio, obtenerTexto, total]);
  // The mark is of the source it was opened at: another one takes it away.
  const marcaVigente = marca?.de === inicio ? marca : null;
  const quitarMarca = () => {
    setMarca(null);
    marco.current?.focus({ preventScroll: true });
  };

  // ---------- Zoom ----------
  const zoomA = useCallback((nueva, px, py) => {
    const el = marco.current;
    if (!el) return;
    const objetivo = acotar(nueva);
    if (Math.abs(objetivo - ultimo.current.escala) < 0.002) return;
    propio();
    anclar(px ?? el.clientWidth / 2, py ?? el.clientHeight / 3);
    cambiarZoom({ modo: 'libre', escala: objetivo });
  }, [anclar, propio, cambiarZoom]);
  const zoomPaso = useCallback((dir) => zoomA(siguientePaso(ultimo.current.escala, dir)), [zoomA]);
  const ajustar = useCallback(() => {
    const el = marco.current;
    propio();
    if (el) anclar(el.clientWidth / 2, el.clientHeight / 3);
    cambiarZoom({ ...ultimo.current.zoom, modo: 'ancho' });
  }, [anclar, propio, cambiarZoom]);

  // Ctrl and the wheel (or two fingers on a touchpad) zoom around the pointer; two fingers on a phone, around them.
  useEffect(() => {
    const el = marco.current;
    const capa = contenido.current;
    const alRodar = (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const caja = el.getBoundingClientRect();
      zoomA(ultimo.current.escala * Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0025)), e.clientX - caja.left, e.clientY - caja.top);
    };
    // While the fingers move only the pages' layer is scaled, by the compositor (will-change), and moved with the
    // fingers' middle: nothing is drawn again. Letting go, the point that was under the fingers goes under them at the
    // new size, and the pages drawn stay stretched until their new drawing is there.
    let gesto = null;
    const distancia = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const medio = (t, caja) => [(t[0].clientX + t[1].clientX) / 2 - caja.left, (t[0].clientY + t[1].clientY) / 2 - caja.top];
    const alEmpezar = (e) => {
      if (e.touches.length !== 2) return;
      const caja = el.getBoundingClientRect();
      const [px, py] = medio(e.touches, caja);
      const lugar = lugarEn(px, py);
      if (!lugar) return;
      gesto = { d0: distancia(e.touches) || 1, px, py, x: px, y: py, sx: el.scrollLeft, sy: el.scrollTop, lugar, caja, factor: 1, cuadro: 0 };
      capa.style.willChange = 'transform';
      capa.style.transformOrigin = `${el.scrollLeft + px}px ${el.scrollTop + py}px`;
    };
    const pintar = () => {
      gesto.cuadro = 0;
      // If the browser scrolled meanwhile (the fingers came one after the other), that already moved the pages.
      const x = gesto.x - gesto.px + el.scrollLeft - gesto.sx;
      const y = gesto.y - gesto.py + el.scrollTop - gesto.sy;
      capa.style.transform = `translate(${x}px, ${y}px) scale(${gesto.factor})`;
    };
    const alMover = (e) => {
      if (!gesto || e.touches.length !== 2) return;
      if (e.cancelable) e.preventDefault();
      const actualEscala = ultimo.current.escala;
      gesto.factor = acotar((actualEscala * distancia(e.touches)) / gesto.d0) / actualEscala;
      [gesto.x, gesto.y] = medio(e.touches, gesto.caja);
      if (!gesto.cuadro) gesto.cuadro = requestAnimationFrame(pintar);
    };
    const alTerminar = (e) => {
      if (!gesto || e.touches.length >= 2) return;
      const g = gesto;
      gesto = null;
      cancelAnimationFrame(g.cuadro);
      if (Math.abs(g.factor - 1) <= 0.01) {
        capa.style.transform = '';
        capa.style.transformOrigin = '';
        capa.style.willChange = '';
        return;
      }
      // The point that was under the fingers, where the fingers are now.
      propio();
      ancla.current = { ...g.lugar, px: g.x, py: g.y, pellizco: true };
      cambiarZoom({ modo: 'libre', escala: acotar(ultimo.current.escala * g.factor) });
    };
    el.addEventListener('wheel', alRodar, { passive: false });
    el.addEventListener('touchstart', alEmpezar, { passive: true });
    el.addEventListener('touchmove', alMover, { passive: false });
    el.addEventListener('touchend', alTerminar);
    el.addEventListener('touchcancel', alTerminar);
    return () => {
      el.removeEventListener('wheel', alRodar);
      el.removeEventListener('touchstart', alEmpezar);
      el.removeEventListener('touchmove', alMover);
      el.removeEventListener('touchend', alTerminar);
      el.removeEventListener('touchcancel', alTerminar);
    };
  }, [zoomA, lugarEn, propio, cambiarZoom]);

  // ---------- Find in the document ----------
  useEffect(() => {
    if (!busqueda.abierta) return undefined;
    let vivo = true;
    (async () => {
      const listos = planosListos.current;
      if (listos.length === total && listos.every(Boolean)) return;
      setLeyendoTexto(true);
      for (let n = 1; n <= total && vivo; n++) {
        if (listos[n - 1]) continue;
        try {
          const t = await obtenerTexto(n);
          listos[n - 1] = { plano: t.plano, origen: t.origen };
        } catch {
          listos[n - 1] = { plano: '', origen: [] };
        }
        if (vivo && (n % 6 === 0 || n === total)) setPlanos(listos.slice());
      }
      if (vivo) setLeyendoTexto(false);
    })();
    return () => {
      vivo = false;
    };
  }, [busqueda.abierta, total, obtenerTexto]);

  // A match asked for on a page far from the view: its page comes first, and the page puts the match itself in view.
  useLayoutEffect(() => {
    if (!claveActual || !elegido.pedido || ultimo.current.salto === claveActual || !hallazgo) return;
    ultimo.current.salto = claveActual;
    const el = marco.current;
    const L = ultimo.current.layout;
    const i = hallazgo.pagina - 1;
    if (!el || !L) return;
    if (L.tops[i] + L.altos[i] < el.scrollTop || L.tops[i] > el.scrollTop + el.clientHeight) el.scrollTop = Math.max(0, L.tops[i] - BORDE / 2 - (ultimo.current.techo ?? 0));
  }, [claveActual, elegido.pedido, hallazgo]);

  const ubicar = useCallback((n, caja) => {
    const el = marco.current;
    const L = ultimo.current.layout;
    if (!el || !L) return;
    const i = n - 1;
    const y = L.tops[i] + caja[1] * L.altos[i];
    const x = L.izquierdas[i] + caja[0] * L.anchos[i];
    if (y < el.scrollTop + 56 || y > el.scrollTop + el.clientHeight - 72) el.scrollTop = Math.max(0, y - el.clientHeight / 3);
    if (x < el.scrollLeft || x > el.scrollLeft + el.clientWidth - 48) el.scrollLeft = Math.max(0, x - 48);
  }, []);

  const abrirBusqueda = () => {
    setBusqueda((b) => ({ ...b, abierta: true }));
    setElegido((e) => ({ pagina: ultimo.current.pagina, desde: -1, pedido: e.pedido + 1 }));
    requestAnimationFrame(() => {
      campoBuscar.current?.focus();
      campoBuscar.current?.select();
    });
  };
  const cerrarBusqueda = () => {
    setBusqueda((b) => ({ ...b, abierta: false }));
    marco.current?.focus();
  };
  const escribirBusqueda = (consulta) => {
    setBusqueda({ abierta: true, consulta });
    setElegido((e) => ({ pagina: ultimo.current.pagina, desde: -1, pedido: e.pedido + 1 }));
  };
  const moverHallazgo = (dir) => {
    if (!hallazgos.length) return;
    const h = hallazgos[(posicionActual + dir + hallazgos.length) % hallazgos.length];
    setElegido((e) => ({ pagina: h.pagina, desde: h.desde, pedido: e.pedido + 1 }));
  };

  // ---------- Highlights ----------
  const leerSeleccion = useCallback(() => {
    const sel = document.getSelection();
    if (!notas || !sel?.rangeCount || sel.isCollapsed) return null;
    const rango = sel.getRangeAt(0);
    const nodo = rango.startContainer.nodeType === 3 ? rango.startContainer.parentElement : rango.startContainer;
    const hoja = nodo?.closest?.('.lector__pagina');
    if (!hoja || !contenido.current?.contains(hoja)) return null;
    const numero = Number(hoja.dataset.pagina);
    const reg = registro.current.get(numero);
    if (!reg) return null;
    const r = rango.cloneRange();
    if (!reg.capa.contains(r.startContainer)) r.setStart(reg.capa, 0);
    if (!reg.capa.contains(r.endContainer) || reg.fin.contains(r.endContainer)) r.setEndBefore(reg.fin);
    if (r.collapsed) return null;
    const cajas = cajasDeRango(r, hoja);
    if (!cajas.length) return null;
    const a = lugarDe(reg, r.startContainer, r.startOffset);
    const b = lugarDe(reg, r.endContainer, r.endOffset);
    // If it looks like code, the lab can run it.
    const codigo = codigoDeRango(r, reg.capa);
    const texto = r.toString().replace(/\s+/g, ' ').trim().slice(0, TOPE_MARCADO);
    return { pagina: numero, cajas, desde: b > a ? a : null, hasta: b > a ? b : null, codigo: pareceCodigo(codigo) ? codigo : null, texto };
  }, [notas]);

  useEffect(() => {
    if (!notas) return undefined;
    const el = contenido.current;
    let espera = null;
    let apretado = false;
    const revisar = () => {
      clearTimeout(espera);
      espera = setTimeout(() => {
        if (apretado) return;
        // Where the bar goes depends on the scroll, which `arriba` follows only from page to page.
        const sel = leerSeleccion();
        if (sel && marco.current) setArriba(marco.current.scrollTop);
        setSeleccion(sel);
      }, 140);
    };
    const alCambiar = () => {
      if (!ultimo.current.enBarra) revisar();
    };
    const alApretar = (e) => {
      if (e.target.closest?.('.lector__barra-sel, .lector__globo')) return;
      ultimo.current.enBarra = false;
      apretado = e.pointerType === 'mouse';
      if (apretado) setSeleccion(null);
    };
    const alSoltar = () => {
      if (!apretado) return;
      apretado = false;
      revisar();
    };
    document.addEventListener('selectionchange', alCambiar);
    el.addEventListener('pointerdown', alApretar);
    document.addEventListener('pointerup', alSoltar);
    return () => {
      clearTimeout(espera);
      document.removeEventListener('selectionchange', alCambiar);
      el.removeEventListener('pointerdown', alApretar);
      document.removeEventListener('pointerup', alSoltar);
    };
  }, [notas, leerSeleccion]);

  // While dragging over the text of a page, its end covers the whole page: the selection does not jump to the end of it.
  useEffect(() => {
    const el = contenido.current;
    const alApretar = (e) => e.target.closest?.('.textLayer')?.classList.add('selecting');
    const alSoltar = () => {
      for (const c of el.querySelectorAll('.textLayer.selecting')) c.classList.remove('selecting');
    };
    el.addEventListener('pointerdown', alApretar);
    document.addEventListener('pointerup', alSoltar);
    document.addEventListener('pointercancel', alSoltar);
    return () => {
      el.removeEventListener('pointerdown', alApretar);
      document.removeEventListener('pointerup', alSoltar);
      document.removeEventListener('pointercancel', alSoltar);
    };
  }, []);

  const crear = (sel, colorNuevo, conNota = false) => {
    if (!sel || !notas) return;
    const ahora = Date.now();
    // `texto` is for a live session (its Consultron reads it); the file's keeps only where it is (sanearResaltado).
    const r = { id: notas.nuevoId?.() ?? idNuevo(ahora), pagina: sel.pagina, cajas: sel.cajas, desde: sel.desde, hasta: sel.hasta, color: colorNuevo, nota: '', creado: ahora, cambiado: ahora, texto: sel.texto };
    ultimo.current.enBarra = false;
    if (!notas.resaltar(r)) {
      setAviso(notas.sinLugar ?? SIN_LUGAR);
      return;
    }
    setAviso('');
    setColor(colorNuevo);
    document.getSelection()?.removeAllRanges();
    setSeleccion(null);
    setGlobo(conNota ? { id: r.id, editando: true } : null);
  };

  // The selected code goes to the lab, ready to run, with where it came from. It stays in the tab's memory until the
  // student saves it as theirs (lib/laboratorio/pendiente.js).
  const navegar = useNavigate();
  const probar = async (sel) => {
    if (!sel?.codigo) return;
    // The draft of the lab goes away with this code: if the student wrote something there, asked first.
    if (borradorEscrito() && !(await confirmar({ titulo: '¿Reemplazar tu borrador?', texto: 'En el laboratorio tenés código sin guardar. Se cambia por el de este PDF.', boton: 'Reemplazar', peligro: true }))) return;
    const { lenguaje } = adivinarLenguaje(sel.codigo);
    llevarAlLaboratorio({ codigo: sel.codigo, lenguaje: esLenguaje(lenguaje) ? lenguaje : 'python', adivinado: lenguaje, materia: origen?.materia ?? null, apunte: origen?.apunte ?? nombre, pagina: sel.pagina });
    document.getSelection()?.removeAllRanges();
    setSeleccion(null);
    contenido.current?.closest('dialog')?.close();
    navegar('/laboratorio');
  };

  // What was selected goes to Consultron, beside the pages, as a piece of this PDF to ask about (Charla.jsx).
  const preguntarAConsultron = (sel) => {
    if (!sel?.texto) return;
    // A summary's text is the summary's: with its permission, Gemini answers about it.
    const trozo = { doc: resumen?.doc ?? doc ?? `visor:${nombre}`, pagina: sel.pagina, texto: sel.texto, fuente: resumen?.fuente ?? fuente ?? { tipo: 'marcado', nombre }, marcado: true };
    setMarcado({ trozo, vez: Date.now() });
    ponerEnVisor(true);
    document.getSelection()?.removeAllRanges();
    setSeleccion(null);
  };
  const cerrarConsultron = () => {
    ponerEnVisor(false);
    // Its button down on the right comes back once the box is gone.
    const volver = () => (botonConsultron.current ?? marco.current)?.focus({ preventScroll: true });
    if (soloEnCaja) requestAnimationFrame(volver);
    else volver();
  };
  // From an answer to another screen: the sheet of the reader closes first.
  const irDesdeConsultron = () => contenido.current?.closest('dialog')?.close();

  const resaltadoDe = (rid) => lectura.resaltados.find((r) => r.id === rid) ?? null;
  const abierto = globo ? resaltadoDe(globo.id) : null;
  // On a phone the bubble is a sheet at the foot of the reader: writing its note, it rises over the keyboard.
  const hojaGlobo = useRef(null);
  useSobreTeclado(hojaGlobo, Boolean(abierto && angosto && globo?.editando));

  const cambiarColor = (r, c) => {
    notas.cambiar(r.id, { color: c }, Date.now());
    setColor(c);
  };
  const guardarNota = (r, nota) => {
    if (!notas.cambiar(r.id, { nota }, Date.now())) {
      setAviso('No se pudo guardar la nota. Puede que el navegador no tenga más lugar.');
      return;
    }
    setGlobo(null);
    marco.current?.focus();
  };
  // A note left half written (Esc, a touch outside the bubble, closing the file) is kept as it was.
  const dejarNota = (rid, nota) => {
    if (!notas.cambiar(rid, { nota }, Date.now())) setAviso('No se pudo guardar la nota. Puede que el navegador no tenga más lugar.');
  };
  // With a note, it asks first; without one, it goes at once and «Deshacer» brings it back.
  const borrar = async (r, desdePanel = false) => {
    if (r.nota && !(await confirmar({ titulo: '¿Borrar el resaltado y su nota?', boton: 'Borrar', peligro: true }))) return;
    notas.borrar(r.id);
    setGlobo(null);
    setRetomada(null);
    setBorrado(r.nota ? null : { r, desdePanel, vez: Date.now() });
  };
  const deshacer = () => {
    const b = borrado;
    setBorrado(null);
    if (!b) return;
    if (!notas.resaltar(b.r)) {
      setAviso(notas.sinLugar ?? SIN_LUGAR);
      marco.current?.focus();
      return;
    }
    // Back where it was: its note in the panel, or the pages.
    requestAnimationFrame(() => {
      const nota = b.desdePanel ? raiz.current?.querySelector(`.lector__nota[data-id="${b.r.id}"] .lector__nota-ir`) : null;
      (nota ?? marco.current)?.focus({ preventScroll: !nota });
    });
  };

  const irAResaltado = (r, editar = false) => {
    const L = ultimo.current.layout;
    if (L) irAPagina(r.pagina, r.cajas[0][1] * L.altos[r.pagina - 1] - (marco.current?.clientHeight ?? 600) / 3);
    setDestello((d) => ({ id: r.id, vez: (d?.vez ?? 0) + 1 }));
    if (!panelAlLado) setPanel(null);
    setGlobo(editar ? { id: r.id, editando: true } : null);
  };

  // A touch on the pages that does nothing else brings the floating bars or sends them away.
  const alternarBarras = (e) => {
    if (ultimo.current.flotante && !e.target.closest('a, button, input, .lector__globo, .lector__barra-sel')) mostrarBarras(Boolean(ultimo.current.barrasFuera));
  };
  const alTocarPaginas = (e) => {
    if (e.target.closest('.lector__globo, .lector__barra-sel')) return;
    const sel = document.getSelection();
    if (sel && !sel.isCollapsed) return;
    if (!notas) {
      alternarBarras(e);
      return;
    }
    const hoja = e.target.closest('.lector__pagina');
    if (!hoja) {
      setGlobo(null);
      alternarBarras(e);
      return;
    }
    const caja = hoja.getBoundingClientRect();
    const punto = [(e.clientX - caja.left) / caja.width, (e.clientY - caja.top) / caja.height];
    setArriba(marco.current.scrollTop);
    const tocado = [...(porPagina.get(Number(hoja.dataset.pagina)) ?? [])].reverse().find((r) => r.cajas.some((c) => enCaja(punto, c)));
    setGlobo(tocado ? { id: tocado.id, editando: false } : null);
    if (!tocado && !globo) alternarBarras(e);
  };

  // Where the bar of a selection and the bubble of a highlight go, in the pages' own space.
  const lugarSobre = (n, cajas, { abajo }) => {
    const L = layout;
    const i = n - 1;
    const primera = cajas[0];
    const finCaja = cajas[cajas.length - 1];
    const x = L.izquierdas[i] + primera[0] * L.anchos[i];
    const arribaCaja = L.tops[i] + primera[1] * L.altos[i];
    const abajoCaja = L.tops[i] + (finCaja[1] + finCaja[3]) * L.altos[i];
    const debajo = abajo || arribaCaja - 56 < arriba;
    return { left: Math.round(Math.min(Math.max(8, x), L.ancho - 260)), top: Math.round(debajo ? abajoCaja + 10 : arribaCaja - 52) };
  };

  // ---------- Panel, printing and the rest ----------
  const pestanas = [...(notas ? ['notas'] : []), 'paginas', ...(indice ? ['indice'] : [])];
  const alternarPanel = (cual) => {
    // The tab of last time; the first time, the notes if there are any.
    const elegida = cual ?? (pestanas.includes(pestana) ? pestana : notas && (lectura.resaltados.length || lectura.senaladores.length) ? 'notas' : 'paginas');
    setPanel((p) => (p && (!cual || p === cual) ? null : elegida));
    setPestana(elegida);
  };

  const irADestino = async (item) => {
    try {
      const destino = typeof item.dest === 'string' ? await pdf.getDestination(item.dest) : item.dest;
      const ref = destino?.[0];
      const n = (typeof ref === 'object' && ref ? await pdf.getPageIndex(ref) : Number.isInteger(ref) ? ref : null);
      if (n === null || n === undefined) return;
      const L = ultimo.current.layout;
      const arribaPdf = destino[1]?.name === 'XYZ' && typeof destino[3] === 'number' ? destino[3] : null;
      const alto = tamanos[n]?.[1] ?? base[1];
      const ajuste = arribaPdf === null || !L ? 0 : Math.max(0, ((alto - arribaPdf) / alto) * L.altos[n] - 8);
      irAPagina(n + 1, ajuste);
      if (!panelAlLado) setPanel(null);
    } catch {
      // An index that points nowhere: nothing to do.
    }
  };

  const empezarImpresion = async () => {
    if (impresion.current) return;
    if (total > MUCHAS_PARA_IMPRIMIR) {
      const si = await confirmar({
        titulo: `¿Preparar las ${total} páginas para imprimir?`,
        texto: 'Con tantas puede tardar bastante y trabar un celular. Si te pasa, bajalo e imprimilo desde tu dispositivo.',
        boton: 'Preparar',
      });
      if (!si || impresion.current) return;
    }
    const control = new AbortController();
    impresion.current = { control, limpiar: null };
    setImprimiendo({ n: 0, total });
    try {
      // Every page is printed: a PDF coming by parts brings the rest in one request.
      partes?.completar().catch(() => {});
      const limpiar = await imprimir(pdf, { alAvanzar: (n, t) => setImprimiendo({ n, total: t }), senal: control.signal });
      if (impresion.current) impresion.current.limpiar = limpiar;
    } catch (e) {
      if (e?.name !== 'AbortError') setAviso('No se pudo preparar la impresión. Bajalo e imprimilo desde tu dispositivo.');
    }
    if (impresion.current?.control === control && !impresion.current.limpiar) impresion.current = null;
    else if (impresion.current?.limpiar) impresion.current = { control: null, limpiar: impresion.current.limpiar };
    setImprimiendo(null);
  };
  useEffect(() => () => {
    const i = impresion.current;
    i?.control?.abort();
    i?.limpiar?.();
  }, []);

  // The page where the student was, for next time: on closing, and when the tab goes to the background.
  useEffect(() => {
    if (!doc) return undefined;
    const u = ultimo.current;
    const guardar = () => recordarPagina(doc, u.pagina);
    const alOcultar = () => {
      if (document.visibilityState === 'hidden') guardar();
    };
    document.addEventListener('visibilitychange', alOcultar);
    return () => {
      document.removeEventListener('visibilitychange', alOcultar);
      guardar();
    };
  }, [doc]);

  // The notice of where it opened stays until it's closed or the student scrolls (not with the reader's own moves).
  useEffect(() => {
    if (!retomada) return undefined;
    const el = marco.current;
    const quitar = () => setRetomada(null);
    const alTeclear = (e) => {
      if (e.target === el && TECLAS_SCROLL.has(e.key)) quitar();
    };
    // Its scrollbar, dragged.
    const alApretar = (e) => {
      if (e.target === el && (e.offsetX >= el.clientWidth || e.offsetY >= el.clientHeight)) quitar();
    };
    el.addEventListener('wheel', quitar, { passive: true });
    el.addEventListener('touchmove', quitar, { passive: true });
    el.addEventListener('keydown', alTeclear);
    el.addEventListener('pointerdown', alApretar);
    return () => {
      el.removeEventListener('wheel', quitar);
      el.removeEventListener('touchmove', quitar);
      el.removeEventListener('keydown', alTeclear);
      el.removeEventListener('pointerdown', alApretar);
    };
  }, [retomada]);

  // The help of the keys takes the focus when it opens, and gives it back to what had it when it closes.
  useEffect(() => {
    if (ayuda) {
      const antes = document.activeElement;
      volverDeAyuda.current = antes instanceof HTMLElement && antes !== document.body ? antes : null;
      cajaAyuda.current?.querySelector('button')?.focus({ preventScroll: true });
      return;
    }
    const volver = volverDeAyuda.current;
    volverDeAyuda.current = null;
    const ahora = document.activeElement;
    if (!volver || (ahora && ahora !== document.body)) return;
    (volver.isConnected ? volver : botonAyuda.current ?? marco.current)?.focus({ preventScroll: true });
  }, [ayuda]);

  // The bar scrolls sideways when it doesn't fit: the edge with more buttons behind it fades (lector.css).
  useEffect(() => {
    const b = barraRef.current;
    const medir = () => {
      const izquierda = b.scrollLeft > 1;
      const derecha = b.scrollLeft + b.clientWidth < b.scrollWidth - 1;
      const mas = izquierda && derecha ? 'ambos' : izquierda ? 'izquierda' : derecha ? 'derecha' : null;
      if (mas) b.dataset.mas = mas;
      else delete b.dataset.mas;
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(b);
    for (const hijo of b.children) ro.observe(hijo);
    b.addEventListener('scroll', medir, { passive: true });
    return () => {
      ro.disconnect();
      b.removeEventListener('scroll', medir);
    };
  }, []);

  // ---------- Keys ----------
  const cerrarAlgo = () => {
    if (masAbierto) {
      setMas(false);
      botonMas.current?.focus();
    } else if (ayuda) setAyuda(false);
    else if (globo) setGlobo(null);
    else if (seleccion) {
      document.getSelection()?.removeAllRanges();
      setSeleccion(null);
    } else if (busqueda.abierta) cerrarBusqueda();
    else if (conConsultron && (!consultronAlLado || soloEnCaja)) cerrarConsultron();
    else if (marcaVigente) quitarMarca();
    else if (panel && !panelAlLado) setPanel(null);
    else if (!voz.cerrar()) return false;
    return true;
  };

  const alTeclear = (e) => {
    // Only with the focus in the reader, or in the sheet it opened in.
    const caja = raiz.current?.closest('dialog') ?? raiz.current;
    if (!caja || !(e.target instanceof Node) || !caja.contains(e.target)) return;
    // A window opened from Consultron over the reader (a summary): its keys are its own.
    const ventana = e.target.closest?.('dialog');
    if (ventana && ventana !== raiz.current?.closest('dialog')) return;
    // A confirmation over the reader: its keys are its own.
    if (document.querySelector('dialog.dialogo[open]')) return;
    const escribiendo = Boolean(e.target.closest?.('input, textarea, select, [contenteditable="true"]'));
    const control = e.ctrlKey || e.metaKey;
    const tecla = e.key;
    if (control && !e.altKey && tecla.toLowerCase() === 'f') {
      e.preventDefault();
      abrirBusqueda();
      return;
    }
    if (tecla === 'Escape') {
      // From inside Consultron, it closes first.
      if (e.target.closest?.('.lector__consultron, dialog')?.classList.contains('lector__consultron')) {
        e.preventDefault();
        cerrarConsultron();
        return;
      }
      // In full screen, the first Esc only takes it out of it (the browser usually does it by itself).
      if (pantalla.modo) {
        e.preventDefault();
        pantalla.salir();
      } else if (cerrarAlgo()) e.preventDefault();
      return;
    }
    if (tecla === 'F3' || (control && tecla.toLowerCase() === 'g')) {
      e.preventDefault();
      if (busqueda.abierta) moverHallazgo(e.shiftKey ? -1 : 1);
      else abrirBusqueda();
      return;
    }
    // The one-key ones, only when they are on (WCAG 2.1.4).
    if (!unaTecla || control || e.altKey || e.isComposing || escribiendo) return;
    const accion = {
      '/': abrirBusqueda,
      '+': () => zoomPaso(1),
      '=': () => zoomPaso(1),
      '-': () => zoomPaso(-1),
      0: ajustar,
      g: () => campoPagina.current?.focus(),
      m: notas && (() => senal.alternar()),
      r: () => crear(leerSeleccion(), color),
      n: () => crear(leerSeleccion(), color, true),
      p: () => alternarPanel(),
      f: pantalla.alternar,
      o: alternarOscuro,
      l: voz.alternar,
      '?': () => setAyuda((a) => !a),
    }[tecla.length === 1 ? tecla.toLowerCase() : tecla];
    if (!accion) return;
    e.preventDefault();
    accion();
  };
  useLayoutEffect(() => {
    ultimo.current.teclas = alTeclear;
  });
  useEffect(() => {
    const u = ultimo.current;
    const f = (e) => u.teclas?.(e);
    document.addEventListener('keydown', f);
    return () => document.removeEventListener('keydown', f);
  }, []);

  // ---------- What shows ----------
  // With one letter it doesn't look yet: it would find everything.
  const consultaActiva = busqueda.abierta && alcanzaParaBuscar(busqueda.consulta);
  let cuenta = '';
  if (consultaActiva) {
    if (hallazgos.length) cuenta = `${posicionActual + 1} de ${hallazgos.length >= TOPE_HALLAZGOS ? `${TOPE_HALLAZGOS} o más` : hallazgos.length}`;
    else cuenta = leyendoTexto ? 'Buscando' : 'No está en el documento';
  }
  const barra = seleccion && !globo ? lugarSobre(seleccion.pagina, seleccion.cajas, { abajo: tactil }) : null;
  const lugarGlobo = abierto && !angosto ? lugarSobre(abierto.pagina, abierto.cajas, { abajo: true }) : null;

  const paginas = [];
  for (let i = 0; i < total; i++) {
    const n = i + 1;
    paginas.push(
      <Pagina
        key={n}
        numero={n}
        total={total}
        top={layout.tops[i]}
        left={layout.izquierdas[i]}
        ancho={layout.anchos[i]}
        alto={layout.altos[i]}
        escala={escala}
        cerca={i >= desde && i <= hasta}
        resaltados={porPagina.get(n) ?? NADA}
        senalada={senal.senaladas.has(n)}
        abierto={abierto?.pagina === n ? abierto.id : null}
        destello={destello && porPagina.get(n)?.some((r) => r.id === destello.id) ? destello : null}
        pdf={pdf}
        cola={cola}
        obtenerTexto={obtenerTexto}
        registrar={registrar}
        hallazgos={hallazgosPorPagina.get(n) ?? NADA}
        actual={actual?.pagina === n ? actual : null}
        fuente={marcaVigente?.pagina === n ? marcaVigente : null}
        onUbicar={ubicar}
        alMedir={entero ? null : medir}
        esperarDatos={esperarDatos}
        vuelta={red.vuelta}
      />,
    );
  }

  const globoVista = abierto && (
    <Globo
      key={`${abierto.id}-${globo.editando}`}
      resaltado={abierto}
      estilo={lugarGlobo}
      editando={globo.editando}
      onColor={(c) => cambiarColor(abierto, c)}
      onGuardar={(nota) => guardarNota(abierto, nota)}
      onDejar={(nota) => dejarNota(abierto.id, nota)}
      onEditar={() => setGlobo({ id: abierto.id, editando: true })}
      onBorrar={() => borrar(abierto)}
      onCerrar={() => {
        setGlobo(null);
        marco.current?.focus();
      }}
    />
  );

  return (
    <div
      ref={raiz}
      className="lector"
      data-pantalla={pantalla.modo ?? undefined}
      data-panel={conPanel ? (panelAlLado ? 'lado' : 'encima') : undefined}
      data-angosto={angosto || undefined}
      data-consultron={conConsultron ? (soloEnCaja ? 'caja' : consultronAlLado ? 'lado' : 'encima') : undefined}
      data-flotante={flotante || undefined}
      style={conPanel && panelAlLado ? { '--ancho-panel': `${anchoPanel}px` } : undefined}
    >
      <div ref={techoRef} className="lector__techo" onFocus={() => mostrarBarras(true)}>
      {cabeza}
      <div
        ref={barraRef}
        className="lector__barra"
        role="group"
        aria-label={`Herramientas de ${nombre}`}
        onFocus={alEnfocarHerramienta}
      >
        <button type="button" className="lector__boton" aria-pressed={conPanel} aria-keyshortcuts={atajo('Abrir o cerrar las notas y páginas', unaTecla)} onClick={() => alternarPanel()} title={notas ? 'Notas y páginas' : 'Páginas'}>
          <Trazo nombre="panel" /><span className="solo-lectores">{notas ? 'Notas y páginas' : 'Páginas'}</span>
          {notas && lectura.resaltados.length > 0 && <span className="lector__cuenta lector__cuenta--boton" aria-hidden="true">{lectura.resaltados.length}</span>}
        </button>
        <span className="lector__grupo" role="group" aria-label="Tamaño">
          {!angosto && <button type="button" className="lector__boton" aria-label="Achicar" aria-keyshortcuts={atajo('Achicar', unaTecla)} title="Achicar" onClick={() => zoomPaso(-1)}><Trazo nombre="menos" /></button>}
          <button type="button" className="lector__zoom" aria-pressed={zoom.modo !== 'libre' && escala === alAncho} aria-keyshortcuts={atajo('Ajustar al ancho', unaTecla)} title="Ajustar al ancho" onClick={ajustar}>
            <span className="solo-lectores">Ajustar al ancho, ahora al </span>{porcentaje(escala)} %
          </button>
          {!angosto && <button type="button" className="lector__boton" aria-label="Agrandar" aria-keyshortcuts={atajo('Agrandar', unaTecla)} title="Agrandar" onClick={() => zoomPaso(1)}><Trazo nombre="mas" /></button>}
        </span>
        <span className="lector__ir">
          <input
            ref={campoPagina}
            className="lector__ir-campo"
            inputMode="numeric"
            enterKeyHint="go"
            autoComplete="off"
            aria-label={`Página, de ${total}`}
            aria-keyshortcuts={atajo('Ir a una página', unaTecla)}
            size={Math.max(2, String(total).length)}
            value={valorPagina ?? String(pagina)}
            onFocus={(e) => {
              setValorPagina(String(pagina));
              e.target.select();
            }}
            onChange={(e) => setValorPagina(e.target.value.replace(/\D/g, '').slice(0, 6))}
            onBlur={() => setValorPagina(null)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const n = Number(valorPagina);
                if (n >= 1) irAPagina(Math.min(total, n));
                e.currentTarget.blur();
                marco.current?.focus();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                setValorPagina(null);
                e.currentTarget.blur();
              }
            }}
          />
          <span className="lector__ir-total" aria-hidden="true">de {total}</span>
        </span>
        {notas && <BotonSenalar senalada={senal.senalada} anuncio={senal.anuncio} atajo={atajo('Señalar esta página o sacarle el señalador', unaTecla)} onClick={() => senal.alternar()} />}
        {compartido?.barra}
        <span className="lector__grupo lector__grupo--fin">
          {hayConsultron && !soloEnCaja && (
            <button ref={botonConsultron} type="button" className="lector__boton lector__boton--consultron" aria-pressed={conConsultron} title="Consultron" onClick={() => (conConsultron ? cerrarConsultron() : ponerEnVisor(true))}>
              <IconoMenu nombre="consultron" /><span className="solo-lectores">Consultron</span>
            </button>
          )}
          <BotonVoz voz={voz} atajo={atajo(LEER_EN_VOZ, unaTecla)} />
          {!angosto && <BotonPantalla modo={pantalla.modo} onClick={pantalla.alternar} className="lector__boton" atajo={atajo('Entrar o salir de pantalla completa', unaTecla)} />}
          <button type="button" className="lector__boton" aria-pressed={busqueda.abierta} aria-keyshortcuts={atajo('Buscar en el documento', unaTecla)} title="Buscar en el documento" onClick={() => (busqueda.abierta ? cerrarBusqueda() : abrirBusqueda())}>
            <Trazo nombre="buscar" /><span className="solo-lectores">Buscar en el documento</span>
          </button>
          {!angosto && (
            <>
              <button type="button" className="lector__boton" aria-pressed={oscuro} aria-keyshortcuts={atajo('Pasar las páginas a oscuro o a claro', unaTecla)} title="Páginas oscuras" onClick={alternarOscuro}>
                <Trazo nombre="luna" /><span className="solo-lectores">Páginas oscuras</span>
              </button>
              <button type="button" className="lector__boton" title="Imprimir" onClick={empezarImpresion} aria-disabled={imprimiendo ? 'true' : undefined}>
                <Trazo nombre="imprimir" /><span className="solo-lectores">Imprimir</span>
              </button>
            </>
          )}
          {!tactil && !angosto && (
            <button ref={botonAyuda} type="button" className="lector__boton lector__boton--atajos" aria-pressed={ayuda} aria-keyshortcuts={atajo('Ver estos atajos', unaTecla)} title="Atajos del teclado" onClick={() => setAyuda((a) => !a)}>
              <Trazo nombre="teclado" /><span className="solo-lectores">Atajos del teclado</span>
            </button>
          )}
          {angosto && (
            <button ref={botonMas} type="button" className="lector__boton" aria-expanded={masAbierto} aria-controls={masAbierto ? 'lector-mas' : undefined} title="Más herramientas" onClick={() => setMas(!masAbierto)}>
              <Trazo nombre="puntos" /><span className="solo-lectores">Más herramientas</span>
            </button>
          )}
        </span>
      </div>

      {masAbierto && (
        <div id="lector-mas" className="lector__mas" role="group" aria-label="Más herramientas" onFocus={alEnfocarHerramienta}>
          <button type="button" className="lector__mas-opcion" aria-keyshortcuts={atajo('Achicar', unaTecla)} onClick={() => { zoomPaso(-1); cerrarMas(); }}><Trazo nombre="menos" /><span>Achicar</span></button>
          <button type="button" className="lector__mas-opcion" aria-keyshortcuts={atajo('Agrandar', unaTecla)} onClick={() => { zoomPaso(1); cerrarMas(); }}><Trazo nombre="mas" /><span>Agrandar</span></button>
          <BotonPantalla modo={pantalla.modo} onClick={() => { pantalla.alternar(); cerrarMas(); }} className="lector__mas-opcion" atajo={atajo('Entrar o salir de pantalla completa', unaTecla)} conNombre />
          <button type="button" className="lector__mas-opcion" aria-pressed={oscuro} aria-keyshortcuts={atajo('Pasar las páginas a oscuro o a claro', unaTecla)} onClick={() => { alternarOscuro(); cerrarMas(); }}><Trazo nombre="luna" /><span>Páginas oscuras</span></button>
          <button type="button" className="lector__mas-opcion" onClick={() => { empezarImpresion(); cerrarMas(); }} aria-disabled={imprimiendo ? 'true' : undefined}><Trazo nombre="imprimir" /><span>Imprimir</span></button>
          {!tactil && (
            <button ref={botonAyuda} type="button" className="lector__mas-opcion" aria-pressed={ayuda} aria-keyshortcuts={atajo('Ver estos atajos', unaTecla)} onClick={() => { setAyuda((a) => !a); cerrarMas(); }}><Trazo nombre="teclado" /><span>Atajos del teclado</span></button>
          )}
        </div>
      )}

      {busqueda.abierta && (
        <div className="lector__buscar" role="search">
          <label className="solo-lectores" htmlFor={`${id}-buscar`}>Buscar en el documento</label>
          <input
            ref={campoBuscar}
            id={`${id}-buscar`}
            className="lector__buscar-campo"
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            spellCheck="false"
            placeholder="Buscar en el documento"
            value={busqueda.consulta}
            onChange={(e) => escribirBusqueda(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                moverHallazgo(e.shiftKey ? -1 : 1);
              }
            }}
          />
          <span className="lector__buscar-cuenta" role="status">{cuenta}</span>
          <button type="button" className="lector__boton" aria-label="Resultado anterior" aria-keyshortcuts="Shift+Enter" disabled={!hallazgos.length} onClick={() => moverHallazgo(-1)}><Trazo nombre="arriba" /></button>
          <button type="button" className="lector__boton" aria-label="Resultado siguiente" aria-keyshortcuts="Enter" disabled={!hallazgos.length} onClick={() => moverHallazgo(1)}><Trazo nombre="abajo" /></button>
          <button type="button" className="lector__boton" aria-label="Cerrar la búsqueda" aria-keyshortcuts="Escape" onClick={cerrarBusqueda}><Trazo nombre="cerrar" /></button>
        </div>
      )}

      <BarraVoz voz={voz} atajo={atajo(LEER_EN_VOZ, unaTecla)} />

      {(aviso || imprimiendo) && (
        <div className={`lector__aviso${aviso ? ' lector__aviso--error' : ''}`} role={aviso ? 'alert' : 'status'}>
          <p>{aviso || `Preparando para imprimir, página ${imprimiendo.n} de ${imprimiendo.total}`}</p>
          {imprimiendo && <button type="button" className="boton boton--secundario boton--chico" onClick={() => impresion.current?.control?.abort()}>Cancelar</button>}
          {aviso && <button type="button" className="boton boton--secundario boton--chico" onClick={() => setAviso('')}>Entendido</button>}
        </div>
      )}
      </div>

      <div className="lector__cuerpo">
        {conPanel && (
          <Panel
            pdf={pdf}
            tamanos={tamanos}
            pagina={pagina}
            pestana={pestanas.includes(pestana) ? pestana : 'paginas'}
            onPestana={setPestana}
            pestanas={pestanas}
            indice={indice}
            resaltados={lectura.resaltados}
            senaladores={notas ? lectura.senaladores : null}
            onSacarSenalador={senal.sacar}
            onNombrarSenalador={senal.nombrar}
            obtenerTexto={obtenerTexto}
            onIrPagina={(n) => {
              irAPagina(n);
              if (!panelAlLado) setPanel(null);
            }}
            onIrDestino={irADestino}
            onIrResaltado={(r) => irAResaltado(r)}
            onEditar={(r) => irAResaltado(r, true)}
            onBorrar={(r) => borrar(r, true)}
            onCerrar={() => setPanel(null)}
          />
        )}
        {conPanel && panelAlLado && (
          <div
            className="lector__borde-panel"
            role="separator"
            aria-orientation="vertical"
            aria-label="Ancho del panel"
            aria-valuemin={PANEL_PDF.min}
            aria-valuemax={topePanel}
            aria-valuenow={anchoPanel}
            aria-valuetext={`${anchoPanel} píxeles`}
            tabIndex={0}
            title="Arrastrá para cambiar el ancho. Con doble clic vuelve al de siempre."
            data-arrastrando={arrastrePanel !== null || undefined}
            onPointerDown={empezarArrastrePanel}
            onKeyDown={teclaBordePanel}
            onDoubleClick={() => cambiarAjustes({ anchoPanelPdf: acotarPanel(PANEL_PDF.porDefecto) })}
          />
        )}
        <div
          ref={marco}
          className="lector__marco"
          tabIndex={0}
          role="region"
          aria-label={`Páginas de ${nombre}`}
          aria-keyshortcuts={vigentes(unaTecla).map(ariaDe).join(' ')}
          onScroll={alScrollear}
        >
          {/* A plain container: the pages, the student's marks and what floats over them scroll together. */}
          <div ref={contenido} className="lector__paginas" style={{ width: layout.ancho, height: layout.alto }} onClick={alTocarPaginas}>
            {paginas}
            {compartido?.capa?.(layout)}
            {barra && (
              <BarraSeleccion
                estilo={barra}
                ultimo={color}
                conTeclas={unaTecla}
                colorPropio={compartido?.color ?? null}
                alTocar={() => {
                  ultimo.current.enBarra = true;
                }}
                onColor={(c) => crear(seleccion, c)}
                onNota={() => crear(seleccion, color, true)}
                onProbar={seleccion.codigo && !compartido ? () => probar(seleccion) : undefined}
                onPreguntar={hayConsultron && seleccion.texto ? () => preguntarAConsultron(seleccion) : undefined}
              />
            )}
            {lugarGlobo && globoVista}
          </div>
        </div>
        {retomada && (
          <Flotante>
            <p>Abrimos en la página&nbsp;{retomada}, donde quedaste.</p>
            <button type="button" className="boton boton--secundario boton--chico" onClick={() => {
              irAPagina(1);
              setRetomada(null);
              marco.current?.focus({ preventScroll: true });
            }}>Ir al principio</button>
            <button type="button" className="lector__boton lector__flotante-cerrar" aria-label="Cerrar el aviso" onClick={() => {
              setRetomada(null);
              marco.current?.focus({ preventScroll: true });
            }}><Trazo nombre="cerrar" /></button>
          </Flotante>
        )}
        {borrado && (
          <Flotante key={borrado.vez} ms={DESHACER_MS} enfocar onVencer={() => setBorrado(null)}>
            <p id={`${id}-borrado`}>Borraste el resaltado de la página&nbsp;{borrado.r.pagina}.</p>
            <button type="button" className="boton boton--secundario boton--chico" aria-describedby={`${id}-borrado`} onClick={deshacer}>Deshacer</button>
          </Flotante>
        )}
        {marcaVigente && (
          <Flotante key={marcaVigente.clave}>
            <p>Marcamos lo que usó Consultron en la página&nbsp;{marcaVigente.pagina}.</p>
            <button type="button" className="boton boton--secundario boton--chico" onClick={quitarMarca}>Sacar la marca</button>
          </Flotante>
        )}
        {hayConsultron && soloEnCaja && !conConsultron && (
          <button ref={botonConsultron} type="button" className="flotante__boton" title="Consultron" onClick={() => ponerEnVisor(true)}>
            <IconoMenu nombre="consultron" />
            <span className="solo-lectores">Consultron</span>
          </button>
        )}
        {conConsultron && (
          <Suspense fallback={null}>
            <ConsultronEnVisor
              materia={Number.isSafeInteger(origen?.materia) ? String(origen.materia) : undefined}
              marcado={marcado}
              abierto={abiertoParaConsultron}
              enResumen={resumen ? true : 'archivo'}
              alLado={consultronAlLado && !soloEnCaja}
              caja={soloEnCaja}
              alSoltar={() => setMarcado(null)}
              alCerrar={cerrarConsultron}
              alIr={irDesdeConsultron}
            />
          </Suspense>
        )}
        {abierto && angosto && <div ref={hojaGlobo} className="lector__hoja-globo">{globoVista}</div>}
        {ayuda && (
          <div ref={cajaAyuda} className="lector__ayuda" role="dialog" aria-labelledby={`${id}-ayuda`}>
            <div className="lector__ayuda-cabeza">
              <h3 id={`${id}-ayuda`}>Atajos del teclado</h3>
              <button type="button" className="lector__boton" aria-label="Cerrar los atajos" onClick={() => setAyuda(false)}><Trazo nombre="cerrar" /></button>
            </div>
            <dl>
              {vigentes(unaTecla).map((a) => (
                <div key={ariaDe(a)}>
                  <dt><Teclas atajo={a} /></dt>
                  <dd>{a.texto}</dd>
                </div>
              ))}
            </dl>
            {!unaTecla && <p className="lector__ayuda-nota">Los de una tecla están apagados. Los prendés en Configuración.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
