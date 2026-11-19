import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Cargando, ErrorConReintento } from '../components/Filas';
import { useUI } from '../components/ui';
import { cargarPerfil } from '../lib/campus';
import { esDemo } from '../lib/modoDemo';
import { tituloDe, useSeo } from '../lib/seo';
import { tokenActual } from '../lib/sesion';
import { olvidarPestanasSysacad, SYSACAD, SYSACAD_LINDO, useSysacad, vincularSysacad } from '../lib/sysacad';
import { fechaCompleta, mismoAlumno, vistoHace } from '../lib/sysacadPestanas';
import { datosDe, leerCorrelativas, leerEstadoAcademico } from '../lib/sysacadVistas';
import { Bloques, Certificados, Correlativas, EstadoAcademico } from './SysacadVistas';
import { normalizar } from '../lib/datos';
import { useConsulta } from '../lib/useConsulta';
import './panel.css';
import './sysacad.css';

const otraPestana = <span className="solo-lectores">, se abre en otra pestaña</span>;
// On its folder tab, a short name so the seven fit in a row on a computer. The sheet says the whole one, and so does
// the tab to a screen reader.
const CORTOS = { parciales: 'Parciales', plan: 'Plan', 'correlativas-cursar': 'Para cursar', 'correlativas-rendir': 'Para rendir' };

function AbrirSysacad({ referencia, chico = true }) {
  return (
    <a ref={referencia} className={`boton boton--secundario${chico ? ' boton--chico' : ''}`} href={SYSACAD} target="_blank" rel="noopener noreferrer">
      Abrir Sysacad{otraPestana}
    </a>
  );
}

// What to say while there are no copies to show: why, and the one thing to do about it.
function Estado({ titulo, children, acciones, referencia }) {
  return (
    <section ref={referencia} className="sysacad-estado" tabIndex={-1} aria-labelledby="sysacad-estado-titulo">
      <h2 id="sysacad-estado-titulo" className="sysacad-estado__titulo">{titulo}</h2>
      <p className="sysacad-estado__texto">{children}</p>
      {acciones && <div className="sysacad-estado__acciones">{acciones}</div>}
    </section>
  );
}

/** One saved tab, the way Sysacad Lindo redraws that page: its name, the date Sysacad gave the data, and then what
 * matters first. What has no view of its own goes as a table with search, filters and sorting. */
function Copia({ pestana }) {
  const { al, bloques } = useMemo(() => datosDe(pestana), [pestana]);
  const vista = useMemo(() => {
    if (pestana.clave === 'estado') return leerEstadoAcademico(bloques);
    if (pestana.clave.startsWith('correlativas-')) return leerCorrelativas(bloques, pestana.clave === 'correlativas-rendir' ? 'rendir' : 'cursar');
    return null;
  }, [pestana.clave, bloques]);
  // Around the table the view draws, what else the copy brought (the career and the plan, in Estado académico).
  const donde = vista ? bloques.indexOf(vista.tabla) : -1;
  const antes = donde >= 0 ? bloques.slice(0, donde) : [];
  const despues = donde >= 0 ? bloques.slice(donde + 1) : [];

  let cuerpo;
  if (vista && pestana.clave === 'estado') cuerpo = <EstadoAcademico datos={vista} />;
  else if (vista) cuerpo = <Correlativas datos={vista} para={pestana.clave === 'correlativas-rendir' ? 'rendir' : 'cursar'} />;
  else if (pestana.clave === 'certificados') cuerpo = <Certificados bloques={bloques} />;
  else cuerpo = <Bloques bloques={bloques} de={pestana.titulo} />;

  return (
    <>
      <div className="sysacad-copia__cabeza">
        <h2 className="sysacad-copia__titulo">{pestana.titulo}</h2>
        <p className="sysacad-copia__al">
          {al ? `Datos al ${al}` : <>Visto el <time dateTime={new Date(pestana.fecha).toISOString()}>{fechaCompleta(pestana.fecha)}</time></>}
        </p>
      </div>
      <div className="sysacad-copia__cuerpo">
        {bloques.length ? (
          <>
            <Bloques bloques={antes} de={pestana.titulo} />
            {cuerpo}
            <Bloques bloques={despues} de={pestana.titulo} />
          </>
        ) : (
          <p className="sysacad-copia__parrafo sysacad-copia__vacia">Esta pestaña no tenía nada más.</p>
        )}
      </div>
    </>
  );
}

