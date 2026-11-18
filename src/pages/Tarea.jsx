import { useEffect, useId, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Campo from '../components/Campo';
import { ChipEstado } from '../components/EstadoTarea';
import { Cargando, ErrorConReintento, FilaItem } from '../components/Filas';
import MarcaHecha from '../components/Hecha';
import Simbolo, { IconoDeItem } from '../components/Simbolo';
import { Bloques } from '../components/TextoConFormato';
import { useUI } from '../components/ui';
import { cargarTarea, entregarTarea, enviarParaCalificar } from '../lib/campus';
import { faltan, fecha, fechaHora, fechaHoraSuelta } from '../lib/datos';
import { textoError } from '../lib/errores';
import { marcarHecha } from '../lib/mio';
import { CAMPUS } from '../lib/moodle';
import { tituloDe, useSeo } from '../lib/seo';
import { cerrarSesion } from '../lib/sesion';
import { contarPalabras, estadoDe, estaVencida, hayErrores, pesoEnTexto, porQueNo, revisarEntrega, seEntregaAca, textoParaEditar, tiposEnTexto, venceEl } from '../lib/tareas';
import { useConsulta } from '../lib/useConsulta';
import { useSalirSinGuardar } from '../lib/useSalirSinGuardar';
import './panel.css';
import './tarea.css';

const SIN_ERRORES = { texto: '', archivos: '', general: '', declaracion: '', porArchivo: {} };
const tieneAlgo = (envio) => Boolean(envio && (envio.texto || envio.archivos.length));
// Handed in from here: marked as done at once, so it doesn't show again in Hoy (Hecha.jsx).
const marcarEntregada = (tarea, estado) => marcarHecha(`t${tarea.cmid}`, venceEl(tarea, estado));
// How the campus says it is finished, next to its mark.
const LISTO = { entregada: 'Está entregada', calificada: 'Está calificada' };

function Archivos({ titulo, archivos }) {
  if (!archivos.length) return null;
  return (
    <>
      <h3 className="tarea-campus__subtitulo">{titulo}</h3>
      <ul className="lista">{archivos.map((a) => <FilaItem key={a.id} item={a} />)}</ul>
    </>
  );
}

/** The card with where the task is: its state as a word, the grade or how long is left, and its dates. */
function Ficha({ tarea, estado, ahora }) {
  const clave = estadoDe(estado);
  const vence = venceEl(tarea, estado);
  const envio = estado.envio;
  const aTiempo = envio?.modificado && tarea.vence ? envio.modificado <= venceEl(tarea, estado) : null;
  let grande = null;
  if (clave === 'calificada') grande = <><span className="tarea-campus__grande-etiqueta">Nota</span> <span className="tarea-campus__marcado">{estado.devolucion.nota || 'Sin nota'}</span></>;
  else if (clave === 'entregada' && aTiempo !== null) grande = aTiempo ? 'A tiempo' : 'Fuera de término';
  else if (clave !== 'entregada' && vence) grande = <span className={estaVencida(tarea, estado, ahora) ? undefined : 'tarea-campus__marcado'}>{faltan(vence, ahora)}</span>;
  return (
    <section className="tarea-campus__estado" data-estado={clave} data-vencida={estaVencida(tarea, estado, ahora) || undefined} aria-labelledby="tarea-estado">
      <h2 id="tarea-estado" className="tarea-campus__estado-titulo"><ChipEstado clave={clave} /></h2>
      {grande && <p className="tarea-campus__grande">{grande}</p>}
      <dl className="tarea-campus__fechas">
        {tarea.vence && <div><dt>Vence</dt><dd>{fechaHoraSuelta(tarea.vence)}</dd></div>}
        {estado.prorroga && <div><dt>Tu prórroga</dt><dd>{fechaHoraSuelta(estado.prorroga)}</dd></div>}
        {tarea.cierra && tarea.cierra !== tarea.vence && <div><dt>Cierra</dt><dd>{fechaHoraSuelta(tarea.cierra)}</dd></div>}
        {tarea.abre && tarea.abre > ahora && <div><dt>Abre</dt><dd>{fechaHoraSuelta(tarea.abre)}</dd></div>}
        {envio?.modificado && clave !== 'sin' && <div><dt>{clave === 'borrador' ? 'Guardada' : 'Entregada'}</dt><dd>{fechaHoraSuelta(envio.modificado)}</dd></div>}
        {estado.devolucion?.fecha && <div><dt>Calificada</dt><dd>{fecha(estado.devolucion.fecha)}</dd></div>}
      </dl>
      <MarcaHecha clave={`t${tarea.cmid}`} vence={vence} listo={LISTO[clave] ?? null} />
      <a className="boton boton--secundario boton--chico" href={`${CAMPUS}/mod/assign/view.php?id=${tarea.cmid}`} target="_blank" rel="noreferrer">
        Ver en el campus<span className="solo-lectores">, se abre en otra pestaña</span>
      </a>
    </section>
  );
}

/** The statement the campus asks to accept before a task goes to be graded. */
function Declaracion({ texto, aceptada, onCambio, error, cmid, campo }) {
  const id = useId();
  return (
    <div className="entrega__declaracion">
      {texto
        ? <p className="entrega__declaracion-texto">{texto}</p>
        : (
          <p className="entrega__declaracion-texto">
            El campus pide aceptar una declaración que no llegó acá.{' '}
            <a href={`${CAMPUS}/mod/assign/view.php?id=${cmid}`} target="_blank" rel="noreferrer">Leela en el campus<span className="solo-lectores">, se abre en otra pestaña</span></a> antes de aceptarla.
          </p>
        )}
      <label className="entrega__acepto">
        <input ref={campo} type="checkbox" checked={aceptada} onChange={(e) => onCambio(e.target.checked)} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined} />
        Acepto la declaración
      </label>
      {error && <span id={`${id}-error`} className="campo__error" role="alert">{error}</span>}
    </div>
  );
}

