import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The database is mocked (its owner check is tested in sinInternetPartes.test.js), with the same rule: a name is read
// only with the key that wrote it and for the same one over there (`de`). What is tested here is when Classroom and
// El Santo Resumen keep, what they show offline and that they don't go out then.
const disco = vi.hoisted(() => ({ aparte: new Map(), archivos: new Map() }));
// jsdom's Blob has no text(): the copies kept are read as the browser would.
const conTexto = (blob) => Object.assign(blob, {
  text: () => new Promise((ok) => {
    const lector = new FileReader();
    lector.onload = () => ok(lector.result);
    lector.readAsText(blob);
  }),
});
vi.mock('./sinInternet', async (original) => {
  const real = await original();
  return {
    ...real,
    recordar: vi.fn(async () => {}),
    recuperar: vi.fn(async () => null),
    recuperarTodas: vi.fn(async () => []),
    recordarAparte: vi.fn(async (nombre, datos, { token, alumno, de = '', cuando = Date.now() }) => {
      if (real.esAparte(nombre) && token && alumno) disco.aparte.set(nombre, { cuando, datos: structuredClone(datos), de, token });
    }),
    recuperarAparte: vi.fn(async (nombre, token, de = '') => {
      const r = disco.aparte.get(nombre);
      return r && r.token === token && r.de === de ? { cuando: r.cuando, datos: structuredClone(r.datos) } : null;
    }),
    borrarAparte: vi.fn(async (prefijo) => {
      for (const k of [...disco.aparte.keys()]) if (k.startsWith(prefijo)) disco.aparte.delete(k);
    }),
    guardarArchivoSinInternet: vi.fn(async (direccion, sello, blob, { token, alumno }) => {
      if (token && alumno) disco.archivos.set(direccion, { blob, token });
    }),
    archivoGuardado: vi.fn(async (direccion, token) => {
      const r = disco.archivos.get(direccion);
      return r && r.token === token ? { blob: conTexto(r.blob), sello: 'aparte' } : null;
    }),
    borrarSinInternet: vi.fn(async () => {
      disco.aparte.clear();
      disco.archivos.clear();
    }),
    mostroGuardado: vi.fn(),
  };
});

const { cerrarSesion, conCache, iniciarSesion } = await import('./sesion');
const { borrarAparte, borrarSinInternet, mostroGuardado } = await import('./sinInternet');
const { cargarCursos, cargarDatosCurso, cargarEntregas, olvidarClassroom } = await import('./classroom');
const { CLAVE_CUENTA, CLAVE_GOOGLE, CLAVE_USOS, guardadoSinRed, olvidarGoogle, renovarGoogle, soltarGoogle } = await import('./google');
const { cargarBanco, olvidarSanto } = await import('./santoResumen');
const { borrarVinculo, cargarResumenes } = await import('./resumenes');
const { traerHtml, traerPdf } = await import('./verResumen');

const ID = '0b6f2a8e-1c11-4d0a-9a51-2f6a8b1c0d01';
const OTRO_ID = '0b6f2a8e-1c11-4d0a-9a51-2f6a8b1c0d02';
const LLAVE = 'llave-de-prueba-0001';
const respuesta = (cuerpo, status = 200) => new Response(typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo), { status });

let sinRed = false;
async function entrar({ recordar = true, cuenta = '111' } = {}) {
  iniciarSesion('clave', { recordar });
  await conCache('perfil', 60, async () => ({ id: 7, nombre: 'Ana' }));
  const donde = recordar ? localStorage : sessionStorage;
  donde.setItem(CLAVE_GOOGLE, JSON.stringify({ token: 'tk', vence: Date.now() + 3_600_000 }));
  donde.setItem(CLAVE_CUENTA, cuenta);
  donde.setItem(CLAVE_USOS, 'classroom');
}

