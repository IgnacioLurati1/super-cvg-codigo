import { normalizar } from './datos';

// Each campus course with its summary in El Santo Resumen (Luta Studios), by name. The list is a copy of the
// subjects of that site (scripts/utn/materias.json in Luta Studios's repo): it ships with the site, so finding the
// link sends nothing to anyone. A course matches a subject when its name has every word of the subject's name; if
// several do, the one with more words wins («Física II» over «Física I»). Better no link than a wrong one: there are
// no nicknames.
export const SANTO = 'https://lutastudios.com/utn';

export const MATERIAS_SANTO = [
  ['analisis-matematico-i', 'Análisis Matemático I'],
  ['algebra-y-geometria-analitica', 'Álgebra y Geometría Analítica'],
  ['fisica-i', 'Física I'],
  ['ingles-i', 'Inglés I'],
  ['logica-y-estructuras-discretas', 'Lógica y Estructuras Discretas'],
  ['algoritmos-y-estructuras-de-datos', 'Algoritmos y Estructuras de Datos'],
  ['arquitectura-de-computadoras', 'Arquitectura de Computadoras'],
  ['sistemas-y-procesos-de-negocio', 'Sistemas y Procesos de Negocio'],
  ['analisis-matematico-ii', 'Análisis Matemático II'],
  ['fisica-ii', 'Física II'],
  ['ingenieria-y-sociedad', 'Ingeniería y Sociedad'],
  ['ingles-ii', 'Inglés II'],
  ['sintaxis-y-semantica-de-los-lenguajes', 'Sintaxis y Semántica de los Lenguajes'],
  ['paradigmas-de-programacion', 'Paradigmas de Programación'],
  ['sistemas-operativos', 'Sistemas Operativos'],
  ['analisis-de-sistemas-de-informacion', 'Análisis de Sistemas de Información'],
  ['probabilidad-y-estadistica', 'Probabilidad y Estadística'],
  ['economia', 'Economía'],
  ['bases-de-datos', 'Bases de Datos'],
  ['desarrollo-de-software', 'Desarrollo de Software'],
  ['comunicacion-de-datos', 'Comunicación de Datos'],
  ['analisis-numerico', 'Análisis Numérico'],
  ['diseno-de-sistemas-de-informacion', 'Diseño de Sistemas de Información'],
  ['seminario-integrador', 'Seminario Integrador'],
  ['legislacion', 'Legislación'],
  ['ingenieria-y-calidad-de-software', 'Ingeniería y Calidad de Software'],
  ['redes-de-datos', 'Redes de Datos'],
  ['investigacion-operativa', 'Investigación Operativa'],
  ['simulacion', 'Simulación'],
  ['tecnologias-para-la-automatizacion', 'Tecnologías para la Automatización'],
  ['administracion-de-sistemas-de-informacion', 'Administración de Sistemas de Información'],
  ['inteligencia-artificial', 'Inteligencia Artificial'],
  ['ciencia-de-datos', 'Ciencia de Datos'],
  ['sistemas-de-gestion', 'Sistemas de Gestión'],
  ['gestion-gerencial', 'Gestión Gerencial'],
  ['seguridad-en-los-sistemas-de-informacion', 'Seguridad en los Sistemas de Información'],
  ['algoritmos-geneticos', 'Algoritmos Genéticos'],
  ['analisis-y-diseno-de-datos-e-informacion', 'Análisis y Diseño de Datos e Información'],
  ['cobol', 'Cobol'],
  ['direccion-de-recursos-humanos', 'Dirección de Recursos Humanos'],
  ['entornos-graficos', 'Entornos Gráficos'],
  ['formacion-de-emprendedores', 'Formación de Emprendedores'],
  ['gestion-ingenieril', 'Gestión Ingenieril'],
  ['informatica-juridica', 'Informática Jurídica'],
  ['infraestructura-tecnologica', 'Infraestructura Tecnológica'],
  ['introduccion-a-la-practica-profesional', 'Introducción a la Práctica Profesional'],
  ['lenguaje-de-programacion-java', 'Lenguaje de Programación JAVA'],
  ['metodologia-de-la-investigacion', 'Metodología de la Investigación'],
  ['practicas-profesionales-supervisadas', 'Practicas Profesionales Supervisadas'],
  ['quimica', 'Química'],
  ['sistemas-de-informacion-geografica', 'Sistemas de Información Geográfica'],
  ['sistemas-de-representacion', 'Sistemas de Representación'],
  ['soporte-a-la-gestion-de-datos-con-programacion-visual', 'Soporte a la Gestión de Datos con Programación Visual'],
  ['tecnologias-de-desarrollo-de-software-ide', 'Tecnologías de Desarrollo de Software IDE'],
];

