// The strong version's movement and quality (Configuración, «Movimiento del fondo» and «Calidad del fondo»). It reads
// only the <html> attributes that public/ajustes.js writes, and draws on canvases fixed behind the page, above the CSS
// sky (styles/potentes.css): the painted sky (escenas.js), once per size and theme; with «Ultra», what lives over it
// (vida.js, WebGL); and what moves (particulas.js), frame by frame while the tab is on view. With «Baja» and no
// movement nothing is created and the CSS sky stays alone. High contrast keeps it all, softened (potentes.css).

/** What to draw from the <html> attributes, or null. `reducir`: the device asks for less motion. */
export function queDibujar(a, reducir = false) {
  if (a.potente !== 'si') return null;
  const calidad = ['media', 'alta', 'ultra'].includes(a.calidad) ? a.calidad : null;
  const quieto = a.movimiento === 'ninguno' || a.movimiento === 'reducido' || (a.movimiento === 'sistema' && reducir);
  const mueve = a.mueve === 'si' && !quieto;
  if (!calidad && !mueve) return null;
  // Batman is always dark (public/ajustes.js): with Lavanda, the same field at night.
  const tema = a.estilo === 'batman' && a.paleta === 'lavanda' ? 'lavandaNoche' : a.paleta || (a.tema === 'oscuro' ? 'oscuro' : 'claro');
  return { tema, calidad, mueve };
}

const ATRIBUTOS = {
  potente: 'data-potente',
  estilo: 'data-estilo',
  movimiento: 'data-movimiento',
  mueve: 'data-fondo-mueve',
  calidad: 'data-fondo-calidad',
  paleta: 'data-paleta',
  tema: 'data-tema',
};

const leerAtributos = () => Object.fromEntries(Object.entries(ATRIBUTOS).map(([k, a]) => [k, document.documentElement.getAttribute(a)]));

// The tallest window's height (100lvh, as the canvases in potentes.css), measured once with a hidden probe.
let sonda = null;
function altoDelFondo() {
  if (!sonda) {
    sonda = document.createElement('div');
    sonda.setAttribute('aria-hidden', 'true');
    sonda.style.cssText = 'position:fixed;top:0;left:0;width:0;height:100vh;height:100lvh;visibility:hidden;pointer-events:none';
    document.body.append(sonda);
  }
  return Math.round(sonda.getBoundingClientRect().height) || window.innerHeight;
}

function crearLienzo(nombre) {
  const c = document.createElement('canvas');
  c.className = `fondo-potente fondo-potente--${nombre}`;
  c.setAttribute('aria-hidden', 'true');
  document.body.prepend(c);
  return c;
}

