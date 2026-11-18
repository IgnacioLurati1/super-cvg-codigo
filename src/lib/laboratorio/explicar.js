// «Explicar la consulta»: what the statement where the cursor is does, step by step in the order it's evaluated
// (queHace.js), and below it how SQLite runs it: the statement goes to SQLite as EXPLAIN QUERY PLAN (it doesn't run, so
// nothing changes in the database) and comes back as a tree in words (plan.js). Returns what the console shows.
import { LENGUAJES } from './lenguajes';
import { enCriollo } from './mensajes';
import { motorDe } from './motor';
import { consultaParaExplicar, explicarPlan, sentenciaEn, tienePlan } from './plan';
import { queHace } from './queHace';
import { comoVolvio } from './tuBase';

/** { piezas, final, error } for the console, or null if something else is running. */
export async function explicarConsulta(codigo, posicion) {
  const m = motorDe('sql');
  const sentencia = sentenciaEn(codigo, posicion);
  if (!sentencia) return { piezas: [{ tipo: 'aviso', tono: 'aviso', texto: 'No hay ninguna consulta para explicar.' }], final: 'No hay nada para explicar.', error: null };
  if (!tienePlan(sentencia)) {
    return { piezas: [{ tipo: 'aviso', tono: 'aviso', texto: `La línea ${sentencia.linea} no es una consulta. Poné el cursor en un SELECT, INSERT, UPDATE o DELETE.` }], final: 'No hay nada para explicar.', error: null };
  }
  let filas = [];
  let pistas = [];
  const r = await m.correr(consultaParaExplicar(sentencia), {
    nombre: 'consulta.sql',
    alEvento: (d) => {
      if (d.tipo === 'tabla') filas = Array.isArray(d.filas) ? d.filas : [];
      else if (d.tipo === 'dialecto' && d.error && Array.isArray(d.pistas)) pistas = d.pistas.map(String);
    },
  });
  if (!r) return null;
  const vuelta = comoVolvio(m.leer().base);
  if (r.falla) return { piezas: [{ tipo: 'aviso', tono: 'error', texto: 'No se pudo cargar SQL. Revisá la conexión y probá de nuevo.' }], final: 'No se pudo correr.', error: null };
  if (r.cortado === 'tiempo') return { piezas: [{ tipo: 'aviso', tono: 'aviso', texto: `Pasaron ${LENGUAJES.sql.topeSegundos} segundos y lo paramos. ${vuelta}` }], final: `Lo paramos a los ${LENGUAJES.sql.topeSegundos} segundos.`, error: null };
  if (r.cortado) return { piezas: [{ tipo: 'aviso', tono: 'aviso', texto: `Lo paraste. ${vuelta}` }], final: 'Lo paraste.', error: null };
  if (r.error) return { piezas: [{ tipo: 'error', texto: enCriollo('sql', r.error), linea: r.linea, pistas }], final: r.linea > 0 ? `Error en la línea ${r.linea}.` : 'Terminó con un error.', error: r.linea > 0 ? { linea: r.linea } : null };
  const nodos = explicarPlan(filas, { tablas: m.leer().esquema ?? [], sentencia: sentencia.texto });
  // `logica` null: the reader didn't understand it, and the screen says so above the plan.
  return { piezas: [{ tipo: 'plan', linea: sentencia.linea, logica: queHace(sentencia.texto), nodos }], final: `Explicamos la consulta de la línea ${sentencia.linea}.`, error: null };
}
