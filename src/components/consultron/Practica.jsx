import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAbrirPrevia } from '../Previa';
import { cargarIndice, cargarMaterias } from '../../lib/campus';
import { elegirCalculo } from '../../lib/consultron/calculos';
import { TODAS, dePropias, dondeBusca } from '../../lib/consultron/donde';
import { delSanto, buscarPiezas } from '../../lib/consultron/fuentes';
import { alTerminar, empezar, entradaDe, pedirDatos, ponerPractica, ponerTrozo, sugerir, useConsultron } from '../../lib/consultron/motor';
import { tarjetaDePractica } from '../../lib/repaso';
import { cabeOtra, crearTarjeta } from '../../lib/repasoGuardado';
import { ESQUEMA_PREGUNTA, claveDeTrozo, elegirTrozo, esquemaDeCorreccion, leerCorreccion, leerPregunta, materiaDelTema, pedidoDeCorreccion, pedidoDePregunta, sinRespuesta } from '../../lib/consultron/practica';
import { leerPdfs, pdfsDe, textosDe } from '../../lib/indicePdf';
import { docDe } from '../../lib/lectura';
import { estaOculto, mioActual, personalizar } from '../../lib/mio';

// Practice with the notes, inside the talk: Consultron asks a question that comes from a real piece of the student's
// notes, the student answers in the card, and the correction says what was there and what was missing, with the page.
// The logic of the question and its check is in practica.js; the entry is one more of the talk (motor.js).

const fino = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches;

/** The courses and the PDFs to practice with: a course of the student (of the campus or of their own, donde.js), or all
 * the ones in progress. The PDFs the student added on their own go with the campus ones. */
async function apuntesDe(materia) {
  const materias = await cargarMaterias();
  const mio = mioActual();
  const donde = dondeBusca(String(materia), materias, mio);
  const contenido = donde.materias.length ? await cargarIndice(donde.materias) : [];
  const nombres = Object.fromEntries([...materias.enCurso, ...materias.otras].map((m) => [m.id, m.nombre]));
  const suyos = dePropias(donde.propias, { nombres }).archivos;
  // One of their own goes by its name: for El Santo Resumen and for the title of the question.
  const elegidas = donde.suya ? [{ nombre: donde.suya.nombre }] : donde.materias;
  return { elegidas, pdfs: pdfsDe([...personalizar(contenido ?? [], mio).filter((i) => !estaOculto(mio, i)), ...suyos]) };
}

// The documents already read, to pick a piece when there's no theme. If none, a couple of the PDFs, by chance.
async function docsParaPracticar(santo, pdfs, senal) {
  const leidos = () => textosDe(pdfs).map(({ item, paginas }) => ({ doc: docDe(item), fuente: { tipo: 'pdf', nombre: item.nombre, materia: item.materia, item }, paginas }));
  let docs = [...santo, ...leidos()];
  if (!docs.length && pdfs.length && !senal.aborted) {
    const mezcla = [...pdfs].sort(() => Math.random() - 0.5).slice(0, 2);
    await leerPdfs(mezcla);
    docs = leidos();
  }
  return docs;
}

/** Starts a practice question, in a new entry or in `id` (a message that asked for it). `materia`: TODAS or its id.
 * `usados`: the pieces already asked about in this talk, so it doesn't repeat one. */
