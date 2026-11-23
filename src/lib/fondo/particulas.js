// The things that move in the strong version of each theme (fondo.js): twinkling stars and shooting ones, petals,
// fireflies, dust in the lamp's light, embers, snow and clouds. Each system is `{ paso(dt), pintar(ctx) }`, in CSS
// pixels: `paso` moves it (seconds), `pintar` draws it as it is. Still, it's drawn once into the painted sky.

import { azar, crearRuido } from './ruido';

/** A canvas apart, to draw a sprite once and stamp it many times. */
export const lienzo = (ancho, alto) => {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(ancho));
  c.height = Math.max(1, Math.ceil(alto));
  return c;
};

const brillos = new Map();
/** A soft round light of that color (r, g, b), `radio` px: a bright center that fades. */
export function brillo(r, g, b, radio, centro = 0.25) {
  const clave = `${r},${g},${b},${radio},${centro}`;
  if (brillos.has(clave)) return brillos.get(clave);
  const c = lienzo(radio * 2, radio * 2);
  const x = c.getContext('2d');
  const grad = x.createRadialGradient(radio, radio, 0, radio, radio, radio);
  grad.addColorStop(0, `rgb(${r} ${g} ${b} / 1)`);
  grad.addColorStop(centro, `rgb(${r} ${g} ${b} / 0.45)`);
  grad.addColorStop(1, `rgb(${r} ${g} ${b} / 0)`);
  x.fillStyle = grad;
  x.fillRect(0, 0, radio * 2, radio * 2);
  brillos.set(clave, c);
  return c;
}

// How many for this screen: by area, between a floor and a ceiling, so a phone doesn't carry what a monitor does.
const cuantas = (ancho, alto, porMillon, minimo, maximo) => Math.round(Math.min(maximo, Math.max(minimo, (ancho * alto * porMillon) / 1e6)));

// Back in from the other side when it leaves, with a margin so it doesn't pop at the edge.
const envolver = (p, ancho, alto, margen) => {
  if (p.x < -margen) p.x += ancho + margen * 2;
  else if (p.x > ancho + margen) p.x -= ancho + margen * 2;
  if (p.y < -margen) p.y += alto + margen * 2;
  else if (p.y > alto + margen) p.y -= alto + margen * 2;
};

function estrellas(ancho, alto, r, { color = [255, 255, 255], fugaces = true, hasta = 1 } = {}) {
  const lista = Array.from({ length: cuantas(ancho, alto, 70, 40, 160) }, () => ({
    x: r() * ancho,
    y: Math.pow(r(), 1.3) * alto * hasta,
    radio: 3 + r() * 5,
    base: 0.35 + r() * 0.55,
    fase: r() * Math.PI * 2,
    ritmo: 0.6 + r() * 1.8,
  }));
  let t = 0;
  let fugaz = null;
  let espera = 4 + r() * 6;
  const sprite = brillo(...color, 8, 0.12);
  return {
    paso(dt) {
      t += dt;
      if (!fugaces) return;
      if (fugaz) {
        fugaz.vida += dt;
        if (fugaz.vida > fugaz.dura) fugaz = null;
      } else if ((espera -= dt) <= 0) {
        const angulo = Math.PI * (0.12 + r() * 0.16);
        fugaz = { x: ancho * (0.1 + r() * 0.7), y: alto * r() * 0.35, vx: Math.cos(angulo) * 900, vy: Math.sin(angulo) * 900, vida: 0, dura: 0.7 + r() * 0.4 };
        espera = 7 + r() * 10;
      }
    },
    pintar(ctx) {
      for (const e of lista) {
        ctx.globalAlpha = e.base * (0.55 + 0.45 * Math.sin(t * e.ritmo + e.fase));
        ctx.drawImage(sprite, e.x - e.radio, e.y - e.radio, e.radio * 2, e.radio * 2);
      }
      ctx.globalAlpha = 1;
      if (fugaz) {
        const v = fugaz.vida / fugaz.dura;
        const x = fugaz.x + fugaz.vx * fugaz.vida;
        const y = fugaz.y + fugaz.vy * fugaz.vida;
        const largo = 0.16;
        const grad = ctx.createLinearGradient(x, y, x - fugaz.vx * largo, y - fugaz.vy * largo);
        const alfa = Math.sin(v * Math.PI) * 0.9;
        grad.addColorStop(0, `rgb(255 255 255 / ${alfa})`);
        grad.addColorStop(1, 'rgb(255 255 255 / 0)');
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - fugaz.vx * largo, y - fugaz.vy * largo);
        ctx.stroke();
      }
    },
  };
}

