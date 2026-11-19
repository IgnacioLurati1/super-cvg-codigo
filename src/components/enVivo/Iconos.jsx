import { IconoMenu } from '../../layouts/Menu';

// The drawings of the table's toolbar, in the line of the site's menu (24 px, a stroke of the text's color).
const DIBUJOS = {
  pestanas: <path d="M7.5 6.5V5A1.5 1.5 0 0 1 9 3.5h10A1.5 1.5 0 0 1 20.5 5v9a1.5 1.5 0 0 1-1.5 1.5h-2.5M5 6.5h10A1.5 1.5 0 0 1 16.5 8v10a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18V8A1.5 1.5 0 0 1 5 6.5z" />,
  personas: <path d="M9 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 19.5c.8-3.3 3.4-5 6.5-5s5.7 1.7 6.5 5M15.5 5.2a3.3 3.3 0 0 1 0 6.6M17.5 14.6c1.8.6 3.1 2.2 3.5 4.9" />,
  chat: <path d="M4 5h16a1 1 0 0 1 1 1v9.5a1 1 0 0 1-1 1h-9L6.5 20v-3.5H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" />,
  guardar: <path d="M12 3.5v11M7.5 10l4.5 4.5 4.5-4.5M4.5 16.5v3h15v-3" />,
  invitar: <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />,
  completa: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  achicar: <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />,
  sitio: <path d="M4 11.5 12 5l8 6.5M6.5 9.5v9.5h11V9.5" />,
  salir: <path d="M14 4.5h4.5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H14M10 8l-4 4 4 4M6 12h10" />,
  mas: <path d="M5.5 12h.01M12 12h.01M18.5 12h.01" strokeWidth="3" />,
  cronometro: <path d="M12 20.5a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM12 13.5V10M10 3.5h4M12 3.5v3M18 6.5l1.5-1.5" />,
  cerrar: <path d="M6 6l12 12M18 6L6 18" />,
  abrir: <path d="M12 5v14M5 12h14" />,
  documento: <path d="M6.5 3.5h7.5l4 4v12.5a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5zM14 3.5v4h4M9 12h6M9 15.5h6" />,
  pizarra: <path d="M3.5 4.5h17v11.5h-17zM9 20l1.5-4M15 20l-1.5-4M7 12c1.5-3.5 3-3.5 4.5-.5s3 2.5 5.5-1.5" />,
  flujo: <path d="M9.5 3h5a2 2 0 0 1 0 4h-5a2 2 0 0 1 0-4zM12 7v2M12 9l3.5 3-3.5 3-3.5-3zM12 15v2M8 17h8v4H8z" />,
  apunte: <path d="M6.5 3.5h7.5l4 4v12.5a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5zM14 3.5v4h4M12 17.5v-6M9.5 14 12 11.5l2.5 2.5" />,
};

// The tools that already have a drawing in the site's menu use that one.
const DEL_MENU = { consultron: 'consultron', laboratorio: 'laboratorio', repaso: 'repaso', calculadora: 'calculadoras', ajustes: 'configuracion', materias: 'materias', santo: 'resumenes', materia: 'materias', resumen: 'resumenes' };

export default function Icono({ nombre }) {
  if (DEL_MENU[nombre]) return <IconoMenu nombre={DEL_MENU[nombre]} />;
  return (
    <svg className="envivo-icono" viewBox="0 0 24 24" aria-hidden="true" focusable="false" strokeLinecap="round" strokeLinejoin="round">
      {DIBUJOS[nombre]}
    </svg>
  );
}
