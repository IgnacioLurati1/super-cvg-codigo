import { useState } from 'react';
import Campo from './Campo';

/** Passing an item to another section of its course without dragging: on the phone and with the keyboard. A Classroom
 * item already on the left can also go back to the card on the right. `onPasar(item, seccion)`, null to go back. */
export default function PasarA({ item, secciones = [], onPasar }) {
  const [destino, setDestino] = useState('');
  const opciones = secciones.filter((s) => s.id !== item.seccionId);
  const volver = item.origen === 'classroom' && item.seccionOriginal !== undefined;
  if (!opciones.length && !volver) return null;
  return (
    <form
      className="fila__pasar"
      onSubmit={(e) => {
        e.preventDefault();
        if (!destino) return;
        // The campus' sections are numbers; the student's own, «p» and a number.
        onPasar(item, destino === 'classroom' ? null : /^\d+$/.test(destino) ? Number(destino) : destino);
        setDestino('');
      }}
    >
      <Campo etiqueta={<>Pasar a otra sección<span className="solo-lectores">, {item.nombre}</span></>}>
        <select className="campo__control" value={destino} onChange={(e) => setDestino(e.target.value)}>
          <option value="">Elegí una sección</option>
          {opciones.map((s) => <option key={s.id} value={String(s.id)}>{s.nombre}</option>)}
          {volver && <option value="classroom">Volver a Classroom</option>}
        </select>
      </Campo>
      <button type="submit" className="boton boton--secundario boton--chico" disabled={!destino}>Pasar</button>
    </form>
  );
}
