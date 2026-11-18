import { useId, useState } from 'react';
import {
  agregarAtributo, agregarPunta, borrarAtributo, buscar, cambiar, cambiarAtributo, cambiarPunta, correrAtributo, lecturaDePunta, MAX_PUNTAS, MAXIMOS, MINIMOS, nombreDe, partirCard, quitarPunta, renombrar,
} from './edicion';
import { deNodo, idNodo, nombreDelElemento } from './Hoja';

// What is chosen on the sheet, written out: every change of the DER can be made from here with the keyboard. With
// nothing chosen, the list of everything in the diagram, to go to it.

const sinEspacios = (t) => t.replace(/\s+/g, '_');

function Atributo({ a, der, tipo, dueno, aplicar, conClave, parte = false }) {
  const id = useId();
  const [abierto, setAbierto] = useState(false);
  const cambiarEste = (c, juntar) => aplicar(cambiarAtributo(der, tipo, dueno, a.id, c), juntar);
  return (
    <li className="der-atributo" data-der-atributo={a.id}>
      <div className="der-atributo__fila">
        <label className="solo-lectores" htmlFor={`${id}-nombre`}>{parte ? 'Nombre de la parte' : 'Nombre del atributo'}</label>
        <input
          id={`${id}-nombre`}
          className="campo__control der-atributo__nombre"
          value={a.nombre}
          maxLength={64}
          spellCheck={false}
          autoComplete="off"
          data-clave={(conClave && a.clave) || undefined}
          onChange={(e) => cambiarEste({ nombre: sinEspacios(e.target.value) }, `atr:${a.id}`)}
        />
        {conClave && (
          <label className="der-marca">
            <input type="checkbox" checked={a.clave} onChange={(e) => cambiarEste({ clave: e.target.checked })} />
            Clave
          </label>
        )}
        <button type="button" className="der-mas" aria-expanded={abierto} aria-controls={`${id}-mas`} aria-label={`Más de ${a.nombre || 'atributo sin nombre'}`} onClick={() => setAbierto(!abierto)}>
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d={abierto ? 'm6 15 6-6 6 6' : 'm6 9 6 6 6-6'} /></svg>
        </button>
      </div>
      <div id={`${id}-mas`} className="der-atributo__mas" hidden={!abierto}>
        {!parte && (
          <>
            <label className="der-marca">
              <input type="checkbox" checked={a.multivaluado} onChange={(e) => cambiarEste({ multivaluado: e.target.checked })} />
              Multivaluado
            </label>
            <label className="der-marca">
              <input type="checkbox" checked={a.derivado} onChange={(e) => cambiarEste({ derivado: e.target.checked })} />
              Derivado
            </label>
          </>
        )}
        <span className="der-atributo__botones">
          <button type="button" className="boton boton--chico boton--secundario" onClick={() => aplicar(correrAtributo(der, tipo, dueno, a.id, -1))}>Subir</button>
          <button type="button" className="boton boton--chico boton--secundario" onClick={() => aplicar(correrAtributo(der, tipo, dueno, a.id, 1))}>Bajar</button>
          {!parte && (
            <button type="button" className="boton boton--chico boton--secundario" onClick={() => aplicar(agregarAtributo(der, tipo, dueno, a.id)[0])}>Sumar parte</button>
          )}
          <button type="button" className="boton boton--chico boton--secundario" onClick={() => aplicar(borrarAtributo(der, tipo, dueno, a.id))}>Borrar</button>
        </span>
      </div>
      {a.partes?.length > 0 && (
        <ul className="der-atributos der-atributos--partes" aria-label={`Partes de ${a.nombre}`}>
          {a.partes.map((p) => <Atributo key={p.id} a={p} der={der} tipo={tipo} dueno={dueno} aplicar={aplicar} conClave={false} parte />)}
        </ul>
      )}
    </li>
  );
}

