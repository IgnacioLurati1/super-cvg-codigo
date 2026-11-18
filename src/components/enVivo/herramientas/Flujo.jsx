import { memo, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Background, BackgroundVariant, BaseEdge, ConnectionMode, EdgeLabelRenderer, Handle, ReactFlow, ReactFlowProvider, ViewportPortal,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  agregarNodo, borrar, cambiarFlecha, cambiarNodo, conectar, duplicarNodo, FORMAS, GROSORES, invertirFlecha, LADOS, ladosEntre, leerFlujo, LINEAS, MAX_ETIQUETA, MAX_TEXTO, nombreNodo, textoFlujo,
} from '../../../lib/enVivo/flujo';
import { colorSeguro } from '../../../lib/enVivo/documento';
import { pestanas } from '../../../lib/enVivo/mesa';
import GloboDelLienzo, { cosaEn, elementoEnLienzo, lugarEnLienzo } from './GloboDelLienzo';
import { useMenuContextual } from './MenuContextual';
import { Boton, Icono, Presentes, margenVerTodo, nombreArchivo, numeroEn, reservaAbajo, useCambios, useDeshacer, useParaConsultron, useSeguir, useLienzoSuave } from './comun';
import { ANCHOS, caminoFlecha, COLORES, flujoEnPng, guiones, lugarEtiqueta, MEDIDA, POSICION, punta } from './flujoDibujo';
import { NOMBRES_COLOR } from './lienzo';
import './diagrama.css';
import './flujo.css';

// Diagrama de flujo: the shapes of a flowchart (start and end, process, decision, input or output, subprocess,
// connector) joined by square-cornered arrows from any side to any side, built together (React Flow over the tab's
// `datos`). The view is the point at the middle and the zoom. 

const ZOOM_MIN = 0.3;
const ZOOM_MAX = 2.5;
const CADA_PUNTERO = 100;
const NOMBRE_LADO = { t: 'arriba', r: 'la derecha', b: 'abajo', l: 'la izquierda' };
const SEPARACION = 56;
// How far the pointer goes on a shape of the bar before it is dragged and not clicked.
const ARRASTRE = 6;

// The style of a shape or an arrow (flujo.js) as the CSS takes it: only what is not the usual.
function variables(v) {
  const e = {};
  const ancho = ANCHOS[v.g ?? 0];
  if (v.c) e['--vflu-c'] = COLORES[v.c];
  if (v.g) e['--vflu-g'] = `${ancho}px`;
  if (v.l) {
    e['--vflu-l'] = v.l === 1 ? 'dashed' : 'dotted';
    e['--vflu-guion'] = guiones(v.l, ancho).join(' ');
  }
  return e;
}

const ETIQUETAS_A11Y = {
  'node.a11yDescription.default': 'Enter o espacio para elegirla. Suprimir la borra y Escape la suelta.',
  'node.a11yDescription.keyboardDisabled': 'Enter o espacio para elegirla. Con las flechas se mueve. Suprimir la borra y Escape la suelta.',
  'node.a11yDescription.ariaLiveMessage': ({ direction, x, y }) => `Movida hacia ${{ up: 'arriba', down: 'abajo', left: 'la izquierda', right: 'la derecha' }[direction] ?? direction}. Queda en ${x}, ${y}.`,
  'edge.a11yDescription.default': 'Enter o espacio para elegir la flecha. Suprimir la borra y Escape la suelta.',
  'handle.ariaLabel': 'Punto de conexión',
};

// --- A shape: its outline, a point on each side and its text, written right inside it.

function Escribir({ n, alTerminar, cambiar }) {
  const campo = useRef(null);
  // A new shape stays hidden until React Flow measures it, and a hidden field takes no focus: tried each frame.
  useEffect(() => {
    let vueltas = 0;
    let marco = 0;
    const enfocar = () => {
      const c = campo.current;
      if (!c) return;
      c.focus();
      if (document.activeElement === c) c.setSelectionRange(c.value.length, c.value.length);
      else if ((vueltas += 1) < 30) marco = requestAnimationFrame(enfocar);
    };
    enfocar();
    return () => cancelAnimationFrame(marco);
  }, []);
  return (
    <textarea
      ref={campo}
      className="vflu-escribir nodrag nopan nowheel"
      aria-label={`Texto de ${FORMAS[n.t].toLowerCase()}`}
      value={n.txt}
      maxLength={MAX_TEXTO}
      rows={1}
      onChange={(e) => cambiar(e.target.value)}
      onBlur={() => alTerminar(false)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape' || (e.key === 'Enter' && !e.shiftKey)) {
          e.preventDefault();
          alTerminar(true);
        }
      }}
    />
  );
}

