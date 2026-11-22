import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { armarCurso, cargarCursos, cargarDatosCurso, cursoParecido, delTablon, itemsDeCurso, itemsDelTablon, mensajesDe, olvidarClassroom } from '../lib/classroom';
import { conectarGoogle, cancelarConexion, olvidarGoogle, soltarGoogle, useGoogle } from '../lib/google';
import { materiaDe, revisadoClassroom, revisarClassroom, SIN_CLASSROOM, unirClassroom, useMio } from '../lib/mio';
import { unirClassroomPropia } from '../lib/propias';
import { useConsulta } from '../lib/useConsulta';
import { useMarcarVistos } from '../lib/vistos';
import Campo from './Campo';
import { Cargando, datoDe, ErrorConReintento, FilaItem } from './Filas';
import ListaConMas from './ListaConMas';
import PasarA from './PasarA';
import { useBotonesSinMouse } from '../lib/sinMouse';
import { useAbrirPrevia } from './Previa';
import { Icono, IconoDeItem } from './Simbolo';
import './classroom.css';

export const nombreDeCurso = (c) => (c.seccion ? `${c.nombre} (${c.seccion})` : c.nombre);

/** The button that opens Google's window. It has to open straight from the click, or the browser blocks it. While it
 * waits, the focus goes to Cancelar; if it does not connect, back to the button. Once connected this goes away:
 * `alConectar` says where the focus goes. `enfocar`: take the focus when it shows up (after Desconectar).
 * `cuenta`: once connected it stays, as «Usar otra cuenta» and «Desconectar», so a wrong account is changed right
 * there. It has to stay in the same place of the screen while connected or not: it keeps its wait and its error. */
export function BotonConectar({ texto = 'Conectar Classroom', secundario = false, alConectar, enfocar = false, cuenta = false }) {
  const { conectado, email, renovando } = useGoogle();
  const [esperando, setEsperando] = useState(false);
  const [error, setError] = useState('');
  const [volver, setVolver] = useState(enfocar ? 1 : 0);
  const boton = useRef(null);
  const cancelar = useRef(null);
  useEffect(() => {
    if (esperando) cancelar.current?.focus();
    else if (volver) boton.current?.focus();
  }, [esperando, volver]);
  // Google is told too, so the wrong account stops working. What it brought goes with it.
  const soltar = () => {
    olvidarGoogle({ revocar: true });
    olvidarClassroom();
  };
  const conectar = (otra = false) => {
    setError('');
    setVolver(0);
    setEsperando(true);
    // Before opening: in the demo, connecting is instant and would be dropped right after.
    if (otra) soltar();
    conectarGoogle()
      .then(() => alConectar?.())
      .catch((e) => {
        if (e.codigo !== 'cancelada') setError(e.message);
        setVolver((v) => v + 1);
      })
      .finally(() => setEsperando(false));
  };
  // Only Classroom: if the student saves in their Drive, that goes on with the same account.
  const desconectar = () => {
    soltarGoogle('classroom');
    olvidarClassroom();
    setVolver((v) => v + 1);
  };
  if (cuenta && conectado && !esperando) {
    return (
      <div className="classroom__conectar classroom__cuenta">
        {email && <p className="classroom__como">Conectado como <strong>{email}</strong></p>}
        <button ref={boton} type="button" className="boton boton--secundario boton--chico" onClick={() => conectar(true)}>Usar otra cuenta</button>
        <button type="button" className="boton boton--secundario boton--chico" onClick={desconectar}>Desconectar</button>
      </div>
    );
  }
  // Coming back by itself (a new tab, or the hour ended): no button meanwhile, it would ask for the account again.
  if (renovando && !esperando) {
    return (
      <div className="classroom__conectar">
        <p className="classroom__espera" role="status">Volviendo a conectar Classroom</p>
      </div>
    );
  }
  return (
    <div className="classroom__conectar">
      {esperando ? (
        <>
          <p className="classroom__espera" role="status">Terminá en la ventana de Google.</p>
          <button ref={cancelar} type="button" className="boton boton--secundario boton--chico" onClick={cancelarConexion}>Cancelar</button>
        </>
      ) : (
        <button ref={boton} type="button" className={`boton boton--chico${secundario ? ' boton--secundario' : ''}`} onClick={() => conectar()}>{texto}</button>
      )}
      {error && <p className="mensaje mensaje--error" role="alert">{error}</p>}
    </div>
  );
}

