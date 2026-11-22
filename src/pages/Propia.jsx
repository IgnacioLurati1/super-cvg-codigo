import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import BajarMateria from '../components/BajarMateria';
import DeLaMateria from '../components/calculadoras/DeLaMateria';
import { abrirEnClassroom, ClassroomDePropia } from '../components/Classroom';
import CompartirPropia from '../components/CompartirPropia';
import LlevarALaSesion from '../components/enVivo/LlevarALaSesion';
import FilaEditable from '../components/FilaEditable';
import { ErrorConReintento, esDeTipo, FiltroDeMateria, IconoDeFiltro } from '../components/Filas';
import FusionarApuntes from '../components/FusionarApuntes';
import IndiceSecciones, { useIndiceAlCostado } from '../components/IndiceSecciones';
import ListaConMas from '../components/ListaConMas';
import { Anotaciones, Avance, FechasSumadas, Panel, Tareas } from '../components/MisCosas';
import PanelFechas from '../components/PanelFechas';
import { Manija, Mas, Puntos, RenombrarSeccion, SumarSeccion, TituloDeSeccion } from '../components/Secciones';
import { Icono } from '../components/Simbolo';
import SumarCosas, { guardarArchivos, soltarSobrantes } from '../components/SumarCosas';
import { useUI } from '../components/ui';
import { cambiarLectura, useContenido, useLectura, useVista } from '../lib/ajustes';
import { useDesplazarAlArrastrar } from '../lib/autoDesplazar';
import { buscar } from '../lib/datos';
import { fusionables } from '../lib/fusion';
import { useSesionEnVivo } from '../lib/enVivo/estado';
import { llevarMateria } from '../lib/enVivo/llevar';
import { leerDeBodega } from '../lib/bodega';
import { useGoogle } from '../lib/google';
import {
  alternarEn, alternarSeccion, conMarcas, estaOculto, fijarOrden, materiaDe, mioActual, plegarSeccion, ponerEnSeccion, renombrarSeccion, useMio, usuarioActual, vaciarParcial,
} from '../lib/mio';
import { segun } from '../lib/ordenSecciones';
import {
  agregarBloques, agregarCategoria, borrarBloque, borrarCategoria, cambiarBloque, esAgregada, llevarBloque, propiaDe, renombrarArchivo, renombrarCategoria,
} from '../lib/propias';
import { LIMITES } from '../lib/propiasSaneo';
import { faltaDe, iconoSinCampus, itemDeBloque, itemDeCampus, mezclarConClassroom, nombreSinCampus, TEXTO_FALTA } from '../lib/propiasVista';
import { resumenDe } from '../lib/santoResumen';
import { tituloDe, useSeo } from '../lib/seo';
import { useArrastreDeSecciones } from '../lib/useArrastreDeSecciones';
import { useCampusDePropia } from '../lib/useCampusDePropia';
import { useSeccionesDePropia } from '../lib/useSeccionesDePropia';
import { useMoverConManija, usePliegue } from '../lib/useSecciones';
import { useBotonesSinMouse } from '../lib/sinMouse';
import { useMarcarVistos } from '../lib/vistos';
import './panel.css';
import './propio.css';
import './propias.css';
import './secciones.css';

const leer = (archivoId, nombre) => leerDeBodega(usuarioActual(), archivoId, nombre);
// Each category is a section, as in a campus course: «p» and its number, like the student's own sections there.
const idDeSeccion = (id) => `propia-seccion-${id}`;
const idDeCuerpo = (id) => `propia-cuerpo-${id}`;
const idDeManija = (id) => `propia-manija-${id}`;
const conArchivos = (e) => [...(e.dataTransfer?.types ?? [])].includes('Files');

/** Something of the campus this reader can't open: it says why, and it can be taken out. */
function SinAbrir({ item, onSacar }) {
  return (
    <li className="fila propia__falta">
      <div className="fila__linea">
        <div className="fila__principal">
          <Icono nombre={iconoSinCampus(item.tuyo.bloque)} tamano="tipo" />
          <span className="fila__texto">
            <span className="fila__nombre">{item.nombre}</span>
            <span className="fila__dato">{item.falta}</span>
          </span>
        </div>
        {onSacar && <button type="button" className="boton boton--secundario boton--chico" aria-label={`Sacar ${item.nombre}`} onClick={() => onSacar(item)}>Sacar</button>}
      </div>
    </li>
  );
}

/** The blocks of a category as items of the course, so they show, move and get marked like the campus ones. One of the
 * campus keeps its course and key (its name and marks are the ones of that course); one of the student's own is marked
 * in this course, by its id. `tuyo` says where it's kept. */
