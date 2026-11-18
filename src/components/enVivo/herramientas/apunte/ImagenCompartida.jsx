import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { colorSeguro, leerMarca, leerVista, mismaVista } from '../../../../lib/enVivo/apunte';
import { marcasEnTexto } from '../../../../lib/enVivo/marcasApunte';
import VistaImagen from '../../../lector/VistaImagen';
import { BarraSeleccion, CapaMarcas, GloboMarca, ListaMarcas, lugarSobre, useMarcas } from './Marcas';

// A picture on the table, in the site's image viewer (lector/VistaImagen.jsx, as a file of a course opens), with the
// others' pointers and the table's marks on it (zones: a picture has no text to select). Its view is how far down it
// is. In full screen the picture goes alone, as on the site.

const CADA_MARCA = 80;

export default function ImagenCompartida({ blob, nombre, mesa }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let vivo = true;
    const lector = new FileReader();
    lector.onload = () => vivo && setUrl(lector.result);
    lector.readAsDataURL(blob);
    return () => {
      vivo = false;
      lector.abort();
    };
  }, [blob]);

  const marco = useRef(null);
  const hoja = useRef(null);
  // The box around the picture comes with it, and again after full screen.
  const [hojaEl, setHojaEl] = useState(null);
  const ponerHoja = useCallback((el) => {
    hoja.current = el;
    setHojaEl(el);
  }, []);
  const ultimo = useRef(mesa);
  useLayoutEffect(() => {
    ultimo.current = mesa;
  });
  // The size of the picture on screen, for the marks; 0 while the tab is hidden.
  const [tamano, setTamano] = useState({ ancho: 0, alto: 0 });
  useLayoutEffect(() => {
    const el = hojaEl;
    if (!el) return undefined;
    const medir = () => setTamano({ ancho: el.clientWidth, alto: el.clientHeight });
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, [hojaEl]);

  const enviada = useRef(null);
  const vistaActual = () => {
    const el = marco.current;
    const alto = el ? el.scrollHeight - el.clientHeight : 0;
    return { pagina: 1, y: alto > 0 ? Math.min(1, el.scrollTop / alto) : 0, zoom: 'ancho' };
  };
  const alDesplazar = () => {
    if (!marco.current?.clientHeight) return;
    const v = vistaActual();
    if (mismaVista(v, enviada.current)) return;
    enviada.current = v;
    ultimo.current.mover(v);
  };

  // Following someone, or back in view: where they are, or where this browser was.
  const guia = leerVista(mesa.vista);
  const y = guia?.y;
  useEffect(() => {
    const el = marco.current;
    const destino = y ?? enviada.current?.y;
    if (destino === undefined || !el || !tamano.alto || mismaVista({ pagina: 1, y: destino, zoom: 'ancho' }, vistaActual())) return;
    el.scrollTop = destino * (el.scrollHeight - el.clientHeight);
  }, [y, tamano.alto]);
  const propio = () => {
    if (ultimo.current.vista) ultimo.current.soltar();
  };

  const ultimaMarca = useRef(0);
  const marcarEn = (e) => {
    if (!hoja.current) return;
    const caja = hoja.current.getBoundingClientRect();
    if (!caja.width || !caja.height) return;
    const x = Math.min(1, Math.max(0, (e.clientX - caja.left) / caja.width));
    const yy = Math.min(1, Math.max(0, (e.clientY - caja.top) / caja.height));
    ultimo.current.marcar({ pagina: 1, x: Math.round(x * 1000) / 1000, y: Math.round(yy * 1000) / 1000 });
  };
  useEffect(() => () => ultimo.current.marcar(null), []);

  // The table's marks.
  const [conZona, setConZona] = useState(false);
  const [conLista, setConLista] = useState(false);
  const m = useMarcas({ mesa, contenedor: hoja, conZona });
  const lugar = (n) => (n === 1 && tamano.ancho ? { left: 0, top: 0, ancho: tamano.ancho, alto: tamano.alto } : null);
  const textoMarcas = useRef('');
  useLayoutEffect(() => {
    textoMarcas.current = marcasEnTexto(m.marcas);
  });
  const registrarParaConsultron = mesa.paraConsultron;
  useEffect(() => registrarParaConsultron(() => [`Foto «${nombre}» (sin texto leído).`, textoMarcas.current].filter(Boolean).join('\n')), [registrarParaConsultron, nombre]);
  const irAMarca = (marca) => {
    propio();
    const el = marco.current;
    if (el) el.scrollTop = Math.max(0, marca.cajas[0][1] * tamano.alto - 24);
    el?.focus({ preventScroll: true });
  };

  const dedos = mesa.otros.flatMap((o) => {
    const d = leerMarca(o.h);
    return d && d.pagina === 1 ? [{ id: o.id, nombre: String(o.nombre ?? '').slice(0, 40) || 'Alguien', color: colorSeguro(o.color), x: d.x, y: d.y }] : [];
  });

  return (
    <div className="lector apunte-vivo">
      <div className="lector__barra apunte-vivo__barra">
        <span className="lector__grupo">
          <button type="button" className="lector__boton apunte-vivo__texto-boton" aria-pressed={conZona} onClick={() => setConZona((z) => !z)}>
            Marcar zona
          </button>
          <button type="button" className="lector__boton apunte-vivo__texto-boton" aria-expanded={conLista} aria-controls={`${mesa.id}-marcas`} onClick={() => setConLista((l) => !l)}>
            Marcas{m.marcas.length > 0 && ` (${m.marcas.length})`}
          </button>
        </span>
      </div>
      {conLista && (
        <div id={`${mesa.id}-marcas`} className="apunte-vivo__panel" role="region" aria-label="Marcas de la mesa">
          <ListaMarcas marcas={m.marcas} mesa={mesa} onIr={irAMarca} />
        </div>
      )}
      {m.aviso && <p className="apunte-vivo__aviso apunte-vivo__aviso--barra" role="alert">{m.aviso}</p>}
      <div
        ref={marco}
        className="lector__marco apunte-vivo__marco"
        tabIndex={0}
        role="region"
        aria-label={nombre}
        onScroll={alDesplazar}
        onWheel={propio}
        onTouchMove={propio}
        onKeyDown={(e) => e.target === e.currentTarget && propio()}
      >
        {url && (
          <VistaImagen direccion={url} nombre={nombre} blob={blob}>
            {(img) => (
              <div
                ref={ponerHoja}
                className="apunte-vivo__imagen"
                data-pagina="1"
                data-zona={conZona || undefined}
                {...m.handlers}
                onPointerMove={(e) => {
                  m.handlers.onPointerMove(e);
                  if (e.pointerType === 'touch' || performance.now() - ultimaMarca.current < CADA_MARCA) return;
                  ultimaMarca.current = performance.now();
                  marcarEn(e);
                }}
                onPointerDown={(e) => {
                  m.handlers.onPointerDown(e);
                  if (e.pointerType === 'touch') marcarEn(e);
                }}
                onPointerLeave={(e) => e.pointerType !== 'touch' && ultimo.current.marcar(null)}
              >
                {img}
                <CapaMarcas marcas={m.marcas} lugar={lugar} zona={m.zona} abierta={m.abierta} />
                {dedos.map((d) => (
                  <span key={d.id} className="apunte-vivo__dedo" style={{ left: `${d.x * 100}%`, top: `${d.y * 100}%`, ...(d.color ? { '--color': d.color } : {}) }} aria-hidden="true">
                    <span className="apunte-vivo__quien">{d.nombre}</span>
                  </span>
                ))}
                {m.sel && !m.abierta && lugar(m.sel.pagina) && (
                  <BarraSeleccion estilo={lugarSobre(lugar(1), m.sel.cajas, tamano.ancho)} onResaltar={() => m.crear(m.sel)} onNota={() => m.crear(m.sel, true)} />
                )}
                {m.abierta && lugar(1) && (
                  <GloboMarca
                    key={`${m.abierta.marca.id}-${m.abierta.editando}`}
                    abierta={m.abierta}
                    mesa={mesa}
                    estilo={lugarSobre(lugar(1), m.abierta.marca.cajas, tamano.ancho, true)}
                    onCerrar={() => m.setAbierta(null)}
                    onEditar={() => m.setAbierta({ id: m.abierta.marca.id, editando: true })}
                  />
                )}
              </div>
            )}
          </VistaImagen>
        )}
      </div>
    </div>
  );
}
