import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Campo from '../components/Campo';
import Combo from '../components/Combo';
import { Cargando, ErrorConReintento } from '../components/Filas';
import Simbolo, { Icono } from '../components/Simbolo';
import { useUI } from '../components/ui';
import { buscarCursos, cargarAreas, cargarMaterias, cargarPerfil, cursosDeCategoria, inscribirmeEn, revisarInscripcion } from '../lib/campus';
import { textoError } from '../lib/errores';
import { anioDe, categoriasConCursos, coincide, conDocentes, enRama, esDeOtroAnio, juntar, lugarDe, partesDe, porLetra, sinAnio } from '../lib/inscripcion';
import { tituloDe, useSeo } from '../lib/seo';
import { simboloDeDepartamento } from '../lib/simbolos';
import { useConsulta } from '../lib/useConsulta';
import { useQuieto } from '../lib/useQuieto';
import './panel.css';
import './inscripcion.css';

// Enrolling in a course of the campus, always after asking. Finding it is the point: by name without minding accents,
// and by department (Sistemas, Civil, Básicas…), the way the campus files them. Courses of past years stay out unless
// asked for. What comes from the campus stays in memory, and what was typed stays in the state, never in the URL.

// How many courses show at a time.
const DE_A = 20;
// Past this many options, a list to type into instead of a plain one.
const MUCHAS = 12;
const CERRADA = 'La inscripción a esta materia está cerrada o llena.';
const ESTE_ANIO = new Date().getFullYear();

// Only letters and numbers count: a comma or a sign would change the search and match nothing in the names.
const limpia = (texto) => texto.split(/\s+/).map((p) => p.replace(/[^\p{L}\p{N}]/gu, '')).filter(Boolean).join(' ');

/** The next courses for what is chosen, from batch `desde` on: search pages with words, an area's categories without.
 * Without `viejas`, the ones a past year names stay out. */
async function tanda(arbol, consulta, raiz, desde, viejas) {
  const vale = (c) => viejas || !esDeOtroAnio(c, ESTE_ANIO);
  if (consulta) {
    return juntar((n) => buscarCursos(consulta, n), {
      desde,
      quiero: DE_A,
      vueltas: 4,
      aceptar: (c) => coincide(c, consulta) && enRama(arbol, c.categoria, raiz) && vale(c),
    });
  }
  const categorias = categoriasConCursos(arbol, raiz);
  if (desde >= categorias.length) return { cursos: [], siguiente: null };
  return juntar(async (n) => ({ cursos: await cursosDeCategoria(categorias[n]), fin: n + 1 >= categorias.length }), { desde, quiero: DE_A, vueltas: 6, aceptar: vale });
}

const unicos = (cursos) => [...new Map(cursos.map((c) => [c.id, c])).values()];

function Partes({ partes }) {
  return partes.map((p, i) => (p.marca ? <mark key={i}>{p.texto}</mark> : <span key={i}>{p.texto}</span>));
}

/** A plain list for a few options, one to type into for many (Combo). Inside Campo, which gives it its label. */
function Elegir({ opciones, valor, onCambiar, todas, nombreLista, vacio, limpiar, ...resto }) {
  if (opciones.length > MUCHAS) {
    return (
      <Combo
        {...resto}
        opciones={opciones.map((o) => ({ valor: String(o.id), nombre: o.nombre }))}
        valor={valor}
        onCambiar={onCambiar}
        todas={todas}
        nombreLista={nombreLista}
        vacio={vacio}
        limpiar={limpiar}
      />
    );
  }
  return (
    <select {...resto} className="campo__control" value={valor} onChange={(e) => onCambiar(e.target.value)}>
      <option value="">{todas}</option>
      {opciones.map((o) => <option key={o.id} value={String(o.id)}>{o.nombre}</option>)}
    </select>
  );
}

