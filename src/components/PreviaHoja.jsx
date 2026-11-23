import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { cargarVideo } from '../lib/campus';
import { abrirPdf, guardarArchivo, seguirEnFondo, SIN_PARTES, traerArchivo } from '../lib/archivos';
import { Partes } from '../lib/pdfPartes';
import { fecha, fechaHora, peso } from '../lib/datos';
import { ARCHIVO_NO_ESTA, enlaceDe, FRENADO, leerEnlace, SIN_CLAVE, sinSesionDeGoogle, visorDe, vistaDeGoogle } from '../lib/drivePublico';
import { mailGoogle } from '../lib/google';
import { CarpetaEnHoja, esCarpetaDeDrive, nombreDeLink, useAbrirCarpeta } from './carpetaEnHoja';
import { destinoDeEnlace, itemDeNodo, nodoDeEnlace } from '../lib/mapasDrive';
import CarpetaDeDrive from './CarpetaDeDrive';
import { docDe } from '../lib/lectura';
import { alternarEn, materiaDe, useMio } from '../lib/mio';
import { esDemo } from '../lib/modoDemo';
import { textoError } from '../lib/errores';
import { tokenActual } from '../lib/sesion';
import { useConsulta } from '../lib/useConsulta';
import { useMarcarVistos } from '../lib/vistos';
import { dibujoDeItem } from '../lib/simbolos';
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
// How much the pages scroll down before the file's details and buttons go away on a phone. Coming back asks for more:
// a third of the reader scrolled up, so a small move while reading doesn't bring them.
const UMBRAL_LECTURA = 40;
const PARTE_PARA_VOLVER = 1 / 3;
// How long they take to slide back in (previaPdf.css). They go at once.
const VUELTA_MS = 220;
// How long the scroll is not counted after the details and buttons come or go (see the effect below).
const QUIETO_TRAS_CAMBIO = 250;


// A link of a text: a file in Drive drawn as that file, with the link badge.
function IconoDeEnlace({ enlace }) {
  const { simbolo, tono, enlace: enlazado } = dibujoDeItem({ tipo: 'enlace', destino: enlace.destino, nombre: enlace.titulo ?? enlace.texto });
  return <Icono nombre={simbolo} tono={tono} enlazado={enlazado} tamano="tipo" />;
}

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

/** `cerrar`: in the reader, on a phone «Cerrar» goes among the buttons under the pages, where the link to the campus was
 * (previaPdf.css). */