// A petal: two arcs, a notch at the tip, its own tint. Falls, sways and turns.
function petalos(ancho, alto, r, { colores, tamano = 1, porMillon = 40 }) {
  const lista = Array.from({ length: cuantas(ancho, alto, porMillon, 14, 70) }, () => ({
    x: r() * ancho,
    y: r() * alto,
    lado: (5 + r() * 5) * tamano,
    cae: 18 + r() * 26,
    vaiven: 10 + r() * 22,
    fase: r() * Math.PI * 2,
    giro: (r() - 0.5) * 1.6,
    angulo: r() * Math.PI * 2,
    color: colores[Math.floor(r() * colores.length)],
    alfa: 0.45 + r() * 0.2,
  }));
  let t = 0;
  return {
    paso(dt) {
      t += dt;
      for (const p of lista) {
        p.y += p.cae * dt;
        p.x += (Math.sin(t * 0.8 + p.fase) * p.vaiven + 12) * dt;
        p.angulo += p.giro * dt;
        envolver(p, ancho, alto, 20);
      }
    },
    pintar(ctx) {
      for (const p of lista) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angulo);
        // Seen from the side as it turns: narrower and wider.
        ctx.scale(1, 0.55 + 0.45 * Math.abs(Math.sin(t * 1.3 + p.fase)));
        const s = p.lado;
        ctx.beginPath();
        ctx.moveTo(0, -s);
        ctx.quadraticCurveTo(s * 0.9, -s * 0.2, 0, s);
        ctx.quadraticCurveTo(-s * 0.9, -s * 0.2, 0, -s);
        ctx.fillStyle = `rgb(${p.color.join(' ')} / ${p.alfa})`;
        ctx.fill();
        ctx.restore();
      }
    },
  };
}

// Fireflies: they wander along the noise and light up for a while, then go dark.
function luciernagas(ancho, alto, r, { color = [226, 255, 120], desde = 0.25 } = {}) {
  const ruido = crearRuido(Math.floor(r() * 1e9));
  const lista = Array.from({ length: cuantas(ancho, alto, 22, 10, 45) }, () => ({
    x: r() * ancho,
    y: alto * (desde + r() * (1 - desde)),
    semilla: r() * 100,
    fase: r() * 10,
    ritmo: 0.25 + r() * 0.35,
    radio: 10 + r() * 8,
  }));
  const sprite = brillo(...color, 18, 0.12);
  let t = 0;
  return {
    paso(dt) {
      t += dt;
      for (const f of lista) {
        const a = ruido.ruido(f.semilla, t * 0.15) * Math.PI * 4;
        f.x += Math.cos(a) * 16 * dt;
        f.y += Math.sin(a) * 12 * dt;
        envolver(f, ancho, alto, 30);
      }
    },
    pintar(ctx) {
      for (const f of lista) {
        // On for about a third of its cycle, with a soft rise and fall.
        const ciclo = (t * f.ritmo + f.fase) % 1;
        const luz = ciclo < 0.35 ? Math.sin((ciclo / 0.35) * Math.PI) : 0.08;
        ctx.globalAlpha = 0.7 * luz;
        ctx.drawImage(sprite, f.x - f.radio, f.y - f.radio, f.radio * 2, f.radio * 2);
      }
      ctx.globalAlpha = 1;
    },
  };
}

// Dust floating slowly; brighter where the lamp shines (top right).
function polvo(ancho, alto, r) {
  const lista = Array.from({ length: cuantas(ancho, alto, 45, 20, 90) }, () => ({
    x: r() * ancho,
    y: r() * alto,
    vx: (r() - 0.5) * 6,
    vy: (r() - 0.5) * 4 - 2,
    radio: 2 + r() * 3,
    fase: r() * 6,
  }));
  const sprite = brillo(255, 214, 160, 6, 0.2);
  let t = 0;
  return {
    paso(dt) {
      t += dt;
      for (const p of lista) {
        p.x += (p.vx + Math.sin(t * 0.3 + p.fase) * 3) * dt;
        p.y += p.vy * dt;
        envolver(p, ancho, alto, 10);
      }
    },
    pintar(ctx) {
      for (const p of lista) {
        const lampara = Math.max(0, 1 - Math.hypot(p.x - ancho * 0.88, p.y) / (Math.max(ancho, alto) * 0.7));
        ctx.globalAlpha = 0.12 + 0.5 * lampara;
        ctx.drawImage(sprite, p.x - p.radio, p.y - p.radio, p.radio * 2, p.radio * 2);
      }
      ctx.globalAlpha = 1;
    },
  };
}

// Embers: born below, they rise wobbling, flicker and burn out.
function brasas(ancho, alto, r) {
  const nueva = (p = {}, alAzar = false) =>
    Object.assign(p, {
      x: r() * ancho,
      y: alAzar ? alto * (0.3 + r() * 0.7) : alto + 10,
      sube: 30 + r() * 50,
      fase: r() * 6,
      radio: 3 + r() * 5,
      vida: 0,
      dura: 4 + r() * 6,
    });
  const lista = Array.from({ length: cuantas(ancho, alto, 45, 18, 90) }, () => {
    const p = nueva({}, true);
    p.vida = r() * p.dura;
    return p;
  });
  const sprite = brillo(255, 170, 60, 10, 0.18);
  let t = 0;
  return {
    paso(dt) {
      t += dt;
      for (const p of lista) {
        p.vida += dt;
        p.y -= p.sube * dt;
        p.x += Math.sin(t * 1.7 + p.fase) * 14 * dt;
        if (p.vida > p.dura || p.y < -10) nueva(p);
      }
    },
    pintar(ctx) {
      for (const p of lista) {
        const v = p.vida / p.dura;
        ctx.globalAlpha = 0.6 * Math.sin(v * Math.PI) * (0.75 + 0.25 * Math.sin(t * 9 + p.fase * 3));
        ctx.drawImage(sprite, p.x - p.radio, p.y - p.radio, p.radio * 2, p.radio * 2);
      }
      ctx.globalAlpha = 1;
    },
  };
}

