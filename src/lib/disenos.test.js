import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SITIO } from '../../sitio.config.js';
import { ajustesActuales, ajustesQueSeVen, cambiarAjustes, normalizar, volverAjustesOriginales } from './ajustes';
import { codigoDeEstilo, leerCodigoDeEstilo } from './codigoDeEstilo';
import { reiniciarDemoDisenos } from './demoDisenos';
import { TOKEN_DEMO } from './modoDemo';
import { cerrarSesion, iniciarSesion } from './sesion';
import {
  ajustesDeCodigo, borrarComentario, cargarComentarios, cargarDisenos, CLAVE_ANTES, comentarDiseno, denunciar, DISENOS, dibujoDe, disenoSigue, leerComentario,
  leerDiseno, leerLista, olvidarDisenoEnUso, pantallasALaVista, probarDiseno, problemaDeTexto, publicarDiseno, resumenDeDiseno, terminarPrueba, usarDiseno, verDiseno, volverAlTuyo,
  votarDiseno,
} from './disenos';
import { disenoEnPrueba } from './enPrueba';
import { fijarUsuario, mioActual, sanearMio } from './mio';

const ID = '0f8e2b1c-3d4a-4b5c-8d6e-7f8091a2b3c4';
const LLAVE = 'demo-de-super-cvg-0000';
const MIO = sanearMio({});
const CODIGO = codigoDeEstilo(normalizar({ estilo: 'plano', tema: 'cosmico', potente: true, accion: '#7a3fb0' }), MIO);
const crudo = (extra = {}) => ({ id: ID, nombre: 'Noche', descripcion: 'Violeta.', codigo: CODIGO, autor: 'meli', estrellas: 4.33, votos: 3, comentarios: 2, creado: '2026-11-20T10:00:00Z', mio: false, mi_voto: null, ...extra });

describe('lo que vuelve del servicio', () => {
  it('un diseño bien formado, con sus ajustes leídos del código', () => {
    const d = leerDiseno(crudo());
    expect(d).toMatchObject({ id: ID, nombre: 'Noche', autor: 'meli', estrellas: 4.3, votos: 3, comentarios: 2, mio: false, miVoto: null });
    expect([d.ajustes.estilo, d.ajustes.tema, d.ajustes.potente, d.ajustes.accion]).toEqual(['plano', 'cosmico', true, '#7a3fb0']);
  });

  it('sin un código que se lea, o sin id o nombre, no aparece', () => {
    for (const malo of [crudo({ codigo: 'CVG-AAAAA-BBBBB' }), crudo({ codigo: 42 }), crudo({ id: 'x' }), crudo({ nombre: '' }), crudo({ nombre: '<b>Noche</b>' }), crudo({ nombre: 'a'.repeat(41) }), null, 'x']) {
      expect(leerDiseno(malo)).toBeNull();
    }
  });

  it('lo raro se descarta: HTML en la descripción, números fuera de rango, un autor con HTML', () => {
    const d = leerDiseno(crudo({ descripcion: '<img src=x onerror=alert(1)>', estrellas: 9, votos: -2, comentarios: 'mil', autor: '<script>', mi_voto: 7, creado: 'ayer' }));
    expect(d).toMatchObject({ descripcion: '', estrellas: null, votos: 0, comentarios: 0, autor: 'Alguien', miVoto: null, creado: null });
  });

  it('oculto solo cuenta para lo propio', () => {
    expect(leerDiseno(crudo({ oculto: true })).oculto).toBe(false);
    expect(leerDiseno(crudo({ oculto: true, mio: true })).oculto).toBe(true);
  });

  it('una lista sin repetidos y con un tope', () => {
    const r = leerLista({ disenos: [crudo(), crudo(), ...Array.from({ length: 100 }, () => crudo({ id: crypto.randomUUID() }))], mas: true });
    expect(r.disenos.length).toBe(59);
    expect(r.mas).toBe(true);
    expect(leerLista(null)).toEqual({ disenos: [], mas: false, siguiente: 0 });
  });

  it('la página siguiente se cuenta como el servicio, también con filas que no pasan', () => {
    const r = leerLista({ disenos: [crudo(), crudo({ id: 'no' }), crudo({ id: crypto.randomUUID(), nombre: '<b>' })], mas: true }, 24);
    expect(r.disenos).toHaveLength(1);
    expect(r.siguiente).toBe(27);
  });

  it('un comentario es texto, con sus renglones', () => {
    expect(leerComentario({ id: ID, texto: 'Hola\r\n\r\n\r\nchau', autor: 'juli', creado: '2026-11-20T10:00:00Z', mio: true })).toMatchObject({ texto: 'Hola\n\nchau', autor: 'juli', mio: true });
    expect(leerComentario({ id: ID, texto: '<a href=x>hola</a>' })).toBeNull();
    expect(leerComentario({ id: ID, texto: 'a'.repeat(501) })).toBeNull();
  });
});

