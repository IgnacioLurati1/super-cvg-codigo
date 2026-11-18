import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { colorSeguro, leerMarca, leerVista, mismaVista } from '../../../../lib/enVivo/apunte';
import { leerMarcas, marcasEnTexto } from '../../../../lib/enVivo/marcasApunte';
import { lecturaDeLaMesa, notasDeLaMesa } from '../../../../lib/enVivo/notasDeLaMesa';
import VisorPdf from '../../../VisorPdf';
import { paginaEn } from '../../../lector/geometria';
import { useDesplazamientoSuave } from '../comun';

// A PDF of the table, in the site's own reader (VisorPdf.jsx), with all it has: dark or sepia pages, zoom, find,
// notes and pages, bookmarks, reading aloud, full screen and its keys. What the table adds goes in through `compartido`:
// the highlights, notes and bookmarks are the session's (notasDeLaMesa.js, each in its author's color, in memory
// only), its view goes to the others and follows whoever is followed (gliding, comun.jsx), the others' pointers show on
// the pages, a zone of a page can be marked (a scan has no text), and the session's Consultron reads the pages in view
// and the marks. Nothing of it goes to the student's things: the reader gets no `doc`.

// What the session's Consultron reads: the page in view and the next one, up to this.
const TOPE_CONSULTRON = 6000;
const CADA_MARCA = 80;
const MIN_ZONA = 0.012;
const SIN_COLOR = '#5b5bd6';

export default function LectorCompartido({ blob, nombre, mesa }) {
  const { compartido, aviso, eventos } = usePdfDeLaMesa(mesa, { nombre });
  return (
    <div className="apunte-vivo apunte-vivo--lector" {...eventos}>
      {aviso}
      <VisorPdf blob={blob} nombre={nombre} origen={{ materia: null, apunte: nombre }} compartido={compartido} />
    </div>
  );
}

/** What the reader gets from the table (`compartido` of VisorPdf.jsx), its notice, and the handlers that tell the
 * others where the mouse points, for the box the reader is in. `resumen`: it is a summary of El Santo Resumen. */
