// Tu horario (Horario.jsx): where each class of a day goes in the week of a computer.

/** The classes of a day that overlap go side by side: by id, its lane, how many lanes its group has, and the free
 * minutes above and below it (where a short class can grow its touch area without covering another one). */
export function carrilesDelDia(delDia, inicio, fin) {
  const ordenadas = [...delDia].sort((a, b) => a.desde - b.desde || a.hasta - b.hasta);
  const lugares = new Map();
  let grupo = [];
  let finDelGrupo = -Infinity;
  // The end of the last class of each lane of the group.
  let fines = [];
  const cerrarGrupo = () => {
    for (const c of grupo) lugares.get(c.id).carriles = fines.length;
  };
  for (const c of ordenadas) {
    if (c.desde >= finDelGrupo) {
      cerrarGrupo();
      grupo = [];
      fines = [];
    }
    let carril = fines.findIndex((f) => f <= c.desde);
    if (carril === -1) carril = fines.push(c.hasta) - 1;
    else fines[carril] = c.hasta;
    const antes = Math.max(inicio, ...ordenadas.filter((o) => o.hasta <= c.desde).map((o) => o.hasta));
    const despues = Math.min(fin, ...ordenadas.filter((o) => o.desde >= c.hasta).map((o) => o.desde));
    lugares.set(c.id, { carril, carriles: 1, antes: c.desde - antes, despues: despues - c.hasta });
    grupo.push(c);
    finDelGrupo = Math.max(finDelGrupo, c.hasta);
  }
  cerrarGrupo();
  return lugares;
}
