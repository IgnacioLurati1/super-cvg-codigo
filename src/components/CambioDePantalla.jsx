import { useEffect, useRef } from 'react';
import { useLocation, useNavigation } from 'react-router-dom';

// Al cambiar de pantalla: arriba de todo, o a la sección del #ancla si la hay. El foco va al contenido principal
// (<main>) o a esa sección, así el teclado y el lector de pantalla siguen desde ahí y no desde el principio de la
// página. No lo mueve en la primera carga ni en una redirección antes de que la persona toque algo, ni si la pantalla
// nueva ya lo puso en algo suyo (un título, un campo).
// A screen that comes apart (App.jsx) shows only once it is downloaded, and the address changes then. If meanwhile the
// student put the focus somewhere else (opened Consultron, a file), it stays there: what counts is where the focus was
// when they left, not when the new screen arrived.

// Cuadros que espera a que aparezca el <main> de una vista que se baja aparte: un segundo y medio.
const ESPERA_MAXIMA = 90;

// El elemento del #ancla, o null (un # que no es una sección o mal codificado).
function delAncla(hash) {
  if (!hash || hash.length < 2) return null;
  try {
    return document.getElementById(decodeURIComponent(hash.slice(1)));
  } catch {
    return null;
  }
}

// El foco a un elemento que no lo recibe solo (el <main>, una sección), sin correr la página. Sin recuadro: no es algo
// para tocar (base.css, data-foco-pantalla).
function enfocar(el) {
  if (el.tabIndex < 0 && !el.hasAttribute('tabindex')) {
    el.setAttribute('tabindex', '-1');
    el.setAttribute('data-foco-pantalla', '');
  }
  el.focus({ preventScroll: true });
}

export default function CambioDePantalla() {
  const { pathname, hash } = useLocation();
  const anterior = useRef(pathname);
  const toco = useRef(false);
  const navegacion = useNavigation();
  // Where the focus was as the screen began to load; null if it came at once.
  const alSalir = useRef(null);

  // Hasta que la persona toca la pantalla o usa el teclado, el foco queda donde lo deja el navegador.
  useEffect(() => {
    const marcar = () => {
      toco.current = true;
      quitar();
    };
    const quitar = () => {
      window.removeEventListener('pointerdown', marcar, true);
      window.removeEventListener('keydown', marcar, true);
    };
    window.addEventListener('pointerdown', marcar, true);
    window.addEventListener('keydown', marcar, true);
    return quitar;
  }, []);

  useEffect(() => {
    const otra = pathname !== anterior.current;
    anterior.current = pathname;
    const ancla = delAncla(hash);
    if (ancla) ancla.scrollIntoView();
    else window.scrollTo(0, 0);

    // En la misma pantalla, solo un ancla mueve el foco (como «Ir al contenido»).
    const salida = alSalir.current;
    alSalir.current = null;
    if (!toco.current || (!otra && !ancla)) return undefined;
    const antes = salida ?? document.activeElement;
    let cuadros = 0;
    let pedido = requestAnimationFrame(function probar() {
      const ahora = document.activeElement;
      if (ahora && ahora !== antes && ahora !== document.body) return;
      const destino = delAncla(hash) || (otra ? document.querySelector('main') : null);
      if (destino) enfocar(destino);
      else if (otra && ++cuadros < ESPERA_MAXIMA) pedido = requestAnimationFrame(probar);
    });
    return () => cancelAnimationFrame(pedido);
  }, [pathname, hash]);

  // After the one above: when the new screen arrives, that one reads it before it's cleared here.
  useEffect(() => {
    if (navegacion.state === 'idle') alSalir.current = null;
    else alSalir.current ??= document.activeElement;
  }, [navegacion.state]);

  return null;
}