export async function practicar({ materia = TODAS, tema = '', id = null, usados = new Set() }) {
  let elegidas = [];
  let pdfs = [];
  let nombre = '';
  let materiaId = materia;
  let resto = tema;
  try {
    ({ elegidas, pdfs } = await apuntesDe(materia));
    // «Tomame preguntas de Redes»: the theme may name one of the student's courses.
    const todas = await cargarMaterias().then((m) => [...m.enCurso, ...m.otras]).catch(() => []);
    const delTema = tema ? materiaDelTema(tema, todas) : { materia: null, tema: '' };
    if (delTema.materia) {
      materiaId = String(delTema.materia.id);
      resto = delTema.tema;
      ({ elegidas, pdfs } = await apuntesDe(materiaId));
    }
    if (materiaId !== TODAS) nombre = elegidas[0]?.nombre ?? '';
  } catch {
    // Without the courses it can't pick a piece: it says so in the card.
  }
  const titulo = ['Practicar', resto, nombre && (resto ? `de ${nombre}` : nombre)].filter(Boolean).join(' ');
  const entrada = id ?? empezar(nombre || resto ? titulo : 'Practicar con tus apuntes', '');
  ponerPractica(entrada, { materia: materiaId, nombre, tema: resto, fase: 'armando' });

  const corte = new AbortController();
  // «Frenar» stops it: the entry stops being read, and so does this.
  alTerminar(entrada).then(() => corte.abort());
  let santo = [];
  try {
    santo = await delSanto(elegidas);
  } catch {
    santo = [];
  }
  // A model that fails isn't notes without a question: it says so apart.
  let fallo = false;
  for (let intento = 0; intento < 3 && !corte.signal.aborted; intento += 1) {
    let trozo = null;
    try {
      if (resto) {
        const elegidos = await buscarPiezas(resto, { santo, pdfs, leer: leerPdfs, leidos: textosDe, senal: corte.signal });
        trozo = elegirTrozo({ elegidos, usados });
      } else {
        trozo = elegirTrozo({ docs: await docsParaPracticar(santo, pdfs, corte.signal), usados });
      }
    } catch {
      trozo = null;
    }
    if (corte.signal.aborted) return entrada;
    if (!trozo) break;
    usados.add(claveDeTrozo(trozo));
    const json = await pedirDatos(entrada, pedidoDePregunta(trozo, resto), ESQUEMA_PREGUNTA).catch(() => {
      fallo = true;
      return null;
    });
    if (corte.signal.aborted) return entrada;
    const leida = json && leerPregunta(json, trozo);
    if (leida) {
      ponerTrozo(entrada, trozo);
      ponerPractica(entrada, { fase: 'pregunta', ...leida, respuesta: '' }, 'practica');
      return entrada;
    }
  }
  if (!corte.signal.aborted) ponerPractica(entrada, { fase: fallo ? 'falla' : 'sin-trozo' }, 'practica');
  return entrada;
}

/** The pieces asked about so far in the talk, with the same course and theme. */
export function usadosEn(hilo, practica) {
  const usados = new Set();
  for (const e of hilo) {
    const t = e.practica && e.elegidos?.[0]?.trozo;
    if (t && e.practica.materia === practica.materia && e.practica.tema === practica.tema) usados.add(claveDeTrozo(t));
  }
  return usados;
}

/** Checks an answer: each idea against what the student wrote, with the model and, if it fails, by the words. */
async function corregir(entrada, respuesta) {
  const practica = { ...entrada.practica, respuesta };
  const trozo = entrada.elegidos?.[0]?.trozo;
  if (!trozo) return;
  ponerPractica(entrada.id, { fase: 'corrigiendo', respuesta }, 'leyendo');
  let resultado;
  if (sinRespuesta(respuesta)) resultado = { ideas: practica.ideas.map(() => 'no'), error: '' };
  else {
    const json = await pedirDatos(entrada.id, pedidoDeCorreccion(practica, trozo), esquemaDeCorreccion(practica.ideas.length)).catch(() => null);
    // Stopped meanwhile: the question waits again, with what was written.
    if (entradaDe(entrada.id)?.estado !== 'leyendo') return;
    resultado = leerCorreccion(json, practica);
  }
  ponerPractica(entrada.id, { fase: 'corregida', resultado }, 'practica');
  // If the theme has a calculator, it's offered under the correction.
  const eleccion = elegirCalculo(`${practica.tema} ${practica.pregunta}`);
  if (eleccion && eleccion.puntos >= 2) sugerir(entrada.id, { slug: eleccion.calculo.slug, nombre: eleccion.calculo.nombre });
}

const NIVELES = [
  ['si', 'Bien', 'practica__lista--bien'],
  ['en-parte', 'A medias', 'practica__lista--medias'],
  ['no', 'Te faltó', 'practica__lista--falta'],
];

