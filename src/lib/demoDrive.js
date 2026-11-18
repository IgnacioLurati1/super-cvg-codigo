// The Drive of the demo (/?demo=1, only in npm run dev): in this tab, with the same shape as drive.js. Nothing goes to
// Google. `sessionStorage['cl.demo.drive']` shows the other states: 'sin-red' (Drive not answering), 'vencido', 'lleno' or
// 'otra-cuenta'. Without internet, the browser's offline mode.
const CLAVE = 'cl.demo.drive.archivos';
const falla = (texto, codigo) => Object.assign(new Error(texto), { conocido: true, codigo });
const FALLAS = {
  'sin-red': () => falla('Sin conexión, se guarda cuando vuelva.', 'sin-red'),
  vencido: () => falla('Se cortó la conexión con Google.', 'vencida'),
  lleno: () => falla('Tu Google Drive está lleno. Hacé lugar y probá de nuevo.', 'lleno'),
  'otra-cuenta': () => falla('Esta es otra cuenta de Google que la que usabas.', 'otra-cuenta'),
};
const demora = () => new Promise((ok) => setTimeout(ok, 600));
// Kept as text, so a reload of the demo still finds its copy.
const leer = () => JSON.parse(sessionStorage.getItem(CLAVE) ?? '{}');
const escribir = (todo) => sessionStorage.setItem(CLAVE, JSON.stringify(todo));

async function antes() {
  await demora();
  const cual = sessionStorage.getItem('cl.demo.drive');
  if (FALLAS[cual]) throw FALLAS[cual]();
}

export function clienteDemo() {
  return {
    async listar({ nombre = null } = {}) {
      await antes();
      return Object.entries(leer()).filter(([, f]) => nombre === null || f.name === nombre).map(([id, f]) => ({ id, name: f.name, createdTime: f.createdTime, version: f.version }));
    },
    async mirar(id) {
      await antes();
      const f = leer()[id];
      if (!f) throw falla('Eso ya no está en tu Drive.', 'no-existe');
      return { id, name: f.name, createdTime: f.createdTime, version: f.version };
    },
    async bajar(id) {
      await antes();
      const f = leer()[id];
      if (!f) throw falla('Eso ya no está en tu Drive.', 'no-existe');
      return new Response(f.texto);
    },
    async subir({ id = null, nombre, blob }) {
      await antes();
      const todo = leer();
      const propio = id ?? `demo${Object.keys(todo).length + 1}${Date.now()}`;
      const viejo = todo[propio];
      todo[propio] = { name: viejo?.name ?? nombre, texto: await blob.text(), createdTime: viejo?.createdTime ?? new Date().toISOString(), version: String(Number(viejo?.version ?? 0) + 1) };
      escribir(todo);
      return propio;
    },
    async borrar(id) {
      await antes();
      const todo = leer();
      delete todo[id];
      escribir(todo);
    },
  };
}
