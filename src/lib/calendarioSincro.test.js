import { Blob as BlobDeNode } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { idEnGoogle } from './calendarioGoogle';
import { claveDia } from './datos';

// Google Calendar, simulated: what Google answers to the requests of gcal.js, kept in memory. A deleted event keeps its
// id, like in Google: adding it again answers 409. Nothing goes to Google, nor to the campus.
const PERMISO = 'ya29.permiso-de-prueba';
const API = 'https://www.googleapis.com/calendar/v3';
const DIA = 86_400;
const ahoraIso = () => new Date().toISOString();

function calendarioFalso() {
  const calendarios = new Map();
  const pedidos = [];
  let n = 0;
  const json = (status, cuerpo) => new Response(cuerpo === null ? null : JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } });
  async function pedir(url, op = {}) {
    const u = new URL(url);
    const metodo = op.method ?? 'GET';
    const cuerpo = op.body ? JSON.parse(op.body) : null;
    pedidos.push({ metodo, camino: u.pathname.replace('/calendar/v3', ''), cuerpo, cabeceras: op.headers, credentials: op.credentials });
    if (op.headers?.Authorization !== `Bearer ${PERMISO}`) return json(401, { error: { code: 401 } });
    const [, , id, eventos, eventoId] = u.pathname.replace('/calendar/v3', '').split('/').map(decodeURIComponent);
    if (!id && metodo === 'POST') {
      const nuevo = `cal${++n}@group.calendar.google.com`;
      calendarios.set(nuevo, { ...cuerpo, eventos: new Map() });
      return json(200, { id: nuevo, summary: cuerpo.summary });
    }
    const cal = calendarios.get(id);
    if (!cal) return json(404, { error: { code: 404 } });
    if (!eventos) {
      if (metodo === 'GET') return json(200, { id, summary: cal.summary });
      if (metodo === 'DELETE') {
        calendarios.delete(id);
        return new Response(null, { status: 204 });
      }
    }
    if (!eventoId && metodo === 'GET') return json(200, { items: [...cal.eventos.values()].filter((e) => e.status !== 'cancelled') });
    if (!eventoId && metodo === 'POST') {
      if (cal.eventos.has(cuerpo.id)) return json(409, { error: { code: 409 } });
      cal.eventos.set(cuerpo.id, { ...cuerpo, updated: ahoraIso() });
      return json(200, cuerpo);
    }
    const ya = cal.eventos.get(eventoId);
    if (metodo === 'PUT') {
      if (!ya) return json(404, { error: { code: 404 } });
      cal.eventos.set(eventoId, { ...cuerpo, updated: ahoraIso() });
      return json(200, cuerpo);
    }
    if (metodo === 'PATCH') {
      if (!ya || ya.status === 'cancelled') return json(404, { error: { code: 404 } });
      cal.eventos.set(eventoId, { ...ya, ...cuerpo, updated: ahoraIso() });
      return json(200, cal.eventos.get(eventoId));
    }
    if (metodo === 'DELETE') {
      if (!ya || ya.status === 'cancelled') return json(410, { error: { code: 410 } });
      cal.eventos.set(eventoId, { ...ya, status: 'cancelled' });
      return new Response(null, { status: 204 });
    }
    return json(400, { error: { code: 400 } });
  }
  const vivos = (id) => [...(calendarios.get(id)?.eventos.values() ?? [])].filter((e) => e.status !== 'cancelled');
  // What the student does in Google Calendar, by hand.
  const aMano = (id, evento) => calendarios.get(id).eventos.set(evento.id, { ...calendarios.get(id).eventos.get(evento.id), ...evento, updated: ahoraIso() });
  return { calendarios, pedidos, pedir, vivos, aMano };
}

