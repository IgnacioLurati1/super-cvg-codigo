import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { armarCurso, cargarCurso, cargarCursos, cargarEntregas, cursoParecido, delTablon, itemsDeCurso, itemsDelTablon, leerCursos, mensajesDe, olvidarClassroom, pendientesDe, fechasDe, textosDeCurso } from './classroom';
import { CLAVE_GOOGLE, tokenGoogle } from './google';

const conectar = (token = 'tk') => sessionStorage.setItem(CLAVE_GOOGLE, JSON.stringify({ token, vence: Date.now() + 3_600_000 }));

describe('cursos', () => {
  it('solo pasan los activos con número y nombre, y el link solo si es de Classroom', () => {
    expect(leerCursos([
      { id: '123', name: ' Sistemas\u0007Operativos ', section: '3K2', alternateLink: 'https://classroom.google.com/c/abc', courseState: 'ACTIVE' },
      { id: '124', name: 'Otro', alternateLink: 'https://mal.example/c/abc' },
      { id: '125', name: 'Archivado', courseState: 'ARCHIVED' },
      { id: 'x1', name: 'Sin número' },
      { id: '126', name: '' },
      null,
    ])).toEqual([
      { id: '123', nombre: 'Sistemas Operativos', seccion: '3K2', url: 'https://classroom.google.com/c/abc' },
      { id: '124', nombre: 'Otro', seccion: '', url: null },
    ]);
    expect(leerCursos({ no: 'lista' })).toEqual([]);
  });

  it('el curso parecido sale por las palabras, con su número, sin años ni «comisión»', () => {
    const cursos = [
      { id: '1', nombre: 'Sistemas Operativos 2026', seccion: 'Comisión 3K2' },
      { id: '2', nombre: 'Física I', seccion: '' },
      { id: '3', nombre: 'Física II', seccion: '' },
      { id: '4', nombre: 'Análisis Matemático II', seccion: '2K3' },
    ];
    expect(cursoParecido('Sistemas Operativos 3K2', cursos)?.id).toBe('1');
    expect(cursoParecido('FISICA 1 - 2026', cursos)?.id).toBe('2');
    expect(cursoParecido('Física II', cursos)?.id).toBe('3');
    expect(cursoParecido('Análisis Matemático II - Comisión 2K3', cursos)?.id).toBe('4');
    expect(cursoParecido('Bases de Datos', cursos)).toBeNull();
    expect(cursoParecido('', cursos)).toBeNull();
  });

  it('si dos cursos encajan igual, no elige ninguno', () => {
    expect(cursoParecido('Economía', [{ id: '1', nombre: 'Economía 3K1', seccion: '' }, { id: '2', nombre: 'Economía 3K2', seccion: '' }])).toBeNull();
  });
});

const drive = (id, title) => ({ driveFile: { driveFile: { id, title, alternateLink: `https://drive.google.com/file/d/${id}/view` } } });

