// What supercvg-codigo answers in `npm run dev`, made up here so no pedido of a test reaches the real function
// (codigo.js). A fixed script: list the files, read the one that runs, propose a fix, run it and say what it did. It
// counts 10 pedidos per page load, to see the screen without uses too.

const ESPERA_MS = 500;
let quedan = 10;
const vistos = new Set();

const responder = (cuerpo, status = 200) => new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } });
const llamar = (vuelta, nombre, args = {}) => ({ id: `simulada_${vuelta}`, nombre, argumentos: JSON.stringify(args) });

// The fix: a statement without its «;» (C), or a loop that goes one past (`<=`). Else a comment, to see a change.
export function arreglo(codigo, nombre) {
  const lineas = codigo.split('\n');
  const sentencia = (l) => /^\s*(printf|scanf|puts|return)\b.*[^;{}\s,]\s*$/.test(l) || /^\s*[a-z_]\w*\s*(\+|-)?=[^=].*[^;{}\s,]\s*$/.test(l);
  const sinPuntoYComa = lineas.findIndex(sentencia);
  if (/\.(c|h)$/.test(nombre) && sinPuntoYComa >= 0) {
    const l = lineas[sinPuntoYComa];
    return { buscar: l, reemplazo: `${l.replace(/\s+$/, '')};`, explica: `A la línea ${sinPuntoYComa + 1} le faltaba el punto y coma del final.` };
  }
  const bucle = lineas.findIndex((l) => /\bfor\b.*<=/.test(l));
  if (bucle >= 0) {
    const l = lineas[bucle];
    return { buscar: l, reemplazo: l.replace('<=', '<'), explica: `El for de la línea ${bucle + 1} daba una vuelta de más. Lo dejé con «<».` };
  }
  const marca = /\.py$/.test(nombre) ? '#' : /\.sql$/.test(nombre) ? '--' : '//';
  return { buscar: '', reemplazo: `${marca} Revisado por Consultron (respuesta de prueba)\n${codigo}`, explica: 'No encontré nada para arreglar. Sumé un comentario arriba para que veas cómo queda un cambio.' };
}

/** The answer to `cuerpo` ({ pedido, mensajes }), as the function gives it. */
export async function respuestaSimulada(cuerpo, signal) {
  await new Promise((ok, mal) => {
    const t = setTimeout(ok, ESPERA_MS);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      mal(new DOMException('Frenado', 'AbortError'));
    });
  });
  if (!vistos.has(cuerpo.pedido)) {
    if (quedan <= 0) return responder({ ok: false, motivo: 'tope_alumno', quedan: 0 }, 429);
    quedan -= 1;
    vistos.add(cuerpo.pedido);
  }
  const { mensajes } = cuerpo;
  const vuelta = mensajes.filter((m) => m.rol === 'consultron').length;
  const ultimo = mensajes.at(-1).texto;
  const ok = (texto, llamadas = []) => responder({ ok: true, texto, llamadas, modelo: 'simulado', quedan });
  // What it read: the file that runs is the first of the list, or the one marked.
  const leido = mensajes.filter((m) => m.rol === 'herramienta')[1]?.texto ?? '';
  const lista = mensajes.filter((m) => m.rol === 'herramienta')[0]?.texto ?? '';
  const nombre = /- (\S+) \(\d+ líneas\), el que corre/.exec(lista)?.[1] ?? /- (\S+) \(/.exec(lista)?.[1] ?? 'main.c';
  if (vuelta === 0) return ok('', [llamar(0, 'listar_archivos')]);
  if (vuelta === 1) return ok('', [llamar(1, 'leer_archivo', { nombre })]);
  const fix = arreglo(leido, nombre);
  if (vuelta === 2) return ok('', [llamar(2, 'editar_archivo', { nombre, ...(fix.buscar ? { buscar: fix.buscar } : {}), reemplazo: fix.reemplazo })]);
  if (vuelta === 3) return ok('', [llamar(3, 'correr')]);
  const corrio = /^Terminó bien/.test(ultimo) ? 'Lo corrí y anda.' : 'Lo corrí y todavía falla.';
  return ok(`${fix.explica} ${corrio} Es una respuesta de prueba, sin IA.`);
}
