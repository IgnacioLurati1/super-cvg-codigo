import { coma, leerLista, leerNumero } from '../../../lib/calculadoras/cifras';
import { useRecordado } from '../../../lib/calculadoras/memoria';
import { simularInventario } from '../../../lib/calculadoras/pruebaEscritorio';
import { Desborde, Ejemplos, Hoja, Opciones, Paso, Pasos } from '../Hoja';
import { Cuenta, Fichas, Frac } from './_est-cuentas';
import { Escalones, Grafico, Horizontal, Referencias } from './_est-dibujo';
import { Planilla, Relato } from './_est-planilla';
import { Dato, Datos, leerFilas, TablaTiza } from './_est-tiza';

// Inventario (s, S) of Simulación: the policy, the costs, the demand, the supplier and the random numbers on the
// board, and on the sheet how each U turns into a size or a time, the desk check event by event as a spreadsheet,
// I(t) in steps against s and S, and the monthly costs (folios 21 to 23, in El Santo Resumen simulacion/parcial.md).
// The costs, the demand and the supplier are the notes'. The notes don't give random numbers: these are the ones of
// El Santo Resumen's example.

const U_EJEMPLO = '0,84 0,97 0,1 0,7 0,24 0,07 0,36 0,54 0,19 0,42 0,61 0,69 0,17 0,19 0,61 0,89 0,05 0,52 0,92 0,21 0,4 0,03 0,69 0,07 0,58 0,33 0,76 0,12 0,45 0,88 0,27 0,64 0,09 0,81 0,36 0,53 0,95 0,18 0,72 0,41 0,66 0,04 0,29 0,86 0,15';
const APUNTE = {
  I0: '20',
  s: '20',
  S: '60',
  n: '2',
  K: '32',
  i: '3',
  h: '1',
  pi: '5',
  beta: '0,1',
  a: '0,5',
  b: '1',
  dec: '3',
  demanda: [
    { x: '1', p: '1/6' },
    { x: '2', p: '1/3' },
    { x: '3', p: '1/3' },
    { x: '4', p: '1/6' },
  ],
  U: U_EJEMPLO,
};
export const EJEMPLOS = [{ nombre: 'Los parámetros del apunte', datos: APUNTE }];

const DEMANDA = [
  { clave: 'x', titulo: 'Tamaño', dicho: 'Tamaño de la demanda', falta: 'el tamaño', modo: 'numeric' },
  { clave: 'p', titulo: 'Probabilidad', dicho: 'Probabilidad', falta: 'la probabilidad' },
];

const REDONDEO = [
  { valor: '2', texto: '2 decimales' },
  { valor: '3', texto: '3 decimales' },
  { valor: '4', texto: '4 decimales' },
  { valor: 'no', texto: 'Sin redondear' },
];

// Each field: its symbol, its name, its group, and what it accepts.
const CAMPOS = [
  { clave: 'I0', simbolo: 'I(0)', nombre: 'Nivel inicial', grupo: 'politica', entero: true, min: 0 },
  { clave: 's', simbolo: 's', nombre: 'Punto de pedido', grupo: 'politica', entero: true, min: 0 },
  { clave: 'S', simbolo: 'S', nombre: 'Nivel hasta el que se pide', grupo: 'politica', entero: true, min: 0 },
  { clave: 'n', simbolo: 'n', nombre: 'Meses de la corrida', grupo: 'politica', entero: true, min: 1 },
  { clave: 'K', simbolo: 'K', nombre: 'Costo fijo del pedido', grupo: 'costos', min: 0 },
  { clave: 'i', simbolo: 'i', nombre: 'Costo por unidad pedida', grupo: 'costos', min: 0 },
  { clave: 'h', simbolo: 'h', nombre: 'Mantenimiento por unidad y mes', grupo: 'costos', min: 0 },
  { clave: 'pi', simbolo: 'π', nombre: 'Faltante por unidad y mes', grupo: 'costos', min: 0 },
  { clave: 'beta', simbolo: 'β', nombre: 'Media entre demandas', grupo: 'demanda', positivo: true },
  { clave: 'a', simbolo: 'a', nombre: 'Demora mínima', grupo: 'proveedor', min: 0 },
  { clave: 'b', simbolo: 'b', nombre: 'Demora máxima', grupo: 'proveedor', min: 0 },
];

