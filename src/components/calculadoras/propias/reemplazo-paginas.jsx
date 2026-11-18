import { useMemo } from 'react';
import { ALGORITMOS, comparar, leerCadena, MAX_MARCOS, reemplazar, usaR } from '../../../lib/calculadoras/reemplazo';
import { useRecordado } from '../../../lib/calculadoras/memoria';
import { Desborde, Ejemplos, Hoja, Opciones, Paso, Pasos, Resultado } from '../Hoja';
import { Campo, Contador } from './_so-piezas';
import './reemplazo-paginas.css';

// Reemplazo de páginas of Sistemas Operativos: the reference string and the frames on the board, and on the sheet the
// practice's table (a column per reference, a row per frame, the faults marked), who leaves on each fault and why,
// and the faults of every algorithm with one frame more. Method and example: parcial.md of El Santo Resumen (practice of
// virtual memory, teoría 3a) and the parcial of 09/11/2022.

const ALGS = Object.entries(ALGORITMOS).map(([valor, texto]) => ({ valor, texto }));
const PARCIAL = '0 1 2 3 0 1 2 3 0 1 2 3 4 5 6 7';

export const EJEMPLOS = [
  { nombre: 'Parcial del 09/11/22', cadena: PARCIAL, marcos: 3, alg: 'lru' },
  { nombre: 'El mismo con OPT', cadena: PARCIAL, marcos: 3, alg: 'opt' },
  { nombre: 'El mismo con 4 marcos', cadena: PARCIAL, marcos: 4, alg: 'fifo' },
  { nombre: 'El mismo con reloj', cadena: PARCIAL, marcos: 3, alg: 'reloj' },
];

const INICIAL = { ...EJEMPLOS[0], nombre: undefined };

const REGLAS = {
  opt: 'Si varias no vuelven, se desempata con FIFO, como en la práctica.',
  seg: 'El bit R se pone en 1 al cargar y en cada referencia. Solo lo borra el algoritmo.',
  reloj: 'El bit R se pone en 1 al cargar y en cada referencia. Solo lo borra el algoritmo. La manecilla arranca en el marco 1.',
};

