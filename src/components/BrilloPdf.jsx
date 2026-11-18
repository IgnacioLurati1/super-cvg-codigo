import { useId } from 'react';
import { BRILLO_PDF } from '../lib/ajustes';

// How white the ink of the dark PDF pages is, said in words: the slider gives the number, this what it looks like.
export function palabrasDelBrillo(valor) {
  if (valor < 0.85) return 'Gris suave';
  if (valor < 0.9) return 'Gris clara';
  if (valor < 0.95) return 'Casi blanca';
  if (valor < 1) return 'Muy blanca';
  return 'Blanca, sobre negro';
}

/** The slider of Configuración. The drawings of the pages above follow it as it moves (--pdf-brillo, pages/ajustes.css). */
export default function BrilloPdf({ valor, alCambiar }) {
  const id = useId();
  const palabras = palabrasDelBrillo(valor);
  return (
    <div className="brillo-pdf">
      <div className="brillo-pdf__cabeza">
        <label htmlFor={id} className="brillo-pdf__nombre">Letra de las páginas oscuras</label>
        {/* The slider already says it to screen readers (aria-valuetext): this one, only for the eyes. */}
        <output htmlFor={id} className="brillo-pdf__valor" aria-hidden="true">{palabras}</output>
      </div>
      <p id={`${id}-ayuda`} className="brillo-pdf__ayuda">Más blanca se lee más nítida. Más gris cansa menos la vista.</p>
      <input
        id={id}
        className="brillo-pdf__control"
        type="range"
        min={BRILLO_PDF.min}
        max={BRILLO_PDF.max}
        step={BRILLO_PDF.paso}
        value={valor}
        aria-valuetext={palabras}
        aria-describedby={`${id}-ayuda`}
        onChange={(e) => alCambiar(Number(e.target.value))}
      />
    </div>
  );
}