// What Google and El Santo Resumen answer.
function servicios() {
  const pedidos = [];
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    pedidos.push(String(url));
    if (sinRed) throw new TypeError('Failed to fetch');
    const u = new URL(url);
    if (u.pathname === '/v1/courses') return respuesta({ courses: [{ id: '10', name: 'Física I', courseState: 'ACTIVE', alternateLink: 'https://classroom.google.com/c/10' }] });
    if (u.pathname === '/v1/courses/10/announcements') return respuesta({ announcements: [{ id: '5', text: 'Mañana no hay clase.', state: 'PUBLISHED' }] });
    if (u.pathname.endsWith('/studentSubmissions')) return respuesta({ studentSubmissions: [{ courseWorkId: '3', state: 'TURNED_IN' }] });
    if (u.hostname === 'classroom.googleapis.com') return respuesta({});
    const a = u.searchParams.get('a');
    if (a === 'banco') return respuesta({ resumenes: [{ id: ID, materia: 'fisica-i', titulo: 'Cinemática', tipo: 'pdf' }] });
    if (a === 'cvg-resumenes') return respuesta({ usuario: 'santi', subidos: [{ id: ID, materia: 'fisica-i', titulo: 'Mío', estado: 'publicado' }], enviados: [] });
    if (a === 'bajar') return respuesta('%PDF-1.7 hola');
    if (a === 'ver') return respuesta('<p>Hola</p>');
    return respuesta({}, 404);
  }));
  return pedidos;
}

beforeEach(() => {
  sinRed = false;
  vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => !sinRed);
  disco.aparte.clear();
  disco.archivos.clear();
  vi.mocked(mostroGuardado).mockClear();
  localStorage.clear();
  sessionStorage.clear();
  olvidarClassroom();
  olvidarSanto();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Classroom without internet', () => {
  it('with «Seguir conectado» keeps what Google brought, for that account, and shows it offline without asking', async () => {
    const pedidos = servicios();
    await entrar();
    expect((await cargarCursos()).map((c) => c.nombre)).toEqual(['Física I']);
    expect((await cargarDatosCurso('10')).avisos).toHaveLength(1);
    expect([...(await cargarEntregas('10'))]).toEqual(['3']);
    expect(disco.aparte.get('classroom.cursos').de).toBe('111');
    olvidarClassroom();
    sinRed = true;
    // The permission ended while offline: what was kept still shows.
    localStorage.removeItem(CLAVE_GOOGLE);
    const antes = pedidos.length;
    expect((await cargarCursos())[0]).toMatchObject({ id: '10', nombre: 'Física I', url: 'https://classroom.google.com/c/10' });
    expect((await cargarDatosCurso('10')).avisos[0].text).toBe('Mañana no hay clase.');
    expect(await cargarEntregas('10')).toEqual(new Set(['3']));
    expect(pedidos).toHaveLength(antes);
    expect(mostroGuardado).toHaveBeenCalled();
  });

  it('when the request never gets there, what was kept; once the network is back, Google again', async () => {
    const pedidos = servicios();
    await entrar();
    await cargarCursos();
    olvidarClassroom();
    sinRed = true;
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    expect((await cargarCursos())[0].nombre).toBe('Física I');
    sinRed = false;
    const antes = pedidos.length;
    await cargarCursos();
    expect(pedidos.length).toBe(antes + 1);
  });

  it('another Google account, or no «Seguir conectado», reads nothing; offline it never asks Google', async () => {
    const pedidos = servicios();
    await entrar();
    await cargarCursos();
    olvidarClassroom();
    localStorage.setItem(CLAVE_CUENTA, '222');
    sinRed = true;
    const antes = pedidos.length;
    await expect(cargarCursos()).rejects.toMatchObject({ codigo: 'red' });
    expect(pedidos).toHaveLength(antes);

    disco.aparte.clear();
    sinRed = false;
    await entrar({ recordar: false });
    await cargarCursos();
    expect(disco.aparte.size).toBe(0);
  });

  it('Desconectar, another account and Salir delete it', async () => {
    servicios();
    await entrar();
    localStorage.setItem(CLAVE_USOS, 'classroom drive');
    await cargarCursos();
    soltarGoogle('classroom');
    expect(borrarAparte).toHaveBeenCalledWith('classroom.');
    expect(disco.aparte.has('classroom.cursos')).toBe(false);

    vi.mocked(borrarAparte).mockClear();
    olvidarGoogle({ revocar: true });
    expect(borrarAparte).toHaveBeenCalledWith('classroom.');

    await entrar();
    await cargarCursos();
    cerrarSesion();
    expect(borrarSinInternet).toHaveBeenCalled();
    expect(disco.aparte.size).toBe(0);
  });

  it('offline the screens show what was kept, and the permission is not renewed until the network is back', async () => {
    servicios();
    await entrar();
    expect(guardadoSinRed('classroom')).toBe(false);
    sinRed = true;
    expect(guardadoSinRed('classroom')).toBe(true);
    expect(guardadoSinRed('drive')).toBe(false);
    localStorage.removeItem(CLAVE_GOOGLE);
    await expect(renovarGoogle()).resolves.toBe(false);
    expect(document.querySelector('iframe')).toBeNull();
  });
});

