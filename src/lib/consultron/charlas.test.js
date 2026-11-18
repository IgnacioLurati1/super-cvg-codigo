import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SANTO as SANTO_RESUMEN } from '../santoResumen';
import { SANTO, TOPE_CHARLAS, borrarCharla, borrarCharlas, charlaLeida, entradaParaGuardar, guardarCharla, leerCharla, listarCharlas } from './charlas';

// A database of the browser, enough for charlas.js: a store with get, put, delete and getAll by a range of keys.
function baseFalsa() {
  const bases = new Map();
  const copia = (v) => (v === undefined ? undefined : structuredClone(v));
  const falsa = {
    open: (nombre) => {
      const pedido = {};
      queueMicrotask(() => {
        let datos = bases.get(nombre);
        const nueva = !datos;
        if (nueva) bases.set(nombre, (datos = { almacenes: new Map() }));
        const db = {
          objectStoreNames: { contains: (n) => datos.almacenes.has(n) },
          createObjectStore: (n) => datos.almacenes.set(n, new Map()),
          close: () => {},
          transaction: (n) => transaccion(datos, n),
        };
        pedido.result = db;
        if (nueva) pedido.onupgradeneeded?.();
        pedido.onsuccess?.();
      });
      return pedido;
    },
    deleteDatabase: (nombre) => {
      const pedido = {};
      queueMicrotask(() => {
        bases.delete(nombre);
        pedido.onsuccess?.();
      });
      return pedido;
    },
    existe: (nombre) => bases.has(nombre),
    todo: () => JSON.stringify([...bases.values()].map((b) => [...b.almacenes.values()].map((m) => [...m.entries()]))),
  };
  function transaccion(datos, nombre) {
    const tx = {};
    let pendientes = 0;
    let terminada = false;
    const revisar = () => {
      if (pendientes || terminada) return;
      terminada = true;
      queueMicrotask(() => tx.oncomplete?.());
    };
    const hacer = (f) => {
      const pedido = {};
      pendientes += 1;
      queueMicrotask(() => {
        pedido.result = f();
        pendientes -= 1;
        pedido.onsuccess?.();
        revisar();
      });
      return pedido;
    };
    tx.objectStore = () => {
      const m = datos.almacenes.get(nombre);
      return {
        get: (k) => hacer(() => copia(m.get(k))),
        put: (v, k) => hacer(() => m.set(k, copia(v)) && k),
        delete: (k) => hacer(() => {
          m.delete(k);
        }),
        getAll: (r) => hacer(() => [...m.entries()].filter(([k]) => k >= r.lower && k <= r.upper).map(([, v]) => copia(v))),
      };
    };
    queueMicrotask(revisar);
    return tx;
  }
  return falsa;
}

const entrada = (id, extra = {}) => ({ id, pregunta: `Pregunta ${id}`, estado: 'listo', texto: `Respuesta ${id} [1]`, donde: '', elegidos: [], adjuntos: [], ...extra });

let falsa;
beforeEach(async () => {
  await borrarCharlas();
  falsa = baseFalsa();
  vi.stubGlobal('indexedDB', falsa);
  vi.stubGlobal('IDBKeyRange', { bound: (lower, upper) => ({ lower, upper }) });
});
afterEach(() => vi.unstubAllGlobals());

