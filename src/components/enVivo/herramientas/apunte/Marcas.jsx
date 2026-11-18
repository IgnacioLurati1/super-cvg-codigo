import { useEffect, useId, useRef, useState } from 'react';
import { colorSeguro } from '../../../../lib/enVivo/apunte';
import { anotar, borrarMarca, leerCajas, leerMarcas, marcar, MAX_MARCAS, MAX_NOTA, MAX_TEXTO } from '../../../../lib/enVivo/marcasApunte';
import { enCaja } from '../../../lector/geometria';
import { cajasDeRango } from '../../../lector/Pagina';

// The marks of the table on the pages of an Apunte (marcasApunte.js): drawn over the pages, made from a text selection
// or a zone dragged on a page, opened with a touch. The reader gives where each page is in its frame: `lugar(pagina)`
// -> { left, top, ancho, alto } in pixels of the box the pages are in (`contenedor`). Each page carries
// data-pagina. The bar and the bubble are the reader's own (lector.css).

const quieto = (e) => e.preventDefault();
const MIN_ZONA = 0.012;

function hojaDe(nodo) {
  const el = nodo?.nodeType === 3 ? nodo.parentElement : nodo;
  return el?.closest?.('[data-pagina]') ?? null;
}

function puntoEn(hoja, e) {
  const caja = hoja.getBoundingClientRect();
  if (!caja.width || !caja.height) return null;
  return [Math.min(1, Math.max(0, (e.clientX - caja.left) / caja.width)), Math.min(1, Math.max(0, (e.clientY - caja.top) / caja.height))];
}

/** Everything the reader needs to mark: the marks, what is selected, the open one and the zone being drawn, with the
 * handlers of the box of the pages. */
export function useMarcas({ mesa, contenedor, conZona }) {
  const marcas = leerMarcas(mesa.datos);
  const [sel, setSel] = useState(null);
  const [abierta, setAbierta] = useState(null);
  const [zona, setZona] = useState(null);
  const [aviso, setAviso] = useState('');
  const dibujo = useRef(null);

  const leerSeleccion = () => {
    const s = window.getSelection();
    if (!s || s.isCollapsed || !s.rangeCount) {
      setSel(null);
      return;
    }
    const rango = s.getRangeAt(0);
    const hoja = hojaDe(rango.startContainer);
    const cajas = hoja && contenedor.current?.contains(hoja) ? leerCajas(cajasDeRango(rango, hoja)) : null;
    const texto = s.toString().replace(/\s+/g, ' ').trim();
    setSel(cajas && texto ? { pagina: Number(hoja.dataset.pagina), cajas, texto: texto.slice(0, MAX_TEXTO) } : null);
  };

  const crear = (marca, conNota = false) => {
    const id = marcar(mesa.doc, mesa.datos, mesa.yo, marca);
    window.getSelection()?.removeAllRanges();
    setSel(null);
    if (!id) {
      setAviso(`Este apunte ya tiene ${MAX_MARCAS} marcas. Borrá alguna para sumar otra.`);
      return;
    }
    setAviso('');
    if (conNota) setAbierta({ id, editando: true });
  };

  // A touch on a mark opens it; on nothing, it closes the open one.
  const alTocar = (e) => {
    if (conZona || !window.getSelection()?.isCollapsed) return;
    const hoja = hojaDe(e.target);
    const punto = hoja && puntoEn(hoja, e);
    if (!punto) return;
    const n = Number(hoja.dataset.pagina);
    const tocada = [...marcas].reverse().find((m) => m.pagina === n && m.cajas.some((c) => enCaja(punto, c, 0.006)));
    setAbierta(tocada ? { id: tocada.id, editando: false } : null);
  };

  const handlers = {
    onPointerUp: (e) => {
      if (dibujo.current) {
        const d = dibujo.current;
        dibujo.current = null;
        setZona(null);
        const x = Math.min(d.x0, d.x1);
        const y = Math.min(d.y0, d.y1);
        const w = Math.abs(d.x1 - d.x0);
        const h = Math.abs(d.y1 - d.y0);
        if (w > MIN_ZONA && h > MIN_ZONA) crear({ pagina: d.pagina, cajas: [[x, y, w, h]] });
        return;
      }
      if (!conZona) setTimeout(leerSeleccion, 0);
      alTocar(e);
    },
    onKeyUp: (e) => {
      if (e.shiftKey || e.key === 'Shift') leerSeleccion();
    },
    onPointerDown: (e) => {
      if (!conZona || (e.pointerType === 'mouse' && e.button !== 0)) return;
      const hoja = hojaDe(e.target);
      const punto = hoja && puntoEn(hoja, e);
      if (!punto) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      dibujo.current = { hoja, pagina: Number(hoja.dataset.pagina), x0: punto[0], y0: punto[1], x1: punto[0], y1: punto[1] };
      setZona({ ...dibujo.current });
    },
    onPointerMove: (e) => {
      const d = dibujo.current;
      if (!d) return;
      const punto = puntoEn(d.hoja, e);
      if (!punto) return;
      [d.x1, d.y1] = punto;
      setZona({ ...d });
    },
    onPointerCancel: () => {
      dibujo.current = null;
      setZona(null);
    },
  };

  // A mark deleted by someone else closes its bubble.
  const abiertaMarca = abierta ? marcas.find((m) => m.id === abierta.id) : null;
  return { marcas, sel, setSel, abierta: abiertaMarca ? { ...abierta, marca: abiertaMarca } : null, setAbierta, zona, aviso, crear, handlers };
}

