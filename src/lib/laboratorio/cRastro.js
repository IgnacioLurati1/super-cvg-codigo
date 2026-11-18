// «Paso a paso» in C: what the program says at each step (the calls cPasos.js adds) turned into the trace of Python's
// (rastreo.js), which pasos.js reads: steps, frames with their variables, the objects they point to (arrays, structs,
// the memory of malloc) and what it printed up to each one. The values are read from the program's memory as each step
// happens, with what the compiler said of each type (its size and its kind).
import { compilar, correrPrograma } from './cMotor';
import { instrumentar } from './cPasos';
import { queDice } from './error';

// As rastreo.js: how long a value, how many elements, objects, frames and variables a step shows.
const LARGO = 60;
const ELEMENTOS = 40;
const OBJETOS = 60;
const MARCOS = 25;
const VARIABLES = 80;
// What system("cls") writes (c/apoyo.c): the steps don't clear what was printed.
const LIMPIAR = '\x1b[2J\x1b[H';

/** What stops the program when the steps reach their limit. */
export class Basta extends Error {}

// The kinds the compiler gives (__LAB_T of cPasos.js).
const KIND = { BOOL: 1, CHAR: 2, FLOAT: 13, DOUBLE: 14, LONG_DOUBLE: 15 };
const ENTEROS = {
  3: ['getInt8', 1], 4: ['getUint8', 1], 5: ['getInt16', 2], 6: ['getUint16', 2], 7: ['getInt32', 4], 8: ['getUint32', 4],
  9: ['getInt32', 4], 10: ['getUint32', 4], 11: ['getBigInt64', 8], 12: ['getBigUint64', 8],
};

const hex = (n) => `0x${(n >>> 0).toString(16)}`;
const ESCAPES = { 0: '\\0', 7: '\\a', 8: '\\b', 9: '\\t', 10: '\\n', 11: '\\v', 12: '\\f', 13: '\\r', 34: '\\"', 39: "\\'", 92: '\\\\' };

function caracter(c, comillas) {
  if (ESCAPES[c] && (c !== 34 || comillas === '"') && (c !== 39 || comillas === "'")) return ESCAPES[c];
  if (c >= 32 && c < 127) return String.fromCharCode(c);
  return `\\x${c.toString(16).padStart(2, '0')}`;
}

function real(n, simple) {
  if (!Number.isFinite(n)) return Number.isNaN(n) ? 'nan' : n > 0 ? 'inf' : '-inf';
  const t = simple ? String(Number(n.toPrecision(7))) : String(n);
  return /^-?\d+$/.test(t) ? `${t}.0` : t;
}

/**
 * The recorder of one run. `mapa` comes from instrumentar() (cPasos.js), `tope` is how many steps at most. It gives the
 * `imports` of the module «laboratorio», wants the program's exports (`usar`) and what it prints and reads (`escrito`,
 * `leido`); `terminar(r)` closes it with how the run ended, and `texto()` is the trace as JSON.
 */
export class Rastro {
  constructor(mapa, tope) {
    this.mapa = mapa;
    this.tope = tope;
    this.pasos = [];
    this.marcos = [];
    this.objetos = [];
    this.indiceMarcos = new Map();
    this.indiceObjetos = new Map();
    this.salida = [];
    this.escritos = 0;
    this.cortado = false;
    this.pila = [];
    this.globales = [];
    this.structs = [];
    this.bloques = new Map();
    this.funciones = new Map();
    this.serie = 0;
    this.numeros = new Map();
    this.cuantos = new Map();
    this.pedido = { n: 0, k: 1 };
    this.decodificadores = {};
    const niveles = (a) => [0, 2, 4, 6].map((k) => ({ s: a[k] >>> 0, t: a[k + 1] }));
    const marco = () => this.pila.at(-1);
    this.imports = {
      l: (linea) => {
        const m = marco();
        if (!m) return;
        m.linea = linea;
        this.paso('line');
      },
      e: (fid) => {
        const f = mapa.funciones[fid];
        this.pila.push({ f, vars: new Map(), linea: f?.linea ?? 0, serie: (this.serie += 1) });
      },
      c: () => this.paso('call'),
      r0: () => this.salir(null),
      r: (dir, ...n) => this.salir({ dir: dir >>> 0, niv: niveles(n) }),
      v: (id, dir, ...n) => marco()?.vars.set(id, { dir: dir >>> 0, niv: niveles(n) }),
      g: (id, dir, ...n) => this.globales.push({ id, dir: dir >>> 0, niv: niveles(n) }),
      s: (sid, tamano) => {
        this.structs[sid] ??= { tamano: tamano >>> 0, campos: [] };
      },
      f: (sid, k, desde, ...n) => {
        const s = this.structs[sid];
        if (s) s.campos[k] = { desde: desde >>> 0, niv: niveles(n) };
      },
      p: (fid, dir) => this.funciones.set(dir >>> 0, mapa.funciones[fid]?.nombre),
      // malloc(n), calloc(n, k), realloc(p, n) and free(p) (cPasos.js): what it asks for, in any order, then where.
      n: (n) => {
        this.pedido.n = n >>> 0;
        return n;
      },
      k: (k) => {
        this.pedido.k = k >>> 0;
        return k;
      },
      q: (p) => {
        const b = this.bloques.get(p >>> 0);
        this.bloques.delete(p >>> 0);
        this.pedido.antes = b?.serie;
        return p;
      },
      m: (p) => this.bloque(p, false),
      // realloc: the same block, even if it moved.
      w: (p) => this.bloque(p, true),
    };
  }

