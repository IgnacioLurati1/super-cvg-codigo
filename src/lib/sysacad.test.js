import { afterEach, describe, expect, it, vi } from 'vitest';
import { finalesSinCurso, leerMensaje, nombreParaMostrar, notaComoTexto, palabrasDe, unirFinales } from './sysacad';

const AHORA = Date.UTC(2026, 10, 6, 15);
const bien = (extra = {}) => ({ fuente: 'sysacad-lindo', para: 'super-cvg', v: 1, vinculada: true, fecha: AHORA - 60_000, finales: [{ nombre: 'Física I', nota: 7 }], ...extra });

describe('el mensaje de Sysacad Lindo', () => {
  it('toma uno vinculado con sus finales', () => {
    expect(leerMensaje(bien(), AHORA)).toEqual({ vinculada: true, fecha: AHORA - 60_000, finales: [{ nombre: 'Física I', nota: 7 }] });
  });

  it('sin vincular, o vinculada sin haber leído Estado académico, no trae finales', () => {
    expect(leerMensaje({ fuente: 'sysacad-lindo', para: 'super-cvg', v: 1, vinculada: false }, AHORA)).toEqual({ vinculada: false, fecha: null, finales: null });
    expect(leerMensaje({ fuente: 'sysacad-lindo', para: 'super-cvg', v: 1, vinculada: true }, AHORA)).toEqual({ vinculada: true, fecha: null, finales: null });
    expect(leerMensaje(bien({ finales: [] }), AHORA)).toEqual({ vinculada: true, fecha: AHORA - 60_000, finales: [] });
  });

  it('limpia los espacios del nombre y acepta notas con decimales', () => {
    expect(leerMensaje(bien({ finales: [{ nombre: '  Análisis\nMatemático   I ', nota: 7.5 }] }), AHORA).finales).toEqual([{ nombre: 'Análisis Matemático I', nota: 7.5 }]);
  });

  it.each([
    ['nada', null],
    ['un texto', 'hola'],
    ['una lista', [bien()]],
    ['otra fuente', bien({ fuente: 'otra' })],
    ['para otro', bien({ para: 'otro' })],
    ['otra versión', bien({ v: 2 })],
    ['la versión como texto', bien({ v: '1' })],
    ['vinculada como texto', bien({ vinculada: 'true' })],
    ['sin decir si está vinculada', (() => { const m = bien(); delete m.vinculada; return m; })()],
    ['un campo de más', bien({ token: 'x' })],
    ['finales sin vincular', bien({ vinculada: false })],
    ['fecha sin finales', bien({ finales: undefined })],
    ['finales sin fecha', bien({ fecha: undefined })],
    ['fecha nula', bien({ fecha: null })],
    ['fecha como texto', bien({ fecha: String(AHORA) })],
    ['fecha del futuro', bien({ fecha: AHORA + 3 * 86_400_000 })],
    ['fecha negativa', bien({ fecha: -1 })],
    ['fecha con decimales', bien({ fecha: AHORA - 0.5 })],
    ['finales que no son una lista', bien({ finales: { nombre: 'Física I', nota: 7 } })],
    ['más de 80 finales', bien({ finales: Array.from({ length: 81 }, (_, i) => ({ nombre: `Materia ${i}`, nota: 6 })) })],
    ['una nota de 0', bien({ finales: [{ nombre: 'Física I', nota: 0 }] })],
    ['una nota de 11', bien({ finales: [{ nombre: 'Física I', nota: 11 }] })],
    ['una nota como texto', bien({ finales: [{ nombre: 'Física I', nota: '7' }] })],
    ['una nota que no es un número', bien({ finales: [{ nombre: 'Física I', nota: Number.NaN }] })],
    ['un nombre vacío', bien({ finales: [{ nombre: '   ', nota: 7 }] })],
    ['un nombre largo', bien({ finales: [{ nombre: 'a'.repeat(121), nota: 7 }] })],
    ['un nombre que no es texto', bien({ finales: [{ nombre: 7, nota: 7 }] })],
    ['un final con un campo de más', bien({ finales: [{ nombre: 'Física I', nota: 7, html: '<b>' }] })],
    ['un final que no es un objeto', bien({ finales: ['Física I'] })],
  ])('ignora %s', (_, datos) => {
    expect(leerMensaje(datos, AHORA)).toBeNull();
  });

  it('80 finales y un nombre de 120 caracteres entran', () => {
    expect(leerMensaje(bien({ finales: Array.from({ length: 80 }, (_, i) => ({ nombre: `${'a'.repeat(110)} ${i}`, nota: 10 })) }), AHORA).finales).toHaveLength(80);
  });

  it('escribe la nota como el resto del sitio', () => {
    expect(notaComoTexto(7)).toBe('7');
    expect(notaComoTexto(7.5)).toBe('7,5');
  });
});

