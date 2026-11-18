// What the console of the lab shows, as text: for Consultron open over it (consultron/pantalla.js) and for the output
// shared in a live session.
export function consolaEnTexto(piezas) {
  return piezas
    .map((p) => {
      if (p.tipo === 'salida' || p.tipo === 'aviso') return String(p.texto ?? '');
      if (p.tipo === 'error') return `Error${p.linea > 0 ? ` en la línea ${p.linea}` : ''}: ${p.texto}`;
      if (p.tipo === 'tabla') return [p.columnas.join(' | '), ...(Array.isArray(p.filas) ? p.filas : []).slice(0, 30).map((f) => (Array.isArray(f) ? f : Object.values(f ?? {})).map((c) => (c === null ? 'NULL' : String(c))).join(' | '))].join('\n');
      if (p.tipo === 'cambios') return `Cambió ${p.cambios} filas.`;
      return '';
    })
    .filter((t) => t.trim())
    .join('\n');
}

/**
 * The console in blocks, for the output shared in a live session: the text together, and each result as a table (its
 * first `filas` rows), so the others see it as the one who ran it.
 */
export function consolaEnBloques(piezas, { filas: tope = 30 } = {}) {
  const bloques = [];
  for (const p of piezas) {
    if (p.tipo === 'tabla' && Array.isArray(p.columnas) && p.columnas.length) {
      const todas = (Array.isArray(p.filas) ? p.filas : []).map((f) => (Array.isArray(f) ? f : Object.values(f ?? {})));
      bloques.push({ tipo: 'tabla', linea: Number(p.linea) || 0, columnas: p.columnas.map(String), filas: todas.slice(0, tope), recortada: Boolean(p.recortada) || todas.length > tope });
      continue;
    }
    const t = consolaEnTexto([p]);
    if (!t.trim()) continue;
    const ultimo = bloques.at(-1);
    if (ultimo?.tipo === 'texto') ultimo.texto += `\n${t}`;
    else bloques.push({ tipo: 'texto', texto: t });
  }
  return bloques;
}
