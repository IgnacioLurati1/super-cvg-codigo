import { useId, useState } from 'react';
import { conCortes } from '../conCortes';
import { decidir, nombreDe } from './edicion';
import { tipoLimpio, tipoParecido } from '../../../lib/laboratorio/der/modelo';
import { tablasEnTexto } from '../../../lib/laboratorio/der/pasaje';
import { tipoDe } from '../../../lib/laboratorio/der/sql';

// «Pasar a tablas»: the tables of the DER in the course's format, what only the student can decide (the CP of an N a M
// or ternary with attributes, the side of a 1 a 1: nothing chosen beforehand), the type of each column for the SQL
// and what the course would mark in the drawing.

const TIPOS = ['INT', 'INT AUTO_INCREMENT', 'VARCHAR(100)', 'VARCHAR(255)', 'CHAR(10)', 'TEXT', 'DATE', 'DATETIME', 'TIME', 'DECIMAL(10,2)', 'BOOLEAN'];

function DecidirCp({ p, der, aplicar }) {
  const id = useId();
  const [elegidas, setElegidas] = useState([]);
  return (
    <form
      className="der-decision"
      onSubmit={(e) => {
        e.preventDefault();
        if (elegidas.length) aplicar(decidir(der, 'cp', p.vinculo, p.opciones.filter((c) => elegidas.includes(c))));
      }}
    >
      <fieldset aria-describedby={`${id}-ayuda`}>
        <legend>{`CP de ${p.tabla}`}</legend>
        <p id={`${id}-ayuda`} className="der-nota">{p.texto}</p>
        <ul className="der-opciones">
          {p.opciones.map((c) => (
            <li key={c}>
              <label className="der-marca">
                <input type="checkbox" checked={elegidas.includes(c)} onChange={(e) => setElegidas(e.target.checked ? [...elegidas, c] : elegidas.filter((x) => x !== c))} />
                {c}
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      <button type="submit" className="boton boton--chico" aria-disabled={elegidas.length ? undefined : 'true'}>Usar esta CP</button>
    </form>
  );
}

function DecidirLado({ p, der, aplicar }) {
  const id = useId();
  const [lado, setLado] = useState(null);
  const v = der.vinculos.find((x) => x.id === p.vinculo);
  const lados = p.opciones.filter((o, i) => p.opciones.findIndex((x) => x.id === o.id) === i);
  return (
    <form
      className="der-decision"
      onSubmit={(e) => {
        e.preventDefault();
        if (lado) aplicar(decidir(der, 'lado11', p.vinculo, lado));
      }}
    >
      <fieldset aria-describedby={`${id}-ayuda`}>
        <legend>{`Lado de ${v?.nombre || 'el vínculo 1 a 1'}`}</legend>
        <p id={`${id}-ayuda`} className="der-nota">{p.texto}</p>
        <ul className="der-opciones">
          {lados.map((o) => (
            <li key={o.id}>
              <label className="der-marca">
                <input type="radio" name={`${id}-lado`} checked={lado === o.id} onChange={() => setLado(o.id)} />
                {o.nombre}
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      <button type="submit" className="boton boton--chico" aria-disabled={lado ? undefined : 'true'}>Usar este lado</button>
    </form>
  );
}

function Tipo({ tabla, columna, tipo, der, aplicar }) {
  const id = useId();
  const [texto, setTexto] = useState(null);
  const mal = texto !== null && !tipoLimpio(texto);
  const parecido = mal ? tipoParecido(texto) : '';
  const usar = (t) => aplicar(decidir(der, 'tipos', `${tabla}.${columna}`, t), `tipo:${tabla}.${columna}`);
  return (
    <span className="der-tipo">
      <label className="solo-lectores" htmlFor={id}>{`Tipo de ${columna}`}</label>
      <input
        id={id}
        className="campo__control"
        list="der-tipos"
        value={texto ?? tipo}
        spellCheck={false}
        autoComplete="off"
        aria-invalid={mal || undefined}
        aria-describedby={mal ? `${id}-mal` : undefined}
        onChange={(e) => {
          setTexto(e.target.value);
          const limpio = tipoLimpio(e.target.value);
          if (limpio) usar(limpio);
        }}
        onBlur={() => {
          if (!mal) setTexto(null);
        }}
      />
      {mal && <span id={`${id}-mal`} className="der-tipo__mal">{parecido ? `En MySQL es ${parecido}.` : 'No es un tipo de MySQL.'}</span>}
      {parecido && (
        <button
          type="button"
          className="boton boton--chico boton--secundario der-tipo__usar"
          onClick={() => {
            usar(parecido);
            setTexto(null);
          }}
        >
          {`Usar ${parecido}`}
        </button>
      )}
    </span>
  );
}

function Tabla({ t, der, resultado, aplicar }) {
  const texto = tablasEnTexto({ tablas: [t] }).trimEnd();
  // The table's name in bold, as it heads its line.
  const corte = texto.indexOf('(');
  const pendiente = !t.cp || t.espera?.length > 0;
  const cp = new Set(t.cp ?? []);
  return (
    <li className="der-tabla" data-pendiente={pendiente || undefined}>
      <pre className="der-tabla__pasaje">{corte > 0 ? <><strong>{texto.slice(0, corte)}</strong>{texto.slice(corte)}</> : texto}</pre>
      {pendiente && <p className="der-tabla__falta">{t.espera?.length ? 'Espera una decisión.' : 'Le falta la CP.'}</p>}
      <table className="der-tabla__tipos">
        <caption className="solo-lectores">{`Tipos de ${t.nombre}`}</caption>
        <thead>
          <tr>
            <th scope="col">Columna</th>
            <th scope="col">Tipo</th>
          </tr>
        </thead>
        <tbody>
          {t.columnas.map((c) => (
            <tr key={c.nombre}>
              <th scope="row" data-clave={cp.has(c.nombre) || undefined}>{conCortes(c.nombre)}</th>
              <td><Tipo tabla={t.nombre} columna={c.nombre} tipo={tipoDe(t, c.nombre, resultado, der.decisiones.tipos)} der={der} aplicar={aplicar} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </li>
  );
}

export default function Tablas({ der, resultado, avisos, aplicar, alVer, idTitulo }) {
  const { tablas, pendientes } = resultado;
  const decididas = [
    ...Object.entries(der.decisiones.cp).map(([v, cols]) => ({ que: 'cp', v, texto: `CP de ${der.vinculos.find((x) => x.id === v)?.nombre ?? 'un vínculo'}: ${cols.join(', ')}` })),
    ...Object.entries(der.decisiones.lado11).map(([v, e]) => ({ que: 'lado11', v, texto: `${der.vinculos.find((x) => x.id === v)?.nombre ?? 'Un vínculo'}: la CF va en ${nombreDe(der, e)}` })),
  ];
  return (
    <div className="der-tablas">
      <h3 id={idTitulo} className="solo-lectores">Tablas</h3>
      {(pendientes.length > 0 || decididas.length > 0) && (
        <section className="der-bloque" data-pendiente={pendientes.length > 0 || undefined} aria-labelledby={`${idTitulo}-decidir`}>
          <h4 id={`${idTitulo}-decidir`} className="der-bloque__titulo">{pendientes.length ? `Para decidir (${pendientes.length})` : 'Lo que decidiste'}</h4>
          {pendientes.length > 0 && (
            <ul className="der-decisiones">
              {pendientes.map((p) => (
                <li key={p.clave}>
                  {p.tipo === 'cp' ? <DecidirCp p={p} der={der} aplicar={aplicar} /> : <DecidirLado p={p} der={der} aplicar={aplicar} />}
                </li>
              ))}
            </ul>
          )}
          {decididas.length > 0 && (
            <ul className="der-decididas">
              {decididas.map((d) => (
                <li key={`${d.que}:${d.v}`}>
                  <span>{d.texto}</span>
                  <button type="button" className="boton boton--chico boton--secundario" onClick={() => aplicar(decidir(der, d.que, d.v, null))}>Cambiar</button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {avisos.length > 0 && (
        <section className="der-bloque der-bloque--avisos" aria-labelledby={`${idTitulo}-avisos`}>
          <h4 id={`${idTitulo}-avisos`} className="der-bloque__titulo">{`Para revisar (${avisos.length})`}</h4>
          <ul className="der-avisos">
            {avisos.map((a) => (
              <li key={a.id}>
                <span>{a.texto}</span>
                {a.donde && <button type="button" className="boton boton--chico boton--secundario" onClick={() => alVer(a.donde)}>Ver en el diagrama</button>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {tablas.length ? (
        <ul className="der-lista-tablas" aria-label="Tablas">
          {tablas.map((t, i) => <Tabla key={`${t.nombre}:${i}`} t={t} der={der} resultado={resultado} aplicar={aplicar} />)}
        </ul>
      ) : (
        <p className="der-nota der-tablas__vacio">Todavía no hay tablas. Sumá entidades en el diagrama.</p>
      )}
      <datalist id="der-tipos">
        {TIPOS.map((t) => <option key={t} value={t} />)}
      </datalist>
    </div>
  );
}