const estiloCaja = (L, [x, y, w, h]) => ({ left: L.left + x * L.ancho, top: L.top + y * L.alto, width: w * L.ancho, height: h * L.alto });

/** The marks drawn over the pages, each in its author's color with their name; and the zone being drawn. Only
 * drawing: the list (ListaMarcas) says the same in words. */
export function CapaMarcas({ marcas, lugar, zona, abierta }) {
  return (
    <div className="apunte-vivo__marcas" aria-hidden="true">
      {marcas.map((m) => {
        const L = lugar(m.pagina);
        if (!L) return null;
        const color = colorSeguro(m.color);
        const estilo = color ? { '--color': color } : undefined;
        const primera = estiloCaja(L, m.cajas[0]);
        return (
          <div key={m.id} className="apunte-vivo__marca" data-abierta={abierta?.marca.id === m.id || undefined} style={estilo}>
            {m.cajas.map((c, i) => <span key={i} className="apunte-vivo__resaltado" style={estiloCaja(L, c)} />)}
            <span className="apunte-vivo__autor" style={{ left: primera.left, top: primera.top }}>
              {m.nombre}
              {m.nota && <svg viewBox="0 0 16 16" focusable="false"><path d="M3 2h10v9H8l-3 3v-3H3z" /></svg>}
            </span>
          </div>
        );
      })}
      {zona && lugar(zona.pagina) && (
        <span
          className="apunte-vivo__zona"
          style={estiloCaja(lugar(zona.pagina), [Math.min(zona.x0, zona.x1), Math.min(zona.y0, zona.y1), Math.abs(zona.x1 - zona.x0), Math.abs(zona.y1 - zona.y0)])}
        />
      )}
    </div>
  );
}

/** Where the bar or the bubble goes: over the first box of the mark, or under its last one near the top of the view. */
export function lugarSobre(L, cajas, anchoTotal, abajo = false) {
  const primera = cajas[0];
  const ultima = cajas[cajas.length - 1];
  const x = L.left + primera[0] * L.ancho;
  const arriba = L.top + primera[1] * L.alto;
  const debajo = abajo || arriba < 60;
  return { left: Math.round(Math.min(Math.max(8, x), Math.max(8, anchoTotal - 310))), top: Math.round(debajo ? L.top + (ultima[1] + ultima[3]) * L.alto + 10 : arriba - 52) };
}

/** Over what is selected: highlight it for everyone, or highlight it and write a note. */
export function BarraSeleccion({ estilo, onResaltar, onNota }) {
  return (
    <div className="lector__barra-sel apunte-vivo__barra-sel" role="toolbar" aria-label="Marcar lo seleccionado para la mesa" style={estilo}>
      <button type="button" className="lector__barra-nota" onMouseDown={quieto} onClick={onResaltar}>Resaltar</button>
      <button type="button" className="lector__barra-nota" onMouseDown={quieto} onClick={onNota}>Con nota</button>
    </div>
  );
}