const Forma = memo(function Forma({ data, selected }) {
  const { n, marcadoPor, editando, alTerminar, cambiar } = data;
  return (
    <div
      className={`vflu-forma vflu-forma--${n.t}${selected ? ' es-elegido' : ''}`}
      style={{ ...variables(n), ...(marcadoPor ? { '--color-otro': marcadoPor } : {}) }}
      data-marcado={marcadoPor ? '' : undefined}
      data-relleno={n.r ? '' : undefined}
      data-linea={n.l || undefined}
    >
      {n.t === 'decision' && (
        <svg className="vflu-rombo" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path d="M50 1L99 50 50 99 1 50z" vectorEffect="non-scaling-stroke" />
        </svg>
      )}
      {LADOS.map((l) => <Handle key={l} type="source" position={POSICION[l]} id={l} />)}
      {editando
        ? <Escribir n={n} alTerminar={alTerminar} cambiar={cambiar} />
        : <span className={n.txt ? 'vflu-texto' : 'vflu-texto vflu-vacio'}>{n.txt || (n.t === 'conector' ? '' : FORMAS[n.t])}</span>}
    </div>
  );
});

// An arrow: square corners, its style, its head always whole (the same path as in the image) and its label next to
// where it leaves.
function Paso({ id, sourceX, sourceY, targetX, targetY, data, selected }) {
  const [camino, fin] = caminoFlecha([sourceX, sourceY], [targetX, targetY], data.sd, data.ad);
  const e = data.txt ? lugarEtiqueta(sourceX, sourceY, data.sd) : null;
  const estilo = variables(data);
  return (
    <>
      <BaseEdge id={id} path={camino} style={estilo} className={[selected && 'es-elegida', data.l === 2 && 'vflu-puntos'].filter(Boolean).join(' ') || undefined} />
      <path className="vflu-punta" d={punta(fin, data.ad, ANCHOS[data.g ?? 0])} style={estilo} />
      {e && (
        <EdgeLabelRenderer>
          <span className="vflu-etiqueta nodrag nopan" data-flecha={id} style={{ transform: `translate(${e.derecha ? '-100%' : '0'}, -100%) translate(${e.x}px, ${e.y}px)` }}>{data.txt}</span>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const TIPOS_NODO = Object.fromEntries(Object.keys(FORMAS).map((t) => [t, Forma]));
const TIPOS_FLECHA = { paso: Paso };

// --- What is chosen: its shape, its arrows and joining it to another, by keyboard too.

/** The style of what is chosen: a color of the palette, the line, its thickness and, for a shape, the fill. */
function Estilo({ v, forma, cambiar, idCampo }) {
  return (
    <>
      <div className="vflu-colores" role="radiogroup" aria-label="Color">
        {COLORES.map((c, i) => (
          <button key={c} type="button" role="radio" aria-checked={(v.c ?? 0) === i} aria-label={NOMBRES_COLOR[i]} title={NOMBRES_COLOR[i]} className="vh-muestra" style={{ '--muestra': c }} onClick={() => cambiar({ c: i })} />
        ))}
      </div>
      <label className="vdia-signo-campo">
        Línea
        <select id={`${idCampo}-linea`} value={v.l ?? 0} onChange={(e) => cambiar({ l: Number(e.target.value) })}>
          {LINEAS.map((n, i) => <option key={n} value={i}>{n}</option>)}
        </select>
      </label>
      <label className="vdia-signo-campo">
        Grosor
        <select value={v.g ?? 0} onChange={(e) => cambiar({ g: Number(e.target.value) })}>
          {GROSORES.map((n, i) => <option key={n} value={i}>{n}</option>)}
        </select>
      </label>
      {forma && (
        <label className="vdia-signo-campo vflu-relleno">
          <input type="checkbox" checked={Boolean(v.r)} onChange={(e) => cambiar({ r: e.target.checked ? 1 : 0 })} />
          Relleno
        </label>
      )}
    </>
  );
}

/** The same, as rows of the right click's menu. */
const filasDeEstilo = (v, forma, cambiar) => [
  '-',
  { fila: 'Color', items: COLORES.map((c, i) => ({ etiqueta: NOMBRES_COLOR[i], muestra: c, rol: 'radio', marcado: (v.c ?? 0) === i, hacer: () => cambiar({ c: i }) })) },
  { fila: 'Línea', items: LINEAS.map((n, i) => ({ etiqueta: n, rol: 'radio', marcado: (v.l ?? 0) === i, hacer: () => cambiar({ l: i }) })) },
  { fila: 'Grosor', items: GROSORES.map((n, i) => ({ etiqueta: n, rol: 'radio', marcado: (v.g ?? 0) === i, hacer: () => cambiar({ g: i }) })) },
  ...(forma ? [{ etiqueta: 'Relleno', rol: 'check', marcado: Boolean(v.r), hacer: () => cambiar({ r: v.r ? 0 : 1 }) }] : []),
];

function Elegido({ fl, nodo, flecha, datos, origen, alBorrar, alEscribir, idCampo }) {
  const [hacia, setHacia] = useState('');
  const ladoSelect = (valor, cambiar, etiqueta) => (
    <label className="vdia-signo-campo">
      {etiqueta}
      <select value={valor} onChange={(e) => cambiar(e.target.value)}>
        {LADOS.map((l) => <option key={l} value={l}>{NOMBRE_LADO[l]}</option>)}
      </select>
    </label>
  );
  if (flecha) {
    return (
      <div className="vh-globo vdia-elegido">
        <label>
          Texto de la flecha
          <input id={idCampo} value={flecha.txt} maxLength={MAX_ETIQUETA} placeholder="Sí" onChange={(e) => cambiarFlecha(datos, flecha.id, { txt: e.target.value }, origen)} />
        </label>
        {ladoSelect(flecha.sd, (sd) => cambiarFlecha(datos, flecha.id, { sd }, origen), 'Sale por')}
        {ladoSelect(flecha.ad, (ad) => cambiarFlecha(datos, flecha.id, { ad }, origen), 'Entra por')}
        <Estilo v={flecha} cambiar={(c) => cambiarFlecha(datos, flecha.id, c, origen)} idCampo={idCampo} />
        <button type="button" className="boton boton--chico boton--secundario" onClick={alBorrar}>Borrar flecha</button>
      </div>
    );
  }
  const otros = fl.nodos.filter((o) => o.id !== nodo.id);
  const unir = (e) => {
    e.preventDefault();
    const a = otros.find((o) => o.id === (hacia || otros[0]?.id));
    if (!a) return;
    const [sd, ad] = ladosEntre(nodo, a, fl.flechas.filter((f) => f.de === nodo.id).map((f) => f.sd));
    conectar(datos, { de: nodo.id, sd, a: a.id, ad }, origen);
    setHacia('');
  };
  return (
    <form className="vh-globo vdia-elegido" onSubmit={unir}>
      <button id={idCampo} type="button" className="boton boton--chico" onClick={alEscribir}>Escribir</button>
      <label className="vdia-signo-campo">
        Forma
        <select id={`${idCampo}-forma`} value={nodo.t} onChange={(e) => cambiarNodo(datos, nodo.id, { t: e.target.value }, origen)}>
          {Object.entries(FORMAS).map(([t, nombre]) => <option key={t} value={t}>{nombre}</option>)}
        </select>
      </label>
      <Estilo v={nodo} forma cambiar={(c) => cambiarNodo(datos, nodo.id, c, origen)} idCampo={idCampo} />
      {otros.length > 0 && (
        <>
          <label>
            Flecha hacia
            <select id={`${idCampo}-hacia`} value={hacia || otros[0].id} onChange={(e) => setHacia(e.target.value)}>
              {otros.map((o) => <option key={o.id} value={o.id}>{nombreNodo(o)}</option>)}
            </select>
          </label>
          <button type="submit" className="boton boton--chico">Unir</button>
        </>
      )}
      <button type="button" className="boton boton--chico boton--secundario" onClick={alBorrar}>Borrar</button>
    </form>
  );
}

function Lienzo({ mesa }) {
  const { datos, marcar, mover: moverVista, soltar, vista, paraGuardar } = mesa;
  const flujo = useReactFlow();
  const cambios = useCambios(datos);
  const fl = useMemo(() => leerFlujo(datos), [datos, cambios]); // eslint-disable-line react-hooks/exhaustive-deps
  const [origen] = useState(() => ({ flujo: true }));
  const { atras, adelante, teclas, puedeAtras, puedeAdelante } = useDeshacer(datos, origen);
  const contenedor = useRef(null);
  // Each sheet its own id: React Flow names its grid and its arrowheads with it, and with the same name the ones of a
  // hidden tab would be used (and not drawn).
  const idLienzo = `vdia${useId().replace(/[^\w-]/g, '')}`;
  const idCampo = useId();

  // What is only of this browser: what is chosen, the size React Flow measured, where a shape goes while dragged and
  // which one is being written.
  const [local, setLocal] = useState({});
  const [elegidas, setElegidas] = useState(() => new Set());
  const [editando, setEditando] = useState(null);
  // Done writing with the keyboard, the focus goes back to the shape, to go on from there.
  const terminar = (id, conTeclado) => {
    setEditando((e) => (e === id ? null : e));
    if (conTeclado) requestAnimationFrame(() => contenedor.current?.querySelector(`.react-flow__node[data-id="${id}"]`)?.focus());
  };

  useParaConsultron(mesa, () => textoFlujo(leerFlujo(datos)));

  // «Guardar en lo mío»: the flowchart as an image, once it has a shape.
  const hayAlgo = fl.nodos.length > 0;
  useEffect(() => (hayAlgo ? paraGuardar(() => {
    const ahora = leerFlujo(datos);
    const medidas = new Map(ahora.nodos.map((n) => [n.id, flujo.getInternalNode(n.id)?.measured]));
    const titulo = pestanas(mesa.doc).find((p) => p.id === mesa.id)?.titulo ?? 'Diagrama de flujo';
    return flujoEnPng(ahora, medidas, contenedor.current ?? document.body, nombreArchivo(titulo, 'png'));
  }) : undefined), [hayAlgo, paraGuardar, datos, flujo, mesa.doc, mesa.id]);

  // The others: their pointer (in the flowchart's coordinates) and the shape they chose.
  const marcados = new Map();
  const punteros = [];
  mesa.otros.forEach((o) => {
    const color = colorSeguro(o.color);
    if (typeof o.h?.sel === 'string') marcados.set(o.h.sel, color);
    const x = numeroEn(o.h?.x, -1e5, 1e5, null);
    const y = numeroEn(o.h?.y, -1e5, 1e5, null);
    if (x !== null && y !== null) punteros.push({ id: o.id, nombre: o.nombre || 'Alguien', color, x, y });
  });
  const claveMarcados = JSON.stringify([...marcados]);

  const nodes = useMemo(() => fl.nodos.map((n) => {
    const l = local[n.id] ?? {};
    return {
      id: n.id,
      type: n.t,
      position: l.arrastre ?? { x: n.x, y: n.y },
      data: {
        n,
        marcadoPor: marcados.get(n.id),
        editando: editando === n.id,
        alTerminar: (conTeclado) => terminar(n.id, conTeclado),
        cambiar: (txt) => cambiarNodo(datos, n.id, { txt }, origen),
      },
      selected: Boolean(l.elegido),
      measured: l.medida,
      dragging: Boolean(l.arrastre),
      ariaLabel: nombreNodo(n),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [fl, local, claveMarcados, editando]);
  const edges = useMemo(() => {
    const porId = new Map(fl.nodos.map((n) => [n.id, n]));
    return fl.flechas.map((f) => ({
      id: f.id,
      source: f.de,
      sourceHandle: f.sd,
      target: f.a,
      targetHandle: f.ad,
      type: 'paso',
      data: { txt: f.txt, sd: f.sd, ad: f.ad, c: f.c, l: f.l, g: f.g },
      selected: elegidas.has(f.id),
      ariaLabel: `Flecha de ${nombreNodo(porId.get(f.de))} a ${nombreNodo(porId.get(f.a))}${f.txt ? `, «${f.txt}»` : ''}`,
    }));
  }, [fl, elegidas]);

  // Dragging: everyone sees it move, a few times per second; the last place always goes.
  const relojArrastre = useRef(new Map());
  const guardarLugar = (id, pos, ya) => {
    const relojes = relojArrastre.current;
    const escribir = () => cambiarNodo(datos, id, { x: Math.round(pos.x), y: Math.round(pos.y) }, origen);
    if (ya) {
      clearTimeout(relojes.get(id));
      relojes.delete(id);
      escribir();
      return;
    }
    if (relojes.has(id)) return;
    relojes.set(id, setTimeout(() => {
      relojes.delete(id);
      escribir();
    }, 120));
  };

  const onNodesChange = (lista) => {
    const fuera = lista.filter((c) => c.type === 'remove').map((c) => c.id);
    if (fuera.length) borrar(datos, { nodos: fuera }, origen);
    lista.forEach((c) => {
      if (c.type === 'position' && c.position) guardarLugar(c.id, c.position, !c.dragging);
    });
    setLocal((antes) => {
      const nuevo = { ...antes };
      lista.forEach((c) => {
        const l = { ...(nuevo[c.id] ?? {}) };
        if (c.type === 'dimensions' && c.dimensions) l.medida = c.dimensions;
        else if (c.type === 'select') l.elegido = c.selected;
        else if (c.type === 'position') l.arrastre = c.dragging && c.position ? c.position : null;
        else if (c.type === 'remove') {
          delete nuevo[c.id];
          return;
        }
        nuevo[c.id] = l;
      });
      return nuevo;
    });
  };
  const onEdgesChange = (lista) => {
    const fuera = lista.filter((c) => c.type === 'remove').map((c) => c.id);
    if (fuera.length) borrar(datos, { flechas: fuera }, origen);
    setElegidas((antes) => {
      const nuevo = new Set(antes);
      lista.forEach((c) => {
        if (c.type === 'select' && c.selected) nuevo.add(c.id);
        else if (c.type === 'select' || c.type === 'remove') nuevo.delete(c.id);
      });
      return nuevo;
    });
  };

  // Any side to any side, as many as wanted; a shape does not go to itself.
  const esValida = (c) => c.source !== c.target;
  const onConnect = (c) => conectar(datos, { de: c.source, sd: c.sourceHandle, a: c.target, ad: c.targetHandle }, origen);

  const nodoElegido = fl.nodos.filter((n) => local[n.id]?.elegido);
  const flechaElegida = fl.flechas.filter((f) => elegidas.has(f.id));
  const unico = nodoElegido.length + flechaElegida.length === 1 ? { nodo: nodoElegido[0], flecha: flechaElegida[0] } : null;

  // What this browser chose and where its pointer is, for the others.
  const ultimo = useRef({ t: 0, x: null, y: null });
  const elegidoId = nodoElegido.length === 1 ? nodoElegido[0].id : null;
  useEffect(() => {
    const u = ultimo.current;
    marcar(u.x === null && !elegidoId ? null : { x: u.x, y: u.y, sel: elegidoId });
  }, [elegidoId, marcar]);
  useEffect(() => () => marcar(null), [marcar]);
  const alMoverPuntero = (e) => {
    const ahora = performance.now();
    if (ahora - ultimo.current.t < CADA_PUNTERO) return;
    const p = flujo.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    ultimo.current = { t: ahora, x: Math.round(p.x), y: Math.round(p.y) };
    marcar({ x: ultimo.current.x, y: ultimo.current.y, sel: elegidoId });
  };

  const elegirSolo = (id) => {
    setLocal((antes) => ({ ...Object.fromEntries(Object.entries(antes).map(([k, v]) => [k, { ...v, elegido: false }])), [id]: { ...(antes[id] ?? {}), elegido: true } }));
    setElegidas(new Set());
  };

  // A new shape: under the chosen one and joined to it, or in the middle of the view, or where the menu opened
  // (`punto`, of the screen). It opens to be written.
  const agregar = (t, punto) => {
    const [w, h] = MEDIDA[t];
    const previo = !punto && nodoElegido.length === 1 ? nodoElegido[0] : null;
    let lugar;
    if (previo) {
      const m = local[previo.id]?.medida ?? { width: MEDIDA[previo.t][0], height: MEDIDA[previo.t][1] };
      lugar = { x: previo.x + m.width / 2 - w / 2, y: previo.y + m.height + SEPARACION };
      // A decision's second way out goes to the side.
      const salen = fl.flechas.filter((f) => f.de === previo.id);
      if (previo.t === 'decision' && salen.length) lugar = { x: previo.x + m.width + SEPARACION * 1.5, y: previo.y + m.height / 2 - h / 2 };
    } else {
      const r = contenedor.current.getBoundingClientRect();
      const medio = flujo.screenToFlowPosition(punto ?? { x: r.left + r.width / 2, y: r.top + r.height / 2 });
      const corrido = punto ? 0 : (fl.nodos.length % 5) * 16;
      lugar = { x: medio.x - w / 2 + corrido, y: medio.y - h / 2 + corrido };
    }
    const id = agregarNodo(datos, t, { x: Math.round(lugar.x / 8) * 8, y: Math.round(lugar.y / 8) * 8 }, origen);
    if (!id) return;
    if (previo) {
      const nuevo = { id, t, x: lugar.x, y: lugar.y };
      const [sd, ad] = ladosEntre(previo, nuevo, fl.flechas.filter((f) => f.de === previo.id).map((f) => f.sd));
      conectar(datos, { de: previo.id, sd, a: id, ad }, origen);
    }
    elegirSolo(id);
    setEditando(id);
    // A shape that lands outside the view brings the view to it.
    const v = flujo.getViewport();
    const r = contenedor.current.getBoundingClientRect();
    const sx = lugar.x * v.zoom + v.x;
    const sy = lugar.y * v.zoom + v.y;
    if (sx < 0 || sy < 0 || sx + w * v.zoom > r.width || sy + h * v.zoom > r.height - reservaAbajo()) {
      flujo.setCenter(lugar.x + w / 2, lugar.y + h / 2, { zoom: v.zoom, duration: 200 });
    }
  };

  // A shape of the bar is dragged onto the sheet and lands where it is dropped; a click still puts it as before. Its
  // ghost follows the pointer, at the sheet's zoom. Escape, or dropping it out of the sheet, leaves it.
  const [fantasma, setFantasma] = useState(null);
  const sinClick = useRef(false);
  const enLaHoja = (x, y) => document.elementFromPoint(x, y)?.closest('.vdia-lienzo') === contenedor.current;
  const tomarPieza = (e, t) => {
    if (e.button !== 0) return;
    sinClick.current = false;
    const g = { id: e.pointerId, sx: e.clientX, sy: e.clientY, andando: false };
    const quitar = () => {
      window.removeEventListener('pointermove', alMover);
      window.removeEventListener('pointerup', alSoltar);
      window.removeEventListener('pointercancel', alCancelar);
      window.removeEventListener('keydown', alEscape, true);
    };
    const terminar = (punto) => {
      quitar();
      if (!g.andando) return;
      sinClick.current = true;
      setFantasma(null);
      if (punto && enLaHoja(punto.x, punto.y)) agregar(t, punto);
    };
    function alMover(ev) {
      if (ev.pointerId !== g.id) return;
      if (!g.andando && Math.hypot(ev.clientX - g.sx, ev.clientY - g.sy) < ARRASTRE) return;
      g.andando = true;
      setFantasma({ t, x: ev.clientX, y: ev.clientY, dentro: enLaHoja(ev.clientX, ev.clientY), z: flujo.getViewport().zoom });
    }
    function alSoltar(ev) {
      if (ev.pointerId === g.id) terminar({ x: ev.clientX, y: ev.clientY });
    }
    function alCancelar(ev) {
      if (ev.pointerId === g.id) terminar(null);
    }
    function alEscape(ev) {
      if (ev.key !== 'Escape' || !g.andando) return;
      ev.preventDefault();
      ev.stopPropagation();
      terminar(null);
    }
    window.addEventListener('pointermove', alMover);
    window.addEventListener('pointerup', alSoltar);
    window.addEventListener('pointercancel', alCancelar);
    window.addEventListener('keydown', alEscape, true);
  };
  const ponerPieza = (t) => {
    if (sinClick.current) {
      sinClick.current = false;
      return;
    }
    agregar(t);
  };

  const borrarElegido = () => {
    borrar(datos, { nodos: nodoElegido.map((n) => n.id), flechas: flechaElegida.map((f) => f.id) }, origen);
    setElegidas(new Set());
  };
  // Choosing an arrow alone, and going to a field of the box of what is chosen.
  const elegirFlecha = (id) => {
    setLocal((antes) => Object.fromEntries(Object.entries(antes).map(([k, v]) => [k, { ...v, elegido: false }])));
    setElegidas(new Set([id]));
  };
  const alCampo = (id) => setTimeout(() => document.getElementById(id)?.focus(), 0);

  // The right click's menu: on the sheet, a shape where it opened; on a shape or an arrow, what the box does.
  const menu = useMenuContextual(contenedor, {
    armar: ({ x, y, objetivo }) => {
      const { nodo: idNodo, flecha: idFlecha } = cosaEn(objetivo);
      const nodo = fl.nodos.find((n) => n.id === idNodo);
      const flecha = fl.flechas.find((f) => f.id === idFlecha);
      let entradas;
      if (nodo) {
        entradas = [
          { etiqueta: 'Editar texto', hacer: () => { elegirSolo(nodo.id); setEditando(nodo.id); } },
          { etiqueta: 'Cambiar forma', hacer: () => { elegirSolo(nodo.id); alCampo(`${idCampo}-forma`); } },
          { etiqueta: 'Unir con…', deshabilitado: fl.nodos.length < 2, hacer: () => { elegirSolo(nodo.id); alCampo(`${idCampo}-hacia`); } },
          { etiqueta: 'Duplicar', hacer: () => { const id = duplicarNodo(datos, nodo.id, origen); if (id) elegirSolo(id); } },
          { etiqueta: 'Borrar', atajo: 'Supr', hacer: () => borrar(datos, { nodos: [nodo.id] }, origen) },
          ...filasDeEstilo(nodo, true, (c) => cambiarNodo(datos, nodo.id, c, origen)),
        ];
      } else if (flecha) {
        entradas = [
          { etiqueta: 'Editar texto', hacer: () => { elegirFlecha(flecha.id); alCampo(idCampo); } },
          { etiqueta: 'Invertir', hacer: () => invertirFlecha(datos, flecha.id, origen) },
          { etiqueta: 'Borrar', atajo: 'Supr', hacer: () => borrar(datos, { flechas: [flecha.id] }, origen) },
          ...filasDeEstilo(flecha, false, (c) => cambiarFlecha(datos, flecha.id, c, origen)),
        ];
      } else {
        entradas = Object.entries(FORMAS).map(([t, nombre]) => ({ etiqueta: `Agregar ${nombre.toLowerCase()}`, hacer: () => agregar(t, { x, y }) }));
      }
      entradas.push(
        '-',
        { etiqueta: 'Deshacer', atajo: 'Mod+Z', deshabilitado: !puedeAtras, hacer: atras },
        { etiqueta: 'Rehacer', atajo: 'Mod+Shift+Z', deshabilitado: !puedeAdelante, hacer: adelante },
      );
      return { etiqueta: nodo ? 'Forma' : flecha ? 'Flecha' : 'Diagrama de flujo', entradas };
    },
    lugarTeclado: () => lugarEnLienzo(contenedor),
    // The right button dragged: the view moves, and whoever was followed is let go.
    desplazar: () => {
      const v = flujo.getViewport();
      suave.parar();
      if (vista) soltar();
      return (dx, dy) => flujo.setViewport({ x: v.x + dx, y: v.y + dy, zoom: v.zoom });
    },
  });

  // The box of what is chosen: opened from the keyboard, the focus goes into it; Escape lets go of the thing and gives
  // it back the focus.
  const porTeclado = useRef(false);
  const cerrarGlobo = () => {
    const el = unico && elementoEnLienzo(contenedor, { nodo: unico.nodo?.id, flecha: unico.flecha?.id });
    setLocal((antes) => Object.fromEntries(Object.entries(antes).map(([k, v]) => [k, { ...v, elegido: false }])));
    setElegidas(new Set());
    requestAnimationFrame(() => el?.focus());
  };

  // Escape on the sheet lets go of what is chosen, as inside its box.
  const alTeclear = (e) => {
    if (e.key === 'Escape' && unico && !editando && !e.defaultPrevented) {
      cerrarGlobo();
      return;
    }
    teclas(e);
  };

  // --- The view, the same on any screen: the middle and the zoom.
  const contar = (v) => {
    const r = contenedor.current?.getBoundingClientRect();
    if (!r) return;
    moverVista({ cx: Math.round((r.width / 2 - v.x) / v.zoom), cy: Math.round((r.height / 2 - v.y) / v.zoom), z: Math.round(v.zoom * 100) / 100 });
  };
  // Following, the view glides to the other's middle and zoom: React Flow is told each step, without its own trip.
  const medida = () => {
    const r = contenedor.current?.getBoundingClientRect();
    return { w: r?.width || 600, h: r?.height || 400 };
  };
  const suave = useLienzoSuave(Boolean(vista), medida, {
    aplicar: (v) => flujo.setCenter(v.cx, v.cy, { zoom: v.z, duration: 0 }),
    leer: () => {
      const { w, h } = medida();
      const { x, y, zoom } = flujo.getViewport();
      return { cx: (w / 2 - x) / zoom, cy: (h / 2 - y) / zoom, z: zoom };
    },
  });
  useSeguir(vista, (v) => {
    suave.ir({ cx: numeroEn(v.cx, -1e5, 1e5, 0), cy: numeroEn(v.cy, -1e5, 1e5, 0), z: numeroEn(v.z, ZOOM_MIN, ZOOM_MAX, 1) });
  });
  const alMoverVista = (evento, v) => {
    contar(v);
    // A move that comes from a person (not from following) lets go of whoever is followed.
    if (!evento) return;
    suave.parar();
    if (vista) soltar();
  };

  return (
    <>
      <div className="vh-barra" role="toolbar" aria-label="Diagrama de flujo">
        <div className="vh-grupo">
          {Object.entries(FORMAS).map(([t, nombre]) => <Boton key={t} icono={t} className="vh-boton vflu-pieza" onPointerDown={(e) => tomarPieza(e, t)} onClick={() => ponerPieza(t)}>{nombre}</Boton>)}
        </div>
        <div className="vh-grupo">
          <Boton icono="deshacer" disabled={!puedeAtras} onClick={atras}>Deshacer</Boton>
          <Boton icono="rehacer" disabled={!puedeAdelante} onClick={adelante}>Rehacer</Boton>
        </div>
        <div className="vh-grupo">
          <Boton icono="menos" onClick={() => flujo.zoomOut()}>Alejar</Boton>
          <Boton icono="mas" onClick={() => flujo.zoomIn()}>Acercar</Boton>
          <Boton icono="centrar" onClick={() => flujo.fitView({ padding: margenVerTodo(), maxZoom: 1.5 })}>Ver todo</Boton>
        </div>
        <p className="vdia-ayuda">Con una forma elegida, la nueva va abajo y unida. También se arrastra a la hoja.</p>
      </div>
      {fantasma && createPortal(
        <div className="vflu-fantasma" data-fuera={fantasma.dentro ? undefined : ''} style={{ transform: `translate(${fantasma.x}px, ${fantasma.y}px) translate(-50%, -50%) scale(${fantasma.z})` }} aria-hidden="true">
          <div className={`vflu-forma vflu-forma--${fantasma.t}`} style={{ inlineSize: MEDIDA[fantasma.t][0], blockSize: MEDIDA[fantasma.t][1] }}>
            {fantasma.t === 'decision' && (
              <svg className="vflu-rombo" viewBox="0 0 100 100" preserveAspectRatio="none">
                <path d="M50 1L99 50 50 99 1 50z" vectorEffect="non-scaling-stroke" />
              </svg>
            )}
            <span className="vflu-texto vflu-vacio">{fantasma.t === 'conector' ? '' : FORMAS[fantasma.t]}</span>
          </div>
        </div>,
        document.fullscreenElement ?? document.body,
      )}
      <Presentes otros={mesa.otros} />
      <div ref={contenedor} className="vdia-lienzo" onKeyDownCapture={() => { porTeclado.current = true; }} onPointerDownCapture={() => { porTeclado.current = false; }} onKeyDown={alTeclear} onPointerMove={alMoverPuntero} onPointerLeave={() => marcar(elegidoId ? { sel: elegidoId } : null)}>
        {menu}
        {/* Next to what is chosen, not on top of the tool. */}
        {unico && !editando && (
          <GloboDelLienzo
            key={unico.nodo?.id ?? unico.flecha.id}
            contenedor={contenedor}
            cual={{ nodo: unico.nodo?.id, flecha: unico.flecha?.id }}
            alCerrar={cerrarGlobo}
            conTeclado={() => porTeclado.current}
            etiqueta={unico.nodo ? 'Forma elegida' : 'Flecha elegida'}
          >
            <Elegido
              fl={fl}
              {...unico}
              datos={datos}
              origen={origen}
              alBorrar={borrarElegido}
              alEscribir={() => setEditando(unico.nodo.id)}
              idCampo={idCampo}
            />
          </GloboDelLienzo>
        )}
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={TIPOS_NODO}
          edgeTypes={TIPOS_FLECHA}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          isValidConnection={esValida}
          connectionMode={ConnectionMode.Loose}
          onMove={alMoverVista}
          onInit={(f) => contar(f.getViewport())}
          onNodeDoubleClick={(_, n) => setEditando(n.id)}
          onEdgeDoubleClick={() => setTimeout(() => document.getElementById(idCampo)?.focus(), 0)}
          minZoom={ZOOM_MIN}
          maxZoom={ZOOM_MAX}
          defaultViewport={{ x: 40, y: 40, zoom: 1 }}
          snapToGrid
          snapGrid={[8, 8]}
          deleteKeyCode={['Delete', 'Backspace']}
          zoomOnDoubleClick={false}
          ariaLabelConfig={ETIQUETAS_A11Y}
          id={idLienzo}
          proOptions={{ hideAttribution: true }}
          aria-label="Diagrama de flujo compartido"
        >
          <Background variant={BackgroundVariant.Lines} gap={24} className="vdia-fondo" />
          <ViewportPortal>
            {punteros.map((p) => (
              <div key={p.id} className="vdia-puntero" style={{ transform: `translate(${p.x}px, ${p.y}px)`, '--color-otro': p.color }} aria-hidden="true">
                <Icono nombre="mover" />
                <span>{p.nombre}</span>
              </div>
            ))}
          </ViewportPortal>
        </ReactFlow>
      </div>
    </>
  );
}

export default function Flujo({ mesa }) {
  return (
    <div className="vh-herramienta vdia vflu">
      <ReactFlowProvider>
        <Lienzo mesa={mesa} />
      </ReactFlowProvider>
    </div>
  );
}
