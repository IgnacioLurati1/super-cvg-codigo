// The calculators of a subject of the campus, by the official names of the subjects (lista.js). Apart from lista.js, which Node also reads:
// this one brings the faculty's matching of names.
import { esLaMateria } from '../facultad';
import { CALCULADORAS } from './lista';

export const calculadorasDe = (nombreCurso) => (nombreCurso ? CALCULADORAS.filter((c) => c.materias.some((m) => esLaMateria(nombreCurso, m))) : []);
