// The SQL of the lab: SQLite (sql.js), in this worker, from this site's /motores/sql/. The database lives here while the
// worker does: the practice one, or the student's own (sqlBase.js). «Reiniciar la base» builds it again from where it
// came, and stopping a run takes it back to that. Once loaded the worker loses the network (red.js). The messages are
// the ones of every engine (motor.js); a run with `base` or `tabla` changes the database instead of running code.
import initSqlJs from 'sql.js';
import { contarBajadas } from './progreso';
import { cerrarRed } from './red';
import { armarBase, esquemaDe, sumarTabla } from './sqlBase';
import { codigoParaSqlite, correrEnBase } from './sqlCorrer';
import { revisarSql } from './sqlRevisar';

const enviar = self.postMessage.bind(self);
const escuchar = self.addEventListener.bind(self);

let SQL = null;
let db = null;
// Where the database comes from (sqlBase.js): null, the practice one.
let fuente = null;
// What of a MySQL script was left out the last time the database was built (mysql.js).
let afuera = [];

/** Builds the database from `nueva`. If it doesn't build, the one there was stays, and it says why. */
function nuevaBase(nueva = fuente) {
  const r = armarBase(SQL, nueva);
  if (!r.db) return r;
  db?.close();
  db = r.db;
  fuente = nueva;
  afuera = r.afuera ?? [];
  return null;
}

const esquema = () => esquemaDe(db);

function correr({ id, codigo }) {
  const desde = performance.now();
  const { error, linea } = correrEnBase(db, codigo, (m) => enviar({ ...m, id }), { enPractica: !fuente?.origen });
  enviar({ tipo: 'fin', id, ms: Math.round(performance.now() - desde), error, linea });
  enviar({ tipo: 'esquema', tablas: esquema() });
}

/** A run that changes the database: all of it again (`base`) or one more table (`tabla`). */
function cambiar(data) {
  const desde = performance.now();
  let falla = null;
  if (data.tabla) {
    try {
      sumarTabla(db, data.tabla);
      fuente = { origen: fuente?.origen ?? null, tablas: [...(fuente?.tablas ?? []), data.tabla] };
    } catch (e) {
      falla = { error: String(e?.message ?? e), linea: 0 };
    }
  } else {
    const r = nuevaBase(data.base ?? null);
    if (r) falla = r.noEsBase ? { error: 'no-es-base', linea: 0 } : r;
  }
  if (falla?.pistas?.length) enviar({ tipo: 'dialecto', id: data.id, linea: falla.linea, pistas: falla.pistas, error: true });
  if (!falla && !data.tabla && afuera.length) enviar({ tipo: 'importado', id: data.id, afuera: afuera.slice(0, 200) });
  enviar({ tipo: 'fin', id: data.id, ms: Math.round(performance.now() - desde), error: falla?.error ?? null, linea: falla?.linea ?? 0 });
  enviar({ tipo: 'esquema', tablas: esquema() });
}

escuchar('message', async ({ data }) => {
  if (data?.tipo === 'cargar') {
    try {
      contarBajadas(self, (bajado) => enviar({ tipo: 'progreso', bajado, total: Number(data.total) || 0 }));
      SQL = await initSqlJs({ locateFile: (archivo) => `${data.base}sql/${archivo}` });
      cerrarRed(self);
      // The student's database, as it was given; if it no longer builds, the practice one.
      if (nuevaBase(data.fuente ?? null)) nuevaBase(null);
      enviar({ tipo: 'listo', version: String(db.exec('SELECT sqlite_version()')[0].values[0][0]), pausa: true });
      enviar({ tipo: 'esquema', tablas: esquema() });
    } catch (e) {
      enviar({ tipo: 'falla', mensaje: String(e?.message ?? e) });
    }
  } else if (data?.tipo === 'correr' && db) {
    if ('base' in data || data.tabla) cambiar(data);
    else correr(data);
  } else if (data?.tipo === 'revisar' && db) {
    // Prepares each statement in a database apart, without running it (sqlRevisar.js): `revisado` { error, linea }.
    let r = {};
    try {
      r = revisarSql(SQL, db, codigoParaSqlite(String(data.codigo ?? '')));
    } catch {
      // Nothing to mark.
    }
    enviar({ tipo: 'revisado', id: data.id, error: typeof r.error === 'string' ? r.error : null, linea: Number(r.linea) || 0 });
  } else if (data?.tipo === 'reiniciar' && db) {
    nuevaBase();
    enviar({ tipo: 'reiniciada' });
    enviar({ tipo: 'esquema', tablas: esquema() });
  }
});
