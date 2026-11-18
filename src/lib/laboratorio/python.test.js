// @vitest-environment node
// The Python of the lab with the real Pyodide (the one the site serves), without the worker: the runner (corredor.js),
// «Paso a paso» and «Medir tiempos» (rastreo.js) and the project's folder (pyProyecto.js), as python.worker.js puts
// them together. The keyboard reads lines given before, as in a browser that can't pause a program.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadPyodide } from 'pyodide';
import { beforeAll, describe, expect, it } from 'vitest';
import { CORREDOR } from './corredor';
import { archivoDe, paquetesDe } from './modulos';
import { leerRecorrido } from './pasos';
import { CARPETA, cambiosDe, ponerProyecto, proyectoPython } from './pyProyecto';
import { RASTREO } from './rastreo';
import { ajustar, funcionesDelCodigo, llamadaSugerida } from './tiempos';

let py;
let salida = '';
let pasos = null;
const medidas = [];
const tiempos = [];

beforeAll(async () => {
  py = await loadPyodide({ env: { HOME: '/home/alumno', PYTHONHASHSEED: '0' }, jsglobals: Object.create(null), stdout: () => {}, stderr: () => {} });
  const escribir = { isatty: false, write: (b) => ((salida += new TextDecoder().decode(b)), b.length) };
  py.setStdout(escribir);
  py.setStderr(escribir);
  py.registerJsModule('_laboratorio', {
    pedir: () => null,
    sin_pausa: () => {},
    imagen: () => {},
    pasos: (t) => (pasos = leerRecorrido(String(t))),
    medida_empieza: () => {},
    medida: (n, s) => (medidas.push(Number(n)), tiempos.push({ n: Number(n), s: Number(s) })),
    medida_tope: () => {},
    medida_falla: (donde) => medidas.push(String(donde)),
  });
  const sitio = py.runPython('import site; site.getsitepackages()[0]');
  for (const p of paquetesDe('import pandas')) py.unpackArchive(new Uint8Array(readFileSync(resolve('vendor/python', archivoDe(p).archivo))), 'wheel', { extractDir: sitio });
  py.runPython(CORREDOR, { filename: '<laboratorio>' });
  py.runPython(RASTREO, { filename: '<laboratorio>' });
}, 120_000);

const texto = (bytes) => new TextDecoder().decode(bytes);

/** A run as the worker does it: { error, linea, archivo, salida, cambiados (by name, as text), borrados }. */
function correr(pedido, { modo = null, lineas = [] } = {}) {
  salida = '';
  pasos = null;
  medidas.length = 0;
  tiempos.length = 0;
  const proyecto = proyectoPython(pedido);
  if (proyecto.error) return { error: proyecto.error };
  const antes = ponerProyecto(py.FS, proyecto);
  const f = py.globals.get(modo === 'pasos' ? '_paso_a_paso' : modo?.funcion ? '_medir' : '_correr');
  const args = modo === 'pasos' ? [proyecto.codigo, proyecto.principal, lineas, 1000] : modo?.funcion ? [proyecto.codigo, proyecto.principal, lineas, modo.funcion, modo.argumentos, modo.tamanos ?? [10, 100], modo.presupuesto ?? 5] : [proyecto.codigo, proyecto.principal, lineas];
  const r = f(...args);
  const [error, linea, archivo] = r.toJs();
  r.destroy();
  f.destroy();
  const { cambiados, borrados } = cambiosDe(py.FS, antes);
  return { error: error ?? null, linea, archivo: archivo ?? null, salida, cambiados: Object.fromEntries(cambiados.map((a) => [a.nombre, a.contenido])), borrados };
}

const MODELO = `class Alumno:
    def __init__(self, legajo, nombre, nota):
        self.legajo = int(legajo)
        self.nombre = nombre
        self.nota = float(nota)

    def aprobo(self):
        return self.nota >= 6
`;

const MAIN = `import csv
from modelo import Alumno
import utiles

with open("alumnos.csv", newline="", encoding="utf-8") as f:
    alumnos = [Alumno(**fila) for fila in csv.DictReader(f)]

aprobados = [a.nombre for a in alumnos if a.aprobo()]
print("Aprobaron:", ", ".join(aprobados))
print("Promedio:", utiles.promedio([a.nota for a in alumnos]))
with open("resumen.txt", "w", encoding="utf-8") as f:
    f.write(f"{len(aprobados)} de {len(alumnos)}\\n")
`;

