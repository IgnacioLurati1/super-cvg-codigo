import { describe, expect, it } from 'vitest';
import { revisarTextos } from './check.mjs';

describe('revisión de textos', () => {
  it('agarra «:» en medio de una oración, flechas y puntos medios', () => {
    expect(revisarTextos('<p>Tu pedido: lo confirmamos hoy</p>')).toHaveLength(1);
    expect(revisarTextos("avisar('Atención: se canceló la clase');")).toHaveLength(1);
    expect(revisarTextos('<button>Seguir →</button>')).toHaveLength(1);
    expect(revisarTextos('<p>Rosario · Argentina</p>')).toHaveLength(1);
  });

  it('deja pasar código, estilos, enlaces y lo marcado', () => {
    for (const bien of [
      "const s = { color: 'red', margin: 0 };",
      '<a href="https://ejemplo.com/a">Ver</a>',
      "<div style={{ '--orden': 1 }}>Hola</div>",
      "import x from 'y';",
      '// Un comentario: con dos puntos',
      '<p>Tu pedido: va igual</p> // textos-ok',
      "const r = c ? 'una frase' : 'otra frase';",
      "if (/x: y/.test(t)) return { a: 'b c' };",
      "matchMedia('(prefers-reduced-motion: reduce)');",
    ]) expect(revisarTextos(bien), bien).toEqual([]);
  });
});
