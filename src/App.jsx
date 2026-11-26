import { Navigate, Outlet, RouterProvider, createBrowserRouter } from 'react-router-dom';
import CambioDePantalla from './components/CambioDePantalla';
import { UIProvider } from './components/ui';
import Layout from './layouts/Layout';
import Inicio from './pages/Inicio';
import NoEncontrada from './pages/NoEncontrada';
import ErrorDePantalla from './pages/ErrorDePantalla';
import './pages/ajustes.css';
import './styles/luz.css';
import ConSesion from './components/ConSesion';

// Lo privado se baja aparte: const Panel = lazy(() => import('./admin/Panel')). Cada ruta nueva pública va también
// en sitio.config.js, y la privada en `privadas`, así la build le arma su cabecera.
// Every screen but the home one comes apart, so a phone downloads only what it opens. The service worker
// (scripts/trabajador.mjs) keeps the main ones from the start and each other one once opened (all of them, on wifi).
const aparte = (cargar) => () => cargar().then((m) => ({ Component: m.default }));

function Raiz() {
  return (
    <UIProvider>
      <CambioDePantalla />
      <Outlet />
    </UIProvider>
  );
}

const router = createBrowserRouter(
  [
    {
      element: <Raiz />,
      // A screen that breaks shows ErrorDePantalla: inside the layout, with the header; if the layout itself breaks, alone.
      errorElement: <ErrorDePantalla />,
      children: [
        {
          element: <Layout />,
          children: [
            {
              errorElement: <ErrorDePantalla />,
              children: [
            { index: true, element: <Inicio /> },
            { path: 'privacidad', lazy: aparte(() => import('./pages/Privacidad')) },
            { path: 'novedades', lazy: aparte(() => import('./pages/Novedades')) },
            { path: 'preguntas', lazy: aparte(() => import('./pages/Preguntas')) },
            // Only in dev: the tools of a live session, two-up, without Realtime (BancoEnVivo.jsx).
            ...(import.meta.env.DEV ? [{ path: 'en-vivo/banco', lazy: aparte(() => import('./pages/BancoEnVivo')) }] : []),
            { path: 'opinar', lazy: aparte(() => import('./pages/Opinar')) },
            { path: 'entrada', lazy: aparte(() => import('./pages/Entrada')) },
            {
              element: <ConSesion />,
              children: [
                { path: 'calendario', lazy: aparte(() => import('./pages/Calendario')) },
                // The week of classes, from the faculty's schedules: it brings them apart.
                { path: 'horario', lazy: aparte(() => import('./pages/Horario')) },
                // A classmate's week next to the student's, from the link they passed (horarioCompartido.js).
                { path: 'horario/compartido', lazy: aparte(() => import('./pages/HorarioCompartido')) },
                { path: 'materias', lazy: aparte(() => import('./pages/Materias')) },
                { path: 'materias/:id', lazy: aparte(() => import('./pages/Materia')) },
                // A campus task, to read it whole and hand it in.
                { path: 'materias/:id/tareas/:tarea', lazy: aparte(() => import('./pages/Tarea')) },
                // A campus quiz, to see its attempts and grade, and the review of each one. Read only.
                { path: 'materias/:id/cuestionarios/:cuestionario', lazy: aparte(() => import('./pages/Cuestionario')) },
                { path: 'materias/:id/cuestionarios/:cuestionario/intentos/:intento', lazy: aparte(() => import('./pages/RevisionCuestionario')) },
                { path: 'inscripcion', lazy: aparte(() => import('./pages/Inscripcion')) },
                { path: 'buscar', lazy: aparte(() => import('./pages/Buscar')) },
                { path: 'notas', element: <Navigate to="/carrera" replace /> },
                // The copies of Sysacad that Sysacad Lindo keeps: it brings them apart.
                { path: 'sysacad', lazy: aparte(() => import('./pages/Sysacad')) },
                // Where the student stands in the plan, from those same copies.
                { path: 'carrera', lazy: aparte(() => import('./pages/Carrera')) },
                { path: 'resumenes', lazy: aparte(() => import('./pages/Resumenes')) },
                { path: 'calculadoras', lazy: aparte(() => import('./pages/Calculadoras')) },
                { path: 'calculadoras/:cual', lazy: aparte(() => import('./pages/Calculadora')) },
                { path: 'configuracion', lazy: aparte(() => import('./pages/Configuracion')) },
                { path: 'mensajes', lazy: aparte(() => import('./pages/Mensajes')) },
                { path: 'mensajes/foros', lazy: aparte(() => import('./pages/Foros')) },
                { path: 'mensajes/foros/:discusion', lazy: aparte(() => import('./pages/Foros')) },
                { path: 'laboratorio', lazy: aparte(() => import('./pages/Laboratorio')) },
                // Cards that come back before they are forgotten: the student's own, in mio.js.
                { path: 'repaso', lazy: aparte(() => import('./pages/Repaso')) },
                { path: 'consultron', lazy: aparte(() => import('./pages/Consultron')) },
                { path: 'en-vivo', lazy: aparte(() => import('./pages/EnVivo')) },
                // The styles other students published: try one, use it, rate it and comment (disenos.js).
                { path: 'disenos', lazy: aparte(() => import('./pages/Disenos')) },
                { path: 'escaner', lazy: aparte(() => import('./pages/Pizarron')) },
                { path: 'compartido', lazy: aparte(() => import('./pages/Compartido')) },
                // A file sent without Drive, from the link of a message (temporales.js).
                { path: 'archivo', lazy: aparte(() => import('./pages/Archivo')) },
                // What another app shared with Super CVG (the manifest's share_target, compartido.js).
                { path: 'compartir', lazy: aparte(() => import('./pages/Compartir')) },
                { path: 'propias/nueva', lazy: aparte(() => import('./pages/NuevaPropia')) },
                { path: 'propias/abrir', lazy: aparte(() => import('./pages/AbrirPropia')) },
                { path: 'propias/:id', lazy: aparte(() => import('./pages/Propia')) },
                { path: 'propias/:id/editar', lazy: aparte(() => import('./pages/EditarPropia')) },
              ],
            },
            { path: '*', element: <NoEncontrada /> },
              ],
            },
          ],
        },
      ],
    },
  ],
  { basename: import.meta.env.BASE_URL.replace(/\/$/, '') || '/' },
);

export default function App() {
  return <RouterProvider router={router} />;
}