describe('las materias aprobadas que no están en el campus', () => {
  const finales = [
    { nombre: 'Física I', nota: 7 },
    { nombre: 'Química General', nota: 4 },
    { nombre: 'Álgebra y Geometría Analítica', nota: 9 },
    { nombre: 'Química General', nota: 4 },
  ];

  it('son los finales que ninguna materia del campus tomó, una vez cada uno y por nombre', () => {
    const unidos = unirFinales([{ id: 1, nombre: 'Física I - 2025 - 1K1' }, { id: 2, nombre: 'Sistemas Operativos' }], finales);
    expect(finalesSinCurso(finales, unidos)).toEqual([
      { nombre: 'Álgebra y Geometría Analítica', nota: 9 },
      { nombre: 'Química General', nota: 4 },
    ]);
  });

  it('sin finales, o con todos en el campus, no hay ninguna', () => {
    expect(finalesSinCurso(null, new Map())).toEqual([]);
    expect(finalesSinCurso([], new Map())).toEqual([]);
    const una = [{ nombre: 'Física I', nota: 7 }];
    expect(finalesSinCurso(una, unirFinales([{ id: 1, nombre: 'Física I' }], una))).toEqual([]);
  });

  it('un nombre todo en mayúsculas se escribe como en el campus; los demás quedan como vienen', () => {
    expect(nombreParaMostrar('ALGORITMOS Y ESTRUCTURAS DE DATOS')).toBe('Algoritmos y Estructuras de Datos');
    expect(nombreParaMostrar('ANÁLISIS MATEMÁTICO II')).toBe('Análisis Matemático II');
    expect(nombreParaMostrar('INGLÉS I (ELEC.)')).toBe('Inglés I (Elec.)');
    expect(nombreParaMostrar('Entornos Gráficos (Elec.)')).toBe('Entornos Gráficos (Elec.)');
    expect(nombreParaMostrar('Física I')).toBe('Física I');
  });
});

describe('unir los finales con las materias del campus', () => {
  const finales = [
    { nombre: 'Física I', nota: 7 },
    { nombre: 'Física II', nota: 8 },
    { nombre: 'Análisis Matemático I', nota: 6 },
    { nombre: 'ALGORITMOS Y ESTRUCTURAS DE DATOS', nota: 9 },
    { nombre: 'Entornos Gráficos (Elec.)', nota: 10 },
    { nombre: 'Química General', nota: 4 },
    { nombre: 'Inglés I', nota: 8 },
  ];
  const unir = (nombre) => unirFinales([{ id: 1, nombre }], finales).get(1)?.nota ?? null;

  it.each([
    ['Física I', 7],
    ['FISICA II - 2026 - 2K3', 8],
    ['Física 2', 8],
    ['Análisis Matemático I - Comisión 1K1', 6],
    ['Algoritmos y Estructuras de Datos 2025', 9],
    ['Entornos Gráficos', 10],
    ['ENTORNOS GRAFICOS (Electiva) 3K2', 10],
    ['Inglés I - Com. 2', 8],
    ['Química', 4],
  ])('«%s» toma su final', (nombre, nota) => {
    expect(unir(nombre)).toBe(nota);
  });

  it.each([
    'Física',
    'Análisis Matemático II',
    'Inglés II',
    'Materia de ejemplo A',
    'Sistemas Operativos',
    '',
  ])('«%s» no toma ninguno', (nombre) => {
    expect(unir(nombre)).toBeNull();
  });

  it('una comisión o un año no se confunden con un número de materia', () => {
    expect(palabrasDe('Física II - Com 1 - 2026 - 1° cuatrimestre')).toEqual(['fisica', 'ii']);
    expect(unir('Física II - Com 1')).toBe(8);
  });

  it('si dos materias distintas empatan, no pone ninguna', () => {
    const empate = [{ nombre: 'Inglés I', nota: 8 }, { nombre: 'Inglés II', nota: 9 }];
    expect(unirFinales([{ id: 1, nombre: 'Inglés I y II' }], empate).size).toBe(0);
  });

  it('con un nombre de Sysacad más largo, la lista de El Santo Resumen dice si es la misma, sin mezclar números', () => {
    const largos = [{ nombre: 'Sistemas de Gestión II', nota: 9 }, { nombre: 'Física I (anual)', nota: 5 }];
    expect(unirFinales([{ id: 1, nombre: 'Sistemas de Gestión' }], largos).size).toBe(0);
    expect(unirFinales([{ id: 2, nombre: 'Física I - 2026' }], largos).get(2)).toEqual({ nombre: 'Física I (anual)', nota: 5 });
  });

  it('sin finales, ninguna', () => {
    expect(unirFinales([{ id: 1, nombre: 'Física I' }], null).size).toBe(0);
    expect(unirFinales([{ id: 1, nombre: 'Física I' }], []).size).toBe(0);
  });
});

