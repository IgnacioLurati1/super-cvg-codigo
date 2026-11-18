import { esDemo } from './modoDemo';
import { bajarArchivo } from './moodle';
import { tokenActual } from './sesion';

/** The bytes of a campus file. Stays in memory: nothing here writes it to disk. In the sample mode, the sample PDFs. */
export async function traerArchivo(item) {
  if (import.meta.env.DEV && esDemo(tokenActual())) {
    const { archivoDeEjemplo } = await import('./demoPdf');
    return archivoDeEjemplo(item);
  }
  return bajarArchivo(tokenActual(), item.direccion);
}

export function guardarArchivo(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  enlace.click();
  URL.revokeObjectURL(url);
}
