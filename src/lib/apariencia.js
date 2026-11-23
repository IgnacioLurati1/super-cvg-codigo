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
// «Misma configuración en todos tus dispositivos» (ajustes.mismaEnTodos, on unless turned off) is per device: off, this
// device neither sends nor takes a look. Turned on again, it takes the student's look, as a new device does.

let alumnoVisto = null;
let vista = null;
let seguia = null;

const deAca = () => aparienciaQueViaja(ajustesActuales());
const sigue = () => ajustesActuales().mismaEnTodos;

function llevarAMio() {
  const ahora = deAca();
  if (!igual(mioActual().apariencia, ahora)) cambiarMio((m) => ({ ...m, apariencia: ahora }));
}

function traerDeMio(viene) {
  if (!igual(viene, deAca())) cambiarAjustes(conApariencia(ajustesActuales(), viene));
}

function alCambiarMio() {
  const alumno = usuarioActual();
  const viene = alumno === null ? null : mioActual().apariencia;
  if (alumno !== alumnoVisto) {
    alumnoVisto = alumno;
    vista = viene;
    if (viene && sigue()) llevarAMio();
    return;
  }
  if (igual(viene, vista)) return;
  vista = viene;
  if (viene && sigue()) traerDeMio(viene);
}

function alCambiarAjustes() {
  const ahora = sigue();
  const volvio = ahora && seguia === false;
  seguia = ahora;
  if (usuarioActual() === null || !ahora) return;
  const viene = mioActual().apariencia;
  if (volvio && viene) traerDeMio(viene);
  else llevarAMio();
}

let arrancado = false;
export function arrancarApariencia() {
  if (arrancado || typeof window === 'undefined') return;
  arrancado = true;
  seguia = sigue();
  escucharMio(alCambiarMio);
  escucharAjustes(alCambiarAjustes);
  alCambiarMio();
}