// The hidden folder of Drive, only for the small file with which calendar it is. `sinPermiso`: the student left the
// Drive part of the permission unmarked.
const enDrive = new Map();
let driveSinPermiso = false;
vi.mock('./drive', () => ({
  clienteDrive: () => {
    const antes = () => {
      if (driveSinPermiso) throw Object.assign(new Error('Se cortó la conexión con Google.'), { conocido: true, codigo: 'vencida' });
    };
    return {
      listar: async ({ nombre }) => {
        antes();
        return [...enDrive].filter(([, f]) => f.name === nombre).map(([id, f]) => ({ id, name: f.name }));
      },
      bajar: async (id) => {
        antes();
        return new Response(enDrive.get(id).texto);
      },
      subir: async ({ id, nombre, blob }) => {
        antes();
        const propio = id ?? `d${enDrive.size + 1}`;
        enDrive.set(propio, { name: nombre, texto: await blob.text() });
        return propio;
      },
      borrar: async (id) => {
        antes();
        enDrive.delete(id);
      },
    };
  },
}));

// The campus' calendar, by month.
let delCampus = [];
vi.mock('./campus', () => ({
  cargarMes: async (anio, mes) => delCampus.filter((e) => {
    const d = new Date(e.cuando * 1000);
    return d.getFullYear() === anio && d.getMonth() + 1 === mes;
  }),
  cargarNombres: async () => ({ 7: 'Física I' }),
}));

// The faculty's academic calendar: none unless a test puts some.
let deLaFacultad = [];
vi.mock('./facultad', async (original) => ({ ...(await original()), eventosDeLaFacultad: () => deLaFacultad }));

const google = { soltados: [], conectados: [], permiso: PERMISO };
vi.mock('./google', () => ({
  conectarGoogle: async (uso) => {
    google.conectados.push(uso);
    google.permiso = PERMISO;
  },
  cuentaGoogle: () => '109876543210987654321',
  disponibleGoogle: () => true,
  escucharGoogle: () => () => {},
  mailGoogle: () => 'ana.alumna@gmail.com',
  permisoGoogle: () => google.permiso,
  pistaDeCuenta: () => {},
  quererGoogle: () => {},
  renovarGoogle: async () => false,
  soltarGoogle: (uso) => google.soltados.push(uso),
  usarGoogle: () => {},
}));
vi.mock('./sincro', () => ({ estadoDrive: () => ({ prendido: false }) }));

let g;
let s;
let mio;
const hoy = new Date();
const enDias = (dias, hora = 10) => Math.floor(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + dias, hora).getTime() / 1000);
const deCampus = (id, cuando, titulo = `Clase ${id}`) => ({ id, titulo, materia: 'Física I', materiaId: 7, vencimiento: false, cuando, url: null });

beforeEach(async () => {
  vi.resetModules();
  localStorage.clear();
  sessionStorage.clear();
  enDrive.clear();
  driveSinPermiso = false;
  google.soltados = [];
  google.conectados = [];
  google.permiso = null;
  g = calendarioFalso();
  vi.stubGlobal('fetch', g.pedir);
  // jsdom's Blob can't be read back as text.
  vi.stubGlobal('Blob', BlobDeNode);
  sessionStorage.setItem('cl.sesion', 'clave-del-campus');
  mio = await import('./mio');
  s = await import('./calendarioSincro');
  mio.fijarUsuario(5);
  delCampus = [deCampus(1, enDias(2)), deCampus(2, enDias(30)), deCampus(3, enDias(75))];
  deLaFacultad = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
});

const unico = () => {
  expect(g.calendarios.size).toBe(1);
  return [...g.calendarios.keys()][0];
};
const titulos = (id) => g.vivos(id).map((e) => e.summary).sort();

