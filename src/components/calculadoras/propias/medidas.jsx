import { useMemo } from 'react';
import { coma, entreParentesis as par, porcentaje } from '../../../lib/calculadoras/cifras';
import { medidas } from '../../../lib/calculadoras/estadistica';
import { useRecordado } from '../../../lib/calculadoras/memoria';
import { Desborde, Ejemplos, Hoja, Paso, Pasos } from '../Hoja';
import { DatosMuestra, filasDe, leerMuestra, muestra } from './_est-datos';
import { Cuenta, Fichas, Frac, Raiz } from './_est-cuentas';

// Medidas de datos of Probabilidad y Estadística: the data on the board, one by one or as a frequency table, and on
// the sheet the hand made table (x, n, N, x·n, (x − x̄)²·n) and each measure as the notes define it: media, mediana
// (the two central ones averaged with an even n), moda, varianza muestral with n − 1, desvío, rango and coeficiente de
// variación (Tratamiento de datos, pág. 20 to 29, in El Santo Resumen probabilidad-y-estadistica/parcial-1.md).

// The notes' data: the terminal used during 50 days (pág. 11 and 12) and the 30 backups of the stem-and-leaf (pág. 13).
export const EJEMPLOS = [
  { nombre: 'La terminal, 50 días', datos: muestra({ forma: 'tabla', filas: filasDe([84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94], [2, 4, 3, 7, 10, 9, 5, 6, 3, 0, 1]) }) },
  { nombre: 'Los 30 backups', datos: muestra({ lista: '80 85 90 92 94 95 100 100 102 105 108 108 110 110 112 113 115 116 117 118 120 120 125 130 130 133 140 148 150 151' }) },
];

const f4 = (x) => coma(x, 4);
const LARGA = 25;

/** «el 25.° y el 26.°», «el 16.°». */
const lugares = (centro) => centro.map((p) => `el ${p}.°`).join(' y ');

function Tabla({ m }) {
  const mitad = new Set(m.centro.map((p) => m.filas.find((f) => f.N >= p)?.x));
  return (
    <Desborde etiqueta="La tabla de frecuencias">
      <table className="tabla-pasos">
        <caption className="solo-lectores">La tabla de x, n, N, x·n y (x − x̄)²·n, con la suma de cada columna</caption>
        <thead>
          <tr>
            <th scope="col">x</th>
            <th scope="col">n</th>
            <th scope="col">N</th>
            <th scope="col">x·n</th>
            <th scope="col">(x − x̄)²·n</th>
          </tr>
        </thead>
        <tbody>
          {m.filas.map((f) => (
            <tr key={f.x} className={mitad.has(f.x) ? 'ce-marcada' : undefined}>
              <th scope="row">{f4(f.x)}</th>
              <td>{f.n}</td>
              <td>{f.N}</td>
              <td>{f4(f.xn)}</td>
              <td>{f4(f.cuadrados)}</td>
            </tr>
          ))}
          <tr className="ce-suma">
            <th scope="row">Σ</th>
            <td>{m.n}</td>
            <td />
            <td>{f4(m.suma)}</td>
            <td>{f4(m.sumaCuadrados)}</td>
          </tr>
        </tbody>
      </table>
    </Desborde>
  );
}

