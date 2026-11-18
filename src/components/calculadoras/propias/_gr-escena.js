// The scene of the 3D grapher (graficadora-3d.jsx), with three.js. It arrives only with import(), when the sheet is
// about to show it. It is El Santo Resumen's :::grafico3d (plantilla/w.js) with this site's pens: a cage with its
// floor squared like the sheet, the axes, and inside it surfaces with their pen lines, curves, points and vectors,
// the tangent plane at a point and the level curves. Colors come from the site's CSS variables, so theme, contrast
// and color-blind palettes apply. It draws only when something changed.
import {
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  LinearFilter,
  LineBasicMaterial,
  LineLoop,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PerspectiveCamera,
  Plane,
  Scene,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TubeGeometry,
  Vector3,
  WebGLRenderer,
} from 'three';
import { dec } from '../../../lib/calculadoras/decimales';
import { crearSuave } from '../../../lib/enVivo/suave';
import { curvaDeNivel, mallaDeFuncion, mallaImplicita, mallaParametrica, trazasDe } from '../../../lib/calculadoras/superficies';

/** Where the camera starts: turned a little and looking from above. */
export const VISTA = { giro: -0.68, alza: 0.46, dist: 1 };
const TOPE_ALZA = 1.45;
const DIST = [0.45, 2.5];
const LIMITE = 6;
const ARRIBA = new Vector3(0, 1, 0);
const PLUMAS = ['--foco', '--materia-1', '--materia-2', '--materia-3', '--texto'];

const entre = (v, a, b) => Math.max(a, Math.min(b, v));
const finito = Number.isFinite;

/** Round values to mark between a and b: 1, 2 or 5 times a power of ten apart. */
export function pasos(a, b, cuantos = 4) {
  const crudo = (b - a) / cuantos;
  const base = 10 ** Math.floor(Math.log10(crudo));
  const paso = [1, 2, 5, 10].map((m) => m * base).find((p) => p >= crudo * 0.999) ?? base * 10;
  const lista = [];
  for (let i = Math.ceil(a / paso - 1e-9); i * paso <= b + paso * 1e-9; i += 1) lista.push(Number((i * paso).toPrecision(12)));
  return lista;
}

/** The site's colors, whatever way the CSS writes them: painted on a pixel and read back. */
function leerColores(caja) {
  const estilo = getComputedStyle(caja);
  const lienzo = document.createElement('canvas');
  lienzo.width = 1;
  lienzo.height = 1;
  const d = lienzo.getContext('2d', { willReadFrequently: true });
  const leer = (nombre) => {
    d.clearRect(0, 0, 1, 1);
    d.fillStyle = '#888';
    d.fillStyle = estilo.getPropertyValue(nombre).trim() || '#888';
    d.fillRect(0, 0, 1, 1);
    const [r, g, b] = d.getImageData(0, 0, 1, 1).data;
    return { css: `rgb(${r} ${g} ${b})`, tres: new Color().setRGB(r / 255, g / 255, b / 255, SRGBColorSpace) };
  };
  return {
    texto: leer('--texto'),
    suave: leer('--texto-suave'),
    borde: leer('--borde'),
    papel: leer('--superficie'),
    resaltador: leer('--resaltador'),
    series: PLUMAS.map(leer),
    familia: estilo.fontFamily || 'sans-serif',
  };
}

/** The colors in one line, to tell whether they changed. */
const firma = (c) => [c.texto, c.suave, c.borde, c.papel, c.resaltador, ...c.series].map((x) => x.css).join('|') + c.familia;

/** A convex polygon of points [x, y, z], cut to the side of z that `dentro` accepts. */
function recortar(poligono, limite, arriba) {
  const dentro = (p) => (arriba ? p[2] <= limite : p[2] >= limite);
  const salida = [];
  poligono.forEach((a, i) => {
    const b = poligono[(i + 1) % poligono.length];
    if (dentro(a)) salida.push(a);
    if (dentro(a) !== dentro(b)) {
      const t = (limite - a[2]) / (b[2] - a[2]);
      salida.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, limite]);
    }
  });
  return salida;
}

