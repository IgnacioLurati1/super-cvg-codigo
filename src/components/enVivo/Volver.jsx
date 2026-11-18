import { Link } from 'react-router-dom';
import { useVersion } from './usePestana';
import './enVivo.css';

/** Away from the table, the way back: the session goes on while the student looks at something else. */
export default function Volver({ sesion }) {
  useVersion(sesion);
  const n = sesion.otros().length + 1;
  return (
    <Link className="envivo-volver" to="/en-vivo">
      <span className="envivo-volver__vivo" aria-hidden="true" />
      Volver a la sesión
      <span className="solo-lectores">, {n === 1 ? 'estás solo' : `son ${n}`}</span>
    </Link>
  );
}
