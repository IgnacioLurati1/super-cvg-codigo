import { useCallback, useEffect, useRef, useState } from 'react';
import { cambiarAjustes, useAjustes } from '../../lib/ajustes';
import { cargarVoces, crearLectura, elegirVoz, partirTexto, siguienteVelocidad, textoVelocidad } from '../../lib/voz';

// Reading the PDF aloud, with the device's own voices only (voz.js). What is selected, or from the page in view to the
// end. The text comes from pdf.js, as for finding, and stays in memory: nothing of it is kept or sent.

const TRAZOS = {
  voz: 'M4 9.5h3.5L12 6v12l-4.5-3.5H4zM15.5 9.2a4 4 0 0 1 0 5.6M18.2 6.6a7.8 7.8 0 0 1 0 10.8',
  pausa: 'M9 6.5v11M15 6.5v11',
  seguir: 'M8.5 6v12l9.5-6z',
  parar: 'M7 7h10v10H7z',
};
const Trazo = ({ nombre }) => <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d={TRAZOS[nombre]} /></svg>;

const AVISOS = {
  sinLector: 'Este navegador no lee en voz alta. Probá con otro.',
  sinVoz: 'Tu dispositivo no tiene una voz en castellano para leer. Podés sumar una en la configuración del sistema.',
  sinTexto: 'No hay texto para leer desde esta página. Si es un escaneo, no se puede leer en voz alta.',
  error: 'Se cortó la lectura en voz alta. Probá de nuevo.',
};

// A selection taken when the button is pressed lasts this long: on a phone, the touch on the button may clear it.
const SELECCION_MS = 1500;

const sintetizador = () => (typeof window !== 'undefined' && window.speechSynthesis && typeof window.SpeechSynthesisUtterance === 'function' ? window.speechSynthesis : null);

/** The reading of one reader. `paginas`: the box of the pages (where a selection counts); `marco`: where the focus goes
 * back when the bar goes away with it; `paginaActual()`: the page in view; `irAPagina(n)`: so the view follows it. */
export function useVoz({ pdf, total, obtenerTexto, paginaActual, irAPagina, paginas, marco }) {
  const { velocidadVoz } = useAjustes();
  const [lectura, setLectura] = useState({ estado: null, pagina: null, seleccion: false });
  const [aviso, setAviso] = useState(null);
  const actual = useRef(null);
  const preparando = useRef(false);
  const tomada = useRef(null);
  // Changes when the reader closes or the file changes: what was getting ready by then does not start.
  const vida = useRef(0);

  useEffect(() => {
    const v = vida;
    return () => {
      v.current++;
      actual.current?.parar();
      actual.current = null;
    };
  }, [pdf]);

  const seleccionDeAhora = useCallback(() => {
    const sel = document.getSelection();
    if (!sel?.rangeCount || sel.isCollapsed) return null;
    const rango = sel.getRangeAt(0);
    if (!paginas.current?.contains(rango.commonAncestorContainer)) return null;
    const texto = sel.toString();
    if (!/[\p{L}\p{N}]/u.test(texto)) return null;
    const nodo = rango.startContainer.nodeType === 3 ? rango.startContainer.parentElement : rango.startContainer;
    return { texto, pagina: Number(nodo?.closest?.('.lector__pagina')?.dataset.pagina) || null };
  }, [paginas]);

  const empezar = async () => {
    if (actual.current || preparando.current) return;
    const synth = sintetizador();
    if (!synth) {
      setAviso('sinLector');
      return;
    }
    const guardada = tomada.current && Date.now() - tomada.current.vez < SELECCION_MS ? tomada.current : null;
    tomada.current = null;
    const seleccion = seleccionDeAhora() ?? guardada;
    const desde = Math.min(total, Math.max(1, paginaActual()));
    const miVida = vida.current;
    setAviso(null);
    preparando.current = true;
    let voces = [];
    try {
      voces = await cargarVoces(synth);
    } catch {
      // A browser that fails to list them: as if it had none.
    } finally {
      preparando.current = false;
    }
    const voz = elegirVoz(voces);
    if (miVida !== vida.current) return;
    // Without a voice of the device nothing is said: the browser would take any, a remote one too.
    if (!voz) {
      setAviso('sinVoz');
      return;
    }

    let hubo = false;
    let n = desde - 1;
    const siguiente = seleccion
      ? async () => {
        if (n === Infinity) return null;
        n = Infinity;
        const tramos = partirTexto(seleccion.texto);
        hubo = tramos.length > 0;
        return { pagina: seleccion.pagina, tramos };
      }
      : async () => {
        n++;
        if (n > total) return null;
        // The next one, ready before it's needed.
        if (n < total) obtenerTexto(n + 1).catch(() => {});
        let tramos = [];
        try {
          tramos = partirTexto((await obtenerTexto(n)).texto);
        } catch {
          // A page that can't be read: on to the next one.
        }
        if (tramos.length) hubo = true;
        return { pagina: n, tramos };
      };

    const esta = crearLectura({
      synth,
      velocidad: velocidadVoz,
      siguiente,
      decir: (texto, rapidez) => {
        const dicho = new window.SpeechSynthesisUtterance(texto);
        dicho.voice = voz;
        dicho.lang = voz.lang;
        dicho.rate = rapidez;
        return dicho;
      },
      alCambiar: ({ estado, pagina, error, terminada }) => {
        if (actual.current !== esta) return;
        if (estado === null) {
          actual.current = null;
          // The bar goes: the focus that was in it goes back to the pages.
          if (document.activeElement?.closest?.('.lector__voz')) marco.current?.focus({ preventScroll: true });
          if (error) setAviso('error');
          else if (terminada && !hubo) setAviso('sinTexto');
        }
        setLectura({ estado, pagina: pagina ?? seleccion?.pagina ?? desde, seleccion: Boolean(seleccion) });
      },
    });
    actual.current = esta;
    esta.empezar();
  };

  // The view goes with the page being read when it moves on to another one (and not on a pause: the student may be
  // looking elsewhere).
  const seguida = useRef(null);
  useEffect(() => {
    if (!lectura.estado || lectura.seleccion) {
      seguida.current = null;
      return;
    }
    if (lectura.pagina === seguida.current) return;
    const primera = seguida.current === null;
    seguida.current = lectura.pagina;
    if (!primera && paginaActual() !== lectura.pagina) irAPagina(lectura.pagina);
  }, [lectura.estado, lectura.pagina, lectura.seleccion, paginaActual, irAPagina]);

  const activa = lectura.estado !== null;
  const parar = () => actual.current?.parar();
  const pausarOSeguir = () => (lectura.estado === 'pausa' ? actual.current?.seguir() : actual.current?.pausar());

  return {
    activa,
    estado: lectura.estado,
    pagina: lectura.pagina,
    seleccion: lectura.seleccion,
    total,
    aviso,
    velocidad: velocidadVoz,
    /** L: starts, and then pauses or goes on. */
    alternar: () => (activa ? pausarOSeguir() : empezar()),
    /** The button of the bar: starts, or stops. */
    alternarBoton: () => (activa ? parar() : empezar()),
    pausarOSeguir,
    parar,
    cerrarAviso: () => {
      // Its button goes with it: the focus goes back to the pages.
      if (document.activeElement?.closest?.('.lector__aviso')) marco.current?.focus({ preventScroll: true });
      setAviso(null);
    },
    /** Esc: stops the reading, or takes away its notice. False when there was nothing. */
    cerrar: () => {
      if (activa) parar();
      else if (aviso) setAviso(null);
      else return false;
      return true;
    },
    cambiarVelocidad: () => {
      const v = siguienteVelocidad(velocidadVoz);
      cambiarAjustes({ velocidadVoz: v });
      actual.current?.velocidad(v);
    },
    tomarSeleccion: () => {
      const s = seleccionDeAhora();
      tomada.current = s ? { ...s, vez: Date.now() } : null;
    },
  };
}

