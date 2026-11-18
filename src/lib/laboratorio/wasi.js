// A small WASI (preview1) for the C of the lab, enough for the compiler and for the student's programs: the files live
// in memory (a Map of path to bytes), the program's input and output go to the functions it gets, and nothing reaches
// the network or the disk of the device. Whatever it asks that isn't here answers «not supported».

const E = { BIEN: 0, BADF: 8, EXIST: 20, INVAL: 28, ISDIR: 31, NOENT: 44, NOSPC: 51, NOSYS: 52, NOTDIR: 54, SPIPE: 70 };
const TIPO = { CARACTER: 2, DIRECTORIO: 3, ARCHIVO: 4, FLUJO: 6 };
const OFLAGS = { CREAR: 1, DIRECTORIO: 2, EXCLUSIVO: 4, TRUNCAR: 8 };
const FDFLAGS_AGREGAR = 1;
const DERECHOS = 0x1fffffffn;

/** The way out of a program: proc_exit (and exit() in C) throws it, with its code. */
export class Salida extends Error {
  constructor(codigo) {
    super(`exit ${codigo}`);
    this.codigo = codigo;
  }
}

const juntar = (base, ruta) => {
  const partes = [];
  for (const p of `${ruta.startsWith('/') ? '' : base}/${ruta}`.split('/')) {
    if (!p || p === '.') continue;
    if (p === '..') partes.pop();
    else partes.push(p);
  }
  return `/${partes.join('/')}`;
};

/**
 * The files in memory: path (absolute) to its bytes. Folders are what the paths have above them. `tope`, the bytes all
 * of them may take: past it, writing says the disk is full.
 */
export class Archivos {
  constructor(lista = [], { tope = Infinity } = {}) {
    this.datos = new Map(lista);
    this.tope = tope;
    this.total = 0;
    for (const b of this.datos.values()) this.total += b.length;
  }

  leer = (ruta) => this.datos.get(ruta) ?? null;

  escribir(ruta, bytes) {
    const nuevo = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes;
    this.total += nuevo.length - (this.datos.get(ruta)?.length ?? 0);
    this.datos.set(ruta, nuevo);
  }

  /** Writes `bytes` from `desde` on, growing the file into spare room (a file written in small pieces isn't copied
   * whole for each one). False if it doesn't fit under the limit. */
  escribirEn(ruta, desde, bytes) {
    const actual = this.datos.get(ruta) ?? new Uint8Array(0);
    const largo = Math.max(actual.length, desde + bytes.length);
    if (this.total - actual.length + largo > this.tope) return false;
    let nuevo;
    if (actual.byteOffset === 0 && actual.buffer.byteLength >= largo && this.propios?.has(actual.buffer)) {
      nuevo = new Uint8Array(actual.buffer, 0, largo);
    } else {
      const lugar = new ArrayBuffer(Math.max(largo, Math.min(largo * 2, largo + 16 * 1024 * 1024), 256));
      nuevo = new Uint8Array(lugar, 0, largo);
      nuevo.set(actual);
      (this.propios ??= new WeakSet()).add(lugar);
    }
    nuevo.set(bytes, desde);
    this.escribir(ruta, nuevo);
    return true;
  }

  borrar(ruta) {
    this.total -= this.datos.get(ruta)?.length ?? 0;
    return this.datos.delete(ruta);
  }

  esCarpeta(ruta) {
    if (ruta === '/') return true;
    const con = `${ruta}/`;
    for (const r of this.datos.keys()) if (r.startsWith(con)) return true;
    return false;
  }
}

/**
 * The imports `wasi_snapshot_preview1` of one run. `args` and `env` as the program gets them, `archivos` an Archivos,
 * `escribir(fd, bytes)` for what goes to 1 and 2, `leer(max)` for what it reads from 0: a Uint8Array, an empty one
 * at the end of the input, or a promise of one (then `fd_read` has to be a Suspending import, see `envolver`).
 * `usar(memoria)` once the instance is there. `archivosComoFlujo`: the files say they are streams, so the C library
 * of xcc marks the end of a file only when a read finds nothing, as gcc's does (and `while (!feof(f))` reads as in class).
 */
