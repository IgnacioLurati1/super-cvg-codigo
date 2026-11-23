import { useEffect, useState } from 'react';
import Campo from '../components/Campo';
import Combo from '../components/Combo';
import { Cargando, ErrorConReintento } from '../components/Filas';
import HojaResumen from '../components/HojaResumen';
import { MeGusta, useGustos } from '../components/MeGusta';
import { Icono } from '../components/Simbolo';
import { useUI } from '../components/ui';
import VisorResumen from '../components/VisorResumen';
import { cargarPerfil } from '../lib/campus';
import { textoError } from '../lib/errores';
import { esDemo } from '../lib/modoDemo';
import {
  adoptarVinculo,
  BANCO_SANTO,
  borrarVinculo,
  canjearPendiente,
  cargarResumenes,
  CUENTA_SANTO,
  desvincular,
  olvidarResultado,
  quitarResumen,
  TEXTOS,
  useCanje,
  useVinculo,
  vincularDemo,
} from '../lib/resumenes';
import { buscarEnBanco, cargarBanco, MATERIAS_SANTO } from '../lib/santoResumen';
import { tokenActual } from '../lib/sesion';
import { tituloDe, useSeo } from '../lib/seo';
import { useConsulta } from '../lib/useConsulta';
import { useQuieto } from '../lib/useQuieto';
import './resumenes.css';

// The name of the button in the bank, never split across two lines.
const ENVIAR = '«Enviar\u00a0a\u00a0Super\u00a0CVG»';
const otraPestana = <span className="solo-lectores">, se abre en otra pestaña</span>;
// The symbol of each format, with the color the site already gives that kind of file.
const ICONOS = {
  pdf: ['documento', 'pdf'],
  docx: ['documento', 'doc'],
  'google-docs': ['documento', 'doc'],
  pptx: ['presentacion', 'presentacion'],
  'google-slides': ['presentacion', 'presentacion'],
  html: ['codigo', 'enlace'],
};

// While it comes: the shape of the cards, with the container marked busy.
function Esqueleto({ texto }) {
  return (
    <div className="resumenes__esqueleto" aria-busy="true">
      <Cargando texto={texto} forma="tarjetas" cuantas={3} />
    </div>
  );
}

function Mensaje({ tipo, texto, reintentar }) {
  return (
    <div className={`mensaje${tipo === 'info' ? '' : ` mensaje--${tipo}`}`}>
      <p>{texto}</p>
      {reintentar && <button type="button" className="boton boton--secundario boton--chico" onClick={reintentar}>Probar de nuevo</button>}
    </div>
  );
}

// Both always in the page and empty at first: a live region that is born with its text is not announced by some
// screen readers. The text goes in a moment later. What went well or changed is said politely; an error interrupts.
function Avisos({ aviso, error }) {
  const [listo, setListo] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setListo(true), 100);
    return () => clearTimeout(t);
  }, []);
  return (
    <>
      <div className="resumenes__aviso" role="status" aria-live="polite">{listo && aviso && <Mensaje {...aviso} />}</div>
      <div className="resumenes__aviso" role="alert">{listo && error && <Mensaje tipo="error" {...error} />}</div>
    </>
  );
}

// Each summary is a card with its sheet behind, peeking out over what you read: the photo of its first page or its
// cover. A published one opens here, on the whole screen: the whole card is its button. One in review or hidden does
// not open, and says so.
function Tarjeta({ r, instancia, materia, children, pie }) {
  const [simbolo, tono] = ICONOS[r.formato] ?? ['documento', undefined];
  return (
    <li className="resumen">
      <HojaResumen foto={r.foto} titulo={r.titulo} materia={materia} instancia={instancia} />
      <div className="resumen__cuerpo">
        <Icono nombre={simbolo} tono={tono} tamano="tipo" />
        <span className="resumen__texto">{children}</span>
        <div className="resumen__pie">{pie}</div>
      </div>
    </li>
  );
}

