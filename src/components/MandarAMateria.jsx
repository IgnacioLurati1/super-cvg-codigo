import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Campo from './Campo';
import ElegirMateria, { useMaterias } from './ElegirMateria';
import { enlaceDe } from '../lib/drivePublico';
import { useMio } from '../lib/mio';
import { agregadaDe, agregarBloques, agregarCategoria, esAgregada, propiaDe, seccionesTuyas, sumarEnSeccion, sumarSeccionPropia } from '../lib/propias';

const NUEVA = 'nueva';
const NOMBRE_NUEVA = 'Del Drive';

// The sections a file can go to: the student's own, in a course of theirs or in a campus course.
function seccionesDe(mio, materia) {
  if (materia === null) return [];
  const propia = typeof materia === 'string' ? propiaDe(mio, materia) : agregadaDe(mio, materia);
  return typeof materia === 'string' ? (propia?.categorias ?? []).filter((c) => c.campus === undefined) : seccionesTuyas(propia);
}

/** A file of a Drive goes to a course as a link to it: in one of the student's sections, or in a new one. */
// Its button goes with the others of the file (Previa.jsx); this is what opens under them. `alMandar(hecho)`: it went in.
export default function MandarAMateria({ id, nodo, alMandar, alCancelar }) {
  const mio = useMio();
  const materias = useMaterias(mio.propias.filter((p) => !esAgregada(p)));
  const [materia, setMateria] = useState(null);
  const [seccion, setSeccion] = useState(NUEVA);
  const [error, setError] = useState('');
  const form = useRef(null);
  const secciones = seccionesDe(mio, materia);
  useEffect(() => form.current?.querySelector('select')?.focus(), []);

  const elegirMateria = (id) => {
    setMateria(id);
    setError('');
    setSeccion(seccionesDe(mio, id).find((c) => c.nombre === NOMBRE_NUEVA)?.id ?? NUEVA);
  };

  const mandar = (e) => {
    e.preventDefault();
    if (materia === null) {
      setError('Elegí una materia.');
      return;
    }
    const bloque = { tipo: 'enlace', url: enlaceDe(nodo), titulo: nodo.n.slice(0, 200) };
    let ok = false;
    let nombreSeccion = NOMBRE_NUEVA;
    if (typeof materia === 'string') {
      const cat = seccion === NUEVA ? agregarCategoria(materia, NOMBRE_NUEVA) : seccion;
      ok = cat !== null && agregarBloques(materia, cat, [bloque]) > 0;
      if (seccion !== NUEVA) nombreSeccion = secciones.find((c) => c.id === seccion)?.nombre ?? NOMBRE_NUEVA;
    } else {
      const nueva = seccion === NUEVA ? sumarSeccionPropia(materia, NOMBRE_NUEVA) : null;
      const cat = nueva ? nueva.categoria : seccion === NUEVA ? null : seccion;
      ok = cat !== null && sumarEnSeccion(materia, `p${cat}`, [bloque]) !== null;
      if (seccion !== NUEVA) nombreSeccion = secciones.find((c) => c.id === seccion)?.nombre ?? NOMBRE_NUEVA;
    }
    if (!ok) {
      setError('No entra en esa sección. Probá con otra.');
      return;
    }
    alMandar({ materia, nombre: materias.nombres.get(materia) ?? 'la materia', seccion: nombreSeccion });
  };

  return (
    <form ref={form} id={id} className="mandar" onSubmit={mandar} noValidate>
      <ElegirMateria valor={materia} materias={materias} alElegir={elegirMateria} ninguna="Elegí una" />
      {materia !== null && (
        <Campo etiqueta="Sección">
          <select className="campo__control" value={seccion} onChange={(e) => setSeccion(e.target.value === NUEVA ? NUEVA : Number(e.target.value))}>
            {secciones.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            {!secciones.some((c) => c.nombre === NOMBRE_NUEVA) && <option value={NUEVA}>Una nueva, «{NOMBRE_NUEVA}»</option>}
          </select>
        </Campo>
      )}
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
