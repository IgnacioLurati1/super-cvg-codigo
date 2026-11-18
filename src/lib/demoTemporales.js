// Files sent without Drive in the demo (/?demo=1, only in npm run dev): the same shape as the client of temporales.js,
// with a pretend upload that moves piece by piece and the locked bytes kept in this tab. Nothing goes to El Santo
// Resumen. `sessionStorage['cl.demo.temporal']` shows the other states: 'sin-red', 'muchos', 'lleno' or 'vencido'.
const falla = (codigo, texto) => Object.assign(new Error(texto), { conocido: true, codigo });
const FALLAS = {
  'sin-red': () => falla('sin-red', 'Sin conexión. Probá de nuevo cuando vuelva.'),
  muchos: () => falla('muchos', 'Mandaste muchos archivos sin Drive por hoy. Probá mañana o conectá tu Google Drive.'),
  lleno: () => falla('lleno', 'Ahora no hay lugar para archivos sin Drive. Conectá tu Google Drive para mandarlo.'),
  vencido: () => falla('vencido', 'Este archivo ya no está. Los que se mandan sin Drive duran 45 días.'),
};
const DEMO = 'https://lomhlulbgfovtnljbqzp.supabase.co/demo/';
const guardados = new Map();

const estado = () => {
  try {
    return sessionStorage.getItem('cl.demo.temporal') ?? '';
  } catch {
    return '';
  }
};

const pausa = (ms, senal) => new Promise((ok, mal) => {
  const cancelada = () => falla('cancelada', 'Cancelaste el envío.');
  if (senal?.aborted) {
    mal(cancelada());
    return;
  }
  const reloj = setTimeout(ok, ms);
  senal?.addEventListener('abort', () => {
    clearTimeout(reloj);
    mal(cancelada());
  }, { once: true });
});

export function clienteDemoTemporal() {
  return {
    async reservar(bytes, senal) {
      await pausa(150, senal);
      const fallo = FALLAS[estado()];
      if (fallo && estado() !== 'vencido') throw fallo();
      const id = crypto.randomUUID();
      return { id, subida: `${DEMO}${id}` };
    },
    async subir(url, bytes, { senal, alAvanzar }) {
      const pasos = 8;
      for (let i = 1; i <= pasos; i += 1) {
        await pausa(120, senal);
        alAvanzar(Math.round((bytes.length * i) / pasos));
      }
      guardados.set(url.slice(DEMO.length), bytes);
    },
    async bajar(id, senal) {
      await pausa(200, senal);
      if (estado() === 'sin-red') throw FALLAS['sin-red']();
      if (estado() === 'vencido' || !guardados.has(id)) throw FALLAS.vencido();
      return guardados.get(id).buffer;
    },
  };
}
