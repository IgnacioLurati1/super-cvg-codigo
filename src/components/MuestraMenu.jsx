import { IconoMenu, PANTALLAS_DEL_MENU } from '../layouts/Menu';

/** The header in small: two screens (four with only the drawings), the first one on view, as each style shows them
 * (configuracion.css). `claves`: which screens, in order; by default, the first ones of the menu. */
export default function MuestraMenu({ estilo, claves = null }) {
  const conDibujo = estilo === 'iconos' || estilo === 'solo-iconos';
  const todas = claves ? claves.map((c) => PANTALLAS_DEL_MENU.find((m) => m.clave === c)).filter(Boolean) : PANTALLAS_DEL_MENU;
  return (
    <span className="muestra-menu" data-estilo={estilo} aria-hidden="true">
      {todas.slice(0, estilo === 'solo-iconos' ? 4 : 2).map((m, i) => (
        <span key={m.clave} className="muestra-menu__cosa" data-actual={i === 0 || undefined}>
          {conDibujo && <IconoMenu nombre={m.clave} />}
          {estilo !== 'solo-iconos' && m.texto}
        </span>
      ))}
    </span>
  );
}
