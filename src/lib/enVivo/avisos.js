// What the table tells about while the student is busy with something else: the chat's new messages and the session
// Consultron's answers. Only the little needed to notice them (who and which one), read light from the Y.Doc: the
// answer itself is read and drawn by the Consultron (consultronMesa.js), apart.

/** The session's Consultron thread, in its own place of the Y.Doc (not a tab): read light here, kept by consultronMesa.js. */
export const hiloDeLaMesa = (doc) => doc.getMap('consultron');

const CLAVE = /^q:[0-9a-f]{12}$/;
const ESTADOS = new Set(['pensando', 'listo', 'falla']);
// eslint-disable-next-line no-control-regex
const limpio = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '');

/** The questions of a Consultron tab, as far as noticing them goes: [{ id, de, nombre, estado }]. */
export function preguntas(datos) {
  const lista = [];
  datos.forEach((v, clave) => {
    if (!CLAVE.test(clave) || !v || typeof v !== 'object' || !ESTADOS.has(v.estado)) return;
    lista.push({ id: clave.slice(2), de: typeof v.de === 'string' ? v.de : '', nombre: limpio(v.nombre, 60) || 'Alguien', estado: v.estado });
  });
  return lista;
}

/** A message of the chat, in a line of a notice. */
export const enUnaLinea = (texto, max = 120) => {
  const t = limpio(String(texto ?? '').replace(/\s+/g, ' '), max + 1);
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};
