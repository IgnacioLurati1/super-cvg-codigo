import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { dejarDatos, dejarEjemplo, tomarEjemplo } from '../calculadoras/memoria';
import { CALCULOS, leerDatos } from './calculos';
import { aplanar } from './ejemplos';

// Each calculator with the data Consultron leaves it: what the model would answer for an exam exercise, read by
// leerDatos and left with dejarDatos, opens with those values in its fields, its resolution and no field error.

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
  // Nor IntersectionObserver: the 3D grapher waits with it to be near the screen, and here it never starts its scene.
  globalThis.IntersectionObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  // jsdom has no ResizeObserver: the drawings measure their box with it.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const PANTALLAS = import.meta.glob('../../components/calculadoras/propias/[!_]*.jsx');
const calculo = (slug) => CALCULOS.find((c) => c.slug === slug);

let raiz;
let caja;
afterEach(() => {
  act(() => raiz?.unmount());
  caja?.remove();
  raiz = null;
});

async function abrir(slug, json) {
  const c = calculo(slug);
  const leido = leerDatos(c, JSON.stringify(json));
  expect(leido, `${slug}: leerDatos no trajo nada`).not.toBeNull();
  dejarDatos(c.clave, leido.datos);
  const { default: Pantalla } = await PANTALLAS[`../../components/calculadoras/propias/${slug}.jsx`]();
  caja = document.createElement('div');
  document.body.append(caja);
  raiz = createRoot(caja);
  await act(async () => raiz.render(<MemoryRouter><Pantalla /></MemoryRouter>));
  return leido;
}

const valores = () => [...caja.querySelectorAll('input:not([type=radio]), textarea')].map((e) => e.value);
const elegidas = () => [...caja.querySelectorAll('input[type=radio]:checked')].map((e) => e.value);
const errores = () => [...caja.querySelectorAll('.campo__error, [role="alert"]')].map((e) => e.textContent);
const hoja = () => caja.querySelector('.calc-hoja')?.textContent ?? '';

