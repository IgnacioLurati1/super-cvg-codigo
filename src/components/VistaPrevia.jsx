import { useLayoutEffect, useRef } from 'react';
import Simbolo, { Icono } from './Simbolo';
import { GRUPOS_DE_AVISOS } from '../lib/avisos';
import { BLOQUES_DE_HOY, bloquesVisibles, cuentaEnHoy, diasDeHoy } from '../lib/hoy';
import { estaVacio } from '../lib/hoyVacios';
import './vistaPrevia.css';

// The previews of Configuración, Pantallas: a small Hoy, Materias, Calendario or bell that follows each choice as it is
// made, so the student sees how the screen ends up without leaving. Only for the eyes: the choices themselves are the
// controls next to it, so a screen reader skips it.

const NOMBRE = Object.fromEntries(BLOQUES_DE_HOY.map((b) => [b.clave, b.nombre]));
const CUENTA_CORTA = { entregas: 'Entregas', cuestionarios: 'Cuestionarios', classroom: 'Classroom', propias: 'Tus fechas' };

const quieto = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || ['reducido', 'ninguno'].includes(document.documentElement.dataset.movimiento);

/** What changed place slides from where it was, and what appears fades in: measured inside the preview, so scrolling the
 * page moves nothing. */
function useAcomodo() {
  const raiz = useRef(null);
  const antes = useRef(null);
  useLayoutEffect(() => {
    const el = raiz.current;
    if (!el) return;
    const base = el.getBoundingClientRect();
    const ahora = new Map();
    for (const hijo of el.querySelectorAll('[data-clave]')) {
      const r = hijo.getBoundingClientRect();
      ahora.set(hijo.dataset.clave, { hijo, x: r.left - base.left, y: r.top - base.top });
    }
    const previo = antes.current;
    antes.current = ahora;
    if (!previo || quieto() || typeof Element.prototype.animate !== 'function') return;
    for (const [clave, { hijo, x, y }] of ahora) {
      const a = previo.get(clave);
      if (!a) {
        hijo.animate([{ opacity: 0, transform: 'scale(0.96)' }, { opacity: 1, transform: 'none' }], { duration: 180, easing: 'ease-out' });
      } else if (Math.abs(a.x - x) > 0.5 || Math.abs(a.y - y) > 0.5) {
        hijo.animate([{ transform: `translate(${a.x - x}px, ${a.y - y}px)` }, { transform: 'none' }], { duration: 220, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
      }
    }
  });
  return raiz;
}

/** Where the frame has a top (`--tope`, a part of the window's height: on a phone, where it stays in sight over the
 * choices), what doesn't fit is drawn smaller, and wider so it keeps its shape. */
function encoger(m, d) {
  if (!m || !d) return;
  d.style.transform = '';
  d.style.width = '';
  m.style.height = '';
  const tope = parseFloat(getComputedStyle(m).getPropertyValue('--tope')) * window.innerHeight;
  if (!(tope > 0) || d.offsetHeight <= tope) return;
  const ancho = d.offsetWidth;
  let escala = tope / d.offsetHeight;
  // Wider, it gets shorter: a second measure with that width.
  d.style.width = `${ancho / escala}px`;
  escala = Math.min(1, tope / d.offsetHeight, ancho / d.offsetWidth);
  d.style.width = `${ancho / escala}px`;
  d.style.transform = `scale(${escala})`;
  const { paddingTop, paddingBottom, borderTopWidth, borderBottomWidth } = getComputedStyle(m);
  const borde = [paddingTop, paddingBottom, borderTopWidth, borderBottomWidth].reduce((t, v) => t + parseFloat(v), 0);
  m.style.height = `${Math.ceil(d.offsetHeight * escala + borde)}px`;
}

function useEncoger() {
  const marco = useRef(null);
  const dentro = useRef(null);
  useLayoutEffect(() => encoger(marco.current, dentro.current));
  useLayoutEffect(() => {
    const alCambiar = () => encoger(marco.current, dentro.current);
    window.addEventListener('resize', alCambiar);
    return () => window.removeEventListener('resize', alCambiar);
  }, []);
  return { marco, dentro };
}

/** The frame of every preview, with its caption. */
export function VistaPrevia({ titulo = 'Así se ve', children }) {
  const { marco, dentro } = useEncoger();
  return (
    <div className="vista-previa" aria-hidden="true">
      <p className="vista-previa__titulo">{titulo}</p>
      <div ref={marco} className="vista-previa__marco">
        <div ref={dentro} className="vista-previa__dentro">{children}</div>
      </div>
    </div>
  );
}

const Lineas = ({ cuantas = 2 }) => Array.from({ length: cuantas }, (_, i) => <span key={i} className="miniatura__linea" />);

function BloqueDeHoy({ clave, cuenta, dias }) {
  let cuerpo;
  const vacio = estaVacio(clave);
  if (vacio) {
    cuerpo = <span className="miniatura__nota">Vacío hoy, no aparece</span>;
  } else if (clave === 'pendientes') {
    const tipos = [...cuenta].map((t) => CUENTA_CORTA[t]);
    cuerpo = (
      <>
        <span className="miniatura__destacado" />
        {tipos.length ? (
          <span className="miniatura__chips">{tipos.map((t) => <span key={t} className="miniatura__chip">{t}</span>)}</span>
        ) : (
          <span className="miniatura__nota">No entra nada</span>
        )}
        <Lineas />
      </>
    );
  } else if (clave === 'hechas') {
    cuerpo = <span className="miniatura__plegado" />;
  } else if (clave === 'tareas') {
    cuerpo = [0, 1].map((i) => (
      <span key={i} className="miniatura__tarea">
        <span className="miniatura__casilla" />
        <span className="miniatura__linea" />
      </span>
    ));
  } else if (clave === 'fechas') {
    cuerpo = (
      <>
        <span className="miniatura__nota">{dias === 7 ? 'Una semana' : dias === 14 ? 'Dos semanas' : 'Un mes'}</span>
        <Lineas cuantas={dias === 7 ? 2 : dias === 14 ? 3 : 4} />
      </>
    );
  } else {
    cuerpo = <Lineas cuantas={clave === 'classroom' ? 1 : 2} />;
  }
  return (
    <div className="miniatura__bloque" data-clave={clave} data-bloque={clave} data-vacio={vacio ? '' : undefined}>
      <span className="miniatura__nombre">{NOMBRE[clave]}</span>
      {cuerpo}
    </div>
  );
}

/** Hoy as it is arranged in `mio`, in the view `vista`: its blocks in order, the hidden ones out. */
export function HoyEnMiniatura({ mio, vista, nombre }) {
  const raiz = useAcomodo();
  const visibles = bloquesVisibles(mio);
  const cuenta = cuentaEnHoy(mio);
  const dias = diasDeHoy(mio);
  const bloque = (clave) => <BloqueDeHoy key={clave} clave={clave} cuenta={cuenta} dias={dias} />;
  const nada = !visibles.principal.length && !visibles.costado.length;
  return (
    <div ref={raiz} className="miniatura miniatura--hoy" data-vista={vista}>
      <span className="miniatura__titulo">{nombre ? `Hola, ${nombre}` : 'Hola'}</span>
      <span className="miniatura__semana">
        {Array.from({ length: 7 }, (_, i) => <span key={i} />)}
      </span>
      {nada ? (
        <span className="miniatura__nota miniatura__nada">Escondiste todo</span>
      ) : (
        <div className="miniatura__hoy">
          <div className="miniatura__principal">{visibles.principal.map(bloque)}</div>
          <div className="miniatura__costado">{visibles.costado.map(bloque)}</div>
        </div>
      )}
    </div>
  );
}

const EJEMPLOS = [
  { id: 'a', nombre: 'Análisis Matemático I', simbolo: 'estrella', color: '0' },
  { id: 'b', nombre: 'Física I', simbolo: 'hoja', color: '3' },
  { id: 'c', nombre: 'Algoritmos y Estructuras de Datos', simbolo: 'hexagono', color: '6' },
];

/** The list of Materias in the view `vista`, every card with the look `tarjeta`: the student's own courses when they are
 * already here (`materias`, from the campus), or three examples. */
export function MateriasEnMiniatura({ vista, tarjeta, materias }) {
  const raiz = useAcomodo();
  const lista = materias?.length ? materias.slice(0, 3) : null;
  return (
    <div ref={raiz} className="miniatura miniatura--materias">
      <div className="vista-materias" data-vista={vista}>
        <ul className="materias">
          {(lista ?? EJEMPLOS).map((m) => (
            <li key={m.id} className="materias__item" data-clave={m.id} data-tarjeta={tarjeta} data-materia={lista ? undefined : m.color}>
              <span className="materias__enlace">
                {lista ? <Simbolo id={m.id} nombre={m.nombre} tamano="grande" /> : <Icono nombre={m.simbolo} color={m.color} tamano="grande" />}
                <span className="materias__texto">
                  <span className="materias__nombre">{m.nombre}</span>
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// Inside a course: a made-up section with one thing of each kind.
const CONTENIDO_DE_EJEMPLO = [
  { clave: 'apunte', nombre: 'Apunte de la unidad 1', dato: 'PDF, 3 de noviembre', icono: 'documento', tono: 'pdf' },
  { clave: 'video', nombre: 'Clase grabada', dato: 'Enlace', icono: 'enlace', tono: 'enlace' },
  { clave: 'tp', nombre: 'Entrega del TP 1', dato: 'Tarea', icono: 'actividad', tono: 'actividad' },
];

/** A section of a course with the view and the look of its content chosen (ajustes.vistas.materia, ajustes.contenido),
 * drawn with the course's own classes. */
export function MateriaEnMiniatura({ vista, contenido }) {
  const raiz = useAcomodo();
  return (
    <div ref={raiz} className="miniatura miniatura--materia">
      <div className="materia" data-vista={vista} data-contenido={contenido}>
        <div className="bloque">
          <p className="miniatura__seccion">Unidad 1</p>
          <ul className="lista">
            {CONTENIDO_DE_EJEMPLO.map((i) => (
              <li key={i.clave} className="fila" data-clave={i.clave} data-tono={i.tono}>
                <span className="fila__principal">
                  <Icono nombre={i.icono} tono={i.tono} tamano="tipo" />
                  <span className="fila__texto">
                    <span className="fila__nombre">{i.nombre}</span>
                    <span className="fila__dato">{i.dato}</span>
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

// One made-up notice of each kind, as the bell would show it.
const AVISO_DE = {
  foros: 'Consulta del martes, en el foro',
  notas: 'Te devolvieron el TP 2',
  contenido: 'Apunte nuevo de la unidad 3',
  tareas: 'Tu entrega llegó',
  cuestionarios: 'Se abrió el cuestionario 1',
  contactos: 'Alguien quiere agregarte',
  otros: 'Aviso del campus',
};

/** The bell with one notice of each kind that is still on view. */
export function AvisosEnMiniatura({ ocultos }) {
  const raiz = useAcomodo();
  const vistos = GRUPOS_DE_AVISOS.filter((g) => !ocultos.includes(g.clave));
  return (
    <div ref={raiz} className="miniatura miniatura--avisos">
      <span className="miniatura__campana">
        <Icono nombre="campana" />
        {vistos.length > 0 && <span className="miniatura__numero">{vistos.length}</span>}
      </span>
      {vistos.length ? (
        <span className="miniatura__avisos">
          {vistos.map((g) => (
            <span key={g.clave} className="miniatura__aviso" data-clave={g.clave}>
              <span className="miniatura__aviso-texto">{AVISO_DE[g.clave]}</span>
              <span className="miniatura__aviso-tipo">{g.nombre}</span>
            </span>
          ))}
        </span>
      ) : (
        <span className="miniatura__nota miniatura__nada">La campana queda en silencio</span>
      )}
    </div>
  );
}
