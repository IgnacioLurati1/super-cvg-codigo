// Whether this computer can run Consultron, looked at before anything is downloaded: nobody should download 2,4 GB to
// find out it doesn't run. What can't be known ahead (the memory of the video card) shows when it loads.
// The RAM and the room in the browser are not looked at: browsers lower or make up navigator.deviceMemory and
// navigator.storage.estimate against tracking. No room shows while downloading (mensajeDeCarga).

export const MOTIVOS = {
  celular: 'Consultron necesita una compu. En el celular no entra.',
  'sin-webgpu': 'Este navegador no puede usar la placa de video. Probá con Chrome o Edge actualizados.',
  'placa-vieja': 'La placa de video de esta compu no alcanza para Consultron.',
};

/** { puede: true } or { puede: false, motivo } (a key of MOTIVOS). */
export async function revisarCompu(nav = globalThis.navigator) {
  if (nav?.userAgentData?.mobile || /Android|iPhone|iPad|iPod/i.test(nav?.userAgent ?? '')) return { puede: false, motivo: 'celular' };
  if (!nav?.gpu) return { puede: false, motivo: 'sin-webgpu' };
  let adaptador = null;
  try {
    adaptador = await nav.gpu.requestAdapter();
  } catch {
    adaptador = null;
  }
  if (!adaptador) return { puede: false, motivo: 'sin-webgpu' };
  // The video card the browser makes up with the processor, without hardware acceleration: the model would take the
  // whole computer.
  if (adaptador.isFallbackAdapter || adaptador.info?.isFallbackAdapter) return { puede: false, motivo: 'sin-webgpu' };
  if (!adaptador.features?.has('shader-f16')) return { puede: false, motivo: 'placa-vieja' };
  return { puede: true };
}

/** What a failure while loading means for the student. */
export function mensajeDeCarga({ nombre = '', mensaje = '' } = {}) {
  if (nombre === 'QuotaExceededError' || /quota/i.test(mensaje)) return 'No hay lugar en el navegador para los 2,4 GB de Consultron. En una ventana de incógnito no entra.';
  if (/fetch|network|internet/i.test(mensaje)) return 'Se cortó la descarga. Si probás de nuevo, sigue desde donde quedó.';
  if (/device|gpu|memory|buffer|adapter|shader/i.test(mensaje)) return 'La placa de video de esta compu no alcanza para Consultron.';
  return 'Consultron no pudo arrancar. Probá de nuevo.';
}