  bloque(p, mismo) {
    const { n, k, antes } = this.pedido;
    if (p) this.bloques.set(p >>> 0, { tamano: n * k, serie: mismo && antes ? antes : (this.serie += 1) });
    this.pedido = { n: 0, k: 1 };
    return p;
  }

  usar(exportes) {
    this.x = exportes;
  }

  corta = (e) => e instanceof Basta;

  anotar(flujo, texto) {
    if (!texto) return;
    const ultimo = this.salida.at(-1);
    if (ultimo && ultimo[0] === flujo) ultimo[1] += texto;
    else this.salida.push([flujo, texto]);
    this.escritos += texto.length;
  }

  /** What the program printed (fd 1 or 2). */
  escrito(fd, bytes) {
    const flujo = fd === 2 ? 'err' : 'out';
    this.decodificadores[flujo] ??= new TextDecoder();
    this.anotar(flujo, this.decodificadores[flujo].decode(bytes, { stream: true }).split(LIMPIAR).join(''));
  }

  /** What it read from the keyboard. */
  leido(bytes) {
    if (bytes?.length) this.anotar('in', new TextDecoder().decode(bytes));
  }

  salir(devuelto) {
    const m = this.pila.at(-1);
    if (!m) return;
    this.paso('return', devuelto);
    this.pila.pop();
  }

  // ---- Memory

  vista() {
    const buffer = this.x.memory.buffer;
    if (this.dv?.buffer !== buffer) this.dv = new DataView(buffer);
    return this.dv;
  }

  dentro = (dir, n) => dir > 0 && dir + n <= this.vista().byteLength;

  texto(dir, max) {
    const dv = this.vista();
    let t = '';
    for (let k = 0; k < max && dir + k < dv.byteLength; k += 1) {
      const c = dv.getUint8(dir + k);
      if (!c) return `"${t}"`;
      t += caracter(c, '"');
      if (t.length > LARGO) break;
    }
    return `"${t}`;
  }

  numero(dir, nivel) {
    const { s, t } = nivel;
    if (!this.dentro(dir, Math.max(s, 1))) return '?';
    const dv = this.vista();
    if (t === KIND.BOOL) return dv.getUint8(dir) ? 'true' : 'false';
    if (t === KIND.CHAR) return `'${caracter(dv.getUint8(dir), "'")}'`;
    if (t === KIND.FLOAT) return real(dv.getFloat32(dir, true), true);
    if ((t === KIND.DOUBLE || t === KIND.LONG_DOUBLE) && s === 8) return real(dv.getFloat64(dir, true), false);
    const entero = ENTEROS[t];
    if (entero && entero[1] === s) return String(dv[entero[0]](dir, true));
    return '?';
  }

  // The size of what a type takes, with what the compiler said of it at level `i`.
  tamano(tipo, niv, i) {
    if (tipo?.k === 's') return this.structs[tipo.sid]?.tamano ?? 0;
    return niv[i]?.s ?? 0;
  }

