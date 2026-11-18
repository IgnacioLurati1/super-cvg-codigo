import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { traerArchivo } from './archivos';
import { cuentaDe, buscarEnPdfs, leerPdfs, textosDe } from './indicePdf';
import { textoDePaginas } from './leerTexto';
import { fijarUsuario } from './mio';
import { cerrarSesion, iniciarSesion } from './sesion';
import { borrarTextosPdf, guardarTexto, selloDe, textoGuardado, TOPE_DISCO } from './textosPdf';

vi.mock('./archivos', () => ({ traerArchivo: vi.fn() }));
vi.mock('./leerTexto', () => ({
  // As the real one: stops waiting when the signal fires.
  hastaCancelar: (promesa, senal) => new Promise((ok, mal) => {
    const alCancelar = () => mal(new DOMException('Cancelado', 'AbortError'));
    if (senal.aborted) alCancelar();
    senal.addEventListener('abort', alCancelar, { once: true });
    promesa.then(ok, mal);
  }),
  textoDePaginas: vi.fn(),
}));

// The browser's database, in memory: the requests answer in order, and a transaction ends when nothing is left to do.
function baseFalsa() {
  const bases = new Map();
  const copia = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const falsa = {
    aperturas: 0,
    open(nombre, version) {
      falsa.aperturas += 1;
      const pedido = {};
      queueMicrotask(() => {
        let datos = bases.get(nombre);
        if (!datos) {
          datos = { version: 0, almacenes: new Map(), conexiones: new Set() };
          bases.set(nombre, datos);
        }
        pedido.result = conexion(datos);
        if (datos.version < version) {
          datos.version = version;
          pedido.onupgradeneeded?.();
        }
        pedido.onsuccess?.();
      });
      return pedido;
    },
    deleteDatabase(nombre) {
      const pedido = {};
      const borrar = () => {
        const datos = bases.get(nombre);
        if (datos?.conexiones.size) {
          pedido.onblocked?.();
          setTimeout(borrar, 1);
          return;
        }
        bases.delete(nombre);
        pedido.onsuccess?.();
      };
      queueMicrotask(() => {
        for (const c of [...(bases.get(nombre)?.conexiones ?? [])]) c.onversionchange?.();
        borrar();
      });
      return pedido;
    },
    /** What a store holds: { key: value }. */
    contenido: (almacen) => Object.fromEntries(bases.get('super-cvg-textos')?.almacenes.get(almacen) ?? []),
    existe: () => bases.has('super-cvg-textos'),
  };
  function conexion(datos) {
    const db = {
      objectStoreNames: { contains: (n) => datos.almacenes.has(n) },
      createObjectStore: (n) => datos.almacenes.set(n, new Map()),
      close: () => datos.conexiones.delete(db),
      transaction: (nombres) => {
        if (!datos.conexiones.has(db)) throw new DOMException('Cerrada', 'InvalidStateError');
        return transaccion(datos, [nombres].flat());
      },
    };
    datos.conexiones.add(db);
    return db;
  }
  function transaccion(datos, nombres) {
    const tx = {};
    let pendientes = 0;
    let terminada = false;
    const revisar = () => {
      if (pendientes || terminada) return;
      terminada = true;
      queueMicrotask(() => tx.oncomplete?.());
    };
    const hacer = (pedido, f) => {
      pendientes += 1;
      queueMicrotask(() => {
        pedido.result = f();
        pendientes -= 1;
        pedido.onsuccess?.();
        revisar();
      });
      return pedido;
    };
    tx.objectStore = (nombre) => {
      if (!nombres.includes(nombre)) throw new DOMException('Fuera', 'NotFoundError');
      const m = datos.almacenes.get(nombre);
      return {
        get: (k) => hacer({}, () => copia(m.get(k))),
        put: (v, k) => hacer({}, () => {
          m.set(k, copia(v));
          return k;
        }),
        delete: (k) => hacer({}, () => {
          m.delete(k);
        }),
        openCursor: () => {
          const pedido = {};
          let ultima = null;
          const paso = () => {
            const k = [...m.keys()].sort().find((c) => ultima === null || c > ultima);
            if (k === undefined) return null;
            ultima = k;
            return { key: k, value: copia(m.get(k)), continue: () => hacer(pedido, paso) };
          };
          return hacer(pedido, paso);
        },
      };
    };
    queueMicrotask(revisar);
    return tx;
  }
  return falsa;
}

const asentar = async () => {
  for (let i = 0; i < 5; i++) await new Promise((ok) => setTimeout(ok, 0));
};

// «Apunte» (1-11) and «Guía» (1-12), with the version the campus gives them.
const pdf = (clave, extra = {}) => ({ tipo: 'archivo', mime: 'application/pdf', archivo: `${clave}.pdf`, nombre: clave, materiaId: 1, clave, peso: 900, modificado: 1_700_000_000, ...extra });
const apunte = (extra) => pdf('11', extra);
const guia = (extra) => pdf('12', extra);

