// «Paso a paso» in C: the student's code with calls added (to c/pasos.c, which hands them to cRastro.js), so the
// program itself says each line it's about to run, each function it enters and leaves (with what it returns), each
// variable it declares (with its address, its size and its kind, which the compiler knows: _Generic and sizeof) and
// each block of memory it asks for. Everything goes on the same lines as the original, so the compiler's lines and the
// student's are the same. «Correr» doesn't come through here.
//
// It reads C with a small parser of its own (tokens, declarations, statements), enough for the C of a course: what it
// doesn't understand it leaves as it is, and a function it can't follow runs without steps.

const BASICAS = new Set(['void', 'char', 'short', 'int', 'long', 'float', 'double', 'signed', 'unsigned', '_Bool', 'bool', '_Complex']);
const CALIFICADORES = new Set(['const', 'volatile', 'restrict', '__restrict', 'register', 'auto', 'inline', '__inline', '_Noreturn', 'static', 'extern', 'typedef']);
// Types of the library: their kind comes from the compiler (sizeof, _Generic); the opaque ones aren't opened.
const DE_LA_BIBLIOTECA = ['size_t', 'ssize_t', 'ptrdiff_t', 'intptr_t', 'uintptr_t', 'intmax_t', 'uintmax_t', 'off_t', 'wchar_t', 'time_t', 'clock_t',
  'int8_t', 'uint8_t', 'int16_t', 'uint16_t', 'int32_t', 'uint32_t', 'int64_t', 'uint64_t', 'fpos_t'];
const OPACOS = ['FILE', 'div_t', 'ldiv_t', 'lldiv_t', 'va_list'];
const CONTROL = new Set(['if', 'else', 'while', 'for', 'do', 'switch', 'case', 'default', 'return', 'break', 'continue', 'goto', 'sizeof']);
const MEMORIA = new Set(['malloc', 'calloc', 'realloc', 'free']);
const PUNTUACION = ['...', '<<=', '>>=', '->', '++', '--', '<<', '>>', '<=', '>=', '==', '!=', '&&', '||', '*=', '/=', '%=', '+=', '-=', '&=', '^=', '|=', '##'];
// How many levels of a value its declaration describes: v, v[0], v[0][0]… or p, *p, **p.
const NIVELES = 4;

/** The tokens of C code: { t: 'id' | 'num' | 'str' | 'chr' | 'p' | 'pp', v, i, f, l } (start, end, line). Comments
 * go; each preprocessor line is one 'pp'. */
export function tokenizar(texto) {
  const tk = [];
  const n = texto.length;
  let i = 0;
  let linea = 1;
  let inicio = true;
  const saltarComentario = () => {
    const fin = texto.indexOf('*/', i + 2);
    const hasta = fin < 0 ? n : fin + 2;
    for (let k = i; k < hasta; k += 1) if (texto[k] === '\n') linea += 1;
    i = hasta;
  };
  while (i < n) {
    const c = texto[i];
    if (c === '\n') {
      linea += 1;
      i += 1;
      inicio = true;
      continue;
    }
    if (c === ' ' || c === '\t' || c === '\r' || c === '\f' || c === '\v') {
      i += 1;
      continue;
    }
    if (c === '\\' && texto[i + 1] === '\n') {
      i += 2;
      linea += 1;
      continue;
    }
    if (c === '/' && texto[i + 1] === '/') {
      while (i < n && texto[i] !== '\n') i += 1;
      continue;
    }
    if (c === '/' && texto[i + 1] === '*') {
      saltarComentario();
      continue;
    }
    if (c === '#' && inicio) {
      const desde = i;
      const l = linea;
      while (i < n && texto[i] !== '\n') {
        if (texto[i] === '\\' && texto[i + 1] === '\n') {
          i += 2;
          linea += 1;
        } else if (texto[i] === '/' && texto[i + 1] === '*') saltarComentario();
        else if (texto[i] === '/' && texto[i + 1] === '/') {
          while (i < n && texto[i] !== '\n') i += 1;
        } else i += 1;
      }
      tk.push({ t: 'pp', v: texto.slice(desde, i), i: desde, f: i, l });
      continue;
    }
    inicio = false;
    const desde = i;
    if (/[A-Za-z_$]/.test(c)) {
      while (i < n && /[\w$]/.test(texto[i])) i += 1;
      tk.push({ t: 'id', v: texto.slice(desde, i), i: desde, f: i, l: linea });
      continue;
    }
    if (/\d/.test(c) || (c === '.' && /\d/.test(texto[i + 1] ?? ''))) {
      i += 1;
      while (i < n && (/[\w.]/.test(texto[i]) || (/[+-]/.test(texto[i]) && /[eEpP]/.test(texto[i - 1])))) i += 1;
      tk.push({ t: 'num', v: texto.slice(desde, i), i: desde, f: i, l: linea });
      continue;
    }
    if (c === '"' || c === "'") {
      i += 1;
      while (i < n && texto[i] !== c && texto[i] !== '\n') i += texto[i] === '\\' ? 2 : 1;
      i = Math.min(n, i + 1);
      tk.push({ t: c === '"' ? 'str' : 'chr', v: texto.slice(desde, i), i: desde, f: i, l: linea });
      continue;
    }
    const p = PUNTUACION.find((s) => texto.startsWith(s, i)) ?? c;
    i += p.length;
    tk.push({ t: 'p', v: p, i: desde, f: i, l: linea });
  }
  return tk;
}

