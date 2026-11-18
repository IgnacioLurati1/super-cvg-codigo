import { useAbrirPrevia } from './Previa';
import { IconoDeItem } from './Simbolo';

const Marcado = ({ partes }) => partes.map((p, i) => (p.marca ? <mark key={i}>{p.texto}</mark> : <span key={i}>{p.texto}</span>));

/** A PDF where the words are inside: its name, the page and a piece of it with the words marked. It opens at that page,
 * with the words found. `hallazgo`: { item, pagina, otras, partes } (indicePdf.js). */
export default function FilaEnPdf({ hallazgo, consulta, marca = null, partes = null }) {
  const abrir = useAbrirPrevia();
  const { item, pagina, otras } = hallazgo;
  const donde = otras > 0 ? `Página ${pagina}, y ${otras === 1 ? 'otra más' : `${otras} más`}` : `Página ${pagina}`;
  return (
    <li className="fila fila--en-pdf">
      <button type="button" className="fila__principal" aria-haspopup="dialog" onClick={() => abrir({ ...item, abrirEn: { pagina, buscar: consulta } })}>
        <IconoDeItem item={item} />
        <span className="fila__texto">
          <span className="fila__nombre">{partes ? <Marcado partes={partes} /> : item.nombre}</span>
          <span className="fila__dato">{[marca, donde].filter(Boolean).join(', ')}</span>
          <span className="fila__recorte"><Marcado partes={hallazgo.partes} /></span>
        </span>
      </button>
    </li>
  );
}
