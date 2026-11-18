// The drawing of the database: its tables one under the other, the ones others point to first, and each foreign key as
// a line in the margin from its column to the one it points to. Pure: the order, the lines and their lanes in the
// margin come out of the schema; the screen only measures where each row ended up.

/** Each foreign key of `esquema` as a line: from a column of a table to a column of another one (or of itself). */
export function relaciones(esquema) {
  const porNombre = new Map((esquema ?? []).map((t) => [t.nombre.toLowerCase(), t]));
  const lista = [];
  for (const t of esquema ?? []) {
    for (const f of t.foraneas ?? []) {
      const destino = porNombre.get(String(f.tabla).toLowerCase());
      // Without the column it points to, it's the other table's primary key.
      const claves = destino?.columnas.filter((c) => c.clave).sort((a, b) => a.clave - b.clave) ?? [];
      const hacia = f.hacia?.[0] ?? claves[0]?.nombre ?? null;
      lista.push({ desde: { tabla: t.nombre, columna: f.desde[0] }, hacia: { tabla: destino?.nombre ?? f.tabla, columna: hacia }, existe: Boolean(destino) });
    }
  }
  return lista;
}

/**
 * The tables in the order they're drawn: by levels (a table goes after the ones it points to) and, inside each level,
 * close to the ones it points to, so the lines stay short. Views go last.
 */
export function ordenar(esquema) {
  const tablas = (esquema ?? []).filter((t) => !t.vista);
  const vistas = (esquema ?? []).filter((t) => t.vista);
  const nombres = new Map(tablas.map((t) => [t.nombre.toLowerCase(), t]));
  const apunta = new Map(tablas.map((t) => [t.nombre, [...new Set((t.foraneas ?? []).map((f) => nombres.get(String(f.tabla).toLowerCase())?.nombre).filter((n) => n && n !== t.nombre))]]));
  const nivel = new Map();
  const nivelDe = (n, camino = new Set()) => {
    if (nivel.has(n)) return nivel.get(n);
    // A circle (A points to B and B to A): it's cut where it closes.
    if (camino.has(n)) return 0;
    camino.add(n);
    const v = Math.max(-1, ...apunta.get(n).map((o) => nivelDe(o, camino))) + 1;
    camino.delete(n);
    nivel.set(n, v);
    return v;
  };
  tablas.forEach((t) => nivelDe(t.nombre));
  const lugar = new Map();
  const orden = [];
  const niveles = [...new Set([...nivel.values()])].sort((a, b) => a - b);
  for (const v of niveles) {
    const deEste = tablas.filter((t) => nivel.get(t.nombre) === v);
    const peso = (t) => {
      const ps = apunta.get(t.nombre).map((o) => lugar.get(o)).filter((p) => p !== undefined);
      return ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : Infinity;
    };
    deEste.sort((a, b) => peso(a) - peso(b) || a.nombre.localeCompare(b.nombre));
    for (const t of deEste) {
      lugar.set(t.nombre, orden.length);
      orden.push(t);
    }
  }
  return [...orden, ...vistas];
}

/**
 * Which lane of the margin each line goes in, from where its ends are in the drawing (`posicion(tabla, columna)` gives a
 * number that grows downwards): the lines that point to the same column go together in one lane, as branches of it;
 * two that overlap go in different lanes, the short ones nearer the tables. Returns the lanes (same order as `lineas`)
 * and how many there are.
 */
export function carriles(lineas, posicion) {
  const grupos = new Map();
  lineas.forEach((l, i) => {
    const a = posicion(l.desde.tabla, l.desde.columna);
    const b = posicion(l.hacia.tabla, l.hacia.columna);
    const k = JSON.stringify([l.hacia.tabla, l.hacia.columna]);
    const g = grupos.get(k) ?? { lineas: [], de: b, a: b };
    g.lineas.push(i);
    g.de = Math.min(g.de, a, b);
    g.a = Math.max(g.a, a, b);
    grupos.set(k, g);
  });
  const ocupados = [];
  const carril = new Array(lineas.length).fill(0);
  for (const g of [...grupos.values()].sort((x, y) => x.a - x.de - (y.a - y.de) || x.de - y.de)) {
    let c = 0;
    // Two that only touch (one ends where the other starts) share it.
    while (ocupados[c]?.some((o) => g.a > o.de && g.de < o.a)) c += 1;
    (ocupados[c] ??= []).push(g);
    g.lineas.forEach((i) => {
      carril[i] = c;
    });
  }
  return { carril, cuantos: ocupados.length };
}

/** The path of a line in the margin: out of the row at (x, y1), down or up its lane at `xc`, and into the row at (x, y2). */
export function trazo(x, y1, y2, xc) {
  const r = Math.min(5, Math.abs(y2 - y1) / 2, (x - xc) / 2);
  if (r < 0.5) return `M${x} ${y1}H${xc}V${y2}H${x}`;
  const s = y2 > y1 ? 1 : -1;
  return `M${x} ${y1}H${xc + r}Q${xc} ${y1} ${xc} ${y1 + s * r}V${y2 - s * r}Q${xc} ${y2} ${xc + r} ${y2}H${x}`;
}