/** The saved tabs, one folder tab each, in Sysacad Lindo's order. Arrows, Inicio and Fin move among them. */
function Copias({ pestanas }) {
  const id = useId();
  const [elegida, setElegida] = useState(pestanas[0].clave);
  const actual = pestanas.find((p) => p.clave === elegida) ?? pestanas[0];
  // «Visto hace…» goes forward on its own while the page is open.
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const reloj = setInterval(() => setAhora(Date.now()), 60_000);
    return () => clearInterval(reloj);
  }, []);

  // On a phone the tabs scroll sideways: the chosen one stays in sight, without moving the page up or down. While
  // there are more tabs past the right edge, that edge fades so it shows.
  const solapas = useRef(null);
  const [sigue, setSigue] = useState(false);
  const medir = () => {
    const lista = solapas.current;
    if (lista) setSigue(lista.scrollLeft + lista.clientWidth < lista.scrollWidth - 2);
  };
  useEffect(() => {
    const lista = solapas.current;
    const verLaElegida = () => {
      const el = lista?.querySelector('[aria-selected="true"]');
      if (!el) return;
      if (el.offsetLeft < lista.scrollLeft) lista.scrollLeft = el.offsetLeft - 4;
      else if (el.offsetLeft + el.offsetWidth > lista.scrollLeft + lista.clientWidth) lista.scrollLeft = el.offsetLeft + el.offsetWidth - lista.clientWidth + 4;
      medir();
    };
    verLaElegida();
    window.addEventListener('resize', verLaElegida);
    return () => window.removeEventListener('resize', verLaElegida);
  }, [actual.clave]);

  const mover = (e) => {
    // Alt and an arrow is the browser's back and forward: not ours.
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const i = pestanas.findIndex((p) => p.clave === actual.clave);
    const destino = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: pestanas.length - 1 }[e.key];
    if (destino === undefined) return;
    e.preventDefault();
    const otra = pestanas[(destino + pestanas.length) % pestanas.length];
    setElegida(otra.clave);
    document.getElementById(`${id}-${otra.clave}`)?.focus();
  };

  return (
    <div className="sysacad-carpeta">
      <div ref={solapas} className={`sysacad-solapas${sigue ? ' sysacad-solapas--sigue' : ''}`} role="tablist" aria-label="Pestañas de Sysacad" onKeyDown={mover} onScroll={medir}>
        {pestanas.map((p) => (
          <button
            key={p.clave}
            id={`${id}-${p.clave}`}
            type="button"
            role="tab"
            aria-selected={p.clave === actual.clave}
            aria-controls={`${id}-panel`}
            tabIndex={p.clave === actual.clave ? 0 : -1}
            className="sysacad-solapa"
            aria-label={`${CORTOS[p.clave] && !normalizar(p.titulo).includes(normalizar(CORTOS[p.clave])) ? `${CORTOS[p.clave]}, ` : ''}${p.titulo}, ${vistoHace(p.fecha, ahora)}`}
            onClick={() => setElegida(p.clave)}
          >
            <span className="sysacad-solapa__nombre">{CORTOS[p.clave] ?? p.titulo}</span>
            <span className="sysacad-solapa__cuando">{vistoHace(p.fecha, ahora)}</span>
          </button>
        ))}
      </div>
      <div id={`${id}-panel`} className="sysacad-hoja" role="tabpanel" aria-labelledby={`${id}-${actual.clave}`} tabIndex={0}>
        <Copia key={actual.clave} pestana={actual} />
      </div>
    </div>
  );
}

