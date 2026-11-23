// «Ultra»: what lives over the painted sky, drawn by the GPU (WebGL) on its own canvas between the sky and the
// particles. One fragment shader with a few ways of drawing (clouds or mist that drift, an aurora that waves, a nebula
// that flows, fire and smoke that rise, steam from the cup), each theme with its colors and its band of the screen.
// Over the column where the page's text goes it is fainter, so the text keeps its contrast. It moves only with
// «Movimiento del fondo» (fondo.js asks for frames); without it, one still frame. Without WebGL, nothing.

import { margenLibre } from './escenas';

const NUBES = 0;
const AURORA = 1;
const NEBULOSA = 2;
const FUEGO = 3;
const VAPOR = 4;

// modo, three colors, the band [from, to] (0 is the top), alpha, alpha kept over the text column, and how it blends.
const TEMAS = {
  cosmico: { modo: NEBULOSA, colores: [[124, 58, 237], [217, 70, 239], [56, 120, 255]], banda: [0, 1], alfa: 0.38, columna: 0.4 },
  glaciar: { modo: AURORA, colores: [[60, 255, 180], [80, 210, 255], [150, 120, 255]], banda: [0, 0.6], alfa: 0.6, columna: 0.55 },
  lavandaNoche: { modo: NUBES, colores: [[70, 50, 130], [140, 110, 210], [0, 0, 0]], banda: [0.5, 0.95], alfa: 0.24, columna: 0.5 },
  infierno: { modo: FUEGO, colores: [[255, 96, 24], [70, 18, 10], [255, 140, 40]], banda: [0.35, 1], alfa: 0.42, columna: 0.45 },
  oscuro: { modo: NUBES, colores: [[60, 74, 108], [150, 165, 205], [0, 0, 0]], banda: [0, 0.55], alfa: 0.3, columna: 0.5 },
  claro: { modo: NUBES, colores: [[255, 255, 255], [228, 238, 250], [0, 0, 0]], banda: [0, 0.45], alfa: 0.6, columna: 0.4 },
  rosa: { modo: NUBES, colores: [[255, 120, 170], [255, 196, 168], [0, 0, 0]], banda: [0.4, 0.9], alfa: 0.26, columna: 0.45 },
  bosque: { modo: NUBES, colores: [[150, 200, 175], [215, 240, 225], [0, 0, 0]], banda: [0.55, 1], alfa: 0.2, columna: 0.5 },
  cafe: { modo: VAPOR, colores: [[255, 236, 214], [255, 200, 150], [0, 0, 0]], banda: [0, 1], alfa: 0.42, columna: 0.4 },
  lavanda: { modo: NUBES, colores: [[255, 250, 255], [232, 222, 250], [0, 0, 0]], banda: [0.05, 0.6], alfa: 0.5, columna: 0.4 },
};

export const TEMAS_CON_VIDA = Object.keys(TEMAS);

const VERTICES = 'attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }';