export function usePdfDeLaMesa(mesa, { nombre, resumen = false }) {
  const ultimo = useRef(mesa);
  useLayoutEffect(() => {
    ultimo.current = mesa;
  });
  const { doc, datos } = mesa;
  const { id: yoId, nombre: yoNombre, color: yoColor } = mesa.yo;
  const yo = useMemo(() => ({ id: yoId, nombre: yoNombre, color: yoColor }), [yoId, yoNombre, yoColor]);
  const notas = useMemo(() => notasDeLaMesa(doc, datos, yo), [doc, datos, yo]);
  // The tool renders again on every change of the tab (useCambios), and the reader wants the same list while nothing
  // changed: the key says when.
  const lecturaNueva = lecturaDeLaMesa(datos, yo);
  const claveLectura = JSON.stringify(lecturaNueva);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const lectura = useMemo(() => lecturaNueva, [claveLectura]);

  // ---------- Following: where this one is, and gliding to whoever is followed ----------
  const guiaNueva = leerVista(mesa.vista);
  const claveGuia = guiaNueva ? `${guiaNueva.pagina}|${guiaNueva.y}|${guiaNueva.zoom}` : '';
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const guia = useMemo(() => guiaNueva, [claveGuia]);
  const marco = useRef(null);
  const suave = useDesplazamientoSuave(Boolean(guia), () => marco.current);
  const enviada = useRef(null);
  const [paginaVista, setPaginaVista] = useState(1);
  const mover = useCallback((v) => {
    setPaginaVista(v.pagina);
    if (mismaVista(v, enviada.current)) return;
    enviada.current = v;
    ultimo.current.mover(v);
  }, []);
  const soltar = useCallback(() => {
    suave.parar();
    if (ultimo.current.vista) ultimo.current.soltar();
  }, [suave]);
  const desplazar = useCallback((el, top) => {
    marco.current = el;
    suave.ir({ top });
  }, [suave]);

  // ---------- The text the session's Consultron reads ----------
  const [lector, alAbrir] = useState(null);
  const textoPaginas = useRef('');
  useEffect(() => {
    const l = lector;
    if (!l) return undefined;
    let vivo = true;
    const paginas = [paginaVista, paginaVista + 1].filter((n) => n <= l.total);
    Promise.all(paginas.map((n) => l.obtenerTexto(n).then((t) => t.texto.trim()).catch(() => '')))
      .then((ts) => {
        if (!vivo) return;
        const cuerpo = ts.map((t, i) => (t ? `[Página ${paginas[i]}]\n${t}` : '')).filter(Boolean).join('\n\n');
        const que = resumen ? `Resumen «${nombre}» de El Santo Resumen` : `Apunte «${nombre}»`;
        textoPaginas.current = cuerpo ? `${que}, ${l.total === 1 ? '1 página' : `${l.total} páginas`}.\n${cuerpo}`.slice(0, TOPE_CONSULTRON) : '';
      });
    return () => {
      vivo = false;
    };
  }, [lector, paginaVista, nombre, resumen]);
  const registrar = mesa.paraConsultron;
  useEffect(() => registrar(() => [textoPaginas.current, marcasEnTexto(leerMarcas(ultimo.current.datos))].filter(Boolean).join('\n\n')), [registrar]);

  // ---------- A zone of a page, for what has no text to select ----------
  const [conZona, setConZona] = useState(false);
  const [zona, setZona] = useState(null);
  const dibujo = useRef(null);
  const [aviso, setAviso] = useState('');
  const puntoEn = (e, L, caja) => {
    const x = e.clientX - caja.left;
    const y = e.clientY - caja.top;
    const i = paginaEn(L.tops, y);
    const fx = (x - L.izquierdas[i]) / L.anchos[i];
    const fy = (y - L.tops[i]) / L.altos[i];
    return { pagina: i + 1, x: Math.min(1, Math.max(0, fx)), y: Math.min(1, Math.max(0, fy)), dentro: fx >= 0 && fx <= 1 && fy >= 0 && fy <= 1 };
  };

  // ---------- Where the mouse points, for the others ----------
  const ultimaMarca = useRef(0);
  const marcarEn = (e) => {
    const hoja = e.target.closest?.('.lector__pagina');
    if (!hoja) return;
    const caja = hoja.getBoundingClientRect();
    if (!caja.width || !caja.height) return;
    const x = Math.min(1, Math.max(0, (e.clientX - caja.left) / caja.width));
    const y = Math.min(1, Math.max(0, (e.clientY - caja.top) / caja.height));
    ultimo.current.marcar({ pagina: Number(hoja.dataset.pagina), x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 });
  };
  useEffect(() => () => ultimo.current.marcar(null), []);

  const otros = mesa.otros;
  const capa = useCallback((L) => {
    const dedos = otros.flatMap((o) => {
      const m = leerMarca(o.h);
      if (!m || m.pagina > L.tops.length) return [];
      const i = m.pagina - 1;
      return [{ id: o.id, nombre: String(o.nombre ?? '').slice(0, 40) || 'Alguien', color: colorSeguro(o.color), left: L.izquierdas[i] + m.x * L.anchos[i], top: L.tops[i] + m.y * L.altos[i] }];
    });
    const z = zona && L.tops[zona.pagina - 1] !== undefined ? zona : null;
    const i = z ? z.pagina - 1 : 0;
    const terminar = () => {
      const d = dibujo.current;
      dibujo.current = null;
      setZona(null);
      if (!d) return;
      const w = Math.abs(d.x1 - d.x0);
      const h = Math.abs(d.y1 - d.y0);
      if (w <= MIN_ZONA || h <= MIN_ZONA) return;
      const ahora = Date.now();
      const ok = notas.resaltar({ id: notas.nuevoId(), pagina: d.pagina, cajas: [[Math.min(d.x0, d.x1), Math.min(d.y0, d.y1), w, h]], desde: null, hasta: null, nota: '', texto: '', creado: ahora });
      setAviso(ok ? '' : notas.sinLugar);
    };
    return (
      <>
        {conZona && (
          <div
            className="apunte-vivo__capa-zona"
            aria-hidden="true"
            onPointerDown={(e) => {
              if (e.pointerType === 'mouse' && e.button !== 0) return;
              const p = puntoEn(e, L, e.currentTarget.getBoundingClientRect());
              if (!p.dentro) return;
              e.preventDefault();
              e.currentTarget.setPointerCapture?.(e.pointerId);
              dibujo.current = { pagina: p.pagina, x0: p.x, y0: p.y, x1: p.x, y1: p.y };
              setZona({ ...dibujo.current });
            }}
            onPointerMove={(e) => {
              const d = dibujo.current;
              if (!d) return;
              const caja = e.currentTarget.getBoundingClientRect();
              const i2 = d.pagina - 1;
              d.x1 = Math.min(1, Math.max(0, (e.clientX - caja.left - L.izquierdas[i2]) / L.anchos[i2]));
              d.y1 = Math.min(1, Math.max(0, (e.clientY - caja.top - L.tops[i2]) / L.altos[i2]));
              setZona({ ...d });
            }}
            onPointerUp={terminar}
            onPointerCancel={() => {
              dibujo.current = null;
              setZona(null);
            }}
          />
        )}
        {z && (
          <span
            className="apunte-vivo__zona"
            style={{
              left: L.izquierdas[i] + Math.min(z.x0, z.x1) * L.anchos[i],
              top: L.tops[i] + Math.min(z.y0, z.y1) * L.altos[i],
              width: Math.abs(z.x1 - z.x0) * L.anchos[i],
              height: Math.abs(z.y1 - z.y0) * L.altos[i],
              '--color': colorSeguro(yo.color) ?? SIN_COLOR,
            }}
            aria-hidden="true"
          />
        )}
        {dedos.map((d) => (
          <span key={d.id} className="apunte-vivo__dedo" style={{ left: d.left, top: d.top, ...(d.color ? { '--color': d.color } : {}) }} aria-hidden="true">
            <span className="apunte-vivo__quien">{d.nombre}</span>
          </span>
        ))}
      </>
    );
  }, [otros, zona, conZona, notas, yo.color]);

  const compartido = useMemo(() => ({
    notas,
    lectura,
    color: colorSeguro(yo.color) ?? SIN_COLOR,
    guia,
    mover,
    soltar,
    desplazar,
    capa,
    barra: (
      <button type="button" className="lector__boton" aria-pressed={conZona} title="Marcar una zona" onClick={() => setConZona((z) => !z)}>
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 7V4h3M10 4h4M17 4h3v3M20 10v4M20 17v3h-3M14 20h-4M7 20H4v-3M4 14v-4" /></svg>
        <span className="solo-lectores">Marcar una zona</span>
      </button>
    ),
    alAbrir,
  }), [notas, lectura, yo.color, guia, mover, soltar, desplazar, capa, conZona, alAbrir]);

  const alMoverPuntero = (e) => {
    if (e.pointerType === 'touch') return;
    const ahora = performance.now();
    if (ahora - ultimaMarca.current < CADA_MARCA) return;
    ultimaMarca.current = ahora;
    marcarEn(e);
  };

  return {
    compartido,
    aviso: aviso && <p className="apunte-vivo__aviso apunte-vivo__aviso--barra" role="alert">{aviso}</p>,
    eventos: {
      onPointerMove: alMoverPuntero,
      onPointerDown: (e) => e.pointerType === 'touch' && marcarEn(e),
      onPointerLeave: (e) => e.pointerType !== 'touch' && ultimo.current.marcar(null),
    },
  };
}
