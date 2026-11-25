// The site's safety rules, checked on the code itself so that a change that breaks one fails `npm test`, whoever wrote
// it (by hand or with an assistant). Each list below is the whole set of files allowed to do something risky. A new
// file there is not forbidden: it is a decision, so it goes in the list in the same change, and the pull request says
// why. The rules themselves are in AGENTS.md of the public copy (abierto/AGENTS.md here).
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ESCRITURA, LECTURA } from '../src/lib/moodle.js';

const RAIZ = path.resolve(import.meta.dirname, '..');

function codigo(carpeta = path.join(RAIZ, 'src')) {
  return fs.readdirSync(carpeta, { withFileTypes: true }).flatMap((e) => {
    const ruta = path.join(carpeta, e.name);
    if (e.isDirectory()) return codigo(ruta);
    if (!/\.(js|jsx|mjs)$/.test(e.name) || /\.(test|fixture)\.[a-z]+$/.test(e.name)) return [];
    return [path.relative(RAIZ, ruta).split(path.sep).join('/')];
  });
}
const ARCHIVOS = codigo().map((rel) => ({ rel, texto: fs.readFileSync(path.join(RAIZ, rel), 'utf8') }));
const losQue = (patron) => ARCHIVOS.filter((a) => patron.test(a.texto)).map((a) => a.rel).sort();

const PEDIR_ALGO = 'Si de verdad hace falta, sumalo a la lista de este test en el mismo cambio y explicá por qué en el pull request.';

// The only things that change something in the campus. Each one has its own exported function, never retries, and
// (except marking a conversation as read) runs only after the student confirms.
const ESCRITURA_PERMITIDA = [
  'core_message_mark_all_conversation_messages_as_read',
  'core_message_send_instant_messages',
  'core_message_send_messages_to_conversation',
  'enrol_self_enrol_user',
  'mod_assign_save_submission',
  'mod_assign_submit_for_grading',
  'mod_forum_add_discussion_post',
  'webservice/upload.php',
];

// Where the browser may ask for data (connect-src of the CSP). Privacidad lists each one for the student.
const CONEXIONES = [
  "'self'",
  'https://classroom.googleapis.com',
  'https://frro.cvg.utn.edu.ar',
  'https://huggingface.co',
  'https://*.hf.co',
  'https://lomhlulbgfovtnljbqzp.supabase.co',
  'https://lutastudios.com',
  'https://oauth2.googleapis.com',
  'https://spltnoksgdkbaamskuau.supabase.co',
  'https://www.googleapis.com',
  'https://www.youtube.com',
  'wss://lomhlulbgfovtnljbqzp.supabase.co',
];

// The files that make requests of their own.
const RED = [
  'src/lib/adjuntos.js',
  'src/lib/campus.js',
  'src/lib/classroom.js',
  'src/lib/consultron/codigo.js',
  'src/lib/consultron/nube.js',
  'src/lib/disenos.js',
  'src/lib/drive.js',
  'src/lib/drivePublico.js',
  'src/lib/gcal.js',
  'src/lib/google.js',
  'src/lib/laboratorio/c.worker.js',
  'src/lib/laboratorio/js.worker.js',
  'src/lib/laboratorio/jsMensajes.js',
  'src/lib/laboratorio/motor.js',
  'src/lib/laboratorio/red.js',
  'src/lib/laboratorio/revisar.js',
  'src/lib/mapasDrive.js',
  'src/lib/moodle.js',
  'src/lib/resumenes.js',
  'src/lib/santoResumen.js',
  'src/lib/temporales.js',
  'src/lib/verResumen.js',
];

// The files that write to the browser's disk (localStorage, sessionStorage, IndexedDB, Cache Storage). The campus's
// data lives in memory: on disk only what each of these documents (the student's own things, settings, the PDF texts).
const DISCO = [
  'src/components/BuscarEnDrive.jsx',
  'src/lib/ajustes.js',
  'src/lib/bodega.js',
  'src/lib/calendarioSincro.js',
  'src/lib/campana.js',
  'src/lib/compartido.js',
  'src/lib/consultron/agente.js',
  'src/lib/consultron/alAbrir.js',
  'src/lib/consultron/charlas.js',
  'src/lib/consultron/codigo.js',
  'src/lib/consultron/consultron.worker.js',
  'src/lib/consultron/motor.js',
  'src/lib/consultron/nube.js',
  'src/lib/demoCalendario.js',
  'src/lib/demoDrive.js',
  'src/lib/descargasFondo.js',
  'src/lib/disenos.js',
  'src/lib/enVivo/conexion.js',
  'src/lib/enVivo/guardadas.js',
  'src/lib/enVivo/origenes.js',
  'src/lib/enVivo/vistos.js',
  'src/lib/entrarConGoogle.js',
  'src/lib/foros.js',
  'src/lib/mapasDrive.js',
  'src/lib/marcas.js',
  'src/lib/mio.js',
  'src/lib/porMandar.js',
  'src/lib/resumenes.js',
  'src/lib/sesion.js',
  'src/lib/sinInternetDisco.js',
  'src/lib/sincro.js',
  'src/lib/textosPdf.js',
  'src/lib/useBorrador.js',
  'src/pages/Buscar.jsx',
];

