// «Descargas inteligentes» in Configuración, under its switch: whether this device can, the last download, and the
// sections each course skips (descargas.js). A course's sections are asked only when it is opened, one at a time.
import { useState } from 'react';
import { cargarContenido, cargarMaterias, cargarPerfil } from '../lib/campus';
import { useDescargas } from '../lib/descargas';
import { descargarSeccion, useMio } from '../lib/mio';
import { sesionRecordada, useToken } from '../lib/sesion';
import { useConsulta } from '../lib/useConsulta';
import { Cargando, ErrorConReintento } from './Filas';
import { useUI } from './ui';
import './descargasInteligentes.css';

const NO_SE_GUARDO = 'No se pudo guardar. Probá de nuevo.';
const DIA_MS = 86_400_000;

const hora = (d) => new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit' }).format(d);
function cuandoFue(ms, ahora = new Date()) {
  const d = new Date(ms);
  const inicio = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dias = Math.round((inicio(ahora) - inicio(d)) / DIA_MS);
  const dia = dias === 0 ? 'hoy' : dias === 1 ? 'ayer' : `el ${new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long' }).format(d)}`;
  return `${dia} a las ${hora(d)}`;
}
const numero = (n, decimales) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: decimales }).format(n);
const tamano = (bytes) => (bytes >= 1024 * 1024 ? `${numero(bytes / (1024 * 1024), 1)} MB` : `${numero(Math.max(1, bytes / 1024), 0)} KB`);
const archivos = (n) => (n === 1 ? '1 archivo' : `${n} archivos`);

/** Why it doesn't run here, or when it last downloaded and how much. */
export function EstadoDescargas({ prendido }) {
  useToken();
  const { disponible, ultima } = useDescargas();
  const lineas = [];
  if (disponible === false) lineas.push('Necesita Super CVG instalado en un celu Android.');
  if (!sesionRecordada()) lineas.push('Necesita que entres con «Seguir conectado».');
  if (prendido && disponible && sesionRecordada()) {
    lineas.push(ultima ? `Última descarga: ${cuandoFue(ultima.cuando)}, ${tamano(ultima.bytes)} en ${archivos(ultima.archivos)}.` : 'Todavía no bajó nada.');
  }
  if (!lineas.length) return null;
  return (
    <div className="descargas__estado" aria-live="polite">
      {lineas.map((l) => <p key={l}>{l}</p>)}
    </div>
  );
}

// The sections of a course that have files, in the campus order, with how many.
function seccionesConArchivos(items) {
  const porSeccion = new Map();
  for (const i of items ?? []) {
    if (i.tipo !== 'archivo' || !Number.isSafeInteger(i.seccionId) || i.seccionId <= 0) continue;
    const s = porSeccion.get(i.seccionId) ?? { id: i.seccionId, nombre: i.seccion || 'Sin nombre', archivos: 0 };
    s.archivos += 1;
    porSeccion.set(i.seccionId, s);
  }
  return [...porSeccion.values()];
}

function SeccionesDeMateria({ materia, salteadas }) {
  const { avisar } = useUI();
  const contenido = useConsulta(() => cargarContenido(materia), [materia.id], { alInstante: true });
  if (contenido.error && !contenido.datos) return <ErrorConReintento texto={contenido.error} recargar={contenido.recargar} />;
  if (!contenido.datos) return <Cargando texto="Buscando sus secciones" cuantas={2} />;
  const secciones = seccionesConArchivos(contenido.datos);
  if (!secciones.length) return <p className="descargas__vacia">No tiene archivos para bajar.</p>;
  return (
    <ul className="descargas__secciones">
      {secciones.map((s) => {
        const id = `descargar-${materia.id}-${s.id}`;
        return (
          <li key={s.id} className="descargas__seccion">
            <input
              id={id}
              type="checkbox"
              checked={!salteadas.includes(s.id)}
              onChange={(e) => {
                if (!descargarSeccion(materia.id, s.id, e.target.checked)) avisar(NO_SE_GUARDO, 'error');
              }}
            />
            <label htmlFor={id}>
              {s.nombre}
              <span className="descargas__cuantos">{archivos(s.archivos)}</span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

function Materia({ materia, salteadas }) {
  const [abierta, setAbierta] = useState(false);
  return (
    <details className="descargas__materia" onToggle={(e) => setAbierta(e.currentTarget.open)}>
      <summary>
        <span className="descargas__nombre">{materia.nombre}</span>
        {salteadas.length > 0 && <span className="descargas__cuantos">{salteadas.length === 1 ? '1 salteada' : `${salteadas.length} salteadas`}</span>}
      </summary>
      {abierta && <SeccionesDeMateria materia={materia} salteadas={salteadas} />}
    </details>
  );
}

/** The courses in progress, each with the sections the night brings. */
export function SeccionesQueBaja() {
  const mio = useMio();
  const materias = useConsulta(async () => {
    await cargarPerfil();
    return cargarMaterias();
  }, [], { alInstante: true });
  return (
    <div className="descargas__que">
      <h3 id="descargas-secciones">Qué secciones baja</h3>
      <p>Abrí una materia y destildá las que no hagan falta.</p>
      {materias.error && !materias.datos && <ErrorConReintento texto={materias.error} recargar={materias.recargar} />}
      {!materias.datos && !materias.error && <Cargando texto="Buscando tus materias" cuantas={3} />}
      {materias.datos && !materias.datos.enCurso.length && <p>No estás cursando materias en el campus.</p>}
      {materias.datos?.enCurso.length > 0 && (
        <div className="descargas__materias" role="group" aria-labelledby="descargas-secciones">
          {materias.datos.enCurso.map((m) => <Materia key={m.id} materia={m} salteadas={mio.sinDescargar?.[m.id] ?? []} />)}
        </div>
      )}
    </div>
  );
}
