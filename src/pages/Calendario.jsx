import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Evento from '../components/Evento';
import { ContenidoDelDia, deLaFacultad, diaConTodo, sinLoDeLaCasilla } from '../components/DiaDelCalendario';
import { BotonCalendarioGoogle, EstadoCalendarioGoogle } from '../components/CalendarioGoogle';
import { useCalendarioGoogle } from '../lib/calendarioSincro';
import { Cargando, ErrorConReintento } from '../components/Filas';
import FormFecha from '../components/FormFecha';
import { IconoHecha } from '../components/Hecha';
import Simbolo from '../components/Simbolo';
import { useUI } from '../components/ui';
import { cambiarAjustes, useAjustes, useVista } from '../lib/ajustes';
import { useAtajosDePagina } from '../lib/atajos';
import { guardarArchivo } from '../lib/archivos';
import { cargarMes, cargarNombres } from '../lib/campus';
import { eventosDeLaFacultad, marcaDelDia } from '../lib/facultad';
import { armarIcs, armarMes, claveDeFecha, claveDia, diaEnTexto, esClaveDeDia, fecha, fechaDeClave, mesEnTexto, porDia } from '../lib/datos';
import {
  agregarEvento, borradasDelCampus, borrarEvento, cambiarEvento, conCorrecciones, corregirDelCampus, eventosPropios, MAX_EVENTOS, useMio, volverAlCampus,
} from '../lib/mio';
import { sinMovimiento } from '../lib/movimiento';
import { tituloDe, useSeo } from '../lib/seo';
import { conHechas } from '../lib/hechas';
import { textoDeTipo, tipoDe } from '../lib/tipos';
import { fueraDeHoy } from '../lib/hoy';
import { useConsulta } from '../lib/useConsulta';
import { fechasDe } from '../lib/classroom';
import { cargarClassroomUnido } from '../lib/classroomUnido';
import { useGoogle } from '../lib/google';
import './panel.css';

// The academic calendar's dates: the same for everyone, made once.
const DE_LA_FACULTAD = eventosDeLaFacultad();
const DIAS = [['Lun', 'Lunes'], ['Mar', 'Martes'], ['Mié', 'Miércoles'], ['Jue', 'Jueves'], ['Vie', 'Viernes'], ['Sáb', 'Sábado'], ['Dom', 'Domingo']];
const mayuscula = (t) => t.charAt(0).toLocaleUpperCase('es') + t.slice(1);
const claveValida = (t) => (esClaveDeDia(t) ? t : null);
const facultadAlFinal = (a, b) => deLaFacultad(a) - deLaFacultad(b) || a.cuando - b.cuando;
const cambiable = (e, onCambiar) => (e.propio === 'evento' ? onCambiar : undefined);

function Celda({ celda, eventos: todos, marca, hoy, elegida, onElegir }) {
  const eventos = marca ? sinLoDeLaCasilla(todos) : todos;
  return (
    <td>
      <button
        type="button"
        className="cal__dia"
        data-fuera={celda.delMes ? undefined : ''}
        data-hoy={celda.clave === hoy ? '' : undefined}
        data-facultad={marca?.tipo}
        aria-pressed={elegida}
        aria-label={diaConTodo(celda.clave, eventos, marca)}
        aria-current={celda.clave === hoy ? 'date' : undefined}
        onClick={() => onElegir(celda.clave)}
      >
        <ContenidoDelDia numero={celda.dia} eventos={eventos} marca={marca} />
      </button>
    </td>
  );
}

// What a phone's cell paints, said once under the grid: the kinds' dots and the academic calendar's days.
const MARCAS = [['libre', 'Sin clases'], ['examen', 'Mesas de examen'], ['cuatrimestre', 'Fin del cuatrimestre']];

