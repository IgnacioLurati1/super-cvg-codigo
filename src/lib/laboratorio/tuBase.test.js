// @vitest-environment jsdom
import { Blob as BlobNode, File as ArchivoNode } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./python.worker.js?worker&url', () => ({ default: '/assets/python.worker.js' }));
vi.mock('./sql.worker.js?worker&url', () => ({ default: '/assets/sql.worker.js' }));

// A worker of mentira that loads at once; each run ends as `fin` says (as the SQL worker would).
const workers = [];
let fin = { error: null, linea: 0 };
class WorkerFalso {
  constructor() {
    this.oyentes = { message: [], error: [] };
    this.recibidos = [];
    this.terminado = false;
    workers.push(this);
  }

  addEventListener(tipo, f) {
    this.oyentes[tipo].push(f);
  }

  postMessage(d) {
    this.recibidos.push(d);
    if (d.tipo === 'cargar') queueMicrotask(() => this.mandar({ tipo: 'listo', version: '3.54', pausa: true }));
    if (d.tipo === 'correr' && fin) {
      queueMicrotask(() => {
        if (fin.pistas) this.mandar({ tipo: 'dialecto', id: d.id, linea: fin.linea, pistas: fin.pistas, error: true });
        this.mandar({ tipo: 'fin', id: d.id, ms: 1, error: fin.error, linea: fin.linea });
      });
    }
  }

  mandar(d) {
    if (!this.terminado) this.oyentes.message.forEach((f) => f({ data: d }));
  }

  terminate() {
    this.terminado = true;
  }
}

