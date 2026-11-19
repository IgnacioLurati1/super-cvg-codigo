import { describe, expect, it, vi } from 'vitest';
import { armarMapa, buscarEnMapa, CARRERA, clienteDrivePublico, contenidoDe, drivesDe, enlaceDe, indiceDe, leerEnlace, sanearDriveMio, sanearMapa, tipoDe, visorDe, vistaDeGoogle } from './drivePublico';

const ID = '1ZgKML44drc8Wq3pcbHsc-ozPINv6xSHQ';
const CARPETA = 'application/vnd.google-apps.folder';

describe('el link de una carpeta o un archivo', () => {
  it('lee las formas de Drive y de Docs', () => {
    expect(leerEnlace(`https://drive.google.com/drive/folders/${ID}?usp=sharing`)).toEqual({ id: ID, carpeta: true, k: null });
    expect(leerEnlace(`https://drive.google.com/drive/u/1/folders/${ID}?resourcekey=0-abc_D`)).toEqual({ id: ID, carpeta: true, k: '0-abc_D' });
    expect(leerEnlace(`https://drive.google.com/file/d/${ID}/view`)).toEqual({ id: ID, carpeta: false, k: null });
    expect(leerEnlace(`https://docs.google.com/presentation/d/${ID}/edit#slide=1`)).toEqual({ id: ID, carpeta: false, k: null });
    expect(leerEnlace(`https://drive.google.com/open?id=${ID}`)).toEqual({ id: ID, carpeta: null, k: null });
  });

  it('nada que no sea de Google por https', () => {
    for (const malo of [`http://drive.google.com/drive/folders/${ID}`, `https://drive.google.com.evil.com/drive/folders/${ID}`, 'https://drive.google.com/drive/folders/<script>', 'no es un link', '', null]) {
      expect(leerEnlace(malo)).toBe(null);
    }
  });

  it('la vista de Google, para cuando frena las descargas', () => {
    expect(vistaDeGoogle({ id: ID, m: 'application/pdf', k: 'k1' })).toBe(`https://drive.google.com/file/d/${ID}/preview?resourcekey=k1`);
    expect(vistaDeGoogle({ id: ID, m: 'application/vnd.google-apps.presentation' })).toBe(`https://docs.google.com/presentation/d/${ID}/preview`);
  });

  it('el link de vuelta, con su clave si la tiene', () => {
    expect(enlaceDe({ id: ID, c: 1 })).toBe(`https://drive.google.com/drive/folders/${ID}`);
    expect(enlaceDe({ id: ID, m: 'application/pdf', k: 'k1' })).toBe(`https://drive.google.com/file/d/${ID}/view?resourcekey=k1`);
    expect(enlaceDe({ id: 'atajo123456', a: ID, m: 'application/vnd.google-apps.document' })).toBe(`https://docs.google.com/document/d/${ID}/edit`);
  });
});

describe('cómo se abre cada archivo', () => {
  it('PDF, lo de Google como PDF, imágenes, HTML y PowerPoint; lo demás se baja', () => {
    expect(visorDe({ n: 'a.pdf', m: 'application/pdf' })).toBe('pdf');
    expect(visorDe({ n: 'Apunte', m: 'application/vnd.google-apps.document' })).toBe('pdf');
    expect(visorDe({ n: 'foto.JPG' })).toBe('imagen');
    expect(visorDe({ n: 'tp.html', m: 'text/html' })).toBe('html');
    expect(visorDe({ n: 'clase.pptx' })).toBe('presentacion');
    expect(visorDe({ n: 'tp.docx', m: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })).toBe(null);
    expect(tipoDe({ n: 'tp.docx' })).toBe('documento');
    expect(tipoDe({ n: 'x', c: 1 })).toBe('carpeta');
  });
});

// A Drive of folders by id: { id: [files] }.
function driveFalso(arbol) {
  return {
    ficha: async (id) => ({ id, nombre: 'Raíz', carpeta: id in arbol }),
    hijos: async (id) => arbol[id] ?? [],
  };
}

