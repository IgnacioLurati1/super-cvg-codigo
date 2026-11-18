// @vitest-environment node
// The Chapin of the lab (chapinPython.js with the real Pyodide, chapin.js): the programs are exercises of AED in El
// Santo Resumen (lutastudios.com/utn/algoritmos-y-estructuras-de-datos/), and what comes out has to be what their
// diagrams show, box by box. The measures of the layout are the ones of those drawings, with a letter of 7.8 px.
import { loadPyodide } from 'pyodide';
import { beforeAll, describe, expect, it } from 'vitest';
import { CHAPIN_PY } from './chapinPython';
import { armarChapin, chapinEnLista, leerChapin, partir, partirCondicion } from './chapin';

let chapin;

beforeAll(async () => {
  const py = await loadPyodide({ jsglobals: Object.create(null), stdout: () => {}, stderr: () => {} });
  py.runPython(CHAPIN_PY, { filename: '<laboratorio>' });
  chapin = (codigo) => leerChapin(py.globals.get('_chapin')(codigo));
}, 120_000);

// What a diagram says, short: a sentence is its text, the rest an array.
function forma(lista) {
  return lista.map((p) => {
    if (p.tipo === 's') return p.texto;
    if (p.tipo === 'txt') return ['txt', p.texto];
    if (p.tipo === 'rep') return [p.cabeza, forma(p.cuerpo)];
    if (p.tipo === 'si') return ['si', p.condicion, forma(p.si), forma(p.no)];
    return [p.cabeza, p.casos.map((c) => [c.rotulo, forma(c.cuerpo)])];
  });
}

// 1° parcial, 16/05/2024 (Ferreterías), two of its modules and its main program.
const FERRETERIAS = `# Globales
# n, numFerre, cantProd, mayorNro, menosDe10: int
# precio, totalRecaudado, mayorPresu: float

def LEER_FERRETERIA():
    global numFerre
    numFerre = int(input("Número de ferretería (100 a 999): "))
    while numFerre < 100 or numFerre > 999:
        numFerre = int(input("Número inválido, entre 100 y 999: "))

def PROCESAR_FERRETERIA():
    # presu: float
    global totalRecaudado, mayorPresu, mayorNro, menosDe10
    presu = cantProd * precio
    print("Ferretería", numFerre, "- productos:", cantProd, "- presupuesto:", presu)
    totalRecaudado = totalRecaudado + presu
    if presu > mayorPresu:
        mayorPresu = presu
        mayorNro = numFerre
    if cantProd < 10:
        menosDe10 = menosDe10 + 1

def MENU():
    # opcion: str
    # porc: float
    opcion = ""
    while opcion != "d":
        print("d. Salir")
        opcion = input("Opción: ")
        match opcion:
            case "a":
                print("Total recaudado:", totalRecaudado)
            case "c":
                porc = menosDe10 / n * 100
                print("Con menos de 10 productos:", porc, "%")

# Programa principal
LEER_FERRETERIA()
MENU()
`;

// 2° parcial, 16/05/2023 (Lombrices): a function with its question in a variable, and a decision with both columns.
const LOMBRICES = `def LEER_RANGO(mensaje, desde, hasta):
    # mensaje: str
    # desde, hasta, x: int
    x = int(input(mensaje))
    while x < desde or x > hasta:
        x = int(input("Fuera de rango, entre " + str(desde) + " y " + str(hasta) + ": "))
    return x

def SUMA(M, f, c):
    vertical = 0
    for i in range(3):
        vertical = vertical + M[i][c]
    if vertical > horizontal:
        return vertical
    else:
        return horizontal
`;

// Final, 12/02/2025: a dichotomic search, whose elif is a decision inside the «f» column, and a class.
const DICOTOMICA = `import pickle

class Profesor:
    def __init__(self):
        self.dniP = ""

def BUSCA_PROFESOR(dni):
    # dni: str
    inicio = 0
    pos = -1
    while inicio <= fin and pos == -1:
        medio = (inicio + fin) // 2
        reg = pickle.load(alProfesores)
        if reg.dniP == dni:
            pos = medio
        elif dni < reg.dniP:
            fin = medio - 1
        else:
            inicio = medio + 1
    return pos

pos = BUSCA_PROFESOR("1")
`;

