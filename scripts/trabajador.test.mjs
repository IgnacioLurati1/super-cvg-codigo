import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { armarTrabajador, nucleoDe, precargaDe } from './trabajador.mjs';

let dist;
const escribir = (ruta, texto = ruta) => {
  fs.mkdirSync(path.dirname(path.join(dist, ruta)), { recursive: true });
  fs.writeFileSync(path.join(dist, ruta), texto);
};

// A small build: the entry with its fonts, the main screens, VisorPdf shared (no source, only its name, as Vite writes
// it), and a screen nobody opens up front with a library of its own.
const MANIFIESTO = {
  'index.html': { file: 'assets/index-a1.js', src: 'index.html', isEntry: true, imports: ['_lib-react-r1.js', '_app-p1.js'], dynamicImports: ['src/pages/Materias.jsx', 'src/pages/Laboratorio.jsx'], css: ['assets/app-p2.css'] },
  '_lib-react-r1.js': { file: 'assets/lib-react-r1.js', name: 'lib-react' },
  '_app-p1.js': { file: 'assets/app-p1.js', name: 'app', imports: ['_lib-react-r1.js', '_lib-fontsource-f1.js'] },
  '_lib-fontsource-f1.js': { file: 'assets/lib-fontsource-f1.js', name: 'lib-fontsource', assets: ['assets/barlow-latin-400-b1.woff2', 'assets/barlow-latin-400-b2.woff', 'assets/kalam-latin-700-k1.woff2', 'assets/fira-code-latin-400-c1.woff2'] },
  'src/pages/Materias.jsx': { file: 'assets/Materias-m1.js', src: 'src/pages/Materias.jsx', isDynamicEntry: true, imports: ['_app-p1.js'] },
  'src/pages/Materia.jsx': { file: 'assets/Materia-m2.js', src: 'src/pages/Materia.jsx', isDynamicEntry: true, imports: ['_app-p1.js'] },
  'src/pages/Calendario.jsx': { file: 'assets/Calendario-c2.js', src: 'src/pages/Calendario.jsx', isDynamicEntry: true },
  'src/pages/Mensajes.jsx': { file: 'assets/Mensajes-s1.js', src: 'src/pages/Mensajes.jsx', isDynamicEntry: true, imports: ['_app-p1.js'] },
  'src/pages/Carrera.jsx': { file: 'assets/Carrera-t1.js', src: 'src/pages/Carrera.jsx', isDynamicEntry: true },
  'src/components/PreviaHoja.jsx': { file: 'assets/PreviaHoja-h1.js', src: 'src/components/PreviaHoja.jsx', isDynamicEntry: true, dynamicImports: ['_VisorPdf-v1.js'] },
  '_VisorPdf-v1.js': { file: 'assets/VisorPdf-v1.js', name: 'VisorPdf', imports: ['_lib-pdfjs-d1.js'], dynamicImports: ['src/components/consultron/EnVisor.jsx'], css: ['assets/VisorPdf-v2.css'] },
  '_lib-pdfjs-d1.js': { file: 'assets/lib-pdfjs-d1.js', name: 'lib-pdfjs', assets: ['assets/pdf.worker.min-w1.mjs'] },
  'src/components/consultron/EnVisor.jsx': { file: 'assets/EnVisor-e1.js', src: 'src/components/consultron/EnVisor.jsx', isDynamicEntry: true },
  'src/pages/Laboratorio.jsx': { file: 'assets/Laboratorio-l1.js', src: 'src/pages/Laboratorio.jsx', isDynamicEntry: true, imports: ['_lib-codemirror-x1.js', '_motor-y1.js'] },
  '_lib-codemirror-x1.js': { file: 'assets/lib-codemirror-x1.js', name: 'lib-codemirror' },
  '_motor-y1.js': { file: 'assets/motor-y1.js', name: 'motor', assets: ['assets/python.worker-z1.js'] },
};
const ARCHIVOS = [...new Set(Object.values(MANIFIESTO).flatMap((e) => [e.file, ...(e.css ?? []), ...(e.assets ?? [])]))];

