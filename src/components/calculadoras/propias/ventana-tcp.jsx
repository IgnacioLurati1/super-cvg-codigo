import { Fragment, useMemo } from 'react';
import { correr, leerVentana } from '../../../lib/calculadoras/congestion';
import { useRecordado } from '../../../lib/calculadoras/memoria';
import { Desborde, Ejemplos, Hoja, Opciones, Paso, Pasos, Resultado } from '../Hoja';
import { Campo, Cuenta, useAncho } from './_so-piezas';
import './ventana-tcp.css';

// Ventana de congestión of Redes de Datos: threshold, start, rounds and losses on the board, and on the sheet the curve
// of the window round by round as the book's figure draws it (Tahoe round, Reno square), the count of each loss
// and the table of every round. Rules and the figure's values: parcial-2.md of El Santo Resumen (Capa de Transporte,
// TCP, pages 14 to 16, figure of Tahoe and Reno).

const VER = [
  { valor: 'ambas', texto: 'Tahoe y Reno' },
  { valor: 'tahoe', texto: 'Tahoe' },
  { valor: 'reno', texto: 'Reno' },
];

export const EJEMPLOS = [
  { nombre: 'La figura del apunte', umbral: '32', inicial: '1', rondas: '24', perdidas: '13', ver: 'ambas' },
  { nombre: 'Dos pérdidas', umbral: '32', inicial: '1', rondas: '48', perdidas: '13, 33', ver: 'reno' },
  { nombre: 'Sin pérdidas', umbral: '32', inicial: '1', rondas: '24', perdidas: '', ver: 'ambas' },
];

const INICIAL = { ...EJEMPLOS[0], nombre: undefined };
const FASE = { slow: 'slow start', aditivo: 'aditivo', perdida: 'pérdida' };
const SERIES = { tahoe: { nombre: 'Tahoe', tono: 1 }, reno: { nombre: 'Reno', tono: 0 } };

/** A round number of marks between 0 and the top. */
const pasoDe = (tope, cuantas) => [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000].find((k) => k * cuantas >= tope) || 100000;

/** The curve, drawn as the book's figure: a dot per round, the threshold dashed and each loss marked. */
function Grafico({ series, rondas, perdidas }) {
  const [caja, { ancho, letra }] = useAncho();
  const fs = Math.round(letra * 0.8125);
  const W = Math.max(280, ancho || 600);
  const H = Math.round(Math.min(Math.max(W * 0.55, 220), 360));
  const m = { i: fs * 3, d: fs * 1.2, a: fs * 1.6, b: fs * 3 };
  const tope = Math.max(...series.flatMap((s) => s.datos.map((x) => Math.max(x.ventana, x.umbral))));
  const py = pasoDe(tope, 5);
  const yMax = Math.ceil((tope * 1.06) / py) * py || py;
  const px = [1, 2, 4, 5, 10, 20].find((k) => rondas / k <= (W < 480 ? 6 : 12)) || 10;
  const X = (r) => m.i + (r / rondas) * (W - m.i - m.d);
  const Y = (v) => H - m.b - (v / yMax) * (H - m.a - m.b);
  const marcasX = Array.from({ length: Math.floor(rondas / px) + 1 }, (_, k) => k * px);
  const marcasY = Array.from({ length: Math.floor(yMax / py) + 1 }, (_, k) => k * py);
  const dicho = series
    .map((s) => `${SERIES[s.clave].nombre}: ${s.datos.map((x) => x.ventana).join(', ')}`)
    .join('. ');
  const radio = W < 480 ? 2.2 : 3;
  return (
    <div ref={caja} className="vt-caja">
      <svg className="vt-grafico" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`La ventana en cada ronda, de la 0 a la ${rondas}. ${dicho}.`} style={{ fontSize: fs }}>
        {marcasY.map((v) => (
          <g key={`y${v}`}>
            <line className="vt-marca" x1={m.i - 4} x2={m.i} y1={Y(v)} y2={Y(v)} />
            <text className="vt-numero" x={m.i - 7} y={Y(v)} textAnchor="end" dominantBaseline="central">{v}</text>
          </g>
        ))}
        {marcasX.map((r) => (
          <g key={`x${r}`}>
            <line className="vt-marca" x1={X(r)} x2={X(r)} y1={H - m.b} y2={H - m.b + 4} />
            <text className="vt-numero" x={X(r)} y={H - m.b + fs * 1.4} textAnchor="middle">{r}</text>
          </g>
        ))}
        <line className="vt-eje" x1={m.i} x2={W - m.d} y1={H - m.b} y2={H - m.b} />
        <line className="vt-eje" x1={m.i} x2={m.i} y1={m.a} y2={H - m.b} />
        <text className="vt-nombre-eje" x={(m.i + W - m.d) / 2} y={H - fs * 0.4} textAnchor="middle">rondas</text>
        {perdidas.map((r) => (
          <g key={`p${r}`} className="vt-perdida">
            <line x1={X(r)} x2={X(r)} y1={m.a} y2={H - m.b} />
            <text x={X(r)} y={m.a - fs * 0.45} textAnchor="middle">pérdida</text>
          </g>
        ))}
        {series.map((s) => (
          <g key={s.clave} className="vt-serie" data-tono={SERIES[s.clave].tono} data-serie={s.clave}>
            <path className="vt-umbral" d={s.datos.map((x, r) => `${r ? 'L' : 'M'}${X(r).toFixed(1)} ${Y(x.umbral).toFixed(1)}`).join(' ')} />
            <path className="vt-linea" d={s.datos.map((x, r) => `${r ? 'L' : 'M'}${X(r).toFixed(1)} ${Y(x.ventana).toFixed(1)}`).join(' ')} />
            {s.datos.map((x, r) =>
              s.clave === 'reno' ? (
                <rect key={r} className="vt-punto" x={X(r) - radio} y={Y(x.ventana) - radio} width={radio * 2} height={radio * 2} />
              ) : (
                <circle key={r} className="vt-punto" cx={X(r)} cy={Y(x.ventana)} r={radio + 1.5} />
              ),
            )}
          </g>
        ))}
      </svg>
      <ul className="vt-leyenda">
        {series.map((s) => (
          <li key={s.clave} data-tono={SERIES[s.clave].tono} data-serie={s.clave}>
            {SERIES[s.clave].nombre}
          </li>
        ))}
        <li data-umbral>el umbral</li>
      </ul>
    </div>
  );
}

