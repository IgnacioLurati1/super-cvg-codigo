import { useMemo } from 'react';
import { useRecordado } from '../../../lib/calculadoras/memoria';
import { aTexto, bitsDe, MAX_LISTA, ORDINAL, subdividir } from '../../../lib/calculadoras/subred';
import { Desborde, Ejemplos, Hoja, Opciones, Paso, Pasos, Resultado } from '../Hoja';
import { Campo, Cuenta } from './_so-piezas';
import './subred.css';

// Subredes of Redes de Datos: the network and what is asked on the board, and on the sheet the practice's three
// formulas one by one, the new mask drawn bit by bit (network, subnet and host), the salto and the list of subnets.
// Method and examples: parcial-2.md and emergencia.md of El Santo Resumen (Conceptos IPv4, pages 20 to 27, and the
// guide's problem 9). VLSM is not in the notes.

const PIDE = [
  { valor: 'c', texto: 'Subredes' },
  { valor: 'h', texto: 'Hosts por subred' },
  { valor: 'n', texto: 'Bits de subred' },
];
const CUANTO = { c: 'Cuántas (C)', h: 'Cuántos (H)', n: 'Cuántos (N)' };

export const EJEMPLOS = [
  { nombre: '8 áreas', red: '192.168.168.0/24', pide: 'c', cuanto: '8' },
  { nombre: '20 redes', red: '192.168.0.0/24', pide: 'c', cuanto: '20' },
  { nombre: '5 hosts por subred', red: '192.168.0.0/24', pide: 'h', cuanto: '5' },
  { nombre: 'Un host y su máscara', red: '192.168.55.44 255.255.255.0', pide: 'n', cuanto: '0' },
];

const INICIAL = { ...EJEMPLOS[0], nombre: undefined };

const Pot = ({ b = 2, e }) => (
  <>
    {b}
    <sup>{e}</sup>
  </>
);

/** The 32 bits of the mask, one octet per group with its decimal below: network, subnet bits and host bits. */
function Mascara({ s }) {
  const bits = bitsDe(s.mascara);
  const tipo = (k) => (k < s.p ? 'red' : k < s.p2 ? 'subred' : 'host');
  const octetos = [0, 1, 2, 3].map((o) => bits.slice(o * 8, o * 8 + 8));
  const dicho = `La máscara en binario. ${s.p} bits de red, ${s.N} de subred y ${s.M} de host. En decimal, ${aTexto(s.mascara)}.`;
  return (
    <div className="sr-mascara" role="img" aria-label={dicho}>
      {octetos.map((o, i) => (
        <div key={i} className="sr-octeto" data-salto={i === s.octeto || undefined}>
          <span className="sr-octeto__bits">
            {[...o].map((b, j) => (
              <span key={j} className="sr-bit" data-tipo={tipo(i * 8 + j)}>
                {b}
              </span>
            ))}
          </span>
          <span className="sr-octeto__decimal">{(s.mascara >>> (24 - 8 * i)) & 255}</span>
        </div>
      ))}
    </div>
  );
}

function Leyenda({ s }) {
  return (
    <ul className="sr-leyenda">
      <li data-tipo="red">{`${s.p} de red`}</li>
      {s.N > 0 && <li data-tipo="subred">{`${s.N} de subred, N`}</li>}
      <li data-tipo="host">{`${s.M} de host, M`}</li>
    </ul>
  );
}

