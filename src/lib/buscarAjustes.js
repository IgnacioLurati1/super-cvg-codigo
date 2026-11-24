// The search of Configuración: what can be changed there, read from the page itself. Every tab is in the page (the closed
// ones `hidden`), so whatever is added to Configuración shows up here by itself. What only appears with another option on
// (the strong version's settings, for one) shows up once it's there.

import { coincidencias, palabrasDe } from './coincidir';

const MARCAS = /[̀-ͯ]/g;
const plano = (texto) => texto.normalize('NFD').replace(MARCAS, '').toLowerCase();
const limpio = (texto) => (texto ?? '').replace(/\s+/g, ' ').trim();

// Inside a tab or a screen of Pantallas, `hidden` only means it isn't the open one. Anything else hidden is left out.
const PUERTAS = '.ajustes__panel, .subpanel';
function aLaVista(el, raiz) {
  for (let a = el; a && a !== raiz; a = a.parentElement) {
    if (a.hidden && !a.matches(PUERTAS)) return false;
  }
  return true;
}

// The text of an element without what's only for screen readers or drawn.
function textoDe(el) {
  if (!el) return '';
  const copia = el.cloneNode(true);
  copia.querySelectorAll('.solo-lectores, svg, [aria-hidden="true"]').forEach((x) => x.remove());
  return limpio(copia.textContent);
}

function ayudaDe(control) {
  const ids = control?.getAttribute('aria-describedby');
  if (!ids) return '';
  return limpio(ids.split(/\s+/).map((id) => control.ownerDocument.getElementById(id)?.textContent ?? '').join(' '));
}

/** Where something is: its tab, its screen of Pantallas and the title of its block. */
function lugarDe(el, pestanas, pantallas) {
  const panel = el.closest('.ajustes__panel');
  const subpanel = el.closest('.subpanel');
  const seccion = panel?.id.replace(/^ajustes-/, '') ?? null;
  const pantalla = subpanel?.id.replace(/^pantalla-/, '') ?? null;
  const bloque = el.closest('.ajustes__seccion')?.querySelector('.ajustes__cabeza h2');
  const partes = [pestanas[seccion], pantallas[pantalla], bloque && !bloque.contains(el) ? textoDe(bloque) : null];
  return { seccion, pantalla, donde: [...new Set(partes.filter(Boolean))].join(' › ') };
}

/** Everything that can be found in Configuración (`raiz`): { clave, nombre, de, ayuda, donde, seccion, pantalla, el,
 * foco }. `el` is what shows it, `foco` what takes the focus. `pestanas` and `pantallas`: { id: name }. */
export function indiceDeAjustes(raiz, { pestanas = {}, pantallas = {} } = {}) {
  const lista = [];
  const sumar = (el, foco, nombre, extra = {}) => {
    if (!nombre || !aLaVista(el, raiz)) return;
    const lugar = lugarDe(el, pestanas, pantallas);
    if (!lugar.seccion) return;
    lista.push({ clave: `${lista.length}`, nombre, de: '', ayuda: '', el, foco, ...lugar, ...extra });
  };

  for (const panel of raiz.querySelectorAll('.ajustes__panel')) {
    // The titles of the blocks.
    for (const h of panel.querySelectorAll('.ajustes__cabeza h2, .subpanel__grupo h3, .atajos h3')) {
      const bloque = h.closest('.ajustes__seccion, .subpanel__grupo, .atajos');
      sumar(h, h.hasAttribute('tabindex') ? h : bloque?.querySelector('input, button, select, textarea, a[href]'), textoDe(h), {
        ayuda: textoDe(bloque?.querySelector('.ajustes__cabeza p')),
      });
    }
    // The groups of choices, and each choice in them.
    for (const grupo of panel.querySelectorAll('fieldset.ajustes__grupo')) {
      const titulo = textoDe(grupo.querySelector(':scope > legend'));
      const radios = [...grupo.querySelectorAll('input[type="radio"]')];
      sumar(grupo, radios.find((r) => r.checked) ?? radios[0], titulo, { ayuda: textoDe(grupo.querySelector(':scope > .ajustes__ayuda')) });
      for (const eleccion of grupo.querySelectorAll('.eleccion')) {
        sumar(eleccion, eleccion.querySelector('input'), textoDe(eleccion.querySelector('.eleccion__nombre')), {
          de: titulo,
          ayuda: textoDe(eleccion.querySelector('.eleccion__texto')),
        });
      }
    }
    // Switches, sliders and fields: by their label.
    for (const etiqueta of panel.querySelectorAll('label:not(.eleccion)')) {
      const control = etiqueta.htmlFor ? raiz.ownerDocument.getElementById(etiqueta.htmlFor) : etiqueta.querySelector('input, select, textarea');
      if (!control || control.type === 'radio') continue;
      sumar(etiqueta.closest('.ajuste-si, .brillo-pdf, .campo') ?? etiqueta, control, textoDe(etiqueta), { ayuda: ayudaDe(control) });
    }
    // Buttons that do something here (not the choices nor the tabs).
    for (const boton of panel.querySelectorAll('button:not([role="tab"])')) {
      if (boton.closest('label, .eleccion')) continue;
      const nombre = textoDe(boton) || boton.getAttribute('aria-label');
      sumar(boton, boton, limpio(nombre));
    }
  }
  // The same name in the same place twice (a label and its group): once.
  const vistos = new Set();
  return lista.filter((x) => {
    const k = `${x.nombre}|${x.de}|${x.donde}`;
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
}

// Whether every word starts a word of the text (so «tema» doesn't find «sistema»).
const LETRA = /[\p{L}\p{N}]/u;
function empiezan(texto, palabras) {
  const t = plano(texto);
  return palabras.every((p) => {
    for (let i = t.indexOf(p); i !== -1; i = t.indexOf(p, i + 1)) if (i === 0 || !LETRA.test(t[i - 1])) return true;
    return false;
  });
}

/** What matches `consulta`: first where every word starts a word of the name (marked, `partes`), then where they do in
 * the name with its group and help, or, for a whole group or block, its place. At most `tope`. */
export function buscarEnAjustes(indice, consulta, tope = 8) {
  const palabras = palabrasDe(consulta);
  if (!palabras.length) return [];
  const porNombre = coincidencias(indice, consulta).filter((x) => empiezan(x.nombre, palabras));
  const ya = new Set(porNombre.map((x) => x.clave));
  const porTodo = indice
    .filter((x) => !ya.has(x.clave) && empiezan(`${x.nombre} ${x.de} ${x.ayuda} ${x.de ? '' : x.donde}`, palabras))
    .map((x) => ({ ...x, partes: [{ texto: x.nombre, marca: false }] }));
  // Groups before their choices, when both match by name.
  const nombre = [...porNombre].sort((a, b) => (a.de ? 1 : 0) - (b.de ? 1 : 0));
  return [...nombre, ...porTodo].slice(0, tope);
}
