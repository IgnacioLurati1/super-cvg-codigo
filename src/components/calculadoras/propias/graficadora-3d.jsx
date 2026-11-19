import { useContext, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { movimientoDe, useAjustes } from '../../../lib/ajustes';
import { escribir } from '../../../lib/calculadoras/formula';
import { enCaja, enTexto, leerTablero3d, MAX_TRAZOS, nuevoTrazo, planos, terna, TIPOS } from '../../../lib/calculadoras/graficadora3d';
import { useRecordado } from '../../../lib/calculadoras/memoria';
import { VistaDeGrafica } from '../../../lib/calculadoras/vistaGrafica';
import { curvaDeNivel } from '../../../lib/calculadoras/superficies';
import { usePantallaDeConsultron } from '../../../lib/consultron/pantalla';
import { Anuncio, Ejemplos, Hoja, Paso, Pasos } from '../Hoja';
import { Formula, linea, Plano, Rotulo } from './_an-grafico';
import { Dato, ErrorDe, Escribir, Renglon } from './_an-pizarron';
import { Borrar, cuenta, Ecuacion, Entre, lista, Mando, n, Sumar, useRenglones, useUltimoBueno } from './_gr-piezas';
import './graficadora.css';

// Graficadora 3D, of Análisis Matemático II: the graph of z = f(x, y), the surface of an equation in x, y and z (the
// quadrics, a plane, a cylinder), a surface by its two parameters, a curve in space, points and a vector, inside a
// box that turns. The kinds are El Santo Resumen's :::grafico3d (plantilla/w.js), plus the equation. The first
// function, f, gets its partial derivatives and, at a point, its gradient, its tangent plane and the test of the
// second derivatives; and its level curves, in space and on a map (parcial-1.md of Análisis Matemático II).
// three.js arrives only when the sheet shows the scene (_gr-escena.js).

const T = (id, tipo, datos) => ({ id, ...nuevoTrazo(tipo), ...datos });
const BASE = { x0: '-2', x1: '2', y0: '-2', y1: '2', z0: '', z1: '', punto: '', niveles: '' };
const caja = (lado, z0, z1) => ({ x0: `-${lado}`, x1: lado, y0: `-${lado}`, y1: lado, z0, z1 });

// The notes' own figures and examples (parcial-1.md of Análisis Matemático II).
export const EJEMPLOS = [
  { ...BASE, nombre: 'Curvas de nivel de una semiesfera', trazos: [T(1, 'superficie', { f: 'raiz(9 - x^2 - y^2)' })], ...caja('3,5', '0', '3,5'), punto: '1; 2', niveles: '0; 1; 2; 2,5' },
  { ...BASE, nombre: 'La silla de montar', trazos: [T(1, 'superficie', { f: 'x^2 - y^2' })], z0: '-4', z1: '4' },
  { ...BASE, nombre: 'Plano tangente a e^(x² − y²)', trazos: [T(1, 'superficie', { f: 'e^(x^2 - y^2)' })], x0: '0,5', x1: '1,5', y0: '-1,5', y1: '-0,5', z0: '-1', z1: '3,5', punto: '1; -1' },
  { ...BASE, nombre: 'Un mínimo y un punto silla', trazos: [T(1, 'superficie', { f: 'x^3 + y^3 - 3xy + 2' })], x0: '-0,6', x1: '1,6', y0: '-0,6', y1: '1,6', z0: '0', z1: '4', punto: '1; 1' },
  { ...BASE, nombre: 'Elipsoide', trazos: [T(1, 'ecuacion', { e: 'x^2/9 + y^2/4 + z^2/2,25 = 1' })], ...caja('3,5', '-3,5', '3,5') },
  { ...BASE, nombre: 'Hiperboloide de una hoja', trazos: [T(1, 'ecuacion', { e: 'x^2 + y^2 - z^2 = 1' })], ...caja('5', '-3', '3') },
  { ...BASE, nombre: 'Cono', trazos: [T(1, 'ecuacion', { e: 'x^2 + y^2 - z^2 = 0' })], ...caja('4', '-3', '3') },
  {
    ...BASE,
    nombre: 'La hélice sobre su cilindro',
    trazos: [T(1, 'curva', { x: '2cos(t)', y: '2sen(t)', z: 't', t0: '0', t1: '4pi' }), T(2, 'ecuacion', { e: 'x^2 + y^2 = 4' })],
    ...caja('3', '0', '12,6'),
  },
];

const INICIAL = { ...EJEMPLOS[0], nombre: undefined };

const NOMBRES_TIPO = { superficie: 'Función', ecuacion: 'Ecuación', parametrica: 'Superficie paramétrica', curva: 'Curva', puntos: 'Puntos', vector: 'Vector' };
const CUANTOS = {
  superficie: ['función', 'funciones'],
  ecuacion: ['ecuación', 'ecuaciones'],
  parametrica: ['superficie paramétrica', 'superficies paramétricas'],
  curva: ['curva', 'curvas'],
  puntos: ['grupo de puntos', 'grupos de puntos'],
  vector: ['vector', 'vectores'],
};
const sub = (letra, abajo) => (
  <>
    {letra}
    <sub>{abajo}</sub>
  </>
);

// ---------- What each thing is called ----------
function Nombre({ t }) {
  if (t.tipo === 'superficie') {
    return (
      <>
        {t.nombre}(x, y) = <Formula nodo={t.nodo} />
      </>
    );
  }
  if (t.tipo === 'ecuacion') {
    return (
      <>
        <Formula nodo={t.izq} /> = <Formula nodo={t.der} />
      </>
    );
  }
  if (t.tipo === 'parametrica' || t.tipo === 'curva') {
    return (
      <>
        (<Formula nodo={t.nodos.x} />; <Formula nodo={t.nodos.y} />; <Formula nodo={t.nodos.z} />)
      </>
    );
  }
  if (t.tipo === 'vector') return `el vector de ${terna(t.de)} a ${terna(t.a)}`;
  return t.puntos.length > 1 ? 'los puntos' : `el punto ${terna(t.puntos[0])}`;
}

function dicho(t) {
  if (t.tipo === 'superficie') return `la gráfica de ${t.nombre} de x e y igual a ${escribir(t.nodo)}`;
  if (t.tipo === 'ecuacion') return `la superficie ${escribir(t.izq)} igual a ${escribir(t.der)}`;
  if (t.tipo === 'parametrica') return 'una superficie paramétrica';
  if (t.tipo === 'curva') return `la curva de x igual a ${escribir(t.nodos.x)}, y igual a ${escribir(t.nodos.y)}, z igual a ${escribir(t.nodos.z)}`;
  if (t.tipo === 'vector') return `un vector de ${terna(t.de)} a ${terna(t.a)}`;
  return t.puntos.length > 1 ? `${t.puntos.length} puntos` : `el punto ${terna(t.puntos[0])}`;
}

// ---------- The scene ----------
const CONSULTA = '(prefers-reduced-motion: reduce)';
const seguirSistema = (avisar) => {
  const mq = window.matchMedia?.(CONSULTA);
  mq?.addEventListener('change', avisar);
  return () => mq?.removeEventListener('change', avisar);
};
const sistemaQuieto = () => Boolean(window.matchMedia?.(CONSULTA).matches);
// What changes the colors the scene takes from CSS: theme, contrast, palette and the custom colors (inline style).
const ATRIBUTOS = ['data-tema', 'data-paleta', 'data-contraste', 'data-daltonismo', 'data-luz', 'style'];

// Whether the scene already arrived once in this visit: then it comes back without the skeleton and the fade.
let yaVino = false;

// Why there is no scene, and the button that tries again.
const AVISOS = {
  sin3d: ['Este navegador no dibuja en 3D. Probá con otro.', null],
  perdido: ['Se perdió el dibujo en 3D.', 'Volver a dibujar'],
  error: ['No se pudo cargar el gráfico.', 'Reintentar'],
};

function Lamina({ m, vuelta }) {
  const movimiento = movimientoDe(useAjustes());
  const reducido = useSyncExternalStore(seguirSistema, sistemaQuieto, () => false);
  const quieto = movimiento !== 'sistema' || reducido;
  const nodo = useRef(null);
  const api = useRef(null);
  // In a live session: whoever is followed turns it here, and turning it by hand is told (vistaGrafica.js).
  const compartida = useContext(VistaDeGrafica);
  const actual = useRef({ m, quieto, compartida });
  const [rapida] = useState(() => yaVino);
  const [estado, setEstado] = useState(() => (yaVino ? 'pronto' : 'espera'));
  const descripcion = useId();
  const cargar = useRef(null);
  const aviso = useRef(null);
  const conFoco = useRef(false);

  useEffect(() => {
    actual.current = { ...actual.current, m, quieto };
    api.current?.quieto(quieto);
    // Typing rebuilds the surfaces: once the hand rests, not on every key.
    const reloj = setTimeout(() => api.current?.poner(m), 60);
    return () => clearTimeout(reloj);
  }, [m, quieto]);

  const seguida = compartida?.vista ?? null;
  useEffect(() => {
    actual.current = { ...actual.current, compartida };
    if (seguida) api.current?.ponerCamara(seguida);
    else api.current?.dejarDeSeguir();
  }, [compartida, seguida]);

  // A new example starts from the first view.
  useEffect(() => {
    if (vuelta) api.current?.reiniciar();
  }, [vuelta]);

  useEffect(() => {
    const el = nodo.current;
    if (!el) return undefined;
    let vivo = true;
    let pedido = false;
    let colores = null;
    let mirar = 0;
    const soltar = () => {
      colores?.disconnect();
      colores = null;
      cancelAnimationFrame(mirar);
      mirar = 0;
      api.current?.destruir();
      api.current = null;
    };
    const fallar = (cual) => {
      // Whoever was turning the scene with the keys goes on from the notice.
      conFoco.current = el.contains(document.activeElement);
      soltar();
      if (vivo) setEstado(cual);
    };
    cargar.current = async () => {
      try {
        const { crearEscena } = await import('./_gr-escena.js');
        if (!vivo) return;
        const escena = crearEscena(el, { quieto: actual.current.quieto, alPerder: () => fallar('perdido'), alGirar: (c) => actual.current.compartida?.alGirar(c) });
        if (!escena) {
          fallar('sin3d');
          return;
        }
        api.current = escena;
        yaVino = true;
        escena.poner(actual.current.m);
        if (actual.current.compartida?.vista) escena.ponerCamara(actual.current.compartida.vista, true);
        // Many changes of the page's style in one frame are one look at the colors.
        colores = new MutationObserver(() => {
          mirar ||= requestAnimationFrame(() => {
            mirar = 0;
            api.current?.colores();
          });
        });
        colores.observe(document.documentElement, { attributes: true, attributeFilter: ATRIBUTOS });
        // One frame later, so the canvas starts transparent and the fade in actually runs.
        requestAnimationFrame(() => vivo && setEstado('lista'));
      } catch {
        fallar('error');
      }
    };
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !pedido) {
          pedido = true;
          cargar.current();
        }
      },
      { rootMargin: '300px 0px' },
    );
    io.observe(el);
    return () => {
      vivo = false;
      io.disconnect();
      soltar();
    };
  }, []);

  const fallo = AVISOS[estado];
  useEffect(() => {
    if (!fallo || !conFoco.current) return;
    conFoco.current = false;
    aviso.current?.focus();
  }, [fallo]);

  const lista3d = estado === 'lista';
  const fuera = ([x, y, z]) => x < m.X[0] || x > m.X[1] || y < m.Y[0] || y > m.Y[1] || z < m.Z[0] || z > m.Z[1];
  const hayAfuera = m.trazos.some((t) => (t.tipo === 'puntos' && t.puntos.some(fuera)) || (t.tipo === 'vector' && (fuera(t.de) || fuera(t.a))));
  return (
    <div className="gr-lamina">
      {fallo && (
        <div className="gr-escena__aviso">
          <p role="status" tabIndex={-1} ref={aviso}>
            {fallo[0]}
          </p>
          {fallo[1] && (
            <button
              type="button"
              className="gr-mando gr-mando--texto"
              onClick={() => {
                setEstado('espera');
                cargar.current?.();
              }}
            >
              {fallo[1]}
            </button>
          )}
        </div>
      )}
      {/* It stays in its place also without a scene: the next try draws in it. */}
      <div
        ref={nodo}
        hidden={Boolean(fallo)}
        className={`gr-escena gr-escena--${estado}${rapida ? ' gr-escena--rapida' : ''}`}
        role="application"
        tabIndex={0}
        aria-label="Gráfico en 3D. Las flechas lo giran. Más y menos lo acercan y lo alejan. Cero vuelve a la vista inicial."
        aria-describedby={descripcion}
        aria-busy={!lista3d || undefined}
      >
        {/* It fades out over the scene that fades in, so the box is never empty in between. */}
        {!rapida && (estado === 'espera' || lista3d) && <span className="gr-escena__esqueleto" aria-hidden="true" />}
      </div>
      <p className="solo-lectores" id={descripcion}>
        {`${lista3d || fallo ? '' : 'Cargando el gráfico. '}Dibujado: ${lista(m.trazos.map(dicho))}. La caja va de ${n(m.X[0])} a ${n(m.X[1])} en x, de ${n(m.Y[0])} a ${n(m.Y[1])} en y, de ${n(m.Z[0])} a ${n(m.Z[1])} en z.`}
      </p>
      <div className="gr-pie">
        <ul className="graf-leyenda gr-leyenda">
          {m.trazos.map((t, i) => (
            <li key={t.id}>
              {/* With several things, each one's number is also on it in the scene: color is not the only clue. */}
              {m.trazos.length > 1 && <b className="gr-leyenda__numero">{i + 1}</b>}
              <span className={`gr-muestra gr-muestra--${t.serie}${t.tipo === 'curva' || t.tipo === 'vector' ? ' gr-muestra--linea' : t.tipo === 'puntos' ? ' gr-muestra--punto' : ''}`} aria-hidden="true" />
              <span>
                <Nombre t={t} />
              </span>
            </li>
          ))}
          {enCaja(m) && (
            <li>
              <span className="gr-muestra gr-muestra--plano" aria-hidden="true" />
              el plano tangente en P
            </li>
          )}
          {m.niveles && (
            <li>
              <span className="gr-muestra gr-muestra--nivel gr-muestra--linea" aria-hidden="true" />
              {`las curvas de nivel de ${m.f.nombre}`}
            </li>
          )}
        </ul>
        {!fallo && (
          <div className="gr-mandos" role="group" aria-label="Vista del gráfico">
            <Mando nombre="Girar a la izquierda" icono="izquierda" apagado={!lista3d} alTocar={() => api.current?.girar(0.2, 0)} />
            <Mando nombre="Girar a la derecha" icono="derecha" apagado={!lista3d} alTocar={() => api.current?.girar(-0.2, 0)} />
            <Mando nombre="Mirar desde más arriba" icono="arriba" apagado={!lista3d} alTocar={() => api.current?.girar(0, 0.16)} />
            <Mando nombre="Mirar desde más abajo" icono="abajo" apagado={!lista3d} alTocar={() => api.current?.girar(0, -0.16)} />
            <Mando nombre="Alejar" icono="menos" apagado={!lista3d} alTocar={() => api.current?.acercar(1.2)} />
            <Mando nombre="Acercar" icono="mas" apagado={!lista3d} alTocar={() => api.current?.acercar(1 / 1.2)} />
            <Mando nombre="Vista inicial" apagado={!lista3d} alTocar={() => api.current?.reiniciar()} />
          </div>
        )}
      </div>
      {hayAfuera && <p className="gr-lamina__nota">Lo que queda fuera de la caja no se dibuja. Agrandala para verlo.</p>}
    </div>
  );
}

