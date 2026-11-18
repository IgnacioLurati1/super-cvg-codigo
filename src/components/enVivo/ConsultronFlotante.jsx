import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useConsultron } from '../../lib/consultron/motor';
import { hilo, hiloDeLaMesa } from '../../lib/enVivo/consultronMesa';
import { IconoMenu } from '../../layouts/Menu';
import { Borde, BotonesDeAncho, useAncho } from '../consultron/Ancho';
import { Anuncio } from '../consultron/Modelo';
import GuardarEnLoMio from './GuardarEnLoMio';
import Consultron, { EntradaDeLaMesa } from './herramientas/Consultron';
import { useCambios } from './herramientas/useCambios';
import Icono from './Iconos';
import '../consultron/consultron.css';

// The session's Consultron, loaded apart from the table: at the side of the table, as the site's readers open it, with
// the whole thread and where to ask (or in the box down on the right, Flotante.jsx, when Consultron opens only there);
// and the bubble with an answer in the middle of the table while that side is closed. All read and write the session's
// one thread (consultronMesa.js `hiloDeLaMesa`).

// What is on the table keeps at least this much of the row, however wide Consultron is dragged.
const MIN_MESA = 440;

// The thread as the table's tab of Consultron takes it, and «Guardar en lo mío» of it once something was answered (the
// thread registers it, as a tab would).
function useHilo(sesion) {
  const datos = useMemo(() => hiloDeLaMesa(sesion.doc), [sesion]);
  const [dar, setDar] = useState(null);
  const paraGuardar = useCallback((fn) => {
    setDar(() => fn);
    return () => setDar(null);
  }, []);
  const mesa = useMemo(
    () => ({ doc: sesion.doc, datos, yo: sesion.yo, id: null, conciencia: sesion.conciencia, presente: sesion.presente, textosDeLaMesa: () => sesion.textos(), paraGuardar }),
    [sesion, datos, paraGuardar],
  );
  return { mesa, dar };
}

/** The session's thread inside Consultron's box (Flotante.jsx), under its header. */
export function HiloEnCaja({ sesion }) {
  const { estado } = useConsultron();
  const { mesa, dar } = useHilo(sesion);
  const [guardando, setGuardando] = useState(false);
  return (
    <>
      {dar && (
        <div className="envivo-lado__guardar">
          {guardando ? (
            <GuardarEnLoMio dar={dar} titulo="Consultron de la sesión" alCerrar={() => setGuardando(false)} />
          ) : (
            <button type="button" className="boton boton--secundario boton--chico" onClick={() => setGuardando(true)}>Guardar en lo mío</button>
          )}
        </div>
      )}
      <Anuncio estado={estado} />
      <Consultron mesa={mesa} enfocar />
    </>
  );
}

/** Consultron at the side of the table. `angosta`: a narrow screen, where it comes up from the bottom over the table.
 * `alCerrar(volver)`: closes it; with `volver`, the focus goes back to its button. */
export function ConsultronAlLado({ id: idPanel, sesion, angosta, alCerrar }) {
  const propio = useId();
  const id = idPanel ?? propio;
  const caja = useRef(null);
  const { estado } = useConsultron();
  const { mesa, dar } = useHilo(sesion);
  const [guardando, setGuardando] = useState(false);

  // Its width, as beside a reader (Ancho.jsx): the same setting, under a tope that leaves the table its room.
  const [fila, setFila] = useState(0);
  useEffect(() => {
    const padre = caja.current?.parentElement;
    if (!padre) return undefined;
    const ro = new ResizeObserver(() => setFila(padre.clientWidth));
    ro.observe(padre);
    return () => ro.disconnect();
  }, []);
  const medida = useAncho({ fila, resto: MIN_MESA, contenedor: () => caja.current?.parentElement });
  // The table knows it too: its toolbar and its notices center on what is left (enVivo.css).
  useLayoutEffect(() => {
    const padre = caja.current?.parentElement;
    if (!padre || angosta) return undefined;
    padre.style.setProperty('--ancho-lado', `${medida.ancho}px`);
    return () => padre.style.removeProperty('--ancho-lado');
  }, [medida.ancho, angosta]);

  return (
    <section
      ref={caja}
      id={id}
      className="lector__consultron envivo-lado envivo-lado--consultron"
      style={angosta ? undefined : { '--ancho-consultron': `${medida.ancho}px` }}
      aria-labelledby={`${id}-t`}
      onKeyDown={(e) => {
        if (e.key !== 'Escape' || e.defaultPrevented) return;
        e.preventDefault();
        alCerrar(true);
      }}
    >
      {!angosta && <Borde de={id} medida={medida} />}
      <header className="flotante__cabeza lector__consultron-cabeza">
        <IconoMenu nombre="consultron" />
        <h2 id={`${id}-t`}>Consultron</h2>
        {!angosta && <BotonesDeAncho medida={medida} />}
        {dar && (
          <button type="button" className="flotante__accion" aria-label="Guardar en lo mío" title="Guardar en lo mío" aria-expanded={guardando} onClick={() => setGuardando((g) => !g)}>
            <Icono nombre="guardar" />
          </button>
        )}
        <button type="button" className="flotante__accion" aria-label="Cerrar Consultron" onClick={() => alCerrar(true)}>
          <Icono nombre="cerrar" />
        </button>
      </header>
      {guardando && dar && (
        <div className="envivo-lado__guardar">
          <GuardarEnLoMio dar={dar} titulo="Consultron de la sesión" alCerrar={() => setGuardando(false)} />
        </div>
      )}
      <Anuncio estado={estado} />
      <Consultron mesa={mesa} enfocar />
    </section>
  );
}

/** One answer of the thread, floating over the table: scrolls inside, closes, and leads to the whole thread. */
export function GloboConsultron({ sesion, pregunta, alCerrar, alVerTodo }) {
  const id = useId();
  const datos = useMemo(() => hiloDeLaMesa(sesion.doc), [sesion]);
  useCambios(datos);
  const e = hilo(datos).find((x) => x.id === pregunta) ?? null;
  const sinEntrada = !e;
  useEffect(() => {
    if (sinEntrada) alCerrar();
  }, [sinEntrada, alCerrar]);
  if (!e) return null;
  return (
    <section
      className="envivo-globo"
      aria-labelledby={`${id}-t`}
      onKeyDown={(ev) => {
        if (ev.key !== 'Escape') return;
        ev.stopPropagation();
        alCerrar(true);
      }}
    >
      <header className="envivo-globo__cabeza">
        <IconoMenu nombre="consultron" />
        <h2 id={`${id}-t`} className="envivo-globo__titulo">Consultron</h2>
        <button type="button" className="envivo-globo__cerrar" aria-label="Cerrar la respuesta" onClick={() => alCerrar(true)}>
          <Icono nombre="cerrar" />
        </button>
      </header>
      <div className="envivo-globo__cuerpo" tabIndex={0} role="region" aria-label="Pregunta y respuesta">
        <EntradaDeLaMesa entrada={e} mesa={sesion} nivel={3} />
      </div>
      <div className="envivo-globo__pie">
        <button type="button" className="boton boton--secundario boton--chico" onClick={alVerTodo}>Ver en Consultron</button>
      </div>
    </section>
  );
}
