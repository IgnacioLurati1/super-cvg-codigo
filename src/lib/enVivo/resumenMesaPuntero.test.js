import { afterEach, describe, expect, it } from 'vitest';
import { elementoDe, leerPunto, lugarDe, puntoEn, rutaDe } from './resumenMesa';

// jsdom has no layout: each test says where the boxes are. A letter is 10 wide and its line 20 high, and the lines wrap
// every `porLinea` letters (another window size, another wrap).
const caja = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top });

function armar(porLinea, alto = 1000) {
  const raiz = document.createElement('html');
  raiz.innerHTML = '<body><h1>Semáforos</h1><p>Uno <b>dos</b> los monitores coordinan procesos que comparten recursos</p></body>';
  const p = raiz.querySelector('p');
  p.getBoundingClientRect = () => caja(100, 200, porLinea * 10, alto);
  raiz.querySelector('h1').getBoundingClientRect = () => caja(100, 100, 400, 40);
  return { raiz, p, texto: p.childNodes[2] };
}

function conLetras(porLinea) {
  // jsdom's Range has no getClientRects.
  Range.prototype.getClientRects = function () {
    const n = this.startContainer;
    // Where the letter sits in the paragraph, counting the text before its node.
    let antes = 0;
    for (const c of n.parentElement.childNodes) {
      if (c === n) break;
      antes += c.textContent.length;
    }
    const i = antes + this.startOffset;
    return [caja(100 + (i % porLinea) * 10, 200 + Math.floor(i / porLinea) * 20, 10, 20)];
  };
}

afterEach(() => {
  delete Range.prototype.getClientRects;
});

describe('Dónde señala cada uno en un resumen HTML o Word', () => {
  it('el lugar se dice por el contenido: el camino de elementos ida y vuelta', () => {
    const { raiz, p } = armar(30);
    expect(rutaDe(raiz, p)).toEqual([1, 1]);
    expect(rutaDe(raiz, raiz)).toEqual([]);
    expect(elementoDe(raiz, [1, 1])).toBe(p);
    expect(elementoDe(raiz, [1, 7])).toBeNull();
    expect(rutaDe(raiz, document.createElement('p'))).toBeNull();
  });

  it('sobre texto cae en la misma letra aunque las líneas corten distinto en cada ventana', () => {
    // Who points: lines of 30 letters, over the 'm' of «monitores».
    const yo = armar(30);
    conLetras(30);
    const letra = 'Uno dos los '.length; // the 'm' of «monitores», in the third text node
    const enTexto = letra - 'Uno dos'.length;
    const punto = puntoEn(yo.raiz, yo.p, 100 + letra * 10 + 3, 210, { nodo: yo.texto, letra: enTexto });
    expect(punto).toMatchObject({ r: [1, 1], n: 2, o: enTexto });

    // Who sees it: lines of 5 letters, so the same letter is on another line and column.
    const otro = armar(5);
    conLetras(5);
    expect(lugarDe(otro.raiz, leerPunto(punto))).toEqual({ x: 100 + (letra % 5) * 10, y: 200 + Math.floor(letra / 5) * 20 + 10 });
  });

  it('fuera de las letras va por la caja del elemento', () => {
    const { raiz, p, texto } = armar(30);
    conLetras(30);
    // The browser says the nearest letter, but it is far from the pointer: not used.
    const punto = puntoEn(raiz, p, 100 + 150, 200 + 500, { nodo: texto, letra: 2 });
    expect(punto).toEqual({ r: [1, 1], x: 0.5, y: 0.5 });
    const h1 = puntoEn(raiz, raiz.querySelector('h1'), 300, 110, null);
    expect(h1).toEqual({ r: [1, 0], x: 0.5, y: 0.25 });
    const otro = armar(10, 400);
    expect(lugarDe(otro.raiz, punto)).toEqual({ x: 150, y: 400 });
  });

  it('lo de afuera del resumen no se manda', () => {
    const { raiz } = armar(30);
    expect(puntoEn(raiz, document.body, 1, 1)).toBeNull();
    expect(puntoEn(raiz, null, 1, 1)).toBeNull();
  });

  it('un elemento muy hondo se dice por su antepasado, sin letra', () => {
    const raiz = document.createElement('div');
    let n = raiz;
    for (let i = 0; i < 60; i++) n = n.appendChild(document.createElement('span'));
    n.textContent = 'hondo';
    const punto = puntoEn(raiz, n, 0, 0, { nodo: n.firstChild, letra: 1 });
    expect(punto.r).toHaveLength(40);
    expect(punto.n).toBeUndefined();
    expect(leerPunto(punto)).toEqual(punto);
  });

  it('lo que manda otro mal armado no se dibuja', () => {
    expect(leerPunto(null)).toBeNull();
    expect(leerPunto({ pagina: 1, x: 0.5, y: 0.5 })).toBeNull();
    expect(leerPunto({ r: [0, -1], x: 0, y: 0 })).toBeNull();
    expect(leerPunto({ r: [0, 1.5], x: 0, y: 0 })).toBeNull();
    expect(leerPunto({ r: ['0'], x: 0, y: 0 })).toBeNull();
    expect(leerPunto({ r: Array(41).fill(0), x: 0, y: 0 })).toBeNull();
    expect(leerPunto({ r: [0], x: 'a', y: 0 })).toBeNull();
    expect(leerPunto({ r: [0], x: 9, y: -3, n: 1, o: 'x' })).toEqual({ r: [0], x: 1, y: 0 });
    expect(leerPunto({ r: [0], x: 0.2, y: 0.3, n: 1, o: 4 })).toEqual({ r: [0], x: 0.2, y: 0.3, n: 1, o: 4 });
    // A path or a letter this copy doesn't have: nowhere.
    const { raiz } = armar(30);
    expect(lugarDe(raiz, leerPunto({ r: [0, 9, 9], x: 0, y: 0 }))).toBeNull();
  });
});