function Fila({ r, quitar, quitando, abrir }) {
  return (
    <Tarjeta
      r={r}
      instancia={r.instancia}
      materia={r.materia}
      pie={(
        <>
          {r.marca && <span className="resumen__marca" data-estado={r.estado}>{r.marca}</span>}
          {quitar && (
            <button
              id={`quitar-${r.id}`}
              type="button"
              className="boton boton--secundario boton--chico resumen__quitar"
              aria-disabled={quitando ? 'true' : undefined}
              onClick={() => quitar(r)}
            >
              {quitando ? 'Quitando' : 'Quitar'}<span className="solo-lectores"> {r.titulo}</span>
            </button>
          )}
        </>
      )}
    >
      {r.url ? (
        <button type="button" className="resumen__titulo" aria-haspopup="dialog" onClick={() => abrir(r)}>{r.titulo}</button>
      ) : (
        <span className="resumen__titulo">{r.titulo}</span>
      )}
      <span className="resumen__dato">{r.dato}</span>
    </Tarjeta>
  );
}

function Seccion({ id, titulo, items, vacio, quitar, quitando, abrir }) {
  return (
    <section className="resumenes__seccion" aria-labelledby={id}>
      <h2 id={id} tabIndex={-1}>{titulo}</h2>
      {items.length ? (
        <ul className="resumenes__lista">
          {items.map((r) => <Fila key={r.id} r={r} quitar={quitar} quitando={quitando === r.id} abrir={abrir} />)}
        </ul>
      ) : (
        <div className="resumenes__nada">
          <p>{vacio}</p>
        </div>
      )}
    </section>
  );
}

function Listas({ datos, quitar, quitando, abrir }) {
  if (!datos.subidos.length && !datos.enviados.length) {
    return (
      <section className="resumenes__hueco" aria-labelledby="resumenes-vacio">
        <Icono nombre="documento" tamano="grande" />
        <h2 id="resumenes-vacio" tabIndex={-1}>Todavía no hay resúmenes acá</h2>
        <p>Los que subas al banco de El Santo Resumen aparecen acá. En el banco, tocá {ENVIAR} en los que quieras tener a mano.</p>
        <a className="boton boton--secundario" href={BANCO_SANTO} target="_blank" rel="noreferrer">Ir al banco{otraPestana}</a>
      </section>
    );
  }
  const alBanco = (texto) => <a href={BANCO_SANTO} target="_blank" rel="noreferrer">{texto}{otraPestana}</a>;
  return (
    <>
      <Seccion
        id="resumenes-subidos"
        titulo="Subidos por vos"
        items={datos.subidos}
        abrir={abrir}
        vacio={<>Todavía no subiste ninguno. Cuando subas uno {alBanco('al banco')}, aparece acá.</>}
      />
      <Seccion
        id="resumenes-enviados"
        titulo="Mandados desde El Santo Resumen"
        items={datos.enviados}
        abrir={abrir}
        quitar={quitar}
        quitando={quitando}
        vacio={<>En {alBanco('el banco')}, tocá {ENVIAR} en los que quieras tener a mano.</>}
      />
    </>
  );
}

const DE_A = 30;
const MATERIAS = MATERIAS_SANTO.map(([valor, nombre]) => ({ valor, nombre }));

function Partes({ partes }) {
  return partes.map((p, i) => (p.marca ? <mark key={i}>{p.texto}</mark> : <span key={i}>{p.texto}</span>));
}

function FilaBanco({ r, todas, gustos, abrir }) {
  const dato = [todas && r.materiaNombre, r.instancia, r.autor && `de ${r.autor}`].filter(Boolean).join(', ');
  // In the viewer the subject always goes; how many likes it has is already on its heart.
  const enVisor = { ...r, dato: [r.materiaNombre, r.instancia, r.autor && `de ${r.autor}`].filter(Boolean).join(', ') };
  return (
    <Tarjeta r={r} instancia={r.instancia} materia={r.materiaNombre} pie={<MeGusta r={r} gustos={gustos} />}>
      <button type="button" className="resumen__titulo" aria-haspopup="dialog" onClick={() => abrir(enVisor, true)}>{r.titulo}</button>
      {dato && <span className="resumen__dato">{dato}</span>}
      {r.partes?.length > 0 && <span className="resumen__trozo"><Partes partes={r.partes} /></span>}
    </Tarjeta>
  );
}

