// The landing's 3D still life: an A4 spiral notebook, a pencil resting on it and three sticky notes floating around.
// Loaded only with import() from Cuaderno3D.jsx, when the landing shows it. Everything it places comes from
// describir.js (mm, the axes in medidas.js); the colors come from the site's CSS variables (soporte.js, leerColores).
import {
  BackSide,
  BoxGeometry,
  CircleGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  FrontSide,
  Group,
  HemisphereLight,
  InstancedMesh,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  NeutralToneMapping,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  ShadowMaterial,
  SRGBColorSpace,
  TorusGeometry,
  VSMShadowMap,
  Vector2,
  WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { textoSobre } from '../../lib/ajustes.js';
export { describirEscena } from './describir.js';
import { anillosLapiz, encuadrar, ejesCamara, formaNota, girosDeVaiven, perfilesLapiz, posturaNota, puntosEscena } from './describir.js';

// Natural colors that don't follow the theme: bare cedar, graphite, aluminium and a pink eraser.
const MADERA = '#e2b07e';
const GRAFITO = '#3c3f45';
const ALUMINIO = '#c9cdd2';
const GOMA = '#e3928c';
const ALAMBRE = '#b8bec6';

const limitar = (v, a, b) => Math.min(b, Math.max(a, v));
const suavizar = (dt, rapidez) => 1 - Math.exp(-dt * rapidez);

// ---------- Geometry from the description ----------
function geometriaCuerpo() {
  const anillos = anillosLapiz();
  const n = anillos[0].puntos.length;
  const pos = [];
  const pintado = [];
  const indices = [];
  for (const a of anillos) {
    a.puntos.forEach(([y, z], i) => {
      pos.push(a.x, y, z);
      pintado.push(a.pintado[i]);
    });
  }
  for (let r = 0; r < anillos.length - 1; r++) {
    for (let i = 0; i < n; i++) {
      const a = r * n + i;
      const b = r * n + ((i + 1) % n);
      indices.push(a, b, a + n, b, b + n, a + n);
    }
  }
  // Flat end under the ferrule: only a sliver of the corners shows.
  const ultimo = anillos.at(-1);
  const base = pos.length / 3;
  pos.push(ultimo.x, 0, 0);
  pintado.push(true);
  ultimo.puntos.forEach(([y, z]) => {
    pos.push(ultimo.x, y, z);
    pintado.push(true);
  });
  for (let i = 0; i < n; i++) indices.push(base, base + 1 + i, base + 1 + ((i + 1) % n));
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new Float32BufferAttribute(new Float32Array(pos.length), 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return { geometria: g, pintado };
}

/** A lathe profile [radius, x] turned about the pencil's axis (+x). */
function torneado(perfil, lados = 40) {
  const g = new LatheGeometry(
    perfil.map(([r, x]) => new Vector2(r, x)),
    lados,
  );
  g.rotateZ(-Math.PI / 2);
  return g;
}

function geometriaNota(curva) {
  const { puntos, columnas, filas } = formaNota({ curva });
  const lado = Math.abs(puntos.at(-1)[0] - puntos[0][0]);
  const pos = [];
  const uv = [];
  for (const [x, y, z] of puntos) {
    pos.push(x, y, z);
    uv.push(x / lado + 0.5, 0.5 - z / lado);
  }
  const indices = [];
  for (let j = 0; j < filas; j++) {
    for (let i = 0; i < columnas; i++) {
      const a = j * (columnas + 1) + i;
      const c = a + columnas + 1;
      indices.push(a, c, a + 1, a + 1, c, c + 1);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

/** Day number and weekday on a note, in the note's color with the text color that reads best on it. */
function dibujarNota(lienzo, { dia, semana }, fondo) {
  const ctx = lienzo.getContext('2d');
  const s = lienzo.width;
  const tinta = /^#[0-9a-f]{6}$/i.test(fondo) ? textoSobre(fondo) : '#ffffff';
  ctx.fillStyle = fondo;
  ctx.fillRect(0, 0, s, s);
  ctx.fillStyle = tinta;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `600 ${Math.round(s * 0.14)}px Barlow, system-ui, sans-serif`;
  ctx.fillText(semana, s / 2, s * 0.4);
  ctx.font = `700 ${Math.round(s * 0.44)}px Barlow, system-ui, sans-serif`;
  ctx.fillText(String(dia), s / 2, s * 0.82);
}

// ---------- The scene ----------
/**
 * Builds the scene in `contenedor`. opciones: escena (describirEscena), colores (leerColores), quieto (no sway nor
 * floating, dragging still works) and alPerder (WebGL context lost). Returns colores(c), quieto(si), visible(si),
 * destruir().
 */
export function crearEscena(contenedor, opciones) {
  const datos = opciones.escena;
  let quieto = !!opciones.quieto;
  const renderer = new WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = SRGBColorSpace;
  // Neutral keeps the site's colors close to what CSS paints.
  renderer.toneMapping = NeutralToneMapping;
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  // Variance shadows blur well: floating notes cast soft shadows, not hard gray cut-outs.
  renderer.shadowMap.type = VSMShadowMap;
  // Checking every program makes the driver wait: only while developing.
  renderer.debug.checkShaderErrors = import.meta.env.DEV;
  const lienzo = renderer.domElement;
  lienzo.className = 'cuaderno3d__lienzo';
  lienzo.setAttribute('aria-hidden', 'true');
  contenedor.appendChild(lienzo);

  let vivo = true;
  const geometrias = [];
  const materiales = [];
  const texturas = [];
  const guardar = (lista, x) => (lista.push(x), x);
  const geo = (g) => guardar(geometrias, g);
  const mat = (props) => guardar(materiales, new MeshStandardMaterial(props));

  const escena = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  const ambiente = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  escena.environment = ambiente;
  escena.environmentIntensity = 0.5;
  escena.add(new HemisphereLight(0xffffff, 0x8a96a3, 0.6));
  const sol = new DirectionalLight(0xfff4e6, 1.35);
  sol.position.set(-260, 620, 360);
  sol.castShadow = true;
  sol.shadow.mapSize.set(2048, 2048);
  Object.assign(sol.shadow.camera, { left: -420, right: 420, top: 420, bottom: -420, near: 200, far: 1400 });
  sol.shadow.bias = -0.0006;
  sol.shadow.radius = 14;
  sol.shadow.blurSamples = 16;
  escena.add(sol, sol.target);
  const relleno = new DirectionalLight(0xdfe8ff, 0.5);
  relleno.position.set(420, 220, -300);
  escena.add(relleno);

  const camara = new PerspectiveCamera(datos.camara.fov, 1, 10, 4000);
  const todo = new Group();
  escena.add(todo);

  // Invisible floor that only shows shadows. A disc well inside the shadow camera, whatever the turn: past its edge
  // variance shadows draw streaks.
  const sombra = guardar(materiales, new ShadowMaterial({ opacity: 0.16 }));
  const suelo = new Mesh(geo(new CircleGeometry(300, 64)), sombra);
  suelo.rotation.x = -Math.PI / 2;
  suelo.position.y = datos.suelo;
  suelo.receiveShadow = true;
  todo.add(suelo);

  // Notebook: back board, block of sheets, loose sheets and the cover, the last two hinged at the spine.
  const { cuaderno } = datos;
  const tapas = mat({ roughness: 0.5, metalness: 0 });
  const papel = mat({ roughness: 0.92, metalness: 0 });
  const agujero = mat({ roughness: 1, metalness: 0 });
  const metal = mat({ color: ALAMBRE, roughness: 0.3, metalness: 1 });
  const caja = (forma, material) => {
    const m = new Mesh(Array.isArray(forma) ? geo(new BoxGeometry(...forma)) : forma, material);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  };
  const contratapa = caja(cuaderno.contratapa.tamano, tapas);
  contratapa.position.set(...cuaderno.contratapa.centro);
  const bloque = caja(cuaderno.bloque.tamano, papel);
  bloque.position.set(...cuaderno.bloque.centro);
  todo.add(contratapa, bloque);
  const conBisagra = (pieza, material, forma = pieza.tamano) => {
    const bisagra = new Group();
    bisagra.position.set(...pieza.pivote);
    bisagra.rotation.x = -pieza.angulo;
    const m = caja(forma, material);
    m.position.set(0, pieza.tamano[1] / 2, pieza.tamano[2] / 2);
    bisagra.add(m);
    todo.add(bisagra);
    return bisagra;
  };
  const hojaSuelta = geo(new BoxGeometry(...cuaderno.hojas[0].tamano));
  for (const h of cuaderno.hojas) conBisagra(h, papel, hojaSuelta);
  const tapa = conBisagra(cuaderno.tapa, tapas);

  // Punched holes on the cover, a hair above it.
  const { tamano: [ax, az], xs, z: zAgujero } = cuaderno.agujeros;
  const agujeros = new InstancedMesh(geo(new PlaneGeometry(ax, az).rotateX(-Math.PI / 2)), agujero, xs.length);
  const m4 = new Matrix4();
  xs.forEach((x, i) => agujeros.setMatrixAt(i, m4.makeTranslation(x, cuaderno.tapa.tamano[1] + 0.02, zAgujero)));
  tapa.add(agujeros);

  // Twin wire loops through each hole, joined along the back of the spine.
  const { par, radio, alambre, centro } = cuaderno.anillos;
  const aros = new InstancedMesh(geo(new TorusGeometry(radio, alambre, 8, 48).rotateY(Math.PI / 2)), metal, xs.length * 2);
  xs.forEach((x, i) => {
    aros.setMatrixAt(2 * i, m4.makeTranslation(x - par / 2, centro[0], centro[1]));
    aros.setMatrixAt(2 * i + 1, m4.makeTranslation(x + par / 2, centro[0], centro[1]));
  });
  const largoUnion = xs[1] - xs[0] - par;
  const uniones = new InstancedMesh(geo(new CylinderGeometry(alambre, alambre, largoUnion, 8).rotateZ(Math.PI / 2)), metal, xs.length - 1);
  for (let i = 0; i < xs.length - 1; i++) uniones.setMatrixAt(i, m4.makeTranslation((xs[i] + xs[i + 1]) / 2, centro[0], centro[1] - radio));
  for (const a of [aros, uniones]) {
    a.castShadow = true;
    a.receiveShadow = true;
  }
  todo.add(aros, uniones);

  // Pencil, resting on the cover.
  const { geometria: cuerpoGeo, pintado } = geometriaCuerpo();
  geo(cuerpoGeo);
  const perfiles = perfilesLapiz();
  const lapiz = new Group();
  lapiz.position.set(...datos.lapiz.posicion);
  lapiz.rotation.y = datos.lapiz.giro;
  const inclinado = new Group();
  inclinado.rotation.z = datos.lapiz.inclinacion;
  lapiz.add(inclinado);
  const piezasLapiz = [
    new Mesh(cuerpoGeo, mat({ vertexColors: true, roughness: 0.42, metalness: 0 })),
    new Mesh(geo(torneado(perfiles.mina, 24)), mat({ color: GRAFITO, roughness: 0.42, metalness: 0.35 })),
    new Mesh(geo(torneado(perfiles.virola)), mat({ color: ALUMINIO, roughness: 0.32, metalness: 1 })),
    new Mesh(geo(torneado(perfiles.goma)), mat({ color: GOMA, roughness: 0.85, metalness: 0 })),
  ];
  for (const p of piezasLapiz) {
    p.castShadow = true;
    p.receiveShadow = true;
    inclinado.add(p);
  }
  tapa.add(lapiz);

  // Sticky notes: a printed face with the day and a plain back, floating.
  const notas = datos.notas.map((nota) => {
    const g = geo(geometriaNota(nota.curva));
    const dibujo = document.createElement('canvas');
    dibujo.width = 512;
    dibujo.height = 512;
    const textura = guardar(texturas, new CanvasTexture(dibujo));
    textura.colorSpace = SRGBColorSpace;
    textura.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const cara = mat({ map: textura, roughness: 0.82, metalness: 0, side: FrontSide });
    cara.shadowSide = DoubleSide;
    const dorso = mat({ roughness: 0.85, metalness: 0, side: BackSide });
    const grupo = new Group();
    const frente = new Mesh(g, cara);
    frente.castShadow = true;
    frente.receiveShadow = true;
    const atras = new Mesh(g, dorso);
    atras.receiveShadow = true;
    grupo.add(frente, atras);
    todo.add(grupo);
    return { nota, grupo, dibujo, textura, dorso };
  });

  // ---------- Colors ----------
  let colores = opciones.colores;
  const color = new Color();
  const aplicarColores = () => {
    tapas.color.set(colores.accion);
    // Paper stays paper in every theme: a dark page reads as a dark block. A bit dimmer at night so it doesn't glare.
    papel.color.set(colores.oscuro ? '#d8d5cd' : '#f6f4ee');
    agujero.color.set(colores.accion).lerp(new Color(0x000000), 0.72);
    sombra.opacity = colores.oscuro ? 0.34 : 0.16;
    const pintura = new Color(colores.resaltador);
    const madera = new Color(MADERA);
    const tinte = cuerpoGeo.getAttribute('color');
    pintado.forEach((si, i) => {
      color.copy(si ? pintura : madera);
      tinte.setXYZ(i, color.r, color.g, color.b);
    });
    tinte.needsUpdate = true;
    notas.forEach((n, i) => {
      const fondo = colores.materias[i] || colores.accion;
      dibujarNota(n.dibujo, n.nota, fondo);
      n.textura.needsUpdate = true;
      n.dorso.color.set(fondo);
    });
  };
  aplicarColores();
  // The day numbers use the site's font: draw again once it's there.
  document.fonts?.load('700 100px Barlow').then(() => {
    if (!vivo) return;
    aplicarColores();
    pedir();
  }, () => {});

  // ---------- Framing ----------
  const puntos = puntosEscena(datos);
  let ancho = 1;
  let alto = 1;
  let giro = datos.camara.giro;
  let elevacion = datos.camara.elevacion;
  let marco = null;
  let memo = { clave: '', valor: null };
  const objetivoMarco = () => {
    const clave = `${giro} ${elevacion} ${ancho / alto}`;
    if (memo.clave !== clave) memo = { clave, valor: encuadrar(puntos, { giros: girosDeVaiven(datos, giro), elevacion, aspecto: ancho / alto, fov: datos.camara.fov }) };
    return memo.valor;
  };
  const ponerCamara = () => {
    const { derecha, arriba, atras } = ejesCamara(elevacion);
    const pos = [0, 1, 2].map((k) => marco.cx * derecha[k] + marco.cy * arriba[k] + marco.d * atras[k]);
    camara.position.set(...pos);
    camara.up.set(...arriba);
    camara.lookAt(pos[0] - atras[0], pos[1] - atras[1], pos[2] - atras[2]);
    camara.near = Math.max(10, marco.d - 600);
    camara.far = marco.d + 600;
    camara.updateProjectionMatrix();
  };

  // ---------- Motion ----------
  const inicio = performance.now();
  const PAUSA = 2200;
  let activo = false;
  let raf = 0;
  let antes = inicio;
  let vel = 0;
  let peso = quieto ? 0 : 1;
  let desde = inicio;
  let reanudar = 0;
  let arrastre = null;
  const { amplitud, periodo } = datos.vaiven;
  const vaiven = (ahora) => amplitud * peso * Math.sin((2 * Math.PI * (ahora - desde)) / 1000 / periodo);
  // Folds the sway into the base turn, so stopping it never jumps.
  const fijarVaiven = (ahora) => {
    giro += vaiven(ahora);
    peso = 0;
  };

  const aplicar = (ahora, dt) => {
    todo.rotation.y = giro + vaiven(ahora);
    const t = (ahora - inicio) / 1000;
    for (const { nota, grupo } of notas) {
      const { y, giro: g } = posturaNota(nota, t, quieto);
      grupo.position.set(nota.centro[0], y, nota.centro[2]);
      grupo.rotation.set(...g);
    }
    const meta = objetivoMarco();
    if (!marco || quieto || dt === 0) marco = meta;
    else {
      const k = suavizar(dt, 6);
      marco = { d: marco.d + (meta.d - marco.d) * k, cx: marco.cx + (meta.cx - marco.cx) * k, cy: marco.cy + (meta.cy - marco.cy) * k };
    }
    ponerCamara();
    return Math.abs(meta.d - marco.d) > 0.05 || Math.abs(meta.cx - marco.cx) > 0.05 || Math.abs(meta.cy - marco.cy) > 0.05;
  };

  const cuadro = (ahora) => {
    raf = 0;
    const dt = Math.min(0.05, Math.max(0, (ahora - antes) / 1000));
    antes = ahora;
    let sigue = false;
    if (!arrastre && vel) {
      giro += vel * dt;
      vel *= Math.exp(-dt * 3.5);
      if (Math.abs(vel) < 0.01) vel = 0;
      else sigue = true;
    }
    if (!quieto) {
      if (!arrastre && !vel && peso < 1 && ahora >= reanudar) {
        if (peso === 0) desde = ahora;
        peso = Math.min(1, peso + dt / 1.8);
      }
      sigue = true;
    }
    if (!arrastre) {
      const dentro = limitar(elevacion, datos.camara.minimo, datos.camara.maximo);
      if (dentro !== elevacion) {
        elevacion = quieto ? dentro : elevacion + (dentro - elevacion) * suavizar(dt, 12);
        if (Math.abs(dentro - elevacion) < 1e-4) elevacion = dentro;
        else sigue = true;
      }
    }
    if (aplicar(ahora, dt)) sigue = true;
    renderer.render(escena, camara);
    if (sigue && activo && vivo) raf = requestAnimationFrame(cuadro);
  };
  const pedir = () => {
    if (raf || !activo || !vivo) return;
    antes = performance.now();
    raf = requestAnimationFrame(cuadro);
  };

  // ---------- Dragging ----------
  // Horizontal turns it, vertical (mouse or pen) tilts the view. On a phone the canvas has touch-action: pan-y, so
  // a vertical swipe still scrolls the page. Past the tilt limits it gets heavier instead of stopping dead.
  const alApretar = (e) => {
    if (arrastre || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (e.pointerType === 'mouse') e.preventDefault();
    arrastre = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, vel: 0 };
    try {
      lienzo.setPointerCapture(e.pointerId);
    } catch {
      // Without capture it still works while the pointer stays over the canvas.
    }
    fijarVaiven(performance.now());
    vel = 0;
    lienzo.classList.add('cuaderno3d__lienzo--arrastrando');
    pedir();
  };
  const alArrastrar = (e) => {
    if (!arrastre || e.pointerId !== arrastre.id) return;
    const dt = Math.max(1, e.timeStamp - arrastre.t) / 1000;
    const paso = ((e.clientX - arrastre.x) * Math.PI) / Math.max(320, ancho);
    giro += paso;
    arrastre.vel = arrastre.vel * 0.5 + (paso / dt) * 0.5;
    if (e.pointerType !== 'touch') {
      const { minimo, maximo } = datos.camara;
      const fuera = Math.max(0, minimo - elevacion, elevacion - maximo);
      elevacion += ((e.clientY - arrastre.y) * Math.PI) / Math.max(480, alto * 2.5) / (1 + fuera * 14);
    }
    arrastre.x = e.clientX;
    arrastre.y = e.clientY;
    arrastre.t = e.timeStamp;
    pedir();
  };
  const alSoltar = (e) => {
    if (!arrastre || e.pointerId !== arrastre.id) return;
    const quieta = e.timeStamp - arrastre.t > 90;
    vel = quieto || quieta ? 0 : limitar(arrastre.vel, -6, 6);
    arrastre = null;
    reanudar = performance.now() + PAUSA;
    lienzo.classList.remove('cuaderno3d__lienzo--arrastrando');
    pedir();
  };
  lienzo.addEventListener('pointerdown', alApretar);
  lienzo.addEventListener('pointermove', alArrastrar);
  lienzo.addEventListener('pointerup', alSoltar);
  lienzo.addEventListener('pointercancel', alSoltar);

  const medir = () => {
    ancho = Math.max(1, contenedor.clientWidth);
    alto = Math.max(1, contenedor.clientHeight);
    renderer.setSize(ancho, alto, false);
    camara.aspect = ancho / alto;
    marco = null;
  };
  const observador = new ResizeObserver(() => {
    medir();
    if (activo && !raf) {
      aplicar(performance.now(), 0);
      renderer.render(escena, camara);
    }
  });
  observador.observe(contenedor);
  medir();
  aplicar(performance.now(), 0);

  const perdido = (e) => {
    e.preventDefault();
    opciones.alPerder?.();
  };
  lienzo.addEventListener('webglcontextlost', perdido);

  return {
    /** Draws once now, so the first frame is ready before the canvas fades in. */
    dibujar() {
      aplicar(performance.now(), 0);
      renderer.render(escena, camara);
    },
    colores(c) {
      colores = c;
      aplicarColores();
      if (!raf && activo) pedir();
    },
    quieto(si) {
      if (si === quieto) return;
      const ahora = performance.now();
      if (si) {
        fijarVaiven(ahora);
        vel = 0;
      } else reanudar = ahora;
      quieto = si;
      pedir();
    },
    visible(si) {
      activo = si;
      if (si) pedir();
      else if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    },
    destruir() {
      vivo = false;
      activo = false;
      if (raf) cancelAnimationFrame(raf);
      observador.disconnect();
      lienzo.removeEventListener('pointerdown', alApretar);
      lienzo.removeEventListener('pointermove', alArrastrar);
      lienzo.removeEventListener('pointerup', alSoltar);
      lienzo.removeEventListener('pointercancel', alSoltar);
      lienzo.removeEventListener('webglcontextlost', perdido);
      agujeros.dispose();
      aros.dispose();
      uniones.dispose();
      geometrias.forEach((g) => g.dispose());
      materiales.forEach((m) => m.dispose());
      texturas.forEach((t) => t.dispose());
      ambiente.dispose();
      pmrem.dispose();
      sol.shadow.map?.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      lienzo.remove();
    },
  };
}
