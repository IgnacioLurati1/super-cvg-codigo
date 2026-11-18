import { describe, expect, it } from 'vitest';
import { marcasDelIntento, resumenDelError, TOPE_EN_LINEA } from './enLinea';

const ERROR_C = '  main.c, línea 4\n    int total = 0\n                 ^\nFalta un `;` al final de la línea 4.\nHay otro error más abajo. Arreglá este primero y corré de nuevo.';
const PYTHON = 'Traceback (most recent call last):\n  File "main.py", line 2, in <module>\n    print(x)\nNameError: name \'x\' is not defined';

describe('lo que va al final de la línea', () => {
  it('lo que pasó, sin dónde y en una línea', () => {
    expect(resumenDelError(ERROR_C)).toBe('Falta un `;` al final de la línea 4.');
    expect(resumenDelError(PYTHON)).toBe("NameError: name 'x' is not defined");
    expect(resumenDelError(`  a.c, línea 1\n    x\n${'muy largo '.repeat(40)}`)).toHaveLength(TOPE_EN_LINEA);
  });

  it('el error del archivo abierto, con el texto de su pieza de la consola', () => {
    const piezas = [{ tipo: 'error', texto: ERROR_C, linea: 4 }];
    expect(marcasDelIntento({ error: { linea: 4, archivo: 'main.c' }, piezas, lenguaje: 'c', abierto: 'main.c', principal: 'main.c' })).toEqual([
      { linea: 4, tono: 'error', texto: 'Falta un `;` al final de la línea 4.' },
    ]);
    expect(marcasDelIntento({ error: { linea: 4, archivo: 'lista.c' }, piezas, lenguaje: 'c', abierto: 'main.c', principal: 'main.c' })).toEqual([]);
    expect(marcasDelIntento({ error: null, piezas: [], lenguaje: 'python', abierto: 'main.py', principal: 'main.py' })).toEqual([]);
  });

  it('en C, cada aviso del compilador en su línea y su archivo', () => {
    const piezas = [{ tipo: 'salida', flujo: 'err', texto: 'Aviso en la línea 3. La variable `x` no se usa.\nAviso en la línea 7. Falta el `return`.\n' }];
    expect(marcasDelIntento({ error: null, piezas, lenguaje: 'c', abierto: 'main.c', principal: 'main.c' }).map((m) => [m.linea, m.tono])).toEqual([[3, 'aviso'], [7, 'aviso']]);
    const enProyecto = [{ tipo: 'salida', flujo: 'err', texto: 'Aviso en lista.c, línea 2. La variable `y` no se usa.\n' }];
    expect(marcasDelIntento({ error: null, piezas: enProyecto, lenguaje: 'c', abierto: 'lista.c', principal: 'main.c' })).toEqual([{ linea: 2, tono: 'aviso', texto: 'La variable `y` no se usa.' }]);
    expect(marcasDelIntento({ error: null, piezas: enProyecto, lenguaje: 'c', abierto: 'main.c', principal: 'main.c' })).toEqual([]);
    expect(marcasDelIntento({ error: null, piezas: [{ ...piezas[0], flujo: 'out' }], lenguaje: 'c', abierto: 'main.c', principal: 'main.c' })).toEqual([]);
  });
});
