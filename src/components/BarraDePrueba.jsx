import { useEffect, useRef } from 'react';
import { useAjustesGuardados } from '../lib/ajustes';
import { terminarPrueba, usarDiseno } from '../lib/disenos';
import { useMio } from '../lib/mio';
import { useUI } from './ui';
import './barraDePrueba.css';

/** While a design from Diseños is being tried, on every screen: it stays until the student uses it or goes back to
 * theirs. Layout loads it only then (enPrueba.js). `conHueco`: room at the end of the page; the screens the height of
 * the window (Laboratorio, Consultron) keep their height and leave --alto-barra-prueba inside, at the bottom. */
export default function BarraDePrueba({ diseno, conHueco = true }) {
  const ajustes = useAjustesGuardados();
  const mio = useMio();
  const { confirmar, avisar } = useUI();
  const barra = useRef(null);

  // It covers the bottom of the page: the page leaves that room, and scrolls the focused one above it (WCAG 2.4.11).
  useEffect(() => {
    const el = barra.current;
    if (!el) return undefined;
    const raiz = document.documentElement;
    const medir = () => {
      const alto = Math.ceil(el.getBoundingClientRect().height) + 24;
      raiz.style.scrollPaddingBottom = `${alto}px`;
      raiz.style.setProperty('--alto-barra-prueba', `${alto}px`);
    };
    medir();
    const observador = typeof ResizeObserver === 'function' ? new ResizeObserver(medir) : null;
    observador?.observe(el);
    return () => {
      observador?.disconnect();
      raiz.style.scrollPaddingBottom = '';
      raiz.style.removeProperty('--alto-barra-prueba');
    };
  }, []);

  const usar = async () => {
    const seguro = await confirmar({
      titulo: `¿Usar «${diseno.nombre}»?`,
      texto: 'Cambia toda tu configuración, menos daltonismo, movimiento y Sensible a la luz. Después podés volver a la tuya.',
      boton: 'Usar este diseño',
    });
    if (!seguro) return;
    if (!usarDiseno(diseno, { ajustes, mio })) avisar('No se pudo guardar. Vale hasta que cierres esta pestaña.', 'error');
  };

  return (
    <>
      {conHueco && <div className="prueba-hueco" aria-hidden="true" />}
      <div className="prueba-barra" ref={barra} role="region" aria-label="Vista previa de un diseño">
        <p>Probando <strong>{diseno.nombre}</strong>. Nada se guarda.</p>
        <div className="prueba-barra__acciones">
          <button type="button" className="boton boton--chico" onClick={usar}>Usar este</button>
          <button type="button" className="boton boton--secundario boton--chico" onClick={terminarPrueba}>Volver al tuyo</button>
        </div>
      </div>
    </>
  );
}
