import { useId } from 'react';
import './fichaDeRepaso.css';

// The index card of Repaso and the end of a round, the same in the student's Repaso and in Repaso en grupo of a live
// session.

/** One card on paper: the question in front, and once turned, the answer under it. */
export function Ficha({ tarjeta, materia, color, vuelta }) {
  return (
    <div className={`repaso-ficha${vuelta ? ' repaso-ficha--vuelta' : ''}`} style={{ '--m': color }}>
      <div className="repaso-ficha__cara repaso-ficha__frente" aria-hidden={vuelta}>
        <p className="repaso-ficha__materia">{materia}</p>
        <p className="repaso-ficha__texto">{tarjeta.frente}</p>
      </div>
      <div className="repaso-ficha__cara repaso-ficha__dorso" aria-hidden={!vuelta}>
        <p className="repaso-ficha__pregunta">{tarjeta.frente}</p>
        <p className={`repaso-ficha__texto${tarjeta.dorso ? '' : ' repaso-ficha__texto--vacio'}`}>{tarjeta.dorso || 'Esta tarjeta no tiene respuesta escrita.'}</p>
      </div>
    </div>
  );
}

/** The end of a round: the pile with the stamp of how many went by, the title, and what the screen adds under it. */
export function FinDeRonda({ ref, hechas, titulo, Nivel = 'h2', children }) {
  const id = useId();
  return (
    <section className="repaso-fin" ref={ref} tabIndex={-1} aria-labelledby={id}>
      <div className="repaso-fin__pila" aria-hidden="true">
        {[0, 1, 2].map((i) => <span key={i} className="repaso-pila__capa" style={{ '--i': i }} />)}
        <span className="repaso-fin__sello">{hechas}</span>
      </div>
      <Nivel id={id} className="repaso-fin__titulo">{titulo}</Nivel>
      {children}
    </section>
  );
}
