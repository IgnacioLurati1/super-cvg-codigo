import { createContext, memo, useContext, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BaseEdge, ConnectionMode, EdgeLabelRenderer, Handle, Position, ReactFlow, useInternalNode, useReactFlow } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { nombreDe } from './edicion';
import { cajaDe, medidaOvalo, textoAtributo, tramo } from './geometria';

// The DER on squared paper, in the notation of the course's sheets: entity a rectangle (double if weak), vínculo a
// diamond (double if it identifies a weak one), one oval over each with its attributes (the key underlined), `min:max`
// next to the entity at each end, the hierarchy a circle with S or D (double line to the superclass if total) and the
// aggregation a box around its vínculo and entities. React Flow draws it; what each thing is lives in the `.der`.

const LADOS = [Position.Top, Position.Right, Position.Bottom, Position.Left];
const Puntos = () => LADOS.map((l) => <Handle key={l} type="source" position={l} id={l} />);

// What the sheet gives each oval: how to move it and the help a screen reader says on it.
const DeLaHoja = createContext({ alOvalo: () => {}, ayuda: undefined });

// Steps of the oval with the arrows, and with Shift.
const PASO = 8;
const PASO_LARGO = 40;

// The oval with the attributes. Over its shape until it is dragged (or moved with the arrows) somewhere else: then it
// keeps that place from the shape's middle (`ovalo` of the `.der`) and follows the shape, joined by a line.
function Ovalo({ tipo, x }) {
  const { alOvalo, ayuda } = useContext(DeLaHoja);
  const flujo = useReactFlow();
  const lista = useRef(null);
  const [vivo, setVivo] = useState(null);
  const [tam, setTam] = useState(null);
  const tiene = x.atributos.length > 0;

  // The sizes of the oval and its shape, unzoomed, for the line between them.
  useLayoutEffect(() => {
    const el = lista.current;
    if (!el) return undefined;
    const medir = () => setTam({ ow: el.offsetWidth, oh: el.offsetHeight, sw: el.parentElement.offsetWidth, sh: el.parentElement.offsetHeight });
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    obs.observe(el.parentElement);
    return () => obs.disconnect();
  }, [tiene]);

  if (!tiene) return null;
  const ovalo = vivo ?? x.ovalo;

  // Where it is now, from the shape's middle: the saved place, or measured where the CSS puts it over the shape.
  const ahora = () => {
    if (x.ovalo) return x.ovalo;
    const el = lista.current;
    const forma = el.parentElement.getBoundingClientRect();
    const o = el.getBoundingClientRect();
    const z = flujo.getZoom();
    return { dx: Math.round((o.left + o.width / 2 - forma.left - forma.width / 2) / z), dy: Math.round((o.top + o.height / 2 - forma.top - forma.height / 2) / z) };
  };

  const tomar = (e) => {
    if (e.button !== 0) return;
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const desde = ahora();
    const z = flujo.getZoom();
    const sx = e.clientX;
    const sy = e.clientY;
    let ultimo = null;
    const mover = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      if (!ultimo && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 3) return;
      ultimo = { dx: Math.round(desde.dx + (ev.clientX - sx) / z), dy: Math.round(desde.dy + (ev.clientY - sy) / z) };
      setVivo(ultimo);
    };
    const soltar = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      el.removeEventListener('pointermove', mover);
      el.removeEventListener('pointerup', soltar);
      el.removeEventListener('pointercancel', soltar);
      if (ultimo && ev.type === 'pointerup') alOvalo(tipo, x.id, ultimo);
      setVivo(null);
    };
    el.addEventListener('pointermove', mover);
    el.addEventListener('pointerup', soltar);
    el.addEventListener('pointercancel', soltar);
  };

  const teclas = (e) => {
    const paso = e.shiftKey ? PASO_LARGO : PASO;
    const d = { ArrowLeft: [-paso, 0], ArrowRight: [paso, 0], ArrowUp: [0, -paso], ArrowDown: [0, paso] }[e.key];
    if (!d || e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault();
    e.stopPropagation();
    const o = ahora();
    alOvalo(tipo, x.id, { dx: o.dx + d[0], dy: o.dy + d[1] }, `ovalo:${x.id}`);
  };

  // The line from the shape's outline to the oval's, when it is not over the shape.
  let linea = null;
  if (ovalo && tam) {
    const forma = { cx: tam.sw / 2, cy: tam.sh / 2, w: tam.sw, h: tam.sh, forma: tipo === 'vinculo' ? 'vinculo' : 'entidad' };
    const suyo = { cx: tam.sw / 2 + ovalo.dx, cy: tam.sh / 2 + ovalo.dy, w: tam.ow, h: tam.oh, forma: 'ovalo' };
    const { p, q } = tramo(forma, suyo);
    if (Math.hypot(q.x - p.x, q.y - p.y) > 1 && (q.x - p.x) * ovalo.dx + (q.y - p.y) * ovalo.dy > 0) linea = `M${p.x},${p.y}L${q.x},${q.y}`;
  }

  return (
    <>
      {linea && (
        <svg className="der-ovalo-linea" aria-hidden="true" focusable="false">
          <path d={linea} />
        </svg>
      )}
      <div
        ref={lista}
        className="der-ovalo nodrag nopan"
        data-libre={ovalo ? '' : undefined}
        data-moviendo={vivo ? '' : undefined}
        style={ovalo ? { transform: `translate(calc(-50% + ${ovalo.dx}px), calc(-50% + ${ovalo.dy}px))` } : undefined}
        tabIndex={0}
        role="group"
        aria-roledescription="óvalo"
        aria-label={`Atributos de ${x.nombre || 'sin nombre'}: ${x.atributos.map((a) => textoAtributo(a)).join(', ')}`}
        aria-describedby={ayuda}
        onPointerDown={tomar}
        onKeyDown={teclas}
      >
        <ul className="der-ovalo__lista">
          {x.atributos.map((a) => (
            <li key={a.id} data-clave={a.clave || undefined}>{textoAtributo(a)}</li>
          ))}
        </ul>
      </div>
    </>
  );
}

