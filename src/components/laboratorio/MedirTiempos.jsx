import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Campo from '../Campo';
import { ajustar, formatoTiempo, fraseDelAjuste, funcionesDelCodigo, leerFunciones, leerTamanos, leerVueltas, llamadaSugerida, marcasDeEje, MIN_PUNTOS, nombreDelModelo, PRESUPUESTO_S, tiempoDelAjuste, unidadDe, VUELTAS_POR_DEFECTO } from '../../lib/laboratorio/tiempos';
import './medirTiempos.css';

// «Medir tiempos» (lib/laboratorio/tiempos.js): a function of the program, called with an input built for each size n,
// several times each in the worker (rastreo.js). The times go to a chart of time against n, with the curve that fits
// best and what it means in words. It closes by default: it's a tool for when the student wants it.
// Or the whole program: a few laps, the fastest and slowest, and in which of its functions the time goes (rastreo.js).

const numero = new Intl.NumberFormat('es-AR');
const cifras = new Intl.NumberFormat('es-AR', { maximumSignificantDigits: 3 });
const porciento = new Intl.NumberFormat('es-AR', { style: 'percent', maximumFractionDigits: 0 });
// The choice of the whole program, apart from any function's name.
const PROGRAMA = 'programa:';
// What the student wrote for each function (how to call it, which sizes), by its name, while the page is open: a file
// changed by the other one in a live session, or the panel coming back, doesn't clear it.
const escritos = new Map();

/** Time against n: the dots measured and the curve of the fit, on round marks from zero. */
function Grafico({ puntos, ajuste, describe }) {
  const caja = useRef(null);
  const [ancho, setAncho] = useState(560);
  useLayoutEffect(() => {
    const el = caja.current;
    if (!el) return undefined;
    const medir = () => setAncho(Math.max(240, Math.round(el.getBoundingClientRect().width)));
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    return () => observador.disconnect();
  }, []);
  const angosto = ancho < 420;
  const alto = angosto ? 220 : 260;
  const m = { izq: 58, der: angosto ? 36 : 48, arr: 30, aba: 42 };
  const maxN = Math.max(...puntos.map((p) => p.n));
  const maxS = Math.max(...puntos.map((p) => p.s), ajuste ? tiempoDelAjuste(ajuste, maxN) : 0);
  const unidad = unidadDe(maxS);
  // n goes up to the biggest size measured (with a little room), with the round marks that fit before it.
  const finX = maxN * 1.04;
  const marcasX = marcasDeEje(maxN, angosto ? 3 : 5).filter((n) => n <= finX);
  const marcasY = marcasDeEje(maxS / unidad.factor, 4);
  const x = (n) => m.izq + (n / finX) * (ancho - m.izq - m.der);
  const y = (s) => alto - m.aba - (s / unidad.factor / marcasY.at(-1)) * (alto - m.arr - m.aba);
  const minN = Math.min(...puntos.map((p) => p.n));
  const curva = ajuste
    ? Array.from({ length: 49 }, (_, k) => minN + ((maxN - minN) * k) / 48).map((n, k) => `${k ? 'L' : 'M'}${x(n).toFixed(1)} ${y(tiempoDelAjuste(ajuste, n)).toFixed(1)}`).join('')
    : '';
  const fin = ajuste ? { x: x(maxN), y: y(tiempoDelAjuste(ajuste, maxN)) } : null;
  return (
    <div ref={caja} className="medir__grafico">
      <svg width={ancho} height={alto} role="img" aria-label="Tiempo según n" aria-describedby={describe}>
        {marcasY.map((v) => (
          <g key={`y${v}`} className="medir__marca">
            <line x1={m.izq} x2={ancho - m.der} y1={y(v * unidad.factor)} y2={y(v * unidad.factor)} data-cero={v === 0 || undefined} />
            <text x={m.izq - 8} y={y(v * unidad.factor)} dy="0.32em" textAnchor="end">{cifras.format(v)}</text>
          </g>
        ))}
        {marcasX.map((n) => (
          <text key={`x${n}`} className="medir__marca" x={x(n)} y={alto - m.aba + 18} textAnchor="middle">{numero.format(n)}</text>
        ))}
        <text className="medir__eje" x={m.izq - 8} y={14} textAnchor="end">{unidad.texto}</text>
        <text className="medir__eje" x={(m.izq + ancho - m.der) / 2} y={alto - 6} textAnchor="middle">n</text>
        {curva && <path className="medir__curva" d={curva} />}
        {fin && nombreDelModelo(ajuste.modelo) && ajuste.modelo !== 'constante' && <text className="medir__rotulo" x={fin.x + 6} y={Math.max(m.arr + 8, fin.y)} dy="0.32em">{nombreDelModelo(ajuste.modelo)}</text>}
        {puntos.map((p) => (
          <circle key={p.n} className="medir__punto" cx={x(p.n)} cy={y(p.s)} r={5}>
            <title>{`n = ${numero.format(p.n)}, ${formatoTiempo(p.s)}`}</title>
          </circle>
        ))}
      </svg>
    </div>
  );
}

