import { useEffect, useId, useRef, useState } from 'react';
import { claveDia, esClaveDeDia, fechaDeClave } from '../lib/datos';
import { adivinarTipo, textoDeTipo, tipoDe, TIPOS } from '../lib/tipos';
import Campo from './Campo';
import { useUI } from './ui';

let serie = 0;
const idNuevo = () => Date.now() * 1000 + (serie++ % 1000);
const dosCifras = (n) => String(n).padStart(2, '0');
const horaDe = (evento) => {
  if (evento.sinHora) return '';
  const d = new Date(evento.cuando * 1000);
  return `${dosCifras(d.getHours())}:${dosCifras(d.getMinutes())}`;
};

/** Adds a date of the student's own, or changes one (`evento`, as the calendar shows it). New ones start on `dia`.
 * Until the student picks a kind, the title suggests it: «Parcial de Física» marks itself as an exam. With `delCampus`
 * it corrects a campus date: same fields but the course, which stays the campus' one. `onVolver` takes back a
 * correction. */
export default function FormFecha({ evento = null, delCampus = false, dia, materias, onGuardar, onBorrar, onVolver, onCancelar }) {
  const { confirmar } = useUI();
  const titulo = useRef(null);
  const idTitulo = useId();
  const nombreTipo = useId();
  const [que, setQue] = useState(evento?.titulo ?? '');
  const [tipo, setTipo] = useState(evento ? tipoDe(evento) : 'otro');
  const [elegido, setElegido] = useState(Boolean(evento));
  const [cuandoDia, setCuandoDia] = useState(evento ? claveDia(evento.cuando) : dia);
  const [hora, setHora] = useState(evento ? horaDe(evento) : '');
  const [materia, setMateria] = useState(evento?.materiaId ? String(evento.materiaId) : '');
  const [errores, setErrores] = useState({});
  // For a screen reader: the kind the title suggested, since the checked option changes on its own.
  const [sugerido, setSugerido] = useState('');
  const inicial = useRef({ que, tipo, cuandoDia, hora, materia });
  const cambiado = () => JSON.stringify({ que, tipo, cuandoDia, hora, materia }) !== JSON.stringify(inicial.current);

  useEffect(() => {
    titulo.current?.focus();
  }, []);

  const escribir = (valor) => {
    setQue(valor);
    if (elegido) return;
    const nuevo = adivinarTipo(valor) ?? 'otro';
    if (nuevo !== tipo) setSugerido(nuevo === 'otro' ? '' : `Tipo sugerido, ${textoDeTipo(nuevo)}`);
    setTipo(nuevo);
  };

  // Escape asks before throwing away what was written. A native picker or list closes first on its own.
  const escape = async (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented || e.target.matches('select, input[type="date"], input[type="time"]')) return;
    e.preventDefault();
    if (!cambiado() || (await confirmar({ titulo: '¿Descartar lo que escribiste?', boton: 'Descartar', peligro: true }))) onCancelar();
  };

  const guardar = (e) => {
    e.preventDefault();
    const faltan = {};
    if (!que.trim()) faltan.que = 'Escribí qué es.';
    if (!esClaveDeDia(cuandoDia)) faltan.dia = 'Elegí un día entre 2000 y 2100.';
    setErrores(faltan);
    if (faltan.que) return titulo.current?.focus();
    if (faltan.dia) return e.currentTarget.querySelector('input[type="date"]')?.focus();
    const base = fechaDeClave(cuandoDia);
    // Without a time it's the whole day: noon keeps it on its day whatever the time zone.
    const [horas, minutos] = hora ? hora.split(':').map(Number) : [12, 0];
    const cuando = Math.floor(new Date(base.getFullYear(), base.getMonth(), base.getDate(), horas, minutos).getTime() / 1000);
    if (delCampus) {
      // Whether the campus marks it as a deadline: it keeps how it goes to Google Calendar.
      const vence = Boolean(evento.corregida ? evento.vence : evento.vencimiento);
      onGuardar({ id: evento.id, titulo: que.trim(), tipo, cuando, sinHora: !hora, materiaId: evento.materiaId, vence });
      return;
    }
    onGuardar({
      id: evento?.eventoId ?? idNuevo(),
      titulo: que.trim(),
      tipo,
      cuando,
      sinHora: !hora,
      materiaId: materia ? Number(materia) : null,
    });
  };

  const borrar = async () => {
    const pregunta = delCampus
      ? { titulo: '¿Borrar esta fecha del calendario?', texto: 'Deja de verse en Super CVG. En el campus sigue. La podés volver a mostrar.', boton: 'Borrar', peligro: true }
      : { titulo: '¿Borrar esta fecha?', boton: 'Borrar', peligro: true };
    if (await confirmar(pregunta)) onBorrar(delCampus ? evento.id : evento.eventoId);
  };

  return (
    <form
      className="bloque form-fecha"
      aria-labelledby={idTitulo}
      noValidate
      onSubmit={guardar}
      onKeyDown={escape}
    >
      <h2 id={idTitulo}>{delCampus ? 'Corregir una fecha del campus' : evento ? 'Cambiar tu fecha' : 'Agregar una fecha'}</h2>
      {delCampus && <p className="form-fecha__nota">Cambia solo en Super CVG. En el campus sigue como está.</p>}
      <Campo etiqueta="Qué es" ayuda="Por ejemplo, Parcial de Física" error={errores.que}>
        <input ref={titulo} className="campo__control" value={que} maxLength={200} autoComplete="off" onChange={(e) => escribir(e.target.value)} />
      </Campo>
      <p className="solo-lectores" aria-live="polite">{sugerido}</p>
      <fieldset className="form-fecha__tipos">
        <legend className="campo__etiqueta">Qué tipo</legend>
        <div className="form-fecha__opciones">
          {TIPOS.map((t) => (
            <label key={t.valor} className="form-fecha__tipo" data-tipo={t.valor === 'otro' ? undefined : t.valor}>
              <input
                type="radio"
                name={nombreTipo}
                value={t.valor}
                checked={tipo === t.valor}
                onChange={() => {
                  setTipo(t.valor);
                  setElegido(true);
                }}
              />
              {t.texto}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="form-fecha__fila">
        <Campo etiqueta="Día" error={errores.dia}>
          <input type="date" className="campo__control" min="2000-01-01" max="2100-12-31" value={cuandoDia} onChange={(e) => setCuandoDia(e.target.value)} />
        </Campo>
        <Campo etiqueta="Hora" ayuda="Si no tiene, dejala vacía">
          <input type="time" className="campo__control" value={hora} onChange={(e) => setHora(e.target.value)} />
        </Campo>
      </div>
      {!delCampus && (
        <Campo etiqueta="Materia">
          <select className="campo__control" value={materia} onChange={(e) => setMateria(e.target.value)}>
            <option value="">Ninguna</option>
            {materias.map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
          </select>
        </Campo>
      )}
      <div className="form-fecha__botones">
        <button type="submit" className="boton">Guardar</button>
        <button type="button" className="boton boton--secundario" onClick={onCancelar}>Cancelar</button>
        {delCampus && evento.corregida && <button type="button" className="boton boton--secundario" onClick={() => onVolver(evento.id)}>Volver a la del campus</button>}
        {evento && <button type="button" className="boton boton--peligro" onClick={borrar}>Borrar</button>}
      </div>
    </form>
  );
}
