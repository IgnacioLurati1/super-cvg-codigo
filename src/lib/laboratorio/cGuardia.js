// The guard of a C program, before it runs. WebAssembly doesn't stop a program that reads or writes at NULL: address 0
// is memory like any other (in xcc, the bottom of the stack). Here every load and store of the program goes first
// through a small check: below GUARDA it stops with the cause written in a global, «null pointer» or, if the stack
// pointer is down there too, «stack full». It also puts a ceiling on the memory, so a malloc() without end gets NULL
// instead of taking the browser's. The program's own functions keep their numbers (the new ones go last), so the names
// of the stack trace still match. If something in it isn't known here, it runs as it came, without the guard.

export const GUARDA = 4096;
export const FALLA = { NADA: 0, NULO: 1, PILA: 2 };
export const EXPORTES = { falla: '__laboratorio_falla', direccion: '__laboratorio_direccion', pila: '__laboratorio_pila' };

const I32 = 0x7f;
const I64 = 0x7e;
const F32 = 0x7d;
const F64 = 0x7c;

class Lector {
  constructor(bytes, desde = 0, hasta = bytes.length) {
    this.b = bytes;
    this.p = desde;
    this.fin = hasta;
  }

  byte() {
    if (this.p >= this.fin) throw new Error('fin');
    return this.b[this.p++];
  }

  u32() {
    let n = 0;
    let corrida = 0;
    for (;;) {
      const b = this.byte();
      n += (b & 0x7f) * 2 ** corrida;
      corrida += 7;
      if (!(b & 0x80)) return n;
      if (corrida > 35) throw new Error('leb');
    }
  }

  // A signed LEB of any length (i32, i64, s33): only skipped.
  saltarLeb() {
    for (let i = 0; i < 10; i += 1) if (!(this.byte() & 0x80)) return;
    throw new Error('leb');
  }

  nombre() {
    const n = this.u32();
    const t = new TextDecoder().decode(this.b.subarray(this.p, this.p + n));
    this.p += n;
    return t;
  }
}

const leb = (n) => {
  const salida = [];
  let v = n >>> 0;
  do {
    let b = v & 0x7f;
    v >>>= 7;
    if (v) b |= 0x80;
    salida.push(b);
  } while (v);
  return salida;
};
const nombre = (t) => {
  const b = new TextEncoder().encode(t);
  return [...leb(b.length), ...b];
};
const seccion = (id, cuerpo) => [id, ...leb(cuerpo.length), ...cuerpo];
const vector = (elementos) => [...leb(elementos.length), ...elementos.flat()];

// The width of the value each store writes: the check of a store keeps it on the stack, above its address.
const STORE = { 0x36: I32, 0x37: I64, 0x38: F32, 0x39: F64, 0x3a: I32, 0x3b: I32, 0x3c: I64, 0x3d: I64, 0x3e: I64 };

/** Reads the parts of the module that matter here. Throws if it isn't a module this understands. */
function leerModulo(bytes) {
  if (bytes[0] !== 0 || bytes[1] !== 0x61 || bytes[2] !== 0x73 || bytes[3] !== 0x6d || bytes[4] !== 1) throw new Error('magic');
  const secciones = [];
  const r = new Lector(bytes, 8);
  while (r.p < bytes.length) {
    const id = r.byte();
    const largo = r.u32();
    secciones.push({ id, desde: r.p, hasta: r.p + largo });
    r.p += largo;
  }
  return secciones;
}

function contarImportes(bytes, s) {
  const r = new Lector(bytes, s.desde, s.hasta);
  const cuantos = { funciones: 0, globales: 0 };
  for (let n = r.u32(); n > 0; n -= 1) {
    r.nombre();
    r.nombre();
    const tipo = r.byte();
    if (tipo === 0) {
      r.u32();
      cuantos.funciones += 1;
    } else if (tipo === 1) {
      r.byte();
      const f = r.byte();
      r.u32();
      if (f & 1) r.u32();
    } else if (tipo === 2) {
      const f = r.byte();
      r.u32();
      if (f & 1) r.u32();
    } else if (tipo === 3) {
      r.byte();
      r.byte();
      cuantos.globales += 1;
    } else if (tipo === 4) {
      r.byte();
      r.u32();
    } else throw new Error('import');
  }
  return cuantos;
}

