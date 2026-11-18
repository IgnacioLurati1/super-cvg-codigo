import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Cinta, ListaSenaladores } from './Senaladores';

const ANCHO_MINIATURA = 104;
const NOMBRES = { notas: 'Notas', paginas: 'Páginas', indice: 'Índice' };
const MAX_CITA = 180;
// In the name of a note's buttons, so each one says which highlight it is about.
const MAX_CITA_BOTON = 40;

/** One watcher for every small page: `vigilar(el, alVer)` calls alVer once, when el comes near the panel's view. */
function useVigia(raiz) {
  const vigia = useRef(null);
  const esperando = useRef(new Map());
  useEffect(() => {
    const io = new IntersectionObserver((entradas) => {
      for (const e of entradas) {
        const alVer = e.isIntersecting && esperando.current.get(e.target);
        if (!alVer) continue;
        io.unobserve(e.target);
        esperando.current.delete(e.target);
        alVer();
      }
    }, { root: raiz.current, rootMargin: '240px 0px' });
    vigia.current = io;
    // The small pages mount before this: they were waiting.
    for (const el of esperando.current.keys()) io.observe(el);
    return () => {
      io.disconnect();
      vigia.current = null;
    };
  }, [raiz]);
  return useCallback((el, alVer) => {
    esperando.current.set(el, alVer);
    vigia.current?.observe(el);
    return () => {
      esperando.current.delete(el);
      vigia.current?.unobserve(el);
    };
  }, []);
}

/** A small drawing of a page, made when it comes into the panel's view. */
function Miniatura({ pdf, numero, tamano, vigilar }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    let vivo = true;
    let tarea = null;
    // Its item, which keeps its size while it's out of view (content-visibility in lector.css).
    const dejar = vigilar(el.closest('li') ?? el, async () => {
      try {
        const hoja = await pdf.getPage(numero);
        if (!vivo) return;
        const uno = hoja.getViewport({ scale: 1 });
        const vista = hoja.getViewport({ scale: (ANCHO_MINIATURA * Math.min(window.devicePixelRatio || 1, 2)) / uno.width });
        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(vista.width);
        canvas.height = Math.floor(vista.height);
        tarea = hoja.render({ canvas, viewport: vista });
        await tarea.promise;
        if (vivo) el.replaceChildren(canvas);
      } catch {
        // Cancelled, or a page that can't be drawn: its number is enough.
      }
    });
    return () => {
      vivo = false;
      dejar();
      tarea?.cancel();
      for (const c of el.querySelectorAll('canvas')) c.width = 0;
    };
  }, [pdf, numero, vigilar]);
  return <span ref={ref} className="lector__mini" style={{ aspectRatio: `${tamano[0]} / ${tamano[1]}` }} />;
}

/** The quote of each highlight, read from the open file: it is never kept. */
function useCitas(resaltados, obtenerTexto) {
  const [citas, setCitas] = useState({});
  useEffect(() => {
    let vivo = true;
    for (const r of resaltados) {
      if (r.desde === null) continue;
      obtenerTexto(r.pagina).then((t) => {
        const cita = t.texto.slice(r.desde, r.hasta).replace(/\s+/g, ' ').trim();
        if (vivo && cita) setCitas((c) => (c[r.id] === cita ? c : { ...c, [r.id]: cita }));
      }).catch(() => {});
    }
    return () => {
      vivo = false;
    };
  }, [resaltados, obtenerTexto]);
  return citas;
}

const recortada = (t, max = MAX_CITA) => (t.length > max ? `${t.slice(0, max).trimEnd()}…` : t);