// The browser's clock, in a worker, goes in steps of 0.1 ms: below that a run reads as 0.
const PASO_DEL_RELOJ = 1e-4;
const tiempoDe = (s) => (s < PASO_DEL_RELOJ ? 'menos de 0,1 ms' : formatoTiempo(s));

/** The whole program: its laps and, from the first, where the time went. */
function Programa({ id, tiempos, funciones }) {
  const segundos = tiempos.map((t) => t.s);
  const mejor = Math.min(...segundos);
  const peor = Math.max(...segundos);
  const total = funciones?.total || tiempos[0].s;
  return (
    <div className="medir__resultado">
      <div className="medir__veredicto" id={`${id}-veredicto`}>
        <p className="medir__titular">{`Tu programa tarda ${tiempoDe(mejor)}.`}</p>
        {mejor < PASO_DEL_RELOJ && <p className="laboratorio__ayuda">El navegador mide de a 0,1 ms. Para ver cuánto crece, medí una función con tamaños más grandes.</p>}
        {tiempos.length > 1 && <p>{`Es la más rápida de ${numero.format(tiempos.length)} veces. La más lenta tardó ${tiempoDe(peor)}.`}</p>}
        {tiempos.length > 1 && tiempos[0].s > 2 * mejor && <p className="laboratorio__ayuda">La primera tarda más porque carga lo que importás y muestra lo que imprime.</p>}
      </div>
      <table className="medir__tabla">
        <caption className="solo-lectores">Lo que tardó cada vez</caption>
        <thead>
          <tr><th scope="col">Vez</th><th scope="col">Tiempo</th></tr>
        </thead>
        <tbody>
          {tiempos.map((t) => <tr key={t.vuelta}><td>{numero.format(t.vuelta)}</td><td>{tiempoDe(t.s)}</td></tr>)}
        </tbody>
      </table>
      {funciones?.funciones.length > 0 && (
        <>
          <h3 className="medir__subtitulo">Dónde se va el tiempo</h3>
          <p className="laboratorio__ayuda">En la primera vez. Cada función suma lo que tardan las que llama.</p>
          <table className="medir__tabla medir__tabla--funciones">
            <thead>
              <tr><th scope="col">Función</th><th scope="col">Llamadas</th><th scope="col">Tiempo</th><th scope="col">Del total</th></tr>
            </thead>
            <tbody>
              {funciones.funciones.map((f) => (
                <tr key={`${f.archivo}:${f.nombre}`}>
                  <td><code>{f.nombre}</code></td>
                  <td>{numero.format(f.llamadas)}</td>
                  <td>{tiempoDe(f.s)}</td>
                  <td>{porciento.format(Math.min(1, f.s / total))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {funciones.mas > 0 && <p className="laboratorio__ayuda">{`Y ${numero.format(funciones.mas)} funciones más, que tardan menos.`}</p>}
        </>
      )}
    </div>
  );
}

/** `codigo` of the editor, `archivo` which one it is, `ocupado` while something runs, `alMedir(modo, alOtro)` runs it
 * (resolves as the lab's run) and `alParar`. */
// `enPestana`: in a tab of the lab's panel, which already names it: open, without its own title.
export default function MedirTiempos({ codigo, archivo, ocupado, alMedir, alParar, enPestana = false }) {
  const id = useId();
  const [abierto, setAbierto] = useState(false);
  const funciones = useMemo(() => funcionesDelCodigo(codigo), [codigo]);
  const [elegida, setElegida] = useState('');
  const todo = elegida === PROGRAMA || !funciones.length;
  const funcion = todo ? null : funciones.find((f) => f.nombre === elegida) ?? funciones[0];
  const que = todo ? PROGRAMA : funcion.nombre;
  const [vueltas, setVueltas] = useState(String(VUELTAS_POR_DEFECTO));
  const [, setEscrito] = useState(0);
  const escrito = funcion ? escritos.get(funcion.nombre) : null;
  const sugerida = useMemo(() => (funcion ? llamadaSugerida(funcion.parametros, codigo, funcion.nombre) : ''), [funcion, codigo]);
  const llamada = escrito?.llamada ?? sugerida;
  const tamanos = escrito?.tamanos ?? '';
  const escribir = (campo, valor) => {
    escritos.set(funcion.nombre, { ...escritos.get(funcion.nombre), [campo]: valor });
    setEscrito((v) => v + 1);
  };
  const [errores, setErrores] = useState({});
  const [medida, setMedida] = useState(null);
  // Another file: what was measured was of the one before.
  const [deArchivo, setDeArchivo] = useState(archivo);
  if (deArchivo !== archivo) {
    setDeArchivo(archivo);
    setMedida(null);
    setErrores({});
  }
  const Caja = enPestana ? 'div' : 'section';
  const campoLlamada = useRef(null);
  const campoTamanos = useRef(null);
  const campoVueltas = useRef(null);
  const midiendo = medida?.fase === 'midiendo';
  const ajuste = useMemo(() => (medida && !medida.programa ? ajustar(medida.puntos) : null), [medida]);
  const frase = ajuste ? fraseDelAjuste(ajuste) : null;

  const medirPrograma = async () => {
    const leidas = leerVueltas(vueltas);
    if (leidas.error) {
      setErrores({ vueltas: leidas.error });
      campoVueltas.current?.focus();
      return;
    }
    setErrores({});
    setMedida({ funcion: PROGRAMA, programa: true, vueltas: [], funciones: null, fase: 'midiendo', vuelta: 1, mensaje: '' });
    let falla = null;
    let tope = 0;
    const r = await alMedir({ tipo: 'medir', programa: true, vueltas: leidas.vueltas, presupuesto: PRESUPUESTO_S }, (d) => {
      if (d.tipo === 'medida-vuelta' && Number.isSafeInteger(d.vuelta) && Number.isFinite(d.s)) {
        setMedida((a) => a && { ...a, vueltas: [...a.vueltas, { vuelta: d.vuelta, s: d.s }], vuelta: d.vuelta + 1 });
      } else if (d.tipo === 'medida-funciones') {
        const leidasFunciones = leerFunciones(d.texto);
        setMedida((a) => a && { ...a, funciones: leidasFunciones });
      } else if (d.tipo === 'medida-tope') tope = Number(d.n) || 0;
      else if (d.tipo === 'medida-falla') falla = d;
    });
    if (!r) return setMedida(null);
    let mensaje = '';
    if (r.falla) mensaje = 'No se pudo cargar Python. Revisá la conexión y probá de nuevo.';
    else if (r.cortado === 'parado') mensaje = 'Lo paraste.';
    else if (r.cortado === 'tiempo') mensaje = 'Tardó demasiado y lo paramos.';
    else if (r.cortado === 'salida') mensaje = 'Tu programa imprimió demasiado y lo cortamos.';
    else if (r.error) mensaje = 'Tu programa da un error. Mirá la salida.';
    else if (falla?.donde === 'input') mensaje = `La vez ${falla.n} pidió más datos que la primera y paramos.`;
    else if (falla?.donde === 'programa-error') mensaje = `La vez ${falla.n} dio un error y paramos.`;
    else if (tope) mensaje = `Paramos después de ${tope - 1} ${tope - 1 === 1 ? 'vez' : 'veces'} para no pasar de ${PRESUPUESTO_S} segundos.`;
    setMedida((a) => a && { ...a, fase: 'listo', mensaje });
    return undefined;
  };

  const medir = async () => {
    if (ocupado) return undefined;
    if (todo) return medirPrograma();
    const leidos = leerTamanos(tamanos);
    if (leidos.error) {
      setErrores({ tamanos: leidos.error });
      campoTamanos.current?.focus();
      return;
    }
    setErrores({});
    const nombre = funcion.nombre;
    const solos = !leidos.tamanos.length;
    setMedida({ funcion: nombre, puntos: [], fase: 'midiendo', n: leidos.tamanos[0] ?? 1, mensaje: '' });
    let falla = null;
    let tope = 0;
    let ultimo = leidos.tamanos[0] ?? 1;
    let medidos = 0;
    let mayor = 0;
    const r = await alMedir({ tipo: 'medir', funcion: nombre, argumentos: llamada, tamanos: leidos.tamanos, presupuesto: PRESUPUESTO_S }, (d) => {
      if (d.tipo === 'medida-empieza') {
        ultimo = Number(d.n) || ultimo;
        setMedida((a) => a && { ...a, n: ultimo });
      } else if (d.tipo === 'medida' && Number.isFinite(d.n) && Number.isFinite(d.s)) {
        medidos += 1;
        mayor = d.n;
        setMedida((a) => a && { ...a, puntos: [...a.puntos, { n: d.n, s: d.s }] });
      } else if (d.tipo === 'medida-tope') tope = Number(d.n) || 0;
      else if (d.tipo === 'medida-falla') falla = d;
    });
    // Another file opened in the meantime: what it measured is no longer of this code.
    if (!r) return setMedida(null);
    let mensaje = '';
    if (falla?.donde === 'entrada') {
      setErrores({ llamada: `Así no se puede llamar.${falla.texto ? ` ${falla.texto}` : ''}` });
      mensaje = 'Revisá cómo la llamás.';
      campoLlamada.current?.focus();
    } else if (falla?.donde === 'funcion') mensaje = `No encontramos ${nombre} en tu programa.`;
    else if (falla?.donde === 'input') mensaje = `${nombre} usa input(). Pasale los datos como parámetros.`;
    else if (falla?.donde === 'funcion-error') mensaje = `Con n = ${numero.format(falla.n)} dio un error. Mirá la salida.`;
    else if (r.falla) mensaje = 'No se pudo cargar Python. Revisá la conexión y probá de nuevo.';
    else if (r.cortado === 'parado') mensaje = 'Lo paraste.';
    else if (r.cortado === 'tiempo') mensaje = `Con n = ${numero.format(ultimo)} tardó demasiado y lo paramos. Probá con tamaños más chicos.`;
    else if (r.cortado === 'salida') mensaje = 'Tu programa imprimió demasiado y lo cortamos.';
    else if (r.error) mensaje = 'Tu programa da un error antes de medir. Mirá la salida.';
    else if (tope && solos && medidos) mensaje = `${medidos === 1 ? 'Se midió 1 tamaño' : `Se midieron ${numero.format(medidos)} tamaños`}, hasta n = ${numero.format(mayor)}. El siguiente tardaba demasiado.`;
    else if (tope) mensaje = `Paramos antes de n = ${numero.format(tope)} para no pasar de ${PRESUPUESTO_S} segundos.`;
    setMedida((a) => a && { ...a, fase: 'listo', mensaje });
    return undefined;
  };

  // What was measured, while what is chosen is what it was of.
  const vista = medida && (midiendo || medida.funcion === que) ? medida : null;
  const puntos = vista?.puntos ?? [];
  const tiempos = vista?.vueltas ?? [];
  const cuantos = vista?.programa
    ? (tiempos.length === 1 ? 'Lo corrió 1 vez' : `Lo corrió ${numero.format(tiempos.length)} veces`)
    : (puntos.length === 1 ? 'Se midió 1 tamaño' : `Se midieron ${numero.format(puntos.length)} tamaños`);
  const estado = midiendo ? 'Midiendo.' : vista?.mensaje || (vista ? `${cuantos}.` : '');

  // When a measurement ends, its result comes into view: the panel is short and the result goes under the form.
  const antes = useRef(midiendo);
  const hayResultado = tiempos.length > 0 || puntos.length > 0;
  useLayoutEffect(() => {
    const termino = antes.current && !midiendo;
    antes.current = midiendo;
    if (!termino || !hayResultado) return;
    const quieto = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    // Only the panel scrolls (scrollIntoView would move the whole page too, and the Laboratorio's top with it).
    const res = document.getElementById(`${id}-cuerpo`)?.querySelector('.medir__resultado');
    let caja = res?.parentElement;
    while (caja && !(caja.scrollHeight > caja.clientHeight && /auto|scroll/.test(getComputedStyle(caja).overflowY))) caja = caja.parentElement;
    if (!res || !caja) return;
    const arriba = res.getBoundingClientRect().top - caja.getBoundingClientRect().top + caja.scrollTop - 8;
    caja.scrollTo({ top: Math.max(0, arriba), behavior: quieto ? 'auto' : 'smooth' });
  }, [midiendo, hayResultado, id]);

  return (
    <Caja className={`medir${enPestana ? ' medir--pestana' : ''}`} aria-labelledby={enPestana ? undefined : `${id}-titulo`}>
      {!enPestana && (
        <h2 id={`${id}-titulo`} className="medir__titulo">
          <button type="button" className="medir__abrir" aria-expanded={abierto} aria-controls={`${id}-cuerpo`} onClick={() => setAbierto((a) => !a)}>
            Medir tiempos
            <svg className="medir__flecha" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m6 9 6 6 6-6" /></svg>
          </button>
        </h2>
      )}
      <div id={`${id}-cuerpo`} className="medir__cuerpo" hidden={!abierto && !enPestana}>
        <p className="laboratorio__ayuda">{todo ? 'Mirá cuánto tarda tu programa y en qué funciones se le va el tiempo.' : 'Mirá cómo crece lo que tarda una función cuando crece n.'}</p>
        {(
          <form
            className="medir__form"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              medir();
            }}
          >
            <Campo etiqueta="Qué medís">
              <select className="campo__control" value={que} onChange={(e) => setElegida(e.target.value)}>
                {funciones.map((f) => <option key={f.nombre} value={f.nombre}>{f.nombre}</option>)}
                <option value={PROGRAMA}>Todo el programa</option>
              </select>
            </Campo>
            {todo ? (
              <Campo etiqueta="Veces" error={errores.vueltas}>
                <input ref={campoVueltas} className="campo__control medir__vueltas" type="text" inputMode="numeric" autoComplete="off" value={vueltas} onChange={(e) => setVueltas(e.target.value)} />
              </Campo>
            ) : (<>
            <div className="campo medir__llamada">
              <label className="campo__etiqueta" htmlFor={`${id}-llamada`}>Cómo la llamás</label>
              <span className="medir__codigo">
                <span aria-hidden="true">{`${funcion.nombre}(`}</span>
                <input
                  ref={campoLlamada}
                  id={`${id}-llamada`}
                  className="campo__control"
                  type="text"
                  autoComplete="off"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  value={llamada}
                  aria-invalid={errores.llamada ? true : undefined}
                  aria-describedby={[`${id}-llamada-ayuda`, errores.llamada && `${id}-llamada-error`].filter(Boolean).join(' ')}
                  onChange={(e) => escribir('llamada', e.target.value)}
                />
                <span aria-hidden="true">)</span>
              </span>
              {/* Under the field, so its box is level with the function's. */}
              <span id={`${id}-llamada-ayuda`} className="campo__ayuda">Usá n para el tamaño, como en list(range(n)).</span>
              {errores.llamada && <span id={`${id}-llamada-error`} className="campo__error" role="alert">{errores.llamada}</span>}
            </div>
            <div className="campo">
              <label className="campo__etiqueta" htmlFor={`${id}-tamanos`}>Tamaños de n</label>
              <input
                ref={campoTamanos}
                id={`${id}-tamanos`}
                className="campo__control medir__tamanos"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={tamanos}
                aria-invalid={errores.tamanos ? true : undefined}
                aria-describedby={[`${id}-tamanos-ayuda`, errores.tamanos && `${id}-tamanos-error`].filter(Boolean).join(' ')}
                onChange={(e) => escribir('tamanos', e.target.value)}
              />
              {/* Under the field, so its box is level with the others. */}
              <span id={`${id}-tamanos-ayuda`} className="campo__ayuda">Si lo dejás vacío, empieza chico y sube hasta que tarde demasiado.</span>
              {errores.tamanos && <span id={`${id}-tamanos-error`} className="campo__error" role="alert">{errores.tamanos}</span>}
            </div>
            </>)}
            <div className="medir__acciones">
              <button type="submit" className="boton" aria-disabled={ocupado ? 'true' : undefined}>Medir</button>
              <button type="button" className="boton boton--secundario" onClick={alParar} aria-disabled={midiendo ? undefined : 'true'} aria-label="Parar la medición">Parar</button>
              <p className="medir__estado" role="status">
                {estado}
                {midiendo && <span aria-hidden="true">{medida.programa ? ` Va por la vez ${numero.format(medida.vuelta)}.` : ` Va por n = ${numero.format(medida.n)}.`}</span>}
              </p>
            </div>
          </form>
        )}

        {vista?.programa && tiempos.length > 0 && <Programa id={id} tiempos={tiempos} funciones={vista.funciones} />}

        {vista && !vista.programa && puntos.length > 0 && (
          <div className="medir__resultado">
            {frase && puntos.length >= MIN_PUNTOS ? (
              <div className="medir__veredicto" id={`${id}-veredicto`}>
                <p className="medir__titular">{frase.titulo}</p>
                <p>{frase.detalle}</p>
                {frase.parecido && <p className="laboratorio__ayuda">{frase.parecido}</p>}
              </div>
            ) : (
              !midiendo && <p className="laboratorio__ayuda" id={`${id}-veredicto`}>Con menos de tres tamaños no se ve cómo crece.</p>
            )}
            <ul className="medir__leyenda" aria-hidden="true">
              <li><span className="medir__muestra-punto" />Medido</li>
              {ajuste && <li><span className="medir__muestra-curva" />{ajuste.modelo === 'constante' ? 'Tiempo constante' : nombreDelModelo(ajuste.modelo) ? `Curva de ${nombreDelModelo(ajuste.modelo)}` : 'Curva que se ajusta'}</li>}
            </ul>
            <Grafico puntos={puntos} ajuste={puntos.length >= MIN_PUNTOS ? ajuste : null} describe={(frase && puntos.length >= MIN_PUNTOS) || !midiendo ? `${id}-veredicto` : undefined} />
            <table className="medir__tabla">
              <caption className="solo-lectores">{`Lo que tardó ${vista.funcion} con cada n`}</caption>
              <thead>
                <tr><th scope="col">n</th><th scope="col">Por llamada</th></tr>
              </thead>
              <tbody>
                {puntos.map((p) => <tr key={p.n}><td>{numero.format(p.n)}</td><td>{formatoTiempo(p.s)}</td></tr>)}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Caja>
  );
}