function Perdida({ r, series }) {
  const antes = series.map((s) => ({ ...s, en: s.datos[r], umbral: Math.max(1, Math.floor(s.datos[r].ventana / 2)) }));
  const igual = antes.length === 2 && antes[0].en.ventana === antes[1].en.ventana;
  const cuenta = ({ en: { ventana: w }, umbral: u }) => (w < 2 ? 'umbral = 1' : w % 2 ? `umbral = ⌊${w} / 2⌋ = ${u}` : `umbral = ${w} / 2 = ${u}`);
  const despues = (x) => (x.clave === 'tahoe' ? 'Tahoe vuelve a 1 con slow start.' : `Reno sigue desde ${x.umbral} y suma de a uno.`);
  if (igual || antes.length === 1) {
    return (
      <>
        <p>{`La ventana estaba en ${antes[0].en.ventana}. El umbral baja a la mitad.`}</p>
        <Cuenta>{cuenta(antes[0])}</Cuenta>
        <p>{antes.map(despues).join(' ')}</p>
      </>
    );
  }
  return antes.map((x) => (
    <div key={x.clave} className="vt-cada">
      <p>{`En ${SERIES[x.clave].nombre} la ventana estaba en ${x.en.ventana}.`}</p>
      <Cuenta>{cuenta(x)}</Cuenta>
      <p>{despues(x)}</p>
    </div>
  ));
}