describe('armar un curso', () => {
  const curso = armarCurso({
    temas: [{ topicId: '10', name: 'Unidad 1' }, { topicId: '20', name: 'Unidad 2' }, { topicId: '30', name: 'Vacío' }, { topicId: 'x', name: 'Malo' }],
    materiales: [
      { id: '901', title: 'Apuntes U1', topicId: '10', state: 'PUBLISHED', updateTime: '2026-10-01T00:00:00Z', alternateLink: 'https://classroom.google.com/c/1/m/1', materials: [drive('a', 'Teoría.pdf'), drive('b', 'Práctica.pdf')] },
      { id: '902', title: 'Programa', state: 'PUBLISHED', updateTime: '2026-09-01T00:00:00Z', alternateLink: 'https://classroom.google.com/c/1/m/2', materials: [] },
      { id: '903', title: 'Borrador', topicId: '10', state: 'DRAFT', alternateLink: 'https://classroom.google.com/c/1/m/3', materials: [drive('z', 'No.pdf')] },
      { id: '904', title: 'Raro', topicId: '20', state: 'PUBLISHED', updateTime: '2026-10-02T00:00:00Z', materials: [{ link: { url: 'javascript:alert(1)', title: 'Malo' } }, { youtubeVideo: { title: 'Clase 4', alternateLink: 'https://www.youtube.com/watch?v=x' } }] },
    ],
    tareas: [
      { id: '911', title: 'TP 1', topicId: '20', state: 'PUBLISHED', updateTime: '2026-10-05T00:00:00Z', alternateLink: 'https://classroom.google.com/c/1/a/1', dueDate: { year: 2026, month: 11, day: 20 }, dueTime: { hours: 12 }, materials: [drive('c', 'Consigna.pdf'), drive('a', 'Teoría.pdf')] },
      { id: '912', title: 'TP sin fecha', topicId: '20', state: 'PUBLISHED', updateTime: '2026-10-03T00:00:00Z', alternateLink: 'https://classroom.google.com/c/1/a/2' },
    ],
    avisos: [{ id: '921', state: 'PUBLISHED', updateTime: '2026-10-06T00:00:00Z', materials: [{ form: { formUrl: 'https://docs.google.com/forms/d/x', title: 'Encuesta' } }, drive('a', 'Teoría.pdf')] }],
  });

  it('va por tema en el orden de Classroom, después lo sin tema y lo de los avisos', () => {
    expect(curso.map((g) => g.nombre)).toEqual(['Unidad 1', 'Unidad 2', 'Sin tema', 'En los avisos']);
  });

  it('cada archivo es una fila, la tarea también, y en un tema o en los avisos no se repite', () => {
    expect(curso[0].items.map((i) => [i.nombre, i.dato])).toEqual([
      ['Teoría', 'Archivo de Drive, en «Apuntes U1»'],
      ['Práctica', 'Archivo de Drive, en «Apuntes U1»'],
    ]);
    const u2 = curso[1].items.map((i) => [i.nombre, i.icono, i.dato.replace(/\d{2}\/\d{2}(\/\d{2,4})?/, 'FECHA')]);
    expect(u2[0]).toEqual(['TP 1', 'actividad', expect.stringMatching(/^Tarea, para el /)]);
    expect(u2.slice(1)).toEqual([
      ['Consigna', 'documento', 'Archivo de Drive, de la tarea «TP 1»'],
      ['Teoría', 'documento', 'Archivo de Drive, de la tarea «TP 1»'],
      ['TP sin fecha', 'actividad', 'Tarea, sin fecha de entrega'],
      ['Clase 4', 'video', 'Video, en «Raro»'],
    ]);
    expect(curso[2].items).toEqual([{ id: 'sin-tema:0', nombre: 'Programa', url: 'https://classroom.google.com/c/1/m/2', icono: 'texto', tono: 'texto', dato: 'Material de Classroom', creado: Date.UTC(2026, 8, 1) / 1000 }]);
    expect(curso[3].items.map((i) => [i.nombre, i.dato])).toEqual([['Encuesta', 'Formulario, en un aviso']]);
  });

  it('cada fila con el color de su tipo, como en el campus', () => {
    const color = (lista) => lista.map((i) => [i.nombre, i.icono, i.tono]);
    expect(color(curso[1].items)).toEqual([
      ['TP 1', 'actividad', 'actividad'],
      ['Consigna', 'documento', 'pdf'],
      ['Teoría', 'documento', 'pdf'],
      ['TP sin fecha', 'actividad', 'actividad'],
      ['Clase 4', 'video', 'video'],
    ]);
    expect(color(curso[3].items)).toEqual([['Encuesta', 'formulario', 'formulario']]);
    const otros = armarCurso({
      materiales: [{
        id: '905', title: 'Varios', state: 'PUBLISHED', updateTime: '2026-10-02T00:00:00Z', alternateLink: 'https://classroom.google.com/c/1/m/5', materials: [
          drive('d', 'Notas.xlsx'),
          { driveFile: { driveFile: { id: 'e', title: 'Cronograma', alternateLink: 'https://docs.google.com/spreadsheets/d/e/edit' } } },
          { driveFile: { driveFile: { id: 'f', title: 'Sin tipo', alternateLink: 'https://drive.google.com/file/d/f/view' } } },
          { driveFile: { driveFile: { id: 'g', title: 'TP 1. Consignas', alternateLink: 'https://drive.google.com/drive/folders/g' } } },
          { link: { url: 'https://github.com/utn/tp', title: 'Repo' } },
          { link: { url: 'https://utn.edu.ar/x', title: 'UTN' } },
        ],
      }],
    });
    expect(color(otros[0].items)).toEqual([
      ['Notas', 'planilla', 'planilla'],
      ['Cronograma', 'planilla', 'planilla'],
      ['Sin tipo', 'documento', 'drive'],
      ['TP 1. Consignas', 'carpeta', 'drive'],
      ['Repo', 'codigo', 'codigo'],
      ['UTN', 'enlace', 'enlace'],
    ]);
  });

  it('nada en borrador ni con una dirección que no sea web', () => {
    const urls = curso.flatMap((g) => g.items.map((i) => i.url));
    expect(urls.some((u) => u.includes('/z/') || u.startsWith('javascript'))).toBe(false);
  });
});

