import { Fragment, useMemo, useRef } from 'react';
import Campo from '../../Campo';
import { cuantos, leer, motor, pasosCierre, pasosClaves } from '../../../lib/calculadoras/dependencias';
import { useRecordado } from '../../../lib/calculadoras/memoria';
import { Desborde, Ejemplos, Hoja, Paso, Pasos, Resultado } from '../Hoja';
import { DiagramaDependencias } from './_log-dependencias';
import { SiNo, Teclas } from './_log-trazos';
import './claves.css';

// Candidate keys of Bases de Datos (parcial-1.md, «Claves y reglas de integridad» and the order of «Normalización»):
// the relation and its DF on the board, and on the sheet the dependency diagram, the closure of a set DF by DF and the
// search for the keys, from the smallest set. The method is El Santo Resumen's (lib/calculadoras/dependencias.js).

// From the quizzes of the 1° parcial of 25/09/2023 (ETAPAS) and 29/09/2025 (PRODUCTO), in preguntas.json of the notes.
export const EJEMPLOS = [
  {
    nombre: 'ETAPAS, parcial de 2023',
    relacion: 'ETAPAS(nroProyecto, nroEtapa, descProyecto, detalleEtapa)',
    df: 'nroProyecto, nroEtapa -> detalleEtapa\nnroProyecto -> descProyecto',
    conjunto: 'nroProyecto',
  },
  {
    nombre: 'PRODUCTO, parcial de 2025',
    relacion: 'PRODUCTO(idProducto, nombre, codCategoria, nombreCategoria)',
    df: 'idProducto -> nombre, codCategoria\ncodCategoria -> nombreCategoria',
    conjunto: 'codCategoria',
  },
];

const INICIAL = { relacion: EJEMPLOS[0].relacion, df: EJEMPLOS[0].df, conjunto: EJEMPLOS[0].conjunto };
const MOSTRAR = 10;
const TECLAS = [{ texto: '->', nombre: 'flecha', espacio: true }];