describe('textos antes de mandar', () => {
  it('vacío, largo o con < y >', () => {
    expect(problemaDeTexto('  ', { max: 40 })).toBe('vacio');
    expect(problemaDeTexto('', { max: 40, obligatorio: false })).toBe('');
    expect(problemaDeTexto('a'.repeat(41), { max: 40 })).toBe('largo');
    expect(problemaDeTexto('😀'.repeat(40), { max: 40 })).toBe('');
    expect(problemaDeTexto('a < b', { max: 40 })).toBe('html');
  });
});

describe('con el servicio de ejemplo (/?demo=1)', () => {
  beforeEach(() => {
    reiniciarDemoDisenos();
    iniciarSesion(TOKEN_DEMO);
  });
  afterEach(() => cerrarSesion());

  it('lista los ejemplos, mejores primero, y busca por nombre', async () => {
    const { disenos } = await cargarDisenos({ orden: 'mejores' });
    expect(disenos.length).toBeGreaterThan(5);
    expect(disenos[0].nombre).toBe('Noche cósmica');
    const nuevos = await cargarDisenos({ orden: 'nuevos' });
    expect(nuevos.disenos[0].nombre).toBe('Bosque tranquilo');
    expect((await cargarDisenos({ buscar: 'HOJA' })).disenos.map((d) => d.nombre)).toEqual(['Hoja de carpeta']);
  });

  it('sin cuenta no publica, vota ni comenta', async () => {
    const { disenos } = await cargarDisenos();
    await expect(publicarDiseno(null, { nombre: 'Mío', ajustes: normalizar({}), mio: MIO })).rejects.toMatchObject({ motivo: 'llave' });
    await expect(votarDiseno(null, disenos[0].id, 5)).rejects.toMatchObject({ motivo: 'llave' });
    await expect(comentarDiseno(null, disenos[0].id, 'Hola')).rejects.toMatchObject({ motivo: 'llave' });
  });

  it('un diseño publicado lleva los filtros del fondo, y usarlo los pone', async () => {
    const filtros = { fondoFiltro: 'suave', fondoIntensidad: 80, fondoTono: 150, fondoDesenfoque: 25 };
    await publicarDiseno(LLAVE, { nombre: 'Con filtros', ajustes: normalizar({ estilo: 'plano', ...filtros }), mio: MIO });
    const d = (await cargarDisenos({ orden: 'nuevos', llave: LLAVE })).disenos.find((x) => x.nombre === 'Con filtros');
    expect(ajustesDeCodigo(d.codigo)).toMatchObject(filtros);
    volverAjustesOriginales();
    fijarUsuario(4242);
    window.aplicarAjustes = vi.fn();
    expect(usarDiseno(d, { ajustes: ajustesActuales(), mio: MIO })).toBe(true);
    expect(ajustesActuales()).toMatchObject({ estilo: 'plano', ...filtros });
    fijarUsuario(null);
  });

  it('publica, puntúa, comenta, borra y denuncia como la función', async () => {
    const id = await publicarDiseno(LLAVE, { nombre: ' Mi estilo ', descripcion: 'Probando.', ajustes: normalizar({ estilo: 'hoja' }), mio: MIO });
    const mios = (await cargarDisenos({ orden: 'nuevos', llave: LLAVE })).disenos;
    expect(mios[0]).toMatchObject({ id, nombre: 'Mi estilo', autor: 'santi', mio: true });
    await expect(publicarDiseno(LLAVE, { nombre: 'Otra vez', ajustes: normalizar({ estilo: 'hoja' }), mio: MIO })).rejects.toThrow('Ya publicaste este mismo estilo.');
    await expect(votarDiseno(LLAVE, id, 5)).rejects.toThrow('Tu propio diseño no se puntúa.');
    await expect(denunciar(LLAVE, 'diseno', id)).rejects.toThrow('Lo tuyo no se denuncia.');

    const otro = mios.find((d) => d.nombre === 'Batiseñal');
    expect(await votarDiseno(LLAVE, otro.id, 5)).toEqual({ votos: 3, estrellas: 4, miVoto: 5 });
    expect((await votarDiseno(LLAVE, otro.id, 2)).votos).toBe(3);
    const c = await comentarDiseno(LLAVE, otro.id, 'Muy bueno.\nLo uso.');
    expect(c).toMatchObject({ texto: 'Muy bueno.\nLo uso.', autor: 'santi', mio: true });
    expect((await cargarComentarios(otro.id, LLAVE)).at(-1)).toMatchObject({ id: c.id, mio: true });
    await borrarComentario(LLAVE, c.id);
    expect(await cargarComentarios(otro.id)).toEqual([]);
    await denunciar(LLAVE, 'diseno', otro.id);
    await borrarDiseno_(id);
  });

  it('lo que no se puede mandar no sale', async () => {
    await expect(comentarDiseno(LLAVE, ID, '<b>hola</b>')).rejects.toMatchObject({ motivo: 'invalido' });
    await expect(votarDiseno(LLAVE, ID, 6)).rejects.toMatchObject({ motivo: 'invalido' });
    await expect(publicarDiseno(LLAVE, { nombre: 'a'.repeat(41), ajustes: normalizar({}), mio: MIO })).rejects.toMatchObject({ motivo: 'invalido' });
  });
});

