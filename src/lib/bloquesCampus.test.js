import { describe, expect, it } from 'vitest';
import { leerBloques } from './bloquesCampus';
import { iconoDeEnlace } from './simbolos';

const texto = (partes) => partes.map((p) => p.texto).join('');

describe('los textos del campus con su forma', () => {
  it('títulos, subtítulos, listas y párrafos como en el campus', () => {
    const html = `<h4>🏢 U1 - Gobierno de TI - Planeamiento Estratégico</h4>
      <h5>Contenidos</h5>
      <ul><li>Marco Conceptual del Gobierno de TIC. Implementación.<br>Ciclo de vida.</li><li>Diferencia entre Gobierno y Gestión de TIC.</li></ul>
      <p>Materiales de <strong>Clase</strong></p>`;
    const b = leerBloques(html);
    expect(b.map((x) => x.tipo)).toEqual(['titulo', 'titulo', 'lista', 'parrafo']);
    expect(b[0].nivel).toBe(1);
    expect(texto(b[0].partes)).toBe('🏢 U1 - Gobierno de TI - Planeamiento Estratégico');
    expect(b[1].nivel).toBe(2);
    expect(b[2].items.map(texto)).toEqual(['Marco Conceptual del Gobierno de TIC. Implementación. Ciclo de vida.', 'Diferencia entre Gobierno y Gestión de TIC.']);
    expect(b[3].lineas[0]).toEqual([{ tipo: 'texto', texto: 'Materiales de ' }, { tipo: 'negrita', texto: 'Clase' }]);
  });

  it('una lista adentro de otra sigue como ítems, y los saltos arman líneas del párrafo', () => {
    const b = leerBloques('<ul><li>Uno<ul><li>Uno a</li></ul></li><li>Dos</li></ul><p>Línea 1<br>Línea 2</p>');
    expect(b[0].items.map(texto)).toEqual(['Uno', 'Uno a', 'Dos']);
    expect(b[1].lineas.map(texto)).toEqual(['Línea 1', 'Línea 2']);
  });

  it('enlaces solo http(s), sin scripts, imágenes ni atributos', () => {
    const b = leerBloques('<p><a href="https://drive.google.com/x">Carpeta</a> <a href="javascript:alert(1)">malo</a><script>robar()</script><img src=x onerror="robar()"><span style="color:red" onclick="x()">rojo</span></p>');
    const linea = b[0].lineas[0];
    expect(linea[0]).toEqual({ tipo: 'enlace', url: 'https://drive.google.com/x', texto: 'Carpeta' });
    expect(texto(linea)).toBe('Carpeta malorojo');
    expect(JSON.stringify(b)).not.toMatch(/robar|onerror|onclick|style|javascript/);
  });

  it('sin dibujos ni fórmulas, que llegan en minúsculas, y un enlace solo con lo que se lee', () => {
    const b = leerBloques('<p>Hola<svg><style>.x{}</style><text>dibujo</text></svg><math><mi>raiz</mi></math> <a href="https://x.com/a">Apunte<style>.y{}</style><script>robar()</script><svg><text>logo</text></svg></a></p>');
    const linea = b[0].lineas[0];
    expect(texto(linea)).toBe('Hola Apunte');
    expect(linea.at(-1)).toEqual({ tipo: 'enlace', url: 'https://x.com/a', texto: 'Apunte' });
    expect(JSON.stringify(b)).not.toMatch(/dibujo|raiz|robar|logo|\.x|\.y/);
  });

  it('nada si no hay texto, y corta en el tope', () => {
    expect(leerBloques('')).toEqual([]);
    expect(leerBloques('<p> </p><img src="x">')).toEqual([]);
    const largo = Array.from({ length: 50 }, (_, i) => `<p>${'x'.repeat(100)} ${i}</p>`).join('');
    expect(leerBloques(largo, 1000).length).toBeLessThan(15);
  });
});

describe('los enlaces conocidos con su dibujo y color', () => {
  it.each([
    ['https://docs.google.com/document/d/1/edit', 'documento', 'doc'],
    ['https://docs.google.com/spreadsheets/d/1', 'planilla', 'planilla'],
    ['https://docs.google.com/presentation/d/1', 'presentacion', 'presentacion'],
    ['https://docs.google.com/forms/d/e/1/viewform', 'formulario', 'formulario'],
    ['https://forms.gle/abc', 'formulario', 'formulario'],
    ['https://forms.office.com/r/abc', 'formulario', 'formulario'],
    ['https://sheets.google.com/x', 'planilla', 'planilla'],
    ['https://slides.google.com/x', 'presentacion', 'presentacion'],
    ['https://drive.google.com/drive/folders/1', 'carpeta', 'drive'],
    ['https://utn.zoom.us/j/123', 'videollamada', 'videollamada'],
    ['https://meet.google.com/abc-defg-hij', 'videollamada', 'videollamada'],
    ['https://github.com/alguien/repo', 'codigo', 'codigo'],
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'video', 'video'],
    ['https://ejemplo.com/docs.google.com/document', 'enlace', 'enlace'],
    ['https://forms.gle.evil.com/x', 'enlace', 'enlace'],
    ['https://forms.google.com.evil.com/x', 'enlace', 'enlace'],
    ['https://forms.office.com.evil.com/x', 'enlace', 'enlace'],
    ['https://sheets.google.com.evil.com/x', 'enlace', 'enlace'],
    ['https://slides.google.com.evil.com/x', 'enlace', 'enlace'],
    ['no es una dirección', 'enlace', 'enlace'],
  ])('%s', (url, simbolo, tono) => {
    expect(iconoDeEnlace(url)).toEqual({ simbolo, tono });
  });
});

describe('las líneas que son solo enlaces van como tarjetas', () => {
  it('saca los ítems y líneas de solo enlaces, deja los que están en una frase', async () => {
    const { sinEnlacesSolos } = await import('./bloquesCampus');
    const b = sinEnlacesSolos(leerBloques('<h4>Bibliografía</h4><ul><li><a href="https://docs.google.com/document/d/1">Programa</a></li><li>Leer <a href="https://x.com/a">el apunte</a> antes</li></ul><p><a href="https://forms.gle/x">Registro</a> - <a href="https://drive.google.com/x">Drive</a></p>'));
    expect(b.map((x) => x.tipo)).toEqual(['titulo', 'lista']);
    expect(b[1].items).toHaveLength(1);
    expect(sinEnlacesSolos(leerBloques('<h4>Enlaces</h4><p><a href="https://forms.gle/x">Registro</a></p>'))).toEqual([]);
  });
});
