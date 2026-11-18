import { Link, useLocation, useParams } from 'react-router-dom';
import { calculadoraDe } from '../lib/calculadoras/lista';
import { tituloDe, useSeo } from '../lib/seo';
import { Suspense } from 'react';
import NoEncontrada from './NoEncontrada';
import { Esqueleto, PROPIAS } from '../components/calculadoras/Piezas';
import '../components/calculadoras/calculadoras.css';

// One calculator at its own address (its piece, components/calculadoras/Piezas.jsx). Consultron, open over it, reads
// what it shows (consultron/pantalla.js): the mark on the article says where.
export default function Calculadora() {
  const { cual } = useParams();
  // Each arrival starts it again: Consultron can bring other data while the student is already in it.
  const { key } = useLocation();
  const calculadora = calculadoraDe(cual);
  useSeo({ titulo: tituloDe(calculadora?.nombre ?? 'Calculadoras'), noindex: true });
  if (!calculadora || !PROPIAS[calculadora.slug]) return <NoEncontrada />;
  const Propia = PROPIAS[calculadora.slug];
  return (
    <article className="contenedor pagina calc" aria-labelledby="calc-titulo" data-consultron-pantalla="">
      <p className="calc__miga">
        <Link to="/calculadoras">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M15 6l-6 6 6 6" /></svg>
          Calculadoras
        </Link>
      </p>
      <h1 id="calc-titulo">{calculadora.nombre}</h1>
      <p className="calc__bajada">{calculadora.descripcion}</p>
      <Suspense fallback={<Esqueleto />}>
        <Propia key={`${calculadora.slug}-${key}`} />
      </Suspense>
    </article>
  );
}
