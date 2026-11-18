// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { armarPdf } from '../pdfDeEjemplo';
import { datosDeApunte, tipoDeBytes } from './apunte';
import { armarMateria, atenderPedidos, leerMateria, leerPedido, llevarMateria, materiaEnTexto, MAX_ITEMS, pedirArchivo } from './materiaMesa';
import { cerrarPestana, pestanas } from './mesa';
import { CADA_CAMBIOS, crearSesion, redesLocales } from './sesion';

const abiertas = [];
function armar(n) {
  const redes = redesLocales(n);
  const sesiones = redes.map((red, k) => crearSesion({ red, yo: { nombre: `Alumno ${k}`, color: '#123456' } }));
  abiertas.push(...sesiones);
  return sesiones;
}
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
afterEach(() => {
  abiertas.splice(0).forEach((s) => s.cerrar());
});

const pdf = () => new Blob([armarPdf([{ titulo: 'Guía 1', parrafos: ['Circuitos en serie.'] }])], { type: 'application/pdf' });
let traidos = 0;
const grupos = () => [
  {
    nombre: 'Unidad 1',
    items: [
      { tipo: 'archivo', nombre: 'Guía 1', archivo: 'guia-1.pdf', mime: 'application/pdf', direccion: 'https://campus.example/pluginfile.php/1/guia-1.pdf?token=SECRETO', traer: async () => { traidos += 1; return pdf(); } },
      { tipo: 'archivo', nombre: 'Programa', archivo: 'programa.docx', mime: 'application/msword', direccion: 'https://campus.example/pluginfile.php/2/programa.docx' },
      { tipo: 'enlace', nombre: 'Simulador', destino: 'https://phet.colorado.edu/es/?token=SECRETO' },
      { tipo: 'enlace', nombre: 'Malo', destino: 'javascript:alert(1)' },
      { tipo: 'texto', nombre: 'Bienvenidos', texto: 'Texto largo de la sección que no va a la mesa.' },
      { tipo: 'actividad', nombre: 'Entrega TP1', clase: 'Tareas', destino: 'https://campus.example/mod/assign/view.php?id=3' },
    ],
  },
  { nombre: 'Unidad 2', items: [{ tipo: 'archivo', nombre: 'Foto del pizarrón', archivo: 'pizarron.jpg', mime: 'image/jpeg', traer: async () => new Blob(['no es una foto']) }] },
];