function Tabla({ series, rondas }) {
  const dos = series.length === 2;
  return (
    <Desborde etiqueta="Ronda por ronda">
      <table className="tabla-pasos vt-tabla">
        <caption className="solo-lectores">La ventana, el umbral y la fase de cada ronda</caption>
        <thead>
          {dos && (
            <tr>
              <td />
              {series.map((s) => (
                <th key={s.clave} scope="colgroup" colSpan={3} className="vt-tabla__serie">
                  <span className="so-chip" data-tono={SERIES[s.clave].tono}>{SERIES[s.clave].nombre}</span>
                </th>
              ))}
            </tr>
          )}
          <tr>
            <th scope="col">Ronda</th>
            {series.map((s) => (
              <Fragment key={s.clave}>
                <th scope="col">Ventana</th>
                <th scope="col">Umbral</th>
                <th scope="col" className="vt-fase">Fase</th>
              </Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rondas + 1 }, (_, r) => (
            <tr key={r} data-perdida={series.some((s) => s.datos[r].fase === 'perdida') || undefined}>
              <th scope="row">{r}</th>
              {series.map((s) => (
                <Fragment key={s.clave}>
                  <td data-primera={dos || undefined}>{s.datos[r].ventana}</td>
                  <td>{s.datos[r].umbral}</td>
                  <td className="vt-fase" data-fase={s.datos[r].fase}>{FASE[s.datos[r].fase]}</td>
                </Fragment>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Desborde>
  );
}

function Resolucion({ v, ver }) {
  const claves = ver === 'ambas' ? ['tahoe', 'reno'] : [ver];
  const series = claves.map((clave) => ({ clave, datos: correr(v, clave === 'reno') }));
  const ultima = series.map((s) => ({ nombre: SERIES[s.clave].nombre, x: s.datos[v.rondas] }));
  const juntas = ultima.length === 2 && ultima[0].x.ventana === ultima[1].x.ventana && ultima[0].x.umbral === ultima[1].x.umbral;
  const respuesta = ultima.length === 1 || juntas ? `En la ronda ${v.rondas} la ventana es ${ultima[0].x.ventana}.` : `En la ronda ${v.rondas} la ventana de Tahoe es ${ultima[0].x.ventana} y la de Reno, ${ultima[1].x.ventana}.`;
  const nota = ultima.length === 1 || ultima[0].x.umbral === ultima[1].x.umbral ? `El umbral quedó en ${ultima[0].x.umbral}.` : `El umbral quedó en ${ultima[0].x.umbral} en Tahoe y en ${ultima[1].x.umbral} en Reno.`;
  return (
    <Hoja>
      <Resultado dicho={`${respuesta} ${nota}`} nota={nota}>
        <span className="calc-hoja__respuesta--chica vt-respuesta">{respuesta}</span>
      </Resultado>
      <Pasos>
        <Paso titulo="La ventana en cada ronda">
          <Grafico series={series} rondas={v.rondas} perdidas={v.perdidas} />
        </Paso>
        {v.perdidas.map((r) => (
          <Paso key={r} titulo={`La pérdida de la ronda ${r}`}>
            <Perdida r={r} series={series} />
          </Paso>
        ))}
        <Paso titulo="Ronda por ronda">
          <Tabla series={series} rondas={v.rondas} />
        </Paso>
      </Pasos>
    </Hoja>
  );
}

export default function VentanaTcp() {
  const [estado, setEstado] = useRecordado('calc:ventana-tcp', INICIAL);
  const { umbral, inicial, rondas, perdidas, ver } = estado;
  const cambiar = (cambio) => setEstado((e) => ({ ...e, ...cambio }));
  const v = useMemo(() => leerVentana({ umbral, inicial, rondas, perdidas }), [umbral, inicial, rondas, perdidas]);
  const error = (en) => (v.en === en ? v.error : null);

  return (
    <>
      <section className="calc__ejercicio" aria-labelledby="ejercicio-titulo">
        <h2 id="ejercicio-titulo" className="calc__titulo">El ejercicio</h2>
        <div className="calc__campos">
          <div className="so-campos">
            <Campo etiqueta="Umbral" valor={umbral} alCambiar={(x) => cambiar({ umbral: x })} error={error('umbral')} corto inputMode="numeric" maxLength={6} />
            <Campo etiqueta="Ventana inicial" valor={inicial} alCambiar={(x) => cambiar({ inicial: x })} error={error('inicial')} corto inputMode="numeric" maxLength={6} />
            <Campo etiqueta="Rondas" valor={rondas} alCambiar={(x) => cambiar({ rondas: x })} error={error('rondas')} corto inputMode="numeric" maxLength={2} />
          </div>
          <Campo etiqueta="Pérdidas en las rondas" valor={perdidas} alCambiar={(x) => cambiar({ perdidas: x })} error={error('perdidas')} ayuda="Separadas con comas, como 8, 15." ancho="18rem" maxLength={200} />
          <Opciones leyenda="Ver" nombre="ver" opciones={VER} valor={ver} alCambiar={(x) => cambiar({ ver: x })} chica />
        </div>
        <Ejemplos ejemplos={EJEMPLOS} alElegir={({ nombre: _n, ...e }) => setEstado(e)} />
      </section>

      {!v.error && <Resolucion v={v} ver={ver} />}
    </>
  );
}
