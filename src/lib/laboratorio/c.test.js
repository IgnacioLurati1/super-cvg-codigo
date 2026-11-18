import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { vigilar } from './cGuardia';
import { explicarCompilacion, finDelAnterior, lineaDeFuncion, traducir } from './cMensajes';
import { compilar, correrPrograma, nombreDeArchivo, prepararC, proyectoDe } from './cMotor';
import { Archivos } from './wasi';

// The real compiler (vendor/xcc, the same the site serves), compiling and running here, without the worker: the
// keyboard reads lines given before, as in a browser that can't pause a program.
let c;
beforeAll(async () => {
  c = await prepararC(new Uint8Array(readFileSync(resolve(import.meta.dirname, '../../../vendor/xcc/wccfiles.zip'))));
}, 30_000);

async function correr(codigo, entrada = '', nombre = 'prueba.c') {
  const compilado = await compilar(c, { codigo, nombre });
  if (!compilado.programa) return { ...compilado, salida: '', errores: '' };
  let resto = new TextEncoder().encode(entrada);
  let salida = '';
  let errores = '';
  const r = await correrPrograma({
    programa: compilado.programa,
    codigoFuente: codigo,
    nombre,
    pausa: false,
    leer: (max) => {
      const dado = resto.subarray(0, max);
      resto = resto.subarray(dado.length);
      return dado;
    },
    escribir: (fd, b) => {
      if (fd === 1) salida += new TextDecoder().decode(b);
      else errores += new TextDecoder().decode(b);
    },
    ultimoError: () => errores,
  });
  return { ...r, salida, errores, avisos: compilado.avisos };
}

// A project, as the worker runs it: the keyboard gives one line at a time, as the student types them.
async function correrProyecto(archivos, { principal = 'main.c', entrada = '' } = {}) {
  const proyecto = proyectoDe({ archivos, principal });
  const compilado = await compilar(c, proyecto);
  if (!compilado.programa) return { ...compilado, salida: '', errores: '' };
  const lineas = entrada ? entrada.split(/(?<=\n)/) : [];
  let salida = '';
  let errores = '';
  const r = await correrPrograma({
    programa: compilado.programa,
    fuentes: proyecto.fuentes,
    datos: proyecto.datos,
    nombre: proyecto.principal,
    pausa: false,
    leer: () => new TextEncoder().encode(lineas.shift() ?? ''),
    escribir: (fd, b) => {
      if (fd === 1) salida += new TextDecoder().decode(b);
      else errores += new TextDecoder().decode(b);
    },
    ultimoError: () => errores,
  });
  const texto = (n) => new TextDecoder().decode(r.archivos.cambiados.find((a) => a.nombre === n)?.contenido);
  return { ...r, salida, errores, avisos: compilado.avisos, texto };
}

const de = (codigo) => [{ nombre: 'main.c', contenido: codigo }];

describe('system() de Windows', () => {
  it('«pause» sigue de largo, «cls» limpia la consola y otra orden dice que no anda', async () => {
    const r = await correr(`#include <stdio.h>
#include <stdlib.h>
int main(void) {
    printf("antes\\n");
    system("pause");
    system("CLS");
    printf("después\\n");
    printf("%d\\n", system("dir"));
    return 0;
}
`);
    expect(r.error).toBeUndefined();
    expect(r.salida).toBe('antes\n\x1b[2J\x1b[Hdespués\n-1\n');
    expect(r.errores).toContain('system("dir") no anda en el laboratorio');
  });
});