/** Starts watching the settings. Once, from main.jsx. */
export function iniciarFondo() {
  if (typeof window === 'undefined' || typeof document === 'undefined' || !document.documentElement) return;
  const menos = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let actual = null;
  let escena = null;
  let mueve = null;
  let vidaLienzo = null;
  let vida = null;
  let ultimaVida = 0;
  let sistema = null;
  let cuadro = 0;
  let antes = 0;
  let modulos = null;
  let turno = 0;

  const cargar = () => (modulos ??= Promise.all([import('./escenas'), import('./particulas'), import('./ruido')]));

  const medir = (c, tope) => {
    const dpr = Math.min(window.devicePixelRatio || 1, tope);
    const ancho = window.innerWidth;
    const alto = altoDelFondo();
    c.width = Math.round(ancho * dpr);
    c.height = Math.round(alto * dpr);
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, ancho, alto };
  };

  const parar = () => {
    cancelAnimationFrame(cuadro);
    cuadro = 0;
  };

  const vuelta = (t) => {
    const dt = Math.min(0.05, (t - antes) / 1000 || 0);
    antes = t;
    const { ctx, ancho, alto } = mueve._medida;
    sistema.paso(dt);
    ctx.clearRect(0, 0, ancho, alto);
    sistema.pintar(ctx);
    // What lives over the sky, at 30 frames a second: slow shapes don't need more, and the GPU rests.
    if (vida && t - ultimaVida > 32) {
      ultimaVida = t;
      vida.pintar(t / 1000);
    }
    cuadro = requestAnimationFrame(vuelta);
  };

  const andar = () => {
    parar();
    if (!sistema || !mueve || document.visibilityState !== 'visible') return;
    antes = performance.now();
    cuadro = requestAnimationFrame(vuelta);
  };

  const soltarVida = () => {
    vida?.soltar();
    vidaLienzo?.remove();
    vida = vidaLienzo = null;
  };

  const dibujar = async () => {
    const yo = ++turno;
    const plan = queDibujar(leerAtributos(), Boolean(menos?.matches));
    document.documentElement.toggleAttribute('data-fondo-lienzo', Boolean(plan));
    if (!plan) {
      parar();
      soltarVida();
      escena?.remove();
      mueve?.remove();
      escena = mueve = sistema = actual = null;
      return;
    }
    const [{ pintarEscena }, { crearParticulas }, { aRgb }] = await cargar();
    const vivo = plan.calidad === 'ultra' ? await import('./vida') : null;
    if (yo !== turno) return;
    const fondo = aRgb(getComputedStyle(document.documentElement).getPropertyValue('--fondo'));
    actual = plan;
    parar();

    if (plan.calidad) {
      escena ??= crearLienzo('escena');
      const { ctx, ancho, alto } = medir(escena, 2);
      ctx.clearRect(0, 0, ancho, alto);
      pintarEscena(ctx, plan.tema, ancho, alto, { fondo }, plan.calidad);
      // Still: what would move is painted once, into the sky.
      if (!plan.mueve) crearParticulas(plan.tema, ancho, alto)?.pintar(ctx);
    } else {
      escena?.remove();
      escena = null;
    }

    // A new canvas each time: a WebGL context let go can't be used again.
    soltarVida();
    if (vivo && escena) {
      vidaLienzo = crearLienzo('vida');
      escena.after(vidaLienzo);
      vida = vivo.crearVida(vidaLienzo, plan.tema, window.innerWidth, altoDelFondo());
      if (!vida) soltarVida();
      // Still: one frame, always the same.
      else if (!plan.mueve) vida.pintar(40);
    }

    if (plan.mueve) {
      mueve ??= crearLienzo('mueve');
      // After the sky, so it stays on top of it.
      (vidaLienzo ?? escena)?.after(mueve);
      mueve._medida = medir(mueve, 1.5);
      sistema = crearParticulas(plan.tema, mueve._medida.ancho, mueve._medida.alto);
      andar();
    } else {
      mueve?.remove();
      mueve = sistema = null;
    }
  };

  let espera = 0;
  const pronto = () => {
    clearTimeout(espera);
    espera = setTimeout(dibujar, 120);
  };

  // public/ajustes.js writes every attribute on any change of the settings, even with the same value: only a real change
  // paints again, or the sky would start over (and its animation with it) each time something else changes.
  const cambioDeVerdad = (cambios) => cambios.some((c) => c.oldValue !== document.documentElement.getAttribute(c.attributeName));
  new MutationObserver((cambios) => cambioDeVerdad(cambios) && pronto()).observe(document.documentElement, {
    attributes: true,
    attributeOldValue: true,
    attributeFilter: Object.values(ATRIBUTOS),
  });
  // On a phone the address bar changes the window's height while scrolling, but not the tallest window the canvases
  // measure (100lvh, potentes.css): only a new width or a new tallest height (rotating, a split screen) paints again.
  let medida = [window.innerWidth, altoDelFondo()];
  window.addEventListener('resize', () => {
    const [ancho, alto] = medida;
    if (window.innerWidth === ancho && altoDelFondo() === alto) return;
    medida = [window.innerWidth, altoDelFondo()];
    if (actual) pronto();
  });
  menos?.addEventListener?.('change', pronto);
  document.addEventListener('visibilitychange', () => (document.visibilityState === 'visible' ? andar() : parar()));
  dibujar();
}
