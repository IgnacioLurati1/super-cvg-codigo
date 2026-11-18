import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { archivoDe, importadosDelSitio, modulosQueFaltan, paqueteDe, paquetesDe, pesoDe, porQueNoEsta, REVISOR_PYTHON } from './modulos';

const LISTA = JSON.parse(readFileSync(resolve('node_modules/pyodide/pyodide-lock.json'), 'utf8')).packages;

describe('lo que un programa en Python importa y el Laboratorio no trae', () => {
  it('scipy, pymysql y los que vienen juntos en una línea', () => {
    expect(modulosQueFaltan('import scipy as sp\n\nprint(sp.__version__)')).toEqual(['scipy']);
    expect(modulosQueFaltan('import math, pymysql as db\nfrom scipy.stats import norm\n    from flask import Flask')).toEqual(['pymysql', 'scipy', 'flask']);
    expect(modulosQueFaltan('import math; import PyQt5')).toEqual(['PyQt5']);
  });

  it('lo que trae Python, nada: también sqlite3 y unittest', () => {
    expect(modulosQueFaltan('import math\nimport random as r\nfrom collections import Counter\nfrom itertools import product\nimport os.path\nprint(math.pi)')).toEqual([]);
    expect(modulosQueFaltan('import sqlite3\nimport sqlite3 as sql\nimport unittest\nimport logging')).toEqual([]);
    expect(modulosQueFaltan('for i in range(5):\n    print("important")')).toEqual([]);
    expect(modulosQueFaltan('from . import algo')).toEqual([]);
    expect(modulosQueFaltan('')).toEqual([]);
    expect(modulosQueFaltan(null)).toEqual([]);
  });

  it('numpy, pandas y matplotlib no faltan: los sirve el sitio', () => {
    const inversa = 'import numpy as np\n\nA = np.array([[2, 4, 6], [4, 0, 6], [3, 0, -2]])\nA_inv = np.linalg.inv(A)\nprint(A_inv)';
    expect(modulosQueFaltan(inversa)).toEqual([]);
    expect(modulosQueFaltan('import numpy as np\nimport pandas as pd\nimport matplotlib.pyplot as plt\nfrom pylab import plot\nfrom PIL import Image')).toEqual([]);
  });
});

