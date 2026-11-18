import { useMemo, useRef, useState } from 'react';
import Campo from '../../Campo';
import { conj, letra, probar, resolverER } from '../../../lib/calculadoras/automatas';
import { useRecordado } from '../../../lib/calculadoras/memoria';
import { Desborde, Ejemplos, Hoja, Paso, Pasos, Resultado } from '../Hoja';
import { Dibujo, Flecha, punta, Teclas, Vertice } from './_log-trazos';
import './thompson.css';

// Regular expressions of Sintaxis y Semántica de los Lenguajes (parcial-2.md): the expression and a string on the
// board, and on the sheet its language, the NFA by Thompson rule by rule, drawn as in the notes, its transition table,
// the DFA by subsets and the string tried on it. The method is El Santo Resumen's (lib/calculadoras/automatas.js).

// (a|b)*abb and aabb are the example of the apunte «5. Autómatas…». n . o | s . i, (n | o) . (s | i) and a|b*c come
// from «Precedencia y propiedades». L(L|D)* is the identifiers of Pascal of «Abreviaturas y definiciones regulares».
export const EJEMPLOS = [
  { nombre: '(a|b)*abb', er: '(a|b)*abb', cadena: 'aabb' },
  { nombre: 'n . o | s . i', er: 'n . o | s . i', cadena: 'si' },
  { nombre: '(n | o) . (s | i)', er: '(n | o) . (s | i)', cadena: 'ns' },
  { nombre: 'a|b*c', er: 'a|b*c', cadena: 'bbc' },
  { nombre: 'L(L|D)*', er: 'L(L|D)*', cadena: 'LDL' },
];

const INICIAL = { er: EJEMPLOS[0].er, cadena: EJEMPLOS[0].cadena };
const LINEAS = 30;

const TECLAS = [
  { texto: 'ε', nombre: 'épsilon' },
  { texto: '|', nombre: 'barra, o' },
  { texto: '.', nombre: 'punto, concatenación' },
  { texto: '*', nombre: 'estrella, cerradura' },
  { texto: '+', nombre: 'más, uno o más' },
  { texto: '?', nombre: 'pregunta, cero o uno' },
  { texto: '(', nombre: 'abre paréntesis' },
  { texto: ')', nombre: 'cierra paréntesis' },
];