describe('Chapin: the exercises of El Santo Resumen', () => {
  it('Ferreterías: main program first, its declarations, Leer, Mostrar, Mientras, a decision without «f» and Según', () => {
    const r = chapin(FERRETERIAS);
    expect(r.ok).toBe(true);
    expect(r.diagramas.map((d) => d.titulo)).toEqual(['Programa principal', 'LEER_FERRETERIA()', 'PROCESAR_FERRETERIA()', 'MENU()']);
    const [principal, leer, procesar, menu] = r.diagramas;
    expect(principal.decl).toEqual(['# Globales', '# n, numFerre, cantProd, mayorNro, menosDe10: int', '# precio, totalRecaudado, mayorPresu: float']);
    expect(forma(principal.cuerpo)).toEqual(['LEER_FERRETERIA()', 'MENU()']);
    // global doesn't go; a question in plain text doesn't either.
    expect(forma(leer.cuerpo)).toEqual(['Leer(numFerre)', ['Mientras numFerre < 100 or numFerre > 999:', ['Leer(numFerre)']]]);
    expect(procesar.decl).toEqual(['# presu: float']);
    expect(forma(procesar.cuerpo)).toEqual([
      'presu = cantProd * precio',
      'Mostrar("Ferretería", numFerre, "- productos:", cantProd, "- presupuesto:", presu)',
      'totalRecaudado = totalRecaudado + presu',
      ['si', 'presu > mayorPresu', ['mayorPresu = presu', 'mayorNro = numFerre'], []],
      ['si', 'cantProd < 10', ['menosDe10 = menosDe10 + 1'], []],
    ]);
    expect(forma(menu.cuerpo)).toEqual([
      'opcion = ""',
      ['Mientras opcion != "d":', [
        'Mostrar("d. Salir")',
        'Leer(opcion)',
        ['Según opcion:', [['"a"', ['Mostrar("Total recaudado:", totalRecaudado)']], ['"c"', ['porc = menosDe10 / n * 100', 'Mostrar("Con menos de 10 productos:", porc, "%")']]]],
      ]],
    ]);
  });

  it('Lombrices: a question that isn\'t plain text is Mostrar and then Leer; for as written; return', () => {
    const [rango, suma] = chapin(LOMBRICES).diagramas;
    expect(rango.titulo).toBe('LEER_RANGO(mensaje, desde, hasta)');
    expect(rango.decl).toEqual(['# mensaje: str', '# desde, hasta, x: int']);
    expect(forma(rango.cuerpo)).toEqual([
      'Mostrar(mensaje)',
      'Leer(x)',
      ['Mientras x < desde or x > hasta:', ['Mostrar("Fuera de rango, entre " + str(desde) + " y " + str(hasta) + ": ")', 'Leer(x)']],
      'return x',
    ]);
    expect(forma(suma.cuerpo)).toEqual([
      'vertical = 0',
      ['for i in range(3):', ['vertical = vertical + M[i][c]']],
      ['si', 'vertical > horizontal', ['return vertical'], ['return horizontal']],
    ]);
  });

  it('Final: elif is a decision in the «f» column, the class goes as written with the declarations, import doesn\'t go', () => {
    const [principal, busca] = chapin(DICOTOMICA).diagramas;
    expect(principal.decl).toEqual(['class Profesor:', '    def __init__(self):', '        self.dniP = ""']);
    expect(forma(principal.cuerpo)).toEqual(['pos = BUSCA_PROFESOR("1")']);
    expect(forma(busca.cuerpo)).toEqual([
      'inicio = 0',
      'pos = -1',
      ['Mientras inicio <= fin and pos == -1:', [
        'medio = (inicio + fin) // 2',
        'reg = pickle.load(alProfesores)',
        ['si', 'reg.dniP == dni', ['pos = medio'], [['si', 'dni < reg.dniP', ['fin = medio - 1'], ['inicio = medio + 1']]]],
      ]],
      'return pos',
    ]);
  });
});

