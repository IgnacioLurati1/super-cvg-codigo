import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { cargarVideo } from '../lib/campus';
import { guardarArchivo, traerArchivo } from '../lib/archivos';
import { fecha, fechaHora, peso } from '../lib/datos';
import { FRENADO, leerEnlace, visorDe, vistaDeGoogle } from '../lib/drivePublico';
import { archivoDeEnlace, itemDeNodo, nodoDeEnlace } from '../lib/mapasDrive';
import { docDe } from '../lib/lectura';
import { alternarEn, materiaDe, useMio } from '../lib/mio';
import { esDemo } from '../lib/modoDemo';
import { textoError } from '../lib/errores';
import { tokenActual } from '../lib/sesion';
import { useConsulta } from '../lib/useConsulta';
import { useMarcarVistos } from '../lib/vistos';
import { iconoDeEnlace } from '../lib/simbolos';
import CuestionarioPrevia from './EstadoCuestionario';
import TareaPrevia from './EstadoTarea';
import { extension } from './Filas';
import { Icono } from './Simbolo';
import TextoConFormato, { Bloques } from './TextoConFormato';
import EsperaLector from './lector/Espera';
import MandarAMateria, { Mandado } from './MandarAMateria';
import { VistaHtml, VistaPresentacion } from './VistaDeDrive';
import { tipoDePlanilla } from '../lib/planillaTipo';
import VistaImagen from './lector/VistaImagen';
import { useSesionEnVivo } from '../lib/enVivo/estado';
import LlevarALaSesion from './enVivo/LlevarALaSesion';
import './previaPdf.css';

const VisorPdf = lazy(() => import('./VisorPdf'));
const VistaPlanilla = lazy(() => import('./VistaPlanilla'));
const LIMITE_AUTOMATICO = 30 * 1024 * 1024;
// How much the pages scroll down (or up) before the file's details and buttons go away (or come back) on a phone.
const UMBRAL_LECTURA = 40;
// How long the scroll is not counted after the details and buttons come or go (see the effect below).
const QUIETO_TRAS_CAMBIO = 250;

const Contexto = createContext(() => {});
export const useAbrirPrevia = () => useContext(Contexto);

function esPdf(item) {
  return item.mime === 'application/pdf' || /\.pdf$/i.test(item.archivo ?? '');
}

// Dentro de un <img> un SVG no corre scripts, así que el archivo del campus se puede mostrar tal cual.
function Imagen({ blob, item }) {
  const { datos: direccion, error } = useConsulta(() => new Promise((resolver, rechazar) => {
    const lector = new FileReader();
    lector.onload = () => resolver(lector.result);
    lector.onerror = () => rechazar(lector.error);
    lector.readAsDataURL(new Blob([blob], { type: item.mime }));
  }), [blob, item.mime]);
  if (error) return <p className="previa__aviso" role="alert">No se pudo mostrar esta imagen. Bajala para abrirla.</p>;
  return direccion ? <VistaImagen direccion={direccion} nombre={item.nombre} blob={blob} /> : null;
}

// What code selected in a PDF takes to the lab: its course (of the campus or one of the student's) and its name.
const origenDe = (item) => ({
  materia: Number.isSafeInteger(item.materiaId) ? item.materiaId : (item.propio && /^p[0-9a-z]{6,20}-/.exec(item.id)?.[0].slice(0, -1)) || null,
  apunte: item.nombre ?? item.archivo,
});

// What this PDF is for Consultron, for what is marked in it to ask (consultron/fuentes.js names a PDF the same way).
const fuenteDe = (item) => ({ tipo: 'pdf', nombre: item.nombre, materia: item.materia, item: { ...item, abrirEn: undefined } });

