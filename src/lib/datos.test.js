import { describe, expect, it } from 'vitest';
import { materiaDeAviso, agruparPendientes, aplanarContenido, armarIcs, armarMes, buscar, claveDia, dominioDe, enlaceSeguro, eventosDelMes, faltan, idDeYoutube, normalizarAviso, normalizarEvento, normalizarEventoMes, nombreDeArchivo, peso, porDia, primeraFrase, recientes, sinExtension, textoPlano, tituloLimpio } from './datos';

const DIA = 86_400;
const AHORA = Math.floor(new Date(2026, 10, 2, 12).getTime() / 1000);

describe('textoPlano', () => {
  it('removes markup and decodes entities', () => {
    expect(textoPlano('<p>Física &amp; <b>Química</b></p>')).toBe('Física & Química');
  });
  it('does not keep script content as markup', () => {
    expect(textoPlano('<img src=x onerror=alert(1)>hola')).toBe('hola');
  });
  it('survives empty values', () => {
    expect(textoPlano(null)).toBe('');
  });
});

describe('enlaceSeguro', () => {
  it('drops dangerous schemes and bad addresses', () => {
    expect(enlaceSeguro('javascript:alert(1)')).toBeNull();
    expect(enlaceSeguro('data:text/html,x')).toBeNull();
    expect(enlaceSeguro('no es url')).toBeNull();
  });
  it('removes any key from the link', () => {
    expect(enlaceSeguro('https://a.example/x?token=abc&y=1')).toBe('https://a.example/x?y=1');
  });
});

describe('faltan', () => {
  it('counts calendar days, not hours', () => {
    expect(faltan(AHORA + 3600, AHORA)).toBe('Vence hoy');
    expect(faltan(AHORA + DIA, AHORA)).toBe('Vence mañana');
    expect(faltan(AHORA + 3 * DIA, AHORA)).toBe('Vence en 3 días');
    expect(faltan(AHORA - 3600, AHORA)).toBe('Venció hoy');
    expect(faltan(AHORA - DIA, AHORA)).toBe('Venció ayer');
    expect(faltan(AHORA - 4 * DIA, AHORA)).toBe('Venció hace 4 días');
  });
});

describe('agruparPendientes', () => {
  it('splits and orders by urgency, most recent overdue first', () => {
    const e = (id, dias) => ({ id, vence: AHORA + dias * DIA });
    const g = agruparPendientes([e(1, 20), e(2, -5), e(3, 2), e(4, -1), e(5, 6)], AHORA);
    expect(g.vencidos.map((x) => x.id)).toEqual([4, 2]);
    expect(g.semana.map((x) => x.id)).toEqual([3, 5]);
    expect(g.despues.map((x) => x.id)).toEqual([1]);
  });
});

describe('normalizarEvento', () => {
  it('cannot carry a dangerous link or markup', () => {
    const e = normalizarEvento({ id: 1, activityname: '<b>TP</b>', modulename: 'assign', timesort: AHORA, course: { id: 2, fullname: 'Mat' }, action: { url: 'javascript:alert(1)' } });
    expect(e.titulo).toBe('TP');
    expect(e.tipo).toBe('Entrega');
    expect(e.url).toBeNull();
  });
});