const ABRE = { '(': ')', '[': ']', '{': '}' };

// The index of what closes the bracket at `i`, or -1.
function cerrar(tk, i) {
  const pila = [];
  for (let k = i; k < tk.length; k += 1) {
    const v = tk[k].t === 'p' ? tk[k].v : '';
    if (ABRE[v]) pila.push(ABRE[v]);
    else if (v === ')' || v === ']' || v === '}') {
      if (pila.pop() !== v) return -1;
      if (!pila.length) return k;
    }
  }
  return -1;
}

// The next `que` (';', ',' or ')') outside brackets, from `i`: its index, or -1.
function siguiente(tk, i, que) {
  for (let k = i; k < tk.length; k += 1) {
    const v = tk[k].t === 'p' ? tk[k].v : '';
    if (v && que.includes(v)) return k;
    if (ABRE[v]) {
      k = cerrar(tk, k);
      if (k < 0) return -1;
    } else if (v === ')' || v === ']' || v === '}') return -1;
  }
  return -1;
}

class NoSigo extends Error {}
const exigir = (k) => {
  if (k < 0) throw new NoSigo();
  return k;
};

// Types, as the code writes them: { k: 'b', n } a number or a char (its kind, from the compiler), { k: 's', clave } a
// struct of the project (resolved to `sid` at the end), { k: 'o', n } something not opened, { k: 'p', a } a pointer,
// { k: 'a', de } an array, { k: 'fn' } a function, { k: 'v' } void.
const puntero = (a) => ({ k: 'p', a });

function conDeclarador(base, d, enParametro = false) {
  if (d.fn) return { k: 'fn' };
  let t = base;
  for (let k = 0; k < d.punteros; k += 1) t = puntero(t);
  for (let k = d.dims.length - 1; k >= 0; k -= 1) t = k === 0 && enParametro ? puntero(t) : { k: 'a', de: t };
  return t;
}

class Proyecto {
  constructor() {
    this.typedefs = new Map([...DE_LA_BIBLIOTECA.map((n) => [n, { k: 'b', n }]), ...OPACOS.map((n) => [n, { k: 'o', n }])]);
    this.structs = [];
    this.porClave = new Map();
    this.tipos = [];
  }

  esTipo = (n) => this.typedefs.has(n);

  // A struct, union or enum: with its body, it's defined here (fields included).
  compuesto(clase, tag, cuerpo, tk, archivo, local) {
    if (clase === 'enum') return { k: 'b', n: 'enum' };
    let clave = tag ? `${clase} ${tag}` : null;
    if (!cuerpo) return this.nuevoTipo({ k: 's', clave });
    const sid = this.structs.length;
    clave ??= `#${sid}`;
    const s = { sid, clave, tag, clase, nombre: tag, expresion: tag ? `${clase} ${tag}` : null, campos: [], local, archivo };
    this.structs.push(s);
    if (!this.porClave.has(clave) || !local) this.porClave.set(clave, sid);
    let i = cuerpo[0] + 1;
    while (i < cuerpo[1]) {
      const d = leerDeclaracion(tk, i, this, { archivo, local: true });
      if (!d) {
        i = exigir(siguiente(tk, i, ';')) + 1;
        continue;
      }
      for (const x of d.declaradores) if (x.nombre && !x.bits && !x.funcion) s.campos.push({ nombre: x.nombre, tipo: conDeclarador(d.base, x) });
      i = d.fin;
    }
    return this.nuevoTipo({ k: 's', clave });
  }

