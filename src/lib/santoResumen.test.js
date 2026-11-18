import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  esTroncal,
  buscarEnBanco, buscarOficial, cargarBanco, cargarConsejos, cargarIndice, consejoComoNota, leerBanco, leerConsejos, leerFoto, leerIndice,
  leerTextos, MATERIAS_SANTO, olvidarSanto, paginasDe, partesDe, resumenDe, SERVICIO, sumarANota,
} from './santoResumen';

const slug = (nombre) => resumenDe(nombre)?.url.replace('https://lutastudios.com/utn/', '').replace(/\/$/, '') ?? null;

describe('el texto de los resúmenes, para Consultron', () => {
  it('solo los de id válido y con texto, recortados', () => {
    const id = '0b6f2a8e-1c11-4d0a-9a51-2f6a8b1c0d01';
    const datos = { textos: [{ id, texto: ' Vida del autor + 70 años. ' }, { id: 'x', texto: 'id roto' }, { id, texto: '   ' }, { id, texto: 5 }, null] };
    expect(leerTextos(datos)).toEqual([{ id, texto: 'Vida del autor + 70 años.' }]);
    expect(leerTextos({ textos: [{ id, texto: 'a'.repeat(60_000) }] })[0].texto).toHaveLength(50_000);
    expect(leerTextos(null)).toEqual([]);
    expect(leerTextos({ textos: 'no' })).toEqual([]);
  });
});

describe('resumenDe', () => {
  it.each([
    ['Física I', 'fisica-i'],
    ['Física II', 'fisica-ii'],
    ['FISICA 2 - 2026', 'fisica-ii'],
    ['Análisis Matemático I - Comisión 1K1', 'analisis-matematico-i'],
    ['Análisis Matemático II', 'analisis-matematico-ii'],
    ['Probabilidad y Estadística - (Todas las carreras)', 'probabilidad-y-estadistica'],
    ['LEGISLACION 2026 UTN FRRo', 'legislacion'],
    ['Diseño de Sistemas de Información', 'diseno-de-sistemas-de-informacion'],
    ['Análisis de Sistemas de Información', 'analisis-de-sistemas-de-informacion'],
    ['Inglés II', 'ingles-ii'],
    ['Sistemas Operativos 3K2', 'sistemas-operativos'],
  ])('%s', (nombre, esperado) => {
    expect(slug(nombre)).toBe(esperado);
  });

  it('sin una materia que coincida en todas sus palabras, no hay link', () => {
    for (const n of ['Materia de ejemplo A', 'Gestión de Datos', 'Física', 'Análisis Matemático', '', 'General']) expect(resumenDe(n)).toBeNull();
  });

  it('cada materia de la lista se encuentra con su propio nombre', () => {
    for (const [s, nombre] of MATERIAS_SANTO) expect(slug(nombre)).toBe(s);
  });

  it('el link va siempre a El Santo Resumen, con el nombre de la materia', () => {
    expect(resumenDe('Simulación')).toEqual({ url: 'https://lutastudios.com/utn/simulacion/', nombre: 'Simulación', slug: 'simulacion' });
  });
});

const ID_A = '11111111-2222-4333-8444-555555555555';
const ID_B = '22222222-3333-4444-8555-666666666666';

const INDICE_CRUDO = [
  { s: 'bases-de-datos', n: 'Bases de Datos', e: [
    ['index.html', 'Para entender', 'que-se-toma', 'Qué se toma', 'Contamos los temas de los finales.'],
    ['index.html', 'Para entender', 'paso-1', 'Paso 1: entender qué hay', 'Antes de tocar una computadora dibujás el DER.'],
    ['parcial-1.html', '1° parcial', 'normalizacion', 'Normalización', 'La tercera forma normal saca las dependencias transitivas.'],
    ['ej-jusenkyo.html', 'Ejercicios', 'enunciado', 'Jusenkyo Onsen Resort', 'Un hotel con aguas termales.'],
    ['ej-musicfest.html', 'Ejercicios', 'enunciado', 'MusicFest S.A.', 'Un festival.'],
    ['../afuera.html', 'Mala', 'x', 'Página rara', ''],
    ['parcial-2.html', '2° parcial', 'Ancla"rara', 'Ancla rara', ''],
    ['parcial-2.html', '2° parcial', 'sin-titulo', '', 'texto'],
  ] },
  { s: 'fisica-i', n: 'Física I', e: [['final.html', 'Final', 'cinematica', 'Cinemática', 'Movimiento rectilíneo y normalización de vectores.']] },
  { s: '../mal', n: 'Mal', e: [['index.html', 'x', 'x', 'x', 'x']] },
  null,
];

