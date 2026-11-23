import { forwardRef, useEffect, useImperativeHandle, useRef, useState, useSyncExternalStore } from 'react';
import { useAhorro } from '../../lib/ahorro';
import { movimientoDe, useAjustes } from '../../lib/ajustes';
import { puede3D } from '../cuaderno3d/soporte';
import './Entrada3D.css';

// The faculty's entrance in 3D (escena.js). «fondo»: behind the sign-in, only with hardware acceleration (puede3D)
// and never with «Sin animaciones» nor saving data (ahorro.js); decorative, hidden from screen readers. «sola»: the screen of its own (/entrada),
// turned with mouse, finger or keyboard. three.js arrives with import() when the browser is idle. Light theme: day;
// dark theme: night.

const CONSULTA = '(prefers-reduced-motion: reduce)';
const seguirSistema = (avisar) => {
  const mq = window.matchMedia?.(CONSULTA);
  mq?.addEventListener('change', avisar);
  return () => mq?.removeEventListener('change', avisar);
};
const sistemaQuieto = () => Boolean(window.matchMedia?.(CONSULTA).matches);
const esNoche = () => document.documentElement.dataset.tema === 'oscuro';

export const DESCRIPCION =
  'La entrada de la Facultad Regional Rosario, con la fachada celeste, las puertas de vidrio bajo el cartel, un árbol, dos barandas amarillas y la calle de adoquines.';

/** Whether this device draws the entrance: WebGL 2 on a real graphics card. */
export const puedeEntrada = () => puede3D();

const Entrada3D = forwardRef(function Entrada3D({ modo = 'fondo', alFallar, alEstarLista }, ref) {
  const movimiento = movimientoDe(useAjustes());
  const reducido = useSyncExternalStore(seguirSistema, sistemaQuieto, () => false);
  const ahorro = useAhorro();
  if (modo === 'fondo' && (movimiento === 'ninguno' || ahorro)) return null;
  return <Escena ref={ref} modo={modo} quieto={movimiento !== 'sistema' || reducido} alFallar={alFallar} alEstarLista={alEstarLista} />;
});
export default Entrada3D;

const Escena = forwardRef(function Escena({ modo, quieto, alFallar, alEstarLista }, ref) {
  const nodo = useRef(null);
  const api = useRef(null);
  const quietoAhora = useRef(quieto);
  const fallar = useRef(alFallar);
  const lista = useRef(alEstarLista);
  const [estado, setEstado] = useState(() => (puede3D() ? 'espera' : 'sin3d'));
  const sola = modo === 'sola';

  useImperativeHandle(ref, () => ({ foto: () => api.current?.foto(), enfocar: () => api.current?.lienzo.focus() }), []);

  useEffect(() => {
    fallar.current = alFallar;
    lista.current = alEstarLista;
  }, [alFallar, alEstarLista]);

  useEffect(() => {
    if (estado === 'sin3d') fallar.current?.();
    if (estado === 'lista') lista.current?.();
  }, [estado]);

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
    let tema = null;
    const avisar = () => api.current?.visible(visible && !document.hidden);
    const cargar = async () => {
      try {
        const { crearEscena, describirEscena } = await import('./escena.js');
        if (!vivo) return;
        api.current = crearEscena(el, {
          escena: describirEscena(),
          modo,
          noche: esNoche(),
          quieto: quietoAhora.current,
          alPerder: () => {
            api.current?.destruir();
            api.current = null;
            if (vivo) setEstado('sin3d');
          },
        });
        if (sola) {
          const lienzo = api.current.lienzo;
          lienzo.tabIndex = 0;
          // It takes the arrows and plus and minus: a screen reader lets them through to it.
          lienzo.setAttribute('role', 'application');
          lienzo.setAttribute('aria-label', `${DESCRIPCION} Flechas para girar, más y menos para acercarte.`);
        }
        await api.current.preparar();
        if (!vivo || !api.current) return;
        tema = new MutationObserver(() => api.current?.noche(esNoche()));
        tema.observe(document.documentElement, { attributes: true, attributeFilter: ['data-tema'] });
        api.current.dibujar();
        avisar();
        // One frame later, so the canvas starts transparent and the fade in runs.
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
          // Building the scene keeps the main thread busy for a moment: on the sign-in, not while the page settles.
          if (sola) cargar();
          else if ('requestIdleCallback' in window) espera = window.requestIdleCallback(cargar, { timeout: 1500 });
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
      tema?.disconnect();
      document.removeEventListener('visibilitychange', avisar);
      api.current?.destruir();
      api.current = null;
    };
  }, [modo, sola]);

  if (estado === 'sin3d') return null;
  return (
    <div className={`entrada3d entrada3d--${modo} entrada3d--${estado}`} aria-hidden={sola ? undefined : 'true'}>
      <div ref={nodo} className="entrada3d__escena" />
    </div>
  );
});
