import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Background, BackgroundVariant, ReactFlowProvider, useReactFlow, useStore, ViewportPortal } from '@xyflow/react';
import { MAX_CODIGO } from '../../../lib/laboratorio/saneo';
import { agregarAgregacion, agregarEntidad, agregarJerarquia, agregarPunta, agregarVinculo, borrar, buscar, cambiar, extremosNuevos, lugarDeJerarquia, lugarLibre, MAX_PUNTAS } from './edicion';
import Ficha from './Ficha';
import { MEDIDA } from './geometria';
import Hoja, { deNodo, idNodo, VER_TODO, VER_TODO_ANGOSTA } from './Hoja';
import { derEnTexto, derVacio, leerDer } from '../../../lib/laboratorio/der/modelo';
import { pasarATablas } from '../../../lib/laboratorio/der/pasaje';
import { revisarDer } from '../../../lib/laboratorio/der/revisar';
import { crearSql, faltanParaSql } from '../../../lib/laboratorio/der/sql';
import Tablas from './Tablas';
import './der.css';

// A `.der` of the lab (docs/laboratorio-der.md): the E-R diagram on its sheet, with what is chosen written out beside
// it, and «Pasar a tablas» with the decisions only the student makes. «Crear SQL» adds the project's `.sql`. What the
// sheet does goes back to the file's text at once (`alCambiar`), and Ctrl+Z undoes it.
// At a live session's table (`compartido`, from components/enVivo/herramientas/Laboratorio.jsx) the sheet is the
// shared one: { manejo (lib/enVivo/derCompartido.js: read, write, undo what this browser did), otros ([{ id, nombre,
// color, marca: { x, y, sel } }]), marcar({ x, y, sel }), vista ({ cx, cy, z } of whoever is followed, or null),
// mover({ cx, cy, z }), soltar() }.

const JUNTAR_MS = 800;
// How often this browser's pointer goes to the others, at most.
const CADA_PUNTERO = 100;
const nada = () => () => {};
const ninguno = () => null;
// How far the pointer goes on a button of the bar before it is dragged and not clicked.
const ARRASTRE = 6;
// Narrower than this (der.css, its @container), the DER is on a phone.
const ANGOSTA_REM = 44;

const reducido = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// The shapes of the bar, drawn as in the notation.
const FORMAS = {
  entidad: <rect x="3" y="7" width="18" height="10" />,
  vinculo: <path d="M12 5l9 7-9 7-9-7z" />,
  jerarquia: <circle cx="12" cy="12" r="6" />,
  agregacion: (
    <>
      <rect x="2.5" y="4.5" width="19" height="15" />
      <path d="M12 8.5l5 3.5-5 3.5-5-3.5z" />
    </>
  ),
};
// The shape under the pointer while a button of the bar is dragged, at the sheet's zoom.
function Fantasma({ tipo, x, y, z, dentro }) {
  const [w, h] = MEDIDA[tipo];
  const forma = {
    entidad: <rect x="1" y="1" width={w - 2} height={h - 2} />,
    vinculo: <path d={`M${w / 2} 1L${w - 1} ${h / 2}L${w / 2} ${h - 1}L1 ${h / 2}Z`} />,
    jerarquia: <circle cx={w / 2} cy={h / 2} r={w / 2 - 1} />,
    agregacion: <rect x="1" y="1" width={w - 2} height={h - 2} className="der-fantasma__caja" />,
  }[tipo];
  return (
    <svg className="der-fantasma" data-fuera={dentro ? undefined : ''} width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ transform: `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${z})` }} aria-hidden="true" focusable="false">
      {forma}
    </svg>
  );
}

const Forma = ({ tipo }) => <svg className="der-forma" viewBox="0 0 24 24" aria-hidden="true" focusable="false">{FORMAS[tipo]}</svg>;

