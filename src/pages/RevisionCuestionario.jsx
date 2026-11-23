import { Link, useParams } from 'react-router-dom';
import { MarcaResultado, rutaDeCuestionario } from '../components/EstadoCuestionario';
import { Cargando, ErrorConReintento } from '../components/Filas';
import Simbolo from '../components/Simbolo';
import { Bloques } from '../components/TextoConFormato';
import { cargarIntento } from '../lib/campus';
import { duracion, nota, notaDeIntento, notaSobre, revisionCerradaEnTexto, TEXTO_RESULTADO } from '../lib/cuestionarios';
import { fechaHoraSuelta } from '../lib/datos';
import { CAMPUS } from '../lib/moodle';
import { sinMovimiento } from '../lib/movimiento';
import { tituloDe, useSeo } from '../lib/seo';
import { useConsulta } from '../lib/useConsulta';
import './panel.css';
import './tarea.css';
import './cuestionario.css';

const OTRA_PESTANA = <span className="solo-lectores">, se abre en otra pestaña</span>;
const quieto = () => sinMovimiento() || ['reducido', 'ninguno'].includes(document.documentElement.dataset.movimiento);
const idDe = (p) => `pregunta-${p.slot}`;
const enMinuscula = (t) => t.charAt(0).toLowerCase() + t.slice(1);

/** The answer the student gave, marked as the teacher marks a sheet: the options with the chosen ones highlighted, the
 * text written, or each pair matched. */