/** The names of the functions and globals in the «name» section: { funciones: Map, globales: Map }. */
export function leerNombres(bytes) {
  const funciones = new Map();
  const globales = new Map();
  try {
    for (const s of leerModulo(bytes)) {
      if (s.id !== 0) continue;
      const r = new Lector(bytes, s.desde, s.hasta);
      if (r.nombre() !== 'name') continue;
      while (r.p < s.hasta) {
        const sub = r.byte();
        const fin = r.u32() + r.p;
        if (sub === 1 || sub === 7) {
          const lista = sub === 1 ? funciones : globales;
          for (let n = r.u32(); n > 0; n -= 1) lista.set(r.u32(), r.nombre());
        }
        r.p = fin;
      }
    }
  } catch {
    // Without names: the frames are said by number.
  }
  return { funciones, globales };
}

// Copies the instructions of one body, with a call to the check before each load and store. Throws on what it doesn't
// know (then the module runs without the guard).
function vigilarCuerpo(bytes, desde, hasta, chequeos) {
  const r = new Lector(bytes, desde, hasta);
  const salida = [];
  const copiar = (inicio) => {
    for (let i = inicio; i < r.p; i += 1) salida.push(bytes[i]);
  };
  // The locals, as they are.
  let inicio = r.p;
  for (let n = r.u32(); n > 0; n -= 1) {
    r.u32();
    r.byte();
  }
  copiar(inicio);
  while (r.p < hasta) {
    inicio = r.p;
    const op = r.byte();
    if (op >= 0x28 && op <= 0x3e) {
      salida.push(0x10, ...leb(op <= 0x35 ? chequeos.carga : chequeos.guardado[STORE[op]]));
      const alin = r.u32();
      if (alin & 0x40) r.u32();
      r.u32();
      copiar(inicio);
      continue;
    }
    switch (op) {
      case 0x02: case 0x03: case 0x04: case 0x06:
        r.saltarLeb();
        break;
      case 0x07: case 0x08: case 0x09: case 0x0c: case 0x0d: case 0x10: case 0x12: case 0x14: case 0x15: case 0x18:
      case 0x20: case 0x21: case 0x22: case 0x23: case 0x24: case 0x25: case 0x26: case 0xd2:
        r.u32();
        break;
      case 0x0e:
        for (let n = r.u32() + 1; n > 0; n -= 1) r.u32();
        break;
      case 0x11: case 0x13:
        r.u32();
        r.u32();
        break;
      case 0x1c:
        for (let n = r.u32(); n > 0; n -= 1) r.byte();
        break;
      case 0x3f: case 0x40:
        r.u32();
        break;
      case 0x41: case 0x42: case 0xd0:
        r.saltarLeb();
        break;
      case 0x43:
        r.p += 4;
        break;
      case 0x44:
        r.p += 8;
        break;
      case 0xfc: {
        const sub = r.u32();
        if (sub <= 7) break;
        if (sub === 10 || sub === 11) {
          salida.push(0x10, ...leb(sub === 10 ? chequeos.copia : chequeos.relleno));
          r.u32();
          if (sub === 10) r.u32();
        } else if (sub === 8 || sub === 12 || sub === 14) {
          r.u32();
          r.u32();
        } else if (sub === 9 || sub === 13 || (sub >= 15 && sub <= 17)) r.u32();
        else throw new Error(`0xfc ${sub}`);
        break;
      }
      default:
        if (op <= 0x01 || op === 0x05 || op === 0x0a || op === 0x0b || op === 0x0f || op === 0x19 || op === 0x1a || op === 0x1b || (op >= 0x45 && op <= 0xc4) || op === 0xd1) break;
        throw new Error(`op ${op}`);
    }
    copiar(inicio);
  }
  return salida;
}

