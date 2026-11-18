import { describe, expect, it } from 'vitest';
import { CALCULADORAS } from '../calculadoras/lista';
import { CALCULOS, calculoDeLaPagina, calculoDelEjercicio, elegirCalculo, esquemaDe, leerDatos, pedidoDeDatos } from './calculos';

const calculo = (slug) => CALCULOS.find((c) => c.slug === slug);

// Questions as a student writes them for an exercise, at least two per calculator.
const PREGUNTAS = {
  matriz: [
    'Calculá el determinante de la matriz 2 1 0; 1 3 2; 0 1 4',
    'Hallá la inversa de A = [[1, 2], [3, 4]]',
    '¿Cuál es el rango de la matriz 1 2 3; 2 4 6; 1 0 1?',
  ],
  dicotomica: ['Hacé la búsqueda dicotómica del 41 en el arreglo 3, 9, 14, 22, 41, 57', 'Buscá el 18 con búsqueda binaria en el vector ordenado 2 5 9 18 27'],
  campo: ['Dado el campo vectorial F = (2xy, x^2), ¿es conservativo? Calculá la divergencia en (1, 2)', 'Calculá el rotor del campo F(x, y) = -y i + x j'],
  raices: [
    'Encontrá una raíz de f(x) = x^3 - x - 2 por bisección en [1, 2] con tolerancia del 1%',
    'Aplicá Newton-Raphson a f(x) = x^2 - 2 desde x0 = 1',
    'Usá el método de la secante para f(x) = e^(-x) - x con x-1 = 0 y x0 = 1',
  ],
  'punto-fijo': ['Resolvé x = cos(x) por iteración de punto fijo desde x0 = 1', 'Aplicá el método de punto fijo con g(x) = e^(-x) y x0 = 0'],
  pvi: ["Resolvé y' = x + y con y(0) = 1 por Euler con h = 0,1 hasta x = 0,3", 'Aplicá Runge-Kutta de cuarto orden a la ecuación diferencial dy/dx = 4e^(0,8x) - 0,5y'],
  claves: ['Hallá las claves candidatas de R(A, B, C, D) con A -> B y B -> C', 'Calculá el cierre de {legajo} en ALUMNO(legajo, materia, nombre, nota)'],
  normalizacion: ['¿En qué forma normal está R(a, b, c) con a -> b y b -> c? Llevala a 3FN', 'Normalizá EMPLEADO(legajo, nombre, codDepto, nombreDepto) con legajo -> codDepto y codDepto -> nombreDepto'],
  'tiro-oblicuo': [
    'Se lanza un proyectil con v0 = 25 m/s a 30° sobre la horizontal. Calculá el alcance y la altura máxima',
    'Un tiro oblicuo desde 20 m de altura con 10 m/s a 45°: ¿cuánto tarda en llegar al suelo?',
  ],
  'campo-cargas': ['Calculá el campo eléctrico en P = (0,02; 0) de dos cargas puntuales de 5 nC y -3 nC', 'Dos cargas de 6 µC y -4 µC están a 1 m. Hallá la fuerza de Coulomb entre ellas'],
  'tabla-verdad': ['Armá la tabla de verdad de (p -> q) y p -> q', '¿Es tautología, contradicción o contingencia la proposición (p ∨ q) ∧ ¬p?'],
  'calculadora-vacia': [
    'Calculá el lote óptimo con una demanda de 1200 unidades por mes, costo de orden $150, costo unitario $8 y tasa de mantenimiento del 2%',
    'Hallá el stock de seguridad con demanda media 55 y desvío 3,75 por período',
    'Calculá el lote óptimo del inventario si la demanda es 300 por mes',
  ],
  relacion: [
    'Analizá si la relación R = {(1,1), (1,2), (2,1), (2,2)} en A = {1, 2, 3} es reflexiva, simétrica y transitiva',
    'Dibujá el digrafo de la relación R = {(a,b), (b,c)} en {a, b, c}',
  ],
  recorrido: ['Hacé el recorrido en preorden del árbol binario de la expresión (a - b) * (c + d)', 'Escribí la forma polaca inversa del árbol de (x + y) * z, en postorden'],
  probabilidades: [
    'Calculá P(X ≤ 2) si X es binomial con n = 10 y p = 0,3',
    'Una variable normal tiene media 50 y desvío 5. Calculá P(45 < X < 55)',
    'Calculá P(X = 3) para una Poisson con λ = 2',
  ],
  medidas: ['Calculá la media, la mediana y el desvío estándar de 4, 8, 15, 16, 23, 42', 'Hallá la moda y la varianza muestral de los datos 3 5 5 7 9'],
  'tabla-discreta': [
    'Una variable aleatoria discreta toma los valores 0, 1, 2, 3 con probabilidades 0,1 0,3 0,4 0,2. Calculá su esperanza y varianza',
    'Calculá la esperanza de X si P(X=1) = 0,5 y P(X=2) = 0,5',
  ],
  bastones: ['Graficá los bastones de una binomial con n = 8 y π = 0,4', 'Hacé el gráfico de bastones de una Poisson con λ = 3'],
  caja: ['Armá el diagrama de caja de 12 15 17 20 22 25 30 41', 'Calculá los cuartiles y los atípicos con un boxplot de estos datos: 3 7 8 9 12 30'],
  subred: ['Calculá las subredes de 192.168.1.0/24 para 6 áreas', '¿Qué máscara necesito para 500 hosts por subred en 172.16.0.0/16?'],
  'ventana-tcp': ['Graficá la ventana de congestión de TCP Reno con umbral 16 y una pérdida en la ronda 10', '¿Cómo evoluciona la ventana en TCP Tahoe con ssthresh 32 y pérdida en la ronda 13?'],
  'proximo-evento': [
    'Simulá una cola M/M/1 con tiempos entre arribos 1 0,5 2 y tiempos de servicio 1,2 2 0,6',
    'Hacé la prueba de escritorio del próximo evento con arribos 0,4 1,2 0,5 y servicios 2 0,7 0,2 hasta 3 demoras',
  ],
  inventario: ['Simulá una política de inventario (s, S) con s = 20 y S = 60 durante 12 meses', 'Calculá el costo de faltante en la simulación del inventario (s, S)'],
  thompson: ['Construí el AFN de Thompson para la expresión regular (a|b)*abb', 'Pasá la expresión regular a(b|c)* a un autómata AFD'],
  gramatica: ['¿De qué tipo de Chomsky es la gramática S -> aSb | ab? Derivá aaabbb', 'Dadas las producciones S -> aA, A -> b, hacé la derivación por la izquierda de ab'],
  planificacion: [
    'Planificá con SJF los procesos P1 (0, 7), P2 (2, 4), P3 (4, 1) y P4 (5, 4) y armá el Gantt',
    'Calculá el tiempo de espera promedio con Round Robin de quantum 2 para los procesos A, B y C',
  ],
  'reemplazo-paginas': ['Con 3 marcos y LRU, ¿cuántos fallos de página da la cadena de referencias 7 0 1 2 0 3 0 4?', 'Aplicá FIFO con 4 marcos a las páginas 1 2 3 4 1 2 5 1 2 3 4 5'],
  banquero: ['Aplicá el algoritmo del banquero para ver si el estado es seguro con 5 procesos y 3 recursos', '¿Hay interbloqueo con estos recursos asignados? Detectá el deadlock'],
  'lgr-raices': ['Trazá el lugar geométrico de las raíces de G(s)H(s) = k/(s(s+2)(s+4))', 'Calculá las asíntotas y los polos del LGR de k/(s^2 + 2s)'],
  graficadora: [
    'Graficá f(x) = 1/(x - 2) + 1 y hallá sus asíntotas',
    'Hallá la recta tangente a f(x) = x^2 en x0 = 2',
    'Estudiá la concavidad y los puntos de inflexión de x^4 - 4x^3',
    'Graficá la circunferencia x^2 + y^2 = 9',
  ],
  'graficadora-3d': [
    'Hallá el plano tangente a z = e^(x^2 - y^2) en el punto (1, -1)',
    'Graficá el hiperboloide x^2 + y^2 - z^2 = 1',
    'Calculá el gradiente de f(x, y) = x^2 - y^2 en (1, 2) y dibujá la superficie',
  ],
};

