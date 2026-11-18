import { describe, expect, it } from 'vitest';
import { aplanarContenido, moduloDeTarea, normalizarEvento } from './datos';
import { aHtml, contarPalabras, estadoDe, estaVencida, leerEstado, leerTarea, leerTareas, porQueNo, revisarEntrega, tiposAceptados, tiposEnTexto } from './tareas';

const C = 'https://frro.cvg.utn.edu.ar';
const config = (plugin, name, value) => ({ plugin, subtype: 'assignsubmission', name, value: String(value) });
const archivo = (filename, area = 'mod_assign/introattachment/0') => ({ filename, filepath: '/', filesize: 1000, fileurl: `${C}/webservice/pluginfile.php/9/${area}/${filename}`, timemodified: 10, mimetype: 'application/pdf' });
const asignacion = (extra = {}) => ({
  id: 70, cmid: 15, course: 3, name: '<b>TP 2</b>', nosubmissions: 0, submissiondrafts: 1, duedate: 1000, allowsubmissionsfromdate: 0, cutoffdate: 2000,
  requiresubmissionstatement: 0, teamsubmission: 0, timelimit: 0,
  configs: [config('onlinetext', 'enabled', 1), config('onlinetext', 'wordlimitenabled', 1), config('onlinetext', 'wordlimit', 5), config('file', 'enabled', 1), config('file', 'maxfilesubmissions', 2), config('file', 'maxsubmissionsizebytes', 1024), config('file', 'filetypeslist', '.pdf document'), config('comments', 'enabled', 1)],
  intro: `<p>Hacé <strong>todo</strong>.</p><script>robar()</script><a href="${C}/webservice/pluginfile.php/9/mod_assign/intro/guia.pdf">guía</a><a href="javascript:alert(1)">malo</a>`,
  introattachments: [archivo('consigna.pdf')],
  introfiles: [archivo('consigna.pdf'), archivo('figura.png', 'mod_assign/intro')],
  ...extra,
});

describe('leerTarea', () => {
  const t = leerTarea(asignacion(), 'Física');

  it('reads the rules of the task from its settings', () => {
    expect(t).toMatchObject({ id: 70, cmid: 15, materiaId: 3, nombre: 'TP 2', vence: 1000, cierra: 2000, abre: null, borradores: true, declaracion: null, texto: { palabras: 5 } });
    expect(t.archivos).toMatchObject({ cuantos: 2, peso: 1024, tipos: { todos: false } });
    expect(t.archivos.tipos.extensiones).toEqual(expect.arrayContaining(['pdf', 'docx', 'odt']));
  });

  it('keeps the instructions as text with format, without scripts or unsafe links, and file links through the browser session', () => {
    const texto = JSON.stringify(t.consigna);
    expect(texto).toContain('todo');
    expect(texto).not.toMatch(/robar|javascript/);
    expect(texto).toContain(`${C}/pluginfile.php/9/mod_assign/intro/guia.pdf`);
    expect(texto).not.toContain('/webservice/pluginfile.php');
  });

  it('lists the attachments once each, as campus files', () => {
    expect(t.adjuntos.map((a) => a.archivo)).toEqual(['consigna.pdf', 'figura.png']);
    expect(t.adjuntos[0]).toMatchObject({ tipo: 'archivo', nombre: 'consigna', materia: 'Física', materiaId: 3 });
    expect(t.adjuntos[0].direccion.startsWith(`${C}/webservice/pluginfile.php/`)).toBe(true);
  });

  it('knows a task that takes nothing online, one with a statement and a timed one', () => {
    expect(leerTarea(asignacion({ configs: [] })).texto).toBeNull();
    expect(leerTarea(asignacion({ configs: [] })).archivos).toBeNull();
    expect(leerTarea(asignacion({ requiresubmissionstatement: 1, submissionstatement: '<p>Es <b>mío</b></p>' })).declaracion).toBe('Es mío');
    expect(leerTarea(asignacion({ requiresubmissionstatement: 1 })).declaracion).toBe('');
    expect(leerTarea(asignacion({ timelimit: 600 })).conTiempo).toBe(true);
  });

  it('drops what lacks its numbers and tolerates an error', () => {
    expect(leerTarea({ name: 'x' })).toBeNull();
    expect(leerTareas({ exception: 'x' })).toEqual([]);
    expect(leerTareas({ courses: [{ assignments: [asignacion(), { id: 'x' }] }] })).toHaveLength(1);
  });
});