const VACIAS = new Set(['a', 'con', 'de', 'del', 'e', 'el', 'en', 'la', 'las', 'los', 'para', 'y']);
const ROMANOS = { 1: 'i', 2: 'ii', 3: 'iii', 4: 'iv' };
const palabras = (texto) =>
  normalizar(texto)
    .split(/[^a-z0-9]+/)
    .filter((p) => p && !VACIAS.has(p))
    .map((p) => ROMANOS[p] ?? p);

const CONOCIDAS = MATERIAS_SANTO.map(([slug, nombre]) => ({ slug, nombre, palabras: palabras(nombre) }));

/** The summary of a campus course in El Santo Resumen, as { url, nombre, slug }, or null if none matches. */
export function resumenDe(nombreCurso) {
  const del = new Set(palabras(nombreCurso));
  if (!del.size) return null;
  let mejor = null;
  for (const m of CONOCIDAS) {
    if (m.palabras.every((p) => del.has(p)) && (!mejor || m.palabras.length > mejor.palabras.length)) mejor = m;
  }
  return mejor ? { url: `${SANTO}/${mejor.slug}/`, nombre: mejor.nombre, slug: mejor.slug } : null;
}

// The subjects of the plan, first to fifth year, as El Santo Resumen lists them (`anio` 1 to 5 in materias.json). The
// rest of its subjects are electives. Proyecto Final is in the plan too, though El Santo Resumen has no page for it.
const TRONCALES = new Set([
  'analisis-matematico-i',
  'algebra-y-geometria-analitica',
  'fisica-i',
  'ingles-i',
  'logica-y-estructuras-discretas',
  'algoritmos-y-estructuras-de-datos',
  'arquitectura-de-computadoras',
  'sistemas-y-procesos-de-negocio',
  'analisis-matematico-ii',
  'fisica-ii',
  'ingenieria-y-sociedad',
  'ingles-ii',
  'sintaxis-y-semantica-de-los-lenguajes',
  'paradigmas-de-programacion',
  'sistemas-operativos',
  'analisis-de-sistemas-de-informacion',
  'probabilidad-y-estadistica',
  'economia',
  'bases-de-datos',
  'desarrollo-de-software',
  'comunicacion-de-datos',
  'analisis-numerico',
  'diseno-de-sistemas-de-informacion',
  'legislacion',
  'ingenieria-y-calidad-de-software',
  'redes-de-datos',
  'investigacion-operativa',
  'simulacion',
  'tecnologias-para-la-automatizacion',
  'administracion-de-sistemas-de-informacion',
  'inteligencia-artificial',
  'ciencia-de-datos',
  'sistemas-de-gestion',
  'gestion-gerencial',
  'seguridad-en-los-sistemas-de-informacion',
]);
const DEL_PLAN = [...CONOCIDAS.filter((m) => TRONCALES.has(m.slug)).map((m) => m.palabras.join(' ')), 'proyecto final'];

/** Whether a subject of Sysacad is one of the plan, by its whole name, or by its start when Sysacad cut it. */
export function esTroncal(nombre) {
  const suyo = palabras(nombre).join(' ');
  return Boolean(suyo) && DEL_PLAN.some((t) => t === suyo || (suyo.length >= 25 && t.startsWith(suyo)));
}

export const nombreDeMateria = (slug) => MATERIAS_SANTO.find(([s]) => s === slug)?.[1] ?? '';

// What this site asks El Santo Resumen, and nothing else: its index of official pages (a static file, the same one its
// own search uses), its bank of summaries, the text of those summaries (for Consultron) and its tips. No account and
// nothing of the campus goes: only the subject
// and, when searching the bank, the words typed, which the service does not keep. Everything that comes back is text
// written by someone else. It is shown as text, and a link is only ever built here, from ids checked by shape.
export const INDICE = `${SANTO}/_/indice-carrera.json`;
export const SERVICIO = 'https://lomhlulbgfovtnljbqzp.supabase.co/functions/v1/utn';