  nuevoTipo(t) {
    this.tipos.push(t);
    return t;
  }

  // Each struct type to its number, now that all are known; one that wasn't defined (a struct of the library) is closed.
  resolver() {
    for (const t of this.tipos) {
      const sid = this.porClave.get(t.clave);
      const s = sid === undefined ? null : this.structs[sid];
      if (s && (s.expresion || !s.local)) t.sid = sid;
      else Object.assign(t, { k: 'o', n: t.clave?.startsWith('#') ? 'struct' : t.clave });
    }
  }
}

// Specifiers: { base, i (after them), typedef, externo, texto (the type as written, without storage) } or null.
function leerEspecificadores(tk, i, py, { archivo, local }) {
  let base = null;
  let basicas = [];
  let visto = false;
  let typedef = false;
  let externo = false;
  const texto = [];
  while (i < tk.length && tk[i].t === 'id') {
    const v = tk[i].v;
    if (v === '__attribute__' || v === '__declspec' || v === '_Alignas') {
      i = exigir(cerrar(tk, i + 1)) + 1;
      continue;
    }
    if (CALIFICADORES.has(v)) {
      if (v === 'typedef') typedef = true;
      if (v === 'extern') externo = true;
      if (v === 'const' || v === 'volatile') texto.push(v);
      i += 1;
      continue;
    }
    if (v === 'struct' || v === 'union' || v === 'enum') {
      if (visto) break;
      i += 1;
      let tag = null;
      if (tk[i]?.t === 'id') {
        tag = tk[i].v;
        i += 1;
      }
      let cuerpo = null;
      if (tk[i]?.v === '{') {
        const fin = exigir(cerrar(tk, i));
        cuerpo = [i, fin];
        i = fin + 1;
      }
      base = py.compuesto(v, tag, cuerpo, tk, archivo, local);
      // Defined in the type of a return or with no name: it can't be written again.
      texto.push(tag ? `${v} ${tag}` : '?');
      visto = true;
      continue;
    }
    if (BASICAS.has(v)) {
      basicas.push(v);
      texto.push(v);
      visto = true;
      i += 1;
      continue;
    }
    if (!visto && py.esTipo(v)) {
      base = py.typedefs.get(v);
      texto.push(v);
      visto = true;
      i += 1;
      continue;
    }
    break;
  }
  if (!visto) return null;
  if (!base) base = basicas.length === 1 && basicas[0] === 'void' ? { k: 'v' } : { k: 'b', n: basicas.join(' ') };
  return { base, i, typedef, externo, texto: texto.join(' ') };
}

// One declarator: { nombre, tok, punteros, dims, fn, funcion: [abre, cierra] of its parameters, bits, i }.
function leerDeclarador(tk, i) {
  let punteros = 0;
  while (tk[i]?.v === '*' || (tk[i]?.t === 'id' && CALIFICADORES.has(tk[i].v))) {
    if (tk[i].v === '*') punteros += 1;
    i += 1;
  }
  const d = { nombre: null, tok: null, punteros, dims: [], fn: false, funcion: null, bits: false, i };
  if (tk[i]?.v === '(') {
    const fin = exigir(cerrar(tk, i));
    const nombre = tk.slice(i + 1, fin).find((x) => x.t === 'id' && !CALIFICADORES.has(x.v));
    Object.assign(d, { nombre: nombre?.v ?? null, tok: nombre ?? null, fn: true });
    i = fin + 1;
    while (tk[i]?.v === '(' || tk[i]?.v === '[') i = exigir(cerrar(tk, i)) + 1;
    d.i = i;
    return d;
  }
  if (tk[i]?.t === 'id') {
    d.nombre = tk[i].v;
    d.tok = tk[i];
    i += 1;
  }
  if (tk[i]?.v === '(') {
    const fin = exigir(cerrar(tk, i));
    d.funcion = [i, fin];
    i = fin + 1;
  }
  while (tk[i]?.v === '[') {
    const fin = exigir(cerrar(tk, i));
    d.dims.push([i, fin]);
    i = fin + 1;
  }
  while (tk[i]?.v === '__attribute__' || tk[i]?.v === '__asm__') i = exigir(cerrar(tk, i + 1)) + 1;
  if (tk[i]?.v === ':') {
    d.bits = true;
    i = exigir(siguiente(tk, i, ',;'));
  }
  d.i = i;
  return d;
}

