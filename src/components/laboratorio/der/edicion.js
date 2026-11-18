// What the DER sheet does to a diagram (the `.der` format, docs/laboratorio-der.md): each change gives a new object,
// so undoing is going back to the one before. Names follow the course: lowercase with `_`, and a vínculo is named
// after what it joins (`cliente_contrato`).
import { cajaDeAgregacion, cajaSin, conOvalo, medidaDe, medidaOvalo, ocupado, soloOvalo } from './geometria';

export const COLECCION = { entidad: 'entidades', vinculo: 'vinculos', jerarquia: 'jerarquias', agregacion: 'agregaciones' };
export const MAX_PUNTAS = 3;
export const MINIMOS = ['0', '1'];
export const MAXIMOS = ['1', 'N', 'M', 'L', 'P'];

const azar = () => Math.random().toString(36).slice(2, 8).padEnd(6, '0');

/** An id not used in `der`, with the letter of its kind. */
export function idNuevo(der, letra) {
  const usados = new Set([
    ...der.entidades.map((e) => e.id),
    ...der.vinculos.map((v) => v.id),
    ...der.jerarquias.map((j) => j.id),
    ...der.agregaciones.map((g) => g.id),
    ...[...der.entidades, ...der.vinculos].flatMap((x) => x.atributos.flatMap((a) => [a.id, ...(a.partes ?? []).map((p) => p.id)])),
  ]);
  let id;
  do id = `${letra}${azar()}`;
  while (usados.has(id));
  return id;
}

/** A name as the course writes it: lowercase, words with `_`. */
export const comoNombre = (texto) => String(texto ?? '').toLowerCase().replace(/\s+/g, '_');

/** The first free name of `base`, `base_2`… among `usados`. */
export function nombreLibre(base, usados) {
  const hay = new Set(usados);
  if (!hay.has(base)) return base;
  let n = 2;
  while (hay.has(`${base}_${n}`)) n += 1;
  return `${base}_${n}`;
}

const todosLosNombres = (der) => [...der.entidades, ...der.vinculos, ...der.agregaciones].map((x) => x.nombre);
const cambiarEn = (lista, id, f) => lista.map((x) => (x.id === id ? f(x) : x));

export const buscar = (der, tipo, id) => der[COLECCION[tipo]]?.find((x) => x.id === id) ?? null;

/** What an end of a vínculo points to: an entity or an aggregation, by its name. */
export function nombreDe(der, id) {
  return (der.entidades.find((e) => e.id === id) ?? der.agregaciones.find((g) => g.id === id))?.nombre ?? '';
}

export function agregarEntidad(der, { x, y }) {
  const id = idNuevo(der, 'e');
  const nombre = nombreLibre('entidad', todosLosNombres(der));
  const entidad = { id, nombre, debil: false, x, y, atributos: [{ id: idNuevo(der, 'a'), nombre: 'id', clave: true, multivaluado: false, derivado: false, partes: [] }] };
  return [{ ...der, entidades: [...der.entidades, entidad] }, id];
}

/** The middle of an entity or an aggregation on the sheet, unmeasured; null if it isn't there. */
export function centroDe(der, id) {
  const e = der.entidades.find((x) => x.id === id);
  if (e) {
    const [w, h] = medidaDe('entidad', e);
    return { x: e.x + w / 2, y: e.y + h / 2 };
  }
  const g = der.agregaciones.find((x) => x.id === id);
  const c = g && cajaDeAgregacion(der, g);
  return c ? { x: c.x + c.w / 2, y: c.y + c.h / 2 } : null;
}