// ---------- The accounts, step by step ----------
const Suelta = ({ children }) => <p className="calc-hoja__suelta">{children}</p>;
const Cuenta = ({ children }) => <p className="calc-hoja__cuenta an-cuenta">{children}</p>;

/** What the test of the second derivatives says, in the notes' words. */
function Conclusion({ tipo, f }) {
  if (tipo === 'silla') return <Suelta>{`D < 0. ${f} tiene un punto silla en P.`}</Suelta>;
  if (tipo === 'nada') return <Suelta>D = 0. La prueba no dice si en P hay un máximo, un mínimo o un punto silla.</Suelta>;
  return (
    <Suelta>
      D &gt; 0 y {sub(f, 'xx')} {tipo === 'min' ? '>' : '<'} 0. {`${f} tiene un ${tipo === 'min' ? 'mínimo' : 'máximo'} local en P.`}
    </Suelta>
  );
}

/** The level curves of f on the plane xy, with the point and where its gradient points. */
function Mapa({ m }) {
  // Outside the box the point is not on the map. Its level curve still is, where it crosses the box.
  const p = enCaja(m) ? m.punto : null;
  const afuera = m.punto && !p ? m.punto.z0 : null;
  const conGradiente = p && (p.fx !== 0 || p.fy !== 0);
  const niveles = m.niveles ?? [];
  const porP = p ? p.z0 : afuera;
  const conLaDeP = porP !== null && !niveles.includes(porP);
  const etiqueta = `Mapa de las curvas de nivel de ${m.f.nombre}${niveles.length ? `, para k igual a ${lista(niveles.map(n))}` : ''}${p ? `, con el punto P(${n(p.x0)}; ${n(p.y0)})` : ''}.`;
  return (
    <>
      <Plano x={m.X} y={m.Y} igual proporcion={0.62} maxAlto={440} etiqueta={etiqueta}>
        {({ sx, sy, X, Y, recorte }) => {
          const aPx = ([x, y]) => [sx(x), sy(y)];
          const curvas = (k) => curvaDeNivel(m.f.fn, X, Y, k, 110);
          const camino = (lineas) => lineas.map((l) => linea(l.map(aPx))).join('');
          const largo = (X[1] - X[0]) * 0.13;
          const norma = p ? Math.hypot(p.fx, p.fy) : 0;
          const punta = conGradiente ? aPx([p.x0 + (p.fx / norma) * largo, p.y0 + (p.fy / norma) * largo]) : null;
          const pie = p ? aPx([p.x0, p.y0]) : null;
          const angulo = punta ? (Math.atan2(punta[1] - pie[1], punta[0] - pie[0]) * 180) / Math.PI : 0;
          return (
            <>
              <g clipPath={recorte}>
                {niveles.map((k) => (
                  <path key={k} className="gr-serie" d={camino(curvas(k))} />
                ))}
                {conLaDeP && <path className="graf__metodo" d={camino(curvas(porP))} />}
              </g>
              {niveles.map((k, i) => {
                // Each number on its own curve, a little further along than the one before.
                const l = curvas(k).sort((a, b) => b.length - a.length)[0];
                if (!l) return null;
                const [x, y] = aPx(l[Math.floor(l.length * (0.08 + ((i * 0.11) % 0.8)))]);
                return (
                  <Rotulo key={k} x={x} y={y - 6}>
                    {n(k)}
                  </Rotulo>
                );
              })}
              {p && (
                <>
                  {punta && (
                    <g className="gr-flecha">
                      <line x1={pie[0]} y1={pie[1]} x2={punta[0]} y2={punta[1]} />
                      <path d="M0 0l-11 -5v10z" transform={`translate(${punta[0].toFixed(1)} ${punta[1].toFixed(1)}) rotate(${angulo.toFixed(1)})`} />
                    </g>
                  )}
                  <circle className="graf__punto graf__punto--lleno" cx={pie[0]} cy={pie[1]} r={4.5} />
                  <Rotulo x={pie[0] + 9} y={pie[1] + 16} ancla="start">
                    P
                  </Rotulo>
                </>
              )}
            </>
          );
        }}
      </Plano>
      <ul className="graf-leyenda">
        {niveles.length > 0 && (
          <li>
            <svg viewBox="0 0 28 10" width="28" height="10" aria-hidden="true">
              <line x1="1" x2="27" y1="5" y2="5" className="gr-serie" />
            </svg>
            {`${m.f.nombre}(x, y) = k`}
          </li>
        )}
        {conLaDeP && (
          <li>
            <svg viewBox="0 0 28 10" width="28" height="10" aria-hidden="true">
              <line x1="1" x2="27" y1="5" y2="5" className="graf__metodo" />
            </svg>
            {conGradiente || afuera !== null ? 'la curva de nivel que pasa por P' : `donde ${m.f.nombre} vale lo mismo que en P`}
          </li>
        )}
        {conGradiente && (
          <li>
            <svg viewBox="0 0 28 10" width="28" height="10" aria-hidden="true" className="gr-flecha">
              <line x1="1" x2="18" y1="5" y2="5" />
              <path d="M27 5l-10 -4v8z" />
            </svg>
            {`hacia donde apunta ∇${m.f.nombre}(P)`}
          </li>
        )}
      </ul>
    </>
  );
}

