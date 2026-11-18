// What shows up on a screen after the screen itself (the data that takes the place of a skeleton, a list that grows)
// gets `data-llega`. The styles' entrances (styles/animaciones.css) make what came with the screen wait its turn; what
// arrives later already waited behind the skeleton, so it starts at once. Without this the skeleton went away and the
// blocks stayed blank for a moment before appearing, as if they jumped in.

const PAGINA = 'main .contenedor.pagina';

export function marcarLlegadas() {
  if (typeof window === 'undefined' || typeof MutationObserver === 'undefined') return;
  // The pages already on screen: what's added to one of these arrived after it.
  const vistas = new WeakSet();
  const anotar = () => document.querySelectorAll(PAGINA).forEach((p) => vistas.add(p));
  new MutationObserver((cambios) => {
    for (const cambio of cambios) {
      const pagina = cambio.target.closest?.(PAGINA);
      if (!pagina || !vistas.has(pagina)) continue;
      for (const nodo of cambio.addedNodes) if (nodo.nodeType === Node.ELEMENT_NODE) nodo.setAttribute('data-llega', '');
    }
    anotar();
  }).observe(document.body, { childList: true, subtree: true });
  anotar();
}