export function crearWasi({ args = [], env = {}, archivos, escribir, leer, archivosComoFlujo = false }) {
  let memoria = null;
  const vista = () => new DataView(memoria.buffer);
  const bytes = () => new Uint8Array(memoria.buffer);
  const texto = (ptr, largo) => new TextDecoder().decode(bytes().slice(ptr, ptr + largo));
  const codificar = (t) => new TextEncoder().encode(t);

  // 0, 1 and 2 are the console; 3 is «/» and 4 is «.», the student's folder.
  const CASA = '/home/alumno';
  const abiertos = new Map([
    [0, { tipo: TIPO.FLUJO }],
    [1, { tipo: TIPO.FLUJO }],
    [2, { tipo: TIPO.FLUJO }],
    [3, { tipo: TIPO.DIRECTORIO, ruta: '/', nombre: '/' }],
    [4, { tipo: TIPO.DIRECTORIO, ruta: CASA, nombre: '.' }],
  ]);
  let siguiente = 5;
  // What was read from 0 and not delivered yet: a line comes whole, and the program may ask for less.
  let resto = new Uint8Array(0);

  const listas = (iovs, cuantos) => {
    const v = vista();
    return Array.from({ length: cuantos }, (_, i) => ({ ptr: v.getUint32(iovs + i * 8, true), largo: v.getUint32(iovs + i * 8 + 4, true) }));
  };

  const repartir = (iovs, cuantos, origen) => {
    let dado = 0;
    for (const { ptr, largo } of listas(iovs, cuantos)) {
      const n = Math.min(largo, origen.length - dado);
      if (n <= 0) break;
      bytes().set(origen.subarray(dado, dado + n), ptr);
      dado += n;
    }
    return dado;
  };

  const estado = (buf, tipo, largo) => {
    const v = vista();
    for (let i = 0; i < 64; i += 8) v.setBigUint64(buf + i, 0n, true);
    v.setUint8(buf + 16, tipo);
    v.setBigUint64(buf + 24, 1n, true);
    v.setBigUint64(buf + 32, BigInt(largo), true);
  };

  const deStdin = (iovs, cuantos, nleido) => {
    const entregar = (llegado) => {
      if (llegado && llegado.length) resto = resto.length ? concatenar(resto, llegado) : llegado;
      const n = repartir(iovs, cuantos, resto);
      resto = resto.subarray(n);
      vista().setUint32(nleido, n, true);
      return E.BIEN;
    };
    if (resto.length) return entregar(null);
    const llegado = leer(listas(iovs, cuantos).reduce((n, l) => n + l.largo, 0));
    return llegado && typeof llegado.then === 'function' ? llegado.then(entregar) : entregar(llegado);
  };

  const funciones = {
    args_sizes_get(argc, largo) {
      const v = vista();
      v.setUint32(argc, args.length, true);
      v.setUint32(largo, args.reduce((n, a) => n + codificar(a).length + 1, 0), true);
      return E.BIEN;
    },
    args_get(argv, buf) {
      const v = vista();
      let lugar = buf;
      args.forEach((a, i) => {
        const b = codificar(`${a}\0`);
        bytes().set(b, lugar);
        v.setUint32(argv + i * 4, lugar, true);
        lugar += b.length;
      });
      return E.BIEN;
    },
    environ_sizes_get(cuantos, largo) {
      const pares = Object.entries(env).map(([k, val]) => `${k}=${val}`);
      const v = vista();
      v.setUint32(cuantos, pares.length, true);
      v.setUint32(largo, pares.reduce((n, p) => n + codificar(p).length + 1, 0), true);
      return E.BIEN;
    },
    environ_get(lista, buf) {
      const v = vista();
      let lugar = buf;
      Object.entries(env).forEach(([k, val], i) => {
        const b = codificar(`${k}=${val}\0`);
        bytes().set(b, lugar);
        v.setUint32(lista + i * 4, lugar, true);
        lugar += b.length;
      });
      return E.BIEN;
    },
    fd_prestat_get(fd, buf) {
      const a = abiertos.get(fd);
      if (!a?.nombre || fd > 4) return E.BADF;
      const v = vista();
      v.setUint32(buf, 0, true);
      v.setUint32(buf + 4, codificar(a.nombre).length, true);
      return E.BIEN;
    },
    fd_prestat_dir_name(fd, ptr, largo) {
      const a = abiertos.get(fd);
      if (!a?.nombre || fd > 4) return E.BADF;
      bytes().set(codificar(a.nombre).subarray(0, largo), ptr);
      return E.BIEN;
    },
    fd_write(fd, iovs, cuantos, nescrito) {
      const partes = listas(iovs, cuantos).map(({ ptr, largo }) => bytes().slice(ptr, ptr + largo));
      const todo = partes.length === 1 ? partes[0] : concatenar(...partes);
      if (fd === 1 || fd === 2) escribir(fd, todo);
      else {
        const a = abiertos.get(fd);
        if (!a || a.tipo !== TIPO.ARCHIVO) return E.BADF;
        const desde = a.agregar ? archivos.leer(a.ruta)?.length ?? 0 : a.lugar;
        if (!archivos.escribirEn(a.ruta, desde, todo)) return E.NOSPC;
        a.lugar = desde + todo.length;
      }
      vista().setUint32(nescrito, todo.length, true);
      return E.BIEN;
    },
    fd_read(fd, iovs, cuantos, nleido) {
      if (fd === 0) return deStdin(iovs, cuantos, nleido);
      const a = abiertos.get(fd);
      if (!a || a.tipo !== TIPO.ARCHIVO) return E.BADF;
      const datos = archivos.leer(a.ruta) ?? new Uint8Array(0);
      const n = repartir(iovs, cuantos, datos.subarray(a.lugar));
      a.lugar += n;
      vista().setUint32(nleido, n, true);
      return E.BIEN;
    },
    fd_seek(fd, desplazamiento, desde, nuevo) {
      const a = abiertos.get(fd);
      if (!a) return E.BADF;
      // To the end of the keyboard: what's left of the line goes away (fflush(stdin), c/apoyo.c).
      if (fd === 0 && desde === 2) resto = new Uint8Array(0);
      if (a.tipo !== TIPO.ARCHIVO) return E.SPIPE;
      const largo = archivos.leer(a.ruta)?.length ?? 0;
      const base = desde === 0 ? 0 : desde === 1 ? a.lugar : largo;
      const lugar = base + Number(desplazamiento);
      if (lugar < 0) return E.INVAL;
      a.lugar = lugar;
      vista().setBigUint64(nuevo, BigInt(lugar), true);
      return E.BIEN;
    },
    fd_tell(fd, nuevo) {
      const a = abiertos.get(fd);
      if (!a || a.tipo !== TIPO.ARCHIVO) return E.BADF;
      vista().setBigUint64(nuevo, BigInt(a.lugar), true);
      return E.BIEN;
    },
    fd_close(fd) {
      if (fd <= 4) return fd >= 0 ? E.BIEN : E.BADF;
      return abiertos.delete(fd) ? E.BIEN : E.BADF;
    },
    fd_filestat_get(fd, buf) {
      const a = abiertos.get(fd);
      if (!a) return E.BADF;
      // The console is a stream: the C library then reads what there is without taking a short line for the end.
      const tipo = a.tipo === TIPO.ARCHIVO && archivosComoFlujo ? TIPO.FLUJO : a.tipo;
      estado(buf, tipo, a.tipo === TIPO.ARCHIVO ? archivos.leer(a.ruta)?.length ?? 0 : 0);
      return E.BIEN;
    },
    fd_fdstat_get(fd, buf) {
      const a = abiertos.get(fd);
      if (!a) return E.BADF;
      const v = vista();
      v.setUint8(buf, fd <= 2 ? TIPO.CARACTER : a.tipo);
      v.setUint16(buf + 2, a.agregar ? FDFLAGS_AGREGAR : 0, true);
      v.setBigUint64(buf + 8, DERECHOS, true);
      v.setBigUint64(buf + 16, DERECHOS, true);
      return E.BIEN;
    },
    fd_fdstat_set_flags(fd, flags) {
      const a = abiertos.get(fd);
      if (!a) return E.BADF;
      if (a.tipo === TIPO.ARCHIVO) a.agregar = Boolean(flags & FDFLAGS_AGREGAR);
      return E.BIEN;
    },
    fd_sync: () => E.BIEN,
    fd_datasync: () => E.BIEN,
    path_open(dirfd, _dirflags, ptr, largo, oflags, _derechos, _heredados, fdflags, fdOut) {
      const dir = abiertos.get(dirfd);
      if (!dir || dir.tipo !== TIPO.DIRECTORIO) return E.BADF;
      const ruta = juntar(dir.ruta, texto(ptr, largo));
      const hay = archivos.leer(ruta);
      if (archivos.esCarpeta(ruta)) {
        if (oflags & (OFLAGS.CREAR | OFLAGS.TRUNCAR)) return E.ISDIR;
        abiertos.set(siguiente, { tipo: TIPO.DIRECTORIO, ruta });
      } else {
        if (oflags & OFLAGS.DIRECTORIO) return hay ? E.NOTDIR : E.NOENT;
        if (hay && oflags & OFLAGS.CREAR && oflags & OFLAGS.EXCLUSIVO) return E.EXIST;
        if (!hay && !(oflags & OFLAGS.CREAR)) return E.NOENT;
        if (!hay || oflags & OFLAGS.TRUNCAR) archivos.escribir(ruta, new Uint8Array(0));
        abiertos.set(siguiente, { tipo: TIPO.ARCHIVO, ruta, lugar: 0, agregar: Boolean(fdflags & FDFLAGS_AGREGAR) });
      }
      vista().setUint32(fdOut, siguiente, true);
      siguiente += 1;
      return E.BIEN;
    },
    path_filestat_get(dirfd, _flags, ptr, largo, buf) {
      const dir = abiertos.get(dirfd);
      if (!dir || dir.tipo !== TIPO.DIRECTORIO) return E.BADF;
      const ruta = juntar(dir.ruta, texto(ptr, largo));
      const hay = archivos.leer(ruta);
      if (hay) estado(buf, TIPO.ARCHIVO, hay.length);
      else if (archivos.esCarpeta(ruta)) estado(buf, TIPO.DIRECTORIO, 0);
      else return E.NOENT;
      return E.BIEN;
    },
    path_unlink_file(dirfd, ptr, largo) {
      const dir = abiertos.get(dirfd);
      if (!dir || dir.tipo !== TIPO.DIRECTORIO) return E.BADF;
      return archivos.borrar(juntar(dir.ruta, texto(ptr, largo))) ? E.BIEN : E.NOENT;
    },
    path_rename(dirfd, ptr, largo, otrofd, ptr2, largo2) {
      const a = abiertos.get(dirfd);
      const b = abiertos.get(otrofd);
      if (a?.tipo !== TIPO.DIRECTORIO || b?.tipo !== TIPO.DIRECTORIO) return E.BADF;
      const de = juntar(a.ruta, texto(ptr, largo));
      const datos = archivos.leer(de);
      if (!datos) return E.NOENT;
      archivos.borrar(de);
      archivos.escribir(juntar(b.ruta, texto(ptr2, largo2)), datos);
      return E.BIEN;
    },
    path_create_directory: () => E.BIEN,
    random_get(ptr, largo) {
      const b = new Uint8Array(largo);
      for (let i = 0; i < largo; i += 65_536) crypto.getRandomValues(b.subarray(i, Math.min(largo, i + 65_536)));
      bytes().set(b, ptr);
      return E.BIEN;
    },
    clock_time_get(id, _precision, ptr) {
      const ns = id === 0 ? BigInt(Date.now()) * 1_000_000n : BigInt(Math.round(performance.now() * 1e6));
      vista().setBigUint64(ptr, ns, true);
      return E.BIEN;
    },
    clock_res_get(_id, ptr) {
      vista().setBigUint64(ptr, 1000n, true);
      return E.BIEN;
    },
    sched_yield: () => E.BIEN,
    proc_exit(codigo) {
      throw new Salida(codigo);
    },
  };

  return {
    funciones,
    usar(m) {
      memoria = m;
    },
    /** The import object for `modulo`: what it asks that isn't here answers ENOSYS. `suspender` wraps `fd_read`. */
    importsPara(modulo, suspender = null) {
      const wasi = {};
      for (const i of WebAssembly.Module.imports(modulo)) {
        if (i.module !== 'wasi_snapshot_preview1' || i.kind !== 'function') continue;
        wasi[i.name] = Object.hasOwn(funciones, i.name) ? funciones[i.name] : () => E.NOSYS;
      }
      if (suspender && wasi.fd_read) wasi.fd_read = suspender(wasi.fd_read);
      return { wasi_snapshot_preview1: wasi };
    },
  };
}

function concatenar(...partes) {
  const todo = new Uint8Array(partes.reduce((n, p) => n + p.length, 0));
  let lugar = 0;
  for (const p of partes) {
    todo.set(p, lugar);
    lugar += p.length;
  }
  return todo;
}
