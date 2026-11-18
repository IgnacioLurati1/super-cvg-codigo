// Following someone's view without jumps: the view glides toward the last place that arrived, and keeps gliding
// when a new one arrives mid-way (views come every ~120 ms, with the network's jitter). A spring with no bounce
// (critically damped, the «smooth damp» of games): it starts and stops softly, and a new target keeps the speed it had.
//
// A view is a plain object of numbers ({ y }, { cx, cy, z }, { giro, alza, dist }). Some numbers are angles (they go
// the short way round) and some are zooms (they glide in proportion, so zooming in and out feel the same).
//
// The stepping is pure (`avanzar`) and tested without frames; `crearSuave` runs it with requestAnimationFrame.

/** How long it takes: with this, a move is done (within 1%) in about a third of a second. */
export const TIEMPO = 0.1;
const DT_MAX = 0.05;
const VUELTA = Math.PI * 2;

/** One step of the spring for one number: where it is, its speed, where it goes, and the time since the last step. */
export function pasoSuave(x, v, objetivo, dt, tiempo = TIEMPO) {
  const omega = 2 / tiempo;
  const k = omega * dt;
  const e = 1 / (1 + k + 0.48 * k * k + 0.235 * k * k * k);
  const diferencia = x - objetivo;
  const t = (v + omega * diferencia) * dt;
  return [objetivo + (diferencia + t) * e, (v - omega * t) * e];
}

/** The same angle as `hasta`, the closest one to `desde` (from 350° to 10° it goes on to 370°, not back). */
export function anguloCerca(desde, hasta, vuelta = VUELTA) {
  const d = ((((hasta - desde) % vuelta) + vuelta * 1.5) % vuelta) - vuelta / 2;
  return desde + d;
}

const aEspacio = (k, valor, logs) => (logs.includes(k) ? Math.log(Math.max(valor, 1e-6)) : valor);
const deEspacio = (k, valor, logs) => (logs.includes(k) ? Math.exp(valor) : valor);

/**
 * One step for a whole view. `estado` is { x: { clave: valor }, v: { clave: velocidad } } in the spring's space (zooms
 * as logarithms); returns the next one, the view to show and whether it arrived (then the view is the target, exact).
 */
export function avanzar(estado, objetivo, dt, { tiempo = TIEMPO, angulos = [], logs = [], eps = {} } = {}) {
  const x = {};
  const v = {};
  const vista = {};
  let listo = true;
  for (const k of Object.keys(objetivo)) {
    let meta = aEspacio(k, objetivo[k], logs);
    const desde = estado.x[k] ?? meta;
    if (angulos.includes(k)) meta = anguloCerca(desde, meta);
    const [nx, nv] = pasoSuave(desde, estado.v[k] ?? 0, meta, Math.min(dt, DT_MAX), tiempo);
    const tope = eps[k] ?? 0.5;
    if (Math.abs(nx - meta) > tope || Math.abs(nv) * tiempo > tope) listo = false;
    x[k] = nx;
    v[k] = nv;
    vista[k] = deEspacio(k, nx, logs);
  }
  if (listo) return { estado: { x: {}, v: {} }, vista: { ...objetivo }, listo };
  return { estado: { x, v }, vista, listo };
}

/** The state to start from: where the view is now. */
export function desde(vista, logs = []) {
  return { x: Object.fromEntries(Object.entries(vista).map(([k, n]) => [k, aEspacio(k, n, logs)])), v: {} };
}

const pideMenos = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const RELOJ = {
  ahora: () => performance.now(),
  pedir: (fn) => requestAnimationFrame(fn),
  cancelar: (id) => cancelAnimationFrame(id),
};

/**
 * A view that glides. `aplicar(vista)` shows a view; `leer()` says where the view is now (to start from there).
 * `saltar(desde, hasta)` true goes straight there (a jump too long to glide). With reduced motion, or with the page
 * hidden, it goes straight there too. `parar()` stops where it is (the person took over, or stopped following).
 */
export function crearSuave({ aplicar, leer, saltar, alSaltar, tiempo, angulos, logs = [], eps, reloj = RELOJ, menos = pideMenos }) {
  let estado = null;
  let objetivo = null;
  let cuadro = 0;
  let antes = 0;
  let mostrada = null;
  const opciones = { tiempo, angulos, logs, eps };
  const parar = () => {
    if (cuadro) reloj.cancelar(cuadro);
    cuadro = 0;
    estado = null;
  };
  const paso = () => {
    cuadro = 0;
    if (!objetivo || !estado) return;
    const ahora = reloj.ahora();
    const r = avanzar(estado, objetivo, (ahora - antes) / 1000, opciones);
    antes = ahora;
    estado = r.listo ? null : r.estado;
    mostrada = r.vista;
    aplicar(r.vista);
    if (estado) cuadro = reloj.pedir(paso);
  };
  return {
    ir(nuevo) {
      objetivo = nuevo;
      // Mid-way, it goes on from what is shown; otherwise from where the view is now.
      const actual = estado ? mostrada : leer?.();
      const oculta = typeof document !== 'undefined' && document.visibilityState === 'hidden';
      const lejos = Boolean(actual) && !oculta && Boolean(saltar?.(actual, nuevo));
      if (!actual || oculta || menos() || lejos) {
        parar();
        if (lejos && !menos()) alSaltar?.();
        aplicar(nuevo);
        return;
      }
      if (!estado) {
        estado = desde(actual, logs);
        mostrada = actual;
        antes = reloj.ahora();
      }
      if (!cuadro) cuadro = reloj.pedir(paso);
    },
    parar,
    /** Straight to where it was going (the page is hidden: no frames come to glide). */
    terminar() {
      if (!cuadro || !objetivo) return;
      parar();
      aplicar(objetivo);
    },
    get andando() {
      return Boolean(cuadro);
    },
  };
}

/** A jump too long to glide shows as a short fade in of what arrived. */
export function fundir(el) {
  el?.animate?.([{ opacity: 0.3 }, { opacity: 1 }], { duration: 180, easing: 'ease-out' });
}