describe('lo que se guarda de una respuesta', () => {
  it('de una fuente, solo lo que la nombra y el texto del trozo: nada más del campus', () => {
    const item = { id: 7, url: 'https://frro.cvg.utn.edu.ar/pluginfile.php/1/a.pdf', token: 'secreto', nombre: 'Apunte' };
    const g = entradaParaGuardar(entrada(1, {
      elegidos: [{ trozo: { doc: 'pdf:7', pagina: 2, texto: 'El monitor protege.', fuente: { tipo: 'pdf', nombre: 'Apunte', materia: 'Sistemas Operativos', item } }, puntaje: 3, cubre: 2 }],
    }));
    expect(g.elegidos).toEqual([{ trozo: { doc: 'pdf:7', pagina: 2, texto: 'El monitor protege.', fuente: { tipo: 'pdf', nombre: 'Apunte', materia: 'Sistemas Operativos', guardada: true } } }]);
    expect(JSON.stringify(g)).not.toMatch(/pluginfile|secreto/);
  });

  it('guarda si contestó Gemini o si tardó y contestó la compu, nada más de eso', () => {
    expect(entradaParaGuardar({ id: 1, pregunta: 'a', estado: 'listo', texto: 'b', nube: 'resumenes' }).nube).toBe('resumenes');
    expect(entradaParaGuardar({ id: 1, pregunta: 'a', estado: 'listo', texto: 'b', nube: 'otra' }).nube).toBeUndefined();
    expect(entradaParaGuardar({ id: 1, pregunta: 'a', estado: 'listo', texto: 'b', nubeFallo: 'si' }).nubeFallo).toBe(true);
  });

  it('de lo adjuntado, solo el nombre', () => {
    const g = entradaParaGuardar(entrada(1, {
      adjuntos: [{ id: 3, nombre: 'foto.png', clase: 'foto', url: 'blob:http://x/1', texto: 'lo que dice' }],
      elegidos: [{ trozo: { doc: 'adjunto:3', pagina: 1, texto: 'lo que dice la foto', fuente: { tipo: 'adjunto', clase: 'foto', nombre: 'foto.png', url: 'blob:http://x/1' } } }],
    }));
    expect(g.adjuntos).toEqual([{ nombre: 'foto.png', clase: 'foto' }]);
    expect(g.elegidos[0].trozo).toEqual({ doc: 'adjunto:3', pagina: 1, texto: '', fuente: { tipo: 'adjunto', clase: 'foto', nombre: 'foto.png', guardada: true } });
  });

  it('una página de El Santo Resumen guarda su link, y uno ajeno no', () => {
    expect(SANTO).toBe(SANTO_RESUMEN);
    const oficial = (url) => entradaParaGuardar(entrada(1, { elegidos: [{ trozo: { doc: 'o', pagina: 1, texto: 't', fuente: { tipo: 'oficial', nombre: 'Colas', materia: 'Sim', url } } }] })).elegidos[0].trozo.fuente.url;
    expect(oficial(`${SANTO}/simulacion/colas.html#mm1`)).toBe(`${SANTO}/simulacion/colas.html#mm1`);
    expect(oficial('https://otro.com/x')).toBeUndefined();
    expect(oficial('javascript:alert(1)')).toBeUndefined();
  });

  it('de Classroom, el título y el link de la publicación: nunca lo que dice', () => {
    const fuente = { tipo: 'classroom', clase: 'Tarea', nombre: 'TP 1', materia: 'Física II', url: 'https://classroom.google.com/c/1/a/911' };
    const g = entradaParaGuardar(entrada(1, {
      elegidos: [
        { trozo: { doc: 'classroom:222:t911', pagina: 1, texto: 'Tarea «TP 1». Resolver la guía de óptica.', fuente } },
        { trozo: { doc: 'classroom:222:a1', pagina: 1, texto: 'Mensaje', fuente: { ...fuente, clase: 'Mensaje', url: 'https://otro.com/classroom.google.com/' } } },
        { trozo: { doc: 'cursada:classroom', pagina: 1, texto: 'Lo que tiene sin entregar en Classroom: tarea «TP 1».', fuente: { tipo: 'guia', nombre: 'Tus pendientes de Classroom', a: '/' } } },
      ],
    }));
    expect(g.elegidos[0].trozo).toEqual({ doc: 'classroom:222:t911', pagina: 1, texto: '', fuente: { tipo: 'classroom', clase: 'Tarea', nombre: 'TP 1', materia: 'Física II', url: 'https://classroom.google.com/c/1/a/911', guardada: true } });
    expect(g.elegidos[1].trozo.fuente.url).toBeUndefined();
    expect(g.elegidos[2].trozo).toMatchObject({ texto: '', fuente: { tipo: 'guia', a: '/' } });
    expect(JSON.stringify(g.elegidos)).not.toMatch(/óptica|sin entregar/);
  });

  it('de lo que el alumno sumó por su cuenta, el nombre, dónde está y el texto del trozo: nunca el archivo', () => {
    const item = { archivoId: 'abcd1234', traer: () => null };
    const g = entradaParaGuardar(entrada(1, {
      elegidos: [
        { trozo: { doc: 'aabcd1234', pagina: 1, texto: 'Ley de Ohm', fuente: { tipo: 'propia', clase: 'foto', nombre: 'Pizarrón', materia: 'Robótica', item } } },
        { trozo: { doc: 'nota:m8', pagina: 1, texto: 'Llevar la guía 4.', fuente: { tipo: 'propia', clase: 'nota', nombre: 'Tu nota', materia: 'Redes', a: '/materias/8' } } },
      ],
    }));
    expect(g.elegidos[0].trozo).toEqual({ doc: 'aabcd1234', pagina: 1, texto: 'Ley de Ohm', fuente: { tipo: 'propia', clase: 'foto', nombre: 'Pizarrón', materia: 'Robótica', guardada: true } });
    expect(g.elegidos[1].trozo.fuente).toEqual({ tipo: 'propia', clase: 'nota', nombre: 'Tu nota', materia: 'Redes', a: '/materias/8', guardada: true });
  });

  it('una respuesta a medio escribir queda frenada, y un cálculo con sus datos', () => {
    expect(entradaParaGuardar(entrada(1, { estado: 'escribiendo' })).estado).toBe('frenado');
    const calculo = { slug: 'subred', nombre: 'Subredes', clave: 'calc:subred', filas: [['La red', '10.0.0.0/16']], datos: { red: '10.0.0.0/16', cuanto: 6 } };
    expect(entradaParaGuardar(entrada(1, { estado: 'calculo', calculo })).calculo).toEqual(calculo);
    expect(entradaParaGuardar(entrada(1, { estado: 'calculo' })).estado).toBe('frenado');
  });

  it('una pregunta de práctica, sin lo que tarda', () => {
    const practica = { materia: '1', nombre: 'Redes', tema: 'subredes', fase: 'corrigiendo', pregunta: '¿Qué es una máscara?', ideas: ['Separa red y host'], respuesta: 'Divide la IP' };
    expect(entradaParaGuardar(entrada(1, { estado: 'leyendo', practica })).practica).toMatchObject({ fase: 'pregunta', respuesta: 'Divide la IP' });
    const corregida = { ...practica, fase: 'corregida', resultado: { ideas: ['si', 'cualquiera'], error: '' } };
    expect(entradaParaGuardar(entrada(1, { estado: 'practica', practica: corregida })).practica.resultado).toEqual({ ideas: ['si', 'no'], error: '' });
  });

  it('lo que vuelve del disco se revisa otra vez', () => {
    expect(charlaLeida(null)).toBeNull();
    expect(charlaLeida({ id: 'x', entradas: [] })).toBeNull();
    const leida = charlaLeida({ id: 5, creada: 5, cambiada: 6, entradas: [entrada(1, { texto: 42, estado: 'raro' }), 'basura'] });
    expect(leida.entradas).toHaveLength(1);
    expect(leida.entradas[0]).toMatchObject({ texto: '', estado: 'frenado' });
  });
});