// A declaration from `i`: { base, typedef, externo, texto, declaradores, fin (after its ';'), cuerpo (a function's
// body: [abre, cierra], then `fin` is after it) } or null if it isn't one.
function leerDeclaracion(tk, i, py, opciones) {
  const e = leerEspecificadores(tk, i, py, opciones);
  if (!e) return null;
  const declaradores = [];
  let j = e.i;
  if (tk[j]?.v === ';') return { ...e, declaradores, fin: j + 1, cuerpo: null };
  for (;;) {
    const d = leerDeclarador(tk, j);
    if (!d.nombre && !d.fn) return null;
    j = d.i;
    if (d.funcion && tk[j]?.v === '{' && !declaradores.length) {
      const fin = exigir(cerrar(tk, j));
      return { ...e, declaradores: [d], fin: fin + 1, cuerpo: [j, fin] };
    }
    if (tk[j]?.v === '=') {
      d.inicial = true;
      j = exigir(siguiente(tk, j + 1, ',;'));
    }
    declaradores.push(d);
    if (tk[j]?.v === ',') {
      j += 1;
      continue;
    }
    if (tk[j]?.v === ';') return { ...e, declaradores, fin: j + 1, cuerpo: null };
    return null;
  }
}

// The parameters between `abre` and `cierra`: [{ nombre, tipo, tok }].
function leerParametros(tk, abre, cierra, py, archivo) {
  const lista = [];
  let i = abre + 1;
  while (i < cierra) {
    const fin = exigir(siguiente(tk, i, ',)'));
    const e = leerEspecificadores(tk, i, py, { archivo, local: true });
    if (e) {
      const d = leerDeclarador(tk, e.i);
      if (d.nombre) lista.push({ nombre: d.nombre, tipo: conDeclarador(e.base, d, true), tok: d.tok });
    }
    i = fin + 1;
  }
  return lista;
}

// The `#include "…"` of a file: the names in the project, from its folder.
function incluidos(tk, desde) {
  const carpeta = desde.split('/').slice(0, -1);
  const lista = [];
  for (const x of tk) {
    const m = x.t === 'pp' && /^#\s*include\s*"([^"]+)"/.exec(x.v);
    if (!m) continue;
    const partes = [];
    for (const p of [...carpeta, ...m[1].split('/')]) {
      if (p === '..') partes.pop();
      else if (p && p !== '.') partes.push(p);
    }
    lista.push(partes.join('/'));
  }
  return lista;
}

// What each file gets before its code: the calls (imports of the module «laboratorio», cRastro.js) and the memory the
// program asks for, through them (malloc(n) is __lab_m(malloc(__lab_n(n))): n is said once, then where it went).
const NIVELES_C = 'unsigned long, int, unsigned long, int, unsigned long, int, unsigned long, int';
const PRELUDIO = [
  '#ifndef __LAB_PRELUDIO',
  '#define __LAB_PRELUDIO',
  '#define __LAB_I(n) __attribute__((import_module("laboratorio"), import_name(n)))',
  '__LAB_I("l") void __lab_l(int); __LAB_I("e") void __lab_e(int); __LAB_I("c") void __lab_c(void); __LAB_I("r0") void __lab_r0(void);',
  `__LAB_I("r") void __lab_r(void *, ${NIVELES_C});`,
  `__LAB_I("v") void __lab_v(int, void *, ${NIVELES_C});`,
  `__LAB_I("g") void __lab_g(int, void *, ${NIVELES_C});`,
  '__LAB_I("s") void __lab_s(int, unsigned long); __LAB_I("p") void __lab_p(int, void *);',
  `__LAB_I("f") void __lab_f(int, int, unsigned long, ${NIVELES_C});`,
  '__LAB_I("m") void *__lab_m(void *); __LAB_I("w") void *__lab_w(void *); __LAB_I("n") unsigned long __lab_n(unsigned long); __LAB_I("k") unsigned long __lab_k(unsigned long); __LAB_I("q") void *__lab_q(void *);',
  '#define __lab_malloc(n) __lab_m(malloc(__lab_n(n)))',
  '#define __lab_calloc(a, b) __lab_m(calloc(__lab_n(a), __lab_k(b)))',
  '#define __lab_realloc(p, n) __lab_w(realloc(__lab_q(p), __lab_n(n)))',
  '#define __lab_free(p) free(__lab_q(p))',
  '#define __LAB_T(x) _Generic((x), _Bool: 1, char: 2, signed char: 3, unsigned char: 4, short: 5, unsigned short: 6, int: 7, unsigned int: 8, long: 9, unsigned long: 10, long long: 11, unsigned long long: 12, float: 13, double: 14, long double: 15, default: 0)',
  '#endif',
].join('\n');

