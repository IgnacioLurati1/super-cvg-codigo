import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Entrada3D, { puedeEntrada } from '../components/entrada3d/Entrada3D';
import { tituloDe, useSeo } from '../lib/seo';
import './Entrada.css';

// The faculty's entrance in 3D, alone: the same scene as behind the sign-in, to turn around. Open with or without a
// session (link in the footer, next to Opinar).
export default function Entrada() {
  useSeo({ titulo: tituloDe('La facu en 3D'), descripcion: 'La entrada de UTN FRRO en 3D, para mirarla desde donde quieras.' });
  const escena = useRef(null);
  const [puede, setPuede] = useState(puedeEntrada);

  return (
    <section className="facu3d" aria-labelledby="facu3d-titulo">
      {puede && <Entrada3D ref={escena} modo="sola" alFallar={() => setPuede(false)} />}
      <div className="facu3d__cartel">
        <h1 id="facu3d-titulo">La entrada de la facu</h1>
        {puede ? (
          <>
            <p>Arrastrá para mirarla desde otro lado. Con la rueda o dos dedos te acercás.</p>
            <div className="facu3d__botones">
              <button type="button" className="boton boton--secundario" onClick={() => escena.current?.foto()}>Verla de frente</button>
              <Link className="boton boton--secundario" to="/">Volver</Link>
            </div>
          </>
        ) : (
          <>
            <p>Tu navegador no la puede dibujar. Le falta la aceleración por hardware.</p>
            <p>En Chrome y Edge se prende en Configuración, Sistema, «Usar aceleración de gráficos cuando esté disponible». Después reiniciá el navegador.</p>
            <Link className="boton boton--secundario" to="/">Volver</Link>
          </>
        )}
      </div>
    </section>
  );
}