export default function Sysacad() {
  useSeo({ titulo: tituloDe('Sysacad'), noindex: true });
  const { estado, pidio, copias, sinCopias } = useSysacad();
  const perfil = useConsulta(() => cargarPerfil());
  const { confirmar } = useUI();
  // After «Vincular» or «Borrar las copias» the focus goes to what took their place, once it is on the page. If that
  // never shows up, to the screen's title, never lost on the body.
  const [foco, setFoco] = useState(null);
  const abrir = useRef(null);
  const estadoRef = useRef(null);
  const titulo = useRef(null);
  useEffect(() => {
    if (!foco) return;
    // A new object each time: the same request twice still moves the focus.
    const destino = (foco.a === 'abrir' ? abrir.current : estadoRef.current) ?? titulo.current;
    destino?.focus();
  }, [foco]);

  // The demo has no extension: its made-up answer comes through the same window and the same check.
  useEffect(() => {
    if (!import.meta.env.DEV || !esDemo(tokenActual())) return;
    import('../lib/demoSysacad').then(({ mensajeDeEjemplo }) => window.postMessage(mensajeDeEjemplo(), window.location.origin));
  }, []);

  const vincular = () => {
    vincularSysacad();
    setFoco({ a: 'abrir' });
  };
  const borrar = async () => {
    const ok = await confirmar({ titulo: '¿Borrar las copias de Sysacad?', texto: 'Se borran de Sysacad Lindo en este navegador.', boton: 'Borrar' });
    if (!ok) return;
    olvidarPestanasSysacad();
    setFoco({ a: 'estado' });
  };

  const conExtension = estado === 'vinculada' || estado === 'sin-vincular';
  const nombre = perfil.datos?.completo ?? '';
  let contenido;
  if (!copias && !sinCopias) {
    contenido = <Cargando texto="Buscando Sysacad Lindo" cuantas={3} />;
  } else if (!copias && conExtension) {
    contenido = (
      <Estado titulo="Actualizá Sysacad Lindo" acciones={<a className="boton boton--chico" href={SYSACAD_LINDO} target="_blank" rel="noreferrer">Bajar la versión nueva{otraPestana}</a>}>
        La que tenés no guarda las pestañas de Sysacad. La nueva sí.
      </Estado>
    );
  } else if (!copias) {
    contenido = (
      <Estado titulo="Instalá Sysacad Lindo" acciones={<a className="boton boton--chico" href={SYSACAD_LINDO} target="_blank" rel="noreferrer">Bajar Sysacad Lindo{otraPestana}</a>}>
        Es una extensión para Chrome y Edge. Guarda una copia de cada pestaña de Sysacad que abrís.
      </Estado>
    );
  } else if (!copias.vinculada && !pidio) {
    contenido = (
      <Estado
        titulo="Vinculá Sysacad Lindo"
        acciones={
          <button type="button" className="boton boton--chico" onClick={vincular}>
            Vincular con Sysacad Lindo<span className="solo-lectores">. Sysacad se abre en otra pestaña</span>
          </button>
        }
      >
        Vinculala y cada pestaña de Sysacad que abras queda acá.
      </Estado>
    );
  } else if (!copias.vinculada) {
    contenido = (
      <Estado titulo="Entrá a Sysacad" acciones={<AbrirSysacad referencia={abrir} />}>
        Iniciá sesión y abrí las pestañas que quieras tener acá, como Estado académico o Exámenes.
      </Estado>
    );
  } else if (!copias.guarda) {
    contenido = (
      <Estado titulo="Sysacad Lindo no está guardando" acciones={<AbrirSysacad />}>
        Prendé «Guardar las pestañas que abrís» en sus ajustes, debajo de Super CVG. Después abrí Sysacad.
      </Estado>
    );
  } else if (!copias.pestanas.length) {
    contenido = (
      <Estado titulo="Todavía no hay copias" referencia={estadoRef} acciones={<AbrirSysacad referencia={abrir} />}>
        Entrá a Estado académico, Notas de parciales o Exámenes. Cada pestaña que abras queda acá.
      </Estado>
    );
  } else if (!copias.alumno) {
    contenido = (
      <Estado titulo="Falta saber de quién son" acciones={<AbrirSysacad />}>
        Entrá al menú principal de Sysacad y volvé. Ahí Sysacad Lindo lee tu nombre.
      </Estado>
    );
  } else if (perfil.error && !perfil.datos) {
    contenido = <ErrorConReintento texto={perfil.error} recargar={perfil.recargar} />;
  } else if (!perfil.datos) {
    contenido = <Cargando texto="Buscando tu cuenta" cuantas={3} />;
  } else if (!nombre.trim()) {
    // Without the campus name there is no telling whose they are: nothing shown, and nothing offered to delete.
    contenido = (
      <Estado titulo="No sabemos de quién son">
        El campus no nos pasó tu nombre, así que no podemos ver si las copias de Sysacad son tuyas.
      </Estado>
    );
  } else if (!mismoAlumno(copias.alumno, nombre)) {
    contenido = (
      <Estado titulo="Son de otra cuenta" acciones={<button type="button" className="boton boton--chico" onClick={borrar}>Borrar las copias</button>}>
        Las copias de Sysacad de este navegador no son de tu cuenta del campus.
      </Estado>
    );
  } else {
    contenido = (
      <>
        <div className="sysacad-aviso">
          <p>Es una copia de lo que viste. En Sysacad puede haber algo más nuevo.</p>
          <AbrirSysacad />
        </div>
        <Copias pestanas={copias.pestanas} />
      </>
    );
  }

  return (
    <div className="contenedor pagina sysacad-pagina">
      <h1 ref={titulo} tabIndex={-1}>Sysacad</h1>
      <p className="sysacad-pagina__bajada">Lo último que abriste de Sysacad, para verlo aunque Sysacad no ande.</p>
      {/* What arrives from the extension changes this without a reload: a screen reader hears the new state's title,
          never a whole table. */}
      <p className="solo-lectores" role="status">{contenido.type === Estado ? contenido.props.titulo : copias?.pestanas?.length && nombre ? 'Copias de Sysacad' : ''}</p>
      <div aria-busy={!copias && !sinCopias ? 'true' : undefined}>{contenido}</div>
    </div>
  );
}
