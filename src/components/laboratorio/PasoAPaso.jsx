import { conCortes } from './conCortes';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useAtajosDePagina } from '../../lib/atajos';
import { cambiosDelPaso, describirPaso, filasDeObjetos, fotoDelPaso, nombreDeMarco, nombreDeObjeto, salidaHasta, textoDeValor, TOPE_PASOS } from '../../lib/laboratorio/pasos';
import './pasoAPaso.css';

// «Paso a paso» (lib/laboratorio/pasos.js): the program, recorded, to go through one step at a time. Each step says
// what happens, shows the frames with their variables and the objects drawn apart (a list as a row of squares of the
// notebook), with an arrow from each variable that points to one. What changed in the step goes with the highlighter.
// ← and → move from anywhere outside a field; the slider goes to any step. The step is said after a pause, not on
// every key.

const numero = new Intl.NumberFormat('es-AR');
const ANUNCIO_MS = 700;

/** A value: as Python writes it, or a dot (where an arrow starts) and the name of what it points to. */
function Valor({ v, porId, cambio }) {
  const texto = textoDeValor(v, porId);
  if (v[0] === 'r') {
    return (
      <span className="valor valor--ref" data-a={porId.has(v[1]) ? v[1] : undefined} data-cambio={cambio || undefined}>
        {texto}
        <span className="valor__punto" aria-hidden="true" />
      </span>
    );
  }
  const clase = v[0] === 'v' ? (/^['"]/.test(texto) ? 'valor--texto' : /^-?[\d.]/.test(texto) || /^(True|False|None)$/.test(texto) ? 'valor--numero' : '') : 'valor--suave';
  return <span className={`valor ${clase}`} data-cambio={cambio || undefined}>{texto}</span>;
}


function Marco({ marco, actual, foto, indice, cambios }) {
  const variables = marco.v;
  return (
    <li className="marco" data-actual={actual || undefined}>
      <p className="marco__nombre">{nombreDeMarco(marco)}{actual && <span className="solo-lectores">, la que está corriendo</span>}</p>
      {variables.length || (actual && foto.devuelve) ? (
        <dl className="marco__variables">
          {variables.map(([nombre, v]) => (
            <div key={nombre} className="marco__variable">
              <dt>{conCortes(nombre)}</dt>
              <dd><Valor v={v} porId={foto.porId} cambio={cambios.has(`m${indice}:${nombre}`)} /></dd>
            </div>
          ))}
          {actual && foto.devuelve && (
            <div className="marco__variable marco__variable--devuelve">
              <dt>devuelve</dt>
              <dd><Valor v={foto.devuelve} porId={foto.porId} cambio /></dd>
            </div>
          )}
        </dl>
      ) : (
        <p className="marco__vacio">Sin variables.</p>
      )}
    </li>
  );
}

function Objeto({ o, porId, cambios }) {
  const nombre = nombreDeObjeto(o);
  const mas = o.m > 0 ? <p className="objeto__mas">{`y ${numero.format(o.m)} más`}</p> : null;
  let caja;
  if (Array.isArray(o.e)) {
    caja = o.e.length ? (
      <ol className="objeto__celdas">
        {o.e.map((v, j) => (
          <li key={j} className="objeto__celda">
            {o.t !== 'conjunto' && <span className="objeto__indice">{j}</span>}
            <Valor v={v} porId={porId} cambio={cambios.has(`o${o.i}:${j}`)} />
          </li>
        ))}
      </ol>
    ) : (
      <p className="objeto__vacio">{o.t === 'lista' ? 'vacía' : 'vacío'}</p>
    );
  } else {
    const pares = o.p ?? o.a ?? [];
    caja = pares.length ? (
      <dl className="objeto__pares">
        {pares.map(([a, b]) => {
          const clave = JSON.stringify(a);
          return (
            <div key={clave} className="objeto__par">
              <dt>{o.p ? <Valor v={a} porId={porId} /> : a}</dt>
              <dd><Valor v={b} porId={porId} cambio={cambios.has(`o${o.i}:${clave}`)} /></dd>
            </div>
          );
        })}
      </dl>
    ) : (
      <p className="objeto__vacio">{o.t === 'objeto' ? 'sin atributos' : 'vacío'}</p>
    );
  }
  return (
    <li className="objeto" data-tipo={o.t}>
      <p className="objeto__nombre">{nombre}</p>
      <div className="objeto__caja" data-objeto={o.i}>{caja}</div>
      {mas}
    </li>
  );
}

// The arrow from a dot to the box it points to. If the box is to the right, into its left side. If not, into its right
// side: with the boxes one under the other (a phone), like a bracket along the right edge, each one in its own lane
// (`carril`), so it doesn't cross the variables; side by side, a box that holds one above it, with a short curve.
// Coordinates inside `mapa`, `ancho` its width.
function camino(desde, caja, ancho, carril) {
  const { x, y } = desde;
  const medio = caja.top + Math.min(14, (caja.bottom - caja.top) / 2);
  if (caja.left - x > 20) {
    const x2 = caja.left - 3;
    const dx = Math.max(16, (x2 - x) / 2);
    return `M${x} ${y}C${x + dx} ${y} ${x2 - dx} ${medio} ${x2} ${medio}`;
  }
  const x2 = caja.right + 3;
  if (carril === null) {
    // Halfway down its side: the arrows that go into the next box, at the top, stay apart.
    const lado = (caja.top + caja.bottom) / 2;
    const borde = Math.min(Math.max(x, x2) + 40, ancho - 2);
    return `M${x} ${y}C${borde} ${y} ${borde} ${lado} ${x2} ${lado}`;
  }
  const borde = Math.max(Math.max(x, x2) + 14, ancho - 4 - carril * 7);
  const r = Math.min(10, Math.abs(medio - y) / 2, (borde - Math.max(x, x2)) / 2) * Math.sign(medio - y || 1);
  const curva = Math.abs(r);
  return `M${x} ${y}H${borde - curva}Q${borde} ${y} ${borde} ${y + r}V${medio - r}Q${borde} ${medio} ${borde - curva} ${medio}H${x2}`;
}

function useFlechas(mapa, foto) {
  const [flechas, setFlechas] = useState([]);
  useLayoutEffect(() => {
    const el = mapa.current;
    if (!el) return undefined;
    const medir = () => {
      const base = el.getBoundingClientRect();
      const cajas = new Map([...el.querySelectorAll('[data-objeto]')].map((c) => [c.dataset.objeto, c.getBoundingClientRect()]));
      const nuevas = [];
      // The objects under the variables (a phone): the arrows that go back, each in its lane along the edge.
      const [variables, objetos] = [...el.querySelectorAll('.pasos__lado')].map((l) => l.getBoundingClientRect());
      const apilado = Boolean(variables && objetos && objetos.top >= variables.bottom - 1);
      let carriles = 0;
      el.querySelectorAll('[data-a]').forEach((r, k) => {
        const punto = r.querySelector('.valor__punto')?.getBoundingClientRect();
        const caja = cajas.get(r.dataset.a);
        if (!punto || !caja || !punto.width) return;
        const desde = { x: punto.left + punto.width / 2 - base.left, y: punto.top + punto.height / 2 - base.top };
        const hasta = { left: caja.left - base.left, right: caja.right - base.left, top: caja.top - base.top, bottom: caja.bottom - base.top };
        const atras = hasta.left - desde.x <= 20;
        const carril = atras && (apilado || r.closest('.pasos__marcos')) ? carriles++ % 6 : null;
        nuevas.push({ clave: `${k}-${r.dataset.a}`, d: camino(desde, hasta, base.width, carril) });
      });
      setFlechas((antes) => (antes.length === nuevas.length && antes.every((f, i) => f.d === nuevas[i].d) ? antes : nuevas));
    };
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    return () => observador.disconnect();
  }, [mapa, foto]);
  return flechas;
}

/** What it had printed by then, following the end as the steps go. */
function Salida({ piezas, titulo }) {
  const caja = useRef(null);
  useLayoutEffect(() => {
    if (caja.current) caja.current.scrollTop = caja.current.scrollHeight;
  }, [piezas]);
  if (!piezas.length) return <p className="pasos__nada">Todavía no imprimió nada.</p>;
  return (
    <pre ref={caja} className="pasos__texto" role="region" aria-labelledby={titulo} tabIndex={0}>
      {piezas.map((p, i) => <span key={i} className={p.flujo === 'err' ? 'consola__err' : p.flujo === 'in' ? 'consola__escrito' : undefined}>{p.texto}</span>)}
    </pre>
  );
}

const Flecha = ({ hueca }) => (
  <svg className={`pasos__flecha${hueca ? ' pasos__flecha--hueca' : ''}`} viewBox="0 0 12 12" aria-hidden="true" focusable="false">
    <path d="M2 1.5 10.5 6 2 10.5z" />
  </svg>
);

/** `recorrido` of the run, `lineas` of the code that ran, `actual` the step in view (from 0), `alIr(i)` and `alCerrar`. */
export default function PasoAPaso({ recorrido, lineas, actual, alIr, alCerrar }) {
  const id = useId();
  const marca = `pasos-punta-${id.replace(/[^\w-]/g, '')}`;
  const total = recorrido.pasos.length;
  const foto = useMemo(() => fotoDelPaso(recorrido, actual), [recorrido, actual]);
  const anterior = useMemo(() => (actual > 0 ? fotoDelPaso(recorrido, actual - 1) : null), [recorrido, actual]);
  const cambios = useMemo(() => cambiosDelPaso(anterior, foto), [anterior, foto]);
  const filas = useMemo(() => filasDeObjetos(foto), [foto]);
  const piezas = useMemo(() => salidaHasta(recorrido.salida, foto.escrito), [recorrido, foto]);
  const frase = describirPaso(foto);
  const codigo = foto.evento === 'line' || foto.evento === 'exception' ? (lineas[foto.linea - 1] ?? '').trim() : '';
  const mapa = useRef(null);
  const siguienteBoton = useRef(null);
  const flechas = useFlechas(mapa, foto);

  const ir = (i) => alIr(Math.max(0, Math.min(total - 1, i)));
  useAtajosDePagina({ ArrowLeft: () => ir(actual - 1), ArrowRight: () => ir(actual + 1) });

  // The step, said once the student stops on it.
  const [anuncio, setAnuncio] = useState('');
  const dicho = `Paso ${numero.format(actual + 1)} de ${numero.format(total)}. ${frase}${foto.error ? ` ${foto.error}` : ''}`;
  useEffect(() => {
    const reloj = setTimeout(() => setAnuncio(dicho), ANUNCIO_MS);
    return () => clearTimeout(reloj);
  }, [dicho]);

  useEffect(() => {
    siguienteBoton.current?.focus();
  }, []);

  const marcos = foto.marcos;
  return (
    <section className="pasos" aria-labelledby={`${id}-titulo`}>
      <div className="pasos__cabeza">
        <h2 id={`${id}-titulo`}>Paso a paso</h2>
        <button type="button" className="boton boton--secundario boton--chico" onClick={alCerrar}>Cerrar</button>
      </div>
      {recorrido.tope && (
        <p className="pasos__aviso">{`Muestra los primeros ${numero.format(TOPE_PASOS)} pasos. Probá con datos más chicos.`}</p>
      )}

      <div className="pasos__control">
        <button type="button" className="boton boton--secundario" onClick={() => ir(actual - 1)} aria-disabled={actual === 0 ? 'true' : undefined} aria-keyshortcuts="ArrowLeft">Anterior</button>
        <button type="button" ref={siguienteBoton} className="boton" onClick={() => ir(actual + 1)} aria-disabled={actual === total - 1 ? 'true' : undefined} aria-keyshortcuts="ArrowRight">Siguiente</button>
        <p className="pasos__cuenta" aria-hidden="true">{`Paso ${numero.format(actual + 1)} de ${numero.format(total)}`}</p>
        <input
          className="pasos__deslizador"
          type="range"
          min={1}
          max={total}
          step={1}
          value={actual + 1}
          aria-label="Ir a un paso"
          aria-valuetext={`Paso ${numero.format(actual + 1)} de ${numero.format(total)}`}
          onChange={(e) => ir(Number(e.target.value) - 1)}
        />
      </div>

      <div className="pasos__que" data-evento={foto.evento}>
        <p className="pasos__frase">{frase}</p>
        {codigo && <code className="pasos__linea"><span className="pasos__numero" aria-hidden="true">{foto.linea}</span>{codigo}</code>}
        {foto.error && <p className="pasos__error">{foto.error}</p>}
      </div>
      <ul className="pasos__leyenda">
        <li><Flecha />La línea que sigue</li>
        <li><Flecha hueca />La que corrió recién</li>
        <li><span className="pasos__resaltado">Lo resaltado</span> cambió</li>
      </ul>

      <div className="pasos__mapa" ref={mapa}>
        <div className="pasos__lado">
          <h3>Variables</h3>
          <ol className="pasos__marcos">
            {marcos.map((m, k) => (
              <Marco key={`${k}-${m.f}`} marco={m} actual={k === marcos.length - 1} foto={foto} indice={k} cambios={cambios} />
            )).flatMap((el, k) => (k === 0 && foto.ocultos ? [el, <li key="ocultos" className="marco marco--ocultos">{foto.ocultos === 1 ? 'Una llamada más en el medio.' : `${numero.format(foto.ocultos)} llamadas más en el medio.`}</li>] : [el]))}
          </ol>
        </div>
        <div className="pasos__lado">
          <h3>Objetos</h3>
          {filas.length ? (
            <div className="pasos__objetos">
              {filas.map((fila) => (
                <ul key={fila[0].i} className="pasos__fila">
                  {fila.map((o) => <Objeto key={o.i} o={o} porId={foto.porId} cambios={cambios} />)}
                </ul>
              ))}
            </div>
          ) : (
            <p className="pasos__nada">Ninguna lista ni objeto.</p>
          )}
        </div>
        <svg className="pasos__flechas" aria-hidden="true" focusable="false">
          <defs>
            <marker id={marca} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0 1 9 5 0 9z" />
            </marker>
          </defs>
          {flechas.map((f) => <path key={f.clave} d={f.d} markerEnd={`url(#${marca})`} />)}
        </svg>
      </div>

      <div className="pasos__salida">
        <h3 id={`${id}-salida`}>Salida hasta acá</h3>
        <Salida piezas={piezas} titulo={`${id}-salida`} />
      </div>
      <p className="solo-lectores" role="status">{anuncio}</p>
    </section>
  );
}