async function borrarDiseno_(id) {
  const { borrarDiseno } = await import('./disenos');
  await borrarDiseno(LLAVE, id);
  expect((await cargarDisenos({ llave: LLAVE })).disenos.some((d) => d.id === id)).toBe(false);
}

describe('npm run dev con una cuenta de verdad', () => {
  afterEach(() => {
    cerrarSesion();
    vi.unstubAllGlobals();
  });

  it('pide a la función de verdad, sin diseños de ejemplo', async () => {
    iniciarSesion('una-clave-de-verdad');
    const fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true, disenos: [], mas: false }), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    const r = await cargarDisenos({ orden: 'mejores' }, { origen: 'http://localhost:5330' });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(r.disenos).toEqual([]);
  });
});

describe('con la función de verdad (el sitio publicado)', () => {
  const origen = SITIO.url;
  afterEach(() => vi.unstubAllGlobals());

  it('la llave va solo en la cabecera, nunca en la dirección ni en el cuerpo', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true, disenos: [crudo()], mas: false }), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    const r = await cargarDisenos({ orden: 'nuevos', buscar: '  noche ', llave: LLAVE }, { origen });
    expect(r.disenos).toHaveLength(1);
    const [url, op] = fetch.mock.calls[0];
    expect(url).toBe(DISENOS);
    expect(op.headers['x-utn-llave']).toBe(LLAVE);
    expect(op.body).not.toContain(LLAVE);
    expect(JSON.parse(op.body)).toEqual({ a: 'lista', orden: 'nuevos', buscar: 'noche', desde: 0 });
    expect(op).toMatchObject({ method: 'POST', credentials: 'omit', referrerPolicy: 'no-referrer' });
  });

  it('sin llave no manda la cabecera', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true, disenos: [], mas: false }), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    await cargarDisenos({}, { origen });
    expect(fetch.mock.calls[0][1].headers).not.toHaveProperty('x-utn-llave');
  });

  it('cada motivo con su texto, y lo desconocido como error', async () => {
    const con = (status, cuerpo) => vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(cuerpo), { status })));
    con(429, { ok: false, motivo: 'tope' });
    await expect(publicarDiseno(LLAVE, { nombre: 'Uno', ajustes: normalizar({}), mio: MIO }, { origen })).rejects.toThrow('Ya tenés 20 diseños publicados. Borrá uno para publicar otro.');
    con(429, { ok: false, motivo: 'seguido' });
    await expect(publicarDiseno(LLAVE, { nombre: 'Uno', ajustes: normalizar({}), mio: MIO }, { origen })).rejects.toThrow('Ya publicaste 5 estilos hoy. Probá mañana.');
    await expect(votarDiseno(LLAVE, ID, 4, { origen })).rejects.toThrow('Hiciste muchas cosas seguidas. Esperá un rato y probá de nuevo.');
    con(401, { ok: false, motivo: 'llave' });
    await expect(votarDiseno(LLAVE, ID, 4, { origen })).rejects.toMatchObject({ motivo: 'llave' });
    con(500, { ok: false, motivo: '<script>' });
    await expect(cargarDisenos({}, { origen })).rejects.toMatchObject({ motivo: 'error' });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('sin red'); }));
    await expect(cargarDisenos({}, { origen })).rejects.toMatchObject({ motivo: 'red' });
  });
});