function Leyenda({ semanas, dias, conFacultad }) {
  const tipos = new Set();
  const marcas = new Set();
  let hechas = false;
  for (const celda of semanas.flat()) {
    if (!celda.delMes) continue;
    const marca = conFacultad ? marcaDelDia(celda.clave) : null;
    if (marca) marcas.add(marca.tipo);
    for (const e of marca ? sinLoDeLaCasilla(dias[celda.clave] ?? []) : dias[celda.clave] ?? []) {
      tipos.add(tipoDe(e));
      if (e.hecha) hechas = true;
    }
  }
  const items = [
    ...['parcial', 'final', 'entrega'].filter((t) => tipos.has(t)).map((t) => <li key={t}><span className="cal-leyenda__punto" data-tipo={t} />{textoDeTipo(t)}</li>),
    ...(hechas ? [<li key="hecha"><span className="cal-leyenda__punto" data-hecha="" />Hecha</li>] : []),
    ...MARCAS.filter(([t]) => marcas.has(t)).map(([t, texto]) => <li key={t}><span className="cal-leyenda__dia" data-facultad={t} />{texto}</li>),
  ];
  // Only on a phone (panel.css): on a wider screen each cell says it in words. Screen readers get it from each day.
  return items.length > 0 && <ul className="cal-leyenda" aria-hidden="true">{items}</ul>;
}