describe('índice de los apuntes oficiales', () => {
  const indice = leerIndice(INDICE_CRUDO);

  it('solo pasa lo que tiene la forma de El Santo Resumen', () => {
    expect(indice.map((m) => m.slug)).toEqual(['bases-de-datos', 'fisica-i']);
    expect(indice[0].entradas.map((e) => e.ancla)).toEqual(['que-se-toma', 'paso-1', 'normalizacion', 'enunciado', 'enunciado']);
    expect(leerIndice({ no: 'es una lista' })).toEqual([]);
  });

  it('sin buscar, una materia muestra sus páginas y aparte sus ejercicios, cada uno por su nombre', () => {
    const grupos = paginasDe(indice, 'bases-de-datos');
    expect(grupos.map((g) => g.nombre)).toEqual(['Apuntes', 'Ejercicios']);
    expect(grupos[0].items).toEqual([
      { url: 'https://lutastudios.com/utn/bases-de-datos/', titulo: 'Para entender de Bases de Datos', nombre: 'Para entender', dato: '2 temas' },
      { url: 'https://lutastudios.com/utn/bases-de-datos/parcial-1.html', titulo: '1° parcial de Bases de Datos', nombre: '1° parcial', dato: 'Un tema' },
    ]);
    expect(grupos[1].items.map((i) => [i.nombre, i.url])).toEqual([
      ['Jusenkyo Onsen Resort', 'https://lutastudios.com/utn/bases-de-datos/ej-jusenkyo.html'],
      ['MusicFest S.A.', 'https://lutastudios.com/utn/bases-de-datos/ej-musicfest.html'],
    ]);
    expect(paginasDe(indice, 'no-existe')).toEqual([]);
  });

  it('busca sin tildes ni mayúsculas, en la materia o en todas, con el lugar exacto', () => {
    const enBd = buscarOficial(indice, 'NORMALIZACION', 'bases-de-datos');
    expect(enBd).toHaveLength(1);
    expect(enBd[0]).toMatchObject({ url: 'https://lutastudios.com/utn/bases-de-datos/parcial-1.html#normalizacion', titulo: 'Normalización', dato: '1° parcial' });
    expect(buscarOficial(indice, 'normalizacion').map((r) => r.dato)).toEqual(['Bases de Datos, 1° parcial', 'Física I, Final']);
    expect(buscarOficial(indice, 'cinematica transitivas')).toEqual([]);
    expect(buscarOficial(indice, '   ')).toEqual([]);
  });

  it('el trozo muestra el texto alrededor de lo encontrado', () => {
    expect(buscarOficial(indice, 'transitivas', 'bases-de-datos')[0].trozo).toContain('dependencias transitivas');
  });
});

describe('banco de resúmenes', () => {
  it('solo pasan los publicados con forma válida, y el link va al banco', () => {
    const banco = leerBanco({ resumenes: [
      { id: ID_A, materia: 'bases-de-datos', instancia: 'parcial-1', titulo: 'Resumen\u0007del 1°', me_gusta: 3, autor: 'santi', tipo: 'html', js: true },
      { id: ID_B, materia: 'fisica-i', instancia: 'final', titulo: 'Final', me_gusta: 1, tipo: 'exe', js: true },
      { id: 'no-es-un-id', materia: 'bases-de-datos', titulo: 'Malo' },
      { id: ID_A, materia: '../x', titulo: 'Malo' },
      { id: ID_B, materia: 'fisica-i', titulo: '' },
    ] });
    expect(banco).toEqual([
      {
        id: ID_A, url: `https://lutastudios.com/utn/banco.html?materia=bases-de-datos#r-${ID_A}`, titulo: 'Resumen del 1°', nombre: 'Resumen del 1°', materia: 'bases-de-datos',
        materiaNombre: 'Bases de Datos', instancia: '1° parcial', formato: 'html', js: true, foto: null, meGusta: 3, autor: 'santi', dato: '1° parcial, 3 me gusta, de santi',
      },
      {
        id: ID_B, url: `https://lutastudios.com/utn/banco.html?materia=fisica-i#r-${ID_B}`, titulo: 'Final', nombre: 'Final', materia: 'fisica-i',
        materiaNombre: 'Física I', instancia: 'Final', formato: '', js: false, foto: null, meGusta: 1, autor: '', dato: 'Final, un me gusta',
      },
    ]);
    expect(leerBanco(null)).toEqual([]);
  });

  it('el fragmento marca lo encontrado y nunca arma HTML', () => {
    expect(partesDe('la \u0002tercera\u0003 forma <b>normal</b>')).toEqual([
      { texto: 'la ', marca: false },
      { texto: 'tercera', marca: true },
      { texto: ' forma <b>normal</b>', marca: false },
    ]);
    expect(partesDe(null)).toEqual([]);
  });
});

