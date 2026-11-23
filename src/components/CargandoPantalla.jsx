import { useEffect, useState } from 'react';
import { useNavigation } from 'react-router-dom';
import './cargandoPantalla.css';

// How long a screen may take before the bar shows: one already kept arrives before, and nothing flickers.
const DEMORA = 150;

/** Every screen but Hoy downloads its code the first time it's opened, and until it arrives the router keeps the one
 * before on view: on a slow connection a tap would seem to do nothing. A thin bar on top says the next one is coming.
 * Only a picture: `main` says it with aria-busy (Layout.jsx). */
export default function CargandoPantalla() {
  // The navigation under way, by its key: the bar is for that one, once it has taken DEMORA.
  const clave = useNavigation().location?.key ?? null;
  const [demorada, setDemorada] = useState(null);
  useEffect(() => {
    if (!clave) return undefined;
    const reloj = setTimeout(() => setDemorada(clave), DEMORA);
    return () => clearTimeout(reloj);
  }, [clave]);
  return clave && demorada === clave ? <div className="cargando-pantalla" aria-hidden="true" /> : null;
}
