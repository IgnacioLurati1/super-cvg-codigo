import { Blob as BlobDeNode } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The Drive API, simulated: what Google answers to the requests of drive.js, kept in memory. Nothing goes to Google.
const PERMISO = 'ya29.permiso-de-prueba';
const SUBIR = 'https://www.googleapis.com/upload/drive/v3/files';
const API = 'https://www.googleapis.com/drive/v3/files';

function driveFalso() {
  const archivos = new Map();
  const pendientes = new Map();
  const pedidos = [];
  let n = 0;
  // falla: 'sin-red', 'vencido', 'lleno', 'cuerpo' (the bytes are cut halfway) or 'lista-rota' (a list that isn't one).
  // vaciaUnaVez: the next list comes empty. alMirar: runs once when the copy is looked at before writing it.
  const estado = { falla: null, porPagina: Infinity, vaciaUnaVez: false, alMirar: null };
  const json = (status, cuerpo, headers = {}) => new Response(cuerpo === null ? null : JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json', ...headers } });
  const guardar = (id, meta, bytes, tipo) => {
    const viejo = archivos.get(id);
    archivos.set(id, { name: viejo?.name ?? meta.name, parents: viejo?.parents ?? meta.parents, bytes, tipo, createdTime: viejo?.createdTime ?? new Date(Date.now() - (meta.edad ?? 0)).toISOString(), version: (viejo?.version ?? 0) + 1 });
    return json(200, { id });
  };
  async function multipart(cuerpo, contentType) {
    const limite = /boundary=(.+)$/.exec(contentType)[1];
    const texto = Buffer.from(await cuerpo.arrayBuffer()).toString('latin1');
    const [meta, media] = texto.split(`--${limite}`).slice(1, 3).map((p) => p.slice(p.indexOf('\r\n\r\n') + 4).replace(/\r\n$/, ''));
    return { meta: JSON.parse(meta), bytes: Buffer.from(media, 'latin1'), tipo: /Content-Type: (.+)\r\n/.exec(texto.split(`--${limite}`)[2])[1] };
  }
  async function pedir(url, op = {}) {
    const u = new URL(url);
    const metodo = op.method ?? 'GET';
    pedidos.push({ url, metodo, auth: op.headers?.Authorization, credentials: op.credentials, referrerPolicy: op.referrerPolicy });
    if (estado.falla === 'sin-red') throw new TypeError('Failed to fetch');
    if (u.href === 'https://oauth2.googleapis.com/revoke') return new Response('');
    if (op.headers?.Authorization !== `Bearer ${PERMISO}` || estado.falla === 'vencido') return json(401, { error: { code: 401 } });
    if (estado.falla === 'lleno' && metodo !== 'GET') return json(403, { error: { errors: [{ reason: 'storageQuotaExceeded' }] } });
    const meta = (id, f) => ({ id, name: f.name, size: String(f.bytes.length), createdTime: f.createdTime, version: String(f.version ?? 1) });
    if (u.origin + u.pathname === API && metodo === 'GET') {
      expect(u.searchParams.get('spaces')).toBe('appDataFolder');
      const q = u.searchParams.get('q');
      const nombre = /^name = '([^']+)' and trashed = false$/.exec(q)?.[1] ?? null;
      if (nombre === null) expect(q).toBe('trashed = false');
      if (estado.falla === 'lista-rota') return json(200, {});
      if (estado.vaciaUnaVez) {
        estado.vaciaUnaVez = false;
        return json(200, { files: [] });
      }
      const todos = [...archivos].filter(([, f]) => nombre === null || f.name === nombre).map(([id, f]) => meta(id, f));
      const desde = Number(u.searchParams.get('pageToken') ?? 0);
      const hasta = desde + estado.porPagina;
      return json(200, { files: todos.slice(desde, hasta), ...(hasta < todos.length ? { nextPageToken: String(hasta) } : {}) });
    }
    const uno = /^\/drive\/v3\/files\/([^/]+)$/.exec(u.pathname);
    if (uno && metodo === 'GET') {
      const media = u.searchParams.get('alt') === 'media';
      if (!media && estado.alMirar) {
        const alMirar = estado.alMirar;
        estado.alMirar = null;
        alMirar();
      }
      const f = archivos.get(uno[1]);
      if (!f) return json(404, { error: { code: 404 } });
      if (!media) return json(200, meta(uno[1], f));
      if (estado.falla === 'cuerpo') return new Response(new ReadableStream({ start: (c) => c.error(new TypeError('cortado')) }), { status: 200 });
      return new Response(f.bytes, { status: 200, headers: { 'Content-Type': f.tipo } });
    }
    if (uno && metodo === 'DELETE') return archivos.delete(uno[1]) ? new Response(null, { status: 204 }) : json(404, { error: { code: 404 } });
    if (u.origin + u.pathname === SUBIR || u.pathname.startsWith('/upload/drive/v3/files/')) {
      const id = u.pathname.split('/')[5] ?? null;
      if (u.searchParams.has('upload_id') && metodo === 'PUT') {
        const p = pendientes.get(u.searchParams.get('upload_id'));
        return guardar(p.id ?? `f${++n}`, p.meta, Buffer.from(await op.body.arrayBuffer()), op.headers['Content-Type']);
      }
      if (u.searchParams.get('uploadType') === 'multipart') {
        const { meta, bytes, tipo } = await multipart(op.body, op.headers['Content-Type']);
        if (!id) expect(meta.parents).toEqual(['appDataFolder']);
        return guardar(id ?? `f${++n}`, meta, bytes, tipo);
      }
      if (u.searchParams.get('uploadType') === 'resumable') {
        const sesion = `s${++n}`;
        pendientes.set(sesion, { id, meta: JSON.parse(op.body) });
        return json(200, {}, { Location: `${SUBIR}?uploadType=resumable&upload_id=${sesion}` });
      }
    }
    return json(400, { error: { code: 400 } });
  }
  const copia = (alumno) => [...archivos.values()].find((f) => f.name === `super-cvg-${alumno}.json`);
  // Another device writes the copy: what it saves, with Drive's version raised.
  const escribirCopia = (alumno, cambiar) => {
    const [id, f] = [...archivos].find(([, x]) => x.name === `super-cvg-${alumno}.json`);
    archivos.set(id, { ...f, bytes: Buffer.from(JSON.stringify(cambiar(JSON.parse(f.bytes.toString())))), version: (f.version ?? 1) + 1 });
  };
  return { archivos, pedidos, estado, pedir, copia, escribirCopia };
}

