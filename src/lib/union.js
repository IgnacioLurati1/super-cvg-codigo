// How the student's things (mio.js) are joined between devices, through the copy in their Google Drive (sincro.js).
// Pure: no storage and no network, so it can be tested alone.
//
// The data is cut into elements, each with its own key: a note, a task, a name, each hidden or seen thing, a date, a
// course of one's own, each of its sections and each of its blocks. Next to the data each device keeps when each
// element last changed (`t`, also for the deleted ones: a tombstone), and which ones changed since it last joined with
// the copy (`d`, with the time the copy had for each then). Joining goes element by element:
//   - one that only one side knows comes from that side;
//   - if both sides changed it since they last joined, it's a conflict: an edit beats a deletion, two versions of a
//     note (or of a text block) stay one after the other, two of the code of a file of the lab too (the older one
//     commented out, so it still runs), and anything else keeps the latest change;
//   - otherwise the latest change wins. The time of an element only grows (a change is always later than what the
//     device had for it), so a device whose clock runs late never undoes a change it already saw.
// Data saved before this existed has no times: on the first join everything of it counts as changed, so nothing is
// dropped for being old.

import { LENGUAJES } from './laboratorio/lenguajes';
import { MAX_CODIGO } from './laboratorio/saneo';

const SETS = { secciones: 's', ocultos: 'o', vistos: 'v', parcial: 'pa', descartes: 'd', plegadas: 'pl' };
const DE_LETRA = Object.fromEntries(Object.entries(SETS).map(([campo, letra]) => [letra, campo]));
const MAX_TEXTO = 20_000;
// Tombstones older than this go away: a device away for longer may bring back something deleted, never lose anything.
export const VIDA_BORRADOS_MS = 120 * 86_400_000;

