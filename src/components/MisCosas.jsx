import { useEffect, useRef, useState } from 'react';
import { fecha, fechaDeClave, fechaHora } from '../lib/datos';
import { agregarTarea, alternarTarea, borrarFecha, borrarTarea, guardarNota, MAX_NOTA } from '../lib/mio';
import { sumarANota } from '../lib/santoResumen';
import { juntarTextos } from '../lib/union';
import Campo from './Campo';
import ConsejosDelSanto from './ConsejosDelSanto';
import { useUI } from './ui';

const fechaDeTarea = (clave) => fecha(fechaDeClave(clave).getTime() / 1000);

// The button that erased a row disappears with it: the focus goes to the title of its panel.
function borrarConFoco(evento, pregunta, confirmar, borrar) {
  const titulo = evento.currentTarget.closest('details')?.querySelector('summary');
  confirmar(pregunta).then((seguro) => {
    if (!seguro) return;
    borrar();
    titulo?.focus();
  });
}

/** How much of a course is seen, or of what goes to the exam, as a bar. */
export function Avance({ titulo, hechos, total }) {
  if (!total) return null;
  return (
    <div className="avance">
      <p className="avance__texto">{titulo}, {hechos} de {total}</p>
      <progress className="avance__barra" max={total} value={hechos} aria-label={titulo} />
    </div>
  );
}

export function Panel({ titulo, abierto = false, children }) {
  return (
    <details className="panel" open={abierto || undefined}>
      <summary>{titulo}</summary>
      <div className="panel__cuerpo">{children}</div>
    </details>
  );
}

export function Tareas({ materiaId, tareas }) {
  const { confirmar } = useUI();
  const [texto, setTexto] = useState('');
  const [dia, setDia] = useState('');
  const [error, setError] = useState('');
  const campo = useRef(null);

  const agregar = (e) => {
    e.preventDefault();
    if (!texto.trim()) {
      setError('Escribí qué tenés que hacer.');
      campo.current.focus();
      return;
    }
    agregarTarea(materiaId, texto, dia, Date.now());
    setTexto('');
    setDia('');
    setError('');
    campo.current.focus();
  };

  return (
    <>
      {tareas.length > 0 && (
        <ul className="tareas">
          {tareas.map((t) => (
            <li key={t.id} className="tarea" data-hecha={t.hecha || undefined}>
              <label className="tarea__marca">
                <input type="checkbox" checked={t.hecha} onChange={() => alternarTarea(materiaId, t.id)} />
                <span className="tarea__texto">
                  {t.texto}
                  {t.fecha && <span className="tarea__fecha">Para el {fechaDeTarea(t.fecha)}</span>}
                </span>
              </label>
              <button type="button" className="seccion__ocultar" aria-label={`Borrar ${t.texto}`} onClick={(e) => borrarConFoco(e, { titulo: '¿Borrar esta tarea?', texto: t.texto, boton: 'Borrar', peligro: true }, confirmar, () => borrarTarea(materiaId, t.id))}>Borrar</button>
            </li>
          ))}
        </ul>
      )}
      <form className="tareas__nueva" onSubmit={agregar} noValidate>
        <Campo etiqueta="Qué tenés que hacer" error={error}>
          <input ref={campo} className="campo__control" value={texto} maxLength={200} autoComplete="off" onChange={(e) => setTexto(e.target.value)} />
        </Campo>
        <Campo etiqueta="Para cuándo" ayuda="Si le ponés fecha, aparece en tu calendario.">
          <input className="campo__control" type="date" value={dia} onChange={(e) => setDia(e.target.value)} />
        </Campo>
        <button type="submit" className="boton boton--secundario boton--chico">Agregar</button>
      </form>
    </>
  );
}