/** Each level of a value, for the compiler to measure: «sizeof(e), __LAB_T(e)» of `e`, `e[0]` or `(*e)`… */
export function niveles(expresion, tipo) {
  const pares = [];
  let e = expresion;
  let t = tipo;
  for (let n = 0; n < NIVELES; n += 1) {
    pares.push(`sizeof(${e}), __LAB_T(${e})`);
    if (t.k === 'a') {
      e = `${e}[0]`;
      t = t.de;
    } else if (t.k === 'p' && ['b', 'p', 'a'].includes(t.a.k)) {
      e = `(*${e})`;
      t = t.a;
    } else break;
  }
  while (pares.length < NIVELES) pares.push('0, 0');
  return pares.join(', ');
}

/**
 * The project ready for «Paso a paso»: { fuentes } (each `.c` with its calls; the `.h` as they are) and { mapa }, what
 * cRastro.js needs to read them: { funciones: [{ nombre, archivo, linea, retorno }], variables: [{ nombre, tipo,
 * archivo, desde, hasta, global }], structs: [{ nombre, campos: [{ nombre, tipo }] }] }. `fuentes` as proyectoDe gives
 * them.
 */
export function instrumentar(fuentes) {
  const py = new Proyecto();
  const mapa = { funciones: [], variables: [], structs: py.structs };
  const archivos = fuentes.map((f) => ({ ...f, tk: tokenizar(String(f.contenido)) }));
  const porNombre = new Map(archivos.map((a) => [a.nombre, a]));

  // First, every file at its top level: typedefs, structs, globals and where each function is.
  for (const a of archivos) {
    a.tops = [];
    const tk = a.tk.filter((x) => x.t !== 'pp');
    a.limpios = tk;
    let i = 0;
    while (i < tk.length) {
      if (tk[i].v === ';') {
        i += 1;
        continue;
      }
      let d = null;
      try {
        d = leerDeclaracion(tk, i, py, { archivo: a.nombre, local: false });
        // `main() {` without a type, as old C writes it.
        if (!d && tk[i].t === 'id' && tk[i + 1]?.v === '(') {
          const cierra = cerrar(tk, i + 1);
          if (cierra > 0 && tk[cierra + 1]?.v === '{') {
            const fin = exigir(cerrar(tk, cierra + 1));
            d = { base: { k: 'b', n: 'int' }, texto: 'int', typedef: false, externo: false, declaradores: [{ nombre: tk[i].v, tok: tk[i], punteros: 0, dims: [], funcion: [i + 1, cierra] }], fin: fin + 1, cuerpo: [cierra + 1, fin] };
          }
        }
      } catch (e) {
        if (!(e instanceof NoSigo)) throw e;
      }
      if (!d) {
        i += 1;
        continue;
      }
      if (d.typedef) {
        for (const x of d.declaradores) {
          if (!x.nombre) continue;
          const t = conDeclarador(d.base, x);
          py.typedefs.set(x.nombre, t);
          // `typedef struct { … } Alumno;`: the struct is called as its typedef.
          if (t.k === 's' && x.punteros === 0 && !x.dims.length) {
            const s = py.structs.find((z) => z.clave === t.clave);
            if (s) {
              s.nombre = x.nombre;
              s.expresion ??= x.nombre;
            }
          }
        }
      } else if (d.cuerpo) a.tops.push({ tipo: 'funcion', d });
      else if (!d.externo && a.nombre.endsWith('.c')) {
        for (const x of d.declaradores) if (x.nombre && !x.funcion) a.tops.push({ tipo: 'global', nombre: x.nombre, t: conDeclarador(d.base, x), tok: x.tok });
      }
      i = d.fin;
    }
  }

  // The structs each .c sees: its own and those of the headers of the project it includes.
  const visibles = (a) => {
    const vistos = new Set();
    const pendientes = [a.nombre];
    while (pendientes.length) {
      const n = pendientes.pop();
      if (vistos.has(n) || !porNombre.has(n)) continue;
      vistos.add(n);
      pendientes.push(...incluidos(porNombre.get(n).tk, n));
    }
    return py.structs.filter((s) => !s.local && vistos.has(s.archivo));
  };

  const resultado = [];
  const pendientes = [];
  for (const a of archivos) {
    const cambios = [];
    for (const top of a.tops) {
      if (top.tipo === 'funcion') {
        const propios = [];
        try {
          instrumentarFuncion(a, top.d, py, mapa, propios);
          cambios.push(...propios);
        } catch (e) {
          if (!(e instanceof NoSigo)) throw e;
        }
      }
    }
    // Memory the program asks for and gives back, through c/pasos.c.
    a.limpios.forEach((x, k) => {
      if (x.t === 'id' && MEMORIA.has(x.v) && a.limpios[k + 1]?.v === '(' && a.limpios[k - 1]?.v !== '.' && a.limpios[k - 1]?.v !== '->') cambios.push({ desde: x.i, hasta: x.f, texto: `__lab_${x.v}` });
    });
    pendientes.push({ a, cambios, globales: a.tops.filter((t) => t.tipo === 'global') });
  }
  py.resolver();

  for (const { a, cambios, globales } of pendientes) {
    // A header: its functions (some put them there), and nothing that runs before main.
    if (!a.nombre.endsWith('.c')) {
      resultado.push({ nombre: a.nombre, contenido: `${PRELUDIO}\n#line 1 "/home/alumno/${a.nombre}"\n${aplicar(a.contenido, cambios)}` });
      continue;
    }
    // Before main: the shape of each struct and where each global is.
    const inicio = [];
    for (const s of visibles(a)) {
      if (!s.expresion || s.clase !== 'struct' && s.clase !== 'union') continue;
      inicio.push(`__lab_s(${s.sid}, sizeof(${s.expresion}));`);
      s.campos.forEach((c, k) => {
        if (c.tipo.k === 'fn') return;
        const e = `((${s.expresion} *)0)->${c.nombre}`;
        inicio.push(`__lab_f(${s.sid}, ${k}, (unsigned long)&(${e}), ${niveles(e, c.tipo)});`);
      });
    }
    // Where each function of the file is, to name what a pointer to a function holds.
    mapa.funciones.forEach((f, fid) => {
      if (f.archivo === a.nombre && f.nombre !== 'main') inicio.push(`__lab_p(${fid}, (void *)${f.nombre});`);
    });
    for (const g of globales) {
      const id = mapa.variables.length;
      mapa.variables.push({ nombre: g.nombre, tipo: g.t, archivo: a.nombre, desde: 0, hasta: Infinity, global: true });
      inicio.push(`__lab_g(${id}, (void *)&${g.nombre}, ${niveles(g.nombre, g.t)});`);
    }
    const final = inicio.length ? `\n__attribute__((constructor)) static void __lab_inicio(void) { ${inicio.join(' ')} }\n` : '';
    resultado.push({ nombre: a.nombre, contenido: `${PRELUDIO}\n#line 1 "/home/alumno/${a.nombre}"\n${aplicar(a.contenido, cambios)}${final}` });
  }
  // The .c in the order they came (the main one first).
  const orden = new Map(fuentes.map((f, k) => [f.nombre, k]));
  resultado.sort((x, y) => orden.get(x.nombre) - orden.get(y.nombre));
  return { fuentes: resultado, mapa };
}