describe('elegirCalculo', () => {
  it('una pregunta de código no es un ejercicio de calculadora', () => {
    expect(elegirCalculo('escribi un codigo donde dice hola mundo y un bucle de 5 iteraciones diciende soy feo')).toBeNull();
    expect(elegirCalculo('haceme un programa en Python con 3 iteraciones')).toBeNull();
    expect(elegirCalculo('Aplicá punto fijo a g(x) = e^(-x) con 5 iteraciones').calculo.slug).toBe('punto-fijo');
  });

  it('hay preguntas de todas las calculadoras', () => {
    expect(Object.keys(PREGUNTAS).sort()).toEqual(CALCULOS.map((c) => c.slug).sort());
  });

  for (const [slug, preguntas] of Object.entries(PREGUNTAS)) {
    it(`elige ${slug}`, () => {
      for (const p of preguntas) {
        const e = elegirCalculo(p);
        expect(e?.calculo.slug, p).toBe(slug);
        expect(e.pide, p).toBe(true);
      }
    });
  }

  it('una calculadora nueva no le saca un empate a las de antes, y una palabra de otro tema no la llama', () => {
    expect(elegirCalculo('Graficá el árbol de la expresión a + b * c').calculo.slug).toBe('recorrido');
    expect(elegirCalculo('Calculá las asíntotas de k/(s(s + 2))').calculo.slug).toBe('lgr-raices');
    expect(elegirCalculo('Graficá x^2').calculo.slug).toBe('graficadora');
    for (const p of ['¿Qué entra en el parcial 2 de Análisis?', '¿Qué hace el nivel 3 del modelo OSI?', '¿Cuántas materias tiene el plan de estudios 2023?']) {
      expect(elegirCalculo(p), p).toBeNull();
    }
  });

  it('lo que es algo no pide la cuenta', () => {
    expect(elegirCalculo('¿Qué es una subred?')).toMatchObject({ calculo: { slug: 'subred' }, pide: false });
    expect(elegirCalculo('¿Qué es un determinante?')).toMatchObject({ calculo: { slug: 'matriz' }, pide: false });
    expect(elegirCalculo('¿Para qué sirve el gráfico de bastones?')).toMatchObject({ calculo: { slug: 'bastones' }, pide: false });
    expect(elegirCalculo('¿Qué es la simulación de una cola?')).toMatchObject({ calculo: { slug: 'proximo-evento' }, pide: false });
    expect(elegirCalculo('Explicame el cálculo de la varianza muestral').pide).toBe(false);
  });

  it('una cuenta con número o con su verbo sí', () => {
    expect(elegirCalculo('Calculá las subredes de 192.168.1.0/24 para 6 áreas')).toMatchObject({ calculo: { slug: 'subred' }, pide: true });
    expect(elegirCalculo('Resolvé la tabla de verdad de p y no p')).toMatchObject({ calculo: { slug: 'tabla-verdad' }, pide: true });
    expect(elegirCalculo('¿Cuántas subredes salen?').pide).toBe(true);
    expect(elegirCalculo('Dadas las producciones S -> aA y A -> b, ¿de qué tipo es?').pide).toBe(true);
    expect(elegirCalculo('Hacé el recorrido en preorden del árbol de a más b').pide).toBe(true);
    expect(elegirCalculo('¿Qué hace el recorrido en preorden?').pide).toBe(false);
    // Without a number, a verb or a symbol it only opens the calculator.
    expect(elegirCalculo('¿Es tautología la proposición p o no p?')).toMatchObject({ calculo: { slug: 'tabla-verdad' }, pide: false });
  });

  it('lo que no es de ninguna da null o pocos puntos', () => {
    for (const p of [
      '¿Qué es la herencia en programación orientada a objetos?',
      '¿Cuándo es el parcial de Física II?',
      'Resumime la unidad 3 de Sistemas Operativos',
      '¿Qué temas entran en el final de Análisis Numérico?',
      '¿Qué dice el apunte sobre la memoria virtual?',
      'Hola, ¿cómo andás?',
    ]) {
      const e = elegirCalculo(p);
      expect(e === null || e.puntos <= 1, `${p}: ${e?.calculo.slug} con ${e?.puntos}`).toBe(true);
    }
    expect(elegirCalculo('')).toBeNull();
  });

  it('las palabras compartidas van a la de siempre', () => {
    // binomial y poisson: una probabilidad es Distribuciones; los bastones, su gráfico.
    expect(elegirCalculo('Calculá la probabilidad binomial de 3 éxitos en 5 ensayos').calculo.slug).toBe('probabilidades');
    expect(elegirCalculo('Dibujá el gráfico de bastones de la binomial').calculo.slug).toBe('bastones');
    // inventario: el lote y la demanda son Gestión de stocks; la política (s, S), la simulación.
    expect(elegirCalculo('Calculá el lote óptimo del inventario').calculo.slug).toBe('calculadora-vacia');
    expect(elegirCalculo('Simulá la política (s, S) del inventario').calculo.slug).toBe('inventario');
    // normal: la distribución o la forma normal.
    expect(elegirCalculo('Calculá P(X > 12) si X es normal con media 10 y desvío 2').calculo.slug).toBe('probabilidades');
    expect(elegirCalculo('¿En qué forma normal está la relación?').calculo.slug).toBe('normalizacion');
    // raíces: de una función o el lugar geométrico.
    expect(elegirCalculo('Encontrá las raíces de x^2 - 4 por bisección').calculo.slug).toBe('raices');
    expect(elegirCalculo('Trazá el lugar de las raíces de 1/(s(s+1))').calculo.slug).toBe('lgr-raices');
    // tabla: la de verdad o la de una variable discreta.
    expect(elegirCalculo('Armá la tabla de verdad de p -> q').calculo.slug).toBe('tabla-verdad');
    expect(elegirCalculo('Calculá la esperanza de la variable aleatoria discreta de la tabla').calculo.slug).toBe('tabla-discreta');
    // media y desvío: de unos datos o de una distribución.
    expect(elegirCalculo('Calculá la media y el desvío de los datos 2 4 6').calculo.slug).toBe('medidas');
  });
});

