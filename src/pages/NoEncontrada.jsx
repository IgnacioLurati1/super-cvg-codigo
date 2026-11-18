import { Link } from 'react-router-dom';
import { useSeo, tituloDe } from '../lib/seo';

export default function NoEncontrada() {
  useSeo({ titulo: tituloDe('No encontramos esta página'), noindex: true });
  return (
    <section className="contenedor pagina">
      <h1>No encontramos esta página</h1>
      <p><Link to="/">Volver al inicio</Link></p>
    </section>
  );
}
