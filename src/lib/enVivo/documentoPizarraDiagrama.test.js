// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { crearSesion, redesLocales, CADA_CAMBIOS } from './sesion';
import { abrirPestana } from './mesa';
import { aHtml, aMarkdown, asegurarFragmento, fragmentoDe, hrefSeguro, LETRAS, letraSegura, marcaSegura, pasaDelTope, revisar, textoPlano, colorSeguro } from './documento';
import { agregar, apilarVarios, borrar as borrarDePizarra, borrarCerca, cambiarTexto, cambiarVarios, dentroDe, moverVarios, sinLoDelCirculo, leerElementos, limpiar, MAX_PUNTOS, MAX_TEXTO, textoPizarra, toca } from './pizarra';

// The three drawing and writing tools of the table (Documento, Pizarra, Diagrama de bloques): what one does reaches the
// other, and what a peer sends that does not read is left out or cut.

const abiertas = [];
function armar() {
  const redes = redesLocales(2);
  const sesiones = redes.map((red, k) => crearSesion({ red, yo: { nombre: `Alumno ${k}`, color: '#123456' } }));
  abiertas.push(...sesiones);
  return sesiones.map((s) => ({ s, datos: s.doc.getMap('h:p1') }));
}
const esperar = (ms = CADA_CAMBIOS + 40) => new Promise((r) => setTimeout(r, ms));

afterEach(() => {
  abiertas.splice(0).forEach((s) => s.cerrar());
});

function parrafo(texto, nombre = 'paragraph', attrs = {}) {
  const el = new Y.XmlElement(nombre);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  const t = new Y.XmlText();
  t.insert(0, texto);
  el.insert(0, [t]);
  return el;
}

describe('documento', () => {
  it('lo que escribe uno lo lee el otro, como texto', async () => {
    const [a, b] = armar();
    const f = asegurarFragmento(a.datos);
    f.insert(0, [parrafo('Integrales', 'heading', { level: 2 }), parrafo('por partes')]);
    await esperar();
    expect(textoPlano(fragmentoDe(b.datos))).toBe('## Integrales\npor partes');
  });

  it('la pestaña de un documento se abre con su texto ya hecho', () => {
    const doc = new Y.Doc();
    const id = abrirPestana(doc, 'documento', { titulo: 'Resumen' });
    expect(fragmentoDe(doc.getMap(`h:${id}`))).toBeInstanceOf(Y.XmlFragment);
  });

  it('un documento que pasa el tope no se lee', () => {
    const doc = new Y.Doc();
    const f = asegurarFragmento(doc.getMap('h'));
    f.insert(0, [parrafo('x'.repeat(250_000))]);
    expect(pasaDelTope(f)).toBe(true);
    expect(textoPlano(f)).toBe('');
  });

  it('lo que el editor no sabe mostrar marca el documento como roto', () => {
    const doc = new Y.Doc();
    const f = asegurarFragmento(doc.getMap('h'));
    f.insert(0, [parrafo('bien')]);
    expect(revisar(f)).toBe('ok');
    f.insert(1, [parrafo('x', 'iframe')]);
    expect(revisar(f)).toBe('roto');
    f.delete(1, 1);
    f.insert(0, [new Y.XmlFragment()]);
    expect(revisar(f)).toBe('roto');
  });

  it('si en el lugar del documento hay otra cosa, no hay documento', () => {
    const doc = new Y.Doc();
    doc.getMap('h').set('texto', 'no soy un fragmento');
    expect(fragmentoDe(doc.getMap('h'))).toBe(null);
  });

  it('solo links http y https', () => {
    expect(hrefSeguro('https://frro.utn.edu.ar/x')).toBe('https://frro.utn.edu.ar/x');
    expect(hrefSeguro('javascript:alert(1)')).toBe(null);
    expect(hrefSeguro('data:text/html,hola')).toBe(null);
    expect(hrefSeguro(42)).toBe(null);
    expect(hrefSeguro(' https://campus.example/x?wstoken=abc&id=3 ')).toBe('https://campus.example/x?id=3');
  });

  it('la marca de otro: solo si se lee, y su color solo como #rrggbb', () => {
    expect(marcaSegura(null)).toBe(null);
    expect(marcaSegura({ a: 'x', c: {} })).toBe(null);
    expect(marcaSegura({ a: { item: { client: 1, clock: 2 } }, c: { item: { client: 1, clock: 2 }, junk: 'x'.repeat(500) } })).toBe(null);
    expect(marcaSegura({ a: { item: { client: 1, clock: 2 }, assoc: 0 }, c: { item: { client: 1, clock: 3 }, assoc: 0 } })).not.toBe(null);
    expect(colorSeguro('#b4235a')).toBe('#b4235a');
    expect(colorSeguro('red;background:url(x)')).toBe('var(--texto-suave)');
  });

  it('se baja como Markdown y como HTML, con todo escapado y sin links raros', () => {
    const json = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Física <I>' }] },
        { type: 'paragraph', content: [
          { type: 'text', text: 'ver ', marks: [] },
          { type: 'text', text: 'acá', marks: [{ type: 'link', attrs: { href: 'https://a.com/b' } }, { type: 'bold' }] },
          { type: 'text', text: 'malo', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] },
        ] },
        { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'uno' }] }] }] },
        { type: 'codeBlock', content: [{ type: 'text', text: 'x = 1' }] },
      ],
    };
    expect(aMarkdown(json)).toBe('# Física \\<I\\>\n\nver [**acá**](https://a.com/b)malo\n\n- uno\n\n```\nx = 1\n```\n');
    const html = aHtml(json, 'Apunte <script>');
    expect(html).toContain('<h1>Física &lt;I&gt;</h1>');
    expect(html).toContain('<a href="https://a.com/b" rel="noopener noreferrer"><strong>acá</strong></a>malo');
    expect(html).toContain('<title>Apunte &lt;script&gt;</title>');
    expect(html).not.toContain('javascript');
  });
});