// The bytes of each device's files (bodega.js), in memory.
const bodegaFalsa = () => {
  const m = new Map();
  return {
    m,
    ids: async (u) => [...m.keys()].filter((k) => k.startsWith(`${u}:`)).map((k) => k.slice(String(u).length + 1)),
    leer: async (u, id) => {
      if (!m.has(`${u}:${id}`)) throw new Error('no está');
      return m.get(`${u}:${id}`);
    },
    guardar: async (u, id, blob) => {
      m.set(`${u}:${id}`, blob);
    },
  };
};

let mio;
let s;
let drive;
async function cargar() {
  vi.resetModules();
  vi.stubEnv('VITE_GOOGLE_CLIENTE', 'cliente.apps.googleusercontent.com');
  mio = await import('./mio');
  s = await import('./sincro');
}

// A device of the same student: its own browser storage, swapped in and out of the test's.
function dispositivo() {
  const propio = { local: {}, bodega: bodegaFalsa() };
  return {
    ...propio,
    usar() {
      localStorage.clear();
      for (const [k, v] of Object.entries(propio.local)) localStorage.setItem(k, v);
      mio.fijarUsuario(null);
      mio.fijarUsuario(5);
    },
    dejar() {
      propio.local = { ...localStorage };
    },
  };
}
const prender = () => localStorage.setItem('cl.sync.5', JSON.stringify({ prendido: true }));
const pdf = (texto) => new BlobDeNode([`%PDF-1.4 ${texto}`], { type: 'application/pdf' });
const conArchivo = (archivoId, bloque = 1) => mio.cambiarMio((d) => ({
  ...d,
  propias: [{ id: 'pabcdef12', nombre: 'Mía', categorias: [{ id: 1, nombre: 'General', bloques: [{ id: bloque, tipo: 'archivo', archivoId, nombre: 'tp.pdf', peso: 20 }] }] }],
}));

beforeEach(async () => {
  vi.stubGlobal('Blob', BlobDeNode);
  await cargar();
  drive = driveFalso();
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  localStorage.clear();
  sessionStorage.clear();
});

