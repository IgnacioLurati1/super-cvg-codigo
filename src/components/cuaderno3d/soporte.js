// The light part of the landing's 3D, safe for the main bundle: whether this device can show it and which days the
// notes show. three.js and the scene arrive only with import('./escena.js').

const SOFTWARE = /swiftshader|llvmpipe|softpipe|lavapipe|software|basic render/i;

/** Whether a WebGL renderer name is a CPU pretending to be a GPU. */
export const esPorSoftware = (renderizador) => SOFTWARE.test(renderizador ?? '');

let puede;
/** WebGL 2 (three.js needs it) on a real GPU, no data saver and some memory. Checked once.
 * On software rendering (SwiftShader, llvmpipe) the scene is drawn on the CPU and freezes the page for seconds, so the
 * sign-in screen goes without it. `failIfMajorPerformanceCaveat` alone doesn't catch it: Chrome hands out SwiftShader
 * anyway when it's allowed, so the renderer's name is checked too. */
export function puede3D() {
  if (puede !== undefined) return puede;
  try {
    if (typeof window === 'undefined' || navigator.connection?.saveData) return (puede = false);
    if (navigator.deviceMemory && navigator.deviceMemory < 2) return (puede = false);
    const gl = document.createElement('canvas').getContext('webgl2', { failIfMajorPerformanceCaveat: true });
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    const nombre = gl && (info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    puede = !!gl && !esPorSoftware(nombre);
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    puede = false;
  }
  return puede;
}

const DIAS_SEMANA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
// How many days ahead each note looks.
export const ADELANTE = [2, 6, 13];

/** Three upcoming days for the notes, counted from `fecha`: day of the month and short weekday. */
export function diasDeNotas(fecha = new Date()) {
  return ADELANTE.map((d) => {
    const f = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate() + d);
    return { dia: f.getDate(), semana: DIAS_SEMANA[f.getDay()] };
  });
}

/** The colors the scene takes from the site's variables, so theme, contrast and color-blind palettes apply. */
export function leerColores() {
  const estilo = getComputedStyle(document.documentElement);
  const leer = (nombre) => estilo.getPropertyValue(nombre).trim();
  return {
    accion: leer('--accion'),
    superficie: leer('--superficie'),
    superficie2: leer('--superficie-2'),
    resaltador: leer('--resaltador'),
    borde: leer('--borde'),
    materias: [0, 1, 2].map((i) => leer(`--materia-${i}`)),
    oscuro: document.documentElement.dataset.tema === 'oscuro',
  };
}
