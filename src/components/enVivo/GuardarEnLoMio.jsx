import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import ElegirMateria, { ElegirSeccion, NUEVA, seccionInicial, useMaterias } from '../ElegirMateria';
import { guardarArchivos } from '../SumarCosas';
import { useMio } from '../../lib/mio';
import { agregarAlProyecto, borrarProyecto, cambiarProyecto, crearProyecto, guardarArchivoNuevo } from '../../lib/laboratorio/guardado';
import { esAgregada, seccionesDondeSumar, sumarDondeSea } from '../../lib/propias';

// «Guardar en lo mío»: what a tab of the table gives (its text, or a file) goes to a section of one of the student's
// courses, as anything they add themselves. It stays when the session ends.

const NOMBRE_NUEVA = 'De la sesión en vivo';

/** The files of a table's Laboratorio, as a project of the student's: its id, or null if it doesn't fit (nothing stays). */
function comoProyecto(nombre, { lenguaje, archivos }) {
  const q = crearProyecto({ nombre: nombre || 'De la sesión', lenguaje });
  if (!q) return null;
  for (const a of archivos) {
    const nuevo = agregarAlProyecto(q, { nombre: a.nombre, ext: a.ext, codigo: a.codigo });
    if (!nuevo) {
      borrarProyecto(q);
      return null;
    }
    if (a.principal) cambiarProyecto(q, { principal: nuevo });
  }
  return q;
}

export default function GuardarEnLoMio({ dar, titulo, alCerrar }) {
  const mio = useMio();
  const materias = useMaterias(mio.propias.filter((p) => !esAgregada(p)));
  const [que, setQue] = useState(null);
  const [materia, setMateria] = useState(null);
  const [seccion, setSeccion] = useState(NUEVA);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [hecho, setHecho] = useState(null);
  const id = useId();
  const form = useRef(null);
  const secciones = seccionesDondeSumar(mio, materia);

  // What the tab gives, once: it may take a moment (an image of the board).
  useEffect(() => {
    let vivo = true;
    Promise.resolve()
      .then(dar)
      .then((r) => vivo && setQue(r && (typeof r.texto === 'string' || r.archivo instanceof Blob) ? r : false))
      .catch(() => vivo && setQue(false));
    return () => {
      vivo = false;
    };
  }, [dar]);
  useEffect(() => {
    if (que) form.current?.querySelector('select')?.focus();
  }, [que]);

  const elegirMateria = (m) => {
    setMateria(m);
    setError('');
    setSeccion(seccionInicial(seccionesDondeSumar(mio, m), NOMBRE_NUEVA));
  };

  // Code goes to the student's Laboratorio, exact: as course text it would lose its indentation.
  const alLaboratorio = (e) => {
    e.preventDefault();
    const nombre = String(que.nombre || titulo).slice(0, 80);
    // The Laboratorio adds the extension itself: «TP.py» would be «TP.py.py».
    const sinExtension = nombre.replace(/\.\w+$/, '');
    const hechoId = que.archivos?.length > 1 ? comoProyecto(sinExtension, que) : guardarArchivoNuevo({ nombre: sinExtension || nombre, lenguaje: que.lenguaje, codigo: que.texto });
    if (!hechoId) {
      setError('No entra en tu Laboratorio. Borrá algún archivo y probá de nuevo.');
      return;
    }
    setHecho({ laboratorio: true });
  };

  const guardar = async (e) => {
    e.preventDefault();
    if (materia === null) {
      setError('Elegí una materia.');
      return;
    }
    setGuardando(true);
    let bloques = [];
    if (que.archivo) {
      const nombre = String(que.nombre || titulo || 'De la sesión').slice(0, 150);
      const { bloques: b, avisos } = await guardarArchivos([new File([que.archivo], nombre, { type: que.archivo.type })]);
      if (!b.length) {
        setGuardando(false);
        setError(avisos[0] || 'No se pudo guardar el archivo.');
        return;
      }
      bloques = b;
    } else {
      bloques = [{ tipo: 'texto', texto: `${String(que.nombre || titulo).slice(0, 150)}\n\n${que.texto}` }];
    }
    const nombreSeccion = seccion === NUEVA ? NOMBRE_NUEVA : (secciones.find((c) => c.id === seccion)?.nombre ?? NOMBRE_NUEVA);
    const ok = sumarDondeSea(materia, seccion === NUEVA ? null : seccion, NOMBRE_NUEVA, bloques) > 0;
    setGuardando(false);
    if (!ok) {
      setError('No entra en esa sección. Probá con otra.');
      return;
    }
    setHecho({ materia, nombre: materias.nombres.get(materia) ?? 'la materia', seccion: nombreSeccion });
  };

  return (
    <section className="envivo-guardar" aria-labelledby={`${id}-t`}>
      <h2 id={`${id}-t`} className="envivo-guardar__titulo">Guardar «{titulo}» en lo mío</h2>
      {que === null && <p aria-busy="true">Preparando…</p>}
      {que === false && <p className="mensaje mensaje--error">Esta pestaña no tiene nada para guardar todavía.</p>}
      {hecho?.laboratorio && (
        <p className="envivo-guardar__hecho" role="status">
          Quedó en tu <Link to="/laboratorio">Laboratorio</Link>.
        </p>
      )}
      {hecho && !hecho.laboratorio && (
        <p className="envivo-guardar__hecho" role="status">
          Quedó en <Link to={typeof hecho.materia === 'string' ? `/propias/${hecho.materia}` : `/materias/${hecho.materia}`}>{hecho.nombre}</Link>, en «{hecho.seccion}».
        </p>
      )}
      {que && que.lenguaje && !hecho && (
        <form className="envivo-guardar__form" onSubmit={alLaboratorio} noValidate>
          <p className="envivo-guardar__que">Se guarda en tu Laboratorio, como «{que.nombre}».</p>
          {error && <p className="campo__error" role="alert">{error}</p>}
          <div className="envivo-guardar__botones">
            <button type="submit" className="boton boton--chico">Guardar</button>
            <button type="button" className="boton boton--secundario boton--chico" onClick={alCerrar}>Cancelar</button>
          </div>
        </form>
      )}
      {que && !que.lenguaje && !hecho && (
        <form ref={form} className="envivo-guardar__form" onSubmit={guardar} noValidate>
          <p className="envivo-guardar__que">{que.archivo ? `Se guarda como archivo, «${que.nombre}».` : 'Se guarda como texto.'}</p>
          <ElegirMateria valor={materia} materias={materias} alElegir={elegirMateria} ninguna="Elegí una" />
          {materia !== null && <ElegirSeccion secciones={secciones} valor={seccion} nueva={NOMBRE_NUEVA} alElegir={setSeccion} />}
          {error && <p className="campo__error" role="alert">{error}</p>}
          <div className="envivo-guardar__botones">
            <button type="submit" className="boton boton--chico" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
            <button type="button" className="boton boton--secundario boton--chico" onClick={alCerrar}>Cancelar</button>
          </div>
        </form>
      )}
      {(hecho || que === false) && <button type="button" className="boton boton--secundario boton--chico" onClick={alCerrar}>Listo</button>}
    </section>
  );
}
