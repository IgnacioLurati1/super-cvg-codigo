import { Blob as BlobDeNode } from 'node:buffer';
import { strFromU8, unzipSync, zipSync, strToU8 } from 'fflate';
import { describe, expect, it, vi } from 'vitest';
import { lineasDeDocumentoWord, lineasDePagina, textoDeArchivo } from './leerTexto';
import { ARCHIVO_ENLACES, ARCHIVO_FALLAS, bajarMateria, nombreSeguro, planDeZip, textoDeEnlaces, textoDeFallas } from './zipMateria';

// El Blob de jsdom no tiene arrayBuffer. El del navegador y el de Node sí.
globalThis.Blob = BlobDeNode;

const MATERIA = { id: 7, nombre: 'Análisis Matemático I' };
const archivo = (seccion, nombre, extra = {}) => ({
  tipo: 'archivo',
  clave: `${seccion}-${nombre}`,
  seccion,
  seccionId: seccion,
  nombre,
  archivo: nombre,
  direccion: `https://campus/${nombre}`,
  peso: 1000,
  ...extra,
});
const enlace = (seccion, nombre, destino) => ({ tipo: 'enlace', clave: nombre, seccion, seccionId: seccion, nombre, destino });
const rutas = (plan) => plan.archivos.map((a) => a.ruta);

async function bytesDe(blob) {
  return new Uint8Array(await blob.arrayBuffer());
}

