import { memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ErrorConReintento } from '../Filas';
import { useAbrirPrevia } from '../Previa';
import { useUI } from '../ui';
import VisorResumen from '../VisorResumen';
import { IconoMenu } from '../../layouts/Menu';
import { dejarDatos, dejarEjemplo } from '../../lib/calculadoras/memoria';
import { cargarIndice, cargarMaterias } from '../../lib/campus';
import { docsDeCharla, documentoDeTexto, ejercicioDe, enviar, piezasPropias, preguntaPorDefecto, previaDe, useAdjuntos } from '../../lib/consultron/adjuntar';
import { calculoDelEjercicio, elegirCalculo, esquemaDe, leerDatos, pedidoDeDatos } from '../../lib/consultron/calculos';
import { ejemploPara } from '../../lib/consultron/ejemplos';
import { esCharla, palabras, plegar } from '../../lib/consultron/fragmentos';
import { buscarPiezas, delSanto } from '../../lib/consultron/fuentes';
import { deCursada, esDeCursada } from '../../lib/consultron/cursada';
import { deLaCarrera, esDeCarrera, materiasDeLaCarrera } from '../../lib/consultron/deLaCarrera';
import { cargarUnidos, docsDeClassroom } from '../../lib/consultron/delClassroom';
import { TODAS, dePropias, dondeBusca, esFoto, lectorDe, notasDeMaterias, valorDePropia } from '../../lib/consultron/donde';
import { pantallaAhora, pideAlgoNuevo, senalaLaPantalla } from '../../lib/consultron/pantalla';
import { delSitio } from '../../lib/consultron/sitio';
import { alTerminar, empezar, frenar, limpiar, mostrarCalculo, mostrarEjemplo, mostrarSoloEjemplo, noPudoLeer, pedirDatos, respondiendo, responder, sePuedePreguntar, sinTextoAbierto, sugerir, useConsultron } from '../../lib/consultron/motor';
import { usePermisosNube } from '../../lib/consultron/nube';
import { OfertaNube } from './Modelo';
import { aclara, armarCharla, citasDe, leerRespuesta, objeta, pideOtraVez, preguntaAclarada, preguntaObjetada, preguntaOtraVez, sinPensar } from '../../lib/consultron/pedido';
import { textoError } from '../../lib/errores';
import { adivinarLenguaje, pareceCodigo } from '../../lib/laboratorio/adivinar';
import { esLenguaje } from '../../lib/laboratorio/lenguajes';
import { modulosQueFaltan } from '../../lib/laboratorio/modulos';
import { borradorEscrito, llevarAlLaboratorio } from '../../lib/laboratorio/pendiente';
import { cancelarLectura, cuentaDe, leerPdfs, pdfsDe, textosDe, useIndicePdf } from '../../lib/indicePdf';
import { estaOculto, personalizar, useMio } from '../../lib/mio';
import { usePropias } from '../../lib/propias';
import { useConsulta } from '../../lib/useConsulta';
import Formula from './Formula';
import { Dictar, Escuchar } from './Voz';
import { AdjuntosCaja, AdjuntosPregunta, BotonAdjuntar, Marcado, ProblemasAdjuntos, alPegar, textoDeAdjuntos, useSoltar } from './Adjuntos';
import Charlas from './Charlas';
import { ArmarPractica, EntradaPractica, practicar } from './Practica';
import { pidePractica } from '../../lib/consultron/practica';

// The talk with Consultron, the same in the big screen and in the corner: where it looks, the questions and their
// answers, and the box to write. The questions of the visit are one (motor.js), whichever view shows them.

export { TODAS };
// Where it looks: the notes (the campus PDFs, what the student added on their own and their Classroom) and El Santo
// Resumen, or only the summaries, or only the PDFs. Asked in the question too («según
// los resúmenes», «solo en los PDF del campus»).
const ORIGENES = [
  ['todo', 'Apuntes y resúmenes'],
  ['santo', 'Solo resúmenes'],
  ['campus', 'Solo PDF'],
];
const PIDE_SANTO = /\b(solo|unicamente|segun|en|de|del|con)\s+(los |el |mis )?(resumenes|santo resumen)\b/;
const PIDE_CAMPUS = /\bsolo\s+(en |de |con )?(los |mis )?(pdf|apuntes del campus|archivos del campus)\b/;
// A joke, a poem, a riddle: nothing to look for in the notes. It answers with what it knows, playing along.
const PIDE_HUMOR = /\b(chistes?|bromas?|adivinanzas?|poemas?|poesias?|rimas?|cancion(es)?|chamuyo|meme)\b/;
export const pideHumor = (pregunta) => PIDE_HUMOR.test(plegar(pregunta));