const TP = [
  { nombre: 'main.py', contenido: MAIN },
  { nombre: 'modelo.py', contenido: MODELO },
  { nombre: 'utiles.py', contenido: 'def promedio(xs):\n    return round(sum(xs) / len(xs), 2)\n' },
  { nombre: 'alumnos.csv', contenido: 'legajo,nombre,nota\n50101,Gómez,8.5\n50102,Pereyra,4\n50103,Sosa,7\n' },
];

describe('un proyecto de Python', () => {
  it('un TP con main.py, modelo.py y alumnos.csv: se importan entre sí, lee el CSV y lo que escribe vuelve', () => {
    const r = correr({ archivos: TP, principal: 'main.py' });
    expect(r.error).toBeNull();
    expect(r.salida).toBe('Aprobaron: Gómez, Sosa\nPromedio: 6.5\n');
    expect(Object.keys(r.cambiados)).toEqual(['resumen.txt']);
    expect(texto(r.cambiados['resumen.txt'])).toBe('2 de 3\n');
    expect(r.borrados).toEqual([]);
    // Without `principal`, main.py; a change in a module is there in the next run.
    const otro = correr({ archivos: [{ ...TP[2], contenido: 'def promedio(xs):\n    return max(xs)\n' }, ...TP.filter((a) => a.nombre !== 'utiles.py')] });
    expect(otro.salida).toMatch(/Promedio: 8.5\n$/);
  });

  it('escribe un .txt y lo vuelve a leer; borra uno; los cambios vuelven también si se rompe', () => {
    const codigo = 'import os\nwith open("notas.txt", "w") as f:\n    f.write("10\\n9\\n")\nwith open("notas.txt") as f:\n    print(sum(int(x) for x in f))\nos.remove("viejo.txt")\nos.makedirs("salida", exist_ok=True)\nopen("salida/fin.dat", "wb").write(bytes([0, 255]))\n1 / 0\n';
    const r = correr({ archivos: [{ nombre: 'tp.py', contenido: codigo }, { nombre: 'viejo.txt', contenido: 'x' }] });
    expect(r.salida).toBe('19\n');
    expect(r).toMatchObject({ linea: 9, archivo: 'tp.py', borrados: ['viejo.txt'] });
    expect(r.error).toMatch(/ZeroDivisionError/);
    expect(Object.keys(r.cambiados).sort()).toEqual(['notas.txt', 'salida/fin.dat']);
    expect([...r.cambiados['salida/fin.dat']]).toEqual([0, 255]);
  });

  it('sqlite3 crea base.db en su carpeta, y en la corrida siguiente la encuentra', () => {
    const crear = 'import sqlite3\ncon = sqlite3.connect("base.db")\ncon.execute("create table materia (nombre text, nota real)")\ncon.executemany("insert into materia values (?, ?)", [("AED", 8), ("Física", 6)])\ncon.commit()\ncon.close()\n';
    const r = correr({ archivos: [{ nombre: 'crear.py', contenido: crear }] });
    expect(r.error).toBeNull();
    expect(Object.keys(r.cambiados)).toEqual(['base.db']);
    expect(texto(r.cambiados['base.db'].slice(0, 15))).toBe('SQLite format 3');
    const leer = 'import sqlite3\nprint(sqlite3.connect("base.db").execute("select avg(nota) from materia").fetchone()[0])\n';
    const r2 = correr({ archivos: [{ nombre: 'leer.py', contenido: leer }, { nombre: 'base.db', contenido: r.cambiados['base.db'] }] });
    expect(r2.salida).toBe('7.0\n');
    expect(r2.cambiados).toEqual({});
  });

  it('pandas lee el CSV del proyecto', () => {
    const r = correr({ archivos: [{ nombre: 'main.py', contenido: 'import pandas as pd\ndf = pd.read_csv("alumnos.csv")\nprint(df["nota"].mean())\n' }, TP[3]] });
    expect(r.error).toBeNull();
    expect(r.salida).toBe('6.5\n');
  }, 60_000);

  it('un error en un módulo importado dice su archivo y su línea, sin rutas ni lo del Laboratorio', () => {
    const r = correr({ archivos: [{ nombre: 'main.py', contenido: 'from calculos import dividir\nprint(dividir(1, 0))\n' }, { nombre: 'calculos.py', contenido: '# Cuentas\ndef dividir(a, b):\n    return a / b\n' }] });
    expect(r).toMatchObject({ linea: 3, archivo: 'calculos.py' });
    expect(r.error).toMatch(/File "main.py", line 2, in <module>\n.*\n.*File "calculos.py", line 3, in dividir\n {4}return a \/ b\n/s);
    expect(r.error).toMatch(/ZeroDivisionError: division by zero\n$/);
    expect(r.error).not.toMatch(/laboratorio|\/home|importlib|frozen/);
    // A syntax error in it: its line, in its file.
    const mal = correr({ archivos: [{ nombre: 'main.py', contenido: 'import calculos\n' }, { nombre: 'calculos.py', contenido: 'def f(:\n    pass\n' }] });
    expect(mal).toMatchObject({ linea: 1, archivo: 'calculos.py' });
    expect(mal.error).toMatch(/File "calculos.py", line 1\n.*SyntaxError/s);
    // One that isn't there.
    expect(correr({ archivos: [{ nombre: 'main.py', contenido: 'import utiles\n' }] }).error).toMatch(/ModuleNotFoundError: No module named 'utiles'/);
  });

  it('paquetes en carpetas, con __init__.py o sin él, y el principal que se elige', () => {
    const archivos = [
      { nombre: 'app.py', contenido: 'from figuras import circulo\nfrom herramientas.texto import grito\nprint(grito(circulo.area(1)))\n' },
      { nombre: 'figuras/__init__.py', contenido: '' },
      { nombre: 'figuras/circulo.py', contenido: 'import math\ndef area(r):\n    return round(math.pi * r * r, 2)\n' },
      { nombre: 'herramientas/texto.py', contenido: 'def grito(x):\n    return str(x) + "!"\n' },
      { nombre: 'main.py', contenido: 'print("no soy yo")\n' },
    ];
    const r = correr({ archivos, principal: 'app.py' });
    expect(r.error).toBeNull();
    expect(r.salida).toBe('3.14!\n');
    const roto = correr({ archivos: [...archivos.slice(0, 3), { nombre: 'herramientas/texto.py', contenido: 'def grito(x):\n    return x + "!"\n' }], principal: 'app.py' });
    expect(roto).toMatchObject({ linea: 2, archivo: 'herramientas/texto.py' });
    expect(roto.error).toMatch(/File "herramientas\/texto.py", line 2, in grito/);
    expect(correr({ archivos: [{ nombre: 'datos.csv', contenido: 'a' }] })).toEqual({ error: 'El proyecto no tiene ningún archivo `.py` para correr.' });
  });

  it('el código suelto sigue como siempre: su nombre en el error, y lo que escribió queda para la próxima', () => {
    const r = correr({ codigo: 'with open("visto.txt", "a") as f:\n    f.write("x")\nprint(open("visto.txt").read())\nint("a")\n', nombre: 'tp1.py' });
    expect(r).toMatchObject({ salida: 'x\n', linea: 4, archivo: 'tp1.py' });
    expect(r.error).toMatch(/File "tp1.py", line 4/);
    expect(Object.keys(r.cambiados)).toEqual(['visto.txt']);
    const otra = correr({ codigo: 'print(open("visto.txt").read())\n', nombre: 'tp1.py' });
    expect(otra).toMatchObject({ error: null, salida: 'x\n', cambiados: {} });
    expect(py.runPython('import os; os.getcwd()')).toBe(CARPETA);
  });
});