const Entidad = memo(function Entidad({ data }) {
  const { x } = data;
  return (
    <div className="der-entidad" data-debil={x.debil || undefined}>
      <Ovalo tipo="entidad" x={x} />
      <span className="der-nombre">{x.nombre || 'sin nombre'}</span>
      <Puntos />
    </div>
  );
});

const Vinculo = memo(function Vinculo({ data }) {
  const { x } = data;
  const chico = !x.nombre;
  return (
    <div className="der-vinculo" data-chico={chico || undefined} data-identificador={x.identificador || undefined}>
      <svg className="der-rombo" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <path d="M50 1L99 50 50 99 1 50z" vectorEffect="non-scaling-stroke" />
      </svg>
      {x.identificador && (
        <svg className="der-rombo der-rombo--dentro" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <path d="M50 1L99 50 50 99 1 50z" vectorEffect="non-scaling-stroke" />
        </svg>
      )}
      <Ovalo tipo="vinculo" x={x} />
      {!chico && <span className="der-nombre">{x.nombre}</span>}
      <Puntos />
    </div>
  );
});

const Jerarquia = memo(function Jerarquia({ data }) {
  return (
    <div className="der-jerarquia">
      <span aria-hidden="true">{data.x.tipo}</span>
      <Puntos />
    </div>
  );
});

const Agregacion = memo(function Agregacion() {
  return (
    <div className="der-agregacion">
      <Puntos />
    </div>
  );
});

const TIPOS_NODO = { entidad: Entidad, vinculo: Vinculo, jerarquia: Jerarquia, agregacion: Agregacion };

function cajaDelNodo(n) {
  const w = n?.measured?.width ?? 0;
  const h = n?.measured?.height ?? 0;
  if (!n || !w || !h) return null;
  const { x, y } = n.internals.positionAbsolute;
  return { cx: x + w / 2, cy: y + h / 2, w, h, forma: n.type };
}

