// Where a line of the DER meets the outline of a shape, so it starts and ends on it: a rectangle (entity,
// aggregation), a diamond (vínculo), a circle (hierarchy) or an ellipse (the oval of attributes). `caja`: { cx, cy, w,
// h, forma }.

export function borde(caja, hacia) {
  const dx = hacia.x - caja.cx;
  const dy = hacia.y - caja.cy;
  if (!dx && !dy) return { x: caja.cx, y: caja.cy };
  const a = caja.w / 2;
  const b = caja.h / 2;
  let t;
  if (caja.forma === 'vinculo') t = 1 / (Math.abs(dx) / a + Math.abs(dy) / b);
  else if (caja.forma === 'jerarquia') t = Math.min(a, b) / Math.hypot(dx, dy);
  else if (caja.forma === 'ovalo') t = 1 / Math.hypot(dx / a, dy / b);
  else t = Math.min(dx ? a / Math.abs(dx) : Infinity, dy ? b / Math.abs(dy) : Infinity);
  return { x: caja.cx + dx * t, y: caja.cy + dy * t };
}

/** The line between two shapes, moved sideways by `desfase` (two ends to the same entity, side by side). */
export function tramo(desde, hasta, desfase = 0) {
  const largo = Math.hypot(hasta.cx - desde.cx, hasta.cy - desde.cy) || 1;
  const ux = (hasta.cx - desde.cx) / largo;
  const uy = (hasta.cy - desde.cy) / largo;
  const ox = -uy * desfase;
  const oy = ux * desfase;
  const a = { ...desde, cx: desde.cx + ox, cy: desde.cy + oy };
  const b = { ...hasta, cx: hasta.cx + ox, cy: hasta.cy + oy };
  // Moved sideways, the line still has to start inside each shape: it aims at the other's moved middle.
  const p = borde(a, { x: b.cx, y: b.cy });
  const q = borde(b, { x: a.cx, y: a.cy });
  return { p, q, ux, uy };
}

// The size of each shape on the sheet, before it is measured.
export const MEDIDA = { entidad: [112, 44], vinculo: [120, 52], jerarquia: [46, 46], agregacion: [180, 110] };

// How wide a letter of a shape's name is, roughly (der.css: .der-nombre), and what the shape adds around it.
const LETRA = 9.2;
const ALREDEDOR = { entidad: 40, vinculo: 70 };

/** A shape's size before it is measured: an entity or a vínculo grows with its name; a vínculo without one is small. */
export function medidaDe(tipo, x = {}) {
  const [w, h] = MEDIDA[tipo];
  if (tipo === 'vinculo' && x.nombre === '') return [46, 46];
  if (!ALREDEDOR[tipo] || !x.nombre) return [w, h];
  return [Math.max(w, Math.ceil(x.nombre.length * LETRA) + ALREDEDOR[tipo]), h];
}

// How an attribute is written in the oval: a composite one with its parts, a multivalued one between braces and a
// derived one after a slash.
export function textoAtributo(a) {
  const base = a.partes?.length ? `${a.nombre} (${a.partes.map((p) => p.nombre).join(', ')})` : a.nombre;
  return `${a.derivado ? '/' : ''}${a.multivaluado ? `{${base}}` : base}`;
}

// The oval's size, roughly, for the box of an aggregation and for the free place of a new shape (the oval sits over
// its shape, outside what React Flow measures).
export function medidaOvalo(atributos, lugar) {
  if (!atributos.length) return null;
  const largo = Math.max(...atributos.map((a) => textoAtributo(a).length));
  const medida = { w: largo * 7 + 40, h: atributos.length * 15 + 26 + 12 };
  return lugar ? { ...medida, h: medida.h - 12, dx: lugar.dx, dy: lugar.dy } : medida;
}

/** The outline of the oval alone (with its short line, if it is over the shape); null without one. */
export function soloOvalo(c) {
  if (!c.ovalo) return null;
  const { w, h } = c.ovalo;
  const cx = c.x + c.w / 2 + (c.ovalo.dx ?? 0);
  const cy = c.ovalo.dy === undefined ? c.y - h / 2 : c.y + c.h / 2 + c.ovalo.dy;
  return { izq: cx - w / 2, der: cx + w / 2, arriba: cy - h / 2, abajo: cy + h / 2 };
}

// The outline of a shape with its oval: over the shape, or at `dx, dy` from the shape's middle if it was moved.
export function conOvalo(c) {
  const caja = { izq: c.x, der: c.x + c.w, arriba: c.y, abajo: c.y + c.h };
  const o = soloOvalo(c);
  if (!o) return caja;
  return { izq: Math.min(caja.izq, o.izq), der: Math.max(caja.der, o.der), arriba: Math.min(caja.arriba, o.arriba), abajo: Math.max(caja.abajo, o.abajo) };
}

/** The box that holds an aggregation's shapes and their ovals, with air around. */
export function cajaDe(cajas, aire = 20) {
  if (!cajas.length) return null;
  const todas = cajas.map(conOvalo);
  const izq = Math.min(...todas.map((c) => c.izq));
  const der = Math.max(...todas.map((c) => c.der));
  const arriba = Math.min(...todas.map((c) => c.arriba));
  const abajo = Math.max(...todas.map((c) => c.abajo));
  return { x: izq - aire, y: arriba - aire, w: der - izq + aire * 2, h: abajo - arriba + aire * 2 };
}

/** A shape as `conOvalo` and `cajaDe` take it, unmeasured: where it is, its size and its oval. */
export function cajaSin(tipo, x) {
  const [w, h] = medidaDe(tipo, x);
  return { x: x.x, y: x.y, w, h, ovalo: x.atributos ? medidaOvalo(x.atributos, x.ovalo) : null };
}

/** The box of an aggregation, around its vínculo and its ends with their ovals; null if its vínculo is gone. */
export function cajaDeAgregacion(der, g) {
  const v = der.vinculos.find((x) => x.id === g.vinculo);
  if (!v) return null;
  const ids = [v.id, ...v.puntas.map((p) => p.a)];
  return cajaDe([...der.entidades.filter((e) => ids.includes(e.id)).map((e) => cajaSin('entidad', e)), cajaSin('vinculo', v)]);
}

/**
 * What takes room on the sheet, unmeasured: each shape with its oval, and the box of each aggregation, with the `id`
 * of each. `sin`: the id of a shape left out, with the boxes of the aggregations it is in.
 */
export function ocupado(der, sin = null) {
  const cajas = [
    ...der.entidades.map((e) => ({ id: e.id, ...conOvalo(cajaSin('entidad', e)) })),
    ...der.vinculos.map((v) => ({ id: v.id, ...conOvalo(cajaSin('vinculo', v)) })),
    ...der.jerarquias.map((j) => ({ id: j.id, ...conOvalo(cajaSin('jerarquia', j)) })),
  ].filter((c) => c.id !== sin);
  for (const g of der.agregaciones) {
    const v = der.vinculos.find((x) => x.id === g.vinculo);
    if (sin && v && (v.id === sin || v.puntas.some((p) => p.a === sin))) continue;
    const c = cajaDeAgregacion(der, g);
    if (c) cajas.push({ id: g.id, izq: c.x, der: c.x + c.w, arriba: c.y, abajo: c.y + c.h });
  }
  return cajas;
}
