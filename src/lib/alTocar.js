// Touching a link to a main screen (the finger down, before the click): what that screen asks the campus first leaves
// already, and waits in conCache for it. The same reads the screen makes, through the same functions: what is already
// in memory asks nothing again. Never the screen's code (its styles would load on the screen still open).
import { alumnoListo, cargarContenido, cargarConversaciones, cargarMaterias, cargarMes, cargarNombres } from './campus';
import { esDemo } from './modoDemo';
import { tokenActual } from './sesion';

const nada = () => {};

const PANTALLAS = [
  [/^materias\/?$/, () => cargarMaterias()],
  [
    /^materias\/(\d+)\/?$/,
    async (id) => {
      await alumnoListo();
      const { enCurso, otras } = await cargarMaterias();
      const materia = [...enCurso, ...otras].find((m) => String(m.id) === id);
      if (materia) await cargarContenido(materia);
    },
  ],
  [
    /^calendario\/?$/,
    () => {
      const hoy = new Date();
      return Promise.all([cargarMes(hoy.getFullYear(), hoy.getMonth() + 1), cargarNombres()]);
    },
  ],
  [/^mensajes\/?$/, () => cargarConversaciones(0)],
];

/** What `ruta` (a path from the site's base, without query) asks for first, sent now. True if it was one of them. */
export function adelantarPantalla(ruta) {
  const token = tokenActual();
  if (!token || esDemo(token)) return false;
  for (const [patron, pedir] of PANTALLAS) {
    const partes = patron.exec(ruta);
    if (!partes) continue;
    try {
      Promise.resolve(pedir(...partes.slice(1))).catch(nada);
    } catch {
      // Drawing from what was kept: no campus, the screen does it.
    }
    return true;
  }
  return false;
}

/** Listens for a finger or a click going down on a link of the site (main.jsx). */
export function escucharToques(base = import.meta.env.BASE_URL) {
  const raiz = new URL(base, location.href).href;
  document.addEventListener(
    'pointerdown',
    (evento) => {
      if (evento.button !== 0) return;
      const enlace = evento.target instanceof Element ? evento.target.closest('a[href]') : null;
      if (!enlace || enlace.target === '_blank') return;
      const url = new URL(enlace.href, location.href);
      // An address with something after «?» opens the screen somewhere else (another month, a search): left alone.
      if (!url.href.startsWith(raiz) || url.search || url.pathname === location.pathname) return;
      adelantarPantalla(url.href.slice(raiz.length).split('#')[0]);
    },
    { capture: true, passive: true },
  );
}
