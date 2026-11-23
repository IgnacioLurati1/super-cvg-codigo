import { textoSobre } from '../lib/ajustes';
import { coloresDe, dibujoDe, pantallasALaVista } from '../lib/disenos';
import MuestraMenu from './MuestraMenu';

/** A design in small, drawn from its own code: the page of its theme or style (the drawings of Configuración), its
 * menu on top or on the left with the screens it shows and in its style, in its colors, and three dots of its paint
 * (main color, highlighter and Consultron's). Only for the eye: the card says the same in words. */
export default function MiniaturaDeDiseno({ ajustes, grande = false }) {
  const c = coloresDe(ajustes);
  // Plano and Pizarrón change with light or dark: the design's own, or the viewer's when it follows the device.
  const luz = ajustes.tema === 'claro' || ajustes.tema === 'oscuro' ? ajustes.tema : undefined;
  const barra = {
    '--accion': c.cabecera,
    '--accion-texto': textoSobre(c.cabecera),
    '--resaltador': c.resaltador,
    '--resaltador-texto': textoSobre(c.resaltador),
  };
  return (
    <span className="mini-diseno" data-lado={ajustes.menu.posicion} data-grande={grande || undefined} aria-hidden="true">
      <span className="mini-diseno__barra" style={barra}>
        <MuestraMenu estilo={ajustes.menu.estilo} claves={pantallasALaVista(ajustes)} />
      </span>
      <span className="dibujo-tema mini-diseno__pagina" data-cual={dibujoDe(ajustes)} data-luz={luz} data-potente={ajustes.potente || undefined} />
      <span className="mini-diseno__pinturas">
        {[c.accion, c.resaltador, c.consultron].map((color, i) => <i key={i} style={{ background: color }} />)}
      </span>
    </span>
  );
}