function Atributos({ x, der, tipo, aplicar, conClave }) {
  const sumar = () => {
    const [nuevo, id] = agregarAtributo(der, tipo, x.id);
    aplicar(nuevo);
    // The new one, ready to be named.
    requestAnimationFrame(() => {
      const campo = document.querySelector(`[data-der-atributo="${id}"] input`);
      campo?.focus({ preventScroll: true });
      campo?.select();
      campo?.scrollIntoView({ block: 'nearest' });
    });
  };
  return (
    <fieldset className="der-grupo">
      <legend>Atributos</legend>
      {x.atributos.length > 0 && (
        <ul className="der-atributos">
          {x.atributos.map((a) => <Atributo key={a.id} a={a} der={der} tipo={tipo} dueno={x.id} aplicar={aplicar} conClave={conClave} />)}
        </ul>
      )}
      <button type="button" className="boton boton--chico boton--secundario" onClick={sumar}>Sumar atributo</button>
    </fieldset>
  );
}

function Nombre({ x, tipo, der, aplicar, etiqueta = 'Nombre' }) {
  const id = useId();
  return (
    <div className="der-campo">
      <label htmlFor={id}>{etiqueta}</label>
      <input
        id={id}
        className="campo__control"
        data-der-nombre=""
        value={x.nombre}
        maxLength={64}
        spellCheck={false}
        autoComplete="off"
        onChange={(e) => aplicar(renombrar(der, tipo, x.id, sinEspacios(e.target.value)), `nombre:${x.id}`)}
      />
    </div>
  );
}

// «Vínculo con»: another entity or an aggregation (not one it is inside of, nor itself if it is one); an entity can
// also go with itself.
function VinculoCon({ tipo, x, der, acciones }) {
  const id = useId();
  const dentroDe = (g) => {
    const v = der.vinculos.find((w) => w.id === g.vinculo);
    return g.id === x.id || Boolean(v?.puntas.some((p) => p.a === x.id));
  };
  // An aggregation goes with what is outside it: not with the entities of the vínculo it groups.
  const adentro = new Set(tipo === 'agregacion' ? der.vinculos.find((w) => w.id === x.vinculo)?.puntas.map((p) => p.a) ?? [] : []);
  const otras = [
    ...der.entidades.filter((e) => e.id !== x.id && !adentro.has(e.id)).map((e) => ({ tipo: 'entidad', id: e.id, texto: e.nombre })),
    ...der.agregaciones.filter((g) => !dentroDe(g)).map((g) => ({ tipo: 'agregacion', id: g.id, texto: `${g.nombre} (agregación)` })),
    ...(tipo === 'entidad' ? [{ tipo, id: x.id, texto: `${x.nombre} (consigo misma)` }] : []),
  ];
  const [con, setCon] = useState('');
  const elegida = otras.find((o) => o.id === con) ?? otras[0];
  if (!elegida) return null;
  return (
    <form
      className="der-grupo der-unir"
      onSubmit={(e) => {
        e.preventDefault();
        acciones.unir([idNodo(tipo, x.id), idNodo(elegida.tipo, elegida.id)]);
      }}
    >
      <div className="der-campo">
        <label htmlFor={`${id}-con`}>Vínculo con</label>
        <select id={`${id}-con`} className="campo__control" value={elegida.id} onChange={(e) => setCon(e.target.value)}>
          {otras.map((o) => <option key={o.id} value={o.id}>{o.texto}</option>)}
        </select>
      </div>
      <button type="submit" className="boton boton--chico">Unir</button>
    </form>
  );
}

function FichaEntidad({ x, der, aplicar, acciones }) {
  return (
    <>
      <Nombre x={x} tipo="entidad" der={der} aplicar={aplicar} />
      <label className="der-marca">
        <input type="checkbox" checked={x.debil} onChange={(e) => aplicar(cambiar(der, 'entidad', x.id, { debil: e.target.checked }))} />
        Débil (doble rectángulo)
      </label>
      <Atributos x={x} der={der} tipo="entidad" aplicar={aplicar} conClave />
      <VinculoCon tipo="entidad" x={x} der={der} acciones={acciones} />
    </>
  );
}

