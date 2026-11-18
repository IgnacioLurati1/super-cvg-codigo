import { useLayoutEffect, useRef } from 'react';
import './Imagen.css';

// Una foto que guarda su lugar antes de llegar. Mientras baja se ve el fondo del sitio con un brillo lento;
// cuando está decodificada aparece de a poco. Si falla o no hay foto, queda el respaldo.
//
// El lugar lo da `proporcion` («4 / 5») o el contenedor, que tiene que tener alto. `className` y
// `style` van al marco; lo demás (width, height, sizes…) va a la <img>. El estado vive en
// data-estado del marco (cargando, lista, al-toque, error, vacia) y lo maneja el DOM, sin renders.
// `previa`: la miniatura de la foto (data URL guardada junto a la foto, o urlMini de src/lib/supabase.js). Llega
// enseguida y se ve borrosa mientras baja la grande, que se funde encima. Toda foto grande del sitio la lleva.
export default function Imagen({ src, alt = '', proporcion, ajuste, carga = 'lazy', respaldo, previa, className = '', style, ...resto }) {
  const marco = useRef(null);
  const foto = useRef(null);
  const chica = useRef(null);

  // Antes de pintar: si la foto ya estaba en la caché se muestra de una, sin fundido.
  useLayoutEffect(() => {
    const el = marco.current;
    const img = foto.current;
    if (!el) return;
    if (!src) el.dataset.estado = 'vacia';
    else el.dataset.estado = img?.complete && img.naturalWidth > 0 ? 'al-toque' : 'cargando';
    const mini = chica.current;
    if (mini?.complete && mini.naturalWidth > 0) el.dataset.previa = '';
    else delete el.dataset.previa;
  }, [src, previa]);

  const alCargar = (e) => {
    const img = e.currentTarget;
    const listo = () => {
      const el = marco.current;
      if (!el || img.getAttribute('src') !== src || el.dataset.estado === 'al-toque') return;
      el.dataset.estado = 'lista';
    };
    // decode() espera a que la foto esté lista para pintarse: el fundido no arranca a los tirones.
    if (img.decode) img.decode().then(listo, listo);
    else listo();
  };

  const alFallar = (e) => {
    if (marco.current && e.currentTarget.getAttribute('src') === src) marco.current.dataset.estado = 'error';
  };

  const conPrevia = (e) => {
    if (marco.current && e.currentTarget.getAttribute('src') === previa) marco.current.dataset.previa = '';
  };

  const clases = ['imagen', proporcion && 'imagen--proporcion', ajuste === 'contain' && 'imagen--entera', className]
    .filter(Boolean)
    .join(' ');

  return (
    <span ref={marco} className={clases} style={proporcion ? { '--imagen-proporcion': proporcion, ...style } : style}>
      {src && previa && (
        <img
          ref={chica}
          className="imagen__previa"
          src={previa}
          alt=""
          aria-hidden="true"
          loading={carga}
          decoding="async"
          onLoad={conPrevia}
        />
      )}
      {src && (
        <img
          ref={foto}
          className="imagen__foto"
          src={src}
          alt={alt}
          loading={carga}
          decoding="async"
          onLoad={alCargar}
          onError={alFallar}
          {...resto}
        />
      )}
      <span className="imagen__respaldo" {...(alt ? { role: 'img', 'aria-label': alt } : { 'aria-hidden': true })}>
        {respaldo}
      </span>
    </span>
  );
}

