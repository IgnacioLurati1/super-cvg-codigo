import { useId } from 'react';
import { Link } from 'react-router-dom';
import { CALCULADORAS, MATERIAS_DE_CALCULADORAS } from '../lib/calculadoras/lista';
import { tituloDe, useSeo } from '../lib/seo';
import '../components/calculadoras/calculadoras.css';

// The list of the study calculators, by subject, like the index of a notebook: a card each, with a real picture of it
// (scripts/calculadoras/fotos.mjs). Each one is under its own subject only.
const FOTOS = `${import.meta.env.BASE_URL}calculadoras/`;

function Materia({ nombre }) {
  const id = useId();
  return (
    <section className="calcs__materia" aria-labelledby={id}>
      <h2 id={id}>{nombre}</h2>
      <ul className="calcs__lista">
        {CALCULADORAS.filter((c) => c.materias[0] === nombre).map((c) => (
          <li key={c.slug} className="calcs__item">
            <Link to={`/calculadoras/${c.slug}`} className="calcs__enlace">{c.nombre}</Link>
            <p className="calcs__descripcion">{c.descripcion}</p>
            <span className="calcs__foto" aria-hidden="true">
              <img className="calcs__foto-claro" src={`${FOTOS}${c.slug}-claro.webp`} alt="" width="560" height="280" loading="lazy" decoding="async" />
              <img className="calcs__foto-oscuro" src={`${FOTOS}${c.slug}-oscuro.webp`} alt="" width="560" height="280" loading="lazy" decoding="async" />
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function Calculadoras() {
  useSeo({ titulo: tituloDe('Calculadoras'), noindex: true });
  return (
    <article className="contenedor pagina calcs" aria-labelledby="calcs-titulo">
      <h1 id="calcs-titulo">Calculadoras</h1>
      <p className="calcs__bajada">Armadas con los apuntes de El Santo Resumen.</p>
      {MATERIAS_DE_CALCULADORAS.map((m) => <Materia key={m} nombre={m} />)}
    </article>
  );
}
