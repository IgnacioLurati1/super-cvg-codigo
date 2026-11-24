import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/barlow/latin-400.css';
import '@fontsource/barlow/latin-600.css';
import '@fontsource/barlow/latin-700.css';
// Only the titles of the «Hoja» style: the browser downloads it when that style is on.
import '@fontsource/kalam/latin-700.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/estilos.css';
import './styles/potentes.css';
import './styles/filtros.css';
import { iniciarFondo } from './lib/fondo/fondo';
import './styles/animaciones.css';
import App from './App';
import { atenderVueltaDeGoogle } from './lib/google';
import { iniciarMovimiento } from './lib/movimiento';
import { iniciarEscritura } from './lib/escritura';
import { marcarLlegadas } from './lib/llegadas';
import { arrancarCalendario } from './lib/calendarioSincro';
import { arrancarApariencia } from './lib/apariencia';
import { iniciarVinculo } from './lib/resumenes';
import { iniciarSysacad } from './lib/sysacad';
import { escucharInstalacion } from './lib/instalar';
import { registrarTrabajador } from './lib/trabajador';
import { limpiarCompartidoViejo } from './lib/compartido';
import { contarVisita } from './lib/visita';
import { sumarLetrasDeCodigo } from './lib/letrasDeCodigo';
import { adelantarPedidos } from './lib/campus';
import { escucharToques } from './lib/alTocar';
import { adelantarClassroom } from './lib/classroomUnido';

// The small window Google came back to only hands over the permission and closes: no app, no visit counted.
if (atenderVueltaDeGoogle()) {
  window.close();
  document.body.textContent = 'Listo. Ya podés cerrar esta ventana.';
} else if (window.top === window.self) {
  // A link from El Santo Resumen to link the account: its code leaves the address before anything else.
  iniciarVinculo();
  // The campus starts answering while the rest is drawn: on a slow phone, while its logo still shows.
  adelantarPedidos(location.pathname === '/');
  // Classroom too, on the screens that show it: Google is the slowest to answer.
  if (location.pathname === '/' || location.pathname === '/calendario') adelantarClassroom();
  // And each screen's, from the moment a finger touches its link.
  escucharToques();
  // Nobody should be able to cover the login form from a page of their own.
  iniciarMovimiento();
  iniciarEscritura();
  marcarLlegadas();
  contarVisita();
  // Sysacad Lindo, if it is installed, answers with the finals.
  iniciarSysacad();
  // The look goes with the student's things, and comes back from them.
  arrancarApariencia();
  // «Guardar en tu Google Drive», for whoever turned it on. Apart: it brings the union and Drive, and the first page
  // shouldn't wait for them.
  import('./lib/sincro').then((m) => m.arrancarDrive(), () => {});
  // Sysacad Lindo's finals, copies and exams, through the same Drive, for the devices without the extension.
  import('./lib/sysacadEnDrive').then((m) => m.arrancarSysacadEnDrive(), () => {});
  // The calendar «Super CVG» in Google Calendar, for whoever linked it.
  arrancarCalendario();
  // «Entrar con Google»: its file in Drive follows a new campus key.
  import('./lib/entrarConGoogle').then((m) => m.arrancarEntrarConGoogle(), () => {});
  // The browser's offer to install it comes once and early, before anyone opens Configuración.
  escucharInstalacion();
  // The site's own files, kept to open without internet (scripts/trabajador.mjs).
  registrarTrabajador();
  // «Descargas inteligentes»: what the worker needs to bring the day's material with the site closed. Apart, like Drive.
  import('./lib/descargas').then((m) => m.arrancarDescargas(), () => {});
  // What another app shared and nobody placed goes after half an hour (compartido.js).
  limpiarCompartidoViejo();
  // The letters of the code that can be chosen (Configuración, Laboratorio): downloaded only when one shows.
  sumarLetrasDeCodigo();
  // The strong themes' movement and high quality: nothing is drawn until one of them is on.
  iniciarFondo();

  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
} else {
  document.body.textContent = 'Super CVG no se abre dentro de otra página.';
}
