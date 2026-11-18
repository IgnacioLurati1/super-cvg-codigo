import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { movimientoDe, useAjustes } from '../../lib/ajustes';
import { diasDeNotas, leerColores, puede3D } from './soporte';
import './Cuaderno3D.css';

// The landing's 3D still life (escena.js). three.js arrives with import() only when the piece is about to show and
// the browser is idle. «Sin animaciones» renders nothing and loads nothing; «Reducir siempre» or the system's
// reduced motion leave it still (dragging still turns it). Without WebGL it renders nothing.

const CONSULTA = '(prefers-reduced-motion: reduce)';
const seguirSistema = (avisar) => {
  const mq = window.matchMedia?.(CONSULTA);
  mq?.addEventListener('change', avisar);
  return () => mq?.removeEventListener('change', avisar);
};
const sistemaQuieto = () => Boolean(window.matchMedia?.(CONSULTA).matches);

// What changes the colors the scene takes from CSS: theme, contrast, palette and the custom colors (inline style).
const ATRIBUTOS = ['data-tema', 'data-contraste', 'data-daltonismo', 'style'];

export default function Cuaderno3D() {
  const movimiento = movimientoDe(useAjustes());
  const reducido = useSyncExternalStore(seguirSistema, sistemaQuieto, () => false);
  if (movimiento === 'ninguno') return null;
  return <Escena quieto={movimiento === 'reducido' || reducido} />;
}

function Escena({ quieto }) {
  const nodo = useRef(null);
  const api = useRef(null);
  const quietoAhora = useRef(quieto);
  const [estado, setEstado] = useState(() => (puede3D() ? 'espera' : 'sin3d'));
  const [dias] = useState(() => diasDeNotas());

  useEffect(() => {
    quietoAhora.current = quieto;
    api.current?.quieto(quieto);
  }, [quieto]);

  useEffect(() => {
    const el = nodo.current;
    if (!el) return undefined;
    let vivo = true;
    let visible = false;
    let pedido = false;
    let espera = 0;
    let colores = null;
    const avisar = () => api.current?.visible(visible && !document.hidden);
    const cargar = async () => {
      try {
        const { crearEscena, describirEscena } = await import('./escena.js');
        if (!vivo) return;
        api.current = crearEscena(el, {
          escena: describirEscena({ dias }),
          colores: leerColores(),
          quieto: quietoAhora.current,
          alPerder: () => {
            api.current?.destruir();
            api.current = null;
            if (vivo) setEstado('sin3d');
          },
        });
        colores = new MutationObserver(() => api.current?.colores(leerColores()));
        colores.observe(document.documentElement, { attributes: true, attributeFilter: ATRIBUTOS });
        api.current.dibujar();
        avisar();
        // One frame later, so the canvas starts transparent and the fade in actually runs.
        requestAnimationFrame(() => vivo && setEstado('lista'));
      } catch {
        if (vivo) setEstado('sin3d');
      }
    };
    const io = new IntersectionObserver(
      ([e]) => {
        visible = e.isIntersecting;
        if (visible && !pedido) {
          pedido = true;
          // Building the scene keeps the main thread busy for a moment: not while the page is still settling.
          if ('requestIdleCallback' in window) espera = window.requestIdleCallback(cargar, { timeout: 1500 });
          else espera = setTimeout(cargar, 300);
        }
        avisar();
      },
      { rootMargin: '120px 0px' },
    );
    io.observe(el);
    document.addEventListener('visibilitychange', avisar);
    return () => {
      vivo = false;
      io.disconnect();
      if ('cancelIdleCallback' in window) window.cancelIdleCallback(espera);
      clearTimeout(espera);
      colores?.disconnect();
      document.removeEventListener('visibilitychange', avisar);
      api.current?.destruir();
      api.current = null;
    };
  }, [dias]);

  if (estado === 'sin3d') return null;
  const [a, b, c] = dias.map((d) => d.dia);
  return (
    <div
      className={`cuaderno3d cuaderno3d--${estado}`}
      role={estado === 'lista' ? 'img' : undefined}
      aria-label={estado === 'lista' ? `Un cuaderno A4 espiralado con un lápiz encima y tres notas adhesivas que marcan los días ${a}, ${b} y ${c}.` : undefined}
    >
      <div ref={nodo} className="cuaderno3d__escena" />
    </div>
  );
}
