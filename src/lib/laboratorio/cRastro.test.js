// «Paso a paso» in C with the real compiler (vendor/xcc, the same the site serves), without the worker: the code with its
// calls (cPasos.js) recorded step by step (cRastro.js), read as the screen reads it (pasos.js). The keyboard reads lines
// given before, as in a browser that can't pause a program.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { prepararC, proyectoDe } from './cMotor';
import { instrumentar } from './cPasos';
import { grabar } from './cRastro';
import { describirPaso, fotoDelPaso, leerRecorrido, textoDeValor, TOPE_PASOS } from './pasos';

let c;
beforeAll(async () => {
  c = await prepararC(new Uint8Array(readFileSync(resolve(import.meta.dirname, '../../../vendor/xcc/wccfiles.zip'))));
}, 30_000);

async function pasoAPaso(archivos, { entrada = [], tope = TOPE_PASOS } = {}) {
  const proyecto = proyectoDe(typeof archivos === 'string' ? { codigo: archivos, nombre: 'main.c' } : { archivos, principal: 'main.c' });
  const lineas = [...entrada];
  let salida = '';
  const g = await grabar(c, proyecto, {
    tope,
    pausa: false,
    ultimoError: () => '',
    leer: () => new TextEncoder().encode(lineas.length ? `${lineas.shift()}\n` : ''),
    escribir: (_fd, b) => {
      salida += new TextDecoder().decode(b);
    },
  });
  if (!g) return null;
  const recorrido = leerRecorrido(g.pasos);
  const fotos = recorrido.pasos.map((_, i) => fotoDelPaso(recorrido, i));
  // Each step in words, as the screen says it, and the variables of the frame that runs.
  const frases = fotos.map(describirPaso);
  const variables = (foto, k = -1) => Object.fromEntries(foto.marcos.at(k).v.map(([n, v]) => [n, textoDeValor(v, foto.porId)]));
  const objeto = (foto, v) => foto.porId.get(v[1]);
  return { r: g.r, salida, recorrido, fotos, frases, variables, objeto };
}

const valores = (foto, o) => (o.e ?? o.a.map(([, v]) => v)).map((v) => textoDeValor(v, foto.porId));

