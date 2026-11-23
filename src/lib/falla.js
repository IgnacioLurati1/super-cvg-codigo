// An error with a message for the student (`textoError` shows it as is). Apart from paquete.js, so whoever only needs
// this doesn't bring the compressor (fflate) to the first page.
export function falla(mensaje) {
  const error = new Error(mensaje);
  error.conocido = true;
  return error;
}
