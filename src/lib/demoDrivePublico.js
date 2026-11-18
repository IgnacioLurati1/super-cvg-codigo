// A Drive folder of samples, for the demo (`/?demo=1` in `npm run dev`): any link pasted is this folder, and its files are
// the sample PDFs. The files of the career's Drive come from Drive itself. Kept apart so production never ships it.
import { archivoDeEjemplo } from './demoPdf';
import { clienteDrivePublico } from './drivePublico';

const PDF = 'application/pdf';
const CARPETA = 'application/vnd.google-apps.folder';
const ARBOL = {
  raiz: [
    { id: 'demoCarpeta01', name: 'Parciales', mimeType: CARPETA },
    { id: 'demoCarpeta02', name: 'Apuntes', mimeType: CARPETA },
    { id: 'demoArchivo01', name: 'Programa de la materia.pdf', mimeType: PDF, size: '120000' },
  ],
  demoCarpeta01: [
    { id: 'demoArchivo02', name: 'Primer parcial 2025.pdf', mimeType: PDF, size: '340000' },
    { id: 'demoArchivo03', name: 'Segundo parcial 2025 resuelto.pdf', mimeType: PDF, size: '410000' },
  ],
  demoCarpeta02: [
    { id: 'demoArchivo04', name: 'Resumen de la unidad 1.pdf', mimeType: PDF, size: '210000' },
    { id: 'demoArchivo05', name: 'Diagrama de clases.png', mimeType: 'image/png', size: '90000' },
  ],
};
const espera = () => new Promise((ok) => setTimeout(ok, 200));

export function clienteDeEjemplo() {
  return {
    // A real file linked from a course is asked to Drive, as its bytes are; anything else is the sample folder.
    async ficha(id, k) {
      const real = id.startsWith('demo') ? null : await clienteDrivePublico().ficha(id, k).catch(() => null);
      if (real && !real.carpeta) return real;
      await espera();
      return { id, nombre: 'Carpeta de ejemplo', carpeta: true };
    },
    async hijos(id) {
      await espera();
      return (ARBOL[id] ?? (id.startsWith('demoCarpeta') ? [] : ARBOL.raiz)).map((f) => ({ ...f, modifiedTime: '2025-10-01T12:00:00Z' }));
    },
    bajar: (nodo, senal) => (nodo.id.startsWith('demo')
      ? archivoDeEjemplo({ archivo: `apunte-ejemplo-${(Number(nodo.id.slice(-1)) % 3) + 1}.pdf` })
      : clienteDrivePublico().bajar(nodo, senal)),
  };
}