describe('tiposAceptados', () => {
  it('reads extensions, groups and mime types, and leaves to the campus what it does not know', () => {
    expect(tiposAceptados('.PDF, .docx;.zip')).toEqual({ todos: false, extensiones: ['pdf', 'docx', 'zip'] });
    expect(tiposAceptados('pdf').extensiones).toEqual(['pdf']);
    expect(tiposAceptados('application/pdf').extensiones).toEqual(['pdf']);
    expect(tiposAceptados('').todos).toBe(true);
    expect(tiposAceptados('*').todos).toBe(true);
    expect(tiposAceptados('.pdf html_track').todos).toBe(true);
    expect(tiposAceptados('application/x-rara').todos).toBe(true);
  });
  it('says them in words', () => {
    expect(tiposEnTexto(tiposAceptados('.pdf .docx .zip'))).toBe('PDF, DOCX o ZIP');
    expect(tiposEnTexto(tiposAceptados('.pdf'))).toBe('PDF');
    expect(tiposEnTexto(tiposAceptados('document image'))).toMatch(/y otros$/);
    expect(tiposEnTexto(tiposAceptados(''))).toBe('');
  });
});

describe('leerEstado and estadoDe', () => {
  const envio = (status, plugins = []) => ({ id: 9, userid: 1, attemptnumber: 0, timecreated: 1, timemodified: 500, status, groupid: 0, plugins });
  const texto = (html) => ({ type: 'onlinetext', name: 'x', editorfields: [{ name: 'onlinetext', description: 'x', text: html, format: 1 }], fileareas: [{ area: 'submissions_onlinetext', files: [] }] });
  const archivos = (...nombres) => ({ type: 'file', name: 'x', fileareas: [{ area: 'submission_files', files: nombres.map((n) => archivo(n, 'assignsubmission_file/submission_files/9')) }] });

  it('tells a task with nothing, a draft, one handed in and a graded one apart', () => {
    expect(estadoDe(leerEstado({ lastattempt: { canedit: true } }))).toBe('sin');
    expect(estadoDe(leerEstado({ lastattempt: { submission: envio('new') } }))).toBe('sin');
    expect(estadoDe(leerEstado({ lastattempt: { submission: envio('draft', [texto('')]) } }))).toBe('sin');
    expect(estadoDe(leerEstado({ lastattempt: { submission: envio('draft', [archivos('a.pdf')]) } }))).toBe('borrador');
    expect(estadoDe(leerEstado({ lastattempt: { submission: envio('submitted', [texto('<p>Hola</p>')]) } }))).toBe('entregada');
    expect(estadoDe(leerEstado({ lastattempt: { submission: envio('submitted') }, feedback: { gradefordisplay: '8,00&nbsp;/&nbsp;10,00', gradeddate: 7 } }))).toBe('calificada');
  });

  it('reads what was handed in, the grade and the comment with its files', () => {
    const e = leerEstado({
      lastattempt: { submission: envio('submitted', [texto('<p>Mi <b>texto</b></p>'), archivos('a.pdf', 'b.pdf')]), canedit: false, cansubmit: false, graded: true, extensionduedate: 0 },
      feedback: { gradefordisplay: '8,00&nbsp;/&nbsp;10,00', gradeddate: 7, plugins: [
        { type: 'comments', name: 'x', editorfields: [{ name: 'comments', description: 'x', text: '<p>Bien <script>x()</script></p>', format: 1 }] },
        { type: 'file', name: 'x', fileareas: [{ area: 'feedback_files', files: [archivo('correccion.pdf', 'assignfeedback_file/feedback_files/1')] }] },
      ] },
    }, { materia: 'Física', materiaId: 3 });
    expect(e.envio.texto.plano).toBe('Mi texto');
    expect(e.envio.texto.conFormato).toBe(true);
    expect(e.envio.archivos.map((a) => a.archivo)).toEqual(['a.pdf', 'b.pdf']);
    expect(e.devolucion.nota).toBe('8,00 / 10,00');
    expect(JSON.stringify(e.devolucion.comentario)).not.toContain('x()');
    expect(e.devolucion.archivos[0].archivo).toBe('correccion.pdf');
    expect(e.prorroga).toBeNull();
  });

  it('a dash is not a grade, and the grade of a team task comes from its submission', () => {
    expect(leerEstado({ feedback: { gradefordisplay: '-', gradeddate: 0, plugins: [] } }).devolucion).toBeNull();
    expect(leerEstado({ feedback: { gradefordisplay: '- / 10,00', gradeddate: 0 } }).devolucion).toBeNull();
    expect(estadoDe(leerEstado({ lastattempt: { teamsubmission: envio('submitted', [archivos('g.pdf')]) } }))).toBe('entregada');
  });

  it('says when it is overdue and why it cannot be handed in', () => {
    const t = leerTarea(asignacion());
    const sin = leerEstado({ lastattempt: { submission: envio('new'), canedit: false } });
    expect(estaVencida(t, sin, 1500)).toBe(true);
    expect(estaVencida(t, leerEstado({ lastattempt: { submission: envio('new'), extensionduedate: 3000 } }), 1500)).toBe(false);
    expect(porQueNo(t, sin, 2500)).toBe('Ya cerró y no se puede entregar.');
    expect(porQueNo(t, leerEstado({ lastattempt: { locked: true } }), 500)).toMatch(/bloqueadas/);
    expect(porQueNo(t, leerEstado({ lastattempt: { canedit: true } }), 500)).toBeNull();
    expect(porQueNo(leerTarea(asignacion({ nosubmissions: 1 })), sin, 500)).toMatch(/no se entrega por el campus/);
  });
});

