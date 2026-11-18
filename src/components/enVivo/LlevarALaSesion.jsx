import { useState } from 'react';

// Beside something open (a PDF or a picture, a summary, a course), while this tab is in a live session: puts it on the
// table for everyone. The session's code loads only on click; without a session nothing shows. With `blob` it goes as
// an Apunte (`tipo`: its MIME, for a file that came without one; `item`: where it came from, to bring it again after a
// reload); with `llevar(sesion)`, as that function says.
export default function LlevarALaSesion({ sesion, blob, nombre, tipo = '', item = null, llevar: propio, className = 'boton boton--secundario' }) {
  const [estado, setEstado] = useState({ hecho: false, error: '' });
  const llevar = async () => {
    if (estado.hecho) return;
    try {
      if (propio) await propio(sesion);
      else {
        const [{ llevarALaSesion }, { origenDe }] = await Promise.all([import('../../lib/enVivo/apunte'), import('../../lib/enVivo/origenes')]);
        llevarALaSesion(sesion, blob.type || !tipo ? blob : new Blob([blob], { type: tipo }), nombre, origenDe(item));
      }
      setEstado({ hecho: true, error: '' });
    } catch (e) {
      setEstado({ hecho: false, error: e?.conocido ? e.message : 'No se pudo llevar a la sesión.' });
    }
  };
  return (
    <>
      <button type="button" className={className} aria-disabled={estado.hecho ? 'true' : undefined} onClick={llevar}>
        {estado.hecho ? 'Ya está en la mesa' : 'Llevar a la sesión'}
      </button>
      <span className="solo-lectores" role="status">{estado.hecho ? 'Ya está en la mesa de la sesión.' : ''}</span>
      {estado.error && <span className="mensaje mensaje--error" role="alert">{estado.error}</span>}
    </>
  );
}
