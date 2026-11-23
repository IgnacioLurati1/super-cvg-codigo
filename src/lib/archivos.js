import { ahorrarDatos } from './ahorro';
import { esDemo } from './modoDemo';
import { bajarArchivo, pedirArchivo } from './moodle';
import { completarEnFondo, convieneEnPartes, empezarEnPartes, Partes } from './pdfPartes';
import { enCache, sesionRecordada, tokenActual } from './sesion';
import { archivoGuardado, esFaltaDeConexion, guardarArchivoSinInternet, guardarPartesSinInternet, partesGuardadas, pedirQueSeQuede } from './sinInternet';
import { selloDe } from './textosPdf';
import { puedeBajarTodo } from './trabajador';

// With «Seguir conectado», a whole file brought from the campus stays in this browser with its version.
function quedarseCon(item, blob, token) {
  const sello = selloDe(item);
  if (!sello) return;
  guardarArchivoSinInternet(item.direccion, sello, blob, { token, alumno: enCache('perfil')?.id });
  pedirQueSeQuede();
}

/** The bytes of a campus file. In memory, and with «Seguir conectado» also in this browser (sinInternet.js): a file
 * that did not change since is not asked again, and without internet the last one brought opens. In the sample mode,
 * the sample PDFs. */
export async function traerArchivo(item) {
  // A file of the student's own, kept in this browser (a course of one's own): the campus is never asked for it.
  if (item.traer) return item.traer();
  const token = tokenActual();
  if (import.meta.env.DEV && esDemo(token)) {
    const { archivoDeEjemplo } = await import('./demoPdf');
    return archivoDeEjemplo(item);
  }
  if (!sesionRecordada()) return bajarArchivo(token, item.direccion);
  const sello = selloDe(item);
  const guardado = await archivoGuardado(item.direccion, token);
  if (guardado && sello && guardado.sello === sello) return guardado.blob;
  try {
    const blob = await bajarArchivo(token, item.direccion);
    quedarseCon(item, blob, token);
    return blob;
  } catch (error) {
    // Without internet, the version kept, even if the campus has a newer one by now.
    if (!guardado || !esFaltaDeConexion(error)) throw error;
    return guardado.blob;
  }
}

/** What abrirPdf gives when a file asked `soloPartes` can't come by parts. */
export const SIN_PARTES = Object.freeze({ sinPartes: true });

/** A PDF for the reader: the whole Blob as traerArchivo gives it or, for a big campus PDF with no whole copy kept here,
 * a Partes (pdfPartes.js) that brings only what the pages being read need. With «Seguir conectado» the parts brought
 * stay in this browser (by address and version, like a whole file) and the next time it starts from them; once it is
 * all here, it stays as one whole file. Without connection, the parts kept of an older version open as they are.
 * `soloPartes`: for a very big file, nothing is downloaded whole without the student asking: when it can't come by
 * parts (the campus answered the whole file, or something else went wrong), it gives SIN_PARTES. */
export async function abrirPdf(item, { soloPartes = false } = {}) {
  const token = tokenActual();
  if (!convieneEnPartes(item, { demo: esDemo(token) })) return soloPartes ? SIN_PARTES : traerArchivo(item);
  const recordada = sesionRecordada();
  const sello = selloDe(item);
  const guardado = recordada ? await archivoGuardado(item.direccion, token) : null;
  if (guardado && sello && guardado.sello === sello) return guardado.blob;
  const kept = recordada ? await partesGuardadas(item.direccion, token) : null;
  const pedir = (rango, senal) => pedirArchivo(token, item.direccion, { rango, senal });
  const opciones = { esFaltaDeRed: esFaltaDeConexion };
  const deLoGuardado = (soloLoGuardado) => new Partes({ pedir, largo: kept.largo, tramos: kept.tramos, soloLoGuardado, ...opciones });
  let partes;
  if (kept && sello && kept.sello === sello) partes = deLoGuardado(false);
  else {
    let primera;
    try {
      primera = await empezarEnPartes(pedir, { ...opciones, soloPartes });
    } catch (error) {
      if (!esFaltaDeConexion(error)) return soloPartes ? SIN_PARTES : traerArchivo(item);
      // Without internet, the version kept, even if the campus has a newer one by now.
      if (guardado) return guardado.blob;
      if (kept) return deLoGuardado(true);
      throw error;
    }
    if (primera.sinPartes) return SIN_PARTES;
    if (primera.blob) {
      if (recordada) quedarseCon(item, primera.blob, token);
      return primera.blob;
    }
    partes = primera.partes;
  }
  if (recordada && sello) guardarAlLeer(item, partes, sello, token);
  return partes;
}

// The parts brought stay as they come (a moment after the last one, and when the reader closes); the whole file, once
// it is all here, in their place.
const GUARDAR_PARTES_MS = 1500;
function guardarAlLeer(item, partes, sello, token) {
  let reloj = null;
  const guardar = () => {
    clearTimeout(reloj);
    reloj = null;
    if (partes.blob) return;
    guardarPartesSinInternet(item.direccion, sello, { largo: partes.largo, tramos: partes.tramos() }, { token, alumno: enCache('perfil')?.id });
    pedirQueSeQuede();
  };
  const luego = () => {
    clearTimeout(reloj);
    reloj = setTimeout(guardar, GUARDAR_PARTES_MS);
  };
  partes.escuchar({
    alSumar: luego,
    alTerminar: (blob) => {
      clearTimeout(reloj);
      quedarseCon(item, blob, token);
    },
    alCerrar: () => reloj && guardar(),
  });
  if (partes.blob) quedarseCon(item, partes.blob, token);
  else luego();
}

/** Once the first pages are drawn, the rest of a PDF by parts comes by itself to keep it whole for without internet:
 * only with «Seguir conectado», without saving data and on a connection that doesn't cost (pdfPartes.js,
 * completarEnFondo). Otherwise it comes only as it is read. */
export function seguirEnFondo(partes) {
  if (completarEnFondo({ recordada: sesionRecordada(), ahorro: ahorrarDatos(), libre: puedeBajarTodo() })) partes.completarEnReposo();
}

export function guardarArchivo(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  enlace.click();
  URL.revokeObjectURL(url);
}