/** The notes of a course. `santo`: its subject in El Santo Resumen ({ slug, nombre }), to add tips from there. */
export function Anotaciones({ materiaId, nota, santo = null }) {
  const [texto, setTexto] = useState(nota);
  const [estado, setEstado] = useState('');
  const [consejos, setConsejos] = useState(false);
  const campo = useRef(null);
  const pendiente = useRef(null);
  const ultimo = useRef(nota);
  // The note changed outside this box (it came from the copy in Drive, or from another tab): it shows, unless the
  // student is typing. Then, on saving, what they typed and what came are joined, so neither is lost.
  const [deAfuera, setDeAfuera] = useState(nota);
  const [escribiendo, setEscribiendo] = useState(false);
  if (nota !== deAfuera) {
    setDeAfuera(nota);
    if (!escribiendo) setTexto(nota);
  }
  // What is saved now, and what the box had when the student started typing.
  const afuera = useRef(nota);
  const base = useRef(nota);
  useEffect(() => {
    afuera.current = nota;
    if (!pendiente.current) base.current = nota;
  }, [nota]);
  const conLoQueLlego = (escrito, recorto) => (afuera.current === base.current ? escrito : juntarTextos(escrito, afuera.current, recorto));

  const guardar = () => {
    clearTimeout(pendiente.current);
    pendiente.current = null;
    setEscribiendo(false);
    if (ultimo.current === null) return;
    let recortado = false;
    const valor = conLoQueLlego(ultimo.current, () => {
      recortado = true;
    });
    if (valor !== ultimo.current) setTexto(valor);
    const salio = guardarNota(materiaId, valor);
    ultimo.current = null;
    base.current = valor;
    if (!salio) setEstado('No se pudo guardar. Bajá un archivo con tus datos desde Configuración.');
    else setEstado(recortado ? 'Se juntaron dos versiones y no entró todo.' : 'Guardado en este navegador');
  };

  // Leaving the screen with a pending timer must not lose what was typed.
  const materia = useRef(materiaId);
  useEffect(() => () => {
    if (pendiente.current && ultimo.current !== null) guardarNota(materia.current, afuera.current === base.current ? ultimo.current : juntarTextos(ultimo.current, afuera.current));
    clearTimeout(pendiente.current);
  }, []);

  const cambiar = (e) => {
    setTexto(e.target.value);
    setEscribiendo(true);
    setEstado('');
    ultimo.current = e.target.value;
    clearTimeout(pendiente.current);
    pendiente.current = setTimeout(guardar, 500);
  };

  // The tips go at the end, as many as fit, and are saved right away.
  const sumarConsejos = (elegidos) => {
    const { texto: nuevo, entraron } = sumarANota(texto, elegidos, MAX_NOTA);
    if (entraron) {
      clearTimeout(pendiente.current);
      pendiente.current = null;
      setTexto(nuevo);
      ultimo.current = nuevo;
      guardar();
    }
    const sumados = entraron === 1 ? 'Sumaste un consejo.' : `Sumaste ${entraron} consejos.`;
    if (entraron < elegidos.length) setEstado(`${entraron ? `${sumados} ` : ''}${entraron ? 'El resto no entra' : 'No entra'}, porque las anotaciones llevan hasta 20.000 letras.`);
    else setEstado(`${sumados} Quedó guardado en este navegador.`);
    requestAnimationFrame(() => campo.current?.focus());
  };

  return (
    <div className="anotaciones">
      <Campo etiqueta="Tus anotaciones">
        <textarea ref={campo} className="campo__control" rows={6} maxLength={MAX_NOTA} value={texto} onChange={cambiar} onBlur={() => { if (pendiente.current) guardar(); }} />
      </Campo>
      <p className="anotaciones__estado" role="status">{estado}</p>
      {santo && (
        <button type="button" className="boton boton--secundario boton--chico" aria-haspopup="dialog" onClick={() => setConsejos(true)}>Sumar consejos de El Santo Resumen</button>
      )}
      {consejos && <ConsejosDelSanto santo={santo} nota={texto} onAgregar={sumarConsejos} onCerrar={() => setConsejos(false)} />}
    </div>
  );
}

export function FechasSumadas({ materiaId, fechas }) {
  const { confirmar } = useUI();
  if (!fechas.length) return null;
  return (
    <ul className="tareas">
      {[...fechas].sort((a, b) => a.cuando - b.cuando).map((f) => (
        <li key={f.id} className="tarea">
          <span className="tarea__texto">
            {f.titulo}
            <span className="tarea__fecha">{f.sinHora ? fecha(f.cuando) : fechaHora(f.cuando)}</span>
          </span>
          <button type="button" className="seccion__ocultar" aria-label={`Quitar ${f.titulo}`} onClick={(e) => borrarConFoco(e, { titulo: '¿Quitar esta fecha?', texto: f.titulo, boton: 'Quitar', peligro: true }, confirmar, () => borrarFecha(materiaId, f.id))}>Quitar</button>
        </li>
      ))}
    </ul>
  );
}
