import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { calculadorasDe } from '../../lib/calculadoras/deLaMateria';

/** The calculators that go with a subject, under its title. Nothing when it has none. */
export default function DeLaMateria({ nombre }) {
  const lista = useMemo(() => calculadorasDe(nombre), [nombre]);
  if (!lista.length) return null;
  return (
    <nav className="materia__calculadoras" aria-label="Calculadoras de esta materia">
      <span className="materia__calculadoras-titulo">Calculadoras</span>
      <ul>
        {lista.map((c) => <li key={c.slug}><Link to={`/calculadoras/${c.slug}`}>{c.nombre}</Link></li>)}
      </ul>
    </nav>
  );
}
