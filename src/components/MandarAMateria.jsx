import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import ElegirMateria, { ElegirSeccion, NUEVA, seccionInicial, useMaterias, useSeccionesDelCampus } from './ElegirMateria';
import { enlaceDe } from '../lib/drivePublico';
import { useMio } from '../lib/mio';
import { esAgregada, seccionesDondeSumar, sumarDondeSea } from '../lib/propias';

const NOMBRE_NUEVA = 'Del Drive';

/** A file of a Drive goes to a course as a link to it: in one of the student's sections, or in a new one. */
// Its button goes with the others of the file (Previa.jsx); this is what opens under them. `alMandar(hecho)`: it went in.
export default function MandarAMateria({ id, nodo, alMandar, alCancelar }) {
  const mio = useMio();
  const materias = useMaterias(mio.propias.filter((p) => !esAgregada(p)));
  const [materia, setMateria] = useState(null);
  const [seccion, setSeccion] = useState(NUEVA);
  const [error, setError] = useState('');
  const form = useRef(null);
  const secciones = seccionesDondeSumar(mio, materia);
  const seccionesDelCampus = useSeccionesDelCampus(materia, materias.nombres.get(materia));
  useEffect(() => form.current?.querySelector('select')?.focus(), []);

  const elegirMateria = (id) => {
    setMateria(id);
    setError('');
    setSeccion(seccionInicial(seccionesDondeSumar(mio, id), NOMBRE_NUEVA));
  };

  const mandar = (e) => {
    e.preventDefault();
    if (materia === null) {
      setError('Elegí una materia.');
      return;
    }
    const bloque = { tipo: 'enlace', url: enlaceDe(nodo), titulo: nodo.n.slice(0, 200) };
    const nombreSeccion = seccion === NUEVA ? NOMBRE_NUEVA : ([...secciones, ...seccionesDelCampus].find((c) => c.id === seccion)?.nombre ?? NOMBRE_NUEVA);
    if (!sumarDondeSea(materia, seccion === NUEVA ? null : seccion, NOMBRE_NUEVA, [bloque])) {
      setError('No entra en esa sección. Probá con otra.');
      return;
    }
    alMandar({ materia, nombre: materias.nombres.get(materia) ?? 'la materia', seccion: nombreSeccion });
  };

  return (
    <form ref={form} id={id} className="mandar" onSubmit={mandar} noValidate>
      <ElegirMateria valor={materia} materias={materias} alElegir={elegirMateria} ninguna="Elegí una" />
      {materia !== null && <ElegirSeccion secciones={secciones} delCampus={seccionesDelCampus} valor={seccion} nueva={NOMBRE_NUEVA} alElegir={setSeccion} />}
      {error && <p className="mandar__error" role="alert">{error}</p>}
      <div className="mandar__botones">
        <button type="submit" className="boton boton--chico">Mandar el link</button>
        <button type="button" className="boton boton--secundario boton--chico" onClick={alCancelar}>Cancelar</button>
      </div>
    </form>
  );
}

/** Where the link went, with a way there. */
export function Mandado({ hecho }) {
  return (
    <p className="mandar__hecho" role="status">
      Quedó en <Link onClick={(e) => e.currentTarget.closest('dialog')?.close()} to={typeof hecho.materia === 'string' ? `/propias/${hecho.materia}` : `/materias/${hecho.materia}`}>{hecho.nombre}</Link>, en «{hecho.seccion}».
    </p>
  );
}
