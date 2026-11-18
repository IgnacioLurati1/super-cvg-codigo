import { useState } from 'react';
import { useTemaOscuro } from '../lib/ajustes';

/** The sheet behind a card, like the summary printed: the photo of its first page, which El Santo Resumen takes, over
 * its cover (exam, title and subject). The cover is what shows while the photo comes, when there is none or when it
 * does not load, so nothing moves. In the dark theme, the photo of the page in its own dark theme, where it has one.
 * Only decoration: screen readers have the title and the data of the card. */
export default function HojaResumen({ foto, titulo, materia, instancia }) {
  const oscuro = useTemaOscuro();
  // By address: the one that loaded and the one that failed. Another photo starts over.
  const [cargada, setCargada] = useState('');
  const [fallidas, setFallidas] = useState(() => new Set());
  const conOscura = oscuro && foto?.oscura && !fallidas.has(foto.oscura);
  const url = conOscura ? foto.oscura : foto && !fallidas.has(foto.url) ? foto.url : '';
  const forma = url && cargada === url ? 'foto' : 'caratula';
  return (
    <span className="hoja" aria-hidden="true" data-forma={forma} data-foto={forma === 'foto' && conOscura ? 'oscura' : undefined}>
      <span className="hoja__caratula">
        {instancia && <span className="hoja__instancia">{instancia}</span>}
        <span className="hoja__titulo">{titulo}</span>
        {materia && <span className="hoja__materia">{materia}</span>}
      </span>
      {url && (
        <img
          className="hoja__foto"
          src={url}
          width={foto.ancho}
          height={foto.alto}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={() => setCargada(url)}
          onError={() => setFallidas((antes) => new Set(antes).add(url))}
        />
      )}
    </span>
  );
}