  // A text that tells apart what the same memory holds: `int`, `struct 2`, an array of 3 of them…
  firma(tipo, niv, i) {
    if (!tipo) return '?';
    if (tipo.k === 's') return `s${tipo.sid}`;
    if (tipo.k === 'a') return `a${niv[i]?.s}(${this.firma(tipo.de, niv, i + 1)})`;
    if (tipo.k === 'p') return `p(${this.firma(tipo.a, niv, i + 1)})`;
    return `${tipo.k}${niv[i]?.t ?? ''}`;
  }

  // The object of memory at `dir` seen as `tipo`, in its zone (each call and each block of malloc are another): its id.
  objeto(zona, dir, tipo, niv, i, pendientes) {
    const clave = `${zona}:${dir}:${this.firma(tipo, niv, i)}`;
    let o = this.numeros.get(clave);
    if (!o) {
      const struct = tipo.k === 's' ? this.mapa.structs[tipo.sid] : null;
      const clase = struct ? struct.nombre || struct.clase : 'arreglo';
      this.cuantos.set(clase, (this.cuantos.get(clase) ?? 0) + 1);
      o = { n: this.numeros.size + 1, clave, zona, dir, tipo, niv: niv.slice(i), clase, k: this.cuantos.get(clase), esStruct: Boolean(struct) };
      this.numeros.set(clave, o);
    }
    pendientes.push(o);
    return ['r', o.n];
  }

  // What's at `dir` with this type: as rastreo.js gives it ['v', …] or ['r', id].
  valor(zona, dir, tipo, niv, i, pendientes) {
    if (!tipo) return ['v', '?'];
    switch (tipo.k) {
      case 'b': {
        const nivel = niv[i] ?? { s: 0, t: 0 };
        // An enum is an int (xcc's _Generic doesn't say so).
        return ['v', this.numero(dir, tipo.n === 'enum' && !nivel.t && nivel.s === 4 ? { s: 4, t: 7 } : nivel)];
      }
      case 'a':
        // A char array is its text.
        if (tipo.de?.k === 'b' && niv[i + 1]?.t === KIND.CHAR) return ['v', this.dentro(dir, 1) ? this.texto(dir, niv[i]?.s ?? 0) : '?'];
        return this.objeto(zona, dir, tipo, niv, i, pendientes);
      case 's':
        return this.structs[tipo.sid] ? this.objeto(zona, dir, tipo, niv, i, pendientes) : ['v', '{…}'];
      case 'p': {
        if (!this.dentro(dir, 4)) return ['v', '?'];
        return this.apuntado(this.vista().getUint32(dir, true), tipo.a, niv, i + 1, pendientes);
      }
      case 'fn': {
        // A pointer to a function: its name.
        const f = this.dentro(dir, 4) ? this.vista().getUint32(dir, true) : -1;
        if (!f) return ['v', 'NULL'];
        return this.funciones.has(f) ? ['f', this.funciones.get(f)] : ['v', '?'];
      }
      case 'o':
        return ['v', tipo.n === 'FILE' ? 'archivo' : '…'];
      default:
        return ['v', '?'];
    }
  }

  // What a pointer holds: NULL, the text it points to (char *), the object (or the element of one), the variable
  // (&x) or, if it's none of those, its address.
  apuntado(q, tipo, niv, i, pendientes) {
    if (!q) return ['v', 'NULL'];
    if (tipo?.k === 'o') return ['v', tipo.n === 'FILE' ? 'archivo abierto' : hex(q)];
    if (tipo?.k === 'b' && niv[i]?.t === KIND.CHAR) return ['v', this.dentro(q, 1) ? this.texto(q, 4096) : hex(q)];
    if (!tipo || tipo.k === 'v' || tipo.k === 'fn') return ['v', hex(q)];
    const tamano = this.tamano(tipo, niv, i);
    // A block of malloc: an array of what the pointer points to, or the struct alone if it holds one.
    for (const [desde, b] of this.bloques) {
      if (q < desde || q >= desde + Math.max(b.tamano, 1)) continue;
      const zona = `h${b.serie}`;
      if (!tamano) return ['v', hex(q)];
      if (tipo.k === 's' && ((q - desde) % tamano || b.tamano <= tamano || q !== desde)) return this.objeto(zona, q, tipo, niv, i, pendientes);
      const cuantos = Math.floor(b.tamano / tamano);
      if (cuantos < 1) return ['v', hex(q)];
      return this.objeto(zona, desde, { k: 'a', de: tipo }, [{ s: cuantos * tamano, t: 0 }, ...niv.slice(i)], 0, pendientes);
    }
    // A variable: an array or struct is drawn; an element or a scalar are named.
    for (const v of this.vivas) {
      if (q < v.dir || q >= v.dir + Math.max(v.niv[0].s, 1)) continue;
      if (tipo.k === 's' && v.tipo.k !== 's') return this.objeto(v.zona, q, tipo, niv, i, pendientes);
      if (q === v.dir) {
        if (v.tipo.k === 'a' || v.tipo.k === 's') return this.valor(v.zona, v.dir, v.tipo, v.niv, 0, pendientes);
        return ['v', `&${v.nombre}`];
      }
      const paso = v.tipo.k === 'a' ? v.niv[1]?.s : 0;
      if (paso && (q - v.dir) % paso === 0) return ['v', `&${v.nombre}[${(q - v.dir) / paso}]`];
      return ['v', hex(q)];
    }
    return ['v', hex(q)];
  }