describe('vincular', () => {
  it('crea «Super CVG», anota cuál es en Drive y pasa las fechas del campus de 60 días y las tuyas', async () => {
    mio.agregarEvento({ id: 1, titulo: 'Parcial de Física', cuando: enDias(5), sinHora: true, tipo: 'parcial', materiaId: 7 });
    const { listo } = await s.vincularCalendario();
    await listo;
    expect(google.conectados).toEqual(['calendario']);
    const id = unico();
    expect(g.calendarios.get(id)).toMatchObject({ summary: 'Super CVG', timeZone: 'America/Argentina/Buenos_Aires' });
    expect(JSON.parse([...enDrive.values()][0].texto)).toEqual({ tipo: 'super-cvg-calendario', version: 1, calendario: id });
    expect([...enDrive.values()][0].name).toBe('super-cvg-calendario-5.json');
    expect(titulos(id)).toEqual(['Clase 1 (Física I)', 'Clase 2 (Física I)', 'Parcial de Física (Física I)']);
    expect(s.leerMarcas(5)).toMatchObject({ prendido: true, calendario: id, cuenta: '109876543210987654321' });
    expect(s.leerMarcas(5).ultima).toBeGreaterThan(0);
    // The permission goes in the header, without cookies; nothing of the campus key.
    expect(g.pedidos.every((p) => p.credentials === 'omit' && !JSON.stringify(p).includes('clave-del-campus'))).toBe(true);
  });

  it('lo que queda en este navegador es el número del calendario, la cuenta, cuándo y huellas: nada del campus', async () => {
    mio.agregarEvento({ id: 1, titulo: 'Parcial de Física', cuando: enDias(5), sinHora: true, tipo: 'parcial', materiaId: 7 });
    await (await s.vincularCalendario()).listo;
    const marcas = JSON.parse(localStorage.getItem('cl.gcal.5'));
    expect(Object.keys(marcas).sort()).toEqual(['base', 'calendario', 'cuenta', 'explicado', 'prendido', 'tocado', 'ultima']);
    expect(Object.keys(marcas.base).sort()).toEqual(['campus1', 'campus2', idEnGoogle({ propio: 'evento', id: 'e1' })].sort());
    expect(localStorage.getItem('cl.gcal.5')).not.toMatch(/Clase|Física|Parcial/);
  });

  it('otro dispositivo con la misma cuenta usa el mismo calendario', async () => {
    await (await s.vincularCalendario()).listo;
    const id = unico();
    localStorage.clear();
    vi.resetModules();
    mio = await import('./mio');
    s = await import('./calendarioSincro');
    mio.fijarUsuario(5);
    await (await s.vincularCalendario()).listo;
    expect(unico()).toBe(id);
    expect(titulos(id)).toHaveLength(2);
  });

  it('sin la parte de Drive del permiso, igual vincula en este dispositivo', async () => {
    driveSinPermiso = true;
    await (await s.vincularCalendario()).listo;
    expect(titulos(unico())).toHaveLength(2);
    expect(enDrive.size).toBe(0);
  });

  it('si Google no da el permiso, no queda nada a medias', async () => {
    const google_ = await import('./google');
    vi.spyOn(google_, 'conectarGoogle').mockRejectedValueOnce(Object.assign(new Error('Google no dio permiso para tu Google Calendar.'), { conocido: true, codigo: 'incompleto' }));
    await expect(s.vincularCalendario()).rejects.toThrow('Google no dio permiso');
    expect(g.calendarios.size).toBe(0);
    expect(s.leerMarcas(5)).toBeNull();
  });
});

