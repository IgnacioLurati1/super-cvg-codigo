import { Blob as BlobDeNode } from 'node:buffer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.stubGlobal('Blob', BlobDeNode);

// Who is inside and which Google account, set by each test.
const estado = { alumno: 5, token: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4', cuenta: '100000000000000000001', permiso: true, usos: ['drive'] };
vi.mock('./mio', () => ({ usuarioActual: () => estado.alumno, escucharMio: () => () => {} }));
vi.mock('./sesion', () => ({ tokenActual: () => estado.token, iniciarSesion: vi.fn() }));
vi.mock('./google', () => ({
  conectarGoogle: vi.fn(async () => {}),
  cuentaGoogle: () => estado.cuenta,
  disponibleGoogle: () => true,
  escucharGoogle: () => () => {},
  permisoGoogle: () => (estado.permiso ? 'ya29.permiso' : null),
  pistaDeCuenta: () => {},
  quedarseConUsosDeGoogle: vi.fn(),
  quererGoogle: vi.fn(),
  renovarGoogle: vi.fn(),
  soltarGoogle: vi.fn(),
  usarGoogle: vi.fn(),
  usosDeGoogle: () => estado.usos,
}));

const { ARCHIVO, borrarArchivo, escribirArchivo, leerArchivo, leerMarca, ponerAlDia, sanearDatos, armarDatos } = await import('./entrarConGoogle');

// The hidden folder, as drive.js gives it.
function carpeta() {
  const archivos = new Map();
  let n = 0;
  return {
    archivos,
    async listar({ nombre = null } = {}) {
      return [...archivos].filter(([, f]) => nombre === null || f.name === nombre).map(([id, f]) => ({ id, name: f.name }));
    },
    async bajar(id) {
      return new Response(archivos.get(id).texto);
    },
    async subir({ id, nombre, blob }) {
      const nuevo = id ?? `f${++n}`;
      archivos.set(nuevo, { name: archivos.get(nuevo)?.name ?? nombre, texto: await blob.text() });
      return nuevo;
    },
    async borrar(id) {
      archivos.delete(id);
    },
  };
}
const contenido = (drive) => JSON.parse([...drive.archivos.values()].find((f) => f.name === ARCHIVO).texto);

beforeEach(() => {
  localStorage.clear();
  Object.assign(estado, { alumno: 5, token: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4', cuenta: '100000000000000000001', permiso: true, usos: ['drive'] });
});

describe('what goes in the file', () => {
  it('this device: the campus key, the student, El Santo Resumen and what is on', () => {
    localStorage.setItem('cl.santo.5', JSON.stringify({ llave: 'llave-de-prueba-0123456789', usuario: 'ana' }));
    estado.usos = ['drive', 'classroom', 'adjuntos', 'cuenta'];
    expect(armarDatos()).toEqual({ v: 1, campus: estado.token, alumno: 5, santo: { llave: 'llave-de-prueba-0123456789', usuario: 'ana' }, usos: ['drive', 'classroom'], drive: false, calendario: null });
  });

  it('what comes back is checked one by one', () => {
    const bien = { v: 1, campus: estado.token, alumno: 5, santo: null, usos: ['drive'], drive: true, calendario: 'c1@group.calendar.google.com' };
    expect(sanearDatos(bien)).toEqual(bien);
    expect(sanearDatos({ ...bien, v: 2 })).toBeNull();
    expect(sanearDatos({ ...bien, campus: 'a b' })).toBeNull();
    expect(sanearDatos({ ...bien, alumno: '5' })).toBeNull();
    expect(sanearDatos({ ...bien, santo: { llave: 'x' }, usos: ['cuenta', 'otro', 'classroom'], drive: 'si', calendario: '<a>' }))
      .toEqual({ ...bien, santo: null, usos: ['classroom'], drive: false, calendario: null });
  });
});

describe('the file', () => {
  it('one only, written over, read back and deleted', async () => {
    const drive = carpeta();
    await escribirArchivo(drive, armarDatos());
    estado.token = 'f'.repeat(32);
    await escribirArchivo(drive, armarDatos());
    expect(drive.archivos.size).toBe(1);
    expect((await leerArchivo(drive)).datos.campus).toBe('f'.repeat(32));
    await borrarArchivo(drive);
    expect(await leerArchivo(drive)).toBeNull();
  });

  it('one that does not read says so, without breaking', async () => {
    const drive = carpeta();
    await drive.subir({ nombre: ARCHIVO, blob: new Blob(['{"v":1}']) });
    expect((await leerArchivo(drive)).datos).toBeNull();
  });
});

describe('up to date by itself', () => {
  const prendido = async (drive) => {
    await escribirArchivo(drive, armarDatos());
    localStorage.setItem('cl.entrar.5', JSON.stringify({ cuenta: estado.cuenta, huella: 'vieja' }));
  };

  it('a new campus key goes up', async () => {
    const drive = carpeta();
    await prendido(drive);
    estado.token = 'b'.repeat(32);
    await ponerAlDia({ drive });
    expect(contenido(drive).campus).toBe('b'.repeat(32));
    const subidas = drive.archivos.size;
    await ponerAlDia({ drive });
    expect(drive.archivos.size).toBe(subidas);
  });

  it('turned off on another device: it goes off here and the file is not made again', async () => {
    const drive = carpeta();
    await prendido(drive);
    await borrarArchivo(drive);
    await ponerAlDia({ drive });
    expect(leerMarca(5)).toBeNull();
    expect(await leerArchivo(drive)).toBeNull();
  });

  it('linked to another campus student since: this one stops, the file stays theirs', async () => {
    const drive = carpeta();
    await prendido(drive);
    const otro = { ...contenido(drive), alumno: 9 };
    await escribirArchivo(drive, otro);
    await ponerAlDia({ drive });
    expect(leerMarca(5)).toBeNull();
    expect(contenido(drive).alumno).toBe(9);
  });

  it('nothing without it on, or with another Google account', async () => {
    const drive = carpeta();
    await ponerAlDia({ drive });
    expect(drive.archivos.size).toBe(0);
    await prendido(drive);
    estado.cuenta = '200000000000000000002';
    estado.token = 'c'.repeat(32);
    await ponerAlDia({ drive });
    expect(contenido(drive).campus).toBe('a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4');
  });
});