const f = (x) => coma(x, 4);

function leer(v) {
  const errores = {};
  const d = {};
  for (const c of CAMPOS) {
    const r = leerNumero(v[c.clave] ?? '');
    if (r.falta) errores[c.clave] = `Falta ${c.simbolo}.`;
    else if (r.mal) errores[c.clave] = `«${String(v[c.clave]).trim()}» no es un número.`;
    else if (c.entero && !Number.isInteger(r.valor)) errores[c.clave] = `${c.simbolo} tiene que ser un entero.`;
    else if (c.positivo && !(r.valor > 0)) errores[c.clave] = `${c.simbolo} tiene que ser mayor que 0.`;
    else if (c.min !== undefined && r.valor < c.min) errores[c.clave] = `${c.simbolo} tiene que ser ${c.min} o más.`;
    else d[c.clave] = r.valor;
  }
  if (!errores.s && !errores.S && d.s > d.S) errores.s = 's no puede pasar a S.';
  if (!errores.a && !errores.b && d.a > d.b) errores.b = 'b tiene que ser a o más.';
  if (!errores.n && d.n > 60) errores.n = 'Hasta 60 meses.';
  const filas = leerFilas(v.demanda ?? [], DEMANDA, { lugar: 'columna' });
  if (filas.error) errores.demanda = filas.error;
  else {
    const malo = filas.valores.findIndex((x) => !(Number.isInteger(x.x) && x.x > 0));
    const negativa = filas.valores.findIndex((x) => x.p < 0);
    const suma = filas.valores.reduce((t, x) => t + x.p, 0);
    if (malo >= 0) errores.demanda = { fila: malo, columna: 0, mensaje: `El tamaño de la columna ${malo + 1} tiene que ser un entero mayor que 0.` };
    else if (negativa >= 0) errores.demanda = { fila: negativa, columna: 1, mensaje: `La probabilidad de la columna ${negativa + 1} es negativa.` };
    else if (Math.abs(suma - 1) > 1e-6) errores.demanda = { mensaje: `Las probabilidades suman ${f(suma)} y no 1.` };
    else {
      d.tamanos = filas.valores.map((x) => x.x);
      d.probs = filas.valores.map((x) => x.p);
    }
  }
  const u = leerLista(v.U, 2000);
  if (u.error) errores.U = u.vacia ? 'Faltan los números al azar.' : u.error;
  else if (u.numeros.some((x) => !(x > 0 && x < 1))) errores.U = 'Van entre 0 y 1, sin incluirlos.';
  else d.U = u.numeros;
  d.dec = v.dec === 'no' ? null : Number(v.dec);
  return Object.keys(errores).length ? { errores } : { d };
}

const NOMBRE_EVENTO = { inicio: 'Inicio', pedido: 'Llegada del pedido', demanda: 'Demanda', fin: 'Fin', evaluacion: 'Evaluación' };

