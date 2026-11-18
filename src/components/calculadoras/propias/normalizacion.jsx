import { Fragment, useMemo, useRef } from 'react';
import Campo from '../../Campo';
import { bits, descomponer, formas, leer, motor, NIVEL, pasosClaves, pasosFormas } from '../../../lib/calculadoras/dependencias';
import { useRecordado } from '../../../lib/calculadoras/memoria';
import { Ejemplos, Hoja, Opciones, Paso, Pasos, Resultado } from '../Hoja';
import { DiagramaDependencias, LeyendaDependencias } from './_log-dependencias';
import { SiNo, Teclas } from './_log-trazos';
import './normalizacion.css';

// Normalization of Bases de Datos (parcial-1.md, «Normalización»): the relation and its DF on the board, and on the
// sheet the key, the diagram with the partial and transitive dependencies marked, form by form in the notes' order and
// the decomposition into 3FN, with each table written as the course does in «Lo que la cátedra corrige en el pasaje».
// The method is El Santo Resumen's (lib/calculadoras/dependencias.js).

// From the quizzes of the 1° parcial of 29/09/2025 (PRODUCTO) and 25/09/2023 (ETAPAS), in preguntas.json of the notes.
export const EJEMPLOS = [
  {
    nombre: 'PRODUCTO, parcial de 2025',
    relacion: 'PRODUCTO(idProducto, nombre, codCategoria, nombreCategoria)',
    df: 'idProducto -> nombre, codCategoria\ncodCategoria -> nombreCategoria',
    cp: '',
  },
  {
    nombre: 'ETAPAS, parcial de 2023',
    relacion: 'ETAPAS(nroProyecto, nroEtapa, descProyecto, detalleEtapa)',
    df: 'nroProyecto, nroEtapa -> detalleEtapa\nnroProyecto -> descProyecto',
    cp: '',
  },
];

const INICIAL = { relacion: EJEMPLOS[0].relacion, df: EJEMPLOS[0].df, cp: '' };
const FORMAS = ['1FN', '2FN', '3FN', 'FNBC'];
const TECLAS = [{ texto: '->', nombre: 'flecha', espacio: true }];

