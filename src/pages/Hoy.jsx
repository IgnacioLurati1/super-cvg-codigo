import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import ClasesDeHoy from '../components/ClasesDeHoy';
import { BotonConectar } from '../components/Classroom';
import { ContenidoDelDia, diaConTodo, sinLoDeLaCasilla } from '../components/DiaDelCalendario';
import Evento from '../components/Evento';
import { rutaDeCuestionario } from '../components/EstadoCuestionario';
import { rutaDeTarea } from '../components/EstadoTarea';
import { IconoHecha, IconoMarcar, NO_SE_GUARDO } from '../components/Hecha';
import { useCalendarioGoogle } from '../lib/calendarioSincro';
import { sacarNotificaciones, sePuedeSacar, useAvisosOcultos, useSacadas } from '../lib/campana';
import { seVeAviso } from '../lib/avisos';
import Simbolo from '../components/Simbolo';
import { Cargando, ErrorConReintento, FilaItem } from '../components/Filas';
import { BotonSacar, Sacada } from '../components/SacarNotificacion';
import { useUI } from '../components/ui';
import { useAjustes, useVista } from '../lib/ajustes';
import { eventosDeLaFacultad, marcaDelDia } from '../lib/facultad';
import { compararFoto, fotoDe } from '../lib/cambios';
import { fechasDe, mensajesDe, olvidarClassroom, pendientesDe } from '../lib/classroom';
import { cargarAvisos, cargarIndice, cargarMaterias, cargarMes, cargarNombres, cargarPendientes, cargarPerfil } from '../lib/campus';
import { agruparPendientes, claveDeFecha, fecha, fechaDeClave, faltan, hoyEnTexto, materiaDeAviso, porDia, recientes } from '../lib/datos';
import { useGoogle } from '../lib/google';
import { claveDeHecha, conHechas, estaHecha, hechaDe, hechasEnTexto } from '../lib/hechas';
import { bloquesVisibles, cuentaEnHoy, diasDeHoy, fueraDeHoy, semanaDeHoy, tipoDePendiente } from '../lib/hoy';
import { anotarVacios } from '../lib/hoyVacios';
import {
  alternarTarea, conCorrecciones, desmarcarHecha, estaOculto, eventosPropios, guardarFoto, marcarHecha, materiaDe, personalizar, revisadoClassroom, useMio, volverHecha, materiaDeMarcas,
} from '../lib/mio';
import { tokenActual, vaciarCache } from '../lib/sesion';
import { textoDeTipo } from '../lib/tipos';
import { useConsulta } from '../lib/useConsulta';
import { esDemo } from '../lib/modoDemo';
import { useSysacad } from '../lib/sysacad';
import { eventosDeExamenes, examenesDelAlumno } from '../lib/sysacadExamenes';
import { cargarClassroomUnido } from '../lib/classroomUnido';

// The academic calendar's dates, as the Calendario shows them: the same for everyone, made once.
const DE_LA_FACULTAD = eventosDeLaFacultad();

// A campus task or quiz opens its page here.
const rutaDe = (evento) => (evento.tarea ? rutaDeTarea(evento.tarea) : evento.cuestionario ? rutaDeCuestionario(evento.cuestionario) : null);

function Pendiente({ evento, ahora, onHecha }) {
  const clave = claveDeHecha(evento);
  const contenido = (
    <>
      <Simbolo id={evento.materiaId} nombre={evento.materia} />
      <span className="pendiente__texto">
        <span className={`pendiente__cuando${evento.vence < ahora ? ' pendiente__cuando--vencido' : ''}`}>{faltan(evento.vence, ahora)}</span>
        <span className="pendiente__titulo">{evento.titulo}</span>
        <span className="pendiente__materia">{[evento.tipo, evento.materia].filter(Boolean).join(', ')}</span>
      </span>
    </>
  );
  /* A campus task opens its page here, to read it and hand it in. */
  const enlace = rutaDe(evento)
    ? <Link className="pendiente" to={rutaDe(evento)}>{contenido}</Link>
    : evento.url
      ? <a className="pendiente" href={evento.url} target="_blank" rel="noreferrer">{contenido}<span className="solo-lectores"> Se abre en otra pestaña.</span></a>
      : <span className="pendiente">{contenido}</span>;
  if (!clave) return <li>{enlace}</li>;
  return (
    <li className="pendiente-con-marca">
      {enlace}
      {/* Next to the row and not inside it: a button can't go in a link. */}
      <button type="button" className="pendiente__marcar" data-marcar={clave} aria-label={`Marcar ${evento.titulo} como ${hechaDe(clave)}`} onClick={() => onHecha(evento, 'fila')}>
        <IconoMarcar />
      </button>
    </li>
  );
}

