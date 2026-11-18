import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Caja, Entrada, Robot, useSigue } from '../../consultron/Charla';
import { cambiarNube } from '../../consultron/Modelo';
import { Dictar } from '../../consultron/Voz';
import { useUI } from '../../ui';
import { cargar, preguntarAparte, revisar, useConsultron, usar } from '../../../lib/consultron/motor';
import { preguntarNube, quedanHoy, usePermisosNube } from '../../../lib/consultron/nube';
import { colorSeguro } from '../../../lib/enVivo/apunte';
import { contestar, contextoDeLaMesa, hilo, hiloEnTexto, MAX_PREGUNTA, preguntarEnMesa, responderEnMesa } from '../../../lib/enVivo/consultronMesa';
import { useCambios } from './useCambios';

// The Consultron of the table, at its side (ConsultronFlotante.jsx `ConsultronAlLado`): one thread everyone sees, drawn
// with the site's own Consultron (Charla.jsx: `Entrada`, `Caja`, `useSigue`). Whoever asks, answers from their browser:
// with Gemini if they chose it for the table, or with the model of their computer. It reads only the text of the
// table's tabs. The answers come from the others too: drawn as text, never as HTML.

const FASES_CARGANDO = new Set(['quieto', 'revisando', 'bajando', 'preparando']);

// What became of whoever asked a question still unanswered: here, gone, or reloaded since (the answer was being made in
// the page they had, so it won't come). A reload is not leaving: while they may be back, it's still on its way.
function quienPregunto(mesa, e) {
  // A session from before `presente` (the site was updated under it) can't tell: still on its way.
  if (typeof mesa.presente !== 'function') return 'esta';
  const p = mesa.presente(e.de);
  if (!p) return 'ido';
  return p.desde > e.cuando ? 'recargo' : 'esta';
}

/** A question of the thread as the site's Consultron keeps one (motor.js): what `Entrada` draws. Its sources are the
 * table's tabs, by name. */
function comoEnElSitio(e, mia) {
  const nombre = String(e.nombre).replace(/\.$/, '');
  let contesto = '';
  if (e.quien === 'gemini') contesto = mia ? 'Contestó Gemini, de Google.' : `Contestó Gemini, con las preguntas de ${nombre}.`;
  else if (e.quien === 'compu' && !mia) contesto = `Contestó Consultron en la compu de ${nombre}.`;
  return {
    id: e.id,
    pregunta: e.pregunta,
    estado: e.estado === 'pensando' ? 'leyendo' : e.estado,
    texto: e.respuesta,
    elegidos: e.fuentes.map((f) => ({ trozo: { doc: `mesa:${f}`, texto: '', fuente: { tipo: 'mesa', nombre: f } } })),
    general: e.general,
    enResumen: 'mesa',
    contesto,
  };
}

/** One question of the session's thread with its answer, as the site's Consultron draws them. Someone else's carries
 * their name and their color. `nivel`: of the question's heading. */
export function EntradaDeLaMesa({ entrada: e, mesa, nivel, ultima = false, refUltima = null }) {
  const mia = e.de === mesa.yo.id;
  const entrada = useMemo(() => comoEnElSitio(e, mia), [e, mia]);
  const color = colorSeguro(e.color);
  const autor = useMemo(() => (mia ? null : { nombre: e.nombre, color }), [mia, e.nombre, color]);
  const fue = e.estado === 'pensando' ? quienPregunto(mesa, e) : 'esta';
  let aviso = null;
  if (fue === 'ido') aviso = `${e.nombre} se fue antes de que llegara la respuesta.`;
  else if (fue === 'recargo') aviso = mia ? 'Recargaste la página antes de que llegara la respuesta.' : `${e.nombre} recargó la página antes de que llegara la respuesta.`;
  return <Entrada entrada={entrada} ultima={ultima} refUltima={refUltima} nivel={nivel} autor={autor} aviso={aviso} sinSalir />;
}

export default function Consultron({ mesa, enfocar = false }) {
  useCambios(mesa.datos);
  const entradas = hilo(mesa.datos);

  // «Guardar en lo mío»: the questions and their answers, as text. Only once something was answered.
  const hayRespuestas = entradas.some((e) => e.estado === 'listo');
  const paraGuardar = mesa.paraGuardar;
  const datosMesa = mesa.datos;
  useEffect(() => (hayRespuestas ? paraGuardar(() => ({ nombre: 'Consultron de la sesión', texto: hiloEnTexto(hilo(datosMesa)) })) : undefined), [hayRespuestas, paraGuardar, datosMesa]);

  // As beside a reader: a new question goes up to the top, and the list stays where the student leaves it.
  const { lista, ultima, alPreguntar, props: alSeguir } = useSigue(true, `${entradas.length} ${entradas.at(-1)?.estado}`);

  return (
    <div className="charla" data-compacta="">
      <div ref={lista} className="charla__lista" {...alSeguir}>
        {entradas.length === 0 ? (
          <div className="charla__vacia">
            <Robot />
            <p>Pregunten lo que quieran de lo que hay en la mesa. La respuesta la ven todos.</p>
          </div>
        ) : (
          <section className="consultron__hilo" aria-label="Preguntas de la sesión">
            {entradas.map((e, i) => <EntradaDeLaMesa key={e.id} entrada={e} mesa={mesa} nivel={3} ultima={i === entradas.length - 1} refUltima={ultima} />)}
          </section>
        )}
      </div>
      <FormPregunta mesa={mesa} enfocar={enfocar} alPreguntar={alPreguntar} />
    </div>
  );
}

