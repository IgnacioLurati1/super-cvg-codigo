import { Desborde } from '../Hoja';
import './_est-planilla.css';

// The desk check of Simulación as the notes' spreadsheet (Fig. 1.7): the clock as the row's name, the event, and the
// columns grouped as the notes group them (state, list of events, counters). What changed in a row is in ink; what
// comes from the row before, in soft ink, so the eye follows each event. The clock stays put while it scrolls sideways.

/**
 * `grupos`: [{ titulo, columnas: [{ titulo, valor: (fila) => text }] }]. `reloj` and `evento`: (fila) => text.
 * `marcada`: (fila) => true for the row to mark with the highlighter.
 */
export function Planilla({ etiqueta, resumen, filas, reloj, evento, grupos, marcada }) {
  const columnas = grupos.flatMap((g) => g.columnas);
  const textos = filas.map((f) => columnas.map((c) => c.valor(f)));
  return (
    <Desborde etiqueta={etiqueta}>
      <table className="tabla-pasos ce-planilla">
        <caption className="solo-lectores">{resumen}</caption>
        <thead>
          <tr>
            <th scope="col" rowSpan={2} className="ce-planilla__reloj">
              Reloj
            </th>
            <th scope="col" rowSpan={2} className="ce-planilla__evento">
              Evento
            </th>
            {grupos.map((g) => (
              <th key={g.titulo} scope="colgroup" colSpan={g.columnas.length} className="ce-planilla__grupo">
                {g.titulo}
              </th>
            ))}
          </tr>
          <tr>
            {grupos.flatMap((g) =>
              g.columnas.map((c, k) => (
                <th key={`${g.titulo}-${c.titulo}`} scope="col" data-borde={k === 0 || undefined}>
                  {c.titulo}
                </th>
              )),
            )}
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) => {
            let k = 0;
            return (
              <tr key={i} className={marcada?.(f) ? 'ce-marcada' : undefined}>
                <th scope="row" className="ce-planilla__reloj">
                  {reloj(f)}
                </th>
                <td className="ce-planilla__evento">{evento(f)}</td>
                {grupos.flatMap((g) =>
                  g.columnas.map((c, j) => {
                    const texto = textos[i][k];
                    const igual = i > 0 && texto === textos[i - 1][k];
                    k += 1;
                    return (
                      <td key={`${g.titulo}-${c.titulo}`} data-igual={igual || undefined} data-borde={j === 0 || undefined}>
                        {texto}
                      </td>
                    );
                  }),
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </Desborde>
  );
}

/** What happened in each event, told in order, folded under the spreadsheet. */
export function Relato({ filas, reloj }) {
  return (
    <details className="calc-hoja__mas">
      <summary>Qué pasó en cada evento</summary>
      <ol className="ce-relato">
        {filas.map((f, i) => (
          <li key={i}>
            <strong>{`Reloj ${reloj(f)}.`}</strong> {f.texto}
          </li>
        ))}
      </ol>
    </details>
  );
}
