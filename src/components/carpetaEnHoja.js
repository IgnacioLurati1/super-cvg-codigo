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
