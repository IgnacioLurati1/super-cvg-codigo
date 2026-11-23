// A column opening beside the page (the menu on the left, Consultron beside an HTML summary) leaves the page where it
// was while the page fits in what's left, and moves it only what it takes to clear the column. The menu's page says how
// wide it gets to Layout.css (`--ancho-pagina`); a summary is measured here.
import { useLayoutEffect } from 'react';

const px = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

/** The widest an element gets, border included, when its max-width is in pixels; null with none or a percent. */
export function anchoTope(estilo) {
  const tope = estilo.maxWidth;
  if (!tope || !/^[\d.]+px$/.test(tope)) return null;
  const extra = estilo.boxSizing === 'border-box' ? 0 : px(estilo.paddingLeft) + px(estilo.paddingRight) + px(estilo.borderLeftWidth) + px(estilo.borderRightWidth);
  return px(tope) + extra;
}

/** How wide an HTML summary is laid out with Consultron beside its frame. `completo`: the width it had without
 * Consultron; `propio`: the frame's own now (what it gets with nothing done); `limite`: where what's in view ends,
 * before Consultron; `borde(ancho)`: where its content ends, laid out that wide. The widest that keeps the content in
 * view, so it moves only what it must (nothing while it fits); null when only the frame's own width does. */
export function anchoDelResumen({ completo, propio, limite, borde }) {
  let ancho = completo;
  let antes = null;
  for (let vuelta = 0; vuelta < 10; vuelta += 1) {
    if (ancho <= propio) return null;
    const fin = borde(ancho);
    const sobra = fin - limite;
    if (sobra <= 0.5) return ancho;
    // How much the content moves per pixel less (half, centered; all of it, filling): from the last two tries.
    const paso = antes && antes.ancho !== ancho ? (antes.fin - fin) / (antes.ancho - ancho) : 1;
    antes = { ancho, fin };
    ancho = Math.floor(ancho - sobra / Math.min(1, Math.max(0.1, paso)));
  }
  return null;
}

// What a summary shows that can't hide under Consultron: its text, pictures and controls, and the boxes it draws (a
// background, a border or a shadow), except those as wide as the page, which are its background.
const MEDIOS = 'img, svg:not(svg svg), video, canvas, iframe, embed, object, input, select, textarea, button';
const dibujada = (e) =>
  e.backgroundImage !== 'none' ||
  !/^(transparent|rgba\(.*,\s*0\))$/.test(e.backgroundColor) ||
  e.boxShadow !== 'none' ||
  ['Top', 'Right', 'Bottom', 'Left'].some((l) => e[`border${l}Style`] !== 'none' && parseFloat(e[`border${l}Width`]) > 0);
// A summary in Super CVG runs no scripts (VisorResumen.jsx): what it has stays as it came, and is gathered once.
const reunidos = new WeakMap();

function reunir(doc) {
  if (reunidos.has(doc)) return reunidos.get(doc);
  const vista = doc.defaultView;
  const textos = [];
  const recorrido = doc.createTreeWalker(doc.body, vista.NodeFilter.SHOW_TEXT);
  for (let n = recorrido.nextNode(); n; n = recorrido.nextNode()) if (/\S/.test(n.data)) textos.push(n);
  const medios = [...doc.body.querySelectorAll(MEDIOS)];
  const cajas = [...doc.body.querySelectorAll('*')].filter((el) => !el.matches(MEDIOS) && dibujada(vista.getComputedStyle(el)));
  // The boxes that scroll their content sideways: what's inside ends where they do.
  const cortan = new Map();
  const corte = (el) => {
    if (!el || el === doc.body || el === doc.documentElement) return null;
    if (cortan.has(el)) return cortan.get(el);
    const valor = vista.getComputedStyle(el).overflowX !== 'visible' ? el : corte(el.parentElement);
    cortan.set(el, valor);
    return valor;
  };
  const todo = {
    textos: textos.map((n) => [n, corte(n.parentElement)]),
    elementos: [...medios.map((el) => [el, false]), ...cajas.map((el) => [el, true])].map(([el, esCaja]) => [el, corte(el.parentElement), esCaja]),
  };
  reunidos.set(doc, todo);
  return todo;
}

/** Where the content of a summary ends on the right, in its frame, laid out as it is now. */
export function bordeDelContenido(doc) {
  const { textos, elementos } = reunir(doc);
  const pagina = doc.documentElement.getBoundingClientRect().width;
  const hasta = (r, caja) => (caja ? Math.min(r.right, caja.getBoundingClientRect().right) : r.right);
  let fin = 0;
  const rango = doc.createRange();
  for (const [n, caja] of textos) {
    rango.selectNodeContents(n);
    const r = rango.getBoundingClientRect();
    if (r.width && r.height) fin = Math.max(fin, hasta(r, caja));
  }
  for (const [el, caja, esCaja] of elementos) {
    const r = el.getBoundingClientRect();
    if (r.width && r.height && !(esCaja && r.width >= pagina * 0.95)) fin = Math.max(fin, hasta(r, caja));
  }
  return fin;
}

// Room kept between the content and Consultron.
const AIRE = 16;

/** Consultron beside an HTML summary (VisorResumen.jsx) took `lado` pixels from its frame. The summary is laid out as
 * wide as before, so it stays where it was, as long as its content ends before Consultron; if not, just narrower enough
 * to clear it. What's laid out past the frame is only background, cut off. Without Consultron, as it came. */
export function acomodarResumen(doc, lado) {
  const raiz = doc?.documentElement;
  if (!raiz || !doc.body) return null;
  const quitar = () => {
    raiz.style.removeProperty('width');
    raiz.style.removeProperty('overflow-x');
  };
  quitar();
  if (!(lado > 0)) return null;
  const propio = raiz.clientWidth;
  const poner = (ancho) => {
    raiz.style.setProperty('width', `${ancho}px`, 'important');
    raiz.style.setProperty('overflow-x', 'hidden', 'important');
  };
  const ancho = anchoDelResumen({
    completo: propio + lado,
    propio,
    limite: propio - AIRE,
    borde: (a) => {
      poner(a);
      return bordeDelContenido(doc);
    },
  });
  if (ancho === null) quitar();
  else poner(ancho);
  return ancho;
}

/** The menu on the left (Layout.jsx): the page in `main` says its widest to the CSS, `--ancho-pagina` on `main`, while
 * `activo`. When it changes screen, when the window or the letter change. */
export function usePaginaQuieta(main, activo) {
  useLayoutEffect(() => {
    const el = main.current;
    if (!el || !activo) return undefined;
    let pagina = null;
    const medir = () => {
      const nueva = [...el.children].find((h) => h.classList.contains('contenedor')) ?? null;
      if (nueva !== pagina) {
        if (pagina) ro.unobserve(pagina);
        if (nueva) ro.observe(nueva);
        pagina = nueva;
      }
      const tope = pagina ? anchoTope(getComputedStyle(pagina)) : null;
      if (tope === null) el.style.removeProperty('--ancho-pagina');
      else if (el.style.getPropertyValue('--ancho-pagina') !== `${tope}px`) el.style.setProperty('--ancho-pagina', `${tope}px`);
    };
    const ro = new ResizeObserver(medir);
    const mo = new MutationObserver(medir);
    ro.observe(el);
    mo.observe(el, { childList: true });
    medir();
    return () => {
      ro.disconnect();
      mo.disconnect();
      el.style.removeProperty('--ancho-pagina');
    };
  }, [main, activo]);
}
