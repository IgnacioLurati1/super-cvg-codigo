import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import * as Y from 'yjs';
import { EditorState, Prec } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { ySyncAnnotation, yUndoManagerKeymap } from 'y-codemirror.next';
import { colaborar } from '../../../lib/enVivo/caretsDeOtros';
import { useDesplazamientoSuave } from './comun';
import { IDE } from '../../../pages/Laboratorio';
import { LENGUAJES } from '../../../lib/laboratorio/lenguajes';
import { MAX_CODIGO } from '../../../lib/laboratorio/saneo';
import { consolaEnBloques, consolaEnTexto } from '../../../lib/laboratorio/salida';
import { Tabla } from '../../laboratorio/Consola';
import { leerDer } from '../../../lib/laboratorio/der/modelo';
import { manejoDer, marcaDer, vistaDer } from '../../../lib/enVivo/derCompartido';
import { anotarVisto, vistos as vistosAntes } from '../../../lib/enVivo/vistos';
import {
  borrarProyectoDeLaMesa,
  colorValido,
  compartirSalida,
  convertirDers,
  comoMio,
  concienciaDePestana,
  crearProyectoDeLaMesa,
  elegirPrincipal,
  guardarCasosDeLaMesa,
  leerCarpeta,
  MAX_PROYECTOS_MESA,
  MAX_SALIDA,
  paraGuardarCodigo,
  ponerCodigo,
  ponerDer,
  prepararProyectos,
  quitarArchivo,
  recortarCodigo,
  renombrarArchivo,
  renombrarProyecto,
  sacarSalida,
  salidas,
  sumarArchivo,
  textosDeLaCarpeta,
  textoDelLaboratorio,
} from '../../../lib/enVivo/laboratorioCompartido';
import './laboratorio.css';

// The Laboratorio of the table is the site's own (pages/Laboratorio.jsx, its IDE): files, tabs, the panel with the
// console, the steps, the cases and the timings, over a folder of projects for everyone, written together with the others'
// carets. Each one runs it on their own computer; whoever wants shares their last output, as text. Nothing of it goes
// to the student's disk: only «Guardar en lo mío». The view is the file in sight and its first line.

// The project as the page reads the student's, read again only when something of the tab changes.
// Each change empties it before React reads it again (its own observer could come after React's).
const leidos = new WeakMap();
function leerMesa(datos) {
  let e = leidos.get(datos);
  if (!e) {
    e = { valor: null, salidas: null };
    leidos.set(datos, e);
  }
  e.valor ??= comoMio(datos);
  e.salidas ??= salidas(datos);
  return e;
}
function olvidar(datos) {
  leidos.delete(datos);
}
function useMesa(datos) {
  const suscribir = useCallback((fn) => {
    const alCambiar = () => {
      olvidar(datos);
      fn();
    };
    datos.observeDeep(alCambiar);
    return () => datos.unobserveDeep(alCambiar);
  }, [datos]);
  const leer = useCallback(() => leerMesa(datos), [datos]);
  const { valor, salidas: compartidas } = useSyncExternalStore(suscribir, leer, leer);
  return { lab: valor, compartidas };
}

// The others' carets a bit thicker; their names (caretsDeOtros.js) stay in sight: a phone has no hover.
const temaDeOtros = EditorView.theme({
  '.cm-ySelectionCaret': { borderLeftWidth: '2px' },
});

/** The first line in sight of the editor inside `caja`, and the editor itself. */
function vistaDelEditor(caja) {
  const contenido = caja?.querySelector('.cm-content');
  const v = contenido && EditorView.findFromDOM(contenido);
  if (!v) return null;
  const bloque = v.lineBlockAtHeight(v.scrollDOM.scrollTop);
  return { v, linea: v.state.doc.lineAt(bloque.from).number };
}

