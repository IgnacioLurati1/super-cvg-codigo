import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Cargando, ErrorConReintento } from '../components/Filas';
import { cargarPerfil } from '../lib/campus';
import { armarCarrera, carreraParaConsultron, conSupuestas, cuentas, loQueDestraba, nombreDelAnio } from '../lib/carrera';
import { carreraParaLaPregunta } from '../lib/consultron/deLaCarrera';
import { usePantallaDeConsultron } from '../lib/consultron/pantalla';
import { cuantoFrena } from '../lib/frenos';
import { esDemo } from '../lib/modoDemo';
import { tituloDe, useSeo } from '../lib/seo';
import { tokenActual } from '../lib/sesion';
import { notaComoTexto, SYSACAD, useSysacad } from '../lib/sysacad';
import { mismoAlumno, vistoHace } from '../lib/sysacadPestanas';
import { useMio } from '../lib/mio';
import { useConsulta } from '../lib/useConsulta';
import './panel.css';
import './carrera.css';

const otraPestana = <span className="solo-lectores">, se abre en otra pestaña</span>;

// What each state says on its card, short. The color repeats it; the words are what counts.
function estadoCorto(m) {
  if (m.estado === 'aprobada') return m.nota ? `Aprobada con ${notaComoTexto(m.nota)}` : 'Aprobada';
  if (m.estado === 'regular') {
    if (!m.rendir) return 'Regular';
    return m.rendir.puede ? 'Regular, podés rendir' : 'Regular, te falta para rendir';
  }
  if (m.estado === 'cursando') return 'Cursando';
  if (m.estado === 'cursar') return 'Podés cursarla';
  if (m.estado === 'falta') {
    const n = m.cursar.faltan.length + m.cursar.otros.length;
    return n === 1 ? 'Te falta 1' : `Te faltan ${n}`;
  }
  return 'Sin cursar';
}

const FILTROS = [
  { clave: 'todo', texto: 'Todo' },
  { clave: 'cursar', texto: 'Podés cursar' },
  { clave: 'rendir', texto: 'Podés rendir' },
];
const pasaFiltro = (m, filtro) =>
  filtro === 'todo' || (filtro === 'cursar' ? m.estado === 'cursar' : m.estado === 'regular' && m.rendir?.puede);

// Electives not started stay hidden unless asked: the plan offers many, and only a few get taken.
const electivaQuieta = (m) => m.electiva && (m.estado === 'cursar' || m.estado === 'falta' || m.estado === 'pendiente');

// A requirement's subject: a button that opens it when it is on the map, its name alone when it is not.
function NombreDe({ clave, texto, enMapa, onElegir }) {
  if (!enMapa) return texto;
  return (
    <button type="button" className="carrera-enlace" onClick={() => onElegir(clave)}>
      {texto}
    </button>
  );
}

function Requisitos({ titulo, lado, porClave, onElegir }) {
  if (!lado || lado.puede || (!lado.faltan.length && !lado.otros.length)) return null;
  return (
    <div className="carrera-detalle__grupo">
      <h4 className="carrera-detalle__subtitulo">{titulo}</h4>
      <ul className="carrera-detalle__lista">
        {lado.faltan.map((r, i) => (
          <li key={i}>
            {r.accion} <NombreDe clave={r.clave} texto={porClave.get(r.clave)?.nombre ?? r.texto} enMapa={porClave.has(r.clave)} onElegir={onElegir} />
          </li>
        ))}
        {lado.otros.map((t, i) => <li key={`o${i}`}>{t}</li>)}
      </ul>
    </div>
  );
}

