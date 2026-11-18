import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Cargando, ErrorConReintento } from './Filas';
import { useAbrirPrevia } from './Previa';
import { Icono, IconoDeItem } from './Simbolo';
import { useUI } from './ui';
import { fecha } from '../lib/datos';
import { buscarEnMapa, CARRERA, drivesDe, tipoDe } from '../lib/drivePublico';
import { partesDe } from '../lib/inscripcion';
import { alternarEscondido, armarDrive, cancelarArmado, CERRADAS, itemDeNodo, quitarDrive, sumarDrive, useMapasDrive, volverACargar } from '../lib/mapasDrive';
import { textoError } from '../lib/errores';
import { useMio } from '../lib/mio';

const FILTROS = [
  { valor: '', texto: 'Todo', icono: 'capas' },
  { valor: 'pdf', texto: 'PDF', icono: 'documento', tono: 'pdf' },
  { valor: 'presentacion', texto: 'Presentaciones', icono: 'presentacion', tono: 'presentacion' },
  { valor: 'documento', texto: 'Documentos', icono: 'documento', tono: 'doc' },
  { valor: 'imagen', texto: 'Imágenes', icono: 'imagen', tono: 'imagen' },
  { valor: 'otro', texto: 'Otros', icono: 'capas' },
];
const OTROS = new Set(['otro', 'planilla', 'video']);
const esDelFiltro = (tipo, filtro) => !filtro || tipo === filtro || (filtro === 'otro' && OTROS.has(tipo));
// What a folder shows before «Ver todo», and the search before «Ver más».
const POR_CARPETA = 100;
const POR_BUSQUEDA = 50;

const cuantas = (n, una, varias) => (n === 1 ? `1 ${una}` : `${n.toLocaleString('es-AR')} ${varias}`);
const archivosEn = (cuenta, filtro) => Object.entries(cuenta ?? {}).reduce((n, [t, c]) => n + (esDelFiltro(t, filtro) ? c : 0), 0);
const idDeFila = (id) => `drive-${id}`;