/** What can be done with one course: already in it, enrol (with the course key if it asks for one), or not from here. */
function Accion({ curso, inscripto, alInscribirse }) {
  const { confirmar, avisar } = useUI();
  // listo, revisando (asking the campus how it takes students), clave (the key field open) or inscribiendo.
  const [paso, setPaso] = useState('listo');
  const [revision, setRevision] = useState(null);
  const [clave, setClave] = useState('');
  const [error, setError] = useState('');
  const [errorClave, setErrorClave] = useState('');
  const boton = useRef(null);
  const campo = useRef(null);
  const abrir = useRef(null);
  const nota = useRef(null);
  // Where the focus goes once the row shows what changed: the button it was on may be gone.
  const enfocar = useRef(null);
  useEffect(() => {
    const destino = { boton, campo, abrir, nota }[enfocar.current];
    if (!destino) return;
    enfocar.current = null;
    destino.current?.focus();
  });

  if (inscripto) {
    return (
      <div className="inscripcion__accion">
        <p className="inscripcion__estado">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
          Ya estás inscripto
        </p>
        <Link ref={abrir} className="boton boton--secundario boton--chico" to={`/materias/${curso.id}`}>
          Ir a la materia<span className="solo-lectores"> {curso.nombre}</span>
        </Link>
      </div>
    );
  }

  if (!curso.propia || revision?.estado === 'sin') {
    return (
      <div className="inscripcion__accion">
        <p ref={nota} className="inscripcion__nota" tabIndex={-1}>Esta materia no deja inscribirse desde el campus. Pedíselo a quien la da.</p>
      </div>
    );
  }

  const ocupado = paso === 'revisando' || paso === 'inscribiendo';

  const inscribir = async (r) => {
    if (r.conClave && !clave.trim()) {
      setErrorClave('Escribí la clave que te pasaron.');
      campo.current?.focus();
      return;
    }
    setErrorClave('');
    const si = await confirmar({ titulo: `¿Inscribirte en ${curso.nombre}?`, texto: 'Queda hecho en el campus, como si te inscribieras desde ahí.', boton: 'Inscribirme' });
    if (!si) {
      (r.conClave ? campo : boton).current?.focus();
      return;
    }
    setPaso('inscribiendo');
    try {
      const { ya } = await inscribirmeEn(curso.id, { instancia: r.instancia, clave: r.conClave ? clave.trim() : '' });
      if (!ya) avisar(`Te inscribiste en ${curso.nombre}.`);
      enfocar.current = 'abrir';
      alInscribirse(curso.id);
    } catch (e) {
      if (e.codigo === 'clave_incorrecta') {
        setErrorClave(textoError(e));
        setPaso('clave');
        enfocar.current = 'campo';
        return;
      }
      if (e.codigo === 'sin_inscripcion') {
        enfocar.current = 'nota';
        setRevision({ estado: 'sin' });
        return;
      }
      setError(textoError(e));
      setPaso(r.conClave ? 'clave' : 'listo');
      enfocar.current = r.conClave ? 'campo' : 'boton';
    }
  };

  const ir = async () => {
    if (ocupado) return;
    setError('');
    let r = revision;
    if (!r) {
      setPaso('revisando');
      try {
        r = await revisarInscripcion(curso.id);
      } catch (e) {
        setError(textoError(e));
        setPaso('listo');
        return;
      }
      // Closed can open later: that one is asked again next time.
      if (r.estado === 'abierta' || r.estado === 'sin') setRevision(r);
    }
    if (r.estado === 'ya') {
      enfocar.current = 'abrir';
      alInscribirse(curso.id);
      return;
    }
    if (r.estado === 'sin') {
      enfocar.current = 'nota';
      setPaso('listo');
      return;
    }
    if (r.estado === 'cerrada') {
      setError(CERRADA);
      setPaso('listo');
      return;
    }
    if (r.conClave && paso !== 'clave') {
      enfocar.current = 'campo';
      setPaso('clave');
      return;
    }
    await inscribir(r);
  };

  const cancelar = () => {
    if (ocupado) return;
    setPaso('listo');
    setError('');
    setErrorClave('');
    enfocar.current = 'boton';
  };

  const conCampo = paso === 'clave' || (paso === 'inscribiendo' && revision?.conClave);
  if (conCampo) {
    return (
      <form
        className="inscripcion__accion inscripcion__clave"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          ir();
        }}
      >
        <Campo etiqueta="Clave de inscripción" ayuda="Te la pasa quien da la materia." error={errorClave}>
          <input ref={campo} className="campo__control" autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck="false" value={clave} onChange={(e) => setClave(e.target.value)} />
        </Campo>
        <div className="inscripcion__botones">
          <button type="submit" className="boton boton--chico" aria-disabled={ocupado ? 'true' : undefined}>
            {paso === 'inscribiendo' ? 'Inscribiendo' : 'Inscribirme'}<span className="solo-lectores"> en {curso.nombre}</span>
          </button>
          <button type="button" className="boton boton--secundario boton--chico" onClick={cancelar} aria-disabled={ocupado ? 'true' : undefined}>Cancelar</button>
        </div>
        {error && <p className="inscripcion__error" role="alert">{error}</p>}
      </form>
    );
  }

  return (
    <div className="inscripcion__accion">
      <button ref={boton} type="button" className="boton boton--secundario boton--chico" aria-disabled={ocupado ? 'true' : undefined} onClick={ir}>
        {paso === 'revisando' ? 'Revisando' : <>{paso === 'inscribiendo' ? 'Inscribiendo' : 'Inscribirme'}<span className="solo-lectores"> en {curso.nombre}</span></>}
      </button>
      {error && <p className="inscripcion__error" role="alert">{error}</p>}
    </div>
  );
}

