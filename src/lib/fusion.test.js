import { Blob as BlobDeNode } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import { PDFDocument } from '@cantoo/pdf-lib';
import { clase, errorDePaginas, fusionar, leerPaginas, motivoDe, nombreDeFusion, paginasDe, revisarArchivo, sePuedeFusionar } from './fusion';

// El Blob de jsdom no tiene arrayBuffer. El del navegador y el de Node sí.
globalThis.Blob = BlobDeNode;

async function pdfDe(paginas) {
  const d = await PDFDocument.create();
  for (let i = 0; i < paginas; i++) d.addPage([200 + i, 300]);
  return new Blob([await d.save()], { type: 'application/pdf' });
}
// The smallest PNG there is: one pixel.
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));

describe('leerPaginas', () => {
  it('reads ranges, single pages and open ends', () => {
    expect(leerPaginas('')).toEqual({ rangos: null });
    expect(leerPaginas(' 3-10, 12 ,15- ')).toEqual({ rangos: [[3, 10], [12, 12], [15, Infinity]] });
  });
  it('says what is wrong', () => {
    expect(leerPaginas('a-3').error).toBeTruthy();
    expect(leerPaginas('0').error).toMatch(/empiezan en 1/);
    expect(leerPaginas('9-3').error).toMatch(/9-3/);
  });
});

describe('paginasDe', () => {
  it('takes all, or the asked ones that exist, counted from 0', () => {
    expect(paginasDe(null, 3)).toEqual([0, 1, 2]);
    expect(paginasDe([[2, 3], [5, Infinity]], 6)).toEqual([1, 2, 4, 5]);
    expect(paginasDe([[8, 9]], 3)).toEqual([]);
  });
});

describe('nombres y tipos', () => {
  it('names the file safely, always as a PDF', () => {
    expect(nombreDeFusion('Parcial 1: todo', 'Física')).toBe('Parcial 1 todo.pdf');
    expect(nombreDeFusion('', 'Física')).toBe('Física fusionados.pdf');
    expect(nombreDeFusion('resumen.PDF')).toBe('resumen.pdf');
  });
  it('only PDFs and photos can go in', () => {
    expect(sePuedeFusionar({ tipo: 'archivo', archivo: 'a.pdf' })).toBe(true);
    expect(sePuedeFusionar({ tipo: 'archivo', archivo: 'foto.JPG' })).toBe(true);
    expect(sePuedeFusionar({ tipo: 'archivo', archivo: 'tp.docx' })).toBe(false);
    expect(sePuedeFusionar({ tipo: 'enlace', archivo: 'a.pdf' })).toBe(false);
  });
  it('knows a file by its bytes', () => {
    expect(clase(new TextEncoder().encode('%PDF-1.7\n'))).toBe('pdf');
    expect(clase(PNG)).toBe('png');
    expect(clase(Uint8Array.of(0xff, 0xd8, 0xff, 0xe0))).toBe('jpg');
    expect(clase(new TextEncoder().encode('<html>'))).toBe('otra');
  });
});

describe('fusionar', () => {
  const archivos = {
    a: () => pdfDe(3),
    b: () => pdfDe(2),
    foto: async () => new Blob([PNG], { type: 'image/png' }),
    cae: async () => { throw new Error('red'); },
    roto: async () => new Blob(['%PDF-1.4 nada']),
  };
  const traer = (item) => archivos[item.id]();

  it('joins in order, with the asked pages and a bookmark per file', async () => {
    const r = await fusionar([
      { item: { id: 'b', nombre: 'Segundo' }, paginas: '' },
      { item: { id: 'foto', nombre: 'Pizarrón' }, paginas: '' },
      { item: { id: 'a', nombre: 'Primero' }, paginas: '2-' },
    ], { traer, titulo: 'Todo' });
    expect(r.fallaron).toEqual([]);
    expect(r.paginas).toBe(5);
    const d = await PDFDocument.load(new Uint8Array(await r.blob.arrayBuffer()));
    // The pages of «a» from the second one on: widths 201 and 202.
    expect(d.getPages().map((p) => Math.round(p.getWidth()))).toEqual([200, 201, 595, 201, 202]);
    expect(d.getTitle()).toBe('Todo');
    expect(d.catalog.toString()).toContain('/Outlines');
  });

  it('a file that fails does not stop the rest, and says why', async () => {
    const r = await fusionar([
      { item: { id: 'cae', nombre: 'Lejos' }, paginas: '' },
      { item: { id: 'roto', nombre: 'Roto' }, paginas: '' },
      { item: { id: 'a', nombre: 'Corto' }, paginas: '9' },
      { item: { id: 'b', nombre: 'Bien' }, paginas: '' },
    ], { traer });
    expect(r.paginas).toBe(2);
    expect(r.fallaron).toEqual([
      { nombre: 'Lejos', motivo: 'no se pudo bajar' },
      { nombre: 'Roto', motivo: 'no se pudo abrir' },
      { nombre: 'Corto', motivo: 'no tiene esas páginas' },
    ]);
  });

  it('nothing in, no file', async () => {
    const r = await fusionar([{ item: { id: 'cae', nombre: 'Lejos' }, paginas: '' }], { traer });
    expect(r.blob).toBeNull();
  });

  it('stops when cancelled', async () => {
    const control = new AbortController();
    const r = await fusionar([{ item: { id: 'a' }, paginas: '' }, { item: { id: 'b' }, paginas: '' }], {
      traer,
      senal: control.signal,
      alProgreso: ({ hechos }) => { if (hechos === 1) control.abort(); },
    });
    expect(r.cancelado).toBe(true);
  });
});

describe('antes de fusionar', () => {
  it('counts the pages of a chosen file, or says why it cannot go', async () => {
    const r = await revisarArchivo({ archivo: 'a.pdf' }, { traer: () => pdfDe(4) });
    expect([r.tipo, r.paginas]).toEqual(['pdf', 4]);
    expect((await revisarArchivo({ archivo: 'f.png' }, { traer: async () => new Blob([PNG]) })).tipo).toBe('imagen');
    const motivo = (p) => p.then(() => '', motivoDe);
    expect(await motivo(revisarArchivo({ archivo: 'a.pdf' }, { traer: async () => new Blob(['Archivo de ejemplo']) }))).toBe('no se pudo abrir');
    expect(await motivo(revisarArchivo({ archivo: 'a.pdf' }, { traer: async () => { throw new Error('red'); } }))).toBe('no se pudo bajar');
  });

  it('marks pages past the end as soon as the total is known', () => {
    expect(errorDePaginas('2-3', 12)).toBe('');
    expect(errorDePaginas('5-', 12)).toBe('');
    expect(errorDePaginas('10-20', 12)).toBe('Llega hasta la página 12.');
    expect(errorDePaginas('2', 1)).toBe('Llega hasta la página 1.');
    expect(errorDePaginas('20', undefined)).toBe('');
    expect(errorDePaginas('9-3', 12)).toMatch(/9-3/);
  });

  it('uses the file already brought instead of asking again', async () => {
    let pedidos = 0;
    const blob = await pdfDe(2);
    const r = await fusionar([{ item: { nombre: 'x' }, paginas: '', blob }], { traer: () => { pedidos++; return blob; } });
    expect([r.paginas, pedidos]).toEqual([2, 0]);
  });
});
