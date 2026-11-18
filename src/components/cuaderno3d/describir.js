// What the landing's 3D still life holds and where, as plain data: no three.js here, so the tests check the same
// numbers the scene draws. Axes and sizes come from medidas.js (mm, +y up, +z from the spine toward the free edge).
import { CUADERNO, DERIVADAS, ESPIRAL, LAPIZ, NOTA } from './medidas.js';
import { diasDeNotas } from './soporte.js';

const GRADO = Math.PI / 180;
// Tiny air between stacked faces, so coplanar faces never flicker.
export const AIRE = 0.03;

// ---------- Small vector helpers ----------
const rotX = ([x, y, z], a) => [x, y * Math.cos(a) - z * Math.sin(a), y * Math.sin(a) + z * Math.cos(a)];
const rotY = ([x, y, z], a) => [x * Math.cos(a) + z * Math.sin(a), y, -x * Math.sin(a) + z * Math.cos(a)];
const rotZ = ([x, y, z], a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a), z];
const sumar = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
/** Euler XYZ, the order three.js uses by default: the point turns about z, then y, then x. */
export const rotarXYZ = (p, [ax, ay, az]) => rotX(rotY(rotZ(p, az), ay), ax);

// ---------- Pencil ----------
const mitadCono = (LAPIZ.cono / 2) * GRADO;
const TAN_CONO = Math.tan(mitadCono);
// Round end of the graphite: a ball tangent to the cone, centred on the axis at x = 0. Its front is the tip.
const BOLA = LAPIZ.punta * Math.cos(mitadCono);
/** Cone radius at x, in the pencil's own frame (x = 0 is the centre of the tip's ball). */
export const radioCono = (x) => LAPIZ.punta + x * TAN_CONO;
const xDeRadio = (r) => (r - LAPIZ.punta) / TAN_CONO;

export const PUNTOS_LAPIZ = (() => {
  const punta = -BOLA;
  const fin = punta + LAPIZ.largo;
  const finGoma = fin;
  const inicioVirola = finGoma - LAPIZ.goma.afuera - LAPIZ.virola.largo;
  return {
    punta,
    madera: xDeRadio(LAPIZ.mina / 2),
    inicioVirola,
    finVirola: inicioVirola + LAPIZ.virola.largo,
    fin,
  };
})();

/**
 * Rounded hexagon, the painted section. Points [y, z] counter-clockwise, flats facing 0°, 60°, ... (measured from +y
 * toward +z), so one flat faces -y and the pencil can lie on it.
 */
export function seccionHex({ apotema = DERIVADAS.apotema, esquina = LAPIZ.esquina, porCara = 7, porEsquina = 5 } = {}) {
  const puntos = [];
  const recto = (apotema - esquina) * Math.tan(Math.PI / 6);
  const centroEsquina = (apotema - esquina) / Math.cos(Math.PI / 6);
  for (let k = 0; k < 6; k++) {
    const a = (k * Math.PI) / 3;
    const n = [Math.cos(a), Math.sin(a)];
    const t = [-Math.sin(a), Math.cos(a)];
    for (let i = 0; i < porCara; i++) {
      const s = -recto + (2 * recto * i) / porCara;
      puntos.push([apotema * n[0] + s * t[0], apotema * n[1] + s * t[1]]);
    }
    const c = a + Math.PI / 6;
    const centro = [centroEsquina * Math.cos(c), centroEsquina * Math.sin(c)];
    for (let i = 0; i < porEsquina; i++) {
      const b = a + ((Math.PI / 3) * i) / porEsquina;
      puntos.push([centro[0] + esquina * Math.cos(b), centro[1] + esquina * Math.sin(b)]);
    }
  }
  return puntos;
}

/**
 * The wooden and painted body, from where the wood starts (cone radius = core radius) to the ferrule. Rings of the
 * hexagon clipped by the sharpening cone: wherever the hexagon sticks out of the cone it's cut to the cone, which
 * draws the scalloped edge of a real sharpened pencil. `pintado` marks the points still on the painted hexagon.
 */
