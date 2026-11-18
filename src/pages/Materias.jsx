import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Campo from '../components/Campo';
import DetallesAnimados from '../components/DetallesAnimados';
import { Cargando, ErrorConReintento } from '../components/Filas';
import { Puntos } from '../components/Secciones';
import Simbolo from '../components/Simbolo';
import { useUI } from '../components/ui';
import { useAjustes } from '../lib/ajustes';
import { cargarMaterias, cargarPerfil } from '../lib/campus';
import { useColorDeMateria } from '../lib/colores';
import { materiaDe, ponerEnLista, ponerTarjeta, useMio } from '../lib/mio';
import { resumenDePropia } from '../lib/propiasVista';
import { tituloDe, useSeo } from '../lib/seo';
import { ESTILOS_DE_TARJETA, NOMBRES_DE_TARJETA } from '../lib/tarjetas';
import { useConsulta } from '../lib/useConsulta';
import { useMarcarVistos } from '../lib/vistos';
import './panel.css';
import './materias.css';

function resumen(propia, marcarVistos) {
  const pendientes = propia.tareas.filter((t) => !t.hecha).length;
  const partes = [];
  if (pendientes) partes.push(pendientes === 1 ? 'Una tarea' : `${pendientes} tareas`);
  if (marcarVistos && propia.vistos.length) partes.push(propia.vistos.length === 1 ? '1 visto' : `${propia.vistos.length} vistos`);
  return partes.join(', ');
}

const Chinche = () => (
  <span className="materias__fijada" aria-hidden="true">
    <svg viewBox="0 0 24 24" focusable="false"><path d="M9 3h6l-1 6 4 4H6l4-4zM12 13v8" /></svg>
  </span>
);

// The id of a card's options, from the course: a number of the campus or the id of one of the student's own.
const idDeOpciones = (id) => `opciones-materia-${id}`;
// The card is drawn again in its new group: until React has moved it, the old one may still be there. A few frames, until
// the focus stays.
const enfocar = (selector, intentos = 10) =>
  requestAnimationFrame(() => {
    const el = document.querySelector(selector);
    el?.focus();
    if (intentos > 1) requestAnimationFrame(() => {
      if (!el?.isConnected || document.activeElement !== el) enfocar(selector, intentos - 1);
    });
  });

/** What can be done with a course from its card: pin it, archive it and pick its look. */
function Opciones({ m, abierta, alAbrir, alCerrar }) {
  const { avisar } = useUI();
  const ajustes = useAjustes();
  const marcas = materiaDe(useMio(), m.id);
  const id = idDeOpciones(m.id);
  const boton = `[aria-controls="${id}"]`;

  // A tap anywhere else closes it, and so does the focus leaving it with Tab (it would go to the next card, under the
  // open menu). Escape closes it too and gives the focus back to its button, unless it was closing the list of «Tarjeta».
  useEffect(() => {
    if (!abierta) return undefined;
    const dentro = (el) => el instanceof Element && el.closest(`#${CSS.escape(id)}, ${boton}`);
    const fuera = (e) => {
      if (!dentro(e.target)) alCerrar();
    };
    const sale = (e) => {
      if (dentro(e.target) && e.relatedTarget && !dentro(e.relatedTarget)) alCerrar();
    };
    const escape = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented || e.target instanceof HTMLSelectElement) return;
      alCerrar();
      document.querySelector(boton)?.focus();
    };
    document.addEventListener('pointerdown', fuera);
    document.addEventListener('focusout', sale);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', fuera);
      document.removeEventListener('focusout', sale);
      document.removeEventListener('keydown', escape);
    };
  }, [abierta, alCerrar, boton, id]);

  const guardar = (hecho) => {
    if (!hecho) avisar('No se pudo guardar. Probá de nuevo.', 'error');
    return hecho;
  };
  // The card changes group: the focus follows it there, or goes to «Archivadas», which starts folded.
  const mover = (lugar) => {
    alCerrar();
    if (!guardar(ponerEnLista(m.id, lugar))) return;
    if (lugar === 'archivada') {
      avisar(`Archivaste ${m.nombre}`);
      enfocar('.materias__archivadas > summary');
    } else {
      avisar(lugar === 'fijada' ? `Fijaste ${m.nombre} arriba` : `${m.nombre} volvió a su lugar`);
      enfocar(boton);
    }
  };

  return (
    <>
      <button
        type="button"
        className="fila__opciones materias__opciones"
        aria-expanded={abierta}
        aria-controls={id}
        aria-label={`Opciones de ${m.nombre}`}
        onClick={() => (abierta ? alCerrar() : alAbrir())}
        // It sits on its card on purpose, in the room the card keeps free for it (materias.css): the check of what lands
        // on top of something else (scripts/encimados.mjs) leaves it out, and the flows check the name never goes under it.
        data-encima-ok
      >
        <Puntos />
      </button>
      <div
        id={id}
        className="materias__menu"
        hidden={!abierta}
      >
        {marcas.enLista !== 'archivada' && (
          <button type="button" className="boton boton--secundario boton--chico" onClick={() => mover(marcas.enLista === 'fijada' ? null : 'fijada')}>
            {marcas.enLista === 'fijada' ? 'Dejar de fijar' : 'Fijar arriba'}
          </button>
        )}
        <button type="button" className="boton boton--secundario boton--chico" onClick={() => mover(marcas.enLista === 'archivada' ? null : 'archivada')}>
          {marcas.enLista === 'archivada' ? 'Sacar del archivo' : 'Archivar'}
        </button>
        <Campo etiqueta="Tarjeta">
          <select className="campo__control" value={marcas.tarjeta ?? ''} onChange={(e) => guardar(ponerTarjeta(m.id, e.target.value || null))}>
            <option value="">Como las demás ({NOMBRES_DE_TARJETA[ajustes.tarjeta]})</option>
            {ESTILOS_DE_TARJETA.map((e) => <option key={e} value={e}>{NOMBRES_DE_TARJETA[e]}</option>)}
          </select>
        </Campo>
      </div>
    </>
  );
}

