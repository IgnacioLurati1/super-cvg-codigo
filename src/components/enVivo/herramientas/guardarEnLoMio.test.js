import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { leerFormato } from '../../../lib/formato';
import { MAX_GUARDAR, paraGuardarDocumento } from '../../../lib/enVivo/documento';
import { agregar, leerElementos } from '../../../lib/enVivo/pizarra';
import { MAX_LADO } from './lienzo';
import { pizarraEnPng } from './pizarraDibujo';
import { flujoEnPng, plano as planoFlujo } from './flujoDibujo';
import { agregarNodo as agregarFlujo, conectar as conectarFlujo, leerFlujo } from '../../../lib/enVivo/flujo';

// «Guardar en lo mío» of the Documento, the Pizarra and the Diagrama: what each one hands to the table.

const parrafo = (...content) => ({ type: 'paragraph', content });
const texto = (t, ...marks) => ({ type: 'text', text: t, ...(marks.length ? { marks } : {}) });
const titulo = (t, level = 1) => ({ type: 'heading', attrs: { level }, content: [texto(t)] });
const lista = (tipo, ...items) => ({ type: tipo, content: items.map((t) => ({ type: 'listItem', content: [parrafo(texto(t))] })) });

describe('Documento: se guarda como texto con el formato del sitio', () => {
  const doc = {
    type: 'doc',
    content: [
      titulo('Parcial 1'),
      parrafo(texto('Ver '), texto('la guía', { type: 'bold' }), texto(' y '), texto('el apunte', { type: 'link', attrs: { href: 'https://campus.frro.utn.edu.ar/x' } }), texto('.')),
      titulo('Temas', 2),
      lista('bulletList', 'Laplace', 'Bode'),
      lista('orderedList', 'Leer', 'Resolver'),
      { type: 'codeBlock', content: [texto('# un comentario\n    x = 1')] },
      parrafo(texto('Mal link', { type: 'link', attrs: { href: 'javascript:alert(1)' } })),
    ],
  };

  it('el nombre es el de la pestaña, o el primer título si la pestaña sigue llamándose Documento', () => {
    expect(paraGuardarDocumento(doc, 'Resumen de Control').nombre).toBe('Resumen de Control');
    const conTitulo = paraGuardarDocumento(doc, 'Documento');
    expect(conTitulo.nombre).toBe('Parcial 1');
    expect(conTitulo.texto.startsWith('Ver ')).toBe(true);
    expect(paraGuardarDocumento({ type: 'doc', content: [parrafo(texto('hola'))] }, undefined)).toEqual({ nombre: 'Documento', texto: 'hola' });
  });

  it('formato.js lo lee con títulos, listas, negrita y links; un comentario de código no se vuelve título', () => {
    const { texto: t } = paraGuardarDocumento(doc, 'Resumen');
    const bloques = leerFormato(t);
    expect(bloques.filter((b) => b.tipo === 'titulo').map((b) => b.partes[0].texto)).toEqual(['Parcial 1', 'Temas']);
    expect(bloques.find((b) => b.tipo === 'lista').items.map((i) => i[0].texto)).toEqual(['Laplace', 'Bode']);
    const partes = bloques.flatMap((b) => b.lineas ?? []).flat();
    expect(partes).toContainEqual({ tipo: 'negrita', texto: 'la guía' });
    expect(partes).toContainEqual({ tipo: 'enlace', texto: 'https://campus.frro.utn.edu.ar/x', url: 'https://campus.frro.utn.edu.ar/x' });
    expect(t).toContain('1. Leer\n2. Resolver');
    expect(partes.map((p) => p.texto)).toContain('# un comentario');
    expect(t).not.toContain('javascript:');
  });

  it('un documento largo se corta en una línea, dentro de lo que entra en un bloque', () => {
    const largo = { type: 'doc', content: Array.from({ length: 2000 }, (_, i) => parrafo(texto(`Renglón número ${i} del apunte.`))) };
    const { texto: t } = paraGuardarDocumento(largo, 'Largo');
    expect(t.length).toBeLessThanOrEqual(MAX_GUARDAR);
    expect(t.endsWith('del apunte.\n…')).toBe(true);
  });
});