const y = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} y ${xs.at(-1)}` : (xs[0] ?? ''));
const ver = (w) => w || 'ε';

const CX = 54;
const CY = 46;
const R = 14;
const IZQ = 46;
const M = 12;

/** An ε that goes around a closure: back over it, or the jump under it. */
function Vuelta({ x1, y1, x2, y2, yl, arriba, etiqueta, marca }) {
  const s = arriba ? -1 : 1;
  const [a, b, c, d] = [x1, y1 + s * R, x2, y2 + s * (R + 1.5)];
  return (
    <g className="trz-flecha" data-marca={marca || undefined}>
      <path d={`M${a},${b} C${a},${yl} ${c},${yl} ${c},${d}`} className="trz-flecha__linea" />
      <polygon points={punta(c, d, 0, -s)} className="trz-flecha__punta" />
      <text x={(a + c) / 2} y={(b + d) / 8 + (yl * 3) / 4 + (arriba ? -5 : 5)} dy="0.35em" textAnchor="middle" fontSize="14" className="trz-flecha__etiqueta">
        {etiqueta}
      </text>
    </g>
  );
}

/** The NFA as the notes draw it, up to the step k (all of it with k null). What step k adds goes in the focus ink. */
function DibujoAFN({ afn, k, etiqueta }) {
  const ancho = Math.round(IZQ + afn.w * CX + R + M);
  const alto = Math.round((afn.up + afn.down) * CY + 2 * M);
  const X = (x) => IZQ + x * CX;
  const Y = (v) => M + (v + afn.up) * CY;
  const ve = (p) => k === null || p <= k;
  const ahora = (p) => (k !== null && p === k ? 'ahora' : undefined);
  const x0 = X(0);
  const y0 = Y(0);
  return (
    <Dibujo ancho={ancho} alto={alto} etiqueta={etiqueta} minimo={1} maximo={1.2} className="thp-afn">
      <line x1={x0 - R - 30} y1={y0} x2={x0 - R - 8} y2={y0} className="trz-arista" />
      <polygon points={punta(x0 - R - 1.5, y0, 1, 0)} className="trz-flecha__punta" />
      {afn.aristas.map((a, j) => {
        if (!ve(a.paso)) return null;
        const p = afn.pos[a.de];
        const q = afn.pos[a.a];
        const curva = afn.curvas.get(j);
        const key = `${a.de}-${a.a}-${a.c}`;
        if (curva) return <Vuelta key={key} x1={X(p.x)} y1={Y(p.y)} x2={X(q.x)} y2={Y(q.y)} yl={Y(curva.nivel)} arriba={curva.arriba} etiqueta={a.c} marca={ahora(a.paso)} />;
        return <Flecha key={key} desde={{ x: X(p.x), y: Y(p.y) }} hasta={{ x: X(q.x), y: Y(q.y) }} r={R} etiqueta={a.c} marca={ahora(a.paso)} />;
      })}
      {afn.pos.map((p, s) =>
        ve(afn.pasoDe[s]) ? <Vertice key={s} x={X(p.x)} y={Y(p.y)} r={R} texto={s} final={s === afn.final} marca={ahora(afn.pasoDe[s])} /> : null,
      )}
    </Dibujo>
  );
}

/** Thompson rule by rule: the drawing grows with each one, and the rule says what it builds. */
function Construccion({ afn, er }) {
  const total = afn.pasos.length;
  const [k, setK] = useState(null);
  const paso = k === null ? null : afn.pasos[k];
  return (
    <>
      <div className="thp-controles" role="group" aria-label="La construcción, de a una regla">
        <button type="button" className="boton boton--secundario boton--chico" aria-disabled={k === 0} onClick={k === 0 ? undefined : () => setK(0)}>Desde el principio</button>
        <button type="button" className="boton boton--secundario boton--chico" aria-disabled={k === 0} onClick={k === 0 ? undefined : () => setK((x) => (x === null ? total - 1 : x - 1))}>Anterior</button>
        <button type="button" className="boton boton--chico" aria-disabled={k !== null && k >= total - 1} onClick={k !== null && k >= total - 1 ? undefined : () => setK((x) => (x === null ? 0 : x + 1))}>Siguiente</button>
        <button type="button" className="boton boton--secundario boton--chico" aria-disabled={k === null} onClick={k === null ? undefined : () => setK(null)}>El AFN entero</button>
      </div>
      <div className="thp-regla" aria-live="polite">
        {paso ? (
          <>
            <p className="thp-regla__titulo">{`Regla ${paso.regla}, para ${paso.para}.`}<span className="thp-regla__cuenta">{` Paso ${k + 1} de ${total}.`}</span></p>
            <p className="thp-regla__texto">{paso.texto}</p>
          </>
        ) : (
          <p className="thp-regla__texto">{`El AFN entero, con ${afn.n} estados, del 0 al ${afn.n - 1}. Inicio ${afn.inicio} y final ${afn.final}.`}</p>
        )}
      </div>
      <DibujoAFN afn={afn} k={k} etiqueta={`AFN de Thompson de ${er}, con ${afn.n} estados. Inicio ${afn.inicio} y final ${afn.final}.`} />
    </>
  );
}

function Lenguaje({ l, d }) {
  const lineas = [];
  if (l.infinito) lineas.push(`Es infinito, porque ${l.repite} es una cerradura que se puede repetir sin límite.`);
  else if (l.soloVacia) lineas.push('Es finito. Solo tiene la cadena vacía.');
  else lineas.push('Es finito, porque no tiene una cerradura que repita símbolos. Solo alternativas y concatenaciones.');
  lineas.push(l.conVacia ? 'ε está en el lenguaje.' : 'ε no está en el lenguaje.');
  const de = (g) => (g.mas ? `${g.palabras.map(ver).join(', ')} y más` : y(g.palabras.map(ver)));
  if (l.cortas) lineas.push(l.cortas.palabras.length === 1 ? `La palabra más corta es ${ver(l.cortas.palabras[0])}, de longitud ${l.cortas.largo}.` : `Las más cortas, de longitud ${l.cortas.largo}, son ${de(l.cortas)}.`);
  if (l.siguientes) lineas.push(`Las que siguen, de longitud ${l.siguientes.largo}, son ${de(l.siguientes)}.`);
  if (!d) lineas.push('El AFD pasa de 2000 estados. Las palabras no se calculan.');
  return (
    <>
      <div className="thp-lineas">
        {lineas.map((t) => (
          <p key={t}>{t}</p>
        ))}
      </div>
      {l.todas && <p className="calc-hoja__cuenta">{`L(r) = {${l.todas.map(ver).join(', ')}}`}</p>}
    </>
  );
}

function TablaAFN({ afn }) {
  const cols = [...afn.alfabeto, 'ε'];
  return (
    <Desborde etiqueta="Tabla de transiciones del AFN">
      <table className="tabla-pasos thp-tabla">
        <thead>
          <tr>
            <th scope="col">Estado</th>
            {cols.map((c) => (
              <th key={c} scope="col">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {afn.pos.map((_, s) => (
            <tr key={s}>
              <th scope="row">
                {s}
                {s === afn.inicio && <span className="thp-tabla__marca"> inicio</span>}
                {s === afn.final && <span className="thp-tabla__marca"> final</span>}
              </th>
              {cols.map((c) => {
                const t = afn.aristas.filter((a) => a.de === s && a.c === c).map((a) => a.a).sort((p, q) => p - q);
                return <td key={c} data-vacio={!t.length || undefined}>{t.length ? conj(t) : '∅'}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </Desborde>
  );
}

function Subconjuntos({ afn, d }) {
  if (!d) return <p>{'El AFD pasa de 2000 estados.'}</p>;
  if (d.estados.length > 26) return <p>{`El AFD tiene ${d.estados.length} estados y no entra en una tabla. El tope es 26.`}</p>;
  // Each calculation as in the notes: mueve on one line and its cerradura-ε on the next.
  const lineas = [{ clave: 'A', cierre: `${afn.inicio}`, T: d.estados[0].T, a: 0, nuevo: true }];
  d.cuentas.forEach((x) => lineas.push({ clave: `${letra(x.de)}${x.c}`, mueve: `mueve(${letra(x.de)}, ${x.c}) = ${x.vacio ? '∅' : conj(x.m)}`, cierre: x.vacio ? null : conj(x.m), T: x.T, a: x.a, nuevo: x.nuevo }));
  const resto = lineas.length - LINEAS;
  return (
    <>
      <ol className="thp-cuentas">
        {lineas.slice(0, LINEAS).map((l) => (
          <li key={l.clave} className="calc-hoja__cuenta">
            {l.mueve && <span className="thp-cuentas__renglon">{l.mueve}</span>}
            {l.cierre && (
              <span className="thp-cuentas__renglon">
                <span className="thp-cuentas__junto">{`cerradura-ε(${l.cierre})`}</span>
                {` = ${conj(l.T)} = `}
                <strong>{letra(l.a)}</strong>
                {l.nuevo ? '' : ', que ya estaba'}
              </span>
            )}
          </li>
        ))}
      </ol>
      {resto > 0 && <p className="calc-hoja__nota">{`Y ${resto} ${resto === 1 ? 'cálculo' : 'cálculos'} más, que están en la tabla.`}</p>}
      <Desborde etiqueta="Tabla del AFD">
        <table className="tabla-pasos thp-tabla">
          <thead>
            <tr>
              <th scope="col">AFD</th>
              <th scope="col">Estados del AFN</th>
              {afn.alfabeto.map((c) => (
                <th key={c} scope="col">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {d.estados.map((e, q) => (
              <tr key={letra(q)} data-final={e.final || undefined}>
                <th scope="row">
                  {letra(q)}
                  {e.final && <span className="thp-tabla__marca"> final</span>}
                </th>
                <td className="thp-tabla__conjunto">{conj(e.T)}</td>
                {afn.alfabeto.map((c) => (
                  <td key={c}>{e.trans[c] >= 0 ? letra(e.trans[c]) : '—'}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Desborde>
      <p className="calc-hoja__nota">{`Es final el conjunto que tiene al ${afn.final}. Con —, mueve da ∅ y no hay transición.`}</p>
    </>
  );
}

/** The string on the DFA: the states it goes through, each move with its symbol, and how it ends. */
function Prueba({ d, p }) {
  let fin;
  if (p.resultado === 'abortada') fin = p.fuera ? `${p.con} no está en el alfabeto de la expresión. No hay arista. La cadena queda abortada.` : `Desde ${letra(p.fin)} no hay arista con ${p.con}. La cadena queda abortada.`;
  else fin = `Termina en ${letra(p.fin)}, que ${p.resultado === 'aceptada' ? 'es final. La cadena es aceptada.' : 'no es final. La cadena no es aceptada.'}`;
  const nombre = (q) => `${letra(q)}${q === 0 ? ', inicio' : ''}`;
  return (
    <>
      <ol className="thp-camino" aria-label={`Recorrido de ${ver(p.w)} en el AFD`}>
        <li className="thp-camino__estado" data-final={d.estados[0].final || undefined} aria-label={nombre(0)}>A</li>
        {p.pasos.map((x, i) => (
          <li key={`${i}-${x.c}`} className="thp-camino__paso" aria-label={`con ${x.c}, a ${letra(x.a)}`}>
            <span className="thp-camino__con" aria-hidden="true">{x.c}</span>
            <span className="thp-camino__estado" data-final={d.estados[x.a].final || undefined} aria-hidden="true">{letra(x.a)}</span>
          </li>
        ))}
        {p.resultado === 'abortada' && (
          <li className="thp-camino__paso" data-corta aria-label={`con ${p.con}, no hay arista`}>
            <span className="thp-camino__con" aria-hidden="true">{p.con}</span>
            <span className="thp-camino__nada" aria-hidden="true">∅</span>
          </li>
        )}
      </ol>
      <p className="thp-veredicto" data-resultado={p.resultado}>{fin}</p>
    </>
  );
}

export default function Thompson() {
  const [estado, setEstado] = useRecordado('calc:thompson', INICIAL);
  const cambiar = (cambio) => setEstado((x) => ({ ...x, ...cambio }));
  const campoER = useRef(null);
  const r = useMemo(() => {
    try {
      return resolverER(estado.er);
    } catch (e) {
      return { error: e.message };
    }
  }, [estado.er]);
  const cadena = estado.cadena.replace(/\s+/g, '');
  const prueba = !r.error && r.d && cadena ? probar(r.afn, r.d, cadena) : null;

  let hoja = null;
  if (!r.error) {
    const { afn, d, lenguaje: l } = r;
    const er = estado.er.trim();
    const corta = l.cortas ? ver(l.cortas.palabras[0]) : null;
    hoja = (
      <Hoja>
        <Resultado dicho={`Lenguaje ${l.infinito ? 'infinito' : 'finito'}.${corta ? ` La palabra más corta es ${corta}.` : ''}`} nota={corta ? `La palabra más corta es ${corta}.` : undefined}>
          <span>Lenguaje</span>
          <span className="resaltado">{l.infinito ? 'infinito' : 'finito'}</span>
        </Resultado>
        <Pasos>
          <Paso titulo={`El lenguaje de ${er}`}>
            <Lenguaje l={l} d={d} />
          </Paso>
          <Paso titulo="El AFN de Thompson">
            <Construccion key={er} afn={afn} er={er} />
          </Paso>
          <Paso titulo="La tabla de transiciones del AFN">
            <TablaAFN afn={afn} />
          </Paso>
          <Paso titulo="El AFD por subconjuntos">
            <Subconjuntos afn={afn} d={d} />
          </Paso>
          {prueba && (
            <Paso titulo={`Probar ${ver(prueba.w)} en el AFD`}>
              <Prueba d={d} p={prueba} />
            </Paso>
          )}
        </Pasos>
      </Hoja>
    );
  }

  return (
    <>
      <section className="calc__ejercicio" aria-labelledby="ejercicio-titulo">
        <h2 id="ejercicio-titulo" className="calc__titulo">El ejercicio</h2>
        <div className="calc__campos">
          <Campo etiqueta="Expresión regular" ayuda="Con | . * + ? y paréntesis. Los símbolos son letras o dígitos." error={r.error}>
            <input ref={campoER} className="campo__control trz-escrito" type="text" autoComplete="off" autoCapitalize="none" spellCheck="false" maxLength={60} value={estado.er} onChange={(ev) => cambiar({ er: ev.target.value })} />
          </Campo>
          <Teclas teclas={TECLAS} campo={campoER} valor={estado.er} alCambiar={(er) => cambiar({ er })} etiqueta="Escribir un operador" />
          <Campo etiqueta="Cadena para probar" ayuda="Como aabb. La cadena vacía va como ε.">
            <input className="campo__control trz-escrito" type="text" autoComplete="off" autoCapitalize="none" spellCheck="false" maxLength={40} value={estado.cadena} onChange={(ev) => cambiar({ cadena: ev.target.value })} />
          </Campo>
        </div>
        <Ejemplos ejemplos={EJEMPLOS} alElegir={({ nombre: _n, ...ej }) => setEstado(ej)} />
      </section>
      {hoja}
    </>
  );
}
