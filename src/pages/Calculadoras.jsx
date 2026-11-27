import { useId } from 'react';
import { Link } from 'react-router-dom';
import Imagen from '../components/Imagen';
import { CALCULADORAS, MATERIAS_DE_CALCULADORAS } from '../lib/calculadoras/lista';
import { tituloDe, useSeo } from '../lib/seo';
import '../components/calculadoras/calculadoras.css';

// The list of the study calculators, by subject, like the index of a notebook: a card each, with a real picture of it
// (scripts/calculadoras/fotos.mjs). Each one is under its own subject only.
const FOTOS = `${import.meta.env.BASE_URL}calculadoras/`;
// When a picture doesn't come (no signal, or it failed), a calculator drawn here takes its place instead of the browser's
// broken-image icon.
const SIN_FOTO = (
  <svg className="calcs__sin-foto" viewBox="0 0 24 24" focusable="false">
    <rect x="5" y="2.5" width="14" height="19" rx="2" />
    <rect x="8" y="5.5" width="8" height="3.5" rx="0.5" />
    <path d="M8.5 13h.01M12 13h.01M15.5 13h.01M8.5 16h.01M12 16h.01M15.5 16h.01M8.5 19h.01M12 19h.01M15.5 19h.01" />
  </svg>
);

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
              <Imagen className="calcs__foto-claro" src={`${FOTOS}${c.slug}-claro.webp`} width="560" height="280" respaldo={SIN_FOTO} />
              <Imagen className="calcs__foto-oscuro" src={`${FOTOS}${c.slug}-oscuro.webp`} width="560" height="280" respaldo={SIN_FOTO} />
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
