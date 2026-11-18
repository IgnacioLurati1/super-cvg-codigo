// The order of the sections of a course, as the student left it (`ordenSecciones` in mio.js): the campus' numbers (or
// the «c» topics of Classroom, in a course of one's own) and the «p» ids of their own. Pure, so it can be tested alone.

const esPropia = (id) => typeof id === 'string' && id.startsWith('p');

/** `ids`: the sections in the order the page gives them (the campus' first, then the student's own). `guardado`: the
 * order the student left. The known ones go in that order; a section of the campus (or a topic) the order doesn't know
 * goes where the campus puts it among the others of the campus; one of the student's own, at the end. One that is gone
 * is left out. */
export function enOrdenGuardado(ids, guardado = []) {
  if (!guardado.length) return [...ids];
  const lugar = new Map(guardado.map((id, i) => [id, i]));
  const salida = ids.filter((id) => lugar.has(id)).sort((a, b) => lugar.get(a) - lugar.get(b));
  ids.forEach((id, i) => {
    if (lugar.has(id)) return;
    if (esPropia(id)) {
      salida.push(id);
      return;
    }
    // Right after the one of the campus that comes before it, or right before the one that comes after it.
    const antes = ids.slice(0, i).reverse().find((x) => !esPropia(x) && salida.includes(x));
    if (antes !== undefined) {
      salida.splice(salida.indexOf(antes) + 1, 0, id);
      return;
    }
    const despues = ids.slice(i + 1).find((x) => !esPropia(x) && salida.includes(x));
    salida.splice(despues === undefined ? salida.length : salida.indexOf(despues), 0, id);
  });
  return salida;
}

/** `lista` sorted like `orden` (what it doesn't know, at the end, as it came). `id` says the id of each one. */
export function segun(lista, orden, id = (x) => x.id) {
  const lugar = new Map(orden.map((v, i) => [v, i]));
  const de = (x) => lugar.get(id(x)) ?? orden.length;
  return lista.map((x, i) => ({ x, i })).sort((a, b) => de(a.x) - de(b.x) || a.i - b.i).map(({ x }) => x);
}

/** The whole order (`orden`, also the hidden sections) with `id` in place `lugar` among the ones on screen (`visibles`,
 * in that order). The rest stay where they were: going up it lands right above the one it passes, going down right
 * under it. */
export function moverA(orden, visibles, id, lugar) {
  const base = [...orden, ...visibles.filter((v) => !orden.includes(v))];
  const actual = visibles.indexOf(id);
  if (lugar === actual) return base;
  const otras = visibles.filter((v) => v !== id);
  const salida = base.filter((v) => v !== id);
  const sube = actual === -1 || lugar < actual;
  const ancla = sube ? otras[Math.max(0, lugar)] : otras[Math.min(lugar, otras.length) - 1];
  if (ancla === undefined) salida.push(id);
  else salida.splice(salida.indexOf(ancla) + (sube ? 0 : 1), 0, id);
  return salida;
}

/** `ids` with the student's own sections («p») in the order of `tuyas` (the order of the categories of a course of one's
 * own): the others keep their place, and those of the student's own fill theirs in that order. */
export function conTuyasEnOrden(ids, tuyas) {
  let k = 0;
  return ids.map((id) => (esPropia(id) && k < tuyas.length ? tuyas[k++] : id));
}