// What the students upload to El Santo Resumen, by subject or searched, to read here.
function Banco({ gustos, abrir }) {
  const [slug, setSlug] = useState('');
  const [filtro, setFiltro] = useState('');
  const [cuantos, setCuantos] = useState(DE_A);
  const consulta = useQuieto(filtro.trim(), 250);
  const buscando = consulta.length >= 2;
  const clave = `${slug}|${buscando ? consulta : ''}`;
  let vacio = 'El banco todavía no tiene resúmenes.';
  if (buscando) vacio = 'No hay resúmenes con esas palabras.';
  else if (slug) vacio = 'Esta materia todavía no tiene resúmenes en el banco.';
  const { datos, error, recargar } = useConsulta(
    async () => ({ clave, vacio, todas: !slug, items: buscando ? await buscarEnBanco(consulta, slug) : await cargarBanco(slug) }),
    [clave],
  );
  // While another subject or search comes, the list before stays, faded and marked busy, so the page does not jump.
  // The shape of the cards, only the first time.
  const items = datos?.items ?? null;
  const vistos = items?.slice(0, cuantos) ?? [];
  const viejos = Boolean(datos) && datos.clave !== clave;
  const [claveVista, setClaveVista] = useState(clave);
  if (claveVista !== clave) {
    setClaveVista(clave);
    setCuantos(DE_A);
  }
  // Said once the answer is there, also when it has as many as the one before.
  let cuenta = '';
  if (items && !viejos) {
    if (!items.length) cuenta = datos.vacio;
    else if (items.length > cuantos) cuenta = `Se ven ${cuantos} de ${items.length} resúmenes`;
    else cuenta = items.length === 1 ? 'Un resumen' : `${items.length} resúmenes`;
  }

  return (
    <section className="resumenes__seccion resumenes__banco" aria-labelledby="resumenes-banco">
      <h2 id="resumenes-banco" tabIndex={-1}>Banco de resúmenes</h2>
      <p className="resumenes__bajada">Los que suben los alumnos a El Santo Resumen. Se abren acá, sin salir de Super CVG.</p>
      <div className="resumenes__filtros">
        <Campo etiqueta="Materia">
          <Combo
            opciones={MATERIAS}
            valor={slug}
            onCambiar={setSlug}
            todas="Todas las materias"
            nombreLista="Materias"
            vacio="No hay materias con ese nombre."
            limpiar="Quitar la materia"
          />
        </Campo>
        <Campo etiqueta="Buscar" ayuda="En el título, las etiquetas y el texto" ayudaAlLado>
          <input className="campo__control" type="search" enterKeyHint="search" value={filtro} onChange={(e) => setFiltro(e.target.value)} autoComplete="off" />
        </Campo>
      </div>
      <p className="solo-lectores" role="status">{cuenta}</p>
      {error && (!items || viejos) ? (
        <ErrorConReintento texto={error} recargar={recargar} />
      ) : (
        <div
          className={`resumenes__resultados${viejos ? ' resumenes__resultados--viejos' : ''}`}
          aria-busy={!items || viejos ? 'true' : undefined}
        >
          {!items && <Cargando texto="Buscando en el banco" forma="tarjetas" cuantas={6} />}
          {items && !items.length && <div className="resumenes__nada"><p>{datos.vacio}</p></div>}
          {items?.length > 0 && (
            <ul className="resumenes__lista">
              {vistos.map((r) => <FilaBanco key={r.id} r={r} todas={datos.todas} gustos={gustos} abrir={abrir} />)}
            </ul>
          )}
          {items?.length > cuantos && (
            <button type="button" className="boton boton--secundario resumenes__mas" onClick={() => setCuantos((c) => c + DE_A)}>
              Ver más<span className="solo-lectores"> resúmenes del banco</span>
            </button>
          )}
        </div>
      )}
    </section>
  );
}

// In `/?demo=1` (npm run dev) it links at once with a sample account, without leaving.
function SinVincular({ alumno }) {
  const alTocar = (e) => {
    if (!esDemo(tokenActual())) return;
    e.preventDefault();
    vincularDemo(alumno);
  };
  return (
    <div className="resumenes__hueco">
      <Icono nombre="documento" tamano="grande" />
      <p>Vinculá tu cuenta de El Santo Resumen y acá ves los resúmenes que subiste y los que mandaste desde ahí. También podés darles me gusta a los del banco. No hace falta tu contraseña. Actualmente solo para ISI.</p>
      <a id="resumenes-vincular" className="boton" href={CUENTA_SANTO} target="_blank" rel="noreferrer" onClick={alTocar}>Vincular desde El Santo Resumen{otraPestana}</a>
    </div>
  );
}

