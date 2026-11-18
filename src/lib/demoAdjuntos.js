// Files in Mensajes in the demo (/?demo=1, only in npm run dev): the same shape as the client of adjuntos.js, with a
// pretend upload that moves piece by piece. Nothing goes to Google. `sessionStorage['cl.demo.drive']` shows the other
// states, like demoDrive.js: 'sin-red', 'vencido' or 'lleno'.
import { TROZO } from './adjuntos';

const falla = (texto, codigo) => Object.assign(new Error(texto), { conocido: true, codigo });
const FALLAS = {
  'sin-red': () => falla('Sin conexión. Probá de nuevo cuando vuelva.', 'sin-red'),
  vencido: () => falla('Se cortó la conexión con Google. Probá de nuevo.', 'vencida'),
  lleno: () => falla('Tu Google Drive está lleno. Hacé lugar y probá de nuevo.', 'lleno'),
};
const LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const idDeDemo = () => `1demo${[...crypto.getRandomValues(new Uint8Array(28))].map((b) => LETRAS[b % LETRAS.length]).join('')}`;

const pausa = (ms, senal) => new Promise((ok, mal) => {
  if (senal?.aborted) {
    mal(falla('Cancelaste el envío.', 'cancelada'));
    return;
  }
  const reloj = setTimeout(ok, ms);
  senal?.addEventListener('abort', () => {
    clearTimeout(reloj);
    mal(falla('Cancelaste el envío.', 'cancelada'));
  }, { once: true });
});

// Nothing of the demo is in Google: its cards open the file itself, by its pretend id. The one chosen here, or for one
// that came with the demo, a page with its name.
const archivos = new Map();

// A PDF of one page with the name of the file, written by hand: no library for something only the demo opens.
function pdfDeEjemplo(nombre) {
  const latino = (t) => t.replace(/[^\x20-\x7e\xa0-\xff]/g, '?').replace(/[\\()]/g, '\\$&');
  const contenido = `BT /F1 18 Tf 56 770 Td (${latino(nombre)}) Tj /F1 11 Tf 0 -26 Td (Archivo de ejemplo.) Tj ET`;
  const objetos = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${contenido.length} >>\nstream\n${contenido}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  ];
  let pdf = '%PDF-1.4\n';
  const lugares = objetos.map((o, i) => {
    const lugar = pdf.length;
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
    return lugar;
  });
  const indice = pdf.length;
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n${lugares.map((n) => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${indice}\n%%EOF\n`;
  return Uint8Array.from(pdf, (c) => c.charCodeAt(0));
}

/** Where a file of the demo opens, or null for an id that is not of the demo. */
export function direccionDeDemo(id, nombre) {
  if (!id?.startsWith('1demo')) return null;
  if (!archivos.has(id)) archivos.set(id, URL.createObjectURL(new Blob([pdfDeEjemplo(nombre)], { type: 'application/pdf' })));
  return archivos.get(id);
}

function revisar() {
  const cual = sessionStorage.getItem('cl.demo.drive');
  if (FALLAS[cual]) throw FALLAS[cual]();
}

export function clienteDemo() {
  return {
    async carpeta(senal) {
      await pausa(300, senal);
      revisar();
      return '1demoCarpetaSuperCvg000000000';
    },
    async subir(archivo, { sesion = {}, alAvanzar = () => {}, senal = null }) {
      const total = archivo.size;
      sesion.desde ??= 0;
      while (sesion.desde < total) {
        alAvanzar(sesion.desde, total);
        await pausa(350, senal);
        revisar();
        sesion.desde = Math.min(sesion.desde + TROZO, total);
      }
      alAvanzar(total, total);
      const id = idDeDemo();
      archivos.set(id, URL.createObjectURL(archivo));
      return id;
    },
    async compartir(id, senal) {
      await pausa(300, senal);
    },
    async borrar() {},
  };
}