function Cuentas({ m }) {
  const f = m.f.nombre;
  const p = m.punto;
  const P = p ? `(${n(p.x0)}; ${n(p.y0)})` : '';
  const [alrededor, despejado] = p ? planos(p) : [];
  const k = p?.critico;
  // The levels the surface never reaches inside the box: said, instead of an empty map.
  const sinCorte = useMemo(() => (m.niveles ?? []).filter((nivel) => !curvaDeNivel(m.f.fn, m.X, m.Y, nivel, 60).length), [m]);
  return (
    <Pasos>
      <Paso titulo="Las derivadas parciales">
        <Cuenta>
          {f}(x, y) = <Formula nodo={m.f.nodo} />
        </Cuenta>
        <Cuenta>
          {sub(f, 'x')}(x, y) = <Formula nodo={m.parciales.nodoX} />
        </Cuenta>
        <Cuenta>
          {sub(f, 'y')}(x, y) = <Formula nodo={m.parciales.nodoY} />
        </Cuenta>
      </Paso>
      {p && (
        <Paso titulo={`En P${P}`}>
          <Cuenta>{`${f}${P} = ${n(p.z0)}`}</Cuenta>
          <Cuenta>
            {sub(f, 'x')}
            {`${P} = ${n(p.fx)}`}
          </Cuenta>
          <Cuenta>
            {sub(f, 'y')}
            {`${P} = ${n(p.fy)}`}
          </Cuenta>
          <Cuenta>{`∇${f}${P} = (${n(p.fx)}; ${n(p.fy)})`}</Cuenta>
          {!enCaja(m) && <Suelta>P queda fuera de la caja. Agrandala para verlo en el gráfico.</Suelta>}
        </Paso>
      )}
      {p && (
        <Paso titulo="El plano tangente">
          <Cuenta>
            z − z₀ = {sub(f, 'x')}(x₀; y₀)(x − x₀) + {sub(f, 'y')}(x₀; y₀)(y − y₀)
          </Cuenta>
          <Cuenta>{alrededor}</Cuenta>
          {despejado !== alrededor && <Cuenta>{despejado}</Cuenta>}
        </Paso>
      )}
      {k && (
        <Paso titulo="El punto crítico">
          <Suelta>Las dos derivadas parciales dan 0 en P. Es un punto crítico.</Suelta>
          <Cuenta>
            {sub(f, 'xx')} = <Formula nodo={k.nodos.xx} />, {sub(f, 'yy')} = <Formula nodo={k.nodos.yy} />, {sub(f, 'xy')} = <Formula nodo={k.nodos.xy} />
          </Cuenta>
          <Cuenta>
            D = {sub(f, 'xx')}·{sub(f, 'yy')} − ({sub(f, 'xy')})² = {`${n(k.fxx)}·${k.fyy < 0 ? `(${n(k.fyy)})` : n(k.fyy)} − (${n(k.fxy)})² = ${n(k.D)}`}
          </Cuenta>
          <Conclusion tipo={k.tipo} f={f} />
        </Paso>
      )}
      {(m.niveles || p) && (
        <Paso titulo="Las curvas de nivel">
          <Mapa m={m} />
          {sinCorte.length > 0 && <Suelta>{`${lista(sinCorte.map((nivel) => `k = ${n(nivel)}`))} no ${sinCorte.length > 1 ? 'cortan' : 'corta'} a ${f} en esta caja.`}</Suelta>}
          {p && (p.fx !== 0 || p.fy !== 0) && <Suelta>{`El gradiente en P es perpendicular a la curva de nivel que pasa por P, la de k = ${n(p.z0)}.`}</Suelta>}
        </Paso>
      )}
    </Pasos>
  );
}