describe('aplanarContenido', () => {
  const materia = { id: 7, nombre: 'Física' };
  const archivo = (filename) => ({ type: 'file', filename, filepath: '/', filesize: 10, fileurl: `https://c/${filename}`, timemodified: AHORA });
  const secciones = [
    { name: 'Unidad 1', uservisible: true, modules: [
      { id: 1, modname: 'resource', name: 'Apunte', url: 'https://c/1', uservisible: true, contents: [archivo('a.pdf')] },
      { id: 2, modname: 'folder', name: 'Carpeta', url: 'https://c/2', uservisible: true, contents: [archivo('b.pdf'), archivo('c.pdf')] },
      { id: 3, modname: 'url', name: 'Link', url: 'https://c/3', uservisible: true, contents: [{ type: 'url', fileurl: 'https://externo.example/x' }] },
      { id: 4, modname: 'url', name: 'Malo', url: 'https://c/4', uservisible: true, contents: [{ type: 'url', fileurl: 'javascript:alert(1)' }] },
      { id: 5, modname: 'quiz', name: 'Parcial', url: 'https://c/5', modplural: 'Cuestionarios', uservisible: true },
      { id: 6, modname: 'label', name: 'Texto suelto', uservisible: true },
      { id: 10, modname: 'label', name: 'Unidad 1: materiales', uservisible: true, description: '<p>Material de la <b>unidad</b></p><p>Clase por <a href="https://utn.zoom.us/j/1">Zoom</a> y <a href="https://drive.google.com/x">carpeta</a></p><a href="javascript:alert(1)">malo</a><a href="https://drive.google.com/x">otra vez</a><script>robar()</script><img src=x onerror=alert(1)>' },
      { id: 8, modname: 'resource', name: 'Oculto', url: 'https://c/8', uservisible: false, contents: [archivo('z.pdf')] },
    ] },
    { name: 'Oculta', uservisible: false, modules: [{ id: 9, modname: 'quiz', name: 'No', url: 'https://c/9' }] },
  ];
  const items = aplanarContenido(secciones, materia);

  it('skips empty text areas and anything the student cannot see', () => {
    const nombres = items.map((i) => i.nombre);
    expect(nombres).not.toContain('Texto suelto');
    expect(nombres).not.toContain('Oculto');
    expect(nombres).not.toContain('No');
  });
  it('shows a text area as text, one paragraph per line, with only its safe links', () => {
    const texto = items.find((i) => i.tipo === 'texto');
    expect(texto).toMatchObject({ nombre: 'Unidad 1: materiales', clase: 'Texto', destino: null });
    expect(texto.texto.split('\n').slice(0, 2)).toEqual(['Material de la unidad', 'Clase por Zoom y carpeta']);
    expect(texto.texto).not.toContain('robar');
    expect(texto.enlaces).toEqual([
      { texto: 'Zoom', destino: 'https://utn.zoom.us/j/1', dominio: 'utn.zoom.us' },
      { texto: 'carpeta', destino: 'https://drive.google.com/x', dominio: 'drive.google.com' },
    ]);
  });
  it('a text area opens the course page at its place, and is found by its links', () => {
    const texto = items.find((i) => i.tipo === 'texto');
    expect(texto.campus).toBe('https://frro.cvg.utn.edu.ar/course/view.php?id=7#module-10');
    expect(buscar(items, 'zoom').map((i) => i.nombre)).toContain('Unidad 1: materiales');
  });
  it('keeps the module name for one file and file names inside a folder', () => {
    expect(items.filter((i) => i.tipo === 'archivo').map((i) => i.nombre)).toEqual(['Apunte', 'b', 'c']);
  });
  it('falls back to the campus page when a link is unsafe', () => {
    expect(items.find((i) => i.nombre === 'Link').destino).toBe('https://externo.example/x');
    expect(items.find((i) => i.nombre === 'Malo').destino).toBe('https://c/4');
  });
  it('keeps the section id so a section can be hidden', () => {
    const conId = aplanarContenido([{ id: 55, name: 'Notas 2023', modules: [{ id: 1, modname: 'quiz', name: 'x', url: 'https://c/1' }] }], materia);
    expect(conId[0].seccionId).toBe(55);
  });
  it('gives every item a unique id', () => {
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
  });
  it('tolerates an error response instead of a list', () => {
    expect(aplanarContenido({ exception: 'x' }, materia)).toEqual([]);
  });
});

describe('buscar', () => {
  const items = [
    { nombre: 'Guía de ejercicios', seccion: 'Unidad 1', materia: 'Física', modificado: 1 },
    { nombre: 'Apunte', archivo: 'ejercicios-resueltos.pdf', seccion: 'Unidad 2', materia: 'Análisis', modificado: 2 },
    { nombre: 'Programa', seccion: 'Ejercicios', materia: 'Química', modificado: 3 },
  ];
  it('ignores accents and case', () => {
    expect(buscar(items, 'GUIA').map((i) => i.nombre)).toEqual(['Guía de ejercicios']);
    expect(buscar(items, 'analisis')).toHaveLength(1);
  });
  it('needs every word, across fields', () => {
    expect(buscar(items, 'ejercicios fisica').map((i) => i.materia)).toEqual(['Física']);
  });
  it('ranks a match in the name above a match elsewhere', () => {
    expect(buscar(items, 'ejercicios').at(-1).nombre).toBe('Programa');
  });
  it('returns nothing for an empty search', () => {
    expect(buscar(items, '   ')).toEqual([]);
  });
});

