// The keyboard shortcuts of the PDF reader, in one list, in the shape of the site's own (src/lib/atajos.js):
// Configuración lists it with the rest, the reader shows it in its help and puts each one in the `aria-keyshortcuts` of
// its button.
//   `teclas`: pressed one after the other; `con`: pressed together; `siempre`: works even with the one-key ones off.
export const ATAJOS_DEL_LECTOR = {
  grupo: 'En el lector de PDF',
  lista: [
    { con: ['Ctrl', 'F'], texto: 'Buscar en el documento', siempre: true },
    { teclas: ['/'], texto: 'Buscar en el documento' },
    { teclas: ['Enter'], texto: 'Ir al resultado siguiente', siempre: true },
    { con: ['Mayús', 'Enter'], texto: 'Volver al resultado anterior', siempre: true },
    { teclas: ['+'], texto: 'Agrandar' },
    { teclas: ['-'], texto: 'Achicar' },
    { teclas: ['0'], texto: 'Ajustar al ancho' },
    { teclas: ['G'], texto: 'Ir a una página' },
    { teclas: ['M'], texto: 'Señalar esta página o sacarle el señalador' },
    { teclas: ['F2'], texto: 'Cambiarle el nombre al señalador elegido en la lista', siempre: true },
    { teclas: ['R'], texto: 'Resaltar lo que seleccionaste' },
    { teclas: ['N'], texto: 'Resaltar y escribir una nota' },
    { teclas: ['P'], texto: 'Abrir o cerrar las notas y páginas' },
    { teclas: ['F'], texto: 'Entrar o salir de pantalla completa' },
    { teclas: ['O'], texto: 'Pasar las páginas a oscuro o a claro' },
    { teclas: ['L'], texto: 'Leer en voz alta, pausar o seguir' },
    { teclas: ['?'], texto: 'Ver estos atajos' },
    { teclas: ['Esc'], texto: 'Cerrar lo que está abierto', siempre: true },
  ],
};

/** What L does (lector/Voz.jsx), to find it in the list. */
export const LEER_EN_VOZ = 'Leer en voz alta, pausar o seguir';

// How `aria-keyshortcuts` names each key.
const ARIA = { Ctrl: 'Control', Mayús: 'Shift', Esc: 'Escape', '?': 'Shift+?' };
const aria = (t) => ARIA[t] ?? t;

/** One of them as `aria-keyshortcuts` writes it. */
export const ariaDe = (a) => (a.con ? a.con.map(aria).join('+') : a.teclas.map(aria).join(' '));

/** The ones that work now: with the one-key ones off (ajustes.atajos), only those that always do. */
export const vigentes = (prendidos) => ATAJOS_DEL_LECTOR.lista.filter((a) => prendidos || a.siempre);

/** The `aria-keyshortcuts` of what does this, or undefined if nothing does it now. */
export function atajo(texto, prendidos) {
  const todos = vigentes(prendidos).filter((a) => a.texto === texto).map(ariaDe);
  return todos.length ? todos.join(' ') : undefined;
}