// The others' pointers at a live table, on the sheet, with their name at the same size whatever the zoom.
function Punteros({ lista }) {
  const zoom = useStore((s) => s.transform[2]);
  return (
    <ViewportPortal>
      {lista.map((p) => (
        <div key={p.id} className="der-puntero" style={{ transform: `translate(${p.marca.x}px, ${p.marca.y}px) scale(${1 / zoom})`, '--color-otro': p.color }} aria-hidden="true">
          <svg viewBox="0 0 16 16" focusable="false"><path d="M1 1l5 13 2-5 5-2z" /></svg>
          <span>{p.nombre}</span>
        </div>
      ))}
    </ViewportPortal>
  );
}

const vistaDe = (der) => ({ der, atras: [], adelante: [], juntar: null, cuando: 0 });

function Adentro({ texto, nombre, alCambiar, alCrearSql, avisar, compartido = null }) {
  const id = useId();
  const flujo = useReactFlow();
  const hoja = useRef(null);
  const raiz = useRef(null);
  const [fantasma, setFantasma] = useState(null);
  const sinClick = useRef(false);
  const manejo = compartido?.manejo ?? null;
  const leido = useMemo(() => (manejo ? derVacio() : texto.trim() ? leerDer(texto) : derVacio()), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [estado, setEstado] = useState(() => vistaDe(leido ?? derVacio()));
  const [roto, setRoto] = useState(!leido);
  // Shared: the DER is the table's, and the history is of what this browser did.
  const enLaMesa = useSyncExternalStore(manejo ? manejo.suscribir : nada, manejo ? manejo.leer : ninguno);
  const der = enLaMesa ? enLaMesa.der : estado.der;
  const hayAtras = enLaMesa ? enLaMesa.atras > 0 : estado.atras.length > 0;
  const hayAdelante = enLaMesa ? enLaMesa.adelante > 0 : estado.adelante.length > 0;
  const [vista, setVista] = useState('diagrama');
  // What is chosen: what someone else deleted at the table goes out of it.
  const [elegidosTodos, setElegidos] = useState([]);
  // What a new shape chose by itself (it is chosen when it lands): it is not the student's choice for a hierarchy.
  const recien = useRef(null);
  const elegir = useCallback((l) => {
    recien.current = null;
    setElegidos(l);
  }, []);
  const elegidos = useMemo(() => elegidosTodos.filter((n) => {
    const c = deNodo(n);
    return Boolean(c.tipo && buscar(der, c.tipo, c.id));
  }), [elegidosTodos, der]);
  const [arrastre, setArrastre] = useState({});
  const [dicho, setDicho] = useState('');

  const resultado = useMemo(() => pasarATablas(der), [der]);
  // What the course would mark, from the drawing and from the pasaje, once each.
  const avisos = useMemo(() => [...revisarDer(der), ...resultado.avisos].filter((a, i, todos) => todos.findIndex((b) => b.id === a.id) === i), [der, resultado]);
  const faltan = useMemo(() => faltanParaSql(resultado), [resultado]);
  const pendientes = faltan.length;
  // The list of what is missing for the SQL, under the bar.
  const [verFaltan, setVerFaltan] = useState(false);
  // On a phone: the card is a sheet under the drawing (der.css), the list of everything opens on request, «Ver todo»
  // keeps the names readable and the DER comes into view when it opens.
  const [angosta, setAngosta] = useState(false);
  const [verLista, setVerLista] = useState(false);
  const verTodo = angosta ? VER_TODO_ANGOSTA : VER_TODO;

  // Every change: to the history and to the file. `juntar`: what is typed in a field goes as one change.
  const aplicar = (nuevo, juntar = null) => {
    if (nuevo === der) return;
    const t = derEnTexto(nuevo);
    if (t.length > MAX_CODIGO) {
      avisar('El diagrama llegó a su tamaño máximo. Hacé otro archivo para lo que falta.', 'error');
      return;
    }
    if (manejo) {
      manejo.escribir(nuevo);
      return;
    }
    const ahora = Date.now();
    setEstado((e) => {
      const sigue = juntar && e.juntar === juntar && ahora - e.cuando < JUNTAR_MS;
      return { der: nuevo, atras: sigue ? e.atras : [...e.atras.slice(-99), e.der], adelante: [], juntar, cuando: ahora };
    });
    alCambiar(t);
  };

  const atras = () => {
    if (manejo) {
      if (!hayAtras) return;
      manejo.deshacer();
      setDicho('Deshecho.');
      return;
    }
    if (!estado.atras.length) return;
    const previo = estado.atras.at(-1);
    setEstado((e) => ({ der: previo, atras: e.atras.slice(0, -1), adelante: [e.der, ...e.adelante], juntar: null, cuando: 0 }));
    alCambiar(derEnTexto(previo));
    setDicho('Deshecho.');
  };
  const adelante = () => {
    if (manejo) {
      if (!hayAdelante) return;
      manejo.rehacer();
      setDicho('Rehecho.');
      return;
    }
    if (!estado.adelante.length) return;
    const siguiente = estado.adelante[0];
    setEstado((e) => ({ der: siguiente, atras: [...e.atras, e.der], adelante: e.adelante.slice(1), juntar: null, cuando: 0 }));
    alCambiar(derEnTexto(siguiente));
    setDicho('Rehecho.');
  };

  // Where a new shape goes: where it was dropped, or the middle of the sheet in view.
  const lugar = (tipo, punto) => {
    const [w, h] = MEDIDA[tipo];
    if (punto) {
      const p = flujo.screenToFlowPosition(punto);
      return { x: Math.round(p.x - w / 2), y: Math.round(p.y - h / 2) };
    }
    const r = hoja.current?.getBoundingClientRect();
    const p = r ? flujo.screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 2 }) : { x: 0, y: 0 };
    return lugarLibre(der, { x: p.x - w / 2, y: p.y - h / 2 }, tipo);
  };

  // An aggregation dropped on the sheet takes the free vínculo nearest to where it fell.
  const vinculoCerca = (punto) => {
    const libres = der.vinculos.filter((x) => !der.agregaciones.some((g) => g.vinculo === x.id));
    if (!punto || !libres.length) return null;
    const p = flujo.screenToFlowPosition(punto);
    const lejos = (v) => Math.hypot(v.x + MEDIDA.vinculo[0] / 2 - p.x, v.y + MEDIDA.vinculo[1] / 2 - p.y);
    return libres.reduce((a, b) => (lejos(b) < lejos(a) ? b : a)).id;
  };

  const enfocarNodo = (nodo) => requestAnimationFrame(() => hoja.current?.querySelector(`.react-flow__node[data-id="${CSS.escape(nodo)}"]`)?.focus({ preventScroll: true }));
  const enfocarNombre = () => requestAnimationFrame(() => {
    const campo = document.getElementById(`${id}-ficha`)?.querySelector('[data-der-nombre]');
    campo?.focus({ preventScroll: true });
    campo?.select();
  });

  const centrar = (nodo) => {
    const n = flujo.getInternalNode(nodo);
    if (!n) return;
    const w = n.measured?.width ?? 0;
    const h = n.measured?.height ?? 0;
    flujo.setCenter(n.internals.positionAbsolute.x + w / 2, n.internals.positionAbsolute.y + h / 2, { zoom: flujo.getZoom(), duration: reducido() ? 0 : 200 });
  };

  const entidadesElegidas = elegidos.map(deNodo).filter((c) => c.tipo === 'entidad').map((c) => c.id);
  const vinculoElegido = elegidos.map(deNodo).find((c) => c.tipo === 'vinculo')?.id;
  const jerarquiaElegida = elegidos.map(deNodo).find((c) => c.tipo === 'jerarquia')?.id;

  const acciones = {
    agregar(tipo, punto = null) {
      let nuevo;
      let nuevoId;
      if (tipo === 'entidad') [nuevo, nuevoId] = agregarEntidad(der, lugar(tipo, punto));
      else if (tipo === 'vinculo') {
        // From what is chosen: an entity or an aggregation is one end, two are both.
        const extremos = extremosNuevos(der, elegidos.map(deNodo).filter((c) => c.tipo === 'entidad' || c.tipo === 'agregacion').map((c) => c.id));
        if (!extremos.length) {
          avisar('Sumá una entidad afuera de la agregación para unirla.', 'error');
          return;
        }
        [nuevo, nuevoId] = agregarVinculo(der, extremos, punto ? lugar(tipo, punto) : null);
      } else if (tipo === 'jerarquia') {
        // The superclass is the entity the student chose first; with none, the first of the diagram.
        const aMano = elegidos.length === 1 && elegidos[0] === recien.current ? [] : entidadesElegidas;
        const ents = aMano.length ? aMano : [buscar(der, 'jerarquia', jerarquiaElegida)?.superclase ?? der.entidades[0].id];
        // Nothing new to add: the one that is already there, not an empty one.
        const ya = der.jerarquias.find((j) => j.superclase === ents[0] && ents.slice(1).every((s) => j.subclases.includes(s)));
        if (ya) {
          elegir([idNodo('jerarquia', ya.id)]);
          avisar(`«${buscar(der, 'entidad', ents[0])?.nombre}» ya tiene su jerarquía. Marcá sus subclases.`);
          return;
        }
        [nuevo, nuevoId] = agregarJerarquia(der, ents[0], ents.slice(1), punto ? lugar(tipo, punto) : lugarDeJerarquia(der, ents[0]));
      } else {
        const v = vinculoCerca(punto) ?? vinculoElegido ?? der.vinculos.find((x) => !der.agregaciones.some((g) => g.vinculo === x.id))?.id;
        [nuevo, nuevoId] = agregarAgregacion(der, v);
      }
      aplicar(nuevo);
      const nodo = idNodo(tipo, nuevoId);
      setElegidos([nodo]);
      recien.current = nodo;
      setDicho(`Sumaste ${tipo === 'entidad' ? 'una entidad' : tipo === 'vinculo' ? 'un vínculo' : tipo === 'jerarquia' ? 'una jerarquía' : 'una agregación'}.`);
      if (tipo !== 'jerarquia') enfocarNombre();
    },
    unir(nodos) {
      const [nuevo, v] = agregarVinculo(der, nodos.map(deNodo).map((c) => c.id));
      aplicar(nuevo);
      setElegidos([idNodo('vinculo', v)]);
      recien.current = idNodo('vinculo', v);
      setDicho('Sumaste un vínculo.');
      enfocarNombre();
    },
    jerarquia(ids) {
      const s = buscar(der, 'entidad', ids[0]);
      const [nuevo, j] = agregarJerarquia(der, ids[0], ids.slice(1), lugarDeJerarquia(der, ids[0]));
      aplicar(nuevo);
      setElegidos([idNodo('jerarquia', j)]);
      setDicho(`Sumaste una jerarquía de ${s.nombre}.`);
    },
    borrar(nodos) {
      let nuevo = der;
      nodos.map(deNodo).forEach((c) => {
        nuevo = borrar(nuevo, c.tipo, c.id);
      });
      aplicar(nuevo);
      setElegidos([]);
      setDicho(nodos.length === 1 ? 'Borrado. Ctrl + Z lo trae de vuelta.' : `Borraste ${nodos.length}. Ctrl + Z los trae de vuelta.`);
      requestAnimationFrame(() => document.getElementById(`${id}-ficha`)?.focus({ preventScroll: true }));
    },
    soltar() {
      const antes = elegidos[0];
      setElegidos([]);
      if (antes) enfocarNodo(antes);
    },
    ir(nodo) {
      elegir([nodo]);
      centrar(nodo);
      enfocarNodo(nodo);
    },
  };

  // Joining by dragging from the edge of a shape: two entities (or aggregations) get a vínculo between them, a vínculo
  // gets one more end, and an entity joined to a hierarchy is its superclass if it has none, a subclass if it has.
  const puedeUnir = (a, b) => {
    const [x, y] = [deNodo(a), deNodo(b)];
    const extremo = (c) => c.tipo === 'entidad' || c.tipo === 'agregacion';
    if (extremo(x) && extremo(y)) return true;
    const v = x.tipo === 'vinculo' ? x : y.tipo === 'vinculo' ? y : null;
    const otro = v === x ? y : x;
    if (v && extremo(otro)) return (buscar(der, 'vinculo', v.id)?.puntas.length ?? MAX_PUNTAS) < MAX_PUNTAS;
    const j = x.tipo === 'jerarquia' ? x : y.tipo === 'jerarquia' ? y : null;
    return Boolean(j && (j === x ? y : x).tipo === 'entidad');
  };
  const unirArrastrando = (a, b) => {
    if (!puedeUnir(a, b)) return;
    const [x, y] = [deNodo(a), deNodo(b)];
    if (x.tipo === 'vinculo' || y.tipo === 'vinculo') {
      const [v, otro] = x.tipo === 'vinculo' ? [x, y] : [y, x];
      aplicar(agregarPunta(der, v.id, otro.id));
      setDicho('Sumaste una punta al vínculo.');
    } else if (x.tipo === 'jerarquia' || y.tipo === 'jerarquia') {
      const [jn, e] = x.tipo === 'jerarquia' ? [x, y] : [y, x];
      const j = buscar(der, 'jerarquia', jn.id);
      if (!j || j.superclase === e.id || j.subclases.includes(e.id)) return;
      aplicar(cambiar(der, 'jerarquia', j.id, { subclases: [...j.subclases, e.id] }));
      setDicho('Sumaste una subclase.');
    } else acciones.unir([a, b]);
  };

  // The oval of an entity or a vínculo, moved from its shape: the arrows go together in one step of the history.
  const moverOvalo = (tipo, elId, ovalo, juntar = null) => aplicar(cambiar(der, tipo, elId, { ovalo }), juntar);

  const alMover = (lista) => {
    let nuevo = der;
    lista.forEach(({ id: nodo, position }) => {
      const c = deNodo(nodo);
      const p = position ?? arrastre[nodo];
      if (p && c.tipo !== 'agregacion') nuevo = cambiar(nuevo, c.tipo, c.id, { x: Math.round(p.x), y: Math.round(p.y) });
    });
    setArrastre((a) => {
      const b = { ...a };
      lista.forEach(({ id: nodo }) => delete b[nodo]);
      return b;
    });
    aplicar(nuevo, `mover:${lista.map((l) => l.id).join()}`);
  };

  // «Ver en el diagrama» of a warning: the entity, vínculo or aggregation it is about.
  const ver = (donde) => {
    const tipo = ['entidad', 'vinculo', 'agregacion', 'jerarquia'].find((t) => buscar(der, t, donde));
    const nodo = tipo ? idNodo(tipo, donde) : null;
    setVista('diagrama');
    if (nodo) requestAnimationFrame(() => acciones.ir(nodo));
  };

  const pasar = () => {
    setVista(vista === 'tablas' ? 'diagrama' : 'tablas');
    requestAnimationFrame(() => document.getElementById(`${id}-cuerpo`)?.focus({ preventScroll: true }));
  };

  const sql = () => {
    if (!der.entidades.length) {
      avisar('Sumá al menos una entidad para crear el SQL.', 'error');
      return;
    }
    const r = crearSql(resultado, der.decisiones.tipos);
    if (!r.sql) {
      setVista('tablas');
      setVerFaltan(true);
      avisar(r.faltan.length === 1 ? `Todavía no. ${r.faltan[0]}` : `Todavía no. Faltan ${r.faltan.length} cosas para el SQL.`, 'error');
      return;
    }
    alCrearSql(r.sql);
  };

  const teclas = (e) => {
    // Escape on the sheet lets go of what is chosen, and the focus goes back to it.
    if (e.key === 'Escape' && elegidos.length && !e.defaultPrevented && e.target.closest('.der-hoja')) {
      e.preventDefault();
      acciones.soltar();
      return;
    }
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.target.closest('input, textarea, select')) return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) atras();
    else if ((k === 'z' && e.shiftKey) || k === 'y') adelante();
    else return;
    e.preventDefault();
  };

  // --- At the table: this browser's pointer and what it chose, for the others; the view, given and followed.
  const ultimo = useRef({ t: 0, x: null, y: null });
  const compartidoRef = useRef(compartido);
  useEffect(() => {
    compartidoRef.current = compartido;
  });
  const claveElegidos = elegidos.join();
  // Another choice, its card from the top.
  useEffect(() => {
    document.getElementById(`${id}-ficha`)?.scrollTo?.({ top: 0 });
  }, [claveElegidos, id]);
  // On a phone the sheet of the card can cover what was just chosen: it comes up into the drawing.
  useEffect(() => {
    if (!angosta || elegidos.length !== 1) return undefined;
    const nodo = elegidos[0];
    let cuadro = requestAnimationFrame(() => {
      cuadro = requestAnimationFrame(() => {
        const r = hoja.current?.getBoundingClientRect();
        const n = hoja.current?.querySelector(`.react-flow__node[data-id="${CSS.escape(nodo)}"]`)?.getBoundingClientRect();
        if (r && n && (n.top < r.top || n.bottom > r.bottom || n.left < r.left || n.right > r.right)) centrar(nodo);
      });
    });
    return () => cancelAnimationFrame(cuadro);
  }, [claveElegidos, angosta]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!compartidoRef.current) return;
    const { x, y } = ultimo.current;
    compartidoRef.current.marcar({ x, y, sel: claveElegidos ? claveElegidos.split(',') : [] });
  }, [claveElegidos]);
  const enMesa = Boolean(compartido);
  useEffect(() => (enMesa ? () => compartidoRef.current?.marcar(null) : undefined), [enMesa]);
  // At most every CADA_PUNTERO, and the last place always goes.
  const pendiente = useRef(0);
  const enviarPuntero = (x, y, t) => {
    ultimo.current = { t, x, y };
    compartidoRef.current?.marcar({ x, y, sel: elegidosRef.current });
  };
  const elegidosRef = useRef(elegidos);
  useEffect(() => {
    elegidosRef.current = elegidos;
  });
  useEffect(() => () => clearTimeout(pendiente.current), []);
  const alMoverPuntero = (e) => {
    if (!compartido) return;
    const ahora = performance.now();
    const p = flujo.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const [x, y] = [Math.round(p.x), Math.round(p.y)];
    clearTimeout(pendiente.current);
    const espera = CADA_PUNTERO - (ahora - ultimo.current.t);
    if (espera > 0) pendiente.current = setTimeout(() => enviarPuntero(x, y, ahora + espera), espera);
    else enviarPuntero(x, y, ahora);
  };
  const alSalirPuntero = () => {
    if (!compartido) return;
    clearTimeout(pendiente.current);
    ultimo.current = { t: 0, x: null, y: null };
    compartido.marcar({ x: null, y: null, sel: elegidos });
  };
  const marcados = useMemo(() => {
    const m = {};
    (compartido?.otros ?? []).forEach((o) => o.marca.sel.forEach((n) => {
      m[n] ??= o.color;
    }));
    return m;
  }, [compartido?.otros]);
  const punteros = (compartido?.otros ?? []).filter((o) => o.marca.x !== null);

  // The view goes out as its middle and zoom (the same on any screen); a move of one's own lets go of whoever is followed.
  const alMoverVista = useCallback((evento, v) => {
    const c = compartidoRef.current;
    const r = hoja.current?.getBoundingClientRect();
    if (!c || !r) return;
    c.mover({ cx: Math.round((r.width / 2 - v.x) / v.zoom), cy: Math.round((r.height / 2 - v.y) / v.zoom), z: Math.round(v.zoom * 100) / 100 });
    if (evento) c.soltar();
  }, []);
  const seguida = compartido?.vista ? JSON.stringify(compartido.vista) : null;
  useEffect(() => {
    if (!seguida) return;
    const v = JSON.parse(seguida);
    flujo.setCenter(v.cx, v.cy, { zoom: v.z, duration: reducido() ? 0 : 250 });
  }, [seguida, flujo]);
  const deUno = (hacer) => () => {
    compartido?.soltar();
    hacer();
  };

  useLayoutEffect(() => {
    const el = raiz.current;
    if (!el) return undefined;
    const medir = () => setAngosta(el.offsetWidth > 0 && el.offsetWidth < ANGOSTA_REM * parseFloat(getComputedStyle(document.documentElement).fontSize));
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, [roto]);
  // Opened on a phone, the lab's tab and the DER fill the screen (der.css): the page goes down to them, once.
  const asomado = useRef(false);
  useEffect(() => {
    if (!angosta || asomado.current || compartido) return;
    asomado.current = true;
    const centro = raiz.current?.closest('.lab-centro');
    if (centro) centro.scrollIntoView({ block: 'start', behavior: 'instant' });
  }, [angosta, compartido]);

  if (roto) {
    return (
      <div ref={raiz} className="der der--roto">
        <p>Este archivo no se pudo leer como diagrama.</p>
        <button
          type="button"
          className="boton boton--chico"
          onClick={() => {
            setRoto(false);
            aplicar(derVacio());
          }}
        >
          Empezar uno vacío
        </button>
      </div>
    );
  }

  // A button of the bar is dragged onto the sheet and the shape lands where it is dropped; a click still puts it in the
  // middle. Its ghost follows the pointer, at the sheet's zoom. Escape, or dropping it out of the sheet, leaves it.
  const enLaHoja = (x, y) => document.elementFromPoint(x, y)?.closest('.der-hoja') === hoja.current;
  const tomarPieza = (e, tipo) => {
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
      if (punto && enLaHoja(punto.x, punto.y)) acciones.agregar(tipo, punto);
    };
    function alMover(ev) {
      if (ev.pointerId !== g.id) return;
      if (!g.andando && Math.hypot(ev.clientX - g.sx, ev.clientY - g.sy) < ARRASTRE) return;
      g.andando = true;
      setFantasma({ tipo, x: ev.clientX, y: ev.clientY, dentro: enLaHoja(ev.clientX, ev.clientY), z: flujo.getViewport().zoom });
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
  const ponerPieza = (tipo) => {
    if (sinClick.current) {
      sinClick.current = false;
      return;
    }
    acciones.agregar(tipo);
  };

  const sinEntidades = !der.entidades.length;
  return (
    <div ref={raiz} className="der" data-vista={vista} onKeyDown={teclas}>
      <div className="der-barra">
        {vista === 'diagrama' && (
          <div className="der-barra__grupo der-barra__piezas" role="group" aria-label="Sumar">
            <button type="button" className="der-boton" onPointerDown={(e) => tomarPieza(e, 'entidad')} onClick={() => ponerPieza('entidad')}><Forma tipo="entidad" />Entidad</button>
            <button type="button" className="der-boton" onPointerDown={(e) => tomarPieza(e, 'vinculo')} onClick={() => ponerPieza('vinculo')} disabled={sinEntidades}><Forma tipo="vinculo" />Vínculo</button>
            <button type="button" className="der-boton" onPointerDown={(e) => tomarPieza(e, 'jerarquia')} onClick={() => ponerPieza('jerarquia')} disabled={sinEntidades}><Forma tipo="jerarquia" />Jerarquía</button>
            <button type="button" className="der-boton" onPointerDown={(e) => tomarPieza(e, 'agregacion')} onClick={() => ponerPieza('agregacion')} disabled={!der.vinculos.some((v) => !der.agregaciones.some((g) => g.vinculo === v.id))}><Forma tipo="agregacion" />Agregación</button>
          </div>
        )}
        <div className="der-barra__grupo der-barra__historial" role="group" aria-label="Historial">
          <button type="button" className="der-boton der-boton--historial" onClick={atras} disabled={!hayAtras} aria-keyshortcuts="Control+Z">
            <svg className="der-boton__icono" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3" /></svg>
            <span className="der-boton__texto">Deshacer</span>
          </button>
          <button type="button" className="der-boton der-boton--historial" onClick={adelante} disabled={!hayAdelante} aria-keyshortcuts="Control+Shift+Z">
            <svg className="der-boton__icono" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m15 14 5-5-5-5M20 9H9a5 5 0 0 0 0 10h3" /></svg>
            <span className="der-boton__texto">Rehacer</span>
          </button>
        </div>
        <div className="der-barra__grupo der-barra__fin">
          <button type="button" className="boton boton--chico boton--secundario" onClick={pasar} aria-controls={`${id}-cuerpo`}>
            {vista === 'tablas' ? 'Volver al diagrama' : 'Pasar a tablas'}
          </button>
          <button type="button" className="boton boton--chico" onClick={sql} aria-disabled={pendientes ? 'true' : undefined} aria-describedby={pendientes ? `${id}-faltan` : undefined}>
            Crear SQL
          </button>
          {pendientes === 1 && <span id={`${id}-faltan`} className="der-falta">{faltan[0]}</span>}
          {pendientes > 1 && (
            <button type="button" className="der-falta der-falta--boton" aria-expanded={verFaltan} aria-controls={`${id}-faltan`} onClick={() => setVerFaltan(!verFaltan)}>
              {`Faltan ${pendientes} cosas para el SQL`}
            </button>
          )}
        </div>
      </div>
      {pendientes > 1 && (
        <ul id={`${id}-faltan`} className="der-faltan" hidden={!verFaltan} aria-label="Lo que falta para el SQL">
          {faltan.map((f, i) => <li key={i}>{f}</li>)}
        </ul>
      )}

      <section id={`${id}-cuerpo`} className="der-cuerpo" tabIndex={-1} aria-label={vista === 'tablas' ? `Tablas de ${nombre}` : `Diagrama ${nombre}`}>
        <div className="der-diagrama" hidden={vista !== 'diagrama'}>
          <div ref={hoja} className="der-hoja" onPointerMove={alMoverPuntero} onPointerLeave={alSalirPuntero}>
            <Hoja
              der={der}
              elegidos={elegidos}
              alElegir={elegir}
              alMover={alMover}
              alBorrar={acciones.borrar}
              alUnir={unirArrastrando}
              puedeUnir={puedeUnir}
              arrastre={arrastre}
              setArrastre={setArrastre}
              alOvalo={moverOvalo}
              marcados={marcados}
              alMoverVista={compartido ? alMoverVista : undefined}
              verTodo={verTodo}
            >
              <Background variant={BackgroundVariant.Lines} gap={24} className="der-fondo" />
              {punteros.length > 0 && <Punteros lista={punteros} />}
            </Hoja>
            <div className="der-zoom" role="group" aria-label="Vista">
              <button type="button" className="der-boton der-boton--icono" onClick={deUno(() => flujo.zoomOut())} aria-label="Alejar"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 12h12" /></svg></button>
              <button type="button" className="der-boton der-boton--icono" onClick={deUno(() => flujo.zoomIn())} aria-label="Acercar"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 12h12M12 6v12" /></svg></button>
              <button type="button" className="der-boton" onClick={deUno(() => flujo.fitView({ ...verTodo, duration: reducido() ? 0 : 200 }))}>Ver todo</button>
            </div>
          </div>
          <section id={`${id}-ficha`} className="der-ficha" tabIndex={-1} aria-labelledby={`${id}-ficha-titulo`}>
            <Ficha der={der} elegidos={elegidos} aplicar={aplicar} acciones={acciones} idTitulo={`${id}-ficha-titulo`} plegable={angosta} verLista={verLista} alVerLista={setVerLista} />
          </section>
        </div>
        {fantasma && createPortal(<Fantasma {...fantasma} />, document.body)}
        {vista === 'tablas' && <Tablas der={der} resultado={resultado} avisos={avisos} aplicar={aplicar} alVer={ver} idTitulo={`${id}-tablas`} />}
      </section>
      <p className="solo-lectores" role="status">{dicho}</p>
    </div>
  );
}

/** `texto`: the file's; `nombre`: its name without the extension; `alCrearSql(sql)`: adds or replaces `<nombre>.sql`. */
export default function Der(props) {
  return (
    <ReactFlowProvider>
      <Adentro {...props} />
    </ReactFlowProvider>
  );
}
