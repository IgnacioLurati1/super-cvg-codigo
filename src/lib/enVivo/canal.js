import { aBase64, deBase64 } from './codigo';

// The channel of a live session in Supabase Realtime, El Santo Resumen's project (utn-apuntes). Broadcast and presence
// only: no table, nothing kept. The key below is the project's public one (the same its own page uses); what the
// channel carries is already encrypted (red.js).
export const REALTIME = 'wss://lomhlulbgfovtnljbqzp.supabase.co/realtime/v1';
const PUBLICA = 'sb_publishable_fjUOOwzJTnFp8V5b0c0bUA_6mnkeiaF';

/**
 * canal(sala, yo, { alMensaje(bytes), alPresentes(Set of ids), alEstado(listo) }) -> { mandar(bytes), salir() }
 */
export async function canalSupabase() {
  const { RealtimeClient } = await import('@supabase/realtime-js');
  return (sala, yo, { alMensaje, alPresentes, alEstado }) => {
    const cliente = new RealtimeClient(REALTIME, { params: { apikey: PUBLICA, eventsPerSecond: 30 } });
    const canal = cliente.channel(`cvg-${sala}`, { config: { broadcast: { self: false, ack: false }, presence: { key: yo } } });
    let listo = false;
    canal.on('broadcast', { event: 'm' }, ({ payload }) => {
      if (typeof payload?.d !== 'string' || payload.d.length > 200000) return;
      try {
        alMensaje(deBase64(payload.d));
      } catch {
        // Not base64: not ours.
      }
    });
    canal.on('presence', { event: 'sync' }, () => {
      alPresentes(new Set(Object.keys(canal.presenceState()).filter((id) => /^[0-9a-f]{16}$/.test(id))));
    });
    canal.subscribe((estado) => {
      listo = estado === 'SUBSCRIBED';
      if (listo) canal.track({});
      alEstado(listo);
    });
    return {
      mandar(bytes) {
        // Before the channel is open realtime-js would send it by HTTP: better to lose it (the sync asks again).
        if (listo) canal.send({ type: 'broadcast', event: 'm', payload: { d: aBase64(bytes) } });
      },
      salir() {
        listo = false;
        cliente.removeChannel(canal).finally(() => cliente.disconnect());
      },
    };
  };
}

/** Channels in memory, for the tests: each call is a server with its rooms. */
export function canalesLocales() {
  const salas = new Map();
  return (sala, yo, { alMensaje, alPresentes, alEstado }) => {
    if (!salas.has(sala)) salas.set(sala, new Map());
    const gente = salas.get(sala);
    const avisarPresentes = () => gente.forEach((g) => queueMicrotask(() => g.alPresentes(new Set(gente.keys()))));
    gente.set(yo, { alMensaje, alPresentes });
    queueMicrotask(() => alEstado(true));
    avisarPresentes();
    return {
      mandar(bytes) {
        const copia = bytes.slice();
        gente.forEach((g, id) => id !== yo && queueMicrotask(() => g.alMensaje(copia)));
      },
      salir() {
        gente.delete(yo);
        avisarPresentes();
      },
    };
  };
}

/**
 * The tabs of this browser as a channel (BroadcastChannel), for the flows and `?envivo=local` in dev: who is here goes
 * by a beat every second, and who misses three is gone.
 */
export function canalesDelNavegador() {
  return (sala, yo, { alMensaje, alPresentes, alEstado }) => {
    const bc = new BroadcastChannel(`cvg-en-vivo-${sala}`);
    const vistos = new Map();
    let ultimos = '';
    const revisar = () => {
      const ahora = Date.now();
      vistos.forEach((t, id) => ahora - t > 3000 && vistos.delete(id));
      const ids = [...vistos.keys(), yo].sort();
      if (ids.join() !== ultimos) {
        ultimos = ids.join();
        alPresentes(new Set(ids));
      }
    };
    bc.onmessage = ({ data }) => {
      if (data?.t === 'latido' && typeof data.de === 'string') {
        if (data.chau) vistos.delete(data.de);
        else vistos.set(data.de, Date.now());
        revisar();
      } else if (data?.t === 'm' && data.d instanceof Uint8Array) {
        alMensaje(data.d);
      }
    };
    const latir = () => bc.postMessage({ t: 'latido', de: yo });
    const reloj = setInterval(() => {
      latir();
      revisar();
    }, 1000);
    latir();
    queueMicrotask(() => {
      alEstado(true);
      revisar();
    });
    return {
      mandar(bytes) {
        bc.postMessage({ t: 'm', d: bytes });
      },
      salir() {
        clearInterval(reloj);
        bc.postMessage({ t: 'latido', de: yo, chau: true });
        bc.close();
      },
    };
  };
}
