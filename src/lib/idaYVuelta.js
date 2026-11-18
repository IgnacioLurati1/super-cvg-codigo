// Prueba de ida y vuelta de un formulario de edición: lo guardado, abierto para editar y vuelto a guardar sin tocar
// nada, tiene que dar lo mismo. Agarra lo que pasó con una opción «otro» que desaparecía al editar.
//
// Cada formulario editable tiene dos funciones puras, `aFormulario(guardado)` y `aDatos(formulario)`. En los
// ejemplos van también los casos raros: la opción «otro», campos vacíos, valores que ya no están en la lista.
//   it('ida y vuelta', () => expect(idaYVuelta({ aFormulario, aDatos, ejemplos })).toEqual([]));
const ordenado = (v) => {
  if (Array.isArray(v)) return v.map(ordenado);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, ordenado(v[k])]));
  return v;
};
const igual = (a, b) => JSON.stringify(ordenado(a)) === JSON.stringify(ordenado(b));

export function idaYVuelta({ aFormulario, aDatos, ejemplos }) {
  if (!ejemplos?.length) return ['sin ejemplos'];
  const fallas = [];
  for (const guardado of ejemplos) {
    const vuelta = aDatos(aFormulario(guardado));
    if (!igual(guardado, vuelta)) fallas.push(`cambió: ${JSON.stringify(guardado)} quedó ${JSON.stringify(vuelta)}`);
  }
  return fallas;
}
