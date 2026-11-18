import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

// Al cambiar de pantalla: arriba de todo, o a la sección del #ancla si la hay. El foco va al contenido principal
// (<main>) o a esa sección, así el teclado y el lector de pantalla siguen desde ahí y no desde el principio de la
// página. No lo mueve en la primera carga ni en una redirección antes de que la persona toque algo, ni si la pantalla
// nueva ya lo puso en algo suyo (un título, un campo).

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
    if (!toco.current || (!otra && !ancla)) return undefined;
    const antes = document.activeElement;
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

  return null;
}