function Resolucion({ s }) {
  const { p, N, M, p2 } = s;
  const fila = (f) => (
    <tr key={f.i}>
      <th scope="row">{f.i + 1}</th>
      <td>{f.red}</td>
      <td>{f.primera}</td>
      <td>{f.ultima}</td>
      <td>{f.broadcast}</td>
    </tr>
  );
  return (
    <Hoja>
      <Resultado dicho={`Máscara /${p2}, ${aTexto(s.mascara)}. ${s.cantidad} subredes de ${s.hosts} hosts. Salto ${s.salto}.`} nota={`${s.cantidad} ${s.cantidad === 1 ? 'subred' : 'subredes'} de ${s.hosts} hosts. Salto ${s.salto}.`}>
        {`/${p2}, ${aTexto(s.mascara)}`}
      </Resultado>
      <Pasos>
        {s.red !== s.ip && (
          <Paso titulo="La dirección de red">
            <p>Un AND entre la dirección y la máscara.</p>
            <dl className="dato sr-and">
              <dt>Dirección</dt>
              <dd>{aTexto(s.ip)}</dd>
              <dt>Máscara</dt>
              <dd>{`${aTexto((0xffffffff << (32 - p)) >>> 0)}, /${p}`}</dd>
              <dt>AND</dt>
              <dd>
                <span className="resaltado">{aTexto(s.red)}</span>
              </dd>
            </dl>
          </Paso>
        )}
        {s.pide === 'c' && (
          <Paso titulo="Los bits de subred">
            <Cuenta>
              <Pot e="N" /> ≥ C = {s.k}
            </Cuenta>
            <Cuenta>
              {N === 0 ? (
                <>
                  N = 0, porque <Pot e={0} /> = 1
                </>
              ) : (
                <>
                  N = {N}, porque <Pot e={N} /> = {2 ** N} y <Pot e={N - 1} /> = {2 ** (N - 1)} no alcanza
                </>
              )}
            </Cuenta>
          </Paso>
        )}
        {s.pide === 'h' && (
          <Paso titulo="Los bits de host">
            <Cuenta>
              <Pot e="M" /> − 2 ≥ H = {s.k}
            </Cuenta>
            <Cuenta>
              M = {M}, porque <Pot e={M} /> − 2 = {2 ** M - 2}
              {M > 2 && (
                <>
                  {' '}
                  y <Pot e={M - 1} /> − 2 = {2 ** (M - 1) - 2} no alcanza
                </>
              )}
            </Cuenta>
          </Paso>
        )}
        <Paso titulo={s.pide === 'h' ? 'Los bits de subred' : 'Los bits de host'}>
          {s.pide === 'h' ? (
            <>
              <Cuenta>{`N = 32 − ${p} − ${M} = ${N}`}</Cuenta>
              <Cuenta>
                <Pot e={N} /> = {s.cantidad} subredes
              </Cuenta>
            </>
          ) : (
            <>
              {s.pide === 'n' && (
                <Cuenta>
                  <Pot e={N} /> = {s.cantidad} {s.cantidad === 1 ? 'subred' : 'subredes'}
                </Cuenta>
              )}
              <Cuenta>{`M = 32 − ${p} − ${N} = ${M}`}</Cuenta>
              <Cuenta>
                H = <Pot e={M} /> − 2 = {s.hosts} hosts por subred
              </Cuenta>
            </>
          )}
        </Paso>
        <Paso titulo={`La máscara nueva, /${p} + ${N} = /${p2}`}>
          <Mascara s={s} />
          <Leyenda s={s} />
        </Paso>
        <Paso titulo="El salto">
          <Cuenta>{`salto = 256 − ${s.ultimo} = ${s.salto}`}</Cuenta>
          <p>{`Va en el ${ORDINAL[s.octeto]} número de la dirección.`}</p>
        </Paso>
        <Paso titulo={s.ultima ? `Las primeras ${MAX_LISTA} subredes y la última` : s.cantidad === 1 ? 'La subred' : 'Las subredes'}>
          <Desborde etiqueta="Las subredes">
            <table className="tabla-pasos sr-lista">
              <caption className="solo-lectores">Cada subred con su dirección de red, la primera y la última útil y su broadcast</caption>
              <thead>
                <tr>
                  <th scope="col">Subred</th>
                  <th scope="col">Red</th>
                  <th scope="col">Primera útil</th>
                  <th scope="col">Última útil</th>
                  <th scope="col">Broadcast</th>
                </tr>
              </thead>
              <tbody>
                {s.filas.map(fila)}
                {s.ultima && (
                  <tr className="sr-lista__salto" aria-hidden="true">
                    <td colSpan={5}>⋮</td>
                  </tr>
                )}
                {s.ultima && fila(s.ultima)}
              </tbody>
            </table>
          </Desborde>
        </Paso>
      </Pasos>
    </Hoja>
  );
}

export default function Subred() {
  const [estado, setEstado] = useRecordado('calc:subred', INICIAL);
  const { red, pide, cuanto } = estado;
  const cambiar = (cambio) => setEstado((e) => ({ ...e, ...cambio }));
  const s = useMemo(() => subdividir(red, pide, cuanto), [red, pide, cuanto]);

  return (
    <>
      <section className="calc__ejercicio" aria-labelledby="ejercicio-titulo">
        <h2 id="ejercicio-titulo" className="calc__titulo">El ejercicio</h2>
        <div className="calc__campos">
          <Campo
            etiqueta="La red"
            valor={red}
            alCambiar={(r) => cambiar({ red: r })}
            error={s.en === 'red' ? s.error : null}
            ayuda="Con su prefijo o su máscara, como 192.168.1.0/24 o 192.168.1.0 255.255.255.0."
            ancho="26rem"
            maxLength={40}
          />
          <div className="so-campos">
            <Opciones leyenda="Te piden" nombre="pide" opciones={PIDE} valor={pide} alCambiar={(x) => cambiar({ pide: x })} />
            <Campo etiqueta={CUANTO[pide]} valor={cuanto} alCambiar={(x) => cambiar({ cuanto: x })} error={s.en === 'cuanto' ? s.error : null} corto inputMode="numeric" maxLength={9} />
          </div>
        </div>
        <Ejemplos ejemplos={EJEMPLOS} alElegir={({ nombre: _n, ...e }) => setEstado(e)} />
      </section>

      {!s.error && <Resolucion s={s} />}
    </>
  );
}
