// The MySQL script of a pasaje (pasaje.js): CREATE TABLE in the order the foreign keys need, as the course's scripts
// write it (Workbench: backquotes, `PRIMARY KEY (…)` and `CONSTRAINT … FOREIGN KEY … REFERENCES …`), and the foreign
// keys «on delete restrict on update cascade» like all of theirs (parcial-2, «Lo que se repite en sus resoluciones»).
// Types by the name of the column until the student changes them (docs/laboratorio-der.md, decision 4). Names in SQL
// are plain ASCII snake_case; the pasaje keeps them as written.
import { tipoLimpio } from './modelo';

const MAX_IDENTIFICADOR = 64;

/** A name as SQL takes it everywhere: ASCII, lowercase, words joined by `_`. */
export function nombreSql(nombre) {
  const n = String(nombre ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, MAX_IDENTIFICADOR - 4);
  if (!n) return 'x';
  return /^\d/.test(n) ? `t_${n}` : n;
}

const conComillas = (n) => `\`${n}\``;
const sinAuto = (t) => t.replace(/ AUTO_INCREMENT$/, '');

const tablaPorNombre = (resultado, nombre) => resultado.tablas.find((t) => t.nombre === nombre);

/**
 * The type a column gets until the student changes it: a CF, the one of the column it references; the `id` of a strong
 * entity, INT AUTO_INCREMENT; `fecha_hora…`, DATETIME; `fecha…`, DATE; the rest, VARCHAR(100).
 */
export function tipoSugerido(tabla, columna, resultado, tipos = {}, profundidad = 0) {
  const cf = tabla.cfs.find((f) => f.columnas?.includes(columna));
  if (cf && profundidad < 20) {
    const destino = tablaPorNombre(resultado, cf.tabla);
    const referida = cf.referidas[cf.columnas.indexOf(columna)];
    if (destino && destino.columnas.some((c) => c.nombre === referida)) return sinAuto(tipoDe(destino, referida, resultado, tipos, profundidad + 1));
  }
  if (columna === 'id' && tabla.origen?.tipo === 'entidad' && tabla.cp?.length === 1 && tabla.cp[0] === 'id' && !cf) return 'INT AUTO_INCREMENT';
  const n = nombreSql(columna);
  if (/^fecha_?hora/.test(n)) return 'DATETIME';
  if (n.startsWith('fecha')) return 'DATE';
  return 'VARCHAR(100)';
}

/** The type a column goes with: the student's (`tipos['tabla.columna']`) or the suggested one. */
export function tipoDe(tabla, columna, resultado, tipos = {}, profundidad = 0) {
  const propio = tipoLimpio(Object.hasOwn(tipos ?? {}, `${tabla.nombre}.${columna}`) ? tipos[`${tabla.nombre}.${columna}`] : '');
  const tipo = propio || tipoSugerido(tabla, columna, resultado, tipos, profundidad);
  // MySQL takes AUTO_INCREMENT only on a key column, alone.
  return tabla.cp?.length === 1 && tabla.cp[0] === columna ? tipo : sinAuto(tipo);
}

/**
 * What still keeps the script from being created, one short line each, naming the table or the vínculo: what the
 * drawing lacks (a hierarchy without its subclasses), the decisions pending and the tables without a CP. A table that
 * only waits for another's decision isn't one more.
 */
export function faltanParaSql(resultado) {
  const faltan = [...(resultado?.faltan ?? [])];
  faltan.push(...(resultado?.pendientes ?? []).map((p) => (p.tipo === 'cp' ? `A «${p.tabla}» le falta la clave primaria.` : `«${p.nombre}» es 1 a 1. Falta elegir dónde va la CF.`)));
  for (const t of resultado?.tablas ?? []) if (!t.cp && !t.espera.length && !resultado.pendientes.some((p) => p.tabla === t.nombre)) faltan.push(`A «${t.nombre}» le falta la clave primaria.`);
  return faltan;
}

const unico = (base, usados) => {
  let n = base;
  for (let i = 2; usados.has(n); i++) n = `${base}_${i}`;
  usados.add(n);
  return n;
};

/**
 * The MySQL script of the pasaje: { sql, faltan: [] }, or { sql: null, faltan: [texto] } while there is something
 * pending. `tipos`: the student's types, by 'tabla.columna' with the names of the pasaje.
 */
export function crearSql(resultado, tipos = {}) {
  const faltan = faltanParaSql(resultado);
  if (faltan.length || !resultado?.tablas?.length) return { sql: null, faltan: faltan.length ? faltan : ['No hay tablas para crear.'] };
  const tablas = resultado.tablas;
  const usadas = new Set();
  const sqlDe = new Map(tablas.map((t) => [t, unico(nombreSql(t.nombre), usadas)]));
  const columnaSql = new Map(
    tablas.map((t) => {
      const usados = new Set();
      return [t, new Map(t.columnas.map((c) => [c.nombre, unico(nombreSql(c.nombre), usados)]))];
    }),
  );
  const restricciones = new Set();
  const creadas = new Set();
  const despues = [];
  const bloques = tablas.map((t) => {
    const cols = columnaSql.get(t);
    const lineas = t.columnas.map((c) => {
      const tipo = tipoDe(t, c.nombre, resultado, tipos);
      const auto = tipo.endsWith(' AUTO_INCREMENT');
      return `  ${conComillas(cols.get(c.nombre))} ${sinAuto(tipo)}${c.nula ? '' : ' NOT NULL'}${auto ? ' AUTO_INCREMENT' : ''}`;
    });
    lineas.push(`  PRIMARY KEY (${t.cp.map((c) => conComillas(cols.get(c))).join(', ')})`);
    for (const f of t.cfs) {
      const destino = tablaPorNombre(resultado, f.tabla);
      if (!destino || !f.columnas) continue;
      const nombre = unico(`fk_${sqlDe.get(t)}_${sqlDe.get(destino)}`.slice(0, MAX_IDENTIFICADOR - 3), restricciones);
      const clave = `FOREIGN KEY (${f.columnas.map((c) => conComillas(cols.get(c))).join(', ')}) REFERENCES ${conComillas(sqlDe.get(destino))} (${f.referidas.map((c) => conComillas(columnaSql.get(destino).get(c))).join(', ')}) ON DELETE RESTRICT ON UPDATE CASCADE`;
      // A table that comes later (a cycle of CFs) gets it once both exist.
      if (destino === t || creadas.has(destino)) lineas.push(`  CONSTRAINT ${conComillas(nombre)} ${clave}`);
      else despues.push(`ALTER TABLE ${conComillas(sqlDe.get(t))} ADD CONSTRAINT ${conComillas(nombre)} ${clave};`);
    }
    creadas.add(t);
    return `CREATE TABLE ${conComillas(sqlDe.get(t))} (\n${lineas.join(',\n')}\n);`;
  });
  return { sql: `-- Creada desde el DER con su pasaje a tablas.\n\n${[...bloques, ...despues].join('\n\n')}\n`, faltan: [] };
}