// ---------- The board ----------
const QUE_ES = { ecuacion: 'la ecuación', parametrica: 'la superficie paramétrica', curva: 'la curva', puntos: 'los puntos', vector: 'el vector' };

/** One thing of the board, with what its kind asks for and its own way out. */
function Fila({ t, i, nombre, error, cambiar, borrar, enfocar }) {
  const id = useId();
  const fila = useRef(null);
  useEffect(() => {
    if (enfocar) fila.current?.querySelector('input')?.focus();
  }, [enfocar]);
  const mal = (campo) => error?.campo === `t${i}.${campo}`;
  const delTrazo = error?.campo.startsWith(`t${i}.`);
  const errorId = `${id}-e`;
  const formula = (campo, etiqueta, decir, maximo) => (
    <Escribir id={`${id}-${campo}`} nombre={etiqueta} decir={decir} valor={t[campo]} alCambiar={cambiar(campo)} invalido={mal(campo)} errorId={errorId} maximo={maximo} />
  );
  const rango = (letra) => (
    <Entre
      id={`${id}-${letra}`}
      nombre={letra}
      decir={`el parámetro ${letra}`}
      desde={t[`${letra}0`]}
      hasta={t[`${letra}1`]}
      alDesde={cambiar(`${letra}0`)}
      alHasta={cambiar(`${letra}1`)}
      malDesde={mal(`${letra}0`)}
      malHasta={mal(`${letra}1`)}
      errorId={errorId}
    />
  );
  return (
    <li className="gr-trazo" ref={fila}>
      <div className="gr-trazo__campos">
        {t.tipo === 'superficie' && formula('f', `${nombre}(x, y)`)}
        {t.tipo === 'ecuacion' && <Ecuacion id={`${id}-e0`} valor={t.e} alCambiar={cambiar('e')} invalido={mal('e')} errorId={errorId} />}
        {t.tipo === 'parametrica' && (
          <>
            {formula('x', 'x(u, v)')}
            {formula('y', 'y(u, v)')}
            {formula('z', 'z(u, v)')}
            <div className="pz-renglon__datos">
              {rango('u')}
              {rango('v')}
            </div>
          </>
        )}
        {t.tipo === 'curva' && (
          <>
            {formula('x', 'x(t)')}
            {formula('y', 'y(t)')}
            {formula('z', 'z(t)')}
            {rango('t')}
          </>
        )}
        {t.tipo === 'puntos' && formula('p', 'P', 'los puntos', 400)}
        {t.tipo === 'vector' && (
          <Entre
            id={`${id}-v`}
            nombre="Vector"
            decir="el vector"
            ancho={6.5}
            desde={t.de}
            hasta={t.a}
            alDesde={cambiar('de')}
            alHasta={cambiar('a')}
            malDesde={mal('de')}
            malHasta={mal('a')}
            errorId={errorId}
          />
        )}
        <ErrorDe id={errorId} texto={delTrazo && error.texto} />
      </div>
      <Borrar queEs={t.tipo === 'superficie' ? `${nombre}(x, y)` : QUE_ES[t.tipo]} renglon={i + 1} alBorrar={borrar} />
    </li>
  );
}

