// Flujos completos en un navegador real, sobre la build, con su CSP. El campus y YouTube están simulados:
// cualquier otro pedido se aborta, así que esto nunca toca al campus real.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inflateSync, strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { buscarEncimados } from './encimados.mjs';
import { buscarChrome, opcionesNavegador, servirDist } from './navegador.mjs';
import { armarPdf } from '../src/lib/pdfDeEjemplo.js';
import { mensajeDeEjemplo } from '../src/lib/demoSysacad.js';

const RAIZ = path.resolve(import.meta.dirname, '..');
const CAPTURAS = path.join(RAIZ, 'capturas');
// axe for the pages, with a second look when something fails. On the first one the sticky header or what fades in may
// still be moving (a scroll to the top, a notice leaving), and a box caught halfway counts as too small or low in
// contrast. A real failure is still there half a second later, once everything stopped.
const AXE = `${fs.readFileSync(path.join(RAIZ, 'node_modules', 'axe-core', 'axe.min.js'), 'utf8')}
;(() => {
  const correr = window.axe.run.bind(window.axe);
  const quieto = () => Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {})));
  window.axe.run = async (...args) => {
    const primera = await correr(...args);
    if (!primera.violations.length) return primera;
    await new Promise((listo) => setTimeout(listo, 500));
    await quieto();
    return correr(...args);
  };
})();`;
fs.mkdirSync(CAPTURAS, { recursive: true });

const CAMPUS = 'https://frro.cvg.utn.edu.ar';
const TOKEN = 'clavedepruebaquenodebesalirnunca00';
const CONTRASENA = 'contrasena-de-prueba';
const ahora = () => Math.floor(Date.now() / 1000);
const DIA = 86_400;
const BASE = ahora();
// The last day of the faculty's academic calendar that ships with the site: past it, nothing of it goes to Google.
const FIN_DEL_CICLO = fs.readFileSync(path.join(RAIZ, 'src/data/facultad/calendario.js'), 'utf8').match(/hasta: '(\d{4}-\d{2}-\d{2})'/)[1];
const LETRA_ENORME = fs.readFileSync(path.join(RAIZ, 'src/lib/ajustes.js'), 'utf8').match(/letra:\s*\[[^\]]*'([^']+)'\s*,?\s*\]/)[1];

// The «Planilla» of the course, as Excel saves it: two sheets, a merged title, shared strings, a date and decimals.
function planillaDeEjemplo() {
  const ns = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const archivos = {
    '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
    'xl/workbook.xml': `<workbook ${ns}><sheets><sheet name="Notas" sheetId="1" r:id="rId1"/><sheet name="Asistencia" sheetId="2" r:id="rId2"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>',
    'xl/sharedStrings.xml': `<sst ${ns}><si><t>Notas del primer parcial</t></si><si><t>Alumno</t></si><si><t>Nota</t></si><si><t>Fecha</t></si><si><t>Ana Pérez</t></si><si><t>Bruno Díaz</t></si><si><t>Clases</t></si></sst>`,
    'xl/styles.xml': `<styleSheet ${ns}><cellXfs><xf numFmtId="0"/><xf numFmtId="2"/><xf numFmtId="14"/></cellXfs></styleSheet>`,
    'xl/worksheets/sheet1.xml': `<worksheet ${ns}><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row><row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2" t="s"><v>2</v></c><c r="C2" t="s"><v>3</v></c></row><row r="3"><c r="A3" t="s"><v>4</v></c><c r="B3" s="1"><v>8.5</v></c><c r="C3" s="2"><v>45967</v></c></row><row r="4"><c r="A4" t="s"><v>5</v></c><c r="B4" s="1"><v>6.25</v></c><c r="C4" s="2"><v>45967</v></c></row></sheetData><mergeCells><mergeCell ref="A1:C1"/></mergeCells></worksheet>`,
    'xl/worksheets/sheet2.xml': `<worksheet ${ns}><sheetData><row r="1"><c r="A1" t="s"><v>1</v></c><c r="B1" t="s"><v>6</v></c></row><row r="2"><c r="A2" t="s"><v>4</v></c><c r="B2"><v>12</v></c></row></sheetData></worksheet>`,
  };
  return Buffer.from(zipSync(Object.fromEntries(Object.entries(archivos).map(([k, v]) => [k, strToU8(v)]))));
}

function pdfMinimo() {
  const objetos = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Contents 5 0 R >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Contents 5 0 R >>',
    '<< /Length 41 >>\nstream\n0 0 1 rg 50 50 200 200 re f\nendstream',
  ];
  let salida = '%PDF-1.4\n';
  const posiciones = objetos.map((cuerpo, i) => {
    const posicion = salida.length;
    salida += `${i + 1} 0 obj\n${cuerpo}\nendobj\n`;
    return posicion;
  });
  const xref = salida.length;
  salida += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n${posiciones.map((p) => `${String(p).padStart(10, '0')} 00000 n \n`).join('')}`;
  salida += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(salida, 'latin1');
}

// The PDF of «Apunte uno»: the blue square of pdfMinimo, with text over it to select, highlight and find. Page 2 also has
// a scanned black square in its top right corner (CCITT, as scanners save pages), that pdf.js draws only with its decoders.
const AZUL = '0 0 1 rg 50 50 200 200 re f';
const PDF_APUNTE = Buffer.from(armarPdf([
  { titulo: 'Semáforos', parrafos: ['Un semáforo cuida la sección crítica.'], dibujo: AZUL },
  { titulo: 'Monitores', parrafos: ['Un monitor junta los datos con sus semáforos.'], dibujo: AZUL, escaneo: [240, 240, 50] },
], { ancho: 300, alto: 300, margen: 64, tamano: 11 }));
// «Apunte uno» with Python in Courier, for the lab (only while `apunteConCodigo`): the indentation is where each line
// starts, as in the PDFs of a course, and the code asks for something with input().
const PDF_CODIGO = Buffer.from(armarPdf([
  { titulo: 'Recursión', parrafos: ['Probá el factorial con distintos números.'], codigo: [
    'def factorial(n):',
    '    if n <= 1:',
    '        return 1',
    '    return n * factorial(n - 1)',
    '',
    'n = int(input("Número: "))',
    'print(f"{n}! = {factorial(n)}")',
  ] },
], { ancho: 420, alto: 420, margen: 48, tamano: 11 }));
let apunteConCodigo = false;
// A summary of El Santo Resumen in PDF with text to mark (only while `santoPdfConTexto`): the PDF of «Apunte uno».
let santoPdfConTexto = false;
// How long the campus takes to send a file, to see «Leyendo» in Buscar.
let demoraArchivo = 0;

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEBgIApD5fRAAAAABJRU5ErkJggg==', 'base64');

const MATERIA_A = { id: 1, fullname: 'Materia A', hidden: false };
const MATERIA_B = { id: 2, fullname: 'Materia B', hidden: false };
const urlArchivo = `${CAMPUS}/webservice/pluginfile.php/1/mod_resource/content/1/apunte.pdf?forcedownload=1`;

const modulo = (id, modname, name, contents = [], extra = {}) => ({ id, modname, name, uservisible: true, url: `${CAMPUS}/mod/${modname}/view.php?id=${id}`, modplural: 'Cuestionarios', contents, ...extra });
let moduloNuevo = false;
let usuarioId = 5;
// Campus functions the page asked for and the simulation does not answer: the last check says which.
const sinSimular = new Set();
const contenido = (curso) => (curso === 1 ? [
  { id: 101, name: 'Unidad 1', uservisible: true, modules: [
    modulo(11, 'resource', 'Apunte uno', [{ type: 'file', filename: 'apunte.pdf', filepath: '/', filesize: 900, fileurl: urlArchivo, mimetype: 'application/pdf', timemodified: BASE - DIA }]),
    modulo(12, 'resource', 'Planilla', [{ type: 'file', filename: 'planilla.xlsx', filepath: '/', filesize: 900, fileurl: `${CAMPUS}/webservice/pluginfile.php/1/mod_resource/content/1/planilla.xlsx`, mimetype: 'application/vnd.ms-excel', timemodified: BASE - 2 * DIA }]),
    modulo(13, 'url', 'Clase grabada', [{ type: 'url', fileurl: 'https://youtu.be/dQw4w9WgXcQ', timemodified: 0 }]),
    modulo(14, 'url', 'Lectura', [{ type: 'url', fileurl: 'http://articulo.example/nota', timemodified: 0 }]),
    modulo(15, 'quiz', 'Parcial', [], { description: '<p>Temas de la <b>unidad</b></p>', dates: [{ label: 'Cierra:', timestamp: ahora() + DIA }] }),
    ...(moduloNuevo ? [modulo(17, 'url', 'Enlace recién subido', [{ type: 'url', fileurl: 'https://articulo.example/nuevo', timemodified: 0 }])] : []),
  ] },
  { id: 102, name: 'Notas 2023', uservisible: true, modules: [modulo(16, 'resource', 'Notas viejas', [{ type: 'file', filename: 'viejas.pdf', filepath: '/', filesize: 900, fileurl: `${CAMPUS}/webservice/pluginfile.php/1/mod_resource/content/1/viejas.pdf`, mimetype: 'application/pdf', timemodified: BASE - 3 * DIA }])] },
] : [{ id: 201, name: 'Unidad única', uservisible: true, modules: [
  modulo(21, 'quiz', 'Práctica'),
  // Links to files of Drive: one shared with anyone who has the link, one that isn't.
  modulo(23, 'url', 'Cuadro compartido', [{ type: 'url', fileurl: 'https://drive.google.com/file/d/archivoPublicoPrueba1/view?usp=sharing', timemodified: 0 }]),
  modulo(24, 'url', 'Cuadro privado', [{ type: 'url', fileurl: 'https://drive.google.com/file/d/archivoPrivadoPrueba1/view', timemodified: 0 }]),
  // A text area, where some courses keep all their material.
  modulo(22, 'label', 'Materiales de la cátedra', [], { url: undefined, description: '<p>Todo el material está en Drive.</p><p><a href="https://drive.google.com/drive/folders/x">Carpeta de la unidad</a> y <a href="https://utn.zoom.us/j/1">clase por Zoom</a></p><script>robar()</script>' }),
] }]);

// In an hour, but still today: after 23 an hour later is tomorrow, and the tests look for them on today.
const enUnRato = () => {
  const ultimoMinuto = new Date();
  ultimoMinuto.setHours(23, 59, 0, 0);
  return Math.min(ahora() + 3600, Math.max(ahora() + 30, Math.floor(ultimoMinuto.getTime() / 1000)));
};
const EVENTOS_MES = () => [
  { id: 31, name: 'Entrega del informe cierra', eventtype: 'due', course: MATERIA_A, timesort: enUnRato(), url: `${CAMPUS}/mod/assign/view.php?id=1` },
  { id: 32, name: 'Clase de consulta', eventtype: 'course', course: MATERIA_B, timesort: enUnRato(), url: `${CAMPUS}/course/view.php?id=2` },
];

// The campus' catalogue, for Inscripción: careers with their years, and courses with and without self enrolment.
const CATEGORIAS = [
  { id: 1, name: 'Ingreso', parent: 0, path: '/1', depth: 1, coursecount: 1, sortorder: 1 },
  { id: 3, name: 'Grado', parent: 0, path: '/3', depth: 1, coursecount: 0, sortorder: 2 },
  { id: 13, name: 'Depto Ingeniería en Sistemas', parent: 3, path: '/3/13', depth: 2, coursecount: 4, sortorder: 3 },
  { id: 9, name: 'Depto Ingeniería Civil', parent: 3, path: '/3/9', depth: 2, coursecount: 1, sortorder: 4 },
];
const CATALOGO = [
  { id: 301, fullname: 'Diseño de Sistemas 2026', shortname: 'DSI', categoryid: 13, categoryname: 'Depto Ingeniería en Sistemas', enrollmentmethods: ['self'], contacts: [{ id: 61, fullname: 'Ana Ejemplo' }, { id: 62, fullname: 'Beto Muestra' }] },
  { id: 302, fullname: 'Física II 2026', shortname: 'FII', categoryid: 13, categoryname: 'Depto Ingeniería en Sistemas', enrollmentmethods: ['self'] },
  { id: 303, fullname: 'Seminario integrador', shortname: 'SEM', categoryid: 13, categoryname: 'Depto Ingeniería en Sistemas', enrollmentmethods: ['manual'] },
  { id: 304, fullname: 'Física II Civil 2026', shortname: 'FIIC', categoryid: 9, categoryname: 'Depto Ingeniería Civil', enrollmentmethods: ['self'] },
  { id: 305, fullname: 'Física II - Mesa de examen 2022', shortname: 'FII22', categoryid: 13, categoryname: 'Depto Ingeniería en Sistemas', enrollmentmethods: ['self'] },
];
const CLAVE_FISICA = 'fisica2026';
const inscriptas = new Set();
// Like the campus: every word in the name, «_» stands for any one letter, accents as they are written.
const comoPatron = (palabra) => new RegExp(palabra.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/_/g, '.'));
const buscaElCampus = (patron) => {
  const palabras = patron.toLowerCase().split(/\s+/).filter(Boolean).map(comoPatron);
  return CATALOGO.filter((c) => palabras.every((p) => p.test(c.fullname.toLowerCase())));
};

// Tareas: two tasks of Materia A, as Moodle 4.4 gives them. «TP próximo» (the one in Hoy, module 2) takes text and up
// to two PDF or DOCX, with drafts and a statement to accept; «TP 1 corregido» (module 18) is graded with a comment.
// The submission and the drafts of upload.php live here while the test runs, and go back to empty after it.
const TAREA_PENDIENTE = 502;
const TAREA_CALIFICADA = 518;
const entregaSimulada = { estado: 'new', texto: '', archivos: [], modificado: 0 };
const borradoresSimulados = new Map();
let proximoBorrador = 734001;
const configsDeTarea = [
  { plugin: 'file', subtype: 'assignsubmission', name: 'enabled', value: '1' },
  { plugin: 'file', subtype: 'assignsubmission', name: 'maxfilesubmissions', value: '2' },
  { plugin: 'file', subtype: 'assignsubmission', name: 'maxsubmissionsizebytes', value: '1048576' },
  { plugin: 'file', subtype: 'assignsubmission', name: 'filetypeslist', value: '.pdf,.docx' },
  { plugin: 'onlinetext', subtype: 'assignsubmission', name: 'enabled', value: '1' },
  { plugin: 'onlinetext', subtype: 'assignsubmission', name: 'wordlimit', value: '0' },
  { plugin: 'onlinetext', subtype: 'assignsubmission', name: 'wordlimitenabled', value: '0' },
  { plugin: 'comments', subtype: 'assignsubmission', name: 'enabled', value: '1' },
  { plugin: 'comments', subtype: 'assignfeedback', name: 'enabled', value: '1' },
  { plugin: 'comments', subtype: 'assignfeedback', name: 'commentinline', value: '0' },
  { plugin: 'file', subtype: 'assignfeedback', name: 'enabled', value: '1' },
];
const tareaDelCampus = (id, cmid, name, extra) => ({
  id, cmid, course: 1, name, nosubmissions: 0, submissiondrafts: 1, sendnotifications: 0, sendlatenotifications: 0, sendstudentnotifications: 1,
  duedate: 0, allowsubmissionsfromdate: BASE - 20 * DIA, grade: 10, timemodified: BASE - 20 * DIA, completionsubmit: 1, cutoffdate: 0, gradingduedate: 0,
  teamsubmission: 0, requireallteammemberssubmit: 0, teamsubmissiongroupingid: 0, blindmarking: 0, hidegrader: 0, revealidentities: 0,
  attemptreopenmethod: 'none', maxattempts: -1, markingworkflow: 0, markingallocation: 0, requiresubmissionstatement: 0, preventsubmissionnotingroup: 0,
  configs: configsDeTarea, intro: '', introformat: 1, introfiles: [], introattachments: [], timelimit: 0, submissionattachments: 0, ...extra,
});
const TAREAS_A = () => [
  tareaDelCampus(TAREA_PENDIENTE, 2, 'TP próximo', {
    duedate: ahora() + 2 * DIA,
    cutoffdate: ahora() + 5 * DIA,
    requiresubmissionstatement: 1,
    submissionstatement: 'Este trabajo es mío, salvo donde cité el de otras personas.',
    submissionstatementformat: 1,
    intro: '<p>Resolvé los ejercicios de la <strong>guía 2</strong> y subí el desarrollo en PDF.</p>',
    introattachments: [{ filename: 'guia-2.pdf', filepath: '/', filesize: 900, fileurl: `${CAMPUS}/webservice/pluginfile.php/33/mod_assign/introattachment/0/guia-2.pdf`, timemodified: BASE - 20 * DIA, mimetype: 'application/pdf', isexternalfile: false }],
  }),
  tareaDelCampus(TAREA_CALIFICADA, 18, 'TP 1 corregido', {
    duedate: BASE - 10 * DIA,
    cutoffdate: BASE - 8 * DIA,
    intro: '<p>Primer trabajo práctico. Respondé las preguntas de la unidad 1.</p>',
  }),
];
const archivoEntregado = (submissionid, f, cuando) => ({ filename: f.filename, filepath: '/', filesize: f.filesize, fileurl: `${CAMPUS}/webservice/pluginfile.php/33/assignsubmission_file/submission_files/${submissionid}/${encodeURIComponent(f.filename)}`, timemodified: cuando, mimetype: f.mimetype, isexternalfile: false });
const pluginsDeEntrega = (texto, archivos) => [
  { type: 'file', name: 'Archivos enviados', fileareas: [{ area: 'submission_files', files: archivos }] },
  { type: 'onlinetext', name: 'Texto en línea', fileareas: [{ area: 'submissions_onlinetext', files: [] }], editorfields: [{ name: 'onlinetext', description: 'Texto en línea', text: texto, format: 1 }] },
  { type: 'comments', name: 'Comentarios de la entrega' },
];
const intentoDe = (submission, { graded = false, canedit = false, cansubmit = false } = {}) => ({
  submission, submissiongroupmemberswhoneedtosubmit: [], submissionsenabled: true, locked: false, graded, canedit, caneditowner: canedit, cansubmit,
  extensionduedate: null, timelimit: 0, blindmarking: false, gradingstatus: graded ? 'graded' : 'notgraded', usergroups: [],
});
const estadoDeTarea = (assignid) => {
  if (assignid === TAREA_CALIFICADA) {
    const entregada = BASE - 11 * DIA;
    return {
      lastattempt: intentoDe({ id: 7018, userid: usuarioId, attemptnumber: 0, timecreated: entregada, timemodified: entregada, timestarted: null, status: 'submitted', groupid: 0, assignment: TAREA_CALIFICADA, latest: 1, plugins: pluginsDeEntrega('<p>Adjunto el desarrollo del TP 1.</p>', [archivoEntregado(7018, { filename: 'tp1.pdf', filesize: 900, mimetype: 'application/pdf' }, entregada)]) }, { graded: true }),
      feedback: {
        grade: { id: 91, assignment: TAREA_CALIFICADA, userid: usuarioId, attemptnumber: 0, timecreated: BASE - 5 * DIA, timemodified: BASE - 5 * DIA, grader: 3, grade: '8.00000' },
        gradefordisplay: '8,00&nbsp;/&nbsp;10,00',
        gradeddate: BASE - 5 * DIA,
        plugins: [
          { type: 'comments', name: 'Comentarios de retroalimentación', editorfields: [{ name: 'comments', description: 'Comentarios de retroalimentación', text: '<p>Muy bien el planteo. En el ejercicio 3 faltó justificar el último paso.</p>', format: 1 }] },
          { type: 'file', name: 'Archivos de retroalimentación', fileareas: [{ area: 'feedback_files', files: [] }] },
        ],
      },
      previousattempts: [],
      warnings: [],
    };
  }
  const e = entregaSimulada;
  const conAlgo = Boolean(e.texto || e.archivos.length);
  const cuando = e.modificado || BASE - DIA;
  return {
    lastattempt: intentoDe(
      { id: 7002, userid: usuarioId, attemptnumber: 0, timecreated: BASE - DIA, timemodified: cuando, timestarted: null, status: e.estado, groupid: 0, assignment: TAREA_PENDIENTE, latest: 1, plugins: pluginsDeEntrega(e.texto, e.archivos.map((f) => archivoEntregado(7002, f, cuando))) },
      { canedit: e.estado !== 'submitted', cansubmit: e.estado === 'draft' && conAlgo },
    ),
    previousattempts: [],
    warnings: [],
  };
};
// What a multipart body brings, part by part: { nombre, archivo, tipo, datos }.
const partesDe = (cuerpo, tipo) => {
  const limite = /boundary=(.+)$/.exec(tipo ?? '')?.[1];
  if (!limite) return [];
  return cuerpo.split(`--${limite}`).slice(1, -1).map((parte) => {
    const corte = parte.indexOf('\r\n\r\n');
    const cabeza = parte.slice(0, corte);
    return { nombre: /name="([^"]*)"/.exec(cabeza)?.[1], archivo: /filename="([^"]*)"/.exec(cabeza)?.[1], tipo: /Content-Type: (.+)/i.exec(cabeza)?.[1]?.trim(), datos: parte.slice(corte + 4, -2) };
  });
};

// Mensajes: the private messages of Ana (user 5), as Moodle 4.4 gives them. One conversation with a teacher, one of a
// course group, and people to look for. Everything starts read, so the count says 0 and the envelope shows no number in
// the other tests; the Mensajes test leaves two messages of the teacher unread, and it all goes back after it.
const DOCENTE = 41;
const CHARLA_NUEVA = 810;
const miembroDelCampus = (id, fullname, extra = {}) => ({
  id, fullname, profileurl: `${CAMPUS}/user/profile.php?id=${id}`,
  profileimageurl: `${CAMPUS}/theme/image.php/boost/core/1/u/f1`, profileimageurlsmall: `${CAMPUS}/theme/image.php/boost/core/1/u/f2`,
  isonline: null, showonlinestatus: false, isblocked: false, iscontact: false, isdeleted: false, canmessageevenifblocked: false,
  canmessage: true, requirescontact: false, contactrequests: [], ...extra,
});
const GENTE_DEL_CAMPUS = [
  miembroDelCampus(DOCENTE, 'Laura Méndez', { iscontact: true, profileimageurl: `${CAMPUS}/pluginfile.php/301/user/icon/boost/f1?rev=4`, profileimageurlsmall: `${CAMPUS}/pluginfile.php/301/user/icon/boost/f2?rev=4` }),
  miembroDelCampus(42, 'Tomás Ferreyra'),
  miembroDelCampus(43, 'Martina Gómez'),
  miembroDelCampus(44, 'Mariano Quiroga'),
];
const miembroPorId = (id) => GENTE_DEL_CAMPUS.find((m) => m.id === id) ?? miembroDelCampus(id, id === 5 ? 'Ana Alumna' : 'Beto Alumno');
// What the campus keeps of a message written with no format: the text as HTML.
const textoDelCampus = (texto) => `<p>${texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</p>`;
const CHARLAS_INICIALES = () => [
  { id: 801, type: 1, name: '', subname: null, imageurl: null, gente: [5, DOCENTE], noLeidos: 0, mensajes: [
    { id: 9001, useridfrom: 5, text: '<p>Hola, profe. ¿El TP 2 se entrega en grupo?</p>', timecreated: BASE - 2 * DIA },
    { id: 9002, useridfrom: DOCENTE, text: '<p>Sí, de hasta tres personas.</p>', timecreated: BASE - 2 * DIA + 1800 },
    { id: 9003, useridfrom: DOCENTE, text: `<p>Subí al aula el <a href="${CAMPUS}/mod/resource/view.php?id=11">enunciado actualizado</a>.</p>`, timecreated: BASE - 3600 },
  ] },
  { id: 802, type: 2, name: 'Grupo 3', subname: 'MA', imageurl: `${CAMPUS}/theme/image.php/boost/core/1/g/g1`, gente: [5, 42, 44], noLeidos: 0, mensajes: [
    { id: 9010, useridfrom: 42, text: '<p>¿Nos juntamos el jueves?</p>', timecreated: BASE - 3 * DIA },
    { id: 9011, useridfrom: 5, text: '<p>Dale, después de clase.</p>', timecreated: BASE - 3 * DIA + 600 },
  ] },
];
const charlasSimuladas = new Map();
const reiniciarCharlas = () => {
  charlasSimuladas.clear();
  for (const c of CHARLAS_INICIALES()) charlasSimuladas.set(c.id, c);
};
reiniciarCharlas();
let proximoMensaje = 9101;
// The next answer in a conversation comes back empty, as when the campus doesn't say what happened: it isn't kept.
let fallaElProximoMensaje = false;
const ultimoDe = (c) => c.mensajes.at(-1);
const conversacionDelCampus = (c, yo) => {
  const ultimo = ultimoDe(c);
  const miembros = c.type === 1 ? c.gente.filter((id) => id !== yo) : (ultimo ? [ultimo.useridfrom] : []);
  return {
    id: c.id, name: c.name, subname: c.subname, imageurl: c.imageurl, type: c.type, membercount: c.gente.length, ismuted: false,
    isfavourite: false, isread: c.noLeidos === 0, unreadcount: c.noLeidos || null, members: miembros.map(miembroPorId),
    messages: ultimo ? [ultimo] : [], candeletemessagesforallusers: false,
  };
};

// The campus notifications: «Aviso nuevo» for Avisos in Hoy. The bell test puts in its own, as Moodle 4.x sends them,
// noisy as the campus mails, and closes them at the end, as the campus answers a function its app access leaves closed.
const AVISO_NUEVO = () => ({ id: 1, subject: 'Aviso nuevo', timecreated: ahora(), read: false, contexturl: `${CAMPUS}/mod/quiz/view.php?id=15`, customdata: '{"quizid":"1"}' });
let notificacionesSimuladas = null;
let notificacionesCerradas = false;
const notificacionesDelCampus = () => notificacionesSimuladas ?? [AVISO_NUEVO()];
const CERRADA = { exception: 'webservice_access_exception', errorcode: 'accessexception', message: 'Excepción al control de acceso' };
// Two campus quizzes, only read: «Parcial» of Materia A, open, with one attempt graded and its review open, and «Práctica»
// of Materia B, whose review and grade show only once it closes. `cuestionariosCerrados` answers like a campus that
// leaves its quizzes closed to the app, and `parcialEnHoy` adds the quiz to the pending dates of Hoy.
let cuestionariosCerrados = false;
let parcialEnHoy = false;
const SIEMPRE = 0x11110;
const AL_CERRAR = 0x10;
const revisionDelQuiz = (bits, global) => ({ reviewattempt: bits, reviewcorrectness: bits, reviewmarks: bits, reviewspecificfeedback: bits, reviewgeneralfeedback: bits, reviewrightanswer: bits, reviewoverallfeedback: global });
const CUESTIONARIOS = () => [
  { id: 615, coursemodule: 15, course: 1, name: 'Parcial', intro: '<p>Procesos y <b>sincronización</b>. Tenés 30 minutos desde que empezás.</p>', introformat: 1, introfiles: [],
    timeopen: BASE - 5 * DIA, timeclose: ahora() + DIA, timelimit: 1800, attempts: 2, grademethod: 1, grade: 10, sumgrades: 3, decimalpoints: 2, questiondecimalpoints: -1,
    hasfeedback: 1, hasquestions: 1, ...revisionDelQuiz(SIEMPRE, SIEMPRE & ~0x10000) },
  { id: 621, coursemodule: 21, course: 2, name: 'Práctica', intro: '', introformat: 1, introfiles: [],
    timeopen: BASE - 2 * DIA, timeclose: BASE + 3 * DIA, timelimit: 1200, attempts: 1, grademethod: 1, grade: 10, sumgrades: 5, decimalpoints: 1, questiondecimalpoints: -1,
    hasfeedback: 0, hasquestions: 1, ...revisionDelQuiz(AL_CERRAR, AL_CERRAR) },
];
const INTENTOS_DEL_CAMPUS = {
  615: [{ id: 7151, quiz: 615, userid: 5, attempt: 1, uniqueid: 81, layout: '1,2,3,0', currentpage: 0, preview: 0, state: 'finished', timestart: BASE - 2 * DIA, timefinish: BASE - 2 * DIA + 1380, timemodified: BASE - 2 * DIA + 1380, sumgrades: 1.5 }],
  // The campus blanks the marks the quiz does not show yet.
  621: [{ id: 7211, quiz: 621, userid: 5, attempt: 1, uniqueid: 82, layout: '1,0', currentpage: 0, preview: 0, state: 'finished', timestart: BASE - DIA, timefinish: BASE - DIA + 960, timemodified: BASE - DIA + 960, sumgrades: null }],
};
const preguntaDelCampus = (slot, type, state, status, mark, formulacion, devolucion) => ({
  slot, type, page: 0, questionnumber: String(slot), number: slot, state, status, mark, maxmark: '1,00', flagged: false, sequencecheck: 2, lastactiontime: BASE - 2 * DIA + 1380, hasautosave: false,
  html: `<div id="question-81-${slot}" class="que ${type} deferredfeedback ${{ gradedright: 'correct', gradedwrong: 'incorrect', gradedpartial: 'partiallycorrect' }[state]}"><div class="info"><h3 class="no">Pregunta <span class="qno">${slot}</span></h3><div class="state">${status}</div><div class="grade">Se puntúa ${mark} sobre 1,00</div></div>`
    + `<div class="content"><div class="formulation clearfix"><h4 class="accesshide">Enunciado de la pregunta</h4>${formulacion}</div><div class="outcome clearfix"><h4 class="accesshide">Retroalimentación</h4><div class="feedback">${devolucion}</div></div></div></div>`,
});
const opcionDelCampus = (i, texto, { elegida = false, marca = '' } = {}) => `<div class="r${i % 2}${marca ? ` ${marca}` : ''}"><input type="radio" name="q81:1_answer" value="${i}" disabled${elegida ? ' checked="checked"' : ''}><div class="d-flex"><span class="answernumber">${'abc'[i]}. </span><div class="flex-fill">${texto}</div></div></div>`;
const REVISION_DEL_PARCIAL = () => ({
  grade: '5.00',
  attempt: INTENTOS_DEL_CAMPUS[615][0],
  additionaldata: [{ id: 'feedback', title: 'Retroalimentación', content: '<p>Repasá la unidad 2 antes del final.</p>' }],
  questions: [
    preguntaDelCampus(1, 'multichoice', 'gradedright', 'Correcta', '1,00',
      `<div class="qtext"><p>¿Qué garantiza un semáforo binario bien usado?</p></div><div class="ablock"><div class="answer">${opcionDelCampus(0, 'Exclusión mutua', { elegida: true, marca: 'correct' })}${opcionDelCampus(1, 'Que no haya inanición')}${opcionDelCampus(2, 'Planificación por prioridad')}</div></div>`,
      '<div class="specificfeedback">Tu respuesta es correcta.</div><div class="rightanswer">La respuesta correcta es: Exclusión mutua</div>'),
    preguntaDelCampus(2, 'truefalse', 'gradedwrong', 'Incorrecta', '0,00',
      '<div class="qtext"><p>Un proceso zombie ya liberó su entrada en la tabla de procesos.</p></div><div class="ablock"><div class="answer"><div class="r0 incorrect"><input type="radio" value="1" disabled checked="checked"><label>Verdadero</label></div><div class="r1"><input type="radio" value="0" disabled><label>Falso</label></div></div></div>',
      '<div class="specificfeedback">Le queda su entrada hasta que el padre lea su estado.</div><div class="rightanswer">La respuesta correcta es \'Falso\'</div>'),
    preguntaDelCampus(3, 'shortanswer', 'gradedpartial', 'Parcialmente correcta', '0,50',
      '<div class="qtext"><p>¿Qué llamada al sistema crea un proceso en Unix?</p></div><div class="ablock"><label>Respuesta:</label><span class="answer"><input type="text" value="clone" readonly class="form-control partiallycorrect"></span></div>',
      '<div class="specificfeedback">clone también crea procesos en Linux, pero la de Unix es otra.</div><div class="rightanswer">La respuesta correcta es: fork</div>'),
  ],
  warnings: [],
});
const quizDelPedido = (p) => Number(p.get('quizid'));
const quizCerrado = () => ({ exception: 'webservice_access_exception', errorcode: 'accessexception', message: 'Access control exception' });

const RESPUESTAS = {
  core_webservice_get_site_info:() => ({ userid: usuarioId, username: usuarioId === 5 ? 'alumno' : 'beto', firstname: usuarioId === 5 ? 'Ana' : 'Beto', fullname: usuarioId === 5 ? 'Ana María Gómez' : 'Beto Suárez' }),
  core_enrol_get_users_courses: () => [MATERIA_A, MATERIA_B, ...CATALOGO.filter((c) => inscriptas.has(c.id)).map((c) => ({ id: c.id, fullname: c.fullname, hidden: false }))],
  core_course_get_categories: () => CATEGORIAS,
  core_course_search_courses: (p) => {
    const cursos = buscaElCampus(p.get('criteriavalue') ?? '');
    return { total: cursos.length, courses: cursos, warnings: [] };
  },
  core_course_get_courses_by_field: (p) => ({ courses: CATALOGO.filter((c) => p.get('field') === 'category' && c.categoryid === Number(p.get('value'))), warnings: [] }),
  core_enrol_get_course_enrolment_methods: (p) => {
    const curso = CATALOGO.find((c) => c.id === Number(p.get('courseid')));
    return curso?.enrollmentmethods.includes('self') ? [{ id: 900 + curso.id, courseid: curso.id, type: 'self', name: 'Auto-inscripción', status: true }] : [];
  },
  enrol_self_get_instance_info: (p) => ({ id: Number(p.get('instanceid')), courseid: Number(p.get('instanceid')) - 900, type: 'self', name: 'Auto-inscripción', status: true, enrolpassword: Number(p.get('instanceid')) === 900 + 302 ? 'Se necesita una clave' : '' }),
  enrol_self_enrol_user: (p) => {
    const curso = Number(p.get('courseid'));
    if (curso === 302 && p.get('password') !== CLAVE_FISICA) return { status: false, warnings: [{ item: 'course', itemid: 302, warningcode: '4', message: 'Clave incorrecta, la primera letra es f' }] };
    inscriptas.add(curso);
    return { status: true, warnings: [] };
  },
  core_course_get_enrolled_courses_by_timeline_classification: () => ({ courses: [MATERIA_A] }),
  core_calendar_get_action_events_by_timesort: () => ({ events: [
    { id: 1, activityname: 'TP vencido', modulename: 'assign', timesort: ahora() - DIA, course: MATERIA_A, action: { url: `${CAMPUS}/mod/assign/view.php?id=1` } },
    { id: 2, activityname: 'TP próximo', modulename: 'assign', timesort: ahora() + 2 * DIA, course: MATERIA_A, action: { url: `${CAMPUS}/mod/assign/view.php?id=2` } },
    ...(parcialEnHoy ? [{ id: 3, activityname: 'Parcial', modulename: 'quiz', timesort: ahora() + 4 * DIA, course: MATERIA_A, action: { url: `${CAMPUS}/mod/quiz/view.php?id=15` } }] : []),
  ] }),
  core_calendar_get_calendar_monthly_view: () => ({ weeks: [{ days: [{ events: EVENTOS_MES() }] }] }),
  core_course_get_contents: (p) => contenido(Number(p.get('courseid'))),
  mod_assign_get_assignments: (p) => ({
    courses: [MATERIA_A, MATERIA_B].filter((c) => String(c.id) === p.get('courseids[0]')).map((c) => ({ id: c.id, fullname: c.fullname, shortname: c.id === 1 ? 'MA' : 'MB', timemodified: BASE - 30 * DIA, assignments: c.id === 1 ? TAREAS_A() : [] })),
    warnings: [],
  }),
  mod_assign_get_submission_status: (p) => estadoDeTarea(Number(p.get('assignid'))),
  // Like the campus: the text replaces the one there, and a draft number leaves in the submission just the files of that
  // draft (an unknown one, as the «1» of the Moodle app, leaves none). Answers with its warnings, empty when it saved.
  mod_assign_save_submission: (p) => {
    const id = Number(p.get('assignmentid'));
    if (id !== TAREA_PENDIENTE || entregaSimulada.estado === 'submitted') return [{ item: 'TP próximo', itemid: id, warningcode: 'couldnotsavesubmission', message: 'Esta entrega ya no se puede cambiar.' }];
    const texto = p.get('plugindata[onlinetext_editor][text]');
    if (texto !== null) entregaSimulada.texto = texto;
    const borrador = p.get('plugindata[files_filemanager]');
    if (borrador !== null) entregaSimulada.archivos = [...(borradoresSimulados.get(Number(borrador)) ?? [])];
    entregaSimulada.estado = 'draft';
    entregaSimulada.modificado = ahora();
    return [];
  },
  mod_assign_submit_for_grading: (p) => {
    const id = Number(p.get('assignmentid'));
    const vacia = !entregaSimulada.texto && !entregaSimulada.archivos.length;
    if (id !== TAREA_PENDIENTE || entregaSimulada.estado !== 'draft' || vacia) return [{ item: 'TP próximo', itemid: id, warningcode: 'couldnotsubmitforgrading', message: `User id ${usuarioId} could not submit assignment ${id}` }];
    if (p.get('acceptsubmissionstatement') !== '1') return [{ item: 'TP próximo', itemid: id, warningcode: 'couldnotsubmitforgrading', message: 'Debe aceptar la declaración de entrega.' }];
    entregaSimulada.estado = 'submitted';
    entregaSimulada.modificado = ahora();
    return [];
  },
  mod_quiz_get_quizzes_by_courses: (p) => (cuestionariosCerrados ? quizCerrado() : { quizzes: CUESTIONARIOS().filter((q) => String(q.course) === p.get('courseids[0]')), warnings: [] }),
  mod_quiz_get_user_attempts: (p) => ({ attempts: INTENTOS_DEL_CAMPUS[quizDelPedido(p)] ?? [], warnings: [] }),
  mod_quiz_get_quiz_access_information: (p) => ({
    canattempt: true, canmanage: false, canpreview: false, canreviewmyattempts: true, canviewreports: false, warnings: [],
    accessrules: [], activerulenames: quizDelPedido(p) === 615 ? ['quizaccess_numattempts', 'quizaccess_timelimit'] : ['quizaccess_numattempts', 'quizaccess_timelimit', 'quizaccess_password'],
    preventaccessreasons: quizDelPedido(p) === 621 ? ['No se permiten más intentos'] : [],
  }),
  mod_quiz_get_user_best_grade: (p) => (quizDelPedido(p) === 615 ? { hasgrade: true, grade: 5, gradetopass: 6, warnings: [] } : { hasgrade: false, gradetopass: 0, warnings: [] }),
  mod_quiz_get_quiz_feedback_for_grade: () => ({ feedbacktext: '<p>Repasá la unidad 2 antes del final.</p>', feedbackinlinefiles: [], warnings: [] }),
  mod_quiz_get_combined_review_options: () => ({ someoptions: [{ name: 'marks', value: 2 }], alloptions: [{ name: 'marks', value: 2 }, { name: 'overallfeedback', value: 1 }], warnings: [] }),
  // Like the campus: the review of an attempt whose quiz does not show it yet is an error.
  mod_quiz_get_attempt_review: (p) => (p.get('attemptid') === '7151' ? REVISION_DEL_PARCIAL() : { exception: 'moodle_quiz_exception', errorcode: 'noreview', message: 'No tiene permiso para revisar este intento.' }),
  core_message_get_unread_conversations_count: () => [...charlasSimuladas.values()].filter((c) => c.noLeidos > 0).length,
  core_message_get_conversations: (p) => {
    const yo = Number(p.get('userid'));
    const desde = Number(p.get('limitfrom')) || 0;
    const cuantas = Number(p.get('limitnum')) || undefined;
    const todas = [...charlasSimuladas.values()].filter((c) => c.gente.includes(yo)).sort((a, b) => (ultimoDe(b)?.timecreated ?? 0) - (ultimoDe(a)?.timecreated ?? 0));
    return { conversations: todas.slice(desde, cuantas && desde + cuantas).map((c) => conversacionDelCampus(c, yo)) };
  },
  core_message_get_conversation_messages: (p) => {
    const c = charlasSimuladas.get(Number(p.get('convid')));
    if (!c?.gente.includes(Number(p.get('currentuserid')))) return { exception: 'moodle_exception', errorcode: 'generalexceptionmessage', message: 'User is not part of conversation.' };
    const desde = Number(p.get('limitfrom')) || 0;
    const cuantos = Number(p.get('limitnum')) || undefined;
    const tanda = (p.get('newest') === '1' ? [...c.mensajes].reverse() : [...c.mensajes]).slice(desde, cuantos && desde + cuantos);
    return { id: c.id, members: [...new Set(tanda.map((m) => m.useridfrom))].map(miembroPorId), messages: tanda };
  },
  core_message_message_search_users: (p) => {
    const yo = Number(p.get('userid'));
    const buscado = (p.get('search') ?? '').toLocaleLowerCase('es');
    const halladas = GENTE_DEL_CAMPUS.filter((m) => m.id !== yo && m.fullname.toLocaleLowerCase('es').includes(buscado)).map((m) => ({
      ...m,
      conversations: [...charlasSimuladas.values()].filter((c) => c.gente.includes(m.id) && c.gente.includes(yo)).map((c) => ({ id: c.id, type: c.type, name: c.name, timecreated: c.mensajes[0]?.timecreated ?? BASE })),
    }));
    return { contacts: halladas.filter((m) => m.iscontact), noncontacts: halladas.filter((m) => !m.iscontact) };
  },
  core_message_send_messages_to_conversation: (p) => {
    const c = charlasSimuladas.get(Number(p.get('conversationid')));
    if (!c?.gente.includes(usuarioId)) return { exception: 'moodle_exception', errorcode: 'nopermissions', message: 'Sin permiso' };
    if (fallaElProximoMensaje) {
      fallaElProximoMensaje = false;
      return [];
    }
    const m = { id: proximoMensaje++, useridfrom: usuarioId, text: textoDelCampus(p.get('messages[0][text]') ?? ''), timecreated: ahora() };
    c.mensajes.push(m);
    return [m];
  },
  // Like the campus: a message to someone goes to the conversation of the two, and it opens one when there is none.
  core_message_send_instant_messages: (p) => {
    const otra = Number(p.get('messages[0][touserid]'));
    if (!GENTE_DEL_CAMPUS.some((m) => m.id === otra)) return [{ msgid: -1, clientmsgid: null, errormessage: 'No se puede mandar el mensaje a este usuario' }];
    let c = [...charlasSimuladas.values()].find((x) => x.type === 1 && x.gente.includes(otra) && x.gente.includes(usuarioId));
    if (!c) {
      c = { id: CHARLA_NUEVA, type: 1, name: '', subname: null, imageurl: null, gente: [usuarioId, otra], noLeidos: 0, mensajes: [] };
      charlasSimuladas.set(c.id, c);
    }
    const m = { id: proximoMensaje++, useridfrom: usuarioId, text: textoDelCampus(p.get('messages[0][text]') ?? ''), timecreated: ahora() };
    c.mensajes.push(m);
    return [{ msgid: m.id, clientmsgid: null, text: m.text, timecreated: m.timecreated, conversationid: c.id, useridfrom: usuarioId, candeletemessagesforallusers: false }];
  },
  core_message_mark_all_conversation_messages_as_read: (p) => {
    const c = charlasSimuladas.get(Number(p.get('conversationid')));
    if (c) c.noLeidos = 0;
    return null;
  },
  message_popup_get_popup_notifications: () => {
    if (notificacionesCerradas) return CERRADA;
    const lista = notificacionesDelCampus();
    return { notifications: lista, unreadcount: lista.filter((n) => !n.read).length };
  },
  message_popup_get_unread_popup_notification_count: () => (notificacionesCerradas ? CERRADA : notificacionesDelCampus().filter((n) => !n.read).length),
};

// El Santo Resumen, simulated too: its index of official pages, its bank and its tips.
const SANTO_INDICE_URL = 'https://lutastudios.com/utn/_/indice-carrera.json';
const SANTO_SERVICIO = 'https://lomhlulbgfovtnljbqzp.supabase.co';
const SO = 'sistemas-operativos';
const SANTO_INDICE = [
  { s: SO, n: 'Sistemas Operativos', e: [
    ['index.html', 'Para entender', 'la-materia', 'La materia, contada de una', 'Un sistema operativo administra la máquina.'],
    ['parcial-1.html', '1° parcial', 'planificacion', 'Planificación de procesos', 'FIFO, SJF y Round Robin con su quantum.'],
    ['parcial-2.html', '2° parcial', 'memoria-virtual', 'Memoria virtual', 'Paginación por demanda y reemplazo de páginas.'],
    ['ej-puente.html', 'Ejercicios', 'enunciado', 'Semáforos del puente', 'Sincronizar autos con semáforos.'],
  ] },
  { s: 'fisica-i', n: 'Física I', e: [['final.html', 'Final', 'cinematica', 'Cinemática', 'Planificación de trayectorias.']] },
];
// The photo of the first page of a published summary (015 of the service): `foto` in the bank, and the image in the
// public folder of photos. The image is a page drawn at the start (FOTO_HOJA). `rotas` are ids whose image does not
// load; `demora` holds every image.
const fotoDe = (id) => ({ url: `${SANTO_SERVICIO}/storage/v1/object/public/fotos/${id.toLowerCase()}/1-0123456789abcdef0123456789abcdef.jpg`, ancho: 480, alto: 679 });
const santoFotos = { rotas: new Set(), demora: 0 };
const SANTO_TEXTOS = [];
const SANTO_BANCO = [
  { id: '0b6f2a8e-1c11-4d0a-9a51-2f6a8b1c0d01', materia: SO, instancia: 'parcial-1', titulo: 'Resumen del 1° parcial', me_gusta: 4, autor: 'santi', tipo: 'pdf', foto: fotoDe('0b6f2a8e-1c11-4d0a-9a51-2f6a8b1c0d01') },
  { id: '0b6f2a8e-1c11-4d0a-9a51-2f6a8b1c0d02', materia: SO, instancia: 'final', titulo: 'Final con teoría', me_gusta: 0, autor: 'ana', tipo: 'html' },
];
// What El Santo Resumen answers when a summary is read here. Whatever could run must not, inside the frame.
const SANTO_HTML = '<!doctype html><html><head><title>Final</title><script>parent.document.title = "robado"</script></head><body>'
  + '<h1>Semáforos y monitores</h1><p>Un <a href="#final">salto al final</a> y <a href="https://utn.edu.ar">la UTN</a>.</p>'
  + '<img alt="" src="data:," onerror="parent.document.title = \'robado\'"><h2 id="final">Final</h2></body></html>';
// An HTML whose scripts El Santo Resumen lets run: what it shows, it writes itself.
const SANTO_JS = '<!doctype html><html><body><p id="hecho">Sin correr</p><script>document.getElementById("hecho").textContent = "Armado por sus scripts";'
  + 'try { parent.parent.document.title = "robado"; } catch {}</script></body></html>';
// A stand-in for El Santo Resumen's reader (demo-sitio/visor of the panel): it says it is ready and runs what it gets
// in a frame of its own. The real one is tested in the panel; here only how Super CVG talks to it.
const VISOR_FALSO = '<!doctype html><html><body style="margin:0"><iframe id="m" sandbox="allow-scripts" title="Resumen" style="border:0;width:100%;height:100vh"></iframe><script>'
  + 'addEventListener("message", (e) => { if (e.source === parent && e.data && e.data.tipo === "resumen") document.getElementById("m").srcdoc = e.data.html;'
  + ' if (e.source === parent && e.data && e.data.tipo === "soltar-seleccion") document.body.dataset.soltado = "si"; });'
  + 'parent.postMessage({ tipo: "visor-listo" }, "*");</script></body></html>';
const SANTO_VISTA = { texto: 'Memoria virtual.\n\nPaginación por demanda con TLB.\nReemplazo LRU y FIFO.', cortado: true };
const SANTO_CONSEJOS = {
  [SO]: [
    { id: '7c1d0e4a-5b2f-4c3a-8d9e-0f1a2b3c4d01', usuario: 'ana', texto: 'Hacé los ejercicios de semáforos.\nCaen siempre.', n: 3, prom: 4.67 },
    { id: '7c1d0e4a-5b2f-4c3a-8d9e-0f1a2b3c4d02', usuario: 'beto', texto: 'Leé el Stallings antes del 2° parcial.', n: 0, prom: null },
  ],
  general: [{ id: '7c1d0e4a-5b2f-4c3a-8d9e-0f1a2b3c4d03', usuario: 'santi', texto: 'Armá un grupo de estudio.', n: 1, prom: 5 }],
};
let santoCaido = false;
// Files sent without Drive (cvg-temporal): what went up, locked, by its id. Simulated: nothing reaches the real service.
const temporalesSimulados = new Map();
// The student's own account of El Santo Resumen, linked to this site (cvg-*): codes of one use, the key it gives, and
// what the account has. Simulated like the rest: nothing reaches the real service.
const CVG_LLAVE = 'LlaveDePrueba_0123456789-abcdefghijklmnopqr';
const cvgCodigo = (n) => `CodigoDePrueba_${String(n).padStart(4, '0')}-abcdefghijkl`;
const cvgFila = (n, extra) => ({
  id: `5a1e0c3d-2b4f-4e6a-8c9d-0e1f2a3b4c${String(n).padStart(2, '0')}`, materia: SO, instancia: 'parcial-1', titulo: 'Resumen', estado: 'publicado',
  bytes: 120_000, me_gusta: 2, descargas: 3, lecturas: 9, creado: '2026-11-01T12:00:00Z', actualizado: '2026-11-01T12:00:00Z', autor: 'santi',
  comentarios: 0, version: 1, tipo: 'pdf', recomendado: 0, etiquetas: [], ...extra,
});
const CVG_SUBIDOS = [
  cvgFila(1, { titulo: 'Planificación de procesos, con ejercicios' }),
  cvgFila(2, { titulo: 'Memoria virtual paso a paso', instancia: 'parcial-2', estado: 'pendiente', tipo: 'docx' }),
  cvgFila(3, { titulo: 'Apuntes de la cursada 2024', instancia: 'final', estado: 'oculto', tipo: 'pptx' }),
];
const CVG_ENVIADOS = [
  cvgFila(11, { titulo: 'Semáforos del puente, resuelto', instancia: 'parcial-2', tipo: 'html', js: true, autor: 'ana' }),
  cvgFila(12, { titulo: 'Cinemática para el final', materia: 'fisica-i', instancia: 'final', autor: 'beto' }),
  // Hidden in the bank after it was sent: a long title, its mark and «Quitar» in the same row.
  cvgFila(13, { titulo: 'Sincronización con semáforos, monitores y pasaje de mensajes, con todos los ejercicios resueltos', instancia: 'parcial-2', estado: 'oculto', autor: 'caro' }),
];
const santoCvg = { codigos: new Set(), llaves: new Set(), subidos: [], enviados: [], demora: 0, gustos: new Set() };

// Google: the permission window and Classroom, read only. The client is the one of .env.flujos.
const CLIENTE_GOOGLE = 'cliente-de-prueba.apps.googleusercontent.com';
const GTOKEN = 'ya29.permisodepruebadegoogle00';
const GSUB = '109876543210987654321';
const GMAIL = 'ana.alumna@gmail.com';
// The student picks another Google account in Google's window.
let otraCuentaGoogle = false;
// What Google says about the account, for this client and this request (the site does not check the signature).
const idTokenDePrueba = (nonce) => ['{"alg":"RS256"}', JSON.stringify({ iss: 'https://accounts.google.com', aud: CLIENTE_GOOGLE, sub: otraCuentaGoogle ? '200000000000000000002' : GSUB, email: otraCuentaGoogle ? 'ana.otra@gmail.com' : GMAIL, nonce })]
  .map((t) => Buffer.from(t).toString('base64url')).concat('firma').join('.');
const CLASSROOM = 'https://classroom.googleapis.com/v1';
const drive = (id, title) => ({ driveFile: { driveFile: { id, title, alternateLink: `https://drive.google.com/file/d/${id}/view` } } });
const CURSOS_CLASSROOM = [
  { id: '700001', name: 'Sistemas Operativos 2026', section: 'Comisión 3K2', alternateLink: 'https://classroom.google.com/c/NzAwMDAx', courseState: 'ACTIVE' },
  { id: '700002', name: 'Análisis Matemático II', section: '2K3', alternateLink: 'https://classroom.google.com/c/NzAwMDAy', courseState: 'ACTIVE' },
];
// Dates around today: what came this week is new until the student says she saw it.
const haceDias = (d) => new Date(Date.now() - d * DIA * 1000).toISOString();
const enDias = (d) => {
  const f = new Date(Date.now() + d * DIA * 1000);
  return { year: f.getUTCFullYear(), month: f.getUTCMonth() + 1, day: f.getUTCDate() };
};
const CURSO_SO = {
  topics: { topic: [{ topicId: '801', name: 'Unidad 1: Procesos' }, { topicId: '802', name: 'Trabajos prácticos' }] },
  courseWorkMaterials: { courseWorkMaterial: [
    { id: '901', topicId: '801', title: 'Teoría de procesos', state: 'PUBLISHED', creationTime: haceDias(20), updateTime: haceDias(20), alternateLink: 'https://classroom.google.com/c/NzAwMDAx/m/OTAx', materials: [drive('procesos', 'Procesos.pdf'), { link: { url: 'https://pages.cs.wisc.edu/~remzi/OSTEP/', title: 'OSTEP' } }] },
  ] },
  courseWork: { courseWork: [
    { id: '902', topicId: '802', title: 'TP 1: Semáforos', state: 'PUBLISHED', creationTime: haceDias(2), updateTime: haceDias(2), alternateLink: 'https://classroom.google.com/c/NzAwMDAx/a/OTAy', dueDate: enDias(5), dueTime: { hours: 15 }, materials: [drive('consigna', 'Consigna TP 1.pdf')] },
    { id: '905', topicId: '802', title: 'TP 0: Repaso', state: 'PUBLISHED', creationTime: haceDias(20), updateTime: haceDias(20), alternateLink: 'https://classroom.google.com/c/NzAwMDAx/a/OTA1', dueDate: enDias(3) },
  ] },
  announcements: { announcements: [
    { id: '904', state: 'PUBLISHED', text: 'Mañana no hay clase.\nNos vemos el jueves en el aula 3.', creationTime: haceDias(1), updateTime: haceDias(1), alternateLink: 'https://classroom.google.com/c/NzAwMDAx/p/OTA0' },
    { id: '903', state: 'PUBLISHED', creationTime: haceDias(20), updateTime: haceDias(20), alternateLink: 'https://classroom.google.com/c/NzAwMDAx/p/OTAz', materials: [{ youtubeVideo: { title: 'Clase 3 grabada', alternateLink: 'https://www.youtube.com/watch?v=abc' } }] },
  ] },
};
// TP 0 is turned in: it does not show in Hoy.
const ENTREGAS_SO = [{ courseWorkId: '905', state: 'TURNED_IN' }, { courseWorkId: '902', state: 'CREATED' }];
let googleNiega = false;
// The panel's function that keeps the opinions (supercvg). Simulated too: nothing reaches the real one.
const OPINIONES = 'https://spltnoksgdkbaamskuau.supabase.co/functions/v1/supercvg';
// What it answers: { status, cuerpo }, or 'sin-red' to cut the request.
let opinionResponde = { status: 200, cuerpo: { ok: true } };
// Like a browser that keeps Google's session out of frames: asked without showing anything, Google says it has to ask.
let googleSinSesion = false;
// Google Drive: the hidden folder of the app, in memory (one Google account in these tests). And what Google gave, so a
// new permission brings what was given before (include_granted_scopes), as Google does.
const enDrive = new Map();
const subidasDrive = new Map();
let numeroDrive = 0;
let driveVencido = false;
const concedidos = new Set();
// Google Calendar: the calendars the app created, in memory. A deleted event keeps its id, like in Google.
const enCalendario = new Map();
let numeroCalendario = 0;
// The files sent in Mensajes (drive.file): the folder «Super CVG» and what goes into it, with who can see each one. A
// piece of a resumable upload is cut `adjuntoSeCorta` times (after Google kept half of it), each one waits
// `demoraTrozo` ms, and `driveLleno` says the Drive is full.
const ALCANCE_ARCHIVOS = 'https://www.googleapis.com/auth/drive.file';
const visiblesDrive = new Map();
let numeroVisible = 0;
let adjuntoSeCorta = 0;
let demoraTrozo = 0;
let driveLleno = false;
const nuevoVisible = (datos) => {
  const id = `1SuperCvgDePrueba${String(++numeroVisible).padStart(16, '0')}`;
  visiblesDrive.set(id, { ...datos, permisos: [] });
  return id;
};
const copiaEnDrive = (alumno = 5) => {
  const f = [...enDrive.values()].find((x) => x.name === `super-cvg-${alumno}.json`);
  return f ? JSON.parse(f.bytes.toString()) : null;
};

// The public Drive folders of the Drive tab (drivePublico.js): the career's map comes made with the site, and any other
// folder is read with the site's key. One folder of tests, public; anything else is private.
const CLAVE_DRIVE_PRUEBA = 'clave-de-drive-de-prueba';
const MAPA_CARRERA = {
  id: '1ZgKML44drc8Wq3pcbHsc-ozPINv6xSHQ', nombre: 'UTN', armado: Date.parse('2026-11-14T12:00:00Z'), nodos: [
    { id: 'carpetaAnio1Prueba01', n: '1° AÑO', p: '1ZgKML44drc8Wq3pcbHsc-ozPINv6xSHQ', c: 1 },
    { id: 'carpetaAnalisis00001', n: 'Análisis Matemático I', p: 'carpetaAnio1Prueba01', c: 1 },
    { id: 'archivoParcial000001', n: 'Primer parcial 2024.pdf', p: 'carpetaAnalisis00001', m: 'application/pdf', s: 900 },
    { id: 'archivoClase00000001', n: 'Clase 1.docx', p: 'carpetaAnalisis00001', m: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', s: 900 },
    { id: 'carpetaElectivas0001', n: 'Electivas', p: '1ZgKML44drc8Wq3pcbHsc-ozPINv6xSHQ', c: 1 },
    { id: 'archivoAportar000001', n: 'Aportar material.pdf', p: '1ZgKML44drc8Wq3pcbHsc-ozPINv6xSHQ', m: 'application/pdf', s: 900 },
  ],
};
const CARPETA_PUBLICA = { id: 'carpetaPublicaPrueba1', name: 'Apuntes de un compañero', mimeType: 'application/vnd.google-apps.folder' };
const HIJOS_PUBLICOS = [{ id: 'archivoPublicoPrueba1', name: 'Resumen de Física.pdf', mimeType: 'application/pdf', size: '900' }];
const ARCHIVOS_PUBLICOS = new Set(['archivoPublicoPrueba1', ...MAPA_CARRERA.nodos.filter((n) => !n.c).map((n) => n.id)]);

// FLUJOS_SOLO=<parte del nombre>[|<otra>] corre solo esas pruebas, desde la entrada (las que dependen de otras pueden fallar).
const SOLO = process.env.FLUJOS_SOLO;
const resultados = [];
async function prueba(nombre, fn) {
  if (SOLO && !SOLO.split('|').some((parte) => nombre.includes(parte))) return;
  if (SOLO) await ir('');
  try {
    await fn();
    resultados.push(true);
    console.log(`ok    ${nombre}`);
  } catch (e) {
    resultados.push(false);
    await pagina.screenshot({ path: path.join(CAPTURAS, `falla-${resultados.length}.png`) }).catch(() => {});
    console.log(`      en ${pagina.url().slice(0, 80)}`);
    console.log(`FALLA ${nombre}\n      ${String(e.message).split('\n').slice(0, 6).join('\n      ')}`);
  }
}

const { chromium } = await import('playwright-core');
const { base, cerrar } = await servirDist(RAIZ);
const navegador = await chromium.launch(opcionesNavegador(buscarChrome()));
const FOTO_HOJA = await (async () => {
  const taller = await navegador.newPage({ viewport: { width: 480, height: 679 } });
  await taller.setContent(`<body style="margin:0;padding:34px 30px;font:13px/1.5 Georgia,serif;color:#222;background:#fff">
    <h1 style="font:700 24px/1.2 Arial,sans-serif;color:#1d3c8f;margin:0 0 6px">Planificación de procesos</h1>
    <p style="margin:0 0 16px;color:#666;font-style:italic">Sistemas Operativos, 1° parcial</p>
    <h2 style="font:700 16px Arial,sans-serif;margin:0 0 6px">1. FIFO, SJF y Round Robin</h2>
    <p>El planificador elige qué proceso pasa a ejecutarse. En FIFO entra el que llegó primero; en SJF, el de ráfaga más corta.</p>
    <p style="border-left:4px solid #1d3c8f;background:#eef2fb;padding:8px 10px">Round Robin le da a cada proceso un quantum. Si no termina, vuelve al final de la cola.</p>
    <table style="border-collapse:collapse;width:100%;margin-top:10px">${['Proceso,Llegada,Ráfaga', 'P1,0,5', 'P2,1,3', 'P3,2,8']
    .map((f, i) => `<tr>${f.split(',').map((c) => `<td style="border:1px solid #bbb;padding:4px 6px;${i ? '' : 'font-weight:700;background:#f2f2f2'}">${c}</td>`).join('')}</tr>`).join('')}</table>
  </body>`);
  const imagen = await taller.screenshot({ type: 'jpeg', quality: 80 });
  await taller.close();
  return imagen;
})();
const contexto = await navegador.newContext({ viewport: { width: 1280, height: 860 }, acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
const pagina = await contexto.newPage();

const pedidos = [];
const errores = [];
let sesionVencida = false;
pagina.on('pageerror', (e) => errores.push(e.message));
pagina.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });

// Consultron's worker, faked: the test browser has no model and nothing may go to Hugging Face. It speaks the same
// messages as src/lib/consultron/consultron.worker.js. Its answer names the first piece it got, with its file and page,
// so the test sees what went to the model. «Contame todo…» answers slowly, to stop it. What was downloaded stays in a
// cache of the browser, like the real one.
const TRABAJADOR_CONSULTRON = String.raw`
let frenar = false;
const decir = (m) => self.postMessage(m);
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const MODELO = self.location.origin + '/modelo-de-prueba';
const guardado = () => caches.open('prueba-consultron');
// Where web-llm keeps the weights: Super CVG looks there before starting the worker as it opens.
let pesos = '';
const deWebllm = () => caches.open('webllm/model');
self.onmessage = async ({ data }) => {
  if (data.tipo === 'revisar') {
    pesos = data.pesos;
    decir({ tipo: 'revision', bajado: Boolean(await (await guardado()).match(MODELO)) });
  }
  else if (data.tipo === 'cargar') {
    decir({ tipo: 'progreso', fase: 'bajando', fraccion: 0.17, mb: 400, segundos: 4 });
    await espera(300);
    decir({ tipo: 'progreso', fase: 'bajando', fraccion: 0.5, mb: 1200, segundos: 10 });
    await espera(1500);
    decir({ tipo: 'progreso', fase: 'preparando', fraccion: 0.5, mb: null, segundos: 12 });
    await espera(300);
    await (await guardado()).put(MODELO, new Response('1'));
    await (await deWebllm()).put(pesos + 'tensor-cache.json', new Response('{}'));
    decir({ tipo: 'listo' });
  } else if (data.tipo === 'preguntar') {
    frenar = false;
    const pedido = data.mensajes.at(-1).content;
    const fuente = /\[1\] \(([^)]*)\)/.exec(pedido)?.[1] ?? '';
    const lento = pedido.includes('Pregunta: Contame todo');
    // A greeting gets the courses it read, without pieces.
    const materias = /^Tenés los apuntes de estas materias: (.*)\.\n/.exec(pedido)?.[1];
    let partes = lento ? Array(60).fill('bla ') : ['Sale de **', fuente, '** [1]. ', 'Y nada más [1].'];
    // «Explicame largo…»: an answer taller than the chat, a paragraph at a time.
    if (pedido.includes('Pregunta: Explicame largo')) partes = Array.from({ length: 80 }, (_, i) => 'Párrafo ' + (i + 1) + ' de una explicación larga, con palabras de sobra para ocupar más de un renglón [1].\n\n');
    // What the pieces don't have: the model says so, and it's asked again for what it knows.
    if (pedido.includes('Pregunta: ¿Qué es un interbloqueo?')) partes = ['No lo encuentro en tus apuntes.'];
    // «No lo entendí»: the question before comes again, to be told another way.
    if (pedido.includes('no entendió la respuesta anterior')) partes = ['De otra forma, sale de ', fuente, ' [1].'];
    // «¿Qué es esta página?»: it names every piece it got, to see the screen it reads and its guide.
    if (pedido.includes('Pregunta: ¿Qué es esta página?')) partes = [...pedido.matchAll(/^\[(\d+)\] \(([^)]*)\)/gm)].map((m) => 'Sale de **' + m[2] + '** [' + m[1] + ']. ');
    if (materias) partes = ['¡Hola! ', 'Leí ', materias, '.'];
    // Not in the notes: what it knows in general.
    if (data.mensajes[0].content.includes('no está en sus apuntes')) partes = ['En general, ', 'se hace por partes.'];
    // About SQL: a block of code.
    if (/\bSQL\b/.test(pedido.split('Pregunta: ').at(-1))) partes = ['Con COUNT.\n\n', '\x60\x60\x60sql\n', 'SELECT COUNT(*) FROM alumnos;\n', '\x60\x60\x60'];
    for (const parte of partes) {
      if (frenar) break;
      decir({ tipo: 'parte', id: data.id, texto: parte });
      await espera(lento ? 200 : partes.length > 50 ? 50 : 40);
    }
    decir({ tipo: 'fin', id: data.id, frenado: frenar });
  } else if (data.tipo === 'extraer') {
    const pedido = data.mensajes.at(-1).content;
    const sistema = data.mensajes[0].content;
    // A practice question: one about the piece, naming «el fragmento» as small models do, with an idea copied from the
    // piece and one made up. Its check says «si» if the answer says «junta» or «cuida».
    if (sistema.startsWith('Armás una pregunta')) {
      const fragmento = /^Fragmento:\n([^\n]*)/.exec(pedido)?.[1] ?? '';
      await espera(150);
      decir({ tipo: 'datos', id: data.id, texto: JSON.stringify({ pregunta: 'según el fragmento, ¿qué hace un monitor', idea1: fragmento, idea2: 'usa OSPF para enrutar paquetes', idea3: '' }) });
      return;
    }
    if (sistema.startsWith('Corregís')) {
      const dice = /junta|cuida/i.test(pedido.split('Respuesta del alumno: ').at(-1));
      await espera(150);
      decir({ tipo: 'datos', id: data.id, texto: JSON.stringify({ idea1: dice ? 'si' : 'no', error: dice ? '' : 'Un monitor no es un semáforo.' }) });
      return;
    }
    // The data of an exercise: the subnets one, as the model fills its form.
    const subred = pedido.includes('Calculadora: Subredes.');
    decir({ tipo: 'datos', id: data.id, texto: subred ? JSON.stringify({ red: '10.0.0.0/16', pide: 'c', cuanto: '6' }) : '' });
  } else if (data.tipo === 'frenar') frenar = true;
  else if (data.tipo === 'borrar') {
    await caches.delete('prueba-consultron');
    await caches.delete('webllm/model');
    decir({ tipo: 'borrado' });
  }
};
`;
// How many times Consultron's worker started: on its screen, or in the background as Super CVG opens.
let arranquesConsultron = 0;

async function atender(ruta) {
  const pedido = ruta.request();
  const url = new URL(pedido.url());
  if (url.href.startsWith(base) && /\/assets\/consultron\.worker-[\w-]+\.js$/.test(url.pathname)) {
    arranquesConsultron += 1;
    return ruta.fulfill({ status: 200, contentType: 'text/javascript', body: TRABAJADOR_CONSULTRON });
  }
  if (url.href.startsWith(base) && url.pathname === '/drive/carrera.json') return ruta.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MAPA_CARRERA) });
  if (url.href.startsWith(base)) return ruta.continue();
  const cors = { 'Access-Control-Allow-Origin': '*' };
  const cuerpo = pedido.postData() ?? '';
  pedidos.push({ url: url.href, metodo: pedido.method(), cuerpo, cabeceras: pedido.headers() });

  if (url.origin === CAMPUS && url.pathname === '/login/token.php') {
    const p = new URLSearchParams(cuerpo);
    const bien = p.get('password') === CONTRASENA;
    return ruta.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify(bien ? { token: TOKEN, privatetoken: 'otra' } : { error: 'interno', errorcode: 'invalidlogin' }) });
  }
  if (url.origin === CAMPUS && url.pathname === '/webservice/rest/server.php') {
    const p = new URLSearchParams(cuerpo);
    if (sesionVencida) return ruta.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ exception: 'x', errorcode: 'invalidtoken', message: 'interno' }) });
    const responder = RESPUESTAS[p.get('wsfunction')];
    if (!responder) {
      sinSimular.add(p.get('wsfunction'));
      return ruta.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ exception: 'moodle_exception', errorcode: 'sinsimular', message: 'Sin simular' }) });
    }
    return ruta.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify(responder(p)) });
  }
  // Moodle 4.4's webservice/upload.php: the key in the body, each file to a draft of the student (a new one with itemid 0),
  // and back the record of each file with its draft number, or its error when the draft already has one with that name.
  if (url.origin === CAMPUS && url.pathname === '/webservice/upload.php') {
    const partes = partesDe((pedido.postDataBuffer() ?? Buffer.alloc(0)).toString('latin1'), pedido.headers()['content-type']);
    const campo = (nombre) => partes.find((p) => p.nombre === nombre && p.archivo === undefined)?.datos;
    if (pedido.method() !== 'POST' || sesionVencida || campo('token') !== TOKEN) {
      return ruta.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ error: 'Token no válido: no se encontró el token', errorcode: 'invalidtoken', stacktrace: null, debuginfo: null, reproductionlink: null }) });
    }
    const itemid = Number(campo('itemid')) || proximoBorrador++;
    const filepath = campo('filepath') ?? '/';
    const enBorrador = borradoresSimulados.get(itemid) ?? [];
    const respuesta = partes.filter((p) => p.archivo !== undefined).map((p) => {
      if (enBorrador.some((f) => f.filename === p.archivo)) return { filename: p.archivo, filepath, errortype: 'filenameexist', error: `Ya existe un archivo llamado ${p.archivo}` };
      enBorrador.push({ filename: p.archivo, filesize: p.datos.length, mimetype: p.tipo ?? 'application/octet-stream' });
      return { component: 'user', contextid: 33, userid: String(usuarioId), filearea: 'draft', filename: p.archivo, filepath, itemid, license: 'unknown', author: 'Ana', source: `O:8:"stdClass":1:{s:6:"source";s:${p.archivo.length}:"${p.archivo}";}` };
    });
    borradoresSimulados.set(itemid, enBorrador);
    return ruta.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify(respuesta) });
  }
  // A profile picture of Mensajes: an image, asked like any file of the campus.
  if (url.origin === CAMPUS && url.pathname.startsWith('/webservice/pluginfile.php/') && url.pathname.includes('/user/icon/')) {
    return ruta.fulfill({ status: 200, headers: cors, contentType: 'image/png', body: PNG });
  }
  if (url.origin === CAMPUS && url.pathname.startsWith('/webservice/pluginfile.php/')) {
    if (demoraArchivo) await new Promise((listo) => setTimeout(listo, demoraArchivo));
    return ruta.fulfill({ status: 200, headers: cors, contentType: url.pathname.endsWith('.xlsx') ? 'application/vnd.ms-excel' : 'application/pdf', body: url.pathname.endsWith('/apunte.pdf') ? (apunteConCodigo ? PDF_CODIGO : PDF_APUNTE) : url.pathname.endsWith('.xlsx') ? planillaDeEjemplo() : pdfMinimo() });
  }
  if (url.hostname === 'www.youtube.com' && url.pathname === '/oembed') {
    return ruta.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ title: 'Video de la clase', author_name: 'Canal de la cátedra' }) });
  }
  if (url.hostname === 'drive.google.com' && /^\/file\/d\/[\w-]+\/preview$/.test(url.pathname)) return ruta.fulfill({ status: 200, contentType: 'text/html', body: '<p>Vista de Google</p>' });
  if (url.hostname === 'i.ytimg.com') return ruta.fulfill({ status: 200, contentType: 'image/png', body: PNG });
  if (url.href === 'https://demo.lutastudios.com/visor/') return ruta.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: VISOR_FALSO });
  if (url.href === SANTO_INDICE_URL) return ruta.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify(SANTO_INDICE) });
  if (url.origin === SANTO_SERVICIO && url.pathname.startsWith('/storage/v1/object/public/fotos/')) {
    if (santoFotos.demora) await new Promise((r) => setTimeout(r, santoFotos.demora));
    if (santoFotos.rotas.has(url.pathname.split('/')[6])) return ruta.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"not_found"}' });
    return ruta.fulfill({ status: 200, headers: { 'Cache-Control': 'public, max-age=3600' }, contentType: 'image/jpeg', body: FOTO_HOJA });
  }
  // The one-time addresses of the storage for a file without Drive: up with a PUT, down with a GET.
  const TEMPORAL = /^\/storage\/v1\/object\/(upload\/sign|sign)\/cvg-temporales\/([0-9a-f-]{36})$/.exec(url.pathname);
  if (url.origin === SANTO_SERVICIO && TEMPORAL) {
    if (pedido.method() === 'OPTIONS') return ruta.fulfill({ status: 204, headers: { ...cors, 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Methods': 'GET, PUT' } });
    if (TEMPORAL[1] === 'upload/sign' && pedido.method() === 'PUT') {
      temporalesSimulados.set(TEMPORAL[2], pedido.postDataBuffer());
      return ruta.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: '{"Key":"x"}' });
    }
    const guardado = temporalesSimulados.get(TEMPORAL[2]);
    if (!guardado) return ruta.fulfill({ status: 404, headers: cors, contentType: 'application/json', body: '{"error":"not_found"}' });
    return ruta.fulfill({ status: 200, headers: cors, contentType: 'application/octet-stream', body: guardado });
  }
  if (url.origin === SANTO_SERVICIO && url.pathname === '/functions/v1/utn') {
    if (pedido.method() === 'OPTIONS') return ruta.fulfill({ status: 204, headers: { ...cors, 'Access-Control-Allow-Headers': 'content-type, x-utn-llave', 'Access-Control-Allow-Methods': 'GET, POST' } });
    if (santoCaido) return ruta.fulfill({ status: 503, headers: cors, contentType: 'application/json', body: '{"error":"no-disponible"}' });
    const a = url.searchParams.get('a');
    if (a === 'cvg-temporal' && pedido.method() === 'POST') {
      const id = crypto.randomUUID();
      return ruta.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ id, subida: `${SANTO_SERVICIO}/storage/v1/object/upload/sign/cvg-temporales/${id}?token=t`, vence: '2027-02-12T00:00:00Z' }) });
    }
    if (a === 'cvg-temporal') {
      const id = url.searchParams.get('id');
      if (!temporalesSimulados.has(id)) return ruta.fulfill({ status: 404, headers: cors, contentType: 'application/json', body: '{"error":"no-esta"}' });
      return ruta.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ url: `${SANTO_SERVICIO}/storage/v1/object/sign/cvg-temporales/${id}?token=t`, bytes: temporalesSimulados.get(id).length, vence: '2027-02-12T00:00:00Z' }) });
    }
    const materia = url.searchParams.get('materia');
    if (a === 'banco') {
      const resumenes = SANTO_BANCO.filter((r) => !materia || r.materia === materia).map((r) => ({ ...r, me_gusta: r.me_gusta + (santoCvg.gustos.has(r.id) ? 1 : 0) }));
      return ruta.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ resumenes }) });
    }
    // Reading a published one. The real service sends the PDF from Storage after a redirect; here it comes at once,
    // because a redirected request would skip this function and go out for real.
    if (a === 'ver' || a === 'vista' || a === 'bajar') {
      const r = [...SANTO_BANCO, ...santoCvg.subidos, ...santoCvg.enviados].find((x) => x.id === url.searchParams.get('id'));
      if (!r) return ruta.fulfill({ status: 404, headers: cors, contentType: 'application/json', body: '{"error":"no-existe"}' });
      if (a === 'bajar') return ruta.fulfill({ status: 200, headers: cors, contentType: 'application/pdf', body: santoPdfConTexto ? PDF_APUNTE : pdfMinimo() });
      if (a === 'ver' && url.searchParams.get('js') === '1') {
        return r.js ? ruta.fulfill({ status: 200, headers: cors, contentType: 'text/plain; charset=utf-8', body: SANTO_JS }) : ruta.fulfill({ status: 404, headers: cors, contentType: 'application/json', body: '{"error":"sin-js"}' });
      }
      if (a === 'ver') return ruta.fulfill({ status: 200, headers: cors, contentType: 'text/html; charset=utf-8', body: SANTO_HTML });
      return ruta.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify(SANTO_VISTA) });
    }
    if (a === 'buscar') return ruta.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ resultados: JSON.parse(cuerpo).q.includes('semaforos') ? [{ id: SANTO_BANCO[1].id, fragmento: 'los \u0002semáforos\u0003 y los monitores' }] : [] }) });
    // The text of the summaries for Consultron: only in the test that asks it about an open one.
    if (a === 'textos') return ruta.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ textos: SANTO_TEXTOS.filter((t) => SANTO_BANCO.some((r) => r.id === t.id && r.materia === materia)) }) });
    if (a === 'consejos') return ruta.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ consejos: SANTO_CONSEJOS[materia] ?? [] }) });
    if (a?.startsWith('cvg-')) {
      const responder = (status, json) => ruta.fulfill({ status, headers: cors, contentType: 'application/json', body: json ? JSON.stringify(json) : '' });
      if (santoCvg.demora) await new Promise((r) => setTimeout(r, santoCvg.demora));
      const llave = pedido.headers()['x-utn-llave'];
      if (a === 'cvg-canjear' && pedido.method() === 'POST') {
        if (!santoCvg.codigos.delete(JSON.parse(cuerpo || '{}').codigo)) return responder(400, { error: 'codigo' });
        santoCvg.llaves.add(CVG_LLAVE);
        return responder(201, { llave: CVG_LLAVE, usuario: 'santi' });
      }
      if (!santoCvg.llaves.has(llave)) return responder(401, { error: 'llave' });
      if (a === 'cvg-resumenes' && pedido.method() === 'GET') return responder(200, { usuario: 'santi', subidos: santoCvg.subidos, enviados: santoCvg.enviados });
      if (a === 'cvg-quitar' && pedido.method() === 'POST') {
        const { id } = JSON.parse(cuerpo);
        santoCvg.enviados = santoCvg.enviados.filter((r) => r.id !== id);
        return responder(204);
      }
      if (a === 'cvg-gustos' && pedido.method() === 'GET') return responder(200, { resumenes: [...santoCvg.gustos] });
      if (a === 'cvg-me-gusta' && pedido.method() === 'POST') {
        const { id, si } = JSON.parse(cuerpo);
        const r = SANTO_BANCO.find((x) => x.id === id);
        if (!r) return responder(404, { error: 'no-existe' });
        if (si) santoCvg.gustos.add(id);
        else santoCvg.gustos.delete(id);
        return responder(200, { me_gusta: r.me_gusta + (santoCvg.gustos.has(id) ? 1 : 0), mio: santoCvg.gustos.has(id) });
      }
      if (a === 'cvg-desvincular' && pedido.method() === 'POST') {
        santoCvg.llaves.delete(llave);
        return responder(204);
      }
    }
  }
  // Google's permission screen answers at once, back to the root of the site, as Google does after "Allow".
  if (url.hostname === 'accounts.google.com' && url.pathname === '/o/oauth2/v2/auth') {
    const p = url.searchParams;
    const vuelta = p.get('redirect_uri');
    if (p.get('client_id') !== CLIENTE_GOOGLE || vuelta !== `${new URL(base).origin}/` || p.get('response_type') !== 'token id_token' || !p.get('nonce')) {
      return ruta.fulfill({ status: 400, contentType: 'text/plain', body: 'pedido raro' });
    }
    let hash;
    if (googleNiega) hash = new URLSearchParams({ error: 'access_denied', state: p.get('state') });
    else if (p.get('prompt') === 'none' && googleSinSesion) hash = new URLSearchParams({ error: 'interaction_required', state: p.get('state') });
    else {
      const pedidosAhora = (p.get('scope') ?? '').split(' ');
      pedidosAhora.forEach((a) => concedidos.add(a));
      const dados = p.get('include_granted_scopes') === 'true' ? [...concedidos] : pedidosAhora;
      hash = new URLSearchParams({ access_token: GTOKEN, token_type: 'Bearer', expires_in: '3599', state: p.get('state'), scope: dados.join(' '), id_token: idTokenDePrueba(p.get('nonce')) });
    }
    return ruta.fulfill({ status: 302, headers: { Location: `${vuelta}#${hash}` } });
  }
  if (url.origin === 'https://classroom.googleapis.com') {
    const corsGoogle = { ...cors, 'Access-Control-Allow-Headers': 'authorization', 'Access-Control-Allow-Methods': 'GET' };
    if (pedido.method() === 'OPTIONS') return ruta.fulfill({ status: 204, headers: corsGoogle });
    if (pedido.headers().authorization !== `Bearer ${GTOKEN}`) return ruta.fulfill({ status: 401, headers: corsGoogle, contentType: 'application/json', body: '{"error":{"code":401}}' });
    const camino = url.pathname.replace(/^\/v1\//, '').split('/');
    let json = null;
    if (camino.length === 1 && camino[0] === 'courses') json = { courses: CURSOS_CLASSROOM };
    else if (camino[0] === 'courses' && camino.length === 3) json = camino[1] === '700001' ? CURSO_SO[camino[2]] ?? {} : {};
    else if (camino.length === 5 && camino[0] === 'courses' && camino.slice(2).join('/') === 'courseWork/-/studentSubmissions' && url.searchParams.get('userId') === 'me') {
      json = { studentSubmissions: camino[1] === '700001' ? ENTREGAS_SO : [] };
    }
    if (json) return ruta.fulfill({ status: 200, headers: corsGoogle, contentType: 'application/json', body: JSON.stringify(json) });
    return ruta.fulfill({ status: 404, headers: corsGoogle, contentType: 'application/json', body: '{"error":{"code":404}}' });
  }
  if (url.href === 'https://oauth2.googleapis.com/revoke') {
    concedidos.clear();
    return ruta.fulfill({ status: 200, body: '' });
  }
  if (url.href === OPINIONES) {
    const corsPanel = { 'Access-Control-Allow-Origin': new URL(base).origin, Vary: 'Origin' };
    if (pedido.method() === 'OPTIONS') return ruta.fulfill({ status: 204, headers: { ...corsPanel, 'Access-Control-Allow-Methods': 'POST, OPTIONS' } });
    if (opinionResponde === 'sin-red') return ruta.abort('internetdisconnected');
    return ruta.fulfill({ status: opinionResponde.status, headers: corsPanel, contentType: 'application/json', body: JSON.stringify(opinionResponde.cuerpo) });
  }
  // Google Drive, only the hidden folder of the app (appDataFolder), kept in memory. Its permission goes in the header.
  if (url.origin === 'https://www.googleapis.com') {
    const corsDrive = { ...cors, 'Access-Control-Allow-Headers': 'authorization, content-type, content-range, x-upload-content-type, x-upload-content-length', 'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE', 'Access-Control-Expose-Headers': 'Location, Range' };
    if (pedido.method() === 'OPTIONS') return ruta.fulfill({ status: 204, headers: corsDrive });
    const responder = (status, json, extra = {}) => ruta.fulfill({ status, headers: { ...corsDrive, ...extra }, contentType: 'application/json', body: json === null ? '' : JSON.stringify(json) });
    // A public folder (drivePublico.js): the site's key, never the student's permission.
    if (url.searchParams.has('key')) {
      if (url.searchParams.get('key') !== CLAVE_DRIVE_PRUEBA || pedido.headers().authorization) return responder(400, { error: { code: 400 } });
      const id = url.pathname.split('/')[4];
      if (url.pathname === '/drive/v3/files') {
        const padre = /^'([\w-]+)' in parents/.exec(url.searchParams.get('q') ?? '')?.[1];
        return padre === CARPETA_PUBLICA.id ? responder(200, { files: HIJOS_PUBLICOS }) : responder(404, { error: { code: 404, errors: [{ reason: 'notFound' }] } });
      }
      if (id === CARPETA_PUBLICA.id) return responder(200, CARPETA_PUBLICA);
      if (id === HIJOS_PUBLICOS[0].id && !url.searchParams.has('alt')) return responder(200, HIJOS_PUBLICOS[0]);
      // Google stopping the downloads: its page comes without CORS, so the page only sees the request fail.
      if (id === 'archivoAportar000001' && url.searchParams.has('alt')) return ruta.abort('failed');
      if (ARCHIVOS_PUBLICOS.has(id) && !url.searchParams.has('alt')) return responder(200, { id });
      if (ARCHIVOS_PUBLICOS.has(id) && url.searchParams.get('alt') === 'media') return ruta.fulfill({ status: 200, headers: corsDrive, contentType: 'application/pdf', body: pdfMinimo() });
      return responder(404, { error: { code: 404, errors: [{ reason: 'notFound' }] } });
    }
    if (driveVencido || pedido.headers().authorization !== `Bearer ${GTOKEN}`) return responder(401, { error: { code: 401 } });
    const metodo = pedido.method();
    if (url.pathname.startsWith('/calendar/v3/')) {
      const [, , , , id, eventos, eventoId] = url.pathname.split('/').map(decodeURIComponent);
      const datos = cuerpo ? JSON.parse(cuerpo) : null;
      const vacio = () => ruta.fulfill({ status: 204, headers: corsDrive, body: '' });
      if (!id && metodo === 'POST') {
        const nuevo = `c${++numeroCalendario}@group.calendar.google.com`;
        enCalendario.set(nuevo, { summary: datos.summary, timeZone: datos.timeZone, eventos: new Map() });
        return responder(200, { id: nuevo, summary: datos.summary });
      }
      const cal = enCalendario.get(id);
      if (!cal) return responder(404, { error: { code: 404 } });
      if (!eventos && metodo === 'GET') return responder(200, { id, summary: cal.summary });
      if (!eventos && metodo === 'DELETE') {
        enCalendario.delete(id);
        return vacio();
      }
      const ya = eventoId ? cal.eventos.get(eventoId) : null;
      if (!eventoId && metodo === 'GET') return responder(200, { items: [...cal.eventos.values()].filter((e) => e.status !== 'cancelled') });
      if (!eventoId && metodo === 'POST') {
        if (cal.eventos.has(datos.id)) return responder(409, { error: { code: 409 } });
        cal.eventos.set(datos.id, { ...datos, updated: new Date().toISOString() });
        return responder(200, datos);
      }
      if (eventoId && metodo === 'PUT') {
        if (!ya) return responder(404, { error: { code: 404 } });
        cal.eventos.set(eventoId, { ...datos, updated: new Date().toISOString() });
        return responder(200, datos);
      }
      if (eventoId && metodo === 'PATCH') {
        if (!ya || ya.status === 'cancelled') return responder(404, { error: { code: 404 } });
        cal.eventos.set(eventoId, { ...ya, ...datos, updated: new Date().toISOString() });
        return responder(200, cal.eventos.get(eventoId));
      }
      if (eventoId && metodo === 'DELETE') {
        if (!ya || ya.status === 'cancelled') return responder(410, { error: { code: 410 } });
        cal.eventos.set(eventoId, { ...ya, status: 'cancelled' });
        return vacio();
      }
      return responder(400, { error: { code: 400 } });
    }
    const guardar = (id, meta, bytes, tipo) => {
      const viejo = enDrive.get(id);
      enDrive.set(id, { name: viejo?.name ?? meta.name, bytes, tipo, createdTime: viejo?.createdTime ?? new Date().toISOString(), version: (viejo?.version ?? 0) + 1 });
      return responder(200, { id });
    };
    // What drive.file lets this app see: only the folder and the files it made, and only with that part of the permission.
    const conArchivos = concedidos.has(ALCANCE_ARCHIVOS);
    const sinArchivos = () => responder(403, { error: { code: 403, errors: [{ reason: 'insufficientPermissions' }] } });
    if (url.pathname === '/drive/v3/files' && metodo === 'GET' && url.searchParams.get('spaces') === 'drive') {
      if (!conArchivos) return sinArchivos();
      if (url.searchParams.get('q') !== "name = 'Super CVG' and mimeType = 'application/vnd.google-apps.folder' and trashed = false") return responder(400, { error: { code: 400 } });
      return responder(200, { files: [...visiblesDrive].filter(([, f]) => f.mimeType === 'application/vnd.google-apps.folder').map(([id]) => ({ id })) });
    }
    if (url.pathname === '/drive/v3/files' && metodo === 'POST') {
      if (!conArchivos) return sinArchivos();
      const datos = JSON.parse(cuerpo);
      if (datos.mimeType !== 'application/vnd.google-apps.folder' || datos.parents) return responder(400, { error: { code: 400 } });
      return responder(200, { id: nuevoVisible(datos) });
    }
    const compartir = /^\/drive\/v3\/files\/([^/]+)\/permissions$/.exec(url.pathname);
    if (compartir && metodo === 'POST') {
      if (!conArchivos) return sinArchivos();
      const f = visiblesDrive.get(compartir[1]);
      if (!f) return responder(404, { error: { code: 404 } });
      f.permisos.push(JSON.parse(cuerpo));
      return responder(200, { id: 'anyoneWithLink' });
    }
    const visible = /^\/drive\/v3\/files\/([^/]+)$/.exec(url.pathname)?.[1];
    if (visible && metodo === 'DELETE' && visiblesDrive.has(visible)) {
      if (!conArchivos) return sinArchivos();
      visiblesDrive.delete(visible);
      return ruta.fulfill({ status: 204, headers: corsDrive, body: '' });
    }
    if (url.pathname === '/drive/v3/files' && metodo === 'GET') {
      if (url.searchParams.get('spaces') !== 'appDataFolder') return responder(403, { error: { code: 403 } });
      const q = url.searchParams.get('q') ?? '';
      const exacto = /^name = '([^']+)' and trashed = false$/.exec(q)?.[1] ?? null;
      if (exacto === null && q !== 'trashed = false') return responder(400, { error: { code: 400 } });
      return responder(200, { files: [...enDrive].filter(([, f]) => exacto === null || f.name === exacto).map(([id, f]) => ({ id, name: f.name, size: String(f.bytes.length), createdTime: f.createdTime, version: String(f.version) })) });
    }
    const uno = /^\/drive\/v3\/files\/([^/]+)$/.exec(url.pathname);
    if (uno && metodo === 'GET' && enDrive.has(uno[1])) {
      const f = enDrive.get(uno[1]);
      if (url.searchParams.get('alt') !== 'media') return responder(200, { id: uno[1], name: f.name, createdTime: f.createdTime, version: String(f.version) });
      return ruta.fulfill({ status: 200, headers: corsDrive, contentType: f.tipo, body: f.bytes });
    }
    if (uno && metodo === 'DELETE' && enDrive.delete(uno[1])) return ruta.fulfill({ status: 204, headers: corsDrive, body: '' });
    if (url.pathname.startsWith('/upload/drive/v3/files')) {
      const id = url.pathname.split('/')[5] ?? null;
      const bytes = pedido.postDataBuffer() ?? Buffer.alloc(0);
      const enCarpeta = (meta) => !id && Array.isArray(meta.parents) && meta.parents.length === 1 && visiblesDrive.get(meta.parents[0])?.mimeType === 'application/vnd.google-apps.folder';
      if (url.searchParams.has('upload_id') && metodo === 'PUT') {
        const s = subidasDrive.get(url.searchParams.get('upload_id'));
        if (!s) return responder(404, { error: { code: 404 } });
        const rango = pedido.headers()['content-range'];
        // A file for Mensajes goes piece by piece, as Google takes them: 308 and how much it has, until the last one.
        if (rango) {
          const tenidos = s.partes.reduce((n, p) => n + p.length, 0);
          const sigue = (hasta) => ruta.fulfill({ status: 308, headers: { ...corsDrive, ...(hasta >= 0 ? { Range: `bytes=0-${hasta}` } : {}) }, body: '' });
          if (rango === `bytes */${s.total}`) return s.fin ? responder(200, { id: s.fin }) : sigue(tenidos - 1);
          const [, desde, hasta] = /^bytes (\d+)-(\d+)\/\d+$/.exec(rango).map(Number);
          if (desde !== tenidos) return responder(400, { error: { code: 400 } });
          if (adjuntoSeCorta > 0 && desde > 0) {
            adjuntoSeCorta -= 1;
            s.partes.push(bytes.subarray(0, Math.floor(bytes.length / 2)));
            return ruta.abort('connectionreset');
          }
          if (demoraTrozo) await new Promise((listo) => setTimeout(listo, demoraTrozo));
          s.partes.push(bytes);
          if (hasta + 1 < s.total) return sigue(hasta).catch(() => {});
          s.fin = nuevoVisible({ ...s.meta, bytes: Buffer.concat(s.partes), tipo: s.tipo });
          return responder(200, { id: s.fin }).catch(() => {});
        }
        return guardar(s.id ?? `d${++numeroDrive}`, s.meta, bytes, pedido.headers()['content-type']);
      }
      if (driveLleno) return responder(403, { error: { code: 403, errors: [{ reason: 'storageQuotaExceeded' }] } });
      if (url.searchParams.get('uploadType') === 'resumable') {
        const sesion = `s${++numeroDrive}`;
        const meta = JSON.parse(cuerpo || '{}');
        if (!id && JSON.stringify(meta.parents) !== '["appDataFolder"]' && !(conArchivos && enCarpeta(meta))) return sinArchivos();
        subidasDrive.set(sesion, { id, meta, total: Number(pedido.headers()['x-upload-content-length']), tipo: pedido.headers()['x-upload-content-type'], partes: [] });
        return responder(200, {}, { Location: `https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=${sesion}` });
      }
      if (url.searchParams.get('uploadType') === 'multipart') {
        const limite = /boundary=(.+)$/.exec(pedido.headers()['content-type'])[1];
        const partes = bytes.toString('latin1').split(`--${limite}`).slice(1, 3);
        const [meta, media] = partes.map((p) => p.slice(p.indexOf('\r\n\r\n') + 4).replace(/\r\n$/, ''));
        // The metadata goes in UTF-8, like the names with accents.
        const datos = JSON.parse(Buffer.from(meta, 'latin1').toString('utf8'));
        if (conArchivos && enCarpeta(datos)) return responder(200, { id: nuevoVisible({ ...datos, bytes: Buffer.from(media, 'latin1'), tipo: /Content-Type: (.+)\r\n/.exec(partes[1])[1] }) });
        if (!id && JSON.stringify(datos.parents) !== '["appDataFolder"]') return responder(403, { error: { code: 403 } });
        return guardar(id ?? `d${++numeroDrive}`, datos, Buffer.from(media, 'latin1'), /Content-Type: (.+)\r\n/.exec(partes[1])[1]);
      }
    }
    return responder(404, { error: { code: 404 } });
  }
  return ruta.abort();
}
await contexto.route('**/*', atender);

const ir = (ruta) => pagina.goto(base + ruta);
// Consultron comes as a bubble by default; the flows that test the side panel ask for it (call it with the page on the site).
const aLado = () => pagina.evaluate(() => localStorage.setItem('cl.ajustes', JSON.stringify({ ...JSON.parse(localStorage.getItem('cl.ajustes') ?? '{}'), consultronAparicion: 'lateral' })));
const boton = (nombre, exacto = true) => pagina.getByRole('button', { name: nombre, exact: exacto });
const fila = (nombre) => pagina.locator('.fila__principal', { hasText: nombre });
const fin = (nombre) => pagina.screenshot({ path: path.join(CAPTURAS, `${nombre}.png`), fullPage: true });
// What is in sight, for what is fixed on the screen (the page whole moves it).
const foto = (nombre) => pagina.screenshot({ path: path.join(CAPTURAS, `${nombre}.png`) });
// A speechSynthesis that says nothing, put in before the page loads (addInitScript: the CSP stops a script added with
// content). It has remote voices in Spanish (the «Google» kind) and a local one, Mónica; each piece ends only when the
// test calls `__voz.terminar()`, and `__voz.dichos` keeps what was said, with which voice.
function vozSimulada() {
  const prueba = {
    voces: [
      { name: 'Google español', lang: 'es-ES', localService: false, default: true },
      { name: 'Remota de Argentina', lang: 'es-AR', localService: false, default: false },
      { name: 'Mónica', lang: 'es-ES', localService: true, default: false },
      { name: 'Samantha', lang: 'en-US', localService: true, default: false },
    ],
    dichos: [],
    cola: [],
    actual: null,
    cancelados: 0,
  };
  class Dicho extends EventTarget {
    constructor(text = '') {
      super();
      Object.assign(this, { text, voice: null, lang: '', rate: 1, pitch: 1, volume: 1, onstart: null, onend: null, onerror: null });
    }
  }
  class Sintetizador extends EventTarget {
    get speaking() { return Boolean(prueba.actual); }
    get pending() { return prueba.cola.length > 0; }
    get paused() { return false; }
    getVoices() { return prueba.voces.slice(); }
    speak(u) {
      prueba.dichos.push({ texto: u.text, voz: u.voice?.name ?? null, lang: u.lang, velocidad: u.rate });
      prueba.cola.push(u);
      if (!prueba.actual) this.siguiente();
    }
    siguiente() {
      prueba.actual = prueba.cola.shift() ?? null;
    }
    cancel() {
      prueba.cancelados++;
      prueba.cola.length = 0;
      const u = prueba.actual;
      prueba.actual = null;
      if (u) setTimeout(() => u.onerror?.({ type: 'error', error: 'interrupted' }), 0);
    }
    pause() {}
    resume() {}
  }
  const synth = new Sintetizador();
  prueba.terminar = () => {
    const u = prueba.actual;
    if (!u) return false;
    prueba.actual = null;
    u.onend?.({ type: 'end' });
    if (!prueba.actual) synth.siguiente();
    return true;
  };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  window.SpeechSynthesisUtterance = Dicho;
  window.__voz = prueba;
}

// What Chrome, Edge and Android hand over when the site can be installed, put in before the page loads (addInitScript).
// The offer comes at `load`, like the browser's: `__instalacion.pedidos` counts the times its window opened, and
// `respuesta` is what the student answers in it. Accepted, `appinstalled` follows. Chromium can't emulate `display-mode`
// (neither Playwright nor CDP): `__ventanaPropia(true)` makes the page hear `(display-mode: standalone)` as an installed
// app's window, and `ventanaPropia` starts it that way. Safari on iPhone gets no offer, as there.
function instalacionSimulada({ ventanaPropia = false } = {}) {
  const propia = { valor: ventanaPropia, oyentes: new Set() };
  const original = window.matchMedia.bind(window);
  window.matchMedia = (consulta) => {
    if (!/display-mode:\s*standalone/.test(consulta)) return original(consulta);
    return {
      media: consulta,
      get matches() { return propia.valor; },
      onchange: null,
      addEventListener: (_, f) => propia.oyentes.add(f),
      removeEventListener: (_, f) => propia.oyentes.delete(f),
      addListener: (f) => propia.oyentes.add(f),
      removeListener: (f) => propia.oyentes.delete(f),
      dispatchEvent: () => true,
    };
  };
  window.__ventanaPropia = (valor) => {
    propia.valor = valor;
    propia.oyentes.forEach((f) => f({ matches: valor, media: '(display-mode: standalone)' }));
  };
  window.__instalacion = { pedidos: 0, respuesta: 'accepted' };
  if (/iPhone|iPad/.test(navigator.userAgent)) return;
  window.addEventListener('load', () => {
    const e = new Event('beforeinstallprompt', { cancelable: true });
    let decidir;
    e.userChoice = new Promise((listo) => { decidir = listo; });
    e.prompt = () => {
      window.__instalacion.pedidos += 1;
      const outcome = window.__instalacion.respuesta;
      decidir({ outcome, platform: 'web' });
      if (outcome === 'accepted') setTimeout(() => window.dispatchEvent(new Event('appinstalled')), 0);
      return Promise.resolve();
    };
    window.dispatchEvent(e);
  });
}

// A drag with both ends on screen, from the top of the page: Playwright scrolling halfway through a drag drops it.
async function arrastrar(origen, destino) {
  const antes = pagina.viewportSize();
  await pagina.setViewportSize({ width: antes.width, height: 1800 });
  await pagina.evaluate(() => window.scrollTo(0, 0));
  const [a, b] = [await origen.boundingBox(), await destino.boundingBox()];
  await pagina.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await pagina.mouse.down();
  await pagina.mouse.move(a.x + a.width / 2 + 10, a.y + a.height / 2 + 10, { steps: 3 });
  await pagina.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
  await pagina.mouse.up();
  await pagina.setViewportSize(antes);
}

try {
  await prueba('la entrada muestra el cuaderno en 3D si puede, y con «Sin animaciones» ni baja three.js', async () => {
    // The three.js chunk, found by its content: names carry a hash.
    const assets = path.join(RAIZ, 'dist', 'assets');
    const tres = fs.readdirSync(assets).filter((f) => f.endsWith('.js') && fs.readFileSync(path.join(assets, f), 'utf8').includes('WebGLRenderer'));
    assert.ok(tres.length > 0, 'three.js va en un pedazo aparte');
    const html = fs.readFileSync(path.join(RAIZ, 'dist', 'index.html'), 'utf8');
    assert.ok(tres.every((f) => !html.includes(f)), 'three.js no se precarga desde el HTML');
    const bajados = [];
    const anotar = (pedido) => bajados.push(path.basename(new URL(pedido.url()).pathname));
    const antes = errores.length;
    pagina.on('request', anotar);
    try {
      await ir('');
      await pagina.locator('.entrar__formulario').waitFor();
      // Headless may have no WebGL, or only a software one: then nothing shows, with no error.
      const conWebgl = await pagina.evaluate(() => {
        const gl = document.createElement('canvas').getContext('webgl2', { failIfMajorPerformanceCaveat: true });
        const info = gl?.getExtension('WEBGL_debug_renderer_info');
        const nombre = gl && (info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
        return !!gl && !/swiftshader|llvmpipe|softpipe|lavapipe|software|basic render/i.test(nombre ?? '');
      });
      if (conWebgl) {
        const pieza = pagina.locator('.cuaderno3d--lista[role="img"]');
        await pieza.waitFor({ timeout: 10000 });
        assert.match(await pieza.getAttribute('aria-label'), /^Un cuaderno A4 espiralado con un lápiz encima y tres notas adhesivas que marcan los días \d+, \d+ y \d+\.$/);
        assert.equal(await pieza.locator('canvas').count(), 1);
        assert.equal(await pieza.locator('canvas').evaluate((c) => getComputedStyle(c).touchAction), 'pan-y');
        assert.ok(bajados.some((f) => tres.includes(f)), 'bajó three.js');
        // From another tab, «Sin animaciones» takes it away without reloading.
        const otra = await contexto.newPage();
        await otra.goto(base + 'privacidad');
        await otra.evaluate(() => localStorage.setItem('cl.ajustes', JSON.stringify({ movimiento: 'ninguno' })));
        await pagina.locator('.cuaderno3d').waitFor({ state: 'detached' });
        await otra.evaluate(() => localStorage.removeItem('cl.ajustes'));
        await pieza.waitFor({ timeout: 10000 });
        await otra.close();
      } else {
        await pagina.waitForTimeout(1500);
        assert.equal(await pagina.locator('.cuaderno3d canvas').count(), 0);
      }

      await pagina.evaluate(() => localStorage.setItem('cl.ajustes', JSON.stringify({ movimiento: 'ninguno' })));
      bajados.length = 0;
      await ir('');
      await pagina.locator('.entrar__formulario').waitFor();
      await pagina.waitForTimeout(2000);
      assert.equal(await pagina.evaluate(() => document.documentElement.dataset.movimiento), 'ninguno');
      assert.equal(await pagina.locator('.cuaderno3d').count(), 0);
      assert.deepEqual(bajados.filter((f) => tres.includes(f)), [], 'con «Sin animaciones» no se pide three.js');
      const recursos = await pagina.evaluate(() => performance.getEntriesByType('resource').map((r) => r.name));
      assert.ok(recursos.every((r) => !tres.some((f) => r.endsWith(f))), 'ni desde la caché');
      assert.deepEqual(errores.slice(antes), [], 'sin errores en la consola');
    } finally {
      pagina.off('request', anotar);
      await pagina.evaluate(() => localStorage.removeItem('cl.ajustes'));
    }
  });

  await prueba('un campo vacío marca el error, recibe el foco y no llama al campus', async () => {
    await ir('');
    await boton('Entrar').click();
    await pagina.getByText('Escribí tu usuario del campus.').waitFor();
    assert.equal(await pagina.evaluate(() => document.activeElement.name), 'username');
    await pagina.getByLabel('Usuario').fill('alumno');
    await boton('Entrar').click();
    assert.equal(await pagina.evaluate(() => document.activeElement.name), 'password');
    assert.equal(await pagina.getByLabel('Contraseña').getAttribute('aria-invalid'), 'true');
    assert.equal(pedidos.length, 0);
  });

  await prueba('una contraseña mala muestra el error y hace un solo intento', async () => {
    await ir('');
    await pagina.getByLabel('Usuario').fill('alumno');
    await pagina.getByLabel('Contraseña').fill('mala');
    await boton('Entrar').click();
    await pagina.getByRole('alert').getByText('El usuario o la contraseña no coinciden.').waitFor();
    assert.equal(pedidos.filter((p) => p.url.endsWith('/login/token.php')).length, 1);
    await fin('entrar');
  });

  await prueba('entrar guarda la clave solo en la pestaña y nunca la contraseña', async () => {
    await pagina.getByLabel('Contraseña').fill(CONTRASENA);
    await boton('Entrar').click();
    await pagina.getByRole('heading', { name: 'Hola, Ana' }).waitFor();
    const guardado = await pagina.evaluate(() => JSON.stringify({ s: { ...sessionStorage }, l: { ...localStorage } }));
    const { s, l } = JSON.parse(guardado);
    assert.equal(s['cl.sesion'], TOKEN);
    assert.ok(Object.keys(l).every((k) => k === 'cl.mio.5'), 'solo lo propio del alumno');
    assert.ok(!guardado.includes('Materia A') && !guardado.includes('Apunte uno'), 'nada del campus en disco');
    assert.ok(!guardado.includes(CONTRASENA));
    assert.ok(!guardado.includes('privatetoken'));
  });

  await prueba('Hoy muestra lo próximo, lo vencido, la semana, avisos y lo último', async () => {
    await pagina.locator('.marcado', { hasText: 'TP próximo' }).waitFor();
    await pagina.getByRole('heading', { name: 'Vencidas' }).waitFor();
    await pagina.getByText('TP vencido').waitFor();
    await pagina.getByText('Aviso nuevo').waitFor();
    await pagina.getByRole('heading', { name: 'Último subido' }).waitFor();
    await pagina.locator('.semana__cantidad[data-hay]').first().waitFor();
    assert.equal(await pagina.locator('.semana__dia').count(), 7);
    await pagina.getByRole('heading', { name: 'Próximas fechas' }).waitFor();
    // Each subject its own color, by order: Materia A, the first course, has the first one.
    await pagina.locator('.notificacion .simbolo[data-materia="0"]').waitFor();
    await pagina.locator('.destacado .simbolo[data-materia="0"]').waitFor();
    assert.ok(await pagina.locator('.pendiente .simbolo svg').count() >= 1);
    await pagina.locator('.eventos').getByText('Entrega del informe').first().waitFor();
    await fin('hoy');
  });

  await prueba('una sección se oculta, se deshace y sigue oculta después de recargar', async () => {
    await ir('materias/1');
    await pagina.getByRole('heading', { name: 'Notas 2023' }).waitFor();
    // From further down the page: hiding doesn't take it back to the top (the notice floats at the foot of the screen).
    await pagina.getByRole('heading', { name: 'Notas 2023' }).scrollIntoViewIfNeeded();
    await pagina.evaluate(() => window.scrollBy(0, 120));
    const antes = await pagina.evaluate(() => window.scrollY);
    await boton('Ocultar Notas 2023').click();
    await pagina.getByRole('heading', { name: 'Notas 2023' }).waitFor({ state: 'detached' });
    assert.equal(await pagina.evaluate(() => document.activeElement.textContent), 'Deshacer');
    const despues = await pagina.evaluate(() => window.scrollY);
    // Shorter without the section, the page may go up as much as it lost; never to the top.
    assert.ok(antes === 0 || despues > 0, `la página no vuelve arriba (${antes} y ${despues})`);
    await boton('Deshacer').click();
    await pagina.getByRole('heading', { name: 'Notas 2023' }).waitFor();
    await boton('Ocultar Notas 2023').click();
    await pagina.reload();
    await pagina.getByRole('heading', { name: 'Unidad 1' }).waitFor();
    assert.equal(await pagina.getByRole('heading', { name: 'Notas 2023' }).count(), 0);
    await pagina.getByText('Lo que ocultaste (1)').waitFor();
    await fin('materia');
  });

  await prueba('lo oculto queda fuera de la búsqueda salvo que se pida', async () => {
    await ir('buscar');
    await pagina.getByLabel('Qué buscás').fill('notas');
    await pagina.getByText('No hay resultados').waitFor();
    assert.ok(!pagina.url().includes('notas'), 'la búsqueda no va en la URL');
    await pagina.getByLabel('Incluir secciones ocultas').check();
    await pagina.getByText('Un resultado').waitFor();
    await pagina.getByText('Notas viejas').waitFor();
  });

  await prueba('filtrar por tipo y buscar en una materia', async () => {
    await ir('materias/1');
    await pagina.getByRole('heading', { name: 'Unidad 1' }).waitFor();
    await boton('Enlaces').click();
    assert.equal(await pagina.locator('.fila').count(), 2);
    await boton('Todo').click();
    await pagina.getByLabel('Buscar en esta materia').fill('planilla');
    assert.equal(await pagina.locator('.fila').count(), 1);
    await pagina.getByLabel('Buscar en esta materia').fill('');
  });

  await prueba('tocar un archivo muestra la previa y la clave no viaja en la URL', async () => {
    const antes = pedidos.length;
    await fila('Apunte uno').click();
    await pagina.getByRole('dialog').waitFor();
    await pagina.getByRole('group', { name: 'Página 1 de 2' }).waitFor();
    await pagina.waitForFunction(() => {
      const c = document.querySelector('.lector__pagina[data-pagina="1"] .lector__lienzo');
      if (!c || !c.width) return false;
      const d = c.getContext('2d').getImageData(c.width / 2, c.height / 2, 1, 1).data;
      return d[2] > 200 && d[0] < 60;
    }, null, { timeout: 8000 });
    const archivo = pedidos.slice(antes).find((p) => p.url.includes('pluginfile'));
    assert.ok(archivo, 'pidió el archivo');
    assert.equal(archivo.metodo, 'POST');
    assert.ok(!archivo.url.includes(TOKEN));
    assert.ok(archivo.cuerpo.includes(TOKEN));
    const irA = pagina.getByRole('textbox', { name: 'Página, de 2' });
    await irA.fill('2');
    await irA.press('Enter');
    await pagina.waitForFunction(() => document.querySelector('.lector__ir-campo').value === '2');
    // The scanned square of page 2 (from 240 to 290 of 300), black: without the decoders of pdf.js it comes out blank.
    await pagina.waitForFunction(() => {
      const c = document.querySelector('.lector__pagina[data-pagina="2"] .lector__lienzo');
      if (!c || !c.width) return false;
      const d = c.getContext('2d').getImageData(Math.round(c.width * 0.883), Math.round(c.height * 0.117), 1, 1).data;
      return d[0] < 60 && d[1] < 60 && d[2] < 60;
    }, null, { timeout: 8000 });
    await pagina.waitForTimeout(350);
    await fin('previa-pdf');
  });

  await prueba('bajar usa el archivo ya cargado, y Escape devuelve el foco a la fila', async () => {
    const antes = pedidos.length;
    const [descarga] = await Promise.all([pagina.waitForEvent('download'), boton('Bajar archivo').click()]);
    assert.equal(descarga.suggestedFilename(), 'apunte.pdf');
    assert.equal(pedidos.length, antes);
    await pagina.keyboard.press('Escape');
    await pagina.getByRole('dialog').waitFor({ state: 'detached' });
    assert.match(await pagina.evaluate(() => document.activeElement.textContent), /Apunte uno/);
  });

  await prueba('un Excel se ve como tabla, hoja por hoja', async () => {
    await fila('Planilla').click();
    const hoja = pagina.getByRole('dialog');
    const tabla = hoja.getByRole('region', { name: 'Hoja Notas' });
    await tabla.getByRole('cell', { name: 'Ana Pérez' }).waitFor();
    assert.equal(await tabla.getByRole('cell', { name: 'Notas del primer parcial' }).getAttribute('colspan'), '3');
    assert.equal(await tabla.getByRole('cell', { name: '8,50' }).count(), 1, 'el número con su formato');
    assert.equal(await tabla.getByRole('cell', { name: '06/11/2025' }).count(), 2, 'la fecha como fecha');
    const pestana = hoja.getByRole('tab', { name: 'Notas' });
    assert.equal(await pestana.getAttribute('aria-selected'), 'true');
    await fin('previa-planilla');
    await pestana.focus();
    await pagina.keyboard.press('ArrowRight');
    await hoja.getByRole('region', { name: 'Hoja Asistencia' }).getByRole('cell', { name: '12' }).waitFor();
    assert.equal(await hoja.getByRole('tab', { name: 'Asistencia' }).evaluate((b) => b === document.activeElement), true);
    await boton('Cerrar').click();
  });

  await prueba('el lector de PDF busca, resalta con nota y recuerda la página, sin guardar el texto', async () => {
    await fila('Apunte uno').click();
    const hoja = pagina.getByRole('dialog');
    await hoja.locator('.lector__pagina[data-pagina="1"] .textLayer span').first().waitFor();
    // The test before left it on page 2: it opens there and says so, and back to the start.
    await hoja.getByText('Abrimos en la página 2, donde quedaste.').waitFor();
    await hoja.getByRole('button', { name: 'Ir al principio' }).click();
    await pagina.waitForFunction(() => document.querySelector('.lector__ir-campo').value === '1');

    // Find: every match, counted, and the chosen one marked on its page.
    await pagina.keyboard.press('Control+f');
    const buscar = hoja.getByRole('searchbox', { name: 'Buscar en el documento' });
    await buscar.fill('semaforo');
    await hoja.locator('.lector__buscar-cuenta', { hasText: '1 de 3' }).waitFor();
    await hoja.locator('.lector__hallazgo--actual').waitFor();
    await buscar.press('Enter');
    await hoja.locator('.lector__buscar-cuenta', { hasText: '2 de 3' }).waitFor();
    await buscar.press('Shift+Enter');
    await hoja.locator('.lector__buscar-cuenta', { hasText: '1 de 3' }).waitFor();
    await buscar.fill('ninguna parte');
    await hoja.locator('.lector__buscar-cuenta', { hasText: 'No está en el documento' }).waitFor();
    await pagina.keyboard.press('Escape');
    await buscar.waitFor({ state: 'detached' });
    assert.equal(await hoja.count(), 1, 'Escape cierra la búsqueda y no la hoja');

    // Highlight a selection in green and write a note on it.
    const lugar = await pagina.evaluate(() => {
      const spans = [...document.querySelectorAll('.lector__pagina[data-pagina="1"] .textLayer span')];
      const desde = spans.find((e) => e.textContent.includes('cuida')).firstChild;
      const hasta = spans.find((e) => e.textContent.includes('tica.')).firstChild;
      const r = document.createRange();
      const letra = (t, i) => {
        r.setStart(t, i);
        r.setEnd(t, i + 1);
        return r.getBoundingClientRect();
      };
      const a = letra(desde, desde.data.indexOf('cuida'));
      const b = letra(hasta, hasta.data.indexOf('tica.') + 4);
      return { x1: a.left + 1, y1: a.top + a.height / 2, x2: b.right - 1, y2: b.top + b.height / 2 };
    });
    await pagina.mouse.move(lugar.x1, lugar.y1);
    await pagina.mouse.down();
    await pagina.mouse.move(lugar.x2, lugar.y2, { steps: 8 });
    await pagina.mouse.up();
    await hoja.getByRole('toolbar', { name: 'Resaltar lo seleccionado' }).getByRole('button', { name: 'Resaltar en verde' }).click();
    const marca = hoja.locator('.lector__resaltado--verde').first();
    await marca.waitFor();
    const caja = await marca.boundingBox();
    await pagina.mouse.click(caja.x + caja.width / 2, caja.y + caja.height / 2);
    const globo = hoja.getByRole('dialog', { name: 'Resaltado de la página 1' });
    await globo.getByRole('button', { name: 'Sumar nota' }).click();
    await globo.getByRole('textbox', { name: 'Nota' }).fill('Para repasar el viernes');
    await globo.getByRole('button', { name: 'Guardar' }).click();
    await globo.waitFor({ state: 'detached' });

    // The notes: the piece of the PDF, read from it, and the note. On disk, only places, the color and the note.
    await hoja.getByRole('button', { name: 'Notas y páginas' }).click();
    await hoja.getByRole('tab', { name: /^Notas/, selected: true }).waitFor();
    const nota = hoja.locator('.lector__nota');
    await nota.getByText('«cuida la sección crítica.»').waitFor();
    await nota.getByText('Para repasar el viernes').waitFor();
    const disco = await pagina.evaluate(() => JSON.stringify({ ...localStorage }));
    assert.ok(disco.includes('Para repasar el viernes'), 'la nota se guarda');
    assert.ok(!disco.includes('cuida') && !disco.includes('sección crítica'), 'el texto del PDF no se guarda');
    assert.ok(!disco.includes('apunte.pdf'), 'el archivo va por número, no por su nombre');

    // The page where it was left, for next time.
    const irA = hoja.getByRole('textbox', { name: 'Página, de 2' });
    await irA.fill('2');
    await irA.press('Enter');
    await pagina.waitForFunction(() => document.querySelector('.lector__ir-campo').value === '2');
    await boton('Cerrar').click();
    await hoja.waitFor({ state: 'detached' });
    await fila('Apunte uno').click();
    await hoja.getByText('Abrimos en la página 2, donde quedaste.').waitFor();
    // The page box follows once the reader got to page 2, a moment after the notice.
    await pagina.waitForFunction(() => document.querySelector('.lector__ir-campo').value === '2');
    await hoja.getByRole('button', { name: 'Ir al principio' }).click();
    await pagina.waitForFunction(() => document.querySelector('.lector__ir-campo').value === '1');
    await hoja.locator('.lector__resaltado--verde').first().waitFor();

    // Deleting a highlight with a note asks first.
    await hoja.getByRole('button', { name: 'Notas y páginas' }).click();
    await nota.getByRole('button', { name: 'Borrar' }).click();
    await pagina.locator('dialog.dialogo').getByRole('button', { name: 'Borrar' }).click();
    await hoja.getByText('Todavía no resaltaste nada en este archivo.').waitFor();
    assert.equal(await hoja.locator('.lector__resaltado').count(), 0);
    await boton('Cerrar').click();
    await hoja.waitFor({ state: 'detached' });
  });

  await prueba('el lector de PDF: señaladores para saltar entre páginas, que siguen al recargar', async () => {
    // Alone (FLUJOS_SOLO) it starts from the sign-in.
    await ir('materias/1');
    const usuario = pagina.getByLabel('Usuario');
    await Promise.race([usuario.waitFor().catch(() => {}), fila('Apunte uno').waitFor().catch(() => {})]);
    if (await usuario.isVisible()) {
      await usuario.fill('alumno');
      await pagina.getByLabel('Contraseña').fill(CONTRASENA);
      await boton('Entrar').click();
      await pagina.getByRole('heading', { name: 'Hola, Ana' }).waitFor();
      await ir('materias/1');
    }
    const hoja = pagina.getByRole('dialog');
    const abrir = async () => {
      await fila('Apunte uno').click();
      await hoja.locator('.lector__pagina[data-pagina="1"] .textLayer span').first().waitFor();
      const alPrincipio = hoja.getByRole('button', { name: 'Ir al principio' });
      if (await alPrincipio.isVisible()) await alPrincipio.click();
      await pagina.waitForFunction(() => document.querySelector('.lector__ir-campo').value === '1');
    };
    const enDisco = () => pagina.evaluate(() => Object.values(JSON.parse(localStorage.getItem('cl.mio.5') ?? '{}').lecturas ?? {}).flatMap((l) => l.senaladores ?? []));
    await abrir();
    const senalar = hoja.getByRole('button', { name: 'Señalar esta página' });
    assert.equal(await senalar.getAttribute('aria-pressed'), 'false');
    assert.equal(await senalar.getAttribute('aria-keyshortcuts'), 'M');

    // The button marks page 1: pressed, and a ribbon on the page.
    await senalar.click();
    assert.equal(await senalar.getAttribute('aria-pressed'), 'true');
    await hoja.locator('.lector__pagina[data-pagina="1"] .lector__cinta').waitFor();
    assert.equal(await hoja.locator('.lector__pagina[data-pagina="1"]').getAttribute('aria-label'), 'Página 1 de 2, señalada');
    // M marks page 2.
    const irA = hoja.getByRole('textbox', { name: 'Página, de 2' });
    await irA.fill('2');
    await irA.press('Enter');
    await pagina.waitForFunction(() => document.querySelector('.lector__ir-campo').value === '2');
    assert.equal(await senalar.getAttribute('aria-pressed'), 'false');
    await pagina.keyboard.press('m');
    await pagina.waitForFunction(() => document.querySelector('.lector__senalar')?.getAttribute('aria-pressed') === 'true');
    await hoja.getByRole('status').filter({ hasText: 'Señalaste la página 2.' }).waitFor({ state: 'attached' });
    // On disk, only the pages and when.
    const guardados = await enDisco();
    assert.deepEqual(guardados.map((s) => s.pagina), [1, 2]);
    assert.ok(guardados.every((s) => Object.keys(s).join() === 'pagina,creado' && Number.isSafeInteger(s.creado)), 'solo la página y la fecha');

    // The list, first among the notes: each one goes to its page.
    await hoja.getByRole('button', { name: 'Notas y páginas' }).click();
    await hoja.getByRole('tab', { name: /^Notas/, selected: true }).waitFor();
    const lista = hoja.getByRole('region', { name: 'Páginas señaladas' });
    const paginas = lista.getByRole('button', { name: /^Página \d+$/ });
    assert.deepEqual(await paginas.allInnerTexts(), ['Página 1', 'Página 2']);
    assert.equal(await lista.getByRole('button', { name: 'Página 2', exact: true }).getAttribute('aria-current'), 'page');
    await pagina.evaluate(AXE);
    const fallas = await pagina.evaluate(async () => (await window.axe.run(document.querySelector('.lector'), { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })).violations.map((v) => `${v.id}: ${v.nodes[0].target}`));
    assert.deepEqual(fallas, [], 'el lector con los señaladores');
    // The panel gets wider from its edge, up to a tope that leaves the pages most of the reader; the width stays on this
    // device, and a double click takes it back to the usual one.
    const borde = hoja.getByRole('separator', { name: 'Ancho del panel' });
    const medidas = () => pagina.evaluate(() => ({
      panel: document.querySelector('.lector__panel').offsetWidth,
      marco: document.querySelector('.lector__marco').clientWidth,
      raiz: document.querySelector('.lector').clientWidth,
      guardado: JSON.parse(localStorage.getItem('cl.ajustes') ?? '{}').anchoPanelPdf,
    }));
    assert.equal((await medidas()).panel, 280);
    const caja = await borde.boundingBox();
    await pagina.mouse.move(caja.x + caja.width / 2, caja.y + 100);
    await pagina.mouse.down();
    await pagina.mouse.move(caja.x + caja.width / 2 + 54, caja.y + 100, { steps: 4 });
    await pagina.mouse.up();
    assert.equal((await medidas()).panel, 334, 'arrastrado');
    await borde.press('End');
    const alTope = await medidas();
    assert.equal(alTope.guardado, alTope.panel);
    assert.equal(Number(await borde.getAttribute('aria-valuemax')), alTope.panel);
    assert.ok(alTope.marco >= alTope.raiz * 0.55 - 20, `las páginas siguen con lugar: ${JSON.stringify(alTope)}`);
    await borde.press('ArrowLeft');
    assert.equal((await medidas()).panel, alTope.panel - 16);
    await borde.dblclick();
    assert.equal((await medidas()).panel, 280);
    await lista.getByRole('button', { name: 'Página 1', exact: true }).click();
    await pagina.waitForFunction(() => document.querySelector('.lector__ir-campo').value === '1');
    assert.equal(await senalar.getAttribute('aria-pressed'), 'true');
    // Among the small pages, a mark on each.
    await hoja.getByRole('tab', { name: 'Páginas' }).click();
    assert.equal(await hoja.locator('.lector__mini-ir:has(.lector__mini-cinta)').count(), 2);
    await hoja.locator('.lector__mini-ir', { hasText: 'Página 2, señalada' }).waitFor();
    await fin('pdf-senaladores');

    // After reloading, they are still there.
    await pagina.reload();
    await abrir();
    await hoja.locator('.lector__pagina[data-pagina="1"] .lector__cinta').waitFor();
    assert.equal(await senalar.getAttribute('aria-pressed'), 'true');
    await hoja.getByRole('button', { name: 'Notas y páginas' }).click();
    await hoja.getByRole('tab', { name: 'Notas' }).click();
    assert.deepEqual(await paginas.allInnerTexts(), ['Página 1', 'Página 2']);

    // The one of the page being read, clicked again, gets a name, like a file in a folder. Esc leaves it as it was
    // (and the reader open), Enter keeps it, and an empty name goes back to «Página N». F2 does the same.
    const primera = lista.getByRole('button', { name: 'Página 1', exact: true });
    await primera.click();
    const nombre = lista.getByRole('textbox', { name: 'Nombre del señalador de la página 1' });
    await nombre.fill('Procesos');
    await nombre.press('Escape');
    assert.equal(await hoja.isVisible(), true, 'Esc en el nombre deja el lector abierto');
    assert.deepEqual(await paginas.allInnerTexts(), ['Página 1', 'Página 2']);
    await primera.press('F2');
    await nombre.fill('  Procesos y   estados ');
    await nombre.press('Enter');
    const conNombre = lista.getByRole('button', { name: 'Procesos y estados, página 1', exact: true });
    await conNombre.waitFor();
    await pagina.waitForFunction(() => document.activeElement?.classList.contains('lector__senalada-ir'));
    assert.deepEqual((await enDisco()).map((s) => s.nombre ?? null), ['Procesos y estados', null]);
    await pagina.evaluate(AXE);
    assert.deepEqual(await pagina.evaluate(async () => (await window.axe.run(document.querySelector('.lector'), { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })).violations.map((v) => `${v.id}: ${v.nodes[0].target}`)), [], 'un señalador con nombre');
    await fin('pdf-senalador-nombre');
    // Another page's one, clicked, still goes to it.
    await lista.getByRole('button', { name: 'Página 2', exact: true }).click();
    await pagina.waitForFunction(() => document.querySelector('.lector__ir-campo').value === '2');
    await conNombre.click();
    await pagina.waitForFunction(() => document.querySelector('.lector__ir-campo').value === '1');
    await conNombre.press('F2');
    await nombre.fill('');
    await nombre.press('Enter');
    await primera.waitFor();
    assert.deepEqual((await enDisco()).map((s) => s.nombre ?? null), [null, null]);

    // Taken off from the list, the focus goes to the one left; M takes off the one of the page being read.
    await lista.getByRole('button', { name: 'Sacar el señalador de la página 2' }).click();
    assert.deepEqual(await paginas.allInnerTexts(), ['Página 1']);
    await pagina.waitForFunction(() => document.activeElement?.textContent === 'Página 1');
    await hoja.locator('.lector__marco').focus();
    await pagina.keyboard.press('m');
    await lista.waitFor({ state: 'detached' });
    assert.equal(await senalar.getAttribute('aria-pressed'), 'false');
    assert.equal(await hoja.locator('.lector__cinta').count(), 0);
    assert.deepEqual(await enDisco(), []);
    await boton('Cerrar').click();
    await hoja.waitFor({ state: 'detached' });
  });

  await prueba('buscar adentro de los PDF los lee solo a pedido y abre en la página', async () => {
    await ir('buscar');
    const antes = pedidos.length;
    await pagina.getByLabel('Qué buscás').fill('monitor');
    await pagina.getByText('No hay resultados').waitFor();
    assert.equal(pedidos.slice(antes).filter((p) => p.url.includes('pluginfile')).length, 0, 'no lee nada sin que se pida');

    // Slow, to see how it goes and stop it.
    demoraArchivo = 1500;
    const prender = pagina.getByLabel('Buscar también adentro de los PDF');
    await prender.check();
    const estado = pagina.locator('.buscar__pdf-estado');
    await estado.getByText(/^Leyendo \d+ de \d+$/).waitFor();
    await pagina.getByText('Todavía no hay resultados. Faltan leer algunos PDF.').waitFor();
    await boton('Cancelar').click();
    await estado.getByText(/Faltan? /).waitFor();
    demoraArchivo = 0;
    await boton('Seguir leyendo').click();
    await estado.getByText(/PDF leídos?\./).waitFor({ timeout: 15000 });
    await fin('buscar-pdf');

    // Found inside: the file, the page and a piece with the word marked.
    const resultado = pagina.locator('.fila--en-pdf', { hasText: 'Apunte uno' });
    await resultado.getByText('Página 2', { exact: false }).waitFor();
    await resultado.locator('.fila__recorte mark', { hasText: 'monitor' }).first().waitFor();
    const leidos = pedidos.slice(antes).filter((p) => p.url.includes('pluginfile'));
    assert.ok(leidos.every((p) => p.metodo === 'POST' && !p.url.includes(TOKEN)), 'la clave no viaja en la URL');

    // It opens at that page, with the words found.
    await resultado.getByRole('button').click();
    const hoja = pagina.getByRole('dialog');
    const buscar = hoja.getByRole('searchbox', { name: 'Buscar en el documento' });
    await buscar.waitFor();
    assert.equal(await buscar.inputValue(), 'monitor');
    await hoja.locator('.lector__hallazgo--actual').waitFor();
    assert.equal(await hoja.getByRole('textbox', { name: 'Página, de 2' }).inputValue(), '2');
    await boton('Cerrar').click();
    await hoja.waitFor({ state: 'detached' });

    // Read once per visit: turning it on again asks for nothing.
    const despues = pedidos.length;
    await prender.uncheck();
    await prender.check();
    await estado.getByText(/PDF leídos?\./).waitFor();
    assert.equal(pedidos.slice(despues).filter((p) => p.url.includes('pluginfile')).length, 0, 'no vuelve a bajar lo leído');
    const disco = await pagina.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
    assert.ok(!/monitor|junta los datos/i.test(disco), 'nada de lo leído en localStorage ni en sessionStorage');

    // Of each PDF read, only the text of its pages stays in this browser, with the file's version (textosPdf.js). After
    // a reload, turning it on asks the campus for nothing.
    const guardados = await pagina.evaluate(() => new Promise((listo, mal) => {
      const abrir = indexedDB.open('super-cvg-textos');
      abrir.onerror = () => mal(abrir.error);
      abrir.onsuccess = () => {
        const db = abrir.result;
        const todos = db.transaction('textos').objectStore('textos').getAll();
        todos.onerror = () => mal(todos.error);
        todos.onsuccess = () => {
          db.close();
          listo(todos.result.map((r) => Object.keys(r).sort().join(',')));
        };
      };
    }));
    assert.ok(guardados.length > 0 && guardados.every((k) => k === 'paginas,sello'), 'solo el texto de cada página, con su versión');
    await prender.uncheck();
    await pagina.reload();
    await prender.waitFor();
    const recargada = pedidos.length;
    await prender.check();
    await estado.getByText(/PDF leídos?\./).waitFor();
    assert.equal(pedidos.slice(recargada).filter((p) => p.url.includes('pluginfile')).length, 0, 'lo que no cambió no se baja de nuevo');

    // Back where the tests that follow start: the course, with the PDFs left alone.
    await prender.uncheck();
    await ir('materias/1');
  });

  await prueba('un video muestra título y miniatura, sin mandar la clave a YouTube', async () => {
    await fila('Clase grabada').click();
    await pagina.getByText('Video de la clase').waitFor();
    await pagina.getByText('Va a youtu.be').waitFor();
    assert.ok(await pagina.getByRole('img', { name: 'Miniatura del video' }).evaluate((i) => i.complete && i.naturalWidth > 0));
    assert.equal(await pagina.getByRole('link', { name: 'Abrir enlace' }).getAttribute('href'), 'https://youtu.be/dQw4w9WgXcQ');
    await pagina.waitForTimeout(350);
    await fin('previa-video');
    await boton('Cerrar').click();
  });

  await prueba('un enlace inseguro avisa', async () => {
    await fila('Lectura').click();
    await pagina.getByText('Este enlace no usa conexión segura.').waitFor();
    await boton('Cerrar').click();
  });

  await prueba('una actividad muestra descripción y fechas', async () => {
    await fila('Parcial').click();
    await pagina.getByRole('dialog').getByText('Temas de la unidad').waitFor();
    await pagina.getByRole('dialog').getByText('Cierra', { exact: true }).waitFor();
    await boton('Cerrar').click();
  });

  await prueba('renombrar: se ve el nombre nuevo, se busca por los dos y el original sigue a mano', async () => {
    await ir('materias/1');
    await boton('Opciones de Lectura').click();
    await boton('Renombrar').click();
    await pagina.getByLabel('Nombre nuevo').fill('Texto de la clase 3');
    await boton('Guardar').click();
    await fila('Texto de la clase 3').waitFor();
    await pagina.reload();
    await fila('Texto de la clase 3').click();
    await pagina.getByRole('dialog').getByText('En el campus se llama Lectura').waitFor();
    await boton('Cerrar').click();
    await pagina.getByLabel('Buscar en esta materia').fill('lectura');
    assert.equal(await pagina.locator('.fila').count(), 1);
    await pagina.getByLabel('Buscar en esta materia').fill('');
    assert.equal(await pagina.evaluate(() => Object.values(localStorage).join('').includes('Apunte uno')), false);
  });

  await prueba('en el celular el contenido va primero y un enlace lleva a lo tuyo, sin recargar', async () => {
    await pagina.setViewportSize({ width: 390, height: 860 });
    await ir('materias/1');
    await fila('Apunte uno').waitFor();
    const arriba = (selector) => pagina.locator(selector).evaluate((n) => n.getBoundingClientRect().top);
    assert.ok((await arriba('.materia__contenido')) < (await arriba('.materia__lateral')));
    await pagina.getByRole('link', { name: 'Ir a Classroom, tus tareas y anotaciones' }).click();
    await pagina.waitForFunction(() => document.getElementById('lo-tuyo').getBoundingClientRect().top < window.innerHeight / 2);
    assert.equal(await pagina.evaluate(() => document.activeElement.id), 'lo-tuyo');
    await fila('Apunte uno').waitFor({ state: 'attached' });
    await pagina.setViewportSize({ width: 1280, height: 860 });
    await ir('materias/1');
    await fila('Apunte uno').waitFor();
    assert.equal(await pagina.getByRole('link', { name: 'Ir a Classroom, tus tareas y anotaciones' }).count(), 0);
    const aire = await pagina.evaluate(() => document.querySelector('.materia__cuerpo').getBoundingClientRect().top - document.querySelector('.materia__titulo').getBoundingClientRect().bottom);
    assert.ok(aire >= 16, `el título queda pegado al contenido (${aire} px)`);
  });

  await prueba('reordenar con botones, con foco en su lugar, y con arrastre', async () => {
    const orden = () => pagina.locator('section').filter({ hasText: 'Unidad 1' }).locator('.fila__nombre').allTextContents();
    const antes = await orden();
    assert.equal(antes[0], 'Apunte uno');
    await boton('Opciones de Planilla').click();
    await boton('Subir').click();
    await pagina.waitForFunction(() => document.activeElement?.textContent === 'Bajar' || document.activeElement?.textContent === 'Subir');
    assert.equal((await orden())[0], 'Planilla');
    await pagina.reload();
    await fila('Apunte uno').waitFor();
    assert.equal((await orden())[0], 'Planilla');
    await pagina.locator('.fila--editable', { hasText: 'Parcial' }).dragTo(pagina.locator('.fila--editable', { hasText: 'Planilla' }));
    assert.equal((await orden())[0], 'Parcial');
  });

  await prueba('ocultar un ítem, deshacerlo y volver a mostrarlo desde la lista', async () => {
    await boton('Opciones de Clase grabada').click();
    await boton('Ocultar').click();
    await fila('Clase grabada').waitFor({ state: 'detached' });
    assert.equal(await pagina.evaluate(() => document.activeElement.textContent), 'Deshacer');
    await boton('Deshacer').click();
    await fila('Clase grabada').waitFor();
    await boton('Opciones de Clase grabada').click();
    await boton('Ocultar').click();
    await pagina.getByText('Lo que ocultaste (2)').click();
    await boton('Mostrar Clase grabada').click();
    await fila('Clase grabada').waitFor();
  });

  await prueba('visto y parcial: apagado de entrada, se prende en Configuración, se marcan, se filtran y suman al avance', async () => {
    // Off by default: no button, no «Sin ver», no progress.
    assert.equal(await pagina.locator('.fila__visto').count(), 0, 'sin marcar como visto de entrada');
    assert.equal(await boton('Sin ver').count(), 0);
    assert.equal(await pagina.getByText('Visto, 0 de', { exact: false }).count(), 0);
    await ir('configuracion#materias');
    const vistos = pagina.getByRole('switch', { name: 'Marcar lo que ya viste' });
    assert.equal(await vistos.isChecked(), false);
    await vistos.check();
    await ir('materias/1');
    await boton('Visto, Apunte uno').click();
    await pagina.getByText('Visto, 1 de', { exact: false }).waitFor();
    await boton('Sin ver').click();
    await fila('Apunte uno').waitFor({ state: 'detached' });
    await boton('Sin ver').click();
    await boton('Opciones de Planilla').click();
    await boton('Sumar al parcial').click();
    await boton('Para el parcial').click();
    assert.equal(await pagina.locator('.fila').count(), 1);
    await boton('Para el parcial').click();
  });

  await prueba('Buscar en Drive: carpetas como en Drive, por nombre, escondidas, abiertas acá y mandadas a una materia', async () => {
    // Alone (FLUJOS_SOLO) it starts from the sign-in.
    await ir('buscar');
    const usuario = pagina.getByLabel('Usuario');
    await Promise.race([usuario.waitFor().catch(() => {}), boton('Drive').waitFor().catch(() => {})]);
    if (await usuario.isVisible()) {
      await usuario.fill('alumno');
      await pagina.getByLabel('Contraseña').fill(CONTRASENA);
      await boton('Entrar').click();
      await pagina.getByRole('heading', { name: 'Hola, Ana' }).waitFor();
      await ir('buscar');
    }
    await boton('Drive').click();
    await pagina.getByRole('heading', { level: 1, name: 'Buscar en Drive' }).waitFor();
    // The career's Drive is there for everyone, folder by folder, with how many files each holds.
    const raiz = pagina.locator('.drive__raiz', { has: pagina.getByRole('heading', { name: 'Drive de la carrera' }) });
    await raiz.getByText('3 archivos, mapa del 14 de noviembre').waitFor();
    // Its name closes it whole, and it stays closed coming back in the same tab.
    await raiz.getByRole('button', { name: 'Drive de la carrera', exact: true }).click();
    assert.equal(await raiz.getByRole('button', { name: /^1° AÑO/ }).count(), 0);
    await pagina.reload();
    await raiz.getByRole('button', { name: 'Drive de la carrera', exact: true }).waitFor();
    assert.equal(await raiz.getByRole('button', { name: 'Drive de la carrera', exact: true }).getAttribute('aria-expanded'), 'false');
    await raiz.getByRole('button', { name: 'Drive de la carrera', exact: true }).click();
    await raiz.getByRole('button', { name: /^1° AÑO/ }).click();
    await raiz.getByRole('button', { name: /^Análisis Matemático I/ }).click();
    await raiz.getByRole('button', { name: /^Primer parcial 2024\.pdf/ }).waitFor();
    // By type: only the documents, and the folders that have one.
    await boton('Documentos').click();
    assert.equal(await raiz.getByRole('button', { name: /^Primer parcial/ }).count(), 0);
    assert.equal(await raiz.getByRole('button', { name: /^Electivas/ }).count(), 0, 'una carpeta sin documentos no se ve');
    await boton('Todo').click();

    // By name, without accents, with the words in the folders it is in; a folder found opens in its place.
    const campo = pagina.getByLabel('Qué buscás');
    await campo.fill('parcial analisis');
    await pagina.locator('.buscar__estado').getByText('1 resultado').waitFor();
    await campo.fill('analisis');
    await pagina.getByRole('button', { name: /^Análisis Matemático I 1° AÑO/ }).click();
    assert.equal(await campo.inputValue(), '');
    await pagina.waitForFunction(() => document.activeElement?.textContent.startsWith('Análisis Matemático I'));
    assert.equal(await raiz.getByRole('button', { name: /^Análisis Matemático I/ }).getAttribute('aria-expanded'), 'true');

    // A PDF opens in the reader, from Drive with the site's key, and goes to a course as a link.
    await raiz.getByRole('button', { name: /^Primer parcial 2024\.pdf/ }).click();
    const hoja = pagina.getByRole('dialog');
    await pagina.locator('dialog.previa--pdf').waitFor();
    assert.equal(await hoja.getByRole('link', { name: 'Ver en Drive' }).getAttribute('href'), 'https://drive.google.com/file/d/archivoParcial000001/view');
    await hoja.getByRole('button', { name: 'Mandar a una materia' }).click();
    await hoja.getByRole('button', { name: 'Mandar el link' }).click();
    await hoja.getByText('Elegí una materia.').waitFor();
    await hoja.getByLabel('Materia').selectOption({ label: 'Materia A' });
    assert.equal(await hoja.getByLabel('Sección').inputValue(), 'nueva');
    await hoja.getByRole('button', { name: 'Mandar el link' }).click();
    await hoja.getByText(/^Quedó en Materia A, en «Del Drive»\.$/).waitFor();
    const aDrive = pedidos.filter((p) => p.url.includes('archivoParcial000001') && p.metodo === 'GET');
    assert.ok(aDrive.length && aDrive.every((p) => !p.cabeceras.authorization && new URL(p.url).searchParams.get('key') === CLAVE_DRIVE_PRUEBA));
    await hoja.getByRole('link', { name: 'Materia A' }).click();
    await hoja.waitFor({ state: 'detached' });
    // In the course it opens here too, as the file.
    await fila('Primer parcial 2024.pdf').click();
    await pagina.locator('dialog.previa--pdf').waitFor();
    await pagina.getByRole('dialog').getByRole('button', { name: 'Sumar al parcial' }).waitFor();
    await pagina.keyboard.press('Escape');

    // Hidden: it goes, and comes back from «Mostrar lo escondido».
    await ir('buscar');
    await raiz.getByRole('button', { name: 'Esconder Electivas' }).click();
    assert.equal(await raiz.getByRole('button', { name: /^Electivas/ }).count(), 0);
    await pagina.getByLabel('Mostrar lo escondido (1)').check();
    await raiz.getByRole('button', { name: 'Mostrar Electivas' }).click();
    assert.equal(await pagina.getByLabel(/Mostrar lo escondido/).count(), 0);

    // Another folder, by its link: one that isn't public says so; a public one comes with its map.
    const link = pagina.getByLabel('Sumar una carpeta de Drive');
    await link.fill('https://drive.google.com/file/d/archivoPublicoPrueba1/view');
    await boton('Sumar').click();
    await pagina.getByText('Ese link es de un archivo. Pegá el de la carpeta que lo tiene.').waitFor();
    await link.fill('https://drive.google.com/drive/folders/carpetaPrivadaPrueba1');
    await boton('Sumar').click();
    await pagina.getByText(/no está compartida con cualquiera/).waitFor();
    await link.fill('https://drive.google.com/drive/folders/carpetaPublicaPrueba1?usp=sharing');
    await boton('Sumar').click();
    const otra = pagina.locator('.drive__raiz', { has: pagina.getByRole('heading', { name: 'Apuntes de un compañero' }) });
    await otra.getByRole('button', { name: /^Resumen de Física\.pdf/ }).waitFor();
    assert.equal(await link.inputValue(), '');
    await otra.getByRole('button', { name: 'Quitar Apuntes de un compañero' }).click();
    await pagina.locator('dialog.dialogo').getByRole('button', { name: 'Quitar' }).click();
    await otra.waitFor({ state: 'detached' });

    // A link of the campus to a file of Drive: Drive says what it is, and it opens here; one that isn't shared, as a link.
    await ir('materias/2');
    await fila('Cuadro compartido').click();
    await pagina.locator('dialog.previa--pdf').waitFor();
    await pagina.getByRole('dialog').getByRole('heading', { name: 'Cuadro compartido' }).waitFor();
    await pagina.keyboard.press('Escape');
    await fila('Cuadro privado').click();
    await pagina.getByRole('dialog').getByText('Para verlo acá tiene que estar compartido con cualquiera que tenga el link.').waitFor();
    assert.equal(await pagina.getByRole('dialog').getByRole('link', { name: 'Abrir enlace' }).getAttribute('href'), 'https://drive.google.com/file/d/archivoPrivadoPrueba1/view');
    await pagina.keyboard.press('Escape');

    // When Google stops the downloads, the file is seen with Google's own view.
    await ir('buscar');
    await raiz.getByRole('button', { name: /^Aportar material.pdf/ }).click();
    const frenada = pagina.getByRole('dialog');
    await frenada.getByText('Google frenó las descargas por un rato. Mientras tanto, lo ves con el visor de Google.').waitFor();
    assert.equal(await frenada.locator('iframe').getAttribute('src'), 'https://drive.google.com/file/d/archivoAportar000001/preview');
    await pagina.frameLocator('dialog iframe').getByText('Vista de Google').waitFor();
    await pagina.keyboard.press('Escape');
    // Buscar stays on Drive for the visit: the next ones look in the courses.
    await boton('Tus materias').click();
    await fin('drive');
  });

  await prueba('Buscar: palabras para probar, por materia, con lo hallado marcado, y lo del parcial sin escribir', async () => {
    await ir('buscar');
    const campo = pagina.getByLabel('Qué buscás');
    const estado = pagina.locator('.buscar__estado');
    const titulos = () => pagina.locator('.buscar__materia a').allTextContents();
    // Only words that find something, with how many. One tap searches it, and the focus stays in the box.
    await pagina.locator('.buscar__sugerida').first().waitFor();
    assert.deepEqual(await pagina.locator('.buscar__sugerida').evaluateAll((b) => b.map((x) => x.getAttribute('aria-label'))), ['parcial, 1', 'apunte, 1', 'práctica, 1']);
    await boton('apunte, 1').click();
    assert.equal(await campo.inputValue(), 'apunte');
    assert.equal(await pagina.evaluate(() => document.activeElement?.getAttribute('type')), 'search');
    await estado.getByText('Un resultado en una materia').waitFor();
    assert.equal(await pagina.locator('.buscar__grupo .fila__nombre mark').first().textContent(), 'Apunte');
    assert.equal(await pagina.locator('.buscar__sugerida').count(), 0, 'con algo escrito ya no sugiere');

    // Found in two subjects: by subject, the best first; one tap leaves only one, and the kinds count that one.
    await campo.fill('unidad');
    await estado.getByText(/resultados en 2 materias$/).waitFor();
    assert.deepEqual(await titulos(), ['Materia A', 'Materia B']);
    const deB = Number((await pagina.getByRole('button', { name: /^Materia B, \d+$/ }).getAttribute('aria-label')).split(', ')[1]);
    await pagina.getByRole('button', { name: /^Materia B, \d+$/ }).click();
    assert.deepEqual(await titulos(), ['Materia B']);
    assert.equal(await pagina.getByRole('button', { name: /^Todo, \d+$/ }).getAttribute('aria-label'), `Todo, ${deB}`);
    await pagina.getByRole('button', { name: /^Todas, \d+$/ }).click();
    assert.deepEqual(await titulos(), ['Materia A', 'Materia B']);

    // A few of each subject, and the rest one tap away, with the focus on the first that was hidden.
    const grupoA = pagina.locator('.buscar__grupo').first();
    const deA = await grupoA.locator('.fila').count();
    assert.equal(deA, 4);
    await grupoA.getByRole('button', { name: /^Ver las \d+ de Materia A$/ }).click();
    assert.ok((await grupoA.locator('.fila').count()) > 4);
    assert.equal(await pagina.evaluate(() => document.activeElement === document.querySelectorAll('.buscar__grupo')[0].querySelectorAll('.fila__principal')[4]), true);

    // «Para el parcial» without words: what was marked, in every subject.
    await campo.fill('');
    await boton('Para el parcial, 1').click();
    await estado.getByText('Un resultado en una materia').waitFor();
    assert.deepEqual(await pagina.locator('.buscar__grupo .fila__nombre').allTextContents(), ['Planilla']);
    await boton('Para el parcial, 1').click();
    assert.equal(await estado.count(), 0, 'sin palabras ni filtro no lista nada');
    for (const ancho of [390, 1280]) {
      await pagina.setViewportSize({ width: ancho, height: 860 });
      await campo.fill('unidad');
      assert.equal(await pagina.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false, `buscar en ${ancho} se sale a lo ancho`);
      await fin(`buscar-${ancho}`);
    }
    await ir('materias/1');
  });

  await prueba('tarea y anotación: quedan guardadas, y la tarea aparece en Hoy y en el calendario', async () => {
    const dia = new Date(Date.now() + 2 * DIA * 1000);
    const clave = `${dia.getFullYear()}-${String(dia.getMonth() + 1).padStart(2, '0')}-${String(dia.getDate()).padStart(2, '0')}`;
    await pagina.getByLabel('Qué tenés que hacer').fill('Resolver la guía 4');
    await pagina.getByLabel('Para cuándo').fill(clave);
    await boton('Agregar').click();
    await pagina.getByText('Anotaciones', { exact: true }).click();
    await pagina.getByLabel('Tus anotaciones').fill('Preguntar por el TP');
    await pagina.getByText('Guardado en este navegador').waitFor();
    await pagina.reload();
    await pagina.locator('.tarea', { hasText: 'Resolver la guía 4' }).waitFor();
    assert.equal(await pagina.getByLabel('Tus anotaciones').inputValue(), 'Preguntar por el TP');
    await ir('');
    await pagina.locator('.vista-hoy .tarea', { hasText: 'Resolver la guía 4' }).waitFor();
    await ir(`calendario?dia=${clave}`);
    await pagina.locator('.eventos').first().getByText('Resolver la guía 4').waitFor();
    await pagina.getByText('Tarea tuya', { exact: false }).first().waitFor();
    const [descarga] = await Promise.all([pagina.waitForEvent('download'), boton('Bajar para tu calendario').click()]);
    assert.ok(fs.readFileSync(await descarga.path(), 'utf8').includes('Resolver la guía 4'));
  });

  await prueba('lo nuevo en una materia se avisa en Hoy y en la materia, hasta revisarlo', async () => {
    moduloNuevo = true;
    await ir('materias/1');
    await pagina.getByRole('heading', { name: 'Cambios desde tu última revisión' }).waitFor();
    await pagina.locator('.cambios').getByText('Enlace recién subido').waitFor();
    await ir('');
    await pagina.locator('.notificacion', { hasText: 'Uno nuevo' }).waitFor();
    await ir('materias/1');
    await boton('Ya lo revisé').click();
    await pagina.getByRole('heading', { name: 'Cambios desde tu última revisión' }).waitFor({ state: 'detached' });
    await pagina.reload();
    await fila('Enlace recién subido').waitFor();
    assert.equal(await pagina.getByRole('heading', { name: 'Cambios desde tu última revisión' }).count(), 0);
    moduloNuevo = false;
    await pagina.reload();
    await pagina.getByText('Sacaron un ítem de la materia.').waitFor();
    await boton('Ya lo revisé').click();
  });

  // Hoy as each student arranges it (hoy.js), chosen in Configuración: only block keys and course numbers on disk.
  await prueba('Hoy a gusto: bloques ordenados y ocultos, qué entra en «Vencimientos», hasta cuándo mirar y materias fuera de Hoy y el Calendario', async () => {
    const enDisco = async () => JSON.parse((await pagina.evaluate(() => localStorage.getItem('cl.mio.5'))) ?? '{}');
    // A date of the student's own ten days ahead, «otra cosa»: it goes to «Próximas fechas», not to «Vencimientos». And a
    // task of theirs for the day after tomorrow.
    const pasado = new Date(Date.now() + 2 * DIA * 1000).toLocaleDateString('sv');
    await pagina.evaluate(([cuando, fecha]) => {
      const mio = JSON.parse(localStorage.getItem('cl.mio.5') ?? '{}');
      const a = mio.materias?.[1] ?? {};
      localStorage.setItem('cl.mio.5', JSON.stringify({
        ...mio,
        eventos: [...(mio.eventos ?? []), { id: 9901, titulo: 'Repaso con el grupo', cuando, tipo: 'otro' }],
        materias: { ...mio.materias, 1: { ...a, tareas: [...(a.tareas ?? []), { id: 9902, texto: 'Pasar en limpio la guía', fecha, hecha: false }] } },
      }));
    }, [Math.floor(Date.now() / 1000) + 10 * DIA, pasado]);
    parcialEnHoy = true;
    try {
      await ir('');
      const usuario = pagina.getByLabel('Usuario');
      await pagina.getByRole('heading', { name: 'Hola, Ana' }).or(usuario).first().waitFor();
      if (await usuario.isVisible()) {
        await usuario.fill('alumno');
        await pagina.getByLabel('Contraseña').fill(CONTRASENA);
        await boton('Entrar').click();
        await pagina.getByRole('heading', { name: 'Hola, Ana' }).waitFor();
      }
      // The quiz, pending or already among what was done.
      const parcial = pagina.locator('.pendiente, details.hechas .hechas__titulo', { hasText: 'Parcial' });
      await parcial.waitFor({ state: 'attached' });
      await pagina.locator('.eventos').getByText('Repaso con el grupo').waitFor();
      // «Ordenar» opens its place in Configuración, under the tabs.
      await pagina.getByRole('link', { name: 'Ordenar' }).click();
      await pagina.waitForURL(/configuracion#hoy$/);
      const columna = (c) => pagina.locator(`.orden-hoy[data-columna="${c}"] .orden-hoy__nombre`).allTextContents();
      assert.deepEqual(await columna('principal'), ['Vencimientos', 'Ya hecho', 'Para hacer', 'Próximas fechas']);
      // With the arrows on the handle, one place at a time, the focus staying on it.
      await boton('Mover Próximas fechas').focus();
      for (let i = 0; i < 3; i++) await pagina.keyboard.press('ArrowUp');
      assert.deepEqual(await columna('principal'), ['Próximas fechas', 'Vencimientos', 'Ya hecho', 'Para hacer']);
      assert.equal(await pagina.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Mover Próximas fechas');
      await pagina.getByText('Próximas fechas quedó en el lugar 1 de 4.').waitFor();
      // A tap on the handle offers «Subir» and «Bajar».
      await boton('Mover Para hacer').click();
      await pagina.getByRole('group', { name: 'Mover Para hacer' }).getByRole('button', { name: 'Subir' }).click();
      assert.deepEqual(await columna('principal'), ['Próximas fechas', 'Vencimientos', 'Para hacer', 'Ya hecho']);
      // Dragged, in its own column. Both ends on screen: the list is far down the page.
      await pagina.evaluate(() => document.querySelector('.orden-hoy[data-columna="costado"]').scrollIntoView({ block: 'center' }));
      const [a, b] = [await boton('Mover Avisos').boundingBox(), await boton('Mover En la facu').boundingBox()];
      await pagina.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
      await pagina.mouse.down();
      await pagina.mouse.move(a.x + a.width / 2, a.y + a.height / 2 - 10, { steps: 3 });
      await pagina.mouse.move(b.x + b.width / 2, b.y + 2, { steps: 8 });
      await pagina.mouse.up();
      await pagina.locator('.orden-hoy[data-arrastrando]').waitFor({ state: 'detached' });
      assert.equal((await columna('costado'))[0], 'Avisos');
      // To the other column, with the arrow toward it: same place, the focus following.
      await boton('Mover En la facu').focus();
      await pagina.keyboard.press('ArrowLeft');
      assert.deepEqual(await columna('principal'), ['Próximas fechas', 'En la facu', 'Vencimientos', 'Para hacer', 'Ya hecho']);
      // The focus comes back on the next frame (AjustesDeHoy.jsx, pasar): waited for, not read at once.
      await pagina.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Mover En la facu', null, { timeout: 2000 });
      await pagina.getByText('En la facu pasó a la columna principal, en el lugar 2 de 5.').waitFor();
      // And back, from the tap on the handle.
      await boton('Mover En la facu').click();
      await pagina.getByRole('group', { name: 'Mover En la facu' }).getByRole('button', { name: 'Pasar al costado' }).click();
      assert.equal((await columna('costado'))[1], 'En la facu');
      await boton('Mover En la facu').focus();
      await pagina.keyboard.press('ArrowLeft');
      await pagina.getByRole('switch', { name: 'Último subido' }).uncheck();
      // The preview beside follows: the block leaves it, and the moved one is first of its column.
      await pagina.locator('.miniatura--hoy [data-bloque="ultimo"]').waitFor({ state: 'detached' });
      assert.equal(await pagina.locator('.miniatura--hoy .miniatura__costado .miniatura__nombre').first().textContent(), 'Avisos');
      await pagina.locator('input[data-cuenta="cuestionarios"]').uncheck();
      await pagina.getByLabel('Tus fechas').check();
      await pagina.getByLabel('Una semana').check();
      // Materia B is not in progress, but still has its dates: it is among the others, folded.
      assert.deepEqual(await pagina.locator('.materias-hoy').first().locator('.materias-hoy__nombre').allTextContents(), ['Materia A']);
      await pagina.getByText('Las que no estás cursando (1)').click();
      await pagina.getByRole('switch', { name: 'Materia B' }).uncheck();
      const { hoy } = await enDisco();
      assert.deepEqual(hoy, {
        orden: ['fechas', 'facu', 'pendientes', 'tareas', 'hechas', 'avisos', 'classroom', 'mensajes', 'cambios', 'ultimo'],
        columnas: { facu: 'principal' },
        ocultos: ['ultimo'],
        cuenta: ['entregas', 'classroom', 'propias'],
        dias: 7,
        // How the week is drawn (semanaEnHoy): as numbers, the default.
        semana: null,
        fuera: [2],
      });

      // Hoy in that order, in its three views.
      for (const vista of ['agenda', 'tablero', 'compacta']) {
        await pagina.evaluate((v) => localStorage.setItem('cl.ajustes', JSON.stringify({ vistas: { hoy: v } })), vista);
        await ir('');
        await pagina.locator(`.vista-hoy[data-vista="${vista}"]`).waitFor();
        await pagina.locator('.hoy__lateral h2').first().waitFor();
        assert.equal(await pagina.locator('.hoy__principal h2').first().textContent(), 'Próximas fechas', vista);
        assert.equal(await pagina.locator('.hoy__lateral h2').first().textContent(), 'Avisos', vista);
        assert.equal(await pagina.getByRole('heading', { name: 'Último subido' }).count(), 0, vista);
      }
      await pagina.evaluate(() => localStorage.removeItem('cl.ajustes'));
      await ir('');
      // The quiz is out of «Vencimientos»; the student's task with a date is in, and leaves «Próximas fechas».
      await pagina.locator('.destacado, .pendiente', { hasText: 'Pasar en limpio la guía' }).getByText('Tarea tuya, Materia A').waitFor();
      assert.equal(await parcial.count(), 0);
      assert.equal(await pagina.locator('.eventos').getByText('Pasar en limpio la guía').count(), 0);
      // A week ahead: the date ten days away is not there. Materia B's class of today, neither.
      await pagina.locator('.eventos').getByText('Entrega del informe').first().waitFor();
      assert.equal(await pagina.locator('.eventos').getByText('Repaso con el grupo').count(), 0);
      assert.equal(await pagina.locator('.eventos').getByText('Clase de consulta').count(), 0);

      // The Calendario without Materia B, saying so; the campus wasn't asked to change anything.
      await ir('calendario');
      await pagina.locator('.eventos').first().getByText('Entrega del informe').waitFor();
      assert.equal(await pagina.locator('.eventos').first().getByText('Clase de consulta').count(), 0);
      assert.deepEqual(await pagina.getByLabel('Materia').locator('option').allTextContents(), ['Todas', 'Materia A']);
      await pagina.getByText('Sacaste una materia de acá.').waitFor();
      await pagina.getByRole('link', { name: 'Cambiar' }).click();
      await pagina.waitForURL(/configuracion#materias-en-hoy$/);
      await pagina.getByRole('switch', { name: 'Materia B' }).check();
      await ir('calendario');
      await pagina.locator('.eventos').first().getByText('Clase de consulta').waitFor();
      assert.equal(await pagina.locator('.cal__fuera').count(), 0);
    } finally {
      parcialEnHoy = false;
      await pagina.evaluate(() => {
        const { hoy, ...mio } = JSON.parse(localStorage.getItem('cl.mio.5') ?? '{}');
        const a = mio.materias?.[1];
        const materias = a ? { ...mio.materias, 1: { ...a, tareas: (a.tareas ?? []).filter((t) => t.id !== 9902) } } : mio.materias;
        localStorage.setItem('cl.mio.5', JSON.stringify({ ...mio, materias, eventos: (mio.eventos ?? []).filter((e) => e.id !== 9901) }));
        localStorage.removeItem('cl.ajustes');
        return hoy;
      });
    }
  });

  await prueba('calendario marca hoy, filtra, cambia de mes y baja el .ics', async () => {
    await ir('calendario');
    await pagina.locator('.cal__chip').first().waitFor();
    await pagina.locator('.cal__dia[data-hoy]').waitFor();
    await pagina.locator('.eventos').first().getByText('Clase de consulta').waitFor();
    await fin('calendario');
    await pagina.getByLabel('Solo vencimientos').check();
    assert.equal(await pagina.locator('.eventos').first().getByText('Clase de consulta').count(), 0);
    await pagina.getByLabel('Solo vencimientos').uncheck();
    await pagina.getByLabel('Materia').selectOption({ label: 'Materia B' });
    assert.equal(await pagina.locator('.eventos').first().getByText('Entrega del informe').count(), 0);
    const [descarga] = await Promise.all([pagina.waitForEvent('download'), boton('Bajar para tu calendario').click()]);
    const texto = fs.readFileSync(await descarga.path(), 'utf8');
    assert.ok(texto.startsWith('BEGIN:VCALENDAR'));
    assert.ok(texto.includes('Clase de consulta') && !texto.includes('Entrega del informe'));
    const mes = await pagina.locator('.cal__mes h2').textContent();
    await boton(/siguiente/i, false).click();
    await pagina.waitForFunction((anterior) => document.querySelector('.cal__mes h2').textContent !== anterior, mes);
    await boton('Hoy').click();
    await pagina.waitForFunction((esperado) => document.querySelector('.cal__mes h2').textContent === esperado, mes);
    // A campus task opens its page here, like from Hoy, and not the campus in another tab.
    await pagina.getByLabel('Materia').selectOption({ index: 0 });
    const entrega = pagina.locator('.eventos').first().locator('a.evento', { hasText: 'Entrega del informe' });
    assert.equal(await entrega.getAttribute('target'), null);
    assert.match(await entrega.getAttribute('href'), /\/materias\/1\/tareas\/1$/);
    await entrega.click();
    await pagina.waitForURL(/\/materias\/1\/tareas\/1$/);
  });

  await prueba('calendario: una fecha tuya con su tipo y su color, que se cambia y se borra', async () => {
    const axe = AXE;
    const fallasAxe = async () => {
      // Contrast is measured once what fades in has finished, and with nothing under the fixed bar on top.
      // What hasn't been seen yet fades in when axe scrolls to it: it is shown first, so its final color is measured.
      await pagina.evaluate(() => new Promise((listo) => {
        window.scrollTo(0, 0);
        document.querySelectorAll('[data-aparece]:not([data-visto])').forEach((e) => e.setAttribute('data-visto', ''));
        requestAnimationFrame(() => requestAnimationFrame(listo));
      }));
      await pagina.waitForFunction(() => document.getAnimations().every((x) => x.playState !== 'running' || x.effect?.getComputedTiming().iterations === Infinity));
      await pagina.evaluate(axe);
      return pagina.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })).violations.map((v) => `${v.id}: ${v.nodes[0].target}`));
    };
    await ir('calendario');
    await pagina.locator('.cal__dia[data-hoy]').waitFor();
    // The campus' dates get the kind their title points to.
    await pagina.locator('.cal__detalle li[data-tipo="entrega"]', { hasText: 'Entrega del informe' }).first().getByText('Entrega', { exact: true }).waitFor();
    await boton('Agregar una fecha').click();
    const form = pagina.getByRole('form', { name: 'Agregar una fecha' });
    await form.waitFor();
    assert.equal(await pagina.evaluate(() => document.activeElement?.getAttribute('autocomplete')), 'off', 'el foco arranca en «Qué es»');
    await form.getByRole('button', { name: 'Guardar' }).click();
    await form.getByText('Escribí qué es.').waitFor();
    // The title suggests the kind until the student picks one.
    await form.getByLabel('Qué es').fill('Parcial de Física');
    assert.equal(await form.getByLabel('Parcial', { exact: true }).isChecked(), true);
    await form.getByLabel('Hora').fill('10:30');
    await form.getByLabel('Materia').selectOption({ label: 'Materia A' });
    assert.deepEqual(await fallasAxe(), [], 'el formulario abierto');
    await fin('calendario-fecha-propia');
    await form.getByRole('button', { name: 'Guardar' }).click();
    await pagina.getByText(/^Fecha guardada para el /).waitFor();
    await form.waitFor({ state: 'detached' });
    await pagina.waitForFunction(() => document.activeElement?.textContent === 'Agregar una fecha');
    const propia = pagina.locator('.cal__detalle li[data-tipo="parcial"]', { hasText: 'Parcial de Física' });
    await propia.getByText('Fecha tuya, Materia A').waitFor();
    await propia.getByText('10:30').waitFor();
    assert.match(await pagina.locator('.cal__dia[data-hoy]').getAttribute('aria-label'), /con parcial y entrega$/);
    await pagina.locator('.cal__dia[data-hoy] .cal__chip[data-tipo="parcial"]').waitFor();
    assert.deepEqual(await fallasAxe(), [], 'el calendario con la fecha marcada');
    await fin('calendario-con-parcial');

    // It stays after reloading, and opens to be changed.
    await pagina.reload();
    await propia.getByRole('button', { name: /Parcial de Física.*Cambiar$/ }).click();
    const cambiar = pagina.getByRole('form', { name: 'Cambiar tu fecha' });
    assert.equal(await cambiar.getByLabel('Qué es').inputValue(), 'Parcial de Física');
    assert.equal(await cambiar.getByLabel('Hora').inputValue(), '10:30');
    await cambiar.getByLabel('Final', { exact: true }).check();
    await cambiar.getByLabel('Qué es').fill('Final de Física');
    assert.equal(await cambiar.getByLabel('Final', { exact: true }).isChecked(), true, 'lo elegido no lo pisa el título');
    await cambiar.getByRole('button', { name: 'Guardar' }).click();
    await pagina.locator('.cal__detalle li[data-tipo="final"]', { hasText: 'Final de Física' }).waitFor();

    // Escape closes without saving; Borrar asks first.
    await boton('Agregar una fecha').click();
    await form.getByLabel('Qué es').fill('No se guarda');
    await pagina.keyboard.press('Escape');
    await pagina.getByRole('dialog').getByRole('button', { name: 'Descartar' }).click();
    await form.waitFor({ state: 'detached' });
    assert.equal(await pagina.getByText('No se guarda').count(), 0);
    await pagina.locator('.cal__detalle').getByRole('button', { name: /Final de Física/ }).click();
    await cambiar.getByRole('button', { name: 'Borrar' }).click();
    await pagina.getByRole('dialog').getByRole('button', { name: 'Borrar' }).click();
    await pagina.getByText('Fecha borrada.').waitFor();
    assert.equal(await pagina.locator('.cal__detalle').getByText('Final de Física').count(), 0);
  });

  await prueba('calendario: una fecha del campus se corrige, se borra y vuelve, solo en Super CVG', async () => {
    const axe = AXE;
    const fallasAxe = async () => {
      await pagina.waitForFunction(() => document.getAnimations().every((x) => x.playState !== 'running' || x.effect?.getComputedTiming().iterations === Infinity));
      await pagina.evaluate(axe);
      return pagina.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })).violations.map((v) => `${v.id}: ${v.nodes[0].target}`));
    };
    const detalle = pagina.locator('.cal__detalle');
    const fila = (texto) => detalle.locator('li', { hasText: texto }).first();
    const form = pagina.getByRole('form', { name: 'Corregir una fecha del campus' });
    const guardado = async () => JSON.parse((await pagina.evaluate(() => localStorage.getItem('cl.mio.5'))) ?? '{}');
    try {
      await ir('calendario');
      await fila('Clase de consulta').waitFor();

      // «Corregir» next to the campus date opens the form with what the campus says, without the course.
      await fila('Clase de consulta').getByRole('button', { name: 'Corregir Clase de consulta' }).click();
      await form.getByText('Cambia solo en Super CVG. En el campus sigue como está.').waitFor();
      assert.equal(await form.getByLabel('Qué es').inputValue(), 'Clase de consulta');
      assert.equal(await form.getByLabel('Materia').count(), 0, 'la materia es la del campus');
      assert.equal(await form.getByRole('button', { name: 'Volver a la del campus' }).count(), 0, 'todavía no está corregida');
      await form.getByLabel('Qué es').fill('Consulta en el aula 4');
      await form.getByLabel('Parcial', { exact: true }).check();
      assert.deepEqual(await fallasAxe(), [], 'corregir una fecha del campus');
      await fin('calendario-corregir-campus');
      await form.getByRole('button', { name: 'Guardar' }).click();
      await pagina.getByText('Fecha corregida.').waitFor();

      // As it was left, with its link to the campus and saying it was corrected. It stays after reloading.
      await pagina.reload();
      const corregida = fila('Consulta en el aula 4');
      await corregida.getByText('Materia B, corregida por vos').waitFor();
      await corregida.getByText('Parcial', { exact: true }).waitFor();
      assert.equal(await corregida.getByRole('link').getAttribute('href'), `${CAMPUS}/course/view.php?id=2`);
      assert.equal(await detalle.getByText('Clase de consulta').count(), 0);
      assert.deepEqual(Object.keys((await guardado()).campus), ['32']);
      assert.ok(!JSON.stringify(await guardado()).includes('Clase de consulta'), 'nada del campus en el disco');

      // Back to what the campus says.
      await corregida.getByRole('button', { name: 'Corregir Consulta en el aula 4' }).click();
      await form.getByRole('button', { name: 'Volver a la del campus' }).click();
      await pagina.getByText('La fecha quedó como en el campus.').waitFor();
      await fila('Clase de consulta').waitFor();
      assert.equal(await detalle.getByText('Consulta en el aula 4').count(), 0);

      // Deleting asks; the deleted one waits closed under the calendar, and comes back.
      await fila('Clase de consulta').getByRole('button', { name: 'Corregir Clase de consulta' }).click();
      await form.getByRole('button', { name: 'Borrar' }).click();
      await pagina.getByRole('dialog').getByText('¿Borrar esta fecha del calendario?').waitFor();
      await pagina.getByRole('dialog').getByRole('button', { name: 'Borrar' }).click();
      await pagina.getByText('Fecha borrada.').waitFor();
      assert.equal(await detalle.getByText('Clase de consulta').count(), 0);
      const borradas = pagina.locator('details.cal__borradas');
      await borradas.getByText('Una fecha del campus que borraste').click();
      await borradas.getByText('Clase de consulta').waitFor();
      assert.deepEqual(await fallasAxe(), [], 'las fechas borradas');
      await fin('calendario-borradas');
      await borradas.getByRole('button', { name: 'Volver a mostrar Clase de consulta' }).click();
      await fila('Clase de consulta').waitFor();
      assert.equal(await borradas.count(), 0);
      assert.deepEqual((await guardado()).campus, {});
    } finally {
      await pagina.evaluate(() => {
        const mio = JSON.parse(localStorage.getItem('cl.mio.5') ?? 'null');
        if (mio?.campus) localStorage.setItem('cl.mio.5', JSON.stringify({ ...mio, campus: {} }));
      });
    }
  });

  await prueba('calendario: vincular Google Calendar pasa las fechas del campus y las tuyas, y desvincular borra el calendario', async () => {
    const manana = new Date(Date.now() + DIA * 1000);
    const clave = `${manana.getFullYear()}-${String(manana.getMonth() + 1).padStart(2, '0')}-${String(manana.getDate()).padStart(2, '0')}`;
    const aCalendario = () => pedidos.filter((p) => p.url.startsWith('https://www.googleapis.com/calendar/'));
    await ir(`calendario?dia=${clave}`);
    await pagina.locator('.cal__dia').first().waitFor();
    const vincular = boton('Vincular Google Calendar');
    const desvincular = boton('Desvincular Google Calendar');
    await vincular.waitFor();
    assert.equal(aCalendario().length, 0, 'nada va a Google antes de tocar');
    const [ventana] = await Promise.all([pagina.waitForEvent('popup'), vincular.click()]);
    await ventana.waitForEvent('close');
    await desvincular.waitFor();
    // Google asked for the calendars it creates and the folder of Drive, and nothing of the student's other calendars.
    const permiso = new URL(pedidos.filter((p) => p.url.startsWith('https://accounts.google.com/o/oauth2/v2/auth?')).at(-1).url);
    assert.deepEqual(permiso.searchParams.get('scope').split(' ').filter((a) => a.startsWith('https://')), ['https://www.googleapis.com/auth/calendar.app.created', 'https://www.googleapis.com/auth/drive.appdata']);
    await pagina.locator('.gcal__linea', { hasText: 'Este calendario y el «Super CVG» de tu Google son el mismo.' }).waitFor();
    await pagina.locator('.gcal__linea', { hasText: /Se puso al día recién/ }).waitFor();
    await pagina.getByRole('status').filter({ hasText: 'Este calendario y el «Super CVG»' }).waitFor({ state: 'attached' });
    assert.equal(enCalendario.size, 1);
    const [[idCalendario, cal]] = [...enCalendario];
    assert.equal(cal.summary, 'Super CVG');
    assert.equal(cal.timeZone, 'America/Argentina/Buenos_Aires');
    const vivos = () => [...cal.eventos.values()].filter((e) => e.status !== 'cancelled');
    const deLaFacultad = () => vivos().filter((e) => e.extendedProperties?.private?.fuente === 'facultad');
    const titulos = () => vivos().filter((e) => e.extendedProperties?.private?.fuente !== 'facultad').map((e) => e.summary).sort();
    // The campus' dates, and the task of one's own with a day from the flows before.
    assert.deepEqual(titulos(), ['Clase de consulta (Materia B)', 'Entrega del informe (Materia A)', 'Resolver la guía 4 (Materia A)']);
    // The academic calendar, from today on, as whole days.
    const hoyClave = new Date().toLocaleDateString('sv-SE');
    assert.ok(deLaFacultad().every((e) => e.start.date >= hoyClave && e.description === 'Calendario académico, desde Super CVG'), 'la facultad, de hoy en adelante');
    if (hoyClave < FIN_DEL_CICLO) assert.ok(deLaFacultad().length > 0, 'el calendario académico llega a Google');
    assert.ok([...enDrive.values()].some((f) => f.name === 'super-cvg-calendario-5.json' && f.bytes.toString().includes(idCalendario)), 'anota cuál es en Drive');
    // Its permission in the header, never in an address.
    assert.ok(aCalendario().every((p) => p.cabeceras.authorization === `Bearer ${GTOKEN}` && !p.url.includes(GTOKEN)));
    await pagina.getByRole('link', { name: /^Abrir Google Calendar/ }).waitFor();

    // A date of the student's own goes by itself, and the link to add it by hand goes away.
    await boton('Agregar una fecha').click();
    const form = pagina.getByRole('form', { name: 'Agregar una fecha' });
    await form.getByLabel('Qué es').fill('Parcial de Física');
    await form.getByLabel('Día').fill(clave);
    await form.getByLabel('Hora').fill('10:30');
    await form.getByLabel('Materia').selectOption({ label: 'Materia A' });
    await form.getByRole('button', { name: 'Guardar' }).click();
    await form.waitFor({ state: 'detached' });
    for (let i = 0; i < 40 && !titulos().includes('Parcial de Física (Materia A)'); i++) await pagina.waitForTimeout(250);
    assert.ok(titulos().includes('Parcial de Física (Materia A)'), 'la fecha tuya llega a Google');
    // The academic calendar turned off in Calendario goes away from Google too; on again, it comes back.
    if (hoyClave < FIN_DEL_CICLO) {
      const cuantas = deLaFacultad().length;
      await pagina.getByLabel('Calendario académico').uncheck();
      for (let i = 0; i < 40 && deLaFacultad().length; i++) await pagina.waitForTimeout(250);
      assert.equal(deLaFacultad().length, 0, 'apagado, se va de Google');
      await pagina.getByLabel('Calendario académico').check();
      for (let i = 0; i < 40 && deLaFacultad().length < cuantas; i++) await pagina.waitForTimeout(250);
      assert.equal(deLaFacultad().length, cuantas, 'prendido, vuelve');
    }
    assert.equal(await pagina.locator('.cal__detalle li', { hasText: 'Parcial de Física' }).locator('.evento__google').count(), 0);
    for (const ancho of [390, 1280]) {
      await pagina.setViewportSize({ width: ancho, height: 860 });
      await pagina.locator('.titular').screenshot({ path: path.join(CAPTURAS, `calendario-google-vinculado-${ancho}.png`) });
      await pagina.locator('.gcal').screenshot({ path: path.join(CAPTURAS, `calendario-google-estado-${ancho}.png`) });
    }
    await fin('calendario-google-vinculado');
    // Here, only which calendar it is, the account, when and fingerprints: nothing of the campus.
    const marcas = await pagina.evaluate(() => localStorage.getItem('cl.gcal.5'));
    assert.deepEqual(Object.keys(JSON.parse(marcas)).filter((k) => k !== 'explicado').sort(), ['base', 'calendario', 'cuenta', 'prendido', 'tocado', 'ultima']);
    assert.ok(!marcas.includes('Materia') && !marcas.includes('Parcial') && !marcas.includes('Clase'));

    // It is one calendar: what the student writes or changes in Google shows here the next time it looks.
    const pasado = new Date(manana.getFullYear(), manana.getMonth(), manana.getDate() + 1);
    const clavePasado = `${pasado.getFullYear()}-${String(pasado.getMonth() + 1).padStart(2, '0')}-${String(pasado.getDate()).padStart(2, '0')}`;
    const ahoraIso = () => new Date().toISOString();
    cal.eventos.set('amano1', { id: 'amano1', summary: 'Cumple de Beto', description: 'Llevar torta', start: { date: clave }, end: { date: clavePasado }, updated: ahoraIso() });
    const [idParcial, parcial] = [...cal.eventos].find(([, e]) => e.summary === 'Parcial de Física (Materia A)');
    const alas15 = new Date(manana.getFullYear(), manana.getMonth(), manana.getDate(), 15, 0);
    cal.eventos.set(idParcial, { ...parcial, summary: 'Parcial de Física II (Materia A)', start: { dateTime: alas15.toISOString() }, end: { dateTime: new Date(alas15.getTime() + 7200_000).toISOString() }, updated: ahoraIso() });
    await ir(`calendario?dia=${clave}`);
    const detalle = pagina.locator('.cal__detalle');
    await detalle.locator('li', { hasText: 'Cumple de Beto' }).waitFor();
    const cambiado = detalle.locator('li', { hasText: 'Parcial de Física II' });
    await cambiado.waitFor();
    assert.match(await cambiado.innerText(), /15:00|03:00/);
    await detalle.screenshot({ path: path.join(CAPTURAS, 'calendario-google-de-alla.png') });
    // Changed here, only the title and the day go: the description stays theirs.
    await detalle.getByRole('button', { name: /Cumple de Beto/ }).click();
    const suya = pagina.getByRole('form', { name: 'Cambiar tu fecha' });
    await suya.getByLabel('Qué es').fill('Cumple de Beto, en casa');
    await suya.getByRole('button', { name: 'Guardar' }).click();
    await suya.waitFor({ state: 'detached' });
    for (let i = 0; i < 40 && cal.eventos.get('amano1').summary !== 'Cumple de Beto, en casa'; i++) await pagina.waitForTimeout(250);
    assert.equal(cal.eventos.get('amano1').summary, 'Cumple de Beto, en casa');
    assert.equal(cal.eventos.get('amano1').description, 'Llevar torta');

    // Desvincular asks first, deletes the calendar and its note in Drive, and the date stays here.
    await desvincular.click();
    const dialogo = pagina.getByRole('dialog');
    await dialogo.getByText('Se borra el calendario «Super CVG» de tu Google, con todas sus fechas. Las de acá quedan.').waitFor();
    await dialogo.getByRole('button', { name: 'Desvincular' }).click();
    await pagina.getByText('Desvinculaste Google Calendar.').waitFor();
    await vincular.waitFor();
    assert.equal(enCalendario.size, 0);
    assert.ok(![...enDrive.values()].some((f) => f.name === 'super-cvg-calendario-5.json'));
    assert.equal(await pagina.locator('.gcal').count(), 0);
    // Unlinked, nothing of it stays in this browser.
    assert.deepEqual(await pagina.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('cl.gcal'))), []);
    await pagina.locator('.cal__detalle li', { hasText: 'Parcial de Física' }).locator('.evento__google').waitFor();
    // Unlinked, what came from Google stays here as the student's own.
    await pagina.locator('.cal__detalle li', { hasText: 'Cumple de Beto, en casa' }).waitFor();
    // The dates were only for this: they go, so the next flows start the same.
    for (const cual of [/Parcial de Física/, /Cumple de Beto/]) {
      await pagina.locator('.cal__detalle').getByRole('button', { name: cual }).click();
      await pagina.getByRole('form', { name: 'Cambiar tu fecha' }).getByRole('button', { name: 'Borrar' }).click();
      await pagina.getByRole('dialog').getByRole('button', { name: 'Borrar' }).click();
      await pagina.getByText('Fecha borrada.').waitFor();
      await pagina.getByText('Fecha borrada.').waitFor({ state: 'detached' }).catch(() => {});
    }
  });

  await prueba('una fecha tuya lleva «Agregar a Google Calendar» en el calendario y en Hoy, y las del campus no', async () => {
    const manana = new Date(Date.now() + DIA * 1000);
    const clave = `${manana.getFullYear()}-${String(manana.getMonth() + 1).padStart(2, '0')}-${String(manana.getDate()).padStart(2, '0')}`;
    await ir(`calendario?dia=${clave}`);
    await pagina.locator('.cal__dia').first().waitFor();
    await boton('Agregar una fecha').click();
    const form = pagina.getByRole('form', { name: 'Agregar una fecha' });
    await form.getByLabel('Qué es').fill('Parcial de Física');
    await form.getByLabel('Día').fill(clave);
    await form.getByLabel('Hora').fill('10:30');
    await form.getByLabel('Materia').selectOption({ label: 'Materia A' });
    await form.getByRole('button', { name: 'Guardar' }).click();
    await form.waitFor({ state: 'detached' });
    const propia = pagina.locator('.cal__detalle li', { hasText: 'Parcial de Física' });
    const link = propia.getByRole('link', { name: 'Agregar a Google Calendar, Parcial de Física, se abre en otra pestaña' });
    await link.waitFor();
    const url = new URL(await link.getAttribute('href'));
    assert.equal(`${url.origin}${url.pathname}`, 'https://calendar.google.com/calendar/render');
    const cuando = new Date(manana.getFullYear(), manana.getMonth(), manana.getDate(), 10, 30);
    const utc = (d) => d.toISOString().replace(/[-:]/g, '').replace('.000', '');
    assert.deepEqual(Object.fromEntries(url.searchParams), {
      action: 'TEMPLATE',
      text: 'Parcial de Física (Materia A)',
      dates: `${utc(cuando)}/${utc(new Date(cuando.getTime() + 3600_000))}`,
      details: 'Parcial, desde Super CVG',
    });
    assert.equal(await link.getAttribute('target'), '_blank');
    assert.equal(await link.getAttribute('rel'), 'noreferrer');
    // It doesn't take the date's button: that one still opens it to be changed.
    await propia.getByRole('button', { name: /Parcial de Física.*Cambiar$/ }).waitFor();
    // The campus' dates go to Google by linking it, not one by one.
    await ir('calendario');
    await pagina.locator('.cal__detalle li', { hasText: 'Clase de consulta' }).first().waitFor();
    assert.equal(await pagina.locator('.cal__detalle li', { hasText: 'Clase de consulta' }).getByRole('link', { name: /Agregar a Google Calendar/ }).count(), 0);
    await pagina.locator('.cal__detalle li', { hasText: 'Parcial de Física' }).locator('.evento__google').waitFor();
    // In Hoy, in «Vencimientos» («Tus fechas» counts from the start), not repeated among the next dates.
    await ir('');
    await pagina.locator('.destacado, .pendiente', { hasText: 'Parcial de Física' }).first().waitFor();
    assert.equal(await pagina.locator('.eventos li', { hasText: 'Parcial de Física' }).count(), 0);
    assert.equal(await pagina.locator('.eventos li', { hasText: 'Clase de consulta' }).getByRole('link', { name: /Agregar a Google Calendar/ }).count(), 0);
    await fin('hoy-fecha-a-google');
    // In the week view on a computer, the date carries it inside its column.
    const ajustes = await pagina.evaluate(() => localStorage.getItem('cl.ajustes'));
    await pagina.evaluate(() => localStorage.setItem('cl.ajustes', JSON.stringify({ vistas: { calendario: 'semana' } })));
    await ir(`calendario?dia=${clave}`);
    const enSemana = pagina.locator('.cal-semana li', { hasText: 'Parcial de Física' }).getByRole('link', { name: /^Agregar a Google Calendar, Parcial de Física/ });
    await enSemana.waitFor();
    assert.ok(await enSemana.isVisible());
    assert.equal(await pagina.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false, 'la semana no se sale a lo ancho');
    await fin('calendario-semana-google');
    await pagina.evaluate((antes) => (antes === null ? localStorage.removeItem('cl.ajustes') : localStorage.setItem('cl.ajustes', antes)), ajustes);
    // Clean up, so the rest sees the calendar as before.
    await ir(`calendario?dia=${clave}`);
    await pagina.locator('.cal__detalle').getByRole('button', { name: /Parcial de Física/ }).click();
    await pagina.getByRole('form', { name: 'Cambiar tu fecha' }).getByRole('button', { name: 'Borrar' }).click();
    await pagina.getByRole('dialog').getByRole('button', { name: 'Borrar' }).click();
    await pagina.getByText('Fecha borrada.').waitFor();
  });

  await prueba('un área de texto del campus se ve con su texto y sus enlaces', async () => {
    await ir('materias/2');
    const fila_ = fila('Materiales de la cátedra');
    await fila_.getByText('Texto con 2 enlaces').waitFor();
    await boton('Enlaces').click();
    await fila_.waitFor();
    await fila_.click();
    const hoja = pagina.getByRole('dialog');
    await hoja.getByText('Todo el material está en Drive.').waitFor();
    assert.equal(await hoja.getByText('robar').count(), 0);
    // The text keeps its shape (a paragraph each, the links in their sentence) and each link also goes as a card
    // with the drawing and color of its service.
    assert.equal(await hoja.locator('.texto-propio p').count(), 2);
    await hoja.locator('.texto-propio a', { hasText: 'Carpeta de la unidad' }).waitFor();
    const enlace = hoja.locator('.previa__enlace', { hasText: 'Carpeta de la unidad' });
    assert.equal(await enlace.getAttribute('href'), 'https://drive.google.com/drive/folders/x');
    await enlace.getByText('Va a drive.google.com').waitFor();
    assert.equal(await enlace.locator('.simbolo').getAttribute('data-simbolo'), 'carpeta');
    const zoom = hoja.locator('.previa__enlace', { hasText: 'clase por Zoom' });
    assert.equal(await zoom.locator('.simbolo').getAttribute('data-simbolo'), 'videollamada');
    const axe = AXE;
    await pagina.evaluate(axe);
    const fallas = await pagina.evaluate(async () => { await Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))); return (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })).violations.map((v) => `${v.id}: ${v.nodes[0].target}`); });
    assert.deepEqual(fallas, [], 'la vista previa del texto');
    await fin('materia-texto');
    await hoja.getByRole('button', { name: 'Cerrar' }).click();
  });

  await prueba('una materia tuya: se arma desde la original, se edita, se comparte y otro alumno la abre', async () => {
    const axe = AXE;
    // Waits for the entrances: halfway through a fade the contrast is lower than it ends up.
    const fallasAxe = async () => {
      await pagina.evaluate(axe);
      return pagina.evaluate(async () => (await Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))), await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })).violations.map((v) => `${v.id}: ${v.nodes[0].target}`));
    };
    const seSale = () => pagina.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    const entrar = async (usuario, saludo) => {
      await pagina.getByLabel('Usuario').fill(usuario);
      await pagina.getByLabel('Contraseña').fill(CONTRASENA);
      await boton('Entrar').click();
      if (saludo) await pagina.getByRole('heading', { name: saludo }).waitFor();
    };

    // From the course of the campus, with its sections and what the student sees in them.
    await ir('materias/1');
    await pagina.getByRole('link', { name: 'Armar tu versión' }).click();
    await pagina.getByRole('heading', { name: 'Crear una materia' }).waitFor();
    await pagina.getByLabel('A partir de').locator('option', { hasText: 'Materia A' }).waitFor({ state: 'attached' });
    const nombre = pagina.getByLabel('Nombre', { exact: true });
    assert.equal(await nombre.inputValue(), 'Materia A resumida', 'el nombre sigue a la original hasta que se escribe');
    await nombre.fill('');
    await boton('Crear').click();
    await pagina.getByText('Ponele un nombre.').waitFor();
    await nombre.fill('Algoritmos Resumida');
    assert.deepEqual(await fallasAxe(), [], 'crear');
    await boton('Crear').click();
    await pagina.getByRole('heading', { name: 'Editar materia' }).waitFor();
    const categoria = (n) => pagina.locator('.editor__categoria').nth(n);
    assert.equal(await categoria(0).getByLabel('Categoría').inputValue(), 'Unidad 1');
    await categoria(0).locator('.fila__nombre', { hasText: 'Apunte uno' }).waitFor();
    await categoria(0).locator('.fila__nombre', { hasText: 'Texto de la clase 3' }).waitFor();
    assert.equal(await pagina.locator('.editor__categoria').count(), 1, 'la sección oculta no viene');
    await boton('Opciones de Planilla').click();
    await boton('Sacar').click();
    await categoria(0).locator('.fila__nombre', { hasText: 'Planilla' }).waitFor({ state: 'detached' });

    // A category of its own with a text, a link to El Santo Resumen, a file and something of another course.
    await boton('Sumar una categoría').click();
    const nueva = categoria(1);
    await pagina.waitForFunction(() => document.activeElement?.value === 'Nueva categoría');
    await pagina.keyboard.type('Resúmenes');
    await nueva.getByRole('button', { name: 'Un texto' }).click();
    await nueva.getByLabel('Texto', { exact: true }).fill('# Unidad 1\n- **Ojo** con el parcial\n<img src=x onerror=alert(1)>');
    await nueva.locator('.editor__muestra h3', { hasText: 'Unidad 1' }).waitFor();
    await nueva.locator('.editor__muestra strong', { hasText: 'Ojo' }).waitFor();
    assert.equal(await nueva.locator('.editor__muestra img').count(), 0, 'el HTML queda como texto');
    await nueva.getByRole('button', { name: 'Guardar texto' }).click();
    await pagina.waitForFunction(() => document.activeElement?.textContent === 'Un texto', null, { timeout: 3000 });
    await nueva.getByRole('button', { name: 'Un enlace' }).click();
    await nueva.getByLabel('Dirección').fill('javascript:alert(1)');
    await nueva.getByRole('button', { name: 'Guardar enlace' }).click();
    await nueva.getByRole('alert').getByText('Pegá una dirección que empiece con https://').waitFor();
    assert.equal(await pagina.evaluate(() => document.activeElement?.type), 'url', 'el foco va al campo con el error');
    await nueva.getByLabel('Dirección').fill('https://lutastudios.com/utn/sistemas/algoritmos');
    await nueva.getByText('Es un apunte de El Santo Resumen.').waitFor();
    await nueva.getByLabel('Cómo se llama').fill('Consejos para el final');
    await nueva.getByRole('button', { name: 'Guardar enlace' }).click();
    await nueva.locator('input[type=file]').setInputFiles({ name: 'esquema.png', mimeType: 'image/png', buffer: PNG });
    await nueva.locator('.fila__nombre', { hasText: 'esquema.png' }).waitFor();
    await nueva.getByRole('button', { name: 'Del campus' }).click();
    const hoja = pagina.getByRole('dialog', { name: 'Sumar del campus' });
    await hoja.getByLabel('Materia').selectOption({ label: 'Materia B' });
    await hoja.getByLabel('Práctica').check();
    assert.deepEqual(await fallasAxe(), [], 'elegir del campus');
    await fin('propia-elegir');
    await hoja.getByRole('button', { name: 'Sumar una cosa' }).click();
    await hoja.waitFor({ state: 'detached' });
    await nueva.locator('.fila__nombre', { hasText: 'Práctica' }).waitFor();
    // Closing the sheet leaves the page scrolled wherever its button was: a row half under the fixed header would count
    // as covered, depending on the height of what is above. Measured from the top, always the same.
    await pagina.evaluate(() => window.scrollTo(0, 0));
    assert.deepEqual(await fallasAxe(), [], 'el editor');
    await fin('propia-editor');
    const guardado = await pagina.evaluate(() => Object.values(localStorage).join(''));
    assert.ok(!guardado.includes('Apunte uno') && !guardado.includes('Práctica') && !guardado.includes('Materia A'), 'nada del campus en disco');

    // The view: own things, campus things with the reader's names, and the same preview sheet.
    await pagina.getByRole('link', { name: 'Listo' }).click();
    await pagina.getByRole('heading', { name: 'Algoritmos Resumida', level: 1 }).waitFor();
    await pagina.getByText('Tuya, a partir de').waitFor();
    await pagina.locator('.texto-propio h3', { hasText: 'Unidad 1' }).waitFor();
    await fila('Consejos para el final').getByText('El Santo Resumen, Enlace a lutastudios.com').waitFor();
    await fila('Práctica').getByText(/^Materia B/).waitFor();
    await fila('esquema').click();
    await pagina.getByRole('dialog').getByRole('img', { name: /^Vista previa de esquema/ }).waitFor();
    await pagina.keyboard.press('Escape');
    await fila('Apunte uno').click();
    await pagina.getByRole('dialog').getByRole('button', { name: /^(Marcar como visto|Visto)$/ }).waitFor();
    await pagina.keyboard.press('Escape');
    // The index of its categories, as in a campus course: folded on top at this width, it takes to one and closes.
    const indiceTuya = pagina.locator('details.indice-plegable');
    await indiceTuya.locator('summary').click();
    const categorias = await pagina.locator('.materia__contenido > section.bloque[data-tuya] h2[id]').allTextContents();
    assert.ok(categorias.length > 1);
    assert.deepEqual(await indiceTuya.locator('.indice__texto').allTextContents(), categorias);
    await indiceTuya.locator('.indice__enlace').last().click();
    await pagina.waitForFunction((t) => document.activeElement?.tagName === 'H2' && document.activeElement.textContent === t, categorias.at(-1), { timeout: 5000 });
    assert.equal(await indiceTuya.evaluate((d) => d.open), false);
    await pagina.evaluate(() => window.scrollTo(0, 0));
    assert.deepEqual(await fallasAxe(), [], 'la materia tuya');
    await fin('propia');
    await pagina.setViewportSize({ width: 390, height: 860 });
    assert.equal(await seSale(), false, 'la materia tuya en 390');
    await fin('celular-propia');
    await pagina.getByRole('link', { name: 'Editar' }).click();
    await pagina.getByRole('heading', { name: 'Editar materia' }).waitFor();
    assert.equal(await seSale(), false, 'el editor en 390');
    await fin('celular-propia-editor');
    await pagina.setViewportSize({ width: 1280, height: 860 });

    // With files it goes as a ZIP, and the campus goes in it only by number.
    await ir('materias');
    await pagina.getByRole('heading', { name: 'Tuyas' }).waitFor();
    await pagina.getByRole('link', { name: /Algoritmos Resumida/ }).click();
    await pagina.getByText('Compartir esta materia').click();
    assert.equal(await boton('Copiar link').count(), 0, 'con archivos no va por link');
    const [bajada] = await Promise.all([pagina.waitForEvent('download'), boton('Bajar archivo').click()]);
    assert.equal(bajada.suggestedFilename(), 'materia-algoritmos-resumida.zip');
    const rutaZip = await bajada.path();
    const enZip = unzipSync(new Uint8Array(fs.readFileSync(rutaZip)));
    assert.deepEqual(Object.keys(enZip).map((n) => n.replace(/[0-9a-z]{20}-/, '')), ['super-cvg-materia.json', 'archivos/esquema.png']);
    const manifiesto = strFromU8(enZip['super-cvg-materia.json']);
    assert.ok(!manifiesto.includes('Apunte uno') && !manifiesto.includes('Práctica'), 'lo del campus no viaja');

    // Another student opens it: their own campus names what it points to.
    await boton('Salir').click();
    usuarioId = 6;
    await entrar('otro', 'Hola, Beto');
    await ir('propias/abrir');
    await pagina.locator('input[type=file]').setInputFiles(rutaZip);
    await pagina.getByRole('heading', { name: 'Algoritmos Resumida' }).waitFor();
    await pagina.getByText(/^Trae 1 archivo \(.+\), 1 texto, 1 enlace y \d+ cosas del campus\.$/).waitFor();
    assert.deepEqual(await fallasAxe(), [], 'abrir una materia');
    await fin('propia-abrir');
    await boton('Guardar en mis materias').click();
    await pagina.getByRole('heading', { name: 'Algoritmos Resumida', level: 1 }).waitFor();
    await fila('Lectura').waitFor();
    assert.equal(await fila('Texto de la clase 3').count(), 0, 'los nombres de otro no viajan');
    await fila('esquema').click();
    await pagina.getByRole('dialog').getByRole('img', { name: /^Vista previa de esquema/ }).waitFor();
    await pagina.keyboard.press('Escape');

    // Without files it also goes by link, and the link survives signing in.
    await ir('propias/nueva');
    await pagina.getByLabel('Nombre', { exact: true }).fill('Consejos de Beto');
    await boton('Crear').click();
    await pagina.getByRole('heading', { name: 'Editar materia' }).waitFor();
    await boton('Un texto').click();
    await pagina.getByLabel('Texto', { exact: true }).fill('Estudiá con los parciales viejos.');
    await boton('Guardar texto').click();
    await pagina.getByRole('link', { name: 'Listo' }).click();
    await pagina.getByText('Compartir esta materia').click();
    await boton('Copiar link').click();
    const link = await pagina.evaluate(() => navigator.clipboard.readText());
    assert.ok(link.includes('/propias/abrir#materia='));
    await boton('Salir').click();
    usuarioId = 5;
    await pagina.goto(link);
    await entrar('alumno');
    await boton('Guardar en mis materias').waitFor();
    assert.ok(!pagina.url().includes('materia='), 'la materia sale de la barra');
    await boton('Guardar en mis materias').click();
    await pagina.getByText('Estudiá con los parciales viejos.').waitFor();

    // Deleting asks first.
    await pagina.getByRole('link', { name: 'Editar' }).click();
    await boton('Borrar materia').click();
    await pagina.getByRole('dialog').getByRole('button', { name: 'Borrar materia' }).click();
    await pagina.getByRole('heading', { name: 'Tuyas' }).waitFor();
    assert.equal(await pagina.getByRole('link', { name: /Consejos de Beto/ }).count(), 0);

    // What Beto left stays out of the next flows, files included.
    await pagina.evaluate(() => new Promise((ok, mal) => {
      localStorage.removeItem('cl.mio.6');
      const pedido = indexedDB.open('super-cvg');
      pedido.onerror = () => mal(pedido.error);
      pedido.onsuccess = () => {
        const tx = pedido.result.transaction('archivos', 'readwrite');
        tx.objectStore('archivos').delete(IDBKeyRange.bound('6:', '6:￿'));
        tx.oncomplete = () => {
          pedido.result.close();
          ok();
        };
      };
    }));
  });

  await prueba('Notas ya no está: su dirección de antes lleva a Tu carrera, y nada pide las notas del campus', async () => {
    const antes = pedidos.length;
    await ir('notas');
    await pagina.waitForURL(/\/carrera$/);
    await pagina.getByRole('heading', { name: 'Tu carrera', level: 1 }).waitFor();
    assert.equal(pedidos.slice(antes).filter((p) => p.cuerpo.includes('gradereport')).length, 0);
  });

  await prueba('Tu horario: una materia sin horarios se carga a mano con su error y su aula, se cambia, vuelve a la facultad, y no la curso', async () => {
    await ir('horario');
    await pagina.getByRole('heading', { name: 'Tu horario', level: 1 }).waitFor();
    // The materias of the test aren't in the schedules of the faculty: their classes are loaded by hand.
    const filaA = pagina.locator('.horario__mat', { hasText: 'Materia A' });
    await filaA.getByText('No está en los horarios de la facultad.').waitFor();
    await pagina.getByRole('heading', { name: 'Tu semana está vacía' }).waitFor();

    await boton('Cargar a mano los horarios de Materia A').click();
    const form = pagina.getByRole('form', { name: 'Horarios de Materia A' });
    const primera = form.locator('fieldset').nth(0);
    await pagina.waitForFunction(() => Boolean(document.activeElement?.closest('.horario__editor')));
    await primera.getByLabel('Día').selectOption({ label: 'Martes' });
    await primera.getByLabel('Empieza').fill('10:00');
    await primera.getByLabel('Termina').fill('09:00');
    await form.getByRole('button', { name: 'Guardar' }).click();
    // The error goes beside the field, which gets the focus.
    await form.getByText('Tiene que terminar después de empezar.').waitFor();
    await pagina.waitForFunction(() => document.activeElement?.type === 'time' && document.activeElement.getAttribute('aria-invalid') === 'true');
    await primera.getByLabel('Termina').fill('11:30');
    await primera.getByLabel('Aula', { exact: true }).fill('Lab 3');
    await form.getByRole('button', { name: 'Sumar una clase' }).click();
    const segunda = form.locator('fieldset').nth(1);
    await pagina.waitForFunction(() => document.activeElement?.closest('fieldset')?.querySelector('legend')?.textContent === 'Clase 2');
    await segunda.getByLabel('Día').selectOption({ label: 'Jueves' });
    await segunda.getByLabel('Empieza').fill('18:00');
    await segunda.getByLabel('Termina').fill('19:00');
    await form.getByRole('button', { name: 'Guardar' }).click();
    await pagina.getByText('Horarios de Materia A guardados.').waitFor();
    await form.waitFor({ state: 'detached' });
    const clases = pagina.locator('.horario__clase', { hasText: 'Materia A' });
    await clases.filter({ hasText: '10:00 a 11:30' }).getByText('Lab 3').waitFor();
    await clases.filter({ hasText: '18:00 a 19:00' }).waitFor();
    await filaA.getByText('Horarios cambiados a mano.').waitFor();
    await fin('horario');

    // It stays after a reload. One class out, and back to the faculty's schedule (none for this one).
    await pagina.reload();
    await clases.filter({ hasText: '10:00 a 11:30' }).waitFor();
    assert.equal(await clases.count(), 2);
    await boton('Cambiar los horarios de Materia A').click();
    await form.getByRole('button', { name: 'Quitar la clase 2' }).click();
    assert.equal(await form.locator('fieldset').count(), 1);
    await form.getByRole('button', { name: 'Guardar' }).click();
    await form.waitFor({ state: 'detached' });
    await clases.filter({ hasText: '18:00 a 19:00' }).waitFor({ state: 'detached' });
    assert.equal(await clases.count(), 1);
    await boton('Cambiar los horarios de Materia A').click();
    await form.getByRole('button', { name: 'Volver al horario de la facultad' }).click();
    await pagina.getByRole('dialog').getByText('¿Volver al horario de la facultad?').waitFor();
    await pagina.getByRole('dialog').getByRole('button', { name: 'Volver', exact: true }).click();
    await pagina.getByText('Materia A volvió al horario de la facultad.').waitFor();
    await pagina.getByRole('heading', { name: 'Tu semana está vacía' }).waitFor();
    assert.equal(await clases.count(), 0);

    // Not taken: out of the week, and back.
    await boton('No la curso, Materia A').click();
    await filaA.getByText('No la cursás.').waitFor();
    await pagina.reload();
    await filaA.getByText('No la cursás.').waitFor();
    await boton('La curso, Materia A').click();
    await filaA.getByText('No está en los horarios de la facultad.').waitFor();
  });

  await prueba('Tu horario: las materias de todas las carreras se suman de los horarios, con sus comisiones por carrera', async () => {
    const fallasAxe = async () => {
      await pagina.evaluate(AXE);
      return pagina.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })).violations.map((v) => `${v.id}: ${v.nodes[0].target}`));
    };
    await ir('horario');
    await boton('Sumar una materia de los horarios').click();
    const form = pagina.getByRole('form', { name: 'Sumar una materia de los horarios' });
    // A basic subject is in every career: its commissions come by career.
    await form.getByLabel('Materia').selectOption({ label: 'Física I' });
    const comision = form.getByLabel('Comisión');
    assert.deepEqual(await comision.locator('optgroup').evaluateAll((gs) => gs.map((g) => g.label)), ['Civil', 'Eléctrica', 'Mecánica', 'Química', 'Sistemas']);
    // One of a single career: its commissions alone.
    await form.getByLabel('Buscar').fill('química orgánica');
    await form.getByLabel('Materia').selectOption({ label: 'Química Orgánica' });
    assert.equal(await comision.locator('optgroup').count(), 0);
    const codigos = await comision.locator('option').evaluateAll((os) => os.map((o) => o.value).filter(Boolean));
    assert.ok(codigos.length && codigos.every((c) => /^\dE?V\d{2}$/.test(c)), codigos.join());
    await comision.selectOption(codigos[0]);
    assert.deepEqual(await fallasAxe(), [], 'sumar una materia de otra carrera');
    await form.getByRole('button', { name: 'Sumar', exact: true }).click();
    await pagina.getByText('Química Orgánica quedó en tus materias.').waitFor();
    const fila = pagina.locator('.horario__mat', { hasText: 'Química Orgánica' });
    assert.equal(await fila.getByLabel('Comisión de Química Orgánica').inputValue(), codigos[0]);
    // Where each career's schedules come from.
    await pagina.locator('.horario__otros summary').click();
    assert.equal(await pagina.locator('.horario__otros a').count(), 5);
    await fin('horario-carreras');

    await boton('Quitar Química Orgánica').click();
    await pagina.getByRole('dialog').getByRole('button', { name: 'Quitar', exact: true }).click();
    await fila.waitFor({ state: 'detached' });
  });

  await prueba('calendario académico: se apaga y queda apagado, y los atajos de teclado', async () => {
    await ir('calendario');
    const capa = pagina.getByLabel('Calendario académico');
    await capa.waitFor();
    assert.equal(await capa.isChecked(), true);
    await capa.uncheck();
    await pagina.reload();
    assert.equal(await pagina.getByLabel('Calendario académico').isChecked(), false);
    await pagina.getByLabel('Calendario académico').check();

    // Alt and the screen's number in the menu: Tu horario is the sixth. In the calendar too, where «T» alone is today.
    await pagina.evaluate(() => document.activeElement?.blur());
    await pagina.keyboard.press('Alt+Digit6');
    await pagina.waitForURL(/\/horario$/);
    await pagina.keyboard.press('Shift+?');
    await pagina.waitForURL(/\/configuracion#atajos$/);
    await pagina.waitForFunction(() => document.activeElement?.id === 'atajos');
    await fin('configuracion-atajos');

    // Off: one key does nothing. Alt+K and Alt with a number still work.
    await pagina.getByRole('switch', { name: 'Atajos de una tecla' }).uncheck();
    await pagina.evaluate(() => document.activeElement?.blur());
    await pagina.keyboard.press('/');
    assert.match(pagina.url(), /\/configuracion#atajos$/);
    await pagina.keyboard.press('Alt+k');
    await pagina.getByRole('dialog').waitFor();
    await pagina.keyboard.press('Escape');
    await pagina.getByRole('dialog').waitFor({ state: 'hidden' });
    await pagina.keyboard.press('Alt+Digit3');
    await pagina.waitForURL(/\/calendario$/);
    await pagina.keyboard.press('Alt+Digit9');
    await pagina.waitForURL(/\/configuracion$/);
    await pagina.getByRole('tab', { name: 'Teclado' }).click();
    await pagina.getByRole('switch', { name: 'Atajos de una tecla' }).check();
    await pagina.evaluate(() => document.activeElement?.blur());
    await pagina.keyboard.press('/');
    await pagina.waitForURL(/\/buscar$/);
    await pagina.waitForFunction(() => document.activeElement?.matches('.buscar input[type="search"]'));
  });

  await prueba('el menú: estilo, pantallas en «Más» u ocultas que siguen a mano, y las páginas oscuras del PDF', async () => {
    const antes = await pagina.evaluate(() => localStorage.getItem('cl.ajustes'));
    const menu = pagina.getByRole('navigation', { name: 'Principal' });
    const mas = pagina.locator('.cabecera__mas-boton');
    // Alone (FLUJOS_SOLO) it starts from the sign-in.
    await ir('configuracion');
    const usuario = pagina.getByLabel('Usuario');
    const titulo = pagina.getByRole('heading', { name: 'Configuración', level: 1 });
    await Promise.race([usuario.waitFor().catch(() => {}), titulo.waitFor().catch(() => {})]);
    if (await usuario.isVisible()) {
      await usuario.fill('alumno');
      await pagina.getByLabel('Contraseña').fill(CONTRASENA);
      await boton('Entrar').click();
      await pagina.getByRole('heading', { name: 'Hola, Ana' }).waitFor();
      await ir('configuracion');
    }
    await pagina.getByRole('tab', { name: 'Menú', exact: true }).click();
    await pagina.locator('input[name="menu-estilo"][value="pastillas"]').check({ force: true });
    assert.equal(await pagina.locator('.cabecera').getAttribute('data-estilo'), 'pastillas');
    await pagina.locator('input[name="menu-calendario"][value="mas"]').check({ force: true });
    await pagina.locator('input[name="menu-horario"][value="mas"]').check({ force: true });
    await pagina.locator('input[name="menu-carrera"][value="oculta"]').check({ force: true });
    // Configuración is the way back here: it never hides.
    assert.equal(await pagina.locator('input[name="menu-configuracion"][value="oculta"]').count(), 0);
    await pagina.reload();
    assert.equal(await menu.getByRole('link', { name: 'Tu carrera', exact: true }).count(), 0, 'Tu carrera, oculta');
    assert.equal(await menu.getByRole('link', { name: 'Calendario', exact: true }).count(), 0, 'Calendario, dentro de «Más»');

    // «Más»: opens under its button, the arrows go through it, Esc gives the focus back, and going somewhere closes it.
    await mas.click();
    const lista = pagina.locator('.cabecera__panel-mas');
    assert.deepEqual(await lista.getByRole('link').allInnerTexts(), ['Calendario', 'Horario', 'Sysacad', 'Laboratorio', 'Calculadoras', 'Repaso', 'Consultron', 'En vivo']);
    await pagina.evaluate(AXE);
    const fallas = await pagina.evaluate(async () => (await window.axe.run(document.querySelector('.cabecera'), { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })).violations.map((v) => `${v.id}: ${v.nodes[0].target}`));
    assert.deepEqual(fallas, [], 'la cabecera con «Más» abierto');
    await pagina.keyboard.press('Escape');
    await lista.waitFor({ state: 'detached' });
    assert.ok(await mas.evaluate((b) => b === document.activeElement), 'Esc devuelve el foco a «Más»');
    await pagina.keyboard.press('ArrowDown');
    await pagina.waitForFunction(() => document.activeElement?.textContent === 'Calendario');
    await pagina.keyboard.press('ArrowDown');
    await pagina.waitForFunction(() => document.activeElement?.textContent === 'Horario');
    await pagina.keyboard.press('ArrowUp');
    await pagina.keyboard.press('Enter');
    await pagina.waitForURL(/\/calendario$/);
    await lista.waitFor({ state: 'detached' });
    // «Más» marks that the screen on view is inside it.
    await pagina.locator('.cabecera__mas-boton[data-actual]').waitFor();
    assert.equal(await mas.getAttribute('aria-label'), 'Más, estás en Calendario');
    // The screen on view, chosen again: the list goes and the focus comes back to «Más» (going elsewhere, to the page).
    await mas.click();
    await lista.getByRole('link', { name: 'Calendario' }).click();
    await lista.waitFor({ state: 'detached' });
    assert.ok(await mas.evaluate((b) => b === document.activeElement), 'el foco vuelve a «Más»');
    // A touch outside closes it.
    await mas.click();
    await lista.waitFor();
    await pagina.locator('main').click({ position: { x: 5, y: 5 } });
    await lista.waitFor({ state: 'detached' });
    // Opened on one page, gone to another and back: it stays closed.
    await mas.click();
    await lista.getByRole('link', { name: 'Horario' }).click();
    await pagina.waitForURL(/\/horario$/);
    await pagina.goBack();
    await pagina.waitForURL(/\/calendario$/);
    await pagina.locator('.cabecera__mas-boton[data-actual]').waitFor();
    assert.equal(await lista.count(), 0, '«Más» no se vuelve a abrir solo');
    // Hidden, still one Alt and its number away.
    await pagina.evaluate(() => document.activeElement?.blur());
    await pagina.keyboard.press('Alt+Digit7');
    await pagina.waitForURL(/\/carrera$/);

    // Folded, the screens of «Más» go together at the end.
    await pagina.setViewportSize({ width: 390, height: 860 });
    await boton('Menú').click();
    const grupo = pagina.getByRole('group', { name: 'Más' });
    assert.deepEqual(await grupo.getByRole('link').allInnerTexts(), ['Calendario', 'Horario', 'Sysacad', 'Laboratorio', 'Calculadoras', 'Repaso', 'Consultron', 'En vivo']);
    await fin('menu-plegado-con-mas');
    await pagina.setViewportSize({ width: 1280, height: 860 });

    // The PDF reader: the moon or O turn the pages dark for every PDF, and Configuración says so.
    await ir('materias/1');
    await fila('Apunte uno').click();
    const hoja = pagina.getByRole('dialog');
    const paginaPdf = hoja.locator('.lector__pagina:has(.textLayer span)').first();
    await paginaPdf.waitFor();
    const filtro = () => paginaPdf.evaluate((e) => getComputedStyle(e).filter);
    assert.equal(await filtro(), 'none');
    const luna = hoja.getByRole('button', { name: 'Páginas oscuras' });
    await luna.click();
    assert.equal(await luna.getAttribute('aria-pressed'), 'true');
    assert.equal(await pagina.evaluate(() => document.documentElement.dataset.pdf), 'oscuro');
    assert.notEqual(await filtro(), 'none');
    await fin('pdf-oscuro');
    await pagina.keyboard.press('o');
    await pagina.waitForFunction(() => document.documentElement.dataset.pdf === 'claro');
    assert.equal(await filtro(), 'none');
    // The window narrowed and widened with the focus on the moon: it goes to «Más herramientas» and comes back to it,
    // never to the page (a full-page capture does the same for a moment).
    await luna.focus();
    await pagina.setViewportSize({ width: 390, height: 844 });
    await pagina.waitForFunction(() => document.activeElement?.getAttribute('title') === 'Más herramientas');
    await pagina.setViewportSize({ width: 1280, height: 860 });
    await pagina.waitForFunction(() => document.activeElement?.getAttribute('title') === 'Páginas oscuras');
    await pagina.keyboard.press('Escape');
    await hoja.waitFor({ state: 'detached' });
    // «Como el tema»: dark only with the dark theme.
    await ir('configuracion#pdf');
    await pagina.locator('input[name="pdf"][value="tema"]').check({ force: true });
    await pagina.getByRole('tab', { name: 'Cómo se ve' }).click();
    await pagina.locator('input[name="tema"][value="oscuro"]').check({ force: true });
    await ir('materias/1');
    await fila('Apunte uno').click();
    await paginaPdf.waitFor();
    assert.notEqual(await filtro(), 'none');
    assert.equal(await hoja.getByRole('button', { name: 'Páginas oscuras' }).getAttribute('aria-pressed'), 'true');
    await pagina.keyboard.press('Escape');
    await hoja.waitFor({ state: 'detached' });
    // Sepia, also with the dark theme: the moon goes dark and back to sepia, not to claras.
    await ir('configuracion#pdf');
    await pagina.locator('input[name="pdf"][value="sepia"]').check({ force: true });
    await ir('materias/1');
    await fila('Apunte uno').click();
    await paginaPdf.waitFor();
    assert.match(await filtro(), /sepia\(/);
    assert.equal(await luna.getAttribute('aria-pressed'), 'false');
    await luna.click();
    await pagina.waitForFunction(() => document.documentElement.dataset.pdf === 'oscuro');
    assert.match(await filtro(), /^invert\(0\.92\)/);
    await pagina.keyboard.press('o');
    await pagina.waitForFunction(() => document.documentElement.dataset.pdf === 'sepia');
    assert.match(await filtro(), /sepia\(/);
    await fin('pdf-sepia');
    await pagina.keyboard.press('Escape');
    await hoja.waitFor({ state: 'detached' });
    // How white the ink of the dark pages is: the slider shows only where they can apply, and the pages follow it.
    await ir('configuracion#pdf');
    const brillo = pagina.getByRole('slider', { name: 'Letra de las páginas oscuras' });
    assert.equal(await brillo.count(), 0, 'con sepia no hay brillo de las oscuras');
    await pagina.locator('input[name="pdf"][value="oscuro"]').check({ force: true });
    assert.equal(await brillo.getAttribute('aria-valuetext'), 'Casi blanca');
    await brillo.focus();
    await pagina.keyboard.press('Home');
    assert.equal(await brillo.getAttribute('aria-valuetext'), 'Gris suave');
    assert.equal(await pagina.locator('.dibujo-pdf__hoja[data-papel="oscuro"]').first().evaluate((e) => getComputedStyle(e).filter), 'invert(0.8) hue-rotate(180deg)', 'el dibujo sigue al control');
    await ir('materias/1');
    await fila('Apunte uno').click();
    await paginaPdf.waitFor();
    assert.equal(await filtro(), 'invert(0.8) hue-rotate(180deg)');
    await pagina.keyboard.press('Escape');
    await hoja.waitFor({ state: 'detached' });
    // On a phone the bar fits: zoom, full screen, the moon, print and the shortcuts go under «Más herramientas», which
    // Esc closes before the reader, with the focus back on its button.
    await pagina.setViewportSize({ width: 390, height: 844 });
    await fila('Apunte uno').click();
    await paginaPdf.waitFor();
    assert.equal(await hoja.locator('.lector__barra').evaluate((b) => b.scrollWidth <= b.clientWidth), true, 'la barra del lector entra en 390');
    assert.equal(await luna.count(), 0, 'la luna no va en la barra del celular');
    const masHerramientas = hoja.getByRole('button', { name: 'Más herramientas' });
    await masHerramientas.click();
    assert.equal(await masHerramientas.getAttribute('aria-expanded'), 'true');
    const herramientas = hoja.getByRole('group', { name: 'Más herramientas' });
    const lunaEnLaFila = herramientas.getByRole('button', { name: 'Páginas oscuras' });
    await lunaEnLaFila.click();
    await pagina.waitForFunction(() => document.documentElement.dataset.pdf === 'sepia');
    // Choosing a tool closes the row (it would keep a line of the screen), with the focus back on its button.
    await herramientas.waitFor({ state: 'detached' });
    assert.equal(await pagina.evaluate(() => document.activeElement?.getAttribute('title')), 'Más herramientas', 'elegir una herramienta cierra la fila y vuelve a su botón');
    await masHerramientas.click();
    assert.equal(await lunaEnLaFila.getAttribute('aria-pressed'), 'false');
    await fin('lector-390-mas');
    await pagina.keyboard.press('Escape');
    await herramientas.waitFor({ state: 'detached' });
    assert.equal(await pagina.evaluate(() => document.activeElement?.getAttribute('title')), 'Más herramientas');
    assert.equal(await hoja.isVisible(), true, 'Esc cierra la fila, no el lector');
    await pagina.keyboard.press('Escape');
    await hoja.waitFor({ state: 'detached' });
    await pagina.setViewportSize({ width: 1280, height: 860 });
    await pagina.evaluate((a) => (a === null ? localStorage.removeItem('cl.ajustes') : localStorage.setItem('cl.ajustes', a)), antes);
    await ir('');
  });

  await prueba('leer en voz alta: la página o lo seleccionado, pausar, seguir y parar, y solo con una voz del dispositivo', async () => {
    const antes = await pagina.evaluate(() => localStorage.getItem('cl.ajustes'));
    // In a tab of its own, with the simulated voice from before the page loads.
    const tab = await contexto.newPage();
    tab.on('pageerror', (e) => errores.push(e.message));
    tab.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
    await tab.addInitScript(vozSimulada);
    try {
      // A new tab starts from the sign-in (the key lives in each tab), alone or not.
      await tab.goto(`${base}materias/1`);
      const usuario = tab.getByLabel('Usuario');
      const apunte = tab.locator('.fila__principal', { hasText: 'Apunte uno' });
      await Promise.race([usuario.waitFor().catch(() => {}), apunte.waitFor().catch(() => {})]);
      if (await usuario.isVisible()) {
        await usuario.fill('alumno');
        await tab.getByLabel('Contraseña').fill(CONTRASENA);
        await tab.getByRole('button', { name: 'Entrar', exact: true }).click();
        await tab.getByRole('heading', { name: 'Hola, Ana' }).waitFor();
        await tab.goto(`${base}materias/1`);
      }
      await apunte.click();
      const hoja = tab.getByRole('dialog');
      await hoja.locator('.lector__pagina[data-pagina="2"] .textLayer span').first().waitFor();
      // From page 1, wherever another test left it.
      const irA = hoja.getByRole('textbox', { name: 'Página, de 2' });
      await irA.fill('1');
      await irA.press('Enter');
      await tab.waitForFunction(() => document.querySelector('.lector__ir-campo').value === '1');
      const voz = () => tab.evaluate(() => ({ dichos: window.__voz.dichos.map((d) => d.texto), voces: window.__voz.dichos.map((d) => d.voz), hablando: Boolean(window.__voz.actual) }));
      const terminar = () => tab.evaluate(() => window.__voz.terminar());
      // Saying this piece now, for the n-th time.
      const dice = (texto, veces = 1) => tab.waitForFunction(([t, n]) => window.__voz.actual?.text === t && window.__voz.dichos.filter((d) => d.texto === t).length === n, [texto, veces]);
      const barra = hoja.getByRole('group', { name: 'Lectura en voz alta' });
      const boton = hoja.getByRole('button', { name: 'Leer en voz alta' });
      // The text of a page as its text layer has it, every run of spaces as one.
      const textoDe = (n) => tab.evaluate((p) => [...document.querySelectorAll(`.lector__pagina[data-pagina="${p}"] .textLayer span`)].map((s) => s.textContent).join(' ').replace(/\s+/g, ' ').trim(), n);

      // From the page in view, piece by piece, with the device's voice: Mónica, never the remote ones.
      await boton.click();
      await dice('Semáforos');
      await barra.getByText('Leyendo la página 1 de 2').waitFor();
      assert.equal(await boton.getAttribute('aria-pressed'), 'true');
      await terminar();
      await dice('Un semáforo cuida la sección crítica.');
      assert.equal((await voz()).dichos.join(' '), await textoDe(1), 'lee el texto de la página');

      // Pause stops the voice and keeps the place; L goes on with that same piece.
      await barra.getByRole('button', { name: 'Pausar' }).click();
      await barra.getByText('Pausaste en la página 1 de 2').waitFor();
      let ahora = await voz();
      assert.equal(ahora.hablando, false, 'en pausa no habla');
      assert.equal(ahora.dichos.length, 2);
      await tab.keyboard.press('l');
      await dice('Un semáforo cuida la sección crítica.', 2);
      await barra.getByText('Leyendo la página 1 de 2').waitFor();

      // On to the next page, and the view goes with it.
      await terminar();
      await dice('Monitores');
      await barra.getByText('Leyendo la página 2 de 2').waitFor();
      await tab.waitForFunction(() => document.querySelector('.lector__ir-campo').value === '2');
      await terminar();
      await dice('Un monitor junta los datos con sus semáforos.');

      // The speed: the piece being said starts again with it, and it stays for next time.
      await barra.getByRole('button', { name: 'Velocidad 1×' }).click();
      await barra.getByRole('button', { name: 'Velocidad 1,25×' }).waitFor();
      await dice('Un monitor junta los datos con sus semáforos.', 2);
      assert.equal(await tab.evaluate(() => window.__voz.dichos.at(-1).velocidad), 1.25);
      assert.equal(await tab.evaluate(() => JSON.parse(localStorage.getItem('cl.ajustes')).velocidadVoz), 1.25);

      // Stop: the bar goes, nothing is said, and the focus goes back to the pages.
      await barra.getByRole('button', { name: 'Parar' }).click();
      await barra.waitFor({ state: 'detached' });
      assert.equal((await voz()).hablando, false, 'parado no habla');
      assert.ok(await tab.evaluate(() => document.activeElement?.classList.contains('lector__marco')), 'el foco vuelve a las páginas');

      // What is selected, and only that: it ends there.
      const elegido = await tab.evaluate(() => {
        const span = [...document.querySelectorAll('.lector__pagina[data-pagina="2"] .textLayer span')].find((s) => s.textContent.includes('junta los datos'));
        const t = span.firstChild;
        const r = document.createRange();
        r.setStart(t, t.data.indexOf('Un monitor'));
        r.setEnd(t, t.data.indexOf('junta los datos') + 'junta los datos'.length);
        getSelection().removeAllRanges();
        getSelection().addRange(r);
        document.querySelector('.lector__marco').focus({ preventScroll: true });
        return getSelection().toString();
      });
      assert.equal(elegido, 'Un monitor junta los datos');
      await tab.keyboard.press('l');
      await dice('Un monitor junta los datos');
      await barra.getByText('Leyendo lo que seleccionaste').waitFor();
      await terminar();
      await barra.waitFor({ state: 'detached' });
      assert.equal((await voz()).hablando, false, 'después de lo seleccionado no sigue');
      await tab.evaluate(() => getSelection().removeAllRanges());

      // Esc stops it first, and the sheet stays.
      await tab.keyboard.press('l');
      await barra.waitFor();
      await tab.keyboard.press('Escape');
      await barra.waitFor({ state: 'detached' });
      assert.equal(await hoja.count(), 1, 'Esc para la lectura y no cierra la hoja');

      // Never a remote voice, and nothing of the text on disk.
      ahora = await voz();
      assert.ok(ahora.voces.length >= 7);
      assert.deepEqual([...new Set(ahora.voces)], ['Mónica'], 'solo la voz del dispositivo');
      const disco = await tab.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
      assert.ok(!disco.includes('junta los datos') && !disco.includes('cuida la sección'), 'el texto leído no se guarda');

      // Without a local voice in Spanish, the button says so and reads nothing.
      const dichos = ahora.dichos.length;
      await tab.evaluate(() => {
        window.__voz.voces = window.__voz.voces.filter((v) => v.name !== 'Mónica');
      });
      await boton.click();
      await hoja.getByRole('status').getByText('Tu dispositivo no tiene una voz en castellano para leer.', { exact: false }).waitFor();
      assert.equal((await voz()).dichos.length, dichos, 'sin voz local no lee nada');
      assert.equal(await barra.count(), 0);
      await hoja.getByRole('button', { name: 'Entendido' }).click();

      // Closing the reader while it reads quiets it.
      await tab.evaluate(() => {
        window.__voz.voces.push({ name: 'Mónica', lang: 'es-ES', localService: true, default: false });
      });
      await tab.keyboard.press('l');
      await barra.waitFor();
      await tab.getByRole('button', { name: 'Cerrar', exact: true }).click();
      // Gone from the page, not only hidden: the reader is no more.
      await tab.locator('dialog').waitFor({ state: 'detached' });
      assert.equal((await voz()).hablando, false, 'cerrar el lector lo calla');
    } finally {
      await tab.close();
      await pagina.evaluate((a) => (a === null ? localStorage.removeItem('cl.ajustes') : localStorage.setItem('cl.ajustes', a)), antes);
    }
  });

  await prueba('accesibilidad y ancho en las pantallas privadas', async () => {
    const axe = AXE;
    for (const ancho of [390, 1280]) {
      await pagina.setViewportSize({ width: ancho, height: 860 });
      for (const ruta of ['', 'calendario', 'horario', 'materias', 'materias/1', 'buscar', 'carrera', 'propias/nueva', 'propias/abrir', 'configuracion', 'laboratorio', 'consultron']) {
        await ir(ruta);
        await pagina.waitForLoadState('networkidle');
        await pagina.locator('.cargando').first().waitFor({ state: 'detached' }).catch(() => {});
        if (ruta === 'buscar') await pagina.getByLabel('Qué buscás').fill('apunte');
        await pagina.evaluate(axe);
        const fallas = await pagina.evaluate(async () => { await Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))); return (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })).violations.map((v) => `${v.id}: ${v.nodes[0].target}`); });
        assert.deepEqual(fallas, [], `/${ruta} en ${ancho}`);
        const sale = await pagina.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
        assert.equal(sale, false, `/${ruta} en ${ancho} se sale a lo ancho`);
        if (ancho === 390) await fin(`celular-${ruta.replace('/', '-') || 'hoy'}`);
      }
    }
    await pagina.setViewportSize({ width: 1280, height: 860 });
  });

  await prueba('calculadoras: las 31, por materia, con el pizarrón y la hoja, sin salirse a lo ancho y accesibles', async () => {
    const antes = errores.length;
    const { CATALOGO } = await import('../src/lib/calculadoras/catalogo.js');
    const fallasAxe = async () => {
      await pagina.evaluate(AXE);
      return pagina.evaluate(async () => { await Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))); return (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })).violations.map((v) => `${v.id}: ${v.nodes[0].target}`); });
    };
    const seSale = () => pagina.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    // Alone (FLUJOS_SOLO) it starts from the sign-in.
    await pagina.setViewportSize({ width: 1280, height: 860 });
    await ir('');
    const usuario = pagina.getByLabel('Usuario');
    const hola = pagina.getByRole('heading', { name: 'Hola, Ana' });
    await Promise.race([usuario.waitFor().catch(() => {}), hola.waitFor().catch(() => {})]);
    if (await usuario.isVisible()) {
      await usuario.fill('alumno');
      await pagina.getByLabel('Contraseña').fill(CONTRASENA);
      await boton('Entrar').click();
    }
    await hola.waitFor();

    const revisar = async (slug, foto = true) => {
      for (const ancho of [1280, 390]) {
        await pagina.setViewportSize({ width: ancho, height: 860 });
        assert.deepEqual(await fallasAxe(), [], `/calculadoras/${slug} en ${ancho}`);
        assert.equal(await seSale(), false, `/calculadoras/${slug} en ${ancho} se sale a lo ancho`);
        if (ancho === 390 && foto) await fin(`calc-${slug}`);
      }
      await pagina.setViewportSize({ width: 1280, height: 860 });
    };

    // They start inside «Más», next to the laboratory, and the header still fits in 1280 without folding.
    assert.equal(await pagina.locator('.cabecera').getAttribute('data-compacta'), null, 'la cabecera entra en 1280');
    await pagina.getByRole('button', { name: /^Más/ }).click();
    await pagina.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Calculadoras' }).click();
    await pagina.getByRole('heading', { name: 'Calculadoras', level: 1 }).waitFor();
    assert.equal(new URL(pagina.url()).pathname, '/calculadoras');
    assert.equal(await pagina.locator('meta[name="robots"]').getAttribute('content'), 'noindex');
    // One card per calculator, under its own subject only, each with the picture of its theme only.
    const lista = pagina.locator('.calcs__enlace');
    assert.equal(await lista.count(), CATALOGO.length);
    const materias = await pagina.getByRole('heading', { level: 2 }).allTextContents();
    assert.ok(materias.includes('Simulación'));
    assert.ok(!materias.includes('Inteligencia Artificial'), 'la tabla de verdad va una sola vez, en Lógica');
    const fotoVisible = (tema) => pagina.locator(`.calcs__foto-${tema}`).first().isVisible();
    assert.equal(await fotoVisible('claro'), true);
    assert.equal(await fotoVisible('oscuro'), false);
    await revisar('lista');

    // Every one opens with its example: the exercise on the board and its resolution on the sheet.
    for (const { slug, nombre } of CATALOGO) {
      await ir(`calculadoras/${slug}`);
      await pagina.getByRole('heading', { name: nombre, level: 1 }).waitFor();
      await pagina.locator('.calc__ejercicio').waitFor();
      await pagina.locator('.calc-hoja').first().waitFor();
      assert.equal(await pagina.getByRole('alert').count(), 0, `${slug} abre sin error`);
      await revisar(slug);
    }

    // Matrices: a wrong number says where, and what was typed stays when coming back, never in the address.
    await ir('calculadoras/matriz');
    const celda = pagina.getByLabel('Fila 2, columna 2');
    await celda.fill('x');
    await pagina.getByRole('alert').getByText('En la fila 2, columna 2', { exact: false }).waitFor();
    assert.equal(await celda.getAttribute('aria-invalid'), 'true');
    await revisar('matriz-error', false);
    await celda.fill('7');
    await pagina.getByRole('link', { name: 'Calculadoras' }).first().click();
    await pagina.getByRole('heading', { name: 'Calculadoras', level: 1 }).waitFor();
    await pagina.goBack();
    await celda.waitFor();
    assert.equal(await celda.inputValue(), '7', 'lo escrito sigue al volver');
    assert.equal(new URL(pagina.url()).search, '');

    assert.deepEqual(errores.slice(antes), [], 'sin errores en la consola');
  });

  await prueba('una clave vencida vuelve a la pantalla de entrada', async () => {
    sesionVencida = true;
    await ir('materias');
    await pagina.getByRole('heading', { name: /Todo lo que tenés que entregar/ }).waitFor();
    sesionVencida = false;
    assert.equal(await pagina.evaluate(() => sessionStorage.getItem('cl.sesion')), null);
  });

  await prueba('seguir conectado sobrevive a otra pestaña, y Salir borra todo salvo lo oculto', async () => {
    await pagina.getByLabel('Usuario').fill('alumno');
    await pagina.getByLabel('Contraseña').fill(CONTRASENA);
    await pagina.getByLabel('Seguir conectado en este dispositivo').check();
    await boton('Entrar').click();
    await pagina.getByRole('heading', { name: 'Hola, Ana' }).waitFor();
    const otra = await contexto.newPage();
    await otra.goto(base);
    await otra.getByRole('heading', { name: 'Hola, Ana' }).waitFor();
    await boton('Salir').click();
    await pagina.getByRole('heading', { name: /Todo lo que tenés que entregar/ }).waitFor();
    await otra.getByRole('heading', { name: /Todo lo que tenés que entregar/ }).waitFor();
    await otra.close();
    const { s, l } = await pagina.evaluate(() => ({ s: { ...sessionStorage }, l: { ...localStorage } }));
    assert.deepEqual(Object.keys(s), []);
    // The settings of this device (cl.ajustes) stay too: they belong to the device, not to the account.
    assert.deepEqual(Object.keys(l).filter((k) => k !== 'cl.ajustes').sort(), ['cl.mio.5']);
    await ir('materias');
    await pagina.getByRole('heading', { name: /Todo lo que tenés que entregar/ }).waitFor();
  });

  await prueba('dentro de una página ajena no muestra la entrada', async () => {
    const ajena = await contexto.newPage();
    await ajena.setContent(`<iframe src="${base}" title="marco"></iframe>`);
    const marco = ajena.frameLocator('iframe');
    await marco.getByText('Super CVG no se abre dentro de otra página.').waitFor();
    assert.equal(await marco.getByLabel('Contraseña').count(), 0);
    await ajena.close();
  });

  await prueba('ni la materia ni la búsqueda quedan en el historial, y los datos no tocan el disco', async () => {
    await pagina.getByLabel('Usuario').fill('alumno');
    await pagina.getByLabel('Contraseña').fill(CONTRASENA);
    await boton('Entrar').click();
    await pagina.getByRole('heading', { name: 'Hola, Ana' }).waitFor();
    await ir('materias/1');
    await pagina.getByRole('heading', { name: 'Unidad 1' }).waitFor();
    assert.ok(!(await pagina.title()).includes('Materia A'));
    const guardado = await pagina.evaluate(() => JSON.stringify({ ...sessionStorage, ...localStorage }));
    assert.ok(!guardado.includes('Materia A') && !guardado.includes('Apunte uno'));
    await boton('Salir').click();
  });

  await prueba('Ctrl+K busca en todo y abre la vista previa', async () => {
    await pagina.getByLabel('Usuario').fill('alumno');
    await pagina.getByLabel('Contraseña').fill(CONTRASENA);
    await boton('Entrar').click();
    await pagina.getByRole('heading', { name: 'Hola, Ana' }).waitFor();
    await pagina.keyboard.press('Control+k');
    await pagina.getByRole('combobox').fill('planilla');
    await pagina.getByRole('option', { name: /Planilla/ }).waitFor();
    await pagina.keyboard.press('Enter');
    await pagina.getByRole('dialog').getByRole('cell', { name: 'Ana Pérez' }).waitFor();
    await boton('Cerrar').click();
    await pagina.keyboard.press('Control+k');
    await pagina.getByRole('combobox').fill('calendario');
    await pagina.keyboard.press('Enter');
    await pagina.getByRole('heading', { name: 'Calendario', exact: true }).waitFor();
    await pagina.keyboard.press('Alt+k');
    await pagina.locator('.paleta__campo').waitFor();
    await pagina.keyboard.press('Escape');
    await boton('Menú rápido').click();
    await pagina.locator('.paleta__campo').fill('materias');
    await pagina.keyboard.press('Enter');
    await pagina.getByRole('heading', { name: 'Materias', exact: true }).waitFor();
    await pagina.setViewportSize({ width: 390, height: 860 });
    await boton('Menú rápido').click();
    await pagina.locator('.paleta__campo').waitFor();
    await pagina.keyboard.press('Escape');
    await pagina.setViewportSize({ width: 1280, height: 860 });
  });

  await prueba('compartir el orden: un compañero entra por el link, revisa, aplica y deshace', async () => {
    await ir('materias/1');
    await fila('Texto de la clase 3').waitFor();
    await pagina.getByText('Compartir este orden').click();
    await boton('Copiar link').click();
    const link = await pagina.evaluate(() => navigator.clipboard.readText());
    assert.ok(link.includes('compartido#orden='));
    await boton('Salir').click();
    usuarioId = 6;
    await pagina.goto(link);
    await pagina.getByLabel('Usuario').fill('otro');
    await pagina.getByLabel('Contraseña').fill(CONTRASENA);
    await boton('Entrar').click();
    await boton('Aplicar a mi materia').waitFor();
    assert.ok(!pagina.url().includes('orden='), 'el paquete sale de la barra');
    await pagina.getByText('Texto de la clase 3').first().waitFor();
    await boton('Aplicar a mi materia').click();
    await boton('Deshacer').waitFor();
    const puesto = await pagina.evaluate(() => localStorage.getItem('cl.mio.6'));
    assert.ok(puesto.includes('Texto de la clase 3'));
    assert.ok(!puesto.includes('Resolver la guía 4') && !puesto.includes('Preguntar por el TP'), 'las notas y tareas no viajan');
    await boton('Deshacer').click();
    await pagina.getByText('Listo, quedó como estaba').waitFor();
    assert.ok(!(await pagina.evaluate(() => localStorage.getItem('cl.mio.6'))).includes('Texto de la clase 3'));
    await boton('Salir').click();
    usuarioId = 5;
  });

  await prueba('compartir el horario: otro alumno entra por el link, ve las dos semanas y los huecos, copia una comisión y deshace, sin nada del campus', async () => {
    const fallasAxe = async () => {
      await pagina.evaluate(AXE);
      return pagina.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })).violations.map((v) => `${v.id}: ${v.nodes[0].target}`));
    };
    // Alone (FLUJOS_SOLO), or after a test that left, it starts from the sign-in.
    usuarioId = 5;
    await ir('horario');
    const usuario = pagina.getByLabel('Usuario');
    const titulo = pagina.getByRole('heading', { name: 'Tu horario', level: 1 });
    await Promise.race([usuario.waitFor().catch(() => {}), titulo.waitFor().catch(() => {})]);
    if (await usuario.isVisible()) {
      await usuario.fill('alumno');
      await pagina.getByLabel('Contraseña').fill(CONTRASENA);
      await boton('Entrar').click();
      await pagina.getByRole('heading', { name: 'Hola, Ana' }).waitFor();
      await ir('horario');
    }
    await titulo.waitFor();
    const antes = await pagina.evaluate(() => ({ ana: localStorage.getItem('cl.mio.5'), beto: localStorage.getItem('cl.mio.6') }));

    // Two subjects of the faculty's schedules, one with its classroom, and a campus course loaded by hand.
    for (const materia of ['Análisis Matemático I', 'Física I']) {
      await boton('Sumar una materia de los horarios').click();
      const form = pagina.getByRole('form', { name: 'Sumar una materia de los horarios' });
      await form.getByLabel('Materia').selectOption({ label: materia });
      await form.getByLabel('Comisión').selectOption('1K01');
      await form.getByRole('button', { name: 'Sumar', exact: true }).click();
      await form.waitFor({ state: 'detached' });
    }
    await pagina.locator('.horario__clase', { hasText: 'Física I' }).filter({ hasText: '10:30 a 12:05' }).click();
    await pagina.getByLabel('Aula de los martes').fill('Aula 305');
    await boton('Guardar el aula').click();
    await pagina.getByText('Aula guardada.').waitFor();
    await pagina.locator('#horario-detalle').getByRole('button', { name: 'Cerrar' }).click();
    await boton('Cargar a mano los horarios de Materia A').click();
    const editor = pagina.getByRole('form', { name: 'Horarios de Materia A' });
    await editor.getByLabel('Día').selectOption({ label: 'Jueves' });
    await editor.getByLabel('Empieza').fill('18:00');
    await editor.getByLabel('Termina').fill('19:00');
    await editor.getByRole('button', { name: 'Guardar' }).click();
    await editor.waitFor({ state: 'detached' });

    // The campus course stays home, and says so. The link takes the rest.
    await pagina.locator('.horario__compartir summary').click();
    await pagina.getByText('Materia A no va porque no está en los horarios de la facultad.').waitFor();
    await boton('Copiar link').click();
    await pagina.getByText('Link copiado. Pasáselo a tu compañero.').waitFor();
    const link = await pagina.evaluate(() => navigator.clipboard.readText());
    assert.ok(link.includes('/horario/compartido#horario='), link.slice(0, 80));
    const enElLink = JSON.parse(strFromU8(inflateSync(Buffer.from(link.split('#horario=')[1], 'base64url'))));
    assert.deepEqual(enElLink.materias.map((m) => m.materia).sort(), ['Análisis Matemático I', 'Física I']);
    assert.deepEqual(enElLink.materias.find((m) => m.materia === 'Física I'), { materia: 'Física I', comision: '1K01', aulas: { 2: 'Aula 305' } });
    const texto = JSON.stringify(enElLink);
    for (const delCampus of ['Materia A', 'Materia B', 'Ana', 'alumno', TOKEN, '"id"', '1080']) assert.ok(!texto.includes(delCampus), `el link lleva ${delCampus}`);

    // Another student in the same browser, who takes Física I in the 1K06, opens it before coming in.
    await boton('Salir').click();
    await usuario.waitFor();
    await pagina.evaluate((previo) => {
      const mio = previo ? JSON.parse(previo) : {};
      localStorage.setItem('cl.mio.6', JSON.stringify({ ...mio, horario: { extras: [{ id: 1, materia: 'Física I', comision: '1K06', aulas: {} }], aMano: { cursos: {}, extras: {} } } }));
    }, antes.beto);
    usuarioId = 6;
    await pagina.goto(link);
    await usuario.waitFor();
    assert.ok(!pagina.url().includes('horario='), 'el horario sale de la barra antes de entrar');
    await usuario.fill('otro');
    await pagina.getByLabel('Contraseña').fill(CONTRASENA);
    await boton('Entrar').click();
    await pagina.getByRole('heading', { name: 'Horario compartido', level: 1 }).waitFor();
    assert.ok(!pagina.url().includes('horario='), 'el horario sale de la barra');

    // The two weeks, with the gap both have free on Monday between her Análisis and his Física.
    const semana = pagina.locator('.juntos__semana');
    await semana.locator('.juntos__bloque[data-quien="vos"]', { hasText: 'Física I' }).first().waitFor();
    assert.equal(await semana.locator('.juntos__bloque[data-quien="suya"]', { hasText: 'Análisis Matemático I' }).count(), 2);
    await semana.locator('.juntos__bloque[data-quien="suya"]', { hasText: 'Física I' }).filter({ hasText: 'Aula 305' }).waitFor();
    await semana.locator('.juntos__hueco', { hasText: '09:30 a 10:30' }).waitFor();
    const libres = pagina.locator('.juntos__libres');
    await libres.getByText('Lunes, de 09:30 a 10:30.').waitFor();
    await libres.getByText('Viernes, sin clases los dos.').waitFor();
    assert.equal(await pagina.locator('.juntos').getByText('Materia A').count(), 0, 'lo del campus de ella no llega');
    await boton('Sumar Análisis Matemático I').waitFor();
    assert.deepEqual(await fallasAxe(), [], 'horario compartido en 1280');
    await fin('horario-compartido');

    // Copies her commission, after asking: they take Física I together and Monday's gap is gone. And back.
    const fila = pagina.locator('.juntos__mat', { hasText: 'Física I' });
    await fila.getByText('Tu compañero está en la 1K01. Vos, en la 1K06.').waitFor();
    await boton('Pasarme a la 1K01 en Física I').click();
    const dialogo = pagina.getByRole('dialog');
    await dialogo.getByText('¿Pasarte a la 1K01?').waitFor();
    await dialogo.getByRole('button', { name: 'Pasarme' }).click();
    await fila.getByText('Te pasaste a la 1K01.').waitFor();
    await pagina.waitForFunction(() => document.activeElement?.textContent === 'Deshacer');
    await semana.locator('.juntos__bloque[data-quien="juntos"]', { hasText: 'Física I' }).first().waitFor();
    assert.equal(await libres.getByText('Lunes, de 09:30 a 10:30.').count(), 0);
    assert.ok((await pagina.evaluate(() => localStorage.getItem('cl.mio.6'))).includes('"comision":"1K01"'));
    await boton('Deshacer').click();
    await pagina.getByText('Quedó como estaba.').waitFor();
    await fila.getByText('Tu compañero está en la 1K01. Vos, en la 1K06.').waitFor();
    await libres.getByText('Lunes, de 09:30 a 10:30.').waitFor();
    assert.ok((await pagina.evaluate(() => localStorage.getItem('cl.mio.6'))).includes('"comision":"1K06"'));

    await pagina.setViewportSize({ width: 390, height: 860 });
    await semana.locator('.juntos__hueco', { hasText: '09:30 a 10:30' }).waitFor();
    assert.deepEqual(await fallasAxe(), [], 'horario compartido en 390');
    assert.equal(await pagina.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false, 'se sale a lo ancho en 390');
    await fin('celular-horario-compartido');
    await pagina.setViewportSize({ width: 1280, height: 860 });

    // A broken link says so, and nothing breaks.
    await pagina.goto(`${base}horario/compartido#horario=roto`);
    await pagina.getByText('Este link no es un horario de Super CVG o llegó cortado.', { exact: false }).waitFor();
    assert.ok(!pagina.url().includes('horario='));

    await boton('Salir').click();
    await usuario.waitFor();
    await pagina.evaluate(({ ana, beto }) => {
      for (const [clave, valor] of [['cl.mio.5', ana], ['cl.mio.6', beto]]) {
        if (valor === null) localStorage.removeItem(clave);
        else localStorage.setItem(clave, valor);
      }
    }, antes);
    usuarioId = 5;
  });

  await prueba('configuración: el tema queda guardado y se aplica antes de pintar, sin datos del campus', async () => {
    usuarioId = 5;
    await pagina.getByLabel('Usuario').fill('alumno');
    await pagina.getByLabel('Contraseña').fill(CONTRASENA);
    await boton('Entrar').click();
    await pagina.getByRole('heading', { name: 'Hola, Ana' }).waitFor();
    await ir('configuracion');
    await pagina.locator('input[name="tema"][value="oscuro"]').check({ force: true });
    assert.equal(await pagina.evaluate(() => document.documentElement.dataset.tema), 'oscuro');
    await pagina.reload();
    assert.equal(await pagina.evaluate(() => document.documentElement.dataset.tema), 'oscuro');
    await boton('Salir').click();
    await pagina.getByRole('heading', { name: /Todo lo que tenés que entregar/ }).waitFor();
    assert.equal(await pagina.evaluate(() => document.documentElement.dataset.tema), 'oscuro');
    await pagina.evaluate(() => localStorage.removeItem('cl.ajustes'));
    await pagina.reload();
  });

  await prueba('cada plantilla, con letra enorme y tema oscuro: accesible y sin salirse', async () => {
    await pagina.getByLabel('Usuario').fill('alumno');
    await pagina.getByLabel('Contraseña').fill(CONTRASENA);
    await boton('Entrar').click();
    await pagina.getByRole('heading', { name: 'Hola, Ana' }).waitFor();
    const axe = AXE;
    const plantillas = [
      ['hoy', ['agenda', 'tablero', 'compacta'], ''],
      ['materia', ['secciones', 'tarjetas', 'tabla'], 'materias/1'],
      ['materias', ['tarjetas', 'lista', 'grandes'], 'materias'],
      ['calendario', ['mes', 'semana', 'agenda'], 'calendario'],
    ];
    for (const ancho of [390, 1280]) {
      await pagina.setViewportSize({ width: ancho, height: 860 });
      for (const [pantalla, vistas, ruta] of plantillas) {
        for (const vista of vistas) {
          const ajustes = { tema: 'oscuro', letra: LETRA_ENORME, vistas: { [pantalla]: vista } };
          await pagina.evaluate((a) => localStorage.setItem('cl.ajustes', JSON.stringify(a)), ajustes);
          await ir(ruta);
          await pagina.waitForLoadState('networkidle');
          await pagina.locator('.cargando').first().waitFor({ state: 'detached' }).catch(() => {});
          await pagina.locator(`[data-vista="${vista}"]`).first().waitFor();
          await pagina.evaluate(axe);
          const fallas = await pagina.evaluate(async () => { await Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))); return (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })).violations.map((v) => `${v.id}: ${v.nodes[0].target}`); });
          assert.deepEqual(fallas, [], `${pantalla}/${vista} en ${ancho}`);
          const sale = await pagina.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
          assert.equal(sale, false, `${pantalla}/${vista} en ${ancho} se sale a lo ancho`);
          // Nothing cut, out of its box or on top of something else, with the letter that big.
          const problemas = await buscarEncimados(pagina);
          assert.deepEqual(problemas, [], `${pantalla}/${vista} en ${ancho}: ${problemas.join(' | ')}`);
          const cabecera = await pagina.evaluate(() => { const f = document.querySelector('.cabecera__fila'); return f.scrollWidth <= f.clientWidth + 1; });
          assert.ok(cabecera, `la cabecera no entra en ${ancho}`);
          await fin(`plantilla-${ancho}-${pantalla}-${vista}`);
        }
      }
    }
    await pagina.setViewportSize({ width: 1280, height: 860 });
    await pagina.evaluate(() => localStorage.removeItem('cl.ajustes'));
    await ir('');
    await boton('Salir').click();
  });

  await prueba('otro alumno en el mismo navegador no ve lo del anterior', async () => {
    usuarioId = 6;
    await pagina.getByLabel('Usuario').fill('otro');
    await pagina.getByLabel('Contraseña').fill(CONTRASENA);
    await boton('Entrar').click();
    await pagina.getByRole('heading', { name: 'Hola, Beto' }).waitFor();
    await ir('materias/1');
    await pagina.getByRole('heading', { name: 'Notas 2023' }).waitFor();
    assert.equal(await pagina.getByText('Resolver la guía 4').count(), 0);
    assert.equal(await pagina.locator('.fila__nombre', { hasText: 'Texto de la clase 3' }).count(), 0);
    await boton('Salir').click();
    usuarioId = 5;
  });

  await prueba('una materia con resumen en El Santo Resumen lo enlaza, en otra pestaña y sin pedir nada', async () => {
    const antes = MATERIA_B.fullname;
    MATERIA_B.fullname = 'Sistemas Operativos 3K2';
    try {
      await pagina.getByLabel('Usuario').fill('alumno');
      await pagina.getByLabel('Contraseña').fill(CONTRASENA);
      await boton('Entrar').click();
      await pagina.getByRole('heading', { name: 'Hola, Ana' }).waitFor();
      await ir('materias/2');
      const link = pagina.getByRole('link', { name: /^Resumen de Sistemas Operativos en El Santo Resumen/ });
      await link.waitFor();
      assert.equal(await link.getAttribute('href'), 'https://lutastudios.com/utn/sistemas-operativos/');
      assert.equal(await link.getAttribute('target'), '_blank');
      assert.match(await link.getAttribute('rel'), /noreferrer/);
      await pagina.screenshot({ path: path.join(CAPTURAS, 'materia-santo.png') });
      await pagina.setViewportSize({ width: 390, height: 844 });
      await link.waitFor();
      await pagina.screenshot({ path: path.join(CAPTURAS, 'celular-materia-santo.png') });
      await pagina.setViewportSize({ width: 1280, height: 860 });
      await ir('materias/1');
      await pagina.getByRole('heading', { name: 'Materia A' }).waitFor();
      assert.equal(await pagina.getByRole('link', { name: /El Santo Resumen/ }).count(), 0, 'sin link si no coincide');
      await boton('Salir').click();
    } finally {
      MATERIA_B.fullname = antes;
    }
  });

  await prueba('El Santo Resumen sin salir: consejos en las anotaciones y apuntes oficiales o del banco en una materia tuya', async () => {
    const axe = AXE;
    const fallasAxe = async () => {
      await pagina.evaluate(axe);
      return pagina.evaluate(async () => (await Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))), await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })).violations.map((v) => `${v.id}: ${v.nodes[0].target}`));
    };
    const seSale = () => pagina.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    const antes = MATERIA_B.fullname;
    MATERIA_B.fullname = 'Sistemas Operativos 3K2';
    try {
      await pagina.getByLabel('Usuario').fill('alumno');
      await pagina.getByLabel('Contraseña').fill(CONTRASENA);
      await boton('Entrar').click();
      await pagina.getByRole('heading', { name: 'Hola, Ana' }).waitFor();

      // The tips of the subject and the general ones, added at the end of the notes and saved.
      await ir('materias/2');
      await pagina.getByText('Anotaciones', { exact: true }).click();
      await pagina.getByLabel('Tus anotaciones').fill('Mis cosas');
      await boton('Sumar consejos de El Santo Resumen').click();
      const consejos = pagina.getByRole('dialog', { name: 'Consejos de El Santo Resumen' });
      await consejos.getByRole('group', { name: 'De Sistemas Operativos' }).waitFor();
      await consejos.getByRole('group', { name: 'Para toda la carrera' }).getByText('Armá un grupo de estudio.').waitFor();
      await consejos.getByText('De ana, 4,7 de 5 con 3 votos').waitFor();
      await consejos.getByText('De beto, sin votos todavía').waitFor();
      await consejos.getByRole('checkbox', { name: /Hacé los ejercicios de semáforos/ }).check();
      assert.deepEqual(await fallasAxe(), [], 'consejos');
      await fin('santo-consejos');
      await consejos.getByRole('button', { name: 'Sumar un consejo' }).click();
      await consejos.waitFor({ state: 'detached' });
      await pagina.getByText('Sumaste un consejo. Quedó guardado en este navegador.').waitFor();
      const esperada = 'Mis cosas\n\nConsejo de ana en El Santo Resumen:\nHacé los ejercicios de semáforos.\nCaen siempre.';
      assert.equal(await pagina.getByRole('textbox', { name: 'Tus anotaciones' }).inputValue(), esperada);
      await pagina.reload();
      await pagina.getByText('Anotaciones', { exact: true }).waitFor();
      assert.equal(await pagina.getByRole('textbox', { name: 'Tus anotaciones' }).inputValue(), esperada, 'quedó guardado');
      await boton('Sumar consejos de El Santo Resumen').click();
      const deNuevo = pagina.getByRole('checkbox', { name: /Hacé los ejercicios de semáforos/ });
      await pagina.getByText('Ya está en tus anotaciones').waitFor();
      assert.equal(await deNuevo.isDisabled(), true, 'el que ya está no se suma dos veces');
      await pagina.keyboard.press('Escape');
      await pagina.waitForFunction(() => document.activeElement?.textContent === 'Sumar consejos de El Santo Resumen');

      // A course of its own: its subject opens by its name, with the official pages and a search in them.
      await ir('propias/nueva');
      await pagina.getByLabel('Nombre', { exact: true }).fill('Sistemas Operativos para el final');
      await boton('Crear').click();
      await pagina.getByRole('heading', { name: 'Editar materia' }).waitFor();
      await boton('De El Santo Resumen').first().click();
      const hoja = pagina.getByRole('dialog', { name: 'Sumar de El Santo Resumen' });
      assert.equal(await hoja.getByLabel('Materia').inputValue(), SO);
      await hoja.getByRole('group', { name: 'Apuntes' }).getByText('1° parcial').waitFor();
      await hoja.getByRole('group', { name: 'Ejercicios' }).getByText('Semáforos del puente').waitFor();
      await hoja.getByRole('checkbox', { name: /Para entender/ }).check();
      await hoja.getByLabel('Buscar').fill('planificacion');
      await hoja.getByRole('group', { name: 'En Sistemas Operativos' }).getByText('Planificación de procesos').waitFor();
      assert.equal(await hoja.getByText('Cinemática').count(), 0, 'solo la materia elegida');
      await hoja.getByRole('checkbox', { name: /Planificación de procesos/ }).check();
      assert.deepEqual(await fallasAxe(), [], 'apuntes oficiales');
      await fin('santo-oficiales');

      // The bank: if the service does not answer it says so, and trying again works. A search marks what it found.
      santoCaido = true;
      await hoja.getByLabel('Buscar').fill('');
      await hoja.getByText('Banco de resúmenes').click();
      await hoja.getByText('El Santo Resumen no responde ahora. Probá de nuevo en un rato.').waitFor();
      santoCaido = false;
      await hoja.getByRole('button', { name: 'Probar de nuevo' }).click();
      await hoja.getByRole('group', { name: 'Resúmenes de Sistemas Operativos' }).getByText('Resumen del 1° parcial').waitFor();
      await hoja.getByText('1° parcial, 4 me gusta, de santi').waitFor();
      await hoja.getByLabel('Buscar').fill('semaforos');
      await hoja.locator('.santo__trozo mark', { hasText: 'semáforos' }).waitFor();
      assert.equal(await hoja.getByText('Resumen del 1° parcial').count(), 0, 'solo lo que encontró');
      await hoja.getByRole('checkbox', { name: /Final con teoría/ }).check();
      assert.deepEqual(await fallasAxe(), [], 'banco');
      await fin('santo-banco');
      await pagina.setViewportSize({ width: 390, height: 844 });
      assert.equal(await seSale(), false, 'la hoja en 390');
      await fin('celular-santo-banco');
      await pagina.setViewportSize({ width: 1280, height: 860 });
      await hoja.getByRole('button', { name: 'Sumar 3 apuntes' }).click();
      await hoja.waitFor({ state: 'detached' });
      const categoria = pagina.locator('.editor__categoria').first();
      for (const nombre of ['Para entender de Sistemas Operativos', 'Planificación de procesos', 'Final con teoría']) {
        await categoria.locator('.fila__nombre', { hasText: nombre }).waitFor();
      }
      assert.equal(await categoria.getByText('Apunte de El Santo Resumen').count(), 3);

      // Already in the category: checked and fixed.
      await boton('De El Santo Resumen').first().click();
      await hoja.getByRole('checkbox', { name: /Para entender/ }).waitFor();
      assert.equal(await hoja.getByRole('checkbox', { name: /Para entender/ }).isDisabled(), true);
      await pagina.keyboard.press('Escape');

      // The view links each one to El Santo Resumen, in the exact place.
      await pagina.getByRole('link', { name: 'Listo' }).click();
      await pagina.getByRole('heading', { name: 'Sistemas Operativos para el final', level: 1 }).waitFor();
      for (const [nombre, destino] of [
        ['Para entender de Sistemas Operativos', 'https://lutastudios.com/utn/sistemas-operativos/'],
        ['Planificación de procesos', 'https://lutastudios.com/utn/sistemas-operativos/parcial-1.html#planificacion'],
        ['Final con teoría', `https://lutastudios.com/utn/banco.html?materia=${SO}#r-${SANTO_BANCO[1].id}`],
      ]) {
        await fila(nombre).click();
        assert.equal(await pagina.getByRole('dialog').getByRole('link', { name: 'Abrir enlace' }).getAttribute('href'), destino, nombre);
        await pagina.keyboard.press('Escape');
        await pagina.getByRole('dialog').waitFor({ state: 'hidden' });
      }
      await fin('santo-propia');

      const alSanto = pedidos.filter((p) => p.url.startsWith(SANTO_SERVICIO) || p.url.startsWith('https://lutastudios.com/'));
      assert.ok(alSanto.length > 0);
      assert.deepEqual(alSanto.filter((p) => p.cabeceras.authorization || p.cabeceras.cookie || p.cabeceras.referer), [], 'sin cuenta, cookies ni de dónde viene');
      assert.deepEqual(alSanto.filter((p) => /semaforos/.test(p.url)), [], 'lo buscado no va en la dirección');

      await pagina.getByRole('link', { name: 'Editar' }).click();
      await boton('Borrar materia').click();
      await pagina.getByRole('dialog').getByRole('button', { name: 'Borrar materia' }).click();
      await pagina.getByRole('heading', { name: 'Tuyas' }).waitFor({ state: 'attached' }).catch(() => {});
      await boton('Salir').click();
    } finally {
      MATERIA_B.fullname = antes;
      santoCaido = false;
    }
  });

  await prueba('secciones tuyas en una materia del campus, con lo tuyo y lo del campus, y el modo lectura', async () => {
    const axe = AXE;
    const fallasAxe = async () => {
      // Contrast is measured on the final colors: with reduced motion nothing is halfway through a fade while axe scrolls.
      await pagina.emulateMedia({ reducedMotion: 'reduce' });
      await pagina.evaluate(axe);
      try {
        return await pagina.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })).violations.map((v) => `${v.id}: ${v.nodes[0].target}`));
      } finally {
        // Back with motion, the entrance plays again: it is left to finish, so the pictures come out whole.
        await pagina.emulateMedia({ reducedMotion: 'no-preference' });
        await pagina.evaluate(() => new Promise((listo) => requestAnimationFrame(() => requestAnimationFrame(listo))));
        await pagina.waitForFunction(() => document.getAnimations().every((x) => x.playState !== 'running' || x.effect?.getComputedTiming().iterations === Infinity));
      }
    };
    await pagina.getByLabel('Usuario').fill('alumno');
    await pagina.getByLabel('Contraseña').fill(CONTRASENA);
    await boton('Entrar').click();
    await pagina.getByRole('heading', { name: 'Hola, Ana' }).waitFor();
    await ir('materias/1');
    await pagina.getByRole('heading', { name: 'Materia A', level: 1 }).waitFor();
    // Earlier tests hid things here: everything comes back.
    const ocultas = pagina.locator('details.ocultas');
    if (await ocultas.count()) {
      await ocultas.locator('summary').click();
      const mostrar = ocultas.getByRole('button', { name: /^Mostrar / });
      while (await mostrar.count()) await mostrar.first().click();
    }
    const seccion = (nombre) => pagina.locator('section.bloque', { has: pagina.getByRole('heading', { name: nombre, exact: true, level: 2 }) });

    // A section of one's own, from the button under the title: Escape closes the form, and the focus goes back.
    const sumarSeccion = boton('Sumar una sección');
    await sumarSeccion.click();
    await pagina.waitForFunction(() => document.activeElement?.closest('#sumar-seccion'), null, { timeout: 5000 });
    await pagina.keyboard.press('Escape');
    await pagina.locator('#sumar-seccion').waitFor({ state: 'detached' });
    await pagina.waitForFunction(() => document.activeElement?.textContent === 'Sumar una sección', null, { timeout: 5000 });
    // Typed there, it shows on the course right away, empty and ready to get things, with the focus on it.
    await sumarSeccion.click();
    await pagina.getByLabel('Nombre de la sección').fill('Para el final');
    await boton('Crear').click();
    const final = seccion('Para el final');
    await pagina.waitForFunction(() => document.activeElement?.tagName === 'H2' && document.activeElement.textContent === 'Para el final', null, { timeout: 5000 });
    await final.getByText('Todavía está vacía.', { exact: false }).waitFor();
    assert.equal(await sumarSeccion.isVisible(), true, 'el botón sigue ahí para sumar otra');
    await final.getByRole('button', { name: 'Un texto' }).click();
    await final.getByLabel('Texto', { exact: true }).fill('# Temas del final\nProcesos y **semáforos**.');
    await final.getByRole('button', { name: 'Guardar texto' }).click();
    await final.locator('.fila__nombre', { hasText: 'Temas del final' }).waitFor();
    await pagina.waitForFunction(() => document.activeElement?.closest('.fila')?.textContent.includes('Temas del final'), null, { timeout: 5000 });

    // Opened, the text keeps its format.
    await final.getByRole('button', { name: /^Temas del final/ }).click();
    const previa = pagina.getByRole('dialog');
    await previa.locator('strong', { hasText: 'semáforos' }).waitFor();
    await pagina.keyboard.press('Escape');
    await previa.waitFor({ state: 'detached' });

    // One's own things also go into the campus' sections, from their «Sumar».
    const unidad = seccion('Unidad 1');
    const sumarUnidad = unidad.getByRole('button', { name: 'Sumar a Unidad 1' });
    await sumarUnidad.click();
    // Escape closes it, and the focus goes back to its button.
    await unidad.getByRole('button', { name: 'Un enlace' }).focus();
    await pagina.keyboard.press('Escape');
    await pagina.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Sumar a Unidad 1', null, { timeout: 5000 });
    await sumarUnidad.click();
    await unidad.getByRole('button', { name: 'Un enlace' }).click();
    await unidad.getByLabel('Dirección').fill('https://example.org/apunte');
    await unidad.getByLabel('Cómo se llama').fill('Apunte de un compañero');
    await unidad.getByRole('button', { name: 'Guardar enlace' }).click();
    await unidad.locator('.fila__nombre', { hasText: 'Apunte de un compañero' }).waitFor();
    assert.equal(await unidad.getByRole('button', { name: 'Un enlace' }).count(), 0, 'se cierra al sumar');
    // Changed from its options, and deleted.
    await unidad.getByRole('button', { name: 'Opciones de Apunte de un compañero' }).click();
    await unidad.getByRole('button', { name: 'Cambiar el enlace' }).click();
    await unidad.getByLabel('Cómo se llama').fill('Apunte de Juan');
    await unidad.getByRole('button', { name: 'Guardar enlace' }).click();
    await unidad.locator('.fila__nombre', { hasText: 'Apunte de Juan' }).waitFor();
    await unidad.getByRole('button', { name: 'Borrar', exact: true }).click();
    await pagina.getByRole('dialog').getByRole('button', { name: 'Borrar' }).click();
    await unidad.locator('.fila__nombre', { hasText: 'Apunte de Juan' }).waitFor({ state: 'detached' });

    // A file of the computer dropped on a section goes in, and is kept in this browser.
    await final.evaluate((el) => {
      const datos = new DataTransfer();
      datos.items.add(new File(['%PDF-1.4 prueba'], 'resumen.pdf', { type: 'application/pdf' }));
      for (const tipo of ['dragenter', 'dragover', 'drop']) el.dispatchEvent(new DragEvent(tipo, { bubbles: true, cancelable: true, dataTransfer: datos }));
    });
    // Its name without «.pdf»: the kind goes next to it.
    await final.locator('.fila__nombre', { hasText: /^resumen$/ }).waitFor();
    assert.equal(await final.locator('.fila', { has: pagina.locator('.fila__nombre', { hasText: /^resumen$/ }) }).locator('.simbolo[data-tono="pdf"]').count(), 1, 'con el color de un PDF');

    // Cards of the campus go into it by dragging, and it stays after reloading.
    await arrastrar(seccion('Unidad 1').locator('li', { hasText: 'Planilla' }), final);
    await pagina.getByText('Pasaste Planilla a Para el final').waitFor();
    await pagina.reload();
    await final.locator('.fila__nombre', { hasText: 'Planilla' }).waitFor();
    assert.ok(!(await pagina.evaluate(() => Object.values(localStorage).join('\n'))).includes('Materia A'), 'el nombre del campus no va al disco');
    // And one's own go to the campus' sections, from the options.
    await final.getByRole('button', { name: 'Opciones de Temas del final' }).click();
    await final.getByLabel('Pasar a otra sección').selectOption({ label: 'Unidad 1' });
    await final.getByRole('button', { name: 'Pasar', exact: true }).click();
    await seccion('Unidad 1').locator('.fila__nombre', { hasText: 'Temas del final' }).waitFor();
    // The notices go away before measuring: one over a button would count as covering it.
    await pagina.locator('.aviso').first().waitFor({ state: 'detached', timeout: 8000 });
    assert.deepEqual(await fallasAxe(), [], 'materia con una sección tuya');
    await fin('materia-seccion-tuya');
    await pagina.setViewportSize({ width: 390, height: 844 });
    assert.equal(await pagina.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false, 'sección tuya en 390');
    await fin('celular-materia-seccion-tuya');
    await pagina.setViewportSize({ width: 1280, height: 860 });

    // Reading mode: only open and mark as seen, until it's turned off. It stays after reloading.
    const lectura = boton('Esconder las herramientas');
    await lectura.click();
    const mostrarHerramientas = boton('Mostrar las herramientas');
    await pagina.reload();
    await mostrarHerramientas.waitFor();
    for (const [que, cuantos] of [
      [pagina.locator('.fila__opciones'), 0],
      [pagina.getByRole('button', { name: /^Ocultar / }), 0],
      [pagina.getByRole('button', { name: /^Sumar a / }), 0],
      [boton('Sumar una sección'), 0],
      [pagina.locator('li[draggable="true"]'), 0],
    ]) assert.equal(await que.count(), cuantos);
    assert.ok(await pagina.locator('.fila__visto').count() > 0, 'marcar como visto sigue');
    assert.deepEqual(await fallasAxe(), [], 'modo lectura');
    await fin('materia-lectura');
    await mostrarHerramientas.click();
    await lectura.waitFor();

    // «Tus secciones» is not a course of its own: it doesn't show in Materias, and its pages go to the course.
    await ir('materias');
    await pagina.getByRole('heading', { name: 'Materias', level: 1 }).waitFor();
    assert.equal(await pagina.getByText('Tus secciones').count(), 0);
    const agregada = await pagina.evaluate(() => Object.entries(localStorage).filter(([k]) => k.startsWith('cl.mio')).flatMap(([, v]) => JSON.parse(v).propias ?? []).find((p) => p.de === 1)?.id);
    await ir(`propias/${agregada}/editar`);
    await pagina.getByRole('heading', { name: 'Materia A', level: 1 }).waitFor();

    // Renamed from its options, and deleted: what was moved into it goes back, and one's own goes with it. What
    // one's own was passed to a section of the campus stays there.
    await final.getByRole('button', { name: 'Opciones de Para el final' }).click();
    await final.getByRole('button', { name: 'Cambiar nombre' }).click();
    await pagina.getByLabel('Nombre de la sección').fill('Final de julio');
    await pagina.keyboard.press('Enter');
    const julio = seccion('Final de julio');
    await pagina.waitForFunction(() => document.activeElement?.textContent === 'Final de julio', null, { timeout: 5000 });
    await julio.getByRole('button', { name: 'Opciones de Final de julio' }).click();
    await julio.getByRole('button', { name: 'Borrar la sección' }).click();
    await pagina.getByRole('dialog').getByText('Se borra lo que sumaste en ella (una cosa). Lo que pasaste de otras secciones vuelve a su lugar.').waitFor();
    await pagina.getByRole('dialog').getByRole('button', { name: 'Borrar' }).click();
    await julio.waitFor({ state: 'detached' });
    await seccion('Unidad 1').locator('.fila__nombre', { hasText: 'Planilla' }).waitFor();
    await seccion('Unidad 1').locator('.fila__nombre', { hasText: 'Temas del final' }).waitFor();
    assert.equal(await pagina.locator('.fila__nombre', { hasText: /^resumen$/ }).count(), 0);
    // The last one of one's own in a campus section goes too.
    const unidad1 = seccion('Unidad 1');
    await unidad1.getByRole('button', { name: 'Opciones de Temas del final' }).click();
    await unidad1.getByRole('button', { name: 'Borrar', exact: true }).click();
    await pagina.getByRole('dialog').getByRole('button', { name: 'Borrar' }).click();
    await unidad1.locator('.fila__nombre', { hasText: 'Temas del final' }).waitFor({ state: 'detached' });

    // The index of the sections, on the side where there is room: only their titles, and touching one goes there.
    await pagina.setViewportSize({ width: 1600, height: 900 });
    const indice = pagina.locator('nav.indice--costado');
    const enIndice = async () => {
      await indice.waitFor();
      return indice.locator('.indice__texto').allTextContents();
    };
    const orden = await enIndice();
    assert.ok(orden.includes('Unidad 1') && orden.includes('Notas 2023'), orden.join(', '));
    await indice.getByRole('link', { name: 'Notas 2023' }).click();
    await pagina.waitForFunction(() => document.activeElement?.tagName === 'H2' && document.activeElement.textContent.includes('Notas 2023'), null, { timeout: 5000 });

    // Touching a title folds its section, and it stays folded after reloading.
    const titulo = () => seccion('Unidad 1').locator('button.seccion__titulo');
    await titulo().click();
    assert.equal(await titulo().getAttribute('aria-expanded'), 'false');
    await seccion('Unidad 1').locator('.seccion__cuerpo').waitFor({ state: 'hidden' });
    await pagina.reload();
    await seccion('Unidad 1').locator('button.seccion__titulo[aria-expanded="false"]').waitFor();
    await titulo().click();
    await seccion('Unidad 1').locator('.fila__nombre', { hasText: 'Planilla' }).waitFor();

    // Moved with the arrows from its handle: it says where it went, and the order stays after reloading.
    const lugar = orden.indexOf('Notas 2023');
    await seccion('Notas 2023').getByRole('button', { name: 'Mover Notas 2023' }).focus();
    await pagina.keyboard.press('ArrowUp');
    await pagina.getByRole('status').filter({ hasText: `Notas 2023 quedó en el lugar ${lugar} de ${orden.length}` }).waitFor({ state: 'attached' });
    const movido = await enIndice();
    assert.equal(movido.indexOf('Notas 2023'), lugar - 1);
    await pagina.reload();
    assert.deepEqual(await enIndice(), movido);
    await seccion('Notas 2023').getByRole('button', { name: 'Mover Notas 2023' }).focus();
    await pagina.keyboard.press('ArrowDown');
    await pagina.getByRole('status').filter({ hasText: `Notas 2023 quedó en el lugar ${lugar + 1} de ${orden.length}` }).waitFor({ state: 'attached' });
    assert.deepEqual(await enIndice(), orden);

    // Narrower, the same index waits closed above the search, and closes after going.
    await pagina.setViewportSize({ width: 1280, height: 860 });
    const plegable = pagina.locator('details.indice-plegable');
    await plegable.getByText('Ir a una sección').click();
    await plegable.getByRole('link', { name: 'Unidad 1' }).click();
    await pagina.waitForFunction(() => !document.querySelector('details.indice-plegable')?.open, null, { timeout: 5000 });

    await boton('Salir').click();
    await pagina.getByLabel('Usuario').waitFor();
  });

  await prueba('Classroom: se conecta en una ventanita, cada materia ve su curso y se suma a una tuya', async () => {
    // Only the ones of this flow: unlinking Google Calendar before gave the permission back too.
    const antesDeClassroom = pedidos.length;
    const axe = AXE;
    const fallasAxe = async () => {
      await pagina.evaluate(axe);
      return pagina.evaluate(async () => (await Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))), await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })).violations.map((v) => `${v.id}: ${v.nodes[0].target}`));
    };
    const seSale = () => pagina.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    const guardado = () => pagina.evaluate(() => ({ pestana: sessionStorage.getItem('cl.classroom'), disco: Object.values(localStorage).join('\n') }));
    const conectar = async (lugar) => {
      const [ventana] = await Promise.all([pagina.waitForEvent('popup'), lugar.getByRole('button', { name: 'Conectar Classroom' }).click()]);
      await ventana.waitForEvent('close');
    };
    const antes = MATERIA_B.fullname;
    MATERIA_B.fullname = 'Sistemas Operativos 3K2';
    try {
      await pagina.getByLabel('Usuario').fill('alumno');
      await pagina.getByLabel('Contraseña').fill(CONTRASENA);
      await boton('Entrar').click();
      await pagina.getByRole('heading', { name: 'Hola, Ana' }).waitFor();
      await ir('materias/2');
      // In the column on the right, after the progress bars, under a title in the color of the bar on top.
      const seccion = pagina.locator('.materia__lateral > details.classroom');
      await seccion.getByText('Si esta materia también usa Classroom, conectalo y ves acá sus temas, materiales y mensajes.').waitFor();
      const [fondo, barra] = await pagina.evaluate(() => [
        getComputedStyle(document.querySelector('.materia__lateral > details.classroom > summary')).backgroundColor,
        getComputedStyle(document.querySelector('.cabecera')).backgroundColor,
      ]);
      assert.equal(fondo, barra, 'el título de Classroom, del color de la barra');

      // Saying no in Google says so, and nothing is kept.
      googleNiega = true;
      await conectar(seccion);
      await seccion.getByText('No diste permiso en Google. Si querés, probá de nuevo.').waitFor();
      await pagina.waitForFunction(() => document.activeElement?.textContent === 'Conectar Classroom', null, { timeout: 5000 });
      assert.equal((await guardado()).pestana, null);
      googleNiega = false;

      // Allowed: the window closes and the course comes by the name. Its topics come closed, except the one with news.
      await conectar(seccion);
      const curso = seccion.getByLabel('Su curso de Classroom');
      await curso.waitFor();
      await pagina.waitForFunction(() => document.activeElement?.tagName === 'SUMMARY' && document.activeElement.textContent === 'Classroom', null, { timeout: 5000 });
      assert.equal(await curso.inputValue(), '700001');
      await seccion.getByText('Lo elegimos por el nombre. Si no es, cambialo.').waitFor();
      await seccion.getByText(`Conectado como ${GMAIL}`).waitFor();
      assert.ok(!(await guardado()).disco.includes(GMAIL), 'el mail queda en la pestaña, no en el disco');
      const grupo = (nombre) => seccion.locator('details.classroom__grupo', { has: pagina.locator('summary', { hasText: nombre }) });
      const abiertos = () => seccion.locator('details.classroom__grupo').evaluateAll((g) => g.map((d) => `${d.querySelector('summary').textContent}${d.open ? ' abierto' : ''}`));
      await grupo('Unidad 1: Procesos').waitFor();
      assert.deepEqual(await abiertos(), ['Tablón1 nuevo abierto', 'Unidad 1: Procesos2', 'Trabajos prácticos3 abierto']);
      await seccion.getByText('3 novedades desde tu última revisión.').waitFor();
      assert.deepEqual(await fallasAxe(), [], 'Classroom en la materia');
      await fin('classroom-materia');
      await pagina.setViewportSize({ width: 390, height: 844 });
      await seccion.scrollIntoViewIfNeeded();
      assert.equal(await seSale(), false, 'Classroom en 390');
      await fin('celular-classroom-materia');
      await pagina.setViewportSize({ width: 1280, height: 860 });

      // Each thing opens in the preview, as the campus' ones, and says where it is in Classroom.
      const previa = pagina.getByRole('dialog');
      await seccion.getByRole('button', { name: /^TP 1: Semáforos Nuevo, Tarea, para el / }).click();
      assert.equal(await previa.getByRole('link', { name: 'Abrir en Classroom' }).getAttribute('href'), 'https://classroom.google.com/c/NzAwMDAx/a/OTAy');
      await pagina.keyboard.press('Escape');
      await previa.waitFor({ state: 'detached' });
      await seccion.getByRole('button', { name: /^Consigna TP 1 Nuevo, Archivo de Drive, de la tarea «TP 1: Semáforos»/ }).waitFor();
      // The stream: the new message open and marked, with its text in the preview.
      await seccion.getByRole('button', { name: /^Mañana no hay clase\. Nuevo, / }).click();
      await previa.getByText('Nos vemos el jueves en el aula 3.').waitFor();
      assert.equal(await previa.getByRole('link', { name: 'Ver en Classroom' }).getAttribute('href'), 'https://classroom.google.com/c/NzAwMDAx/p/OTA0');
      await pagina.keyboard.press('Escape');
      await previa.waitFor({ state: 'detached' });
      await seccion.getByRole('button', { name: /^Clase 3 grabada .*un adjunto/ }).waitFor();
      assert.equal(await seccion.getByRole('link', { name: /^Abrir en Classroom/ }).getAttribute('href'), 'https://classroom.google.com/c/NzAwMDAx');
      const g = await guardado();
      assert.equal(JSON.parse(g.pestana).token, GTOKEN, 'el permiso queda en la pestaña');
      assert.ok(!g.disco.includes(GTOKEN), 'y nunca en el disco');
      assert.ok(!pagina.url().includes(GTOKEN));

      // Dragged to a section on the left, it stays there after reloading; from its options it goes back to the right.
      await grupo('Unidad 1: Procesos').locator('summary').click();
      const izquierda = pagina.locator('section.bloque', { has: pagina.getByRole('heading', { name: 'Unidad única', level: 2 }) });
      await arrastrar(seccion.locator('li', { hasText: /^Procesos/ }), izquierda);
      await pagina.getByText('Pasaste Procesos a Unidad única').waitFor();
      await izquierda.locator('.fila__nombre', { hasText: /^Procesos$/ }).waitFor();
      assert.equal(await seccion.locator('.fila__nombre', { hasText: /^Procesos$/ }).count(), 0);
      await pagina.reload();
      await izquierda.locator('.fila__nombre', { hasText: /^Procesos$/ }).waitFor();
      assert.ok(!(await guardado()).disco.includes('Procesos'), 'en el disco, solo números');
      await izquierda.getByRole('button', { name: 'Opciones de Procesos' }).click();
      await izquierda.getByLabel('Pasar a otra sección').selectOption('classroom');
      await izquierda.getByRole('button', { name: 'Pasar', exact: true }).click();
      await pagina.getByText('Procesos volvió a Classroom').waitFor();
      await grupo('Unidad 1: Procesos').locator('.fila__nombre', { hasText: /^Procesos$/ }).waitFor();
      await pagina.waitForFunction(() => document.activeElement?.closest('details.classroom') && document.activeElement.textContent.startsWith('Procesos'), null, { timeout: 5000 });
      assert.equal(await izquierda.locator('.fila__nombre', { hasText: /^Procesos$/ }).count(), 0);
      // Hidden on the right, it goes to «Lo que ocultaste» and comes back from there.
      await seccion.getByRole('button', { name: 'Opciones de OSTEP' }).click();
      await seccion.getByRole('button', { name: 'Ocultar', exact: true }).click();
      await seccion.locator('.fila__nombre', { hasText: 'OSTEP' }).waitFor({ state: 'detached' });
      await pagina.getByText('Lo que ocultaste (1)').click();
      await pagina.getByText('OSTEP, de Classroom').waitFor();
      await boton('Mostrar OSTEP').click();
      await grupo('Unidad 1: Procesos').locator('.fila__nombre', { hasText: 'OSTEP' }).waitFor();

      // Another course stays chosen after reloading; another subject waits to be chosen.
      await curso.selectOption('700002');
      await seccion.getByText('Este curso todavía no tiene materiales ni tareas.').waitFor();
      await pagina.reload();
      await seccion.getByText('Este curso todavía no tiene materiales ni tareas.').waitFor();
      assert.equal(await curso.inputValue(), '700002', 'quedó elegido y sigue conectado');
      // One chosen with another Google account stays chosen, and says so.
      await pagina.evaluate((clave) => {
        const mio = JSON.parse(localStorage.getItem(clave));
        mio.materias[2] = { ...mio.materias[2], classroom: '799999' };
        localStorage.setItem(clave, JSON.stringify(mio));
      }, `cl.mio.${usuarioId}`);
      await pagina.reload();
      await seccion.getByText('El que elegiste no está en el Classroom de esta cuenta de Google. Si es de otra, tocá «Usar otra cuenta».').waitFor();
      assert.equal(await curso.inputValue(), '799999');
      assert.equal(await seccion.locator('.classroom__grupo').count(), 0);
      // The wrong account is changed from the card: Google is told about the old one and its window asks which one.
      const revocados = () => pedidos.slice(antesDeClassroom).filter((p) => p.url === 'https://oauth2.googleapis.com/revoke');
      const [otra] = await Promise.all([pagina.waitForEvent('popup'), seccion.getByRole('button', { name: 'Usar otra cuenta' }).click()]);
      await otra.waitForEvent('close');
      await curso.waitFor();
      assert.equal(revocados().length, 1);
      assert.ok(pedidos.some((p) => p.url.startsWith('https://accounts.google.com/o/oauth2/v2/auth?') && new URL(p.url).searchParams.get('prompt') === 'select_account'), 'Google pregunta qué cuenta');
      // And dropped from there too: the focus goes to connect again.
      await seccion.getByRole('button', { name: 'Desconectar' }).click();
      await pagina.waitForFunction(() => document.activeElement?.textContent === 'Conectar Classroom', null, { timeout: 5000 });
      assert.equal((await guardado()).pestana, null);
      assert.equal(revocados().length, 2);
      await conectar(seccion);
      await curso.waitFor();
      // It does not drop by itself: without the permission (a new tab, or the hour ended) it comes back without asking.
      const pedidosGoogle = () => pedidos.filter((p) => p.url.startsWith('https://accounts.google.com/o/oauth2/v2/auth?')).map((p) => new URL(p.url).searchParams);
      const sinPermiso = () => pagina.evaluate(() => sessionStorage.removeItem('cl.classroom'));
      await sinPermiso();
      await pagina.reload();
      await curso.waitFor();
      const callado = pedidosGoogle().at(-1);
      assert.equal(callado.get('prompt'), 'none');
      assert.equal(callado.get('login_hint'), GSUB);
      assert.equal(await pagina.locator('iframe').count(), 0, 'el marco se va al terminar');
      // If the browser keeps Google out of the frame: one click, without asking which account.
      googleSinSesion = true;
      await sinPermiso();
      await pagina.reload();
      await seccion.getByRole('button', { name: 'Conectar Classroom' }).waitFor();
      googleSinSesion = false;
      await conectar(seccion);
      await curso.waitFor();
      const directo = pedidosGoogle().at(-1);
      assert.equal(directo.get('login_hint'), GSUB);
      assert.equal(directo.has('prompt'), false);
      await curso.selectOption('700001');
      await grupo('Unidad 1: Procesos').waitFor();
      // A course without Classroom says so, and stays like that: its course is not looked for by the name again.
      await curso.selectOption({ label: 'Ninguno' });
      await grupo('Unidad 1: Procesos').waitFor({ state: 'detached' });
      await pagina.reload();
      await curso.waitFor();
      assert.equal(await curso.inputValue(), 'ninguno');
      assert.equal(await seccion.locator('.classroom__grupo').count(), 0);
      await curso.selectOption('700001');
      await grupo('Unidad 1: Procesos').waitFor();
      await ir('materias/1');
      await pagina.getByRole('heading', { name: 'Materia A', level: 1 }).waitFor();
      assert.equal(await seccion.getByLabel('Su curso de Classroom').inputValue(), '', 'sin parecido, a elegir');
      assert.equal(await seccion.locator('.classroom__grupo').count(), 0);

      // Between sections of the campus too: dragging, and from the options.
      // Earlier tests hid things here: everything comes back, so «Notas 2023» is there to receive.
      const ocultas = pagina.locator('details.ocultas');
      if (await ocultas.count()) {
        await ocultas.locator('summary').click();
        const mostrar = ocultas.getByRole('button', { name: /^Mostrar / });
        while (await mostrar.count()) await mostrar.first().click();
      }
      const unidad = pagina.locator('section.bloque', { has: pagina.getByRole('heading', { name: 'Unidad 1', exact: true, level: 2 }) });
      const notas = pagina.locator('section.bloque', { has: pagina.getByRole('heading', { name: 'Notas 2023', level: 2 }) });
      await arrastrar(unidad.locator('li', { hasText: 'Planilla' }), notas);
      await pagina.getByText('Pasaste Planilla a Notas 2023').waitFor();
      await notas.locator('.fila__nombre', { hasText: 'Planilla' }).waitFor();
      assert.equal(await unidad.locator('.fila__nombre', { hasText: 'Planilla' }).count(), 0);
      await notas.getByRole('button', { name: 'Opciones de Planilla' }).click();
      await notas.getByLabel('Pasar a otra sección').selectOption({ label: 'Unidad 1' });
      await notas.getByRole('button', { name: 'Pasar', exact: true }).click();
      await pagina.getByText('Pasaste Planilla a Unidad 1').waitFor();
      await unidad.locator('.fila__nombre', { hasText: 'Planilla' }).waitFor();
      await pagina.waitForFunction(() => document.activeElement?.textContent.startsWith('Planilla'), null, { timeout: 5000 });

      // Joined to a course in progress, Hoy shows its tasks not turned in and its new messages.
      await seccion.getByLabel('Su curso de Classroom').selectOption('700001');
      await grupo('Unidad 1: Procesos').waitFor();
      await ir('');
      await pagina.getByRole('heading', { name: 'Hola, Ana' }).waitFor();
      const tarea = pagina.locator('a.pendiente', { hasText: 'TP 1: Semáforos' });
      await tarea.waitFor();
      assert.match(await tarea.textContent(), /Tarea de Classroom, Materia A/);
      assert.equal(await tarea.getAttribute('href'), 'https://classroom.google.com/c/NzAwMDAx/a/OTAy');
      assert.equal(await pagina.getByText('TP 0: Repaso').count(), 0, 'lo entregado no aparece');
      const mensajes = pagina.locator('section.bloque', { has: pagina.getByRole('heading', { name: 'Mensajes nuevos en Classroom' }) });
      const mensaje = mensajes.getByRole('link', { name: /^Mañana no hay clase/ });
      await mensaje.waitFor();
      assert.deepEqual(await fallasAxe(), [], 'Hoy con Classroom');
      await fin('classroom-hoy');
      await pagina.setViewportSize({ width: 390, height: 844 });
      assert.equal(await seSale(), false, 'Hoy con Classroom en 390');
      await fin('celular-classroom-hoy');
      await pagina.setViewportSize({ width: 1280, height: 860 });
      // The message takes to its subject. Seen there, the marks go away, also in Hoy.
      await mensaje.click();
      await pagina.getByRole('heading', { name: 'Materia A', level: 1 }).waitFor();
      await boton('Ya lo revisé').click();
      await seccion.getByText('3 novedades desde tu última revisión.').waitFor({ state: 'detached' });
      assert.deepEqual(await abiertos(), ['Tablón2', 'Unidad 1: Procesos2', 'Trabajos prácticos3']);
      await ir('');
      await pagina.locator('a.pendiente', { hasText: 'TP 1: Semáforos' }).waitFor();
      assert.equal(await mensajes.count(), 0, 'sin mensajes nuevos');

      // A course of its own: the sheet opens on the course with that name, and what is picked goes in as links.
      await ir('propias/nueva');
      await pagina.getByLabel('Nombre', { exact: true }).fill('Sistemas Operativos para el final');
      await boton('Crear').click();
      await pagina.getByRole('heading', { name: 'Editar materia' }).waitFor();
      await boton('Del Classroom').first().click();
      const hoja = pagina.getByRole('dialog', { name: 'Sumar del Classroom' });
      await hoja.getByRole('group', { name: 'Unidad 1: Procesos' }).waitFor();
      assert.equal(await hoja.getByLabel('Curso de Classroom').inputValue(), '700001');
      await hoja.getByRole('checkbox', { name: /^Procesos/ }).check();
      await hoja.getByRole('checkbox', { name: /^TP 1: Semáforos/ }).check();
      assert.deepEqual(await fallasAxe(), [], 'hoja del Classroom');
      await fin('classroom-elegir');
      await pagina.setViewportSize({ width: 390, height: 844 });
      assert.equal(await seSale(), false, 'la hoja en 390');
      await fin('celular-classroom-elegir');
      await pagina.setViewportSize({ width: 1280, height: 860 });
      await hoja.getByRole('button', { name: 'Sumar 2 cosas' }).click();
      await hoja.waitFor({ state: 'detached' });
      const categoria = pagina.locator('.editor__categoria').first();
      for (const nombre of [/^Procesos$/, 'TP 1: Semáforos']) await categoria.locator('.fila__nombre', { hasText: nombre }).waitFor();
      await boton('Del Classroom').first().click();
      await hoja.getByText('Ya está en esta categoría').first().waitFor();
      assert.equal(await hoja.getByRole('checkbox', { name: /^Procesos/ }).isDisabled(), true, 'lo que ya está no se suma dos veces');
      await pagina.keyboard.press('Escape');
      await hoja.waitFor({ state: 'detached' });
      await boton('Borrar materia').click();
      await pagina.getByRole('dialog').getByRole('button', { name: 'Borrar materia' }).click();
      await pagina.getByRole('dialog').waitFor({ state: 'detached' });

      // Disconnecting tells Google and drops it; Salir drops it too.
      await ir('configuracion#datos');
      await pagina.getByText(`Conectado como ${GMAIL}.`).waitFor();
      await boton('Desconectar').click();
      await pagina.getByText('Desconectaste Classroom').waitFor();
      await pagina.waitForFunction(() => document.activeElement?.textContent === 'Conectar Classroom', null, { timeout: 5000 });
      await pagina.waitForFunction(() => sessionStorage.getItem('cl.classroom') === null);
      const revocado = pedidos.slice(antesDeClassroom).filter((p) => p.url === 'https://oauth2.googleapis.com/revoke');
      assert.equal(revocado.length, 3, 'otra cuenta y desconectar en la materia, y acá');
      assert.ok(revocado.every((p) => p.metodo === 'POST' && p.cuerpo === `token=${GTOKEN}`));
      // Hoy offers to connect again, for the courses joined.
      await ir('');
      await pagina.getByText('Conectalo y ves acá sus tareas y sus mensajes nuevos.').waitFor();

      // Only in Classroom: connected from Crear una materia, its course is the base and the course shows it live.
      await ir('propias/nueva');
      const conectarAca = pagina.locator('.propias-nueva__classroom');
      await conectarAca.getByText('¿Es una materia de Classroom? Conectalo y elegila en «A partir de».').waitFor();
      await conectar(conectarAca);
      const aPartir = pagina.getByLabel('A partir de');
      await aPartir.locator('optgroup[label="De Classroom"] option[value="c:700001"]').waitFor({ state: 'attached' });
      await aPartir.selectOption('c:700001');
      assert.equal(await pagina.getByLabel('Nombre', { exact: true }).inputValue(), 'Sistemas Operativos 2026');
      await pagina.getByText('Sus temas y materiales se ven en la materia, al día, con tu cuenta de Google. Después le sumás lo tuyo.').waitFor();
      assert.equal(await pagina.getByText('Traer sus secciones y su contenido').count(), 0);
      await boton('Crear').click();
      await pagina.getByRole('heading', { name: 'Editar materia' }).waitFor();
      const suCurso = pagina.getByLabel('Curso de Classroom');
      assert.equal(await suCurso.inputValue(), '700001');
      assert.deepEqual(await fallasAxe(), [], 'editor de una materia de Classroom');
      await pagina.getByRole('link', { name: 'Listo' }).click();
      await pagina.getByRole('heading', { name: 'Sistemas Operativos 2026', level: 1 }).waitFor();
      const enLaTuya = pagina.getByRole('region', { name: 'Classroom' });
      // Its topics are sections of the course, as the campus' are in a campus course; its stream stays in the card.
      const tema = (nombre) => pagina.locator('section.bloque', { has: pagina.getByRole('heading', { name: nombre, exact: true, level: 2 }) });
      const enTema = (nombre) => tema(nombre).locator('.fila__nombre').allTextContents();
      const titulos = () => pagina.locator('.materia__contenido > section.bloque:not(.classroom) h2[id]').allTextContents();
      const filaCr = (nombre) => pagina.locator('li.fila', { has: pagina.getByRole('button', { name: `Opciones de ${nombre}`, exact: true }) });
      await tema('Unidad 1: Procesos').locator('.fila__nombre', { hasText: /^Procesos/ }).waitFor();
      assert.deepEqual(await titulos(), ['General', 'Unidad 1: Procesos', 'Trabajos prácticos']);
      assert.equal(await enLaTuya.getByRole('heading', { name: 'Unidad 1: Procesos' }).count(), 0, 'los temas no se repiten en la tarjeta');
      await enLaTuya.locator('summary', { hasText: 'Tablón' }).waitFor();
      assert.equal(await pagina.getByText('Todavía está vacía').count(), 0, 'no dice vacía si tiene Classroom');
      // Its index: its sections, the topics among them, and one touch takes to its title.
      const indiceClassroom = pagina.locator('details.indice-plegable');
      await indiceClassroom.locator('summary').click();
      assert.ok((await indiceClassroom.locator('.indice__texto').allTextContents()).includes('Unidad 1: Procesos'));
      await indiceClassroom.getByRole('link', { name: 'Unidad 1: Procesos' }).click();
      await pagina.waitForFunction(() => document.activeElement?.textContent === 'Unidad 1: Procesos', null, { timeout: 5000 });
      await indiceClassroom.locator('summary').click();

      // A topic renamed in place says its name in Classroom and goes back to it.
      await boton('Opciones de Unidad 1: Procesos').click();
      await tema('Unidad 1: Procesos').getByRole('button', { name: 'Cambiar nombre' }).click();
      await pagina.getByLabel('Nombre de la sección').fill('Teoría');
      await pagina.keyboard.press('Enter');
      await pagina.waitForFunction(() => document.activeElement?.tagName === 'H2' && document.activeElement.textContent === 'Teoría', null, { timeout: 5000 });
      await boton('Opciones de Teoría').click();
      await tema('Teoría').getByRole('button', { name: 'Cambiar nombre' }).click();
      await pagina.getByText('En Classroom se llama Unidad 1: Procesos').waitFor();
      await boton('Volver al nombre de Classroom').click();
      await tema('Unidad 1: Procesos').waitFor();
      await boton('Opciones de Unidad 1: Procesos').click();
      await tema('Unidad 1: Procesos').getByRole('button', { name: 'Cambiar nombre' }).click();
      await pagina.getByLabel('Nombre de la sección').fill('Teoría');
      await pagina.keyboard.press('Enter');
      await tema('Teoría').waitFor();

      // Moved from its options: the whole order stays, also above the student's own.
      await boton('Opciones de Trabajos prácticos').click();
      await tema('Trabajos prácticos').getByRole('button', { name: 'Subir', exact: true }).click();
      await tema('Trabajos prácticos').getByRole('button', { name: 'Subir', exact: true }).click();
      assert.deepEqual(await titulos(), ['Trabajos prácticos', 'General', 'Teoría']);

      // What's in a topic: renamed, passed to another topic or to a section of one's own, and back.
      await filaCr('OSTEP').getByRole('button', { name: 'Opciones de OSTEP' }).click();
      await filaCr('OSTEP').getByRole('button', { name: 'Renombrar' }).click();
      await pagina.getByLabel('Nombre nuevo').fill('Libro OSTEP');
      await pagina.keyboard.press('Enter');
      await tema('Teoría').locator('.fila__nombre', { hasText: 'Libro OSTEP' }).waitFor();
      const procesos = filaCr('Procesos');
      await procesos.getByRole('button', { name: 'Opciones de Procesos' }).click();
      await procesos.getByLabel(/Pasar a otra sección/).selectOption({ label: 'General' });
      await procesos.getByRole('button', { name: 'Pasar', exact: true }).click();
      await pagina.getByText('Pasaste Procesos a General').waitFor();
      assert.deepEqual(await enTema('General'), ['Procesos']);
      await procesos.getByRole('button', { name: 'Opciones de Procesos' }).click();
      assert.deepEqual(await procesos.getByLabel(/Pasar a otra sección/).locator('option').allTextContents(), ['Elegí una sección', 'Trabajos prácticos', 'Teoría']);
      await procesos.getByLabel(/Pasar a otra sección/).selectOption({ label: 'Teoría' });
      await procesos.getByRole('button', { name: 'Pasar', exact: true }).click();
      await pagina.getByText('Pasaste Procesos a Teoría').waitFor();
      assert.equal((await enTema('Teoría')).at(-1), 'Procesos');

      // A topic hidden goes to «Lo que ocultaste» and comes back; the names and the order stay after reloading.
      await tema('Teoría').getByRole('button', { name: 'Ocultar Teoría' }).click();
      await tema('Teoría').waitFor({ state: 'detached' });
      await pagina.locator('details.ocultas summary', { hasText: 'Lo que ocultaste (1)' }).click();
      assert.deepEqual(await fallasAxe(), [], 'materia de Classroom con un tema oculto');
      await boton('Mostrar Teoría').click();
      await tema('Teoría').waitFor();
      await pagina.reload();
      await tema('Teoría').locator('.fila__nombre', { hasText: 'Libro OSTEP' }).waitFor();
      assert.deepEqual(await titulos(), ['Trabajos prácticos', 'General', 'Teoría']);
      await pagina.evaluate(() => window.scrollTo(0, 0));
      assert.deepEqual(await fallasAxe(), [], 'materia de Classroom');
      await fin('classroom-propia');
      await pagina.setViewportSize({ width: 390, height: 844 });
      assert.equal(await seSale(), false, 'materia de Classroom en 390');
      await fin('celular-classroom-propia');
      await pagina.setViewportSize({ width: 1280, height: 860 });

      // In a new tab without the connection (and a browser that keeps Google out of frames) it asks for it, and the
      // editor says it has one.
      googleSinSesion = true;
      await pagina.evaluate(() => sessionStorage.removeItem('cl.classroom'));
      await pagina.reload();
      await enLaTuya.getByText('Conectá Classroom y ves acá sus temas y materiales, al día.').waitFor();
      assert.equal(await indiceClassroom.count(), 0, 'sin la conexión, nada que indexar');
      await pagina.getByRole('link', { name: 'Editar' }).click();
      await pagina.getByText('Tiene uno. Conectá Classroom para cambiarlo o sacarlo.').waitFor();
      await conectar(pagina.locator('.classroom__unir'));
      googleSinSesion = false;
      await suCurso.selectOption('');
      await pagina.getByRole('link', { name: 'Listo' }).click();
      await pagina.getByText('Todavía está vacía').waitFor();
      assert.equal(await enLaTuya.count(), 0, 'sin curso, sin Classroom');
      await pagina.getByRole('link', { name: 'Editar' }).click();
      await boton('Borrar materia').click();
      await pagina.getByRole('dialog').getByRole('button', { name: 'Borrar materia' }).click();
      await pagina.getByRole('dialog').waitFor({ state: 'detached' });

      await boton('Salir').click();
      await pagina.getByLabel('Usuario').waitFor();
      assert.equal((await guardado()).pestana, null, 'Salir lo borra');

      const aClassroom = pedidos.filter((p) => p.url.startsWith(`${CLASSROOM}/`) && p.metodo === 'GET');
      assert.ok(aClassroom.length > 0);
      assert.deepEqual(aClassroom.filter((p) => p.cabeceras.cookie || p.cabeceras.referer), [], 'sin cookies ni de dónde viene');
      assert.deepEqual([...new Set(aClassroom.map((p) => new URL(p.url).pathname))].sort(), [
        '/v1/courses', '/v1/courses/700001/announcements', '/v1/courses/700001/courseWork', '/v1/courses/700001/courseWork/-/studentSubmissions', '/v1/courses/700001/courseWorkMaterials', '/v1/courses/700001/topics',
        '/v1/courses/700002/announcements', '/v1/courses/700002/courseWork', '/v1/courses/700002/courseWorkMaterials', '/v1/courses/700002/topics',
      ], 'solo lo que se miró, y solo para leer');
    } finally {
      MATERIA_B.fullname = antes;
      googleNiega = false;
    }
  });

  await prueba('Classroom con «Seguir conectado» no se corta al cerrar la pestaña, aunque el navegador no deje renovarlo solo', async () => {
    const antes = MATERIA_B.fullname;
    MATERIA_B.fullname = 'Sistemas Operativos 3K2';
    try {
      await pagina.getByLabel('Usuario').fill('alumno');
      await pagina.getByLabel('Contraseña').fill(CONTRASENA);
      await pagina.getByLabel('Seguir conectado en este dispositivo').check();
      await boton('Entrar').click();
      await pagina.getByRole('heading', { name: 'Hola, Ana' }).waitFor();
      await ir('materias/2');
      const seccion = pagina.locator('.materia__lateral > details.classroom');
      const [ventana] = await Promise.all([pagina.waitForEvent('popup'), seccion.getByRole('button', { name: 'Conectar Classroom' }).click()]);
      await ventana.waitForEvent('close');
      await seccion.getByText(`Conectado como ${GMAIL}`).waitFor();
      const donde = () => pagina.evaluate(() => ({ pestana: sessionStorage.getItem('cl.classroom'), navegador: localStorage.getItem('cl.classroom') }));
      assert.equal((await donde()).pestana, null, 'con «Seguir conectado» no queda solo en la pestaña');
      assert.equal(JSON.parse((await donde()).navegador).email, GMAIL);

      // Like Brave, Firefox or Safari: Google cannot answer in the hidden frame. A new tab still has it.
      googleSinSesion = true;
      const aGoogle = () => pedidos.filter((p) => new URL(p.url).hostname === 'accounts.google.com').length;
      const pedidosAntes = aGoogle();
      await pagina.evaluate(() => sessionStorage.clear());
      await pagina.reload();
      await seccion.getByText(`Conectado como ${GMAIL}`).waitFor();
      assert.equal(aGoogle(), pedidosAntes, 'no tuvo que pedirle nada a Google');

      // An ended one is wiped, also from the browser.
      await pagina.evaluate(() => {
        const v = JSON.parse(localStorage.getItem('cl.classroom'));
        localStorage.setItem('cl.classroom', JSON.stringify({ ...v, vence: Date.now() - 1000 }));
      });
      await pagina.reload();
      const reconectar = seccion.getByRole('button', { name: /Conectar Classroom|Volver a conectar/ }).first();
      await reconectar.waitFor();
      assert.equal((await donde()).navegador, null, 'el vencido se borra');
      googleSinSesion = false;

      const [otraVez] = await Promise.all([pagina.waitForEvent('popup'), reconectar.click()]);
      await otraVez.waitForEvent('close');
      await seccion.getByText(`Conectado como ${GMAIL}`).waitFor();
      await boton('Salir').click();
      await pagina.getByLabel('Usuario').waitFor();
      assert.deepEqual(await donde(), { pestana: null, navegador: null }, 'Salir lo borra de los dos lados');
    } finally {
      MATERIA_B.fullname = antes;
      googleSinSesion = false;
    }
  });

  await prueba('Guardar en tu Google Drive: prender, otro dispositivo recibe todo, conflicto, sin conexión, permiso vencido, borrar la copia y dejar de guardar', async () => {
    // Only the ones of this flow: Google Calendar's go to the same server, and its flow checks them.
    const antesDeDrive = pedidos.length;
    const axe = AXE;
    const fallasAxe = async (p) => {
      await p.evaluate(axe);
      return p.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })).violations.map((v) => `${v.id}: ${v.nodes[0].target}`));
    };
    const seSale = (p) => p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    const interruptor = (p) => p.getByRole('switch', { name: 'Guardar en tu Google Drive' });
    const estado = (p) => p.locator('.ajuste-drive__estado');
    const entrar = async (p) => {
      await p.goto(base);
      await p.getByLabel('Usuario').fill('alumno');
      await p.getByLabel('Contraseña').fill(CONTRASENA);
      await p.getByRole('button', { name: 'Entrar', exact: true }).click();
      await p.getByRole('heading', { name: 'Hola, Ana' }).waitFor();
    };
    const prender = async (p) => {
      const [ventana] = await Promise.all([p.waitForEvent('popup'), interruptor(p).click()]);
      await ventana.waitForEvent('close');
    };
    // Client side, so it works without internet too: the router follows the address.
    const irSinRed = (p, ruta) => p.evaluate((r) => {
      history.pushState(null, '', `/${r}`);
      dispatchEvent(new PopStateEvent('popstate'));
    }, ruta);
    // With a note, the box comes open.
    const anotar = async (p, texto) => {
      const campo = p.getByLabel('Tus anotaciones');
      await p.getByText('Anotaciones', { exact: true }).waitFor();
      if (!(await campo.isVisible())) await p.getByText('Anotaciones', { exact: true }).click();
      await campo.fill(texto);
      await p.getByText('Guardado en este navegador').waitFor();
    };
    const esperarCopia = (fn, mensaje) => (async () => {
      for (let i = 0; i < 60; i++) {
        const c = copiaEnDrive();
        if (c && fn(c)) return c;
        await pagina.waitForTimeout(250);
      }
      throw new Error(mensaje);
    })();
    const capturar = (p, nombre) => p.screenshot({ path: path.join(CAPTURAS, `${nombre}.png`), fullPage: true });
    const celuContexto = await navegador.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await celuContexto.route('**/*', atender);
    const celu = await celuContexto.newPage();
    celu.on('pageerror', (e) => errores.push(e.message));
    celu.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
    try {
      // The computer, with what it had from before (saved before this existed, without times).
      await entrar(pagina);
      await ir('configuracion#datos');
      await interruptor(pagina).waitFor();
      assert.equal(await interruptor(pagina).isChecked(), false);
      await pagina.getByText('Va por dispositivo. Prendelo en cada compu, celu o navegador donde entrás a Super CVG, con la misma cuenta de Google.').waitFor();
      // First in its section: it's the one each device has to turn on.
      assert.equal(await pagina.locator('#ajustes-datos .ajustes__seccion h2').first().textContent(), 'Tus dispositivos');
      await pagina.getByText('Tus notas, tareas, fechas y materias quedan en este navegador, y en tu Drive si lo prendiste arriba.', { exact: false }).waitFor();
      const aGoogleAntes = pedidos.filter((p) => p.url.startsWith('https://accounts.google.com/')).length;
      await prender(pagina);
      await estado(pagina).getByText('Guardado en tu Drive recién').waitFor();
      await estado(pagina).getByText(`En la cuenta ${GMAIL}`).waitFor();
      assert.equal(await interruptor(pagina).isChecked(), true);
      const permiso = pedidos.filter((p) => p.url.startsWith('https://accounts.google.com/')).slice(aGoogleAntes)[0];
      assert.deepEqual(new URL(permiso.url).searchParams.get('scope').split(' '), ['https://www.googleapis.com/auth/drive.appdata', 'openid', 'email'], 'pide solo la carpeta de la app');
      assert.equal(new URL(permiso.url).searchParams.get('include_granted_scopes'), 'true');
      const primera = await esperarCopia((c) => c.datos.materias[1]?.nota === 'Preguntar por el TP', 'la copia no llegó al Drive');
      assert.equal(primera.alumno, 5);
      // It didn't turn Classroom on: whoever doesn't use it doesn't get it.
      await pagina.getByRole('button', { name: 'Conectar Classroom' }).waitFor();
      assert.deepEqual(await fallasAxe(pagina), [], 'Configuración con Drive');
      await capturar(pagina, 'drive-compu-guardado');

      // The phone, with nothing yet: it gets everything.
      await entrar(celu);
      await celu.goto(`${base}configuracion#datos`);
      await prender(celu);
      await estado(celu).getByText('Guardado en tu Drive recién').waitFor();
      assert.equal(await seSale(celu), false, 'Configuración con Drive en 390');
      await capturar(celu, 'drive-celu-guardado');
      await celu.goto(`${base}materias/1`);
      await celu.getByLabel('Tus anotaciones').waitFor();
      assert.equal(await celu.getByLabel('Tus anotaciones').inputValue(), 'Preguntar por el TP', 'el celu recibió la anotación de la compu');

      // Both without internet, each changes the same note: none is lost.
      // Both screens in the same page, so moving between them needs no internet.
      await irSinRed(pagina, 'materias/1');
      await pagina.getByText('Anotaciones', { exact: true }).waitFor();
      await contexto.setOffline(true);
      await celuContexto.setOffline(true);
      await anotar(pagina, 'Desde la compu');
      await anotar(celu, 'Desde el celu');
      await irSinRed(pagina, 'configuracion#datos');
      await estado(pagina).getByText('Sin conexión, se guarda cuando vuelva').waitFor({ timeout: 10_000 });
      await capturar(pagina, 'drive-compu-sin-conexion');
      await celuContexto.setOffline(false);
      await esperarCopia((c) => c.datos.materias[1]?.nota === 'Desde el celu', 'lo del celu no llegó');
      await contexto.setOffline(false);
      const unida = await esperarCopia((c) => c.datos.materias[1]?.nota.includes('Desde la compu'), 'la compu no juntó su anotación');
      assert.equal(unida.datos.materias[1].nota, 'Desde el celu\n\nDesde la compu', 'las dos versiones, la última primero');
      await estado(pagina).getByText('Guardado en tu Drive recién').waitFor();
      // The phone, on the same screen, sees it when it comes back to the tab (not right after its own save).
      await celu.waitForTimeout(10_500);
      await celu.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
      await celu.waitForFunction(() => document.querySelector('textarea')?.value === 'Desde el celu\n\nDesde la compu', null, { timeout: 15_000 });

      // The permission ended and the browser can't renew it alone: it asks to connect again, and then saves.
      driveVencido = true;
      googleSinSesion = true;
      await ir('materias/1');
      await anotar(pagina, 'Con el permiso vencido');
      await ir('configuracion#datos');
      await pagina.reload();
      await estado(pagina).getByText('Se cortó la conexión con Google').waitFor({ timeout: 15_000 });
      await capturar(pagina, 'drive-compu-reconectar');
      driveVencido = false;
      googleSinSesion = false;
      // In Google's window the student picks another account: it says so, and nothing is joined nor saved.
      otraCuentaGoogle = true;
      const copiaAntes = JSON.stringify(copiaEnDrive());
      const [conOtra] = await Promise.all([pagina.waitForEvent('popup'), pagina.getByRole('button', { name: 'Volver a conectar' }).click()]);
      await conOtra.waitForEvent('close');
      const pidio = pedidos.filter((p) => p.url.startsWith('https://accounts.google.com/')).at(-1);
      assert.equal(new URL(pidio.url).searchParams.get('login_hint'), GSUB, 'vuelve a conectar con la cuenta que usaba');
      await estado(pagina).getByText('Esta es otra cuenta de Google que la que usabas.').waitFor({ timeout: 15_000 });
      await pagina.getByRole('button', { name: 'Usar esta cuenta' }).waitFor();
      await capturar(pagina, 'drive-compu-otra-cuenta');
      assert.equal(JSON.stringify(copiaEnDrive()), copiaAntes, 'con otra cuenta no toca la copia');
      otraCuentaGoogle = false;
      const [otraVez] = await Promise.all([pagina.waitForEvent('popup'), pagina.getByRole('button', { name: 'Volver a conectar' }).click()]);
      await otraVez.waitForEvent('close');
      await esperarCopia((c) => c.datos.materias[1]?.nota === 'Con el permiso vencido', 'no guardó después de volver a conectar');
      await estado(pagina).getByText('Guardado en tu Drive recién').waitFor();

      // Deleting the copy from the computer: the phone finds out and stops, with what it had.
      await pagina.getByRole('button', { name: 'Borrar la copia de tu Drive' }).click();
      await pagina.getByRole('dialog').getByRole('button', { name: 'Borrar la copia' }).click();
      await pagina.getByText('Borraste la copia de tu Drive').waitFor();
      assert.equal([...enDrive.values()].filter((f) => f.name.startsWith('super-cvg-5')).length, 0, 'no queda nada del alumno en el Drive');
      assert.equal(await interruptor(pagina).isChecked(), false);
      await pagina.goto(`${base}materias/1`);
      await pagina.getByLabel('Tus anotaciones').waitFor();
      assert.equal(await pagina.getByLabel('Tus anotaciones').inputValue(), 'Con el permiso vencido', 'lo de la compu queda');
      await celu.goto(`${base}configuracion#datos`);
      await estado(celu).getByText('La copia de tu Drive se borró desde otro dispositivo. Lo de acá quedó.').waitFor({ timeout: 15_000 });
      assert.equal(await interruptor(celu).isChecked(), false);
      assert.equal(copiaEnDrive(), null, 'el celu no la vuelve a crear solo');

      // Turned on again it saves what it has; Dejar de guardar keeps the copy and what is here.
      await prender(celu);
      await estado(celu).getByText('Guardado en tu Drive recién').waitFor();
      await interruptor(celu).click();
      await celu.getByText('Dejaste de guardar en tu Drive. Lo de este navegador queda.').waitFor();
      assert.ok(copiaEnDrive(), 'la copia queda');
      // «Borrar todo lo mío» offers the copy in Drive too. Kept, it stays there.
      await celu.getByRole('button', { name: 'Borrar todo lo mío de este navegador' }).click();
      await celu.getByRole('dialog').getByRole('button', { name: 'Borrar todo' }).click();
      await celu.getByRole('dialog').getByRole('heading', { name: '¿Borrar también la copia de tu Drive?' }).waitFor();
      await capturar(celu, 'drive-celu-borrar-todo');
      await celu.getByRole('dialog').getByRole('button', { name: 'Dejarla' }).click();
      await celu.getByText('Borramos lo tuyo de este navegador').waitFor();
      assert.ok(copiaEnDrive(), 'la copia sigue en el Drive');
      assert.equal(await celu.evaluate(() => localStorage.getItem('cl.sync.5')), null, 'este dispositivo deja de guardar');

      // The computer saves again and stops: without Classroom the permission goes, and «Borrar la copia» asks Google.
      await pagina.goto(`${base}configuracion#datos`);
      await prender(pagina);
      await estado(pagina).getByText('Guardado en tu Drive recién').waitFor();
      await interruptor(pagina).click();
      await pagina.getByText('Dejaste de guardar en tu Drive. Lo de este navegador queda.').waitFor();
      assert.equal(await pagina.evaluate(() => sessionStorage.getItem('cl.classroom') ?? localStorage.getItem('cl.classroom')), null, 'sin el permiso de Google');
      await pagina.getByRole('button', { name: 'Borrar la copia de tu Drive' }).click();
      const [paraBorrar] = await Promise.all([pagina.waitForEvent('popup'), pagina.getByRole('dialog').getByRole('button', { name: 'Borrar la copia' }).click()]);
      await paraBorrar.waitForEvent('close');
      await pagina.getByText('Borraste la copia de tu Drive').waitFor();
      assert.equal([...enDrive.values()].filter((f) => f.name.startsWith('super-cvg-5')).length, 0, 'borró la copia sin estar guardando');
      assert.equal(await pagina.getByRole('button', { name: 'Borrar la copia de tu Drive' }).count(), 0);

      const aDrive = pedidos.slice(antesDeDrive).filter((p) => new URL(p.url).hostname === 'www.googleapis.com' && p.metodo !== 'OPTIONS');
      assert.ok(aDrive.length > 0);
      assert.deepEqual(aDrive.filter((p) => p.cabeceras.authorization !== `Bearer ${GTOKEN}` || p.url.includes(GTOKEN) || p.cabeceras.cookie || p.cabeceras.referer), [], 'el permiso solo en la cabecera, sin cookies ni de dónde viene');
      assert.deepEqual(aDrive.filter((p) => !/^https:\/\/www\.googleapis\.com\/(drive|upload\/drive)\/v3\/files/.test(p.url)), [], 'solo archivos de la carpeta de la app');
      await pagina.getByRole('button', { name: 'Salir' }).click();
      await pagina.getByLabel('Usuario').waitFor();
    } finally {
      driveVencido = false;
      googleSinSesion = false;
      otraCuentaGoogle = false;
      await contexto.setOffline(false);
      await celuContexto.close();
    }
  });

  await prueba('opinar: errores claros al lado, sin perder lo escrito, y un cierre que dice qué pasa', async () => {
    const axe = AXE;
    const fallasAxe = async () => {
      await pagina.evaluate(axe);
      return pagina.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })).violations.map((v) => `${v.id}: ${v.nodes[0].target}`));
    };
    const aOpiniones = () => pedidos.filter((p) => p.url === OPINIONES && p.metodo === 'POST');
    const mandados = aOpiniones().length;
    try {
      await ir('privacidad');
      await pagina.getByRole('contentinfo').getByRole('link', { name: 'Opinar' }).click();
      await pagina.getByRole('heading', { name: 'Opinar', level: 1 }).waitFor();
      assert.equal(await pagina.title(), 'Opinar | Super CVG');
      const campo = pagina.getByLabel('Tu opinión');
      const mandar = boton('Mandar opinión');
      const queda = pagina.locator('.opinar__queda');
      assert.equal(await queda.textContent(), 'Quedan 2.000 caracteres');

      // Empty or too long: said next to the field, with the focus there, and nothing goes out.
      await mandar.click();
      await pagina.getByText('Escribí tu opinión antes de mandarla.').waitFor();
      assert.equal(await pagina.evaluate(() => document.activeElement.name), 'opinion');
      assert.equal(await campo.getAttribute('aria-invalid'), 'true');
      await campo.fill('a'.repeat(2001));
      assert.equal(await queda.textContent(), 'Sobran 1 carácter');
      await mandar.click();
      await pagina.getByText('Es muy larga para mandarla. Acortala un poco.').waitFor();
      assert.equal(aOpiniones().length, mandados, 'vacía o larga no sale');
      await pagina.setViewportSize({ width: 390, height: 844 });
      await fin('celular-opinar-larga');
      await pagina.setViewportSize({ width: 1280, height: 860 });

      // What the panel can answer, each in words, and the text stays.
      const texto = 'Estaría bueno ver las fechas de los finales en el calendario.\nGracias por el sitio 👍';
      await campo.fill(texto);
      assert.equal(await queda.textContent(), 'Quedan 1.916 caracteres');
      assert.equal(await campo.getAttribute('aria-invalid'), null);
      for (const [respuesta, aviso] of [
        [{ status: 429, cuerpo: { ok: false, motivo: 'seguido' } }, 'Mandaste varias seguidas. Esperá unos minutos y probá de nuevo.'],
        [{ status: 429, cuerpo: { ok: false, motivo: 'tope' } }, 'Hoy llegaron muchas opiniones. Probá de nuevo mañana.'],
        [{ status: 503, cuerpo: { ok: false, motivo: 'pausado' } }, 'Ahora no estamos recibiendo opiniones. Probá de nuevo en un rato.'],
        [{ status: 500, cuerpo: { ok: false, motivo: 'error' } }, 'No se pudo mandar. Probá de nuevo en un rato.'],
        ['sin-red', 'No se pudo conectar. Revisá tu internet y probá de nuevo.'],
      ]) {
        opinionResponde = respuesta;
        await mandar.click();
        await pagina.getByRole('alert').filter({ hasText: aviso }).waitFor();
        assert.equal(await campo.inputValue(), texto, 'lo escrito sigue ahí');
        if (respuesta.cuerpo?.motivo === 'seguido') await fin('opinar-seguido');
      }
      await pagina.setViewportSize({ width: 390, height: 844 });
      await fin('celular-opinar-sin-red');
      assert.deepEqual(await fallasAxe(), [], 'opinar con un error, en 390');
      await pagina.setViewportSize({ width: 1280, height: 860 });

      // Leaving with something written asks first.
      await pagina.getByRole('contentinfo').getByRole('link', { name: 'Notas del parche' }).click();
      await pagina.getByRole('dialog').getByRole('button', { name: 'Seguir editando' }).click();
      assert.equal(new URL(pagina.url()).pathname, '/opinar');

      opinionResponde = { status: 200, cuerpo: { ok: true } };
      await mandar.click();
      await pagina.getByRole('heading', { name: 'La recibimos' }).waitFor();
      await pagina.waitForFunction(() => document.activeElement?.textContent === 'La recibimos');
      await pagina.getByText('Como no sabemos quién la mandó, no podemos contestarte.').waitFor();
      assert.deepEqual(await fallasAxe(), [], 'el cierre de opinar');
      await fin('opinar-listo');

      // Only the type and the text, cleaned like the panel keeps it, as a simple request: no cookies, no address.
      const ultimo = aOpiniones().at(-1);
      assert.deepEqual(JSON.parse(ultimo.cuerpo), { tipo: 'opinion', texto });
      assert.ok(!ultimo.cabeceras.cookie && !ultimo.cabeceras.referer, 'sin cookies ni de dónde viene');
      assert.match(ultimo.cabeceras['content-type'] ?? '', /^text\/plain/);
      assert.equal(aOpiniones().length - mandados, 6);

      await boton('Mandar otra').click();
      await pagina.waitForFunction(() => document.activeElement?.name === 'opinion');
      assert.equal(await campo.inputValue(), '');
      await pagina.setViewportSize({ width: 390, height: 844 });
      assert.equal(await pagina.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false, 'opinar en 390');
      await fin('celular-opinar');
      const guardado = await pagina.evaluate(() => JSON.stringify({ ...sessionStorage, ...localStorage }));
      assert.ok(!guardado.includes('finales en el calendario'), 'la opinión no queda en el navegador');
    } finally {
      opinionResponde = { status: 200, cuerpo: { ok: true } };
      await pagina.setViewportSize({ width: 1280, height: 860 });
    }
  });

  await prueba('Sysacad: las copias de las pestañas, cada estado, de otra cuenta, borrarlas, solo en memoria y Salir', async () => {
    const axe = AXE;
    const fallasAxe = async () => {
      await pagina.evaluate(axe);
      return pagina.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })).violations.map((v) => `${v.id}: ${v.nodes[0].target}`));
    };
    // Each state in both widths, with nothing out to the side.
    const fotoEn = async (nombre) => {
      for (const ancho of [1280, 390]) {
        await pagina.setViewportSize({ width: ancho, height: ancho === 390 ? 844 : 860 });
        await pagina.evaluate(() => document.fonts.ready);
        assert.equal(await pagina.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false, `${nombre} en ${ancho} se sale a lo ancho`);
        await foto(`sysacad-${nombre}-${ancho}`);
      }
      await pagina.setViewportSize({ width: 1280, height: 860 });
    };
    // Sysacad Lindo as it answers in the same window. `modo`: 'ninguna', 'vieja' (only the finals, before 2.4.0) or
    // 'nueva', which also answers the tabs with `copias`. «olvidar-pestanas» deletes them and answers. Sysacad never
    // opens for real.
    const extension = (modo, copias = null) => pagina.evaluate(([m, c]) => {
      window.__ext ??= { pedidos: [], abiertas: [] };
      window.__ext.modo = m;
      window.__ext.copias = c;
      if (window.__ext.escucha) return;
      window.__ext.escucha = true;
      window.open = (...a) => {
        window.__ext.abiertas.push(a);
        return null;
      };
      window.addEventListener('message', (e) => {
        if (e.source !== window || e.data?.fuente !== 'super-cvg') return;
        const ext = window.__ext;
        ext.pedidos.push(e.data.pide);
        if (ext.modo === 'ninguna') return;
        const vinculada = ext.copias?.vinculada ?? true;
        if (e.data.pide === 'sysacad') window.postMessage({ fuente: 'sysacad-lindo', para: 'super-cvg', v: 1, vinculada }, window.location.origin);
        if (ext.modo !== 'nueva') return;
        if (e.data.pide === 'olvidar-pestanas') ext.copias = { ...ext.copias, alumno: null, pestanas: [] };
        if (e.data.pide === 'pestanas' || e.data.pide === 'olvidar-pestanas') window.postMessage({ fuente: 'sysacad-lindo', para: 'super-cvg', v: 2, tipo: 'pestanas', ...ext.copias }, window.location.origin);
      });
    }, [modo, copias]);
    const volver = () => pagina.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    const ext = () => pagina.evaluate(() => window.__ext);
    const estado = pagina.locator('.sysacad-estado');
    const titulo = (texto) => estado.getByRole('heading', { name: texto }).waitFor();
    const sinVincular = { vinculada: false, guarda: false, alumno: null, pestanas: [] };
    const ejemplo = mensajeDeEjemplo();
    const todas = { vinculada: true, guarda: true, alumno: 'GOMEZ, Ana María', pestanas: ejemplo.pestanas };

    await ir('');
    await pagina.getByLabel('Usuario').fill('alumno');
    await pagina.getByLabel('Contraseña').fill(CONTRASENA);
    await boton('Entrar').click();
    await pagina.getByRole('heading', { name: 'Hola, Ana' }).waitFor();
    // In «Más», right after Notas.
    await boton(/^Más/, false).click();
    const enMas = await pagina.locator('.cabecera__panel-mas a').allTextContents();
    assert.ok(enMas.map((t) => t.trim()).join('|').includes('Horario|Sysacad|Tu carrera'), `Sysacad va entre Horario y Tu carrera en «Más»: ${enMas.join(', ')}`);
    await pagina.getByRole('link', { name: 'Sysacad', exact: true }).click();
    await pagina.getByRole('heading', { name: 'Sysacad', level: 1 }).waitFor();
    assert.equal(new URL(pagina.url()).pathname, '/sysacad');

    // 1. Without the extension: to get it, after a moment.
    await titulo('Instalá Sysacad Lindo');
    assert.equal(await estado.getByRole('link', { name: /^Bajar Sysacad Lindo/ }).getAttribute('href'), 'https://lutastudios.com/utn/sysacad-lindo.html');
    assert.deepEqual(await fallasAxe(), [], 'sysacad sin extensión');
    await fotoEn('sin-extension');

    // 2. One from before 2.4.0: it answers the finals and not the tabs.
    await extension('vieja', sinVincular);
    await volver();
    await titulo('Actualizá Sysacad Lindo');
    assert.equal(await estado.getByRole('link', { name: /^Bajar la versión nueva/ }).getAttribute('href'), 'https://lutastudios.com/utn/sysacad-lindo.html');
    await fotoEn('vieja');

    // 3. Updated, not linked: «Vincular» tells it and opens Sysacad apart; then, to sign in there.
    await extension('nueva', sinVincular);
    await volver();
    await titulo('Vinculá Sysacad Lindo');
    assert.deepEqual(await fallasAxe(), [], 'sysacad sin vincular');
    await fotoEn('sin-vincular');
    await estado.getByRole('button', { name: /^Vincular con Sysacad Lindo/ }).click();
    await titulo('Entrá a Sysacad');
    assert.deepEqual((await ext()).abiertas, [['https://alumnos.frro.utn.edu.ar/', '_blank', 'noopener']]);
    await pagina.waitForFunction(() => window.__ext.pedidos.includes('vincular'));
    await pagina.waitForFunction(() => document.activeElement?.textContent.startsWith('Abrir Sysacad'));

    // 4. Linked with the setting off: where to turn it on.
    await extension('nueva', { vinculada: true, guarda: false, alumno: null, pestanas: [] });
    await volver();
    await titulo('Sysacad Lindo no está guardando');
    await estado.getByText('Prendé «Guardar las pestañas que abrís» en sus ajustes').waitFor();
    await fotoEn('no-guarda');

    // 5. Keeping, nothing kept yet.
    await extension('nueva', { vinculada: true, guarda: true, alumno: null, pestanas: [] });
    await volver();
    await titulo('Todavía no hay copias');
    assert.equal(await estado.getByRole('link', { name: /^Abrir Sysacad/ }).getAttribute('href'), 'https://alumnos.frro.utn.edu.ar/');
    await fotoEn('sin-copias');

    // 6. Copies, and no name yet: they don't show.
    await extension('nueva', { ...todas, alumno: null });
    await volver();
    await titulo('Falta saber de quién son');
    assert.equal(await pagina.getByRole('tab').count(), 0);
    await fotoEn('sin-alumno');

    // 7. Hers («GOMEZ, Ana María» and «Ana María Gómez»): one tab each, in Sysacad Lindo's order, the first open.
    await extension('nueva', todas);
    await volver();
    const pestanas = pagina.getByRole('tab');
    await pestanas.first().waitFor();
    assert.equal(await pestanas.count(), 7);
    assert.deepEqual(await pagina.locator('.sysacad-solapa__nombre').allTextContents(), ['Estado académico', 'Parciales', 'Exámenes', 'Plan', 'Para cursar', 'Para rendir', 'Certificados']);
    assert.equal(await pestanas.first().getAttribute('aria-selected'), 'true');
    // Two hours ago: «hace 2 h», or «ayer» when the test runs past midnight.
    assert.match(await pestanas.first().getAttribute('aria-label'), /^Estado académico, (hace 2 h|ayer)$/);
    const hoja = pagina.getByRole('tabpanel');
    await hoja.getByRole('heading', { name: 'Estado académico', level: 2 }).waitFor();
    // Sysacad's own title row becomes the date of the data, as Sysacad Lindo says it.
    await hoja.getByText(/^Datos al \d{1,2}\/\d{1,2}\/\d{4} /).waitFor();
    assert.equal(await hoja.getByText(/^Estado académico de Rodríguez/).count(), 0);
    assert.equal(await hoja.locator('tbody tr').count(), 23);
    await pagina.getByRole('link', { name: /^Abrir Sysacad/ }).first().waitFor();
    assert.deepEqual(await fallasAxe(), [], 'sysacad con copias');
    await fotoEn('copias');

    // Estado académico the Sysacad Lindo way: the average and the progress first, a band per year, the state in words.
    await hoja.locator('.sysacad-cifra__numero', { hasText: '8,00' }).waitFor();
    await hoja.getByText('12 de 23 materias aprobadas').waitFor();
    assert.deepEqual(await hoja.getByRole('heading', { level: 3 }).allTextContents(), ['Primer año', 'Segundo año', 'Tercer año']);
    const fisica = hoja.getByRole('row', { name: /^Física I / });
    assert.equal(await fisica.locator('.sysacad-estado-de').textContent(), 'Aprobada');
    assert.match(await fisica.textContent(), /Tomo 121, folio 15/);
    // A filter says how many it leaves, and leaves only those.
    await hoja.getByRole('group', { name: 'Estado' }).getByRole('button', { name: /^Regulares/ }).click();
    assert.equal(await hoja.locator('tbody tr').count(), 3);
    assert.equal(await hoja.locator('.sysacad-cuenta').textContent(), '3 de 23 materias');
    await hoja.getByRole('group', { name: 'Estado' }).getByRole('button', { name: /^Todas/ }).click();

    // A search over the subjects, without accents or capitals.
    const buscar = hoja.getByLabel('Buscar materia');
    await buscar.fill('analisis');
    await pagina.waitForFunction(() => document.querySelector('.sysacad-cuenta')?.textContent === '4 de 23 materias');
    assert.equal(await hoja.locator('tbody tr').count(), 4);
    await buscar.fill('quimica');
    await hoja.getByText('Ninguna tiene «quimica» con estos filtros').waitFor();
    assert.equal(await hoja.locator('table').count(), 0);
    await buscar.fill('');

    // The arrows move among the tabs. A long table gets a search and sorts by any column, its dates as dates.
    await pestanas.first().focus();
    await pagina.keyboard.press('ArrowRight');
    await pagina.keyboard.press('ArrowRight');
    await pagina.waitForFunction(() => document.activeElement?.getAttribute('aria-label')?.startsWith('Exámenes'));
    await hoja.getByRole('heading', { name: 'Exámenes', level: 2 }).waitFor();
    await hoja.getByLabel('Buscar en Exámenes').waitFor();
    await hoja.getByRole('button', { name: 'Fecha' }).click();
    assert.equal(await hoja.getByRole('columnheader', { name: 'Fecha' }).getAttribute('aria-sort'), 'ascending');
    assert.equal(await hoja.locator('tbody tr').first().locator('td').first().textContent(), '20/11/2023');
    await hoja.getByRole('button', { name: 'Nota' }).click();
    await hoja.getByRole('button', { name: 'Nota' }).click();
    assert.equal(await hoja.locator('tbody tr').first().locator('td').nth(2).textContent(), 'diez');
    await pestanas.nth(2).focus();
    await pagina.keyboard.press('End');
    await hoja.getByRole('heading', { name: 'Certificados', level: 2 }).waitFor();
    assert.deepEqual(await hoja.locator('.sysacad-certificado').allTextContents(), ['Alumno regular', 'Materias aprobadas con nota', 'Examen rendido']);
    await hoja.getByText(/^Importante: al generar el certificado/).waitFor();
    await pestanas.last().focus();
    await pagina.keyboard.press('Home');
    await hoja.getByRole('heading', { name: 'Estado académico', level: 2 }).waitFor();
    // Correlatividad: how many can, what holds back the most, and each requirement on its own line, said to the student.
    await pestanas.nth(4).click();
    await hoja.locator('.sysacad-cifra__numero', { hasText: '12' }).waitFor();
    await hoja.getByText('de 25 podés cursar').waitFor();
    assert.equal(await hoja.locator('.sysacad-freno__nombre').first().textContent(), 'Administración de Sistemas de Información');
    assert.equal(await hoja.getByRole('link', { name: 'Tu carrera' }).getAttribute('href'), '/carrera');
    await hoja.locator('.sysacad-linea', { hasText: 'Cursar Redes de Datos' }).waitFor();
    assert.deepEqual(await fallasAxe(), [], 'sysacad correlativas');
    await fotoEn('correlativas');

    // Anything that is not exactly the extension's message changes nothing.
    await pagina.evaluate((m) => {
      window.postMessage({ ...m, alumno: 'PEREZ, Juan', extra: 1 }, window.location.origin);
      window.postMessage({ ...m, alumno: 'PEREZ, Juan', pestanas: [{ ...m.pestanas[0], bloques: [{ t: 'imagen', src: 'x' }] }] }, window.location.origin);
      window.postMessage({ ...m, alumno: 'PEREZ, Juan', v: 1 }, window.location.origin);
    }, { fuente: 'sysacad-lindo', para: 'super-cvg', v: 2, tipo: 'pestanas', ...todas });
    await pagina.waitForTimeout(200);
    assert.equal(await pestanas.count(), 7);

    // Only in memory: nothing in storage, the address or the title.
    const guardado = await pagina.evaluate(() => JSON.stringify({ ...sessionStorage, ...localStorage }));
    assert.ok(!/Análisis Matemático|Correlatividad|Rodríguez|GOMEZ/i.test(guardado), 'las copias no tocan el disco');
    assert.equal(new URL(pagina.url()).pathname + new URL(pagina.url()).search, '/sysacad');
    assert.equal(await pagina.title(), 'Sysacad | Super CVG');

    // 8. Someone else's: nothing shows, and they can be deleted after a simple question.
    await extension('nueva', { ...todas, alumno: 'PEREZ, Juan Ignacio' });
    await volver();
    await titulo('Son de otra cuenta');
    assert.equal(await pagina.getByRole('tab').count(), 0);
    assert.equal(await pagina.locator('table').count(), 0);
    assert.ok(!(await pagina.locator('main').textContent()).includes('PEREZ'), 'no dice de quién son');
    assert.deepEqual(await fallasAxe(), [], 'sysacad de otra cuenta');
    await fotoEn('otra-cuenta');
    const pedidosAntes = (await ext()).pedidos.length;
    await estado.getByRole('button', { name: 'Borrar las copias' }).click();
    await pagina.getByRole('dialog').getByRole('button', { name: 'Borrar' }).click();
    await titulo('Todavía no hay copias');
    await pagina.waitForFunction((n) => window.__ext.pedidos.slice(n).includes('olvidar-pestanas'), pedidosAntes);
    await pagina.waitForFunction(() => document.activeElement?.classList.contains('sysacad-estado'));

    // 9. Salir tells the extension to delete them.
    await extension('nueva', todas);
    await volver();
    await pestanas.first().waitFor();
    const antes = (await ext()).pedidos.length;
    await boton('Salir').click();
    await pagina.getByLabel('Usuario').waitFor();
    assert.ok((await ext()).pedidos.slice(antes).includes('olvidar-pestanas'), 'Salir le pide que las borre');
    assert.equal(pedidos.filter((p) => new URL(p.url).hostname === 'alumnos.frro.utn.edu.ar').length, 0, 'Sysacad no se pidió de verdad');
  });

  await prueba('Tu carrera: el mapa de las copias de Sysacad, lo que frena, suponer una materia, filtros, de otra cuenta y solo en memoria', async () => {
    const axe = AXE;
    const fallasAxe = async () => {
      await pagina.evaluate(axe);
      return pagina.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })).violations.map((v) => `${v.id}: ${v.nodes[0].target}`));
    };
    const fotoEn = async (nombre) => {
      for (const ancho of [1280, 390]) {
        await pagina.setViewportSize({ width: ancho, height: ancho === 390 ? 844 : 860 });
        await pagina.evaluate(() => document.fonts.ready);
        assert.equal(await pagina.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false, `${nombre} en ${ancho} se sale a lo ancho`);
        await foto(`carrera-${nombre}-${ancho}`);
      }
      await pagina.setViewportSize({ width: 1280, height: 860 });
    };
    // Sysacad Lindo answering the tabs in the same window, with `copias`; null, not there at all.
    const extension = (copias) => pagina.evaluate((c) => {
      window.__car ??= {};
      window.__car.copias = c;
      if (window.__car.escucha) return;
      window.__car.escucha = true;
      window.addEventListener('message', (e) => {
        if (e.source !== window || e.data?.fuente !== 'super-cvg' || !window.__car.copias) return;
        if (e.data.pide === 'sysacad') window.postMessage({ fuente: 'sysacad-lindo', para: 'super-cvg', v: 1, vinculada: true }, window.location.origin);
        if (e.data.pide === 'pestanas') window.postMessage({ fuente: 'sysacad-lindo', para: 'super-cvg', v: 2, tipo: 'pestanas', ...window.__car.copias }, window.location.origin);
      });
    }, copias);
    const volver = () => pagina.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    const estado = pagina.locator('.carrera-estado');
    const exacto = (t) => new RegExp(`^${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
    const ficha = (nombre) => pagina.locator('.carrera-ficha', { has: pagina.locator('.carrera-ficha__nombre', { hasText: exacto(nombre) }) });
    const todas = { vinculada: true, guarda: true, alumno: 'GOMEZ, Ana María', pestanas: mensajeDeEjemplo().pestanas };

    // From the sign-in, or from the session the test before left open.
    await ir('');
    const usuario = pagina.getByLabel('Usuario');
    const hola = pagina.getByRole('heading', { name: 'Hola, Ana' });
    await Promise.race([usuario.waitFor().catch(() => {}), hola.waitFor().catch(() => {})]);
    if (await usuario.isVisible()) {
      await usuario.fill('alumno');
      await pagina.getByLabel('Contraseña').fill(CONTRASENA);
      await boton('Entrar').click();
      await hola.waitFor();
    }
    // In «Más», right after Sysacad.
    await boton(/^Más/, false).click();
    const enMas = await pagina.locator('.cabecera__panel-mas a').allTextContents();
    assert.ok(enMas.map((t) => t.trim()).join('|').includes('Sysacad|Tu carrera'), `Tu carrera va al lado de Sysacad en «Más»: ${enMas.join(', ')}`);
    await pagina.getByRole('link', { name: 'Tu carrera', exact: true }).click();
    await pagina.getByRole('heading', { name: 'Tu carrera', level: 1 }).waitFor();
    assert.equal(await pagina.title(), 'Tu carrera | Super CVG');

    // 1. Without the extension: to the Sysacad screen, which says what to do.
    await estado.getByRole('heading', { name: 'Primero, Sysacad Lindo' }).waitFor();
    assert.equal(await estado.getByRole('link', { name: 'Ir a Sysacad en Super CVG' }).getAttribute('href'), '/sysacad');
    assert.deepEqual(await fallasAxe(), [], 'carrera sin extensión');
    await fotoEn('sin-extension');

    // 2. Her copies: the summary, what holds back the most and a band per year.
    await extension(todas);
    await volver();
    await pagina.getByRole('heading', { name: '12 de 34 materias aprobadas' }).waitFor();
    assert.deepEqual(await pagina.locator('.carrera-anio__titulo').allTextContents(), ['Primer año', 'Segundo año', 'Tercer año', 'Cuarto año', 'Quinto año']);
    assert.equal(await pagina.locator('.carrera-frenos li').first().textContent(), 'Administración de Sistemas de Información, frena 3');
    assert.equal(await ficha('Análisis Matemático I').locator('.carrera-ficha__estado').textContent(), 'Aprobada con 8');
    assert.equal(await ficha('Sistemas Operativos').locator('.carrera-ficha__estado').textContent(), 'Regular, te falta para rendir');
    assert.equal(await ficha('Legislación').locator('.carrera-ficha__estado').textContent(), 'Podés cursarla');
    // Sysacad cuts the name; the requirements bring it whole.
    await ficha('Administración de Sistemas de Información').waitFor();
    // Electives not started stay hidden until asked.
    assert.equal(await ficha('Entornos Gráficos (Elec.)').count(), 0);
    assert.deepEqual(await fallasAxe(), [], 'carrera con el mapa');
    await fotoEn('mapa');

    // 3. A subject opens under its year with what it lacks and what it frees; around it, what each card is to it.
    await ficha('Redes de Datos').click();
    const detalle = pagina.locator('.carrera-detalle');
    await detalle.getByRole('heading', { name: 'Redes de Datos' }).waitFor();
    await pagina.waitForFunction(() => document.activeElement?.classList.contains('carrera-detalle'));
    assert.equal(await ficha('Redes de Datos').getAttribute('aria-expanded'), 'true');
    assert.match(await detalle.textContent(), /Para cursarla te falta\s*Regularizar Comunicación de Datos/);
    assert.match(await detalle.textContent(), /Seguridad en los Sistemas de Información, para cursar/);
    assert.equal(await ficha('Comunicación de Datos').locator('.carrera-ficha__marca').textContent(), 'Requisito');
    assert.equal(await ficha('Proyecto Final').locator('.carrera-ficha__marca').textContent(), 'Necesita la elegida');
    // From the top: a card under the fixed header counts as covered for axe.
    await pagina.evaluate(() => window.scrollTo(0, 0));
    assert.deepEqual(await fallasAxe(), [], 'carrera con una materia abierta');
    await fotoEn('detalle');
    // Escape closes it, and the focus goes back to its card.
    await pagina.keyboard.press('Escape');
    await detalle.waitFor({ state: 'detached' });
    await pagina.waitForFunction(() => document.activeElement?.textContent.startsWith('Redes de Datos'));

    // 4. Supposing what holds back: what it opens is marked and counted, electives too.
    await pagina.locator('.carrera-frenos').getByRole('button', { name: 'Comunicación de Datos' }).click();
    await detalle.getByRole('button', { name: 'Suponé que la tenés' }).click();
    await pagina.getByText('Suponiendo que tenés Comunicación de Datos: se te abre 1 materia.').waitFor();
    assert.equal(await ficha('Redes de Datos').locator('.carrera-ficha__marca--abre').textContent(), 'Se te abre');
    await pagina.locator('.carrera-frenos').getByRole('button', { name: 'Administración de Sistemas de Información' }).click();
    await detalle.getByRole('button', { name: 'Suponé que la tenés' }).click();
    await pagina.getByText(/^Suponiendo que tenés Comunicación de Datos, Administración de Sistemas de Información: se te abren 2 materias\./).waitFor();
    await ficha('Sistemas de Información Integrados para la Industria (Elec.)').locator('.carrera-ficha__marca--abre').waitFor();
    assert.equal(await detalle.getByRole('button', { name: 'Dejar de suponer' }).getAttribute('aria-pressed'), 'true');
    await fotoEn('suponer');
    await pagina.locator('.carrera-supuesto').getByRole('button', { name: 'Dejar de suponer' }).click();
    assert.equal(await pagina.locator('.carrera-ficha__marca--abre').count(), 0);
    await detalle.getByRole('button', { name: 'Cerrar' }).click();

    // 5. Filters: what can sit the final, what can start today, and the electives.
    await pagina.locator('.carrera-filtros').getByRole('button', { name: 'Podés rendir', exact: true }).click();
    assert.deepEqual(await pagina.locator('.carrera-ficha__nombre').allTextContents(), ['Análisis Matemático II', 'Física II']);
    await pagina.locator('.carrera-filtros').getByRole('button', { name: 'Podés cursar', exact: true }).click();
    assert.deepEqual(await pagina.locator('.carrera-ficha__nombre').allTextContents(), ['Legislación']);
    await pagina.getByLabel(/^Electivas sin cursar/).check();
    assert.deepEqual(await pagina.locator('.carrera-ficha__nombre').allTextContents(), ['Entornos Gráficos (Elec.)', 'Lenguaje de Programación Java (Elec.)', 'Legislación']);
    await pagina.locator('.carrera-filtros').getByRole('button', { name: 'Todo', exact: true }).click();

    // Only in memory: nothing in storage, the address or the title.
    const guardado = await pagina.evaluate(() => JSON.stringify({ ...sessionStorage, ...localStorage }));
    assert.ok(!/Análisis Matemático|Redes de Datos|GOMEZ/i.test(guardado), 'el mapa no toca el disco');
    assert.equal(new URL(pagina.url()).pathname + new URL(pagina.url()).search, '/carrera');

    // Without the correlatividades it asks for both; with the one to start a subject, not for the one to sit the final.
    const pide = pagina.getByText('Para verla entera, abrí también', { exact: false });
    await extension({ ...todas, pestanas: todas.pestanas.filter((p) => p.clave !== 'correlativas-rendir' && p.clave !== 'correlativas-cursar') });
    await volver();
    await pagina.getByText('Para verla entera, abrí también Correlatividad para cursar y Correlatividad para rendir.', { exact: false }).waitFor();
    await extension({ ...todas, pestanas: todas.pestanas.filter((p) => p.clave !== 'correlativas-rendir') });
    await volver();
    await pide.waitFor({ state: 'detached' });
    await fotoEn('cursar-sin-rendir');

    // 6. Someone else's copies: no map, and nothing of theirs on the page.
    await extension({ ...todas, alumno: 'PEREZ, Juan Ignacio' });
    await volver();
    await estado.getByRole('heading', { name: 'Las copias no son tuyas' }).waitFor();
    assert.equal(await pagina.locator('.carrera-ficha').count(), 0);
    assert.ok(!(await pagina.locator('main').textContent()).includes('PEREZ'), 'no dice de quién son');
    assert.deepEqual(await fallasAxe(), [], 'carrera de otra cuenta');
    await fotoEn('otra-cuenta');
    await boton('Salir').click();
    await pagina.getByLabel('Usuario').waitFor();
  });

  await prueba('Resúmenes: vincular desde El Santo Resumen, un link vencido, las dos listas, quitar, una llave que ya no sirve y desvincular', async () => {
    const axe = AXE;
    const fallasAxe = async () => {
      await pagina.evaluate(axe);
      return pagina.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })).violations.map((v) => `${v.id}: ${v.nodes[0].target}`));
    };
    // Each state in both widths, the whole page, accessible and with nothing out to the side.
    const foto = async (nombre) => {
      for (const ancho of [1280, 390]) {
        await pagina.setViewportSize({ width: ancho, height: ancho === 390 ? 844 : 860 });
        await pagina.evaluate(() => document.fonts.ready);
        assert.equal(await pagina.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false, `${nombre} en ${ancho} se sale a lo ancho`);
        assert.deepEqual(await fallasAxe(), [], `${nombre} en ${ancho}`);
        // The rows skip their drawing while out of view (content-visibility), and a full-page capture does not bring
        // them into view: the window grows to the whole page first.
        const alto = await pagina.evaluate(() => document.documentElement.scrollHeight);
        await pagina.setViewportSize({ width: ancho, height: alto });
        await pagina.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        await pagina.screenshot({ path: path.join(CAPTURAS, `resumenes-${nombre}-${ancho}.png`), fullPage: true });
      }
      await pagina.setViewportSize({ width: 1280, height: 860 });
    };
    // The likes of the account are asked apart, next to the lists: they have their own test.
    const aCvg = () => pedidos.filter((p) => p.url.startsWith(`${SANTO_SERVICIO}/functions/v1/utn?a=cvg-`) && p.metodo !== 'OPTIONS' && !p.url.endsWith('a=cvg-gustos'));
    const cual = (p) => new URL(p.url).searchParams.get('a');
    const entrar = async (nombre = 'Ana') => {
      await pagina.getByLabel('Usuario').fill('alumno');
      await pagina.getByLabel('Contraseña').fill(CONTRASENA);
      await boton('Entrar').click();
      await pagina.getByRole('heading', { name: `Hola, ${nombre}` }).waitFor();
    };
    const vincular = pagina.getByRole('link', { name: /^Vincular desde El Santo Resumen/ });
    const subidos = pagina.getByRole('region', { name: 'Subidos por vos' });
    const enviados = pagina.getByRole('region', { name: 'Mandados desde El Santo Resumen' });
    const dialogo = pagina.getByRole('dialog');
    try {
      await ir('');
      await entrar();
      // In the menu, right after Buscar.
      const menu = pagina.getByRole('navigation', { name: 'Principal' });
      if (await boton('Menú').isVisible()) await boton('Menú').click();
      assert.deepEqual((await menu.getByRole('link').allTextContents()).slice(3, 5), ['Buscar', 'Resúmenes']);
      await menu.getByRole('link', { name: 'Resúmenes' }).click();
      await pagina.getByRole('heading', { name: 'Resúmenes', level: 1 }).waitFor();
      assert.equal(await pagina.title(), 'Resúmenes | Super CVG');

      // Not linked: what it is and the way to link it, in El Santo Resumen. Nothing goes out.
      await vincular.waitFor();
      assert.equal(await vincular.getAttribute('href'), 'https://lutastudios.com/utn/#cuenta');
      assert.equal(await vincular.getAttribute('target'), '_blank');
      assert.match(await vincular.getAttribute('rel'), /noreferrer/);
      assert.equal(aCvg().length, 0, 'sin vincular no se pide nada');
      await foto('sin-vincular');

      // An expired or used link says so. The code leaves the address before anything, and goes only in the body. Here the
      // tab was already on /resumenes, so only the «#» changes.
      await ir(`resumenes#vincular=${cvgCodigo(1)}`);
      await pagina.getByText('El link venció o ya se usó. En El Santo Resumen, abrí tu cuenta y tocá de nuevo «Vincular con Super CVG».').waitFor();
      assert.equal(new URL(pagina.url()).hash, '');
      const canje = aCvg().at(-1);
      assert.equal(cual(canje), 'cvg-canjear');
      assert.equal(canje.cuerpo, JSON.stringify({ codigo: cvgCodigo(1) }));
      await vincular.waitFor();
      assert.equal(await pagina.evaluate(() => localStorage.getItem('cl.santo.5')), null);
      await foto('link-vencido');

      // Linking: one trade, then the lists with the key in its header. The key and the name stay for this student.
      santoCvg.subidos = CVG_SUBIDOS;
      santoCvg.enviados = [...CVG_ENVIADOS];
      santoCvg.codigos.add(cvgCodigo(2));
      santoCvg.demora = 600;
      const antes = aCvg().length;
      // A new tab, as El Santo Resumen opens it: the whole page loads.
      await ir('privacidad');
      await ir(`resumenes#vincular=${cvgCodigo(2)}`);
      // While it comes, the shape of the rows, busy.
      await pagina.locator('.resumenes__esqueleto[aria-busy="true"] .esqueleto').waitFor();
      await pagina.getByRole('status').getByText('Vinculando con El Santo Resumen').waitFor({ state: 'attached' });
      await pagina.getByText('Vinculado con santi.').waitFor();
      await pagina.locator('.resumenes__esqueleto[aria-busy="true"] .esqueleto').waitFor();
      santoCvg.demora = 0;
      await subidos.waitFor();
      assert.equal(await pagina.locator('[aria-busy]').count(), 0, 'el esqueleto se va');
      assert.equal(new URL(pagina.url()).hash, '');
      const nuevos = aCvg().slice(antes);
      assert.deepEqual(nuevos.map(cual), ['cvg-canjear', 'cvg-resumenes']);
      assert.equal(nuevos[1].metodo, 'GET');
      assert.equal(nuevos[1].cabeceras['x-utn-llave'], CVG_LLAVE);
      assert.ok(pedidos.some((p) => p.url.endsWith('a=cvg-gustos') && p.metodo === 'GET' && p.cabeceras['x-utn-llave'] === CVG_LLAVE), 'los me gusta de la cuenta, con la llave');
      const disco = await pagina.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
      assert.deepEqual(JSON.parse(JSON.parse(disco)['cl.santo.5']), { llave: CVG_LLAVE, usuario: 'santi' });
      assert.ok(!/Planificación|Semáforos|sistemas-operativos/.test(disco), 'las listas no tocan el disco');
      await pagina.getByText('Lo que subiste al banco de El Santo Resumen y lo que mandaste desde ahí, con la cuenta santi.').waitFor();

      // Published: it opens here, on the whole screen. In review or hidden: it does not open, and has its mark.
      const publicado = subidos.getByRole('button', { name: 'Planificación de procesos, con ejercicios', exact: true });
      assert.equal(await publicado.getAttribute('aria-haspopup'), 'dialog');
      await subidos.getByText('Sistemas Operativos, 1° parcial, PDF').waitFor();
      const enRevision = subidos.getByRole('listitem').filter({ hasText: 'Memoria virtual paso a paso' });
      await enRevision.getByText('En revisión').waitFor();
      await enRevision.getByText('Sistemas Operativos, 2° parcial, Word').waitFor();
      assert.equal(await enRevision.getByRole('button').count(), 0);
      const oculto = subidos.getByRole('listitem').filter({ hasText: 'Apuntes de la cursada 2024' });
      await oculto.getByText('Oculto', { exact: true }).waitFor();
      assert.equal(await oculto.getByRole('button').count(), 0);
      assert.equal(await subidos.getByRole('button', { name: /^Quitar/ }).count(), 0, 'lo subido no se quita desde acá');
      await enviados.getByText('Sistemas Operativos, 2° parcial, HTML interactivo').waitFor();
      await enviados.getByText('Física I, Final, PDF').waitFor();
      await enviados.getByRole('button', { name: 'Cinemática para el final', exact: true }).waitFor();
      const largo = enviados.getByRole('listitem').filter({ hasText: 'Sincronización con semáforos' });
      await largo.getByText('Oculto', { exact: true }).waitFor();
      assert.equal(await largo.getByRole('button', { name: /^Sincronización/ }).count(), 0);
      await largo.getByRole('button', { name: /^Quitar Sincronización/ }).waitFor();
      await foto('vinculado');
      // Narrow, the title keeps the width of the card; the mark and «Quitar» go at the bottom, under the data, apart.
      await pagina.setViewportSize({ width: 390, height: 844 });
      const medidas = await largo.evaluate((li) => {
        const caja = (s) => li.querySelector(s).getBoundingClientRect();
        return { titulo: caja('.resumen__titulo').width, dato: caja('.resumen__dato').bottom, marca: caja('.resumen__marca'), quitar: caja('.resumen__quitar') };
      });
      await pagina.setViewportSize({ width: 1280, height: 860 });
      assert.ok(medidas.titulo >= 200, `el título queda en ${Math.round(medidas.titulo)} px`);
      assert.ok(medidas.marca.top >= medidas.dato, 'la marca va debajo del dato');
      assert.ok(medidas.quitar.top >= medidas.dato, '«Quitar» va debajo del dato');
      assert.ok(medidas.quitar.left >= medidas.marca.right, '«Quitar» no pisa la marca');

      // Taking one out asks first, and the focus goes to the next one.
      const quitarPuente = enviados.getByRole('button', { name: 'Quitar Semáforos del puente, resuelto' });
      await quitarPuente.click();
      await dialogo.getByText('¿Quitar «Semáforos del puente, resuelto»?').waitFor();
      await dialogo.getByRole('button', { name: 'Volver' }).click();
      assert.equal(aCvg().filter((p) => cual(p) === 'cvg-quitar').length, 0, 'Volver no quita nada');
      await quitarPuente.click();
      await dialogo.getByRole('button', { name: 'Quitar' }).click();
      await quitarPuente.waitFor({ state: 'detached' });
      await pagina.waitForFunction(() => document.activeElement?.textContent === 'Quitar Cinemática para el final');
      await pagina.getByText('Lo quitaste de la lista').waitFor();
      const quitado = aCvg().filter((p) => cual(p) === 'cvg-quitar').at(-1);
      assert.equal(quitado.cuerpo, JSON.stringify({ id: CVG_ENVIADOS[0].id }));
      assert.equal(quitado.cabeceras['x-utn-llave'], CVG_LLAVE);
      assert.equal(santoCvg.enviados.length, 2);
      await subidos.getByRole('button', { name: 'Planificación de procesos, con ejercicios', exact: true }).waitFor();

      // The last one out of a list: that list invites, the other stays.
      santoCvg.subidos = [];
      await pagina.reload();
      await subidos.getByText('Todavía no subiste ninguno.', { exact: false }).waitFor();
      assert.equal(await subidos.getByRole('link', { name: /^al banco/ }).getAttribute('href'), 'https://lutastudios.com/utn/banco.html');
      await enviados.getByRole('button', { name: 'Cinemática para el final', exact: true }).waitFor();

      // Nothing in either: one invitation, never an empty list.
      santoCvg.enviados = [];
      await pagina.reload();
      await pagina.getByRole('heading', { name: 'Todavía no hay resúmenes acá' }).waitFor();
      assert.equal(await pagina.locator('.resumenes__seccion:not(.resumenes__banco) .resumenes__lista').count(), 0);
      assert.equal(await pagina.getByRole('link', { name: /^Ir al banco/ }).getAttribute('href'), 'https://lutastudios.com/utn/banco.html');
      await foto('vacio');

      // A key the service no longer knows: this browser forgets it and says so.
      santoCvg.llaves.clear();
      await pagina.reload();
      await pagina.getByText('El vínculo con El Santo Resumen se cortó. Volvé a vincularlo para ver tus resúmenes.').waitFor();
      await vincular.waitFor();
      assert.equal(await pagina.evaluate(() => localStorage.getItem('cl.santo.5')), null);
      assert.equal(aCvg().at(-1).cabeceras['x-utn-llave'], CVG_LLAVE);
      await foto('llave-vencida');

      // Without a session yet: the code is traded at once, on the sign-in screen, so it cannot expire while the student
      // signs in. The key waits in memory, and only after signing in is it stored for that student.
      santoCvg.subidos = CVG_SUBIDOS;
      santoCvg.enviados = [...CVG_ENVIADOS];
      await boton('Salir').click();
      await pagina.getByLabel('Usuario').waitFor();
      santoCvg.codigos.add(cvgCodigo(3));
      await ir(`resumenes#vincular=${cvgCodigo(3)}`);
      await pagina.getByLabel('Usuario').waitFor();
      assert.equal(new URL(pagina.url()).hash, '');
      for (let i = 0; santoCvg.codigos.has(cvgCodigo(3)) && i < 50; i++) await pagina.waitForTimeout(100);
      assert.deepEqual(aCvg().filter((p) => p.cuerpo.includes(cvgCodigo(3))).map(cual), ['cvg-canjear'], 'sin sesión ya se canjea');
      await pagina.waitForTimeout(300);
      assert.deepEqual(await pagina.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('cl.santo.'))), [], 'la llave espera en memoria');
      const antesDeEntrar = aCvg().length;
      await pagina.getByLabel('Usuario').fill('alumno');
      await pagina.getByLabel('Contraseña').fill(CONTRASENA);
      await boton('Entrar').click();
      await pagina.getByText('Vinculado con santi.').waitFor();
      assert.equal(new URL(pagina.url()).pathname, '/resumenes');
      await subidos.waitFor();
      assert.deepEqual(aCvg().slice(antesDeEntrar).map(cual), ['cvg-resumenes'], 'al entrar no se canjea de nuevo');
      assert.deepEqual(JSON.parse(await pagina.evaluate(() => localStorage.getItem('cl.santo.5'))), { llave: CVG_LLAVE, usuario: 'santi' });

      // Another student in this browser starts unlinked, and nothing of the first one goes out.
      await boton('Salir').click();
      usuarioId = 6;
      await entrar('Beto');
      const deAna = aCvg().length;
      await ir('resumenes');
      await vincular.waitFor();
      assert.equal(aCvg().length, deAna);
      await boton('Salir').click();
      usuarioId = 5;
      await entrar();
      await ir('resumenes');
      await subidos.waitFor();

      // Unlinking asks, ends the key there and here, and the focus goes to the way back in.
      await boton('Desvincular').click();
      await dialogo.getByText('¿Desvincular El Santo Resumen?').waitFor();
      await dialogo.getByRole('button', { name: 'Desvincular' }).click();
      await vincular.waitFor();
      await pagina.waitForFunction(() => document.activeElement?.id === 'resumenes-vincular');
      const fuera = aCvg().at(-1);
      assert.equal(cual(fuera), 'cvg-desvincular');
      assert.equal(fuera.metodo, 'POST');
      assert.equal(fuera.cabeceras['x-utn-llave'], CVG_LLAVE);
      assert.equal(santoCvg.llaves.size, 0);
      assert.equal(await pagina.evaluate(() => localStorage.getItem('cl.santo.5')), null);

      // The key only in its header, only to the service; no code in an address.
      assert.deepEqual(pedidos.filter((p) => p.url.includes(CVG_LLAVE) || p.cuerpo.includes(CVG_LLAVE)).map((p) => p.url), [], 'la llave en una dirección o un cuerpo');
      assert.deepEqual(pedidos.filter((p) => p.cabeceras['x-utn-llave'] && !p.url.startsWith(`${SANTO_SERVICIO}/functions/v1/utn?a=cvg-`)).map((p) => p.url), [], 'la llave fuera del servicio');
      assert.deepEqual(pedidos.filter((p) => p.url.includes('CodigoDePrueba')).map((p) => p.url), [], 'el código en una dirección');
      await boton('Salir').click();
      await pagina.getByLabel('Usuario').waitFor();
    } finally {
      usuarioId = 5;
      santoCvg.demora = 0;
      santoCvg.llaves.clear();
      santoCvg.codigos.clear();
      await pagina.setViewportSize({ width: 1280, height: 860 });
      await pagina.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('cl.santo.')).forEach((k) => localStorage.removeItem(k)));
    }
  });

  await prueba('Resúmenes: el banco por materia y con buscador, me gusta con la cuenta y el resumen en pantalla completa', async () => {
    const axe = AXE;
    const fallasAxe = async () => {
      await pagina.evaluate(axe);
      return pagina.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })).violations.map((v) => `${v.id}: ${v.nodes[0].target}`));
    };
    const seSale = () => pagina.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    const aCvg = () => pedidos.filter((p) => p.url.startsWith(`${SANTO_SERVICIO}/functions/v1/utn?a=cvg-`) && p.metodo !== 'OPTIONS');
    const aLeer = () => pedidos.filter((p) => /[?&]a=(ver|vista|bajar)&/.test(p.url) && p.metodo !== 'OPTIONS');
    const banco = pagina.getByRole('region', { name: 'Banco de resúmenes' });
    const visor = pagina.locator('dialog.visor');
    const fila = (titulo) => banco.getByRole('listitem').filter({ hasText: titulo });
    const WORD = { id: '0b6f2a8e-1c11-4d0a-9a51-2f6a8b1c0d03', materia: SO, instancia: 'parcial-2', titulo: 'Memoria virtual en Word', me_gusta: 2, autor: 'caro', tipo: 'docx' };
    SANTO_BANCO.push(WORD);
    const foto = async (nombre) => {
      for (const ancho of [1280, 390]) {
        await pagina.setViewportSize({ width: ancho, height: ancho === 390 ? 844 : 860 });
        // Measured once the viewer finished coming in: halfway, its colors are still fading.
        await pagina.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished)));
        await pagina.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        assert.equal(await seSale(), false, `${nombre} en ${ancho} se sale a lo ancho`);
        assert.deepEqual(await fallasAxe(), [], `${nombre} en ${ancho}`);
        await pagina.screenshot({ path: path.join(CAPTURAS, `resumenes-${nombre}-${ancho}.png`) });
      }
      await pagina.setViewportSize({ width: 1280, height: 860 });
    };
    try {
      await ir('');
      await pagina.getByLabel('Usuario').fill('alumno');
      await pagina.getByLabel('Contraseña').fill(CONTRASENA);
      await boton('Entrar').click();
      await pagina.getByRole('heading', { name: 'Hola, Ana' }).waitFor();
      await ir('resumenes');

      // Without the account linked: the bank is there all the same, with how many likes each one has.
      await fila('Resumen del 1° parcial').waitFor();
      assert.deepEqual(await banco.getByRole('listitem').locator('.resumen__titulo').allTextContents(), ['Resumen del 1° parcial', 'Final con teoría', 'Memoria virtual en Word']);
      await fila('Resumen del 1° parcial').getByText('Sistemas Operativos, 1° parcial, de santi').waitFor();
      assert.equal(await banco.getByRole('button', { name: /me gusta/ }).count(), 0, 'sin vincular no hay botón de me gusta');
      assert.equal(await fila('Resumen del 1° parcial').locator('.megusta--quieto').textContent(), '4 me gusta');
      assert.equal(await fila('Final con teoría').locator('.megusta').count(), 0, 'sin me gusta no muestra un cero');
      await foto('banco');

      // By subject: the name of the subject leaves each row. One without summaries says so.
      // Written, not looked for among all of them: «operativos sist» finds it.
      const materia = banco.getByRole('combobox', { name: 'Materia' });
      await materia.fill('operativos sist');
      await banco.getByRole('option', { name: 'Sistemas Operativos' }).waitFor();
      await materia.press('Enter');
      await fila('Final con teoría').getByText('Final, de ana', { exact: true }).waitFor();
      await materia.click();
      await banco.getByRole('option', { name: 'Física I', exact: true }).click();
      await banco.locator('.resumenes__nada').getByText('Esta materia todavía no tiene resúmenes en el banco.').waitFor();
      await banco.getByRole('button', { name: 'Quitar la materia' }).click();

      // Searched: what was found, with the words marked.
      await banco.getByLabel('Buscar').fill('semaforos');
      await banco.locator('mark', { hasText: 'semáforos' }).waitFor();
      assert.deepEqual(await banco.getByRole('listitem').locator('.resumen__titulo').allTextContents(), ['Final con teoría']);
      await pagina.getByRole('status').filter({ hasText: 'Un resumen' }).waitFor({ state: 'attached' });
      await banco.getByLabel('Buscar').fill('nada de nada');
      await banco.locator('.resumenes__nada').getByText('No hay resúmenes con esas palabras.').waitFor();
      await banco.getByLabel('Buscar').fill('');
      await fila('Memoria virtual en Word').waitFor();

      // A PDF opens on the whole screen, drawn here. The way to the bank and to download it stay on top.
      const titulo = await pagina.title();
      await banco.getByRole('button', { name: 'Resumen del 1° parcial', exact: true }).click();
      await visor.getByRole('heading', { name: 'Resumen del 1° parcial', level: 2 }).waitFor();
      await visor.getByRole('group', { name: 'Página 1 de 2' }).waitFor();
      assert.equal(await visor.getByRole('link', { name: /^Abrir en El Santo Resumen/ }).getAttribute('href'), `https://lutastudios.com/utn/banco.html?materia=${SO}#r-${SANTO_BANCO[0].id}`);
      assert.equal(await visor.getByRole('link', { name: /^Bajar/ }).getAttribute('href'), `${SANTO_SERVICIO}/functions/v1/utn?a=bajar&id=${SANTO_BANCO[0].id}`);
      const caja = await visor.boundingBox();
      assert.deepEqual([caja.x, caja.y, caja.width, caja.height], [0, 0, 1280, 860], 'ocupa toda la pantalla');
      await foto('visor-pdf');
      // With everything of the reader, like a file of the campus: a bookmark stays, and comes off.
      const senalar = visor.getByRole('button', { name: 'Señalar esta página' });
      await senalar.click();
      assert.equal(await senalar.getAttribute('aria-pressed'), 'true', 'un resumen guarda sus señaladores');
      await senalar.click();
      assert.equal(await senalar.getAttribute('aria-pressed'), 'false');
      await visor.getByRole('button', { name: 'Cerrar' }).click();
      await visor.waitFor({ state: 'detached' });
      await pagina.waitForFunction(() => document.activeElement?.textContent === 'Resumen del 1° parcial');

      // An HTML in a frame where nothing runs; its links go out in another tab.
      await banco.getByRole('button', { name: 'Final con teoría', exact: true }).click();
      const marco = pagina.frameLocator('dialog.visor iframe');
      await marco.getByRole('heading', { name: 'Semáforos y monitores' }).waitFor();
      assert.equal(await visor.locator('iframe').getAttribute('sandbox'), 'allow-same-origin allow-popups allow-popups-to-escape-sandbox');
      assert.equal(await marco.getByRole('link', { name: 'la UTN' }).getAttribute('target'), '_blank');
      assert.equal(await marco.getByRole('link', { name: 'salto al final' }).getAttribute('href'), 'about:srcdoc#final');
      await pagina.waitForTimeout(200);
      assert.equal(await pagina.title(), titulo, 'nada del resumen corre');
      await foto('visor-html');
      await pagina.keyboard.press('Escape');
      await visor.waitFor({ state: 'detached' });

      // A Word: the text El Santo Resumen takes out, and that it goes on in the file.
      await banco.getByRole('button', { name: 'Memoria virtual en Word', exact: true }).click();
      await visor.getByText('Paginación por demanda con TLB.', { exact: false }).waitFor();
      await visor.getByText('Es solo el comienzo del texto, sin formato. Bajalo para verlo entero.').waitFor();
      await foto('visor-word');
      await visor.getByRole('button', { name: 'Cerrar' }).click();
      assert.deepEqual(aLeer().map((p) => new URL(p.url).searchParams.get('a')), ['bajar', 'ver', 'vista'], 'cada uno se pide una vez');

      // One whose scripts El Santo Resumen lets run: its original goes to El Santo Resumen's reader, in another address,
      // and comes up made by its scripts. Nothing of it reaches this page.
      SANTO_BANCO[1].js = true;
      // The bank is kept in memory for the visit: a new one brings it with its scripts turned on.
      await ir('resumenes');
      await fila('Final con teoría').waitFor();
      await banco.getByLabel('Buscar').fill('semaforos');
      await banco.locator('mark', { hasText: 'semáforos' }).waitFor();
      await banco.getByRole('button', { name: 'Final con teoría', exact: true }).click();
      const lector = visor.locator('iframe.visor__marco--scripts');
      assert.equal(await lector.getAttribute('src'), 'https://demo.lutastudios.com/visor/');
      assert.equal(await lector.getAttribute('sandbox'), 'allow-scripts');
      await pagina.frameLocator('dialog.visor iframe.visor__marco--scripts').frameLocator('#m').getByText('Armado por sus scripts').waitFor();
      assert.equal(await visor.getByText('Tiene partes interactivas que andan solo en El Santo Resumen.').count(), 0);
      assert.equal(await pagina.title(), titulo, 'nada del resumen toca esta página');
      assert.ok(aLeer().some((p) => new URL(p.url).searchParams.get('js') === '1'), 'pide el original');
      await visor.getByRole('button', { name: 'Cerrar' }).click();
      await visor.waitFor({ state: 'detached' });
      SANTO_BANCO[1].js = false;
      await banco.getByLabel('Buscar').fill('');
      await fila('Memoria virtual en Word').waitFor();
      assert.ok(aLeer().every((p) => !p.cabeceras['x-utn-llave'] && !p.cabeceras.cookie), 'leer va sin llave ni cookies');

      // Linked: «me gusta» is a button, it answers at once and El Santo Resumen keeps it for the account.
      santoCvg.codigos.add(cvgCodigo(9));
      await ir(`resumenes#vincular=${cvgCodigo(9)}`);
      await pagina.getByText('Vinculado con santi.').waitFor();
      const gusta = (n) => fila('Resumen del 1° parcial').getByRole('button', { name: `${n} me gusta, Resumen del 1° parcial` });
      await gusta(4).waitFor();
      assert.equal(await gusta(4).getAttribute('aria-pressed'), 'false');
      const respuesta = () => pagina.waitForResponse((r) => r.url().includes('a=cvg-me-gusta') && r.request().method() === 'POST');
      await Promise.all([respuesta(), gusta(4).click()]);
      await gusta(5).waitFor();
      assert.equal(await gusta(5).getAttribute('aria-pressed'), 'true');
      const dado = aCvg().filter((p) => new URL(p.url).searchParams.get('a') === 'cvg-me-gusta').at(-1);
      assert.deepEqual(JSON.parse(dado.cuerpo), { id: SANTO_BANCO[0].id, si: true });
      assert.equal(dado.cabeceras['x-utn-llave'], CVG_LLAVE);
      await foto('banco-vinculado');

      // Back another day, it is still there. From the viewer it can be taken back.
      await pagina.reload();
      await gusta(5).waitFor();
      await pagina.waitForFunction(() => document.querySelector('.megusta[aria-pressed="true"]'));
      await banco.getByRole('button', { name: 'Resumen del 1° parcial', exact: true }).click();
      await Promise.all([respuesta(), visor.getByRole('button', { name: '5 me gusta, Resumen del 1° parcial' }).click()]);
      await visor.getByRole('button', { name: '4 me gusta, Resumen del 1° parcial' }).waitFor();
      assert.equal(santoCvg.gustos.size, 0);
      await visor.getByRole('button', { name: 'Cerrar' }).click();
      assert.equal(await gusta(4).getAttribute('aria-pressed'), 'false');

      // One that is no longer in the bank says so, and the heart goes back.
      SANTO_BANCO[0].id = '0b6f2a8e-1c11-4d0a-9a51-2f6a8b1c0d09';
      await gusta(4).click();
      await pagina.getByText('Ese resumen ya no está en el banco.').waitFor();
      assert.equal(await gusta(4).getAttribute('aria-pressed'), 'false');
      await boton('Salir').click();
      await pagina.getByLabel('Usuario').waitFor();
    } finally {
      SANTO_BANCO[0].id = '0b6f2a8e-1c11-4d0a-9a51-2f6a8b1c0d01';
      SANTO_BANCO[1].js = false;
      SANTO_BANCO.splice(SANTO_BANCO.indexOf(WORD), 1);
      santoCvg.gustos.clear();
      santoCvg.llaves.clear();
      santoCvg.codigos.clear();
      await pagina.setViewportSize({ width: 1280, height: 860 });
      await pagina.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('cl.santo.')).forEach((k) => localStorage.removeItem(k)));
    }
  });

  await prueba('Resúmenes: cada tarjeta con su hoja de fondo, la foto de su primera página o su carátula, y legible encima', async () => {
    const axe = AXE;
    const fallasAxe = async () => {
      await pagina.evaluate(axe);
      return pagina.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })).violations.map((v) => `${v.id}: ${v.nodes[0].target}`));
    };
    const banco = pagina.getByRole('region', { name: 'Banco de resúmenes' });
    const tarjeta = (titulo) => banco.getByRole('listitem').filter({ hasText: titulo });
    const aFotos = () => pedidos.filter((p) => p.url.startsWith(`${SANTO_SERVICIO}/storage/v1/object/public/fotos/`));
    const ROTA = '0b6f2a8e-1c11-4d0a-9a51-2f6a8b1c0d16';
    const EXTRA = [
      // In capitals, as the bank could send it: it is asked in lowercase and its text still finds it.
      { id: '0B6F2A8E-1C11-4D0A-9A51-2F6A8B1C0D03', materia: SO, instancia: 'parcial-2', titulo: 'Memoria virtual en Word', me_gusta: 2, autor: 'caro', tipo: 'docx' },
      { id: '0b6f2a8e-1c11-4d0a-9a51-2f6a8b1c0d04', materia: 'investigacion-operativa', instancia: 'parcial-1', titulo: 'Método simplex paso a paso', me_gusta: 5, autor: 'ana', tipo: 'google-docs' },
      ...[5, 6, 7, 8, 9].map((n) => ({ id: `0b6f2a8e-1c11-4d0a-9a51-2f6a8b1c0d1${n}`, materia: 'fisica-i', instancia: 'final', titulo: `Guía de física ${n}`, me_gusta: n, autor: 'beto', tipo: 'pdf', foto: fotoDe(`0b6f2a8e-1c11-4d0a-9a51-2f6a8b1c0d1${n}`) })),
      // A photo from somewhere else is no photo.
      { id: '0b6f2a8e-1c11-4d0a-9a51-2f6a8b1c0d20', materia: 'fisica-i', instancia: 'parcial-1', titulo: 'Foto de otro lado', me_gusta: 0, autor: 'beto', tipo: 'pdf', foto: { url: 'https://example.com/foto.jpg', ancho: 480, alto: 679 } },
    ];
    SANTO_BANCO.push(...EXTRA);
    // The whole page drawn (the cards out of view skip it), nothing out to the side and accessible, in both widths.
    const foto = async (nombre, { conAxe = true } = {}) => {
      for (const ancho of [1280, 390]) {
        await pagina.setViewportSize({ width: ancho, height: ancho === 390 ? 844 : 860 });
        await pagina.evaluate(() => document.fonts.ready);
        assert.equal(await pagina.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false, `${nombre} en ${ancho} se sale a lo ancho`);
        if (conAxe) assert.deepEqual(await fallasAxe(), [], `${nombre} en ${ancho}`);
        const alto = await pagina.evaluate(() => document.documentElement.scrollHeight);
        await pagina.setViewportSize({ width: ancho, height: alto });
        await pagina.waitForFunction(() => [...document.querySelectorAll('.hoja__foto')].every((i) => i.complete));
        await pagina.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        await pagina.screenshot({ path: path.join(CAPTURAS, `resumenes-tarjetas-${nombre}-${ancho}.png`) });
      }
      await pagina.setViewportSize({ width: 1280, height: 860 });
    };
    // What is read on each card, against what is right behind it: the title, the data, the mark and the buttons sit on
    // the opaque pocket, never on the sheet. The lowest contrast of the page.
    const legible = () => pagina.evaluate(() => {
      const canales = (c) => c.match(/[\d.]+/g).map(Number);
      const lineal = (v) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
      const luz = ([r, g, b]) => 0.2126 * lineal(r) + 0.7152 * lineal(g) + 0.0722 * lineal(b);
      const fondoDe = (el) => {
        for (let x = el; x; x = x.parentElement) {
          const c = canales(getComputedStyle(x).backgroundColor);
          if (c.length === 3 || c[3] === 1) return c;
        }
        return [255, 255, 255];
      };
      const problemas = [];
      let menor = Infinity;
      for (const li of document.querySelectorAll('.resumenes .resumen')) {
        for (const el of li.querySelectorAll('.resumen__titulo, .resumen__dato, .resumen__marca, .megusta, .resumen__quitar')) {
          const caja = el.getBoundingClientRect();
          const encima = document.elementFromPoint(caja.left + Math.min(6, caja.width / 2), caja.top + caja.height / 2);
          if (!encima?.closest('.resumen__cuerpo') || encima.closest('.hoja')) problemas.push(`${el.className} queda tapado`);
          const [a, b] = [luz(canales(getComputedStyle(el).color)), luz(fondoDe(el))].sort((x, y) => y - x);
          menor = Math.min(menor, (a + 0.05) / (b + 0.05));
        }
      }
      return { menor: Math.round(menor * 100) / 100, problemas };
    });
    const ajustar = async (ajustes, forzados = 'none') => {
      await pagina.evaluate((a) => localStorage.setItem('cl.ajustes', JSON.stringify(a)), ajustes);
      await pagina.emulateMedia({ forcedColors: forzados });
      await pagina.reload();
      await tarjeta('Resumen del 1° parcial').locator('.hoja[data-forma="foto"]').waitFor();
    };
    try {
      await ir('');
      await pagina.getByLabel('Usuario').fill('alumno');
      await pagina.getByLabel('Contraseña').fill(CONTRASENA);
      await boton('Entrar').click();
      await pagina.getByRole('heading', { name: 'Hola, Ana' }).waitFor();
      santoFotos.demora = 900;
      santoFotos.rotas.add(ROTA);
      await ir('resumenes');

      // While the photo comes, the cover; then the photo over it, at its size, hidden from screen readers.
      const hoja = tarjeta('Resumen del 1° parcial').locator('.hoja');
      await hoja.locator('.hoja__caratula').waitFor();
      assert.equal(await hoja.getAttribute('data-forma'), 'caratula');
      await hoja.and(pagina.locator('[data-forma="foto"]')).waitFor();
      santoFotos.demora = 0;
      assert.equal(await hoja.getAttribute('aria-hidden'), 'true');
      const imagen = hoja.locator('img.hoja__foto');
      assert.deepEqual(await imagen.evaluate((i) => [i.getAttribute('src'), i.alt, i.getAttribute('width'), i.getAttribute('height'), i.loading, i.referrerPolicy, i.naturalWidth]),
        [fotoDe(SANTO_BANCO[0].id).url, '', '480', '679', 'lazy', 'no-referrer', 480]);
      assert.equal(await hoja.locator('.hoja__caratula').evaluate((c) => getComputedStyle(c).visibility), 'hidden', 'la carátula queda debajo');
      assert.equal(await pagina.title(), 'Resúmenes | Super CVG');
      const alServicio = aFotos();
      assert.ok(alServicio.length >= 1);
      assert.deepEqual(alServicio.filter((p) => p.cabeceras.cookie || p.cabeceras.referer || p.cabeceras['x-utn-llave']), [], 'sin cookies, llave ni de dónde viene');
      assert.equal(pedidos.filter((p) => p.url.includes('?a=muestras')).length, 0, 'el comienzo del texto ya no se pide');

      // Without a photo (Google, an HTML without one, a photo from somewhere else): its cover, with the exam, the title
      // and the subject, and no image at all.
      const caratula = tarjeta('Método simplex paso a paso').locator('.hoja__caratula');
      await caratula.waitFor();
      assert.deepEqual(await caratula.locator('span').allTextContents(), ['1° parcial', 'Método simplex paso a paso', 'Investigación Operativa']);
      assert.equal(await tarjeta('Final con teoría').locator('.hoja').getAttribute('data-forma'), 'caratula');
      assert.equal(await tarjeta('Foto de otro lado').locator('.hoja img').count(), 0, 'una foto de otro lado ni se pide');

      // A photo that does not load leaves the cover, without saying anything.
      await pagina.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await tarjeta('Guía de física 9').locator('.hoja[data-forma="foto"]').waitFor();
      const rota = tarjeta('Guía de física 6').locator('.hoja');
      await pagina.waitForFunction((t) => [...document.querySelectorAll('.resumen')].find((li) => li.textContent.includes(t))?.querySelector('.hoja img') === null, 'Guía de física 6');
      assert.equal(await rota.getAttribute('data-forma'), 'caratula');
      assert.equal(await pagina.getByRole('alert').filter({ hasText: /\S/ }).count(), 0, 'no dice nada');
      assert.ok(!aFotos().some((p) => p.url.includes('example.com')));

      // With a mouse, the sheet comes a little out of the pocket; with less motion it stays.
      const corrida = () => hoja.evaluate((h) => getComputedStyle(h).translate);
      await pagina.mouse.move(0, 0);
      await tarjeta('Resumen del 1° parcial').hover();
      await pagina.waitForTimeout(400);
      assert.match(await corrida(), /-6px$/, 'la hoja asoma más');
      await pagina.emulateMedia({ reducedMotion: 'reduce' });
      await pagina.mouse.move(0, 0);
      await tarjeta('Resumen del 1° parcial').hover();
      assert.doesNotMatch(await corrida(), /-6px$/, 'con menos movimiento la hoja queda quieta');
      await pagina.emulateMedia({ reducedMotion: 'no-preference' });
      await pagina.mouse.move(0, 0);

      // Read on top in every look: light, dark, high contrast and the colors of the system.
      for (const [nombre, ajustes, forzados] of [
        ['claro', { tema: 'claro' }],
        ['oscuro', { tema: 'oscuro' }],
        ['alto-contraste', { tema: 'claro', contraste: 'alto' }],
        ['alto-contraste-oscuro', { tema: 'oscuro', contraste: 'alto' }],
        ['colores-forzados', { tema: 'claro' }, 'active'],
      ]) {
        await ajustar(ajustes, forzados);
        const alto = await pagina.evaluate(() => document.documentElement.scrollHeight);
        await pagina.setViewportSize({ width: 1280, height: alto });
        await pagina.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        const { menor, problemas } = await legible();
        await pagina.setViewportSize({ width: 1280, height: 860 });
        assert.deepEqual(problemas, [], nombre);
        assert.ok(menor >= 4.5, `${nombre}: el menor contraste es ${menor}`);
        console.log(`      contraste mínimo en las tarjetas, ${nombre}: ${menor}`);
        if (nombre === 'oscuro') assert.match(await hoja.evaluate((h) => getComputedStyle(h).filter), /brightness\(0\.86\)/, 'de noche, un poco más apagada');
        if (nombre === 'claro' || nombre === 'oscuro') await foto(nombre);
        if (forzados) await foto(nombre, { conAxe: false });
      }
      await ajustar({ tema: 'claro' });

      await boton('Salir').click();
      await pagina.getByLabel('Usuario').waitFor();
    } finally {
      santoFotos.demora = 0;
      santoFotos.rotas.clear();
      for (const r of EXTRA) SANTO_BANCO.splice(SANTO_BANCO.indexOf(r), 1);
      await pagina.emulateMedia({ forcedColors: 'none', reducedMotion: 'no-preference' });
      await pagina.setViewportSize({ width: 1280, height: 860 });
      await pagina.evaluate(() => localStorage.removeItem('cl.ajustes')).catch(() => {});
    }
  });

  await prueba('Tareas: se abre desde Hoy, se ve la consigna y la calificada, y se entrega solo después de preguntar', async () => {
    const axe = AXE;
    const fallasAxe = async () => {
      await pagina.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))));
      await pagina.evaluate(axe);
      return pagina.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })).violations.map((v) => `${v.id}: ${v.nodes[0].target}`));
    };
    const seSale = () => pagina.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    const revisarAnchos = async (nombre) => {
      for (const ancho of [1280, 390]) {
        await pagina.setViewportSize({ width: ancho, height: ancho === 390 ? 844 : 860 });
        assert.equal(await seSale(), false, `${nombre} en ${ancho} se sale a lo ancho`);
        assert.deepEqual(await fallasAxe(), [], `${nombre} en ${ancho}`);
        await pagina.screenshot({ path: path.join(CAPTURAS, `${nombre}-${ancho}.png`), fullPage: true });
      }
      await pagina.setViewportSize({ width: 1280, height: 860 });
    };
    const UPLOAD = `${CAMPUS}/webservice/upload.php`;
    const funcionDe = (p) => (p.url.startsWith(UPLOAD) ? 'upload' : new URLSearchParams(p.cuerpo).get('wsfunction'));
    const deTareas = (desde) => pedidos.slice(desde).filter((p) => { const f = funcionDe(p); return f === 'upload' || f?.startsWith('mod_assign_'); });
    const escrituras = (desde) => deTareas(desde).filter((p) => !funcionDe(p).includes('_get_'));
    const cuerpoDe = (lista, funcion) => Object.fromEntries(new URLSearchParams(lista.find((p) => funcionDe(p) === funcion).cuerpo));
    const ficha = pagina.locator('.tarea-campus__estado');
    const formulario = pagina.locator('form.entrega');
    const pregunta = pagina.getByRole('dialog');
    const inicio = pedidos.length;
    try {
      // From Hoy, the task opens its page here, with the instructions, the date and where it is.
      await ir('');
      // With a session from the test before, or entering now (Resúmenes ends with «Salir»).
      const usuario = pagina.getByLabel('Usuario');
      await pagina.getByRole('heading', { name: 'Hola, Ana' }).or(usuario).first().waitFor();
      if (await usuario.isVisible()) {
        await usuario.fill('alumno');
        await pagina.getByLabel('Contraseña').fill(CONTRASENA);
        await boton('Entrar').click();
        await pagina.getByRole('heading', { name: 'Hola, Ana' }).waitFor();
      }
      await pagina.locator('a[href$="/materias/1/tareas/2"]', { hasText: 'TP próximo' }).first().click();
      await pagina.getByRole('heading', { name: 'TP próximo', level: 1 }).waitFor();
      assert.match(pagina.url(), /\/materias\/1\/tareas\/2$/);
      await pagina.getByRole('region', { name: 'Consigna' }).getByText('Resolvé los ejercicios de la').waitFor();
      await pagina.getByRole('region', { name: 'Consigna' }).getByText('guia-2').first().waitFor();
      assert.equal(await ficha.locator('.chip-tarea').innerText(), 'Sin entregar');
      assert.match(await ficha.locator('.tarea-campus__grande').innerText(), /^Vence en /);
      await ficha.locator('dt', { hasText: 'Vence' }).waitFor();
      await pagina.getByText('Este trabajo es mío, salvo donde cité el de otras personas.').waitFor();
      const lecturas = deTareas(inicio).map(funcionDe);
      assert.deepEqual([...new Set(lecturas)], ['mod_assign_get_assignments', 'mod_assign_get_submission_status']);
      assert.equal(new URLSearchParams(deTareas(inicio)[0].cuerpo).get('courseids[0]'), '1');
      assert.equal(new URLSearchParams(deTareas(inicio).find((p) => funcionDe(p) === 'mod_assign_get_submission_status').cuerpo).get('assignid'), String(TAREA_PENDIENTE));

      // A file of a kind it does not take: the error goes next to that file, with the statement's, and nothing is asked.
      await formulario.getByLabel('Texto').fill('Resolví los cinco ejercicios.\n\nEl tercero, con el método de la guía.');
      await formulario.locator('input[type=file]').setInputFiles([
        { name: 'desarrollo.pdf', mimeType: 'application/pdf', buffer: pdfMinimo() },
        { name: 'foto.png', mimeType: 'image/png', buffer: PNG },
      ]);
      await formulario.getByRole('button', { name: 'Entregar', exact: true }).click();
      const foto = formulario.locator('li.entrega__archivo', { hasText: 'foto.png' });
      await foto.getByRole('alert').getByText('Esta tarea no acepta este tipo de archivo. Va en PDF o DOCX.').waitFor();
      assert.equal(await foto.getByRole('button', { name: 'Sacar foto.png' }).getAttribute('data-error'), '');
      await formulario.getByText('Para entregarla tenés que aceptar la declaración.').waitFor();
      assert.equal(await formulario.locator('li.entrega__archivo', { hasText: 'desarrollo.pdf' }).getByRole('alert').count(), 0);
      assert.equal(await pregunta.count(), 0, 'con errores no pregunta');
      await revisarAnchos('tarea-con-error');
      assert.equal(escrituras(inicio).length, 0, 'con errores no se manda nada');

      // Asking first: «Volver» sends nothing.
      await foto.getByRole('button', { name: 'Sacar foto.png' }).click();
      await foto.waitFor({ state: 'detached' });
      await pagina.getByLabel('Acepto la declaración').check();
      await formulario.getByRole('button', { name: 'Entregar', exact: true }).click();
      await pregunta.getByText('¿Entregar TP próximo?').waitFor();
      await pregunta.getByText('Se envía para calificar y después ya no la podés cambiar.').waitFor();
      await pregunta.getByRole('button', { name: 'Volver' }).click();
      await pregunta.waitFor({ state: 'detached' });
      assert.equal(escrituras(inicio).length, 0, 'sin confirmar no se manda nada');

      // Confirmed: the file up to a draft, the submission saved with it and the text, sent to be graded, and the new state.
      await formulario.getByRole('button', { name: 'Entregar', exact: true }).click();
      const antes = pedidos.length;
      await pregunta.getByRole('button', { name: 'Entregar' }).click();
      await pagina.getByText('Entregaste TP próximo').waitFor();
      await pagina.locator('.tarea-campus__estado[data-estado="entregada"]').waitFor();
      assert.equal(await ficha.locator('.chip-tarea').innerText(), 'Entregada');
      await pagina.locator('.tarea-campus__hoja').getByText('El tercero, con el método de la guía.').waitFor();
      await pagina.getByRole('region', { name: 'Tu entrega' }).getByText('desarrollo').first().waitFor();
      await pagina.getByText('Ya la enviaste para calificar. Para cambiarla, el docente la tiene que habilitar de nuevo.').waitFor();
      assert.equal(await formulario.count(), 0);

      const lista = deTareas(antes);
      const orden = lista.map(funcionDe);
      assert.deepEqual(orden.slice(0, 3), ['upload', 'mod_assign_save_submission', 'mod_assign_submit_for_grading'], orden.join(' '));
      assert.ok(orden.length > 3 && orden.slice(3).every((f) => f === 'mod_assign_get_submission_status'), orden.join(' '));
      const subida = lista[0];
      assert.equal(subida.metodo, 'POST');
      assert.equal(subida.url, UPLOAD, 'upload.php sin nada en la dirección');
      assert.ok(subida.cuerpo.includes(TOKEN) && !subida.url.includes(TOKEN), 'la clave va en el cuerpo de upload.php');
      const campo = (nombre) => subida.cuerpo.split(`name="${nombre}"\r\n\r\n`)[1]?.split('\r\n')[0];
      assert.deepEqual([campo('token'), campo('filearea'), campo('itemid'), campo('filepath')], [TOKEN, 'draft', '0', '/']);
      assert.match(subida.cuerpo, /name="file_1"; filename="desarrollo\.pdf"/);
      assert.ok(!subida.cuerpo.includes('foto.png'), 'el archivo sacado no sube');
      const borrador = [...borradoresSimulados.keys()][0];
      const guardar = cuerpoDe(lista, 'mod_assign_save_submission');
      assert.equal(guardar.wstoken, TOKEN);
      assert.equal(guardar.assignmentid, String(TAREA_PENDIENTE));
      assert.equal(guardar['plugindata[onlinetext_editor][text]'], '<p>Resolví los cinco ejercicios.</p><p>El tercero, con el método de la guía.</p>');
      assert.equal(guardar['plugindata[onlinetext_editor][format]'], '1');
      assert.equal(guardar['plugindata[onlinetext_editor][itemid]'], '0');
      assert.equal(guardar['plugindata[files_filemanager]'], String(borrador));
      const enviar = cuerpoDe(lista, 'mod_assign_submit_for_grading');
      assert.deepEqual([enviar.assignmentid, enviar.acceptsubmissionstatement], [String(TAREA_PENDIENTE), '1']);
      assert.equal(lista.filter((p) => funcionDe(p) === 'upload').length, 1, 'cada archivo sube una vez');
      assert.deepEqual(entregaSimulada.archivos.map((f) => f.filename), ['desarrollo.pdf']);

      // The graded one: the grade, the teacher's comment and what was handed in, without a form.
      await ir('materias/1/tareas/18');
      await pagina.getByRole('heading', { name: 'TP 1 corregido', level: 1 }).waitFor();
      assert.equal(await ficha.locator('.chip-tarea').innerText(), 'Calificada');
      assert.match(await ficha.locator('.tarea-campus__grande').innerText(), /Nota\s+8,00 \/ 10,00/);
      await pagina.getByRole('region', { name: 'Devolución' }).getByText('Muy bien el planteo. En el ejercicio 3 faltó justificar el último paso.').waitFor();
      await pagina.getByRole('region', { name: 'Tu entrega' }).getByText('Adjunto el desarrollo del TP 1.').waitFor();
      await pagina.getByRole('region', { name: 'Tu entrega' }).getByText('tp1').first().waitFor();
      assert.equal(await formulario.count(), 0);
      assert.equal(await pagina.getByRole('button', { name: 'Cambiar la entrega' }).count(), 0);
      await revisarAnchos('tarea-calificada');

      const disco = await pagina.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
      assert.ok(!disco.includes('Resolví') && !disco.includes('TP 1 corregido') && !disco.includes('Muy bien el planteo'), 'la tarea no toca el disco');
    } finally {
      Object.assign(entregaSimulada, { estado: 'new', texto: '', archivos: [], modificado: 0 });
      borradoresSimulados.clear();
      await pagina.setViewportSize({ width: 1280, height: 860 });
      // If it failed with something written, leaving asks first: say yes, so the next test starts clean.
      const salir = (d) => d.accept().catch(() => {});
      pagina.on('dialog', salir);
      await ir('').catch(() => {});
      pagina.off('dialog', salir);
    }
  });

  await prueba('Cuestionarios: se abren desde Hoy y la materia, con intentos, nota y revisión, solo leyendo, y lo cerrado se dice', async () => {
    const axe = AXE;
    const fallasAxe = async () => {
      await pagina.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))));
      await pagina.evaluate(axe);
      return pagina.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })).violations.map((v) => `${v.id}: ${v.nodes[0].target}`));
    };
    const revisarAnchos = async (nombre) => {
      for (const ancho of [1280, 390]) {
        await pagina.setViewportSize({ width: ancho, height: ancho === 390 ? 844 : 860 });
        assert.equal(await pagina.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false, `${nombre} en ${ancho} se sale a lo ancho`);
        assert.deepEqual(await fallasAxe(), [], `${nombre} en ${ancho}`);
        await pagina.screenshot({ path: path.join(CAPTURAS, `${nombre}-${ancho}.png`), fullPage: true });
      }
      await pagina.setViewportSize({ width: 1280, height: 860 });
    };
    const funcionDe = (p) => new URLSearchParams(p.cuerpo).get('wsfunction');
    const deCuestionarios = (desde) => pedidos.slice(desde).map(funcionDe).filter((f) => f?.startsWith('mod_quiz_'));
    const ficha = pagina.locator('.cuestionario__ficha');
    const inicio = pedidos.length;
    parcialEnHoy = true;
    try {
      // From Hoy, the quiz opens its page here: the grade, the attempts left, the feedback and the way to the campus.
      await ir('');
      const usuario = pagina.getByLabel('Usuario');
      await pagina.getByRole('heading', { name: 'Hola, Ana' }).or(usuario).first().waitFor();
      if (await usuario.isVisible()) {
        await usuario.fill('alumno');
        await pagina.getByLabel('Contraseña').fill(CONTRASENA);
        await boton('Entrar').click();
        await pagina.getByRole('heading', { name: 'Hola, Ana' }).waitFor();
      }
      // Graded, it was marked as done by itself when its preview opened before (una actividad…): it waits in «Lo que ya
      // hiciste». Unmarked, it's back in Hoy, and opening it again doesn't mark it: what the student unmarked stays so.
      // Its row there opens it as it is, without unmarking it first.
      await pagina.locator('details.hechas > summary').click();
      await pagina.locator('details.hechas a.hechas__abrir[href$="/materias/1/cuestionarios/15"]', { hasText: 'Parcial' }).first().click();
      await pagina.getByRole('heading', { name: 'Parcial', level: 1 }).waitFor();
      await pagina.goBack();
      await pagina.locator('details.hechas > summary').click();
      await pagina.getByRole('button', { name: 'Desmarcar Parcial' }).first().click();
      await pagina.locator('a[href$="/materias/1/cuestionarios/15"]', { hasText: 'Parcial' }).first().click();
      await pagina.getByRole('heading', { name: 'Parcial', level: 1 }).waitFor();
      assert.match(pagina.url(), /\/materias\/1\/cuestionarios\/15$/);
      assert.equal(await ficha.locator('.chip-tarea').innerText(), 'Calificado');
      assert.match(await ficha.locator('.tarea-campus__grande').innerText(), /Nota\s+5,00 \/ 10,00/);
      for (const dato of ['30 minutos', 'Hiciste 1 de 2', 'La nota más alta', '6,00']) await ficha.locator('dd', { hasText: dato }).waitFor();
      const hacer = ficha.getByRole('link', { name: /^Hacer otro intento/ });
      assert.equal(await hacer.getAttribute('href'), `${CAMPUS}/mod/quiz/view.php?id=15`);
      assert.equal(await hacer.getAttribute('target'), '_blank');
      await pagina.getByRole('region', { name: 'Devolución' }).getByText('Repasá la unidad 2 antes del final.').waitFor();
      await pagina.getByRole('region', { name: 'Consigna' }).getByText('Tenés 30 minutos desde que empezás.', { exact: false }).waitFor();
      const intentos = pagina.getByRole('region', { name: 'Tus intentos' });
      await intentos.getByRole('heading', { name: 'Intento 1' }).waitFor();
      await intentos.locator('dd', { hasText: '23 minutos' }).waitFor();
      await intentos.locator('dd', { hasText: '5,00 / 10,00' }).waitFor();
      assert.doesNotMatch(await pagina.title(), /Parcial/, 'el nombre no va en el título');
      await revisarAnchos('cuestionario');
      assert.deepEqual([...new Set(deCuestionarios(inicio))].sort(), ['mod_quiz_get_quiz_access_information', 'mod_quiz_get_quiz_feedback_for_grade', 'mod_quiz_get_quizzes_by_courses', 'mod_quiz_get_user_attempts', 'mod_quiz_get_user_best_grade']);

      // The review: each question with the answer in the highlighter, its mark, the right answer and the feedback.
      const antes = pedidos.length;
      await intentos.getByRole('link', { name: 'Ver la revisión del intento 1' }).click();
      await pagina.getByRole('heading', { name: 'Revisión del intento 1', level: 1 }).waitFor();
      assert.match(pagina.url(), /\/materias\/1\/cuestionarios\/15\/intentos\/7151$/);
      assert.deepEqual(deCuestionarios(antes), ['mod_quiz_get_attempt_review'], 'la revisión pide solo la revisión');
      const revision = new URLSearchParams(pedidos.slice(antes).find((p) => funcionDe(p) === 'mod_quiz_get_attempt_review').cuerpo);
      assert.deepEqual([revision.get('attemptid'), revision.get('page')], ['7151', '-1']);
      await pagina.locator('.revision__resumen .tarea-campus__grande', { hasText: '5,00 / 10,00' }).waitFor();
      const p1 = pagina.getByRole('region', { name: 'Pregunta 1' });
      await p1.getByText('Correcta, 1,00 de 1,00').waitFor();
      await p1.locator('.alternativa[data-elegida]').getByText('a. Exclusión mutua').waitFor();
      assert.equal(await p1.getByText('Tu respuesta es correcta.').count(), 0, 'lo que repite la marca no se muestra');
      const p2 = pagina.getByRole('region', { name: 'Pregunta 2' });
      await p2.getByText('Incorrecta, 0,00 de 1,00').waitFor();
      await p2.locator('.alternativa[data-elegida]').getByText('Tu respuesta, incorrecta').waitFor();
      await p2.locator('.pregunta__correcta').getByText('Falso', { exact: true }).waitFor();
      await p2.getByText('Le queda su entrada hasta que el padre lea su estado.').waitFor();
      const p3 = pagina.getByRole('region', { name: 'Pregunta 3' });
      await p3.getByText('Parcialmente correcta, 0,50 de 1,00').waitFor();
      await p3.locator('.respuesta__valor', { hasText: 'clone' }).waitFor();
      await p3.locator('.pregunta__correcta').getByText('fork', { exact: true }).waitFor();
      // The sheet of marks goes to each question, with nothing in the address.
      const mapa = pagina.getByRole('navigation', { name: 'Preguntas' });
      assert.equal(await mapa.getByRole('link').count(), 3);
      await mapa.getByRole('link', { name: 'Pregunta 3, parcialmente correcta' }).click();
      await pagina.waitForFunction(() => document.activeElement?.id === 'pregunta-3');
      assert.doesNotMatch(pagina.url(), /#/);
      await revisarAnchos('cuestionario-revision');

      // From the course: the row opens the preview with where the student is, and from there the page.
      await ir('materias/1');
      // By its name: «Planilla» may carry «parcial» too, once the visto y parcial test added it there.
      await pagina.locator('.fila__principal').and(pagina.getByRole('button', { name: /^Parcial\b/ })).click();
      const previa = pagina.getByRole('dialog');
      await previa.locator('.chip-tarea', { hasText: 'Calificado' }).waitFor();
      await previa.getByText('Nota 5,00 / 10,00').waitFor();
      await previa.getByRole('link', { name: 'Ver el cuestionario' }).click();
      await pagina.getByRole('heading', { name: 'Parcial', level: 1 }).waitFor();
      await previa.waitFor({ state: 'detached' });

      // Review and grade only once it closes: said plainly, and that review is not even asked for.
      const antesCerrada = pedidos.length;
      await ir('materias/2/cuestionarios/21');
      await pagina.getByRole('heading', { name: 'Práctica', level: 1 }).waitFor();
      assert.equal(await ficha.locator('.chip-tarea').innerText(), 'Hecho');
      await ficha.getByText(/^La nota se ve cuando cierre, el /).waitFor();
      await ficha.getByText('Ya hiciste tu intento.').waitFor();
      await ficha.getByText('Pide una contraseña').waitFor();
      assert.equal(await ficha.getByRole('link', { name: /^Hacer/ }).count(), 0);
      const cerrada = pagina.getByRole('region', { name: 'Tus intentos' });
      await cerrada.getByText(/^La revisión abre cuando cierre el cuestionario, el /).waitFor();
      await cerrada.getByText('Se ve cuando cierre').waitFor();
      assert.equal(await cerrada.getByRole('link', { name: /Ver la revisión/ }).count(), 0);
      await revisarAnchos('cuestionario-cerrado');
      await ir('materias/2/cuestionarios/21/intentos/7211');
      await pagina.getByRole('heading', { name: 'Revisión del intento 1', level: 1 }).waitFor();
      await pagina.getByText(/^La revisión abre cuando cierre el cuestionario, el /).waitFor();
      assert.ok(!deCuestionarios(antesCerrada).includes('mod_quiz_get_attempt_review'), 'no pide una revisión cerrada');

      // A campus that leaves its quizzes closed to the app: what there is, the way to the campus, and the session stays.
      cuestionariosCerrados = true;
      await ir('materias/2/cuestionarios/21');
      await pagina.getByText('El campus no deja ver este cuestionario desde Super CVG.').waitFor();
      await pagina.getByRole('heading', { name: 'Práctica', level: 1 }).waitFor();
      assert.equal(await pagina.getByRole('link', { name: /^Abrir en el campus/ }).getAttribute('href'), `${CAMPUS}/mod/quiz/view.php?id=21`);
      await ir('materias/2');
      await fila('Práctica').click();
      await pagina.getByRole('dialog').getByRole('link', { name: /^Abrir en el campus/ }).waitFor();
      await pagina.getByRole('dialog').locator('.tarea-previa__esqueleto').waitFor({ state: 'detached' });
      assert.equal(await pagina.getByRole('dialog').getByRole('link', { name: 'Ver el cuestionario' }).count(), 0);
      await boton('Cerrar').click();
      assert.equal(await pagina.getByLabel('Usuario').count(), 0, 'la sesión sigue');

      // Reading only, and nothing of it on disk.
      const todas = deCuestionarios(inicio);
      assert.ok(todas.length && todas.every((f) => f.startsWith('mod_quiz_get_')), todas.join(' '));
      const disco = await pagina.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
      assert.ok(!disco.includes('semáforo binario') && !disco.includes('Repasá la unidad 2') && !disco.includes('clone'), 'el cuestionario no toca el disco');
    } finally {
      parcialEnHoy = false;
      cuestionariosCerrados = false;
      await pagina.setViewportSize({ width: 1280, height: 860 });
    }
  });

  await prueba('Mensajes: el sobre avisa, abrir la marca leída, Enter manda una sola vez y lo que no salió se prueba de nuevo', async () => {
    const axe = AXE;
    const fallasAxe = async () => {
      await pagina.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))));
      await pagina.evaluate(axe);
      return pagina.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })).violations.map((v) => `${v.id}: ${v.nodes[0].target}`));
    };
    const seSale = () => pagina.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    const SERVIDOR = `${CAMPUS}/webservice/rest/server.php`;
    const funcionDe = (p) => (p.url === SERVIDOR ? new URLSearchParams(p.cuerpo).get('wsfunction') : null);
    const delCampus = (desde, funcion) => pedidos.slice(desde).filter((p) => funcionDe(p) === funcion);
    const valores = (p, ...claves) => claves.map((k) => new URLSearchParams(p.cuerpo).get(k));
    const ESCRIBEN = ['core_message_send_messages_to_conversation', 'core_message_send_instant_messages'];
    const envios = (desde) => pedidos.slice(desde).filter((p) => ESCRIBEN.includes(funcionDe(p)));
    const pregunta = pagina.getByRole('dialog');
    const escribir = pagina.locator('form.mensajes__escribir');
    const mandarDeAbajo = escribir.getByRole('button', { name: 'Mandar' });
    const filas = pagina.locator('.mensajes__conversacion-fila');
    const enviado = (texto) => pagina.locator('.mensajes__burbuja[data-mio]:not([data-estado])', { hasText: texto });
    const inicio = pedidos.length;
    try {
      // Two unread messages of the teacher: the envelope says so, with the number, and the count goes with the student.
      charlasSimuladas.get(801).noLeidos = 2;
      await ir('');
      // With a session from the test before, or entering now.
      const usuario = pagina.getByLabel('Usuario');
      await pagina.getByRole('heading', { name: 'Hola, Ana' }).or(usuario).first().waitFor();
      if (await usuario.isVisible()) {
        await usuario.fill('alumno');
        await pagina.getByLabel('Contraseña').fill(CONTRASENA);
        await boton('Entrar').click();
        await pagina.getByRole('heading', { name: 'Hola, Ana' }).waitFor();
      }
      const sobre = pagina.getByRole('link', { name: 'Mensajes, 1 sin leer', exact: true });
      await sobre.waitFor();
      assert.equal(await pagina.locator('.cabecera__numero').innerText(), '1');
      assert.deepEqual(valores(delCampus(inicio, 'core_message_get_unread_conversations_count')[0], 'useridto'), [String(usuarioId)]);

      // The list: the teacher first, with her two unread and her picture; then the group.
      await sobre.click();
      await pagina.getByRole('heading', { name: 'Mensajes', level: 1 }).waitFor();
      await filas.first().waitFor();
      assert.deepEqual(await filas.evaluateAll((l) => l.map((f) => f.dataset.conversacion)), ['801', '802']);
      assert.equal(await filas.first().getAttribute('data-sin-leer'), 'true');
      assert.match(await filas.first().textContent(), /Laura Méndez.*Subí al aula el enunciado actualizado\..*2 sin leer/);
      assert.match(await filas.nth(1).textContent(), /Grupo 3.*MA.*Vos: Dale, después de clase\./);
      assert.deepEqual(valores(delCampus(inicio, 'core_message_get_conversations')[0], 'userid', 'limitfrom', 'limitnum'), [String(usuarioId), '0', '21']);
      await filas.first().locator('img').waitFor();
      const foto = pedidos.slice(inicio).find((p) => p.url.startsWith(`${CAMPUS}/webservice/pluginfile.php/301/user/icon/`));
      assert.ok(foto && foto.metodo === 'POST' && foto.cuerpo.includes(TOKEN) && !foto.url.includes(TOKEN), 'la foto, con la clave en el cuerpo');

      // Opening it shows the messages, and marks it as read in the campus, once and without asking.
      const antesDeAbrir = pedidos.length;
      await filas.first().getByRole('button').click();
      await pagina.getByRole('heading', { name: 'Laura Méndez', level: 2 }).waitFor();
      await pagina.getByText('Sí, de hasta tres personas.').waitFor();
      await pagina.getByRole('link', { name: 'Mensajes', exact: true }).waitFor();
      await pagina.locator('.mensajes__conversacion-fila[data-conversacion="801"]:not([data-sin-leer])').waitFor();
      assert.equal(await pregunta.count(), 0, 'marcarla leída no pregunta');
      assert.deepEqual(valores(delCampus(antesDeAbrir, 'core_message_get_conversation_messages')[0], 'currentuserid', 'convid', 'limitfrom', 'limitnum', 'newest'), [String(usuarioId), '801', '0', '31', '1']);
      const marcadas = delCampus(antesDeAbrir, 'core_message_mark_all_conversation_messages_as_read');
      assert.equal(marcadas.length, 1);
      assert.deepEqual(valores(marcadas[0], 'userid', 'conversationid'), [String(usuarioId), '801']);
      assert.equal(charlasSimuladas.get(801).noLeidos, 0);

      // Shift and Enter makes a new line and sends nothing.
      const campo = escribir.getByLabel('Mensaje para Laura Méndez');
      await campo.fill('Gracias, profe.');
      await campo.press('Shift+Enter');
      await campo.pressSequentially('Ya lo vi.');
      assert.equal(await campo.inputValue(), 'Gracias, profe.\nYa lo vi.');
      assert.equal(envios(inicio).length, 0, 'Shift y Enter no manda');

      // Enter sends it at once, without asking, once, with the key and the text in the body. Enter again with the box
      // empty sends nothing.
      const antesDeMandar = pedidos.length;
      await campo.press('Enter');
      await enviado('Ya lo vi.').waitFor();
      await pagina.getByRole('status').filter({ hasText: 'Mensaje enviado' }).waitFor({ state: 'attached' });
      assert.equal(await pregunta.count(), 0, 'mandar no pregunta');
      assert.equal(await campo.inputValue(), '');
      await campo.press('Enter');
      await pagina.waitForTimeout(400);
      const salio = envios(antesDeMandar);
      assert.equal(salio.length, 1, 'sale una sola vez');
      assert.equal(salio[0].metodo, 'POST');
      assert.equal(salio[0].url, SERVIDOR, 'nada en la dirección');
      assert.deepEqual(valores(salio[0], 'wsfunction', 'wstoken', 'conversationid', 'messages[0][text]'), ['core_message_send_messages_to_conversation', TOKEN, '801', 'Gracias, profe.\nYa lo vi.']);
      assert.equal(new URLSearchParams(salio[0].cuerpo).has('messages[0][textformat]'), false, 'sin formato, como la página del campus');
      assert.equal(charlasSimuladas.get(801).mensajes.at(-1).text, '<p>Gracias, profe.<br>Ya lo vi.</p>');

      // With the button, an answer that comes back empty: it is looked up first, and only then «No salió.», with the text
      // kept. Tried again, it goes once more and shows once.
      fallaElProximoMensaje = true;
      const antesDelFallo = pedidos.length;
      await campo.fill('¿Hay consulta el viernes?');
      await mandarDeAbajo.click();
      const fallido = pagina.locator('.mensajes__burbuja[data-estado="fallo"]', { hasText: '¿Hay consulta el viernes?' });
      await fallido.getByText('No salió.').waitFor();
      await fallido.getByText('El campus no confirmó el mensaje.').waitFor();
      assert.equal(envios(antesDelFallo).length, 1);
      assert.ok(delCampus(antesDelFallo, 'core_message_get_conversation_messages').some((p) => valores(p, 'convid', 'limitnum').join() === '801,5'), 'se busca antes de decir que no salió');
      const antesDeProbar = pedidos.length;
      await fallido.getByRole('button', { name: 'Probar de nuevo' }).click();
      await enviado('¿Hay consulta el viernes?').waitFor();
      await fallido.waitFor({ state: 'detached' });
      assert.equal(envios(antesDeProbar).length, 1);
      assert.equal(await enviado('¿Hay consulta el viernes?').count(), 1);
      assert.equal(charlasSimuladas.get(801).mensajes.filter((m) => m.text.includes('consulta el viernes')).length, 1);

      // A message to someone new: the search goes with what was typed, and the campus opens the conversation.
      const antesDeBuscar = pedidos.length;
      await pagina.getByRole('button', { name: 'Mensaje nuevo' }).click();
      await pagina.getByLabel('¿A quién le escribís?').fill('mar');
      const personas = pagina.locator('button.mensajes__persona');
      await personas.filter({ hasText: 'Martina Gómez' }).waitFor();
      assert.deepEqual(await personas.locator('.mensajes__persona-nombre').allInnerTexts(), ['Martina Gómez', 'Mariano Quiroga']);
      assert.deepEqual(delCampus(antesDeBuscar, 'core_message_message_search_users').map((p) => valores(p, 'userid', 'search', 'limitfrom', 'limitnum')), [[String(usuarioId), 'mar', '0', '20']]);
      await personas.filter({ hasText: 'Martina Gómez' }).click();
      await pagina.getByRole('heading', { name: 'Martina Gómez', level: 2 }).waitFor();
      await pagina.getByText('Escribile a Martina Gómez.', { exact: true }).waitFor();
      const antesDelNuevo = pedidos.length;
      await escribir.getByLabel('Mensaje para Martina Gómez').fill('Hola, ¿me pasás los apuntes del jueves?');
      await mandarDeAbajo.click();
      await enviado('Hola, ¿me pasás los apuntes del jueves?').waitFor();
      await pagina.locator(`.mensajes__conversacion-fila[data-conversacion="${CHARLA_NUEVA}"]`).waitFor();
      const nuevo = envios(antesDelNuevo);
      assert.equal(nuevo.length, 1, 'el mensaje nuevo sale una sola vez');
      assert.equal(nuevo[0].url, SERVIDOR);
      assert.deepEqual(valores(nuevo[0], 'wsfunction', 'wstoken', 'messages[0][touserid]', 'messages[0][text]'), ['core_message_send_instant_messages', TOKEN, '43', 'Hola, ¿me pasás los apuntes del jueves?']);
      assert.equal(charlasSimuladas.get(CHARLA_NUEVA).mensajes.length, 1);

      // Wide and on a phone: nothing overflows and axe finds nothing. On the phone, a conversation and back to the list.
      assert.equal(await seSale(), false, 'mensajes en 1280 se sale a lo ancho');
      assert.deepEqual(await fallasAxe(), [], 'mensajes en 1280');
      await pagina.screenshot({ path: path.join(CAPTURAS, 'mensajes-1280.png'), fullPage: true });
      await pagina.setViewportSize({ width: 390, height: 844 });
      await pagina.locator('.mensajes[data-angosta]').waitFor();
      await filas.filter({ hasText: 'Laura Méndez' }).getByRole('button').click();
      await pagina.getByRole('heading', { name: 'Laura Méndez', level: 2 }).waitFor();
      await enviado('¿Hay consulta el viernes?').waitFor();
      assert.equal(await filas.count(), 0, 'en el celular, la conversación sola');
      assert.equal(await seSale(), false, 'mensajes en 390 se sale a lo ancho');
      assert.deepEqual(await fallasAxe(), [], 'mensajes en 390');
      await pagina.screenshot({ path: path.join(CAPTURAS, 'mensajes-390.png'), fullPage: true });
      await pagina.getByRole('button', { name: 'Volver', exact: true }).click();
      await pagina.getByRole('heading', { name: 'Mensajes', level: 1 }).waitFor();
      assert.equal(await pagina.evaluate(() => document.activeElement?.closest('[data-conversacion]')?.dataset.conversacion), '801', 'el foco vuelve a la fila');
      assert.equal(delCampus(inicio, 'core_message_mark_all_conversation_messages_as_read').length, 1, 'una leída se marca una vez');

      const disco = await pagina.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
      assert.ok(!disco.includes('Gracias, profe') && !disco.includes('Laura Méndez') && !disco.includes('apuntes del jueves'), 'los mensajes no tocan el disco');
    } finally {
      reiniciarCharlas();
      fallaElProximoMensaje = false;
      await pagina.setViewportSize({ width: 1280, height: 860 });
      await ir('').catch(() => {});
    }
  });

  await prueba('Mensajes con archivos: conectar el Drive, subir por partes aunque se corte, compartir con link, cancelar, Drive lleno, permiso vencido y links disfrazados', async () => {
    const axe = AXE;
    const fallasAxe = async () => {
      await pagina.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))));
      await pagina.evaluate(axe);
      return pagina.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })).violations.map((v) => `${v.id}: ${v.nodes[0].target}`));
    };
    const seSale = () => pagina.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    const SERVIDOR = `${CAMPUS}/webservice/rest/server.php`;
    const funcionDe = (p) => (p.url === SERVIDOR ? new URLSearchParams(p.cuerpo).get('wsfunction') : null);
    const textoMandado = (p) => new URLSearchParams(p.cuerpo).get('messages[0][text]');
    const envios = (desde) => pedidos.slice(desde).filter((p) => funcionDe(p) === 'core_message_send_messages_to_conversation');
    const aDrive = (desde) => pedidos.slice(desde).filter((p) => new URL(p.url).hostname === 'www.googleapis.com' && p.metodo !== 'OPTIONS');
    const escribir = pagina.locator('form.mensajes__escribir');
    const campo = escribir.getByLabel('Mensaje para Laura Méndez');
    const mandar = escribir.getByRole('button', { name: 'Mandar' });
    const adjuntar = escribir.getByRole('button', { name: 'Adjuntar un archivo' });
    // The browser's window to pick a file, opened from the paperclip (or from the button of the first time).
    const elegir = async (nombre, bytes, mimeType = 'application/pdf', desde = adjuntar) => {
      const [ventanita] = await Promise.all([pagina.waitForEvent('filechooser'), desde.click()]);
      await ventanita.setFiles({ name: nombre, mimeType, buffer: bytes });
    };
    const bytesDe = (n, semilla = 7) => Buffer.from(Array.from({ length: n }, (_, i) => (i * semilla + (i >> 9)) % 256));
    const tarjetas = pagina.locator('.mensajes__burbuja a.adjunto');
    const hilo = pagina.getByRole('region', { name: 'Mensajes con Laura Méndez' });
    const MB = 1024 * 1024;
    const RECIBIDO = '1GuiaDeLaProfeDePrueba00000000000';
    const LINK_RECIBIDO = `https://drive.google.com/file/d/${RECIBIDO}/view?usp=sharing`;
    const inicio = pedidos.length;
    try {
      // The teacher sent a file from Super CVG (the campus made its address a link), and two links dressed up as one: the
      // text says Drive and it goes elsewhere, and a site that only starts like Drive.
      charlasSimuladas.get(801).mensajes.push(
        { id: 9004, useridfrom: DOCENTE, text: `<p>Les dejo la guía.<br><br>Archivo adjunto: Guía 3.pdf (1,2 MB)<br><a href="${LINK_RECIBIDO}">${LINK_RECIBIDO}</a></p>`, timecreated: BASE - 1800 },
        { id: 9005, useridfrom: DOCENTE, text: `<p>Archivo adjunto: Notas finales.pdf (3 KB)<br><a href="https://otro.example/robar">https://drive.google.com/file/d/${RECIBIDO}/view</a></p>`, timecreated: BASE - 1700 },
        { id: 9006, useridfrom: DOCENTE, text: `<p>Archivo adjunto: Parcial resuelto.pdf (3 KB)<br>https://drive.google.com.otro.example/file/d/${RECIBIDO}/view</p>`, timecreated: BASE - 1600 },
      );
      await ir('');
      const usuario = pagina.getByLabel('Usuario');
      await pagina.getByRole('heading', { name: 'Hola, Ana' }).or(usuario).first().waitFor();
      if (await usuario.isVisible()) {
        await usuario.fill('alumno');
        await pagina.getByLabel('Contraseña').fill(CONTRASENA);
        await boton('Entrar').click();
        await pagina.getByRole('heading', { name: 'Hola, Ana' }).waitFor();
      }
      await pagina.getByRole('link', { name: /^Mensajes/ }).first().click();
      await pagina.locator('.mensajes__conversacion-fila[data-conversacion="801"] button').click();
      await pagina.getByRole('heading', { name: 'Laura Méndez', level: 2 }).waitFor();

      // Only the real one is a file: it opens Drive at the address built from its id, in another tab. The other two stay
      // as text, with their link as it is.
      await tarjetas.first().waitFor();
      assert.equal(await tarjetas.count(), 1, 'solo el de verdad es un archivo');
      assert.equal(await tarjetas.getAttribute('href'), LINK_RECIBIDO);
      assert.equal(await tarjetas.getAttribute('target'), '_blank');
      assert.match(await tarjetas.textContent(), /Guía 3\.pdf, 1,2\u00A0MB en Google Drive, se abre en otra pestaña/, 'el número y su unidad, siempre juntos');
      await hilo.getByText('Les dejo la guía.', { exact: true }).waitFor();
      await hilo.getByText('Archivo adjunto: Notas finales.pdf (3 KB)').waitFor();
      assert.equal(await pagina.locator('.mensajes__burbuja a[href="https://otro.example/robar"]:not(.adjunto)').count(), 1, 'el disfrazado queda como un link común');
      await hilo.getByText(`https://drive.google.com.otro.example/file/d/${RECIBIDO}/view`).waitFor();
      assert.match(await pagina.locator('.mensajes__conversacion-fila[data-conversacion="801"]').textContent(), /Archivo adjunto: Parcial resuelto\.pdf/);

      // Without Drive, the paperclip says where the file goes. Without Drive it goes locked to El Santo Resumen, the
      // message takes a link to Super CVG, and the card opens it here, in the preview.
      await adjuntar.click();
      const panel = escribir.getByRole('region', { name: 'Mandar un archivo' });
      const textoSinDrive = 'El campus no recibe archivos. Super CVG lo guarda 45 días y manda un link que se abre acá. Si conectás tu Google Drive, queda en tu Drive.';
      await panel.getByText(textoSinDrive).waitFor();
      assert.equal(await pagina.evaluate(() => document.activeElement?.textContent), 'Elegir el archivo');
      const antesSinDrive = pedidos.length;
      await elegir('Resumen sin Drive.pdf', pdfMinimo(), 'application/pdf', panel.getByRole('button', { name: 'Elegir el archivo' }));
      await escribir.locator('.mensajes__elegido').getByText(/Super CVG lo guarda 45 días/).waitFor();
      await mandar.click();
      const tarjetaSinDrive = hilo.locator('button.adjunto').filter({ hasText: 'Resumen sin Drive.pdf' });
      await tarjetaSinDrive.waitFor();
      const [mandado] = envios(antesSinDrive).map(textoMandado);
      assert.match(mandado, /^Archivo adjunto: Resumen sin Drive\.pdf \(\d+ KB\)\nhttps:\/\/supercvg\.lutastudios\.com\/archivo#[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/);
      const subido = temporalesSimulados.get(/#([0-9a-f-]{36})\./.exec(mandado)[1]);
      assert.ok(subido && !subido.includes(Buffer.from('%PDF')) && !subido.includes(Buffer.from('Resumen sin Drive')), 'al servicio va cifrado y sin el nombre');
      assert.deepEqual(pedidos.slice(antesSinDrive).filter((p) => /google/.test(new URL(p.url).hostname)).map((p) => p.url), [], 'nada a Google');
      assert.ok(!pedidos.slice(antesSinDrive).some((p) => p.url.includes(mandado.split('#')[1])), 'la llave no va a ningún lado');
      assert.match(await tarjetaSinDrive.textContent(), /Se abre acá hasta el/);
      await tarjetaSinDrive.click();
      const previaSinDrive = pagina.getByRole('dialog');
      await previaSinDrive.getByText('de 2', { exact: true }).waitFor();
      await pagina.keyboard.press('Escape');
      await previaSinDrive.waitFor({ state: 'hidden' });
      // From the campus, its link opens /archivo, which takes the key out of the address at once.
      await ir(`archivo#${mandado.split('#')[1]}`);
      await pagina.getByRole('heading', { name: 'Archivo de un mensaje', level: 1 }).waitFor();
      await pagina.getByText('Resumen sin Drive.pdf').waitFor();
      assert.equal(new URL(pagina.url()).hash, '', 'la llave sale de la dirección');
      assert.deepEqual(await fallasAxe(), [], 'archivo de un mensaje');
      await pagina.getByRole('link', { name: /^Mensajes/ }).first().click();
      await pagina.locator('.mensajes__conversacion-fila[data-conversacion="801"] button').click();
      await pagina.getByRole('heading', { name: 'Laura Méndez', level: 2 }).waitFor();

      // Or Google Drive, as before: Google is asked only for the files this app makes.
      await adjuntar.click();
      await panel.getByText(textoSinDrive).waitFor();
      const aGoogleAntes = pedidos.filter((p) => p.url.startsWith('https://accounts.google.com/')).length;
      const [ventana] = await Promise.all([pagina.waitForEvent('popup'), panel.getByRole('button', { name: 'Conectar Google Drive' }).click()]);
      await ventana.waitForEvent('close');
      await panel.getByRole('button', { name: 'Elegir el archivo' }).waitFor();
      assert.equal(await pagina.evaluate(() => document.activeElement?.textContent), 'Elegir el archivo');
      const permiso = new URL(pedidos.filter((p) => p.url.startsWith('https://accounts.google.com/')).slice(aGoogleAntes)[0].url).searchParams;
      assert.deepEqual(permiso.get('scope').split(' '), ['https://www.googleapis.com/auth/drive.file', 'openid', 'email'], 'pide solo los archivos que hace la app');
      assert.equal(permiso.get('include_granted_scopes'), 'true');
      assert.ok(!(await pagina.evaluate(() => `${sessionStorage.getItem('cl.google.usos')} ${localStorage.getItem('cl.google.usos')}`)).includes('adjuntos'), 'no queda como un uso prendido');

      // Too big: it says so, and nothing is chosen.
      await elegir('Todo el cuatrimestre.zip', Buffer.alloc(Math.round(26.3 * MB)), 'application/zip', panel.getByRole('button', { name: 'Elegir el archivo' }));
      await escribir.getByRole('alert').filter({ hasText: 'Ese archivo pesa 26,3 MB. El tope es de 25 MB.' }).waitFor();
      assert.equal(await escribir.locator('.mensajes__elegido').count(), 0);
      assert.equal(await pagina.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Adjuntar un archivo');

      // Dragged from a folder onto the conversation: the panel says where to drop it, and the file waits next to the
      // message. Of two files, the first one.
      await pagina.evaluate(() => {
        const dt = new DataTransfer();
        for (const n of ['Apunte.pdf', 'Otro.pdf']) dt.items.add(new File(['hola'], n, { type: 'application/pdf' }));
        window.arrastre = dt;
        document.querySelector('.mensajes__hilo').dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt }));
      });
      await pagina.locator('.mensajes__soltar').getByText('Soltalo para adjuntarlo').waitFor();
      await pagina.evaluate(() => {
        const hilo = document.querySelector('.mensajes__hilo');
        for (const tipo of ['dragover', 'drop']) hilo.dispatchEvent(new DragEvent(tipo, { bubbles: true, cancelable: true, dataTransfer: window.arrastre }));
        delete window.arrastre;
      });
      await escribir.locator('.mensajes__elegido').getByText('Apunte.pdf', { exact: true }).waitFor();
      await escribir.getByRole('alert').filter({ hasText: 'Va un archivo por mensaje. Quedó el primero.' }).waitFor();
      assert.equal(await pagina.locator('.mensajes__soltar').count(), 0);
      await escribir.locator('.mensajes__elegido').getByRole('button').click();
      assert.equal(await escribir.locator('.mensajes__elegido').count(), 0);

      // A file of 2,5 MB, with a name that hides letters and carries HTML: chosen, it says what happens with it. It goes
      // up in pieces, the second one is cut halfway, and it goes on from where Google stayed.
      const tp = bytesDe(2.5 * MB);
      await elegir('TP 2 <final>\u202E.pdf', tp);
      const elegido = escribir.locator('.mensajes__elegido');
      await elegido.getByText('TP 2 final.pdf', { exact: true }).waitFor();
      await elegido.getByText('2,5 MB. Se sube a tu Google Drive, en la carpeta «Super CVG». Cualquiera con el link lo puede ver. Lo borrás desde tu Drive.').waitFor();
      assert.equal(await campo.evaluate((el) => el === document.activeElement), true, 'el foco vuelve al mensaje');
      assert.equal(await escribir.getByRole('region', { name: 'Mandar un archivo' }).count(), 0);
      adjuntoSeCorta = 1;
      const antesDelTp = pedidos.length;
      await campo.fill('Te paso el TP.');
      await mandar.click();
      const tarjetaTp = tarjetas.filter({ hasText: 'TP 2 final.pdf' });
      await tarjetaTp.waitFor({ timeout: 20_000 });
      const carpetas = [...visiblesDrive].filter(([, f]) => f.mimeType === 'application/vnd.google-apps.folder');
      assert.equal(carpetas.length, 1, 'una carpeta');
      assert.equal(carpetas[0][1].name, 'Super CVG');
      const [idTp, archivoTp] = [...visiblesDrive].find(([, f]) => f.name === 'TP 2 final.pdf');
      assert.deepEqual(archivoTp.parents, [carpetas[0][0]], 'en la carpeta');
      assert.ok(archivoTp.bytes.equals(tp), 'llegó entero');
      assert.deepEqual(archivoTp.permisos, [{ role: 'reader', type: 'anyone', allowFileDiscovery: false }], 'cualquiera con el link, solo para ver');
      const salio = envios(antesDelTp);
      assert.equal(salio.length, 1, 'sale una sola vez');
      const LINK_TP = `https://drive.google.com/file/d/${idTp}/view?usp=sharing`;
      assert.equal(textoMandado(salio[0]), `Te paso el TP.\n\nArchivo adjunto: TP 2 final.pdf (2,5 MB)\n${LINK_TP}`);
      assert.equal(await tarjetaTp.getAttribute('href'), LINK_TP);
      const piezas = aDrive(antesDelTp).filter((p) => p.url.includes('upload_id=')).map((p) => p.cabeceras['content-range']);
      assert.deepEqual(piezas, [`bytes 0-${MB - 1}/${tp.length}`, `bytes ${MB}-${2 * MB - 1}/${tp.length}`, `bytes */${tp.length}`, `bytes ${1.5 * MB}-${2.5 * MB - 1}/${tp.length}`], 'sigue desde donde quedó');
      assert.equal(adjuntoSeCorta, 0);
      assert.deepEqual(aDrive(antesDelTp).filter((p) => p.cabeceras.authorization !== `Bearer ${GTOKEN}` || p.url.includes(GTOKEN) || p.cabeceras.cookie || p.cabeceras.referer), [], 'el permiso solo en la cabecera, sin cookies ni de dónde viene');
      assert.equal(await campo.inputValue(), '');
      assert.equal(await escribir.locator('.mensajes__elegido').count(), 0);
      assert.equal(await pagina.locator('.mensajes__conversacion-fila[data-conversacion="801"] .mensajes__ultimo').textContent(), ', Vos: Te paso el TP.');

      // Cancelled while it goes up: nothing goes to the campus, nothing stays in the Drive, and the text and the file come
      // back to the box.
      demoraTrozo = 1500;
      const antesDeCancelar = pedidos.length;
      const archivosAntes = visiblesDrive.size;
      await elegir('Apuntes.pdf', bytesDe(3 * MB, 11));
      await campo.fill('Este no.');
      await mandar.click();
      const saliendo = pagina.locator('.mensajes__burbuja[data-subiendo]');
      await saliendo.locator('.adjunto__dato', { hasText: /Subiendo a tu Drive, [0-9]/ }).waitFor();
      assert.equal(await saliendo.locator('progress').getAttribute('aria-label'), 'Subida de Apuntes.pdf');
      await saliendo.getByRole('button', { name: 'Cancelar el envío de Apuntes.pdf' }).click();
      await saliendo.waitFor({ state: 'detached' });
      await elegido.getByText('Apuntes.pdf', { exact: true }).waitFor();
      assert.equal(await campo.inputValue(), 'Este no.');
      await pagina.getByRole('status').filter({ hasText: 'Cancelaste el envío' }).waitFor({ state: 'attached' });
      demoraTrozo = 0;
      await pagina.waitForTimeout(1600);
      assert.equal(envios(antesDeCancelar).length, 0, 'no salió nada');
      assert.equal(visiblesDrive.size, archivosAntes, 'nada quedó en el Drive');
      await elegido.getByRole('button', { name: 'Sacar el archivo' }).click();
      assert.equal(await escribir.locator('.mensajes__elegido').count(), 0);
      await campo.fill('');

      // The Drive is full: it says so in the bubble, and once there is room, «Probar de nuevo» sends it.
      driveLleno = true;
      const antesDelLleno = pedidos.length;
      await elegir('foto del pizarrón.jpg', bytesDe(50 * 1024, 3), 'image/jpeg');
      await mandar.click();
      const fallido = pagina.locator('.mensajes__burbuja[data-estado="fallo"]', { hasText: 'foto del pizarrón.jpg' });
      await fallido.getByText('Tu Google Drive está lleno. Hacé lugar y probá de nuevo.').waitFor();
      assert.equal(envios(antesDelLleno).length, 0);
      driveLleno = false;
      await fallido.getByRole('button', { name: 'Probar de nuevo' }).click();
      await tarjetas.filter({ hasText: 'foto del pizarrón.jpg' }).waitFor();
      const [idFoto] = [...visiblesDrive].find(([, f]) => f.name === 'foto del pizarrón.jpg');
      assert.deepEqual(envios(antesDelLleno).map(textoMandado), [`Archivo adjunto: foto del pizarrón.jpg (50 KB)\nhttps://drive.google.com/file/d/${idFoto}/view?usp=sharing`]);

      // The permission ended: it says so, and «Probar de nuevo» opens Google's window first, from the click.
      driveVencido = true;
      const antesDelVencido = pedidos.length;
      await elegir('Resumen.docx', bytesDe(10 * 1024, 5), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      await mandar.click();
      const vencido = pagina.locator('.mensajes__burbuja[data-estado="fallo"]', { hasText: 'Resumen.docx' });
      await vencido.getByText('Se cortó la conexión con Google. Probá de nuevo.').waitFor();
      driveVencido = false;
      const [otraVentana] = await Promise.all([pagina.waitForEvent('popup'), vencido.getByRole('button', { name: 'Probar de nuevo' }).click()]);
      await otraVentana.waitForEvent('close');
      await tarjetas.filter({ hasText: 'Resumen.docx' }).waitFor();
      assert.equal(envios(antesDelVencido).length, 1);

      // Wide and on a phone, with a file chosen: nothing overflows and axe finds nothing.
      await elegir('Guía de estudio para el final de Sistemas Operativos, con todos los ejercicios resueltos.pdf', bytesDe(800 * 1024));
      await elegido.waitFor();
      await pagina.waitForTimeout(100);
      const alFondo = () => hilo.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight < 8);
      assert.equal(await alFondo(), true, 'con el archivo elegido, el último mensaje sigue a la vista');
      await elegido.getByRole('button', { name: 'Sacar el archivo' }).click();
      await elegir('Guía de estudio para el final de Sistemas Operativos, con todos los ejercicios resueltos.pdf', bytesDe(800 * 1024));
      await elegido.waitFor();
      await pagina.waitForTimeout(100);
      assert.equal(await alFondo(), true, 'sacado y elegido otra vez, también');
      assert.equal(await seSale(), false, 'archivos en 1280 se sale a lo ancho');
      assert.deepEqual(await fallasAxe(), [], 'archivos en 1280');
      await pagina.screenshot({ path: path.join(CAPTURAS, 'mensajes-archivos-1280.png') });
      await pagina.setViewportSize({ width: 390, height: 844 });
      await pagina.locator('.mensajes[data-angosta]').waitFor();
      await pagina.locator('.mensajes__conversacion-fila[data-conversacion="801"] button').click();
      await pagina.getByRole('heading', { name: 'Laura Méndez', level: 2 }).waitFor();
      await elegido.waitFor();
      assert.equal(await seSale(), false, 'archivos en 390 se sale a lo ancho');
      assert.deepEqual(await fallasAxe(), [], 'archivos en 390');
      await pagina.screenshot({ path: path.join(CAPTURAS, 'mensajes-archivos-390.png') });

      const disco = await pagina.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
      // The one link of Drive on disk is the student's own: the career's file sent to a course from Buscar (mio).
      assert.ok(!/drive\.google\.com\/file\/d\/(?!archivoParcial000001)/.test(disco) && !disco.includes('TP 2 final') && !disco.includes('upload_id'), 'los archivos y sus links no tocan el disco');
      assert.equal(pedidos.slice(inicio).filter((p) => new URL(p.url).hostname === 'drive.google.com').length, 0, 'no se le pide nada a Google de un archivo');
    } finally {
      reiniciarCharlas();
      adjuntoSeCorta = 0;
      demoraTrozo = 0;
      driveLleno = false;
      driveVencido = false;
      await pagina.setViewportSize({ width: 1280, height: 860 });
      await ir('').catch(() => {});
    }
  });

  await prueba('Notificaciones: la campana avisa las nuevas, las muestra limpias y por día, y nunca las marca leídas en el campus', async () => {
    const axe = AXE;
    // `sinLaPantalla`: with the bell open, only the header and the panel. What it covers of Hoy is measured with it closed:
    // which button ends up under the panel changes with the day, and axe counts a covered one as too small.
    const fallasAxe = async (sinLaPantalla = false) => {
      await pagina.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))));
      await pagina.evaluate(axe);
      return pagina.evaluate(async (sin) => (await window.axe.run(sin ? { exclude: [['main']] } : document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })).violations.map((v) => `${v.id}: ${v.nodes[0].target}`), sinLaPantalla);
    };
    const seSale = () => pagina.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    const SERVIDOR = `${CAMPUS}/webservice/rest/server.php`;
    const funcionDe = (p) => (p.url === SERVIDOR ? new URLSearchParams(p.cuerpo).get('wsfunction') : null);
    const delCampus = (desde, funcion) => pedidos.slice(desde).filter((p) => funcionDe(p) === funcion);
    const valores = (p, ...claves) => claves.map((k) => new URLSearchParams(p.cuerpo).get(k));
    const hasta = async (condicion) => {
      for (let i = 0; !condicion(); i++) {
        if (i > 100) throw new Error('el campus no recibió el pedido');
        await pagina.waitForTimeout(50);
      }
    };
    const campana = pagina.locator('button.campana__boton');
    const panel = pagina.getByRole('dialog', { name: 'Notificaciones' });
    const filas = panel.locator('.campana__fila');
    const filaDe = (titulo) => filas.filter({ hasText: titulo });
    const titulos = () => filas.evaluateAll((l) => l.map((f) => f.querySelector('.campana__titulo').lastElementChild.textContent));
    const visto = () => pagina.evaluate(() => localStorage.getItem('cl.notif.5'));
    const entrar = async () => {
      const usuario = pagina.getByLabel('Usuario');
      await pagina.getByRole('heading', { name: 'Hola, Ana' }).or(usuario).first().waitFor();
      if (await usuario.isVisible()) {
        await usuario.fill('alumno');
        await pagina.getByLabel('Contraseña').fill(CONTRASENA);
        await boton('Entrar').click();
        await pagina.getByRole('heading', { name: 'Hola, Ana' }).waitFor();
      }
    };
    // Today, even a minute after midnight: the first three go under «Hoy».
    const hoyHace = (s) => Math.max(ahora() - s, Math.floor(new Date().setHours(0, 0, 0, 0) / 1000) + 1);
    const cierra = ahora() + 2 * DIA;
    const fecha = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(cierra * 1000));
    const PIE = '<hr><p>Este es un mensaje enviado automáticamente desde el Campus Virtual Global. Por favor, no respondas este correo.</p>'
      + `<p>Para dejar de recibir estos avisos, cambiá tus preferencias de notificación en ${CAMPUS}/message/notificationpreferences.php</p>`;
    // As Moodle 4.x sends them, with the Spanish strings of the campus and its mails: three unread, newest first.
    const DE_LA_CAMPANA = [
      { id: 41, useridfrom: 61, subject: 'Materia A: Cambio de aula para la consulta', timecreated: hoyHace(20 * 60), read: false, component: 'mod_forum', eventtype: 'posts',
        fullmessagehtml: `<div class="navbar"><a href="${CAMPUS}/course/view.php?id=1">MA</a> &raquo; <a href="${CAMPUS}/mod/forum/index.php?id=1">Foros</a> &raquo; Avisos &raquo; Cambio de aula para la consulta</div>`
          + `<div class="author">por Laura Méndez - ${fecha}</div><p>Hola a todos,</p><p>La consulta del jueves pasa al aula 204.</p><p>Saludos</p>`
          + `<p><a href="${CAMPUS}/mod/forum/discuss.php?d=12#p44">Ver el mensaje en su contexto</a></p><hr><p><a href="${CAMPUS}/mod/forum/subscribe.php?id=7">Darse de baja de este foro</a></p>`,
        contexturl: `${CAMPUS}/mod/forum/discuss.php?d=12#p44`, contexturlname: 'Cambio de aula para la consulta', customdata: '{"cmid":"19","instance":"7","discussionid":"12","postid":"44"}' },
      { id: 42, useridfrom: 61, subject: 'Laura Méndez ha dado retroalimentación para la tarea TP 1 corregido', timecreated: hoyHace(2 * 3600), read: false, component: 'mod_assign', eventtype: 'assign_notification',
        fullmessage: `Materia A -> Tarea -> TP 1 corregido\n---------------------------------------------------------------------\nLaura Méndez ha publicado comentarios de retroalimentación en su tarea entregada para 'TP 1 corregido'\n\nPuede verlos añadidos a su tarea enviada:\n\n    ${CAMPUS}/mod/assign/view.php?id=18\n\n---------------------------------------------------------------------\n`,
        contexturl: `${CAMPUS}/mod/assign/view.php?id=18`, contexturlname: 'TP 1 corregido', customdata: '{"cmid":18,"instance":518,"messagetype":"feedbackavailable"}' },
      { id: 43, useridfrom: -10, subject: `Se cierra en ${fecha}: Parcial`, timecreated: hoyHace(3 * 3600), read: false, component: 'moodle', eventtype: 'notices',
        fullmessagehtml: `<p>Hola Ana,</p><p>El cuestionario <b>Parcial</b> se cierra el ${fecha}.</p><p><a href="${CAMPUS}/mod/quiz/view.php?id=15">Ir a la actividad</a></p>${PIE}`,
        contexturl: `${CAMPUS}/mod/quiz/view.php?id=15`, customdata: '{"courseid":"1"}' },
      { id: 44, useridfrom: -10, subject: 'Materia B nuevo contenido', timecreated: ahora() - DIA - 3600, read: true, timeread: ahora() - DIA, component: 'moodle', eventtype: 'coursecontentupdated',
        fullmessagehtml: `<p>Archivo <a href="${CAMPUS}/mod/resource/view.php?id=24">Guía 2</a> es nuevo en el curso <a href="${CAMPUS}/course/view.php?id=2">Materia B</a>.</p><p><a href="${CAMPUS}/message/notificationpreferences.php">Cambie sus preferencias de notificación</a></p>`,
        contexturl: `${CAMPUS}/mod/resource/view.php?id=24`, contexturlname: 'Guía 2' },
      { id: 45, useridfrom: -10, subject: 'Recordatorio: TP próximo está en fecha de entrega', timecreated: ahora() - 3 * DIA, read: true, timeread: ahora() - 3 * DIA, component: 'moodle', eventtype: 'notices',
        fullmessagehtml: `<p>Hola Ana,</p><p>Falta poco para el <strong>TP próximo</strong>. Subí tu archivo antes de la fecha.</p><p><a href="${CAMPUS}/mod/assign/view.php?id=2">Ir a la tarea</a></p>${PIE}`,
        contexturl: `${CAMPUS}/mod/assign/view.php?id=2`, customdata: '{"courseid":"1"}' },
      { id: 46, useridfrom: 61, subject: 'Tu calificación en Parcial se actualizó', timecreated: ahora() - 4 * DIA, read: true, timeread: ahora() - 4 * DIA, component: 'moodle', eventtype: 'gradenotifications',
        fullmessage: `Materia A -> Calificaciones\n\nLaura Méndez actualizó tu calificación en Parcial.\n\nPodés verla en ${CAMPUS}/grade/report/user/index.php?id=1\n\nPara dejar de recibir estos avisos, cambiá tus preferencias de notificación.`,
        contexturl: `${CAMPUS}/grade/report/user/index.php?id=1`, customdata: '{"courseid":"1"}' },
    ];
    const inicio = pedidos.length;
    try {
      notificacionesSimuladas = DE_LA_CAMPANA;
      await pagina.evaluate(() => localStorage.removeItem('cl.notif.5'));
      await ir('');
      await entrar();

      // Three unread in the campus and the bell never opened here: it says so, with the number, asked for the student.
      await pagina.getByRole('button', { name: 'Notificaciones, 3 nuevas', exact: true }).waitFor();
      assert.equal(await pagina.locator('.campana__numero').innerText(), '3');
      assert.equal(await campana.getAttribute('aria-expanded'), 'false');
      assert.deepEqual(valores(delCampus(inicio, 'message_popup_get_unread_popup_notification_count')[0], 'useridto'), [String(usuarioId)]);
      await hasta(() => delCampus(inicio, 'message_popup_get_popup_notifications').length > 0);
      for (const p of delCampus(inicio, 'message_popup_get_popup_notifications')) assert.deepEqual(valores(p, 'useridto', 'newestfirst', 'limit', 'offset'), [String(usuarioId), '1', '20', '0']);

      // Open: the focus goes in, and each one comes clean, under its day, newest first.
      await campana.click();
      await panel.waitFor();
      assert.equal(await campana.getAttribute('aria-expanded'), 'true');
      assert.equal(await campana.getAttribute('aria-controls'), await panel.getAttribute('id'));
      assert.ok(await pagina.evaluate(() => document.activeElement?.matches('.campana__panel')), 'el foco va a la lista');
      await filaDe('Cambio de aula para la consulta').waitFor();
      assert.deepEqual(await titulos(), ['Cambio de aula para la consulta', 'TP 1 corregido', 'Parcial', 'Guía 2', 'TP próximo', 'Tu calificación en Parcial se actualizó']);
      const resumenes = await filas.evaluateAll((l) => l.map((f) => f.querySelector('.campana__resumen')?.textContent ?? ''));
      assert.deepEqual(resumenes.filter((_, i) => i !== 2), ['La consulta del jueves pasa al aula 204.', 'Laura Méndez te dejó una devolución.', 'Nuevo en la materia.', 'Falta poco para el TP próximo. Subí tu archivo antes de la fecha.', 'Laura Méndez actualizó tu calificación en Parcial.']);
      assert.match(resumenes[2], /^Cierra el (lunes|martes|miércoles|jueves|viernes|sábado|domingo) \d+ de \p{L}+, \d\d:\d\d\.$/u);
      const texto = await panel.textContent();
      for (const ruido of ['Hola', 'Saludos', 'Este es un mensaje', 'dejar de recibir', 'Darse de baja', 'preferencias', 'Ir a la', 'Puede verlos', 'Podés verla', 'su contexto', 'http', '->', '»', 'Se cierra en', 'Recordatorio', 'Materia A:', 'ha dado retroalimentación', 'está en fecha de entrega']) {
        assert.ok(!texto.includes(ruido), `«${ruido}» en la campana`);
      }
      assert.match(await filaDe('Cambio de aula').locator('.campana__dato').textContent(), /^Materia A, Laura Méndez, /);
      await filaDe('Guía 2').locator('.simbolo[data-materia="2"]').waitFor();
      assert.equal(await filaDe('TP 1 corregido').locator('.simbolo[data-materia="0"]').count(), 1);
      const dias = await panel.locator('h3').allInnerTexts();
      assert.equal(dias[0], 'Hoy');
      assert.equal(dias.length, new Set(DE_LA_CAMPANA.map((n) => new Date(n.timecreated * 1000).toDateString())).size);
      // Where each one leads: a screen of Super CVG, or the campus in another tab.
      assert.deepEqual(await filas.evaluateAll((l) => l.map((f) => [f.getAttribute('href'), f.getAttribute('target')])), [
        [`${CAMPUS}/mod/forum/discuss.php?d=12#p44`, '_blank'], ['/materias/1/tareas/18', null], [`${CAMPUS}/mod/quiz/view.php?id=15`, '_blank'],
        ['/materias/2', null], ['/materias/1/tareas/2', null], [`${CAMPUS}/grade/report/user/index.php?id=1`, '_blank'],
      ]);
      assert.equal(await filaDe('Parcial').first().getByText('Abrir en el campus').count(), 1);
      // The unread ones stay marked while it is open, and the number goes: seen until the newest, a number and nothing else.
      assert.equal(await panel.locator('.campana__fila[data-nueva]').count(), 3);
      assert.equal(await panel.locator('.campana__fila[data-nueva] .marcado').count(), 3);
      await pagina.locator('.campana__numero').waitFor({ state: 'detached' });
      assert.equal(await campana.getAttribute('aria-label'), 'Notificaciones');
      assert.equal(await visto(), String(Math.max(...DE_LA_CAMPANA.map((n) => n.timecreated))));

      // Escape closes it and the focus goes back to the bell. Opened again, nothing is new and the campus isn't asked.
      await pagina.keyboard.press('Escape');
      await panel.waitFor({ state: 'detached' });
      assert.equal(await campana.getAttribute('aria-expanded'), 'false');
      assert.ok(await pagina.evaluate(() => document.activeElement?.matches('button.campana__boton')), 'el foco vuelve a la campana');
      const antesDeAbrir = pedidos.length;
      await campana.click();
      await filaDe('TP 1 corregido').waitFor();
      assert.equal(await panel.locator('.campana__fila[data-nueva]').count(), 0);
      assert.equal(delCampus(antesDeAbrir, 'message_popup_get_popup_notifications').length, 0, 'abrirla de nuevo no pide la lista');
      // Leaving it with Tab closes it, and so does a touch outside.
      await panel.getByRole('link', { name: /^Ver todas en el campus/ }).focus();
      await pagina.keyboard.press('Tab');
      await panel.waitFor({ state: 'detached' });
      await campana.click();
      await panel.waitFor();
      await pagina.mouse.click(10, 400);
      await panel.waitFor({ state: 'detached' });

      // A notification of Super CVG opens its screen and the bell closes.
      await campana.click();
      await filaDe('TP 1 corregido').click();
      await pagina.getByRole('heading', { name: 'TP 1 corregido', level: 1 }).waitFor();
      assert.ok(pagina.url().endsWith('/materias/1/tareas/18'));
      await panel.waitFor({ state: 'detached' });

      // Back later: still seen, though the campus still says three unread.
      const antesDeVolver = pedidos.length;
      await ir('');
      await entrar();
      await hasta(() => delCampus(antesDeVolver, 'message_popup_get_popup_notifications').length > 0);
      await pagina.waitForTimeout(300);
      assert.equal(await pagina.locator('.campana__numero').count(), 0);
      assert.equal(await campana.getAttribute('aria-label'), 'Notificaciones');

      // One newer comes: the number says one, and only that one is marked.
      notificacionesSimuladas = [{
        id: 47, useridfrom: 62, subject: 'Materia B: Se suspende la clase del viernes', timecreated: ahora(), read: false, component: 'mod_forum', eventtype: 'posts',
        fullmessage: `Materia B -> Foros -> Avisos -> Se suspende la clase del viernes\n-----------------------------------------------------------------------\nSe suspende la clase del viernes\npor Beto Muestra - ${fecha}\n-----------------------------------------------------------------------\nEl viernes no hay clase. Recuperamos el martes.\n\nSaludos,\nBeto\n\n-----------------------------------------------------------------------\nVer este mensaje en su contexto:\n${CAMPUS}/mod/forum/discuss.php?d=13#p50\n\nPara dejar de recibir mensajes de este foro: ${CAMPUS}/mod/forum/subscribe.php?id=8`,
        contexturl: `${CAMPUS}/mod/forum/discuss.php?d=13#p50`, contexturlname: 'Se suspende la clase del viernes', customdata: '{"cmid":"21","instance":"8","discussionid":"13","postid":"50"}',
      }, ...DE_LA_CAMPANA];
      await ir('');
      await entrar();
      await pagina.getByRole('button', { name: 'Notificaciones, 1 nueva', exact: true }).waitFor();
      assert.equal(await pagina.locator('.campana__numero').innerText(), '1');
      await campana.click();
      await filaDe('Se suspende la clase del viernes').waitFor();
      assert.deepEqual(await panel.locator('.campana__fila[data-nueva]').evaluateAll((l) => l.map((f) => f.querySelector('.campana__titulo').lastElementChild.textContent)), ['Se suspende la clase del viernes']);
      assert.equal(await filaDe('Se suspende').locator('.campana__resumen').textContent(), 'El viernes no hay clase. Recuperamos el martes.');
      assert.match(await filaDe('Se suspende').locator('.campana__dato').textContent(), /^Materia B, Beto Muestra, recién$/);

      // Taking one out: it leaves the bell and Avisos in Hoy, only here (the campus is never told), with the way back. Its
      // place says so and takes the focus; closed and opened again, it's gone. Only its number is kept.
      const avisosDeHoy = pagina.locator('section.bloque', { has: pagina.getByRole('heading', { name: 'Avisos', exact: true }) });
      await avisosDeHoy.getByText('Se suspende la clase del viernes').waitFor();
      await panel.getByRole('button', { name: 'Sacar Se suspende la clase del viernes' }).click();
      await panel.getByText('Sacaste «Se suspende la clase del viernes».').waitFor();
      assert.equal(await pagina.evaluate(() => document.activeElement?.textContent), 'Deshacer');
      assert.equal(await filaDe('Se suspende').count(), 0);
      await avisosDeHoy.getByText('Se suspende la clase del viernes').waitFor({ state: 'detached' });
      await panel.getByRole('button', { name: 'Deshacer' }).click();
      await filaDe('Se suspende').waitFor();
      await avisosDeHoy.getByText('Se suspende la clase del viernes').waitFor();
      await pagina.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Sacar Se suspende la clase del viernes');
      await pagina.keyboard.press('Enter');
      await panel.getByText('Sacaste «Se suspende la clase del viernes».').waitFor();
      await pagina.keyboard.press('Escape');
      await panel.waitFor({ state: 'detached' });
      await campana.click();
      await filaDe('Cambio de aula').waitFor();
      assert.equal(await filaDe('Se suspende').count(), 0);
      assert.equal(await panel.getByText('Sacaste').count(), 0);
      assert.equal(await pagina.evaluate(() => localStorage.getItem('cl.notif.fuera.5')), '[47]');
      await pagina.keyboard.press('Escape');
      await panel.waitFor({ state: 'detached' });

      // From Avisos in Hoy too: the next one takes its place, and it's out of the bell until Deshacer.
      await avisosDeHoy.getByRole('button', { name: 'Sacar Cambio de aula para la consulta' }).click();
      await avisosDeHoy.getByText('Sacaste «Cambio de aula para la consulta».').waitFor();
      assert.equal(await pagina.evaluate(() => document.activeElement?.textContent), 'Deshacer');
      await campana.click();
      await filaDe('TP 1 corregido').waitFor();
      assert.equal(await filaDe('Cambio de aula').count(), 0);
      await pagina.keyboard.press('Escape');
      await panel.waitFor({ state: 'detached' });
      await avisosDeHoy.getByRole('button', { name: 'Deshacer' }).click();
      await avisosDeHoy.getByRole('button', { name: 'Sacar Cambio de aula para la consulta' }).waitFor();

      // All at once, and back with one Deshacer: only those, the one taken out before stays out.
      await campana.click();
      await panel.getByRole('button', { name: 'Sacar todas' }).click();
      await panel.getByText('Sacaste todas las notificaciones.').waitFor();
      assert.equal(await filas.count(), 0);
      assert.equal(await pagina.evaluate(() => document.activeElement?.textContent), 'Deshacer');
      assert.equal(await avisosDeHoy.count(), 0, 'sin avisos, Hoy no muestra la tarjeta');
      await panel.getByRole('button', { name: 'Deshacer' }).click();
      await filaDe('Cambio de aula').waitFor();
      assert.equal(await filaDe('Se suspende').count(), 0);
      assert.equal(await pagina.evaluate(() => localStorage.getItem('cl.notif.fuera.5')), '[47]');

      // Open, wide and on a phone, where it takes the width of the header: nothing overflows and axe finds nothing.
      for (const ancho of [1280, 390]) {
        await pagina.setViewportSize({ width: ancho, height: ancho === 390 ? 844 : 860 });
        if (!(await panel.isVisible())) await campana.click();
        await panel.waitFor();
        assert.equal(await panel.getAttribute('data-hoja'), ancho === 390 ? '' : null, `la campana en ${ancho}`);
        assert.equal(await seSale(), false, `la campana en ${ancho} se sale a lo ancho`);
        assert.deepEqual(await fallasAxe(true), [], `la campana en ${ancho}`);
        await pagina.screenshot({ path: path.join(CAPTURAS, `campana-${ancho}.png`) });
        await pagina.keyboard.press('Escape');
        await panel.waitFor({ state: 'detached' });
      }
      await pagina.setViewportSize({ width: 1280, height: 860 });

      // Nothing of them on disk but the number, and never marked as read in the campus.
      const disco = await pagina.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
      for (const t of ['Cambio de aula', 'aula 204', 'Se suspende', 'Recuperamos', 'devolución', 'Guía 2']) assert.ok(!disco.includes(t), `«${t}» en disco`);
      assert.deepEqual(await pagina.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('cl.notif')).sort()), ['cl.notif.5', 'cl.notif.fuera.5']);
      assert.equal(await pagina.evaluate(() => localStorage.getItem('cl.notif.fuera.5')), '[47]');
      assert.match(await visto(), /^\d+$/);
      assert.deepEqual(pedidos.slice(inicio).map(funcionDe).filter((f) => f && /notification/.test(f) && !/^message_popup_get_/.test(f)), [], 'nada que marque una notificación');

      // The campus closes them: the bell goes away without a word, and the session stays.
      notificacionesCerradas = true;
      const antesDeCerrar = pedidos.length;
      await ir('');
      await entrar();
      await hasta(() => delCampus(antesDeCerrar, 'message_popup_get_unread_popup_notification_count').length > 0);
      await pagina.locator('.campana').waitFor({ state: 'detached' });
      await pagina.waitForTimeout(300);
      assert.equal(await pagina.locator('.campana').count(), 0);
      assert.equal(await pagina.evaluate(() => sessionStorage.getItem('cl.sesion')), TOKEN, 'la sesión sigue');
      await pagina.getByRole('heading', { name: 'Hola, Ana' }).waitFor();
      await pagina.getByRole('link', { name: /^Mensajes/ }).first().waitFor();
      assert.equal(await pagina.getByText('El campus no deja hacer esto').count(), 0, 'sin aviso');
    } finally {
      notificacionesSimuladas = null;
      notificacionesCerradas = false;
      await pagina.setViewportSize({ width: 1280, height: 860 });
      await pagina.evaluate(() => {
        localStorage.removeItem('cl.notif.5');
        localStorage.removeItem('cl.notif.fuera.5');
      }).catch(() => {});
      await ir('').catch(() => {});
    }
  });

  await prueba('el menú en el orden que elegís (arrastrando, con flechas o con Subir y Bajar), Alt y su número, a la izquierda, y los avisos que querés ver', async () => {
    const antes = await pagina.evaluate(() => localStorage.getItem('cl.ajustes'));
    const menu = pagina.getByRole('navigation', { name: 'Principal' });
    const orden = () => pagina.evaluate(() => JSON.parse(localStorage.getItem('cl.ajustes') ?? '{}').menu?.orden ?? null);
    const filas = () => pagina.locator('.lugares-menu > li .lugar-menu__nombre').allInnerTexts().then((l) => l.map((t) => t.replace(/\s*Alt \d$/, '')));
    const manija = (nombre) => pagina.getByRole('button', { name: `Mover ${nombre}`, exact: true });
    const anuncio = pagina.locator('#ajustes-menu p[role="status"]');
    const fallasAxe = async (dentro) => {
      // From the top: what scrolled under the sticky tabs would count as covered.
      await pagina.evaluate(() => window.scrollTo(0, 0));
      await pagina.evaluate(AXE);
      return pagina.evaluate(async (d) => (await window.axe.run(d ? document.querySelector(d) : document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })).violations.map((v) => `${v.id}: ${v.nodes[0].target}`), dentro);
    };
    const SERVIDOR = `${CAMPUS}/webservice/rest/server.php`;
    const funcionDe = (p) => (p.url === SERVIDOR ? new URLSearchParams(p.cuerpo).get('wsfunction') : null);
    const inicio = pedidos.length;
    try {
      // Alone (FLUJOS_SOLO) it starts from the sign-in.
      await ir('configuracion#menu');
      const usuario = pagina.getByLabel('Usuario');
      const titulo = pagina.getByRole('heading', { name: 'Configuración', level: 1 });
      await Promise.race([usuario.waitFor().catch(() => {}), titulo.waitFor().catch(() => {})]);
      if (await usuario.isVisible()) {
        await usuario.fill('alumno');
        await pagina.getByLabel('Contraseña').fill(CONTRASENA);
        await boton('Entrar').click();
        await pagina.getByRole('heading', { name: 'Hola, Ana' }).waitFor();
        await ir('configuracion#menu');
      }
      await pagina.evaluate(() => localStorage.removeItem('cl.ajustes'));
      await pagina.reload();
      await pagina.getByRole('tab', { name: 'Menú', exact: true, selected: true }).waitFor();
      assert.equal((await filas())[0], 'Hoy');
      assert.equal(await pagina.getByRole('button', { name: 'Volver al orden de siempre' }).count(), 0, 'como vino, nada que volver');

      // Dragged by its handle: Repaso goes two places up, over Laboratorio.
      await manija('Repaso').scrollIntoViewIfNeeded();
      const desde = await manija('Repaso').boundingBox();
      const hacia = await manija('Laboratorio').boundingBox();
      await pagina.mouse.move(desde.x + desde.width / 2, desde.y + desde.height / 2);
      await pagina.mouse.down();
      for (let paso = 1; paso <= 12; paso++) await pagina.mouse.move(desde.x + desde.width / 2, desde.y + desde.height / 2 + ((hacia.y - desde.y - 12) * paso) / 12);
      await pagina.waitForTimeout(100);
      await pagina.mouse.up();
      await pagina.waitForFunction(() => document.querySelectorAll('.lugares-menu > li')[10]?.textContent.includes('Repaso'));
      assert.deepEqual((await filas()).slice(9, 13), ['Configuración', 'Repaso', 'Laboratorio', 'Calculadoras']);
      assert.equal((await orden())[10], 'repaso');
      await pagina.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Mover Repaso');

      // With the arrows on the handle: Consultron goes to the top, one place at a time, and each move is said.
      await manija('Consultron').focus();
      for (let i = 0; i < 13; i++) await pagina.keyboard.press('ArrowUp');
      await pagina.waitForFunction(() => document.querySelector('.lugares-menu > li')?.textContent.includes('Consultron'));
      assert.equal(await pagina.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Mover Consultron');
      assert.equal(await anuncio.textContent(), 'Consultron quedó en el lugar 1 de 15');

      // A tap on the handle, for whoever can't drag: «Subir» and «Bajar». Hoy goes down one.
      await manija('Hoy').click();
      const mover = pagina.getByRole('group', { name: 'Mover Hoy' });
      await mover.waitFor();
      await mover.getByRole('button', { name: 'Bajar' }).click();
      await pagina.waitForFunction(() => document.activeElement?.id === 'mover-bajar-hoy');
      assert.deepEqual((await orden()).slice(0, 4), ['consultron', 'materias', 'hoy', 'calendario']);
      await pagina.keyboard.press('Escape');
      await mover.waitFor({ state: 'detached' });
      assert.deepEqual(await fallasAxe('.lugares-menu'), [], 'la lista para ordenar');
      await fin('menu-ordenado');

      // The header goes in that order, and Alt with a number follows it: Teclado says the same.
      assert.deepEqual((await menu.getByRole('link').allInnerTexts()).slice(0, 3), ['Materias', 'Hoy', 'Calendario']);
      await pagina.getByRole('tab', { name: 'Teclado' }).click();
      const atajoDe = (n) => pagina.locator('.atajo', { has: pagina.locator('kbd', { hasText: new RegExp(`^${n}$`) }) }).locator('dd').first().textContent();
      assert.equal(await atajoDe(1), 'Ir a Consultron');
      assert.equal(await atajoDe(3), 'Ir a Hoy');
      // Sysacad, now among the ten, has its number too.
      assert.ok(await pagina.locator('.atajo dd', { hasText: 'Ir a Sysacad' }).count(), 'Sysacad con número');
      await pagina.evaluate(() => document.activeElement?.blur());
      await pagina.keyboard.press('Alt+Digit1');
      await pagina.waitForURL(/\/consultron$/);
      await pagina.keyboard.press('Alt+Digit3');
      await pagina.waitForURL(/\/$/);

      // Back as it came: the numbers of always.
      await ir('configuracion#menu');
      await pagina.getByRole('button', { name: 'Volver al orden de siempre' }).click();
      assert.equal(await anuncio.textContent(), 'Volvió el orden de siempre');
      assert.equal((await filas())[0], 'Hoy');
      await pagina.evaluate(() => document.activeElement?.blur());
      await pagina.keyboard.press('Alt+Digit7');
      await pagina.waitForURL(/\/carrera$/);

      // On the left: a column beside the page, written before the first paint; nothing under a bar that isn't there.
      await ir('configuracion#menu');
      await pagina.locator('input[name="menu-posicion"][value="izquierda"]').check({ force: true });
      const cabecera = pagina.locator('header.cabecera');
      await pagina.locator('header.cabecera[data-lateral]').waitFor();
      assert.equal(await pagina.evaluate(() => document.documentElement.dataset.menuLado), 'izquierda');
      const columna = await cabecera.boundingBox();
      assert.ok(columna.x === 0 && columna.height >= 800 && columna.width < 300, `la columna: ${JSON.stringify(columna)}`);
      const enlaces = await menu.getByRole('link').evaluateAll((l) => l.map((a) => a.getBoundingClientRect()).map((r) => [Math.round(r.left), Math.round(r.top)]));
      assert.ok(enlaces.every(([x]) => x === enlaces[0][0]) && enlaces.every(([, y], i) => i === 0 || y > enlaces[i - 1][1]), 'una pantalla abajo de la otra');
      assert.ok((await pagina.locator('main').boundingBox()).x >= columna.width, 'la página al lado de la columna');
      assert.equal(await pagina.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--alto-cabecera').trim()), '0px');
      assert.equal(await pagina.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false, 'nada se sale a lo ancho');
      await pagina.mouse.wheel(0, 900);
      await pagina.waitForFunction(() => window.scrollY > 300);
      // The tabs, at the very top once the page stops.
      await pagina.waitForFunction(() => Math.abs(document.querySelector('.ajustes__pestanas').getBoundingClientRect().top) < 0.5, null, { timeout: 5000 });
      assert.equal(Math.round((await cabecera.boundingBox()).y), 0, 'la columna se queda');
      assert.deepEqual(await fallasAxe('.cabecera'), [], 'la columna');
      // «Más» opens in the column and stays open going from one of its screens to another.
      await pagina.locator('.cabecera__mas-boton').click();
      await pagina.locator('.cabecera__panel-mas').getByRole('link', { name: 'Repaso' }).click();
      await pagina.waitForURL(/\/repaso$/);
      await pagina.locator('.cabecera__panel-mas').getByRole('link', { name: 'Laboratorio' }).click();
      await pagina.waitForURL(/\/laboratorio$/);
      assert.equal(await pagina.locator('.cabecera__mas-boton').getAttribute('aria-expanded'), 'true');
      // The bell opens beside the column, inside the window.
      await pagina.locator('button.campana__boton').click();
      const campana = await pagina.getByRole('dialog', { name: 'Notificaciones' }).boundingBox();
      assert.ok(campana.x >= columna.width && campana.x + campana.width <= 1280 && campana.y >= 0, `la campana: ${JSON.stringify(campana)}`);
      await pagina.keyboard.press('Escape');
      await ir('');
      await pagina.getByRole('heading', { name: 'Hola, Ana' }).waitFor();
      assert.equal(await pagina.evaluate(() => document.documentElement.dataset.menuLado), 'izquierda');
      await fin('menu-a-la-izquierda');
      // On a phone, the bar on top as always.
      await pagina.setViewportSize({ width: 390, height: 844 });
      await pagina.locator('header.cabecera[data-lateral]').waitFor({ state: 'detached' });
      assert.equal(Math.round((await cabecera.boundingBox()).height), 64);
      assert.equal(await pagina.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--alto-cabecera').trim()), '64px');
      await boton('Menú').click();
      await menu.getByRole('link', { name: 'Hoy' }).waitFor();
      await pagina.setViewportSize({ width: 1280, height: 860 });

      // Which notices: hiding the forums takes them out of the bell, its number and Hoy. Nothing changes in the campus.
      notificacionesSimuladas = [
        { id: 61, subject: 'Materia A: Consulta del martes', timecreated: ahora() - 600, read: false, component: 'mod_forum', eventtype: 'posts', contexturl: `${CAMPUS}/mod/forum/discuss.php?d=12`, contexturlname: 'Consulta del martes', customdata: '{}' },
        { id: 62, subject: 'Laura Méndez ha dado retroalimentación para la tarea TP 2 corregido', timecreated: ahora() - 1200, read: false, component: 'mod_assign', eventtype: 'assign_notification', contexturl: `${CAMPUS}/mod/assign/view.php?id=18`, contexturlname: 'TP 2 corregido', customdata: '{"cmid":18,"messagetype":"feedbackavailable"}' },
        { id: 63, subject: 'Persona de ejemplo quiere agregarte como contacto', timecreated: ahora() - 1800, read: true, timeread: ahora() - 900, component: 'moodle', eventtype: 'messagecontactrequests', contexturl: `${CAMPUS}/message/index.php?view=contactrequests`, customdata: '{}' },
      ];
      await pagina.evaluate(() => localStorage.removeItem('cl.notif.5'));
      await ir('');
      await pagina.getByRole('button', { name: 'Notificaciones, 2 nuevas', exact: true }).waitFor();
      const avisosDeHoy = pagina.locator('section.bloque', { has: pagina.getByRole('heading', { name: 'Avisos', exact: true }) });
      await avisosDeHoy.getByText('Consulta del martes').waitFor();
      await ir('configuracion#avisos');
      await pagina.getByRole('tab', { name: 'Pantallas', selected: true }).waitFor();
      const foros = pagina.locator('input[name="avisos-foros"]');
      assert.equal(await foros.isChecked(), true);
      await foros.uncheck();
      await pagina.getByRole('button', { name: 'Notificaciones, 1 nueva', exact: true }).waitFor();
      assert.deepEqual(await pagina.evaluate(() => JSON.parse(localStorage.getItem('cl.mio.5')).avisosOcultos), ['foros']);
      assert.deepEqual(await fallasAxe('#ajustes-pantallas'), [], 'qué avisos ves');
      await fin('configuracion-avisos');
      // Seen again, it counts again (without ringing); hidden, Hoy doesn't show it either.
      await foros.check();
      await pagina.getByRole('button', { name: 'Notificaciones, 2 nuevas', exact: true }).waitFor();
      assert.equal(await pagina.locator('.campana__boton svg').evaluate((s) => s.getAnimations().length), 0, 'sin sonar');
      await foros.uncheck();
      await ir('');
      await avisosDeHoy.getByText('TP 2 corregido').waitFor();
      assert.equal(await avisosDeHoy.getByText('Consulta del martes').count(), 0, 'el foro, fuera de Hoy');
      await pagina.getByRole('button', { name: 'Notificaciones, 1 nueva', exact: true }).click();
      const panel = pagina.getByRole('dialog', { name: 'Notificaciones' });
      await panel.locator('.campana__fila', { hasText: 'TP 2 corregido' }).waitFor();
      assert.equal(await panel.locator('.campana__fila', { hasText: 'Consulta del martes' }).count(), 0, 'el foro, fuera de la campana');
      // From the bell, to choose.
      await panel.getByRole('link', { name: 'Elegir qué avisos ves' }).click();
      await pagina.waitForURL(/\/configuracion#avisos$/);
      await pagina.getByRole('tab', { name: 'Pantallas', selected: true }).waitFor();
      await panel.waitFor({ state: 'detached' });
      // Everything hidden: the bell says why it's empty.
      for (const g of ['notas', 'contactos']) await pagina.locator(`input[name="avisos-${g}"]`).uncheck();
      await pagina.locator('button.campana__boton').click();
      await panel.getByText('No tenés avisos de los que elegiste ver.').waitFor();
      await pagina.keyboard.press('Escape');
      for (const g of ['foros', 'notas', 'contactos']) await pagina.locator(`input[name="avisos-${g}"]`).check();
      assert.deepEqual(await pagina.evaluate(() => JSON.parse(localStorage.getItem('cl.mio.5')).avisosOcultos), []);
      // A course taken out of Hoy leaves the bell too.
      await ir('configuracion#materias-en-hoy');
      await pagina.getByRole('switch', { name: 'Materia A' }).uncheck();
      await pagina.locator('button.campana__boton').click();
      await panel.locator('.campana__fila').first().or(panel.getByText('No tenés avisos de los que elegiste ver.')).waitFor();
      assert.equal(await panel.locator('.campana__fila', { hasText: 'Consulta del martes' }).count(), 0, 'Materia A, fuera de la campana');
      await pagina.keyboard.press('Escape');
      await pagina.getByRole('switch', { name: 'Materia A' }).check();
      assert.deepEqual(pedidos.slice(inicio).map(funcionDe).filter((f) => f && /notification/.test(f) && !/^message_popup_get_/.test(f)), [], 'nada que marque una notificación');
    } finally {
      notificacionesSimuladas = null;
      await pagina.setViewportSize({ width: 1280, height: 860 });
      await pagina.evaluate((a) => {
        if (a === null) localStorage.removeItem('cl.ajustes');
        else localStorage.setItem('cl.ajustes', a);
        localStorage.removeItem('cl.notif.5');
      }, antes).catch(() => {});
      await ir('').catch(() => {});
    }
  });

  await prueba('Inscripción: buscar sin tildes, por departamento, sin los años anteriores, una con clave, una sin inscripción propia, y siempre pregunta', async () => {
    const axe = AXE;
    const fallasAxe = async () => {
      await pagina.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))));
      await pagina.evaluate(axe);
      return pagina.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })).violations.map((v) => `${v.id}: ${v.nodes[0].target}`));
    };
    const seSale = () => pagina.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    const inscribir = () => pedidos.filter((p) => new URLSearchParams(p.cuerpo).get('wsfunction') === 'enrol_self_enrol_user');
    const filaDe = (nombre) => pagina.locator('li.inscripcion__fila', { hasText: nombre });
    try {
      await ir('materias');
      await pagina.getByRole('link', { name: 'Inscribirte a una materia' }).click();
      await pagina.getByRole('heading', { name: 'Inscribirte a una materia', level: 1 }).waitFor();

      // Written without accents, it finds them: the campus gets each vowel as any letter.
      // The departments as the campus has them inside «Grado», by their short names; Ingreso apart.
      // Once they came: right after the title the list may still be on its way.
      await pagina.locator('.area__nombre', { hasText: 'Sistemas' }).waitFor();
      assert.deepEqual(await pagina.getByRole('radio').evaluateAll((r) => r.map((x) => x.labels[0].querySelector('.area__nombre').textContent)), ['Todos', 'Civil', 'Sistemas']);
      await pagina.getByLabel('Otra área del campus').locator('option', { hasText: 'Ingreso' }).waitFor({ state: 'attached' });
      await pagina.getByLabel('Materia', { exact: true }).fill('fisica');
      await filaDe('Física II 2026').first().waitFor();
      await filaDe('Física II Civil 2026').waitFor();
      // Past years stay out until asked for.
      assert.equal(await filaDe('Mesa de examen').count(), 0);
      await pagina.getByLabel('Mostrar las de años anteriores').check();
      await filaDe('Mesa de examen').waitFor();
      await pagina.getByLabel('Mostrar las de años anteriores').uncheck();
      await filaDe('Mesa de examen').waitFor({ state: 'detached' });
      assert.equal(await filaDe('Física II Civil 2026').locator('.inscripcion__lugar').textContent(), 'Civil');
      const busqueda = pedidos.filter((p) => new URLSearchParams(p.cuerpo).get('wsfunction') === 'core_course_search_courses').at(-1);
      assert.equal(new URLSearchParams(busqueda.cuerpo).get('criteriavalue'), 'f_s_c_');

      // By department: only the ones inside it, and the whole of it in alphabetical order, with who gives each.
      await pagina.getByRole('radio', { name: /^Sistemas/ }).check();
      await filaDe('Física II Civil 2026').waitFor({ state: 'detached' });
      await filaDe('Física II 2026').waitFor();
      await pagina.getByLabel('Materia', { exact: true }).fill('');
      await filaDe('Diseño de Sistemas 2026').waitFor();
      await filaDe('Seminario integrador').waitFor();
      assert.deepEqual(await pagina.locator('.inscripcion__letra [aria-hidden]').allTextContents(), ['D', 'F', 'S']);
      assert.equal(await filaDe('Diseño de Sistemas 2026').locator('.inscripcion__docentes').textContent(), 'Con Ana Ejemplo y Beto Muestra');
      for (const ancho of [1280, 390]) {
        await pagina.setViewportSize({ width: ancho, height: ancho === 390 ? 844 : 860 });
        assert.equal(await seSale(), false, `inscripción en ${ancho} se sale a lo ancho`);
        assert.deepEqual(await fallasAxe(), [], `inscripción en ${ancho}`);
        await pagina.screenshot({ path: path.join(CAPTURAS, `inscripcion-${ancho}.png`), fullPage: true });
      }
      await pagina.setViewportSize({ width: 1280, height: 860 });

      // Without a self enrolment: it says so, and nothing is sent.
      assert.equal(await filaDe('Seminario integrador').getByRole('button').count(), 0, 'sin inscripción propia no hay botón');
      await filaDe('Seminario integrador').getByText('Esta materia no deja inscribirse desde el campus. Pedíselo a quien la da.').waitFor();

      // Asking first: «Volver» sends nothing.
      await filaDe('Diseño de Sistemas 2026').getByRole('button', { name: 'Inscribirme en Diseño de Sistemas 2026' }).click();
      const pregunta = pagina.getByRole('dialog');
      await pregunta.getByText('¿Inscribirte en Diseño de Sistemas 2026?').waitFor();
      await pregunta.getByRole('button', { name: 'Volver' }).click();
      await pregunta.waitFor({ state: 'detached' });
      assert.equal(inscribir().length, 0, 'sin confirmar no se inscribe');

      // With its key: a wrong one says so, without what the campus tells about the key; the right one enrols.
      const fisica = filaDe('Física II 2026');
      await fisica.getByRole('button', { name: 'Inscribirme en Física II 2026' }).click();
      await fisica.getByLabel('Clave de inscripción').fill('otra');
      await fisica.getByRole('button', { name: 'Inscribirme en Física II 2026' }).click();
      await pregunta.getByRole('button', { name: 'Inscribirme' }).click();
      await fisica.getByRole('alert').getByText('La clave no es esa. Revisala y probá de nuevo.').waitFor();
      assert.equal(await pagina.getByText('la primera letra', { exact: false }).count(), 0);
      await fisica.getByLabel('Clave de inscripción').fill(CLAVE_FISICA);
      await fisica.getByRole('button', { name: 'Inscribirme en Física II 2026' }).click();
      await pregunta.getByRole('button', { name: 'Inscribirme' }).click();
      await pagina.getByText('Te inscribiste en Física II 2026.').waitFor();
      await fisica.getByText('Ya estás inscripto').waitFor();
      const enviados = inscribir().map((p) => Object.fromEntries(new URLSearchParams(p.cuerpo)));
      assert.deepEqual(enviados.map((e) => [e.courseid, e.instanceid, e.password]), [['302', '1202', 'otra'], ['302', '1202', CLAVE_FISICA]]);
      assert.ok(inscribir().every((p) => !p.url.includes(CLAVE_FISICA) && !p.url.includes(TOKEN)), 'la clave va en el cuerpo');

      // The new course is among the student's ones right away.
      await fisica.getByRole('link', { name: 'Ir a la materia Física II 2026' }).click();
      await pagina.getByRole('heading', { name: 'Física II 2026', level: 1 }).waitFor();
      await ir('materias');
      await pagina.getByText('Física II 2026').first().waitFor();
      assert.ok(!(await pagina.evaluate(() => Object.values(localStorage).join('\n'))).includes('Diseño de Sistemas'), 'el catálogo no toca el disco');
    } finally {
      inscriptas.clear();
      await pagina.setViewportSize({ width: 1280, height: 860 });
    }
  });

  await prueba('una materia tuya se arregla en el lugar, las listas largas muestran de a diez, arrastrar al borde mueve la página y una sección del campus se renombra', async () => {
    const axe = AXE;
    const fallasAxe = async () => {
      await pagina.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))));
      await pagina.evaluate(axe);
      return pagina.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })).violations.map((v) => `${v.id}: ${v.nodes[0].target}`));
    };
    const seSale = () => pagina.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    const seccion = (nombre) => pagina.locator('section.bloque', { has: pagina.getByRole('heading', { name: nombre, exact: true, level: 2 }) });
    const nombres = (nombre) => seccion(nombre).locator('.fila__nombre').allTextContents();
    const filaDe = (nombre) => pagina.locator('li.fila', { has: pagina.getByRole('button', { name: `Opciones de ${nombre}`, exact: true }) });
    // Alone (FLUJOS_SOLO) it starts from the sign-in.
    await ir('materias');
    const usuario = pagina.getByLabel('Usuario');
    const materias = pagina.getByRole('heading', { name: 'Materias', level: 1 });
    await Promise.race([usuario.waitFor().catch(() => {}), materias.waitFor().catch(() => {})]);
    if (await usuario.isVisible()) {
      await usuario.fill('alumno');
      await pagina.getByLabel('Contraseña').fill(CONTRASENA);
      await boton('Entrar').click();
      await pagina.getByRole('heading', { name: 'Hola, Ana' }).waitFor();
      await ir('materias');
    }
    // A course of one's own with a long category and a short one, as it would be saved.
    await materias.waitFor();
    await pagina.evaluate(() => {
      const clave = 'cl.mio.5';
      const mio = JSON.parse(localStorage.getItem(clave) ?? '{}');
      const enlace = (id, titulo) => ({ id, tipo: 'enlace', url: `https://example.org/${id}`, titulo });
      mio.propias = [...(mio.propias ?? []), {
        id: 'pflujos0001', nombre: 'Para ordenar', base: null, classroom: null, de: null, cambiada: 1,
        categorias: [
          { id: 1, nombre: 'Prácticos', bloques: Array.from({ length: 14 }, (_, k) => enlace(100 + k, `Práctico ${k + 1}`)) },
          { id: 2, nombre: 'Teoría', bloques: [enlace(200, 'Teoría 1'), { id: 201, tipo: 'texto', texto: 'Ojo con el **final**' }] },
        ],
      }];
      localStorage.setItem(clave, JSON.stringify(mio));
    });
    await ir('propias/pflujos0001');
    await pagina.getByRole('heading', { name: 'Para ordenar', level: 1 }).waitFor();

    // The long one shows ten, and the button brings the rest: the focus goes to the first that came in.
    assert.equal((await nombres('Prácticos')).length, 10);
    await seccion('Prácticos').getByRole('button', { name: 'Ver los 4 que quedan de Prácticos' }).click();
    await pagina.waitForFunction(() => document.activeElement?.textContent.startsWith('Práctico 11'), null, { timeout: 5000 });
    assert.equal((await nombres('Prácticos')).length, 14);
    await pagina.getByText('Ojo con el').waitFor();

    // A section renamed in place, and a link changed from its options.
    await pagina.getByRole('button', { name: 'Opciones de Teoría', exact: true }).click();
    await seccion('Teoría').getByRole('button', { name: 'Cambiar nombre' }).click();
    await pagina.getByLabel('Nombre de la sección').fill('Teoría del final');
    await pagina.keyboard.press('Enter');
    await pagina.waitForFunction(() => document.activeElement?.tagName === 'H2' && document.activeElement.textContent === 'Teoría del final', null, { timeout: 5000 });
    await filaDe('Teoría 1').getByRole('button', { name: 'Opciones de Teoría 1' }).click();
    await filaDe('Teoría 1').getByRole('button', { name: 'Cambiar el enlace' }).click();
    await pagina.getByLabel('Cómo se llama').fill('Resumen de teoría');
    await boton('Guardar enlace').click();
    await seccion('Teoría del final').locator('.fila__nombre', { hasText: 'Resumen de teoría' }).waitFor();

    // Passed to another section from its options, and marked for the exam: it stays after reloading.
    const primero = filaDe('Práctico 1');
    await primero.getByRole('button', { name: 'Opciones de Práctico 1' }).click();
    await primero.getByRole('button', { name: 'Sumar al parcial' }).click();
    await primero.getByLabel(/Pasar a otra sección/).selectOption({ label: 'Teoría del final' });
    await primero.getByRole('button', { name: 'Pasar', exact: true }).click();
    await pagina.getByText('Pasaste Práctico 1 a Teoría del final').waitFor();
    assert.deepEqual(await nombres('Teoría del final'), ['Resumen de teoría', 'Práctico 1']);
    assert.equal((await nombres('Prácticos'))[0], 'Práctico 2');

    // Dragged near the bottom of the screen the page goes down, near the top it goes up, and in the middle it stays.
    await pagina.evaluate(() => window.scrollTo(0, 0));
    const caja = await filaDe('Práctico 2').boundingBox();
    const alto = pagina.viewportSize().height;
    const scroll = () => pagina.evaluate(() => window.scrollY);
    await pagina.mouse.move(caja.x + 40, caja.y + caja.height / 2);
    await pagina.mouse.down();
    await pagina.mouse.move(caja.x + 60, caja.y + 30, { steps: 4 });
    for (let i = 0; i < 12; i++) await pagina.mouse.move(caja.x + 60 + (i % 2), alto - 4);
    await pagina.waitForTimeout(400);
    const abajo = await scroll();
    assert.ok(abajo > 0, 'baja sola');
    for (let i = 0; i < 12; i++) await pagina.mouse.move(caja.x + 60 + (i % 2), 70);
    await pagina.waitForTimeout(400);
    assert.ok(await scroll() < abajo, 'sube sola');
    await pagina.mouse.move(caja.x + 60, 4);
    await pagina.waitForFunction(() => window.scrollY === 0, null, { timeout: 5000 });
    await pagina.mouse.up();
    assert.equal((await nombres('Prácticos'))[0], 'Práctico 2', 'soltado sobre la cabecera no se mueve');

    // Dropped on another card it goes right before it, in the same section.
    await seccion('Teoría del final').scrollIntoViewIfNeeded();
    await pagina.evaluate(() => window.scrollBy(0, 150));
    const de = await filaDe('Práctico 1').boundingBox();
    const a = await filaDe('Resumen de teoría').boundingBox();
    await pagina.mouse.move(de.x + 40, de.y + de.height / 2);
    await pagina.mouse.down();
    await pagina.mouse.move(de.x + 50, de.y + 10, { steps: 4 });
    await pagina.mouse.move(a.x + 50, a.y + a.height / 2, { steps: 8 });
    await pagina.mouse.up();
    await pagina.waitForFunction(() => [...document.querySelectorAll('section.bloque')].at(-1).querySelector('.fila__nombre')?.textContent === 'Práctico 1', null, { timeout: 5000 });

    // Folded, it stays folded after reloading; the mark for the exam is kept in the course.
    await seccion('Teoría del final').locator('button.seccion__titulo').click();
    // Saved once it finished folding: then the body is hidden for real.
    await seccion('Teoría del final').locator('.seccion__cuerpo[hidden]').waitFor({ state: 'attached' });
    await pagina.reload();
    await seccion('Teoría del final').locator('button.seccion__titulo[aria-expanded="false"]').waitFor();
    await seccion('Teoría del final').locator('button.seccion__titulo').click();
    await filaDe('Práctico 1').getByText('Para el parcial').waitFor();
    await pagina.evaluate(() => window.scrollTo(0, 0));
    assert.deepEqual(await fallasAxe(), [], 'la materia tuya, arreglada en el lugar');
    await fin('propia-en-el-lugar');
    await pagina.setViewportSize({ width: 390, height: 844 });
    assert.equal(await seSale(), false, 'la materia tuya en 390');
    await fin('celular-propia-en-el-lugar');
    await pagina.setViewportSize({ width: 1280, height: 860 });
    await pagina.getByRole('link', { name: 'Editar' }).click();
    await boton('Borrar materia').click();
    await pagina.getByRole('dialog').getByRole('button', { name: 'Borrar materia' }).click();
    await pagina.getByRole('heading', { name: 'Materias', level: 1 }).waitFor();
    assert.equal(await pagina.evaluate(() => JSON.parse(localStorage.getItem('cl.mio.5')).materias.pflujos0001), undefined, 'sus marcas se van con ella');

    // A section of the campus gets the student's name, says the campus' one, and goes back to it.
    await ir('materias/1');
    await seccion('Notas 2023').locator('.seccion__mas').click();
    await seccion('Notas 2023').getByRole('button', { name: 'Cambiar nombre' }).click();
    await pagina.getByLabel('Nombre de la sección').fill('Notas de otros años');
    await pagina.keyboard.press('Enter');
    await pagina.waitForFunction(() => document.activeElement?.tagName === 'H2' && document.activeElement.textContent === 'Notas de otros años', null, { timeout: 5000 });
    await pagina.reload();
    await seccion('Notas de otros años').locator('.seccion__mas').click();
    await seccion('Notas de otros años').getByRole('button', { name: 'Cambiar nombre' }).click();
    await pagina.getByText('En el campus se llama Notas 2023').waitFor();
    assert.deepEqual(await fallasAxe(), [], 'renombrar una sección del campus');
    await boton('Volver al nombre del campus').click();
    await seccion('Notas 2023').waitFor();
    assert.equal(await pagina.getByRole('heading', { name: 'Notas de otros años' }).count(), 0);
  });

  await prueba('instalar Super CVG: manifest e íconos, Chromium la da por instalable sin service worker, el botón de Configuración y entrar abierta como app', async () => {
    // The manifest, as the page links it, with the colors of tokens.css.
    const tokens = fs.readFileSync(path.join(RAIZ, 'src/styles/tokens.css'), 'utf8');
    const token = (nombre) => new RegExp(`--${nombre}: (#[0-9a-f]{6});`, 'i').exec(tokens)[1].toLowerCase();
    const html = await (await fetch(base)).text();
    const enlace = /<link rel="manifest" href="([^"]+)"/.exec(html)?.[1];
    assert.ok(enlace, 'el HTML enlaza el manifest');
    const urlManifest = new URL(enlace, base).href;
    const respuesta = await fetch(urlManifest);
    assert.equal(respuesta.status, 200, 'el manifest carga');
    assert.match(respuesta.headers.get('content-type') ?? '', /application\/manifest\+json/);
    const manifest = await respuesta.json();
    assert.equal(manifest.name, 'Super CVG');
    assert.ok(manifest.short_name && manifest.short_name.length <= 12, 'short_name corto');
    assert.equal(manifest.id, '/');
    assert.equal(manifest.start_url, '/');
    assert.equal(manifest.scope, '/');
    assert.equal(manifest.display, 'standalone');
    assert.equal(manifest.theme_color.toLowerCase(), token('accion'));
    assert.equal(manifest.background_color.toLowerCase(), token('fondo'));
    // One of 192 and one of 512 for any shape, and a maskable one.
    const proposito = (i) => (i.purpose ?? 'any').split(' ');
    assert.ok(manifest.icons.some((i) => i.sizes === '192x192' && proposito(i).includes('any')), 'ícono de 192');
    assert.ok(manifest.icons.some((i) => i.sizes === '512x512' && proposito(i).includes('any')), 'ícono de 512');
    assert.ok(manifest.icons.some((i) => proposito(i).includes('maskable')), 'ícono maskable');
    const apple = /<link rel="apple-touch-icon" href="([^"]+)"/.exec(html)?.[1];
    assert.ok(apple, 'el ícono de iPhone y iPad');
    assert.equal((html.match(/<meta name="theme-color" content="#[0-9a-f]{6}" media="\(prefers-color-scheme: (light|dark)\)"/gi) ?? []).length, 2, 'theme-color claro y oscuro');
    assert.match(html, /<meta name="apple-mobile-web-app-title" content="Super CVG"/);

    // Each icon is a PNG and measures what the manifest says.
    const iconos = [...manifest.icons.map((i) => ({ url: new URL(i.src, urlManifest).href, sizes: i.sizes })), { url: new URL(apple, base).href, sizes: '180x180' }];
    for (const { url, sizes } of iconos) {
      const r = await fetch(url);
      assert.equal(r.status, 200, url);
      const png = Buffer.from(await r.arrayBuffer());
      assert.equal(png.subarray(1, 4).toString('latin1'), 'PNG', `${url} es un PNG`);
      // The width and height of a PNG, in its first chunk (IHDR).
      assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, sizes, `${url} mide ${sizes}`);
    }

    // Installable in Chromium, without a service worker. Not in a private window (every Playwright context is one): a
    // profile of its own, thrown away at the end. The real offer arrives too.
    const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'supercvg-instalable-'));
    const propio = await chromium.launchPersistentContext(perfil, opcionesNavegador(buscarChrome()));
    try {
      await propio.route('**/*', (r) => (r.request().url().startsWith(base) ? r.continue() : r.abort()));
      const p = propio.pages()[0] ?? await propio.newPage();
      await p.addInitScript(() => window.addEventListener('beforeinstallprompt', () => { window.__ofrecida = true; }));
      await p.goto(base);
      await p.waitForLoadState('load');
      const cdp = await propio.newCDPSession(p);
      assert.deepEqual((await cdp.send('Page.getAppManifest')).errors, [], 'el manifest sin errores');
      assert.deepEqual((await cdp.send('Page.getInstallabilityErrors')).installabilityErrors, [], 'Chromium la da por instalable');
      await p.waitForFunction(() => window.__ofrecida === true, null, { timeout: 10_000 });
      assert.equal(await p.evaluate(() => navigator.serviceWorker.controller), null, 'sin service worker');
    } finally {
      await propio.close();
      fs.rmSync(perfil, { recursive: true, force: true });
    }

    // Configuración, in a browser of its own: nothing of this touches the rest of the run.
    const app = await navegador.newContext({ viewport: { width: 1280, height: 860 } });
    await app.route('**/*', atender);
    const pestana = async ({ ventanaPropia = false, iphone = false } = {}) => {
      const p = await app.newPage();
      p.on('pageerror', (e) => errores.push(e.message));
      p.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
      if (iphone) {
        await p.setViewportSize({ width: 390, height: 844 });
        const cdp = await app.newCDPSession(p);
        await cdp.send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1', platform: 'iPhone' });
      }
      await p.addInitScript(instalacionSimulada, { ventanaPropia });
      return p;
    };
    const tarjeta = (p) => p.locator('.instalar');
    const instalarBoton = (p) => p.getByRole('button', { name: 'Instalar', exact: true });
    const dispositivos = (p) => p.locator('section', { has: p.getByRole('heading', { name: 'Tus dispositivos', level: 2 }) });
    const seSale = (p) => p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    const axe = AXE;
    const fallasAxe = async (p) => {
      await p.evaluate(axe);
      return p.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })).violations.map((v) => `${v.id}: ${v.nodes[0].target}`));
    };
    const entrarEn = async (p, { seguir = false } = {}) => {
      await p.goto(base);
      await p.getByLabel('Usuario').fill('alumno');
      await p.getByLabel('Contraseña').fill(CONTRASENA);
      if (seguir) await p.getByLabel('Seguir conectado en este dispositivo').check();
      await p.getByRole('button', { name: 'Entrar', exact: true }).click();
      await p.getByRole('heading', { name: 'Hola, Ana' }).waitFor();
    };
    try {
      // In the browser, with the offer: the button, in «Tus dispositivos».
      const compu = await pestana();
      await entrarEn(compu);
      await compu.goto(`${base}configuracion#datos`);
      await dispositivos(compu).locator('.instalar').getByText('Instalar Super CVG').waitFor();
      await instalarBoton(compu).waitFor();
      await compu.getByText('Queda con su ícono entre tus apps y se abre sin la barra del navegador. Con «Seguir conectado» no te pide la contraseña cada vez.').waitFor();
      assert.equal(await compu.locator('.instalar__pasos').count(), 0, 'sin los pasos de iPhone');
      assert.deepEqual(await fallasAxe(compu), [], 'Configuración con «Instalar Super CVG»');
      await compu.screenshot({ path: path.join(CAPTURAS, 'instalar-1280.png') });
      await compu.setViewportSize({ width: 390, height: 844 });
      assert.equal(await seSale(compu), false, 'en 390 no se sale');
      await dispositivos(compu).screenshot({ path: path.join(CAPTURAS, 'instalar-390.png') });
      await compu.setViewportSize({ width: 1280, height: 860 });

      // Opened as an installed app it isn't offered, and back in the browser it is again.
      await compu.evaluate(() => window.__ventanaPropia(true));
      await tarjeta(compu).waitFor({ state: 'detached' });
      await compu.getByRole('heading', { name: 'Tus dispositivos', level: 2 }).waitFor();
      await compu.evaluate(() => window.__ventanaPropia(false));
      await instalarBoton(compu).waitFor();

      // The button opens the browser's window once; accepted, it says so, the card goes and the focus stays in its section.
      await instalarBoton(compu).click();
      await compu.getByText('Super CVG quedó instalada').waitFor();
      assert.equal(await compu.evaluate(() => window.__instalacion.pedidos), 1);
      assert.equal(await tarjeta(compu).count(), 0, 'instalada, no se ofrece más');
      assert.equal(await compu.evaluate(() => document.activeElement?.textContent), 'Tus dispositivos', 'el foco, en el título de la sección');

      // Cancelled, the offer is used up: the card goes until the browser offers again (the next time the page loads).
      await compu.reload();
      await instalarBoton(compu).waitFor();
      await compu.evaluate(() => { window.__instalacion.respuesta = 'dismissed'; });
      await instalarBoton(compu).click();
      await tarjeta(compu).waitFor({ state: 'detached' });
      assert.equal(await compu.getByText('Super CVG quedó instalada').count(), 0);
      await compu.reload();
      await instalarBoton(compu).waitFor();

      // Opened as an app the session is a new tab's: it signs in, and with «Seguir conectado» it gets in alone the next time.
      const abierta = await pestana({ ventanaPropia: true });
      await entrarEn(abierta, { seguir: true });
      assert.equal(await abierta.evaluate(() => matchMedia('(display-mode: standalone)').matches), true);
      await abierta.goto(`${base}configuracion#datos`);
      await abierta.getByRole('heading', { name: 'Tus dispositivos', level: 2 }).waitFor();
      assert.equal(await tarjeta(abierta).count(), 0, 'abierta como app no se ofrece');
      const otraVez = await pestana({ ventanaPropia: true });
      await otraVez.goto(base);
      await otraVez.getByRole('heading', { name: 'Hola, Ana' }).waitFor();

      // Safari on iPhone: no button, the steps by hand from Compartir. Opened from the home screen, nothing.
      const iphone = await pestana({ iphone: true });
      await iphone.goto(`${base}configuracion#datos`);
      await tarjeta(iphone).getByText('Tocá Compartir').waitFor();
      await tarjeta(iphone).getByText('Elegí «Agregar a inicio» y confirmá con Agregar.').waitFor();
      assert.equal(await instalarBoton(iphone).count(), 0, 'en iPhone no hay botón');
      assert.equal(await seSale(iphone), false, 'iPhone en 390 no se sale');
      assert.deepEqual(await fallasAxe(iphone), [], 'Configuración con los pasos de iPhone');
      await dispositivos(iphone).screenshot({ path: path.join(CAPTURAS, 'instalar-iphone.png') });
      await iphone.evaluate(() => window.__ventanaPropia(true));
      await tarjeta(iphone).waitFor({ state: 'detached' });
    } finally {
      await app.close();
    }
  });

  await prueba('laboratorio: Python y SQL de verdad en el navegador, con input(), errores en su línea, Parar, el tope de salida, y el código de un PDF', async () => {
    // Alone (FLUJOS_SOLO) it starts from the sign-in.
    await ir('laboratorio');
    const usuario = pagina.getByLabel('Usuario');
    const titulo = pagina.getByRole('heading', { name: 'Laboratorio', level: 1 });
    await Promise.race([usuario.waitFor().catch(() => {}), titulo.waitFor().catch(() => {})]);
    if (await usuario.isVisible()) {
      await usuario.fill('alumno');
      await pagina.getByLabel('Contraseña').fill(CONTRASENA);
      await boton('Entrar').click();
      await pagina.getByRole('heading', { name: 'Hola, Ana' }).waitFor();
      await ir('laboratorio');
    }
    const antes = errores.length;
    const pedidosAntes = pedidos.length;
    // What each engine downloads the first time, from the site and nowhere else.
    const bajado = new Map();
    const anotar = async (r) => {
      const url = r.url();
      if (!url.includes('/motores/') && !/\.worker-[\w-]+\.js$|sql-wasm|pyodide/.test(url)) return;
      const tam = await r.sizes().catch(() => null);
      bajado.set(url.replace(base, ''), tam ? tam.responseBodySize : 0);
    };
    pagina.on('requestfinished', anotar);
    const estado = pagina.locator('.laboratorio__estado');
    const consola = pagina.getByRole('region', { name: 'Salida' });
    const editor = pagina.getByRole('textbox', { name: /^Código en / });
    // The code, pasted as the student would: CodeMirror leaves it as it is.
    const escribir = async (codigo) => {
      await pagina.evaluate((t) => navigator.clipboard.writeText(t), codigo);
      await editor.click();
      await pagina.keyboard.press('ControlOrMeta+A');
      await pagina.keyboard.press('ControlOrMeta+V');
      await pagina.waitForFunction((t) => document.querySelector('.cm-content').innerText.replace(/\u00a0/g, ' ').trim() === t.trim(), codigo);
    };
    const correr = async () => {
      await editor.press('ControlOrMeta+Enter');
    };
    try {
      await titulo.waitFor();
      // The engine loads on its own with the lab open; the first time, with its wait.
      const desde = Date.now();
      await estado.getByText('Listo para correr.').waitFor({ timeout: 90_000 });
      const msPython = Date.now() - desde;

      // input(): the field right after the question, named by it.
      await escribir('nombre = input("¿Cómo te llamás? ")\nprint(f"Hola, {nombre}")');
      await correr();
      const campo = consola.getByRole('textbox', { name: '¿Cómo te llamás?' });
      await campo.waitFor();
      assert.equal(await pagina.evaluate(() => document.activeElement.getAttribute('aria-label')), '¿Cómo te llamás?', 'el foco va al campo');
      await estado.getByText('Esperando lo que escribas.').waitFor();
      await campo.fill('Ana');
      await campo.press('Enter');
      await consola.getByText('Hola, Ana').waitFor();
      await estado.getByText(/^Terminó en /).waitFor();
      assert.match(await consola.innerText(), /¿Cómo te llamás\? Ana\s+Hola, Ana/);

      // An error as Python says it, with its line marked in the editor and a way to go there.
      await escribir('x = 1\ny = 2\nprint(x + z)');
      await correr();
      await estado.getByText('Error en la línea 3.').waitFor();
      await consola.getByText("NameError: name 'z' is not defined").waitFor();
      assert.match(await consola.innerText(), /line 3/);
      assert.doesNotMatch(await consola.innerText(), /<laboratorio>|_correr|pyodide/, 'sin lo de adentro del laboratorio');
      assert.equal(await pagina.locator('.cm-line').nth(2).getAttribute('class').then((c) => c.includes('editor__linea-error')), true, 'la línea 3, marcada');
      await consola.getByRole('button', { name: 'Ir a la línea 3' }).click();
      assert.equal(await pagina.evaluate(() => document.activeElement.classList.contains('cm-content')), true);
      await pagina.keyboard.type('#');
      assert.equal(await pagina.locator('.editor__linea-error').count(), 0, 'al cambiar el código se va la marca');
      // A syntax error, too.
      await escribir('def f(:\n    pass');
      await correr();
      await estado.getByText('Error en la línea 1.').waitFor();
      await consola.getByText('SyntaxError', { exact: false }).first().waitFor();

      // «Parar» ends a loop that never ends, and the next run works.
      await escribir('while True:\n    pass');
      await correr();
      await estado.getByText('Corriendo.').waitFor();
      await pagina.waitForTimeout(500);
      await boton('Parar').click();
      await consola.getByText('Lo paraste.').waitFor();
      await pagina.locator('.laboratorio__correr[data-fase="listo"]').waitFor({ timeout: 60_000 });
      // What the last run left in the engine went with it.
      await escribir('print(2 + 2)\nprint("x" in dir())');
      await correr();
      await consola.locator('.consola__texto', { hasText: /^4\s+False\s*$/ }).waitFor();

      // numpy: the page brings it from the site when a program imports it, and the engine that «Parar» left has none.
      await escribir('import numpy as np\nA = np.array([[2, 4, 6], [4, 0, 6], [3, 0, -2]])\nprint(round(float(np.linalg.det(A))))\nprint(np.linalg.inv(A)[1])');
      await correr();
      await consola.locator('.consola__texto', { hasText: /^104\s+\[\s*0\.25\s+-0\.21153846\s+0\.11538462\]\s*$/ }).waitFor({ timeout: 60_000 });
      await estado.getByText(/^Terminó en /).waitFor();
      // sqlite3 comes with Python.
      await escribir("import sqlite3\ncon = sqlite3.connect(':memory:')\ncon.execute('CREATE TABLE ventas (cliente TEXT, monto REAL)')\ncon.executemany('INSERT INTO ventas VALUES (?, ?)', [('Ana', 2.5), ('Bruno', 4.15)])\nprint(con.execute('SELECT COUNT(*), SUM(monto) FROM ventas').fetchone())");
      await correr();
      await consola.locator('.consola__texto', { hasText: /^\(2, 6\.65\)\s*$/ }).waitFor();
      // pandas and matplotlib, with what they need, from the site: a CSV read, and each figure as a picture.
      await escribir("import pandas as pd\nimport matplotlib.pyplot as plt\nwith open('personas.csv', 'w') as f:\n    f.write('nombre,edad,peso\\nAna,23,58\\nBruno,31,80\\nCarla,27,64\\n')\ndatos = pd.read_csv('personas.csv')\nprint(datos['peso'].mean())\ndatos.plot(kind='scatter', x='edad', y='peso', color='red')\nplt.savefig('personas.png')\nplt.show()\nplt.bar(datos['nombre'], datos['edad'])\nplt.show()");
      await correr();
      await consola.locator('.consola__texto', { hasText: /^67\.33333333333333\s*$/ }).waitFor({ timeout: 90_000 });
      await estado.getByText(/^Terminó en /).waitFor();
      const graficos = consola.getByRole('img', { name: 'Gráfico de matplotlib' });
      await graficos.nth(1).waitFor();
      assert.equal(await graficos.count(), 2, 'savefig y después show, una sola vez cada figura');
      assert.ok(await graficos.first().evaluate((img) => img.complete && img.naturalWidth === 640 && img.src.startsWith('blob:')), 'el gráfico se ve, desde un blob');
      // What needs a network or a window fails as Python says it, with why under it.
      await escribir('import pymysql');
      await correr();
      await consola.getByText("ModuleNotFoundError: No module named 'pymysql'").waitFor();
      await consola.getByText('necesita un servidor de base de datos y acá no hay red.', { exact: false }).waitFor();
      // «Chapin»: the program as the diagrams of AED, read by Python without running it. What doesn't fit a Chapin
      // stays as written, a syntax error says its line and keeps the drawing, and «Bajar como imagen» gives a PNG.
      await escribir('n = int(input("Cantidad: "))\nwhile n <= 0:\n    n = int(input("Mayor que 0: "))\nif n > 10:\n    print("Muchos")\nelse:\n    print("Pocos")\ntry:\n    x = 1 / n\nexcept ZeroDivisionError:\n    x = 0');
      await pagina.getByRole('tab', { name: 'Chapin' }).click();
      const hojaChapin = pagina.getByRole('tabpanel', { name: 'Chapin' });
      const diagrama = hojaChapin.getByRole('img', { name: 'Chapin de Programa principal' });
      await diagrama.waitFor();
      assert.deepEqual(await diagrama.locator('text').allTextContents(), ['Programa principal', 'Leer(n)', 'Mientras n <= 0:', 'Leer(n)', 'n > 10', 'v', 'f', 'Mostrar("Muchos")', 'Mostrar("Pocos")', 'try:', '    x = 1 / n', 'except ZeroDivisionError:', '    x = 0']);
      const enPalabras = await diagrama.evaluate((svg) => document.getElementById(svg.getAttribute('aria-describedby')).textContent);
      assert.match(enPalabras, /Si n > 10.*Verdadero.*Mostrar\("Muchos"\).*Falso.*Mostrar\("Pocos"\).*Sin dibujar, como está escrito/s);
      await escribir('if n > 10\n    print("Muchos")');
      await hojaChapin.getByText('Hay un error en la línea 1. Queda el Chapin de antes.').waitFor();
      assert.equal(await diagrama.isVisible(), true, 'el dibujo de antes sigue');
      const [descarga] = await Promise.all([pagina.waitForEvent('download'), hojaChapin.getByRole('button', { name: 'Bajar como imagen' }).click()]);
      assert.match(descarga.suggestedFilename(), /^chapin-.+\.png$/);
      const png = fs.readFileSync(await descarga.path());
      assert.equal(png.subarray(1, 4).toString(), 'PNG');
      await pagina.getByRole('tab', { name: 'Consola' }).click();

      // Too much output: it's cut, with its notice, and the page doesn't freeze.
      await escribir('while True:\n    print("x" * 1000)');
      await correr();
      await consola.getByText('Imprimió más de 100.000 caracteres y lo cortamos.').waitFor({ timeout: 30_000 });
      assert.ok((await consola.locator('.consola__texto').first().innerText()).length <= 101_000);
      await pagina.locator('.laboratorio__correr[data-fase="listo"]').waitFor({ timeout: 60_000 });

      // SQL: the practice database, results as tables, an error in its line, and back to how it came.
      await pagina.getByRole('radio', { name: 'SQL' }).check();
      await pagina.locator('.laboratorio__correr[data-fase="listo"]').waitFor({ timeout: 60_000 });
      await pagina.getByRole('tab', { name: 'Base' }).click();
      const tablas = pagina.getByRole('region', { name: 'Base de práctica' });
      await tablas.getByText('solicitud_contrato').first().waitFor();
      await escribir("SELECT direccion, zona FROM propiedad\nWHERE situacion = 'en oferta'\nORDER BY direccion;");
      await correr();
      const tabla = consola.getByRole('region', { name: 'Resultado de la línea 1' });
      await tabla.waitFor();
      assert.deepEqual(await tabla.locator('th').allInnerTexts(), ['direccion', 'zona']);
      assert.ok((await tabla.locator('tbody tr').count()) >= 2);
      await escribir('SELECT COUNT(*) AS cuantas FROM visita;\nSELECT * FORM persona;');
      await correr();
      await estado.getByText('Error en la línea 2.').waitFor();
      await consola.getByText('near "FORM": syntax error', { exact: false }).waitFor();
      const total = await consola.getByRole('region', { name: 'Resultado de la línea 1' }).locator('tbody td').innerText();
      await escribir('DELETE FROM visita;');
      await correr();
      await consola.getByText(`Línea 1, listo. Cambiaron ${total} filas.`).waitFor();
      await escribir('SELECT COUNT(*) AS cuantas FROM visita;');
      await correr();
      await consola.locator('tbody td', { hasText: /^0$/ }).waitFor();
      await pagina.getByRole('tab', { name: 'Base' }).click();
      await boton('Reiniciar la base').click();
      // With tables there, it asks first.
      await pagina.getByRole('dialog', { name: '¿Reiniciar la base?' }).getByRole('button', { name: 'Reiniciar la base' }).click();
      await pagina.waitForTimeout(300);
      await correr();
      await consola.locator('tbody td', { hasText: new RegExp(`^${total}$`) }).waitFor();

      // Saved as theirs, by course: choosing the course saves the draft there. It stays after reloading, and the
      // draft starts again.
      await pagina.getByLabel('Nombre', { exact: true }).fill('Inscriptos');
      await pagina.getByLabel('Materia', { exact: true }).selectOption({ label: 'Materia A' });
      await pagina.getByText('Guardaste «Inscriptos».').waitFor();
      await pagina.getByText('Se guarda solo').waitFor();
      const guardados = await pagina.evaluate(() => JSON.parse(localStorage.getItem('cl.mio.5')).laboratorio);
      assert.equal(guardados.length, 1);
      assert.equal(guardados[0].nombre, 'Inscriptos');
      assert.equal(guardados[0].lenguaje, 'sql');
      assert.equal(guardados[0].materia, 1);
      await ir('laboratorio');
      await pagina.locator('.laboratorio__materia', { hasText: 'Materia A' }).getByRole('button', { name: /^Inscriptos/ }).waitFor();

      // «Probar en el laboratorio» from a PDF of the campus: with its indentation, the language it is, and only in memory.
      apunteConCodigo = true;
      await ir('materias/1');
      const hoja = pagina.getByRole('dialog');
      await fila('Apunte uno').click();
      await hoja.locator('.lector__pagina[data-pagina="1"] .textLayer span', { hasText: 'def factorial' }).waitFor();
      await pagina.evaluate(() => {
        const spans = [...document.querySelectorAll('.lector__pagina[data-pagina="1"] .textLayer span')];
        const desde = spans.find((e) => e.textContent.startsWith('def factorial')).firstChild;
        const hasta = spans.filter((e) => e.textContent.trim()).at(-1).firstChild;
        const r = document.createRange();
        r.setStart(desde, 0);
        r.setEnd(hasta, hasta.data.length);
        getSelection().removeAllRanges();
        getSelection().addRange(r);
      });
      const barra = hoja.getByRole('toolbar', { name: 'Resaltar lo seleccionado' });
      await barra.getByRole('button', { name: 'Probar en el laboratorio' }).click();
      await pagina.waitForURL(/\/laboratorio$/);
      await titulo.waitFor();
      assert.equal(await pagina.getByRole('radio', { name: 'Python' }).isChecked(), true, 'adivinó Python');
      await pagina.getByText('Viene de «Apunte uno», página 1. Queda solo en esta pestaña hasta que lo guardes.').waitFor();
      const texto = await pagina.evaluate(() => [...document.querySelectorAll('.cm-line')].map((l) => l.textContent.replace(/\u00a0/g, ' ')).join('\n'));
      assert.equal(texto, 'def factorial(n):\n    if n <= 1:\n        return 1\n    return n * factorial(n - 1)\nn = int(input("Número: "))\nprint(f"{n}! = {factorial(n)}")', JSON.stringify(texto));
      assert.equal(await pagina.getByLabel('Materia', { exact: true }).inputValue(), '1', 'la materia del apunte');
      const disco = await pagina.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }) + location.href + document.title + history.length);
      assert.ok(!disco.includes('factorial'), 'el código del campus queda en memoria hasta que lo guardes');
      await pagina.locator('.laboratorio__correr[data-fase="listo"]').waitFor({ timeout: 60_000 });
      await correr();
      await consola.getByRole('textbox', { name: 'Número:' }).fill('5');
      await consola.getByRole('textbox', { name: 'Número:' }).press('Enter');
      await consola.getByText('5! = 120').waitFor();
      // Opening another file stops what was waiting, and nothing of it reaches the next one.
      await correr();
      await consola.getByRole('textbox', { name: 'Número:' }).waitFor();
      const archivos = pagina.locator('.lab-explorador');
      await archivos.getByRole('button', { name: /^Inscriptos/ }).click();
      await pagina.locator('.laboratorio__correr[data-fase="listo"]').waitFor({ timeout: 60_000 });
      await archivos.getByRole('button', { name: /^Sin guardar/ }).click();
      await pagina.locator('.laboratorio__correr[data-fase="listo"]').waitFor({ timeout: 60_000 });
      await estado.getByText('Listo para correr.').waitFor();
      assert.equal(await consola.getByRole('textbox').count(), 0, 'lo que esperaba se fue con su archivo');

      // The keys: Esc and then Tab leave the editor, with no trap.
      await editor.click();
      await pagina.keyboard.press('Escape');
      await pagina.keyboard.press('Tab');
      assert.equal(await pagina.evaluate(() => document.activeElement.closest('.cm-editor') === null), true, 'Esc y Tab salen del editor');

      // Nothing to anywhere else, and the engines come from the site. Classroom and Drive, connected by earlier flows,
      // keep their own timers in the background: what they ask in the meantime is not the lab's.
      const deGoogle = (u) => /^https:\/\/(classroom|www|oauth2)\.googleapis\.com\//.test(u);
      assert.deepEqual(pedidos.slice(pedidosAntes).map((p) => p.url).filter((u) => !u.startsWith(CAMPUS) && !deGoogle(u)), [], 'el laboratorio no pide nada afuera');
      assert.ok([...bajado.keys()].some((u) => u.endsWith('motores/python/pyodide.asm.wasm')), 'Python bajó del sitio');
      for (const p of ['numpy', 'pandas', 'matplotlib', 'pillow']) assert.ok([...bajado.keys()].some((u) => new RegExp(`motores/python/${p}-[\\w.-]+\\.whl$`).test(u)), `${p} bajó del sitio`);
      assert.ok([...bajado.keys()].some((u) => u.endsWith('motores/sql/sql-wasm-browser.wasm')), 'SQL bajó del sitio');
      const reales = errores.slice(antes).filter((e) => !/Failed to load resource/.test(e));
      assert.deepEqual(reales, [], 'sin errores en la consola, incluida la CSP');
      const peso = (filtro) => [...bajado].filter(([u]) => filtro.test(u)).reduce((n, [, b]) => n + b, 0);
      console.log(`      Python listo en ${(msPython / 1000).toFixed(1)} s, ${(peso(/python|pyodide/) / 1e6).toFixed(2)} MB; SQL ${(peso(/sql/) / 1e6).toFixed(2)} MB`);
      await fin('laboratorio');
    } finally {
      apunteConCodigo = false;
      pagina.off('requestfinished', anotar);
    }
  });

  await prueba('laboratorio paso a paso: recorre un programa con input(), listas compartidas y recursión, corta a los 1.000 pasos y mide cuánto tarda una función', async () => {
    // Alone (FLUJOS_SOLO) it starts from the sign-in.
    await ir('laboratorio');
    const usuario = pagina.getByLabel('Usuario');
    const titulo = pagina.getByRole('heading', { name: 'Laboratorio', level: 1 });
    await Promise.race([usuario.waitFor().catch(() => {}), titulo.waitFor().catch(() => {})]);
    if (await usuario.isVisible()) {
      await usuario.fill('alumno');
      await pagina.getByLabel('Contraseña').fill(CONTRASENA);
      await boton('Entrar').click();
      await pagina.getByRole('heading', { name: 'Hola, Ana' }).waitFor();
      await ir('laboratorio');
    }
    const antes = errores.length;
    const pedidosAntes = pedidos.length;
    const estado = pagina.locator('.laboratorio__estado');
    const consola = pagina.getByRole('region', { name: 'Salida' });
    const editor = pagina.getByRole('textbox', { name: /^Código en / });
    const pasos = pagina.getByRole('region', { name: 'Paso a paso' });
    const cuenta = pasos.locator('.pasos__cuenta');
    const frase = pasos.locator('.pasos__frase');
    const deslizador = pasos.getByRole('slider', { name: 'Ir a un paso' });
    const listo = () => pagina.locator('.laboratorio__correr[data-fase="listo"]').waitFor({ timeout: 60_000 });
    const escribir = async (codigo) => {
      await pagina.evaluate((t) => navigator.clipboard.writeText(t), codigo);
      await editor.click();
      await pagina.keyboard.press('ControlOrMeta+A');
      await pagina.keyboard.press('ControlOrMeta+V');
      // Line by line: innerText doubles the empty ones.
      await pagina.waitForFunction((t) => [...document.querySelectorAll('.cm-line')].map((l) => l.textContent.replace(/\u00a0/g, ' ')).join('\n').trim() === t.trim(), codigo);
    };
    // The editor's arrows: the line with the full one (the one that goes next) and the hollow one (the one that ran).
    const lineaCon = (clase) => pagina.evaluate((c) => [...document.querySelectorAll('.cm-line')].findIndex((l) => l.classList.contains(c)) + 1, clase);
    const axe = AXE;
    const fallasAxe = async () => {
      await pagina.evaluate(axe);
      return pagina.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })).violations.map((v) => `${v.id}: ${v.nodes[0].target}`));
    };
    const seSale = () => pagina.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    try {
      await titulo.waitFor();
      const python = pagina.getByRole('radio', { name: 'Python' });
      if (!(await python.isChecked())) await python.check();
      await listo();

      // It runs as always, input() in the console, and then the steps take the console's place, from the first.
      await escribir('def agregar(lista, x):\n    lista.append(x)\n    return len(lista)\n\na = [3, 1]\nb = a\nn = int(input("¿Cuántos? "))\nfor i in range(n):\n    agregar(b, i * 10)\n\ndef fact(k):\n    if k <= 1:\n        return 1\n    return k * fact(k - 1)\n\nprint(a, fact(3))');
      await boton('Paso a paso').click();
      const campo = consola.getByRole('textbox', { name: '¿Cuántos?' });
      await campo.fill('2');
      await campo.press('Enter');
      await pasos.waitFor();
      await estado.getByText(/^Son \d+ pasos\.$/).waitFor();
      const total = Number((await estado.innerText()).match(/\d+/)[0]);
      assert.equal(await consola.isVisible(), false, 'los pasos van en lugar de la salida');
      assert.equal(await pagina.evaluate(() => document.activeElement.textContent), 'Siguiente', 'el foco va a Siguiente');
      assert.equal(await cuenta.innerText(), `Paso 1 de ${total}`);
      assert.equal(await frase.innerText(), 'Va a correr la línea 1.');
      assert.equal(await lineaCon('editor__linea-sigue'), 1, 'la línea 1, con la flecha');
      await pasos.getByText('Todavía no imprimió nada.').waitFor();

      // Forward with →, until it goes into the function: the two variables point to the same list, with their arrows.
      for (let i = 0; i < 40 && !/^Entra a agregar/.test(await frase.innerText()); i++) await pagina.keyboard.press('ArrowRight');
      assert.equal(await frase.innerText(), 'Entra a agregar con lista = lista 1 y x = 0.');
      assert.deepEqual([await lineaCon('editor__linea-sigue'), await lineaCon('editor__linea-recien')], [1, 9], 'sigue en el def, viene del for');
      const principal = pasos.locator('.marco', { hasText: 'Programa principal' });
      for (const v of ['a', 'b']) assert.equal(await principal.locator('.marco__variable', { has: pagina.locator(`dt:text-is("${v}")`) }).locator('dd').innerText(), 'lista 1', `${v} apunta a la lista 1`);
      assert.equal(await pasos.locator('.objeto').count(), 1, 'una sola lista');
      assert.ok((await pasos.locator('.pasos__flechas path').count()) >= 3, 'las flechas de a, b y lista');
      assert.match(await pasos.locator('.pasos__texto').innerText(), /^¿Cuántos\? 2\s*$/, 'la salida hasta acá, con lo que se escribió');
      // The step is said after a pause, once.
      await pasos.getByRole('status').getByText(/^Paso \d+ de \d+\. Entra a agregar con lista = lista 1 y x = 0\.$/).waitFor();
      await pagina.keyboard.press('ArrowLeft');
      assert.equal(await frase.innerText(), 'Va a correr la línea 9.');
      // In the editor the arrows are its own: the step doesn't move.
      const ahora = await cuenta.innerText();
      await editor.click();
      await pagina.keyboard.press('ArrowRight');
      assert.equal(await cuenta.innerText(), ahora, 'en el editor, las flechas mueven el cursor');

      // The slider goes to any step: the end, and the deepest call of the recursion.
      await deslizador.focus();
      await deslizador.press('End');
      assert.equal(await frase.innerText(), 'Terminó.');
      assert.match(await pasos.locator('.pasos__texto').innerText(), /\[3, 1, 0, 10\] 6/);
      assert.equal(await boton('Siguiente').getAttribute('aria-disabled'), 'true');
      const deFact = pasos.locator('.marco').filter({ has: pagina.locator('.marco__nombre', { hasText: /^fact/ }) });
      let hondo = 0;
      for (let i = total; i > 0 && !hondo; i--) {
        await deslizador.fill(String(i));
        if ((await deFact.count()) === 3) hondo = i;
      }
      assert.ok(hondo, 'tres llamadas a fact, una arriba de la otra');
      assert.deepEqual(await deFact.locator('.marco__variable:not(.marco__variable--devuelve) dd').allInnerTexts(), ['3', '2', '1']);
      assert.deepEqual(await fallasAxe(), [], 'el paso a paso, accesible');
      assert.equal(await seSale(), false);
      await pagina.setViewportSize({ width: 390, height: 844 });
      await pagina.waitForTimeout(200);
      assert.equal(await seSale(), false, 'en 390 no se sale');
      assert.deepEqual(await fallasAxe(), [], 'el paso a paso en 390');
      await fin('laboratorio-paso-390');
      await pagina.setViewportSize({ width: 1280, height: 860 });

      // Changing the code puts the console back: the steps were of the code before.
      await editor.click();
      await pagina.keyboard.press('End');
      await pagina.keyboard.type(' ');
      await pasos.waitFor({ state: 'detached' });
      assert.equal(await consola.isVisible(), true);
      assert.equal(await lineaCon('editor__linea-sigue'), 0, 'sin flechas');

      // A loop that never ends: 1.000 steps, said, and the program stops there.
      await escribir('i = 0\nwhile True:\n    i += 1');
      await boton('Paso a paso').click();
      await pasos.getByText('Muestra los primeros 1.000 pasos. Probá con datos más chicos.').waitFor({ timeout: 30_000 });
      assert.equal(await cuenta.innerText(), 'Paso 1 de 1.000');
      await estado.getByText('Lo paramos a los 1.000 pasos.').waitFor();
      await pasos.getByRole('button', { name: 'Cerrar' }).click();
      assert.equal(await pagina.evaluate(() => document.activeElement.textContent), 'Paso a paso', 'el foco vuelve al botón');
      // A syntax error stays in the console, as always.
      await escribir('def f(:\n    pass');
      await boton('Paso a paso').click();
      await estado.getByText('Error en la línea 1.').waitFor();
      assert.equal(await pasos.count(), 0);
      // An error while it runs: the steps up to it, and the last one says it.
      await escribir('x = [1, 2]\nprint(x[5])');
      await boton('Paso a paso').click();
      await estado.getByText(/^Son \d+ pasos\. El último es el error\.$/).waitFor();
      await deslizador.focus();
      await deslizador.press('End');
      assert.equal(await frase.innerText(), 'Terminó con un error en la línea 2.');
      assert.equal(await pasos.locator('.pasos__error').innerText(), 'IndexError: list index out of range');
      assert.equal(await lineaCon('editor__linea-recien'), 2, 'la línea del error, con la flecha hueca');

      // Measuring: the function, how to call it and the sizes, a chart with the curve and what it means.
      await escribir('def burbuja(lista):\n    n = len(lista)\n    for i in range(n):\n        for j in range(n - 1 - i):\n            if lista[j] > lista[j + 1]:\n                lista[j], lista[j + 1] = lista[j + 1], lista[j]\n    return lista\n\ndef leer(n):\n    return input()\n\ndef fib(n):\n    return n if n < 2 else fib(n - 1) + fib(n - 2)');
      await pagina.getByRole('tab', { name: 'Medir tiempos' }).click();
      const medir = pagina.getByRole('tabpanel', { name: 'Medir tiempos' });
      assert.equal(await medir.getByLabel('Qué medís').inputValue(), 'burbuja');
      const llamada = medir.getByLabel('Cómo la llamás');
      assert.equal(await llamada.inputValue(), 'list(range(n, 0, -1))', 'una lista al revés, el peor caso');
      await medir.getByLabel('Tamaños de n').fill('100, 200');
      await medir.getByRole('button', { name: 'Medir', exact: true }).click();
      await medir.getByRole('alert').getByText('Poné al menos tres tamaños distintos.').waitFor();
      await medir.getByLabel('Tamaños de n').fill('100, 200, 400, 800, 1600');
      await medir.getByRole('button', { name: 'Medir', exact: true }).click();
      await medir.getByRole('status').getByText('Se midieron 5 tamaños.').waitFor({ timeout: 60_000 });
      await medir.getByText('Crece como n².').waitFor();
      await medir.getByText('Si n se duplica, tarda cuatro veces más.').waitFor();
      assert.equal(await medir.locator('.medir__punto').count(), 5);
      assert.equal(await medir.locator('.medir__curva').count(), 1);
      assert.deepEqual(await medir.locator('tbody td:first-child').allInnerTexts(), ['100', '200', '400', '800', '1.600']);
      assert.deepEqual(await fallasAxe(), [], 'medir tiempos, accesible');
      await fin('laboratorio-medir');
      // A call that doesn't work, said next to its field.
      await llamada.fill('lista(n)');
      await medir.getByRole('button', { name: 'Medir', exact: true }).click();
      await medir.getByRole('alert').getByText("Así no se puede llamar. NameError: name 'lista' is not defined").waitFor({ timeout: 30_000 });
      assert.equal(await llamada.evaluate((e) => e === document.activeElement), true, 'el foco va al campo');
      // A function that asks with input() can't be measured.
      await medir.getByLabel('Qué medís').selectOption('leer');
      await medir.getByRole('button', { name: 'Medir', exact: true }).click();
      await medir.getByText('leer usa input(). Pasale los datos como parámetros.').waitFor({ timeout: 30_000 });
      // Parar keeps what it measured until then.
      await medir.getByLabel('Qué medís').selectOption('fib');
      assert.equal(await llamada.inputValue(), 'n');
      await medir.getByLabel('Tamaños de n').fill('18, 22, 26, 30, 34');
      await medir.getByRole('button', { name: 'Medir', exact: true }).click();
      await medir.locator('tbody tr').first().waitFor({ timeout: 30_000 });
      await medir.getByRole('button', { name: 'Parar la medición' }).click();
      await medir.getByRole('status').getByText('Lo paraste.').waitFor();
      assert.ok((await medir.locator('tbody tr').count()) >= 1, 'lo medido queda');
      await listo();
      // Another function: what was measured is of the one before, and comes back with it.
      await medir.getByLabel('Qué medís').selectOption('burbuja');
      assert.equal(await medir.locator('tbody tr').count(), 0, 'lo de fib no va con burbuja');
      await medir.getByLabel('Qué medís').selectOption('fib');
      assert.ok((await medir.locator('tbody tr').count()) >= 1, 'vuelve con fib');
      // The whole program: its laps, and in which of its functions the time goes.
      await escribir('def cuadrado(n):\n    return sum(i * i for i in range(n))\n\ndef doble(n):\n    return [cuadrado(k) for k in range(n)]\n\nprint(len(doble(300)))');
      await medir.getByLabel('Qué medís').selectOption('Todo el programa');
      await medir.getByLabel('Veces').fill('11');
      await medir.getByRole('button', { name: 'Medir', exact: true }).click();
      await medir.getByRole('alert').getByText('Poné cuántas veces, de 1 a 10.').waitFor();
      await medir.getByLabel('Veces').fill('3');
      await medir.getByRole('button', { name: 'Medir', exact: true }).click();
      await medir.getByRole('status').getByText('Lo corrió 3 veces.').waitFor({ timeout: 60_000 });
      await medir.getByText(/^Tu programa tarda .+\.$/).waitFor();
      // The result comes into view in the short panel, not left under the form.
      await pagina.waitForFunction(() => {
        const titular = document.querySelector('.medir__resultado .medir__titular');
        let caja = titular?.parentElement;
        while (caja && caja.scrollHeight <= caja.clientHeight) caja = caja.parentElement;
        if (!titular || !caja) return false;
        const t = titular.getBoundingClientRect();
        const c = caja.getBoundingClientRect();
        return t.top >= c.top - 1 && t.bottom <= c.bottom + 1;
      }, null, { timeout: 3000 });
      assert.equal(await pagina.evaluate(() => window.scrollY), 0, 'se mueve el panel, no la página');
      assert.deepEqual(await medir.locator('.medir__tabla--funciones tbody td:first-child').allInnerTexts(), ['doble', 'cuadrado']);
      assert.deepEqual(await medir.locator('.medir__tabla--funciones tbody td:nth-child(2)').allInnerTexts(), ['1', '300']);
      assert.deepEqual(await fallasAxe(), [], 'medir el programa, accesible');

      assert.deepEqual(pedidos.slice(pedidosAntes).map((p) => p.url).filter((u) => !u.startsWith(CAMPUS) && !/^https:\/\/(classroom|www|oauth2)\.googleapis\.com\//.test(u)), [], 'nada afuera');
      const reales = errores.slice(antes).filter((e) => !/Failed to load resource/.test(e));
      assert.deepEqual(reales, [], 'sin errores en la consola, incluida la CSP');
    } finally {
      await pagina.setViewportSize({ width: 1280, height: 860 });
    }
  });

  await prueba('laboratorio SQL: el dibujo de la base, tu base desde un archivo, el resultado en CSV, la consulta explicada y lo que MySQL escribe distinto', async () => {
    // Alone (FLUJOS_SOLO) it starts from the sign-in.
    await ir('laboratorio');
    const usuario = pagina.getByLabel('Usuario');
    const titulo = pagina.getByRole('heading', { name: 'Laboratorio', level: 1 });
    await Promise.race([usuario.waitFor().catch(() => {}), titulo.waitFor().catch(() => {})]);
    if (await usuario.isVisible()) {
      await usuario.fill('alumno');
      await pagina.getByLabel('Contraseña').fill(CONTRASENA);
      await boton('Entrar').click();
      await pagina.getByRole('heading', { name: 'Hola, Ana' }).waitFor();
      await ir('laboratorio');
    }
    const antes = errores.length;
    const pedidosAntes = pedidos.length;
    const estado = pagina.locator('.laboratorio__estado');
    const consola = pagina.getByRole('region', { name: 'Salida' });
    const editor = pagina.getByRole('textbox', { name: /^Código en / });
    const archivo = pagina.locator('.laboratorio__tablas input[type=file]');
    const listo = () => pagina.locator('.laboratorio__correr[data-fase="listo"]').waitFor({ timeout: 60_000 });
    // The database is a tab of the panel; running goes back to the console.
    const verBase = () => pagina.getByRole('tab', { name: 'Base' }).click();
    const cargar = async (f) => {
      await verBase();
      await archivo.setInputFiles(f);
    };
    const escribir = async (codigo) => {
      await pagina.evaluate((t) => navigator.clipboard.writeText(t), codigo);
      await editor.click();
      await pagina.keyboard.press('ControlOrMeta+A');
      await pagina.keyboard.press('ControlOrMeta+V');
      await pagina.waitForFunction((t) => document.querySelector('.cm-content').innerText.replace(/\xa0/g, ' ').trim() === t.trim(), codigo);
    };
    const correr = async () => {
      await listo();
      await editor.press('ControlOrMeta+Enter');
    };
    const celdas = (linea = 1) => consola.getByRole('region', { name: `Resultado de la línea ${linea}` }).locator('tbody td').allInnerTexts();
    // What a column says to a screen reader, and where it points.
    const columna = (region, tabla, nombre) => region.locator('.dibujo__tabla', { has: pagina.getByRole('heading', { name: tabla, level: 3, exact: true }) }).locator('.dibujo__columna', { has: pagina.locator('.dibujo__col', { hasText: new RegExp(`^${nombre}$`) }) }).textContent();

    await titulo.waitFor();
    await pagina.getByRole('radio', { name: 'SQL' }).check();
    await listo();
    // As it comes, whatever an earlier flow left.
    await verBase();
    await pagina.locator('.dibujo').waitFor();
    await boton('Reiniciar la base').click();
    await pagina.getByRole('dialog', { name: '¿Reiniciar la base?' }).getByRole('button', { name: 'Reiniciar la base' }).click();

    // The drawing: each table with its columns, the primary key marked, and a line for each foreign key.
    const practica = pagina.getByRole('region', { name: 'Base de práctica' });
    await practica.getByRole('heading', { name: 'agente_asignado', level: 3 }).waitFor();
    assert.match(await columna(practica, 'garantia', 'id_solicitud'), /, clave primaria, apunta a solicitud_contrato\.id/);
    assert.match(await columna(practica, 'persona', 'id'), /, clave primaria/);
    assert.doesNotMatch(await columna(practica, 'persona', 'nombre'), /clave primaria/);
    // Wide, the tables go side by side and each row says where it points, without the lines of the margin.
    await pagina.waitForFunction(() => document.querySelector('.dibujo[data-columnas]') && !document.querySelector('.dibujo__linea'));
    // A script that makes a table: the drawing follows.
    await escribir('CREATE TABLE reclamo (\n  id INTEGER PRIMARY KEY,\n  id_propiedad INT REFERENCES propiedad (id),\n  detalle TEXT\n);');
    await correr();
    await verBase();
    await practica.getByRole('heading', { name: 'reclamo', level: 3 }).waitFor();
    assert.match(await columna(practica, 'reclamo', 'id_propiedad'), /apunta a propiedad\.id/);
    // In a phone it reads whole, without going off to the side: one column, with a line for each foreign key.
    await pagina.setViewportSize({ width: 390, height: 844 });
    await pagina.waitForFunction(() => document.querySelectorAll('.dibujo__linea').length === 12);
    assert.ok(await pagina.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'el dibujo entra en 390');
    await practica.screenshot({ path: path.join(CAPTURAS, 'laboratorio-sql-dibujo-390.png') });
    await pagina.setViewportSize({ width: 1280, height: 860 });

    // MySQL as the notes write it: the line under the error, and what SQLite takes doing something else.
    await escribir('start transaction;\nupdate visita set id_agente = 2;\ncommit;');
    await correr();
    await estado.getByText('Error en la línea 1.').waitFor();
    await consola.locator('.consola__pistas li', { hasText: 'la transacción empieza con BEGIN;' }).waitFor();
    await escribir("select count(*) as cuantas from solicitud_contrato sc\nwhere sc.fecha_solicitud between '20250101' and '20251231';");
    await correr();
    await consola.getByText('Ojo en la línea 1').waitFor();
    assert.deepEqual(await celdas(), ['0']);
    assert.match(await consola.locator('.consola__dialecto').innerText(), /En SQLite las fechas van con guiones, '2025-01-01'\./);
    await escribir("select count(*) as cuantas from solicitud_contrato sc\nwhere sc.fecha_solicitud between '2025-01-01' and '2025-12-31';");
    await correr();
    await consola.getByRole('region', { name: 'Resultado de la línea 1' }).waitFor();
    assert.deepEqual(await celdas(), ['6']);
    assert.equal(await consola.locator('.consola__dialecto').count(), 0, 'sin aviso cuando está bien');

    // The result as a CSV that Excel opens: BOM, «;» between cells and the decimal comma.
    await escribir('select p.direccion, vp.valor / 100000.0 as cientos_de_miles\nfrom propiedad p\ninner join valor_propiedad vp on vp.id_propiedad = p.id\nwhere p.id = 12005;');
    await correr();
    const [descarga] = await Promise.all([pagina.waitForEvent('download'), consola.getByRole('button', { name: 'Bajar CSV de la línea 1' }).click()]);
    assert.equal(descarga.suggestedFilename(), 'resultado-linea-1.csv');
    assert.equal(fs.readFileSync(await descarga.path(), 'utf8'), '﻿direccion;cientos_de_miles\r\nRondeau 410;4,1\r\n');

    // «Explicar la consulta»: the statement where the cursor is, in words, without running it.
    await escribir("select count(*) as cuantas from visita;\ndelete from visita where id_agente = 1;\nselect age.apellido, sc.importe_mensual\nfrom solicitud_contrato sc\ninner join persona age on age.id = sc.id_agente\nwhere sc.estado = 'rechazada';");
    await pagina.locator('.cm-line').nth(1).click();
    await boton('Explicar la consulta').click();
    await consola.getByRole('heading', { name: 'Línea 2, qué hace', level: 2 }).waitFor();
    assert.deepEqual(await consola.locator('.logica > li').allInnerTexts(), ['Toma las filas de visita que cumplen id_agente = 1.', 'Borra esas filas. La tabla sigue.'], 'qué hace, en el orden en que se evalúa');
    // How SQLite runs it: folded below, it opens.
    const comoLaCorre = consola.getByRole('button', { name: 'Cómo la corre SQLite' });
    assert.equal(await comoLaCorre.getAttribute('aria-expanded'), 'false');
    assert.equal(await consola.getByRole('heading', { name: 'Cómo la corre SQLite', level: 3 }).count(), 1);
    await comoLaCorre.click();
    assert.match(await consola.locator('.plan').innerText(), /Recorre toda la tabla visita, fila por fila\./);
    await pagina.locator('.cm-line').nth(4).click();
    await boton('Explicar la consulta').click();
    await consola.getByRole('heading', { name: 'Línea 3, qué hace', level: 2 }).waitFor();
    assert.deepEqual(await consola.locator('.logica > li').allInnerTexts(), [
      'Combina solicitud_contrato (sc) con persona (age) cuando age.id = sc.id_agente. Quedan solo las filas con coincidencia en las dos tablas.',
      "Se queda con las filas que cumplen sc.estado = 'rechazada'.",
      'Muestra age.apellido y sc.importe_mensual.',
    ]);
    await consola.getByRole('button', { name: 'Cómo la corre SQLite' }).click();
    assert.match(await consola.locator('.plan').innerText(), /Recorre toda la tabla solicitud_contrato \(sc\), fila por fila\.\s+Por cada una de esas filas, va directo a persona \(age\) por su clave primaria\./);
    await correr();
    await estado.getByText(/^Terminó en /).waitFor();
    assert.deepEqual(await celdas(), ['6'], 'explicar no borró nada');

    // Their own database from a .sql: it runs, it's drawn, and it says it stays only in this tab.
    const KIOSCO = "-- Kiosco\nCREATE TABLE productos (id INTEGER PRIMARY KEY, nombre TEXT NOT NULL, precio REAL);\nCREATE TABLE ventas (id INTEGER PRIMARY KEY, producto INTEGER REFERENCES productos (id), cantidad INTEGER, fecha TEXT);\nINSERT INTO productos (nombre, precio) VALUES ('Alfajor', 900), ('Agua', 1200.5);\nINSERT INTO ventas (producto, cantidad, fecha) VALUES (1, 3, '2026-11-01'), (2, 1, '2026-11-02');\n";
    await cargar({ name: 'kiosco.sql', mimeType: 'application/sql', buffer: Buffer.from(KIOSCO) });
    await pagina.getByText('Cargaste «kiosco.sql».').waitFor();
    const tuya = pagina.getByRole('region', { name: 'Tu base' });
    await tuya.getByRole('heading', { name: 'ventas', level: 3 }).waitFor();
    assert.match(await tuya.innerText(), /Es «kiosco\.sql»\. Queda solo en esta pestaña\./);
    assert.match(await columna(tuya, 'ventas', 'producto'), /apunta a productos\.id/);
    assert.equal(await tuya.getByRole('heading', { name: 'persona', level: 3 }).count(), 0, 'la de práctica se fue');
    await escribir('select sum(cantidad) as vendidas from ventas;');
    await correr();
    await consola.getByRole('region', { name: 'Resultado de la línea 1' }).waitFor();
    assert.deepEqual(await celdas(), ['4']);

    // A CSV of Excel in Spanish (Windows-1252, «;», decimal comma) becomes a table after reviewing it.
    await cargar({ name: 'Notas TP.csv', mimeType: 'text/csv', buffer: Buffer.from('Legajo;Apellido;Nota final\r\n50101;Gómez;8,5\r\n50102;Pereyra;\r\n', 'latin1') });
    const hoja = pagina.getByRole('dialog', { name: 'Revisá la tabla' });
    await hoja.waitFor();
    assert.equal(await hoja.getByLabel('Nombre de la tabla').inputValue(), 'notas_tp');
    assert.equal(await hoja.getByLabel('Separa con').inputValue(), ';');
    assert.equal(await hoja.getByLabel('Tipo de la columna 1').inputValue(), 'INTEGER');
    assert.equal(await hoja.getByLabel('Tipo de la columna 3').inputValue(), 'REAL');
    await hoja.getByRole('cell', { name: 'Gómez' }).waitFor();
    assert.ok(await pagina.evaluate(() => document.activeElement === document.querySelector('dialog[open] input[type=text]')), 'el foco arranca en el nombre de la tabla');
    // A name that is a word of SQL is said next to its field, and nothing is created.
    await hoja.getByLabel('Nombre de la columna 2').fill('order');
    await hoja.getByRole('button', { name: 'Crear la tabla' }).click();
    await hoja.getByText('Ese nombre es una palabra de SQL. Probá con otro.').waitFor();
    assert.equal(await pagina.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Nombre de la columna 2');
    await hoja.getByLabel('Nombre de la columna 2').fill('apellido');
    await hoja.getByRole('button', { name: 'Crear la tabla' }).click();
    await pagina.getByText('Sumaste la tabla notas_tp.').waitFor();
    await tuya.getByRole('heading', { name: 'notas_tp', level: 3 }).waitFor();
    await escribir('select apellido, typeof(nota_final) as tipo from notas_tp order by legajo;');
    await correr();
    await consola.getByRole('region', { name: 'Resultado de la línea 1' }).waitFor();
    assert.deepEqual(await celdas(), ['Gómez', 'real', 'Pereyra', 'null']);

    // «Parar» takes it back to how it was loaded, with the table added.
    await escribir('delete from ventas;\nwith recursive c(x) as (select 1 union all select x + 1 from c) select count(*) from c;');
    await correr();
    await estado.getByText('Corriendo.').waitFor();
    await pagina.waitForTimeout(300);
    await boton('Parar').click();
    await consola.getByText('Lo paraste. Tu base volvió a como la cargaste.').waitFor();
    await escribir('select (select count(*) from ventas) as ventas, (select count(*) from notas_tp) as notas;');
    await correr();
    await consola.getByRole('region', { name: 'Resultado de la línea 1' }).waitFor();
    assert.deepEqual(await celdas(), ['2', '2']);

    // A script of MySQL Workbench goes into SQLite (mysql.js); one that fails says its line in the file, and the
    // database stays.
    await cargar({ name: 'inmobiliaria.sql', mimeType: 'application/sql', buffer: Buffer.from('USE `inmobiliaria`;\nCREATE TABLE `rol` (\n  `codigo` INT UNSIGNED NOT NULL AUTO_INCREMENT,\n  `nombre` VARCHAR(20) NOT NULL,\n  PRIMARY KEY (`codigo`)\n) engine=InnoDB;\nINSERT INTO `rol` VALUES (1, NULL);\n') });
    const problema = tuya.getByRole('alert');
    await problema.getByText('«inmobiliaria.sql» falló en la línea 7. Seguís con la base de antes.').waitFor();
    assert.match(await problema.innerText(), /NOT NULL constraint failed: rol\.nombre/);
    assert.equal(await tuya.getByRole('heading', { name: 'ventas', level: 3 }).count(), 1);
    // A real mysqldump, with blobs in bytes, a trigger and routines: it loads, and says what SQLite doesn't have.
    await cargar({ name: 'inmobiliaria.sql', mimeType: 'application/sql', buffer: fs.readFileSync(path.resolve('src/lib/laboratorio/volcados/mysqldump.sql')) });
    await pagina.getByText('Cargaste «inmobiliaria.sql». Quedaron afuera 1 disparador, 1 función y 1 procedimiento de MySQL.').waitFor();
    await tuya.getByRole('heading', { name: 'propiedad', level: 3, exact: true }).waitFor();
    assert.match(await columna(tuya, 'propiedad', 'id_zona'), /apunta a zona\.id/);
    await escribir("select apellido, nombre from persona where nota like '%seña';\nselect hex(foto) from propiedad where id = 1;");
    await correr();
    await consola.getByRole('region', { name: 'Resultado de la línea 2' }).waitFor();
    assert.deepEqual(await celdas(), ['Pérez', 'Bruno']);
    assert.deepEqual(await celdas(2), ['89504E470D0A1A0A']);

    // A .db as it is, and a file that isn't one.
    const { default: initSqlJs } = await import('sql.js');
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    db.exec("CREATE TABLE socios (nro INTEGER PRIMARY KEY, apellido TEXT); CREATE TABLE prestamos (socio INTEGER REFERENCES socios (nro), libro TEXT, PRIMARY KEY (socio, libro)); INSERT INTO socios VALUES (101, 'Gómez');");
    const bytes = Buffer.from(db.export());
    db.close();
    await cargar({ name: 'biblioteca.db', mimeType: 'application/octet-stream', buffer: bytes });
    await pagina.getByText('Cargaste «biblioteca.db».').waitFor();
    await tuya.getByRole('heading', { name: 'prestamos', level: 3 }).waitFor();
    assert.equal(await tuya.getByRole('heading', { name: 'notas_tp', level: 3 }).count(), 0, 'otra base empieza sin las tablas de antes');
    assert.equal(await tuya.getByRole('alert').count(), 0, 'el problema de antes se fue');
    await cargar({ name: 'roto.db', mimeType: 'application/octet-stream', buffer: Buffer.from('no soy una base') });
    await tuya.getByText('«roto.db» no es una base de SQLite, o está dañada.').waitFor();

    // Nothing of it stays in the browser: not in its storage, the address or the title.
    const disco = await pagina.evaluate(async () => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }) + JSON.stringify((await indexedDB.databases?.()) ?? []) + location.href + document.title);
    assert.doesNotMatch(disco, /kiosco|biblioteca|notas_tp|prestamos|Alfajor/, 'tu base queda solo en la memoria de la pestaña');

    // Back to the practice one.
    await boton('Volver a la de práctica').click();
    await pagina.getByRole('dialog', { name: '¿Volver a la de práctica?' }).getByRole('button', { name: 'Volver a la de práctica' }).click();
    await pagina.getByText('Volviste a la base de práctica.').waitFor();
    await practica.getByRole('heading', { name: 'persona', level: 3 }).waitFor();
    assert.equal(await boton('Volver a la de práctica').count(), 0);
    // A student's script with a table the practice one already has: the error says where that table comes from.
    await pagina.getByRole('tab', { name: 'Consola' }).click();
    await escribir('CREATE TABLE persona (dni INT);');
    await correr();
    await consola.getByText('La base de práctica ya trae una tabla persona.', { exact: false }).waitFor();

    // Nothing to anywhere else, and nothing wrong in the console. Classroom and Drive, connected by earlier flows, keep
    // their own timers: what they ask in the meantime is not the lab's.
    const deGoogle = (u) => /^https:\/\/(classroom|www|oauth2)\.googleapis\.com\//.test(u);
    assert.deepEqual(pedidos.slice(pedidosAntes).map((p) => p.url).filter((u) => !u.startsWith(CAMPUS) && !deGoogle(u)), [], 'el laboratorio no pide nada afuera');
    const reales = errores.slice(antes).filter((e) => !/Failed to load resource/.test(e));
    assert.deepEqual(reales, [], 'sin errores en la consola, incluida la CSP');
    await fin('laboratorio-sql');
  });

  await prueba('una pantalla que se rompe muestra su error con la cabecera, sin nada técnico, y se puede probar de nuevo', async () => {
    // Alone (FLUJOS_SOLO) it starts from the sign-in.
    await ir('');
    const usuario = pagina.getByLabel('Usuario');
    const hola = pagina.getByRole('heading', { name: 'Hola, Ana' });
    await Promise.race([usuario.waitFor().catch(() => {}), hola.waitFor().catch(() => {})]);
    if (await usuario.isVisible()) {
      await usuario.fill('alumno');
      await pagina.getByLabel('Contraseña').fill(CONTRASENA);
      await boton('Entrar').click();
      await hola.waitFor();
    }
    const antes = errores.length;
    const pieza = '**/assets/Laboratorio-*.js';
    const pantalla = async (nombre) => {
      const titulo = pagina.getByRole('heading', { name: nombre, level: 1 });
      await titulo.waitFor();
      assert.ok(await titulo.evaluate((e) => e === document.activeElement), `«${nombre}» se lleva el foco`);
      assert.ok(await pagina.locator('.cabecera__marca').isVisible(), 'la cabecera sigue');
      const texto = await pagina.locator('main').innerText();
      assert.doesNotMatch(texto, /Unexpected|Error:|TypeError|\.js|at https?:/, 'nada técnico en pantalla');
      return titulo;
    };
    for (const ancho of [1280, 390]) {
      await pagina.setViewportSize({ width: ancho, height: ancho === 390 ? 844 : 860 });
      // The site was published again while the tab was open: the piece of the screen is not there anymore.
      await pagina.route(pieza, (r) => r.abort());
      await ir('laboratorio');
      await pantalla('Super CVG se actualizó');
      assert.ok(await boton('Recargar').isVisible());
      assert.equal(await pagina.getByRole('link', { name: 'Avisar del error' }).count(), 0);
      await pagina.screenshot({ path: path.join(CAPTURAS, `error-version-${ancho}.png`), fullPage: true });
      // Something else broke: what to do, and how to tell us.
      await pagina.unroute(pieza);
      await pagina.route(pieza, (r) => r.fulfill({ contentType: 'text/javascript', body: 'throw new Error("se rompió a propósito")' }));
      await ir('laboratorio');
      await pantalla('Algo falló en esta pantalla');
      assert.ok(await pagina.getByRole('link', { name: 'Avisar del error' }).isVisible());
      await pagina.screenshot({ path: path.join(CAPTURAS, `error-pantalla-${ancho}.png`), fullPage: true });
      // Trying again, once the piece is back, opens the screen.
      await pagina.unroute(pieza);
      await boton('Probar de nuevo').click();
      await pagina.getByRole('heading', { name: 'Laboratorio', level: 1 }).waitFor();
    }
    await pagina.setViewportSize({ width: 1280, height: 860 });
    // The error goes to the console, for whoever looks into it: the two forced here, and nothing else.
    const nuevos = errores.splice(antes).filter((e) => !/Failed to load resource/.test(e));
    assert.ok(nuevos.length > 0 && nuevos.every((e) => /dynamically imported module|se rompió a propósito/.test(e)), nuevos.join(' | '));
  });

  await prueba('laboratorio C: compila y corre en el navegador, con scanf, errores en su línea, segmentation fault, Parar y el paso a paso del worker', async () => {
    // Alone (FLUJOS_SOLO) it starts from the sign-in.
    await ir('laboratorio');
    const usuario = pagina.getByLabel('Usuario');
    const titulo = pagina.getByRole('heading', { name: 'Laboratorio', level: 1 });
    await Promise.race([usuario.waitFor().catch(() => {}), titulo.waitFor().catch(() => {})]);
    if (await usuario.isVisible()) {
      await usuario.fill('alumno');
      await pagina.getByLabel('Contraseña').fill(CONTRASENA);
      await boton('Entrar').click();
      await pagina.getByRole('heading', { name: 'Hola, Ana' }).waitFor();
      await ir('laboratorio');
    }
    const antes = errores.length;
    const pedidosAntes = pedidos.length;
    const bajado = new Set();
    const anotar = (r) => {
      const url = r.url();
      if (url.includes('/motores/') || /c\.worker-[\w-]+\.js$/.test(url)) bajado.add(url.replace(base, ''));
    };
    pagina.on('requestfinished', anotar);
    const estado = pagina.locator('.laboratorio__estado');
    const consola = pagina.getByRole('region', { name: 'Salida' });
    const editor = pagina.getByRole('textbox', { name: /^Código en / });
    const listo = pagina.locator('.laboratorio__correr[data-fase="listo"]');
    const escribir = async (codigo) => {
      await pagina.evaluate((t) => navigator.clipboard.writeText(t), codigo);
      await editor.click();
      await pagina.keyboard.press('ControlOrMeta+A');
      await pagina.keyboard.press('ControlOrMeta+V');
      await pagina.waitForFunction((t) => [...document.querySelectorAll('.cm-line')].map((l) => l.textContent.replace(/\u00a0/g, ' ')).join('\n') === t, codigo);
    };
    const correr = () => editor.press('ControlOrMeta+Enter');
    try {
      await titulo.waitFor();
      await pagina.getByRole('radio', { name: 'C', exact: true }).check();
      const desde = Date.now();
      await listo.waitFor({ timeout: 60_000 });
      const msC = Date.now() - desde;

      // scanf(): the field right after what the program printed, named by it, and the time waiting doesn't count.
      await escribir('#include <stdio.h>\nint main(void) {\n    int n;\n    printf("¿Cuántos? ");\n    scanf("%d", &n);\n    for (int i = 1; i <= n; i++) printf("%d ", i * i);\n    printf("\\n");\n    return 0;\n}');
      await correr();
      const campo = consola.getByRole('textbox', { name: '¿Cuántos?' });
      await campo.waitFor();
      assert.equal(await pagina.evaluate(() => document.activeElement.getAttribute('aria-label')), '¿Cuántos?', 'el foco va al campo');
      await estado.getByText('Esperando lo que escribas.').waitFor();
      await campo.fill('4');
      await campo.press('Enter');
      await consola.getByText('1 4 9 16').waitFor();
      await estado.getByText(/^Terminó en /).waitFor();
      assert.match(await consola.innerText(), /¿Cuántos\? 4\s+1 4 9 16/);

      // A compilation error: what's missing, in Spanish, at the end of the line where it's missing, marked in the editor.
      await escribir('#include <stdio.h>\nint main(void) {\n    int x = 3\n    printf("%d\\n", x);\n    return 0;\n}');
      await correr();
      await estado.getByText('Error en la línea 3.').waitFor();
      await consola.getByText('Falta un `;` al final de la línea 3.').waitFor();
      assert.doesNotMatch((await consola.innerText()).replace(/^Mensaje original:.*$/gm, ''), /home\/alumno|laboratorio\.o|wasm|expected/, 'sin lo de adentro del compilador');
      assert.equal(await pagina.locator('.cm-line').nth(2).getAttribute('class').then((c) => c.includes('editor__linea-error')), true, 'la línea 3, marcada');
      await consola.getByRole('button', { name: 'Ir a la línea 3' }).click();
      assert.equal(await pagina.evaluate(() => document.activeElement.classList.contains('cm-content')), true);
      // What's not declared says which #include is missing.
      await escribir('int main(void) {\n    printf("hola");\n    return 0;\n}');
      await correr();
      await estado.getByText('Error en la línea 2.').waitFor();
      await consola.getByText('`printf` no está declarada. Sumá `#include <stdio.h>` arriba de todo.').waitFor();

      // A NULL pointer is a segmentation fault, said in the function where it happened, after what it printed.
      await escribir('#include <stdio.h>\nint valor(int *p) {\n    return *p;\n}\nint main(void) {\n    printf("antes\\n");\n    printf("%d\\n", valor(NULL));\n    return 0;\n}');
      await correr();
      await estado.getByText('Error en la línea 2.').waitFor();
      await consola.getByText('Segmentation fault. Usaste un puntero que vale `NULL`, que no apunta a nada. Pasó en `valor`.').waitFor();
      assert.match(await consola.innerText(), /^antes\s+en valor, línea 2\s+llamada desde main, línea 5/);

      // «Parar» ends a loop that never ends, and the next run works.
      await escribir('int main(void) {\n    while (1) {\n    }\n}');
      await correr();
      await estado.getByText('Corriendo.').waitFor();
      await pagina.waitForTimeout(500);
      await boton('Parar').click();
      await consola.getByText('Lo paraste.').waitFor();
      await listo.waitFor({ timeout: 60_000 });
      await escribir('#include <stdio.h>\nint main(void) {\n    printf("de nuevo\\n");\n    return 0;\n}');
      await correr();
      await consola.getByText('de nuevo').waitFor();
      await estado.getByText(/^Terminó en /).waitFor();

      // «Paso a paso» of C, straight from its worker (the screen doesn't offer it yet): a struct read with scanf, which
      // waits for what's typed (the browser pauses WebAssembly), and the trace as Python's.
      const urlC = [...bajado].find((u) => /c\.worker-[\w-]+\.js$/.test(u));
      const grabado = await pagina.evaluate(async (url) => {
        const arranque = URL.createObjectURL(new Blob([`import ${JSON.stringify(url)};\n`], { type: 'text/javascript' }));
        const w = new Worker(arranque, { type: 'module' });
        const tipeado = ['Juan', '1234', '7.5'];
        const r = { pasos: null, fin: null, pausa: null, pedidos: 0 };
        try {
          await new Promise((listo, falla) => {
            w.onmessage = ({ data }) => {
              if (data.tipo === 'listo') {
                r.pausa = data.pausa;
                listo();
              } else if (data.tipo === 'falla') falla(new Error(data.mensaje));
            };
            w.postMessage({ tipo: 'cargar', base: url.replace(/assets\/c\.worker-[\w-]+\.js$/, 'motores/'), total: 0 });
          });
          await new Promise((listo) => {
            w.onmessage = ({ data }) => {
              if (data.tipo === 'pide') {
                r.pedidos += 1;
                w.postMessage({ tipo: 'entrada', texto: tipeado.shift() });
              } else if (data.tipo === 'pasos') r.pasos = JSON.parse(data.pasos);
              else if (data.tipo === 'fin') {
                r.fin = data;
                listo();
              }
            };
            const codigo = '#include <stdio.h>\n\nstruct Alumno {\n    char nombre[30];\n    int legajo;\n    float nota;\n};\n\nint main() {\n    struct Alumno a;\n    printf("Nombre: ");\n    scanf("%s", a.nombre);\n    printf("Legajo: ");\n    scanf("%d", &a.legajo);\n    printf("Nota: ");\n    scanf("%f", &a.nota);\n    printf("%s: %.2f\\n", a.nombre, a.nota);\n    return 0;\n}\n';
            w.postMessage({ tipo: 'correr', id: 1, codigo, nombre: 'main.c', lineas: [], modo: { tipo: 'pasos', tope: 1000 } });
          });
        } finally {
          w.terminate();
          URL.revokeObjectURL(arranque);
        }
        return r;
      }, `${base}${urlC}`);
      assert.equal(grabado.pausa, true, 'el navegador pausa WebAssembly');
      assert.equal(grabado.pedidos, 3, 'scanf pide cada dato');
      assert.equal(grabado.fin.error, null);
      assert.deepEqual(grabado.pasos.salida.filter(([flujo]) => flujo === 'in'), [['in', 'Juan\n'], ['in', '1234\n'], ['in', '7.5\n']]);
      const ultimoPaso = grabado.pasos.pasos.at(-1);
      assert.deepEqual([ultimoPaso.e, ultimoPaso.a, ultimoPaso.l, grabado.pasos.tope], ['fin', 'main.c', 18, false]);
      const alumno = grabado.pasos.objetos[ultimoPaso.o[0]];
      assert.deepEqual([alumno.c, ...alumno.a.map(([n, v]) => `${n}=${v[1]}`)], ['Alumno', 'nombre="Juan"', 'legajo=1234', 'nota=7.5']);

      // Nothing to anywhere else, and the compiler comes from the site.
      const deGoogle = (u) => /^https:\/\/(classroom|www|oauth2)\.googleapis\.com\//.test(u);
      assert.deepEqual(pedidos.slice(pedidosAntes).map((p) => p.url).filter((u) => !u.startsWith(CAMPUS) && !deGoogle(u)), [], 'el laboratorio no pide nada afuera');
      assert.ok([...bajado].some((u) => u.endsWith('motores/c/wccfiles.zip')), 'C bajó del sitio');
      const reales = errores.slice(antes).filter((e) => !/Failed to load resource/.test(e));
      assert.deepEqual(reales, [], 'sin errores en la consola, incluida la CSP');
      console.log(`      C listo en ${(msC / 1000).toFixed(1)} s`);
      await fin('laboratorio-c');
    } finally {
      pagina.off('requestfinished', anotar);
    }
  });

  await prueba('consultron en el laboratorio: abre en Código, arregla un error de C, se ve la diferencia, se aplica y el programa corre bien', async () => {
    // A computer that runs the model, which has «Preguntar» too: in the lab it opens in «Código» anyway.
    await pagina.addInitScript(() => {
      let modo = null;
      try {
        modo = localStorage.getItem('prueba-gpu');
      } catch {
        return;
      }
      if (!modo) return;
      const gpu = modo === 'sin' ? undefined : { requestAdapter: async () => ({ features: new Set(['shader-f16']) }) };
      Object.defineProperty(Navigator.prototype, 'gpu', { configurable: true, get: () => gpu });
    });
    // Alone (FLUJOS_SOLO) it starts from the sign-in.
    await ir('laboratorio');
    const usuario = pagina.getByLabel('Usuario');
    const titulo = pagina.getByRole('heading', { name: 'Laboratorio', level: 1 });
    await Promise.race([usuario.waitFor().catch(() => {}), titulo.waitFor().catch(() => {})]);
    if (await usuario.isVisible()) {
      await usuario.fill('alumno');
      await pagina.getByLabel('Contraseña').fill(CONTRASENA);
      await boton('Entrar').click();
      await pagina.getByRole('heading', { name: 'Hola, Ana' }).waitFor();
    }
    await pagina.evaluate(() => localStorage.setItem('prueba-gpu', 'con'));
    await ir('laboratorio');
    // supercvg-codigo, simulated: a model that lists, reads, fixes the missing «;», runs and answers.
    const CODIGO = 'https://lomhlulbgfovtnljbqzp.supabase.co/functions/v1/supercvg-codigo';
    const alAgente = [];
    const llamar = (nombre, args = {}) => [{ id: `call_${alAgente.length}`, nombre, argumentos: JSON.stringify(args) }];
    await pagina.route(CODIGO, async (r) => {
      const c = JSON.parse(r.request().postData());
      alAgente.push(c);
      const vuelta = c.mensajes.filter((m) => m.rol === 'consultron').length;
      // The second pedido, on the saved file: it changes what the program says.
      const guion = c.pedido !== alAgente[0].pedido ? [
        () => ['', llamar('editar_archivo', { nombre: 'promedio.c', buscar: 'Promedio: %d', reemplazo: 'El promedio es %d' })],
        () => ['Le cambié lo que dice la salida.', []],
      ] : [
        () => ['', llamar('listar_archivos')],
        () => ['', llamar('leer_archivo', { nombre: /- (\S+) \(/.exec(c.mensajes.at(-1).texto)?.[1] })],
        () => ['', llamar('editar_archivo', { nombre: 'promedio.c', buscar: 'suma / 3)\n', reemplazo: 'suma / 3);\n' })],
        () => ['', llamar('correr')],
        () => ['A la línea 9 le faltaba el punto y coma. Lo corrí y anda.', []],
      ];
      const [texto, llamadas] = guion[Math.min(vuelta, guion.length - 1)]();
      await r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ ok: true, texto, llamadas, modelo: 'prueba', quedan: 9 }) });
    });
    const antes = errores.length;
    const consola = pagina.getByRole('region', { name: 'Salida' });
    const editor = pagina.getByRole('textbox', { name: /^Código en / });
    const CON_ERROR = '#include <stdio.h>\n\nint main(void) {\n    int notas[3] = {7, 8, 9};\n    int suma = 0;\n    for (int i = 0; i < 3; i++) {\n        suma += notas[i];\n    }\n    printf("Promedio: %d\\n", suma / 3)\n    return 0;\n}';
    try {
      await titulo.waitFor();
      await pagina.getByRole('radio', { name: 'C', exact: true }).check();
      await pagina.getByLabel('Nombre', { exact: true }).fill('promedio');
      await pagina.evaluate((t) => navigator.clipboard.writeText(t), CON_ERROR);
      await editor.click();
      await pagina.keyboard.press('ControlOrMeta+A');
      await pagina.keyboard.press('ControlOrMeta+V');
      await pagina.locator('.laboratorio__correr[data-fase="listo"]').waitFor({ timeout: 60_000 });
      await editor.press('ControlOrMeta+Enter');
      await consola.getByText(/línea 9/).first().waitFor({ timeout: 30_000 });

      // «Código» in Consultron's corner, as it opens in the lab: the pedido goes, and what it did shows step by step.
      await pagina.locator('.flotante__boton').click();
      const panel = pagina.locator('.flotante');
      assert.equal(await panel.getByRole('button', { name: 'Código', exact: true }).getAttribute('aria-pressed'), 'true', 'en el laboratorio abre en Código');
      await panel.getByText('Tenés 10 pedidos por día.').waitFor();
      await panel.getByRole('textbox', { name: 'Qué hago con tu código' }).fill('Arreglá el error');
      await panel.getByRole('button', { name: 'Pedir' }).click();
      await panel.getByText('A la línea 9 le faltaba el punto y coma. Lo corrí y anda.').waitFor({ timeout: 30_000 });
      assert.deepEqual(await panel.locator('.cvg-agente__paso').allInnerTexts(), ['Miró los archivos.', 'Leyó promedio.c.', 'Propuso cambios en promedio.c (+1 −1).', 'Corrió el programa y anduvo.']);
      await panel.getByText('Te quedan 9 pedidos hoy.').waitFor();

      // What went: one pedido, the student's words, the file and the console, and the run of the fix in this browser.
      assert.equal(alAgente.length, 5);
      assert.equal(new Set(alAgente.map((c) => c.pedido)).size, 1, 'un solo pedido');
      assert.deepEqual(Object.keys(alAgente[0]).sort(), ['dispositivo', 'herramientas', 'mensajes', 'pedido']);
      assert.match(alAgente[0].mensajes[1].texto, /^Arreglá el error\n\nArchivos: promedio\.c\./);
      assert.match(alAgente[4].mensajes.at(-1).texto, /^Terminó bien en \d+ ms\.\nSalida:\nPromedio: 8/, 'corrió con el arreglo propuesto');
      for (const c of alAgente) assert.ok(!JSON.stringify(c).includes(TOKEN) && !JSON.stringify(c).includes(CONTRASENA), 'nada del campus');

      // Not applied yet: the editor marks what goes out and what comes in, and still has the error.
      await pagina.locator('.cvg-dif__barra').waitFor();
      assert.equal(await pagina.locator('.cvg-dif__quita').count(), 1);
      assert.match(await pagina.locator('.cvg-dif__suma').innerText(), /suma \/ 3\);/);
      // The check while typing may say something at the end of the line: what matters is that the ; isn't there yet.
      assert.match(await editor.innerText(), /suma \/ 3\)(?!;)/, 'sin aplicar');
      await fin('consultron-codigo-diferencia');

      // Applied from the panel, the program runs well.
      await panel.getByRole('button', { name: 'Aplicar en promedio.c' }).click();
      await pagina.waitForFunction(() => document.querySelector('.cm-content').innerText.includes('suma / 3);'));
      assert.equal(await pagina.locator('.cvg-dif__barra').count(), 0, 'sin marcas');
      await panel.getByRole('button', { name: 'Deshacer lo de Consultron' }).waitFor();
      await editor.click({ position: { x: 20, y: 10 } });
      await editor.press('ControlOrMeta+Enter');
      await consola.getByText('Promedio: 8').waitFor({ timeout: 30_000 });

      // Each file keeps its proposals: one on «promedio», «otro» open shows none, and back on «promedio» it's there to
      // apply and undo. The chat is one for the whole lab.
      const archivos = pagina.locator('.lab-explorador');
      const enVista = (n) => archivos.locator('.lab-arbol__nombre[aria-current="true"]', { hasText: n }).waitFor();
      await pagina.locator('.lab-barra__guardar').getByRole('button', { name: 'Guardar' }).click();
      await pagina.getByText('Guardaste «promedio».').waitFor();
      await archivos.getByRole('button', { name: 'Nuevo', exact: true }).click();
      await archivos.getByLabel('Nombre del archivo nuevo').fill('otro');
      await archivos.getByLabel('Lenguaje').selectOption('c');
      await archivos.getByRole('button', { name: 'Crear', exact: true }).click();
      await enVista('otro');
      await archivos.getByRole('button', { name: /^promedio/ }).click();
      await enVista('promedio');
      await panel.getByRole('textbox', { name: 'Qué hago con tu código' }).fill('Cambiá lo que dice la salida');
      await panel.getByRole('button', { name: 'Pedir' }).click();
      await panel.getByText('Le cambié lo que dice la salida.').waitFor({ timeout: 30_000 });
      await pagina.locator('.cvg-dif__barra').waitFor();
      await archivos.getByRole('button', { name: /^otro/ }).click();
      await enVista('otro');
      await pagina.waitForFunction(() => document.querySelector('.cm-content')?.innerText.includes('Hola') && !document.querySelector('.cvg-dif__barra'));
      assert.equal(await panel.getByRole('button', { name: 'Aplicar en promedio.c' }).count(), 0, 'otro archivo, sin propuestas');
      assert.equal(await panel.getByRole('button', { name: 'Deshacer lo de Consultron' }).count(), 0, 'ni «Deshacer»');
      assert.equal(await panel.locator('.cvg-agente__pedido').count(), 2, 'el chat es uno solo');
      await archivos.getByRole('button', { name: /^promedio/ }).click();
      await enVista('promedio');
      await pagina.locator('.cvg-dif__barra').waitFor();
      await fin('consultron-codigo-de-vuelta');
      await panel.getByRole('button', { name: 'Aplicar en promedio.c' }).click();
      await pagina.waitForFunction(() => document.querySelector('.cm-content').innerText.includes('El promedio es %d'));
      assert.equal(await pagina.locator('.cvg-dif__barra').count(), 0, 'aplicada, sin marcas');
      await panel.getByRole('button', { name: 'Deshacer lo de Consultron' }).click();
      await pagina.waitForFunction(() => document.querySelector('.cm-content').innerText.includes('"Promedio: %d'));
      for (const n of ['otro', 'promedio']) {
        await archivos.getByRole('button', { name: `Opciones de ${n}`, exact: true }).click();
        await pagina.locator('.lab-menu:popover-open').getByRole('button', { name: 'Borrar' }).click();
        await pagina.getByRole('dialog').getByRole('button', { name: 'Borrar' }).click();
        await archivos.getByRole('button', { name: new RegExp(`^${n}`) }).waitFor({ state: 'detached' });
      }
      assert.deepEqual(errores.slice(antes), [], 'errores de consola');
    } finally {
      await pagina.unroute(CODIGO);
      if (await pagina.locator('.flotante').count()) await pagina.getByRole('button', { name: 'Cerrar Consultron' }).click();
      await pagina.evaluate(() => localStorage.removeItem('prueba-gpu'));
    }
  });

  await prueba('laboratorio JavaScript: QuickJS en el navegador con la CSP real, console.log como Node, prompt(), errores en su línea, Parar, el tope de salida e import entre archivos', async () => {
    // Alone (FLUJOS_SOLO) it starts from the sign-in.
    await ir('laboratorio');
    const usuario = pagina.getByLabel('Usuario');
    const titulo = pagina.getByRole('heading', { name: 'Laboratorio', level: 1 });
    await Promise.race([usuario.waitFor().catch(() => {}), titulo.waitFor().catch(() => {})]);
    if (await usuario.isVisible()) {
      await usuario.fill('alumno');
      await pagina.getByLabel('Contraseña').fill(CONTRASENA);
      await boton('Entrar').click();
      await pagina.getByRole('heading', { name: 'Hola, Ana' }).waitFor();
      await ir('laboratorio');
    }
    const antes = errores.length;
    const pedidosAntes = pedidos.length;
    const bajado = new Set();
    const anotar = (r) => {
      const url = r.url();
      if (url.includes('/motores/') || /js\.worker-[\w-]+\.js$/.test(url)) bajado.add(url.replace(base, ''));
    };
    pagina.on('requestfinished', anotar);
    const estado = pagina.locator('.laboratorio__estado');
    const consola = pagina.getByRole('region', { name: 'Salida' });
    const editor = pagina.getByRole('textbox', { name: /^Código en / });
    const listo = pagina.locator('.laboratorio__correr[data-fase="listo"]');
    const escribir = async (codigo) => {
      await pagina.evaluate((t) => navigator.clipboard.writeText(t), codigo);
      await editor.click();
      await pagina.keyboard.press('ControlOrMeta+A');
      await pagina.keyboard.press('ControlOrMeta+V');
      await pagina.waitForFunction((t) => [...document.querySelectorAll('.cm-line')].map((l) => l.textContent.replace(/\u00a0/g, ' ')).join('\n') === t, codigo);
    };
    const correr = () => editor.press('ControlOrMeta+Enter');
    try {
      await titulo.waitFor();
      await pagina.getByRole('radio', { name: 'JavaScript', exact: true }).check();
      const desde = Date.now();
      await listo.waitFor({ timeout: 60_000 });
      const msJs = Date.now() - desde;

      // prompt() waits for what's typed in the field named by its question, also without JSPI.
      await escribir('function saludar(nombre) {\n  return `Hola, ${nombre}`;\n}\n\nconst nombre = prompt("¿Cómo te llamás?");\nconsole.log(saludar(nombre));');
      await correr();
      const campo = consola.getByRole('textbox', { name: '¿Cómo te llamás?' });
      await campo.waitFor();
      assert.equal(await pagina.evaluate(() => document.activeElement.getAttribute('aria-label')), '¿Cómo te llamás?', 'el foco va al campo');
      await estado.getByText('Esperando lo que escribas.').waitFor();
      await campo.fill('Ana');
      await campo.press('Enter');
      await consola.getByText('Hola, Ana').waitFor();
      await estado.getByText(/^Terminó en /).waitFor();
      assert.match(await consola.innerText(), /¿Cómo te llamás\? Ana\s+Hola, Ana/);

      // console.log writes as Node, and ES2023 is there.
      await escribir("const notas = [7, 4, 9];\nconsole.log(notas.toSorted(), { nombre: 'Ana', notas });\nconsole.log('Promedio: %d', notas.reduce((a, b) => a + b) / notas.length);");
      await correr();
      await consola.locator('.consola__texto', { hasText: /^\[ 4, 7, 9 \] \{ nombre: 'Ana', notas: \[ 7, 4, 9 \] \}\s+Promedio: 6\.666666666666667\s*$/ }).waitFor();

      // An error while running: in Spanish, in its line, marked in the editor.
      await escribir('function largo(alumno) {\n  return alumno.nombre.length;\n}\nconsole.log(largo({}));');
      await correr();
      await estado.getByText('Error en la línea 2.').waitFor();
      await consola.getByText('TypeError: `alumno.nombre` vale `undefined` y no tiene `length`.').waitFor();
      assert.match(await consola.innerText(), /en largo, línea 2\s+llamada desde \S+, línea 4/);
      assert.doesNotMatch((await consola.innerText()).replace(/^Mensaje original:.*$/gm, ''), /<laboratorio>|quickjs|wasm|cannot read/, 'sin lo de adentro del motor');
      assert.equal(await pagina.locator('.cm-line').nth(1).getAttribute('class').then((c) => c.includes('editor__linea-error')), true, 'la línea 2, marcada');
      await consola.getByRole('button', { name: 'Ir a la línea 2' }).click();
      assert.equal(await pagina.evaluate(() => document.activeElement.classList.contains('cm-content')), true);
      // A syntax error, with what's missing.
      await escribir('const notas = [7, 8;\nconsole.log(notas);');
      await correr();
      await estado.getByText('Error en la línea 1.').waitFor();
      await consola.getByText('SyntaxError: Falta cerrar un corchete, `]`.').waitFor();
      // A recursion of 500 calls goes, and one without end fills the stack of QuickJS before the browser's, with its line.
      await escribir('const suma = (n) => (n === 0 ? 0 : n + suma(n - 1));\nconsole.log(suma(500));\nfunction f(n) {\n  return f(n + 1);\n}\nf(0);');
      await correr();
      await estado.getByText('Error en la línea 4.').waitFor();
      await consola.getByText('InternalError: Se llenó la pila (stack overflow). Seguro es una recursión que no termina.').waitFor();
      assert.match(await consola.innerText(), /^125250\s+en f, línea 4\s+\(y \d+ veces más\)/);

      // The exercise 5 of Desarrollo de Software, with the words typed.
      await escribir("function coincidencias(base, lista){\n    return lista.filter((palabra) => palabra === base).length;\n}\nconst base = prompt('Base:');\nconsole.log(coincidencias(base, prompt('Lista:').split(',')));");
      await correr();
      await consola.getByRole('textbox', { name: 'Base:' }).fill('sol');
      await consola.getByRole('textbox', { name: 'Base:' }).press('Enter');
      await consola.getByRole('textbox', { name: 'Lista:' }).fill('sol,luna,sol');
      await consola.getByRole('textbox', { name: 'Lista:' }).press('Enter');
      await estado.getByText(/^Terminó en /).waitFor();
      assert.match(await consola.innerText(), /Lista: sol,luna,sol\s+2\s*$/);

      // «Parar» ends a loop that never ends, and the next run works.
      await escribir('while (true) {\n}');
      await correr();
      await estado.getByText('Corriendo.').waitFor();
      await pagina.waitForTimeout(500);
      await boton('Parar').click();
      await consola.getByText('Lo paraste.').waitFor();
      await listo.waitFor({ timeout: 60_000 });
      await escribir('console.log("de nuevo");');
      await correr();
      await consola.getByText('de nuevo').waitFor();
      await estado.getByText(/^Terminó en /).waitFor();

      // Too much output: it's cut, with its notice.
      await escribir("while (true) console.log('x'.repeat(1000));");
      await correr();
      await consola.getByText('Imprimió más de 100.000 caracteres y lo cortamos.').waitFor({ timeout: 30_000 });
      await listo.waitFor({ timeout: 60_000 });

      // A project, straight from its worker: two files that import each other, a .json, and nothing to the network.
      const urlJs = [...bajado].find((u) => /js\.worker-[\w-]+\.js$/.test(u));
      const proyecto = await pagina.evaluate(async (url) => {
        const arranque = URL.createObjectURL(new Blob([`import ${JSON.stringify(url)};\n`], { type: 'text/javascript' }));
        const w = new Worker(arranque, { type: 'module' });
        const r = { salida: '', fin: null, pausa: null, version: '' };
        try {
          await new Promise((listo, falla) => {
            w.onmessage = ({ data }) => {
              if (data.tipo === 'listo') {
                r.pausa = data.pausa;
                r.version = data.version;
                listo();
              } else if (data.tipo === 'falla') falla(new Error(data.mensaje));
            };
            w.postMessage({ tipo: 'cargar', base: url.replace(/assets\/js\.worker-[\w-]+\.js$/, 'motores/'), total: 0 });
          });
          await new Promise((listo) => {
            w.onmessage = ({ data }) => {
              if (data.tipo === 'salida') r.salida += data.texto;
              else if (data.tipo === 'fin') {
                r.fin = data;
                listo();
              }
            };
            const archivos = [
              { nombre: 'main.js', contenido: "import { coincidencias } from './palabras.js';\nimport datos from './datos.json' with { type: 'json' };\nconsole.log(coincidencias(datos.base, datos.lista));\nconsole.log(typeof fetch, typeof XMLHttpRequest, typeof WebSocket, typeof importScripts);\n" },
              { nombre: 'palabras.js', contenido: 'export function coincidencias(base, lista) {\n  return lista.filter((p) => p === base).length;\n}\n' },
              { nombre: 'datos.json', contenido: '{ "base": "a", "lista": ["a", "b", "a", "a"] }' },
            ];
            w.postMessage({ tipo: 'correr', id: 1, archivos, principal: 'main.js', lineas: [] });
          });
        } finally {
          w.terminate();
          URL.revokeObjectURL(arranque);
        }
        return r;
      }, `${base}${urlJs}`);
      assert.equal(proyecto.pausa, true, 'prompt() espera en cualquier navegador');
      assert.equal(proyecto.fin.error, null);
      assert.deepEqual(proyecto.fin.archivos, { cambiados: [], borrados: [] });
      assert.equal(proyecto.salida, '3\nundefined undefined undefined undefined\n');

      // Nothing to anywhere else, and the engine comes from the site.
      const deGoogle = (u) => /^https:\/\/(classroom|www|oauth2)\.googleapis\.com\//.test(u);
      assert.deepEqual(pedidos.slice(pedidosAntes).map((p) => p.url).filter((u) => !u.startsWith(CAMPUS) && !deGoogle(u)), [], 'el laboratorio no pide nada afuera');
      assert.ok([...bajado].some((u) => u.endsWith('motores/js/quickjs.wasm')), 'JavaScript bajó del sitio');
      const reales = errores.slice(antes).filter((e) => !/Failed to load resource/.test(e));
      assert.deepEqual(reales, [], 'sin errores en la consola, incluida la CSP');
      console.log(`      JavaScript listo en ${(msJs / 1000).toFixed(1)} s (${proyecto.version})`);
      await fin('laboratorio-js');
    } finally {
      pagina.off('requestfinished', anotar);
    }
  });

  await prueba('laboratorio como editor: un proyecto de C con su .h, lo que escribe el programa a la vista, y los archivos y el panel a medida', async () => {
    // Alone (FLUJOS_SOLO) it starts from the sign-in.
    await ir('laboratorio');
    const usuario = pagina.getByLabel('Usuario');
    const titulo = pagina.getByRole('heading', { name: 'Laboratorio', level: 1 });
    await Promise.race([usuario.waitFor().catch(() => {}), titulo.waitFor().catch(() => {})]);
    if (await usuario.isVisible()) {
      await usuario.fill('alumno');
      await pagina.getByLabel('Contraseña').fill(CONTRASENA);
      await boton('Entrar').click();
      await pagina.getByRole('heading', { name: 'Hola, Ana' }).waitFor();
      await ir('laboratorio');
    }
    const antes = errores.length;
    const pedidosAntes = pedidos.length;
    const archivos = pagina.locator('.lab-explorador');
    const consola = pagina.getByRole('region', { name: 'Salida' });
    const listo = () => pagina.locator('.laboratorio__correr[data-fase="listo"]').waitFor({ timeout: 60_000 });
    const escribir = async (editor, codigo) => {
      await pagina.evaluate((t) => navigator.clipboard.writeText(t), codigo);
      await editor.click();
      await pagina.keyboard.press('ControlOrMeta+A');
      await pagina.keyboard.press('ControlOrMeta+V');
      await pagina.waitForFunction((t) => document.querySelector('.cm-content').innerText.replace(/\xa0/g, ' ').trim() === t.trim(), codigo);
    };
    const guardados = async () => JSON.parse(await pagina.evaluate(() => localStorage.getItem('cl.mio.5'))).laboratorio;
    const ajustes = async () => JSON.parse((await pagina.evaluate(() => localStorage.getItem('cl.ajustes'))) ?? '{}');
    const fallasAxe = async () => {
      await pagina.waitForFunction(() => document.getAnimations().every((x) => x.playState !== 'running' || x.effect?.getComputedTiming().iterations === Infinity));
      await pagina.evaluate(AXE);
      return pagina.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })).violations.map((v) => `${v.id}: ${v.nodes[0].target}`));
    };
    const abiertos = pagina.getByRole('tablist', { name: 'Archivos abiertos' });
    const pestanas = () => abiertos.getByRole('tab').allInnerTexts();
    const sinScroll = () => pagina.evaluate(() => document.scrollingElement.scrollHeight <= window.innerHeight);
    try {
      await titulo.waitFor();
      assert.equal(await sinScroll(), true, 'una sola pantalla en 1280, sin el pie');
      assert.equal(await pagina.getByRole('contentinfo').count(), 0, 'sin el pie del sitio');

      // «Nuevo» makes another file and what was open stays in its tab: two in a row, and both are there.
      for (const n of ['primero', 'segundo']) {
        await archivos.getByRole('button', { name: 'Nuevo', exact: true }).click();
        await archivos.getByLabel('Nombre del archivo nuevo').fill(n);
        await archivos.getByLabel('Lenguaje').selectOption('c');
        await archivos.getByRole('button', { name: 'Crear', exact: true }).click();
        await abiertos.getByRole('tab', { name: `${n}.c`, selected: true }).waitFor();
      }
      assert.ok((await pestanas()).includes('primero.c') && (await pestanas()).includes('segundo.c'), 'los dos quedan abiertos');
      assert.deepEqual((await guardados()).filter((a) => ['primero', 'segundo'].includes(a.nombre)).map((a) => a.nombre).sort(), ['primero', 'segundo']);

      // A project of C starts with its main.c; a header joins it, with its guard.
      await archivos.getByRole('button', { name: 'Nuevo proyecto' }).click();
      await archivos.getByLabel('Nombre del proyecto nuevo').fill('Agenda');
      await archivos.getByLabel('Lenguaje').selectOption('c');
      await archivos.getByRole('button', { name: 'Crear', exact: true }).click();
      const main = pagina.getByRole('textbox', { name: 'Código en C, main.c' });
      await main.waitFor();
      await archivos.getByRole('button', { name: 'Nuevo archivo en Agenda' }).click();
      await archivos.getByLabel('Nombre del archivo nuevo de Agenda').fill('agenda');
      await archivos.getByLabel('Tipo').selectOption('h');
      await archivos.getByRole('button', { name: 'Crear', exact: true }).click();
      const encabezado = pagina.getByRole('textbox', { name: 'Código en C, agenda.h' });
      await encabezado.waitFor();
      assert.match(await encabezado.innerText(), /#ifndef AGENDA_H/);

      // Three files opened, three tabs; one closed with its cross, two left. The wheel's click closes too.
      const tres = await pestanas();
      assert.ok(['segundo.c', 'main.c', 'agenda.h'].every((n) => tres.includes(n)), `tres abiertos: ${tres}`);
      await abiertos.locator('.lab-abiertos__item', { hasText: 'segundo.c' }).locator('.lab-abiertos__cerrar').click();
      assert.deepEqual(await pestanas(), tres.filter((n) => n !== 'segundo.c'));
      await abiertos.getByRole('tab', { name: 'primero.c' }).click({ button: 'middle' });
      assert.deepEqual(await pestanas(), tres.filter((n) => n !== 'segundo.c' && n !== 'primero.c'));
      await abiertos.getByRole('tab', { name: 'agenda.h', selected: true }).waitFor();

      // A file dragged into a project goes into it; from the keyboard, «Mover a…» takes it out again.
      await archivos.locator('.lab-arbol__fila', { hasText: 'primero.c' }).dragTo(archivos.locator('.lab-arbol__fila--proyecto', { hasText: 'Agenda' }));
      await pagina.getByText('Moviste primero.c a Agenda.').waitFor();
      const agenda = (await guardados()).find((a) => a.nombre === 'main' && a.proyecto).proyecto;
      assert.equal((await guardados()).find((a) => a.nombre === 'primero').proyecto, agenda);
      await archivos.getByRole('button', { name: 'Opciones de primero.c', exact: true }).click();
      await archivos.getByRole('button', { name: 'Mover a…' }).click();
      await archivos.getByLabel('Mover primero.c a').selectOption({ label: 'Fuera de los proyectos' });
      await archivos.getByRole('button', { name: 'Mover', exact: true }).click();
      await pagina.getByText('Sacaste primero.c del proyecto.').waitFor();
      assert.equal((await guardados()).find((a) => a.nombre === 'primero').proyecto, undefined);

      // The right click opens the menu of the row where the pointer is; a click in the editor closes it. Shift+F10 opens
      // it from the keyboard and Esc gives the focus back. In the editor, the browser's own.
      const menu = pagina.locator('.lab-menu:popover-open');
      await archivos.getByRole('button', { name: /^agenda\.h/ }).click({ button: 'right' });
      await menu.getByRole('button', { name: 'Cambiar el nombre' }).waitFor();
      await encabezado.click();
      assert.equal(await menu.count(), 0, 'un clic en el editor lo cierra');
      await archivos.getByRole('button', { name: 'Opciones de Agenda', exact: true }).click();
      await menu.getByRole('button', { name: 'Nuevo archivo' }).waitFor();
      await encabezado.click();
      assert.equal(await menu.count(), 0, 'el de «Opciones» también');
      await archivos.getByRole('button', { name: /^agenda\.h/ }).focus();
      await pagina.keyboard.press('Shift+F10');
      await menu.waitFor();
      assert.equal(await pagina.evaluate(() => document.activeElement.textContent), 'Cambiar el nombre');
      await pagina.keyboard.press('Escape');
      assert.equal(await menu.count(), 0);
      assert.match(await pagina.evaluate(() => document.activeElement.textContent), /^agenda\.h/, 'Esc devuelve el foco a la fila');
      await encabezado.click({ button: 'right' });
      assert.equal(await menu.count(), 0, 'en el editor queda el del navegador');
      await escribir(encabezado, '#ifndef AGENDA_H\n#define AGENDA_H\n#define TOPE 3\n#endif');
      await archivos.getByRole('button', { name: /^main\.c/ }).click();
      await main.waitFor();
      await escribir(main, '#include <stdio.h>\n#include "agenda.h"\nint main(void) {\n    FILE *f = fopen("turnos.txt", "w");\n    for (int i = 1; i <= TOPE; i++) fprintf(f, "turno %d\\n", i);\n    fclose(f);\n    printf("listo\\n");\n    return 0;\n}');

      // It runs with the whole folder, and what the program wrote shows in the files, marked.
      await listo();
      await main.press('ControlOrMeta+Enter');
      await consola.getByText('listo').waitFor({ timeout: 60_000 });
      const escrito = archivos.locator('[data-marca="cambiado"]', { hasText: 'turnos.txt' });
      await escrito.waitFor();
      await escrito.getByRole('button', { name: /^turnos\.txt/ }).click();
      const contenido = pagina.getByRole('textbox', { name: 'Contenido de turnos.txt' });
      await contenido.waitFor();
      assert.match(await contenido.innerText(), /turno 1\s+turno 2\s+turno 3/);
      assert.equal(await contenido.getAttribute('aria-readonly'), 'true');
      assert.ok(!JSON.stringify(await guardados()).includes('turno 1'), 'lo escrito no entra al código guardado hasta que lo guardes');

      // What it wrote stays in this browser: after a reload it's still there, and the next run reads it.
      const escritosGuardados = async () => JSON.parse(await pagina.evaluate(() => localStorage.getItem('cl.mio.5'))).escritos ?? [];
      await pagina.waitForFunction(() => (JSON.parse(localStorage.getItem('cl.mio.5')).escritos ?? []).some((e) => e.nombre === 'turnos.txt'));
      assert.equal((await escritosGuardados()).find((e) => e.nombre === 'turnos.txt').tam, 24);
      assert.ok(!JSON.stringify(await escritosGuardados()).includes('turno 1'), 'en la lista va el nombre, no lo que tiene');
      const escritor = '#include <stdio.h>\n#include "agenda.h"\nint main(void) {\n    FILE *f = fopen("turnos.txt", "w");\n    for (int i = 1; i <= TOPE; i++) fprintf(f, "turno %d\\n", i);\n    fclose(f);\n    printf("listo\\n");\n    return 0;\n}';
      await pagina.reload();
      await titulo.waitFor();
      await archivos.getByRole('button', { name: /^main\.c/ }).click();
      await main.waitFor();
      await escrito.waitFor();
      await escribir(main, '#include <stdio.h>\nint main(void) {\n    FILE *f = fopen("turnos.txt", "r");\n    char linea[40];\n    int n = 0;\n    while (fgets(linea, sizeof linea, f)) n++;\n    fclose(f);\n    printf("leyo %d turnos\\n", n);\n    return 0;\n}');
      await listo();
      await main.press('ControlOrMeta+Enter');
      await consola.getByText('leyo 3 turnos').waitFor({ timeout: 60_000 });
      await escribir(main, escritor);
      await escrito.getByRole('button', { name: /^turnos\.txt/ }).click();
      await contenido.waitFor();
      assert.match(await pagina.getByRole('group', { name: 'Lo que escribió el programa en turnos.txt' }).innerText(), /Queda en este navegador/);
      await boton('Guardar en el proyecto').click();
      await pagina.waitForFunction(() => (JSON.parse(localStorage.getItem('cl.mio.5')).laboratorio ?? []).some((a) => a.nombre === 'turnos' && a.ext === 'txt'));
      const propios = (await guardados()).filter((a) => a.proyecto);
      assert.deepEqual(propios.map((a) => `${a.nombre}.${a.ext ?? 'c'}`).sort(), ['agenda.h', 'main.c', 'turnos.txt']);
      assert.match(propios.find((a) => a.nombre === 'turnos').codigo, /^turno 1\nturno 2\nturno 3\n$/);
      assert.equal(await archivos.locator('[data-marca]').count(), 0, 'guardado, deja de estar marcado');
      await pagina.waitForFunction(() => !(JSON.parse(localStorage.getItem('cl.mio.5')).escritos ?? []).some((e) => e.nombre === 'turnos.txt'));
      await fin('laboratorio-ide');

      // The whole project as a zip, and back in as another one, with the same files.
      const [zip] = await Promise.all([pagina.waitForEvent('download'), boton('Bajar zip').click()]);
      assert.equal(zip.suggestedFilename(), 'Agenda.zip');
      const { unzipSync, strFromU8 } = await import('fflate');
      const dentro = unzipSync(fs.readFileSync(await zip.path()));
      assert.deepEqual(Object.keys(dentro).sort(), ['Agenda/agenda.h', 'Agenda/main.c', 'Agenda/turnos.txt']);
      assert.match(strFromU8(dentro['Agenda/agenda.h']), /#define TOPE 3/);
      await pagina.locator('input[type=file][accept^=".zip"]').setInputFiles({ name: 'Agenda de nuevo.zip', mimeType: 'application/zip', buffer: fs.readFileSync(await zip.path()) });
      await pagina.getByText('Subiste «Agenda de nuevo».').waitFor();
      await pagina.getByRole('textbox', { name: 'Código en C, main.c' }).waitFor();
      assert.equal((await guardados()).filter((a) => a.proyecto).length, 6);
      await archivos.getByRole('button', { name: 'Opciones de Agenda de nuevo', exact: true }).click();
      await archivos.getByRole('button', { name: 'Borrar el proyecto' }).click();
      await pagina.getByRole('dialog', { name: '¿Borrar el proyecto «Agenda de nuevo»?' }).getByRole('button', { name: 'Borrar' }).click();
      await pagina.getByText('Proyecto borrado.').waitFor();
      await archivos.getByRole('button', { name: /^main\.c/ }).click();

      // The autocomplete: «pri» shows printf first, with its prototype, in a listbox said to the screen reader and under
      // the line being written; Enter accepts its template. What the project's header defines comes too, Esc closes the
      // list and a click elsewhere also.
      await main.waitFor();
      await main.click();
      await pagina.keyboard.press('ControlOrMeta+End');
      await pagina.keyboard.press('Enter');
      // What the editor says to the screen reader lasts a moment there: it's written down as it comes.
      await pagina.evaluate(() => {
        window.anuncios = [];
        const zona = document.querySelector('.cm-announced');
        new MutationObserver(() => zona.innerText.trim() && window.anuncios.push(zona.innerText.trim())).observe(zona, { childList: true, subtree: true, characterData: true });
      });
      await pagina.keyboard.type('pri');
      const sugerencias = pagina.getByRole('listbox', { name: 'Sugerencias' });
      await sugerencias.waitFor();
      const primera = sugerencias.getByRole('option').first();
      assert.match(await primera.innerText(), /^printf\s*int printf\(const char \*formato, \.\.\.\)$/);
      assert.equal(await primera.getAttribute('aria-selected'), 'true');
      await pagina.waitForFunction(() => window.anuncios.some((t) => /^\d+ sugerencias?$/.test(t)));
      const caja = await pagina.locator('.cm-tooltip-autocomplete').boundingBox();
      const renglon = await main.locator('.cm-activeLine').boundingBox();
      assert.ok(caja.y >= renglon.y + renglon.height - 1 || caja.y + caja.height <= renglon.y + 1, 'no tapa la línea');
      await pagina.keyboard.press('Enter');
      await sugerencias.waitFor({ state: 'detached' });
      assert.match(await main.innerText(), /^printf\("texto\\n"\);$/m);
      await pagina.keyboard.press('Escape');
      await pagina.keyboard.press('End');
      await pagina.keyboard.press('Enter');
      await pagina.keyboard.type('TO');
      await sugerencias.getByRole('option', { name: /^TOPE/ }).waitFor();
      await pagina.keyboard.press('Escape');
      await sugerencias.waitFor({ state: 'detached' });
      await pagina.keyboard.type('P');
      await sugerencias.waitFor();
      await titulo.click();
      await sugerencias.waitFor({ state: 'detached' });

      // As Error Lens (on by default): the error of C at the end of its line, which is marked; editing that line takes it.
      await escribir(main, '#include <stdio.h>\nint main(void) {\n    int total = 0\n    printf("%d\\n", total);\n    return 0;\n}');
      await main.press('ControlOrMeta+Enter');
      const lente = main.locator('.editor__lente');
      await lente.waitFor({ timeout: 60_000 });
      assert.match(await lente.innerText(), /;/);
      assert.equal(await lente.getAttribute('aria-hidden'), 'true', 'el lector lo oye al llegar a la línea, no dos veces');
      assert.equal(await main.locator('.cm-line.editor__linea-error').count(), 1);
      await fin('laboratorio-lente');
      await main.locator('.cm-line.editor__linea-error').click();
      await pagina.keyboard.press('End');
      await pagina.keyboard.type(';');
      await lente.waitFor({ state: 'detached' });

      // While typing, without running (revisar.js): C compiles, and Python goes through pyflakes once its engine is in.
      const salidaAntes = await consola.innerText();
      await escribir(main, '#include <stdio.h>\nint main(void) {\n    int x = \n    return 0;\n}');
      await lente.waitFor({ timeout: 30_000 });
      assert.equal(await main.locator('.cm-line.editor__linea-error').count(), 1, 'C marca su línea sin correr');
      assert.equal(await consola.innerText(), salidaAntes, 'no corrió');
      await archivos.getByRole('button', { name: 'Nuevo proyecto' }).click();
      await archivos.getByLabel('Nombre del proyecto nuevo').fill('Revisa');
      await archivos.getByLabel('Lenguaje').selectOption('python');
      await archivos.getByRole('button', { name: 'Crear', exact: true }).click();
      const enPython = pagina.getByRole('textbox', { name: 'Código en Python, main.py' });
      await enPython.waitFor();
      await listo();
      await escribir(enPython, 'nombre = "Ana"\npirnt(nombre)\n');
      const lentePython = enPython.locator('.editor__lente');
      await lentePython.waitFor({ timeout: 30_000 });
      assert.equal(await lentePython.innerText(), '`pirnt` no está definido. ¿Quisiste decir `print`?');
      assert.equal(await consola.innerText(), 'Lo que imprima tu programa aparece acá.', 'Python tampoco corrió');
      await fin('laboratorio-revisar');
      await archivos.getByRole('button', { name: 'Opciones de Revisa', exact: true }).click();
      await archivos.getByRole('button', { name: 'Borrar el proyecto' }).click();
      await pagina.getByRole('dialog', { name: '¿Borrar el proyecto «Revisa»?' }).getByRole('button', { name: 'Borrar' }).click();
      await enPython.waitFor({ state: 'detached' });
      await archivos.getByRole('button', { name: /^main\.c/ }).click();
      await escribir(main, '#include <stdio.h>\nint main(void) {\n    int total = 0;\n    printf("%d\\n", total);\n    return 0;\n}');

      // The lab's section of Configuración: without line numbers and in another letter, the editor follows it.
      await ir('configuracion#laboratorio');
      const seccionLab = pagina.getByRole('tabpanel', { name: 'Laboratorio' });
      await seccionLab.getByRole('switch', { name: 'Números de línea' }).uncheck();
      await seccionLab.getByRole('radio', { name: /JetBrains Mono/ }).check();
      assert.deepEqual(await fallasAxe(), [], 'la sección del laboratorio, accesible');
      await fin('configuracion-laboratorio');
      await ir('laboratorio');
      await titulo.waitFor();
      await archivos.getByRole('button', { name: /^main\.c/ }).click();
      await main.waitFor();
      assert.equal(await main.locator('xpath=ancestor::div[contains(@class,"cm-editor")]').locator('.cm-lineNumbers').count(), 0, 'sin números');
      assert.match(await main.evaluate((e) => getComputedStyle(e).fontFamily), /JetBrains Mono/);
      await ir('configuracion#laboratorio');
      await seccionLab.getByRole('switch', { name: 'Números de línea' }).check();
      await seccionLab.getByRole('radio', { name: 'La del sistema' }).check();
      await ir('laboratorio');
      await titulo.waitFor();

      // The files and the panel, from the keyboard: the edges move, Ctrl+B and Ctrl+J hide them, and it's remembered.
      const borde = pagina.getByRole('separator', { name: 'Alto del panel' });
      const alto = Number(await borde.getAttribute('aria-valuenow'));
      await borde.focus();
      await borde.press('ArrowUp');
      assert.equal(Number(await borde.getAttribute('aria-valuenow')), alto + 16);
      assert.equal((await ajustes()).labPanel, alto + 16);
      await pagina.keyboard.press('ControlOrMeta+j');
      assert.equal(await pagina.locator('.lab-panel__cuerpo').isVisible(), false);
      assert.equal(await borde.getAttribute('aria-valuetext'), 'Oculto');
      await pagina.keyboard.press('ControlOrMeta+b');
      assert.equal(await archivos.isVisible(), false);
      assert.equal((await ajustes()).labSinArchivos, true);
      await pagina.reload();
      await titulo.waitFor();
      assert.equal(await archivos.isVisible(), false, 'se acuerda en este dispositivo');
      await pagina.keyboard.press('ControlOrMeta+b');
      await pagina.keyboard.press('ControlOrMeta+j');
      await archivos.waitFor();
      assert.equal(await pagina.locator('.lab-panel__cuerpo').isVisible(), true);
      assert.deepEqual(await fallasAxe(), [], 'el editor, accesible en 1280');

      // On a phone the files go in a drawer, and nothing goes off to the side.
      await pagina.setViewportSize({ width: 390, height: 844 });
      await pagina.getByRole('button', { name: 'Tus archivos' }).click();
      const cajon = pagina.getByRole('dialog', { name: 'Tus archivos' });
      await cajon.getByRole('button', { name: /^agenda\.h/ }).click();
      await pagina.getByRole('textbox', { name: 'Código en C, agenda.h' }).waitFor();
      assert.equal(await cajon.isVisible(), false, 'abrir un archivo cierra el cajón');
      assert.ok(await pagina.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'entra en 390');
      assert.equal(await sinScroll(), true, 'una sola pantalla en 390');
      assert.deepEqual(await fallasAxe(), [], 'el editor, accesible en 390');
      await fin('laboratorio-ide-390');
      await pagina.setViewportSize({ width: 1280, height: 860 });

      // Deleting the project takes its files, after asking.
      await archivos.getByRole('button', { name: 'Opciones de Agenda', exact: true }).click();
      await archivos.getByRole('button', { name: 'Borrar el proyecto' }).click();
      await pagina.getByRole('dialog', { name: '¿Borrar el proyecto «Agenda»?' }).getByRole('button', { name: 'Borrar' }).click();
      await pagina.getByText('Proyecto borrado.').waitFor();
      assert.equal((await guardados()).filter((a) => a.proyecto).length, 0);

      const deGoogle = (u) => /^https:\/\/(classroom|www|oauth2)\.googleapis\.com\//.test(u);
      assert.deepEqual(pedidos.slice(pedidosAntes).map((p) => p.url).filter((u) => !u.startsWith(CAMPUS) && !deGoogle(u)), [], 'el laboratorio no pide nada afuera');
      const reales = errores.slice(antes).filter((e) => !/Failed to load resource/.test(e));
      assert.deepEqual(reales, [], 'sin errores en la consola');
    } finally {
      await pagina.setViewportSize({ width: 1280, height: 860 });
    }
  });

  await prueba('laboratorio casos: un programa de C que lee dos números, tres casos y uno que falla a propósito', async () => {
    // Alone (FLUJOS_SOLO) it starts from the sign-in.
    await ir('laboratorio');
    const usuario = pagina.getByLabel('Usuario');
    const titulo = pagina.getByRole('heading', { name: 'Laboratorio', level: 1 });
    await Promise.race([usuario.waitFor().catch(() => {}), titulo.waitFor().catch(() => {})]);
    if (await usuario.isVisible()) {
      await usuario.fill('alumno');
      await pagina.getByLabel('Contraseña').fill(CONTRASENA);
      await boton('Entrar').click();
      await pagina.getByRole('heading', { name: 'Hola, Ana' }).waitFor();
      await ir('laboratorio');
    }
    const antes = errores.length;
    const archivos = pagina.locator('.lab-explorador');
    const listo = () => pagina.locator('.laboratorio__correr[data-fase="listo"]').waitFor({ timeout: 60_000 });
    const guardados = async () => JSON.parse(await pagina.evaluate(() => localStorage.getItem('cl.mio.5'))).laboratorio;
    try {
      await titulo.waitFor();
      await archivos.getByRole('button', { name: 'Nuevo', exact: true }).click();
      await archivos.getByLabel('Nombre del archivo nuevo').fill('suma');
      await archivos.getByLabel('Lenguaje').selectOption('c');
      await archivos.getByRole('button', { name: 'Crear', exact: true }).click();
      const editor = pagina.getByRole('textbox', { name: /^Código en C/ });
      await editor.waitFor();
      const codigo = '#include <stdio.h>\nint main(void) {\n    int a, b;\n    printf("a: ");\n    scanf("%d", &a);\n    printf("b: ");\n    scanf("%d", &b);\n    printf("Suma: %d\\n", a + b);\n    return 0;\n}';
      await pagina.evaluate((t) => navigator.clipboard.writeText(t), codigo);
      await editor.click();
      await pagina.keyboard.press('ControlOrMeta+A');
      await pagina.keyboard.press('ControlOrMeta+V');
      await pagina.waitForFunction((t) => document.querySelector('.cm-content').innerText.replace(/\xa0/g, ' ').trim() === t.trim(), codigo);
      await listo();

      // Three cases: one with spaces and empty lines at the end that don't count, and one wrong on purpose.
      await pagina.getByRole('tab', { name: 'Casos' }).click();
      const casos = pagina.getByRole('tabpanel', { name: 'Casos' });
      const sumarCaso = async (nombre, entrada, esperada) => {
        await casos.getByRole('button', { name: 'Sumar un caso' }).click();
        await casos.getByLabel('Nombre').fill(nombre);
        await casos.getByLabel('Entrada').fill(entrada);
        await casos.getByLabel('Salida esperada').fill(esperada);
      };
      await sumarCaso('Positivos', '2\n3', 'a: 2\nb: 3\nSuma: 5');
      await sumarCaso('Negativos', '-4\n1', 'a: -4\nb: 1\nSuma: -3   \n\n');
      await sumarCaso('Mal a propósito', '10\n5', 'a: 10\nb: 5\nSuma: 16');
      const guardado = (await guardados()).find((a) => a.nombre === 'suma');
      assert.deepEqual(guardado.casos.map((c) => [c.nombre, c.entrada]), [['Positivos', '2\n3'], ['Negativos', '-4\n1'], ['Mal a propósito', '10\n5']], 'los casos quedan con el archivo');

      // «Probar todos»: without stopping to ask, the panel stays on the cases, and the one that failed comes into view.
      await casos.getByRole('button', { name: 'Probar todos' }).click();
      await casos.getByRole('status').getByText('Pasaron 2 de 3.').waitFor({ timeout: 60_000 });
      assert.equal(await pagina.getByRole('tab', { name: 'Casos' }).getAttribute('aria-selected'), 'true', 'sigue en Casos');
      const lista = casos.getByRole('list', { name: 'Casos de prueba' });
      const nombres = await lista.getByRole('button').evaluateAll((l) => l.map((b) => b.textContent));
      assert.deepEqual(nombres, ['Pasó, Positivos', 'Pasó, Negativos', 'Falló, Mal a propósito'], 'cada uno con cómo le fue');
      await casos.getByText('La línea 3 es distinta.').waitFor();
      const fila = casos.locator('tr[data-tipo="distinta"]');
      assert.equal(await fila.count(), 1, 'una sola línea distinta');
      assert.deepEqual(await fila.locator('mark').allInnerTexts(), ['6', '5'], 'marca desde dónde difiere');
      await fin('laboratorio-casos');
      await pagina.setViewportSize({ width: 390, height: 860 });
      await fila.scrollIntoViewIfNeeded();
      assert.ok(await pagina.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'entra en 390');
      await fin('laboratorio-casos-390');
      await pagina.setViewportSize({ width: 1280, height: 860 });
      await pagina.evaluate(AXE);
      const fallas = await pagina.evaluate(async () => (await window.axe.run(document.querySelector('.lab-casos'), { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })).violations.map((v) => `${v.id}: ${v.nodes[0].target}`));
      assert.deepEqual(fallas, [], 'los casos, accesibles');

      // What came out, as expected: it passes without running again.
      await casos.getByRole('button', { name: 'Usar lo que salió como esperado' }).click();
      await casos.getByText('Salió lo esperado.').waitFor();
      assert.equal((await guardados()).find((a) => a.nombre === 'suma').casos[2].esperada, 'a: 10\nb: 5\nSuma: 15\n');

      // One case alone: its result shows in «Casos», which stays open.
      await casos.getByRole('button', { name: 'Correr este caso' }).click();
      await casos.getByText('Salió lo esperado.').waitFor({ timeout: 60_000 });
      assert.equal(await pagina.getByRole('tab', { name: 'Casos' }).getAttribute('aria-selected'), 'true', 'sigue en Casos');
      const reales = errores.slice(antes).filter((e) => !/Failed to load resource/.test(e));
      assert.deepEqual(reales, [], 'sin errores en la consola');
    } finally {
      await pagina.setViewportSize({ width: 1280, height: 860 });
    }
  });

  await prueba('consultron: revisa la compu antes de bajar, responde con la página de donde sale y nada sale del navegador', async () => {
    // A computer with WebGPU or without it, as the test says in localStorage (prueba-gpu), put in before the page loads.
    await pagina.addInitScript(() => {
      let modo = null;
      try {
        modo = localStorage.getItem('prueba-gpu');
      } catch {
        return;
      }
      if (!modo) return;
      const gpu = modo === 'sin' ? undefined : { requestAdapter: async () => ({ features: new Set(['shader-f16']) }) };
      Object.defineProperty(Navigator.prototype, 'gpu', { configurable: true, get: () => gpu });
    });
    const antes = pedidos.length;
    // Nothing of another run.
    await pagina.evaluate(async () => {
      localStorage.removeItem('cl.consultron');
      await caches.delete('prueba-consultron');
    });

    // Without WebGPU it says why, before downloading anything.
    await pagina.evaluate(() => localStorage.setItem('prueba-gpu', 'sin'));
    await ir('consultron');
    await pagina.getByText('Este navegador no puede usar la placa de video.', { exact: false }).waitFor();
    assert.equal(await boton('Bajar Consultron').count(), 0);

    // With it: it asks before the 2,4 GB and shows how it goes. Nothing of the courses is read until something is asked.
    await pagina.evaluate(() => localStorage.setItem('prueba-gpu', 'con'));
    await ir('consultron');
    await boton('Bajar Consultron').click();
    const confirmar = pagina.getByRole('dialog');
    await confirmar.getByText('¿Bajar 2,4 GB?').waitFor();
    await confirmar.getByRole('button', { name: 'Bajar', exact: true }).click();
    await pagina.getByText(/^Van 1,2 de 2,4 GB\. Falta un minuto\./).waitFor();
    await fin('consultron-bajando');
    const campo = pagina.getByRole('textbox', { name: 'Tu pregunta' });
    await campo.waitFor({ timeout: 15000 });
    await pagina.waitForTimeout(500);
    assert.deepEqual(pedidos.slice(antes).filter((p) => p.url.includes('/pluginfile.php/')).map((p) => p.url), [], 'no baja ningún PDF al abrir');

    // The answer comes from the piece with the words, and its tab opens the PDF at that page.
    await campo.fill('¿Qué es un monitor?');
    await campo.press('Enter');
    const respuesta = pagina.locator('.consultron__entrada[data-estado="listo"]');
    await respuesta.getByRole('heading', { name: '¿Qué es un monitor?' }).waitFor();
    await respuesta.getByText('Sale de Apunte uno, Materia A, pág. 2', { exact: false }).waitFor();
    assert.equal(await campo.inputValue(), '', 'el campo queda vacío para la próxima');
    await respuesta.locator('.consultron__fuentes').getByText('Materia A, página 2').waitFor();
    await fin('consultron-respuesta');
    await respuesta.getByRole('button', { name: 'Fuente 1, Apunte uno, página 2' }).first().click();
    const hoja = pagina.getByRole('dialog');
    const numero = hoja.getByRole('textbox', { name: 'Página, de 2' });
    await numero.waitFor();
    assert.equal(await numero.inputValue(), '2');
    await boton('Cerrar').click();
    await hoja.waitFor({ state: 'detached' });

    // What isn't in the notes is answered with what it knows in general, said above the answer.
    await campo.fill('¿Cómo se calcula una integral por partes?');
    await boton('Preguntar').click();
    const general = pagina.locator('.consultron__entrada[data-estado="listo"]').filter({ hasText: 'integral por partes' });
    await general.getByText('En general, se hace por partes.').waitFor();
    assert.match(await general.innerText(), /No está en tus apuntes/);

    // About the topic of a calculator, without data: after the answer, one of the calculator's own examples, the one
    // closest to the question, filled as it opens.
    await campo.fill('¿Qué es una máscara de subred?');
    await boton('Preguntar').click();
    const conEjemplo = pagina.locator('.consultron__entrada').filter({ hasText: 'máscara de subred' });
    await conEjemplo.getByRole('button', { name: 'Abrir con este ejemplo' }).waitFor();
    assert.match(await conEjemplo.innerText(), /Probalo en la calculadora de Subredes con su ejemplo «5 hosts por subred»/);
    await foto('consultron-ejemplo');
    await conEjemplo.getByRole('button', { name: 'Abrir con este ejemplo' }).click();
    await pagina.waitForURL(/\/calculadoras\/subred$/);
    await pagina.locator('.calc-hoja').waitFor();
    assert.equal(await pagina.getByRole('radio', { name: 'Hosts por subred' }).isChecked(), true, 'el ejemplo elegido');
    await pagina.goBack();
    await pagina.waitForURL(/\/consultron$/);
    await campo.waitFor();

    // Code in an answer goes to the lab, with where it came from.
    await campo.fill('Dame una consulta SQL para contar alumnos');
    await boton('Preguntar').click();
    const conCodigo = pagina.locator('.consultron__entrada[data-estado="listo"]').filter({ hasText: 'consulta SQL' });
    assert.equal(await conCodigo.locator('pre code').innerText(), 'SELECT COUNT(*) FROM alumnos;');
    await foto('consultron-codigo');
    await conCodigo.getByRole('button', { name: 'Probar en el Laboratorio' }).click();
    await pagina.waitForURL(/\/laboratorio$/);
    await pagina.getByText(/Viene de «Consultron»/).waitFor();
    assert.equal(await pagina.getByRole('radio', { name: 'SQL' }).isChecked(), true, 'el lenguaje del bloque');
    await pagina.locator('.cm-line').first().waitFor();
    const codigoLab = await pagina.evaluate(() => [...document.querySelectorAll('.cm-line')].map((l) => l.textContent.replace(/\u00a0/g, ' ')).join('\n'));
    assert.equal(codigoLab, 'SELECT COUNT(*) FROM alumnos;');
    await pagina.goBack();
    await pagina.waitForURL(/\/consultron$/);
    await campo.waitFor();

    // A greeting is answered, with the courses where it looks, and without reading anything.
    await campo.fill('Hola, ¿qué sabés?');
    await campo.press('Enter');
    await pagina.locator('.consultron__entrada[data-estado="listo"]').filter({ hasText: '¡Hola! Leí Materia A' }).waitFor();

    // An exercise goes to its calculator: the data of the question, to check, and the calculator with them.
    await campo.fill('Calculá las subredes de 10.0.0.0/16 para 6 áreas');
    await campo.press('Enter');
    const calculo = pagina.locator('.consultron__entrada[data-estado="calculo"]');
    await calculo.getByText('10.0.0.0/16', { exact: true }).waitFor();
    assert.match(await calculo.innerText(), /calculadora de Subredes/);
    await fin('consultron-calculo');
    const tema = await pagina.evaluate(() => document.documentElement.dataset.tema);
    await pagina.evaluate(() => { document.documentElement.dataset.tema = 'oscuro'; });
    await foto('consultron-oscuro');
    await pagina.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await foto('consultron-oscuro-arriba');
    await pagina.evaluate((t) => { document.documentElement.dataset.tema = t; }, tema);
    await pagina.setViewportSize({ width: 390, height: 844 });
    assert.ok(await pagina.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'en el celular nada se sale a lo ancho');
    await calculo.scrollIntoViewIfNeeded();
    await foto('consultron-calculo-celu');
    await pagina.setViewportSize({ width: 1280, height: 860 });
    await calculo.getByRole('button', { name: 'Abrir con estos datos' }).click();
    await pagina.waitForURL(/\/calculadoras\/subred$/);
    assert.equal(await pagina.getByRole('textbox', { name: 'La red' }).inputValue(), '10.0.0.0/16');
    assert.equal(await pagina.getByRole('textbox', { name: /^Cuántas/ }).inputValue(), '6');
    // With a computer, the talk stays open in its corner, over the calculator, which stays where it was: as wide as
    // the window, and Consultron under its top.
    const rincon = pagina.getByRole('dialog', { name: 'Consultron' });
    await rincon.getByRole('heading', { name: 'Calculá las subredes de 10.0.0.0/16 para 6 áreas' }).waitFor();
    const enRincon = await pagina.evaluate(() => {
      const panel = document.querySelector('.flotante');
      return { arriba: panel.getBoundingClientRect().top, alto: panel.offsetHeight, sitio: Math.round(document.querySelector('.sitio').getBoundingClientRect().width), ventana: innerWidth, altoVentana: innerHeight };
    });
    assert.equal(enRincon.sitio, enRincon.ventana, 'la calculadora no se corre ni se achica');
    assert.ok(enRincon.alto <= enRincon.altoVentana - 96, 'no llega hasta arriba');
    await foto('consultron-rincon-calculadora');
    await rincon.getByRole('button', { name: 'Pantalla completa' }).click();
    await pagina.waitForURL(/\/consultron$/);
    // In its screen, the corner isn't there.
    await rincon.waitFor({ state: 'detached' });
    await campo.waitFor();

    // A long answer stops with «Frenar», and the next question goes.
    await campo.fill('Contame todo de los semáforos');
    await campo.press('Enter');
    await boton('Frenar').click();
    await pagina.locator('.consultron__entrada[data-estado="frenado"]').getByText('La frenaste.').waitFor();
    await campo.fill('¿Qué es un monitor?');
    await boton('Preguntar').click();
    await pagina.waitForFunction(() => document.querySelector('.consultron__hilo article.consultron__entrada:last-of-type')?.dataset.estado === 'listo');
    assert.equal(await pagina.locator('.consultron__entrada').count(), 8);

    // A text file and a photo go with the question, the photo read with the OCR of /motores/ocr/ in this browser. The
    // model gets what both say. Nothing of them goes to disk.
    const fotoMonitor = await pagina.evaluate(() => {
      const lienzo = document.createElement('canvas');
      lienzo.width = 900;
      lienzo.height = 200;
      const ctx = lienzo.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, 900, 200);
      ctx.fillStyle = '#000';
      ctx.font = '36px Arial, sans-serif';
      ctx.fillText('Un monitor protege los datos compartidos', 30, 80);
      ctx.fillText('con una sola entrada a la vez.', 30, 140);
      return lienzo.toDataURL('image/png').split(',')[1];
    });
    await pagina.evaluate(() => {
      window.pedidosConsultron = [];
      const mandar = Worker.prototype.postMessage;
      Worker.prototype.postMessage = function (m, ...resto) {
        if (m?.tipo === 'preguntar') window.pedidosConsultron.push(m.mensajes.at(-1).content);
        return mandar.call(this, m, ...resto);
      };
    });
    await pagina.locator('.consultron__caja input[type="file"]').setInputFiles([
      { name: 'semaforos.txt', mimeType: 'text/plain', buffer: Buffer.from('Un semáforo binario garantiza exclusión mutua.\n') },
      { name: 'monitor.png', mimeType: 'image/png', buffer: Buffer.from(fotoMonitor, 'base64') },
    ]);
    const enLaCaja = pagina.getByRole('list', { name: 'Adjuntos' });
    await enLaCaja.getByRole('button', { name: 'Sacar monitor.png' }).waitFor();
    await pagina.locator('.consultron__lectura').getByText('Leyó lo que adjuntaste.').waitFor({ timeout: 60000 });
    await foto('consultron-adjuntos');
    await campo.fill('Resumime lo que adjunté');
    await campo.press('Enter');
    await enLaCaja.waitFor({ state: 'detached' });
    const conAdjuntos = pagina.locator('.consultron__entrada[data-estado="listo"]').filter({ hasText: 'Resumime lo que adjunté' });
    const fueron = conAdjuntos.getByRole('list', { name: 'Lo que adjuntaste' });
    await fueron.getByText('semaforos.txt').waitFor();
    await fueron.getByText('monitor.png').waitFor();
    // The answer cites only its first piece, the text file's.
    await conAdjuntos.locator('.consultron__fuentes').getByText('Archivo que adjuntaste').waitFor();
    const alModelo = await pagina.evaluate(() => window.pedidosConsultron.at(-1));
    assert.match(alModelo, /protege los datos compartidos/, 'lo que dice la foto llega al modelo');
    assert.match(alModelo, /exclusión mutua/, 'lo que dice el archivo llega al modelo');
    const guardados = await pagina.evaluate(async () => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }) + JSON.stringify((await indexedDB.databases()).map((b) => b.name)));
    assert.ok(!/datos compartidos|exclusión mutua|keyval/.test(guardados), 'lo adjuntado queda en memoria');
    assert.equal(await pagina.locator('.consultron__entrada').count(), 9);

    // The talk goes only to this browser's database (charlas.js), never to its other storage, and nothing went out:
    // not even to Hugging Face. Of what was attached, only its name.
    const disco = await pagina.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
    assert.ok(!/Sale de Apunte|integral por partes|Contame todo/.test(disco), 'las preguntas, fuera de localStorage y sessionStorage');
    await pagina.waitForTimeout(500);
    const charlaGuardada = await pagina.evaluate(() => new Promise((listo, mal) => {
      const abrir = indexedDB.open('super-cvg-charlas');
      abrir.onerror = () => mal(abrir.error);
      abrir.onsuccess = () => {
        const todas = abrir.result.transaction('charlas').objectStore('charlas').getAll();
        todas.onsuccess = () => {
          abrir.result.close();
          listo(JSON.stringify(todas.result));
        };
      };
    }));
    assert.match(charlaGuardada, /semaforos\.txt/, 'la charla dice qué se adjuntó');
    assert.doesNotMatch(charlaGuardada, /exclusión mutua|datos compartidos|blob:|pluginfile/, 'sin lo adjuntado ni nada más del campus');
    const deGoogle = (u) => /^https:\/\/(classroom|www|oauth2)\.googleapis\.com\//.test(u);
    assert.deepEqual(pedidos.slice(antes).map((p) => p.url).filter((u) => !u.startsWith(CAMPUS) && !deGoogle(u)), [], 'Consultron no pide nada afuera');

    // «Achicar» goes back to where the student was, with the corner open and the same questions. In a course's screen it
    // looks in that course. Closed, its button is down on the right, and opening it again goes to where to write.
    await boton('Achicar').click();
    await pagina.waitForURL(/\/calculadoras\/subred$/);
    const chico = pagina.getByRole('dialog', { name: 'Consultron' });
    await chico.locator('.consultron__entrada').nth(8).waitFor();
    assert.equal(await chico.locator('.consultron__entrada').count(), 9);
    // About the screen it's on: what the calculator shows now, and Super CVG's guide of that calculator, with its
    // link, without reading the notes.
    const escribirAca = chico.getByRole('textbox', { name: 'Tu pregunta' });
    await escribirAca.fill('¿Qué es esta página?');
    await escribirAca.press('Enter');
    await pagina.waitForFunction(() => document.querySelector('.flotante article.consultron__entrada:last-of-type')?.dataset.estado === 'listo');
    const aca = chico.locator('article.consultron__entrada').last();
    assert.match(await aca.innerText(), /Subredes/);
    assert.match(await aca.innerText(), /lo que muestra ahora «[^»]+» en la pantalla del alumno/, 'lee la calculadora que tiene abierta');
    await aca.locator('.consultron__fuente').filter({ hasText: 'En tu pantalla' }).waitFor();
    assert.equal(await aca.getByRole('link', { name: /Subredes/ }).first().getAttribute('href'), '/calculadoras/subred');
    await chico.getByRole('button', { name: 'Cerrar Consultron' }).click();
    // Loaded, its name says so, and a dot on it.
    const abrirRincon = pagina.getByRole('button', { name: 'Consultron, listo', exact: true });
    await abrirRincon.waitFor();
    assert.equal(await abrirRincon.evaluate((b) => b === document.activeElement), true, 'el foco vuelve al botón');
    await pagina.evaluate(() => {
      history.pushState(null, '', '/materias/1');
      dispatchEvent(new PopStateEvent('popstate'));
    });
    await abrirRincon.click();
    const escribir = chico.getByRole('textbox', { name: 'Tu pregunta' });
    await escribir.waitFor();
    assert.equal(await escribir.evaluate((c) => c === document.activeElement), true, 'abre en donde escribir');
    assert.equal(await chico.getByRole('combobox', { name: 'De qué materia' }).inputValue(), '1', 'en una materia, busca en esa');
    // Its top edge and its two buttons change how tall it is, and it stays that way.
    // Without the scale it opens with.
    const alto = () => chico.evaluate((p) => p.offsetHeight);
    const deSiempre = await alto();
    const bordeDeArriba = chico.getByRole('separator', { name: 'Alto de Consultron' });
    await bordeDeArriba.focus();
    await pagina.keyboard.press('ArrowDown');
    assert.equal(await alto(), deSiempre - 16);
    await chico.getByRole('button', { name: 'Consultron más bajo', exact: true }).click();
    assert.equal(await alto(), deSiempre - 96);
    assert.equal(await pagina.evaluate(() => JSON.parse(localStorage.getItem('cl.ajustes')).altoConsultron), deSiempre - 96, 'el alto queda guardado');
    await bordeDeArriba.focus();
    await pagina.keyboard.press('Enter');
    assert.equal(await alto(), deSiempre, 'Enter vuelve al de siempre');
    // Its left edge and its two other buttons change how wide it is, the same way. The page stays as wide as the window.
    const ancho = () => chico.evaluate((p) => p.offsetWidth);
    const anchoDeSiempre = await ancho();
    const bordeDeLaIzquierda = chico.getByRole('separator', { name: 'Ancho de Consultron' });
    await bordeDeLaIzquierda.focus();
    await pagina.keyboard.press('ArrowLeft');
    assert.equal(await ancho(), anchoDeSiempre + 16);
    await chico.getByRole('button', { name: 'Consultron más ancho', exact: true }).click();
    assert.equal(await ancho(), anchoDeSiempre + 96);
    assert.equal(await pagina.evaluate(() => JSON.parse(localStorage.getItem('cl.ajustes')).anchoRincon), anchoDeSiempre + 96, 'el ancho queda guardado');
    assert.equal(await pagina.evaluate(() => Math.round(document.querySelector('.sitio').getBoundingClientRect().width) === document.documentElement.clientWidth), true, 'la página no se achica');
    await bordeDeLaIzquierda.focus();
    await pagina.keyboard.press('Enter');
    assert.equal(await ancho(), anchoDeSiempre, 'Enter vuelve al de siempre');
    await escribir.focus();
    await escribir.fill('¿Qué es un monitor?');
    await escribir.press('Enter');
    await pagina.waitForFunction(() => document.querySelector('.flotante article.consultron__entrada:last-of-type')?.dataset.estado === 'listo');
    assert.match(await chico.locator('article.consultron__entrada').last().innerText(), /Sale de/);
    await foto('consultron-rincon');
    await pagina.keyboard.press('Escape');
    await abrirRincon.waitFor();
    await pagina.evaluate(() => {
      history.pushState(null, '', '/consultron');
      dispatchEvent(new PopStateEvent('popstate'));
    });
    await campo.waitFor();
    assert.equal(await pagina.locator('.consultron__entrada').count(), 11, 'la misma charla en su pantalla');

    // «Charla nueva» starts another, and this one stays among the ones of before. «Borrar Consultron» asks first.
    await boton('Charla nueva').click();
    assert.equal(await pagina.locator('.consultron__entrada').count(), 0);
    await pagina.getByRole('region', { name: 'Charlas anteriores' }).getByRole('button', { name: /^¿Qué es un monitor\?/ }).waitFor();

    // Once on this computer, it loads as Super CVG opens, without its screen, and it's ready on arrival.
    const llegar = () => pagina.evaluate(() => {
      history.pushState(null, '', '/consultron');
      dispatchEvent(new PopStateEvent('popstate'));
    });
    let arranques = arranquesConsultron;
    await ir('');
    await pagina.waitForFunction(() => document.title.length > 0);
    for (let i = 0; i < 40 && arranquesConsultron === arranques; i++) await pagina.waitForTimeout(250);
    assert.equal(arranquesConsultron, arranques + 1, 'arranca solo al abrir Super CVG');
    await llegar();
    await campo.waitFor({ timeout: 15000 });
    assert.equal(arranquesConsultron, arranques + 1, 'la pantalla usa el que ya estaba');

    // Turned off, it waits for its screen.
    const alAbrir = pagina.getByRole('switch', { name: 'Cargarlo apenas abrís Super CVG' });
    assert.equal(await alAbrir.isChecked(), true);
    await alAbrir.click();
    arranques = arranquesConsultron;
    await ir('');
    await pagina.waitForTimeout(4500);
    assert.equal(arranquesConsultron, arranques, 'apagado, no arranca al abrir');
    await llegar();
    await campo.waitFor({ timeout: 15000 });
    await alAbrir.click();
    assert.equal(await pagina.evaluate(() => localStorage.getItem('cl.consultron')), 'listo');

    await boton('Borrar Consultron de esta compu').click();
    await pagina.getByRole('dialog').getByRole('button', { name: 'Borrar', exact: true }).click();
    await boton('Bajar Consultron').waitFor();
    assert.equal(await pagina.evaluate(() => localStorage.getItem('cl.consultron')), null, 'borrado, no arranca más al abrir');
    await pagina.evaluate(() => localStorage.removeItem('prueba-gpu'));
  });

  await prueba('consultron en el lector de PDF: lo marcado se pregunta ahí mismo, la fuente abre marcada en su página, y en Modal solo el botón de abajo', async () => {
    await pagina.addInitScript(() => {
      let modo = null;
      try {
        modo = localStorage.getItem('prueba-gpu');
      } catch {
        return;
      }
      if (!modo) return;
      const gpu = modo === 'sin' ? undefined : { requestAdapter: async () => ({ features: new Set(['shader-f16']) }) };
      Object.defineProperty(Navigator.prototype, 'gpu', { configurable: true, get: () => gpu });
    });
    const tamano = pagina.viewportSize();
    await pagina.setViewportSize({ width: 1280, height: 860 });
    // Alone (FLUJOS_SOLO) it starts from the sign-in.
    await ir('materias/1');
    const usuario = pagina.getByLabel('Usuario');
    await Promise.race([usuario.waitFor().catch(() => {}), fila('Apunte uno').waitFor().catch(() => {})]);
    if (await usuario.isVisible()) {
      await usuario.fill('alumno');
      await pagina.getByLabel('Contraseña').fill(CONTRASENA);
      await boton('Entrar').click();
      await pagina.getByRole('heading', { name: 'Hola, Ana' }).waitFor();
    }
    // Consultron on this computer.
    // Without having chosen anything, the bubble down on the right is the way in.
    await pagina.locator('.flotante__boton').waitFor();
    await pagina.evaluate(() => localStorage.setItem('prueba-gpu', 'con'));
    await aLado();
    await ir('consultron');
    const campo = pagina.getByRole('textbox', { name: 'Tu pregunta' });
    await Promise.race([boton('Bajar Consultron').waitFor().catch(() => {}), campo.waitFor().catch(() => {})]);
    if (await boton('Bajar Consultron').isVisible()) {
      await boton('Bajar Consultron').click();
      await pagina.getByRole('dialog').getByRole('button', { name: 'Bajar', exact: true }).click();
    }
    await campo.waitFor({ timeout: 15000 });

    // In the reader, its button opens it beside the pages: the sheet leaves the corner out of reach.
    await ir('materias/1');
    const hoja = pagina.getByRole('dialog');
    await fila('Apunte uno').click();
    await hoja.locator('.lector__pagina[data-pagina="2"] .textLayer span').first().waitFor();
    const alPrincipio = hoja.getByRole('button', { name: 'Ir al principio' });
    if (await alPrincipio.isVisible()) await alPrincipio.click();
    const enVisor = hoja.getByRole('region', { name: 'Consultron' });
    const botonConsultron = hoja.getByRole('button', { name: 'Consultron', exact: true });
    assert.equal(await botonConsultron.getAttribute('aria-pressed'), 'false');

    // What is selected on page 2 goes to it, with «Explicame esto» ready to change and the focus there.
    await hoja.evaluate(() => {
      const span = [...document.querySelectorAll('.lector__pagina[data-pagina="2"] .textLayer span')].find((s) => s.textContent.includes('junta los datos'));
      const t = span.firstChild;
      const r = document.createRange();
      r.setStart(t, t.data.indexOf('Un monitor'));
      r.setEnd(t, t.data.indexOf('junta los datos') + 'junta los datos'.length);
      getSelection().removeAllRanges();
      getSelection().addRange(r);
    });
    const barraSel = hoja.getByRole('toolbar', { name: 'Resaltar lo seleccionado' });
    await barraSel.getByRole('button', { name: 'Preguntar a Consultron' }).click();
    const pregunta = enVisor.getByRole('textbox', { name: 'Tu pregunta' });
    await pregunta.waitFor();
    assert.equal(await botonConsultron.getAttribute('aria-pressed'), 'true');
    assert.equal(await pregunta.inputValue(), 'Explicame esto');
    await pagina.waitForFunction(() => document.activeElement?.matches('.lector__consultron textarea'));
    await enVisor.locator('.consultron__marcado').getByText('Lo que marcaste, página 2').waitFor();
    await enVisor.locator('.consultron__marcado q').getByText('Un monitor junta los datos').waitFor();
    await foto('consultron-visor-marcado');
    await pregunta.press('Enter');
    const respuesta = enVisor.locator('.consultron__entrada[data-estado="listo"]').last();
    await respuesta.getByText('texto que marcó el alumno en Apunte uno, Materia A, pág. 2', { exact: false }).waitFor();
    await respuesta.getByText('Lo que marcaste, página 2').first().waitFor();
    assert.equal(await enVisor.locator('.consultron__marcado').count(), 0, 'lo marcado va con esa pregunta y sale de la caja');
    await enVisor.locator('.consultron__marcado-texto--pregunta').last().getByText('Un monitor junta los datos').waitFor();

    // Its source marks that piece on its page, beside the chat, without leaving the reader.
    await respuesta.getByRole('button', { name: 'Fuente 1, Apunte uno, página 2' }).first().click();
    await hoja.locator('.lector__pagina[data-pagina="2"] .lector__fuente').first().waitFor();
    assert.equal(await hoja.locator('.lector__fuente-borde').count(), 1, 'una línea al costado, no solo color');
    await hoja.getByText('Marcamos lo que usó Consultron en la página 2.').waitFor();
    const marcado = await hoja.evaluate(() => {
      const m = document.querySelector('.lector__fuente').getBoundingClientRect();
      const span = [...document.querySelectorAll('.lector__pagina[data-pagina="2"] .textLayer span')].find((s) => s.textContent.includes('junta los datos')).getBoundingClientRect();
      return Math.abs(m.top - span.top) < span.height;
    });
    assert.ok(marcado, 'la marca va sobre el renglón de la fuente');
    await enVisor.waitFor();
    await pagina.waitForTimeout(400);
    await foto('consultron-visor-fuente');

    // «No lo entendí» after it: what was marked goes again to be told another way, never the same answer twice.
    await pregunta.fill('No lo entendí');
    await pregunta.press('Enter');
    const otraVez = enVisor.locator('.consultron__entrada[data-estado="listo"]').last();
    await otraVez.getByText('De otra forma, sale de texto que marcó el alumno en Apunte uno, Materia A, pág. 2', { exact: false }).waitFor();
    assert.equal(await otraVez.getByText('Y nada más').count(), 0, 'no repite la respuesta de antes');

    // Anything else, also without marking: it reads this PDF alone, never the rest of the notes nor what it knows.
    await pagina.evaluate(() => {
      window.piezasDelVisor = [];
      const mandar = Worker.prototype.postMessage;
      Worker.prototype.postMessage = function (m, ...resto) {
        if (m?.tipo === 'preguntar') window.piezasDelVisor.push(m.mensajes.at(-1).content);
        return mandar.call(this, m, ...resto);
      };
    });
    await pregunta.fill('¿De qué se trata este archivo?');
    await pregunta.press('Enter');
    const delArchivo = enVisor.locator('.consultron__entrada').filter({ hasText: '¿De qué se trata este archivo?' });
    await enVisor.locator('.consultron__entrada:is([data-estado="listo"], [data-estado="no-esta"])').filter({ hasText: '¿De qué se trata este archivo?' }).waitFor();
    const piezas = await pagina.evaluate(() => window.piezasDelVisor.at(-1));
    assert.match(piezas, /Apunte uno/, 'las piezas salen del PDF abierto');
    assert.ok(!/Apunte dos|Materia B/.test(piezas), 'nada de otros archivos');
    await delArchivo.getByRole('button', { name: /Fuente 1, Apunte uno/ }).first().waitFor();
    assert.equal(await delArchivo.getByText('Esto es lo que sé en general').count(), 0, 'nada en general al lado de un archivo');

    // Esc inside closes it, and the focus goes back to its button. The next one takes the mark away. The marked text was
    // only in memory.
    await pregunta.focus();
    await pagina.keyboard.press('Escape');
    await enVisor.waitFor({ state: 'detached' });
    await pagina.waitForFunction(() => document.activeElement?.getAttribute('title') === 'Consultron');
    await pagina.keyboard.press('Escape');
    await hoja.locator('.lector__fuente').waitFor({ state: 'detached' });
    const disco = await pagina.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
    assert.ok(!/junta los datos|Explicame esto/.test(disco), 'lo marcado y la charla quedan en memoria');

    // From the corner, the source opens the PDF with its piece marked.
    await boton('Cerrar').click();
    await hoja.waitFor({ state: 'detached' });
    await boton('Consultron, listo').click();
    const rincon = pagina.getByRole('dialog', { name: 'Consultron' });
    const escribir = rincon.getByRole('textbox', { name: 'Tu pregunta' });
    await escribir.fill('¿Qué es un monitor?');
    await escribir.press('Enter');
    await pagina.waitForFunction(() => document.querySelector('.flotante article.consultron__entrada:last-of-type')?.dataset.estado === 'listo');
    await rincon.locator('article.consultron__entrada').last().getByRole('button', { name: 'Fuente 1, Apunte uno, página 2' }).first().click();
    const otra = pagina.locator('dialog.previa');
    await otra.locator('.lector__pagina[data-pagina="2"] .lector__fuente').first().waitFor();
    await pagina.waitForFunction(() => document.querySelector('.lector__ir-campo').value === '2');
    await boton('Cerrar').click();
    await otra.waitFor({ state: 'detached' });
    await pagina.keyboard.press('Escape');

    // «Aparición: Modal» in Configuración: its button down on the right is its only way in, also in the reader, where it
    // opens the box there and not beside the pages.
    await ir('configuracion');
    await pagina.getByRole('radio', { name: /^Modal/ }).check();
    await ir('materias/1');
    await fila('Apunte uno').click();
    await hoja.locator('.lector__pagina[data-pagina="1"] .textLayer span').first().waitFor();
    assert.equal(await hoja.locator('.lector__boton--consultron').count(), 0, 'nada en la barra del lector');
    const abajo = hoja.getByRole('button', { name: 'Consultron', exact: true });
    assert.equal(await abajo.count(), 1, 'solo el botón de abajo');
    assert.ok(await abajo.evaluate((b) => b.matches('.flotante__boton')));
    await abajo.click();
    const caja = hoja.locator('.lector__consultron--caja');
    await caja.getByRole('textbox', { name: 'Tu pregunta' }).waitFor();
    assert.equal(await hoja.locator('.lector[data-consultron="caja"]').count(), 1);
    await pagina.waitForTimeout(300);
    await foto('consultron-visor-modal');
    await pagina.keyboard.press('Escape');
    await caja.waitFor({ state: 'detached' });
    await pagina.waitForFunction(() => document.activeElement?.matches('.flotante__boton'));
    await boton('Cerrar').click();
    await hoja.waitFor({ state: 'detached' });
    // The closed reader leaves the role at once but stays while it closes, with its own button inside.
    await pagina.locator('dialog.previa').waitFor({ state: 'detached' });
    assert.equal(await pagina.locator('.flotante__boton').count(), 1);
    await pagina.locator('.flotante__boton').click();
    await pagina.getByRole('dialog', { name: 'Consultron' }).getByRole('textbox', { name: 'Tu pregunta' }).waitFor();
    await pagina.getByRole('button', { name: 'Cerrar Consultron' }).click();
    await ir('configuracion');
    await pagina.getByRole('radio', { name: /^Lateral/ }).check();
    await ir('materias/1');

    // At 390 there's no Consultron: the reader is as it was.
    await pagina.setViewportSize({ width: 390, height: 844 });
    await fila('Apunte uno').click();
    await hoja.locator('.lector__pagina[data-pagina="1"] .textLayer span').first().waitFor();
    assert.equal(await hoja.getByRole('button', { name: 'Consultron', exact: true }).count(), 0);
    await foto('consultron-visor-390');
    await boton('Cerrar').click();
    await hoja.waitFor({ state: 'detached' });

    await pagina.setViewportSize(tamano);
    await pagina.evaluate(async () => {
      localStorage.removeItem('prueba-gpu');
      localStorage.removeItem('cl.consultron');
      await caches.delete('prueba-consultron');
      await caches.delete('webllm/model');
    });
  });

  await prueba('consultron en un resumen de El Santo Resumen: al lado del resumen, que es su primera fuente', async () => {
    await pagina.addInitScript(() => {
      let modo = null;
      try {
        modo = localStorage.getItem('prueba-gpu');
      } catch {
        return;
      }
      if (!modo) return;
      const gpu = modo === 'sin' ? undefined : { requestAdapter: async () => ({ features: new Set(['shader-f16']) }) };
      Object.defineProperty(Navigator.prototype, 'gpu', { configurable: true, get: () => gpu });
    });
    const tamano = pagina.viewportSize();
    await pagina.setViewportSize({ width: 1280, height: 860 });
    SANTO_TEXTOS.push({ id: SANTO_BANCO[1].id, texto: 'Semáforos y monitores. Un semáforo cuenta los permisos que quedan para entrar a la sección crítica.' });
    try {
      // Alone (FLUJOS_SOLO) it starts from the sign-in.
      await ir('resumenes');
      const usuario = pagina.getByLabel('Usuario');
      const banco = pagina.getByRole('region', { name: 'Banco de resúmenes' });
      await Promise.race([usuario.waitFor().catch(() => {}), banco.waitFor().catch(() => {})]);
      if (await usuario.isVisible()) {
        await usuario.fill('alumno');
        await pagina.getByLabel('Contraseña').fill(CONTRASENA);
        await boton('Entrar').click();
        await pagina.getByRole('heading', { name: 'Hola, Ana' }).waitFor();
      }
      await pagina.evaluate(() => localStorage.setItem('prueba-gpu', 'con'));
      await aLado();
      await ir('consultron');
      const campo = pagina.getByRole('textbox', { name: 'Tu pregunta' });
      await Promise.race([boton('Bajar Consultron').waitFor().catch(() => {}), campo.waitFor().catch(() => {})]);
      if (await boton('Bajar Consultron').isVisible()) {
        await boton('Bajar Consultron').click();
        await pagina.getByRole('dialog').getByRole('button', { name: 'Bajar', exact: true }).click();
      }
      await campo.waitFor({ timeout: 15000 });

      // In the sheet of a summary the corner is out of reach: its own button opens Consultron beside it.
      await ir('resumenes');
      await banco.getByRole('button', { name: 'Final con teoría', exact: true }).click();
      const visor = pagina.locator('dialog.visor');
      await pagina.frameLocator('dialog.visor iframe').getByRole('heading', { name: 'Semáforos y monitores' }).waitFor();
      const botonConsultron = visor.getByRole('button', { name: 'Consultron', exact: true });
      assert.equal(await botonConsultron.getAttribute('aria-pressed'), 'false');
      await botonConsultron.click();
      const panel = visor.getByRole('region', { name: 'Consultron' });
      const pregunta = panel.getByRole('textbox', { name: 'Tu pregunta' });
      await pregunta.waitFor();
      assert.equal(await botonConsultron.getAttribute('aria-pressed'), 'true');
      await pregunta.fill('¿Qué cuenta un semáforo?');
      await pregunta.press('Enter');
      const respuesta = panel.locator('.consultron__entrada[data-estado="listo"]').last();
      await respuesta.getByText('resumen «Final con teoría» de El Santo Resumen', { exact: false }).waitFor();
      await respuesta.getByText('la que tiene abierta', { exact: false }).waitFor();
      // Its source is the summary already open: nothing to open again.
      assert.equal(await respuesta.locator('button.consultron__cita').count(), 0);
      const lado = await pagina.evaluate(() => {
        const c = document.querySelector('dialog.visor .visor__cuerpo').getBoundingClientRect();
        const p = document.querySelector('dialog.visor .lector__consultron').getBoundingClientRect();
        return c.right <= p.left + 1 && p.right <= window.innerWidth + 1;
      });
      assert.ok(lado, 'al lado del resumen, sin taparlo');
      await pagina.screenshot({ path: path.join(CAPTURAS, 'consultron-resumen.png') });
      // Esc in Consultron closes it, not the summary.
      await pregunta.focus();
      await pagina.keyboard.press('Escape');
      await panel.waitFor({ state: 'detached' });
      assert.equal(await visor.count(), 1, 'el resumen sigue abierto');
      await pagina.waitForFunction(() => document.activeElement?.matches('.visor__consultron'));
      // What is selected in the summary goes to Consultron beside it, marked, as from a PDF. Its frame runs nothing.
      await visor.locator('iframe.visor__marco').evaluate((m) => {
        const r = m.contentDocument.createRange();
        r.selectNodeContents(m.contentDocument.querySelector('h1, h2'));
        const sel = m.contentWindow.getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
      });
      await visor.getByRole('toolbar', { name: 'Preguntar sobre lo seleccionado' }).getByRole('button', { name: 'Preguntar a Consultron' }).click();
      await panel.locator('.consultron__marcado-donde').getByText('Lo que marcaste', { exact: true }).waitFor();
      await panel.locator('.consultron__marcado q').getByText('Semáforos y monitores').waitFor();
      await pagina.waitForFunction(() => document.activeElement?.matches('.lector__consultron textarea'));
      assert.equal(await visor.locator('.lector__barra-sel').count(), 0, 'la barra se va al preguntar');
      await pagina.screenshot({ path: path.join(CAPTURAS, 'consultron-resumen-marcado.png') });
      await visor.getByRole('button', { name: 'Cerrar', exact: true }).click();
      await visor.waitFor({ state: 'detached' });

      // One with its scripts on: its reader (another origin) says what is selected, and is asked to clear it.
      SANTO_BANCO[1].js = true;
      await ir('resumenes');
      await banco.getByRole('button', { name: 'Final con teoría', exact: true }).click();
      await pagina.frameLocator('dialog.visor iframe.visor__marco--scripts').frameLocator('#m').getByText('Armado por sus scripts').waitFor();
      const lector = pagina.frames().find((f) => f.url() === 'https://demo.lutastudios.com/visor/');
      const barraLector = visor.getByRole('toolbar', { name: 'Preguntar sobre lo seleccionado' });
      // Whatever does not have the shape is nothing: no bar.
      await lector.evaluate(() => parent.postMessage({ tipo: 'visor-seleccion', texto: 'Semáforos', cajas: [[0, 0, 'x', 9], [0, 0, 9, 9]] }, '*'));
      await pagina.waitForTimeout(200);
      assert.equal(await barraLector.count(), 0, 'sin cajas válidas no hay barra');
      await lector.evaluate(() => parent.postMessage({ tipo: 'visor-seleccion', texto: ' Un semáforo\n cuenta permisos ', cajas: [[40, 120, 400, 140], [40, 150, 220, 170]] }, '*'));
      await barraLector.getByRole('button', { name: 'Preguntar a Consultron' }).click();
      const panelLector = visor.getByRole('region', { name: 'Consultron' });
      await panelLector.locator('.consultron__marcado-donde').getByText('Lo que marcaste', { exact: true }).waitFor();
      await panelLector.locator('.consultron__marcado q').getByText('Un semáforo cuenta permisos').waitFor();
      assert.equal(await barraLector.count(), 0, 'la barra se va al preguntar');
      assert.equal(await lector.evaluate(() => document.body.dataset.soltado), 'si', 'le pide al lector que suelte lo marcado');
      await visor.getByRole('button', { name: 'Cerrar', exact: true }).click();
      await visor.waitFor({ state: 'detached' });
    } finally {
      SANTO_BANCO[1].js = false;
      SANTO_TEXTOS.length = 0;
      await pagina.setViewportSize(tamano);
      await pagina.evaluate(async () => {
        localStorage.removeItem('prueba-gpu');
        localStorage.removeItem('cl.consultron');
        await caches.delete('prueba-consultron');
        await caches.delete('webllm/model');
      });
    }
  });

  await prueba('consultron con gemini primero: con placa de video, sin bajar el modelo y con el modelo listo, y si está apagado lo ofrece', async () => {
    await pagina.addInitScript(() => {
      let modo = null;
      try {
        modo = localStorage.getItem('prueba-gpu');
      } catch {
        return;
      }
      if (!modo) return;
      const gpu = modo === 'sin' ? undefined : { requestAdapter: async () => ({ features: new Set(['shader-f16']) }) };
      Object.defineProperty(Navigator.prototype, 'gpu', { configurable: true, get: () => gpu });
    });
    const NUBE = 'https://spltnoksgdkbaamskuau.supabase.co/functions/v1/supercvg-consultron';
    const aLaNube = [];
    // What the function answers: 'bien', 'ocupado' (Google busy) or 'tope' (their 15 of the day).
    let responde = 'bien';
    await pagina.route(NUBE, async (r) => {
      aLaNube.push(JSON.parse(r.request().postData()));
      const [status, cuerpo] = responde === 'ocupado'
        ? [503, { ok: false, motivo: 'ocupado' }]
        : responde === 'tope'
          ? [429, { ok: false, motivo: 'tope_alumno', quedan: 0 }]
          : [200, { ok: true, texto: 'Un semáforo cuenta los permisos que quedan [1].', quedan: 14 }];
      await r.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(cuerpo) });
    });
    // What goes to the model of the computer, again after each page load.
    const escuchar = () => pagina.evaluate(() => {
      window.alModelo = [];
      if (window.__escuchaCompu) return;
      window.__escuchaCompu = true;
      const mandar = Worker.prototype.postMessage;
      Worker.prototype.postMessage = function (m, ...resto) {
        if (m?.tipo === 'preguntar') window.alModelo.push(m.mensajes.at(-1).content);
        return mandar.call(this, m, ...resto);
      };
    });
    const alModelo = () => pagina.evaluate(() => window.alModelo.length);
    // Still, and without accessibility failures, before each picture.
    const revisada = async (que) => {
      await pagina.evaluate(AXE);
      const fallas = await pagina.evaluate(async () => { await Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))); return (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })).violations.map((v) => `${v.id}: ${v.nodes[0].target}`); });
      assert.deepEqual(fallas, [], que);
    };
    const tamano = pagina.viewportSize();
    SANTO_TEXTOS.push({ id: SANTO_BANCO[1].id, texto: 'Semáforos y monitores. Un semáforo cuenta los permisos que quedan para entrar a la sección crítica.' });
    try {
      // Alone (FLUJOS_SOLO) it starts from the sign-in.
      await ir('resumenes');
      const usuario = pagina.getByLabel('Usuario');
      const banco = pagina.getByRole('region', { name: 'Banco de resúmenes' });
      await Promise.race([usuario.waitFor().catch(() => {}), banco.waitFor().catch(() => {})]);
      if (await usuario.isVisible()) {
        await usuario.fill('alumno');
        await pagina.getByLabel('Contraseña').fill(CONTRASENA);
        await boton('Entrar').click();
        await pagina.getByRole('heading', { name: 'Hola, Ana' }).waitFor();
      }
      // A computer with a video card, the model not downloaded and Gemini off: as Ignacio found it.
      await pagina.evaluate(async () => {
        localStorage.removeItem('cl.consultron');
        localStorage.removeItem('cl.consultron.gemini');
        localStorage.setItem('prueba-gpu', 'con');
        await caches.delete('prueba-consultron');
        await caches.delete('webllm/model');
      });

      // In its screen, beside the download, the offer of each permission. Nothing turns on by itself.
      for (const ancho of [390, 1920]) {
        await pagina.setViewportSize(ancho === 390 ? { width: 390, height: 844 } : { width: 1920, height: 1080 });
        await ir('consultron');
        await boton('Bajar Consultron').waitFor();
        await boton('Usar Gemini con los resúmenes').waitFor();
        await boton('Usar Gemini con tu carrera').waitFor();
        assert.equal(await pagina.getByRole('textbox', { name: 'Tu pregunta' }).count(), 0, 'nada se prende solo');
        await revisada(`la oferta en ${ancho}`);
        await fin(`consultron-gemini-oferta-${ancho}`);
      }
      assert.equal(aLaNube.length, 0, 'mostrarlo no le pregunta nada a Google');

      // Beside a summary: only the summaries' permission, with what goes to Google.
      await ir('resumenes');
      await banco.getByRole('button', { name: 'Final con teoría', exact: true }).click();
      const visor = pagina.locator('dialog.visor');
      await pagina.frameLocator('dialog.visor iframe').getByRole('heading', { name: 'Semáforos y monitores' }).waitFor();
      await visor.getByRole('button', { name: 'Consultron', exact: true }).click();
      const panel = visor.getByRole('region', { name: 'Consultron', exact: true });
      const usar = panel.getByRole('button', { name: 'Usar Gemini con los resúmenes' });
      await usar.waitFor();
      await panel.getByRole('button', { name: 'Bajar Consultron' }).waitFor();
      assert.equal(await panel.getByRole('button', { name: 'Usar Gemini con tu carrera' }).count(), 0, 'al lado de un resumen, solo el de los resúmenes');
      assert.match(await panel.innerText(), /Tu pregunta y lo que hace falta del resumen van a Google, que puede usarlos para mejorar sus productos\./, 'dice qué va a Google');
      await revisada('la oferta al lado de un resumen');
      await pagina.screenshot({ path: path.join(CAPTURAS, 'consultron-gemini-oferta-resumen-1920.png') });

      // On: Gemini answers at once, without downloading anything.
      await usar.click();
      const pregunta = panel.getByRole('textbox', { name: 'Tu pregunta' });
      await pregunta.waitFor();
      await panel.getByText('Contesta Gemini. Si no puede, contesta Consultron en tu compu, si lo bajás.').waitFor();
      await escuchar();
      const preguntar = async () => {
        const antes = await panel.locator('.consultron__entrada').count();
        await pregunta.fill('¿Qué cuenta un semáforo?');
        await pregunta.press('Enter');
        const ultima = panel.locator('.consultron__entrada').nth(antes);
        await ultima.and(panel.locator('.consultron__entrada:is([data-estado="listo"], [data-estado="no-esta"])')).waitFor({ timeout: 30000 });
        return ultima.innerText();
      };
      assert.match(await preguntar(), /Un semáforo cuenta los permisos que quedan[\s\S]*Contestó Gemini, de Google\./, 'contesta Gemini');
      assert.equal(aLaNube.length, 1, 'sin bajar nada, a Gemini');
      assert.match(JSON.stringify(aLaNube[0]), /Un semáforo cuenta los permisos/, 'con el resumen');
      await revisada('Gemini sin el modelo');
      await pagina.screenshot({ path: path.join(CAPTURAS, 'consultron-gemini-sin-bajar-1920.png') });

      // Google busy and no model: why, short.
      responde = 'ocupado';
      assert.match(await preguntar(), /Gemini no contestó\. Probá de nuevo en un rato\./, 'dice por qué');
      assert.equal(await alModelo(), 0, 'sin modelo, nada a la compu');

      // The model downloaded and ready: Gemini still first.
      responde = 'bien';
      await panel.getByRole('button', { name: 'Bajar Consultron' }).click();
      await pagina.getByRole('dialog').getByRole('button', { name: 'Bajar', exact: true }).click();
      await panel.locator('.consultron__con-nube').waitFor({ state: 'detached', timeout: 30000 });
      assert.match(await preguntar(), /Contestó Gemini, de Google\./, 'con el modelo listo, Gemini primero');
      assert.equal(aLaNube.length, 3, 'a Gemini');
      assert.equal(await alModelo(), 0, 'el modelo no la contestó');

      // Google busy: the model of the computer, and it says so.
      responde = 'ocupado';
      assert.match(await preguntar(), /Gemini tardó demasiado\. Contestó Consultron en tu compu\./, 'contesta la compu');
      assert.equal(aLaNube.length, 4, 'primero lo intentó Gemini');
      assert.equal(await alModelo(), 1, 'la contestó la compu');

      // Their 15 of the day: the model, and it says why.
      responde = 'tope';
      assert.match(await preguntar(), /Por hoy no te quedan preguntas con Gemini\. Contestó Consultron en tu compu\./, 'sin preguntas de Gemini, la compu');
      assert.equal(await alModelo(), 2, 'la contestó la compu');
      await preguntar();
      assert.equal(aLaNube.length, 5, 'sin preguntas hoy, ni lo intenta');
      assert.equal(await alModelo(), 3, 'la compu');
      await visor.getByRole('button', { name: 'Cerrar', exact: true }).click();
      await visor.waitFor({ state: 'detached' });

      // Off with the model ready: beside a summary, the offer in the empty talk.
      await pagina.evaluate(() => localStorage.removeItem('cl.consultron.gemini'));
      await ir('resumenes');
      await banco.getByRole('button', { name: 'Final con teoría', exact: true }).click();
      await pagina.frameLocator('dialog.visor iframe').getByRole('heading', { name: 'Semáforos y monitores' }).waitFor();
      await visor.getByRole('button', { name: 'Consultron', exact: true }).click();
      await pregunta.waitFor({ timeout: 30000 });
      await usar.waitFor();
      await revisada('la oferta con el modelo listo');
      await pagina.screenshot({ path: path.join(CAPTURAS, 'consultron-gemini-oferta-modelo-listo-1920.png') });
      await usar.click();
      await usar.waitFor({ state: 'detached' });
      assert.equal(await pagina.evaluate(() => JSON.parse(localStorage.getItem('cl.consultron.gemini')).resumenes), true, 'el botón prende el permiso');
      await visor.getByRole('button', { name: 'Cerrar', exact: true }).click();
      await visor.waitFor({ state: 'detached' });

      // In the corner, with the model gone and the summaries' permission on: it asks at once, and says what Gemini takes.
      await pagina.evaluate(async () => {
        localStorage.removeItem('cl.consultron');
        await caches.delete('prueba-consultron');
        await caches.delete('webllm/model');
      });
      await ir('');
      await pagina.locator('.flotante__boton').click();
      const rincon = pagina.locator('#consultron-panel');
      await rincon.getByRole('textbox', { name: 'Tu pregunta' }).waitFor();
      await rincon.getByText('Gemini contesta sobre los resúmenes. Para lo demás, bajá Consultron.').waitFor();
      await rincon.getByRole('button', { name: 'Bajar Consultron' }).waitFor();
      await revisada('el rincón con Gemini y sin el modelo');
      await pagina.screenshot({ path: path.join(CAPTURAS, 'consultron-gemini-rincon-1920.png') });
      await rincon.getByRole('button', { name: 'Cerrar Consultron' }).click();

    } finally {
      SANTO_TEXTOS.length = 0;
      await pagina.unroute(NUBE);
      await pagina.setViewportSize(tamano);
      await pagina.evaluate(async () => {
        localStorage.removeItem('prueba-gpu');
        localStorage.removeItem('cl.consultron');
        localStorage.removeItem('cl.consultron.gemini');
        await caches.delete('prueba-consultron');
        await caches.delete('webllm/model');
      });
    }
  });

  await prueba('consultron y tu carrera: en Tu carrera y desde Hoy, solo lo que la pregunta necesita, y el día que nombrás ya elegido', async () => {
    await pagina.addInitScript(() => {
      let modo = null;
      try {
        modo = localStorage.getItem('prueba-gpu');
      } catch {
        return;
      }
      if (!modo) return;
      const gpu = modo === 'sin' ? undefined : { requestAdapter: async () => ({ features: new Set(['shader-f16']) }) };
      Object.defineProperty(Navigator.prototype, 'gpu', { configurable: true, get: () => gpu });
    });
    // Alone (FLUJOS_SOLO) it starts from the sign-in and downloads the (test) model.
    await ir('');
    const usuario = pagina.getByLabel('Usuario');
    const hola = pagina.getByRole('heading', { name: 'Hola, Ana' });
    await Promise.race([usuario.waitFor().catch(() => {}), hola.waitFor().catch(() => {})]);
    if (await usuario.isVisible()) {
      await usuario.fill('alumno');
      await pagina.getByLabel('Contraseña').fill(CONTRASENA);
      await boton('Entrar').click();
      await hola.waitFor();
    }
    await pagina.evaluate(() => localStorage.setItem('prueba-gpu', 'con'));
    await ir('consultron');
    const campoGrande = pagina.getByRole('textbox', { name: 'Tu pregunta' });
    await Promise.race([boton('Bajar Consultron').waitFor().catch(() => {}), campoGrande.waitFor().catch(() => {})]);
    if (await boton('Bajar Consultron').isVisible()) {
      await boton('Bajar Consultron').click();
      await pagina.getByRole('dialog').getByRole('button', { name: 'Bajar', exact: true }).click();
    }
    await campoGrande.waitFor({ timeout: 15000 });
    // What goes to the model, from the corner's Consultron over the screen.
    const escuchar = () => pagina.evaluate(() => {
      window.pedidosConsultron = [];
      if (window.__escuchaConsultron) return;
      window.__escuchaConsultron = true;
      const mandar = Worker.prototype.postMessage;
      Worker.prototype.postMessage = function (m, ...resto) {
        if (m?.tipo === 'preguntar') {
          window.pedidosConsultron?.push(m.mensajes.at(-1).content);
          (window.mensajesConsultron ??= []).push(m.mensajes.length);
        }
        return mandar.call(this, m, ...resto);
      };
    });
    const preguntar = async (texto) => {
      await pagina.locator('.flotante__boton').click();
      const panel = pagina.locator('#consultron-panel');
      const campo = panel.getByRole('textbox', { name: 'Tu pregunta' });
      await campo.waitFor();
      const antes = await pagina.evaluate(() => window.pedidosConsultron.length);
      await campo.fill(texto);
      await campo.press('Enter');
      await pagina.waitForFunction((n) => window.pedidosConsultron.length > n, antes);
      await panel.locator('.consultron__entrada[data-estado="listo"]').filter({ hasText: texto }).waitFor();
      const alModelo = await pagina.evaluate(() => window.pedidosConsultron.at(-1));
      await panel.getByRole('button', { name: 'Cerrar Consultron' }).click();
      await panel.waitFor({ state: 'detached' });
      return alModelo;
    };

    // Sysacad Lindo answering the tabs in the same window, as in Tu carrera's own test. Again after each page load.
    const extension = () => pagina.evaluate((c) => {
      window.addEventListener('message', (e) => {
        if (e.source !== window || e.data?.fuente !== 'super-cvg') return;
        if (e.data.pide === 'sysacad') window.postMessage({ fuente: 'sysacad-lindo', para: 'super-cvg', v: 1, vinculada: true }, window.location.origin);
        if (e.data.pide === 'pestanas') window.postMessage({ fuente: 'sysacad-lindo', para: 'super-cvg', v: 2, tipo: 'pestanas', ...c }, window.location.origin);
      });
      document.dispatchEvent(new Event('visibilitychange'));
    }, { vinculada: true, guarda: true, alumno: 'GOMEZ, Ana María', pestanas: mensajeDeEjemplo().pestanas });
    await ir('carrera');
    await extension();
    await pagina.getByRole('heading', { name: '12 de 34 materias aprobadas' }).waitFor();
    await escuchar();

    // A question about the term goes with the map, not with the calendar: the part it asks for, not all of it (a small
    // model mixes up the sections).
    const general = await preguntar('¿Qué puedo cursar el año que viene?');
    assert.match(general, /Tu carrera, de lo que el alumno abrió de Sysacad/, 'la carrera llega al modelo');
    assert.match(general, /Podés cursar: [^\n]*Legislación \(4\.º año\)/, 'lo que puede cursar');
    assert.doesNotMatch(general, /- Aprobadas:/, 'solo lo que pide');

    // With a subject open, that one too.
    await pagina.locator('.carrera-ficha', { has: pagina.locator('.carrera-ficha__nombre', { hasText: /^Redes de Datos$/ }) }).click();
    const abierta = await preguntar('¿Qué me falta para esta?');
    assert.match(abierta, /- Para cursar Redes de Datos te falta regularizar Comunicación de Datos\./, 'la materia abierta');

    // From Hoy, as Ignacio asked it: the career from the copies, with the subject named, never what it knows in general.
    await ir('');
    await extension();
    await escuchar();
    const desdeHoy = await preguntar('que necesito para cursas gestion gerencial');
    assert.match(desdeHoy, /- Para cursar Gestión Gerencial te falta regularizar Legislación, regularizar Administración de Sistemas de Información\./, 'la materia que nombró');
    assert.match(await preguntar('Que nota me saque en analisis matematico 1?'), /- Análisis Matemático I ya la aprobaste, con 8\./, 'su nota');
    // A day named: that day alone, already picked, and without the talk before.
    const viernes = await preguntar('Y para el viernes?');
    assert.match(viernes, /(Lo que tiene el|El) viernes, \d+ de \p{L}+/u, 'el viernes ya elegido');
    assert.equal(await pagina.evaluate(() => window.mensajesConsultron.at(-1)), 2, 'sin la charla de antes');
  });

  await prueba('consultron con gemini: cada permiso con su aviso, su carrera va a la función y sus apuntes se quedan en la compu', async () => {
    const NUBE = 'https://spltnoksgdkbaamskuau.supabase.co/functions/v1/supercvg-consultron';
    const aLaNube = [];
    let googleTarda = false;
    await pagina.route(NUBE, async (r) => {
      aLaNube.push(JSON.parse(r.request().postData()));
      if (googleTarda) return r.fulfill({ status: 503, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ ok: false, motivo: 'ocupado' }) });
      await r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ ok: true, texto: 'Para cursar Legislación no te falta nada [1].', quedan: 14 }) });
    });

    // The permission: off by default, and on only after saying what goes to Google.
    await ir('consultron');
    await pagina.evaluate(() => {
      window.alModelo = [];
      if (window.__escuchaGemini) return;
      window.__escuchaGemini = true;
      const mandar = Worker.prototype.postMessage;
      Worker.prototype.postMessage = function (m, ...resto) {
        if (m?.tipo === 'preguntar') window.alModelo?.push(m.mensajes.at(-1).content);
        return mandar.call(this, m, ...resto);
      };
    });
    const carrera = pagina.getByRole('switch', { name: 'Usar Gemini con tu carrera' });
    const resumenes = pagina.getByRole('switch', { name: 'Usar Gemini con los resúmenes' });
    await carrera.waitFor();
    assert.equal(await carrera.isChecked(), false, 'apagado de entrada');
    assert.equal(await resumenes.isChecked(), false, 'el de los resúmenes también');
    await carrera.click();
    const aviso = pagina.getByRole('dialog');
    await aviso.getByText('¿Usar Gemini con tu carrera?').waitFor();
    await fin('consultron-gemini-aviso');
    assert.match(await aviso.innerText(), /van a Google\. Google puede usarlos para mejorar sus productos/, 'dice qué va a Google');
    await aviso.getByRole('button', { name: 'Volver' }).click();
    assert.equal(await carrera.isChecked(), false, 'Volver no lo prende');
    await carrera.click();
    await aviso.getByRole('button', { name: 'Usar Gemini' }).click();
    await pagina.waitForFunction(() => document.querySelector('[role="switch"][aria-describedby="consultron-gemini-carrera-ayuda"]')?.checked);

    // A question about their career: to the function, with the career and nothing else, and it says Gemini answered.
    await pagina.evaluate((c) => {
      window.addEventListener('message', (e) => {
        if (e.source !== window || e.data?.fuente !== 'super-cvg') return;
        if (e.data.pide === 'sysacad') window.postMessage({ fuente: 'sysacad-lindo', para: 'super-cvg', v: 1, vinculada: true }, window.location.origin);
        if (e.data.pide === 'pestanas') window.postMessage({ fuente: 'sysacad-lindo', para: 'super-cvg', v: 2, tipo: 'pestanas', ...c }, window.location.origin);
      });
      document.dispatchEvent(new Event('visibilitychange'));
    }, { vinculada: true, guarda: true, alumno: 'GOMEZ, Ana María', pestanas: mensajeDeEjemplo().pestanas });
    const campo = pagina.getByRole('textbox', { name: 'Tu pregunta' });
    await campo.fill('Que necesito para cursar legislacion?');
    // Gemini's answer comes whole, and it's written a few words at a time.
    const aMedias = pagina.waitForFunction(() => {
      const e = document.querySelector('.consultron__entrada[data-estado="escribiendo"]');
      return e && !e.innerText.includes('Contestó Gemini') ? e.innerText : false;
    }, null, { polling: 'raf', timeout: 30000 });
    await campo.press('Enter');
    const respuesta = pagina.locator('.consultron__entrada[data-estado="listo"]').filter({ hasText: 'Contestó Gemini, de Google.' });
    const parcial = await (await aMedias).jsonValue();
    await respuesta.waitFor();
    assert.ok((await respuesta.innerText()).length > parcial.length, 'se escribe de a poco, no de golpe');
    assert.match(await respuesta.innerText(), /Para cursar Legislación no te falta nada/, 'la respuesta de Gemini');
    await respuesta.screenshot({ path: path.join(CAPTURAS, 'consultron-gemini-respuesta.png') });
    await pagina.locator('.consultron__pie').screenshot({ path: path.join(CAPTURAS, 'consultron-gemini-permisos.png') });
    assert.equal(aLaNube.length, 1, 'una pregunta a la función');
    const [pedido] = aLaNube;
    assert.deepEqual(Object.keys(pedido).sort(), ['dispositivo', 'mensajes'], 'solo el número del navegador y los mensajes');
    assert.match(pedido.mensajes.at(-1).texto, /Tu carrera, de lo que el alumno abrió de Sysacad/, 'con su carrera');
    assert.equal(await pagina.evaluate(() => window.alModelo.length), 0, 'el modelo de la compu no la contestó');

    // Google too slow: the computer answers, and the screen says so.
    googleTarda = true;
    await campo.fill('Que necesito para cursar legislacion?');
    await campo.press('Enter');
    await pagina.locator('.consultron__entrada[data-estado="listo"]').filter({ hasText: 'Gemini tardó demasiado. Contestó Consultron en tu compu.' }).waitFor();
    assert.equal(aLaNube.length, 2, 'se la pidió a Gemini');
    assert.equal(await pagina.evaluate(() => window.alModelo.length), 1, 'la contestó la compu');
    googleTarda = false;

    // A question about their notes stays on the computer, even with the permission on.
    await campo.fill('¿Qué es un semáforo?');
    await campo.press('Enter');
    await pagina.waitForFunction(() => window.alModelo.length > 1);
    assert.equal(aLaNube.length, 2, 'sus apuntes no van a Gemini');

    // A computer that can't run Consultron: with the permission on, Gemini answers their career; the rest says it can't.
    await pagina.evaluate(() => localStorage.setItem('prueba-gpu', 'sin'));
    await ir('consultron');
    await pagina.getByText('Este navegador no puede usar la placa de video.', { exact: false }).waitFor();
    await pagina.getByText('Gemini, de Google, puede contestar igual sobre los resúmenes de El Santo Resumen y tu carrera.').waitFor();
    assert.equal(await carrera.isChecked(), true, 'el permiso sigue prendido');
    assert.equal(await boton('Bajar Consultron').count(), 0, 'nada para bajar');
    assert.equal(await pagina.locator('.consultron__practicar').count(), 0, 'practicar necesita el modelo');
    await pagina.evaluate((c) => {
      window.addEventListener('message', (e) => {
        if (e.source !== window || e.data?.fuente !== 'super-cvg') return;
        if (e.data.pide === 'sysacad') window.postMessage({ fuente: 'sysacad-lindo', para: 'super-cvg', v: 1, vinculada: true }, window.location.origin);
        if (e.data.pide === 'pestanas') window.postMessage({ fuente: 'sysacad-lindo', para: 'super-cvg', v: 2, tipo: 'pestanas', ...c }, window.location.origin);
      });
      document.dispatchEvent(new Event('visibilitychange'));
    }, { vinculada: true, guarda: true, alumno: 'GOMEZ, Ana María', pestanas: mensajeDeEjemplo().pestanas });
    await campo.fill('Que necesito para cursar legislacion?');
    await campo.press('Enter');
    await pagina.locator('.consultron__entrada[data-estado="listo"]').filter({ hasText: 'Contestó Gemini, de Google.' }).waitFor();
    assert.equal(aLaNube.length, 3, 'sin placa de video, su carrera va a Gemini');
    await campo.fill('¿Qué es un semáforo?');
    await campo.press('Enter');
    await pagina.locator('.consultron__entrada[data-estado="no-esta"]').filter({ hasText: 'Esta compu no puede correr Consultron.' }).waitFor();
    assert.equal(aLaNube.length, 3, 'sus apuntes tampoco van a Gemini');
    await fin('consultron-gemini-sin-compu');

    // A summary in PDF: what is marked in it goes to Gemini with the summaries' permission.
    await resumenes.click();
    await aviso.getByRole('button', { name: 'Usar Gemini' }).click();
    for (let i = 0; i < 40 && !(await resumenes.isChecked()); i++) await pagina.waitForTimeout(50);
    assert.equal(await resumenes.isChecked(), true, 'el de los resúmenes prendido');
    santoPdfConTexto = true;
    try {
      await ir('resumenes');
      await pagina.getByRole('region', { name: 'Banco de resúmenes' }).getByRole('button', { name: 'Resumen del 1° parcial', exact: true }).click();
      const visor = pagina.locator('dialog.visor');
      await visor.locator('.lector__pagina[data-pagina="2"] .textLayer span').first().waitFor();
      await visor.evaluate(() => {
        const span = [...document.querySelectorAll('.lector__pagina[data-pagina="2"] .textLayer span')].find((x) => x.textContent.includes('junta los datos'));
        const t = span.firstChild;
        const r = document.createRange();
        r.setStart(t, t.data.indexOf('Un monitor'));
        r.setEnd(t, t.data.indexOf('junta los datos') + 'junta los datos'.length);
        getSelection().removeAllRanges();
        getSelection().addRange(r);
      });
      await visor.getByRole('toolbar', { name: 'Resaltar lo seleccionado' }).getByRole('button', { name: 'Preguntar a Consultron' }).click();
      const alLado = visor.getByRole('region', { name: 'Consultron' });
      const marcada = alLado.getByRole('textbox', { name: 'Tu pregunta' });
      await marcada.waitFor();
      await marcada.press('Enter');
      await alLado.locator('.consultron__entrada[data-estado="listo"]').filter({ hasText: 'Contestó Gemini, de Google.' }).waitFor();
      assert.equal(aLaNube.length, 4, 'lo marcado en un resumen va a Gemini');
      assert.match(JSON.stringify(aLaNube.at(-1)), /junta los datos/, 'con lo marcado');
      await visor.getByRole('button', { name: 'Cerrar', exact: true }).click();
      await visor.waitFor({ state: 'detached' });
    } finally {
      santoPdfConTexto = false;
    }
    await pagina.evaluate(() => localStorage.setItem('prueba-gpu', 'con'));
    await aLado();
    await ir('consultron');

    // Off without asking.
    await carrera.click();
    assert.equal(await carrera.isChecked(), false, 'se apaga sin preguntar');
    await pagina.unroute(NUBE);
    await pagina.evaluate(() => localStorage.removeItem('cl.consultron.gemini'));
  });

  await prueba('consultron al lado de un resumen: responde solo con él, no agranda la hoja, deja la lista donde el alumno la puso y se ensancha', async () => {
    await pagina.addInitScript(() => {
      let modo = null;
      try {
        modo = localStorage.getItem('prueba-gpu');
      } catch {
        return;
      }
      if (!modo) return;
      const gpu = modo === 'sin' ? undefined : { requestAdapter: async () => ({ features: new Set(['shader-f16']) }) };
      Object.defineProperty(Navigator.prototype, 'gpu', { configurable: true, get: () => gpu });
    });
    const tamano = pagina.viewportSize();
    await pagina.setViewportSize({ width: 1741, height: 937 });
    SANTO_TEXTOS.push({ id: SANTO_BANCO[1].id, texto: 'Semáforos y monitores. Un semáforo cuenta los permisos que quedan para entrar a la sección crítica.' });
    // The sheet and what is in it, against the window.
    const medir = () => pagina.evaluate(() => {
      const d = document.querySelector('dialog.visor');
      const caja = (s) => {
        const e = d.querySelector(s);
        if (!e) return null;
        const c = e.getBoundingClientRect();
        return { izquierda: Math.round(c.left), derecha: Math.round(c.right), arriba: Math.round(c.top), abajo: Math.round(c.bottom), ancho: Math.round(c.width) };
      };
      const l = d.querySelector('.charla__lista');
      return {
        sobra: [d.scrollHeight - d.clientHeight, d.scrollWidth - d.clientWidth],
        corrido: [d.scrollTop, d.scrollLeft],
        cabeza: caja('.visor__cabeza'),
        cuerpo: caja('.visor__cuerpo'),
        panel: caja('.lector__consultron'),
        barra: caja('.lector__barra'),
        ultimoBoton: caja('.lector__barra button:last-of-type'),
        lista: l && { arriba: l.scrollTop, falta: l.scrollHeight - l.scrollTop - l.clientHeight },
        ventana: [innerWidth, innerHeight],
      };
    });
    try {
      // Alone (FLUJOS_SOLO) it starts from the sign-in.
      await ir('resumenes');
      const usuario = pagina.getByLabel('Usuario');
      const banco = pagina.getByRole('region', { name: 'Banco de resúmenes' });
      await Promise.race([usuario.waitFor().catch(() => {}), banco.waitFor().catch(() => {})]);
      if (await usuario.isVisible()) {
        await usuario.fill('alumno');
        await pagina.getByLabel('Contraseña').fill(CONTRASENA);
        await boton('Entrar').click();
        await pagina.getByRole('heading', { name: 'Hola, Ana' }).waitFor();
      }
      await pagina.evaluate(() => localStorage.setItem('prueba-gpu', 'con'));
      await aLado();
      await ir('consultron');
      const campo = pagina.getByRole('textbox', { name: 'Tu pregunta' });
      await Promise.race([boton('Bajar Consultron').waitFor().catch(() => {}), campo.waitFor().catch(() => {})]);
      if (await boton('Bajar Consultron').isVisible()) {
        await boton('Bajar Consultron').click();
        await pagina.getByRole('dialog').getByRole('button', { name: 'Bajar', exact: true }).click();
      }
      await campo.waitFor({ timeout: 15000 });

      await ir('resumenes');
      await banco.getByRole('button', { name: 'Final con teoría', exact: true }).click();
      const visor = pagina.locator('dialog.visor');
      await pagina.frameLocator('dialog.visor iframe').getByRole('heading', { name: 'Semáforos y monitores' }).waitFor();
      await visor.getByRole('button', { name: 'Consultron', exact: true }).click();
      const panel = visor.getByRole('region', { name: 'Consultron' });
      const pregunta = panel.getByRole('textbox', { name: 'Tu pregunta' });
      await pregunta.waitFor();

      // Beside a summary there's nothing to choose: it answers with the summary, and reads nothing of the campus.
      assert.equal(await panel.getByRole('combobox').count(), 0, 'sin «Busca en» al lado de un resumen');
      assert.equal(await panel.getByText(/Ley[oó] tus? .*PDF|Leyendo tus PDF/).count(), 0, 'no lee los PDF del campus');

      // A long answer: the sheet stays the size of the window while it's written.
      await pregunta.fill('Explicame largo los semáforos');
      await pregunta.press('Enter');
      const larga = panel.locator('.consultron__entrada', { hasText: 'Explicame largo' });
      await larga.getByText('Párrafo 12 de una explicación').waitFor();
      // The student moves the list while it writes: it stays where they left it.
      const lista = panel.locator('.charla__lista');
      const caja = await lista.boundingBox();
      await pagina.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2);
      await pagina.mouse.wheel(0, 240);
      await pagina.waitForTimeout(250);
      const dejada = (await medir()).lista.arriba;
      assert.ok(dejada > 100, `la rueda mueve la lista (${dejada})`);
      await pagina.waitForTimeout(450);
      assert.ok(Math.abs((await medir()).lista.arriba - dejada) <= 2, 'la respuesta no mueve lo que el alumno corrió');
      // At the end, it stays at the end as the answer grows: it never goes back up to the question.
      // (The browser goes down to the end it knew, a paragraph behind: reaching that one is reaching the end.)
      await pagina.mouse.wheel(0, 100000);
      await pagina.waitForTimeout(500);
      assert.equal(await larga.getAttribute('data-estado'), 'escribiendo', 'sigue escribiendo');
      assert.ok((await medir()).lista.falta < 8, 'en el final se queda en el final');
      await panel.locator('.consultron__entrada[data-estado="listo"]', { hasText: 'Párrafo 80 de una explicación' }).waitFor({ timeout: 20000 });
      await pagina.waitForTimeout(200);
      let m = await medir();
      assert.ok(m.lista.falta < 8, `sigue en el final al terminar (${m.lista.falta})`);
      assert.deepEqual(m.sobra, [0, 0], 'la hoja no crece con la respuesta');
      // The wheel over the box to write moves nothing: the name of the summary and «Cerrar» stay on top.
      const cajaCampo = await pregunta.boundingBox();
      await pagina.mouse.move(cajaCampo.x + 40, cajaCampo.y + 10);
      await pagina.mouse.wheel(0, 300);
      await pagina.waitForTimeout(250);
      m = await medir();
      assert.deepEqual(m.corrido, [0, 0], 'la rueda no corre la hoja');
      assert.equal(m.cabeza.arriba, 0, 'la cabecera sigue arriba');
      assert.equal(m.panel.abajo, m.ventana[1], 'Consultron llega justo al pie');
      await foto('consultron-resumen-largo');

      // What the summary doesn't have, it says so: beside a file it reads that file alone, nothing in general.
      await pregunta.fill('¿Qué es un interbloqueo?');
      await pregunta.press('Enter');
      const fuera = panel.locator('.consultron__entrada[data-estado="no-esta"]', { hasText: '¿Qué es un interbloqueo?' });
      await fuera.getByText('Busqué solo en este resumen.').waitFor();
      assert.equal(await fuera.getByText('En general, se hace por partes.').count(), 0, 'nada en general al lado de un resumen');

      // Its edge makes it wider or narrower: with the keys, dragging it, and back with a double click. It stays saved.
      const borde = panel.getByRole('separator', { name: 'Ancho de Consultron' });
      assert.equal(await borde.getAttribute('aria-valuenow'), '380');
      await borde.focus();
      await pagina.keyboard.press('ArrowLeft');
      await pagina.keyboard.press('Shift+ArrowLeft');
      assert.equal(await borde.getAttribute('aria-valuenow'), '460');
      m = await medir();
      assert.equal(m.panel.ancho, 460);
      assert.equal(m.cuerpo.derecha, m.panel.izquierda, 'el resumen le deja el lugar');
      await pagina.keyboard.press('End');
      assert.equal(await borde.getAttribute('aria-valuenow'), '760', 'hasta su tope');
      await pagina.keyboard.press('Home');
      assert.equal(await borde.getAttribute('aria-valuenow'), '320', 'hasta su mínimo');
      await pagina.keyboard.press('Enter');
      assert.equal(await borde.getAttribute('aria-valuenow'), '380', 'con Enter vuelve al de siempre');
      // Without dragging nor keys: its two buttons, each one still at the end of its way.
      const masAncho = panel.getByRole('button', { name: 'Consultron más ancho', exact: true });
      const masAngosto = panel.getByRole('button', { name: 'Consultron más angosto', exact: true });
      await masAncho.click();
      assert.equal(await borde.getAttribute('aria-valuenow'), '460', 'un botón lo ensancha');
      await masAngosto.click();
      await masAngosto.click();
      assert.equal(await borde.getAttribute('aria-valuenow'), '320', 'el otro lo angosta, hasta su mínimo');
      assert.equal(await masAngosto.getAttribute('aria-disabled'), 'true');
      assert.equal(await masAncho.getAttribute('aria-disabled'), null);
      // Dragged over the summary, which lives in a frame without scripts. With a button down Playwright asks every
      // frame whether a drag began, and that frame never answers: the mouse goes straight through the protocol.
      const cajaBorde = await borde.boundingBox();
      const raton = await contexto.newCDPSession(pagina);
      const mover = (type, x, y, mas = {}) => raton.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: 1, ...mas });
      await mover('mouseMoved', cajaBorde.x + 2, cajaBorde.y + 300, { button: 'none', buttons: 0 });
      await mover('mousePressed', cajaBorde.x + 2, cajaBorde.y + 300, { clickCount: 1 });
      for (let paso = 1; paso <= 10; paso += 1) await mover('mouseMoved', cajaBorde.x + 2 - paso * 20.2, cajaBorde.y + 320);
      await foto('consultron-resumen-arrastre');
      await mover('mouseReleased', cajaBorde.x - 200, cajaBorde.y + 320, { buttons: 0, clickCount: 1 });
      m = await medir();
      assert.ok(Math.abs(m.panel.ancho - 522) <= 3, `arrastrado queda más ancho (${m.panel.ancho})`);
      assert.deepEqual(m.sobra, [0, 0]);
      assert.equal(await pagina.evaluate(() => JSON.parse(localStorage.getItem('cl.ajustes')).anchoConsultron), m.panel.ancho, 'el ancho queda guardado');
      await foto('consultron-resumen-ancho');
      // Closed in the middle of a drag (the keyboard, another finger): the row is left free, nothing stays over the summary.
      const otraCaja = await borde.boundingBox();
      await mover('mousePressed', otraCaja.x + 2, otraCaja.y + 300, { clickCount: 1 });
      await mover('mouseMoved', otraCaja.x - 30, otraCaja.y + 300);
      assert.equal(await visor.locator('[data-ancho-consultron]').count(), 1, 'arrastrando');
      await panel.getByRole('button', { name: 'Cerrar Consultron' }).focus();
      await pagina.keyboard.press('Enter');
      await panel.waitFor({ state: 'detached' });
      assert.equal(await visor.locator('[data-ancho-consultron]').count(), 0, 'cerrado a medio arrastrar no deja nada puesto');
      await mover('mouseReleased', otraCaja.x - 30, otraCaja.y + 300, { buttons: 0, clickCount: 1 });
      await raton.detach();
      await visor.getByRole('button', { name: 'Consultron', exact: true }).click();
      await pregunta.waitFor();
      await borde.dblclick();
      assert.equal(await borde.getAttribute('aria-valuenow'), '380', 'con doble clic vuelve al de siempre');

      // A summary that is a PDF opens in the reader, with Consultron as it was left: beside the pages, inside the window,
      // with the whole bar of the reader in sight.
      await visor.getByRole('button', { name: 'Cerrar', exact: true }).click();
      await visor.waitFor({ state: 'detached' });
      await banco.getByRole('button', { name: 'Resumen del 1° parcial', exact: true }).click();
      await visor.locator('.lector__pagina[data-pagina="1"]').first().waitFor();
      await visor.getByRole('region', { name: 'Consultron' }).getByRole('textbox', { name: 'Tu pregunta' }).waitFor();
      await pagina.waitForTimeout(500);
      m = await medir();
      assert.deepEqual(m.sobra, [0, 0], 'el lector no se sale de la hoja');
      assert.ok(m.panel.derecha <= m.ventana[0] && m.panel.izquierda >= m.ventana[0] - 381, `Consultron al lado, dentro de la ventana (${m.panel.izquierda}, ${m.panel.derecha})`);
      assert.ok(m.ultimoBoton.derecha <= m.ventana[0] && m.barra.derecha <= m.ventana[0], 'la barra del lector entera a la vista');
      assert.equal(await visor.getByRole('region', { name: 'Consultron' }).getByRole('combobox').count(), 0, 'tampoco elige materias en un resumen en PDF');
      await foto('consultron-resumen-pdf');
      await visor.locator('.lector__consultron').getByRole('button', { name: 'Cerrar Consultron' }).click();
      await visor.getByRole('button', { name: 'Cerrar', exact: true }).click();
      await visor.waitFor({ state: 'detached' });

      // A summary El Santo Resumen gives no text for: Consultron reads its HTML, never «couldn't read it».
      SANTO_TEXTOS.length = 0;
      await pagina.reload();
      await banco.getByRole('button', { name: 'Final con teoría', exact: true }).click();
      await pagina.frameLocator('dialog.visor iframe').getByRole('heading', { name: 'Semáforos y monitores' }).waitFor();
      if (!(await visor.getByRole('region', { name: 'Consultron' }).isVisible())) await visor.getByRole('button', { name: 'Consultron', exact: true }).click();
      const sinTextos = visor.getByRole('region', { name: 'Consultron' }).getByRole('textbox', { name: 'Tu pregunta' });
      await sinTextos.waitFor();
      await pagina.evaluate(() => {
        window.piezasDelResumen = [];
        const mandar = Worker.prototype.postMessage;
        Worker.prototype.postMessage = function (m, ...resto) {
          if (m?.tipo === 'preguntar') window.piezasDelResumen.push(m.mensajes.at(-1).content);
          return mandar.call(this, m, ...resto);
        };
      });
      await sinTextos.fill('¿De qué se trata este resumen?');
      await sinTextos.press('Enter');
      await visor.locator('.consultron__entrada:is([data-estado="listo"], [data-estado="no-esta"])', { hasText: '¿De qué se trata este resumen?' }).waitFor();
      assert.equal(await visor.getByText('No pude leer el texto de este resumen.').count(), 0, 'lee el HTML del resumen');
      assert.match(await pagina.evaluate(() => window.piezasDelResumen.at(-1) ?? ''), /Semáforos y monitores/, 'las piezas salen del HTML abierto');
      await visor.getByRole('button', { name: 'Cerrar', exact: true }).click();
      await visor.waitFor({ state: 'detached' });
    } finally {
      SANTO_TEXTOS.length = 0;
      await pagina.setViewportSize(tamano);
      await pagina.evaluate(async () => {
        localStorage.removeItem('prueba-gpu');
        localStorage.removeItem('cl.consultron');
        try {
          const a = JSON.parse(localStorage.getItem('cl.ajustes'));
          if (a) {
            delete a.anchoConsultron;
            localStorage.setItem('cl.ajustes', JSON.stringify(a));
          }
        } catch {
          // Nothing saved.
        }
        await caches.delete('prueba-consultron');
        await caches.delete('webllm/model');
      });
    }
  });

  await prueba('consultron en Repaso: lee las tarjetas, y en una ronda la respuesta solo después de darla vuelta', async () => {
    await pagina.addInitScript(() => {
      let modo = null;
      try {
        modo = localStorage.getItem('prueba-gpu');
      } catch {
        return;
      }
      if (!modo) return;
      const gpu = modo === 'sin' ? undefined : { requestAdapter: async () => ({ features: new Set(['shader-f16']) }) };
      Object.defineProperty(Navigator.prototype, 'gpu', { configurable: true, get: () => gpu });
    });
    // Alone (FLUJOS_SOLO) it starts from the sign-in and downloads the (test) model.
    await ir('');
    const usuario = pagina.getByLabel('Usuario');
    const hola = pagina.getByRole('heading', { name: 'Hola, Ana' });
    await Promise.race([usuario.waitFor().catch(() => {}), hola.waitFor().catch(() => {})]);
    if (await usuario.isVisible()) {
      await usuario.fill('alumno');
      await pagina.getByLabel('Contraseña').fill(CONTRASENA);
      await boton('Entrar').click();
      await hola.waitFor();
    }
    await pagina.evaluate(() => localStorage.setItem('prueba-gpu', 'con'));
    await ir('consultron');
    const campoGrande = pagina.getByRole('textbox', { name: 'Tu pregunta' });
    await Promise.race([boton('Bajar Consultron').waitFor().catch(() => {}), campoGrande.waitFor().catch(() => {})]);
    if (await boton('Bajar Consultron').isVisible()) {
      await boton('Bajar Consultron').click();
      await pagina.getByRole('dialog').getByRole('button', { name: 'Bajar', exact: true }).click();
    }
    await campoGrande.waitFor({ timeout: 15000 });
    // What goes to the model, from the corner's Consultron over the screen.
    const escuchar = () => pagina.evaluate(() => {
      window.pedidosConsultron = [];
      if (window.__escuchaConsultron) return;
      window.__escuchaConsultron = true;
      const mandar = Worker.prototype.postMessage;
      Worker.prototype.postMessage = function (m, ...resto) {
        if (m?.tipo === 'preguntar') window.pedidosConsultron?.push(m.mensajes.at(-1).content);
        return mandar.call(this, m, ...resto);
      };
    });
    const preguntar = async (texto) => {
      await pagina.locator('.flotante__boton').click();
      const panel = pagina.locator('#consultron-panel');
      const campo = panel.getByRole('textbox', { name: 'Tu pregunta' });
      await campo.waitFor();
      const antes = await pagina.evaluate(() => window.pedidosConsultron.length);
      await campo.fill(texto);
      await campo.press('Enter');
      await pagina.waitForFunction((n) => window.pedidosConsultron.length > n, antes);
      await panel.locator('.consultron__entrada[data-estado="listo"]').filter({ hasText: texto }).waitFor();
      const alModelo = await pagina.evaluate(() => window.pedidosConsultron.at(-1));
      await panel.getByRole('button', { name: 'Cerrar Consultron' }).click();
      await panel.waitFor({ state: 'detached' });
      return alModelo;
    };

    await ir('repaso');
    const nueva = pagina.locator('.repaso-nueva');
    await nueva.getByLabel('Pregunta').fill('¿Qué dice la ley de Ohm?');
    await nueva.getByLabel('Respuesta').fill('La tensión es la corriente por la resistencia');
    await nueva.getByRole('button', { name: 'Guardar tarjeta' }).click();
    await nueva.getByText('Guardada.', { exact: true }).waitFor();
    await escuchar();

    // The page: the cards with their answers, which the student sees in the list.
    const pagina1 = await preguntar('¿Qué tarjetas tengo?');
    assert.match(pagina1, /Repaso de Super CVG/, 'la pantalla llega al modelo');
    assert.match(pagina1, /¿Qué dice la ley de Ohm\? Respuesta: La tensión es la corriente por la resistencia/, 'la tarjeta con su respuesta');

    // A round: the card in front, its answer only once turned.
    await pagina.getByRole('button', { name: 'Empezar la ronda' }).click();
    await pagina.getByRole('heading', { name: 'Ronda de hoy' }).waitFor();
    const frente = (await pagina.locator('.repaso-ficha__frente .repaso-ficha__texto').textContent()).trim();
    const dorso = (await pagina.locator('.repaso-ficha__dorso .repaso-ficha__texto').textContent()).trim();
    const sinVer = await preguntar('Dame una pista');
    assert.ok(sinVer.includes(frente), 'la pregunta de la tarjeta');
    assert.ok(!sinVer.includes(dorso), 'sin la respuesta antes de darla vuelta');
    assert.match(sinVer, /no le digas la respuesta/i);
    await pagina.getByRole('button', { name: 'Ver la respuesta' }).click();
    const vista = await preguntar('Explicámela');
    assert.ok(vista.includes(dorso), 'la respuesta, ya vista');

    // What the test left goes.
    await pagina.getByRole('button', { name: 'Terminar' }).click();
    await pagina.locator('.repaso-grupo__titulo').first().click();
    await pagina.locator('.repaso-fila').filter({ hasText: 'ley de Ohm' }).getByRole('button', { name: /^Borrar/ }).click();
    await pagina.getByRole('dialog').getByRole('button', { name: 'Borrar' }).click();
    await pagina.locator('.repaso-fila').filter({ hasText: 'ley de Ohm' }).waitFor({ state: 'detached' });
  });

  await prueba('consultron: practica con preguntas de los apuntes, guarda las charlas y Salir las borra', async () => {
    // Alone (FLUJOS_SOLO) it starts from the sign-in.
    const entrar = async () => {
      const usuario = pagina.getByLabel('Usuario');
      const hola = pagina.getByRole('heading', { name: 'Hola, Ana' });
      await Promise.race([usuario.waitFor().catch(() => {}), hola.waitFor().catch(() => {})]);
      if (await usuario.isVisible()) {
        await usuario.fill('alumno');
        await pagina.getByLabel('Contraseña').fill(CONTRASENA);
        await boton('Entrar').click();
        await hola.waitFor();
      }
    };
    await ir('');
    await entrar();
    await pagina.evaluate(() => localStorage.setItem('prueba-gpu', 'con'));
    await ir('consultron');
    const campo = pagina.getByRole('textbox', { name: 'Tu pregunta' });
    const bajar = boton('Bajar Consultron');
    await Promise.race([campo.waitFor({ timeout: 15000 }).catch(() => {}), bajar.waitFor({ timeout: 15000 }).catch(() => {})]);
    if (await bajar.isVisible()) {
      await bajar.click();
      await pagina.getByRole('dialog').getByRole('button', { name: 'Bajar', exact: true }).click();
    }
    await campo.waitFor({ timeout: 15000 });
    if (await boton('Charla nueva').count()) await boton('Charla nueva').click();
    const entradas = pagina.locator('.consultron__entrada');

    // Asked in the chat: a question from a real piece of the notes. The model named «el fragmento», and that goes.
    await campo.fill('Tomame preguntas de monitores');
    await campo.press('Enter');
    const primera = entradas.filter({ hasText: 'Tomame preguntas de monitores' });
    await primera.getByText('¿Qué hace un monitor?', { exact: true }).waitFor();
    assert.doesNotMatch(await primera.innerText(), /fragmento/i);
    const responder = primera.getByRole('textbox', { name: 'Tu respuesta' });
    assert.equal(await responder.evaluate((c) => c === document.activeElement), true, 'el foco va a la respuesta');
    await foto('consultron-practica-pregunta');

    // The correction: each idea of the piece, with its page. The idea the model made up isn't one.
    await responder.fill('Junta los datos compartidos y los cuida');
    await primera.getByRole('button', { name: 'Corregir' }).click();
    await primera.getByRole('heading', { name: 'Bien' }).waitFor();
    const corregida = await primera.innerText();
    assert.match(corregida, /Un monitor junta los datos con sus semáforos\./);
    assert.doesNotMatch(corregida, /OSPF|nota|puntaje|\d+\s*\/\s*10/i, 'sin la idea inventada ni una nota');
    await primera.locator('.consultron__fuentes').getByText('Materia A, página 2').waitFor();
    await primera.getByText('Lo que dicen tus apuntes').click();
    await fin('consultron-practica-corregida');
    await pagina.setViewportSize({ width: 390, height: 844 });
    assert.ok(await pagina.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'en el celular nada se sale a lo ancho');
    await primera.locator('.practica').scrollIntoViewIfNeeded();
    await foto('consultron-practica-celu');
    await pagina.setViewportSize({ width: 1280, height: 860 });
    // Its source opens the PDF at that page.
    await primera.locator('.consultron__fuentes').getByRole('button', { name: /Apunte uno/ }).click();
    const hoja = pagina.getByRole('dialog');
    assert.equal(await hoja.getByRole('textbox', { name: 'Página, de 2' }).inputValue(), '2');
    await boton('Cerrar').click();
    await hoja.waitFor({ state: 'detached' });

    // «Otra pregunta» doesn't repeat a piece: about monitors there's no other.
    await primera.getByRole('button', { name: 'Otra pregunta' }).click();
    await entradas.last().getByText(/No encontré en tus apuntes de qué preguntarte/).waitFor();

    // With «Practicar», without a theme. A wrong answer: what was missing, and the mistake.
    await boton('Practicar').click();
    const tema = pagina.getByRole('textbox', { name: 'Tema, si querés uno' });
    assert.equal(await tema.evaluate((c) => c === document.activeElement), true, 'el foco va al tema');
    await pagina.waitForTimeout(300);
    await foto('consultron-practicar');
    await boton('Empezar').click();
    await tema.waitFor({ state: 'detached' });
    const segunda = entradas.last();
    await segunda.getByRole('heading', { name: 'Practicar con tus apuntes' }).waitFor();
    await segunda.getByRole('textbox', { name: 'Tu respuesta' }).fill('Es un semáforo');
    await segunda.getByRole('button', { name: 'Corregir' }).click();
    await segunda.getByRole('heading', { name: 'Te faltó' }).waitFor();
    assert.match(await segunda.innerText(), /Ojo\. Un monitor no es un semáforo\./);
    assert.equal(await entradas.count(), 3);

    // The talk is kept: «Charla nueva», and it's among the ones of before, also after a reload. Opened, it goes on.
    await boton('Charla nueva').click();
    const anteriores = pagina.getByRole('region', { name: 'Charlas anteriores' });
    const esta = anteriores.getByRole('button', { name: /^Tomame preguntas de monitores/ });
    await esta.waitFor();
    assert.match(await esta.innerText(), /hoy, \d{2}:\d{2}/);
    await pagina.reload();
    await campo.waitFor({ timeout: 15000 });
    await esta.click();
    await entradas.first().getByRole('heading', { name: 'Bien' }).waitFor();
    assert.equal(await entradas.count(), 3);
    assert.equal(await campo.evaluate((c) => c === document.activeElement), true, 'abierta, el foco va a donde escribir');
    // Its source, kept by name: it doesn't open the campus again.
    await entradas.first().locator('.consultron__fuentes').getByText('Materia A, página 2').waitFor();
    assert.equal(await entradas.first().locator('.consultron__fuentes button').count(), 0);
    await campo.fill('¿Qué es un monitor?');
    await campo.press('Enter');
    await pagina.waitForFunction(() => document.querySelector('.consultron__hilo article.consultron__entrada:last-of-type')?.dataset.estado === 'listo');
    assert.equal(await entradas.count(), 4);

    // Another talk, and deleting one leaves the other.
    await boton('Charla nueva').click();
    await campo.fill('Hola, ¿qué sabés?');
    await campo.press('Enter');
    await entradas.filter({ hasText: '¡Hola!' }).waitFor();
    await boton('Charla nueva').click();
    await anteriores.getByRole('button', { name: /^Hola, ¿qué sabés\?/ }).waitFor();
    await foto('consultron-charlas');
    await anteriores.getByRole('button', { name: 'Borrar la charla «Tomame preguntas de monitores»' }).click();
    await pagina.getByRole('dialog', { name: '¿Borrar esta charla?' }).getByRole('button', { name: 'Borrar', exact: true }).click();
    await esta.waitFor({ state: 'detached' });
    await anteriores.getByRole('button', { name: /^Hola, ¿qué sabés\?/ }).waitFor();

    // In the corner, the same: the talks of before, and «Practicar» as its icon.
    await pagina.evaluate(() => {
      history.pushState(null, '', '/materias/1');
      dispatchEvent(new PopStateEvent('popstate'));
    });
    await boton('Consultron, listo').click();
    const rincon = pagina.getByRole('dialog', { name: 'Consultron' });
    await rincon.getByRole('region', { name: 'Charlas anteriores' }).waitFor();
    await rincon.getByRole('button', { name: 'Practicar' }).click();
    await rincon.getByRole('textbox', { name: 'Tema, si querés uno' }).waitFor();
    await pagina.waitForTimeout(300);
    await foto('consultron-rincon-practicar');
    await pagina.keyboard.press('Escape');
    await rincon.getByRole('textbox', { name: 'Tema, si querés uno' }).waitFor({ state: 'detached' });
    assert.equal(await rincon.count(), 1, 'Escape en el tema cierra solo el tema');
    await rincon.getByRole('button', { name: 'Cerrar Consultron' }).click();
    await pagina.evaluate(() => {
      history.pushState(null, '', '/consultron');
      dispatchEvent(new PopStateEvent('popstate'));
    });
    await campo.waitFor();

    // Salir deletes them, with the text of the PDFs.
    const bases = () => pagina.evaluate(async () => (await indexedDB.databases()).map((b) => b.name));
    assert.ok((await bases()).includes('super-cvg-charlas'));
    await boton('Salir').click();
    await pagina.getByLabel('Usuario').waitFor();
    for (let i = 0; i < 20 && (await bases()).includes('super-cvg-charlas'); i++) await pagina.waitForTimeout(100);
    assert.ok(!(await bases()).includes('super-cvg-charlas'), 'Salir borra las charlas');
    await entrar();
    await ir('consultron');
    await campo.waitFor({ timeout: 15000 });
    await pagina.waitForTimeout(400);
    assert.equal(await anteriores.count(), 0, 'otra sesión empieza sin charlas');

    // As the test before left it: Consultron not on this computer.
    await pagina.evaluate(async () => {
      localStorage.removeItem('prueba-gpu');
      localStorage.removeItem('cl.consultron');
      await caches.delete('prueba-consultron');
      await caches.delete('webllm/model');
    });
  });

  await prueba('materias fijadas y archivadas, la tarjeta de cada una y cómo se ve Consultron, hasta volver todo a como venía', async () => {
    // Alone (FLUJOS_SOLO) it starts from the sign-in.
    const usuario = pagina.getByLabel('Usuario');
    const hola = pagina.getByRole('heading', { name: 'Hola, Ana' });
    await ir('');
    await Promise.race([usuario.waitFor().catch(() => {}), hola.waitFor().catch(() => {})]);
    if (await usuario.isVisible()) {
      await usuario.fill('alumno');
      await pagina.getByLabel('Contraseña').fill(CONTRASENA);
      await boton('Entrar').click();
      await hola.waitFor();
    }
    await pagina.evaluate(() => localStorage.removeItem('cl.ajustes'));
    const fallasAxe = async () => {
      await pagina.evaluate(AXE);
      return pagina.evaluate(async () => {
        await Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {})));
        return (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })).violations.map((v) => `${v.id}: ${v.nodes[0].target}`);
      });
    };
    // Its name, and what it has below it (a task, what was seen) when it has something.
    const tarjeta = (nombre) => pagina.locator('.materias__item', { has: pagina.getByRole('link', { name: new RegExp(`^${nombre}(\\s|$)`) }) });
    const titulos = () => pagina.locator('.vista-materias h2').allTextContents();
    const enfocadoAhora = () => pagina.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent);
    // The focus follows the card to its new group once it's drawn there: it's waited for a moment, then compared.
    const enfocado = async (esperado) => {
      await pagina.waitForFunction((e) => (document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent) === e, esperado, { timeout: 3000 }).catch(() => {});
      return enfocadoAhora();
    };
    const marcas = () => pagina.evaluate(() => JSON.parse(localStorage.getItem('cl.mio.5')).materias);
    await ir('materias');
    await tarjeta('Materia A').waitFor();
    await tarjeta('Materia B').waitFor();
    assert.ok(!(await titulos()).includes('Fijadas'));

    // Pinned: first of all, with the focus on its options in its new place.
    await boton('Opciones de Materia A').click();
    await boton('Fijar arriba').click();
    await pagina.getByText('Fijaste Materia A arriba').waitFor();
    assert.equal((await titulos())[0], 'Fijadas');
    assert.equal((await pagina.locator('.materias__item').first().locator('.materias__nombre').innerText()).trim(), 'Materia A');
    assert.equal(await enfocado('Opciones de Materia A'), 'Opciones de Materia A');

    // Archived: out of the list into a folded group at the end, and back from there.
    await boton('Opciones de Materia B').click();
    assert.deepEqual(await fallasAxe(), [], 'Materias con las opciones abiertas');
    await foto('materias-opciones');
    await boton('Archivar').click();
    const archivadas = pagina.locator('summary', { hasText: 'Archivadas (1)' });
    await archivadas.waitFor();
    assert.equal(await tarjeta('Materia B').isVisible(), false, 'plegada de entrada');
    assert.equal(await enfocado('Archivadas (1)'), 'Archivadas (1)');
    await archivadas.click();
    await tarjeta('Materia B').waitFor();
    await boton('Opciones de Materia B').click();
    await boton('Sacar del archivo').click();
    await archivadas.waitFor({ state: 'detached' });
    await boton('Opciones de Materia B').click();
    await boton('Archivar').click();
    await archivadas.waitFor();

    // A look of its own for one course; Escape closes its options and gives the focus back.
    await boton('Opciones de Materia A').click();
    await pagina.locator('.materias__menu:not([hidden])').getByLabel('Tarjeta').selectOption('portada');
    assert.equal(await tarjeta('Materia A').getAttribute('data-tarjeta'), 'portada');
    await pagina.keyboard.press('Escape');
    assert.equal(await pagina.locator('.materias__menu:not([hidden])').count(), 0);
    assert.equal(await enfocado('Opciones de Materia A'), 'Opciones de Materia A');
    // Only numbers of the campus in the student's data: the course by its id, nothing of its name.
    const guardado = await marcas();
    assert.deepEqual([guardado[1].enLista, guardado[1].tarjeta, guardado[2].enLista], ['fijada', 'portada', 'archivada']);
    assert.ok(!JSON.stringify(guardado).includes('Materia A'), 'el nombre del campus no se guarda');

    // The look of every course, from Configuración: the one chosen for A stays.
    await ir('configuracion#materias');
    await pagina.locator('input[name="tarjeta"][value="franja"]').check({ force: true });
    await ir('materias');
    await archivadas.click();
    assert.equal(await tarjeta('Materia B').getAttribute('data-tarjeta'), 'franja');
    assert.equal(await tarjeta('Materia A').getAttribute('data-tarjeta'), 'portada');
    await foto('materias-fijada-portada-archivada-franja');

    // Every look in every view, with the biggest letter: nothing out to the side, and the name never under its options.
    await pagina.setViewportSize({ width: 390, height: 860 });
    for (const estilo of ['simbolo', 'tenida', 'franja', 'portada', 'sello', 'minima']) {
      for (const vista of ['tarjetas', 'lista', 'grandes']) {
        await pagina.evaluate((a) => localStorage.setItem('cl.ajustes', JSON.stringify(a)), { tarjeta: estilo, letra: LETRA_ENORME, vistas: { materias: vista } });
        await ir('materias');
        await tarjeta('Materia A').waitFor();
        const problemas = await pagina.evaluate(() => [...document.querySelectorAll('.materias__item')].filter((li) => {
          const b = li.querySelector('.materias__opciones')?.getBoundingClientRect();
          const textos = [...li.querySelectorAll('.materias__nombre, .materias__dato')].flatMap((t) => [...t.getClientRects()]);
          return b && textos.some((r) => Math.min(r.right, b.right) - Math.max(r.left, b.left) > 1 && Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top) > 1);
        }).map((li) => li.innerText.split('\n')[0]));
        assert.deepEqual(problemas, [], `${estilo}, ${vista}: el nombre bajo sus opciones`);
        assert.equal(await pagina.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false, `${estilo}, ${vista} se sale a lo ancho`);
      }
    }
    await pagina.setViewportSize({ width: 1280, height: 860 });
    await pagina.evaluate(() => localStorage.setItem('cl.ajustes', JSON.stringify({ tarjeta: 'franja' })));

    // Consultron's chat: as a document, on the left and with a color of its own, before the page paints.
    await ir('configuracion#como-se-ve');
    await pagina.locator('input[name="consultron-forma"][value="documento"]').check({ force: true });
    await pagina.locator('input[name="consultron-letra"][value="grande"]').check({ force: true });
    await pagina.locator('input[name="consultron-lado"][value="izquierda"]').check({ force: true });
    await pagina.locator('input[name="consultronColor"][value="#5b3a9d"]').check({ force: true });
    const esperado = { consultronForma: 'documento', consultronLetra: 'grande', consultronLado: 'izquierda', consultronColor: 'propio', color: '#5b3a9d' };
    const html = () => pagina.evaluate(() => ({ ...document.documentElement.dataset, color: document.documentElement.style.getPropertyValue('--consultron-accion') }));
    const lo = (h) => Object.fromEntries(Object.keys(esperado).map((k) => [k, h[k]]));
    assert.deepEqual(lo(await html()), esperado);
    await pagina.reload();
    assert.deepEqual(lo(await html()), esperado);
    assert.deepEqual(await fallasAxe(), [], 'Configuración, Consultron');

    // In the chat: the question without its bubble, under the color of Consultron, and the robot out of the way.
    await pagina.evaluate(() => localStorage.setItem('prueba-gpu', 'con'));
    await ir('consultron');
    const campo = pagina.getByRole('textbox', { name: 'Tu pregunta' });
    const bajar = boton('Bajar Consultron');
    await Promise.race([campo.waitFor({ timeout: 15000 }).catch(() => {}), bajar.waitFor({ timeout: 15000 }).catch(() => {})]);
    if (await bajar.isVisible()) {
      await bajar.click();
      await pagina.getByRole('dialog').getByRole('button', { name: 'Bajar', exact: true }).click();
    }
    await campo.waitFor({ timeout: 15000 });
    if (await boton('Charla nueva').count()) await boton('Charla nueva').click();
    await campo.fill('¿Qué es un semáforo?');
    await campo.press('Enter');
    const entrada = pagina.locator('.consultron__entrada').last();
    await entrada.getByText('Y nada más', { exact: false }).waitFor();
    const forma = await entrada.evaluate((e) => {
      const p = getComputedStyle(e.querySelector('.consultron__pregunta'));
      return { fondo: p.backgroundColor, linea: p.borderBottomColor, robot: getComputedStyle(e.querySelector('.consultron__respuesta > .consultron__robot')).display };
    });
    assert.deepEqual(forma, { fondo: 'rgba(0, 0, 0, 0)', linea: 'rgb(91, 58, 157)', robot: 'none' });
    await foto('consultron-documento');

    // The corner opens on the left, and its edge to drag is its right one.
    await ir('materias');
    const flotante = pagina.locator('.flotante__boton');
    await flotante.waitFor();
    assert.ok((await flotante.boundingBox()).x < 100, 'el botón a la izquierda');
    await flotante.click();
    const panel = pagina.locator('.flotante');
    await panel.waitFor();
    const caja = await panel.boundingBox();
    assert.ok(caja.x < 40, 'el rincón a la izquierda');
    const borde = await panel.locator('> .lector__consultron-borde').boundingBox();
    assert.ok(borde.x > caja.x + caja.width - 30, 'el borde a la derecha');
    await pagina.mouse.move(borde.x + borde.width / 2, borde.y + 200);
    await pagina.mouse.down();
    await pagina.mouse.move(borde.x + borde.width / 2 + 80, borde.y + 200, { steps: 4 });
    await pagina.mouse.up();
    assert.ok((await panel.boundingBox()).width > caja.width + 60, 'arrastrado a la derecha, más ancho');
    await foto('consultron-a-la-izquierda');
    await boton('Cerrar Consultron').click();

    // Volver todo a como venía: the cards and Consultron too. What the student pinned and archived stays.
    await ir('configuracion#datos');
    await boton('Volver todo a como venía').click();
    await pagina.getByRole('dialog').getByRole('button', { name: 'Volver todo' }).click();
    await pagina.getByText('Volvió todo a como venía').waitFor();
    const vuelto = await html();
    assert.deepEqual([vuelto.consultronForma, vuelto.consultronLetra, vuelto.consultronLado, vuelto.consultronColor, vuelto.color], ['globos', 'normal', 'derecha', 'no', '']);
    assert.equal(await pagina.evaluate(() => localStorage.getItem('cl.ajustes')), null);
    await ir('materias');
    assert.equal(await tarjeta('Materia A').getAttribute('data-tarjeta'), 'portada');
    assert.equal((await titulos())[0], 'Fijadas');

    // Back as it was, for what comes after.
    await boton('Opciones de Materia A').click();
    await pagina.locator('.materias__menu:not([hidden])').getByLabel('Tarjeta').selectOption('');
    await boton('Dejar de fijar').click();
    await archivadas.click();
    await boton('Opciones de Materia B').click();
    await boton('Sacar del archivo').click();
    await archivadas.waitFor({ state: 'detached' });
    await pagina.evaluate(() => localStorage.removeItem('prueba-gpu'));
  });
  await prueba('pasar tu estilo con un código: un error no pasa, el de otro trae toda su configuración menos daltonismo y movimiento, y se puede volver al tuyo', async () => {
    const usuario = pagina.getByLabel('Usuario');
    const hola = pagina.getByRole('heading', { name: 'Hola, Ana' });
    await ir('');
    await Promise.race([usuario.waitFor().catch(() => {}), hola.waitFor().catch(() => {})]);
    if (await usuario.isVisible()) {
      await usuario.fill('alumno');
      await pagina.getByLabel('Contraseña').fill(CONTRASENA);
      await boton('Entrar').click();
      await hola.waitFor();
    }
    const codigoActual = () => pagina.locator('.pasar-estilo__codigo').textContent();
    const ajustesGuardados = () => pagina.evaluate(() => JSON.parse(localStorage.getItem('cl.ajustes') ?? '{}'));
    // Same address, other settings: a hash alone wouldn't load the page again.
    const abrir = async () => {
      await ir('configuracion#pasar-estilo');
      await pagina.reload();
      await pagina.locator('.pasar-estilo__codigo').waitFor();
    };

    try {
      // A classmate's look.
      await pagina.evaluate(() => localStorage.setItem('cl.ajustes', JSON.stringify({ estilo: 'plano', tarjeta: 'franja', accion: '#7a3fb0', vistas: { hoy: 'tablero' } })));
      await abrir();
      const suyo = await codigoActual();
      assert.match(suyo, /^CVG-[0-9A-Z-]+$/);
      // And a third one's.
      await pagina.evaluate(() => localStorage.setItem('cl.ajustes', JSON.stringify({ estilo: 'batman' })));
      await abrir();
      const otro = await codigoActual();

      // This student's: another style, a bigger letter and colors for red and green.
      await pagina.evaluate(() => localStorage.setItem('cl.ajustes', JSON.stringify({ estilo: 'hoja', letra: 'grande', daltonismo: 'rojo-verde' })));
      await abrir();
      const mio = await codigoActual();
      assert.notEqual(mio, suyo);

      const campo = pagina.getByLabel('Código de otro');
      const usar = pagina.locator('.pasar-estilo__usar').getByRole('button', { name: 'Usar este estilo' });
      await usar.click();
      await pagina.getByText('Pegá el código que te pasaron.').waitFor();
      await campo.fill(suyo.slice(0, -1) + (suyo.endsWith('2') ? '3' : '2'));
      await usar.click();
      await pagina.getByText('Ese código no es de un estilo. Revisá que esté completo.').waitFor();
      assert.equal(await campo.getAttribute('aria-invalid'), 'true');

      await campo.fill(suyo.toLowerCase().replace(/-/g, ' '));
      await usar.click();
      const dialogo = pagina.getByRole('dialog');
      await dialogo.getByText('Es Plano').waitFor();
      await dialogo.getByRole('button', { name: 'Usar este estilo' }).click();
      await pagina.getByText('Estilo cambiado').waitFor();
      assert.equal(await pagina.evaluate(() => document.documentElement.dataset.estilo), 'plano');
      const despues = await ajustesGuardados();
      // Everything comes, the letter too; color blindness stays.
      assert.deepEqual([despues.estilo, despues.tarjeta, despues.accion, despues.vistas.hoy, despues.letra, despues.daltonismo], ['plano', 'franja', '#7a3fb0', 'tablero', 'normal', 'rojo-verde']);
      assert.equal(await codigoActual(), suyo);
      await foto('pasar-estilo');
      // Another code on top: the way back is still to the student's own.
      await campo.fill(otro);
      await usar.click();
      await dialogo.getByRole('button', { name: 'Usar este estilo' }).click();
      await pagina.waitForFunction(() => document.documentElement.dataset.estilo === 'batman');

      await boton('Volver al tuyo').click();
      await pagina.getByText('Volviste a tu estilo').waitFor();
      assert.equal(await pagina.evaluate(() => document.documentElement.dataset.estilo), 'hoja');
      assert.equal(await codigoActual(), mio);

      await pagina.evaluate(AXE);
      const fallas = await pagina.evaluate(async () => (await window.axe.run('section[aria-labelledby="pasar-estilo"]', { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })).violations.map((v) => `${v.id}: ${v.nodes[0].target}`));
      assert.deepEqual(fallas, []);
    } finally {
      await pagina.evaluate(() => localStorage.removeItem('cl.ajustes'));
    }
  });

  await prueba('Tu privacidad y Notas del parche se leen en una columna, alineada con la cabecera', async () => {
    for (const ruta of ['privacidad', 'novedades']) {
      for (const ancho of [1280, 390]) {
        await pagina.setViewportSize({ width: ancho, height: ancho === 390 ? 844 : 860 });
        await ir(ruta);
        await pagina.locator('h1').waitFor();
        const m = await pagina.evaluate(() => {
          const parrafo = document.querySelector('main article > :is(p, section)');
          return {
            marca: document.querySelector('.cabecera__marca').getBoundingClientRect().left,
            titulo: document.querySelector('main h1').getBoundingClientRect().left,
            ancho: Math.max(...[...document.querySelectorAll('main article > :is(p, section)')].map((e) => e.getBoundingClientRect().width)),
            tope: 44 * parseFloat(getComputedStyle(parrafo).fontSize),
          };
        });
        assert.ok(m.ancho <= m.tope + 0.5, `/${ruta} en ${ancho} mide ${m.ancho}px, más que 44em`);
        assert.ok(Math.abs(m.marca - m.titulo) < 1, `/${ruta} en ${ancho} no queda alineada con la cabecera`);
        await pagina.screenshot({ path: path.join(CAPTURAS, `${ruta}-${ancho}.png`), fullPage: true });
      }
    }
    await pagina.setViewportSize({ width: 1280, height: 860 });
  });

  await prueba('Entrar con Google: se prende con advertencia, entra en el mismo dispositivo y en otro con todo, clave vencida y apagar', async () => {
    const axe = AXE;
    const fallasAxe = async (p) => {
      await p.evaluate(axe);
      return p.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })).violations.map((v) => `${v.id}: ${v.nodes[0].target}`));
    };
    const seSale = (p) => p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    const archivo = () => [...enDrive.values()].find((f) => f.name === 'super-cvg-cuenta.json');
    const contextos = [];
    const abrir = async (opciones) => {
      const c = await navegador.newContext(opciones);
      contextos.push(c);
      await c.route('**/*', atender);
      const p = await c.newPage();
      p.on('pageerror', (e) => errores.push(e.message));
      p.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
      return p;
    };
    const conGoogle = async (p) => {
      const [ventana] = await Promise.all([p.waitForEvent('popup'), p.getByRole('button', { name: 'Entrar con Google' }).click()]);
      await ventana.waitForEvent('close');
    };
    const interruptor = (p) => p.getByRole('switch', { name: 'Entrar con Google' });
    try {
      const compu = await abrir({ viewport: { width: 1280, height: 860 } });
      const celu = await abrir({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

      // The computer: inside with the password, linked to El Santo Resumen, in Hoja with big letters. Not saving in Drive.
      await compu.goto(base);
      assert.equal(await compu.locator('.entrar__formulario > :last-child').getAttribute('class'), 'entrar__recordar', 'en la compu, al final');
      await compu.getByLabel('Usuario').fill('alumno');
      await compu.getByLabel('Contraseña').fill(CONTRASENA);
      await compu.getByRole('button', { name: 'Entrar', exact: true }).click();
      await compu.getByRole('heading', { name: 'Hola, Ana' }).waitFor();
      await compu.evaluate(() => localStorage.setItem('cl.santo.5', JSON.stringify({ llave: 'llave-de-la-compu-0001', usuario: 'ana' })));
      await compu.goto(`${base}configuracion#como-se-ve`);
      await compu.locator('input[name="estilo"][value="hoja"]').check({ force: true });
      await compu.locator('input[name="letra"][value="grande"]').check({ force: true });
      await compu.goto(`${base}configuracion#datos`);
      assert.equal(await compu.getByRole('switch', { name: 'Guardar en tu Google Drive' }).isChecked(), false);

      // Turning it on warns first. Saying no leaves it off.
      assert.equal(await interruptor(compu).isChecked(), false);
      await interruptor(compu).click();
      const dialogo = compu.getByRole('dialog');
      await dialogo.getByText('Quien entre a tu cuenta de Google va a poder entrar a tu campus, leer tus mensajes y entregar por vos.', { exact: false }).waitFor();
      assert.deepEqual(await fallasAxe(compu), [], 'la advertencia');
      await compu.screenshot({ path: path.join(CAPTURAS, 'entrar-google-advertencia-1280.png') });
      await dialogo.getByRole('button', { name: 'Volver' }).click();
      assert.equal(await interruptor(compu).isChecked(), false);
      assert.equal(archivo(), undefined);
      // It asks for the campus password: without it, nothing; a wrong one says so and leaves it off.
      await interruptor(compu).click();
      const conClave = compu.getByRole('dialog');
      assert.equal(await conClave.getByLabel('Tu contraseña del campus').evaluate((c) => c === document.activeElement), true, 'el foco en la contraseña');
      await conClave.getByRole('button', { name: 'Prender' }).click();
      assert.ok(await conClave.isVisible(), 'sin contraseña no sigue');
      await conClave.getByLabel('Tu contraseña del campus').fill('otra-cosa');
      await conClave.getByRole('button', { name: 'Prender' }).click();
      await compu.getByText('Esa no es tu contraseña del campus.').waitFor();
      assert.equal(await interruptor(compu).isChecked(), false);
      assert.equal(archivo(), undefined);
      const intentos = pedidos.filter((p) => p.url.endsWith('/login/token.php'));
      assert.equal(new URLSearchParams(intentos.at(-1).cuerpo).get('username'), 'alumno');
      await interruptor(compu).click();
      await compu.getByRole('dialog').getByLabel('Tu contraseña del campus').fill(CONTRASENA);
      await compu.screenshot({ path: path.join(CAPTURAS, 'entrar-google-contrasena-1280.png') });
      await compu.getByRole('dialog').getByRole('button', { name: 'Prender' }).click();
      await compu.getByText('Ya podés entrar con Google').waitFor();
      assert.equal(pedidos.filter((p) => p.url.endsWith('/login/token.php')).length, intentos.length + 1);
      assert.equal(await interruptor(compu).isChecked(), true);
      assert.deepEqual(JSON.parse(archivo().bytes.toString()), { v: 1, campus: TOKEN, alumno: 5, santo: { llave: 'llave-de-la-compu-0001', usuario: 'ana' }, usos: ['drive'], drive: true, calendario: null });
      // «Guardar en tu Google Drive» went on with it, and the look went to the copy.
      assert.equal(await compu.getByRole('switch', { name: 'Guardar en tu Google Drive' }).isChecked(), true);
      await compu.locator('.ajuste-drive__estado').getByText('Guardado en tu Drive recién').waitFor({ timeout: 15_000 });
      const copia = JSON.parse([...enDrive.values()].find((f) => f.name === 'super-cvg-5.json').bytes.toString());
      assert.deepEqual([copia.datos.apariencia.estilo, copia.datos.apariencia.letra], ['hoja', 'grande'], 'la apariencia en la copia');
      await compu.locator('#ajustes-datos .ajustes__seccion').first().screenshot({ path: path.join(CAPTURAS, 'entrar-google-prendido-1280.png') });

      // Salir doesn't unlink: the same computer comes back in with Google, without the password.
      await compu.getByRole('button', { name: 'Salir' }).click();
      await compu.getByRole('button', { name: 'Entrar con Google' }).waitFor();
      assert.ok(archivo(), 'Salir no borra el archivo');
      await conGoogle(compu);
      await compu.getByRole('heading', { name: 'Hola, Ana' }).waitFor();

      // The phone, with nothing: in with Google, with El Santo Resumen and Drive.
      await celu.goto(base);
      // «Seguir conectado», for both ways in: on the phone right above Entrar, on the computer last.
      const recordar = celu.locator('.entrar__recordar');
      assert.equal(await celu.locator('.entrar__recordar + .entrar__boton').count(), 1, 'en el celu, arriba de Entrar');
      await recordar.getByText('Vale también para Entrar con Google. Si no lo marcás, cada pestaña nueva te pide entrar otra vez.').waitFor();
      await celu.locator('.entrar__formulario').screenshot({ path: path.join(CAPTURAS, 'entrar-google-boton-390.png') });
      assert.deepEqual(await fallasAxe(celu), [], 'la pantalla de entrada');
      assert.equal(await seSale(celu), false, 'la pantalla de entrada se sale a lo ancho');
      await conGoogle(celu);
      await celu.getByRole('heading', { name: 'Hola, Ana' }).waitFor({ timeout: 15_000 });
      const enCelu = await celu.evaluate(() => ({
        sesion: sessionStorage.getItem('cl.sesion'),
        santo: JSON.parse(localStorage.getItem('cl.santo.5') ?? 'null'),
        drive: JSON.parse(localStorage.getItem('cl.sync.5') ?? 'null')?.prendido,
      }));
      assert.deepEqual(enCelu, { sesion: TOKEN, santo: { llave: 'llave-de-la-compu-0001', usuario: 'ana' }, drive: true });
      await celu.goto(`${base}configuracion#datos`);
      await celu.locator('.ajuste-drive__estado').getByText(/^Guardado en tu Drive/).waitFor({ timeout: 15_000 });
      assert.equal(await interruptor(celu).isChecked(), true);
      // The look of the computer came with it.
      assert.deepEqual(await celu.evaluate(() => [document.documentElement.dataset.estilo, document.documentElement.dataset.letra]), ['hoja', 'grande']);
      await celu.goto(base);
      await celu.getByRole('heading', { name: 'Hola, Ana' }).waitFor();
      await celu.waitForTimeout(1500);
      await celu.screenshot({ path: path.join(CAPTURAS, 'entrar-google-celu-con-la-apariencia-390.png') });

      // A file from before, without Drive on: the device that comes in with Google saves in Drive anyway.
      archivo().bytes = Buffer.from(JSON.stringify({ v: 1, campus: TOKEN, alumno: 5, santo: null, usos: [], drive: false, calendario: null }));
      const tercero = await abrir({ viewport: { width: 1280, height: 860 } });
      await tercero.goto(base);
      await conGoogle(tercero);
      await tercero.getByRole('heading', { name: 'Hola, Ana' }).waitFor({ timeout: 15_000 });
      assert.equal(await tercero.evaluate(() => JSON.parse(localStorage.getItem('cl.sync.5') ?? 'null')?.prendido), true, 'Drive prendido sin venir en el archivo');
      await tercero.goto(`${base}configuracion#datos`);
      await tercero.locator('.ajuste-drive__estado').getByText(/^Guardado en tu Drive/).waitFor({ timeout: 15_000 });
      assert.equal(await tercero.evaluate(() => document.documentElement.dataset.estilo), 'hoja');

      // The campus asks for the password again: it says so, and nothing comes in.
      const otro = await abrir({ viewport: { width: 390, height: 844 } });
      await otro.goto(base);
      sesionVencida = true;
      try {
        await conGoogle(otro);
        await otro.getByText('El campus pide tu contraseña de nuevo. Entrá una vez con tu usuario y Entrar con Google vuelve a andar.').waitFor();
      } finally {
        sesionVencida = false;
      }
      assert.equal(await otro.evaluate(() => sessionStorage.getItem('cl.sesion')), null);

      // Turning it off deletes it from Drive, for every device.
      await compu.goto(`${base}configuracion#datos`);
      await interruptor(compu).click();
      await compu.getByRole('dialog').getByRole('button', { name: 'Apagar' }).click();
      await compu.getByText('Dejaste de entrar con Google').waitFor();
      assert.equal(archivo(), undefined, 'el archivo se borró');
      await otro.goto(base);
      await conGoogle(otro);
      await otro.getByText('Esa cuenta de Google no tiene Super CVG vinculado. Entrá con tu usuario del campus y prendé Entrar con Google en Configuración.').waitFor();
      await otro.getByRole('button', { name: 'Entrar con Google' }).waitFor();
    } finally {
      for (const c of contextos) await c.close();
    }
  });

  await prueba('Estudiar en vivo: uno arma la sesión, otro entra con el link, chatean, abren pestañas y se siguen', async () => {
    // Alone (FLUJOS_SOLO), it comes in first.
    if (!(await pagina.evaluate(() => sessionStorage.getItem('cl.sesion')))) {
      await ir('');
      await pagina.getByLabel('Usuario').fill('alumno');
      await pagina.getByLabel('Contraseña').fill(CONTRASENA);
      await boton('Entrar').click();
      await pagina.getByRole('heading', { name: 'Hola, Ana' }).waitFor();
    }
    // The toolbar shows when the mouse moves and goes after a while; what it opens is a box with the focus inside.
    const barra = (p) => p.locator('.envivo-barra');
    let paso = 0;
    const enBarra = async (p, nombre) => {
      paso += 1;
      await p.mouse.move(300 + (paso % 7) * 13, 300 + (paso % 5) * 11);
      await barra(p).getByRole('button', { name: nombre, exact: typeof nombre === 'string' }).click();
    };
    // The tabs are always at the top; «Abrir» is at the bar and as the «+» next to the tabs.
    const enPestana = (p, titulo) => p.getByRole('tab', { name: new RegExp(`^${titulo}`), selected: true }).waitFor();
    const elegirPestana = async (p, titulo) => {
      await p.getByRole('tab', { name: new RegExp(`^${titulo}`) }).click();
    };
    let desdeArriba = false;
    const abrirHerramienta = async (p, nombre) => {
      desdeArriba = !desdeArriba;
      if (desdeArriba) await p.getByRole('button', { name: 'Abrir otra herramienta' }).first().click();
      else await enBarra(p, 'Abrir otra herramienta');
      await p.locator('.envivo-abrir').getByRole('button', { name: nombre, exact: true }).click();
    };
    const chip = (p) => p.locator('.envivo-chip');
    await aLado();
    await ir('en-vivo');
    await pagina.getByRole('button', { name: 'Armar sesión' }).click();
    // The table is the whole screen: the page does not scroll, the site's header steps aside.
    await barra(pagina).waitFor();
    assert.equal(await pagina.evaluate(() => document.scrollingElement.scrollHeight === innerHeight), true, 'la página no tiene scroll');
    assert.equal(await pagina.locator('.cabecera').isVisible(), false);
    await pagina.locator('.envivo-barra[data-oculta]').waitFor({ state: 'attached', timeout: 6000 });
    await pagina.mouse.move(500, 400);
    await pagina.locator('.envivo-barra:not([data-oculta])').waitFor({ state: 'attached' });
    await enBarra(pagina, 'Invitar');
    const codigo = (await pagina.locator('.envivo-invitar__clave').textContent()).trim();
    assert.match(codigo, /^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);
    // Escape closes it and the focus goes back to its button.
    await pagina.keyboard.press('Escape');
    await pagina.locator('.envivo-invitar__clave').waitFor({ state: 'detached' });
    await pagina.waitForFunction(() => document.activeElement?.textContent === 'Invitar', null, { timeout: 3000 });
    // The other one is the same student in another tab: same campus session, no live session yet.
    const guardado = await pagina.evaluate(() => ({ ...sessionStorage }));
    delete guardado['cl.envivo'];
    const otra = await contexto.newPage();
    await otra.addInitScript((datos) => {
      if (!sessionStorage.length) Object.entries(datos).forEach(([k, v]) => sessionStorage.setItem(k, v));
    }, guardado);
    const dialogo = (p, nombre) => p.locator('dialog').getByRole('button', { name: nombre, exact: true }).click();
    try {
      await otra.goto(`${base}en-vivo#${codigo}`);
      await otra.getByText('Te invitaron a una sesión').waitFor();
      // The code leaves the address before anything else.
      assert.equal(new URL(otra.url()).hash, '');
      await otra.getByRole('button', { name: 'Entrar', exact: true }).click();
      await barra(pagina).getByRole('button', { name: 'Personas (2)' }).waitFor();
      // A message from the other: a notice here, which opens the chat.
      await enBarra(otra, 'Chat');
      await otra.getByLabel('Escribir en el chat').fill('¿Arrancamos con la pizarra?');
      await otra.getByLabel('Escribir en el chat').press('Enter');
      const aviso = pagina.locator('.envivo-aviso', { hasText: '¿Arrancamos con la pizarra?' });
      await aviso.waitFor();
      await barra(pagina).getByRole('button', { name: /^Chat\W*1 sin leer$/ }).waitFor();
      await aviso.getByRole('button', { name: 'Abrir el chat' }).click();
      await pagina.locator('.envivo-chat__texto', { hasText: '¿Arrancamos con la pizarra?' }).waitFor();
      await aviso.waitFor({ state: 'detached' });
      // Your own message is no notice.
      await pagina.getByLabel('Escribir en el chat').fill('Dale');
      await pagina.getByLabel('Escribir en el chat').press('Enter');
      await otra.locator('.envivo-chat__texto', { hasText: 'Dale' }).waitFor();
      assert.equal(await pagina.locator('.envivo-aviso').count(), 0);
      // Following: whatever tab the other opens, this one goes there.
      await enBarra(pagina, 'Personas (2)');
      await pagina.getByRole('button', { name: /^Seguir a / }).click();
      await otra.getByRole('button', { name: 'Documento' }).click();
      await enPestana(pagina, 'Documento');
      await chip(pagina).getByText(/^Siguiendo a /).waitFor();
      // Opened here, the caret is in it: «/» is text, not the site's search. «Título» changes that line.
      await otra.waitForFunction(() => document.activeElement?.classList.contains('ProseMirror'));
      await otra.keyboard.type('Temas / dudas');
      assert.equal(new URL(otra.url()).pathname.endsWith('/en-vivo'), true, 'la barra no sacó de la sesión');
      await otra.locator('.envivo-mesa__una:not([hidden]) .vh-barra').getByRole('button', { name: 'Título', exact: true }).click();
      await otra.locator('.vdoc-texto > h1:first-child', { hasText: 'Temas / dudas' }).waitFor();
      await pagina.locator('.vdoc-texto > h1:first-child', { hasText: 'Temas / dudas' }).waitFor();
      // With the focus nowhere, «/» stays on the table too.
      await otra.evaluate(() => document.activeElement?.blur());
      await otra.keyboard.press('/');
      await otra.locator('.envivo-barra').waitFor();
      await abrirHerramienta(otra, 'Pizarra');
      await enPestana(pagina, 'Pizarra');
      // Choosing a tab by hand stops following.
      await elegirPestana(pagina, 'Documento');
      await chip(pagina).waitFor({ state: 'detached' });
      // «Que me sigan todos»: the other one goes where whoever presents goes, until they go on their own.
      await enBarra(pagina, 'Personas (2)');
      await pagina.getByRole('button', { name: /^Seguir a / }).waitFor();
      await pagina.getByRole('button', { name: 'Que me sigan todos' }).click();
      await chip(otra).getByText(/ presenta$/).waitFor();
      await enPestana(otra, 'Documento');
      // Moving the document by hand lets go and stays on it, not on the tab it had before following (Pizarra).
      const hojaOtra = await otra.locator('.envivo-mesa__una:not([hidden]) .vdoc-hoja').boundingBox();
      await otra.mouse.move(hojaOtra.x + hojaOtra.width / 2, hojaOtra.y + hojaOtra.height / 2);
      await otra.mouse.wheel(0, 200);
      const volverASeguir = chip(otra).getByRole('button', { name: 'Volver a seguir' });
      await volverASeguir.waitFor();
      await enPestana(otra, 'Documento');
      await volverASeguir.click();
      await chip(otra).getByRole('button', { name: 'Ir por mi cuenta' }).waitFor();
      await elegirPestana(pagina, 'Pizarra');
      await enPestana(otra, 'Pizarra');
      await chip(otra).getByRole('button', { name: 'Ir por mi cuenta' }).click();
      await chip(otra).getByRole('button', { name: 'Volver a seguir' }).waitFor();
      await elegirPestana(pagina, 'Documento');
      await enPestana(otra, 'Pizarra');
      await chip(pagina).getByRole('button', { name: 'Dejar de presentar' }).click();
      await chip(otra).waitFor({ state: 'detached' });
      // The right click on the document: a small menu with what the bar does. Negrita goes for everyone.
      await pagina.locator('.vdoc-papel .ProseMirror').click();
      await pagina.keyboard.press('Control+End');
      await pagina.keyboard.press('Enter');
      await pagina.keyboard.type('Repasar parciales');
      await pagina.keyboard.press('Shift+Home');
      await pagina.locator('.vdoc-papel p', { hasText: 'Repasar parciales' }).click({ button: 'right', position: { x: 12, y: 8 } });
      const formato = pagina.getByRole('menu', { name: 'Formato' });
      await formato.waitFor();
      await pagina.waitForFunction(() => document.activeElement?.closest('[role=menu]') !== null);
      await formato.getByRole('menuitemcheckbox', { name: /^Negrita/ }).click();
      await formato.waitFor({ state: 'detached' });
      await pagina.locator('.vdoc-papel strong', { hasText: 'Repasar parciales' }).waitFor();
      await elegirPestana(otra, 'Documento');
      await otra.locator('.vdoc-papel strong', { hasText: 'Repasar parciales' }).waitFor();
      // From the keyboard too, and Escape gives the focus back to the text.
      await pagina.keyboard.press('Shift+F10');
      await formato.waitFor();
      await formato.getByRole('menuitemcheckbox', { name: /^Negrita/, checked: true }).waitFor();
      await pagina.keyboard.press('Escape');
      await formato.waitFor({ state: 'detached' });
      await pagina.waitForFunction(() => document.activeElement?.classList.contains('ProseMirror'));
      // Tipografía: a word in Kalam, from the bar's list (each name in its own typeface); the other sees it so.
      await pagina.keyboard.press('End');
      await pagina.keyboard.press('Control+Shift+ArrowLeft');
      const tipografia = pagina.locator('.vdoc-letras > summary');
      assert.equal(await tipografia.getAttribute('aria-label'), 'Tipografía: Barlow');
      await tipografia.click();
      const kalam = pagina.locator('.vdoc-letras').getByRole('button', { name: 'Kalam', exact: true });
      assert.match(await kalam.evaluate((b) => getComputedStyle(b).fontFamily), /^Kalam/);
      await kalam.click();
      await pagina.locator('.vdoc-letras > summary[aria-label="Tipografía: Kalam"]').waitFor();
      const enKalam = otra.locator('.vdoc-papel .vdoc-letra--kalam', { hasText: 'parciales' });
      await enKalam.waitFor();
      assert.match(await enKalam.evaluate((e) => getComputedStyle(e).fontFamily), /^Kalam/);
      // An empty block with one's caret in it (paragraph, code, title, list, quote): the other one writes there all the
      // same, and so does the first. Each starts in a new line at the end.
      const barraDoc = pagina.locator('.envivo-mesa__una:not([hidden]) .vh-barra');
      const lineaNueva = async () => {
        await pagina.locator('.vdoc-papel .ProseMirror').focus();
        await pagina.keyboard.press('Control+End');
        // The editor takes the new place from the browser's selectionchange, before Enter splits the line.
        await pagina.waitForFunction(() => getSelection().isCollapsed);
        await pagina.evaluate(() => new Promise((listo) => { requestAnimationFrame(() => setTimeout(listo)); }));
        await pagina.keyboard.press('Enter');
      };
      // After a block that is not a paragraph the document ends in an empty one.
      const alFinal = () => pagina.locator('.vdoc-texto > p:last-child').click();
      for (const [hacer, donde] of [
        [lineaNueva, '.vdoc-texto > p:last-child'],
        [async () => {
          await lineaNueva();
          await barraDoc.getByRole('button', { name: 'Bloque de código' }).click();
        }, '.vdoc-texto > pre:last-of-type'],
        [async () => {
          await alFinal();
          await barraDoc.getByRole('button', { name: 'Título', exact: true }).click();
        }, '.vdoc-texto > h1:last-of-type'],
        [async () => {
          await alFinal();
          await barraDoc.getByRole('button', { name: 'Lista', exact: true }).click();
        }, '.vdoc-texto > ul:last-of-type li'],
        [async () => {
          await alFinal();
          await pagina.keyboard.type('> ');
        }, '.vdoc-texto > blockquote:last-of-type'],
      ]) {
        await hacer();
        await otra.waitForFunction((d) => {
          const bloque = document.querySelector(d)?.cloneNode(true);
          if (!bloque?.querySelector('.vdoc-caret')) return false;
          bloque.querySelectorAll('.vdoc-caret').forEach((c) => c.remove());
          return bloque.textContent === '';
        }, donde);
        await otra.locator(donde).click();
        await otra.keyboard.type('x = 1');
        await pagina.locator(donde, { hasText: 'x = 1' }).waitFor();
        await pagina.keyboard.type('y');
        await otra.locator(donde, { hasText: /y/ }).waitFor();
      }
      // Diagrama de flujo: a shape of the bar dragged onto the sheet lands where it is dropped, with its ghost under the
      // pointer; a click still puts the next one below, joined.
      const enLaTab = (p) => p.locator('.envivo-mesa__una:not([hidden])');
      // From the «+» next to the tabs: the bar's own turns stay as the steps below expect them.
      await pagina.getByRole('button', { name: 'Abrir otra herramienta' }).first().click();
      await pagina.locator('.envivo-abrir').getByRole('button', { name: 'Diagrama de flujo', exact: true }).click();
      const pieza = await enLaTab(pagina).locator('.vh-barra').getByRole('button', { name: 'Proceso', exact: true }).boundingBox();
      const hojaFlujo = await enLaTab(pagina).locator('.vdia-lienzo').boundingBox();
      const destino = { x: hojaFlujo.x + 260, y: hojaFlujo.y + 160 };
      await pagina.mouse.move(pieza.x + pieza.width / 2, pieza.y + pieza.height / 2);
      await pagina.mouse.down();
      await pagina.mouse.move(destino.x, destino.y, { steps: 8 });
      await pagina.locator('.vflu-fantasma:not([data-fuera])').waitFor();
      await pagina.mouse.up();
      await pagina.locator('.vflu-fantasma').waitFor({ state: 'detached' });
      const soltada = await enLaTab(pagina).locator('.react-flow__node').boundingBox();
      assert.ok(Math.abs(soltada.x + soltada.width / 2 - destino.x) < 12 && Math.abs(soltada.y + soltada.height / 2 - destino.y) < 12, 'la forma cae donde se suelta');
      const escribiendoForma = () => pagina.waitForFunction(() => document.activeElement?.classList.contains('vflu-escribir'));
      await escribiendoForma();
      await pagina.keyboard.type('Leer n');
      await pagina.keyboard.press('Enter');
      await enLaTab(pagina).locator('.vh-barra').getByRole('button', { name: 'Proceso', exact: true }).click();
      await escribiendoForma();
      await pagina.keyboard.type('Sumar');
      await pagina.keyboard.press('Enter');
      // The arrow made dashed from its menu: everyone sees it so. Straight down, its box has no width: Playwright calls
      // it hidden.
      const trazo = enLaTab(pagina).locator('.react-flow__edge-path');
      await trazo.waitFor({ state: 'attached' });
      const caja = await trazo.boundingBox();
      await pagina.mouse.click(caja.x + caja.width / 2, caja.y + caja.height / 2, { button: 'right' });
      await pagina.getByRole('menu', { name: 'Flecha' }).getByRole('menuitemradio', { name: 'De guiones' }).click();
      await elegirPestana(otra, 'Diagrama de flujo');
      await otra.waitForFunction(() => {
        const camino = document.querySelector('.envivo-mesa__una:not([hidden]) .react-flow__edge-path');
        return camino && getComputedStyle(camino).strokeDasharray !== 'none';
      });
      // Pizarra: a text already written, touched with Texto, is written again where it is; the other sees the new one.
      await elegirPestana(pagina, 'Pizarra');
      await enLaTab(pagina).getByRole('button', { name: 'Texto', exact: true }).click();
      const hojaPiz = await enLaTab(pagina).locator('.vpiz-hoja').boundingBox();
      await pagina.mouse.click(hojaPiz.x + 160, hojaPiz.y + 120);
      await pagina.keyboard.type('Primer parcial');
      await pagina.keyboard.press('Enter');
      const escrito = await enLaTab(pagina).locator('.vpiz-texto', { hasText: 'Primer parcial' }).boundingBox();
      await pagina.mouse.click(escrito.x + 12, escrito.y + escrito.height / 2);
      const deNuevo = enLaTab(pagina).getByLabel('Texto de la pizarra');
      assert.equal(await deNuevo.inputValue(), 'Primer parcial');
      await deNuevo.fill('Segundo parcial');
      await pagina.keyboard.press('Enter');
      await elegirPestana(otra, 'Pizarra');
      await enLaTab(otra).locator('.vpiz-texto', { hasText: 'Segundo parcial' }).waitFor();
      assert.equal(await enLaTab(otra).locator('.vpiz-texto', { hasText: 'parcial' }).count(), 1, 'el texto cambió, no se sumó otro');
      // Two strokes chosen together with Mover's rectangle and dragged: the other sees both moved, then Supr deletes both.
      const trazosDe = (quien) => quien.locator('.envivo-mesa__una:not([hidden]) .vpiz-svg > g > path');
      await enLaTab(pagina).getByRole('button', { name: 'Lápiz', exact: true }).click();
      for (const y of [220, 270]) {
        await pagina.mouse.move(hojaPiz.x + 300, hojaPiz.y + y);
        await pagina.mouse.down();
        await pagina.mouse.move(hojaPiz.x + 380, hojaPiz.y + y + 10, { steps: 6 });
        await pagina.mouse.up();
      }
      await otra.waitForFunction(() => document.querySelectorAll('.envivo-mesa__una:not([hidden]) .vpiz-svg > g > path').length === 2);
      const antesDeMover = await trazosDe(otra).evaluateAll((ps) => ps.map((t) => t.getAttribute('d')));
      await enLaTab(pagina).getByRole('button', { name: 'Mover', exact: true }).click();
      await pagina.mouse.move(hojaPiz.x + 270, hojaPiz.y + 195);
      await pagina.mouse.down();
      await pagina.mouse.move(hojaPiz.x + 410, hojaPiz.y + 305, { steps: 8 });
      await pagina.mouse.up();
      assert.equal(await enLaTab(pagina).locator('.vpiz-elegido').count(), 2, 'el rectángulo eligió los dos trazos');
      await pagina.mouse.move(hojaPiz.x + 340, hojaPiz.y + 225);
      await pagina.mouse.down();
      await pagina.mouse.move(hojaPiz.x + 420, hojaPiz.y + 265, { steps: 8 });
      await pagina.mouse.up();
      await otra.waitForFunction((antes) => {
        const ahora = [...document.querySelectorAll('.envivo-mesa__una:not([hidden]) .vpiz-svg > g > path')].map((t) => t.getAttribute('d'));
        return ahora.length === 2 && ahora.every((d) => !antes.includes(d));
      }, antesDeMover);
      // The right button dragged moves the view, with any tool, and opens no menu; a right click still opens it.
      const antesDeArrastrar = await trazosDe(pagina).first().boundingBox();
      await pagina.mouse.move(hojaPiz.x + 120, hojaPiz.y + 320);
      await pagina.mouse.down({ button: 'right' });
      await pagina.mouse.move(hojaPiz.x + 180, hojaPiz.y + 360, { steps: 8 });
      await pagina.mouse.up({ button: 'right' });
      await pagina.waitForTimeout(300);
      assert.equal(await pagina.getByRole('menu').count(), 0, 'arrastrar con el botón derecho no abre el menú');
      const trasArrastrar = await trazosDe(pagina).first().boundingBox();
      assert.ok(Math.abs(trasArrastrar.x - antesDeArrastrar.x - 60) < 2 && Math.abs(trasArrastrar.y - antesDeArrastrar.y - 40) < 2, 'la vista se movió con el botón derecho');
      await pagina.mouse.click(hojaPiz.x + 120, hojaPiz.y + 320, { button: 'right' });
      await pagina.getByRole('menu', { name: 'Pizarra' }).waitFor();
      await pagina.keyboard.press('Escape');
      await pagina.getByRole('menu').waitFor({ state: 'detached' });
      await enLaTab(pagina).locator('.vpiz-hoja').focus();
      await pagina.keyboard.press('Delete');
      await otra.waitForFunction(() => document.querySelectorAll('.envivo-mesa__una:not([hidden]) .vpiz-svg > g > path').length === 0);
      await elegirPestana(pagina, 'Documento');
      // Full screen: the table alone, and back. The browser gives it only to the tab in front.
      await pagina.bringToFront();
      await enBarra(pagina, 'Pantalla completa');
      await barra(pagina).getByRole('button', { name: 'Pantalla completa', pressed: true }).waitFor();
      await enBarra(pagina, 'Pantalla completa');
      await barra(pagina).getByRole('button', { name: 'Pantalla completa', pressed: false }).waitFor();
      // «Abrir» brings things from outside the table: a file of a course, as an Apunte for everyone.
      await enBarra(pagina, 'Abrir otra herramienta');
      await pagina.locator('.envivo-abrir').getByRole('button', { name: 'De tus materias' }).click();
      await pagina.waitForFunction((t) => document.activeElement?.textContent === t, 'Volver');
      await pagina.locator('.envivo-paso').getByRole('button', { name: 'Materia A' }).click();
      await pagina.getByLabel('Buscar un archivo').fill('apunte');
      await pagina.locator('.envivo-paso__archivo', { hasText: 'Apunte uno' }).click();
      await enPestana(pagina, 'Apunte uno');
      await otra.getByRole('tab', { name: /^Apunte uno/ }).waitFor();
      // It opens in the site's reader, with all it has; what one highlights the other sees, in its author's color, and
      // nothing of it goes to the student's things.
      const enVista = (p) => p.locator('.envivo-mesa__una:not([hidden])');
      const resaltadosGuardados = () => pagina.evaluate(() => Object.values(localStorage).join('').split('"cajas"').length);
      const guardadosAntes = await resaltadosGuardados();
      await enVista(pagina).getByRole('button', { name: 'Buscar en el documento' }).waitFor();
      await enVista(pagina).locator('.lector__pagina[data-pagina="1"] .textLayer span').first().waitFor();
      await pagina.evaluate(() => getSelection().selectAllChildren(document.querySelector('.envivo-mesa__una:not([hidden]) .lector__pagina[data-pagina="1"] .textLayer span')));
      await enVista(pagina).locator('.lector__barra-sel').getByRole('button', { name: 'Resaltar' }).click();
      await otra.bringToFront();
      await elegirPestana(otra, 'Apunte uno');
      await enVista(otra).locator('.lector__resaltado--autor').waitFor();
      await pagina.bringToFront();
      assert.equal(await resaltadosGuardados(), guardadosAntes, 'lo resaltado en la mesa no va a lo del alumno');
      // A reload is not leaving: for the others it is the same person (never twice), the table is on its way and never
      // «vacía», and the Apunte they shared comes back to them from whoever has it open.
      await pagina.addInitScript(() => {
        window.__mesaVacia = false;
        new MutationObserver(() => {
          if (document.querySelector('.envivo-mesa__vacia')) window.__mesaVacia = true;
        }).observe(document, { childList: true, subtree: true });
      });
      await otra.evaluate(() => {
        window.__dosVeces = false;
        window.__vigia = setInterval(() => {
          const personas = [...document.querySelectorAll('.envivo-barra button')].map((b) => `${b.textContent} ${b.getAttribute('aria-label') ?? ''}`);
          if (personas.some((t) => /Personas \(3\)/.test(t))) window.__dosVeces = true;
        }, 50);
      });
      // A PDF from the computer that the other never opens before the reload: it goes to everyone all the same.
      await pagina.locator('input[type="file"][accept="application/pdf,image/*"]').setInputFiles({ name: 'Subido.pdf', mimeType: 'application/pdf', buffer: PDF_APUNTE });
      await otra.getByRole('tab', { name: /^Subido/ }).waitFor();
      const trabada = (p) => p.getByText('Esta pestaña se trabó').count();
      await pagina.waitForTimeout(1500);
      await pagina.reload();
      await pagina.getByRole('tab', { name: /^Apunte uno/ }).waitFor();
      assert.equal(await pagina.evaluate(() => window.__mesaVacia), false, 'al recargar, la mesa no aparece vacía');
      // The other opens it for the first time after the reload: it is there, from their own copy.
      await otra.bringToFront();
      await elegirPestana(otra, 'Subido');
      await enVista(otra).locator('.lector__pagina[data-pagina="1"] .textLayer span').first().waitFor({ timeout: 20000 });
      assert.equal(await trabada(otra), 0, 'la pestaña de quien recargó no se traba');
      // And whoever shared it gets it back from the other, without doing anything.
      await pagina.bringToFront();
      await elegirPestana(pagina, 'Subido');
      await enVista(pagina).locator('.lector__pagina[data-pagina="1"] .textLayer span').first().waitFor({ timeout: 20000 });
      assert.equal(await trabada(pagina), 0);
      await elegirPestana(pagina, 'Apunte uno');
      await enVista(pagina).locator('.lector__pagina[data-pagina="1"] .textLayer span').first().waitFor({ timeout: 20000 });
      await barra(otra).getByRole('button', { name: 'Personas (2)' }).waitFor();
      // Past the beat of the page before the reload.
      await pagina.waitForTimeout(3500);
      assert.equal(await otra.evaluate(() => {
        clearInterval(window.__vigia);
        return window.__dosVeces;
      }), false, 'quien recargó no aparece dos veces');
      assert.equal(await otra.getByText('se fue de la sesión').count(), 0);
      // And a summary of El Santo Resumen, read by each browser from El Santo Resumen itself. An interactive one runs in
      // El Santo Resumen's reader, as in Resúmenes.
      SANTO_BANCO[1].js = true;
      // Linked to El Santo Resumen (mocked), its «me gusta» is the same as in Resúmenes.
      const teniaLlave = santoCvg.llaves.has(CVG_LLAVE);
      santoCvg.llaves.add(CVG_LLAVE);
      const vinculoAntes = await pagina.evaluate(() => localStorage.getItem('cl.santo.5'));
      await pagina.evaluate((llave) => localStorage.setItem('cl.santo.5', JSON.stringify({ llave, usuario: 'santi' })), CVG_LLAVE);
      await enBarra(pagina, 'Abrir otra herramienta');
      await pagina.locator('.envivo-abrir').getByRole('button', { name: 'Del Santo Resumen' }).click();
      await pagina.locator('.envivo-paso__archivo', { hasText: 'Final con teoría' }).click();
      await enPestana(pagina, 'Final con teoría');
      await otra.getByRole('tab', { name: /^Final con teoría/ }).waitFor();
      await enVista(pagina).frameLocator('.visor__marco--scripts').frameLocator('#m').getByText('Armado por sus scripts').waitFor();
      assert.notEqual(await pagina.title(), 'robado');
      SANTO_BANCO[1].js = false;
      // Under the title, what the site shows: subject, instance and author, from El Santo Resumen's bank.
      assert.equal(await enVista(pagina).locator('.visor__dato').textContent(), 'Sistemas Operativos, Final, de ana');
      const gustaMesa = enVista(pagina).getByRole('button', { name: /me gusta, Final con teoría$/ });
      await enVista(pagina).locator('button.megusta:not([aria-disabled])').waitFor();
      const antesGusta = await gustaMesa.getAttribute('aria-pressed');
      for (const si of [antesGusta !== 'true', antesGusta === 'true']) {
        await Promise.all([pagina.waitForResponse((r) => r.url().includes('a=cvg-me-gusta') && r.request().method() === 'POST'), gustaMesa.click()]);
        await enVista(pagina).locator(`.megusta[aria-pressed="${si}"]:not([aria-disabled])`).waitFor();
      }
      await pagina.evaluate((v) => (v === null ? localStorage.removeItem('cl.santo.5') : localStorage.setItem('cl.santo.5', v)), vinculoAntes);
      if (!teniaLlave) santoCvg.llaves.delete(CVG_LLAVE);
      // Over the summary's frame the table hears no mouse: its bottom edge brings the bar back.
      const marco = await enVista(pagina).locator('.visor__marco--scripts').boundingBox();
      await pagina.mouse.move(marco.x + marco.width / 2, marco.y + marco.height / 2);
      await pagina.locator('.envivo-barra[data-oculta]').waitFor({ state: 'attached', timeout: 8000 });
      const bajo = await pagina.evaluate((x) => document.elementFromPoint(x, innerHeight - 4)?.className, marco.x + marco.width / 2);
      assert.equal(bajo, 'envivo-mesa__borde', 'el borde de abajo, sobre el resumen');
      await pagina.mouse.move(marco.x + marco.width / 2, (await pagina.evaluate(() => innerHeight)) - 4, { steps: 3 });
      await pagina.locator('.envivo-barra:not([data-oculta])').waitFor({ state: 'attached' });
      // A clean HTML (by its subject, the bank comes again, without scripts): where one points inside its frame, the
      // other sees it on the same heading, over their own frame. It goes when the pointer leaves the summary.
      await enBarra(pagina, 'Abrir otra herramienta');
      await pagina.locator('.envivo-abrir').getByRole('button', { name: 'Del Santo Resumen' }).click();
      await pagina.locator('.envivo-paso__filtros select').selectOption(SO);
      await pagina.locator('.envivo-paso__archivo', { hasText: 'Final con teoría' }).click();
      const limpio = (p) => enVista(p).frameLocator('.visor__marco:not(.visor__marco--scripts)').getByRole('heading', { name: 'Semáforos y monitores' });
      await limpio(pagina).waitFor();
      await otra.bringToFront();
      // The second tab of that summary, once it reached this one: before, the last is the first.
      await otra.getByRole('tab', { name: /^Final con teoría/ }).nth(1).click();
      await limpio(otra).waitFor();
      await pagina.bringToFront();
      const titular = await limpio(pagina).boundingBox();
      await pagina.mouse.move(titular.x + titular.width / 3, titular.y + titular.height / 2, { steps: 4 });
      await otra.bringToFront();
      const dedo = enVista(otra).locator('.resumen-vivo__dedos .apunte-vivo__dedo');
      await dedo.waitFor();
      const [enOtra, punto] = [await limpio(otra).boundingBox(), await dedo.boundingBox()];
      const centro = { x: punto.x + punto.width / 2, y: punto.y + punto.height / 2 };
      assert.ok(centro.x >= enOtra.x && centro.x <= enOtra.x + enOtra.width && centro.y >= enOtra.y && centro.y <= enOtra.y + enOtra.height, 'el puntero de uno, sobre el mismo título en la pantalla del otro');
      await pagina.bringToFront();
      await pagina.mouse.move(titular.x, 2, { steps: 3 });
      await otra.bringToFront();
      await dedo.waitFor({ state: 'detached' });
      await pagina.bringToFront();
      // «Volver» goes back to the tools, with the focus on what opened the step; Escape closes the box.
      await enBarra(pagina, 'Abrir otra herramienta');
      assert.equal(await pagina.locator('.envivo-abrir').getByRole('button', { name: 'Consultron' }).count(), 0, 'Consultron no es una pestaña');
      await pagina.locator('.envivo-abrir').getByRole('button', { name: 'De tus materias' }).click();
      await pagina.locator('.envivo-paso').getByRole('button', { name: 'Volver' }).click();
      await pagina.waitForFunction((t) => document.activeElement?.textContent === t, 'De tus materias');
      await pagina.keyboard.press('Escape');
      await pagina.locator('.envivo-abrir').waitFor({ state: 'detached' });
      // Consultron opens at the side, with the whole thread and where to ask; Escape gives the focus back to its button.
      await enBarra(pagina, 'Consultron');
      await pagina.locator('.envivo-lado--consultron').getByLabel('Tu pregunta').waitFor();
      await pagina.keyboard.press('Escape');
      await pagina.locator('.envivo-lado--consultron').waitFor({ state: 'detached' });
      await pagina.waitForFunction((t) => document.activeElement?.textContent === t, 'Consultron');
      // The Laboratorio too: an empty line with one's caret in it, the other one writes there all the same.
      await pagina.getByRole('button', { name: 'Abrir otra herramienta' }).first().click();
      await pagina.locator('.envivo-abrir').getByRole('button', { name: 'Laboratorio', exact: true }).click();
      await enPestana(pagina, 'Laboratorio');
      await elegirPestana(otra, 'Laboratorio');
      const codigoDe = (p) => p.locator('.envivo-mesa__una:not([hidden]) .cm-content');
      await codigoDe(pagina).click();
      await pagina.keyboard.press('Control+End');
      await pagina.keyboard.press('Enter');
      const lineaOtra = codigoDe(otra).locator('.cm-line').last();
      await lineaOtra.locator('.cm-ySelectionCaret').waitFor({ state: 'attached' });
      await lineaOtra.click();
      await otra.keyboard.type('x = 1');
      await codigoDe(pagina).locator('.cm-line', { hasText: 'x = 1' }).waitFor();
      await pagina.keyboard.type('y');
      await codigoDe(otra).locator('.cm-line', { hasText: /y/ }).waitFor();
      // The other's name over their caret is drawn, never text: the whole file written over at once (as the browser
      // does with a long insert) keeps none of it, here or there. Copying it gives only the code.
      await otra.keyboard.press('Control+End');
      await codigoDe(pagina).locator('.cm-ySelectionCaret[data-nombre]').waitFor({ state: 'attached' });
      assert.equal((await codigoDe(pagina).innerText()).includes('\u2060'), false);
      await pagina.keyboard.press('Control+a');
      await pagina.keyboard.insertText('x = 1\r\n\r\nprint(x)\r\nprint(x + 1)');
      const sinNombre = 'x = 1\n\nprint(x)\nprint(x + 1)';
      const textoDe = (p) => codigoDe(p).evaluate((c) => c.cmView?.view?.state.doc.toString() ?? c.cmTile?.view?.state.doc.toString());
      await otra.waitForFunction((esperado) => {
        const c = document.querySelector('.envivo-mesa__una:not([hidden]) .cm-content');
        return (c?.cmView?.view ?? c?.cmTile?.view)?.state.doc.toString() === esperado;
      }, sinNombre);
      assert.equal(await textoDe(pagina), sinNombre);
      await pagina.keyboard.press('Control+a');
      await pagina.keyboard.press('Control+c');
      assert.equal(await pagina.evaluate(() => navigator.clipboard.readText()), sinNombre);
      // A DER of the table is drawn together: what one adds the other sees, with their pointer on the sheet.
      const labDe = (p) => enVista(p).locator('.ev-lab');
      await labDe(pagina).getByRole('button', { name: 'Nuevo proyecto' }).click();
      await labDe(pagina).getByLabel('Nombre del proyecto nuevo').fill('Diagramas');
      await labDe(pagina).locator('select[name="lenguaje"]').selectOption('sql');
      await labDe(pagina).getByRole('button', { name: 'Crear', exact: true }).click();
      await labDe(pagina).getByRole('button', { name: 'Nuevo archivo en Diagramas' }).click();
      await labDe(pagina).getByLabel('Nombre del archivo nuevo de Diagramas').fill('tienda.der');
      await pagina.keyboard.press('Enter');
      await labDe(pagina).locator('.der').getByRole('button', { name: 'Entidad', exact: true }).click();
      await labDe(pagina).locator('.der-ficha [data-der-nombre]').fill('cliente');
      await labDe(otra).locator('.lab-explorador').getByRole('button', { name: 'tienda.der', exact: true }).click();
      await labDe(otra).locator('.react-flow__node[aria-label^="Entidad cliente"]').waitFor();
      {
        const hoja = await labDe(otra).locator('.der-hoja').boundingBox();
        await otra.bringToFront();
        await otra.mouse.move(hoja.x + hoja.width / 2, hoja.y + hoja.height / 2, { steps: 4 });
        await otra.mouse.move(hoja.x + hoja.width / 2 + 30, hoja.y + hoja.height / 2 + 20, { steps: 4 });
      }
      await pagina.bringToFront();
      await labDe(pagina).locator('.der-puntero').waitFor();
      // Back to the code, for what follows.
      for (const p of [pagina, otra]) await labDe(p).locator('.lab-explorador').getByRole('button', { name: /^main\.py\b/ }).click();
      // The others' pointers, in every tool with a place to point: on the calculator, over the same field however its
      // sheet wraps in each window, and gone when the pointer leaves it; on the whiteboard and the flowchart; the
      // document's caret.
      await pagina.getByRole('button', { name: 'Abrir otra herramienta' }).first().click();
      await pagina.locator('.envivo-abrir').getByRole('button', { name: 'Calculadora', exact: true }).click();
      await enPestana(pagina, 'Calculadora');
      await enVista(pagina).locator('.ev-calc__cual').selectOption('matriz');
      await elegirPestana(otra, 'Calculadora');
      const campoCalc = (p) => enVista(p).locator('.ev-calc__hoja input').first();
      await campoCalc(otra).waitFor();
      await pagina.bringToFront();
      const enCampo = await campoCalc(pagina).boundingBox();
      await pagina.mouse.move(enCampo.x + enCampo.width / 2, enCampo.y + enCampo.height / 2, { steps: 4 });
      await otra.bringToFront();
      const dedoCalc = enVista(otra).locator('.ev-calc .apunte-vivo__dedo');
      await dedoCalc.waitFor();
      {
        const [campo, punto] = [await campoCalc(otra).boundingBox(), await dedoCalc.boundingBox()];
        const centro = { x: punto.x + punto.width / 2, y: punto.y + punto.height / 2 };
        assert.ok(centro.x >= campo.x && centro.x <= campo.x + campo.width && centro.y >= campo.y && centro.y <= campo.y + campo.height, 'el puntero de uno, sobre el mismo campo de la calculadora del otro');
      }
      await pagina.bringToFront();
      await pagina.mouse.move(enCampo.x, 2, { steps: 3 });
      await otra.bringToFront();
      await dedoCalc.waitFor({ state: 'detached' });
      const sobre = async (p, selector) => {
        const caja = await enVista(p).locator(selector).first().boundingBox();
        await p.bringToFront();
        await p.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2, { steps: 4 });
        await p.mouse.move(caja.x + caja.width / 2 + 20, caja.y + caja.height / 2 + 10, { steps: 4 });
      };
      for (const [titulo, lienzo, puntero] of [['Pizarra', '.vpiz-hoja', '.vpiz-puntero'], ['Diagrama de flujo', '.vdia-lienzo', '.vdia-puntero']]) {
        await elegirPestana(pagina, titulo);
        await elegirPestana(otra, titulo);
        await sobre(pagina, lienzo);
        await otra.bringToFront();
        await enVista(otra).locator(puntero).waitFor();
      }
      await elegirPestana(pagina, 'Documento');
      await elegirPestana(otra, 'Documento');
      await pagina.bringToFront();
      await enVista(pagina).locator('.vdoc-papel .ProseMirror').click();
      await otra.bringToFront();
      await enVista(otra).locator('.vdoc-caret').waitFor({ state: 'attached' });
      // A tab closed by one closes for everyone; whoever was on it is told who and which.
      await elegirPestana(pagina, 'Pizarra');
      await otra.bringToFront();
      await otra.getByRole('tab', { name: /^Pizarra/ }).focus();
      await otra.keyboard.press('Delete');
      await dialogo(otra, 'Cerrar pestaña');
      await pagina.getByRole('tab', { name: /^Pizarra/ }).waitFor({ state: 'detached' });
      await pagina.locator('.envivo-aviso', { hasText: 'Cerró «Pizarra».' }).waitFor();
      await enBarra(otra, 'Salir');
      await dialogo(otra, 'Salir de la sesión');
      await otra.getByRole('button', { name: 'Entrar', exact: true }).waitFor();
      await enBarra(pagina, 'Personas');
      await pagina.getByText('Pasale el código a quien quieras sumar.').waitFor();
      await pagina.keyboard.press('Escape');
    } finally {
      await otra.close();
    }
    // «Guardar en lo mío»: the code of the session goes to the student's Laboratorio, exact.
    // The Laboratorio tab is already open (the carets step above opened it).
    await elegirPestana(pagina, 'Laboratorio');
    // It is the site's Laboratorio itself, its files those of the table: steps, cases and timings with Python.
    const enLaMesa = pagina.locator('.envivo-mesa__una:not([hidden]) .ev-lab');
    await enLaMesa.getByRole('button', { name: 'Paso a paso' }).waitFor();
    await enLaMesa.getByRole('tab', { name: 'Medir tiempos' }).waitFor();
    await enLaMesa.getByRole('tab', { name: 'Casos' }).waitFor();
    await enLaMesa.getByRole('heading', { name: 'Carpeta compartida' }).waitFor();
    await fin('envivo-laboratorio');
    const editor = pagina.locator('.envivo-mesa__una:not([hidden]) .cm-content');
    await editor.click();
    await pagina.keyboard.type('print("de la sesión")');
    await enBarra(pagina, 'Guardar en lo mío');
    await pagina.locator('.envivo-guardar').getByRole('button', { name: 'Guardar', exact: true }).click();
    await pagina.getByText('Quedó en tu').waitFor();
    const enLab = await pagina.evaluate(() => Object.entries(localStorage).filter(([k]) => k.startsWith('cl.mio.')).map(([, v]) => v).join(''));
    assert.ok(enLab.includes('print(\\"de la sesión\\")') || enLab.includes('de la sesión'), 'el código quedó en el Laboratorio');
    await pagina.getByRole('button', { name: 'Listo' }).click();
    // The folder takes more projects, each with its language, also from a zip.
    await enLaMesa.getByRole('button', { name: 'Nuevo proyecto' }).click();
    await enLaMesa.getByLabel('Nombre del proyecto nuevo').fill('Consultas');
    await enLaMesa.locator('select[name="lenguaje"]').selectOption('sql');
    await enLaMesa.getByRole('button', { name: 'Crear' }).click();
    await enLaMesa.locator('.lab-explorador').getByText('Consultas', { exact: true }).waitFor();
    await enLaMesa.getByRole('button', { name: 'Subir zip' }).waitFor();
    await fin('envivo-laboratorio-proyectos');
    // «Terminar para todos»: the one who made it ends it, and whoever is in leaves too, told who ended it.
    const ultima = await contexto.newPage();
    await ultima.addInitScript((datos) => {
      if (!sessionStorage.length) Object.entries(datos).forEach(([k, v]) => sessionStorage.setItem(k, v));
    }, guardado);
    try {
      await ultima.goto(`${base}en-vivo#${codigo}`);
      await ultima.getByRole('button', { name: 'Entrar', exact: true }).click();
      await barra(ultima).waitFor();
      await barra(pagina).getByRole('button', { name: 'Personas (2)' }).waitFor();
      // Whoever made it leaves and comes back from «Tus sesiones»: still the one who made it, for the others too.
      await pagina.bringToFront();
      await enBarra(pagina, 'Salir');
      await pagina.locator('.envivo-panel').getByRole('button', { name: 'Salir de la sesión' }).click();
      await dialogo(pagina, 'Salir de la sesión');
      await pagina.locator('.envivo-guardadas').getByRole('button', { name: /^Volver a / }).first().click();
      await barra(pagina).getByRole('button', { name: 'Personas (2)' }).waitFor();
      await ultima.bringToFront();
      await enBarra(ultima, 'Personas (2)');
      await ultima.locator('.envivo-panel').getByText('armó la sesión').waitFor();
      await ultima.keyboard.press('Escape');
      await pagina.bringToFront();
      await enBarra(pagina, 'Salir');
      await pagina.locator('.envivo-panel').getByRole('button', { name: 'Terminar para todos' }).click();
      // The table stays kept for everyone, as the confirmation says (checked below, back with the code).
      await pagina.locator('dialog').getByText('Queda en «Tus sesiones» de cada uno.').waitFor();
      await dialogo(pagina, 'Terminar');
      await ultima.locator('.avisos').getByText(/^.+ terminó la sesión\.$/).waitFor();
      await barra(ultima).waitFor({ state: 'detached' });
      assert.equal(await ultima.evaluate(() => sessionStorage.getItem('cl.envivo')), null);
    } finally {
      await ultima.close();
    }
    await pagina.getByRole('button', { name: 'Armar sesión' }).waitFor();
    assert.equal(await pagina.evaluate(() => sessionStorage.getItem('cl.envivo')), null);
    // Out of the table, the site is back.
    assert.equal(await pagina.locator('.cabecera').isVisible(), true);
    // The table was kept in this browser. The session ended, so it does not open again: its copy opens in a new one,
    // with the document and the Laboratorio's folder.
    const guardadas = pagina.locator('.envivo-guardadas');
    await guardadas.getByRole('heading', { name: 'Tus sesiones' }).waitFor();
    await guardadas.getByText(/^La terminaste el /).first().waitFor();
    assert.equal(await guardadas.getByRole('button', { name: /^Volver/ }).count(), 0, 'una sesión terminada no se vuelve a abrir');
    await fin('envivo-guardadas');
    await guardadas.getByRole('button', { name: /^Abrir la copia/ }).first().click();
    await barra(pagina).waitFor();
    await pagina.locator('.avisos').getByText('Esa sesión terminó. Esta es tu copia, con otro código.').waitFor();
    await enBarra(pagina, 'Invitar');
    assert.notEqual((await pagina.locator('.envivo-invitar__clave').textContent()).trim(), codigo, 'la copia tiene otro código');
    await pagina.keyboard.press('Escape');
    await elegirPestana(pagina, 'Documento');
    await pagina.locator('.vdoc-papel strong', { hasText: 'Repasar parciales' }).waitFor({ timeout: 15000 });
    await elegirPestana(pagina, 'Laboratorio');
    await enLaMesa.locator('.lab-explorador').getByText('Consultas', { exact: true }).waitFor();
    await enLaMesa.locator('.cm-content', { hasText: 'de la sesión' }).first().waitFor();
    // The old chat came with it, already read.
    assert.equal(await pagina.locator('.envivo-aviso').count(), 0, 'el chat guardado no avisa como nuevo');
    // The copy is this student's own session: they can end it too.
    await enBarra(pagina, 'Salir');
    await pagina.locator('.envivo-panel').getByRole('button', { name: 'Terminar para todos' }).waitFor();
    await pagina.locator('.envivo-panel').getByRole('button', { name: 'Salir de la sesión' }).click();
    await dialogo(pagina, 'Salir de la sesión');
    // Forgotten, after «¿Seguro?».
    await guardadas.getByRole('button', { name: /^Borrar/ }).first().click();
    await dialogo(pagina, 'Borrar');
    await guardadas.waitFor({ state: 'detached' });
  });

  await prueba('durante todo el recorrido', async () => {
    const conClave = pedidos.filter((p) => p.url.includes(TOKEN) || p.url.includes(CONTRASENA));
    assert.deepEqual(conClave, [], 'la clave o la contraseña en una URL');
    // Only the file of «Entrar con Google», to the hidden folder of the student's own Drive, once they turned it on.
    const aSuDrive = (p) => p.url.startsWith('https://www.googleapis.com/upload/drive/v3/files') && p.cuerpo.includes(`"campus":"${TOKEN}"`) && !p.cuerpo.includes(CONTRASENA);
    const fuera = pedidos.filter((p) => (p.cuerpo.includes(TOKEN) || p.cuerpo.includes(CONTRASENA)) && !p.url.startsWith(CAMPUS) && !aSuDrive(p));
    assert.deepEqual(fuera, [], 'la clave o la contraseña fuera del campus');
    assert.deepEqual([...sinSimular], [], 'funciones del campus sin simular');
    const funciones = new Set(pedidos.map((p) => new URLSearchParams(p.cuerpo).get('wsfunction')).filter(Boolean));
    // Reading only, but for the one enrolment the student confirmed (Inscripción).
    for (const f of funciones) assert.ok(/_get_|site_info/.test(f) || f === 'core_course_search_courses' || f === 'enrol_self_enrol_user' || f === 'mod_assign_save_submission' || f === 'mod_assign_submit_for_grading' || f === 'core_message_message_search_users' || f === 'core_message_send_messages_to_conversation' || f === 'core_message_send_instant_messages' || f === 'core_message_mark_all_conversation_messages_as_read', f);
    // The bell asks its count and its list, and never marks a notification as read in the campus.
    assert.ok(funciones.has('message_popup_get_unread_popup_notification_count') && funciones.has('message_popup_get_popup_notifications'), 'la campana');
    assert.deepEqual([...funciones].filter((f) => /^core_message_mark_(?:notification_read|all_notifications_as_read)$/.test(f)), [], 'una notificación marcada leída');
    // Quizzes, read only: never started, continued, saved nor logged as seen from here.
    for (const f of funciones) if (f.startsWith('mod_quiz_')) assert.ok(f.startsWith('mod_quiz_get_'), f);
    assert.ok(funciones.has('mod_quiz_get_attempt_review'), 'la revisión de un cuestionario se pidió');
    const destinos = new Set(pedidos.map((p) => new URL(p.url).hostname));
    assert.deepEqual([...destinos].sort(), ['accounts.google.com', 'classroom.googleapis.com', 'demo.lutastudios.com', 'drive.google.com', 'frro.cvg.utn.edu.ar', 'i.ytimg.com', 'lomhlulbgfovtnljbqzp.supabase.co', 'lutastudios.com', 'oauth2.googleapis.com', 'spltnoksgdkbaamskuau.supabase.co', 'www.googleapis.com', 'www.youtube.com'], [...destinos].sort().join(', '));
    // Only opinions go to the panel, and only what the student wrote.
    const alPanel = pedidos.filter((p) => new URL(p.url).hostname === 'spltnoksgdkbaamskuau.supabase.co');
    assert.deepEqual(alPanel.filter((p) => p.url !== OPINIONES || !/^\{"tipo":"opinion","texto":"[^"]*"\}$/.test(p.cuerpo)), [], 'al panel solo opiniones');
    // The Google permission goes only to Classroom and Drive, in their header, and to Google to cancel it.
    const conPermiso = pedidos.filter((p) => JSON.stringify(p).includes(GTOKEN));
    assert.ok(conPermiso.length > 0);
    assert.deepEqual(conPermiso.filter((p) => !((p.url.startsWith(`${CLASSROOM}/`) || p.url.startsWith('https://www.googleapis.com/')) && p.cabeceras.authorization === `Bearer ${GTOKEN}` && !p.url.includes(GTOKEN)) && p.url !== 'https://oauth2.googleapis.com/revoke'), [], 'el permiso de Google fuera de Google');
    const aGoogle = pedidos.filter((p) => /(^|\.)google(apis)?\.com$/.test(new URL(p.url).hostname));
    assert.deepEqual(aGoogle.filter((p) => (JSON.stringify(p).includes(TOKEN) && !aSuDrive(p)) || JSON.stringify(p).includes(CONTRASENA)), [], 'la clave del campus en Google');
    // A summary's own scripts blocked by its frame's sandbox is the sandbox doing its job (SANTO_HTML carries a script
    // and an onerror on purpose; that they never ran is checked by the stolen-title asserts).
    const reales = errores.filter((e) => !/Failed to load resource/.test(e) && !/^Blocked script execution in 'about:srcdoc' because the document's frame is sandboxed/.test(e));
    assert.deepEqual([...new Set(reales)], [], 'errores de consola, incluida la CSP');
  });
} finally {
  await navegador.close();
  cerrar();
}

const fallas = resultados.filter((r) => !r).length;
console.log(`\n${resultados.length - fallas} de ${resultados.length} pasaron`);
process.exitCode = fallas ? 1 : 0;