describe('hablar con la extensión', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function cargar() {
    vi.resetModules();
    return { s: await import('./sysacad') };
  }

  const llega = (datos, extra = {}) => window.dispatchEvent(new MessageEvent('message', { data: datos, origin: window.location.origin, source: window, ...extra }));

  it('pregunta al cargar, y sin respuesta en un momento queda como no instalada', async () => {
    vi.useFakeTimers();
    const { s } = await cargar();
    const enviados = [];
    vi.spyOn(window, 'postMessage').mockImplementation((m, origen) => enviados.push([m, origen]));
    s.iniciarSysacad();
    expect(enviados).toEqual(['sysacad', 'pestanas', 'examenes'].map((pide) => [{ fuente: 'super-cvg', pide }, window.location.origin]));
    expect(snapshot(s)).toMatchObject({ estado: 'buscando', copias: null, sinCopias: false });
    vi.advanceTimersByTime(s.ESPERA_MS + 10);
    expect(snapshot(s)).toMatchObject({ estado: 'sin-extension', copias: null, sinCopias: true });
    // Back to the tab: it asks again, and an answer then still counts.
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(enviados).toHaveLength(6);
    llega({ fuente: 'sysacad-lindo', para: 'super-cvg', v: 1, vinculada: false });
    expect(snapshot(s).estado).toBe('sin-vincular');
  });

  it('si preguntó antes de que la extensión escuchara, le vuelve a pedir las pestañas cuando aparece', async () => {
    vi.useFakeTimers();
    const { s } = await cargar();
    const enviados = [];
    vi.spyOn(window, 'postMessage').mockImplementation((m) => enviados.push(m.pide));
    s.iniciarSysacad();
    // Sysacad Lindo loads after the page asked: it says hello on its own, never the tabs.
    llega({ fuente: 'sysacad-lindo', para: 'super-cvg', v: 1, vinculada: true });
    expect(enviados).toEqual(['sysacad', 'pestanas', 'examenes', 'pestanas', 'examenes']);
    llega({ fuente: 'sysacad-lindo', para: 'super-cvg', v: 1, vinculada: true });
    expect(enviados).toHaveLength(5);
    vi.advanceTimersByTime(s.ESPERA_MS + 10);
    // Late or not, the tabs count.
    llega({ fuente: 'sysacad-lindo', para: 'super-cvg', v: 2, tipo: 'pestanas', vinculada: true, guarda: true, alumno: 'PEREZ, Juan', pestanas: [] });
    expect(snapshot(s)).toMatchObject({ estado: 'vinculada', sinCopias: false, copias: { vinculada: true, pestanas: [] } });
  });

  it('solo escucha a esta misma ventana y a este origen', async () => {
    const { s } = await cargar();
    vi.spyOn(window, 'postMessage').mockImplementation(() => {});
    s.iniciarSysacad();
    llega(bien({ fecha: Date.now() }), { origin: 'https://otro.test' });
    llega(bien({ fecha: Date.now() }), { source: null });
    expect(snapshot(s).estado).toBe('buscando');
    llega(bien({ fecha: Date.now() }));
    expect(snapshot(s)).toMatchObject({ estado: 'vinculada', finales: [{ nombre: 'Física I', nota: 7 }] });
  });

  it('vincular avisa a la extensión y abre Sysacad aparte; desvincular le avisa y saca las notas de la memoria', async () => {
    const { s } = await cargar();
    const enviados = [];
    vi.spyOn(window, 'postMessage').mockImplementation((m) => enviados.push(m.pide));
    const abrir = vi.fn(() => null);
    vi.stubGlobal('open', abrir);
    s.iniciarSysacad();
    llega({ fuente: 'sysacad-lindo', para: 'super-cvg', v: 1, vinculada: false });
    s.vincularSysacad();
    expect(abrir).toHaveBeenCalledWith('https://alumnos.frro.utn.edu.ar/', '_blank', 'noopener');
    expect(snapshot(s)).toMatchObject({ estado: 'sin-vincular', pidio: true });
    llega(bien({ fecha: Date.now() }));
    expect(snapshot(s).finales).toHaveLength(1);
    s.desvincularSysacad();
    expect(enviados).toEqual(['sysacad', 'pestanas', 'examenes', 'pestanas', 'examenes', 'vincular', 'desvincular']);
    expect(snapshot(s)).toMatchObject({ estado: 'sin-vincular', fecha: null, finales: null });
  });

  const copias = (extra = {}) => ({
    fuente: 'sysacad-lindo', para: 'super-cvg', v: 2, tipo: 'pestanas', vinculada: true, guarda: true, alumno: 'PEREZ, Juan',
    pestanas: [{ clave: 'examenes', titulo: 'Exámenes', fecha: Date.now() - 60_000, bloques: [{ t: 'texto', texto: 'Física I, 7' }] }],
    ...extra,
  });

  it('las copias de las pestañas llegan aparte de los finales, y una versión vieja contesta solo los finales', async () => {
    vi.useFakeTimers();
    const { s } = await cargar();
    vi.spyOn(window, 'postMessage').mockImplementation(() => {});
    s.iniciarSysacad();
    llega({ fuente: 'sysacad-lindo', para: 'super-cvg', v: 1, vinculada: true });
    vi.advanceTimersByTime(s.ESPERA_MS + 10);
    expect(snapshot(s)).toMatchObject({ estado: 'vinculada', copias: null, sinCopias: true });
    // Updated: the next answer brings them.
    llega(copias());
    expect(snapshot(s)).toMatchObject({ estado: 'vinculada', sinCopias: false, copias: { vinculada: true, guarda: true, alumno: 'PEREZ, Juan' } });
    expect(snapshot(s).copias.pestanas.map((p) => p.clave)).toEqual(['examenes']);
    // One that does not pass the check changes nothing, and neither touches the finals.
    llega(copias({ pestanas: [{ clave: 'examenes', titulo: 'Exámenes', fecha: Date.now(), bloques: [{ t: 'imagen' }] }] }));
    expect(snapshot(s).copias.pestanas).toHaveLength(1);
    expect(snapshot(s).finales).toBeNull();
  });

  it('olvidar las pestañas le pide a la extensión que las borre y las saca de la memoria; desvincular también', async () => {
    const { s } = await cargar();
    const enviados = [];
    vi.spyOn(window, 'postMessage').mockImplementation((m) => enviados.push(m.pide));
    s.iniciarSysacad();
    llega(copias());
    s.olvidarPestanasSysacad();
    expect(enviados.at(-1)).toBe('olvidar-pestanas');
    expect(snapshot(s).copias).toEqual({ vinculada: true, guarda: true, alumno: null, pestanas: [] });
    llega(copias());
    // Salir with no message (a session that was not there): only memory.
    s.olvidarSysacad();
    expect(snapshot(s).copias.pestanas).toEqual([]);
    expect(enviados.at(-1)).toBe('olvidar-pestanas');
    llega(copias());
    s.desvincularSysacad();
    expect(snapshot(s).copias).toEqual({ vinculada: false, guarda: false, alumno: null, pestanas: [] });
  });

  const examenes = (extra = {}) => ({
    fuente: 'sysacad-lindo', para: 'super-cvg', v: 3, tipo: 'examenes', vinculada: true, alumno: 'PEREZ, Juan', fecha: Date.now() - 60_000,
    examenes: [{ materia: 'ANÁLISIS MATEMÁTICO II', dia: '2026-12-10', turno: 'Tarde', teorico: '15:00', practico: null, tribunal: 'Ferreyra' }],
    ...extra,
  });

  it('los exámenes llegan aparte, con el nombre como lo escribe el campus; Salir y desvincular los sacan de la memoria', async () => {
    const { s } = await cargar();
    vi.spyOn(window, 'postMessage').mockImplementation(() => {});
    s.iniciarSysacad();
    expect(snapshot(s).examenes).toBeNull();
    llega(examenes());
    expect(snapshot(s).examenes).toEqual({ vinculada: true, alumno: 'PEREZ, Juan', fecha: expect.any(Number), examenes: [{ materia: 'Análisis Matemático II', dia: '2026-12-10', teorico: '15:00', practico: null }] });
    // Neither the finals nor the tabs change with them, and one that does not pass the check changes nothing.
    expect(snapshot(s)).toMatchObject({ estado: 'buscando', finales: null, copias: null });
    llega(examenes({ examenes: [{ materia: 'Física I', dia: '2026-02-30', turno: null, teorico: null, practico: null, tribunal: null }] }));
    expect(snapshot(s).examenes.examenes).toHaveLength(1);
    s.olvidarSysacad();
    expect(snapshot(s).examenes).toBeNull();
    llega(examenes());
    s.desvincularSysacad();
    expect(snapshot(s).examenes).toEqual({ vinculada: false, alumno: null, fecha: null, examenes: [] });
  });

  it('nada queda en el navegador', async () => {
    const { s } = await cargar();
    vi.spyOn(window, 'postMessage').mockImplementation(() => {});
    localStorage.clear();
    sessionStorage.clear();
    s.iniciarSysacad();
    llega(bien({ fecha: Date.now() }));
    llega(copias());
    llega(examenes());
    expect(localStorage.length + sessionStorage.length).toBe(0);
  });
});

// What a screen sees (useSysacad reads this same value).
const snapshot = (s) => s.estadoSysacad();
