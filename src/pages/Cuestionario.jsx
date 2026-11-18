import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChipCuestionario, rutaDeRevision } from '../components/EstadoCuestionario';
import { Cargando, ErrorConReintento, FilaItem } from '../components/Filas';
import MarcaHecha from '../components/Hecha';
import Simbolo from '../components/Simbolo';
import { Bloques } from '../components/TextoConFormato';
import { cargarCuestionario } from '../lib/campus';
import { cuandoAbre, cuandoCierra, duracion, estadoDe, intentoQueVale, intentosEnTexto, nota, notaDeIntento, notaOcultaEnTexto, notaSobre, porQueNoSeVeLaNota, queSePuede, revisionCerradaEnTexto, revisionDe, terminados, TEXTO_INTENTO, TEXTO_METODO } from '../lib/cuestionarios';
import { fechaHoraSuelta } from '../lib/datos';
import { CAMPUS } from '../lib/moodle';
import { tituloDe, useSeo } from '../lib/seo';
import { useConsulta } from '../lib/useConsulta';
import './panel.css';
import './tarea.css';
import './cuestionario.css';

const enElCampus = (cmid) => `${CAMPUS}/mod/quiz/view.php?id=${cmid}`;
const OTRA_PESTANA = <span className="solo-lectores">, se abre en otra pestaña</span>;
const MEJOR_NOTA = 'mod_quiz_get_user_best_grade';

/** The card with where the student is with the quiz: the state as a word, the grade or when it closes, its rules and
 * the way to do it, always on the campus. */
function Ficha({ c, datos, ahora }) {
  const { intentos, acceso, mejor, cerradas } = datos;
  const clave = estadoDe(intentos, mejor);
  const { accion, motivo } = queSePuede(c, intentos, acceso, ahora);
  const hechos = terminados(intentos);
  const cerro = Boolean(c.cierra && c.cierra <= ahora);
  let grande = null;
  if (clave === 'calificado') grande = <><span className="tarea-campus__grande-etiqueta">Nota</span> <span className="tarea-campus__marcado">{notaSobre(mejor.nota, c.nota, c.decimales)}</span></>;
  else if (c.abre && c.abre > ahora) grande = <span className="tarea-campus__marcado">{cuandoAbre(c.abre, ahora)}</span>;
  // The highlighter only when there is still something to do before it closes.
  else if (c.cierra) grande = <span className={accion ? 'tarea-campus__marcado' : undefined}>{cuandoCierra(c.cierra, ahora)}</span>;
  let sinNota = null;
  if (clave === 'hecho') sinNota = cerradas.includes(MEJOR_NOTA) ? 'El campus no deja ver la nota desde Super CVG.' : notaOcultaEnTexto(porQueNoSeVeLaNota(c, hechos.at(-1), ahora), c);
  const hacer = hechos.length ? 'Hacer otro intento' : 'Hacer el cuestionario';
  return (
    <section className="tarea-campus__estado cuestionario__ficha" data-estado={clave} data-vencida={(clave === 'sin-hacer' && cerro) || undefined} aria-labelledby="cuestionario-estado">
      <h2 id="cuestionario-estado" className="tarea-campus__estado-titulo"><ChipCuestionario clave={clave} /></h2>
      {grande && <p className="tarea-campus__grande">{grande}</p>}
      {sinNota && <p className="cuestionario__sin-nota">{sinNota}</p>}
      <dl className="tarea-campus__fechas">
        {c.abre && <div><dt>{c.abre > ahora ? 'Abre' : 'Abrió'}</dt><dd>{fechaHoraSuelta(c.abre)}</dd></div>}
        {c.cierra && <div><dt>{cerro ? 'Cerró' : 'Cierra'}</dt><dd>{fechaHoraSuelta(c.cierra)}</dd></div>}
        {c.tiempo > 0 && <div><dt>Límite de tiempo</dt><dd>{duracion(c.tiempo)}</dd></div>}
        {c.intentos !== null && <div><dt>Intentos</dt><dd>{intentosEnTexto(c.intentos, intentos?.length ?? 0)}</dd></div>}
        {c.metodo && c.intentos !== 1 && <div><dt>Vale</dt><dd>{TEXTO_METODO[c.metodo]}</dd></div>}
        {mejor?.aprobar && <div><dt>Para aprobar</dt><dd>{nota(mejor.aprobar, c.decimales)}</dd></div>}
      </dl>
      {acceso?.reglas.length > 0 && <ul className="cuestionario__reglas">{acceso.reglas.map((r, i) => <li key={`${i}-${r}`}>{r}</li>)}</ul>}
      {accion
        ? <a className="boton" href={enElCampus(c.cmid)} target="_blank" rel="noreferrer">{accion === 'seguir' ? 'Seguir el intento' : hacer}{OTRA_PESTANA}</a>
        : (
          <>
            {motivo && <p className="cuestionario__motivo">{motivo}</p>}
            <a className="boton boton--secundario boton--chico" href={enElCampus(c.cmid)} target="_blank" rel="noreferrer">Ver en el campus{OTRA_PESTANA}</a>
          </>
        )}
      {accion && <p className="cuestionario__motivo">Se hace en el campus.</p>}
      {/* Done or graded, it leaves Hoy by itself (Hecha.jsx). */}
      <MarcaHecha clave={`q${c.cmid}`} vence={c.cierra} listo={clave === 'calificado' ? 'Está calificado' : clave === 'hecho' ? 'Ya lo hiciste' : null} />
    </section>
  );
}

