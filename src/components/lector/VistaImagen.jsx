import { useRef } from 'react';
import { useAjustes } from '../../lib/ajustes';
import { useImagenQuieta } from '../../lib/imagenQuieta';
import { BotonPantalla, usePantallaCompleta } from './PantallaCompleta';
import '../previaPdf.css';

/** An image, with its button to see it on the whole screen (F too, if the one-key shortcuts are on): the site's, for a
 * file of a course (Previa.jsx) and on a live session's table. `children(img)`: what wraps the image there, to draw
 * over it; in full screen the image goes alone. `blob`, its bytes: with «Sensible a la luz» an animated one shows still
 * and moves only with its button (imagenQuieta.js). */
export default function VistaImagen({ direccion, nombre, blob = null, children = null }) {
  const caja = useRef(null);
  const { atajos } = useAjustes();
  const pantalla = usePantallaCompleta(caja, { conTecla: atajos });
  const quieta = useImagenQuieta(direccion, blob);
  const img = quieta.src ? <img className="previa__imagen" src={quieta.src} alt={`Vista previa de ${nombre}`} /> : null;
  return (
    <div ref={caja} className="previa__imagen-caja" data-pantalla={pantalla.modo ?? undefined}>
      {children && !pantalla.modo ? children(img) : img}
      {quieta.animada && (
        <button type="button" className="previa__mover" onClick={quieta.alternar}>
          {quieta.mover ? 'Frenar' : 'Animar'}
        </button>
      )}
      <BotonPantalla modo={pantalla.modo} onClick={pantalla.alternar} className="previa__pantalla" atajo={atajos ? 'F' : undefined} />
    </div>
  );
}
