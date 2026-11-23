import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { TextLayer } from 'pdfjs-dist';
import { piezaEn } from '../../lib/lectura';
import { esSinDatos } from '../../lib/pdfPartes';
import { cubre, densidadDe, juntarCajas, regionVisible } from './geometria';
import { Cinta } from './Senaladores';

// Taller than this the canvas of a page is drawn with less detail: phones refuse bigger ones.
const MAX_PIXELES = 16_000_000;
// On a touch screen a whole page gets at most twice the pixels of the screen (and never less than this): zoomed in, a
// few pages of 16 million pixels choke a phone. The part in view is drawn again on top, sharp (the detail).
const MIN_TACTIL = 3_000_000;
// Around the part in view, the detail also draws this much of the view's size on each side.
const MARGEN_DETALLE = 0.15;
// How long the scroll stays still before the detail of the part in view is drawn.
const QUIETO_MS = 120;

const densidadPantalla = () => Math.min(window.devicePixelRatio || 1, 3);
const pixelesPantalla = () => (window.screen?.width || window.innerWidth) * (window.screen?.height || window.innerHeight) * densidadPantalla() ** 2;
const tactil = () => window.matchMedia?.('(pointer: coarse)').matches ?? false;
const topeHoja = () => (tactil() ? Math.min(MAX_PIXELES, Math.max(MIN_TACTIL, 2 * pixelesPantalla())) : MAX_PIXELES);
const topeDetalle = () => Math.min(MAX_PIXELES, Math.max(MIN_TACTIL, 2 * pixelesPantalla()));
// The text of a page is laid out at this scale (a page at its printed size, in CSS pixels per point) and its layer is
// scaled to the page's. Its size is rounded finely: scaled up, a whole pixel would put it off the drawing.
const ESCALA_TEXTO = 96 / 72;
const ESTILO_TEXTO = { '--total-scale-factor': ESCALA_TEXTO, '--scale-round-x': '0.01px', '--scale-round-y': '0.01px' };
// Without a line of drawings (a page alone), right away.
const SIN_COLA = { pedir: (numero, correr) => { correr(); return () => {}; } };

const porciento = (n) => `${(n * 100).toFixed(3)}%`;
const estiloCaja = ([x, y, w, h]) => ({ left: porciento(x), top: porciento(y), width: porciento(w), height: porciento(h) });

/** Boxes from 0 to 1 of a page for a DOM range of its text. */
export function cajasDeRango(rango, pagina) {
  const caja = pagina.getBoundingClientRect();
  if (!caja.width || !caja.height) return [];
  const cajas = [...rango.getClientRects()]
    .filter((r) => r.width > 0.5 && r.height > 0.5 && r.height < caja.height * 0.2)
    .map((r) => [(r.left - caja.left) / caja.width, (r.top - caja.top) / caja.height, r.width / caja.width, r.height / caja.height]);
  return juntarCajas(cajas);
}

/** The DOM range of a place of the page's text ([desde, hasta)), or null. */
export function rangoDeTexto(registro, desde, hasta) {
  const { divs, inicios, largo } = registro;
  const punto = (lugar, alFinal) => {
    const i = piezaEn(inicios, Math.min(lugar, largo));
    for (let j = i; j >= 0 && j < divs.length; j += alFinal ? -1 : 1) {
      const nodo = divs[j]?.firstChild;
      if (nodo?.nodeType === 3 && divs[j].isConnected) return [nodo, Math.max(0, Math.min(nodo.length, j === i ? lugar - inicios[j] : alFinal ? nodo.length : 0))];
    }
    return null;
  };
  const a = punto(desde, false);
  const b = punto(hasta, true);
  if (!a || !b) return null;
  const rango = document.createRange();
  try {
    rango.setStart(...a);
    rango.setEnd(...b);
  } catch {
    return null;
  }
  return rango;
}

/** The place in the page's text of a point of the DOM, for a selection. */
export function lugarDe(registro, nodo, offset) {
  const { divs, inicios, indice, largo } = registro;
  const span = nodo.nodeType === 3 ? nodo.parentElement : nodo;
  if (indice.has(span)) {
    const i = indice.get(span);
    return inicios[i] + (nodo.nodeType === 3 ? offset : offset > 0 ? (divs[i].textContent ?? '').length : 0);
  }
  // A point between pieces: the start of the next one that has text.
  const hijos = [...(span?.childNodes ?? [])];
  for (const hijo of hijos.slice(offset)) if (indice.has(hijo)) return inicios[indice.get(hijo)];
  return largo;
}