const y = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} y ${xs.at(-1)}` : (xs[0] ?? ''));

function nombreClaves(e, ks) {
  const t = ks.map((k) => e.det(k));
  return t.length > 6 ? `${t.slice(0, 5).join(', ')} y ${t.length - 5} más` : y(t);
}

/** The closure of the set written on the board, DF by DF, with what each one adds. */
function Cierre({ e, X, cx }) {
  const nombre = e.conj(X);
  let veredicto;
  if (!cx.superclave) veredicto = `No determina ${y(e.nombres(e.U & ~cx.c))}. No es superclave.`;
  else if (cx.candidata) veredicto = 'Determina todos los atributos y no le sobra ninguno. Es clave candidata.';
  else veredicto = `Determina todos los atributos. Es superclave, pero le sobra ${cx.sobra}. No es candidata.`;
  return (
    <Paso titulo={`El cierre de ${nombre}`}>
      <p className="calc-hoja__cuenta">{`Empezás con ${nombre}. Resaltado, lo que suma cada DF.`}</p>
      {cx.pasos.length > 0 && (
        <Desborde etiqueta={`El cierre de ${nombre}, DF por DF`}>
          <table className="tabla-pasos dep-tabla">
            <thead>
              <tr>
                <th scope="col">Por</th>
                <th scope="col">Queda</th>
              </tr>
            </thead>
            <tbody>
              {cx.pasos.map((p) => (
                <tr key={p.queda}>
                  <td>{e.df(p.d)}</td>
                  <td>
                    {'{'}
                    {e.nombres(p.queda).map((a, i) => (
                      <Fragment key={a}>
                        {i > 0 && ', '}
                        {(p.suma >> e.attrs.indexOf(a)) & 1 ? <span className="resaltado">{a}</span> : a}
                      </Fragment>
                    ))}
                    {'}'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Desborde>
      )}
      <p className="calc-hoja__cuenta">
        {`${cx.pasos.length ? 'Ninguna DF suma nada más.' : 'Ninguna DF suma nada.'} ${nombre}⁺ = `}
        <span className="resaltado">{e.conj(cx.c)}</span>
      </p>
      <p className="clv-veredicto">{veredicto}</p>
    </Paso>
  );
}

/** The order of the notes: who nobody determines, who only appears on the right, and the sets that are left. */
function Busqueda({ e, k }) {
  const lineas = [];
  const n = cuantos(k.nucleo);
  if (k.nucleo) lineas.push(`${y(e.nombres(k.nucleo))} no ${n > 1 ? 'están' : 'está'} a la derecha de ninguna DF. Nadie ${n > 1 ? 'los' : 'lo'} determina. ${n > 1 ? 'Van' : 'Va'} en toda clave.`);
  else lineas.push('Todos los atributos aparecen a la derecha de alguna DF. Ninguno va sí o sí en la clave.');
  if (k.soloDer) {
    const s = cuantos(k.soloDer);
    lineas.push(`${y(e.nombres(k.soloDer))} ${s > 1 ? 'aparecen' : 'aparece'} solo a la derecha. Ninguna clave ${s > 1 ? 'los' : 'lo'} necesita.`);
  }
  if (k.directa) lineas.push(`${e.conj(k.nucleo)}⁺ = ${e.conj(e.U)}. Determina todo. Es la única clave candidata.`);
  else if (k.nucleo) lineas.push(`${e.conj(k.nucleo)}⁺ = ${e.conj(e.cierre(k.nucleo))}. No alcanza. Le sumás los que están de los dos lados, ${e.conj(k.medio)}, de menos a más.`);
  else lineas.push(`Se prueban los que están de los dos lados, ${e.conj(k.medio)}, de menos a más.`);
  const resto = k.pruebas.length - MOSTRAR;
  return (
    <Paso titulo="Las claves candidatas">
      <div className="dep-lineas">
        {lineas.map((t) => (
          <p key={t}>{t}</p>
        ))}
      </div>
      {k.pruebas.length > 0 && (
        <Desborde etiqueta="Los conjuntos que se prueban">
          <table className="tabla-pasos dep-tabla">
            <thead>
              <tr>
                <th scope="col">Conjunto</th>
                <th scope="col">Su cierre</th>
                <th scope="col">Es clave</th>
              </tr>
            </thead>
            <tbody>
              {k.pruebas.slice(0, MOSTRAR).map((p) => (
                <tr key={p.m} data-clave={p.clave || undefined}>
                  <td>{e.conj(p.m)}</td>
                  <td>{p.clave ? 'todos los atributos' : e.conj(p.c)}</td>
                  <td>
                    <SiNo si={p.clave} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Desborde>
      )}
      {resto > 0 && <p className="calc-hoja__nota">{`Se prueban ${resto} ${resto === 1 ? 'conjunto' : 'conjuntos'} más. Los que contienen una clave ya encontrada se saltean.`}</p>}
    </Paso>
  );
}

export default function Claves() {
  const [estado, setEstado] = useRecordado('calc:claves', INICIAL);
  const cambiar = (cambio) => setEstado((x) => ({ ...x, ...cambio }));
  const campoDF = useRef(null);
  const r = useMemo(() => {
    const d = leer(estado.relacion, estado.df, estado.conjunto);
    if (d.error) return d;
    const e = motor(d.rel.attrs, d.dfs);
    const k = pasosClaves(e, d.dfs);
    return { ...d, e, k, cx: d.X ? pasosCierre(e, d.dfs, d.X) : null };
  }, [estado.relacion, estado.df, estado.conjunto]);
  const error = (campo) => (r.campo === campo ? r.error : null);

  let hoja = null;
  if (!r.error) {
    const { e, k, rel, dfs, X, cx } = r;
    const varias = k.ks.length > 1;
    const claves = nombreClaves(e, k.ks);
    const etiqueta = `Diagrama de dependencias de ${rel.nombre}. ${dfs.length ? dfs.map((d) => `${y(e.nombres(d.izq))} ${cuantos(d.izq) > 1 ? 'determinan' : 'determina'} ${y(e.nombres(d.der))}`).join('. ') : 'Sin dependencias'}.`;
    hoja = (
      <Hoja>
        <Resultado dicho={`${varias ? 'Las claves candidatas son' : 'La clave candidata es'} ${claves}.`} nota={`Cualquier conjunto que ${varias ? 'contenga una de ellas' : 'la contenga'} es superclave.`}>
          <span>{varias ? 'Las claves candidatas son' : 'La clave candidata es'}</span>
          <span className="resaltado">{claves}</span>
        </Resultado>
        <Pasos>
          <Paso titulo="El diagrama de dependencias">
            <DiagramaDependencias attrs={rel.attrs} dfs={dfs} clave={k.ks[0]} resaltar={cx ? cx.c : 0} etiqueta={etiqueta} />
            <p className="calc-hoja__nota">
              {`Subrayada, la clave ${e.det(k.ks[0])}.`}
              {cx && ` Resaltado, el cierre de ${e.conj(X)}.`}
            </p>
          </Paso>
          {cx && <Cierre e={e} X={X} cx={cx} />}
          <Busqueda e={e} k={k} />
          <Paso titulo="Atributos clave y no clave">
            <dl className="dato">
              <dt>Clave</dt>
              <dd>{y(e.nombres(k.primos))}</dd>
              <dt>No clave</dt>
              <dd>{k.noClave ? y(e.nombres(k.noClave)) : 'ninguno'}</dd>
            </dl>
          </Paso>
        </Pasos>
      </Hoja>
    );
  }

  return (
    <>
      <section className="calc__ejercicio" aria-labelledby="ejercicio-titulo">
        <h2 id="ejercicio-titulo" className="calc__titulo">El ejercicio</h2>
        <div className="calc__campos">
          <Campo etiqueta="Relación" ayuda="Como R(a, b, c)." error={error('relacion')}>
            <input className="campo__control trz-escrito" type="text" autoComplete="off" autoCapitalize="none" spellCheck="false" maxLength={300} value={estado.relacion} onChange={(ev) => cambiar({ relacion: ev.target.value })} />
          </Campo>
          <Campo etiqueta="Dependencias funcionales" ayuda="Una por renglón, como a, b -> c." error={error('df')}>
            <textarea ref={campoDF} className="campo__control trz-renglones trz-escrito" rows={3} autoComplete="off" autoCapitalize="none" spellCheck="false" maxLength={1200} value={estado.df} onChange={(ev) => cambiar({ df: ev.target.value })} />
          </Campo>
          <Teclas teclas={TECLAS} campo={campoDF} valor={estado.df} alCambiar={(df) => cambiar({ df })} etiqueta="Escribir en las dependencias" />
          <Campo etiqueta="Conjunto para su cierre" ayuda="Como a o a, b." error={error('conjunto')}>
            <input className="campo__control trz-escrito" type="text" autoComplete="off" autoCapitalize="none" spellCheck="false" maxLength={200} value={estado.conjunto} onChange={(ev) => cambiar({ conjunto: ev.target.value })} />
          </Campo>
        </div>
        <Ejemplos ejemplos={EJEMPLOS} alElegir={({ nombre: _n, ...ej }) => setEstado(ej)} />
      </section>
      {hoja}
    </>
  );
}
