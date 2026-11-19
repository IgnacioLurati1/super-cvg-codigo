import { useEffect, useRef } from 'react';
import { fecha, peso } from '../lib/datos';
import { TOPE_CARPETA_SUELTA } from '../lib/drivePublico';
import { contenidoDeCarpeta, nombreDeCarpeta } from '../lib/mapasDrive';
import { useConsulta } from '../lib/useConsulta';
import { Cargando } from './Filas';
import { Icono, IconoDeItem } from './Simbolo';

/**
 * A Drive folder linked from a course, looked through inside the preview sheet: one level at a time, asked to Drive as
 * it opens (mapasDrive.js keeps each level for the visit). `camino`: the folders from the linked one to the one in view
 * ({ id, k, nombre }), kept by the sheet so it comes back to the same place after a file. `alAbrir(nodo, donde)`: a file.
 * `volvioDe`: the id of the file it comes back from, to put the focus on its row.
 */
export default function CarpetaDeDrive({ camino, alCambiarCamino, alAbrir, volvioDe = null, conTitulo = false }) {
  const actual = camino[camino.length - 1];
  // A folder from a link of a text says its own name only in Drive: it is asked once.
  const { datos: nombreRaiz } = useConsulta(() => (camino[0].nombre ? Promise.resolve(camino[0].nombre) : nombreDeCarpeta(camino[0])), [camino[0].id]);
  const nombreDe = (c, i) => c.nombre || (i === 0 && nombreRaiz) || 'Carpeta de Drive';
  const titulado = conTitulo || camino.length > 1;
  const { datos, error, cargando, recargar } = useConsulta(() => contenidoDeCarpeta(actual), [actual.id]);
  const titulo = useRef(null);
  const lista = useRef(null);
  const movio = useRef(false);

  // After going into a folder or back up, the focus goes to where it is now; after a file, to its row.
  useEffect(() => {
    if (!datos) return;
    if (volvioDe) {
      lista.current?.querySelector(`[data-nodo="${CSS.escape(volvioDe)}"]`)?.focus();
    } else if (movio.current) (titulo.current ?? lista.current?.querySelector('button'))?.focus();
    movio.current = false;
  }, [datos, volvioDe]);

  const ir = (nuevo) => {
    movio.current = true;
    alCambiarCamino(nuevo);
  };
  const donde = camino.map(nombreDe).join(', ');

  return (
    <section className="carpeta-drive" aria-labelledby={titulado ? 'carpeta-drive-titulo' : 'previa-titulo'}>
      {camino.length > 1 && (
        <nav className="carpeta-drive__camino" aria-label="Carpetas">
          <ol>
            {camino.slice(0, -1).map((c, i) => (
              <li key={c.id}>
                <button type="button" className="carpeta-drive__paso" onClick={() => ir(camino.slice(0, i + 1))}>{nombreDe(c, i)}</button>
              </li>
            ))}
          </ol>
        </nav>
      )}
      {/* The linked folder already has its name on the sheet, unless it came from a link of a text. */}
      {titulado && (
        <h3 id="carpeta-drive-titulo" ref={titulo} tabIndex={-1} className="carpeta-drive__titulo">
          <Icono nombre="carpeta" tono="enlace" tamano="tipo" />
          {nombreDe(actual, camino.length - 1)}
        </h3>
      )}
      {cargando && !datos && !error && <Cargando texto="Cargando la carpeta" cuantas={3} />}
      {error && !datos && (
        <div className="previa__aviso" role="alert">
          <p>{error}</p>
          <button type="button" className="boton boton--secundario" onClick={recargar}>Probar de nuevo</button>
        </div>
      )}
      {datos?.grande && <p className="previa__aviso">Esta carpeta tiene más de {TOPE_CARPETA_SUELTA} archivos. Abrila en Drive para verla.</p>}
      {datos && !datos.grande && !datos.nodos.length && <p className="previa__aviso">Esta carpeta está vacía.</p>}
      {datos && datos.nodos.length > 0 && (
        <ul ref={lista} className="carpeta-drive__lista">
          {datos.nodos.map((nodo) => (
            <li key={nodo.id} className="fila">
              <button
                type="button"
                className="fila__principal"
                data-nodo={nodo.id}
                onClick={() => (nodo.c ? ir([...camino, { id: nodo.a ?? nodo.id, k: nodo.k ?? null, nombre: nodo.n }]) : alAbrir(nodo, donde))}
              >
                {nodo.c ? <Icono nombre="carpeta" tono="enlace" tamano="tipo" /> : <IconoDeItem item={{ tipo: 'archivo', archivo: nodo.n, mime: nodo.m ?? '' }} />}
                <span className="fila__texto">
                  <span className="fila__nombre">{nodo.n}</span>
                  {!nodo.c && (nodo.s || nodo.f) && <span className="fila__dato">{[nodo.s ? peso(nodo.s) : null, nodo.f ? `Del ${fecha(Math.floor(nodo.f / 1000))}` : null].filter(Boolean).join(', ')}</span>}
                </span>
                {nodo.c && <svg className="carpeta-drive__flecha" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 6l6 6-6 6" /></svg>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
