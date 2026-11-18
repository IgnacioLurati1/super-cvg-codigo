// The error of a run or a check in the student's words, by language. C and JavaScript come already said by their engines
// (cMensajes.js, jsMensajes.js); Python and SQL are said here, on this side, from what their engines wrote (pyMensajes.js,
// sqlMensajes.js), so the engine's own text is still there for what has to read it (the missing module of Python, the line
// of SQL).
import { explicarPython } from './pyMensajes';
import { explicarSql } from './sqlMensajes';

/** `texto` as the console shows it: in Spanish if it's a known one, with the original under it; or as it came. */
export function enCriollo(lenguaje, texto) {
  if (typeof texto !== 'string') return texto;
  if (lenguaje === 'python') return explicarPython(texto);
  if (lenguaje === 'sql') return explicarSql(texto);
  return texto;
}
