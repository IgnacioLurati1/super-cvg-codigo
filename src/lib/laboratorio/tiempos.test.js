import { describe, expect, it } from 'vitest';
import { ajustar, formatoTiempo, fraseDelAjuste, funcionesDelCodigo, leerFunciones, leerTamanos, leerVueltas, llamadaSugerida, marcasDeEje, tiempoDelAjuste, TAMANOS_POR_DEFECTO } from './tiempos';

// Times as a real run gives them: a curve, a fixed cost per call and some noise, always the same (a seeded sequence).
function medidas(f, { costo = 2e-6, ruido = 0.04, tamanos = TAMANOS_POR_DEFECTO } = {}) {
  let semilla = 7;
  const azar = () => {
    semilla = (semilla * 16807) % 2147483647;
    return semilla / 2147483647 - 0.5;
  };
  return tamanos.map((n) => ({ n, s: (f(n) + costo) * (1 + ruido * 2 * azar()) }));
}

describe('ajustar', () => {
  it('ve n² en un ordenamiento burbuja', () => {
    expect(ajustar(medidas((n) => 2e-8 * n * n)).modelo).toBe('n2');
  });

  it('ve n en un recorrido de la lista', () => {
    expect(ajustar(medidas((n) => 5e-8 * n)).modelo).toBe('n');
  });

  it('ve n log n en un merge sort', () => {
    const a = ajustar(medidas((n) => 4e-8 * n * Math.log2(n), { ruido: 0.02, tamanos: [500, 1000, 2000, 4000, 8000, 16000, 32000] }));
    expect(a.modelo).toBe('nlogn');
  });

  it('una función que no depende de n es constante, aunque haya ruido', () => {
    expect(ajustar(medidas(() => 3e-6, { ruido: 0.1 })).modelo).toBe('constante');
  });

  it('con lo que midió Pyodide de verdad (burbuja de 100 a 1600), n²', () => {
    const puntos = [[100, 0.000227], [200, 0.000906], [400, 0.00386], [800, 0.0175], [1600, 0.078]].map(([n, s]) => ({ n, s }));
    const a = ajustar(puntos);
    expect(a.modelo).toBe('n2');
    expect(tiempoDelAjuste(a, 1600)).toBeCloseTo(0.078, 2);
  });

  it('con una búsqueda lineal de verdad en listas grandes, que n y n log n se parecen', () => {
    const puntos = [[10000, 282e-6], [20000, 534e-6], [40000, 1.1e-3], [80000, 2.51e-3], [160000, 5.18e-3]].map(([n, s]) => ({ n, s }));
    const a = ajustar(puntos);
    expect([a.modelo, a.parecido].sort()).toEqual(['n', 'nlogn']);
  });

  it('un merge sort con los tamaños de siempre crece como n log n', () => {
    expect(ajustar(medidas((n) => 1e-7 * n * Math.log2(n))).modelo).toBe('nlogn');
  });

  // What Pyodide measured (min of five rounds, 100 to 3200): a linear search, a bit slower per element as the list grows,
  // and sorted() on a shuffled list.
  it('con tiempos de verdad, una búsqueda lineal crece como n y sorted() como n log n', () => {
    const tiempos = (us) => TAMANOS_POR_DEFECTO.map((n, i) => ({ n, s: us[i] * 1e-6 }));
    for (const us of [[1.99, 3.81, 8.97, 19.47, 38.99, 81.55], [2.3, 4, 9.82, 25.99, 44.16, 92.23], [2.02, 4.3, 9.91, 21.18, 45.36, 82.13]]) {
      expect(ajustar(tiempos(us)).modelo).toBe('n');
    }
    for (const us of [[5.01, 10.78, 25.55, 55.45, 124.86, 311.01], [5.94, 13.93, 28.83, 57.68, 146.33, 372.62], [5, 10.92, 26.03, 62.21, 131.88, 288.03]]) {
      expect(ajustar(tiempos(us))).toMatchObject({ modelo: 'nlogn', parecido: null });
    }
  });

  it('con menos de tres tamaños no dice nada', () => {
    expect(ajustar([{ n: 1, s: 1 }, { n: 2, s: 2 }])).toBe(null);
    expect(ajustar([{ n: 1, s: 1 }, { n: 1, s: 2 }, { n: 2, s: 2 }])).toBe(null);
  });

  // What Pyodide measured for the exhaustive knapsack of a real TP (every subset, n from 8 to 18): it said «No depende de
  // n», because every curve missed by about all of each time and the simplest one won.
  const EXHAUSTIVA = [[8, 59e-6], [10, 305e-6], [12, 2.17e-3], [14, 10e-3], [16, 29e-3], [18, 124e-3]].map(([n, s]) => ({ n, s }));

  it('la búsqueda exhaustiva de verdad crece como 2ⁿ, y lo dice claro', () => {
    const a = ajustar(EXHAUSTIVA);
    expect(a.modelo).toBe('exp');
    expect(fraseDelAjuste(a)).toEqual({ titulo: 'Crece muy rápido, como 2ⁿ.', detalle: 'Si n sube 1, tarda el doble.', parecido: '' });
    expect(tiempoDelAjuste(a, 18)).toBeGreaterThan(0.06);
  });

  it('con un poco menos o más de lo medido sigue siendo 2ⁿ, también n·2ⁿ, y en n! se ve n!', () => {
    for (const f of [0.8, 1.25]) expect(ajustar(EXHAUSTIVA.map((p, i) => ({ n: p.n, s: p.s * (i % 2 ? f : 1 / f) }))).modelo).toBe('exp');
    expect(ajustar(medidas((n) => 5e-9 * n * 2 ** n, { tamanos: [16, 19, 21, 23] })).modelo).toBe('exp');
    const factorial = (n) => (n < 2 ? 1 : n * factorial(n - 1));
    expect(ajustar(medidas((n) => 1e-7 * factorial(n), { tamanos: [5, 6, 7, 8, 9, 10] })).modelo).toBe('fact');
  });

  it('lo que crece más rápido que n² sin ser 2ⁿ no se llama de ningún modo, y nunca constante', () => {
    for (const tamanos of [[100, 200, 400, 800, 1600], [8, 10, 12, 14, 16, 18]]) {
      const a = ajustar(medidas((n) => (1e-4 / tamanos[0] ** 3) * n ** 3, { tamanos }));
      expect(a.modelo).toBe('mas');
      // The curve, drawn, goes by the biggest one (the points carry 4% of noise).
      expect(tiempoDelAjuste(a, tamanos.at(-1)) / ((tamanos.at(-1) / tamanos[0]) ** 3 * 1e-4)).toBeCloseTo(1, 1);
    }
    expect(fraseDelAjuste({ modelo: 'mas', parecido: null }).titulo).toBe('Crece más rápido que n².');
  });

  it('con tamaños chicos, n² sigue siendo n² aunque 2ⁿ entre en la cuenta', () => {
    expect(ajustar(medidas((n) => 1e-7 * n * n, { tamanos: [8, 10, 12, 14, 16, 18] })).modelo).toBe('n2');
  });

  it('lo dice en palabras', () => {
    expect(fraseDelAjuste({ modelo: 'n2', parecido: null })).toEqual({ titulo: 'Crece como n².', detalle: 'Si n se duplica, tarda cuatro veces más.', parecido: '' });
    expect(fraseDelAjuste({ modelo: 'constante', parecido: null }).titulo).toBe('No depende de n.');
    expect(fraseDelAjuste({ modelo: 'n', parecido: 'nlogn' }).parecido).toBe('También se parece a n log n. Con tamaños más grandes se distinguen mejor.');
  });
});

