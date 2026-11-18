import { useLayoutEffect, useMemo, useRef } from 'react';
import { buscar, desordenado, leerArreglo, leerDato } from '../../../lib/calculadoras/dicotomica';
import { useRecordado } from '../../../lib/calculadoras/memoria';
import { Desborde, Ejemplos, Hoja, Opciones, Paso, Pasos, Resultado } from '../Hoja';
import { Campo, Cuenta } from './_so-piezas';
import './dicotomica.css';

// Búsqueda dicotómica of Algoritmos y Estructuras de Datos: the sorted array and the datum on the board, and on the
// sheet one turn of the loop per step, with the array drawn in the squares of the notebook (what is discarded crossed
// out, the middle highlighted) and the count of medio, comienzo and fin. Method and the example of 15 numbers:
// parcial-2.md of El Santo Resumen («resumen arreglos», page 1). The names are the exam of Idiomas.

const BASES = [
  { valor: '0', texto: '0' },
  { valor: '1', texto: '1' },
];

const QUINCE = '3, 7, 12, 18, 21, 25, 30, 34, 41, 47, 52, 58, 63, 70, 76';

export const EJEMPLOS = [
  { nombre: 'El 47 del apunte', arreglo: QUINCE, dato: '47', base: '0' },
  { nombre: 'Uno que no está', arreglo: QUINCE, dato: '50', base: '0' },
  { nombre: 'Desde la posición 1', arreglo: QUINCE, dato: '47', base: '1' },
  { nombre: 'Por nombre', arreglo: 'Alemán, Español, Francés, Inglés, Italiano, Portugués', dato: 'Inglés', base: '0' },
];

const INICIAL = { ...EJEMPLOS[0], nombre: undefined };

const mostrar = (x) => (typeof x === 'number' ? String(x).replace('.', ',').replace('-', '−') : x);

/** The array in the squares: the position above, what is out of comienzo and fin crossed out, the middle highlighted. */
function Arreglo({ v, base, paso, vuelta }) {
  const { comienzo, fin, medio } = paso;
  const caja = useRef(null);
  const foco = medio ?? Math.min(comienzo, v.length - 1 + base);
  // On a phone the array is wider than the sheet: it opens with the middle (or where it ran out) in view.
  useLayoutEffect(() => {
    const celda = caja.current?.querySelector('[data-foco]');
    const marco = caja.current?.closest('.calc-hoja__desborde');
    if (!celda || !marco || marco.scrollWidth <= marco.clientWidth) return;
    const a = marco.getBoundingClientRect();
    const c = celda.getBoundingClientRect();
    marco.scrollLeft += c.left - a.left - (a.width - c.width) / 2;
  }, [foco, v]);
  const dicho = medio === null ? `Vuelta ${vuelta}. No queda ninguna posición.` : `Vuelta ${vuelta}. Quedan de la posición ${comienzo} a la ${fin}. El medio es la ${medio}, con ${mostrar(paso.valor)}.`;
  return (
    <Desborde etiqueta={`El arreglo en la vuelta ${vuelta}`}>
      <div ref={caja} className="dc-arreglo" role="img" aria-label={dicho}>
        {v.map((x, k) => {
          const i = k + base;
          const afuera = i < comienzo || i > fin;
          return (
            <span key={i} className="dc-celda" data-afuera={afuera || undefined} data-medio={i === medio || undefined} data-foco={i === foco || undefined}>
              <span className="dc-celda__i">{i}</span>
              <span className="dc-celda__v">{mostrar(x)}</span>
            </span>
          );
        })}
      </div>
    </Desborde>
  );
}