describe('ponerse al día', () => {
  beforeEach(async () => {
    mio.agregarEvento({ id: 1, titulo: 'Parcial de Física', cuando: enDias(5), sinHora: true, tipo: 'parcial', materiaId: 7 });
    await (await s.vincularCalendario()).listo;
  });

  it('una fecha tuya cambiada o borrada cambia o se va de Google; lo que no cambió no se vuelve a escribir', async () => {
    const id = unico();
    const antes = g.pedidos.length;
    await s.correr();
    expect(g.pedidos.slice(antes).map((p) => p.metodo)).toEqual(['GET'], 'sin cambios, solo mira');
    mio.cambiarEvento(1, { titulo: 'Final de Física' });
    await s.correr();
    expect(titulos(id)).toContain('Final de Física (Física I)');
    mio.borrarEvento(1);
    await s.correr();
    expect(titulos(id)).toEqual(['Clase 1 (Física I)', 'Clase 2 (Física I)']);
  });

  it('una fecha del campus que la cátedra sacó se va, y la que se suma llega', async () => {
    const id = unico();
    delCampus = [deCampus(1, enDias(2)), deCampus(4, enDias(10), 'Clase nueva')];
    // Only the first time in the visit, or when asked: the campus is asked once.
    await s.correr();
    expect(titulos(id)).toHaveLength(3);
    await s.correr({ conCampus: true });
    expect(titulos(id)).toEqual(['Clase 1 (Física I)', 'Clase nueva (Física I)', 'Parcial de Física (Física I)']);
  });

  it('una fecha del campus corregida acá va corregida, una borrada se va de Google y vuelve al mostrarla', async () => {
    const id = unico();
    mio.corregirDelCampus(1, { titulo: 'Clase 1 en el aula 4', cuando: enDias(3), sinHora: true, tipo: 'otro', materiaId: 7 });
    mio.corregirDelCampus(2, { borrado: true });
    await s.correr({ conCampus: true });
    expect(titulos(id)).toEqual(['Clase 1 en el aula 4 (Física I)', 'Parcial de Física (Física I)']);
    mio.volverAlCampus(1);
    mio.volverAlCampus(2);
    await s.correr({ conCampus: true });
    expect(titulos(id)).toEqual(['Clase 1 (Física I)', 'Clase 2 (Física I)', 'Parcial de Física (Física I)']);
  });

  it('una fecha borrada antes y vuelta a cargar se recupera, aunque Google guarde su número', async () => {
    const id = unico();
    mio.borrarEvento(1);
    await s.correr();
    mio.agregarEvento({ id: 1, titulo: 'Parcial de Física', cuando: enDias(5), sinHora: true, tipo: 'parcial', materiaId: 7 });
    await s.correr();
    expect(titulos(id)).toContain('Parcial de Física (Física I)');
  });

  it('lo que el alumno escribe en el calendario «Super CVG» aparece acá como fecha suya, y queda allá', async () => {
    const id = unico();
    g.aMano(id, { id: 'amano1', summary: 'Cumple de Beto', start: { date: '2030-01-01' }, end: { date: '2030-01-02' }, description: 'Llevar torta' });
    await s.correr();
    expect(mio.mioActual().eventos.find((e) => e.gid === 'amano1')).toMatchObject({ titulo: 'Cumple de Beto', sinHora: true, tipo: 'otro', materiaId: null });
    expect(titulos(id)).toContain('Cumple de Beto');
    // Changed here, only what both share changes there: the description is theirs.
    const suya = mio.mioActual().eventos.find((e) => e.gid === 'amano1');
    mio.cambiarEvento(suya.id, { titulo: 'Cumple de Beto, en casa' });
    await s.correr();
    expect(g.vivos(id).find((e) => e.id === 'amano1')).toMatchObject({ summary: 'Cumple de Beto, en casa', description: 'Llevar torta' });
    expect(g.pedidos.at(-1)).toMatchObject({ metodo: 'PATCH' });
    expect(g.pedidos.at(-1).cuerpo.description).toBeUndefined();
  });

  it('lo que el alumno cambia o borra en Google cambia o se va de acá', async () => {
    const id = unico();
    const eventoId = idEnGoogle({ propio: 'evento', id: 'e1' });
    g.aMano(id, { id: eventoId, summary: 'Parcial de Física II (Física I)', start: { dateTime: new Date(enDias(6, 9) * 1000).toISOString() }, end: { dateTime: new Date(enDias(6, 11) * 1000).toISOString() } });
    await s.correr();
    expect(mio.mioActual().eventos).toEqual([{ id: 1, titulo: 'Parcial de Física II', cuando: enDias(6, 9), sinHora: false, tipo: 'parcial', materiaId: 7 }]);
    const antes = g.pedidos.length;
    await s.correr();
    expect(g.pedidos.slice(antes).map((p) => p.metodo)).toEqual(['GET'], 'lo que vino no vuelve a ir');
    g.aMano(id, { id: eventoId, status: 'cancelled' });
    await s.correr();
    expect(mio.mioActual().eventos).toEqual([]);
  });

  it('una tarea borrada en Google queda entre las tareas, sin día', async () => {
    const id = unico();
    mio.agregarTarea(7, 'Resolver la guía', claveDia(enDias(3)), 44);
    await s.correr();
    const tareaId = idEnGoogle({ propio: 'tarea', id: 't7-44' });
    expect(titulos(id)).toContain('Resolver la guía (Física I)');
    g.aMano(id, { id: tareaId, status: 'cancelled' });
    await s.correr();
    expect(mio.mioActual().materias[7].tareas).toEqual([{ id: 44, texto: 'Resolver la guía', hecha: false, fecha: null }]);
  });

  it('una fecha del campus que el alumno borró en Google no vuelve, salvo que el campus la cambie', async () => {
    const id = unico();
    g.aMano(id, { id: 'campus1', status: 'cancelled' });
    await s.correr({ conCampus: true });
    expect(titulos(id)).not.toContain('Clase 1 (Física I)');
    delCampus = [deCampus(1, enDias(3)), deCampus(2, enDias(30))];
    await s.correr({ conCampus: true });
    expect(titulos(id)).toContain('Clase 1 (Física I)');
  });

  it('otro dispositivo sin la copia de Drive trae las fechas tuyas que están en Google', async () => {
    localStorage.clear();
    vi.resetModules();
    mio = await import('./mio');
    s = await import('./calendarioSincro');
    mio.fijarUsuario(5);
    await (await s.vincularCalendario()).listo;
    expect(mio.mioActual().eventos).toEqual([{ id: 1, titulo: 'Parcial de Física', cuando: enDias(5, 12), sinHora: true, tipo: 'parcial', materiaId: 7 }]);
  });

  it('si el alumno borró el calendario en Google, se desvincula y lo dice', async () => {
    g.calendarios.clear();
    await s.correr();
    expect(s.leerMarcas(5)).toBeNull();
    expect(google.soltados).toEqual(['calendario']);
    expect(s.estadoCalendario()).toMatchObject({ prendido: false, fase: 'borrado', error: s.BORRADO });
  });

  it('sin permiso y sin poder renovarlo en silencio, pide volver a conectar', async () => {
    google.permiso = null;
    await s.correr();
    expect(s.estadoCalendario()).toMatchObject({ prendido: true, fase: 'reconectar' });
    await s.reconectarCalendario();
    expect(s.estadoCalendario()).toMatchObject({ prendido: true, fase: 'listo' });
  });
});