describe('leerDatos', () => {
  const subred = calculo('subred');
  const bastones = calculo('bastones');

  it('lo que no es un JSON de objeto da null', () => {
    for (const r of ['', 'no es JSON', '{"red": ', '[]', '"192.168.1.0/24"', 'null', '42']) expect(leerDatos(subred, r), r).toBeNull();
  });

  it('todos los campos vacíos dan null', () => {
    expect(leerDatos(subred, JSON.stringify({ red: '', pide: 'c', cuanto: '  ' }))).toBeNull();
    expect(leerDatos(subred, '{}')).toBeNull();
    expect(leerDatos(bastones, JSON.stringify({ modelo: 'poisson', n: null, pi: 'mucho', lam: Infinity }))).toBeNull();
    expect(leerDatos(calculo('matriz'), JSON.stringify({ accion: 'det', matriz: '\u0000\u0007 ' }))).toBeNull();
  });

  it('una opción que no está va a la primera', () => {
    const r = leerDatos(subred, JSON.stringify({ red: '10.0.0.0/8', pide: 'todo', cuanto: '4' }));
    expect(r.datos.pide).toBe('c');
    expect(r.filas).toContainEqual(['Te piden', 'Subredes']);
    expect(leerDatos(subred, JSON.stringify({ red: '10.0.0.0/8', pide: 3, cuanto: '4' })).datos.pide).toBe('c');
    // Nothing of the object's own prototype counts as an option.
    expect(leerDatos(subred, JSON.stringify({ red: '10.0.0.0/8', pide: 'toString', cuanto: '4' })).datos.pide).toBe('c');
  });

  it('un número fuera de rango no es del ejercicio: la calculadora deja el suyo', () => {
    const r = leerDatos(bastones, JSON.stringify({ modelo: 'binomial', n: 400, pi: -2, lam: 0.5 }));
    expect(r.datos).toEqual({ modelo: 'binomial', lam: 0.5 });
    expect(r.filas.map(([t]) => t)).not.toContain('π');
    expect(leerDatos(calculo('reemplazo-paginas'), JSON.stringify({ cadena: '1 2 3', marcos: 99, alg: 'lru' })).datos.marcos).toBeUndefined();
    // A number that isn't one is left out: the calculator keeps its own.
    expect(leerDatos(bastones, JSON.stringify({ modelo: 'poisson', n: '7', pi: 0.5, lam: 2 })).datos).toEqual({ modelo: 'poisson', pi: 0.5, lam: 2 });
  });

  it('saca los caracteres de control y deja los renglones', () => {
    const r = leerDatos(calculo('claves'), JSON.stringify({ relacion: 'R(a,\u0000 b\u001b, c)\u007f', df: 'a -> b\r\nb\t-> c', conjunto: 'a' }));
    expect(r.datos.relacion).toBe('R(a, b, c)');
    expect(r.datos.df).toBe('a -> b\nb -> c');
    expect(r.filas[0]).toEqual(['Relación', 'R(a, b, c)']);
  });

  it('corta un texto largo', () => {
    const r = leerDatos(calculo('medidas'), JSON.stringify({ lista: '1 '.repeat(2000), valores: '', frecuencias: '' }));
    expect(r.datos.lista.length).toBeLessThanOrEqual(600);
  });

  it('las filas dicen lo que entendió, sin los vacíos', () => {
    const r = leerDatos(calculo('tiro-oblicuo'), JSON.stringify({ v0: '20', phi: '40', y0: '', g: '', t: '' }));
    expect(r.filas).toEqual([['v₀', '20'], ['φ', '40']]);
    expect(r.datos).toEqual({ v0: '20', phi: '40', y0: '', g: '9,8', t: '' });
  });

  it('arma lo que guarda cada calculadora', () => {
    const stocks = leerDatos(calculo('calculadora-vacia'), JSON.stringify({ modelo: 'escalon', D: '2.500', L: '12', i: '2,5 %', C1: '10', C2: '8', a: '600', LT: '' }));
    expect(stocks.datos).toEqual({ modelo: 'escalon', datos: { escalon: { D: '2500', L: '12', i: '0,025', C1: '10', C2: '8', a: '600', LT: '' } } });
    const tabla = leerDatos(calculo('tabla-discreta'), JSON.stringify({ valores: '1, 2, 3', probabilidades: '0,2, 0,5, 0,3' }));
    expect(tabla.datos.filas).toEqual([{ x: '1', p: '0,2' }, { x: '2', p: '0,5' }, { x: '3', p: '0,3' }]);
    const red = leerDatos(calculo('subred'), JSON.stringify({ red: '10.0.0.0/8', pide: 'h', cuanto: '1.000' }));
    expect(red.datos).toEqual({ red: '10.0.0.0/8', pide: 'h', cuanto: '1000' });
  });
});