describe('las funciones y cómo llamarlas', () => {
  it('encuentra las funciones de arriba del programa, con sus parámetros', () => {
    const codigo = 'import math\ndef burbuja(lista):\n    def interna(x):\n        pass\n\ndef buscar(lista, x=0):\n    pass\ndef tamaño(n: int, *resto):\n    pass\nclass A:\n    def m(self, y):\n        pass\n';
    expect(funcionesDelCodigo(codigo)).toEqual([
      { nombre: 'burbuja', parametros: ['lista'] },
      { nombre: 'buscar', parametros: ['lista', 'x'] },
      { nombre: 'tamaño', parametros: ['n'] },
    ]);
  });

  it('sugiere n para un número, una lista al revés para lo demás, y algo que no está para lo que se busca', () => {
    expect(llamadaSugerida(['n'])).toBe('n');
    expect(llamadaSugerida(['lista'])).toBe('list(range(n, 0, -1))');
    expect(llamadaSugerida(['lista', 'x'])).toBe('list(range(n, 0, -1)), -1');
    expect(llamadaSugerida(['x'])).toBe('n');
    expect(llamadaSugerida([])).toBe('');
  });

  // The program of a real TP (Algoritmos Genéticos, TP 2), cut down: its functions take the items and a capacity.
  const MOCHILA = `import itertools

elementos_volumen = [
    {'id': 1,  'volumen': 150,  'valor': 20},
    {'id': 2,  'volumen': 325,  'valor': 40},
]
CAPACIDAD_VOLUMEN = 4200

def busqueda_exhaustiva(lista_elementos, capacidad_maxima, clave_peso='volumen'):
    """Prueba todas las combinaciones: busqueda_exhaustiva(lista, 10) no es una llamada."""
    for tamano in range(1, len(lista_elementos) + 1):
        for combinacion in itertools.combinations(lista_elementos, tamano):
            pass

def algoritmo_goloso(lista_elementos, capacidad_maxima, clave_peso='volumen'):
    return []

for _ in range(100):
    # busqueda_exhaustiva(no, esta)
    sol_ex, peso_ex, val_ex = busqueda_exhaustiva(elementos_volumen, CAPACIDAD_VOLUMEN, 'volumen')
    sol_go = algoritmo_goloso(elementos_volumen, capacidad_maxima=CAPACIDAD_VOLUMEN)
`;

  it('la llama como la llama el programa: su lista crece hasta n, lo fijo queda', () => {
    const [exhaustiva, goloso] = funcionesDelCodigo(MOCHILA);
    expect(llamadaSugerida(exhaustiva.parametros, MOCHILA, exhaustiva.nombre)).toBe("(elementos_volumen * n)[:n], CAPACIDAD_VOLUMEN, 'volumen'");
    expect(llamadaSugerida(goloso.parametros, MOCHILA, goloso.nombre)).toBe('(elementos_volumen * n)[:n], capacidad_maxima=CAPACIDAD_VOLUMEN');
  });

  it('una llamada del programa: un número es n, lo que se busca no está, y sin nada que crezca, por los nombres', () => {
    const fib = 'def fib(n):\n    return n if n < 2 else fib(n - 1) + fib(n - 2)\n\nprint(fib(30))\n';
    expect(llamadaSugerida(['n'], fib, 'fib')).toBe('n');
    const buscar = 'def buscar(lista, x):\n    return x in lista\n\ndatos = [5, 3, 8]\nprint(buscar(datos, 8))\n';
    expect(llamadaSugerida(['lista', 'x'], buscar, 'buscar')).toBe('(datos * n)[:n], -1');
    const literal = 'def suma(xs):\n    return sum(xs)\n\nsuma([1, 2, 3])\n';
    expect(llamadaSugerida(['xs'], literal, 'suma')).toBe('([1, 2, 3] * n)[:n]');
    const sinLista = 'def saludar(nombre):\n    return nombre\n\nsaludar("Ana")\n';
    expect(llamadaSugerida(['nombre'], sinLista, 'saludar')).toBe('list(range(n, 0, -1))');
    const desconocida = 'def ordenar(xs):\n    return sorted(xs)\n\nordenar(leer())\n';
    expect(llamadaSugerida(['xs'], desconocida, 'ordenar')).toBe('list(range(n, 0, -1))');
  });
});