export function anillosLapiz() {
  const seccion = seccionHex();
  const lejos = Math.max(...seccion.map(([y, z]) => Math.hypot(y, z)));
  const xa = xDeRadio(DERIVADAS.apotema);
  const xr = xDeRadio(lejos);
  const xs = [];
  for (let x = PUNTOS_LAPIZ.madera; x < xa - 0.4; x += 0.8) xs.push(x);
  for (let x = xa - 0.4; x < xr + 0.3; x += 0.12) xs.push(x);
  xs.push(PUNTOS_LAPIZ.inicioVirola);
  return xs.map((x) => {
    const rc = radioCono(x);
    const puntos = [];
    const pintado = [];
    for (const [y, z] of seccion) {
      const r = Math.hypot(y, z);
      if (r > rc) {
        puntos.push([(y * rc) / r, (z * rc) / r]);
        pintado.push(false);
      } else {
        puntos.push([y, z]);
        pintado.push(true);
      }
    }
    return { x, puntos, pintado };
  });
}

/** Lathe profiles [radius, x] around the pencil's axis: graphite, ferrule and eraser. */
export function perfilesLapiz() {
  const { punta, madera, inicioVirola: v, finVirola, fin } = PUNTOS_LAPIZ;
  const mina = [[0, punta]];
  for (let i = 1; i <= 6; i++) {
    const a = ((90 - LAPIZ.cono / 2) * GRADO * i) / 6;
    mina.push([BOLA * Math.sin(a), -BOLA * Math.cos(a)]);
  }
  mina.push([LAPIZ.mina / 2, madera], [LAPIZ.mina / 2 - 0.02, madera + 1.5], [0, madera + 1.5]);

  const R = LAPIZ.virola.diametro / 2;
  const surco = R - 0.16;
  const virola = [[DERIVADAS.apotema - 0.25, v], [R - 0.05, v + 0.12], [R, v + 0.45]];
  for (const c of [1.6, 2.6, finVirola - v - 2.6, finVirola - v - 1.6]) {
    virola.push([R, v + c - 0.35], [surco, v + c], [R, v + c + 0.35]);
  }
  virola.push([R, finVirola - 0.45], [R - 0.05, finVirola - 0.12], [LAPIZ.goma.diametro / 2 + 0.1, finVirola]);

  const g = LAPIZ.goma.diametro / 2;
  const borde = 1.1;
  const goma = [[g - 0.05, finVirola - 1], [g, finVirola - 0.5]];
  for (let i = 0; i <= 6; i++) {
    const a = ((Math.PI / 2) * i) / 6;
    goma.push([g - borde + borde * Math.cos(a), fin - borde + borde * Math.sin(a)]);
  }
  goma.push([0, fin]);
  return { mina, virola, goma };
}

/**
 * Distance from the axis to the pencil's underside (the -y side, where a flat faces down) at x. The hexagon's flat,
 * the cone near the point, and the round ferrule and eraser at the back.
 */
export function bajoLapiz(x) {
  const { punta, madera, inicioVirola, finVirola, fin } = PUNTOS_LAPIZ;
  if (x < punta || x > fin) return 0;
  if (x < madera) return Math.min(radioCono(Math.max(0, x)), LAPIZ.mina / 2);
  if (x < inicioVirola) return Math.min(radioCono(x), DERIVADAS.apotema);
  if (x <= finVirola) return LAPIZ.virola.diametro / 2;
  return LAPIZ.goma.diametro / 2;
}

/**
 * How a pencil rests on a flat surface: the lower hull of its underside, at the edge under its middle. Returns the
 * tilt that makes that edge level and how far the axis sits above the surface.
 */
export function apoyoLapiz() {
  const { punta, fin } = PUNTOS_LAPIZ;
  const puntos = [];
  for (let x = punta; x <= fin; x += 0.25) puntos.push([x, -bajoLapiz(x)]);
  const casco = [];
  for (const p of puntos) {
    while (casco.length >= 2) {
      const [a, b] = casco.slice(-2);
      if ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) <= 0) casco.pop();
      else break;
    }
    casco.push(p);
  }
  const medio = (punta + fin) / 2;
  let i = casco.findIndex((p) => p[0] >= medio);
  if (i <= 0) i = 1;
  const [a, b] = [casco[i - 1], casco[i]];
  const pendiente = (b[1] - a[1]) / (b[0] - a[0]);
  const corte = a[1] - pendiente * a[0];
  return { inclinacion: -Math.atan(pendiente), altura: -corte / Math.hypot(1, pendiente), apoyos: [a, b] };
}