/** The formats of the bank, as El Santo Resumen names them. */
export const FORMATOS = { pdf: 'PDF', docx: 'Word', pptx: 'PowerPoint', html: 'HTML', 'google-docs': 'Google Docs', 'google-slides': 'Google Slides' };
export const INSTANCIAS = { 'parcial-1': '1° parcial', 'parcial-2': '2° parcial', 'parcial-3': '3° parcial', 'parcial-4': '4° parcial', final: 'Final' };
export const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const PAGINA = /^[a-z0-9-]+\.html$/;
const MARCA_ABRE = '\u0002';
const MARCA_CIERRA = '\u0003';

// Controls out (line breaks stay), cut to a size. Anything that is not a string is nothing.
// eslint-disable-next-line no-control-regex
export const limpio = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').slice(0, max).trim() : '');
const numero = (v) => (Number.isFinite(v) && v >= 0 ? v : 0);

const falla = (texto) => Object.assign(new Error(texto), { conocido: true });
export const SIN_RESPUESTA = 'El Santo Resumen no responde ahora. Probá de nuevo en un rato.';
export const SIN_RED = 'No se pudo llegar a El Santo Resumen. Revisá internet y probá de nuevo.';

async function pedirJson(url, opciones = {}) {
  let r;
  try {
    r = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer', ...opciones });
  } catch {
    throw falla(SIN_RED);
  }
  if (!r.ok) throw falla(SIN_RESPUESTA);
  try {
    return await r.json();
  } catch {
    throw falla(SIN_RESPUESTA);
  }
}

// Once per tab: the index weighs about 1 MB and changes only when El Santo Resumen publishes. A failure is not kept,
// so trying again asks again.
const guardados = new Map();
function unaVez(clave, fn) {
  if (!guardados.has(clave)) guardados.set(clave, fn().catch((e) => { guardados.delete(clave); throw e; }));
  return guardados.get(clave);
}
export const olvidarSanto = () => guardados.clear();

export const urlDePagina = (slug, pagina, ancla = '') =>
  `${SANTO}/${slug}/${pagina === 'index.html' ? '' : pagina}${ancla ? `#${ancla}` : ''}`;
export const urlDeResumen = (slug, id) => `${SANTO}/banco.html?materia=${slug}#r-${id}`;

/** The official index as it comes, checked: subjects with a valid slug, entries with a valid page and anchor. */
export function leerIndice(datos) {
  if (!Array.isArray(datos)) return [];
  return datos
    .filter((m) => m && SLUG.test(m.s) && Array.isArray(m.e))
    .map((m) => {
      const nombre = limpio(m.n, 120) || nombreDeMateria(m.s) || m.s;
      return {
        slug: m.s,
        nombre,
        nn: normalizar(nombre),
        entradas: m.e
          .filter((e) => Array.isArray(e) && PAGINA.test(e[0]) && SLUG.test(e[2] ?? '') && limpio(e[3], 160))
          .map(([pagina, nombrePagina, ancla, titulo, texto]) => {
            const t = limpio(titulo, 160);
            const x = limpio(texto, 300);
            return { pagina, nombrePagina: limpio(nombrePagina, 80) || 'Apunte', ancla, titulo: t, texto: x, nt: normalizar(t), nx: normalizar(x) };
          }),
      };
    });
}

export const cargarIndice = () => unaVez('indice', async () => leerIndice(await pedirJson(INDICE)));

/** The pages of a subject, without searching: its study pages first, then its exercises, one item per page. */
export function paginasDe(indice, slug) {
  const materia = indice.find((m) => m.slug === slug);
  if (!materia) return [];
  const porPagina = new Map();
  for (const e of materia.entradas) {
    if (!porPagina.has(e.pagina)) porPagina.set(e.pagina, { primera: e, temas: 0 });
    porPagina.get(e.pagina).temas += 1;
  }
  // An exercise page («ej-…»), or a name that several pages share, groups them, and each one goes by its first title.
  const veces = new Map();
  for (const { primera } of porPagina.values()) veces.set(primera.nombrePagina, (veces.get(primera.nombrePagina) ?? 0) + 1);
  const grupos = new Map([['apuntes', { id: 'apuntes', nombre: 'Apuntes', items: [] }]]);
  for (const [pagina, { primera, temas }] of porPagina) {
    const repetida = pagina.startsWith('ej-') || veces.get(primera.nombrePagina) > 1;
    const grupo = repetida ? primera.nombrePagina : 'apuntes';
    if (!grupos.has(grupo)) grupos.set(grupo, { id: grupo, nombre: primera.nombrePagina, items: [] });
    grupos.get(grupo).items.push({
      url: urlDePagina(slug, pagina),
      titulo: repetida ? primera.titulo : `${primera.nombrePagina} de ${materia.nombre}`,
      nombre: repetida ? primera.titulo : primera.nombrePagina,
      dato: temas === 1 ? 'Un tema' : `${temas} temas`,
    });
  }
  return [...grupos.values()].filter((g) => g.items.length);
}