describe('esquemaDe', () => {
  it('cada calculadora con campos da un objeto cerrado, con todo obligatorio', () => {
    for (const c of CALCULOS) {
      const e = esquemaDe(c);
      expect(e.type).toBe('object');
      expect(e.additionalProperties).toBe(false);
      expect(Object.keys(e.properties)).toEqual(Object.keys(c.campos));
      expect(e.required).toEqual(Object.keys(c.campos));
      for (const [clave, campo] of Object.entries(c.campos)) {
        const p = e.properties[clave];
        if (campo.opciones) expect(p).toEqual({ type: 'string', enum: Object.keys(campo.opciones) });
        else if (campo.numero) expect(p).toEqual({ type: 'number' });
        else expect(p).toEqual({ type: 'string' });
      }
    }
  });

  it('las opciones salen en texto y los números como número', () => {
    expect(esquemaDe(calculo('dicotomica')).properties.base).toEqual({ type: 'string', enum: ['0', '1'] });
    expect(esquemaDe(calculo('bastones')).properties.n).toEqual({ type: 'number' });
    expect(esquemaDe(calculo('inventario'))).toEqual({ type: 'object', properties: {}, required: [], additionalProperties: false });
  });
});

describe('las formas', () => {
  it('cada una es de una calculadora de la lista y deja sus datos donde la calculadora los lee', () => {
    const slugs = new Set(CALCULADORAS.map((c) => c.slug));
    for (const c of CALCULOS) {
      expect(slugs.has(c.slug)).toBe(true);
      expect(c.clave).toBe(c.slug === 'matriz' ? 'matrices' : `calc:${c.slug}`);
    }
    expect(CALCULOS).toHaveLength(CALCULADORAS.length);
  });

  it('cada campo tiene título y, si no es una opción, cómo va', () => {
    for (const c of CALCULOS) {
      for (const [clave, campo] of Object.entries(c.campos)) {
        expect(campo.titulo, `${c.slug}.${clave}`).toBeTruthy();
        if (!campo.opciones) expect(campo.describe, `${c.slug}.${clave}`).toMatch(/\.$/);
      }
    }
  });

  it('el pedido lleva los campos y el ejercicio', () => {
    const [sistema, usuario] = pedidoDeDatos(calculo('subred'), 'Calculá las subredes de 10.0.0.0/8 para 4 sedes');
    expect(sistema.role).toBe('system');
    expect(sistema.content).toContain('No hagas ninguna cuenta.');
    expect(usuario.content).toContain('Calculadora: Subredes.');
    expect(usuario.content).toContain('- pide: Te piden. una de c (Subredes), h (Hosts por subred), n (Bits de subred)');
    expect(usuario.content).toMatch(/Ejercicio: Calculá las subredes de 10\.0\.0\.0\/8 para 4 sedes$/);
  });

  it('lee el JSON aunque el modelo escriba lo que piensa antes', () => {
    const leido = leerDatos(calculo('subred'), '<think>\n\n</think>\n\n{\n  "red": "192.168.1.0/24",\n  "pide": "c",\n  "cuanto": "4"\n}');
    expect(leido?.datos).toBeTruthy();
    expect(leido.filas.map(([t]) => t)).toContain('Red');
  });

  it('un pedazo de la sintaxis del JSON no es un valor', () => {
    const leido = leerDatos(calculo('subred'), '{"red": "192.168.1.0/24", "pide": "c", "cuanto": "}: 256,"}');
    expect(leido.filas.map(([t]) => t)).not.toContain('Cuántos');
  });
});