function Vuelta({ v, base, paso, vuelta, dato, numeros }) {
  const { comienzo, fin, medio, valor, sigue } = paso;
  const d = mostrar(dato);
  const w = mostrar(valor);
  const comparacion = numeros ? `${d} es ${sigue} que ${w}.` : `${d} va ${sigue === 'menor' ? 'antes' : 'después'} de ${w}.`;
  return (
    <Paso titulo={`Vuelta ${vuelta}`}>
      <Arreglo v={v} base={base} paso={paso} vuelta={vuelta} />
      <Cuenta>{`medio = (${comienzo} + ${fin}) DIV 2 = ${medio}`}</Cuenta>
      <Cuenta>{`V[${medio}] = ${w}`}</Cuenta>
      {sigue === 'encontrado' ? (
        <p>{`Es el dato. Está en la posición ${medio}.`}</p>
      ) : (
        <>
          <p>{`${comparacion} Se descarta la mitad de la ${sigue === 'menor' ? 'derecha' : 'izquierda'}.`}</p>
          <Cuenta>{sigue === 'menor' ? `fin = ${medio} − 1 = ${medio - 1}` : `comienzo = ${medio} + 1 = ${medio + 1}`}</Cuenta>
        </>
      )}
    </Paso>
  );
}

function Resolucion({ v, numeros, dato, base }) {
  const b = buscar(v, dato, base);
  const ultimo = b.pasos[b.pasos.length - 1];
  const vueltas = `${b.comparaciones} ${b.comparaciones === 1 ? 'vuelta' : 'vueltas'}.`;
  const secuencial = b.posicion < 0 ? `La secuencial mira ${v.length === 1 ? 'la única' : `las ${v.length}`}.` : `La secuencial mira ${b.posicion - base + 1} ${b.posicion - base ? 'posiciones' : 'posición'}.`;
  const nota = `${vueltas} ${secuencial}`;
  return (
    <Hoja>
      <Resultado dicho={b.posicion < 0 ? `−1. ${mostrar(dato)} no está. ${nota}` : `Posición ${b.posicion}. ${nota}`} nota={nota}>
        {b.posicion < 0 ? '−1, no está' : `posición ${b.posicion}`}
      </Resultado>
      <Pasos>
        {b.pasos.map((paso, k) =>
          paso.sigue === 'no-esta' ? (
            <Paso key={k} titulo="No quedan posiciones">
              <Arreglo v={v} base={base} paso={paso} vuelta={k + 1} />
              <Cuenta>{`comienzo = ${ultimo.comienzo} > fin = ${ultimo.fin}`}</Cuenta>
              <p>La función devuelve −1.</p>
            </Paso>
          ) : (
            <Vuelta key={k} v={v} base={base} paso={paso} vuelta={k + 1} dato={dato} numeros={numeros} />
          ),
        )}
      </Pasos>
    </Hoja>
  );
}

export default function Dicotomica() {
  const [estado, setEstado] = useRecordado('calc:dicotomica', INICIAL);
  const { arreglo, dato, base } = estado;
  const cambiar = (cambio) => setEstado((e) => ({ ...e, ...cambio }));
  const leido = useMemo(() => {
    const a = leerArreglo(arreglo);
    if (a.error) return { en: 'arreglo', error: a.error };
    const k = desordenado(a.v);
    if (k >= 0) return { en: 'arreglo', error: `No está ordenado. ${mostrar(a.v[k])} está antes que ${mostrar(a.v[k + 1])}.` };
    const d = leerDato(dato, a.numeros);
    if (d.error) return { en: 'dato', error: d.error };
    return { ...a, dato: d.dato };
  }, [arreglo, dato]);
  const error = (en) => (leido.en === en ? leido.error : null);

  return (
    <>
      <section className="calc__ejercicio" aria-labelledby="ejercicio-titulo">
        <h2 id="ejercicio-titulo" className="calc__titulo">El ejercicio</h2>
        <div className="calc__campos">
          <Campo etiqueta="El arreglo" valor={arreglo} alCambiar={(x) => cambiar({ arreglo: x })} error={error('arreglo')} ayuda="De menor a mayor. Números o nombres, separados con comas." ancho="34rem" maxLength={800} />
          <div className="so-campos">
            <Campo etiqueta="El dato" valor={dato} alCambiar={(x) => cambiar({ dato: x })} error={error('dato')} corto maxLength={40} />
            <Opciones leyenda="La primera posición" nombre="base" opciones={BASES} valor={base} alCambiar={(x) => cambiar({ base: x })} chica />
          </div>
        </div>
        <Ejemplos ejemplos={EJEMPLOS} alElegir={({ nombre: _n, ...e }) => setEstado(e)} />
      </section>

      {!leido.error && <Resolucion v={leido.v} numeros={leido.numeros} dato={leido.dato} base={Number(base)} />}
    </>
  );
}
