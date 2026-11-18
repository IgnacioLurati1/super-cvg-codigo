// The code of a live session, and what comes out of it. The code is the only secret: whoever has it is in. From it come
// the name of the channel (what the server sees) and the key that encrypts every message (what the server never
// sees). The code itself never leaves this browser: not in a request, not in a log, only in the link's #fragment.

// No 0, 1, I, L or O: it is read aloud and typed from Discord without doubts.
export const ALFABETO = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const LARGO = 12;
const SAL = new TextEncoder().encode('super-cvg/en-vivo/v1');
// Slow on purpose, once per entry: guessing codes against what goes through the server costs that much each time.
const VUELTAS = 200000;

export function nuevoCodigo() {
  const salida = [];
  const tope = 256 - (256 % ALFABETO.length);
  while (salida.length < LARGO) {
    for (const b of crypto.getRandomValues(new Uint8Array(LARGO * 2))) {
      if (b < tope && salida.length < LARGO) salida.push(ALFABETO[b % ALFABETO.length]);
    }
  }
  return salida.join('');
}

/** What was typed or pasted, as a code, or null. Spaces, dashes and lowercase are fine. */
export function leerCodigo(texto) {
  if (typeof texto !== 'string') return null;
  // The whole invitation link pasted works too: the code is what follows its «#».
  const limpio = texto.slice(texto.lastIndexOf('#') + 1).toUpperCase().replace(/[\s-]/g, '');
  if (limpio.length !== LARGO || [...limpio].some((c) => !ALFABETO.includes(c))) return null;
  return limpio;
}

// An invitation opened without signing in: in memory until whoever signs in reaches Estudiar en vivo (ConSesion.jsx),
// never in the address.
let invitacion = null;
export function guardarInvitacion(texto) {
  invitacion = leerCodigo(texto);
  return invitacion;
}
export function tomarInvitacion() {
  const c = invitacion;
  invitacion = null;
  return c;
}

/** In three groups, to read it: «ABCD-EFGH-JKMN». */
export const mostrarCodigo = (codigo) => codigo.match(/.{1,4}/g).join('-');

/** The channel's name and the key, from the code. */
export async function derivar(codigo) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(codigo), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: SAL, iterations: VUELTAS }, base, 384));
  const clave = await crypto.subtle.importKey('raw', bits.slice(0, 32), 'AES-GCM', false, ['encrypt', 'decrypt']);
  const sala = Array.from(bits.slice(32), (b) => b.toString(16).padStart(2, '0')).join('');
  return { sala, clave };
}

export const aBase64 = (bytes) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
export const deBase64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** Encrypted, with the channel's name bound in: a message of one session is no good in another. */
export async function cifrar({ clave, sala }, bytes) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cuerpo = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(sala) }, clave, bytes));
  const junto = new Uint8Array(12 + cuerpo.length);
  junto.set(iv);
  junto.set(cuerpo, 12);
  return junto;
}

/** The bytes, or null if it is not a message of this session. */
export async function descifrar({ clave, sala }, junto) {
  try {
    if (junto.length < 29) return null;
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: junto.subarray(0, 12), additionalData: new TextEncoder().encode(sala) }, clave, junto.subarray(12)));
  } catch {
    return null;
  }
}
