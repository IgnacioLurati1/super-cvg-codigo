import './pasosDeIos.css';

/** Installing on iPhone and iPad, by hand from Safari's Compartir (there's no button there). Configuración and Preguntas. */
export default function PasosDeIos() {
  return (
    <ol className="instalar__pasos">
      <li>
        Tocá Compartir{' '}
        <svg className="instalar__compartir" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M12 3.5v11M8 7.5l4-4 4 4M8.5 10H7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-1.5" />
        </svg>
        . Si no lo ves, buscalo en el menú de los tres puntos.
      </li>
      <li>Elegí «Agregar a inicio» y confirmá con Agregar.</li>
    </ol>
  );
}