describe('los paquetes que el Laboratorio le pasa a Python', () => {
  it('los que el programa importa, una vez cada uno', () => {
    expect(paquetesDe('import numpy as np\nfrom numpy.linalg import inv\nprint(inv(np.eye(2)))')).toEqual(['numpy']);
    expect(paquetesDe('import math, numpy')).toEqual(['numpy']);
    expect(paquetesDe('x = 1; import numpy')).toEqual(['numpy']);
    expect(paquetesDe('def f():\n    from numpy import array\n    return array([1])')).toEqual(['numpy']);
  });

  it('con lo que necesitan, cada uno después de los suyos', () => {
    const pandas = paquetesDe('import pandas as pd');
    expect([...pandas].sort()).toEqual(['numpy', 'pandas', 'python-dateutil', 'pytz', 'six']);
    const todos = paquetesDe('import pandas as pd\nimport matplotlib.pyplot as plt');
    expect(new Set(todos).size).toBe(todos.length);
    for (const [i, nombre] of todos.entries()) {
      for (const dep of LISTA[nombre].depends) expect(todos.indexOf(dep)).toBeLessThan(i);
    }
    expect(todos.at(-1)).toBe('matplotlib');
    expect(todos).toContain('pillow');
  });

  it('el nombre del import lleva a su paquete', () => {
    expect(paqueteDe('PIL')).toBe('pillow');
    expect(paqueteDe('pylab')).toBe('matplotlib');
    expect(paqueteDe('dateutil')).toBe('python-dateutil');
    expect(importadosDelSitio('import math\nimport matplotlib.pyplot as plt\nimport pandas')).toEqual(['matplotlib', 'pandas']);
  });

  it('el peso es la suma de sus archivos', () => {
    const paquetes = paquetesDe('import matplotlib.pyplot as plt');
    expect(pesoDe(paquetes)).toBe(paquetes.reduce((n, p) => n + archivoDe(p).bytes, 0));
    expect(pesoDe([])).toBe(0);
  });

  it('sin importarlo, ninguno', () => {
    expect(paquetesDe('import math\nprint("numpy")\n# import numpy')).toEqual([]);
    expect(paquetesDe('import scipy')).toEqual([]);
    expect(paquetesDe(null)).toEqual([]);
  });

  // With a new Pyodide its list names other files: bring them to vendor/python from
  // https://cdn.jsdelivr.net/pyodide/v<version>/full/ and take the old ones out.
  it('cada archivo es el de la lista de Pyodide, byte por byte, con sus dependencias', () => {
    const nombres = paquetesDe('import numpy, pandas, matplotlib');
    expect([...nombres].sort()).toEqual(['contourpy', 'cycler', 'fonttools', 'kiwisolver', 'matplotlib', 'numpy', 'packaging', 'pandas', 'pillow', 'pyparsing', 'python-dateutil', 'pytz', 'six']);
    for (const nombre of nombres) {
      const lista = LISTA[nombre];
      const { archivo, bytes, depende } = archivoDe(nombre);
      expect(archivo).toBe(lista.file_name);
      expect(depende).toEqual(lista.depends);
      const contenido = readFileSync(resolve('vendor/python', archivo));
      expect(contenido.length).toBe(bytes);
      expect(createHash('sha256').update(contenido).digest('hex')).toBe(lista.sha256);
    }
  });

  it('pyflakes, el que revisa mientras escribís, es el de PyPI byte por byte y ningún programa lo importa', () => {
    const contenido = readFileSync(resolve('vendor/python', REVISOR_PYTHON.archivo));
    expect(contenido.length).toBe(REVISOR_PYTHON.bytes);
    expect(createHash('sha256').update(contenido).digest('hex')).toBe(REVISOR_PYTHON.sha256);
    expect(paquetesDe('import pyflakes')).toEqual([]);
  });

  it('sqlite3 viene con Python en esta versión de Pyodide', () => {
    expect(LISTA.sqlite3).toBeUndefined();
  });
});

describe('por qué no está un módulo', () => {
  const error = (nombre) => `Traceback (most recent call last):\n  File "<laboratorio>", line 1, in <module>\n    import ${nombre}\nModuleNotFoundError: No module named '${nombre}'\n`;

  it('los que necesitan red o ventana lo dicen', () => {
    expect(porQueNoEsta(error('pymysql'))).toBe('`pymysql` necesita un servidor de base de datos y acá no hay red. Probalo con `sqlite3`, que se usa casi igual.');
    expect(porQueNoEsta(error('mysql.connector'))).toMatch(/^`mysql` necesita un servidor/);
    expect(porQueNoEsta(error('flask'))).toBe('`flask` levanta un servidor web y acá no hay red.');
    expect(porQueNoEsta(error('flask_sqlalchemy'))).toMatch(/servidor web/);
    expect(porQueNoEsta(error('PyQt5'))).toBe('`PyQt5` abre ventanas y acá solo hay consola.');
    expect(porQueNoEsta(error('PyQt6.QtWidgets'))).toMatch(/^`PyQt6` abre ventanas/);
    expect(porQueNoEsta(error('tkinter'))).toMatch(/abre ventanas/);
    expect(porQueNoEsta(error('requests'))).toBe('`requests` se conecta a internet y acá no hay red.');
  });

  it('cualquier otro, qué trae', () => {
    expect(porQueNoEsta(error('scipy'))).toBe('El Laboratorio no trae `scipy`. Trae lo de Python, `numpy`, `pandas` y `matplotlib`.');
    // In a project, it may be one of its files that isn't there.
    expect(porQueNoEsta(error('utiles'), { proyecto: true })).toBe('No hay un `utiles.py` en el proyecto. El Laboratorio tampoco lo trae.');
    expect(porQueNoEsta(error('pymysql'), { proyecto: true })).toMatch(/^`pymysql` necesita un servidor/);
  });

  it('otro error, nada', () => {
    expect(porQueNoEsta('NameError: name \'x\' is not defined')).toBe('');
    expect(porQueNoEsta(null)).toBe('');
  });
});
