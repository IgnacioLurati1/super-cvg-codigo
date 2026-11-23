import { cloneElement, memo, useEffect, useId, useMemo, useRef, useState } from 'react';
import * as Y from 'yjs';
import { caminoTrazo, COLORES, pizarraEnPng, punta } from './pizarraDibujo';
import { agregar, apilar, apilarVarios, borrar, borrarCerca, caja, cambiarTexto, cambiarVarios, dentroDe, GROSORES, leerElementos, MAX_PUNTOS, MAX_TEXTO, moverVarios, TAMANOS, textoPizarra, toca } from '../../../lib/enVivo/pizarra';
import { atajo } from '../../../lib/enVivo/menuContextual';
import { useMenuContextual } from './MenuContextual';
import { colorSeguro } from '../../../lib/enVivo/documento';
import { useUI } from '../../ui';
import { Boton, Icono, Presentes, nombreArchivo, numeroEn, reservaAbajo, useCambios, useParaConsultron, useSeguir, useLienzoSuave } from './comun';
import { pestanas } from '../../../lib/enVivo/mesa';
import { NOMBRES_COLOR } from './lienzo';
import './pizarra.css';

// Pizarra: a sheet of squared paper everyone draws on at once (free hand, shapes, arrows, text, eraser), with the
// others' pointers. Drawn in SVG, from what is in the tab's `datos`. The view is the point at the middle and the zoom.
// A text already written is written again where it is: touched with Texto, or chosen with Mover and then a double touch
// or Enter. Mover chooses one thing by touching it, or several with a rectangle dragged on the paper (what stays whole
// inside it) or with Shift; what is chosen moves, goes to the front or the back, changes color and is deleted together.
const HERRAMIENTAS = [
  ['lapiz', 'Lápiz', 'p'],
  ['linea', 'Línea', 'l'],
  ['flecha', 'Flecha', 'a'],
  ['rect', 'Rectángulo', 'r'],
  ['elipse', 'Elipse', 'o'],
  ['texto', 'Texto', 't'],
  ['goma', 'Goma', 'e'],
  ['mover', 'Mover', 'v'],
  ['mano', 'Desplazar', 'h'],
];
const GROSOR_NOMBRES = ['Fino', 'Medio', 'Grueso'];
const TAMANO_NOMBRES = ['Chica', 'Mediana', 'Grande'];
// The tools of the right click's menu: the ones that draw.
const EN_EL_MENU = new Set(['lapiz', 'linea', 'flecha', 'rect', 'elipse', 'texto', 'goma']);
const ZOOM_MIN = 0.2;
const ZOOM_MAX = 4;
const CUADRO = 24;
const CADA_PUNTERO = 100;
// Two touches on the same thing within this time are a double one (a phone sends no double click).
const DOBLE_MS = 400;

// --- Drawing each element (the shapes are in pizarraDibujo.js, shared with the image that is kept).

function forma(el, dx, dy) {
  const color = COLORES[el.c];
  const mov = dx || dy ? `translate(${dx} ${dy})` : undefined;
  if (el.t === 'trazo' && el.r) return <polyline points={el.p.join(' ')} className="vpiz-figura" style={{ stroke: color, strokeWidth: GROSORES[el.g] }} transform={mov} />;
  if (el.t === 'trazo') return <path d={caminoTrazo(el)} style={{ fill: color }} transform={mov} />;
  if (el.t === 'texto') {
    const tam = TAMANOS[el.tam];
    return (
      <text x={el.x} y={el.y} className="vpiz-texto" style={{ fill: color, fontSize: tam }} transform={mov}>
        {el.s.split('\n').map((l, i) => <tspan key={i} x={el.x} dy={i ? tam * 1.25 : 0}>{l || ' '}</tspan>)}
      </text>
    );
  }
  const trazo = { stroke: color, strokeWidth: GROSORES[el.g] };
  if (el.t === 'rect') {
    return <rect x={Math.min(el.x1, el.x2)} y={Math.min(el.y1, el.y2)} width={Math.abs(el.x2 - el.x1)} height={Math.abs(el.y2 - el.y1)} rx="3" className="vpiz-figura" style={trazo} transform={mov} />;
  }
  if (el.t === 'elipse') {
    return <ellipse cx={(el.x1 + el.x2) / 2} cy={(el.y1 + el.y2) / 2} rx={Math.abs(el.x2 - el.x1) / 2} ry={Math.abs(el.y2 - el.y1) / 2} className="vpiz-figura" style={trazo} transform={mov} />;
  }
  return (
    <g className="vpiz-figura" style={trazo} transform={mov}>
      <path d={`M${el.x1},${el.y1} L${el.x2},${el.y2}`} />
      {el.t === 'flecha' && <path d={punta(el.x1, el.y1, el.x2, el.y2, el.g)} />}
    </g>
  );
}