// Takes away the detail drawn on a page, freeing its pixels.
function sacarDetalle(detalle) {
  const d = detalle.current;
  if (!d) return;
  detalle.current = null;
  d.canvas.remove();
  d.canvas.width = 0;
}

// What a page shows once it is near the view: its drawing, its text (to select it and find in it, invisible) and the
// matches of the search. Leaving the view, it goes away with all of it, so a long PDF does not fill the memory.
// The drawings go through `cola` (cola.js): one at a time, the pages in view first.
// For a PDF coming by parts (VisorPdf.jsx): `alMedir(numero, ancho, alto)` gets the size of the page at scale 1;
// `esperarDatos(promesa)` stops waiting when the data isn't here and there is no connection (then the page says so,
// and lets the next one draw), and a new `vuelta` (the connection came back) draws it again.
function Dibujo({ pdf, numero, escala, cola = SIN_COLA, obtenerTexto, registrar, hallazgos, actual, fuente, onUbicar, alMedir = null, esperarDatos = null, vuelta = 0 }) {
  const lienzo = useRef(null);
  const capa = useRef(null);
  const marcas = useRef(null);
  const registroPropio = useRef(null);
  const dibujada = useRef(false);
  // The whole drawing shown: its scale, and whether it has fewer pixels than the screen asks (then the detail).
  const hecha = useRef(null);
  // The detail shown: { canvas, region, escala }.
  const detalle = useRef(null);
  const revisarDetalle = useRef(() => {});
  const ubicada = useRef(null);
  const [listo, setListo] = useState(false);
  const [conTexto, setConTexto] = useState(false);
  const [sinDatos, setSinDatos] = useState(false);
  // Read when drawn: a new one (or none, once the whole file is here) doesn't draw the page again.
  const medir = useRef(alMedir);
  const esperar = useRef(esperarDatos);
  useEffect(() => {
    medir.current = alMedir;
    esperar.current = esperarDatos;
  });

  // The drawing, sharp on any screen; again a moment after the size changes, with the old one stretched meanwhile.
  useEffect(() => {
    let vivo = true;
    let tarea = null;
    let sacar = null;
    const dibujar = async () => {
      sacar = null;
      const conDatos = (promesa) => (esperar.current ? esperar.current(promesa) : promesa);
      try {
        const hoja = await conDatos(pdf.getPage(numero));
        if (!vivo) return;
        if (medir.current) {
          const uno = hoja.getViewport({ scale: 1 });
          medir.current(numero, uno.width, uno.height);
        }
        const base = hoja.getViewport({ scale: escala });
        const quiero = densidadPantalla();
        const densidad = densidadDe(base.width, base.height, quiero, topeHoja());
        const vista = hoja.getViewport({ scale: escala * densidad });
        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(vista.width);
        canvas.height = Math.floor(vista.height);
        canvas.className = 'lector__lienzo';
        tarea = hoja.render({ canvas, viewport: vista });
        await conDatos(tarea.promise);
        if (!vivo) {
          canvas.width = 0;
          return;
        }
        setSinDatos(false);
        const viejo = lienzo.current.querySelector('.lector__lienzo');
        if (viejo) {
          viejo.replaceWith(canvas);
          viejo.width = 0;
        } else lienzo.current.prepend(canvas);
        dibujada.current = true;
        hecha.current = { escala, falta: densidad < quiero * 0.9 };
        if (!hecha.current.falta) sacarDetalle(detalle);
        setListo(true);
        revisarDetalle.current();
      } catch (e) {
        // Cancelled because the size changed or it left the view; a broken page stays white. One whose data isn't here
        // without connection says so.
        if (esSinDatos(e)) {
          tarea?.cancel();
          if (vivo) setSinDatos(true);
        }
      }
    };
    const espera = setTimeout(() => {
      sacar = cola.pedir(numero, dibujar);
    }, dibujada.current ? 160 : 0);
    return () => {
      vivo = false;
      clearTimeout(espera);
      sacar?.();
      tarea?.cancel();
    };
  }, [pdf, numero, escala, cola, vuelta]);

  // Zoomed in on a phone the whole drawing has fewer pixels than the screen: the part in view is drawn on top with the
  // screen's, once the scroll stays still. The old one stays, stretched, until the new one is there.
  useEffect(() => {
    const el = lienzo.current;
    const marco = el.closest('.lector__marco');
    if (!marco) return undefined;
    let vivo = true;
    let tarea = null;
    let sacar = null;
    let reloj = 0;
    const enVista = () => {
      // In the middle of a pinch the pages are scaled: the part in view is measured once it ends.
      if (el.closest('.lector__paginas')?.style.transform) return null;
      return { pagina: el.getBoundingClientRect(), vista: marco.getBoundingClientRect() };
    };
    const dibujarDetalle = async () => {
      sacar = null;
      const medida = enVista();
      if (!vivo || !medida || hecha.current?.escala !== escala) return;
      const region = regionVisible(medida.pagina, medida.vista, MARGEN_DETALLE);
      if (!region) return;
      try {
        const hoja = await pdf.getPage(numero);
        if (!vivo) return;
        const base = hoja.getViewport({ scale: escala });
        const densidad = densidadDe((region[2] - region[0]) * base.width, (region[3] - region[1]) * base.height, densidadPantalla(), topeDetalle());
        const vista = hoja.getViewport({ scale: escala * densidad });
        const x0 = Math.floor(region[0] * vista.width);
        const y0 = Math.floor(region[1] * vista.height);
        const x1 = Math.ceil(region[2] * vista.width);
        const y1 = Math.ceil(region[3] * vista.height);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, x1 - x0);
        canvas.height = Math.max(1, y1 - y0);
        canvas.className = 'lector__detalle';
        Object.assign(canvas.style, {
          left: porciento(x0 / vista.width),
          top: porciento(y0 / vista.height),
          width: porciento(canvas.width / vista.width),
          height: porciento(canvas.height / vista.height),
        });
        tarea = hoja.render({ canvas, viewport: vista, transform: [1, 0, 0, 1, -x0, -y0] });
        await tarea.promise;
        if (!vivo || hecha.current?.escala !== escala || !hecha.current.falta) {
          canvas.width = 0;
          return;
        }
        sacarDetalle(detalle);
        el.append(canvas);
        detalle.current = { canvas, region: [x0 / vista.width, y0 / vista.height, x1 / vista.width, y1 / vista.height], escala };
      } catch {
        // Cancelled: the view moved again or the page left it.
      }
    };
    const revisar = () => {
      reloj = 0;
      if (!vivo || sacar || hecha.current?.escala !== escala || !hecha.current.falta) return;
      const medida = enVista();
      const visto = medida && regionVisible(medida.pagina, medida.vista);
      const d = detalle.current;
      if (!visto || (d && d.escala === escala && cubre(d.region, visto))) return;
      tarea?.cancel();
      sacar = cola.pedir(numero, dibujarDetalle, 0.5);
    };
    const alMover = () => {
      clearTimeout(reloj);
      reloj = setTimeout(revisar, QUIETO_MS);
    };
    revisarDetalle.current = alMover;
    marco.addEventListener('scroll', alMover, { passive: true });
    alMover();
    return () => {
      vivo = false;
      clearTimeout(reloj);
      sacar?.();
      tarea?.cancel();
      revisarDetalle.current = () => {};
      marco.removeEventListener('scroll', alMover);
    };
  }, [pdf, numero, escala, cola]);

  useEffect(() => {
    const el = lienzo.current;
    return () => {
      for (const c of el.querySelectorAll('canvas')) c.width = 0;
      el.replaceChildren();
    };
  }, []);

  // The text, once and at a fixed size (ESCALA_TEXTO): the zoom only scales its layer, so zooming never lays out each
  // piece of text again.
  useEffect(() => {
    let vivo = true;
    let tl = null;
    const el = capa.current;
    (async () => {
      try {
        const [hoja, texto] = await Promise.all([pdf.getPage(numero), obtenerTexto(numero)]);
        if (!vivo) return;
        // Built out of the page and put in it at once: pdf.js measures each piece with a canvas of the document, and
        // with the pieces going into the page one by one, each measure laid out the whole document again.
        const borrador = document.createElement('div');
        tl = new TextLayer({ textContentSource: texto.contenido, container: borrador, viewport: hoja.getViewport({ scale: ESCALA_TEXTO }) });
        await tl.render();
        if (!vivo) return;
        el.style.width = borrador.style.width;
        el.style.height = borrador.style.height;
        el.style.setProperty('--min-font-size', borrador.style.getPropertyValue('--min-font-size'));
        el.replaceChildren(...borrador.childNodes);
        const fin = document.createElement('div');
        fin.className = 'endOfContent';
        el.append(fin);
        const divs = tl.textDivs;
        registroPropio.current = { capa: el, fin, divs, inicios: texto.inicios, largo: texto.texto.length, indice: new Map(divs.map((d, i) => [d, i])) };
        registrar(numero, registroPropio.current);
        setConTexto(true);
      } catch {
        // Without its text a page is still seen; it just can't be selected.
      }
    })();
    return () => {
      vivo = false;
      tl?.cancel();
      registroPropio.current = null;
      registrar(numero, null);
      el.replaceChildren();
    };
  }, [pdf, numero, obtenerTexto, registrar]);

  // The matches of the search, measured on the text, and the one chosen put in view. The piece of a source of
  // Consultron, marked like a highlighter with a line at its side, and put in view once.
  useLayoutEffect(() => {
    const el = marcas.current;
    const registro = registroPropio.current;
    if (!conTexto || !registro || (!hallazgos.length && !fuente)) {
      el.replaceChildren();
      return;
    }
    const pagina = el.closest('.lector__pagina');
    const piezas = [];
    const rangoFuente = fuente ? rangoDeTexto(registro, fuente.desde, fuente.hasta) : null;
    const cajasFuente = rangoFuente ? cajasDeRango(rangoFuente, pagina) : [];
    if (cajasFuente.length) {
      for (const c of cajasFuente) {
        const m = document.createElement('span');
        m.className = 'lector__fuente';
        Object.assign(m.style, estiloCaja(c));
        piezas.push(m);
      }
      const arriba = Math.min(...cajasFuente.map((c) => c[1]));
      const abajo = Math.max(...cajasFuente.map((c) => c[1] + c[3]));
      const izquierda = Math.min(...cajasFuente.map((c) => c[0]));
      const borde = document.createElement('span');
      borde.className = 'lector__fuente-borde';
      Object.assign(borde.style, estiloCaja([Math.max(0, izquierda - 0.018), arriba, 0.006, abajo - arriba]));
      piezas.push(borde);
      if (ubicada.current !== fuente.clave) {
        ubicada.current = fuente.clave;
        onUbicar(numero, [izquierda, arriba]);
      }
    }
    for (const h of hallazgos) {
      const rango = rangoDeTexto(registro, h.desde, h.hasta);
      const cajas = rango ? cajasDeRango(rango, pagina) : [];
      const esta = actual && h.desde === actual.desde;
      for (const c of cajas) {
        const m = document.createElement('span');
        m.className = esta ? 'lector__hallazgo lector__hallazgo--actual' : 'lector__hallazgo';
        Object.assign(m.style, estiloCaja(c));
        piezas.push(m);
      }
      if (esta && cajas.length && ubicada.current !== actual.clave) {
        ubicada.current = actual.clave;
        onUbicar(numero, cajas[0]);
      }
    }
    el.replaceChildren(...piezas);
  }, [hallazgos, actual, fuente, conTexto, numero, onUbicar]);

  return (
    <>
      <div ref={lienzo} className="lector__dibujo" />
      {!listo && !sinDatos && <div className="lector__hoja-esperando" aria-hidden="true"><i /><i /><i /><i /></div>}
      {!listo && sinDatos && <div className="lector__hoja-sin-datos" role="status"><p>Esta página no quedó guardada. Abrila con internet.</p></div>}
      <div ref={marcas} className="lector__marcas" aria-hidden="true" />
      <div ref={capa} className="textLayer" style={{ ...ESTILO_TEXTO, transform: `scale(${escala / ESCALA_TEXTO})` }} />
    </>
  );
}


