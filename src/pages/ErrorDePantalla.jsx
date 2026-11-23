import { useEffect, useRef } from 'react';
import { isRouteErrorResponse, Link, useRouteError } from 'react-router-dom';
import { tituloDe, useSeo } from '../lib/seo';

// What shows when a screen breaks, instead of the router's page for developers. Inside the layout (App.jsx) the header
// stays, so the student can go somewhere else; outside it, alone. Nothing technical on screen: the error goes to the
// console, where it can be read when someone tells us about it.

// A screen that comes apart (lazy) and whose file is no longer there: the site was published again while it was open.
// Chrome and Firefox name the dynamic import, Safari the module script, and Vite its CSS when that fails first. Not a
// plain «Failed to fetch»: that is the network, and reloading would not help.
const ES_VERSION_VIEJA = /dynamically imported module|Importing a module script failed|Unable to preload CSS/i;

export default function ErrorDePantalla() {
  const error = useRouteError();
  const titulo = useRef(null);
  const noExiste = isRouteErrorResponse(error) && error.status === 404;
  const sinArchivo = !noExiste && ES_VERSION_VIEJA.test(String(error?.message ?? ''));
  // Without internet, a screen whose file this device never kept (the service worker, scripts/trabajador.mjs).
  const sinRed = sinArchivo && navigator.onLine === false;
  const viejo = sinArchivo && !sinRed;
  const texto = noExiste ? 'No encontramos esta página' : sinRed ? 'Sin internet' : viejo ? 'Super CVG se actualizó' : 'Algo falló en esta pantalla';
  useSeo({ titulo: tituloDe(texto), noindex: true });

  useEffect(() => {
    if (!noExiste) console.error(error);
    titulo.current?.focus({ preventScroll: true });
  }, [error, noExiste]);

  return (
    <section className="contenedor pagina error-pantalla">
      <h1 ref={titulo} tabIndex={-1}>{texto}</h1>
      {noExiste ? (
        <p>Esta dirección no existe o cambió.</p>
      ) : sinRed ? (
        <p>Esta pantalla no quedó guardada en este dispositivo. Abrila cuando vuelva la conexión.</p>
      ) : viejo ? (
        <p>Hay una versión nueva. Recargá para abrir esta pantalla.</p>
      ) : (
        <p>Probá de nuevo. Si se repite, contanos qué estabas haciendo.</p>
      )}
      <div className="error-pantalla__salidas">
        {!noExiste && <button type="button" className="boton" onClick={() => window.location.reload()}>{viejo ? 'Recargar' : 'Probar de nuevo'}</button>}
        <Link className="boton boton--secundario" to="/">Ir al inicio</Link>
        {!noExiste && !viejo && !sinRed && <Link className="boton boton--secundario" to="/opinar">Avisar del error</Link>}
      </div>
    </section>
  );
}
