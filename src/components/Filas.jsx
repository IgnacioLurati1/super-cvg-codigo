import { fecha } from '../lib/datos';
import { tonoDeItem } from '../lib/simbolos';
import { useMarcarVistos } from '../lib/vistos';
import Campo from './Campo';
import { useAbrirPrevia } from './Previa';
import Simbolo, { Icono, IconoDeItem } from './Simbolo';

export function extension(nombre) {
  const partes = nombre?.split('.') ?? [];
  return partes.length > 1 ? partes.at(-1).toLocaleUpperCase('es') : 'Archivo';
}

export function datoDe(item) {
  return descripcionDe(item).filter(Boolean).join(', ');
}

function descripcionDe(item) {
  // Classroom says what each thing is and where it came from.
  if (item.detalle) return [item.detalle];
  if (item.tipo === 'archivo') return [extension(item.archivo), item.modificado ? fecha(item.modificado) : null];
  if (item.tipo === 'enlace') return [item.video ? `Video en ${item.dominio}` : `Enlace a ${item.dominio}`];
  if (item.tipo === 'texto') return [cuantosEnlaces(item)];
  return [item.clase];
}

const cuantosEnlaces = (item) => {
  const n = item.enlaces?.length ?? 0;
  return n === 0 ? 'Texto' : n === 1 ? 'Texto con un enlace' : `Texto con ${n} enlaces`;
};

/** Whether an item goes under a type filter. A text area with links also counts as links: in some courses the
 * Drive folders live there. */
export const esDeTipo = (item, tipo) => !tipo || item.tipo === tipo || (tipo === 'enlace' && item.tipo === 'texto' && item.enlaces?.length > 0);

// Tocar una fila nunca abre ni baja nada: primero muestra de qué se trata.
// `partes`: the name in pieces, with what was searched marked (Buscar).
// A course on a live session's table (enVivo/herramientas/Materia.jsx) opens its own way: `onAbrir` instead of the
// preview, or `enlace`, an address that opens in another tab. `deshabilitado`: it can't open now. `children`: under it.
// `conTono`: its kind's color on the row, for the looks of a course page that paint it (ajustes.contenido).
export function FilaItem({ item, conMateria = false, marca = null, partes = null, onAbrir = null, enlace = null, deshabilitado = false, conTono = false, children = null }) {
  const abrir = useAbrirPrevia();
  const marcarVistos = useMarcarVistos();
  const dato = [marca, conMateria ? item.materia : null, ...descripcionDe(item), item.nombreOriginal ? 'Renombrado' : null, marcarVistos && item.visto ? 'Visto' : null].filter(Boolean).join(', ');
  const adentro = (
    <>
      {conMateria ? <Simbolo id={item.materiaId} nombre={item.materia} /> : <IconoDeItem item={item} />}
      <span className="fila__texto">
        <span className="fila__nombre">{partes ? partes.map((p, i) => (p.marca ? <mark key={i}>{p.texto}</mark> : <span key={i}>{p.texto}</span>)) : item.nombre}</span>
        <span className="fila__dato">{dato}</span>
      </span>
    </>
  );
  return (
    <li className="fila" data-visto={(marcarVistos && item.visto) || undefined} data-tono={conTono ? tonoDeItem(item) : undefined}>
      {enlace ? (
        <a className="fila__principal" href={enlace} target="_blank" rel="noopener noreferrer">
          {adentro}
          <span className="solo-lectores">, se abre en otra pestaña</span>
        </a>
      ) : (
        <button type="button" className="fila__principal" onClick={() => !deshabilitado && (onAbrir ? onAbrir(item) : abrir(item))} aria-haspopup={onAbrir ? undefined : 'dialog'} aria-disabled={deshabilitado ? 'true' : undefined}>
          {adentro}
        </button>
      )}
      {children}
    </li>
  );
}

export const TIPOS = [
  { valor: '', texto: 'Todo', icono: 'capas' },
  { valor: 'archivo', texto: 'Archivos', icono: 'documento', tono: 'doc' },
  { valor: 'enlace', texto: 'Enlaces', icono: 'enlace', tono: 'enlace' },
  { valor: 'actividad', texto: 'Actividades', icono: 'actividad', tono: 'actividad' },
];

/** The drawing at the start of a filter, so each one is found at a glance. */
export const IconoDeFiltro = ({ nombre, tono }) => <Icono nombre={nombre} tono={tono} tamano="mini" />;

/** `cuentas`: how many there are of each kind, by its value, shown on each button. */
export function FiltroTipo({ valor, onCambio, cuentas = null }) {
  return (
    <div className="tipos" role="group" aria-label="Mostrar">
      {TIPOS.map((t) => (
        <button key={t.valor} type="button" className="tipos__opcion" aria-pressed={valor === t.valor} aria-label={cuentas ? `${t.texto}, ${cuentas[t.valor] ?? 0}` : undefined} onClick={() => onCambio(t.valor)}>
          <IconoDeFiltro nombre={t.icono} tono={t.tono} />{t.texto}
          {cuentas && <span className="tipos__cuenta">{cuentas[t.valor] ?? 0}</span>}
        </button>
      ))}
    </div>
  );
}

/** «Buscar en esta materia» and the kinds to show, of the course page and of a course on a live session's table.
 * `children`: the screen's own filters, after the kinds. */
export function FiltroDeMateria({ filtro, onFiltro, tipo, onTipo, children = null }) {
  return (
    <div className="filtro filtro--materia">
      <Campo etiqueta="Buscar en esta materia">
        <input className="campo__control" type="search" value={filtro} onChange={(e) => onFiltro(e.target.value)} autoComplete="off" />
      </Campo>
      <div className="filtro__botones">
        <FiltroTipo valor={tipo} onCambio={onTipo} />
        {children}
      </div>
    </div>
  );
}

const PIEZAS = { filas: 3, tarjetas: 3, calendario: 1 };

/** While the campus answers, the shape of what is coming (rows, cards or a month), so nothing pops in out of
 * nowhere. Screen readers hear the text; the shapes are hidden from them. */
export function Cargando({ texto = 'Cargando', forma = 'filas', cuantas }) {
  const total = cuantas ?? (forma === 'calendario' ? 35 : forma === 'tarjetas' ? 6 : 4);
  return (
    <div className={`cargando cargando--${forma}`} role="status">
      <span className="solo-lectores">{texto}</span>
      <div className="esqueleto" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className="esqueleto__pieza">
            {Array.from({ length: PIEZAS[forma] ?? 3 }, (_, j) => <i key={j} />)}
          </span>
        ))}
      </div>
    </div>
  );
}

export function ErrorConReintento({ texto, recargar }) {
  return (
    <div className="mensaje mensaje--error" role="alert">
      <p>{texto}</p>
      <button type="button" className="boton boton--secundario boton--chico" onClick={recargar}>Probar de nuevo</button>
    </div>
  );
}