describe('pedidos a Classroom', () => {
  beforeEach(() => conectar());
  afterEach(() => {
    vi.unstubAllGlobals();
    olvidarClassroom();
    sessionStorage.clear();
  });
  const responder = (fn) => {
    const pedidos = [];
    vi.stubGlobal('fetch', vi.fn(async (url, opciones = {}) => {
      pedidos.push({ url, ...opciones });
      const [status, cuerpo] = fn(new URL(url));
      return { ok: status === 200, status, json: async () => cuerpo };
    }));
    return pedidos;
  };

  it('va directo a Google con el permiso en la cabecera, sin cookies, y sigue las páginas', async () => {
    const pedidos = responder((u) => (u.searchParams.get('pageToken')
      ? [200, { courses: [{ id: '2', name: 'Dos' }] }]
      : [200, { courses: [{ id: '1', name: 'Uno' }], nextPageToken: 'p2' }]));
    expect((await cargarCursos()).map((c) => c.nombre)).toEqual(['Uno', 'Dos']);
    expect(pedidos[0].url).toMatch(/^https:\/\/classroom\.googleapis\.com\/v1\/courses\?/);
    expect(new URL(pedidos[0].url).searchParams.get('studentId')).toBe('me');
    expect(pedidos[0]).toMatchObject({ headers: { Authorization: 'Bearer tk' }, credentials: 'omit', referrerPolicy: 'no-referrer' });
    await cargarCursos();
    expect(pedidos).toHaveLength(2);
  });

  it('una parte sin permiso llega vacía y el resto se ve', async () => {
    responder((u) => {
      if (u.pathname.endsWith('/announcements')) return [403, {}];
      if (u.pathname.endsWith('/topics')) return [200, { topic: [{ topicId: '10', name: 'Unidad 1' }] }];
      if (u.pathname.endsWith('/courseWorkMaterials')) return [200, { courseWorkMaterial: [{ id: '1', topicId: '10', title: 'A', materials: [drive('a', 'A.pdf')] }] }];
      return [200, {}];
    });
    expect((await cargarCurso('99')).map((g) => g.nombre)).toEqual(['Unidad 1']);
  });

  it('un permiso vencido se olvida y pide volver a conectar', async () => {
    responder(() => [401, {}]);
    await expect(cargarCursos()).rejects.toMatchObject({ codigo: 'vencida', message: 'Tu conexión con Classroom venció. Volvé a conectarla.' });
    expect(tokenGoogle()).toBeNull();
  });

  it('sin conexión no pide nada', async () => {
    sessionStorage.clear();
    const pedidos = responder(() => [200, {}]);
    await expect(cargarCursos()).rejects.toMatchObject({ codigo: 'sin-conectar' });
    expect(pedidos).toHaveLength(0);
  });

  it('las entregas: solo las del alumno, y cuentan las entregadas o devueltas', async () => {
    const pedidos = responder(() => [200, { studentSubmissions: [{ courseWorkId: '1', state: 'TURNED_IN' }, { courseWorkId: '2', state: 'RETURNED' }, { courseWorkId: '3', state: 'CREATED' }, { courseWorkId: 'x', state: 'TURNED_IN' }] }]);
    expect([...(await cargarEntregas('99'))]).toEqual(['1', '2']);
    const u = new URL(pedidos[0].url);
    expect(u.pathname).toBe('/v1/courses/99/courseWork/-/studentSubmissions');
    expect(u.searchParams.get('userId')).toBe('me');
  });

  it('otro permiso no ve lo que trajo el anterior', async () => {
    let vuelta = 0;
    responder(() => [200, { courses: [{ id: String(++vuelta), name: `Curso ${vuelta}` }] }]);
    expect((await cargarCursos())[0].nombre).toBe('Curso 1');
    conectar('otro');
    expect((await cargarCursos())[0].nombre).toBe('Curso 2');
  });
});

