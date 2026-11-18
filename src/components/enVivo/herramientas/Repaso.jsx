import { useCallback, useEffect, useId, useMemo, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { nombreDeMateria, useMaterias } from '../../ElegirMateria';
import { Ficha, FinDeRonda } from '../../FichaDeRepaso';
import { hayUsuario, useMio } from '../../../lib/mio';
import { crearTarjeta } from '../../../lib/repasoGuardado';
import { useRepasoDeEjemplo } from '../../../lib/repasoDeEjemplo';
import { colorValido } from '../../../lib/enVivo/laboratorioCompartido';
import { darVuelta, leerRepaso, llevarMazo, marcar, MAX_MAZO, otraVuelta, paraGuardarMazo, resumen, siguiente, soltarMazo, textoDelRepaso } from '../../../lib/enVivo/repasoCompartido';
import './repaso.css';

// Repaso en grupo: someone brings cards of their Repaso (copied: their days don't move), and the table goes through
// them together, one card for everyone. Anyone turns it and moves on; each one says whether they knew it, and at the
// end each one sees how it went. Nobody's Repaso changes, unless they add a card to theirs on purpose.

const leidos = new WeakMap();
function leer(datos) {
  let e = leidos.get(datos);
  if (!e) {
    e = { valor: null };
    leidos.set(datos, e);
    datos.observe(() => {
      e.valor = null;
    });
  }
  e.valor ??= leerRepaso(datos);
  return e.valor;
}
function useRepaso(datos) {
  const suscribir = useCallback((fn) => {
    datos.observe(fn);
    return () => datos.unobserve(fn);
  }, [datos]);
  const leerAhora = useCallback(() => leer(datos), [datos]);
  return useSyncExternalStore(suscribir, leerAhora, leerAhora);
}

const tarjetas = (n) => (n === 1 ? '1 tarjeta' : `${n} tarjetas`);

/** Choosing a deck of one's own Repaso: all, or one course. */
function Elegir({ datos, yo }) {
  const id = useId();
  const mio = useMio();
  const propias = mio.repaso;
  useRepasoDeEjemplo(propias);
  const materias = useMaterias(mio.propias);
  const grupos = useMemo(() => {
    const porMateria = new Map();
    for (const t of propias) porMateria.set(t.materia, (porMateria.get(t.materia) ?? 0) + 1);
    return [...porMateria]
      .map(([materia, n]) => ({ valor: materia === null ? 'sin' : String(materia), materia, nombre: nombreDeMateria(materias, materia), n }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }, [propias, materias]);
  const [elegido, setElegido] = useState('todas');

  if (!propias.length) {
    return (
      <div className="ev-repaso__vacio">
        <p>No tenés tarjetas en Repaso. Puede elegir el mazo alguien que tenga.</p>
        <Link className="boton boton--secundario boton--chico" to="/repaso">Armar tarjetas</Link>
      </div>
    );
  }
  const grupo = grupos.find((g) => g.valor === elegido) ?? null;
  const cuantas = grupo ? grupo.n : propias.length;
  const llevar = () => {
    const lista = grupo ? propias.filter((t) => t.materia === grupo.materia) : propias;
    llevarMazo(datos, lista, { titulo: grupo ? grupo.nombre : 'Todas las materias', yo });
  };
  return (
    <div className="ev-repaso__elegir">
      <div className="campo">
        <label className="campo__etiqueta" htmlFor={`${id}-mazo`}>Mazo de tu Repaso</label>
        <select id={`${id}-mazo`} className="campo__control" value={elegido} onChange={(e) => setElegido(e.target.value)} aria-describedby={`${id}-nota`}>
          <option value="todas">{`Todas las materias (${propias.length})`}</option>
          {grupos.map((g) => <option key={g.valor} value={g.valor}>{`${g.nombre} (${g.n})`}</option>)}
        </select>
        <span id={`${id}-nota`} className="campo__ayuda">
          {cuantas > MAX_MAZO ? `Van ${MAX_MAZO} al azar. ` : ''}Se copian a la mesa. Tu Repaso no cambia.
        </span>
      </div>
      <button type="button" className="boton" onClick={llevar}>Llevar a la mesa</button>
    </div>
  );
}

export default function Repaso({ mesa }) {
  const { datos, yo, otros, paraConsultron, paraGuardar } = mesa;
  const estado = useRepaso(datos);
  const { mazo, i, vuelta } = estado;
  const terminado = mazo.length > 0 && i >= mazo.length;
  const tarjeta = mazo.length && !terminado ? mazo[i] : null;
  const [sumadas, setSumadas] = useState(() => new Set());
  const [aviso, setAviso] = useState('');

  useEffect(() => paraConsultron(() => textoDelRepaso(leer(datos))), [paraConsultron, datos]);
  useEffect(() => (mazo.length ? paraGuardar(() => paraGuardarMazo(leer(datos))) : undefined), [paraGuardar, datos, mazo.length]);

  // Who is here, with their color: those in the tab now, and those who answered before leaving.
  const gente = useMemo(() => {
    const lista = [{ id: yo.id, nombre: 'Vos', color: yo.color }, ...otros.map((o) => ({ id: o.id, nombre: o.nombre, color: o.color }))];
    for (const [persona, p] of estado.personas) if (!lista.some((x) => x.id === persona) && estado.marcas.has(persona)) lista.push({ id: persona, nombre: p.nombre, color: p.color });
    return lista;
  }, [yo, otros, estado.personas, estado.marcas]);
  const nombreDe = (persona) => gente.find((g) => g.id === persona)?.nombre ?? null;
  const colorDe = (persona) => colorValido(gente.find((g) => g.id === persona)?.color ?? estado.personas.get(persona)?.color);

  if (!mazo.length) {
    return (
      <div className="ev-repaso">
        <Elegir datos={datos} yo={yo} />
      </div>
    );
  }

  const mia = estado.marcas.get(yo.id)?.get(i) ?? null;
  const ajena = estado.de !== yo.id && hayUsuario();
  const sumar = () => {
    if (crearTarjeta({ frente: tarjeta.f, dorso: tarjeta.d })) {
      setSumadas((s) => new Set(s).add(`${estado.vez}:${i}`));
      setAviso('Sumaste la tarjeta a tu Repaso.');
    } else setAviso('No entra en tu Repaso. Borrá alguna tarjeta y probá de nuevo.');
  };

  return (
    <div className="ev-repaso">
      <div className="ev-repaso__cabeza">
        <p className="ev-repaso__mazo">
          <span className="ev-repaso__titulo">{estado.titulo || 'Mazo'}</span>
          {estado.deNombre && <span>{`, de ${estado.de === yo.id ? 'tu Repaso' : estado.deNombre}`}</span>}
        </p>
        {!terminado && <p className="ev-repaso__cuenta">{`Tarjeta ${i + 1} de ${mazo.length}`}</p>}
      </div>

      {tarjeta && (
        <>
          <Ficha key={`${estado.vez}-${i}`} tarjeta={{ frente: tarjeta.f, dorso: tarjeta.d }} materia={estado.titulo || 'Mazo'} vuelta={vuelta} />
          <p className="solo-lectores" aria-live="polite">{vuelta ? `Respuesta: ${tarjeta.d || 'sin respuesta escrita'}` : `Tarjeta ${i + 1}. ${tarjeta.f}`}</p>

          <div className="ev-repaso__acciones">
            <button type="button" className="boton boton--secundario" onClick={() => darVuelta(datos)}>Dar vuelta</button>
            {vuelta && (
              <div className="ev-repaso__marcar" role="group" aria-label="¿La sabías?">
                <button type="button" className="boton boton--secundario ev-repaso__si" aria-pressed={mia === 'si'} onClick={() => marcar(datos, yo, i, 'si')}>La sabía</button>
                <button type="button" className="boton boton--secundario ev-repaso__no" aria-pressed={mia === 'no'} onClick={() => marcar(datos, yo, i, 'no')}>No la sabía</button>
              </div>
            )}
            <button type="button" className="boton ev-repaso__siguiente" onClick={() => siguiente(datos, i)}>{i + 1 < mazo.length ? 'Siguiente' : 'Terminar'}</button>
          </div>

          <ul className="ev-repaso__gente" aria-label="Cómo le fue a cada uno con esta tarjeta">
            {gente.map((g) => {
              const marca = estado.marcas.get(g.id)?.get(i);
              return (
                <li key={g.id} className="ev-repaso__persona" style={{ '--de': colorValido(g.color) }} data-marca={marca}>
                  <span className="ev-repaso__punto" aria-hidden="true" />
                  <span className="ev-repaso__nombre">{g.nombre}</span>
                  <span className="ev-repaso__estado">{marca === 'si' ? 'la sabía' : marca === 'no' ? 'no la sabía' : 'todavía no dijo'}</span>
                </li>
              );
            })}
          </ul>

          {ajena && (
            sumadas.has(`${estado.vez}:${i}`)
              ? <p className="ev-repaso__nota">Está en tu Repaso.</p>
              : <button type="button" className="boton boton--secundario boton--chico ev-repaso__sumar" onClick={sumar}>Sumar a mi Repaso</button>
          )}
        </>
      )}

      {terminado && (
        <FinDeRonda hechas={mazo.length} titulo={`Terminaron las ${tarjetas(mazo.length)}`} Nivel="h3">
          {estado.marcas.size ? (
            <ul className="ev-repaso__resumen">
              {resumen(estado, nombreDe).map((r) => (
                <li key={r.persona} className="ev-repaso__fila" style={{ '--de': colorDe(r.persona) }}>
                  <span className="ev-repaso__nombre">{r.nombre}</span>
                  <span className="ev-repaso__barra" aria-hidden="true">
                    <span style={{ inlineSize: `${(r.si / mazo.length) * 100}%` }} />
                  </span>
                  <span className="ev-repaso__numeros">{`Sabía ${r.si} de ${mazo.length}`}</span>
                  {r.cuales.length > 0 && (
                    <details className="ev-repaso__cuales">
                      <summary>{r.cuales.length === 1 ? 'La que no sabía' : `Las ${r.cuales.length} que no sabía`}</summary>
                      <ul>
                        {r.cuales.map((k) => <li key={k}>{mazo[k].f}</li>)}
                      </ul>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="ev-repaso__nota">Nadie marcó si las sabía.</p>
          )}
          <div className="ev-repaso__acciones">
            <button type="button" className="boton" onClick={() => otraVuelta(datos)}>Otra vuelta</button>
            <button type="button" className="boton boton--secundario" onClick={() => soltarMazo(datos)}>Elegir otro mazo</button>
          </div>
        </FinDeRonda>
      )}
      <p className="solo-lectores" role="status">{aviso}</p>
    </div>
  );
}