describe('desvincular', () => {
  it('borra el calendario «Super CVG» y el archivo de Drive, devuelve el permiso y deja las fechas de acá', async () => {
    mio.agregarEvento({ id: 1, titulo: 'Parcial de Física', cuando: enDias(5), sinHora: true, tipo: 'parcial', materiaId: 7 });
    await (await s.vincularCalendario()).listo;
    await s.desvincularCalendario();
    expect(g.calendarios.size).toBe(0);
    expect(enDrive.size).toBe(0);
    expect(google.soltados).toEqual(['calendario']);
    expect(s.leerMarcas(5)).toBeNull();
    expect(Object.keys(localStorage).filter((k) => k.startsWith('cl.gcal'))).toEqual([]);
    expect(mio.mioActual().eventos).toHaveLength(1);
  });

  it('sin permiso, no borra nada a ciegas: queda vinculado y pide volver a conectar', async () => {
    await (await s.vincularCalendario()).listo;
    google.permiso = null;
    await expect(s.desvincularCalendario()).rejects.toThrow('Volvé a conectar');
    expect(g.calendarios.size).toBe(1);
    expect(s.leerMarcas(5).prendido).toBe(true);
  });
});


describe('lo marcado como hecho', () => {
  beforeEach(async () => {
    await (await s.vincularCalendario()).listo;
  });

  it('una fecha del campus marcada como hecha se va de Google, como una tarea tuya hecha, y vuelve al desmarcarla', async () => {
    const id = unico();
    expect(titulos(id)).toEqual(['Clase 1 (Física I)', 'Clase 2 (Física I)']);
    mio.marcarHecha('e1', enDias(2));
    await s.correr({ conCampus: true });
    expect(titulos(id)).toEqual(['Clase 2 (Física I)']);
    mio.desmarcarHecha('e1', enDias(2));
    await s.correr({ conCampus: true });
    expect(titulos(id)).toEqual(['Clase 1 (Física I)', 'Clase 2 (Física I)']);
  });
});

