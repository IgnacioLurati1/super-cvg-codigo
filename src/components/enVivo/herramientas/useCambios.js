import { useEffect, useState } from 'react';

// Renders again when a shared Yjs type of the tab changes (its own edits or the others'): `mesa` changes only when
// someone moves or marks.
export function useCambios(tipo) {
  const [, setVez] = useState(0);
  useEffect(() => {
    const alCambiar = () => setVez((n) => n + 1);
    tipo.observeDeep(alCambiar);
    return () => tipo.unobserveDeep(alCambiar);
  }, [tipo]);
}
