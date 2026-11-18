import { useEffect, useId, useRef, useState } from 'react';
import { useQuieto } from '../lib/useQuieto';
import { buscarEnBanco, buscarOficial, cargarBanco, cargarIndice, MATERIAS_SANTO, nombreDeMateria, paginasDe } from '../lib/santoResumen';
import { useConsulta } from '../lib/useConsulta';
import Campo from './Campo';
import { Cargando, ErrorConReintento } from './Filas';

const DONDE = [
  { valor: 'oficial', texto: 'Apuntes oficiales' },
  { valor: 'banco', texto: 'Banco de resúmenes' },
];

function Partes({ partes }) {
  return partes.map((p, i) => (p.marca ? <mark key={i}>{p.texto}</mark> : <span key={i}>{p.texto}</span>));
}

async function buscar(donde, slug, consulta) {
  const materia = slug ? nombreDeMateria(slug) : '';
  if (donde === 'oficial') {
    const indice = await cargarIndice();
    if (consulta) {
      const items = buscarOficial(indice, consulta, slug);
      return items.length ? [{ id: 'hallados', nombre: materia ? `En ${materia}` : 'En todas las materias', items }] : [];
    }
    return slug ? paginasDe(indice, slug) : [];
  }
  const buscando = consulta.length >= 2;
  const lista = buscando ? await buscarEnBanco(consulta, slug) : await cargarBanco(slug);
  const items = slug ? lista : lista.map((r) => ({ ...r, dato: [nombreDeMateria(r.materia), r.dato].filter(Boolean).join(', ') }));
  return items.length ? [{ id: 'banco', nombre: materia ? `Resúmenes de ${materia}` : 'Resúmenes de todas las materias', items }] : [];
}

function vacioDe(donde, slug, consulta) {
  if (donde === 'oficial') {
    if (consulta) return 'No hay nada con esas palabras.';
    return slug ? 'Esta materia todavía no tiene apuntes oficiales.' : 'Elegí una materia o buscá un tema.';
  }
  if (consulta.length >= 2) return 'No hay resúmenes con esas palabras.';
  return slug ? 'Esta materia todavía no tiene resúmenes en el banco.' : 'El banco todavía no tiene resúmenes.';
}

/** A sheet to pick official pages or summaries of the bank of El Santo Resumen, without leaving Super CVG. They go in as
 * links. `yaEstan`: the addresses already in the category, shown checked and fixed. Picks add up across tabs. */