describe('Chapin: what doesn\'t fit and what breaks', () => {
  it('try, with, break, continue and the else of a loop stay as written; a comprehension or a lambda is a sentence', () => {
    const r = chapin(`def f(x):
    try:
        r = 1 / x
    except ZeroDivisionError:
        r = 0
    for i in range(3):
        if i == 1:
            break
        continue
    while x:
        x -= 1
    else:
        print("fin")
    l = [i * 2 for i in range(9)]
    g = lambda z: z + 1
    return (x +
            r)
`);
    expect(forma(r.diagramas[0].cuerpo)).toEqual([
      ['txt', 'try:\n    r = 1 / x\nexcept ZeroDivisionError:\n    r = 0'],
      ['for i in range(3):', [['si', 'i == 1', [['txt', 'break']], []], ['txt', 'continue']]],
      ['txt', 'while x:\n    x -= 1\nelse:\n    print("fin")'],
      'l = [i * 2 for i in range(9)]',
      'g = lambda z: z + 1',
      'return (x + r)',
    ]);
  });

  it('a syntax error says its line, and nothing breaks', () => {
    expect(chapin('x = 1\nif x\n    print(x)\n')).toEqual({ ok: false, linea: 2 });
    expect(chapin('def f(:\n')).toEqual({ ok: false, linea: 1 });
    expect(chapin('')).toEqual({ ok: true, diagramas: [], cortado: false });
  });

  it('a very long program is cut, and says so', () => {
    const r = chapin(Array.from({ length: 2000 }, (_, i) => `x${i} = ${i}`).join('\n'));
    expect(r.ok).toBe(true);
    expect(r.cortado).toBe(true);
    expect(r.diagramas[0].cuerpo).toHaveLength(600);
    expect(chapin('x = 1\n'.repeat(60_000))).toEqual({ ok: false, largo: true });
  });

  it('very deep nesting stays as written past its limit, without breaking', () => {
    const hondo = Array.from({ length: 40 }, (_, i) => `${'    '.repeat(i)}if x${i}:`).join('\n') + `\n${'    '.repeat(40)}pass\n`;
    const r = chapin(hondo);
    expect(r.ok).toBe(true);
    let p = r.diagramas[0].cuerpo[0];
    let niveles = 0;
    while (p.tipo === 'si') {
      niveles += 1;
      [p] = p.si;
    }
    expect(niveles).toBe(30);
    expect(p.tipo).toBe('txt');
  });

  it('what the worker says is checked', () => {
    expect(leerChapin('no')).toBeNull();
    expect(leerChapin('{"ok": true, "diagramas": [{"titulo": 1, "cuerpo": [["s", "x", 1], ["raro"], ["si", "c", "no", null, 2]]}]}')).toEqual({
      ok: true,
      cortado: false,
      diagramas: [{ titulo: '', decl: [], linea: 0, cuerpo: [{ tipo: 's', texto: 'x', linea: 1 }, { tipo: 'si', condicion: 'c', si: [], no: [], linea: 2 }] }],
    });
  });
});

