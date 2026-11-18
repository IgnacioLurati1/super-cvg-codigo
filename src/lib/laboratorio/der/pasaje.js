// From a DER to tables, by the rules of Bases de Datos («Pasaje a tablas» and «Pasar una jerarquía» of parcial-1 in the
// notes of El Santo Resumen): a strong entity is a table with its attributes; a weak one adds its owner's key, part of
// its CP; a 1 a N puts a CF on the N side; an N a M or a ternary is a new table with the keys and the attributes; a
// multivalued attribute is a table with the entity's key and itself. What the notes leave to the student (the CP of an
// N a M or a ternary with attributes, the side of a 1 a 1) is read from `der.decisiones`, and until it is there it is
// `pendientes`: no default (docs/laboratorio-der.md, decision 2).
//
// pasarATablas(der) → { tablas, pendientes, avisos, faltan }
//   tabla: { nombre, origen: { tipo: 'entidad' | 'vinculo' | 'multivaluado', id }, columnas: [{ nombre, nula }],
//            cp: [columnas] | null, cfs: [{ columnas, tabla, referidas, nn }], espera: [claves de pendientes] }
//   A CF to a table still waiting for a decision has `columnas: null, referidas: null`.
//   pendiente: { clave, tipo: 'cp' | 'lado11', vinculo, tabla, opciones, texto }, and a 'lado11' the vínculo's `nombre`.
//   For 'cp', opciones are the table's columns (the student picks any of them); for 'lado11', [{ id, nombre }] of the
//   two sides (the one picked acts as N).
//   aviso: { id, texto }: what of the DER doesn't pass (a missing key, a vínculo without cardinality…).
//   faltan: [texto], what of the drawing keeps the SQL from being created (a hierarchy with fewer than two subclasses).
import { leerCard, sanearDer } from './modelo';

const vacio = () => ({ tablas: [], pendientes: [], avisos: [], faltan: [] });

/** The columns an attribute gives: itself, or its parts if it is composite. A key's parts are all key. */
function hojas(atributos, clave = false, fuera = []) {
  for (const a of atributos) {
    if (a.multivaluado) continue;
    if (a.partes.length) hojas(a.partes, clave || a.clave, fuera);
    else if (a.nombre) fuera.push({ nombre: a.nombre, clave: clave || a.clave });
  }
  return fuera;
}

/** What kind of vínculo it is, for the pasaje. */
export function claseDeVinculo(v) {
  if (v.puntas.length < 2) return 'suelto';
  if (v.puntas.length > 2) return 'ternario';
  const [a, b] = v.puntas.map((p) => leerCard(p.card));
  if (!a || !b) return 'sincard';
  if (a.muchos && b.muchos) return 'nm';
  if (a.muchos || b.muchos) return '1n';
  return '11';
}

/** In an identifying vínculo, the end that is the weak entity: the weak one, and if both are, the one on the N side. */
export function puntaDebil(v, entidades) {
  const debiles = v.puntas.filter((p) => entidades.get(p.a)?.debil);
  if (debiles.length <= 1) return debiles[0] ?? null;
  return debiles.find((p) => leerCard(p.card)?.muchos) ?? debiles[0];
}

