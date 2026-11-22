import { useEffect, useRef, useState } from 'react';
import { alternarEn, fijarOrden, renombrar } from '../lib/mio';
import { tonoDeItem } from '../lib/simbolos';
import { useMarcarVistos } from '../lib/vistos';
import Campo from './Campo';
import { datoDe } from './Filas';
import { useAbrirPrevia } from './Previa';
import PasarA from './PasarA';
import { useBotonesSinMouse } from '../lib/sinMouse';
import { FormEnlace, FormTexto } from './SumarCosas';
import { IconoDeItem } from './Simbolo';
import TextoConFormato from './TextoConFormato';

// Where the name it had comes from, and how to go back to it.
const ORIGEN = {
  classroom: ['En Classroom se llama', 'Volver al nombre de Classroom'],
  propia: ['Antes se llamaba', 'Volver al nombre de antes'],
};
const SIN_ORIGEN = ['En el campus se llama', 'Volver al nombre del campus'];

// `onRenombrar(item, nombre)`: a name kept somewhere else than the student's names (a file of a course of one's own).
function Renombrar({ item, onRenombrar, onListo }) {
  const [sellama, volver] = ORIGEN[item.origen] ?? SIN_ORIGEN;
  const [texto, setTexto] = useState(item.nombre);
  const guardar = (e) => {
    e.preventDefault();
    if (onRenombrar) onRenombrar(item, texto);
    else renombrar(item.materiaId, item.clave, texto);
    onListo();
  };
  return (
    <form className="fila__renombrar" onSubmit={guardar} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onListo(); } }}>
      <Campo etiqueta="Nombre nuevo" ayuda={item.nombreOriginal ? `${sellama} ${item.nombreOriginal}` : undefined}>
        <input className="campo__control" value={texto} maxLength={200} autoComplete="off" autoFocus onChange={(e) => setTexto(e.target.value)} />
      </Campo>
      <div className="fila__botones">
        <button type="submit" className="boton boton--chico">Guardar</button>
        {item.nombreOriginal && (
          <button type="button" className="boton boton--secundario boton--chico" onClick={() => { renombrar(item.materiaId, item.clave, ''); onListo(); }}>{volver}</button>
        )}
        <button type="button" className="boton boton--secundario boton--chico" onClick={onListo}>Cancelar</button>
      </div>
    </form>
  );
}

