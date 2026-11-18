import * as enc from 'lib0/encoding';
import * as dec from 'lib0/decoding';
import { cifrar, descifrar, derivar } from './codigo';

// The network of a live session (what sesion.js calls `red`). Two ways, everything encrypted with the session's key:
// - a channel of Supabase Realtime (El Santo Resumen's project), to find each other, to know who is here, and as the way
//   when there is no other. The server only sees the channel's name and encrypted bytes.
// - a direct connection between each pair of browsers (WebRTC), found through that channel: when everyone has one, the
//   messages go only that way and the server does not even pass them. Few messages through Realtime keep the free plan
//   of El Santo Resumen's project out of trouble.
// The channel is behind `canal` (canal.js), so the tests run without a server.

// A message bigger than this goes in parts, each encrypted on its own.
export const TROZO = 60 * 1024;
// Realtime gets at most this many messages a second from this browser; the small ones go first.
export const POR_SEGUNDO = 6;
// The direct connection, if it is not open by then, is left for later.
const ESPERA_DIRECTA = 15000;
const REINTENTOS_DIRECTA = 3;
// Parts of a message that never complete are dropped.
const VIDA_PARTES = 60000;
const MAX_PENDIENTE = 30 * 1024 * 1024;
// What may wait in a direct connection before sending more (the browser closes it past 16 MB).
const LLENO = 2 * 1024 * 1024;
const DATOS = 0;
const SENAL = 1;
// Google's public server, only to learn each browser's address for the direct connection.
const STUN = [{ urls: 'stun:stun.l.google.com:19302' }];

const nuevoId = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');