function PreviaArchivo({ item, pie = null, cerrar = null }) {
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
  const [aMano, setAMano] = useState(false);
  const [bajando, setBajando] = useState(false);
  const [errorBajar, setErrorBajar] = useState('');
  // In a live session, a PDF or a picture can go to its table.
  const enVivo = useSesionEnVivo();

  // A big PDF of the campus comes by parts (archivos.js, abrirPdf), but in a live session, where it may go whole to the
  // table. A file over LIMITE_AUTOMATICO waits for the student, unless it comes by parts: then only the pages read come.
  const grande = item.peso > LIMITE_AUTOMATICO;
  const porPartes = pdf && !enVivo?.sesion;
  const { datos, error, cargando, recargar } = useConsulta(
    async () => (seVe && (aMano || !grande || porPartes) ? (porPartes ? abrirPdf(item, { soloPartes: grande && !aMano }) : traer()) : null),
    [item.id, aMano],
  );
  // What came, but SIN_PARTES: then the file waits for the student, as any big file.
  const vino = datos === SIN_PARTES ? null : datos;
  const pedida = aMano || ((!grande || porPartes) && datos !== SIN_PARTES);
  const partes = vino instanceof Partes ? vino : null;
  const blob = partes ? null : vino;
  // A PDF by parts: the whole file once it is all here, and the failure that leaves it without pages, of these parts.
  const [dePartes, setDePartes] = useState({ partes: null, entero: null, fallo: '' });
  const cierre = useRef(null);
  useEffect(() => {
    if (!partes) return undefined;
    if (cierre.current?.partes === partes) clearTimeout(cierre.current.reloj);
    const dejar = partes.escuchar({
      alTerminar: (entero) => setDePartes({ partes, entero, fallo: '' }),
      alFallar: (e) => setDePartes({ partes, entero: null, fallo: textoError(e) }),
    });
    seguirEnFondo(partes);
    return () => {
      dejar();
      // Closed a moment later: the same parts mounted again (React in development) keep going.
      cierre.current = { partes, reloj: setTimeout(() => partes.cerrar(), 0) };
    };
  }, [partes]);
  const estos = dePartes.partes === partes ? dePartes : null;
  const entero = blob ?? partes?.blob ?? estos?.entero ?? null;
  const fallo = estos?.fallo ?? '';
  // A file of Classroom shared only with the class (or Drive refusing the site's key): the student's Google session can see it.
  const soloDelCurso = Boolean(item.classroom && item.drive && [ARCHIVO_NO_ESTA, SIN_CLAVE].includes(error) && !vino);

  const bajar = async () => {
    if (bajando) return;
    setBajando(true);
    setErrorBajar('');
    try {
      guardarArchivo(entero ?? (partes && partes.estado !== 'roto' ? await partes.completar() : await traer()), item.archivo);
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
            <button type="button" className="boton boton--secundario" onClick={() => setAMano(true)}>Cargar vista previa</button>
          </div>
        )}
        {seVe && pedida && cargando && !vino && (pdf ? <EsperaLector /> : <p className="previa__aviso" role="status">Cargando la vista previa</p>)}
        {seVe && error === FRENADO && item.drive && !vino && (
          <VisorDeGoogle nodo={item.drive.nodo} nombre={item.nombre} nota="Google frenó las descargas por un rato. Mientras tanto, lo ves con el visor de Google." />
        )}
        {seVe && soloDelCurso && <VisorDeClassroom nodo={item.drive.nodo} nombre={item.nombre} />}
        {seVe && ((error && error !== FRENADO && !soloDelCurso && !vino) || fallo) && (
          <div className="previa__aviso" role="alert">
            <p>{fallo || error}</p>
            <button type="button" className="boton boton--secundario" onClick={recargar}>Probar de nuevo</button>
          </div>
        )}
        {pdf && (blob || partes) && !fallo && <Suspense fallback={<EsperaLector />}><VisorPdf blob={blob} partes={partes} nombre={item.archivo} doc={docDe(item)} inicio={item.abrirEn ?? null} origen={origenDe(item)} fuente={fuenteDe(item)} /></Suspense>}
        {imagen && blob && <Imagen blob={blob} item={item} />}
        {otra === 'html' && blob && <VistaHtml blob={blob} nombre={item.nombre} />}
        {otra === 'presentacion' && blob && <VistaPresentacion blob={blob} />}
        {planilla && blob && <Suspense fallback={<p className="previa__aviso" role="status">Leyendo la planilla</p>}><VistaPlanilla blob={blob} tipo={planilla} /></Suspense>}
        {!seVe && <p className="previa__aviso">Este tipo de archivo no tiene vista previa. Bajalo para abrirlo.</p>}
      </div>
      {errorBajar && <div className="mensaje mensaje--error" role="alert"><p>{errorBajar}</p></div>}
      <div className="previa__acciones">
        <button type="button" className="boton" onClick={bajar} aria-disabled={bajando ? 'true' : undefined}>{bajando ? 'Bajando' : 'Bajar archivo'}</button>
        {cerrar && <button type="button" className="boton boton--secundario previa__cerrar-abajo" onClick={cerrar}>Cerrar</button>}
        {item.campus && <a className="boton boton--secundario previa__ver-original" href={item.campus} target="_blank" rel="noreferrer">{{ classroom: 'Ver en Classroom', drive: 'Ver en Drive' }[item.origen] ?? 'Ver en el campus'}</a>}
        {enVivo?.sesion && entero && (pdf || imagen) && <LlevarALaSesion key={item.id} sesion={enVivo.sesion} blob={entero} nombre={item.nombre || item.archivo} tipo={pdf ? 'application/pdf' : item.mime} item={item} />}
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

// Google's own view of a Drive file, in a frame of its own: it runs on Google's origin, with nothing of this site.
function VisorDeGoogle({ nodo, nombre, nota, cuenta = '' }) {
  return (
    <>
      <p className="previa__nota" role="status">{nota}</p>
      <iframe
        className="previa__marco"
        title={`Vista de ${nombre} en Google Drive`}
        src={vistaDeGoogle(nodo, cuenta)}
        sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer"
      />
    </>
  );
}

// A file of Classroom shared only with the class, with the Google account linked to Classroom.
// Browsers that keep Google's session out of another page's frame (sinSesionDeGoogle) say so instead of a frame asking
// to sign in.
function VisorDeClassroom({ nodo, nombre }) {
  const cuenta = mailGoogle();
  if (sinSesionDeGoogle()) return <p className="previa__aviso" role="status">Está compartido solo con el curso y tu navegador no deja verlo acá. Abrilo en Drive.</p>;
  return <VisorDeGoogle nodo={nodo} nombre={nombre} cuenta={cuenta} nota={`Está compartido solo con el curso. Lo ves con el visor de Google y tu cuenta${cuenta ? ` ${cuenta}` : ''}.`} />;
}

function PreviaEnlace({ item, deDrive, soloDelCurso = null }) {
  const inseguro = item.destino.startsWith('http:');
  if (soloDelCurso) {
    return (
      <>
        <div className="previa__vista"><VisorDeClassroom nodo={soloDelCurso} nombre={item.nombre} /></div>
        <div className="previa__acciones">
          <a className="boton" href={item.destino} target="_blank" rel="noreferrer">Abrir enlace</a>
          {item.campus && item.campus !== item.destino && <a className="boton boton--secundario" href={item.campus} target="_blank" rel="noreferrer">Ver en Classroom</a>}
        </div>
      </>
    );
  }
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
  const abrirCarpeta = useAbrirCarpeta();
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
              {abrirCarpeta && esCarpetaDeDrive(e.destino) ? (
                // A Drive folder opens here, in this same sheet.
                <button type="button" className="previa__destino previa__enlace" onClick={() => abrirCarpeta(e)}>
                  <IconoDeEnlace enlace={e} />
                  <span className="previa__enlace-texto">
                    <span className="previa__dominio">{nombreDeLink(e.texto, e.destino) || 'Carpeta de Drive'}</span>
                    <span className="previa__direccion">Se abre acá</span>
                  </span>
                </button>
              ) : (
              <a className="previa__destino previa__enlace" href={e.destino} target="_blank" rel="noreferrer">
                <IconoDeEnlace enlace={e} />
                <span className="previa__enlace-texto">
                  <span className="previa__dominio">{e.texto}</span>
                  <span className="previa__direccion">Va a {e.dominio}{e.destino.startsWith('http:') ? ', sin conexión segura' : ''}</span>
                </span>
                <span className="solo-lectores">, se abre en otra pestaña</span>
              </a>
              )}
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

/** A forum of the campus: it is read in Foros, already filtered to it. */
function ForoPrevia({ item, onIr }) {
  return (
    <div className="previa__acciones">
      <Link className="boton" to={`/mensajes/foros?foro=${item.foro.cmid}`} onClick={onIr}>Leer el foro</Link>
      <a className="boton boton--secundario" href={item.destino} target="_blank" rel="noreferrer">Abrir en el campus<span className="solo-lectores">, se abre en otra pestaña</span></a>
    </div>
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
  return { ...itemDeNodo(nodo), id, nombre: nombre || nodo.n, materia, materiaId, seccion, clave, enMateria: true, classroom: item.origen === 'classroom' };
}

// The file a link of Classroom points to, with its name in Drive (it keeps the extension the row drops).
const nodoDeItem = (item) => nodoDeEnlace(item.destino, item.tituloEnDrive ?? item.nombre);

// When the link says how it opens (a PDF, an image, an HTML, a PowerPoint, a Google file), right away.
function conDrive(item) {
  if (item.tipo !== 'enlace' || !item.destino) return item;
  const nodo = nodoDeItem(item);
  return nodo && visorDe(nodo) ? conNodo(item, nodo) : item;
}

// Otherwise Drive is asked what the file is: any file shared with anyone who has the link.
const preguntarleADrive = (item) => item.tipo === 'enlace' && Boolean(item.destino) && [false, null].includes(leerEnlace(item.destino)?.carpeta);

// A link to a Drive folder is looked through here (CarpetaDeDrive.jsx), from the folder it names.
function carpetaDeEnlace(item) {
  if (item.tipo !== 'enlace' || !item.destino) return null;
  const enlace = leerEnlace(item.destino);
  return enlace?.carpeta ? { id: enlace.id, k: enlace.k, nombre: item.nombre } : null;
}

// A file opened from a folder of the course: the course and the folders it is in, under its name.
function deLaCarpeta(original, nodo, donde) {
  return { ...itemDeNodo(nodo), materia: original.materia, materiaId: original.materiaId, seccion: [original.seccion, donde].filter(Boolean).join(', '), enMateria: true };
}

// The sheet itself, apart from Previa.jsx: it loads the first time something opens (or when the page is idle).
export default function Hoja({ item: original, onCerrar }) {
  const directo = useMemo(() => conDrive(original), [original]);
  const preguntar = directo === original && preguntarleADrive(original);
  const [deDrive, setDeDrive] = useState({ listo: !preguntar, item: null, carpeta: null });
  useEffect(() => {
    if (!preguntar) return undefined;
    let vigente = true;
    destinoDeEnlace(original.destino).then((destino) => {
      if (!vigente) return;
      setDeDrive({
        listo: true,
        item: destino?.nodo ? conNodo(original, destino.nodo) : null,
        carpeta: destino?.carpeta ? { ...destino.carpeta, nombre: original.nombre || destino.carpeta.nombre } : null,
      });
    });
    return () => { vigente = false; };
  }, [preguntar, original]);
  // In a folder: the way down to the one in view, the file opened from it and the one it came back from.
  const [camino, setCamino] = useState(() => {
    const raiz = carpetaDeEnlace(original);
    return raiz ? [raiz] : null;
  });
  const [deCarpeta, setDeCarpeta] = useState(null);
  const [volvioDe, setVolvioDe] = useState(null);
  // A folder opened from a link of the text, with the way back to it.
  const [desdeTexto, setDesdeTexto] = useState(false);
  const abrirCarpetaDeTexto = useCallback(({ destino, texto }) => {
    const enlace = leerEnlace(destino);
    if (!enlace?.carpeta) return;
    setCamino([{ id: enlace.id, k: enlace.k, nombre: nombreDeLink(texto, destino) }]);
    setDesdeTexto(true);
    setDeCarpeta(null);
    setVolvioDe(null);
    requestAnimationFrame(() => document.getElementById('previa-titulo')?.focus());
  }, []);
  const volverAlTexto = () => {
    setCamino(null);
    setDesdeTexto(false);
    alTitulo();
  };
  const caminoAhora = camino ?? (deDrive.carpeta ? [deDrive.carpeta] : null);
  const enCarpeta = Boolean(caminoAhora) && !deCarpeta;
  const item = deCarpeta ?? deDrive.item ?? directo;
  // Changing what the sheet shows leaves the focus on its title, so it isn't lost on the page under the dialog.
  const titulo = useRef(null);
  const alTitulo = () => requestAnimationFrame(() => titulo.current?.focus());
  const abrirDeCarpeta = (nodo, donde) => {
    setVolvioDe(null);
    setDeCarpeta(deLaCarpeta(original, nodo, donde));
    alTitulo();
  };
  const volverACarpeta = () => {
    setVolvioDe(deCarpeta.drive.nodo.id);
    setDeCarpeta(null);
  };
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
    // They leave their room at once (data-leyendo); coming back they take it and slide in (data-volviendo). A change
    // halfway cancels the one before.
    let reloj = 0;
    const deLaFicha = () => {
      const caja = el.querySelector('.previa__caja');
      const vista = caja?.querySelector(':scope > .previa__vista');
      if (!vista) return [];
      return [...caja.children].filter((hijo) => hijo !== vista && (hijo.matches('.previa__dato, .previa__descripcion') || vista.compareDocumentPosition(hijo) & Node.DOCUMENT_POSITION_FOLLOWING));
    };
    const leyendo = (si, { animar = true } = {}) => {
      if (si === ahora) return;
      ahora = si;
      recorrido = 0;
      clearTimeout(reloj);
      const hijos = deLaFicha();
      const mover = animar && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      quietoHasta = performance.now() + QUIETO_TRAS_CAMBIO;
      // Going away is at once, with no slide (Ignacio, 22/11): only coming back moves.
      if (si) {
        for (const hijo of hijos) {
          delete hijo.dataset.saliendo;
          delete hijo.dataset.volviendo;
          hijo.dataset.leyendo = '';
        }
        return undefined;
      }
      for (const hijo of hijos) {
        const estaba = 'leyendo' in hijo.dataset;
        delete hijo.dataset.leyendo;
        delete hijo.dataset.saliendo;
        if (mover && estaba) hijo.dataset.volviendo = '';
      }
      if (mover) reloj = setTimeout(() => hijos.forEach((hijo) => delete hijo.dataset.volviendo), VUELTA_MS);
      return undefined;
    };
    // Writing (a note, the page number), the keyboard opening moves the scroll: that isn't reading.
    const escribiendo = () => Boolean(document.activeElement?.closest?.('input, textarea, select, [contenteditable="true"]'));
    const alScroll = (e) => {
      const marco = e.target;
      if (!(marco instanceof Element) || !marco.classList.contains('lector__marco')) return;
      const y = marco.scrollTop;
      const d = y - (antes.get(marco) ?? y);
      antes.set(marco, y);
      if (!angosto?.matches || !d || performance.now() < quietoHasta || escribiendo()) return;
      recorrido = Math.sign(d) === Math.sign(recorrido) ? recorrido + d : d;
      if (y <= 0 || recorrido < -marco.clientHeight * PARTE_PARA_VOLVER) leyendo(false);
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
      leyendo(false, { animar: false });
    };
  }, [conPaginas]);
  const datos = item.tipo === 'archivo'
    ? [extension(item.archivo), item.modificado ? `Actualizado el ${fecha(item.modificado)}` : null]
    : [enCarpeta ? 'Carpeta de Drive' : item.detalle ?? (item.tipo === 'enlace' ? 'Enlace' : item.clase)];

  return (
    <CarpetaEnHoja.Provider value={abrirCarpetaDeTexto}>
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
          <h2 id="previa-titulo" ref={titulo} tabIndex={-1}>{item.nombre}</h2>
          {deCarpeta && <button type="button" className="boton boton--secundario boton--chico previa__volver" onClick={volverACarpeta}>Volver a la carpeta</button>}
          {desdeTexto && enCarpeta && <button type="button" className="boton boton--secundario boton--chico previa__volver" onClick={volverAlTexto}>Volver al texto</button>}
          <button type="button" className="boton boton--secundario boton--chico previa__cerrar" onClick={() => dialogo.current.close()}>Cerrar</button>
        </div>
        <p className="previa__dato">{datos.filter(Boolean).join(', ')}</p>
        <p className="previa__dato">{[item.materia, item.seccion].filter(Boolean).join(', ')}</p>
        {item.nombreOriginal && <p className="previa__dato">{{ classroom: 'En Classroom se llama', propia: 'Antes se llamaba' }[item.origen] ?? 'En el campus se llama'} {item.nombreOriginal}</p>}
        {item.descripcion && item.tipo !== 'texto' && <p className="previa__descripcion">{item.descripcion}</p>}
        {item.tipo === 'archivo' && (
          <PreviaArchivo
            item={item}
            cerrar={lector ? () => dialogo.current.close() : null}
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
        {enCarpeta && (
          <>
            <CarpetaDeDrive camino={caminoAhora} alCambiarCamino={setCamino} alAbrir={abrirDeCarpeta} volvioDe={volvioDe} conTitulo={desdeTexto} />
            <div className="previa__acciones">
              <a className="boton boton--secundario" href={enlaceDe({ c: 1, id: caminoAhora[0].id, k: caminoAhora[0].k })} target="_blank" rel="noreferrer">Abrir en Drive<span className="solo-lectores">, se abre en otra pestaña</span></a>
              {original.campus && original.campus !== original.destino && <a className="boton boton--secundario" href={original.campus} target="_blank" rel="noreferrer">{original.origen === 'classroom' ? 'Ver en Classroom' : 'Ver en el campus'}</a>}
            </div>
          </>
        )}
        {item.tipo === 'enlace' && !enCarpeta && (deDrive.listo
          ? <PreviaEnlace item={item} deDrive={preguntar} soloDelCurso={preguntar && original.origen === 'classroom' && !deDrive.carpeta ? nodoDeItem(original) : null} />
          : <p className="previa__dato" role="status">Buscando el archivo en Drive…</p>)}
        {item.tipo === 'actividad' && (item.tarea?.cmid ? <TareaPrevia item={item} onIr={() => dialogo.current.close()} /> : item.cuestionario?.cmid ? <CuestionarioPrevia item={item} onIr={() => dialogo.current.close()} /> : item.foro?.cmid ? <ForoPrevia item={item} onIr={() => dialogo.current.close()} /> : <PreviaActividad item={item} />)}
        {item.tipo === 'texto' && !enCarpeta && <PreviaTexto item={item} />}
        {item.clave && !lector && <Marcar item={item} />}
      </div>
    </dialog>
    </CarpetaEnHoja.Provider>
  );
}
