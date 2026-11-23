// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ARCHIVO_MAXIMO, archivoGuardado, borrarAparte, borrarSinInternet, esAparte, guardarArchivoSinInternet, guardarPartesSinInternet, partesGuardadas, recordar, recordarAparte, recuperar, recuperarAparte, recuperarTodas } from './sinInternet';
import { baseFalsa } from './baseFalsa.fixture';

const DIR = 'https://frro.cvg.utn.edu.ar/webservice/pluginfile.php/1/mod_resource/content/1/a.pdf';
const OTRA = 'https://frro.cvg.utn.edu.ar/webservice/pluginfile.php/1/mod_resource/content/1/b.pdf';
const quien = { token: 'clave', alumno: 7 };
const tramo = (desde, largo) => ({ desde, blob: new Blob([new Uint8Array(largo).fill(desde % 251)]) });

beforeEach(() => vi.stubGlobal('indexedDB', baseFalsa()));
afterEach(async () => {
  await borrarSinInternet();
  vi.unstubAllGlobals();
});

describe('the parts of a PDF, kept', () => {
  it('come back with their version and size, and are not a whole file', async () => {
    await guardarPartesSinInternet(DIR, 's1', { largo: 1000, tramos: [tramo(0, 100), tramo(500, 50)] }, quien);
    const g = await partesGuardadas(DIR, 'clave');
    expect(g.sello).toBe('s1');
    expect(g.largo).toBe(1000);
    expect(g.tramos.map((t) => [t.desde, t.blob.size])).toEqual([[0, 100], [500, 50]]);
    expect(await archivoGuardado(DIR, 'clave')).toBeNull();
    // Another key never reads them.
    expect(await partesGuardadas(DIR, 'otra')).toBeNull();
  });

  it('the whole file replaces them; they never replace the whole file of the same version', async () => {
    await guardarPartesSinInternet(DIR, 's1', { largo: 100, tramos: [tramo(0, 10)] }, quien);
    await guardarArchivoSinInternet(DIR, 's1', new Blob([new Uint8Array(100)]), quien);
    expect(await partesGuardadas(DIR, 'clave')).toBeNull();
    await guardarPartesSinInternet(DIR, 's1', { largo: 100, tramos: [tramo(0, 20)] }, quien);
    expect((await archivoGuardado(DIR, 'clave')).blob.size).toBe(100);
    // A new version of the file on the campus: its parts take the place of the old one.
    await guardarPartesSinInternet(DIR, 's2', { largo: 100, tramos: [tramo(0, 20)] }, quien);
    expect(await archivoGuardado(DIR, 'clave')).toBeNull();
    expect((await partesGuardadas(DIR, 'clave')).sello).toBe('s2');
  });

  it('count towards the same tope, by what is kept: the oldest used goes first', async () => {
    await guardarArchivoSinInternet(OTRA, 's', new Blob([new Uint8Array(600)]), quien, 1000);
    await new Promise((r) => setTimeout(r, 5));
    await guardarPartesSinInternet(DIR, 's1', { largo: 900, tramos: [tramo(0, 300)] }, quien, 1000);
    expect(await archivoGuardado(OTRA, 'clave')).not.toBeNull();
    await new Promise((r) => setTimeout(r, 5));
    await guardarPartesSinInternet(DIR, 's1', { largo: 900, tramos: [tramo(0, 300), tramo(500, 300)] }, quien, 1000);
    expect(await archivoGuardado(OTRA, 'clave')).toBeNull();
    expect((await partesGuardadas(DIR, 'clave')).tramos).toHaveLength(2);
  });

  it('a file heavier than the limit for one file is never kept by parts either', async () => {
    await guardarPartesSinInternet(DIR, 's1', { largo: ARCHIVO_MAXIMO + 1, tramos: [tramo(0, 10)] }, quien);
    expect(await partesGuardadas(DIR, 'clave')).toBeNull();
  });

  it('Salir takes them away', async () => {
    await guardarPartesSinInternet(DIR, 's1', { largo: 100, tramos: [tramo(0, 10)] }, quien);
    await borrarSinInternet();
    expect(await partesGuardadas(DIR, 'clave')).toBeNull();
  });
});