function Resolucion({ datos, forma }) {
  const m = medidas(datos);
  const media = f4(m.media);
  const modas = m.modas.map(f4);
  const textoModa = !modas.length ? 'No hay' : modas.length === 1 ? modas[0] : `${modas.slice(0, -1).join(', ')} y ${modas.at(-1)}`;
  const vecesModa = `${m.maxFrec} ${m.maxFrec === 1 ? 'vez' : 'veces'}`;
  const verOrden = forma === 'sueltos' && m.n <= 120;
  const marcados = new Set(m.centro);
  return (
    <Hoja>
      <Fichas
        fichas={[
          { nombre: 'Media', valor: `x̄ = ${media}`, principal: true },
          { nombre: 'Mediana', valor: f4(m.mediana) },
          { nombre: 'Moda', valor: textoModa },
          { nombre: 'Varianza', valor: `s² = ${f4(m.s2)}` },
          { nombre: 'Desvío', valor: `s = ${f4(m.s)}` },
          { nombre: 'Rango', valor: f4(m.rango) },
          { nombre: 'Coef. de variación', valor: Number.isFinite(m.cv) ? porcentaje(m.cv) : 'No se calcula' },
        ]}
        dicho={`Son ${m.n} datos. La media da ${media}, la mediana ${f4(m.mediana)} y el desvío ${f4(m.s)}.`}
      />
      <Pasos>
        {verOrden && (
          <Paso titulo={`Los ${m.n} datos, en orden`}>
            <ol className="ce-orden" aria-label="Los datos de menor a mayor, con su lugar">
              {m.orden.map((x, i) => (
                <li key={i} data-marca={marcados.has(i + 1) || undefined}>
                  {f4(x)}
                  <small>{i + 1}</small>
                </li>
              ))}
            </ol>
            <p className="calc-hoja__nota">{m.centro.length === 2 ? `Los dos del medio, ${lugares(m.centro)}, están marcados.` : `El del medio, ${lugares(m.centro)}, está marcado.`}</p>
          </Paso>
        )}
        <Paso titulo="La tabla de frecuencias">
          {m.filas.length > LARGA ? (
            <details className="calc-hoja__mas">
              <summary>{`Ver las ${m.filas.length} filas`}</summary>
              <Tabla m={m} />
            </details>
          ) : (
            <Tabla m={m} />
          )}
          <p className="calc-hoja__nota">La fila marcada tiene a la mediana.</p>
        </Paso>
        <Paso titulo="La media">
          <Cuenta>
            x̄ = <Frac arriba="Σ xᵢ·nᵢ" abajo="n" /> = <Frac arriba={f4(m.suma)} abajo={m.n} /> = {media}
          </Cuenta>
        </Paso>
        <Paso titulo="La mediana">
          <p>{`Con n = ${m.n} ${m.n % 2 ? 'impar, es el dato del medio' : 'par, se promedian los dos del medio'}, ${lugares(m.centro)}.`}</p>
          <Cuenta>
            {m.centro.length === 2 ? (
              <>
                x̃ = <Frac arriba={`${f4(m.orden[m.centro[0] - 1])} + ${f4(m.orden[m.centro[1] - 1])}`} abajo="2" /> = {f4(m.mediana)}
              </>
            ) : (
              `x̃ = ${f4(m.mediana)}`
            )}
          </Cuenta>
        </Paso>
        <Paso titulo="La moda">
          <p>{!modas.length ? `No hay moda. Cada valor aparece ${vecesModa}.` : modas.length === 1 ? `x̂ = ${modas[0]}, que aparece ${vecesModa}.` : `Hay ${modas.length}: ${textoModa}, que aparecen ${vecesModa} cada uno.`}</p>
        </Paso>
        <Paso titulo="La varianza y el desvío">
          <Cuenta>
            s² = <Frac arriba="Σ (xᵢ − x̄)²·nᵢ" abajo="n − 1" /> = <Frac arriba={f4(m.sumaCuadrados)} abajo={m.n - 1} /> = {f4(m.s2)}
          </Cuenta>
          <Cuenta>
            s = <Raiz>{f4(m.s2)}</Raiz> = {f4(m.s)}
          </Cuenta>
        </Paso>
        <Paso titulo="El rango">
          <Cuenta>
            r = x<sub>M</sub> − x<sub>m</sub> = {f4(m.max)} − {par(m.min)} = {f4(m.rango)}
          </Cuenta>
        </Paso>
        <Paso titulo="El coeficiente de variación">
          {Number.isFinite(m.cv) ? (
            <Cuenta>
              cv = <Frac arriba="s" abajo="x̄" /> = <Frac arriba={f4(m.s)} abajo={media} /> = {f4(m.cv)}, o sea {porcentaje(m.cv)}
            </Cuenta>
          ) : (
            <p>Con media 0 no se calcula.</p>
          )}
        </Paso>
      </Pasos>
    </Hoja>
  );
}

export default function Medidas() {
  const [estado, setEstado] = useRecordado('calc:medidas', EJEMPLOS[0].datos);
  const leida = useMemo(() => leerMuestra(estado), [estado]);
  return (
    <>
      <section className="calc__ejercicio" aria-labelledby="ejercicio-titulo">
        <h2 id="ejercicio-titulo" className="calc__titulo">El ejercicio</h2>
        <div className="calc__campos">
          <DatosMuestra valor={estado} alCambiar={setEstado} leida={leida} />
        </div>
        <Ejemplos ejemplos={EJEMPLOS} alElegir={({ datos }) => setEstado(datos)} />
      </section>

      {leida.datos && <Resolucion datos={leida.datos} forma={estado.forma} />}
    </>
  );
}