const FRAGMENTOS = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 u_res;
uniform float u_t;
uniform int u_modo;
uniform vec3 u_c1;
uniform vec3 u_c2;
uniform vec3 u_c3;
uniform vec2 u_banda;
uniform float u_alfa;
uniform float u_columna;
uniform float u_ancho;
uniform float u_columnaMedia;
uniform vec3 u_foco;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float ruido(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float capas(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 giro = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 6; i++) {
    v += a * ruido(p);
    p = giro * p * 2.03 + 17.0;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  float y = 1.0 - uv.y;
  float aspecto = u_res.x / u_res.y;
  vec2 p = vec2(uv.x * aspecto, y);
  float t = u_t;
  vec3 color = u_c1;
  float a = 0.0;

  if (u_modo == 0) {
    // Clouds or mist: two drifting layers, the near one faster, lit on top.
    vec2 q = vec2(p.x * 1.4 + t * 0.010, p.y * 3.2);
    float lejos = capas(q + capas(q * 0.7 - t * 0.006) * 0.8);
    float cerca = capas(vec2(p.x * 2.2 + t * 0.022, p.y * 4.5) + 4.0);
    float n = max(lejos, cerca * 0.92);
    a = smoothstep(0.48, 0.82, n);
    color = mix(u_c1, u_c2, smoothstep(0.55, 0.95, n));
  } else if (u_modo == 1) {
    // Aurora: curtains hanging from a wave, rays running along them, green below to violet above.
    float x = p.x * 1.1;
    for (int k = 0; k < 2; k++) {
      float fk = float(k);
      float borde = 0.28 - fk * 0.1 + 0.06 * sin(x * 2.6 + t * 0.12 + fk * 2.3) + (capas(vec2(x * 1.6 + t * 0.03, fk * 5.0)) - 0.5) * 0.16;
      float d = borde - y;
      float largo = 0.12 + 0.14 * capas(vec2(x * 3.0 - t * 0.02, 9.0 + fk));
      float rayos = 0.35 + 0.65 * capas(vec2(x * 34.0 + t * 0.35, t * 0.04 + fk * 3.0));
      float cortina = smoothstep(-0.012, 0.0, d) * exp(-max(d, 0.0) / largo * 2.2) * rayos;
      cortina *= 0.6 + 0.4 * sin(x * 1.7 - t * 0.2 + fk);
      vec3 c = mix(u_c1, u_c2, smoothstep(0.0, largo * 0.8, d));
      c = mix(c, u_c3, smoothstep(largo * 0.6, largo * 1.6, d));
      color = mix(color, c, cortina / max(a + cortina, 0.0001));
      a = max(a, cortina);
    }
  } else if (u_modo == 2) {
    // Nebula: noise warped by noise, flowing slowly, with bright filaments where it is dense.
    vec2 q = vec2(capas(p * 1.6 + vec2(t * 0.012, 0.0)), capas(p * 1.6 + vec2(5.2, 1.3) - t * 0.009));
    vec2 w = vec2(capas(p * 1.9 + 3.0 * q + vec2(1.7, 9.2) + t * 0.006), capas(p * 1.9 + 3.0 * q + vec2(8.3, 2.8) - t * 0.005));
    float n = capas(p * 1.4 + 2.6 * w);
    a = smoothstep(0.38, 0.95, n);
    color = mix(u_c1, u_c2, clamp(q.x * 1.3 - 0.2, 0.0, 1.0));
    color = mix(color, u_c3, clamp(w.y * 1.6 - 0.6, 0.0, 1.0));
    color += vec3(1.0, 0.85, 1.0) * pow(max(n - 0.55, 0.0) * 2.4, 3.0);
  } else if (u_modo == 3) {
    // Fire and smoke rising: heat that wavers near the ground, darker smoke higher up.
    float alto = 1.0 - y;
    vec2 q = vec2(p.x * 2.0 + (capas(vec2(p.x * 3.0, y * 2.0 - t * 0.25)) - 0.5) * 0.5, y * 1.6 + t * 0.07);
    float n = capas(q * 1.5);
    float fuego = smoothstep(0.45, 0.85, n) * smoothstep(0.55, 0.0, alto);
    float humo = smoothstep(0.5, 0.9, capas(vec2(p.x * 1.2 - t * 0.01, y * 2.0 + t * 0.03) + 7.0)) * smoothstep(0.2, 0.65, alto);
    float latido = 0.75 + 0.25 * sin(t * 0.9 + p.x * 4.0);
    color = mix(u_c2, u_c1, fuego);
    color += u_c3 * pow(fuego, 2.0) * 0.6 * latido;
    a = max(fuego * latido, humo * 0.5);
    a += smoothstep(0.08, 0.0, alto) * 0.35 * latido;
  } else {
    // Steam from the cup (u_foco: x, y and its radius in pixels), and a warm haze that drifts.
    float h = (u_foco.y - y * u_ancho / aspecto) / max(u_foco.z, 1.0);
    float dx = (uv.x * u_ancho - u_foco.x) / max(u_foco.z, 1.0);
    if (u_foco.z > 0.0 && h > 0.0) {
      float vaiven = sin(h * 2.2 - t * 1.1) * 0.25 * h + (capas(vec2(h * 0.8 - t * 0.25, t * 0.05)) - 0.5) * 0.9 * h;
      float ancho = 0.35 + h * 0.22;
      float hilo = exp(-pow((dx - vaiven) / ancho, 2.0));
      float textura = capas(vec2(dx * 2.5, h * 1.4 - t * 0.6));
      a = hilo * smoothstep(0.25, 0.75, textura) * smoothstep(0.0, 0.6, h) * (1.0 - smoothstep(2.5, 6.0, h));
    }
    float bruma = smoothstep(0.55, 0.85, capas(vec2(p.x * 1.3 + t * 0.008, p.y * 2.5))) * 0.25;
    color = mix(u_c2, u_c1, a);
    a = max(a, bruma);
  }

  // Only in its band, fainter over the text column.
  a *= smoothstep(u_banda.x - 0.08, u_banda.x + 0.08, y) * (1.0 - smoothstep(u_banda.y - 0.08, u_banda.y + 0.08, y));
  a *= mix(u_columna, 1.0, smoothstep(0.0, 0.08, abs(uv.x - 0.5) - u_columnaMedia));
  a = clamp(a * u_alfa + (hash(gl_FragCoord.xy + fract(t)) - 0.5) / 255.0, 0.0, 1.0);
  gl_FragColor = vec4(clamp(color, 0.0, 1.0) * a, a);
}
`;

function compilar(gl, tipo, fuente) {
  const s = gl.createShader(tipo);
  gl.shaderSource(s, fuente);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
  return s;
}

/** Starts the living layer of `tema` on `lienzo` (a new canvas), for a window of `ancho` x `alto` CSS pixels.
 * Returns { pintar(segundos), soltar() }, or null if the theme has none or the browser lacks WebGL. */
export function crearVida(lienzo, tema, ancho, alto) {
  const tema2 = TEMAS[tema];
  if (!tema2) return null;
  // Soft shapes: half the pixels on a wide screen is enough, and the GPU does a quarter of the work.
  const escala = ancho > 1100 ? 0.5 : 0.75;
  lienzo.width = Math.max(1, Math.round(ancho * escala));
  lienzo.height = Math.max(1, Math.round(alto * escala));
  let gl;
  try {
    gl = lienzo.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, powerPreference: 'low-power' });
  } catch {
    gl = null;
  }
  if (!gl) return null;
  let programa;
  try {
    programa = gl.createProgram();
    gl.attachShader(programa, compilar(gl, gl.VERTEX_SHADER, VERTICES));
    gl.attachShader(programa, compilar(gl, gl.FRAGMENT_SHADER, FRAGMENTOS));
    gl.linkProgram(programa);
    if (!gl.getProgramParameter(programa, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(programa) || 'programa');
  } catch {
    return null;
  }
  gl.useProgram(programa);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const p = gl.getAttribLocation(programa, 'p');
  gl.enableVertexAttribArray(p);
  gl.vertexAttribPointer(p, 2, gl.FLOAT, false, 0, 0);

  const u = (n) => gl.getUniformLocation(programa, n);
  const [c1, c2, c3] = tema2.colores.map((c) => c.map((v) => v / 255));
  gl.uniform2f(u('u_res'), lienzo.width, lienzo.height);
  gl.uniform1i(u('u_modo'), tema2.modo);
  gl.uniform3f(u('u_c1'), ...c1);
  gl.uniform3f(u('u_c2'), ...c2);
  gl.uniform3f(u('u_c3'), ...c3);
  gl.uniform2f(u('u_banda'), ...tema2.banda);
  gl.uniform1f(u('u_alfa'), tema2.alfa);
  gl.uniform1f(u('u_columna'), tema2.columna);
  gl.uniform1f(u('u_ancho'), ancho);
  // Half the text column, as a part of the width (escenas.js leaves 1016 pixels free in the middle).
  gl.uniform1f(u('u_columnaMedia'), Math.min(0.5, (ancho - 2 * margenLibre(ancho)) / ancho / 2));
  // The cup of «Café» (escenas.js, EXTRAS.cafe): only with a wide margin.
  const libre = margenLibre(ancho);
  gl.uniform3f(u('u_foco'), ancho - libre / 2, alto * 0.8, libre > 220 ? Math.min(70, libre * 0.2) : 0);
  const tiempo = u('u_t');
  gl.viewport(0, 0, lienzo.width, lienzo.height);
  gl.clearColor(0, 0, 0, 0);

  return {
    pintar(segundos) {
      if (gl.isContextLost()) return;
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(tiempo, segundos % 3600);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    soltar() {
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}