function Respuesta({ respuesta }) {
  if (!respuesta) return null;
  if (respuesta.tipo === 'opciones') {
    const ninguna = !respuesta.opciones.some((o) => o.elegida);
    return (
      <>
        {ninguna && <p className="pregunta__nota">No elegiste ninguna.</p>}
        <ul className="alternativas">
          {respuesta.opciones.map((o, i) => (
            <li key={i} className="alternativa" data-elegida={o.elegida || undefined} data-marca={o.marca ?? undefined} data-varias={o.varias || undefined}>
              <span className="alternativa__casilla" aria-hidden="true" />
              <span className="alternativa__texto">
                <span className="alternativa__nombre">{o.texto || 'Opción con imagen, mirala en el campus'}</span>
                {o.elegida && (
                  <span className="alternativa__tuya">
                    <MarcaResultado resultado={o.marca} />
                    {o.marca ? `Tu respuesta, ${enMinuscula(TEXTO_RESULTADO[o.marca])}` : 'Tu respuesta'}
                  </span>
                )}
                {o.devolucion.length > 0 && <span className="alternativa__devolucion"><Bloques bloques={o.devolucion} /></span>}
              </span>
            </li>
          ))}
        </ul>
      </>
    );
  }
  if (respuesta.tipo === 'texto') {
    return (
      <div className="respuesta" data-marca={respuesta.marca ?? undefined}>
        <p className="pregunta__etiqueta">Tu respuesta</p>
        <p className="respuesta__fila">
          {respuesta.texto ? <span className="respuesta__valor">{respuesta.texto}</span> : <span className="pregunta__nota">No respondiste.</span>}
          {respuesta.marca && <span className="respuesta__marca"><MarcaResultado resultado={respuesta.marca} />{TEXTO_RESULTADO[respuesta.marca]}</span>}
        </p>
      </div>
    );
  }
  if (respuesta.tipo === 'escrita') {
    return (
      <div className="respuesta">
        <p className="pregunta__etiqueta">Tu respuesta</p>
        {respuesta.bloques.length > 0 ? <div className="tarea-campus__hoja respuesta__hoja"><Bloques bloques={respuesta.bloques} /></div> : !respuesta.archivos.length && <p className="pregunta__nota">No respondiste.</p>}
        {respuesta.archivos.length > 0 && (
          <>
            <p className="pregunta__etiqueta">Archivos que subiste</p>
            <ul className="respuesta__archivos">{respuesta.archivos.map((a, i) => <li key={`${i}-${a}`}>{a}</li>)}</ul>
          </>
        )}
      </div>
    );
  }
  return (
    <div className="respuesta">
      <p className="pregunta__etiqueta">Tus respuestas</p>
      <dl className="pares">
        {respuesta.pares.map((par, i) => (
          <div key={i} className="par" data-marca={par.marca ?? undefined}>
            <dt>{par.item}</dt>
            <dd>
              {par.elegido ? <span className="respuesta__valor">{par.elegido}</span> : <span className="pregunta__nota">Sin elegir</span>}
              {par.marca && <span className="respuesta__marca"><MarcaResultado resultado={par.marca} />{TEXTO_RESULTADO[par.marca]}</span>}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Pregunta({ p, c }) {
  const d = c.decimalesPregunta;
  const puntos = p.puntos !== null && p.maximo !== null ? `${nota(p.puntos, d)} de ${nota(p.maximo, d)}` : p.maximo !== null && !p.informacion ? `Vale ${nota(p.maximo, d)}` : null;
  const detalle = [p.resultado ? TEXTO_RESULTADO[p.resultado] : p.estado || null, puntos].filter(Boolean).join(', ');
  const devolucion = [...p.devolucion, ...p.general];
  return (
    <section className="pregunta" data-resultado={p.resultado ?? undefined} aria-labelledby={idDe(p)}>
      <div className="pregunta__cabeza">
        <span className="pregunta__marca" aria-hidden="true"><MarcaResultado resultado={p.resultado} /></span>
        <h2 id={idDe(p)} className="pregunta__titulo" tabIndex={-1}>{p.informacion ? 'Información' : `Pregunta ${p.numero}`}</h2>
        {detalle && !p.informacion && <p className="pregunta__resultado">{detalle}</p>}
      </div>
      <div className="pregunta__cuerpo">
        {p.texto.length > 0 && <div className="pregunta__texto"><Bloques bloques={p.texto} /></div>}
        {p.conImagen && <p className="pregunta__nota">Tiene una imagen que se ve en el campus.</p>}
        <Respuesta respuesta={p.respuesta} />
        {p.enElCampus && <p className="pregunta__nota">Tu respuesta a esta pregunta se ve en el campus.</p>}
        {p.correcta && (
          <div className="pregunta__correcta">
            <p className="pregunta__etiqueta">Respuesta correcta</p>
            <p>{p.correcta}</p>
          </div>
        )}
        {devolucion.length > 0 && (
          <div className="tarea-campus__hoja tarea-campus__hoja--docente pregunta__devolucion">
            <p className="pregunta__etiqueta">Devolución</p>
            <Bloques bloques={devolucion} />
          </div>
        )}
        {p.comentario.length > 0 && (
          <div className="tarea-campus__hoja tarea-campus__hoja--docente pregunta__devolucion">
            <p className="pregunta__etiqueta">Comentario del docente</p>
            <Bloques bloques={p.comentario} />
          </div>
        )}
      </div>
    </section>
  );
}

/** The sheet of marks: one box per question with its mark, to go straight to it. */
function Mapa({ preguntas }) {
  const reales = preguntas.filter((p) => !p.informacion);
  if (reales.length < 2) return null;
  const ir = (e, p) => {
    // A new tab or window does what the browser does.
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    const titulo = document.getElementById(idDe(p));
    if (!titulo) return;
    titulo.focus({ preventScroll: true });
    titulo.scrollIntoView({ block: 'start', behavior: quieto() ? 'auto' : 'smooth' });
  };
  return (
    <nav className="mapa" aria-label="Preguntas">
      <ol className="mapa__lista">
        {reales.map((p) => (
          <li key={p.slot}>
            <a className="mapa__casilla" href={`#${idDe(p)}`} data-resultado={p.resultado ?? undefined} onClick={(e) => ir(e, p)}>
              {/* One name for readers: the grid would split the pieces with spaces. */}
              <span className="mapa__numero" aria-hidden="true">{p.numero}</span>
              <MarcaResultado resultado={p.resultado} />
              <span className="solo-lectores">{`Pregunta ${p.numero}${p.resultado ? `, ${enMinuscula(TEXTO_RESULTADO[p.resultado])}` : ''}`}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function Resumen({ c, intento, revision, campus }) {
  const valor = revision.nota ?? notaDeIntento(c, revision.intento ?? intento);
  const puntos = (revision.intento ?? intento).puntos;
  return (
    <section className="tarea-campus__estado revision__resumen" aria-labelledby="revision-nota">
      <h2 id="revision-nota" className="tarea-campus__estado-titulo revision__etiqueta">Tu nota</h2>
      {valor !== null
        ? <p className="tarea-campus__grande"><span className="tarea-campus__marcado">{notaSobre(valor, c.nota, c.decimales)}</span></p>
        : <p className="cuestionario__sin-nota">La nota no se ve en esta revisión.</p>}
      {valor !== null && puntos !== null && c.puntos !== c.nota && <p className="revision__puntos">{nota(puntos, c.decimales)} de {nota(c.puntos, c.decimales)} puntos</p>}
      <dl className="tarea-campus__fechas">
        {intento.empezo && <div><dt>Empezó</dt><dd>{fechaHoraSuelta(intento.empezo)}</dd></div>}
        {intento.termino && <div><dt>Terminó</dt><dd>{fechaHoraSuelta(intento.termino)}</dd></div>}
        {intento.termino && intento.empezo && <div><dt>Duró</dt><dd>{duracion(intento.termino - intento.empezo)}</dd></div>}
      </dl>
      <Mapa preguntas={revision.preguntas} />
      <a className="boton boton--secundario boton--chico" href={campus} target="_blank" rel="noreferrer">Ver en el campus{OTRA_PESTANA}</a>
    </section>
  );
}

export default function RevisionCuestionario() {
  const { id, cuestionario: cmid, intento: intentoId } = useParams();
  const { datos, error, cargando, recargar } = useConsulta(() => cargarIntento(Number(id), Number(cmid), Number(intentoId)), [id, cmid, intentoId], { alInstante: true });
  // Fixed title: the browser history keeps it even after leaving.
  useSeo({ titulo: tituloDe('Revisión'), noindex: true });
  const abierto = `${CAMPUS}/mod/quiz/view.php?id=${Number(cmid)}`;

  const materia = datos?.materia;
  const c = datos?.cuestionario;
  const intento = datos?.intento;
  const revision = datos?.revision;
  const campus = intento ? `${CAMPUS}/mod/quiz/review.php?attempt=${intento.id}&cmid=${c.cmid}` : abierto;

  let volver = <Link to="/materias">Materias</Link>;
  if (c) volver = <Link to={rutaDeCuestionario({ materiaId: materia.id, cmid: c.cmid })}>{c.nombre}</Link>;
  else if (materia) volver = <Link to={`/materias/${materia.id}`}>{materia.nombre}</Link>;

  let aviso = null;
  if (datos && !materia) aviso = <p>No encontramos esta materia entre las tuyas.</p>;
  else if (materia && !c) aviso = <p>{datos.cerrado ? 'El campus no deja ver este cuestionario desde Super CVG.' : 'No encontramos este cuestionario en la materia.'}</p>;
  else if (c && !intento) aviso = <p>{datos.intentos === null ? 'El campus no deja ver tus intentos desde Super CVG.' : 'No encontramos este intento entre los tuyos.'}</p>;
  else if (intento && intento.estado !== 'terminado') {
    aviso = (
      <div className="mensaje cuestionario__aviso">
        <p>Este intento sigue abierto. Terminalo en el campus.</p>
        <a className="boton boton--secundario boton--chico" href={abierto} target="_blank" rel="noreferrer">Seguir el intento{OTRA_PESTANA}</a>
      </div>
    );
  } else if (datos?.cerrada === 'docente') aviso = <div className="mensaje cuestionario__aviso"><p>{revisionCerradaEnTexto(datos.abre, c)}</p></div>;
  else if (datos?.cerrada === 'campus') {
    aviso = (
      <div className="mensaje cuestionario__aviso">
        <p>El campus no deja ver la revisión desde Super CVG.</p>
        <a className="boton boton--secundario boton--chico" href={campus} target="_blank" rel="noreferrer">Abrir en el campus{OTRA_PESTANA}</a>
      </div>
    );
  }

  return (
    <div className="contenedor pagina tarea-campus revision">
      <p className="volver">{volver}</p>
      <div className="tarea-campus__cabeza">
        {materia && <Simbolo id={materia.id} nombre={materia.nombre} tamano="grande" />}
        <h1>{intento ? `Revisión del intento ${intento.numero}` : 'Revisión'}</h1>
      </div>
      {error && !datos && <ErrorConReintento texto={error} recargar={recargar} />}
      {cargando && !datos && <div aria-busy="true"><Cargando texto="Buscando la revisión" cuantas={4} /></div>}
      {aviso}
      {revision && (
        <div className="tarea-campus__cuerpo">
          <aside className="tarea-campus__lateral">
            <Resumen c={c} intento={intento} revision={revision} campus={campus} />
          </aside>
          <div className="tarea-campus__principal">
            {revision.devolucion.length > 0 && (
              <section className="bloque tarea-campus__seccion" aria-labelledby="devolucion">
                <h2 id="devolucion">Devolución</h2>
                <div className="tarea-campus__hoja tarea-campus__hoja--docente"><Bloques bloques={revision.devolucion} /></div>
              </section>
            )}
            {revision.preguntas.length > 0
              ? <div className="preguntas">{revision.preguntas.map((p) => <Pregunta key={p.slot} p={p} c={c} />)}</div>
              : <p className="tarea-campus__motivo">Esta revisión no trae las preguntas. Mirala en el campus.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
