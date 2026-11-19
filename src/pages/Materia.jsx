import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import BajarMateria from '../components/BajarMateria';
import FusionarApuntes from '../components/FusionarApuntes';
import { fusionables } from '../lib/fusion';
import ClassroomDeMateria, { abrirEnClassroom, ID_TABLON, idDeTema, porTema, useClassroomDeMateria } from '../components/Classroom';
import CompartirMateria from '../components/CompartirMateria';
import FilaEditable from '../components/FilaEditable';
import { Cargando, ErrorConReintento, esDeTipo, FilaItem, FiltroDeMateria, IconoDeFiltro } from '../components/Filas';
import IndiceSecciones, { useIndiceAlCostado } from '../components/IndiceSecciones';
import ListaConMas from '../components/ListaConMas';
import { Anotaciones, FechasSumadas, Panel, Tareas } from '../components/MisCosas';
import PanelFechas from '../components/PanelFechas';
import { Manija, Mas, Puntos, RenombrarSeccion, SumarSeccion, TituloDeSeccion } from '../components/Secciones';
import Simbolo from '../components/Simbolo';
import LlevarALaSesion from '../components/enVivo/LlevarALaSesion';
import SumarCosas, { guardarArchivos, soltarSobrantes } from '../components/SumarCosas';
import { useUI } from '../components/ui';
import DeLaMateria from '../components/calculadoras/DeLaMateria';
import { cambiarLectura, useContenido, useLectura, useVista } from '../lib/ajustes';
import { leerDeBodega } from '../lib/bodega';
import { compararFoto, fotoDe } from '../lib/cambios';
import { cargarContenido, cargarMaterias, cargarPerfil, materiasYaCargadas } from '../lib/campus';
import { delTablon } from '../lib/classroom';
import { buscar } from '../lib/datos';
import { useSesionEnVivo } from '../lib/enVivo/estado';
import { llevarMateria } from '../lib/enVivo/llevar';
import { useGoogle } from '../lib/google';
import { alternarEn, alternarSeccion, estaOculto, fijarOrden, guardarFoto, materiaDe, nombreDeSeccion, ordenarSecciones, personalizar, plegarSeccion, ponerEnSeccion, renombrarSeccion, useMio, usuarioActual, vaciarParcial } from '../lib/mio';
import { sinMovimiento } from '../lib/movimiento';
import { enOrdenGuardado, moverA, segun } from '../lib/ordenSecciones';
import { agregadaDe, borrarBloque, borrarCategoria, cambiarBloque, pasarASeccion, renombrarCategoria, seccionesTuyas, sumarEnSeccion, sumarSeccionPropia } from '../lib/propias';
import { LIMITES } from '../lib/propiasSaneo';
import { itemDeBloque, itemDeCampus } from '../lib/propiasVista';
import { resumenDe } from '../lib/santoResumen';
import { tituloDe, useSeo } from '../lib/seo';
import { useDesplazarAlArrastrar } from '../lib/autoDesplazar';
import { useArrastreDeSecciones } from '../lib/useArrastreDeSecciones';
import { useMoverConManija, usePliegue } from '../lib/useSecciones';
import { useCampusDePropia } from '../lib/useCampusDePropia';
import { useConsulta } from '../lib/useConsulta';
import { useMarcarVistos } from '../lib/vistos';
import './panel.css';
import './propias.css';
import './secciones.css';

function agrupar(items) {
  const grupos = new Map();
  for (const item of items) {
    if (!grupos.has(item.seccionId)) grupos.set(item.seccionId, { id: item.seccionId, nombre: item.seccion || 'General', items: [] });
    grupos.get(item.seccionId).items.push(item);
  }
  return [...grupos.values()];
}

// Classroom items stay in its card on the right until the student moves them to a section of the campus.
const enLaDerecha = (i) => typeof i.seccionId === 'string' && i.seccionId.startsWith('c');
// A section of the student's own: «p» and the number of its category.
const esTuya = (id) => typeof id === 'string' && id.startsWith('p');
// Where a card can go: a section of the campus or one of the student's own.
const recibe = (id) => Number.isInteger(id) || esTuya(id);
const leer = (archivoId, nombre) => leerDeBodega(usuarioActual(), archivoId, nombre);
// The heading of a section, to send the focus there.
const idDeSeccion = (id) => `seccion-${id}`;
// The part of a section that folds, and its handle.
const idDeCuerpo = (id) => `cuerpo-${id}`;
const idDeManija = (id) => `manija-${id}`;
const conArchivos = (e) => [...(e.dataTransfer?.types ?? [])].includes('Files');

/** What the student added to this course, as items of it, so they show, move and get marked like the rest. The ones of
 * a section of their own go there; the ones added to a section of the campus, to that one. `tuyo` says where each one
 * is kept. A campus block (of another course) comes with its name from the reader's campus, or not at all. */
function itemsTuyos(agregada, materia, items, contenidos) {
  if (!agregada || !materia) return [];
  const nombres = new Map(items.map((i) => [i.seccionId, i.seccion]));
  return agregada.categorias.flatMap((categoria) => categoria.bloques.map((b) => {
    const enCampus = categoria.campus !== undefined;
    const base = {
      id: `${agregada.id}-${b.id}`,
      clave: `p${b.id}`,
      materiaId: materia.id,
      seccion: enCampus ? nombres.get(categoria.campus) ?? 'Lo que sumaste' : categoria.nombre,
      seccionId: enCampus ? categoria.campus : `p${categoria.id}`,
      seccionOriginal: undefined,
      origen: 'propia',
      tuyo: { catId: categoria.id, bloque: b },
    };
    if (b.tipo === 'campus') {
      const item = itemDeCampus(b, contenidos);
      return item ? { ...item, ...base, nombre: item.nombreOriginal ?? item.nombre, nombreOriginal: null } : null;
    }
    const item = itemDeBloque(b, { propia: agregada, categoria, leer });
    return item ? { ...item, ...base, materia: materia.nombre } : null;
  })).filter(Boolean);
}

