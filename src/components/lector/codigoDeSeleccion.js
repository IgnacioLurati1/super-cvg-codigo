import { armarCodigo, limpiarCodigo } from '../../lib/laboratorio/desdePdf';

// The code of a selection in the text of a PDF page: each piece of text it covers, where the screen draws it, so the
// lab can put back the indentation the text layer doesn't have (lib/laboratorio/desdePdf.js).

/** The pieces of `rango` inside `capa` (the text of a page): { x, y, ancho, alto, texto }. */
export function piezasDeRango(rango, capa) {
  const piezas = [];
  const recorrido = document.createTreeWalker(capa, NodeFilter.SHOW_TEXT);
  for (let n = recorrido.nextNode(); n; n = recorrido.nextNode()) {
    if (!rango.intersectsNode(n)) continue;
    const desde = n === rango.startContainer ? rango.startOffset : 0;
    const hasta = n === rango.endContainer ? rango.endOffset : n.data.length;
    if (hasta <= desde) continue;
    const parte = document.createRange();
    parte.setStart(n, desde);
    parte.setEnd(n, hasta);
    const caja = parte.getBoundingClientRect();
    piezas.push({ x: caja.left, y: caja.top, ancho: caja.width, alto: caja.height, texto: n.data.slice(desde, hasta) });
  }
  return piezas;
}

/** The selected text as code, with its indentation; as the browser copies it if the pieces don't say where they go. */
export const codigoDeRango = (rango, capa) => armarCodigo(piezasDeRango(rango, capa)) || limpiarCodigo(rango.toString());