function PreviaArchivo({ item, pie = null }) {
  const demo = esDemo(tokenActual());
  const pdf = esPdf(item);
  const imagen = item.mime.startsWith('image/');
  // A file of a Drive folder can also be an HTML or a PowerPoint (VistaDeDrive.jsx).
  const otra = item.drive?.visor === 'html' || item.drive?.visor === 'presentacion' ? item.drive.visor : null;
  // An Excel or a CSV, from anywhere: only its values, as text (VistaPlanilla.jsx).
  const planilla = tipoDePlanilla(item);
  // A file of the student's own comes from this browser (`item.traer`), and the sample PDFs from the demo itself: those
  // have a preview even in the demo.
  const seVe = (!demo || Boolean(item.traer) || pdf) && (pdf || imagen || Boolean(otra) || Boolean(planilla));
  const traer = () => (item.traer ? item.traer() : traerArchivo(item));
  const [pedida, setPedida] = useState(item.peso <= LIMITE_AUTOMATICO);
  const [bajando, setBajando] = useState(false);
  const [errorBajar, setErrorBajar] = useState('');
  // In a live session, a PDF or a picture can go to its table.
  const enVivo = useSesionEnVivo();

  const { datos: blob, error, cargando, recargar } = useConsulta(async () => (seVe && pedida ? traer() : null), [item.id, pedida]);

  const bajar = async () => {
    if (bajando) return;
    setBajando(true);
    setErrorBajar('');
    try {
      guardarArchivo(blob ?? (await traer()), item.archivo);
    } catch (e) {
      setErrorBajar(textoError(e));
    }
    setBajando(false);
  };

  return (
    <>
      <div className="previa__vista">
        {seVe && !pedida && (
          <div className="previa__aviso">
            <p>Este archivo pesa {peso(item.peso)}.</p>
            <button type="button" className="boton boton--secundario" onClick={() => setPedida(true)}>Cargar vista previa</button>
          </div>
        )}
        {seVe && pedida && cargando && !blob && (pdf ? <EsperaLector /> : <p className="previa__aviso" role="status">Cargando la vista previa</p>)}
        {seVe && error === FRENADO && item.drive && !blob && (
          <>
            <p className="previa__nota" role="status">Google frenó las descargas por un rato. Mientras tanto, lo ves con el visor de Google.</p>
            <iframe
              className="previa__marco"
              title={`Vista de ${item.nombre} en Google Drive`}
              src={vistaDeGoogle(item.drive.nodo)}
              sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
              referrerPolicy="no-referrer"
            />
          </>
        )}
        {seVe && error && error !== FRENADO && !blob && (
          <div className="previa__aviso" role="alert">
            <p>{error}</p>
            <button type="button" className="boton boton--secundario" onClick={recargar}>Probar de nuevo</button>
          </div>
        )}
        {pdf && blob && <Suspense fallback={<EsperaLector />}><VisorPdf blob={blob} nombre={item.archivo} doc={docDe(item)} inicio={item.abrirEn ?? null} origen={origenDe(item)} fuente={fuenteDe(item)} /></Suspense>}
        {imagen && blob && <Imagen blob={blob} item={item} />}
        {otra === 'html' && blob && <VistaHtml blob={blob} nombre={item.nombre} />}
        {otra === 'presentacion' && blob && <VistaPresentacion blob={blob} />}
        {planilla && blob && <Suspense fallback={<p className="previa__aviso" role="status">Leyendo la planilla</p>}><VistaPlanilla blob={blob} tipo={planilla} /></Suspense>}
        {!seVe && <p className="previa__aviso">Este tipo de archivo no tiene vista previa. Bajalo para abrirlo.</p>}
      </div>
      {errorBajar && <div className="mensaje mensaje--error" role="alert"><p>{errorBajar}</p></div>}
      <div className="previa__acciones">
        <button type="button" className="boton" onClick={bajar} aria-disabled={bajando ? 'true' : undefined}>{bajando ? 'Bajando' : 'Bajar archivo'}</button>
        {item.campus && <a className="boton boton--secundario" href={item.campus} target="_blank" rel="noreferrer">{{ classroom: 'Ver en Classroom', drive: 'Ver en Drive' }[item.origen] ?? 'Ver en el campus'}</a>}
        {enVivo?.sesion && blob && (pdf || imagen) && <LlevarALaSesion key={item.id} sesion={enVivo.sesion} blob={blob} nombre={item.nombre || item.archivo} tipo={pdf ? 'application/pdf' : item.mime} item={item} />}
        {pie}
      </div>
    </>
  );
}

