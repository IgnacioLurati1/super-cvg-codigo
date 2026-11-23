import { lazy, Suspense, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useMaterias } from '../components/ElegirMateria';
import { useAdelantar } from '../lib/ahorro';
import Base from '../components/laboratorio/Base';
import Casos from '../components/laboratorio/Casos';
import Chapin from '../components/laboratorio/Chapin';
import Consola from '../components/laboratorio/Consola';
import Editor, { irALinea } from '../components/laboratorio/Editor';
import Explorador from '../components/laboratorio/Explorador';
import MedirTiempos from '../components/laboratorio/MedirTiempos';
import PasoAPaso from '../components/laboratorio/PasoAPaso';
import { cursorEn } from '../components/laboratorio/Plan';
import Separador from '../components/laboratorio/Separador';
import { useUI } from '../components/ui';
import { cambiarAjustes, LAB_ARCHIVOS, LAB_PANEL, useAjustes } from '../lib/ajustes';
import { guardarArchivo } from '../lib/archivos';
import { ideDelLab } from '../lib/consultron/ideDelLab';
import { usePantallaDeConsultron } from '../lib/consultron/pantalla';
import { derParaLeer } from '../lib/laboratorio/der/paraLeer';
import { olvidarLugar } from '../lib/consultron/propuestas';
import { peso } from '../lib/datos';
import { NOMBRES_DE_LENGUAJE } from '../lib/laboratorio/adivinar';
import { anotarCorrida, descartarEscrito, escritosListos, mudarEscritos, paraLaCorrida, seGuarda, sumarEscrito, useEscritos } from '../lib/laboratorio/escritos';
import { marcasDelIntento } from '../lib/laboratorio/enLinea';
import { explicarConsulta } from '../lib/laboratorio/explicar';
import {
  agregarAlProyecto,
  archivosDe,
  borrarArchivo,
  borrarProyecto,
  cambiarArchivo,
  cambiarProyecto,
  crearProyecto,
  guardarArchivoNuevo,
  guardarCasos,
  moverArchivo,
  nombreDeArchivo,
  nombreEnProyecto,
  nombreLibre,
  nombreSugerido,
  paraCorrer,
} from '../lib/laboratorio/guardado';
import { esLenguaje, IDS_DE_LENGUAJE, LENGUAJES, TOPE_SALIDA } from '../lib/laboratorio/lenguajes';
import { porQueNoEsta } from '../lib/laboratorio/modulos';
import { enCriollo } from '../lib/laboratorio/mensajes';
import { motorDe, useMotor } from '../lib/laboratorio/motor';
import { leerRecorrido, lineasDelPaso, TOPE_PASOS } from '../lib/laboratorio/pasos';
import { useRevision } from '../lib/laboratorio/revisar';
import { borradorEscrito, guardarMesa, mesaGuardada, tomarDelPdf } from '../lib/laboratorio/pendiente';
import { EXTENSIONES, MAX_CODIGO, MAX_PROYECTOS, nombreValido } from '../lib/laboratorio/saneo';
import { comoVolvio } from '../lib/laboratorio/tuBase';
import { leerSubido, leerZip, partirNombre, TOPE_ZIP, zipDeCarpetas, zipDeProyecto } from '../lib/laboratorio/zip';
import { esDemo } from '../lib/modoDemo';
import { hayUsuario, mioActual, useMio } from '../lib/mio';
import { esAgregada } from '../lib/propias';
import { tokenActual } from '../lib/sesion';
import { tituloDe, useSeo } from '../lib/seo';
import { derEnTexto, derVacio } from '../lib/laboratorio/der/modelo';
import './laboratorio.css';

// The DER sheet (React Flow) loads only when a `.der` opens.
const Der = lazy(() => import('../components/laboratorio/der/Der'));

// The lab, as a simple editor of the ones on a computer (docs/laboratorio-ide.md): the bar with what's open and how to
// run it on top, the student's files on the left, the tabs of the open files and the code in the middle, and under it a
// panel with the console and the rest. Python, SQL and C run here, in the browser (lib/laboratorio). The draft («Sin
// guardar») and what comes from a PDF stay only in the memory of the tab; what they save goes with the rest of what's
// theirs (mio.js), by course, as files on their own or projects of several files. What a program writes to its folder
// stays apart (escritos.js): in this browser for their files and projects, only in the tab for the draft.

const numero = new Intl.NumberFormat('es-AR');
// How long a run took: under a second, in milliseconds.
const cuanto = (ms) => (ms < 1000 ? `${numero.format(Math.max(1, Math.round(ms)))} ms` : `${new Intl.NumberFormat('es-AR', { maximumFractionDigits: ms < 10_000 ? 1 : 0 }).format(ms / 1000)} s`);
const GUARDAR_MS = 500;
// The engines that get the whole folder of a project (`archivos` and `principal`, motor.js). SQL runs the main file.
const VARIOS_ARCHIVOS = { c: true, python: true, javascript: true };
// Under this width (in rem, so it follows the letter size) the files go in a drawer and the panel goes under the code.
const ANGOSTA_REM = 48;
// What the code keeps at least, beside the files and over the panel.
const MIN_CODIGO = { ancho: 320, alto: 140 };

const mesaNueva = (lenguaje = 'python', vez = 0) => ({ codigo: LENGUAJES[lenguaje].ejemplo, lenguaje, materia: null, origen: null, nombre: '', tocada: false, vez });

// What the lab opens with: what came from a PDF, the draft of before, or a new one.
function inicio() {
  const pdf = tomarDelPdf();
  const antes = mesaGuardada();
  if (pdf) {
    const corre = esLenguaje(pdf.adivinado);
    const mesa = {
      ...mesaNueva(corre ? pdf.adivinado : 'python', (antes?.mesa.vez ?? 0) + 1),
      codigo: pdf.codigo,
      materia: pdf.materia ?? null,
      origen: { apunte: pdf.apunte, pagina: pdf.pagina, otro: corre ? null : pdf.adivinado },
      tocada: true,
    };
    // Kept already as the draft: a second call (React checks the start twice in development) finds it there.
    const lugar = { mesa, abierto: null, escrito: null, pestanas: [] };
    guardarMesa(lugar);
    return lugar;
  }
  return antes ? { escrito: null, pestanas: [], ...antes } : { mesa: mesaNueva(), abierto: null, escrito: null, pestanas: [] };
}

const DIBUJOS = {
  correr: 'M7 5v14l12-7z',
  parar: 'M6 6h12v12H6z',
  pasos: 'M5 5h3v14H5zM10 5v14l10-7z',
};
const Dibujo = ({ nombre }) => <svg className="laboratorio__dibujo" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d={DIBUJOS[nombre]} /></svg>;
// The drawings drawn with a line: the files' column, a cross, a chevron.
const TRAZOS = {
  archivos: 'M4 5h16v14H4zM9 5v14',
  cerrar: 'M7 7l10 10M17 7 7 17',
  arriba: 'm6 15 6-6 6 6',
  abajo: 'm6 9 6 6 6-6',
};
const Trazo = ({ nombre }) => <svg className="lab-trazo" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d={TRAZOS[nombre]} /></svg>;

// The editor's mode for a file: its language's, C for a header, none for data.
const MODO_DE_EXT = { c: 'c', h: 'c', py: 'python', sql: 'sql', js: 'javascript' };
const modoDe = (nombre) => MODO_DE_EXT[/\.(\w+)$/.exec(nombre)?.[1]?.toLowerCase()] ?? 'texto';

// What the console shows, as text, for Consultron open over it (consultron/pantalla.js).
function consolaEnTexto(piezas) {
  return piezas
    .map((p) => {
      if (p.tipo === 'salida' || p.tipo === 'aviso') return String(p.texto ?? '');
      if (p.tipo === 'error') return `Error${p.linea > 0 ? ` en la línea ${p.linea}` : ''}: ${p.texto}`;
      if (p.tipo === 'tabla') return [p.columnas.join(' | '), ...(Array.isArray(p.filas) ? p.filas : []).slice(0, 30).map((f) => (Array.isArray(f) ? f : Object.values(f ?? {})).map((c) => (c === null ? 'NULL' : String(c))).join(' | '))].join('\n');
      if (p.tipo === 'cambios') return `Cambió ${p.cambios} filas.`;
      if (p.tipo === 'imagen') return 'Un gráfico de matplotlib.';
      return '';
    })
    .filter((t) => t.trim())
    .join('\n');
}

/** The file of a project that runs: the one chosen, or the first of its language (as paraCorrer). */
function principalDe(mio, p) {
  if (!p) return null;
  const suyos = archivosDe(mio, p.id);
  return suyos.find((a) => a.id === p.principal) ?? suyos.find((a) => (a.ext ?? LENGUAJES[a.lenguaje].extension) === LENGUAJES[p.lenguaje].extension) ?? null;
}

/** Tabs (WAI-ARIA): the arrows go from one to the next, Home and End to the ends. */
// What saves the student's files (guardado.js). The table of a live session brings its own, over what it shares.
const OPS_PROPIAS = { cambiarArchivo, borrarArchivo, agregarAlProyecto, cambiarProyecto, guardarCasos, crearProyecto, borrarProyecto };

// Whether the lab is in sight: the table of a live session keeps its hidden tabs mounted.
const aLaVista = (el) => Boolean(el) && (el.checkVisibility ? el.checkVisibility() : el.offsetParent !== null);

function Pestanas({ etiqueta, lista, actual, alElegir, idDe, children }) {
  const tecla = (e) => {
    const i = lista.findIndex((p) => p.id === actual);
    const destino = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: lista.length - 1 }[e.key];
    if (destino === undefined) return;
    e.preventDefault();
    const p = lista[(destino + lista.length) % lista.length];
    alElegir(p.id);
    document.getElementById(idDe(p.id, 'pestana'))?.focus();
  };
  return (
    <div className="lab-panel__cabeza">
      <div role="tablist" aria-label={etiqueta} className="lab-panel__pestanas" onKeyDown={tecla}>
        {lista.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            id={idDe(p.id, 'pestana')}
            aria-controls={idDe(p.id, 'panel')}
            aria-selected={p.id === actual}
            tabIndex={p.id === actual ? 0 : -1}
            className="lab-panel__pestana"
            onClick={() => alElegir(p.id)}
          >
            {p.nombre}
            {p.nuevas > 0 && (
              <>
                <span className="lab-panel__nuevas" aria-hidden="true">{p.nuevas > 9 ? '9+' : p.nuevas}</span>
                <span className="solo-lectores">{`, ${p.nuevas} ${p.nuevas === 1 ? 'nueva' : 'nuevas'}`}</span>
              </>
            )}
          </button>
        ))}
      </div>
      {children}
    </div>
  );
}

export default function Laboratorio() {
  useSeo({ titulo: tituloDe('Laboratorio'), noindex: true });
  return <IDE />;
}

/**
 * The lab itself. `vivo`: the table of a live session (components/enVivo/herramientas/Laboratorio.jsx), whose project
 * takes the place of the student's files: { lab (read as mio.js, comoMio), actual(), ops (as OPS_PROPIAS),
 * extensiones(texto) (the editor's, shared), topeProyectos, guia (the file of whoever is followed), alAbrir(id),
 * enLaBarra({ piezas, final, corriendo, verMesa }), panel ({ nombre, contenido, nuevas, alVer } or null: `nuevas` on its
 * tab, `alVer()` while it is in sight), der(id) (a `.der`'s sheet shared:
 * what `Der` takes as `compartido`, or null while it is still text) }.
 */
