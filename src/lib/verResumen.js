// Opens a published summary of El Santo Resumen inside Super CVG, without going there: a PDF as its bytes (drawn by
// VisorPdf), an HTML as its text (shown in a sandboxed frame, with no scripts, or, if its scripts were turned on there,
// its original in the reader of demo.lutastudios.com), a Word or PowerPoint as the text El Santo Resumen extracts.
// Each one counts the reading or the download there, as when it is opened there. Each one takes a signal to stop it.
import { ID, SERVICIO, SIN_RED, SIN_RESPUESTA } from './santoResumen';

export const NO_ESTA = 'Ese resumen ya no está en el banco.';
const MUY_GRANDE = 'Este PDF es muy grande para verlo acá. Bajalo para abrirlo.';
// El Santo Resumen takes files of up to 15 MB: a bigger answer is not one of them.
const TOPE_PDF = 20 * 1024 * 1024;
const TOPE_HTML = 3_000_000;
// The original goes whole to the reader of demo.lutastudios.com, which takes up to this (TOPE in visor.js), the same
// as in El Santo Resumen. A simulation with its scripts can weigh 5 MB.
export const TOPE_ORIGINAL = 6 * 1024 * 1024;
const TOPE_VISTA = 400_000;

const falla = (texto, codigo) => Object.assign(new Error(texto), { conocido: true, codigo });

/** How each format opens here. */
export const FORMA = { pdf: 'pdf', html: 'html', docx: 'vista', pptx: 'vista', 'google-docs': 'afuera', 'google-slides': 'afuera' };

/** Where a summary downloads from (a Google one goes to Google). Built only from its id. */
export const urlDeBajar = (id) => (ID.test(id) ? `${SERVICIO}?a=bajar&id=${id}` : null);

async function traer(ruta, id, senal, extra = '') {
  if (!ID.test(id)) throw falla(NO_ESTA, 'id');
  let r;
  try {
    r = await fetch(`${SERVICIO}?a=${ruta}&id=${id}${extra}`, { credentials: 'omit', referrerPolicy: 'no-referrer', signal: senal });
  } catch (e) {
    if (e?.name === 'AbortError') throw e;
    throw falla(SIN_RED, 'red');
  }
  if (r.status === 404) throw falla(NO_ESTA, 'no-existe');
  if (!r.ok) throw falla(SIN_RESPUESTA, 'servicio');
  return r;
}

/** The bytes of a PDF, checked: no bigger than any El Santo Resumen takes, and starting as a PDF does. */
export async function traerPdf(id, senal) {
  const r = await traer('bajar', id, senal);
  if (Number(r.headers.get('content-length')) > TOPE_PDF) throw falla(MUY_GRANDE, 'muy-grande');
  const bytes = await r.arrayBuffer();
  if (bytes.byteLength > TOPE_PDF) throw falla(MUY_GRANDE, 'muy-grande');
  const inicio = new TextDecoder().decode(new Uint8Array(bytes, 0, Math.min(5, bytes.byteLength)));
  if (inicio !== '%PDF-') throw falla(SIN_RESPUESTA, 'no-pdf');
  return new Blob([bytes], { type: 'application/pdf' });
}

/** The text of an HTML summary, as El Santo Resumen keeps it (already cleaned there). It only goes into a frame
 * without scripts. */
export async function traerHtml(id, senal) {
  const r = await traer('ver', id, senal);
  const texto = await r.text();
  if (!texto.trim()) throw falla(SIN_RESPUESTA, 'vacio');
  return texto.slice(0, TOPE_HTML);
}

/** The original of an HTML, with its scripts, only where El Santo Resumen says they run (a 404 if not). Never cut:
 * half a script could leave the page blank. */
async function traerOriginal(id, senal) {
  const r = await traer('ver', id, senal, '&js=1');
  const texto = await r.text();
  if (!texto.trim()) throw falla(SIN_RESPUESTA, 'vacio');
  if (texto.length > TOPE_ORIGINAL) throw falla(SIN_RESPUESTA, 'muy-grande');
  return texto;
}