// The name of a file a program wrote, in the key of its element: only letters, digits, `-` and `_` (marcas.js).
const enClave = (nombre) => btoa(String.fromCharCode(...new TextEncoder().encode(nombre))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const seccion = (s) => (/^\d+$/.test(s) ? Number(s) : s);
const json = (v) => JSON.stringify(v ?? null);
export const igual = (a, b) => a === b || (a !== undefined && b !== undefined && json(a) === json(b));

/** The elements of the student's data, by key. Empty values are not elements: an empty note is a note that isn't. */
export function piezas(mio) {
  const p = {};
  for (const [id, m] of Object.entries(mio?.materias ?? {})) {
    const b = `m/${id}/`;
    for (const [campo, letra] of Object.entries(SETS)) for (const v of m[campo] ?? []) p[`${b}${letra}/${v}`] = 1;
    if (m.nota) p[`${b}nota`] = m.nota;
    for (const [k, v] of Object.entries(m.nombres ?? {})) p[`${b}n/${k}`] = v;
    for (const [k, v] of Object.entries(m.orden ?? {})) if (v.length) p[`${b}orden/${k}`] = v;
    for (const [k, v] of Object.entries(m.lugares ?? {})) p[`${b}l/${k}`] = v;
    if (m.foto) p[`${b}foto`] = m.foto;
    for (const t of m.tareas ?? []) p[`${b}t/${t.id}`] = { texto: t.texto, hecha: t.hecha, fecha: t.fecha };
    for (const f of m.fechas ?? []) p[`${b}f/${f.id}`] = { titulo: f.titulo, cuando: f.cuando, sinHora: f.sinHora };
    if (m.classroom) p[`${b}classroom`] = m.classroom;
    // The order of the sections is one element: moved on two devices, the latest order wins whole.
    if (m.ordenSecciones?.length) p[`${b}os`] = m.ordenSecciones;
    if (m.comision) p[`${b}comision`] = m.comision;
    for (const [dia, aula] of Object.entries(m.aulas ?? {})) p[`${b}au/${dia}`] = aula;
    // Pinned or archived in Materias, and the look of its card: each one whole, the latest wins.
    if (m.enLista) p[`${b}el`] = m.enLista;
    if (m.tarjeta) p[`${b}tj`] = m.tarjeta;
  }
  for (const { id, ...resto } of mio?.eventos ?? []) p[`e/${id}`] = resto;
  for (const [k, v] of Object.entries(mio?.cursos ?? {})) p[`c/${k}`] = v;
  for (const [k, v] of Object.entries(mio?.campus ?? {})) p[`cc/${k}`] = v;
  // Each mark of done is an element: its value is the second it is due, negative once the student took it off. Taking
  // it off is a change like any other, so the latest one wins on every device.
  for (const [k, v] of Object.entries(mio?.hechas ?? {})) p[`he/${k}`] = v;
  // The classes of a subject changed by hand go whole: changed on two devices, the latest list wins.
  for (const [id, clases] of Object.entries(mio?.horario?.aMano?.cursos ?? {})) p[`hm/c/${id}`] = { clases };
  for (const [id, clases] of Object.entries(mio?.horario?.aMano?.extras ?? {})) p[`hm/x/${id}`] = { clases };
  // A subject of the faculty without a campus course, whole: its name, commission and classrooms go together.
  for (const { id, ...resto } of mio?.horario?.extras ?? []) p[`x/${id}`] = resto;
  // Each highlight of a PDF is an element, and so is the page where the student left it. Each bookmark too, by its
  // page: its value is when it was put (with its name, if it has one), so taking it off on one device is a deletion
  // the others learn, and renaming it is a change like any other.
  for (const [doc, l] of Object.entries(mio?.lecturas ?? {})) {
    if (l.pagina) p[`r/${doc}/pagina`] = l.pagina;
    for (const { id, ...resto } of l.resaltados ?? []) p[`r/${doc}/h/${id}`] = resto;
    for (const s of l.senaladores ?? []) p[`r/${doc}/s/${s.pagina}`] = s.nombre ? { creado: s.creado, nombre: s.nombre } : s.creado;
  }
  // Each file of the lab is an element: its name, language, code and course travel together.
  // Its test cases, and a project's, are one more (the latest list wins whole): a device with an older version of the
  // site, which doesn't know them, keeps the element as the copy has it instead of dropping it with the file's.
  for (const { id, casos, ...resto } of mio?.laboratorio ?? []) {
    p[`lab/${id}`] = resto;
    if (casos?.length) p[`labt/${id}`] = casos;
  }
  // Each project of the lab too: its name, language, course and which file runs travel together.
  for (const { id, casos, ...resto } of mio?.proyectosLab ?? []) {
    p[`labp/${id}`] = resto;
    if (casos?.length) p[`labt/${id}`] = casos;
  }
  // Each file a program wrote, by its place and name: its bytes (by id) and size, or that it deleted it. The latest wins.
  for (const { donde, ...resto } of mio?.escritos ?? []) p[`labe/${donde}/${enClave(resto.nombre)}`] = resto;
  // Each card of Repaso too: its texts and when it comes back travel together, the latest answer wins.
  for (const { id, ...resto } of mio?.repaso ?? []) p[`rep/${id}`] = resto;
  // Hoy as the student arranged it (hoy.js): the order goes whole, like the sections'; each hidden block and each course
  // taken out is an element of its own; what counts, how many days ahead and how the week draws, one each.
  const hoy = mio?.hoy;
  if (hoy?.orden?.length) p['hoy/orden'] = hoy.orden;
  for (const [c, col] of Object.entries(hoy?.columnas ?? {})) p[`hoy/c/${c}`] = col;
  for (const c of hoy?.ocultos ?? []) p[`hoy/o/${c}`] = 1;
  if (hoy?.cuenta) p['hoy/cuenta'] = hoy.cuenta;
  if (hoy?.dias) p['hoy/dias'] = hoy.dias;
  if (hoy?.semana) p['hoy/semana'] = hoy.semana;
  for (const id of hoy?.fuera ?? []) p[`hoy/m/${id}`] = 1;
  // Each kind of notification hidden is an element: showing it again on one device is a deletion the others learn.
  for (const clave of mio?.avisosOcultos ?? []) p[`av/${clave}`] = 1;
  // Drive folders (drivePublico.js): each one added and each thing hidden is an element; taking the career's away, one more.
  for (const { id, ...resto } of mio?.drive?.propios ?? []) p[`dr/p/${id}`] = resto;
  if (mio?.drive?.sinCarrera) p['dr/sin'] = 1;
  for (const id of mio?.drive?.ocultos ?? []) p[`dr/o/${id}`] = 1;
  // The look: `aj` says the student has one (all at the default is a look too), and each setting differing from the
  // default is an element, the latest wins. Put back to the default, it is a deletion the others learn.
  if (mio?.apariencia) {
    p.aj = 1;
    for (const [k, v] of Object.entries(mio.apariencia)) p[`aj/${k}`] = v;
  }
  const propias = mio?.propias ?? [];
  if (propias.length) p.po = propias.map((x) => x.id);
  for (const pr of propias) {
    const b = `p/${pr.id}`;
    p[b] = { nombre: pr.nombre, base: pr.base, classroom: pr.classroom, de: pr.de };
    if (pr.cambiada) p[`${b}/cambiada`] = pr.cambiada;
    if (pr.categorias.length) p[`${b}/orden`] = pr.categorias.map((c) => c.id);
    for (const c of pr.categorias) {
      const bc = `${b}/c/${c.id}`;
      p[bc] = c.campus === undefined ? { nombre: c.nombre } : { nombre: c.nombre, campus: c.campus };
      if (c.bloques.length) p[`${bc}/orden`] = c.bloques.map((x) => x.id);
      for (const { id, ...resto } of c.bloques) p[`${bc}/b/${id}`] = resto;
    }
  }
  return p;
}

// Known first, then the rest by number: what one device added that the order of the other doesn't know goes last.
const enOrden = (ids, orden, comparar) => [...(orden ?? []).filter((id) => ids.includes(id)), ...ids.filter((id) => !(orden ?? []).includes(id)).sort(comparar)];
const porNumero = (a, b) => Number(a) - Number(b);

/** The data back from its elements. It still goes through sanearMio before it is used. A section or a course of one's
 * own that was deleted on one side while the other changed something inside comes back, with a name that says so. */
export function armar(p) {
  const materias = {};
  const materia = (id) => (materias[id] ??= { secciones: [], ocultos: [], vistos: [], parcial: [], descartes: [], plegadas: [], nombres: {}, orden: {}, lugares: {}, tareas: [], fechas: [], nota: '', foto: null, classroom: null, ordenSecciones: [], comision: null, aulas: {} });
  const eventos = [];
  const horario = { extras: [], aMano: { cursos: {}, extras: {} } };
  const cursos = {};
  const campus = {};
  const hechas = {};
  const lecturas = {};
  const lectura = (doc) => (lecturas[doc] ??= { pagina: null, resaltados: [], senaladores: [] });
  const laboratorio = [];
  const proyectosLab = [];
  // The test cases of a file or a project, by its id: they join it once all is read.
  const casosLab = new Map();
  const escritos = [];
  const repaso = [];
  const hoy = { orden: [], columnas: {}, ocultos: [], cuenta: null, dias: null, fuera: [], semana: null };
  const avisosOcultos = [];
  const drive = { propios: [], sinCarrera: false, ocultos: [] };
  const apariencia = {};
  let conApariencia = false;
  const propias = new Map();
  const propia = (id) => {
    if (!propias.has(id)) propias.set(id, { meta: null, cambiada: 0, orden: null, cats: new Map() });
    return propias.get(id);
  };
  const cat = (pr, cid) => {
    if (!pr.cats.has(cid)) pr.cats.set(cid, { meta: null, orden: null, bloques: new Map() });
    return pr.cats.get(cid);
  };
  let po = [];
  for (const [k, v] of Object.entries(p)) {
    let r;
    if ((r = /^m\/(\d+|p[0-9a-z]{6,20})\/(s|o|v|pa|d|pl)\/(.+)$/.exec(k))) materia(r[1])[DE_LETRA[r[2]]].push(r[2] === 's' || r[2] === 'pl' ? seccion(r[3]) : r[3]);
    else if ((r = /^m\/(\d+|p[0-9a-z]{6,20})\/nota$/.exec(k))) materia(r[1]).nota = v;
    else if ((r = /^m\/(\d+|p[0-9a-z]{6,20})\/n\/(.+)$/.exec(k))) materia(r[1]).nombres[r[2]] = v;
    else if ((r = /^m\/(\d+|p[0-9a-z]{6,20})\/orden\/(.+)$/.exec(k))) materia(r[1]).orden[r[2]] = v;
    else if ((r = /^m\/(\d+|p[0-9a-z]{6,20})\/l\/(.+)$/.exec(k))) materia(r[1]).lugares[r[2]] = v;
    else if ((r = /^m\/(\d+|p[0-9a-z]{6,20})\/foto$/.exec(k))) materia(r[1]).foto = v;
    else if ((r = /^m\/(\d+|p[0-9a-z]{6,20})\/t\/(\d+)$/.exec(k))) materia(r[1]).tareas.push({ id: Number(r[2]), ...v });
    else if ((r = /^m\/(\d+|p[0-9a-z]{6,20})\/f\/(\d+)$/.exec(k))) materia(r[1]).fechas.push({ id: Number(r[2]), ...v });
    else if ((r = /^m\/(\d+|p[0-9a-z]{6,20})\/classroom$/.exec(k))) materia(r[1]).classroom = v;
    else if ((r = /^m\/(\d+|p[0-9a-z]{6,20})\/os$/.exec(k))) materia(r[1]).ordenSecciones = v;
    else if ((r = /^m\/(\d+|p[0-9a-z]{6,20})\/comision$/.exec(k))) materia(r[1]).comision = v;
    else if ((r = /^m\/(\d+|p[0-9a-z]{6,20})\/au\/([1-6])$/.exec(k))) materia(r[1]).aulas[r[2]] = v;
    else if ((r = /^m\/(\d+|p[0-9a-z]{6,20})\/el$/.exec(k))) materia(r[1]).enLista = v;
    else if ((r = /^m\/(\d+|p[0-9a-z]{6,20})\/tj$/.exec(k))) materia(r[1]).tarjeta = v;
    else if ((r = /^hm\/c\/(\d+)$/.exec(k))) horario.aMano.cursos[r[1]] = v?.clases;
    else if ((r = /^hm\/x\/(\d+)$/.exec(k))) horario.aMano.extras[r[1]] = v?.clases;
    else if ((r = /^x\/(\d+)$/.exec(k))) horario.extras.push({ id: Number(r[1]), ...v });
    else if ((r = /^e\/(\d+)$/.exec(k))) eventos.push({ id: Number(r[1]), ...v });
    else if ((r = /^c\/(\d+)$/.exec(k))) cursos[r[1]] = v;
    else if ((r = /^cc\/(\d+)$/.exec(k))) campus[r[1]] = v;
    else if ((r = /^he\/([tqec]\d{1,24})$/.exec(k))) hechas[r[1]] = v;
    else if ((r = /^r\/([^/]+)\/pagina$/.exec(k))) lectura(r[1]).pagina = v;
    else if ((r = /^r\/([^/]+)\/h\/(\d+)$/.exec(k))) lectura(r[1]).resaltados.push({ id: Number(r[2]), ...v });
    else if ((r = /^r\/([^/]+)\/s\/(\d{1,6})$/.exec(k))) lectura(r[1]).senaladores.push(v && typeof v === 'object' ? { pagina: Number(r[2]), creado: v.creado, nombre: v.nombre } : { pagina: Number(r[2]), creado: v });
    else if ((r = /^lab\/(l[0-9a-z]{6,24})$/.exec(k))) laboratorio.push({ id: r[1], ...v });
    else if ((r = /^labp\/(q[0-9a-z]{6,24})$/.exec(k))) proyectosLab.push({ id: r[1], ...v });
    else if ((r = /^labt\/([lq][0-9a-z]{6,24})$/.exec(k))) casosLab.set(r[1], v);
    else if ((r = /^labe\/([lq][0-9a-z]{6,24})\/[\w-]{1,220}$/.exec(k))) escritos.push({ donde: r[1], ...v });
    else if ((r = /^rep\/(r[0-9a-z]{6,24})$/.exec(k))) repaso.push({ id: r[1], ...v });
    else if (k === 'hoy/orden') hoy.orden = v;
    else if ((r = /^hoy\/o\/([a-z]{1,20})$/.exec(k))) hoy.ocultos.push(r[1]);
    else if ((r = /^hoy\/c\/([a-z]{1,20})$/.exec(k))) hoy.columnas[r[1]] = v;
    else if (k === 'hoy/cuenta') hoy.cuenta = v;
    else if (k === 'hoy/dias') hoy.dias = v;
    else if (k === 'hoy/semana') hoy.semana = v;
    else if ((r = /^hoy\/m\/(\d{1,12})$/.exec(k))) hoy.fuera.push(Number(r[1]));
    else if ((r = /^av\/([a-z]{1,20})$/.exec(k))) avisosOcultos.push(r[1]);
    else if ((r = /^dr\/p\/([\w-]{10,100})$/.exec(k))) drive.propios.push({ id: r[1], ...v });
    else if (k === 'dr/sin') drive.sinCarrera = true;
    else if ((r = /^dr\/o\/([\w-]{10,100})$/.exec(k))) drive.ocultos.push(r[1]);
    else if (k === 'aj') conApariencia = true;
    else if ((r = /^aj\/([A-Za-z]{1,30})$/.exec(k))) {
      conApariencia = true;
      apariencia[r[1]] = v;
    }
    else if (k === 'po') po = Array.isArray(v) ? v : [];
    else if ((r = /^p\/([^/]+)$/.exec(k))) propia(r[1]).meta = v;
    else if ((r = /^p\/([^/]+)\/cambiada$/.exec(k))) propia(r[1]).cambiada = v;
    else if ((r = /^p\/([^/]+)\/orden$/.exec(k))) propia(r[1]).orden = v;
    else if ((r = /^p\/([^/]+)\/c\/(\d+)$/.exec(k))) cat(propia(r[1]), Number(r[2])).meta = v;
    else if ((r = /^p\/([^/]+)\/c\/(\d+)\/orden$/.exec(k))) cat(propia(r[1]), Number(r[2])).orden = v;
    else if ((r = /^p\/([^/]+)\/c\/(\d+)\/b\/(\d+)$/.exec(k))) cat(propia(r[1]), Number(r[2])).bloques.set(Number(r[3]), { id: Number(r[3]), ...v });
  }
  for (const x of [...laboratorio, ...proyectosLab]) if (casosLab.has(x.id)) x.casos = casosLab.get(x.id);
  for (const m of Object.values(materias)) {
    m.tareas.sort((a, b) => a.id - b.id);
    m.fechas.sort((a, b) => a.id - b.id);
  }
  eventos.sort((a, b) => a.id - b.id);
  horario.extras.sort((a, b) => a.id - b.id);
  const salida = [];
  for (const id of enOrden([...propias.keys()], po)) {
    const pr = propias.get(id);
    // Only its order or its date left: it was deleted on both sides.
    const cats = [...pr.cats.entries()].filter(([, c]) => c.meta || c.bloques.size);
    if (!pr.meta && !cats.length) continue;
    const vivas = new Map(cats);
    const categorias = enOrden([...vivas.keys()], pr.orden, porNumero).map((cid) => {
      const c = vivas.get(cid);
      const bloques = enOrden([...c.bloques.keys()], c.orden, porNumero).map((bid) => c.bloques.get(bid));
      return { id: cid, nombre: c.meta?.nombre ?? 'Recuperada de otro dispositivo', ...(c.meta?.campus !== undefined ? { campus: c.meta.campus } : {}), bloques };
    });
    const meta = pr.meta ?? { nombre: 'Recuperada de otro dispositivo', base: null, classroom: null, de: null };
    salida.push({ id, ...meta, categorias, cambiada: pr.cambiada });
  }
  avisosOcultos.sort();
  drive.propios.sort((a, b) => (a.id < b.id ? -1 : 1));
  drive.ocultos.sort();
  return { materias, eventos, propias: salida, cursos, campus, horario, lecturas, hechas, laboratorio, proyectosLab, escritos, repaso, hoy, avisosOcultos, drive, apariencia: conApariencia ? apariencia : null };
}

// Two versions of a text: if one already has the other, that one; if not, both, the newest first. `recorto` is called
// if both don't fit and the end was cut.
export function juntarTextos(nuevo, viejo, recorto = () => {}) {
  if (nuevo.includes(viejo)) return nuevo;
  if (viejo.includes(nuevo)) return viejo;
  const junto = `${nuevo}\n\n${viejo}`;
  if (junto.length > MAX_TEXTO) recorto();
  return junto.slice(0, MAX_TEXTO);
}

/** Two versions of the code of a file of the lab: the newest one runs as it is, and the other goes below it, commented
 * out in its language, so nothing is lost and the file still runs. */
export function juntarCodigos(nuevo, viejo, lenguaje, recorto = () => {}) {
  if (nuevo.includes(viejo)) return nuevo;
  if (viejo.includes(nuevo)) return viejo;
  const c = LENGUAJES[lenguaje]?.comentario ?? '#';
  const comentado = viejo.split('\n').map((l) => (l ? `${c} ${l}` : c)).join('\n');
  const junto = `${nuevo.replace(/\n*$/, '')}\n\n${c} Lo que tenía este archivo en otro dispositivo:\n${comentado}\n`;
  if (junto.length > MAX_CODIGO) recorto();
  return junto.slice(0, MAX_CODIGO);
}

// The latest change; with the same time, always the same one on every device.
function ultimo(lv, rv, lt, rt) {
  if (lt !== rt) return lt > rt ? [lv, lt] : [rv, rt];
  if (lv === undefined) return [rv, rt];
  if (rv === undefined) return [lv, lt];
  return json(lv) >= json(rv) ? [lv, lt] : [rv, rt];
}

function conflicto(k, lv, rv, lt, rt, recorto) {
  // The way out of a conflict is a change of its own: later than both, so it reaches every device.
  const s = Math.max(lt, rt) + 1;
  if (lv === undefined) return [rv, s];
  if (rv === undefined) return [lv, s];
  const [nuevo, viejo] = lt >= rt ? [lv, rv] : [rv, lv];
  if (/^m\/\d+\/nota$/.test(k) && typeof lv === 'string' && typeof rv === 'string') return [juntarTextos(nuevo, viejo, recorto), s];
  if (/\/b\/\d+$/.test(k) && lv.tipo === 'texto' && rv.tipo === 'texto') return [{ ...nuevo, texto: juntarTextos(nuevo.texto, viejo.texto, recorto) }, s];
  // The code of a file of the lab changed on both: both versions, the older one commented out.
  // Data a program reads (a .txt, a .csv) isn't code: commenting the old one out would change what it reads, so the
  // latest wins.
  if (/^lab\/[^/]+$/.test(k) && typeof lv.codigo === 'string' && typeof rv.codigo === 'string' && lv.codigo !== rv.codigo && !['txt', 'csv', 'dat', 'json'].includes(nuevo.ext)) return [{ ...nuevo, codigo: juntarCodigos(nuevo.codigo, viejo.codigo, nuevo.lenguaje, recorto) }, s];
  // The note of a highlight written on both: both versions, like the note of a course.
  if (/^r\/[^/]+\/h\/\d+$/.test(k) && typeof lv.nota === 'string' && typeof rv.nota === 'string' && lv.nota !== rv.nota) return [{ ...nuevo, nota: juntarTextos(nuevo.nota, viejo.nota, recorto) }, s];
  return ultimo(lv, rv, lt, rt);
}

/** Joins this device (`local`: { datos, t, d }) with the copy (`remoto`: { datos, t }, or null if there is none).
 * `primera`: this device never joined with this copy. Returns { datos, t, recortes }: the joined data (to go through
 * sanearMio), the time of each element, tombstones included, and how many texts were joined without room for all. */
export function unir(local, remoto, { primera = false, ahora = Date.now() } = {}) {
  const PL = piezas(local.datos);
  const tL = local.t ?? {};
  const dL = local.d ?? {};
  const PR = remoto ? piezas(remoto.datos) : {};
  const tR = remoto?.t ?? {};
  const P = {};
  const t = {};
  let recortes = 0;
  const recorto = () => {
    recortes += 1;
  };
  for (const k of new Set([...Object.keys(PL), ...Object.keys(tL), ...Object.keys(PR), ...Object.keys(tR)])) {
    const lv = PL[k];
    const rv = PR[k];
    const lt = tL[k] ?? (lv !== undefined ? 0 : undefined);
    const rt = tR[k] ?? (rv !== undefined ? 0 : undefined);
    let v;
    let s;
    if (rt === undefined) [v, s] = [lv, lt];
    else if (lt === undefined) [v, s] = [rv, rt];
    else if (igual(lv, rv)) [v, s] = [lv ?? rv, Math.max(lt, rt)];
    else {
      const cambioAca = primera || k in dL;
      const base = k in dL ? dL[k] : lt;
      const cambioAlla = primera || rt !== base;
      [v, s] = cambioAca && cambioAlla ? conflicto(k, lv, rv, lt, rt, recorto) : ultimo(lv, rv, lt, rt);
    }
    if (v !== undefined) P[k] = v;
    // A tombstone stays a while, so a device that still has the element learns it was deleted.
    if (v !== undefined || ahora - s < VIDA_BORRADOS_MS) t[k] = s;
  }
  return { datos: armar(P), t, recortes };
}

/** Notes what changed between two versions of the data on this device: its new time, and the time it had before if it
 * is the first change since the last join. Returns the same `marcas` if nothing changed. */
export function marcar(marcas, antes, despues, ahora = Date.now()) {
  const A = piezas(antes);
  const D = piezas(despues);
  let t = null;
  let d = null;
  for (const k of new Set([...Object.keys(A), ...Object.keys(D)])) {
    if (igual(A[k], D[k])) continue;
    t ??= { ...marcas.t };
    d ??= { ...marcas.d };
    if (!(k in d)) d[k] = t[k] ?? null;
    t[k] = Math.max(ahora, (t[k] ?? 0) + 1);
  }
  return t ? { ...marcas, t, d } : marcas;
}

/** The same elements with the same values. */
export function mismasPiezas(a, b) {
  const A = piezas(a);
  const B = piezas(b);
  const ka = Object.keys(A);
  return ka.length === Object.keys(B).length && ka.every((k) => k in B && igual(A[k], B[k]));
}
