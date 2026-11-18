import { Anuncio } from '../Hoja';
import './_est-cuentas.css';

// The math written on the sheet by the statistics, stocks and simulation calculators: a fraction with its bar, a root
// with its line on top, a combinatorial number between parentheses, and the results as measures named small on top.

/** a over b, stacked. A screen reader hears «a sobre b». */
export function Frac({ arriba, abajo }) {
  return (
    <span className="ce-frac">
      <span className="ce-frac__arriba">{arriba}</span>
      <span className="solo-lectores"> sobre </span>
      <span className="ce-frac__abajo">{abajo}</span>
    </span>
  );
}

/** √ with its line over what's inside. */
export function Raiz({ children }) {
  return (
    <span className="ce-raiz">
      <svg className="ce-raiz__signo" viewBox="0 0 10 24" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <path d="M0.5 14 L3 12.5 L6.2 23 L10 0.8" />
      </svg>
      <span className="solo-lectores">raíz de </span>
      <span className="ce-raiz__dentro">{children}</span>
    </span>
  );
}

/** The combinatorial number (n k), n over k between parentheses. */
export function Comb({ n, k }) {
  return (
    <span className="ce-comb">
      <span className="ce-comb__par" aria-hidden="true">(</span>
      <span className="ce-comb__numeros">
        <span>{n}</span>
        <span className="solo-lectores"> tomados de a </span>
        <span>{k}</span>
      </span>
      <span className="ce-comb__par" aria-hidden="true">)</span>
    </span>
  );
}

/** A line of the resolution, as written by hand: the fractions and roots stay on the line. */
export function Cuenta({ children }) {
  return <p className="ce-cuenta">{children}</p>;
}

/**
 * The result: each measure with its name small on top and its value big. `principal` takes the highlighter. `dicho`:
 * what a screen reader hears once the typing stops. `children`: a drawing that is the result itself, on top.
 */
export function Fichas({ fichas, dicho, children }) {
  return (
    <div className="calc-hoja__resultado">
      {children}
      <dl className="ce-fichas">
        {fichas.map((f) => (
          <div key={f.nombre} className="ce-fichas__ficha" data-principal={f.principal || undefined}>
            <dt>{f.nombre}</dt>
            <dd>{f.principal ? <span className="resaltado">{f.valor}</span> : f.valor}</dd>
          </div>
        ))}
      </dl>
      <Anuncio texto={dicho} />
    </div>
  );
}
