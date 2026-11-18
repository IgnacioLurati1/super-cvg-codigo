/** A name like `peso_acumulado_de_los_elementos`: when it doesn't fit, it breaks after one of its «_», not in the
 * middle of a word (Paso a paso's variables, the columns of «Pasar a tablas»). */
export const conCortes = (nombre) => String(nombre).split(/(?<=_)/).flatMap((parte, i) => (i ? [<wbr key={i} />, parte] : [parte]));