/** One course: `m` with { id, nombre, a (where it opens), base (the campus course of its color), dato, propia }. */
function Tarjeta({ m, abierta, alAbrir, alCerrar }) {
  const ajustes = useAjustes();
  const colorDe = useColorDeMateria();
  const marcas = materiaDe(useMio(), m.id);
  const color = m.base ? colorDe(m.base) : undefined;
  const conOpciones = !ajustes.lectura;
  return (
    <li className="materias__item" data-tarjeta={marcas.tarjeta ?? ajustes.tarjeta} data-materia={color} data-con-opciones={conOpciones || undefined}>
      <Link className="materias__enlace" to={m.a}>
        <Simbolo id={m.base} nombre={m.nombre} tamano="grande" sinMateria={m.propia ? 'estrella' : undefined} />
        <span className="materias__texto">
          <span className="materias__nombre">{marcas.enLista === 'fijada' && <Chinche />}{m.nombre}</span>
          {m.dato && <span className="materias__dato">{m.dato}</span>}
        </span>
      </Link>
      {conOpciones && <Opciones m={m} abierta={abierta} alAbrir={alAbrir} alCerrar={alCerrar} />}
    </li>
  );
}

function Lista({ materias, abierta, setAbierta }) {
  return (
    <ul className="materias">
      {materias.map((m) => (
        <Tarjeta key={m.id} m={m} abierta={abierta === m.id} alAbrir={() => setAbierta(m.id)} alCerrar={() => setAbierta(null)} />
      ))}
    </ul>
  );
}

function Grupo({ titulo, materias, abierta, setAbierta }) {
  if (!materias.length) return null;
  return (
    <section className="bloque">
      <h2>{titulo}</h2>
      <Lista materias={materias} abierta={abierta} setAbierta={setAbierta} />
    </section>
  );
}

export default function Materias() {
  const mio = useMio();
  const marcarVistos = useMarcarVistos();
  const [abierta, setAbierta] = useState(null);
  useSeo({ titulo: tituloDe('Materias'), noindex: true });
  const vista = useAjustes().vistas.materias;
  const { datos, error, cargando, recargar } = useConsulta(async () => {
    await cargarPerfil();
    return cargarMaterias();
  });

  // The student's own sections of a campus course are not a course of their own: they show inside it.
  const propias = mio.propias
    .filter((p) => p.de === null)
    .map((p) => ({ id: p.id, nombre: p.nombre, a: `/propias/${p.id}`, base: p.base, dato: resumenDePropia(p), propia: true }));
  const delCampus = (lista) => (lista ?? []).map((c) => ({ id: c.id, nombre: c.nombre, a: `/materias/${c.id}`, base: c.id, dato: resumen(materiaDe(mio, c.id), marcarVistos) }));
  const enCurso = delCampus(datos?.enCurso);
  const otras = delCampus(datos?.otras);
  const lugar = (m) => materiaDe(mio, m.id).enLista;
  const sueltas = (lista) => lista.filter((m) => !lugar(m));
  const todas = [...propias, ...enCurso, ...otras];
  const fijadas = todas.filter((m) => lugar(m) === 'fijada');
  const archivadas = todas.filter((m) => lugar(m) === 'archivada');
  const grupo = { abierta, setAbierta };

  return (
    <div className="contenedor pagina vista-materias" data-vista={vista}>
      <div className="titular">
        <h1>Materias</h1>
        <div className="titular__botones">
          <Link className="boton boton--secundario" to="/inscripcion">Inscribirte a una materia</Link>
          <Link className="boton boton--secundario" to="/propias/nueva">Crear una materia</Link>
          <Link className="boton boton--secundario" to="/propias/abrir">Abrir una que te pasaron</Link>
        </div>
      </div>
      <Grupo titulo="Fijadas" materias={fijadas} {...grupo} />
      <Grupo titulo="Tuyas" materias={sueltas(propias)} {...grupo} />
      {error && !datos && <ErrorConReintento texto={error} recargar={recargar} />}
      {cargando && !datos && <Cargando texto="Buscando tus materias" forma={vista === 'lista' ? 'filas' : 'tarjetas'} />}
      {datos && !datos.enCurso.length && !datos.otras.length && <p>No tenés materias en el campus.</p>}
      <Grupo titulo="En curso" materias={sueltas(enCurso)} {...grupo} />
      <Grupo titulo="Otras" materias={sueltas(otras)} {...grupo} />
      {archivadas.length > 0 && (
        <section className="bloque" aria-label="Archivadas">
          <DetallesAnimados className="materias__archivadas" titulo={`Archivadas (${archivadas.length})`}>
            <Lista materias={archivadas} {...grupo} />
          </DetallesAnimados>
        </section>
      )}
    </div>
  );
}
