// What holds back the most, counted once for Tu carrera (carrera.js) and the Sysacad screen (sysacadVistas.js).
//
// Sysacad lists only what is missing, so each requirement links two steps: having a subject to take others ('c':
// started or regular) and having it passed ('a'). «No regularizó X» to take M: c:X holds back c:M. «No aprobó X» to sit
// M's final: a:X holds back a:M. A subject that can't be started can't be passed either (c:M holds back a:M). Missing a
// subject holds back what asks for it and, down the chain, what asks for those, each subject counted once.

/** The requirements that ask for the subject passed. */
export const PIDE_APROBADA = new Set(['Aprobar', 'Aprobar o inscribirte a']);

const paso = (accion) => (PIDE_APROBADA.has(accion) ? 'a' : 'c');

/**
 * `lados`: what each subject lacks, one per side still waiting: [{ clave, electiva, para: 'cursar' | 'rendir', faltan:
 * [{ accion, clave }], abre }]. `abre`: the side opens once every one of `faltan` is there (nothing else is missing and,
 * for the final, the subject is regular).
 * `candidatos`: [{ clave, ... }], each comes back with `abre` (how many open right away with it) and `frena` (how many
 * it holds back down the whole chain), first by `abre`, then by that chain weighed by nearness, then by `frena`.
 * Electives are never counted.
 * `soloAprobada`: the candidates are regular already, so only what asks for them passed counts.
 */
export function ordenarFrenos(lados, candidatos, { soloAprobada = false, minimo = 0 } = {}) {
  const salen = new Map();
  const electiva = new Map();
  for (const l of lados) {
    electiva.set(l.clave, l.electiva);
    const a = `${l.para === 'rendir' ? 'a' : 'c'}:${l.clave}`;
    for (const r of l.faltan) {
      if (r.clave === l.clave) continue;
      const de = `${paso(r.accion)}:${r.clave}`;
      if (!salen.has(de)) salen.set(de, new Set());
      salen.get(de).add(a);
    }
  }

  // Each subject down the chain counts once (`frena`), and for the order it weighs by how near it is (`cerca`): 1 if
  // it asks for this one, ½ one step further, ¼ the next. Going from started to passed in the same subject is no step.
  const frena = (clave) => {
    const pasos = new Map();
    const cola = (soloAprobada ? [`a:${clave}`] : [`c:${clave}`, `a:${clave}`]).map((nodo) => [nodo, 0]);
    while (cola.length) {
      const [nodo, n] = cola.shift();
      if (pasos.has(nodo)) continue;
      pasos.set(nodo, n);
      if (nodo.startsWith('c:')) cola.unshift([`a:${nodo.slice(2)}`, n]);
      for (const s of salen.get(nodo) ?? []) cola.push([s, n + 1]);
    }
    const cuan = new Map();
    for (const [nodo, n] of pasos) {
      const k = nodo.slice(2);
      if (k !== clave && !electiva.get(k)) cuan.set(k, Math.min(cuan.get(k) ?? n, n));
    }
    let cerca = 0;
    for (const n of cuan.values()) cerca += 0.5 ** (n - 1);
    return { frena: cuan.size, cerca };
  };
  const abre = (clave) => new Set(lados
    .filter((l) => l.abre && !l.electiva && l.clave !== clave && l.faltan.length > 0 && l.faltan.every((r) => r.clave === clave))
    .map((l) => l.clave)).size;

  return candidatos
    .map((c) => ({ ...c, abre: abre(c.clave), ...frena(c.clave) }))
    .filter((f) => f.frena >= minimo)
    .sort((x, y) => y.abre - x.abre || y.cerca - x.cerca || y.frena - x.frena || x.nombre.localeCompare(y.nombre, 'es'))
    .map(({ cerca: _cerca, ...f }) => f);
}

/** What a card says of one: «abre 2 ya, frena 5», «frena 5» or «no frena ninguna». */
export function cuantoFrena({ abre, frena }) {
  if (!frena) return 'no frena ninguna';
  return abre ? `abre ${abre} ya, frena ${frena}` : `frena ${frena}`;
}