describe('Materia en la mesa', () => {
  it('a la mesa van solo nombres y tipos, nunca el archivo ni su dirección del campus', () => {
    const { compartido, guardados } = armarMateria('Física II', grupos());
    const texto = JSON.stringify(compartido);
    expect(texto).not.toContain('pluginfile');
    expect(texto).not.toContain('SECRETO');
    expect(texto).not.toContain('Texto largo');
    expect(texto).not.toContain('javascript');
    const [u1] = compartido.secciones;
    expect(u1.items.map((i) => [i.nombre, i.clase, i.abre])).toEqual([
      ['Guía 1', 'PDF', true],
      ['Programa', 'DOCX', false],
      ['Simulador', 'Link', false],
      ['Malo', 'Link', false],
      ['Bienvenidos', 'Texto', false],
      ['Entrega TP1', 'Tareas', false],
    ]);
    expect(u1.items[2].url).toBe('https://phet.colorado.edu/es/');
    expect(u1.items[3].url).toBe('');
    expect([...guardados.keys()]).toEqual(['i0', 'i6']);
  });

  it('el otro pide un PDF, quien trajo la materia lo trae y se abre como apunte para todos', async () => {
    const [a, b] = armar(2);
    traidos = 0;
    const id = await llevarMateria(a, 'Física II', grupos());
    await esperar(CADA_CAMBIOS + 30);
    const db = b.doc.getMap(`h:${id}`);
    const m = leerMateria(db);
    expect(m).toMatchObject({ nombre: 'Física II', de: a.yo.id });
    expect(materiaEnTexto(m)).toContain('- Guía 1 (PDF)');

    expect(pedirArchivo(b.doc, db, b.yo, 'i0')).toBe(true);
    // Asking twice while it comes asks once.
    expect(pedirArchivo(b.doc, db, b.yo, 'i0')).toBe(false);
    await esperar(3 * CADA_CAMBIOS + 100);
    const pedido = leerPedido(db, 'i0');
    expect(pedido).toMatchObject({ estado: 'listo', por: b.yo.id });
    expect(traidos).toBe(1);
    const apunte = pestanas(b.doc).find((p) => p.id === pedido.pestana);
    expect(apunte).toMatchObject({ tipo: 'apunte', titulo: 'Guía 1' });
    const datos = datosDeApunte(b.doc.getMap(`h:${apunte.id}`));
    expect(datos.de).toBe(a.yo.id);
    expect(await tipoDeBytes(await b.archivos.pedir(datos.archivo, datos.de))).toBe('pdf');
  });

  it('lo que no es PDF ni foto, o no está entre lo que trajo, no se abre y se dice por qué', async () => {
    const [a, b] = armar(2);
    const id = await llevarMateria(a, 'Física II', grupos());
    await esperar(CADA_CAMBIOS + 30);
    const db = b.doc.getMap(`h:${id}`);
    pedirArchivo(b.doc, db, b.yo, 'i6');
    pedirArchivo(b.doc, db, b.yo, 'i1');
    await esperar(3 * CADA_CAMBIOS + 100);
    expect(leerPedido(db, 'i6')).toMatchObject({ estado: 'falla', error: 'Solo se abren en la mesa los PDF y las fotos.' });
    expect(leerPedido(db, 'i1')).toMatchObject({ estado: 'falla' });
    expect(pestanas(b.doc).filter((p) => p.tipo === 'apunte')).toEqual([]);
    // After a failure it can be asked again.
    expect(pedirArchivo(b.doc, db, b.yo, 'i6')).toBe(true);
  });

  it('cerrada la pestaña, quien la trajo deja de atender y suelta lo que tenía', async () => {
    const [a] = armar(1);
    const doc = a.doc;
    const { compartido, guardados } = armarMateria('Física II', grupos());
    doc.getMap('pestanas').set('t1', { tipo: 'materia', titulo: 'Física II', por: '', cuando: 1 });
    doc.getMap('h:t1').set('materia', compartido);
    let pedidos = 0;
    atenderPedidos(a, 't1', guardados, async () => {
      pedidos += 1;
      return pdf();
    });
    cerrarPestana(doc, 't1');
    expect(guardados.size).toBe(0);
    doc.getMap('h:t1').set('p:i0', { estado: 'pedido', por: 'r9', nombre: 'X' });
    await esperar(20);
    expect(pedidos).toBe(0);
  });

  it('lo que manda otro mal armado se descarta o se corta', () => {
    const d = new Y.Doc().getMap('h');
    d.set('materia', { nombre: 'x', secciones: [] });
    expect(leerMateria(d)).toBeNull();
    d.set('de', 'r0');
    const muchos = Array.from({ length: MAX_ITEMS + 50 }, (_, i) => ({ id: `i${i}`, nombre: `Cosa ${i}`, tipo: 'archivo', abre: true }));
    d.set('materia', {
      nombre: 'N'.repeat(900),
      secciones: [
        { nombre: 'A', items: [{ id: '../x', nombre: 'malo' }, { id: 'i1', nombre: 'link', tipo: 'enlace', url: 'javascript:alert(1)', abre: true }] },
        { nombre: 'B', items: muchos },
      ],
    });
    const m = leerMateria(d);
    expect(m.nombre).toHaveLength(160);
    expect(m.secciones[0].items).toEqual([{ id: 'i1', nombre: 'link', tipo: 'enlace', clase: '', url: '', abre: false }]);
    expect(m.secciones.flatMap((s) => s.items)).toHaveLength(MAX_ITEMS);
    d.set('p:i1', { estado: 'listo', pestana: '<img>', error: 'x' });
    expect(leerPedido(d, 'i1').pestana).toBe('');
    d.set('p:i2', { estado: 'hackeado' });
    expect(leerPedido(d, 'i2')).toBeNull();
  });
});