/** What is open about one subject: what it lacks, what it frees, and «suponé que la tenés». */
function Detalle({ materia, carrera, porClave, supuesta, onSuponer, onElegir, onCerrar, referencia }) {
  const destraba = useMemo(() => loQueDestraba(carrera, materia.clave), [carrera, materia.clave]);
  const libres = [...destraba.cursar, ...destraba.rendir.filter((m) => !destraba.cursar.includes(m))];
  const puedeSuponer = materia.estado !== 'aprobada';
  return (
    <section ref={referencia} className={`carrera-detalle carrera-detalle--${materia.estado}`} tabIndex={-1} aria-labelledby={`detalle-${materia.clave}`} onKeyDown={(e) => e.key === 'Escape' && onCerrar()}>
      <div className="carrera-detalle__cabeza">
        <div>
          <h3 id={`detalle-${materia.clave}`} className="carrera-detalle__titulo">{materia.nombre}</h3>
          <p className="carrera-detalle__estado">{estadoCorto(materia)}{materia.electiva ? '. Electiva' : ''}</p>
        </div>
        <button type="button" className="boton boton--secundario boton--chico" onClick={onCerrar}>Cerrar</button>
      </div>
      <Requisitos titulo="Para cursarla te falta" lado={materia.estado === 'falta' ? materia.cursar : null} porClave={porClave} onElegir={onElegir} />
      <Requisitos titulo="Para rendirla te falta" lado={materia.estado === 'regular' ? materia.rendir : null} porClave={porClave} onElegir={onElegir} />
      {libres.length > 0 && (
        <div className="carrera-detalle__grupo">
          <h4 className="carrera-detalle__subtitulo">{materia.estado === 'regular' ? 'Aprobándola, destraba' : 'Destraba'}</h4>
          <ul className="carrera-detalle__lista">
            {destraba.cursar.map((m) => (
              <li key={m.clave}>
                <NombreDe clave={m.clave} texto={m.nombre} enMapa onElegir={onElegir} />, para cursar
              </li>
            ))}
            {destraba.rendir.map((m) => (
              <li key={`r${m.clave}`}>
                <NombreDe clave={m.clave} texto={m.nombre} enMapa onElegir={onElegir} />, para rendir
              </li>
            ))}
          </ul>
        </div>
      )}
      {puedeSuponer && libres.length > 0 && (
        <button type="button" className="boton boton--chico carrera-detalle__suponer" aria-pressed={supuesta} onClick={() => onSuponer(materia.clave)}>
          {supuesta ? 'Dejar de suponer' : 'Suponé que la tenés'}
        </button>
      )}
    </section>
  );
}

function Ficha({ materia, elegida, relacion, abre, supuesta, onElegir, referencia }) {
  const marcas = [];
  if (supuesta) marcas.push(['supuesta', 'Supuesta']);
  else if (abre) marcas.push(['abre', abre === 'rendir' ? 'Se te abre para rendir' : 'Se te abre']);
  if (relacion === 'falta') marcas.push(['relacion', 'Requisito']);
  if (relacion === 'destraba') marcas.push(['relacion', 'Necesita la elegida']);
  return (
    <li className="carrera-ficha__item">
      <button
        ref={referencia}
        type="button"
        className={`carrera-ficha carrera-ficha--${materia.estado}${materia.estado === 'regular' && materia.rendir?.puede ? ' carrera-ficha--rinde' : ''}${relacion ? ` carrera-ficha--rel-${relacion}` : ''}${abre ? ' carrera-ficha--abre' : ''}${supuesta ? ' carrera-ficha--supuesta' : ''}`}
        aria-expanded={elegida}
        data-clave={materia.clave}
        onClick={() => onElegir(elegida ? null : materia.clave)}
      >
        <span className="carrera-ficha__nombre">{materia.nombre}</span>
        {materia.estado === 'aprobada' && materia.nota ? (
          <>
            <span className="carrera-ficha__estado">Aprobada<span className="solo-lectores"> con {notaComoTexto(materia.nota)}</span></span>
            <span className="carrera-ficha__nota" aria-hidden="true">{notaComoTexto(materia.nota)}</span>
          </>
        ) : (
          <span className="carrera-ficha__estado">{estadoCorto(materia)}</span>
        )}
        {marcas.map(([tipo, t]) => <span key={t} className={`carrera-ficha__marca carrera-ficha__marca--${tipo}`}>{t}</span>)}
      </button>
    </li>
  );
}

