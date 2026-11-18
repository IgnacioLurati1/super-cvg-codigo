import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { armarChapin, chapinEnLista, MEDIDAS, pedirChapin, TOPE_SENTENCIAS } from '../../lib/laboratorio/chapin';
import './chapin.css';

// «Chapin», a tab of the lab's panel in Python (lib/laboratorio/chapin.js): the open program as the Chapin diagrams of
// AED, one per module, redrawn a while after each key while the tab is in sight. A syntax error keeps the last
// drawing and says the line. «Bajar como imagen» puts them all in one PNG, made here.

const ESPERA_MS = 500;
const SEPARACION = 24;
const MAX_LADO = 8000;

/** The width of a letter of the code at 13 px, in this browser's fixed-width font. */
function anchoDeLetra(el) {
  const letra = getComputedStyle(el).getPropertyValue('--codigo-letra').trim() || 'monospace';
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return 7.8;
  ctx.font = `${MEDIDAS.letra}px ${letra}`;
  const ancho = ctx.measureText('x'.repeat(100)).width / 100;
  return ancho > 3 && ancho < 20 ? ancho : 7.8;
}

const CLASES = { titulo: 'chapin__titulo', decl: 'chapin__decl', codigo: 'chapin__codigo', suelto: 'chapin__suelto', vf: 'chapin__vf' };

function Dibujo({ diagrama, ch }) {
  const id = useId();
  const d = armarChapin(diagrama, { ch });
  return (
    <figure className="chapin__figura">
      <svg className="chapin__svg" width={d.ancho} height={d.alto} viewBox={`0 0 ${d.ancho} ${d.alto}`} role="img" aria-labelledby={`${id}-t`} aria-describedby={`${id}-d`}>
        <title id={`${id}-t`}>{`Chapin de ${diagrama.titulo}`}</title>
        <g className="chapin__cajas">
          {d.cajas.map((c, i) => (
            <rect key={i} x={c.x} y={c.y} width={c.w} height={c.h} />
          ))}
        </g>
        {d.trazo && <path className="chapin__lineas" d={d.trazo} />}
        {d.textos.map((t, i) => (
          <text key={i} className={CLASES[t.tipo]} x={t.x} y={t.y} textAnchor={t.ancla}>
            {t.texto}
          </text>
        ))}
      </svg>
      <div id={`${id}-d`} className="solo-lectores">
        {diagrama.decl.length > 0 && <p>{diagrama.decl.join(' ')}</p>}
        <EnLista lista={chapinEnLista(diagrama)} />
      </div>
    </figure>
  );
}

function EnLista({ lista }) {
  return (
    <ul>
      {lista.map((p, i) => (
        <li key={i}>
          {p.texto}
          {p.codigo && <pre>{p.codigo}</pre>}
          {p.hijos && <EnLista lista={p.hijos} />}
        </li>
      ))}
    </ul>
  );
}

// The drawing with its colors and letters written in, as an image needs it: an SVG in an <img> sees no CSS of the page.
function copiaConColores(svg) {
  const copia = svg.cloneNode(true);
  copia.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const originales = svg.querySelectorAll('rect, path, text');
  copia.querySelectorAll('rect, path, text').forEach((el, i) => {
    const cs = getComputedStyle(originales[i]);
    const letra = el.tagName === 'text' ? `font-family:${cs.fontFamily};font-size:${cs.fontSize};font-weight:${cs.fontWeight};white-space:pre;` : '';
    el.setAttribute('style', `${letra}fill:${cs.fill};stroke:${cs.stroke};stroke-width:${cs.strokeWidth}`);
  });
  return new XMLSerializer().serializeToString(copia);
}