/** An HTML summary as it opens here. One whose scripts were turned on there (`js`) comes as its original, for the
 * reader of demo.lutastudios.com (`scripts: true`); if not, or if that fails, the cleaned copy as always, ready for a
 * frame without scripts. */
export async function traerParaLeer(id, js, senal) {
  if (js) {
    try {
      return { scripts: true, html: await traerOriginal(id, senal) };
    } catch (e) {
      if (e?.name === 'AbortError') throw e;
    }
  }
  const texto = await traerHtml(id, senal);
  return { scripts: false, documento: documentoAislado(texto), formulas: tieneFormulas(texto) };
}

/** The text El Santo Resumen took out of a Word or PowerPoint, and whether it goes on in the file. */
export async function traerVista(id, senal) {
  const r = await traer('vista', id, senal);
  const datos = await r.json().catch(() => null);
  if (!datos || typeof datos.texto !== 'string') throw falla(SIN_RESPUESTA, 'servicio');
  return { texto: datos.texto.slice(0, TOPE_VISTA), cortado: datos.cortado === true || datos.texto.length > TOPE_VISTA };
}

// Formulas written for KaTeX, which El Santo Resumen draws. Here they show as they were typed.
const FORMULA = /\\\[|\\\(|\$\$|\\begin\{/;
export const tieneFormulas = (html) => FORMULA.test(html);

const AFUERA = /^(https?:|mailto:)/i;
// Drawings and formulas can carry links and animations of their own: they go whole.
const QUITAR = 'script, noscript, link, base, iframe, frame, frameset, object, embed, form, svg, math';
// Handlers, and where a link would open or go besides its href: only the ones put here stay.
const ATRIBUTO_QUITADO = /^(on.*|target|xlink:href)$/i;
const POLITICA = 'content-security-policy';
// Styles that change with the theme of the page around: a night mode of its own.
const SIGUE_EL_TEMA = /prefers-color-scheme|light-dark\(/i;

/** The HTML ready for a sandboxed frame (no scripts, no forms, no own origin). Whatever could run is taken out once
 * more. A link out opens in another tab, without saying where it came from; «#x» moves inside the summary, as in El
 * Santo Resumen (inside a frame made from text, a bare «#x» would load Super CVG in it). */
export function documentoAislado(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll(QUITAR).forEach((n) => n.remove());
  // The policy El Santo Resumen writes in its clean copy stays. Any other order to the page (a redirection) goes, and so
  // does a referrer rule of its own, which would win over the one put here.
  for (const m of doc.querySelectorAll('meta[http-equiv], meta[name]')) {
    const orden = m.getAttribute('http-equiv');
    if (orden !== null ? orden.trim().toLowerCase() !== POLITICA : m.getAttribute('name').trim().toLowerCase() === 'referrer') m.remove();
  }
  for (const el of doc.querySelectorAll('*')) {
    for (const { name } of [...el.attributes]) if (ATRIBUTO_QUITADO.test(name)) el.removeAttribute(name);
  }
  for (const a of doc.querySelectorAll('a[href], area[href]')) {
    const href = a.getAttribute('href').trim();
    if (href.startsWith('#')) {
      a.setAttribute('href', `about:srcdoc${href}`);
    } else if (AFUERA.test(href)) {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
    } else {
      a.removeAttribute('href');
    }
  }
  const nada = doc.createElement('meta');
  nada.name = 'referrer';
  nada.content = 'no-referrer';
  doc.head.prepend(nada);
  // A summary with its own night mode follows the theme of Super CVG (resumenes.css, .visor__marco): it says so, so its
  // scrollbar and controls go dark with it. One that says nothing of it stays as its author made it, light.
  if (!doc.querySelector('meta[name="color-scheme" i]') && SIGUE_EL_TEMA.test([...doc.querySelectorAll('style')].map((s) => s.textContent).join('\n'))) {
    const tema = doc.createElement('meta');
    tema.name = 'color-scheme';
    tema.content = 'light dark';
    doc.head.prepend(tema);
  }
  return `<!doctype html>\n${doc.documentElement.outerHTML}`;
}