describe('El Santo Resumen without internet', () => {
  it('the bank seen comes back offline, read again here, without asking', async () => {
    const pedidos = servicios();
    await entrar();
    await cargarBanco('fisica-i');
    olvidarSanto();
    sinRed = true;
    const antes = pedidos.length;
    const [r] = await cargarBanco('fisica-i');
    expect(r).toMatchObject({ id: ID, titulo: 'Cinemática', url: `https://lutastudios.com/utn/banco.html?materia=fisica-i#r-${ID}` });
    expect(pedidos).toHaveLength(antes);
    expect(mostroGuardado).toHaveBeenCalled();
    // What was never seen fails as before.
    await expect(cargarBanco('fisica-ii')).rejects.toMatchObject({ codigo: 'red' });
  });

  it('the lists of the linked account are kept under a print of the key, never the key; Desvincular deletes them', async () => {
    servicios();
    await entrar();
    expect((await cargarResumenes(LLAVE)).subidos[0].titulo).toBe('Mío');
    const guardado = disco.aparte.get('santo.resumenes');
    expect(JSON.stringify(guardado)).not.toContain(LLAVE);
    expect(guardado.de).toMatch(/^[0-9a-f]{64}$/);
    sinRed = true;
    expect((await cargarResumenes(LLAVE)).usuario).toBe('santi');
    // Linked again with another account: nothing of the first one.
    await expect(cargarResumenes('otra-llave-de-prueba-02')).rejects.toMatchObject({ codigo: 'red' });
    borrarVinculo(7);
    expect(borrarAparte).toHaveBeenCalledWith('santo.resumenes');
    expect(disco.aparte.has('santo.resumenes')).toBe(false);
  });

  it('a summary opened opens offline from its copy; one never opened says there is no internet', async () => {
    const pedidos = servicios();
    await entrar();
    await traerPdf(ID);
    expect(await traerHtml(ID)).toBe('<p>Hola</p>');
    expect([...disco.archivos.keys()]).toEqual([`santo:bajar:${ID}`, `santo:ver:${ID}`]);
    sinRed = true;
    const antes = pedidos.length;
    expect((await traerPdf(ID)).size).toBe('%PDF-1.7 hola'.length);
    expect(await traerHtml(ID)).toBe('<p>Hola</p>');
    expect(pedidos).toHaveLength(antes);
    await expect(traerPdf(OTRO_ID)).rejects.toMatchObject({ codigo: 'red' });
  });

  it('without «Seguir conectado» nothing is kept', async () => {
    servicios();
    await entrar({ recordar: false });
    await cargarBanco('fisica-i');
    await traerPdf(ID);
    expect(disco.aparte.size).toBe(0);
    expect(disco.archivos.size).toBe(0);
  });
});