// ---------- Sticky note ----------
/**
 * Grid of [x, y, z] in the note's own frame: flat on the adhesive band (the top, -z), then a soft curl up toward the
 * free end. Rows are spaced along the paper, so the curl keeps the note 76 mm long instead of stretching it.
 */
export function formaNota({ curva = 4, columnas = 2, filas = 12 } = {}) {
  const m = NOTA.lado / 2;
  const libre = NOTA.lado - NOTA.adhesivo;
  const filasPapel = [];
  let [y, z] = [0, -m];
  for (let j = 0; j <= filas; j++) {
    const s = (NOTA.lado * j) / filas;
    if (j > 0) {
      // Follow the curve y = curva·(u / libre)² in small steps until the paper walked this row's share.
      let falta = NOTA.lado / filas;
      while (falta > 1e-9) {
        const paso = Math.min(falta, 0.05);
        const u = Math.max(0, s - falta + paso - NOTA.adhesivo);
        const yNuevo = u > 0 ? curva * (u / libre) ** 2 : 0;
        const dy = yNuevo - y;
        z += Math.sqrt(Math.max(0, paso * paso - dy * dy));
        y = yNuevo;
        falta -= paso;
      }
    }
    filasPapel.push([y, z]);
  }
  const puntos = [];
  for (const [fy, fz] of filasPapel) {
    for (let i = 0; i <= columnas; i++) puntos.push([-m + (NOTA.lado * i) / columnas, fy, fz]);
  }
  return { puntos, columnas, filas };
}

// ---------- The still life ----------
/** Builds the whole scene description. Pure: same input, same output. */
export function describirEscena({ dias = diasDeNotas() } = {}) {
  const { largo, ancho, hoja, contratapa } = CUADERNO;
  const { sueltas, bloque, radioAnillo, tramoAgujeros } = DERIVADAS;
  const lomo = -ancho / 2;

  // Back board, block of sheets, the loose top sheets fanning out and the front cover, stacked with a hair of air.
  const yBloque = contratapa;
  const ySueltas = yBloque + bloque + AIRE;
  const abrir = 3 * GRADO;
  const hojas = Array.from({ length: sueltas }, (_, i) => ({
    tamano: [largo, hoja, ancho],
    pivote: [0, ySueltas + i * (hoja + AIRE), lomo],
    angulo: abrir * ((i + 1) / (sueltas + 1)) ** 1.3,
  }));
  const yTapa = ySueltas + sueltas * (hoja + AIRE);
  const grueso = yTapa + CUADERNO.tapa;

  // Wire loops, centred on the stack's height. The centre sits so the wire runs inside the hole at both faces (where
  // the round loop leans toward the spine) and at mid height (its innermost point): 1.25 mm short of the hole centre.
  const zAgujero = lomo + ESPIRAL.margen;
  const centroAnillo = [grueso / 2, zAgujero - radioAnillo + 1.25];
  const xs = Array.from({ length: ESPIRAL.agujeros }, (_, i) => -tramoAgujeros / 2 + i * ESPIRAL.paso);

  // The pencil rests on the front cover, diagonally, its point toward the front right.
  const apoyo = apoyoLapiz();
  const giroLapiz = 155 * GRADO;
  const medioLapiz = [18, 118];
  const mitad = (PUNTOS_LAPIZ.punta + PUNTOS_LAPIZ.fin) / 2;
  const direccion = [Math.cos(giroLapiz), -Math.sin(giroLapiz)];
  const lapiz = {
    // Cover-local position of the pencil frame's origin (the centre of the tip's ball), raised so its underside
    // clears the cover by AIRE.
    posicion: [medioLapiz[0] - mitad * direccion[0], CUADERNO.tapa + AIRE + apoyo.altura, medioLapiz[1] - mitad * direccion[1]],
    giro: giroLapiz,
    inclinacion: apoyo.inclinacion,
  };

  // Sticky notes floating around it, tilted toward the first view (yaw camara.giro, elevation camara.elevacion) so
  // their days read upright, each a little off so they don't look lined up.
  const notas = [
    { centro: [112, 74, -58], giro: [14 * GRADO, 14 * GRADO, -6 * GRADO], flota: { amplitud: 3.5, periodo: 5.6, fase: 0 } },
    { centro: [-150, 52, 98], giro: [18 * GRADO, 30 * GRADO, 8 * GRADO], flota: { amplitud: 3, periodo: 6.4, fase: 2.1 } },
    { centro: [176, 50, 92], giro: [12 * GRADO, 8 * GRADO, -10 * GRADO], flota: { amplitud: 3, periodo: 4.9, fase: 4.2 } },
  ].map((n, i) => ({ ...n, lado: NOTA.lado, color: `--materia-${i}`, ...dias[i], curva: 4, vaiven: 1.5 * GRADO }));

  const escena = {
    cuaderno: {
      contratapa: { tamano: [largo, contratapa, ancho], centro: [0, contratapa / 2, 0] },
      bloque: { tamano: [largo, bloque, ancho], centro: [0, yBloque + bloque / 2, 0] },
      hojas,
      tapa: { tamano: [largo, CUADERNO.tapa, ancho], pivote: [0, yTapa, lomo], angulo: abrir },
      agujeros: { tamano: ESPIRAL.agujero, xs, z: ESPIRAL.margen },
      anillos: { xs, par: ESPIRAL.par, radio: radioAnillo, alambre: ESPIRAL.alambre / 2, centro: centroAnillo },
      grueso,
    },
    lapiz,
    notas,
    camara: { fov: 26, elevacion: 40 * GRADO, minimo: 16 * GRADO, maximo: 74 * GRADO, giro: -20 * GRADO },
    vaiven: { amplitud: 9 * GRADO, periodo: 18 },
  };
  // The loops reach a hair below the back board: the invisible floor that catches shadows sits under them.
  escena.suelo = Math.min(0, centroAnillo[0] - radioAnillo - ESPIRAL.alambre / 2) - AIRE;
  return escena;
}