  foto(o, pendientes) {
    const d = { i: o.n, t: o.esStruct ? 'objeto' : 'arreglo', k: o.k };
    let mas = 0;
    if (o.esStruct) {
      d.c = o.clase;
      const s = this.structs[o.tipo.sid];
      const campos = this.mapa.structs[o.tipo.sid].campos;
      const pares = [];
      campos.forEach((c, k) => {
        const lugar = s.campos[k];
        if (lugar && c.tipo.k !== 'fn') pares.push([c.nombre, this.valor(o.zona, o.dir + lugar.desde, c.tipo, lugar.niv, 0, pendientes)]);
      });
      d.a = pares.slice(0, ELEMENTOS);
      mas = pares.length - ELEMENTOS;
    } else {
      const paso = this.tamano(o.tipo.de, o.niv, 1);
      const largo = paso ? Math.floor(o.niv[0].s / paso) : 0;
      d.e = [];
      for (let k = 0; k < Math.min(largo, ELEMENTOS); k += 1) d.e.push(this.valor(o.zona, o.dir + k * paso, o.tipo.de, o.niv, 1, pendientes));
      mas = largo - ELEMENTOS;
    }
    if (mas > 0) d.m = mas;
    return d;
  }

  guardar(tabla, indice, d) {
    const texto = JSON.stringify(d);
    let n = indice.get(texto);
    if (n === undefined) {
      n = tabla.length;
      indice.set(texto, n);
      tabla.push(texto);
    }
    return n;
  }

  // The variables a frame has at its line: the ones declared, while the line is in their block.
  // One that hides another with its name (a block inside) takes its place.
  variablesDe(m) {
    const porNombre = new Map();
    for (const [id, lugar] of m.vars) {
      const v = this.mapa.variables[id];
      if (v && m.linea >= v.desde && m.linea <= v.hasta) porNombre.set(v.nombre, { ...lugar, nombre: v.nombre, tipo: v.tipo, zona: `m${m.serie}` });
    }
    return [...porNombre.values()];
  }

  paso(evento, devuelto) {
    if (this.pasos.length >= this.tope) {
      this.cortado = true;
      throw new Basta();
    }
    // What's still in the buffer of the C library is printed before the step.
    this.x?.__laboratorio_vaciar?.();
    try {
      this.anotarPaso(evento, devuelto);
    } catch (e) {
      if (e instanceof Basta) throw e;
    }
  }

