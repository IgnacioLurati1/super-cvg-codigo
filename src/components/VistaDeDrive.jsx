import { textoDePresentacion } from '../lib/presentacion';
import { useConsulta } from '../lib/useConsulta';
import { documentoAislado } from '../lib/verResumen';

// Files of a Drive folder that open here besides PDFs and images. Nothing of them runs: the HTML goes in a frame without
// scripts, without an origin of its own and cleaned once more (documentoAislado), and a PowerPoint shows only its text.
const TOPE_HTML = 6 * 1024 * 1024;

export function VistaHtml({ blob, nombre }) {
  const { datos, error } = useConsulta(async () => (blob.size > TOPE_HTML ? null : documentoAislado(await blob.text())), [blob]);
  if (error || datos === null) return <p className="previa__aviso" role="alert">No se pudo mostrar esta página. Bajala para abrirla.</p>;
  if (!datos) return null;
  return <iframe className="previa__marco" title={`Vista de ${nombre}`} sandbox="" referrerPolicy="no-referrer" srcDoc={datos} />;
}

export function VistaPresentacion({ blob }) {
  const { datos, error } = useConsulta(async () => textoDePresentacion(await blob.arrayBuffer()), [blob]);
  if (error) return <p className="previa__aviso" role="alert">No se pudo leer esta presentación. Bajala para abrirla.</p>;
  if (!datos) return null;
  const conTexto = datos.filter((d) => d.parrafos.length);
  if (!conTexto.length) return <p className="previa__aviso">Esta presentación no tiene texto para mostrar. Bajala para verla.</p>;
  return (
    <div className="previa__diapositivas">
      {conTexto.map((d) => (
        <section key={d.numero} className="previa__diapositiva">
          <h3>Diapositiva {d.numero}</h3>
          {d.parrafos.map((p, i) => <p key={i}>{p}</p>)}
        </section>
      ))}
      <p className="previa__nota">Es solo el texto, sin formato ni imágenes.</p>
    </div>
  );
}