function Fila({ curso, lugar, consulta, inscripto, alInscribirse }) {
  const anio = anioDe(curso.nombre);
  const docentes = conDocentes(curso.docentes);
  return (
    <li className={`inscripcion__fila${inscripto ? ' inscripcion__fila--mia' : ''}`}>
      <Simbolo id={curso.id} nombre={curso.nombre} tamano="fila" />
      <span className="inscripcion__texto">
        <span className="inscripcion__nombre">
          <Partes partes={partesDe(sinAnio(curso.nombre), consulta)} />
          {anio && (
            <>
              {' '}
              <span className={`inscripcion__anio${anio < ESTE_ANIO ? ' inscripcion__anio--viejo' : ''}`}>{anio}</span>
            </>
          )}
        </span>
        {lugar && <span className="inscripcion__lugar">{lugar}</span>}
        {docentes && <span className="inscripcion__docentes">{docentes}</span>}
      </span>
      <Accion curso={curso} inscripto={inscripto} alInscribirse={alInscribirse} />
    </li>
  );
}

function Resultados({ arbol, esMia, alInscribirse, consulta, raiz, viejas, donde }) {
  const clave = `${consulta}|${raiz}|${viejas ? 1 : 0}`;
  const [cuantos, setCuantos] = useState(DE_A);
  // What «Ver más» brought for one search or area, and which one it is bringing now.
  const [mas, setMas] = useState({ clave: null, cursos: [], siguiente: null, cargando: null, error: '' });
  const { datos, error, recargar } = useConsulta(async () => ({ clave, ...(await tanda(arbol, consulta, raiz, 0, viejas)) }), [clave]);

  const [claveVista, setClaveVista] = useState(clave);
  if (claveVista !== clave) {
    setClaveVista(clave);
    setCuantos(DE_A);
  }

  // While other words or another area come, the list before stays, faded and marked busy, so the page does not jump.
  const viejos = Boolean(datos) && datos.clave !== clave;
  const listos = Boolean(datos) && !viejos;
  const conMas = listos && mas.clave === clave;
  const juntos = datos ? unicos([...datos.cursos, ...(conMas ? mas.cursos : [])]) : null;
  // A search keeps the campus order, the best match first. A whole area goes in alphabetical order, by letter.
  const cursos = juntos && !consulta ? porLetra(juntos).flatMap((g) => g.cursos) : juntos;
  const siguiente = conMas ? mas.siguiente : datos?.siguiente ?? null;
  const hayMas = listos && (cursos.length > cuantos || siguiente !== null);
  const esqueleto = !datos || (viejos && !datos.cursos.length);
  const cargandoMas = mas.cargando === clave;

  const verMas = async () => {
    if (cursos.length > cuantos) {
      setCuantos((c) => c + DE_A);
      return;
    }
    if (siguiente === null || cargandoMas) return;
    const deEsta = clave;
    const previas = conMas ? mas.cursos : [];
    setMas((m) => ({ ...m, cargando: deEsta, error: '' }));
    try {
      const r = await tanda(arbol, consulta, raiz, siguiente, viejas);
      setMas({ clave: deEsta, cursos: [...previas, ...r.cursos], siguiente: r.siguiente, cargando: null, error: '' });
      setCuantos((c) => c + DE_A);
    } catch (e) {
      // What came before stays, and «Ver más» tries the same batch again.
      setMas({ clave: deEsta, cursos: previas, siguiente, cargando: null, error: textoError(e) });
    }
  };

  let vacio = 'No hay materias para mostrar acá.';
  if (consulta && donde) vacio = `No encontramos materias con ese nombre en ${donde}. Probá con Todos.`;
  else if (consulta) vacio = 'No encontramos materias con ese nombre. Probá con menos palabras.';
  if (!viejas) vacio += ' También podés mostrar las de años anteriores.';
  let cuenta = '';
  if (listos) {
    if (!cursos.length) cuenta = vacio;
    else if (hayMas) cuenta = `Se ven ${Math.min(cuantos, cursos.length)} materias. Hay más abajo.`;
    else cuenta = cursos.length === 1 ? 'Una materia' : `${cursos.length} materias`;
  }

  const fila = (c) => (
    <Fila key={c.id} curso={c} lugar={lugarDe(arbol, c, raiz)} consulta={consulta} inscripto={esMia(c.id)} alInscribirse={alInscribirse} />
  );
  const vistos = cursos?.slice(0, cuantos) ?? [];

  if (error && !listos) return <ErrorConReintento texto={error} recargar={recargar} />;
  return (
    <>
      <p className={listos && !cursos.length ? 'inscripcion__nada' : 'resultados'} role="status">{cuenta}</p>
      <div className={`inscripcion__resultados${viejos ? ' inscripcion__resultados--viejos' : ''}`} aria-busy={!listos ? 'true' : undefined}>
        {esqueleto && <Cargando texto="Buscando materias en el campus" cuantas={4} />}
        {!esqueleto && vistos.length > 0 && consulta && <ul className="inscripcion__lista">{vistos.map(fila)}</ul>}
        {!esqueleto && vistos.length > 0 && !consulta && porLetra(vistos).map((g) => (
          <div key={g.letra} className="inscripcion__grupo">
            <h2 className="inscripcion__letra">
              <span aria-hidden="true">{g.letra}</span>
              <span className="solo-lectores">{g.letra === '#' ? 'Con números' : `Con ${g.letra}`}</span>
            </h2>
            <ul className="inscripcion__lista">{g.cursos.map(fila)}</ul>
          </div>
        ))}
        {hayMas && (
          <button type="button" className="boton boton--secundario inscripcion__mas" aria-disabled={cargandoMas ? 'true' : undefined} onClick={verMas}>
            {cargandoMas ? 'Buscando más' : 'Ver más'}<span className="solo-lectores"> materias</span>
          </button>
        )}
        {conMas && mas.error && <p className="inscripcion__error" role="alert">{mas.error}</p>}
      </div>
    </>
  );
}