export default function Graficadora3D() {
  const [estado, setEstado] = useRecordado('calc:graficadora-3d', INICIAL);
  const [vuelta, setVuelta] = useState(0);
  const sumar = useRef(null);
  const id = useId();
  const m = useMemo(() => leerTablero3d(estado), [estado]);
  const visto = useUltimoBueno(m);
  // Consultron reads the drawing as text: a canvas has nothing to read.
  usePantallaDeConsultron(useMemo(() => enTexto(visto), [visto]));
  const { recien, lleno, borrado, agregar, borrar, deshacer, olvidar } = useRenglones(estado, setEstado, MAX_TRAZOS, nuevoTrazo);
  const error = m.error;
  const mal = (campo) => error?.campo === campo;
  const cambiar = (campo) => (v) => setEstado((e) => ({ ...e, [campo]: v }));
  const cambiarTrazo = (idTrazo) => (campo) => (v) => setEstado((e) => ({ ...e, trazos: e.trazos.map((t) => (t.id === idTrazo ? { ...t, [campo]: v } : t)) }));

  let cuantas = 0;
  const nombres = estado.trazos.map((t) => (t.tipo === 'superficie' ? ['f', 'g', 'h', 'p', 'q'][cuantas++] : null));
  const hayFuncion = cuantas > 0;
  const malVentana = error && ['x0', 'x1', 'y0', 'y1', 'z0', 'z1'].includes(error.campo);
  const malSobre = error && ['punto', 'niveles'].includes(error.campo);
  const ventana = (eje, vacio) => (
    <Entre
      id={`${id}-${eje}`}
      nombre={eje}
      decir={`la caja en ${eje}`}
      desde={estado[`${eje}0`]}
      hasta={estado[`${eje}1`]}
      alDesde={cambiar(`${eje}0`)}
      alHasta={cambiar(`${eje}1`)}
      malDesde={mal(`${eje}0`)}
      malHasta={mal(`${eje}1`)}
      errorId={`${id}-ev`}
      vacio={vacio}
    />
  );

  return (
    <>
      <section className="calc__ejercicio" aria-labelledby="ejercicio-titulo">
        <h2 id="ejercicio-titulo" className="calc__titulo">El ejercicio</h2>
        <div className="calc__campos">
          {estado.trazos.length > 0 && (
            <ul className="gr-trazos">
              {estado.trazos.map((t, i) => (
                <Fila key={t.id} t={t} i={i} nombre={nombres[i]} error={error} cambiar={cambiarTrazo(t.id)} borrar={() => borrar(t.id)} enfocar={recien === t.id} />
              ))}
            </ul>
          )}
          <Sumar
            id={`${id}-sumar`}
            caja={sumar}
            tipos={TIPOS}
            nombres={NOMBRES_TIPO}
            lleno={lleno}
            hay={estado.trazos.length > 0}
            alSumar={agregar}
            alDeshacer={borrado === null ? null : deshacer}
            claveDeshacer={borrado}
          />
          <p className="campo__ayuda pz-ayuda">
            {lleno ? `Entran hasta ${MAX_TRAZOS}. ` : ''}
            Una función va con x e y, como <code>x^2 - y^2</code>. Una ecuación, con x, y, z, como <code>x^2 + y^2 + z^2 = 9</code>. Los puntos, como <code>(1; 2; 3) (0; 0; 1)</code>.
          </p>
          <Renglon titulo="La caja" error={malVentana && error.texto} errorId={`${id}-ev`}>
            {ventana('x')}
            {ventana('y')}
            {ventana('z', 'sola')}
          </Renglon>
          {hayFuncion && (
            <>
              <Renglon titulo="Sobre f" error={malSobre && error.texto} errorId={`${id}-es`}>
                <Dato id={`${id}-p`} nombre="P" decir="el punto del plano tangente, con x e y" ancho={6.5} valor={estado.punto} alCambiar={cambiar('punto')} invalido={mal('punto')} errorId={`${id}-es`} />
                <Dato id={`${id}-k`} nombre="k" decir="los niveles de las curvas de nivel" ancho={9} maximo={160} valor={estado.niveles} alCambiar={cambiar('niveles')} invalido={mal('niveles')} errorId={`${id}-es`} />
              </Renglon>
              <p className="campo__ayuda pz-ayuda">
                P suma el plano tangente y el gradiente de f, como <code>1; -1</code>. k, las curvas de nivel, como <code>0; 1; 2</code>.
              </p>
            </>
          )}
        </div>
        <Ejemplos
          ejemplos={EJEMPLOS}
          alElegir={({ nombre: _n, ...e }) => {
            setEstado(e);
            setVuelta((v) => v + 1);
            olvidar();
          }}
        />
      </section>

      {visto && !visto.vacio && (
        <Hoja titulo={visto.f ? 'El gráfico y las cuentas' : 'El gráfico'}>
          {/* With a mistake on the board, what was drawn before waits, dimmed. */}
          <div className={error ? 'gr-espera' : undefined}>
            <Lamina m={visto} vuelta={vuelta} />
            <Anuncio texto={error ? '' : `Gráfico con ${cuenta(visto.trazos, CUANTOS)}.`} />
            {visto.f && <Cuentas m={visto} />}
          </div>
        </Hoja>
      )}
    </>
  );
}