// slug, what the model answers, the values that have to be in the fields, the choices marked and what the sheet says.
const CASOS = [
  {
    slug: 'matriz',
    json: { accion: 'det', matriz: '1 2 3; 0 1 4; 5 6 0' },
    elegidas: ['det'],
    dice: 'det A = 1',
  },
  {
    slug: 'matriz',
    caso: 'con comas entre los números',
    json: { accion: 'rango', matriz: '1, 2, 3; 2, 4, 6' },
    elegidas: ['rango'],
    dice: 'rango A = 1',
  },
  {
    slug: 'dicotomica',
    json: { arreglo: '2, 5, 8, 12, 16, 23, 38, 56, 72, 91', dato: '23', base: '0' },
    ve: ['2, 5, 8, 12, 16, 23, 38, 56, 72, 91', '23'],
    elegidas: ['0'],
    dice: '23',
  },
  {
    slug: 'campo',
    json: { P: '2xy', Q: 'x^2', R: '', punto: '1; 2', A: '0; 0', B: '1; 1' },
    ve: ['2xy', 'x^2', '1; 2', '0; 0', '1; 1'],
    dice: 'conservativo',
  },
  {
    slug: 'campo',
    caso: 'sin punto ni trabajo',
    json: { P: '-y', Q: 'x', R: '', punto: '', A: '', B: '' },
    ve: ['-y', 'x', '1; 1'],
    noDice: 'trabajo',
  },
  {
    slug: 'raices',
    json: { metodo: 'newton', f: 'x^2 - 2', a: '', b: '', x0: '1', max: '4', es: '', verdadero: '' },
    ve: ['x^2 - 2', '1', '4'],
    elegidas: ['newton'],
    dice: '1,414214',
  },
  {
    slug: 'raices',
    caso: 'bisección con tolerancia y sin iteraciones',
    json: { metodo: 'biseccion', f: 'x^3 - x - 2', a: '1', b: '2', x0: '', max: '', es: '1', verdadero: '' },
    ve: ['x^3 - x - 2', '1', '2', '50'],
    elegidas: ['biseccion'],
  },
  {
    slug: 'punto-fijo',
    json: { g: 'cos(x)', x0: '1', max: '', es: '0,5', verdadero: '' },
    ve: ['cos(x)', '1', '0,5'],
    dice: '0,73',
  },
  {
    slug: 'pvi',
    json: { metodo: 'euler', f: 'x + y', x0: '0', y0: '1', h: '0,1', xf: '0,3', exacta: '' },
    ve: ['x + y', '0', '1', '0,1', '0,3'],
    elegidas: ['euler'],
    dice: '1,362',
  },
  {
    slug: 'claves',
    json: { relacion: 'ALUMNO(legajo, materia, nombre, nota)', df: 'legajo -> nombre\nlegajo, materia -> nota', conjunto: 'legajo' },
    ve: ['ALUMNO(legajo, materia, nombre, nota)', 'legajo -> nombre\nlegajo, materia -> nota', 'legajo'],
    dice: 'legajo, materia',
  },
  {
    slug: 'normalizacion',
    json: { relacion: 'EMPLEADO(legajo, nombre, codDepto, nombreDepto)', df: 'legajo -> nombre, codDepto; codDepto -> nombreDepto' },
    ve: ['EMPLEADO(legajo, nombre, codDepto, nombreDepto)'],
    dice: 'Está en2FN',
  },
  {
    slug: 'tiro-oblicuo',
    json: { v0: '25', phi: '30', y0: '', g: '', t: '2' },
    ve: ['25', '30', '9,8', '2'],
    dice: '55,2',
  },
  {
    slug: 'campo-cargas',
    json: { unidad: 'nano', q1: '5', p1: '0; 0', q2: '-3', p2: '0,04; 0', q3: '', p3: '', P: '0,02; 0', q0: '' },
    ve: ['5', '0; 0', '-3', '0,04; 0', '0,02; 0'],
    elegidas: ['nano'],
    noDice: 'Fuerza sobre q₀',
  },
  {
    slug: 'tabla-verdad',
    json: { formula: '(p -> q) <-> (no q -> no p)' },
    ve: ['(p -> q) <-> (no q -> no p)'],
    dice: 'una tautología',
  },
  {
    slug: 'calculadora-vacia',
    json: { modelo: 'basico', D: '1.200', V: '', L: '150', C: '8', i: '2%', LT: '', Tc: '', C1: '', C2: '', a: '', S: '', I0: '', articulos: '', media: '', desvio: '', z: '' },
    ve: ['1200', '150', '8', '0,02'],
    elegidas: ['basico'],
    dice: 'Q* = 1.500',
  },
  {
    slug: 'calculadora-vacia',
    caso: 'restricción financiera',
    json: { modelo: 'financiera', D: '', V: '', L: '', C: '', i: '0,02', LT: '', Tc: '', C1: '', C2: '', a: '', S: '', I0: '20.000', articulos: '500 200 100\n300 250 80', media: '', desvio: '', z: '' },
    ve: ['0,02', '20000', '500', '200', '100', '300', '250', '80', ''],
    elegidas: ['financiera'],
  },
  {
    slug: 'calculadora-vacia',
    caso: 'período común',
    json: { modelo: 'periodo', D: '', V: '', L: '90', C: '5200', i: '', LT: '', Tc: '', C1: '', C2: '', a: '', S: '104', I0: '', articulos: '', media: '', desvio: '', z: '' },
    ve: ['5200', '90', '104'],
    elegidas: ['periodo'],
  },
  {
    slug: 'relacion',
    json: { conjunto: '{a, b, c}', pares: '{(a,a), (b,b), (c,c), (a,b), (b,a)}' },
    ve: ['{a, b, c}', '{(a,a), (b,b), (c,c), (a,b), (b,a)}'],
    dice: 'Clases de equivalencia',
  },
  {
    slug: 'recorrido',
    json: { forma: 'expresion', arbol: '(x + y) * (z - w)', orden: 'postorden' },
    ve: ['(x + y) * (z - w)'],
    elegidas: ['expresion', 'postorden'],
    dice: 'x y + z w − ×',
  },
  {
    slug: 'probabilidades',
    json: { modelo: 'binomial', que: 'hasta', n: '10', pi: '30 %', N: '', r: '', m: '', lam: '', mu: '', sig: '', a: '', b: '', g: '', k: '2', x: '', x2: '', p: '' },
    ve: ['10', '0,3', '2'],
    elegidas: ['binomial', 'hasta'],
    dice: '0,3828',
  },
  {
    slug: 'probabilidades',
    caso: 'normal entre dos valores',
    json: { modelo: 'normal', que: 'entre', n: '', pi: '', N: '', r: '', m: '', lam: '', mu: '50', sig: '5', a: '', b: '', g: '', k: '', x: '45', x2: '55', p: '' },
    ve: ['50', '5', '45', '55'],
    elegidas: ['normal', 'entre'],
    dice: '0,6827',
  },
  {
    slug: 'probabilidades',
    caso: 'una continua con un pedido de discreta',
    json: { modelo: 'exponencial', que: 'hasta', n: '', pi: '', N: '', r: '', m: '', lam: '0,5', mu: '', sig: '', a: '', b: '', g: '', k: '', x: '2', x2: '', p: '' },
    ve: ['0,5', '2'],
    elegidas: ['exponencial', 'menor'],
  },
  {
    slug: 'medidas',
    json: { lista: '4 8 15 16 23 42', valores: '', frecuencias: '' },
    ve: ['4 8 15 16 23 42'],
    dice: '18',
  },
  {
    slug: 'medidas',
    caso: 'en una tabla de frecuencias',
    json: { lista: '', valores: '1 2 3 4', frecuencias: '3 5 8 4' },
    ve: ['1', '2', '3', '4', '5', '8'],
    elegidas: ['tabla'],
    dice: '2,65',
  },
  {
    slug: 'tabla-discreta',
    json: { valores: '0 1 2 3', probabilidades: '0,1 0,3 0,4 0,2' },
    ve: ['0', '1', '2', '3', '0,1', '0,3', '0,4', '0,2'],
    dice: '1,7',
  },
  {
    slug: 'bastones',
    json: { modelo: 'poisson', n: 7.6, pi: 0.333, lam: 3.24 },
    ve: ['3.2'],
    elegidas: ['poisson'],
    dice: '3,2',
  },
  {
    slug: 'caja',
    json: { lista: '12; 15; 17; 20; 22; 25; 30; 41', valores: '', frecuencias: '' },
    ve: ['12; 15; 17; 20; 22; 25; 30; 41'],
    elegidas: ['sueltos', 'extremos'],
    dice: '41',
  },
  {
    slug: 'subred',
    json: { red: '172.16.0.0/16', pide: 'h', cuanto: '500' },
    ve: ['172.16.0.0/16', '500'],
    elegidas: ['h'],
    dice: '255.255.254.0',
  },
  {
    slug: 'ventana-tcp',
    json: { umbral: '16', inicial: '', rondas: '', perdidas: '10', ver: 'tahoe' },
    ve: ['16', '1', '24', '10'],
    elegidas: ['tahoe'],
  },
  {
    slug: 'proximo-evento',
    json: { A: '1 0,5 2 1,5 0,8', S: '1,2 2 0,6 1 0,9', n: '' },
    ve: ['1 0,5 2 1,5 0,8', '1,2 2 0,6 1 0,9', '5'],
    dice: 'd̂(5)',
  },
  {
    slug: 'thompson',
    json: { er: 'a(b|c)*', cadena: 'abcb' },
    ve: ['a(b|c)*', 'abcb'],
    dice: 'infinito',
  },
  {
    slug: 'gramatica',
    json: { producciones: 'S -> aSb | ab', palabra: 'aaabbb', lado: 'izquierda' },
    ve: ['S -> aSb | ab', 'aaabbb'],
    elegidas: ['izquierda'],
    dice: 'Es de tipo2',
  },
  {
    slug: 'planificacion',
    json: { alg: 'sjf', quantum: '', alta: 'chico', procesos: 'P1 0 7\nP2 2 4\nP3 4 1\nP4 5 4' },
    ve: ['P1', 'P2', 'P3', 'P4', '0', '7', '2', '4', '1', '5'],
    elegidas: ['sjf'],
    dice: '4',
  },
  {
    slug: 'planificacion',
    caso: 'Round Robin con comas y una ráfaga decimal',
    json: { alg: 'rr', quantum: '2', alta: 'chico', procesos: 'A, 0, 5; B, 1, 2,5; C, 2, 3' },
    ve: ['A', 'B', 'C', '0', '5', '1', '2,5', '2', '3'],
    elegidas: ['rr'],
  },
  {
    slug: 'planificacion',
    caso: 'prioridad con el número más grande',
    json: { alg: 'prio', quantum: '', alta: 'grande', procesos: 'P1 0 4 2\nP2 1 3 5\nP3 2 2 1' },
    ve: ['P1', 'P2', 'P3', '4', '3', '5'],
    elegidas: ['prio', 'grande'],
  },
  {
    slug: 'reemplazo-paginas',
    json: { cadena: '7 0 1 2 0 3 0 4 2 3 0 3 2 1 2 0 1 7 0 1', marcos: 3.4, alg: 'lru' },
    ve: ['7 0 1 2 0 3 0 4 2 3 0 3 2 1 2 0 1 7 0 1'],
    elegidas: ['lru'],
    dice: '12',
  },
  {
    slug: 'lgr-raices',
    json: { N: '', D: 's(s + 2)(s + 4)', k: '' },
    ve: ['1', 's(s + 2)(s + 4)'],
  },
  {
    slug: 'graficadora',
    json: { f: 'f(x) = x^2', g: '', tangente: '2', a: '', b: '' },
    ve: ['x^2', '2', '-5', '5'],
    dice: 'y = 4x − 4',
  },
  {
    slug: 'graficadora',
    caso: 'el área entre dos funciones',
    json: { f: 'e^x', g: 'y = x', tangente: '', a: '0', b: '1' },
    ve: ['e^x', 'x', '0', '1'],
    dice: 'A ≈ 1,2183',
  },
  {
    slug: 'graficadora',
    caso: 'una ecuación',
    json: { f: 'x^2 + y^2 = 9', g: '', tangente: '', a: '', b: '' },
    ve: ['x^2 + y^2 = 9'],
  },
  {
    slug: 'graficadora-3d',
    json: { f: 'z = e^(x^2 - y^2)', punto: 'P(1, -1)', niveles: '' },
    ve: ['e^(x^2 - y^2)', '1; -1', '0', '2', '-2'],
    dice: 'z − 1 = 2(x − 1) + 2(y + 1)',
  },
  {
    slug: 'graficadora-3d',
    caso: 'curvas de nivel',
    json: { f: 'raiz(9 - x^2 - y^2)', punto: '', niveles: '0, 1, 2' },
    ve: ['raiz(9 - x^2 - y^2)', '0; 1; 2', '-3', '3'],
    dice: 'Las curvas de nivel',
  },
  {
    slug: 'graficadora-3d',
    caso: 'una cuádrica',
    json: { f: 'x^2 + y^2 - z^2 = 1', punto: '', niveles: '' },
    ve: ['x^2 + y^2 - z^2 = 1', '-4', '4'],
  },
];