describe('la calculadora para la que se pide un ejercicio', () => {
  const matrices = '/calculadoras/matriz';

  it('la de la pantalla, con «esta» o sin nombrar ninguna', () => {
    for (const p of ['Inventate un ejercicio para esta calculadora', 'inventá un ejercicio', 'Dame otro ejemplo', 'poneme un problema para practicar', 'dame un ejemplo para probar acá'])
      expect(calculoDelEjercicio(p, matrices)?.slug).toBe('matriz');
  });

  it('la que nombra la pregunta, también desde otra pantalla', () => {
    expect(calculoDelEjercicio('Armame un ejercicio de subredes', matrices)?.slug).toBe('subred');
    expect(calculoDelEjercicio('dame un ejemplo de matrices', '/consultron')?.slug).toBe('matriz');
    expect(calculoDelEjercicio('Inventate un ejercicio de subredes para esta calculadora', matrices)?.slug).toBe('matriz');
  });

  it('sin calculadora a la vista ni nombrada, ninguna', () => {
    for (const p of ['poneme un problema para practicar', 'Inventate un ejercicio', 'dame otro ejemplo']) expect(calculoDelEjercicio(p, '/consultron')).toBeNull();
  });

  it('resolver uno, preguntar por el tema o pedir código, no', () => {
    for (const p of ['Resolvé este ejercicio: det de 2 4; 1 3', '¿Qué es un determinante?', 'No entiendo el ejercicio 3', '¿Cómo uso esta calculadora?', 'dame un ejemplo de un programa en Python', '', null])
      expect(calculoDelEjercicio(p, matrices)).toBeNull();
  });

  it('la calculadora de una pantalla, si Consultron la conoce', () => {
    expect(calculoDeLaPagina(matrices)?.slug).toBe('matriz');
    for (const p of ['/calculadoras', '/calculadoras/no-existe', '/laboratorio', '', null]) expect(calculoDeLaPagina(p)).toBeNull();
  });
});