// The text with its changes: { desde, hasta, texto } (an insertion has desde === hasta). At one place, the insertions
// in the order they were made, before what replaces the code there.
function aplicar(texto, cambios) {
  const orden = cambios.map((c, k) => ({ ...c, k })).sort((x, y) => x.desde - y.desde || (x.hasta - x.desde) - (y.hasta - y.desde) || x.k - y.k);
  let fuera = '';
  let cursor = 0;
  for (const c of orden) {
    if (c.desde < cursor) continue;
    fuera += texto.slice(cursor, c.desde) + c.texto;
    cursor = c.hasta;
  }
  return fuera + texto.slice(cursor);
}

function instrumentarFuncion(a, d, py, mapa, cambios) {
  const tk = a.limpios;
  const decl = d.declaradores[0];
  const retorno = conDeclarador(d.base, { ...decl, funcion: null, fn: false });
  // The type of what it returns, written again for the variable that keeps it; null if it can't be.
  const sinValor = retorno.k === 'v';
  const textoRetorno = sinValor || d.texto.includes('?') ? null : `${d.texto} ${'*'.repeat(decl.punteros)}`;
  if (!sinValor && !textoRetorno) throw new NoSigo();
  const fid = mapa.funciones.length;
  const [abre, cierra] = d.cuerpo;
  mapa.funciones.push({ nombre: decl.nombre, archivo: a.nombre, linea: decl.tok.l, retorno: sinValor ? null : retorno });
  const insertar = (pos, texto) => cambios.push({ desde: pos, hasta: pos, texto });
  const variable = (nombre, tipo, desde, hasta) => {
    const id = mapa.variables.length;
    mapa.variables.push({ nombre, tipo, archivo: a.nombre, desde, hasta, global: false });
    return `__lab_v(${id}, (void *)&${nombre}, ${niveles(nombre, tipo)});`;
  };
  // `if (x) return 1;`: its body, on the line of the if, isn't another step.
  let sinPaso = null;
  const linea = (x) => {
    if (x !== sinPaso) insertar(x.i, `__lab_l(${x.l});`);
  };

  const params = leerParametros(tk, ...decl.funcion, py, a.nombre);
  const finDelCuerpo = tk[cierra].l;
  insertar(tk[abre].f, ` __lab_e(${fid}); ${params.map((p) => variable(p.nombre, p.tipo, decl.tok.l, finDelCuerpo)).join(' ')} __lab_c();`);
  insertar(tk[cierra].i, '__lab_r0(); ');

  // A statement as the body of an if, a for…: inside braces, to put its calls with it.
  const cuerpo = (i, hasta) => {
    if (tk[i]?.v === '{') return bloque(i);
    insertar(tk[i].i, '{ ');
    const j = sentencia(i, hasta);
    insertar(tk[j - 1].f, ' }');
    return j;
  };
  const bloque = (i) => {
    const fin = exigir(cerrar(tk, i));
    let j = i + 1;
    while (j < fin) j = sentencia(j, tk[fin].l);
    return fin + 1;
  };
  // The condition of a loop: each time it's checked is a step of its line.
  const condicion = (desde, hasta, l, antes = '') => {
    if (hasta > desde + 1) {
      insertar(tk[desde].f, `${antes}__lab_l(${l}), (`);
      insertar(tk[hasta].i, ')');
    } else insertar(tk[desde].f, `${antes}__lab_l(${l}), 1`);
  };
  const hastaPuntoYComa = (i) => exigir(siguiente(tk, i, ';')) + 1;

  // One statement from `i`, in a block that ends at line `hasta`: the index after it.
  function sentencia(i, hasta) {
    const x = tk[i];
    if (!x) throw new NoSigo();
    if (x.v === '{') return bloque(i);
    if (x.v === ';') return i + 1;
    if (x.t === 'id') {
      switch (x.v) {
        case 'if': {
          linea(x);
          const c = exigir(cerrar(tk, i + 1));
          if (tk[c + 1]?.l === x.l && tk[c + 1].v !== '{') sinPaso = tk[c + 1];
          let j = cuerpo(c + 1, hasta);
          if (tk[j]?.v === 'else') j = cuerpo(j + 1, hasta);
          return j;
        }
        case 'while': {
          const c = exigir(cerrar(tk, i + 1));
          condicion(i + 1, c, x.l);
          return cuerpo(c + 1, hasta);
        }
        case 'do': {
          const j = cuerpo(i + 1, hasta);
          if (tk[j]?.v !== 'while') throw new NoSigo();
          const c = exigir(cerrar(tk, j + 1));
          condicion(j + 1, c, tk[j].l);
          return hastaPuntoYComa(c + 1);
        }
        case 'for': {
          const c = exigir(cerrar(tk, i + 1));
          const p1 = exigir(siguiente(tk, i + 2, ';'));
          const p2 = exigir(siguiente(tk, p1 + 1, ';'));
          const j = cuerpo(c + 1, hasta);
          // `for (int i = 0; …)`: i lives in the loop; it's said where it is at each check.
          let antes = '';
          const dec = leerDeclaracion(tk, i + 2, py, { archivo: a.nombre, local: true });
          if (dec && dec.fin === p1 + 1 && !dec.typedef) {
            antes = dec.declaradores.filter((v) => !v.funcion).map((v) => variable(v.nombre, conDeclarador(dec.base, v), x.l, tk[j - 1].l)).filter(Boolean).map((s) => `${s.slice(0, -1)}, `).join('');
          }
          condicion(p1, p2, x.l, antes);
          return j;
        }
        case 'switch': {
          linea(x);
          const c = exigir(cerrar(tk, i + 1));
          return cuerpo(c + 1, hasta);
        }
        case 'case': {
          let j = i + 1;
          let preguntas = 0;
          while (j < tk.length && !(tk[j].v === ':' && preguntas === 0)) {
            if (tk[j].v === '?') preguntas += 1;
            if (tk[j].v === ':') preguntas -= 1;
            j += 1;
          }
          return exigir(j < tk.length ? j : -1) + 1;
        }
        case 'default':
          if (tk[i + 1]?.v === ':') return i + 2;
          break;
        case 'return': {
          linea(x);
          const fin = hastaPuntoYComa(i + 1) - 1;
          if (fin === i + 1 || sinValor) {
            insertar(x.i, '{ __lab_r0(); ');
            insertar(tk[fin].f, ' }');
          } else {
            cambios.push({ desde: x.i, hasta: x.f, texto: `{ ${textoRetorno} __lab_rv = (` });
            cambios.push({ desde: tk[fin].i, hasta: tk[fin].f, texto: `); __lab_r((void *)&__lab_rv, ${niveles('__lab_rv', retorno)}); return __lab_rv; }` });
          }
          return fin + 1;
        }
        case 'break':
        case 'continue':
        case 'goto':
          linea(x);
          return hastaPuntoYComa(i + 1);
        case 'else':
          throw new NoSigo();
        default:
      }
      // A label.
      if (tk[i + 1]?.v === ':' && !CONTROL.has(x.v)) return i + 2;
      // A declaration: with a known type, or a name followed by a name (a type of a #define).
      const pareceTipo = !CONTROL.has(x.v) && (py.esTipo(x.v) || BASICAS.has(x.v) || CALIFICADORES.has(x.v) || ['struct', 'union', 'enum'].includes(x.v) || (tk[i + 1]?.t === 'id' && !CONTROL.has(tk[i + 1].v)));
      if (pareceTipo) {
        let dec = leerDeclaracion(tk, i, py, { archivo: a.nombre, local: true });
        if (!dec && tk[i + 1]?.t === 'id' && !py.esTipo(x.v)) {
          py.typedefs.set(x.v, { k: 'b', n: x.v });
          dec = leerDeclaracion(tk, i, py, { archivo: a.nombre, local: true });
          py.typedefs.delete(x.v);
        }
        if (dec && !dec.cuerpo) {
          linea(x);
          if (dec.typedef) {
            for (const v of dec.declaradores) if (v.nombre) py.typedefs.set(v.nombre, conDeclarador(dec.base, v));
          } else if (!dec.externo) {
            const registros = dec.declaradores.filter((v) => v.nombre && !v.funcion).map((v) => variable(v.nombre, conDeclarador(dec.base, v), v.tok?.l ?? x.l, hasta));
            insertar(tk[dec.fin - 1].f, ` ${registros.join(' ')}`);
          }
          return dec.fin;
        }
      }
    }
    // Something to do: an assignment, a call…
    linea(x);
    return hastaPuntoYComa(i);
  }

  let j = abre + 1;
  while (j < cierra) j = sentencia(j, finDelCuerpo);
}
