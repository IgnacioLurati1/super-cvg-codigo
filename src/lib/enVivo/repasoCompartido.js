// Repaso en grupo, a tab of a live session's table (components/enVivo/herramientas/Repaso.jsx), in the tab's Y.Map:
//   mazo                 [{ f, d }]: front and back of the cards someone brought from their Repaso, copied, mixed and cut
//   titulo, de, deNombre which deck, and whose
//   i, vuelta, vez       the card everyone sees, whether it shows its back, and which round it is
//   r:<vez>:<persona>:<i>  'si' | 'no': whether that person knew that card in that round
//   p:<persona>          { nombre, color } of whoever answered, for the summary when they already left
// Nothing goes back to anyone's Repaso: their days stay as they were. Everything here can come from the others: it is
// read back checked and cut, and shown as text.

export const MAX_MAZO = 100;
export const MAX_FRENTE = 600;
export const MAX_DORSO = 1500;
const MAX_TOTAL = 120_000;
const MAX_TITULO = 80;

// eslint-disable-next-line no-control-regex
const limpio = (v, max) => (typeof v === 'string' ? v.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim() : '').slice(0, max);
const corto = (v, max) => {
  const t = limpio(v, max + 1);
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};
const linea = (v, max) => limpio(v, max * 2).replace(/\s+/g, ' ').trim().slice(0, max);
const esPersona = (id) => typeof id === 'string' && /^[\w-]{1,40}$/.test(id);
const entero = (v, min, max) => (Number.isSafeInteger(v) && v >= min && v <= max ? v : null);

/** The cards of a deck, checked and within the limits. */
export function sanearMazo(lista) {
  if (!Array.isArray(lista)) return [];
  const salida = [];
  let total = 0;
  for (const t of lista.slice(0, MAX_MAZO)) {
    if (!t || typeof t !== 'object') continue;
    const f = corto(t.f, MAX_FRENTE);
    if (!f) continue;
    const d = corto(t.d, MAX_DORSO);
    total += f.length + d.length;
    if (total > MAX_TOTAL) break;
    salida.push({ f, d });
  }
  return salida;
}

/** Takes cards of this student's Repaso to the table: only their front and back, mixed, at most MAX_MAZO. */
export function llevarMazo(datos, tarjetas, { titulo, yo }, azar = Math.random) {
  const lista = tarjetas.map((t) => ({ f: t.frente, d: t.dorso }));
  for (let k = lista.length - 1; k > 0; k -= 1) {
    const j = Math.floor(azar() * (k + 1));
    [lista[k], lista[j]] = [lista[j], lista[k]];
  }
  const mazo = sanearMazo(lista);
  if (!mazo.length) return false;
  datos.doc.transact(() => {
    [...datos.keys()].filter((k) => k.startsWith('r:')).forEach((k) => datos.delete(k));
    datos.set('mazo', mazo);
    datos.set('titulo', linea(titulo, MAX_TITULO));
    datos.set('de', yo.id);
    datos.set('deNombre', linea(yo.nombre, 60));
    datos.set('i', 0);
    datos.set('vuelta', false);
    datos.set('vez', (entero(datos.get('vez'), 0, 1e6) ?? 0) + 1);
  });
  return true;
}

/** Back to choosing a deck, for everyone. */
export function soltarMazo(datos) {
  datos.doc.transact(() => {
    [...datos.keys()].filter((k) => k.startsWith('r:') || ['mazo', 'titulo', 'de', 'deNombre', 'i', 'vuelta'].includes(k)).forEach((k) => datos.delete(k));
  });
}

/**
 * The round as it is: { mazo, titulo, de, deNombre, i, vuelta, vez, marcas, personas }. `i` equal to the deck's length
 * is the end. `marcas`: Map(persona -> Map(i -> 'si' | 'no')) of this round. `personas`: Map(persona -> { nombre, color }).
 */
export function leerRepaso(datos) {
  const mazo = sanearMazo(datos.get('mazo'));
  const vez = entero(datos.get('vez'), 0, 1e6) ?? 0;
  const marcas = new Map();
  const personas = new Map();
  const prefijo = `r:${vez}:`;
  datos.forEach((v, k) => {
    if (k.startsWith('p:')) {
      const quien = k.slice(2);
      if (esPersona(quien) && v && typeof v === 'object') personas.set(quien, { nombre: linea(v.nombre, 60) || 'Alguien', color: typeof v.color === 'string' ? v.color : '' });
      return;
    }
    if (!k.startsWith(prefijo) || (v !== 'si' && v !== 'no')) return;
    const [quien, cual] = k.slice(prefijo.length).split(':');
    const n = Number(cual);
    if (!esPersona(quien) || !/^\d+$/.test(cual) || n >= mazo.length) return;
    if (!marcas.has(quien)) marcas.set(quien, new Map());
    marcas.get(quien).set(n, v);
  });
  return {
    mazo,
    titulo: linea(datos.get('titulo'), MAX_TITULO),
    de: esPersona(datos.get('de')) ? datos.get('de') : null,
    deNombre: linea(datos.get('deNombre'), 60),
    i: Math.min(entero(datos.get('i'), 0, MAX_MAZO) ?? 0, mazo.length),
    vuelta: datos.get('vuelta') === true,
    vez,
    marcas,
    personas,
  };
}