describe('Paso a paso en C', () => {
  it('burbujeo: el arreglo que recibe la función es el mismo del main, y se ve cómo se ordena', async () => {
    const { r, salida, recorrido, fotos, frases, variables, objeto } = await pasoAPaso(`#include <stdio.h>
#define N 5

void ordenar(int v[], int n) {
    int i, j, aux;
    for (i = 0; i < n - 1; i++) {
        for (j = 0; j < n - 1 - i; j++) {
            if (v[j] > v[j + 1]) {
                aux = v[j];
                v[j] = v[j + 1];
                v[j + 1] = aux;
            }
        }
    }
}

int main() {
    int numeros[N] = {5, 3, 8, 1, 4};
    int i;
    ordenar(numeros, N);
    for (i = 0; i < N; i++)
        printf("%d ", numeros[i]);
    printf("\\n");
    return 0;
}
`);
    expect(r.codigo).toBe(0);
    expect(salida).toBe('1 3 4 5 8 \n');
    expect(recorrido.tope).toBe(false);
    expect(frases[0]).toBe('Entra a main.');
    const entra = fotos.findIndex((f) => f.evento === 'call' && f.marcos.at(-1).f === 'ordenar');
    expect(frases[entra]).toBe('Entra a ordenar con v = arreglo 1 y n = 5.');
    // v (the parameter) and numeros (in main) point to the same array.
    const foto = fotos[entra];
    expect(foto.marcos.at(-1).v[0][1]).toEqual(foto.marcos.at(-2).v[0][1]);
    expect(valores(foto, objeto(foto, foto.marcos.at(-2).v[0][1]))).toEqual(['5', '3', '8', '1', '4']);
    // The swap of the first two, line by line.
    const cambio = fotos.findIndex((f) => f.evento === 'line' && f.linea === 11);
    expect(valores(fotos[cambio], fotos[cambio].objetos[0])).toEqual(['3', '3', '8', '1', '4']);
    expect(variables(fotos[cambio])).toMatchObject({ i: '0', j: '0', aux: '5' });
    expect(frases.find((f) => f.startsWith('Sale de ordenar'))).toBe('Sale de ordenar.');
    const fin = fotos.at(-1);
    expect(fin).toMatchObject({ evento: 'fin', archivo: 'main.c', linea: 24, escrito: salida.length, error: null });
    expect(valores(fin, fin.objetos[0])).toEqual(['1', '3', '4', '5', '8']);
  });

  it('lista enlazada con malloc: cada nodo es un objeto, sig apunta al siguiente y lo liberado deja de verse', async () => {
    const { fotos, frases, variables, objeto } = await pasoAPaso(`#include <stdio.h>
#include <stdlib.h>

typedef struct nodo {
    int dato;
    struct nodo *sig;
} Nodo;

Nodo *agregar(Nodo *cabeza, int valor) {
    Nodo *nuevo = (Nodo *)malloc(sizeof(Nodo));
    nuevo->dato = valor;
    nuevo->sig = cabeza;
    return nuevo;
}

int main(void) {
    Nodo *lista = NULL;
    for (int i = 1; i <= 3; i++)
        lista = agregar(lista, i * 10);
    while (lista) {
        Nodo *aux = lista;
        lista = lista->sig;
        free(aux);
    }
    return 0;
}
`);
    expect(frases).toContain('Entra a agregar con cabeza = NULL y valor = 10.');
    expect(frases).toContain('agregar devuelve Nodo 1.');
    expect(frases).toContain('Entra a agregar con cabeza = Nodo 2 y valor = 30.');
    // With the three: lista → Nodo 3 → Nodo 2 → Nodo 1 → NULL.
    const armada = fotos.find((f) => f.evento === 'line' && f.linea === 20);
    expect(variables(armada)).toEqual({ lista: 'Nodo 3' });
    let nodo = objeto(armada, armada.marcos.at(-1).v[0][1]);
    const recorrida = [];
    while (nodo) {
      recorrida.push(Object.fromEntries(nodo.a.map(([n, v]) => [n, textoDeValor(v, armada.porId)])));
      nodo = nodo.a[1][1][0] === 'r' ? objeto(armada, nodo.a[1][1]) : null;
    }
    expect(recorrida).toEqual([{ dato: '30', sig: 'Nodo 2' }, { dato: '20', sig: 'Nodo 1' }, { dato: '10', sig: 'NULL' }]);
    // for (int i…) only lives in its loop.
    expect(armada.marcos.at(-1).v.map(([n]) => n)).toEqual(['lista']);
    // After the first free, aux points to memory that isn't there anymore.
    const liberado = fotos.findIndex((f) => f.evento === 'line' && f.linea === 20 && f.objetos.length === 2);
    expect(variables(fotos[liberado - 1])).toMatchObject({ lista: 'Nodo 2' });
    expect(variables(fotos[liberado + 1]).aux).toMatch(/^0x/);
    expect(fotos.at(-1).objetos).toEqual([]);
  });

  it('factorial: cada llamada es un marco nuevo y cada vuelta dice lo que devuelve', async () => {
    const { salida, fotos, frases } = await pasoAPaso(`#include <stdio.h>

long factorial(int n) {
    if (n <= 1)
        return 1;
    return n * factorial(n - 1);
}

int main() {
    int n = 4;
    printf("%d! = %ld\\n", n, factorial(n));
    return 0;
}
`);
    expect(salida).toBe('4! = 24\n');
    expect(frases.filter((f) => f.startsWith('factorial devuelve'))).toEqual(['factorial devuelve 1.', 'factorial devuelve 2.', 'factorial devuelve 6.', 'factorial devuelve 24.']);
    const fondo = fotos.find((f) => f.evento === 'return');
    expect(fondo.marcos.map((m) => `${m.f}:${m.v.map(([, v]) => v[1]).join(',')}`)).toEqual(['main:4', 'factorial:4', 'factorial:3', 'factorial:2', 'factorial:1']);
    expect(fotos.at(-1).evento).toBe('fin');
  });

  it('un struct de alumno con scanf: lo que se tipea queda en la salida y el struct se llena campo a campo', async () => {
    const { salida, recorrido, fotos } = await pasoAPaso(`#include <stdio.h>

struct Alumno {
    char nombre[30];
    int legajo;
    float nota;
};

int main() {
    struct Alumno a;
    printf("Nombre: ");
    scanf("%s", a.nombre);
    printf("Legajo: ");
    scanf("%d", &a.legajo);
    printf("Nota: ");
    scanf("%f", &a.nota);
    if (a.nota >= 6)
        printf("%s aprobo con %.2f\\n", a.nombre, a.nota);
    else
        printf("%s desaprobo\\n", a.nombre);
    return 0;
}
`, { entrada: ['Juan', '1234', '7.5'] });
    expect(salida).toBe('Nombre: Legajo: Nota: Juan aprobo con 7.50\n');
    expect(recorrido.salida).toEqual([['out', 'Nombre: '], ['in', 'Juan\n'], ['out', 'Legajo: '], ['in', '1234\n'], ['out', 'Nota: '], ['in', '7.5\n'], ['out', 'Juan aprobo con 7.50\n']]);
    // Before line 13 it asked for the name and read it.
    const leido = fotos.find((f) => f.linea === 13);
    expect(leido.escrito).toBe('Nombre: Juan\n'.length);
    const alumno = (f) => Object.fromEntries(f.objetos[0].a.map(([n, v]) => [n, textoDeValor(v, f.porId)]));
    expect(alumno(leido)).toMatchObject({ nombre: '"Juan"' });
    expect(fotos.at(-1).objetos[0]).toMatchObject({ t: 'objeto', c: 'Alumno', k: 1 });
    expect(alumno(fotos.at(-1))).toEqual({ nombre: '"Juan"', legajo: '1234', nota: '7.5' });
  });

  it('un proyecto con varios .c: cada paso y cada marco dicen su archivo', async () => {
    const { salida, fotos, frases } = await pasoAPaso([
      { nombre: 'main.c', contenido: '#include <stdio.h>\n#include "pila.h"\n\nint main(void) {\n    Pila p;\n    inicializar(&p);\n    apilar(&p, 3);\n    apilar(&p, 7);\n    printf("tope %d\\n", desapilar(&p));\n    return 0;\n}\n' },
      { nombre: 'pila.h', contenido: '#ifndef PILA_H\n#define PILA_H\n#define MAX 10\ntypedef struct {\n    int datos[MAX];\n    int tope;\n} Pila;\nvoid inicializar(Pila *p);\nvoid apilar(Pila *p, int x);\nint desapilar(Pila *p);\n#endif\n' },
      { nombre: 'pila.c', contenido: '#include "pila.h"\n\nvoid inicializar(Pila *p) {\n    p->tope = 0;\n}\n\nvoid apilar(Pila *p, int x) {\n    p->datos[p->tope++] = x;\n}\n\nint desapilar(Pila *p) {\n    return p->datos[--p->tope];\n}\n' },
    ]);
    expect(salida).toBe('tope 7\n');
    expect(new Set(fotos.map((f) => f.archivo))).toEqual(new Set(['main.c', 'pila.c']));
    const apila = fotos.find((f) => f.evento === 'line' && f.archivo === 'pila.c' && f.linea === 8);
    expect(apila.marcos.map((m) => `${m.f}@${m.a}`)).toEqual(['main@main.c', 'apilar@pila.c']);
    // p (a pointer, in apilar) points to the Pila of main.
    expect(apila.marcos[1].v[0][1]).toEqual(apila.marcos[0].v[0][1]);
    expect(frases).toContain('desapilar devuelve 7.');
    expect(frases).toContain('Sale de apilar.');
  });

  it('se ven las globales, char, long long, bool, enum, punteros a variables y a funciones', async () => {
    const { fotos, variables } = await pasoAPaso(`#include <stdbool.h>
enum Dia { LUNES, MARTES };
int contador = 2;
const char *saludo = "hola";
static int doble(int v) { return v * 2; }
int main(void) {
    int x = 5, *px = &x;
    char letra = 'A';
    long long grande = 123456789012LL;
    bool ok = true;
    enum Dia d = MARTES;
    double real = 2;
    int (*f)(int) = doble;
    int v[3] = {1, 2, 3}, *medio = &v[1];
    return f(x) - 10;
}
`);
    const ultimo = fotos.findLast((f) => f.evento === 'line' && f.marcos.at(-1).f === 'main');
    expect(ultimo.marcos[0].f).toBe('Variables globales');
    expect(variables(ultimo, 0)).toEqual({ contador: '2', saludo: '"hola"' });
    expect(variables(ultimo)).toEqual({ x: '5', px: '&x', letra: "'A'", grande: '123456789012', ok: 'true', d: '1', real: '2.0', f: 'función doble', v: 'arreglo 1', medio: '&v[1]' });
  });

  it('corta a los pasos del tope, y un error queda en el último paso con su línea', async () => {
    const bucle = await pasoAPaso('int main(void) {\n    int i = 0;\n    while (1) {\n        i++;\n    }\n}\n', { tope: 50 });
    expect(bucle.r).toMatchObject({ codigo: 0, cortado: true });
    expect(bucle.recorrido.tope).toBe(true);
    expect(bucle.recorrido.pasos).toHaveLength(50);

    const roto = await pasoAPaso('#include <stdio.h>\nint main(void) {\n    int *p = NULL;\n    printf("antes\\n");\n    *p = 3;\n    return 0;\n}\n');
    expect(roto.fotos.at(-1)).toMatchObject({ evento: 'fin', linea: 5 });
    expect(roto.fotos.at(-1).error).toMatch(/NULL/);
    expect(roto.recorrido.salida[0]).toEqual(['out', 'antes\n']);
  });

  it('las líneas del código con sus llamadas son las mismas del alumno', () => {
    const codigo = 'int f(int a) {\n  if (a) return 1;\n  for (int i = 0; i < a; i++) a--;\n  return a;\n}\nint main(void) { return f(2); }\n';
    const { fuentes } = instrumentar([{ nombre: 'main.c', contenido: codigo }]);
    const propio = fuentes[0].contenido.split('#line 1 "/home/alumno/main.c"\n')[1].split('\n');
    const nombres = (l) => l.match(/[A-Za-z_]\w*/g) ?? [];
    codigo.split('\n').forEach((linea, k) => {
      expect(nombres(propio[k])).toEqual(expect.arrayContaining(nombres(linea)));
    });
  });
});