describe('una vez', () => {
  async function cli() {
    const { clienteDrive } = await import('./drive');
    return clienteDrive({ token: () => PERMISO, pedir: drive.pedir });
  }

  it('el primer dispositivo deja la copia y sus archivos; el segundo recibe todo', async () => {
    const compu = dispositivo();
    const celu = dispositivo();
    compu.usar();
    prender();
    mio.guardarNota(7, 'Semáforos');
    mio.alternarEn(7, 'ocultos', '101');
    conArchivo('archivo0001');
    await compu.bodega.guardar(5, 'archivo0001', pdf('uno'));
    const c = await cli();
    expect(await s.unaVez(5, c, { bodega: compu.bodega })).toEqual({ faltan: 0, avisos: [] });
    const copia = JSON.parse(drive.copia(5).bytes.toString());
    expect(copia).toMatchObject({ tipo: 'super-cvg-drive', alumno: 5 });
    expect(copia.datos.materias[7].nota).toBe('Semáforos');
    const hash = copia.archivos.archivo0001;
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect([...drive.archivos.values()].map((f) => f.name).sort()).toEqual([`super-cvg-5-${hash}`, 'super-cvg-5.json']);
    expect(JSON.parse(localStorage.getItem('cl.sync.5'))).toMatchObject({ prendido: true, unido: true, d: {} });
    compu.dejar();

    celu.usar();
    prender();
    await s.unaVez(5, c, { bodega: celu.bodega });
    expect(mio.materiaDe(mio.mioActual(), 7)).toMatchObject({ nota: 'Semáforos', ocultos: ['101'] });
    expect(Buffer.from(await (await celu.bodega.leer(5, 'archivo0001')).arrayBuffer()).toString()).toBe('%PDF-1.4 uno');
    // The same file is not uploaded twice.
    expect(drive.pedidos.filter((p) => p.url.startsWith(SUBIR) && p.metodo === 'POST')).toHaveLength(2);
  });

  // What the programs of the lab wrote (laboratorio/escritos.js): the list in mio.js, the bytes in the browser's database.
  const AGENDA = { id: 'qagenda001', nombre: 'Agenda', lenguaje: 'c' };
  const conEscrito = (id, tam) => mio.cambiarMio((d) => ({ ...d, proyectosLab: [AGENDA], escritos: [{ donde: AGENDA.id, nombre: 'datos/turnos.txt', id, tam }] }));
  const leido = async (bodega, id) => Buffer.from(await (await bodega.leer(5, id)).arrayBuffer()).toString();

  it('lo que escribieron los programas del laboratorio va y vuelve como los archivos de las materias', async () => {
    const compu = dispositivo();
    const celu = dispositivo();
    const c = await cli();
    compu.usar();
    prender();
    const uno = 'a1'.repeat(12);
    conEscrito(uno, 8);
    await compu.bodega.guardar(5, uno, new BlobDeNode(['turno 1\n']));
    expect(await s.unaVez(5, c, { bodega: compu.bodega })).toEqual({ faltan: 0, avisos: [] });
    const copia = JSON.parse(drive.copia(5).bytes.toString());
    expect(copia.datos.escritos).toEqual([{ donde: AGENDA.id, nombre: 'datos/turnos.txt', id: uno, tam: 8 }]);
    expect(copia.archivos[uno]).toMatch(/^[0-9a-f]{64}$/);
    compu.dejar();

    celu.usar();
    prender();
    expect(await s.unaVez(5, c, { bodega: celu.bodega })).toEqual({ faltan: 0, avisos: [] });
    expect(mio.mioActual().escritos).toEqual(copia.datos.escritos);
    expect(await leido(celu.bodega, uno)).toBe('turno 1\n');

    // A run on the phone writes it again: the computer gets the new version in place of the old one.
    const dos = 'b2'.repeat(12);
    conEscrito(dos, 16);
    await celu.bodega.guardar(5, dos, new BlobDeNode(['turno 1\nturno 2\n']));
    await s.unaVez(5, c, { bodega: celu.bodega });
    celu.dejar();
    compu.usar();
    await s.unaVez(5, c, { bodega: compu.bodega });
    expect(mio.mioActual().escritos.map((e) => e.id)).toEqual([dos]);
    expect(await leido(compu.bodega, dos)).toBe('turno 1\nturno 2\n');
  });

  it('lo que escribieron los programas y llega de Drive pasa por el saneo, y si falta no cuenta como un archivo perdido', async () => {
    const compu = dispositivo();
    const c = await cli();
    compu.usar();
    prender();
    conEscrito('a1'.repeat(12), 8);
    await compu.bodega.guardar(5, 'a1'.repeat(12), new BlobDeNode(['turno 1\n']));
    await s.unaVez(5, c, { bodega: compu.bodega });
    // Another device (or someone who edited the file in Drive) leaves things that don't go.
    drive.escribirCopia(5, (x) => ({
      ...x,
      datos: {
        ...x.datos,
        escritos: [
          ...x.datos.escritos,
          { donde: 'qnoexiste1', nombre: 'otro.txt', id: 'c3'.repeat(12), tam: 1 },
          { donde: AGENDA.id, nombre: '../../afuera.txt', id: 'd4'.repeat(12), tam: 1 },
          { donde: AGENDA.id, nombre: 'enorme.dat', id: 'e5'.repeat(12), tam: 1e12 },
          { donde: AGENDA.id, nombre: 'sin-bytes.dat', id: 'f6'.repeat(12), tam: 4 },
        ],
      },
    }));
    expect(await s.unaVez(5, c, { bodega: compu.bodega })).toEqual({ faltan: 0, avisos: [] });
    expect(mio.mioActual().escritos.map((e) => e.nombre)).toEqual(['datos/turnos.txt', 'sin-bytes.dat']);
  });

  it('dos dispositivos sin conexión: lo de los dos queda, y la nota no se pierde', async () => {
    const compu = dispositivo();
    const celu = dispositivo();
    const c = await cli();
    compu.usar();
    prender();
    mio.guardarNota(7, 'Base');
    await s.unaVez(5, c, { bodega: compu.bodega });
    compu.dejar();
    celu.usar();
    prender();
    await s.unaVez(5, c, { bodega: celu.bodega });
    mio.guardarNota(7, 'Desde el celu');
    mio.alternarEn(7, 'vistos', '201');
    celu.dejar();
    compu.usar();
    mio.guardarNota(7, 'Desde la compu');
    mio.renombrar(7, '201', 'TP');
    await s.unaVez(5, c, { bodega: compu.bodega });
    compu.dejar();
    celu.usar();
    await s.unaVez(5, c, { bodega: celu.bodega });
    const m = mio.materiaDe(mio.mioActual(), 7);
    expect(m.nota).toContain('Desde el celu');
    expect(m.nota).toContain('Desde la compu');
    expect(m.vistos).toEqual(['201']);
    expect(m.nombres).toEqual({ 201: 'TP' });
    celu.dejar();
    compu.usar();
    await s.unaVez(5, c, { bodega: compu.bodega });
    expect(mio.materiaDe(mio.mioActual(), 7)).toEqual(m);
  });

  it('un archivo grande va en una subida reanudable', async () => {
    const { TOPE_DE_UNA } = await import('./drive');
    const compu = dispositivo();
    compu.usar();
    prender();
    conArchivo('archivo0002');
    await compu.bodega.guardar(5, 'archivo0002', new BlobDeNode([new Uint8Array(TOPE_DE_UNA + 10)]));
    await s.unaVez(5, await cli(), { bodega: compu.bodega });
    expect(drive.pedidos.some((p) => p.url.includes('uploadType=resumable') && p.metodo === 'POST')).toBe(true);
    expect(drive.pedidos.some((p) => p.url.includes('upload_id=') && p.metodo === 'PUT')).toBe(true);
    const grande = [...drive.archivos.values()].find((f) => f.name !== 'super-cvg-5.json');
    expect(grande.bytes.length).toBe(TOPE_DE_UNA + 10);
  });

  it('un archivo que no está en ningún lado se cuenta y no frena el resto', async () => {
    const compu = dispositivo();
    compu.usar();
    prender();
    conArchivo('archivo0003');
    mio.guardarNota(7, 'Igual se guarda');
    expect(await s.unaVez(5, await cli(), { bodega: compu.bodega })).toEqual({ faltan: 1, avisos: [] });
    expect(JSON.parse(drive.copia(5).bytes.toString()).datos.materias[7].nota).toBe('Igual se guarda');
  });

  it('si la copia se borró desde otro lado, no la vuelve a crear', async () => {
    const compu = dispositivo();
    compu.usar();
    prender();
    mio.guardarNota(7, 'Algo');
    const c = await cli();
    await s.unaVez(5, c, { bodega: compu.bodega });
    drive.archivos.clear();
    await expect(s.unaVez(5, c, { bodega: compu.bodega })).rejects.toMatchObject({ codigo: 'borrada' });
    expect(drive.archivos.size).toBe(0);
    expect(mio.materiaDe(mio.mioActual(), 7).nota).toBe('Algo');
  });

  it('dos copias hechas a la vez se juntan en una', async () => {
    const c = await cli();
    for (const [nota, ocultos] of [['Uno', '1'], ['Dos', '2']]) {
      const otro = dispositivo();
      otro.usar();
      prender();
      mio.guardarNota(7, nota);
      mio.alternarEn(7, 'ocultos', ocultos);
      const copia = { tipo: 'super-cvg-drive', version: 1, alumno: 5, datos: mio.mioActual(), t: JSON.parse(localStorage.getItem('cl.sync.5')).t, archivos: {} };
      const bytes = Buffer.from(JSON.stringify(copia));
      drive.archivos.set(`copia${nota}`, { name: 'super-cvg-5.json', bytes, tipo: 'application/json', createdTime: new Date().toISOString() });
    }
    const compu = dispositivo();
    compu.usar();
    prender();
    await s.unaVez(5, c, { bodega: compu.bodega });
    expect([...drive.archivos.values()].filter((f) => f.name === 'super-cvg-5.json')).toHaveLength(1);
    expect(mio.materiaDe(mio.mioActual(), 7).ocultos.sort()).toEqual(['1', '2']);
  });

  it('una copia de otro alumno o rota no entra', async () => {
    expect(s.leerCopia('{"tipo":"super-cvg-drive","alumno":6,"datos":{}}', 5)).toBeNull();
    expect(s.leerCopia('no es JSON', 5)).toBeNull();
    const ok = s.leerCopia(JSON.stringify({ tipo: 'super-cvg-drive', alumno: 5, datos: { materias: { 7: { nota: 'x', raro: 1 } } }, t: { 'm/7/nota': 5, malo: 'x' }, archivos: { archivo0001: 'no-hash' } }), 5);
    expect(ok.datos.materias[7].nota).toBe('x');
    expect(ok.datos.materias[7].raro).toBeUndefined();
    expect(ok.t).toEqual({ 'm/7/nota': 5 });
    expect(ok.archivos).toEqual({});
  });

  it('con otra cuenta de Google no junta ni pide nada, y lo dice', async () => {
    const compu = dispositivo();
    compu.usar();
    prender();
    mio.guardarNota(7, 'De la primera cuenta');
    const c = await cli();
    await s.unaVez(5, c, { bodega: compu.bodega, cuenta: '111' });
    expect(JSON.parse(localStorage.getItem('cl.sync.5')).cuenta).toBe('111');
    mio.guardarNota(7, 'Después');
    const antes = drive.pedidos.length;
    await expect(s.unaVez(5, c, { bodega: compu.bodega, cuenta: '222' })).rejects.toMatchObject({ codigo: 'otra-cuenta', message: s.OTRA_CUENTA });
    expect(drive.pedidos).toHaveLength(antes);
    expect(JSON.parse(drive.copia(5).bytes.toString()).datos.materias[7].nota).toBe('De la primera cuenta');
    expect(mio.materiaDe(mio.mioActual(), 7).nota).toBe('Después');
  });

  it('una copia de un Super CVG más nuevo no se lee ni se pisa', async () => {
    const compu = dispositivo();
    compu.usar();
    prender();
    mio.guardarNota(7, 'Antes');
    const c = await cli();
    await s.unaVez(5, c, { bodega: compu.bodega });
    drive.escribirCopia(5, (copia) => ({ ...copia, version: 2, nueva: 'algo que este no conoce' }));
    mio.guardarNota(7, 'Después');
    await expect(s.unaVez(5, c, { bodega: compu.bodega })).rejects.toMatchObject({ codigo: 'version' });
    expect(JSON.parse(drive.copia(5).bytes.toString())).toMatchObject({ version: 2, nueva: 'algo que este no conoce' });
    expect(mio.materiaDe(mio.mioActual(), 7).nota).toBe('Después');
  });

  it('una copia que llega cortada no se pisa; una rota de verdad, sí', async () => {
    const compu = dispositivo();
    compu.usar();
    prender();
    mio.guardarNota(7, 'Guardada');
    const c = await cli();
    await s.unaVez(5, c, { bodega: compu.bodega });
    const antes = drive.copia(5).bytes.toString();
    mio.guardarNota(7, 'Nueva');
    drive.estado.falla = 'cuerpo';
    await expect(s.unaVez(5, c, { bodega: compu.bodega })).rejects.toMatchObject({ codigo: 'caido' });
    expect(drive.copia(5).bytes.toString()).toBe(antes);
    drive.estado.falla = null;
    const [id, f] = [...drive.archivos].find(([, x]) => x.name === 'super-cvg-5.json');
    drive.archivos.set(id, { ...f, bytes: Buffer.from('{"tipo": rota'), version: f.version + 1 });
    await s.unaVez(5, c, { bodega: compu.bodega });
    expect(JSON.parse(drive.copia(5).bytes.toString()).datos.materias[7].nota).toBe('Nueva');
  });

  it('si otro dispositivo guardó la copia mientras tanto, junta de nuevo antes de escribir', async () => {
    const compu = dispositivo();
    compu.usar();
    prender();
    mio.guardarNota(7, 'Base');
    const c = await cli();
    await s.unaVez(5, c, { bodega: compu.bodega });
    mio.alternarEn(7, 'ocultos', '1');
    // Just before writing, another device saves something of its own.
    drive.estado.alMirar = () => drive.escribirCopia(5, (copia) => ({
      ...copia,
      datos: { ...copia.datos, materias: { ...copia.datos.materias, 7: { ...copia.datos.materias[7], vistos: ['2'] } } },
      t: { ...copia.t, 'm/7/v/2': Date.now() + 1000 },
    }));
    await s.unaVez(5, c, { bodega: compu.bodega });
    const final = JSON.parse(drive.copia(5).bytes.toString()).datos.materias[7];
    expect(final).toMatchObject({ nota: 'Base', ocultos: ['1'], vistos: ['2'] });
    expect(mio.materiaDe(mio.mioActual(), 7).vistos).toEqual(['2']);
  });

  it('si la primera vez se corta después de juntar, la próxima no revive lo borrado', async () => {
    const c = await cli();
    const celu = dispositivo();
    const compu = dispositivo();
    celu.usar();
    prender();
    mio.alternarEn(7, 'ocultos', '9');
    await s.unaVez(5, c, { bodega: celu.bodega });
    celu.dejar();
    compu.usar();
    prender();
    mio.guardarNota(7, 'De la compu');
    drive.estado.falla = 'lleno';
    await expect(s.unaVez(5, c, { bodega: compu.bodega })).rejects.toMatchObject({ codigo: 'lleno' });
    expect(mio.materiaDe(mio.mioActual(), 7).ocultos).toEqual(['9']);
    drive.estado.falla = null;
    compu.dejar();
    // Meanwhile the phone shows it again.
    celu.usar();
    mio.alternarEn(7, 'ocultos', '9');
    await s.unaVez(5, c, { bodega: celu.bodega });
    celu.dejar();
    compu.usar();
    await s.unaVez(5, c, { bodega: compu.bodega });
    expect(mio.materiaDe(mio.mioActual(), 7)).toMatchObject({ ocultos: [], nota: 'De la compu' });
  });

  it('el primero que no pudo subir la copia no la da por borrada', async () => {
    const compu = dispositivo();
    compu.usar();
    prender();
    mio.guardarNota(7, 'Primera');
    const c = await cli();
    drive.estado.falla = 'lleno';
    await expect(s.unaVez(5, c, { bodega: compu.bodega })).rejects.toMatchObject({ codigo: 'lleno' });
    drive.estado.falla = null;
    await s.unaVez(5, c, { bodega: compu.bodega });
    expect(JSON.parse(drive.copia(5).bytes.toString()).datos.materias[7].nota).toBe('Primera');
  });

  it('un cambio que no se pudo anotar, con la pestaña cerrada, no se pierde en la próxima unión', async () => {
    const c = await cli();
    const compu = dispositivo();
    const celu = dispositivo();
    compu.usar();
    prender();
    mio.guardarNota(7, 'Base');
    await s.unaVez(5, c, { bodega: compu.bodega });
    compu.dejar();
    celu.usar();
    prender();
    await s.unaVez(5, c, { bodega: celu.bodega });
    mio.guardarNota(7, 'Del celu');
    await s.unaVez(5, c, { bodega: celu.bodega });
    celu.dejar();
    // The computer changed the note, the browser had no room to note it, and the tab closed.
    compu.usar();
    const marcas = localStorage.getItem('cl.sync.5');
    mio.guardarNota(7, 'De la compu');
    localStorage.setItem('cl.sync.5', marcas);
    localStorage.setItem('cl.sync.5.falta', '1');
    await s.unaVez(5, c, { bodega: compu.bodega });
    // Both stay: the one noted later goes first.
    expect(mio.materiaDe(mio.mioActual(), 7).nota).toBe('Del celu\n\nDe la compu');
    expect(localStorage.getItem('cl.sync.5.falta')).toBeNull();
  });

  it('una lista vacía por error no da la copia por borrada', async () => {
    const compu = dispositivo();
    compu.usar();
    prender();
    mio.guardarNota(7, 'Sigue');
    const c = await cli();
    await s.unaVez(5, c, { bodega: compu.bodega });
    drive.estado.vaciaUnaVez = true;
    mio.guardarNota(7, 'Sigue igual');
    await s.unaVez(5, c, { bodega: compu.bodega });
    expect(JSON.parse(drive.copia(5).bytes.toString()).datos.materias[7].nota).toBe('Sigue igual');
    drive.estado.falla = 'lista-rota';
    await expect(s.unaVez(5, c, { bodega: compu.bodega })).rejects.toMatchObject({ codigo: 'caido' });
    expect(JSON.parse(localStorage.getItem('cl.sync.5')).prendido).toBe(true);
  });

  it('lo que no entra una vez juntado se avisa y no vuelve en cada vuelta', async () => {
    const c = await cli();
    const compu = dispositivo();
    const celu = dispositivo();
    compu.usar();
    prender();
    for (let i = 1; i <= 200; i++) mio.agregarTarea(7, `Compu ${i}`, '', i);
    await s.unaVez(5, c, { bodega: compu.bodega });
    compu.dejar();
    celu.usar();
    prender();
    for (let i = 1; i <= 200; i++) mio.agregarTarea(7, `Celu ${i}`, '', 1000 + i);
    const r = await s.unaVez(5, c, { bodega: celu.bodega });
    expect(r.avisos).toEqual([s.NO_ENTRO]);
    expect(mio.materiaDe(mio.mioActual(), 7).tareas).toHaveLength(300);
    celu.dejar();
    compu.usar();
    expect((await s.unaVez(5, c, { bodega: compu.bodega })).avisos).toEqual([]);
    expect(mio.materiaDe(mio.mioActual(), 7).tareas).toHaveLength(300);
    compu.dejar();
    celu.usar();
    expect((await s.unaVez(5, c, { bodega: celu.bodega })).avisos).toEqual([]);
  });

  it('el permiso va solo en la cabecera, sin cookies ni de dónde viene', async () => {
    const compu = dispositivo();
    compu.usar();
    prender();
    mio.guardarNota(7, 'x');
    await s.unaVez(5, await cli(), { bodega: compu.bodega });
    expect(drive.pedidos.length).toBeGreaterThan(0);
    for (const p of drive.pedidos) {
      expect(p.url).not.toContain(PERMISO);
      expect(p).toMatchObject({ auth: `Bearer ${PERMISO}`, credentials: 'omit', referrerPolicy: 'no-referrer' });
      expect(new URL(p.url).hostname).toBe('www.googleapis.com');
    }
  });
});