// jsdom has no canvas: a pretend one that keeps what is drawn and hands back a PNG.
let dibujado;
let tamanos;
beforeEach(() => {
  dibujado = [];
  tamanos = [];
  globalThis.Path2D ??= class {
    constructor(d) {
      this.d = d;
    }
  };
  const ctx = new Proxy({ measureText: (t) => ({ width: String(t).length * 9 }) }, {
    get: (o, k) => (k in o ? o[k] : (...args) => dibujado.push([k, ...args])),
    set: () => true,
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function toBlob(listo, tipo) {
    tamanos.push([this.width, this.height]);
    listo(new Blob(['png'], { type: tipo }));
  });
});
afterEach(() => vi.restoreAllMocks());

const datosNuevos = () => new Y.Doc().getMap('datos');

describe('Pizarra: se guarda como PNG recortado a lo dibujado', () => {
  it('devuelve { nombre, archivo } con una imagen PNG que contiene cada elemento', async () => {
    const datos = datosNuevos();
    agregar(datos, { t: 'trazo', c: 0, g: 1, p: [0, 0, 40, 30, 80, 10] });
    agregar(datos, { t: 'rect', c: 1, g: 0, x1: 100, y1: 100, x2: 300, y2: 200 });
    agregar(datos, { t: 'texto', c: 2, tam: 1, x: 50, y: 300, s: 'Hola\nmesa' });
    const r = await pizarraEnPng(leerElementos(datos), document.body, 'Pizarra.png');
    expect(r.nombre).toBe('Pizarra.png');
    expect(r.archivo).toBeInstanceOf(Blob);
    expect(r.archivo.type).toBe('image/png');
    const [ancho, alto] = tamanos.at(-1);
    expect(ancho).toBeGreaterThan(300 * 2 - 1);
    expect(alto).toBeGreaterThan(300 * 2 - 1);
    expect(dibujado.filter(([k]) => k === 'fillText').map((d) => d[1])).toEqual(['Hola', 'mesa']);
    expect(dibujado.some(([k, a]) => k === 'fill' && a instanceof Path2D)).toBe(true);
  });

  it('una pizarra enorme no pasa de MAX_LADO por lado; una vacía no da imagen', async () => {
    const datos = datosNuevos();
    agregar(datos, { t: 'linea', c: 0, g: 0, x1: -50000, y1: 0, x2: 50000, y2: 10 });
    await pizarraEnPng(leerElementos(datos), document.body, 'Grande.png');
    const [ancho, alto] = tamanos.at(-1);
    expect(ancho).toBeLessThanOrEqual(MAX_LADO);
    expect(alto).toBeGreaterThan(0);
    expect(await pizarraEnPng([], document.body, 'Vacía.png')).toBeNull();
  });
});

describe('Diagrama de flujo: se guarda como PNG de las formas y las flechas', () => {
  it('devuelve { nombre, archivo } con una imagen PNG; los textos largos se parten en renglones', async () => {
    const datos = datosNuevos();
    const a = agregarFlujo(datos, 'terminal', { x: 0, y: 0, txt: 'Inicio' });
    const b = agregarFlujo(datos, 'decision', { x: 0, y: 100, txt: '¿n > 0?' });
    const c = agregarFlujo(datos, 'proceso', { x: 0, y: 260, txt: 'suma = suma + n y además una explicación larga' });
    conectarFlujo(datos, { de: a, sd: 'b', a: b, ad: 't' });
    conectarFlujo(datos, { de: b, sd: 'b', a: c, ad: 't' });
    conectarFlujo(datos, { de: c, sd: 'l', a: b, ad: 'l' });
    const fl = leerFlujo(datos);
    const p = planoFlujo(fl, new Map());
    expect(p.flechas.find(({ f }) => f.de === b).etiqueta).toMatchObject({ derecha: false });
    const r = await flujoEnPng(fl, new Map(), document.body, 'Suma.png');
    expect(r.nombre).toBe('Suma.png');
    expect(r.archivo).toBeInstanceOf(Blob);
    expect(r.archivo.type).toBe('image/png');
    const textos = dibujado.filter(([k]) => k === 'fillText').map((d) => d[1]);
    expect(textos).toEqual(expect.arrayContaining(['Inicio', '¿n > 0?', 'Sí']));
    expect(textos.filter((t) => /suma|explicación/.test(t)).length).toBeGreaterThan(1);
    expect(await flujoEnPng({ nodos: [], flechas: [] }, new Map(), document.body, 'Vacío.png')).toBeNull();
  });
});
