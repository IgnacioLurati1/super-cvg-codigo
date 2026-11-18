import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { colorSeguro } from '../../../lib/enVivo/apunte';
import { leerPunto, letraEn, lugarDe, puntoEn } from '../../../lib/enVivo/resumenMesa';
import './apunte/apunte.css';

// Where each one points over a tab of HTML content (an HTML or Word summary, a calculator), anchored to that content
// (resumenMesa.js `puntoEn`): the path of elements from `raiz` and where in its box, so it lands on the same field or
// word with other window sizes and scrolls. `caja` is the box that scrolls; its rect is what is in sight. Content in a
// frame of this origin (a clean HTML) is heard on its document, and the others' are drawn over the frame, never into it.
const CADA_MARCA = 80;

export function useDedos(mesa, caja, raiz) {
  const ultimo = useRef(mesa);
  useLayoutEffect(() => {
    ultimo.current = mesa;
  });
  // This one's pointer, for the others.
  useEffect(() => {
    if (!raiz) return undefined;
    const doc = raiz.ownerDocument;
    const enMarco = doc !== document;
    const oido = enMarco ? doc : raiz;
    const blanco = enMarco ? doc.defaultView : caja;
    let ultima = 0;
    let tarde = null;
    let donde = null;
    const marcar = () => {
      clearTimeout(tarde);
      tarde = null;
      ultima = performance.now();
      if (!donde) return;
      const { x, y } = donde;
      const objetivo = doc.elementFromPoint(x, y);
      ultimo.current.marcar(objetivo ? puntoEn(raiz, objetivo, x, y, letraEn(doc, x, y)) : null);
    };
    // At most every CADA_MARCA, and the last place always.
    const pronto = () => {
      const falta = CADA_MARCA - (performance.now() - ultima);
      if (falta <= 0) marcar();
      else if (!tarde) tarde = setTimeout(marcar, falta);
    };
    const alMover = (e) => {
      if (e.pointerType === 'touch') return;
      donde = { x: e.clientX, y: e.clientY };
      pronto();
    };
    const alTocar = (e) => {
      if (e.pointerType !== 'touch') return;
      donde = { x: e.clientX, y: e.clientY };
      marcar();
    };
    const alSalir = (e) => {
      if (e.pointerType === 'touch' || (enMarco && e.relatedTarget)) return;
      donde = null;
      clearTimeout(tarde);
      tarde = null;
      ultimo.current.marcar(null);
    };
    // Scrolling under a still pointer moves it over other content.
    const alDesplazar = () => donde && pronto();
    oido.addEventListener('pointermove', alMover, { passive: true });
    oido.addEventListener('pointerdown', alTocar, { passive: true });
    oido.addEventListener(enMarco ? 'pointerout' : 'pointerleave', alSalir);
    blanco.addEventListener('scroll', alDesplazar, { passive: true });
    return () => {
      clearTimeout(tarde);
      oido.removeEventListener('pointermove', alMover);
      oido.removeEventListener('pointerdown', alTocar);
      oido.removeEventListener(enMarco ? 'pointerout' : 'pointerleave', alSalir);
      blanco.removeEventListener('scroll', alDesplazar);
      ultimo.current.marcar(null);
    };
  }, [raiz, caja]);

  // The others', drawn over the summary while their place is in sight here.
  const capa = useRef(null);
  const [dedos, setDedos] = useState([]);
  const otros = mesa.otros;
  useEffect(() => {
    if (!raiz) return undefined;
    const doc = raiz.ownerDocument;
    const marco = doc !== document ? doc.defaultView?.frameElement ?? null : null;
    const visible = marco ?? caja;
    const blanco = marco ? doc.defaultView : caja;
    let cuadro = null;
    const medir = () => {
      cuadro = null;
      const l = capa.current;
      if (!l || !visible.isConnected) return;
      const base = l.getBoundingClientRect();
      const v = visible.getBoundingClientRect();
      // A point in the frame's window, in the page's.
      const dx = marco ? v.left + marco.clientLeft : 0;
      const dy = marco ? v.top + marco.clientTop : 0;
      setDedos(otros.flatMap((o) => {
        const p = leerPunto(o.h);
        const lugar = p && lugarDe(raiz, p);
        if (!lugar) return [];
        const x = lugar.x + dx;
        const y = lugar.y + dy;
        if (x < v.left || x > v.right || y < v.top || y > v.bottom) return [];
        return [{ id: o.id, nombre: String(o.nombre ?? '').slice(0, 40) || 'Alguien', color: colorSeguro(o.color), left: x - base.left, top: y - base.top }];
      }));
    };
    const pedir = () => {
      if (!cuadro) cuadro = requestAnimationFrame(medir);
    };
    pedir();
    blanco.addEventListener('scroll', pedir, { passive: true });
    const tamano = new ResizeObserver(pedir);
    tamano.observe(visible);
    // A frame's content reflows with the frame; a Word's text can change on its own.
    if (!marco) tamano.observe(raiz);
    return () => {
      cancelAnimationFrame(cuadro);
      blanco.removeEventListener('scroll', pedir);
      tamano.disconnect();
    };
  }, [raiz, caja, otros]);

  if (!raiz) return null;
  return <Dedos capa={capa} dedos={dedos} />;
}

// The layer over the summary with the others' pointers: { id, nombre, color, left, top } in its space.
export function Dedos({ capa, dedos }) {
  return (
    <div ref={capa} className="resumen-vivo__dedos" aria-hidden="true">
      {dedos.map((d) => (
        <span key={d.id} className="apunte-vivo__dedo" style={{ left: d.left, top: d.top, ...(d.color ? { '--color': d.color } : {}) }}>
          <span className="apunte-vivo__quien">{d.nombre}</span>
        </span>
      ))}
    </div>
  );
}
