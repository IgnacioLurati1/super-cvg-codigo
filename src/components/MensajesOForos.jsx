import { Link } from 'react-router-dom';
import './mensajesOForos.css';

/** Mensajes and Foros share a screen: this switch, on top of each list, goes from one to the other. */
export default function MensajesOForos({ actual }) {
  return (
    <nav className="mensajes-o-foros" aria-label="Mensajes o foros">
      <Link to="/mensajes" aria-current={actual === 'mensajes' ? 'page' : undefined}>Mensajes</Link>
      <Link to="/mensajes/foros" aria-current={actual === 'foros' ? 'page' : undefined}>Foros</Link>
    </nav>
  );
}