describe('Chapin: the drawing', () => {
  it('breaks lines as El Santo Resumen does', () => {
    expect(partir('Mostrar("Ferretería", numFerre, "- productos:", cantProd, "- presupuesto:", presu)')).toEqual(['Mostrar("Ferretería", numFerre, "- productos:", cantProd,', '    "- presupuesto:", presu)']);
    expect(partir('Mientras opcion != "a" and opcion != "b" and opcion != "c" and opcion != "d":')).toEqual(['Mientras opcion != "a" and opcion != "b" and', '    opcion != "c" and opcion != "d":']);
    expect(partir('Mostrar("Nombre del participante con ficha " + str(ficha) + ": ")')).toEqual(['Mostrar("Nombre del participante con ficha " +', '    str(ficha) + ": ")']);
    // A space inside a string is not a place to break.
    expect(partir(`Mostrar("${'a '.repeat(40)}")`)).toHaveLength(1);
    expect(partirCondicion('reg.patente == pat and reg.estado == "A"')).toEqual(['reg.patente == pat and', 'reg.estado == "A"']);
    expect(partirCondicion('presu > mayorPresu')).toEqual(['presu > mayorPresu']);
  });

  it('LEER_FERRETERIA has the boxes of El Santo Resumen', () => {
    const d = armarChapin(chapin(FERRETERIAS).diagramas[1]);
    expect(d.cajas).toEqual([
      { x: 14, y: 49, w: 343.6, h: 26 },
      { x: 14, y: 75, w: 343.6, h: 52 },
      { x: 38, y: 101, w: 319.6, h: 26 },
    ]);
    expect(d.textos.filter((t) => t.tipo === 'codigo').map((t) => [t.x, t.y, t.texto])).toEqual([
      [22, 66.5, 'Leer(numFerre)'],
      [22, 92.5, 'Mientras numFerre < 100 or numFerre > 999:'],
      [46, 118.5, 'Leer(numFerre)'],
    ]);
    expect(d.textos[0]).toEqual({ x: 14, y: 29, texto: 'LEER_FERRETERIA()', tipo: 'titulo' });
    expect(d.ancho).toBe(372);
    expect(d.alto).toBe(141);
  });

  it('PROCESAR_FERRETERIA: its decisions have the triangles of El Santo Resumen, with «v» and «f»', () => {
    const d = armarChapin(chapin(FERRETERIAS).diagramas[2]);
    expect(d.cajas.slice(0, 5)).toEqual([
      { x: 14, y: 66, w: 460.6, h: 26 },
      { x: 14, y: 92, w: 460.6, h: 42 },
      { x: 14, y: 134, w: 460.6, h: 26 },
      { x: 14, y: 160, w: 460.6, h: 96 },
      { x: 14, y: 204, w: 424.6, h: 26 },
    ]);
    expect(d.trazo).toBe('M14 160L438.6 204L474.6 160M14 204H474.6M438.6 204V256M14 256L438.6 300L474.6 256M14 300H474.6M438.6 300V326');
    expect(d.textos.filter((t) => t.tipo === 'vf')).toEqual([
      { x: 21, y: 197, texto: 'v', tipo: 'vf' },
      { x: 467.6, y: 197, texto: 'f', tipo: 'vf', ancla: 'end' },
      { x: 21, y: 293, texto: 'v', tipo: 'vf' },
      { x: 467.6, y: 293, texto: 'f', tipo: 'vf', ancla: 'end' },
    ]);
    expect(d.textos.find((t) => t.tipo === 'decl')).toEqual({ x: 14, y: 54, texto: '# presu: float', tipo: 'decl' });
  });

  it('Según: a row with each case and a column per case', () => {
    const d = armarChapin(chapin(FERRETERIAS).diagramas[3]);
    expect(d.textos.filter((t) => t.ancla === 'middle').map((t) => t.texto)).toEqual(['"a"', '"c"']);
    expect(d.trazo).toMatch(/^M38 \d+(\.\d)?H[\d.]+M38 \d+(\.\d)?H[\d.]+M[\d.]+ \d+(\.\d)?V[\d.]+$/);
  });

  it('in words, for a screen reader', () => {
    expect(chapinEnLista(chapin(LOMBRICES).diagramas[1])).toEqual([
      { texto: 'vertical = 0' },
      { texto: 'for i in range(3):', hijos: [{ texto: 'vertical = vertical + M[i][c]' }] },
      { texto: 'Si vertical > horizontal', hijos: [{ texto: 'Verdadero', hijos: [{ texto: 'return vertical' }] }, { texto: 'Falso', hijos: [{ texto: 'return horizontal' }] }] },
    ]);
    expect(chapinEnLista(chapin(['if x:', '    pass', 'try:', '    y()', 'except:', '    pass', ''].join('\n')).diagramas[0])).toEqual([
      { texto: 'Si x', hijos: [{ texto: 'Verdadero', hijos: [{ texto: 'pass' }] }, { texto: 'Falso', hijos: [{ texto: 'Nada' }] }] },
      { texto: 'Sin dibujar, como está escrito', codigo: ['try:', '    y()', 'except:', '    pass'].join('\n') },
    ]);
});
});