function VistaMes({ semanas, anio, mes, dias, hoy, dia, onElegir, conFacultad }) {
  return (
    <div>
      <table className="cal">
        <caption className="solo-lectores">{mesEnTexto(anio, mes)}</caption>
        <thead>
          <tr>{DIAS.map(([corto, largo]) => <th key={corto} scope="col"><abbr title={largo}>{corto}</abbr></th>)}</tr>
        </thead>
        <tbody>
          {semanas.map((semana) => (
            <tr key={semana[0].clave}>
              {semana.map((celda) => (
                <Celda key={celda.clave} celda={celda} eventos={dias[celda.clave] ?? []} marca={conFacultad ? marcaDelDia(celda.clave) : null} hoy={hoy} elegida={celda.clave === dia} onElegir={onElegir} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <Leyenda semanas={semanas} dias={dias} conFacultad={conFacultad} />
    </div>
  );
}

// The arrows of the month on a phone, where the words don't fit next to it (panel.css). The button's name says it.
const Flecha = ({ izquierda }) => (
  <svg className="cal__flecha" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
    <path d={izquierda ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function VistaSemana({ semana, dias, hoy, dia, onElegir, onCambiar, onCorregir, aGoogle, conFacultad }) {
  return (
    <ol className="cal-semana">
      {semana.map((celda, i) => {
        const marca = conFacultad ? marcaDelDia(celda.clave) : null;
        const eventos = marca ? sinLoDeLaCasilla(dias[celda.clave] ?? []) : dias[celda.clave] ?? [];
        return (
          <li key={celda.clave} className="cal-semana__dia" data-hoy={celda.clave === hoy ? '' : undefined} data-elegido={celda.clave === dia ? '' : undefined} data-facultad={marca?.tipo}>
            <button type="button" className="cal-semana__cabeza" aria-pressed={celda.clave === dia} aria-current={celda.clave === hoy ? 'date' : undefined} aria-label={diaConTodo(celda.clave, eventos, marca)} onClick={() => onElegir(celda.clave)}>
              <span>{DIAS[i][0]}</span>
              <span className="cal__numero">{celda.dia}</span>
            </button>
            {marca && <p className="cal__marca">{marca.titulo}</p>}
            {eventos.length > 0 && <ul className="eventos">{eventos.map((e) => <Evento key={e.id} evento={e} onCambiar={cambiable(e, onCambiar)} onCorregir={onCorregir} aGoogle={aGoogle} />)}</ul>}
          </li>
        );
      })}
    </ol>
  );
}

function VistaAgenda({ eventos, onCambiar, onCorregir, aGoogle }) {
  const grupos = useMemo(() => {
    const ordenados = [...eventos].sort((a, b) => a.cuando - b.cuando);
    const salida = new Map();
    for (const e of ordenados) {
      const clave = claveDia(e.cuando);
      if (!salida.has(clave)) salida.set(clave, []);
      salida.get(clave).push(e);
    }
    return [...salida.entries()].map(([clave, delDia]) => [clave, delDia.sort(facultadAlFinal)]);
  }, [eventos]);
  return (
    <div className="cal-agenda">
      {grupos.map(([clave, delDia]) => (
        <section key={clave} className="bloque">
          <h2>{mayuscula(diaEnTexto(clave))}</h2>
          <ul className="eventos">{delDia.map((e) => <Evento key={e.id} evento={e} onCambiar={cambiable(e, onCambiar)} onCorregir={onCorregir} aGoogle={aGoogle} />)}</ul>
        </section>
      ))}
    </div>
  );
}

export default function Calendario() {
  useSeo({ titulo: tituloDe('Calendario'), noindex: true });
  const [parametros, setParametros] = useSearchParams();
  const [hoy] = useState(() => claveDeFecha(new Date()));
  const [ahora] = useState(() => Math.floor(Date.now() / 1000));
  const vista = useVista('calendario');
  // The filters stay on this device, and Hoy's week follows them.
  const { facultad: conFacultad, calSoloVencimientos: soloVencimientos, calMateria: materia } = useAjustes();
  const mio = useMio();
  // The courses the student took out of Hoy and here (hoy.js): Google Calendar still gets their dates.
  const fuera = useMemo(() => fueraDeHoy(mio), [mio]);
  const { avisar } = useUI();
  // Linked, the student's own dates already go to Google by themselves: no link on each one.
  const calGoogle = useCalendarioGoogle();
  const aGoogle = !calGoogle.prendido;
  // On a phone «Agregar una fecha» goes alone and the rest behind «…», open until closed (panel.css hides it on a
  // computer, where all go in a row).
  const [masAbierto, setMasAbierto] = useState(false);
  const mas = useRef(null);
  useEffect(() => {
    if (!masAbierto) return undefined;
    const fuera = (e) => {
      if (!mas.current?.contains(e.target)) setMasAbierto(false);
    };
    const tecla = (e) => {
      if (e.key !== 'Escape') return;
      setMasAbierto(false);
      mas.current?.querySelector('.cal-acciones__mas')?.focus();
    };
    document.addEventListener('pointerdown', fuera);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('pointerdown', fuera);
      document.removeEventListener('keydown', tecla);
    };
  }, [masAbierto]);
  // null, 'nueva' or the own date being changed.
  const [editando, setEditando] = useState(null);
  const botonAgregar = useRef(null);
  const titulo = useRef(null);

  const dia = claveValida(parametros.get('dia')) ?? hoy;
  const elegir = (clave) => setParametros(clave === hoy ? {} : { dia: clave }, { replace: true });
  const [anio, mes] = dia.split('-').map(Number);
  const semanas = useMemo(() => armarMes(anio, mes), [anio, mes]);
  const semana = useMemo(() => semanas.find((s) => s.some((c) => c.clave === dia)) ?? semanas[0], [semanas, dia]);

  // A week can span two months.
  const meses = vista === 'semana' ? [...new Set(semana.map((c) => c.clave.slice(0, 7)))] : [dia.slice(0, 7)];
  const { datos, error, cargando, recargar } = useConsulta(async () => {
    const [listas, nombres] = await Promise.all([
      Promise.all(meses.map((m) => cargarMes(Number(m.slice(0, 4)), Number(m.slice(5, 7))))),
      cargarNombres(),
    ]);
    return { eventos: listas.flat(), nombres };
  }, [meses.join()]);
  // The skeleton stands in for the calendar only until its first answer, never next to it: an empty grid under it read
  // as a second calendar. Later loads (another month) keep what's on screen, and after an error the grid stays, with
  // the student's own dates.
  const esperando = cargando && !datos && !error;

  const enRango = useMemo(() => {
    if (vista === 'semana') {
      const claves = new Set(semana.map((c) => c.clave));
      return (e) => claves.has(claveDia(e.cuando));
    }
    const prefijo = dia.slice(0, 7);
    return (e) => claveDia(e.cuando).startsWith(prefijo);
  }, [vista, semana, dia]);

  // Classroom's tasks with a date, with Google already connected: here it never asks.
  const google = useGoogle();
  const classroom = useConsulta(async () => (google.conectado ? cargarClassroomUnido() : []), [google.conectado]);
  const deClassroom = useMemo(() => (classroom.datos ?? []).flatMap((u) => fechasDe(u.datos, u.entregadas, u.materia)), [classroom.datos]);

  // The campus' dates as the student left them: corrected or deleted here, the campus stays as it is.
  const todos = useMemo(
    () => [...conHechas([...conCorrecciones(datos?.eventos ?? [], mio, datos?.nombres), ...deClassroom], mio), ...eventosPropios(mio, datos?.nombres), ...(conFacultad ? DE_LA_FACULTAD : [])].filter((e) => enRango(e) && !fuera.has(Number(e.materiaId))),
    [datos, deClassroom, mio, enRango, conFacultad, fuera],
  );
  const borradas = useMemo(() => borradasDelCampus(datos?.eventos ?? [], mio).filter((e) => enRango(e) && !fuera.has(Number(e.materiaId))).sort((a, b) => a.cuando - b.cuando), [datos, mio, enRango, fuera]);

  const materias = useMemo(() => {
    const vistas = new Map(todos.filter((e) => e.materiaId).map((e) => [e.materiaId, e.materia]));
    return [...vistas.entries()].sort((a, b) => a[1].localeCompare(b[1], 'es'));
  }, [todos]);

  const materiaActiva = materias.some(([id]) => String(id) === materia) ? materia : '';
  const filtrados = useMemo(() => todos.filter((e) => (!materiaActiva || String(e.materiaId) === materiaActiva) && (!soloVencimientos || e.vencimiento)), [todos, materiaActiva, soloVencimientos]);
  const dias = useMemo(() => porDia(filtrados), [filtrados]);
  // «Todo el mes» without the exam days of the academic calendar: they are every day of each call, and the grid
  // already paints them.
  const delMes = useMemo(() => filtrados.filter((e) => !(e.enLaCasilla && e.tipo === 'final')).sort(facultadAlFinal), [filtrados]);
  const delDia = useMemo(() => [...(dias[dia] ?? [])].sort(facultadAlFinal), [dias, dia]);

  // The chosen day's detail goes under the month's grid: a day tapped there brings it into sight if it isn't. Only the
  // page moves, the focus stays on the day. Smooth unless the system or the site's settings ask for less motion.
  const detalleDelDia = useRef(null);
  const bajarAlDetalle = useRef(false);
  const mostrarDetalle = () => {
    const quieto = sinMovimiento() || ['reducido', 'ninguno'].includes(document.documentElement.dataset.movimiento);
    detalleDelDia.current?.scrollIntoView({ block: 'nearest', behavior: quieto ? 'auto' : 'smooth' });
  };
  const elegirEnLaGrilla = (clave) => {
    if (clave === dia) {
      mostrarDetalle();
      return;
    }
    bajarAlDetalle.current = true;
    elegir(clave);
  };
  // After the new day is drawn, so the page goes to its real height.
  useEffect(() => {
    if (!bajarAlDetalle.current) return;
    bajarAlDetalle.current = false;
    mostrarDetalle();
  });

  const mover = (salto) => {
    if (vista === 'semana') {
      const destino = fechaDeClave(dia);
      destino.setDate(destino.getDate() + 7 * salto);
      elegir(claveDeFecha(destino));
      return;
    }
    const clave = claveDeFecha(new Date(anio, mes - 1 + salto, 1));
    elegir(clave.slice(0, 7) === hoy.slice(0, 7) ? hoy : clave);
  };

  useAtajosDePagina({
    ArrowLeft: () => mover(-1),
    ArrowRight: () => mover(1),
    t: () => {
      elegir(hoy);
      titulo.current?.focus();
    },
  });

  const bajar = () => {
    const blob = new Blob([armarIcs(filtrados, ahora)], { type: 'text/calendar;charset=utf-8' });
    guardarArchivo(blob, `campus-${dia.slice(0, 7)}.ics`);
  };

  // Every course the student has, for the form: not only the ones with dates this month.
  const materiasDelForm = useMemo(
    () => Object.entries(datos?.nombres ?? {}).map(([id, nombre]) => [Number(id), nombre]).sort((a, b) => a[1].localeCompare(b[1], 'es')),
    [datos],
  );

  const cerrarForm = () => {
    setEditando(null);
    requestAnimationFrame(() => botonAgregar.current?.focus());
  };
  const corregir = (evento) => setEditando({ ...evento, delCampus: true });
  const guardar = (evento) => {
    if (editando?.delCampus) {
      if (!corregirDelCampus(evento.id, evento)) {
        avisar('No se pudo guardar. Fijate si el navegador deja guardar datos.', 'error');
        return;
      }
      const clave = claveDia(evento.cuando);
      cerrarForm();
      elegir(clave);
      avisar('Fecha corregida.');
      return;
    }
    const nueva = editando === 'nueva';
    if (nueva && mio.eventos.length >= MAX_EVENTOS) {
      avisar(`Ya tenés ${MAX_EVENTOS} fechas tuyas. Borrá alguna vieja para sumar otra.`, 'error');
      return;
    }
    if (!(nueva ? agregarEvento(evento) : cambiarEvento(evento.id, evento))) {
      avisar('No se pudo guardar. Fijate si el navegador deja guardar datos.', 'error');
      return;
    }
    const clave = claveDia(evento.cuando);
    cerrarForm();
    elegir(clave);
    avisar(nueva ? `Fecha guardada para el ${diaEnTexto(clave)}.` : 'Cambios guardados.');
  };
  const borrar = (id) => {
    if (editando?.delCampus) corregirDelCampus(id, { borrado: true });
    else borrarEvento(id);
    cerrarForm();
    avisar('Fecha borrada.');
  };
  const volver = (id) => {
    volverAlCampus(id);
    cerrarForm();
    avisar('La fecha quedó como en el campus.');
  };
  const mostrar = (evento) => {
    volverAlCampus(evento.id);
    avisar(`«${evento.titulo}» volvió al calendario.`);
  };

  const periodo = vista === 'semana' ? `Semana del ${diaEnTexto(semana[0].clave)}` : mayuscula(mesEnTexto(anio, mes));

  return (
    <div className="contenedor pagina calendario" data-vista={vista}>
      <div className="titular">
        <h1>Calendario</h1>
        <div className="titular__botones cal-acciones">
          <button ref={botonAgregar} type="button" className="boton boton--chico" aria-expanded={editando === 'nueva'} onClick={() => setEditando('nueva')}>Agregar una fecha</button>
          {(filtrados.length > 0 || calGoogle.disponible) && (
            <div
              ref={mas}
              className="cal-acciones__resto"
              data-abierto={masAbierto ? '' : undefined}
              // Leaving it with Tab closes it, and so does choosing one of its actions (focus back on «…»). A tap leaves no
              // relatedTarget (Safari on iPhone doesn't focus buttons), so a tap outside closes it on pointerdown instead.
              onBlur={(e) => {
                if (masAbierto && e.relatedTarget && !mas.current?.contains(e.relatedTarget)) setMasAbierto(false);
              }}
              onClick={(e) => {
                if (!masAbierto || !e.target.closest('.cal-acciones__menu button')) return;
                setMasAbierto(false);
                mas.current?.querySelector('.cal-acciones__mas')?.focus();
              }}
            >
              <button type="button" className="boton boton--secundario boton--chico cal-acciones__mas" aria-label="Más acciones" aria-expanded={masAbierto} aria-controls="cal-acciones-menu" onClick={() => setMasAbierto((v) => !v)}>
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
              </button>
              <div id="cal-acciones-menu" className="cal-acciones__menu">
                {filtrados.length > 0 && <button type="button" className="boton boton--secundario boton--chico" onClick={bajar}>Bajar para tu calendario</button>}
                <BotonCalendarioGoogle />
              </div>
            </div>
          )}
        </div>
      </div>

      <EstadoCalendarioGoogle />

      <div className="cal__controles">
        <div className="cal__mes">
          <button type="button" className="boton boton--secundario boton--chico cal__paso" aria-label={`${vista === 'semana' ? 'Semana' : 'Mes'} anterior`} onClick={() => mover(-1)}>
            <Flecha izquierda />
            <span className="cal__paso-texto">Anterior</span>
          </button>
          <h2 ref={titulo} tabIndex={-1} aria-live="polite">{periodo}</h2>
          <button type="button" className="boton boton--secundario boton--chico cal__paso" aria-label={`${vista === 'semana' ? 'Semana' : 'Mes'} siguiente`} onClick={() => mover(1)}>
            <span className="cal__paso-texto">Siguiente</span>
            <Flecha />
          </button>
          {/* «Hoy» goes away once used: focus moves to the period instead of getting lost. */}
          {dia !== hoy && <button type="button" className="boton boton--secundario boton--chico cal__hoy" onClick={() => { elegir(hoy); titulo.current?.focus(); }}>Hoy</button>}
        </div>
        <div className="cal__filtros">
          <label className="cal__materia">
            Materia
            <select className="campo__control" value={materiaActiva} onChange={(e) => cambiarAjustes({ calMateria: e.target.value })}>
              <option value="">Todas</option>
              {materias.map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
            </select>
          </label>
          <label className="opcion">
            <input type="checkbox" checked={soloVencimientos} onChange={(e) => cambiarAjustes({ calSoloVencimientos: e.target.checked })} />
            Solo vencimientos
          </label>
          <label className="opcion">
            <input type="checkbox" checked={conFacultad} onChange={(e) => cambiarAjustes({ facultad: e.target.checked })} />
            Calendario académico
          </label>
          {fuera.size > 0 && (
            <p className="cal__fuera">
              {`${fuera.size === 1 ? 'Sacaste una materia' : `Sacaste ${fuera.size} materias`} de acá. `}
              <Link to="/configuracion#materias-en-hoy">Cambiar</Link>
            </p>
          )}
        </div>
      </div>

      {editando && (
        <FormFecha
          key={editando === 'nueva' ? 'nueva' : `${editando.delCampus ? 'c' : ''}${editando.id}`}
          evento={editando === 'nueva' ? null : editando}
          delCampus={Boolean(editando.delCampus)}
          dia={dia}
          materias={materiasDelForm}
          onGuardar={guardar}
          onBorrar={borrar}
          onVolver={volver}
          onCancelar={cerrarForm}
        />
      )}

      {error && <ErrorConReintento texto={error} recargar={recargar} />}
      {esperando && <Cargando texto="Buscando tus fechas" forma={vista === 'mes' ? 'calendario' : 'filas'} />}

      {!esperando && vista === 'semana' && <VistaSemana semana={semana} dias={dias} hoy={hoy} dia={dia} onElegir={elegir} onCambiar={setEditando} onCorregir={corregir} aGoogle={aGoogle} conFacultad={conFacultad} />}
      {!esperando && vista === 'agenda' && <VistaAgenda eventos={filtrados} onCambiar={setEditando} onCorregir={corregir} aGoogle={aGoogle} />}
      {!esperando && vista === 'mes' && (
        <div className="cal__cuerpo" aria-busy={cargando ? 'true' : undefined}>
          <VistaMes semanas={semanas} anio={anio} mes={mes} dias={dias} hoy={hoy} dia={dia} onElegir={elegirEnLaGrilla} conFacultad={conFacultad} />
          <div className="cal__detalle">
            <section ref={detalleDelDia} className="bloque" aria-live="polite">
              <h2>{mayuscula(diaEnTexto(dia))}</h2>
              {delDia.length
                ? <ul className="eventos">{delDia.map((e) => <Evento key={e.id} evento={e} onCambiar={cambiable(e, setEditando)} onCorregir={corregir} aGoogle={aGoogle} />)}</ul>
                : <p className="cal__vacio">{cargando ? 'Buscando las fechas de este mes.' : 'No hay nada este día.'}</p>}
            </section>
            {delMes.length > 0 && (
              <section className="bloque">
                <h2>Todo el mes</h2>
                <ul className="eventos">
                  {delMes.filter((e) => claveDia(e.cuando) !== dia).map((e) => <Evento key={e.id} evento={e} conFecha onCambiar={cambiable(e, setEditando)} onCorregir={corregir} aGoogle={aGoogle} />)}
                </ul>
                {delMes.every((e) => claveDia(e.cuando) === dia) && <p className="cal__vacio">No hay otras fechas este mes.</p>}
              </section>
            )}
          </div>
        </div>
      )}
      {datos && !cargando && !error && !filtrados.length && vista !== 'mes' && <p className="cal__vacio">{todos.length ? 'Ningún evento coincide con esos filtros.' : 'No hay fechas en este período.'}</p>}
      {datos && !cargando && !error && !filtrados.length && vista === 'mes' && <p className="cal__vacio">{todos.length ? 'Ningún evento coincide con esos filtros.' : 'El campus no tiene fechas este mes.'}</p>}

      {/* The campus' dates deleted here, closed: each one can come back. */}
      {borradas.length > 0 && (
        <details className="bloque cal__borradas">
          <summary>{borradas.length === 1 ? 'Una fecha del campus que borraste' : `${borradas.length} fechas del campus que borraste`}</summary>
          <ul className="cal__borradas-lista">
            {borradas.map((e) => (
              <li key={e.id}>
                <span className="cal__borrada">
                  <span className="cal__borrada-titulo">{e.titulo}</span>
                  <span className="cal__borrada-dato">{fecha(e.cuando)}, {e.materia}</span>
                </span>
                <button type="button" className="boton boton--secundario boton--chico" aria-label={`Volver a mostrar ${e.titulo}`} onClick={() => mostrar(e)}>
                  Volver a mostrar
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
