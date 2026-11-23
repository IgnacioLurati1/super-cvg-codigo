import { createContext, lazy, Suspense, useCallback, useContext, useMemo, useState } from 'react';
import { useAdelantar } from '../lib/ahorro';
import { dominioDe } from '../lib/datos';
import { leerEnlace } from '../lib/drivePublico';
import { CarpetaEnHoja, nombreDeLink } from './carpetaEnHoja';
// Up front as before the sheet came apart: espera.css has rules of the reader (lector.css) and previaPdf.css has rules
// that luz.css overrides, so their place in the cascade must not depend on which screen loaded first.
import './lector/espera.css';
import './previaPdf.css';

// The preview sheet of a file, link or activity, for every screen. Only the way to open it lives here, so the first
// page stays light: the sheet (PreviaHoja.jsx, with its viewers) loads apart, ahead of time when the page is idle.
const cargarHoja = () => import('./PreviaHoja');
const Hoja = lazy(cargarHoja);

const Contexto = createContext(() => {});

export const useAbrirPrevia = () => useContext(Contexto);

export function PreviaProvider({ children }) {
  const [item, setItem] = useState(null);
  const abrir = useCallback((nuevo) => setItem(nuevo), []);
  const cerrar = useCallback(() => setItem(null), []);
  // A Drive link in a text of a page opens in the sheet, as a link of a course does: a folder to look through, a file
  // in the viewer (`archivos`, seAbreAca in carpetaEnHoja.js).
  const abrirCarpeta = useMemo(() => Object.assign(({ destino, texto }) => {
    const enlace = leerEnlace(destino);
    if (!enlace) return;
    const nombre = nombreDeLink(texto, destino);
    if (enlace.carpeta) setItem({ id: `carpeta:${enlace.id}`, tipo: 'enlace', destino, nombre: nombre || 'Carpeta de Drive' });
    else setItem({ id: `drive:${enlace.id}`, tipo: 'enlace', destino, dominio: dominioDe(destino), nombre: nombre || 'Archivo de Drive' });
  }, { archivos: true }), []);
  // Downloaded while nothing else happens, so the first file opens at once. Saving data, only when something opens.
  useAdelantar(() => {
    const pedir = () => cargarHoja().catch(() => {});
    if (typeof requestIdleCallback === 'function') {
      const id = requestIdleCallback(pedir, { timeout: 4000 });
      return () => cancelIdleCallback(id);
    }
    const t = setTimeout(pedir, 2000);
    return () => clearTimeout(t);
  });
  return (
    <Contexto.Provider value={abrir}>
      <CarpetaEnHoja.Provider value={abrirCarpeta}>
        {children}
        {item && (
          <Suspense fallback={null}>
            <Hoja key={item.id} item={item} onCerrar={cerrar} />
          </Suspense>
        )}
      </CarpetaEnHoja.Provider>
    </Contexto.Provider>
  );
}