function PreviaVideo({ id, nombre }) {
  const { datos } = useConsulta(() => cargarVideo(id).catch(() => null), [id]);
  return (
    <div className="previa__video">
      <img src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt="Miniatura del video" width="480" height="360" referrerPolicy="no-referrer" />
      {datos?.titulo && datos.titulo !== nombre && <p className="previa__video-titulo">{datos.titulo}</p>}
      {datos?.canal && <p className="previa__dato">{datos.canal}</p>}
    </div>
  );
}

function PreviaEnlace({ item, deDrive }) {
  const inseguro = item.destino.startsWith('http:');
  return (
    <>
      {item.video && <PreviaVideo id={item.video} nombre={item.nombre} />}
      <div className="previa__destino">
        <p className="previa__dominio">Va a {item.dominio}</p>
        {item.santo && <p className="previa__santo">Apunte de El Santo Resumen</p>}
        <p className="previa__direccion">{item.destino}</p>
        {inseguro && <p className="previa__alerta">Este enlace no usa conexión segura.</p>}
        {deDrive && <p className="previa__dato">Para verlo acá tiene que estar compartido con cualquiera que tenga el link.</p>}
      </div>
      <div className="previa__acciones">
        <a className="boton" href={item.destino} target="_blank" rel="noreferrer">Abrir enlace</a>
        {item.campus && item.campus !== item.destino && <a className="boton boton--secundario" href={item.campus} target="_blank" rel="noreferrer">{item.origen === 'classroom' ? 'Ver en Classroom' : 'Ver en el campus'}</a>}
      </div>
    </>
  );
}

function PreviaTexto({ item }) {
  return (
    <>
      {item.formato
        ? <div className="previa__texto previa__texto--formato"><TextoConFormato texto={item.texto} /></div>
        : item.bloques?.length
          ? <div className="previa__texto previa__texto--formato"><Bloques bloques={item.bloques} /></div>
          : <div className="previa__texto">{item.texto}</div>}
      {item.recortado && <p className="previa__dato">Sigue en el campus.</p>}
      {item.enlaces?.length > 0 && (
        <ul className="previa__enlaces">
          {item.enlaces.map((e, i) => (
            <li key={`${e.destino}-${i}`}>
              <a className="previa__destino previa__enlace" href={e.destino} target="_blank" rel="noreferrer">
                <Icono nombre={iconoDeEnlace(e.destino).simbolo} tono={iconoDeEnlace(e.destino).tono} tamano="tipo" />
                <span className="previa__enlace-texto">
                  <span className="previa__dominio">{e.texto}</span>
                  <span className="previa__direccion">Va a {e.dominio}{e.destino.startsWith('http:') ? ', sin conexión segura' : ''}</span>
                </span>
                <span className="solo-lectores">, se abre en otra pestaña</span>
              </a>
            </li>
          ))}
        </ul>
      )}
      {item.campus && (
        <div className="previa__acciones">
          <a className="boton boton--secundario" href={item.campus} target="_blank" rel="noreferrer">{item.origen === 'classroom' ? 'Ver en Classroom' : 'Ver en el campus'}</a>
        </div>
      )}
    </>
  );
}

