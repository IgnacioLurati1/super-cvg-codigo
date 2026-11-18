import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { esConocido, revisarTexto } from './revisar-dist.mjs';

describe('revisar-dist', () => {
  it('frena algo con forma de clave del campus sin mostrarla entera', () => {
    const [falla] = revisarTexto('const k = "0123456789abcdef0123456789abcdef";');
    expect(falla.nombre).toBe('algo con forma de clave del campus');
    expect(falla.muestra).toBe('0123…');
  });

  it('frena rutas de la compu y de la red privada', () => {
    expect(revisarTexto('C:\\Users\\alguien\\Desktop')).toHaveLength(1);
    expect(revisarTexto('compu.red-privada.ts.net')).toHaveLength(1);
    expect(revisarTexto('%USERPROFILE%\\.control\\secrets.env')).toHaveLength(1);
  });

  it('deja pasar los moldes y el código normal', () => {
    expect(revisarTexto('C:\\Users\\<usuario>\\ y un hash corto abc123 y 0123456789abcdef0123456789abcdef0')).toEqual([]);
  });
});

describe('revisar-dist y el lector de fotos', () => {
  const NOMBRES = ['tesseract-core-relaxedsimd-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-lstm.wasm.js'];
  const leer = (f) => readFileSync(resolve('node_modules/tesseract.js-core', f));
  const CLAVE = '0123456789abcdef0123456789abcdef';

  // With a new tesseract.js-core these change. Build, look at what `revisar-dist` stops in the three files (runs of
  // base64, never a key) and put their new sha256 in CONOCIDOS.
  it('sus tres archivos son los del paquete, byte por byte', () => {
    for (const f of NOMBRES) expect(esConocido(leer(f)), f).toBe(true);
  });

  it('saltean solo la regla de la clave', () => {
    // A run of theirs, as it is in the file: zeros of the WebAssembly, in base64.
    const ceros = `AAAAAQEAAAE${'A'.repeat(24)}BAAsgA0Ew`;
    expect(leer(NOMBRES[1]).includes(ceros)).toBe(true);
    expect(revisarTexto(ceros)).toHaveLength(1);
    expect(revisarTexto(ceros, { conocido: true })).toEqual([]);
    expect(revisarTexto('C:\\Users\\alguien\\Desktop', { conocido: true })).toHaveLength(1);
    expect(revisarTexto('compu.red-privada.ts.net', { conocido: true })).toHaveLength(1);
  });

  it('con un byte distinto, o en otro archivo, la clave frena', () => {
    const tocado = Buffer.concat([leer(NOMBRES[1]), Buffer.from(`\n// ${CLAVE}\n`)]);
    expect(esConocido(tocado)).toBe(false);
    expect(revisarTexto(`// ${CLAVE}`, { conocido: esConocido(tocado) })).toHaveLength(1);
    expect(esConocido(Buffer.from(`const k = "${CLAVE}";`))).toBe(false);
  });
});