function itemsDe(propia, categoria, campus, marcas) {
  const seccion = { seccionId: `p${categoria.id}`, seccion: categoria.nombre, enPropia: true };
  return categoria.bloques.map((b) => {
    const id = `${propia.id}-${b.id}`;
    const tuyo = { catId: categoria.id, bloque: b };
    if (b.tipo === 'campus') {
      const falta = faltaDe(b, campus);
      if (falta) return { id, clave: `f${b.id}`, nombre: nombreSinCampus(b), falta: TEXTO_FALTA[falta], tuyo, ...seccion };
      const otra = b.materiaId !== propia.base ? campus.suyas?.get(b.materiaId)?.nombre ?? null : null;
      return { ...itemDeCampus(b, campus.contenidos), id, tuyo, otra, ...seccion };
    }
    const item = itemDeBloque(b, { propia, categoria, leer });
    return item ? { ...conMarcas({ ...item, materiaId: propia.id, clave: `p${b.id}`, origen: 'propia' }, marcas), id, tuyo, ...seccion } : null;
  }).filter(Boolean);
}

export default function Propia() {
  const { id } = useParams();
  const propia = propiaDe(useMio(), id);
  useSeo({ titulo: tituloDe('Materia'), noindex: true });

  if (!propia) {
    return (
      <div className="contenedor pagina">
        <p className="volver"><Link to="/materias">Materias</Link></p>
        <h1>Materia</h1>
        <p>Esta materia no está en este navegador. Puede que la hayas borrado.</p>
      </div>
    );
  }

  // The student's own sections of a campus course show inside it.
  if (esAgregada(propia)) return <Navigate to={`/materias/${propia.de}`} replace />;
  return <MateriaPropia propia={propia} />;
}

/** A course of one's own, arranged right here as a campus course: its sections (the categories, and the topics of its
 * Classroom course) are renamed, moved, folded and filled in place, and what's in them is renamed, marked, moved and
 * deleted (hidden, what comes from Classroom). Editar keeps its name, its Classroom course and deleting it. */