function Resolucion({ d }) {
  const { filas, fin, corte, usados, acum } = simularInventario(d);
  const n = d.n;
  const I = filas.map((x) => x.I);
  const lo = Math.min(0, ...I, d.s);
  const hi = Math.max(d.S, ...I);
  const T = filas.at(-1)?.reloj ?? n;
  const planilla = (
    <Planilla
      etiqueta="La prueba de escritorio"
      resumen="Cada evento con el reloj, los números al azar que usa, el estado, la lista de eventos y los contadores después de atenderlo"
      filas={filas}
      reloj={(x) => f(x.reloj)}
      evento={(x) => NOMBRE_EVENTO[x.evento]}
      grupos={[
        { titulo: 'Al azar', columnas: [{ titulo: 'U', valor: (x) => x.aleatorios.map((a) => `${a.nombre} = ${coma(a.u)}`).join('; ') }] },
        {
          titulo: 'Estado',
          columnas: [
            { titulo: 'I(t)', valor: (x) => f(x.I) },
            { titulo: 'En camino', valor: (x) => f(x.enCamino) },
          ],
        },
        {
          titulo: 'Lista de eventos',
          columnas: [
            { titulo: 'Pedido', valor: (x) => f(x.proxArribo) },
            { titulo: 'Demanda', valor: (x) => f(x.proxDemanda) },
            { titulo: 'Fin', valor: (x) => f(x.fin) },
            { titulo: 'Evaluación', valor: (x) => f(x.proxEval) },
          ],
        },
        {
          titulo: 'Contadores',
          columnas: [
            { titulo: 'Área I⁺', valor: (x) => f(x.areaMas) },
            { titulo: 'Área I⁻', valor: (x) => f(x.areaMenos) },
            { titulo: 'Costo de pedidos', valor: (x) => f(x.costo) },
          ],
        },
      ]}
    />
  );
  return (
    <Hoja>
      {fin ? (
        <Fichas
          fichas={[
            { nombre: 'Costo total promedio mensual', valor: f(fin.total), principal: true },
            { nombre: 'Pedido', valor: f(fin.pedido) },
            { nombre: 'Mantenimiento', valor: f(fin.mant) },
            { nombre: 'Faltante', valor: f(fin.falt) },
          ]}
          dicho={`En ${n} ${n === 1 ? 'mes' : 'meses'}, el costo total promedio mensual da ${f(fin.total)}.`}
        />
      ) : (
        <p className="calc-hoja__aviso" role="status">
          {corte === 'faltan-u' ? `Los ${d.U.length} números al azar no alcanzan para los ${n} ${n === 1 ? 'mes' : 'meses'}. Sumá más para terminar la corrida.` : 'La corrida tiene demasiados eventos para mostrarla. Probá con menos meses.'}
        </p>
      )}
      <Pasos>
        <Paso titulo="Cómo se usa cada número al azar">
          <p>{`El tiempo hasta la próxima demanda es −β·ln(U), con β = ${coma(d.beta)}. La demora del proveedor es a + U·(b − a).`}</p>
          <Desborde etiqueta="El tamaño de la demanda según U">
            <table className="tabla-pasos">
              <caption className="solo-lectores">Cada tamaño de la demanda con su probabilidad y el tramo de U que le toca</caption>
              <thead>
                <tr>
                  <th scope="col">Tamaño</th>
                  <th scope="col">Probabilidad</th>
                  <th scope="col">U en</th>
                </tr>
              </thead>
              <tbody>
                {d.tamanos.map((x, j) => (
                  <tr key={j}>
                    <th scope="row">{x}</th>
                    <td>{f(d.probs[j])}</td>
                    <td>{`[${f(j ? acum[j - 1] : 0)}; ${f(acum[j])})`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Desborde>
          <p>{`En cada demanda, el primer U da el tamaño y el segundo el tiempo a la próxima. ${fin ? `La corrida usa ${usados} de los ${d.U.length}.` : ''}`}</p>
        </Paso>
        <Paso titulo="La prueba de escritorio">
          {planilla}
          <p className="calc-hoja__nota">En gris, lo que sigue igual que en el evento anterior.</p>
          <Relato filas={filas} reloj={(x) => f(x.reloj)} />
        </Paso>
        <Paso titulo="I(t)">
          <Grafico
            etiqueta={`I(t), el nivel del inventario, de 0 a ${f(T)}, con s = ${d.s} y S = ${d.S} marcados.${fin ? ` El área de I⁺ es ${f(fin.areaMas)} y la de I⁻, ${f(fin.areaMenos)}.` : ''}`}
            alto={220}
            x={[0, Math.max(T, 1e-9)]}
            y={[lo - (hi - lo) * 0.08, hi + (hi - lo) * 0.12]}
            nombreX="t"
            nombreY="I(t)"
            formatoY={(v) => coma(v, 0)}
          >
            {(e) => (
              <>
                <Horizontal e={e} y={d.S} texto={`S = ${d.S}`} tono="suave" lado="izq" />
                <Horizontal e={e} y={d.s} texto={`s = ${d.s}`} tono="rojo" lado="izq" />
                <Escalones e={e} puntos={filas.map((x) => ({ t: x.reloj, v: x.I }))} />
              </>
            )}
          </Grafico>
          <Referencias
            items={[
              { texto: 'I⁺, lo que hay en el estante', tipo: 'mas' },
              { texto: 'I⁻, lo que se les debe a los clientes', tipo: 'menos' },
            ]}
          />
        </Paso>
        {fin && (
          <Paso titulo="Los costos">
            <Cuenta>
              pedido = <Frac arriba="costo de pedidos" abajo="n" /> = <Frac arriba={f(fin.costo)} abajo={n} /> = {f(fin.pedido)}
            </Cuenta>
            <Cuenta>
              mantenimiento = h·Ī⁺ = {coma(d.h)}·<Frac arriba={f(fin.areaMas)} abajo={n} /> = {f(fin.mant)}
            </Cuenta>
            <Cuenta>
              faltante = π·Ī⁻ = {coma(d.pi)}·<Frac arriba={f(fin.areaMenos)} abajo={n} /> = {f(fin.falt)}
            </Cuenta>
            <Cuenta>{`total = ${f(fin.pedido)} + ${f(fin.mant)} + ${f(fin.falt)} = ${f(fin.total)}`}</Cuenta>
          </Paso>
        )}
      </Pasos>
    </Hoja>
  );
}

export default function Inventario() {
  const [guardado, setEstado] = useRecordado('calc:inventario', APUNTE);
  const valores = { ...APUNTE, ...guardado };
  const cambiar = (cambio) => setEstado({ ...valores, ...cambio });
  const leido = leer(valores);
  const errores = leido.errores ?? {};
  const grupo = (g) =>
    CAMPOS.filter((c) => c.grupo === g).map((c) => (
      <Dato key={c.clave} nombre={c.nombre} simbolo={c.simbolo} valor={valores[c.clave] ?? ''} alCambiar={(t) => cambiar({ [c.clave]: t })} error={errores[c.clave]} modo={c.entero ? 'numeric' : 'decimal'} />
    ));
  return (
    <>
      <section className="calc__ejercicio" aria-labelledby="ejercicio-titulo">
        <h2 id="ejercicio-titulo" className="calc__titulo">El ejercicio</h2>
        <div className="calc__campos">
          <div className="ce-dos">
            <Datos titulo="La política">{grupo('politica')}</Datos>
            <Datos titulo="Los costos">{grupo('costos')}</Datos>
          </div>
          <div className="ce-dos">
            <div>
              <Datos titulo="La demanda">{grupo('demanda')}</Datos>
              <TablaTiza
                etiqueta="El tamaño de la demanda"
                columnas={DEMANDA}
                filas={valores.demanda}
                error={errores.demanda?.fila !== undefined ? errores.demanda : undefined}
                alCambiar={(demanda) => cambiar({ demanda })}
                vacia={{ x: '', p: '' }}
                horizontal
                nombreFilas="tamaños"
                singular="tamaño"
                articulo="Un"
                max={12}
              />
              {errores.demanda && (
                <p className="campo__error" role="alert">
                  {errores.demanda.mensaje}
                </p>
              )}
            </div>
            <Datos titulo="El proveedor">{grupo('proveedor')}</Datos>
          </div>
          <Dato nombre="Números al azar" simbolo="U" valor={valores.U} alCambiar={(U) => cambiar({ U })} error={errores.U} ancho area filas={3} modo="text" ayuda="Separados por espacios o punto y coma, en el orden en que se usan." />
          <Opciones leyenda="Redondeo de los tiempos" nombre="redondeo" opciones={REDONDEO} valor={valores.dec} alCambiar={(dec) => cambiar({ dec })} chica />
        </div>
        <Ejemplos ejemplos={EJEMPLOS} alElegir={(e) => setEstado(e.datos)} />
      </section>

      {leido.d && <Resolucion d={leido.d} />}
    </>
  );
}
