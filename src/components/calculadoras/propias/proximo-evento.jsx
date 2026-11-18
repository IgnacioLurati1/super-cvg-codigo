import { coma, leerLista, leerNumero } from '../../../lib/calculadoras/cifras';
import { useRecordado } from '../../../lib/calculadoras/memoria';
import { simularCola } from '../../../lib/calculadoras/pruebaEscritorio';
import { Ejemplos, Hoja, Paso, Pasos } from '../Hoja';
import { Cuenta, Fichas, Frac } from './_est-cuentas';
import { Escalones, Grafico } from './_est-dibujo';
import { Planilla, Relato } from './_est-planilla';
import { Dato, Datos } from './_est-tiza';

// Cola simple of Simulación: the times between arrivals, the service times and the n delays that end the run on the
// board, and on the sheet the desk check event by event as the notes' spreadsheet (Fig. 1.7, folios 7 to 13), Q(t)
// and B(t) in steps, and d̂(n), q̂(n) and û(n) with their sums. The data of the notes, as El Santo Resumen runs them
// (simulacion/parcial.md).

const APUNTE = { A: '0,4 1,2 0,5 1,7 0,2 1,6 0,2 1,4 1,9', S: '2 0,7 0,2 1,1 3,7 0,6', n: '6' };
export const EJEMPLOS = [{ nombre: 'Los datos del apunte', datos: APUNTE }];

const f = (x) => coma(x, 4);

function leer(v) {
  const errores = {};
  const nn = leerNumero(v.n);
  let n;
  if (nn.falta) errores.n = 'Falta n.';
  else if (nn.mal || !Number.isInteger(nn.valor) || nn.valor < 1) errores.n = 'n tiene que ser un entero, 1 o más.';
  else n = nn.valor;
  const lista = (clave, positivo, nombre) => {
    const r = leerLista(v[clave], 300);
    if (r.error) {
      errores[clave] = r.vacia ? `Faltan los ${nombre}.` : r.error;
      return null;
    }
    if (r.numeros.some((x) => (positivo ? !(x > 0) : x < 0))) {
      errores[clave] = positivo ? 'Los tiempos de servicio tienen que ser mayores que 0.' : 'Los tiempos entre arribos no pueden ser negativos.';
      return null;
    }
    if (n && r.numeros.length < n) {
      errores[clave] = `Con n = ${n} hacen falta por lo menos ${n} ${nombre}.`;
      return null;
    }
    return r.numeros;
  };
  const A = lista('A', false, 'tiempos entre arribos');
  const S = lista('S', true, 'tiempos de servicio');
  return Object.keys(errores).length ? { errores } : { d: { A, S, n } };
}

const evento = (fila) => (fila.evento === 'inicio' ? 'Inicio' : `${fila.evento === 'arribo' ? 'Arribo' : 'Partida'} del ${fila.cliente}`);