const lista = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs.at(-1)}`);
const coma = (x) => String(Math.round(x * 1000) / 1000).replace('.', ',');

/** How each algorithm picks who leaves, said once above the table. */
const CRITERIO = {
  fifo: 'Sale la que lleva más tiempo cargada.',
  lru: 'Sale la que hace más tiempo que no se usa.',
  opt: 'Sale la que más tarda en volver a usarse. Si varias no vuelven, la que entró antes.',
  seg: 'Se mira la más antigua. Si tiene R = 1, R pasa a 0 y va al final. La primera con R = 0 sale.',
  reloj: 'La manecilla mira su marco. Si tiene R = 1, R pasa a 0 y avanza. El primero con R = 0 se reemplaza.',
};

/** What the algorithm looked at on each fault: the columns after «Sale», and their cells. */
const DETALLE = {
  fifo: { cabeza: ['Entró en'], celdas: (p) => [`la ${p.motivo.cargada + 1}`] },
  lru: { cabeza: ['Último uso'], celdas: (p) => [`la ${p.motivo.usada + 1}`] },
  opt: {
    cabeza: ['Cuándo vuelve cada una'],
    celdas: (p) => {
      const vuelven = p.motivo.proximas.filter((x) => x.en !== Infinity).map((x) => `${x.pagina} en la ${x.en + 1}`);
      const nunca = p.motivo.proximas.filter((x) => x.en === Infinity).map((x) => x.pagina);
      if (nunca.length) vuelven.push(`${lista(nunca)} no ${nunca.length === 1 ? 'vuelve' : 'vuelven'}`);
      return [lista(vuelven)];
    },
  },
  seg: { cabeza: ['Con R = 1, al final'], celdas: (p) => [p.motivo.vueltas.length ? lista(p.motivo.vueltas) : 'ninguna'] },
  reloj: {
    cabeza: ['Manecilla en', 'R a 0 en', 'Queda en'],
    celdas: (p) => [`marco ${p.motivo.desde + 1}`, p.motivo.vueltas.length ? lista(p.motivo.vueltas.map((j) => j + 1)) : 'ninguno', `marco ${p.mano + 1}`],
  },
};

/** The practice's table: a column per reference, a row per frame, the page just loaded highlighted and F on a fault. */
function TablaMarcos({ refs, pasos, m, alg }) {
  const conR = usaR(alg);
  return (
    <Desborde etiqueta="La tabla de marcos">
      <table className="tabla-pasos rp-marcos">
        <caption className="solo-lectores">Los marcos después de cada referencia. La última fila marca los fallos.</caption>
        <thead>
          <tr>
            <th scope="col" className="so-izq">Referencia</th>
            {refs.map((p, k) => (
              <th key={k} scope="col" className="rp-marcos__ref">
                {p}
                <span className="solo-lectores">{`, referencia ${k + 1}`}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: m }, (_, j) => (
            <tr key={j}>
              <th scope="row" className="so-izq">{`Marco ${j + 1}`}</th>
              {pasos.map((p, k) => {
                const pagina = p.marcos[j];
                const nueva = p.fallo && p.donde === j;
                const mano = alg === 'reloj' && p.mano === j;
                return (
                  <td key={k} data-nueva={nueva || undefined} data-mano={mano || undefined}>
                    {pagina !== null && (
                      <>
                        {pagina}
                        {conR && <sup className="rp-bit">{p.R[j]}</sup>}
                        {conR && <span className="solo-lectores">{`, bit R en ${p.R[j]}`}</span>}
                        {nueva && <span className="solo-lectores">, recién cargada</span>}
                      </>
                    )}
                    {mano && <span className="solo-lectores">, acá queda la manecilla</span>}
                  </td>
                );
              })}
            </tr>
          ))}
          <tr className="rp-marcos__fallos">
            <th scope="row" className="so-izq">Fallo</th>
            {pasos.map((p, k) => (
              <td key={k}>{p.fallo ? <span className="rp-f">F</span> : <span className="solo-lectores">no</span>}</td>
            ))}
          </tr>
        </tbody>
      </table>
    </Desborde>
  );
}

function Resolucion({ refs, m, alg }) {
  const { pasos, fallos } = reemplazar(refs, m, alg);
  const salen = pasos.map((p, k) => ({ ...p, k })).filter((p) => p.sale !== null && p.sale !== undefined);
  const otros = comparar(refs, m);
  const tasa = `${fallos} / ${refs.length} = ${coma(fallos / refs.length)}`;
  const leyenda = ['F marca un fallo. Resaltada, la página que se acaba de cargar.'];
  if (usaR(alg)) leyenda.push('El número chico es el bit R.');
  if (alg === 'reloj') leyenda.push('La raya debajo marca dónde queda la manecilla.');
  return (
    <Hoja>
      <Resultado dicho={`${fallos} ${fallos === 1 ? 'fallo' : 'fallos'} de página en ${refs.length} referencias.`} nota={`tasa de fallos = ${tasa}`}>
        {`${fallos} ${fallos === 1 ? 'fallo' : 'fallos'} de página`}
      </Resultado>
      <Pasos>
        <Paso titulo={`La tabla, con ${m} ${m === 1 ? 'marco' : 'marcos'}`}>
          <TablaMarcos refs={refs} pasos={pasos} m={m} alg={alg} />
          <p className="calc-hoja__nota">{leyenda.join(' ')}</p>
        </Paso>
        {salen.length > 0 && (
          <Paso titulo="Quién sale en cada fallo">
            <p>{CRITERIO[alg]}</p>
            <Desborde etiqueta="Quién sale en cada fallo">
              <table className="tabla-pasos">
                <caption className="solo-lectores">En cada fallo con los marcos llenos, la página que entra, la que sale y lo que miró el algoritmo</caption>
                <thead>
                  <tr>
                    <th scope="col">Referencia</th>
                    <th scope="col">Entra</th>
                    <th scope="col">Sale</th>
                    {DETALLE[alg].cabeza.map((c) => (
                      <th key={c} scope="col" className="so-izq">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {salen.map((p) => (
                    <tr key={p.k}>
                      <th scope="row">{p.k + 1}</th>
                      <td>{p.pagina}</td>
                      <td className="rp-sale">{p.sale}</td>
                      {DETALLE[alg].celdas(p).map((c, i) => (
                        <td key={i} className="so-izq">{c}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Desborde>
          </Paso>
        )}
        <Paso titulo="Con la misma cadena, cada algoritmo">
          <Desborde etiqueta="Los fallos de cada algoritmo">
            <table className="tabla-pasos">
              <caption className="solo-lectores">Los fallos de cada algoritmo con la misma cadena</caption>
              <thead>
                <tr>
                  <th scope="col" className="so-izq">Algoritmo</th>
                  {otros.marcos.map((x) => (
                    <th key={x} scope="col">{`Con ${x} ${x === 1 ? 'marco' : 'marcos'}`}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {otros.filas.map((f) => (
                  <tr key={f.alg} data-elegido={f.alg === alg || undefined}>
                    <th scope="row" className="so-izq">
                      {ALGORITMOS[f.alg]}
                      {f.alg === alg && <span className="solo-lectores">, el elegido</span>}
                    </th>
                    {f.fallos.map((x, i) => (
                      <td key={i}>{x}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </Desborde>
        </Paso>
      </Pasos>
    </Hoja>
  );
}

export default function ReemplazoPaginas() {
  const [estado, setEstado] = useRecordado('calc:reemplazo-paginas', INICIAL);
  const { cadena, marcos, alg } = estado;
  const cambiar = (cambio) => setEstado((e) => ({ ...e, ...cambio }));
  const leida = useMemo(() => leerCadena(cadena), [cadena]);

  return (
    <>
      <section className="calc__ejercicio" aria-labelledby="ejercicio-titulo">
        <h2 id="ejercicio-titulo" className="calc__titulo">El ejercicio</h2>
        <div className="calc__campos">
          <div className="so-campo--largo">
            <Campo etiqueta="Cadena de referencias" valor={cadena} alCambiar={(c) => cambiar({ cadena: c })} error={leida.error} ayuda="Las páginas, separadas con espacios o comas." maxLength={400} />
          </div>
          <div className="rp-marcos-campo">
            <Contador etiqueta="marcos" menos="Un marco menos" mas="Un marco más" valor={marcos} max={MAX_MARCOS} alCambiar={(n) => cambiar({ marcos: n })} />
          </div>
          <Opciones leyenda="Algoritmo" nombre="algoritmo" opciones={ALGS} valor={alg} alCambiar={(a) => cambiar({ alg: a })} />
          {REGLAS[alg] && <p className="campo__ayuda">{REGLAS[alg]}</p>}
        </div>
        <Ejemplos ejemplos={EJEMPLOS} alElegir={({ nombre: _n, ...e }) => setEstado(e)} />
      </section>

      {leida.refs && <Resolucion refs={leida.refs} m={marcos} alg={alg} />}
    </>
  );
}
