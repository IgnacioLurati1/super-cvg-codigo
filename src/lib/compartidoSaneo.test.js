import { File as FileDeNode } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import { COMPARTIDO, enlaceCompartido, nombreCompartido, revisarCompartido, tipoPorBytes } from './compartidoSaneo';

const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37];
const JPG = [0xff, 0xd8, 0xff, 0xe0, 0, 0x10];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0];
const WEBP = [0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50];
// The File of jsdom has no arrayBuffer. The browser's and Node's do.
const archivo = (bytes, nombre, tipo = '') => new FileDeNode([new Uint8Array(bytes)], nombre, { type: tipo });

// A FormData whose files say their size: the caps are checked by size, without building 25 MB.
function formDe({ titulo = '', texto = '', enlace = '', archivos = [] } = {}) {
  const f = new FormData();
  f.set('titulo', titulo);
  f.set('texto', texto);
  f.set('enlace', enlace);
  return { get: (k) => f.get(k), getAll: (k) => (k === 'archivos' ? archivos : f.getAll(k)) };
}

describe('what another app shares', () => {
  it('tells a PDF and the photos by their first bytes, nothing else', () => {
    expect(tipoPorBytes(PDF)).toBe('pdf');
    expect(tipoPorBytes(JPG)).toBe('jpg');
    expect(tipoPorBytes(PNG)).toBe('png');
    expect(tipoPorBytes(WEBP)).toBe('webp');
    expect(tipoPorBytes([0x4d, 0x5a, 0x90, 0])).toBeNull();
    expect(tipoPorBytes([0x3c, 0x68, 0x74, 0x6d, 0x6c])).toBeNull();
    expect(tipoPorBytes([])).toBeNull();
  });

  it('rebuilds the name: no folders, no extensions of its own, the one of what it is', () => {
    expect(nombreCompartido('Parcial 1.pdf', 'pdf')).toBe('Parcial 1.pdf');
    expect(nombreCompartido('../../virus.pdf.exe', 'pdf')).toBe('virus.pdf');
    expect(nombreCompartido('C:\\fotos\\IMG_2031.JPEG', 'jpg')).toBe('IMG_2031.jpg');
    expect(nombreCompartido('Tema 2.1', 'pdf')).toBe('Tema 2.1.pdf');
    expect(nombreCompartido('a\u202Egnp.exe', 'png')).toBe('a gnp.png');
    expect(nombreCompartido('', 'jpg')).toBe('Foto compartida.jpg');
    expect(nombreCompartido('...', 'pdf')).toBe('Documento compartido.pdf');
    expect(nombreCompartido('x'.repeat(500), 'pdf')).toHaveLength(COMPARTIDO.nombre + 4);
  });

  it('takes the first http(s) address, from the url or from the text', () => {
    expect(enlaceCompartido('', 'Mirá esto https://lutastudios.com/utn/ver?id=3).')).toBe('https://lutastudios.com/utn/ver?id=3');
    expect(enlaceCompartido('https://a.com/x', 'https://b.com')).toBe('https://a.com/x');
    expect(enlaceCompartido('', 'javascript:alert(1)')).toBeNull();
    expect(enlaceCompartido('', 'sin link')).toBeNull();
    expect(enlaceCompartido('', `https://a.com/${'x'.repeat(COMPARTIDO.url)}`)).toBeNull();
  });

  it('lets in only PDFs and photos, within the caps, and says why the rest stayed out', async () => {
    const grande = archivo(PDF, 'grande.pdf', 'application/pdf');
    Object.defineProperty(grande, 'size', { value: COMPARTIDO.archivo + 1 });
    const r = await revisarCompartido(
      formDe({
        archivos: [archivo(PDF, 'TP.pdf', 'application/pdf'), archivo([0x4d, 0x5a, 0x90, 0], 'apunte.pdf', 'application/pdf'), grande, archivo([], 'vacio.jpg', 'image/jpeg'), archivo(JPG, 'foto', 'image/jpeg')],
      }),
    );
    expect(r.archivos.map((a) => [a.nombre, a.tipo])).toEqual([
      ['TP.pdf', 'pdf'],
      ['foto.jpg', 'jpg'],
    ]);
    expect(r.fuera).toEqual([
      { nombre: 'apunte.pdf', por: 'tipo' },
      { nombre: 'grande.pdf', por: 'peso' },
      { nombre: 'vacio.jpg', por: 'tipo' },
    ]);
  });

  it('takes up to the count and the total, never more', async () => {
    const muchos = Array.from({ length: COMPARTIDO.archivos + 2 }, (_, i) => archivo(PNG, `f${i}.png`, 'image/png'));
    const r = await revisarCompartido(formDe({ archivos: muchos }));
    expect(r.archivos).toHaveLength(COMPARTIDO.archivos);
    expect(r.fuera.map((f) => f.por)).toEqual(['cantidad', 'cantidad']);

    const pesados = Array.from({ length: 4 }, (_, i) => {
      const a = archivo(PDF, `p${i}.pdf`);
      Object.defineProperty(a, 'size', { value: COMPARTIDO.archivo });
      return a;
    });
    const t = await revisarCompartido(formDe({ archivos: pesados }));
    expect(t.archivos.length * COMPARTIDO.archivo).toBeLessThanOrEqual(COMPARTIDO.total);
    expect(t.fuera.every((f) => f.por === 'total')).toBe(true);
  });

  it('keeps the link apart from the text, without control characters', async () => {
    const r = await revisarCompartido(formDe({ titulo: 'Resumen\u0007 de Física', texto: 'Mirá este resumen\u200B https://lutastudios.com/utn/ver?id=9 está bueno' }));
    expect(r.titulo).toBe('Resumen de Física');
    expect(r.enlace).toBe('https://lutastudios.com/utn/ver?id=9');
    expect(r.texto).toBe('Mirá este resumen está bueno');
    expect(r.archivos).toEqual([]);
  });
});