function Resolucion({ d }) {
  const { filas, fin } = simularCola(d);
  const maxQ = Math.max(1, ...filas.map((x) => x.Q));
  const escalonesQ = filas.map((x) => ({ t: x.reloj, v: x.Q }));
  const escalonesB = filas.map((x) => ({ t: x.reloj, v: x.B }));
  const n = d.n;
  return (
    <Hoja>
      <Fichas
        fichas={[
          { nombre: 'Demora promedio en cola', valor: `d̂(${n}) = ${f(fin.d)}`, principal: true },
          { nombre: 'Número promedio en cola', valor: `q̂(${n}) = ${f(fin.q)}` },
          { nombre: 'Utilización del servidor', valor: `û(${n}) = ${f(fin.u)}` },
        ]}
        dicho={`La corrida termina en ${f(fin.T)}. La demora promedio da ${f(fin.d)}, el número promedio en cola ${f(fin.q)} y la utilización ${f(fin.u)}.`}
      />
      <Pasos>
        <Paso titulo="La prueba de escritorio">
          <Planilla
            etiqueta="La prueba de escritorio"
            resumen="Cada evento con el reloj, el estado del sistema, la lista de eventos y los contadores después de atenderlo"
            filas={filas}
            reloj={(x) => f(x.reloj)}
            evento={evento}
            grupos={[
              {
                titulo: 'Estado del sistema',
                columnas: [
                  { titulo: 'B(t)', valor: (x) => String(x.B) },
                  { titulo: 'Q(t)', valor: (x) => String(x.Q) },
                  { titulo: 'Llegadas en cola', valor: (x) => x.cola.map(f).join('; ') },
                ],
              },
              {
                titulo: 'Lista de eventos',
                columnas: [
                  { titulo: 'Arribo', valor: (x) => f(x.proxArribo) },
                  { titulo: 'Partida', valor: (x) => f(x.proxPartida) },
                ],
              },
              {
                titulo: 'Contadores',
                columnas: [
                  { titulo: 'Demorados', valor: (x) => String(x.demorados) },
                  { titulo: 'Demora total', valor: (x) => f(x.demoraTotal) },
                  { titulo: 'Área Q(t)', valor: (x) => f(x.areaQ) },
                  { titulo: 'Área B(t)', valor: (x) => f(x.areaB) },
                ],
              },
            ]}
          />
          <p className="calc-hoja__nota">En gris, lo que sigue igual que en el evento anterior.</p>
          <Relato filas={filas} reloj={(x) => f(x.reloj)} />
        </Paso>
        <Paso titulo="Q(t) y B(t)">
          <Grafico
            etiqueta={`Q(t), la cantidad en cola, de 0 a ${f(fin.T)}. Llega hasta ${maxQ} y su área es ${f(fin.areaQ)}.`}
            alto={170}
            x={[0, fin.T]}
            y={[0, maxQ + 0.4]}
            nombreX="t"
            nombreY="Q(t)"
            marcasY={Array.from({ length: maxQ + 1 }, (_, k) => k)}
          >
            {(e) => <Escalones e={e} puntos={escalonesQ} />}
          </Grafico>
          <Grafico etiqueta={`B(t), 1 con el servidor ocupado y 0 libre, de 0 a ${f(fin.T)}. Su área es ${f(fin.areaB)}.`} alto={130} x={[0, fin.T]} y={[0, 1.3]} nombreX="t" nombreY="B(t)" marcasY={[0, 1]}>
            {(e) => <Escalones e={e} puntos={escalonesB} />}
          </Grafico>
          <p className="calc-hoja__nota">Las áreas sombreadas son las que suman los contadores.</p>
        </Paso>
        <Paso titulo="Las estimaciones">
          <Cuenta>
            d̂({n}) ={' '}
            <Frac
              arriba={
                <>
                  Σ D<sub>i</sub>
                </>
              }
              abajo="n"
            />{' '}
            = <Frac arriba={f(fin.demoraTotal)} abajo={n} /> = {f(fin.d)}
          </Cuenta>
          <Cuenta>
            q̂({n}) = <Frac arriba="área de Q(t)" abajo={`T(${n})`} /> = <Frac arriba={f(fin.areaQ)} abajo={f(fin.T)} /> = {f(fin.q)}
          </Cuenta>
          <Cuenta>
            û({n}) = <Frac arriba="área de B(t)" abajo={`T(${n})`} /> = <Frac arriba={f(fin.areaB)} abajo={f(fin.T)} /> = {f(fin.u)}
          </Cuenta>
          <p>{`T(${n}) = ${f(fin.T)} es lo que tarda la corrida.`}</p>
        </Paso>
      </Pasos>
    </Hoja>
  );
}

export default function ProximoEvento() {
  const [guardado, setEstado] = useRecordado('calc:proximo-evento', APUNTE);
  const valores = { ...APUNTE, ...guardado };
  const cambiar = (cambio) => setEstado({ ...valores, ...cambio });
  const leido = leer(valores);
  const errores = leido.errores ?? {};
  return (
    <>
      <section className="calc__ejercicio" aria-labelledby="ejercicio-titulo">
        <h2 id="ejercicio-titulo" className="calc__titulo">El ejercicio</h2>
        <div className="calc__campos">
          <div className="ce-dos">
            <Dato nombre="Tiempos entre arribos" simbolo="A" valor={valores.A} alCambiar={(A) => cambiar({ A })} error={errores.A} ancho area filas={2} modo="text" ayuda="A₁ es la hora del primer arribo." />
            <Dato nombre="Tiempos de servicio" simbolo="S" valor={valores.S} alCambiar={(S) => cambiar({ S })} error={errores.S} ancho area filas={2} modo="text" ayuda="En el orden en que entran a servicio." />
          </div>
          <Datos>
            <Dato nombre="Demoras que cierran la corrida" simbolo="n" valor={valores.n} alCambiar={(n) => cambiar({ n })} error={errores.n} modo="numeric" />
          </Datos>
          <p className="campo__ayuda">Separados por espacios o punto y coma. Se puede escribir 0,4 o .4.</p>
        </div>
        <Ejemplos ejemplos={EJEMPLOS} alElegir={(e) => setEstado(e.datos)} />
      </section>

      {leido.d && <Resolucion d={leido.d} />}
    </>
  );
}