/** A mark opened: who made it, what it says, and its note (its author writes it). Anyone deletes it. */
export function GloboMarca({ abierta, mesa, estilo, onCerrar, onEditar }) {
  const id = useId();
  const { marca, editando } = abierta;
  const mia = marca.de === mesa.yo.id;
  const [nota, setNota] = useState(marca.nota);
  const caja = useRef(null);
  useEffect(() => {
    if (editando) caja.current?.querySelector('textarea')?.focus({ preventScroll: true });
  }, [editando]);
  const guardar = (e) => {
    e.preventDefault();
    anotar(mesa.datos, marca.id, mesa.yo, nota);
    onCerrar();
  };
  const color = colorSeguro(marca.color);
  return (
    <div
      ref={caja}
      className="lector__globo apunte-vivo__globo"
      role="dialog"
      aria-label={`Marca de ${marca.nombre} en la página ${marca.pagina}`}
      style={estilo}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return;
        e.preventDefault();
        e.stopPropagation();
        onCerrar();
      }}
    >
      <p className="apunte-vivo__globo-quien">
        <span className="apunte-vivo__punto" style={color ? { '--color': color } : undefined} aria-hidden="true" />
        {mia ? 'Tu marca' : `Marca de ${marca.nombre}`}
      </p>
      {marca.texto && <p className="apunte-vivo__globo-texto">«{marca.texto}»</p>}
      {editando ? (
        <form className="lector__globo-form" onSubmit={guardar}>
          <label className="solo-lectores" htmlFor={`${id}-nota`}>Nota</label>
          <textarea
            id={`${id}-nota`}
            className="campo__control lector__globo-texto"
            rows={3}
            maxLength={MAX_NOTA}
            placeholder="Por ejemplo, esto entra en el parcial"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) guardar(e);
            }}
          />
          <div className="lector__globo-botones">
            <button type="submit" className="boton boton--chico">Guardar</button>
            <button type="button" className="boton boton--secundario boton--chico" onClick={onCerrar}>Cancelar</button>
          </div>
        </form>
      ) : (
        <>
          {marca.nota && <p className="lector__globo-nota">{marca.nota}</p>}
          <div className="lector__globo-botones">
            {mia && <button type="button" className="boton boton--secundario boton--chico" onClick={onEditar}>{marca.nota ? 'Editar nota' : 'Sumar nota'}</button>}
            <button type="button" className="boton boton--secundario boton--chico" onClick={() => { borrarMarca(mesa.datos, marca.id); onCerrar(); }}>Borrar</button>
            <button type="button" className="lector__boton lector__globo-cerrar" aria-label="Cerrar" onClick={onCerrar}>
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** The marks in words, by page: where each one is, who made it and its note, to go there or delete it. */
export function ListaMarcas({ marcas, mesa, onIr }) {
  if (!marcas.length) return <p className="apunte-vivo__lista-vacia">Todavía no hay marcas. Seleccioná texto o marcá una zona.</p>;
  return (
    <ul className="apunte-vivo__lista">
      {marcas.map((m) => {
        const color = colorSeguro(m.color);
        return (
          <li key={m.id} className="apunte-vivo__item">
            <span className="apunte-vivo__punto" style={color ? { '--color': color } : undefined} aria-hidden="true" />
            <span className="apunte-vivo__item-texto">
              <span className="apunte-vivo__item-dato">Página {m.pagina}, {m.de === mesa.yo.id ? 'vos' : m.nombre}</span>
              {m.texto ? <span>«{m.texto}»</span> : <span>Una zona de la página</span>}
              {m.nota && <span className="apunte-vivo__item-nota">{m.nota}</span>}
            </span>
            <span className="apunte-vivo__item-botones">
              <button type="button" className="boton boton--secundario boton--chico" aria-label={`Ir a la marca de la página ${m.pagina}`} onClick={() => onIr(m)}>Ir</button>
              <button type="button" className="boton boton--secundario boton--chico" aria-label={`Borrar la marca de la página ${m.pagina}`} onClick={() => borrarMarca(mesa.datos, m.id)}>Borrar</button>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
