// Whether the browser draws with the graphics card. Without it (hardware acceleration off, a broken driver, a blocked
// card), the strong version's sky is drawn by the processor: with movement it takes over ten cores and «Ultra» drops
// frames (measured 23/11). Configuración warns about it, nothing turns itself off.
//
// The question is asked to WebGL with `failIfMajorPerformanceCaveat`: the browser refuses that context when it would
// draw in software. It doesn't depend on the card's name, which Brave hides or changes against fingerprinting. The name
// is only a second look, when the browser does give one, for the software drawers that don't refuse.

const DE_SOFTWARE = /swiftshader|llvmpipe|softpipe|lavapipe|basic render|software/i;

let respuesta = null;

const soltar = (gl) => {
  try {
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    // Nothing to release.
  }
};

/** True when the browser draws without the graphics card. Asked once per visit. `doc` is for the tests. */
export function sinAceleracion(doc = globalThis.document) {
  if (respuesta !== null && doc === globalThis.document) return respuesta;
  let sin = false;
  try {
    const gl = doc.createElement('canvas').getContext('webgl', { failIfMajorPerformanceCaveat: true });
    if (!gl) sin = true;
    else {
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      const nombre = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      sin = typeof nombre === 'string' && DE_SOFTWARE.test(nombre);
      soltar(gl);
    }
  } catch {
    sin = true;
  }
  if (doc === globalThis.document) respuesta = sin;
  return sin;
}
