import * as Y from 'yjs';
import { enlaceSeguro } from '../datos';

// The shared document of a table's tab (Documento): rich text in a Y.XmlFragment under `datos.texto`, edited with
// TipTap in the tool. What is here works on plain data, without the editor: reading it back for Consultron, measuring
// it against the top, checking what a peer marks and turning the editor's JSON into Markdown or HTML to download.

// Past this many characters the tool stops showing it: a peer cannot freeze the page with a huge document.
export const MAX_DOC = 200_000;
export const MAX_CONSULTRON = 20_000;
const MAX_MARCA = 400;

/** The fragment of the document, or null if there is none yet (or what is there is not one). */
export function fragmentoDe(datos) {
  const f = datos.get('texto');
  return f instanceof Y.XmlFragment ? f : null;
}

/** The fragment, created empty if missing. Two who create it at once: one wins, and the other's editor follows it. */
export function asegurarFragmento(datos) {
  const f = fragmentoDe(datos);
  if (f) return f;
  datos.set('texto', new Y.XmlFragment());
  return datos.get('texto');
}

const BLOQUES = new Set(['paragraph', 'heading', 'codeBlock', 'blockquote', 'listItem', 'bulletList', 'orderedList', 'horizontalRule']);

// What the editor knows how to show. Anything else in the fragment (a peer can put anything there) breaks it.
const NODOS = new Set([...BLOQUES, 'hardBreak']);

/** 'ok', 'grande' (more than `tope` characters: it stops counting there) or 'roto' (something the editor cannot show). */
export function revisar(fragmento, tope = MAX_DOC) {
  let total = 0;
  const pila = fragmento.toArray();
  while (pila.length) {
    const t = pila.pop();
    if (t instanceof Y.XmlText) {
      total += t.length;
    } else if (t instanceof Y.XmlElement && NODOS.has(t.nodeName)) {
      total += 1;
      t.toArray().forEach((h) => pila.push(h));
    } else {
      return 'roto';
    }
    if (total > tope) return 'grande';
  }
  return 'ok';
}

export const pasaDelTope = (fragmento, tope = MAX_DOC) => revisar(fragmento, tope) !== 'ok';

/** The document as plain text, cut to `max`: titles with #, list items with a dash. */
export function textoPlano(fragmento, max = MAX_CONSULTRON) {
  if (!fragmento || pasaDelTope(fragmento)) return '';
  let salida = '';
  const recorrer = (t) => {
    if (salida.length > max) return;
    if (t instanceof Y.XmlText) {
      t.toDelta().forEach((d) => {
        if (typeof d.insert === 'string') salida += d.insert;
      });
      return;
    }
    if (!(t instanceof Y.XmlElement) && !(t instanceof Y.XmlFragment)) return;
    const nombre = t instanceof Y.XmlElement ? t.nodeName : '';
    if (nombre === 'heading') salida += `${'#'.repeat(Math.min(Math.max(Number(t.getAttribute('level')) || 1, 1), 6))} `;
    if (nombre === 'listItem') salida += '- ';
    if (nombre === 'hardBreak') salida += '\n';
    t.toArray().forEach(recorrer);
    if (BLOQUES.has(nombre) && !salida.endsWith('\n')) salida += '\n';
  };
  recorrer(fragmento);
  return salida.trim().slice(0, max);
}

/** The typefaces the Documento offers. The first is the page's own (no mark); the others go as a mark `letra` with the
 * id, never a font name: a peer cannot put another one. `pila` is the CSS family, for the downloaded page. */
export const LETRAS = [
  { id: 'barlow', nombre: 'Barlow', pila: 'Barlow, system-ui, sans-serif' },
  { id: 'kalam', nombre: 'Kalam', pila: "Kalam, 'Segoe Print', 'Comic Sans MS', cursive" },
  { id: 'serifa', nombre: 'Con serifa', pila: "Georgia, 'Times New Roman', serif" },
  { id: 'mono', nombre: 'Monoespaciada', pila: "ui-monospace, 'Cascadia Mono', Consolas, monospace" },
];

/** The id of a typeface of the list other than the page's own, or null. */
export function letraSegura(v) {
  return typeof v === 'string' && v !== 'barlow' && LETRAS.some((l) => l.id === v) ? v : null;
}

/** Only http and https links: anything else (javascript:, data:) is not a link. The site's rule (`enlaceSeguro`), so
 * a campus key in an address does not travel either. */
export const hrefSeguro = (url) => (typeof url === 'string' && url.length <= 2000 ? enlaceSeguro(url.trim()) : null);