function Notas({ resaltados, obtenerTexto, onIr, onEditar, onBorrar }) {
  const citas = useCitas(resaltados, obtenerTexto);
  if (!resaltados.length) {
    return (
      <div className="lector__vacio">
        <p>Todavía no resaltaste nada en este archivo.</p>
        <p>Seleccioná un texto de una página para resaltarlo y sumarle una nota.</p>
      </div>
    );
  }
  const paginas = [...new Set(resaltados.map((r) => r.pagina))];
  return (
    <ol className="lector__notas">
      {paginas.map((p) => (
        <li key={p}>
          <h3 className="lector__notas-pagina">Página {p}</h3>
          <ul>
            {resaltados.filter((r) => r.pagina === p).map((r) => {
              const cual = `de la página ${r.pagina}${citas[r.id] ? `, «${recortada(citas[r.id], MAX_CITA_BOTON)}»` : ''}`;
              return (
                <li key={r.id} className="lector__nota" data-color={r.color} data-id={r.id} style={r.autor ? { '--autor': r.autor.color } : undefined} data-autor={r.autor ? '' : undefined}>
                  <button type="button" className="lector__nota-ir" onClick={() => onIr(r)}>
                    {r.autor && <span className="lector__nota-autor">{r.autor.propio ? 'Vos' : r.autor.nombre}</span>}
                    <span className="lector__nota-cita">{citas[r.id] ? `«${recortada(citas[r.id])}»` : 'Resaltado'}</span>
                    {r.nota && <span className="lector__nota-texto">{r.nota}</span>}
                  </button>
                  <span className="lector__nota-acciones">
                    {(!r.autor || r.autor.propio) && <button type="button" className="lector__chico" aria-label={`${r.nota ? 'Editar nota del' : 'Sumar nota al'} resaltado ${cual}`} onClick={() => onEditar(r)}>{r.nota ? 'Editar nota' : 'Sumar nota'}</button>}
                    <button type="button" className="lector__chico" aria-label={`Borrar el resaltado ${cual}`} onClick={() => onBorrar(r)}>Borrar</button>
                  </span>
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ol>
  );
}

// The places of the file's index, resolved when touched.
function Indice({ items, onIr }) {
  return (
    <ul className="lector__indice">
      {items.map((it, i) => (
        <li key={i}>
          <button type="button" className="lector__indice-ir" onClick={() => onIr(it)}>{it.title || 'Sin título'}</button>
          {it.items?.length > 0 && <Indice items={it.items} onIr={onIr} />}
        </li>
      ))}
    </ul>
  );
}

/** The side of the reader: the student's bookmarks and notes, the pages in small and the file's own index, if it has
 * one. `senaladores`: null for a file that keeps nothing. */
export default function Panel({ pdf, tamanos, pagina, pestana, onPestana, pestanas, indice, resaltados, senaladores = null, obtenerTexto, onIrPagina, onIrDestino, onIrResaltado, onEditar, onBorrar, onSacarSenalador, onNombrarSenalador, onCerrar }) {
  const id = useId();
  const raiz = useRef(null);
  const lista = useRef(null);
  const vigilar = useVigia(raiz);
  const senaladas = useMemo(() => new Set((senaladores ?? []).map((s) => s.pagina)), [senaladores]);

  // The page being read stays in view among the small ones.
  useEffect(() => {
    if (pestana !== 'paginas') return;
    lista.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest' });
  }, [pestana, pagina]);

  const moverPestana = (e) => {
    const i = pestanas.indexOf(pestana);
    const otra = e.key === 'ArrowRight' ? pestanas[(i + 1) % pestanas.length] : e.key === 'ArrowLeft' ? pestanas[(i - 1 + pestanas.length) % pestanas.length] : null;
    if (!otra) return;
    e.preventDefault();
    onPestana(otra);
    document.getElementById(`${id}-${otra}`)?.focus();
  };

  return (
    <aside className="lector__panel" aria-label="Notas y páginas">
      <div className="lector__pestanas">
        <div role="tablist" aria-label="Qué mostrar" onKeyDown={moverPestana}>
          {pestanas.map((p) => (
            <button
              key={p}
              id={`${id}-${p}`}
              type="button"
              role="tab"
              aria-selected={pestana === p}
              aria-controls={`${id}-panel`}
              tabIndex={pestana === p ? 0 : -1}
              className="lector__pestana"
              onClick={() => onPestana(p)}
            >
              {NOMBRES[p]}{p === 'notas' && resaltados.length > 0 && <span className="lector__cuenta">{resaltados.length}</span>}
            </button>
          ))}
        </div>
        <button type="button" className="lector__boton lector__panel-cerrar" onClick={onCerrar} aria-label="Cerrar el panel">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>
      <div ref={raiz} id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${pestana}`} className="lector__panel-cuerpo" tabIndex={0}>
        {pestana === 'notas' && senaladores && <ListaSenaladores senaladores={senaladores} pagina={pagina} onIr={onIrPagina} onSacar={onSacarSenalador} onNombrar={onNombrarSenalador} />}
        {pestana === 'notas' && <Notas resaltados={resaltados} obtenerTexto={obtenerTexto} onIr={onIrResaltado} onEditar={onEditar} onBorrar={onBorrar} />}
        {pestana === 'paginas' && (
          <ol ref={lista} className="lector__miniaturas">
            {tamanos.map((t, i) => (
              <li key={i}>
                <button type="button" className="lector__mini-ir" aria-current={pagina === i + 1 ? 'page' : undefined} onClick={() => onIrPagina(i + 1)}>
                  <Miniatura pdf={pdf} numero={i + 1} tamano={t} vigilar={vigilar} />
                  {senaladas.has(i + 1) && <Cinta className="lector__mini-cinta" />}
                  <span className="lector__mini-numero"><span className="solo-lectores">Página </span>{i + 1}{senaladas.has(i + 1) && <span className="solo-lectores">, señalada</span>}</span>
                </button>
              </li>
            ))}
          </ol>
        )}
        {pestana === 'indice' && indice?.length > 0 && <Indice items={indice} onIr={onIrDestino} />}
      </div>
    </aside>
  );
}
