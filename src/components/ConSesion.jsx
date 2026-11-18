import { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { guardarInvitacion } from '../lib/enVivo/codigo';
import { hayVinculoEnCurso } from '../lib/resumenes';
import { leerFragmento } from '../lib/temporales';
import { useToken } from '../lib/sesion';

// A classmate's link must survive signing in. Kept in memory, and only for that link:
// any other screen left without a session is what happens after Salir, and the next student starts clean.
let destino = null;

export function tomarDestino() {
  const d = destino;
  destino = null;
  return d;
}

export default function ConSesion() {
  const token = useToken();
  // Read once, on arrival without a session. The router keeps showing the old hash after Compartido clears it,
  // so reading it later would send the next student to the previous one's link.
  const [link] = useState(() => {
    const { pathname, hash } = window.location;
    if (token) return null;
    if (pathname.endsWith('/compartido') && hash.startsWith('#orden=')) return `/compartido${hash}`;
    if (pathname.endsWith('/propias/abrir') && hash.startsWith('#materia=')) return `/propias/abrir${hash}`;
    if (pathname.endsWith('/horario/compartido') && hash.startsWith('#horario=')) return `/horario/compartido${hash}`;
    if (pathname.endsWith('/archivo') && leerFragmento(hash)) return `/archivo${hash}`;
    // An invitation to a live session: its code waits in memory, out of the address.
    if (/\/en-vivo\/?$/.test(pathname) && guardarInvitacion(hash)) return '/en-vivo';
    // A link from El Santo Resumen: its code already left the address and was traded (main.jsx), and the key waits in
    // memory for whoever signs in.
    if (/\/resumenes\/?$/.test(pathname) && hayVinculoEnCurso()) return '/resumenes';
    return null;
  });

  useEffect(() => {
    if (link) destino = link;
  }, [link]);

  return token ? <Outlet /> : <Navigate to="/" replace />;
}