function trozo(texto, nx, palabras) {
  const i = palabras.map((w) => nx.indexOf(w)).filter((n) => n >= 0).sort((a, b) => a - b)[0];
  if (i === undefined) return texto.slice(0, 120);
  const desde = Math.max(0, i - 40);
  return `${desde ? '…' : ''}${texto.slice(desde, i + 100)}${i + 100 < texto.length ? '…' : ''}`;
}

/** Sections of the official pages that have every word, in the subject or in all of them, the best first. */
export function buscarOficial(indice, consulta, slug = '', tope = 40) {
  const palabras = normalizar(consulta).split(/\s+/).filter(Boolean);
  if (!palabras.length) return [];
  const hallados = [];
  for (const m of slug ? indice.filter((x) => x.slug === slug) : indice) {
    for (const e of m.entradas) {
      let puntos = 0;
      const todas = palabras.every((w) => {
        const enTitulo = e.nt.includes(w);
        const enTexto = e.nx.includes(w);
        const enMateria = !slug && m.nn.includes(w);
        puntos += (enTitulo ? 3 : 0) + (enTexto ? 1 : 0) + (enMateria ? 1 : 0);
        return enTitulo || enTexto || enMateria;
      });
      if (todas) hallados.push({ m, e, puntos });
    }
  }
  return hallados
    .sort((a, b) => b.puntos - a.puntos)
    .slice(0, tope)
    .map(({ m, e }) => ({
      url: urlDePagina(m.slug, e.pagina, e.ancla),
      titulo: e.titulo,
      nombre: e.titulo,
      dato: slug ? e.nombrePagina : `${m.nombre}, ${e.nombrePagina}`,
      trozo: trozo(e.texto, e.nx, palabras),
    }));
}

/** The published summaries of the bank, checked. */
export function leerBanco(datos) {
  const lista = Array.isArray(datos?.resumenes) ? datos.resumenes : [];
  return lista
    .filter((r) => r && ID.test(r.id) && SLUG.test(r.materia) && limpio(r.titulo, 120))
    .map((r) => {
      const titulo = limpio(r.titulo, 120);
      const meGusta = numero(r.me_gusta);
      const autor = limpio(r.autor, 40);
      const formato = typeof r.tipo === 'string' && Object.hasOwn(FORMATOS, r.tipo) ? r.tipo : '';
      return {
        id: r.id,
        url: urlDeResumen(r.materia, r.id),
        titulo,
        nombre: titulo,
        materia: r.materia,
        materiaNombre: nombreDeMateria(r.materia),
        instancia: INSTANCIAS[r.instancia] ?? '',
        formato,
        // An HTML whose scripts El Santo Resumen lets run: they run only inside its reader, in another address.
        js: formato === 'html' && r.js === true,
        foto: leerFoto(r.foto),
        meGusta,
        autor,
        dato: [
          INSTANCIAS[r.instancia],
          meGusta === 1 ? 'un me gusta' : meGusta ? `${meGusta} me gusta` : '',
          autor ? `de ${autor}` : '',
        ].filter(Boolean).join(', '),
      };
    });
}

/** The text of the published summaries of a subject, for Consultron (017 of the service): [{ id, texto }], checked. */
export function leerTextos(datos) {
  const lista = Array.isArray(datos?.textos) ? datos.textos : [];
  return lista.flatMap((t) => {
    const texto = t && ID.test(t.id) && typeof t.texto === 'string' ? t.texto.slice(0, 50_000).trim() : '';
    return texto ? [{ id: t.id, texto }] : [];
  });
}

export const cargarTextos = (slug) => unaVez(`textos:${slug}`, async () => leerTextos(await pedirJson(`${SERVICIO}?a=textos&materia=${slug}`)));

export const cargarBanco = (slug = '') =>
  unaVez(`banco:${slug}`, async () => leerBanco(await pedirJson(`${SERVICIO}?a=banco${slug ? `&materia=${slug}` : ''}`)));

