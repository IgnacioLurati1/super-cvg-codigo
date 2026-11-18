import { cloneElement, useId } from 'react';

// Un campo con su etiqueta, su ayuda y su error al lado. Un ejemplo concreto en `ayuda` vale más que un placeholder.
//   <Campo etiqueta="Tu mail" ayuda="Ahí llega la confirmación" error={errores.mail}>
//     <input className="campo__control" type="email" autoComplete="email" value={…} onChange={…} />
//   </Campo>
// `ayudaAlLado`: the help goes on the label's line, so a field next to another one without help keeps its box level.
export default function Campo({ etiqueta, ayuda, ayudaAlLado = false, error, children }) {
  const id = useId();
  const idAyuda = ayuda ? `${id}-ayuda` : undefined;
  const idError = error ? `${id}-error` : undefined;
  return (
    <div className="campo">
      {ayudaAlLado && ayuda ? (
        <span className="campo__cabeza">
          <label className="campo__etiqueta" htmlFor={id}>{etiqueta}</label>
          <span id={idAyuda} className="campo__ayuda">{ayuda}</span>
        </span>
      ) : (
        <>
          <label className="campo__etiqueta" htmlFor={id}>{etiqueta}</label>
          {ayuda && <span id={idAyuda} className="campo__ayuda">{ayuda}</span>}
        </>
      )}
      {cloneElement(children, {
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': [idAyuda, idError].filter(Boolean).join(' ') || undefined,
      })}
      {error && <span id={idError} className="campo__error" role="alert">{error}</span>}
    </div>
  );
}