function MateriaPropia({ propia }) {
  const { confirmar, avisar } = useUI();
  const mio = useMio();
  const google = useGoogle();
  const campus = useCampusDePropia(propia);
  const alCostado = useIndiceAlCostado();
  const vista = useVista('materia');
  const contenido = useContenido();
  const lectura = useLectura();
  const enVivo = useSesionEnVivo();
  const [indiceClassroom, setIndiceClassroom] = useState([]);
  const marcarVistos = useMarcarVistos();
  const [filtro, setFiltro] = useState('');
  const [tipo, setTipo] = useState('');
  const [soloSinVer, setSoloSinVer] = useState(false);
  const [soloParcial, setSoloParcial] = useState(false);
  const [recienOculto, setRecienOculto] = useState(null);
  const deshacer = useRef(null);
  useDesplazarAlArrastrar();

  // The form for a new section, the section whose «Sumar» is open, the one with its options open or being renamed.
  const [creando, setCreando] = useState(false);
  const botonSumar = useRef(null);
  const [sumandoEn, setSumandoEn] = useState(null);
  const [opcionesDe, setOpcionesDe] = useState(null);
  const [renombrando, setRenombrando] = useState(null);
  const [anuncio, setAnuncio] = useState('');
  // A card being dragged ({ clave, seccion, tuyo }), the section it (or a file of the computer) is over, and the card
  // that just arrived somewhere (it gets the focus).
  const arrastrado = useRef(null);
  const [sobre, setSobre] = useState(null);
  const [enfocar, setEnfocar] = useState(null);

  const marcas = materiaDe(mio, propia.id);
  const { plegadas } = marcas;
  const base = propia.base ? campus.suyas?.get(propia.base) : null;
  const usaCampus = propia.categorias.some((c) => c.bloques.some((b) => b.tipo === 'campus'));

  // Its Classroom course: each topic is a section, as the campus' are in a campus course (useSeccionesDePropia.js).
  const { cr, deClassroom, temas, ordenTodo, mover: moverEntre } = useSeccionesDePropia(propia);
  const aLaVista = deClassroom.filter((i) => !estaOculto(mio, i));
  const enSeccion = (id) => aLaVista.filter((i) => i.seccionId === id);
  const todas = segun([
    ...propia.categorias.map((c) => ({ id: `p${c.id}`, catId: c.id, nombre: c.nombre, items: mezclarConClassroom(itemsDe(propia, c, campus, marcas), enSeccion(`p${c.id}`), marcas.orden[`p${c.id}`]) })),
    // A topic everything left (moved or hidden) goes, as an empty section of the campus.
    ...temas.filter((t) => !marcas.secciones.includes(t.id)).map((t) => ({ ...t, tema: true, items: enSeccion(t.id) })).filter((t) => t.items.length),
  ], ordenTodo);
  const temasOcultos = temas.filter((t) => marcas.secciones.includes(t.id));
  const itemsOcultos = deClassroom.filter((i) => marcas.ocultos.includes(i.clave) && !marcas.secciones.includes(i.seccionId));
  const nadaTodavia = !propia.classroom && todas.every((g) => !g.items.length);
  // Everything that opens, for the search, the filters and the panels on the side.
  const visibles = todas.flatMap((g) => g.items.filter((i) => !i.falta));
  const sinVer = soloSinVer && marcarVistos;
  const hayFiltro = Boolean(filtro.trim() || tipo || sinVer || soloParcial);
  const filtrar = (items) => {
    let lista = items.filter((i) => !i.falta);
    if (tipo) lista = lista.filter((i) => esDeTipo(i, tipo));
    if (sinVer) lista = lista.filter((i) => !i.visto);
    if (soloParcial) lista = lista.filter((i) => i.parcial);
    return filtro.trim() ? buscar(lista, filtro, 1000) : lista;
  };
  // With a filter, only the sections with something that matches. With the tools hidden, the empty ones go: there is
  // nothing to read in them.
  const grupos = hayFiltro
    ? todas.map((g) => ({ ...g, items: filtrar(g.items) })).filter((g) => g.items.length)
    : lectura ? todas.filter((g) => g.items.length) : todas;
  const delParcial = visibles.filter((i) => i.parcial);
  const paraFusionar = fusionables(visibles);
  // Where a card can go: what the student added, only to their own sections; what comes from Classroom, to any.
  const secciones = todas.map((g) => ({ id: g.id, nombre: g.nombre }));
  const seccionesTuyas = todas.filter((g) => g.catId !== undefined).map((g) => ({ id: g.id, nombre: g.nombre }));
  const recibe = (seccion, tuyo) => !tuyo || seccion.catId !== undefined;
  const materias = campus.materias ?? [];
  // The subject of El Santo Resumen opens on its own when the name says which one, or the campus course it came from.
  const resumen = resumenDe(propia.nombre) ?? resumenDe(base?.nombre ?? '');
  const santo = resumen?.slug ?? '';
  // What the panels on the side need of the course: its id (the student's marks) and its name.
  const comoMateria = { id: propia.id, nombre: propia.nombre };

  // Something just went into a folded section: it opens, to show it.
  const abrirSiPlegada = (seccionId) => {
    if (plegadas.includes(seccionId)) plegarSeccion(propia.id, seccionId, false);
  };
  const alternarPliegue = usePliegue(propia.id, plegadas, idDeCuerpo);
  const { moviendo, setMoviendo, enfocarMover } = useMoverConManija(idDeManija);
  const conBotones = useBotonesSinMouse();
  const enfocarSeccion = (seccionId) => requestAnimationFrame(() => document.getElementById(idDeSeccion(seccionId))?.focus());

  // A section to place `lugar` among the ones on screen. With topics, the whole order is kept in the student's marks;
  // a category also moves among the others, so the course keeps it when it's shared.
  const moverSeccionA = (seccion, lugar) => {
    const ids = grupos.map((g) => g.id);
    if (!moverEntre(seccion.id, lugar, ids)) return false;
    setAnuncio(`${seccion.nombre} quedó en el lugar ${lugar + 1} de ${ids.length}`);
    return true;
  };
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

  const cerrarCrear = () => {
    setCreando(false);
    requestAnimationFrame(() => botonSumar.current?.focus());
  };
  const crearSeccion = (nombre) => {
    const catId = agregarCategoria(propia.id, nombre.trim());
    if (!catId) return `Una materia lleva hasta ${LIMITES.categorias} secciones.`;
    setCreando(false);
    avisar(`Sumaste la sección ${nombre.trim()}`);
    enfocarSeccion(`p${catId}`);
    return null;
  };

  const cerrarSumando = (seccionId) => {
    setSumandoEn(null);
    requestAnimationFrame(() => document.querySelector(`[aria-controls="sumando-${seccionId}"]`)?.focus());
  };
  // What's added goes at the end of the section, and the first one gets the focus.
  const sumarA = (seccion) => (bloques) => {
    const antes = propia.categorias.find((c) => c.id === seccion.catId)?.bloques.length ?? 0;
    const n = agregarBloques(propia.id, seccion.catId, bloques);
    if (!n) return 0;
    const primero = propiaDe(mioActual(), propia.id)?.categorias.find((c) => c.id === seccion.catId)?.bloques[antes];
    setSumandoEn(null);
    abrirSiPlegada(seccion.id);
    if (primero) setEnfocar(`${propia.id}-${primero.id}`);
    return n;
  };
  const soltarArchivos = async (seccion, lista) => {
    avisar(lista.length === 1 ? 'Guardando el archivo' : `Guardando ${lista.length} archivos`);
    let guardados;
    try {
      guardados = await guardarArchivos(lista);
    } catch {
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

  const guardarFusion = async (destino, archivo) => {
    const seccion = todas.find((g) => g.id === destino?.id);
    if (!seccion || seccion.catId === undefined) return false;
    const { bloques, avisos } = await guardarArchivos([archivo]);
    const n = bloques.length ? sumarA(seccion)(bloques) : 0;
    soltarSobrantes(bloques.slice(n));
    if (!n && bloques.length) avisos.unshift(`No entró. Una sección lleva hasta ${LIMITES.bloques} cosas.`);
    if (avisos.length) avisar(avisos.join(' '), 'error');
    return n > 0;
  };

  const borrarSeccion = async (seccion) => {
    const cuantos = seccion.items.filter((i) => i.tuyo).length;
    const movidos = seccion.items.length - cuantos;
    const texto = [
      cuantos ? `Se saca ${movidos ? 'lo que sumaste' : 'todo lo que tiene'} (${cuantos === 1 ? 'una cosa' : `${cuantos} cosas`}). Tus archivos se borran de este navegador.` : '',
      movidos ? 'Lo de Classroom vuelve a su tema.' : '',
    ].filter(Boolean).join(' ') || undefined;
    if (!(await confirmar({ titulo: `¿Borrar ${seccion.nombre}?`, texto, boton: 'Borrar', peligro: true }))) return;
    borrarCategoria(propia.id, seccion.catId);
    setOpcionesDe(null);
    avisar(`Borraste ${seccion.nombre}`);
    requestAnimationFrame(() => botonSumar.current?.focus());
  };
  const moverSeccion = (seccion, salto) => {
    if (!moverSeccionA(seccion, grupos.indexOf(seccion) + salto)) return;
    requestAnimationFrame(() => document.querySelector(`[aria-controls="opciones-${seccion.id}"]`)?.focus());
  };
  // A topic, or something of Classroom, goes to «Lo que ocultaste», at the end, and comes back from there. The notice
  // floats at the foot of the screen with «Deshacer»: the page doesn't jump to the top, so a long course is cleaned up
  // from where it is.
  useEffect(() => {
    if (recienOculto) deshacer.current?.focus({ preventScroll: true });
  }, [recienOculto]);
  const cerrarOculto = () => {
    const volver = recienOculto?.volver;
    setRecienOculto(null);
    if (volver) requestAnimationFrame(() => document.getElementById(volver)?.focus({ preventScroll: true }));
  };
  const ocultarSeccion = (seccion) => {
    alternarSeccion(propia.id, seccion.id);
    setOpcionesDe(null);
    setRecienOculto({ nombre: seccion.nombre, deshacer: () => alternarSeccion(propia.id, seccion.id) });
  };
  const ocultarItem = (item) => {
    alternarEn(propia.id, 'ocultos', item.clave);
    setRecienOculto({ nombre: item.nombre, volver: idDeSeccion(item.seccionId), deshacer: () => alternarEn(propia.id, 'ocultos', item.clave) });
  };
  // «Vaciar la lista» of the exam: also what came from a campus course keeps its mark there, so it goes one by one.
  const vaciarDelParcial = async () => {
    if (!(await confirmar({ titulo: '¿Vaciar la lista del parcial?', boton: 'Vaciar', peligro: true }))) return;
    vaciarParcial(propia.id);
    for (const i of delParcial) if (i.materiaId !== propia.id) alternarEn(i.materiaId, 'parcial', i.clave);
  };

  // Something of the campus comes back from the campus: it goes without asking. A file, a text or a link do not.
  const borrar = async (item) => {
    const { bloque, catId } = item.tuyo;
    const escrito = bloque.tipo !== 'campus';
    const texto = bloque.tipo === 'archivo' ? 'El archivo se borra de este navegador.' : undefined;
    if (escrito && !(await confirmar({ titulo: `¿Borrar ${item.nombre}?`, texto, boton: 'Borrar', peligro: true }))) return;
    borrarBloque(propia.id, catId, bloque.id);
    avisar(escrito ? `Borraste ${item.nombre}` : `Sacaste ${item.nombre}`);
    enfocarSeccion(item.seccionId);
  };
  const cambiar = (item, cambios) => cambiarBloque(propia.id, item.tuyo.catId, item.tuyo.bloque.id, cambios);
  // The new order of a section (`claves`), with `item` in it: what came from Classroom keeps it in the student's marks;
  // what the student added, in its category, before the next one of theirs. False if it didn't fit.
  const ordenarEn = (seccion, claves, item) => {
    const porClave = new Map([...seccion.items, item].map((i) => [i.clave, i]));
    if (claves.some((c) => porClave.get(c)?.origen === 'classroom')) fijarOrden(propia.id, seccion.id, claves);
    if (!item.tuyo) return true;
    const tuyos = claves.filter((c) => porClave.get(c)?.tuyo);
    const siguiente = porClave.get(tuyos[tuyos.indexOf(item.clave) + 1]);
    return llevarBloque(propia.id, item.tuyo.bloque.id, seccion.catId, siguiente ? siguiente.tuyo.bloque.id : null);
  };
  const mover = (seccion) => (item, salto) => {
    const claves = seccion.items.map((i) => i.clave);
    const desde = claves.indexOf(item.clave);
    const hasta = desde + salto;
    if (desde === -1 || hasta < 0 || hasta >= claves.length) return;
    [claves[desde], claves[hasta]] = [claves[hasta], claves[desde]];
    ordenarEn(seccion, claves, item);
  };
  // A card goes to `seccion`, in the place it has in `claves`. One of Classroom back in its topic stops being moved.
  const llevarA = (item, seccion, claves) => {
    const otra = item.seccionId !== seccion.id;
    if (item.tuyo) {
      if (!ordenarEn(seccion, claves, item)) {
        avisar(`No entró. Una sección lleva hasta ${LIMITES.bloques} cosas.`, 'error');
        return false;
      }
    } else {
      if (otra) ponerEnSeccion(propia.id, item.clave, seccion.id === item.tema ? null : seccion.id);
      fijarOrden(propia.id, seccion.id, claves);
    }
    if (otra) {
      abrirSiPlegada(seccion.id);
      avisar(`Pasaste ${item.nombre} a ${seccion.nombre}`);
    }
    return true;
  };
  // A file of one's own is renamed in the course, so the name goes with it when it's shared. One of the campus keeps
  // the student's name for it in its own course (FilaEditable does that).
  const renombrar = (item, nombre) => {
    if (!renombrarArchivo(propia.id, item.tuyo.catId, item.tuyo.bloque.id, nombre)) avisar('Ponele un nombre.', 'error');
  };
  // Without a drag: at the end of the section.
  const pasar = (item, destino) => {
    const seccion = todas.find((g) => g.id === destino);
    if (!seccion || !recibe(seccion, item.tuyo)) return;
    if (llevarA(item, seccion, [...seccion.items.map((i) => i.clave).filter((c) => c !== item.clave), item.clave])) setEnfocar(item.id);
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
    const item = todas.find((g) => g.id === origen.seccion)?.items.find((i) => i.clave === origen.clave);
    if (!item || !recibe(seccion, item.tuyo)) return;
    const claves = seccion.items.map((i) => i.clave).filter((c) => c !== item.clave);
    const lugar = antesDe ? claves.indexOf(antesDe) : -1;
    claves.splice(lugar === -1 ? claves.length : lugar, 0, item.clave);
    llevarA(item, seccion, claves);
  };
  const arrastreDe = (seccion) => ({
    empezar: (clave) => {
      const item = seccion.items.find((i) => i.clave === clave);
      arrastrado.current = item ? { clave, seccion: seccion.id, tuyo: Boolean(item.tuyo) } : null;
    },
    soltar: (antesDe) => soltarEn(seccion, antesDe),
    terminar,
  });
  // Over a section: a card that can go there, or files of the computer (to the student's own sections).
  const sobreSeccion = (seccion) => (e) => {
    const archivos = conArchivos(e);
    if (archivos ? seccion.catId === undefined : !arrastrado.current || !recibe(seccion, arrastrado.current.tuyo)) return;
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

  // The index, as in a campus course: its sections and, with Classroom, its stream and topics. With one, it's not worth it.
  const indice = grupos.filter((g) => g.items.length).map((g) => ({ clave: `s${g.id}`, nombre: g.nombre, destino: idDeSeccion(g.id), seccion: g.id }));
  const delClassroom = propia.classroom ? indiceClassroom : [];
  const vistaIndice = indice.length + delClassroom.length > 1 && (
    <IndiceSecciones alCostado={alCostado} secciones={indice} classroom={delClassroom} vacio={null} onIr={(e) => (e.classroom ? abrirEnClassroom(e.destino) : abrirSiPlegada(e.seccion))} />
  );

  return (
    <div className="contenedor pagina materia propia" data-vista={vista} data-contenido={contenido} data-arrastrando={arrastrada !== null || undefined}>
      <p className="volver"><Link to="/materias">Materias</Link></p>
      <div className="titular">
        <div>
          <h1>{propia.nombre}</h1>
          <p className="titular__fecha">{base ? <>Tuya, a partir de <Link to={`/materias/${base.id}`}>{base.nombre}</Link></> : 'Tuya, en este navegador'}</p>
        </div>
        <div className="titular__botones materia__herramientas">
          {!lectura && (
            <button ref={botonSumar} type="button" className="boton boton--chico materia__nueva" aria-expanded={creando} aria-controls={creando ? 'sumar-seccion' : undefined} onClick={() => (creando ? cerrarCrear() : setCreando(true))}>
              <Mas />Sumar una sección
            </button>
          )}
          <button type="button" className="boton boton--secundario boton--chico" onClick={() => { setCreando(false); setSumandoEn(null); setOpcionesDe(null); setRenombrando(null); cambiarLectura(!lectura); }}>
            {lectura ? 'Mostrar las herramientas' : 'Esconder las herramientas'}
          </button>
          <Link className="boton boton--secundario boton--chico" to={`/propias/${propia.id}/editar`}>Editar</Link>
        </div>
      </div>
      {creando && !lectura && <SumarSeccion onCrear={crearSeccion} onCerrar={cerrarCrear} ayuda="Por ejemplo, Para el final o Resúmenes. Va al final." />}
      {resumen && (
        <p className="materia__santo">
          <a href={resumen.url} target="_blank" rel="noreferrer">
            Resumen de {resumen.nombre} en El Santo Resumen<span className="solo-lectores">, se abre en otra pestaña</span>
          </a>
        </p>
      )}
      <DeLaMateria nombre={base?.nombre ?? propia.nombre} />
      <p className="materia__a-lo-tuyo"><a href="#lo-tuyo">Ir a tus tareas y anotaciones</a></p>
      {usaCampus && campus.error && !campus.contenidos && <ErrorConReintento texto={campus.error} recargar={campus.recargar} />}
      <div className="materia__cuerpo">
        {alCostado && vistaIndice}
        <div className="materia__contenido" aria-busy={usaCampus && campus.cargando ? 'true' : undefined}>
          {!alCostado && vistaIndice}
          {visibles.length > 0 && (
            <FiltroDeMateria filtro={filtro} onFiltro={setFiltro} tipo={tipo} onTipo={setTipo}>
              <div className="tipos" role="group" aria-label="Mostrar también">
                {marcarVistos && <button type="button" className="tipos__opcion" aria-pressed={soloSinVer} onClick={() => setSoloSinVer((v) => !v)}><IconoDeFiltro nombre="ojo" />Sin ver</button>}
                <button type="button" className="tipos__opcion" aria-pressed={soloParcial} onClick={() => setSoloParcial((v) => !v)}><IconoDeFiltro nombre="marcador" tono="pdf" />Para el parcial</button>
                {soloParcial && delParcial.length > 0 && <button type="button" className="tipos__opcion" onClick={vaciarDelParcial}>Vaciar la lista</button>}
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
          <p role="status" className="materia__sin-nada">{hayFiltro && !grupos.length ? (soloParcial && !delParcial.length ? 'Todavía no sumaste nada al parcial. Abrí las opciones de un ítem.' : 'No hay nada para mostrar acá. Probá con otro filtro o mirá lo que ocultaste.') : ''}</p>
          {lectura && !hayFiltro && !grupos.length && !propia.classroom && <p>Todavía está vacía. Mostrá las herramientas para sumarle archivos, textos, enlaces o cosas del campus.</p>}
          {!lectura && !todas.length && !creando && !propia.classroom && <p>No tiene secciones. Sumá una para empezar.</p>}
          <p role="status" className="solo-lectores">{anuncio}</p>
          <p id="mover-ayuda" hidden>{conBotones ? 'Arrastrala, movela con las flechas arriba y abajo, o tocala para subirla o bajarla.' : 'Arrastrala o movela con las flechas arriba y abajo.'}</p>

          {grupos.map((seccion, lugar) => {
            const claves = lectura || hayFiltro ? null : seccion.items.map((i) => i.clave);
            const vacia = !seccion.items.length;
            const tuya = seccion.catId !== undefined;
            // A course with nothing yet shows how to fill its first section, open. Otherwise an empty one waits for its «Sumar».
            const deEntrada = vacia && nadaTodavia && lugar === 0;
            const sumando = !lectura && (sumandoEn === seccion.id || deEntrada);
            const conOpciones = !lectura && opcionesDe === seccion.id;
            // Folded as the student left it; with a filter, open; while a section is dragged, every one.
            const plegada = arrastrada !== null || (!hayFiltro && plegadas.includes(seccion.id));
            const conManija = !lectura && !hayFiltro && grupos.length > 1 && renombrando !== seccion.id;
            const vistaSumando = sumando && (
              <div id={`sumando-${seccion.id}`} className="seccion__sumando" onKeyDown={(e) => { if (e.key === 'Escape' && !deEntrada) cerrarSumando(seccion.id); }}>
                <SumarCosas
                  nombre={seccion.nombre}
                  bloques={propia.categorias.find((c) => c.id === seccion.catId)?.bloques ?? []}
                  materias={materias}
                  inicialCampus={propia.base}
                  classroom={google.disponible ? { nombre: propia.nombre, inicial: propia.classroom ?? (propia.base === null ? null : materiaDe(mio, propia.base).classroom) } : null}
                  santo={santo}
                  onSumar={sumarA(seccion)}
                  onCerrar={deEntrada ? null : () => cerrarSumando(seccion.id)}
                  enfocar={sumandoEn === seccion.id}
                />
              </div>
            );
            return (
              <section
                className="bloque"
                key={seccion.id}
                data-soltar={sobre === seccion.id || undefined}
                data-tuya={tuya ? '' : undefined}
                data-agarrada={arrastrada === seccion.id || undefined}
                aria-labelledby={idDeSeccion(seccion.id)}
                onDragOver={lectura ? undefined : sobreSeccion(seccion)}
                onDragLeave={lectura ? undefined : dejarSeccion(seccion)}
                onDrop={lectura ? undefined : soltarSobre(seccion)}
              >
                <div className="seccion__cabeza">
                  {renombrando === seccion.id && !lectura ? (
                    <>
                      <h2 id={idDeSeccion(seccion.id)} tabIndex={-1} className="solo-lectores">{seccion.nombre}</h2>
                      <RenombrarSeccion
                        nombre={seccion.nombre}
                        original={seccion.tema && seccion.nombre !== seccion.original ? seccion.original : null}
                        deClassroom
                        onGuardar={(nombre) => {
                          if (tuya) renombrarCategoria(propia.id, seccion.catId, nombre.trim());
                          else renombrarSeccion(propia.id, seccion.id, nombre);
                          setRenombrando(null);
                          enfocarSeccion(seccion.id);
                        }}
                        onVolver={() => {
                          renombrarSeccion(propia.id, seccion.id, '');
                          setRenombrando(null);
                          enfocarSeccion(seccion.id);
                        }}
                        onCerrar={() => { setRenombrando(null); enfocarSeccion(seccion.id); }}
                      />
                    </>
                  ) : (
                    <div className="seccion__titular">
                      {conManija && (
                        <button id={idDeManija(seccion.id)} type="button" className="seccion__manija" aria-label={`Mover ${seccion.nombre}`} aria-describedby="mover-ayuda" aria-expanded={conBotones ? moviendo === seccion.id : undefined} {...arrastreSecciones.manija(seccion.id)}>
                          <Manija />
                        </button>
                      )}
                      {conManija && moviendo === seccion.id && arrastrada === null && (
                        <span className="seccion__mover" role="group" aria-label={`Mover ${seccion.nombre}`}>
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
                      <TituloDeSeccion id={idDeSeccion(seccion.id)} cuerpo={idDeCuerpo(seccion.id)} nombre={seccion.nombre} plegada={plegada} cuantos={seccion.items.length} onAlternar={() => alternarPliegue(seccion)} />
                    </div>
                  )}
                  {renombrando !== seccion.id && !lectura && (
                    <div className="seccion__acciones">
                      {tuya && !deEntrada && (
                        <button type="button" className="seccion__sumar" aria-expanded={sumandoEn === seccion.id} aria-controls={`sumando-${seccion.id}`} aria-label={`Sumar a ${seccion.nombre}`} onClick={() => (sumandoEn === seccion.id ? cerrarSumando(seccion.id) : setSumandoEn(seccion.id))}>
                          <Mas />Sumar
                        </button>
                      )}
                      {seccion.tema && <button type="button" className="seccion__ocultar" aria-label={`Ocultar ${seccion.nombre}`} onClick={() => ocultarSeccion(seccion)}>Ocultar</button>}
                      <button type="button" className="fila__opciones seccion__mas" aria-expanded={conOpciones} aria-controls={`opciones-${seccion.id}`} aria-label={`Opciones de ${seccion.nombre}`} onClick={() => setOpcionesDe((o) => (o === seccion.id ? null : seccion.id))}>
                        <Puntos />
                      </button>
                    </div>
                  )}
                </div>
                {!lectura && (
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
                    {grupos.length > 1 && (conBotones || !conManija) && (
                      <>
                        <button type="button" className="boton boton--secundario boton--chico" disabled={lugar <= 0} onClick={() => moverSeccion(seccion, -1)}>Subir</button>
                        <button type="button" className="boton boton--secundario boton--chico" disabled={lugar >= grupos.length - 1} onClick={() => moverSeccion(seccion, 1)}>Bajar</button>
                      </>
                    )}
                    {tuya && <button type="button" className="boton boton--secundario boton--chico" onClick={() => borrarSeccion(seccion)}>Borrar la sección</button>}
                  </div>
                )}
                {!deEntrada && vistaSumando}
                <div id={idDeCuerpo(seccion.id)} className="seccion__cuerpo" hidden={plegada}>
                  {deEntrada && <p className="seccion__vacia">Todavía está vacía. Sumale archivos, textos, enlaces o cosas del campus.</p>}
                  {vacia && !deEntrada && <p className="seccion__vacia">Nada por ahora. Sumale cosas o arrastralas de otra sección.</p>}
                  {deEntrada && vistaSumando}
                  {!vacia && (
                    <ListaConMas
                      items={seccion.items}
                      nombre={seccion.nombre}
                      fijos={enfocar ? [enfocar] : []}
                      render={(i) => (i.falta ? <SinAbrir key={i.id} item={i} onSacar={lectura ? null : borrar} /> : (
                        <FilaEditable
                          key={i.id}
                          item={i}
                          claves={claves}
                          marca={i.tuyo ? i.otra ?? (i.santo ? 'El Santo Resumen' : null) : i.creado > cr.revisado ? 'Nuevo' : null}
                          onOcultar={ocultarItem}
                          onBorrar={i.tuyo ? borrar : null}
                          onCambiar={i.tuyo ? cambiar : null}
                          onMover={mover(seccion)}
                          onRenombrar={i.tuyo?.bloque.tipo === 'archivo' ? renombrar : null}
                          enLinea={i.tipo === 'texto'}
                          arrastre={claves ? arrastreDe(seccion) : null}
                          secciones={i.tuyo ? seccionesTuyas : secciones}
                          onPasar={pasar}
                          enfocar={enfocar === i.id}
                          lectura={lectura}
                        />
                      ))}
                    />
                  )}
                </div>
              </section>
            );
          })}
          {propia.classroom && <ClassroomDePropia curso={propia.classroom} onIndice={setIndiceClassroom} />}
          {!lectura && (temasOcultos.length > 0 || itemsOcultos.length > 0) && (
            <details className="ocultas">
              <summary>Lo que ocultaste ({temasOcultos.length + itemsOcultos.length})</summary>
              <ul className="lista">
                {temasOcultos.map((t) => (
                  <li className="ocultas__fila" key={t.id}>
                    <span>Sección {t.nombre}</span>
                    <button type="button" className="seccion__ocultar" aria-label={`Mostrar ${t.nombre}`} onClick={() => alternarSeccion(propia.id, t.id)}>Mostrar</button>
                  </li>
                ))}
                {itemsOcultos.map((i) => (
                  <li className="ocultas__fila" key={i.id}>
                    <span>{i.nombre}</span>
                    <button type="button" className="seccion__ocultar" aria-label={`Mostrar ${i.nombre}`} onClick={() => alternarEn(propia.id, 'ocultos', i.clave)}>Mostrar</button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
        <aside id="lo-tuyo" tabIndex={-1} className="materia__lateral" aria-label="Lo tuyo en esta materia">
          {marcarVistos && <Avance titulo="Visto" hechos={visibles.filter((i) => i.visto).length} total={visibles.length} />}
          {marcarVistos && <Avance titulo="Para el parcial" hechos={delParcial.filter((i) => i.visto).length} total={delParcial.length} />}
          <Panel titulo="Para hacer" abierto>
            <Tareas key={propia.id} materiaId={propia.id} tareas={marcas.tareas} />
          </Panel>
          <Panel titulo="Anotaciones" abierto={Boolean(marcas.nota)}>
            <Anotaciones key={propia.id} materiaId={propia.id} nota={marcas.nota} santo={resumen} />
          </Panel>
          <Panel titulo="Fechas" abierto={marcas.fechas.length > 0}>
            <FechasSumadas materiaId={propia.id} fechas={marcas.fechas} />
            <PanelFechas materia={comoMateria} items={visibles} />
          </Panel>
          {paraFusionar.length > 1 && seccionesTuyas.length > 0 && (
            <Panel titulo="Fusionar en un PDF">
              <FusionarApuntes materia={comoMateria} items={paraFusionar} secciones={seccionesTuyas} onGuardar={guardarFusion} />
            </Panel>
          )}
          <Panel titulo="Bajar en un ZIP">
            <BajarMateria materia={comoMateria} items={visibles} />
          </Panel>
          <CompartirPropia propia={propia} />
          {enVivo?.sesion && (
            <details className="panel" open>
              <summary>Sesión en vivo</summary>
              <div className="panel__cuerpo">
                <div className="herramienta">
                  <p className="herramienta__nota">Ven sus secciones y abren los PDF y las fotos desde tu compu.</p>
                  <div className="herramienta__botones">
                    <LlevarALaSesion sesion={enVivo.sesion} llevar={llevarMateria(propia.nombre, () => todas, propia.id)} />
                  </div>
                </div>
              </div>
            </details>
          )}
        </aside>
      </div>
    </div>
  );
}