export function IDE({ vivo = null }) {
  const { confirmar, avisar } = useUI();
  const id = useId();
  const delAlumno = useMio();
  const enVivo = Boolean(vivo);
  const mio = vivo ? vivo.lab : delAlumno;
  const actual = () => (vivo ? vivo.actual() : mioActual());
  const ops = vivo ? vivo.ops : OPS_PROPIAS;
  const archivos = mio.laboratorio;
  const proyectos = mio.proyectosLab;
  const propias = useMemo(() => delAlumno.propias.filter((p) => !esAgregada(p)), [delAlumno.propias]);
  const materias = useMaterias(propias);
  const ajustes = useAjustes();

  const [{ mesa, abierto: elegido, escrito: escritoElegido, pestanas }, setLugar] = useState(() =>
    vivo ? { mesa: mesaNueva(), abierto: vivo.lab.proyectosLab[0]?.principal ?? vivo.lab.laboratorio[0]?.id ?? null, escrito: null, pestanas: [] } : inicio(),
  );
  // A file deleted on another device or tab leaves the draft in view.
  const archivo = elegido ? archivos.find((a) => a.id === elegido) ?? null : null;
  const abierto = archivo ? elegido : null;
  const proyectoObj = archivo?.proyecto ? proyectos.find((p) => p.id === archivo.proyecto) ?? null : null;
  const proyecto = proyectoObj?.id ?? null;
  // Where it runs: the project, the file on its own or the draft. What the programs wrote there (escritos.js). In a
  // live session, apart from the student's own: those stay only in the tab.
  const lugarDe = (id) => (vivo ? `vivo-${id}` : id);
  const donde = lugarDe(proyecto ?? abierto) ?? `mesa-${mesa.vez}`;
  const escritos = useEscritos(donde);
  const queda = seGuarda(donde) ? 'Queda en este navegador' : 'Queda en esta pestaña';
  const escrito = escritoElegido ? escritos.find((e) => e.nombre === escritoElegido) ?? null : null;
  const lenguaje = proyectoObj ? proyectoObj.lenguaje : archivo ? archivo.lenguaje : mesa.lenguaje;
  const motor = useMotor(lenguaje);
  const nombreLenguaje = LENGUAJES[lenguaje].nombre;
  const principal = proyectoObj ? principalDe(mio, proyectoObj) : null;

  // What the editor has now (the editor itself reads it only when it opens a file).
  const [codigo, setCodigo] = useState(archivo ? archivo.codigo : mesa.codigo);
  const [nombre, setNombre] = useState(archivo ? archivo.nombre : mesa.nombre);
  // The name of the open file as the engine sees it: the one its errors name.
  const nombreMotor = proyectoObj ? nombreEnProyecto(archivo) : nombreDeArchivo(archivo?.nombre ?? nombre, lenguaje);
  const guardando = useRef(null);
  const raiz = useRef(null);
  const trabajo = useRef(null);
  const consola = useRef(null);
  const cajon = useRef(null);
  const subirZip = useRef(null);
  const subirUno = useRef(null);
  const subirA = useRef(null);

  const [piezas, setPiezas] = useState([]);
  const [pide, setPide] = useState(null);
  const [error, setError] = useState(null);
  const [final, setFinal] = useState('');
  const [entradaPrevia, setEntradaPrevia] = useState('');
  // Each run that wrote files: what's open of them mounts again with what's new.
  const [corridas, setCorridas] = useState(0);
  // «Paso a paso» of Python: the run recorded ({ datos, textos, principal }, until the code changes) and the step in view.
  const [recorrido, setRecorrido] = useState(null);
  const [pasoActual, setPasoActual] = useState(0);
  const botonPasos = useRef(null);
  const corriendo = motor.fase === 'corriendo' || motor.fase === 'esperando';
  // While the student types, the engine checks the open file without running it (revisar.js): C and JavaScript with
  // the rest of the project, which their errors may depend on.
  const revision = useRevision({
    lenguaje,
    nombre: nombreMotor,
    codigo,
    activo: ajustes.labRevisar && ajustes.labErrores && !escrito && (archivo?.ext ? MODO_DE_EXT[archivo.ext] : lenguaje) === lenguaje,
    armar: () => {
      const p = proyectoObj && lenguaje !== 'python' ? paraCorrer(actual(), proyectoObj.id) : null;
      if (!p) return { codigo, nombre: nombreMotor };
      return { codigo, nombre: nombreMotor, principal: p.principal, archivos: p.archivos.map((a) => (a.nombre === nombreMotor ? { ...a, contenido: codigo } : a)) };
    },
  });

  // The panel under the code and its tabs.
  const leePrevia = Boolean(LENGUAJES[lenguaje].lee && !motor.pausa);
  const PESTANAS = [
    { id: 'consola', nombre: 'Consola' },
    lenguaje !== 'sql' && { id: 'casos', nombre: 'Casos' },
    leePrevia && { id: 'previa', nombre: 'Lo que va a leer' },
    lenguaje === 'python' && { id: 'medir', nombre: 'Medir tiempos' },
    lenguaje === 'python' && { id: 'chapin', nombre: 'Chapin' },
    lenguaje === 'sql' && { id: 'base', nombre: 'Base' },
    vivo?.panel && { id: 'mesa', nombre: vivo.panel.nombre, nuevas: vivo.panel.nuevas },
  ].filter(Boolean);
  const [pestanaElegida, setPestana] = useState('consola');
  const pestana = PESTANAS.some((p) => p.id === pestanaElegida) ? pestanaElegida : 'consola';
  // Measuring the whole program, the first round asks with input() in the console: the panel goes there, and back to
  // «Medir tiempos» when the run ends.
  const [volverAMedir, setVolverAMedir] = useState(false);
  if (pide && pestana === 'medir') {
    setVolverAMedir(true);
    setPestana('consola');
  }
  if (volverAMedir && !corriendo) {
    setVolverAMedir(false);
    setPestana('medir');
  }
  const idDe = (p, que) => `${id}-${que}-${p}`;

  // The sizes, on this device (ajustes.js), with the one being dragged in between.
  const [arrastre, setArrastre] = useState({});
  const [caja, setCaja] = useState({ ancho: 0, alto: 0, rem: 16 });
  useLayoutEffect(() => {
    const el = raiz.current;
    if (!el) return undefined;
    const medir = () => {
      const cuerpo = el.querySelector('.lab-cuerpo');
      setCaja({ ancho: el.clientWidth, alto: cuerpo?.clientHeight ?? 0, rem: parseFloat(getComputedStyle(document.documentElement).fontSize) || 16 });
    };
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  const angosta = caja.ancho > 0 && caja.ancho < ANGOSTA_REM * caja.rem;
  const topeArchivos = Math.max(LAB_ARCHIVOS.min, Math.min(LAB_ARCHIVOS.max, caja.ancho - MIN_CODIGO.ancho));
  const topePanel = Math.max(LAB_PANEL.min, Math.min(LAB_PANEL.max, caja.alto - MIN_CODIGO.alto - 40));
  const anchoArchivos = Math.min(topeArchivos, arrastre.archivos ?? ajustes.labArchivos);
  const altoPanel = Math.min(topePanel, arrastre.panel ?? ajustes.labPanel);
  const sinArchivos = ajustes.labSinArchivos;
  const sinPanel = ajustes.labSinPanel;
  // The table's tab in sight: what it has is seen.
  const enVistaLaMesa = pestana === 'mesa' && !sinPanel;
  const verLaMesa = vivo?.panel?.alVer;
  useEffect(() => {
    if (enVistaLaMesa) verLaMesa?.();
  });

  // Consultron, open over the lab, reads every file of the project (consultron/pantalla.js); a DER, in words.
  const delProyecto = proyectoObj
    ? archivosDe(mio, proyecto).map((a) => [`Archivo ${nombreEnProyecto(a)}${a.id === principal?.id ? ', el que corre' : ''}`, a.ext === 'der' ? derParaLeer(a.id === abierto ? codigo : a.codigo) : a.id === abierto ? codigo : a.codigo])
    : [['Código', codigo]];
  usePantallaDeConsultron({
    titulo: 'Laboratorio',
    datos: [
      ['Lenguaje', nombreLenguaje],
      ['Proyecto', proyectoObj?.nombre ?? ''],
      ['Archivo abierto', escrito ? escrito.nombre : archivo ? nombreMotor : ''],
      ...delProyecto,
      ...escritos.filter((e) => e.texto !== null).map((e) => [`Lo que escribió el programa en ${e.nombre}`, e.texto]),
      ['Lo que va a leer el programa', entradaPrevia],
    ],
    resultado: [['Lo que salió en la consola', consolaEnTexto(piezas)]],
    notas: final,
    // Consultron in «Código» reads, changes and runs these files (consultron/ideDelLab.js).
    ide: enVivo ? undefined : () => ideDelLab({ lenguaje, proyecto: proyectoObj, archivo, abierto, casos: (proyectoObj ?? (archivo && !archivo.proyecto ? archivo : null))?.casos, escrito, codigo, nombreMotor, donde, entrada: entradaPrevia, consola: consolaEnTexto(piezas), final, editor: () => trabajo.current, alCambiarCodigo: (t) => alCambiarCodigo(t), abrir: (a) => abrir(a), abrirOtro: (a, p) => abrirOtro(a, p) }),
  });

  // Which run the console shows. Opening another place stops what was running, and what it still says doesn't reach the
  // new one.
  const vigente = useRef(0);
  const soltar = () => {
    vigente.current += 1;
    const m = motorDe(lenguaje);
    if (m.corrida) m.cortar('parado');
  };
  // Leaving the lab stops what runs: nobody is there to answer input().
  useEffect(() => () => IDS_DE_LENGUAJE.forEach((l) => motorDe(l).corrida && motorDe(l).cortar('parado')), []);

  // The draft and what is open stay for the next time, in the memory of the tab.
  useEffect(() => {
    if (!enVivo) guardarMesa({ mesa, abierto, escrito: null, pestanas });
  }, [enVivo, mesa, abierto, pestanas]);

  // Each language loads its engine when it's in view, unless saving data (ahorro.js): then, when it runs.
  useAdelantar(() => {
    motorDe(lenguaje).encender();
  }, true, lenguaje);
  useEffect(() => {
    const ids = IDS_DE_LENGUAJE;
    ids.forEach((l) => motorDe(l).usar(true));
    return () => ids.forEach((l) => motorDe(l).usar(false));
  }, []);

  // The sample mode starts with a few files and a project of the sample courses, once the student is known.
  const sembrado = useRef(false);
  useEffect(() => {
    if (enVivo || sembrado.current || !import.meta.env.DEV || !esDemo(tokenActual()) || !hayUsuario()) return;
    sembrado.current = true;
    import('../lib/laboratorio/demo').then(({ ARCHIVOS_DEMO, PROYECTOS_DEMO }) => {
      if (mioActual().laboratorio.length) return;
      ARCHIVOS_DEMO.forEach((a, i) => guardarArchivoNuevo(a, Date.now() - (ARCHIVOS_DEMO.length - i) * 1000));
      for (const p of PROYECTOS_DEMO) {
        const q = crearProyecto(p);
        if (q) p.archivos.forEach((a) => agregarAlProyecto(q, a));
      }
    });
  }, [archivos, enVivo]);

  // A draft written by the student isn't lost by closing the tab without a word.
  useEffect(() => {
    if (enVivo || !mesa.tocada || abierto) return undefined;
    const avisarAntes = (e) => e.preventDefault();
    window.addEventListener('beforeunload', avisarAntes);
    return () => window.removeEventListener('beforeunload', avisarAntes);
  }, [enVivo, mesa.tocada, abierto]);

  const guardarYa = useCallback(() => {
    const p = guardando.current;
    if (!p) return;
    clearTimeout(p.reloj);
    guardando.current = null;
    if (!ops.cambiarArchivo(p.id, p.cambios)) avisar('No se pudo guardar. Puede que el código sea muy largo o que el navegador no tenga más lugar.', 'error');
  }, [avisar, ops]);

  const guardarLuego = (cual, cambios) => {
    if (guardando.current && guardando.current.id !== cual) guardarYa();
    const antes = guardando.current;
    clearTimeout(antes?.reloj);
    guardando.current = { id: cual, cambios: { ...antes?.cambios, ...cambios }, reloj: setTimeout(guardarYa, GUARDAR_MS) };
  };
  useEffect(() => guardarYa, [guardarYa, abierto]);

  const limpiarSalida = () => {
    setPiezas([]);
    setPide(null);
    setError(null);
    setFinal('');
    setRecorrido(null);
  };

  // A line to go to once the file it's in opens (an error in another file of the project).
  const irLuego = useRef(null);

  /** Opens a saved file (`cual`, its id) or the draft (null), or what a program wrote (`escrito`, by its name) in the
   * place of `cual`. Another place stops what runs and clears the console. */
  const abrir = (cual, { escrito: verEscrito = null, cerrada = null } = {}) => {
    if (cual === abierto && verEscrito === (escrito?.nombre ?? null)) return;
    const a = cual ? actual().laboratorio.find((x) => x.id === cual) : null;
    const otroLugar = (a ? a.proyecto ?? a.id : `mesa-${mesa.vez}`) !== donde;
    guardarYa();
    if (otroLugar) {
      soltar();
      limpiarSalida();
    }
    if (cual !== abierto) {
      setCodigo(a ? a.codigo : mesa.codigo);
      setNombre(a ? a.nombre : mesa.nombre);
    }
    // Each file opened gets its tab, and the others stay. What a program wrote is of its place: it goes with it.
    const pestanaNueva = verEscrito ? `e:${verEscrito}` : a ? `a:${a.id}` : 'mesa';
    setLugar((l) => {
      const antes = l.escrito ? `e:${l.escrito}` : l.abierto ? `a:${l.abierto}` : 'mesa';
      // `cerrada`: the tab just closed, which doesn't come back.
      const quedan = [...l.pestanas, ...(l.pestanas.includes(antes) ? [] : [antes])].filter((t) => t !== cerrada && !(otroLugar && t.startsWith('e:')));
      return { ...l, abierto: a ? a.id : null, escrito: verEscrito, pestanas: quedan.includes(pestanaNueva) ? quedan : [...quedan, pestanaNueva] };
    });
    if (cajon.current?.open) cajon.current.close();
  };

  const abrirEscrito = (nombreEscrito, cual = abierto) => abrir(cual, { escrito: nombreEscrito });

  // «Nuevo» out of a project: a file of its own, saved with the course of where the student is. What was open stays
  // in its tab, the draft too.
  const nuevoSuelto = ({ nombre: n, lenguaje: l }) => {
    if (!nombreValido(n)) return 'Poné un nombre.';
    if (!esLenguaje(l)) return 'Elegí un lenguaje.';
    const materia = proyectoObj?.materia ?? archivo?.materia ?? mesa.materia ?? null;
    const nuevo = guardarArchivoNuevo({ nombre: n, lenguaje: l, codigo: LENGUAJES[l].ejemplo, materia });
    if (!nuevo) return 'No entra. Puede que tengas muchos archivos. Borrá alguno y probá de nuevo.';
    abrir(nuevo);
    return { fila: nuevo };
  };

  const alCambiarCodigo = (texto) => {
    setCodigo(texto);
    setRecorrido(null);
    if (archivo) guardarLuego(archivo.id, { codigo: texto });
    else setLugar((l) => ({ ...l, mesa: { ...l.mesa, codigo: texto, tocada: true } }));
  };
  // What the editor changes. At a live table the editor writes the shared text itself (with what the others write):
  // here it's only read.
  const alEditar = (texto) => {
    if (!vivo) return alCambiarCodigo(texto);
    setCodigo(texto);
    setRecorrido(null);
    return undefined;
  };

  const elegirLenguaje = (nuevo) => {
    if (nuevo === lenguaje || corriendo) return;
    if (proyectoObj) return;
    limpiarSalida();
    if (archivo) {
      guardarYa();
      ops.cambiarArchivo(archivo.id, { lenguaje: nuevo });
      return;
    }
    // An example the student didn't touch becomes the other language's.
    const deEjemplo = mesa.codigo === LENGUAJES[mesa.lenguaje].ejemplo || !mesa.codigo.trim();
    const codigoNuevo = deEjemplo ? LENGUAJES[nuevo].ejemplo : mesa.codigo;
    setCodigo(codigoNuevo);
    setLugar((l) => ({ ...l, mesa: { ...l.mesa, lenguaje: nuevo, codigo: codigoNuevo, vez: deEjemplo ? l.mesa.vez + 1 : l.mesa.vez, origen: l.mesa.origen ? { ...l.mesa.origen, otro: null } : null } }));
  };

  const cambiarNombre = (texto) => {
    setNombre(texto);
    if (archivo && texto.trim()) guardarLuego(archivo.id, { nombre: texto });
    else if (!archivo) setLugar((l) => ({ ...l, mesa: { ...l.mesa, nombre: texto } }));
  };

  const elegirMateria = (materia) => {
    guardarYa();
    if (proyectoObj) {
      if (!ops.cambiarProyecto(proyectoObj.id, { materia })) avisar('No se pudo guardar.', 'error');
    } else if (archivo) {
      if (!ops.cambiarArchivo(archivo.id, { materia })) avisar('No se pudo guardar.', 'error');
      // The draft taken to a course is saved there: choosing it is saying where it goes.
    } else if (materia != null) guardar(materia);
    else setLugar((l) => ({ ...l, mesa: { ...l.mesa, materia } }));
  };

  const guardar = (materia = mesa.materia) => {
    const nombreFinal = nombre.trim() || nombreSugerido(codigo, lenguaje, archivos);
    const nuevo = guardarArchivoNuevo({ nombre: nombreFinal, lenguaje, codigo, materia });
    if (!nuevo) {
      avisar('No entra. Puede que tengas muchos archivos o que el código sea muy largo. Borrá alguno y probá de nuevo.', 'error');
      return;
    }
    // Saved as theirs: the draft starts again, and what came from the PDF is now only in their file.
    mudarEscritos(`mesa-${mesa.vez}`, lugarDe(nuevo));
    setNombre(nombreFinal);
    setLugar((l) => ({ mesa: mesaNueva(lenguaje, mesa.vez + 1), abierto: nuevo, escrito: null, pestanas: [...l.pestanas.filter((t) => t !== 'mesa' && !t.startsWith('e:')), `a:${nuevo}`] }));
    avisar(`Guardaste «${nombreFinal}».`);
  };

  const bajarTexto = (texto, nombreArchivo) => guardarArchivo(new Blob([texto], { type: 'text/plain;charset=utf-8' }), nombreArchivo);

  // The files of a project as they are now: the open one with what the editor has, and what the programs left in it.
  const carpetaDe = (p) => {
    guardarYa();
    const suyos = archivosDe(actual(), p.id).map((a) => ({ nombre: nombreEnProyecto(a), contenido: a.id === abierto ? codigo : a.codigo }));
    return paraLaCorrida(suyos, p.id);
  };

  const carpetaDeProyecto = (p) => nombreDeArchivo(p.nombre, p.lenguaje).replace(/\.\w+$/, '');
  const bajarProyecto = (p) => {
    const carpeta = carpetaDeProyecto(p);
    guardarArchivo(new Blob([zipDeProyecto(carpeta, carpetaDe(p), p.casos)], { type: 'application/zip' }), `${carpeta}.zip`);
  };
  // In a live session the bar's zip is the whole shared folder: every project, each in its own folder.
  const bajarTodo = () => {
    const proyectos = actual().proyectosLab.map((p) => ({ carpeta: carpetaDeProyecto(p), archivos: carpetaDe(p), casos: p.casos }));
    if (!proyectos.length) return;
    guardarArchivo(new Blob([zipDeCarpetas(proyectos)], { type: 'application/zip' }), 'Carpeta compartida.zip');
  };

  const bajar = () => {
    if (proyectoObj) bajarProyecto(proyectoObj);
    else bajarTexto(codigo, nombreDeArchivo(archivo?.nombre ?? nombre, lenguaje));
  };

  // After the file in view is gone: another of its project, or the draft.
  const abrirOtro = (menos, deProyecto = null) => {
    const m = actual();
    const q = deProyecto ? m.proyectosLab.find((p) => p.id === deProyecto) : null;
    const otro = q ? principalDe(m, q) ?? archivosDe(m, q.id).find((a) => a.id !== menos) : null;
    setCodigo(otro ? otro.codigo : mesa.codigo);
    setNombre(otro ? otro.nombre : mesa.nombre);
    setLugar((l) => ({ ...l, abierto: otro ? otro.id : null, escrito: null, pestanas: l.pestanas.filter((t) => t !== `a:${menos}` && (otro || !t.startsWith('e:'))) }));
  };

  const borrarUno = async (a) => {
    const n = a.proyecto ? nombreEnProyecto(a) : a.nombre;
    if (vivo && actual().laboratorio.length <= 1) {
      avisar('Tiene que quedar al menos un archivo.', 'error');
      return;
    }
    if (!(await confirmar({ titulo: `¿Borrar «${n}»?`, texto: vivo ? 'Se borra para todos.' : 'Se borra de este navegador y, si guardás en tu Drive, también de ahí.', boton: 'Borrar', peligro: true }))) return;
    const enVista = a.id === abierto;
    if (enVista) {
      if (!a.proyecto) soltar();
      guardando.current = null;
      if (!a.proyecto) limpiarSalida();
    }
    ops.borrarArchivo(a.id);
    if (!a.proyecto) {
      descartarEscrito(lugarDe(a.id));
      olvidarLugar(lugarDe(a.id));
    }
    if (enVista) abrirOtro(a.id, a.proyecto ?? null);
    else setLugar((l) => ({ ...l, pestanas: l.pestanas.filter((t) => t !== `a:${a.id}`) }));
    avisar('Archivo borrado.');
  };

  const borrarElProyecto = async (p) => {
    const cuantos = archivosDe(actual(), p.id).length;
    if (vivo && proyectos.length <= 1) {
      avisar('Tiene que quedar al menos un proyecto.', 'error');
      return;
    }
    const suyos = cuantos === 1 ? 'su archivo' : `sus ${cuantos} archivos`;
    if (!(await confirmar({ titulo: `¿Borrar el proyecto «${p.nombre}»?`, texto: vivo ? `Se borra para todos, con ${suyos}.` : `Se ${cuantos === 1 ? 'borra su archivo' : `borran sus ${cuantos} archivos`} de este navegador y, si guardás en tu Drive, también de ahí.`, boton: 'Borrar', peligro: true }))) return;
    const enVista = p.id === proyecto;
    if (enVista) {
      soltar();
      guardando.current = null;
      limpiarSalida();
    }
    ops.borrarProyecto(p.id);
    descartarEscrito(lugarDe(p.id));
    olvidarLugar(lugarDe(p.id));
    if (enVista) abrirOtro(null);
    avisar('Proyecto borrado.');
  };

  const nuevoProyecto = ({ nombre: n, lenguaje: l }) => {
    if (!nombreValido(n)) return 'Poné un nombre.';
    if (!esLenguaje(l)) return 'Elegí un lenguaje.';
    if (proyectos.length >= (vivo?.topeProyectos ?? MAX_PROYECTOS)) return vivo ? 'La carpeta ya tiene muchos proyectos. Borrá alguno y probá de nuevo.' : 'Ya tenés muchos proyectos. Borrá alguno y probá de nuevo.';
    const materia = proyectoObj?.materia ?? archivo?.materia ?? mesa.materia ?? null;
    const q = ops.crearProyecto({ nombre: n, lenguaje: l, materia });
    const main = q && ops.agregarAlProyecto(q, { nombre: 'main', ext: LENGUAJES[l].extension, codigo: LENGUAJES[l].ejemplo });
    if (!q || !main) return 'No se pudo crear. Puede que el navegador no tenga más lugar.';
    abrir(main);
    // A success is the row to focus; a text is what went wrong.
    return { fila: q };
  };

  const nuevoArchivo = (p, { nombre: escrito, ext: elegida }) => {
    // «algo.py» written whole: the name is «algo» and the type, the one it says (if the project takes it).
    const conExt = /^(.+)\.([a-z0-9]+)$/i.exec(nombreValido(escrito));
    const suya = conExt && EXTENSIONES[p.lenguaje].includes(conExt[2].toLowerCase()) ? conExt[2].toLowerCase() : null;
    const n = suya ? conExt[1] : escrito;
    const ext = suya ?? elegida;
    if (!nombreValido(n)) return 'Poné un nombre.';
    if (!EXTENSIONES[p.lenguaje].includes(ext)) return 'Elegí qué tipo de archivo es.';
    const completo = nombreDeArchivo(n, p.lenguaje, ext);
    if (!nombreLibre(archivosDe(actual(), p.id), n, p.lenguaje, ext)) return `Ya hay un ${completo} en el proyecto.`;
    const guarda = completo.replace(/\W/g, '_').toUpperCase();
    const inicial = ext === 'h' ? `#ifndef ${guarda}\n#define ${guarda}\n\n\n\n#endif\n` : ext === 'der' ? derEnTexto(derVacio()) : '';
    const nuevo = ops.agregarAlProyecto(p.id, { nombre: n, ext, codigo: inicial });
    if (!nuevo) return 'No entra. Borrá algún archivo y probá de nuevo.';
    abrir(nuevo);
    return { fila: nuevo };
  };

  // «Crear SQL» of a DER: `<its name>.sql` in the same project, new or in place of the one there, as the file that
  // runs. It opens.
  const crearSqlDelDer = async (sql) => {
    if (!archivo || !proyectoObj) return;
    guardarYa();
    const completo = nombreDeArchivo(archivo.nombre, 'sql', 'sql');
    const existe = archivosDe(actual(), proyectoObj.id).find((a) => nombreEnProyecto(a) === completo);
    if (existe && existe.codigo !== sql && !(await confirmar({ titulo: `¿Reemplazar «${completo}»?`, texto: 'Se cambia por el SQL que sale del diagrama.', boton: 'Reemplazar' }))) return;
    const listo = existe ? (ops.cambiarArchivo(existe.id, { codigo: sql }) ? existe.id : null) : ops.agregarAlProyecto(proyectoObj.id, { nombre: archivo.nombre, ext: 'sql', codigo: sql });
    if (!listo) {
      avisar(sql.length > MAX_CODIGO ? 'El SQL es muy largo para un archivo del laboratorio.' : 'No entra. Borrá algún archivo y probá de nuevo.', 'error');
      return;
    }
    ops.cambiarProyecto(proyectoObj.id, { principal: listo });
    memoriaEditor.delete(listo);
    abrir(listo);
    avisar(existe ? `Reemplazaste ${completo}. Es el que corre.` : `Creaste ${completo}. Es el que corre.`);
  };

  const renombrarArchivo = (a, escrito) => {
    // «algo.py» on a .py: its own extension written again doesn't go into the name.
    const propia = a.ext ?? LENGUAJES[a.lenguaje]?.extension;
    const texto = propia && nombreValido(escrito).toLowerCase().endsWith(`.${propia}`) ? nombreValido(escrito).slice(0, -(propia.length + 1)) : escrito;
    if (!nombreValido(texto)) return 'Poné un nombre.';
    if (a.proyecto && !nombreLibre(archivosDe(actual(), a.proyecto), texto, a.lenguaje, a.ext ?? null, a.id)) return `Ya hay un ${nombreDeArchivo(texto, a.lenguaje, a.ext ?? null)} en el proyecto.`;
    if (guardando.current?.id === a.id) guardarYa();
    if (!ops.cambiarArchivo(a.id, { nombre: texto })) return 'No se pudo guardar.';
    if (a.id === abierto) setNombre(nombreValido(texto));
    return null;
  };

  const renombrarProyecto = (p, texto) => {
    if (!nombreValido(texto)) return 'Poné un nombre.';
    return ops.cambiarProyecto(p.id, { nombre: texto }) ? null : 'No se pudo guardar.';
  };

  const aProyecto = (a) => {
    guardarYa();
    const q = crearProyecto({ nombre: a.nombre }, a.id);
    if (!q) {
      avisar('No se pudo. Puede que tengas muchos proyectos o que el navegador no tenga más lugar.', 'error');
      return;
    }
    mudarEscritos(lugarDe(a.id), lugarDe(q));
    avisar(`«${a.nombre}» ahora es un proyecto. Sumale archivos desde sus opciones.`);
  };

  // A file to another project or out of the one it's in (dragged, or «Mover a»). Answers with the problem, or null.
  const mover = (a, destino) => {
    const n = a.proyecto ? nombreEnProyecto(a) : `${a.nombre}.${LENGUAJES[a.lenguaje].extension}`;
    const p = destino ? proyectos.find((x) => x.id === destino) : null;
    if (guardando.current?.id === a.id) guardarYa();
    const r = moverArchivo(a.id, destino);
    if (r === 'mismo') return null;
    if (r === 'ocupado') return p ? `Ya hay un ${n} en ${p.nombre}.` : `Ya hay un ${n} suelto en esa materia.`;
    if (r === 'lenguaje') return `${p?.nombre ?? 'Ese proyecto'} es de ${LENGUAJES[p?.lenguaje]?.nombre ?? 'otro lenguaje'}. Ahí no entra un archivo de ${LENGUAJES[a.lenguaje].nombre}.`;
    if (r === 'suelto') return `Un .${a.ext} va dentro de un proyecto.`;
    if (r) return 'No se pudo mover. Puede que el navegador no tenga más lugar.';
    // The file in view runs in another place now: what ran before stays with the old one.
    if (a.id === abierto) {
      soltar();
      limpiarSalida();
      setLugar((l) => ({ ...l, escrito: null, pestanas: l.pestanas.filter((t) => !t.startsWith('e:')) }));
    }
    avisar(p ? `Moviste ${n} a ${p.nombre}.` : `Sacaste ${n} del proyecto.`);
    return null;
  };

  // What a program wrote, into the project: a text file, by the name the program used, of its language.
  const puedeGuardarEscrito = (e) => {
    if (!e || e.texto === null || e.borrado || !archivo || e.texto.length > MAX_CODIGO) return false;
    const partes = partirNombre(e.nombre);
    return Boolean(partes && EXTENSIONES[lenguaje].includes(partes.ext) && nombreDeArchivo(partes.nombre, lenguaje, partes.ext) === e.nombre);
  };

  const guardarEscrito = (nombreEscrito) => {
    const e = escritos.find((x) => x.nombre === nombreEscrito);
    if (!puedeGuardarEscrito(e)) return;
    guardarYa();
    let q = proyecto;
    // A file on its own becomes a project to keep what its program wrote.
    if (!q) {
      q = crearProyecto({ nombre: archivo.nombre }, archivo.id);
      if (!q) {
        avisar('No se pudo guardar. Puede que tengas muchos proyectos o que el navegador no tenga más lugar.', 'error');
        return;
      }
      mudarEscritos(lugarDe(archivo.id), lugarDe(q));
    }
    const partes = partirNombre(e.nombre);
    const propio = archivosDe(actual(), q).find((a) => nombreEnProyecto(a) === e.nombre);
    const listo = propio ? (ops.cambiarArchivo(propio.id, { codigo: e.texto }) ? propio.id : null) : ops.agregarAlProyecto(q, { nombre: partes.nombre, ext: partes.ext, codigo: e.texto });
    if (!listo) {
      avisar('No entra. Borrá algún archivo y probá de nuevo.', 'error');
      return;
    }
    descartarEscrito(lugarDe(q), e.nombre);
    if (listo === abierto) setCodigo(e.texto);
    setLugar((l) => ({ ...l, abierto: listo, escrito: null, pestanas: [...l.pestanas.filter((t) => t !== `e:${e.nombre}` && t !== `a:${listo}`), `a:${listo}`] }));
    if (listo !== abierto) {
      setCodigo(e.texto);
      setNombre(propio?.nombre ?? partes.nombre);
    }
    avisar(`Guardaste «${e.nombre}» en el proyecto.`);
  };

  const soltarEscrito = (nombreEscrito) => {
    descartarEscrito(donde, nombreEscrito);
    setLugar((l) => ({ ...l, escrito: l.escrito === nombreEscrito ? null : l.escrito, pestanas: l.pestanas.filter((t) => t !== `e:${nombreEscrito}`) }));
  };

  const bajarEscrito = (nombreEscrito) => {
    const e = escritos.find((x) => x.nombre === nombreEscrito);
    if (e && !e.borrado) guardarArchivo(new Blob([e.bytes], { type: e.texto === null ? 'application/octet-stream' : 'text/plain;charset=utf-8' }), nombreEscrito.split('/').at(-1));
  };

  const borrarDelProyecto = (nombreEscrito) => {
    const a = archivosDe(actual(), proyecto).find((x) => nombreEnProyecto(x) === nombreEscrito);
    soltarEscrito(nombreEscrito);
    if (a) borrarUno(a);
  };

  // Bringing a zip: a new project with what it has of its language (zip.js).
  const PROBLEMAS_ZIP = {
    grande: 'El zip es muy grande. Probá con uno de menos de 8 MB.',
    roto: 'No es un zip, o está dañado.',
    vacio: 'El zip está vacío.',
    'sin-codigo': 'El zip no tiene archivos .c, .py ni .sql.',
  };
  const alSubirZip = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > TOPE_ZIP) return avisar(PROBLEMAS_ZIP.grande, 'error');
    const r = leerZip(new Uint8Array(await f.arrayBuffer()));
    if (r.problema) return avisar(PROBLEMAS_ZIP[r.problema], 'error');
    if (actual().proyectosLab.length >= (vivo?.topeProyectos ?? MAX_PROYECTOS)) return avisar(vivo ? 'La carpeta ya tiene muchos proyectos. Borrá alguno y probá de nuevo.' : 'Ya tenés muchos proyectos. Borrá alguno y probá de nuevo.', 'error');
    const n = nombreValido(f.name.replace(/\.zip$/i, '')) || 'Proyecto';
    const q = ops.crearProyecto({ nombre: n, lenguaje: r.lenguaje, materia: proyectoObj?.materia ?? archivo?.materia ?? mesa.materia ?? null });
    if (!q) return avisar('No se pudo crear. Puede que el navegador no tenga más lugar.', 'error');
    const afuera = [...r.afuera];
    let main = null;
    for (const a of r.archivos) {
      const nuevo = ops.agregarAlProyecto(q, a);
      if (!nuevo) afuera.push(`${a.nombre}.${a.ext}`);
      else if (a.nombre.toLowerCase() === 'main' && a.ext === LENGUAJES[r.lenguaje].extension) main = nuevo;
    }
    if (main) ops.cambiarProyecto(q, { principal: main });
    if (r.casos.length) ops.guardarCasos(q, r.casos);
    // In a session the folder is shared as text: a binary file would stay only in this browser.
    if (vivo) r.binarios.forEach((b) => afuera.push(nombreDeArchivo(b.nombre, r.lenguaje, b.ext)));
    const problemas = vivo ? [] : await Promise.all(r.binarios.map((b) => sumarEscrito(lugarDe(q), nombreDeArchivo(b.nombre, r.lenguaje, b.ext), b.bytes)));
    const m = actual();
    const abrirEste = principalDe(m, m.proyectosLab.find((p) => p.id === q)) ?? archivosDe(m, q)[0];
    if (abrirEste) abrir(abrirEste.id);
    const lista = afuera.map((x) => x.split('/').at(-1));
    const problema = problemas.find(Boolean);
    return avisar(`Subiste «${n}».${lista.length ? ` Quedó afuera ${new Intl.ListFormat('es').format(lista.slice(0, 4))}${lista.length > 4 ? ' y más' : ''}.` : ''}${problema ? ` ${problema}` : ''}`, problema ? 'error' : undefined);
  };

  const alSubirUno = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    const p = subirA.current && actual().proyectosLab.find((x) => x.id === subirA.current);
    if (!f || !p) return undefined;
    const r = leerSubido(f.name, new Uint8Array(await f.arrayBuffer()), p.lenguaje);
    if (r.problema) {
      const tipos = new Intl.ListFormat('es', { type: 'disjunction' }).format(EXTENSIONES[p.lenguaje].map((x) => `.${x}`));
      return avisar({ extension: `En un proyecto de ${LENGUAJES[p.lenguaje].nombre} van archivos ${tipos}.`, binario: 'No es un archivo de texto.', largo: 'Es muy largo para el laboratorio.' }[r.problema], 'error');
    }
    const nombreFinal = nombreDeArchivo(r.nombre, p.lenguaje, r.ext);
    if (r.bytes) {
      const lugar = lugarDe(p.id);
      const problema = await sumarEscrito(lugar, nombreFinal, r.bytes);
      if (problema) return avisar(problema, 'error');
      return avisar(`«${nombreFinal}» ${seGuarda(lugar) ? 'queda en este navegador' : 'queda en esta pestaña'} y entra a la próxima corrida.`);
    }
    const existe = archivosDe(actual(), p.id).find((a) => nombreEnProyecto(a) === nombreFinal);
    if (existe && !(await confirmar({ titulo: `¿Reemplazar «${nombreFinal}»?`, texto: 'Se cambia por el que subiste.', boton: 'Reemplazar' }))) return undefined;
    if (existe?.id === abierto) guardarYa();
    const listo = existe ? (ops.cambiarArchivo(existe.id, { codigo: r.codigo }) ? existe.id : null) : ops.agregarAlProyecto(p.id, r);
    if (!listo) return avisar('No entra. Borrá algún archivo y probá de nuevo.', 'error');
    if (listo === abierto) setCodigo(r.codigo);
    else abrir(listo);
    return avisar(`Subiste «${nombreFinal}».`);
  };

  // What arrives while it runs goes to the screen once per frame: a loop that prints fast doesn't freeze the page.
  const llegando = useRef([]);
  const cuadro = useRef(0);
  const volcar = useCallback(() => {
    cuadro.current = 0;
    const nuevas = llegando.current.splice(0);
    if (!nuevas.length) return;
    setPiezas((antes) => {
      const lista = [...antes];
      for (const p of nuevas) {
        const ultima = lista.at(-1);
        if (p.tipo === 'salida' && ultima?.tipo === 'salida' && ultima.flujo === p.flujo) lista[lista.length - 1] = { ...ultima, texto: ultima.texto + p.texto };
        else lista.push(p);
      }
      return lista;
    });
  }, []);
  const sumar = useCallback((p) => {
    llegando.current.push(p);
    if (!cuadro.current) cuadro.current = requestAnimationFrame(volcar);
  }, [volcar]);

  /** What a run gets: the main file's code and name and, for the engines that take it, the whole folder. */
  const armarCorrida = () => {
    guardarYa();
    if (proyectoObj) {
      const p = paraCorrer(actual(), proyectoObj.id);
      if (!p) return null;
      const propios = p.archivos.map((a) => (a.nombre === nombreMotor ? { ...a, contenido: codigo } : a));
      return { codigo: propios.find((a) => a.nombre === p.principal).contenido, nombre: p.principal, principal: p.principal, propios };
    }
    return { codigo, nombre: nombreMotor, principal: nombreMotor, propios: [{ nombre: nombreMotor, contenido: codigo }] };
  };

  // `como` (only from «Paso a paso», «Medir tiempos» and «Casos»): { modo, alOtro } of the run, or { captura, quieto }
  // of a test case (casos.js): its lines answer each read, and `quieto` leaves the panel where it is. Resolves with how
  // it ended.
  const correr = async (como) => {
    const m = motorDe(lenguaje);
    if (m.corrida) return undefined;
    const pedido = armarCorrida();
    if (!pedido) {
      avisar(`El proyecto no tiene ningún archivo .${LENGUAJES[lenguaje].extension} para correr.`, 'error');
      return undefined;
    }
    const vez = ++vigente.current;
    const lugarDeLaCorrida = donde;
    // What this browser kept of the folder, before it runs.
    await escritosListos();
    if (vez !== vigente.current || m.corrida) return undefined;
    limpiarSalida();
    llegando.current = [];
    // What it prints goes to the console: the panel opens on it, unless it's measuring.
    if (como?.modo?.tipo !== 'medir' && !como?.quieto) {
      setPestana('consola');
      if (sinPanel) cambiarAjustes({ labSinPanel: false });
    }
    const base = LENGUAJES[lenguaje];
    // SQL: how SQLite says what was written as in MySQL, under the error (dialecto.js).
    let pistas = [];
    const r = await m.correr(pedido.codigo, {
      nombre: pedido.nombre,
      ...(VARIOS_ARCHIVOS[lenguaje] ? { archivos: paraLaCorrida(pedido.propios, lugarDeLaCorrida), principal: pedido.principal } : {}),
      lineas: como?.captura ? como.captura.lineas : entradaPrevia ? entradaPrevia.split('\n') : [],
      modo: como?.modo ?? null,
      alEvento: (d) => {
        if (vez !== vigente.current) return;
        como?.captura?.mirar(d);
        if (d.tipo === 'salida') sumar({ tipo: 'salida', flujo: d.flujo === 'err' ? 'err' : 'out', texto: String(d.texto) });
        // system("cls") in C: what was printed before goes away (c.worker.js).
        else if (d.tipo === 'limpiar') {
          llegando.current = [];
          setPiezas([]);
        }
        else if (d.tipo === 'tabla') sumar({ tipo: 'tabla', columnas: d.columnas.map(String), filas: d.filas, recortada: Boolean(d.recortada), linea: Number(d.linea) || 1 });
        else if (d.tipo === 'cambios') sumar({ tipo: 'cambios', cambios: Number(d.cambios) || 0, linea: Number(d.linea) || 1 });
        else if (d.tipo === 'imagen' && d.png instanceof Uint8Array) sumar({ tipo: 'imagen', png: d.png });
        else if (d.tipo === 'dialecto' && Array.isArray(d.pistas)) {
          if (d.error) pistas = d.pistas.map(String);
          else sumar({ tipo: 'dialecto', pistas: d.pistas.map(String), linea: Number(d.linea) || 1 });
        }
        else if (d.tipo === 'sin-pausa') {
          if (!como?.captura) sumar({ tipo: 'aviso', tono: 'aviso', texto: 'Este navegador no deja frenar el programa para que escribas. Poné en «Lo que va a leer» una línea por cada pregunta y corré de nuevo.' });
        } else if (d.tipo === 'pide' && como?.captura) {
          // A test case: its next line, or the end of the input.
          const linea = como.captura.responder();
          if (linea !== null) sumar({ tipo: 'entrada', texto: linea });
          m.entrada(linea);
        } else if (d.tipo === 'pide') {
          volcar();
          setPide((p) => ({ pregunta: String(d.pregunta ?? ''), vez: (p?.vez ?? 0) + 1 }));
        } else como?.alOtro?.(d);
      },
    });
    if (!r || vez !== vigente.current) return undefined;
    cancelAnimationFrame(cuadro.current);
    volcar();
    setPide(null);
    // What it did to its folder stays for the next run, marked in the files.
    if (r.archivos) {
      anotarCorrida(lugarDeLaCorrida, pedido.propios, r.archivos).then((problema) => problema && avisar(problema, 'error'));
      setCorridas((n) => n + 1);
    }
    const conBase = lenguaje === 'sql' ? ` ${comoVolvio(m.leer().base)}` : '';
    if (r.falla) {
      sumar({ tipo: 'aviso', tono: 'error', texto: `No se pudo ${r.paquete ? `bajar ${r.paquete}` : `cargar ${base.nombre}`}. Revisá la conexión y probá de nuevo.` });
      setFinal('No se pudo correr.');
    } else if (r.cortado === 'parado') {
      sumar({ tipo: 'aviso', tono: 'aviso', texto: `Lo paraste.${conBase}` });
      setFinal('Lo paraste.');
    } else if (r.cortado === 'tiempo') {
      sumar({ tipo: 'aviso', tono: 'aviso', texto: `Pasaron ${base.topeSegundos} segundos y lo paramos. Si tiene un bucle, fijate que termine.${conBase}` });
      setFinal(`Lo paramos a los ${base.topeSegundos} segundos.`);
    } else if (r.cortado === 'salida') {
      sumar({ tipo: 'aviso', tono: 'aviso', texto: `Imprimió más de ${numero.format(TOPE_SALIDA)} caracteres y lo cortamos.${conBase}` });
      setFinal('Lo cortamos, imprimía demasiado.');
    } else if (r.error) {
      // Python: why a module it imported isn't here (modulos.js).
      const falta = lenguaje === 'python' ? porQueNoEsta(r.error, { proyecto: Boolean(proyectoObj) }) : '';
      if (falta) pistas = [falta];
      // The file where it broke, as the engine says it in a project; alone, it's the one that runs. Named when it isn't
      // the one in sight (one runs another file of the project, chosen in «Corre»).
      const enArchivo = proyectoObj ? r.archivo ?? pedido.principal : pedido.principal;
      const deOtro = proyectoObj && (enArchivo !== pedido.principal || enArchivo !== nombreMotor) ? ` de ${enArchivo}` : '';
      sumar({ tipo: 'error', texto: enCriollo(lenguaje, r.error), linea: r.linea, pistas, archivo: deOtro ? enArchivo : null });
      setError(r.linea > 0 ? { linea: r.linea, archivo: enArchivo } : null);
      setFinal(r.linea > 0 ? `Error en la línea ${r.linea}${deOtro}.` : 'Terminó con un error.');
    } else {
      setFinal(`Terminó en ${cuanto(r.ms)}.`);
    }
    return { ...r, pedido };
  };

  // «Paso a paso»: the program runs as always (input() asks in the console) recording each step, and then the steps
  // take the place of the console. A syntax error, or a run that ended before recording, stays in the console. In a
  // project it's the file that runs, which opens.
  const correrPasos = async () => {
    if (motorDe(lenguaje).corrida) return;
    if (principal && principal.id !== abierto) abrir(principal.id);
    let llegado = null;
    const alOtro = (d) => {
      if (d.tipo === 'pasos') llegado = d.pasos;
    };
    const r = await correr({ modo: { tipo: 'pasos', tope: TOPE_PASOS }, alOtro });
    const datos = r && llegado ? leerRecorrido(llegado) : null;
    if (!datos) return;
    setError(null);
    setPasoActual(0);
    // The lines of every file of the project: each step says in which one it is (pasos.js).
    const textos = Object.fromEntries(r.pedido.propios.filter((a) => typeof a.contenido === 'string').map((a) => [a.nombre, a.contenido.split('\n')]));
    setRecorrido({ datos, textos, principal: r.pedido.principal });
    const conError = datos.pasos.at(-1).e === 'fin' && Boolean(datos.pasos.at(-1).x);
    if (datos.tope) setFinal(`Lo paramos a los ${numero.format(TOPE_PASOS)} pasos.`);
    else setFinal(`Son ${numero.format(datos.pasos.length)} pasos.${conError ? ' El último es el error.' : ''}`);
  };

  // The file of a step: the one it names, or the one that runs.
  const archivoDelPaso = (i) => (recorrido ? lineasDelPaso(recorrido.datos, i).archivo ?? recorrido.principal : null);
  // Going to a step in another file of the project opens it.
  const irAlPaso = (i) => {
    setPasoActual(i);
    const en = archivoDelPaso(i);
    if (!proyectoObj || !en || en === nombreMotor) return;
    const a = archivosDe(actual(), proyectoObj.id).find((x) => nombreEnProyecto(x) === en);
    if (a) abrir(a.id);
  };

  const cerrarPasos = () => {
    setRecorrido(null);
    botonPasos.current?.focus();
  };

  const parar = () => motorDe(lenguaje).cortar('parado');

  // SQL: how SQLite solves the query where the cursor is, in words (explicar.js).
  const explicar = async () => {
    if (lenguaje !== 'sql' || motorDe('sql').corrida) return;
    const vez = ++vigente.current;
    guardarYa();
    limpiarSalida();
    llegando.current = [];
    setPestana('consola');
    if (sinPanel) cambiarAjustes({ labSinPanel: false });
    const r = await explicarConsulta(codigo, cursorEn(trabajo.current));
    if (!r || vez !== vigente.current) return;
    r.piezas.forEach(sumar);
    setError(r.error ? { ...r.error, archivo: nombreMotor } : null);
    setFinal(r.final);
  };

  const mandar = (texto) => {
    sumar({ tipo: 'entrada', texto });
    volcar();
    setPide(null);
    consola.current?.querySelector('.consola')?.focus({ preventScroll: true });
    motorDe(lenguaje).entrada(texto);
  };

  // To a line of the error: in another file of the project, it opens first.
  const irA = (linea) => {
    const destino = error?.archivo && error.archivo !== nombreMotor && proyectoObj ? archivosDe(actual(), proyectoObj.id).find((a) => nombreEnProyecto(a) === error.archivo) : null;
    if (destino) {
      irLuego.current = linea;
      abrir(destino.id);
    } else irALinea(trabajo.current, linea);
  };
  // What the autocomplete reads besides the open file: the others of the project and the tables of the database.
  const contextoEditor = () => ({
    archivos: proyectoObj ? archivosDe(actual(), proyectoObj.id).filter((a) => a.id !== abierto).map((a) => ({ nombre: nombreEnProyecto(a), contenido: a.codigo })) : [],
    esquema: motor.esquema,
  });
  const claveEditor = escrito ? `e:${donde}:${escrito.nombre}:${corridas}` : archivo ? archivo.id : `mesa-${mesa.vez}`;
  useEffect(() => {
    if (irLuego.current === null) return;
    const linea = irLuego.current;
    irLuego.current = null;
    irALinea(trabajo.current, linea);
  }, [claveEditor]);

  const alternarArchivos = () => {
    if (angosta) {
      if (cajon.current?.open) cajon.current.close();
      else cajon.current?.showModal();
    } else cambiarAjustes({ labSinArchivos: !sinArchivos });
  };
  const alternarPanel = () => cambiarAjustes({ labSinPanel: !sinPanel });

  // Ctrl+Enter runs from anywhere in the lab, and Ctrl+. stops. The editor answers Ctrl+Enter itself. Ctrl+B shows or
  // hides the files, Ctrl+J the panel (atajos.js).
  const teclas = useRef({});
  useEffect(() => {
    const alTeclear = (e) => {
      if (!aLaVista(raiz.current)) return;
      if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && (e.key === 'PageDown' || e.key === 'PageUp') && !e.defaultPrevented && !document.querySelector('dialog[open]')) {
        e.preventDefault();
        teclas.current.pestanaVecina(e.key === 'PageDown' ? 1 : -1);
        return;
      }
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.defaultPrevented || document.querySelector('dialog[open]')) return;
      const hacer = { Enter: 'correr', '.': 'parar', b: 'alternarArchivos', j: 'alternarPanel' }[e.key.length === 1 ? e.key.toLowerCase() : e.key];
      if (!hacer) return;
      e.preventDefault();
      teclas.current[hacer]();
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, []);

  const estado = {
    apagado: final || 'Listo para correr.',
    cargando: `Preparando ${nombreLenguaje}.`,
    listo: final || 'Listo para correr.',
    corriendo: motor.paquete ? `Bajando ${motor.paquete}${motor.peso ? `, ${peso(motor.peso)}` : ''}.` : 'Corriendo.',
    esperando: 'Esperando lo que escribas.',
    falla: `No se pudo cargar ${nombreLenguaje}.`,
  }[motor.fase];
  const porcentaje = motor.total ? Math.min(100, Math.round((motor.bajado / motor.total) * 100)) : 0;
  const origen = !archivo && mesa.origen;
  const materiaActual = proyectoObj ? proyectoObj.materia : archivo ? archivo.materia : mesa.materia;

  // The tabs of the open files, as in an editor: each file opened stays in its tab until it's closed, of any place.
  // What a program wrote, only those of the place in view.
  const activa = escrito ? `e:${escrito.nombre}` : abierto ? `a:${abierto}` : 'mesa';
  const valida = (t) => (t === 'mesa' ? !vivo : false) || (t.startsWith('a:') ? archivos.some((a) => a.id === t.slice(2)) : escritos.some((e) => e.nombre === t.slice(2)));
  const listaDePestanas = pestanas.filter(valida);
  const pestanasVisibles = listaDePestanas.includes(activa) ? listaDePestanas : [...listaDePestanas, activa];
  const archivoDe = (t) => (t.startsWith('a:') ? archivos.find((x) => x.id === t.slice(2)) ?? null : null);
  const nombrePestana = (t) => {
    if (t === 'mesa') return 'Sin guardar';
    if (t.startsWith('e:')) return t.slice(2);
    const a = archivoDe(t);
    return a ? (a.proyecto ? nombreEnProyecto(a) : `${a.nombre}.${LENGUAJES[a.lenguaje].extension}`) : '';
  };
  // Two tabs with the same name (main.c of two projects) say which project each one is.
  const repetidos = new Set(pestanasVisibles.map(nombrePestana).filter((n, i, todos) => todos.indexOf(n) !== i));
  const proyectoDePestana = (t) => {
    const a = archivoDe(t);
    return a?.proyecto && repetidos.has(nombrePestana(t)) ? proyectos.find((p) => p.id === a.proyecto)?.nombre ?? null : null;
  };
  const irAPestana = (t, cerrada = null) => {
    if (t === activa) return;
    if (t === 'mesa') abrir(null, { cerrada });
    else if (t.startsWith('e:')) abrir(abierto, { escrito: t.slice(2), cerrada });
    else abrir(t.slice(2), { cerrada });
  };
  const idPestana = (t) => `${id}-pestana-${encodeURIComponent(t)}`;
  // The editor of each tab, kept while it's open: where the cursor was and what Ctrl+Z undoes (Editor.jsx).
  const [memoriaEditor] = useState(() => new Map());
  const claveDePestana = (t) => (t === 'mesa' ? `mesa-${mesa.vez}` : t.startsWith('a:') ? t.slice(2) : null);
  // Closing the one in view goes to its neighbor. The last one leaves the draft.
  const cerrarPestana = (t) => {
    const i = pestanasVisibles.indexOf(t);
    const resto = pestanasVisibles.filter((x) => x !== t);
    if (!resto.length && (t === 'mesa' || vivo)) return;
    memoriaEditor.delete(claveDePestana(t));
    const vecina = resto[Math.min(i, resto.length - 1)] ?? 'mesa';
    setLugar((l) => ({ ...l, pestanas: l.pestanas.filter((x) => x !== t) }));
    if (t === activa) irAPestana(vecina, t);
    // Closed from the keyboard, the focus goes to the neighbor.
    if (document.activeElement?.closest('.lab-abiertos')) requestAnimationFrame(() => document.getElementById(idPestana(vecina))?.focus());
  };
  // «Borrar» on the draft: it starts again from the example and its tab closes; with no other tab, it stays in view.
  const borrarMesa = async () => {
    if (borradorEscrito(mesa) && !(await confirmar({ titulo: '¿Borrar lo que no guardaste?', texto: 'No se puede recuperar.', boton: 'Borrar', peligro: true }))) return;
    const otra = pestanasVisibles.find((x) => x !== 'mesa');
    if (activa === 'mesa' && otra) irAPestana(otra, 'mesa');
    memoriaEditor.delete(`mesa-${mesa.vez}`);
    olvidarLugar(`mesa-${mesa.vez}`);
    const limpia = mesaNueva(mesa.lenguaje, mesa.vez + 1);
    setLugar((l) => ({ ...l, mesa: limpia, pestanas: l.pestanas.filter((x) => x !== 'mesa') }));
    if (activa === 'mesa' && !otra) {
      setCodigo(limpia.codigo);
      setNombre('');
      limpiarSalida();
    }
  };
  // The tabs from the keyboard: the arrows go from one to the next, Enter opens it and Supr closes it. Alt+PageDown
  // and Alt+PageUp go to the next or the one before from anywhere in the lab (Ctrl+Tab is the browser's).
  const [focoPestana, setFocoPestana] = useState(null);
  const conFoco = pestanasVisibles.includes(focoPestana) ? focoPestana : activa;
  const teclaEnPestanas = (e) => {
    const i = pestanasVisibles.indexOf(conFoco);
    if (e.key === 'Delete') {
      e.preventDefault();
      cerrarPestana(conFoco);
      return;
    }
    const destino = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: pestanasVisibles.length - 1 }[e.key];
    if (destino === undefined) return;
    e.preventDefault();
    const t = pestanasVisibles[(destino + pestanasVisibles.length) % pestanasVisibles.length];
    setFocoPestana(t);
    document.getElementById(idPestana(t))?.focus();
  };
  const pestanaVecina = (paso) => {
    const i = pestanasVisibles.indexOf(activa);
    const t = pestanasVisibles[(i + paso + pestanasVisibles.length) % pestanasVisibles.length];
    if (t && t !== activa) irAPestana(t);
  };

  useEffect(() => {
    teclas.current = { correr, parar, alternarArchivos, alternarPanel, pestanaVecina, abrir, abierto, archivos };
  });

  // At a live table: the file in view is told to the table (what others follow), the one of whoever is followed opens
  // here, and a file another deleted leaves the one that runs in view.
  const alAbrir = vivo?.alAbrir;
  useEffect(() => {
    alAbrir?.(abierto);
  }, [alAbrir, abierto]);
  const guia = vivo?.guia ?? null;
  useEffect(() => {
    const t = teclas.current;
    if (guia && guia !== t.abierto && t.archivos.some((a) => a.id === guia)) t.abrir(guia);
  }, [guia]);
  useEffect(() => {
    if (!enVivo || archivo || escrito) return;
    const m = actual();
    const otro = (m.proyectosLab[0] && principalDe(m, m.proyectosLab[0])) ?? m.laboratorio[0];
    if (otro) teclas.current.abrir(otro.id);
  });

  // At a live table there is one project, the table's: its files are made, renamed and deleted for everyone. What
  // works with the student's other files and projects isn't there.
  const acciones = {
    abrir: (cual) => abrir(cual),
    abrirMesa: vivo ? undefined : () => abrir(null),
    borrarMesa: vivo ? undefined : borrarMesa,
    abrirEscrito,
    nuevoSuelto: vivo ? undefined : nuevoSuelto,
    nuevoProyecto,
    nuevoArchivo,
    subirZip: () => subirZip.current?.click(),
    subirArchivo: (p) => {
      subirA.current = p.id;
      subirUno.current?.setAttribute('accept', EXTENSIONES[p.lenguaje].map((x) => `.${x}`).join(','));
      subirUno.current?.click();
    },
    renombrarArchivo,
    renombrarProyecto,
    borrarArchivo: borrarUno,
    borrarProyecto: borrarElProyecto,
    elegirPrincipal: (p, a) => ops.cambiarProyecto(p, { principal: a }),
    aProyecto: vivo ? undefined : aProyecto,
    bajarArchivo: (a) => bajarTexto(a.id === abierto ? codigo : a.codigo, a.proyecto ? nombreEnProyecto(a) : nombreDeArchivo(a.nombre, a.lenguaje)),
    bajarProyecto,
    principalDe: (p) => principalDe(mio, p),
    puedeGuardarEscrito,
    guardarEscrito,
    bajarEscrito,
    descartarEscrito: soltarEscrito,
    moverArchivo: vivo ? undefined : mover,
    avisarError: (texto) => avisar(texto, 'error'),
    lenguajeNuevo: lenguaje,
  };
  const textos = vivo
    ? { archivos: 'Carpeta compartida', mostrar: 'Mostrar la carpeta', ocultar: 'Ocultar la carpeta', ancho: 'Ancho de la carpeta' }
    : { archivos: 'Tus archivos', mostrar: 'Mostrar tus archivos', ocultar: 'Ocultar tus archivos', ancho: 'Ancho de tus archivos' };

  const explorador = (
    <Explorador
      archivos={archivos}
      proyectos={proyectos}
      materias={vivo ? null : materias}
      mesa={vivo ? null : mesa}
      abierto={abierto}
      proyecto={proyecto}
      escritos={escritos}
      verEscrito={escrito?.nombre ?? null}
      acc={acciones}
      encabezado={!angosta}
      titulo={textos.archivos}
    />
  );

  // What a program wrote, open in the middle: its text without editing, or what it is if it isn't text.
  const propioDelEscrito = escrito && proyectoObj ? archivosDe(mio, proyecto).find((a) => nombreEnProyecto(a) === escrito.nombre) : null;
  const avisoEscrito = escrito && (
    <div className="lab-escrito" role="group" aria-label={`Lo que escribió el programa en ${escrito.nombre}`}>
      <p>
        {escrito.borrado
          ? 'Tu programa borró este archivo. En la próxima corrida no está.'
          : escrito.texto === null
            ? `Lo escribió tu programa y no es texto. ${queda} y entra a la próxima corrida.`
            : propioDelEscrito
              ? 'Lo cambió tu programa y entra así a la próxima corrida. Lo tuyo sigue guardado.'
              : `Lo escribió tu programa. ${queda} y entra a la próxima corrida.`}
      </p>
      <div className="lab-escrito__botones">
        {escrito.borrado ? (
          <>
            <button type="button" className="boton boton--secundario boton--chico" onClick={() => borrarDelProyecto(escrito.nombre)}>Borrarlo del proyecto</button>
            <button type="button" className="boton boton--secundario boton--chico" onClick={() => soltarEscrito(escrito.nombre)}>Dejarlo</button>
          </>
        ) : (
          <>
            {puedeGuardarEscrito(escrito) && (
              <button type="button" className="boton boton--chico" onClick={() => guardarEscrito(escrito.nombre)}>{propioDelEscrito ? 'Guardar el cambio' : 'Guardar en el proyecto'}</button>
            )}
            <button type="button" className="boton boton--secundario boton--chico" onClick={() => bajarEscrito(escrito.nombre)}>Bajar</button>
            <button type="button" className="boton boton--secundario boton--chico" onClick={() => soltarEscrito(escrito.nombre)}>{propioDelEscrito ? 'Volver a lo tuyo' : 'Descartar'}</button>
          </>
        )}
      </div>
    </div>
  );

  const modo = escrito ? modoDe(escrito.nombre) : archivo?.ext ? MODO_DE_EXT[archivo.ext] ?? 'texto' : lenguaje;
  const etiquetaEditor = escrito ? `Contenido de ${escrito.nombre}` : `Código en ${nombreLenguaje}${proyectoObj ? `, ${nombreMotor}` : ''}`;
  const pasoEnEditor = recorrido && !escrito && archivoDelPaso(pasoActual) === nombreMotor ? lineasDelPaso(recorrido.datos, pasoActual) : null;
  const errorEnEditor = error && !escrito && error.archivo === nombreMotor ? error : null;
  // As Error Lens, if it's on (Configuración): what the last run said, at the end of each line of the open file.
  const marcasEnEditor = escrito ? null : revision ?? marcasDelIntento({ error, piezas, lenguaje, abierto: nombreMotor, principal: principal ? nombreEnProyecto(principal) : nombreMotor });
  const codigoPrincipal = principal ? (principal.id === abierto ? codigo : principal.codigo) : codigo;
  const valorMateria = materiaActual === null || materiaActual === undefined ? '' : String(materiaActual);

  // A DER opens on its sheet in place of the editor. At a live table the sheet is shared by element (`vivo.der`); one
  // still as text waits a moment while it is turned into that.
  const esDer = !escrito && archivo?.ext === 'der';
  const derVivo = esDer && vivo ? vivo.der(archivo.id) : null;
  const Titulo = vivo ? 'h2' : 'h1';
  return (
    <div
      ref={raiz}
      className="lab"
      data-vivo={enVivo || undefined}
      data-archivo={vivo ? abierto ?? undefined : undefined}
      data-consultron-pantalla=""
      data-angosta={angosta || undefined}
      data-sin-archivos={(!angosta && sinArchivos) || undefined}
      data-sin-panel={sinPanel || undefined}
      style={{ '--lab-archivos': `${anchoArchivos}px`, '--lab-panel': `${altoPanel}px` }}
    >
      <div className="lab-barra">
        <div className="lab-barra__marca">
          <button
            type="button"
            className="lab-icono"
            onClick={alternarArchivos}
            aria-label={angosta ? textos.archivos : sinArchivos ? textos.mostrar : textos.ocultar}
            aria-expanded={angosta ? undefined : !sinArchivos}
            aria-controls={angosta ? undefined : `${id}-archivos`}
            aria-haspopup={angosta ? 'dialog' : undefined}
            aria-keyshortcuts="Control+B"
            title={angosta ? undefined : 'Ctrl + B'}
          >
            <Trazo nombre="archivos" />
            {angosta && <span aria-hidden="true">{textos.archivos}</span>}
          </button>
          <Titulo className="lab-barra__titulo">Laboratorio</Titulo>
        </div>

        <div className="lab-barra__abierto">
          {vivo ? (
            <>
              {proyectoObj && (
                <p className="lab-barra__proyecto">
                  <span className="lab-barra__carpeta">{proyectoObj.nombre}</span>
                  <span className="lab-barra__lenguaje" data-tipo={lenguaje}>{nombreLenguaje}</span>
                </p>
              )}
              <div className="lab-barra__guardar">
                <button type="button" className="boton boton--secundario boton--chico" onClick={bajarTodo}>Bajar zip</button>
              </div>
            </>
          ) : (
          <>
          {proyectoObj ? (
            <p className="lab-barra__proyecto">
              <span className="lab-barra__carpeta">{proyectoObj.nombre}</span>
              <span className="lab-barra__lenguaje" data-tipo={lenguaje}>{nombreLenguaje}</span>
            </p>
          ) : (
            <>
              <div className="lab-barra__campo">
                <label htmlFor={`${id}-nombre`}>Nombre</label>
                <input
                  id={`${id}-nombre`}
                  className="campo__control"
                  type="text"
                  maxLength={80}
                  autoComplete="off"
                  spellCheck={false}
                  value={nombre}
                  placeholder={archivo ? undefined : nombreSugerido(codigo, lenguaje, archivos)}
                  onChange={(e) => cambiarNombre(e.target.value)}
                  onBlur={() => {
                    if (archivo && !nombre.trim()) setNombre(archivo.nombre);
                  }}
                />
              </div>
              <fieldset className="laboratorio__lenguaje">
                <legend className="solo-lectores">Lenguaje</legend>
                {IDS_DE_LENGUAJE.map((l) => (
                  <label key={l} className="laboratorio__lenguaje-opcion">
                    <input type="radio" name={`${id}-lenguaje`} value={l} checked={lenguaje === l} onChange={() => elegirLenguaje(l)} aria-disabled={corriendo ? 'true' : undefined} />
                    {LENGUAJES[l].nombre}
                  </label>
                ))}
              </fieldset>
            </>
          )}
          <div className="lab-barra__campo">
            <label htmlFor={`${id}-materia`}>Materia</label>
            <select id={`${id}-materia`} className="campo__control" value={valorMateria} onChange={(e) => elegirMateria(e.target.value === '' ? null : /^\d+$/.test(e.target.value) ? Number(e.target.value) : e.target.value)}>
              <option value="">Sin materia</option>
              {valorMateria !== '' && !materias.nombres.has(materiaActual) && <option value={valorMateria}>{materias.cargadas ? 'Una materia que ya no está' : 'Materia del campus'}</option>}
              {materias.grupos.map((g) => (
                <optgroup key={g.nombre} label={g.nombre}>
                  {g.lista.map((m) => <option key={m.id} value={String(m.id)}>{m.nombre}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="lab-barra__guardar">
            {archivo ? (
              <>
                <span className="lab-barra__guardado">Se guarda solo</span>
                <button type="button" className="boton boton--secundario boton--chico" onClick={bajar}>{proyectoObj ? 'Bajar zip' : 'Bajar'}</button>
              </>
            ) : (
              <button type="button" className="boton boton--secundario boton--chico" onClick={() => guardar()}>Guardar</button>
            )}
          </div>
          </>
          )}
        </div>

        <div className="laboratorio__correr lab-barra__correr" data-fase={motor.fase}>
          {/* In a project, which file runs (whatever is open), and changing it right here. SQL too: it runs its main file. */}
          {proyectoObj && (VARIOS_ARCHIVOS[lenguaje] || lenguaje === 'sql') && principal && (
            <div className="lab-barra__campo">
              <label htmlFor={`${id}-corre`}>Corre</label>
              <select id={`${id}-corre`} className="campo__control" value={principal.id} onChange={(e) => ops.cambiarProyecto(proyectoObj.id, { principal: e.target.value })}>
                {archivosDe(mio, proyectoObj.id)
                  .filter((a) => (a.ext ?? LENGUAJES[a.lenguaje].extension) === LENGUAJES[lenguaje].extension)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {nombreEnProyecto(a)}
                    </option>
                  ))}
              </select>
            </div>
          )}
          <button type="button" className="boton boton--chico lab-barra__correr-boton" onClick={() => correr()} aria-disabled={corriendo ? 'true' : undefined} aria-keyshortcuts="Control+Enter">
            <Dibujo nombre="correr" />Correr
          </button>
          {(lenguaje === 'python' || lenguaje === 'c') && (
            <button type="button" ref={botonPasos} className="boton boton--secundario boton--chico" onClick={correrPasos} aria-disabled={corriendo ? 'true' : undefined}>
              <Dibujo nombre="pasos" />Paso a paso
            </button>
          )}
          <button type="button" className="boton boton--secundario boton--chico" onClick={parar} aria-disabled={corriendo ? undefined : 'true'} aria-keyshortcuts="Control+.">
            <Dibujo nombre="parar" />Parar
          </button>
          {lenguaje === 'sql' && !esDer && <button type="button" className="boton boton--secundario boton--chico" onClick={explicar} aria-disabled={corriendo ? 'true' : undefined}>Explicar la consulta</button>}
          {vivo?.enLaBarra?.({
            piezas,
            final,
            corriendo,
            // After sharing: the panel opens on the table's tab, which appears with the first output shared.
            verMesa: () => {
              setPestana('mesa');
              if (sinPanel) cambiarAjustes({ labSinPanel: false });
            },
          })}
        </div>
      </div>

      <div className="lab-cuerpo">
        {angosta ? (
          <dialog
            ref={cajon}
            className="lab-cajon"
            aria-labelledby={`${id}-cajon`}
            onClick={(e) => {
              if (e.target === e.currentTarget) e.currentTarget.close();
            }}
          >
            <div className="lab-cajon__cabeza">
              <h2 id={`${id}-cajon`} className="lab-cajon__titulo">{textos.archivos}</h2>
              <button type="button" className="lab-icono" onClick={() => cajon.current?.close()} aria-label="Cerrar">
                <Trazo nombre="cerrar" />
              </button>
            </div>
            {explorador}
          </dialog>
        ) : (
          <>
            <div id={`${id}-archivos`} className="lab-cuerpo__archivos" hidden={sinArchivos || undefined}>
              {explorador}
            </div>
            <Separador
              eje="x"
              etiqueta={textos.ancho}
              controla={`${id}-archivos`}
              medida={anchoArchivos}
              min={LAB_ARCHIVOS.min}
              max={topeArchivos}
              porDefecto={LAB_ARCHIVOS.porDefecto}
              oculto={sinArchivos}
              alCambiar={(v, listo) => {
                if (listo) {
                  cambiarAjustes({ labArchivos: v });
                  setArrastre((a) => ({ ...a, archivos: undefined }));
                } else setArrastre((a) => ({ ...a, archivos: v }));
              }}
              alAlternar={(oculto) => cambiarAjustes({ labSinArchivos: oculto })}
            />
          </>
        )}

        <section ref={trabajo} className="lab-centro" aria-labelledby={`${id}-titulo`}>
          <h2 id={`${id}-titulo`} className="solo-lectores">{proyectoObj ? `${proyectoObj.nombre}, ${nombreLenguaje}` : archivo ? `${archivo.nombre}, ${nombreLenguaje}` : `Sin guardar, ${nombreLenguaje}`}</h2>
          <div className="lab-centro__pestanas">
            {/* Tabs (WAI-ARIA), opened with Enter: another place stops what runs. The cross is for the pointer, and the
                wheel's click closes too. From the keyboard, Supr closes the tab with the focus. */}
            <div className="lab-abiertos" role="tablist" aria-label="Archivos abiertos" onKeyDown={teclaEnPestanas}>
              {pestanasVisibles.map((t) => {
                const deProyecto = proyectoDePestana(t);
                const cerrable = pestanasVisibles.length > 1 || (t !== 'mesa' && !vivo);
                return (
                  <div
                    key={t}
                    role="presentation"
                    className="lab-abiertos__item"
                    data-actual={t === activa || undefined}
                    data-escrito={t.startsWith('e:') || undefined}
                    onMouseDown={(e) => e.button === 1 && e.preventDefault()}
                    onAuxClick={(e) => {
                      if (e.button !== 1 || !cerrable) return;
                      e.preventDefault();
                      cerrarPestana(t);
                    }}
                  >
                    <button
                      type="button"
                      role="tab"
                      id={idPestana(t)}
                      className="lab-abiertos__nombre"
                      aria-selected={t === activa}
                      aria-controls={`${id}-hoja`}
                      aria-keyshortcuts={cerrable ? 'Delete' : undefined}
                      tabIndex={t === conFoco ? 0 : -1}
                      onFocus={() => setFocoPestana(t)}
                      onClick={() => irAPestana(t)}
                    >
                      {nombrePestana(t)}
                      {deProyecto && <span className="lab-abiertos__donde">{deProyecto}</span>}
                    </button>
                    {cerrable && (
                      <button type="button" className="lab-abiertos__cerrar" tabIndex={-1} aria-hidden="true" title={`Cerrar ${nombrePestana(t)}`} onClick={() => cerrarPestana(t)}>
                        <Trazo nombre="cerrar" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <p id={`${id}-teclas`} className="lab-centro__teclas">Ctrl + Enter corre. Esc y después Tab sale del editor.</p>
          </div>

          {origen && (
            <p className="laboratorio__origen">
              {origen.apunte ? `Viene de «${origen.apunte}»${origen.pagina ? `, página ${origen.pagina}` : ''}. ` : ''}
              Queda solo en esta pestaña hasta que lo guardes.
              {origen.otro && ` Parece ${NOMBRES_DE_LENGUAJE[origen.otro]}. Por ahora el laboratorio corre Python, SQL, C y JavaScript.`}
            </p>
          )}

          {/* It shows only if loading takes a while (laboratorio.css): from the browser's cache it's a moment. */}
          {motor.fase === 'cargando' && (
            <div className="laboratorio__carga laboratorio__carga--espera">
              <label htmlFor={`${id}-carga`}>{`Preparando ${nombreLenguaje}. Se baja una sola vez, unos ${LENGUAJES[lenguaje].peso}.`}</label>
              <progress id={`${id}-carga`} max={100} value={porcentaje}>{`${porcentaje} %`}</progress>
            </div>
          )}
          {motor.fase === 'falla' && (
            <div className="mensaje mensaje--error laboratorio__carga" role="alert">
              <p>{`No se pudo cargar ${nombreLenguaje}. Revisá la conexión y probá de nuevo.`}</p>
              <button type="button" className="boton boton--secundario boton--chico" onClick={() => motorDe(lenguaje).encender()}>Probar de nuevo</button>
            </div>
          )}

          {avisoEscrito}
          <div id={`${id}-hoja`} className="lab-centro__hoja" role="tabpanel" aria-labelledby={idPestana(activa)}>
            {escrito && (escrito.texto === null || escrito.borrado) ? (
              <p className="lab-centro__binario">{escrito.borrado ? `${escrito.nombre} ya no está en la carpeta del programa.` : `${escrito.nombre} pesa ${peso(escrito.bytes.length)}. Lo podés bajar.`}</p>
            ) : vivo && !escrito && !archivo ? null : esDer && vivo && !derVivo ? (
              <div className="lab-centro__der-espera" aria-busy="true" />
            ) : esDer ? (
              <Suspense fallback={<div className="lab-centro__der-espera" aria-busy="true" />}>
                <Der key={archivo.id} texto={codigo} nombre={archivo.nombre} alCambiar={alCambiarCodigo} alCrearSql={crearSqlDelDer} avisar={avisar} compartido={derVivo} />
              </Suspense>
            ) : (
              <Editor
                key={claveEditor}
                memoria={escrito || vivo ? null : memoriaEditor}
                clave={claveEditor}
                valor={escrito ? escrito.texto : vivo ? () => archivo.texto.toString() : codigo}
                compartido={!escrito && vivo ? vivo.extensiones(archivo.texto) : null}
                lenguaje={modo}
                etiqueta={etiquetaEditor}
                describe={`${id}-teclas`}
                error={errorEnEditor}
                marcas={marcasEnEditor}
                alCambiar={escrito ? undefined : alEditar}
                alCorrer={correr}
                paso={pasoEnEditor}
                soloLectura={Boolean(escrito)}
                contexto={contextoEditor}
              />
            )}
          </div>
        </section>

        {!angosta && (
          <Separador
            eje="y"
            etiqueta="Alto del panel"
            controla={`${id}-panel`}
            medida={altoPanel}
            min={LAB_PANEL.min}
            max={topePanel}
            porDefecto={LAB_PANEL.porDefecto}
            oculto={sinPanel}
            alCambiar={(v, listo) => {
              if (listo) {
                cambiarAjustes({ labPanel: v });
                setArrastre((a) => ({ ...a, panel: undefined }));
              } else setArrastre((a) => ({ ...a, panel: v }));
            }}
            alAlternar={(oculto) => cambiarAjustes({ labSinPanel: oculto })}
          />
        )}

        <div className="lab-panel">
          <Pestanas
            etiqueta="Panel"
            lista={PESTANAS}
            actual={pestana}
            idDe={idDe}
            alElegir={(p) => {
              setPestana(p);
              if (sinPanel) cambiarAjustes({ labSinPanel: false });
            }}
          >
            <p className="laboratorio__estado lab-panel__estado" role="status" title={typeof estado === 'string' ? estado : undefined}>
              {estado}
            </p>
            <button
              type="button"
              className="lab-icono lab-panel__alternar"
              onClick={alternarPanel}
              aria-label={sinPanel ? 'Mostrar el panel' : 'Ocultar el panel'}
              aria-expanded={!sinPanel}
              aria-controls={`${id}-panel`}
              aria-keyshortcuts="Control+J"
              title="Ctrl + J"
            >
              <Trazo nombre={sinPanel ? 'arriba' : 'abajo'} />
            </button>
          </Pestanas>
          <div id={`${id}-panel`} className="lab-panel__cuerpo" hidden={sinPanel || undefined}>
            <div role="tabpanel" id={idDe('consola', 'panel')} aria-labelledby={idDe('consola', 'pestana')} className="lab-panel__hoja lab-panel__hoja--consola" hidden={pestana !== 'consola' || undefined}>
              {recorrido && <PasoAPaso recorrido={recorrido.datos} lineas={recorrido.textos[archivoDelPaso(pasoActual)] ?? []} actual={pasoActual} alIr={irAlPaso} alCerrar={cerrarPasos} />}
              <div ref={consola} className="lab-panel__consola" hidden={recorrido ? true : undefined}>
                <Consola
                  piezas={piezas}
                  pide={pide}
                  alMandar={mandar}
                  alIrALinea={irA}
                  vacia={lenguaje === 'sql' ? 'Los resultados de tus consultas aparecen acá.' : 'Lo que imprima tu programa aparece acá.'}
                />
              </div>
            </div>
            {lenguaje !== 'sql' && (
              <div role="tabpanel" id={idDe('casos', 'panel')} aria-labelledby={idDe('casos', 'pestana')} className="lab-panel__hoja" hidden={pestana !== 'casos' || undefined}>
                <Casos dueno={proyectoObj ?? (archivo && !archivo.proyecto ? archivo : null)} lenguaje={lenguaje} ocupado={corriendo} alCorrer={correr} alParar={parar} guardarEn={ops.guardarCasos} />
              </div>
            )}
            {vivo?.panel && (
              <div role="tabpanel" id={idDe('mesa', 'panel')} aria-labelledby={idDe('mesa', 'pestana')} className="lab-panel__hoja" hidden={pestana !== 'mesa' || undefined}>
                {vivo.panel.contenido}
              </div>
            )}
            {leePrevia && (
              <div role="tabpanel" id={idDe('previa', 'panel')} aria-labelledby={idDe('previa', 'pestana')} className="lab-panel__hoja lab-panel__hoja--previa" hidden={pestana !== 'previa' || undefined}>
                <label className="campo__etiqueta" htmlFor={`${id}-previa`}>{`Lo que va a leer ${LENGUAJES[lenguaje].lee}`}</label>
                <span id={`${id}-previa-ayuda`} className="campo__ayuda">Una línea por cada vez que pregunta.</span>
                <textarea id={`${id}-previa`} className="campo__control laboratorio__previa" rows={4} autoComplete="off" spellCheck={false} aria-describedby={`${id}-previa-ayuda`} value={entradaPrevia} onChange={(e) => setEntradaPrevia(e.target.value)} />
              </div>
            )}
            {lenguaje === 'python' && (
              <div role="tabpanel" id={idDe('medir', 'panel')} aria-labelledby={idDe('medir', 'pestana')} className="lab-panel__hoja" hidden={pestana !== 'medir' || undefined}>
                <MedirTiempos enPestana codigo={codigoPrincipal} archivo={principal?.id ?? abierto ?? `mesa-${mesa.vez}`} ocupado={corriendo} alMedir={(m, alOtro) => correr({ modo: m, alOtro })} alParar={parar} />
              </div>
            )}
            {lenguaje === 'python' && (
              <div role="tabpanel" id={idDe('chapin', 'panel')} aria-labelledby={idDe('chapin', 'pestana')} className="lab-panel__hoja" hidden={pestana !== 'chapin' || undefined}>
                <Chapin codigo={modo === 'python' ? codigo : codigoPrincipal} nombre={modo === 'python' ? nombreMotor : principal?.nombre} activo={pestana === 'chapin' && !sinPanel} />
              </div>
            )}
            {lenguaje === 'sql' && (
              <div role="tabpanel" id={idDe('base', 'panel')} aria-labelledby={idDe('base', 'pestana')} className="lab-panel__hoja" hidden={pestana !== 'base' || undefined}>
                <Base ocupado={corriendo} />
              </div>
            )}
          </div>
        </div>
      </div>

      <input ref={subirZip} type="file" accept=".zip,application/zip" hidden onChange={alSubirZip} />
      <input ref={subirUno} type="file" hidden onChange={alSubirUno} />
    </div>
  );
}