// The sheet goes away while the board has a mistake and comes back with the next key. The renderer waits a moment
// for it, with its programs compiled, instead of being built again each time.
let guardado = null;
const soltarGuardado = () => {
  if (!guardado) return;
  clearTimeout(guardado.reloj);
  guardado.renderer.dispose();
  guardado.renderer.forceContextLoss();
  guardado = null;
};
function tomarRenderer() {
  if (guardado) {
    clearTimeout(guardado.reloj);
    const { renderer } = guardado;
    guardado = null;
    return renderer;
  }
  try {
    return new WebGLRenderer({ antialias: true, alpha: true });
  } catch {
    return null;
  }
}

/**
 * The scene inside `caja`. Gives null without WebGL. `alPerder` is called if the browser takes the 3D away.
 * poner(modelo) draws what graficadora3d.js read; girar, acercar and reiniciar move the camera. In a live session,
 * `alGirar(camara)` hears where the student took it by hand ({ giro, alza, dist }), and ponerCamara takes it where
 * someone else looks, without a word back.
 */
export function crearEscena(caja, { quieto = false, alPerder, alGirar } = {}) {
  const renderer = tomarRenderer();
  if (!renderer) return null;
  renderer.setClearColor(0x000000, 0);
  renderer.localClippingEnabled = true;
  const lienzo = renderer.domElement;
  lienzo.className = 'gr-escena__lienzo';
  lienzo.setAttribute('aria-hidden', 'true');
  caja.append(lienzo);

  const escena = new Scene();
  const cam = new PerspectiveCamera(26, 1, 0.05, 80);
  escena.add(new HemisphereLight(0xffffff, 0x9aa3b8, 1.7));
  const luz = new DirectionalLight(0xffffff, 1.5);
  escena.add(luz);
  const fijos = new Group();
  const datos = new Group();
  escena.add(fijos, datos);
  const corte = [0, 1, 2, 3, 4, 5].map(() => new Plane());

  const camara = { ...VISTA };
  let c = leerColores(caja);
  let modelo = null;
  let centro = [0, 0, 0];
  let k = [1, 1, 1];
  let borde = [1, 1, 1];
  let marcas = { x: [], y: [], z: [] };
  let vivo = true;
  let sinMovimiento = quieto;
  let cuadro = 0;
  let viaje = 0;
  let alto = 0;
  let perdido = false;

  // x to the right, z up and y away: the exercise's axes, in the scene's.
  const aMundo = (x, y, z, v = new Vector3()) => v.set((x - centro[0]) * k[0], (z - centro[2]) * k[2], -(y - centro[1]) * k[1]);
  const acotar = (v) => v.set(entre(v.x, -LIMITE, LIMITE), entre(v.y, -LIMITE, LIMITE), entre(v.z, -LIMITE, LIMITE));

  function medir() {
    const { X, Y, Z } = modelo;
    const r = [X[1] - X[0], Y[1] - Y[0], Z[1] - Z[0]];
    const mayor = Math.max(...r);
    // Each unit as long as the others while the box keeps a shape that can be read; else, a cube.
    k = mayor / Math.min(...r) <= 3 ? r.map(() => 2 / mayor) : r.map((v) => 2 / v);
    centro = [(X[0] + X[1]) / 2, (Y[0] + Y[1]) / 2, (Z[0] + Z[1]) / 2];
    borde = [(r[0] * k[0]) / 2, (r[2] * k[2]) / 2, (r[1] * k[1]) / 2];
    const e = 1e-4;
    corte[0].set(new Vector3(1, 0, 0), borde[0] + e);
    corte[1].set(new Vector3(-1, 0, 0), borde[0] + e);
    corte[2].set(new Vector3(0, 1, 0), borde[1] + e);
    corte[3].set(new Vector3(0, -1, 0), borde[1] + e);
    corte[4].set(new Vector3(0, 0, 1), borde[2] + e);
    corte[5].set(new Vector3(0, 0, -1), borde[2] + e);
  }

  function vaciar(grupo) {
    grupo.traverse((o) => {
      o.geometry?.dispose();
      if (o.material) {
        o.material.map?.dispose();
        o.material.dispose();
      }
    });
    grupo.clear();
  }

  // ---------- Pieces ----------
  const geometria = (puntos) => new BufferGeometry().setFromPoints(puntos);

  function rotulo(texto, grupo, fuerte = false) {
    const lado = 2;
    const tela = document.createElement('canvas');
    const d = tela.getContext('2d');
    const fuente = `${fuerte ? 700 : 600} ${(fuerte ? 15 : 13) * lado}px ${c.familia}`;
    d.font = fuente;
    const ancho = Math.ceil(d.measureText(texto).width) + 12;
    const altura = 22 * lado;
    tela.width = ancho;
    tela.height = altura;
    d.font = fuente;
    d.textAlign = 'center';
    d.textBaseline = 'middle';
    // A rim in the color of the paper keeps a number readable over the lines.
    d.lineJoin = 'round';
    d.lineWidth = 6;
    d.strokeStyle = c.papel.css;
    d.strokeText(texto, ancho / 2, altura / 2 + 1);
    d.fillStyle = fuerte ? c.texto.css : c.suave.css;
    d.fillText(texto, ancho / 2, altura / 2 + 1);
    const t = new CanvasTexture(tela);
    t.colorSpace = SRGBColorSpace;
    t.minFilter = LinearFilter;
    t.generateMipmaps = false;
    const s = new Sprite(new SpriteMaterial({ map: t, depthTest: false, depthWrite: false, sizeAttenuation: false, transparent: true }));
    s.userData.tam = [ancho / lado, altura / lado];
    s.renderOrder = 10;
    grupo.add(s);
    return s;
  }

  // Labels keep their size in pixels whatever the height of the scene.
  function ajustarRotulos() {
    if (!alto) return;
    const f = 2 / (alto * cam.projectionMatrix.elements[5]);
    for (const g of [fijos, datos]) {
      g.traverse((o) => {
        if (o.isSprite) o.scale.set(o.userData.tam[0] * f, o.userData.tam[1] * f, 1);
      });
    }
  }

  function barra(a, b, radio, material, grupo) {
    const dir = new Vector3().subVectors(b, a);
    const largo = dir.length();
    if (largo < 1e-6) return;
    const m = new Mesh(new CylinderGeometry(radio, radio, largo, 8, 1), material);
    m.position.copy(a).addScaledVector(dir, 0.5);
    m.quaternion.setFromUnitVectors(ARRIBA, dir.normalize());
    grupo.add(m);
  }

  /** An arrowhead that ends at `b`, coming from `a`. */
  function punta(a, b, radio, largo, material, grupo) {
    const dir = new Vector3().subVectors(b, a);
    if (dir.length() < 1e-6) return;
    dir.normalize();
    const m = new Mesh(new ConeGeometry(radio, largo, 14), material);
    m.position.copy(b).addScaledVector(dir, -largo / 2);
    m.quaternion.setFromUnitVectors(ARRIBA, dir);
    grupo.add(m);
  }

  /** A line with body, through points of the scene. */
  function cordon(puntos, radio, material, grupo) {
    if (!puntos.length) return;
    const paso = Math.max(1, Math.ceil(puntos.length / 220));
    // Equal points in a row would leave the tube without a direction.
    const menos = puntos.filter((_, i) => i % paso === 0 || i === puntos.length - 1).filter((p, i, todos) => !i || p.distanceTo(todos[i - 1]) > 1e-9);
    if (menos.length === 1) {
      // A curve that never leaves one point is that point.
      const m = new Mesh(new SphereGeometry(radio * 2.4, 12, 10), material);
      m.position.copy(menos[0]);
      grupo.add(m);
      return m;
    }
    const cerrada = menos.length > 3 && menos[0].distanceTo(menos[menos.length - 1]) < 1e-6;
    if (cerrada) menos.pop();
    if (menos.length < 2) return;
    const curva = new CatmullRomCurve3(menos, cerrada, 'centripetal');
    const m = new Mesh(new TubeGeometry(curva, Math.min(440, menos.length * 2), radio, 6, cerrada), material);
    grupo.add(m);
    return m;
  }

  function mallaAMundo({ pos, idx }) {
    const p = new Float32Array(pos.length);
    const v = new Vector3();
    for (let i = 0; i < pos.length; i += 3) {
      acotar(aMundo(pos[i], pos[i + 1], pos[i + 2], v));
      p[i] = v.x;
      p[i + 1] = v.y;
      p[i + 2] = v.z;
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(p, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  function lineasAMundo(lineas) {
    const p = new Float32Array(lineas.length);
    const v = new Vector3();
    for (let i = 0; i < lineas.length; i += 3) {
      acotar(aMundo(lineas[i], lineas[i + 1], lineas[i + 2], v));
      p[i] = v.x;
      p[i + 1] = v.y;
      p[i + 2] = v.z;
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(p, 3));
    return g;
  }

  const piel = (color) =>
    new MeshLambertMaterial({ color, side: DoubleSide, clippingPlanes: corte, transparent: true, opacity: 0.88, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  const trazoSobre = () => new LineBasicMaterial({ color: c.papel.tres, clippingPlanes: corte, transparent: true, opacity: 0.75 });

  // ---------- The cage, the floor and the axes ----------
  function armarFijos() {
    vaciar(fijos);
    const { X, Y, Z } = modelo;
    const P = (i, j, l) => aMundo(X[i], Y[j], Z[l]);
    const jaula = [];
    for (const a of [0, 1]) {
      for (const b of [0, 1]) jaula.push(P(0, a, b), P(1, a, b), P(a, 0, b), P(a, 1, b), P(a, b, 0), P(a, b, 1));
    }
    fijos.add(new LineSegments(geometria(jaula), new LineBasicMaterial({ color: c.suave.tres, transparent: true, opacity: 0.6 })));

    const [px, py, pz] = [pasos(...X), pasos(...Y), pasos(...Z)];
    const piso = [];
    for (const x of px) piso.push(aMundo(x, Y[0], Z[0]), aMundo(x, Y[1], Z[0]));
    for (const y of py) piso.push(aMundo(X[0], y, Z[0]), aMundo(X[1], y, Z[0]));
    fijos.add(new LineSegments(geometria(piso), new LineBasicMaterial({ color: c.borde.tres })));

    // The axes go through the origin, or along the side of the box nearest to it.
    const o = [entre(0, ...X), entre(0, ...Y), entre(0, ...Z)];
    const tinta = new MeshBasicMaterial({ color: c.texto.tres });
    ['x', 'y', 'z'].forEach((letra, i) => {
      const [desde, hasta] = [[...o], [...o]];
      desde[i] = [X, Y, Z][i][0];
      hasta[i] = [X, Y, Z][i][1];
      const a = aMundo(...desde);
      const b = aMundo(...hasta);
      const dir = new Vector3().subVectors(b, a).normalize();
      const fin = b.clone().addScaledVector(dir, 0.16);
      barra(a, fin, 0.006, tinta, fijos);
      punta(a, fin, 0.024, 0.085, tinta, fijos);
      rotulo(letra, fijos, true).position.copy(fin).addScaledVector(dir, 0.1);
    });

    const cerca = (v, r) => Math.abs(v - r[0]) < (r[1] - r[0]) * 0.04;
    marcas = {
      x: px.map((v) => ({ v, s: rotulo(dec(v, 6), fijos) })),
      y: py.map((v) => ({ v, s: rotulo(dec(v, 6), fijos) })),
      // The lowest height would sit on top of the numbers of the floor.
      z: pz.filter((v) => !cerca(v, Z)).map((v) => ({ v, s: rotulo(dec(v, 6), fijos) })),
    };
  }

  // The numbers go on the sides of the box that face the camera, so they never end up behind the drawing.
  function ubicarMarcas() {
    if (!modelo) return;
    const { X, Y, Z } = modelo;
    const cx = cam.position.x >= 0 ? 1 : 0;
    const cy = cam.position.z >= 0 ? 0 : 1;
    const [sx, sz] = [cx ? 1 : -1, cy ? -1 : 1];
    for (const m of marcas.x) aMundo(m.v, Y[cy], Z[0], m.s.position).add(new Vector3(0, -0.07, sz * 0.11));
    for (const m of marcas.y) aMundo(X[cx], m.v, Z[0], m.s.position).add(new Vector3(sx * 0.11, -0.07, 0));
    // The heights, on the upright side that shows more to the left.
    const esquinas = [
      [X[cx], Y[1 - cy]],
      [X[1 - cx], Y[cy]],
    ];
    const enPantalla = esquinas.map(([x, y]) => aMundo(x, y, centro[2]).project(cam).x);
    const [x, y] = esquinas[enPantalla[0] <= enPantalla[1] ? 0 : 1];
    const afuera = aMundo(x, y, centro[2]).setY(0).normalize().multiplyScalar(0.13);
    for (const m of marcas.z) aMundo(x, y, m.v, m.s.position).add(afuera);
  }

  // ---------- What the exercise draws ----------
  function armarDatos() {
    vaciar(datos);
    const { X, Y, Z } = modelo;
    const altura = Z[1] - Z[0];
    const adentro = ([x, y, z]) => x >= X[0] && x <= X[1] && y >= Y[0] && y <= Y[1] && z >= Z[0] && z <= Z[1];
    // With several things, each one carries its number of the legend: color is not the only clue.
    const varios = modelo.trazos.length > 1;
    const numero = (i, donde) => varios && donde && rotulo(String(i + 1), datos, true).position.copy(donde).add(new Vector3(0, 0.1, 0));
    /** The highest corner of a mesh already in the scene's own axes. */
    const cima = (g) => {
      const p = g.getAttribute('position').array;
      let mejor = 0;
      for (let j = 3; j < p.length; j += 3) if (p[j + 1] > p[mejor + 1]) mejor = j;
      return new Vector3(p[mejor], p[mejor + 1], p[mejor + 2]);
    };
    for (const [i, t] of modelo.trazos.entries()) {
      const color = c.series[t.serie % c.series.length].tres;
      if (t.tipo === 'superficie' || t.tipo === 'parametrica') {
        const m = t.tipo === 'superficie' ? mallaDeFuncion(t.fn, X, Y, 56, 4, altura * 1.2) : mallaParametrica(...t.fns, t.U, t.V, 56, 4);
        if (!m.idx.length) continue;
        const g = mallaAMundo(m);
        datos.add(new Mesh(g, piel(color)));
        numero(i, cima(g));
        const pluma = new LineSegments(lineasAMundo(m.lineas), trazoSobre());
        pluma.renderOrder = 1;
        datos.add(pluma);
      } else if (t.tipo === 'ecuacion') {
        const m = mallaImplicita(t.F, X, Y, Z, 36);
        if (!m.idx.length) continue;
        const g = mallaAMundo(m);
        datos.add(new Mesh(g, piel(color)));
        numero(i, cima(g));
        const trazas = [];
        for (const linea of trazasDe(t.F, X, Y, Z, 5, 44)) {
          for (let i = 1; i < linea.length; i += 1) trazas.push(...linea[i - 1], ...linea[i]);
        }
        const pluma = new LineSegments(lineasAMundo(trazas), trazoSobre());
        pluma.renderOrder = 1;
        datos.add(pluma);
      } else if (t.tipo === 'curva') {
        const material = new MeshBasicMaterial({ color, clippingPlanes: corte });
        let tramo = [];
        let marcada = false;
        const cerrar = () => {
          if (tramo.length && !marcada) {
            numero(i, tramo[Math.floor(tramo.length / 3)]);
            marcada = true;
          }
          cordon(tramo, 0.014, material, datos);
          tramo = [];
        };
        for (let i = 0; i <= 320; i += 1) {
          const s = t.T[0] + ((t.T[1] - t.T[0]) * i) / 320;
          const p = t.fns.map((f) => f(s));
          if (p.every(finito)) tramo.push(acotar(aMundo(...p)));
          else cerrar();
        }
        cerrar();
      } else if (t.tipo === 'puntos') {
        // A point outside the box is not drawn: the sheet says so under the legend.
        const visibles = t.puntos.filter(adentro);
        for (const p of visibles) {
          const m = new Mesh(new SphereGeometry(0.04, 16, 12), new MeshBasicMaterial({ color }));
          aMundo(...p, m.position);
          datos.add(m);
        }
        if (visibles.length) numero(i, aMundo(...visibles[0]));
      } else if (t.tipo === 'vector') {
        // The box cuts what sticks out of it.
        const material = new MeshBasicMaterial({ color, clippingPlanes: corte });
        const [a, b] = [acotar(aMundo(...t.de)), acotar(aMundo(...t.a))];
        const largo = a.distanceTo(b);
        if (largo < 1e-6) continue;
        const cabeza = Math.min(0.13, largo * 0.4);
        barra(a, b.clone().addScaledVector(new Vector3().subVectors(a, b).normalize(), cabeza * 0.9), 0.012, material, datos);
        punta(a, b, 0.036, cabeza, material, datos);
        // Its number goes on the half that is inside the box, or at the end that is.
        const medio = new Vector3().addVectors(a, b).multiplyScalar(0.5);
        const [desde, hasta] = [adentro(t.de), adentro(t.a)];
        numero(i, desde && hasta ? medio : desde ? a.clone().lerp(b, Math.min(0.5, 0.3 / largo)) : hasta ? b.clone().lerp(a, Math.min(0.5, 0.3 / largo)) : null);
      }
    }

    if (modelo.niveles && modelo.f) {
      // Each level curve twice: at its height, where the plane z = k cuts the surface, and down on the floor.
      const arriba = new MeshBasicMaterial({ color: c.texto.tres, clippingPlanes: corte });
      const abajo = [];
      for (const nivel of modelo.niveles) {
        for (const linea of curvaDeNivel(modelo.f.fn, X, Y, nivel, 96)) {
          if (nivel >= Z[0] && nivel <= Z[1]) cordon(linea.map(([x, y]) => aMundo(x, y, nivel)), 0.009, arriba, datos);
          for (let i = 1; i < linea.length; i += 1) abajo.push(...linea[i - 1], Z[0], ...linea[i], Z[0]);
        }
      }
      if (abajo.length) datos.add(new LineSegments(lineasAMundo(abajo), new LineBasicMaterial({ color: c.texto.tres, transparent: true, opacity: 0.7 })));
    }

    const p = modelo.punto;
    if (p) {
      // The tangent plane, as a sheet around the point and inside the box.
      const [rx, ry] = [(X[1] - X[0]) * 0.3, (Y[1] - Y[0]) * 0.3];
      const [xa, xb] = [Math.max(X[0], p.x0 - rx), Math.min(X[1], p.x0 + rx)];
      const [ya, yb] = [Math.max(Y[0], p.y0 - ry), Math.min(Y[1], p.y0 + ry)];
      const z = (x, y) => p.fx * x + p.fy * y + p.c;
      let hoja = [
        [xa, ya],
        [xb, ya],
        [xb, yb],
        [xa, yb],
      ].map(([x, y]) => [x, y, z(x, y)]);
      hoja = recortar(recortar(hoja, Z[0], false), Z[1], true);
      // With P outside the box there is no sheet to draw around it.
      if (xa < xb && ya < yb && hoja.length >= 3) {
        const puntos = hoja.map((q) => aMundo(...q));
        const g = geometria(puntos);
        g.setIndex(puntos.slice(2).flatMap((_, i) => [0, i + 1, i + 2]));
        const plano = new Mesh(g, new MeshBasicMaterial({ color: c.resaltador.tres, side: DoubleSide, clippingPlanes: corte, transparent: true, opacity: 0.62, depthWrite: false }));
        plano.renderOrder = 2;
        datos.add(plano);
        const orilla = new LineLoop(geometria(puntos), new LineBasicMaterial({ color: c.texto.tres, clippingPlanes: corte }));
        orilla.renderOrder = 3;
        datos.add(orilla);
      }
      if (p.x0 >= X[0] && p.x0 <= X[1] && p.y0 >= Y[0] && p.y0 <= Y[1] && p.z0 >= Z[0] && p.z0 <= Z[1]) {
        const tinta = new MeshBasicMaterial({ color: c.texto.tres });
        const m = new Mesh(new SphereGeometry(0.036, 16, 12), tinta);
        aMundo(p.x0, p.y0, p.z0, m.position);
        m.renderOrder = 4;
        datos.add(m);
        // A thread down to the floor says where the point stands.
        datos.add(new LineSegments(geometria([aMundo(p.x0, p.y0, Z[0]), aMundo(p.x0, p.y0, p.z0)]), new LineBasicMaterial({ color: c.texto.tres })));
        rotulo('P', datos, true).position.copy(m.position).add(new Vector3(0, 0.11, 0));
      }
    }
  }

  // ---------- The camera ----------
  function ubicarCamara() {
    // Room around the box for the numbers on its sides.
    const radio = Math.hypot(...borde) * 0.93 + 0.17;
    const fovV = (cam.fov * Math.PI) / 360;
    const fovH = Math.atan(Math.tan(fovV) * cam.aspect);
    const d = (radio / Math.sin(Math.min(fovV, fovH))) * camara.dist;
    const [ce, se] = [Math.cos(camara.alza), Math.sin(camara.alza)];
    cam.position.set(d * ce * Math.cos(camara.giro), d * se, -d * ce * Math.sin(camara.giro));
    cam.lookAt(0, 0, 0);
    cam.updateMatrixWorld();
    luz.position.copy(cam.position).add(new Vector3(1.5, 3, 0));
  }

  function dibujar() {
    cuadro = 0;
    if (!vivo || !modelo || !alto) return;
    ubicarCamara();
    ubicarMarcas();
    renderer.render(escena, cam);
  }
  const pedir = () => {
    if (vivo && !cuadro) cuadro = requestAnimationFrame(dibujar);
  };

  function encuadrar() {
    const [W, H] = [caja.clientWidth, caja.clientHeight];
    if (!W || !H) return;
    alto = H;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(W, H, false);
    cam.aspect = W / H;
    cam.updateProjectionMatrix();
    ajustarRotulos();
    pedir();
  }

  // Following someone: the camera glides after theirs, which comes in bits, without starting over on each one.
  const seguida = crearSuave({
    aplicar: (v) => {
      Object.assign(camara, v);
      cancelAnimationFrame(cuadro);
      dibujar();
    },
    leer: () => ({ giro: camara.giro, alza: camara.alza, dist: camara.dist }),
    angulos: ['giro'],
    logs: ['dist'],
    eps: { giro: 0.001, alza: 0.001, dist: 0.001 },
    menos: () => sinMovimiento,
  });

  const frenarViaje = () => {
    seguida.parar();
    cancelAnimationFrame(viaje);
    viaje = 0;
  };

  const contar = (destino = camara) => alGirar?.({ giro: destino.giro, alza: destino.alza, dist: destino.dist });

  function girar(giro, alza) {
    frenarViaje();
    camara.giro += giro;
    camara.alza = entre(camara.alza + alza, -TOPE_ALZA, TOPE_ALZA);
    pedir();
    contar();
  }

  function acercar(factor) {
    frenarViaje();
    camara.dist = entre(camara.dist * factor, ...DIST);
    pedir();
    contar();
  }

  /** To `destino`, by the short way round. `deUna`: without the trip, as a key asks for it. */
  function viajarA(destino, deUna) {
    frenarViaje();
    const desde = { ...camara };
    const vuelta = Math.PI * 2;
    desde.giro = destino.giro + ((((desde.giro - destino.giro + Math.PI) % vuelta) + vuelta) % vuelta) - Math.PI;
    if (sinMovimiento || deUna) {
      Object.assign(camara, destino);
      pedir();
      return;
    }
    const inicio = performance.now();
    const paso = (ahora) => {
      const t = Math.min(1, (ahora - inicio) / 260);
      const s = 1 - (1 - t) ** 3;
      for (const q of ['giro', 'alza', 'dist']) camara[q] = desde[q] + (destino[q] - desde[q]) * s;
      // This frame is drawn here: one asked for in the meantime would draw it twice.
      cancelAnimationFrame(cuadro);
      dibujar();
      viaje = t < 1 && vivo ? requestAnimationFrame(paso) : 0;
    };
    viaje = requestAnimationFrame(paso);
  }

  /** Back to the first view. */
  function reiniciar(deUna = false) {
    viajarA({ ...VISTA }, deUna);
    contar(VISTA);
  }

  /** Where someone else looks: within the limits, and only numbers. */
  function ponerCamara(otra, deUna = false) {
    const ok = (v) => typeof v === 'number' && Number.isFinite(v);
    if (!otra || !ok(otra.giro) || !ok(otra.alza) || !ok(otra.dist)) return;
    const destino = { giro: entre(otra.giro, -1000, 1000), alza: entre(otra.alza, -TOPE_ALZA, TOPE_ALZA), dist: entre(otra.dist, ...DIST) };
    if (deUna) {
      viajarA(destino, true);
      return;
    }
    cancelAnimationFrame(viaje);
    viaje = 0;
    seguida.ir(destino);
  }

  // ---------- Hands on ----------
  let arrastre = null;
  const alBajar = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (arrastre) return;
    frenarViaje();
    arrastre = { id: e.pointerId, x: e.clientX, y: e.clientY, giro: camara.giro, alza: camara.alza };
    caja.setPointerCapture?.(e.pointerId);
    caja.dataset.arrastrando = '';
  };
  const alMover = (e) => {
    if (!arrastre || e.pointerId !== arrastre.id) return;
    camara.giro = arrastre.giro - (e.clientX - arrastre.x) * 0.01;
    camara.alza = entre(arrastre.alza + (e.clientY - arrastre.y) * 0.01, -TOPE_ALZA, TOPE_ALZA);
    pedir();
    contar();
  };
  const alSoltar = (e) => {
    if (!arrastre || e.pointerId !== arrastre.id) return;
    arrastre = null;
    delete caja.dataset.arrastrando;
  };
  const alTeclear = (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tecla = e.key;
    if (tecla === 'ArrowLeft') girar(0.12, 0);
    else if (tecla === 'ArrowRight') girar(-0.12, 0);
    else if (tecla === 'ArrowUp') girar(0, 0.12);
    else if (tecla === 'ArrowDown') girar(0, -0.12);
    else if (tecla === '+' || tecla === '=') acercar(1 / 1.2);
    else if (tecla === '-' || tecla === '_') acercar(1.2);
    else if (tecla === '0' || tecla === 'Home') reiniciar(true);
    else return;
    e.preventDefault();
  };
  const alPerderContexto = (e) => {
    e.preventDefault();
    perdido = true;
    alPerder?.();
  };
  caja.addEventListener('pointerdown', alBajar);
  caja.addEventListener('pointermove', alMover);
  caja.addEventListener('pointerup', alSoltar);
  caja.addEventListener('pointercancel', alSoltar);
  caja.addEventListener('keydown', alTeclear);
  lienzo.addEventListener('webglcontextlost', alPerderContexto);
  const tamano = new ResizeObserver(encuadrar);
  tamano.observe(caja);

  function rearmar() {
    if (!modelo) return;
    medir();
    armarFijos();
    armarDatos();
    ajustarRotulos();
    pedir();
  }
  // The numbers are written with the site's font: once more when it has arrived.
  document.fonts?.ready.then(() => vivo && rearmar());

  return {
    poner(nuevo) {
      modelo = nuevo;
      rearmar();
      encuadrar();
    },
    colores() {
      // The page's style changes for many reasons: only new colors build the scene again.
      const nuevos = leerColores(caja);
      if (firma(nuevos) === firma(c)) return;
      c = nuevos;
      rearmar();
    },
    quieto(v) {
      sinMovimiento = v;
    },
    girar,
    acercar,
    reiniciar,
    ponerCamara,
    dejarDeSeguir: () => seguida.parar(),
    destruir() {
      vivo = false;
      cancelAnimationFrame(cuadro);
      frenarViaje();
      tamano.disconnect();
      caja.removeEventListener('pointerdown', alBajar);
      caja.removeEventListener('pointermove', alMover);
      caja.removeEventListener('pointerup', alSoltar);
      caja.removeEventListener('pointercancel', alSoltar);
      caja.removeEventListener('keydown', alTeclear);
      lienzo.removeEventListener('webglcontextlost', alPerderContexto);
      vaciar(fijos);
      vaciar(datos);
      lienzo.remove();
      soltarGuardado();
      if (perdido) {
        renderer.dispose();
        return;
      }
      renderer.renderLists.dispose();
      guardado = { renderer, reloj: setTimeout(soltarGuardado, 15000) };
    },
  };
}
