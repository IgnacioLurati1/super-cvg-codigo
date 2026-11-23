import { Fragment, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Campo from '../components/Campo';
import CompartirHorario from '../components/CompartirHorario';
import { Cargando, ErrorConReintento } from '../components/Filas';
import Simbolo from '../components/Simbolo';
import { useUI } from '../components/ui';
import { CALENDARIO } from '../data/facultad/calendario';
import { useAtajosDePagina } from '../lib/atajos';
import { cargarMaterias, cargarPerfil } from '../lib/campus';
import { useColorDeMateria } from '../lib/colores';
import { fechaDeClave, normalizar } from '../lib/datos';
import {
  ahoraYDespues, armarSemana, calendarioViejo, comisionDe, comisionesCon, comisionesDeLaMateria, cuatrimestreEl, cuatrimestreQueSigue, DIAS_DE_CLASE,
  CARRERAS, cicloDe, horaEnTexto, hoyClave, letrasDelAlumno, materiaDelCurso, materiasDeLosHorarios, notaDeCarrera, porCarrera, sinClasesEl,
} from '../lib/facultad';
import { cargarHorarios } from '../lib/horarioDatos';
import {
  elegirComisionDe, elegirComisionDeExtra, guardarAula, guardarAulaDeExtra, guardarClasesAMano, MAX_CLASES_A_MANO, MAX_MATERIAS_DE_LA_FACULTAD,
  quitarMateriaDeLaFacultad, sumarMateriaDeLaFacultad, useMio,
} from '../lib/mio';
import { tituloDe, useSeo } from '../lib/seo';
import { useConsulta } from '../lib/useConsulta';
import { carrilesDelDia } from './horarioCarriles';
import './panel.css';
import './horario.css';

const SIN_CURSOS = [];
const SIN_GUARDAR = 'No se pudo guardar. Fijate si el navegador deja guardar datos.';
const turno = (t) => (t ? `, ${t.toLocaleLowerCase('es')}` : '');
const deA = (c) => `${horaEnTexto(c.desde)} a ${horaEnTexto(c.hasta)}`;
const aLas = (minutos) => (minutos < 120 && minutos >= 60 ? `a la ${horaEnTexto(minutos)}` : `a las ${horaEnTexto(minutos)}`);
const hastaLas = (minutos) => (minutos < 120 && minutos >= 60 ? `hasta la ${horaEnTexto(minutos)}` : `hasta las ${horaEnTexto(minutos)}`);
const deDia = (dia) => DIAS_DE_CLASE[dia - 1].toLocaleLowerCase('es');
const fechaLarga = (clave) => new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long', year: 'numeric' }).format(fechaDeClave(clave));
// Under this, in minutes, a class shows its hour and name in one line in the week of a computer.
const CORTA = 35;
// The earliest a class changed by hand can start: the faculty's first ones are at 7:15.
const DESDE_LAS = 7 * 60;
const minutosDe = (texto) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(texto ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
// Where the classes changed by hand of a subject of «Tus materias» go in mio.js.
const tipoAMano = (item) => (item.curso ? 'cursos' : 'extras');
const idDe = (item) => item.curso?.id ?? item.extra.id;
// The same classes, in any order: nothing changed by hand.
const firma = (lista) => lista.map((k) => [k.dia, k.desde, k.hasta, k.aula, k.cuatrimestre].join('|')).sort().join('\n');

// A class in the editor of a subject, as its fields say it; with a key of its own, so a row taken out takes its fields.
let ultimaFila = 0;
const filaDelEditor = (k, cuatrimestre) => ({
  clave: ++ultimaFila,
  dia: String(k?.dia ?? 1),
  desde: k ? horaEnTexto(k.desde) : '',
  hasta: k ? horaEnTexto(k.hasta) : '',
  aula: k?.aula ?? '',
  cuatrimestre: k ? k.cuatrimestre : cuatrimestre,
});

// The minute of the day, again every minute: the line of «now» moves by itself.
function useAhora() {
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const reloj = setInterval(() => setAhora(new Date()), 60_000);
    return () => clearInterval(reloj);
  }, []);
  return ahora;
}

// Whether the week is a list, as the container query of horario.css says (the page, under 48rem): there the detail of a
// class goes right under it. It changes with the window and with the letter size.
function useEstrecho(ref) {
  const [estrecho, setEstrecho] = useState(false);
  useLayoutEffect(() => {
    const caja = ref.current?.closest('main') ?? ref.current;
    if (!caja) return undefined;
    const medir = () => {
      const estilo = getComputedStyle(caja);
      const ancho = caja.clientWidth - parseFloat(estilo.paddingLeft) - parseFloat(estilo.paddingRight);
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      setEstrecho(ancho < 48 * rem);
    };
    medir();
    const tamano = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(medir);
    tamano?.observe(caja);
    const letra = new MutationObserver(medir);
    letra.observe(document.documentElement, { attributes: true, attributeFilter: ['data-letra'] });
    return () => {
      tamano?.disconnect();
      letra.disconnect();
    };
  }, [ref]);
  return estrecho;
}

// To the first of these still in the page: the focus never falls to the body when what had it is gone.
function enfocar(...candidatos) {
  for (const el of candidatos) {
    if (!el?.isConnected || el.disabled) continue;
    el.focus();
    if (document.activeElement === el) return;
  }
}