// A row the student can arrange. `claves` is the order of its section, or null while a filter hides part of it.
// `secciones` and `onPasar`: the sections it can go to, without dragging. `enfocar`: it just arrived from another one.
// `lectura`: reading mode, only open it and mark it as seen. `onBorrar` and `onCambiar`: something the student added,
// which is deleted instead of hidden, and whose text or link is changed instead of its name. In a course of one's own,
// `onMover(item, salto)` and `onRenombrar(item, nombre)` keep the order and the name in it, and `enLinea` shows a text
// whole in the list instead of a row that opens it.
export default function FilaEditable({ item, claves, marca, onOcultar, onBorrar = null, onCambiar = null, onMover = null, onRenombrar = null, enLinea = false, arrastre, secciones = [], onPasar = null, enfocar = false, lectura = false }) {
  const abrir = useAbrirPrevia();
  const marcarVistos = useMarcarVistos();
  const [abierta, setAbierta] = useState(false);
  const [renombrando, setRenombrando] = useState(false);
  const [cambiando, setCambiando] = useState(false);
  const bloque = item.tuyo?.bloque;
  const escrito = Boolean(onCambiar) && (bloque?.tipo === 'texto' || bloque?.tipo === 'enlace');
  const [aviso, setAviso] = useState('');
  const subir = useRef(null);
  const bajar = useRef(null);
  const opciones = useRef(null);
  const principal = useRef(null);
  useEffect(() => {
    if (enfocar) (principal.current ?? opciones.current)?.focus();
  }, [enfocar]);
  const lugar = claves ? claves.indexOf(item.clave) : -1;
  // Subir, Bajar and «Pasar a otra sección» do what dragging the row does: only with «Modo sin mouse» (sinMouse.js).
  const conBotones = useBotonesSinMouse() || !arrastre || enLinea;

  const mover = (salto, boton) => {
    if (onMover) onMover(item, salto);
    else {
      const nuevo = [...claves];
      nuevo.splice(lugar, 1);
      nuevo.splice(lugar + salto, 0, item.clave);
      fijarOrden(item.materiaId, item.seccionId, nuevo);
    }
    setAviso(`Quedó en el lugar ${lugar + salto + 1} de ${claves.length}`);
    // Moving a node in the document drops its focus: it comes back to the same button, or to its pair at an edge.
    requestAnimationFrame(() => {
      const destino = boton.current?.disabled ? (boton === subir ? bajar : subir) : boton;
      destino.current?.focus();
    });
  };

  const dato = [marca, item.tuyo && !item.enPropia ? 'Tuyo' : null, datoDe(item), item.nombreOriginal ? 'Renombrado' : null, marcarVistos && item.visto ? 'Visto' : null, item.parcial ? 'Para el parcial' : null].filter(Boolean).join(', ');

  return (
    <li
      className="fila fila--editable"
      data-visto={(marcarVistos && item.visto) || undefined}
      data-marca={marca ? '' : undefined}
      data-recien={enfocar || undefined}
      data-en-linea={enLinea || undefined}
      // Its kind's color for the whole row, for the looks of Configuración that paint it (ajustes.contenido).
      data-tono={enLinea ? undefined : tonoDeItem(item)}
      draggable={Boolean(arrastre) && !abierta && !enLinea}
      onDragStart={arrastre ? (e) => { e.dataTransfer.setData('text/plain', item.nombre); e.dataTransfer.effectAllowed = 'move'; arrastre.empezar(item.clave); } : undefined}
      onDragEnd={arrastre?.terminar}
      onDragOver={arrastre ? (e) => e.preventDefault() : undefined}
      onDrop={arrastre ? (e) => {
        // Files of the computer go to the section.
        if (e.dataTransfer?.types?.includes('Files')) return;
        e.preventDefault();
        e.stopPropagation();
        arrastre.soltar(item.clave);
      } : undefined}
    >
      <div className="fila__linea">
        {enLinea ? (
          <div className="fila__en-linea"><TextoConFormato texto={item.texto} /></div>
        ) : (
          <button ref={principal} type="button" className="fila__principal" onClick={() => abrir(item)} aria-haspopup="dialog">
            <IconoDeItem item={item} />
            <span className="fila__texto">
              <span className="fila__nombre">{item.nombre}</span>
              <span className="fila__dato">{dato}</span>
            </span>
          </button>
        )}
        {marcarVistos && !enLinea && (
          <button
            type="button"
            className="fila__visto"
            aria-pressed={item.visto}
            aria-label={`Visto, ${item.nombre}`}
            onClick={() => alternarEn(item.materiaId, 'vistos', item.clave)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
          </button>
        )}
        {!lectura && <button ref={opciones} type="button" className="fila__opciones" aria-expanded={abierta} aria-label={enLinea ? `Opciones del texto ${item.nombre}` : `Opciones de ${item.nombre}`} onClick={() => { setAbierta((a) => !a); setRenombrando(false); setCambiando(false); }}>
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>
        </button>}
      </div>
      {abierta && !lectura && (
        <div className="fila__panel">
          {cambiando && bloque.tipo === 'texto' && (
            <FormTexto inicial={bloque.texto} onGuardar={(texto) => { onCambiar(item, { texto }); setCambiando(false); opciones.current?.focus(); }} onCancelar={() => { setCambiando(false); opciones.current?.focus(); }} />
          )}
          {cambiando && bloque.tipo === 'enlace' && (
            <FormEnlace inicial={bloque} onGuardar={(enlace) => { onCambiar(item, enlace); setCambiando(false); opciones.current?.focus(); }} onCancelar={() => { setCambiando(false); opciones.current?.focus(); }} />
          )}
          {renombrando && <Renombrar item={item} onRenombrar={onRenombrar} onListo={() => { setRenombrando(false); opciones.current?.focus(); }} />}
          {!renombrando && !cambiando && (
              <div className="fila__botones">
                {escrito
                  ? <button type="button" className="boton boton--secundario boton--chico" onClick={() => setCambiando(true)}>{bloque.tipo === 'texto' ? 'Cambiar el texto' : 'Cambiar el enlace'}</button>
                  : <button type="button" className="boton boton--secundario boton--chico" onClick={() => setRenombrando(true)}>Renombrar</button>}
                {!enLinea && <button type="button" className="boton boton--secundario boton--chico" aria-pressed={item.parcial} onClick={() => alternarEn(item.materiaId, 'parcial', item.clave)}>{item.parcial ? 'Sacar del parcial' : 'Sumar al parcial'}</button>}
                {claves && conBotones && (
                  <>
                    <button ref={subir} type="button" className="boton boton--secundario boton--chico" disabled={lugar <= 0} onClick={() => mover(-1, subir)}>Subir</button>
                    <button ref={bajar} type="button" className="boton boton--secundario boton--chico" disabled={lugar >= claves.length - 1} onClick={() => mover(1, bajar)}>Bajar</button>
                  </>
                )}
                {onBorrar
                  ? <button type="button" className="boton boton--secundario boton--chico boton--peligro" onClick={() => onBorrar(item)}>Borrar</button>
                  : <button type="button" className="boton boton--secundario boton--chico boton--peligro" onClick={() => onOcultar(item)}>Ocultar</button>}
              </div>
          )}
          {!renombrando && !cambiando && onPasar && conBotones && <PasarA item={item} secciones={secciones} onPasar={onPasar} />}
          <p className="solo-lectores" role="status">{aviso}</p>
        </div>
      )}
    </li>
  );
}