/** One department as a tile: its short name big, how many courses it has under it. A radio underneath. */
function Area({ valor, elegida, nombre, detalle, tono, simbolo, onElegir }) {
  return (
    <label className="area" data-tono={tono ?? undefined}>
      <input type="radio" name="inscripcion-area" className="area__radio" value={valor} checked={elegida} onChange={() => onElegir(valor)} />
      <span className="area__icono"><Icono nombre={simbolo} tamano="tipo" /></span>
      <span className="area__nombre">{nombre}</span>
      <span className="area__detalle">{detalle}</span>
      <svg className="area__marca" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
    </label>
  );
}

const materias = (n) => (n === 1 ? 'Una materia' : `${n} materias`);

export default function Inscripcion() {
  useSeo({ titulo: tituloDe('Inscribirte a una materia'), noindex: true });
  const [texto, setTexto] = useState('');
  // A department or another area of the campus (its category), and a part inside it.
  const [area, setArea] = useState('');
  const [parte, setParte] = useState('');
  const [viejas, setViejas] = useState(false);
  // Enrolled in this visit. The student's courses from the campus come again on the next screen that asks.
  const [nuevas, setNuevas] = useState(() => new Set());
  const quieto = limpia(useQuieto(texto, 300));
  const consulta = quieto.replace(/ /g, '').length >= 2 ? quieto : '';

  const base = useConsulta(async () => {
    await cargarPerfil();
    const [arbol, { enCurso, otras }] = await Promise.all([cargarAreas(), cargarMaterias()]);
    return { arbol, mias: new Set([...enCurso, ...otras].map((m) => m.id)) };
  });
  const arbol = base.datos?.arbol;
  // The departments as tiles, and the rest of the campus in a list. A campus without «Grado»: its top areas as tiles.
  const conDepartamentos = Boolean(arbol?.departamentos.length);
  const tejas = (conDepartamentos ? arbol.departamentos : arbol?.otras) ?? [];
  const resto = conDepartamentos ? arbol.otras : [];
  const elegida = [...tejas, ...resto].find((a) => String(a.id) === area);
  const enResto = resto.some((a) => String(a.id) === area);
  const raiz = Number(parte || area) || 0;
  const elegir = (valor) => {
    setArea(valor);
    setParte('');
  };
  let donde = '';
  if (parte) donde = elegida?.partes.find((p) => String(p.id) === parte)?.nombre ?? '';
  else if (elegida) donde = enResto ? elegida.nombre : elegida.corto;

  return (
    <div className="contenedor pagina inscripcion">
      <p className="volver"><Link to="/materias">Materias</Link></p>
      <h1>Inscribirte a una materia</h1>
      <div className="inscripcion__buscador">
        <Campo etiqueta="Materia" ayuda="Con o sin tildes" ayudaAlLado>
          <input className="campo__control" type="search" enterKeyHint="search" autoComplete="off" spellCheck="false" value={texto} onChange={(e) => setTexto(e.target.value)} />
        </Campo>
        <svg className="inscripcion__lupa" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></svg>
      </div>

      {!base.datos && !base.error && (
        <div className="inscripcion__areas" aria-busy="true">
          <p className="inscripcion__leyenda">Departamento</p>
          <div className="inscripcion__tejas">
            {Array.from({ length: 7 }, (_, i) => <span key={i} className="area area--esqueleto" aria-hidden="true" />)}
          </div>
        </div>
      )}
      {tejas.length > 0 && (
        <fieldset className="inscripcion__areas">
          <legend className="inscripcion__leyenda">{conDepartamentos ? 'Departamento' : 'Área'}</legend>
          <div className="inscripcion__tejas">
            <Area valor="" elegida={area === '' && Boolean(consulta)} nombre="Todos" detalle="Buscar en todo el campus" simbolo="facultad" onElegir={elegir} />
            {tejas.map((a, i) => (
              <Area key={a.id} valor={String(a.id)} elegida={area === String(a.id)} nombre={conDepartamentos ? a.corto : a.nombre} detalle={materias(a.cursos)} tono={i % 6} simbolo={simboloDeDepartamento(a.corto ?? a.nombre)} onElegir={elegir} />
            ))}
          </div>
        </fieldset>
      )}

      {base.datos && (
        <div className="inscripcion__filtros">
          {resto.length > 0 && (
            <Campo etiqueta="Otra área del campus">
              <Elegir
                opciones={resto}
                valor={enResto ? area : ''}
                onCambiar={elegir}
                todas="Ninguna"
                nombreLista="Áreas"
                vacio="No hay áreas con ese nombre."
                limpiar="Quitar el área"
              />
            </Campo>
          )}
          {elegida?.partes.length > 0 && (
            <Campo etiqueta={`Dentro de ${enResto || !conDepartamentos ? elegida.nombre : elegida.corto}`}>
              <Elegir
                opciones={elegida.partes}
                valor={parte}
                onCambiar={setParte}
                todas="Todo"
                nombreLista="Partes del área"
                vacio="No hay nada con ese nombre."
                limpiar="Ver toda el área"
              />
            </Campo>
          )}
          <label className="inscripcion__viejas">
            <input type="checkbox" checked={viejas} onChange={(e) => setViejas(e.target.checked)} />
            Mostrar las de años anteriores
          </label>
        </div>
      )}

      {base.error && !base.datos && <ErrorConReintento texto={base.error} recargar={base.recargar} />}
      {!base.datos && !base.error && consulta && (
        <div aria-busy="true"><Cargando texto="Buscando materias en el campus" cuantas={4} /></div>
      )}
      {base.datos && (consulta || raiz > 0) && (
        <Resultados
          arbol={arbol}
          esMia={(id) => base.datos.mias.has(id) || nuevas.has(id)}
          alInscribirse={(id) => setNuevas((s) => new Set(s).add(id))}
          consulta={consulta}
          raiz={raiz}
          viejas={viejas}
          donde={donde}
        />
      )}
      {base.datos && !consulta && !raiz && <p className="inscripcion__inicio">Buscá por nombre o elegí un departamento para ver sus materias.</p>}
    </div>
  );
}