// One campus student. Their link lives in this browser under their number, so the next student starts unlinked.
function DelAlumno({ alumno }) {
  const vinculo = useVinculo(alumno);
  const { confirmar, avisar } = useUI();
  // The code that came in the address, traded once (lib/resumenes.js keeps how it goes, also if the screen is left).
  const canje = useCanje();
  const [aviso, setAviso] = useState(null);
  const [lista, setLista] = useState({ llave: null, vuelta: -1, datos: null, error: '', bloqueada: false });
  const [vuelta, setVuelta] = useState(0);
  const [quitando, setQuitando] = useState(null);
  const [desvinculando, setDesvinculando] = useState(false);
  const [foco, setFoco] = useState(null);
  const [abierto, setAbierto] = useState(null);

  // The key traded on arrival waits in memory until now, when it is known whose campus account this is.
  useEffect(() => {
    if (canje.esperando) adoptarVinculo(alumno);
  }, [alumno, canje.esperando]);
  useEffect(() => olvidarResultado, []);

  // A new trade that ends replaces whatever this screen was saying.
  const [resultadoVisto, setResultadoVisto] = useState(canje.resultado);
  if (resultadoVisto !== canje.resultado) {
    setResultadoVisto(canje.resultado);
    if (canje.resultado) setAviso(null);
  }
  const { resultado } = canje;
  let avisoCanje = null;
  if (resultado?.vinculado) avisoCanje = { tipo: 'ok', texto: `Vinculado con ${resultado.vinculado}.` };
  else if (resultado?.vencido) avisoCanje = { tipo: 'error', texto: TEXTOS.vencido };
  else if (resultado?.error) avisoCanje = { tipo: 'error', texto: resultado.error };

  const llave = canje.pendiente || canje.esperando ? null : vinculo?.llave ?? null;

  // A key the service no longer knows: this browser forgets it and the page goes back to unlinked.
  const cortar = (cual) => {
    borrarVinculo(alumno, cual);
    setAviso({ tipo: 'info', texto: TEXTOS.cortado });
  };
  const gustos = useGustos(llave, cortar);
  const abrir = (r, delBanco = false) => setAbierto({ r, delBanco });

  useEffect(() => {
    if (!llave) return undefined;
    let vigente = true;
    cargarResumenes(llave).then(
      (datos) => {
        if (vigente) setLista({ llave, vuelta, datos, error: '', bloqueada: false });
      },
      (e) => {
        if (!vigente) return;
        if (e.codigo === 'llave') {
          borrarVinculo(alumno, llave);
          setAviso({ tipo: 'info', texto: TEXTOS.cortado });
          return;
        }
        const bloqueada = e.codigo === 'bloqueada';
        setLista({ llave, vuelta, datos: null, error: bloqueada ? '' : textoError(e), bloqueada });
      },
    );
    return () => {
      vigente = false;
    };
  }, [alumno, llave, vuelta]);

  useEffect(() => {
    if (!foco) return;
    (document.getElementById(foco.id) ?? document.getElementById(foco.sino))?.focus();
  }, [foco]);

  const quitar = async (r) => {
    if (quitando) return;
    const deLlave = llave;
    const ok = await confirmar({ titulo: `¿Quitar «${r.titulo}»?`, texto: 'Deja de verse acá. Sigue en el banco y lo podés volver a mandar.', boton: 'Quitar' });
    if (!ok) return;
    setQuitando(r.id);
    try {
      await quitarResumen(deLlave, r.id);
    } catch (e) {
      setQuitando(null);
      if (e.codigo === 'llave') cortar(deLlave);
      else avisar(textoError(e), 'error');
      return;
    }
    // The focus goes to the next one (or the one before), so the keyboard stays in the list.
    const enviados = lista.datos.enviados;
    const i = enviados.findIndex((x) => x.id === r.id);
    const vecino = enviados[i + 1] ?? enviados[i - 1];
    setLista((l) => (l.datos ? { ...l, datos: { ...l.datos, enviados: l.datos.enviados.filter((x) => x.id !== r.id) } } : l));
    setQuitando(null);
    setFoco({ id: vecino ? `quitar-${vecino.id}` : 'resumenes-enviados', sino: 'resumenes-vacio' });
    avisar('Lo quitaste de la lista');
  };

  const quitarVinculo = async () => {
    if (desvinculando || !vinculo) return;
    const deLlave = vinculo.llave;
    const ok = await confirmar({
      titulo: '¿Desvincular El Santo Resumen?',
      texto: 'Tus resúmenes dejan de verse acá. Siguen en El Santo Resumen y podés volver a vincularlo cuando quieras.',
      boton: 'Desvincular',
    });
    if (!ok) return;
    setDesvinculando(true);
    try {
      await desvincular(deLlave);
    } catch (e) {
      setDesvinculando(false);
      avisar(textoError(e), 'error');
      return;
    }
    borrarVinculo(alumno);
    setDesvinculando(false);
    setAviso(null);
    olvidarResultado();
    setFoco({ id: 'resumenes-vincular' });
    avisar('Desvinculaste El Santo Resumen');
  };

  // What to say goes to the live regions on top; what is left in the page is the body.
  const mostrado = aviso ?? avisoCanje;
  let error = mostrado?.tipo === 'error' ? mostrado : null;
  const informe = error ? null : mostrado;
  let cuerpo = null;
  if (canje.pendiente && canje.falla) error = { texto: canje.falla, reintentar: () => canjearPendiente().catch(() => {}) };
  else if (canje.pendiente || canje.esperando) cuerpo = <Esqueleto texto="Vinculando con El Santo Resumen" />;
  else if (!vinculo) cuerpo = <SinVincular alumno={alumno} />;
  else {
    const cargando = lista.llave !== llave || lista.vuelta !== vuelta;
    let listas = null;
    if (cargando) listas = <Esqueleto texto="Buscando tus resúmenes" />;
    else if (lista.bloqueada) error ??= { texto: TEXTOS.bloqueada };
    else if (lista.error) error ??= { texto: lista.error, reintentar: () => setVuelta((v) => v + 1) };
    else listas = <Listas datos={lista.datos} quitar={quitar} quitando={quitando} abrir={abrir} />;
    const usuario = (!cargando && lista.datos?.usuario) || vinculo.usuario;
    cuerpo = (
      <>
        <p className="resumenes__bajada">Lo que subiste al banco de El Santo Resumen y lo que mandaste desde ahí, con la cuenta <strong>{usuario}</strong>.</p>
        {listas}
      </>
    );
  }
  const desvincularAca = vinculo && !canje.pendiente && !canje.esperando;

  return (
    <>
      <Avisos aviso={informe} error={error} />
      {cuerpo}
      <Banco gustos={gustos} abrir={abrir} />
      {desvincularAca && (
        <div className="resumenes__desvincular">
          <button type="button" className="boton boton--secundario boton--chico" aria-disabled={desvinculando ? 'true' : undefined} onClick={quitarVinculo}>
            {desvinculando ? 'Desvinculando' : 'Desvincular'}
          </button>
        </div>
      )}
      {abierto && (
        <VisorResumen
          resumen={abierto.r}
          gusto={abierto.delBanco ? <MeGusta r={abierto.r} gustos={gustos} /> : null}
          onCerrar={() => setAbierto(null)}
        />
      )}
    </>
  );
}

export default function Resumenes() {
  useSeo({ titulo: tituloDe('Resúmenes'), noindex: true });
  const { datos, error, recargar } = useConsulta(cargarPerfil, [], { alInstante: true });
  const alumno = datos?.id ?? null;

  let cuerpo;
  if (alumno) cuerpo = <DelAlumno key={alumno} alumno={alumno} />;
  else if (error) cuerpo = <ErrorConReintento texto={error} recargar={recargar} />;
  else cuerpo = <Esqueleto texto="Buscando tus resúmenes" />;

  return (
    <div className="contenedor pagina resumenes">
      <h1>Resúmenes</h1>
      {cuerpo}
    </div>
  );
}
