// What the JavaScript of the lab finds ready before the student's program (jsMotor.js): `console` as Node writes it
// (`[ 1, 2, 3 ]`, `{ nombre: 'Ana' }`, `%d`, `console.table`), `prompt()` that reads from the console, `alert()` that
// prints, and the timers (`setTimeout`, `setInterval`), which jsMotor.js fires when the program is done. It is code
// that runs inside QuickJS, with the file name `<laboratorio>` so the errors leave its frames out; it takes what it
// needs from `__lab` (escribir, leer, sinEspera, limpiar, from jsMotor.js) and deletes it. The timers' control goes under
// RELOJES, for jsMotor.js.
export const RELOJES = 'laboratorio.relojes';

export const CONSOLA = String.raw`
(function (lab) {
  'use strict';
  const ANCHO = 72;
  const PROFUNDIDAD = 2;
  const MAX_ELEMENTOS = 100;
  const esIdentificador = (k) => /^[A-Za-z_$][\w$]*$/.test(k);
  const comillas = (s) => "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n') + "'";
  const clave = (k) => (typeof k === 'symbol' ? '[' + String(k) + ']' : esIdentificador(k) ? k : comillas(k));

  function claseDe(o) {
    const p = Object.getPrototypeOf(o);
    if (p === null) return '[Object: null prototype]';
    const c = Object.getOwnPropertyDescriptor(p, 'constructor');
    return c && typeof c.value === 'function' && c.value.name ? c.value.name : '';
  }

  function verFuncion(f) {
    let fuente = '';
    try {
      fuente = Function.prototype.toString.call(f);
    } catch (e) {
      fuente = '';
    }
    if (/^class\b/.test(fuente)) {
      const padre = Object.getPrototypeOf(f);
      return '[class ' + (f.name || '(anonymous)') + (padre && padre !== Function.prototype && padre.name ? ' extends ' + padre.name : '') + ']';
    }
    const tipo = (Object.getPrototypeOf(f) && Object.getPrototypeOf(f).constructor && Object.getPrototypeOf(f).constructor.name) || 'Function';
    return '[' + tipo + (f.name ? ': ' + f.name : ' (anonymous)') + ']';
  }

  function textoDeError(e) {
    let nombre = 'Error';
    let mensaje = '';
    try {
      nombre = String(e.name);
      mensaje = String(e.message);
    } catch (x) {
      // A getter that throws: the name alone.
    }
    return mensaje ? nombre + ': ' + mensaje : nombre;
  }

  function verError(e) {
    const marcos = typeof e.stack === 'string' ? e.stack.split('\n').filter((l) => l.trim() && !l.includes('<laboratorio>')) : [];
    return [textoDeError(e)].concat(marcos).join('\n');
  }

  // Several values in one line if they fit; if not, one under the other. Many short ones go in rows.
  function juntar(partes, abre, cierra, prefijo) {
    if (!partes.length) return prefijo + abre + cierra;
    const una = prefijo + abre + ' ' + partes.join(', ') + ' ' + cierra;
    if (una.length <= ANCHO && !una.includes('\n')) return una;
    let filas = partes;
    if (partes.length > 6 && partes.every((p) => p.length <= 16 && !p.includes('\n'))) {
      filas = [];
      let fila = '';
      for (const p of partes) {
        if (fila && fila.length + 2 + p.length > ANCHO - 2) {
          filas.push(fila);
          fila = p;
        } else fila = fila ? fila + ', ' + p : p;
      }
      filas.push(fila);
    }
    return prefijo + abre + '\n' + filas.map((p) => '  ' + p.split('\n').join('\n  ')).join(',\n') + '\n' + cierra;
  }

  function propiedad(o, k, nivel, vistos) {
    const d = Object.getOwnPropertyDescriptor(o, k);
    if (d && (d.get || d.set)) return clave(k) + ': ' + (d.get && d.set ? '[Getter/Setter]' : d.get ? '[Getter]' : '[Setter]');
    return clave(k) + ': ' + ver(o[k], nivel + 1, vistos, false);
  }

  function ver(v, nivel, vistos, arriba) {
    if (typeof v === 'string') return arriba ? v : comillas(v);
    if (typeof v === 'number') return Object.is(v, -0) ? '-0' : String(v);
    if (typeof v === 'bigint') return String(v) + 'n';
    if (typeof v === 'symbol' || typeof v === 'boolean' || v === undefined || v === null) return String(v);
    if (typeof v === 'function') return verFuncion(v);
    if (vistos.includes(v)) return '[Circular]';
    if (v instanceof Error) return arriba ? verError(v) : '[' + textoDeError(v) + ']';
    if (v instanceof Date) return isNaN(v.getTime()) ? 'Invalid Date' : v.toISOString();
    if (v instanceof RegExp) return String(v);
    if (v instanceof Promise) return 'Promise {}';
    if (v instanceof WeakMap || v instanceof WeakSet) return claseDe(v) + ' { <items unknown> }';
    const clase = claseDe(v);
    const esArreglo = Array.isArray(v) || (ArrayBuffer.isView(v) && !(v instanceof DataView));
    if (nivel > PROFUNDIDAD) return esArreglo ? '[Array]' : '[' + (clase || 'Object') + ']';
    const adentro = vistos.concat([v]);
    if (esArreglo) {
      const partes = [];
      let vacios = 0;
      const hasta = Math.min(v.length, MAX_ELEMENTOS);
      for (let i = 0; i < hasta; i++) {
        if (!(i in v)) {
          vacios++;
          continue;
        }
        if (vacios) partes.push('<' + vacios + ' empty item' + (vacios > 1 ? 's' : '') + '>');
        vacios = 0;
        partes.push(ver(v[i], nivel + 1, adentro, false));
      }
      if (vacios) partes.push('<' + vacios + ' empty item' + (vacios > 1 ? 's' : '') + '>');
      if (v.length > hasta) partes.push('... ' + (v.length - hasta) + ' more item' + (v.length - hasta > 1 ? 's' : ''));
      const prefijo = Array.isArray(v) ? (clase && clase !== 'Array' ? clase + '(' + v.length + ') ' : '') : clase + '(' + v.length + ') ';
      return juntar(partes, '[', ']', prefijo);
    }
    if (v instanceof Map) {
      const partes = [];
      for (const [k, x] of v) {
        if (partes.length >= MAX_ELEMENTOS) break;
        partes.push(ver(k, nivel + 1, adentro, false) + ' => ' + ver(x, nivel + 1, adentro, false));
      }
      return juntar(partes, '{', '}', clase + '(' + v.size + ') ');
    }
    if (v instanceof Set) {
      const partes = [];
      for (const x of v) {
        if (partes.length >= MAX_ELEMENTOS) break;
        partes.push(ver(x, nivel + 1, adentro, false));
      }
      return juntar(partes, '{', '}', clase + '(' + v.size + ') ');
    }
    const claves = Reflect.ownKeys(v).filter((k) => Object.getOwnPropertyDescriptor(v, k).enumerable);
    const partes = claves.slice(0, MAX_ELEMENTOS).map((k) => propiedad(v, k, nivel, adentro));
    if (claves.length > MAX_ELEMENTOS) partes.push('... ' + (claves.length - MAX_ELEMENTOS) + ' more items');
    return juntar(partes, '{', '}', clase && clase !== 'Object' ? clase + ' ' : '');
  }

  // As console.log in Node: %s, %d, %i, %f, %j, %o, %O and %c in the first text, and the rest after it.
  function formatear(args) {
    let i = 0;
    const partes = [];
    if (typeof args[0] === 'string' && args.length > 1 && args[0].includes('%')) {
      i = 1;
      partes.push(args[0].replace(/%([sdifjoOc%])/g, (todo, letra) => {
        if (letra === '%') return '%';
        if (i >= args.length) return todo;
        const a = args[i++];
        if (letra === 's') return typeof a === 'string' ? a : typeof a === 'bigint' ? a + 'n' : typeof a === 'object' && a !== null ? ver(a, 1, [], false) : String(a);
        if (letra === 'd') return typeof a === 'bigint' ? a + 'n' : typeof a === 'object' && a !== null ? 'NaN' : String(Number(a));
        if (letra === 'i') return typeof a === 'bigint' ? a + 'n' : String(parseInt(a, 10));
        if (letra === 'f') return String(parseFloat(a));
        if (letra === 'j') return JSON.stringify(a);
        if (letra === 'c') return '';
        return ver(a, 0, [], false);
      }));
    }
    for (; i < args.length; i++) partes.push(ver(args[i], 0, [], true));
    return partes.join(' ');
  }

  let sangria = '';
  const salir = (flujo, texto) => lab.escribir(flujo, (sangria ? texto.split('\n').map((l) => sangria + l).join('\n') : texto) + '\n');
  const cuentas = new Map();
  const tiempos = new Map();

  function tabla(datos, columnas) {
    if (datos === null || typeof datos !== 'object') return salir('out', formatear([datos]));
    const entradas = datos instanceof Map ? Array.from(datos.entries()).map(([k, x]) => [ver(k, 1, [], false), x]) : Object.keys(datos).map((k) => [k, datos[k]]);
    const claves = [];
    let valores = false;
    const filas = entradas.map(([indice, fila]) => {
      const celdas = new Map();
      if (fila !== null && typeof fila === 'object') {
        for (const k of Object.keys(fila)) {
          if (!claves.includes(k)) claves.push(k);
          celdas.set(k, ver(fila[k], 1, [], false).replace(/\s*\n\s*/g, ' '));
        }
      } else {
        valores = true;
        celdas.set(null, ver(fila, 1, [], false));
      }
      return [String(indice), celdas];
    });
    const cols = Array.isArray(columnas) ? columnas.map(String) : claves;
    const encabezado = ['(index)'].concat(cols, valores ? ['Values'] : []);
    const cuerpo = filas.map(([i, c]) => [i].concat(cols.map((k) => (c.has(k) ? c.get(k) : '')), valores ? [c.has(null) ? c.get(null) : ''] : []));
    const anchos = encabezado.map((e, j) => Math.max(e.length, ...cuerpo.map((f) => f[j].length)) + 2);
    const borde = (a, b, c) => a + anchos.map((w) => '─'.repeat(w)).join(b) + c;
    const renglon = (f) => '│' + f.map((t, j) => ' ' + t + ' '.repeat(anchos[j] - t.length - 1)).join('│') + '│';
    salir('out', [borde('┌', '┬', '┐'), renglon(encabezado), borde('├', '┼', '┤')].concat(cuerpo.map(renglon), [borde('└', '┴', '┘')]).join('\n'));
  }

  const out = (...a) => salir('out', formatear(a));
  const err = (...a) => salir('err', formatear(a));
  const consola = {
    log: out,
    info: out,
    debug: out,
    error: err,
    warn: err,
    trace: (...a) => salir('err', 'Trace' + (a.length ? ': ' + formatear(a) : '')),
    dir: (o) => salir('out', ver(o, 0, [], false)),
    assert: (condicion, ...a) => {
      if (!condicion) salir('err', 'Assertion failed' + (a.length ? ': ' + formatear(a) : ''));
    },
    clear: () => lab.limpiar(),
    group: (...a) => {
      if (a.length) out(...a);
      sangria += '  ';
    },
    groupEnd: () => {
      sangria = sangria.slice(2);
    },
    count: (e = 'default') => {
      cuentas.set(String(e), (cuentas.get(String(e)) || 0) + 1);
      salir('out', String(e) + ': ' + cuentas.get(String(e)));
    },
    countReset: (e = 'default') => cuentas.delete(String(e)),
    time: (e = 'default') => tiempos.set(String(e), Date.now()),
    timeLog: (e = 'default', ...a) => salir('out', String(e) + ': ' + (Date.now() - (tiempos.get(String(e)) || Date.now())) + 'ms' + (a.length ? ' ' + formatear(a) : '')),
    timeEnd: (e = 'default') => {
      salir('out', String(e) + ': ' + (Date.now() - (tiempos.get(String(e)) || Date.now())) + 'ms');
      tiempos.delete(String(e));
    },
    table: tabla,
  };
  consola.groupCollapsed = consola.group;
  globalThis.console = consola;

  // As the browser's: what the student types, or null if there's nothing to read. The question goes with a space after it.
  globalThis.prompt = function prompt(mensaje, porDefecto) {
    const pregunta = mensaje === undefined ? '' : String(mensaje);
    try {
      return lab.leer(pregunta && !/\s$/.test(pregunta) ? pregunta + ' ' : pregunta);
    } catch (e) {
      // After an await it can't wait: said also when the promise that breaks has nobody to catch it.
      lab.sinEspera(String(e.message), String(new Error().stack));
      throw e;
    }
  };
  globalThis.alert = function alert(mensaje) {
    salir('out', mensaje === undefined ? '' : String(mensaje));
  };

  // The timers, fired by jsMotor.js once the program is done: the next one when its time comes.
  const relojes = new Map();
  let siguiente = 1;
  function poner(f, ms, args, repetir) {
    if (typeof f !== 'function') throw new TypeError('The callback must be a function');
    const id = siguiente++;
    const espera = Math.max(0, Number(ms) || 0);
    relojes.set(id, { f, args, cuando: Date.now() + espera, cada: repetir ? Math.max(1, espera) : 0 });
    return id;
  }
  globalThis.setTimeout = (f, ms, ...args) => poner(f, ms, args, false);
  globalThis.setInterval = (f, ms, ...args) => poner(f, ms, args, true);
  globalThis.clearTimeout = (id) => {
    relojes.delete(id);
  };
  globalThis.clearInterval = globalThis.clearTimeout;
  const control = {
    espera() {
      let antes = Infinity;
      for (const r of relojes.values()) antes = Math.min(antes, r.cuando);
      return antes === Infinity ? -1 : Math.max(0, antes - Date.now());
    },
    disparar() {
      let elegido = null;
      for (const par of relojes) if (!elegido || par[1].cuando < elegido[1].cuando) elegido = par;
      if (!elegido || elegido[1].cuando > Date.now()) return;
      const [id, r] = elegido;
      if (r.cada) r.cuando += r.cada;
      else relojes.delete(id);
      r.f(...r.args);
    },
  };
  Object.defineProperty(globalThis, Symbol.for('laboratorio.relojes'), { value: control });
})(globalThis.__lab);
delete globalThis.__lab;
`;