export function pasarATablas(entrada) {
  const der = sanearDer(entrada);
  if (!der) return vacio();
  const entidades = new Map(der.entidades.map((e) => [e.id, e]));
  const agregaciones = new Map(der.agregaciones.map((g) => [g.id, g]));
  const vinculos = new Map(der.vinculos.map((v) => [v.id, v]));
  const avisos = new Map();
  const avisar = (id, texto) => {
    if (!avisos.has(id)) avisos.set(id, { id, texto });
  };
  const pendientes = [];

  // ---- Hierarchies: where each entity's rows live --------------------------------------------------------------
  const superDe = new Map();
  const jerarquiasDe = new Map();
  for (const j of der.jerarquias) {
    if (!jerarquiasDe.has(j.superclase)) jerarquiasDe.set(j.superclase, []);
    jerarquiasDe.get(j.superclase).push(j);
    for (const s of j.subclases) {
      if (superDe.has(s)) avisar(`dos-jerarquias:${s}`, `«${entidades.get(s).nombre}» es subclase en dos jerarquías. Se pasa con la primera.`);
      else superDe.set(s, j);
    }
  }
  const aSubclases = (id) => (jerarquiasDe.get(id) ?? []).some((j) => j.pasaje === 'subclases');
  const incompletas = der.jerarquias.filter((j) => j.subclases.length < 2).map((j) => `La jerarquía de «${entidades.get(j.superclase)?.nombre || 'sin nombre'}» necesita dos subclases o más.`);

  const nombreDe = (id) => {
    if (entidades.has(id)) return entidades.get(id).nombre;
    const g = agregaciones.get(id);
    return g ? g.nombre || vinculos.get(g.vinculo)?.nombre || 'agregacion' : '';
  };
  const tablaDeVinculo = (v) => ['nm', 'ternario'].includes(claseDeVinculo(v)) && !(v.identificador && puntaDebil(v, entidades));

  /** Where the rows of an entity or aggregation go: { holder, plegada } or { falta }. */
  function lugar(id, vistos = new Set()) {
    if (vistos.has(id)) return { falta: `La jerarquía de «${nombreDe(id)}» da una vuelta sobre sí misma.` };
    vistos.add(id);
    const g = agregaciones.get(id);
    if (g) {
      const v = vinculos.get(g.vinculo);
      return tablaDeVinculo(v) ? { holder: `v:${v.id}` } : { falta: `La agregación de «${v.nombre}» no tiene tabla. Tiene que ser sobre un N a M.` };
    }
    const j = superDe.get(id);
    if (j?.pasaje === 'superclase') return { ...lugar(j.superclase, vistos), plegada: true };
    if (aSubclases(id)) return { falta: `«${nombreDe(id)}» pasó a sus subclases y no tiene tabla propia.` };
    return { holder: `e:${id}` };
  }

  // ---- Tables ------------------------------------------------------------------------------------------------
  const base = new Map();
  const llenas = new Set();
  const dependencias = new Map();
  const nuevaTabla = (holder, nombre, origen) => {
    const t = { nombre, origen, columnas: [], cp: null, cfs: [], espera: [] };
    base.set(holder, t);
    dependencias.set(holder, new Set());
    return t;
  };

  function sumarColumna(t, nombre, nula) {
    let n = nombre;
    for (let i = 2; t.columnas.some((c) => c.nombre === n); i++) n = `${nombre}_${i}`;
    if (n !== nombre) avisar(`repetida:${t.nombre}:${nombre}`, `En «${t.nombre}» hay dos columnas «${nombre}». Ponele un rol a una punta del vínculo para distinguirlas.`);
    t.columnas.push({ nombre: n, nula });
    return n;
  }

  /** A CF from `t` (of `holder`) to the entity or aggregation `destino`. Returns its columns, or null if it can't be. */
  function referir(holder, t, destino, { rol = '', nn = true, mismoNombre = false } = {}) {
    const l = lugar(destino);
    if (l.falta) {
      avisar(`sin-tabla:${destino}`, l.falta);
      return null;
    }
    const k = claveDe(l.holder);
    if (l.holder !== holder) dependencias.get(holder).add(l.holder);
    if (k.espera) {
      for (const e of k.espera) if (!t.espera.includes(e)) t.espera.push(e);
      t.cfs.push({ columnas: null, tabla: k.tabla, referidas: null, nn });
      return null;
    }
    if (k.falta) {
      avisar(`sin-clave:${l.holder}`, k.falta);
      return null;
    }
    const prefijo = rol || nombreDe(destino);
    const columnas = k.cols.map((c) => sumarColumna(t, mismoNombre ? c : c === 'id' ? `id_${prefijo}` : rol ? `${c}_${rol}` : c, !nn));
    t.cfs.push({ columnas, tabla: k.tabla, referidas: [...k.cols], nn });
    return columnas;
  }

  const visitando = new Set();
  /** The CP of a table, as another one references it: { cols, tabla } | { espera, tabla } | { falta }. */
  function claveDe(holder) {
    if (visitando.has(holder)) return { falta: 'Hay un ciclo de claves. Una tabla necesita su propia clave para armarla.' };
    visitando.add(holder);
    try {
      const t = holder.startsWith('v:') ? tabla(holder) : baseDe(holder);
      if (!t) return { falta: 'Esa tabla no se pudo armar.' };
      if (t.cp) return { cols: t.cp, tabla: t.nombre };
      const propia = pendientes.find((p) => p.tipo === 'cp' && p.tabla === t.nombre && `v:${p.vinculo}` === holder);
      if (t.espera.length || propia) return { espera: propia ? [propia.clave] : t.espera, tabla: t.nombre };
      return { falta: `«${t.nombre}» no tiene clave primaria.` };
    } finally {
      visitando.delete(holder);
    }
  }

  const columnasDe = (t, atributos, nula) => {
    const claves = [];
    for (const h of hojas(atributos)) {
      const n = sumarColumna(t, h.nombre, nula);
      if (h.clave) claves.push(n);
    }
    return claves;
  };

  /** The subclass attributes that a hierarchy passed to its superclass adds to it, nullable. */
  function plegadas(t, id, vistos = new Set([id])) {
    for (const j of jerarquiasDe.get(id) ?? []) {
      if (j.pasaje !== 'superclase') continue;
      for (const s of j.subclases) {
        if (vistos.has(s) || superDe.get(s) !== j) continue;
        vistos.add(s);
        columnasDe(t, entidades.get(s).atributos, true);
        plegadas(t, s, vistos);
      }
    }
  }

  const identificadores = (id) => der.vinculos.filter((v) => v.identificador && puntaDebil(v, entidades)?.a === id);

  /** An entity's table without the CFs other vínculos bring: enough to know its CP. */
  function baseDe(holder) {
    if (base.has(holder)) return base.get(holder);
    const e = entidades.get(holder.slice(2));
    const t = nuevaTabla(holder, e.nombre, { tipo: 'entidad', id: e.id });
    const j = superDe.get(e.id);
    if (e.debil) {
      const vs = identificadores(e.id);
      if (!vs.length) avisar(`debil-suelta:${e.id}`, `«${e.nombre}» es débil pero no tiene vínculo identificador. No hay de quién tomar la clave.`);
      const deDueno = [];
      let completa = vs.length > 0;
      for (const v of vs) {
        const debil = puntaDebil(v, entidades);
        for (const p of v.puntas) {
          if (p === debil) continue;
          const cols = referir(holder, t, p.a, { rol: p.rol, nn: true });
          if (cols) deDueno.push(...cols);
          else completa = false;
        }
      }
      const discriminante = columnasDe(t, e.atributos, true);
      for (const v of vs) columnasDe(t, v.atributos, true);
      if (completa && !t.espera.length) t.cp = [...deDueno, ...discriminante];
    } else if (j?.pasaje === 'completa') {
      const cols = referir(holder, t, j.superclase, { nn: true, mismoNombre: true });
      columnasDe(t, e.atributos, true);
      if (cols) t.cp = cols;
    } else if (j?.pasaje === 'subclases') {
      const sup = entidades.get(j.superclase);
      const claves = columnasDe(t, sup.atributos, true);
      columnasDe(t, e.atributos, true);
      if (claves.length) t.cp = claves;
      else avisar(`sin-clave:${holder}`, `«${sup.nombre}» no tiene identificador. «${e.nombre}» no tiene de dónde tomar su clave.`);
    } else {
      const claves = columnasDe(t, e.atributos, true);
      plegadas(t, e.id);
      if (claves.length) t.cp = claves;
      else avisar(`sin-clave:${holder}`, `«${e.nombre}» no tiene identificador. Su tabla queda sin clave primaria.`);
    }
    for (const c of t.columnas) if (t.cp?.includes(c.nombre)) c.nula = false;
    return t;
  }

  // The CF of each 1 a N (and each 1 a 1 already decided): { vinculo, host, ref } (`host` acts as N).
  const unoAN = [];
  for (const v of der.vinculos) {
    const clase = claseDeVinculo(v);
    if (v.identificador && puntaDebil(v, entidades)) continue;
    if (clase === 'suelto') avisar(`suelto:${v.id}`, `«${v.nombre}» tiene que unir al menos dos entidades.`);
    else if (clase === 'sincard') avisar(`sincard:${v.id}`, `A «${v.nombre}» le falta la cardinalidad. No se puede pasar.`);
    else if (clase === '1n') {
      const [a, b] = v.puntas;
      const host = leerCard(a.card).muchos ? a : b;
      unoAN.push({ vinculo: v, host, ref: host === a ? b : a });
    } else if (clase === '11') {
      const [a, b] = v.puntas;
      const elegido = a.a === b.a ? a.a : der.decisiones.lado11[v.id];
      if (elegido) {
        const host = a.a === elegido ? a : b;
        unoAN.push({ vinculo: v, host, ref: host === a ? b : a });
      } else {
        const clave = `lado11:${v.id}`;
        pendientes.push({ clave, tipo: 'lado11', vinculo: v.id, nombre: v.nombre || nombreDe(a.a), tabla: null, opciones: v.puntas.map((p) => ({ id: p.a, nombre: nombreDe(p.a) })), texto: `«${v.nombre}» es 1 a 1. Elegí el lado que actúa como N, donde va la CF.` });
      }
    }
    for (const a of v.atributos) if (a.multivaluado) avisar(`multi-vinculo:${a.id}`, `«${a.nombre}» es multivaluado y está en un vínculo. El apunte no dice cómo pasa y queda afuera.`);
  }

  /** The CFs the 1 a N vínculos put in this table, and the vínculo's attributes with them. */
  function entrantes(holder, t) {
    for (const { vinculo, host, ref } of unoAN) {
      const l = lugar(host.a);
      if (l.falta) {
        avisar(`sin-tabla:${host.a}`, l.falta);
        continue;
      }
      if (l.holder !== holder) continue;
      const nn = leerCard(ref.card).min >= 1 && !l.plegada;
      referir(holder, t, ref.a, { rol: ref.rol, nn });
      columnasDe(t, vinculo.atributos, true);
    }
  }

  /** A whole table: its base and the CFs that 1 a N vínculos bring. For a vínculo's table, also its CP. */
  function tabla(holder) {
    if (llenas.has(holder)) return base.get(holder);
    llenas.add(holder);
    if (holder.startsWith('e:')) {
      const t = baseDe(holder);
      entrantes(holder, t);
      return t;
    }
    const v = vinculos.get(holder.slice(2));
    const t = nuevaTabla(holder, v.nombre || v.puntas.map((p) => nombreDe(p.a)).join('_'), { tipo: 'vinculo', id: v.id });
    const deLasPuntas = [];
    for (const p of v.puntas) {
      const cols = referir(holder, t, p.a, { rol: p.rol, nn: true });
      if (cols) deLasPuntas.push(...cols);
    }
    const propios = hojas(v.atributos);
    columnasDe(t, v.atributos, true);
    entrantes(holder, t);
    if (t.espera.length || deLasPuntas.length < v.puntas.length) return t;
    if (!propios.length) t.cp = deLasPuntas;
    else {
      const nombres = t.columnas.map((c) => c.nombre);
      const elegidas = der.decisiones.cp[v.id] ?? [];
      if (elegidas.length && elegidas.every((c) => nombres.includes(c))) t.cp = nombres.filter((c) => elegidas.includes(c));
      else {
        const tipo = v.puntas.length > 2 ? 'Es un ternario con atributos' : 'Es un N a M con atributos';
        pendientes.push({ clave: `cp:${v.id}`, tipo: 'cp', vinculo: v.id, tabla: t.nombre, opciones: nombres, texto: `Elegí qué columnas forman la CP de «${t.nombre}». ${tipo}. La CP sale del análisis de dependencias funcionales.` });
      }
    }
    for (const c of t.columnas) if (t.cp?.includes(c.nombre)) c.nula = false;
    return t;
  }

  // ---- All of them, in order -------------------------------------------------------------------------------------
  const natural = [];
  for (const e of der.entidades) {
    const l = lugar(e.id);
    if (!l.falta && l.holder === `e:${e.id}`) natural.push(l.holder);
  }
  for (const v of der.vinculos) if (tablaDeVinculo(v)) natural.push(`v:${v.id}`);
  for (const h of natural) tabla(h);

  // A 1 a 1 still to decide: the tables of both sides wait for it.
  for (const p of pendientes.filter((x) => x.tipo === 'lado11')) {
    for (const o of p.opciones) {
      const l = lugar(o.id);
      if (!l.falta && base.has(l.holder) && !base.get(l.holder).espera.includes(p.clave)) base.get(l.holder).espera.push(p.clave);
    }
  }

  // Multivalued attributes: a table with the entity's key and the attribute, both its CP.
  const multivaluadas = new Map();
  for (const e of der.entidades) {
    for (const a of e.atributos.filter((x) => x.multivaluado && x.nombre)) {
      const l = lugar(e.id);
      if (l.falta) {
        avisar(`sin-tabla:${e.id}`, l.falta);
        continue;
      }
      const holder = `m:${e.id}:${a.id}`;
      const t = nuevaTabla(holder, `${e.nombre}_${a.nombre}`, { tipo: 'multivaluado', id: a.id });
      llenas.add(holder);
      const cols = referir(holder, t, e.id, { nn: true });
      const propias = a.partes.length ? columnasDe(t, a.partes.map((p) => ({ ...p, clave: true })), false) : [sumarColumna(t, a.nombre, false)];
      if (cols && !t.espera.length) t.cp = [...cols, ...propias];
      for (const c of t.columnas) c.nula = false;
      if (!multivaluadas.has(l.holder)) multivaluadas.set(l.holder, []);
      multivaluadas.get(l.holder).push(holder);
    }
  }
  const conMultivaluadas = natural.flatMap((h) => [h, ...(multivaluadas.get(h) ?? [])]);

  // Each table after the ones it references (its own CFs to itself aside); in a cycle, the first one left.
  const orden = [];
  const hechos = new Set();
  while (orden.length < conMultivaluadas.length) {
    const faltan = conMultivaluadas.filter((h) => !hechos.has(h));
    const sigue = faltan.find((h) => [...dependencias.get(h)].every((d) => hechos.has(d) || !conMultivaluadas.includes(d))) ?? faltan[0];
    hechos.add(sigue);
    orden.push(sigue);
  }
  const tablas = orden.map((h) => base.get(h));
  const nombres = new Set();
  for (const t of tablas) {
    if (nombres.has(t.nombre)) avisar(`tabla-repetida:${t.nombre}`, `Hay dos tablas «${t.nombre}». Cambiale el nombre a una.`);
    nombres.add(t.nombre);
  }
  return { tablas, pendientes, avisos: [...avisos.values()], faltan: incompletas };
}

/** The tables as the course writes them on the sheet: `tabla(a, b)`, `CP -> a`, `CF(b) -> otra(id) NN`. */
export function tablasEnTexto(resultado) {
  return `${(resultado?.tablas ?? [])
    .map((t) => {
      const lineas = [`${t.nombre}(${t.columnas.map((c) => c.nombre).join(', ')})`, `CP -> ${t.cp ? t.cp.join(', ') : '?'}`];
      for (const f of t.cfs) {
        lineas.push(f.columnas ? `CF(${f.columnas.join(', ')}) -> ${f.tabla}(${f.referidas.join(', ')}) ${f.nn ? 'NN' : 'NULL'}` : `CF(?) -> ${f.tabla}(?)`);
      }
      return lineas.join('\n');
    })
    .join('\n\n')}\n`;
}