/** Where the question comes from: the PDF at its page, a summary, a page of El Santo Resumen. And the piece itself. */
function Fuente({ trozo, abrirResumen, nivel }) {
  const abrir = useAbrirPrevia();
  const Titulo = `h${nivel + 1}`;
  const f = trozo.fuente;
  const dato = f.tipo === 'pdf' ? `${f.materia ? `${f.materia}, ` : ''}página ${trozo.pagina}` : f.tipo === 'resumen' ? `Banco de El Santo Resumen, ${f.materia}` : `El Santo Resumen, ${f.materia}`;
  const adentro = (
    <span className="consultron__fuente-texto">
      <span className="consultron__fuente-nombre">{f.nombre}</span>
      <span className="consultron__fuente-dato">{dato}</span>
    </span>
  );
  let fuente = <div className="consultron__fuente">{adentro}</div>;
  if (f.tipo === 'oficial' && f.url) {
    fuente = (
      <a className="consultron__fuente" href={f.url} target="_blank" rel="noopener noreferrer">
        {adentro}
        <span className="solo-lectores">, se abre en otra pestaña</span>
      </a>
    );
  } else if (f.tipo === 'pdf' && f.item) {
    fuente = <button type="button" className="consultron__fuente" aria-haspopup="dialog" onClick={() => abrir({ ...f.item, abrirEn: { pagina: trozo.pagina } })}>{adentro}</button>;
  } else if (f.tipo === 'resumen' && f.resumen) {
    fuente = <button type="button" className="consultron__fuente" aria-haspopup="dialog" onClick={() => abrirResumen(f.resumen)}>{adentro}</button>;
  }
  return (
    <div className="consultron__fuentes">
      <Titulo>De dónde sale</Titulo>
      {fuente}
      <details className="practica__trozo">
        <summary>Lo que dicen tus apuntes</summary>
        <p>{trozo.texto}</p>
      </details>
    </div>
  );
}

// A checked question, kept as a card of Repaso: the question in front, the ideas of a good answer behind. Once kept,
// the button says so and links there. The course goes with it when it is one (a campus number or one of the student's).
const materiaDeLaPractica = (m) => (/^\d+$/.test(String(m)) ? Number(m) : /^p[0-9a-z]{6,20}$/.test(String(m)) ? m : null);
function GuardarTarjeta({ practica }) {
  const [guardada, setGuardada] = useState(false);
  const [error, setError] = useState('');
  if (guardada) {
    return (
      <p className="practica__guardada" role="status">
        Quedó en <Link to="/repaso">Repaso</Link>.
      </p>
    );
  }
  const guardar = () => {
    if (!cabeOtra()) {
      setError('Llegaste al máximo de tarjetas de Repaso.');
      return;
    }
    const id = crearTarjeta({ ...tarjetaDePractica(practica), materia: materiaDeLaPractica(practica.materia) });
    if (id) setGuardada(true);
    else setError('No se pudo guardar. Probá de nuevo.');
  };
  return (
    <>
      <button type="button" className="boton boton--chico boton--secundario practica__otra" onClick={guardar}>Guardar como tarjeta</button>
      {error && <p className="consultron__nota consultron__nota--error" role="alert">{error}</p>}
    </>
  );
}