function leerCerradas() {
  try {
    const lista = JSON.parse(sessionStorage.getItem(CERRADAS) ?? '[]');
    return new Set(Array.isArray(lista) ? lista.filter((x) => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

/** Whether a node, or a folder it is in, was hidden. */
function escondidoEn(indice, ocultos, nodo) {
  for (let n = nodo, vueltas = 0; n && vueltas < 60; n = indice.porId.get(n.p), vueltas += 1) if (ocultos.has(n.id)) return true;
  return false;
}

function Nombre({ nodo, consulta }) {
  if (!consulta) return nodo.n;
  return partesDe(nodo.n, consulta).map((p, i) => (p.marca ? <mark key={i}>{p.texto}</mark> : <span key={i}>{p.texto}</span>));
}

// One folder or file: the folder opens below itself, the file in the preview. The eye hides it (or shows it again).
function Fila({ nodo, indice, ctx, nivel, consulta = '', donde = null }) {
  const { filtro, ocultos, conEscondidos, abiertas, alternar, abrir, irACarpeta } = ctx;
  const escondido = ocultos.has(nodo.id);
  const ruta = donde ?? indice.ruta(nodo).join(' / ');
  const cuenta = nodo.c ? archivosEn(indice.tipos.get(nodo.id), filtro) : 0;
  const abierta = nodo.c && !consulta && abiertas.has(nodo.id);
  const dato = [
    consulta ? ruta : null,
    nodo.c ? cuantas(cuenta, 'archivo', 'archivos') : nodo.f ? `Del ${fecha(Math.floor(nodo.f / 1000))}` : null,
    escondido ? 'Escondido' : null,
  ].filter(Boolean).join(', ');
  const principal = () => {
    if (!nodo.c) abrir(itemDeNodo(nodo, ruta));
    else if (consulta) irACarpeta(nodo);
    else alternar(nodo.id);
  };
  return (
    <li className="drive__item" data-escondido={escondido || undefined}>
      <div className="fila drive__fila" style={{ '--nivel': nivel }}>
        <button id={idDeFila(nodo.id)} type="button" className="fila__principal" onClick={principal} aria-expanded={nodo.c && !consulta ? abierta : undefined} aria-haspopup={nodo.c ? undefined : 'dialog'}>
          {nodo.c ? <Icono nombre="carpeta" tono="enlace" tamano="tipo" /> : <IconoDeItem item={{ tipo: 'archivo', archivo: nodo.n, mime: nodo.m ?? '' }} />}
          <span className="fila__texto">
            <span className="fila__nombre"><Nombre nodo={nodo} consulta={consulta} /></span>
            {dato && <span className="fila__dato">{dato}</span>}
          </span>
          {nodo.c && !consulta && <svg className="drive__flecha" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 6l6 6-6 6" /></svg>}
        </button>
        {(conEscondidos || !escondido) && (
          <button type="button" className="drive__esconder" aria-pressed={escondido} aria-label={escondido ? `Mostrar ${nodo.n}` : `Esconder ${nodo.n}`} title={escondido ? 'Mostrar' : 'Esconder'} onClick={() => alternarEscondido(nodo.id)}>
            <Icono nombre="ojo" tamano="mini" />
          </button>
        )}
      </div>
      {abierta && <Hijos padre={nodo.id} indice={indice} ctx={ctx} nivel={nivel + 1} />}
    </li>
  );
}

function Hijos({ padre, indice, ctx, nivel }) {
  const [todos, setTodos] = useState(false);
  const { filtro, ocultos, conEscondidos } = ctx;
  const lista = (indice.hijos.get(padre) ?? []).filter((n) => (conEscondidos || !ocultos.has(n.id)) && (n.c ? archivosEn(indice.tipos.get(n.id), filtro) > 0 || !filtro : esDelFiltro(tipoDe(n), filtro)));
  if (!lista.length) return <p className="drive__vacia" style={{ '--nivel': nivel }}>{filtro ? 'No hay archivos de este tipo acá.' : 'Esta carpeta está vacía.'}</p>;
  const vistos = todos ? lista : lista.slice(0, POR_CARPETA);
  return (
    <>
      <ul className="drive__lista">
        {vistos.map((n) => <Fila key={n.id} nodo={n} indice={indice} ctx={ctx} nivel={nivel} />)}
      </ul>
      {vistos.length < lista.length && (
        <button type="button" className="boton boton--secundario boton--chico drive__mas" style={{ '--nivel': nivel }} onClick={() => setTodos(true)}>Ver los {lista.length}</button>
      )}
    </>
  );
}

// The state of a Drive's map, under its name.
function Estado({ drive, estado }) {
  if (!estado || estado.estado === 'cargando') return <Cargando texto="Abriendo el mapa" />;
  if (estado.estado === 'armando') {
    return (
      <div className="drive__armando" role="status">
        <span>Armando el mapa: van {cuantas(estado.cuantos ?? 0, 'cosa', 'cosas')}.</span>
        <button type="button" className="boton boton--secundario boton--chico" onClick={() => cancelarArmado(drive.id)}>Frenar</button>
      </div>
    );
  }
  if (estado.estado === 'error' && !estado.indice) return <ErrorConReintento texto={estado.error} recargar={() => (drive.carrera ? volverACargar(drive) : armarDrive(drive))} />;
  if (estado.estado === 'error') return <p className="drive__aviso" role="alert">{estado.error}</p>;
  if (estado.estado === 'sin-mapa') {
    return (
      <div className="drive__armando">
        <span>El mapa quedó sin armar.</span>
        <button type="button" className="boton boton--secundario boton--chico" onClick={() => armarDrive(drive)}>Armarlo</button>
      </div>
    );
  }
  return null;
}

function SumarDrive() {
  const [link, setLink] = useState('');
  const [error, setError] = useState('');
  const [sumando, setSumando] = useState(false);
  const enviar = async (e) => {
    e.preventDefault();
    if (sumando) return;
    setSumando(true);
    setError('');
    try {
      await sumarDrive(link);
      setLink('');
    } catch (err) {
      setError(textoError(err));
    }
    setSumando(false);
  };
  // As Campo.jsx, with the button on the box's line: an error under both doesn't move it.
  const id = useId();
  return (
    <form className="campo drive__sumar" onSubmit={enviar} noValidate>
      <label className="campo__etiqueta" htmlFor={id}>Sumar una carpeta de Drive</label>
      <span id={`${id}-ayuda`} className="campo__ayuda">Pegá su link. Tiene que estar compartida con cualquiera que tenga el link.</span>
      <div className="drive__sumar-fila">
        <input id={id} className="campo__control" type="url" inputMode="url" autoComplete="off" spellCheck="false" placeholder="https://drive.google.com/drive/folders/…" aria-invalid={error ? true : undefined} aria-describedby={[`${id}-ayuda`, error ? `${id}-error` : null].filter(Boolean).join(' ')} value={link} onChange={(e) => setLink(e.target.value)} />
        <button type="submit" className="boton" aria-disabled={sumando || undefined}>{sumando ? 'Sumando' : 'Sumar'}</button>
      </div>
      {error && <span id={`${id}-error`} className="campo__error" role="alert">{error}</span>}
    </form>
  );
}

/** The Drive folders of the student, as in Drive, and the search in their names. `consulta`: what Buscar has written.
 * `alVerCarpeta`: a folder found was chosen (Buscar clears the search, and the folder shows open in its place). */
export default function BuscarEnDrive({ consulta, alVerCarpeta }) {
  const mio = useMio();
  const drives = useMemo(() => drivesDe(mio.drive), [mio.drive]);
  const mapas = useMapasDrive(drives);
  const abrir = useAbrirPrevia();
  const { confirmar } = useUI();
  const [filtro, setFiltro] = useState('');
  const [conEscondidos, setConEscondidos] = useState(false);
  const [abiertas, setAbiertas] = useState(() => new Set());
  // The Drives closed whole, for the tab: coming back finds them as they were.
  const [cerradas, setCerradas] = useState(leerCerradas);
  const alternarDrive = (id) => setCerradas((c) => {
    const nuevas = new Set(c);
    if (nuevas.has(id)) nuevas.delete(id);
    else nuevas.add(id);
    try {
      sessionStorage.setItem(CERRADAS, JSON.stringify([...nuevas]));
    } catch {
      // Without storage it stays for this visit to the page.
    }
    return nuevas;
  });
  // How many found show, for the search it was for: another search starts again from the first ones.
  const [verMas, setVerMas] = useState({ para: '', cuantos: POR_BUSQUEDA });
  const enfocar = useRef(null);
  const ocultos = useMemo(() => new Set(mio.drive.ocultos), [mio.drive.ocultos]);
  const hayConsulta = consulta.trim().length > 0;
  const busqueda = `${filtro} ${consulta}`;
  const cuantosHallados = verMas.para === busqueda ? verMas.cuantos : POR_BUSQUEDA;
  const setCuantosHallados = (f) => setVerMas({ para: busqueda, cuantos: f(cuantosHallados) });
  // A folder chosen from the search: its row, once it is in view.
  useEffect(() => {
    if (!enfocar.current) return;
    const el = document.getElementById(idDeFila(enfocar.current));
    if (!el) return;
    enfocar.current = null;
    el.focus();
    el.scrollIntoView({ block: 'center' });
  });

  const alternar = (id) => setAbiertas((a) => {
    const nuevas = new Set(a);
    if (nuevas.has(id)) nuevas.delete(id);
    else nuevas.add(id);
    return nuevas;
  });

  const irACarpeta = (indice) => (nodo) => {
    const camino = [nodo.id];
    for (let p = indice.porId.get(nodo.p), vueltas = 0; p && vueltas < 60; p = indice.porId.get(p.p), vueltas += 1) camino.push(p.id);
    setAbiertas((a) => new Set([...a, ...camino, indice.mapa.id]));
    enfocar.current = nodo.id;
    alVerCarpeta();
  };

  const quitar = async (drive) => {
    const ok = await confirmar({
      titulo: drive.carrera ? '¿Quitar el Drive de la carrera?' : `¿Quitar «${drive.nombre}»?`,
      texto: drive.carrera ? 'Para volver a tenerlo, pegá su link abajo.' : undefined,
      boton: 'Quitar',
      peligro: true,
    });
    if (ok) quitarDrive(drive.id);
  };

  const ctxDe = (indice) => ({ filtro, ocultos, conEscondidos, abiertas, alternar, abrir, irACarpeta: irACarpeta(indice) });
  const escondidos = mio.drive.ocultos.length;

  // The search, Drive by Drive.
  const hallados = useMemo(() => {
    if (!hayConsulta) return null;
    return drives.map((d) => {
      const indice = mapas.get(d.id)?.indice;
      if (!indice) return { drive: d, indice: null, nodos: [] };
      const valido = (n) => (n.c ? !filtro : esDelFiltro(tipoDe(n), filtro)) && (conEscondidos || !escondidoEn(indice, ocultos, n));
      return { drive: d, indice, nodos: buscarEnMapa(indice, consulta, { valido }) };
    });
  }, [hayConsulta, drives, mapas, consulta, filtro, conEscondidos, ocultos]);
  const total = hallados?.reduce((n, h) => n + h.nodos.length, 0) ?? 0;

  return (
    <div className="drive">
      <div className="buscar__filtros">
        <div className="tipos buscar__tira" role="group" aria-label="Mostrar">
          {FILTROS.map((f) => (
            <button key={f.valor} type="button" className="tipos__opcion" aria-pressed={filtro === f.valor} onClick={() => setFiltro(f.valor)}>
              <Icono nombre={f.icono} tono={f.tono} tamano="mini" />{f.texto}
            </button>
          ))}
        </div>
        {escondidos > 0 && (
          <label className="opcion">
            <input type="checkbox" checked={conEscondidos} onChange={(e) => setConEscondidos(e.target.checked)} />
            Mostrar lo escondido ({escondidos})
          </label>
        )}
      </div>

      {hallados && (
        <p className="buscar__estado" role="status">
          {total === 0 ? 'No hay carpetas ni archivos con ese nombre.' : `${total >= 300 ? 'Más de 300' : total} ${total === 1 ? 'resultado' : 'resultados'}`}
        </p>
      )}

      {drives.map((d) => {
        const estado = mapas.get(d.id);
        const indice = estado?.indice;
        const deBusqueda = hallados?.find((h) => h.drive.id === d.id);
        if (hallados && !deBusqueda?.nodos.length) return null;
        const armado = indice?.mapa.armado;
        const dato = indice ? [cuantas(archivosEn(indice.tipos.get(indice.mapa.id), ''), 'archivo', 'archivos'), armado ? `mapa del ${fecha(Math.floor(armado / 1000))}` : null].filter(Boolean).join(', ') : '';
        const idTitulo = `drive-titulo-${d.id}`;
        // While searching, what was found shows even in a Drive closed.
        const cerrada = !hallados && cerradas.has(d.id);
        return (
          <section key={d.id} className="drive__raiz" aria-labelledby={idTitulo}>
            <div className="drive__cabeza">
              <h2 id={idTitulo} className="drive__nombre">
                {hallados ? (
                  <>
                    <Icono nombre="carpeta" tono="enlace" tamano="tipo" />
                    {d.carrera ? CARRERA.nombre : d.nombre}
                  </>
                ) : (
                  <button type="button" className="drive__abrir" aria-expanded={!cerrada} onClick={() => alternarDrive(d.id)}>
                    <Icono nombre="carpeta" tono="enlace" tamano="tipo" />
                    {d.carrera ? CARRERA.nombre : d.nombre}
                    <svg className="drive__flecha" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 6l6 6-6 6" /></svg>
                  </button>
                )}
              </h2>
              {dato && <span className="drive__dato">{dato}</span>}
              {!hallados && (
                <div className="drive__acciones">
                  {!d.carrera && estado?.estado !== 'armando' && <button type="button" className="boton boton--secundario boton--chico" onClick={() => armarDrive(d)}>Actualizar</button>}
                  <button type="button" className="boton boton--secundario boton--chico" onClick={() => quitar(d)}>Quitar<span className="solo-lectores"> {d.carrera ? CARRERA.nombre : d.nombre}</span></button>
                </div>
              )}
            </div>
            {!hallados && !cerrada && <Estado drive={d} estado={estado} />}
            {indice && !hallados && !cerrada && <Hijos padre={indice.mapa.id} indice={indice} ctx={ctxDe(indice)} nivel={0} />}
            {deBusqueda && (
              <>
                <ul className="drive__lista">
                  {deBusqueda.nodos.slice(0, cuantosHallados).map((n) => <Fila key={n.id} nodo={n} indice={deBusqueda.indice} ctx={ctxDe(deBusqueda.indice)} nivel={0} consulta={consulta} />)}
                </ul>
                {deBusqueda.nodos.length > cuantosHallados && (
                  <button type="button" className="boton boton--secundario boton--chico drive__mas" onClick={() => setCuantosHallados((n) => n + POR_BUSQUEDA)}>Ver más<span className="solo-lectores"> de {d.nombre}</span></button>
                )}
              </>
            )}
          </section>
        );
      })}

      {!hallados && <SumarDrive />}
    </div>
  );
}
