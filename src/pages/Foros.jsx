import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Cargando, ErrorConReintento, FilaItem } from '../components/Filas';
import MensajesOForos from '../components/MensajesOForos';
import Simbolo from '../components/Simbolo';
import { Bloques } from '../components/TextoConFormato';
import { cargarHilo, cargarTodosLosForos, publicarEnForo } from '../lib/campus';
import { fechaHoraSuelta } from '../lib/datos';
import {
  discusionEnElCampus, esNueva, esVieja, filtrarDiscusiones, foroEnElCampus, guardarVistas, leerVistas, postsNuevos, rutaDeDiscusion,
} from '../lib/foros';
import { cuandoCorto, iniciales } from '../lib/mensajes';
import { usuarioActual } from '../lib/mio';
import { CAMPUS, LARGO_FORO } from '../lib/moodle';
import { tituloDe, useSeo } from '../lib/seo';
import { useConsulta } from '../lib/useConsulta';
import './panel.css';
import './foros.css';

const OTRA_PESTANA = <span className="solo-lectores">, se abre en otra pestaña</span>;
const respuestasEnTexto = (n) => (n === 1 ? '1 respuesta' : `${n} respuestas`);

function Avatar({ nombre, id }) {
  return <span className="foros__avatar" data-tono={Math.abs(id ?? 0) % 6} aria-hidden="true">{iniciales(nombre)}</span>;
}

function Cuando({ segundos, ahora }) {
  if (!segundos) return null;
  return <time dateTime={new Date(segundos * 1000).toISOString()} title={fechaHoraSuelta(segundos)}>{cuandoCorto(segundos, ahora)}</time>;
}