describe('cada calculadora abre con los datos de Consultron', () => {
  it('cada una con campos tiene su caso', () => {
    const conCaso = new Set(CASOS.map((c) => c.slug));
    for (const c of CALCULOS) if (Object.keys(c.campos).length) expect(conCaso, c.slug).toContain(c.slug);
  });

  for (const caso of CASOS) {
    it(`${caso.slug}${caso.caso ? `, ${caso.caso}` : ''}`, async () => {
      await abrir(caso.slug, caso.json);
      expect(errores()).toEqual([]);
      expect(caja.querySelector('.calc-hoja'), 'falta la resolución').not.toBeNull();
      const hay = valores();
      for (const v of caso.ve ?? []) expect(hay, `falta «${v}»`).toContain(v);
      for (const v of caso.elegidas ?? []) expect(elegidas()).toContain(v);
      if (caso.dice) expect(hoja()).toContain(caso.dice);
      if (caso.noDice) expect(hoja()).not.toContain(caso.noDice);
    });
  }

  it('la matriz llena sus celdas en orden', async () => {
    await abrir('matriz', { accion: 'inversa', matriz: '2 1; 1 1' });
    const celdas = [...caja.querySelectorAll('[data-celda]')].map((e) => e.value);
    expect(celdas).toEqual(['2', '1', '1', '1']);
    expect(errores()).toEqual([]);
    expect(caja.querySelector('.calc-hoja__resultado').textContent).toContain('1−1−12');
  });

  it('la matriz con una celda que falta dice cuál', async () => {
    await abrir('matriz', { accion: 'det', matriz: '1 2 3; 4 5; 7 8 9' });
    expect(errores().join(' ')).toContain('Falta la fila 2, columna 3');
  });

  it('las de solo abrir no llevan datos', () => {
    for (const slug of ['inventario', 'banquero']) {
      expect(Object.keys(calculo(slug).campos)).toEqual([]);
      expect(leerDatos(calculo(slug), '{}')).toBeNull();
    }
  });
});