const armar = () => {
  dist = fs.mkdtempSync(path.join(os.tmpdir(), 'cvg-sw-'));
  for (const f of ['index.html', '404.html', 'ajustes.js', 'manifest.webmanifest', 'assets/lib-three-t1.js', 'motores/python/x.wasm', 'materias/index.html', ...ARCHIVOS]) escribir(f);
};
afterEach(() => dist && fs.rmSync(dist, { recursive: true, force: true }));

describe('the service worker', () => {
  it('keeps up front the first page and the main screens with what they import, and only the site font', () => {
    expect(nucleoDe(MANIFIESTO).sort()).toEqual([
      'assets/Calendario-c2.js',
      'assets/Carrera-t1.js',
      'assets/Materia-m2.js',
      'assets/Materias-m1.js',
      'assets/Mensajes-s1.js',
      'assets/PreviaHoja-h1.js',
      'assets/VisorPdf-v1.js',
      'assets/VisorPdf-v2.css',
      'assets/app-p1.js',
      'assets/app-p2.css',
      'assets/barlow-latin-400-b1.woff2',
      'assets/index-a1.js',
      'assets/lib-fontsource-f1.js',
      'assets/lib-pdfjs-d1.js',
      'assets/lib-react-r1.js',
      'assets/pdf.worker.min-w1.mjs',
    ]);
  });

  it('leaves for later every other file of assets/, never the engines, the 3D or the .woff', () => {
    armar();
    const { nucleo, resto } = precargaDe(dist, MANIFIESTO);
    expect(nucleo.slice(0, 4)).toEqual(['', '404.html', 'ajustes.js', 'manifest.webmanifest']);
    expect(resto).toEqual(['assets/EnVisor-e1.js', 'assets/Laboratorio-l1.js', 'assets/fira-code-latin-400-c1.woff2', 'assets/kalam-latin-700-k1.woff2', 'assets/lib-codemirror-x1.js', 'assets/motor-y1.js']);
  });

  it('fails when a main screen is no longer in the build, instead of keeping less quietly', () => {
    const { 'src/pages/Calendario.jsx': _, ...sinCalendario } = MANIFIESTO;
    expect(() => nucleoDe(sinCalendario)).toThrow(/Calendario/);
  });

  it('names a version by its files: the same build, the same name; a change, another', () => {
    armar();
    const version = (sw) => /const VERSION = "([0-9a-f]{12})"/.exec(sw)[1];
    const motores = (sw) => /const MOTORES = "([0-9a-f]{12})"/.exec(sw)[1];
    const uno = armarTrabajador(dist, MANIFIESTO);
    expect(uno).toContain('const NUCLEO = ["","404.html"');
    expect(uno).toContain('"assets/Laboratorio-l1.js"');
    expect(uno).not.toMatch(/__VERSION__|__MOTORES__|\/\* (nucleo|resto) \*\//);
    expect(version(armarTrabajador(dist, MANIFIESTO))).toBe(version(uno));
    escribir('index.html', 'otra');
    const dos = armarTrabajador(dist, MANIFIESTO);
    expect(version(dos)).not.toBe(version(uno));
    expect(motores(dos)).toBe(motores(uno));
    // A screen kept for later changes the version too: its old file goes with the old cache.
    escribir('assets/Laboratorio-l1.js', 'otro');
    expect(version(armarTrabajador(dist, MANIFIESTO))).not.toBe(version(dos));
    escribir('motores/python/x.wasm', 'otro');
    expect(motores(armarTrabajador(dist, MANIFIESTO))).not.toBe(motores(uno));
  });

  it('carries the rules of what another app shares, as plain code, and answers the share with a redirect', () => {
    armar();
    const sw = armarTrabajador(dist, MANIFIESTO);
    expect(sw).not.toContain('/* compartido */');
    expect(sw).toContain('async function revisarCompartido(');
    expect(sw).not.toMatch(/^export /m);
    expect(sw).toMatch(/Response\.redirect\([^)]*303\)/);
    // It runs as a classic worker: the whole file parses as a script.
    expect(() => new Function(sw)).not.toThrow();
  });
});
