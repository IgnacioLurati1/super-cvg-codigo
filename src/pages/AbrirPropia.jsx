import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useUI } from '../components/ui';
import { cargarMaterias, cargarPerfil } from '../lib/campus';
import { peso } from '../lib/datos';
import { textoError } from '../lib/errores';
import { guardarMateria, hayMateriaEnHash, LIMITE_ZIP, leerArchivoMateria, materiaDeHash, resumenDeMateria } from '../lib/paquetePropia';
import { tituloDe, useSeo } from '../lib/seo';
import { useConsulta } from '../lib/useConsulta';
import './panel.css';
import './compartido.css';
import './propias.css';

function deHash(hash) {
  try {
    return { llegada: materiaDeHash(hash) };
  } catch (error) {
    return { error: textoError(error) };
  }
}

/** Reads without changing anything: React may call this more than once. The effect cleans the bar. */
const entradaInicial = () => (hayMateriaEnHash(window.location.hash) ? deHash(window.location.hash) : null);

// The course must not stay in the bar or in the history. Keeps history.state: it belongs to the router.
function sacarHash() {
  if (window.location.hash) window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
}

const contar = (n, uno, varios) => (n === 1 ? `1 ${uno}` : `${n} ${varios}`);

/** A button that asks for the file of a course and hands it over already checked. Shows its own errors. */
function ElegirArchivo({ alElegir, texto }) {
  const [error, setError] = useState('');
  const [leyendo, setLeyendo] = useState(false);
  const entrada = useRef(null);

  const elegir = () => {
    if (!leyendo) entrada.current.click();
  };

  const alCambiar = async (e) => {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    setError('');
    setLeyendo(true);
    try {
      alElegir(await leerArchivoMateria(archivo));
    } catch (falla) {
      setError(textoError(falla));
    }
    setLeyendo(false);
  };

  return (
    <>
      <input ref={entrada} type="file" accept=".zip,.json,application/zip,application/json" hidden aria-label={texto} onChange={alCambiar} />
      <button type="button" className="boton boton--secundario" onClick={elegir} aria-disabled={leyendo ? 'true' : undefined}>{leyendo ? 'Leyendo el archivo' : texto}</button>
      <p className="solo-lectores" role="status">{leyendo ? 'Leyendo el archivo' : ''}</p>
      {error && <div className="mensaje mensaje--error compartir__error" role="alert"><p>{error}</p></div>}
    </>
  );
}