// Consultron's examples are the calculators' own: each one opens solved, with no field error, as its «Probá con» does.
describe('los ejemplos de Consultron en cada calculadora', () => {
  for (const c of CALCULOS) {
    it(c.slug, async () => {
      const { EJEMPLOS } = await PANTALLAS[`../../components/calculadoras/propias/${c.slug}.jsx`]();
      const lista = aplanar(EJEMPLOS);
      expect(lista.length, 'no tiene ejemplos').toBeGreaterThan(0);
      for (const e of lista) {
        if (e.modo) dejarDatos(c.clave, { modelo: e.modo });
        dejarEjemplo(e.nombre);
        const { default: Pantalla } = await PANTALLAS[`../../components/calculadoras/propias/${c.slug}.jsx`]();
        caja = document.createElement('div');
        document.body.append(caja);
        raiz = createRoot(caja);
        await act(async () => raiz.render(<MemoryRouter><Pantalla /></MemoryRouter>));
        expect(tomarEjemplo([{ nombre: e.nombre }]), `«${e.nombre}» no se usó`).toBeNull();
        expect(errores(), `«${e.nombre}»`).toEqual([]);
        expect(caja.querySelector('.calc-hoja'), `«${e.nombre}»: falta la resolución`).not.toBeNull();
        const abierto = [valores(), elegidas(), hoja()];
        const boton = [...caja.querySelectorAll('.ejemplos__boton')].find((b) => b.textContent === e.nombre);
        await act(async () => boton.click());
        expect([valores(), elegidas(), hoja()], `«${e.nombre}» no es el de «Probá con»`).toEqual(abierto);
        act(() => raiz.unmount());
        caja.remove();
        raiz = null;
      }
    });
  }
});
