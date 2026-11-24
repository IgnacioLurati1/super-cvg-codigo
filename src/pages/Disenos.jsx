import { useEffect, useId, useMemo, useRef, useState } from 'react';
import Campo from '../components/Campo';
import { Cargando, ErrorConReintento } from '../components/Filas';
import MiniaturaDeDiseno from '../components/MiniaturaDeDiseno';
import { useUI } from '../components/ui';
import { ajustesActuales, disenoQueSeVe, editarDiseno as editarDelDia, useAjustesGuardados } from '../lib/ajustes';
import { cargarPerfil } from '../lib/campus';
import { codigoDeEstilo } from '../lib/codigoDeEstilo';
import {
  ajustesDeCodigo, borrarComentario, borrarDiseno, cargarComentarios, cargarDisenos, comentarDiseno, denunciar, disenoSigue, editarDiseno, largo, limpiarTexto, MAX_BUSCAR,
  MAX_COMENTARIO, MAX_DESCRIPCION, MAX_NOMBRE, olvidarDisenoEnUso, problemaDeTexto, publicarDiseno, resumenDeDiseno, useDisenoEnUso, usarDiseno, probarDiseno,
  terminarPrueba, volverAlTuyo, votarDiseno,
} from '../lib/disenos';
import { useDisenoEnPrueba } from '../lib/enPrueba';
import { textoError } from '../lib/errores';
import { useMio } from '../lib/mio';
import { esDemo } from '../lib/modoDemo';
import { borrarVinculo, CUENTA_SANTO, useVinculo, vincularDemo } from '../lib/resumenes';
import { tokenActual } from '../lib/sesion';
import { tituloDe, useSeo } from '../lib/seo';
import { useConsulta } from '../lib/useConsulta';
import { useQuieto } from '../lib/useQuieto';
import './configuracion.css';
import './disenos.css';

const otraPestana = <span className="solo-lectores">, se abre en otra pestaña</span>;
const decimal = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const DIA = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short' });
const DIA_Y_ANO = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
// The day, with the year only when it isn't this one.
const diaDe = (iso) => {
  const f = new Date(iso);
  return (f.getFullYear() === new Date().getFullYear() ? DIA : DIA_Y_ANO).format(f);
};
const ORDENES = [
  { valor: 'mejores', nombre: 'Mejor puntuados' },
  { valor: 'nuevos', nombre: 'Nuevos' },
];
const ERRORES_DE_TEXTO = {
  nombre: { vacio: 'Ponele un nombre.', largo: `Hasta ${MAX_NOMBRE} caracteres.`, html: 'Sacale los signos < y >.' },
  descripcion: { largo: `Hasta ${MAX_DESCRIPCION} caracteres.`, html: 'Sacale los signos < y >.' },
  comentario: { vacio: 'Escribí algo antes de comentar.', largo: `Hasta ${MAX_COMENTARIO} caracteres.`, html: 'Sacale los signos < y >.' },
};
const ESTRELLA = <path d="M12 3.2l2.7 5.5 6 .9-4.4 4.2 1 6-5.3-2.8-5.3 2.8 1-6L3.3 9.6l6-.9z" />;

const votosEnTexto = (n) => (n === 1 ? 'un voto' : `${n} votos`);
const comentariosEnTexto = (n) => (n === 1 ? 'Un comentario' : `${n} comentarios`);
const estrellasEnTexto = (n) => (n === 1 ? '1 estrella' : `${n} estrellas`);

function Puntaje({ d }) {
  if (!d.votos) return <p className="diseno__puntaje" data-vacio>Sin puntaje todavía</p>;
  return (
    <p className="diseno__puntaje">
      <svg className="diseno__estrella" viewBox="0 0 24 24" aria-hidden="true" focusable="false">{ESTRELLA}</svg>
      <span className="solo-lectores">Puntaje </span>
      <strong>{decimal.format(d.estrellas)}</strong>
      <span className="solo-lectores"> de 5</span>
      <span className="diseno__votos">{votosEnTexto(d.votos)}</span>
    </p>
  );
}