export function origenDe(pregunta, elegido) {
  const p = plegar(pregunta);
  if (PIDE_SANTO.test(p)) return 'santo';
  if (PIDE_CAMPUS.test(p)) return 'campus';
  return elegido;
}
/** What it asks about something marked in a PDF, ready to change. */
export const PREGUNTA_MARCADO = 'Explicame esto';
const otraPestana = <span className="solo-lectores">, se abre en otra pestaña</span>;
const suave = () => (window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');

/** Consultron's face, next to what it says. */
export const Robot = ({ grande = false }) => (
  <span className={grande ? 'consultron__robot consultron__robot--grande' : 'consultron__robot'} aria-hidden="true">
    <IconoMenu nombre="consultron" />
  </span>
);

const SIN_MATERIAS = [];

/** Where it looks (donde.js): a course of the campus or of the student's own, or all the ones in progress, with their
 * PDFs, and what the student added: pictures to read (`fotos`) and texts ready to search (`notas`). `nombradas`: the
 * courses by name, for El Santo Resumen. */
function useApuntes(materia) {
  const mio = useMio();
  const materias = useConsulta(() => cargarMaterias(), []);
  const donde = useMemo(() => (materias.datos ? dondeBusca(materia, materias.datos, mio) : null), [materias.datos, materia, mio]);
  const suya = Boolean(donde?.suya);
  // The campus courses change only with the choice: a mark of the student doesn't ask the campus again.
  const elegidas = useMemo(() => {
    if (!materias.datos) return null;
    return suya ? SIN_MATERIAS : dondeBusca(materia, materias.datos).materias;
  }, [materias.datos, materia, suya]);
  const contenido = useConsulta(() => (elegidas ? (elegidas.length ? cargarIndice(elegidas) : Promise.resolve([])) : Promise.resolve(null)), [elegidas]);
  const suyos = useMemo(() => {
    if (!donde || !materias.datos) return { archivos: [], notas: [] };
    const nombres = Object.fromEntries([...materias.datos.enCurso, ...materias.datos.otras].map((m) => [m.id, m.nombre]));
    const { archivos, notas } = dePropias(donde.propias, { nombres });
    return { archivos, notas: [...notas, ...notasDeMaterias(donde.materias, mio)] };
  }, [donde, materias.datos, mio]);
  const pdfs = useMemo(() => pdfsDe([...personalizar(contenido.datos ?? [], mio).filter((i) => !estaOculto(mio, i)), ...suyos.archivos]), [contenido.datos, mio, suyos]);
  const fotos = useMemo(() => suyos.archivos.filter(esFoto), [suyos]);
  const nombradas = useMemo(() => [...(elegidas ?? []), ...(donde?.propias ?? []).filter((p) => p.nombre && (p.de === null || p.de === undefined))], [elegidas, donde]);
  return { materias, elegidas, contenido, pdfs, fotos, notas: suyos.notas, donde, nombradas };
}

// What a source is, under its name: the course and page of a PDF, or where in El Santo Resumen.
function datoDe(t) {
  if (t.fuente.tipo === 'resumen') return `Banco de El Santo Resumen, ${t.fuente.materia}`;
  if (t.fuente.tipo === 'oficial') return `El Santo Resumen, ${t.fuente.materia}`;
  if (t.fuente.tipo === 'calculadora') return 'Calculadora de Super CVG';
  if (t.fuente.tipo === 'guia') return 'Super CVG';
  if (t.fuente.tipo === 'pantalla') return 'En tu pantalla';
  if (t.fuente.tipo === 'mesa') return 'En la mesa';
  if (t.fuente.tipo === 'classroom') return `${{ Tarea: 'Tarea', Material: 'Material', Mensaje: 'Mensaje' }[t.fuente.clase] ?? 'Publicación'} de Classroom${t.fuente.materia ? `, ${t.fuente.materia}` : ''}`;
  if (t.fuente.tipo === 'propia') {
    if (t.fuente.clase === 'nota') return t.fuente.materia || 'Tus notas';
    return `${t.fuente.clase === 'foto' ? 'Foto tuya' : 'Texto tuyo'}${t.fuente.materia ? `, ${t.fuente.materia}` : ''}`;
  }
  if (t.fuente.tipo === 'adjunto') return { foto: 'Foto que adjuntaste', pdf: `PDF que adjuntaste, página ${t.pagina}` }[t.fuente.clase] ?? 'Archivo que adjuntaste';
  if (t.marcado) return `Lo que marcaste, página ${t.pagina}`;
  return t.fuente.materia ? `${t.fuente.materia}, página ${t.pagina}` : `Página ${t.pagina}`;
}

// A text file attached opens nothing: the student has it. Nor a source of a saved talk (charlas.js), which keeps only
// its name: but a page of El Santo Resumen, by its link.
// A page of El Santo Resumen or a post of Classroom opens in another tab, by its link.
const afuera = (f) => (f.tipo === 'oficial' || f.tipo === 'classroom') && Boolean(f.url);
const sinAbrir = (f) =>
  f.tipo === 'marcado' || (f.tipo === 'resumen' && f.abierta) || f.tipo === 'calculadora' || f.tipo === 'guia' || f.tipo === 'pantalla' || f.tipo === 'mesa' || (f.tipo === 'adjunto' && f.clase === 'texto') ||
  (f.tipo === 'classroom' && !f.url) || (f.tipo === 'propia' && !f.item) || (f.guardada && !afuera(f));

// How an answer may name a language the lab runs.
const ALIAS = { py: 'python', python3: 'python', sqlite: 'sql', postgresql: 'sql', postgres: 'sql', mysql: 'sql', plpgsql: 'sql', h: 'c', js: 'javascript', node: 'javascript', mjs: 'javascript' };

// A formula the model put in a block (P(X = x) = e^(-λ)·λ^x / x!): one line with Greek letters or math signs and no
// code. It isn't for the lab.
const esFormula = (texto) => {
  const lineas = texto.split('\n').filter((l) => l.trim());
  return lineas.length === 1 && /[Ͱ-Ͽ√∑∫≤≥≠·]|\w!(?!=)/u.test(lineas[0]) && !pareceCodigo(lineas[0]);
};

/** A block of code in an answer. Once it's written, if the lab runs its language, it goes there to try it. */

function Codigo({ bloque, listo, alIr }) {
  const navigate = useNavigate();
  const { confirmar } = useUI();
  const dicho = ALIAS[bloque.lenguaje] ?? bloque.lenguaje;
  const lenguaje = dicho ? dicho : adivinarLenguaje(bloque.texto).lenguaje;
  // What the lab can't import (modulos.js): with pandas the program fails at its first line.
  const faltan = lenguaje === 'python' ? modulosQueFaltan(bloque.texto) : [];
  const probar = async () => {
    if (borradorEscrito() && !(await confirmar({ titulo: '¿Reemplazar tu borrador?', texto: 'En el Laboratorio tenés código sin guardar. Se cambia por este.', boton: 'Reemplazar', peligro: true }))) return;
    llevarAlLaboratorio({ codigo: bloque.texto, lenguaje, apunte: 'Consultron' });
    alIr?.();
    navigate('/laboratorio');
  };
  return (
    <div className="consultron__codigo">
      <pre tabIndex={0} role="region" aria-label="Código">
        <code>{bloque.texto}</code>
      </pre>
      {listo && esLenguaje(lenguaje) && bloque.texto.trim() && !esFormula(bloque.texto) && (faltan.length ? (
        <p className="consultron__nota">El Laboratorio no trae {faltan.join(', ')}.</p>
      ) : (
        <button type="button" className="boton boton--secundario boton--chico" onClick={probar}>
          Probar en el Laboratorio
        </button>
      ))}
    </div>
  );
}

// What it says while it looks, one after another: a student's desk, not a progress bar.
const BUSCANDO = [
  'Revolviendo tus apuntes…',
  'Hojeando tus PDF…',
  'Subrayando lo que importa…',
  'Desempolvando la carpeta…',
  'Buscando con el resaltador en la mano…',
  'Repasando las fotocopias…',
  'Atando cabos…',
];
const EN_GENERAL = ['No está en tus apuntes. Haciendo memoria…', 'No está en tus apuntes. Repasando lo que sé…', 'No está en tus apuntes. Atando cabos…'];
// Beside a summary of El Santo Resumen, which is all it looks in.
const LEYENDO_RESUMEN = ['Leyendo el resumen…', 'Buscando en el resumen…', 'Subrayando lo que importa…', 'Atando cabos…'];
const FUERA_DEL_RESUMEN = ['No está en este resumen. Haciendo memoria…', 'No está en este resumen. Repasando lo que sé…', 'No está en este resumen. Atando cabos…'];
// In a live session, where it reads only the table.
const LEYENDO_MESA = ['Mirando la mesa…', 'Hojeando las pestañas…', 'Subrayando lo que importa…', 'Atando cabos…'];
const CAMBIA_MS = 2400;
/** How long an end of the list that the answer already left behind still counts as the end, for a scroll on its way. */
const RECIENTE_MS = 1000;

function Pensando({ frases }) {
  const [i, setI] = useState(() => Math.floor(Math.random() * frases.length));
  useEffect(() => {
    const reloj = setInterval(() => setI((n) => (n + 1) % frases.length), CAMBIA_MS);
    return () => clearInterval(reloj);
  }, [frases]);
  return (
    <p className="consultron__pensando">
      <span key={i} className="consultron__frase">{frases[i % frases.length]}</span>
    </p>
  );
}

/** An answer, with the pieces it names as links to where they come from: the page of a PDF, a summary of the bank or
 * a page of El Santo Resumen. */
function Respuesta({ entrada, abrirResumen, nivel, alIr, sinSalir = false }) {
  const abrir = useAbrirPrevia();
  const Titulo = `h${nivel + 1}`;
  const cuantas = entrada.elegidos.length;
  const bloques = useMemo(() => leerRespuesta(entrada.texto, cuantas), [entrada.texto, cuantas]);
  const citadas = useMemo(() => (entrada.estado === 'listo' || entrada.estado === 'frenado' ? citasDe(entrada.texto, cuantas) : []), [entrada.texto, entrada.estado, cuantas]);
  const fuente = (n) => entrada.elegidos[n - 1]?.trozo;
  // A PDF opens at the page, with the piece marked on it (VisorPdf.jsx, `inicio.fragmento`).
  const ir = (n) => {
    const t = fuente(n);
    if (t?.fuente.tipo === 'pdf') abrir({ ...t.fuente.item, abrirEn: { pagina: t.pagina, fragmento: t.texto } });
    else if (t?.fuente.tipo === 'resumen') abrirResumen(t.fuente.resumen);
    // A picture of a course of the student's own, from this browser.
    else if (t?.fuente.tipo === 'propia' && t.fuente.item) abrir(t.fuente.item);
    // What the student attached: the photo, or the PDF at its page, from memory.
    else if (t?.fuente.tipo === 'adjunto') abrir(t.fuente.clase === 'pdf' ? { ...previaDe(t.fuente, t.pagina), abrirEn: { pagina: t.pagina, fragmento: t.texto } } : previaDe(t.fuente, t.pagina));
  };
  const cita = (n, key) => {
    const t = fuente(n);
    if (!t) return null;
    // A screen or a calculator of Super CVG, or a text of the student's: its link, if it has one. A text file
    // attached: nothing.
    if (t.fuente.a && !afuera(t.fuente)) {
      return (
        <Link key={key} className="consultron__cita" to={t.fuente.a} onClick={alIr} aria-label={`Fuente ${n}, ${t.fuente.nombre}`}>
          {n}
        </Link>
      );
    }
    if (sinAbrir(t.fuente)) return <span key={key} className="consultron__cita" role="note" aria-label={`Fuente ${n}, ${t.fuente.nombre}`}>{n}</span>;
    if (afuera(t.fuente)) {
      return (
        <a key={key} className="consultron__cita" href={t.fuente.url} target="_blank" rel="noopener noreferrer" aria-label={`Fuente ${n}, ${t.fuente.nombre}, se abre en otra pestaña`}>
          {n}
        </a>
      );
    }
    const nombre = t.fuente.tipo === 'pdf' || t.fuente.clase === 'pdf' ? `${t.fuente.nombre}, página ${t.pagina}` : t.fuente.nombre;
    return (
      <button key={key} type="button" className="consultron__cita" aria-haspopup="dialog" aria-label={`Fuente ${n}, ${nombre}`} onClick={() => ir(n)}>
        {n}
      </button>
    );
  };
  const linea = (partes) => partes.map((p, i) => (p.cita ? cita(p.cita, i) : p.formula !== undefined ? <Formula key={i} latex={p.formula} bloque={p.bloque} /> : p.fuerte ? <strong key={i}>{p.texto}</strong> : p.codigo ? <code key={i}>{p.texto}</code> : <span key={i}>{p.texto}</span>));
  // The same page named twice is one source. A photo or a text file attached is one, whatever its piece.
  const fuentes = [];
  const uno = (t) => t.fuente.tipo === 'adjunto' && t.fuente.clase !== 'pdf';
  for (const n of citadas) {
    const t = fuente(n);
    if (!fuentes.some((f) => f.t.doc === t.doc && (f.t.pagina === t.pagina || uno(t)))) fuentes.push({ n, t });
  }

  return (
    <>
      {entrada.general === true && !['leyendo', 'no-esta'].includes(entrada.estado) && <p className="consultron__nota consultron__nota--general">{{ archivo: 'No está en este archivo.', mesa: 'No está en la mesa.' }[entrada.enResumen] ?? (entrada.enResumen ? 'No está en este resumen.' : 'No está en tus apuntes.')} Esto es lo que sé en general, revisalo.</p>}
      <div className="consultron__texto" aria-busy={entrada.estado === 'leyendo' || entrada.estado === 'escribiendo'}>
        {entrada.estado === 'leyendo' && <Pensando frases={entrada.enResumen === 'mesa' ? LEYENDO_MESA : entrada.enResumen ? (entrada.general ? FUERA_DEL_RESUMEN : LEYENDO_RESUMEN) : entrada.general ? EN_GENERAL : BUSCANDO} />}
        {bloques.map((b, i) => {
          if (b.tipo === 'codigo') return <Codigo key={i} bloque={b} listo={entrada.estado === 'listo' && !sinSalir} alIr={alIr} />;
          if (b.tipo === 'lista') {
            const Lista = b.numerada ? 'ol' : 'ul';
            return <Lista key={i} start={b.numerada && b.inicio > 1 ? b.inicio : undefined}>{b.items.map((partes, j) => <li key={j}>{linea(partes)}</li>)}</Lista>;
          }
          // A formula on its own line is drawn as a block: a paragraph can't hold it.
          const Parrafo = b.partes.some((p) => p.bloque) ? 'div' : 'p';
          return <Parrafo key={i}>{linea(b.partes)}</Parrafo>;
        })}
      </div>
      {entrada.estado === 'no-esta' && entrada.donde && <p className="consultron__nota">{entrada.donde}</p>}
      {entrada.estado === 'frenado' && <p className="consultron__nota">La frenaste.</p>}
      {entrada.estado === 'falla' && <p className="consultron__nota consultron__nota--error">Consultron se trabó con esta pregunta. Probá de nuevo.</p>}
      {entrada.contesto && entrada.estado === 'listo' && <p className="consultron__nota">{entrada.contesto}</p>}
      {entrada.nube && ['listo', 'no-esta'].includes(entrada.estado) && <p className="consultron__nota">Contestó Gemini, de Google.</p>}
      {entrada.nubeFallo && !entrada.nube && ['listo', 'no-esta'].includes(entrada.estado) && <p className="consultron__nota">{entrada.nubeTope ? 'Por hoy no te quedan preguntas con Gemini.' : 'Gemini tardó demasiado.'} Contestó Consultron en tu compu.</p>}
      {fuentes.length > 0 && (
        <div className="consultron__fuentes">
          <Titulo>De dónde sale</Titulo>
          <ul>
            {fuentes.map(({ n, t }) => {
              const adentro = (
                <>
                  <span className="consultron__fuente-numero" aria-hidden="true">{n}</span>
                  <span className="consultron__fuente-texto">
                    <span className="consultron__fuente-nombre">{t.fuente.nombre}</span>
                    <span className="consultron__fuente-dato">{datoDe(t)}</span>
                  </span>
                </>
              );
              return (
                <li key={n}>
                  {afuera(t.fuente) ? (
                    <a className="consultron__fuente" href={t.fuente.url} target="_blank" rel="noopener noreferrer">
                      {adentro}
                      {otraPestana}
                    </a>
                  ) : t.fuente.a ? (
                    <Link className="consultron__fuente" to={t.fuente.a} onClick={alIr}>
                      {adentro}
                    </Link>
                  ) : sinAbrir(t.fuente) ? (
                    <div className="consultron__fuente">{adentro}</div>
                  ) : (
                    <button type="button" className="consultron__fuente" aria-haspopup="dialog" onClick={() => ir(n)}>
                      {adentro}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
}

/** Copies an answer as text, without its source numbers. Says so on the button for a moment. */
function Copiar({ texto }) {
  const [hecho, setHecho] = useState(null);
  useEffect(() => {
    if (!hecho) return undefined;
    const t = setTimeout(() => setHecho(null), 2000);
    return () => clearTimeout(t);
  }, [hecho]);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(sinPensar(texto).replace(/\s*\[\d+\]/g, '').trim());
      setHecho('si');
    } catch {
      setHecho('no');
    }
  };
  return (
    <>
      <button type="button" className="consultron__copiar" onClick={copiar}>
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          {hecho === 'si' ? <path d="M5 12.5l4.5 4.5L19 7.5" /> : <path d="M9 9h10v11H9zM5 15V4h10" />}
        </svg>
        {hecho === 'si' ? 'Copiada' : hecho === 'no' ? 'No se pudo copiar' : 'Copiar'}
      </button>
      <span className="solo-lectores" role="status">{hecho === 'si' ? 'Respuesta copiada.' : hecho === 'no' ? 'No se pudo copiar.' : ''}</span>
    </>
  );
}

/** The answer is a calculator: the data it took from the question, to check, and the calculator with them. */
function Calculo({ calculo, alIr }) {
  const navigate = useNavigate();
  const abrir = () => {
    dejarDatos(calculo.clave ?? `calc:${calculo.slug}`, calculo.datos);
    alIr?.();
    navigate(`/calculadoras/${calculo.slug}`);
  };
  return (
    <div className="consultron__calculo">
      <p>Va con la calculadora de <strong>{calculo.nombre}</strong>. Revisá los datos que saqué del ejercicio.</p>
      <dl className="consultron__datos">
        {calculo.filas.map(([titulo, valor]) => (
          <div key={titulo}>
            <dt>{titulo}</dt>
            <dd>{valor}</dd>
          </div>
        ))}
      </dl>
      <button type="button" className="boton boton--chico" onClick={abrir}>Abrir con estos datos</button>
    </div>
  );
}

/** Under an answer about a calculator's topic, one of its own examples (ejemplos.js). */
function Ejemplo({ ejemplo, alIr }) {
  const navigate = useNavigate();
  const abrir = () => {
    // With one list per model, it opens in the example's.
    if (ejemplo.modo) dejarDatos(ejemplo.clave ?? `calc:${ejemplo.slug}`, { modelo: ejemplo.modo });
    dejarEjemplo(ejemplo.ejemplo);
    alIr?.();
    navigate(`/calculadoras/${ejemplo.slug}`);
  };
  return (
    <div className="consultron__calculo">
      <p>Probalo en la calculadora de <strong>{ejemplo.nombre}</strong> con su ejemplo «{ejemplo.ejemplo}».</p>
      <button type="button" className="boton boton--chico boton--secundario" onClick={abrir}>Abrir con este ejemplo</button>
    </div>
  );
}

/** What to ask, when nothing was asked yet: each shows something Consultron does. On a calculator, about it. */
function ideasPara(pagina) {
  const ideas = ['¿Qué podés hacer?', 'Calculá las subredes de 192.168.0.0/24 para 4 áreas', 'Escribime una consulta SQL que cuente alumnos por carrera'];
  if (/^\/calculadoras\/[^/]+/.test(pagina ?? '')) return ['¿Cómo uso esta calculadora?', ...ideas.slice(1)];
  if (pagina && pagina !== '/consultron') return ['¿Qué es esta página?', ...ideas.slice(1)];
  return ideas;
}

/** After the answer, one of the calculator's own examples for its topic. Without it, the answer stays as it is. */
async function armarEjemplo(id, calculo, pregunta) {
  try {
    const [entrada, ejemplo] = await Promise.all([alTerminar(id), ejemploPara(calculo, pregunta)]);
    if (entrada?.estado === 'listo' && ejemplo) mostrarEjemplo(id, ejemplo);
  } catch {
    // The answer stays without its example.
  }
}

/** A question with its answer. Remembered: while an answer is written, word by word, only its own entry is drawn again.
 * Drawn whole with every word, a long talk left the screen stuck. `refUltima`: where the last one is kept, to follow it.
 * In a live session's thread (enVivo/herramientas/Consultron.jsx): `autor` ({ nombre, color }), someone else who asked
 * it, named over the question in their color; `aviso`, what is said instead of the answer; `sinSalir`, nothing in the
 * answer leads to another screen (the session would be left). */
export const Entrada = memo(function Entrada({ entrada, ultima, refUltima, nivel, abrirResumen, alIr, ocupado, autor = null, aviso = null, sinSalir = false }) {
  const Pregunta = `h${nivel}`;
  return (
    <article ref={ultima ? refUltima : null} className="consultron__entrada" data-estado={entrada.estado}>
      {autor && <p className="consultron__autor">{autor.nombre}</p>}
      <Pregunta className="consultron__pregunta" data-autor={autor ? '' : undefined} style={autor?.color ? { '--color': autor.color } : undefined}>{entrada.pregunta}</Pregunta>
      {entrada.adjuntos?.length > 0 && <AdjuntosPregunta adjuntos={entrada.adjuntos} />}
      <div className="consultron__respuesta">
        <Robot />
        <div className="consultron__cuerpo">
          {aviso ? (
            <p className="consultron__nota">{aviso}</p>
          ) : entrada.practica ? (
            <EntradaPractica entrada={entrada} ultima={ultima} nivel={nivel} abrirResumen={abrirResumen} ocupado={ocupado} />
          ) : entrada.estado === 'calculo' ? <Calculo calculo={entrada.calculo} alIr={alIr} /> : <Respuesta entrada={entrada} abrirResumen={abrirResumen} nivel={nivel} alIr={alIr} sinSalir={sinSalir} />}
          {entrada.ejemplo ? (
            <Ejemplo ejemplo={entrada.ejemplo} alIr={alIr} />
          ) : entrada.sugerida && entrada.estado !== 'leyendo' && (
            <p className="consultron__sugerida">
              <Link to={`/calculadoras/${entrada.sugerida.slug}`} onClick={alIr}>Probalo en la calculadora de {entrada.sugerida.nombre}</Link>
            </p>
          )}
          {entrada.estado === 'listo' && entrada.texto && (
            <div className="consultron__acciones">
              <Copiar texto={entrada.texto} />
              <Escuchar texto={entrada.texto} />
            </div>
          )}
        </div>
      </div>
    </article>
  );
});

/**
 * How a list of questions follows the answer being written, in the corner, beside a reader and in a live session's
 * Consultron (enVivo/herramientas/Consultron.jsx). `activo`: only then. `cambio`: changes when the last answer grows.
 * Returns { lista, ultima } (the refs of the list and of its last entry), `alPreguntar()` (on asking: it follows the
 * new question) and the `props` of the list.
 */
export function useSigue(activo, cambio) {
  const lista = useRef(null);
  const ultima = useRef(null);
  // How the corner follows the answer being written. 'pregunta': down to where its question reaches the top, and there
  // it stays, to read from the start. 'fondo': the student went to the end, and it stays at the end. null: the student
  // moved the list, and it's theirs until the next question. `puesto`: where this put it, to tell its moves from theirs.
  const seguir = useRef('pregunta');
  const puesto = useRef(0);
  // Where the end of the list was in the last second, as the answer grew: [when, where].
  const finales = useRef([]);
  // Before painting: the list never shows a moment behind the answer it follows.
  useLayoutEffect(() => {
    const l = lista.current;
    if (!activo || !l) return;
    const fondo = l.scrollHeight - l.clientHeight;
    const ahora = performance.now();
    finales.current = [...finales.current.filter(([cuando]) => ahora - cuando < RECIENTE_MS), [ahora, fondo]].slice(-24);
    if (!seguir.current) return;
    const tope = ultima.current ? l.scrollTop + ultima.current.getBoundingClientRect().top - l.getBoundingClientRect().top - 12 : fondo;
    const destino = seguir.current === 'fondo' ? fondo : Math.min(fondo, tope);
    // Only down: it never takes the student back up to what they already passed.
    if (destino <= l.scrollTop + 1) return;
    l.scrollTop = destino;
    puesto.current = l.scrollTop;
  }, [activo, cambio]);
  const alFondo = (l) => l.scrollHeight - l.scrollTop - l.clientHeight < 8;
  // A move of the list that isn't this one's is the student's (the wheel, the bar, the keys): at the end it stays at
  // the end, anywhere else it stays where they left it.
  const alMover = () => {
    const l = lista.current;
    if (Math.abs(l.scrollTop - puesto.current) <= 2) return;
    // The browser takes the list down to the end it knew, and the answer grew meanwhile: that end is the end too.
    const ahora = performance.now();
    const aUnFinal = l.scrollTop > puesto.current && finales.current.some(([cuando, fin]) => ahora - cuando < RECIENTE_MS && Math.abs(l.scrollTop - fin) < 8);
    const llego = alFondo(l) || aUnFinal;
    if (llego) l.scrollTop = l.scrollHeight - l.clientHeight;
    puesto.current = l.scrollTop;
    seguir.current = llego ? 'fondo' : null;
  };
  // Before the list moves: the answer being written doesn't pull against the wheel, a finger, a key or the bar.
  const tomarScroll = (e) => {
    const baja = e.type === 'wheel' && e.deltaY > 0;
    seguir.current = baja && alFondo(lista.current) ? 'fondo' : null;
  };
  const TECLAS_DE_MOVER = ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '];
  const alTeclearLista = (e) => {
    if (TECLAS_DE_MOVER.includes(e.key) && !e.target.closest('textarea, input, select')) seguir.current = null;
  };
  // The scroll bar is the list itself; a click on what is inside doesn't move it.
  const alApretarLista = (e) => {
    if (e.target === lista.current) seguir.current = null;
  };
  return {
    lista,
    ultima,
    alPreguntar: () => {
      seguir.current = 'pregunta';
    },
    props: activo ? { onScroll: alMover, onWheel: tomarScroll, onTouchMove: tomarScroll, onKeyDown: alTeclearLista, onPointerDown: alApretarLista } : {},
  };
}

/**
 * The box to write a question, the same in the talk and in a live session's Consultron (enVivo/herramientas/
 * Consultron.jsx). `campo`: the ref of its field; `valor` and `alCambiar(texto)`, what is written. `alPreguntar(e)`
 * asks: with a keyboard, Enter does too; on a phone it makes a new line. `arriba`: over the box (where it looks);
 * `encima`: inside it, over the field (what goes with the question); `herramientas`: the row under the field, with its
 * button; `fin` and `despues`: at the end of the box and under it. `lectura`: the line under everything, said aloud.
 */
export function Caja({ campo, valor, alCambiar, alPreguntar, compacta = false, alPegar, maximo = 1000, lectura = '', arriba = null, encima = null, herramientas, fin = null, despues = null }) {
  const alTeclear = (e) => {
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) alPreguntar(e);
  };
  return (
    <form className="consultron__caja" onSubmit={alPreguntar}>
      {arriba}
      <div className="consultron__redactor">
        {encima}
        <textarea
          ref={campo}
          className="campo__control consultron__campo"
          rows={compacta ? 1 : 2}
          aria-label="Tu pregunta"
          maxLength={maximo}
          placeholder="¿Qué es una cola M/M/1?"
          value={valor}
          onChange={(e) => alCambiar(e.target.value)}
          onKeyDown={alTeclear}
          onPaste={alPegar}
        />
        <div className="consultron__herramientas">{herramientas}</div>
        {fin}
      </div>
      {despues}
      <p className="consultron__debajo">
        <span className="consultron__lectura" role="status">{lectura}</span>
        <span>Puede equivocarse. Revisá las fuentes.</span>
      </p>
    </form>
  );
}

/**
 * The talk. `inicial`: the course it starts looking in (TODAS or its id), and it follows it when it changes. `nivel`:
 * of the headings of the questions. `compacta`: in the corner. `alIr`: before going to a screen from an answer.
 * `pagina`: the address of the screen the student has open, for «¿qué es esta página?». `marcado`: what the student
 * marked in a PDF to ask about ({ trozo, vez }, VisorPdf.jsx): it goes first with the next question, and
 * `alSoltarMarcado` lets go of it. `enResumen`: it's beside a summary of El Santo Resumen (VisorResumen.jsx) and answers
 * with it alone, or with what it knows if it isn't there: no courses to choose. `abierto`: that summary as a document
 * (adjuntar.js, `documentoDeTexto`); undefined while it comes, null if it has no text.
 */

export default function Charla({ inicial = TODAS, nivel = 2, compacta = false, alIr, pagina = null, marcado = null, alSoltarMarcado, abierto = null, enResumen = false, conPantalla = false }) {
  const { estado, hilo } = useConsultron();
  const [materia, setMateria] = useState(inicial);
  const [origen, setOrigen] = useState('todo');
  const idOrigen = useId();
  const [antes, setAntes] = useState(inicial);
  if (inicial !== antes) {
    setAntes(inicial);
    setMateria(inicial);
  }
  const [pregunta, setPregunta] = useState('');
  const lectura = useIndicePdf();
  const { materias, elegidas, contenido, pdfs, fotos, notas, donde: dondeBuscar, nombradas } = useApuntes(materia);
  const [visor, setVisor] = useState(null);
  const idMateria = useId();
  const campo = useRef(null);
  // The search of the question going on, to stop it.
  const corte = useRef(null);
  const ocupado = respondiendo(hilo);
  const permisos = usePermisosNube();
  const listo = sePuedePreguntar(estado, permisos, { enResumen });
  // The same one for the whole talk, so that an entry already written isn't drawn again when this screen is.
  const alIrAhora = useRef(alIr);
  useLayoutEffect(() => {
    alIrAhora.current = alIr;
  });
  const irAOtra = useCallback((...a) => alIrAhora.current?.(...a), []);
  const ultimaEstado = hilo.at(-1)?.estado;

  // Nothing is read until something is asked. Going to the other view doesn't stop it: the talk is the same.
  const detener = () => {
    corte.current?.abort();
    cancelarLectura();
    frenar();
    campo.current?.focus();
  };
  const largo = hilo.at(-1)?.texto.length ?? 0;
  const conEjemplo = Boolean(hilo.at(-1)?.ejemplo);
  // In the corner, the answer being written stays in sight, down to where its question reaches the top.
  const { lista, ultima, alPreguntar: seguirLaNueva, props: alSeguir } = useSigue(compacta, `${hilo.length} ${largo} ${ultimaEstado} ${conEjemplo}`);
  // Something marked in the PDF: the question to ask about it, ready to change, with the focus there.
  const vezMarcado = marcado?.vez;
  const [marcadoVisto, setMarcadoVisto] = useState(null);
  if (vezMarcado && vezMarcado !== marcadoVisto) {
    setMarcadoVisto(vezMarcado);
    setPregunta((p) => p.trim() || PREGUNTA_MARCADO);
  }
  useEffect(() => {
    if (!vezMarcado) return;
    requestAnimationFrame(() => {
      campo.current?.focus({ preventScroll: true });
      campo.current?.select();
    });
  }, [vezMarcado]);

  const cuenta = pdfs.length ? cuentaDe(pdfs) : null;
  // If the courses don't load, it still answers: without the notes. Beside a summary it waits only for its text.
  const buscando = enResumen ? abierto === undefined : !materias.error && (!elegidas || (!contenido.datos && !contenido.error));
  const adjuntos = useAdjuntos();
  const soltar = useSoltar();
  const preguntar = async (e, dada) => {
    e?.preventDefault();
    const escrita = (typeof dada === 'string' ? dada : pregunta).trim();
    // On a phone, the keyboard would cover the answer.
    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) campo.current?.focus();
    if ((!escrita && !adjuntos.pendientes.length && !marcado) || ocupado || !listo || buscando) return;
    // An idea asks by itself: what the student was writing stays.
    if (typeof dada !== 'string') setPregunta('');
    seguirLaNueva();
    const previa = hilo.at(-1);
    // What was attached goes with it, and stays for the next questions of the talk. Alone, it asks what it says.
    const suyos = adjuntos.pendientes.length && typeof dada !== 'string' ? enviar() : [];
    // What was marked in the PDF goes first, whole. A short question after one about it («¿y por qué?») takes it again.
    const marcadoAntes = previa && palabras(escrita).length < 3 ? previa.elegidos.find((e) => e.trozo.marcado)?.trozo : null;
    const marcadoNuevo = (typeof dada !== 'string' && marcado?.trozo) || null;
    const elMarcado = marcadoNuevo || marcadoAntes || null;
    const texto = escrita || (marcado ? PREGUNTA_MARCADO : preguntaPorDefecto(suyos));
    const deDonde = origenDe(escrita, origen);
    const queMaterias = materia === TODAS ? 'de tus materias' : 'de la materia que elegiste';
    const donde = enResumen === 'archivo' ? 'Busqué solo en este archivo.' : enResumen ? 'Busqué solo en este resumen.' : deDonde === 'santo' ? `Busqué solo en El Santo Resumen ${queMaterias}.` : deDonde === 'campus' ? `Busqué solo en los PDF ${queMaterias}.` : `Busqué en tus apuntes y en los resúmenes ${queMaterias}.`;
    const conCita = typeof dada !== 'string' && marcado ? [{ id: `marcado-${marcado.vez}`, nombre: marcado.trozo.texto, clase: 'marcado', pagina: marcado.trozo.pagina }] : [];
    const id = empezar(texto, donde, [...conCita, ...suyos.map((a) => ({ id: a.id, nombre: a.nombre, clase: a.clase, url: a.url }))], { enResumen });
    if (conCita.length) alSoltarMarcado?.();
    if (!compacta) requestAnimationFrame(() => ultima.current?.scrollIntoView({ block: 'start', behavior: suave() }));
    // «Tomame preguntas de Redes»: a practice question from the notes (Practica.jsx).
    const pide = !suyos.length && !elMarcado && pidePractica(texto);
    if (pide) {
      practicar({ materia, tema: pide.tema, id });
      return;
    }
    // «No lo entendí»: the topic before, told another way, with the same pieces.
    // Also after a question about something marked: its text goes again, to be told another way.
    const tema = !suyos.length && !marcadoNuevo && pideOtraVez(texto) ? hilo.findLast((e) => e.id !== id && !pideOtraVez(e.pregunta) && !e.practica) : null;
    if (tema) {
      const pedido = preguntaOtraVez(tema.pregunta, texto);
      if (tema.general || !tema.elegidos?.length) responder(id, [], '', { pedido });
      else responder(id, tema.elegidos, '', { pedido, soloSitio: tema.soloSitio });
      return;
    }
    if (!suyos.length && !elMarcado && pideHumor(texto)) {
      responder(id, [], '', { humor: true });
      return;
    }
    // A greeting or «qué sabés» doesn't look for anything: it goes to the model with the courses.
    if (!suyos.length && !elMarcado && esCharla(texto)) {
      responder(id, [], armarCharla(texto, nombradas.map((m) => m.nombre)));
      return;
    }
    const mio = new AbortController();
    corte.current = mio;
    // What is still being read of its attachments, it waits for. What couldn't be read was already said by the box.
    const propios = (await Promise.all(suyos.map((a) => a.lectura))).filter(Boolean);
    if (mio.signal.aborted) return;
    if (suyos.length && !escrita && !propios.length) {
      noPudoLeer(id);
      return;
    }
    // An exercise for a calculator, also in a photo or a file: the model takes out its data and the calculator does the
    // math.
    const adjunto = ejercicioDe(propios);
    const eleccion = elegirCalculo(escrita, adjunto);
    // «Inventate un ejercicio para esta calculadora», «dame un ejemplo de matrices»: one of the calculator's own «Probá
    // con», another each time, which the calculator fills as it opens. Made up by the model they came out wrong (the
    // inverse of a matrix that has none), or as Python for the lab.
    const paraEjercicio = !suyos.length && !elMarcado ? calculoDelEjercicio(escrita, pagina) : null;
    if (paraEjercicio) {
      const suyo = await ejemploPara(paraEjercicio, escrita, { otro: true }).catch(() => null);
      if (mio.signal.aborted) return;
      if (suyo) {
        mostrarSoloEjemplo(id, suyo);
        return;
      }
    }
    if (eleccion?.pide && Object.keys(eleccion.calculo.campos).length) {
      // If the data doesn't come out, it answers with the notes.
      let leido = null;
      try {
        const json = await pedirDatos(id, pedidoDeDatos(eleccion.calculo, [escrita, adjunto].filter(Boolean).join('\n\n')), esquemaDe(eleccion.calculo));
        leido = json ? leerDatos(eleccion.calculo, json) : null;
      } catch {
        leido = null;
      }
      if (mio.signal.aborted) return;
      if (leido) {
        mostrarCalculo(id, { slug: eleccion.calculo.slug, nombre: eleccion.calculo.nombre, clave: eleccion.calculo.clave, ...leido });
        return;
      }
    }
    if (eleccion && (eleccion.pide || eleccion.puntos >= 2)) sugerir(id, { slug: eleccion.calculo.slug, nombre: eleccion.calculo.nombre });
    // About the topic of a calculator, with no data of its own: after the answer, an example to try in it. Not about an
    // attachment: its words are its own, not the question's.
    const ejemplo = !suyos.length && eleccion && !eleccion.pide && eleccion.puntos >= 2 ? eleccion.calculo : null;
    // Beside a calculator, the lab, Tu carrera or Repaso (Flotante.jsx): what the screen shows now, read at this moment
    // (pantalla.js).
    const enPantalla = conPantalla && !suyos.length && !elMarcado ? pantallaAhora() : null;
    // «De hecho es al revés», «y para rendirla?» (it starts with «y»): about the answer before, from the same place and
    // with its question. After a chain of them, with the questions back to the one that started it.
    // One that says on its own what it's about («No no, que hay en mi calendario el viernes?») is asked as it is.
    const materias = await materiasDeLaCarrera(escrita);
    if (mio.signal.aborted) return;
    const porSiSola = (q) => esDeCursada(q) || esDeCarrera(q, materias);
    const objetada = Boolean(previa) && objeta(escrita) && !porSiSola(escrita);
    const esSeguimiento = (q) => objeta(q) || aclara(q) || /^[¿¡\s]*(y|e|entonces|pero|tambien|también)\s/i.test(q);
    const sigue = previa && !suyos.length && !elMarcado && esSeguimiento(escrita) ? previa : null;
    const deDondeSalio = (doc) => Boolean(sigue?.elegidos.some((e) => doc(String(e.trozo.doc ?? ''), e.trozo.fuente ?? {})));
    const cadena = [];
    for (let i = hilo.length - 1; sigue && i >= 0 && cadena.length < 4; i -= 1) {
      if (hilo[i].practica) continue;
      cadena.unshift(hilo[i].pregunta);
      if (!esSeguimiento(hilo[i].pregunta) || porSiSola(hilo[i].pregunta)) break;
    }
    const conLaPrevia = sigue ? `${cadena.join(' ')} ${escrita}` : escrita;
    // The first question of the chain, again, with the exact pieces.
    const comoSigue = (segun) => (objetada ? { pedido: preguntaObjetada(cadena[0] ?? previa.pregunta, segun) } : {});
    // About their own career (what a subject needs, their grades, what they can take): the copies of Sysacad, from any
    // screen, never what it knows in general. Over Tu carrera, the screen itself (below).
    const sigueDeCarrera = !esDeCursada(escrita) && deDondeSalio((doc, f) => doc === 'carrera' || (f.tipo === 'guia' && ['Tu carrera', 'Sysacad'].includes(f.nombre)));
    if (!suyos.length && !elMarcado && !enPantalla?.sola && (esDeCarrera(escrita, materias) || sigueDeCarrera)) {
      const dicha = await deLaCarrera(sigueDeCarrera && !esDeCarrera(escrita, materias) ? conLaPrevia : escrita);
      if (mio.signal.aborted) return;
      const doc = documentoDeTexto('carrera', { tipo: 'guia', nombre: dicha.nombre, a: dicha.a }, dicha.texto);
      responder(id, piezasPropias([doc], '', 5), '', { soloSitio: true, sinCharla: true, ...(sigueDeCarrera && comoSigue('Según Sysacad')) });
      return;
    }
    // About their own term (what's due, their classes, the faculty's dates): the campus and the calendar, never what it
    // knows in general. Over a screen that is the question's subject (Tu carrera: «¿qué curso el año que viene?»), that
    // screen.
    const sigueDeCursada = deDondeSalio((doc) => doc.startsWith('cursada:'));
    if (!suyos.length && !elMarcado && (esDeCursada(escrita) || sigueDeCursada) && !enPantalla?.sola) {
      const piezas = await deCursada(new Date(), sigueDeCursada && !esDeCursada(escrita) ? conLaPrevia : escrita);
      if (mio.signal.aborted) return;
      // A day named: that day's piece says it all, and the talk before only drags the day it was about.
      responder(id, piezas, '', { soloSitio: true, ...(sigueDeCursada && comoSigue('Según tu calendario')), sinCharla: !objetada && piezas.some((p) => ['cursada:dia', 'cursada:mesas'].includes(p.trozo.doc)) });
      return;
    }
    // A question about Super CVG itself (a screen, a calculator) is answered with its guide, without reading the notes.
    // With attachments it's about them: «¿qué es esto?» isn't the screen open.
    const dePantalla = enPantalla ? documentoDeTexto('pantalla', { tipo: 'pantalla', nombre: enPantalla.nombre }, enPantalla.texto) : null;
    const delSuper = delSitio(escrita, { donde: pagina, calculo: eleccion?.calculo });
    const sitio = suyos.length || elMarcado ? { solo: false, piezas: delSuper.piezas.filter((p) => !p.trozo.fuente.abierta) } : delSuper;
    if (sitio.solo) {
      // About the site, it never answers from what it knows in general: it would make up screens.
      // «¿Qué es esto?» over a calculator: what it shows goes with its guide.
      responder(id, [...(dePantalla ? piezasPropias([dePantalla], escrita, 2) : []), ...sitio.piezas], '', { soloSitio: true });
      if (ejemplo) armarEjemplo(id, ejemplo, texto);
      return;
    }
    // «Te pedí solo el paso 1», «me refería a…»: it corrects the answer before, and gets that alone.
    const corrige = !suyos.length && !marcadoNuevo && aclara(texto) ? hilo.findLast((e) => e.id !== id && !e.practica) : null;
    const comoResponde = corrige ? { pedido: preguntaAclarada(corrige.pregunta, texto), corto: true } : {};
    // A short question after another («¿y cómo se calcula?»), or one that corrects it, looks with the words of the one
    // before.
    const conLaDeAntes = corrige ? `${corrige.pregunta} ${texto}` : previa && palabras(texto).length < 3 ? `${previa.pregunta} ${texto}` : texto;
    // Its attachments go first, a short one whole. Alone, they are what it asks about: nothing else is read.
    // The summary open beside it (VisorResumen.jsx): its pieces that best match go first.
    // What the screen under it shows goes first too, whole if it's short. Not when the question asks to make something
    // new («escribí un código que…») without pointing at the screen («mi programa», «esto»): with the program of the
    // screen in front, the model copies it.
    const senala = Boolean(dePantalla) && senalaLaPantalla(conLaDeAntes);
    const vaLaPantalla = Boolean(dePantalla) && (senala || !pideAlgoNuevo(conLaDeAntes));
    const delAbierto = abierto && !suyos.length && !elMarcado ? piezasPropias([abierto], conLaDeAntes, enResumen ? 4 : 3) : vaLaPantalla ? piezasPropias([dePantalla], conLaDeAntes, 3) : [];
    const enteros = [...(elMarcado ? [{ trozo: elMarcado, puntaje: Infinity, cubre: 0 }] : []), ...delAbierto, ...piezasPropias(propios, escrita, escrita ? 4 : 6)];
    if (suyos.length && !escrita) {
      responder(id, enteros);
      return;
    }
    // «Explicame esto» about what was marked: that text alone. With more around it, the model explains the whole page.
    if (elMarcado && !suyos.length && (escrita === PREGUNTA_MARCADO || palabras(escrita).length < 3)) {
      responder(id, enteros, '', comoResponde);
      return;
    }
    // Beside a summary it answers with it alone: nothing of the campus nor of other summaries. What isn't there, with
    // what it knows.
    if (enResumen) {
      // Its text couldn't be read: nothing to answer with, and nothing made up.
      if (!abierto && !suyos.length && !elMarcado) {
        sinTextoAbierto(id, enResumen === 'archivo' ? 'No pude leer el texto de este archivo. Si es una foto escaneada, no tiene texto.' : 'No pude leer el texto de este resumen.');
        return;
      }
      responder(id, enteros.slice(0, 6), '', comoResponde);
      if (ejemplo) armarEjemplo(id, ejemplo, texto);
      return;
    }
    // In a calculator or the lab, «¿qué hace mi programa?» or «¿por qué me da esto?» is about what the screen shows: it
    // answers with that alone. With the notes around it, the model answers from a program of theirs.
    // Over Tu carrera, every question is about it: the whole screen, in order, and nothing of the notes.
    if (enPantalla?.sola && vaLaPantalla) {
      const deLaPregunta = enPantalla.porPregunta ? documentoDeTexto('pantalla', { tipo: 'pantalla', nombre: enPantalla.nombre }, enPantalla.porPregunta(conLaPrevia)) : dePantalla;
      // Only with what it shows: a small model fills the rest with what isn't there.
      responder(id, [...piezasPropias([deLaPregunta], '', 5), ...sitio.piezas].slice(0, 6), '', { ...comoResponde, ...comoSigue(`Según ${enPantalla.nombre}`), soloSitio: true });
      return;
    }
    if (senala) {
      responder(id, [...enteros.slice(0, 6 - sitio.piezas.length), ...sitio.piezas], '', comoResponde);
      if (ejemplo) armarEjemplo(id, ejemplo, texto);
      return;
    }
    // About what was marked, its words look for the rest in the notes.
    const consulta = elMarcado ? `${texto} ${elMarcado.texto.slice(0, 400)}` : conLaDeAntes;
    let elegidos = [];
    try {
      // What the student wrote on their own and what their Classroom says go with the notes, not with «Solo resúmenes»
      // nor «Solo PDF». Classroom, only if their Google account is already connected: what fails there is left out.
      const conTodo = deDonde === 'todo';
      // «Frenar» doesn't wait for Google.
      const frenada = (senal) => new Promise((listo) => (senal.aborted ? listo([]) : senal.addEventListener('abort', () => listo([]), { once: true })));
      const deClassroom =
        conTodo && dondeBuscar
          ? docsDeClassroom(await Promise.race([cargarUnidos().catch(() => []), frenada(mio.signal)]), { materias: new Set(dondeBuscar.materias.map((m) => m.id)), propias: new Set(dondeBuscar.propias.map((p) => p.id)) })
          : [];
      // What was attached before in the talk is searched with the notes.
      const santo = [...(deDonde === 'campus' ? [] : await delSanto(nombradas)), ...(conTodo ? notas : []), ...deClassroom, ...docsDeCharla(suyos.map((a) => a.id))];
      // The pictures of the student's own courses are read last, a few per question (donde.js).
      const porLeer = deDonde === 'santo' ? [] : conTodo ? [...pdfs, ...fotos] : pdfs;
      if (!mio.signal.aborted) elegidos = await buscarPiezas(consulta, { santo, pdfs: porLeer, ...lectorDe({ pdfs: { leer: leerPdfs, leidos: textosDe }, senal: mio.signal }), senal: mio.signal });
    } catch {
      elegidos = [];
    }
    if (mio.signal.aborted) return;
    // With something marked, it is the question: a couple of pieces more, for what is around it.
    const todos = [...enteros, ...(elMarcado ? elegidos.slice(0, 2) : elegidos)];
    responder(id, sitio.piezas.length ? [...todos.slice(0, 6 - sitio.piezas.length), ...sitio.piezas] : todos.slice(0, 6), '', comoResponde);
    if (ejemplo) armarEjemplo(id, ejemplo, texto);
  };
  // The talk on screen stays saved (charlas.js): a new one asks nothing.
  const charlaNueva = () => {
    limpiar();
    setArmando(false);
    campo.current?.focus();
  };
  // «Practicar»: a theme for the course of «De qué materia» (Practica.jsx).
  const [armando, setArmando] = useState(false);
  const botonPracticar = useRef(null);
  const cerrarPractica = (volver) => {
    setArmando(false);
    (volver ? botonPracticar : campo).current?.focus();
  };

  let lecturaTexto = '';
  // What was just attached comes first: it's what the student did.
  if (adjuntos.leyendo) lecturaTexto = textoDeAdjuntos(adjuntos.leyendo, '');
  else if (buscando) lecturaTexto = enResumen === 'archivo' ? 'Leyendo el archivo…' : enResumen ? 'Leyendo el resumen…' : 'Buscando tus materias…';
  else if (adjuntos.hecho) lecturaTexto = textoDeAdjuntos(null, adjuntos.hecho);
  // Beside a summary nothing of the campus is read.
  else if (enResumen) lecturaTexto = '';
  else if (contenido.datos && !pdfs.length) lecturaTexto = materia === TODAS ? 'Tus materias en curso no tienen PDF en el campus.' : dondeBuscar?.suya ? 'Esta materia no tiene PDF.' : 'Esta materia no tiene PDF en el campus.';
  // The count changes with each PDF: a screen reader hears only that it's reading.
  else if (cuenta && lectura.leyendo) lecturaTexto = <>Leyendo tus PDF<span aria-hidden="true">, {cuenta.leidos} de {pdfs.length}</span>.</>;
  // What it read for the questions so far. Some may not go (too big, broken): the answers don't know them.
  else if (cuenta?.leidos) lecturaTexto = cuenta.leidos === pdfs.length ? (pdfs.length === 1 ? 'Leyó tu PDF.' : `Leyó tus ${pdfs.length} PDF.`) : `Leyó ${cuenta.leidos} de ${pdfs.length} PDF.`;
  const practicaUltima = hilo.at(-1)?.practica;
  const respuestaAnuncio = practicaUltima
    ? practicaUltima.fase === 'pregunta' && ultimaEstado === 'practica'
      ? `Pregunta de práctica: ${practicaUltima.pregunta}`
      : practicaUltima.fase === 'corregida'
        ? 'Consultron corrigió tu respuesta.'
        : practicaUltima.fase === 'falla'
          ? 'Consultron se trabó.'
          : ''
    : hilo.at(-1)?.ejemplo ? 'Consultron te propone un ejemplo en la calculadora.' : { listo: 'Consultron respondió.', 'no-esta': 'Consultron respondió.', calculo: 'Consultron armó la calculadora.', frenado: 'Frenaste la respuesta.', falla: 'Consultron se trabó con esta pregunta.' }[ultimaEstado] ?? '';

  const propiasSueltas = usePropias().filter((p) => p.de === null || p.de === undefined);
  const opciones = (
    <>
      <option value={TODAS}>Todas las que cursás</option>
      {propiasSueltas.length > 0 && (
        <optgroup label="Tuyas">{propiasSueltas.map((p) => <option key={p.id} value={valorDePropia(p.id)}>{p.nombre}</option>)}</optgroup>
      )}
      {materias.datos?.enCurso.length > 0 && (
        <optgroup label="En curso">{materias.datos.enCurso.map((m) => <option key={m.id} value={String(m.id)}>{m.nombre}</option>)}</optgroup>
      )}
      {materias.datos?.otras.length > 0 && (
        <optgroup label="Otras">{materias.datos.otras.map((m) => <option key={m.id} value={String(m.id)}>{m.nombre}</option>)}</optgroup>
      )}
    </>
  );

  return (
    <div className="charla" data-compacta={compacta || undefined} data-arrastrando={soltar.arrastrando || undefined} {...soltar.props}>
      <div
        ref={lista}
        className="charla__lista"
        {...alSeguir}
      >
        {!enResumen && materias.error && <ErrorConReintento texto={textoError(materias.error)} recargar={materias.recargar} />}
        {!enResumen && contenido.error && <ErrorConReintento texto={textoError(contenido.error)} recargar={contenido.recargar} />}
        {hilo.length === 0 && (
          <div className="charla__vacia">
            {compacta && <Robot />}
            {compacta && <p>Preguntale a tus apuntes o pasale un ejercicio para las calculadoras.</p>}
            {/* Beside a summary the model answers, and Gemini would do better: the offer to turn it on. */}
            {enResumen === true && estado.fase === 'listo' && !permisos.resumenes && <OfertaNube cual="resumenes" />}
            {listo && !buscando && (
              <ul className="charla__ideas" aria-label="Ideas para preguntar">
                {ideasPara(pagina).map((idea) => (
                  <li key={idea}>
                    <button type="button" className="charla__idea" onClick={() => preguntar(null, idea)}>{idea}</button>
                  </li>
                ))}
              </ul>
            )}
            {listo && <Charlas nivel={nivel} ocupado={ocupado} alAbrir={() => campo.current?.focus()} />}
          </div>
        )}

        {hilo.length > 0 && (
          <section className="consultron__hilo" aria-label="Tus preguntas">
            {hilo.map((entrada, i) => (
              <Entrada key={entrada.id} entrada={entrada} ultima={i === hilo.length - 1} refUltima={ultima} nivel={nivel} abrirResumen={setVisor} alIr={irAOtra} ocupado={entrada.practica ? ocupado : false} />
            ))}
            {!ocupado && (
              <button type="button" className="consultron__limpiar" onClick={charlaNueva}>Charla nueva</button>
            )}
          </section>
        )}
        <p className="solo-lectores" role="status">{respuestaAnuncio}</p>
      </div>

      <Caja
        campo={campo}
        valor={pregunta}
        alCambiar={setPregunta}
        alPreguntar={preguntar}
        compacta={compacta}
        alPegar={alPegar}
        lectura={lecturaTexto}
        arriba={(
          <>
            {!enResumen && !materias.error && (
              <div className="consultron__donde">
                <span aria-hidden="true">Busca en</span>
                <label htmlFor={idMateria} className="solo-lectores">De qué materia</label>
                <select id={idMateria} className="campo__control consultron__selector" value={materia} disabled={!materias.datos} onChange={(e) => setMateria(e.target.value)}>
                  {opciones}
                </select>
                <label htmlFor={idOrigen} className="solo-lectores">De dónde</label>
                <select id={idOrigen} className="campo__control consultron__selector consultron__origen" value={origen} onChange={(e) => setOrigen(e.target.value)}>
                  {ORIGENES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                </select>
              </div>
            )}
            {armando && <ArmarPractica materia={materia} onCerrar={cerrarPractica} ocupado={ocupado || buscando} />}
          </>
        )}
        encima={(
          <>
            {lectura.leyendo && <progress className="consultron__barra consultron__barra--fina" max={lectura.total || 1} value={lectura.actual} aria-hidden="true" />}
            {marcado && <Marcado trozo={marcado.trozo} alSacar={() => {
              alSoltarMarcado?.();
              campo.current?.focus();
            }} />}
            {adjuntos.pendientes.length > 0 && <AdjuntosCaja pendientes={adjuntos.pendientes} campo={campo} />}
          </>
        )}
        herramientas={(
          <>
            <BotonAdjuntar />
            <Dictar base={pregunta} alTexto={setPregunta} campo={campo} />
            {/* Practice needs the model of the computer: with only Gemini, there's none. */}
            {estado.fase === 'listo' && (
              <button ref={botonPracticar} type="button" className="consultron__practicar" aria-expanded={armando} title="Practicar con preguntas de tus apuntes" onClick={() => setArmando(!armando)}>
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 3h6v3H9zM7 4.5H5V21h14V4.5h-2M8.5 13.5l2.5 2.5 4.5-4.5" /></svg>
                <span className="consultron__practicar-texto">Practicar</span>
              </button>
            )}
            {ocupado ? (
              <button type="button" className="boton boton--secundario" onClick={detener}>Frenar</button>
            ) : (
              <button type="submit" className="boton">Preguntar</button>
            )}
          </>
        )}
        fin={soltar.arrastrando && <p className="consultron__soltar" aria-hidden="true">Soltá acá para adjuntar</p>}
        despues={<ProblemasAdjuntos problemas={adjuntos.problemas} />}
      />
      {visor && <VisorResumen resumen={visor} onCerrar={() => setVisor(null)} />}
    </div>
  );
}