/** What a peer marks in the document (its caret: two relative positions), checked; null if it does not read. */
export function marcaSegura(h) {
  if (!h || typeof h !== 'object' || !h.a || !h.c || typeof h.a !== 'object' || typeof h.c !== 'object') return null;
  try {
    if (JSON.stringify(h).length > MAX_MARCA) return null;
    return { a: Y.createRelativePositionFromJSON(h.a), c: Y.createRelativePositionFromJSON(h.c) };
  } catch {
    return null;
  }
}

/** A peer's color, only as #rrggbb: anything else gets the soft text color. */
export const colorSeguro = (c) => (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c : 'var(--texto-suave)');

// --- To download: the editor's JSON (ProseMirror) as Markdown or as a page of HTML. Everything is escaped.

const escaparHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const escaparMd = (s) => String(s).replace(/([\\`*_[\]<>#|])/g, '\\$1');
const hijos = (n) => (Array.isArray(n?.content) ? n.content : []);
const marcas = (n) => (Array.isArray(n?.marks) ? n.marks : []);

function enLineaMd(nodos) {
  return nodos.map((n) => {
    if (n.type === 'hardBreak') return '  \n';
    if (n.type !== 'text') return '';
    const tiene = (t) => marcas(n).find((m) => m?.type === t);
    if (tiene('code')) {
      const t = String(n.text ?? '');
      const cerca = t.includes('`') ? '`` ' : '`';
      return `${cerca}${t}${cerca.split('').reverse().join('')}`;
    }
    let t = escaparMd(n.text ?? '');
    if (tiene('bold')) t = `**${t}**`;
    if (tiene('italic')) t = `*${t}*`;
    if (tiene('strike')) t = `~~${t}~~`;
    const link = hrefSeguro(tiene('link')?.attrs?.href);
    if (link) t = `[${t}](${link.replace(/[()\s]/g, encodeURIComponent)})`;
    return t;
  }).join('');
}

function bloqueMd(n, prefijo = '') {
  switch (n?.type) {
    case 'heading': return `${'#'.repeat(Math.min(Math.max(Number(n.attrs?.level) || 1, 1), 6))} ${enLineaMd(hijos(n))}`;
    case 'paragraph': return enLineaMd(hijos(n));
    case 'codeBlock': return `\`\`\`\n${hijos(n).map((h) => h.text ?? '').join('').replace(/```/g, '`​``')}\n\`\`\``;
    case 'blockquote': return hijos(n).map((h) => bloqueMd(h)).join('\n\n').split('\n').map((l) => `> ${l}`).join('\n');
    case 'horizontalRule': return '---';
    case 'bulletList':
    case 'orderedList': {
      const inicio = Number(n.attrs?.start) || 1;
      return hijos(n).map((item, i) => {
        const marca = n.type === 'bulletList' ? '- ' : `${inicio + i}. `;
        const dentro = hijos(item).map((h) => bloqueMd(h)).join('\n\n').split('\n');
        return dentro.map((l, k) => (k === 0 ? marca : ' '.repeat(marca.length)) + l).join('\n');
      }).join('\n');
    }
    default: return prefijo;
  }
}

export function aMarkdown(json) {
  return `${hijos(json).map((n) => bloqueMd(n)).filter((b) => b !== '').join('\n\n')}\n`;
}

function enLineaHtml(nodos) {
  return nodos.map((n) => {
    if (n.type === 'hardBreak') return '<br>';
    if (n.type !== 'text') return '';
    const tiene = (t) => marcas(n).find((m) => m?.type === t);
    let t = escaparHtml(n.text ?? '');
    if (tiene('code')) t = `<code>${t}</code>`;
    if (tiene('bold')) t = `<strong>${t}</strong>`;
    if (tiene('italic')) t = `<em>${t}</em>`;
    if (tiene('strike')) t = `<s>${t}</s>`;
    if (tiene('underline')) t = `<u>${t}</u>`;
    const letra = letraSegura(tiene('letra')?.attrs?.cual);
    if (letra) t = `<span class="letra-${letra}">${t}</span>`;
    const link = hrefSeguro(tiene('link')?.attrs?.href);
    if (link) t = `<a href="${escaparHtml(link)}" rel="noopener noreferrer">${t}</a>`;
    return t;
  }).join('');
}

function bloqueHtml(n) {
  switch (n?.type) {
    case 'heading': {
      const nivel = Math.min(Math.max(Number(n.attrs?.level) || 1, 1), 6);
      return `<h${nivel}>${enLineaHtml(hijos(n))}</h${nivel}>`;
    }
    case 'paragraph': return `<p>${enLineaHtml(hijos(n))}</p>`;
    case 'codeBlock': return `<pre><code>${escaparHtml(hijos(n).map((h) => h.text ?? '').join(''))}</code></pre>`;
    case 'blockquote': return `<blockquote>${hijos(n).map(bloqueHtml).join('')}</blockquote>`;
    case 'horizontalRule': return '<hr>';
    case 'bulletList': return `<ul>${hijos(n).map((i) => `<li>${hijos(i).map(bloqueHtml).join('')}</li>`).join('')}</ul>`;
    case 'orderedList': {
      const inicio = Number(n.attrs?.start) || 1;
      return `<ol${inicio !== 1 ? ` start="${inicio}"` : ''}>${hijos(n).map((i) => `<li>${hijos(i).map(bloqueHtml).join('')}</li>`).join('')}</ol>`;
    }
    default: return '';
  }
}

