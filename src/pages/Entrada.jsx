import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Entrada3D, { puedeEntrada } from '../components/entrada3d/Entrada3D';
import { useAhorro } from '../lib/ahorro';
import { tituloDe, useSeo } from '../lib/seo';
import './Entrada.css';

// The faculty's entrance in 3D, alone: the same scene as behind the sign-in, to turn around. Open with or without a
// session (link in the footer, next to Opinar). Saving data (ahorro.js), three.js waits for the button: about 170 KB
// with gzip (three.module and escena.js in the build). Until the scene is drawn the button says «Cargando…» and keeps
// the focus; then the focus goes to the first button of the scene.
export default function Entrada() {
  useSeo({ titulo: tituloDe('La facu en 3D'), descripcion: 'La entrada de UTN FRRO en 3D, para mirarla desde donde quieras.' });
  const escena = useRef(null);
  const [puede, setPuede] = useState(puedeEntrada);
  const ahorro = useAhorro();
  const [pedida, setPedida] = useState(false);
  const [lista, setLista] = useState(false);
  const espera = puede && ahorro && !pedida;
  const cargando = puede && ahorro && pedida && !lista;
  const frente = useRef(null);
  useEffect(() => {
    if (pedida && lista) frente.current?.focus();
  }, [pedida, lista]);

  return (
    <section className="facu3d" aria-labelledby="facu3d-titulo">
      {puede && !espera && <Entrada3D ref={escena} modo="sola" alFallar={() => setPuede(false)} alEstarLista={() => setLista(true)} />}
      <div className="facu3d__cartel" aria-busy={cargando || undefined}>
        <h1 id="facu3d-titulo">La entrada de la facu</h1>
        {espera || cargando ? (
          <>
            <p>Para ahorrar datos no se carga sola. Pesa unos 170&nbsp;KB.</p>
            <div className="facu3d__botones">
              <button type="button" className="boton" aria-disabled={cargando || undefined} onClick={() => !cargando && setPedida(true)}>
                {cargando ? 'Cargando…' : 'Cargarla'}
              </button>
              <Link className="boton boton--secundario" to="/">Volver</Link>
            </div>
          </>
        ) : puede ? (
          <>
            <p>Arrastrá para mirarla desde otro lado. Con la rueda o dos dedos te acercás.</p>
            <div className="facu3d__botones">
              <button ref={frente} type="button" className="boton boton--secundario" onClick={() => escena.current?.foto()}>Verla de frente</button>
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