/** The sections of the campus in their order, then the student's own in theirs (also the empty ones, to drop on). */
function ordenar(grupos, agregada, conVacias) {
  const porId = new Map(grupos.map((g) => [g.id, g]));
  const tuyas = seccionesTuyas(agregada).map((c) => porId.get(`p${c.id}`) ?? { id: `p${c.id}`, nombre: c.nombre, items: [] });
  return [...grupos.filter((g) => !esTuya(g.id)), ...tuyas.filter((g) => conVacias || g.items.length)];
}

function Avance({ titulo, hechos, total }) {
  if (!total) return null;
  return (
    <div className="avance">
      <p className="avance__texto">{titulo}, {hechos} de {total}</p>
      <progress className="avance__barra" max={total} value={hechos} aria-label={titulo} />
    </div>
  );
}

function Cambios({ cambios, onRevisado }) {
  return (
    <section className="cambios" aria-labelledby="cambios-titulo">
      <div className="seccion__cabeza">
        <h2 id="cambios-titulo">Cambios desde tu última revisión</h2>
        <button type="button" className="boton boton--secundario boton--chico" onClick={onRevisado}>Ya lo revisé</button>
      </div>
      {cambios.nuevos.length + cambios.cambiados.length > 0 && (
        <ul className="lista">
          {cambios.nuevos.map((i) => <FilaItem key={i.id} item={i} marca="Nuevo" />)}
          {cambios.cambiados.map((i) => <FilaItem key={i.id} item={i} marca="Modificado" />)}
        </ul>
      )}
      {cambios.borrados > 0 && <p className="cambios__borrados">{cambios.borrados === 1 ? 'Sacaron un ítem de la materia.' : `Sacaron ${cambios.borrados} ítems de la materia.`} No guardamos los nombres, así que no sabemos cuáles.</p>}
    </section>
  );
}

function TuVersion({ materiaId, propias }) {
  return (
    <div className="materia__version">
      {propias.length > 0 && (
        <ul className="materia__versiones" aria-label="Tus versiones de esta materia">
          {propias.map((p) => <li key={p.id}><Link to={`/propias/${p.id}`}>{p.nombre}</Link></li>)}
        </ul>
      )}
      <p>Con tus resúmenes y solo lo que te sirve.</p>
      <Link className="boton boton--secundario boton--chico" to={`/propias/nueva?base=${materiaId}`}>{propias.length ? 'Armar otra versión' : 'Armar tu versión'}</Link>
    </div>
  );
}