const ARBOL = {
  raiz00000000: [
    { id: 'anio1000000', name: '1° AÑO', mimeType: CARPETA },
    { id: 'programa000', name: 'Programa.pdf', mimeType: 'application/pdf', size: '100', modifiedTime: '2025-03-01T00:00:00Z' },
  ],
  anio1000000: [
    { id: 'analisis000', name: 'Análisis Matemático I', mimeType: CARPETA },
    // A shortcut back to the root: walked once.
    { id: 'atajo000000', name: 'Volver', mimeType: 'application/vnd.google-apps.shortcut', shortcutDetails: { targetId: 'raiz00000000', targetMimeType: CARPETA } },
  ],
  analisis000: [
    { id: 'parcial0000', name: 'Primer parcial 2024.pdf', mimeType: 'application/pdf', size: '2000' },
    { id: 'clase000000', name: 'Clase 3.pptx', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
  ],
};

describe('el mapa de una carpeta', () => {
  it('recorre todo una vez, también con un atajo que vuelve', async () => {
    const mapa = await armarMapa({ id: 'raiz00000000' }, { cliente: driveFalso(ARBOL) });
    expect(mapa.nombre).toBe('Raíz');
    expect(mapa.nodos.map((n) => n.id).sort()).toEqual(['analisis000', 'anio1000000', 'atajo000000', 'clase000000', 'parcial0000', 'programa000']);
    expect(mapa.nodos.find((n) => n.id === 'programa000')).toMatchObject({ p: 'raiz00000000', s: 100, f: Date.parse('2025-03-01T00:00:00Z') });
    expect(mapa.nodos.find((n) => n.id === 'atajo000000')).toMatchObject({ c: 1, a: 'raiz00000000' });
    expect(sanearMapa(JSON.parse(JSON.stringify(mapa)))).toEqual(mapa);
  });

  it('un link de un archivo no arma nada', async () => {
    await expect(armarMapa({ id: 'programa000' }, { cliente: driveFalso(ARBOL) })).rejects.toThrow(/archivo/);
  });

  it('busca en los nombres, sin acentos, y en el camino', async () => {
    const indice = indiceDe(await armarMapa({ id: 'raiz00000000' }, { cliente: driveFalso(ARBOL) }));
    expect(buscarEnMapa(indice, 'analisis').map((n) => n.n)).toEqual(['Análisis Matemático I']);
    // «parcial» in the name, «análisis» in the folder it is in.
    expect(buscarEnMapa(indice, 'parcial analisis').map((n) => n.n)).toEqual(['Primer parcial 2024.pdf']);
    expect(buscarEnMapa(indice, 'programa', { valido: (n) => !n.c && n.id !== 'programa000' })).toEqual([]);
    expect(indice.ruta(indice.porId.get('parcial0000'))).toEqual(['1° AÑO', 'Análisis Matemático I']);
    expect(indice.tipos.get('raiz00000000')).toEqual({ pdf: 2, presentacion: 1 });
  });
});

describe('una carpeta de un link, de a un nivel', () => {
  it('trae solo lo de adentro, primero las carpetas y después por nombre', async () => {
    const { nodos, grande } = await contenidoDe({ id: 'raiz00000000' }, { cliente: driveFalso(ARBOL) });
    expect(grande).toBe(false);
    expect(nodos.length).toBeGreaterThan(1);
    expect(nodos.every((n) => n.p === 'raiz00000000')).toBe(true);
    const carpetas = nodos.filter((n) => n.c).length;
    expect(nodos.slice(0, carpetas).every((n) => n.c)).toBe(true);
    const archivos = nodos.slice(carpetas).map((n) => n.n);
    expect(archivos).toEqual([...archivos].sort((x, y) => x.localeCompare(y, 'es', { numeric: true, sensitivity: 'base' })));
  });

  it('una muy grande no se lista: pide uno más que el tope y avisa', async () => {
    const hijos = vi.fn(async (id, k, senal, tope) => Array.from({ length: tope }, (_, i) => ({ id: `archivo${String(i).padStart(5, '0')}`, name: `${i}.pdf`, mimeType: 'application/pdf' })));
    expect(await contenidoDe({ id: 'raiz00000000' }, { cliente: { hijos }, tope: 3 })).toEqual({ nodos: [], grande: true });
    expect(hijos).toHaveBeenCalledWith('raiz00000000', null, undefined, 4);
  });

  it('el cliente deja de pedir páginas al llegar al tope', async () => {
    const pagina = (n) => new Response(JSON.stringify({ files: Array.from({ length: n }, (_, i) => ({ id: `archivo${String(i).padStart(5, '0')}`, name: 'x' })), nextPageToken: 'otra' }));
    const pedir = vi.fn().mockResolvedValueOnce(pagina(3)).mockResolvedValueOnce(pagina(3));
    const hijos = await clienteDrivePublico({ clave: 'clave', pedir }).hijos('raiz00000000', null, undefined, 3);
    expect(hijos).toHaveLength(3);
    expect(pedir).toHaveBeenCalledTimes(1);
    expect(new URL(pedir.mock.calls[0][0]).searchParams.get('pageSize')).toBe('3');
  });
});

describe('el cliente de Drive', () => {
  it('manda la clave del sitio y la clave de recurso, y vuelve a probar si Google está apurado', async () => {
    const pedir = vi.fn()
      .mockResolvedValueOnce(new Response('{}', { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: ID, name: 'Carpeta', mimeType: CARPETA })));
    vi.useFakeTimers();
    const promesa = clienteDrivePublico({ clave: 'clave-de-prueba', pedir }).ficha(ID, 'k1');
    await vi.runAllTimersAsync();
    expect(await promesa).toMatchObject({ id: ID, nombre: 'Carpeta', carpeta: true });
    vi.useRealTimers();
    const [url, opciones] = pedir.mock.calls[1];
    expect(url).toContain('key=clave-de-prueba');
    expect(opciones.headers['X-Goog-Drive-Resource-Keys']).toBe(`${ID}/k1`);
  });

  it('la ficha de un archivo trae lo que hace falta para abrirlo', async () => {
    const pedir = async () => new Response(JSON.stringify({ id: ID, name: 'Apunte.pdf', mimeType: 'application/pdf', size: '900', modifiedTime: '2025-03-01T00:00:00Z' }));
    expect(await clienteDrivePublico({ clave: 'x', pedir }).ficha(ID)).toEqual({
      id: ID, nombre: 'Apunte.pdf', carpeta: false, nodo: { id: ID, n: 'Apunte.pdf', p: '', m: 'application/pdf', s: 900, f: Date.parse('2025-03-01T00:00:00Z') },
    });
  });

  it('una carpeta privada o que no existe se dice así', async () => {
    const pedir = async () => new Response(JSON.stringify({ error: { errors: [{ reason: 'notFound' }] } }), { status: 404 });
    await expect(clienteDrivePublico({ clave: 'x', pedir }).ficha(ID)).rejects.toThrow(/compartida/);
  });

  it('la clave rechazada no se confunde con una carpeta privada; un archivo que no está se dice como archivo', async () => {
    const bloqueada = async () => new Response(JSON.stringify({ error: { code: 403, message: 'Requests from referer http://otro/ are blocked.', errors: [{ reason: 'forbidden', message: 'Requests from referer http://otro/ are blocked.' }] } }), { status: 403 });
    await expect(clienteDrivePublico({ clave: 'x', pedir: bloqueada }).ficha(ID)).rejects.toThrow('Drive no está disponible en este momento.');
    const noEsta = async () => new Response(JSON.stringify({ error: { errors: [{ reason: 'notFound' }] } }), { status: 404 });
    await expect(clienteDrivePublico({ clave: 'x', pedir: noEsta }).bajar({ id: ID, m: 'application/pdf' })).rejects.toThrow(/archivo ya no está/);
    const privado = async () => new Response(JSON.stringify({ error: { errors: [{ reason: 'forbidden', message: 'The user does not have sufficient permissions for this file.' }] } }), { status: 403, headers: { 'content-type': 'application/json' } });
    await expect(clienteDrivePublico({ clave: 'x', pedir: privado }).bajar({ id: ID, m: 'application/pdf' })).rejects.toThrow(/archivo ya no está/);
    // Google's page for too much traffic: busy, not gone.
    const frenado = async () => new Response('<html><title>Sorry...</title></html>', { status: 403, headers: { 'content-type': 'text/html; charset=UTF-8' } });
    await expect(clienteDrivePublico({ clave: 'x', pedir: frenado }).bajar({ id: ID, m: 'application/pdf' })).rejects.toThrow(/ocupado/);
  });

  it('en el navegador, la página de Google por tráfico no se puede leer: si Drive igual contesta, se dice que frenó las descargas', async () => {
    vi.stubGlobal('navigator', { onLine: true });
    const pedir = async (url) => (url.includes('alt=media') ? Promise.reject(new TypeError('Failed to fetch')) : new Response(JSON.stringify({ id: ID })));
    await expect(clienteDrivePublico({ clave: 'x', pedir }).bajar({ id: ID, m: 'application/pdf' })).rejects.toThrow(/frenó por un rato las descargas/);
    // For a while the next ones don't wait for Google's page.
    const anda = vi.fn(async () => new Response('%PDF'));
    await expect(clienteDrivePublico({ clave: 'x', pedir: anda }).bajar({ id: ID, m: 'application/pdf' })).rejects.toThrow(/frenó/);
    expect(anda).not.toHaveBeenCalled();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 11 * 60 * 1000);
    expect((await clienteDrivePublico({ clave: 'x', pedir: anda }).bajar({ id: ID, m: 'application/pdf' })).size).toBe(4);
    // Without an answer to that either, it's the key.
    const nada = async () => Promise.reject(new TypeError('Failed to fetch'));
    await expect(clienteDrivePublico({ clave: 'x', pedir: nada }).bajar({ id: ID, m: 'application/pdf' })).rejects.toThrow('Drive no está disponible en este momento.');
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('una descarga que no empieza en 6 segundos, con Drive contestando, también es Google frenando', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 60 * 60 * 1000);
    const pedir = (url, { signal }) => (url.includes('alt=media')
      ? new Promise((_, mal) => signal.addEventListener('abort', () => mal(new DOMException('cortado', 'AbortError'))))
      : Promise.resolve(new Response(JSON.stringify({ id: ID }))));
    const promesa = clienteDrivePublico({ clave: 'x', pedir }).bajar({ id: ID, m: 'application/pdf' });
    const esperado = expect(promesa).rejects.toThrow(/frenó/);
    await vi.advanceTimersByTimeAsync(6000);
    await esperado;
    vi.useRealTimers();
  });

  it('sin clave no pide nada', async () => {
    const pedir = vi.fn();
    await expect(clienteDrivePublico({ clave: '', pedir }).ficha(ID)).rejects.toThrow(/disponible/);
    expect(pedir).not.toHaveBeenCalled();
  });
});

describe('lo que el alumno guarda de Drive', () => {
  it('solo ids y nombres, sin la carrera repetida ni basura', () => {
    const d = sanearDriveMio({ propios: [{ id: 'carpetaDeDriveA1', nombre: ' Física ', k: 'k-1' }, { id: 'carpetaDeDriveA1' }, { id: CARRERA.id }, { id: '<b>' }, null], sinCarrera: 'si', ocultos: ['carpetaDeDriveB2', 'x', 'carpetaDeDriveB2'] });
    expect(d).toEqual({ propios: [{ id: 'carpetaDeDriveA1', nombre: 'Física', k: 'k-1' }], sinCarrera: false, ocultos: ['carpetaDeDriveB2'] });
    expect(drivesDe(d).map((x) => x.id)).toEqual([CARRERA.id, 'carpetaDeDriveA1']);
    expect(drivesDe({ ...d, sinCarrera: true }).map((x) => x.id)).toEqual(['carpetaDeDriveA1']);
  });
});