export default function Laboratorio({ mesa }) {
  const { datos, yo, conciencia, marcar } = mesa;
  const id = useId();
  const { lab, compartidas } = useMesa(datos);
  const caja = useRef(null);
  // The file in view here: what others follow, what «Guardar en lo mío» keeps (its project) and the language of what
  // ran.
  const [abierto, setAbierto] = useState(null);
  const enVista = useRef(null);
  useEffect(() => {
    enVista.current = abierto;
  }, [abierto]);
  const lenguaje = lab.laboratorio.find((a) => a.id === abierto)?.lenguaje ?? lab.proyectosLab[0]?.lenguaje ?? 'python';

  // The folder, if the tab came without one; no file past the limit, whoever wrote it; and a `.der` still as text
  // shared by element.
  useEffect(() => {
    prepararProyectos(datos);
    const revisar = () => queueMicrotask(() => {
      textosDeLaCarpeta(datos).forEach(recortarCodigo);
      convertirDers(datos);
    });
    revisar();
    datos.observeDeep(revisar);
    return () => datos.unobserveDeep(revisar);
  }, [datos]);

  // What the page does with the student's files, done here on the shared folder.
  const ops = useMemo(() => ({
    cambiarArchivo: (cual, cambios) => {
      const a = leerCarpeta(datos).flatMap((p) => p.archivos).find((x) => x.id === cual);
      if (!a) return false;
      if ('nombre' in cambios && !renombrarArchivo(datos, cual, cambios.nombre)) return false;
      if ('codigo' in cambios) {
        if (String(cambios.codigo).length > MAX_CODIGO) return false;
        if (a.der) {
          const der = leerDer(String(cambios.codigo));
          if (!der || !ponerDer(datos, cual, der)) return false;
        } else ponerCodigo(a.texto, cambios.codigo);
      }
      return true;
    },
    borrarArchivo: (cual) => quitarArchivo(datos, cual),
    agregarAlProyecto: (p, a) => sumarArchivo(datos, p, a).id ?? null,
    cambiarProyecto: (p, cambios) => {
      if ('principal' in cambios && !elegirPrincipal(datos, p, cambios.principal)) return false;
      if ('nombre' in cambios && !renombrarProyecto(datos, p, cambios.nombre)) return false;
      return 'principal' in cambios || 'nombre' in cambios;
    },
    guardarCasos: (p, casos) => guardarCasosDeLaMesa(datos, p, casos),
    crearProyecto: ({ nombre, lenguaje: l }) => crearProyectoDeLaMesa(datos, { nombre, lenguaje: l }),
    borrarProyecto: (p) => borrarProyectoDeLaMesa(datos, p),
  }), [datos]);

  // Each file's editor binding, with the others' carets (only of this tab, and of the same file) and its own undo,
  // kept while the tab is open: going back to a file, Ctrl+Z still undoes what was written in it.
  const [enlaces] = useState(() => new Map());
  const cierre = useRef(0);
  const extensiones = useCallback((t) => {
    let e = enlaces.get(t);
    if (!e) {
      const deshacer = new Y.UndoManager(t);
      e = {
        deshacer,
        ext: [
          colaborar(t, concienciaDePestana(conciencia, mesa.id, marcar), { undoManager: deshacer }),
          Prec.high(keymap.of(yUndoManagerKeymap)),
          temaDeOtros,
          // What this student writes stops at the limit; what comes from the others always goes in (and is cut above).
          EditorState.changeFilter.of((tr) => tr.annotation(ySyncAnnotation) !== undefined || tr.newDoc.length <= MAX_CODIGO),
        ],
      };
      enlaces.set(t, e);
    }
    return e.ext;
  }, [enlaces, conciencia, mesa.id, marcar]);
  // Each `.der`'s sheet: its shared map and the undo of what this browser did in it, kept while the tab is open.
  const [manejos] = useState(() => new Map());
  // Closed, the undo goes. (Strict mode mounts twice at once: only a close that stays undoes it.)
  useEffect(() => {
    clearTimeout(cierre.current);
    return () => {
      cierre.current = setTimeout(() => {
        enlaces.forEach((e) => e.deshacer.destroy());
        enlaces.clear();
        manejos.forEach((m) => m.destruir());
        manejos.clear();
      });
    };
  }, [enlaces, manejos]);

  // What a `.der` of the folder needs to be drawn together: its map, the others on it (their pointer and what they
  // chose), this browser's mark, and the view to follow and to give.
  const { otros } = mesa;
  const marcaDeDer = useRef(null);
  const marcarDer = useCallback((archivo, m) => {
    const propio = conciencia.getLocalState()?.h?.[mesa.id] ?? {};
    const der = m ? { archivo, ...m } : null;
    if (JSON.stringify(der) === JSON.stringify(marcaDeDer.current)) return;
    marcaDeDer.current = der;
    marcar({ ...propio, der });
  }, [conciencia, mesa.id, marcar]);
  const derDe = (archivo) => {
    const a = lab.laboratorio.find((x) => x.id === archivo);
    if (!a?.der) return null;
    let m = manejos.get(a.der);
    if (!m) {
      m = manejoDer(a.der);
      manejos.set(a.der, m);
    }
    return {
      manejo: m,
      otros: otros.map((o) => ({ id: o.id, nombre: o.nombre || 'Alguien', color: colorValido(o.color), marca: marcaDer(o.h?.der, archivo) })).filter((o) => o.marca),
      marcar: (marca) => marcarDer(archivo, marca),
      vista: vistaDer(mesa.vista, archivo),
      mover: (v) => mover({ archivo, ...v }),
      soltar: () => {
        if (siguiendo.current) soltar();
      },
    };
  };
  useEffect(() => () => marcar(null), [marcar]);

  const [aviso, setAviso] = useState('');
  const compartir = (piezas, final, verMesa) => {
    const todo = consolaEnTexto(piezas);
    compartirSalida(datos, yo, { lenguaje, texto: todo.length > MAX_SALIDA ? `${todo.slice(0, MAX_SALIDA - 1)}…` : todo, bloques: consolaEnBloques(piezas), final });
    setAviso('Compartiste tu salida. La ven todos en «Salidas compartidas».');
    verMesa?.();
  };

  // For the session's Consultron: the language, the files and what was shared.
  const { paraConsultron, paraGuardar } = mesa;
  useEffect(() => paraConsultron(() => textoDelLaboratorio(datos)), [paraConsultron, datos]);
  // «Guardar en lo mío»: the project in view as it is (`lenguaje` says it is code, not formatted text).
  useEffect(() => paraGuardar(() => paraGuardarCodigo(datos, enVista.current)), [paraGuardar, datos]);

  // The view: the file in sight and its first line. Doing something of one's own while following lets go.
  const { mover, soltar } = mesa;
  const siguiendo = useRef(false);
  useEffect(() => {
    siguiendo.current = mesa.vista != null;
  });
  const suave = useDesplazamientoSuave(mesa.vista != null, () => caja.current?.querySelector('.cm-scroller'));
  useEffect(() => {
    const raiz = caja.current;
    const scroller = abierto && raiz?.querySelector('.cm-scroller');
    if (!scroller) return undefined;
    const alMover = () => {
      const ahora = vistaDelEditor(raiz);
      if (ahora) mover({ archivo: abierto, linea: ahora.linea });
    };
    const propio = () => {
      suave.parar();
      if (siguiendo.current) soltar();
    };
    alMover();
    scroller.addEventListener('scroll', alMover, { passive: true });
    const eventos = ['wheel', 'touchstart', 'pointerdown', 'keydown'];
    eventos.forEach((e) => raiz.addEventListener(e, propio, { passive: true, capture: true }));
    return () => {
      scroller.removeEventListener('scroll', alMover);
      eventos.forEach((e) => raiz.removeEventListener(e, propio, { capture: true }));
    };
  }, [abierto, mover, soltar, suave]);
  const guia = typeof mesa.vista?.archivo === 'string' && lab.laboratorio.some((a) => a.id === mesa.vista.archivo) ? mesa.vista.archivo : null;
  const lineaGuia = Number.isSafeInteger(mesa.vista?.linea) && mesa.vista.linea > 0 ? mesa.vista.linea : 0;
  useEffect(() => {
    if (!lineaGuia || !abierto || (guia && guia !== abierto)) return undefined;
    const ir = () => {
      const ahora = vistaDelEditor(caja.current);
      if (!ahora || ahora.linea === lineaGuia) return;
      const { v } = ahora;
      const n = Math.min(lineaGuia, v.state.doc.lines);
      suave.ir({ top: v.lineBlockAt(v.state.doc.line(n).from).top });
    };
    ir();
    // A hidden tab has no size: shown again, the line is taken again.
    const tamano = new ResizeObserver(ir);
    if (caja.current) tamano.observe(caja.current);
    return () => tamano.disconnect();
  }, [lineaGuia, guia, abierto, suave]);

  // What the others shared and this browser has not seen yet: a number on the tab, and said once to a screen reader.
  // What was seen and said before a reload of this tab stays so (vistos.js).
  const [vistas, setVistas] = useState(() => new Set(vistosAntes(yo.id, 'salidasVistas')));
  const claveDe = (s) => `${s.de}:${s.cuando}`;
  const nuevas = compartidas.filter((s) => s.de !== yo.id && !vistas.has(claveDe(s)));
  const avisadas = useRef(null);
  if (avisadas.current === null) avisadas.current = new Set(vistosAntes(yo.id, 'salidasAvisadas'));
  useEffect(() => {
    const sin = compartidas.filter((s) => s.de !== yo.id && !avisadas.current.has(`${s.de}:${s.cuando}`));
    if (!sin.length) return;
    sin.forEach((s) => avisadas.current.add(`${s.de}:${s.cuando}`));
    anotarVisto(yo.id, 'salidasAvisadas', [...avisadas.current]);
    setAviso(sin.length === 1 ? `${sin[0].nombre} compartió su salida.` : `${sin.length} salidas compartidas nuevas.`);
  }, [compartidas, yo.id]);
  const alVer = () => {
    // A tab of the table that isn't in front is not seen.
    if (!nuevas.length || !caja.current?.offsetParent) return;
    const ahora = [...vistas, ...nuevas.map(claveDe)];
    anotarVisto(yo.id, 'salidasVistas', ahora);
    setVistas(new Set(ahora));
  };

  const panel = compartidas.length > 0 && {
    nombre: 'Salidas compartidas',
    nuevas: nuevas.length,
    alVer,
    contenido: (
      <section className="ev-lab__salidas" aria-labelledby={`${id}-salidas`}>
        <h3 id={`${id}-salidas`} className="solo-lectores">Salidas compartidas</h3>
        <ul className="ev-lab__lista">
          {compartidas.map((s) => (
            <li key={s.de} className="ev-lab__salida" style={{ '--de': colorValido(mesa.otros.find((o) => o.id === s.de)?.color ?? (s.de === yo.id ? yo.color : null)) }}>
              <p className="ev-lab__quien">
                <span className="ev-lab__nombre">{s.de === yo.id ? 'Vos' : s.nombre}</span>
                {[s.lenguaje && LENGUAJES[s.lenguaje].nombre, s.final].filter(Boolean).join('. ')}
                {s.de === yo.id && (
                  <button type="button" className="boton boton--secundario boton--chico ev-lab__sacar" onClick={() => sacarSalida(datos, yo)} aria-label="Sacar mi salida">Sacar</button>
                )}
              </p>
              {s.bloques ? (
                // Its results as tables, as the console shows them; the text as it printed.
                s.bloques.map((b, i) =>
                  b.tipo === 'tabla' ? (
                    <Tabla key={i} pieza={b} />
                  ) : (
                    <pre key={i} className="ev-lab__texto" tabIndex={0} aria-label={`Salida de ${s.de === yo.id ? 'vos' : s.nombre}`}>{b.texto}</pre>
                  ),
                )
              ) : (
                s.texto.trim() && <pre className="ev-lab__texto" tabIndex={0} aria-label={`Salida de ${s.de === yo.id ? 'vos' : s.nombre}`}>{s.texto}</pre>
              )}
            </li>
          ))}
        </ul>
      </section>
    ),
  };

  return (
    <div ref={caja} className="ev-lab">
      <IDE
        vivo={{
          lab,
          actual: () => comoMio(datos),
          ops,
          extensiones,
          topeProyectos: MAX_PROYECTOS_MESA,
          guia,
          alAbrir: setAbierto,
          der: derDe,
          panel,
          enLaBarra: ({ piezas, final, corriendo, verMesa }) => (
            <>
              {final && !corriendo && (
                <button type="button" className="boton boton--secundario boton--chico" onClick={() => compartir(piezas, final, verMesa)}>Compartir mi salida</button>
              )}
              <p className="solo-lectores" role="status">{aviso}</p>
            </>
          ),
        }}
      />
    </div>
  );
}
