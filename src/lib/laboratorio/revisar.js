import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { pythonLanguage } from '@codemirror/lang-python';
import { marcasDelIntento, resumenDelError } from './enLinea';
import { REVISOR_PYTHON } from './modulos';
import { enCriollo } from './mensajes';
import { motorDe } from './motor';

// The code checked while the student types, by the engine that runs it and without running it: a while after the last
// key, the open file (in C, the whole project, whose errors may be in another file) goes to its worker as `revisar`
// { id, codigo, nombre, archivos?, principal? } and comes back as `revisado` { id, error, linea, archivo?, avisos?,
// marcas? } (c.worker.js, js.worker.js, sql.worker.js, python.worker.js). The marks are the Error Lens ones (enLinea.js).
// It waits for the engine to be loaded and free: never during a run, and a run's marks replace the revision's.
// Python only checks with its engine already loaded; until then, what CodeMirror's tree of the code says.

/** How long without typing before checking. */
export const ESPERA_MS = 1500;
// Past this, the engine is busy with something else: this revision goes, the next key brings another.
const TOPE_MS = 10_000;
const TEXTO_DEL_ARBOL = 'Algo no cierra acá.';

/** The marks of what a worker answered, for the open file (`abierto`), as a run's would be. */
export function marcasDeLaRevision(lenguaje, r, { abierto, principal }) {
  const piezas = [];
  const error = typeof r?.error === 'string' && r.linea > 0 ? { linea: r.linea, archivo: r.archivo ?? null } : null;
  if (error) piezas.push({ tipo: 'error', linea: error.linea, texto: enCriollo(lenguaje, r.error) });
  if (Array.isArray(r?.avisos) && r.avisos.length) piezas.push({ tipo: 'salida', flujo: 'err', texto: r.avisos.join('') });
  const marcas = marcasDelIntento({ error, piezas, lenguaje, abierto, principal });
  for (const [linea, tono, texto] of Array.isArray(r?.marcas) ? r.marcas : []) {
    if (Number(linea) > 0) marcas.push({ linea: Number(linea), tono: tono === 'aviso' ? 'aviso' : 'error', texto: resumenDelError(String(texto)) });
  }
  return marcas;
}

/** Python without its engine: the first error of the editor's tree, with a mark that doesn't name it. */
export function marcasDelArbol(lenguaje, codigo) {
  if (lenguaje !== 'python') return [];
  const texto = String(codigo ?? '');
  let donde = -1;
  pythonLanguage.parser.parse(texto).iterate({
    enter: (n) => {
      if (donde >= 0) return false;
      if (n.type.isError) donde = n.from;
      return undefined;
    },
  });
  if (donde < 0) return [];
  return [{ linea: texto.slice(0, donde).split('\n').length, tono: 'error', texto: TEXTO_DEL_ARBOL }];
}

let numero = 0;
let revisiones = 0;
// pyflakes, downloaded once from the site and handed to each Python worker, which has no network.
let pyflakes = null;
const conPyflakes = new WeakMap();

function traerPyflakes() {
  pyflakes ??= fetch(new URL(`${import.meta.env.BASE_URL}motores/python/${REVISOR_PYTHON.archivo}`, window.location.href).href)
    .then((r) => (r.ok ? r.arrayBuffer() : null))
    .then((b) => (b?.byteLength === REVISOR_PYTHON.bytes ? b : null))
    .catch(() => null);
  return pyflakes;
}

/** The worker of the engine once it's loaded and not running anything, or null if it isn't loading or `corte` ends first. */
export function motorLibre(m, corte) {
  if (['apagado', 'falla'].includes(m.leer().fase)) return Promise.resolve(null);
  return new Promise((resolver) => {
    let soltar = () => {};
    const mirar = () => {
      if (corte.aborted) return fin(null);
      if (m.worker && !m.corrida && m.leer().fase === 'listo') return fin(m.worker);
      return undefined;
    };
    function fin(worker) {
      soltar();
      corte.removeEventListener('abort', mirar);
      resolver(worker);
    }
    corte.addEventListener('abort', mirar);
    soltar = m.suscribir(mirar);
    mirar();
  });
}

