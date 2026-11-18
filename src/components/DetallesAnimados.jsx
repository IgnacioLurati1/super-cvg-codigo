import { useRef } from 'react';

const DURACION = 280;
const CURVA = 'cubic-bezier(0.2, 0.7, 0.2, 1)';

// Un <details> que se abre y se cierra de a poco (anima el alto) en vez de golpe. Sigue siendo un
// details: Enter, Espacio y los lectores de pantalla andan igual. Con «reducir movimiento» o sin la
// API de animaciones, se abre al instante. Mientras se cierra lleva `data-cerrando`, así el ícono gira
// de vuelta al empezar y no al final.
export default function DetallesAnimados({ className, claseTitulo, titulo, children }) {
  const ref = useRef(null);
  const animacion = useRef(null);

  const terminar = (abierto) => {
    const d = ref.current;
    animacion.current = null;
    if (!d) return;
    d.open = abierto;
    delete d.dataset.cerrando;
    d.style.height = '';
    d.style.overflow = '';
  };

  const animar = (desde, hasta, abierto) => {
    const d = ref.current;
    animacion.current?.cancel();
    const a = d.animate({ height: [`${desde}px`, `${hasta}px`] }, { duration: DURACION, easing: CURVA });
    animacion.current = a;
    a.onfinish = () => terminar(abierto);
  };

  const alTocar = (e) => {
    const d = ref.current;
    if (!d?.animate || ['reducido', 'ninguno'].includes(document.documentElement.dataset.movimiento) || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    e.preventDefault();
    const bordes = d.offsetHeight - d.clientHeight;
    const desde = d.offsetHeight;
    d.style.overflow = 'hidden';
    if (!d.open || d.dataset.cerrando !== undefined) {
      // Abre (o vuelve a abrir uno que se estaba cerrando) desde el alto que tiene ahora.
      delete d.dataset.cerrando;
      d.style.height = `${desde}px`;
      d.open = true;
      animar(desde, d.scrollHeight + bordes, true);
    } else {
      d.dataset.cerrando = '';
      animar(desde, d.querySelector('summary').offsetHeight + bordes, false);
    }
  };

  return (
    <details ref={ref} className={className}>
      <summary className={claseTitulo} onClick={alTocar}>
        {titulo}
      </summary>
      {children}
    </details>
  );
}