export default function Materia() {
  const { id } = useParams();
  const { confirmar, avisar } = useUI();
  const [filtro, setFiltro] = useState('');
  const [tipo, setTipo] = useState('');
  const [soloSinVer, setSoloSinVer] = useState(false);
  const marcarVistos = useMarcarVistos();
  const [soloParcial, setSoloParcial] = useState(false);
  const [recienOculto, setRecienOculto] = useState(null);
  const deshacer = useRef(null);
  const arrastrado = useRef(null);
  // The section a dragged card (or a file of the computer) is over, to mark it. And the card that just changed
  // section or just arrived, to give it the focus.
  const [sobre, setSobre] = useState(null);
  const [enfocar, setEnfocar] = useState(null);
  const mio = useMio();
  const vista = useVista('materia');
  const contenido = useContenido();
  // Reading mode: what arranges the course goes away, on this device, until it's turned off.
  const lectura = useLectura();
  // The form to add a section of one's own, open under the title, and the section it just made (it gets the focus).
  const [creando, setCreando] = useState(false);
  const recienCreada = useRef(null);
  const botonSumar = useRef(null);
  // The section whose «Sumar» is open, and the one of the student's own with its options open or being renamed.
  const [sumandoEn, setSumandoEn] = useState(null);
  const [opcionesDe, setOpcionesDe] = useState(null);
  const [renombrando, setRenombrando] = useState(null);
  // What a move of a section tells screen readers: where it was left.
  const [anuncio, setAnuncio] = useState('');
  const alCostado = useIndiceAlCostado();
  // Something dragged near the top or the bottom of the screen takes the page that way.
  useDesplazarAlArrastrar();

  const { datos, error, cargando, recargar } = useConsulta(async () => {
    await cargarPerfil();
    const { enCurso, otras } = await cargarMaterias();
    const materia = [...enCurso, ...otras].find((m) => String(m.id) === id);
    if (!materia) return { materia: null, items: [] };
    return { materia, items: await cargarContenido(materia) };
  }, [id]);
  // The name and the symbol from the list of subjects, while the content is on its way: the title doesn't start as
  // «Materia» and change under the pen.
  const [listado, setListado] = useState(materiasYaCargadas);
  useEffect(() => {
    let viva = true;
    cargarMaterias().then((l) => viva && setListado(l), () => {});
    return () => {
      viva = false;
    };
  }, []);
  const delListado = listado && [...listado.enCurso, ...listado.otras].find((m) => String(m.id) === id);
  const cabeza = datos ? datos.materia : delListado;
  const enVivo = useSesionEnVivo();

  // Fixed title: the browser history keeps it even after leaving.
  useSeo({ titulo: tituloDe('Materia'), noindex: true });

  const materiaId = datos?.materia?.id;
  // The name each section has in the campus, for the one the student renamed.
  const nombresCampus = useMemo(() => new Map((datos?.items ?? []).map((i) => [i.seccionId, i.seccion])), [datos]);
  const resumen = useMemo(() => (datos?.materia ? resumenDe(datos.materia.nombre) : null), [datos]);
  const propia = materiaDe(mio, materiaId);
  // On the phone the column on the right goes after the content: the link to it names Classroom when it is there.
  const conClassroom = useGoogle().disponible;
  const cr = useClassroomDeMateria(datos?.materia ?? null);
  const agregada = materiaId ? agregadaDe(mio, materiaId) : null;
  const deOtras = useCampusDePropia(agregada);
  const otrasMaterias = useMemo(() => (deOtras.materias ?? []).filter((m) => m.id !== materiaId), [deOtras.materias, materiaId]);
  const tuyos = useMemo(() => itemsTuyos(agregada, datos?.materia, datos?.items ?? [], deOtras.contenidos), [agregada, datos, deOtras.contenidos]);
  // The student's own sections can receive cards even while empty.
  const extras = useMemo(() => seccionesTuyas(agregada).map((c) => ({ materiaId, id: `p${c.id}`, nombre: c.nombre })), [agregada, materiaId]);
  const todos = useMemo(() => personalizar([...(datos?.items ?? []), ...cr.items, ...tuyos], mio, extras), [datos, cr.items, tuyos, mio, extras]);
  const visibles = useMemo(() => todos.filter((i) => !enLaDerecha(i) && !estaOculto(mio, i)), [todos, mio]);
  const derecha = useMemo(() => todos.filter((i) => enLaDerecha(i) && !estaOculto(mio, i)), [todos, mio]);
  const delCampus = useMemo(() => todos.filter((i) => !i.origen), [todos]);
  const paraFusionar = useMemo(() => fusionables(visibles), [visibles]);
  const sinVer = soloSinVer && marcarVistos;
  const hayFiltro = Boolean(filtro.trim() || tipo || sinVer || soloParcial);

  // Every section of the course in the student's order, also the hidden ones: moving one leaves the rest where they are.
  const todasLasSecciones = useMemo(
    () => enOrdenGuardado(ordenar(agrupar(todos.filter((i) => !enLaDerecha(i))), agregada, true).map((g) => g.id), propia.ordenSecciones),
    [todos, agregada, propia.ordenSecciones],
  );

  const grupos = useMemo(() => {
    let lista = visibles;
    if (tipo) lista = lista.filter((i) => esDeTipo(i, tipo));
    if (sinVer) lista = lista.filter((i) => !i.visto);
    if (soloParcial) lista = lista.filter((i) => i.parcial);
    if (filtro.trim()) lista = buscar(lista, filtro, 1000);
    return segun(ordenar(agrupar(lista), agregada, !hayFiltro && !lectura), todasLasSecciones);
  }, [visibles, tipo, sinVer, soloParcial, filtro, agregada, hayFiltro, lectura, todasLasSecciones]);

  const seccionesOcultas = useMemo(() => agrupar(todos.filter((i) => propia.secciones.includes(i.seccionId))), [todos, propia.secciones]);
  const itemsOcultos = useMemo(() => todos.filter((i) => propia.ocultos.includes(i.clave) && !propia.secciones.includes(i.seccionId)), [todos, propia.ocultos, propia.secciones]);

  const cambios = useMemo(() => {
    const r = compararFoto(propia.foto, delCampus);
    return { ...r, nuevos: r.nuevos.filter((i) => !estaOculto(mio, i)), cambiados: r.cambiados.filter((i) => !estaOculto(mio, i)) };
  }, [propia.foto, delCampus, mio]);
  const marcas = useMemo(() => new Map([
    ...cambios.nuevos.map((i) => [i.clave, 'Nuevo']),
    ...cambios.cambiados.map((i) => [i.clave, 'Modificado']),
    ...cr.items.filter((i) => i.creado > cr.revisado).map((i) => [i.clave, 'Nuevo']),
  ]), [cambios, cr.items, cr.revisado]);
  // Where a card can go: the sections of the campus on screen and the student's own.
  const secciones = useMemo(() => segun(ordenar(agrupar(visibles), agregada, true).filter((g) => recibe(g.id)), todasLasSecciones), [visibles, agregada, todasLasSecciones]);
  const hayCambios = cambios.nuevos.length + cambios.cambiados.length + cambios.borrados > 0;
  const tuyas = seccionesTuyas(agregada);
  const { plegadas } = propia;

  // The index: the sections on screen, and the stream and topics of the Classroom card once they are there. Only when
  // the course has more than one section.
  const cuantasSecciones = useMemo(() => ordenar(agrupar(visibles), agregada, !lectura).length, [visibles, agregada, lectura]);
  const indice = useMemo(() => grupos.map((g) => ({ clave: `s${g.id}`, nombre: g.nombre, destino: idDeSeccion(g.id), seccion: g.id })), [grupos]);
  const conTemas = cr.google.disponible && cr.google.conectado && (cr.cursos.datos?.length ?? 0) > 0 && Boolean(cr.curso) && Boolean(cr.datos.datos);
  const indiceClassroom = useMemo(() => (conTemas ? [
    ...(derecha.some(delTablon) ? [{ clave: 'tablon', nombre: 'Tablón', destino: ID_TABLON, classroom: true }] : []),
    ...porTema(derecha.filter((i) => !delTablon(i))).map((t) => ({ clave: t.id, nombre: t.nombre, destino: idDeTema(t.id), classroom: true })),
  ] : []), [conTemas, derecha]);

  // Something just went into a folded section: it opens, to show it.
  const abrirSiPlegada = (id) => {
    if (plegadas.includes(id)) plegarSeccion(materiaId, id, false);
  };
  const irA = (entrada) => {
    if (entrada.classroom) abrirEnClassroom(entrada.destino);
    else abrirSiPlegada(entrada.seccion);
  };

  const alternarPliegue = usePliegue(materiaId, plegadas, idDeCuerpo);

  // A section to place `lugar` among the ones on screen (by its handle or its options). The order saved keeps every
  // section, also the hidden ones.
  const moverSeccionA = (seccion, lugar) => {
    const ids = grupos.map((g) => g.id);
    if (lugar < 0 || lugar >= ids.length || ids.indexOf(seccion.id) === lugar) return false;
    ordenarSecciones(materiaId, moverA(todasLasSecciones, ids, seccion.id, lugar));
    setAnuncio(`${seccion.nombre} quedó en el lugar ${lugar + 1} de ${ids.length}`);
    return true;
  };
  // The section whose «Subir» and «Bajar» are open, from a tap on its handle; and the button to focus once it moved.
  const { moviendo, setMoviendo, enfocarMover } = useMoverConManija(idDeManija);
  const arrastreSecciones = useArrastreDeSecciones({
    alTocar: (id) => setMoviendo((m) => (m === id ? null : id)),
    ids: grupos.map((g) => g.id),
    elDe: (id) => document.getElementById(idDeSeccion(id))?.closest('section'),
    manijaDe: (id) => document.getElementById(idDeManija(id)),
    alMover: (id, lugar) => {
      const seccion = grupos.find((g) => g.id === id);
      if (seccion) moverSeccionA(seccion, lugar);
    },
  });
  const { arrastrada } = arrastreSecciones;

  // The first visit only takes the picture: everything would look new otherwise.
  useEffect(() => {
    if (datos?.materia && !propia.foto) guardarFoto(datos.materia.id, fotoDe(datos.items));
  }, [datos, propia.foto]);

  // What had the focus just left the screen: the focus goes to the notice with «Deshacer».
  // The notice floats at the foot of the screen: going to its «Deshacer» doesn't take the page back to the top, so a long
  // subject can be cleaned up from where it is.
  useEffect(() => {
    if (recienOculto) deshacer.current?.focus({ preventScroll: true });
  }, [recienOculto]);
  const cerrarOculto = () => {
    const volver = recienOculto?.volver;
    setRecienOculto(null);
    if (volver) requestAnimationFrame(() => document.getElementById(volver)?.focus({ preventScroll: true }));
  };

  // A section just made: the page goes to it, ready to get things.
  useEffect(() => {
    const titulo = recienCreada.current && document.getElementById(idDeSeccion(recienCreada.current));
    if (!titulo) return;
    recienCreada.current = null;
    titulo.focus({ preventScroll: true });
    titulo.closest('section')?.scrollIntoView({ block: 'start', behavior: sinMovimiento() ? 'auto' : 'smooth' });
  });

  const enfocarSeccion = (seccionId) => requestAnimationFrame(() => document.getElementById(idDeSeccion(seccionId))?.focus());
  const cerrarSumando = (seccionId) => {
    setSumandoEn(null);
    requestAnimationFrame(() => document.querySelector(`[aria-controls="sumando-${seccionId}"]`)?.focus());
  };

  const ocultarSeccion = (seccion) => {
    alternarSeccion(materiaId, seccion.id);
    setRecienOculto({ nombre: seccion.nombre, deshacer: () => alternarSeccion(materiaId, seccion.id) });
  };
  const ocultarItem = (item) => {
    alternarEn(materiaId, 'ocultos', item.clave);
    setRecienOculto({ nombre: item.nombre, volver: item.seccionId != null ? idDeSeccion(item.seccionId) : null, deshacer: () => alternarEn(materiaId, 'ocultos', item.clave) });
  };

  const cerrarCrear = () => {
    setCreando(false);
    requestAnimationFrame(() => botonSumar.current?.focus());
  };
  const crearSeccion = (nombre) => {
    const nueva = sumarSeccionPropia(materiaId, nombre);
    if (!nueva) return `Una materia lleva hasta ${LIMITES.categorias} secciones tuyas.`;
    // A filter would hide it while it's empty.
    setFiltro('');
    setTipo('');
    setSoloSinVer(false);
    setSoloParcial(false);
    setCreando(false);
    recienCreada.current = `p${nueva.categoria}`;
    avisar(`Sumaste la sección ${nombre.trim()}`);
    return null;
  };

  // Things of the student's own go at the end of a section, and the first one gets the focus.
  const sumarA = (seccion) => (bloques) => {
    const r = sumarEnSeccion(materiaId, seccion.id, bloques);
    if (!r) return 0;
    setSumandoEn(null);
    abrirSiPlegada(seccion.id);
    setEnfocar(`${r.propia}-${r.ids[0]}`);
    return r.ids.length;
  };
  // The PDF of «Fusionar en un PDF», saved in a section like a file of the student's own. Says if it went in.
  const guardarFusion = async (seccion, archivo) => {
    const { bloques, avisos } = await guardarArchivos([archivo]);
    const n = bloques.length ? sumarA(seccion)(bloques) : 0;
    soltarSobrantes(bloques.slice(n));
    if (!n && bloques.length) avisos.unshift(`No entró. Una sección lleva hasta ${LIMITES.bloques} cosas.`);
    if (avisos.length) avisar(avisos.join(' '), 'error');
    return n > 0;
  };
  // Files dropped from the computer on a section.
  const soltarArchivos = async (seccion, lista) => {
    avisar(lista.length === 1 ? 'Guardando el archivo' : `Guardando ${lista.length} archivos`);
    let guardados;
    try {
      guardados = await guardarArchivos(lista);
    } catch {
      // The disk full or a file that can't be read: it says so instead of staying on «Guardando».
      avisar(lista.length === 1 ? 'No se pudo guardar el archivo. Probá de nuevo.' : 'No se pudieron guardar los archivos. Probá de nuevo.', 'error');
      return;
    }
    const { bloques, avisos } = guardados;
    const n = bloques.length ? sumarA(seccion)(bloques) : 0;
    soltarSobrantes(bloques.slice(n));
    if (n) avisar(n === 1 ? `Sumaste un archivo a ${seccion.nombre}` : `Sumaste ${n} archivos a ${seccion.nombre}`);
    if (n < bloques.length) avisos.unshift(`No entró todo. Una sección lleva hasta ${LIMITES.bloques} cosas.`);
    if (avisos.length) avisar(avisos.join(' '), 'error');
  };

  const borrarTuyo = async (item) => {
    const escrito = item.tuyo.bloque.tipo !== 'campus';
    const texto = item.tuyo.bloque.tipo === 'archivo' ? 'El archivo se borra de este navegador.' : undefined;
    if (escrito && !(await confirmar({ titulo: `¿Borrar ${item.nombre}?`, texto, boton: 'Borrar', peligro: true }))) return;
    borrarBloque(agregada.id, item.tuyo.catId, item.tuyo.bloque.id);
    avisar(`Borraste ${item.nombre}`);
    enfocarSeccion(item.seccionId);
  };
  const cambiarTuyo = (item, cambios) => cambiarBloque(agregada.id, item.tuyo.catId, item.tuyo.bloque.id, cambios);

  const borrarSeccion = async (seccion, catId) => {
    const suyos = agregada.categorias.find((c) => c.id === catId)?.bloques.length ?? 0;
    const movidos = seccion.items.filter((i) => i.tuyo?.catId !== catId).length;
    const texto = [
      suyos ? `Se borra lo que sumaste en ella (${suyos === 1 ? 'una cosa' : `${suyos} cosas`}).` : '',
      movidos ? 'Lo que pasaste de otras secciones vuelve a su lugar.' : '',
    ].filter(Boolean).join(' ') || undefined;
    if (!(await confirmar({ titulo: `¿Borrar ${seccion.nombre}?`, texto, boton: 'Borrar', peligro: true }))) return;
    borrarCategoria(agregada.id, catId);
    setOpcionesDe(null);
    avisar(`Borraste ${seccion.nombre}`);
    requestAnimationFrame(() => botonSumar.current?.focus());
  };
  const moverSeccion = (seccion, salto) => {
    if (!moverSeccionA(seccion, grupos.findIndex((g) => g.id === seccion.id) + salto)) return;
    // The section moved in the page: the focus stays on its options.
    requestAnimationFrame(() => document.querySelector(`[aria-controls="opciones-${seccion.id}"]`)?.focus());
  };

  // Where a card is: the student's own things are kept in the section they show in; the rest, marked as moved.
  const llevar = (item, seccionId) => {
    if (item.tuyo) {
      if (!pasarASeccion(materiaId, item.tuyo.bloque.id, seccionId)) {
        avisar(`No entró. Una sección lleva hasta ${LIMITES.bloques} cosas.`, 'error');
        return false;
      }
      ponerEnSeccion(materiaId, item.clave, null);
      return true;
    }
    const original = item.seccionOriginal ?? item.seccionId;
    ponerEnSeccion(materiaId, item.clave, seccionId === original ? null : seccionId);
    return true;
  };

  // A card goes to another section (or back to where it was). Without a drag, at the end of the section.
  const pasar = (item, destino) => {
    if (destino === null) {
      ponerEnSeccion(materiaId, item.clave, null);
      avisar(`${item.nombre} volvió a Classroom`);
    } else {
      const seccion = secciones.find((g) => g.id === destino);
      if (!seccion || !llevar(item, destino)) return;
      abrirSiPlegada(destino);
      fijarOrden(materiaId, destino, [...seccion.items.map((i) => i.clave).filter((c) => c !== item.clave), item.clave]);
      avisar(`Pasaste ${item.nombre} a ${seccion.nombre}`);
    }
    setEnfocar(item.id);
  };

  const terminar = () => {
    arrastrado.current = null;
    setSobre(null);
  };
  // Dropped on a card (it goes before it) or on the section (at the end).
  const soltarEn = (seccion, antesDe) => {
    const origen = arrastrado.current;
    terminar();
    if (!origen || origen.clave === antesDe) return;
    const item = todos.find((i) => i.clave === origen.clave);
    if (!item) return;
    const claves = seccion.items.map((i) => i.clave).filter((c) => c !== origen.clave);
    const lugar = antesDe ? claves.indexOf(antesDe) : -1;
    claves.splice(lugar === -1 ? claves.length : lugar, 0, origen.clave);
    if (origen.seccion !== seccion.id) {
      if (!llevar(item, seccion.id)) return;
      abrirSiPlegada(seccion.id);
      avisar(`Pasaste ${item.nombre} a ${seccion.nombre}`);
    }
    fijarOrden(materiaId, seccion.id, claves);
  };
  const arrastreDe = (seccion) => ({
    empezar: (clave) => { arrastrado.current = { clave, seccion: seccion.id }; },
    soltar: (destino) => soltarEn(seccion, destino),
    terminar,
  });
  // The card on the right: its cards drag to the left, and one from Classroom dropped on it goes back.
  const arrastreDeClassroom = {
    empezar: (clave, seccion) => { arrastrado.current = { clave, seccion }; },
    terminar,
    deClassroom: () => Boolean(arrastrado.current) && todos.some((i) => i.clave === arrastrado.current.clave && i.origen === 'classroom' && !enLaDerecha(i)),
    devolver: () => {
      const item = todos.find((i) => i.clave === arrastrado.current?.clave);
      terminar();
      if (item && item.origen === 'classroom' && !enLaDerecha(item)) pasar(item, null);
    },
  };
  // Over a section: a card of the page (while no filter hides part of it) or files of the computer.
  const sobreSeccion = (seccion) => (e) => {
    const archivos = conArchivos(e);
    if (!archivos && (!arrastrado.current || hayFiltro)) return;
    e.preventDefault();
    if (archivos) e.dataTransfer.dropEffect = 'copy';
    if (sobre !== seccion.id) setSobre(seccion.id);
  };
  const dejarSeccion = (seccion) => (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setSobre((s) => (s === seccion.id && !arrastrado.current ? null : s));
  };
  const soltarSobre = (seccion) => (e) => {
    e.preventDefault();
    const lista = [...(e.dataTransfer?.files ?? [])];
    if (lista.length) {
      setSobre(null);
      soltarArchivos(seccion, lista);
    } else soltarEn(seccion, null);
  };

  const vistosVisibles = visibles.filter((i) => i.visto).length;
  const delParcial = visibles.filter((i) => i.parcial);

  const vistaIndice = cuantasSecciones > 1 && <IndiceSecciones alCostado={alCostado} secciones={indice} classroom={indiceClassroom} onIr={irA} />;

  return (
    <div className="contenedor pagina materia" data-vista={vista} data-contenido={contenido} data-arrastrando={arrastrada !== null || undefined}>
      <p className="volver"><Link to="/materias">Materias</Link></p>
      <div className="materia__titulo">
        {cabeza && <Simbolo id={cabeza.id} nombre={cabeza.nombre} tamano="enorme" />}
        <h1>{cabeza?.nombre ?? 'Materia'}</h1>
        {datos?.materia && (
          <div className="materia__herramientas">
            {!lectura && (
              <button ref={botonSumar} type="button" className="boton boton--chico materia__nueva" aria-expanded={creando} aria-controls={creando ? 'sumar-seccion' : undefined} onClick={() => (creando ? cerrarCrear() : setCreando(true))}>
                <Mas />Sumar una sección
              </button>
            )}
            <button type="button" className="boton boton--secundario boton--chico" onClick={() => { setCreando(false); setSumandoEn(null); setOpcionesDe(null); setRenombrando(null); cambiarLectura(!lectura); }}>
              {lectura ? 'Mostrar las herramientas' : 'Esconder las herramientas'}
            </button>
          </div>
        )}
      </div>
      {datos?.materia && creando && !lectura && <SumarSeccion onCrear={crearSeccion} onCerrar={cerrarCrear} />}
      {resumen && (
        <p className="materia__santo">
          <a href={resumen.url} target="_blank" rel="noreferrer">
            Resumen de {resumen.nombre} en El Santo Resumen<span className="solo-lectores">, se abre en otra pestaña</span>
          </a>
        </p>
      )}
      {datos?.materia && <DeLaMateria nombre={datos.materia.nombre} />}
      {datos?.materia && <p className="materia__a-lo-tuyo"><a href="#lo-tuyo">{conClassroom ? 'Ir a Classroom, tus tareas y anotaciones' : 'Ir a tus tareas y anotaciones'}</a></p>}
      {error && !datos && <ErrorConReintento texto={error} recargar={recargar} />}
      {cargando && !datos && <Cargando texto="Buscando el contenido" cuantas={6} />}
      {datos && !datos.materia && <p>No encontramos esta materia entre las tuyas.</p>}
      {datos?.materia && !datos.items.length && !tuyas.length && <p>Esta materia todavía no tiene contenido.</p>}
      {datos?.materia && (
        <div className="materia__cuerpo">
          {alCostado && vistaIndice}
          <div className="materia__contenido">
            {hayCambios && <Cambios cambios={cambios} onRevisado={() => guardarFoto(materiaId, fotoDe(datos.items))} />}
            {!alCostado && vistaIndice}

            {visibles.length > 0 && (
              <FiltroDeMateria filtro={filtro} onFiltro={setFiltro} tipo={tipo} onTipo={setTipo}>
                <div className="tipos" role="group" aria-label="Mostrar también">
                  {marcarVistos && <button type="button" className="tipos__opcion" aria-pressed={soloSinVer} onClick={() => setSoloSinVer((v) => !v)}><IconoDeFiltro nombre="ojo" />Sin ver</button>}
                  <button type="button" className="tipos__opcion" aria-pressed={soloParcial} onClick={() => setSoloParcial((v) => !v)}><IconoDeFiltro nombre="marcador" tono="pdf" />Para el parcial</button>
                  {soloParcial && delParcial.length > 0 && <button type="button" className="tipos__opcion" onClick={async () => { if (await confirmar({ titulo: '¿Vaciar la lista del parcial?', boton: 'Vaciar', peligro: true })) vaciarParcial(materiaId); }}>Vaciar la lista</button>}
                </div>
              </FiltroDeMateria>
            )}

            {recienOculto && (
              <div className="deshecho deshecho--flota" role="status" onKeyDown={(e) => e.key === 'Escape' && cerrarOculto()}>
                <p>Ocultaste {recienOculto.nombre}.</p>
                <div className="deshecho__botones">
                  <button ref={deshacer} type="button" className="boton boton--secundario boton--chico" onClick={() => { recienOculto.deshacer(); cerrarOculto(); }}>Deshacer</button>
                  <button type="button" className="deshecho__cerrar" aria-label="Cerrar el aviso" onClick={cerrarOculto}>
                    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                  </button>
                </div>
              </div>
            )}

            <p role="status" className="materia__sin-nada">{visibles.length > 0 && !grupos.length ? (soloParcial && !delParcial.length ? 'Todavía no sumaste nada al parcial. Abrí las opciones de un ítem.' : 'No hay nada para mostrar acá. Probá con otro filtro o mirá lo que ocultaste.') : ''}</p>
            <p role="status" className="solo-lectores">{anuncio}</p>
            <p id="mover-ayuda" hidden>Arrastrala, movela con las flechas arriba y abajo, o tocala para subirla o bajarla.</p>

            {grupos.map((seccion, lugar) => {
              const claves = hayFiltro || lectura ? null : seccion.items.map((i) => i.clave);
              const catId = esTuya(seccion.id) ? Number(seccion.id.slice(1)) : null;
              const vacia = catId && !seccion.items.length;
              const editable = !lectura && recibe(seccion.id);
              const sumando = editable && (sumandoEn === seccion.id || vacia);
              // The options of a section: renaming and moving it, and deleting it if it's one of the student's own.
              const conMenu = !lectura && (Boolean(catId) || Number.isInteger(seccion.id));
              const conOpciones = conMenu && opcionesDe === seccion.id;
              const renombrada = !catId && nombreDeSeccion(propia, seccion.id) !== undefined;
              // Folded as the student left it; with a filter, open; while a section is dragged, every one.
              const plegada = arrastrada !== null || (!hayFiltro && plegadas.includes(seccion.id));
              const conManija = !lectura && !hayFiltro && grupos.length > 1 && renombrando !== seccion.id;
              const vistaSumando = sumando && (
                <div id={`sumando-${seccion.id}`} className="seccion__sumando" onKeyDown={(e) => { if (e.key === 'Escape' && !vacia) cerrarSumando(seccion.id); }}>
                  <SumarCosas
                    nombre={seccion.nombre}
                    bloques={(catId ? agregada?.categorias.find((c) => c.id === catId) : agregada?.categorias.find((c) => c.campus === seccion.id))?.bloques ?? []}
                    materias={otrasMaterias}
                    textoCampus="De otra materia"
                    santo={resumen?.slug ?? ''}
                    onSumar={sumarA(seccion)}
                    onCerrar={vacia ? null : () => cerrarSumando(seccion.id)}
                    enfocar={sumandoEn === seccion.id}
                  />
                </div>
              );
              return (
                <section
                  className="bloque"
                  key={seccion.id}
                  data-soltar={sobre === seccion.id || undefined}
                  data-tuya={catId ? '' : undefined}
                  data-agarrada={arrastrada === seccion.id || undefined}
                  aria-labelledby={idDeSeccion(seccion.id)}
                  onDragOver={editable ? sobreSeccion(seccion) : undefined}
                  onDragLeave={editable ? dejarSeccion(seccion) : undefined}
                  onDrop={editable ? soltarSobre(seccion) : undefined}
                >
                  <div className="seccion__cabeza">
                    {renombrando === seccion.id && !lectura ? (
                      <>
                        <h2 id={idDeSeccion(seccion.id)} tabIndex={-1} className="solo-lectores">{seccion.nombre}</h2>
                        <RenombrarSeccion
                          nombre={seccion.nombre}
                          original={renombrada ? nombresCampus.get(seccion.id) ?? null : null}
                          onGuardar={(nombre) => {
                            if (catId) renombrarCategoria(agregada.id, catId, nombre.trim());
                            else renombrarSeccion(materiaId, seccion.id, nombre);
                            setRenombrando(null);
                            enfocarSeccion(seccion.id);
                          }}
                          onVolver={() => {
                            renombrarSeccion(materiaId, seccion.id, '');
                            setRenombrando(null);
                            enfocarSeccion(seccion.id);
                          }}
                          onCerrar={() => { setRenombrando(null); enfocarSeccion(seccion.id); }}
                        />
                      </>
                    ) : (
                      <div className="seccion__titular">
                        {conManija && (
                          <button id={idDeManija(seccion.id)} type="button" className="seccion__manija" aria-label={`Mover ${seccion.nombre}`} aria-describedby="mover-ayuda" aria-expanded={moviendo === seccion.id} {...arrastreSecciones.manija(seccion.id)}>
                            <Manija />
                          </button>
                        )}
                        {conManija && moviendo === seccion.id && arrastrada === null && (
                          <span
                            className="seccion__mover"
                            role="group"
                            aria-label={`Mover ${seccion.nombre}`}
                          >
                            {[['subir', 'Subir', -1], ['bajar', 'Bajar', 1]].map(([clave, texto, salto]) => {
                              const destino = lugar + salto;
                              const fuera = destino < 0 || destino >= grupos.length;
                              return (
                                <button
                                  key={clave}
                                  id={`mover-${clave}-${seccion.id}`}
                                  type="button"
                                  className="boton boton--secundario boton--chico"
                                  aria-disabled={fuera ? 'true' : undefined}
                                  onClick={() => {
                                    if (fuera) return;
                                    enfocarMover.current = `mover-${clave}-${seccion.id}`;
                                    moverSeccionA(seccion, destino);
                                  }}
                                >
                                  {texto}
                                </button>
                              );
                            })}
                          </span>
                        )}
                        <TituloDeSeccion id={idDeSeccion(seccion.id)} cuerpo={idDeCuerpo(seccion.id)} nombre={seccion.nombre} plegada={plegada} cuantos={seccion.items.length} sinPliegue={hayFiltro} onAlternar={() => alternarPliegue(seccion)} />
                      </div>
                    )}
                    {renombrando !== seccion.id && !lectura && (
                      <div className="seccion__acciones">
                        {editable && !vacia && (
                          <button type="button" className="seccion__sumar" aria-expanded={sumandoEn === seccion.id} aria-controls={`sumando-${seccion.id}`} aria-label={`Sumar a ${seccion.nombre}`} onClick={() => (sumandoEn === seccion.id ? cerrarSumando(seccion.id) : setSumandoEn(seccion.id))}>
                            <Mas />Sumar
                          </button>
                        )}
                        {Number.isInteger(seccion.id) && <button type="button" className="seccion__ocultar" aria-label={`Ocultar ${seccion.nombre}`} onClick={() => ocultarSeccion(seccion)}>Ocultar</button>}
                        {conMenu && (
                          <button type="button" className="fila__opciones seccion__mas" aria-expanded={conOpciones} aria-controls={`opciones-${seccion.id}`} aria-label={`Opciones de ${seccion.nombre}`} onClick={() => setOpcionesDe((o) => (o === seccion.id ? null : seccion.id))}>
                            <Puntos />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  {conMenu && (
                    <div
                      id={`opciones-${seccion.id}`}
                      className="seccion__opciones"
                      hidden={!conOpciones}
                      onKeyDown={(e) => {
                        if (e.key !== 'Escape') return;
                        setOpcionesDe(null);
                        document.querySelector(`[aria-controls="opciones-${seccion.id}"]`)?.focus();
                      }}
                    >
                      <button type="button" className="boton boton--secundario boton--chico" onClick={() => { setOpcionesDe(null); setRenombrando(seccion.id); }}>Cambiar nombre</button>
                      {grupos.length > 1 && !hayFiltro && (
                        <>
                          <button type="button" className="boton boton--secundario boton--chico" disabled={lugar <= 0} onClick={() => moverSeccion(seccion, -1)}>Subir</button>
                          <button type="button" className="boton boton--secundario boton--chico" disabled={lugar >= grupos.length - 1} onClick={() => moverSeccion(seccion, 1)}>Bajar</button>
                        </>
                      )}
                      {catId && <button type="button" className="boton boton--secundario boton--chico" onClick={() => borrarSeccion(seccion, catId)}>Borrar la sección</button>}
                    </div>
                  )}
                  {!vacia && vistaSumando}
                  <div id={idDeCuerpo(seccion.id)} className="seccion__cuerpo" hidden={plegada}>
                    {vacia && <p className="seccion__vacia">{lectura ? 'Todavía está vacía.' : 'Todavía está vacía. Sumale lo tuyo o arrastrá cosas de otras secciones.'}</p>}
                    {vacia && vistaSumando}
                    {seccion.items.length > 0 && (
                      <ListaConMas
                        items={seccion.items}
                        nombre={seccion.nombre}
                        fijos={enfocar ? [enfocar] : []}
                        render={(i) => (
                          <FilaEditable
                            key={i.id}
                            item={i}
                            claves={claves}
                            marca={marcas.get(i.clave)}
                            onOcultar={ocultarItem}
                            onBorrar={i.tuyo ? borrarTuyo : null}
                            onCambiar={i.tuyo ? cambiarTuyo : null}
                            arrastre={claves ? arrastreDe(seccion) : null}
                            secciones={secciones}
                            onPasar={pasar}
                            enfocar={enfocar === i.id}
                            lectura={lectura}
                          />
                        )}
                      />
                    )}
                  </div>
                </section>
              );
            })}

            {!lectura && (seccionesOcultas.length > 0 || itemsOcultos.length > 0) && (
              <details className="ocultas">
                <summary>Lo que ocultaste ({seccionesOcultas.length + itemsOcultos.length})</summary>
                <ul className="lista">
                  {seccionesOcultas.map((s) => (
                    <li className="ocultas__fila" key={`s${s.id}`}>
                      <span>Sección {s.nombre}</span>
                      <button type="button" className="seccion__ocultar" aria-label={`Mostrar ${s.nombre}`} onClick={() => alternarSeccion(materiaId, s.id)}>Mostrar</button>
                    </li>
                  ))}
                  {itemsOcultos.map((i) => (
                    <li className="ocultas__fila" key={i.id}>
                      <span>{i.origen === 'classroom' ? `${i.nombre}, de Classroom` : i.nombre}</span>
                      <button type="button" className="seccion__ocultar" aria-label={`Mostrar ${i.nombre}`} onClick={() => alternarEn(materiaId, 'ocultos', i.clave)}>Mostrar</button>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>

          <aside id="lo-tuyo" tabIndex={-1} className="materia__lateral" aria-label="Lo tuyo en esta materia">
            {marcarVistos && <Avance titulo="Visto" hechos={vistosVisibles} total={visibles.length} />}
            {marcarVistos && <Avance titulo="Para el parcial" hechos={delParcial.filter((i) => i.visto).length} total={delParcial.length} />}
            <ClassroomDeMateria materia={datos.materia} cr={cr} derecha={derecha} marcas={marcas} secciones={secciones} onPasar={pasar} onOcultar={ocultarItem} arrastre={arrastreDeClassroom} enfocar={enfocar} lectura={lectura} />
            <Panel titulo="Para hacer" abierto>
              <Tareas key={materiaId} materiaId={materiaId} tareas={propia.tareas} />
            </Panel>
            <Panel titulo="Anotaciones" abierto={Boolean(propia.nota)}>
              <Anotaciones key={materiaId} materiaId={materiaId} nota={propia.nota} santo={resumen} />
            </Panel>
            <Panel titulo="Fechas" abierto={propia.fechas.length > 0}>
              <FechasSumadas materiaId={materiaId} fechas={propia.fechas} />
              <PanelFechas materia={datos.materia} items={visibles} />
            </Panel>
            {paraFusionar.length > 1 && (
            <Panel titulo="Fusionar en un PDF">
              <FusionarApuntes
                materia={datos.materia}
                items={paraFusionar}
                secciones={segun(ordenar(agrupar(visibles), agregada, true), todasLasSecciones).map((g) => ({ id: g.id, nombre: g.nombre }))}
                onGuardar={guardarFusion}
              />
            </Panel>
            )}
            <Panel titulo="Bajar en un ZIP">
              <BajarMateria materia={datos.materia} items={visibles.filter((i) => i.origen !== 'propia')} />
            </Panel>
            <CompartirMateria materia={datos.materia} items={delCampus} />
            {enVivo?.sesion && (
              <Panel titulo="Sesión en vivo" abierto>
                <div className="herramienta">
                  <p className="herramienta__nota">Ven sus secciones y abren los PDF y las fotos desde tu campus.</p>
                  <div className="herramienta__botones">
                    <LlevarALaSesion sesion={enVivo.sesion} llevar={llevarMateria(cabeza?.nombre ?? 'Materia', () => segun(ordenar(agrupar(visibles), agregada, !lectura), todasLasSecciones), datos.materia.id)} />
                  </div>
                </div>
              </Panel>
            )}
            <TuVersion materiaId={materiaId} propias={mio.propias.filter((p) => p.base === materiaId)} />
          </aside>
        </div>
      )}
    </div>
  );
}
