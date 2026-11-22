import { useEffect, useMemo, useRef, useState } from 'react';
import { guardarArchivo } from '../lib/archivos';
import { buscar, peso } from '../lib/datos';
import { useBotonesSinMouse } from '../lib/sinMouse';
import { AL_MISMO_TIEMPO, AVISO_BYTES, errorDePaginas, fusionar, motivoDe, nombreDeFusion, revisarArchivo } from '../lib/fusion';
import Campo from './Campo';
import { datoDe } from './Filas';
import { useUI } from './ui';
import './fusion.css';

const cuenta = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
const ORDINAL = ['primero', 'segundo', 'tercero', 'cuarto', 'quinto', 'sexto', 'séptimo', 'octavo', 'noveno', 'décimo'];
const lugar = (n) => ORDINAL[n] ?? `en el lugar ${n + 1}`;

function agrupar(items) {
  const grupos = new Map();
  for (const item of items) {
    if (!grupos.has(item.seccionId)) grupos.set(item.seccionId, { id: item.seccionId, nombre: item.seccion || 'General', items: [] });
    grupos.get(item.seccionId).items.push(item);
  }
  return [...grupos.values()];
}

function cierre(r, nombre, guardado) {
  if (r.cancelado) return { texto: 'Cancelaste la fusión. No se guardó nada.' };
  const fallas = r.fallaron.map((f) => `«${f.nombre}» ${f.motivo}`).join('. ');
  if (!r.blob) return { error: true, texto: `No se pudo fusionar nada. ${fallas}.` };
  const listo = guardado ? `Guardaste ${nombre} en ${guardado}, con ${cuenta(r.paginas, 'página', 'páginas')}.` : `${nombre} está en tus descargas, con ${cuenta(r.paginas, 'página', 'páginas')}.`;
  return r.fallaron.length ? { error: true, texto: `${listo} Quedó afuera: ${fallas}.` } : { texto: listo };
}