describe('tipografía del documento', () => {
  it('solo las de la lista: la del sitio no lleva marca y un nombre de otro no pasa', () => {
    expect(LETRAS.map((l) => l.id)).toEqual(['barlow', 'kalam', 'serifa', 'mono']);
    expect(letraSegura('kalam')).toBe('kalam');
    for (const malo of ['barlow', 'Comic Sans', "kalam; color: red", '', null, 3, { id: 'kalam' }]) expect(letraSegura(malo)).toBeNull();
  });

  it('al bajarlo como página web queda con su clase, y en Markdown se pierde', () => {
    const conLetra = (cual) => ({ type: 'text', text: cual, marks: [{ type: 'letra', attrs: { cual } }, { type: 'bold' }] });
    const json = { type: 'doc', content: [{ type: 'paragraph', content: [conLetra('kalam'), conLetra('x" onload="y'), conLetra('mono')] }] };
    const html = aHtml(json);
    expect(html).toContain('<span class="letra-kalam"><strong>kalam</strong></span>');
    expect(html).toContain('<span class="letra-mono"><strong>mono</strong></span>');
    expect(html).not.toContain('onload="');
    expect(html).toContain(".letra-kalam { font-family: Kalam, 'Segoe Print', 'Comic Sans MS', cursive; }");
    expect(aMarkdown(json)).toMatch(/^\*\*kalam\*\*.*\*\*mono\*\*\n$/);
    expect(aMarkdown(json)).not.toContain('letra');
  });
});

