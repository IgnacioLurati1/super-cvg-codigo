import { Component, Suspense, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { MemoriaCompartida } from '../../../lib/calculadoras/memoria';
import { camaraValida, VistaDeGrafica } from '../../../lib/calculadoras/vistaGrafica';
import { CALCULADORAS, MATERIAS_DE_CALCULADORAS } from '../../../lib/calculadoras/lista';
import { leerDelDom } from '../../../lib/consultron/pantalla';
import { calculadoraDeMesa, elegirCalculadora, memoriaDeMesa } from '../../../lib/enVivo/calculadoraCompartida';
import { useDesplazamientoSuave } from './comun';
import { useDedos } from './dedos';
import { Esqueleto, PROPIAS } from '../../calculadoras/Piezas';
import '../../calculadoras/calculadoras.css';
import './calculadora.css';

// The Calculadora of the table: one of the site's calculators, the same for everyone, with what's typed shared field by
// field (its useRecordado reads and writes the tab's map, calculadoraCompartida.js). Anyone can switch it for all. The
// view is how far down the sheet is and, in the 3D grapher, its camera (vistaGrafica.js).

const DISPONIBLES = CALCULADORAS.filter((c) => PROPIAS[c.slug]);

/** What came from the others may not fit the calculator: then it says so and offers to start over, for everyone. Any
 * change of the table (someone started over, or fixed it) tries again. */
class Resguardo extends Component {
  state = { roto: false };

  static getDerivedStateFromError() {
    return { roto: true };
  }

  componentDidMount() {
    this.soltar = this.props.suscribir(() => {
      if (this.state.roto) this.setState({ roto: false });
    });
  }

  componentWillUnmount() {
    this.soltar?.();
  }

  render() {
    if (!this.state.roto) return this.props.children;
    return (
      <div className="mensaje mensaje--error ev-calc__roto" role="alert">
        <p>Lo que hay cargado no entra en esta calculadora.</p>
        <button
          type="button"
          className="boton boton--secundario boton--chico"
          onClick={() => {
            this.props.alEmpezar();
            this.setState({ roto: false });
          }}
        >
          Empezar de nuevo
        </button>
      </div>
    );
  }
}

function useCual(datos) {
  const suscribir = useCallback((fn) => {
    datos.observe(fn);
    return () => datos.unobserve(fn);
  }, [datos]);
  const leer = useCallback(() => calculadoraDeMesa(datos), [datos]);
  return useSyncExternalStore(suscribir, leer, leer);
}

/** The calculator as the student keeps it («Guardar en lo mío»): its name, what's typed and the result. */
function paraGuardarla(calculadora, raiz) {
  const leido = leerDelDom(raiz);
  const datos = (leido?.datos ?? []).map(([e, v]) => `- ${e}: ${v}`);
  const resultado = (leido?.resultado ?? []).map(([, v]) => v).filter(Boolean);
  const partes = [`# ${calculadora.nombre}`, datos.join('\n'), resultado.length ? `# Resultado\n${resultado.join('\n')}` : ''];
  return { nombre: calculadora.nombre, texto: partes.filter(Boolean).join('\n\n') };
}

/** The calculator as text for the session's Consultron: its name, what's typed and what the sheet shows. */
function enTexto(calculadora, raiz) {
  if (!calculadora) return 'Calculadora de la mesa, sin elegir todavía.';
  const leido = leerDelDom(raiz);
  const datos = (leido?.datos ?? []).map(([e, v]) => `- ${e}: ${v}`);
  const resultado = (leido?.resultado ?? []).map(([, v]) => v).filter(Boolean);
  return [
    `Calculadora de la mesa: ${calculadora.nombre}.`,
    datos.length ? `Datos cargados:\n${datos.join('\n')}` : 'Todavía no hay datos cargados.',
    resultado.length ? `Lo que muestra como resultado, con sus pasos:\n${resultado.join('\n')}` : 'Todavía no muestra un resultado.',
  ].join('\n\n');
}

export default function Calculadora({ mesa }) {
  const { datos, mover, soltar, paraConsultron, paraGuardar } = mesa;
  const id = useId();
  const calculadora = useCual(datos);
  const Propia = calculadora ? PROPIAS[calculadora.slug] : null;
  const usadas = useRef(new Set());
  const memoria = useMemo(() => {
    const m = memoriaDeMesa(datos);
    return {
      ...m,
      leer: (clave, inicial) => {
        usadas.current.add(clave);
        return m.leer(clave, inicial);
      },
    };
  }, [datos]);
  const empezar = useCallback(() => usadas.current.forEach((clave) => memoria.borrar(clave)), [memoria]);

  const hoja = useRef(null);
  // What scrolls is the tab (the screen's right edge), not the calculator: the sheet grows to its whole height.
  const caja = useCallback(() => hoja.current?.closest('.envivo-mesa__una') ?? hoja.current, []);
  useEffect(() => paraConsultron(() => enTexto(calculadora, hoja.current)), [paraConsultron, calculadora]);
  useEffect(() => (calculadora ? paraGuardar(() => paraGuardarla(calculadora, hoja.current)) : undefined), [paraGuardar, calculadora]);

  // The view: how far down the sheet is, from 0 to 1 (the others may have another width), and the 3D camera once it
  // was moved. Moving on one's own while following lets go.
  const siguiendo = useRef(false);
  useEffect(() => {
    siguiendo.current = mesa.vista != null;
  });
  const suave = useDesplazamientoSuave(mesa.vista != null, caja);
  const vistaPropia = useRef({ y: 0, grafica: null });
  const contar = useCallback(() => {
    const { y: arriba, grafica } = vistaPropia.current;
    mover(grafica ? { y: arriba, grafica } : { y: arriba });
  }, [mover]);
  useEffect(() => {
    vistaPropia.current = { ...vistaPropia.current, grafica: null };
  }, [calculadora]);
  useEffect(() => {
    const el = caja();
    if (!el) return undefined;
    const alMover = () => {
      const recorrido = el.scrollHeight - el.clientHeight;
      vistaPropia.current = { ...vistaPropia.current, y: recorrido > 0 ? Math.round((el.scrollTop / recorrido) * 1000) / 1000 : 0 };
      contar();
    };
    const propio = () => {
      suave.parar();
      if (siguiendo.current) soltar();
    };
    alMover();
    el.addEventListener('scroll', alMover, { passive: true });
    const eventos = ['wheel', 'touchstart', 'pointerdown', 'keydown'];
    eventos.forEach((e) => el.addEventListener(e, propio, { passive: true }));
    return () => {
      el.removeEventListener('scroll', alMover);
      eventos.forEach((e) => el.removeEventListener(e, propio));
    };
  }, [caja, contar, soltar, suave]);
  const y = typeof mesa.vista?.y === 'number' && mesa.vista.y >= 0 && mesa.vista.y <= 1 ? mesa.vista.y : null;
  useEffect(() => {
    const el = caja();
    if (y === null || !el) return undefined;
    const ir = () => {
      const destino = Math.round(y * (el.scrollHeight - el.clientHeight));
      if (Math.abs(el.scrollTop - destino) > 2) suave.ir({ top: destino });
    };
    ir();
    // A hidden tab has no size: shown again, or with the sheet grown (a 3D scene arriving), the place is taken again.
    const tamano = new ResizeObserver(ir);
    tamano.observe(el);
    if (hoja.current) tamano.observe(hoja.current);
    return () => tamano.disconnect();
  }, [y, calculadora, suave, caja]);

  // The 3D camera: the followed one's comes in; one's own goes out, and moving it by hand lets go.
  const alGirar = useCallback((c) => {
    if (siguiendo.current) soltar();
    vistaPropia.current = { ...vistaPropia.current, grafica: camaraValida(c) };
    contar();
  }, [contar, soltar]);
  // Where each one points, on the same field however the sheet wraps in each window (dedos.jsx).
  const [lugar, setLugar] = useState({ caja: null, raiz: null });
  useLayoutEffect(() => setLugar({ caja: caja(), raiz: hoja.current }), [caja]);
  const dedos = useDedos(mesa, lugar.caja, lugar.raiz);

  const camara = camaraValida(mesa.vista?.grafica);
  const [giro, alza, dist] = camara ? [camara.giro, camara.alza, camara.dist] : [null, null, null];
  const vistaDeGrafica = useMemo(() => ({ vista: giro === null ? null : { giro, alza, dist }, alGirar }), [giro, alza, dist, alGirar]);

  // The calculator itself only changes with what's loaded or the camera: someone scrolling or pointing re-renders the
  // table, and a heavy one (the 3D grapher's level curves) would be worked out again every time.
  const slug = calculadora?.slug;
  const adentro = useMemo(() => {
    const P = slug ? PROPIAS[slug] : null;
    if (!P) return null;
    return (
      <VistaDeGrafica value={vistaDeGrafica}>
        <MemoriaCompartida value={memoria}>
          <Resguardo key={slug} alEmpezar={empezar} suscribir={memoria.suscribir}>
            <Suspense fallback={<Esqueleto />}>
              <P key={slug} />
            </Suspense>
          </Resguardo>
        </MemoriaCompartida>
      </VistaDeGrafica>
    );
  }, [slug, vistaDeGrafica, memoria, empezar]);

  return (
    <div className="calc ev-calc">
      <div className="ev-calc__elegir">
        <label className="campo__etiqueta" htmlFor={`${id}-cual`}>Calculadora para toda la mesa</label>
        <select
          id={`${id}-cual`}
          className="campo__control ev-calc__cual"
          value={calculadora?.slug ?? ''}
          onChange={(e) => {
            usadas.current = new Set();
            elegirCalculadora(datos, e.target.value);
          }}
        >
          {!calculadora && <option value="" disabled>Elegí una</option>}
          {MATERIAS_DE_CALCULADORAS.map((m) => (
            <optgroup key={m} label={m}>
              {DISPONIBLES.filter((c) => c.materias[0] === m).map((c) => <option key={c.slug} value={c.slug}>{c.nombre}</option>)}
            </optgroup>
          ))}
        </select>
        {calculadora && <p className="ev-calc__bajada">{calculadora.descripcion}</p>}
      </div>

      <div ref={hoja} className="ev-calc__hoja" role="region" aria-label={calculadora ? calculadora.nombre : 'Calculadora'} tabIndex={0}>
        {Propia ? adentro : (
          <p className="ev-calc__vacia">Elegí una calculadora. Lo que carguen se ve igual para todos.</p>
        )}
      </div>
      {dedos}
    </div>
  );
}