// Para vincular la cuenta. En /?demo=1 (npm run dev) se vincula al toque con la cuenta de ejemplo.
function Vincular({ alumno, texto }) {
  const alTocar = (e) => {
    if (!esDemo(tokenActual())) return;
    e.preventDefault();
    vincularDemo(alumno);
  };
  return (
    <div className="disenos__vincular">
      <p>{texto}</p>
      <a className="boton boton--secundario" href={CUENTA_SANTO} target="_blank" rel="noreferrer" onClick={alTocar}>Vincular desde El Santo Resumen{otraPestana}</a>
    </div>
  );
}

// Una hoja al costado, como las de Resúmenes: se cierra con Esc, con Cerrar o tocando afuera.
function Hoja({ titulo, idTitulo, onCerrar, children }) {
  const dialogo = useRef(null);
  const desdeFondo = useRef(false);
  useEffect(() => {
    const el = dialogo.current;
    if (!el.open) el.showModal();
  }, []);
  return (
    <dialog
      ref={dialogo}
      className="previa disenos__hoja"
      aria-labelledby={idTitulo}
      // Only its own: a sheet opened inside this one (Editar) also reaches here through React.
      onClose={(e) => { if (e.target === dialogo.current) onCerrar(); }}
      onPointerDown={(e) => { desdeFondo.current = e.target === dialogo.current; }}
      onClick={(e) => { if (desdeFondo.current && e.target === dialogo.current) dialogo.current.close(); }}
    >
      <div className="previa__caja">
        <div className="previa__cabeza">
          <h2 id={idTitulo}>{titulo}</h2>
          <button type="button" className="boton boton--secundario boton--chico" onClick={() => dialogo.current.close()}>Cerrar</button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

// What happened inside a sheet: the page's notices stay behind it (it's modal), so they are said here. Both regions
// are always there, so a screen reader hears what lands in them.
function useAvisoDeHoja() {
  const [aviso, setAviso] = useState(null);
  const reloj = useRef(0);
  useEffect(() => () => clearTimeout(reloj.current), []);
  const mostrar = (texto, tipo) => {
    clearTimeout(reloj.current);
    setAviso({ texto, error: tipo === 'error' });
    if (tipo !== 'error') reloj.current = setTimeout(() => setAviso(null), 6000);
  };
  const vista = (
    <div className="disenos__aviso" data-error={aviso?.error || undefined}>
      <p role="status">{aviso && !aviso.error ? aviso.texto : ''}</p>
      <p role="alert">{aviso?.error ? aviso.texto : ''}</p>
    </div>
  );
  return [vista, mostrar];
}

function Tarjeta({ d, probando, onProbar, onUsar, onAbrir }) {
  const id = useId();
  return (
    <li className="diseno" data-probando={probando || undefined} aria-labelledby={`${id}-n`}>
      <MiniaturaDeDiseno ajustes={d.ajustes} />
      <div className="diseno__cuerpo">
        <h2 className="diseno__nombre" id={`${id}-n`}>{d.nombre}</h2>
        <p className="diseno__autor">de {d.autor}{d.mio && ' (vos)'}</p>
        <Puntaje d={d} />
        {d.comentarios > 0 && <p className="diseno__resumen">{comentariosEnTexto(d.comentarios)}</p>}
        <p className="diseno__resumen">{resumenDeDiseno(d.ajustes)}</p>
        {d.descripcion && <p className="diseno__descripcion">{d.descripcion}</p>}
        {d.oculto && <p className="diseno__marca">Oculto por denuncias. Solo lo ves vos.</p>}
      </div>
      <div className="diseno__botones">
        <button type="button" className="boton boton--chico" aria-pressed={probando} onClick={onProbar}>
          Vista previa<span className="solo-lectores"> de {d.nombre}</span>
        </button>
        <button type="button" className="boton boton--secundario boton--chico" onClick={onUsar}>Usar<span className="solo-lectores"> {d.nombre}</span></button>
        <button type="button" className="boton boton--secundario boton--chico" onClick={onAbrir}>
          {d.mio ? 'Comentarios' : 'Puntuar y comentar'}<span className="solo-lectores"> de {d.nombre}</span>
        </button>
      </div>
    </li>
  );
}

// Uno a cinco, cada uno un botón: puntúa al tocarlo (o con Enter o Espacio), nunca al moverse con las flechas o Tab.
// Mientras se manda no se deshabilita, así el foco queda donde estaba. El propio no se puntúa.
function Estrellas({ valor, onElegir, ocupado }) {
  const id = useId();
  const [sobre, setSobre] = useState(0);
  const pintadas = sobre || valor || 0;
  return (
    <div className="estrellas" role="group" aria-labelledby={id} aria-busy={ocupado || undefined} onPointerLeave={() => setSobre(0)}>
      <p className="estrellas__titulo" id={id}>Tu puntaje</p>
      <div className="estrellas__fila">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            className="estrellas__una"
            aria-pressed={valor === n}
            data-pintada={n <= pintadas || undefined}
            onPointerEnter={() => setSobre(n)}
            onClick={() => onElegir(n)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">{ESTRELLA}</svg>
            <span className="solo-lectores">{estrellasEnTexto(n)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Ficha({ d, alumno, llave, ajustes, mio, probando, onProbar, onUsar, onCambio, onBorrado, onCerrar, onLlaveCortada }) {
  const idTitulo = useId();
  const { confirmar, avisar } = useUI();
  const [aviso, mostrar] = useAvisoDeHoja();
  const comentarios = useConsulta(() => cargarComentarios(d.id, llave), [d.id, llave]);
  const [texto, setTexto] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [votando, setVotando] = useState(false);
  const [editando, setEditando] = useState(false);
  const votandoYa = useRef(false);
  const campo = useRef(null);
  const botonEditar = useRef(null);
  // After saving, the edit sheet goes away without closing, so the browser doesn't give the focus back: it goes here.
  const estabaEditando = useRef(false);
  useEffect(() => {
    if (estabaEditando.current && !editando && document.activeElement === document.body) botonEditar.current?.focus();
    estabaEditando.current = editando;
  }, [editando]);

  const fallo = (e) => {
    if (e.motivo === 'llave') onLlaveCortada();
    mostrar(textoError(e), 'error');
  };

  const votar = async (n) => {
    if (votandoYa.current || n === d.miVoto) return;
    votandoYa.current = true;
    setVotando(true);
    try {
      const r = await votarDiseno(llave, d.id, n);
      onCambio(d.id, r);
      mostrar(`Le pusiste ${estrellasEnTexto(n)}.`);
    } catch (e) {
      fallo(e);
    } finally {
      votandoYa.current = false;
      setVotando(false);
    }
  };

  const comentar = async (e) => {
    e.preventDefault();
    const problema = problemaDeTexto(texto, { max: MAX_COMENTARIO, renglones: true });
    if (problema) {
      setError(ERRORES_DE_TEXTO.comentario[problema]);
      campo.current?.focus();
      return;
    }
    setEnviando(true);
    try {
      await comentarDiseno(llave, d.id, texto);
      comentarios.recargar();
      onCambio(d.id, { comentarios: d.comentarios + 1 });
      setTexto('');
      setError('');
      mostrar('Comentario publicado.');
    } catch (err) {
      if (err.motivo === 'invalido') setError(textoError(err));
      else fallo(err);
    } finally {
      setEnviando(false);
    }
  };

  const borrarElComentario = async (c) => {
    if (!(await confirmar({ titulo: '¿Borrar tu comentario?', boton: 'Borrar', peligro: true }))) return;
    try {
      await borrarComentario(llave, c.id);
      comentarios.recargar();
      onCambio(d.id, { comentarios: Math.max(0, d.comentarios - 1) });
      mostrar('Comentario borrado.');
    } catch (e) {
      fallo(e);
    }
  };

  const denunciarAlgo = async (tipo, id) => {
    const seguro = await confirmar({
      titulo: tipo === 'diseno' ? '¿Denunciar este diseño?' : '¿Denunciar este comentario?',
      texto: 'Con denuncias de varias cuentas se oculta hasta que se revise.',
      boton: 'Denunciar',
    });
    if (!seguro) return;
    try {
      await denunciar(llave, tipo, id);
      mostrar('Denuncia enviada.');
    } catch (e) {
      fallo(e);
    }
  };

  const borrarElDiseno = async () => {
    if (!(await confirmar({ titulo: `¿Borrar «${d.nombre}»?`, texto: 'Se van también sus puntajes y comentarios.', boton: 'Borrar', peligro: true }))) return;
    try {
      await borrarDiseno(llave, d.id);
      // The sheet closes: this one is said on the page.
      avisar('Diseño borrado');
      onBorrado(d.id);
    } catch (e) {
      fallo(e);
    }
  };

  const restan = MAX_COMENTARIO - largo(limpiarTexto(texto, { renglones: true }));
  const lista = comentarios.datos;

  return (
    <Hoja titulo={d.nombre} idTitulo={idTitulo} onCerrar={onCerrar}>
      <MiniaturaDeDiseno ajustes={d.ajustes} grande />
      <p className="previa__dato">de {d.autor}{d.mio && ' (vos)'}{d.creado && `, ${diaDe(d.creado)}`}</p>
      <Puntaje d={d} />
      <p className="diseno__resumen">{resumenDeDiseno(d.ajustes)}</p>
      {d.descripcion && <p className="previa__descripcion">{d.descripcion}</p>}
      <div className="disenos__acciones">
        <button type="button" className="boton" aria-pressed={probando} onClick={onProbar}>Vista previa</button>
        <button type="button" className="boton boton--secundario" onClick={() => onUsar(mostrar)}>Usar</button>
      </div>
      {probando && <p className="disenos__nota-celu">Cerrá esta hoja para verlo en toda la página.</p>}

      <section className="disenos__opinar" aria-labelledby={`${idTitulo}-o`}>
        <h3 id={`${idTitulo}-o`}>Puntaje y comentarios</h3>
        {!llave && <Vincular alumno={alumno} texto="Para puntuar y comentar, vinculá tu cuenta de El Santo Resumen." />}
        {llave && !d.mio && <Estrellas valor={d.miVoto} onElegir={votar} ocupado={votando} />}
        {comentarios.error && !lista && <ErrorConReintento texto={comentarios.error} recargar={comentarios.recargar} />}
        {comentarios.cargando && !lista && <Cargando texto="Buscando los comentarios" cuantas={2} />}
        {lista && !lista.length && <p className="disenos__nada">Todavía no hay comentarios.</p>}
        {lista?.length > 0 && (
          <ol className="comentarios">
            {lista.map((c) => (
              <li key={c.id} className="comentario">
                <p className="comentario__quien">{c.autor}{c.mio && ' (vos)'}{c.creado && <span className="comentario__cuando">, {diaDe(c.creado)}</span>}</p>
                <p className="comentario__texto">{c.texto}</p>
                {llave && (c.mio ? (
                  <button type="button" className="disenos__link" onClick={() => borrarElComentario(c)}>Borrar<span className="solo-lectores"> tu comentario</span></button>
                ) : (
                  <button type="button" className="disenos__link" onClick={() => denunciarAlgo('comentario', c.id)}>Denunciar<span className="solo-lectores"> el comentario de {c.autor}</span></button>
                ))}
              </li>
            ))}
          </ol>
        )}
        {llave && (
          <form className="disenos__comentar" onSubmit={comentar} noValidate>
            <Campo etiqueta="Tu comentario" error={error}>
              <textarea
                ref={campo}
                className="campo__control"
                rows={3}
                value={texto}
                onChange={(e) => {
                  setTexto(e.target.value);
                  if (error) setError('');
                }}
              />
            </Campo>
            <div className="disenos__pie-form">
              <span className="disenos__quedan" data-sobra={restan < 0 || undefined}>{restan < 0 ? `Sobran ${-restan}` : `Quedan ${restan}`}</span>
              <button type="submit" className="boton" disabled={enviando}>{enviando ? 'Publicando' : 'Comentar'}</button>
            </div>
          </form>
        )}
      </section>

      {llave && (
        <div className="disenos__al-pie">
          {d.mio ? (
            <>
              <button ref={botonEditar} type="button" className="boton boton--secundario boton--chico" onClick={() => setEditando(true)}>Editar este diseño</button>
              <button type="button" className="boton boton--secundario boton--chico disenos__borrar" onClick={borrarElDiseno}>Borrar este diseño</button>
            </>
          ) : (
            <button type="button" className="disenos__link" onClick={() => denunciarAlgo('diseno', d.id)}>Denunciar este diseño</button>
          )}
        </div>
      )}
      {aviso}
      {editando && (
        <Publicar
          alumno={alumno}
          llave={llave}
          ajustes={ajustes}
          mio={mio}
          diseno={d}
          onCerrar={() => setEditando(false)}
          onPublicado={(nuevo) => {
            onCambio(d.id, nuevo);
            setEditando(false);
            mostrar('Cambios guardados.');
          }}
          onLlaveCortada={onLlaveCortada}
        />
      )}
    </Hoja>
  );
}

// Publicar tu estilo o, con `diseno`, editar uno tuyo: el estilo queda salvo que elijas el de ahora.
function Publicar({ alumno, llave, ajustes, mio, diseno = null, onCerrar, onPublicado, onLlaveCortada }) {
  const idTitulo = useId();
  const { avisar } = useUI();
  const [nombre, setNombre] = useState(diseno?.nombre ?? '');
  const [descripcion, setDescripcion] = useState(diseno?.descripcion ?? '');
  const [conElDeAhora, setConElDeAhora] = useState(!diseno);
  const [errores, setErrores] = useState({});
  const [enviando, setEnviando] = useState(false);
  const [falla, setFalla] = useState('');
  const campoNombre = useRef(null);
  const campoDescripcion = useRef(null);
  const deAhora = useMemo(() => ajustesDeCodigo(codigoDeEstilo(ajustes, mio), ajustes) ?? ajustes, [ajustes, mio]);
  const actuales = conElDeAhora ? deAhora : diseno.ajustes;

  const publicar = async (e) => {
    e.preventDefault();
    const n = problemaDeTexto(nombre, { max: MAX_NOMBRE });
    const dsc = problemaDeTexto(descripcion, { max: MAX_DESCRIPCION, obligatorio: false });
    const nuevos = { nombre: n && ERRORES_DE_TEXTO.nombre[n], descripcion: dsc && ERRORES_DE_TEXTO.descripcion[dsc] };
    setErrores(nuevos);
    if (n || dsc) {
      (n ? campoNombre : campoDescripcion).current?.focus();
      return;
    }
    setEnviando(true);
    setFalla('');
    try {
      if (diseno) {
        onPublicado(await editarDiseno(llave, diseno.id, conElDeAhora ? { nombre, descripcion, ajustes, mio } : { nombre, descripcion, codigo: diseno.codigo }));
        return;
      }
      await publicarDiseno(llave, { nombre, descripcion, ajustes, mio });
      // The sheet closes: this one is said on the page.
      avisar('Diseño publicado');
      onPublicado();
    } catch (err) {
      if (err.motivo === 'llave') onLlaveCortada();
      setFalla(textoError(err));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Hoja titulo={diseno ? `Editar «${diseno.nombre}»` : 'Publicar tu estilo'} idTitulo={idTitulo} onCerrar={onCerrar}>
      <MiniaturaDeDiseno ajustes={actuales} grande />
      <p className="diseno__resumen">{resumenDeDiseno(actuales)}</p>
      {diseno && (
        <label className="disenos__casilla">
          <input type="checkbox" checked={conElDeAhora} onChange={(e) => setConElDeAhora(e.target.checked)} />
          Cambiar el estilo por tu configuración de ahora
        </label>
      )}
      {conElDeAhora && (
        <p className="previa__dato">Se publica toda tu configuración de ahora, como en «Pasar tu estilo». Tus materias y lo que anotaste no van.</p>
      )}
      {diseno && <p className="previa__dato">Los puntajes y comentarios quedan.</p>}
      {!llave ? (
        <Vincular alumno={alumno} texto="Para publicar, vinculá tu cuenta de El Santo Resumen. Tu diseño sale con tu nombre de usuario de ahí." />
      ) : (
        <form className="disenos__publicar" onSubmit={publicar} noValidate>
          <Campo etiqueta="Nombre" ayuda="Por ejemplo, Noche de parciales" error={errores.nombre}>
            <input ref={campoNombre} className="campo__control" type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="off" />
          </Campo>
          <Campo etiqueta="Descripción (si querés)" ayuda={`Hasta ${MAX_DESCRIPCION} caracteres`} error={errores.descripcion}>
            <textarea ref={campoDescripcion} className="campo__control" rows={3} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
          </Campo>
          <p className="mensaje mensaje--error" role="alert" hidden={!falla}>{falla}</p>
          <button type="submit" className="boton" disabled={enviando}>
            {diseno ? (enviando ? 'Guardando' : 'Guardar cambios') : enviando ? 'Publicando' : 'Publicar'}
          </button>
        </form>
      )}
    </Hoja>
  );
}

function DelAlumno({ alumno }) {
  const ajustes = useAjustesGuardados();

  const mio = useMio();
  const vinculo = useVinculo(alumno);
  const llave = vinculo?.llave ?? null;
  const enUsoGuardado = useDisenoEnUso();
  // In use only while the settings are still that design's: after changing them in Configuración, going back would
  // undo those changes without asking, so the mark goes.
  const enUso = enUsoGuardado && disenoSigue(enUsoGuardado, ajustes, mio) ? enUsoGuardado : null;
  useEffect(() => {
    if (enUsoGuardado && !enUso) olvidarDisenoEnUso();
  }, [enUsoGuardado, enUso]);
  const { confirmar, avisar } = useUI();
  const [orden, setOrden] = useState('mejores');
  const [escrito, setEscrito] = useState('');
  const buscar = useQuieto(limpiarTexto(escrito), 300);
  const [vuelta, setVuelta] = useState(0);
  const [lista, setLista] = useState({ clave: '', disenos: null, mas: false, siguiente: 0, error: '' });
  const [trayendo, setTrayendo] = useState(false);
  // The design being tried, for the whole site: it stays when the student goes to another screen (BarraDePrueba.jsx).
  const previa = useDisenoEnPrueba();
  const [abierto, setAbierto] = useState(null);
  const [publicando, setPublicando] = useState(false);
  const clave = `${orden}|${buscar}|${llave ?? ''}|${vuelta}`;

  useEffect(() => {
    let vigente = true;
    cargarDisenos({ orden, buscar, llave }).then(
      (r) => vigente && setLista({ clave, ...r, error: '' }),
      (e) => vigente && setLista((l) => ({ ...l, clave, error: textoError(e) })),
    );
    return () => {
      vigente = false;
    };
    // `clave` junta todo lo que cambia la lista.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  // The bar at the bottom covers what's under it: the page scrolls the focused one above it (WCAG 2.4.11).
  const barra = useRef(null);
  // While a design is tried, its bar is the one of every screen (Layout); this one, for the design in use.
  const hayBarra = Boolean(enUso && !previa);
  useEffect(() => {
    const el = barra.current;
    if (!hayBarra || !el) return undefined;
    const raiz = document.documentElement;
    const medir = () => {
      raiz.style.scrollPaddingBottom = `${Math.ceil(el.getBoundingClientRect().height) + 24}px`;
    };
    medir();
    const observador = typeof ResizeObserver === 'function' ? new ResizeObserver(medir) : null;
    observador?.observe(el);
    return () => {
      observador?.disconnect();
      raiz.style.scrollPaddingBottom = '';
    };
  }, [hayBarra]);

  const cortarLlave = () => borrarVinculo(alumno, llave);
  // What's on screen is of this `clave` or of an older one, on its way out: its error goes with it.
  const deAhora = lista.clave === clave;
  const error = deAhora ? lista.error : '';
  const cargando = !deAhora;
  const disenos = lista.disenos;

  const cambiar = (id, cambios) => setLista((l) => ({ ...l, disenos: l.disenos?.map((d) => (d.id === id ? { ...d, ...cambios } : d)) }));
  const abiertoAhora = abierto && disenos?.find((d) => d.id === abierto);

  const probar = (d) => probarDiseno(d);
  // `avisarEn`: from a sheet, its own notices (the page's stay behind it).
  const usar = async (d, avisarEn = null) => {
    // With «Según la hora», the student chooses which of their two designs it goes into: the one showing, to start.
    const segun = Boolean(ajustes.segunLaHora);
    const respuesta = await confirmar({
      titulo: `¿Usar «${d.nombre}»?`,
      texto: 'Cambia toda tu configuración, menos daltonismo, movimiento y Sensible a la luz. Después podés volver a la tuya.',
      boton: 'Usar este diseño',
      elegir: segun ? { titulo: 'En tu diseño de', opciones: [{ valor: 'dia', nombre: 'Día' }, { valor: 'noche', nombre: 'Noche' }], valor: disenoQueSeVe() } : undefined,
    });
    if (!respuesta) return;
    // The chosen one, only while it's used (editarDiseno of ajustes.js): then the hour's shows again.
    if (segun) editarDelDia(respuesta);
    const bien = usarDiseno(d, { ajustes: segun ? ajustesActuales() : ajustes, mio });
    if (segun) editarDelDia(null);
    if (!bien) (avisarEn ?? avisar)('No se pudo guardar. Vale hasta que cierres esta pestaña.', 'error');
    else avisarEn?.(segun ? `Usás «${d.nombre}» de ${respuesta === 'noche' ? 'noche' : 'día'}.` : `Usás «${d.nombre}».`);
  };
  const volver = async () => {
    const seguro = await confirmar({
      titulo: '¿Volver a tu estilo?',
      texto: `Dejás «${enUso.nombre}». Vuelve la configuración que tenías antes de usarlo.`,
      boton: 'Volver a mi estilo',
      volver: `Seguir con «${enUso.nombre}»`,
    });
    if (!seguro) return;
    if (volverAlTuyo(ajustes)) avisar('Volviste a tu estilo');
    else avisar('No se pudo volver a tu estilo.', 'error');
  };

  const traerMas = async () => {
    const pedida = clave;
    setTrayendo(true);
    try {
      const r = await cargarDisenos({ orden, buscar, llave, desde: lista.siguiente });
      // If the order or the search changed meanwhile, this page is of another list.
      setLista((l) => (l.clave !== pedida ? l : {
        ...l,
        disenos: [...l.disenos, ...r.disenos.filter((d) => !l.disenos.some((x) => x.id === d.id))],
        mas: r.mas,
        siguiente: r.siguiente,
      }));
    } catch (e) {
      avisar(textoError(e), 'error');
    } finally {
      setTrayendo(false);
    }
  };

  const cuantos = !disenos || cargando ? '' : !disenos.length ? 'Sin diseños' : disenos.length === 1 ? 'Un diseño' : `${disenos.length} diseños`;
  const estadoDeBarra = previa ? `Probando ${previa.nombre}. Nada se guarda.` : enUso ? `Usás ${enUso.nombre}.` : '';

  return (
    <>
      <div className="disenos__herramientas">
        <Campo etiqueta="Buscar por nombre">
          <input className="campo__control" type="search" value={escrito} onChange={(e) => setEscrito(e.target.value)} maxLength={MAX_BUSCAR} autoComplete="off" />
        </Campo>
        <div className="tipos" role="group" aria-label="Ordenar">
          {ORDENES.map((o) => (
            <button key={o.valor} type="button" className="tipos__opcion" aria-pressed={orden === o.valor} onClick={() => setOrden(o.valor)}>{o.nombre}</button>
          ))}
        </div>
        <button type="button" className="boton disenos__publicar-boton" onClick={() => setPublicando(true)}>Publicar tu estilo</button>
      </div>
      <p className="solo-lectores" role="status">{cuantos}</p>
      <p className="solo-lectores" role="status">{estadoDeBarra}</p>

      <div aria-busy={cargando || undefined}>
        {error && <ErrorConReintento texto={error} recargar={() => setVuelta((v) => v + 1)} />}
        {!error && (cargando && !disenos ? (
          <Cargando texto="Buscando diseños" forma="tarjetas" cuantas={6} />
        ) : disenos && !disenos.length ? (
          <div className="disenos__vacio">
            <p>{buscar ? 'Ningún diseño se llama así.' : 'Todavía nadie publicó un diseño.'}</p>
            {!buscar && <button type="button" className="boton boton--secundario" onClick={() => setPublicando(true)}>Publicar el primero</button>}
          </div>
        ) : disenos && (
          <ul className="disenos__lista" data-cargando={cargando || undefined}>
            {disenos.map((d) => (
              <Tarjeta key={d.id} d={d} probando={previa?.id === d.id} onProbar={() => probar(d)} onUsar={() => usar(d)} onAbrir={() => setAbierto(d.id)} />
            ))}
          </ul>
        ))}
        {lista.mas && !cargando && !error && (
          <button type="button" className="boton boton--secundario disenos__mas" onClick={traerMas} disabled={trayendo}>{trayendo ? 'Trayendo' : 'Ver más diseños'}</button>
        )}
      </div>

      {hayBarra && (
        <div className="disenos__barra" ref={barra} role="region" aria-label="Diseño en uso">
          <p>Usás <strong>{enUso.nombre}</strong>.</p>
          <div className="disenos__acciones">
            <button type="button" className="boton boton--secundario boton--chico" onClick={volver}>Volver al tuyo</button>
          </div>
        </div>
      )}

      {abiertoAhora && (
        <Ficha
          key={abiertoAhora.id}
          d={abiertoAhora}
          alumno={alumno}
          llave={llave}
          ajustes={ajustes}
          mio={mio}
          probando={previa?.id === abiertoAhora.id}
          onProbar={() => probar(abiertoAhora)}
          onUsar={(avisarEn) => usar(abiertoAhora, avisarEn)}
          onCambio={cambiar}
          onBorrado={(id) => {
            setAbierto(null);
            if (previa?.id === id) terminarPrueba();
            setLista((l) => ({ ...l, disenos: l.disenos.filter((d) => d.id !== id) }));
          }}
          onCerrar={() => setAbierto(null)}
          onLlaveCortada={cortarLlave}
        />
      )}
      {publicando && (
        <Publicar
          alumno={alumno}
          llave={llave}
          ajustes={ajustes}
          mio={mio}
          onCerrar={() => setPublicando(false)}
          onPublicado={() => {
            setPublicando(false);
            setEscrito('');
            setOrden('nuevos');
            setVuelta((v) => v + 1);
          }}
          onLlaveCortada={cortarLlave}
        />
      )}
    </>
  );
}

export default function Disenos() {
  useSeo({ titulo: tituloDe('Diseños'), noindex: true });
  const { datos, error, recargar } = useConsulta(cargarPerfil);
  const alumno = datos?.id ?? null;

  let cuerpo;
  if (alumno) cuerpo = <DelAlumno key={alumno} alumno={alumno} />;
  else if (error) cuerpo = <ErrorConReintento texto={error} recargar={recargar} />;
  else cuerpo = <Cargando texto="Buscando diseños" forma="tarjetas" cuantas={6} />;

  return (
    <div className="contenedor pagina disenos">
      <h1>Diseños</h1>
      <p className="disenos__bajada">Estilos de Super CVG que armaron otros alumnos. Probalos antes de usarlos.</p>
      {cuerpo}
    </div>
  );
}
