// Consultron in «Código», as the screen shows it: the pedidos of the visit with what the agent did in each, and the
// proposals marked in the lab's editor. It lives apart from the panel: closing it doesn't stop a pedido or lose them.
// The pedidos are one chat for the whole lab; the proposals, of each place (propuestas.js).
import { useSyncExternalStore } from 'react';
import { mostrarEnEditor } from '../../components/consultron/enEditor';
import { trabajar, useCodigo } from './codigo';
import { correrCodigo } from './correrCodigo';
import { hacerHerramienta } from './herramientasCodigo';
import { ideAhora } from './pantalla';
import { alLugar, aplicar, descartar, empezarPedido, hayEnAlgunLugar, propuestasAhora, suscribirPropuestas, usePropuestas } from './propuestas';

const TOPE_TURNOS = 20;

// The chat outlives a reload of the tab, as the one of «Preguntar» (charlas.js): in this tab only, and Salir forgets it
// (sesion.js). A pedido cut by the reload stays, stopped.
export const CLAVE_AGENTE = 'cl.agente';
const corto = (v, largo) => (typeof v === 'string' ? v.slice(0, largo) : null);
const PASO = new Set(['lista', 'lee', 'edita', 'crea', 'corre', 'casos', 'dice']);
export function turnosGuardados(texto) {
  try {
    const leidos = JSON.parse(texto ?? '[]');
    if (!Array.isArray(leidos)) return [];
    return leidos.slice(-TOPE_TURNOS).filter((t) => t && typeof t.pedido === 'string' && Array.isArray(t.pasos)).map((t, i) => ({
      id: i + 1,
      pedido: t.pedido.slice(0, 4000),
      pasos: t.pasos.filter((p) => p && PASO.has(p.tipo)).slice(0, 60),
      respuesta: corto(t.respuesta, 20000),
      motivo: t.trabajando ? 'recargada' : corto(t.motivo, 40),
      trabajando: false,
    }));
  } catch {
    return [];
  }
}
const leerTurnos = () => {
  try {
    return turnosGuardados(sessionStorage.getItem(CLAVE_AGENTE));
  } catch {
    return [];
  }
};
const guardarTurnos = (turnos) => {
  try {
    if (turnos.length) sessionStorage.setItem(CLAVE_AGENTE, JSON.stringify(turnos));
    else sessionStorage.removeItem(CLAVE_AGENTE);
  } catch {
    // Without room or without storage, the chat lives only in memory, as before.
  }
};

// turnos: [{ id, pedido, pasos: [paso], respuesta, motivo, trabajando }]
let estado = { turnos: leerTurnos(), trabajando: false };
let freno = null;
let numero = estado.turnos.length;
const avisados = new Set();
const poner = (cambio) => {
  estado = { ...estado, ...cambio };
  if ('turnos' in cambio) guardarTurnos(estado.turnos);
  for (const f of avisados) f();
};
const suscribir = (f) => {
  avisados.add(f);
  return () => avisados.delete(f);
};
export const useAgente = () => useSyncExternalStore(suscribir, () => estado, () => estado);
export { useCodigo, usePropuestas };

const cambiarTurno = (id, cambio) => poner({ turnos: estado.turnos.map((t) => (t.id === id ? { ...t, ...(typeof cambio === 'function' ? cambio(t) : cambio) } : t)) });

/** Sends a pedido of the student. `solo`: «Aplicar solo». */
export async function mandar(texto, { solo = false } = {}) {
  const ide = ideAhora();
  if (estado.trabajando || !ide) return;
  alLugar(ide.donde);
  empezarPedido(ide.donde);
  const id = ++numero;
  freno = new AbortController();
  poner({ trabajando: true, turnos: [...estado.turnos.slice(-(TOPE_TURNOS - 1)), { id, pedido: texto.trim(), pasos: [], respuesta: null, motivo: null, trabajando: true }] });
  const r = await trabajar(texto, {
    ide: ideAhora,
    senal: freno.signal,
    // «Aplicar solo» writes only in the place in view: one left proposes there, to apply on coming back.
    herramienta: (nombre, args, lab) => hacerHerramienta(nombre, args, lab, { solo: solo && ideAhora()?.donde === lab.donde, correr: correrCodigo, casos: lab.correrCasos ?? null }),
    alPaso: (paso) => cambiarTurno(id, (t) => ({ pasos: [...t.pasos, paso] })),
  });
  freno = null;
  cambiarTurno(id, { respuesta: r.texto ?? null, motivo: r.motivo ?? null, trabajando: false });
  poner({ trabajando: false });
  sincronizar();
}

export const frenarAgente = () => freno?.abort();

/** Forgets the pedidos of the visit (the proposals stay). */
export const limpiarAgente = () => !estado.trabajando && poner({ turnos: [] });

// The proposal of the file open in the editor, marked in it. The editor mounts again with each file opened: what's
// watched is the lab's center, while some place has something (coming back to it shows its own).
let vigia = null;
let vigiada = null;
let marcado = false;
export function sincronizar() {
  const ide = ideAhora();
  if (ide) alLugar(ide.donde);
  const { archivos } = propuestasAhora();
  const raiz = ide?.editor?.() ?? null;
  const p = ide?.abierto ? archivos.find((a) => a.nombre === ide.abierto) : null;
  if (raiz && (p || marcado)) {
    const nombre = p?.nombre;
    mostrarEnEditor(
      raiz,
      p
        ? {
            despues: p.despues,
            alAplicar: () => aplicar(ideAhora(), nombre),
            alDescartar: () => descartar(nombre),
          }
        : null,
    );
    marcado = Boolean(p);
  }
  const hace = hayEnAlgunLugar() || marcado;
  if (vigia && (!hace || vigiada !== raiz)) {
    vigia.disconnect();
    vigia = null;
  }
  if (hace && !vigia && raiz && typeof MutationObserver !== 'undefined') {
    vigia = new MutationObserver(() => sincronizar());
    vigia.observe(raiz, { childList: true, subtree: true });
    vigiada = raiz;
  }
}

let escuchando = false;
/** Keeps the editor in step with the proposals, from the first time the panel of «Código» opens. */
export function seguirPropuestas() {
  if (escuchando) return;
  escuchando = true;
  suscribirPropuestas(sincronizar);
}
