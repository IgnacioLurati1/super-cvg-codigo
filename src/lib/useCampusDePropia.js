import { useMemo } from 'react';
import { alumnoListo, cargarContenido, cargarMaterias } from './campus';
import { personalizar, useMio } from './mio';
import { materiasQueUsa } from './propiasVista';
import { useConsulta } from './useConsulta';

/** The reader's courses, and the content of the ones a course of one's own points to (with the reader's names and
 * marks). Only the courses the reader is in: the campus would say no to the others anyway. */
export function useCampusDePropia(propia) {
  const mio = useMio();
  const usa = propia ? materiasQueUsa(propia) : [];
  const { datos, error, cargando, recargar } = useConsulta(async () => {
    await alumnoListo();
    const { enCurso, otras } = await cargarMaterias();
    const materias = [...enCurso, ...otras];
    const suyas = new Map(materias.map((m) => [m.id, m]));
    const crudos = new Map();
    await Promise.all(usa.filter((m) => suyas.has(m)).map(async (m) => crudos.set(m, await cargarContenido(suyas.get(m)))));
    return { materias, suyas, crudos };
  }, [usa.join(',')], { alInstante: true });

  const contenidos = useMemo(() => (datos ? new Map([...datos.crudos].map(([m, items]) => [m, personalizar(items, mio)])) : null), [datos, mio]);
  return { materias: datos?.materias ?? null, suyas: datos?.suyas ?? null, contenidos, error, cargando, recargar };
}