/** What was just marked as done, in its place, with the way back. `suelto`: it was in the big card. */
function AvisoHecha({ aviso, suelto = false, onDeshacer }) {
  const Caja = suelto ? 'div' : 'li';
  return (
    <Caja className={`hechas-aviso${suelto ? ' hechas-aviso--suelto' : ''}`}>
      <p className="hechas-aviso__texto"><IconoHecha /><span>{`Marcaste «${aviso.titulo}» como ${hechaDe(aviso.clave)}.`}</span></p>
      <button type="button" className="boton boton--secundario boton--chico" data-deshacer="" onClick={onDeshacer}>Deshacer</button>
    </Caja>
  );
}

function GrupoPendientes({ titulo, eventos, ahora, onHecha, aviso, onDeshacer }) {
  if (!eventos.length) return null;
  return (
    <section className="bloque">
      <h2>{titulo}</h2>
      <ul className="lista">
        {eventos.map((e) => (aviso && claveDeHecha(e) === aviso.clave
          ? <AvisoHecha key={e.id} aviso={aviso} onDeshacer={onDeshacer} />
          : <Pendiente key={e.id} evento={e} ahora={ahora} onHecha={onHecha} />))}
      </ul>
    </section>
  );
}

/** The latest campus notifications. Each one can be taken out, here and from the bell, with the way back; the next one
 * takes its place. `materias`: to tell the subject of each. */