describe('paso a paso y medir tiempos, en un proyecto', () => {
  it('el recorrido marca los pasos de cada archivo, y dibuja los objetos de sus clases', () => {
    const main = 'from modelo import Alumno\na = Alumno(1, "Ana", 9)\nprint(a.aprobo())\n';
    const r = correr({ archivos: [{ nombre: 'main.py', contenido: main }, { nombre: 'modelo.py', contenido: MODELO }] }, { modo: 'pasos' });
    expect(r.error).toBeNull();
    const archivos = [...new Set(pasos.pasos.map((p) => `${p.a}:${p.l}`))];
    expect(archivos).toEqual(['main.py:1', 'modelo.py:1', 'modelo.py:2', 'modelo.py:7', 'main.py:2', 'modelo.py:3', 'modelo.py:4', 'modelo.py:5', 'main.py:3', 'modelo.py:8']);
    expect(pasos.pasos.filter((p) => p.e === 'fin')).toHaveLength(1);
    expect(pasos.pasos.at(-1)).toMatchObject({ e: 'fin', a: 'main.py' });
    expect(pasos.objetos.some((o) => o.c === 'Alumno')).toBe(true);
    expect(pasos.marcos.find((m) => m.f === 'aprobo')).toMatchObject({ a: 'modelo.py' });
  });

  it('un error en otro archivo, en el último paso', () => {
    correr({ archivos: [{ nombre: 'main.py', contenido: 'import calculos\ncalculos.f()\n' }, { nombre: 'calculos.py', contenido: 'def f():\n    return 1 / 0\n' }] }, { modo: 'pasos' });
    expect(pasos.pasos.at(-1)).toMatchObject({ e: 'fin', a: 'calculos.py', l: 2 });
  });

  it('mide una función que viene de otro archivo', () => {
    const r = correr({ archivos: [{ nombre: 'main.py', contenido: 'from orden import ordenar\n' }, { nombre: 'orden.py', contenido: 'def ordenar(xs):\n    return sorted(xs)\n' }] }, { modo: { funcion: 'ordenar', argumentos: 'list(range(n))' } });
    expect(r.error).toBeNull();
    expect(medidas).toEqual([10, 100]);
  });

  // The knapsack of a real TP of Algoritmos Genéticos (exhaustive, every subset), called as the program calls it and
  // with no sizes: they start small and stop before one that takes too long. It's 2ⁿ, never «No depende de n».
  it('sin tamaños, la mochila exhaustiva sube de a poco, frena sola y crece como 2ⁿ', () => {
    const codigo = `import itertools

def exhaustiva(elementos, capacidad, clave='volumen'):
    mejor = []
    mejor_valor = 0
    for tamano in range(1, len(elementos) + 1):
        for combinacion in itertools.combinations(elementos, tamano):
            peso = sum(e[clave] for e in combinacion)
            valor = sum(e['valor'] for e in combinacion)
            if peso <= capacidad and valor > mejor_valor:
                mejor, mejor_valor = combinacion, valor
    return mejor, mejor_valor

ELEMENTOS = [
    {'id': 1, 'volumen': 150, 'valor': 20},
    {'id': 2, 'volumen': 325, 'valor': 40},
    {'id': 3, 'volumen': 600, 'valor': 50},
]
CAPACIDAD = 4200
print(exhaustiva(ELEMENTOS, CAPACIDAD, 'volumen'))
`;
    const [f] = funcionesDelCodigo(codigo);
    const argumentos = llamadaSugerida(f.parametros, codigo, f.nombre);
    expect(argumentos).toBe("(ELEMENTOS * n)[:n], CAPACIDAD, 'volumen'");
    const r = correr({ archivos: [{ nombre: 'main.py', contenido: codigo }] }, { modo: { funcion: 'exhaustiva', argumentos, tamanos: [], presupuesto: 6 } });
    expect(r.error).toBeNull();
    expect(medidas.length).toBeGreaterThanOrEqual(3);
    expect(Math.max(...medidas)).toBeLessThan(30);
    expect(medidas).toEqual([...medidas].sort((a, b) => a - b));
    expect(ajustar(tiempos).modelo).toBe('exp');
  }, 60_000);

  it('sin tamaños, algo que no tarda nada no sube para siempre', () => {
    const r = correr({ archivos: [{ nombre: 'main.py', contenido: 'def primero(xs):\n    return xs[0]\n' }] }, { modo: { funcion: 'primero', argumentos: 'list(range(n))', tamanos: [] } });
    expect(r.error).toBeNull();
    expect(medidas[0]).toBe(1000);
    expect(medidas.length).toBe(6);
    expect(medidas.at(-1)).toBe(32000);
  }, 60_000);
});