// Whether the segment from `p` to `q` goes through the box `c` (Liang-Barsky).
function cruza(p, q, c) {
  let [t0, t1] = [0, 1];
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  for (const [a, b] of [[-dx, p.x - c.izq], [dx, c.der - p.x], [-dy, p.y - c.arriba], [dy, c.abajo - p.y]]) {
    if (a === 0) {
      if (b < 0) return false;
    } else {
      const t = b / a;
      if (a < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
      if (t0 > t1) return false;
    }
  }
  return true;
}

/**
 * Where a new vínculo between `extremos` goes: between them if there is room, else the nearest free place whose lines
 * to its ends don't go through another shape (or, if there is none near, the nearest free one); a recursive one,
 * under its entity.
 */
export function lugarDeVinculo(der, extremos, nombre) {
  const [w, h] = medidaDe('vinculo', { nombre });
  const centros = extremos.map((a) => centroDe(der, a)).filter(Boolean);
  if (!centros.length) return lugarLibre(der, { x: 0, y: 0 }, 'vinculo', [], { nombre });
  const cx = centros.reduce((t, c) => t + c.x, 0) / centros.length;
  const cy = centros.reduce((t, c) => t + c.y, 0) / centros.length + (new Set(extremos).size === 1 ? 110 : 0);
  // The shapes alone, without ovals: a line may pass by an oval, never through an entity.
  const formas = [
    ...der.entidades.map((e) => ({ id: e.id, ...conOvalo({ ...cajaSin('entidad', e), ovalo: null }) })),
    ...der.vinculos.map((v) => ({ id: v.id, ...conOvalo({ ...cajaSin('vinculo', v), ovalo: null }) })),
  ];
  const sirve = (px, py) => {
    const m = { x: px + w / 2, y: py + h / 2 };
    return extremos.every((a, i) => {
      const fin = centros[i];
      return !fin || !formas.some((f) => f.id !== a && cruza(m, fin, f));
    });
  };
  return lugarLibre(der, { x: cx - w / 2, y: cy - h / 2 }, 'vinculo', [], { nombre, sirve });
}

/**
 * A vínculo between `extremos` (ids of entities or aggregations; the same one twice is a recursive vínculo), at
 * `lugar` or, without it, where `lugarDeVinculo` finds room.
 */
export function agregarVinculo(der, extremos, lugar = null) {
  const id = idNuevo(der, 'v');
  const nombre = nombreLibre(extremos.length ? [...new Set(extremos.map((a) => nombreDe(der, a)))].join('_') || 'vinculo' : 'vinculo', todosLosNombres(der));
  const { x, y } = lugar ?? lugarDeVinculo(der, extremos, nombre);
  const vinculo = { id, nombre, identificador: false, x, y, atributos: [], puntas: extremos.slice(0, MAX_PUNTAS).map((a) => ({ a, card: '0:N', rol: '' })) };
  return [{ ...der, vinculos: [...der.vinculos, vinculo] }, id];
}

/**
 * The ends of a new vínculo from what is chosen (ids of entities and aggregations, in the order chosen): two or more,
 * those; one, it and the entity nearest to it (not one inside it, if it is an aggregation); none, the first two
 * entities. A single entity alone gets a recursive one.
 */
export function extremosNuevos(der, elegidos) {
  const validos = elegidos.filter((id) => der.entidades.some((e) => e.id === id) || der.agregaciones.some((g) => g.id === id));
  if (validos.length >= 2) return validos.slice(0, MAX_PUNTAS);
  if (!validos.length) {
    const [a, b] = der.entidades.map((e) => e.id);
    return a ? [a, b ?? a] : [];
  }
  const uno = validos[0];
  const g = der.agregaciones.find((x) => x.id === uno);
  const v = g && der.vinculos.find((x) => x.id === g.vinculo);
  const dentro = new Set([uno, ...(v ? v.puntas.map((p) => p.a) : [])]);
  const c = centroDe(der, uno);
  const lejos = (e) => {
    const o = centroDe(der, e.id);
    return c && o ? Math.hypot(o.x - c.x, o.y - c.y) : 0;
  };
  const otras = der.entidades.filter((e) => !dentro.has(e.id));
  if (!otras.length) return g ? [] : [uno, uno];
  return [uno, otras.reduce((a, b) => (lejos(b) < lejos(a) ? b : a)).id];
}

/** Where a new hierarchy goes: under its superclass, in the nearest free place. */
export function lugarDeJerarquia(der, superclase) {
  const c = centroDe(der, superclase) ?? { x: 0, y: 0 };
  const [w] = medidaDe('jerarquia');
  return lugarLibre(der, { x: c.x - w / 2, y: c.y + medidaDe('entidad')[1] / 2 + 40 }, 'jerarquia');
}

export function agregarJerarquia(der, superclase, subclases, { x, y }) {
  const id = idNuevo(der, 'j');
  const jerarquia = { id, x, y, superclase, subclases: subclases.filter((s) => s !== superclase), tipo: 'D', total: false, pasaje: 'superclase' };
  return [{ ...der, jerarquias: [...der.jerarquias, jerarquia] }, id];
}

export function agregarAgregacion(der, vinculo) {
  const id = idNuevo(der, 'g');
  const v = buscar(der, 'vinculo', vinculo);
  const nombre = nombreLibre(v?.nombre ? `${v.nombre}_agr` : 'agregacion', todosLosNombres(der));
  return [{ ...der, agregaciones: [...der.agregaciones, { id, nombre, vinculo }] }, id];
}

export function cambiar(der, tipo, id, cambios) {
  const col = COLECCION[tipo];
  return { ...der, [col]: cambiarEn(der[col], id, (x) => ({ ...x, ...cambios })) };
}

/** A new name; an entity or a vínculo keeps its middle, so it grows to both sides and stays between its lines. */
export function renombrar(der, tipo, id, nombre) {
  const x = buscar(der, tipo, id);
  if (!x || (tipo !== 'entidad' && tipo !== 'vinculo')) return cambiar(der, tipo, id, { nombre });
  const corre = (medidaDe(tipo, x)[0] - medidaDe(tipo, { nombre })[0]) / 2;
  return cambiar(der, tipo, id, { nombre, x: Math.round(x.x + corre) });
}

export const mover = (der, tipo, id, { x, y }) => cambiar(der, tipo, id, { x: Math.round(x), y: Math.round(y) });

// What was decided about a vínculo goes with it.
function sinDecisiones(der, vinculos) {
  const fuera = new Set(vinculos);
  const filtrar = (o) => Object.fromEntries(Object.entries(o ?? {}).filter(([k]) => !fuera.has(k)));
  return { ...der.decisiones, cp: filtrar(der.decisiones.cp), lado11: filtrar(der.decisiones.lado11) };
}

/** Takes out an element and what can't stay without it: the ends that pointed to it, a vínculo left with fewer than
 * two ends, a hierarchy without its superclass and an aggregation without its vínculo. */
export function borrar(der, tipo, id) {
  let d = der;
  let fuera = new Set([id]);
  if (tipo === 'vinculo') d = { ...d, vinculos: d.vinculos.filter((v) => v.id !== id) };
  else if (tipo === 'jerarquia') d = { ...d, jerarquias: d.jerarquias.filter((j) => j.id !== id) };
  else if (tipo === 'entidad' || tipo === 'agregacion') {
    d = { ...d, [COLECCION[tipo]]: d[COLECCION[tipo]].filter((x) => x.id !== id) };
    d = {
      ...d,
      jerarquias: d.jerarquias
        .filter((j) => j.superclase !== id)
        .map((j) => ({ ...j, subclases: j.subclases.filter((s) => s !== id) })),
    };
  }
  // Ends that lost what they pointed to, vínculos left alone and aggregations left without their vínculo, until
  // nothing else falls.
  const vinculosFuera = new Set(tipo === 'vinculo' ? [id] : []);
  for (;;) {
    const vinculos = d.vinculos
      .map((v) => ({ ...v, puntas: v.puntas.filter((p) => !fuera.has(p.a)) }))
      .filter((v) => {
        if (v.puntas.length >= 2) return true;
        vinculosFuera.add(v.id);
        return false;
      });
    const agregaciones = d.agregaciones.filter((g) => !vinculosFuera.has(g.vinculo));
    const caidas = d.agregaciones.filter((g) => vinculosFuera.has(g.vinculo)).map((g) => g.id);
    d = { ...d, vinculos, agregaciones };
    if (!caidas.length) break;
    fuera = new Set([...fuera, ...caidas]);
  }
  const lado11 = Object.fromEntries(Object.entries(d.decisiones?.lado11 ?? {}).filter(([, e]) => !fuera.has(e)));
  return { ...d, decisiones: { ...sinDecisiones({ ...d, decisiones: { ...d.decisiones, lado11 } }, vinculosFuera) } };
}

// --- Attributes, of an entity or a vínculo. `parte`: the id of a part of a composite one.

export function agregarAtributo(der, tipo, dueno, padre = null) {
  const id = idNuevo(der, 'a');
  const x = buscar(der, tipo, dueno);
  if (!x) return [der, null];
  const usados = (padre ? x.atributos.find((a) => a.id === padre)?.partes ?? [] : x.atributos).map((a) => a.nombre);
  const nuevo = { id, nombre: nombreLibre(padre ? 'parte' : 'atributo', usados), clave: false, multivaluado: false, derivado: false, partes: [] };
  const atributos = padre ? x.atributos.map((a) => (a.id === padre ? { ...a, partes: [...(a.partes ?? []), { ...nuevo, partes: [] }] } : a)) : [...x.atributos, nuevo];
  return [ovaloLibre(cambiar(der, tipo, dueno, { atributos }), tipo, dueno, der), id];
}

const AIRE = 16;
// How many rings around the place asked `sirve` is looked for, before the nearest free place goes.
const ANILLOS_QUE_ELIGEN = 12;
const pisan = (c, o, aire = AIRE) => c.izq < o.der + aire && c.der > o.izq - aire && c.arriba < o.abajo + aire && c.abajo > o.arriba - aire;

/**
 * The oval of an entity or a vínculo that grew onto a neighbour goes to the free side nearest its shape: above, to a
 * side or below, a bit farther each time. If it already covered something in `antes`, it stays where it is.
 */
export function ovaloLibre(der, tipo, id, antes = null) {
  const x = buscar(der, tipo, id);
  if (!x?.atributos?.length) return der;
  const [fw, fh] = medidaDe(tipo, x);
  const forma = { x: x.x, y: x.y, w: fw, h: fh };
  const pisaEn = (d, ovalo) => ocupado(d, id).some((o) => pisan(soloOvalo({ ...forma, ovalo }), o, 8));
  if (!pisaEn(der, medidaOvalo(x.atributos, x.ovalo))) return der;
  const previo = antes && buscar(antes, tipo, id);
  if (previo?.atributos?.length && pisaEn(antes, medidaOvalo(previo.atributos, previo.ovalo))) return der;
  const cajas = ocupado(der, id);
  const { w, h } = medidaOvalo(x.atributos);
  const oh = h - 12;
  const [mw, mh] = [fw / 2 + w / 2, fh / 2 + oh / 2];
  for (let k = 0; k <= 10; k += 1) {
    const d = k * 24;
    const lados = [[0, -(mh + 12 + d)], [mw + 16 + d, 0], [-(mw + 16 + d), 0], [0, mh + 12 + d], [mw + d, -(mh + 8 + d)], [-(mw + d), -(mh + 8 + d)], [mw + d, mh + 8 + d], [-(mw + d), mh + 8 + d]];
    const libre = lados.find(([dx, dy]) => !cajas.some((o) => pisan(soloOvalo({ ...forma, ovalo: { w, h: oh, dx, dy } }), o, 8)));
    if (libre) return cambiar(der, tipo, id, { ovalo: { dx: Math.round(libre[0]), dy: Math.round(libre[1]) } });
  }
  return der;
}

const enAtributos = (atributos, id, f) =>
  atributos.flatMap((a) => {
    if (a.id === id) return f(a);
    return [{ ...a, partes: (a.partes ?? []).flatMap((p) => (p.id === id ? f(p) : [p])) }];
  });

export function cambiarAtributo(der, tipo, dueno, id, cambios) {
  const x = buscar(der, tipo, dueno);
  return x ? cambiar(der, tipo, dueno, { atributos: enAtributos(x.atributos, id, (a) => [{ ...a, ...cambios }]) }) : der;
}

export function borrarAtributo(der, tipo, dueno, id) {
  const x = buscar(der, tipo, dueno);
  return x ? cambiar(der, tipo, dueno, { atributos: enAtributos(x.atributos, id, () => []) }) : der;
}

/** Moves an attribute one place up (-1) or down (1) among its siblings. */
export function correrAtributo(der, tipo, dueno, id, paso) {
  const x = buscar(der, tipo, dueno);
  if (!x) return der;
  const correr = (lista) => {
    const i = lista.findIndex((a) => a.id === id);
    if (i < 0) return lista.map((a) => ({ ...a, partes: correr(a.partes ?? []) }));
    const j = i + paso;
    if (j < 0 || j >= lista.length) return lista;
    const nueva = [...lista];
    [nueva[i], nueva[j]] = [nueva[j], nueva[i]];
    return nueva;
  };
  return cambiar(der, tipo, dueno, { atributos: correr(x.atributos) });
}

// --- The ends of a vínculo.

export function agregarPunta(der, vinculo, a) {
  const v = buscar(der, 'vinculo', vinculo);
  if (!v || v.puntas.length >= MAX_PUNTAS) return der;
  return cambiar(der, 'vinculo', vinculo, { puntas: [...v.puntas, { a, card: '0:N', rol: '' }] });
}

export function cambiarPunta(der, vinculo, i, cambios) {
  const v = buscar(der, 'vinculo', vinculo);
  if (!v) return der;
  const d = cambiar(der, 'vinculo', vinculo, { puntas: v.puntas.map((p, k) => (k === i ? { ...p, ...cambios } : p)) });
  // What changes the shape of the vínculo asks again what was decided about it.
  return { ...d, decisiones: sinDecisiones(d, [vinculo]) };
}

export function quitarPunta(der, vinculo, i) {
  const v = buscar(der, 'vinculo', vinculo);
  if (!v || v.puntas.length <= 2) return der;
  const d = cambiar(der, 'vinculo', vinculo, { puntas: v.puntas.filter((_, k) => k !== i) });
  return { ...d, decisiones: sinDecisiones(d, [vinculo]) };
}

/** `min:max` of an end, apart. */
export function partirCard(card) {
  const [min, max] = String(card ?? '').split(':');
  return { min: MINIMOS.includes(min) ? min : '0', max: max && /^(1|[A-Z])$/.test(max) ? max : 'N' };
}

// --- What the student decides in the tables view (decision 2 and 4).

export function decidir(der, que, clave, valor) {
  const actual = { ...(der.decisiones?.[que] ?? {}) };
  if (valor === null || valor === undefined || (Array.isArray(valor) && !valor.length)) delete actual[clave];
  else actual[clave] = valor;
  return { ...der, decisiones: { cp: {}, lado11: {}, tipos: {}, ...der.decisiones, [que]: actual } };
}

/**
 * Where a new shape goes so it lands on nothing: the free place nearest to `{ x, y }` (its top left corner), with room
 * for its oval and air around. `tipo` and `nombre` give its size; `atributos`, its oval (a new entity comes with its
 * `id`). `sirve(x, y)`: what else a place needs; within the first rings it is asked, after them any free place goes.
 */
export function lugarLibre(der, { x, y }, tipo = 'entidad', atributos = tipo === 'entidad' ? [{ nombre: 'id', partes: [] }] : [], { nombre, sirve } = {}) {
  const PASO = 24;
  const cajas = ocupado(der);
  const [w, h] = medidaDe(tipo, { nombre });
  const ovalo = medidaOvalo(atributos);
  const pisa = (px, py) => {
    const c = conOvalo({ x: px, y: py, w, h, ovalo });
    return cajas.some((o) => pisan(c, o));
  };
  const x0 = Math.round(x / 8) * 8;
  const y0 = Math.round(y / 8) * 8;
  let primero = null;
  for (let r = 0; r <= 40; r += 1) {
    const anillo = [];
    for (let i = -r; i <= r; i += 1) {
      for (let j = -r; j <= r; j += 1) if (Math.max(Math.abs(i), Math.abs(j)) === r) anillo.push([i * PASO, j * PASO]);
    }
    anillo.sort((a, b) => Math.hypot(...a) - Math.hypot(...b));
    for (const [dx, dy] of anillo) {
      if (pisa(x0 + dx, y0 + dy)) continue;
      if (!sirve || sirve(x0 + dx, y0 + dy)) return { x: x0 + dx, y: y0 + dy };
      primero ??= { x: x0 + dx, y: y0 + dy };
    }
    if (primero && r >= ANILLOS_QUE_ELIGEN) return primero;
  }
  return primero ?? { x: x0, y: y0 };
}

const CUANTOS = { '0:1': ['un', 'o ninguno'], '1:1': ['un solo', ''], '0:N': ['ninguno o muchos', ''], '1:N': ['uno o muchos', ''] };

/**
 * How an end of a binary vínculo reads, as the course's sheets write it: the cardinality next to an entity says how
 * many of it go with one of the other (`1:1` next to cliente in cliente_contrato, the CF on the other side). '' for a
 * ternary or an end without cardinality.
 */
export function lecturaDePunta(der, v, i) {
  const p = v?.puntas?.[i];
  if (!p?.card || v.puntas.length !== 2) return '';
  const otra = v.puntas[1 - i];
  const { min, max } = partirCard(p.card);
  const [cuanto, cola] = CUANTOS[`${min}:${max === '1' ? '1' : 'N'}`];
  const nombre = (q) => `«${q.rol || nombreDe(der, q.a) || 'sin nombre'}»`;
  return `Cada ${nombre(otra)} va con ${cuanto} ${nombre(p)}${cola ? ` ${cola}` : ''}.`;
}
