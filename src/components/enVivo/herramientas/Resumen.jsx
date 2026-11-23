import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { colorSeguro } from '../../../lib/enVivo/apunte';
import { pedidoDeUbicar, punteroDicho, ubicadosDichos } from '../../../lib/enVivo/punterosDelLector';
import { datosDeResumen, leerDesplazamiento, leerPunto } from '../../../lib/enVivo/resumenMesa';
import { cargarPerfil } from '../../../lib/campus';
import { borrarVinculo, TEXTOS, useVinculo } from '../../../lib/resumenes';
import { cargarBanco, FORMATOS } from '../../../lib/santoResumen';
import { useConsulta } from '../../../lib/useConsulta';
import { FORMA } from '../../../lib/verResumen';
import { MeGusta, useGustos } from '../../MeGusta';
import { useUI } from '../../ui';
import { Acciones, Fila, useConsultronDelResumen } from '../../VisorResumen';
import { usePdfDeLaMesa } from './apunte/LectorCompartido';
import { useDesplazamientoSuave } from './comun';
import { Dedos, useDedos } from './dedos';
import { useCambios } from './useCambios';
import '../../../pages/resumenes.css';
import './apunte/apunte.css';

// A summary of El Santo Resumen on the table (contract in src/lib/enVivo/herramientas.js). Each browser brings it
// itself, by its id, and shows it with the site's own viewer (VisorResumen.jsx, as in Resúmenes): a PDF in the site's
// reader with the table's marks and following (LectorCompartido.jsx), an HTML in the same frame (an interactive one in
// El Santo Resumen's reader, with its scripts), a Word or PowerPoint as its text. Following in those is how far down.