function FilaDiscusion({ d, nueva, activa, ahora, busqueda }) {
  return (
    <li className="foros__fila" data-activa={activa || undefined} data-nueva={nueva || undefined}>
      <Link to={{ pathname: rutaDeDiscusion(d.id), search: busqueda }} aria-current={activa ? 'page' : undefined}>
        <Simbolo id={d.materiaId} nombre={d.materia} tamano="mini" />
        <span className="foros__fila-texto">
          <span className="foros__fila-arriba">
            <span className="foros__fila-titulo">
              {d.fijada && <svg className="foros__pin" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 3.5h6l-1 6 3.5 3.5h-11L10 9.5zM12 13v7.5" /></svg>}
              <span className="foros__fila-nombre"><span>{d.titulo}</span></span>
              {d.fijada && <span className="solo-lectores">, fijada</span>}
              {nueva && <span className="solo-lectores">, con novedades</span>}
            </span>
            <span className="foros__fila-cuando"><Cuando segundos={d.actividad} ahora={ahora} /></span>
          </span>
          <span className="foros__fila-donde">{d.materia}, {d.foro}</span>
          <span className="foros__fila-dato">
            {d.respuestas > 0 ? (d.ultimo ? `${respuestasEnTexto(d.respuestas)}, la última de ${d.ultimo}` : respuestasEnTexto(d.respuestas)) : `De ${d.autor}`}
          </span>
        </span>
      </Link>
    </li>
  );
}

/** The forums and courses to filter by: only the ones that have something. */
function Filtros({ discusiones, foros, materia, foro, onMateria, onForo }) {
  const materias = useMemo(() => {
    const vistas = new Map(discusiones.map((d) => [d.materiaId, d.materia]));
    return [...vistas.entries()].sort((a, b) => a[1].localeCompare(b[1], 'es'));
  }, [discusiones]);
  const delForo = foros.find((f) => f.cmid === foro);
  if (delForo) {
    return (
      <p className="foros__filtro-foro">
        <span>Solo <strong>{delForo.nombre}</strong> de {delForo.materia}</span>
        <button type="button" className="boton boton--secundario boton--chico" onClick={() => onForo(null)}>Ver todos los foros</button>
      </p>
    );
  }
  // With one course left there is nothing to choose, unless one is chosen: «Todas» takes it back.
  if (materias.length < 2 && !materia) return null;
  return (
    <div className="foros__materias" role="group" aria-label="Materia">
      <button type="button" aria-pressed={!materia} onClick={() => onMateria(null)}>Todas</button>
      {materias.map(([id, nombre]) => (
        <button key={id} type="button" aria-pressed={materia === id} onClick={() => onMateria(materia === id ? null : id)}>
          <Simbolo id={id} nombre={nombre} tamano="mini" />
          {nombre}
        </button>
      ))}
    </div>
  );
}

function Post({ p, nuevo, ahora, onIrA, onResponder }) {
  return (
    <li id={`post-${p.id}`} className="foros__post" data-primero={p.primero || undefined} data-nuevo={nuevo || undefined} tabIndex={-1}>
      <div className="foros__post-cabeza">
        <Avatar nombre={p.autor} id={p.autorId} />
        <span className="foros__post-autor">{p.autor}</span>
        {p.privado && <span className="foros__marca">Respuesta privada</span>}
        <span className="foros__post-cuando"><Cuando segundos={p.cuando} ahora={ahora} /></span>
      </div>
      {p.responde && (
        <button type="button" className="foros__responde" onClick={() => onIrA(p.responde.id)}>
          <span className="foros__responde-quien">Le responde a {p.responde.autor}</span>
          {p.responde.inicio && <span className="foros__responde-cita">{p.responde.inicio}</span>}
        </button>
      )}
      {p.asunto && <h3 className="foros__post-asunto">{p.asunto}</h3>}
      {p.borrado
        ? <p className="foros__borrado">Se borró este mensaje.</p>
        : p.bloques.length > 0 && <div className="foros__post-texto"><Bloques bloques={p.bloques} /></div>}
      {p.citaba && <p className="foros__citaba">Sin el mensaje que citaba.</p>}
      {p.adjuntos.length > 0 && <ul className="lista foros__adjuntos" aria-label="Archivos">{p.adjuntos.map((a) => <FilaItem key={a.id} item={a} />)}</ul>}
      {onResponder && p.puedeResponder && (
        <button type="button" className="foros__responder-a" onClick={() => onResponder(p)} aria-label={`Responderle a ${p.autor}`}>Responder</button>
      )}
    </li>
  );
}

// What is being written in each discussion, while the tab is open: changing discussion doesn't lose it. Never on disk.
const BORRADORES = new Map();

/** The box to answer: to the discussion, or to one post of it. It goes out when Publicar is tapped, once. */
function Responder({ id, titulo, primero, a, onCancelarA, onPublicado, campo }) {
  const idCampo = useId();
  const idAyuda = useId();
  const [texto, setTexto] = useState(() => BORRADORES.get(id) ?? '');
  const [publicando, setPublicando] = useState(false);
  const [problema, setProblema] = useState('');
  const [sinPermiso, setSinPermiso] = useState(false);
  const vacio = !texto.trim();
  const quedan = LARGO_FORO - texto.length;
  const destino = a ?? primero;

  const escribir = (valor) => {
    setTexto(valor);
    if (valor) BORRADORES.set(id, valor);
    else BORRADORES.delete(id);
    if (problema) setProblema('');
  };

  const publicar = async () => {
    if (publicando) return;
    if (vacio) {
      setProblema('Escribí algo antes de publicar.');
      campo.current?.focus({ preventScroll: true });
      return;
    }
    if (quedan < 0) {
      setProblema(`Sobran ${-quedan} letras. Acortala y publicala.`);
      campo.current?.focus();
      return;
    }
    setPublicando(true);
    setProblema('');
    try {
      const { id: nuevo } = await publicarEnForo(id, destino.id, `Re: ${titulo}`, texto);
      BORRADORES.delete(id);
      setTexto('');
      onPublicado(nuevo);
    } catch (error) {
      if (error?.codigo === 'sin_permiso') setSinPermiso(true);
      setProblema(error?.message || 'No pudimos publicarla. Probá de nuevo.');
    } finally {
      setPublicando(false);
    }
  };

  if (sinPermiso) {
    return (
      <div className="foros__responder foros__responder--sin">
        <p>{problema}</p>
        <a className="boton boton--chico" href={discusionEnElCampus(id, destino.id)} target="_blank" rel="noreferrer">Responder en el campus{OTRA_PESTANA}</a>
      </div>
    );
  }

  return (
    <form
      className="foros__responder"
      aria-label="Responder"
      onSubmit={(e) => {
        e.preventDefault();
        publicar();
      }}
    >
      {a && (
        <p className="foros__respondes">
          <span>Le respondés a {a.autor}</span>
          <button type="button" className="foros__respondes-sacar" onClick={onCancelarA}>A la discusión</button>
        </p>
      )}
      <label htmlFor={idCampo} className="solo-lectores">{a ? `Tu respuesta a ${a.autor}` : 'Tu respuesta'}</label>
      <textarea
        ref={campo}
        id={idCampo}
        className="campo__control foros__campo"
        rows={2}
        placeholder="Escribí tu respuesta"
        aria-invalid={quedan < 0 || problema ? 'true' : undefined}
        aria-describedby={idAyuda}
        value={texto}
        onChange={(e) => escribir(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.repeat) {
            e.preventDefault();
            publicar();
          }
        }}
      />
      <button type="submit" className="boton foros__publicar" aria-disabled={publicando || quedan < 0 ? 'true' : undefined}>
        {publicando ? 'Publicando' : 'Publicar'}
      </button>
      <p id={idAyuda} className="foros__responder-ayuda" aria-live="polite">
        {problema
          ? <span className="foros__responder-error" role="alert">{problema}</span>
          : quedan < 500 && <span data-pasado={quedan < 0 || undefined}>{quedan < 0 ? `Sobran ${-quedan} letras.` : `Quedan ${quedan} letras.`}</span>}
      </p>
    </form>
  );
}

