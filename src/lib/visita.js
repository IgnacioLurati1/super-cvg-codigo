// The visit counter in Luta Studios's panel. Once per tab, and only from the published site, so neither
// `npm run dev`, the tests nor the prerender count. It sends only {"tipo":"visita"}: no account, nothing of the
// campus, no cookies and no id. The panel keeps just a number per day.
import { SITIO } from '../../sitio.config.js';

export const CONTADOR = 'https://spltnoksgdkbaamskuau.supabase.co/functions/v1/supercvg';
const YA = 'cl.visita';

export function contarVisita({ origen = window.location.origin, almacen = window.sessionStorage, pedir = window.fetch.bind(window) } = {}) {
  if (origen !== SITIO.url) return false;
  try {
    if (almacen.getItem(YA)) return false;
    almacen.setItem(YA, '1');
  } catch {
    // Without storage it still counts, once per load.
  }
  // A text body keeps it a simple request: no preflight. Nothing waits for the answer.
  pedir(CONTADOR, { method: 'POST', body: '{"tipo":"visita"}', credentials: 'omit', keepalive: true, referrerPolicy: 'no-referrer' }).catch(() => {});
  return true;
}
