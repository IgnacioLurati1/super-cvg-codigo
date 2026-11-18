// Sample El Santo Resumen account for `/?demo=1` in `npm run dev`, as the service answers with its key. Only loaded in
// development: production never ships it. What is taken out stays out until the page reloads.
const fila = (n, extra) => ({
  id: `0d3e5a7c-9b1f-4c2d-8e6a-00000000000${n}`,
  materia: 'sistemas-operativos',
  instancia: 'parcial-1',
  estado: 'publicado',
  tipo: 'pdf',
  me_gusta: 3,
  autor: 'santi',
  ...extra,
});

const SUBIDOS = [
  fila(1, { titulo: 'Planificación de procesos, con ejercicios' }),
  fila(2, { titulo: 'Memoria virtual paso a paso', instancia: 'parcial-2', estado: 'pendiente', tipo: 'docx' }),
  fila(3, { titulo: 'Apuntes de la cursada 2024', instancia: 'final', estado: 'oculto', tipo: 'pptx' }),
];

let enviados = [
  fila(4, { titulo: 'Semáforos del puente, resuelto', instancia: 'parcial-2', tipo: 'html', js: true, autor: 'ana' }),
  fila(5, { titulo: 'Derivadas parciales en una hoja', materia: 'analisis-matematico-ii', instancia: 'final', autor: 'beto' }),
];

const gustos = new Set();

export function responderResumenes(ruta, cuerpo) {
  if (ruta === 'cvg-resumenes') return { status: 200, error: '', datos: { usuario: 'santi', subidos: SUBIDOS, enviados } };
  if (ruta === 'cvg-quitar') {
    enviados = enviados.filter((r) => r.id !== cuerpo?.id);
    return { status: 204, error: '', datos: null };
  }
  if (ruta === 'cvg-desvincular') return { status: 204, error: '', datos: null };
  if (ruta === 'cvg-gustos') return { status: 200, error: '', datos: { resumenes: [...gustos] } };
  if (ruta === 'cvg-me-gusta') {
    if (cuerpo?.si) gustos.add(cuerpo.id);
    else gustos.delete(cuerpo?.id);
    return { status: 200, error: '', datos: { me_gusta: 3 + (gustos.has(cuerpo?.id) ? 1 : 0), mio: gustos.has(cuerpo?.id) } };
  }
  return { status: 404, error: 'ruta', datos: null };
}