/** Rows that open straight in Classroom, Drive or YouTube: in the sheet to pick from and in a course of one's own. */
export function FilasClassroom({ items, revisado = null, nombre }) {
  return (
    <ListaConMas
      items={items}
      nombre={nombre}
      render={(i) => {
        const nuevo = revisado !== null && i.creado > revisado;
        return (
          <li className="fila" key={i.id} data-marca={nuevo ? '' : undefined}>
            <a className="fila__principal" href={i.url} target="_blank" rel="noreferrer">
              <Icono nombre={i.icono} tono={i.tono} enlazado={i.enlazado} tamano="tipo" />
              <span className="fila__texto">
                <span className="fila__nombre">{i.nombre}</span>
                <span className="fila__dato">{nuevo ? `Nuevo, ${i.dato}` : i.dato}<span className="solo-lectores">, se abre en otra pestaña</span></span>
              </span>
            </a>
          </li>
        );
      }}
    />
  );
}

// Where the index of the page (IndiceSecciones.jsx) sends the focus: the title of the stream and of each topic.
export const ID_TABLON = 'classroom-tablon';
export const idDeTema = (id) => `classroom-tema-${id}`;

/** Opens what holds the title `id` (the stream or a topic, and the card if it was closed) and returns that title. The
 * details are opened here and not by React: their `open` only says how they start. */
export function abrirEnClassroom(id) {
  const titulo = document.getElementById(id);
  for (let d = titulo?.closest('details'); d; d = d.parentElement?.closest('details')) d.open = true;
  return titulo;
}

/** The messages of the stream: the new ones open and marked. Each opens in the preview, with its text and links. */
function Tablon({ mensajes }) {
  const nuevos = mensajes.filter((m) => m.nuevo).length;
  if (!mensajes.length) return null;
  return (
    <details className="classroom__grupo classroom__tablon" open={nuevos > 0 || undefined}>
      <summary id={ID_TABLON}>Tablón<span className="classroom__cuantos">{nuevos ? `${nuevos} ${nuevos === 1 ? 'nuevo' : 'nuevos'}` : mensajes.length}</span></summary>
      <ListaConMas items={mensajes} nombre="Tablón" render={(m) => <FilaItem key={m.id} item={m} marca={m.nuevo ? 'Nuevo' : null} />} />
    </details>
  );
}

/** How many new things a course has, and the button that marks them as seen. */
function Novedades({ curso, cuantas, alRevisar }) {
  if (!cuantas) return null;
  return (
    <div className="classroom__novedades">
      <p>{cuantas === 1 ? 'Una novedad desde tu última revisión.' : `${cuantas} novedades desde tu última revisión.`}</p>
      <button type="button" className="boton boton--secundario boton--chico" onClick={() => { revisarClassroom(curso); alRevisar?.(); }}>Ya lo revisé</button>
    </div>
  );
}

