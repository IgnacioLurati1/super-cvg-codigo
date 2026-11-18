import { useEffect, useState } from 'react';

/** What was typed, once the student stops typing for a moment. */
export function useQuieto(valor, ms) {
  const [quieto, setQuieto] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setQuieto(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return quieto;
}