const y = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} y ${xs.at(-1)}` : (xs[0] ?? ''));

/** A table as the course writes it: its attributes with the CP first and underlined, the CP and each CF. */
function Tabla({ e, T }) {
  const enCp = new Set(T.claves);
  return (
    <div className="nor-tabla">
      <p className="nor-tabla__renglon">
        <strong>{T.nombre}</strong>
        {' ('}
        {T.orden.map((a, i) => (
          <Fragment key={a}>
            {i > 0 && ', '}
            {enCp.has(a) ? <u>{a}</u> : a}
          </Fragment>
        ))}
        {')'}
      </p>
      <p className="nor-tabla__renglon nor-tabla__renglon--dentro">{`CP (${T.claves.join(', ')})`}</p>
      {T.cfs.map((cf) => (
        <p key={cf.ref} className="nor-tabla__renglon nor-tabla__renglon--dentro">{`${e.lista(cf.attrs)} -> CF (${cf.ref})`}</p>
      ))}
    </div>
  );
}

export default function Normalizacion() {
  const [estado, setEstado] = useRecordado('calc:normalizacion', INICIAL);
  const cambiar = (cambio) => setEstado((x) => ({ ...x, ...cambio }));
  const campoDF = useRef(null);
  const r = useMemo(() => {
    const d = leer(estado.relacion, estado.df);
    if (d.error) return d;
    const e = motor(d.rel.attrs, d.dfs);
    const { ks } = pasosClaves(e, d.dfs);
    const cp = ks.find((k) => e.lista(k) === estado.cp) ?? ks[0];
    const f = formas(e, d.dfs, ks);
    return { ...d, e, ks, cp, f, lineas: pasosFormas(e, f, cp), desc: f.nivel < 3 ? descomponer(e, d.dfs, d.rel, cp, f) : null };
  }, [estado.relacion, estado.df, estado.cp]);
  const error = (campo) => (r.campo === campo ? r.error : null);

  let hoja = null;
  if (!r.error) {
    const { e, ks, cp, f, rel, dfs, lineas, desc } = r;
    const llega = FORMAS[f.nivel - 1];
    const etiqueta = `Diagrama de dependencias de ${rel.nombre}. ${dfs.length ? dfs.map((d, i) => `${y(e.nombres(d.izq))} ${bits(d.izq).length > 1 ? 'determinan' : 'determina'} ${y(e.nombres(d.der))}${f.tipo[i] ? `, ${f.tipo[i]}` : ''}`).join('. ') : 'Sin dependencias'}.`;
    // A foreign key outside the CP: the course asks to say whether it takes nulls.
    const sueltas = desc ? desc.tablas.flatMap((T) => T.cfs.filter((cf) => cf.attrs & ~T.cp).map((cf) => ({ T, cf }))) : [];
    const bc = desc ? desc.tablas.filter((T) => T.noBC) : [];
    hoja = (
      <Hoja>
        <Resultado dicho={NIVEL[f.nivel]} nota={f.nivel < 4 ? `No está en ${FORMAS[f.nivel]}.` : undefined}>
          <span>Está en</span>
          <span className="resaltado">{llega}</span>
        </Resultado>
        <Pasos>
          <Paso titulo="El diagrama de dependencias">
            <DiagramaDependencias attrs={rel.attrs} dfs={dfs} clave={cp} tipos={f.tipo} etiqueta={etiqueta} />
            <p className="calc-hoja__nota">{`Subrayada, la CP ${e.det(cp)}.`}</p>
            <LeyendaDependencias tipos={f.tipo} />
          </Paso>
          <Paso titulo="La clave">
            <p className="calc-hoja__cuenta">
              {`${ks.map((k) => `${e.conj(k)}⁺`).join(' y ')} ${ks.length > 1 ? 'tienen' : 'tiene'} todos los atributos.`}
            </p>
            <p>{ks.length > 1 ? `Son las claves candidatas. La CP es ${e.det(cp)}.` : `Es la clave. La CP es ${e.det(cp)}.`}</p>
            <dl className="dato">
              <dt>Clave</dt>
              <dd>{y(e.nombres(f.primos))}</dd>
              <dt>No clave</dt>
              <dd>{f.noClave ? y(e.nombres(f.noClave)) : 'ninguno'}</dd>
            </dl>
          </Paso>
          <Paso titulo="Forma por forma">
            <ul className="nor-formas">
              {lineas.map((l) => (
                <li key={l.forma} className="nor-forma">
                  <span className="nor-forma__nombre">{l.forma}</span>
                  <SiNo si={l.cumple} />
                  <span className="nor-forma__por">{l.texto}</span>
                </li>
              ))}
            </ul>
          </Paso>
          {desc && (
            <Paso titulo="Hasta 3FN">
              <ol className="nor-pasos">
                {desc.pasos.map((p) => (
                  <li key={p.texto}>
                    <span className="nor-pasos__df" data-tipo={p.tipo}>{p.df}</span>
                    {p.texto}
                  </li>
                ))}
              </ol>
              {desc.tablas.map((T) => (
                <Tabla key={T.nombre} e={e} T={T} />
              ))}
              {sueltas.map(({ T, cf }) => (
                <p key={`${T.nombre}-${cf.ref}`} className="calc-hoja__nota">{`En ${T.nombre}, ${e.lista(cf.attrs)} no está en la CP. Falta indicar si admite nulos, NN o NULL.`}</p>
              ))}
              <p>{bc.length ? bc.map((T) => `${T.nombre} queda en 3FN, pero no en FNBC, por ${e.df({ izq: T.noBC.X, der: T.noBC.A })}.`).join(' ') : 'Todas las tablas quedan en FNBC.'}</p>
              <p className="calc-hoja__nota">Las tablas nuevas salen como R1, R2. Poneles el nombre que corresponda.</p>
            </Paso>
          )}
        </Pasos>
      </Hoja>
    );
  }

  const opcionesCp = !r.error && r.ks.length > 1 ? r.ks.map((k) => ({ valor: r.e.lista(k), texto: r.e.det(k) })) : null;

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
          {opcionesCp && <Opciones leyenda="Clave primaria" nombre="cp" opciones={opcionesCp} valor={r.e.lista(r.cp)} alCambiar={(cp) => cambiar({ cp })} />}
        </div>
        <Ejemplos ejemplos={EJEMPLOS} alElegir={({ nombre: _n, ...ej }) => setEstado(ej)} />
      </section>
      {hoja}
    </>
  );
}