const TOPE_CONSULTRON = 12_000;
// The keys that move the page on their own, inside the summary.
const TECLAS = new Set(['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' ']);

export default function Resumen({ mesa }) {
  useCambios(mesa.datos);
  const r = datosDeResumen(mesa.datos);
  if (!r) return <p className="apunte-vivo__aviso" role="alert">Este resumen no se puede abrir.</p>;
  return FORMA[r.formato] === 'pdf' ? <ConPdf key={r.id} r={r} mesa={mesa} /> : <SinPdf key={r.id} r={r} mesa={mesa} />;
}

function ConPdf({ r, mesa }) {
  const { compartido, aviso, eventos } = usePdfDeLaMesa(mesa, { nombre: r.titulo, resumen: true });
  const enMesa = useMemo(() => ({ pdf: compartido, alListo: nada }), [compartido]);
  return (
    <div className="resumen-vivo" {...eventos}>
      {aviso}
      <ResumenEnLaMesa resumen={r} enMesa={enMesa} />
    </div>
  );
}

// How far down a box is, from 0 to 1.
const fraccionDe = (el) => {
  const alto = el.scrollHeight - el.clientHeight;
  return alto > 0 ? Math.min(1, el.scrollTop / alto) : 0;
};

function SinPdf({ r, mesa }) {
  // What the viewer's body says once it has it: the box that scrolls (null in an interactive one, of another origin)
  // and the summary's text.
  const [listo, setListo] = useState(null);
  const alListo = useCallback((l) => setListo(l), []);
  const enMesa = useMemo(() => ({ pdf: null, alListo }), [alListo]);
  const caja = listo?.caja ?? null;

  // Its text, for the session's Consultron.
  const texto = useRef('');
  useLayoutEffect(() => {
    texto.current = listo?.texto?.slice(0, TOPE_CONSULTRON) ?? '';
  });
  const registrar = mesa.paraConsultron;
  const nombre = FORMATOS[r.formato] ?? 'Google';
  useEffect(() => registrar(() => {
    if (texto.current) return `Resumen «${r.titulo}» de El Santo Resumen.\n${texto.current}`;
    return FORMA[r.formato] === 'afuera' ? `Resumen «${r.titulo}» de El Santo Resumen, un ${nombre}: su texto no está en la mesa.` : '';
  }), [registrar, r.titulo, r.formato, nombre]);

  // ---------- Following and being followed by how far down ----------
  const ultimo = useRef(mesa);
  useLayoutEffect(() => {
    ultimo.current = mesa;
  });
  const guia = leerDesplazamiento(mesa.vista);
  const y = guia?.y;
  const suave = useDesplazamientoSuave(y !== undefined, () => caja);
  useEffect(() => {
    if (!caja) return undefined;
    // A document's own scroll is heard on its window; a box's, on itself.
    const blanco = caja.ownerDocument !== document && caja === caja.ownerDocument.scrollingElement ? caja.ownerDocument.defaultView : caja;
    let enviada = null;
    const contar = () => {
      if (!caja.clientHeight) return;
      const f = Math.round(fraccionDe(caja) * 1000) / 1000;
      if (enviada !== null && Math.abs(f - enviada) < 0.01) return;
      enviada = f;
      ultimo.current.mover({ y: f });
    };
    const propio = () => {
      suave.parar();
      if (ultimo.current.vista) ultimo.current.soltar();
    };
    const alTeclear = (e) => TECLAS.has(e.key) && propio();
    blanco.addEventListener('scroll', contar, { passive: true });
    blanco.addEventListener('wheel', propio, { passive: true });
    blanco.addEventListener('touchmove', propio, { passive: true });
    blanco.addEventListener('keydown', alTeclear);
    return () => {
      blanco.removeEventListener('scroll', contar);
      blanco.removeEventListener('wheel', propio);
      blanco.removeEventListener('touchmove', propio);
      blanco.removeEventListener('keydown', alTeclear);
    };
  }, [caja, suave]);
  useEffect(() => {
    if (y === undefined || !caja || Math.abs(fraccionDe(caja) - y) < 0.01) return;
    suave.ir({ top: y * (caja.scrollHeight - caja.clientHeight) });
  }, [y, caja, suave]);

  const raiz = useMemo(() => raizDe(caja), [caja]);
  const dedos = useDedos(mesa, caja, raiz);
  const dedosDelLector = useDedosDelLector(mesa, listo?.lector ?? null);

  return (
    <div className="resumen-vivo">
      <ResumenEnLaMesa resumen={r} enMesa={enMesa} />
      {dedos}
      {dedosDelLector}
    </div>
  );
}

// ---------- Where each one points, in an HTML or Word summary ----------
// As over a PDF (LectorCompartido.jsx), anchored to the summary's content (dedos.jsx, resumenMesa.js `puntoEn`), so it lands on
// the same word with other window sizes and scrolls. A clean HTML lives in a frame of this origin with no scripts
// (VisorResumen.jsx): its pointer is heard on its document, and the others' are drawn over the frame, never into it.
// An interactive one runs in El Santo Resumen's reader, of another origin: the reader tells (useDedosDelLector).
// How long the reader of an interactive summary has to answer that the pointer left it (useDedosDelLector).
const ESPERA_SOLTAR = 1000;

// The summary's root: a clean HTML's whole document, or the text of a Word or PowerPoint.
const raizDe = (caja) => {
  if (!caja) return null;
  return caja.ownerDocument !== document ? caja.ownerDocument.documentElement : caja.querySelector('.visor__vista');
};

// The same over an interactive HTML, in El Santo Resumen's reader (`lector`, its frame, once it has the summary): no
// pointer event of it reaches here, so the reader says where this one points and where the others' land in its view
// (punterosDelLector.js). Only what comes from that frame is heard. An older reader says nothing: nothing is drawn.
function useDedosDelLector(mesa, lector) {
  const ultimo = useRef(mesa);
  useLayoutEffect(() => {
    ultimo.current = mesa;
  });
  const capa = useRef(null);
  const [dedos, setDedos] = useState([]);
  // Where the reader last placed each number, and the number each person goes by there, for as long as it lives.
  const lugares = useRef(new Map());
  const numeros = useMemo(() => (lector ? new Map() : null), [lector]);

  const dibujar = useCallback(() => {
    const l = capa.current;
    if (!lector || !l || !lector.isConnected) return;
    const base = l.getBoundingClientRect();
    const v = lector.getBoundingClientRect();
    // A point in the frame's view, in the page's.
    const dx = v.left + lector.clientLeft;
    const dy = v.top + lector.clientTop;
    setDedos(ultimo.current.otros.flatMap((o) => {
      const n = numeros.get(o.id);
      const lugar = n === undefined || !leerPunto(o.h) ? null : lugares.current.get(n);
      if (!lugar) return [];
      const x = lugar.x + dx;
      const y = lugar.y + dy;
      if (x < v.left || x > v.right || y < v.top || y > v.bottom) return [];
      return [{ id: o.id, nombre: String(o.nombre ?? '').slice(0, 40) || 'Alguien', color: colorSeguro(o.color), left: x - base.left, top: y - base.top }];
    }));
  }, [lector, numeros]);

  // This one's pointer, as the reader says it, and where it places the others'.
  useEffect(() => {
    if (!lector) return undefined;
    // The browser does not always tell a frame of another origin that the pointer left it: a move heard on this page is
    // the pointer out of the frame. The reader is told (`soltar-puntero`), and what it still had on its way is not taken
    // until its null answers, which comes after all of it. An older reader never says where the pointer is: it is never
    // told.
    let adentro = false;
    let esperando = 0;
    let marcado = false;
    const salir = () => {
      if (marcado) {
        marcado = false;
        ultimo.current.marcar(null);
      }
      if (!adentro) return;
      adentro = false;
      esperando = performance.now();
      lector.contentWindow?.postMessage({ tipo: 'soltar-puntero' }, '*');
    };
    const oir = (e) => {
      if (!lector.contentWindow || e.source !== lector.contentWindow) return;
      const punto = punteroDicho(e.data);
      if (punto !== undefined) {
        // A reader that doesn't answer in a while is not waited for.
        if (esperando && performance.now() - esperando < ESPERA_SOLTAR) {
          if (punto === null) esperando = 0;
          return;
        }
        esperando = 0;
        adentro = adentro || Boolean(punto);
        marcado = Boolean(punto);
        ultimo.current.marcar(punto);
        return;
      }
      const ubicados = ubicadosDichos(e.data);
      if (!ubicados) return;
      lugares.current = ubicados;
      dibujar();
    };
    window.addEventListener('message', oir);
    document.addEventListener('pointermove', salir, { capture: true, passive: true });
    document.addEventListener('pointerdown', salir, { capture: true, passive: true });
    // The frame moves or changes size with the table: the reader answers again on its own resize.
    const tamano = new ResizeObserver(dibujar);
    tamano.observe(lector);
    return () => {
      window.removeEventListener('message', oir);
      document.removeEventListener('pointermove', salir, { capture: true });
      document.removeEventListener('pointerdown', salir, { capture: true });
      tamano.disconnect();
      lugares.current = new Map();
      setDedos([]);
      ultimo.current.marcar(null);
    };
  }, [lector, dibujar]);

  // The others' places, to the reader each time they change. '*': its frame has no origin of its own (sandbox).
  const otros = mesa.otros;
  useEffect(() => {
    if (!lector) return;
    lector.contentWindow?.postMessage(pedidoDeUbicar(otros, numeros), '*');
    // Someone who stopped pointing leaves now, without waiting for the answer.
    dibujar();
  }, [lector, numeros, otros, dibujar]);

  if (!lector) return null;
  return <Dedos capa={capa} dedos={dedos} />;
}

const nada = () => {};

// What El Santo Resumen says of the summary, as in Resúmenes: its subject, instance and author under the title, and its
// «me gusta» with this student's linked account. Each browser reads it from the bank itself (once per tab,
// santoResumen.js), never from what another one put on the table. Not in the bank, only the subject.
function useDelBanco(r) {
  const { datos: banco } = useConsulta(() => (r.materia ? cargarBanco(r.materia) : Promise.resolve([])), [r.materia]);
  const delBanco = banco?.find((b) => b.id === r.id) ?? null;
  const conDato = delBanco ? { ...r, instancia: delBanco.instancia, autor: delBanco.autor, meGusta: delBanco.meGusta } : r;
  const dato = [r.materiaNombre, conDato.instancia, conDato.autor && `de ${conDato.autor}`].filter(Boolean).join(', ');
  return { r: { ...conDato, dato }, delBanco: Boolean(delBanco) };
}

// The «me gusta» of the student's account, as in Resúmenes: a key El Santo Resumen no longer knows is forgotten.
function GustoDeLaMesa({ r }) {
  const { avisar } = useUI();
  const { datos: perfil } = useConsulta(cargarPerfil, [], { alInstante: true });
  const alumno = perfil?.id ?? null;
  const vinculo = useVinculo(alumno);
  const cortar = (cual) => {
    borrarVinculo(alumno, cual);
    avisar(TEXTOS.cortado, 'info');
  };
  const gustos = useGustos(alumno ? vinculo?.llave ?? null : null, cortar);
  return <MeGusta r={r} gustos={gustos} />;
}

/** The summary as the site's viewer shows it (VisorResumen.jsx), without its sheet: the same bodies, frames and
 * Consultron. `enMesa`: what the table brings (VisorResumen's Pdf). */
function ResumenEnLaMesa({ resumen, enMesa }) {
  const id = useId();
  const { r, delBanco } = useDelBanco(resumen);
  const forma = FORMA[r.formato] ?? 'afuera';
  const botonConsultron = useRef(null);
  const c = useConsultronDelResumen(r, forma, botonConsultron, { enMesa: true });
  // Esc inside Consultron closes it.
  const alTeclear = (e) => {
    if (e.key !== 'Escape' || !c.conConsultron || !e.target.closest?.('.lector__consultron')) return;
    e.preventDefault();
    c.cerrarConsultron();
  };
  return (
    <section className="visor visor--mesa" aria-labelledby={`${id}-titulo`} data-forma={forma} data-consultron={c.conConsultron || undefined} onKeyDown={alTeclear}>
      <div className="visor__caja">
        <div className="visor__cabeza">
          <div className="visor__nombre">
            <h2 id={`${id}-titulo`}>{r.titulo}</h2>
            {r.dato && <p className="visor__dato">{r.dato}</p>}
          </div>
          <Acciones r={r} forma={forma} c={c} boton={botonConsultron} antes={delBanco ? <GustoDeLaMesa r={r} /> : null} />
        </div>
        <Fila r={r} forma={forma} c={c} boton={botonConsultron} alIr={nada} enMesa={enMesa} />
      </div>
    </section>
  );
}