describe('consejos', () => {
  it('pasan con su texto en varias líneas, sin controles', () => {
    expect(leerConsejos({ consejos: [
      { id: ID_A, usuario: 'ana', texto: 'Hacé los TP.\r\nTodos.\u0000', n: 2, prom: 4.5 },
      { id: ID_B, texto: 'Sin votos', n: 0, prom: null },
      { id: 'x', texto: 'Malo' },
    ] })).toEqual([
      { id: ID_A, usuario: 'ana', texto: 'Hacé los TP.\nTodos.', prom: 4.5, votos: 2 },
      { id: ID_B, usuario: 'alguien', texto: 'Sin votos', prom: null, votos: 0 },
    ]);
  });

  it('se suman al final de las anotaciones, de quién y de dónde, hasta donde entra', () => {
    const c = { usuario: 'ana', texto: 'Hacé los TP.' };
    expect(consejoComoNota(c)).toBe('Consejo de ana en El Santo Resumen:\nHacé los TP.');
    expect(sumarANota('', [c], 1000)).toEqual({ texto: consejoComoNota(c), entraron: 1 });
    expect(sumarANota('Mis cosas\n\n', [c, c], 1000).texto).toBe(`Mis cosas\n\n${consejoComoNota(c)}\n\n${consejoComoNota(c)}`);
    expect(sumarANota('Mis cosas', [c, c], 70)).toEqual({ texto: `Mis cosas\n\n${consejoComoNota(c)}`, entraron: 1 });
    expect(sumarANota('x'.repeat(50), [c], 60)).toEqual({ texto: 'x'.repeat(50), entraron: 0 });
  });
});

describe('pedidos a El Santo Resumen', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    olvidarSanto();
  });
  const responder = (cuerpos) => {
    const pedidos = [];
    vi.stubGlobal('fetch', vi.fn(async (url, opciones = {}) => {
      pedidos.push({ url, ...opciones });
      const cuerpo = cuerpos(url, opciones);
      if (cuerpo instanceof Error) throw cuerpo;
      return { ok: cuerpo !== null, json: async () => cuerpo };
    }));
    return pedidos;
  };

  it('el índice se baja una vez por pestaña, sin cookies ni de dónde viene', async () => {
    const pedidos = responder(() => INDICE_CRUDO);
    await cargarIndice();
    await cargarIndice();
    expect(pedidos).toHaveLength(1);
    expect(pedidos[0]).toMatchObject({ url: 'https://lutastudios.com/utn/_/indice-carrera.json', credentials: 'omit', referrerPolicy: 'no-referrer' });
  });

  it('si falla, lo dice en castellano y el siguiente intento vuelve a pedir', async () => {
    let vuelta = 0;
    const pedidos = responder(() => (vuelta++ ? { consejos: [] } : null));
    await expect(cargarConsejos('fisica-i')).rejects.toMatchObject({ conocido: true, message: 'El Santo Resumen no responde ahora. Probá de nuevo en un rato.' });
    await expect(cargarConsejos('fisica-i')).resolves.toEqual([]);
    expect(pedidos.map((p) => p.url)).toEqual([`${SERVICIO}?a=consejos&materia=fisica-i`, `${SERVICIO}?a=consejos&materia=fisica-i`]);
    responder(() => new TypeError('Failed to fetch'));
    await expect(cargarBanco('fisica-i')).rejects.toMatchObject({ conocido: true, message: 'No se pudo llegar a El Santo Resumen. Revisá internet y probá de nuevo.' });
  });

  it('buscar en el banco manda las palabras en el cuerpo, nunca en la dirección', async () => {
    const pedidos = responder((url) => (url.includes('a=buscar')
      ? { resultados: [{ id: ID_B, fragmento: null }, { id: ID_A, fragmento: 'la \u0002tercera\u0003' }, { id: '33333333-3333-4333-8333-333333333333' }] }
      : { resumenes: [{ id: ID_A, materia: 'bases-de-datos', instancia: 'parcial-1', titulo: 'Uno' }, { id: ID_B, materia: 'bases-de-datos', instancia: 'final', titulo: 'Dos' }] }));
    const hallados = await buscarEnBanco('  tercera forma  ', 'bases-de-datos');
    expect(hallados.map((h) => h.titulo)).toEqual(['Dos', 'Uno']);
    expect(hallados[1].partes).toEqual([{ texto: 'la ', marca: false }, { texto: 'tercera', marca: true }]);
    const busqueda = pedidos.find((p) => p.url.includes('a=buscar'));
    expect(busqueda.url).toBe(`${SERVICIO}?a=buscar`);
    expect(busqueda.method).toBe('POST');
    expect(JSON.parse(busqueda.body)).toEqual({ q: 'tercera forma', materia: 'bases-de-datos' });
    expect(await buscarEnBanco('x')).toEqual([]);
  });
});