describe('cuándo y cómo se ve', () => {
  // With the campus session and the Drive permission in this tab.
  const conectar = (alcances = ['https://www.googleapis.com/auth/drive.appdata', 'openid', 'email']) => {
    // A campus key of its own: what the tabs of an earlier test say to each other does not reach this one.
    sessionStorage.setItem('cl.sesion', `clave-${Math.random()}`);
    sessionStorage.setItem('cl.classroom', JSON.stringify({ token: PERMISO, vence: Date.now() + 3_000_000, email: 'ana@gmail.com', alcances }));
    sessionStorage.setItem('cl.google.usos', 'drive');
  };
  beforeEach(() => {
    vi.stubGlobal('fetch', drive.pedir);
    mio.fijarUsuario(5);
  });

  it('prendido, guarda; sin conexión lo dice y vuelve a guardar cuando vuelve', async () => {
    conectar();
    await (await s.prenderDrive()).listo;
    expect(s.estadoDrive()).toMatchObject({ prendido: true, fase: 'listo', email: 'ana@gmail.com' });
    expect(s.estadoDrive().ultima).toBeGreaterThan(Date.now() - 5000);
    mio.guardarNota(7, 'Sin red');
    const linea = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await s.correr();
    expect(s.estadoDrive().fase).toBe('sin-conexion');
    linea.mockRestore();
    // No answer while the browser says there is internet: Drive is not answering, and it tries again by itself.
    drive.estado.falla = 'sin-red';
    await s.correr();
    expect(s.estadoDrive()).toMatchObject({ fase: 'error', error: 'Google Drive no responde ahora. Probá de nuevo en un rato.' });
    drive.estado.falla = null;
    await s.correr();
    expect(s.estadoDrive().fase).toBe('listo');
    expect(JSON.parse(drive.copia(5).bytes.toString()).datos.materias[7].nota).toBe('Sin red');
  });

  it('un permiso vencido que no se renueva solo pide volver a conectar', async () => {
    conectar();
    await (await s.prenderDrive()).listo;
    drive.estado.falla = 'vencido';
    mio.guardarNota(7, 'x');
    await s.correr();
    expect(s.estadoDrive().fase).toBe('reconectar');
  });

  it('con el Drive lleno lo dice claro', async () => {
    conectar();
    await (await s.prenderDrive()).listo;
    drive.estado.falla = 'lleno';
    mio.guardarNota(7, 'x');
    await s.correr();
    expect(s.estadoDrive()).toMatchObject({ fase: 'error', error: 'Tu Google Drive está lleno. Hacé lugar y probá de nuevo.' });
  });

  it('sin el permiso de Drive (solo Classroom) no pide nada a Drive', async () => {
    conectar(['https://www.googleapis.com/auth/classroom.courses.readonly', 'openid', 'email']);
    sessionStorage.setItem('cl.google.usos', 'classroom');
    prender();
    await s.correr();
    expect(s.estadoDrive().fase).toBe('reconectar');
    expect(drive.pedidos.filter((p) => p.url.startsWith('https://www.googleapis.com/'))).toEqual([]);
  });

  it('dejar de guardar deja lo de acá y la copia; sin Classroom le avisa a Google', async () => {
    conectar();
    await (await s.prenderDrive()).listo;
    mio.guardarNota(7, 'Queda');
    await s.correr();
    s.apagarDrive();
    expect(s.estadoDrive()).toMatchObject({ prendido: false, fase: 'apagado' });
    expect(mio.materiaDe(mio.mioActual(), 7).nota).toBe('Queda');
    expect(drive.copia(5)).toBeTruthy();
    expect(drive.pedidos.filter((p) => p.url === 'https://oauth2.googleapis.com/revoke')).toHaveLength(1);
  });

  it('con Classroom prendido, dejar de guardar no corta Classroom', async () => {
    conectar(['https://www.googleapis.com/auth/classroom.courses.readonly', 'https://www.googleapis.com/auth/drive.appdata', 'openid', 'email']);
    sessionStorage.setItem('cl.google.usos', 'classroom drive');
    await (await s.prenderDrive()).listo;
    s.apagarDrive();
    const g = await import('./google');
    expect(g.permisoGoogle('classroom')).toBe(PERMISO);
    expect(drive.pedidos.filter((p) => p.url === 'https://oauth2.googleapis.com/revoke')).toHaveLength(0);
  });

  it('borrar la copia se lleva la del alumno y sus archivos, y nada de otro', async () => {
    conectar();
    drive.archivos.set('ajeno', { name: 'super-cvg-55.json', bytes: Buffer.from('{}'), tipo: 'application/json', createdTime: new Date().toISOString() });
    await (await s.prenderDrive()).listo;
    mio.guardarNota(7, 'Queda acá');
    await s.correr();
    await s.borrarCopiaDrive();
    expect([...drive.archivos.keys()]).toEqual(['ajeno']);
    expect(s.estadoDrive()).toMatchObject({ prendido: false, fase: 'apagado' });
    expect(mio.materiaDe(mio.mioActual(), 7).nota).toBe('Queda acá');
    expect(s.hayCopiaDrive()).toBe(false);
  });

  it('un cambio espera unos segundos y va junto con los que siguen', async () => {
    conectar();
    await (await s.prenderDrive()).listo;
    s.arrancarDrive();
    const antes = drive.pedidos.length;
    mio.guardarNota(7, 'a');
    mio.guardarNota(7, 'ab');
    await new Promise((ok) => setTimeout(ok, s.ESPERA_CAMBIOS_MS - 1500));
    expect(drive.pedidos.length).toBe(antes);
    await vi.waitFor(() => expect(JSON.parse(drive.copia(5).bytes.toString()).datos.materias[7].nota).toBe('ab'), { timeout: 8000 });
    expect(drive.pedidos.filter((p) => p.metodo === 'PATCH')).toHaveLength(1);
  }, 15_000);

  it('con otra cuenta de Google lo dice sin juntar, y «Usar esta cuenta» guarda en la nueva', async () => {
    conectar();
    sessionStorage.setItem('cl.google', '111');
    await (await s.prenderDrive()).listo;
    expect(JSON.parse(localStorage.getItem('cl.sync.5')).cuenta).toBe('111');
    sessionStorage.setItem('cl.google', '222');
    mio.guardarNota(7, 'Con otra cuenta');
    const antes = drive.pedidos.length;
    await s.correr();
    expect(s.estadoDrive()).toMatchObject({ fase: 'otra-cuenta', error: s.OTRA_CUENTA });
    expect(drive.pedidos).toHaveLength(antes);
    await s.usarEstaCuenta();
    expect(s.estadoDrive().fase).toBe('listo');
    expect(JSON.parse(localStorage.getItem('cl.sync.5')).cuenta).toBe('222');
    expect(JSON.parse(drive.copia(5).bytes.toString()).datos.materias[7].nota).toBe('Con otra cuenta');
  });

  it('si no hay lugar para anotar un cambio, no guarda a ciegas, lo dice y sigue cuando hay lugar', async () => {
    conectar();
    await (await s.prenderDrive()).listo;
    const escribir = Storage.prototype.setItem;
    const lleno = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (k, v) {
      if (String(k).startsWith('cl.sync.')) throw new DOMException('lleno', 'QuotaExceededError');
      return escribir.call(this, k, v);
    });
    mio.guardarNota(7, 'Sin lugar');
    await s.correr();
    expect(s.estadoDrive()).toMatchObject({ fase: 'error', error: s.SIN_LUGAR_MARCAS });
    expect(JSON.parse(drive.copia(5).bytes.toString()).datos.materias[7]?.nota).not.toBe('Sin lugar');
    lleno.mockRestore();
    await s.correr();
    expect(s.estadoDrive().fase).toBe('listo');
    expect(JSON.parse(drive.copia(5).bytes.toString()).datos.materias[7].nota).toBe('Sin lugar');
  });

  it('prendido recuerda la cuenta de Google para renovar; dejar de guardar la olvida', async () => {
    conectar();
    sessionStorage.setItem('cl.google', '111');
    await (await s.prenderDrive()).listo;
    // A new session: the tab doesn't know the account, the marks do.
    sessionStorage.removeItem('cl.google');
    expect(s.cuentaDeDrive()).toBe('111');
    s.apagarDrive();
    expect(s.cuentaDeDrive()).toBeNull();
  });
});

