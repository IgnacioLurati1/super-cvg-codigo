import { useMemo } from 'react';
import Campo from './Campo';
import { cargarMaterias } from '../lib/campus';
import { useConsulta } from '../lib/useConsulta';

/** The courses to choose from: the campus ones in progress, the student's own and the rest. Shared by the Laboratorio
 * and Repaso, which keep a course by its number. */
export function useMaterias(propias) {
  const { datos } = useConsulta(() => cargarMaterias().catch(() => null), []);
  return useMemo(() => {
    const grupos = [
      { nombre: 'En curso', lista: (datos?.enCurso ?? []).map((m) => ({ id: m.id, nombre: m.nombre })) },
      { nombre: 'Tuyas', lista: propias.map((p) => ({ id: p.id, nombre: p.nombre })) },
      { nombre: 'Otras del campus', lista: (datos?.otras ?? []).map((m) => ({ id: m.id, nombre: m.nombre })) },
    ].filter((g) => g.lista.length);
    const nombres = new Map(grupos.flatMap((g) => g.lista.map((m) => [m.id, m.nombre])));
    return { grupos, nombres, cargadas: datos !== undefined };
  }, [datos, propias]);
}

/** The name to show for a course kept by number. */
export const nombreDeMateria = (materias, id) =>
  id === null || id === undefined ? 'Sin materia' : materias.nombres.get(id) ?? (materias.cargadas ? 'Una materia que ya no está' : 'Materia del campus');

// A course kept by number travels between selects as text: «p…» are the student's own.
const comoValor = (materia) => (materia === null || materia === undefined ? '' : String(materia));
const deValor = (v) => (v === '' ? null : /^\d+$/.test(v) ? Number(v) : v);

// `ninguna`: what the empty choice says.
export default function ElegirMateria({ valor, materias, alElegir, etiqueta = 'Materia', ninguna = 'Sin materia' }) {
  const conocida = valor === null || materias.nombres.has(valor);
  return (
    <Campo etiqueta={etiqueta}>
      <select className="campo__control" value={comoValor(valor)} onChange={(e) => alElegir(deValor(e.target.value))}>
        <option value="">{ninguna}</option>
        {!conocida && <option value={comoValor(valor)}>{materias.cargadas ? 'Una materia que ya no está' : 'Materia del campus'}</option>}
        {materias.grupos.map((g) => (
          <optgroup key={g.nombre} label={g.nombre}>
            {g.lista.map((m) => <option key={m.id} value={comoValor(m.id)}>{m.nombre}</option>)}
          </optgroup>
        ))}
      </select>
    </Campo>
  );
}