describe('the checks before sending', () => {
  const t = leerTarea(asignacion({ requiresubmissionstatement: 1, submissionstatement: 'Es mío' }));
  const pdf = (id, nombre = `${id}.pdf`, peso = 100) => ({ id, nombre, peso });

  it('counts words the way the campus does', () => {
    expect(contarPalabras('  uno dos tres—cuatro\n cinco ')).toBe(5);
    expect(contarPalabras('')).toBe(0);
  });

  it('turns the text into paragraphs, with nothing of it running as HTML', () => {
    expect(aHtml('Hola <b>\n\n chau & listo\nfin')).toBe('<p>Hola &lt;b&gt;</p><p>chau &amp; listo<br>fin</p>');
    expect(aHtml('  \n ')).toBe('');
  });

  it('finds an empty submission, too many words or files, a wrong kind, a heavy file and a repeated name', () => {
    expect(revisarEntrega(t, { aceptada: true }).general).toBe('Escribí el texto o elegí un archivo.');
    expect(revisarEntrega(t, { texto: 'uno dos tres cuatro cinco seis', aceptada: true }).texto).toBe('Tiene 6 palabras y el tope es 5.');
    expect(revisarEntrega(t, { archivos: [pdf('a'), pdf('b'), pdf('c')], aceptada: true }).archivos).toMatch(/hasta 2 archivos/);
    const e = revisarEntrega(t, { archivos: [pdf('a', 'foto.png'), pdf('b', 'grande.pdf', 5000), pdf('c', 'A.pdf'), pdf('d', 'a.pdf')], aceptada: true });
    expect(e.porArchivo.a).toMatch(/no acepta este tipo/);
    expect(e.porArchivo.b).toBe('Pesa 5 KB y el tope es 1 KB.');
    expect(e.porArchivo.c).toBeUndefined();
    expect(e.porArchivo.d).toBe('Ya hay otro archivo con este nombre.');
  });

  it('asks to accept the statement only when it goes to be graded', () => {
    expect(revisarEntrega(t, { texto: 'hola' }).declaracion).toMatch(/aceptar la declaración/);
    expect(revisarEntrega(t, { texto: 'hola', final: false }).declaracion).toBe('');
    expect(revisarEntrega(t, { texto: 'hola', aceptada: true }).declaracion).toBe('');
  });
});

describe('opening a task from a course and from Hoy', () => {
  it('a task of the course page keeps its course and module', () => {
    const items = aplanarContenido([{ id: 1, name: 'TP', modules: [
      { id: 15, modname: 'assign', name: 'TP 2', url: `${C}/mod/assign/view.php?id=15`, modplural: 'Tareas' },
      { id: 16, modname: 'quiz', name: 'Q', url: `${C}/mod/quiz/view.php?id=16`, modplural: 'Cuestionarios' },
    ] }], { id: 3, nombre: 'Física' });
    expect(items[0].tarea).toEqual({ materiaId: 3, cmid: 15 });
    expect(items[1].tarea).toBeUndefined();
  });

  it('a pending task of Hoy points to its page, only from a campus address', () => {
    const evento = (url, modulename = 'assign') => normalizarEvento({ id: 1, activityname: 'TP', modulename, timesort: 1, course: { id: 3, fullname: 'Física' }, url, action: { url: `${url}&action=editsubmission` } });
    expect(evento(`${C}/mod/assign/view.php?id=15`).tarea).toEqual({ materiaId: 3, cmid: 15 });
    expect(evento(`${C}/mod/quiz/view.php?id=15`, 'quiz').tarea).toBeNull();
    expect(evento('https://otro.example/mod/assign/view.php?id=15').tarea).toBeNull();
    expect(moduloDeTarea(`${C}/mod/assign/view.php?id=-3`)).toBeNull();
    expect(moduloDeTarea('no es una dirección')).toBeNull();
  });
});
