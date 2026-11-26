import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { cambiarNube } from '../components/consultron/Modelo';
import ElegirMateria, { ElegirSeccion, NUEVA, seccionInicial, useMaterias, useSeccionesDelCampus } from '../components/ElegirMateria';
import Esquinas from '../components/pizarron/Esquinas';
import Lectura from '../components/pizarron/Lectura';
import Resultado, { ANCHO_BORRADO, ANCHO_MAX, ANCHO_MIN, ANCHO_REPASO } from '../components/pizarron/Resultado';
import { guardarArchivos } from '../components/SumarCosas';
import { useUI } from '../components/ui';
import { cargarMaterias } from '../lib/campus';
import { adjuntar } from '../lib/consultron/adjuntar';
import { quedanHoy, usePermisosNube } from '../lib/consultron/nube';
import { claveDeFecha } from '../lib/datos';
import { armarSemana, cuatrimestreQueSigue } from '../lib/facultad';
import { cargarHorarios } from '../lib/horarioDatos';
import { derEnTexto } from '../lib/laboratorio/der/modelo';
import { agregarAlProyecto, crearProyecto } from '../lib/laboratorio/guardado';
import { abrirEnElLaboratorio, borradorEscrito, llevarAlLaboratorio } from '../lib/laboratorio/pendiente';
import { useMio, usuarioActual } from '../lib/mio';
import { guardarBorrador, guardarFotoEnBorrador, leerBorrador } from '../lib/pizarron/borrador';
import { claseDeAhora, nombreDelPdf } from '../lib/pizarron/clase';
import { abrirFoto, procesarFoto, sePuede, soltarFoto } from '../lib/pizarron/fotos';
import { leerConGemini } from '../lib/pizarron/leer';
import { lineasDeLectura, sinTexto } from '../lib/pizarron/lectura';
import { abiertaDeLaClase, fotosDeLaClase, guardarFotosDeLaClase } from '../lib/pizarron/sesion';
import { esAgregada, seccionesDondeSumar, sumarDondeSea } from '../lib/propias';
import { tituloDe, useSeo } from '../lib/seo';
import { useConsulta } from '../lib/useConsulta';
import './pizarron.css';

// Photos of the board: each one comes out straight and clean, and the photos of a class go in one PDF to a section of
// the course the student has now (by Tu horario), with their text hidden under each page to search it. With «Usar
// Gemini», Gemini reads each photo (leer.js): its text, formulas, code, tables and DER, each to take where it's used.
// The photos live in the memory of the tab until they're saved (sesion.js): they go to Google only to be read, and
// nothing of them is kept anywhere but the student's own course, in this browser.

/** Photos of one class, at most: each is kept open in memory until it's saved. */
const MAX_FOTOS = 30;
const NOMBRE_SECCION = 'Fotos del pizarrón';
// Each option with its drawing, on a 24 grid in the line of the site's menu.
const MODOS = [
  { valor: 'hoja', texto: 'Hoja blanca', dibujo: <path d="M6.5 3.5h7.5l4 4v13h-11.5zM14 3.5v4h4M9.5 12h5M9.5 15.5h5" /> },
  { valor: 'pizarron', texto: 'Pizarrón', soloVerde: true, dibujo: <path d="M3.5 4.5h17v11.5h-17zM9 20l1.5-4M15 20l-1.5-4M7 12c1.5-3.5 3-3.5 4.5-.5s3 2.5 5.5-1.5" /> },
  { valor: 'original', texto: 'Sin limpiar', dibujo: <path d="M4 5.5h16v13H4zM4 15.5l4.5-4.5 4 4 2.5-2.5 5 5M15.5 9.5h.01" /> },
];
// How chalk or marker comes out (TIZAS of limpiar.js), cleaned.
// Sparkles: «Auto» and «Arreglar todo».
const DESTELLOS = <path d="M10 4l1.6 4.9L16.5 10.5l-4.9 1.6L10 17l-1.6-4.9L3.5 10.5l4.9-1.6zM18 14l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />;
const TIZAS = [
  { valor: 'auto', texto: 'Auto', dibujo: DESTELLOS },
  { valor: 'como', texto: 'Como está', dibujo: <path d="M4 17h.01M7 15.5h.01M10.5 14h.01M14 12h.01M17 10.5h.01M20 9h.01" strokeWidth="2.6" /> },
  { valor: 'remarcada', texto: 'Remarcada', dibujo: <path d="M4 17c5-1 10.5-4 16-8" strokeWidth="2.6" /> },
  { valor: 'birome', texto: 'Birome', dibujo: <path d="M15 4l5 5-10.5 10.5H4.5v-5zM12.5 6.5l5 5M4.5 19.5l3-3" /> },
];
// What limpiar.js needs of a photo besides its corners.
// «Barrer toda la foto», as one more stroke: Deshacer takes it back like the others.
const BARRER_TODO = { barre: true, todo: true };
// «Arreglar todo»: cleaned on white if it wasn't, Auto, and a stroke that reads long faint lines stronger and sweeps
// the whole board. The stroke keeps how the photo was (`antes`), so undoing it leaves the photo as it was.
const comoLimpiar = (f) => ({ esquinas: f.esquinas, tipo: f.tipo, modo: f.modo, tiza: f.tiza ?? 'como', intensidad: f.intensidad ?? 0.5, grosor: f.grosor ?? 0.5, repasos: f.repasos ?? [] });