// What each file says in the campus right now, by key.
let enElCampus;
let sesiones = 0;
function entrar(alumno) {
  sesiones += 1;
  iniciarSesion(`clave-${sesiones}`);
  fijarUsuario(alumno);
}

let falsa;
beforeEach(() => {
  falsa = baseFalsa();
  vi.stubGlobal('indexedDB', falsa);
  enElCampus = { 11: ['El monitor junta los datos'], 12: ['Semáforos de Dijkstra', 'Página dos'] };
  const textoDe = new Map();
  traerArchivo.mockReset().mockImplementation(async (item) => {
    const blob = new Blob(['%PDF']);
    textoDe.set(blob, enElCampus[item.clave]);
    return blob;
  });
  textoDePaginas.mockReset().mockImplementation(async (blob) => textoDe.get(blob));
  entrar(5);
});

afterEach(async () => {
  await borrarTextosPdf();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('el texto de los PDF en este navegador', () => {
  it('a file read on an earlier visit, unchanged, is not downloaded again', async () => {
    await leerPdfs([apunte(), guia()]);
    expect(traerArchivo).toHaveBeenCalledTimes(2);
    await asentar();
    expect(Object.keys(falsa.contenido('textos')).sort()).toEqual(['5:1-11', '5:1-12']);
    // Only the text of each page and the version, never the file.
    expect(falsa.contenido('textos')['5:1-12']).toEqual({ sello: '1700000000:900', paginas: ['Semáforos de Dijkstra', 'Página dos'] });

    // Another visit: the memory starts from nothing, the disk answers.
    entrar(5);
    expect(cuentaDe([apunte(), guia()])).toMatchObject({ leidos: 0, faltan: 2 });
    await leerPdfs([apunte(), guia()]);
    expect(traerArchivo).toHaveBeenCalledTimes(2);
    expect(cuentaDe([apunte(), guia()])).toMatchObject({ leidos: 2, faltan: 0 });
    expect(textosDe([guia()])).toEqual([{ item: guia(), paginas: ['Semáforos de Dijkstra', 'Página dos'] }]);
    // Searched as if just read: the folded text is made again.
    expect(buscarEnPdfs([apunte(), guia()], 'semaforos').map((h) => h.item.clave)).toEqual(['12']);
  });

  it('a file that changed in the campus is read again, and its text replaced', async () => {
    await leerPdfs([apunte()]);
    await asentar();

    enElCampus[11] = ['El monitor, versión corregida'];
    entrar(5);
    await leerPdfs([apunte({ modificado: 1_700_000_500 })]);
    expect(traerArchivo).toHaveBeenCalledTimes(2);
    expect(textosDe([apunte()])[0].paginas).toEqual(['El monitor, versión corregida']);
    await asentar();
    expect(falsa.contenido('textos')['5:1-11']).toEqual({ sello: '1700000500:900', paginas: ['El monitor, versión corregida'] });

    // Same date, another size: also another file.
    entrar(5);
    await leerPdfs([apunte({ modificado: 1_700_000_500, peso: 950 })]);
    expect(traerArchivo).toHaveBeenCalledTimes(3);
    await asentar();

    // And the new one is kept.
    entrar(5);
    await leerPdfs([apunte({ modificado: 1_700_000_500, peso: 950 })]);
    expect(traerArchivo).toHaveBeenCalledTimes(3);
  });

  it('another student never sees them', async () => {
    await leerPdfs([apunte()]);
    await asentar();
    entrar(6);
    await leerPdfs([apunte()]);
    expect(traerArchivo).toHaveBeenCalledTimes(2);
    expect(await textoGuardado(7, '1-11', selloDe(apunte()))).toBeNull();
    await asentar();
    expect(Object.keys(falsa.contenido('textos')).sort()).toEqual(['5:1-11', '6:1-11']);
  });

  it('without a student, or without the version of the file, stays only in memory', async () => {
    fijarUsuario(null);
    await leerPdfs([apunte()]);
    entrar(5);
    await leerPdfs([guia({ modificado: 0 })]);
    await asentar();
    expect(textosDe([guia({ modificado: 0 })])).toHaveLength(1);
    expect(falsa.contenido('textos')).toEqual({});
  });

  it('is looked for only when its turn to download comes', async () => {
    cuentaDe([apunte()]);
    textosDe([apunte()]);
    buscarEnPdfs([apunte()], 'monitor');
    // Too big is never asked for, neither to the campus nor to the disk.
    await leerPdfs([apunte({ peso: 25 * 1024 * 1024 })]);
    expect(falsa.aperturas).toBe(0);
    expect(traerArchivo).not.toHaveBeenCalled();
  });

  it('Salir deletes them, also from another tab', async () => {
    await leerPdfs([apunte()]);
    await asentar();
    cerrarSesion();
    await asentar();
    expect(falsa.existe()).toBe(false);
    entrar(5);
    await leerPdfs([apunte()]);
    expect(traerArchivo).toHaveBeenCalledTimes(2);
    await asentar();
    expect(falsa.existe()).toBe(true);

    // Salir in another tab ends this one too.
    window.dispatchEvent(new StorageEvent('storage', { key: 'cl.salida', newValue: String(Date.now()) }));
    await asentar();
    expect(falsa.existe()).toBe(false);
  });

  it('a file that arrives after Salir does not reach the disk', async () => {
    let soltar;
    traerArchivo.mockImplementationOnce(() => new Promise((ok) => {
      soltar = () => ok(new Blob(['%PDF']));
    }));
    textoDePaginas.mockImplementationOnce(async () => ['Llegó tarde']);
    const ronda = leerPdfs([apunte()]);
    await vi.waitFor(() => expect(soltar).toBeTypeOf('function'));
    cerrarSesion();
    soltar();
    await ronda;
    await asentar();
    expect(falsa.contenido('textos')).toEqual({});
  });

  it('makes room by the one used longest ago, of any student', async () => {
    let ahora = 1000;
    vi.spyOn(Date, 'now').mockImplementation(() => ahora);
    const diez = ['0123456789'];
    await guardarTexto(5, '1-1', 's', diez, 25);
    ahora += 1;
    await guardarTexto(6, '1-2', 's', diez, 25);
    ahora += 1;
    // Used again: it goes to the end of the line.
    expect(await textoGuardado(5, '1-1', 's')).toEqual(diez);
    ahora += 1;
    await guardarTexto(5, '1-3', 's', diez, 25);
    expect(Object.keys(falsa.contenido('textos')).sort()).toEqual(['5:1-1', '5:1-3']);
    expect(Object.keys(falsa.contenido('fichas')).sort()).toEqual(['5:1-1', '5:1-3']);
    // Bigger than everything: not kept, and nothing else goes away for it.
    await guardarTexto(5, '1-4', 's', ['x'.repeat(26)], 25);
    expect(Object.keys(falsa.contenido('textos')).sort()).toEqual(['5:1-1', '5:1-3']);
    expect(TOPE_DISCO).toBe(30_000_000);
  });

  it('something broken on disk counts as not read', async () => {
    await guardarTexto(5, '1-11', selloDe(apunte()), ['bien']);
    const db = await new Promise((ok) => {
      const pedido = falsa.open('super-cvg-textos', 1);
      pedido.onsuccess = () => ok(pedido.result);
    });
    const tx = db.transaction(['textos']);
    tx.objectStore('textos').put({ sello: selloDe(apunte()), paginas: [{ no: 'texto' }] }, '5:1-11');
    await asentar();
    db.close();
    await leerPdfs([apunte()]);
    expect(traerArchivo).toHaveBeenCalledTimes(1);
    expect(textosDe([apunte()])[0].paginas).toEqual(['El monitor junta los datos']);
  });

  describe('without the database, as before', () => {
    const sinDisco = async () => {
      await leerPdfs([apunte(), guia()]);
      expect(textosDe([apunte(), guia()])).toHaveLength(2);
      entrar(5);
      await leerPdfs([apunte(), guia()]);
      expect(traerArchivo).toHaveBeenCalledTimes(4);
      expect(cuentaDe([apunte(), guia()])).toMatchObject({ leidos: 2, fallaron: 0 });
      cerrarSesion();
      await asentar();
    };

    it('when the browser has none', async () => {
      vi.stubGlobal('indexedDB', undefined);
      await sinDisco();
    });

    it('when it does not open', async () => {
      vi.stubGlobal('indexedDB', {
        open: () => {
          const pedido = {};
          queueMicrotask(() => pedido.onerror?.());
          return pedido;
        },
        deleteDatabase: () => {
          throw new DOMException('No', 'SecurityError');
        },
      });
      await sinDisco();
    });

    it('when it fails in the middle', async () => {
      const rota = baseFalsa();
      const abrir = rota.open;
      rota.open = (...a) => {
        const pedido = abrir(...a);
        queueMicrotask(() => {
          if (pedido.result) pedido.result.transaction = () => {
            throw new DOMException('Llena', 'QuotaExceededError');
          };
        });
        return pedido;
      };
      vi.stubGlobal('indexedDB', rota);
      await sinDisco();
    });
  });
});

describe('un PDF de una materia propia', () => {
  it('sale de este navegador, no del campus, y su texto no va al disco', async () => {
    const blob = new Blob(['%PDF']);
    const traer = vi.fn(async () => blob);
    textoDePaginas.mockImplementation(async (b) => (b === blob ? ['Apunte mío de servos'] : null));
    const suyo = { tipo: 'archivo', mime: 'application/pdf', archivo: 'Servos.pdf', nombre: 'Servos', propio: true, archivoId: 'abcd1234', peso: 900, traer };
    await leerPdfs([suyo]);
    expect(traer).toHaveBeenCalledTimes(1);
    expect(traerArchivo).not.toHaveBeenCalled();
    expect(textosDe([suyo])).toEqual([{ item: suyo, paginas: ['Apunte mío de servos'] }]);
    await asentar();
    // On another visit nothing of it comes from the disk: it is read again from the file.
    entrar(5);
    traer.mockRejectedValue(new Error('sin archivo'));
    await leerPdfs([suyo]);
    expect(textosDe([suyo])).toEqual([]);
  });
});
