// @vitest-environment jsdom
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { textoDePresentacion } from './presentacion';

const diapositiva = (...parrafos) => strToU8(
  `<?xml version="1.0"?><p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody>${parrafos.map((p) => `<a:p>${p.map((t) => `<a:r><a:t>${t}</a:t></a:r>`).join('')}</a:p>`).join('')}</p:txBody></p:sp></p:spTree></p:cSld></p:sld>`,
);

describe('el texto de un PowerPoint', () => {
  it('diapositiva por diapositiva, en orden, con sus párrafos', () => {
    const pptx = zipSync({
      'ppt/slides/slide10.xml': diapositiva(['Final']),
      'ppt/slides/slide2.xml': diapositiva(['Unidad ', '2'], ['Derivadas']),
      'ppt/slides/slide1.xml': diapositiva(['Título']),
      'ppt/slides/_rels/slide1.xml.rels': strToU8('<x/>'),
      '[Content_Types].xml': strToU8('<x/>'),
    });
    expect(textoDePresentacion(pptx)).toEqual([
      { numero: 1, parrafos: ['Título'] },
      { numero: 2, parrafos: ['Unidad 2', 'Derivadas'] },
      { numero: 10, parrafos: ['Final'] },
    ]);
  });

  it('un ZIP sin diapositivas no es un PowerPoint', () => {
    expect(() => textoDePresentacion(zipSync({ 'word/document.xml': strToU8('<x/>') }))).toThrow();
    expect(() => textoDePresentacion(new Uint8Array([1, 2, 3]))).toThrow();
  });
});