/** The sheet: pick PDFs and photos of the course, put them in order, choose pages, and get one PDF. */
function Hoja({ materia, items, secciones, onGuardar, onCerrar }) {
  const { confirmar } = useUI();
  const dialogo = useRef(null);
  const desdeFondo = useRef(false);
  const control = useRef(null);
  const montado = useRef(true);
  const filas = useRef(new Map());
  const destino = useRef(null);
  const arrastrado = useRef(null);
  const [filtro, setFiltro] = useState('');
  // The chosen ones, in the order they go: { id, paginas }.
  const [orden, setOrden] = useState([]);
  const [nombre, setNombre] = useState('');
  const [seccionId, setSeccionId] = useState(() => String(secciones[0]?.id ?? ''));
  const [progreso, setProgreso] = useState(null);
  const [final, setFinal] = useState(null);
  const [anuncio, setAnuncio] = useState('');
  const [sobre, setSobre] = useState(null);
  // Only the number of a row starts a drag: the rest of the row has a field to write in.
  const [agarrando, setAgarrando] = useState(null);
  // Mover arriba and abajo do what dragging a row does: only with «Modo sin mouse» (sinMouse.js).
  const conBotones = useBotonesSinMouse();
  // Each chosen file is brought and looked at right away: { estado: 'revisando' | 'listo' | 'error', tipo, paginas,
  // blob, motivo }. The merge then uses what was already brought.
  const [revisados, setRevisados] = useState(() => new Map());
  // A PDF was made in this visit: closing doesn't ask anymore.
  const [hecho, setHecho] = useState(false);

  useEffect(() => {
    const el = dialogo.current;
    if (!el.open) el.showModal();
    montado.current = true;
    return () => {
      montado.current = false;
      control.current?.abort();
    };
  }, []);

  const porId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const grupos = useMemo(() => agrupar(filtro.trim() ? buscar(items, filtro, 1000) : items), [items, filtro]);
  const elegidos = orden.filter((o) => porId.has(o.id));
  const errores = new Map(elegidos.map((o) => [o.id, errorDePaginas(o.paginas, revisados.get(o.id)?.paginas)]).filter(([, e]) => e));
  const revisando = elegidos.filter((o) => (revisados.get(o.id)?.estado ?? 'revisando') === 'revisando').length;
  const conProblema = elegidos.filter((o) => revisados.get(o.id)?.estado === 'error').length;
  const listos = elegidos.length > 0 && !revisando && !conProblema && !errores.size;
  const bytes = elegidos.reduce((s, o) => s + (porId.get(o.id).peso || 0), 0);
  const trabajando = Boolean(progreso);
  // Two files with the same name in different sections: the buttons name the section too.
  const repetidos = useMemo(() => {
    const vistos = new Set();
    const dobles = new Set();
    for (const i of items) (vistos.has(i.nombre) ? dobles : vistos).add(i.nombre);
    return dobles;
  }, [items]);

  // What's marked right now, for the checks that come back later: an unmarked file lets go of what was brought.
  const marcados = useRef(new Set());
  const cola = useRef([]);
  const activos = useRef(0);
  const ponerRevision = (id, datos) => {
    if (montado.current && marcados.current.has(id)) setRevisados((antes) => new Map(antes).set(id, datos));
  };
  // At most two files are brought at a time, like the ZIP of the course.
  const seguirCola = () => {
    while (activos.current < AL_MISMO_TIEMPO && cola.current.length) {
      const item = cola.current.shift();
      if (!marcados.current.has(item.id) || !montado.current) continue;
      activos.current++;
      revisarArchivo(item)
        .then(
          (r) => ponerRevision(item.id, { estado: 'listo', ...r }),
          (e) => ponerRevision(item.id, { estado: 'error', motivo: motivoDe(e), reintentar: e?.message === 'bajar' }),
        )
        .finally(() => {
          activos.current--;
          seguirCola();
        });
    }
  };
  const revisar = (item) => {
    ponerRevision(item.id, { estado: 'revisando' });
    cola.current.push(item);
    seguirCola();
  };

  const alternar = async (item, poner) => {
    setFinal(null);
    if (poner) {
      const suma = bytes + (item.peso || 0);
      if (suma > AVISO_BYTES && bytes <= AVISO_BYTES) {
        const seguir = await confirmar({ titulo: `¿Sumar hasta ${peso(suma)}?`, texto: 'Es mucho y en un celular puede faltar memoria.', boton: 'Sumar igual' });
        if (!seguir || !montado.current) return;
      }
      marcados.current.add(item.id);
      if (!revisados.has(item.id)) revisar(item);
    } else {
      marcados.current.delete(item.id);
      setRevisados((antes) => {
        const nuevo = new Map(antes);
        nuevo.delete(item.id);
        return nuevo;
      });
    }
    setOrden((antes) => (poner ? [...antes.filter((o) => o.id !== item.id), { id: item.id, paginas: '' }] : antes.filter((o) => o.id !== item.id)));
  };
  // «Sacar» takes the focus to the same button of the next row, or of the one before, or back to the file in the list.
  const sacar = (item, n) => {
    const vecino = elegidos[n + 1] ?? elegidos[n - 1];
    alternar(item, false);
    requestAnimationFrame(() => {
      const destinoFoco = vecino ? filas.current.get(vecino.id)?.querySelector('[data-boton="sacar"]') : document.getElementById(`fusion-elegir-${item.id}`);
      destinoFoco?.focus();
    });
  };
  const cambiarPaginas = (id, paginas) => setOrden((antes) => antes.map((o) => (o.id === id ? { ...o, paginas } : o)));

  // Moving with the buttons keeps the focus on the same button of the row that moved, and says where it went.
  const mover = (id, hacia, boton) => {
    const desde = elegidos.findIndex((o) => o.id === id);
    const a = Math.max(0, Math.min(elegidos.length - 1, hacia));
    if (desde < 0 || desde === a) return;
    const nuevo = [...elegidos];
    const [fila] = nuevo.splice(desde, 1);
    nuevo.splice(a, 0, fila);
    setOrden(nuevo);
    setAnuncio(`${porId.get(id).nombre} quedó ${lugar(a)}.`);
    if (boton) {
      requestAnimationFrame(() => {
        const el = filas.current.get(id);
        const quiere = el?.querySelector(`[data-boton="${boton}"]:not(:disabled)`) ?? el?.querySelector('[data-boton]:not(:disabled)');
        quiere?.focus();
      });
    }
  };

  const correr = async (guardarEn) => {
    if (control.current || !listos) return;
    const archivo = nombreDeFusion(nombre, materia?.nombre);
    const mio = new AbortController();
    control.current = mio;
    setFinal(null);
    setProgreso({ hechos: 0, total: elegidos.length });
    let resultado;
    try {
      const r = await fusionar(elegidos.map((o) => ({ item: porId.get(o.id), paginas: revisados.get(o.id)?.tipo === 'pdf' ? o.paginas : '', blob: revisados.get(o.id)?.blob })), {
        titulo: archivo.replace(/\.pdf$/, ''),
        senal: mio.signal,
        alProgreso: (p) => montado.current && setProgreso(p),
      });
      let guardado = '';
      if (r.blob && !r.cancelado) {
        if (guardarEn) {
          const seccion = secciones.find((s) => String(s.id) === guardarEn);
          const ok = await onGuardar(seccion, new File([r.blob], archivo, { type: 'application/pdf' }));
          if (!ok) throw new Error('guardar');
          guardado = seccion.nombre;
        } else {
          guardarArchivo(r.blob, archivo);
        }
      }
      resultado = cierre(r, archivo, guardado);
      if (r.blob && !r.cancelado) setHecho(true);
    } catch (e) {
      resultado = { error: true, texto: e?.message === 'guardar' ? 'No se pudo guardar el PDF en la materia. Bajalo y sumalo a mano.' : 'No se pudo armar el PDF, quizás por falta de memoria. Probá con menos archivos.' };
    }
    control.current = null;
    if (!montado.current) return;
    setProgreso(null);
    setFinal(resultado);
    destino.current?.focus();
  };

  // Dragging a row with the mouse: the row it is over gets a line where it would land.
  const arrastre = (id, n) => ({
    draggable: !trabajando && agarrando === id,
    onDragStart: (e) => {
      arrastrado.current = id;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', '');
    },
    onDragOver: (e) => {
      if (!arrastrado.current) return;
      e.preventDefault();
      setSobre(n);
    },
    onDragLeave: (e) => {
      if (!e.currentTarget.contains(e.relatedTarget)) setSobre((s) => (s === n ? null : s));
    },
    onDrop: (e) => {
      e.preventDefault();
      if (arrastrado.current) mover(arrastrado.current, n);
      arrastrado.current = null;
      setSobre(null);
    },
    onDragEnd: () => {
      arrastrado.current = null;
      setSobre(null);
      setAgarrando(null);
    },
  });

  // Closing loses the order: with something chosen and nothing made yet, it asks first.
  const cerrar = async () => {
    if (trabajando) {
      control.current?.abort();
      return;
    }
    if (elegidos.length && !hecho && !(await confirmar({ titulo: '¿Cerrar sin fusionar?', texto: 'Se pierde el orden que armaste.', boton: 'Cerrar' }))) return;
    dialogo.current?.close();
  };

  return (
    <dialog
      ref={dialogo}
      className="previa elegir fusion"
      aria-labelledby="fusion-titulo"
      onClose={onCerrar}
      onCancel={(e) => { e.preventDefault(); cerrar(); }}
      onPointerDown={(e) => { desdeFondo.current = e.target === dialogo.current; }}
      onClick={(e) => { if (desdeFondo.current && e.target === dialogo.current) cerrar(); }}
    >
      <div className="previa__caja fusion__caja">
        <div className="previa__cabeza">
          <h2 id="fusion-titulo">Fusionar en un PDF</h2>
          <button type="button" className="boton boton--secundario boton--chico" onClick={cerrar}>Cerrar</button>
        </div>

        <div className="fusion__cuerpo">
          <section className="fusion__columna" aria-labelledby="fusion-elegir">
            <h3 id="fusion-elegir" className="fusion__subtitulo">Elegí</h3>
            <Campo etiqueta="Buscar">
              <input className="campo__control" type="search" value={filtro} onChange={(e) => setFiltro(e.target.value)} autoComplete="off" />
            </Campo>
            <div className="elegir__lista fusion__lista">
              {!grupos.length && <p>No hay PDF ni fotos con ese nombre.</p>}
              {grupos.map((g) => (
                <fieldset className="elegir__seccion" key={g.id}>
                  <legend className="elegir__titulo">{g.nombre}</legend>
                  {g.items.map((i) => {
                    const n = elegidos.findIndex((o) => o.id === i.id);
                    return (
                      <label className="opcion elegir__item" key={i.id}>
                        <input id={`fusion-elegir-${i.id}`} type="checkbox" checked={n >= 0} disabled={trabajando} onChange={(e) => alternar(i, e.target.checked)} />
                        <span className="fila__texto">
                          <span className="fila__nombre">{i.nombre}</span>
                          <span className="fila__dato">{datoDe(i)}</span>
                        </span>
                        {n >= 0 && <span className="fusion__numero" aria-hidden="true">{n + 1}</span>}
                      </label>
                    );
                  })}
                </fieldset>
              ))}
            </div>
          </section>

          <section className="fusion__columna" aria-labelledby="fusion-orden">
            <h3 id="fusion-orden" className="fusion__subtitulo">Orden{elegidos.length ? ` (${elegidos.length})` : ''}</h3>
            {!elegidos.length ? (
              <p className="fusion__vacio">Marcá los PDF y las fotos que van. Quedan en el orden en que los marcás.</p>
            ) : (
              <ol className="fusion__orden">
                {elegidos.map((o, n) => {
                  const item = porId.get(o.id);
                  const quien = repetidos.has(item.nombre) ? `${item.nombre}, de ${item.seccion || 'General'}` : item.nombre;
                  const error = errores.get(o.id);
                  const estado = revisados.get(o.id) ?? { estado: 'revisando' };
                  const idPaginas = `fusion-paginas-${n}`;
                  return (
                    <li
                      key={o.id}
                      ref={(el) => (el ? filas.current.set(o.id, el) : filas.current.delete(o.id))}
                      className={`fusion__fila${sobre === n ? ' fusion__fila--sobre' : ''}`}
                      {...arrastre(o.id, n)}
                    >
                      <span className="fusion__agarre" aria-hidden="true" title="Arrastrá para mover" onPointerDown={() => setAgarrando(o.id)} onPointerUp={() => setAgarrando(null)}>{n + 1}</span>
                      <span className="fusion__nombre">{item.nombre}</span>
                      <div className="fusion__paginas">
                        {estado.estado === 'listo' && estado.tipo === 'pdf' && (
                          <>
                            <label htmlFor={idPaginas}>Páginas</label>
                            <input
                              id={idPaginas}
                              className="campo__control"
                              value={o.paginas}
                              placeholder="Todas"
                              autoComplete="off"
                              disabled={trabajando}
                              aria-invalid={error ? 'true' : undefined}
                              aria-describedby={`${idPaginas}-total${error ? ` ${idPaginas}-error` : ''}`}
                              onChange={(e) => cambiarPaginas(o.id, e.target.value)}
                            />
                            <span id={`${idPaginas}-total`} className="fusion__total">de {cuenta(estado.paginas, 'página', 'páginas')}</span>
                            {error && <p id={`${idPaginas}-error`} className="campo__error">{error}</p>}
                          </>
                        )}
                        <span className="fusion__estado" aria-live="polite">
                          {estado.estado === 'listo' && estado.tipo === 'imagen' && <span className="fusion__total">Foto, va en una página</span>}
                          {estado.estado === 'revisando' && <span className="fusion__total">Revisando {item.nombre}</span>}
                          {estado.estado === 'error' && <span className="campo__error">{estado.motivo[0].toUpperCase() + estado.motivo.slice(1)}. Sacalo para seguir.</span>}
                        </span>
                        {estado.estado === 'error' && estado.reintentar && <button type="button" className="seccion__ocultar" onClick={() => revisar(item)}>Probar de nuevo</button>}
                      </div>
                      <div className="fusion__acciones">
                        {conBotones && <button type="button" className="seccion__ocultar" data-boton="subir" disabled={trabajando || n === 0} aria-label={`Mover arriba ${quien}`} onClick={() => mover(o.id, n - 1, 'subir')}>Mover arriba</button>}
                        {conBotones && <button type="button" className="seccion__ocultar" data-boton="bajar" disabled={trabajando || n === elegidos.length - 1} aria-label={`Mover abajo ${quien}`} onClick={() => mover(o.id, n + 1, 'bajar')}>Mover abajo</button>}
                        <button type="button" className="seccion__ocultar" data-boton="sacar" disabled={trabajando} aria-label={`Sacar ${quien}`} onClick={() => sacar(item, n)}>Sacar</button>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
            <p className="solo-lectores" role="status">{anuncio}</p>
            {elegidos.length > 0 && (
            <div className="fusion__datos">
              <Campo etiqueta="Nombre del PDF">
                <input className="campo__control" value={nombre} placeholder={nombreDeFusion('', materia?.nombre).replace(/\.pdf$/, '')} maxLength={110} autoComplete="off" disabled={trabajando} onChange={(e) => setNombre(e.target.value)} />
              </Campo>
              {secciones.length > 0 && (
                <Campo etiqueta="Sección donde guardarlo">
                  <select className="campo__control" value={seccionId} disabled={trabajando} onChange={(e) => setSeccionId(e.target.value)}>
                    {secciones.map((s) => <option key={s.id} value={String(s.id)}>{s.nombre}</option>)}
                  </select>
                </Campo>
              )}
            </div>
            )}
          </section>
        </div>

        <div className="elegir__pie fusion__pie">
          {trabajando ? (
            <div className="fusion__trabajando">
              <progress className="herramienta__barra" max={progreso.total} value={progreso.hechos} aria-label="Avance de la fusión" />
              <span>Sumando {Math.min(progreso.hechos + 1, progreso.total)} de {progreso.total}</span>
              <button type="button" className="boton boton--secundario" onClick={() => control.current?.abort()}>Cancelar</button>
            </div>
          ) : (
            <div className="fusion__botones">
              <button type="button" className="boton" disabled={!listos} onClick={() => correr('')}>
                {elegidos.length ? `Bajar el PDF (${cuenta(elegidos.length, 'archivo', 'archivos')})` : 'Elegí qué fusionar'}
              </button>
              {secciones.length > 0 && (
                <button type="button" className="boton boton--secundario" disabled={!listos} onClick={() => correr(seccionId)}>Guardar en la materia</button>
              )}
            </div>
          )}
          {!trabajando && elegidos.length > 0 && !listos && (
            <p className="fusion__falta">{revisando ? `Revisando ${revisando === 1 ? 'un archivo' : `${revisando} archivos`}.` : 'Arreglá lo marcado en el orden para seguir.'}</p>
          )}
          <div ref={destino} tabIndex={-1} className="fusion__final" role="status" aria-live="polite">
            {trabajando && <p className="solo-lectores">Fusionando.</p>}
            {final && <div className={`mensaje${final.error ? ' mensaje--error' : ' mensaje--ok'}`}><p>{final.texto}</p></div>}
          </div>
        </div>
      </div>
    </dialog>
  );
}

/** The card in the column of the course. `items`: the PDFs and photos that can go (`fusionables`). */
export default function FusionarApuntes({ materia, items, secciones, onGuardar }) {
  const [abierta, setAbierta] = useState(false);
  const boton = useRef(null);
  return (
    <div className="herramienta">
      <p className="herramienta__nota">Juntá PDF y fotos de esta materia en uno solo, en el orden que quieras.</p>
      <div className="herramienta__botones">
        <button ref={boton} type="button" className="boton" aria-haspopup="dialog" onClick={() => setAbierta(true)}>Elegir qué fusionar</button>
      </div>
      {abierta && (
        <Hoja
          materia={materia}
          items={items}
          secciones={secciones}
          onGuardar={onGuardar}
          onCerrar={() => {
            setAbierta(false);
            boton.current?.focus();
          }}
        />
      )}
    </div>
  );
}
