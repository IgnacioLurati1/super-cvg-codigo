// The Google Calendar of the demo (/?demo=1, only in npm run dev): in this tab, with the same shape as gcal.js. Nothing
// goes to Google. `sessionStorage['cl.demo.gcal']` shows the other states: 'sin-red' (Google not answering), 'vencido'
// or 'borrado' (the student deleted the calendar in Google).
const CLAVE = 'cl.demo.gcal.calendarios';
const falla = (texto, codigo) => Object.assign(new Error(texto), { conocido: true, codigo });
const FALLAS = {
  'sin-red': () => falla('Sin conexión, se pasan cuando vuelva.', 'sin-red'),
  vencido: () => falla('Se cortó la conexión con Google.', 'vencida'),
};
const demora = () => new Promise((ok) => setTimeout(ok, 300));
const leer = () => JSON.parse(sessionStorage.getItem(CLAVE) ?? '{}');
const escribir = (todo) => sessionStorage.setItem(CLAVE, JSON.stringify(todo));
const noEsta = () => falla('Eso ya no está en tu Google Calendar.', 'no-existe');

async function antes() {
  await demora();
  const cual = sessionStorage.getItem('cl.demo.gcal');
  if (cual === 'borrado') {
    escribir({});
    sessionStorage.removeItem('cl.demo.gcal');
  }
  if (FALLAS[cual]) throw FALLAS[cual]();
}

/** What the demo calendar has, to look at it in the console: { id: { summary, eventos } }. */
export const calendariosDemo = leer;

export function clienteDemoCalendario() {
  const calendario = (id) => {
    const c = leer()[id];
    if (!c) throw noEsta();
    return c;
  };
  return {
    async crear({ nombre }) {
      await antes();
      const todo = leer();
      const id = `demo${Date.now()}@group.calendar.google.com`;
      todo[id] = { summary: nombre, eventos: {} };
      escribir(todo);
      return id;
    },
    async mirar(id) {
      await antes();
      return { id, summary: calendario(id).summary };
    },
    async borrarCalendario(id) {
      await antes();
      const todo = leer();
      delete todo[id];
      escribir(todo);
    },
    async eventos(id) {
      await antes();
      return Object.values(calendario(id).eventos);
    },
    async poner(id, evento) {
      await antes();
      const todo = leer();
      if (!todo[id]) throw noEsta();
      todo[id].eventos[evento.id] = { ...evento, updated: new Date().toISOString() };
      escribir(todo);
    },
    async cambiar(id, evento) {
      await antes();
      const todo = leer();
      const ya = todo[id]?.eventos[evento.id];
      if (!ya) throw noEsta();
      todo[id].eventos[evento.id] = { ...ya, ...evento, updated: new Date().toISOString() };
      escribir(todo);
    },
    async quitar(id, eventoId) {
      await antes();
      const todo = leer();
      if (todo[id]) delete todo[id].eventos[eventoId];
      escribir(todo);
    },
  };
}
