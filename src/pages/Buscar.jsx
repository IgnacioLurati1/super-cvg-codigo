import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Campo from '../components/Campo';
import FilaEnPdf from '../components/FilaEnPdf';
import { Cargando, ErrorConReintento, esDeTipo, FilaItem, FiltroTipo, IconoDeFiltro, TIPOS } from '../components/Filas';
import Simbolo from '../components/Simbolo';
import { alumnoListo, cargarIndice, cargarMaterias } from '../lib/campus';
import { buscar, normalizar } from '../lib/datos';
import { buscarEnPdfs, cancelarLectura, cuentaDe, leerPdfs, pdfsDe, useIndicePdf } from '../lib/indicePdf';
import { partesDe } from '../lib/inscripcion';
import { estaOculto, personalizar, useMio } from '../lib/mio';
import { EN_DRIVE } from '../lib/mapasDrive';
import { tituloDe, useSeo } from '../lib/seo';
import { useConsulta } from '../lib/useConsulta';
import './panel.css';
import './buscar.css';

// The Drive folders, apart: they bring their maps only when the student goes there.
const BuscarEnDrive = lazy(() => import('../components/BuscarEnDrive'));

// What shows of each subject before «Ver todas».
const POR_MATERIA = 4;
// Words students look for. Only the ones that find something in their subjects are offered, with how many.
// Nothing under three letters: «TP» is also inside every «https» of a text.
const SUGERIDAS = ['parcial', 'final', 'guía', 'apunte', 'resumen', 'práctica', 'teoría', 'consigna', 'programa'];
const MAX_SUGERIDAS = 6;

const porFecha = (a, b) => (b.modificado ?? 0) - (a.modificado ?? 0);

/** The things found, by subject, in the order of the best one of each. */
function agrupar(items) {
  const grupos = new Map();
  for (const item of items) {
    if (!grupos.has(item.materiaId)) grupos.set(item.materiaId, { id: item.materiaId, nombre: item.materia, items: [] });
    grupos.get(item.materiaId).items.push(item);
  }
  return [...grupos.values()];
}

/** The name with the words found in it marked, or null if none is in the name (it was found by its section or text). */
function partesDelNombre(nombre, consulta) {
  const plano = normalizar(nombre);
  const palabras = normalizar(consulta).split(/\s+/).filter((p) => p && plano.includes(p));
  return palabras.length ? partesDe(nombre, palabras.join(' ')) : null;
}

const resultados = (n) => (n === 1 ? 'Un resultado' : `${n} resultados`);
const enMaterias = (n) => (n === 1 ? 'en una materia' : `en ${n} materias`);

/** How the reading of the PDFs went, once it stopped. */
function lecturaHecha({ leidos, grandes, sinLugar, fallaron, faltan }) {
  const partes = [leidos === 0 ? 'Todavía no se leyó ningún PDF.' : leidos === 1 ? 'Un PDF leído.' : `${leidos} PDF leídos.`];
  if (grandes) partes.push(grandes === 1 ? 'Uno pesa demasiado y quedó afuera.' : `${grandes} pesan demasiado y quedaron afuera.`);
  if (sinLugar) partes.push(sinLugar === 1 ? 'Uno quedó afuera para no llenar la memoria.' : `${sinLugar} quedaron afuera para no llenar la memoria.`);
  if (fallaron) partes.push(fallaron === 1 ? 'Uno no se pudo leer.' : `${fallaron} no se pudieron leer.`);
  if (faltan) partes.push(faltan === 1 ? 'Falta uno.' : `Faltan ${faltan}.`);
  return partes.join(' ');
}