describe('Classroom dentro de una materia del campus', () => {
  const materia = { id: 7, nombre: 'Física II' };
  const datos = {
    temas: [{ topicId: '10', name: 'Unidad 1' }],
    materiales: [{ id: '901', topicId: '10', title: 'Apuntes', creationTime: '2026-10-01T00:00:00Z', alternateLink: 'https://classroom.google.com/c/1/m/901', materials: [drive('a', 'Teoria.pdf'), { youtubeVideo: { title: 'Clase', alternateLink: 'https://www.youtube.com/watch?v=abcdefghijk' } }] }],
    tareas: [
      { id: '911', title: 'TP 1', creationTime: '2026-10-02T00:00:00Z', alternateLink: 'https://classroom.google.com/c/1/a/911', dueDate: { year: 2026, month: 11, day: 20 }, description: 'Entregar en PDF' },
      { id: '912', title: 'TP viejo', alternateLink: 'https://classroom.google.com/c/1/a/912', dueDate: { year: 2026, month: 9, day: 1 } },
      { id: '913', title: 'Entregado', alternateLink: 'https://classroom.google.com/c/1/a/913', dueDate: { year: 2026, month: 11, day: 25 } },
    ],
    avisos: [
      { id: '921', text: 'Mañana no hay clase.\r\nNos vemos el jueves.', creationTime: '2026-11-04T12:00:00Z', alternateLink: 'https://classroom.google.com/c/1/p/921' },
      { id: '922', text: 'Bienvenidos', creationTime: '2026-08-01T12:00:00Z', materials: [drive('p', 'Programa.pdf')] },
    ],
  };

  it('cada cosa es un ítem con clave propia, en la sección de su tema, y la tarea con su entrega', () => {
    const items = itemsDeCurso(datos, materia);
    expect(items.map((i) => [i.clave.replace(/\..+/, '.x'), i.seccionId, i.tipo, i.nombre])).toEqual([
      ['c901.x', 'c10', 'enlace', 'Teoria'],
      ['c901.x', 'c10', 'enlace', 'Clase'],
      ['c911', 'c0', 'actividad', 'TP 1'],
      ['c912', 'c0', 'actividad', 'TP viejo'],
      ['c913', 'c0', 'actividad', 'Entregado'],
    ]);
    const tp = items.find((i) => i.clave === 'c911');
    expect(tp).toMatchObject({ id: '7-c911', materiaId: 7, materia: 'Física II', origen: 'classroom', clase: 'Tarea de Classroom', descripcion: 'Entregar en PDF', destino: 'https://classroom.google.com/c/1/a/911' });
    expect(tp.fechas).toEqual([{ etiqueta: 'Entrega', cuando: Date.UTC(2026, 10, 20, 23, 59) / 1000 }]);
    expect(items.find((i) => i.nombre === 'Clase')).toMatchObject({ dominio: 'youtube.com', video: 'abcdefghijk', detalle: 'Video, en «Apuntes»' });
    // The same for every student: it can be stored and shared.
    expect(itemsDeCurso(datos, materia).map((i) => i.clave)).toEqual(items.map((i) => i.clave));
  });

  it('los mensajes del tablón conservan sus renglones y marcan los nuevos', () => {
    const revisado = Date.UTC(2026, 9, 1) / 1000;
    const [nuevo, viejo] = mensajesDe(datos, materia, revisado);
    expect(nuevo).toMatchObject({ nombre: 'Mañana no hay clase.', texto: 'Mañana no hay clase.\nNos vemos el jueves.', tipo: 'texto', nuevo: true, campus: 'https://classroom.google.com/c/1/p/921' });
    expect(viejo).toMatchObject({ nombre: 'Bienvenidos', nuevo: false, enlaces: [{ texto: 'Programa', destino: 'https://drive.google.com/file/d/p/view', dominio: 'drive.google.com' }] });
  });

  it('para Hoy: las tareas sin entregar con fecha, y una vencida solo por dos semanas', () => {
    const ahora = Date.UTC(2026, 10, 5) / 1000;
    expect(pendientesDe(datos, new Set(['913']), materia, ahora).map((p) => [p.titulo, p.tipo, p.materiaId])).toEqual([['TP 1', 'Tarea de Classroom', 7]]);
  });

  it('para el Calendario: toda tarea con fecha, la entregada como hecha', () => {
    const fechas = fechasDe(datos, new Set(['913']), materia);
    // Also the old one: the Calendario shows any month.
    expect(fechas.map((f) => [f.titulo, f.hecha ?? false])).toEqual([['TP 1', false], ['TP viejo', false], ['Entregado', true]]);
    expect(fechas[0]).toMatchObject({ id: 'classroom-911', tipo: 'entrega', vencimiento: true, classroom: true, cuando: Date.UTC(2026, 10, 20, 23, 59) / 1000, materiaId: 7, url: 'https://classroom.google.com/c/1/a/911' });
  });

  it('para Consultron: lo que dice cada tarea, material y mensaje, lo nuevo primero, con sus adjuntos por nombre', () => {
    const textos = textosDeCurso(datos);
    expect(textos[0]).toMatchObject({ id: 'a921', clase: 'Mensaje', titulo: 'Mañana no hay clase.', url: 'https://classroom.google.com/c/1/p/921' });
    expect(textos[0].texto).toMatch(/^Mensaje del tablón del .*\nMañana no hay clase\.\nNos vemos el jueves\.$/);
    const tp = textos.find((t) => t.id === 't911');
    expect(tp).toMatchObject({ clase: 'Tarea', titulo: 'TP 1', url: 'https://classroom.google.com/c/1/a/911' });
    expect(tp.texto).toMatch(/^Tarea «TP 1»\. Se entrega el .*20 de noviembre.*\nEntregar en PDF$/);
    expect(textos.find((t) => t.id === 'm901').texto).toBe('Material «Apuntes».\nAdjuntos: Teoria; Clase.');
    // A draft is left out.
    expect(textosDeCurso({ tareas: [{ id: '1', title: 'Borrador', state: 'DRAFT' }] })).toEqual([]);
    expect(textosDeCurso({})).toEqual([]);
  });
});

