// What the lab lets Consultron in «Código» do with what is open (codigo.js): list, read, write, create and delete its
// files by name, as the engine names them, and what it needs to run them. The lab builds it on every render and gives
// it with what it shows (usePantallaDeConsultron, `ide`); the agent takes it fresh each time (ideAhora).
// Writing the open file goes through its editor, so it's one change that Ctrl+Z undoes and the lab saves it as always.
import { escribirEnEditor } from '../../components/consultron/enEditor';
import { correrCasosDelAgente } from './casosDelAgente';
import { agregarAlProyecto, archivosDe, borrarArchivo, cambiarArchivo, nombreEnProyecto, nombreLibre, paraCorrer } from '../laboratorio/guardado';
import { EXTENSIONES, MAX_CODIGO } from '../laboratorio/saneo';
import { partirNombre } from '../laboratorio/zip';
import { mioActual } from '../mio';

// The engines that get the whole folder of a project (as the lab, motor.js).
const VARIOS_ARCHIVOS = { c: true, python: true, javascript: true };

/**
 * `lab`: { lenguaje, proyecto (its object, or null), archivo (the open file, or null: the draft), abierto (its id),
 * escrito (what a program wrote, in view instead), codigo (what the editor has), nombreMotor, donde, entrada, consola,
 * final, editor() (the element with the editor), alCambiarCodigo, abrir(id), abrirOtro(id, proyecto) }.
 */
export function ideDelLab(lab) {
  const { lenguaje, proyecto, archivo, abierto, escrito, codigo, nombreMotor } = lab;
  const suyos = () => (proyecto ? archivosDe(mioActual(), proyecto.id) : []);
  // A file by its name: of the project, or the one alone (the draft is 'mesa').
  const llamado = (n) => (proyecto ? suyos().find((a) => nombreEnProyecto(a) === n) ?? null : n === nombreMotor ? archivo ?? 'mesa' : null);
  const esAbierto = (a) => a === 'mesa' || a.id === abierto;
  // Why a new file can't be made with that name, or ''.
  const noSePuedeCrear = (n) => {
    if (!proyecto) return 'Es un archivo solo, no un proyecto. No se le suman archivos.';
    const partes = partirNombre(n);
    if (!partes || !EXTENSIONES[lenguaje].includes(partes.ext)) return `En este proyecto van archivos .${EXTENSIONES[lenguaje].join(', .')}.`;
    if (!nombreLibre(suyos(), partes.nombre, lenguaje, partes.ext)) return `Ya hay un ${n} en el proyecto.`;
    return '';
  };
  // The test cases of the project or the file alone (casos.js), for `correr_casos`.
  const casos = Array.isArray(lab.casos) ? lab.casos : [];
  return {
    lenguaje,
    correrCasos: casos.length ? (ide, archivos) => correrCasosDelAgente(ide, archivos, casos) : null,
    proyecto: proyecto?.nombre ?? null,
    donde: lab.donde,
    abierto: escrito ? null : nombreMotor,
    principal: proyecto ? paraCorrer(mioActual(), proyecto.id)?.principal ?? null : nombreMotor,
    extensiones: proyecto ? EXTENSIONES[lenguaje] : [],
    varios: Boolean(VARIOS_ARCHIVOS[lenguaje]),
    lineas: lab.entrada ? lab.entrada.split('\n') : [],
    consola: lab.consola,
    final: lab.final,
    editor: lab.editor,
    /** [{ nombre, contenido }], the open one with what the editor has. */
    archivos: () => (proyecto ? suyos().map((a) => ({ nombre: nombreEnProyecto(a), contenido: a.id === abierto ? codigo : a.codigo })) : [{ nombre: nombreMotor, contenido: codigo }]),
    /** Writes a file that exists. False if it isn't there or doesn't fit. */
    escribir(n, texto) {
      const a = llamado(n);
      if (!a || typeof texto !== 'string' || texto.length > MAX_CODIGO) return false;
      if (esAbierto(a)) {
        if (!escrito && escribirEnEditor(lab.editor(), texto)) return true;
        lab.alCambiarCodigo(texto);
        return true;
      }
      return Boolean(cambiarArchivo(a.id, { codigo: texto }));
    },
    noSePuedeCrear,
    /** Makes a new file of the project. False if it can't. */
    crear(n, texto) {
      if (noSePuedeCrear(n) || typeof texto !== 'string' || texto.length > MAX_CODIGO) return false;
      const partes = partirNombre(n);
      return Boolean(agregarAlProyecto(proyecto.id, { nombre: partes.nombre, ext: partes.ext, codigo: texto }));
    },
    /** Deletes a file of the project (what undoes one Consultron made). */
    borrar(n) {
      const a = llamado(n);
      if (!a || a === 'mesa' || !a.proyecto) return false;
      borrarArchivo(a.id);
      if (a.id === abierto) lab.abrirOtro(a.id, a.proyecto);
      return true;
    },
    /** Opens a file in the editor. */
    abrir(n) {
      const a = llamado(n);
      if (a && a !== 'mesa' && a.id !== abierto) lab.abrir(a.id);
    },
  };
}
