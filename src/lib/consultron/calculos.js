// Consultron and the calculators: which one a question asks for, and the data of the exercise for it. The model fills
// a fixed form (a JSON schema, so it can't name a calculator or a field that doesn't exist) and the calculator does the
// math: Consultron never does it. The data goes to the calculator in memory (memoria.js, `dejarDatos`), never in the
// address. Each field is written as the calculator's own field takes it.
import { CALCULADORAS } from '../calculadoras/lista.js';
import { MAX as MAX_MATRIZ } from '../calculadoras/matrices.js';
import { MAX_PROCESOS } from '../calculadoras/planificacion.js';
import { MAX_MARCOS } from '../calculadoras/reemplazo.js';
import { palabras, plegar } from './fragmentos.js';

const texto = (titulo, describe) => ({ titulo, describe });
const opciones = (titulo, valores) => ({ titulo, opciones: valores });
const numero = (titulo, describe, min, max) => ({ titulo, describe, numero: [min, max] });

const DISCRETA = { igual: 'Que valga k', hasta: 'Que valga k o menos', desde: 'Que valga k o más' };
const CONTINUA = { menor: 'Menor que x', mayor: 'Mayor que x', entre: 'Entre x y x₂', percentil: 'El percentil p' };
const DE_MODELO = {
  binomial: ['n', 'pi', 'que', 'k'],
  hipergeometrica: ['N', 'r', 'm', 'que', 'k'],
  poisson: ['lam', 'que', 'k'],
  normal: ['mu', 'sig', 'que', 'x', 'x2', 'p'],
  exponencial: ['lam', 'que', 'x', 'x2', 'p'],
  uniforme: ['a', 'b', 'que', 'x', 'x2', 'p'],
  student: ['g', 'que', 'x', 'x2', 'p'],
  chi: ['g', 'que', 'x', 'x2', 'p'],
};
const STOCK = {
  basico: ['D', 'L', 'C', 'i', 'LT', 'Tc'],
  ingreso: ['D', 'V', 'L', 'C', 'i', 'LT', 'Tc'],
  escalon: ['D', 'L', 'i', 'C1', 'C2', 'a', 'LT'],
  excedente: ['D', 'L', 'i', 'C1', 'C2', 'a', 'LT'],
  periodo: ['C', 'L', 'S', 'Tc'],
  financiera: ['i', 'I0'],
  seguridad: ['media', 'desvio', 'LT', 'z'],
};
const solo = (d, claves) => Object.fromEntries(claves.map((k) => [k, d[k] ?? '']));

/** The pieces of a list as the calculators read them: spaces and semicolons split, and a comma when it isn't a decimal
 * one («2, 4» and «1,2,3» are lists, «2,5» is a number). */
const lista = (t) =>
  String(t ?? '')
    .split(/[\s;]+/)
    .flatMap((p) => {
      const x = p.replace(/^,+|,+$/g, '');
      const comas = (x.match(/,/g) ?? []).length;
      return comas > 1 || (comas && /[./]/.test(x)) ? x.split(',') : [x];
    })
    .filter(Boolean);
/** The rows of a table written in one text: one per line or between semicolons, each a list. */
const renglones = (t) => String(t ?? '').split(/\n|;/).map(lista).filter((f) => f.length);
/** «1.500» is 1500: the exercise writes the thousands with a dot and the calculators take them without it. */
const sinMiles = (t) => String(t ?? '').replace(/\b([1-9]\d{0,2})((?:\.\d{3})+)(?![\d.])/g, (_, a, b) => a + b.replaceAll('.', ''));
/** «2,5 %» is 0,025: a rate or a probability as the calculators take it. */
function sinPorciento(t) {
  const m = /^\s*([+-]?\d+(?:[.,]\d+)?)\s*%\s*$/.exec(String(t ?? ''));
  return m ? String(Number((Number(m[1].replace(',', '.')) / 100).toPrecision(12))).replace('.', ',') : String(t ?? '');
}
/** A sample, one by one or as a frequency table (_est-datos.jsx). */
function muestra({ lista: l, valores, frecuencias }) {
  const xs = lista(valores);
  const ns = lista(frecuencias);
  if (xs.length && ns.length) return { forma: 'tabla', lista: '', filas: xs.map((x, i) => ({ x, n: ns[i] ?? '' })) };
  return { forma: 'sueltos', lista: l, filas: [{ x: '', n: '' }] };
}
/** A formula without the name in front: «f(x) = x^2» is x^2. `nombres`: the names it may have, as a pattern. */
const sinNombre = (t, nombres) => String(t ?? '').replace(new RegExp(`^\\s*(${nombres})\\s*=\\s*`, 'i'), '');
const numeroDe = (v) => {
  const t = String(v ?? '').trim().replace(',', '.');
  return t && Number.isFinite(Number(t)) ? Number(t) : null;
};
const comoCampo = (n) => String(Number(n.toPrecision(6))).replace('.', ',');
/** The two sides of a window as the graphers take them: ±`lado`, opened to hold each of `valores` with `margen`. */
function ventana(lado, margen, valores) {
  const ns = valores.map(numeroDe).filter((n) => n !== null);
  return [Math.min(-lado, ...ns.map((n) => n - margen)), Math.max(lado, ...ns.map((n) => n + margen))].map(comoCampo);
}
const DATOS_SUELTOS = texto('Datos', 'Los datos sueltos separados con espacios. Vacío si vienen en una tabla de frecuencias.');
const DATOS_VALORES = texto('Valores', 'Si vienen en una tabla de frecuencias, sus valores separados con espacios.');
const DATOS_FRECUENCIAS = texto('Frecuencias', 'La frecuencia absoluta de cada valor, en el mismo orden.');