describe('el tablón y todos los adjuntos, para pasarlos a una sección', () => {
  const materia = { id: 7, nombre: 'Física II' };
  const carpeta = (id, title) => ({ driveFile: { driveFile: { id, title, alternateLink: `https://drive.google.com/drive/folders/${id}` } } });
  const datos = {
    temas: [{ topicId: '10', name: 'Unidad 1' }],
    materiales: [{ id: '901', topicId: '10', title: 'Bibliografía', creationTime: '2026-10-01T00:00:00Z', alternateLink: 'https://classroom.google.com/c/1/m/901', materials: [carpeta('f1', 'TP 1. Consignas'), { gem: { id: 'g', title: 'Tutor de derivadas', url: 'https://gemini.google.com/gem/abc' } }, { algoNuevo: { title: 'Otra cosa', alternateLink: 'https://example.org/x' } }, { algoNuevo: { title: 'Sin dirección' } }, { link: { url: 'javascript:alert(1)', title: 'Malo' } }] }],
    avisos: [
      { id: '922', text: 'Bienvenidos', creationTime: '2026-08-01T12:00:00Z', alternateLink: 'https://classroom.google.com/c/1/p/922', materials: [drive('p', 'Programa.pdf')] },
      { id: '921', text: 'Subí las resoluciones.\nAvisen si ven un error.', creationTime: '2026-11-04T12:00:00Z', alternateLink: 'https://classroom.google.com/c/1/p/921', materials: [carpeta('f2', 'Resoluciones'), { form: { title: 'Encuesta', formUrl: 'https://docs.google.com/forms/d/e/x/viewform' } }, { youtubeVideo: { title: 'Clase 4', alternateLink: 'https://www.youtube.com/watch?v=abcdefghijk' } }, carpeta('f2', 'Resoluciones')] },
      { id: '920', text: 'Borrador', state: 'DRAFT', creationTime: '2026-11-05T12:00:00Z' },
    ],
  };

  it('una carpeta de Drive dice que es una carpeta y conserva los puntos de su nombre; otro tipo de adjunto también aparece', () => {
    const items = itemsDeCurso(datos, materia);
    expect(items.map((i) => [i.nombre, i.detalle])).toEqual([
      ['TP 1. Consignas', 'Carpeta de Drive, en «Bibliografía»'],
      ['Tutor de derivadas', 'Gem de Gemini, en «Bibliografía»'],
      ['Otra cosa', 'Adjunto de Classroom, en «Bibliografía»'],
    ]);
    expect(items[0]).toMatchObject({ tipo: 'enlace', destino: 'https://drive.google.com/drive/folders/f1', dominio: 'drive.google.com' });
  });

  it('cada mensaje y cada adjunto suyo es un ítem del tablón con clave propia, el más nuevo primero', () => {
    const items = itemsDelTablon(datos, materia);
    expect(items.map((i) => [i.clave.replace(/\..+/, '.x'), i.adjuntoDe ?? null, i.tipo, i.nombre])).toEqual([
      ['t921', null, 'texto', 'Subí las resoluciones.'],
      ['t921.x', 't921', 'enlace', 'Resoluciones'],
      ['t921.x', 't921', 'enlace', 'Encuesta'],
      ['t921.x', 't921', 'enlace', 'Clase 4'],
      ['t922', null, 'texto', 'Bienvenidos'],
      ['t922.x', 't922', 'enlace', 'Programa'],
    ]);
    expect(items.every(delTablon)).toBe(true);
    expect(new Set(items.map((i) => i.clave)).size).toBe(items.length);
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
    const [mensaje, carpetaDelMensaje] = items;
    expect(mensaje).toMatchObject({ id: '7-t921', materiaId: 7, origen: 'classroom', seccion: 'Tablón', texto: 'Subí las resoluciones.\nAvisen si ven un error.', campus: 'https://classroom.google.com/c/1/p/921' });
    expect(mensaje.detalle).toMatch(/^\d+ de noviembre, 3 adjuntos$/);
    expect(carpetaDelMensaje).toMatchObject({ detalle: 'Carpeta de Drive, en un mensaje del tablón', destino: 'https://drive.google.com/drive/folders/f2', campus: mensaje.campus });
    // The same for every student, and the same the next time: it can be stored and shared.
    expect(itemsDelTablon(datos, materia).map((i) => i.clave)).toEqual(items.map((i) => i.clave));
    expect(itemsDelTablon({}, materia)).toEqual([]);
  });
});
