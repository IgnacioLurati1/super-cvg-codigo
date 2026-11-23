import { useEffect, useId, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import ElegirMateria, { ElegirSeccion, NUEVA, seccionInicial, useMaterias } from '../components/ElegirMateria';
import { Cargando } from '../components/Filas';
import { useAbrirPrevia } from '../components/Previa';
import { IconoDeItem } from '../components/Simbolo';
import { guardarArchivos, soltarSobrantes } from '../components/SumarCosas';
import { useUI } from '../components/ui';
import { borrarCompartido, comoTexto, LEE_CONSULTRON, leerCompartido, tomarVencido } from '../lib/compartido';
import { COMPARTIDO } from '../lib/compartidoSaneo';
import { peso, sinExtension } from '../lib/datos';
import { useMio } from '../lib/mio';
import { esAgregada, seccionesDondeSumar, sumarDondeSea } from '../lib/propias';
import { LIMITES } from '../lib/propiasSaneo';
import { tituloDe, useSeo } from '../lib/seo';
import './compartir.css';

// What another app shared with Super CVG (Android's «Compartir», the manifest's share_target): the service worker kept
// it (compartido.js) and opened this screen to ask where it goes. A section of one of the student's courses, as
// anything they add themselves (bodega.js, propias.js), or Consultron, in memory (adjuntar.js). Placed, discarded or
// sent to Consultron, it's deleted from where it waited.

const NOMBRE_NUEVA = 'Compartido';
const MB = (bytes) => `${Math.round(bytes / 1024 / 1024)} MB`;

const POR = {
  tipo: (n) => `«${n}» no es un PDF ni una foto.`,
  peso: (n) => `«${n}» pesa más de ${MB(COMPARTIDO.archivo)}.`,
  cantidad: (n) => `«${n}» quedó afuera. Van hasta ${COMPARTIDO.archivos} por vez.`,
  total: (n) => `«${n}» quedó afuera. Entre todos pasaban los ${MB(COMPARTIDO.total)}.`,
};

const hostDe = (enlace) => {
  try {
    return enlace ? new URL(enlace).host.replace(/^www\./, '') : '';
  } catch {
    return '';
  }
};

// The blocks of the link or the text that came, for a section. A link with nothing said about it goes by its site.
function bloquesDeTexto({ titulo, texto, enlace }) {
  if (enlace) {
    const dicho = (titulo || texto.split('\n').find((l) => l.trim()) || hostDe(enlace) || enlace).trim();
    return [{ tipo: 'enlace', url: enlace, titulo: dicho.slice(0, LIMITES.titulo) }];
  }
  const cuerpo = [titulo, texto].filter(Boolean).join('\n\n').slice(0, LIMITES.texto);
  return cuerpo ? [{ tipo: 'texto', texto: cuerpo }] : [];
}

function Foto({ archivo }) {
  const img = useRef(null);
  // The address lives while the photo shows.
  useEffect(() => {
    const u = URL.createObjectURL(archivo);
    if (img.current) img.current.src = u;
    return () => URL.revokeObjectURL(u);
  }, [archivo]);
  return <img ref={img} className="recibido__foto" alt="" decoding="async" />;
}

/** What came, each file opens in the preview. */
function LoQueLlego({ llegado }) {
  const abrirPrevia = useAbrirPrevia();
  const { archivos, enlace, titulo, texto } = llegado;
  const fotos = archivos.filter((a) => a.type.startsWith('image/'));
  const pdfs = archivos.filter((a) => !a.type.startsWith('image/'));
  const abrir = (archivo, i) =>
    abrirPrevia({ id: `compartido-${i}`, tipo: 'archivo', nombre: sinExtension(archivo.name), archivo: archivo.name, peso: archivo.size, mime: archivo.type, traer: async () => archivo });
  const host = hostDe(enlace);
  return (
    <div className="recibido__pila">
      {fotos.length > 0 && (
        <ul className="recibido__fotos" aria-label={fotos.length === 1 ? 'Una foto' : `${fotos.length} fotos`}>
          {fotos.map((f) => (
            <li key={f.name + archivos.indexOf(f)}>
              <button type="button" className="recibido__ver-foto" onClick={() => abrir(f, archivos.indexOf(f))} aria-label={`Ver ${f.name}`}>
                <Foto archivo={f} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {pdfs.length > 0 && (
        <ul className="recibido__lista">
          {pdfs.map((f) => (
            <li key={f.name + archivos.indexOf(f)}>
              <button type="button" className="recibido__hoja" onClick={() => abrir(f, archivos.indexOf(f))}>
                <IconoDeItem item={{ tipo: 'archivo', archivo: f.name }} />
                <span className="recibido__nombre">{sinExtension(f.name)}</span>
                <span className="recibido__dato">{peso(f.size)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {enlace && (
        <div className="recibido__hoja recibido__hoja--quieta">
          <IconoDeItem item={{ tipo: 'enlace', url: enlace }} />
          <span className="recibido__nombre">{titulo || texto.split('\n')[0] || host}</span>
          <span className="recibido__dato">{host}</span>
        </div>
      )}
      {!enlace && (titulo || texto) && (
        <blockquote className="recibido__texto">
          {titulo && <p className="recibido__titulo">{titulo}</p>}
          {texto && <p>{texto}</p>}
        </blockquote>
      )}
    </div>
  );
}

/** «Guardar en una materia»: the course and section, as in the rest of the site (ElegirMateria). */
function GuardarEnMateria({ llegado, alGuardar, alVolver }) {
  const mio = useMio();
  const propias = mio.propias.filter((p) => !esAgregada(p));
  const materias = useMaterias(propias);
  const [materia, setMateria] = useState(null);
  const [seccion, setSeccion] = useState(NUEVA);
  // { donde: 'materia' | 'seccion' | '', texto }: next to its field, or under them.
  const [error, setError] = useState({ donde: '', texto: '' });
  const [estado, setEstado] = useState('');
  const form = useRef(null);
  const secciones = seccionesDondeSumar(mio, materia);
  const sinNinguna = materias.cargadas && !materias.grupos.length;

  // The first field, once the courses are there to choose.
  useEffect(() => {
    if (materias.cargadas) form.current?.querySelector('select')?.focus();
  }, [materias.cargadas]);

  const elegirMateria = (m) => {
    setMateria(m);
    setError({ donde: '', texto: '' });
    setSeccion(seccionInicial(seccionesDondeSumar(mio, m), NOMBRE_NUEVA));
  };

  const guardar = async (e) => {
    e.preventDefault();
    if (estado || !materias.cargadas || sinNinguna) return;
    if (materia === null) {
      setError({ donde: 'materia', texto: 'Elegí una materia.' });
      form.current?.querySelector('select')?.focus();
      return;
    }
    setError({ donde: '', texto: '' });
    setEstado('Guardando');
    const { bloques: deArchivos, avisos } = llegado.archivos.length ? await guardarArchivos(llegado.archivos, (t) => setEstado(t || 'Guardando')) : { bloques: [], avisos: [] };
    const bloques = [...deArchivos, ...bloquesDeTexto(llegado)];
    const nombreSeccion = seccion === NUEVA ? NOMBRE_NUEVA : (secciones.find((c) => c.id === seccion)?.nombre ?? NOMBRE_NUEVA);
    const entraron = bloques.length ? sumarDondeSea(materia, seccion === NUEVA ? null : seccion, NOMBRE_NUEVA, bloques) : 0;
    // The files that didn't fit don't stay in the browser.
    soltarSobrantes(deArchivos.slice(entraron));
    setEstado('');
    if (!entraron) {
      // The browser said no to the files (no room), or the section is full.
      setError(avisos[0] ? { donde: '', texto: avisos[0] } : { donde: 'seccion', texto: 'No entra en esa sección. Probá con otra.' });
      return;
    }
    const faltan = entraron < bloques.length ? [`No entró todo. Una sección lleva hasta ${LIMITES.bloques} cosas.`] : [];
    alGuardar({ materia, nombre: materias.nombres.get(materia) ?? 'la materia', seccion: nombreSeccion, avisos: [...avisos, ...faltan] });
  };

  return (
    <form ref={form} className="recibido__form" onSubmit={guardar} noValidate aria-busy={estado || !materias.cargadas ? 'true' : undefined}>
      {!materias.cargadas ? (
        <Cargando texto="Trayendo tus materias" cuantas={1} />
      ) : (
        <>
          {materias.fallo && (
            <p className="mensaje recibido__aviso-campus" role="status">
              {propias.length ? 'No se pudieron traer tus materias del campus. Están las tuyas.' : 'No se pudieron traer tus materias del campus. Probá de nuevo con internet.'}
            </p>
          )}
          {!sinNinguna && <ElegirMateria valor={materia} materias={materias} alElegir={elegirMateria} ninguna="Elegí una" error={error.donde === 'materia' ? error.texto : ''} />}
          {materia !== null && <ElegirSeccion secciones={secciones} valor={seccion} nueva={NOMBRE_NUEVA} alElegir={setSeccion} error={error.donde === 'seccion' ? error.texto : ''} />}
        </>
      )}
      {error.texto && !error.donde && <p className="campo__error" role="alert">{error.texto}</p>}
      <p className="solo-lectores" role="status">{estado ? `${estado}…` : ''}</p>
      <div className="recibido__botones">
        <button type="submit" className="boton" aria-disabled={estado || !materias.cargadas || sinNinguna ? 'true' : undefined}>{estado ? `${estado}…` : 'Guardar'}</button>
        <button type="button" className="boton boton--secundario" onClick={alVolver} disabled={Boolean(estado)}>Volver</button>
      </div>
    </form>
  );
}

export default function Compartir() {
  useSeo({ titulo: tituloDe('Lo que compartiste'), noindex: true });
  const { confirmar } = useUI();
  const navigate = useNavigate();
  const [noEntro] = useState(() => new URLSearchParams(window.location.search).has('no-entro'));
  // undefined while it's read; null if nothing waits.
  const [llegado, setLlegado] = useState(undefined);
  const [vencido, setVencido] = useState(false);
  const [eligiendo, setEligiendo] = useState(false);
  const [hecho, setHecho] = useState(null);
  const [yendo, setYendo] = useState(false);
  const [falla, setFalla] = useState('');
  const titulo = useRef(null);
  const botonMateria = useRef(null);
  const idDonde = useId();

  useEffect(() => {
    let vivo = true;
    leerCompartido().then((l) => {
      if (!vivo) return;
      setVencido(!l && tomarVencido());
      setLlegado(l);
    });
    return () => {
      vivo = false;
    };
  }, []);

  const conAlgo = Boolean(llegado && (llegado.archivos.length || llegado.enlace || llegado.texto || llegado.titulo));
  // Only what was left out came: it's been said, nothing waits.
  useEffect(() => {
    if (llegado && !conAlgo) borrarCompartido();
  }, [llegado, conAlgo]);

  const terminar = (h) => {
    borrarCompartido();
    setHecho(h);
    requestAnimationFrame(() => titulo.current?.focus());
  };

  const volver = () => {
    setEligiendo(false);
    requestAnimationFrame(() => botonMateria.current?.focus());
  };

  const aConsultron = async () => {
    if (yendo) return;
    setYendo(true);
    setFalla('');
    try {
      // Consultron's reader comes only now: imported above, it would weigh on the entry of the whole site.
      const { adjuntar } = await import('../lib/consultron/adjuntar');
      adjuntar(llegado.archivos.length ? llegado.archivos : [comoTexto(llegado)]);
    } catch {
      // Without internet, that part of the site may not have come yet. What was shared stays.
      setYendo(false);
      setFalla('No se pudo abrir Consultron. Revisá la conexión y probá de nuevo.');
      return;
    }
    borrarCompartido();
    navigate('/consultron');
  };

  const descartar = async () => {
    if (!(await confirmar({ titulo: '¿Descartar lo que compartiste?', boton: 'Descartar', peligro: true }))) return;
    await borrarCompartido();
    navigate('/');
  };

  const fuera = llegado?.fuera ?? [];
  const lugarDe = (h) => (typeof h.materia === 'string' ? `/propias/${h.materia}` : `/materias/${h.materia}`);

  return (
    <div className="contenedor pagina recibido">
      <h1 ref={titulo} tabIndex={-1}>{hecho ? 'Guardado' : 'Lo que compartiste'}</h1>

      {/* Always there, so a reader says what was saved when it fills. */}
      <div className="recibido__hecho" role="status">
        {hecho && (
          <>
            <p>
              Quedó en <Link to={lugarDe(hecho)}>{hecho.nombre}</Link>, en «{hecho.seccion}».
            </p>
            {hecho.avisos.map((a, i) => <p key={i} className="recibido__aviso">{a}</p>)}
          </>
        )}
      </div>

      {llegado === undefined && <Cargando texto="Abriendo lo que compartiste" cuantas={2} />}

      {llegado === null && !hecho && (
        <div className="recibido__vacio">
          {noEntro ? (
            <p>No se pudo recibir lo que compartiste. Puede que falte lugar en el celu. Probá con menos archivos.</p>
          ) : vencido ? (
            <p>Lo que compartiste se borró. Pasó media hora.</p>
          ) : (
            <p>Acá no hay nada para guardar. Desde otra app, tocá Compartir y elegí Super CVG con un PDF, una foto o un link.</p>
          )}
          <p><Link to="/">Ir al inicio</Link></p>
        </div>
      )}

      {llegado && !hecho && (
        <>
          {conAlgo && <p className="recibido__bajada">Se borra solo en media hora si no lo guardás.</p>}
          {conAlgo && <LoQueLlego llegado={llegado} />}

          {fuera.length > 0 && (
            <div className="mensaje recibido__fuera">
              <p><strong>{conAlgo ? 'No entró todo' : 'No entró nada'}</strong></p>
              <ul>
                {fuera.map((f, i) => <li key={i}>{POR[f.por](f.nombre)}</li>)}
              </ul>
              {!conAlgo && <p>Van PDF y fotos, de hasta {MB(COMPARTIDO.archivo)} cada uno.</p>}
            </div>
          )}
          {!conAlgo && <p><Link to="/">Ir al inicio</Link></p>}

          {conAlgo && (
            <section className="recibido__donde" aria-labelledby={idDonde}>
              <h2 id={idDonde}>¿Dónde va?</h2>
              {eligiendo ? (
                <GuardarEnMateria llegado={llegado} alGuardar={terminar} alVolver={volver} />
              ) : (
                <>
                  <div className="recibido__opciones">
                    <button ref={botonMateria} type="button" className="recibido__opcion" onClick={() => !yendo && setEligiendo(true)} aria-disabled={yendo ? 'true' : undefined}>
                      <span className="recibido__opcion-titulo">Guardar en una materia</span>
                      <span className="recibido__opcion-texto">Queda en una sección tuya.</span>
                    </button>
                    <button type="button" className="recibido__opcion" onClick={aConsultron} aria-disabled={yendo ? 'true' : undefined}>
                      <span className="recibido__opcion-titulo">{yendo ? 'Abriendo Consultron…' : 'Preguntarle a Consultron'}</span>
                      <span className="recibido__opcion-texto">
                        {llegado.archivos.length > LEE_CONSULTRON ? `Lee hasta ${LEE_CONSULTRON} por pregunta.` : 'Lo lee y le preguntás.'}
                      </span>
                    </button>
                  </div>
                  {falla && <p className="campo__error" role="alert">{falla}</p>}
                  <button type="button" className="boton boton--secundario boton--chico recibido__descartar" onClick={descartar}>Descartar</button>
                </>
              )}
            </section>
          )}
        </>
      )}

      {hecho && <p><Link className="boton boton--secundario" to="/">Ir al inicio</Link></p>}
    </div>
  );
}