/** Its button, for the reader's bar. */
export function BotonVoz({ voz, atajo }) {
  return (
    <button
      type="button"
      className="lector__boton"
      aria-pressed={voz.activa}
      aria-keyshortcuts={voz.activa ? undefined : atajo}
      title="Leer en voz alta"
      onPointerDown={voz.tomarSeleccion}
      onClick={voz.alternarBoton}
    >
      <Trazo nombre="voz" /><span className="solo-lectores">Leer en voz alta</span>
    </button>
  );
}

/** While it reads, under the reader's bar: where it is, pause or go on, the speed and stop. Or why it didn't read. */
export function BarraVoz({ voz, atajo }) {
  if (voz.aviso && !voz.activa) {
    return (
      <div className="lector__aviso" role="status">
        <p>{AVISOS[voz.aviso]}</p>
        <button type="button" className="boton boton--secundario boton--chico" onClick={voz.cerrarAviso}>Entendido</button>
      </div>
    );
  }
  if (!voz.activa) return null;
  const pausa = voz.estado === 'pausa';
  let donde;
  if (voz.seleccion) donde = pausa ? 'Pausaste lo que seleccionaste' : 'Leyendo lo que seleccionaste';
  else donde = `${pausa ? 'Pausaste en' : 'Leyendo'} la página ${voz.pagina} de ${voz.total}`;
  return (
    <div className="lector__voz" role="group" aria-label="Lectura en voz alta">
      <p className="lector__voz-donde">{donde}</p>
      <button type="button" className="lector__boton" aria-label={pausa ? 'Seguir' : 'Pausar'} aria-keyshortcuts={atajo} title={pausa ? 'Seguir' : 'Pausar'} onClick={voz.pausarOSeguir}>
        <Trazo nombre={pausa ? 'seguir' : 'pausa'} />
      </button>
      <button type="button" className="lector__zoom lector__voz-velocidad" title="Cambiar la velocidad" onClick={voz.cambiarVelocidad}>
        <span className="solo-lectores">Velocidad </span>{textoVelocidad(voz.velocidad)}
      </button>
      <button type="button" className="lector__boton" aria-label="Parar" aria-keyshortcuts="Escape" title="Parar" onClick={voz.parar}>
        <Trazo nombre="parar" />
      </button>
    </div>
  );
}