// The commission of a subject, from its row or its detail. Another commission brings its classes from the faculty: the
// ones changed by hand go, after asking. True, false if it could not be saved, or null if the student said no.
async function elegirComision(item, valor, confirmar) {
  if (item.aMano && valor && valor !== 'ninguna') {
    const seguro = await confirmar({ titulo: `¿Cambiar a la ${valor}?`, texto: 'Los horarios que cambiaste a mano vuelven a los de la facultad.', boton: 'Cambiar' });
    if (!seguro) return null;
    if (!guardarClasesAMano(tipoAMano(item), idDe(item), null)) return false;
  }
  return item.curso ? elegirComisionDe(item.curso.id, valor || null) : elegirComisionDeExtra(item.extra.id, valor || null);
}

/** A week as columns of days on a computer, and as one list of days on a phone. Classes that overlap go side by side.
 * `detalle`, the detail of the chosen class: given only where the week is a list, it goes right under that class. */
function Semana({ clases, hoy, ahora, elegida, onElegir, detalle }) {
  const colorDe = useColorDeMateria();
  const dias = [1, 2, 3, 4, 5, ...(clases.some((c) => c.dia === 6) ? [6] : [])];
  const inicio = Math.floor(Math.min(...clases.map((c) => c.desde)) / 60) * 60;
  const fin = Math.ceil(Math.max(...clases.map((c) => c.hasta)) / 60) * 60;
  const paso = (minutos) => Math.round((minutos - inicio) / 5) + 1;
  const horas = [];
  for (let h = inicio; h < fin; h += 60) horas.push(h);
  const minuto = ahora.getHours() * 60 + ahora.getMinutes();
  const diaDeHoy = ahora.getDay();
  return (
    <div className="horario__semana" style={{ '--filas': (fin - inicio) / 5, '--dias': dias.length }}>
      <ol className="horario__horas" aria-hidden="true">
        {horas.map((h) => <li key={h} style={{ '--desde': paso(h) }}>{horaEnTexto(h)}</li>)}
      </ol>
      {dias.map((dia) => {
        const delDia = clases.filter((c) => c.dia === dia);
        const lugares = carrilesDelDia(delDia, inicio, fin);
        const esHoy = hoy && dia === diaDeHoy;
        const idTitulo = `horario-dia-${dia}`;
        return (
          <section key={dia} className="horario__dia" data-hoy={esHoy ? '' : undefined} data-vacio={delDia.length ? undefined : ''} aria-labelledby={idTitulo}>
            <h2 id={idTitulo} className="horario__nombre-dia">
              {DIAS_DE_CLASE[dia - 1]}
              {esHoy && <span className="horario__hoy">hoy</span>}
            </h2>
            {delDia.length ? (
              <ol className="horario__clases">
                {delDia.map((c) => {
                  const lugar = lugares.get(c.id);
                  const estilo = {
                    '--desde': paso(c.desde),
                    '--hasta': paso(c.hasta),
                    '--pasos': (c.hasta - c.desde) / 5,
                    '--carril': lugar.carril,
                    '--carriles': lugar.carriles,
                    '--antes': lugar.antes / 5,
                    '--despues': lugar.despues / 5,
                  };
                  return (
                    <Fragment key={c.id}>
                      <li className="horario__bloque" data-materia={colorDe(c.cursoId ?? c.extra)} data-amano={c.cambiada ? '' : undefined} data-corta={c.hasta - c.desde < CORTA ? '' : undefined} style={estilo}>
                        <button
                          type="button"
                          id={`clase-${c.id}`}
                          className="horario__clase"
                          aria-expanded={elegida === c.id}
                          aria-controls={elegida === c.id ? 'horario-detalle' : undefined}
                          onClick={() => onElegir(elegida === c.id ? null : c.id)}
                        >
                          <span className="horario__texto">
                            <span className="horario__hora">{deA(c)}</span>
                            <span className="horario__materia">{c.materia}</span>
                            {c.aula && <span className="horario__aula">{c.aula}</span>}
                            {c.cambiada && <span className="solo-lectores">, cambiada a mano</span>}
                          </span>
                        </button>
                      </li>
                      {detalle && elegida === c.id && <li className="horario__en-dia">{detalle}</li>}
                    </Fragment>
                  );
                })}
                {esHoy && minuto >= inicio && minuto < fin && <li className="horario__ahora" style={{ '--desde': paso(minuto) }} aria-hidden="true" />}
              </ol>
            ) : (
              <div className="horario__clases">
                <p className="horario__libre">Sin clases</p>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

/** The commission of a subject as a select: «Elegí la comisión» while it has none, the saved one even if the schedules
 * don't have it any more, and «No la curso» for a campus course. */
function OpcionesDeComision({ opciones, codigo, conNoLaCurso, letras }) {
  return (
    <>
      {!codigo && <option value="">Elegí la comisión</option>}
      {codigo && !opciones.some((o) => o.codigo === codigo) && <option value={codigo}>{codigo}, ya no está en los horarios</option>}
      <ListaDeComisiones opciones={opciones} letras={letras} />
      {conNoLaCurso && <option value="ninguna">No la curso</option>}
    </>
  );
}

/** The commissions of a subject as options. When several careers have it, in a group each, the student's first. */
function ListaDeComisiones({ opciones, letras }) {
  const opcion = (o) => <option key={o.codigo} value={o.codigo}>{o.codigo}{turno(o.turno)}</option>;
  const grupos = porCarrera(opciones, letras);
  if (grupos.length < 2) return opciones.map(opcion);
  return grupos.map((g) => <optgroup key={g.letra ?? '-'} label={g.nombre}>{g.opciones.map(opcion)}</optgroup>);
}

/** What a class has, and what the student can change of it: its commission, its classroom, and the classes of its
 * subject, by hand. */
function Detalle({ clase, datos, item, mio, letras, onEditar, onCerrar }) {
  const { avisar, confirmar } = useUI();
  const colorDe = useColorDeMateria();
  const titulo = useRef(null);
  const [aula, setAula] = useState(clase.aula);
  const curso = item?.curso ?? null;
  const extra = item?.extra ?? null;
  const opciones = useMemo(() => {
    if (curso) return comisionesCon(datos, curso.nombre);
    return extra ? comisionesDeLaMateria(datos, extra.materia) : [];
  }, [datos, curso, extra]);
  const { codigo, origen } = curso ? comisionDe(curso, mio) : { codigo: extra?.comision ?? null, origen: null };

  useEffect(() => {
    titulo.current?.focus();
  }, [clase.id]);

  const guardarError = () => avisar(SIN_GUARDAR, 'error');
  const elegir = async (valor) => {
    const ok = await elegirComision(item, valor, confirmar);
    if (ok === null) return;
    if (!ok) guardarError();
    else {
      avisar(valor === 'ninguna' ? `${curso.nombre} salió de tu semana.` : 'Comisión cambiada.');
      onCerrar();
    }
  };
  const guardarElAula = (e) => {
    e.preventDefault();
    let ok;
    if (clase.aMano) {
      // A class changed by hand has its own classroom, in its place of the list.
      const lista = (mio.horario?.aMano?.[tipoAMano(item)]?.[idDe(item)] ?? []).map((k, i) => (i === clase.indice ? { ...k, aula: aula.trim() } : k));
      ok = guardarClasesAMano(tipoAMano(item), idDe(item), lista);
    } else ok = curso ? guardarAula(curso.id, clase.dia, aula.trim()) : guardarAulaDeExtra(extra.id, clase.dia, aula.trim());
    if (!ok) guardarError();
    else avisar(aula.trim() ? 'Aula guardada.' : 'Aula borrada.');
  };

  return (
    <section id="horario-detalle" className="bloque horario__detalle" data-materia={colorDe(clase.cursoId ?? clase.extra)} aria-labelledby="horario-detalle-titulo" onKeyDown={(e) => e.key === 'Escape' && onCerrar()}>
      <div className="horario__detalle-cabeza">
        <Simbolo id={clase.cursoId ?? clase.extra} nombre={clase.nombre} sinMateria="calendario" />
        <h2 id="horario-detalle-titulo" ref={titulo} tabIndex={-1}>{clase.materia}</h2>
        <button type="button" className="boton boton--secundario boton--chico" onClick={onCerrar}>Cerrar</button>
      </div>
      <p className="horario__detalle-dato">{DIAS_DE_CLASE[clase.dia - 1]}, de {deA(clase)}{clase.comision ? `, comisión ${clase.comision}` : ''}.</p>
      {clase.cambiada && <p className="horario__detalle-dato">Cambiada a mano.</p>}
      {clase.docentes && <p className="horario__detalle-dato">Con {clase.docentes}.</p>}
      {curso && <p><Link to={`/materias/${curso.id}`}>Ir a {curso.nombre}</Link></p>}

      {item && (
        <>
          <div className="horario__ajustes">
            {opciones.length > 0 && (
              <Campo etiqueta="Comisión de esta materia" ayuda={origen === 'nombre' ? 'Sale del nombre en el campus' : undefined} ayudaAlLado>
                <select className="campo__control" value={codigo ?? ''} onChange={(e) => elegir(e.target.value)}>
                  <OpcionesDeComision opciones={opciones} codigo={codigo} conNoLaCurso={Boolean(curso)} letras={letras} />
                </select>
              </Campo>
            )}
            <form className="horario__aula-form" onSubmit={guardarElAula}>
              <Campo etiqueta={clase.aMano ? 'Aula de esta clase' : `Aula de los ${deDia(clase.dia)}`}>
                <input className="campo__control" type="text" maxLength={40} value={aula} onChange={(e) => setAula(e.target.value)} />
              </Campo>
              <button type="submit" className="boton boton--secundario">Guardar el aula</button>
            </form>
          </div>
          <div className="horario__acciones horario__detalle-pie">
            <button type="button" className="boton boton--secundario boton--chico" onClick={() => onEditar(item.clave)}>Cambiar los horarios</button>
          </div>
        </>
      )}
    </section>
  );
}

/** The weekly classes of a subject, by hand: the day, the hours and the classroom of each, for the cuatrimestre on
 * screen. The ones of the other cuatrimestre stay as they are. Only what repeats every week. */
function EditorDeClases({ item, mio, cuatri, onCerrar }) {
  const { avisar, confirmar } = useUI();
  const id = useId();
  const raiz = useRef(null);
  const botonFila = useRef(null);
  const tipo = tipoAMano(item);
  const propias = mio.horario?.aMano?.[tipo]?.[idDe(item)] ?? null;
  const base = propias ?? item.deLaFacultad;
  const enEste = (k) => !k.cuatrimestre || k.cuatrimestre === cuatri;
  // A new class goes in the cuatrimestre on screen, or in the whole year when the subject is annual or has none yet.
  const deCuatri = base.some((k) => k.cuatrimestre) ? cuatri : 0;
  const nueva = (k = null) => filaDelEditor(k, deCuatri);
  // Without any yet, one to fill in.
  const [filas, setFilas] = useState(() => {
    const estas = base.filter(enEste).map((k) => nueva(k));
    return estas.length || propias ? estas : [nueva()];
  });
  const [errores, setErrores] = useState({});
  const otras = base.filter((k) => !enEste(k));
  const cabe = otras.length + filas.length < MAX_CLASES_A_MANO;

  useEffect(() => {
    raiz.current?.querySelector('select, input, button')?.focus();
  }, []);

  const filaDe = (clave) => raiz.current?.querySelector(`[data-fila="${clave}"] select`);
  const cambiar = (clave, campo, valor) => {
    setFilas((f) => f.map((x) => (x.clave === clave ? { ...x, [campo]: valor } : x)));
    if (errores[clave]?.[campo]) setErrores((e) => ({ ...e, [clave]: { ...e[clave], [campo]: undefined } }));
  };
  const sumarFila = () => {
    const fila = nueva();
    setFilas((f) => [...f, fila]);
    requestAnimationFrame(() => filaDe(fila.clave)?.focus());
  };
  const quitarFila = (clave) => {
    const i = filas.findIndex((x) => x.clave === clave);
    const despues = filas[i + 1] ?? null;
    setFilas((f) => f.filter((x) => x.clave !== clave));
    setErrores((e) => ({ ...e, [clave]: undefined }));
    // The row left with the focus in it: to the next one, or to add another.
    requestAnimationFrame(() => enfocar(despues && filaDe(despues.clave), botonFila.current, raiz.current?.querySelector('[type="submit"]')));
  };

  const guardar = (e) => {
    e.preventDefault();
    const nuevos = {};
    const lista = [];
    for (const f of filas) {
      const d = minutosDe(f.desde);
      let h = minutosDe(f.hasta);
      // A night class that ends after midnight, before 2:00, ends the next day.
      if (h !== null && d !== null && h <= d && h < 120) h += 1440;
      const suyos = {};
      if (d === null) suyos.desde = 'Poné a qué hora empieza.';
      else if (d < DESDE_LAS) suyos.desde = 'Tiene que empezar a las 7:00 o después.';
      if (h === null) suyos.hasta = 'Poné a qué hora termina.';
      else if (d !== null && h <= d) suyos.hasta = 'Tiene que terminar después de empezar.';
      if (Object.keys(suyos).length) nuevos[f.clave] = suyos;
      else lista.push({ dia: Number(f.dia), desde: d, hasta: h, aula: f.aula.trim(), cuatrimestre: f.cuatrimestre });
    }
    setErrores(nuevos);
    if (Object.keys(nuevos).length) {
      // To the first field to fix, once React marked it.
      requestAnimationFrame(() => raiz.current?.querySelector('[aria-invalid="true"]')?.focus());
      return;
    }
    const todas = [...otras, ...lista];
    // The same as the faculty's: nothing stays changed by hand.
    const igual = firma(todas) === firma(item.deLaFacultad);
    if (igual && !propias) {
      avisar('Sin cambios.');
      onCerrar();
      return;
    }
    if (!guardarClasesAMano(tipo, idDe(item), igual ? null : todas)) {
      avisar(SIN_GUARDAR, 'error');
      return;
    }
    avisar(igual ? `${item.nombre} volvió al horario de la facultad.` : `Horarios de ${item.nombre} guardados.`);
    onCerrar();
  };
  const volver = async () => {
    const seguro = await confirmar({ titulo: '¿Volver al horario de la facultad?', texto: 'Se borra lo que cambiaste a mano en esta materia.', boton: 'Volver', volver: 'Cancelar', peligro: true });
    if (!seguro) return;
    if (!guardarClasesAMano(tipo, idDe(item), null)) {
      avisar(SIN_GUARDAR, 'error');
      return;
    }
    avisar(`${item.nombre} volvió al horario de la facultad.`);
    onCerrar();
  };

  const ayuda = deCuatri ? `Son las clases de todas las semanas del ${cuatri === 1 ? 'primer' : 'segundo'} cuatrimestre.` : 'Son las clases de todas las semanas del año.';
  return (
    <form
      ref={raiz}
      id={`${id}-editor`}
      className="horario__editor"
      aria-label={`Horarios de ${item.nombre}`}
      aria-describedby={`${id}-ayuda`}
      onSubmit={guardar}
      noValidate
    >
      <p id={`${id}-ayuda`} className="horario__editor-ayuda">{ayuda}</p>
      {filas.length === 0 && <p className="horario__editor-vacio">Sin clases.</p>}
      {filas.map((f, i) => (
        <fieldset key={f.clave} className="horario__editor-fila" data-fila={f.clave}>
          <legend>Clase {i + 1}</legend>
          <Campo etiqueta="Día">
            <select className="campo__control" value={f.dia} onChange={(e) => cambiar(f.clave, 'dia', e.target.value)}>
              {DIAS_DE_CLASE.map((d, n) => <option key={d} value={n + 1}>{d}</option>)}
            </select>
          </Campo>
          <Campo etiqueta="Empieza" error={errores[f.clave]?.desde}>
            <input className="campo__control" type="time" step={300} min="07:00" value={f.desde} onChange={(e) => cambiar(f.clave, 'desde', e.target.value)} />
          </Campo>
          <Campo etiqueta="Termina" error={errores[f.clave]?.hasta}>
            <input className="campo__control" type="time" step={300} min="07:00" value={f.hasta} onChange={(e) => cambiar(f.clave, 'hasta', e.target.value)} />
          </Campo>
          <Campo etiqueta="Aula" ayuda="Si querés" ayudaAlLado>
            <input className="campo__control" type="text" maxLength={40} value={f.aula} onChange={(e) => cambiar(f.clave, 'aula', e.target.value)} />
          </Campo>
          {/* With a blank label, so it lines up with the fields even when one shows its error. */}
          <div className="campo horario__editor-quitar">
            <span className="campo__etiqueta" aria-hidden="true">&nbsp;</span>
            <button type="button" className="boton boton--secundario boton--chico" aria-label={`Quitar la clase ${i + 1}`} onClick={() => quitarFila(f.clave)}>Quitar</button>
          </div>
        </fieldset>
      ))}
      {cabe && <button ref={botonFila} type="button" className="boton boton--secundario boton--chico horario__editor-sumar" onClick={sumarFila}>Sumar una clase</button>}
      <div className="horario__acciones">
        <button type="submit" className="boton">Guardar</button>
        <button type="button" className="boton boton--secundario" onClick={onCerrar}>Cancelar</button>
        {propias && <button type="button" className="horario__volver" onClick={volver}>Volver al horario de la facultad</button>}
      </div>
    </form>
  );
}

/** A subject in «Tus materias»: its commission, or «No la curso» and back for a campus course, or out for one added
 * from the schedules; and its classes, by hand. */
function FilaMateria({ item, datos, mio, letras, cuatri, conClases, editando, onEditar, onQuitada }) {
  const { avisar, confirmar } = useUI();
  const colorDe = useColorDeMateria();
  const fila = useRef(null);
  const botonEditar = useRef(null);
  const idDato = useId();
  const { curso, extra, nombre, codigo, origen, noLaCursa } = item;
  const opciones = useMemo(() => (curso ? comisionesCon(datos, curso.nombre) : comisionesDeLaMateria(datos, extra.materia)), [datos, curso, extra]);
  const conocida = !codigo || opciones.some((o) => o.codigo === codigo);
  // «No la curso» and «La curso» change the controls of the row: the focus goes to the new one.
  const alPrimero = () => requestAnimationFrame(() => fila.current?.querySelector('select, button')?.focus());

  const elegir = async (valor) => {
    const ok = await elegirComision(item, valor, confirmar);
    if (ok === null) return;
    if (!ok) return avisar(SIN_GUARDAR, 'error');
    if (valor === 'ninguna') {
      avisar(`${nombre} salió de tu semana.`);
      alPrimero();
    } else if (valor) avisar(`${nombre} quedó en ${valor}.`);
  };
  const volver = () => {
    if (!elegirComisionDe(curso.id, null)) return avisar(SIN_GUARDAR, 'error');
    avisar(`${nombre} volvió a tus materias.`);
    alPrimero();
  };
  const quitar = async () => {
    const seguro = await confirmar({ titulo: `¿Quitar ${nombre}?`, texto: 'Sale de tus materias y de tu semana.', boton: 'Quitar', peligro: true });
    if (!seguro) return;
    const siguiente = fila.current?.nextElementSibling;
    if (!quitarMateriaDeLaFacultad(extra.id)) return avisar(SIN_GUARDAR, 'error');
    avisar(`${nombre} salió de tus materias.`);
    // The row left with the focus in it: to the next one, once it's gone.
    requestAnimationFrame(() => onQuitada(siguiente));
  };
  const cerrarEditor = () => {
    onEditar(null);
    requestAnimationFrame(() => enfocar(botonEditar.current, fila.current?.querySelector('select, button')));
  };

  let dato = null;
  if (noLaCursa) dato = 'No la cursás.';
  else if (item.aMano) dato = 'Horarios cambiados a mano.';
  else if (!opciones.length) dato = curso ? 'No está en los horarios de la facultad.' : 'Ya no está en los horarios de la facultad.';
  else if (!codigo) dato = 'Elegí en qué comisión la cursás.';
  else if (origen === 'nombre') dato = 'Sale del nombre en el campus.';
  else if (conocida && !conClases) dato = 'No tiene clases este cuatrimestre.';

  // With no classes from the faculty nor by hand, the student loads them.
  const cargar = !item.aMano && !item.deLaFacultad.length;
  const idEditor = `${idDato}-editor`;
  return (
    <li ref={fila} className="horario__mat" data-clave={item.clave} data-materia={colorDe(curso?.id ?? extra.id)} data-fuera={noLaCursa ? '' : undefined}>
      <Simbolo id={curso?.id ?? extra.id} nombre={nombre} tamano="fila" />
      <span className="horario__mat-nombre">
        {nombre}
        {dato && <span id={idDato} className="horario__mat-dato">{dato}</span>}
      </span>
      <span className="horario__mat-acciones">
        {noLaCursa ? (
          <button type="button" className="boton boton--secundario boton--chico" aria-label={`La curso, ${nombre}`} onClick={volver}>La curso</button>
        ) : (
          <>
            {opciones.length > 0 && (
              <select className="campo__control" aria-label={`Comisión de ${nombre}`} aria-describedby={dato ? idDato : undefined} value={codigo ?? ''} onChange={(e) => elegir(e.target.value)}>
                <OpcionesDeComision opciones={opciones} codigo={codigo} conNoLaCurso={Boolean(curso)} letras={letras} />
              </select>
            )}
            <button
              ref={botonEditar}
              type="button"
              className="boton boton--secundario boton--chico"
              aria-label={cargar ? `Cargar a mano los horarios de ${nombre}` : `Cambiar los horarios de ${nombre}`}
              aria-expanded={editando}
              aria-controls={editando ? idEditor : undefined}
              onClick={() => (editando ? cerrarEditor() : onEditar(item.clave))}
            >
              {cargar ? 'Cargar a mano' : 'Cambiar los horarios'}
            </button>
            {curso && !opciones.length && <button type="button" className="boton boton--secundario boton--chico" aria-label={`No la curso, ${nombre}`} onClick={() => elegir('ninguna')}>No la curso</button>}
          </>
        )}
        {extra && <button type="button" className="boton boton--secundario boton--chico" aria-label={`Quitar ${nombre}`} onClick={quitar}>Quitar</button>}
      </span>
      {editando && !noLaCursa && (
        <div id={idEditor} className="horario__mat-editor">
          <EditorDeClases item={item} mio={mio} cuatri={cuatri} onCerrar={cerrarEditor} />
        </div>
      )}
    </li>
  );
}

/** A subject of the faculty's schedules the student takes without a campus course: found by its name, with its
 * commission. */
function SumarMateria({ datos, ya, letras, cuantas, onListo, onCancelar }) {
  const { avisar } = useUI();
  const id = useId();
  const [busca, setBusca] = useState('');
  const [materia, setMateria] = useState('');
  const [comision, setComision] = useState('');
  const [errores, setErrores] = useState({});
  const primero = useRef(null);

  useEffect(() => {
    primero.current?.focus();
  }, []);

  const todas = useMemo(() => materiasDeLosHorarios(datos).filter((m) => !ya.has(m)), [datos, ya]);
  const filtradas = useMemo(() => {
    const palabras = normalizar(busca).split(/\s+/).filter(Boolean);
    return todas.filter((m) => palabras.every((p) => normalizar(m).includes(p)));
  }, [todas, busca]);
  const opciones = useMemo(() => (materia ? comisionesDeLaMateria(datos, materia) : []), [datos, materia]);

  const elegirComision = (codigo) => {
    setComision(codigo);
    setErrores((e) => ({ ...e, comision: undefined }));
  };
  const elegirMateria = (nombre) => {
    setMateria(nombre);
    setErrores((e) => ({ ...e, materia: undefined }));
    const suyas = nombre ? comisionesDeLaMateria(datos, nombre) : [];
    setComision(suyas.length === 1 ? suyas[0].codigo : '');
  };
  const buscar = (texto) => {
    setBusca(texto);
    // When the search leaves only one, that's the one.
    const palabras = normalizar(texto).split(/\s+/).filter(Boolean);
    const quedan = todas.filter((m) => palabras.every((p) => normalizar(m).includes(p)));
    if (palabras.length && quedan.length === 1 && !materia) elegirMateria(quedan[0]);
  };

  const guardar = (e) => {
    e.preventDefault();
    const nuevos = {};
    if (cuantas >= MAX_MATERIAS_DE_LA_FACULTAD) nuevos.materia = `Ya sumaste ${MAX_MATERIAS_DE_LA_FACULTAD}, el máximo. Quitá una para sumar otra.`;
    else if (!materia) nuevos.materia = filtradas.length ? 'Elegí una materia de la lista.' : 'Ninguna se llama así. Probá con otra palabra.';
    else if (opciones.length && !comision) nuevos.comision = 'Elegí en qué comisión la cursás.';
    setErrores(nuevos);
    if (Object.keys(nuevos).length) {
      const formulario = e.currentTarget;
      requestAnimationFrame(() => formulario.querySelector('[aria-invalid="true"]')?.focus());
      return;
    }
    if (!sumarMateriaDeLaFacultad(materia, comision || null)) {
      avisar(SIN_GUARDAR, 'error');
      return;
    }
    avisar(`${materia} quedó en tus materias.`);
    onListo();
  };

  // The chosen one stays in the list even if the search leaves it out.
  const enLaLista = materia && !filtradas.includes(materia) ? [materia, ...filtradas] : filtradas;
  return (
    <form className="horario__sumar" aria-label="Sumar una materia de los horarios" aria-describedby={`${id}-ayuda`} onSubmit={guardar} noValidate>
      <p id={`${id}-ayuda`} className="horario__sumar-ayuda">Para las que cursás sin curso en el campus.</p>
      <div className="horario__campos">
        <Campo etiqueta="Buscar" ayuda="Por ejemplo, calidad" ayudaAlLado>
          <input ref={primero} className="campo__control" type="search" enterKeyHint="search" autoComplete="off" value={busca} onChange={(e) => buscar(e.target.value)} />
        </Campo>
        <Campo etiqueta="Materia" error={errores.materia}>
          <select className="campo__control" value={materia} onChange={(e) => elegirMateria(e.target.value)}>
            <option value="">{filtradas.length ? `Elegí una (${filtradas.length})` : 'Ninguna se llama así'}</option>
            {enLaLista.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Comisión" error={errores.comision}>
          <select className="campo__control" value={comision} disabled={!materia} onChange={(e) => elegirComision(e.target.value)}>
            <option value="">{materia ? 'Elegí la comisión' : 'Primero, la materia'}</option>
            <ListaDeComisiones opciones={opciones} letras={letras} />
          </select>
        </Campo>
      </div>
      <div className="horario__acciones">
        <button type="submit" className="boton">Sumar</button>
        <button type="button" className="boton boton--secundario" onClick={onCancelar}>Cancelar</button>
      </div>
    </form>
  );
}

export default function Horario() {
  useSeo({ titulo: tituloDe('Tu horario'), noindex: true });
  const mio = useMio();
  const ahora = useAhora();
  const hoy = hoyClave(ahora);
  const [cuatri, setCuatri] = useState(() => cuatrimestreQueSigue(hoyClave()));
  const [elegida, setElegida] = useState(null);
  // The subject of «Tus materias» whose classes are being changed by hand, by its `clave`.
  const [editando, setEditando] = useState(null);
  const [sumando, setSumando] = useState(false);
  const raiz = useRef(null);
  const titulo = useRef(null);
  const tituloMaterias = useRef(null);
  const botonMateria = useRef(null);
  const estrecho = useEstrecho(raiz);
  const elegirCuatri = (n) => {
    setCuatri(n);
    setElegida(null);
    setEditando(null);
  };
  useAtajosDePagina({ 1: () => elegirCuatri(1), 2: () => elegirCuatri(2) });

  const { datos, error, cargando, recargar } = useConsulta(async () => {
    await cargarPerfil();
    const [{ enCurso }, horarios] = await Promise.all([cargarMaterias(), cargarHorarios()]);
    return { cursos: enCurso, horarios };
  }, [], { alInstante: true });
  // Without the campus, the week still has the subjects added from the schedules, and their classes can be changed.
  const sinCampus = Boolean(error && !datos);
  const { datos: horariosSolos } = useConsulta(() => (sinCampus ? cargarHorarios() : null), [sinCampus]);
  const horarios = datos?.horarios ?? horariosSolos ?? null;
  const cursos = datos?.cursos ?? SIN_CURSOS;

  const semana = useMemo(() => (horarios ? armarSemana({ datos: horarios, cursos, mio, cuatrimestre: cuatri }) : null), [horarios, cursos, mio, cuatri]);
  // The student's careers, so their commissions come first where a subject is in several.
  const letras = useMemo(() => letrasDelAlumno(mio, cursos), [mio, cursos]);
  // The subjects that are already the student's, out of the ones to add.
  const ya = useMemo(() => new Set([
    ...(mio.horario?.extras ?? []).map((x) => x.materia),
    ...cursos.map((c) => materiaDelCurso(horarios, c.nombre)).filter(Boolean),
  ]), [mio, cursos, horarios]);
  // Without the campus its courses aren't known: adding one now could repeat one of them.
  const hayParaSumar = useMemo(() => Boolean(datos) && materiasDeLosHorarios(horarios).some((m) => !ya.has(m)), [datos, horarios, ya]);

  const clase = semana?.clases.find((c) => c.id === elegida) ?? null;
  const claveDe = (c) => (c.cursoId ? `c${c.cursoId}` : `x${c.extra}`);
  const itemDe = (c) => semana?.materias.find((m) => m.clave === claveDe(c)) ?? null;
  const filaDe = (clave) => document.querySelector(`.horario__mat[data-clave="${clave}"]`);
  const cerrarDetalle = () => {
    const id = elegida;
    const suya = clase && claveDe(clase);
    setElegida(null);
    // Back to its class or, when it left the week (in another commission, or not taken), to its subject's row.
    requestAnimationFrame(() => enfocar(document.getElementById(`clase-${id}`), suya && filaDe(suya)?.querySelector('select, button'), titulo.current));
  };
  const cerrarSumando = () => {
    setSumando(false);
    // With the last one added, the button goes: to the title.
    requestAnimationFrame(() => enfocar(botonMateria.current, tituloMaterias.current));
  };

  const enEsteCuatri = cuatrimestreEl(hoy) === cuatri;
  const libre = sinClasesEl(hoy);
  const { ahora: enCurso, despues } = semana && enEsteCuatri && !libre ? ahoraYDespues(semana.clases, ahora) : { ahora: null, despues: null };
  const ciclo = cicloDe(horarios, letras);
  const viejo = horarios && (calendarioViejo(hoy) || ciclo < Number(hoy.slice(0, 4)) && hoy.slice(5) >= '03-01');
  const carreras = horarios?.carreras ?? [];
  const conComision = semana?.materias.some((m) => m.codigo && !m.noLaCursa);
  const detalle = clase && (
    <Detalle
      key={clase.id}
      clase={clase}
      datos={horarios}
      item={itemDe(clase)}
      mio={mio}
      letras={letras}
      onEditar={(clave) => {
        setElegida(null);
        setEditando(clave);
      }}
      onCerrar={cerrarDetalle}
    />
  );

  return (
    <div ref={raiz} className="contenedor pagina horario">
      <div className="titular">
        <h1 ref={titulo} tabIndex={-1}>Tu horario</h1>
      </div>

      {error && !datos && <ErrorConReintento texto={error} recargar={recargar} />}
      {cargando && !datos && <Cargando texto="Armando tu semana" />}

      {semana && (
        <>
          {libre && <p className="horario__aviso">{libre.tipo === 'receso' ? `Estás en el ${libre.titulo.toLocaleLowerCase('es')}.` : `${libre.titulo}, hoy no hay clases.`}</p>}
          {viejo && (
            <p className="horario__aviso" data-tono="viejo">
              Estos horarios son del {ciclo}. Cuando la facultad publique los nuevos, aparecen acá. Mientras, podés cambiarlos a mano en Tus materias.
            </p>
          )}

          <div className="horario__barra">
            <div className="horario__cuatri">
              <span id="horario-cuatri" className="campo__etiqueta">Cuatrimestre</span>
              <div className="tipos" role="group" aria-labelledby="horario-cuatri">
                {[1, 2].map((n) => (
                  <button key={n} type="button" className="tipos__opcion" aria-pressed={cuatri === n} onClick={() => elegirCuatri(n)}>
                    {n === 1 ? 'Primero' : 'Segundo'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Always there, so a reader hears when it changes. */}
          <p className="horario__ya" role="status">
            {enCurso && <span>Estás en {enCurso.materia} {hastaLas(enCurso.hasta)}{enCurso.aula ? `, en ${enCurso.aula}` : ''}.</span>}
            {despues && <span>{enCurso ? 'Después tenés' : 'Hoy tenés'} {despues.materia} {aLas(despues.desde)}{despues.aula ? `, en ${despues.aula}` : ''}.</span>}
          </p>
        </>
      )}

      {semana?.clases.length > 0 && <Semana clases={semana.clases} hoy={enEsteCuatri} ahora={ahora} elegida={elegida} onElegir={setElegida} detalle={estrecho ? detalle : null} />}
      {!estrecho && detalle}

      {semana && (
        <>
          {datos && !semana.clases.length && (
            <div className="bloque horario__vacio">
              <h2>Tu semana está vacía</h2>
              <p>{conComision ? 'Este cuatrimestre no hay clases en las comisiones que elegiste. Mirá el otro, o cargalas a mano en Tus materias.' : 'Elegí la comisión de cada materia en Tus materias, o cargá sus horarios a mano.'}</p>
            </div>
          )}

          {(datos || semana.materias.length > 0) && (
            <section className="bloque horario__materias" aria-labelledby="horario-materias">
              <h2 id="horario-materias" ref={tituloMaterias} tabIndex={-1}>Tus materias</h2>
              {semana.materias.length > 0 && (
                <ul className="horario__mat-lista">
                  {semana.materias.map((m) => (
                    <FilaMateria
                      key={m.clave}
                      item={m}
                      datos={horarios}
                      mio={mio}
                      letras={letras}
                      cuatri={cuatri}
                      conClases={semana.clases.some((c) => (m.curso ? c.cursoId === m.curso.id : c.extra === m.extra.id))}
                      editando={editando === m.clave}
                      onEditar={setEditando}
                      onQuitada={(siguiente) => enfocar(siguiente?.querySelector('select, button'), tituloMaterias.current)}
                    />
                  ))}
                </ul>
              )}
              {hayParaSumar && (
                <button ref={botonMateria} type="button" className="boton boton--secundario boton--chico horario__otra" aria-expanded={sumando} onClick={() => (sumando ? cerrarSumando() : setSumando(true))}>
                  Sumar una materia de los horarios
                </button>
              )}
              {sumando && hayParaSumar && <SumarMateria datos={horarios} ya={ya} letras={letras} cuantas={mio.horario?.extras?.length ?? 0} onListo={cerrarSumando} onCancelar={cerrarSumando} />}
            </section>
          )}

          {/* With the campus there: without it, its courses would be missing from the link. */}
          {datos && <CompartirHorario datos={horarios} cursos={cursos} mio={mio} />}

          <footer className="horario__fuente">
            <p>Horarios {ciclo} de cada carrera, revisados el {fechaLarga(horarios.revisado)}.</p>
            {!calendarioViejo(hoy) && <p>Los días sin clases salen del calendario académico {CALENDARIO.ciclo}.</p>}
            {carreras.length > 0 && (
              <details className="horario__otros">
                <summary>De dónde salen</summary>
                <ul>
                  {carreras.map((c) => {
                    const nota = notaDeCarrera(horarios, c);
                    return (
                      <li key={c.letra}>
                        <a href={c.pagina} target="_blank" rel="noreferrer">{CARRERAS[c.letra]?.nombre ?? 'Otra carrera'}<span className="solo-lectores">, se abre en otra pestaña</span></a>
                        {nota && <span className="horario__otros-nota">{nota}</span>}
                      </li>
                    );
                  })}
                </ul>
              </details>
            )}
          </footer>
        </>
      )}
    </div>
  );
}
