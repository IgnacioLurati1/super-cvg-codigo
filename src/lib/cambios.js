// What changed in a course since the student last checked. The stored picture is only numbers
// (item key and its modified time), which is why a removed file can be counted but not named.

export function fotoDe(items) {
  const foto = {};
  for (const i of items) foto[i.clave] = i.modificado || 0;
  return foto;
}

export function compararFoto(foto, items) {
  if (!foto) return { nuevos: [], cambiados: [], borrados: 0, total: 0 };
  const actuales = new Set();
  const nuevos = [];
  const cambiados = [];
  for (const i of items) {
    actuales.add(i.clave);
    if (!(i.clave in foto)) nuevos.push(i);
    else if ((i.modificado || 0) !== foto[i.clave]) cambiados.push(i);
  }
  const borrados = Object.keys(foto).filter((c) => !actuales.has(c)).length;
  return { nuevos, cambiados, borrados, total: nuevos.length + cambiados.length + borrados };
}