describe('plan del ZIP', () => {
  it('suma los archivos tuyos de este navegador (materias tuyas), que se traen sin el campus', async () => {
    const propio = { ...archivo('Resúmenes', 'mio.pdf'), direccion: undefined, traer: () => Promise.resolve(new Blob(['%PDF'])) };
    const plan = planDeZip([propio, archivo('Teoría', 'a.pdf')], MATERIA);
    expect(rutas(plan)).toEqual(['01 Resúmenes/mio.pdf', '02 Teoría/a.pdf']);
  });

  it('una carpeta numerada por sección, en el orden de los ítems', () => {
    const plan = planDeZip([archivo('Unidad 2', 'b.pdf'), archivo('Unidad 1', 'a.pdf'), archivo('Unidad 2', 'c.pdf'), archivo('', 'd.pdf')], MATERIA);
    expect(rutas(plan)).toEqual(['01 Unidad 2/b.pdf', '02 Unidad 1/a.pdf', '01 Unidad 2/c.pdf', '03 General/d.pdf']);
    expect(plan.nombre).toBe('Análisis Matemático I.zip');
    expect(plan.bytes).toBe(4000);
  });

  it('con más de 99 secciones, las cifras alcanzan', () => {
    const plan = planDeZip(Array.from({ length: 100 }, (_, n) => archivo(`S${n}`, 'a.pdf')), MATERIA);
    expect(rutas(plan)[0]).toBe('001 S0/a.pdf');
    expect(rutas(plan)[99]).toBe('100 S99/a.pdf');
  });

  it('dos secciones con el mismo nombre no se mezclan', () => {
    const plan = planDeZip([archivo('Teoría', 'a.pdf', { seccionId: 1 }), archivo('Teoría', 'a.pdf', { seccionId: 2 })], MATERIA);
    expect(rutas(plan)).toEqual(['01 Teoría/a.pdf', '02 Teoría/a.pdf']);
  });

  it('los nombres repetidos no se pisan, tampoco con otra mayúscula', () => {
    const plan = planDeZip(
      [archivo('U', 'a.pdf'), archivo('U', 'a.pdf'), archivo('U', 'A.PDF'), archivo('U', 'a (2).pdf'), archivo('U', 'sin-extension'), archivo('U', 'sin-extension')],
      MATERIA,
    );
    const nombres = rutas(plan).map((r) => r.split('/')[1]);
    expect(nombres).toEqual(['a.pdf', 'a (2).pdf', 'A (3).PDF', 'a (2) (2).pdf', 'sin-extension', 'sin-extension (2)']);
    expect(new Set(nombres.map((n) => n.toLowerCase())).size).toBe(nombres.length);
  });

  it('el nombre que le puso el alumno, con la extensión del archivo', () => {
    const plan = planDeZip([archivo('U', 'x12.pdf', { nombre: 'Resumen', nombreOriginal: 'Apunte' }), archivo('U', 'y.pdf', { nombre: 'Otro.PDF', nombreOriginal: 'Apunte' }), archivo('U', 'z.pdf', { nombre: 'Tal como vino' })], MATERIA);
    expect(rutas(plan)).toEqual(['01 U/Resumen.pdf', '01 U/Otro.PDF', '01 U/z.pdf']);
  });

  it('un nombre no puede salirse de la carpeta ni romper en Windows', () => {
    expect(nombreSeguro('../../etc/passwd')).toBe('....etcpasswd');
    expect(nombreSeguro('..')).toBe('archivo');
    expect(nombreSeguro('...')).toBe('archivo');
    expect(nombreSeguro('')).toBe('archivo');
    expect(nombreSeguro('C:\\Windows\\win.ini')).toBe('C Windowswin.ini');
    expect(nombreSeguro('a<b>c:d"e|f?g*h.pdf')).toBe('a b c d e f g h.pdf');
    expect(nombreSeguro('con.pdf')).toBe('_con.pdf');
    expect(nombreSeguro('NUL')).toBe('_NUL');
    expect(nombreSeguro('final. ')).toBe('final');
    expect(nombreSeguro('a\u202Efdp.exe')).toBe('afdp.exe');

    const plan = planDeZip([archivo('../Unidad: 1?', '../../x.pdf')], MATERIA);
    const [ruta] = rutas(plan);
    expect(ruta).toBe('01 ..Unidad 1/....x.pdf');
    expect(ruta.split('/')).toHaveLength(2);
    expect(ruta.split('/').every((p) => p !== '..' && p !== '.')).toBe(true);
    expect(ruta).not.toMatch(/[\\:*?"<>|]/);
  });

  it('corta los nombres larguísimos sin perder la extensión', () => {
    const largo = nombreSeguro(`${'á'.repeat(300)}.pdf`);
    expect(Array.from(largo)).toHaveLength(120);
    expect(largo.endsWith('.pdf')).toBe(true);
    const plan = planDeZip([archivo('s'.repeat(200), `${'a'.repeat(300)}.pdf`), archivo('s'.repeat(200), `${'a'.repeat(300)}.pdf`)], { nombre: 'm'.repeat(300) });
    expect(rutas(plan)[0].split('/')[0]).toHaveLength(63);
    expect(rutas(plan)[1]).toMatch(/ \(2\)\.pdf$/);
    expect(plan.nombre.length).toBeLessThanOrEqual(120);
    expect(plan.nombre.endsWith('.zip')).toBe(true);
  });

  it('los enlaces van por sección y sin clave. Actividades y direcciones raras quedan afuera', () => {
    const plan = planDeZip(
      [
        enlace('Unidad 1', 'Video', 'https://youtu.be/x?token=secreto&t=3'),
        { tipo: 'actividad', clave: 'q', seccion: 'Unidad 1', nombre: 'Cuestionario', destino: 'https://campus/q' },
        enlace('Unidad 1', 'Malo', 'javascript:alert(1)'),
        enlace('', 'Sin sección', 'https://a.b/'),
        enlace('Unidad 1', 'Otro\ncon salto', 'https://c.d/'),
      ],
      MATERIA,
    );
    expect(plan.archivos).toEqual([]);
    const texto = textoDeEnlaces(plan);
    expect(texto).toBe('Enlaces de Análisis Matemático I\n\nUnidad 1\nVideo\nhttps://youtu.be/x?t=3\n\nOtro con salto\nhttps://c.d/\n\nGeneral\nSin sección\nhttps://a.b/\n');
    expect(texto).not.toContain('secreto');
    expect(texto).not.toContain('javascript');
    expect(texto).not.toContain('Cuestionario');
  });

  it('la lista de fallas da la ruta, no la dirección', () => {
    const texto = textoDeFallas(['01 U/a.pdf', '02 V/b.pdf']);
    expect(texto).toContain('01 U/a.pdf\n02 V/b.pdf\n');
    expect(texto).not.toContain('http');
  });

  it('sin ítems no rompe', () => {
    expect(planDeZip(undefined, undefined)).toMatchObject({ archivos: [], enlaces: [], bytes: 0, nombre: 'Materia.zip' });
  });
});

describe('bajar la materia', () => {
  const contenidos = { 'a.pdf': 'contenido de a', 'b.pdf': 'contenido de b', 'c.pdf': 'contenido de ce', 'ñandú.pdf': 'con acento' };
  const traerBien = (item) => Promise.resolve(new Blob([contenidos[item.archivo] ?? 'otro']));

  async function abrir(guardar) {
    const [blob, nombre] = guardar.mock.calls[0];
    expect(blob.type).toBe('application/zip');
    const adentro = unzipSync(await bytesDe(blob));
    return { nombre, adentro, leer: (ruta) => strFromU8(adentro[ruta]) };
  }

  it('arma un ZIP sin comprimir con todo adentro, y avisa el progreso', async () => {
    const guardar = vi.fn();
    const alProgreso = vi.fn();
    const items = [archivo('U 1', 'a.pdf'), archivo('U 1', 'ñandú.pdf'), archivo('U 2', 'b.pdf'), enlace('U 2', 'Video', 'https://a.b/')];
    const r = await bajarMateria(planDeZip(items, MATERIA), { traer: traerBien, guardar, alProgreso });
    expect(r).toEqual({ cancelado: false, bajados: 3, fallaron: [] });
    const { nombre, adentro, leer } = await abrir(guardar);
    expect(nombre).toBe('Análisis Matemático I.zip');
    expect(Object.keys(adentro).sort()).toEqual(['01 U 1/a.pdf', '01 U 1/ñandú.pdf', '02 U 2/b.pdf', ARCHIVO_ENLACES].sort());
    expect(leer('01 U 1/a.pdf')).toBe('contenido de a');
    expect(leer('01 U 1/ñandú.pdf')).toBe('con acento');
    expect(leer(ARCHIVO_ENLACES)).toContain('https://a.b/');
    expect(alProgreso).toHaveBeenLastCalledWith({ hechos: 3, total: 3, fallaron: 0 });
  });

  it('un archivo grande entra entero, cortado en trozos, y un archivo vacío también', async () => {
    const grande = new Uint8Array(9 * 1024 * 1024 + 123);
    for (let i = 0; i < grande.length; i += 4096) grande[i] = i % 251;
    const guardar = vi.fn();
    const traer = (item) => Promise.resolve(new Blob(item.archivo === 'grande.pdf' ? [grande] : []));
    await bajarMateria(planDeZip([archivo('U', 'grande.pdf'), archivo('U', 'vacio.pdf')], MATERIA), { traer, guardar });
    const { adentro } = await abrir(guardar);
    expect(adentro['01 U/grande.pdf']).toEqual(grande);
    expect(adentro['01 U/vacio.pdf']).toHaveLength(0);
    // Sin comprimir: pesa lo mismo que lo que trae.
    expect(guardar.mock.calls[0][0].size).toBeGreaterThan(grande.length);
    expect(guardar.mock.calls[0][0].size).toBeLessThan(grande.length + 2000);
  });

  it('nunca baja más de dos a la vez', async () => {
    let activos = 0;
    let maximo = 0;
    const traer = async () => {
      activos++;
      maximo = Math.max(maximo, activos);
      await new Promise((r) => setTimeout(r, 2));
      activos--;
      return new Blob(['x']);
    };
    const items = Array.from({ length: 9 }, (_, n) => archivo('U', `${n}.pdf`));
    const guardar = vi.fn();
    await bajarMateria(planDeZip(items, MATERIA), { traer, guardar });
    expect(maximo).toBe(2);
    const { adentro } = await abrir(guardar);
    expect(Object.keys(adentro)).toHaveLength(9);
  });

  it('si algo falla sigue, y suma la lista de lo que faltó', async () => {
    const guardar = vi.fn();
    const traer = (item) => (item.archivo === 'b.pdf' ? Promise.reject(new Error('no')) : traerBien(item));
    const r = await bajarMateria(planDeZip([archivo('U', 'a.pdf'), archivo('U', 'b.pdf'), archivo('U', 'c.pdf')], MATERIA), { traer, guardar });
    expect(r.fallaron).toEqual(['01 U/b.pdf']);
    expect(r.bajados).toBe(2);
    const { adentro, leer } = await abrir(guardar);
    expect(Object.keys(adentro).sort()).toEqual(['01 U/a.pdf', '01 U/c.pdf', ARCHIVO_FALLAS].sort());
    expect(leer(ARCHIVO_FALLAS)).toContain('01 U/b.pdf');
  });

  it('si fallan todos no entrega nada', async () => {
    const guardar = vi.fn();
    const r = await bajarMateria(planDeZip([archivo('U', 'a.pdf'), archivo('U', 'b.pdf')], MATERIA), { traer: () => Promise.reject(new Error('no')), guardar });
    expect(r).toEqual({ cancelado: false, bajados: 0, fallaron: ['01 U/a.pdf', '01 U/b.pdf'] });
    expect(guardar).not.toHaveBeenCalled();
  });

  it('si el campus no responde, deja de pedirle después de diez seguidos', async () => {
    const traer = vi.fn(() => Promise.reject(new Error('no')));
    const items = Array.from({ length: 40 }, (_, n) => archivo('U', `${n}.pdf`));
    const r = await bajarMateria(planDeZip(items, MATERIA), { traer, guardar: vi.fn() });
    expect(traer.mock.calls.length).toBeLessThanOrEqual(11);
    expect(r.fallaron).toHaveLength(40);
  });

  it('cancelar corta enseguida, no pide más y no entrega nada', async () => {
    const control = new AbortController();
    const guardar = vi.fn();
    const pedidos = [];
    const traer = vi.fn((item) => new Promise((resolver) => pedidos.push(() => resolver(new Blob([item.archivo])))));
    const items = Array.from({ length: 6 }, (_, n) => archivo('U', `${n}.pdf`));
    const promesa = bajarMateria(planDeZip(items, MATERIA), { traer, guardar, senal: control.signal });
    await new Promise((r) => setTimeout(r, 0));
    expect(traer).toHaveBeenCalledTimes(2);
    pedidos[0]();
    await new Promise((r) => setTimeout(r, 5));
    expect(traer).toHaveBeenCalledTimes(3);
    control.abort();
    // Los pedidos en curso nunca responden y aun así termina.
    const r = await promesa;
    expect(r.cancelado).toBe(true);
    expect(traer).toHaveBeenCalledTimes(3);
    expect(guardar).not.toHaveBeenCalled();
  });

  it('cancelado de entrada no pide nada', async () => {
    const control = new AbortController();
    control.abort();
    const traer = vi.fn(traerBien);
    const guardar = vi.fn();
    const r = await bajarMateria(planDeZip([archivo('U', 'a.pdf')], MATERIA), { traer, guardar, senal: control.signal });
    expect(r.cancelado).toBe(true);
    expect(traer).not.toHaveBeenCalled();
    expect(guardar).not.toHaveBeenCalled();
  });
});

describe('leer el texto de un Word', () => {
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  const docx = (cuerpo, extra = {}) =>
    new Blob([zipSync({ 'word/document.xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?><w:document ${W}><w:body>${cuerpo}</w:body></w:document>`), ...extra })]);
  const ITEM = { archivo: 'cronograma.docx' };
  const parrafo = (t) => `<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`;

  it('un renglón por párrafo, con los pedazos de un mismo párrafo juntos', async () => {
    const texto = await textoDeArchivo(docx(`${parrafo('Primer parcial')}<w:p><w:r><w:t xml:space="preserve">15/11</w:t></w:r><w:r><w:t>/2026</w:t></w:r></w:p>${parrafo('Sábado &amp; domingo')}`), ITEM);
    expect(texto).toBe('Primer parcial\n15/11/2026\nSábado & domingo');
  });

  it('una fila de tabla queda en un renglón, y un salto de línea corta', async () => {
    const celda = (t) => `<w:tc>${parrafo(t)}</w:tc>`;
    const tabla = `<w:tbl><w:tr>${celda('Parcial 1')}${celda('15/11')}</w:tr><w:tr>${celda('Parcial 2')}${celda('22/11')}</w:tr></w:tbl>`;
    expect(await textoDeArchivo(docx(tabla), ITEM)).toBe('Parcial 1 15/11\nParcial 2 22/11');
    expect(await textoDeArchivo(docx('<w:p><w:r><w:t>uno</w:t><w:br/><w:t>dos</w:t></w:r></w:p>'), ITEM)).toBe('uno\ndos');
  });

  it('no lee lo tachado ni repite el cuadro de texto alternativo', () => {
    const xml = `<w:document ${W} xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"><w:body><w:p><w:del><w:r><w:delText>viejo</w:delText></w:r></w:del><w:r><w:t>nuevo</w:t></w:r></w:p><mc:AlternateContent><mc:Choice>${parrafo('una vez')}</mc:Choice><mc:Fallback>${parrafo('una vez')}</mc:Fallback></mc:AlternateContent></w:body></w:document>`;
    expect(lineasDeDocumentoWord(xml)).toEqual(['nuevo', 'una vez']);
  });

  it('no interpreta nada: lo que parece HTML queda como texto', async () => {
    const texto = await textoDeArchivo(docx(parrafo('&lt;img src=x onerror=alert(1)&gt;')), ITEM);
    expect(texto).toBe('<img src=x onerror=alert(1)>');
  });

  it('entidades declaradas, XML roto o archivo roto dan vacío', async () => {
    const bomba = `<!DOCTYPE d [<!ENTITY a "aaaa"><!ENTITY b "&a;&a;&a;">]><w:document ${W}><w:body>${parrafo('&b;')}</w:body></w:document>`;
    expect(lineasDeDocumentoWord(bomba)).toEqual([]);
    expect(lineasDeDocumentoWord('<w:document><w:p>')).toEqual([]);
    expect(await textoDeArchivo(new Blob([zipSync({ 'word/document.xml': strToU8(bomba) })]), ITEM)).toBe('');
    expect(await textoDeArchivo(new Blob(['esto no es un zip']), ITEM)).toBe('');
    expect(await textoDeArchivo(new Blob([zipSync({ 'otra/cosa.xml': strToU8('<a/>') })]), ITEM)).toBe('');
  });

  it('solo abre word/document.xml', async () => {
    const texto = await textoDeArchivo(docx(parrafo('adentro'), { 'word/vbaProject.bin': strToU8('macro'), 'word/header1.xml': strToU8('<a>encabezado</a>') }), ITEM);
    expect(texto).toBe('adentro');
  });

  it('un archivo de otro tipo da vacío', async () => {
    expect(await textoDeArchivo(new Blob(['hola']), { archivo: 'foto.png' })).toBe('');
  });
});

describe('renglones de un PDF', () => {
  const pieza = (str, x, y, width = 40, height = 10) => ({ str, transform: [1, 0, 0, 1, x, y], width, height });

  it('arma las filas de una tabla escrita columna por columna', () => {
    const piezas = [pieza('Parcial 1', 10, 700), pieza('Parcial 2', 10, 680), pieza('15/11', 200, 700), pieza('22/11', 200, 680)];
    expect(lineasDePagina(piezas)).toEqual(['Parcial 1 15/11', 'Parcial 2 22/11']);
  });

  it('no parte una palabra escrita en dos pedazos, y tolera un poco de desnivel', () => {
    expect(lineasDePagina([pieza('Par', 10, 700, 15), pieza('cial', 25, 700.5, 20), pieza('15/11', 60, 699, 30)])).toEqual(['Parcial 15/11']);
  });

  it('ignora pedazos vacíos o sin posición', () => {
    expect(lineasDePagina([pieza('  ', 0, 0), { str: 'x' }, { type: 'beginMarkedContent' }])).toEqual([]);
  });
});
