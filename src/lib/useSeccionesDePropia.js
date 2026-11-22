import { useClassroomDePropia } from '../components/Classroom';
import { materiaDe, nombreDeSeccion, ordenarSecciones, personalizar, useMio } from './mio';
import { conTuyasEnOrden, enOrdenGuardado, moverA } from './ordenSecciones';
import { ponerCategoria } from './propias';

/** The sections of a course of one's own as its page and Editar show them: its categories («p» and the number) and the
 * topics of its Classroom course, in the student's order. What comes from Classroom carries the student's names, marks
 * and places (in the marks of this course); `tema` is the topic it comes from. `mover(id, lugar, ids)` puts a section
 * in `lugar` among `ids`, the ones on screen: the whole order is kept in the marks (hidden topics included) and a
 * category also moves among the others, so the course keeps it when it's shared. */
export function useSeccionesDePropia(propia) {
  const mio = useMio();
  const marcas = materiaDe(mio, propia.id);
  const cr = useClassroomDePropia(propia);
  const catIds = propia.categorias.map((c) => `p${c.id}`);
  const deClassroom = personalizar(cr.items, mio, propia.categorias.map((c) => ({ materiaId: propia.id, id: `p${c.id}`, nombre: c.nombre })))
    .map((i) => ({ ...i, tema: i.seccionOriginal ?? i.seccionId, seccionOriginal: undefined }));
  const temas = [];
  for (const i of cr.items) {
    if (!temas.some((t) => t.id === i.seccionId)) temas.push({ id: i.seccionId, original: i.seccion, nombre: nombreDeSeccion(marcas, i.seccionId) ?? i.seccion });
  }
  const ordenTodo = conTuyasEnOrden(enOrdenGuardado([...catIds, ...temas.map((t) => t.id)], marcas.ordenSecciones), catIds);

  const mover = (id, lugar, ids) => {
    if (lugar < 0 || lugar >= ids.length || ids.indexOf(id) === lugar) return false;
    const nuevo = moverA(ordenTodo, ids, id, lugar);
    if (temas.length) ordenarSecciones(propia.id, nuevo);
    const categoria = propia.categorias.find((c) => `p${c.id}` === id);
    if (categoria) ponerCategoria(propia.id, categoria.id, nuevo.filter((s) => catIds.includes(s)).indexOf(id));
    return true;
  };

  return { cr, marcas, catIds, deClassroom, temas, ordenTodo, mover };
}
