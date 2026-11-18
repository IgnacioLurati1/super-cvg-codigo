// What the programs of the lab write, kept in this browser (escritos.js): the list in mio.js, the bytes in the
// browser's database (bodega.js, simulated here in memory, as if it outlived a reload).
import { Blob as BlobDeNode } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const bodega = vi.hoisted(() => ({ m: new Map(), lleno: false }));
vi.mock('../bodega', () => ({
  guardarEnBodega: async (u, id, blob) => {
    if (bodega.lleno) throw new Error('lleno');
    bodega.m.set(`${u}:${id}`, blob);
  },
  leerDeBodega: async (u, id) => {
    if (!bodega.m.has(`${u}:${id}`)) throw new Error('no está');
    return bodega.m.get(`${u}:${id}`);
  },
  borrarDeBodega: async (u, ids) => ids.forEach((id) => bodega.m.delete(`${u}:${id}`)),
  idsEnBodega: async (u) => [...bodega.m.keys()].filter((k) => k.startsWith(`${u}:`)).map((k) => k.slice(String(u).length + 1)),
}));

const bytes = (t) => new TextEncoder().encode(t);
const texto = (b) => new TextDecoder().decode(b);
const PROYECTO = { id: 'qagenda001', nombre: 'Agenda', lenguaje: 'c', materia: null, principal: null, creado: 1, cambiado: 1 };
const SUELTO = { id: 'lsuelto01', nombre: 'suelto', lenguaje: 'python', codigo: 'print(1)', materia: null, creado: 2, cambiado: 2 };

let mio;
let e;
// A visit: the modules start again with what the browser kept (localStorage and the database).
async function visita() {
  vi.resetModules();
  mio = await import('../mio');
  e = await import('./escritos');
  mio.fijarUsuario(5);
  await e.escritosListos();
}
const conLugares = () => mio.cambiarMio((d) => ({ ...d, proyectosLab: [PROYECTO], laboratorio: [{ ...SUELTO }, { id: 'lmain0001', nombre: 'main', lenguaje: 'c', codigo: 'int main(void){}', proyecto: PROYECTO.id, creado: 3, cambiado: 3 }] }));
const corrida = (donde, cambiados, borrados = []) => e.anotarCorrida(donde, [{ nombre: 'main.c', contenido: 'int main(void){}' }], { cambiados, borrados });
const delBrowser = () => [...bodega.m.keys()];