/** Each calculator Consultron knows: the words that call it and its form. `campos` is empty for the ones it only opens,
 * whose data doesn't fit in a question. `armar` turns the form into what the calculator keeps. `clave`: where the
 * calculator keeps it, when it isn't `calc:<slug>`. */
const FORMAS = {
  matriz: {
    clave: 'matrices',
    palabras: 'matriz matrices determinante inversa rango escalonada gauss jordan',
    campos: {
      accion: opciones('Qué calcular', { det: 'Determinante', inversa: 'Inversa', rango: 'Rango', escalonada: 'Escalonada' }),
      matriz: texto('Matriz', 'Las filas separadas con punto y coma, los números con espacios, como 2 4 6; 4 0 6; 3 0 -2.'),
    },
    armar: ({ accion, matriz }) => {
      const filas = renglones(matriz).slice(0, MAX_MATRIZ);
      const columnas = Math.min(MAX_MATRIZ, Math.max(...filas.map((f) => f.length)));
      // Outside the matrix, the calculator's own identity; a cell missing inside stays empty, so it says which.
      const valores = Array.from({ length: MAX_MATRIZ }, (_, i) =>
        Array.from({ length: MAX_MATRIZ }, (_u, j) => (i < filas.length && j < columnas ? (filas[i][j] ?? '') : String(i === j ? 1 : 0))),
      );
      return { accion, filas: filas.length, columnas, valores };
    },
  },
  dicotomica: {
    palabras: 'dicotomica binaria busqueda buscar arreglo vector ordenado',
    campos: {
      arreglo: texto('Arreglo', 'Los elementos de menor a mayor, separados con comas. Si tienen decimales, con punto y coma.'),
      dato: texto('Dato', 'El elemento que se busca.'),
      base: opciones('Primera posición', { 0: '0', 1: '1' }),
    },
  },
  campo: {
    palabras: 'campo vectorial divergencia rotor rotacional conservativo potencial',
    campos: {
      P: texto('P', 'La componente en x, como -y.'),
      Q: texto('Q', 'La componente en y, como x.'),
      R: texto('R', 'La componente en z. Vacía en el plano.'),
      punto: texto('Punto', 'Donde se miden la divergencia y el rotor, como 1; 1.'),
      A: texto('A', 'Si piden el trabajo, el punto de partida, como 0; 1.'),
      B: texto('B', 'Si piden el trabajo, el punto de llegada.'),
    },
    armar: (d) => ({ ...d, punto: d.punto || (d.R ? '1; 1; 1' : '1; 1') }),
  },
  raices: {
    palabras: 'raiz raices biseccion falsa posicion newton raphson secante cero',
    campos: {
      metodo: opciones('Método', { biseccion: 'Bisección', falsa: 'Falsa posición', newton: 'Newton-Raphson', secante: 'Secante' }),
      f: texto('f(x)', 'La función, como x^3 - 2x - 5.'),
      a: texto('xₗ', 'El extremo izquierdo del intervalo, o x₋₁ en la secante.'),
      b: texto('xᵤ', 'El extremo derecho del intervalo, o x₀ en la secante.'),
      x0: texto('x₀', 'El valor inicial de Newton-Raphson.'),
      max: texto('Iteraciones', 'Cuántas iteraciones.'),
      es: texto('εs', 'La tolerancia en %, sin el signo.'),
      verdadero: texto('xᵥ', 'El valor verdadero de la raíz, si lo dan.'),
    },
    armar: (d) => ({ ...d, max: d.max || (d.es ? '50' : '5') }),
  },
  'punto-fijo': {
    palabras: 'punto fijo iteracion iterativo despeje',
    campos: {
      g: texto('g(x)', 'La función de x = g(x), como e^(-x).'),
      x0: texto('x₀', 'El valor inicial.'),
      max: texto('Iteraciones', 'Cuántas iteraciones.'),
      es: texto('εs', 'La tolerancia en %, sin el signo.'),
      verdadero: texto('xᵥ', 'El valor verdadero, si lo dan.'),
    },
    armar: (d) => ({ ...d, max: d.max || (d.es ? '50' : '10') }),
  },
  pvi: {
    palabras: 'valor inicial euler heun runge kutta rk4 ecuacion diferencial edo',
    campos: {
      metodo: opciones('Método', { euler: 'Euler', heun: 'Heun', medio: 'Punto medio', rk4: 'RK de cuarto orden' }),
      f: texto('f(x, y)', 'La derivada dy/dx, como -2x^3 + 12x^2 - 20x + 8,5.'),
      x0: texto('x₀', 'El x inicial.'),
      y0: texto('y(x₀)', 'El y inicial.'),
      h: texto('h', 'El paso.'),
      xf: texto('Hasta x', 'El x final.'),
      exacta: texto('y(x)', 'La solución exacta, si la dan.'),
    },
  },
  claves: {
    palabras: 'clave claves candidata candidatas cierre atributo atributos superclave',
    campos: {
      relacion: texto('Relación', 'Como R(a, b, c).'),
      df: texto('Dependencias', 'Una por renglón, como a, b -> c.'),
      conjunto: texto('Conjunto', 'Los atributos para su cierre, como a, b.'),
    },
  },
  normalizacion: {
    palabras: 'normalizacion normaliza normalizar normal forma 1fn 2fn 3fn fnbc dependencia dependencias funcional funcionales',
    campos: {
      relacion: texto('Relación', 'Como R(a, b, c).'),
      df: texto('Dependencias', 'Una por renglón, como a, b -> c.'),
    },
  },
  'tiro-oblicuo': {
    palabras: 'tiro oblicuo horizontal proyectil trayectoria alcance parabolico lanzamiento lanza',
    campos: {
      v0: texto('v₀', 'La velocidad inicial en m/s.'),
      phi: texto('φ', 'El ángulo sobre la horizontal, en grados. Negativo si va para abajo.'),
      y0: texto('y₀', 'La altura de salida en m.'),
      g: texto('g', 'La gravedad en m/s², como 9,8.'),
      t: texto('t', 'Un instante en s, si lo piden.'),
    },
    armar: (d) => ({ ...d, g: d.g || '9,8' }),
  },
  'campo-cargas': {
    palabras: 'carga cargas puntual puntuales coulomb electrico',
    campos: {
      unidad: opciones('Unidad', { micro: 'µC', nano: 'nC', C: 'C' }),
      q1: texto('q₁', 'La primera carga, en la unidad elegida.'),
      p1: texto('Lugar de q₁', 'Como x; y en metros.'),
      q2: texto('q₂', 'La segunda carga.'),
      p2: texto('Lugar de q₂', 'Como x; y en metros.'),
      q3: texto('q₃', 'La tercera carga, si hay.'),
      p3: texto('Lugar de q₃', 'Como x; y en metros.'),
      P: texto('Punto', 'Donde se mide el campo, como x; y en metros.'),
      q0: texto('q₀', 'Una carga en P, en coulombs, si piden la fuerza sobre ella.'),
    },
  },
  'tabla-verdad': {
    palabras: 'tabla verdad tautologia contradiccion contingencia contingente proposicion proposicional',
    campos: {
      formula: texto('Fórmula', 'Con variables de una letra y no, y, o, -> y <->, como (p -> q) y p -> q.'),
    },
    armar: ({ formula }) => ({ notacion: 'logica', formula }),
  },
  'calculadora-vacia': {
    palabras: 'stock stocks lote optimo inventario reposicion wilson mantenimiento demanda seguridad eoq',
    campos: {
      modelo: opciones('Modelo', { basico: 'Básico', ingreso: 'Consumo durante el ingreso', escalon: 'Un escalón', excedente: 'Cantidad excedente', periodo: 'Período común', financiera: 'Restricción financiera', seguridad: 'Stock de seguridad' }),
      D: texto('D', 'La demanda.'),
      V: texto('V', 'La velocidad de ingreso.'),
      L: texto('L', 'El costo fijo de la orden. En período común, la suma de los L.'),
      C: texto('C', 'El costo unitario. En período común, la suma de C·D.'),
      i: texto('i', 'La tasa de mantenimiento, como 0,025.'),
      LT: texto('LT', 'El plazo de provisión.'),
      Tc: texto('Tc', 'El período corregido.'),
      C1: texto('C₁', 'El precio sin descuento.'),
      C2: texto('C₂', 'El precio con descuento.'),
      a: texto('a', 'La cantidad desde la que hay descuento.'),
      S: texto('S', 'En período común, la suma de δ·D.'),
      I0: texto('I₀', 'El tope de inversión.'),
      articulos: texto('Artículos', 'Con restricción financiera, uno por renglón con D, L y C, como 600 300 160.'),
      media: texto('D̄', 'La demanda media por período.'),
      desvio: texto('S_D', 'El desvío por período.'),
      z: texto('z', 'El factor de seguridad.'),
    },
    armar: (d) => {
      const datos = Object.fromEntries(Object.entries(solo(d, STOCK[d.modelo])).map(([k, v]) => [k, sinMiles(k === 'i' ? sinPorciento(v) : v)]));
      if (d.modelo === 'financiera') {
        const filas = renglones(sinMiles(d.articulos)).slice(0, 8);
        datos.articulos = filas.length ? filas.map(([D = '', L = '', C = '']) => ({ D, L, C })) : [{ D: '', L: '', C: '' }];
        datos.pruebas = '';
      }
      return { modelo: d.modelo, datos: { [d.modelo]: datos } };
    },
  },
  relacion: {
    palabras: 'relacion relaciones reflexiva simetrica antisimetrica transitiva digrafo equivalencia par pares',
    campos: {
      conjunto: texto('Conjunto', 'Los elementos, como {1, 2, 3, 4}.'),
      pares: texto('Pares', 'Como {(1,1), (1,2)}.'),
    },
  },
  recorrido: {
    palabras: 'recorrido recorridos recorrer arbol binario preorden inorden entreorden postorden polaca prefija postfija infija',
    campos: {
      forma: opciones('El árbol', { expresion: 'De una expresión', anidado: 'Escrito como A(B, C)' }),
      arbol: texto('Árbol', 'La expresión, como (a - b) * c, o el árbol como A(B, C).'),
      orden: opciones('Recorrido', { preorden: 'Preorden', entreorden: 'Entreorden', postorden: 'Postorden' }),
    },
  },
  probabilidades: {
    palabras: 'probabilidad binomial hipergeometrica poisson normal exponencial uniforme student chi distribucion percentil media desvio',
    campos: {
      modelo: opciones('Distribución', { binomial: 'Binomial', hipergeometrica: 'Hipergeométrica', poisson: 'Poisson', normal: 'Normal', exponencial: 'Exponencial', uniforme: 'Uniforme', student: 't de Student', chi: 'Chi cuadrado' }),
      que: opciones('Qué piden', { ...DISCRETA, ...CONTINUA }),
      n: texto('n', 'Los ensayos de la binomial.'),
      pi: texto('π', 'La probabilidad de éxito de la binomial, como 0,3.'),
      N: texto('N', 'El total de la hipergeométrica.'),
      r: texto('r', 'Los éxitos del total en la hipergeométrica.'),
      m: texto('m', 'La muestra de la hipergeométrica.'),
      lam: texto('λ', 'El parámetro de Poisson o de la exponencial.'),
      mu: texto('μ', 'La media de la normal.'),
      sig: texto('σ', 'El desvío de la normal.'),
      a: texto('a', 'El mínimo de la uniforme.'),
      b: texto('b', 'El máximo de la uniforme.'),
      g: texto('Grados de libertad', 'De la t o la chi cuadrado.'),
      k: texto('k', 'El valor de una discreta.'),
      x: texto('x', 'El valor de una continua.'),
      x2: texto('x₂', 'El otro extremo, si piden entre dos valores.'),
      p: texto('p', 'La probabilidad del percentil, como 0,9.'),
    },
    armar: (d) => {
      const discreta = ['binomial', 'hipergeometrica', 'poisson'].includes(d.modelo);
      const que = (discreta ? DISCRETA : CONTINUA)[d.que] ? d.que : discreta ? 'igual' : 'menor';
      const datos = { ...solo(d, DE_MODELO[d.modelo]), que };
      for (const k of ['pi', 'p']) if (k in datos) datos[k] = sinPorciento(datos[k]);
      return { modelo: d.modelo, datos: { [d.modelo]: datos } };
    },
  },
  medidas: {
    palabras: 'media mediana moda varianza desvio estandar coeficiente variacion muestra muestral frecuencia frecuencias',
    campos: { lista: DATOS_SUELTOS, valores: DATOS_VALORES, frecuencias: DATOS_FRECUENCIAS },
    armar: muestra,
  },
  'tabla-discreta': {
    palabras: 'variable aleatoria discreta esperanza varianza',
    campos: {
      valores: texto('Valores', 'Los valores de X separados con espacios.'),
      probabilidades: texto('Probabilidades', 'La probabilidad de cada valor, en el mismo orden, separadas con espacios.'),
    },
    armar: ({ valores, probabilidades }) => {
      const xs = lista(valores);
      const ps = lista(probabilidades);
      return { filas: xs.map((x, i) => ({ x, p: ps[i] ?? '' })) };
    },
  },
  bastones: {
    palabras: 'bastones baston grafico graficar binomial poisson',
    campos: {
      modelo: opciones('Modelo', { binomial: 'Binomial', poisson: 'Poisson' }),
      n: numero('n', 'Los ensayos de la binomial, de 1 a 50.', 1, 50),
      pi: numero('π', 'La probabilidad de éxito, de 0,01 a 0,99.', 0.01, 0.99),
      lam: numero('λ', 'El promedio de Poisson, de 0,1 a 15.', 0.1, 15),
    },
    // The sliders go by ones, hundredths and tenths.
    armar: ({ modelo, n, pi, lam }) => ({
      modelo,
      ...(n === undefined ? {} : { n: Math.round(n) }),
      ...(pi === undefined ? {} : { pi: Math.min(0.99, Math.max(0.01, Math.round(pi * 100) / 100)) }),
      ...(lam === undefined ? {} : { lam: Math.min(15, Math.max(0.1, Math.round(lam * 10) / 10)) }),
    }),
  },
  caja: {
    palabras: 'caja bigote bigotes boxplot cuartil cuartiles atipico atipicos',
    campos: { lista: DATOS_SUELTOS, valores: DATOS_VALORES, frecuencias: DATOS_FRECUENCIAS },
    armar: (d) => ({ ...muestra(d), bigotes: 'extremos' }),
  },
  subred: {
    palabras: 'subred subredes subnetting mascara cidr prefijo host hosts',
    campos: {
      red: texto('Red', 'Con su prefijo o su máscara, como 192.168.1.0/24.'),
      pide: opciones('Te piden', { c: 'Subredes', h: 'Hosts por subred', n: 'Bits de subred' }),
      cuanto: texto('Cuántos', 'El número que piden, sin punto de miles.'),
    },
    armar: (d) => ({ ...d, cuanto: sinMiles(d.cuanto) }),
  },
  'ventana-tcp': {
    palabras: 'ventana congestion tcp tahoe reno umbral ssthresh slow start',
    campos: {
      umbral: texto('Umbral', 'El umbral inicial.'),
      inicial: texto('Ventana inicial', 'La ventana con la que arranca.'),
      rondas: texto('Rondas', 'Cuántas rondas.'),
      perdidas: texto('Pérdidas', 'Las rondas con pérdida, separadas con comas.'),
      ver: opciones('Ver', { ambas: 'Tahoe y Reno', tahoe: 'Tahoe', reno: 'Reno' }),
    },
    armar: (d) => {
      const ultima = Math.max(0, ...lista(d.perdidas).map(Number).filter(Number.isFinite));
      return { ...d, inicial: d.inicial || '1', rondas: d.rondas || String(Math.min(60, Math.max(24, ultima + 8))) };
    },
  },
  'proximo-evento': {
    palabras: 'cola mm1 proximo evento arribo arribos servicio demora demoras simulacion escritorio',
    campos: {
      A: texto('A', 'Los tiempos entre arribos separados con espacios.'),
      S: texto('S', 'Los tiempos de servicio separados con espacios.'),
      n: texto('n', 'Las demoras que cierran la corrida.'),
    },
    armar: (d) => ({ ...d, n: d.n || String(Math.min(lista(d.A).length, lista(d.S).length) || '') }),
  },
  inventario: { palabras: 'inventario s,s politica faltante costo mes simulacion', campos: {} },
  thompson: {
    palabras: 'expresion regular regulares thompson afn afd automata',
    campos: {
      er: texto('Expresión regular', 'Con | . * + ? y paréntesis, como (a|b)*abb.'),
      cadena: texto('Cadena', 'Una cadena para probar, como aabb.'),
    },
  },
  gramatica: {
    palabras: 'gramatica gramaticas chomsky produccion producciones derivacion derivar terminal',
    campos: {
      producciones: texto('Producciones', 'Una por renglón, como S -> aS | b.'),
      palabra: texto('Palabra', 'La palabra para derivar.'),
      lado: opciones('Derivación', { izquierda: 'Por la izquierda', derecha: 'Por la derecha' }),
    },
  },
  planificacion: {
    palabras: 'planificacion planificar cpu fcfs sjf srtn round robin quantum prioridad gantt rafaga rafagas proceso procesos',
    campos: {
      alg: opciones('Algoritmo', { fcfs: 'FCFS', sjf: 'SJF', srtn: 'SRTN', rr: 'Round Robin', prio: 'Prioridad no apropiativa', prioa: 'Prioridad apropiativa' }),
      quantum: texto('Quantum', 'El quantum de Round Robin.'),
      alta: opciones('La prioridad más alta', { chico: 'El número más chico', grande: 'El más grande' }),
      procesos: texto('Procesos', 'Uno por renglón, con nombre, llegada, ráfaga y prioridad, como P1 0 24 1.'),
    },
    armar: ({ alg, quantum, alta, procesos }) => {
      const datos = renglones(procesos)
        .filter((f) => f.length >= 2)
        .slice(0, MAX_PROCESOS)
        .map(([nombre, llegada = '0', rafaga = '1', prioridad = '1']) => ({ nombre, llegada, rafaga, prioridad }));
      const todas = Array.from({ length: MAX_PROCESOS }, (_, i) => ({ nombre: `P${i + 1}`, llegada: '0', rafaga: '1', prioridad: '1', ...datos[i] }));
      return { alg, quantum: quantum || '4', alta, ...(datos.length ? { cantidad: datos.length, filas: todas } : {}) };
    },
  },
  'reemplazo-paginas': {
    palabras: 'reemplazo pagina paginas marco marcos fifo lru optimo reloj fallo fallos referencia referencias',
    campos: {
      cadena: texto('Referencias', 'Las páginas separadas con espacios.'),
      marcos: numero('Marcos', `Cuántos marcos, de 1 a ${MAX_MARCOS}.`, 1, MAX_MARCOS),
      alg: opciones('Algoritmo', { fifo: 'FIFO', lru: 'LRU', opt: 'Óptimo', seg: 'Segunda oportunidad', reloj: 'Reloj' }),
    },
    armar: ({ marcos, ...d }) => ({ ...d, ...(marcos === undefined ? {} : { marcos: Math.round(marcos) }) }),
  },
  banquero: { palabras: 'interbloqueo interbloqueos deadlock banquero recurso recursos', campos: {} },
  'lgr-raices': {
    palabras: 'lugar geometrico raices lgr polo polos asintota asintotas lazo',
    campos: {
      N: texto('Numerador', 'El numerador de G(s)H(s) sin la k, como 1.'),
      D: texto('Denominador', 'El denominador, como s^3 + 4s^2 + 8s o s(s + 2).'),
      k: texto('k', 'Una ganancia para marcar, si dan una.'),
    },
    armar: (d) => ({ ...d, N: d.N || '1' }),
  },
  // Only words of the math itself: «nivel», «parcial», «estudio» or «función» are in too many other questions.
  graficadora: {
    palabras: 'grafica graficar grafico graficame asintota concavidad inflexion recta tangente parabola circunferencia elipse hiperbola homografica',
    campos: {
      f: texto('f(x)', 'La función, como x^2 - 4. Una ecuación con x e y va entera, como x^2 + y^2 = 9.'),
      g: texto('g(x)', 'La otra función, si el área es entre dos.'),
      tangente: texto('Tangente en x₀', 'Si piden la recta tangente, el x del punto.'),
      a: texto('Área desde', 'Si piden un área, desde qué x.'),
      b: texto('Área hasta', 'Si piden un área, hasta qué x.'),
    },
    armar: ({ f, g, tangente, a, b }) => {
      const suelta = sinNombre(f, 'y|f\\s*\\(\\s*x\\s*\\)');
      const trazos = [suelta.includes('=') ? { id: 1, tipo: 'ecuacion', e: f } : { id: 1, tipo: 'funcion', f: suelta }];
      if (g) trazos.push({ id: 2, tipo: 'funcion', f: sinNombre(g, 'y|g\\s*\\(\\s*x\\s*\\)') });
      const [x0, x1] = ventana(5, 2, [tangente, a, b]);
      return { trazos, x0, x1, y0: '', y1: '', tangente, areaA: a, areaB: b };
    },
  },
  'graficadora-3d': {
    palabras: 'grafica graficar grafico graficame superficie cuadrica paraboloide elipsoide hiperboloide cono esfera semiesfera silla plano tangente gradiente hessiano',
    campos: {
      f: texto('f(x, y)', 'La función de dos variables, como x^2 - y^2. Una ecuación con x, y, z va entera, como x^2 + y^2 + z^2 = 9.'),
      punto: texto('P', 'Si piden el plano tangente, el gradiente o clasificar un punto, su x y su y, como 1; -1.'),
      niveles: texto('k', 'Si piden curvas de nivel, los valores de k, como 0; 1; 2.'),
    },
    armar: ({ f, punto, niveles }) => {
      const suelta = sinNombre(f, 'z|f\\s*\\(\\s*x\\s*[,;]\\s*y\\s*\\)');
      const ecuacion = suelta.includes('=');
      // «P(1, -1)» is 1; -1.
      const partes = lista(punto.replace(/^[^\d(+-]*/, '').replace(/[()]/g, ''));
      const P = partes.length === 1 && partes[0].includes(',') ? partes[0].split(',') : partes;
      // With a point, the box is around it: a tangent plane is seen from near.
      const lado = ecuacion ? 4 : 3;
      const lados = (v) => (numeroDe(v) === null ? [-lado, lado] : [numeroDe(v) - 1, numeroDe(v) + 1]).map(comoCampo);
      const [x0, x1] = lados(P[0]);
      const [y0, y1] = lados(P[1]);
      const trazos = [ecuacion ? { id: 1, tipo: 'ecuacion', e: f } : { id: 1, tipo: 'superficie', f: suelta }];
      return { trazos, x0, x1, y0, y1, z0: '', z1: '', punto: P.join('; '), niveles: lista(niveles).join('; ') };
    },
  },
};

/** The calculators Consultron knows, with their name and their words, already in the form of the search. `clave`:
 * where `dejarDatos` leaves their data. */
export const CALCULOS = CALCULADORAS.filter((c) => FORMAS[c.slug]).map((c) => {
  const { clave, ...forma } = FORMAS[c.slug];
  return { slug: c.slug, nombre: c.nombre, clave: clave ?? `calc:${c.slug}`, ...forma, claves: new Set(palabras(`${c.nombre} ${forma.palabras}`)) };
});

// Words of a question that asks for a calculation, and not what something is: the verbs, never the nouns
// («determinante», «gráfico», «simulación», «cálculo»).
const PIDE =
  /\b(calcul(a|ar|ame|alo|ala|en)|resolv(e|er|eme|elo|ela)|simul(a|ar|ame|alo)|halla(r|me)?|determin(a|ar|ame)|obten(e|er|eme)|aplic(a|ar|ame|ando)|encontr(a|ar|ame)|arm(a|ar|ame|alo)|grafic(a|ar|ame)|dibuj(a|ar|ame)|traz(a|ar|ame)|deriv(a|ar|ame)|busc(a|ar|ame)|constru(i|ir|ime)|planific(a|ar|ame)|normaliz(a|ar|ala|alo)|analiz(a|ar|ala|alo)|detect(a|ar|ame)|clasific(a|ar|ala|alo)|hac(eme|elo|ela)|cuanto da|cuanto vale|cuantas|cuantos)\b/;
// The ones that without the accent are something else («hace», «pasa», «usa»), only with it.
const PIDE_CON_TILDE = /(?<![\p{L}])(hacé|pasá|usá|escribí|llevá|probá|completá|recorré|convertí)(?![\p{L}])/u;
// What only an exercise writes: arrows, equals, braces, the operators of a formula.
const NOTACION = /->|→|⇒|⇔|↔|=|\||\^|\*|∧|∨|¬|∼|[{}]/;

/** The calculator a question is about, with how sure: { calculo, pide, puntos } or null. `pide`: the question asks to
 * solve an exercise (a number, or «calculá», «resolvé»…), not what something is. `puntos`: its words that call it.
 * `adjunto`: the text of what the student attached (adjuntar.js, `ejercicioDe`). Its words count to choose, but what
 * asks is the question («resolvé este ejercicio»), or the attachment when it comes alone. */
export function elegirCalculo(pregunta, adjunto = '') {
  const escrita = String(pregunta ?? '').trim();
  // A question about code is not an exercise: «un bucle de 5 iteraciones» called Punto fijo.
  if (DE_CODIGO.test(plegar(escrita))) return null;
  if (adjunto) {
    const eleccion = elegirCalculo(`${escrita}\n${adjunto}`);
    return eleccion && { ...eleccion, pide: escrita ? pideAlgo(escrita) : eleccion.pide };
  }
  const ps = new Set(palabras(pregunta));
  let mejor = null;
  let puntos = 0;
  for (const c of CALCULOS) {
    let n = 0;
    for (const p of ps) if (c.claves.has(p)) n += 1;
    if (n > puntos) {
      mejor = c;
      puntos = n;
    }
  }
  if (!mejor) return null;
  return { calculo: mejor, pide: pideAlgo(pregunta), puntos };
}

// Words of a question about programming, which no calculator solves.
const DE_CODIGO = /\b(codigos?|programas?|scripts?|bucles?|python|pseudocodigo)\b/;

// «Inventate un ejercicio», «dame otro ejemplo», «poneme un problema para esta calculadora»: a verb of asking, then
// «un» or «otro», then the thing. «Resolvé este ejercicio» brings its own.
const PIDE_EJERCICIO =
  /\b(invent(a|ar|ame|ate|en)|dame|deme|arm(a|ar|ame|ate)|gener(a|ar|ame|ate)|cre(a|ar|ame|ate)|pon(e|er|eme|ete)|propon(e|er|eme)|tir(a|ar|ame|ate)|pasame|hac(e|er|eme|ete)|haz(me)?|quiero|necesito|suger(i|ir|ime)|mostrame|escrib(i|ir|ime|ite))\b[^.?!]*\b(un|una|otro|otra|algun|alguna)\s+(ejercicio|ejemplo|problema|caso)\b/;
// The thing asked for: its words don't name a calculator («problema» is in «Problema de valor inicial»).
const COSA_PEDIDA = /\b(ejercicios?|ejemplos?|problemas?|casos?)\b/g;

/** The calculator of a screen («/calculadoras/matriz»), if Consultron knows it. */
export function calculoDeLaPagina(pagina) {
  const slug = /^\/calculadoras\/([^/?#]+)/.exec(String(pagina ?? ''))?.[1];
  return (slug && CALCULOS.find((c) => c.slug === slug)) || null;
}

/** The calculator an exercise is asked for («inventate un ejercicio para esta calculadora», «dame un ejemplo de
 * matrices»): the one the question names, or the one of the screen (`pagina`) when it says «esta» or names none. Null
 * if the question asks for no exercise, or for one of code. */
export function calculoDelEjercicio(pregunta, pagina) {
  const plano = plegar(String(pregunta ?? ''));
  if (!PIDE_EJERCICIO.test(plano) || DE_CODIGO.test(plano)) return null;
  const deAca = calculoDeLaPagina(pagina);
  const nombrada = elegirCalculo(plano.replace(COSA_PEDIDA, ' '))?.calculo ?? null;
  return deAca && (!nombrada || /\b(esta|aca)\b/.test(plano)) ? deAca : nombrada;
}

// Whether a text asks to solve something: a number, a verb of doing, the notation of an exercise.
function pideAlgo(texto) {
  const plano = plegar(texto);
  return /\d/.test(plano) || PIDE.test(plano) || PIDE_CON_TILDE.test(String(texto).toLowerCase()) || NOTACION.test(texto);
}

/** The form the model fills: every field, the options of each choice. */
export function esquemaDe(calculo) {
  const properties = {};
  for (const [clave, campo] of Object.entries(calculo.campos)) {
    if (campo.opciones) properties[clave] = { type: 'string', enum: Object.keys(campo.opciones) };
    else if (campo.numero) properties[clave] = { type: 'number' };
    else properties[clave] = { type: 'string' };
  }
  return { type: 'object', properties, required: Object.keys(properties), additionalProperties: false };
}

const SISTEMA_DATOS = [
  'Sacás los datos de un ejercicio para una calculadora.',
  'Respondé solo con el JSON pedido.',
  'Copiá cada dato como lo da el ejercicio, con coma decimal y los miles sin punto.',
  'Si el ejercicio no da un dato, dejalo vacío.',
  'No hagas ninguna cuenta.',
].join(' ');

/** The messages that ask the model for the data of the exercise. */
export function pedidoDeDatos(calculo, pregunta) {
  const campos = Object.entries(calculo.campos).map(([clave, c]) => {
    const como = c.opciones ? `una de ${Object.entries(c.opciones).map(([v, t]) => `${v} (${t})`).join(', ')}` : c.describe;
    return `- ${clave}: ${c.titulo}. ${como}`;
  });
  return [
    { role: 'system', content: SISTEMA_DATOS },
    { role: 'user', content: `Calculadora: ${calculo.nombre}.\nCampos:\n${campos.join('\n')}\n\nEjercicio: ${pregunta}` },
  ];
}

// Control characters out of a text field: a tab is a space, a line break stays (dependencies and productions go one
// per line), the rest goes.
const limpiar = (t) => t.replace(/\t/g, ' ').replace(/(?!\n)\p{Cc}/gu, '').trim().slice(0, 600);

/** What the model answered, checked field by field: { datos, filas } or null if it brings nothing of the exercise.
 * `datos`: what the calculator keeps (only what changes), `filas`: [título, valor] to show. */
export function leerDatos(calculo, respuesta) {
  let crudo;
  try {
    // The model may write what it thinks (<think>) before the JSON.
    const texto = String(respuesta ?? '').replace(/<think>[\s\S]*?(<\/think>|$)/g, '');
    const desde = texto.indexOf('{');
    const hasta = texto.lastIndexOf('}');
    crudo = JSON.parse(desde >= 0 && hasta > desde ? texto.slice(desde, hasta + 1) : texto);
  } catch {
    return null;
  }
  if (!crudo || typeof crudo !== 'object' || Array.isArray(crudo)) return null;
  const limpio = {};
  const filas = [];
  let alguno = false;
  for (const [clave, campo] of Object.entries(calculo.campos)) {
    const v = crudo[clave];
    if (campo.opciones) {
      const valor = typeof v === 'string' && Object.hasOwn(campo.opciones, v) ? v : Object.keys(campo.opciones)[0];
      limpio[clave] = valor;
      filas.push([campo.titulo, campo.opciones[valor]]);
    } else if (campo.numero) {
      const [min, max] = campo.numero;
      // Out of range it isn't the exercise's: the calculator keeps its own.
      const n = typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null;
      if (n === null) continue;
      limpio[clave] = n;
      alguno = true;
      filas.push([campo.titulo, String(n).replace('.', ',')]);
    } else {
      // Bits of the JSON's own syntax («}: 256,», «,») aren't a value.
      const t = typeof v === 'string' && /[\p{L}\p{N}]/u.test(v) && !/^\s*[}:,]/.test(v) ? limpiar(v) : '';
      limpio[clave] = t;
      if (!t) continue;
      alguno = true;
      filas.push([campo.titulo, t]);
    }
  }
  if (!alguno) return null;
  return { datos: calculo.armar ? calculo.armar(limpio) : limpio, filas };
}
