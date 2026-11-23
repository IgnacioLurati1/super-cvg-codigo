import { createContext, useContext } from 'react';
import { leerEnlace } from '../lib/drivePublico';

// A link to a Drive folder inside a text (of the campus, a forum, a message) opens the folder here instead of in Drive:
// PreviaProvider opens it in the preview sheet, and inside the sheet it opens there, with the way back to the text.
// Apart from Previa.jsx so the texts can use it without importing the sheet.
export const CarpetaEnHoja = createContext(null);

/** What opens a folder link ({ destino, texto }), or null where there's no sheet. */
export const useAbrirCarpeta = () => useContext(CarpetaEnHoja);

/** Whether a link goes to a Drive folder. */
export const esCarpetaDeDrive = (url) => Boolean(leerEnlace(url)?.carpeta);

/** Whether a link goes to Drive: a folder or a file. */
export const esDeDrive = (url) => Boolean(leerEnlace(url));

/** Whether the link of a text opens here: a folder always; a file of Drive too, on a page (its sheet opens with the
 * viewer), not inside a sheet that is already showing something. */
export const seAbreAca = (abrir, url) => Boolean(abrir) && (esCarpetaDeDrive(url) || (abrir.archivos === true && esDeDrive(url)));

// The name a folder link of a text gives it: its text, unless that is only the address or its site («drive.google.com»).
// Without one, CarpetaDeDrive asks Drive for it.
export function nombreDeLink(texto, destino) {
  const t = String(texto ?? '').trim();
  return !t || t === destino || /^(https?:\/\/)?[\w.-]+\.[a-z]{2,}(\/\S*)?$/i.test(t) ? '' : t[0].toUpperCase() + t.slice(1);
}