// ---------- Points in the scene's frame, for the framing and the tests ----------
const caja = ([sx, sy, sz], centro = [0, 0, 0]) => {
  const salida = [];
  for (const a of [-1, 1]) for (const b of [-1, 1]) for (const c of [-1, 1]) salida.push(sumar(centro, [(a * sx) / 2, (b * sy) / 2, (c * sz) / 2]));
  return salida;
};

/** From a sheet's or the cover's own frame (origin at its hinge, +z toward the free edge) to the scene. */
export const desdeBisagra = (pieza, p) => sumar(pieza.pivote, rotX(p, -pieza.angulo));
/** The other way: a scene point in a sheet's or the cover's own frame. */
export const haciaBisagra = (pieza, p) => rotX([p[0] - pieza.pivote[0], p[1] - pieza.pivote[1], p[2] - pieza.pivote[2]], pieza.angulo);
/** Corners of a hinged sheet or cover. */
export const esquinasHoja = (pieza) => caja(pieza.tamano, [0, pieza.tamano[1] / 2, pieza.tamano[2] / 2]).map((p) => desdeBisagra(pieza, p));

/** A pencil point (its own frame) in the scene, through the cover it lies on. */
export function lapizEnEscena(escena, p) {
  const { lapiz, cuaderno } = escena;
  const enTapa = sumar(lapiz.posicion, rotY(rotZ(p, lapiz.inclinacion), lapiz.giro));
  return desdeBisagra(cuaderno.tapa, enTapa);
}

/** Points on the pencil's surface every `paso` mm, in the scene: the clipped hexagon, then the round ferrule and eraser. */
export function puntosLapiz(escena, { paso = 2, vueltas = 12 } = {}) {
  const seccion = seccionHex({ porCara: Math.max(2, Math.round(vueltas / 6)), porEsquina: 3 });
  const salida = [];
  for (let x = PUNTOS_LAPIZ.punta; x <= PUNTOS_LAPIZ.fin + 1e-6; x += paso) {
    let anillo;
    if (x >= PUNTOS_LAPIZ.madera && x < PUNTOS_LAPIZ.inicioVirola) {
      const rc = radioCono(x);
      anillo = seccion.map(([y, z]) => {
        const r = Math.hypot(y, z);
        return r > rc ? [(y * rc) / r, (z * rc) / r] : [y, z];
      });
    } else {
      const r = bajoLapiz(x);
      anillo = Array.from({ length: vueltas }, (_, k) => [r * Math.cos((2 * Math.PI * k) / vueltas), r * Math.sin((2 * Math.PI * k) / vueltas)]);
    }
    for (const [y, z] of anillo) salida.push(lapizEnEscena(escena, [x, y, z]));
  }
  return salida;
}