function Punta({ v, i, der, aplicar }) {
  const id = useId();
  const p = v.puntas[i];
  const { min, max } = partirCard(p.card);
  const lectura = lecturaDePunta(der, v, i);
  const destinos = [...der.entidades, ...der.agregaciones];
  const cambiarEsta = (c, juntar) => aplicar(cambiarPunta(der, v.id, i, c), juntar);
  return (
    <li className="der-punta">
      <div className="der-campo der-punta__a">
        <label htmlFor={`${id}-a`}>{`Punta ${i + 1}`}</label>
        <select id={`${id}-a`} className="campo__control" value={p.a} onChange={(e) => cambiarEsta({ a: e.target.value })}>
          {destinos.map((d) => <option key={d.id} value={d.id}>{der.agregaciones.includes(d) ? `${d.nombre} (agregación)` : d.nombre}</option>)}
        </select>
      </div>
      <fieldset className="der-card-campo" aria-describedby={lectura ? `${id}-lee` : undefined}>
        <legend>Cardinalidad</legend>
        <div className="der-card-campo__controles">
          <label className="solo-lectores" htmlFor={`${id}-min`}>Mínimo</label>
          <select id={`${id}-min`} className="campo__control" value={min} onChange={(e) => cambiarEsta({ card: `${e.target.value}:${max}` })}>
            {MINIMOS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <span aria-hidden="true">:</span>
          <label className="solo-lectores" htmlFor={`${id}-max`}>Máximo</label>
          <select id={`${id}-max`} className="campo__control" value={max} onChange={(e) => cambiarEsta({ card: `${min}:${e.target.value}` })}>
            {[...new Set([...MAXIMOS, max])].map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </fieldset>
      {lectura && <p id={`${id}-lee`} className="der-nota der-punta__lee">{lectura}</p>}
      <div className="der-campo der-punta__rol">
        <label htmlFor={`${id}-rol`}>Rol</label>
        <input id={`${id}-rol`} className="campo__control" value={p.rol ?? ''} maxLength={40} placeholder="opcional" autoComplete="off" onChange={(e) => cambiarEsta({ rol: sinEspacios(e.target.value) }, `rol:${v.id}:${i}`)} />
      </div>
      {v.puntas.length > 2 && (
        <button type="button" className="boton boton--chico boton--secundario der-punta__quitar" onClick={() => aplicar(quitarPunta(der, v.id, i))}>{`Quitar la punta ${i + 1}`}</button>
      )}
    </li>
  );
}

function FichaVinculo({ x, der, aplicar }) {
  return (
    <>
      <Nombre x={x} tipo="vinculo" der={der} aplicar={aplicar} />
      <label className="der-marca">
        <input type="checkbox" checked={x.identificador} onChange={(e) => aplicar(cambiar(der, 'vinculo', x.id, { identificador: e.target.checked }))} />
        Identifica a una débil (doble rombo)
      </label>
      <fieldset className="der-grupo">
        <legend>Puntas</legend>
        <p className="der-nota">La cardinalidad junto a una entidad dice cuántas de ella van con una de la otra.</p>
        <ul className="der-puntas">
          {x.puntas.map((_, i) => <Punta key={i} v={x} i={i} der={der} aplicar={aplicar} />)}
        </ul>
        {x.puntas.length < MAX_PUNTAS && (
          <button type="button" className="boton boton--chico boton--secundario" onClick={() => aplicar(agregarPunta(der, x.id, der.entidades[0]?.id))} disabled={!der.entidades.length}>
            Sumar punta
          </button>
        )}
      </fieldset>
      <Atributos x={x} der={der} tipo="vinculo" aplicar={aplicar} conClave={false} />
    </>
  );
}

// «casa, local o departamento».
const o = (l) => (l.length > 1 ? `${l.slice(0, -1).join(', ')} o ${l.at(-1)}` : l[0] ?? '');

const PASAJES = [
  ['superclase', 'A la superclase'],
  ['completa', 'Jerarquía completa'],
  ['subclases', 'A las subclases'],
];

function FichaJerarquia({ x, der, aplicar }) {
  const id = useId();
  const cambiarEsta = (c) => aplicar(cambiar(der, 'jerarquia', x.id, c));
  return (
    <>
      <div className="der-campo">
        <label htmlFor={`${id}-super`}>Superclase</label>
        <select id={`${id}-super`} className="campo__control" value={x.superclase ?? ''} onChange={(e) => cambiarEsta({ superclase: e.target.value, subclases: x.subclases.filter((s) => s !== e.target.value) })}>
          {!x.superclase && <option value="">Elegí una</option>}
          {der.entidades.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
        </select>
      </div>
      <fieldset className="der-grupo">
        <legend>Subclases</legend>
        <ul className="der-opciones">
          {der.entidades.filter((e) => e.id !== x.superclase).map((e) => (
            <li key={e.id}>
              <label className="der-marca">
                <input type="checkbox" checked={x.subclases.includes(e.id)} onChange={(ev) => cambiarEsta({ subclases: ev.target.checked ? [...x.subclases, e.id] : x.subclases.filter((s) => s !== e.id) })} />
                {e.nombre}
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      <fieldset className="der-grupo der-en-linea">
        <legend>Tipo</legend>
        <label className="der-marca">
          <input type="radio" name={`${id}-tipo`} checked={x.tipo === 'D'} onChange={() => cambiarEsta({ tipo: 'D' })} />
          Disyunta (D)
        </label>
        <label className="der-marca">
          <input type="radio" name={`${id}-tipo`} checked={x.tipo === 'S'} onChange={() => cambiarEsta({ tipo: 'S' })} />
          Solapada (S)
        </label>
      </fieldset>
      <label className="der-marca">
        <input type="checkbox" checked={x.total} onChange={(e) => cambiarEsta({ total: e.target.checked })} />
        Total (doble línea a la superclase)
      </label>
      <fieldset className="der-grupo">
        <legend>Cómo pasa a tablas</legend>
        {PASAJES.map(([valor, texto]) => (
          <label key={valor} className="der-marca">
            <input type="radio" name={`${id}-pasaje`} checked={x.pasaje === valor} onChange={() => cambiarEsta({ pasaje: valor })} />
            {texto}
          </label>
        ))}
        {x.pasaje === 'superclase' && x.tipo === 'D' && x.subclases.length > 1 && !buscar(der, 'entidad', x.superclase)?.atributos.some((a) => /^tipo/i.test(a.nombre)) && (
          <p className="der-nota">{`Para saber si cada fila es ${o(x.subclases.map((s) => nombreDe(der, s)))}, sumale a «${nombreDe(der, x.superclase)}» un atributo como «tipo».`}</p>
        )}
      </fieldset>
    </>
  );
}

function FichaAgregacion({ x, der, aplicar, acciones }) {
  const id = useId();
  return (
    <>
      <Nombre x={x} tipo="agregacion" der={der} aplicar={aplicar} />
      <div className="der-campo">
        <label htmlFor={`${id}-v`}>Vínculo que agrupa</label>
        <select id={`${id}-v`} className="campo__control" value={x.vinculo} onChange={(e) => aplicar(cambiar(der, 'agregacion', x.id, { vinculo: e.target.value }))}>
          {der.vinculos.map((v) => <option key={v.id} value={v.id}>{v.nombre || 'sin nombre'}</option>)}
        </select>
      </div>
      <VinculoCon tipo="agregacion" x={x} der={der} acciones={acciones} />
    </>
  );
}

const TITULOS = { entidad: 'Entidad', vinculo: 'Vínculo', jerarquia: 'Jerarquía', agregacion: 'Agregación' };
const FICHAS = { entidad: FichaEntidad, vinculo: FichaVinculo, jerarquia: FichaJerarquia, agregacion: FichaAgregacion };

/** `plegable` (on a phone): with nothing chosen, the list of everything opens from its title (`verLista`). */
export default function Ficha({ der, elegidos, aplicar, acciones, idTitulo, plegable = false, verLista = false, alVerLista }) {
  const cosas = elegidos.map(deNodo).map((c) => ({ ...c, x: buscar(der, c.tipo, c.id) })).filter((c) => c.x);

  if (cosas.length === 1) {
    const { tipo, x } = cosas[0];
    const Cuerpo = FICHAS[tipo];
    return (
      <>
        <h3 id={idTitulo} className="der-ficha__titulo">{TITULOS[tipo]}</h3>
        <Cuerpo key={x.id} x={x} der={der} aplicar={aplicar} acciones={acciones} />
        <div className="der-ficha__pie">
          <button type="button" className="boton boton--chico boton--secundario" onClick={() => acciones.soltar()}>Soltar</button>
          <button type="button" className="boton boton--chico boton--secundario der-peligro" onClick={() => acciones.borrar([idNodo(tipo, x.id)])}>{`Borrar ${TITULOS[tipo].toLowerCase()}`}</button>
        </div>
      </>
    );
  }

  if (cosas.length > 1) {
    const entidades = cosas.filter((c) => c.tipo === 'entidad');
    const extremos = cosas.filter((c) => c.tipo === 'entidad' || c.tipo === 'agregacion');
    return (
      <>
        <h3 id={idTitulo} className="der-ficha__titulo">{`${cosas.length} elegidos`}</h3>
        <ul className="der-lista der-lista--quieta">
          {cosas.map((c) => <li key={c.id}>{nombreDelElemento(der, c.tipo, c.x)}</li>)}
        </ul>
        <div className="der-ficha__pie">
          {extremos.length >= 2 && extremos.length <= MAX_PUNTAS && (
            <button type="button" className="boton boton--chico" onClick={() => acciones.unir(extremos.map((c) => idNodo(c.tipo, c.id)))}>Unir con un vínculo</button>
          )}
          {entidades.length >= 2 && (
            <button type="button" className="boton boton--chico boton--secundario" onClick={() => acciones.jerarquia(entidades.map((c) => c.id))}>{`Jerarquía de ${entidades[0].x.nombre}`}</button>
          )}
          <button type="button" className="boton boton--chico boton--secundario" onClick={() => acciones.soltar()}>Soltar</button>
          <button type="button" className="boton boton--chico boton--secundario der-peligro" onClick={() => acciones.borrar(elegidos)}>Borrar todo</button>
        </div>
      </>
    );
  }

  const todo = [
    ...der.entidades.map((x) => ({ tipo: 'entidad', x })),
    ...der.vinculos.map((x) => ({ tipo: 'vinculo', x })),
    ...der.jerarquias.map((x) => ({ tipo: 'jerarquia', x })),
    ...der.agregaciones.map((x) => ({ tipo: 'agregacion', x })),
  ];
  if (plegable && todo.length) {
    return (
      <>
        <h3 id={idTitulo} className="der-ficha__titulo">
          <button type="button" className="der-ficha__plegar" aria-expanded={verLista} aria-controls={`${idTitulo}-lista`} onClick={() => alVerLista(!verLista)}>
            {`En el diagrama (${todo.length})`}
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d={verLista ? 'm6 9 6 6 6-6' : 'm6 15 6-6 6 6'} /></svg>
          </button>
        </h3>
        <ul id={`${idTitulo}-lista`} className="der-lista" hidden={!verLista}>
          {todo.map(({ tipo, x }) => (
            <li key={x.id}>
              <button type="button" className="der-lista__item" onClick={() => acciones.ir(idNodo(tipo, x.id))}>
                <span className="der-lista__tipo" data-tipo={tipo} aria-hidden="true" />
                {nombreDelElemento(der, tipo, x)}
              </button>
            </li>
          ))}
        </ul>
      </>
    );
  }
  return (
    <>
      <h3 id={idTitulo} className="der-ficha__titulo">En el diagrama</h3>
      {todo.length ? (
        <ul className="der-lista">
          {todo.map(({ tipo, x }) => (
            <li key={x.id}>
              <button type="button" className="der-lista__item" onClick={() => acciones.ir(idNodo(tipo, x.id))}>
                <span className="der-lista__tipo" data-tipo={tipo} aria-hidden="true" />
                {nombreDelElemento(der, tipo, x)}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="der-nota">Empezá por una entidad. Después unilas con vínculos.</p>
      )}
      {der.entidades.length > 0 && <p className="der-nota">Con Shift elegís varias. Para unir dos formas, arrastrá desde el borde de una hasta la otra.</p>}
    </>
  );
}
