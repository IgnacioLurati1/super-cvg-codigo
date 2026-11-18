import './_an-pizarron.css';

// What the analysis and physics calculators write on the board: «f(x) =» and the formula on a chalk line, and the
// data as on the board, «xₗ = 12», each with its unit. The name is the label; `decir` adds what a screen reader needs
// besides the symbol. The leading «_» keeps this file out of the calculators.

const comun = {
  type: 'text',
  inputMode: 'text',
  autoComplete: 'off',
  autoCapitalize: 'off',
  spellCheck: 'false',
};

/** «f(x) = ___»: a formula across the board. */
export function Escribir({ id, nombre, decir, valor, alCambiar, invalido, errorId, ayudaId, maximo = 200 }) {
  return (
    <div className="pz-formula">
      <label className="pz-formula__nombre" htmlFor={id}>
        {nombre}
        {decir && <span className="solo-lectores">{`, ${decir}`}</span>}
        <span aria-hidden="true"> =</span>
      </label>
      <input
        {...comun}
        id={id}
        className="pz-formula__control"
        value={valor}
        maxLength={maximo}
        aria-invalid={invalido || undefined}
        aria-describedby={[invalido && errorId, ayudaId].filter(Boolean).join(' ') || undefined}
        onChange={(e) => alCambiar(e.target.value)}
      />
    </div>
  );
}

/** «xₗ = 12», short, with its unit after. */
export function Dato({ id, nombre, decir, unidad, valor, alCambiar, invalido, errorId, ancho = 5, maximo = 24, placeholder }) {
  return (
    <div className="pz-dato">
      <label className="pz-dato__nombre" htmlFor={id}>
        {nombre}
        {decir && <span className="solo-lectores">{`, ${decir}`}</span>}
        {unidad && <span className="solo-lectores">{`, en ${unidad}`}</span>}
        <span aria-hidden="true"> =</span>
      </label>
      <input
        {...comun}
        id={id}
        className="pz-dato__control"
        style={{ '--ancho': `${ancho}rem` }}
        value={valor}
        maxLength={maximo}
        placeholder={placeholder}
        aria-invalid={invalido || undefined}
        aria-describedby={invalido ? errorId : undefined}
        onChange={(e) => alCambiar(e.target.value)}
      />
      {unidad && (
        <span className="pz-dato__unidad" aria-hidden="true">
          {unidad}
        </span>
      )}
    </div>
  );
}

/** A row of data, and the mistake of any of them right under it. */
export function Renglon({ titulo, children, error, errorId }) {
  const contenido = (
    <>
      <div className="pz-renglon__datos">{children}</div>
      {error && (
        <p className="campo__error pz-error" id={errorId} role="alert">
          {error}
        </p>
      )}
    </>
  );
  if (!titulo) return <div className="pz-renglon">{contenido}</div>;
  return (
    <fieldset className="pz-renglon">
      <legend className="opciones__leyenda">{titulo}</legend>
      {contenido}
    </fieldset>
  );
}

/** The mistake of a formula, under it. */
export function ErrorDe({ id, texto }) {
  if (!texto) return null;
  return (
    <p className="campo__error pz-error" id={id} role="alert">
      {texto}
    </p>
  );
}
