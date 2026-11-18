import { ajustesActuales, aparienciaQueViaja, cambiarAjustes, conApariencia, escucharAjustes } from './ajustes';
import { cambiarMio, escucharMio, mioActual, usuarioActual } from './mio';
import { igual } from './union';

// The look (ajustes.js) travels with the student: a copy of what differs from the default goes in their things
// (mio.apariencia), and with them to their Drive (sincro.js). Each side follows the other:
//   - a setting changed here goes to mio, as a change of the student's;
//   - mio with another look than before (joined from Drive, or restored from a file) goes to this device.
// When the student comes in, this device's look is the one they see: if it differs from mio, it goes to mio. The first
// time, mio.js puts it there without counting as a change, so a look already in Drive wins.
// The sizes of the panels stay on each device.

let alumnoVisto = null;
let vista = null;

const deAca = () => aparienciaQueViaja(ajustesActuales());

function llevarAMio() {
  const ahora = deAca();
  if (!igual(mioActual().apariencia, ahora)) cambiarMio((m) => ({ ...m, apariencia: ahora }));
}

function alCambiarMio() {
  const alumno = usuarioActual();
  const viene = alumno === null ? null : mioActual().apariencia;
  if (alumno !== alumnoVisto) {
    alumnoVisto = alumno;
    vista = viene;
    if (viene) llevarAMio();
    return;
  }
  if (igual(viene, vista)) return;
  vista = viene;
  if (viene && !igual(viene, deAca())) cambiarAjustes(conApariencia(ajustesActuales(), viene));
}

let arrancado = false;
export function arrancarApariencia() {
  if (arrancado || typeof window === 'undefined') return;
  arrancado = true;
  escucharMio(alCambiarMio);
  escucharAjustes(() => {
    if (usuarioActual() !== null) llevarAMio();
  });
  alCambiarMio();
}