describe('el calendario académico', () => {
  const deFacultad = (dias, titulo) => ({ id: `f${dias}`, titulo, cuando: enDias(dias, 12), sinHora: true, propio: 'facultad', tipo: 'otro' });
  const deLaFacultadEn = (id) => g.vivos(id).filter((e) => e.extendedProperties?.private?.fuente === 'facultad');

  beforeEach(async () => {
    deLaFacultad = [deFacultad(-3, 'Día del Estudiante (sin clases)'), deFacultad(1, 'Mesa de examen'), deFacultad(200, 'Receso de verano, hasta el 3 de febrero')];
    await (await s.vincularCalendario()).listo;
  });

  it('va de hoy en adelante, sin los 60 días del campus, como día entero y sin ocupar', async () => {
    const id = unico();
    const pasados = deLaFacultadEn(id);
    expect(pasados.map((e) => e.summary).sort()).toEqual(['Mesa de examen', 'Receso de verano, hasta el 3 de febrero']);
    expect(pasados.find((e) => e.summary === 'Mesa de examen')).toMatchObject({
      start: { date: claveDia(enDias(1)) },
      end: { date: claveDia(enDias(2)) },
      transparency: 'transparent',
      description: 'Calendario académico, desde Super CVG',
    });
    expect(titulos(id)).toContain('Clase 1 (Física I)');
  });

  it('solo va: lo que el alumno borra o cambia en Google no vuelve acá ni se vuelve a escribir', async () => {
    const id = unico();
    const [mesa, receso] = ['Mesa de examen', 'Receso de verano, hasta el 3 de febrero'].map((t) => deLaFacultadEn(id).find((e) => e.summary === t));
    g.aMano(id, { id: mesa.id, status: 'cancelled' });
    g.aMano(id, { id: receso.id, summary: 'Vacaciones' });
    await s.correr({ conCampus: true });
    expect(deLaFacultadEn(id).map((e) => e.summary)).toEqual(['Vacaciones']);
    expect(mio.mioActual().eventos).toEqual([]);
  });

  it('el mismo día y el mismo nombre conservan su lugar aunque el calendario de la facultad se escriba de nuevo', async () => {
    const id = unico();
    const antes = deLaFacultadEn(id).map((e) => e.id).sort();
    deLaFacultad = [deFacultad(0, 'Feriado nuevo (feriado)'), ...deLaFacultad.map((e, i) => ({ ...e, id: `otro${i}` }))];
    await s.correr();
    const despues = deLaFacultadEn(id);
    expect(despues.map((e) => e.summary).sort()).toEqual(['Feriado nuevo (feriado)', 'Mesa de examen', 'Receso de verano, hasta el 3 de febrero']);
    expect(antes.every((x) => despues.some((e) => e.id === x))).toBe(true);
  });

  it('apagado en Calendario, se va de Google; prendido, vuelve', async () => {
    const id = unico();
    const { cambiarAjustes } = await import('./ajustes');
    cambiarAjustes({ facultad: false });
    await s.correr();
    expect(deLaFacultadEn(id)).toEqual([]);
    expect(titulos(id)).toContain('Clase 1 (Física I)');
    cambiarAjustes({ facultad: true });
    await s.correr();
    expect(deLaFacultadEn(id)).toHaveLength(2);
  });
});