describe('las charlas de cada alumno', () => {
  it('se guardan, se listan con su primera pregunta, se abren y se borran', async () => {
    expect(await guardarCharla(5, { id: 100, creada: 100, entradas: [entrada(1), entrada(2)] })).toBe(true);
    await guardarCharla(5, { id: 200, creada: 200, entradas: [entrada(3)] });
    await guardarCharla(6, { id: 300, creada: 300, entradas: [entrada(9)] });
    const lista = await listarCharlas(5);
    expect(lista.map((c) => [c.id, c.primera, c.cuantas])).toEqual([[200, 'Pregunta 3', 1], [100, 'Pregunta 1', 2]]);
    expect((await leerCharla(5, 100)).entradas.map((e) => e.pregunta)).toEqual(['Pregunta 1', 'Pregunta 2']);
    // Another student's isn't there.
    expect(await leerCharla(5, 300)).toBeNull();
    await borrarCharla(5, 100);
    expect((await listarCharlas(5)).map((c) => c.id)).toEqual([200]);
    expect((await listarCharlas(6)).map((c) => c.id)).toEqual([300]);
  });

  it('una charla vacía no se guarda, ni sin alumno', async () => {
    expect(await guardarCharla(5, { id: 1, entradas: [] })).toBe(false);
    expect(await guardarCharla(null, { id: 1, entradas: [entrada(1)] })).toBe(false);
    expect(await listarCharlas(null)).toEqual([]);
  });

  it('con muchas, se va la que hace más que no se toca', async () => {
    for (let i = 1; i <= TOPE_CHARLAS + 2; i += 1) {
      vi.spyOn(Date, 'now').mockReturnValue(i * 1000);
      await guardarCharla(5, { id: i, creada: i, entradas: [entrada(i)] });
    }
    vi.restoreAllMocks();
    const ids = (await listarCharlas(5)).map((c) => c.id);
    expect(ids).toHaveLength(TOPE_CHARLAS);
    expect(ids).not.toContain(1);
    expect(ids).not.toContain(2);
  });

  it('Salir las borra a todas, y lo que se estaba guardando no vuelve', async () => {
    await guardarCharla(5, { id: 1, entradas: [entrada(1)] });
    const tarde = guardarCharla(5, { id: 2, entradas: [entrada(2)] });
    await borrarCharlas();
    await tarde;
    expect(await listarCharlas(5)).toEqual([]);
    expect(falsa.todo()).not.toMatch(/Respuesta 1/);
  });

  it('sin base del navegador, nada falla', async () => {
    vi.stubGlobal('indexedDB', undefined);
    expect(await guardarCharla(5, { id: 1, entradas: [entrada(1)] })).toBe(false);
    expect(await listarCharlas(5)).toEqual([]);
    expect(await leerCharla(5, 1)).toBeNull();
    await expect(borrarCharlas()).resolves.toBeUndefined();
  });
});
