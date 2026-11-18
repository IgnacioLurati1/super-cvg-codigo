import { useColorDeMateria } from '../lib/colores';
import { simboloDe, simboloDeItem, tonoDeItem } from '../lib/simbolos';

// Line icons drawn for this site, on a 24 grid. They never carry meaning alone: the course name is always next to them.
const DIBUJOS = {
  adn: <path d="M7 3c0 4.5 10 4.5 10 9s-10 4.5-10 9M17 3c0 4.5-10 4.5-10 9s10 4.5 10 9M9 6h6M9 18h6" />,
  chispa: <path d="M11 4l1.8 5.2L18 11l-5.2 1.8L11 18l-1.8-5.2L4 11l5.2-1.8zM19 16v5M16.5 18.5h5" />,
  antena: <><circle cx="12" cy="10" r="2" /><path d="M12 12v9M8 14a6 6 0 0 1 0-8M16 6a6 6 0 0 1 0 8M5 17a10 10 0 0 1 0-14M19 3a10 10 0 0 1 0 14" /></>,
  balanza: <path d="M12 3v18M7 21h10M5 7h14M5 7l-3 7a3.5 3.5 0 0 0 6 0zM19 7l-3 7a3.5 3.5 0 0 0 6 0z" />,
  barras: <path d="M4 20h16M7 20v-6M12 20V5M17 20v-9" />,
  sigma: <path d="M18 5H6l7 7-7 7h12" />,
  atomo: <><circle cx="12" cy="12" r="1.5" /><ellipse cx="12" cy="12" rx="10" ry="4" /><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(60 12 12)" /><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(120 12 12)" /></>,
  matraz: <path d="M9 3h6M10 3v6l-5.5 9.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3M7.5 15h9" />,
  burbuja: <path d="M21 12a8 8 0 0 1-8 8H4l2.5-3A8 8 0 1 1 21 12z" />,
  codigo: <path d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" />,
  base: <><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></>,
  chip: <><rect x="7" y="7" width="10" height="10" rx="1.5" /><rect x="10" y="10" width="4" height="4" /><path d="M10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4" /></>,
  escudo: <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />,
  moneda: <><circle cx="12" cy="12" r="9" /><path d="M15 9.5c-.6-1.2-1.7-2-3-2-1.9 0-3.2 1-3.2 2.3 0 3.2 6.4 1.4 6.4 4.4 0 1.3-1.3 2.3-3.2 2.3-1.3 0-2.4-.8-3-2M12 5.5v13" /></>,
  maletin: <><rect x="3" y="8" width="18" height="12" rx="2" /><path d="M9 8V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3M3 13h18" /></>,
  compas: <><circle cx="12" cy="7" r="2" /><path d="M12 2v3M10.8 8.6L5 21M13.2 8.6L19 21M7 17c3 1.5 7 1.5 10 0" /></>,
  cubo: <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9" />,
  bandera: <path d="M5 21V4M5 4c5-2 8 2 14 0v10c-6 2-9-2-14 0" />,
  personas: <><circle cx="9" cy="8" r="3" /><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6M16 5.3a3 3 0 0 1 0 5.4M18 14.5c1.9.8 3 2.8 3 5.5" /></>,
  libro: <path d="M4 5a2 2 0 0 1 2-2h14v15H6a2 2 0 0 0-2 2zM4 20a2 2 0 0 0 2 2h14v-4" />,
  estrella: <path d="M12 3l2.7 5.8 6.3.8-4.6 4.4 1.2 6.3L12 17.3l-5.6 3 1.2-6.3L3 9.6l6.3-.8z" />,
  hoja: <path d="M5 19C5 10 11 5 20 5c0 9-5 15-14 15M5 20c2-5 5-8 9-10" />,
  hexagono: <><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" /><circle cx="12" cy="12" r="3" /></>,
  rombo: <path d="M12 3l9 9-9 9-9-9zM12 8l4 4-4 4-4-4z" />,
  brujula: <><circle cx="12" cy="12" r="9" /><path d="M15.5 8.5l-2 5-5 2 2-5z" /></>,
  campana: <path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 8 2.5 8h-17S6 15 6 9zM10 20.5a2.2 2.2 0 0 0 4 0" />,
  calendario: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  reloj: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  documento: <path d="M6 3h8l5 5v13H6zM14 3v5h5M9 13h7M9 17h7" />,
  planilla: <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M4 9.5h16M4 15h16M10 4v16" /></>,
  presentacion: <><rect x="3" y="4" width="18" height="12" rx="1.5" /><path d="M12 16v4M8 20h8M8 12l3-3 2 2 3-3" /></>,
  imagen: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9.5" r="1.5" /><path d="M21 16l-5-5-9 9" /></>,
  video: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M10 9l5 3-5 3z" /></>,
  texto: <path d="M5 6h14M5 10h14M5 14h14M5 18h9" />,
  enlace: <path d="M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1" />,
  actividad: <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8.5 12l2.5 2.5 4.5-5" /></>,
  // Filters.
  capas: <path d="M12 3l9 4.5-9 4.5-9-4.5zM3 12l9 4.5 9-4.5M3 16.5l9 4.5 9-4.5" />,
  ojo: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></>,
  marcador: <path d="M6.5 3h11v18L12 16.5 6.5 21z" />,
  corazon: <path d="M12 20s-7.2-4.4-8.7-9C2.4 8 4.4 5 7.4 5c1.9 0 3.5 1.1 4.6 2.8C13.1 6.1 14.7 5 16.6 5c3 0 5 3 4.1 6-1.5 4.6-8.7 9-8.7 9z" />,
  // Services of the links.
  formulario: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V2.5h6V4M8.5 9.5h1M12 9.5h3.5M8.5 13.5h1M12 13.5h3.5M8.5 17.5h1M12 17.5h3.5" /></>,
  carpeta: <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.6l2 2.5h8.4A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z" />,
  videollamada: <><rect x="2.5" y="6" width="13" height="12" rx="2" /><path d="M15.5 10.5l6-3.5v10l-6-3.5" /></>,
  // Departments of the campus (Inscripción).
  facultad: <path d="M3 9.5L12 4l9 5.5zM5 20.5h14M3 22h18M6 12v6M10 12v6M14 12v6M18 12v6" />,
  puente: <path d="M2 15h20M4 15v5M20 15v5M4 15c2-6 14-6 16 0M8 15v-3.4M12 15v-4.5M16 15v-3.4" />,
  rayo: <path d="M13.5 2.5L5 13.5h6.5L10.5 21.5 19 10.5h-6.5z" />,
  engranaje: <><path d="M9.2 5.8l.6-3.1h4.4l.6 3.1A6.8 6.8 0 0 1 16 6.5l3-1.1 2.2 3.9-2.4 2a6.8 6.8 0 0 1 0 1.4l2.4 2-2.2 3.9-3-1.1a6.8 6.8 0 0 1-1.2.7l-.6 3.1H9.8l-.6-3.1A6.8 6.8 0 0 1 8 17.5l-3 1.1-2.2-3.9 2.4-2a6.8 6.8 0 0 1 0-1.4l-2.4-2L5 5.4l3 1.1a6.8 6.8 0 0 1 1.2-.7z" /><circle cx="12" cy="12" r="2.8" /></>,
  // Screens.
  sobre: <><rect x="3" y="5.5" width="18" height="13" rx="2" /><path d="M3.8 7l8.2 6.2L20.2 7" /></>,
};

export function Icono({ nombre, tamano, color, tono }) {
  return (
    <span className={`simbolo${tamano ? ` simbolo--${tamano}` : ''}`} data-simbolo={nombre} data-materia={color} data-tono={tono ?? undefined} aria-hidden="true">
      <svg viewBox="0 0 24 24" focusable="false">{DIBUJOS[nombre] ?? DIBUJOS.libro}</svg>
    </span>
  );
}

/** The symbol of a file, a link, a text or an activity, with the color of its kind. */
export const IconoDeItem = ({ item }) => <Icono nombre={simboloDeItem(item)} tono={tonoDeItem(item)} tamano="tipo" />;

/** The symbol of a course (or of a subject added from the schedules), with its color. Without one: `sinMateria`. */
export default function Simbolo({ id, nombre, tamano, sinMateria }) {
  const colorDe = useColorDeMateria();
  if (!id && sinMateria) return <Icono nombre={sinMateria} tamano={tamano} />;
  return <Icono nombre={simboloDe(nombre, id)} tamano={tamano} color={colorDe(id)} />;
}
