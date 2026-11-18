import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { codigoDeDireccion, leerResumen, leerResumenes } from './resumenes';

const SERVICIO = 'https://lomhlulbgfovtnljbqzp.supabase.co/functions/v1/utn';
const CODIGO = 'Abc_def-0123456789ABCDEFGHIJKLMN';
const LLAVE = 'llave_de_prueba-que-tiene-43-caracteres-xyz';
const OTRA_LLAVE = 'otra_llave-de-prueba-con-43-caracteres-abcd';
const ID = '0b6f2a8e-1c11-4d0a-9a51-2f6a8b1c0d01';
const fila = (extra = {}) => ({ id: ID, materia: 'sistemas-operativos', instancia: 'parcial-1', titulo: 'Resumen del 1° parcial', estado: 'publicado', tipo: 'pdf', me_gusta: 3, autor: 'santi', ...extra });

describe('el código del link', () => {
  it('lo toma solo en /resumenes y con la forma justa', () => {
    expect(codigoDeDireccion('/resumenes', `#vincular=${CODIGO}`)).toEqual({ codigo: CODIGO });
    expect(codigoDeDireccion('/resumenes/', `#vincular=${CODIGO}`)).toEqual({ codigo: CODIGO });
    expect(codigoDeDireccion('/base/resumenes', `#vincular=${CODIGO}`)).toEqual({ codigo: CODIGO });
  });

  it.each([
    ['corto', CODIGO.slice(1)],
    ['largo', `${CODIGO}x`],
    ['con un signo', `${CODIGO.slice(1)}=`],
    ['con algo más', `${CODIGO}&otra=1`],
    ['vacío', ''],
  ])('uno %s queda como inválido', (_, codigo) => {
    expect(codigoDeDireccion('/resumenes', `#vincular=${codigo}`)).toEqual({ invalido: true });
  });

  it('otra pantalla u otro ancla no son un link para vincular', () => {
    expect(codigoDeDireccion('/notas', `#vincular=${CODIGO}`)).toBeNull();
    expect(codigoDeDireccion('/resumenes', `#orden=${CODIGO}`)).toBeNull();
    expect(codigoDeDireccion('/resumenes', '')).toBeNull();
    expect(codigoDeDireccion(null, null)).toBeNull();
  });
});