// Inside the discussion's own box, never the page: the header and the list stay where they are. On a phone the box is
// the page's own height, and the same goes.
function llevarA(el, donde) {
  const panel = document.querySelector('.foros__hilo-panel');
  if (!panel) return;
  if (!el) {
    panel.scrollTop = 0;
    return;
  }
  const arriba = el.getBoundingClientRect().top - panel.getBoundingClientRect().top + panel.scrollTop;
  panel.scrollTop = donde === 'medio' ? arriba - Math.max(16, (panel.clientHeight - el.offsetHeight) / 2) : arriba - 16;
}

function Hilo({ id, discusion, vistaAntes, ahora, onLeida }) {
  const { datos, error, cargando, recargar } = useConsulta(() => cargarHilo(id), [id], { alInstante: true });
  const titulo = useRef(null);
  const campo = useRef(null);
  // The post being answered (null: the discussion), what the student published here, and the one to go to once it
  // comes back from the campus.
  const [a, setA] = useState(null);
  const [mios, setMios] = useState(() => new Set());
  const [irAlNuevo, setIrAlNuevo] = useState(null);
  const [aviso, setAviso] = useState('');
  const posts = useMemo(() => datos?.posts ?? [], [datos]);
  const nuevos = useMemo(() => {
    const lista = postsNuevos(posts, vistaAntes);
    for (const m of mios) lista.delete(m);
    return lista;
  }, [posts, vistaAntes, mios]);
  const primero = posts[0];
  const respuestas = posts.slice(1);
  const primeroNuevo = respuestas.find((p) => nuevos.has(p.id) && !p.borrado);
  const cuantosNuevos = respuestas.filter((p) => nuevos.has(p.id) && !p.borrado).length;

  // Opening it counts as seen up to its latest post.
  useEffect(() => {
    if (!posts.length) return;
    onLeida(id, Math.max(discusion?.actividad ?? 0, ...posts.map((p) => p.cuando)));
  }, [id, posts, discusion, onLeida]);

  // Each discussion starts on its title, and with something new, at the first new answer.
  useEffect(() => {
    if (!primero) return;
    // With the list beside it, the focus stays in the list; alone in the box, it goes to the title.
    const sola = document.querySelector('.foros__lista-panel')?.offsetParent === null;
    if (sola) titulo.current?.focus({ preventScroll: true });
    const destino = primeroNuevo ? document.getElementById(`foros-nuevo-${id}`) : null;
    llevarA(destino, 'arriba');
    // Only when another discussion comes in, or once it is known what was seen of it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, Boolean(primero), vistaAntes]);

  const irA = (postId) => {
    const el = document.getElementById(`post-${postId}`);
    if (!el) return;
    llevarA(el, 'medio');
    el.focus({ preventScroll: true });
  };

  // Once the discussion comes back with the answer just published, it goes there.
  useEffect(() => {
    if (!irAlNuevo || !posts.some((p) => p.id === irAlNuevo)) return;
    irA(irAlNuevo);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIrAlNuevo(null);
  }, [irAlNuevo, posts]);

  const responderA = (p) => {
    setA(p.primero ? null : p);
    campo.current?.focus({ preventScroll: true });
  };

  const alPublicar = (nuevo) => {
    setMios((m) => new Set(m).add(nuevo));
    setA(null);
    setAviso('Se publicó tu respuesta.');
    setIrAlNuevo(nuevo);
    recargar();
  };

  const tituloDeHilo = discusion?.titulo ?? primero?.asunto ?? 'Discusión';
  const puedeResponder = Boolean(primero?.puedeResponder) && !discusion?.cerrada;
  const materia = discusion?.materia ?? datos?.materia ?? '';
  const materiaId = discusion?.materiaId ?? datos?.materiaId ?? null;
  return (
    <article className="foros__hilo" aria-labelledby={`foros-hilo-${id}`} aria-busy={cargando && !datos ? 'true' : undefined}>
      <header className="foros__hilo-cabeza">
        <Link className="foros__volver" to="/mensajes/foros">Foros</Link>
        {materia && (
          <p className="foros__hilo-donde">
            <Simbolo id={materiaId} nombre={materia} tamano="mini" />
            {materiaId ? <Link to={`/materias/${materiaId}`}>{materia}</Link> : materia}
            {discusion?.foro && <span>{discusion.foro}</span>}
          </p>
        )}
        <h2 id={`foros-hilo-${id}`} ref={titulo} tabIndex={-1}>{tituloDeHilo}</h2>
        <div className="foros__hilo-acciones">
          {discusion?.cerrada && <span className="foros__marca">Cerrada, no admite respuestas</span>}
          {puedeResponder && <button type="button" className="boton boton--chico" onClick={() => responderA(primero)}>Responder</button>}
          {discusion?.foroCmid && <a className="boton boton--secundario boton--chico" href={foroEnElCampus(discusion.foroCmid)} target="_blank" rel="noreferrer">Ver el foro en el campus{OTRA_PESTANA}</a>}
        </div>
      </header>
      {cargando && !datos && <Cargando texto="Trayendo la discusión" forma="filas" cuantas={3} />}
      {error && !datos && <ErrorConReintento texto={error} recargar={recargar} />}
      {datos && !primero && <p className="foros__vacio">Esta discusión ya no está en el campus.</p>}
      {primero && (
        <ol className="foros__posts">
          <Post p={primero} ahora={ahora} onIrA={irA} />
          {respuestas.length > 0 && (
            <li className="foros__cuantas">{respuestasEnTexto(respuestas.length)}</li>
          )}
          {respuestas.map((p) => (
            <PostConCorte key={p.id} p={p} corte={p === primeroNuevo} nuevo={nuevos.has(p.id)} ahora={ahora} onIrA={irA} onResponder={puedeResponder ? responderA : null} id={id} cuantosNuevos={cuantosNuevos} />
          ))}
        </ol>
      )}
      <p className="solo-lectores" role="status">{aviso}</p>
      {puedeResponder && (
        <Responder key={id} id={id} titulo={tituloDeHilo} primero={primero} a={a} onCancelarA={() => setA(null)} onPublicado={alPublicar} campo={campo} />
      )}
    </article>
  );
}

function PostConCorte({ p, corte, nuevo, ahora, onIrA, onResponder, id, cuantosNuevos }) {
  return (
    <>
      {corte && (
        <li id={`foros-nuevo-${id}`} className="foros__corte">
          <span>{cuantosNuevos === 1 ? 'Nuevo desde tu última visita' : `${cuantosNuevos} nuevos desde tu última visita`}</span>
        </li>
      )}
      <Post p={p} nuevo={nuevo} ahora={ahora} onIrA={onIrA} onResponder={onResponder} />
    </>
  );
}

export default function Foros() {
  useSeo({ titulo: tituloDe('Foros'), noindex: true });
  const { discusion: crudo } = useParams();
  const id = Number.isSafeInteger(Number(crudo)) && Number(crudo) > 0 ? Number(crudo) : null;
  const navegar = useNavigate();
  const [parametros, setParametros] = useSearchParams();
  const foro = Number(parametros.get('foro')) || null;
  const materia = Number(parametros.get('materia')) || null;
  const [consulta, setConsulta] = useState('');
  const [soloNuevas, setSoloNuevas] = useState(false);
  // The discussions without activity for a year stay out unless asked for, in the address like the course: going
  // back from a discussion keeps it.
  const conViejas = parametros.get('viejas') === '1';
  const setConViejas = (si) => {
    const p = new URLSearchParams(parametros);
    if (si) p.set('viejas', '1');
    else p.delete('viejas');
    setParametros(p, { replace: true });
  };
  const [ahora] = useState(() => Date.now());
  // The student is known once the campus answered: what this browser saw is read again then.
  const alumno = usuarioActual() ?? null;
  // `antes`: what each discussion had been seen up to when it was opened in this visit, so its new answers stay marked
  // while it is open and the list already marks it as seen.
  const [estado, setEstado] = useState(() => ({ alumno, antes: {}, ...leerVistas(alumno) }));
  if (estado.alumno !== alumno) setEstado({ alumno, antes: {}, ...leerVistas(alumno) });
  else if (id && alumno !== null && !(id in estado.antes)) setEstado((e) => ({ ...e, antes: { ...e.antes, [id]: e.vistas[id] ?? 0 } }));
  const vistas = estado;
  const [fresco, setFresco] = useState(0);
  const { datos, error, cargando, recargar } = useConsulta(() => cargarTodosLosForos({ fresco: fresco > 0 }), [fresco], { alInstante: fresco === 0 });

  useEffect(() => {
    // The first visit starts counting from now.
    if (alumno !== null && !localStorage.getItem(`cl.foros.${alumno}`)) guardarVistas(alumno, estado);
  }, [alumno, estado]);

  const onLeida = useMemo(() => (discusionId, actividad) => {
    // Until the campus says who the student is, nothing is marked: it would go to nobody.
    if (alumno === null) return;
    setEstado((v) => {
      if (v.alumno !== alumno || (v.vistas[discusionId] ?? 0) >= actividad) return v;
      const nuevas = { ...v, vistas: { ...v.vistas, [discusionId]: actividad } };
      guardarVistas(alumno, nuevas);
      return nuevas;
    });
  }, [alumno]);

  const todas = useMemo(() => datos?.discusiones ?? [], [datos]);
  const foros = useMemo(() => datos?.foros ?? [], [datos]);
  const recientes = useMemo(() => (conViejas ? todas : todas.filter((d) => !esVieja(d, ahora / 1000) || d.id === id)), [todas, conViejas, ahora, id]);
  const delLugar = (lista) => lista.filter((d) => (foro ? d.foroCmid === foro : !materia || d.materiaId === materia));
  const conTodas = useMemo(() => delLugar(todas), [todas, foro, materia]); // eslint-disable-line react-hooks/exhaustive-deps
  const delFiltro = useMemo(() => delLugar(recientes), [recientes, foro, materia]); // eslint-disable-line react-hooks/exhaustive-deps
  const viejas = useMemo(() => conTodas.filter((d) => esVieja(d, ahora / 1000)).length, [conTodas, ahora]);
  const nuevasIds = useMemo(() => new Set(delFiltro.filter((d) => esNueva(d, vistas)).map((d) => d.id)), [delFiltro, vistas]);
  // A discussion open right now stays in «Solo lo nuevo» until another one is opened.
  const visibles = useMemo(
    () => filtrarDiscusiones(delFiltro, consulta).filter((d) => !soloNuevas || nuevasIds.has(d.id) || d.id === id),
    [delFiltro, consulta, soloNuevas, nuevasIds, id],
  );
  const abierta = todas.find((d) => d.id === id);
  const busqueda = parametros.toString() ? `?${parametros}` : '';

  const cambiarFiltro = (clave, valor) => {
    const p = new URLSearchParams(parametros);
    p.delete('foro');
    p.delete('materia');
    if (valor) p.set(clave, String(valor));
    setParametros(p, { replace: true });
  };

  useEffect(() => {
    // A forum of the campus opened from a course: if it has only one discussion, straight to it.
    if (!foro || id || !datos?.discusiones) return;
    const delForo = datos.discusiones.filter((d) => d.foroCmid === foro);
    if (delForo.length === 1) navegar({ pathname: rutaDeDiscusion(delForo[0].id), search: busqueda }, { replace: true });
  }, [foro, id, datos, navegar, busqueda]);

  const actualizar = () => {
    if (cargando) return;
    if (fresco) recargar();
    else setFresco(1);
  };
  const esperando = cargando && !datos;

  let cuerpo;
  if (esperando) cuerpo = <Cargando texto="Trayendo los foros de tus materias" forma="filas" cuantas={6} />;
  else if (error && !datos) cuerpo = <div className="foros__estado"><ErrorConReintento texto={error} recargar={recargar} /></div>;
  else if (datos?.cerrado) {
    cuerpo = (
      <div className="foros__estado">
        <p>El campus no deja leer los foros desde Super CVG.</p>
        <a className="boton boton--secundario boton--chico" href={`${CAMPUS}/my/`} target="_blank" rel="noreferrer">Ir al campus{OTRA_PESTANA}</a>
      </div>
    );
  } else if (!todas.length) cuerpo = <p className="foros__estado">Tus foros están vacíos.</p>;
  else if (!delFiltro.length && conTodas.length) {
    cuerpo = (
      <div className="foros__estado">
        <p>{foro ? 'Este foro' : materia ? 'Esta materia' : 'Tus foros'} solo {foro || materia ? 'tiene' : 'tienen'} discusiones de hace más de un año.</p>
        <button type="button" className="boton boton--secundario boton--chico" onClick={() => setConViejas(true)}>Mostrarlas</button>
      </div>
    );
  } else if (!delFiltro.length) cuerpo = <p className="foros__estado">{foro ? 'Este foro no tiene discusiones.' : 'Esta materia no tiene discusiones en sus foros.'}</p>;
  else if (!visibles.length) {
    cuerpo = (
      <div className="foros__estado">
        <p>{consulta.trim() ? `Nada en los foros con «${consulta.trim()}».` : 'Nada nuevo en los foros.'}</p>
        {soloNuevas && <button type="button" className="boton boton--secundario boton--chico" onClick={() => setSoloNuevas(false)}>Ver todas</button>}
      </div>
    );
  } else {
    cuerpo = (
      <ul className="foros__filas" aria-label="Discusiones">
        {visibles.map((d) => <FilaDiscusion key={d.id} d={d} nueva={nuevasIds.has(d.id)} activa={d.id === id} ahora={ahora} busqueda={busqueda} />)}
      </ul>
    );
  }

  return (
    <div className="contenedor pagina foros">
      <div className="foros__caja" data-abierta={id ? '' : undefined}>
        <section className="foros__lista-panel" aria-labelledby="foros-titulo">
          <div className="foros__lista-cabeza">
            <h1 id="foros-titulo">Foros</h1>
            <button type="button" className="boton boton--secundario boton--chico" onClick={actualizar} aria-disabled={cargando || undefined}>
              {cargando && datos ? 'Actualizando' : 'Actualizar'}
            </button>
          </div>
          <MensajesOForos actual="foros" />
          {todas.length > 0 && (
            <>
              <div className="foros__buscar">
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></svg>
                <input type="search" autoComplete="off" spellCheck="false" enterKeyHint="search" value={consulta} onChange={(e) => setConsulta(e.target.value)} placeholder="Buscar en los foros" aria-label="Buscar en los foros" />
              </div>
              <Filtros discusiones={recientes} foros={foros} materia={materia} foro={foro} onMateria={(v) => cambiarFiltro('materia', v)} onForo={(v) => cambiarFiltro('foro', v)} />
              <label className="foros__solo-nuevas">
                <input type="checkbox" checked={soloNuevas} onChange={(e) => setSoloNuevas(e.target.checked)} />
                Solo lo nuevo
                {nuevasIds.size > 0 && <span className="foros__numero">{nuevasIds.size}</span>}
              </label>
              {(viejas > 0 || conViejas) && (
                <label className="foros__solo-nuevas">
                  <input type="checkbox" checked={conViejas} onChange={(e) => setConViejas(e.target.checked)} />
                  Mostrar las de hace más de un año
                  {viejas > 0 && <span className="foros__numero foros__numero--gris">{viejas}</span>}
                </label>
              )}
            </>
          )}
          {datos?.fallaron?.length > 0 && (
            <p className="foros__aviso" role="status">
              {datos.fallaron.length === 1 ? `No llegó ${datos.fallaron[0].nombre} de ${datos.fallaron[0].materia}.` : `No llegaron ${datos.fallaron.length} foros.`}
              {' '}
              <button type="button" className="foros__reintentar" onClick={actualizar}>Probar de nuevo</button>
            </p>
          )}
          {(consulta.trim() || soloNuevas || materia || conViejas) && todas.length > 0 && <p className="solo-lectores" role="status">{visibles.length === 1 ? 'Una discusión' : `${visibles.length} discusiones`}</p>}
          <div className="foros__lista" aria-busy={esperando ? 'true' : undefined}>{cuerpo}</div>
        </section>
        <section className="foros__hilo-panel" aria-label={id ? undefined : 'Discusión'}>
          {id
            ? <Hilo key={id} id={id} discusion={abierta} vistaAntes={estado.antes[id]} ahora={ahora} onLeida={onLeida} />
            : (
              <div className="foros__nada">
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3.5 5.5h11v7h-6l-3 2.5v-2.5h-2zM17.5 9.5h3v7h-2v2.5l-3-2.5h-5v-1.5" /></svg>
                <p>{nuevasIds.size ? 'Elegí una discusión. Lo nuevo está resaltado.' : 'Elegí una discusión.'}</p>
              </div>
            )}
        </section>
      </div>
    </div>
  );
}
