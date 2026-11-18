import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { llevarArchivo, seccionesDe } from '../../lib/enVivo/deTusMaterias';
import { llevarMateria, seAbreEnLaMesa } from '../../lib/enVivo/materiaMesa';
import { llevarResumen } from '../../lib/enVivo/resumenMesa';
import { esAgregada } from '../../lib/propias';
import { useMio } from '../../lib/mio';
import { buscarEnBanco, cargarBanco, MATERIAS_SANTO } from '../../lib/santoResumen';
import { useConsulta } from '../../lib/useConsulta';
import { useQuieto } from '../../lib/useQuieto';
import { useMaterias } from '../ElegirMateria';
import { Cargando, ErrorConReintento } from '../Filas';
import Icono from './Iconos';

// The second step of the table's «Abrir»: something of the student's courses or of El Santo Resumen, chosen without
// leaving the session. Loaded apart from the table, only when someone opens one of them. `alAbrir(id)`: the tab is on
// the table; `alVolver`: back to the tools.

const normal = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const coincide = (texto, filtro) => normal(filtro).split(/\s+/).filter(Boolean).every((p) => normal(texto).includes(p));
const CLASE = (item) => (/^image\//.test(item.mime ?? '') || /\.(png|jpe?g|gif|webp)$/i.test(item.archivo ?? '') ? 'Foto' : 'PDF');

// Each step takes the focus on its «Volver», where the keyboard goes on from.
function Paso({ titulo, alVolver, children }) {
  const volver = useRef(null);
  useEffect(() => {
    volver.current?.focus({ preventScroll: true });
  }, []);
  return (
    <div className="envivo-paso">
      <div className="envivo-paso__cabeza">
        <button ref={volver} type="button" className="envivo-paso__volver" onClick={alVolver}>Volver</button>
        <h3 className="envivo-paso__titulo">{titulo}</h3>
      </div>
      {children}
    </div>
  );
}

function Buscar({ valor, alCambiar, etiqueta }) {
  const id = useId();
  return (
    <div className="envivo-paso__buscar">
      <label className="solo-lectores" htmlFor={id}>{etiqueta}</label>
      <input id={id} className="campo__control" type="search" enterKeyHint="search" placeholder={etiqueta} autoComplete="off" value={valor} onChange={(e) => alCambiar(e.target.value)} />
    </div>
  );
}

/** A file of one of the student's courses, or the whole course. */
export function DeTusMaterias({ sesion, alAbrir, alVolver }) {
  const mio = useMio();
  const materias = useMaterias(useMemo(() => (mio.propias ?? []).filter((p) => !esAgregada(p)), [mio.propias]));
  const [materia, setMateria] = useState(null);
  const [filtro, setFiltro] = useState('');
  if (materia) return <ArchivosDe key={materia.id} sesion={sesion} materia={materia} mio={mio} alAbrir={alAbrir} alVolver={() => setMateria(null)} />;
  const grupos = materias.grupos.map((g) => ({ ...g, lista: g.lista.filter((m) => coincide(m.nombre, filtro)) })).filter((g) => g.lista.length);
  return (
    <Paso titulo="De tus materias" alVolver={alVolver}>
      <Buscar valor={filtro} alCambiar={setFiltro} etiqueta="Buscar una materia" />
      <div className="envivo-paso__lista" aria-busy={!materias.cargadas ? 'true' : undefined}>
        {!materias.cargadas && !grupos.length && <Cargando texto="Buscando tus materias" cuantas={4} />}
        {materias.cargadas && !grupos.length && <p className="envivo-panel__nota">{filtro ? 'No hay materias con ese nombre.' : 'Todavía no tenés materias.'}</p>}
        {grupos.map((g) => (
          <section key={g.nombre}>
            <h4 className="envivo-panel__sub">{g.nombre}</h4>
            <ul className="envivo-paso__opciones">
              {g.lista.map((m) => (
                <li key={m.id}>
                  <button type="button" className="envivo-abrir__opcion" onClick={() => setMateria(m)}>{m.nombre}</button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Paso>
  );
}

function ArchivosDe({ sesion, materia, mio, alAbrir, alVolver }) {
  const [filtro, setFiltro] = useState('');
  const [trayendo, setTrayendo] = useState(null);
  const [error, setError] = useState('');
  // Read once per course: the edits of the student while the box is open don't reload it.
  const { datos: secciones, error: falla, recargar } = useConsulta(() => seccionesDe(materia, mio), [materia.id]);
  const archivos = (secciones ?? [])
    .map((g) => ({ ...g, items: g.items.filter((i) => seAbreEnLaMesa(i) && coincide(`${i.nombre} ${i.archivo ?? ''}`, filtro)) }))
    .filter((g) => g.items.length);

  const traer = async (item, clave) => {
    if (trayendo) return;
    setTrayendo(clave);
    setError('');
    try {
      alAbrir(await llevarArchivo(sesion, item));
    } catch (e) {
      setError(e?.conocido ? e.message : 'No se pudo traer el archivo. Probá de nuevo.');
      setTrayendo(null);
    }
  };
  const entera = () => {
    setError('');
    try {
      alAbrir(llevarMateria(sesion, materia.nombre, secciones ?? [], materia.id));
    } catch (e) {
      setError(e?.conocido ? e.message : 'No se pudo abrir la materia.');
    }
  };

  return (
    <Paso titulo={materia.nombre} alVolver={alVolver}>
      {secciones && secciones.length > 0 && (
        <button type="button" className="envivo-abrir__opcion envivo-paso__entera" onClick={entera}>
          <Icono nombre="materias" />
          La materia entera
        </button>
      )}
      <Buscar valor={filtro} alCambiar={setFiltro} etiqueta="Buscar un archivo" />
      {error && <p className="mensaje mensaje--error" role="alert">{error}</p>}
      <div className="envivo-paso__lista" aria-busy={!secciones && !falla ? 'true' : undefined}>
        {falla && !secciones && <ErrorConReintento texto={falla} recargar={recargar} />}
        {!falla && !secciones && <Cargando texto="Buscando los archivos" cuantas={4} />}
        {secciones && !archivos.length && <p className="envivo-panel__nota">{filtro ? 'No hay archivos con ese nombre.' : 'Esta materia no tiene PDF ni fotos.'}</p>}
        {archivos.map((g) => (
          <section key={g.id ?? g.nombre}>
            <h4 className="envivo-panel__sub">{g.nombre}</h4>
            <ul className="envivo-paso__opciones">
              {g.items.map((i) => {
                const clave = i.id ?? `${g.nombre}:${i.nombre}`;
                const ahora = trayendo === clave;
                return (
                  <li key={clave}>
                    <button type="button" className="envivo-abrir__opcion envivo-paso__archivo" aria-disabled={trayendo ? 'true' : undefined} aria-busy={ahora ? 'true' : undefined} onClick={() => traer(i, clave)}>
                      <span className="envivo-paso__nombre">{i.nombre}</span>
                      <span className="envivo-lista__dato">{ahora ? 'Trayendo…' : CLASE(i)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
      <p className="solo-lectores" role="status">{trayendo ? 'Trayendo el archivo.' : ''}</p>
    </Paso>
  );
}

/** A summary of the bank of El Santo Resumen. */
export function DelSanto({ sesion, alAbrir, alVolver }) {
  const idMateria = useId();
  const [slug, setSlug] = useState('');
  const [filtro, setFiltro] = useState('');
  const [error, setError] = useState('');
  const consulta = useQuieto(filtro.trim(), 250);
  const clave = `${slug}|${consulta}`;
  const { datos, error: falla, recargar } = useConsulta(
    async () => ({ clave, lista: consulta.length >= 2 ? await buscarEnBanco(consulta, slug) : await cargarBanco(slug) }),
    [clave],
  );
  // A list of another subject or search is not shown: it would look like the answer.
  const lista = datos?.clave === clave ? datos.lista.filter((r) => r.formato) : null;
  const abrir = (r) => {
    setError('');
    try {
      alAbrir(llevarResumen(sesion, r));
    } catch (e) {
      setError(e?.conocido ? e.message : 'No se pudo abrir el resumen.');
    }
  };
  return (
    <Paso titulo="Del Santo Resumen" alVolver={alVolver}>
      <div className="envivo-paso__filtros">
        <label className="solo-lectores" htmlFor={idMateria}>Materia</label>
        <select id={idMateria} className="campo__control" value={slug} onChange={(e) => setSlug(e.target.value)}>
          <option value="">Todas las materias</option>
          {MATERIAS_SANTO.map(([s, nombre]) => <option key={s} value={s}>{nombre}</option>)}
        </select>
        <Buscar valor={filtro} alCambiar={setFiltro} etiqueta="Buscar un resumen" />
      </div>
      {error && <p className="mensaje mensaje--error" role="alert">{error}</p>}
      <p className="solo-lectores" role="status">{lista ? (lista.length === 1 ? 'Un resumen' : `${lista.length} resúmenes`) : ''}</p>
      <div className="envivo-paso__lista" aria-busy={!lista && !falla ? 'true' : undefined}>
        {falla && !lista && <ErrorConReintento texto={falla} recargar={recargar} />}
        {!falla && !lista && <Cargando texto="Buscando en el banco" cuantas={4} />}
        {lista && !lista.length && <p className="envivo-panel__nota">{consulta.length >= 2 ? 'No hay resúmenes con esas palabras.' : 'Esta materia todavía no tiene resúmenes.'}</p>}
        {lista && lista.length > 0 && (
          <ul className="envivo-paso__opciones">
            {lista.map((r) => (
              <li key={r.id}>
                <button type="button" className="envivo-abrir__opcion envivo-paso__archivo" onClick={() => abrir(r)}>
                  <span className="envivo-paso__nombre">{r.titulo}</span>
                  <span className="envivo-lista__dato">{[slug ? '' : r.materiaNombre, r.dato].filter(Boolean).join(', ')}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Paso>
  );
}