describe('cada resumen que llega', () => {
  it('publicado, enlaza al banco con su materia y su id', () => {
    expect(leerResumen(fila())).toEqual({
      id: ID,
      titulo: 'Resumen del 1° parcial',
      materia: 'Sistemas Operativos',
      instancia: '1° parcial',
      formato: 'pdf',
      js: false,
      foto: null,
      estado: 'publicado',
      url: `https://lutastudios.com/utn/banco.html?materia=sistemas-operativos#r-${ID}`,
      marca: '',
      dato: 'Sistemas Operativos, 1° parcial, PDF',
    });
  });

  it.each([
    ['pendiente', 'En revisión', 'pendiente'],
    ['oculto', 'Oculto', 'oculto'],
    ['borrador', 'Sin publicar', 'otro'],
    [undefined, 'Sin publicar', 'otro'],
    ['constructor', 'Sin publicar', 'otro'],
  ])('en estado %s no lleva link y sí la marca «%s»', (estado, marca, cual) => {
    const r = leerResumen(fila({ estado }));
    expect(r.url).toBeNull();
    expect(r.marca).toBe(marca);
    expect(r.estado).toBe(cual);
  });

  it('trae la foto de su primera página solo si está publicado', () => {
    const foto = { url: `https://lomhlulbgfovtnljbqzp.supabase.co/storage/v1/object/public/fotos/${ID}/1-0123456789abcdef0123456789abcdef.webp`, ancho: 480, alto: 679 };
    expect(leerResumen(fila({ foto })).foto).toEqual(foto);
    expect(leerResumen(fila({ foto, estado: 'oculto' })).foto).toBeNull();
    expect(leerResumen(fila({ foto: { ...foto, url: 'https://example.com/x.webp' } })).foto).toBeNull();
  });

  it('dice el formato, y un HTML con scripts es interactivo', () => {
    expect(leerResumen(fila({ tipo: 'html', js: true })).dato).toBe('Sistemas Operativos, 1° parcial, HTML interactivo');
    expect(leerResumen(fila({ tipo: 'html' })).dato).toBe('Sistemas Operativos, 1° parcial, HTML');
    expect(leerResumen(fila({ tipo: 'pdf', js: true })).dato).toBe('Sistemas Operativos, 1° parcial, PDF');
    expect(leerResumen(fila({ tipo: 'google-slides', instancia: 'final' })).dato).toBe('Sistemas Operativos, Final, Google Slides');
    expect(leerResumen(fila({ tipo: 'docx', instancia: null })).dato).toBe('Sistemas Operativos, Word');
  });

  it('lo que no conoce no lo inventa', () => {
    const r = leerResumen(fila({ tipo: 'exe', instancia: 'constructor', materia: 'una-materia-nueva' }));
    expect(r).toMatchObject({ formato: '', materia: 'una-materia-nueva', dato: 'una-materia-nueva' });
  });

  it('el título va como texto, sin controles y cortado', () => {
    expect(leerResumen(fila({ titulo: ' Hola\u0000<b>mundo</b> ' })).titulo).toBe('Hola <b>mundo</b>');
    expect(leerResumen(fila({ titulo: 'a'.repeat(200) })).titulo).toHaveLength(120);
  });

  it.each([
    ['nada', null],
    ['un texto', 'hola'],
    ['un id que no es un uuid', fila({ id: '1' })],
    ['un id con algo más', fila({ id: `${ID}/../x` })],
    ['una materia con barras', fila({ materia: '../admin' })],
    ['una materia en mayúsculas', fila({ materia: 'Fisica' })],
    ['sin título', fila({ titulo: '   ' })],
    ['un título que no es texto', fila({ titulo: 7 })],
  ])('descarta %s', (_, r) => {
    expect(leerResumen(r)).toBeNull();
  });

  it('cada lista sin repetidos, hasta 300, y nada si no es una lista', () => {
    const muchos = Array.from({ length: 320 }, (_, i) => fila({ id: `0b6f2a8e-1c11-4d0a-9a51-${String(i).padStart(12, '0')}` }));
    const leido = leerResumenes({ usuario: ' santi\u0007 ', subidos: [fila(), fila(), fila({ id: 'mal' })], enviados: muchos });
    expect(leido.usuario).toBe('santi');
    expect(leido.subidos).toHaveLength(1);
    expect(leido.enviados).toHaveLength(300);
    expect(leerResumenes({ subidos: { a: fila() } })).toEqual({ usuario: '', subidos: [], enviados: [] });
    expect(leerResumenes(null)).toEqual({ usuario: '', subidos: [], enviados: [] });
  });
});

