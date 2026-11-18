import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { IconoMenu } from '../../layouts/Menu';
import { cargar, revisar, sePuedePreguntar, usar, useConsultron } from '../../lib/consultron/motor';
import { usePermisosNube } from '../../lib/consultron/nube';
import { Borde, BotonesDeAncho, useAncho } from './Ancho';
import Charla, { TODAS } from './Charla';
import { Anuncio, Arranque } from './Modelo';
import './consultron.css';

// What is being read keeps at least this much of the row, however wide Consultron is dragged.
const MIN_LECTURA = 440;

// Consultron beside the pages of a PDF (VisorPdf.jsx), the same talk as in the corner and in its screen. `materia`: the
// course of the PDF, where it looks first. `marcado`: what the student marked in the PDF to ask about, with its page
// and where it comes from; `alSoltar` lets go of it. `alCerrar`: the reader closes it and takes the focus back. `alIr`:
// before going to a screen from an answer (the sheet of the reader closes). `abierto`: the summary open beside it
// (VisorResumen.jsx), as adjuntar.js `documentoDeTexto`, searched first; undefined while it comes. `enResumen`: it's
// beside a summary of El Santo Resumen, and answers with it alone. `alLado`: it's beside what is read, not over it: its edge is dragged to make it
// wider or narrower, and the width stays for this device. `caja`: Consultron opens only in its box (Configuración,
// «Aparición»), down on the right over what is read.
export default function EnVisor({ materia = TODAS, marcado = null, abierto, enResumen = false, alLado = true, caja = false, alSoltar, alCerrar, alIr }) {
  const { estado } = useConsultron();
  const raiz = useRef(null);
  const idPanel = useId();
  const listo = sePuedePreguntar(estado, usePermisosNube(), { enResumen });
  // Gemini answers before the model is ready: what it takes to have it too, short, over the talk.
  const sinModelo = listo && estado.fase !== 'listo' && estado.fase !== 'no-puede';

  // Open, it's in use: it checks the computer, and the model stays on the video card.
  useEffect(() => {
    revisar();
    return usar();
  }, []);
  useEffect(() => {
    if (estado.fase === 'bajado') cargar();
  }, [estado.fase]);
  // Opening it, the focus goes to where to write. While it gets ready, to its button or its title.
  useEffect(() => {
    const el = raiz.current;
    if (!el || el.contains(document.activeElement)) return;
    (el.querySelector('textarea') ?? el.querySelector('.lector__consultron-arranque .boton') ?? el.querySelector('h3'))?.focus({ preventScroll: true });
  }, [listo]);

  // Its width (Ancho.jsx), under a tope that leaves most of the row to what is read.
  const [fila, setFila] = useState(0);
  useEffect(() => {
    const padre = raiz.current?.parentElement;
    if (!padre) return undefined;
    const ro = new ResizeObserver(() => setFila(padre.clientWidth));
    ro.observe(padre);
    return () => ro.disconnect();
  }, []);
  const medida = useAncho({ fila, resto: MIN_LECTURA, contenedor: () => raiz.current?.parentElement });
  const { ancho } = medida;
  // The row knows the width too: what it centers over the pages moves with it (lector.css).
  useLayoutEffect(() => {
    const padre = raiz.current?.parentElement;
    if (!padre || !alLado) return undefined;
    padre.style.setProperty('--ancho-consultron', `${ancho}px`);
    return () => padre.style.removeProperty('--ancho-consultron');
  }, [ancho, alLado]);

  return (
    <section ref={raiz} id={idPanel} className={caja ? 'lector__consultron lector__consultron--caja' : 'lector__consultron'} aria-labelledby="lector-consultron-titulo">
      {alLado && <Borde de={idPanel} medida={medida} />}
      <header className="flotante__cabeza lector__consultron-cabeza">
        <IconoMenu nombre="consultron" />
        <h3 id="lector-consultron-titulo" tabIndex={-1}>Consultron</h3>
        {alLado && <BotonesDeAncho medida={medida} />}
        <button type="button" className="flotante__accion" aria-label="Cerrar Consultron" onClick={alCerrar}>
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </header>
      <Anuncio estado={estado} />
      {listo ? (
        <>
          {sinModelo && (
            <div className="consultron__con-nube">
              <Arranque estado={estado} nivel={4} lugar={{ enResumen }} />
            </div>
          )}
          <Charla inicial={materia} nivel={4} compacta marcado={marcado} abierto={abierto} enResumen={enResumen} alSoltarMarcado={alSoltar} alIr={alIr} />
        </>
      ) : (
        <div className="flotante__arranque lector__consultron-arranque">
          <Arranque estado={estado} nivel={4} lugar={{ enResumen }} />
        </div>
      )}
    </section>
  );
}