export default function ElegirDelSanto({ inicial = '', yaEstan, onAgregar, onCerrar }) {
  const dialogo = useRef(null);
  const desdeFondo = useRef(false);
  const nombreDonde = useId();
  const [slug, setSlug] = useState(inicial);
  const [donde, setDonde] = useState('oficial');
  const [filtro, setFiltro] = useState('');
  const [elegidos, setElegidos] = useState(() => new Map());
  const consulta = useQuieto(filtro.trim(), 250);
  const clave = `${donde}|${slug}|${consulta}`;

  useEffect(() => {
    const el = dialogo.current;
    if (!el.open) el.showModal();
  }, []);

  const { datos, error, recargar } = useConsulta(async () => ({ clave, grupos: await buscar(donde, slug, consulta) }), [clave]);
  // A list that belongs to another tab, subject or search is not shown: it would look like the answer.
  const grupos = datos?.clave === clave ? datos.grupos : null;
  const vacio = vacioDe(donde, slug, consulta);
  const hallados = grupos?.reduce((n, g) => n + g.items.length, 0) ?? 0;
  const cuenta = !grupos ? '' : !hallados ? vacio : hallados === 1 ? 'Un resultado' : `${hallados} resultados`;

  const alternar = (item, poner) => {
    setElegidos((antes) => {
      const nuevo = new Map(antes);
      if (poner) nuevo.set(item.url, item);
      else nuevo.delete(item.url);
      return nuevo;
    });
  };

  const agregar = () => {
    onAgregar([...elegidos.values()].map((i) => ({ tipo: 'enlace', url: i.url, titulo: i.titulo.slice(0, 200) })));
    dialogo.current.close();
  };

  const cuantos = elegidos.size;

  return (
    <dialog
      ref={dialogo}
      className="previa elegir"
      aria-labelledby="santo-titulo"
      onClose={onCerrar}
      onPointerDown={(e) => { desdeFondo.current = e.target === dialogo.current; }}
      onClick={(e) => { if (desdeFondo.current && e.target === dialogo.current) dialogo.current.close(); }}
    >
      <div className="previa__caja elegir__caja santo__caja">
        <div className="previa__cabeza">
          <h2 id="santo-titulo">Sumar de El Santo Resumen</h2>
          <button type="button" className="boton boton--secundario boton--chico" onClick={() => dialogo.current.close()}>Cerrar</button>
        </div>
        <p className="previa__dato">Se suman como enlaces. Cada uno se abre en El Santo Resumen.</p>
        <fieldset className="santo__donde">
          <legend className="solo-lectores">Dónde buscar</legend>
          {DONDE.map((d) => (
            <label key={d.valor} className="form-fecha__tipo">
              <input type="radio" name={nombreDonde} value={d.valor} checked={donde === d.valor} onChange={() => setDonde(d.valor)} />
              {d.texto}
            </label>
          ))}
        </fieldset>
        <div className="elegir__filtros">
          <Campo etiqueta="Materia">
            <select className="campo__control" value={slug} onChange={(e) => setSlug(e.target.value)}>
              <option value="">Todas las materias</option>
              {MATERIAS_SANTO.map(([s, nombre]) => <option key={s} value={s}>{nombre}</option>)}
            </select>
          </Campo>
          <Campo etiqueta="Buscar" ayuda={donde === 'oficial' ? 'Un tema, como normalización o derivadas' : 'En el título, las etiquetas y el texto'} ayudaAlLado>
            <input className="campo__control" type="search" enterKeyHint="search" value={filtro} onChange={(e) => setFiltro(e.target.value)} autoComplete="off" />
          </Campo>
        </div>
        <p className="solo-lectores" role="status">{cuenta}</p>
        <div className="elegir__lista" aria-busy={!grupos && !error ? 'true' : undefined}>
          {error && !grupos && <ErrorConReintento texto={error} recargar={recargar} />}
          {!error && !grupos && <Cargando texto={donde === 'oficial' ? 'Buscando los apuntes' : 'Buscando en el banco'} cuantas={5} />}
          {grupos && !grupos.length && <p>{vacio}</p>}
          {grupos?.map((g) => (
            <fieldset className="elegir__seccion" key={g.id}>
              <legend className="elegir__titulo">{g.nombre}</legend>
              {g.items.map((i) => {
                const esta = yaEstan.has(i.url);
                return (
                  <label className="opcion elegir__item" key={i.url}>
                    <input type="checkbox" checked={esta || elegidos.has(i.url)} disabled={esta} onChange={(e) => alternar(i, e.target.checked)} />
                    <span className="fila__texto">
                      <span className="fila__nombre">{i.nombre}</span>
                      <span className="fila__dato">{esta ? 'Ya está en esta categoría' : i.dato}</span>
                      {i.partes?.length > 0 && <span className="santo__trozo"><Partes partes={i.partes} /></span>}
                      {i.trozo && !i.partes && <span className="santo__trozo">{i.trozo}</span>}
                    </span>
                  </label>
                );
              })}
            </fieldset>
          ))}
        </div>
        <div className="elegir__pie">
          <button type="button" className="boton" onClick={agregar} disabled={!cuantos}>{cuantos ? `Sumar ${cuantos === 1 ? 'un apunte' : `${cuantos} apuntes`}` : 'Elegí qué sumar'}</button>
          <button type="button" className="boton boton--secundario" onClick={() => dialogo.current.close()}>Cancelar</button>
        </div>
      </div>
    </dialog>
  );
}
