// Finds text that gets cut or that lands on top of something else, in a page that's already open. Made for the large
// letter sizes: nothing may be clipped, spill out of its button or step on its neighbor.
//
//   import { buscarEncimados } from './encimados.mjs';
//   const problemas = await buscarEncimados(pagina);            // [] when everything fits
//   assert.deepEqual(problemas, [], problemas.join('\n'));
//
// It looks at what's painted right now (open menus and dialogs included), in the whole document, not only the visible
// part. Things meant to be cut stay out: `text-overflow: ellipsis`, `-webkit-line-clamp`, scroll boxes (`overflow: auto`
// or `scroll`), visually hidden text (`.solo-lectores`) and anything inside `[data-encima-ok]` or the `ignorar`
// selectors. Layers that float on purpose (fixed, sticky once stuck, dialogs, popovers, and anything positioned with a
// z-index of 10 or more, like a header and its folded menu or a dropdown) are only compared with themselves.

/** Runs inside the page. Kept self-contained: Playwright serializes it. */
export function encimadosEnPagina({ ignorar = [], tolerancia = 2, maximo = 40 } = {}) {
  const raiz = document.documentElement;
  const problemas = [];
  const vistos = new Set();
  const anotar = (texto) => {
    if (vistos.has(texto) || problemas.length >= maximo) return;
    vistos.add(texto);
    problemas.push(texto);
  };

  const estilos = new Map();
  const estilo = (el) => {
    if (!estilos.has(el)) estilos.set(el, getComputedStyle(el));
    return estilos.get(el);
  };

  const nombre = (el) => {
    const etiqueta = el.tagName.toLowerCase();
    const clase = typeof el.className === 'string' && el.className.trim() ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}` : '';
    const texto = (el.innerText || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    return `${etiqueta}${clase}${texto ? ` «${texto}»` : ''}`;
  };

  const desplaza = (s) => /auto|scroll/.test(s.overflowX) || /auto|scroll/.test(s.overflowY);
  const recorta = (s) => s.overflowX !== 'visible' || s.overflowY !== 'visible';

  // Not painted, or painted on purpose out of sight (a visually hidden label is a 1px box that clips).
  const ocultos = new Map();
  const oculto = (el) => {
    if (!el || el === raiz) return false;
    if (ocultos.has(el)) return ocultos.get(el);
    const s = estilo(el);
    // checkVisibility also covers the inside of a closed <details>, which still reports boxes.
    let resultado = el.checkVisibility ? !el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) : s.display === 'none' || s.visibility === 'hidden';
    resultado ||= el.hasAttribute('data-encima-ok') || (ignorar.length > 0 && ignorar.some((selector) => el.matches(selector)));
    resultado ||= s.position === 'absolute' && s.clip !== 'auto' && s.clip !== '';
    if (!resultado && recorta(s) && s.display !== 'contents') {
      const r = el.getBoundingClientRect();
      resultado = r.width <= 1 || r.height <= 1;
    }
    resultado ||= oculto(el.parentElement);
    ocultos.set(el, resultado);
    return resultado;
  };

  // A sticky element only floats once it's stuck: in its own place it must not cover anything either.
  const pegados = new Map();
  const pegado = (n) => {
    if (!pegados.has(n)) {
      const antes = n.getBoundingClientRect();
      const previo = n.style.getPropertyValue('position');
      const prioridad = n.style.getPropertyPriority('position');
      n.style.setProperty('position', 'static', 'important');
      const quieto = n.getBoundingClientRect();
      n.style.setProperty('position', previo, prioridad);
      if (!previo) n.style.removeProperty('position');
      pegados.set(n, Math.abs(antes.top - quieto.top) > 0.5 || Math.abs(antes.left - quieto.left) > 0.5);
    }
    return pegados.get(n);
  };

  // The layer an element is painted in: elements in different layers may cover each other on purpose.
  const capas = new Map();
  const capa = (el) => {
    if (capas.has(el)) return capas.get(el);
    let resultado = raiz;
    for (let n = el; n && n !== raiz; n = n.parentElement) {
      const s = estilo(n);
      const tag = n.tagName.toLowerCase();
      const encima = s.position !== 'static' && Number(s.zIndex) >= 10;
      if (encima || s.position === 'fixed' || (s.position === 'sticky' && pegado(n)) || tag === 'dialog' || n.hasAttribute('popover') || n.getAttribute('role') === 'dialog' || n.getAttribute('role') === 'tooltip') {
        resultado = n;
        break;
      }
    }
    capas.set(el, resultado);
    return resultado;
  };

  // Boxes that clip their content, from the element up (scroll boxes count: what's outside is reached by scrolling).
  const recortes = (el) => {
    const lista = [];
    for (let n = el.parentElement; n && n !== raiz && n !== document.body; n = n.parentElement) {
      const s = estilo(n);
      if (recorta(s)) lista.push({ n, r: n.getBoundingClientRect(), desplaza: desplaza(s) });
      if (s.position === 'fixed') break;
    }
    return lista;
  };

  // What can be seen of a box: cut down by every box that clips, from `desde` up.
  const visible = (desde, r) => {
    let x0 = r.left, y0 = r.top, x1 = r.right, y1 = r.bottom;
    for (let n = desde; n && n !== raiz && n !== document.body; n = n.parentElement) {
      const s = estilo(n);
      if (recorta(s)) {
        const m = n.getBoundingClientRect();
        x0 = Math.max(x0, m.left); y0 = Math.max(y0, m.top); x1 = Math.min(x1, m.right); y1 = Math.min(y1, m.bottom);
      }
      if (s.position === 'fixed') break;
    }
    return x1 - x0 > 1 && y1 - y0 > 1 ? { left: x0, top: y0, right: x1, bottom: y1 } : null;
  };

  const adrede = (el) => {
    for (let n = el; n && n !== raiz; n = n.parentElement) {
      const s = estilo(n);
      if (s.textOverflow === 'ellipsis' || (s.webkitLineClamp && s.webkitLineClamp !== 'none')) return true;
      if (n !== el && desplaza(s)) return false;
    }
    return false;
  };

  const caja = (el) => {
    const s = estilo(el);
    const fondo = s.backgroundColor !== 'rgba(0, 0, 0, 0)' && s.backgroundColor !== 'transparent';
    const borde = ['Top', 'Right', 'Bottom', 'Left'].some((lado) => parseFloat(s[`border${lado}Width`]) > 0 && s[`border${lado}Style`] !== 'none');
    return fondo || borde;
  };

  // The nearest box that shows (a button, a chip, a card): its text must stay inside it.
  const fuera = new Set([raiz, document.body, document.getElementById('root'), document.querySelector('.sitio')]);
  const cajaDe = (el) => {
    for (let n = el; n && !fuera.has(n); n = n.parentElement) {
      const s = estilo(n);
      if (s.display !== 'inline' && s.display !== 'contents' && caja(n)) return n;
      if (s.position === 'fixed') return null;
    }
    return null;
  };

  const ancho = window.innerWidth;
  const textos = [];
  const recorrido = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (t) => (t.data.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
  });
  const conTexto = new Set();
  for (let t = recorrido.nextNode(); t; t = recorrido.nextNode()) {
    const el = t.parentElement;
    if (!el || ['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'OPTION'].includes(el.tagName) || oculto(el)) continue;
    const rango = document.createRange();
    rango.selectNodeContents(t);
    const rects = [...rango.getClientRects()].filter((r) => r.width > 1 && r.height > 1);
    if (!rects.length) continue;
    conTexto.add(el);
    // What its own box or any around it clips (a two-line clamp) isn't there to step on anything.
    const vistos = rects.map((r) => visible(el, r)).filter(Boolean);
    if (vistos.length) textos.push({ el, rects: vistos });

    // Cut by a box around it, or by the edge of the window.
    if (adrede(el)) continue;
    const marcos = recortes(el);
    const borde = cajaDe(el);
    if (borde && !marcos.some((m) => m.desplaza && borde.contains(m.n))) {
      const b = borde.getBoundingClientRect();
      const sale = rects.find((r) => r.left < b.left - tolerancia || r.right > b.right + tolerancia || r.top < b.top - tolerancia || r.bottom > b.bottom + tolerancia);
      if (sale) anotar(`se sale de su caja: ${nombre(el)} de ${nombre(borde)} (${Math.round(Math.max(b.left - sale.left, sale.right - b.right, b.top - sale.top, sale.bottom - b.bottom))}px)`);
    }
    for (const r of rects) {
      if (r.right > ancho + tolerancia || r.left < -tolerancia) {
        if (!marcos.some((m) => m.desplaza)) anotar(`se sale de la pantalla: ${nombre(el)} (${Math.round(r.left)}–${Math.round(r.right)} de ${ancho})`);
        continue;
      }
      for (const m of marcos) {
        if (m.desplaza) break;
        const afuera = r.left < m.r.left - tolerancia || r.right > m.r.right + tolerancia || r.top < m.r.top - tolerancia || r.bottom > m.r.bottom + tolerancia;
        const toca = r.right > m.r.left && r.left < m.r.right && r.bottom > m.r.top && r.top < m.r.bottom;
        // Entirely outside is hidden on purpose (a closed panel); half in, half out is cut.
        if (afuera && toca) {
          anotar(`cortado: ${nombre(el)} dentro de ${nombre(m.n)}`);
          break;
        }
      }
    }
  }

  // A box that clips and has more text than room (lines pushed out of sight entirely, too).
  for (const el of conTexto) {
    const s = estilo(el);
    if (!recorta(s) || desplaza(s) || adrede(el) || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) continue;
    if (el.clientWidth === 0 || el.clientHeight === 0) continue;
    const sobra = Math.max(el.scrollWidth - el.clientWidth, el.scrollHeight - el.clientHeight);
    if (sobra > tolerancia) anotar(`cortado: ${nombre(el)} (sobran ${sobra}px)`);
  }

  // Controls whose boxes cover each other, and text that lands on another text or control.
  const controles = [...document.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab], [role=link], [role=checkbox], [role=switch]')]
    .filter((el) => !oculto(el))
    .map((el) => ({ el, r: visible(el.parentElement, el.getBoundingClientRect()) }))
    .filter(({ r }) => r && r.right - r.left > 2 && r.bottom - r.top > 2);
  const pisan = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > tolerancia && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > tolerancia;
  const anidados = (a, b) => a.contains(b) || b.contains(a);

  for (let i = 0; i < controles.length; i++) {
    for (let j = i + 1; j < controles.length; j++) {
      const a = controles[i];
      const b = controles[j];
      if (anidados(a.el, b.el) || capa(a.el) !== capa(b.el) || !pisan(a.r, b.r)) continue;
      anotar(`encimados: ${nombre(a.el)} con ${nombre(b.el)}`);
    }
  }

  for (let i = 0; i < textos.length; i++) {
    const a = textos[i];
    for (let j = i + 1; j < textos.length; j++) {
      const b = textos[j];
      if (a.el === b.el || anidados(a.el, b.el) || capa(a.el) !== capa(b.el)) continue;
      if (a.rects.some((ra) => b.rects.some((rb) => pisan(ra, rb)))) anotar(`encimados: ${nombre(a.el)} con ${nombre(b.el)}`);
    }
    for (const c of controles) {
      if (anidados(a.el, c.el) || capa(a.el) !== capa(c.el)) continue;
      if (a.rects.some((ra) => pisan(ra, c.r))) anotar(`encimados: ${nombre(a.el)} con ${nombre(c.el)}`);
    }
  }

  return problemas;
}

/** Playwright helper: the list of problems in the open page, or [] when nothing is cut or on top of something else. */
export const buscarEncimados = (pagina, opciones = {}) => pagina.evaluate(encimadosEnPagina, opciones);