/** A fragment of the service as pieces of text, with what was found marked. Never HTML. */
export function partesDe(fragmento) {
  if (typeof fragmento !== 'string') return [];
  const partes = [];
  let marca = false;
  // eslint-disable-next-line no-control-regex
  for (const pedazo of fragmento.slice(0, 400).split(/([\u0002\u0003])/)) {
    if (pedazo === MARCA_ABRE || pedazo === MARCA_CIERRA) {
      marca = pedazo === MARCA_ABRE;
      continue;
    }
    // eslint-disable-next-line no-control-regex
    const texto = pedazo.replace(/[\u0000-\u001f\u007f]/g, ' ');
    if (texto) partes.push({ texto, marca });
  }
  return partes;
}

/** Searches inside the bank (title, tags and text). The words go in the body, never in the address. */
export async function buscarEnBanco(consulta, slug = '') {
  const q = consulta.trim().slice(0, 100);
  if (q.length < 2) return [];
  const [banco, hallados] = await Promise.all([
    cargarBanco(slug),
    pedirJson(`${SERVICIO}?a=buscar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(slug ? { q, materia: slug } : { q }) }),
  ]);
  const porId = new Map(banco.map((r) => [r.id, r]));
  const resultados = Array.isArray(hallados?.resultados) ? hallados.resultados : [];
  return resultados.filter((h) => porId.has(h?.id)).map((h) => ({ ...porId.get(h.id), partes: partesDe(h.fragmento) }));
}

// ---------- The photo of the first page ----------
// El Santo Resumen takes it (migration 015 of its service) and `banco` and `cvg-resumenes` send it with each summary
// that has one: { url, ancho, alto }. Only from its public folder of photos, with the name and the sizes the service
// gives them. Anything else is no photo, and the card shows its cover.
const FOTOS = `${new URL(SERVICIO).origin}/storage/v1/object/public/fotos/`;
const NOMBRE_FOTO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/\d{1,9}-[0-9a-f]{32}\.(?:webp|jpg)$/;
const entre = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;

/** The photo of a summary, checked, or null. */
export function leerFoto(f) {
  const deFotos = (u) => typeof u === 'string' && u.startsWith(FOTOS) && NOMBRE_FOTO.test(u.slice(FOTOS.length));
  if (!f || !deFotos(f.url)) return null;
  if (!entre(f.ancho, 200, 800) || !entre(f.alto, 100, 1600)) return null;
  // The one of its dark theme, only for an HTML whose page has one.
  return { url: f.url, ancho: f.ancho, alto: f.alto, ...(deFotos(f.oscura) && f.oscura !== f.url ? { oscura: f.oscura } : {}) };
}

/** The tips of a subject, checked, in the order of El Santo Resumen. */
export function leerConsejos(datos) {
  const lista = Array.isArray(datos?.consejos) ? datos.consejos : [];
  return lista
    .filter((c) => c && ID.test(c.id) && limpio(c.texto, 1500))
    .map((c) => ({
      id: c.id,
      usuario: limpio(c.usuario, 40) || 'alguien',
      // eslint-disable-next-line no-control-regex
      texto: c.texto.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').slice(0, 1500).trim(),
      prom: Number.isFinite(c.prom) ? Math.min(5, Math.max(0, c.prom)) : null,
      votos: numero(c.n),
    }));
}

export const cargarConsejos = (slug) =>
  unaVez(`consejos:${slug}`, async () => leerConsejos(await pedirJson(`${SERVICIO}?a=consejos&materia=${slug}`)));

export const urlDeConsejos = (slug) => `${SANTO}/consejos.html?materia=${slug}`;

/** How a tip goes into the student's notes: who wrote it and where, then the tip itself. */
export const consejoComoNota = (c) => `Consejo de ${c.usuario} en El Santo Resumen:\n${c.texto}`;

/** The notes with the tips added at the end, as many as fit in `max`. */
export function sumarANota(nota, consejos, max) {
  let texto = nota;
  let entraron = 0;
  for (const c of consejos) {
    const nuevo = texto.trim() ? `${texto.replace(/\s+$/, '')}\n\n${consejoComoNota(c)}` : consejoComoNota(c);
    if (nuevo.length > max) break;
    texto = nuevo;
    entraron += 1;
  }
  return { texto, entraron };
}