const avanceEnTexto = (a) => {
  if (a.paso === 'subiendo') return a.de === 1 ? 'Subiendo el archivo' : `Subiendo el archivo ${a.cual} de ${a.de}`;
  if (a.paso === 'guardando') return 'Guardando en el campus';
  return 'Enviando para calificar';
};

// What the confirmation says happens: a draft, handed in for good, or handed in and still open to changes.
function queQueda(tarea, final, tarde) {
  if (!final) return 'Queda guardada en el campus como borrador, sin enviar.';
  const fuera = tarde ? 'Va fuera de término. ' : '';
  if (tarea.borradores) return `${fuera}Se envía para calificar y después ya no la podés cambiar.`;
  return `${fuera || 'Queda entregada en el campus. '}La podés cambiar mientras siga abierta.`;
}

/** The form to hand in a task: the text and the files it takes, with their limits, and the statement when it asks for
 * one. Nothing leaves before the confirmation, and if something fails what was written stays here. */
function FormEntrega({ tarea, materia, estado, ahora, editando, onListo, onCancelar }) {
  const { confirmar, avisar } = useUI();
  // What was already handed in, to start from it and to know whether something changed.
  const [inicial] = useState(() => ({ texto: textoParaEditar(estado.envio), archivos: (estado.envio?.archivos ?? []).map((a) => ({ id: a.id, nombre: a.archivo, peso: a.peso, mime: a.mime, direccion: a.direccion, yaEsta: true })) }));
  const [texto, setTexto] = useState(inicial.texto);
  const [archivos, setArchivos] = useState(inicial.archivos);
  const [aceptada, setAceptada] = useState(false);
  const [errores, setErrores] = useState(SIN_ERRORES);
  const [fallo, setFallo] = useState(null);
  const [avance, setAvance] = useState('');
  const [mandando, setMandando] = useState(false);
  const [encima, setEncima] = useState(false);
  const elegir = useRef(null);
  // The button one sees: the file field itself is hidden and can't take the focus.
  const botonElegir = useRef(null);
  // Between the first tap on Entregar and the question showing, a second tap waits.
  const pidiendo = useRef(false);
  // Files added or taken out, said to a screen reader.
  const [anuncio, setAnuncio] = useState('');
  const campoTexto = useRef(null);
  const campoDeclaracion = useRef(null);
  const cajaError = useRef(null);
  const listaArchivos = useRef(null);
  const ayudaArchivos = useId();
  const errorArchivos = useId();
  const sucio = texto !== inicial.texto || archivos !== inicial.archivos;
  useSalirSinGuardar(sucio && !mandando);

  const reglas = tarea.archivos;
  const tarde = estaVencida(tarea, estado, ahora);
  const lleno = reglas && archivos.length >= reglas.cuantos;
  const palabras = contarPalabras(texto);
  const ayudaTexto = tarea.texto?.palabras
    ? `${tarea.texto.palabras === 1 ? 'Hasta una palabra' : `Hasta ${tarea.texto.palabras} palabras`}. Llevás ${palabras}.`
    : 'Por ejemplo, tu respuesta o el link a tu trabajo.';
  const tiposTexto = reglas ? tiposEnTexto(reglas.tipos) : '';
  const ayudaDeArchivos = reglas && [
    `${reglas.cuantos === 1 ? 'Un solo archivo' : `Hasta ${reglas.cuantos} archivos`}${reglas.peso ? ` de hasta ${pesoEnTexto(reglas.peso)}` : ''}.`,
    tiposTexto ? `${reglas.cuantos === 1 ? 'Va' : 'Van'} en ${tiposTexto}.` : '',
  ].filter(Boolean).join(' ');

  const sumarArchivos = (lista) => {
    const nuevos = [...lista].map((f, i) => ({ id: `nuevo-${Date.now()}-${i}-${f.name}`, nombre: f.name, peso: f.size, mime: f.type, blob: f }));
    if (!nuevos.length) return;
    // With room for one, a new file takes the place of the one there.
    setArchivos((a) => (reglas.cuantos === 1 ? nuevos.slice(0, 1) : [...a, ...nuevos]));
    setErrores((e) => ({ ...e, archivos: '', general: '', porArchivo: {} }));
    setFallo(null);
    setAnuncio(nuevos.length === 1 ? `Sumaste ${nuevos[0].nombre}` : `Sumaste ${nuevos.length} archivos`);
  };
  const sacar = (archivo, lugar) => {
    setArchivos((a) => a.filter((x) => x.id !== archivo.id));
    setErrores((e) => ({ ...e, archivos: '', porArchivo: Object.fromEntries(Object.entries(e.porArchivo).filter(([k]) => k !== archivo.id)) }));
    setAnuncio(`Sacaste ${archivo.nombre}`);
    // The focus goes to the next file, or to the button to choose.
    requestAnimationFrame(() => {
      const botones = listaArchivos.current?.querySelectorAll('.entrega__sacar') ?? [];
      (botones[Math.min(lugar, botones.length - 1)] ?? botonElegir.current)?.focus();
    });
  };

  const enfocarError = (e) => {
    requestAnimationFrame(() => {
      if (e.texto) campoTexto.current?.focus();
      else if (e.archivos || Object.keys(e.porArchivo).length) {
        const lista = listaArchivos.current;
        (lista?.querySelector('[data-error]') ?? botonElegir.current ?? lista?.querySelector('.entrega__sacar'))?.focus();
      } else if (e.general) (campoTexto.current ?? botonElegir.current)?.focus();
      else if (e.declaracion) campoDeclaracion.current?.focus();
    });
  };

  const mandar = async (final) => {
    if (mandando || pidiendo.current) return;
    const e = revisarEntrega(tarea, { texto, archivos, aceptada, final });
    setErrores(e);
    setFallo(null);
    if (hayErrores(e)) {
      enfocarError(e);
      return;
    }
    pidiendo.current = true;
    const si = await confirmar({
      titulo: final ? `¿Entregar ${tarea.nombre}?` : `¿Guardar el borrador de ${tarea.nombre}?`,
      texto: queQueda(tarea, final, tarde),
      boton: final ? 'Entregar' : 'Guardar borrador',
    });
    pidiendo.current = false;
    if (!si) return;
    setMandando(true);
    try {
      const r = await entregarTarea(tarea, materia, { texto, archivos, enviar: final && tarea.borradores, aceptar: aceptada, alAvanzar: (a) => setAvance(avanceEnTexto(a)) });
      if (final) marcarEntregada(tarea, estado);
      avisar(final ? `Entregaste ${tarea.nombre}` : `Guardaste el borrador de ${tarea.nombre}`);
      if (r.faltan) avisar(r.faltan === 1 ? 'El campus no tomó un archivo. Revisá la entrega.' : `El campus no tomó ${r.faltan} archivos. Revisá la entrega.`, 'error');
      setMandando(false);
      onListo();
      return;
    } catch (error) {
      setMandando(false);
      setAvance('');
      if (error.codigo === 'no_enviada' && error.guardada) {
        avisar('Quedó guardada como borrador, pero el campus no la envió para calificar.', 'error');
        onListo();
        return;
      }
      if (error.archivo && ['archivo_grande', 'archivo_repetido', 'archivo_rechazado'].includes(error.codigo)) {
        const conArchivo = { ...SIN_ERRORES, porArchivo: { [error.archivo]: textoError(error) } };
        setErrores(conArchivo);
        enfocarError(conArchivo);
        return;
      }
      setFallo({ texto: error.codigo === 'sesion' ? 'Tu sesión venció. Copiá lo que escribiste antes de entrar de nuevo.' : textoError(error), detalle: error.detalle, sesion: error.codigo === 'sesion' });
      requestAnimationFrame(() => cajaError.current?.focus());
    }
  };

  const soltar = (e) => {
    e.preventDefault();
    setEncima(false);
    if (mandando) return;
    if (!lleno || reglas.cuantos === 1) sumarArchivos(e.dataTransfer?.files ?? []);
    else setAnuncio(`Ya elegiste los ${reglas.cuantos} que acepta. Para cambiar uno, sacalo primero.`);
  };

  return (
    <form className="entrega" onSubmit={(e) => { e.preventDefault(); mandar(true); }} noValidate aria-busy={mandando ? 'true' : undefined}>
      {tarde && (
        <p className="entrega__tarde">
          Ya venció. Si la entregás ahora, el campus la marca fuera de término.
          {tarea.cierra && tarea.cierra > ahora ? ` Se puede hasta el ${fechaHora(tarea.cierra).replace(/\.$/, '')}.` : ''}
        </p>
      )}
      {tarea.enGrupo && <p className="entrega__nota">Es una entrega en grupo. Lo que mandes vale para todo tu grupo.</p>}

      {tarea.texto && (
        <div className="entrega__campo">
          <Campo etiqueta="Texto" ayuda={ayudaTexto} error={errores.texto}>
            <textarea ref={campoTexto} className="campo__control entrega__texto" rows={8} value={texto} disabled={mandando} onChange={(e) => { setTexto(e.target.value); setErrores((x) => ({ ...x, texto: '', general: '' })); setFallo(null); }} />
          </Campo>
          {estado.envio?.texto?.conFormato && <p className="entrega__nota">En el campus tu texto tenía formato. Si lo cambiás acá, queda sin negritas ni tablas.</p>}
        </div>
      )}

      {reglas && (
        <fieldset
          className="entrega__archivos"
          data-encima={encima || undefined}
          onDragOver={(e) => { if ([...(e.dataTransfer?.types ?? [])].includes('Files')) { e.preventDefault(); setEncima(true); } }}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setEncima(false); }}
          onDrop={soltar}
          aria-describedby={[ayudaArchivos, errores.archivos ? errorArchivos : ''].filter(Boolean).join(' ')}
        >
          <legend className="campo__etiqueta">Archivos</legend>
          <span id={ayudaArchivos} className="campo__ayuda">{ayudaDeArchivos}</span>
          {archivos.length > 0 && (
            <ul ref={listaArchivos} className="entrega__lista">
              {archivos.map((a, i) => {
                const error = errores.porArchivo[a.id];
                const idError = `error-${a.id}`;
                return (
                  <li key={a.id} className="entrega__archivo" data-error={error ? '' : undefined}>
                    <IconoDeItem item={{ tipo: 'archivo', archivo: a.nombre, mime: a.mime }} />
                    <span className="entrega__archivo-texto">
                      <span className="entrega__archivo-nombre">{a.nombre}</span>
                      <span className="entrega__archivo-dato">{[a.peso ? pesoEnTexto(a.peso) : null, a.yaEsta ? 'Ya está en tu entrega' : null].filter(Boolean).join(', ')}</span>
                      {error && <span id={idError} className="campo__error" role="alert">{error}</span>}
                    </span>
                    <button type="button" className="entrega__sacar boton boton--secundario boton--chico" disabled={mandando} aria-label={`Sacar ${a.nombre}`} data-error={error ? '' : undefined} aria-describedby={error ? idError : undefined} onClick={() => sacar(a, i)}>
                      Sacar
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {errores.archivos && <span id={errorArchivos} className="campo__error" role="alert">{errores.archivos}</span>}
          <input ref={elegir} type="file" hidden multiple={reglas.cuantos > 1} accept={reglas.tipos.todos ? undefined : reglas.tipos.extensiones.map((x) => `.${x}`).join(',')} onChange={(e) => { sumarArchivos(e.target.files); e.target.value = ''; }} />
          {lleno && reglas.cuantos > 1
            ? <p className="entrega__nota">Ya elegiste los {reglas.cuantos} que acepta. Para cambiar uno, sacalo primero.</p>
            : (
              <button ref={botonElegir} type="button" className="boton boton--secundario entrega__elegir" disabled={mandando} onClick={() => elegir.current?.click()}>
                {reglas.cuantos === 1 ? (archivos.length ? 'Cambiar el archivo' : 'Elegir el archivo') : archivos.length ? 'Sumar otro archivo' : 'Elegir archivos'}
              </button>
            )}
        </fieldset>
      )}

      {errores.general && <p className="campo__error entrega__general" role="alert">{errores.general}</p>}

      {tarea.declaracion !== null && (
        <Declaracion texto={tarea.declaracion} aceptada={aceptada} onCambio={(v) => { setAceptada(v); setErrores((e) => ({ ...e, declaracion: '' })); }} error={errores.declaracion} cmid={tarea.cmid} campo={campoDeclaracion} />
      )}

      {fallo && (
        <div ref={cajaError} className="mensaje mensaje--error entrega__fallo" role="alert" tabIndex={-1}>
          <p>{fallo.texto}</p>
          {fallo.detalle && <p className="entrega__detalle">El campus dice «{fallo.detalle}»</p>}
          {fallo.sesion && <button type="button" className="boton boton--secundario boton--chico" onClick={cerrarSesion}>Entrar de nuevo</button>}
        </div>
      )}

      <div className="entrega__botones">
        <button type="submit" className="boton" aria-disabled={mandando ? 'true' : undefined}>{mandando ? 'Entregando' : 'Entregar'}</button>
        {tarea.borradores && <button type="button" className="boton boton--secundario" aria-disabled={mandando ? 'true' : undefined} onClick={() => mandar(false)}>Guardar borrador</button>}
        {editando && <button type="button" className="boton boton--secundario" disabled={mandando} onClick={onCancelar}>Cancelar</button>}
        <p className="entrega__avance" role="status">{avance}</p>
        <p className="solo-lectores" role="status">{anuncio}</p>
      </div>
    </form>
  );
}

/** A draft that can go to be graded as it is, without opening the form. */
function EnviarAhora({ tarea, materia, onListo }) {
  const { confirmar, avisar } = useUI();
  const [aceptada, setAceptada] = useState(false);
  const [error, setError] = useState('');
  const [fallo, setFallo] = useState('');
  const [mandando, setMandando] = useState(false);
  const campo = useRef(null);
  const pidiendo = useRef(false);
  const enviar = async () => {
    if (mandando || pidiendo.current) return;
    setFallo('');
    if (tarea.declaracion !== null && !aceptada) {
      setError('Para entregarla tenés que aceptar la declaración.');
      campo.current?.focus();
      return;
    }
    pidiendo.current = true;
    const si = await confirmar({ titulo: `¿Enviar ${tarea.nombre} para calificar?`, texto: 'Después ya no la podés cambiar.', boton: 'Enviar' });
    pidiendo.current = false;
    if (!si) return;
    setMandando(true);
    try {
      await enviarParaCalificar(tarea, materia, { aceptar: aceptada });
      marcarEntregada(tarea);
      avisar(`Entregaste ${tarea.nombre}`);
      onListo();
    } catch (e) {
      setFallo(e.codigo === 'sesion' ? 'Tu sesión venció. Volvé a entrar y probá de nuevo.' : textoError(e));
    }
    setMandando(false);
  };
  return (
    <div className="entrega entrega--enviar">
      <p className="entrega__nota">Está guardada como borrador. Para que la corrijan, enviala para calificar.</p>
      {tarea.declaracion !== null && (
        <Declaracion texto={tarea.declaracion} aceptada={aceptada} onCambio={(v) => { setAceptada(v); setError(''); }} error={error} cmid={tarea.cmid} campo={campo} />
      )}
      {fallo && <div className="mensaje mensaje--error" role="alert"><p>{fallo}</p></div>}
      <div className="entrega__botones">
        <button type="button" className="boton" aria-disabled={mandando ? 'true' : undefined} onClick={enviar}>{mandando ? 'Enviando' : 'Enviar para calificar'}</button>
      </div>
    </div>
  );
}

function TuEntrega({ tarea, materia, estado, ahora, onCambio }) {
  const envio = estado.envio;
  const conAlgo = tieneAlgo(envio);
  const motivo = porQueNo(tarea, estado, ahora);
  const puede = seEntregaAca(tarea) && estado.puedeEditar;
  const [editando, setEditando] = useState(false);
  const titulo = useRef(null);
  const abrir = conAlgo ? editando : puede;
  const listo = () => {
    setEditando(false);
    onCambio();
    requestAnimationFrame(() => titulo.current?.focus());
  };

  return (
    <section className="bloque tarea-campus__seccion" aria-labelledby="tu-entrega">
      <h2 id="tu-entrega" ref={titulo} tabIndex={-1}>Tu entrega</h2>
      {conAlgo && !abrir && (
        <>
          {envio.texto && (
            <div className="tarea-campus__hoja">
              {envio.texto.bloques.length ? <Bloques bloques={envio.texto.bloques} /> : <p>{envio.texto.plano}</p>}
            </div>
          )}
          <Archivos titulo="Archivos que subiste" archivos={envio.archivos} />
          {estado.puedeEnviar && <EnviarAhora tarea={tarea} materia={materia} onListo={listo} />}
          {puede && (
            <div className="entrega__botones">
              <button type="button" className={estado.puedeEnviar ? 'boton boton--secundario' : 'boton'} onClick={() => setEditando(true)}>Cambiar la entrega</button>
            </div>
          )}
        </>
      )}
      {abrir && <FormEntrega tarea={tarea} materia={materia} estado={estado} ahora={ahora} editando={conAlgo} onListo={listo} onCancelar={() => { setEditando(false); requestAnimationFrame(() => titulo.current?.focus()); }} />}
      {!abrir && motivo && estadoDe(estado) !== 'calificada' && <p className="tarea-campus__motivo">{motivo}</p>}
    </section>
  );
}

export default function Tarea() {
  const { id, tarea: cmid } = useParams();
  const { datos, error, cargando, recargar } = useConsulta(() => cargarTarea(Number(id), Number(cmid)), [id, cmid]);
  // Fixed title: the browser history keeps it even after leaving.
  useSeo({ titulo: tituloDe('Tarea'), noindex: true });
  const [ahora, setAhora] = useState(() => Date.now() / 1000);
  useEffect(() => {
    const reloj = setInterval(() => setAhora(Date.now() / 1000), 60_000);
    return () => clearInterval(reloj);
  }, []);

  const materia = datos?.materia;
  const tarea = datos?.tarea;
  const estado = datos?.estado;

  return (
    <div className="contenedor pagina tarea-campus">
      <p className="volver">{materia ? <Link to={`/materias/${materia.id}`}>{materia.nombre}</Link> : <Link to="/materias">Materias</Link>}</p>
      <div className="tarea-campus__cabeza">
        {materia && <Simbolo id={materia.id} nombre={materia.nombre} tamano="grande" />}
        <h1>{tarea?.nombre ?? 'Tarea'}</h1>
      </div>
      {error && !datos && <ErrorConReintento texto={error} recargar={recargar} />}
      {cargando && !datos && <div aria-busy="true"><Cargando texto="Buscando la tarea" cuantas={4} /></div>}
      {datos && !materia && <p>No encontramos esta materia entre las tuyas.</p>}
      {materia && !tarea && <p>No encontramos esta tarea en la materia. Puede que ya no esté en el campus.</p>}
      {tarea && estado && (
        <div className="tarea-campus__cuerpo">
          <aside className="tarea-campus__lateral">
            <Ficha tarea={tarea} estado={estado} ahora={ahora} />
          </aside>
          <div className="tarea-campus__principal">
            {estado.devolucion && (estado.devolucion.comentario.length > 0 || estado.devolucion.archivos.length > 0) && (
              <section className="bloque tarea-campus__seccion tarea-campus__devolucion" aria-labelledby="devolucion">
                <h2 id="devolucion">Devolución</h2>
                {estado.devolucion.comentario.length > 0 && <div className="tarea-campus__hoja tarea-campus__hoja--docente"><Bloques bloques={estado.devolucion.comentario} /></div>}
                <Archivos titulo="Archivos del docente" archivos={estado.devolucion.archivos} />
              </section>
            )}
            <section className="bloque tarea-campus__seccion" aria-labelledby="consigna">
              <h2 id="consigna">Consigna</h2>
              {tarea.consigna.length ? <Bloques bloques={tarea.consigna} /> : <p className="tarea-campus__motivo">La consigna está en el campus.</p>}
              <Archivos titulo="Archivos de la consigna" archivos={tarea.adjuntos} />
              {(tarea.instrucciones.length > 0 || tarea.adjuntosInstrucciones.length > 0) && (
                <>
                  <h3 className="tarea-campus__subtitulo">Para entregar</h3>
                  {tarea.instrucciones.length > 0 && <Bloques bloques={tarea.instrucciones} />}
                  <Archivos titulo="Archivos para la entrega" archivos={tarea.adjuntosInstrucciones} />
                </>
              )}
            </section>
            <TuEntrega key={tarea.id} tarea={tarea} materia={materia} estado={estado} ahora={ahora} onCambio={recargar} />
          </div>
        </div>
      )}
    </div>
  );
}