describe('recientes', () => {
  it('keeps recent dated items, newest first, within the limit', () => {
    const items = [{ id: 1, modificado: AHORA - DIA }, { id: 2, modificado: AHORA - 100 * DIA }, { id: 3, modificado: 0 }, { id: 4, modificado: AHORA - 3600 }];
    expect(recientes(items, AHORA).map((i) => i.id)).toEqual([4, 1]);
    expect(recientes(items, AHORA, { limite: 1 })).toHaveLength(1);
  });
});

describe('normalizarAviso', () => {
  it('cleans the subject and the link', () => {
    expect(normalizarAviso({ id: 1, subject: '<i>Hola</i>', timecreated: 5, read: 0, contexturl: 'javascript:x' })).toMatchObject({ id: 1, titulo: 'Hola', cuando: 5, leido: false, url: null });
    expect(normalizarAviso({ id: 1, subject: 'x', timecreated: 5, contexturl: 'javascript:x' }).url).toBeNull();
  });
});

describe('peso', () => {
  it('formats sizes in Spanish', () => {
    expect(peso(0)).toBe('');
    expect(peso(500)).toBe('1 KB');
    expect(peso(1_572_864)).toBe('1,5 MB');
  });
});

describe('idDeYoutube', () => {
  it('reads the usual address forms', () => {
    expect(idDeYoutube('https://youtu.be/dQw4w9WgXcQ?t=3')).toBe('dQw4w9WgXcQ');
    expect(idDeYoutube('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(idDeYoutube('https://m.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });
  it('rejects other sites and odd ids', () => {
    expect(idDeYoutube('https://evil.example/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(idDeYoutube('https://youtu.be/../../x')).toBeNull();
    expect(idDeYoutube('no es url')).toBeNull();
  });
});

describe('dominioDe', () => {
  it('shows where a link really goes', () => {
    expect(dominioDe('https://www.elpais.com/nota')).toBe('elpais.com');
    expect(dominioDe('roto')).toBe('');
  });
});

describe('armarMes', () => {
  it('starts on Monday and fills whole weeks', () => {
    const semanas = armarMes(2026, 11);
    expect(semanas[0][0].clave).toBe('2026-10-26');
    expect(semanas[0][6]).toMatchObject({ clave: '2026-11-01', dia: 1, delMes: true });
    expect(semanas.every((s) => s.length === 7)).toBe(true);
    expect(semanas.flat().filter((c) => c.delMes)).toHaveLength(30);
  });
  it('handles a February that fits in four weeks', () => {
    expect(armarMes(2027, 2)).toHaveLength(4);
  });
});

describe('eventosDelMes', () => {
  const respuesta = { weeks: [{ days: [
    { events: [{ id: 2, name: '<b>Cierre</b>', eventtype: 'close', timesort: 200, course: { id: 1, fullname: 'Mat' }, url: 'javascript:x' }] },
    { events: [{ id: 1, name: 'Clase', eventtype: 'course', timesort: 100 }, { id: 2, name: 'Cierre', eventtype: 'close', timesort: 200 }] },
  ] }] };
  it('removes repeats, orders by date and cleans the data', () => {
    const eventos = eventosDelMes(respuesta);
    expect(eventos.map((e) => e.id)).toEqual([1, 2]);
    expect(eventos[1].url).toBeNull();
  });
  it('tells deadlines from everything else', () => {
    const [clase, cierre] = eventosDelMes(respuesta);
    expect(clase.vencimiento).toBe(false);
    expect(cierre.vencimiento).toBe(true);
    expect(clase.materia).toBe('General');
  });
  it('tolerates an empty answer', () => {
    expect(eventosDelMes({})).toEqual([]);
  });
});

describe('porDia', () => {
  it('groups by local calendar day', () => {
    const lunes = new Date(2026, 10, 2, 23, 30).getTime() / 1000;
    const martes = new Date(2026, 10, 3, 0, 30).getTime() / 1000;
    const dias = porDia([{ cuando: lunes }, { cuando: martes }]);
    expect(Object.keys(dias)).toEqual(['2026-11-02', '2026-11-03']);
    expect(claveDia(lunes)).toBe('2026-11-02');
  });
});

describe('armarIcs', () => {
  const evento = { id: 9, titulo: 'TP, final; ya', materia: 'Física\nII', cuando: 1_800_000_000, url: 'https://c/x' };
  const ics = armarIcs([evento], 1_700_000_000);
  it('escapes text so a title cannot add calendar fields', () => {
    expect(ics).toContain('SUMMARY:TP\\, final\\; ya (Física\\nII)');
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
  });
  it('the campus date when an activity opens says so', () => {
    expect(armarIcs([{ ...evento, titulo: 'Cuestionario 3', materia: 'Física I', momento: 'abre' }], 1)).toContain('SUMMARY:Abre Cuestionario 3 (Física I)');
    expect(armarIcs([{ ...evento, titulo: 'Cuestionario 3', materia: 'Física I', momento: 'vence' }], 1)).toContain('SUMMARY:Cuestionario 3 (Física I)');
  });
  it('uses the line endings and UTC times the format requires', () => {
    expect(ics.split('\r\n')[0]).toBe('BEGIN:VCALENDAR');
    expect(ics).toContain('DTSTART:20270115T');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });
  it('a date without a course or a time, and its kind', () => {
    const propio = armarIcs([{ id: 'e1', titulo: 'Parcial', materia: null, cuando: Math.floor(new Date(2026, 10, 20, 12).getTime() / 1000), sinHora: true, tipo: 'parcial', url: null }], 1);
    expect(propio).toMatch(/^SUMMARY:Parcial\r$/m);
    expect(propio).toContain('DTSTART;VALUE=DATE:20261120');
    expect(propio).toContain('CATEGORIES:Parcial');
    // The campus' own dates get the kind their title points to.
    expect(ics).toContain('CATEGORIES:Entrega');
  });
  it('ends each date like Google Calendar: a deadline at its time, a date without a time the next day', () => {
    const vence = armarIcs([{ ...evento, vencimiento: true }], 1);
    expect(vence).toContain(`DTSTART:${new Date((evento.cuando - 3600) * 1000).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`);
    expect(vence).toContain(`DTEND:${new Date(evento.cuando * 1000).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`);
    const clase = armarIcs([evento], 1);
    expect(clase).toContain(`DTEND:${new Date((evento.cuando + 3600) * 1000).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`);
    const fin = armarIcs([{ id: 'e2', titulo: 'Feriado', cuando: Math.floor(new Date(2026, 11, 31, 12).getTime() / 1000), sinHora: true }], 1);
    expect(fin).toContain('DTSTART;VALUE=DATE:20261231');
    expect(fin).toContain('DTEND;VALUE=DATE:20270101');
    expect(fin).toContain('TRANSP:TRANSPARENT');
  });
  it('folds long lines', () => {
    const largo = armarIcs([{ ...evento, titulo: 'x'.repeat(200), url: null }], 1);
    expect(largo.split('\r\n').every((l) => l.length <= 73)).toBe(true);
    expect(largo).not.toContain('URL:');
  });
});

describe('nombres de archivo', () => {
  it('saca lo que disfraza el nombre o apunta a otra carpeta', () => {
    expect(nombreDeArchivo('fact\u202Efdp.exe')).toBe('factfdp.exe');
    expect(nombreDeArchivo('../../x.exe')).toBe('....x.exe');
    expect(nombreDeArchivo('a\\b.pdf')).toBe('ab.pdf');
  });

  it('no lo trata como HTML', () => {
    expect(nombreDeArchivo('<b>.exe')).toBe('<b>.exe');
  });

  it('nunca queda vacío', () => {
    expect(nombreDeArchivo('')).toBe('archivo');
    expect(nombreDeArchivo('..')).toBe('archivo');
    expect(nombreDeArchivo(null)).toBe('archivo');
  });
});

describe('materiaDeAviso', () => {
  const items = [{ id: '3-40', materiaId: 3, materia: 'Física' }, { id: '4-50-/a.pdf', materiaId: 4, materia: 'Química' }];
  const aviso = (extra) => normalizarAviso({ id: 1, subject: 'x', timecreated: 1, ...extra });

  it('usa la materia que nombra el campus', () => {
    expect(materiaDeAviso(aviso({ customdata: '{"courseid":"4"}' }), items)).toEqual({ id: 4, nombre: 'Química' });
  });

  it('si no la nombra, la busca por la actividad del enlace', () => {
    expect(materiaDeAviso(aviso({ contexturl: 'https://frro.cvg.utn.edu.ar/mod/quiz/view.php?id=50' }), items)).toEqual({ id: 4, nombre: 'Química' });
  });

  it('sin pistas o con datos rotos no inventa una', () => {
    expect(materiaDeAviso(aviso({ customdata: '{roto' }), items)).toBeNull();
    expect(materiaDeAviso(aviso({ contexturl: 'https://frro.cvg.utn.edu.ar/course/view.php?id=40' }), items)).toBeNull();
  });
});

describe('primeraFrase', () => {
  it('nombra un texto por su principio, cortado en una palabra', () => {
    expect(primeraFrase('\nCorto\nsegundo')).toBe('Corto');
    const largo = 'Todo el material de la materia está en la carpeta de Drive de cada unidad, con los parciales viejos';
    expect(primeraFrase(largo)).toBe('Todo el material de la materia está en la carpeta de Drive de cada unidad, con…');
    expect(primeraFrase('x'.repeat(120))).toBe(`${'x'.repeat(80)}…`);
  });
});

describe('tituloLimpio', () => {
  // As the campus of UTN FRRo sends them.
  const AVISO = 'Abre en sábado, 24 de octubre de 2026, 09:00: 2026- Evaluación Nro. 2 de Regularidad (SQL) - Recuperatorio';
  const FECHA = 'Se cierra TP UNIDAD 8 - CONTRATOS ADMINISTRATIVOS - COM 403 ISI';

  it('deja solo el nombre que puso el docente', () => {
    expect(tituloLimpio(AVISO)).toBe('Evaluación Nro. 2 de Regularidad (SQL) - Recuperatorio');
    expect(tituloLimpio(FECHA)).toBe('TP UNIDAD 8 - CONTRATOS ADMINISTRATIVOS - COM 403 ISI');
  });

  it('saca lo que Moodle pone adelante o atrás, en mayúsculas o minúsculas', () => {
    expect(tituloLimpio('Cuestionario 3 cierra')).toBe('Cuestionario 3');
    expect(tituloLimpio('Vence TP 2')).toBe('TP 2');
    expect(tituloLimpio('TP 1 se abre')).toBe('TP 1');
    expect(tituloLimpio('TP 2 ESTÁ EN FECHA DE ENTREGA')).toBe('TP 2');
    expect(tituloLimpio('TP 6 debe entregarse.')).toBe('TP 6');
    expect(tituloLimpio('Cierre del TP 3')).toBe('TP 3');
  });

  it('corta la fecha de adelante en el «:» que la cierra, con o sin hora', () => {
    expect(tituloLimpio('Abre en sábado, 24 de octubre de 2026, 09:00 a. m.: Parcial 1')).toBe('Parcial 1');
    expect(tituloLimpio('Cierra el 12/11/2026, 23:59 hs: TP 4')).toBe('TP 4');
    expect(tituloLimpio('Abre el 24 de octubre de 2026: Foro')).toBe('Foro');
    expect(tituloLimpio('Abre en sábado, 24 de octubre de 2026, 09:00: Unidad 2: Redes')).toBe('Unidad 2: Redes');
    // Without a date before it, a «:» stays where it is.
    expect(tituloLimpio('Abre en breve: inscripciones')).toBe('Abre en breve: inscripciones');
  });

  it('saca el año suelto del principio y no el que es parte del nombre', () => {
    expect(tituloLimpio('2026- Parcial')).toBe('Parcial');
    expect(tituloLimpio('2026 - TP 3')).toBe('TP 3');
    expect(tituloLimpio('2025-Coloquio')).toBe('Coloquio');
    expect(tituloLimpio('2026-11 Parcial')).toBe('2026-11 Parcial');
  });

  it('un título común queda igual', () => {
    for (const titulo of ['Clase de consulta', 'Parcial 2026-11', 'Unidad 2: Redes', 'Vencedores 2', 'Cierra el foro de consultas']) {
      expect(tituloLimpio(titulo)).toBe(titulo);
    }
  });

  it('nunca lo deja vacío', () => {
    expect(tituloLimpio('Se cierra')).toBe('Se cierra');
    expect(tituloLimpio('Vence:')).toBe('Vence:');
    expect(tituloLimpio('Abre en sábado, 24 de octubre de 2026, 09:00: 2026-')).toBe('Abre en sábado, 24 de octubre de 2026, 09:00: 2026-');
    expect(tituloLimpio('')).toBe('');
    expect(tituloLimpio(null)).toBe('');
  });

  it('se usa en los avisos y en las fechas', () => {
    expect(normalizarAviso({ id: 1, subject: AVISO, timecreated: 1 }).titulo).toBe('Evaluación Nro. 2 de Regularidad (SQL) - Recuperatorio');
    expect(normalizarEvento({ id: 1, name: FECHA, timesort: 1 }).titulo).toBe('TP UNIDAD 8 - CONTRATOS ADMINISTRATIVOS - COM 403 ISI');
    expect(normalizarEventoMes({ id: 1, name: FECHA, eventtype: 'close', timesort: 1 }).titulo).toBe('TP UNIDAD 8 - CONTRATOS ADMINISTRATIVOS - COM 403 ISI');
  });
});

describe('normalizarEventoMes', () => {
  const evento = (extra) => normalizarEventoMes({ id: 1, name: 'Cuestionario 3 cierra', timesort: 1, ...extra });

  it('prefiere el nombre de la actividad, también limpio', () => {
    expect(evento({ activityname: '<b>Cuestionario 3</b>' }).titulo).toBe('Cuestionario 3');
    expect(evento({ activityname: '2026- Cuestionario 3' }).titulo).toBe('Cuestionario 3');
    expect(evento({ activityname: '  ' }).titulo).toBe('Cuestionario 3');
  });

  it('dice si la fecha es cuando vence o cuando abre', () => {
    expect(['due', 'close', 'expectcompletionon'].map((eventtype) => evento({ eventtype }).momento)).toEqual(['vence', 'vence', 'vence']);
    expect(evento({ eventtype: 'open' }).momento).toBe('abre');
    expect(evento({ eventtype: 'course' }).momento).toBeUndefined();
    expect(evento({}).momento).toBeUndefined();
  });

  it('una tarea o un cuestionario del campus abre su página acá, como en Hoy; lo demás, sin página', () => {
    const campus = 'https://frro.cvg.utn.edu.ar';
    const curso = { id: 7, fullname: 'Física I' };
    expect(evento({ course: curso, url: `${campus}/mod/assign/view.php?id=12` })).toMatchObject({ tarea: { materiaId: 7, cmid: 12 } });
    expect(evento({ course: curso, url: `${campus}/mod/quiz/view.php?id=15` })).toMatchObject({ cuestionario: { materiaId: 7, cmid: 15 } });
    const otros = [evento({ course: curso, url: `${campus}/mod/forum/view.php?id=3` }), evento({ url: `${campus}/mod/assign/view.php?id=12` }), evento({ course: curso, url: 'https://otro.ejemplo/mod/assign/view.php?id=12' })];
    for (const e of otros) expect([e.tarea, e.cuestionario]).toEqual([undefined, undefined]);
  });
});

describe('sinExtension', () => {
  it('saca el final de los archivos conocidos y deja lo demás', () => {
    expect(sinExtension('Notas parcial 2T - 22-10-26.xlsx')).toBe('Notas parcial 2T - 22-10-26');
    expect(sinExtension('16- Práctica 6 - Elección del medio de transmisión.pdf')).toBe('16- Práctica 6 - Elección del medio de transmisión');
    expect(sinExtension('Fechas de parciales (teoría).DOCX')).toBe('Fechas de parciales (teoría)');
    expect(sinExtension('Unidad 2.3')).toBe('Unidad 2.3');
    expect(sinExtension('Versión 1.0')).toBe('Versión 1.0');
    expect(sinExtension('.pdf')).toBe('.pdf');
    expect(sinExtension('')).toBe('');
  });
});