function Revision({ llegada, alCambiar }) {
  const navegar = useNavigate();
  const { avisar } = useUI();
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [rechazada, setRechazada] = useState(false);
  const resultado = useRef(null);
  const { propia } = llegada;
  const r = resumenDeMateria(llegada);

  const { datos: suyas } = useConsulta(async () => {
    await cargarPerfil();
    const { enCurso, otras } = await cargarMaterias();
    return new Set([...enCurso, ...otras].map((m) => m.id));
  }, [], { alInstante: true });
  const ajenas = suyas ? r.materiasDelCampus.filter((m) => !suyas.has(m)).length : 0;

  useEffect(() => {
    if (rechazada) resultado.current?.focus();
  }, [rechazada]);

  const guardar = async () => {
    if (guardando) return;
    setGuardando(true);
    setError('');
    try {
      const id = await guardarMateria(llegada);
      avisar('Materia guardada');
      navegar(`/propias/${id}`, { replace: true });
    } catch (falla) {
      setError(textoError(falla));
      setGuardando(false);
    }
  };

  if (rechazada) {
    return (
      <>
        <h2 ref={resultado} tabIndex={-1} className="compartido__resultado">No se guardó nada</h2>
        <div className="compartido__botones"><Link className="boton boton--secundario" to="/materias">Ir a Materias</Link></div>
      </>
    );
  }

  const trae = [
    r.archivos && `${contar(r.archivos, 'archivo', 'archivos')} (${peso(r.peso)})`,
    r.textos && contar(r.textos, 'texto', 'textos'),
    r.enlaces && contar(r.enlaces, 'enlace', 'enlaces'),
    r.campus && contar(r.campus, 'cosa del campus', 'cosas del campus'),
  ].filter(Boolean);

  return (
    <>
      <h2>{propia.nombre}</h2>
      <p>{trae.length ? `Trae ${trae.length > 1 ? `${trae.slice(0, -1).join(', ')} y ${trae.at(-1)}` : trae[0]}.` : 'Está vacía.'}</p>
      {propia.categorias.length > 0 && (
        <section className="compartido__grupo">
          <h3>{contar(propia.categorias.length, 'categoría', 'categorías')}</h3>
          <ul className="compartido__lista">
            {propia.categorias.map((c) => <li key={c.id}><span className="compartido__nuevo">{c.nombre}</span><span className="compartido__campus">{c.bloques.length === 1 ? 'Una cosa' : c.bloques.length ? `${c.bloques.length} cosas` : 'Vacía'}</span></li>)}
          </ul>
        </section>
      )}
      <div className="mensaje compartido__aviso">
        <p>La armó otro alumno y nadie revisa sus archivos. Abrí solo los que esperás.</p>
        {llegada.faltaron > 0 && <p>{llegada.faltaron === 1 ? 'Faltaba un archivo en el ZIP y no se sumó.' : `Faltaban ${llegada.faltaron} archivos en el ZIP y no se sumaron.`}</p>}
        {ajenas > 0 && <p>Tiene cosas de {ajenas === 1 ? 'una materia en la que no estás' : `${ajenas} materias en las que no estás`}. Esas no las vas a poder abrir.</p>}
        <p>Se guarda como otra materia tuya. No toca nada de lo que ya tenés.</p>
      </div>
      {error && <div className="mensaje mensaje--error" role="alert"><p>{error}</p></div>}
      <div className="compartido__botones compartido__botones--pegados">
        <button type="button" className="boton" onClick={guardar} aria-disabled={guardando ? 'true' : undefined}>{guardando ? 'Guardando' : 'Guardar en mis materias'}</button>
        <button type="button" className="boton boton--secundario" onClick={() => setRechazada(true)}>No guardar</button>
      </div>
      <div className="compartido__botones"><ElegirArchivo alElegir={alCambiar} texto="Abrir otro archivo" /></div>
    </>
  );
}

export default function AbrirPropia() {
  useSeo({ titulo: tituloDe('Una materia que te pasaron'), noindex: true });
  const [entrada, setEntrada] = useState(entradaInicial);
  const [tanda, setTanda] = useState(0);

  const cargar = (llegada) => {
    setEntrada({ llegada });
    setTanda((t) => t + 1);
  };

  useEffect(() => {
    sacarHash();
    // Another link pasted in this same tab changes only the hash: the page doesn't load again.
    const alCambiarHash = () => {
      if (!hayMateriaEnHash(window.location.hash)) return;
      setEntrada(deHash(window.location.hash));
      setTanda((t) => t + 1);
      sacarHash();
    };
    window.addEventListener('hashchange', alCambiarHash);
    return () => window.removeEventListener('hashchange', alCambiarHash);
  }, []);

  return (
    <div className="contenedor pagina compartido">
      <p className="volver"><Link to="/materias">Materias</Link></p>
      <h1>Una materia que te pasaron</h1>
      {entrada?.llegada && <Revision key={tanda} llegada={entrada.llegada} alCambiar={cargar} />}
      {entrada?.error && (
        <>
          <div className="mensaje mensaje--error" role="alert"><p>{entrada.error}</p></div>
          <div className="compartido__botones"><ElegirArchivo alElegir={cargar} texto="Abrir un archivo" /></div>
        </>
      )}
      {!entrada && (
        <>
          <p>Si un compañero armó una materia, te la puede pasar con un link o un archivo. Antes de guardarla ves qué trae.</p>
          <p className="propias__nota">Puede ser un ZIP de hasta {Math.round(LIMITE_ZIP / (1024 * 1024))} MB o un JSON de hasta 2 MB.</p>
          <div className="compartido__botones"><ElegirArchivo alElegir={cargar} texto="Abrir el archivo" /></div>
        </>
      )}
    </div>
  );
}