describe('pizarra', () => {
  it('lo que dibuja uno le aparece al otro, y lo que borra se va', async () => {
    const [a, b] = armar();
    const id = agregar(a.datos, { t: 'flecha', c: 2, g: 1, x1: 0, y1: 0, x2: 100, y2: 50 });
    agregar(a.datos, { t: 'texto', c: 0, x: 10, y: 10, s: 'G(s)', tam: 1 });
    await esperar();
    const vistos = leerElementos(b.datos);
    expect(vistos.map((e) => e.t)).toEqual(['flecha', 'texto']);
    expect(textoPizarra(vistos)).toContain('- G(s)');
    borrarDePizarra(b.datos, [id]);
    await esperar();
    expect(leerElementos(a.datos).map((e) => e.t)).toEqual(['texto']);
  });

  it('un texto ya escrito se escribe de nuevo donde está, con su color y su tamaño; el otro lo ve', async () => {
    const [a, b] = armar();
    const id = agregar(a.datos, { t: 'texto', c: 3, x: 40, y: 60, s: 'Primer parcial', tam: 2 });
    agregar(a.datos, { t: 'rect', c: 1, g: 1, x1: 0, y1: 0, x2: 10, y2: 10 });
    await esperar();
    const antes = leerElementos(b.datos).find((e) => e.id === id);
    expect(cambiarTexto(b.datos, id, 'Segundo parcial')).toBe(true);
    expect(cambiarTexto(b.datos, id, 'Segundo parcial')).toBe(false);
    expect(cambiarTexto(b.datos, id, '   ')).toBe(false);
    const rect = leerElementos(b.datos).find((e) => e.t === 'rect');
    expect(cambiarTexto(b.datos, rect.id, 'x')).toBe(false);
    await esperar();
    expect(leerElementos(a.datos).find((e) => e.id === id)).toEqual({ ...antes, s: 'Segundo parcial' });
  });

  it('varios a la vez: el rectángulo toma lo que queda entero adentro; mover, apilar y cambiar van en un solo paso', async () => {
    const [a, b] = armar();
    const uno = agregar(a.datos, { t: 'trazo', c: 0, g: 1, p: [10, 10, 40, 30] });
    const dos = agregar(a.datos, { t: 'rect', c: 1, g: 0, x1: 50, y1: 50, x2: 90, y2: 80 });
    const texto = agregar(a.datos, { t: 'texto', c: 2, x: 20, y: 120, s: 'Hola', tam: 0 });
    const lejos = agregar(a.datos, { t: 'elipse', c: 0, g: 0, x1: 300, y1: 300, x2: 340, y2: 320 });
    const todos = leerElementos(a.datos);
    expect(dentroDe(todos, 0, 0, 100, 100).map((e) => e.id).sort()).toEqual([uno, dos].sort());
    expect(dentroDe(todos, 100, 140, 0, 0).map((e) => e.id).sort()).toEqual([uno, dos, texto].sort());
    expect(dentroDe(todos, 0, 0, 80, 100).map((e) => e.id)).toEqual([uno]);
    const pasos = [];
    a.datos.doc.on('afterTransaction', () => pasos.push(1));
    moverVarios(a.datos, [uno, dos, 'nada'], 5, -5);
    apilarVarios(a.datos, [uno, dos], false);
    cambiarVarios(a.datos, [uno, texto], { c: 4, g: 2 });
    expect(pasos).toHaveLength(3);
    await esperar();
    const vistos = new Map(leerElementos(b.datos).map((e) => [e.id, e]));
    expect(vistos.get(uno).p).toEqual([15, 5, 45, 25]);
    expect(vistos.get(dos)).toMatchObject({ x1: 55, y1: 45, x2: 95, y2: 75 });
    expect(leerElementos(b.datos).slice(0, 2).map((e) => e.id)).toEqual([uno, dos]);
    expect(vistos.get(uno)).toMatchObject({ c: 4, g: 2 });
    expect(vistos.get(texto)).toMatchObject({ c: 4, tam: 0 });
    expect(vistos.get(texto).g).toBeUndefined();
    expect(vistos.get(lejos)).toMatchObject({ x1: 300, c: 0 });
  });

  it('lo que no se lee queda afuera, y lo largo se corta', () => {
    const doc = new Y.Doc();
    const datos = doc.getMap('h');
    const mapa = { set: (k, v) => datos.set(`e:${k}`, v) };
    datos.set('cual', 'no es un dibujo');
    mapa.set('a', { t: 'iframe', src: 'https://x' });
    mapa.set('b', { t: 'rect', x1: 'x', y1: 0, x2: 1, y2: 1 });
    mapa.set('c', { t: 'trazo', p: [0, 0, NaN, 1] });
    mapa.set('d', 'hola');
    mapa.set('e', { t: 'texto', x: 0, y: 0, s: 'y'.repeat(5000), c: 99, tam: -3 });
    mapa.set('f', { t: 'trazo', c: 1, g: 0, p: Array.from({ length: 10_000 }, (_, i) => i) });
    mapa.set('g', { t: 'linea', x1: 1e12, y1: 0, x2: 0, y2: 0 });
    const lista = leerElementos(datos);
    expect(lista.map((e) => e.id).sort()).toEqual(['e', 'f', 'g']);
    const texto = lista.find((e) => e.id === 'e');
    expect(texto.s).toHaveLength(MAX_TEXTO);
    expect([texto.c, texto.tam]).toEqual([0, 0]);
    expect(lista.find((e) => e.id === 'f').p).toHaveLength(MAX_PUNTOS * 2);
    expect(lista.find((e) => e.id === 'g').x1).toBe(100_000);
  });

  it('la goma toca lo que tiene cerca', () => {
    const linea = limpiar('l', { t: 'linea', g: 0, x1: 0, y1: 0, x2: 100, y2: 0 });
    expect(toca(linea, 50, 4, 4)).toBe(true);
    expect(toca(linea, 50, 30, 4)).toBe(false);
    const trazo = limpiar('t', { t: 'trazo', g: 0, p: [0, 0, 10, 10, 20, 0] });
    expect(toca(trazo, 10, 9, 2)).toBe(true);
  });

  it('la goma corta un trazo donde pasa y deja lo demás en pedazos', () => {
    expect(sinLoDelCirculo([0, 0, 100, 0], 50, 0, 10)).toEqual([[0, 0, 40, 0], [60, 0, 100, 0]]);
    expect(sinLoDelCirculo([0, 0, 100, 0], 50, 30, 10)).toEqual([[0, 0, 100, 0]]);
    expect(sinLoDelCirculo([0, 0, 10, 0], 5, 0, 20)).toEqual([]);
    const datos = new Y.Doc().getMap('pizarra');
    agregar(datos, { t: 'trazo', g: 0, p: [0, 0, 50, 0, 100, 0] });
    agregar(datos, { t: 'trazo', g: 0, p: [0, 200, 100, 200] });
    expect(borrarCerca(datos, 50, 0, 8)).toBe(true);
    const quedan = leerElementos(datos);
    expect(quedan).toHaveLength(3);
    expect(quedan.filter((e) => e.p[1] === 0).map((e) => [e.p[0], e.p.at(-2)]).sort((a, b) => a[0] - b[0])).toEqual([[0, 41], [59, 100]]);
  });

  it('un rectángulo o una elipse pierden lo de su línea que toca la goma, no su adentro; un texto se va entero', () => {
    const datos = new Y.Doc().getMap('pizarra');
    agregar(datos, { t: 'rect', g: 0, x1: 0, y1: 0, x2: 200, y2: 100 });
    agregar(datos, { t: 'elipse', g: 0, x1: 300, y1: 0, x2: 500, y2: 100 });
    expect(borrarCerca(datos, 100, 50, 8)).toBe(false);
    expect(borrarCerca(datos, 400, 50, 8)).toBe(false);
    expect(leerElementos(datos)).toHaveLength(2);
    // Touching their line, they lose that bit and the rest stays as one open stroke each.
    expect(borrarCerca(datos, 100, 2, 8)).toBe(true);
    expect(borrarCerca(datos, 400, 99, 8)).toBe(true);
    const quedan = leerElementos(datos);
    expect(quedan.every((e) => e.t === 'trazo')).toBe(true);
    expect(quedan).toHaveLength(2);
    quedan.forEach((e) => borrarDePizarra(datos, [e.id]));
    agregar(datos, { t: 'texto', x: 0, y: 30, s: 'Hola', tam: 0 });
    expect(borrarCerca(datos, 10, 25, 8)).toBe(true);
    expect(leerElementos(datos)).toHaveLength(0);
  });
});