let tuBase;
let motorDe;
let olvidarLaboratorio;
beforeEach(async () => {
  workers.length = 0;
  fin = { error: null, linea: 0 };
  vi.stubGlobal('Worker', WorkerFalso);
  URL.createObjectURL = vi.fn(() => 'blob:arranque');
  URL.revokeObjectURL = vi.fn();
  vi.resetModules();
  tuBase = await import('./tuBase');
  ({ motorDe } = await import('./motor'));
  ({ olvidarLaboratorio } = await import('./pendiente'));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// Node's, which read as a browser does (arrayBuffer).
const archivo = (partes, nombre) => new ArchivoNode(partes, nombre);
const SQLITE = new TextEncoder().encode('SQLite format 3\0');

describe('cargar tu base', () => {
  it('lee el archivo y sabe qué es, por su cabecera antes que por su nombre', async () => {
    expect(await tuBase.leerArchivo(archivo([SQLITE, new Uint8Array(100)], 'tp.sqlite'))).toMatchObject({ tipo: 'db', nombre: 'tp.sqlite' });
    expect(await tuBase.leerArchivo(archivo([SQLITE], 'raro.bin'))).toMatchObject({ tipo: 'db' });
    expect(await tuBase.leerArchivo(archivo(['hola'], 'x.db'))).toMatchObject({ problema: 'no-es-base' });
    expect(await tuBase.leerArchivo(archivo(['CREATE TABLE a (x);'], 'tp.sql'))).toMatchObject({ tipo: 'sql', texto: 'CREATE TABLE a (x);' });
    expect(await tuBase.leerArchivo(archivo(['a;b\n1;2'], 'notas.csv'))).toMatchObject({ tipo: 'csv' });
    expect(await tuBase.leerArchivo(archivo(['-- tp\nINSERT INTO a VALUES (1);'], 'tp.txt'))).toMatchObject({ tipo: 'sql' });
    expect(await tuBase.leerArchivo(archivo(['legajo,nota\n1,2'], 'notas.txt'))).toMatchObject({ tipo: 'csv' });
    // Its name goes on screen in one line, without what doesn't print.
    expect(await tuBase.leerArchivo(archivo(['SELECT 1;'], 'tp‮\nlqs.sql'))).toMatchObject({ tipo: 'sql', nombre: 'tp lqs.sql' });
    expect(await tuBase.leerArchivo(archivo([], 'vacio.sql'))).toMatchObject({ problema: 'vacio' });
    expect(await tuBase.leerArchivo(archivo(['   \n'], 'blanco.sql'))).toMatchObject({ problema: 'vacio' });
    const grande = { name: 'grande.sql', size: tuBase.MAX_TEXTO + 1, slice: () => new BlobNode(['CREATE']) };
    expect(await tuBase.leerArchivo(grande)).toMatchObject({ problema: 'grande', tope: tuBase.MAX_TEXTO });
  });

  it('un mysqldump con blobs en bytes, que no es UTF-8, se lee byte a byte; uno en UTF-8, como texto', async () => {
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47]);
    const crudo = await tuBase.leerArchivo(archivo(['INSERT INTO `p` VALUES (1,\'Pérez\',_binary \'', png, "');\n"], 'volcado.sql'));
    expect(crudo).toMatchObject({ tipo: 'sql', crudo: true });
    expect(crudo.texto).toContain('PÃ©rez');
    expect([...crudo.texto.slice(-8, -4)].map((c) => c.charCodeAt(0))).toEqual([...png]);
    const texto = await tuBase.leerArchivo(archivo(["INSERT INTO `p` VALUES (1,'Pérez');"], 'volcado.sql'));
    expect(texto).toEqual({ tipo: 'sql', nombre: 'volcado.sql', texto: "INSERT INTO `p` VALUES (1,'Pérez');" });
    // A loaded MySQL script says what was left out.
    const m = motorDe('sql');
    await m.encender();
    const usar = tuBase.usarBase(crudo);
    await vi.waitFor(() => expect(workers[0].recibidos.at(-1)).toMatchObject({ tipo: 'correr', base: { origen: { crudo: true } } }));
    expect((await usar).afuera).toEqual([]);
  });

  it('la base nueva va con la corrida y queda solo si salió bien; un worker nuevo la arma de nuevo', async () => {
    const m = motorDe('sql');
    await m.encender();
    expect(workers[0].recibidos[0]).toMatchObject({ tipo: 'cargar', fuente: null });

    const leido = { tipo: 'sql', nombre: 'tp.sql', texto: 'CREATE TABLE a (x);' };
    expect(await tuBase.usarBase(leido)).toMatchObject({ error: null });
    expect(workers[0].recibidos.at(-1)).toMatchObject({ tipo: 'correr', codigo: '', base: { origen: { tipo: 'sql', nombre: 'tp.sql', texto: 'CREATE TABLE a (x);' }, tablas: [] } });
    expect(m.leer().base).toEqual({ origen: { tipo: 'sql', nombre: 'tp.sql' }, tablas: [] });

    // One that fails: the one before stays, with what MySQL says another way.
    fin = { error: 'near "GO": syntax error', linea: 2, pistas: ['`GO` sobra.'] };
    expect(await tuBase.usarBase({ tipo: 'sql', nombre: 'malo.sql', texto: 'x\nGO' })).toMatchObject({ error: 'near "GO": syntax error', linea: 2, pistas: ['`GO` sobra.'] });
    expect(m.fuente.origen.nombre).toBe('tp.sql');

    // A CSV adds up to it.
    fin = { error: null, linea: 0 };
    const tabla = { archivo: 'n.csv', tabla: 'n', separador: ',', encabezado: true, columnas: [{ nombre: 'a', tipo: 'TEXT' }], texto: 'a\n1' };
    await tuBase.sumarTablaCsv(tabla);
    expect(workers[0].recibidos.at(-1)).toMatchObject({ tipo: 'correr', tabla });
    expect(m.leer().base).toEqual({ origen: { tipo: 'sql', nombre: 'tp.sql' }, tablas: ['n'] });
    expect(tuBase.comoVolvio(m.leer().base)).toBe('Tu base volvió a como la cargaste.');

    // «Parar»: the new worker starts from the student's database.
    fin = null;
    const corrida = m.correr('SELECT 1');
    await Promise.resolve();
    await Promise.resolve();
    m.cortar('parado');
    expect(await corrida).toEqual({ cortado: 'parado' });
    expect(workers[1].recibidos[0]).toMatchObject({ tipo: 'cargar', fuente: { origen: { nombre: 'tp.sql' }, tablas: [tabla] } });

    // Back to the practice one, and leaving forgets it.
    fin = { error: null, linea: 0 };
    await m.encender();
    await tuBase.usarBase(null);
    expect(m.leer().base).toBeNull();
    expect(tuBase.comoVolvio(null)).toBe('La base de práctica volvió a como venía.');
    await tuBase.sumarTablaCsv(tabla);
    expect(tuBase.comoVolvio(m.leer().base)).toMatch(/con las tablas que sumaste/);
    olvidarLaboratorio();
    expect(m.fuente).toBeNull();
    expect(m.leer().base).toBeNull();
  });
});