/** Asking the table's Consultron, in the site's box: who answers, the field, «Preguntar» and how this browser answers.
 * `mesa` needs { doc, datos, yo, textosDeLaMesa }, with `datos` the session's thread. `alPreguntar(id)` once it's asked. */
export function FormPregunta({ mesa, alPreguntar, enfocar = false }) {
  const idQuien = useId();
  const { confirmar } = useUI();
  const { estado } = useConsultron();
  const permisos = usePermisosNube();
  const quedan = quedanHoy(permisos);
  const conGemini = Boolean(permisos.mesa) && quedan !== 0;
  const [pregunta, setPregunta] = useState('');
  const [esperando, setEsperando] = useState(false);
  const campo = useRef(null);
  const vivo = useRef(true);
  useEffect(() => {
    vivo.current = true;
    if (enfocar) campo.current?.focus();
    return () => {
      vivo.current = false;
    };
  }, [enfocar]);

  // The model of this computer: looked at, and loaded if it's already in the browser.
  useEffect(() => {
    revisar();
    return usar();
  }, []);
  useEffect(() => {
    if (estado.fase === 'bajado') cargar();
  }, [estado.fase]);
  const puede = conGemini || estado.fase === 'listo';

  const mandar = async (e) => {
    e?.preventDefault();
    if (!puede || esperando || !pregunta.trim()) return;
    const datos = mesa.datos;
    const qid = preguntarEnMesa(mesa.doc, datos, mesa.yo, pregunta);
    if (!qid) return;
    setPregunta('');
    setEsperando(true);
    alPreguntar?.(qid);
    try {
      const docs = contextoDeLaMesa(mesa.doc, mesa.textosDeLaMesa(), mesa.id);
      const r = await responderEnMesa({
        pregunta: pregunta.trim().slice(0, MAX_PREGUNTA),
        docs,
        entradas: hilo(datos),
        id: qid,
        conGemini,
        nube: (mensajes) => preguntarNube(mensajes, 'mesa'),
        compu: preguntarAparte,
      });
      contestar(datos, qid, r);
    } catch {
      contestar(datos, qid, { estado: 'falla' });
    }
    if (vivo.current) setEsperando(false);
  };

  return (
    <Caja
      campo={campo}
      valor={pregunta}
      alCambiar={setPregunta}
      alPreguntar={mandar}
      compacta
      maximo={MAX_PREGUNTA}
      lectura={<Como permisos={permisos} quedan={quedan} conGemini={conGemini} estado={estado} />}
      arriba={(
        <div className="consultron__donde">
          <label htmlFor={idQuien} className="solo-lectores">Quién contesta</label>
          <select id={idQuien} className="campo__control consultron__selector" value={permisos.mesa ? 'gemini' : 'compu'} onChange={(e) => cambiarNube(confirmar, 'mesa', e.target.value === 'gemini', { sinModelo: estado.fase !== 'listo' })}>
            <option value="compu">Contesta Consultron en tu compu</option>
            <option value="gemini">Contesta Gemini, de Google</option>
          </select>
        </div>
      )}
      herramientas={(
        <>
          <Dictar base={pregunta} alTexto={setPregunta} campo={campo} />
          <button type="submit" className="boton" aria-disabled={!puede || esperando || !pregunta.trim() ? 'true' : undefined}>
            {esperando ? 'Pensando' : 'Preguntar'}
          </button>
        </>
      )}
    />
  );
}

// How this browser answers, in the line under the box.
function Como({ permisos, quedan, conGemini, estado }) {
  if (conGemini) return quedan === null ? '' : quedan === 1 ? 'Te queda 1 pregunta con Gemini hoy.' : `Te quedan ${quedan} preguntas con Gemini hoy.`;
  const sinGemini = permisos.mesa && quedan === 0 ? 'Por hoy no te quedan preguntas con Gemini. ' : '';
  if (estado.fase === 'listo') return sinGemini ? `${sinGemini}Contesta Consultron en tu compu.` : '';
  if (estado.fase === 'no-puede') return `${sinGemini}Esta compu no puede correr Consultron. Con Gemini sí podés preguntar.`;
  if (estado.fase === 'sin-bajar') return <>{sinGemini}Consultron no está en esta compu. <Link to="/consultron">Bajalo</Link> o elegí Gemini.</>;
  if (estado.fase === 'falla') return `${sinGemini}${estado.error}`;
  if (FASES_CARGANDO.has(estado.fase)) return `${sinGemini}Consultron se está cargando en tu compu.`;
  return sinGemini;
}