describe('la foto de la primera página', () => {
  const FOTOS = 'https://lomhlulbgfovtnljbqzp.supabase.co/storage/v1/object/public/fotos/';
  const NOMBRE = `${ID_A}/3-0123456789abcdef0123456789abcdef.webp`;

  it('pasa solo la del lugar de las fotos de El Santo Resumen, con su nombre y medidas que el servicio acepta', () => {
    expect(leerFoto({ url: FOTOS + NOMBRE, ancho: 480, alto: 679 })).toEqual({ url: FOTOS + NOMBRE, ancho: 480, alto: 679 });
    expect(leerFoto({ url: FOTOS + NOMBRE.replace('.webp', '.jpg'), ancho: 200, alto: 1600, otro: 1 })).toEqual({ url: FOTOS + NOMBRE.replace('.webp', '.jpg'), ancho: 200, alto: 1600 });
    const malas = [
      { url: FOTOS.replace('https', 'http') + NOMBRE },
      { url: `https://otro.supabase.co/storage/v1/object/public/fotos/${NOMBRE}` },
      { url: `${FOTOS.replace('/fotos/', '/resumenes/')}${NOMBRE}` },
      { url: `${FOTOS}../resumenes/${NOMBRE}` },
      { url: `${FOTOS}${NOMBRE}?x=1` },
      { url: `${FOTOS}${NOMBRE.replace('.webp', '.svg')}` },
      { url: `${FOTOS}${ID_A}/x-0123456789abcdef0123456789abcdef.webp` },
      { url: `javascript:alert(1)//${FOTOS}${NOMBRE}` },
      { url: FOTOS + NOMBRE, ancho: 480.5 },
      { url: FOTOS + NOMBRE, ancho: 199 },
      { url: FOTOS + NOMBRE, alto: 1601 },
      { url: FOTOS + NOMBRE, ancho: '480' },
    ].map((f) => leerFoto({ ancho: 480, alto: 679, ...f }));
    expect(malas).toEqual(malas.map(() => null));
    expect([null, 'x', {}, { url: 7 }].map(leerFoto)).toEqual([null, null, null, null]);
  });

  it('la del tema oscuro, solo si es otra foto del mismo lugar', () => {
    const oscura = FOTOS + NOMBRE.replace(/-[0-9a-f]{32}\./, `-${'b'.repeat(32)}.`);
    expect(leerFoto({ url: FOTOS + NOMBRE, ancho: 480, alto: 679, oscura })).toEqual({ url: FOTOS + NOMBRE, ancho: 480, alto: 679, oscura });
    for (const mala of [`https://otro.supabase.co/storage/v1/object/public/fotos/${NOMBRE}`, FOTOS + '../x.webp', FOTOS + NOMBRE, 7, null]) {
      expect(leerFoto({ url: FOTOS + NOMBRE, ancho: 480, alto: 679, oscura: mala })).toEqual({ url: FOTOS + NOMBRE, ancho: 480, alto: 679 });
    }
  });

  it('el banco la trae en cada resumen que la tiene', () => {
    const [con, sin] = leerBanco({ resumenes: [
      { id: ID_A, materia: 'bases-de-datos', titulo: 'Con foto', foto: { url: FOTOS + NOMBRE, ancho: 480, alto: 679 } },
      { id: ID_B, materia: 'bases-de-datos', titulo: 'Sin foto', foto: { url: 'https://example.com/x.webp', ancho: 480, alto: 679 } },
    ] });
    expect(con.foto).toEqual({ url: FOTOS + NOMBRE, ancho: 480, alto: 679 });
    expect(sin.foto).toBeNull();
  });
});

describe('las materias del plan, según El Santo Resumen', () => {
  it('las de primero a quinto y Proyecto Final son troncales; el resto, electivas', () => {
    for (const n of ['Ciencia de Datos', 'Gestión Gerencial', 'Inteligencia Artificial', 'Proyecto Final', 'Sistemas de Gestión', 'Análisis Matemático I', 'Inglés II']) expect(esTroncal(n), n).toBe(true);
    for (const n of ['Informática en la Administración Pública', 'Práctica Profesional Supervisada', 'Sistemas de Información Integrados para', 'Algoritmos Genéticos (Elec.)', 'Seminario Integrador', 'Compl.de equiv. de Análisis Matemático I']) expect(esTroncal(n), n).toBe(false);
  });

  it('una troncal que Sysacad cortó sigue siendo troncal', () => {
    expect(esTroncal('Administración de Sistemas de Informació')).toBe(true);
    expect(esTroncal('Seguridad en los Sistemas de Informació')).toBe(true);
  });
});