describe('la carpeta en Drive', () => {
  const cliente = async (pedir = drive.pedir) => (await import('./drive')).clienteDrive({ token: () => PERMISO, pedir });
  const enDrive = (id, name) => drive.archivos.set(id, { name, bytes: Buffer.from('x'), tipo: 'application/octet-stream', createdTime: new Date().toISOString() });

  it('busca la copia por su nombre exacto y lista todo lo demás página por página', async () => {
    enDrive('c', 'super-cvg-5.json');
    enDrive('otro', 'super-cvg-55.json');
    enDrive('viejo', 'super-cvg-5.json.viejo');
    for (let i = 1; i <= 4; i++) enDrive(`a${i}`, `super-cvg-5-${String(i).repeat(64)}`);
    drive.estado.porPagina = 2;
    const c = await cliente();
    expect((await c.listar()).map((f) => f.id).sort()).toEqual(['a1', 'a2', 'a3', 'a4', 'c', 'otro', 'viejo']);
    expect(drive.pedidos.filter((p) => p.url.startsWith(`${API}?`))).toHaveLength(4);
    const copias = await c.listar({ nombre: 'super-cvg-5.json' });
    expect(copias.map((f) => f.id)).toEqual(['c']);
    expect(new URL(drive.pedidos.at(-1).url).searchParams.get('q')).toBe("name = 'super-cvg-5.json' and trashed = false");
  });

  it('una respuesta que no es una lista es un error, no una carpeta vacía', async () => {
    drive.estado.falla = 'lista-rota';
    await expect((await cliente()).listar()).rejects.toMatchObject({ codigo: 'caido' });
  });

  it('la cuota del día o de pedidos es estar ocupado; sin el permiso de Drive, volver a conectar', async () => {
    const con = (reason) => cliente(async () => new Response(JSON.stringify({ error: { errors: [{ reason }] } }), { status: 403 }));
    await expect((await con('dailyLimitExceeded')).listar()).rejects.toMatchObject({ codigo: 'ocupado' });
    await expect((await con('userRateLimitExceeded')).listar()).rejects.toMatchObject({ codigo: 'ocupado' });
    await expect((await con('quotaExceeded')).listar()).rejects.toMatchObject({ codigo: 'ocupado' });
    await expect((await con('storageQuotaExceeded')).listar()).rejects.toMatchObject({ codigo: 'lleno' });
    await expect((await con('insufficientPermissions')).listar()).rejects.toMatchObject({ codigo: 'vencida' });
  });
});