/** A note's points in the scene at time t (seconds), floating included. `quieta` leaves it at rest. */
export function puntosNota(nota, { t = 0, quieta = false, curva = nota.curva } = {}) {
  const { puntos } = formaNota({ curva });
  const { y, giro } = posturaNota(nota, t, quieta);
  return puntos.map((p) => sumar([nota.centro[0], y, nota.centro[2]], rotarXYZ(p, giro)));
}

/** Where a note floats at time t: its height and its angles. */
export function posturaNota(nota, t, quieta) {
  if (quieta) return { y: nota.centro[1], giro: nota.giro };
  const fase = (2 * Math.PI * t) / nota.flota.periodo + nota.flota.fase;
  return {
    y: nota.centro[1] + nota.flota.amplitud * Math.sin(fase),
    giro: [nota.giro[0], nota.giro[1], nota.giro[2] + nota.vaiven * Math.sin(fase * 0.5 + 1)],
  };
}

/** Every point that bounds the still life, in the scene's frame. */
export function puntosEscena(escena) {
  const { cuaderno } = escena;
  const salida = [...caja(cuaderno.contratapa.tamano, cuaderno.contratapa.centro), ...caja(cuaderno.bloque.tamano, cuaderno.bloque.centro)];
  for (const h of cuaderno.hojas) salida.push(...esquinasHoja(h));
  salida.push(...esquinasHoja(cuaderno.tapa));
  const { xs, par, radio, alambre, centro } = cuaderno.anillos;
  for (const x of [xs[0] - par / 2, xs.at(-1) + par / 2]) {
    for (let k = 0; k < 16; k++) {
      const a = (2 * Math.PI * k) / 16;
      salida.push([x, centro[0] + (radio + alambre) * Math.sin(a), centro[1] + (radio + alambre) * Math.cos(a)]);
    }
  }
  salida.push(...puntosLapiz(escena, { paso: 5, vueltas: 6 }));
  for (const nota of escena.notas) {
    for (const s of [-1, 1]) salida.push(...puntosNota({ ...nota, centro: [nota.centro[0], nota.centro[1] + s * nota.flota.amplitud, nota.centro[2]] }, { quieta: true }));
  }
  return salida;
}

/** The camera's axes for an elevation (radians above the horizon), looking from +z toward the origin. */
export function ejesCamara(elevacion) {
  const [s, c] = [Math.sin(elevacion), Math.cos(elevacion)];
  return { derecha: [1, 0, 0], arriba: [0, c, -s], atras: [0, s, c] };
}

const punto = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * The tightest frame for these points turned by every yaw in `giros`, seen from `elevacion`. The camera keeps its
 * direction and slides sideways and up (cx, cy) so nothing is wasted on one side. `aspecto` is width / height,
 * `margen` the share of each half of the frame left empty. Returns the camera position: cx·right + cy·up + d·back.
 */
export function encuadrar(puntos, { giros, elevacion, aspecto, fov, margen = 0.05 }) {
  const tanV = Math.tan((fov * GRADO) / 2) * (1 - margen);
  const tanH = tanV * aspecto;
  const { derecha, arriba, atras } = ejesCamara(elevacion);
  let [P, M, Q, N] = [-Infinity, -Infinity, -Infinity, -Infinity];
  for (const g of giros) {
    for (const p of puntos) {
      const q = rotY(p, g);
      const [a, b, c] = [punto(q, derecha), punto(q, arriba), punto(q, atras)];
      P = Math.max(P, a + c * tanH);
      M = Math.max(M, -a + c * tanH);
      Q = Math.max(Q, b + c * tanV);
      N = Math.max(N, -b + c * tanV);
    }
  }
  const d = Math.max((P + M) / (2 * tanH), (Q + N) / (2 * tanV));
  return { d, cx: (P - M) / 2, cy: (Q - N) / 2 };
}

/** A point in the camera's view for a frame: [x / depth, y / depth], the tangents to compare with the field of view. */
export function proyectar(p, { d, cx, cy }, elevacion) {
  const { derecha, arriba, atras } = ejesCamara(elevacion);
  const fondo = d - punto(p, atras);
  return [(punto(p, derecha) - cx) / fondo, (punto(p, arriba) - cy) / fondo, fondo];
}

/** Yaw angles covering the gentle sway around a base yaw, to frame it once and keep the camera still. */
export const girosDeVaiven = (escena, base) => [-1, -0.5, 0, 0.5, 1].map((k) => base + k * escena.vaiven.amplitud);