export default function Buscar() {
  useSeo({ titulo: tituloDe('Buscar'), noindex: true });
  // In the state and not in the URL: the browser history keeps what's in the URL, even after leaving.
  const [consulta, setConsulta] = useState('');
  // Where it searches: the student's courses, or the Drive folders. Kept for the tab, so coming back finds it there.
  const [enDrive, ponerEnDrive] = useState(() => sessionStorage.getItem(EN_DRIVE) === '1');
  const setEnDrive = (si) => {
    ponerEnDrive(si);
    try {
      sessionStorage.setItem(EN_DRIVE, si ? '1' : '0');
    } catch {
      // Without storage it stays for this visit to the page.
    }
  };
  const [tipo, setTipo] = useState('');
  const [materia, setMateria] = useState(null);
  const [soloParcial, setSoloParcial] = useState(false);
  const [conOcultas, setConOcultas] = useState(false);
  // Only when the student turns it on: it downloads every PDF.
  const [enPdf, setEnPdf] = useState(false);
  const lectura = useIndicePdf();
  // Subjects whose things all show, after «Ver todas».
  const [abiertas, setAbiertas] = useState(() => new Set());
  const campo = useRef(null);
  const casillaPdf = useRef(null);
  // «Cancelar» or «Seguir leyendo», the last one that had the focus: when it goes, the focus goes to the checkbox.
  const botonPdf = useRef(null);
  const enfocar = useRef(null);
  const mio = useMio();

  const { datos, error, cargando, recargar } = useConsulta(async () => {
    await alumnoListo();
    const { enCurso, otras } = await cargarMaterias();
    return cargarIndice([...enCurso, ...otras]);
  });

  const base = useMemo(() => personalizar(datos ?? [], mio).filter((i) => conOcultas || !estaOculto(mio, i)), [datos, mio, conOcultas]);
  const hayConsulta = consulta.trim().length > 0;
  const pdfs = useMemo(() => pdfsDe(base), [base]);
  // With words, or with «Para el parcial» on: then the marked ones show even without words, newest first.
  const mostrando = Boolean(datos) && (hayConsulta || soloParcial);

  const vista = useMemo(() => {
    if (!mostrando) return null;
    const conParcial = soloParcial ? base.filter((i) => i.parcial) : base;
    const porNombre = hayConsulta ? buscar(conParcial, consulta, Infinity) : [...conParcial].sort(porFecha);
    // The PDFs with the words inside, after what was found by its name, in the same groups.
    const enPdfs = new Map(hayConsulta && enPdf ? buscarEnPdfs(pdfsDe(conParcial), consulta).map((h) => [h.item.id, h]) : []);
    const yaEstan = new Set(porNombre.map((i) => i.id));
    const hallados = [...porNombre, ...[...enPdfs.values()].filter((h) => !yaEstan.has(h.item.id)).map((h) => h.item)];
    const materias = agrupar(hallados.filter((i) => esDeTipo(i, tipo)));
    // A subject chosen that no longer has anything found counts as all of them.
    const elegida = materias.some((g) => g.id === materia) ? materia : null;
    const deMateria = elegida === null ? hallados : hallados.filter((i) => i.materiaId === elegida);
    const cuentasTipo = Object.fromEntries(TIPOS.map((t) => [t.valor, deMateria.filter((i) => esDeTipo(i, t.valor)).length]));
    const grupos = elegida === null ? materias : materias.filter((g) => g.id === elegida);
    return { cuentasTipo, materias, elegida, grupos, enPdfs, total: grupos.reduce((n, g) => n + g.items.length, 0) };
    // lectura.version: what was read of the PDFs changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mostrando, base, soloParcial, hayConsulta, consulta, materia, tipo, enPdf, lectura.version]);

  // How many each «Para el parcial» and each suggested word find, with what is searched now.
  const delParcial = useMemo(() => {
    if (!datos) return 0;
    const marcados = base.filter((i) => i.parcial && esDeTipo(i, tipo));
    return hayConsulta ? buscar(marcados, consulta, Infinity).length : marcados.length;
  }, [datos, base, tipo, hayConsulta, consulta]);
  const sugeridas = useMemo(
    () => (datos ? SUGERIDAS.map((p) => ({ palabra: p, cuantos: buscar(base, p, Infinity).length })).filter((s) => s.cuantos > 0).slice(0, MAX_SUGERIDAS) : []),
    [datos, base],
  );
  const hayOcultas = (datos ?? []).some((i) => estaOculto(mio, i));

  // After «Ver todas», the focus goes to the first thing that was hidden.
  useEffect(() => {
    const id = enfocar.current;
    if (!id) return;
    enfocar.current = null;
    document.querySelector(`#${id} li:nth-child(${POR_MATERIA + 1}) button`)?.focus();
  });

  // The button of the reading went away with the focus on it (the reading stopped or started again).
  useEffect(() => {
    const boton = botonPdf.current;
    if (!boton || boton.isConnected) return;
    botonPdf.current = null;
    const ahora = document.activeElement;
    if (!ahora || ahora === document.body) casillaPdf.current?.focus();
  });

  const escribir = (texto) => {
    setConsulta(texto);
    setAbiertas(new Set());
  };
  const probar = (palabra) => {
    escribir(palabra);
    campo.current?.focus();
  };
  const alternarPdf = (prender) => {
    setEnPdf(prender);
    if (prender) leerPdfs(pdfs);
    else cancelarLectura();
  };
  // Leaving the page stops the reading; what was read stays for the visit.
  useEffect(() => () => cancelarLectura(), []);

  const verTodas = (id) => {
    enfocar.current = `buscar-materia-${id}`;
    setAbiertas((a) => new Set(a).add(id));
  };

  const cuenta = enPdf && !lectura.leyendo ? cuentaDe(pdfs) : null;
  // For a screen reader, only when it starts and when it stops: the count of each PDF is only seen.
  const anuncioPdf = enPdf && lectura.leyendo ? 'Leyendo los PDF.' : cuenta ? lecturaHecha(cuenta) : '';
  const conFoco = (e) => {
    botonPdf.current = e.currentTarget;
  };

  let estado = '';
  if (vista) {
    if (vista.total === 0 && hayConsulta && enPdf && lectura.leyendo) estado = 'Todavía no hay resultados. Faltan leer algunos PDF.';
    else if (vista.total === 0) estado = hayConsulta ? 'No hay resultados. Probá con menos palabras o sacá un filtro.' : 'Todavía no marcaste nada para el parcial.';
    else estado = `${resultados(vista.total)} ${enMaterias(vista.grupos.length)}`;
  }

  return (
    <div className="contenedor pagina buscar">
      <h1>{enDrive ? 'Buscar en Drive' : 'Buscar en todas tus materias'}</h1>
      <div className="tipos buscar__donde" role="group" aria-label="Dónde buscar">
        <button type="button" className="tipos__opcion" aria-pressed={!enDrive} onClick={() => setEnDrive(false)}>
          <IconoDeFiltro nombre="libro" />Tus materias
        </button>
        <button type="button" className="tipos__opcion" aria-pressed={enDrive} onClick={() => setEnDrive(true)}>
          <IconoDeFiltro nombre="carpeta" tono="enlace" />Drive
        </button>
      </div>
      <div className="buscar__caja">
        <Campo etiqueta="Qué buscás" ayuda={enDrive ? 'En los nombres de las carpetas y los archivos.' : 'En nombres, secciones y textos. Para buscar adentro de los PDF, prendelo abajo.'} ayudaAlLado>
          <input ref={campo} className="campo__control" type="search" enterKeyHint="search" autoComplete="off" spellCheck="false" value={consulta} onChange={(e) => escribir(e.target.value)} />
        </Campo>
        <svg className="buscar__lupa" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></svg>
      </div>

      {enDrive && (
        <Suspense fallback={<Cargando texto="Abriendo Drive" />}>
          <BuscarEnDrive consulta={consulta} alVerCarpeta={() => escribir('')} />
        </Suspense>
      )}

      {!enDrive && datos && pdfs.length > 0 && (
        <div className="buscar__pdf">
          <label className="opcion">
            <input ref={casillaPdf} type="checkbox" checked={enPdf} aria-describedby="buscar-pdf-ayuda" onChange={(e) => alternarPdf(e.target.checked)} />
            Buscar también adentro de los PDF
          </label>
          <p id="buscar-pdf-ayuda" className="buscar__pdf-ayuda">Los baja del campus, así que tarda un poco.</p>
          <p className="solo-lectores" role="status">{anuncioPdf}</p>
          <div className="buscar__pdf-estado" aria-hidden="true">
            {enPdf && lectura.leyendo && (
              <>
                <span className="buscar__pdf-texto">Leyendo {lectura.actual} de {lectura.total}</span>
                <progress className="buscar__pdf-barra" max={lectura.total || 1} value={lectura.actual} />
              </>
            )}
            {cuenta && <span className="buscar__pdf-texto">{lecturaHecha(cuenta)}</span>}
          </div>
          {enPdf && lectura.leyendo && <button type="button" className="boton boton--secundario boton--chico" onFocus={conFoco} onClick={cancelarLectura}>Cancelar</button>}
          {cuenta?.faltan > 0 && <button type="button" className="boton boton--secundario boton--chico" onFocus={conFoco} onClick={() => leerPdfs(pdfs)}>Seguir leyendo</button>}
        </div>
      )}

      {!enDrive && !hayConsulta && sugeridas.length > 0 && (
        <div className="buscar__sugeridas">
          <span id="buscar-sugeridas" className="buscar__sugeridas-titulo">Probá con</span>
          <ul className="buscar__sugeridas-lista" aria-labelledby="buscar-sugeridas">
            {sugeridas.map((s) => (
              <li key={s.palabra}>
                <button type="button" className="buscar__sugerida" aria-label={`${s.palabra}, ${s.cuantos}`} onClick={() => probar(s.palabra)}>
                  {s.palabra}<span className="tipos__cuenta">{s.cuantos}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!enDrive && datos && (
        <div className="buscar__filtros">
          <div className="buscar__tira">
            <FiltroTipo valor={tipo} onCambio={setTipo} cuentas={vista?.cuentasTipo ?? null} />
            <div className="tipos" role="group" aria-label="Mostrar también">
              <button type="button" className="tipos__opcion" aria-pressed={soloParcial} aria-label={delParcial > 0 ? `Para el parcial, ${delParcial}` : undefined} onClick={() => setSoloParcial((v) => !v)}>
                <IconoDeFiltro nombre="marcador" tono="pdf" />Para el parcial{delParcial > 0 && <span className="tipos__cuenta">{delParcial}</span>}
              </button>
            </div>
          </div>
          {hayOcultas && (
            <label className="opcion">
              <input type="checkbox" checked={conOcultas} onChange={(e) => setConOcultas(e.target.checked)} />
              Incluir secciones ocultas
            </label>
          )}
        </div>
      )}

      {!enDrive && vista && vista.materias.length > 1 && (
        <div className="tipos buscar__tira buscar__materias" role="group" aria-label="Materia">
          <button type="button" className="tipos__opcion" aria-pressed={vista.elegida === null} aria-label={`Todas, ${vista.materias.reduce((n, g) => n + g.items.length, 0)}`} onClick={() => setMateria(null)}>
            Todas<span className="tipos__cuenta">{vista.materias.reduce((n, g) => n + g.items.length, 0)}</span>
          </button>
          {vista.materias.map((g) => (
            <button key={g.id} type="button" className="tipos__opcion" aria-pressed={vista.elegida === g.id} aria-label={`${g.nombre}, ${g.items.length}`} onClick={() => setMateria(g.id)}>
              <Simbolo id={g.id} nombre={g.nombre} tamano="mini" />{g.nombre}<span className="tipos__cuenta">{g.items.length}</span>
            </button>
          ))}
        </div>
      )}

      {!enDrive && error && !datos && <ErrorConReintento texto={error} recargar={recargar} />}
      {!enDrive && cargando && !datos && <Cargando texto="Preparando el buscador" />}
      {!enDrive && vista && <p className="buscar__estado" role="status">{estado}</p>}

      {!enDrive && vista?.grupos.map((g) => {
        const todas = abiertas.has(g.id) || vista.elegida !== null;
        const items = todas ? g.items : g.items.slice(0, POR_MATERIA);
        const idTitulo = `buscar-titulo-${g.id}`;
        return (
          <section key={g.id} id={`buscar-materia-${g.id}`} className="buscar__grupo" aria-labelledby={idTitulo}>
            <h2 id={idTitulo} className="buscar__materia">
              <Simbolo id={g.id} nombre={g.nombre} />
              <Link to={`/materias/${g.id}`}>{g.nombre}</Link>
              {/* With one subject the line above already says how many. */}
              {vista.grupos.length > 1 && <span className="buscar__cuantos">{resultados(g.items.length)}</span>}
            </h2>
            <ul className="lista">
              {items.map((i) => (vista.enPdfs.has(i.id)
                ? <FilaEnPdf key={i.id} hallazgo={vista.enPdfs.get(i.id)} consulta={consulta} marca={i.seccion || null} partes={partesDelNombre(i.nombre, consulta)} />
                : <FilaItem key={i.id} item={i} marca={i.seccion || null} partes={hayConsulta ? partesDelNombre(i.nombre, consulta) : null} />))}
            </ul>
            {items.length < g.items.length && (
              <button type="button" className="boton boton--secundario boton--chico buscar__mas" onClick={() => verTodas(g.id)}>
                Ver las {g.items.length}<span className="solo-lectores"> de {g.nombre}</span>
              </button>
            )}
          </section>
        );
      })}
    </div>
  );
}
