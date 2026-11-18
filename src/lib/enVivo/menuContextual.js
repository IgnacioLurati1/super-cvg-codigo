// The small menu of the right click in the tools of a live session (MenuContextual.jsx): what does not need a screen.
//
// A menu is a list of entries:
//   { etiqueta, hacer, atajo?, marcado?, rol?, deshabilitado? }  an item. `rol` 'radio' (one of a group, as a tool or
//                                                                a color) or 'check' (on or off, as Negrita) goes with
//                                                                `marcado`. `atajo` as 'Mod+B': Ctrl, or ⌘ on a Mac.
//   { fila: 'Color', items: [...] }                              a row of items (the colors), one stop each.
//   '-'                                                          a line between groups.

const MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');

/** A shortcut as it is said on this computer: 'Mod+Shift+Z' is Ctrl+Mayús+Z, or ⌘⇧Z on a Mac. */
export function atajo(texto, mac = MAC) {
  if (!texto) return '';
  const partes = texto.split('+');
  if (mac) {
    const signo = { Mod: '⌘', Shift: '⇧', Alt: '⌥', Ctrl: '⌃' };
    return partes.map((p) => signo[p] ?? p).join('');
  }
  const nombre = { Mod: 'Ctrl', Shift: 'Mayús', Supr: 'Supr' };
  return partes.map((p) => nombre[p] ?? p).join('+');
}

/** The items one goes through with the arrows, in order (the ones of a row, one after the other). */
export function aplanar(entradas) {
  return entradas.flatMap((e) => (e === '-' ? [] : e.fila ? e.items : [e]));
}

/** The next item that can be used, `paso` 1 or -1 from `desde`, going round. -1 if none. */
export function siguiente(items, desde, paso) {
  const n = items.length;
  for (let i = 1; i <= n; i++) {
    const k = (((desde + paso * i) % n) + n) % n;
    if (!items[k].deshabilitado) return k;
  }
  return -1;
}

/** The first or the last that can be used. */
export const primero = (items) => siguiente(items, -1, 1);
export const ultimo = (items) => siguiente(items, items.length, -1);

/** Typing a letter goes to the next item that starts with it. */
export function porLetra(items, desde, letra) {
  const l = letra.toLocaleLowerCase('es');
  const n = items.length;
  for (let i = 1; i <= n; i++) {
    const k = (desde + i) % n;
    const it = items[k];
    if (!it.deshabilitado && it.etiqueta.toLocaleLowerCase('es').normalize('NFD').replace(/[̀-ͯ]/g, '').startsWith(l)) return k;
  }
  return -1;
}

/** Where the browser's own menu belongs (spelling, pasting in a field): text fields of the page, not the tools. */
export function esCampo(el) {
  return Boolean(el?.closest?.('input, textarea, select, [contenteditable="true"]:not(.ProseMirror)'));
}

/** The keys that open the menu from the keyboard. */
export const abreMenu = (e) => e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10');