// A line of the DER, straight from outline to outline. An end of a vínculo says its cardinality next to the entity
// (and its role, if it has one); total participation goes with a double line.
function Linea({ id, source, target, data }) {
  const desde = cajaDelNodo(useInternalNode(source));
  const hasta = cajaDelNodo(useInternalNode(target));
  if (!desde || !hasta) return null;
  const { p, q, ux, uy } = tramo(desde, hasta, data.desfase ?? 0);
  const camino = `M${p.x},${p.y}L${q.x},${q.y}`;
  const largo = Math.hypot(q.x - p.x, q.y - p.y);
  const lejos = Math.min(26, largo / 3);
  const etiqueta = { x: q.x - ux * lejos, y: q.y - uy * lejos };
  return (
    <>
      {data.doble ? (
        <>
          <path className="der-linea der-linea--doble" d={camino} />
          <path className="der-linea der-linea--hueco" d={camino} />
          <BaseEdge id={id} path={camino} className="der-linea--toque" />
        </>
      ) : (
        <BaseEdge id={id} path={camino} className="der-linea" />
      )}
      {(data.card || data.rol) && (
        <EdgeLabelRenderer>
          <span className="der-card" style={{ transform: `translate(-50%, -50%) translate(${etiqueta.x}px, ${etiqueta.y}px)` }}>
            {data.card}
            {data.rol && <em className="der-rol">{data.rol}</em>}
          </span>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const TIPOS_LINEA = { linea: Linea };

// «Ver todo»: the ovals stand over their shapes, out of what React Flow measures, so the top gets more air. On a phone,
// never so small that the names can't be read: what doesn't fit is reached by dragging the sheet.
export const VER_TODO = { padding: { top: '150px', right: '32px', bottom: '56px', left: '32px' }, maxZoom: 1.1 };
export const VER_TODO_ANGOSTA = { padding: { top: '96px', right: '16px', bottom: '64px', left: '16px' }, minZoom: 0.7, maxZoom: 1.1 };

const ETIQUETAS_A11Y = {
  'node.a11yDescription.default': 'Enter o espacio para elegirlo. Suprimir lo borra.',
  'node.a11yDescription.keyboardDisabled': 'Enter o espacio para elegirlo. Con las flechas se mueve. Suprimir lo borra.',
  'node.a11yDescription.ariaLiveMessage': ({ direction, x, y }) => `Movido hacia ${{ up: 'arriba', down: 'abajo', left: 'la izquierda', right: 'la derecha' }[direction] ?? direction}. Queda en ${x}, ${y}.`,
  'handle.ariaLabel': 'Punto para unir',
};

const TIPO_DE_LETRA = { e: 'entidad', v: 'vinculo', j: 'jerarquia', g: 'agregacion' };
const LETRA = Object.fromEntries(Object.entries(TIPO_DE_LETRA).map(([l, t]) => [t, l]));
export const idNodo = (tipo, id) => `${LETRA[tipo]}:${id}`;
export const deNodo = (nodo) => ({ tipo: TIPO_DE_LETRA[nodo[0]], id: nodo.slice(2) });

/** What a screen reader says of each shape. */
export function nombreDelElemento(der, tipo, x) {
  const lista = (ids) => new Intl.ListFormat('es').format(ids.map((i) => nombreDe(der, i) || 'sin nombre'));
  if (tipo === 'entidad') return `Entidad${x.debil ? ' débil' : ''} ${x.nombre}, ${x.atributos.length === 1 ? 'un atributo' : `${x.atributos.length} atributos`}`;
  if (tipo === 'vinculo') return `Vínculo${x.identificador ? ' identificador' : ''} ${x.nombre || 'sin nombre'} entre ${lista(x.puntas.map((p) => p.a))}`;
  if (tipo === 'jerarquia') return `Jerarquía ${x.tipo === 'S' ? 'solapada' : 'disyunta'} ${x.total ? 'total' : 'parcial'} de ${nombreDe(der, x.superclase) || 'sin superclase'}`;
  return `Agregación ${x.nombre}`;
}

export default function Hoja({ der, elegidos, alElegir, alMover, alBorrar, alUnir, puedeUnir, arrastre, setArrastre, alIniciar, alOvalo, marcados = {}, alMoverVista, verTodo = VER_TODO, children }) {
  const [medidas, setMedidas] = useState({});
  const ayuda = useId();
  const deLaHoja = useMemo(() => ({ alOvalo, ayuda }), [alOvalo, ayuda]);

  const lugar = (tipo, x) => arrastre[idNodo(tipo, x.id)] ?? { x: x.x, y: x.y };

  const nodes = useMemo(() => {
    const base = [
      ...der.entidades.map((x) => ({ tipo: 'entidad', x })),
      ...der.vinculos.map((x) => ({ tipo: 'vinculo', x })),
      ...der.jerarquias.map((x) => ({ tipo: 'jerarquia', x })),
    ].map(({ tipo, x }) => {
      const id = idNodo(tipo, x.id);
      // What someone else chose at a live table, outlined in their color.
      const otro = marcados[id];
      return { id, type: tipo, position: lugar(tipo, x), data: { x }, selected: elegidos.includes(id), measured: medidas[id], ariaLabel: nombreDelElemento(der, tipo, x), ...(otro ? { className: 'der-de-otro', style: { '--color-otro': otro } } : {}) };
    });
    // The box of each aggregation, around where its shapes are now.
    const porId = new Map(base.map((n) => [n.id, n]));
    const cajas = der.agregaciones.map((g) => {
      const v = der.vinculos.find((x) => x.id === g.vinculo);
      if (!v) return null;
      const miembros = [idNodo('vinculo', v.id), ...v.puntas.map((p) => idNodo('entidad', p.a))]
        .map((id) => porId.get(id))
        .filter((n) => n?.measured)
        .map((n) => ({ x: n.position.x, y: n.position.y, w: n.measured.width, h: n.measured.height, ovalo: medidaOvalo(n.data.x.atributos, n.data.x.ovalo) }));
      const c = cajaDe(miembros);
      if (!c) return null;
      const id = idNodo('agregacion', g.id);
      return {
        id,
        type: 'agregacion',
        position: { x: c.x, y: c.y },
        style: { width: c.w, height: c.h },
        data: { x: g },
        draggable: false,
        zIndex: -1,
        selected: elegidos.includes(id),
        measured: medidas[id],
        ariaLabel: nombreDelElemento(der, 'agregacion', g),
      };
    }).filter(Boolean);
    return [...cajas, ...base];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [der, elegidos, medidas, arrastre, marcados]);

  const edges = useMemo(() => {
    const lista = [];
    const nodoDe = (a) => (der.agregaciones.some((g) => g.id === a) ? idNodo('agregacion', a) : idNodo('entidad', a));
    for (const v of der.vinculos) {
      // Two ends to the same entity (a recursive vínculo) go side by side.
      const veces = new Map();
      v.puntas.forEach((p) => veces.set(p.a, (veces.get(p.a) ?? 0) + 1));
      const vistas = new Map();
      v.puntas.forEach((p, i) => {
        const n = veces.get(p.a);
        const k = vistas.get(p.a) ?? 0;
        vistas.set(p.a, k + 1);
        const debil = der.entidades.find((e) => e.id === p.a)?.debil;
        lista.push({
          id: `p:${v.id}:${i}`,
          source: idNodo('vinculo', v.id),
          target: nodoDe(p.a),
          type: 'linea',
          data: { card: p.card, rol: p.rol, doble: Boolean(v.identificador && debil), desfase: (k - (n - 1) / 2) * 26 },
        });
      });
    }
    for (const j of der.jerarquias) {
      if (j.superclase) lista.push({ id: `s:${j.id}`, source: idNodo('jerarquia', j.id), target: idNodo('entidad', j.superclase), type: 'linea', data: { doble: j.total } });
      j.subclases.forEach((s) => lista.push({ id: `h:${j.id}:${s}`, source: idNodo('jerarquia', j.id), target: idNodo('entidad', s), type: 'linea', data: {} }));
    }
    return lista.filter((e) => e.source !== e.target);
  }, [der]);

  const onNodesChange = (cambios) => {
    const fuera = cambios.filter((c) => c.type === 'remove').map((c) => c.id);
    if (fuera.length) alBorrar(fuera);
    const medidasNuevas = cambios.filter((c) => c.type === 'dimensions' && c.dimensions);
    if (medidasNuevas.length) setMedidas((m) => ({ ...m, ...Object.fromEntries(medidasNuevas.map((c) => [c.id, c.dimensions])) }));
    const sel = cambios.filter((c) => c.type === 'select');
    if (sel.length) {
      alElegir((antes) => {
        const s = new Set(antes);
        sel.forEach((c) => (c.selected ? s.add(c.id) : s.delete(c.id)));
        return [...s];
      });
    }
    const lugares = cambios.filter((c) => c.type === 'position' && c.position);
    if (lugares.length) {
      const enCurso = lugares.filter((c) => c.dragging);
      if (enCurso.length) setArrastre((a) => ({ ...a, ...Object.fromEntries(enCurso.map((c) => [c.id, c.position])) }));
      const listos = lugares.filter((c) => !c.dragging);
      if (listos.length) alMover(listos.map((c) => ({ id: c.id, position: c.position })));
    }
    // A drag that ends sends no position: what was dragged is let go.
    const fin = cambios.filter((c) => c.type === 'position' && !c.position && c.dragging === false);
    if (fin.length) alMover(fin.map((c) => ({ id: c.id, position: null })));
  };

  return (
    <DeLaHoja.Provider value={deLaHoja}>
      <p id={ayuda} hidden>Con las flechas se corre. Con Shift, más lejos.</p>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={TIPOS_NODO}
        edgeTypes={TIPOS_LINEA}
        onNodesChange={onNodesChange}
        onConnect={(c) => alUnir(c.source, c.target)}
        isValidConnection={(c) => puedeUnir(c.source, c.target)}
        connectionMode={ConnectionMode.Loose}
        onEdgeClick={(_, e) => alElegir([e.source])}
        onInit={alIniciar}
        onMove={alMoverVista}
        edgesFocusable={false}
        edgesReconnectable={false}
        minZoom={0.25}
        maxZoom={2}
        fitView
        fitViewOptions={verTodo}
        snapToGrid
        snapGrid={[8, 8]}
        deleteKeyCode={['Delete', 'Backspace']}
        multiSelectionKeyCode={['Shift', 'Meta', 'Control']}
        selectionKeyCode={null}
        zoomOnDoubleClick={false}
        ariaLabelConfig={ETIQUETAS_A11Y}
        proOptions={{ hideAttribution: true }}
        aria-label="Diagrama de entidad-relación"
      >
        {children}
      </ReactFlow>
    </DeLaHoja.Provider>
  );
}