// The finger's tools, drawn as on the board of En vivo (comun.jsx).
const HERRAMIENTAS = [
  { valor: 'repasar', texto: 'Repasar', dibujo: <path d="M4 20l1-5L16 4l4 4L9 19zM14 6l4 4" /> },
  { valor: 'barrer', texto: 'Barrer', dibujo: <path d="M20 4l-6 6M10.5 8.5l5 5-4 4.5c-1 1-2.6 1-3.6 0L5 15.1c-1-1-1-2.6 0-3.6zM6.5 13.5L5 19.5M9 16l-1.5 4.5" /> },
  { valor: 'borrar', texto: 'Borrar', dibujo: <path d="M8 20h12M4.5 14.5l9-9a2 2 0 0 1 3 0l3 3a2 2 0 0 1 0 3L13 18H8z M9 10l6 6" /> },
];
const DESHACER = <path d="M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" />;
const Dibujo = ({ children }) => (
  <svg className="pizarron__icono" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    {children}
  </svg>
);

// What a photo is cleaned with now: with «Automático», what it chose (the worker says it with each result); moving a
// slider from there leaves «Automático» with what it had chosen.
const enUso = (f) => {
  const e = f.tiza === 'auto' ? f.resultado?.elegido : null;
  return e ? { tiza: e.tiza, intensidad: e.intensidad, grosor: e.grosor } : { tiza: f.tiza ?? 'como', intensidad: f.intensidad ?? 0.5, grosor: f.grosor ?? 0.5 };
};
const NOMBRE_TIZA = { como: 'dejarla como está', remarcada: '«Remarcada»', birome: '«Birome»' };
function notaDeAuto(f) {
  const e = f.tiza === 'auto' ? f.resultado?.elegido : null;
  if (!e) return null;
  return `Eligió ${NOMBRE_TIZA[e.tiza] ?? NOMBRE_TIZA.como}${e.intensidad > 0.5 ? ', con más intensidad' : ''}.`;
}