/** A practice question in the talk: being made, waiting for the answer, being checked, or checked. */
export function EntradaPractica({ entrada, ultima, nivel, abrirResumen, ocupado }) {
  const { hilo } = useConsultron();
  const p = entrada.practica;
  const trozo = entrada.elegidos?.[0]?.trozo;
  const [respuesta, setRespuesta] = useState(p.respuesta ?? '');
  const campo = useRef(null);
  const otra = useRef(null);
  const idCampo = useId();
  const Titulo = `h${nivel + 1}`;
  // Stopped while it checked: the question waits again.
  const esperando = (p.fase === 'pregunta' || p.fase === 'corrigiendo') && entrada.estado !== 'leyendo' && p.pregunta;
  const corrigiendo = p.fase === 'corrigiendo' && entrada.estado === 'leyendo';

  // The question arrived, or its correction: with a keyboard, the focus goes on to what follows.
  useEffect(() => {
    if (!ultima || !fino()) return;
    if (p.fase === 'pregunta' && entrada.estado === 'practica') campo.current?.focus();
    if (p.fase === 'corregida') otra.current?.focus();
  }, [ultima, p.fase, entrada.estado]);

  const alCorregir = (e) => {
    e.preventDefault();
    if (ocupado) return;
    corregir(entrada, respuesta.trim());
  };
  const otraPregunta = () => {
    if (ocupado) return;
    practicar({ materia: p.materia, tema: p.tema, usados: usadosEn(hilo, p) });
  };
  const alTeclear = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && fino()) alCorregir(e);
  };

  if (p.fase === 'armando') {
    return entrada.estado === 'leyendo' ? <p className="consultron__pensando">Buscando de qué preguntarte en tus apuntes…</p> : <p className="consultron__nota">La frenaste.</p>;
  }
  if (p.fase === 'falla') return <p className="consultron__nota consultron__nota--error">Consultron se trabó. Probá de nuevo.</p>;
  if (p.fase === 'sin-trozo' || !p.pregunta) {
    return <p className="consultron__nota">No encontré en tus apuntes de qué preguntarte. Probá con otro tema o con otra materia.</p>;
  }
  return (
    <div className="practica">
      <p className="practica__etiqueta">Pregunta de práctica</p>
      <p className="practica__pregunta">{p.pregunta}</p>
      {esperando ? (
        <form className="practica__responder" onSubmit={alCorregir}>
          <label htmlFor={idCampo} className="solo-lectores">Tu respuesta</label>
          <textarea
            ref={campo}
            id={idCampo}
            className="campo__control practica__campo"
            rows={3}
            maxLength={2000}
            placeholder="Respondé con tus palabras"
            value={respuesta}
            onChange={(e) => setRespuesta(e.target.value)}
            onKeyDown={alTeclear}
          />
          <div className="practica__botones">
            <button type="submit" className="boton boton--chico" disabled={ocupado}>Corregir</button>
            <button type="button" className="boton boton--chico boton--secundario" disabled={ocupado} onClick={otraPregunta}>Otra pregunta</button>
          </div>
        </form>
      ) : (
        <>
          <div className="practica__tuya">
            <Titulo>Tu respuesta</Titulo>
            <p>{p.respuesta || 'No respondiste.'}</p>
          </div>
          {corrigiendo && <p className="consultron__pensando">Comparando con tus apuntes…</p>}
          {p.fase === 'corregida' && p.resultado && (
            <div className="practica__resultado">
              {NIVELES.map(([nivelIdea, titulo, clase]) => {
                const ideas = p.ideas.filter((_, k) => p.resultado.ideas[k] === nivelIdea);
                if (!ideas.length) return null;
                return (
                  <div key={nivelIdea} className={`practica__lista ${clase}`}>
                    <Titulo>{titulo}</Titulo>
                    <ul>{ideas.map((i) => <li key={i}>{i}</li>)}</ul>
                  </div>
                );
              })}
              {p.resultado.error && <p className="practica__ojo"><strong>Ojo.</strong> {p.resultado.error}</p>}
            </div>
          )}
        </>
      )}
      {p.fase === 'corregida' && trozo && <Fuente trozo={trozo} abrirResumen={abrirResumen} nivel={nivel} />}
      {p.fase === 'corregida' && (
        <div className="practica__botones">
          <button ref={otra} type="button" className="boton boton--chico practica__otra" disabled={ocupado} onClick={otraPregunta}>Otra pregunta</button>
          <GuardarTarjeta practica={p} />
        </div>
      )}
    </div>
  );
}

/** «Practicar»: a theme, if the student wants one, and the course of «De qué materia». */
export function ArmarPractica({ materia, onCerrar, ocupado }) {
  const [tema, setTema] = useState('');
  const campo = useRef(null);
  const idTema = useId();
  useEffect(() => {
    campo.current?.focus();
  }, []);
  const empezarla = () => {
    if (ocupado) return;
    practicar({ materia, tema: tema.trim() });
    onCerrar(false);
  };
  const alTeclear = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      empezarla();
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      onCerrar(true);
    }
  };
  return (
    <div className="practica__armar" role="group" aria-labelledby={`${idTema}-titulo`}>
      <p id={`${idTema}-titulo`} className="practica__armar-titulo">Practicá con preguntas de tus apuntes</p>
      <div className="practica__armar-fila">
        <label htmlFor={idTema} className="solo-lectores">Tema, si querés uno</label>
        <input
          ref={campo}
          id={idTema}
          className="campo__control practica__tema"
          maxLength={120}
          placeholder="Tema, si querés uno"
          value={tema}
          onChange={(e) => setTema(e.target.value)}
          onKeyDown={alTeclear}
        />
        <button type="button" className="boton boton--chico" disabled={ocupado} onClick={empezarla}>Empezar</button>
        <button type="button" className="practica__cerrar" aria-label="Cerrar" onClick={() => onCerrar(true)}>
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>
    </div>
  );
}