describe('leerTamanos', () => {
  it('lee números con comas o espacios, en orden y sin repetir', () => {
    expect(leerTamanos('400, 100 200;100 1.000')).toEqual({ tamanos: [100, 200, 400, 1000] });
  });

  it('sin tamaños, los elige solo', () => {
    expect(leerTamanos('  ')).toEqual({ tamanos: [] });
  });

  it('dice qué está mal', () => {
    expect(leerTamanos('10, 20').error).toMatch(/al menos tres/);
    expect(leerTamanos('10, 2.5x, 30').error).toBe('«2.5x» no es un tamaño. Usá enteros mayores que cero.');
    expect(leerTamanos('0, 1, 2').error).toMatch(/mayores que cero/);
    expect(leerTamanos('1, 2, 99999999').error).toMatch(/más grande/);
    expect(leerTamanos(Array.from({ length: 13 }, (_, i) => i + 1).join(',')).error).toBe('Poné hasta 12 tamaños.');
  });
});

describe('formato y ejes', () => {
  it('escribe cada tiempo en la unidad que mejor se lee', () => {
    expect(formatoTiempo(0.0000352)).toBe('35,2 µs');
    expect(formatoTiempo(0.0125)).toBe('12,5 ms');
    expect(formatoTiempo(1.234)).toBe('1,23 s');
  });

  it('pone marcas redondas desde cero hasta pasar el máximo', () => {
    expect(marcasDeEje(3200)).toEqual([0, 1000, 2000, 3000, 4000]);
    expect(marcasDeEje(0.078)).toEqual([0, 0.02, 0.04, 0.06, 0.08]);
    expect(marcasDeEje(0)).toEqual([0, 1]);
  });
});

describe('el programa entero', () => {
  it('lee las vueltas, de 1 a 10', () => {
    expect(leerVueltas(' 3 ')).toEqual({ vueltas: 3 });
    expect(leerVueltas('10')).toEqual({ vueltas: 10 });
    for (const mal of ['0', '11', '', '2.5', 'tres', '-1']) expect(leerVueltas(mal).error).toMatch(/de 1 a 10/);
  });

  it('lee dónde se fue el tiempo y descarta lo que no tiene forma', () => {
    const texto = JSON.stringify({
      total: 1.5,
      funciones: [
        { nombre: 'busqueda_exhaustiva', archivo: 'tp2.py', llamadas: 101, s: 1.2 },
        { nombre: '', archivo: 'tp2.py', llamadas: 1, s: 0.1 },
        { nombre: 'otra', llamadas: '2', s: 0.1 },
        { nombre: 'x'.repeat(200), archivo: 7, llamadas: 1, s: 0.01 },
      ],
      mas: 4,
    });
    const r = leerFunciones(texto);
    expect(r.total).toBe(1.5);
    expect(r.mas).toBe(4);
    expect(r.funciones).toEqual([
      { nombre: 'busqueda_exhaustiva', archivo: 'tp2.py', llamadas: 101, s: 1.2 },
      { nombre: 'x'.repeat(80), archivo: '', llamadas: 1, s: 0.01 },
    ]);
    for (const mal of ['no es json', 'null', '{"total":-1,"funciones":[]}', '{"total":1}']) expect(leerFunciones(mal)).toBeNull();
  });
});
