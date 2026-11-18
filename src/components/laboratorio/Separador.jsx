import { useRef, useState } from 'react';

// The edge between two parts of the lab, which changes the size of one of them (the WAI-ARIA window splitter): dragged
// with the pointer, or from the keyboard with the arrows (16 pixels, 64 with Shift) and Home and End. Enter hides the
// part or brings it back, and so does dragging it almost to nothing. A double click gives it its size of always.
//   `eje`: 'x' (the files, on the left) or 'y' (the panel, under the code, which grows upwards).
//   `alCambiar(medida, final)`: while dragging (final false) and once let go or with a key (true).

const PASO = 16;

export default function Separador({ eje, etiqueta, controla, medida, min, max, porDefecto, oculto, alCambiar, alAlternar }) {
  const [arrastrando, setArrastrando] = useState(false);
  const borde = useRef(null);
  const acotar = (v) => Math.round(Math.min(max, Math.max(min, v)));

  const empezar = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const el = borde.current;
    el.setPointerCapture(e.pointerId);
    const desde = eje === 'x' ? e.clientX : e.clientY;
    const inicial = oculto ? 0 : medida;
    let crudo = inicial;
    setArrastrando(true);
    const mover = (ev) => {
      const ahora = eje === 'x' ? ev.clientX : ev.clientY;
      crudo = inicial + (eje === 'x' ? ahora - desde : desde - ahora);
      if (crudo >= min / 2) alCambiar(acotar(crudo), false);
    };
    const soltar = () => {
      el.removeEventListener('pointermove', mover);
      el.removeEventListener('pointerup', soltar);
      el.removeEventListener('pointercancel', soltar);
      setArrastrando(false);
      if (crudo < min / 2) {
        if (!oculto) alAlternar(true);
        alCambiar(medida, true);
      } else {
        if (oculto) alAlternar(false);
        alCambiar(acotar(crudo), true);
      }
    };
    el.addEventListener('pointermove', mover);
    el.addEventListener('pointerup', soltar);
    el.addEventListener('pointercancel', soltar);
  };

  const tecla = (e) => {
    const paso = e.shiftKey ? PASO * 4 : PASO;
    const crece = eje === 'x' ? 'ArrowRight' : 'ArrowUp';
    const achica = eje === 'x' ? 'ArrowLeft' : 'ArrowDown';
    if (e.key === 'Enter') {
      e.preventDefault();
      alAlternar(!oculto);
      return;
    }
    const nuevo = { [crece]: medida + paso, [achica]: medida - paso, Home: min, End: max }[e.key];
    if (nuevo === undefined) return;
    e.preventDefault();
    if (oculto) alAlternar(false);
    alCambiar(acotar(nuevo), true);
  };

  return (
    <div
      ref={borde}
      className={`lab-separador lab-separador--${eje}`}
      role="separator"
      aria-orientation={eje === 'x' ? 'vertical' : 'horizontal'}
      aria-label={etiqueta}
      aria-controls={controla}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={oculto ? 0 : medida}
      aria-valuetext={oculto ? 'Oculto' : `${medida} píxeles`}
      tabIndex={0}
      title="Arrastrá para cambiar el tamaño. Enter lo oculta o lo muestra."
      data-arrastrando={arrastrando || undefined}
      onPointerDown={empezar}
      onKeyDown={tecla}
      onDoubleClick={() => {
        if (oculto) alAlternar(false);
        alCambiar(porDefecto, true);
      }}
    />
  );
}