async function enImagen(svgs, fondo) {
  const medidas = svgs.map((s) => ({ s, w: Number(s.getAttribute('width')) || 0, h: Number(s.getAttribute('height')) || 0 }));
  const ancho = Math.max(...medidas.map((m) => m.w));
  const alto = medidas.reduce((t, m) => t + m.h, 0) + SEPARACION * (medidas.length - 1);
  const k = Math.min(2, MAX_LADO / Math.max(ancho, alto));
  const lienzo = document.createElement('canvas');
  lienzo.width = Math.max(1, Math.round(ancho * k));
  lienzo.height = Math.max(1, Math.round(alto * k));
  const ctx = lienzo.getContext('2d');
  ctx.fillStyle = fondo;
  ctx.fillRect(0, 0, lienzo.width, lienzo.height);
  let y = 0;
  for (const m of medidas) {
    const url = URL.createObjectURL(new Blob([copiaConColores(m.s)], { type: 'image/svg+xml' }));
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      ctx.drawImage(img, 0, y * k, m.w * k, m.h * k);
    } finally {
      URL.revokeObjectURL(url);
    }
    y += m.h + SEPARACION;
  }
  return new Promise((resolver, rechazar) => lienzo.toBlob((b) => (b ? resolver(b) : rechazar(new Error('sin imagen'))), 'image/png'));
}

function bajar(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function aviso(r, hayDibujo) {
  if (r.fase === 'cargando') return 'Preparando Python para leer tu código.';
  if (r.fase === 'esperando') return 'Se dibuja cuando termine lo que está corriendo.';
  if (r.falla) return 'No se pudo cargar Python para dibujarlo.';
  if (r.largo) return 'Tu código es muy largo para dibujarlo.';
  if (r.ok === false) {
    if (!r.linea) return 'Python no pudo leer tu código.';
    return `Hay un error en la línea ${r.linea}. ${hayDibujo ? 'Queda el Chapin de antes.' : 'Arreglalo y se dibuja.'}`;
  }
  if (r.ok && !r.diagramas.length) return 'Escribí código y acá aparece su Chapin.';
  if (r.cortado) return `Es muy largo. Se dibujan las primeras ${TOPE_SENTENCIAS} sentencias.`;
  return '';
}

/** `codigo`: the Python to draw; `nombre`: of its file, for the image; `activo`: whether the tab is in sight. */
export default function Chapin({ codigo, nombre, activo }) {
  const raiz = useRef(null);
  const [r, setR] = useState({ fase: 'nada' });
  const [dibujo, setDibujo] = useState(null);
  const [ch, setCh] = useState(7.8);
  const [bajando, setBajando] = useState(false);
  const primera = useRef(true);

  useLayoutEffect(() => {
    if (activo && raiz.current) setCh(anchoDeLetra(raiz.current));
  }, [activo]);

  useEffect(() => {
    if (!activo) return undefined;
    const corte = new AbortController();
    const reloj = setTimeout(async () => {
      const x = await pedirChapin(codigo, corte.signal, {
        alCargar: () => setR({ fase: 'cargando' }),
        alEsperar: () => setR({ fase: 'esperando' }),
      });
      if (!x || corte.signal.aborted) return;
      primera.current = false;
      setR(x);
      if (x.ok) setDibujo(x);
    }, primera.current ? 0 : ESPERA_MS);
    return () => {
      clearTimeout(reloj);
      corte.abort();
    };
  }, [codigo, activo]);

  const diagramas = dibujo?.diagramas ?? [];
  const texto = aviso(r, diagramas.length > 0);

  const alBajar = async () => {
    if (bajando || !raiz.current) return;
    const svgs = [...raiz.current.querySelectorAll('svg.chapin__svg')];
    if (!svgs.length) return;
    setBajando(true);
    try {
      const fondo = getComputedStyle(raiz.current).backgroundColor;
      const blob = await enImagen(svgs, fondo && fondo !== 'rgba(0, 0, 0, 0)' ? fondo : '#ffffff');
      bajar(blob, `chapin-${String(nombre || 'codigo').replace(/\.py$/i, '').replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'codigo'}.png`);
    } catch {
      setR((a) => ({ ...a, imagen: true }));
    } finally {
      setBajando(false);
    }
  };

  return (
    <div ref={raiz} className="chapin">
      <div className="chapin__barra">
        <p className="chapin__aviso" role="status">
          {r.imagen ? 'No se pudo armar la imagen.' : texto}
        </p>
        {diagramas.length > 0 && (
          <button type="button" className="boton boton--chico boton--secundario" onClick={alBajar} aria-disabled={bajando ? 'true' : undefined}>
            Bajar como imagen
          </button>
        )}
      </div>
      {diagramas.map((d, i) => (
        <Dibujo key={`${i}-${d.titulo}`} diagrama={d} ch={ch} />
      ))}
    </div>
  );
}