/**
 * The program with its guard and its ceiling of memory (`paginas` of 64 KB), or the same bytes if it couldn't.
 * `pila`: where the stack starts (the --stack-size of the compiler), to tell its pointer among the globals.
 */
export function vigilar(bytes, { pila, paginas = 4096 } = {}) {
  try {
    return { bytes: armar(bytes, pila, paginas), vigilado: true };
  } catch {
    return { bytes, vigilado: false };
  }
}

function armar(bytes, pila, paginas) {
  const secciones = leerModulo(bytes);
  const de = (id) => secciones.find((s) => s.id === id);
  const tipos = de(1);
  const funcs = de(3);
  const globs = de(6);
  const exps = de(7);
  const codigo = de(10);
  const memoria = de(5);
  if (!tipos || !funcs || !globs || !exps || !codigo || !memoria) throw new Error('secciones');
  const importados = de(2) ? contarImportes(bytes, de(2)) : { funciones: 0, globales: 0 };

  const cuenta = (s) => new Lector(bytes, s.desde, s.hasta).u32();
  const nTipos = cuenta(tipos);
  const nFuncs = cuenta(funcs);

  // The stack pointer: by its name, or the global that starts where the stack does.
  const nombres = leerNombres(bytes);
  let sp = [...nombres.globales].find(([, n]) => n === '__stack_pointer')?.[0] ?? -1;
  const rg = new Lector(bytes, globs.desde, globs.hasta);
  const nGlobs = rg.u32();
  for (let i = 0; i < nGlobs; i += 1) {
    const tipo = rg.byte();
    const mutable = rg.byte();
    const op = rg.byte();
    let valor = null;
    if (op === 0x41) {
      const antes = rg.p;
      rg.saltarLeb();
      valor = signo(bytes.subarray(antes, rg.p));
    } else if (op === 0x42) rg.saltarLeb();
    else if (op === 0x43) rg.p += 4;
    else if (op === 0x44) rg.p += 8;
    else if (op === 0x23 || op === 0xd2) rg.u32();
    else throw new Error('global');
    if (rg.byte() !== 0x0b) throw new Error('global');
    if (sp < 0 && tipo === I32 && mutable && valor === pila) sp = importados.globales + i;
  }
  if (sp < 0) throw new Error('pila');
  const gFalla = importados.globales + nGlobs;
  const gDireccion = gFalla + 1;

  // The new types: (i32)→i32 for a load, (i32 T)→(i32 T) for a store, (i32 i32 i32)→same for memory.copy and fill.
  const tipoCarga = nTipos;
  const tipoGuardado = { [I32]: nTipos + 1, [I64]: nTipos + 2, [F32]: nTipos + 3, [F64]: nTipos + 4 };
  const tipoBloque = nTipos + 5;
  const nuevosTipos = [
    [0x60, 1, I32, 1, I32],
    ...[I32, I64, F32, F64].map((t) => [0x60, 2, I32, t, 2, I32, t]),
    [0x60, 3, I32, I32, I32, 3, I32, I32, I32],
  ];

  const primera = importados.funciones + nFuncs;
  const chequeos = { carga: primera, guardado: { [I32]: primera + 1, [I64]: primera + 2, [F32]: primera + 3, [F64]: primera + 4 }, copia: primera + 5, relleno: primera + 6 };

  // If address `local` is under the guard: the cause in its global, and stop.
  const revisar = (local) => [
    0x20, local, 0x41, ...lebS(GUARDA), 0x49, 0x04, 0x40,
    0x20, local, 0x24, ...leb(gDireccion),
    0x41, FALLA.PILA, 0x41, FALLA.NULO, 0x23, ...leb(sp), 0x41, ...lebS(GUARDA), 0x49, 0x1b, 0x24, ...leb(gFalla),
    0x00, 0x0b,
  ];
  const cuerpo = (instr) => {
    const b = [0, ...instr, 0x0b];
    return [...leb(b.length), ...b];
  };
  const nuevosCuerpos = [
    cuerpo([...revisar(0), 0x20, 0]),
    ...[I32, I64, F32, F64].map(() => cuerpo([...revisar(0), 0x20, 0, 0x20, 1])),
    // memory.copy(dst, src, n): both, if it copies something. memory.fill(dst, value, n): the first.
    cuerpo([0x20, 2, 0x04, 0x40, ...revisar(0), ...revisar(1), 0x0b, 0x20, 0, 0x20, 1, 0x20, 2]),
    cuerpo([0x20, 2, 0x04, 0x40, ...revisar(0), 0x0b, 0x20, 0, 0x20, 1, 0x20, 2]),
  ];
  const tiposDeNuevas = [tipoCarga, tipoGuardado[I32], tipoGuardado[I64], tipoGuardado[F32], tipoGuardado[F64], tipoBloque, tipoBloque];

  const rc = new Lector(bytes, codigo.desde, codigo.hasta);
  const nCuerpos = rc.u32();
  const cuerpos = [];
  for (let i = 0; i < nCuerpos; i += 1) {
    const largo = rc.u32();
    const vigilado = vigilarCuerpo(bytes, rc.p, rc.p + largo, chequeos);
    cuerpos.push([...leb(vigilado.length), ...vigilado]);
    rc.p += largo;
  }

  const salida = [...bytes.subarray(0, 8)];
  const resto = (s) => {
    const r = new Lector(bytes, s.desde, s.hasta);
    r.u32();
    return [...bytes.subarray(r.p, s.hasta)];
  };
  for (const s of secciones) {
    const original = [...bytes.subarray(s.desde, s.hasta)];
    if (s === tipos) salida.push(...seccion(1, [...leb(nTipos + nuevosTipos.length), ...resto(s), ...nuevosTipos.flat()]));
    else if (s === funcs) salida.push(...seccion(3, [...leb(nFuncs + tiposDeNuevas.length), ...resto(s), ...tiposDeNuevas.flatMap(leb)]));
    else if (s === memoria) salida.push(...seccion(5, techo(bytes, s, paginas)));
    else if (s === globs) salida.push(...seccion(6, [...leb(nGlobs + 2), ...resto(s), I32, 1, 0x41, 0, 0x0b, I32, 1, 0x41, 0, 0x0b]));
    else if (s === exps) {
      const nuevos = [[...nombre(EXPORTES.falla), 3, ...leb(gFalla)], [...nombre(EXPORTES.direccion), 3, ...leb(gDireccion)], [...nombre(EXPORTES.pila), 3, ...leb(sp)]];
      salida.push(...seccion(7, [...leb(cuenta(s) + nuevos.length), ...resto(s), ...nuevos.flat()]));
    } else if (s === codigo) salida.push(...seccion(10, vector([...cuerpos, ...nuevosCuerpos])));
    else salida.push(s.id, ...leb(original.length), ...original);
  }
  const final = new Uint8Array(salida);
  if (!WebAssembly.validate(final)) throw new Error('inválido');
  return final;
}

// The memory with its ceiling, unless it already has a lower one.
function techo(bytes, s, paginas) {
  const r = new Lector(bytes, s.desde, s.hasta);
  if (r.u32() !== 1) throw new Error('memorias');
  const flags = r.byte();
  if (flags & ~1) throw new Error('memoria');
  const min = r.u32();
  const max = flags & 1 ? r.u32() : Infinity;
  const tope = Math.max(min, Math.min(max, paginas));
  return [1, 1, ...leb(min), ...leb(tope)];
}

function lebS(n) {
  const salida = [];
  let v = n;
  for (;;) {
    const b = v & 0x7f;
    v >>= 7;
    if ((v === 0 && !(b & 0x40)) || (v === -1 && b & 0x40)) {
      salida.push(b);
      return salida;
    }
    salida.push(b | 0x80);
  }
}

function signo(b) {
  let n = 0;
  let corrida = 0;
  let ultimo = 0;
  for (const x of b) {
    n |= (x & 0x7f) << corrida;
    corrida += 7;
    ultimo = x;
  }
  if (corrida < 32 && ultimo & 0x40) n |= -1 << corrida;
  return n;
}
