import { esDemo } from './modoDemo';
import { tokenActual } from './sesion';

// The faculty's schedules come apart from the rest of the site: only the screens that show a week ask for them, once.
// In the sample mode (/?demo=1), a made-up commission with the sample courses, so the week can be seen.
let pedido = null;

export function cargarHorarios() {
  if (import.meta.env.DEV && esDemo(tokenActual())) return import('./demoHorario').then((m) => m.HORARIOS_DEMO);
  pedido ??= import('../data/facultad/horarios.json').then((m) => m.default).catch((error) => {
    pedido = null;
    throw error;
  });
  return pedido;
}