describe('C de verdad', () => {
  it('compila y corre, con printf, scanf, structs, punteros, malloc, string.h y math.h', async () => {
    const r = await correr(`#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>

struct Alumno { char nombre[32]; int legajo; double nota; };

int factorial(int n) { return n <= 1 ? 1 : n * factorial(n - 1); }

int main(void) {
    struct Alumno *a = malloc(sizeof *a);
    printf("¿Cómo te llamás? ");
    scanf("%31s", a->nombre);
    scanf("%d", &a->legajo);
    a->nota = sqrt(49.0) + pow(2, -1);
    int v[5] = {5, 3, 1, 4, 2};
    int *p = v;
    int suma = 0;
    for (int i = 0; i < 5; i++) suma += *(p + i);
    printf("%s (%d): %.1f, %zu letras, 10! = %d, suma %d\\n", a->nombre, a->legajo, a->nota, strlen(a->nombre), factorial(10), suma);
    free(a);
    return 0;
}
`, 'Ana\n51234\n');
    expect(r.error).toBeUndefined();
    expect(r.codigo).toBe(0);
    expect(r.salida).toBe('¿Cómo te llamás? Ana (51234): 7.5, 3 letras, 10! = 3628800, suma 15\n');
  });

  it('getchar lee de a una letra hasta el final', async () => {
    const r = await correr('#include <stdio.h>\nint main(void) {\n    int c, n = 0;\n    while ((c = getchar()) != EOF) if (c == \'a\') n++;\n    printf("%d", n);\n    return 0;\n}\n', 'banana\nala\n');
    expect(r.salida).toBe('5');
  });

  it('un error de compilación dice qué falta y en qué línea', async () => {
    const r = await correr('#include <stdio.h>\n\nint main(void) {\n    int x = 3\n    printf("%d\\n", x);\n    return 0;\n}\n');
    expect(r.programa).toBeUndefined();
    expect(r.linea).toBe(4);
    expect(r.error).toMatch(/Falta un `;` al final de la línea 4\.\nMensaje original: `;' expected$/);
    expect(r.error.split('\n')[0]).toBe('  prueba.c, línea 4');
    expect(r.error).toContain('    int x = 3\n             ^');
  });

  it('lo no declarado sugiere su #include, y lo que no tiene cuerpo se dice', async () => {
    const r = await correr('int main(void) {\n    printf("hola");\n    return 0;\n}\n');
    expect(r.linea).toBe(2);
    expect(r.error).toMatch(/`printf` no está declarada\. Sumá `#include <stdio.h>` arriba de todo\.\nMensaje original: `printf' undeclared$/);
    expect(r.error).not.toMatch(/Hay otro error/);
    const s = await correr('int suma(int a, int b);\nint main(void) {\n    return suma(1, 2);\n}\n');
    expect(s.error).toMatch(/Falta escribir la función `suma`/);
    expect(s.linea).toBe(1);
    const m = await correr('int doble(int x) { return 2 * x; }\n');
    expect(m.error).toMatch(/Falta la función `main`/);
  });

  it('una cabecera mal escrita sugiere la buena', async () => {
    const r = await correr('#include <stdoi.h>\nint main(void) { return 0; }\n');
    expect(r.linea).toBe(1);
    expect(r.error).toMatch(/No existe `<stdoi\.h>`\. ¿Quisiste decir `<stdio\.h>`\?$/);
  });

  it('los avisos no frenan el programa', async () => {
    const r = await correr('#include <stdio.h>\nint main(void) {\n    char *s = 5;\n    printf("listo");\n    return 0;\n}\n');
    expect(r.salida).toBe('listo');
    expect(r.avisos).toEqual(['Aviso en la línea 3. No se puede pasar de `int` a `char*`.\n']);
  });

  it('división por cero, en su función y su línea', async () => {
    const r = await correr('#include <stdio.h>\n\nint dividir(int a, int b) {\n    return a / b;\n}\n\nint main(void) {\n    printf("antes ");\n    printf("%d\\n", dividir(1, 0));\n    return 0;\n}\n');
    expect(r.error).toMatch(/^ {2}en dividir, línea 3\n {2}llamada desde main, línea 7\nDivisión por cero\. Pasó en `dividir`\.\nMensaje original: .+$/);
    expect(r.linea).toBe(3);
    // What was in the buffer comes out.
    expect(r.salida).toBe('antes ');
  });

  it('segmentation fault con NULL, y la pila llena con una recursión sin fin', async () => {
    const nulo = await correr('#include <stdio.h>\nstruct Nodo { int valor; struct Nodo *sig; };\nint main(void) {\n    struct Nodo *p = NULL;\n    printf("%d\\n", p->valor);\n    return 0;\n}\n');
    expect(nulo.error).toMatch(/Segmentation fault\. Usaste un puntero que vale `NULL`/);
    const escrito = await correr('int main(void) {\n    int *p = 0;\n    *p = 3;\n    return 0;\n}\n');
    expect(escrito.error).toMatch(/Segmentation fault\. Usaste un puntero que vale `NULL`/);
    const lejos = await correr('int main(void) {\n    int *p = (int *)0x7ffffff0;\n    *p = 3;\n    return 0;\n}\n');
    expect(lejos.error).toMatch(/Segmentation fault\. Leíste o escribiste fuera de la memoria/);
    const pila = await correr('int f(int n) {\n    int v[64];\n    v[n % 64] = n;\n    return f(n + 1) + v[0];\n}\nint main(void) {\n    return f(0);\n}\n');
    expect(pila.error).toMatch(/Se llenó la pila/);
    expect(pila.error).toMatch(/Pasó en `f`/);
  }, 20_000);

  it('exit, abort y un assert que no se cumple', async () => {
    expect((await correr('#include <stdlib.h>\nint main(void) {\n    exit(3);\n}\n')).codigo).toBe(3);
    expect((await correr('#include <stdlib.h>\nint main(void) {\n    abort();\n}\n')).error).toMatch(/abort\(\)/);
    const a = await correr('#include <assert.h>\nint main(void) {\n    int x = 2;\n    assert(x == 3);\n    return 0;\n}\n');
    expect(a.linea).toBe(4);
    expect(a.error).toMatch(/No se cumplió `assert\(x == 3\)`/);
  });

  it('malloc sin fin termina en NULL, no en el navegador', async () => {
    const r = await correr('#include <stdio.h>\n#include <stdlib.h>\nint main(void) {\n    int n = 0;\n    while (malloc(16 * 1024 * 1024)) n++;\n    printf("%d", n);\n    return 0;\n}\n');
    expect(Number(r.salida)).toBeGreaterThan(5);
    expect(Number(r.salida)).toBeLessThan(17);
  }, 20_000);

  it('archivos con fopen, en la memoria de la corrida', async () => {
    const r = await correr('#include <stdio.h>\nint main(void) {\n    FILE *f = fopen("datos.txt", "w");\n    fprintf(f, "hola %d\\n", 42);\n    fclose(f);\n    char linea[32];\n    f = fopen("datos.txt", "r");\n    fgets(linea, sizeof linea, f);\n    fclose(f);\n    printf("%s", linea);\n    printf("%d", fopen("no.txt", "r") == NULL);\n    return 0;\n}\n');
    expect(r.salida).toBe('hola 42\n1');
  });
});

describe('la biblioteca de C', () => {
  it('printf con todos sus formatos', async () => {
    const r = await correr(String.raw`#include <stdio.h>
#include <stddef.h>
int main(void) {
    int n;
    printf("[%hd][%hhd][%5c][% d][%-6x|][%jd][%zu][%3.1s][%#o][%#x][%.3d][%+.2f][% .1e][%*d][%-*d|][%.0s][%%][%i][%lu][%5.1f%%]%n\n", (short)70000, (char)300, 'q', 5, 255, (long long)9, (size_t)4, "abc", 8, 255, 7, 3.14159, 12345.0, 4, 7, 4, 7, "x", -3, 4000000000UL, 99.5, &n);
    char buf[16];
    int largo = snprintf(buf, 8, "%s-%d", "abcdef", 123);
    printf("%d %s|%08.3f|%-9.2e|%G|%g|%lld|%Lf\n", largo, buf, -3.14159, 0.000123, 1e-10, 100000.0, 9223372036854775807LL, (long double)0.5);
    printf("%d\n", n);
    return 0;
}
`);
    expect(r.salida).toBe('[4464][44][    q][ 5][ff    |][9][4][  a][010][0xff][007][+3.14][ 1.2e+04][   7][7   |][][%][-3][4000000000][ 99.5%]\n10 abcdef-|-003.142|1.23e-04 |1E-10|100000|9223372036854775807|0.500000\n116\n');
  });

  it('scanf como en gcc: un espacio antes de %c, %[^\n], %x, el EOF y fflush(stdin)', async () => {
    const r = await correrProyecto(de(String.raw`#include <stdio.h>
int main(void) {
    int n, m, k;
    char c, d, s[40], t[40], linea[40];
    k = scanf("%d", &n);
    printf("%d %d|", k, n);
    k = scanf(" %c%c", &c, &d);
    printf("%d %c %d|", k, c, d);
    k = scanf("%s %[^\n]", s, t);
    printf("%d %s <%s>|", k, s, t);
    k = scanf("%d,%d", &n, &m);
    printf("%d %d %d|", k, n, m);
    k = scanf("%d", &n);
    printf("%d|", k);
    fflush(stdin);
    gets(linea);
    printf("<%s>|", linea);
    float f; double g;
    k = scanf("%f %lf", &f, &g);
    printf("%d %.2f %.3f|", k, f, g);
    k = scanf("%x %o %i", &n, &m, &k);
    printf("%d %d|", n, m);
    printf("%d\n", scanf("%d", &n));
    return 0;
}
`), { entrada: '5\nxy\npalabra hola que tal\n3,4\nnope sobra\nlo que sigue\n1.5 2.25\n1F 17 0x10\n' });
    expect(r.salida).toBe('1 5|2 x 121|2 palabra <hola que tal>|2 3 4|0|<lo que sigue>|2 1.50 2.250|31 15|-1\n');
  });

  it('sscanf para partir una línea de un CSV', async () => {
    const r = await correr(String.raw`#include <stdio.h>
int main(void) {
    int legajo, n; char nombre[20]; float nota;
    int k = sscanf("12;Ana Paz;7.5", "%d;%19[^;];%f%n", &legajo, nombre, &nota, &n);
    printf("%d %d <%s> %.1f %d %d %d", k, legajo, nombre, nota, n, sscanf("", "%d", &n), sscanf("x", "%d", &n));
    return 0;
}
`);
    expect(r.salida).toBe('3 12 <Ana Paz> 7.5 14 -1 0');
  });

  it('string.h, ctype.h, stdlib.h, math.h, limits.h, stdint.h, stdbool.h y float.h', async () => {
    const r = await correr(String.raw`#include <ctype.h>
#include <float.h>
#include <limits.h>
#include <math.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

int comparar(const void *a, const void *b) { return *(const int *)a - *(const int *)b; }

int main(void) {
    char s[32] = "Hola, Mundo 42";
    int letras = 0, blancos = 0;
    for (size_t i = 0; i < strlen(s); i++) {
        letras += isalpha((unsigned char)s[i]) != 0;
        blancos += isblank((unsigned char)s[i]) != 0;
        s[i] = toupper((unsigned char)s[i]);
    }
    char copia[32];
    strcpy(copia, s);
    strcat(copia, "!");
    char *coma = strchr(copia, ',');
    printf("%s %d %d %d %ld %d|", copia, letras, blancos, strcasecmp("abc", "ABC"), (long)(coma - copia), strncmp(copia, "HOLA", 4));
    char partir[] = "a;b;;c";
    for (char *p = strtok(partir, ";"); p; p = strtok(NULL, ";")) printf("%s.", p);
    int v[] = {5, 3, 9, 1};
    qsort(v, 4, sizeof v[0], comparar);
    int buscado = 9;
    int *donde = bsearch(&buscado, v, 4, sizeof v[0], comparar);
    div_t d = div(17, 5);
    printf("|%d%d%d%d %ld %d %d %d %.1f %d|", v[0], v[1], v[2], v[3], (long)(donde - v), d.quot, d.rem, atoi("  -12x"), strtof("2.5", NULL), abs(-3));
    printf("%.4f %.2f %.1f %.1f %.1f %.1f %.1f %.1f %ld %.3f %.0f|", sqrt(2), pow(2, 10), trunc(-2.7), hypot(3, 4), cbrt(-27), fmin(2, 3), fmax(2, 3), roundf(2.5f), lround(-2.5), M_PI, ceil(log10(1000)));
    bool listo = true;
    int32_t grande = INT32_MAX;
    uint8_t chico = 255;
    printf("%d %d %u %d %d %lld %d %.0e\n", listo, grande == INT_MAX, chico + 1, CHAR_BIT, SHRT_MAX, LLONG_MAX, (int)sizeof(int64_t), DBL_EPSILON);
    return 0;
}
`);
    expect(r.error).toBeUndefined();
    expect(r.salida).toBe('HOLA, MUNDO 42! 9 2 0 4 0|a.b.c.|1359 3 3 2 -12 2.5 3|1.4142 1024.00 -2.0 5.0 -3.0 2.0 3.0 3.0 -3 3.142 3|1 1 256 8 32767 9223372036854775807 8 2e-16\n');
  });

  it('rand, srand y time.h', async () => {
    const r = await correr(String.raw`#include <stdio.h>
#include <stdlib.h>
#include <time.h>
int main(void) {
    srand(time(NULL));
    int bien = 1;
    for (int i = 0; i < 1000; i++) {
        int dado = rand() % 6 + 1;
        if (dado < 1 || dado > 6) bien = 0;
    }
    srand(7);
    int a = rand();
    srand(7);
    printf("%d %d %d|", bien, a == rand(), time(NULL) > 1700000000);
    time_t cero = 0;
    char texto[64];
    strftime(texto, sizeof texto, "%d/%m/%Y %H:%M:%S %A %B %j", gmtime(&cero));
    struct tm f = {0};
    f.tm_year = 2026 - 1900;
    f.tm_mon = 10;
    f.tm_mday = 16 + 30;
    time_t t = mktime(&f);
    printf("%s|%d/%d %d %d|%.0f|%s", texto, f.tm_mday, f.tm_mon + 1, f.tm_wday, f.tm_yday, difftime(t + 90, t), asctime(gmtime(&cero)));
    clock_t inicio = clock();
    printf("%d\n", clock() >= inicio && CLOCKS_PER_SEC == 1000000);
    return 0;
}
`);
    expect(r.salida).toBe('1 1 1|01/01/1970 00:00:00 Thursday January 001|16/12 3 349|90|Thu Jan  1 00:00:00 1970\n1\n');
  });

  it('una función del alumno con el nombre de una de la biblioteca es la que vale, como en gcc', async () => {
    const r = await correr('#include <stdio.h>\nint div(int a, int b) { return a / b + 1000; }\ndouble trunc(double x) { return 42; }\nint main(void) {\n    printf("%d %.0f", div(10, 2), trunc(3.5));\n    return 0;\n}\n');
    expect(r.salida).toBe('1005 42');
  });
});

describe('proyectos con varios archivos', () => {
  const pila = [
    { nombre: 'lib/pila.h', contenido: '#ifndef PILA_H\n#define PILA_H\n#include <stdbool.h>\ntypedef struct { int datos[10]; int tope; } Pila;\nvoid iniciar(Pila *p);\nbool apilar(Pila *p, int x);\nint desapilar(Pila *p);\n#endif\n' },
    { nombre: 'lib/pila.c', contenido: '#include "pila.h"\n#include <assert.h>\n\nvoid iniciar(Pila *p) { p->tope = 0; }\nbool apilar(Pila *p, int x) {\n    if (p->tope == 10) return false;\n    p->datos[p->tope++] = x;\n    return true;\n}\nint desapilar(Pila *p) {\n    assert(p->tope > 0);\n    return p->datos[--p->tope];\n}\n' },
  ];

  it('compila todos los .c juntos, con los .h del proyecto, también en carpetas', async () => {
    const r = await correrProyecto([...pila, { nombre: 'main.c', contenido: '#include <stdio.h>\n#include "lib/pila.h"\nint main(void) {\n    Pila p;\n    iniciar(&p);\n    for (int i = 1; i <= 3; i++) apilar(&p, i * 10);\n    while (p.tope) printf("%d ", desapilar(&p));\n    return 0;\n}\n' }]);
    expect(r.error).toBeUndefined();
    expect(r.salida).toBe('30 20 10 ');
  });

  it('lo que se rompe en otro archivo dice cuál y en qué línea', async () => {
    const a = await correrProyecto([...pila, { nombre: 'main.c', contenido: '#include "lib/pila.h"\nint main(void) {\n    Pila p;\n    iniciar(&p);\n    return desapilar(&p);\n}\n' }]);
    expect(a.archivo).toBe('lib/pila.c');
    expect(a.linea).toBe(11);
    expect(a.error).toMatch(/^ {2}lib\/pila\.c, línea 11, en desapilar\n/);
    const division = [
      { nombre: 'calculos.c', contenido: 'int dividir(int a, int b) {\n    return a / b;\n}\n' },
      { nombre: 'main.c', contenido: '#include <stdio.h>\nint dividir(int a, int b);\n\nint main(void) {\n    printf("%d", dividir(1, 0));\n    return 0;\n}\n' },
    ];
    const d = await correrProyecto(division);
    expect(d.archivo).toBe('calculos.c');
    expect(d.linea).toBe(1);
    expect(d.error).toMatch(/^ {2}en dividir, calculos\.c, línea 1\n {2}llamada desde main, main\.c, línea 4\nDivisión por cero\./);
  });

  it('los errores de compilación dicen el archivo: un .c, el final de un .h, un .h que falta y dos main', async () => {
    const enOtro = await correrProyecto([
      { nombre: 'main.c', contenido: 'int doble(int x);\nint main(void) { return doble(2); }\n' },
      { nombre: 'doble.c', contenido: 'int doble(int x) {\n    int y = x * 2\n    return y;\n}\n' },
    ]);
    expect(enOtro.archivo).toBe('doble.c');
    expect(enOtro.linea).toBe(2);
    expect(enOtro.error.split('\n')[0]).toBe('  doble.c, línea 2');
    const finDelH = await correrProyecto([
      { nombre: 'main.c', contenido: '#include "util.h"\n\nint main(void) { return 0; }\n' },
      { nombre: 'util.h', contenido: 'int doble(int x);\nint triple(int x)\n' },
    ]);
    expect(finDelH.archivo).toBe('util.h');
    expect(finDelH.error).toMatch(/^ {2}util\.h, línea 2\n[\s\S]*Falta un `;`/);
    const sinH = await correrProyecto(de('#include "utilidades.h"\nint main(void) { return 0; }\n'));
    expect(sinH.error).toMatch(/No está el archivo `utilidades\.h` en el proyecto/);
    expect([sinH.archivo, sinH.linea]).toEqual(['main.c', 1]);
    const dosMain = await correrProyecto([...de('int main(void) { return 0; }\n'), { nombre: 'otro.c', contenido: '\nint main(void) { return 1; }\n' }]);
    expect(dosMain.error).toBe('Hay más de un `main` en el proyecto: el programa empieza en uno solo. Está en `main.c` y en `otro.c`.');
    expect((await correrProyecto([{ nombre: 'datos.txt', contenido: 'x' }])).error).toMatch(/no tiene ningún archivo `\.c`/);
  });

  it('el archivo principal va primero y lo que no es un nombre válido queda afuera', () => {
    const p = proyectoDe({
      archivos: [
        { nombre: 'a.c', contenido: '' },
        { nombre: 'b.c', contenido: '' },
        { nombre: '../fuera.txt', contenido: 'x' },
        { nombre: '/raiz.txt', contenido: 'x' },
        { nombre: 'a.c', contenido: 'repetido' },
        { nombre: 'datos.dat', contenido: new Uint8Array([1, 2]) },
      ],
      principal: 'b.c',
    });
    expect(p.principal).toBe('b.c');
    expect(p.fuentes.map((f) => f.nombre)).toEqual(['b.c', 'a.c']);
    expect(p.datos).toEqual([{ nombre: 'datos.dat', bytes: new Uint8Array([1, 2]) }]);
    expect(['x.txt', 'datos/x 1.csv', 'a/./b', 'a\\b', 'a\nb', ''].map(nombreDeArchivo)).toEqual(['x.txt', 'datos/x 1.csv', null, null, null, null]);
    expect(proyectoDe({ codigo: 'int main(void){}', nombre: '../x.c' }).principal).toBe('tu_codigo.c');
  });
});

describe('los archivos de datos', () => {
  it('un ABM con struct, fwrite, fread y fseek en un .dat, y lo que cambió vuelve', async () => {
    const r = await correrProyecto(de(String.raw`#include <stdio.h>
typedef struct { int legajo; char nombre[20]; float nota; int activo; } Alumno;

void alta(Alumno a) {
    FILE *f = fopen("alumnos.dat", "ab");
    fwrite(&a, sizeof(Alumno), 1, f);
    fclose(f);
}

int baja(int legajo) {
    FILE *f = fopen("alumnos.dat", "r+b");
    Alumno a;
    while (fread(&a, sizeof a, 1, f) == 1)
        if (a.legajo == legajo) {
            a.activo = 0;
            fseek(f, -(long)sizeof a, SEEK_CUR);
            fwrite(&a, sizeof a, 1, f);
            fclose(f);
            return 1;
        }
    fclose(f);
    return 0;
}

int main(void) {
    int opcion;
    Alumno a;
    while (printf("> "), scanf("%d", &opcion) == 1 && opcion != 0) {
        if (opcion == 1) {
            scanf("%d %19s %f", &a.legajo, a.nombre, &a.nota);
            a.activo = 1;
            alta(a);
        } else if (opcion == 2) {
            scanf("%d", &a.legajo);
            printf("%s\n", baja(a.legajo) ? "baja" : "no esta");
        }
    }
    FILE *f = fopen("alumnos.dat", "rb");
    while (fread(&a, sizeof a, 1, f) == 1) if (a.activo) printf("%d %s %.2f\n", a.legajo, a.nombre, a.nota);
    fseek(f, 0, SEEK_END);
    printf("%ld registros\n", ftell(f) / (long)sizeof a);
    fclose(f);
    return 0;
}
`), { entrada: '1\n100 Ana 8.5\n1\n200 Beto 6.25\n1\n300 Caro 9\n2\n200\n2\n999\n0\n' });
    expect(r.salida).toBe('> > > > baja\n> no esta\n> 100 Ana 8.50\n300 Caro 9.00\n3 registros\n');
    expect(r.archivos.borrados).toEqual([]);
    expect(r.archivos.cambiados.map((a) => [a.nombre, a.contenido.length])).toEqual([['alumnos.dat', 3 * 32]]);
  });

  it('lee los .csv y .txt del proyecto y escribe otros; "a" agrega, feof como en gcc, remove y rename', async () => {
    const r = await correrProyecto([
      ...de(String.raw`#include <stdio.h>
#include <string.h>
int main(void) {
    FILE *csv = fopen("notas.csv", "rt");
    char linea[64];
    int vueltas = 0, legajo, nota, suma = 0;
    while (!feof(csv)) {
        fgets(linea, sizeof linea, csv);
        vueltas++;
    }
    rewind(csv);
    fscanf(csv, "%*[^\n]\n");
    while (fscanf(csv, "%d;%d", &legajo, &nota) == 2) suma += nota;
    fclose(csv);
    FILE *rep = fopen("salida/reporte.txt", "w");
    fprintf(rep, "vueltas %d suma %d\n", vueltas, suma);
    fclose(rep);
    rep = fopen("salida/reporte.txt", "a");
    fputs("fin\n", rep);
    fclose(rep);
    printf("%d %d %d", remove("borrame.txt"), rename("viejo.txt", "nuevo.txt"), fopen("no.txt", "r") == NULL);
    return 0;
}
`),
      { nombre: 'notas.csv', contenido: 'legajo;nota\n100;8\n200;6\n300;9\n' },
      { nombre: 'borrame.txt', contenido: 'x' },
      { nombre: 'viejo.txt', contenido: 'hola' },
    ]);
    expect(r.salida).toBe('0 0 1');
    // In gcc the classic `while (!feof(f))` goes around once more than there are lines.
    expect(r.texto('salida/reporte.txt')).toBe('vueltas 5 suma 23\nfin\n');
    expect(r.texto('nuevo.txt')).toBe('hola');
    expect(r.archivos.cambiados.map((a) => a.nombre).sort()).toEqual(['nuevo.txt', 'salida/reporte.txt']);
    expect(r.archivos.borrados.sort()).toEqual(['borrame.txt', 'viejo.txt']);
  });

  it('un archivo escrito de a poco no se copia entero cada vez, y el disco tiene un tope', async () => {
    const r = await correrProyecto(de('#include <stdio.h>\nint main(void) {\n    FILE *f = fopen("grande.txt", "w");\n    for (int i = 0; i < 200000; i++) fprintf(f, "%d\\n", i);\n    fclose(f);\n    return 0;\n}\n'));
    expect(r.codigo).toBe(0);
    expect(r.texto('grande.txt').split('\n').at(-2)).toBe('199999');
    const disco = new Archivos([], { tope: 10 });
    expect(disco.escribirEn('/a', 0, new Uint8Array(8))).toBe(true);
    expect(disco.escribirEn('/a', 8, new Uint8Array(4))).toBe(false);
    expect(disco.leer('/a').length).toBe(8);
  }, 20_000);
});

describe('los mensajes del compilador', () => {
  it('traduce los conocidos y deja los otros como vienen', () => {
    expect(traducir('`)\' expected')).toBe('Falta cerrar un paréntesis, `)`.');
    expect(traducir('function `f\' expect 2 arguments, but 1')).toBe('`f` recibe 2 argumentos y le pasaste 1.');
    expect(traducir('`fork\' undeclared')).toMatch(/no anda en el laboratorio/);
    expect(traducir('algo raro')).toBe('algo raro');
  });

  it('lo que falta va al final del renglón anterior, salteando comentarios y líneas vacías', () => {
    const codigo = 'int x = 3 // tres\n\n/* nada */\n    y = 4;';
    expect(finDelAnterior(codigo, 4, 4)).toEqual({ linea: 1, columna: 9 });
    expect(finDelAnterior('a = 1 b = 2;', 1, 6)).toEqual({ linea: 1, columna: 5 });
  });

  it('la línea de una función es la de su cuerpo, no la de su declaración', () => {
    expect(lineaDeFuncion('int f(int);\n\nint f(int x)\n{\n    return x;\n}\n', 'f')).toBe(3);
    expect(lineaDeFuncion('int main(void) {}', 'otra')).toBe(0);
  });

  it('el primer error y cuántas líneas más tienen otro', () => {
    const salida = '/home/alumno/a.c(2): `x\' undeclared\n    x = 1;\n    ^\n/home/alumno/a.c(2): cannot assign to int\n    x = 1;\n      ^\n/home/alumno/a.c(5): `y\' undeclared\n    y = 1;\n    ^\n';
    const r = explicarCompilacion(salida, 'int main(void) {\n    x = 1;\n\n\n    y = 1;\n}', 'a.c');
    expect(r.linea).toBe(2);
    expect(r.error).toMatch(/Hay otro error más abajo\. Arreglá este primero y corré de nuevo\.$/);
  });
});

describe('la guardia del programa', () => {
  it('si no entiende el módulo, lo deja como vino', () => {
    const raro = new Uint8Array([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0]);
    expect(vigilar(raro, { pila: 1024 })).toEqual({ bytes: raro, vigilado: false });
  });
});

describe('los errores de C, en criollo y con el mensaje original debajo', () => {
  const ultimas = async (codigo) => (await correr(codigo)).error.split('\n').slice(-2).join('\n');
  const con = (cuerpo) => `#include <stdio.h>\nint main(void) {\n${cuerpo}\n    return 0;\n}\n`;

  it('los de compilación que faltaban', async () => {
    const letra = await correr(con("    char c = 'ab';"));
    expect(letra.linea).toBe(3);
    expect(letra.error).toMatch(/Un carácter va entre comillas simples y es uno solo, como 'a'\.[^\n]*\nMensaje original: Character not closed$/);
    expect(await ultimas(con('    char *s = "a";\n    if (s == 1.5) {}'))).toMatch(/Para comparar textos va `strcmp`\.\nMensaje original: compare pointer to other types$/);
    expect(await ultimas(con('    double d = 1.5;\n    int x = d % 2;'))).toMatch(/solo anda con números enteros\.\nMensaje original: int type expected$/);
    const roto = await correr(con('    int *p = 5.5;'));
    expect(roto.error).toMatch(/^El compilador tropezó con algo que no sabe convertir\./);
    expect(roto.error).toMatch(/\nMensaje original: .*Assertion/);
  });

  it('los de siempre dicen qué pasó, en qué línea y qué dijo el compilador', async () => {
    const r = await correr(con('    int x = 3\n    printf("%d", x);'));
    expect(r.linea).toBe(3);
    expect(r.error).toMatch(/Falta un `;` al final de la línea 3\.\nMensaje original: `;' expected$/);
    expect(await ultimas(con('    y = 5;'))).toMatch(/`y` no está declarada\. [^\n]*\nMensaje original: `y' undeclared$/);
    expect(await ultimas(con('    int x = 1;\n    int x = 2;'))).toMatch(/`x` ya está declarada\. Usá otro nombre\.\nMensaje original: .*x.*$/);
    expect(await ultimas(con('    int x = "hola";'))).toMatch(/No se puede pasar de `char\[5\]` a `int`\.\nMensaje original: convert value from type/);
    expect(await ultimas(con('    printf("a";'))).toMatch(/Falta una coma o cerrar el paréntesis\.\nMensaje original: /);
  });

  it('un programa que se corta dice qué pasó y deja el mensaje del navegador', async () => {
    const r = await correr(con('    int a = 0;\n    printf("%d", 1 / a);'));
    expect(r.error).toMatch(/División por cero\. Pasó en `main`\.\nMensaje original: .+$/);
    expect(r.linea).toBe(2);
  });
});