function Avisos({ avisos, materias, fuera }) {
  const sacadas = useSacadas();
  // The kinds the student hides (Configuración) don't show here either.
  const ocultos = useAvisosOcultos();
  // Taken out while on this page: in their place, the way back.
  const [recien, setRecien] = useState([]);
  const lista = useRef(null);
  const visibles = avisos
    .filter((a) => seVeAviso(a, ocultos) && (!sacadas.has(a.id) || recien.includes(a.id)) && !fuera.has(Number(materiaDeAviso(a, materias)?.id)))
    .slice(0, 5);
  if (!visibles.length) return null;
  const sacar = (a) => {
    setRecien((r) => [...r, a.id]);
    sacarNotificaciones([a.id]);
  };
  const volver = (a) => {
    sacarNotificaciones([a.id], true);
    setRecien((r) => r.filter((id) => id !== a.id));
    requestAnimationFrame(() => lista.current?.querySelector(`[data-sacar="${a.id}"]`)?.focus());
  };
  return (
    <section className="bloque">
      <h2>Avisos</h2>
      <ul ref={lista} className="lista">
        {visibles.map((a) => {
          if (sacadas.has(a.id)) return <Sacada key={a.id} texto={`Sacaste «${a.titulo}».`} onDeshacer={() => volver(a)} />;
          const delAviso = materiaDeAviso(a, materias);
          const texto = (
            <>
              <Simbolo id={delAviso?.id} nombre={delAviso?.nombre} sinMateria="campana" />
              <span className="notificacion__texto">
                <span className={`aviso__titulo${a.leido ? '' : ' aviso__titulo--nuevo'}`}>{a.titulo}</span>
                <span className="fila__dato">{[a.leido ? null : 'Sin leer', delAviso?.nombre, fecha(a.cuando)].filter(Boolean).join(', ')}</span>
              </span>
            </>
          );
          return (
            <li key={a.id} className={sePuedeSacar(a) ? 'con-sacar' : undefined}>
              {a.url
                ? <a className="notificacion" href={a.url} target="_blank" rel="noreferrer">{texto}<span className="solo-lectores"> Se abre en otra pestaña.</span></a>
                : <span className="notificacion">{texto}</span>}
              {sePuedeSacar(a) && <BotonSacar id={a.id} titulo={a.titulo} onSacar={() => sacar(a)} />}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// A row of what was done opens it, as a pending one does: its page here, or the campus in another tab.
function AbrirHecha({ evento, children }) {
  const ruta = rutaDe(evento);
  if (ruta) return <Link className="hechas__abrir" to={ruta}>{children}</Link>;
  if (evento.url) return <a className="hechas__abrir" href={evento.url} target="_blank" rel="noreferrer">{children}<span className="solo-lectores"> Se abre en otra pestaña.</span></a>;
  return <span className="hechas__abrir">{children}</span>;
}

/** What the student marked as done among what is pending, closed at the end, each with the way back. */
function YaHechas({ eventos, onDesmarcar }) {
  if (!eventos.length) return null;
  return (
    <details className="bloque hechas">
      <summary>
        <span>Ya hecho<span className="solo-lectores">{`, ${eventos.length}`}</span></span>
        <span className="hechas__cuantas" aria-hidden="true">{eventos.length}</span>
      </summary>
      <ul className="hechas__lista">
        {eventos.map((e, i) => (
          <li key={e.id}>
            <AbrirHecha evento={e}>
              <IconoHecha />
              <span className="hechas__texto">
                <span className="hechas__titulo">{e.titulo}</span>
                <span className="hechas__dato">{[fecha(e.vence), e.materia].filter(Boolean).join(', ')}</span>
              </span>
            </AbrirHecha>
            <button type="button" className="boton boton--secundario boton--chico" data-desmarcar="" aria-label={`Desmarcar ${e.titulo}`} onClick={() => onDesmarcar(e, i)}>
              Desmarcar
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}

/** `llega`: it came into the card because another one was marked, with a short motion. */
function Destacado({ evento, ahora, llega, onHecha }) {
  const clave = claveDeHecha(evento);
  const titulo = <span className="marcado">{evento.titulo}</span>;
  return (
    <section className={`destacado${llega ? ' destacado--llega' : ''}`} aria-label="Lo próximo que vence">
      <div className="destacado__cabeza">
        <Simbolo id={evento.materiaId} nombre={evento.materia} tamano="grande" />
        <p className="destacado__cuando">{faltan(evento.vence, ahora)}</p>
      </div>
      <h2 className="destacado__titulo">
        {rutaDe(evento)
          ? <Link to={rutaDe(evento)}>{titulo}</Link>
          : evento.url ? <a href={evento.url} target="_blank" rel="noreferrer">{titulo}</a> : titulo}
      </h2>
      <p className="destacado__materia">{[evento.tipo, evento.materia].filter(Boolean).join(', ')}</p>
      {clave && (
        <div className="destacado__acciones">
          <button type="button" className="boton boton--secundario boton--chico" data-marcar={clave} onClick={() => onHecha(evento, 'destacado')}>
            {`Marcar como ${hechaDe(clave)}`}
          </button>
        </div>
      )}
    </section>
  );
}

const CORTO = new Intl.DateTimeFormat('es-AR', { weekday: 'short' });
const LARGO = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });

/** `forma`: 'numeros', how many dates each day has; 'calendario', each day as the Calendario's month draws it. */
function Semana({ ahora, eventos, forma, conFacultad }) {
  const dias = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(ahora * 1000);
    d.setDate(d.getDate() + i);
    return d;
  }), [ahora]);

  if (forma === 'calendario') {
    return (
      <nav className="semana semana--calendario" aria-label="Esta semana en el calendario">
        {dias.map((d, i) => {
          const clave = claveDeFecha(d);
          const marca = conFacultad ? marcaDelDia(clave) : null;
          const delDia = marca ? sinLoDeLaCasilla(eventos[clave] ?? []) : (eventos[clave] ?? []);
          return (
            <Link
              key={clave}
              className="cal__dia"
              data-hoy={i === 0 ? '' : undefined}
              data-facultad={marca?.tipo}
              aria-label={diaConTodo(clave, delDia, marca)}
              aria-current={i === 0 ? 'date' : undefined}
              to={i === 0 ? '/calendario' : `/calendario?dia=${clave}`}
            >
              <span className="semana__nombre" aria-hidden="true">{CORTO.format(d).replace('.', '')}</span>
              <ContenidoDelDia numero={d.getDate()} eventos={delDia} marca={marca} />
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav className="semana" aria-label="Esta semana en el calendario">
      {dias.map((d, i) => {
        const clave = claveDeFecha(d);
        const delDia = eventos[clave] ?? [];
        const cantidad = delDia.length;
        // What was done stays on its day: the number counts what is left, and a day with all of it done shows the tick.
        const quedan = delDia.filter((e) => !e.hecha).length;
        // Something left that is due that day: the number goes red.
        const vence = delDia.some((e) => !e.hecha && e.vencimiento);
        const detalle = cantidad === 0 ? 'sin actividades' : `${cantidad === 1 ? 'una actividad' : `${cantidad} actividades`}${hechasEnTexto(delDia)}${vence ? ', con vencimientos' : ''}`;
        return (
          <Link key={clave} className="semana__dia" data-hoy={i === 0 ? '' : undefined} to={i === 0 ? '/calendario' : `/calendario?dia=${clave}`} title={LARGO.format(d)}>
            <span className="semana__nombre">{CORTO.format(d).replace('.', '')}</span>
            <span className="semana__numero">{d.getDate()}</span>
            <span className="semana__cantidad" data-hay={quedan ? '' : undefined} data-vence={vence ? '' : undefined} data-hechas={cantidad && !quedan ? '' : undefined} aria-hidden="true">
              {quedan || (cantidad ? <IconoHecha /> : '')}
            </span>
            <span className="solo-lectores">{detalle}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export default function Hoy() {
  const titulo = useRef(null);
  // Linked, the student's own dates already go to Google by themselves: no link on each one.
  const aGoogle = !useCalendarioGoogle().prendido;
  const paraHacer = useRef(null);
  const principal = useRef(null);
  const { avisar } = useUI();
  const [ahora] = useState(() => Math.floor(Date.now() / 1000));
  // What was kept shows at once, and changes when the campus answers (useConsulta.js).
  const perfil = useConsulta(cargarPerfil, [], { alInstante: true });
  const pendientes = useConsulta(cargarPendientes, [], { alInstante: true });
  const avisos = useConsulta(cargarAvisos, [], { alInstante: true });
  const novedades = useConsulta(async () => {
    await cargarPerfil();
    return cargarIndice((await cargarMaterias()).enCurso);
  }, [], { alInstante: true });
  const calendario = useConsulta(async () => {
    await cargarPerfil();
    const hoy = new Date(ahora * 1000);
    const siguiente = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1);
    // Up to the farthest «Próximas fechas» can look (hoy.js): at the end of a month, it reaches the one after next.
    const lejos = new Date((ahora + 31 * 86_400) * 1000);
    const desde = [hoy, siguiente, lejos].filter((d, i, l) => l.findIndex((x) => x.getFullYear() === d.getFullYear() && x.getMonth() === d.getMonth()) === i);
    const [meses, nombres] = await Promise.all([
      Promise.all(desde.map((d) => cargarMes(d.getFullYear(), d.getMonth() + 1))),
      cargarNombres(),
    ]);
    return { eventos: [...new Map(meses.flat().map((e) => [e.id, e])).values()], nombres };
  }, [], { alInstante: true });

  // Classroom, if connected: the course of each campus course (chosen, or found by the name) and of each course of
  // one's own, with its tasks not turned in and its messages.
  const google = useGoogle();
  const leeClassroom = google.conectado || google.sinRed;
  const classroom = useConsulta(async () => (leeClassroom ? cargarClassroomUnido() : []), [leeClassroom]);

  const otrasMaterias = useConsulta(async () => {
    const sinUbicar = (avisos.datos ?? []).some((a) => a.materiaId || a.modulo);
    return sinUbicar ? cargarIndice((await cargarMaterias()).otras) : [];
  }, [avisos.datos], { alInstante: true });

  const mio = useMio();
  const vista = useVista('hoy');
  const { facultad: conFacultad, calSoloVencimientos, calMateria } = useAjustes();
  // How the student arranged Hoy (hoy.js): the blocks on view in each column, what enters «Vencimientos», how far
  // «Próximas fechas» looks, and the courses taken out of here.
  const columnas = useMemo(() => bloquesVisibles(mio), [mio]);
  const cuenta = useMemo(() => cuentaEnHoy(mio), [mio]);
  const dias = diasDeHoy(mio);
  const fuera = useMemo(() => fueraDeHoy(mio), [mio]);
  const tareasClassroom = useMemo(() => (classroom.datos ?? []).flatMap((u) => pendientesDe(u.datos, u.entregadas, u.materia, ahora)), [classroom.datos, ahora]);
  // The student's own deadlines, from the last 30 days on, as the campus' pending ones come.
  const propiosPendientes = useMemo(() => (cuenta.has('propias') ? eventosPropios(mio, calendario.datos?.nombres) : [])
    .filter((e) => e.vencimiento && e.cuando >= ahora - 30 * 86_400)
    .map((e) => ({ ...e, vence: e.cuando, tipo: e.propio === 'evento' ? textoDeTipo(e.tipo) : e.propio === 'tarea' ? 'Tarea tuya' : 'Fecha tuya' })), [cuenta, mio, calendario.datos, ahora]);
  const todosPendientes = useMemo(
    () => [...(pendientes.datos ?? []), ...tareasClassroom, ...propiosPendientes].filter((e) => cuenta.has(tipoDePendiente(e)) && !fuera.has(Number(e.materiaId))),
    [pendientes.datos, tareasClassroom, propiosPendientes, cuenta, fuera],
  );

  // Marked as done, it leaves the lists at once. The last one marked stays in its place with «Deshacer» until the next
  // change, and focus goes there: after «Deshacer» it goes back to the item.
  const [ultima, setUltima] = useState(null);
  const [movido, setMovido] = useState(false);
  const [anuncio, setAnuncio] = useState('');
  const enfocar = useRef(null);
  const aviso = ultima && estaHecha(mio, ultima.clave) ? ultima : null;
  const enLaFila = aviso?.donde === 'fila' ? aviso.clave : null;
  const grupos = useMemo(() => agruparPendientes(todosPendientes.filter((e) => {
    const clave = claveDeHecha(e);
    return clave === enLaFila || !estaHecha(mio, clave);
  }), ahora), [todosPendientes, mio, enLaFila, ahora]);
  const yaHechas = useMemo(() => todosPendientes.filter((e) => estaHecha(mio, claveDeHecha(e))).sort((a, b) => a.vence - b.vence), [todosPendientes, mio]);
  const queda = (e) => !enLaFila || claveDeHecha(e) !== enLaFila;
  const avisoEnFila = enLaFila ? aviso : null;

  const mensajesNuevos = useMemo(() => (classroom.datos ?? [])
    .filter((u) => !fuera.has(Number(u.materia.id)))
    .flatMap((u) => mensajesDe(u.datos, u.materia, revisadoClassroom(mio, u.curso.id)).filter((m) => m.nuevo).map((m) => ({ ...m, ruta: u.ruta })))
    .sort((a, b) => b.creado - a.creado), [classroom.datos, mio, fuera]);
  // Not connected in this tab, with courses joined: it offers to connect.
  const hayUnidos = google.disponible && (Object.values(mio.materias).some((m) => /^\d+$/.test(m.classroom ?? '')) || mio.propias.some((p) => p.classroom));
  const proximo = grupos.semana.find(queda) ?? grupos.despues.find(queda) ?? null;
  const resto = (lista) => lista.filter((e) => e.id !== proximo?.id);
  const propios = useMemo(() => personalizar(novedades.datos ?? [], mio), [novedades.datos, mio]);
  const ultimos = useMemo(() => recientes(propios.filter((i) => !estaOculto(mio, i) && !fuera.has(Number(i.materiaId))), ahora), [propios, mio, ahora, fuera]);
  // The campus' dates marked as done stay, with `hecha`: in the week they read as done.
  const fechasTodas = useMemo(
    () => conHechas([...conCorrecciones(calendario.datos?.eventos ?? [], mio, calendario.datos?.nombres), ...eventosPropios(mio, calendario.datos?.nombres)], mio).filter((e) => !fuera.has(Number(e.materiaId))),
    [calendario.datos, mio, fuera],
  );
  const hayPendientes = grupos.vencidos.some(queda) || proximo;
  // «Nothing to turn in» only once the campus and Classroom both answered: said while they load, it may be wrong.
  const buscandoEntregas = pendientes.cargando || classroom.cargando;
  // Classroom's tasks with a date, as the Calendario lists them: only in the week, «Vencimientos» has its own.
  const deClassroom = useMemo(() => conHechas((classroom.datos ?? []).filter((u) => !fuera.has(Number(u.materia.id))).flatMap((u) => fechasDe(u.datos, u.entregadas, u.materia)), mio), [classroom.datos, fuera, mio]);
  // The exams the student signed up for in Sysacad, from Sysacad Lindo: only when Sysacad's name is this account's.
  const { examenes: deLaExtension } = useSysacad();
  const deSysacad = useMemo(() => eventosDeExamenes(examenesDelAlumno(deLaExtension, perfil.datos?.completo)), [deLaExtension, perfil.datos]);
  // The demo has no extension: its made-up answer comes through the same window and the same check.
  useEffect(() => {
    if (!import.meta.env.DEV || !esDemo(tokenActual())) return;
    import('../lib/demoSysacad').then(({ examenesDeEjemplo }) => window.postMessage(examenesDeEjemplo(), window.location.origin));
  }, []);
  // The week counts what the Calendario lists on each day, with its filters: the faculty's dates, only deadlines, a
  // course. A course no longer among the dates counts as all of them, as in the Calendario.
  const eventosPorDia = useMemo(() => {
    const todas = [...fechasTodas, ...deClassroom, ...deSysacad, ...(conFacultad ? DE_LA_FACULTAD : [])];
    const materia = todas.some((e) => e.materiaId && String(e.materiaId) === calMateria) ? calMateria : '';
    return porDia(todas.filter((e) => (!materia || String(e.materiaId) === materia) && (!calSoloVencimientos || e.vencimiento)));
  }, [fechasTodas, deClassroom, deSysacad, conFacultad, calMateria, calSoloVencimientos]);
  const proximasFechas = useMemo(() => {
    const yaListadas = new Set(todosPendientes.map((e) => e.id));
    return [...fechasTodas, ...deSysacad]
      .filter((e) => e.cuando >= ahora && e.cuando < ahora + dias * 86_400 && !yaListadas.has(e.id) && !e.hecha)
      .sort((a, b) => a.cuando - b.cuando)
      .slice(0, 8);
  }, [fechasTodas, deSysacad, todosPendientes, ahora, dias]);

  const cambiosPorMateria = useMemo(() => {
    const grupos = new Map();
    for (const i of propios) {
      if (!grupos.has(i.materiaId)) grupos.set(i.materiaId, { id: i.materiaId, nombre: i.materia, items: [] });
      grupos.get(i.materiaId).items.push(i);
    }
    return [...grupos.values()]
      .map((g) => {
        const foto = materiaDe(mio, g.id).foto;
        const r = compararFoto(foto, g.items);
        const nuevos = r.nuevos.filter((i) => !estaOculto(mio, i)).length;
        const cambiados = r.cambiados.filter((i) => !estaOculto(mio, i)).length;
        return { ...g, sinFoto: !foto, nuevos, cambiados, borrados: r.borrados };
      });
  }, [propios, mio]);

  // First time this course shows up: take the picture, or everything would look new.
  useEffect(() => {
    for (const g of cambiosPorMateria) if (g.sinFoto) guardarFoto(g.id, fotoDe(g.items));
  }, [cambiosPorMateria]);

  // After marking, undoing or taking a mark off, the focus goes where the screen says, once it is drawn.
  useEffect(() => {
    const buscar = enfocar.current;
    if (!buscar || !principal.current) return;
    enfocar.current = null;
    buscar(principal.current)?.focus();
  });

  const marcar = (evento, donde) => {
    const clave = claveDeHecha(evento);
    const antes = mio.hechas[clave];
    if (!marcarHecha(clave, evento.vence)) {
      avisar(NO_SE_GUARDO, 'error');
      return;
    }
    setUltima({ clave, titulo: evento.titulo, antes, donde });
    setMovido(true);
    setAnuncio(`Marcaste «${evento.titulo}» como ${hechaDe(clave)}.`);
    enfocar.current = (raiz) => raiz.querySelector('[data-deshacer]');
  };
  const deshacer = () => {
    if (!aviso) return;
    volverHecha(aviso.clave, aviso.antes);
    setUltima(null);
    setAnuncio(`«${aviso.titulo}» volvió a tus pendientes.`);
    enfocar.current = (raiz) => raiz.querySelector(`[data-marcar="${aviso.clave}"]`);
  };
  // From the list of what was done: the focus stays in the list while there is something, and then goes to the item.
  const desmarcar = (evento, i) => {
    const clave = claveDeHecha(evento);
    if (!desmarcarHecha(clave, evento.vence)) {
      avisar(NO_SE_GUARDO, 'error');
      return;
    }
    setMovido(true);
    setAnuncio(`«${evento.titulo}» volvió a tus pendientes.`);
    const quedan = yaHechas.length - 1;
    enfocar.current = (raiz) => (quedan > 0 ? raiz.querySelectorAll('[data-desmarcar]')[Math.min(i, quedan - 1)] : raiz.querySelector(`[data-marcar="${clave}"]`));
  };

  const conCambios = cambiosPorMateria.filter((g) => g.nuevos + g.cambiados + g.borrados > 0 && !fuera.has(Number(g.id)));
  const tareas = useMemo(() => Object.entries(mio.materias)
    .filter(([id]) => !fuera.has(Number(id)) && materiaDeMarcas(mio, id).materiaId !== null)
    .flatMap(([id, m]) => m.tareas.filter((t) => !t.hecha).map((t) => ({ ...t, ...materiaDeMarcas(mio, id, calendario.datos?.nombres) })))
    .sort((a, b) => (a.fecha ?? '9999').localeCompare(b.fecha ?? '9999')), [mio, calendario.datos, fuera]);
  const cargando = pendientes.cargando || avisos.cargando || novedades.cargando || calendario.cargando || classroom.cargando;

  const actualizar = () => {
    if (cargando) return;
    setUltima(null);
    vaciarCache();
    perfil.recargar();
    pendientes.recargar();
    avisos.recargar();
    novedades.recargar();
    calendario.recargar();
    olvidarClassroom();
    classroom.recargar();
  };

  const conClassroom = classroom.datos?.length > 0;
  const libre = yaHechas.length
    ? `Ya hiciste todo lo que te ${conClassroom ? 'marcan el campus y Classroom' : 'marca el campus'}.`
    : `${conClassroom ? 'Ni el campus ni Classroom te marcan' : 'El campus no te marca'} nada por entregar.`;

  // Each block of the page by its key (hoy.js), drawn in the order the student left in each column.
  const fechasAbajo = columnas.principal.includes('fechas') && columnas.principal.indexOf('fechas') > columnas.principal.indexOf('pendientes');
  const bloques = {
    pendientes: (
      <>
        {pendientes.error && !pendientes.datos && <ErrorConReintento texto={pendientes.error} recargar={pendientes.recargar} />}
        {buscandoEntregas && !hayPendientes && <Cargando texto="Buscando tus entregas" cuantas={3} />}
        {aviso?.donde === 'destacado' && <AvisoHecha aviso={aviso} suelto onDeshacer={deshacer} />}
        {pendientes.datos && !hayPendientes && !buscandoEntregas && (
          <section className="destacado destacado--libre">
            <h2 className="destacado__titulo">Sin entregas pendientes</h2>
            <p className="destacado__materia">{`${libre}${proximasFechas.length && fechasAbajo ? ' Las fechas que sí hay están abajo.' : ''}`}</p>
          </section>
        )}
        {proximo && <Destacado key={proximo.id} evento={proximo} ahora={ahora} llega={movido} onHecha={marcar} />}
        <GrupoPendientes titulo="Vencidas" eventos={grupos.vencidos} ahora={ahora} onHecha={marcar} aviso={avisoEnFila} onDeshacer={deshacer} />
        <GrupoPendientes titulo="Esta semana" eventos={resto(grupos.semana)} ahora={ahora} onHecha={marcar} aviso={avisoEnFila} onDeshacer={deshacer} />
        <GrupoPendientes titulo="Más adelante" eventos={resto(grupos.despues)} ahora={ahora} onHecha={marcar} aviso={avisoEnFila} onDeshacer={deshacer} />
      </>
    ),
    hechas: <YaHechas eventos={yaHechas} onDesmarcar={desmarcar} />,
    tareas: tareas.length > 0 && (
      <section className="bloque">
        <h2 ref={paraHacer} tabIndex={-1}>Para hacer</h2>
        <ul className="tareas">
          {tareas.map((t) => (
            <li key={`${t.materiaId}-${t.id}`} className="tarea">
              <label className="tarea__marca">
                <input type="checkbox" checked={false} onChange={() => { const queda = tareas.length > 1; alternarTarea(t.materiaId, t.id); (queda ? paraHacer : titulo).current?.focus(); }} />
                <span className="tarea__texto">
                  {t.texto}
                  <span className="tarea__fecha">{[t.materia, t.fecha ? `Para el ${fecha(fechaDeClave(t.fecha).getTime() / 1000)}` : null].filter(Boolean).join(', ')}</span>
                </span>
              </label>
              <Simbolo id={t.materiaId} nombre={t.materia} />
            </li>
          ))}
        </ul>
      </section>
    ),
    fechas: (
      <>
        {calendario.error && !calendario.datos && <ErrorConReintento texto="No pudimos traer las fechas del calendario." recargar={calendario.recargar} />}
        {proximasFechas.length > 0 && (
          <section className="bloque">
            <h2>Próximas fechas</h2>
            <ul className="eventos">{proximasFechas.map((e) => <Evento key={e.id} evento={e} conFecha aGoogle={aGoogle} />)}</ul>
            <p className="hoy__mas"><Link to="/calendario">Ver el calendario</Link></p>
          </section>
        )}
      </>
    ),
    facu: <ClasesDeHoy />,
    classroom: (
      <>
        {hayUnidos && !google.conectado && !google.sinRed && (
          <section className="bloque">
            <h2>Classroom</h2>
            <p className="classroom__bajada">Conectalo y ves acá sus tareas y sus mensajes nuevos.</p>
            <BotonConectar secundario />
          </section>
        )}
        {classroom.error && !classroom.datos && <ErrorConReintento texto={classroom.error} recargar={classroom.recargar} />}
      </>
    ),
    mensajes: mensajesNuevos.length > 0 && (
      <section className="bloque">
        <h2>Mensajes nuevos en Classroom</h2>
        <ul className="lista">
          {mensajesNuevos.slice(0, 6).map((m) => (
            <li key={m.id}>
              <Link className="notificacion" to={m.ruta}>
                <Simbolo id={m.materiaId} nombre={m.materia} sinMateria="campana" />
                <span className="notificacion__texto">
                  <span className="aviso__titulo aviso__titulo--nuevo">{m.nombre}</span>
                  <span className="fila__dato">{[m.materia, fecha(m.creado)].join(', ')}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    ),
    cambios: conCambios.length > 0 && (
      <section className="bloque">
        <h2>Cambios desde tu última revisión</h2>
        <ul className="lista">
          {conCambios.map((g) => (
            <li key={g.id}>
              <Link className="notificacion" to={`/materias/${g.id}`}>
                <Simbolo id={g.id} nombre={g.nombre} />
                <span className="notificacion__texto">
                  <span className="aviso__titulo aviso__titulo--nuevo">{g.nombre}</span>
                  <span className="fila__dato">{[g.nuevos ? (g.nuevos === 1 ? 'Uno nuevo' : `${g.nuevos} nuevos`) : null, g.cambiados ? (g.cambiados === 1 ? 'Uno modificado' : `${g.cambiados} modificados`) : null, g.borrados ? (g.borrados === 1 ? 'Uno borrado' : `${g.borrados} borrados`) : null].filter(Boolean).join(', ')}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    ),
    avisos: avisos.datos?.length > 0 && <Avisos avisos={avisos.datos} materias={[...(novedades.datos ?? []), ...(otrasMaterias.datos ?? [])]} fuera={fuera} />,
    ultimo: (
      <>
        {novedades.error && !novedades.datos && <ErrorConReintento texto={novedades.error} recargar={novedades.recargar} />}
        {novedades.cargando && !novedades.datos && <Cargando texto="Buscando lo último que subieron" cuantas={3} />}
        {ultimos.length > 0 && (
          <section className="bloque">
            <h2>Último subido</h2>
            <ul className="lista">{ultimos.map((i) => <FilaItem key={i.id} item={i} conMateria />)}</ul>
          </section>
        )}
      </>
    ),
  };
  const nada = !columnas.principal.length && !columnas.costado.length;

  // The blocks with nothing today, for the preview in Configuración (only what already arrived; En la facu, ClasesDeHoy).
  const vacios = {
    pendientes: false,
    tareas: !tareas.length,
    classroom: !(hayUnidos && !google.conectado && !google.sinRed) && !classroom.error,
    ...(pendientes.datos && { hechas: !yaHechas.length }),
    ...(calendario.datos && { fechas: !proximasFechas.length }),
    ...(!classroom.cargando && { mensajes: !mensajesNuevos.length }),
    ...(novedades.datos && { cambios: !conCambios.length, ultimo: !ultimos.length }),
    ...(avisos.datos && { avisos: !avisos.datos.length }),
  };
  const huella = JSON.stringify(vacios);
  useEffect(() => anotarVacios(JSON.parse(huella)), [huella]);

  return (
    <div className="contenedor pagina vista-hoy" data-vista={vista}>
      <div className="titular">
        <div>
          <h1 ref={titulo} tabIndex={-1}>{perfil.datos?.nombre ? `Hola, ${perfil.datos.nombre}` : 'Hoy'}</h1>
          <p className="titular__fecha">{hoyEnTexto(ahora * 1000)}</p>
        </div>
        <div className="titular__acciones">
          <Link className="boton boton--secundario boton--chico" to="/configuracion#hoy">Ordenar</Link>
          <button type="button" className="boton boton--secundario boton--chico" onClick={actualizar} aria-disabled={cargando ? 'true' : undefined}>
            {cargando ? 'Actualizando' : 'Actualizar'}
          </button>
        </div>
        <span className="solo-lectores" role="status">{cargando ? 'Actualizando' : ''}</span>
      </div>

      <Semana ahora={ahora} eventos={eventosPorDia} forma={semanaDeHoy(mio)} conFacultad={conFacultad} />

      {nada && <p className="hoy__nada">Escondiste todo lo de Hoy. <Link to="/configuracion#hoy">Elegí qué ver</Link></p>}
      <div className="hoy">
        <div ref={principal} className="hoy__principal">
          <p className="solo-lectores" role="status">{anuncio}</p>
          {columnas.principal.map((c) => <Fragment key={c}>{bloques[c]}</Fragment>)}
        </div>

        <div className="hoy__lateral">
          {columnas.costado.map((c) => <Fragment key={c}>{bloques[c]}</Fragment>)}
        </div>
      </div>
    </div>
  );
}