describe('probar y usar', () => {
  beforeEach(() => {
    volverAjustesOriginales();
    fijarUsuario(4242);
    localStorage.clear();
    window.aplicarAjustes = vi.fn();
  });

  it('la vista previa pinta sin guardar y deja lo de cada uno', () => {
    cambiarAjustes({ daltonismo: 'rojo-verde', estilo: 'hoja' });
    expect(verDiseno(CODIGO, ajustesActuales())).toBe(true);
    const pintado = window.aplicarAjustes.mock.calls.at(-1)[0];
    expect([pintado.estilo, pintado.tema, pintado.daltonismo]).toEqual(['plano', 'cosmico', 'rojo-verde']);
    expect(ajustesActuales().estilo).toBe('hoja');
    verDiseno(null);
    expect(window.aplicarAjustes.mock.calls.at(-1)[0]).toBeUndefined();
  });

  it('la prueba sigue en todo el sitio hasta usarlo o volver, y nada guardado la tapa', () => {
    const d = leerDiseno(crudo());
    expect(probarDiseno(d)).toBe(true);
    expect(disenoEnPrueba()).toBe(d);
    // Something saved meanwhile (another tab, Drive, a shortcut) is painted with the design still over it.
    cambiarAjustes({ daltonismo: 'rojo-verde', estilo: 'hoja' });
    const pintado = window.aplicarAjustes.mock.calls.at(-1)[0];
    expect([pintado.estilo, pintado.daltonismo]).toEqual(['plano', 'rojo-verde']);
    expect(ajustesQueSeVen().estilo).toBe('plano');
    expect(ajustesActuales().estilo).toBe('hoja');
    terminarPrueba();
    expect(disenoEnPrueba()).toBe(null);
    expect(ajustesQueSeVen().estilo).toBe('hoja');
    expect(window.aplicarAjustes.mock.calls.at(-1)[0]).toBeUndefined();
  });

  it('probar el mismo otra vez la termina', () => {
    const d = leerDiseno(crudo());
    probarDiseno(d);
    probarDiseno(d);
    expect(disenoEnPrueba()).toBe(null);
    expect(ajustesQueSeVen()).toBe(ajustesActuales());
  });

  it('usar el que se prueba termina la prueba: después, un cambio en Configuración se ve', () => {
    const d = leerDiseno(crudo());
    probarDiseno(d);
    usarDiseno(d, { ajustes: ajustesActuales(), mio: MIO });
    expect(disenoEnPrueba()).toBe(null);
    cambiarAjustes({ estilo: 'pizarron' });
    expect(ajustesQueSeVen().estilo).toBe('pizarron');
    // Saved, the page paints what is saved (public/ajustes.js reads it): undefined, not the design.
    expect(window.aplicarAjustes.mock.calls.at(-1)[0]).toBeUndefined();
  });

  it('usar lo que se estaba probando termina la vista previa: un cambio después se ve', () => {
    verDiseno(CODIGO, ajustesActuales());
    usarDiseno(leerDiseno(crudo()), { ajustes: ajustesActuales(), mio: MIO });
    // With the preview left on, the screens kept drawing it over every later change until a reload.
    cambiarAjustes({ estilo: 'pizarron' });
    expect(ajustesQueSeVen().estilo).toBe('pizarron');
  });

  it('usar guarda el diseño y volver trae el estilo de antes, aunque se usen varios', () => {
    cambiarAjustes({ estilo: 'hoja', daltonismo: 'rojo-verde' });
    const uno = leerDiseno(crudo());
    const otro = leerDiseno(crudo({ id: crypto.randomUUID(), codigo: codigoDeEstilo(normalizar({ estilo: 'batman' }), MIO) }));
    expect(usarDiseno(uno, { ajustes: ajustesActuales(), mio: MIO })).toBe(true);
    expect([ajustesActuales().estilo, ajustesActuales().daltonismo]).toEqual(['plano', 'rojo-verde']);
    expect(JSON.parse(localStorage.getItem(`${CLAVE_ANTES}.4242`)).nombre).toBe('Noche');
    usarDiseno(otro, { ajustes: ajustesActuales(), mio: MIO });
    expect(ajustesActuales().estilo).toBe('batman');
    expect(volverAlTuyo(ajustesActuales())).toBe(true);
    expect(ajustesActuales().estilo).toBe('hoja');
    expect(localStorage.getItem(`${CLAVE_ANTES}.4242`)).toBeNull();
    expect(volverAlTuyo(ajustesActuales())).toBe(false);
  });

  it('después de cambiar la configuración, el diseño ya no está en uso', () => {
    usarDiseno(leerDiseno(crudo()), { ajustes: ajustesActuales(), mio: MIO });
    const enUso = () => JSON.parse(localStorage.getItem(`${CLAVE_ANTES}.4242`));
    expect(disenoSigue(enUso(), ajustesActuales(), mioActual())).toBe(true);
    cambiarAjustes({ letra: 'grande' });
    expect(disenoSigue(enUso(), ajustesActuales(), mioActual())).toBe(false);
    cambiarAjustes({ daltonismo: 'rojo-verde', letra: leerDiseno(crudo()).ajustes.letra });
    expect(disenoSigue(enUso(), ajustesActuales(), mioActual())).toBe(true);
    olvidarDisenoEnUso();
    expect(localStorage.getItem(`${CLAVE_ANTES}.4242`)).toBeNull();
  });

  it('la vuelta es de cada alumno', () => {
    usarDiseno(leerDiseno(crudo()), { ajustes: ajustesActuales(), mio: MIO });
    fijarUsuario(99);
    expect(volverAlTuyo(ajustesActuales())).toBe(false);
    fijarUsuario(4242);
    expect(volverAlTuyo(ajustesActuales())).toBe(true);
  });
});