/** `temas` false: the topics are sections of the page (a course of one's own), and here go its stream and what's new. */
function CursoFijo({ id, onIndice, temas = true }) {
  const mio = useMio();
  const cursos = useConsulta(cargarCursos);
  const datos = useConsulta(() => cargarDatosCurso(id), [id]);
  const revisado = revisadoClassroom(mio, id);
  const curso = cursos.datos?.find((c) => c.id === id);
  const yo = useMemo(() => ({ id: 0, nombre: curso?.nombre ?? '' }), [curso?.nombre]);
  const mensajes = useMemo(() => (datos.datos ? mensajesDe(datos.datos, yo, revisado) : []), [datos.datos, yo, revisado]);
  // The attachments of the messages are in the stream: they don't repeat at the end.
  const grupos = useMemo(() => (datos.datos ? armarCurso({ ...datos.datos, avisos: [] }) : []), [datos.datos]);
  // For the index of the page: the stream and each topic, once they show.
  const firma = curso ? `${mensajes.length > 0}|${temas ? grupos.map((g) => `${g.id} ${g.nombre}`).join('|') : ''}` : '';
  const alIndice = useRef(onIndice);
  useLayoutEffect(() => {
    alIndice.current = onIndice;
  });
  useEffect(() => {
    const entradas = firma ? [
      ...(mensajes.length ? [{ clave: 'tablon', nombre: 'Tablón', destino: ID_TABLON, classroom: true }] : []),
      ...(temas ? grupos : []).map((g) => ({ clave: `t${g.id}`, nombre: g.nombre, destino: idDeTema(g.id), classroom: true })),
    ] : [];
    alIndice.current?.(entradas);
    // Only when what it lists changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firma]);
  useEffect(() => () => alIndice.current?.([]), []);
  if (cursos.error && !cursos.datos) return <ErrorConReintento texto={cursos.error} recargar={cursos.recargar} />;
  if (cursos.cargando && !cursos.datos) return <Cargando texto="Buscando su curso de Classroom" cuantas={4} />;
  if (!curso) return <p>Su curso no está en el Classroom de esta cuenta de Google. Si es de otra, desconectá y entrá con esa. Si no, cambialo en Editar.</p>;
  const nuevos = mensajes.filter((m) => m.nuevo).length + grupos.reduce((n, g) => n + g.items.filter((i) => i.creado > revisado).length, 0);
  return (
    <>
      {curso.url && (
        <p className="classroom__curso">
          {nombreDeCurso(curso)}
          <a className="classroom__abrir" href={curso.url} target="_blank" rel="noreferrer">Abrir en Classroom<span className="solo-lectores">, se abre en otra pestaña</span></a>
        </p>
      )}
      {datos.error && !datos.datos && <ErrorConReintento texto={datos.error} recargar={datos.recargar} />}
      {datos.cargando && !datos.datos && <Cargando texto="Buscando lo de Classroom" cuantas={4} />}
      <Novedades curso={id} cuantas={nuevos} />
      <Tablon mensajes={mensajes} />
      {datos.datos && !grupos.length && !mensajes.length && <p>Este curso todavía no tiene materiales ni tareas.</p>}
      {temas && grupos.map((g) => (
        <div className="classroom__tema" key={g.id}>
          <h3 id={idDeTema(g.id)} tabIndex={-1}>{g.nombre}</h3>
          <FilasClassroom items={g.items} revisado={revisado} nombre={g.nombre} />
        </div>
      ))}
    </>
  );
}

/** The heading of a Classroom section. Once connected, the button that had the focus is gone: the focus comes here. */
function Titulo({ titulo }) {
  return (
    <div className="seccion__cabeza">
      <h2 id="classroom-titulo" ref={titulo} tabIndex={-1}>Classroom</h2>
    </div>
  );
}

/** Classroom inside a course of one's own joined to a Classroom course: its course, what's new and its stream, read with
 * one's own account (its topics are sections of the page, `useClassroomDePropia`). `onIndice(entradas)`: the stream, for
 * the index of the page. */
export function ClassroomDePropia({ curso, onIndice }) {
  const google = useGoogle();
  const titulo = useRef(null);
  if (!google.disponible) return null;
  return (
    <section className="bloque classroom" aria-labelledby="classroom-titulo">
      <Titulo titulo={titulo} />
      {!google.conectado && !google.renovando && <p className="classroom__bajada">Conectá Classroom y ves acá sus temas y materiales, al día.</p>}
      <BotonConectar cuenta alConectar={() => titulo.current?.focus()} />
      {google.conectado && <CursoFijo key={curso} id={curso} onIndice={onIndice} temas={false} />}
    </section>
  );
}

/** The topics and materials of the Classroom course of a course of one's own as its items (their course is the one of
 * one's own), so its topics are sections that are renamed, moved, folded and hidden, and what's in them is renamed,
 * marked and moved, as in a campus course. Empty without the connection or while they come. `revisado`: since when
 * something is new. */
export function useClassroomDePropia(propia) {
  const google = useGoogle();
  const mio = useMio();
  const curso = google.disponible && google.conectado ? propia.classroom : null;
  const datos = useConsulta(() => (curso ? cargarDatosCurso(curso) : Promise.resolve(null)), [curso]);
  const crudos = curso ? datos.datos : null;
  const { id, nombre } = propia;
  const items = useMemo(() => (crudos ? itemsDeCurso(crudos, { id, nombre }) : []), [crudos, id, nombre]);
  return { items, revisado: curso ? revisadoClassroom(mio, curso) : 0 };
}

function ElegirCurso({ propia, enfocar }) {
  const { datos: cursos, error, cargando, recargar } = useConsulta(cargarCursos);
  const lista = useRef(null);
  const listos = Boolean(cursos);
  useEffect(() => {
    if (enfocar && listos) lista.current?.focus();
  }, [enfocar, listos]);
  if (error && !cursos) return <ErrorConReintento texto={error} recargar={recargar} />;
  if (cargando && !cursos) return <Cargando texto="Buscando tus cursos de Classroom" cuantas={1} />;
  const otro = propia.classroom && !cursos.some((c) => c.id === propia.classroom);
  return (
    <Campo etiqueta="Curso de Classroom" ayuda={otro ? 'El que tiene no está en el Classroom de esta cuenta de Google. Si es de otra, tocá «Usar otra cuenta».' : 'Sus temas y materiales se ven en la materia, al día.'}>
      <select ref={lista} className="campo__control" value={propia.classroom ?? ''} onChange={(e) => unirClassroomPropia(propia.id, e.target.value)}>
        <option value="">Ninguno</option>
        {cursos.map((c) => <option key={c.id} value={c.id}>{nombreDeCurso(c)}</option>)}
        {otro && <option value={propia.classroom}>Uno que no está en esta cuenta</option>}
      </select>
    </Campo>
  );
}

/** In the editor of a course of one's own: which Classroom course it shows. */
export function CursoDePropia({ propia }) {
  const google = useGoogle();
  const [recien, setRecien] = useState(false);
  if (!google.disponible) return null;
  return (
    <div className="classroom__unir">
      {google.conectado ? <ElegirCurso propia={propia} enfocar={recien} /> : (
        <>
          <p className="campo__etiqueta">Curso de Classroom</p>
          <p className="classroom__bajada">{propia.classroom ? 'Tiene uno. Conectá Classroom para cambiarlo o sacarlo.' : 'Si la materia usa Classroom, conectalo y elegí su curso.'}</p>
        </>
      )}
      <BotonConectar secundario cuenta alConectar={() => setRecien(true)} />
    </div>
  );
}

// Courses found by the name in this tab («materia:curso»).
const adivinados = new Set();

/** Everything of Classroom for a campus course: its course (saved, or found by the name), its items shaped like the
 * campus' (the page mixes them in, so they can be moved, hidden and marked), its messages and what is new. */
export function useClassroomDeMateria(materia) {
  const google = useGoogle();
  const mio = useMio();
  const unido = materia ? materiaDe(mio, materia.id).classroom : null;
  const ninguno = unido === SIN_CLASSROOM;
  const activo = Boolean(materia) && google.conectado;
  const cursos = useConsulta(() => (activo ? cargarCursos() : Promise.resolve(null)), [activo]);
  const lista = activo ? cursos.datos ?? null : null;
  const guardado = lista?.find((c) => c.id === unido) ?? null;
  // Chosen before with another Google account, or a course that ended: it stays chosen, and says so.
  const perdido = Boolean(lista) && Boolean(unido) && !ninguno && !guardado;
  const encontrado = lista && !unido && materia ? cursoParecido(materia.nombre, lista) : null;
  // The one found by the name is kept, so Hoy finds it too. In this tab it keeps saying how it was chosen.
  const encontradoId = encontrado?.id;
  const materiaId = materia?.id;
  useEffect(() => {
    if (!encontradoId || !materiaId) return;
    adivinados.add(`${materiaId}:${encontradoId}`);
    unirClassroom(materiaId, encontradoId);
  }, [encontradoId, materiaId]);
  const curso = guardado ?? encontrado;
  const parecido = curso && (curso === encontrado || adivinados.has(`${materiaId}:${curso.id}`)) ? curso : null;
  const datos = useConsulta(() => (curso ? cargarDatosCurso(curso.id) : Promise.resolve(null)), [curso?.id]);
  const revisado = curso ? revisadoClassroom(mio, curso.id) : 0;
  const crudos = curso ? datos.datos : null;
  // The stream too: its messages and their attachments go to a section like the rest.
  const items = useMemo(() => (crudos && materia ? [...itemsDeCurso(crudos, materia), ...itemsDelTablon(crudos, materia)] : []), [crudos, materia]);
  const mensajes = useMemo(() => (crudos && materia ? mensajesDe(crudos, materia, revisado) : []), [crudos, materia, revisado]);
  return { google, unido, ninguno, cursos, curso, parecido, perdido, datos, items, mensajes, revisado };
}

/** A Classroom row in the card on the right: it opens in the preview, drags to a section on the left, and its options
 * pass it there or hide it (for the phone and the keyboard). `adjunto`: an attachment right under its message. */
function FilaDeClassroom({ item, marca, secciones, onPasar, onOcultar, arrastre, enfocar, lectura, adjunto = false }) {
  const abrir = useAbrirPrevia();
  const [abierta, setAbierta] = useState(false);
  const principal = useRef(null);
  useEffect(() => {
    if (enfocar) principal.current?.focus();
  }, [enfocar]);
  const marcarVistos = useMarcarVistos();
  // «Pasar a otra sección» does what dragging the row does: only with «Modo sin mouse» (sinMouse.js).
  const conBotones = useBotonesSinMouse();
  const dato = [marca, datoDe(item), item.nombreOriginal ? 'Renombrado' : null, marcarVistos && item.visto ? 'Visto' : null].filter(Boolean).join(', ');
  return (
    <li
      className="fila fila--editable"
      data-visto={(marcarVistos && item.visto) || undefined}
      data-marca={marca ? '' : undefined}
      data-adjunto={adjunto || undefined}
      draggable={!abierta && !lectura}
      onDragStart={lectura ? undefined : (e) => { e.dataTransfer.setData('text/plain', item.nombre); e.dataTransfer.effectAllowed = 'move'; arrastre.empezar(item.clave, item.seccionId); }}
      onDragEnd={lectura ? undefined : arrastre.terminar}
    >
      <div className="fila__linea">
        <button ref={principal} type="button" className="fila__principal" onClick={() => abrir(item)} aria-haspopup="dialog">
          <IconoDeItem item={item} />
          <span className="fila__texto">
            <span className="fila__nombre">{item.nombre}</span>
            <span className="fila__dato">{dato}</span>
          </span>
        </button>
        {!lectura && <button type="button" className="fila__opciones" aria-expanded={abierta} aria-label={`Opciones de ${item.nombre}`} onClick={() => setAbierta((a) => !a)}>
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>
        </button>}
      </div>
      {abierta && !lectura && (
        <div className="fila__panel">
          {conBotones && <PasarA item={item} secciones={secciones} onPasar={onPasar} />}
          <div className="fila__botones">
            <button type="button" className="boton boton--secundario boton--chico boton--peligro" onClick={() => onOcultar(item)}>Ocultar</button>
          </div>
        </div>
      )}
    </li>
  );
}

/** The Classroom items of the card on the right, by topic, in the order they come. */
export const porTema = (items) => {
  const grupos = new Map();
  for (const i of items) {
    if (!grupos.has(i.seccionId)) grupos.set(i.seccionId, { id: i.seccionId, nombre: i.seccion, items: [] });
    grupos.get(i.seccionId).items.push(i);
  }
  return [...grupos.values()];
};

/** The stream in the card of a campus course: each message and, under it, its attachments, all of them movable. What
 * went to a section is not here; an attachment whose message went keeps its place. New messages open it. */
function TablonDeMateria({ items, marcas, enfocar, fila }) {
  if (!items.length) return null;
  const mensajes = items.filter((i) => !i.adjuntoDe);
  const aca = new Set(mensajes.map((m) => m.clave));
  const nuevos = mensajes.filter((m) => marcas.has(m.clave)).length;
  const abierto = nuevos > 0 || items.some((i) => i.id === enfocar);
  return (
    <details className="classroom__grupo classroom__tablon" open={abierto || undefined}>
      <summary id={ID_TABLON}>Tablón<span className="classroom__cuantos">{nuevos ? `${nuevos} ${nuevos === 1 ? 'nuevo' : 'nuevos'}` : mensajes.length || items.length}</span></summary>
      <ListaConMas items={items} nombre="Tablón" cuenta={(i) => !aca.has(i.adjuntoDe)} fijos={enfocar ? [enfocar] : []} render={(i) => fila(i, aca.has(i.adjuntoDe))} />
    </details>
  );
}

function Conectado({ materia, cr, derecha, marcas, secciones, onPasar, onOcultar, arrastre, enfocar, lectura }) {
  const { cursos, curso, unido, ninguno, parecido, perdido, datos, mensajes, revisado } = cr;
  if (cursos.error && !cursos.datos) return <ErrorConReintento texto={cursos.error} recargar={cursos.recargar} />;
  if (cursos.cargando && !cursos.datos) return <Cargando texto="Buscando tus cursos de Classroom" cuantas={2} />;
  const lista = cursos.datos ?? [];
  if (!lista.length) {
    return <p className="classroom__bajada">Tu cuenta de Google no tiene cursos activos en Classroom.</p>;
  }

  const valor = perdido || ninguno ? unido : curso?.id ?? '';
  let ayuda;
  if (parecido) ayuda = 'Lo elegimos por el nombre. Si no es, cambialo.';
  else if (perdido) ayuda = 'El que elegiste no está en el Classroom de esta cuenta de Google. Si es de otra, tocá «Usar otra cuenta».';
  const tablon = derecha.filter(delTablon);
  const temas = porTema(derecha.filter((i) => !delTablon(i)));
  // What's new: each message and each thing of the topics. An attachment comes with its message.
  const nuevos = cr.items.filter((i) => i.creado > revisado && !i.adjuntoDe).length;
  const fila = (i, adjunto = false) => (
    <FilaDeClassroom key={i.id} item={i} marca={marcas.get(i.clave)} secciones={secciones} onPasar={onPasar} onOcultar={onOcultar} arrastre={arrastre} enfocar={enfocar === i.id} lectura={lectura} adjunto={adjunto} />
  );

  return (
    <>
      <div className="classroom__elegir">
        {/* Also with the tools hidden: which course goes with the subject is not one of the tools for the material, and
            with only its name a wrong one could not be changed from here. */}
        <Campo etiqueta="Su curso de Classroom" ayuda={ayuda}>
          <select className="campo__control" value={valor} onChange={(e) => unirClassroom(materia.id, e.target.value)}>
            {!curso && !unido && <option value="">Elegí uno</option>}
            <option value={SIN_CLASSROOM}>Ninguno</option>
            {lista.map((c) => <option key={c.id} value={c.id}>{nombreDeCurso(c)}</option>)}
            {perdido && <option value={unido}>Uno que no está en esta cuenta</option>}
          </select>
        </Campo>
        {curso?.url && (
          <a className="classroom__abrir" href={curso.url} target="_blank" rel="noreferrer">Abrir en Classroom<span className="solo-lectores">, se abre en otra pestaña</span></a>
        )}
      </div>
      {curso && datos.error && !datos.datos && <ErrorConReintento texto={datos.error} recargar={datos.recargar} />}
      {curso && datos.cargando && !datos.datos && <Cargando texto="Buscando lo de Classroom" cuantas={3} />}
      {curso && datos.datos && (
        <>
          <Novedades curso={curso.id} cuantas={nuevos} />
          {(temas.length > 0 || tablon.length > 0) && !lectura && <p className="classroom__bajada">Arrastrá lo que quieras a una sección de la izquierda, o pasalo desde sus opciones.</p>}
          <TablonDeMateria items={tablon} marcas={marcas} enfocar={enfocar} fila={fila} />
          {temas.map((t) => {
            // Open if it has something new, or the card that just came back here (it takes the focus).
            const abierto = t.items.some((i) => marcas.has(i.clave) || i.id === enfocar);
            return (
              <details className="classroom__grupo" key={t.id} open={abierto || undefined}>
                <summary id={idDeTema(t.id)}>{t.nombre}<span className="classroom__cuantos">{t.items.length}</span></summary>
                <ListaConMas items={t.items} nombre={t.nombre} fijos={enfocar ? [enfocar] : []} render={(i) => fila(i)} />
              </details>
            );
          })}
          {!cr.items.length && !mensajes.length && <p className="classroom__bajada">Este curso todavía no tiene materiales ni tareas.</p>}
        </>
      )}
    </>
  );
}

/** Classroom inside a campus course: a card first in the column on the right. Its title is a block in the color of the
 * bar on top, so it is easy to find. A Classroom item dropped here goes back from the left. */
export default function ClassroomDeMateria({ materia, cr, derecha, marcas, secciones, onPasar, onOcultar, arrastre, enfocar, lectura = false }) {
  const titulo = useRef(null);
  const [sobre, setSobre] = useState(false);
  const { google } = cr;
  if (!google.disponible) return null;
  return (
    <details
      className="panel classroom"
      open
      data-soltar={sobre || undefined}
      onDragOver={(e) => { if (arrastre.deClassroom()) { e.preventDefault(); setSobre(true); } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setSobre(false); }}
      onDrop={(e) => { e.preventDefault(); setSobre(false); arrastre.devolver(); }}
    >
      <summary ref={titulo}>Classroom</summary>
      <div className="panel__cuerpo">
        {!google.conectado && !google.renovando && <p className="classroom__bajada">Si esta materia también usa Classroom, conectalo y ves acá sus temas, materiales y mensajes.</p>}
        <BotonConectar cuenta alConectar={() => titulo.current?.focus()} />
        {google.conectado && <Conectado materia={materia} cr={cr} derecha={derecha} marcas={marcas} secciones={secciones} onPasar={onPasar} onOcultar={onOcultar} arrastre={arrastre} enfocar={enfocar} lectura={lectura} />}
      </div>
    </details>
  );
}