/** One attempt: where it is, its times and grade, and the way to its review when the quiz lets see it. */
function Intento({ c, intento, acceso, ahora, vale }) {
  const terminado = intento.estado === 'terminado';
  const valor = notaDeIntento(c, intento);
  const revision = terminado ? revisionDe(c, intento, acceso, ahora) : null;
  return (
    <li className="intento" data-estado={intento.estado}>
      <div className="intento__cabeza">
        <h3 className="intento__titulo">Intento {intento.numero}</h3>
        <span className="intento__estado">{TEXTO_INTENTO[intento.estado]}</span>
      </div>
      <dl className="intento__datos">
        {intento.empezo && <div><dt>Empezó</dt><dd>{fechaHoraSuelta(intento.empezo)}</dd></div>}
        {intento.termino && <div><dt>Terminó</dt><dd>{fechaHoraSuelta(intento.termino)}</dd></div>}
        {intento.termino && intento.empezo && <div><dt>Duró</dt><dd>{duracion(intento.termino - intento.empezo)}</dd></div>}
        {terminado && (
          <div>
            <dt>Nota</dt>
            <dd>
              {valor !== null
                ? <span className={vale ? 'tarea-campus__marcado' : undefined}>{notaSobre(valor, c.nota, c.decimales)}</span>
                : notaOcultaEnTexto(porQueNoSeVeLaNota(c, intento, ahora), c, { corta: true })}
              {vale && <span className="intento__vale">La que vale</span>}
            </dd>
          </div>
        )}
      </dl>
      {terminado && (revision === null || revision.abierta
        ? <Link className="boton boton--secundario boton--chico intento__revisar" to={rutaDeRevision({ materiaId: c.materiaId, cmid: c.cmid }, intento.id)}>Ver la revisión<span className="solo-lectores"> del intento {intento.numero}</span></Link>
        : <p className="intento__cerrada">{revisionCerradaEnTexto(revision.abre, c)}</p>)}
    </li>
  );
}

function Intentos({ c, datos, ahora }) {
  const { intentos, acceso } = datos;
  const vale = intentos ? intentoQueVale(c, intentos) : null;
  const cerro = Boolean(c.cierra && c.cierra <= ahora);
  return (
    <section className="bloque tarea-campus__seccion" aria-labelledby="intentos">
      <h2 id="intentos">Tus intentos</h2>
      {intentos === null && <p className="tarea-campus__motivo">El campus no deja ver tus intentos desde Super CVG.</p>}
      {intentos?.length === 0 && <p className="tarea-campus__motivo">{cerro ? 'No lo hiciste.' : 'Todavía no lo hiciste.'}</p>}
      {intentos?.length > 0 && (
        <ol className="intentos">
          {intentos.map((i) => <Intento key={i.id} c={c} intento={i} acceso={acceso} ahora={ahora} vale={vale === i.id} />)}
        </ol>
      )}
    </section>
  );
}

export default function Cuestionario() {
  const { id, cuestionario: cmid } = useParams();
  const { datos, error, cargando, recargar } = useConsulta(() => cargarCuestionario(Number(id), Number(cmid)), [id, cmid]);
  // Fixed title: the browser history keeps it even after leaving.
  useSeo({ titulo: tituloDe('Cuestionario'), noindex: true });
  const [ahora, setAhora] = useState(() => Date.now() / 1000);
  useEffect(() => {
    const reloj = setInterval(() => setAhora(Date.now() / 1000), 60_000);
    return () => clearInterval(reloj);
  }, []);

  const materia = datos?.materia;
  const c = datos?.cuestionario;

  return (
    <div className="contenedor pagina tarea-campus cuestionario">
      <p className="volver">{materia ? <Link to={`/materias/${materia.id}`}>{materia.nombre}</Link> : <Link to="/materias">Materias</Link>}</p>
      <div className="tarea-campus__cabeza">
        {materia && <Simbolo id={materia.id} nombre={materia.nombre} tamano="grande" />}
        <h1>{c?.nombre ?? datos?.nombre ?? 'Cuestionario'}</h1>
      </div>
      {error && !datos && <ErrorConReintento texto={error} recargar={recargar} />}
      {cargando && !datos && <div aria-busy="true"><Cargando texto="Buscando el cuestionario" cuantas={4} /></div>}
      {datos && !materia && <p>No encontramos esta materia entre las tuyas.</p>}
      {datos?.cerrado && (
        <div className="mensaje cuestionario__aviso">
          <p>El campus no deja ver este cuestionario desde Super CVG.</p>
          <a className="boton boton--secundario boton--chico" href={enElCampus(Number(cmid))} target="_blank" rel="noreferrer">Abrir en el campus{OTRA_PESTANA}</a>
        </div>
      )}
      {materia && !c && !datos.cerrado && <p>No encontramos este cuestionario en la materia. Puede que ya no esté en el campus.</p>}
      {c && (
        <div className="tarea-campus__cuerpo">
          <aside className="tarea-campus__lateral">
            <Ficha c={c} datos={datos} ahora={ahora} />
          </aside>
          <div className="tarea-campus__principal">
            {datos.devolucion.length > 0 && (
              <section className="bloque tarea-campus__seccion" aria-labelledby="devolucion">
                <h2 id="devolucion">Devolución</h2>
                <div className="tarea-campus__hoja tarea-campus__hoja--docente"><Bloques bloques={datos.devolucion} /></div>
              </section>
            )}
            {(c.consigna.length > 0 || c.adjuntos.length > 0) && (
              <section className="bloque tarea-campus__seccion" aria-labelledby="consigna">
                <h2 id="consigna">Consigna</h2>
                {c.consigna.length > 0 && <Bloques bloques={c.consigna} />}
                {c.adjuntos.length > 0 && <ul className="lista cuestionario__adjuntos">{c.adjuntos.map((a) => <FilaItem key={a.id} item={a} />)}</ul>}
              </section>
            )}
            <Intentos c={c} datos={datos} ahora={ahora} />
          </div>
        </div>
      )}
    </div>
  );
}