beforeEach(async () => {
  vi.stubGlobal('Blob', BlobDeNode);
  // Web Locks, as the browsers have them: one at a time.
  let cola = Promise.resolve();
  vi.stubGlobal('navigator', { ...globalThis.navigator, locks: { request: (_n, fn) => (cola = cola.then(fn, fn)) } });
  localStorage.clear();
  bodega.m.clear();
  bodega.lleno = false;
  await visita();
  conLugares();
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('lo que escribe el programa, en este navegador', () => {
  it('queda para la próxima visita y la corrida siguiente lo lee', async () => {
    expect(await corrida(PROYECTO.id, [{ nombre: 'turnos.txt', contenido: bytes('turno 1\n') }, { nombre: 'datos/r.dat', contenido: new Uint8Array([0, 1, 2]) }])).toBeNull();
    const lista = mio.mioActual().escritos;
    expect(lista.map((x) => [x.donde, x.nombre, x.tam])).toEqual([[PROYECTO.id, 'datos/r.dat', 3], [PROYECTO.id, 'turnos.txt', 8]]);
    expect(delBrowser()).toHaveLength(2);
    // Nothing of what it wrote is in the list itself.
    expect(localStorage.getItem('cl.mio.5')).not.toContain('turno 1');

    await visita();
    expect(e.escritosDe(PROYECTO.id).map((x) => [x.nombre, x.texto])).toEqual([['datos/r.dat', null], ['turnos.txt', 'turno 1\n']]);
    const carpeta = e.paraLaCorrida([{ nombre: 'main.c', contenido: 'int main(void){}' }], PROYECTO.id);
    expect(carpeta.map((a) => a.nombre)).toEqual(['main.c', 'datos/r.dat', 'turnos.txt']);
    expect(texto(carpeta[2].contenido)).toBe('turno 1\n');
  });

  it('una corrida nueva cambia solo lo que tocó, y lo viejo se va de la base', async () => {
    await corrida(PROYECTO.id, [{ nombre: 'a.txt', contenido: bytes('uno') }, { nombre: 'b.txt', contenido: bytes('dos') }]);
    const antes = mio.mioActual().escritos.find((x) => x.nombre === 'a.txt').id;
    await corrida(PROYECTO.id, [{ nombre: 'a.txt', contenido: bytes('otra') }], ['b.txt']);
    const lista = mio.mioActual().escritos;
    expect(lista.map((x) => x.nombre)).toEqual(['a.txt']);
    expect(delBrowser()).not.toContain(`5:${antes}`);
    expect(delBrowser()).toHaveLength(1);
    await visita();
    expect(texto(e.escritosDe(PROYECTO.id)[0].bytes)).toBe('otra');
  });

  it('lo que el programa borró de los archivos del proyecto también queda', async () => {
    await corrida(PROYECTO.id, [], ['main.c']);
    await visita();
    expect(e.escritosDe(PROYECTO.id)).toMatchObject([{ nombre: 'main.c', borrado: true }]);
    expect(e.paraLaCorrida([{ nombre: 'main.c', contenido: 'x' }], PROYECTO.id)).toEqual([]);
  });

  it('el borrador y una sesión en vivo quedan solo en la pestaña; guardado, pasa a su archivo', async () => {
    await corrida('mesa-0', [{ nombre: 'n.txt', contenido: bytes('borrador') }]);
    await corrida(`vivo-${PROYECTO.id}`, [{ nombre: 'v.txt', contenido: bytes('en vivo') }]);
    expect(mio.mioActual().escritos).toEqual([]);
    expect(e.seGuarda('mesa-0')).toBe(false);
    expect(e.seGuarda(SUELTO.id)).toBe(true);
    e.mudarEscritos('mesa-0', SUELTO.id);
    await e.escritosListos();
    expect(mio.mioActual().escritos.map((x) => [x.donde, x.nombre])).toEqual([[SUELTO.id, 'n.txt']]);
    await visita();
    expect(e.escritosDe(SUELTO.id).map((x) => x.texto)).toEqual(['borrador']);
    expect(e.escritosDe(`vivo-${PROYECTO.id}`)).toEqual([]);
  });

  it('borrar el proyecto se lleva lo que escribió', async () => {
    await corrida(PROYECTO.id, [{ nombre: 'a.txt', contenido: bytes('uno') }]);
    mio.cambiarMio((d) => ({ ...d, proyectosLab: [], laboratorio: d.laboratorio.filter((a) => !a.proyecto) }));
    e.descartarEscrito(PROYECTO.id);
    await e.escritosListos();
    expect(mio.mioActual().escritos).toEqual([]);
    expect(delBrowser()).toEqual([]);
  });

  it('Salir lo borra de este navegador sin contarlo como un cambio para Drive', async () => {
    localStorage.setItem('cl.sync.5', JSON.stringify({ prendido: false, t: {}, d: {} }));
    await corrida(PROYECTO.id, [{ nombre: 'a.txt', contenido: bytes('uno') }]);
    const marcas = localStorage.getItem('cl.sync.5');
    // Another student of this browser too.
    localStorage.setItem('cl.mio.8', JSON.stringify({ escritos: [{ donde: PROYECTO.id, nombre: 'x', id: 'x'.repeat(24), tam: 1 }] }));
    bodega.m.set(`8:${'x'.repeat(24)}`, new BlobDeNode(['x']));
    await e.borrarEscritosGuardados();
    expect(mio.mioActual().escritos).toEqual([]);
    expect(JSON.parse(localStorage.getItem('cl.mio.8')).escritos).toBeUndefined();
    expect(delBrowser()).toEqual([]);
    expect(e.escritosDe(PROYECTO.id)).toEqual([]);
    expect(localStorage.getItem('cl.sync.5')).toBe(marcas);
    // The rest of the lab stays.
    expect(mio.mioActual().proyectosLab).toHaveLength(1);
  });

  it('olvidar el laboratorio vacía la memoria; lo guardado vuelve a entrar', async () => {
    await corrida(PROYECTO.id, [{ nombre: 'a.txt', contenido: bytes('uno') }]);
    const { olvidarLaboratorio } = await import('./pendiente');
    olvidarLaboratorio();
    expect(e.escritosDe(PROYECTO.id)).toEqual([]);
    mio.fijarUsuario(null);
    mio.fijarUsuario(5);
    await e.escritosListos();
    expect(e.escritosDe(PROYECTO.id).map((x) => x.nombre)).toEqual(['a.txt']);
  });

  it('sin Drive, lo que no tiene sus bytes sale de la lista', async () => {
    await corrida(PROYECTO.id, [{ nombre: 'a.txt', contenido: bytes('uno') }]);
    bodega.m.clear();
    await visita();
    expect(e.escritosDe(PROYECTO.id)).toEqual([]);
    expect(mio.mioActual().escritos).toEqual([]);
  });

  it('con Drive prendido, espera a que lleguen de ahí', async () => {
    localStorage.setItem('cl.sync.5', JSON.stringify({ prendido: true }));
    await corrida(PROYECTO.id, [{ nombre: 'a.txt', contenido: bytes('uno') }]);
    const guardado = new Map(bodega.m);
    bodega.m.clear();
    await visita();
    expect(mio.mioActual().escritos).toHaveLength(1);
    expect(e.escritosDe(PROYECTO.id)).toEqual([]);
    for (const [k, v] of guardado) bodega.m.set(k, v);
    e.escritosLlegaron();
    await e.escritosListos();
    expect(e.escritosDe(PROYECTO.id).map((x) => x.texto)).toEqual(['uno']);
  });

  it('pasado el tope de un proyecto quedan afuera los más grandes, y lo dice', async () => {
    const grande = new Uint8Array(e.TOPE_ESCRITOS - 10);
    expect(await corrida(PROYECTO.id, [{ nombre: 'chico.txt', contenido: bytes('hola') }, { nombre: 'grande.dat', contenido: grande }, { nombre: 'otro.dat', contenido: new Uint8Array(20) }])).toBe(e.MUY_GRANDE);
    expect(e.escritosDe(PROYECTO.id).map((x) => x.nombre)).toEqual(['chico.txt', 'otro.dat']);
    expect(mio.mioActual().escritos.map((x) => x.nombre)).toEqual(['chico.txt', 'otro.dat']);
  });

  it('sin lugar en el navegador queda en la pestaña, lo dice y no pisa lo guardado', async () => {
    await corrida(PROYECTO.id, [{ nombre: 'a.txt', contenido: bytes('uno') }]);
    bodega.lleno = true;
    expect(await corrida(PROYECTO.id, [{ nombre: 'a.txt', contenido: bytes('dos') }])).toBe(e.SIN_LUGAR);
    expect(texto(e.escritosDe(PROYECTO.id)[0].bytes)).toBe('dos');
    expect(delBrowser()).toHaveLength(1);
    // Reading the list again doesn't bring back the old one over what is in this tab.
    e.escritosLlegaron();
    await e.escritosListos();
    expect(texto(e.escritosDe(PROYECTO.id)[0].bytes)).toBe('dos');
    await visita();
    expect(texto(e.escritosDe(PROYECTO.id)[0].bytes)).toBe('uno');
  });

  it('el tope de todos los proyectos juntos también', async () => {
    const quince = () => new Uint8Array(15 * 1024 * 1024);
    const lugares = [PROYECTO.id, SUELTO.id];
    mio.cambiarMio((d) => ({ ...d, laboratorio: [...d.laboratorio, ...['lotro0001', 'lotro0002', 'lotro0003'].map((id, i) => ({ ...SUELTO, id, creado: 10 + i }))] }));
    lugares.push('lotro0001', 'lotro0002', 'lotro0003');
    const problemas = [];
    for (const donde of lugares) problemas.push(await corrida(donde, [{ nombre: 'r.dat', contenido: quince() }]));
    expect(problemas).toEqual([null, null, null, null, e.SIN_LUGAR]);
    expect(mio.mioActual().escritos).toHaveLength(4);
    expect(e.escritosDe('lotro0003')).toHaveLength(1);
  });
});

describe('lo que llega de un archivo o de Drive', () => {
  it('solo nombres, tamaños e ids válidos, de lugares que existen y dentro del tope', async () => {
    const { sanearEscritos, TOPE_ESCRITOS } = await import('./saneo');
    const id = (c) => c.repeat(24);
    const lugares = new Set([PROYECTO.id]);
    expect(sanearEscritos([
      { donde: PROYECTO.id, nombre: 'bien.txt', id: id('a'), tam: 3 },
      { donde: PROYECTO.id, nombre: 'bien.txt', id: id('b'), tam: 3 },
      { donde: PROYECTO.id, nombre: 'otro.txt', id: id('a'), tam: 3 },
      { donde: 'qnoexiste1', nombre: 'x.txt', id: id('c'), tam: 3 },
      { donde: PROYECTO.id, nombre: '../afuera', id: id('d'), tam: 3 },
      { donde: PROYECTO.id, nombre: '/raiz', id: id('e'), tam: 3 },
      { donde: PROYECTO.id, nombre: 'a\\b', id: id('f'), tam: 3 },
      { donde: PROYECTO.id, nombre: 'mal\n.txt', id: id('g'), tam: 3 },
      { donde: PROYECTO.id, nombre: 'corto.txt', id: 'abc', tam: 3 },
      { donde: PROYECTO.id, nombre: 'negativo.txt', id: id('h'), tam: -1 },
      { donde: PROYECTO.id, nombre: 'enorme.dat', id: id('i'), tam: TOPE_ESCRITOS + 1 },
      { donde: PROYECTO.id, nombre: 'borrado.c', borrado: true, id: id('j'), tam: 9 },
      { donde: PROYECTO.id, nombre: 'ñandú/año.txt', id: id('k'), tam: 1, sobra: '<script>' },
      'basura',
    ], lugares)).toEqual([
      { donde: PROYECTO.id, nombre: 'bien.txt', id: id('a'), tam: 3 },
      { donde: PROYECTO.id, nombre: 'borrado.c', borrado: true },
      { donde: PROYECTO.id, nombre: 'ñandú/año.txt', id: id('k'), tam: 1 },
    ]);
  });

  it('cada uno es un elemento de la unión, también con acentos y carpetas en el nombre', async () => {
    const { armar, piezas } = await import('../union');
    // What the marks of the copy accept as a key (marcas.js).
    const CLAVE_DE_MARCA = /^[\w./-]{1,300}$/;
    const escritos = [
      { donde: PROYECTO.id, nombre: 'ñandú/año.txt', id: 'k'.repeat(24), tam: 1 },
      { donde: PROYECTO.id, nombre: 'main.c', borrado: true },
    ];
    const p = piezas({ escritos });
    expect(Object.keys(p).every((k) => CLAVE_DE_MARCA.test(k))).toBe(true);
    expect(armar(p).escritos).toEqual(escritos);
  });
});
