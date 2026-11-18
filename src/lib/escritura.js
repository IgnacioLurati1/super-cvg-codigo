// Where the words of each page title end, for the styles that write their titles by hand (styles/animaciones.css,
// `--letras`). A title takes the whole row, but its words only a part of it: without this the pen would take most of
// its time over blank paper. Measured as soon as a title shows up, before it's painted: a MutationObserver answers
// before the next frame. Nothing is measured when the style doesn't write or movement is off.

const ESCRIBEN = ['hoja', 'plano', 'pizarron'];
const TITULOS = 'main .contenedor.pagina :is(h1, h2)';

const escribe = () => {
  const raiz = document.documentElement;
  if (!ESCRIBEN.includes(raiz.dataset.estilo)) return false;
  if (['reducido', 'ninguno'].includes(raiz.dataset.movimiento)) return false;
  return !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
};

export function iniciarEscritura() {
  if (typeof window === 'undefined' || typeof MutationObserver === 'undefined') return;
  // What each title said when it was measured. A title that changes its words («Hoy» turns into «Hola, Ana» when the
  // profile arrives) is measured again: while it's being written the pen goes on to the new end. It isn't written
  // again: the month of the calendar changes its title at each step, and that's no new page.
  const escrito = new WeakMap();
  const rango = document.createRange();
  const anotar = (titulo) => {
    rango.selectNodeContents(titulo);
    const letras = rango.getBoundingClientRect().right - titulo.getBoundingClientRect().left;
    if (letras > 0) titulo.style.setProperty('--letras', `${Math.ceil(letras)}px`);
  };
  const medir = () => {
    if (!escribe()) return;
    for (const titulo of document.querySelectorAll(TITULOS)) {
      const texto = titulo.textContent;
      const antes = escrito.get(titulo);
      if (antes === texto) continue;
      escrito.set(titulo, texto);
      anotar(titulo);
    }
  };
  new MutationObserver(medir).observe(document.body, { childList: true, characterData: true, subtree: true });
  // On the first visit the handwritten letter arrives after the title was measured in the fallback one, narrower.
  document.fonts?.addEventListener('loadingdone', () => {
    if (escribe()) document.querySelectorAll(TITULOS).forEach(anotar);
  });
  medir();
}