describe('para dibujarlo', () => {
  it('el dibujo, el resumen y el menú a la vista', () => {
    const a = ajustesDeCodigo(CODIGO);
    expect(dibujoDe(a)).toBe('cosmico');
    expect(dibujoDe(normalizar({ estilo: 'hoja' }))).toBe('hoja');
    expect(dibujoDe(normalizar({ tema: 'oscuro' }))).toBe('oscuro');
    expect(resumenDeDiseno(a)).toBe('Plano, Violeta cósmico, versión potente');
    expect(pantallasALaVista(normalizar({})).slice(0, 3)).toEqual(['hoy', 'materias', 'calendario']);
    expect(pantallasALaVista(normalizar({}))).not.toContain('disenos');
  });

  it('un código no lleva nada personal: ni sus materias, ni sus notas, ni sus fechas', () => {
    const ajustes = normalizar({ estilo: 'hoja', calMateria: '987654' });
    const mio = sanearMio({
      materias: { 123456: { nota: 'Mi nota secreta', comision: '3K01' } },
      eventos: [{ id: 'e1', titulo: 'Turno con el dentista', fecha: '2026-11-30' }],
      hoy: { fuera: [123456] },
    });
    const leido = JSON.stringify(leerCodigoDeEstilo(codigoDeEstilo(ajustes, mio), {}));
    for (const dato of ['123456', '987654', 'secreta', '3K01', 'dentista', '2026-11-30']) expect(leido).not.toContain(dato);
  });
});