/** The whole plan at a glance, like the printed one: a column per year, a square per subject, painted by where it
 * stands. Only a picture: the legend next to it says the same in words. */
/** Cards of what holds back the most, with a padlock per subject it keeps closed. */
function Frenos({ id, titulo, frenos, elegir }) {
  return (
    <section className="carrera-frenos" aria-labelledby={id}>
      <h2 id={id} className="carrera-frenos__titulo">{titulo}</h2>
      <ol className="carrera-frenos__lista">
        {frenos.map((f) => (
          <li key={f.clave} className="carrera-freno">
            {f.enMapa === false ? (
              <span className="carrera-freno__nombre">{f.nombre}</span>
            ) : (
              <button type="button" className="carrera-enlace carrera-freno__nombre" onClick={() => elegir(f.clave)}>{f.nombre}</button>
            )}
            <span className="carrera-freno__pie">
              {f.frena > 0 && (
                <span className="carrera-freno__candados" aria-hidden="true">
                  {Array.from({ length: Math.min(f.frena, 8) }, (_, i) => <span key={i} />)}
                </span>
              )}
              <span className="carrera-frenos__cuenta"><span className="solo-lectores">, </span>{cuantoFrena(f)}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Plano({ carrera, elegida }) {
  const columnas = carrera.anios
    .filter((a) => a !== null)
    .map((anio) => ({ anio, materias: carrera.materias.filter((m) => m.anio === anio && !m.electiva) }))
    .filter((c) => c.materias.length);
  return (
    <div className="carrera-plano" aria-hidden="true">
      {columnas.map((c) => (
        <div key={c.anio} className="carrera-plano__columna">
          {c.materias.map((m, i) => (
            <span
              key={m.clave}
              className={`carrera-plano__cuadro carrera-punto--${m.estado}${m.clave === elegida ? ' carrera-plano__cuadro--elegida' : ''}`}
              style={{ '--i': i }}
            >
              {m.estado === 'aprobada' && m.nota ? Math.round(m.nota) : ''}
            </span>
          ))}
          <span className="carrera-plano__anio">{c.anio}°</span>
        </div>
      ))}
    </div>
  );
}

/** The map itself: the summary, what holds back the most, the filters and one band per year. */
function Mapa({ carrera }) {
  const id = useId();
  const [elegida, setElegida] = useState(null);
  const [supuestas, setSupuestas] = useState(() => new Set());
  const [filtro, setFiltro] = useState('todo');
  const [conElectivas, setConElectivas] = useState(false);
  const porClave = useMemo(() => new Map(carrera.materias.map((m) => [m.clave, m])), [carrera]);
  const abren = useMemo(() => conSupuestas(carrera, supuestas), [carrera, supuestas]);
  const c = cuentas(carrera.materias);
  const actual = elegida ? porClave.get(elegida) : null;
  // Consultron, open over it, reads the map as it is now: with the subject open and what is being supposed.
  usePantallaDeConsultron({
    ...carreraParaConsultron(carrera, { supuestas, abren, elegida, fecha: vistoHace(carrera.fecha) }),
    porPregunta: (pregunta) => carreraParaLaPregunta(carrera, pregunta, vistoHace(carrera.fecha), { elegida, supuestas, abren }),
  });

  // Opening one moves the focus to what it says; closing it, back to its card.
  const detalle = useRef(null);
  const fichas = useRef(new Map());
  const [foco, setFoco] = useState(null);
  useEffect(() => {
    if (!foco) return;
    if (foco.a === 'detalle') detalle.current?.focus();
    else fichas.current.get(foco.a)?.focus();
  }, [foco]);

  const elegir = (clave) => {
    const anterior = elegida;
    setElegida(clave);
    // Opening one hidden by a filter or the electives switch shows it.
    const m = clave && porClave.get(clave);
    if (m && !pasaFiltro(m, filtro)) setFiltro('todo');
    if (m && electivaQuieta(m)) setConElectivas(true);
    setFoco({ a: clave ? 'detalle' : anterior });
  };
  const suponer = (clave) =>
    setSupuestas((s) => {
      const nueva = new Set(s);
      if (nueva.has(clave)) nueva.delete(clave);
      else nueva.add(clave);
      return nueva;
    });

  // Around the chosen one: what it lacks and what it frees.
  const relacionDe = (m) => {
    if (!actual || m.clave === actual.clave) return null;
    const lados = [actual.estado === 'falta' ? actual.cursar : null, actual.estado === 'regular' ? actual.rendir : null].filter(Boolean);
    if (lados.some((l) => l.faltan.some((r) => r.clave === m.clave))) return 'falta';
    const de = (lado) => lado?.faltan.some((r) => r.clave === actual.clave);
    if ((m.estado === 'falta' && de(m.cursar)) || (m.estado === 'regular' && de(m.rendir))) return 'destraba';
    return null;
  };

  const ocultas = carrera.materias.filter(electivaQuieta).length;
  // What a supposition opens always shows, also an elective.
  const seAbre = (m) => abren.cursar.has(m.clave) || abren.rendir.has(m.clave);
  const visibles = carrera.materias.filter((m) => (pasaFiltro(m, filtro) && (conElectivas || !electivaQuieta(m))) || m.clave === elegida || seAbre(m) || supuestas.has(m.clave));
  const cuantasAbren = abren.cursar.size + abren.rendir.size;
  const segmentos = [
    ['aprobada', 'Aprobadas', c.aprobada],
    ['regular', 'Regulares', c.regular],
    ['cursando', 'Cursando', c.cursando],
    ['cursar', 'Podés cursar', c.cursar],
    ['falta', 'Te falta algo', c.falta],
    ['pendiente', 'Sin datos', c.pendiente],
  ].filter(([, , n]) => n > 0);

  return (
    <>
      {c.total > 0 && (
        <section className="carrera-resumen" aria-labelledby={`${id}-resumen`}>
          <div className="carrera-resumen__texto">
            <h2 id={`${id}-resumen`} className="carrera-resumen__titulo">
              {carrera.tiene.estado ? (
                <>
                  <span className="carrera-resumen__cifra">{c.aprobada}</span> de {c.total} {c.total === 1 ? 'materia aprobada' : 'materias aprobadas'}
                </>
              ) : (
                <>
                  <span className="carrera-resumen__cifra">{c.total}</span> {c.total === 1 ? 'materia' : 'materias'} por delante
                </>
              )}
            </h2>
            <ul className="carrera-leyenda">
              {segmentos.map(([clave, texto, n]) => (
                <li key={clave} className={`carrera-leyenda__item carrera-leyenda__item--${clave}`}>{texto} <strong>{n}</strong></li>
              ))}
            </ul>
            <p className="carrera-resumen__nota">Sin contar electivas.</p>
          </div>
          <Plano carrera={carrera} elegida={elegida} />
        </section>
      )}

      {carrera.frenos.length > 0 && (
        <Frenos id={`${id}-frenos`} titulo="Lo que más te frena" frenos={carrera.frenos.slice(0, 3)} elegir={elegir} />
      )}
      {carrera.paraRendir.length > 0 && (
        <Frenos id={`${id}-rendir`} titulo="Finales para rendir" frenos={carrera.paraRendir} elegir={elegir} />
      )}

      <div className="carrera-filtros">
        <div className="tipos" role="group" aria-label="Mostrar">
          {FILTROS.map((f) => (
            <button key={f.clave} type="button" className="tipos__opcion" aria-pressed={filtro === f.clave} onClick={() => setFiltro(f.clave)}>
              {f.texto}
            </button>
          ))}
        </div>
        {ocultas > 0 && (
          <label className="opcion">
            <input type="checkbox" checked={conElectivas} onChange={(e) => setConElectivas(e.target.checked)} />
            Electivas sin cursar ({ocultas})
          </label>
        )}
      </div>

      <div className="carrera-supuesto" role="status">
        {supuestas.size > 0 && (
          <>
            <p>
              Suponiendo que tenés {[...supuestas].map((k) => porClave.get(k)?.nombre ?? k).join(', ')}:{' '}
              {cuantasAbren ? (cuantasAbren === 1 ? 'se te abre 1 materia.' : `se te abren ${cuantasAbren} materias.`) : 'no se te abre ninguna más.'}
            </p>
            <button type="button" className="boton boton--secundario boton--chico" onClick={() => setSupuestas(new Set())}>Dejar de suponer</button>
          </>
        )}
      </div>

      {carrera.anios.map((anio) => {
        const delAnio = carrera.materias.filter((m) => m.anio === anio);
        const lista = visibles.filter((m) => m.anio === anio);
        if (!lista.length) return null;
        const obligatorias = delAnio.filter((m) => !m.electiva);
        const aprobadas = obligatorias.filter((m) => m.estado === 'aprobada').length;
        return (
          <section key={anio ?? 'sin'} className={`carrera-anio${aprobadas && aprobadas === obligatorias.length ? ' carrera-anio--completo' : ''}`} aria-labelledby={`${id}-anio-${anio}`}>
            <div className="carrera-anio__cabeza">
              {anio !== null && <span className="carrera-anio__numero" aria-hidden="true">{anio}</span>}
              <h2 id={`${id}-anio-${anio}`} className="carrera-anio__titulo">{nombreDelAnio(anio)}</h2>
              {carrera.tiene.estado && obligatorias.length > 0 && (
                <>
                  <span className="carrera-anio__barra" aria-hidden="true">
                    {obligatorias.map((m) => <span key={m.clave} className={`carrera-punto carrera-punto--${m.estado}`} />)}
                  </span>
                  <p className="carrera-anio__cuenta">{aprobadas === obligatorias.length ? 'Completo' : `${aprobadas} de ${obligatorias.length} aprobadas`}</p>
                </>
              )}
            </div>
            <ul className="carrera-fichas">
              {lista.map((m) => (
                <Ficha
                  key={m.clave}
                  materia={m}
                  elegida={m.clave === elegida}
                  relacion={relacionDe(m)}
                  abre={abren.cursar.has(m.clave) ? 'cursar' : abren.rendir.has(m.clave) ? 'rendir' : null}
                  supuesta={supuestas.has(m.clave)}
                  onElegir={elegir}
                  referencia={(el) => (el ? fichas.current.set(m.clave, el) : fichas.current.delete(m.clave))}
                />
              ))}
            </ul>
            {actual?.anio === anio && (
              <Detalle
                key={actual.clave}
                referencia={detalle}
                materia={actual}
                carrera={carrera}
                porClave={porClave}
                supuesta={supuestas.has(actual.clave)}
                onSuponer={suponer}
                onElegir={elegir}
                onCerrar={() => elegir(null)}
              />
            )}
          </section>
        );
      })}
      {!visibles.length && <p className="carrera-vacio">{filtro === 'rendir' ? 'Hoy no tenés ninguna para rendir.' : filtro === 'cursar' ? 'Hoy no tenés ninguna para empezar.' : 'No hay materias para mostrar. Probá con las electivas.'}</p>}
    </>
  );
}

// What to say while there is no map: why, and the one thing to do.
function Estado({ titulo, children, accion }) {
  return (
    <section className="carrera-estado" aria-labelledby="carrera-estado-titulo">
      <h2 id="carrera-estado-titulo" className="carrera-estado__titulo">{titulo}</h2>
      <p className="carrera-estado__texto">{children}</p>
      {accion && <div className="carrera-estado__accion">{accion}</div>}
    </section>
  );
}

const IrASysacad = () => <Link className="boton boton--chico" to="/sysacad">Ir a Sysacad en Super CVG</Link>;
const AbrirSysacad = () => (
  <a className="boton boton--chico" href={SYSACAD} target="_blank" rel="noopener noreferrer">Abrir Sysacad{otraPestana}</a>
);

export default function Carrera() {
  useSeo({ titulo: tituloDe('Tu carrera'), noindex: true });
  const { copias, sinCopias, finales, buscandoDrive } = useSysacad();
  const perfil = useConsulta(() => cargarPerfil(), [], { alInstante: true });

  // The demo has no extension: its made-up answer comes through the same window and the same check.
  useEffect(() => {
    if (!import.meta.env.DEV || !esDemo(tokenActual())) return;
    import('../lib/demoSysacad').then(({ mensajeDeEjemplo }) => window.postMessage(mensajeDeEjemplo(), window.location.origin));
  }, []);

  // What the student confirmed in Sysacad changes whose the copies are.
  useMio();
  const nombre = perfil.datos?.completo ?? '';
  const suyas = Boolean(copias?.alumno && nombre.trim() && mismoAlumno(copias.alumno, nombre));
  const carrera = useMemo(() => (suyas ? armarCarrera(copias.pestanas, finales) : null), [suyas, copias, finales]);

  let contenido;
  if (!copias && !sinCopias) {
    contenido = <Cargando texto="Buscando Sysacad Lindo" cuantas={3} />;
  } else if (!copias && buscandoDrive) {
    contenido = <Cargando texto="Buscando en tu Drive" cuantas={3} />;
  } else if (!copias?.vinculada || !copias.guarda || !copias.pestanas.length || !copias.alumno) {
    contenido = (
      <Estado titulo="Primero, Sysacad Lindo" accion={<IrASysacad />}>
        Tu carrera sale de lo que abrís en Sysacad. En la pantalla Sysacad te decimos qué falta para conectarlo.
      </Estado>
    );
  } else if (perfil.error && !perfil.datos) {
    contenido = <ErrorConReintento texto={perfil.error} recargar={perfil.recargar} />;
  } else if (!perfil.datos) {
    contenido = <Cargando texto="Buscando tu cuenta" cuantas={3} />;
  } else if (!suyas) {
    contenido = (
      <Estado titulo="¿Son tuyas?" accion={<IrASysacad />}>
        Las copias de Sysacad tienen otro nombre. Confirmalo en la pantalla Sysacad.
      </Estado>
    );
  } else if (!carrera.tiene.cursar && !carrera.tiene.estado) {
    contenido = (
      <Estado titulo="Abrí tus correlatividades" accion={<AbrirSysacad />}>
        En Sysacad, entrá a Estado académico y a Correlatividad para cursar. Cuando vuelvas, tu carrera está acá.
      </Estado>
    );
  } else {
    const faltan = [!carrera.tiene.estado && 'Estado académico', !carrera.tiene.cursar && 'Correlatividad para cursar', !carrera.tiene.cursar && !carrera.tiene.rendir && 'Correlatividad para rendir'].filter(Boolean);
    contenido = (
      <>
        <div className="carrera-aviso">
          <p>
            Según lo que abriste de Sysacad {vistoHace(carrera.fecha)}.
            {faltan.length > 0 && ` Para verla entera, abrí también ${new Intl.ListFormat('es', { type: 'conjunction' }).format(faltan)}.`}
            {carrera.aprobadasSinMapa > 0 && ` Tenés ${carrera.aprobadasSinMapa} ${carrera.aprobadasSinMapa === 1 ? 'aprobada que entra' : 'aprobadas que entran'} al mapa con Estado académico.`}
          </p>
          <AbrirSysacad />
        </div>
        <Mapa carrera={carrera} />
      </>
    );
  }

  return (
    <div className="contenedor pagina carrera-pagina">
      <h1>Tu carrera</h1>
      <p className="carrera-pagina__bajada">Qué tenés, qué podés cursar y qué te frena. Tocá una materia para ver qué le falta.</p>
      <div aria-busy={!copias && !sinCopias ? 'true' : undefined}>{contenido}</div>
    </div>
  );
}