// The files that put HTML in the page. The campus's HTML is shown as text (textoPlano) or as blocks, never as HTML.
const HTML = ['src/components/consultron/Formula.jsx', 'src/lib/foros.js'];

// The only file that builds code from text (the Laboratorio's step tracer, inside the worker without network).
const EVAL = ['src/lib/laboratorio/rastreo.js'];

describe('reglas del sitio', () => {
  it('al campus se le lee con funciones de consulta', () => {
    const raras = [...LECTURA].filter((f) => !/_(get|search)_/.test(f));
    expect(raras, `LECTURA tiene funciones que no son de consulta. Super CVG es de solo lectura: lo que escribe va en ESCRITURA de src/lib/moodle.js, con su propia función. ${PEDIR_ALGO}`).toEqual([]);
    for (const f of ['mod_quiz_start_attempt', 'mod_quiz_process_attempt', 'mod_quiz_view_quiz', 'mod_quiz_save_attempt']) {
      expect(LECTURA.has(f) || ESCRITURA.has(f), `${f}: un intento de cuestionario se empieza y se sigue en el campus, nunca desde acá.`).toBe(false);
    }
  });

  it('lo que escribe en el campus es una lista cerrada', () => {
    expect([...ESCRITURA].sort(), `ESCRITURA de src/lib/moodle.js cambió. Cada escritura lleva su función exportada, sin reintentos y después de preguntarle al alumno. ${PEDIR_ALGO}`).toEqual(ESCRITURA_PERMITIDA);
  });

  it('la clave del campus nunca va en una URL', () => {
    const puestas = ARCHIVOS.filter((a) => /searchParams\.(set|append)\(\s*['"]wstoken|[?&]wstoken=|[?&]token=\$\{/.test(a.texto)).map((a) => a.rel);
    expect(puestas, 'La clave del campus va en el cuerpo del pedido (POST), nunca en la dirección: el historial, los logs y los servidores de paso la guardarían.').toEqual([]);
    const conClave = losQue(/wstoken/).filter((rel) => {
      const texto = ARCHIVOS.find((a) => a.rel === rel).texto;
      return rel !== 'src/lib/moodle.js' && texto.replace(/searchParams\.delete\(\s*['"]wstoken['"]\s*\)/g, '').includes('wstoken');
    });
    expect(conClave, 'Solo src/lib/moodle.js manda la clave al campus. Las demás partes piden por sus funciones.').toEqual([]);
  });

  it('el navegador pide datos solo a los sitios de la lista', () => {
    const vite = fs.readFileSync(path.join(RAIZ, 'vite.config.js'), 'utf8');
    const csp = /export const CSP = "([^"]+)"/.exec(vite)?.[1] ?? '';
    const conexiones = (/connect-src ([^;]+)/.exec(csp)?.[1] ?? '').trim().split(/\s+/).sort();
    expect(conexiones, `connect-src de la CSP (vite.config.js) cambió. Un sitio nuevo también va en Privacidad (src/pages/Privacidad.jsx), que le dice al alumno a quién le habla el sitio. ${PEDIR_ALGO}`).toEqual([...CONEXIONES].sort());
    expect(csp, 'La CSP no deja correr eval ni scripts de otros sitios.').not.toMatch(/'unsafe-eval'|script-src[^;]*https?:/);
  });

  it('pedidos propios, solo desde los archivos de la lista', () => {
    const fuera = losQue(/\bfetch\(|new WebSocket\(|XMLHttpRequest|sendBeacon\(/).filter((rel) => !RED.includes(rel));
    expect(fuera, `Estos archivos hacen pedidos y no están en RED. Al campus se le pide por src/lib/moodle.js; a Google, por google.js, drive.js o classroom.js. ${PEDIR_ALGO}`).toEqual([]);
  });

  it('el disco del navegador, solo desde los archivos de la lista', () => {
    const fuera = losQue(/localStorage\.setItem|localStorage\[|sessionStorage\.setItem|indexedDB\.open|caches\.open/).filter((rel) => !DISCO.includes(rel));
    expect(fuera, `Estos archivos guardan en el disco del navegador y no están en DISCO. Los datos del campus quedan en memoria (conCache): nunca en disco, en el título ni en la URL. ${PEDIR_ALGO}`).toEqual([]);
  });

  it('HTML en la página, solo desde los archivos de la lista', () => {
    const fuera = losQue(/dangerouslySetInnerHTML|\.innerHTML\s*=|outerHTML\s*=|insertAdjacentHTML/).filter((rel) => !HTML.includes(rel));
    expect(fuera, `Estos archivos meten HTML en la página. Lo que viene del campus o de un archivo se muestra como texto (textoPlano). ${PEDIR_ALGO}`).toEqual([]);
  });

  it('código armado desde texto, solo en el rastreo del Laboratorio', () => {
    const fuera = losQue(/\beval\(|new Function\(/).filter((rel) => !EVAL.includes(rel));
    expect(fuera, `Estos archivos arman código desde texto. ${PEDIR_ALGO}`).toEqual([]);
  });

  it('las listas no nombran archivos que ya no existen', () => {
    const existen = new Set(ARCHIVOS.map((a) => a.rel));
    for (const lista of [RED, DISCO, HTML, EVAL]) expect(lista.filter((rel) => !existen.has(rel))).toEqual([]);
  });
});