describe('hablar con El Santo Resumen', () => {
  let pedidos;
  let responder;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    pedidos = [];
    responder = () => ({ status: 500, cuerpo: { error: 'interno' } });
    vi.stubGlobal('fetch', vi.fn(async (url, opciones) => {
      pedidos.push({ url, hash: window.location.hash, ...opciones });
      const r = responder(url, opciones);
      if (r === 'sin-red') throw new TypeError('Failed to fetch');
      return new Response(r.status === 204 ? null : JSON.stringify(r.cuerpo), { status: r.status });
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function cargar(hash = `#vincular=${CODIGO}`, pathname = '/resumenes') {
    vi.resetModules();
    const m = await import('./resumenes');
    window.history.replaceState(null, '', `${pathname}?x=1${hash}`);
    return m;
  }

  const santi = () => ({ status: 201, cuerpo: { llave: LLAVE, usuario: 'santi' } });

  it('el código sale de la dirección antes de pedir nada y se canjea enseguida, sin sesión del campus', async () => {
    const m = await cargar();
    responder = santi;
    expect(m.tomarCodigoDeDireccion()).toBe(true);
    expect(window.location.hash).toBe('');
    expect(window.location.pathname + window.location.search).toBe('/resumenes?x=1');
    expect(pedidos).toHaveLength(1);
    expect(pedidos[0].hash).toBe('');
    expect(m.estadoCanje()).toMatchObject({ pendiente: { codigo: CODIGO }, canjeando: true });
    expect(m.hayVinculoEnCurso()).toBe(true);
    expect(localStorage.length + sessionStorage.length).toBe(0);
  });

  it('en otra pantalla no toca la dirección ni pide nada', async () => {
    const m = await cargar(`#vincular=${CODIGO}`, '/notas');
    expect(m.tomarCodigoDeDireccion()).toBe(false);
    expect(window.location.hash).toBe(`#vincular=${CODIGO}`);
    expect(m.estadoCanje().pendiente).toBeNull();
    expect(m.hayVinculoEnCurso()).toBe(false);
    expect(pedidos).toHaveLength(0);
  });

  it('canjea una sola vez, con el código en el cuerpo, y la llave espera en memoria hasta saber quién es el alumno', async () => {
    const m = await cargar();
    responder = santi;
    m.tomarCodigoDeDireccion();
    const [a, b] = await Promise.all([m.canjearPendiente(), m.canjearPendiente()]);
    expect(a).toEqual({ vinculado: 'santi' });
    expect(b).toBe(a);
    expect(pedidos).toHaveLength(1);
    expect(pedidos[0]).toMatchObject({ url: `${SERVICIO}?a=cvg-canjear`, method: 'POST', body: JSON.stringify({ codigo: CODIGO }), credentials: 'omit', referrerPolicy: 'no-referrer' });
    expect(pedidos[0].url).not.toContain(CODIGO);
    expect(m.estadoCanje()).toEqual({ pendiente: null, canjeando: false, falla: '', esperando: true, resultado: { vinculado: 'santi' } });
    expect(localStorage.length + sessionStorage.length).toBe(0);
    expect(await m.canjearPendiente()).toBeNull();
    expect(m.adoptarVinculo(0)).toBe(false);
    expect(localStorage.length).toBe(0);

    expect(m.adoptarVinculo(5)).toBe(true);
    expect(JSON.parse(localStorage.getItem('cl.santo.5'))).toEqual({ llave: LLAVE, usuario: 'santi' });
    expect(Object.keys(localStorage)).toEqual(['cl.santo.5']);
    expect(m.estadoCanje().esperando).toBe(false);
    expect(m.adoptarVinculo(6)).toBe(false);
    expect(m.leerVinculo(6)).toBeNull();
    expect(pedidos).toHaveLength(1);
  });

  it('si la pestaña se recarga antes de entrar al campus, la llave se pierde', async () => {
    const m = await cargar();
    responder = santi;
    m.tomarCodigoDeDireccion();
    await m.canjearPendiente();
    vi.resetModules();
    const otra = await import('./resumenes');
    expect(otra.hayVinculoEnCurso()).toBe(false);
    expect(otra.adoptarVinculo(5)).toBe(false);
    expect(localStorage.length + sessionStorage.length).toBe(0);
  });

  it('un link nuevo descarta la llave que esperaba del anterior', async () => {
    const m = await cargar();
    responder = santi;
    m.tomarCodigoDeDireccion();
    await m.canjearPendiente();
    responder = () => ({ status: 400, cuerpo: { error: 'codigo' } });
    window.history.replaceState(null, '', `/resumenes#vincular=${CODIGO.replace('A', 'B')}`);
    m.tomarCodigoDeDireccion();
    expect(await m.canjearPendiente()).toEqual({ vencido: true });
    expect(m.adoptarVinculo(5)).toBe(false);
    expect(localStorage.length).toBe(0);
  });

  it('un link vencido o usado no deja nada', async () => {
    const m = await cargar();
    responder = () => ({ status: 400, cuerpo: { error: 'codigo' } });
    m.tomarCodigoDeDireccion();
    expect(await m.canjearPendiente()).toEqual({ vencido: true });
    expect(m.estadoCanje()).toMatchObject({ pendiente: null, esperando: false, resultado: { vencido: true } });
    expect(m.adoptarVinculo(5)).toBe(false);
    expect(localStorage.length).toBe(0);
  });

  it('un código con otra forma ni se manda', async () => {
    const m = await cargar('#vincular=corto');
    m.tomarCodigoDeDireccion();
    expect(window.location.hash).toBe('');
    expect(await m.canjearPendiente()).toEqual({ vencido: true });
    expect(pedidos).toHaveLength(0);
  });

  it('sin internet, o sin respuesta, el código sigue esperando para probar de nuevo', async () => {
    const m = await cargar();
    responder = () => 'sin-red';
    m.tomarCodigoDeDireccion();
    await expect(m.canjearPendiente()).rejects.toThrow('No se pudo llegar a El Santo Resumen');
    responder = () => ({ status: 503, cuerpo: { error: 'no-disponible' } });
    await expect(m.canjearPendiente()).rejects.toThrow('no responde ahora');
    expect(m.estadoCanje().pendiente).toEqual({ codigo: CODIGO });
    responder = santi;
    expect(await m.canjearPendiente()).toEqual({ vinculado: 'santi' });
    expect(pedidos).toHaveLength(3);
    expect(m.adoptarVinculo(5)).toBe(true);
  });

  it.each([
    ['muchos intentos', { status: 429, cuerpo: { error: 'tope-ip' } }, 'muchos intentos'],
    ['sin conexión conocida', { status: 403, cuerpo: { error: 'sin-ip' } }, 'No se pudo vincular'],
    ['un pedido roto', { status: 400, cuerpo: { error: 'json' } }, 'No se pudo vincular'],
    ['una llave con otra forma', { status: 201, cuerpo: { llave: 'x y', usuario: 'santi' } }, 'No se pudo vincular'],
    ['sin usuario', { status: 201, cuerpo: { llave: LLAVE } }, 'No se pudo vincular'],
  ])('con %s avisa y el código se termina', async (_, respuesta, texto) => {
    const m = await cargar();
    responder = () => respuesta;
    m.tomarCodigoDeDireccion();
    await expect(m.canjearPendiente()).rejects.toThrow(texto);
    expect(m.estadoCanje()).toMatchObject({ pendiente: null, esperando: false });
    expect(m.adoptarVinculo(5)).toBe(false);
    expect(localStorage.length).toBe(0);
  });

  it('la pantalla ve cómo va: canjeando, una falla para reintentar, la llave que espera y cómo terminó', async () => {
    const m = await cargar();
    responder = () => 'sin-red';
    m.tomarCodigoDeDireccion();
    expect(m.estadoCanje()).toEqual({ pendiente: { codigo: CODIGO }, canjeando: true, falla: '', esperando: false, resultado: null });
    await m.canjearPendiente().catch(() => {});
    expect(m.estadoCanje()).toEqual({ pendiente: { codigo: CODIGO }, canjeando: false, falla: 'No se pudo llegar a El Santo Resumen. Revisá internet y probá de nuevo.', esperando: false, resultado: null });
    responder = santi;
    const intento = m.canjearPendiente();
    expect(m.estadoCanje()).toMatchObject({ canjeando: true, falla: '' });
    await intento;
    expect(m.estadoCanje()).toEqual({ pendiente: null, canjeando: false, falla: '', esperando: true, resultado: { vinculado: 'santi' } });
    m.adoptarVinculo(5);
    expect(m.estadoCanje()).toEqual({ pendiente: null, canjeando: false, falla: '', esperando: false, resultado: { vinculado: 'santi' } });
    expect(m.hayVinculoEnCurso()).toBe(true);
    m.olvidarResultado();
    expect(m.estadoCanje().resultado).toBeNull();
    expect(m.hayVinculoEnCurso()).toBe(false);
  });

  it('una respuesta que no sirve termina el código y queda como error', async () => {
    const m = await cargar();
    responder = () => ({ status: 429, cuerpo: { error: 'tope-ip' } });
    m.tomarCodigoDeDireccion();
    await m.canjearPendiente().catch(() => {});
    expect(m.estadoCanje()).toEqual({ pendiente: null, canjeando: false, falla: '', esperando: false, resultado: { error: m.TEXTOS.muchos } });
  });

  it('un link abierto en una pestaña que ya está en /resumenes también sale de la dirección antes de canjearse', async () => {
    const m = await cargar('');
    responder = santi;
    m.iniciarVinculo();
    expect(pedidos).toHaveLength(0);
    window.location.hash = `#vincular=${CODIGO}`;
    await vi.waitFor(() => expect(pedidos).toHaveLength(1));
    expect(pedidos[0].hash).toBe('');
    expect(window.location.hash).toBe('');
    await vi.waitFor(() => expect(m.estadoCanje().esperando).toBe(true));
  });

  it('vincular de nuevo anula la llave de antes, recién cuando la nueva queda guardada', async () => {
    const m = await cargar();
    m.guardarVinculo(5, { llave: OTRA_LLAVE, usuario: 'vieja' });
    responder = (url) => (url.endsWith('cvg-canjear') ? santi() : { status: 204 });
    m.tomarCodigoDeDireccion();
    await m.canjearPendiente();
    expect(pedidos).toHaveLength(1);
    expect(m.leerVinculo(5).llave).toBe(OTRA_LLAVE);
    m.adoptarVinculo(5);
    await vi.waitFor(() => expect(pedidos).toHaveLength(2));
    expect(pedidos[1]).toMatchObject({ url: `${SERVICIO}?a=cvg-desvincular`, method: 'POST' });
    expect(pedidos[1].headers['x-utn-llave']).toBe(OTRA_LLAVE);
    expect(m.leerVinculo(5).llave).toBe(LLAVE);
  });

  it('en la demo vincula con una cuenta de ejemplo, sin pedir nada afuera', async () => {
    const m = await cargar('');
    expect(m.vincularDemo(5)).toBe(true);
    expect(m.estadoCanje().resultado).toEqual({ vinculado: 'santi' });
    const { llave } = m.leerVinculo(5);
    const datos = await m.cargarResumenes(llave);
    expect(datos.subidos.map((r) => r.estado)).toEqual(['publicado', 'pendiente', 'oculto']);
    expect(datos.enviados).toHaveLength(2);
    await m.quitarResumen(llave, datos.enviados[0].id);
    expect((await m.cargarResumenes(llave)).enviados).toHaveLength(1);
    await m.desvincular(llave);
    expect(pedidos).toHaveLength(0);
  });

  it('pide la lista con la llave solo en la cabecera, sin caché', async () => {
    const m = await cargar('');
    responder = () => ({ status: 200, cuerpo: { usuario: 'santi', subidos: [fila({ estado: 'pendiente' })], enviados: [fila()] } });
    const datos = await m.cargarResumenes(LLAVE);
    expect(datos.subidos[0].marca).toBe('En revisión');
    expect(datos.enviados[0].url).toContain('#r-');
    expect(pedidos[0]).toMatchObject({ url: `${SERVICIO}?a=cvg-resumenes`, method: 'GET', cache: 'no-store', credentials: 'omit' });
    expect(pedidos[0].headers).toEqual({ 'x-utn-llave': LLAVE });
    expect(pedidos[0].body).toBeUndefined();
  });

  it('una llave que ya no existe corta el vínculo, y una cuenta bloqueada lo dice', async () => {
    const m = await cargar('');
    responder = () => ({ status: 401, cuerpo: { error: 'llave' } });
    await expect(m.cargarResumenes(LLAVE)).rejects.toMatchObject({ codigo: 'llave' });
    await expect(m.quitarResumen(LLAVE, ID)).rejects.toMatchObject({ codigo: 'llave' });
    responder = () => ({ status: 403, cuerpo: { error: 'bloqueada' } });
    await expect(m.cargarResumenes(LLAVE)).rejects.toMatchObject({ codigo: 'bloqueada', message: m.TEXTOS.bloqueada });
    responder = () => ({ status: 500, cuerpo: {} });
    await expect(m.cargarResumenes(LLAVE)).rejects.toThrow('no responde ahora');
    responder = () => ({ status: 200, cuerpo: 'hola' });
    await expect(m.cargarResumenes(LLAVE)).rejects.toThrow('no responde ahora');
  });

  it('una llave guardada con otra forma ni sale', async () => {
    const m = await cargar('');
    await expect(m.cargarResumenes('con espacios y más')).rejects.toMatchObject({ codigo: 'llave' });
    await expect(m.cargarResumenes(undefined)).rejects.toMatchObject({ codigo: 'llave' });
    expect(pedidos).toHaveLength(0);
  });

  it('quitar manda el id en el cuerpo y la llave en la cabecera', async () => {
    const m = await cargar('');
    responder = () => ({ status: 204 });
    await m.quitarResumen(LLAVE, ID);
    expect(pedidos[0]).toMatchObject({ url: `${SERVICIO}?a=cvg-quitar`, method: 'POST', body: JSON.stringify({ id: ID }) });
    expect(pedidos[0].headers).toEqual({ 'x-utn-llave': LLAVE, 'Content-Type': 'application/json' });
    await expect(m.quitarResumen(LLAVE, 'no-es-un-id')).rejects.toThrow();
    expect(pedidos).toHaveLength(1);
  });

  it('me gusta: el id y el sí en el cuerpo, la llave en la cabecera, y vuelve cuántos tiene', async () => {
    const m = await cargar('');
    responder = () => ({ status: 200, cuerpo: { me_gusta: 4, mio: true } });
    expect(await m.marcarMeGusta(LLAVE, ID, true)).toEqual({ meGusta: 4, mio: true });
    expect(pedidos[0]).toMatchObject({ url: `${SERVICIO}?a=cvg-me-gusta`, method: 'POST', body: JSON.stringify({ id: ID, si: true }), credentials: 'omit' });
    expect(pedidos[0].headers).toEqual({ 'x-utn-llave': LLAVE, 'Content-Type': 'application/json' });
    responder = () => ({ status: 200, cuerpo: { me_gusta: 'mucho', mio: 'si' } });
    expect(await m.marcarMeGusta(LLAVE, ID, false)).toEqual({ meGusta: 0, mio: false });
    responder = () => ({ status: 404, cuerpo: { error: 'no-existe' } });
    await expect(m.marcarMeGusta(LLAVE, ID, true)).rejects.toMatchObject({ codigo: 'no-existe', message: m.NO_ESTA_EN_BANCO });
    responder = () => ({ status: 401, cuerpo: { error: 'llave' } });
    await expect(m.marcarMeGusta(LLAVE, ID, true)).rejects.toMatchObject({ codigo: 'llave' });
    responder = () => ({ status: 403, cuerpo: { error: 'bloqueada' } });
    await expect(m.marcarMeGusta(LLAVE, ID, true)).rejects.toMatchObject({ codigo: 'bloqueada' });
    const antes = pedidos.length;
    await expect(m.marcarMeGusta(LLAVE, 'no-es-un-id', true)).rejects.toThrow();
    expect(pedidos).toHaveLength(antes);
  });

  it('los me gusta de la cuenta: solo ids que sirven, con la llave en la cabecera', async () => {
    const m = await cargar('');
    responder = () => ({ status: 200, cuerpo: { resumenes: [ID, 'nada', 3, ID] } });
    expect(await m.cargarGustos(LLAVE)).toEqual(new Set([ID]));
    expect(pedidos[0]).toMatchObject({ url: `${SERVICIO}?a=cvg-gustos`, method: 'GET' });
    expect(pedidos[0].headers).toEqual({ 'x-utn-llave': LLAVE });
    responder = () => ({ status: 200, cuerpo: {} });
    expect(await m.cargarGustos(LLAVE)).toEqual(new Set());
    responder = () => ({ status: 401, cuerpo: { error: 'llave' } });
    await expect(m.cargarGustos(LLAVE)).rejects.toMatchObject({ codigo: 'llave' });
  });

  it('desvincular sale bien también si la llave ya no existía, y si no responde avisa', async () => {
    const m = await cargar('');
    responder = () => ({ status: 204 });
    await m.desvincular(LLAVE);
    responder = () => ({ status: 401, cuerpo: { error: 'llave' } });
    await m.desvincular(LLAVE);
    expect(pedidos.map((p) => p.headers['x-utn-llave'])).toEqual([LLAVE, LLAVE]);
    responder = () => ({ status: 503, cuerpo: {} });
    await expect(m.desvincular(LLAVE)).rejects.toThrow('no responde ahora');
  });

  it('en el navegador queda solo la llave y el usuario, por alumno, y se borra solo si es la misma', async () => {
    const m = await cargar('');
    expect(m.guardarVinculo(5, { llave: LLAVE, usuario: 'santi' })).toBe(true);
    expect(m.guardarVinculo(null, { llave: LLAVE, usuario: 'santi' })).toBe(false);
    m.borrarVinculo(5, OTRA_LLAVE);
    expect(m.leerVinculo(5)).not.toBeNull();
    m.borrarVinculo(5, LLAVE);
    expect(m.leerVinculo(5)).toBeNull();
    localStorage.setItem('cl.santo.7', '{"llave":"x","usuario":"a"}');
    localStorage.setItem('cl.santo.8', 'no es json');
    expect(m.leerVinculo(7)).toBeNull();
    expect(m.leerVinculo(8)).toBeNull();
  });
});