// --- To keep («Guardar en lo mío»): the editor's JSON in the site's little formatting (formato.js): # headings,
// - lists, **bold**, *italic* and bare http(s) addresses. What it has no way to say goes as plain text.

/** Room for the text of a saved block (propiasSaneo keeps 20 000 characters, the name goes on the first line). */
export const MAX_GUARDAR = 19_500;

// A line that would be read as a heading and is not one (a comment in Python code): a space before it keeps it as
// it was written. One that starts with a dash stays a list item, as whoever wrote it meant.
const comoEsta = (linea) => (/^#{1,3}\s/.test(linea) ? ` ${linea}` : linea);

function enLineaFormato(nodos) {
  return nodos.map((n) => {
    if (n.type === 'hardBreak') return '\n';
    if (n.type !== 'text') return '';
    const tiene = (t) => marcas(n).find((m) => m?.type === t);
    let t = String(n.text ?? '');
    if (tiene('code')) return t;
    const link = hrefSeguro(tiene('link')?.attrs?.href);
    if (link && t.trim() !== link) t = `${t} (${link})`;
    else if (link) t = link;
    if (!t.trim() || link) return t;
    if (tiene('bold')) return `**${t}**`;
    if (tiene('italic')) return `*${t}*`;
    return t;
  }).join('');
}

const lineasDe = (texto) => texto.split('\n').map(comoEsta);

function bloqueFormato(n) {
  switch (n?.type) {
    case 'heading': return `# ${enLineaFormato(hijos(n)).replace(/\s*\n\s*/g, ' ').trim()}`;
    case 'paragraph': return lineasDe(enLineaFormato(hijos(n))).join('\n');
    case 'codeBlock': return lineasDe(hijos(n).map((h) => h.text ?? '').join('')).join('\n');
    case 'blockquote': return hijos(n).map(bloqueFormato).filter(Boolean).join('\n\n');
    case 'bulletList':
    case 'orderedList': {
      const inicio = Number(n.attrs?.start) || 1;
      return hijos(n).map((item, i) => {
        const dentro = hijos(item).map(bloqueFormato).filter(Boolean).join('\n').split('\n').map((l) => l.trim()).filter(Boolean);
        // Numbered: formato.js has no numbered list, so each one keeps its number as a line of the paragraph.
        if (n.type === 'orderedList') return comoEsta(`${inicio + i}. ${dentro.join(' ')}`);
        return dentro.map((l) => (/^- /.test(l) ? l : `- ${l}`)).join('\n');
      }).join('\n');
    }
    default: return '';
  }
}

export function aFormato(json) {
  return hijos(json).map(bloqueFormato).filter((b) => b.trim() !== '').join('\n\n');
}

/**
 * What «Guardar en lo mío» keeps of the document: its name (the tab's, or the first heading when the tab still has the
 * tool's name) and the text, cut at a line before MAX_GUARDAR. A first heading used as the name is not repeated.
 */
export function paraGuardarDocumento(json, tituloPestana) {
  const bloques = hijos(json);
  const primero = bloques[0]?.type === 'heading' ? enLineaFormato(hijos(bloques[0])).replace(/\s+/g, ' ').trim() : '';
  const propio = tituloPestana && tituloPestana !== 'Documento' ? tituloPestana : '';
  const nombre = (propio || primero || 'Documento').slice(0, 150);
  const resto = !propio && primero ? { ...json, content: bloques.slice(1) } : json;
  let texto = aFormato(resto);
  if (texto.length > MAX_GUARDAR) {
    const corte = texto.lastIndexOf('\n', MAX_GUARDAR - 2);
    texto = `${texto.slice(0, corte > MAX_GUARDAR / 2 ? corte : MAX_GUARDAR - 2).trimEnd()}\n…`;
  }
  return { nombre, texto };
}

export function aHtml(json, titulo = 'Documento') {
  return `<!doctype html>\n<html lang="es">\n<head>\n<meta charset="utf-8">\n<title>${escaparHtml(titulo)}</title>\n<style>\n${LETRAS.slice(1).map((l) => `.letra-${l.id} { font-family: ${l.pila}; }`).join('\n')}\n</style>\n</head>\n<body>\n${hijos(json).map(bloqueHtml).join('\n')}\n</body>\n</html>\n`;
}