export const darVuelta = (datos) => datos.set('vuelta', datos.get('vuelta') !== true);

/** The next card, from the one seen (`desde`): two who press at once move one card, not two. */
export function siguiente(datos, desde) {
  datos.doc.transact(() => {
    if ((entero(datos.get('i'), 0, MAX_MAZO) ?? 0) !== desde) return;
    datos.set('i', desde + 1);
    datos.set('vuelta', false);
  });
}

/** This student knew card `i` ('si'), or not ('no'). The same again takes it back. */
export function marcar(datos, yo, i, valor) {
  if (!esPersona(yo.id) || (valor !== 'si' && valor !== 'no')) return;
  const vez = entero(datos.get('vez'), 0, 1e6) ?? 0;
  const clave = `r:${vez}:${yo.id}:${i}`;
  datos.doc.transact(() => {
    if (datos.get(clave) === valor) datos.delete(clave);
    else datos.set(clave, valor);
    datos.set(`p:${yo.id}`, { nombre: linea(yo.nombre, 60), color: typeof yo.color === 'string' ? yo.color.slice(0, 30) : '' });
  });
}

/** The same deck again from the first card, with no answers. */
export function otraVuelta(datos) {
  datos.doc.transact(() => {
    [...datos.keys()].filter((k) => k.startsWith('r:')).forEach((k) => datos.delete(k));
    datos.set('vez', (entero(datos.get('vez'), 0, 1e6) ?? 0) + 1);
    datos.set('i', 0);
    datos.set('vuelta', false);
  });
}

/** For each one who answered: { persona, nombre, color, si, no, cuales (the cards not known) }, most known first. */
export function resumen(estado, nombreDe = () => null) {
  return [...estado.marcas]
    .map(([persona, m]) => {
      const valores = [...m];
      const p = estado.personas.get(persona);
      return {
        persona,
        nombre: nombreDe(persona) ?? p?.nombre ?? 'Alguien',
        color: p?.color ?? '',
        si: valores.filter(([, v]) => v === 'si').length,
        no: valores.filter(([, v]) => v === 'no').length,
        cuales: valores.filter(([, v]) => v === 'no').map(([i]) => i).sort((a, b) => a - b),
      };
    })
    .sort((a, b) => b.si - a.si || a.nombre.localeCompare(b.nombre, 'es'));
}

/** What the session's Consultron reads: the card in view, with its back once turned. */
export function textoDelRepaso(estado) {
  const { mazo, titulo, i, vuelta } = estado;
  if (!mazo.length) return 'Repaso en grupo, sin mazo elegido todavía.';
  const cabeza = `Repaso en grupo${titulo ? ` de «${titulo}»` : ''}.`;
  if (i >= mazo.length) {
    const cuentas = resumen(estado).map((r) => `- ${r.nombre}: la sabía en ${r.si}, no la sabía en ${r.no}.`);
    return [cabeza, `Terminaron las ${mazo.length} tarjetas.`, cuentas.join('\n')].filter(Boolean).join('\n');
  }
  const t = mazo[i];
  return [cabeza, `Tarjeta ${i + 1} de ${mazo.length}.`, `Pregunta: ${t.f}`, vuelta ? `Respuesta: ${t.d || 'sin respuesta escrita'}` : 'Todavía no le dieron vuelta.'].join('\n');
}

/** What «Guardar en lo mío» keeps: the deck as a list, front and back. */
export function paraGuardarMazo(estado) {
  const una = (t) => t.replace(/\s+/g, ' ').trim();
  return {
    nombre: `Repaso: ${estado.titulo || 'mazo de la sesión'}`,
    texto: [`# ${estado.titulo || 'Mazo de la sesión'}`, estado.mazo.map((t) => `- ${una(t.f)} — ${t.d ? una(t.d) : 'sin respuesta escrita'}`).join('\n')].join('\n\n'),
  };
}