// Snow in three depths: the near flakes bigger, faster and brighter.
function nieve(ancho, alto, r) {
  const lista = Array.from({ length: cuantas(ancho, alto, 90, 40, 180) }, () => {
    const cerca = r();
    return { x: r() * ancho, y: r() * alto, cerca, radio: 1.5 + cerca * 3.5, cae: 15 + cerca * 45, fase: r() * 6 };
  });
  const sprite = brillo(255, 255, 255, 6, 0.45);
  let t = 0;
  return {
    paso(dt) {
      t += dt;
      for (const p of lista) {
        p.y += p.cae * dt;
        p.x += (Math.sin(t * 0.6 + p.fase) * 10 + 6) * dt;
        envolver(p, ancho, alto, 10);
      }
    },
    pintar(ctx) {
      for (const p of lista) {
        ctx.globalAlpha = 0.3 + p.cerca * 0.45;
        ctx.drawImage(sprite, p.x - p.radio, p.y - p.radio, p.radio * 2, p.radio * 2);
      }
      ctx.globalAlpha = 1;
    },
  };
}

// A cumulus painted from noise: white tops, grey-blue undersides, soft edges.
function nubeDeRuido(ancho, alto, semilla) {
  const ESCALA = 3;
  const w = Math.ceil(ancho / ESCALA);
  const h = Math.ceil(alto / ESCALA);
  const c = lienzo(w, h);
  const x = c.getContext('2d');
  const datos = x.createImageData(w, h);
  const ruido = crearRuido(semilla);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const dx = (i / w - 0.5) * 2;
      const dy = (j / h - 0.62) * 2.4;
      const forma = 1 - Math.min(1, dx * dx + dy * dy * (dy > 0 ? 3.2 : 1));
      const n = ruido.capas(i / 18, j / 18, 5);
      const densidad = Math.max(0, Math.min(1, (forma * 1.2 + n - 0.95) * 3));
      const sombra = Math.max(0, Math.min(1, (j / h - 0.35) * 1.6 - (n - 0.5)));
      const k = (j * w + i) * 4;
      datos.data[k] = 255 - 50 * sombra;
      datos.data[k + 1] = 255 - 36 * sombra;
      datos.data[k + 2] = 255 - 18 * sombra;
      datos.data[k + 3] = 255 * densidad * 0.92;
    }
  }
  x.putImageData(datos, 0, 0);
  return c;
}

function nubes(ancho, alto, r) {
  const lista = Array.from({ length: Math.max(3, Math.round(ancho / 330)) }, () => {
    const w = 220 + r() * 260;
    return {
      sprite: nubeDeRuido(w, w * 0.45, Math.floor(r() * 1e9)),
      x: r() * ancho,
      y: alto * (0.02 + Math.pow(r(), 1.6) * 0.5),
      w,
      h: w * 0.45,
      va: 4 + r() * 6,
    };
  });
  return {
    paso(dt) {
      for (const n of lista) {
        n.x += n.va * dt;
        if (n.x > ancho + 20) n.x = -n.w - 20;
      }
    },
    pintar(ctx) {
      for (const n of lista) ctx.drawImage(n.sprite, n.x, n.y, n.w, n.h);
    },
  };
}

const SISTEMAS = {
  claro: (a, h, r) => nubes(a, h, r),
  oscuro: (a, h, r) => estrellas(a, h, r, { hasta: 0.75 }),
  rosa: (a, h, r) => petalos(a, h, r, { colores: [[255, 190, 218], [255, 170, 205], [255, 214, 230]] }),
  bosque: (a, h, r) => luciernagas(a, h, r),
  cafe: (a, h, r) => polvo(a, h, r),
  lavanda: (a, h, r) => petalos(a, h, r, { colores: [[176, 140, 230], [196, 168, 240], [160, 120, 220]], tamano: 0.7, porMillon: 30 }),
  // Lavanda with Batman (escenas.js, lavandaNoche): fireflies over the field.
  lavandaNoche: (a, h, r) => luciernagas(a, h, r, { color: [214, 180, 255], desde: 0.5 }),
  infierno: (a, h, r) => brasas(a, h, r),
  glaciar: (a, h, r) => nieve(a, h, r),
  cosmico: (a, h, r) => estrellas(a, h, r, { color: [240, 220, 255] }),
};

export const TEMAS_CON_PARTICULAS = Object.keys(SISTEMAS);

/** The system of that theme for a screen of that size, always the same for the same seed. null for another theme. */
export function crearParticulas(tema, ancho, alto, semilla = 7) {
  const crear = SISTEMAS[tema];
  return crear ? crear(ancho, alto, azar(semilla)) : null;
}