/** What the engine of `lenguaje` says of `pedido` ({ codigo, nombre, archivos?, principal? }), or null. */
export async function revisarEn(lenguaje, pedido, corte) {
  const m = motorDe(lenguaje);
  let worker = await motorLibre(m, corte);
  if (!worker) return null;
  let extra = null;
  if (lenguaje === 'python' && !conPyflakes.get(worker)) {
    const bytes = await traerPyflakes();
    worker = await motorLibre(m, corte);
    if (!worker) return null;
    if (bytes && !conPyflakes.get(worker)) extra = { pyflakes: bytes.slice(0) };
  }
  numero += 1;
  const id = `revisar-${numero}`;
  return new Promise((resolver) => {
    const fin = (d) => {
      clearTimeout(reloj);
      worker.removeEventListener('message', oir);
      resolver(d);
    };
    const oir = ({ data: d }) => {
      if (d?.tipo !== 'revisado' || d.id !== id) return;
      if (d.pyflakes) conPyflakes.set(worker, true);
      fin(d);
    };
    const reloj = setTimeout(() => fin(null), TOPE_MS);
    worker.addEventListener('message', oir);
    worker.postMessage({ ...pedido, ...extra, tipo: 'revisar', id }, extra ? [extra.pyflakes] : []);
  });
}

/**
 * The marks of the revision of the open file, or null when what goes is the last run's (enLinea.js): after a run, and
 * while the revision found nothing new. `armar()` gives what goes to the engine ({ codigo, nombre, archivos?,
 * principal? }); `nombre` and `codigo` are the open file's.
 */
export function useRevision({ lenguaje, nombre, codigo, armar, activo }) {
  const m = motorDe(lenguaje);
  const fase = useSyncExternalStore(m.suscribir, () => m.leer().fase);
  // The runs of this engine: one that comes after a revision is asked for leaves it out.
  const corridas = useSyncExternalStore(m.suscribir, () => m.numero);
  const listo = fase === 'listo';
  const [hecha, setHecha] = useState(null);
  const armado = useRef(armar);
  useEffect(() => {
    armado.current = armar;
  });
  const clave = `${lenguaje}\n${nombre}\n${codigo}`;
  const ya = hecha?.clave === clave && (hecha.deMotor || !listo);

  useEffect(() => {
    if (!activo || ya) return undefined;
    const corte = new AbortController();
    const reloj = setTimeout(async () => {
      const pedido = armado.current();
      const desde = m.numero;
      const guardar = (marcas, deMotor) => {
        // Each revision comes again to the editor, also the same marks: they say how the code is now, and bring back
        // one its line's edit took away (Editor.jsx only takes marks that changed).
        revisiones += 1;
        const nuevas = marcas.map((x) => ({ ...x, vez: revisiones }));
        setHecha((antes) => {
          // Nothing new while the last run's marks show: they stay, each until its line is edited.
          const sigue = antes && antes.nombre === nombre && antes.corridas === desde && antes.marcas !== null;
          return { clave, nombre, corridas: desde, deMotor, marcas: nuevas.length || sigue ? nuevas : null };
        });
      };
      // Without its engine yet: the tree, and again when it's loaded.
      if (['apagado', 'cargando', 'falla'].includes(m.leer().fase)) {
        guardar(marcasDelArbol(lenguaje, codigo), false);
        return;
      }
      const r = await revisarEn(lenguaje, pedido, corte.signal);
      if (!r || corte.signal.aborted || m.numero !== desde) return;
      guardar(marcasDeLaRevision(lenguaje, r, { abierto: nombre, principal: pedido.principal ?? nombre }), true);
    }, ESPERA_MS);
    return () => {
      clearTimeout(reloj);
      corte.abort();
    };
  }, [activo, ya, clave, listo]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!activo || !hecha || hecha.nombre !== nombre || hecha.corridas !== corridas) return null;
  return hecha.marcas;
}
