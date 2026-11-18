// For the tests. A sheet writes the CFs of a table in no fixed order, and the tables in an order of its own: each table
// is compared with its header, its CP and its CFs, these as a set.
export function porTabla(texto) {
  return Object.fromEntries(
    texto
      .trim()
      .split(/\n\n/)
      .map((b) => {
        const [cabecera, cp, ...cfs] = b.split('\n');
        return [cabecera.slice(0, cabecera.indexOf('(')), { cabecera, cp, cfs: [...cfs].sort() }];
      }),
  );
}
