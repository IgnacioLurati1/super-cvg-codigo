import { describe, expect, it } from 'vitest';
import { buscarPiezas, delSanto, ordenarPdfs } from './fuentes';
import { palabras } from './fragmentos';

const ID1 = '0b6f2a8e-1c11-4d0a-9a51-2f6a8b1c0d01';
const ID2 = '0b6f2a8e-1c11-4d0a-9a51-2f6a8b1c0d02';
const ID3 = '0b6f2a8e-1c11-4d0a-9a51-2f6a8b1c0d03';

describe('El Santo Resumen de las materias', () => {
  const cargadores = (pedidos) => ({
    indice: async () => [{ slug: 'legislacion', entradas: [{ pagina: 'parcial-2.html', ancla: 'propiedad', titulo: 'Propiedad intelectual', texto: 'La ley 11.723 protege las obras.' }] }],
    banco: async (s) => {
      pedidos.push(['banco', s]);
      return [{ id: ID1, titulo: 'Parcial 2 completo', formato: 'html' }, { id: ID2, titulo: 'Sin texto todavía', formato: 'pdf' }];
    },
    textos: async (s) => {
      pedidos.push(['textos', s]);
      return [{ id: ID1, texto: 'Derecho de autor: dura toda la vida del autor y 70 años más.' }, { id: ID3, texto: 'De un resumen que ya no está en el banco.' }];
    },
  });

  it('cada resumen del banco con su texto y cada tema oficial, pidiendo una vez por materia', async () => {
    const pedidos = [];
    const docs = await delSanto([{ nombre: 'Legislación' }, { nombre: 'Legislación 2026' }, { nombre: 'Materia de ejemplo' }], cargadores(pedidos));
    expect(pedidos).toEqual([['banco', 'legislacion'], ['textos', 'legislacion']]);
    expect(docs.map((d) => d.fuente.tipo)).toEqual(['resumen', 'oficial']);
    expect(docs[0]).toMatchObject({ doc: `resumen:${ID1}`, fuente: { nombre: 'Parcial 2 completo', materia: 'Legislación', resumen: { id: ID1 } } });
    expect(docs[0].paginas).toEqual(['Derecho de autor: dura toda la vida del autor y 70 años más.']);
    expect(docs[1].fuente).toMatchObject({ nombre: 'Propiedad intelectual', url: 'https://lutastudios.com/utn/legislacion/parcial-2.html#propiedad' });
  });

  it('sin materias de El Santo Resumen no pide nada, y si falla sigue sin él', async () => {
    const pedidos = [];
    expect(await delSanto([{ nombre: 'Materia de ejemplo' }], cargadores(pedidos))).toEqual([]);
    expect(pedidos).toEqual([]);
    const falla = async () => {
      throw new Error('no responde');
    };
    expect(await delSanto([{ nombre: 'Legislación' }], { indice: falla, banco: falla, textos: falla })).toEqual([]);
  });
});

describe('los PDF, de a pocos', () => {
  const pdf = (n, nombre, seccion = '') => ({ materiaId: 1, clave: String(n), nombre, seccion, materia: 'Sistemas Operativos' });
  const pdfs = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => pdf(n, `Unidad ${n}`, 'Teoría')).concat(pdf(9, 'Monitores y semáforos'));
  const relleno = 'Este apunte habla de otras cosas de la materia, con ejemplos largos para leer.';
  const textoDe = (i) => (i.clave === '9' ? 'Un monitor es una construcción de alto nivel para sincronizar procesos.' : `${relleno} Hoja ${i.clave}.`);
  const lector = () => {
    const leidos = new Set();
    const lotes = [];
    return {
      lotes,
      leer: async (lote) => {
        lotes.push(lote.map((i) => i.clave));
        for (const i of lote) leidos.add(i);
      },
      leidos: (ps) => ps.filter((i) => leidos.has(i)).map((i) => ({ item: i, paginas: [textoDe(i)] })),
    };
  };

  it('primero los que se llaman como la pregunta', () => {
    expect(ordenarPdfs(pdfs, palabras('¿Qué es un monitor?')).map((i) => i.clave)).toEqual(['9', '1', '2', '3', '4', '5', '6', '7', '8']);
  });

  it('para apenas encuentra la respuesta', async () => {
    const l = lector();
    const elegidos = await buscarPiezas('¿Qué es un monitor?', { pdfs, ...l });
    expect(l.lotes).toEqual([['9', '1', '2', '3']]);
    expect(elegidos[0].trozo.fuente).toMatchObject({ tipo: 'pdf', nombre: 'Monitores y semáforos', materia: 'Sistemas Operativos' });
    expect(elegidos[0].trozo.pagina).toBe(1);
  });

  it('con la respuesta en El Santo Resumen no baja ningún PDF', async () => {
    const l = lector();
    const santo = [{ doc: `resumen:${ID1}`, fuente: { tipo: 'resumen', nombre: 'Final', materia: 'Sistemas Operativos' }, paginas: ['Un monitor junta los datos compartidos y sus procedimientos.'] }];
    const elegidos = await buscarPiezas('¿Qué es un monitor?', { santo, pdfs, ...l });
    expect(l.lotes).toEqual([]);
    expect(elegidos[0].trozo.fuente.tipo).toBe('resumen');
  });

  it('si no está, los lee todos de a cuatro y no repite los que ya leyó', async () => {
    const l = lector();
    expect(await buscarPiezas('¿Qué es una integral doble?', { pdfs, ...l })).toEqual([]);
    expect(l.lotes).toEqual([['1', '2', '3', '4'], ['5', '6', '7', '8'], ['9']]);
    await buscarPiezas('¿Qué es una derivada?', { pdfs, ...l });
    expect(l.lotes).toHaveLength(3);
  });

  it('frenado, deja de leer', async () => {
    const l = lector();
    const corte = new AbortController();
    const leer = async (lote) => {
      await l.leer(lote);
      corte.abort();
    };
    await buscarPiezas('¿Qué es una integral doble?', { pdfs, leer, leidos: l.leidos, senal: corte.signal });
    expect(l.lotes).toHaveLength(1);
  });

  it('lo leído que no es un PDF trae su fuente y sus trozos', async () => {
    const foto = { archivoId: 'foto0001', nombre: 'Pizarrón', materia: 'Robótica' };
    const fuente = { tipo: 'propia', clase: 'foto', nombre: 'Pizarrón', materia: 'Robótica', item: foto };
    const elegidos = await buscarPiezas('¿Qué dice la ley de Ohm?', {
      pdfs: [foto],
      leer: async () => {},
      leidos: () => [{ item: foto, paginas: ['x'], fuente, trozos: [{ doc: 'afoto0001', pagina: 1, texto: 'Ley de Ohm: V = I por R.' }] }],
    });
    expect(elegidos[0].trozo).toMatchObject({ doc: 'afoto0001', texto: 'Ley de Ohm: V = I por R.', fuente });
  });

  it('sin palabras para buscar no lee nada', async () => {
    const l = lector();
    expect(await buscarPiezas('¿Qué es?', { pdfs, ...l })).toEqual([]);
    expect(l.lotes).toEqual([]);
  });
});