// A slider from 0 to 1 that cleans the photo again once it stops (ajustarAlParar).
function Barra({ etiqueta, valor = 0.5, desde, hasta, alCambiar }) {
  const n = Math.round(valor * 100);
  return (
    <label className="pizarron__intensidad">
      <span className="pizarron__leyenda">{etiqueta}</span>
      <span className="pizarron__barra">
        <span aria-hidden="true">{desde}</span>
        <input type="range" min="0" max="100" step="5" value={n} aria-valuetext={`${n} de 100`} onChange={(e) => alCambiar(Number(e.target.value) / 100)} />
        <span aria-hidden="true">{hasta}</span>
      </span>
    </label>
  );
}
const TIPOS = [
  { valor: 'verde', texto: 'Verde o negro', dibujo: <rect x="3.5" y="5.5" width="17" height="13" rx="1" className="pizarron__lleno" /> },
  { valor: 'blanco', texto: 'Blanco', dibujo: <rect x="3.5" y="5.5" width="17" height="13" rx="1" /> },
];
const VISTAS = [
  { valor: 'resultado', texto: 'Cómo queda', dibujo: <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" /> },
  { valor: 'bordes', texto: 'Bordes', dibujo: <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" /> },
];

let siguiente = 0;
const idNuevo = () => `f${Date.now().toString(36)}${(++siguiente).toString(36)}`;

/** The week's classes, for the course of now: nothing if the campus or the timetable don't come. */
function useClases() {
  const mio = useMio();
  const { datos } = useConsulta(
    () =>
      Promise.all([cargarHorarios(), cargarMaterias()])
        .then(([datos, materias]) => ({ datos, cursos: materias.enCurso }))
        .catch(() => null),
    [],
    { alInstante: true },
  );
  return useMemo(() => (datos ? armarSemana({ ...datos, mio, cuatrimestre: cuatrimestreQueSigue(claveDeFecha(new Date())) }).clases : []), [datos, mio]);
}

function Opciones({ nombre, opciones, valor, alElegir, etiqueta, nota }) {
  return (
    <fieldset className="pizarron__opciones">
      <legend className="pizarron__leyenda">{etiqueta}</legend>
      <div className="pizarron__segmentos">
        {opciones.map((o) => (
          <label key={o.valor} className="pizarron__segmento">
            <input type="radio" name={nombre} value={o.valor} checked={valor === o.valor} onChange={() => alElegir(o.valor)} />
            <span>
              {o.dibujo && <Dibujo>{o.dibujo}</Dibujo>}
              {o.texto}
            </span>
          </label>
        ))}
      </div>
      {nota && <p className="pizarron__elegido">{nota}</p>}
    </fieldset>
  );
}

function BotonesDeFoto({ alElegir, principal = true }) {
  const id = useId();
  const tomar = (e) => {
    const lista = [...(e.target.files ?? [])];
    e.target.value = '';
    if (lista.length) alElegir(lista);
  };
  return (
    <div className="pizarron__tomar pizarron__botones">
      <input id={`${id}-camara`} className="solo-lectores" type="file" accept="image/*" capture="environment" onChange={tomar} />
      <label htmlFor={`${id}-camara`} className={`boton${principal ? '' : ' boton--secundario'}`}>Sacar una foto</label>
      <input id={`${id}-galeria`} className="solo-lectores" type="file" accept="image/*" multiple onChange={tomar} />
      <label htmlFor={`${id}-galeria`} className="boton boton--secundario">Elegir de la galería</label>
    </div>
  );
}

export default function Pizarron() {
  useSeo({ titulo: tituloDe('Escáner'), descripcion: 'Sacale una foto al pizarrón y queda derecha, limpia y guardada en tu materia.', noindex: true });
  const { avisar, confirmar } = useUI();
  const navigate = useNavigate();
  const permisos = usePermisosNube();
  const quedan = quedanHoy(permisos);
  const mio = useMio();
  const materias = useMaterias(mio.propias.filter((p) => !esAgregada(p)));
  const clases = useClases();
  const clase = useMemo(() => claseDeAhora(clases), [clases]);
  // A reading left halfway when the student went to another screen starts over.
  const [fotos, setFotos] = useState(() => fotosDeLaClase().map((f) => (f.lectura?.estado === 'leyendo' ? { ...f, lectura: null } : f)));
  const [abierta, setAbierta] = useState(abiertaDeLaClase);
  const [vista, setVista] = useState('resultado');
  const [materia, setMateria] = useState(null);
  const [elegida, setElegida] = useState(false);
  const [seccion, setSeccion] = useState(NUEVA);
  const [leerTexto, setLeerTexto] = useState(true);
  const [guardando, setGuardando] = useState('');
  const [error, setError] = useState('');
  const [hecho, setHecho] = useState(null);
  const [errorMateria, setErrorMateria] = useState('');
  const [anuncio, setAnuncio] = useState('');
  // The finger's tools float down on the screen: the page leaves their height free under it, so nothing stays covered.
  const [altoHerramientas, setAltoHerramientas] = useState(0);
  const midiendo = useRef(null);
  const herramientas = useCallback((el) => {
    midiendo.current?.disconnect();
    midiendo.current = null;
    if (!el) {
      setAltoHerramientas(0);
      return;
    }
    const ro = new ResizeObserver(() => setAltoHerramientas(el.offsetHeight));
    ro.observe(el);
    midiendo.current = ro;
  }, []);
  const volverATira = useRef(false);
  const tira = useRef(null);
  const form = useRef(null);
  const titulo = useRef(null);
  const editor = useRef(null);
  const alumno = usuarioActual();
  // Whether the draft in this browser (borrador.js) keeps them: without it, closing the tab loses them.
  const [enDisco, setEnDisco] = useState(true);
  // The draft is written only once what it had is back on the screen: before, an empty list would delete it.
  const restaurado = useRef(fotosDeLaClase().length > 0);
  // Asked once, even when React runs the opening twice.
  const pidioBorrador = useRef(fotosDeLaClase().length > 0);
  // The photos stay in the tab while the student goes to another screen, and in the draft for when the tab closes.
  useEffect(() => {
    guardarFotosDeLaClase(fotos, abierta);
  }, [fotos, abierta]);
  useEffect(() => {
    if (!restaurado.current) return undefined;
    const t = setTimeout(() => guardarBorrador(alumno, fotos).then((ok) => ok || setEnDisco(false)), 400);
    return () => clearTimeout(t);
  }, [fotos, alumno]);
  // Without the draft, closing or reloading the tab, the browser asks.
  useEffect(() => {
    if (enDisco || !fotos.length) return undefined;
    const aviso = (e) => e.preventDefault();
    window.addEventListener('beforeunload', aviso);
    return () => window.removeEventListener('beforeunload', aviso);
  }, [fotos.length, enDisco]);

  // The course of the class going on, until the student picks one.
  const deAhora = clase?.cursoId ?? null;
  const materiaVista = elegida ? materia : deAhora;
  const secciones = seccionesDondeSumar(mio, materiaVista);
  const seccionesDelCampus = useSeccionesDelCampus(materiaVista, materias.nombres.get(materiaVista));
  const seccionVista = elegida ? seccion : seccionInicial(secciones, NOMBRE_SECCION);

  const cambiar = useCallback((id, cambios) => setFotos((fs) => fs.map((f) => (f.id === id ? { ...f, ...(typeof cambios === 'function' ? cambios(f) : cambios) } : f))), []);

  const procesar = useCallback(
    async (foto) => {
      const vuelta = (foto.vuelta ?? 0) + 1;
      cambiar(foto.id, { vuelta, procesando: true });
      try {
        const r = await procesarFoto(foto.id, { ...comoLimpiar(foto), lado: 2000 });
        const url = URL.createObjectURL(r.blob);
        setFotos((fs) =>
          fs.map((f) => {
            if (f.id !== foto.id) return f;
            // A later change already asked for another: this one is old.
            if (f.vuelta !== vuelta) {
              URL.revokeObjectURL(url);
              return f;
            }
            if (f.resultado) URL.revokeObjectURL(f.resultado.url);
            return { ...f, procesando: false, fallo: false, resultado: { ...r, url } };
          }),
        );
        // A different text each time, so a screen reader says it again.
        setAnuncio((a) => (a === 'Foto lista.' ? 'Foto lista' : 'Foto lista.'));
      } catch {
        cambiar(foto.id, { procesando: false, fallo: true });
      }
    },
    [cambiar],
  );

  const sumarFotos = async (todas) => {
    setHecho(null);
    setError('');
    const lista = todas.slice(0, Math.max(0, MAX_FOTOS - fotos.length));
    if (lista.length < todas.length) avisar(`Entran hasta ${MAX_FOTOS} fotos por clase. Guardá estas y seguí con otras.`, 'error');
    if (!lista.length) return;
    const nuevas = lista.map((archivo) => ({ id: idNuevo(), archivo, nombre: archivo.name, url: URL.createObjectURL(archivo), abriendo: true }));
    setFotos((fs) => [...fs, ...nuevas]);
    for (const n of nuevas) await abrirUna(n, nuevas.length === 1);
  };

  // `previo`: what the draft kept of it (borrador.js), to show it as the student left it.
  const abrirUna = async (n, sola, previo = null) => {
    try {
      const d = await abrirFoto(n.id, n.archivo);
      if (!previo) guardarFotoEnBorrador(alumno, n.id, n.archivo).then((ok) => ok || setEnDisco(false));
      // It opens as it was taken, only straightened: «Arreglar todo» does the rest.
      const detectado = { tipo: d.tipo, esquinas: d.esquinas, seguro: d.seguro, modo: 'original', tiza: 'auto', lectura: null };
      const deAntes = previo?.esquinas ? { tipo: previo.tipo ?? d.tipo, esquinas: previo.esquinas, seguro: true, modo: previo.modo ?? 'hoja', tiza: previo.tiza, intensidad: previo.intensidad, grosor: previo.grosor, repasos: previo.repasos, lectura: previo.lectura } : null;
      const foto = { ...n, abriendo: false, archivo: null, ancho: d.ancho, alto: d.alto, ...(deAntes ?? detectado) };
      cambiar(n.id, foto);
      procesar(foto);
      // The first one that needs its corners opens; one photo alone opens too. Both on its corners, to check them first.
      if (!deAntes && (!d.seguro || sola)) {
        setAbierta(n.id);
        setVista('bordes');
      }
    } catch {
      URL.revokeObjectURL(n.url);
      setFotos((fs) => fs.filter((f) => f.id !== n.id));
      avisar('No se pudo abrir esa foto. Probá con otra.', 'error');
    }
  };

  // Back on the screen, what was being done when the student left goes on: what the photos of before are missing.
  // A new tab finds the ones of the draft, as they were left.
  useEffect(() => {
    const quedaron = fotosDeLaClase().filter((f) => (f.abriendo && f.archivo) || f.procesando);
    Promise.resolve().then(() => {
      for (const f of quedaron) {
        if (f.abriendo) abrirUna(f, false);
        else procesar(f);
      }
    });
    if (!pidioBorrador.current) {
      pidioBorrador.current = true;
      leerBorrador(alumno).then(async (lista) => {
        restaurado.current = true;
        if (!lista.length) {
          // Nothing kept: what was taken meanwhile goes to the draft now.
          setFotos((fs) => [...fs]);
          return;
        }
        const viejas = lista.map(({ id, ficha, archivo }) => ({ id, archivo, nombre: archivo.name, url: URL.createObjectURL(archivo), abriendo: true, previo: ficha }));
        setFotos((fs) => [...viejas.filter((v) => !fs.some((f) => f.id === v.id)), ...fs]);
        // Only for screen readers: the strip already shows them, and a notice would cover the screen.
        setAnuncio(viejas.length === 1 ? 'Volvió la foto que no guardaste.' : `Volvieron las ${viejas.length} fotos que no guardaste.`);
        for (const n of viejas) await abrirUna(n, false, n.previo);
      });
    }
    // Only when the screen opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The board as Gemini reads it best: straight, without cleaning (leer.js).
  const derecha = async (f, lado = 1600) => (await procesarFoto(f.id, { esquinas: f.esquinas, tipo: f.tipo, modo: 'original', lado, calidad: 0.85 })).blob;

  // The photos being read: a second touch on «Pasar a texto» would spend another question.
  const leyendo = useRef(new Set());
  const leer = async (f) => {
    if (leyendo.current.has(f.id)) return;
    if (quedan === 0) {
      avisar('Por hoy no te quedan preguntas con Gemini.', 'error');
      return;
    }
    leyendo.current.add(f.id);
    try {
      if (!permisos.todo && !(await cambiarNube(confirmar, 'todo', true, { sinModelo: true }))) return;
      cambiar(f.id, { lectura: { estado: 'leyendo' } });
      setAnuncio('Gemini está leyendo la foto.');
      let lectura;
      try {
        const r = await leerConGemini(await derecha(f));
        lectura = r.texto ? { estado: 'lista', texto: r.texto } : { estado: 'error', error: r.error || 'Gemini no responde. Probá de nuevo en un rato.' };
      } catch {
        lectura = { estado: 'error', error: 'No se pudo preparar la foto. Probá de nuevo.' };
      }
      cambiar(f.id, { lectura });
      setAnuncio(lectura.estado === 'lista' ? 'Ya está lo que dice la foto.' : lectura.error);
    } finally {
      leyendo.current.delete(f.id);
    }
  };

  // Consultron with the photo attached: the question is the student's. The photos wait here.
  const preguntar = async (f) => {
    try {
      adjuntar([new File([await derecha(f)], `Pizarrón ${fotos.indexOf(f) + 1}.jpg`, { type: 'image/jpeg' })]);
      navigate('/consultron');
    } catch {
      avisar('No se pudo preparar la foto. Probá de nuevo.', 'error');
    }
  };

  const copiar = async (texto, hecho) => {
    try {
      await navigator.clipboard.writeText(texto);
      avisar(hecho);
    } catch {
      avisar('No se pudo copiar. Probá de nuevo.', 'error');
    }
  };

  const alLaboratorio = async (codigo, lenguaje) => {
    if (borradorEscrito() && !(await confirmar({ titulo: '¿Reemplazar tu borrador?', texto: 'En el Laboratorio tenés código sin guardar. Se cambia por este.', boton: 'Reemplazar', peligro: true }))) return;
    llevarAlLaboratorio({ codigo, lenguaje, apunte: 'Escáner' });
    navigate('/laboratorio');
  };

  // The DER goes to the Laboratorio as a project of SQL of its own, with the diagram open.
  const alDer = (der) => {
    const nombre = `Pizarrón ${nombreDelPdf(new Date()).replace(/^Pizarrón del |\.pdf$/g, '')}`;
    const proyecto = crearProyecto({ nombre, lenguaje: 'sql', materia: materiaVista });
    const archivo = proyecto && agregarAlProyecto(proyecto, { nombre: 'diagrama', ext: 'der', codigo: derEnTexto(der) });
    if (!archivo) {
      avisar('No se pudo crear el proyecto. Puede que tengas muchos o que el navegador no tenga más lugar.', 'error');
      return;
    }
    abrirEnElLaboratorio(archivo);
    navigate('/laboratorio');
  };

  const foto = fotos.find((f) => f.id === abierta) ?? null;
  const numero = foto ? fotos.indexOf(foto) + 1 : 0;
  useEffect(() => {
    if (abierta) editor.current?.focus();
    // Closing the photo, the focus goes back to the photos of the class.
    else if (volverATira.current) tira.current?.focus();
    volverATira.current = false;
  }, [abierta]);
  const cerrar = () => {
    volverATira.current = true;
    setAbierta(null);
  };

  // A cleaning option chosen from «Bordes» goes to «Cómo queda», to see it.
  const ajustarYVer = (cambios) => {
    ajustar(cambios);
    setVista('resultado');
  };
  const ajustar = (cambios) => {
    // What «Barrer toda la foto» was showing is of the photo as it was.
    if (prueba) soltarPrueba();
    const nueva = { ...foto, ...cambios };
    cambiar(foto.id, cambios);
    procesar(nueva);
  };
  // The intensity slider moves many times a second: the photo is cleaned again once it stops.
  const reloj = useRef(null);
  const ajustarAlParar = (cambios) => {
    const nueva = { ...foto, ...cambios };
    cambiar(foto.id, cambios);
    clearTimeout(reloj.current);
    reloj.current = setTimeout(() => procesar(nueva), 250);
  };
  useEffect(() => () => clearTimeout(reloj.current), []);
  // The photo being gone over or wiped with a finger, if any: { id, herramienta ('repasar' or 'borrar') }.
  const [dedo, setDedo] = useState(null);
  // How wide each tool draws, for every photo of the visit.
  const [anchos, setAnchos] = useState({ repasar: ANCHO_REPASO, borrar: ANCHO_BORRADO, barrer: ANCHO_BORRADO });
  // «Barrer toda la foto» first shows in red what it would take: { id, resultado } until it's taken or not.
  const [prueba, setPrueba] = useState(null);
  const [probando, setProbando] = useState(false);
  const soltarPrueba = () => {
    if (prueba) URL.revokeObjectURL(prueba.resultado.url);
    setPrueba(null);
  };
  const probarBarrido = async () => {
    setProbando(true);
    try {
      const r = await procesarFoto(foto.id, { ...comoLimpiar(foto), repasos: [...(foto.repasos ?? []), BARRER_TODO], marcar: true, lado: 2000 });
      if (!r.marcados) {
        setAnuncio('No hay nada suelto para barrer.');
        return;
      }
      setPrueba({ id: foto.id, resultado: { ...r, url: URL.createObjectURL(r.blob) } });
      setAnuncio('Lo que se va está en rojo.');
    } catch {
      setAnuncio('No se pudo barrer. Probá de nuevo.');
    } finally {
      setProbando(false);
    }
  };
  const arreglada = foto?.modo !== 'original' && foto?.tiza === 'auto' && Boolean(foto?.repasos?.some((r) => r.auto));
  const arreglarTodo = () => {
    const antes = { modo: foto.modo, tiza: foto.tiza ?? 'como' };
    const repasos = [...(foto.repasos ?? []).filter((r) => !r.auto), { auto: true, antes }];
    ajustar({ modo: foto.modo === 'original' ? 'hoja' : foto.modo, tiza: 'auto', repasos });
    setAnuncio('Foto arreglada. Deshacer la vuelve atrás.');
  };
  // The last stroke taken back; if it was «Arreglar todo», the photo goes back to how it was.
  const deshacer = () => {
    const ultimo = foto.repasos[foto.repasos.length - 1];
    const antes = ultimo?.auto && ultimo.antes ? { modo: ultimo.antes.modo, tiza: ultimo.antes.tiza } : {};
    ajustar({ ...antes, repasos: foto.repasos.slice(0, -1) });
  };
  const barrerTodo = () => {
    soltarPrueba();
    ajustar({ repasos: [...(foto.repasos ?? []), BARRER_TODO] });
  };
  // Ctrl+Z takes back the last stroke of the open photo, unless something is being typed or a window is open.
  const deshacerTrazo = useRef(null);
  useEffect(() => {
    deshacerTrazo.current = foto?.repasos?.length ? deshacer : null;
  });
  useEffect(() => {
    const alTocar = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== 'z' || !deshacerTrazo.current) return;
      if (e.target.closest?.('textarea, [contenteditable], [role="dialog"], dialog, input:not([type="range"], [type="radio"], [type="checkbox"])')) return;
      e.preventDefault();
      deshacerTrazo.current();
      setAnuncio((a) => (a === 'Trazo deshecho.' ? 'Trazo deshecho' : 'Trazo deshecho.'));
    };
    addEventListener('keydown', alTocar);
    return () => removeEventListener('keydown', alTocar);
  }, []);

  const borrar = async (id) => {
    const f = fotos.find((x) => x.id === id);
    if (!f) return;
    if (!(await confirmar({ titulo: '¿Borrar esta foto?', boton: 'Borrar', peligro: true }))) return;
    URL.revokeObjectURL(f.url);
    if (f.resultado) URL.revokeObjectURL(f.resultado.url);
    soltarFoto(id);
    setFotos((fs) => fs.filter((x) => x.id !== id));
    if (abierta === id) setAbierta(null);
    titulo.current?.focus();
  };

  const guardar = async (e) => {
    e.preventDefault();
    if (guardando) return;
    if (materiaVista === null) {
      setErrorMateria('Elegí una materia.');
      form.current?.querySelector('select')?.focus();
      return;
    }
    const fallida = fotos.findIndex((f) => f.fallo && !f.procesando);
    if (fallida >= 0) {
      setError(`La foto ${fallida + 1} no se pudo arreglar. Abrila y mové las esquinas, o borrala.`);
      return;
    }
    if (fotos.some((f) => !f.resultado || f.procesando)) {
      setError('Esperá a que terminen las fotos.');
      return;
    }
    if (fotos.some((f) => f.lectura?.estado === 'leyendo')) {
      setError('Esperá a que Gemini termine de leer.');
      return;
    }
    setError('');
    const fecha = new Date();
    const nombre = nombreDelPdf(fecha);
    try {
      const paginas = [];
      for (const [i, f] of fotos.entries()) {
        setGuardando(fotos.length === 1 ? 'Preparando la foto' : `Preparando la foto ${i + 1} de ${fotos.length}`);
        const r = await procesarFoto(f.id, { ...comoLimpiar(f), lado: 2400 });
        // What Gemini read goes under the page. Without it, Gemini reads it now if it can, and else the photo reader.
        let leido = f.lectura?.estado === 'lista' ? f.lectura.texto : null;
        let lineas = [];
        if (leido === null && leerTexto) {
          setGuardando(fotos.length === 1 ? 'Leyendo el texto' : `Leyendo el texto de la foto ${i + 1} de ${fotos.length}`);
          if (permisos.todo && quedanHoy() !== 0) {
            const g = await leerConGemini(await derecha(f)).catch(() => ({}));
            if (g.texto) {
              leido = g.texto;
              cambiar(f.id, { lectura: { estado: 'lista', texto: g.texto } });
            }
          }
          if (leido === null) {
            const { leerFoto } = await import('../lib/consultron/ocr');
            lineas = (await leerFoto(r.blob, { lineas: true }).catch(() => ({ lineas: [] }))).lineas;
          }
        }
        if (leido !== null && !sinTexto(leido)) lineas = lineasDeLectura(leido);
        paginas.push({ ...r, lineas });
      }
      setGuardando('Armando el PDF');
      const { armarPdf } = await import('../lib/pizarron/pdf');
      const bytes = await armarPdf(paginas, { titulo: nombre.replace(/\.pdf$/, '') });
      const archivo = new File([bytes], nombre, { type: 'application/pdf' });
      setGuardando('Guardando');
      const { bloques, avisos } = await guardarArchivos([archivo]);
      if (!bloques.length) throw new Error(avisos[0] || 'No se pudo guardar el PDF.');
      const enLaSeccion = seccionVista === NUEVA ? NOMBRE_SECCION : ([...secciones, ...seccionesDelCampus].find((c) => c.id === seccionVista)?.nombre ?? NOMBRE_SECCION);
      if (!sumarDondeSea(materiaVista, seccionVista === NUEVA ? null : seccionVista, NOMBRE_SECCION, bloques)) throw new Error('No entra en esa sección. Probá con otra.');
      for (const f of fotos) {
        URL.revokeObjectURL(f.url);
        if (f.resultado) URL.revokeObjectURL(f.resultado.url);
        soltarFoto(f.id);
      }
      setFotos([]);
      setAbierta(null);
      setHecho({ materia: materiaVista, nombre: materias.nombres.get(materiaVista) ?? 'tu materia', seccion: enLaSeccion, archivo: nombre });
    } catch (err) {
      setError(err?.message || 'No se pudo guardar el PDF.');
    } finally {
      setGuardando('');
    }
  };

  if (!sePuede()) {
    return (
      <article className="contenedor pagina pizarron" aria-labelledby="pizarron-titulo">
        <h1 id="pizarron-titulo">Escáner</h1>
        <div className="mensaje mensaje--error" role="alert">
          <p>Este navegador no puede arreglar fotos. Probá con Chrome, Edge, Firefox o un Safari actualizado.</p>
        </div>
      </article>
    );
  }

  const nombreDeAhora = deAhora !== null ? (materias.nombres.get(deAhora) ?? clase?.nombre) : null;

  return (
    <article className="contenedor pagina pizarron" aria-labelledby="pizarron-titulo" style={altoHerramientas ? { '--alto-herramientas': `${altoHerramientas}px` } : undefined}>
      <h1 id="pizarron-titulo" ref={titulo} tabIndex={-1}>Escáner</h1>
      <p className="pizarron__bajada">Sacale una foto al pizarrón y queda derecha y limpia. Las de una clase se guardan juntas en un PDF de tu materia.</p>

      {/* Always there, so screen readers say what comes into it. */}
      <div role="status">
        {hecho && (
        <div className="mensaje mensaje--ok pizarron__hecho">
          <p>
            «{hecho.archivo}» quedó en{' '}
            <Link to={typeof hecho.materia === 'string' ? `/propias/${hecho.materia}` : `/materias/${hecho.materia}`}>{hecho.nombre}</Link>, en «{hecho.seccion}».
          </p>
        </div>
        )}
      </div>
      <span className="solo-lectores" aria-live="polite">{anuncio}</span>

      {!fotos.length && (
        <section className="pizarron__vacio" aria-label="Sacar fotos">
          {nombreDeAhora && <p className="pizarron__ahora">Ahora tenés {nombreDeAhora}. Las fotos van ahí.</p>}
          <BotonesDeFoto alElegir={sumarFotos} />
        </section>
      )}

      {foto && (
        <section className="pizarron__editor" aria-labelledby="pizarron-editor" ref={editor} tabIndex={-1}>
          <h2 id="pizarron-editor" className="pizarron__subtitulo">{fotos.length > 1 ? `Foto ${numero} de ${fotos.length}` : 'Tu foto'}</h2>
          {!foto.seguro && vista === 'bordes' && <p className="pizarron__aviso">No encontré bien el pizarrón. Mové las esquinas hasta sus bordes.</p>}
          {vista === 'bordes' && <p className="pizarron__pista">Arrastrá cada esquina, o tocala y después tocá dónde va.</p>}
          <Opciones nombre="vista" etiqueta="Ver" valor={vista} alElegir={setVista} opciones={VISTAS} />
          <div className="pizarron__escenario" aria-busy={foto.abriendo || foto.procesando ? 'true' : undefined}>
            {foto.abriendo ? (
              <div className="pizarron__esqueleto" />
            ) : vista === 'bordes' ? (
              <Esquinas url={foto.url} ancho={foto.ancho} alto={foto.alto} esquinas={foto.esquinas} alCambiar={(esquinas) => cambiar(foto.id, { esquinas })} alSoltar={() => procesar(foto)} />
            ) : foto.fallo ? (
              <p className="mensaje mensaje--error" role="alert">No se pudo arreglar esta foto. Probá mover las esquinas.</p>
            ) : prueba?.id === foto.id ? (
              <Resultado resultado={prueba.resultado} />
            ) : foto.resultado ? (
              <Resultado
                resultado={foto.resultado}
                procesando={foto.procesando}
                herramienta={dedo?.id === foto.id && foto.modo !== 'original' ? dedo.herramienta : null}
                anchoTrazo={dedo?.id === foto.id ? anchos[dedo.herramienta] : undefined}
                alSumar={(repaso) => ajustar({ repasos: [...(foto.repasos ?? []), repaso] })}
              />
            ) : (
              <div className="pizarron__esqueleto" style={{ aspectRatio: `${foto.ancho} / ${foto.alto}` }} />
            )}
          </div>
          {!foto.abriendo && prueba?.id !== foto.id && (
            <div className="pizarron__arreglar">
              <button type="button" className="boton" disabled={arreglada || foto.procesando} onClick={() => (arreglarTodo(), setVista('resultado'))}>
                <Dibujo>{DESTELLOS}</Dibujo>
                {arreglada ? 'Arreglada' : 'Arreglar todo'}
              </button>
              <p className="pizarron__nota">La limpia, repasa lo que casi no se ve y saca lo que sobra.</p>
            </div>
          )}
          {prueba?.id === foto.id && (
            <section className="pizarron__panel pizarron__repasar pizarron__herramientas" aria-labelledby="pizarron-prueba" ref={herramientas}>
              <h3 id="pizarron-prueba" className="pizarron__panel-titulo">
                Lo que está en rojo se va
              </h3>
              <div className="pizarron__botones">
                <button type="button" className="boton" onClick={barrerTodo}>
                  Sacarlo
                </button>
                <button type="button" className="boton boton--secundario" onClick={soltarPrueba}>
                  Dejarlo
                </button>
              </div>
            </section>
          )}
          {vista === 'resultado' && !foto.abriendo && foto.modo !== 'original' && prueba?.id !== foto.id && (
            <section className="pizarron__panel pizarron__repasar pizarron__herramientas" aria-labelledby="pizarron-dedo" ref={herramientas}>
              <h3 id="pizarron-dedo" className="pizarron__panel-titulo">
                Retocar con el dedo
              </h3>
              <div className="pizarron__botones">
                {HERRAMIENTAS.map(({ valor: h, texto, dibujo }) => (
                  <button
                    key={h}
                    type="button"
                    className="boton boton--secundario"
                    aria-pressed={dedo?.id === foto.id && dedo.herramienta === h}
                    onClick={() => setDedo(dedo?.id === foto.id && dedo.herramienta === h ? null : { id: foto.id, herramienta: h })}
                  >
                    <Dibujo>{dibujo}</Dibujo>
                    {texto}
                  </button>
                ))}
                <button type="button" className="boton boton--secundario" disabled={!foto.repasos?.length} aria-keyshortcuts="Control+Z" onClick={deshacer}>
                  <Dibujo>{DESHACER}</Dibujo>
                  Deshacer
                </button>
              </div>
              {dedo?.id === foto.id && (
                <Barra
                  etiqueta={{ borrar: 'Ancho de la goma', barrer: 'Ancho de la escoba' }[dedo.herramienta] ?? 'Ancho del lápiz'}
                  valor={(anchos[dedo.herramienta] - ANCHO_MIN) / (ANCHO_MAX - ANCHO_MIN)}
                  desde="Fino"
                  hasta="Ancho"
                  alCambiar={(v) => setAnchos((a) => ({ ...a, [dedo.herramienta]: ANCHO_MIN + v * (ANCHO_MAX - ANCHO_MIN) }))}
                />
              )}
              {dedo?.id === foto.id && (
                <p className="pizarron__pista">
                  {{
                    borrar: 'Pasá el dedo por lo que querés sacar.',
                    barrer: 'Pasá el dedo por donde está sucio. Se va lo que no es escritura.',
                  }[dedo.herramienta] ?? 'Pasá el dedo por una línea que casi no se ve. La sigue y la remarca.'}
                </p>
              )}
              {dedo?.id === foto.id && dedo.herramienta === 'barrer' && (
                <button type="button" className="boton boton--secundario pizarron__barrer-todo" disabled={probando || foto.procesando} onClick={probarBarrido}>
                  {probando ? 'Buscando…' : 'Barrer toda la foto'}
                </button>
              )}
            </section>
          )}
          {!foto.abriendo && (
            <section className="pizarron__panel" aria-labelledby="pizarron-limpieza">
              <h3 id="pizarron-limpieza" className="pizarron__panel-titulo">
                Cómo se limpia
              </h3>
              <div className="pizarron__ajustes">
                <Opciones nombre="modo" etiqueta="Limpieza" valor={foto.modo} alElegir={(modo) => ajustarYVer({ modo })} opciones={MODOS.filter((m) => !m.soloVerde || foto.tipo === 'verde')} />
                {foto.modo !== 'original' && (
                  <Opciones nombre="tiza" etiqueta={foto.tipo === 'blanco' ? 'Fibrón' : 'Tiza'} valor={foto.tiza ?? 'como'} alElegir={(tiza) => ajustarYVer({ tiza })} opciones={TIZAS} nota={notaDeAuto(foto)} />
                )}
                {foto.modo !== 'original' && (
                  <Barra etiqueta="Intensidad" valor={enUso(foto).intensidad} desde="Suave" hasta="Fuerte" alCambiar={(intensidad) => ajustarAlParar({ ...enUso(foto), intensidad })} />
                )}
                {foto.modo !== 'original' && enUso(foto).tiza === 'birome' && (
                  <Barra etiqueta="Grosor" valor={enUso(foto).grosor} desde="Fino" hasta="Grueso" alCambiar={(grosor) => ajustarAlParar({ ...enUso(foto), grosor })} />
                )}
                <Opciones nombre="tipo" etiqueta="Color del pizarrón" valor={foto.tipo} alElegir={(tipo) => ajustarYVer({ tipo, modo: tipo === 'blanco' && foto.modo === 'pizarron' ? 'hoja' : foto.modo })} opciones={TIPOS} />
              </div>
            </section>
          )}
          {!foto.abriendo && (
            <Lectura
              lectura={foto.lectura}
              conGemini={Boolean(permisos.todo)}
              quedan={quedan}
              alLeer={() => leer(foto)}
              alPreguntar={() => preguntar(foto)}
              alCopiar={copiar}
              alLaboratorio={alLaboratorio}
              alDer={alDer}
            />
          )}
          <div className="pizarron__botones">
            <button type="button" className="boton" onClick={cerrar}>Listo</button>
            <button type="button" className="boton boton--secundario" onClick={() => borrar(foto.id)}>Borrar foto</button>
          </div>
        </section>
      )}

      {fotos.length > 0 && !foto && (
        <section className="pizarron__clase" aria-labelledby="pizarron-clase">
          <h2 id="pizarron-clase" className="pizarron__subtitulo" ref={tira} tabIndex={-1}>{fotos.length === 1 ? 'Una foto' : `${fotos.length} fotos`}</h2>
          <ul className="pizarron__tira">
            {fotos.map((f, i) => (
              <li key={f.id}>
                <button type="button" className="pizarron__mini" onClick={() => (setAbierta(f.id), setVista('resultado'))} aria-label={`Ver la foto ${i + 1}`} aria-busy={f.abriendo || f.procesando ? 'true' : undefined}>
                  {f.resultado ? <img src={f.resultado.url} alt="" /> : <span className="pizarron__esqueleto" />}
                </button>
              </li>
            ))}
          </ul>
          <BotonesDeFoto alElegir={sumarFotos} principal={false} />
          <form className="pizarron__guardar" onSubmit={guardar} noValidate ref={form}>
            <ElegirMateria
              valor={materiaVista}
              materias={materias}
              ninguna="Elegí una"
              error={errorMateria}
              alElegir={(m) => {
                setErrorMateria('');
                setElegida(true);
                setMateria(m);
                setSeccion(seccionInicial(seccionesDondeSumar(mio, m), NOMBRE_SECCION));
                setError('');
              }}
            />
            {materiaVista !== null && (
              <ElegirSeccion
                secciones={secciones}
                delCampus={seccionesDelCampus}
                valor={seccionVista}
                nueva={NOMBRE_SECCION}
                alElegir={(s) => {
                  setElegida(true);
                  setMateria(materiaVista);
                  setSeccion(s);
                }}
              />
            )}
            <label className="pizarron__casilla">
              <input type="checkbox" checked={leerTexto} onChange={(e) => setLeerTexto(e.target.checked)} />
              <span>
                Leer el texto para buscarlo después
                <span className="pizarron__nota">
                  {permisos.todo && quedan !== 0 ? 'Lo lee Gemini. Cada foto sin leer usa una de tus preguntas de hoy.' : 'La primera vez baja unos 9 MB.'}
                </span>
              </span>
            </label>
            {error && <p className="campo__error" role="alert">{error}</p>}
            <div className="pizarron__pie">
              <button type="submit" className="boton" aria-disabled={guardando ? 'true' : undefined}>
                {guardando || (fotos.length === 1 ? 'Guardar en un PDF' : `Guardar las ${fotos.length} en un PDF`)}
              </button>
            </div>
            <span className="solo-lectores" aria-live="polite">{guardando}</span>
          </form>
        </section>
      )}
    </article>
  );
}