describe('what came from Classroom and El Santo Resumen, kept', () => {
  const cursos = [{ id: '1', name: 'Física I' }];

  it('comes back only for the same key and the same one over there', async () => {
    await recordarAparte('classroom.cursos', cursos, { ...quien, de: '111' });
    expect((await recuperarAparte('classroom.cursos', 'clave', '111')).datos).toEqual(cursos);
    // Another Google account, or another campus key, never reads it.
    expect(await recuperarAparte('classroom.cursos', 'clave', '222')).toBeNull();
    expect(await recuperarAparte('classroom.cursos', 'otra', '111')).toBeNull();
  });

  it('another campus student writing empties it first', async () => {
    await recordarAparte('santo.banco:fisica-i', { resumenes: [] }, { ...quien, de: '' });
    await recordarAparte('santo.indice', [], { token: 'otra', alumno: 8, de: '' });
    expect(await recuperarAparte('santo.banco:fisica-i', 'otra', '')).toBeNull();
    expect(await recuperarAparte('santo.banco:fisica-i', 'clave', '')).toBeNull();
  });

  it('has names of its own: conCache never brings it, and nothing else goes under them', async () => {
    expect(esAparte('classroom.curso:123')).toBe(true);
    expect(esAparte('santo.resumenes')).toBe(true);
    expect(esAparte('perfil')).toBe(false);
    expect(esAparte('classroom.')).toBe(false);
    await recordarAparte('classroom.cursos', cursos, { ...quien, de: '111' });
    await recordar('perfil', { id: 7 }, quien);
    expect((await recuperarTodas('clave')).map(([n]) => n)).toEqual(['perfil']);
    await recordarAparte('perfil', { id: 9 }, quien);
    expect((await recuperar('perfil', 'clave')).datos).toEqual({ id: 7 });
  });

  it('Desconectar deletes only what Classroom brought; Desvincular, only the lists of the account', async () => {
    await recordar('perfil', { id: 7 }, quien);
    await recordarAparte('classroom.cursos', cursos, { ...quien, de: '111' });
    await recordarAparte('classroom.curso:1', { temas: [] }, { ...quien, de: '111' });
    await recordarAparte('santo.resumenes', { usuario: 'santi' }, { ...quien, de: 'h' });
    await recordarAparte('santo.banco:', { resumenes: [] }, { ...quien, de: '' });
    await guardarArchivoSinInternet('santo:bajar:1', 'aparte', new Blob(['%PDF-']), quien);
    await borrarAparte('classroom.');
    expect(await recuperarAparte('classroom.cursos', 'clave', '111')).toBeNull();
    expect(await recuperarAparte('classroom.curso:1', 'clave', '111')).toBeNull();
    expect(await recuperarAparte('santo.resumenes', 'clave', 'h')).not.toBeNull();
    await borrarAparte('santo.resumenes');
    expect(await recuperarAparte('santo.resumenes', 'clave', 'h')).toBeNull();
    // The bank and the summaries opened are no one's account: they stay, like the campus.
    expect(await recuperarAparte('santo.banco:', 'clave', '')).not.toBeNull();
    expect(await archivoGuardado('santo:bajar:1', 'clave')).not.toBeNull();
    expect(await recuperar('perfil', 'clave')).not.toBeNull();
    // Only those two kinds of name can be deleted this way.
    await borrarAparte('');
    expect(await recuperar('perfil', 'clave')).not.toBeNull();
  });

  it('a summary opened counts towards the same tope as the campus files', async () => {
    await guardarArchivoSinInternet(OTRA, 's', new Blob([new Uint8Array(600)]), quien, 1000);
    await new Promise((r) => setTimeout(r, 5));
    await guardarArchivoSinInternet('santo:bajar:1', 'aparte', new Blob([new Uint8Array(300)]), quien, 1000);
    expect(await archivoGuardado(OTRA, 'clave')).not.toBeNull();
    await new Promise((r) => setTimeout(r, 5));
    // Opened again, now heavier: the campus file used longest ago makes room.
    await guardarArchivoSinInternet('santo:bajar:1', 'aparte', new Blob([new Uint8Array(600)]), quien, 1000);
    expect(await archivoGuardado(OTRA, 'clave')).toBeNull();
    expect(await archivoGuardado('santo:bajar:1', 'clave')).not.toBeNull();
  });

  it('Salir takes it all away', async () => {
    await recordarAparte('classroom.cursos', cursos, { ...quien, de: '111' });
    await guardarArchivoSinInternet('santo:ver:1', 'aparte', new Blob(['<p>hola</p>']), quien);
    await borrarSinInternet();
    expect(await recuperarAparte('classroom.cursos', 'clave', '111')).toBeNull();
    expect(await archivoGuardado('santo:ver:1', 'clave')).toBeNull();
  });
});