/** One page of the reader, in its place: the paper, the student's highlights and bookmark and, near the view, its
 * drawing. */
function Pagina({ numero, total, top, left, ancho, alto, escala, cerca, resaltados, abierto, destello, senalada = false, ...dibujo }) {
  return (
    <div
      className="lector__pagina"
      data-pagina={numero}
      role="group"
      aria-label={`Página ${numero} de ${total}${senalada ? ', señalada' : ''}`}
      style={{ top, left, width: ancho, height: alto }}
    >
      {cerca && <Dibujo numero={numero} escala={escala} {...dibujo} />}
      {senalada && <Cinta className="lector__cinta" />}
      {resaltados.length > 0 && (
        <div className="lector__resaltados" aria-hidden="true">
          {resaltados.flatMap((r) => r.cajas.map((c, i) => (
            <span
              key={`${r.id}-${i}-${destello?.id === r.id ? destello.vez : 0}`}
              className={`lector__resaltado lector__resaltado--${r.autor ? 'autor' : r.color}${abierto === r.id ? ' lector__resaltado--abierto' : ''}${destello?.id === r.id ? ' lector__resaltado--destello' : ''}`}
              style={r.autor ? { ...estiloCaja(c), '--autor': r.autor.color } : estiloCaja(c)}
            />
          )))}
        </div>
      )}
    </div>
  );
}

export default memo(Pagina);