function PreviaActividad({ item }) {
  return (
    <>
      {item.fechas?.length > 0 && (
        <dl className="previa__fechas">
          {item.fechas.map((f) => (
            <div key={`${f.etiqueta}${f.cuando}`}>
              <dt>{f.etiqueta.replace(/:\s*$/, '')}</dt>
              <dd>{fechaHora(f.cuando)}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="previa__acciones">
        <a className="boton" href={item.destino} target="_blank" rel="noreferrer">{item.origen === 'classroom' ? 'Abrir en Classroom' : 'Abrir en el campus'}</a>
      </div>
    </>
  );
}

// `suelto`: its buttons alone, to go in the row of another one (the reader's, under a PDF).
function Marcar({ item, suelto = false }) {
  const propia = materiaDe(useMio(), item.materiaId);
  const marcarVistos = useMarcarVistos();
  const visto = propia.vistos.includes(item.clave);
  const parcial = propia.parcial.includes(item.clave);
  const botones = (
    <>
      {marcarVistos && <button type="button" className="boton boton--secundario boton--chico" aria-pressed={visto} onClick={() => alternarEn(item.materiaId, 'vistos', item.clave)}>{visto ? 'Visto' : 'Marcar como visto'}</button>}
      <button type="button" className="boton boton--secundario boton--chico" aria-pressed={parcial} onClick={() => alternarEn(item.materiaId, 'parcial', item.clave)}>{parcial ? 'Sacar del parcial' : 'Sumar al parcial'}</button>
    </>
  );
  return suelto ? botones : <div className="previa__acciones">{botones}</div>;
}

// A link to a file of Drive opens as that file, with the name the course gave it.
function conNodo(item, nodo) {
  const { id, nombre, materia, materiaId, seccion, clave } = item;
  return { ...itemDeNodo(nodo), id, nombre: nombre || nodo.n, materia, materiaId, seccion, clave, enMateria: true };
}

// When the link says how it opens (a PDF, an image, an HTML, a PowerPoint, a Google file), right away.
function conDrive(item) {
  if (item.tipo !== 'enlace' || !item.destino) return item;
  const nodo = nodoDeEnlace(item.destino, item.nombre);
  return nodo && visorDe(nodo) ? conNodo(item, nodo) : item;
}

// Otherwise Drive is asked what the file is: any file shared with anyone who has the link.
const preguntarleADrive = (item) => item.tipo === 'enlace' && Boolean(item.destino) && [false, null].includes(leerEnlace(item.destino)?.carpeta);

function Hoja({ item: original, onCerrar }) {
  const directo = useMemo(() => conDrive(original), [original]);
  const preguntar = directo === original && preguntarleADrive(original);
  const [deDrive, setDeDrive] = useState({ listo: !preguntar, item: null });
  useEffect(() => {
    if (!preguntar) return undefined;
    let vigente = true;
    archivoDeEnlace(original.destino).then((nodo) => {
      if (vigente) setDeDrive({ listo: true, item: nodo ? conNodo(original, nodo) : null });
    });
    return () => { vigente = false; };
  }, [preguntar, original]);
  const item = deDrive.item ?? directo;
  // A file of Drive goes to a course from here: its button with the others, what it asks under them.
  const [mandando, setMandando] = useState(false);
  const [mandado, setMandado] = useState(null);
  const botonMandar = useRef(null);
  const volverAlBoton = () => requestAnimationFrame(() => botonMandar.current?.focus());
  const dialogo = useRef(null);
  const desdeFondo = useRef(false);

  useEffect(() => {
    const el = dialogo.current;
    if (!el.open) el.showModal();
  }, []);

  // A PDF opens in the reader, which takes the whole sheet; an HTML or a PowerPoint of Drive and any spreadsheet too.
  const lector = item.tipo === 'archivo' && (esPdf(item) || item.drive?.visor === 'html' || item.drive?.visor === 'presentacion' || Boolean(tipoDePlanilla(item)));
  const conPaginas = lector && esPdf(item);

  // On a phone, reading (the pages scrolled down) takes away the file's details and buttons under the pages; scrolling
  // up, reaching the top or touching a page brings them back (previaPdf.css). Marked straight on those elements: the
  // reader isn't drawn again, and the rest of the sheet keeps its styles.
  useEffect(() => {
    const el = dialogo.current;
    if (!conPaginas) return undefined;
    const angosto = window.matchMedia?.('(max-width: 40rem)');
    const antes = new WeakMap();
    let recorrido = 0;
    let ahora = false;
    // Showing or hiding them changes the reader's height, and near the end the browser moves its scroll up: that move
    // isn't the student's, so for a moment after a change the scroll doesn't count (or they would flicker).
    let quietoHasta = 0;
    const leyendo = (si) => {
      if (si === ahora) return;
      ahora = si;
      recorrido = 0;
      quietoHasta = performance.now() + QUIETO_TRAS_CAMBIO;
      const caja = el.querySelector('.previa__caja');
      const vista = caja?.querySelector(':scope > .previa__vista');
      if (!vista) return;
      for (const hijo of caja.children) {
        if (hijo === vista || !(hijo.matches('.previa__dato, .previa__descripcion') || vista.compareDocumentPosition(hijo) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
        if (si) hijo.dataset.leyendo = '';
        else delete hijo.dataset.leyendo;
      }
    };
    const alScroll = (e) => {
      const marco = e.target;
      if (!(marco instanceof Element) || !marco.classList.contains('lector__marco')) return;
      const y = marco.scrollTop;
      const d = y - (antes.get(marco) ?? y);
      antes.set(marco, y);
      if (!angosto?.matches || !d || performance.now() < quietoHasta) return;
      recorrido = Math.sign(d) === Math.sign(recorrido) ? recorrido + d : d;
      if (y <= 0 || recorrido < -UMBRAL_LECTURA) leyendo(false);
      else if (recorrido > UMBRAL_LECTURA) leyendo(true);
    };
    const alTocar = (e) => {
      if (e.target.closest?.('.lector__paginas')) leyendo(false);
    };
    el.addEventListener('scroll', alScroll, true);
    el.addEventListener('click', alTocar);
    return () => {
      el.removeEventListener('scroll', alScroll, true);
      el.removeEventListener('click', alTocar);
      leyendo(false);
    };
  }, [conPaginas]);
  const datos = item.tipo === 'archivo'
    ? [extension(item.archivo), item.modificado ? `Actualizado el ${fecha(item.modificado)}` : null]
    : [item.detalle ?? (item.tipo === 'enlace' ? 'Enlace' : item.clase)];

  return (
    <dialog
      ref={dialogo}
      className={lector ? 'previa previa--pdf' : 'previa'}
      aria-labelledby="previa-titulo"
      onClose={onCerrar}
      onPointerDown={(e) => { desdeFondo.current = e.target === dialogo.current; }}
      onClick={(e) => { if (desdeFondo.current && e.target === dialogo.current) dialogo.current.close(); }}
    >
      <div className="previa__caja">
        <div className="previa__cabeza">
          <h2 id="previa-titulo">{item.nombre}</h2>
          <button type="button" className="boton boton--secundario boton--chico" onClick={() => dialogo.current.close()}>Cerrar</button>
        </div>
        <p className="previa__dato">{datos.filter(Boolean).join(', ')}</p>
        <p className="previa__dato">{[item.materia, item.seccion].filter(Boolean).join(', ')}</p>
        {item.nombreOriginal && <p className="previa__dato">{{ classroom: 'En Classroom se llama', propia: 'Antes se llamaba' }[item.origen] ?? 'En el campus se llama'} {item.nombreOriginal}</p>}
        {item.descripcion && item.tipo !== 'texto' && <p className="previa__descripcion">{item.descripcion}</p>}
        {item.tipo === 'archivo' && (
          <PreviaArchivo
            item={item}
            pie={lector && item.clave ? <Marcar item={item} suelto /> : item.drive && !item.enMateria ? (
              <button ref={botonMandar} type="button" className="boton boton--secundario" aria-expanded={mandando} aria-controls="previa-mandar" onClick={() => { setMandando((v) => !v); setMandado(null); }}>
                Mandar a una materia
              </button>
            ) : null}
          />
        )}
        {mandando && (
          <div className="previa__mandar">
            <MandarAMateria id="previa-mandar" nodo={item.drive.nodo} alMandar={(h) => { setMandado(h); setMandando(false); volverAlBoton(); }} alCancelar={() => { setMandando(false); volverAlBoton(); }} />
          </div>
        )}
        {mandado && <Mandado hecho={mandado} />}
        {item.tipo === 'enlace' && (deDrive.listo
          ? <PreviaEnlace item={item} deDrive={preguntar} />
          : <p className="previa__dato" role="status">Buscando el archivo en Drive…</p>)}
        {item.tipo === 'actividad' && (item.tarea?.cmid ? <TareaPrevia item={item} onIr={() => dialogo.current.close()} /> : item.cuestionario?.cmid ? <CuestionarioPrevia item={item} onIr={() => dialogo.current.close()} /> : <PreviaActividad item={item} />)}
        {item.tipo === 'texto' && <PreviaTexto item={item} />}
        {item.clave && !lector && <Marcar item={item} />}
      </div>
    </dialog>
  );
}

export function PreviaProvider({ children }) {
  const [item, setItem] = useState(null);
  const abrir = useCallback((nuevo) => setItem(nuevo), []);
  const cerrar = useCallback(() => setItem(null), []);
  return (
    <Contexto.Provider value={abrir}>
      {children}
      {item && <Hoja key={item.id} item={item} onCerrar={cerrar} />}
    </Contexto.Provider>
  );
}