export async function abrirRed({ codigo, canal: crearCanal, directa = typeof RTCPeerConnection !== 'undefined', alEstado = () => {} }) {
  const llave = await derivar(codigo);
  const yo = nuevoId();
  let recibir = () => {};
  let cambiarPares = () => {};
  let pares = new Set();
  let cerrada = false;
  let numero = 0;

  // --- Frames: who, to whom, which message, which part.
  const armar = (clase, para, id, i, n, trozo) => {
    const e = enc.createEncoder();
    enc.writeUint8(e, clase);
    enc.writeVarString(e, yo);
    enc.writeVarString(e, para ?? '');
    enc.writeVarUint(e, id);
    enc.writeVarUint(e, i);
    enc.writeVarUint(e, n);
    enc.writeVarUint8Array(e, trozo);
    return enc.toUint8Array(e);
  };
  async function enMarcos(clase, bytes, para) {
    numero += 1;
    const n = Math.max(1, Math.ceil(bytes.length / TROZO));
    const marcos = [];
    for (let i = 0; i < n; i += 1) marcos.push(await cifrar(llave, armar(clase, para, numero, i, n, bytes.subarray(i * TROZO, (i + 1) * TROZO))));
    return marcos;
  }

  // --- Realtime: a queue that lets out a few a second, small ones first.
  const urgentes = [];
  const lentos = [];
  let relojCola = null;
  const vaciarCola = () => {
    relojCola = null;
    if (cerrada) return;
    const siguiente = urgentes.shift() ?? lentos.shift();
    if (!siguiente) return;
    canal.mandar(siguiente);
    if (urgentes.length || lentos.length) relojCola = setTimeout(vaciarCola, 1000 / POR_SEGUNDO);
  };
  const aRealtime = (marcos) => {
    (marcos.length === 1 && marcos[0].length < 4096 ? urgentes : lentos).push(...marcos);
    if (!relojCola) relojCola = setTimeout(vaciarCola, 0);
  };

  // --- What arrives, by either way: in order, decrypted, put together.
  const partes = new Map();
  let pendiente = 0;
  let cadena = Promise.resolve();
  const llegada = (bytes) => {
    cadena = cadena.then(() => procesar(bytes)).catch(() => {});
  };
  async function procesar(bytes) {
    if (cerrada) return;
    const claro = await descifrar(llave, bytes);
    if (!claro) return;
    const d = dec.createDecoder(claro);
    const clase = dec.readUint8(d);
    const de = dec.readVarString(d);
    const para = dec.readVarString(d);
    const id = dec.readVarUint(d);
    const i = dec.readVarUint(d);
    const n = dec.readVarUint(d);
    const trozo = dec.readVarUint8Array(d);
    if (de === yo || (para && para !== yo) || n === 0 || i >= n || n > Math.ceil(MAX_PENDIENTE / TROZO)) return;
    let entero = trozo;
    if (n > 1) {
      const clave = `${de}:${id}`;
      const ahora = Date.now();
      partes.forEach((p, k) => {
        if (ahora - p.cuando > VIDA_PARTES) {
          pendiente -= p.tamano;
          partes.delete(k);
        }
      });
      let p = partes.get(clave);
      if (!p) {
        if (pendiente + n * TROZO > MAX_PENDIENTE) return;
        p = { n, trozos: new Array(n), van: 0, tamano: 0, cuando: ahora };
        partes.set(clave, p);
      }
      if (p.n !== n || p.trozos[i]) return;
      p.trozos[i] = trozo;
      p.van += 1;
      p.tamano += trozo.length;
      pendiente += trozo.length;
      if (p.van < n) return;
      partes.delete(clave);
      pendiente -= p.tamano;
      entero = new Uint8Array(p.tamano);
      let k = 0;
      p.trozos.forEach((t) => {
        entero.set(t, k);
        k += t.length;
      });
    }
    if (clase === SENAL) senal(de, entero);
    else recibir(entero, de);
  }

  // --- Direct connections, one per browser. The one with the lower id calls.
  const directas = new Map(); // id -> { pc, dc, abierta, intentos, reloj }
  const intentos = new Map();
  const texto = new TextEncoder();
  const lector = new TextDecoder();
  const mandarSenal = async (para, datos) => aRealtime(await enMarcos(SENAL, texto.encode(JSON.stringify(datos)), para));

  function cerrarDirecta(id, reintentar) {
    const c = directas.get(id);
    if (!c) return;
    directas.delete(id);
    clearTimeout(c.reloj);
    try {
      c.dc?.close();
      c.pc.close();
    } catch {
      // Already closed.
    }
    const veces = (intentos.get(id) ?? 0) + 1;
    intentos.set(id, veces);
    if (reintentar && veces < REINTENTOS_DIRECTA && pares.has(id) && yo < id && !cerrada) setTimeout(() => pares.has(id) && !directas.has(id) && llamar(id), 20000 * veces);
  }
  function nuevaDirecta(id) {
    const pc = new RTCPeerConnection({ iceServers: STUN });
    const c = { pc, dc: null, abierta: false };
    c.reloj = setTimeout(() => !c.abierta && cerrarDirecta(id, true), ESPERA_DIRECTA);
    pc.onicecandidate = (e) => e.candidate && mandarSenal(id, { t: 'ice', c: e.candidate.toJSON() });
    pc.onconnectionstatechange = () => ['failed', 'closed'].includes(pc.connectionState) && cerrarDirecta(id, true);
    const usar = (dc) => {
      c.dc = dc;
      dc.binaryType = 'arraybuffer';
      dc.bufferedAmountLowThreshold = 256 * 1024;
      dc.onopen = () => {
        c.abierta = true;
        clearTimeout(c.reloj);
        alEstado(estado());
      };
      dc.onclose = () => cerrarDirecta(id, true);
      dc.onmessage = (e) => e.data instanceof ArrayBuffer && llegada(new Uint8Array(e.data));
    };
    pc.ondatachannel = (e) => usar(e.channel);
    c.usar = usar;
    directas.set(id, c);
    return c;
  }
  async function llamar(id) {
    if (cerrada || directas.has(id)) return;
    const c = nuevaDirecta(id);
    c.usar(c.pc.createDataChannel('cvg', { ordered: true }));
    try {
      await c.pc.setLocalDescription(await c.pc.createOffer());
      mandarSenal(id, { t: 'oferta', sdp: c.pc.localDescription.sdp });
    } catch {
      cerrarDirecta(id, true);
    }
  }
  async function senal(de, bytes) {
    if (!directa || cerrada || !pares.has(de)) return;
    let s;
    try {
      s = JSON.parse(lector.decode(bytes));
    } catch {
      return;
    }
    try {
      if (s?.t === 'oferta' && typeof s.sdp === 'string' && de < yo) {
        cerrarDirecta(de, false);
        const c = nuevaDirecta(de);
        await c.pc.setRemoteDescription({ type: 'offer', sdp: s.sdp });
        await c.pc.setLocalDescription(await c.pc.createAnswer());
        mandarSenal(de, { t: 'respuesta', sdp: c.pc.localDescription.sdp });
      } else if (s?.t === 'respuesta' && typeof s.sdp === 'string') {
        const c = directas.get(de);
        if (c && c.pc.signalingState === 'have-local-offer') await c.pc.setRemoteDescription({ type: 'answer', sdp: s.sdp });
      } else if (s?.t === 'ice' && s.c && typeof s.c === 'object') {
        const c = directas.get(de);
        if (c) await c.pc.addIceCandidate(s.c);
      }
    } catch {
      cerrarDirecta(de, true);
    }
  }

  const abiertaCon = (id) => Boolean(directas.get(id)?.abierta && directas.get(id).dc?.readyState === 'open');
  // Until what is waiting in a direct connection goes down to its threshold (or it closes, or a while passes).
  const desagote = (dc) => new Promise((listo) => {
    const fin = () => {
      dc.removeEventListener('bufferedamountlow', fin);
      dc.removeEventListener('close', fin);
      clearTimeout(reloj);
      listo();
    };
    const reloj = setTimeout(fin, 10000);
    dc.addEventListener('bufferedamountlow', fin);
    dc.addEventListener('close', fin);
  });
  const estado = () => ({ conectada: canalListo, pares: pares.size, directas: [...pares].filter(abiertaCon).length });

  // --- The channel.
  let canalListo = false;
  const canal = crearCanal(llave.sala, yo, {
    alMensaje: (bytes) => llegada(bytes),
    alPresentes: (ids) => {
      const nuevos = new Set([...ids].filter((id) => id !== yo));
      const idos = [...pares].filter((id) => !nuevos.has(id));
      pares = nuevos;
      idos.forEach((id) => cerrarDirecta(id, false));
      if (directa) [...nuevos].filter((id) => yo < id && !directas.has(id) && (intentos.get(id) ?? 0) < REINTENTOS_DIRECTA).forEach((id) => llamar(id));
      cambiarPares(new Set(pares));
      alEstado(estado());
    },
    alEstado: (listo) => {
      canalListo = listo;
      alEstado(estado());
    },
  });

  let salida = Promise.resolve();
  let cerrando = false;
  const api = {
    yo,
    sala: llave.sala,
    estado,
    /** Whether there is a direct connection with `id`, open now. */
    directaCon: abiertaCon,
    mandar(bytes, para) {
      if (cerrada || cerrando) return salida;
      // One after the other: what was sent first, goes first.
      salida = salida.then(() => enviar(bytes, para)).catch(() => {});
      return salida;
    },
  };
  async function enviar(bytes, para) {
      // Everyone (or the one) with a direct connection: only that way. Otherwise, once through Realtime.
      const destinos = para ? [para] : [...pares];
      const marcosDe = (clase) => enMarcos(clase, bytes, para);
      if (destinos.length && destinos.every(abiertaCon)) {
        const marcos = await marcosDe(DATOS);
        for (const id of destinos) {
          const dc = directas.get(id)?.dc;
          // A file to several at once must not fill the connection: past this, wait for it to drain.
          if (dc?.bufferedAmount > LLENO) await desagote(dc);
          marcos.forEach((m) => {
            try {
              dc.send(m);
            } catch {
              aRealtime([m]);
            }
          });
        }
        return;
      }
      aRealtime(await marcosDe(DATOS));
  }
  return {
    ...api,
    alRecibir(fn) {
      recibir = fn;
    },
    alCambiarPares(fn) {
      cambiarPares = fn;
      fn(new Set(pares));
    },
    cerrar() {
      if (cerrada || cerrando) return salida;
      cerrando = true;
      // What was waiting goes out before leaving (the goodbye too).
      salida = salida.then(() => {
        while (urgentes.length) canal.mandar(urgentes.shift());
        cerrada = true;
        clearTimeout(relojCola);
        [...directas.keys()].forEach((id) => cerrarDirecta(id, false));
        canal.salir();
      });
      return salida;
    },
  };
}
