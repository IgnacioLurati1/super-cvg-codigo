import { useMemo } from 'react';
import Campo from './Campo';
import { cargarMaterias } from '../lib/campus';
import { useConsulta } from '../lib/useConsulta';

// The campus didn't answer: only the student's own courses are offered.
const FALLO = { fallo: true };

/** The courses to choose from: the campus ones in progress, the student's own and the rest. Shared by the Laboratorio
 * and Repaso, which keep a course by its number. `fallo`: the campus ones couldn't be brought. */
export function useMaterias(propias) {
  const { datos } = useConsulta(() => cargarMaterias().catch(() => FALLO), [], { alInstante: true });
  return useMemo(() => {
    const grupos = [
      { nombre: 'En curso', lista: (datos?.enCurso ?? []).map((m) => ({ id: m.id, nombre: m.nombre })) },
      { nombre: 'Tuyas', lista: propias.map((p) => ({ id: p.id, nombre: p.nombre })) },
      { nombre: 'Otras del campus', lista: (datos?.otras ?? []).map((m) => ({ id: m.id, nombre: m.nombre })) },
    ].filter((g) => g.lista.length);
    const nombres = new Map(grupos.flatMap((g) => g.lista.map((m) => [m.id, m.nombre])));
    return { grupos, nombres, cargadas: datos !== undefined, fallo: datos === FALLO };
  }, [datos, propias]);
}

/** The name to show for a course kept by number. */
export const nombreDeMateria = (materias, id) =>
  id === null || id === undefined ? 'Sin materia' : materias.nombres.get(id) ?? (materias.cargadas ? 'Una materia que ya no está' : 'Materia del campus');

// A course kept by number travels between selects as text: «p…» are the student's own.
const comoValor = (materia) => (materia === null || materia === undefined ? '' : String(materia));
const deValor = (v) => (v === '' ? null : /^\d+$/.test(v) ? Number(v) : v);

// `ninguna`: what the empty choice says. `error`: next to the field, tied to it.
export default function ElegirMateria({ valor, materias, alElegir, etiqueta = 'Materia', ninguna = 'Sin materia', error }) {
  const conocida = valor === null || materias.nombres.has(valor);
  return (
    <Campo etiqueta={etiqueta} error={error}>
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

/** In ElegirSeccion, the new section. */
export const NUEVA = 'nueva';

/** Where something goes in the course chosen: the section called `nueva` if there's one, or a new one by that name. */
export const seccionInicial = (secciones, nueva) => secciones.find((c) => c.nombre === nueva)?.id ?? NUEVA;

/** The section of a course where something goes (`secciones`, from seccionesDondeSumar of propias.js): one of the
 * student's, or a new one named `nueva` (NUEVA) when none is called so. */
export function ElegirSeccion({ secciones, valor, nueva, alElegir, error }) {
  return (
    <Campo etiqueta="Sección" error={error}>
      <select className="campo__control" value={valor} onChange={(e) => alElegir(e.target.value === NUEVA ? NUEVA : Number(e.target.value))}>
        {secciones.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        {!secciones.some((c) => c.nombre === nueva) && <option value={NUEVA}>Una nueva, «{nueva}»</option>}
      </select>
    </Campo>
  );
}
