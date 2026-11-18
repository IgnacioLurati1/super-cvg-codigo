// «Instalar Super CVG» (Configuración). Chrome, Edge and Android offer it once, early, in `beforeinstallprompt`: before
// anyone opens Configuración, so it's kept from the start (main.jsx). Safari on iPhone and iPad has no such event, it's
// done by hand from Compartir. Installed, or where the browser can't, there's nothing to offer. No service worker:
// nothing of the campus is kept for offline, the app is this same page in its own window.
import { useSyncExternalStore } from 'react';

const VENTANA_PROPIA = '(display-mode: standalone)';

let ofrecida = null;
let instalada = false;
const oyentes = new Set();
const avisar = () => oyentes.forEach((f) => f());

const enVentanaPropia = () => Boolean(window.matchMedia?.(VENTANA_PROPIA).matches) || window.navigator.standalone === true;

/** iPhone or iPad with Safari, where «Agregar a inicio» is. iPadOS says it's a Mac: the touch screen gives it away. Other
 * browsers and the ones inside an app (no «Safari/» or their own mark) are left out. */
export function esSafariDeIos(nav = window.navigator) {
  const ua = nav.userAgent ?? '';
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && nav.maxTouchPoints > 1);
  return ios && /Version\/[\d.]+.*Safari\//.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA\/|YaBrowser|DuckDuckGo/.test(ua);
}

/** 'boton' (the browser installs it from here), 'ios' (by hand, from Compartir) or null (installed, or it can't). */
export function comoInstalar() {
  if (instalada || enVentanaPropia()) return null;
  if (ofrecida) return 'boton';
  return esSafariDeIos() ? 'ios' : null;
}

/** Listens from the start. The browser's own banner doesn't show: the offer waits in Configuración. Returns how to stop. */
export function escucharInstalacion() {
  const alOfrecer = (e) => {
    e.preventDefault();
    ofrecida = e;
    avisar();
  };
  const alInstalar = () => {
    ofrecida = null;
    instalada = true;
    avisar();
  };
  const modo = window.matchMedia?.(VENTANA_PROPIA);
  window.addEventListener('beforeinstallprompt', alOfrecer);
  window.addEventListener('appinstalled', alInstalar);
  modo?.addEventListener?.('change', avisar);
  return () => {
    window.removeEventListener('beforeinstallprompt', alOfrecer);
    window.removeEventListener('appinstalled', alInstalar);
    modo?.removeEventListener?.('change', avisar);
  };
}

/** Opens the browser's installation. True if the student accepted. An offer works once: after it, the button goes until
 * the browser offers again. */
export async function instalar() {
  const e = ofrecida;
  if (!e) return false;
  ofrecida = null;
  try {
    await e.prompt();
    const { outcome } = await e.userChoice;
    if (outcome === 'accepted') instalada = true;
    return outcome === 'accepted';
  } catch {
    return false;
  } finally {
    avisar();
  }
}

export function suscribirInstalacion(f) {
  oyentes.add(f);
  return () => oyentes.delete(f);
}

export const useInstalar = () => useSyncExternalStore(suscribirInstalacion, comoInstalar, () => null);