// `ajeno`: drawn by someone else while this board was open. With «Sensible a la luz» it fades in (styles/luz.css).
const Elemento = memo(function Elemento({ el, dx = 0, dy = 0, ajeno = false }) {
  const f = forma(el, dx, dy);
  // On the element itself, not in a group around it: the board and its tests read its shapes as they are.
  return ajeno ? cloneElement(f, { "data-ajeno": "" }) : f;
});

// Fewer points for a long stroke: every other one until it fits.
function recortar(p) {
  let puntos = p;
  while (puntos.length > MAX_PUNTOS * 2) puntos = puntos.filter((_, i) => i % 4 < 2);
  return puntos.map((n) => Math.round(n * 10) / 10);
}

export default function Pizarra({ mesa }) {
  const { datos, marcar, mover: moverVista, soltar, vista } = mesa;
  const { confirmar, avisar } = useUI();
  const cambios = useCambios(datos);
  const elementos = useMemo(() => leerElementos(datos), [datos, cambios]); // eslint-disable-line react-hooks/exhaustive-deps
  // What others added while it is open, by id (not what was there when it opened, nor what this browser drew).
  const [ajenos] = useState(() => new Set());
  useEffect(() => {
    const alCambiar = (ev, tr) => {
      if (tr.local) return;
      ev.changes.keys.forEach((c, k) => {
        if (c.action === 'add' && k.startsWith('e:')) ajenos.add(k.slice(2));
      });
    };
    datos.observe(alCambiar);
    return () => datos.unobserve(alCambiar);
  }, [datos, ajenos]);
  const ayuda = useId();

  const [herramienta, setHerramienta] = useState('lapiz');
  const usaTamano = herramienta === 'texto';
  const [color, setColor] = useState(0);
  const [grosor, setGrosor] = useState(1);
  // The camera: the world point at the top left of the sheet, and the zoom.
  const [cam, setCam] = useState({ x: -40, y: -40, z: 1 });
  const [enCurso, setEnCurso] = useState(null);
  const [arrastre, setArrastre] = useState(null);
  // The text being written: a new one ({ x, y, s }) or one already there ({ id, x, y, s, c, tam }, hidden meanwhile).
  const [escribiendo, setEscribiendo] = useState(null);
  const escribiendoYa = useRef(false);
  // What Mover chose: their ids, each shown with a frame; and the rectangle being dragged to choose (only here).
  const [elegidos, setElegidos] = useState([]);
  const [rectangulo, setRectangulo] = useState(null);
  const ultimoToque = useRef({ id: null, t: 0 });
  const editado = escribiendo?.id ?? null;
  // What Mover chose, while it is there and nobody writes it.
  const elegidosEl = herramienta === 'mover' && !editado ? elementos.filter((el) => elegidos.includes(el.id)) : [];
  const elegidoEl = elegidosEl.length === 1 ? elegidosEl[0] : null;
  const hoja = useRef(null);
  const gesto = useRef(null);
  const punteros = useRef(new Map());
  const camRef = useRef(cam);
  useEffect(() => {
    camRef.current = cam;
  }, [cam]);

  // Undo and redo only what this browser did.
  const [origen] = useState(() => ({ pizarra: true }));
  // Made in an effect: StrictMode unmounts and mounts again in dev, and a destroyed one does not track anymore.
  const deshacer = useRef(null);
  const [pilas, setPilas] = useState({ atras: 0, adelante: 0 });
  useEffect(() => {
    const um = new Y.UndoManager(datos, { trackedOrigins: new Set([origen]), captureTimeout: 0 });
    deshacer.current = um;
    const contar = () => setPilas({ atras: um.undoStack.length, adelante: um.redoStack.length });
    um.on('stack-item-added', contar);
    um.on('stack-item-popped', contar);
    um.on('stack-cleared', contar);
    return () => {
      um.destroy();
      deshacer.current = null;
    };
  }, [datos, origen]);
  const atras = () => deshacer.current?.undo();
  const adelante = () => deshacer.current?.redo();

  useParaConsultron(mesa, () => textoPizarra(leerElementos(datos)));

  // «Guardar en lo mío»: the sheet as an image, once something is drawn.
  const { paraGuardar } = mesa;
  const hayAlgo = elementos.length > 0;
  useEffect(() => (hayAlgo ? paraGuardar(() => {
    const titulo = pestanas(mesa.doc).find((p) => p.id === mesa.id)?.titulo ?? 'Pizarra';
    return pizarraEnPng(leerElementos(datos), hoja.current ?? document.body, nombreArchivo(titulo, 'png'));
  }) : undefined), [hayAlgo, paraGuardar, datos, mesa.doc, mesa.id]);

  // --- The view: the middle of the sheet and the zoom, the same on any screen.
  const medida = () => {
    const r = hoja.current?.getBoundingClientRect();
    return { w: r?.width || 600, h: r?.height || 400, x: r?.left ?? 0, y: r?.top ?? 0 };
  };
  const contar = (c) => {
    const { w, h } = medida();
    moverVista({ cx: Math.round(c.x + w / 2 / c.z), cy: Math.round(c.y + h / 2 / c.z), z: Math.round(c.z * 100) / 100 });
  };
  // Following, the camera glides to the other's middle and zoom.
  const suave = useLienzoSuave(Boolean(vista), medida, {
    aplicar: (v) => {
      const { w, h } = medida();
      const nueva = { x: v.cx - w / 2 / v.z, y: v.cy - h / 2 / v.z, z: v.z };
      camRef.current = nueva;
      setCam(nueva);
      contar(nueva);
    },
    leer: () => {
      const { w, h } = medida();
      const c = camRef.current;
      return { cx: c.x + w / 2 / c.z, cy: c.y + h / 2 / c.z, z: c.z };
    },
  });
  const fijarCam = (c, aMano = true) => {
    const nueva = { ...c, z: Math.min(Math.max(c.z, ZOOM_MIN), ZOOM_MAX) };
    setCam(nueva);
    contar(nueva);
    if (aMano) suave.parar();
    if (aMano && vista) soltar();
  };
  useEffect(() => {
    contar(camRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useSeguir(vista, (v) => {
    suave.ir({ cx: numeroEn(v.cx, -1e5, 1e5, 0), cy: numeroEn(v.cy, -1e5, 1e5, 0), z: numeroEn(v.z, ZOOM_MIN, ZOOM_MAX, 1) });
  });

  const aMundo = (cx, cy) => {
    const { x, y } = medida();
    const c = camRef.current;
    return [c.x + (cx - x) / c.z, c.y + (cy - y) / c.z];
  };
  const zoomEn = (factor, cx, cy) => {
    const c = camRef.current;
    const z = Math.min(Math.max(c.z * factor, ZOOM_MIN), ZOOM_MAX);
    const [wx, wy] = aMundo(cx, cy);
    const { x, y } = medida();
    fijarCam({ x: wx - (cx - x) / z, y: wy - (cy - y) / z, z });
  };
  const zoomAlMedio = (factor) => {
    const { w, h, x, y } = medida();
    zoomEn(factor, x + w / 2, y + h / 2);
  };

  // The wheel: it pans, and with Ctrl (or a pinch on a trackpad) it zooms. Not passive, so the page does not scroll.
  useEffect(() => {
    const el = hoja.current;
    const rueda = (e) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        zoomEn(Math.exp(-e.deltaY * 0.0025), e.clientX, e.clientY);
      } else {
        const c = camRef.current;
        fijarCam({ ...c, x: c.x + e.deltaX / c.z, y: c.y + e.deltaY / c.z });
      }
    };
    el.addEventListener('wheel', rueda, { passive: false });
    return () => el.removeEventListener('wheel', rueda);
  });

  // --- My pointer, for the others: every so often, and gone when it leaves the sheet.
  const ultimoPuntero = useRef(0);
  const marcarPuntero = (wx, wy, ahora) => {
    if (ahora - ultimoPuntero.current < CADA_PUNTERO) return;
    ultimoPuntero.current = ahora;
    marcar({ x: Math.round(wx), y: Math.round(wy) });
  };
  useEffect(() => () => marcar(null), [marcar]);

  // The eraser rubs along the way from where it was, so a quick stroke leaves nothing behind.
  const borrarEn = (wx, wy, desde) => {
    const radio = 8 / camRef.current.z;
    const pasos = desde ? Math.min(60, Math.ceil(Math.hypot(wx - desde.x, wy - desde.y) / (radio / 2))) : 0;
    for (let i = 1; i <= pasos; i += 1) borrarCerca(datos, desde.x + ((wx - desde.x) * i) / pasos, desde.y + ((wy - desde.y) * i) / pasos, radio, origen);
    if (!pasos) borrarCerca(datos, wx, wy, radio, origen);
  };

  const tocadoEn = (wx, wy) => [...elementos].reverse().find((el) => toca(el, wx, wy, 6 / camRef.current.z));
  const ponerTexto = (x, y, s) => agregar(datos, { t: 'texto', c: color, tam: grosor, x, y, s }, origen);
  const abrirTexto = (e) => {
    escribiendoYa.current = true;
    setEscribiendo(e);
  };
  const editarTexto = (el) => abrirTexto({ id: el.id, x: el.x, y: el.y, s: el.s, c: el.c, tam: el.tam });

  const alBajar = (e) => {
    // The right button opens the menu: it draws nothing.
    if (escribiendo || e.button === 2) return;
    hoja.current.setPointerCapture(e.pointerId);
    punteros.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // Two fingers: pan and zoom, and whatever was being drawn is dropped.
    if (punteros.current.size === 2) {
      setEnCurso(null);
      setArrastre(null);
      setRectangulo(null);
      const [a, b] = [...punteros.current.values()];
      gesto.current = { tipo: 'pellizco', d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      return;
    }
    if (punteros.current.size > 2) return;
    const [wx, wy] = aMundo(e.clientX, e.clientY);
    const panear = herramienta === 'mano' || e.button === 1 || e.buttons === 4;
    if (panear) {
      gesto.current = { tipo: 'mano', sx: e.clientX, sy: e.clientY, cam: camRef.current };
    } else if (herramienta === 'lapiz') {
      gesto.current = { tipo: 'lapiz' };
      setEnCurso({ t: 'trazo', c: color, g: grosor, p: [wx, wy] });
    } else if (['linea', 'flecha', 'rect', 'elipse'].includes(herramienta)) {
      gesto.current = { tipo: 'figura' };
      setEnCurso({ t: herramienta, c: color, g: grosor, x1: wx, y1: wy, x2: wx, y2: wy });
    } else if (herramienta === 'goma') {
      gesto.current = { tipo: 'goma', x: wx, y: wy };
      borrarEn(wx, wy);
    } else if (herramienta === 'mover') {
      const tocado = tocadoEn(wx, wy);
      const antes = ultimoToque.current;
      const ahora = e.timeStamp;
      ultimoToque.current = { id: tocado?.id ?? null, t: ahora };
      const yaElegido = tocado && elegidosEl.some((el) => el.id === tocado.id);
      if (tocado && e.shiftKey) {
        // Shift adds it to what is chosen, or takes it out.
        setElegidos(yaElegido ? elegidos.filter((id) => id !== tocado.id) : [...elegidosEl.map((el) => el.id), tocado.id]);
        gesto.current = null;
      } else if (tocado?.t === 'texto' && antes.id === tocado.id && ahora - antes.t < DOBLE_MS) {
        e.preventDefault();
        gesto.current = null;
        ultimoToque.current = { id: null, t: 0 };
        setElegidos([tocado.id]);
        editarTexto(tocado);
      } else if (tocado) {
        // Pressing on something chosen moves all that is chosen; on something else, it alone.
        const ids = yaElegido ? elegidosEl.map((el) => el.id) : [tocado.id];
        setElegidos(ids);
        gesto.current = { tipo: 'mover', sx: wx, sy: wy };
        setArrastre({ ids, dx: 0, dy: 0 });
      } else {
        // On the paper: a rectangle that chooses what stays whole inside it, on release (a second finger keeps what was
        // chosen).
        gesto.current = { tipo: 'rectangulo', sumar: e.shiftKey, antes: elegidosEl.map((el) => el.id) };
        setRectangulo({ x1: wx, y1: wy, x2: wx, y2: wy });
      }
    } else if (herramienta === 'texto') {
      e.preventDefault();
      gesto.current = null;
      // On a text already written, it is that one that is written again.
      const tocado = [...elementos].reverse().find((el) => el.t === 'texto' && toca(el, wx, wy, 6 / camRef.current.z));
      if (tocado) editarTexto(tocado);
      else abrirTexto({ x: wx, y: wy, s: '' });
    }
  };

  const alMover = (e) => {
    const [wx, wy] = aMundo(e.clientX, e.clientY);
    marcarPuntero(wx, wy, e.timeStamp);
    if (!punteros.current.has(e.pointerId)) return;
    punteros.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesto.current;
    if (!g) return;
    if (g.tipo === 'pellizco') {
      const [a, b] = [...punteros.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const c = camRef.current;
      const z = Math.min(Math.max(c.z * (d / g.d), ZOOM_MIN), ZOOM_MAX);
      const [px, py] = aMundo(g.mx, g.my);
      const { x, y } = medida();
      const nueva = { x: px - (mx - x) / z, y: py - (my - y) / z, z };
      camRef.current = nueva;
      fijarCam(nueva);
      Object.assign(g, { d, mx, my });
    } else if (g.tipo === 'mano') {
      fijarCam({ ...g.cam, x: g.cam.x - (e.clientX - g.sx) / g.cam.z, y: g.cam.y - (e.clientY - g.sy) / g.cam.z });
    } else if (g.tipo === 'lapiz') {
      setEnCurso((t) => {
        if (!t) return t;
        const n = t.p.length;
        if (Math.hypot(wx - t.p[n - 2], wy - t.p[n - 1]) < 1.5 / camRef.current.z) return t;
        return { ...t, p: [...t.p, wx, wy] };
      });
    } else if (g.tipo === 'figura') {
      Object.assign(g, { x2: wx, y2: wy });
      setEnCurso((t) => t && { ...t, x2: wx, y2: wy });
    } else if (g.tipo === 'goma') {
      borrarEn(wx, wy, g);
      Object.assign(g, { x: wx, y: wy });
    } else if (g.tipo === 'mover') {
      Object.assign(g, { dx: wx - g.sx, dy: wy - g.sy });
      setArrastre((a) => a && { ...a, dx: g.dx, dy: g.dy });
    } else if (g.tipo === 'rectangulo') {
      Object.assign(g, { x2: wx, y2: wy });
      setRectangulo((r) => r && { ...r, x2: wx, y2: wy });
    }
  };

  const alSoltar = (e) => {
    punteros.current.delete(e.pointerId);
    const g = gesto.current;
    if (g?.tipo === 'pellizco') {
      if (punteros.current.size === 0) gesto.current = null;
      return;
    }
    gesto.current = null;
    // Where the pointer last went is in the gesture: the state of the last moves may not be drawn yet when it's let go
    // (a busy phone), and the shape, the move or the rectangle would end short.
    if (g?.tipo === 'lapiz' && enCurso) {
      agregar(datos, { ...enCurso, p: recortar(enCurso.p) }, origen);
    } else if (g?.tipo === 'figura' && enCurso) {
      const figura = 'x2' in g ? { ...enCurso, x2: g.x2, y2: g.y2 } : enCurso;
      if (Math.hypot(figura.x2 - figura.x1, figura.y2 - figura.y1) * camRef.current.z > 4) agregar(datos, figura, origen);
    } else if (g?.tipo === 'mover' && arrastre && (g.dx || g.dy)) {
      moverVarios(datos, arrastre.ids, g.dx, g.dy, origen);
    } else if (g?.tipo === 'rectangulo' && rectangulo) {
      const adentro = dentroDe(elementos, rectangulo.x1, rectangulo.y1, g.x2 ?? rectangulo.x2, g.y2 ?? rectangulo.y2).map((el) => el.id);
      setElegidos(g.sumar ? [...new Set([...g.antes, ...adentro])] : adentro);
    }
    setEnCurso(null);
    setArrastre(null);
    setRectangulo(null);
  };

  // Done (Enter or leaving the field): a new text goes in, one already there is written again or, empty, deleted.
  // Escape leaves it as it was. Once each time: the focus going back to the sheet blurs the field again.
  const terminarTexto = (guardar = true) => {
    if (!escribiendoYa.current) return;
    escribiendoYa.current = false;
    const e = escribiendo;
    if (guardar && e?.id) {
      if (e.s.trim()) cambiarTexto(datos, e.id, e.s, origen);
      else borrar(datos, [e.id], origen);
    } else if (guardar && e?.s.trim()) {
      ponerTexto(e.x, e.y, e.s);
    }
    setEscribiendo(null);
    hoja.current?.focus();
  };

  // Keys on the sheet: arrows pan, + and − zoom, letters pick a tool, Ctrl+Z undoes.
  const alTeclear = (e) => {
    if (e.target !== hoja.current) return;
    const c = camRef.current;
    const paso = 60 / c.z;
    const mov = { ArrowLeft: [-paso, 0], ArrowRight: [paso, 0], ArrowUp: [0, -paso], ArrowDown: [0, paso] }[e.key];
    if (mov) {
      e.preventDefault();
      fijarCam({ ...c, x: c.x + mov[0], y: c.y + mov[1] });
    } else if (e.key === '+' || e.key === '=') {
      zoomAlMedio(1.25);
    } else if (e.key === '-') {
      zoomAlMedio(0.8);
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) adelante();
      else atras();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
      // Everything on the board, chosen with Mover.
      e.preventDefault();
      setHerramienta('mover');
      setElegidos(elementos.map((el) => el.id));
    } else if (elegidosEl.length && (e.key === 'Delete' || e.key === 'Backspace')) {
      e.preventDefault();
      borrar(datos, elegidosEl.map((el) => el.id), origen);
      setElegidos([]);
    } else if (elegidoEl?.t === 'texto' && e.key === 'Enter') {
      e.preventDefault();
      editarTexto(elegidoEl);
    } else if (elegidosEl.length && e.key === 'Escape') {
      setElegidos([]);
    } else if (!e.ctrlKey && !e.metaKey && !e.altKey) {
      const h = HERRAMIENTAS.find(([, , tecla]) => tecla === e.key.toLowerCase());
      if (h) setHerramienta(h[0]);
    }
  };

  const centrar = () => {
    const { w, h } = medida();
    if (!elementos.length) {
      fijarCam({ x: -40, y: -40, z: 1 });
      return;
    }
    const cajas = elementos.map((el) => {
      const [x, y, ancho, alto] = caja(el);
      return [x, y, x + ancho, y + alto];
    });
    const x0 = Math.min(...cajas.map((b) => b[0])) - 40;
    const y0 = Math.min(...cajas.map((b) => b[1])) - 40;
    const x1 = Math.max(...cajas.map((b) => b[2])) + 40;
    const y1 = Math.max(...cajas.map((b) => b[3])) + 40;
    // The table's bar floats over the bottom of the sheet: the drawing goes in what is left above it.
    const alto = Math.max(h - reservaAbajo(), h / 2);
    const z = Math.min(Math.max(Math.min(w / (x1 - x0), alto / (y1 - y0)), ZOOM_MIN), 1.5);
    fijarCam({ x: (x0 + x1) / 2 - w / 2 / z, y: (y0 + y1) / 2 - alto / 2 / z, z });
  };

  // The right click's menu: what is under the pointer, and the bar's tools, colors and thickness (the same functions).
  const menu = useMenuContextual(hoja, {
    armar: ({ x, y }) => {
      const [wx, wy] = aMundo(x, y);
      const tocado = [...elementos].reverse().find((el) => toca(el, wx, wy, 6 / camRef.current.z));
      const entradas = [];
      // On something of several chosen: what is done goes to all of them, color and thickness too.
      if (tocado && elegidosEl.length > 1 && elegidosEl.some((el) => el.id === tocado.id)) {
        const ids = elegidosEl.map((el) => el.id);
        const conLinea = elegidosEl.filter((el) => el.g !== undefined);
        const unColor = elegidosEl.every((el) => el.c === elegidosEl[0].c) ? elegidosEl[0].c : null;
        const unGrosor = conLinea.length && conLinea.every((el) => el.g === conLinea[0].g) ? conLinea[0].g : null;
        entradas.push(
          { etiqueta: `Borrar (${ids.length})`, atajo: 'Supr', hacer: () => { borrar(datos, ids, origen); setElegidos([]); } },
          { etiqueta: 'Traer al frente', hacer: () => apilarVarios(datos, ids, true, origen) },
          { etiqueta: 'Enviar atrás', hacer: () => apilarVarios(datos, ids, false, origen) },
          '-',
          { fila: 'Color', items: COLORES.map((c, i) => ({ etiqueta: NOMBRES_COLOR[i], muestra: c, rol: 'radio', marcado: unColor === i, hacer: () => cambiarVarios(datos, ids, { c: i }, origen) })) },
        );
        if (conLinea.length) {
          entradas.push({ fila: 'Grosor', items: GROSOR_NOMBRES.map((n, i) => ({ etiqueta: n, rol: 'radio', marcado: unGrosor === i, hacer: () => cambiarVarios(datos, ids, { g: i }, origen) })) });
        }
        return { etiqueta: `${ids.length} elegidos`, entradas };
      }
      if (tocado) {
        if (tocado.t === 'texto') entradas.push({ etiqueta: 'Editar texto', hacer: () => editarTexto(tocado) });
        entradas.push(
          { etiqueta: 'Borrar', atajo: herramienta === 'mover' ? 'Supr' : undefined, hacer: () => borrar(datos, [tocado.id], origen) },
          { etiqueta: 'Traer al frente', hacer: () => apilar(datos, tocado.id, true, origen) },
          { etiqueta: 'Enviar atrás', hacer: () => apilar(datos, tocado.id, false, origen) },
          '-',
        );
      }
      HERRAMIENTAS.filter(([id]) => EN_EL_MENU.has(id)).forEach(([id, nombre, tecla]) => {
        entradas.push({ etiqueta: nombre, atajo: tecla.toUpperCase(), rol: 'radio', marcado: herramienta === id, hacer: () => setHerramienta(id) });
      });
      entradas.push(
        { fila: 'Color', items: COLORES.map((c, i) => ({ etiqueta: NOMBRES_COLOR[i], muestra: c, rol: 'radio', marcado: color === i, hacer: () => setColor(i) })) },
        { fila: usaTamano ? 'Tamaño de la letra' : 'Grosor', items: (usaTamano ? TAMANO_NOMBRES : GROSOR_NOMBRES).map((n, i) => ({ etiqueta: n, rol: 'radio', marcado: grosor === i, hacer: () => setGrosor(i) })) },
      );
      if (!tocado) entradas.push('-', { etiqueta: 'Pegar', atajo: 'Mod+V', hacer: () => pegarEn(wx, wy) }, { etiqueta: 'Ver todo', hacer: centrar });
      return { etiqueta: 'Pizarra', entradas };
    },
    // The right button dragged: the view moves, with any tool.
    desplazar: () => {
      const c = camRef.current;
      return (dx, dy) => fijarCam({ ...c, x: c.x - dx / c.z, y: c.y - dy / c.z });
    },
    // A long touch: what the finger started is dropped.
    alAbrir: () => {
      setEnCurso(null);
      setArrastre(null);
      setRectangulo(null);
      gesto.current = null;
    },
    // From the keyboard, in the middle of the sheet.
    lugarTeclado: () => {
      const { w, h, x, y } = medida();
      return { x: x + w / 2, y: y + Math.max(h - reservaAbajo(), h / 2) / 2 };
    },
  });
  // Pasting from the menu: the text, where the menu opened.
  const pegarEn = async (wx, wy) => {
    try {
      const texto = (await navigator.clipboard.readText()).trim();
      if (texto) ponerTexto(wx, wy, texto);
    } catch {
      avisar(`El navegador no deja pegar desde el menú. Usá ${atajo('Mod+V')} en un texto.`, 'error');
    }
  };

  const vaciar = async () => {
    const ok = await confirmar({ titulo: '¿Vaciar la pizarra?', texto: 'Se borra para todos los de la sesión.', boton: 'Vaciar' });
    if (ok) borrar(datos, elementos.map((el) => el.id), origen);
  };

  // The others' pointers, from what they mark: only numbers in range, drawn where they fall on this screen.
  const punterosOtros = mesa.otros.flatMap((o) => {
    const x = numeroEn(o.h?.x, -1e5, 1e5, null);
    const y = numeroEn(o.h?.y, -1e5, 1e5, null);
    if (x === null || y === null) return [];
    return [{ id: o.id, nombre: o.nombre || 'Alguien', color: colorSeguro(o.color), x, y }];
  });

  // The field opens with the focus and the caret at the end of what it says.
  const alAbrirCampo = (c) => {
    if (!c || c.dataset.abierto) return;
    c.dataset.abierto = '1';
    c.focus();
    c.setSelectionRange(c.value.length, c.value.length);
  };
  const dibujos = useMemo(() => elementos.filter((el) => el.id !== editado).map((el) => <Elemento key={el.id} el={el} ajeno={ajenos.has(el.id)} />), [elementos, editado, ajenos]);
  const arrastrados = new Set(arrastre?.ids ?? []);
  const marcosElegidos = elegidosEl.map((el) => {
    const [x, y, w, h] = caja(el);
    const m = 6 / cam.z + (el.g != null ? GROSORES[el.g] / 2 : 0);
    const d = arrastrados.has(el.id) ? arrastre : { dx: 0, dy: 0 };
    return <rect key={el.id} className="vpiz-elegido" x={x - m + d.dx} y={y - m + d.dy} width={w + 2 * m} height={h + 2 * m} rx={4 / cam.z} />;
  });
  const patron = `vpiz-cuadros-${ayuda.replace(/:/g, '')}`;

  return (
    <div className="vh-herramienta vpiz">
      <div className="vh-barra" role="toolbar" aria-label="Herramientas de la pizarra">
        <div className="vh-grupo">
          {HERRAMIENTAS.map(([id, nombre, tecla]) => (
            <Boton key={id} icono={id} activo={herramienta === id} aria-keyshortcuts={tecla.toUpperCase()} onClick={() => setHerramienta(id)}>{nombre}</Boton>
          ))}
        </div>
        <div className="vh-grupo vpiz-colores" role="radiogroup" aria-label="Color">
          {COLORES.map((c, i) => (
            <button key={c} type="button" role="radio" aria-checked={color === i} aria-label={NOMBRES_COLOR[i]} title={NOMBRES_COLOR[i]} className="vh-muestra" style={{ '--muestra': c }} onClick={() => setColor(i)} />
          ))}
        </div>
        <div className="vh-grupo" role="radiogroup" aria-label={usaTamano ? 'Tamaño de la letra' : 'Grosor'}>
          {GROSOR_NOMBRES.map((n, i) => (
            <button key={n} type="button" role="radio" aria-checked={grosor === i} aria-label={usaTamano ? ['Chica', 'Mediana', 'Grande'][i] : n} title={usaTamano ? ['Chica', 'Mediana', 'Grande'][i] : n} className="vh-boton vpiz-grosor" onClick={() => setGrosor(i)}>
              <span style={{ '--g': `${[3, 6, 10][i]}px` }} aria-hidden="true" />
            </button>
          ))}
        </div>
        <div className="vh-grupo">
          <Boton icono="deshacer" disabled={!pilas.atras} onClick={atras}>Deshacer</Boton>
          <Boton icono="rehacer" disabled={!pilas.adelante} onClick={adelante}>Rehacer</Boton>
        </div>
        <div className="vh-grupo">
          <Boton icono="menos" onClick={() => zoomAlMedio(0.8)}>Alejar</Boton>
          <span className="vpiz-zoom" aria-live="polite">{Math.round(cam.z * 100)}%</span>
          <Boton icono="mas" onClick={() => zoomAlMedio(1.25)}>Acercar</Boton>
          <Boton icono="centrar" onClick={centrar}>Ver todo</Boton>
        </div>
        <div className="vh-grupo vh-barra__fin">
          <Boton icono="borrar" disabled={!elementos.length} onClick={vaciar}>Vaciar la pizarra</Boton>
        </div>
      </div>
      <Presentes otros={mesa.otros} />
      <div
        ref={hoja}
        className={`vpiz-hoja vpiz-hoja--${herramienta}`}
        role="application"
        aria-label="Pizarra compartida"
        aria-describedby={ayuda}
        tabIndex={0}
        onPointerDown={alBajar}
        onPointerMove={alMover}
        onPointerUp={alSoltar}
        onPointerCancel={alSoltar}
        onPointerLeave={() => marcar(null)}
        onKeyDown={alTeclear}
      >
        <p id={ayuda} className="solo-lectores">
          Flechas para moverte, más y menos para acercar. Con Mover, arrastrar sobre el papel elige lo que queda adentro, Mayúscula suma o saca uno y Control A elige todo. Enter escribe de nuevo el texto elegido, Suprimir borra lo elegido y Escape lo suelta. {textoPizarra(elementos) || 'Está vacía.'}
        </p>
        <svg className="vpiz-svg" aria-hidden="true">
          <defs>
            <pattern id={patron} width={CUADRO} height={CUADRO} patternUnits="userSpaceOnUse" patternTransform={`scale(${cam.z}) translate(${-cam.x} ${-cam.y})`}>
              <path d={`M${CUADRO} 0H0V${CUADRO}`} className="vpiz-cuadro" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" style={{ fill: `url(#${patron})` }} />
          <g transform={`scale(${cam.z}) translate(${-cam.x} ${-cam.y})`}>
            {arrastre ? elementos.map((el) => <Elemento key={el.id} el={el} ajeno={ajenos.has(el.id)} dx={arrastrados.has(el.id) ? arrastre.dx : 0} dy={arrastrados.has(el.id) ? arrastre.dy : 0} />) : dibujos}
            {marcosElegidos}
            {rectangulo && (
              <rect
                className="vpiz-rectangulo"
                x={Math.min(rectangulo.x1, rectangulo.x2)}
                y={Math.min(rectangulo.y1, rectangulo.y2)}
                width={Math.abs(rectangulo.x2 - rectangulo.x1)}
                height={Math.abs(rectangulo.y2 - rectangulo.y1)}
              />
            )}
            {enCurso && <Elemento el={enCurso.t === 'trazo' ? { ...enCurso, p: enCurso.p.length > 2 ? enCurso.p : [...enCurso.p, enCurso.p[0] + 0.1, enCurso.p[1]] } : enCurso} />}
          </g>
        </svg>
        {punterosOtros.map((p) => (
          <div key={p.id} className="vpiz-puntero" style={{ '--vpiz-px': p.x, '--vpiz-py': p.y, '--vpiz-cx': cam.x, '--vpiz-cy': cam.y, '--vpiz-z': cam.z, '--color-otro': p.color }} aria-hidden="true">
            <Icono nombre="mover" />
            <span>{p.nombre}</span>
          </div>
        ))}
        {menu}
        {escribiendo && (
          <textarea
            ref={alAbrirCampo}
            className="vpiz-escribir"
            aria-label={escribiendo.id ? 'Texto de la pizarra' : 'Texto para la pizarra'}
            maxLength={MAX_TEXTO}
            rows={Math.max(1, escribiendo.s.split('\n').length)}
            value={escribiendo.s}
            style={{
              left: (escribiendo.x - cam.x) * cam.z,
              top: (escribiendo.y - cam.y) * cam.z - TAMANOS[escribiendo.tam ?? grosor] * cam.z,
              fontSize: TAMANOS[escribiendo.tam ?? grosor] * cam.z,
              color: COLORES[escribiendo.c ?? color],
            }}
            onChange={(e) => setEscribiendo({ ...escribiendo, s: e.target.value })}
            onBlur={() => terminarTexto()}
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                terminarTexto(false);
              } else if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                terminarTexto();
              }
            }}
          />
        )}
      </div>
    </div>
  );
}