  anotarPaso(evento, devuelto) {
    const actual = this.pila.at(-1);
    let pila = this.pila;
    let ocultos = 0;
    if (pila.length > MARCOS + 1) {
      ocultos = pila.length - MARCOS - 1;
      pila = [pila[0], ...pila.slice(-MARCOS)];
    }
    const globales = this.globales.map((g) => ({ ...g, nombre: this.mapa.variables[g.id].nombre, tipo: this.mapa.variables[g.id].tipo, zona: 'g' }));
    const porMarco = pila.map((m) => this.variablesDe(m));
    // Every variable in sight, to name what a pointer points to.
    this.vivas = [...globales, ...this.pila.flatMap((m) => this.variablesDe(m))];
    const pendientes = [];
    const comoMarco = (vars) => {
      const v = vars.slice(0, VARIABLES).map((x) => [x.nombre, this.valor(x.zona, x.dir, x.tipo, x.niv, 0, pendientes)]);
      return vars.length > VARIABLES ? { v, m: vars.length - VARIABLES } : { v };
    };
    const marcos = [];
    if (globales.length) marcos.push(this.guardar(this.marcos, this.indiceMarcos, { f: 'Variables globales', a: actual?.f?.archivo ?? '', t: 'g', l: 0, ...comoMarco(globales) }));
    pila.forEach((m, k) => {
      marcos.push(this.guardar(this.marcos, this.indiceMarcos, { f: m.f?.nombre ?? '?', a: m.f?.archivo ?? '', t: 'f', l: m.linea, ...comoMarco(porMarco[k]) }));
    });
    const p = { e: evento, a: actual?.f?.archivo ?? '', l: actual?.linea ?? 0, s: this.escritos, m: marcos };
    if (ocultos) p.h = ocultos;
    if (evento === 'return') {
      if (devuelto && actual.f?.retorno) p.d = this.valor(`m${actual.serie}`, devuelto.dir, actual.f.retorno, devuelto.niv, 0, pendientes);
      else p.n = 1;
    }
    const objetos = [];
    const hechos = new Set();
    for (let k = 0; k < pendientes.length && objetos.length < OBJETOS; k += 1) {
      const o = pendientes[k];
      if (hechos.has(o.n)) continue;
      hechos.add(o.n);
      objetos.push(this.guardar(this.objetos, this.indiceObjetos, this.foto(o, pendientes)));
    }
    p.o = objetos;
    this.pasos.push(p);
  }

  /** The last step, «fin»: with how it ended ({ error, linea, archivo } if it broke). */
  terminar(r) {
    for (const flujo of Object.keys(this.decodificadores)) this.anotar(flujo, this.decodificadores[flujo].decode());
    const ultimo = this.pasos.at(-1);
    if (!ultimo || this.cortado) return;
    const error = typeof r?.error === 'string' && r.error.trim() ? r.error.trim() : '';
    // As the console says it (c.worker.js), without the line of the function: the step has it.
    if (error) this.anotar('err', `${queDice(r.error)}\n`);
    else if (r?.codigo) this.anotar('err', `El programa terminó con el código ${r.codigo}.\n`);
    // It broke in the line of the last step: the steps know it better than the error, which only knows the function.
    const fin = { e: 'fin', a: ultimo.a, l: ultimo.l, s: this.escritos, m: ultimo.m, o: ultimo.o };
    if (ultimo.h) fin.h = ultimo.h;
    if (error) fin.x = queDice(r.error);
    this.pasos.push(fin);
  }

  /** The trace, as rastreo.js writes it. */
  textoFinal() {
    return `{"pasos":${JSON.stringify(this.pasos)},"marcos":[${this.marcos.join(',')}],"objetos":[${this.objetos.join(',')}],"salida":${JSON.stringify(this.salida)},"tope":${this.cortado}}`;
  }
}

/**
 * «Paso a paso» of a project (proyectoDe): compiled with its calls (cPasos.js) and run recording each step. `leer`,
 * `escribir`, `pausa` and `ultimoError` as correrPrograma. Resolves { r } (as correrPrograma) and { pasos } (the trace,
 * as JSON), or null if the code with its calls doesn't compile (something cPasos.js can't follow).
 */
export async function grabar(c, proyecto, { tope, leer, escribir, pausa, ultimoError }) {
  const { fuentes, mapa } = instrumentar(proyecto.fuentes);
  const compilado = await compilar(c, { ...proyecto, fuentes });
  if (!compilado.programa) return null;
  const rastro = new Rastro(mapa, tope);
  const anotado = (b) => {
    rastro.leido(b);
    return b;
  };
  const r = await correrPrograma({
    programa: compilado.programa,
    fuentes: proyecto.fuentes,
    datos: proyecto.datos,
    nombre: proyecto.principal,
    pausa,
    ultimoError,
    rastro,
    leer: (n) => {
      const b = leer(n);
      return typeof b?.then === 'function' ? b.then(anotado) : anotado(b);
    },
    escribir: (fd, bytes) => {
      rastro.escrito(fd, bytes);
      escribir(fd, bytes);
    },
  });
  rastro.terminar(r);
  return { r, pasos: rastro.textoFinal() };
}
