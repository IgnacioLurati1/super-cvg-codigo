// Movimiento al bajar. Todo elemento con `data-aparece` entra con una animación la primera vez que
// se ve (el estilo está en base.css; `--orden` escalona los de un mismo grupo). Se arranca una vez en
// main.jsx y sigue a lo que se renderiza después (rutas, datos que llegan tarde). Con «reducir
// movimiento», sin IntersectionObserver todo se muestra quieto.

export const sinMovimiento = () =>
  typeof window === 'undefined' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Cuánto avanzó un elemento por la pantalla: 0 cuando su borde de arriba asoma abajo, 1 cuando su
// borde de abajo sale por arriba. Para atar una animación al scroll.
export function avanceDe(el) {
  const r = el.getBoundingClientRect();
  const alto = window.innerHeight;
  return Math.min(1, Math.max(0, (alto - r.top) / (alto + r.height)));
}

export function iniciarMovimiento() {
  if (typeof window === 'undefined') return;
  const raiz = document.documentElement;
  const mostrar = (el) => el.setAttribute('data-visto', '');

  if (sinMovimiento() || !('IntersectionObserver' in window)) {
    // Igual se marcan, por si algún estilo depende de data-visto.
    new MutationObserver(() => document.querySelectorAll('[data-aparece]:not([data-visto])').forEach(mostrar)).observe(
      document.body,
      { childList: true, subtree: true },
    );
    return;
  }

  raiz.classList.add('con-movimiento');
  const io = new IntersectionObserver(
    (entradas) => {
      for (const e of entradas) {
        if (!e.isIntersecting) continue;
        mostrar(e.target);
        io.unobserve(e.target);
      }
    },
    // Arranca apenas el elemento asoma: uno alto (una foto con su texto) no queda vacío en pantalla
    // esperando a mostrar una parte grande.
    { rootMargin: '0px 0px -6% 0px', threshold: 0 },
  );
  const seguidos = new WeakSet();
  const buscar = () => {
    for (const el of document.querySelectorAll('[data-aparece]:not([data-visto])')) {
      if (seguidos.has(el)) continue;
      seguidos.add(el);
      io.observe(el);
    }
  };
  let pendiente = false;
  new MutationObserver(() => {
    if (pendiente) return;
    pendiente = true;
    requestAnimationFrame(() => {
      pendiente = false;
      buscar();
    });
  }).observe(document.body, { childList: true, subtree: true });
  buscar();
}
