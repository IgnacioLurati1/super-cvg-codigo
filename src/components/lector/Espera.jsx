import './espera.css';

/** While a PDF comes or opens: the reader's bar and a sheet of the shape of what is coming, marked busy. Not a live
 * region: it is born with its text, and that is not announced. Light, so it can show before the reader loads. */
export default function EsperaLector() {
  return (
    <div className="lector lector--esperando" aria-busy="true">
      <span className="solo-lectores">Abriendo el PDF</span>
      <div className="lector__barra lector__barra--esqueleto" aria-hidden="true"><i /><i /><i /></div>
      <div className="lector__marco" aria-hidden="true">
        <div className="lector__hoja-esperando lector__hoja-esperando--sola"><i /><i /><i /><i /><i /><i /></div>
      </div>
    </div>
  );
}
