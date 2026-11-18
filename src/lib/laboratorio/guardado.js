import { cambiarMio, mioActual } from '../mio';
import { LENGUAJES } from './lenguajes';
import { cabeArchivo, cabenCasos, esExtension, MAX_PROYECTOS, nombreValido, sanearArchivo, sanearCasos, sanearProyecto } from './saneo';

// The student's files of the lab, in what they add (mio.js): saved, changed and deleted from here. Each change goes
// through sanearMio and is noted for their Drive, like the rest of what's theirs.

const idNuevo = () => `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** A file of their own from what's on screen. Returns its id, or null if it doesn't fit or couldn't be saved. */
export function guardarArchivoNuevo({ nombre, lenguaje, codigo, materia = null }, ahora = Date.now()) {
  const lista = mioActual().laboratorio;
  const archivo = sanearArchivo({ id: idNuevo(), nombre, lenguaje, codigo, materia, creado: ahora, cambiado: ahora });
  if (!archivo || archivo.codigo.length !== String(codigo).replace(/\r\n?/g, '\n').length || !cabeArchivo(lista, archivo.codigo.length)) return null;
  return cambiarMio((m) => ({ ...m, laboratorio: [...m.laboratorio, archivo] })) ? archivo.id : null;
}

/** Changes its name, language, code or course. False if it isn't there, doesn't fit or couldn't be saved. */
export function cambiarArchivo(id, cambios, ahora = Date.now()) {
  const lista = mioActual().laboratorio;
  const viejo = lista.find((a) => a.id === id);
  if (!viejo) return false;
  const nuevo = sanearArchivo({ ...viejo, ...cambios, id, creado: viejo.creado, cambiado: ahora });
  if (!nuevo || ('codigo' in cambios && nuevo.codigo.length !== String(cambios.codigo).replace(/\r\n?/g, '\n').length) || !cabeArchivo(lista, nuevo.codigo.length, id)) return false;
  return cambiarMio((m) => ({ ...m, laboratorio: m.laboratorio.map((a) => (a.id === id ? nuevo : a)) }));
}

export const borrarArchivo = (id) => cambiarMio((m) => ({ ...m, laboratorio: m.laboratorio.filter((a) => a.id !== id) }));

/** A name for a file that has none yet, from what its code does: the first function, or the first table it reads. */
export function nombreSugerido(codigo, lenguaje, lista = []) {
  const t = String(codigo ?? '');
  const visto = lenguaje === 'python'
    ? /^\s*def\s+(\w+)/m.exec(t)?.[1] ?? /^\s*class\s+(\w+)/m.exec(t)?.[1]
    : lenguaje === 'javascript'
      ? /\bfunction\s+([\w$]+)/.exec(t)?.[1] ?? /\b(?:const|let)\s+([\w$]+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[\w$]+)\s*=>/.exec(t)?.[1] ?? /\bclass\s+([\w$]+)/.exec(t)?.[1]
      : /\bfrom\s+(\w+)/i.exec(t)?.[1] ?? /\b(?:into|table|update)\s+(\w+)/i.exec(t)?.[1];
  const base = nombreValido(visto ? visto.replace(/_/g, ' ') : 'Prueba');
  const usados = new Set(lista.map((a) => a.nombre.toLowerCase()));
  if (!usados.has(base.toLowerCase()) && visto) return base;
  for (let n = 1; ; n += 1) if (!usados.has(`${base} ${n}`.toLowerCase())) return `${base} ${n}`;
}

/** The name the engine shows in a traceback: the file's own, as a name a file can have. `ext`: its own, if it says one. */
export function nombreDeArchivo(nombre, lenguaje, ext = null) {
  const limpio = String(nombre ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
  return `${limpio || 'tu_codigo'}.${ext ?? LENGUAJES[lenguaje]?.extension ?? 'txt'}`;
}

// Projects (docs/laboratorio-ide.md): several files that run together, with one that runs (`principal`). A file
// on its own, as they all were before, becomes one when the student adds a second file to it.
const idDeProyecto = () => `q${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** The files of a project, in the order they were made. */
export const archivosDe = (mio, proyecto) => mio.laboratorio.filter((a) => a.proyecto === proyecto);

/** Its file name, as the engine sees it. */
export const nombreEnProyecto = (a) => nombreDeArchivo(a.nombre, a.lenguaje, a.ext ?? null);

/** Whether `nombre.ext` is free among `archivos` (but `menos`, the one being renamed). */
export function nombreLibre(archivos, nombre, lenguaje, ext, menos = null) {
  const buscado = nombreDeArchivo(nombre, lenguaje, ext).toLowerCase();
  return !archivos.some((a) => a.id !== menos && nombreEnProyecto(a).toLowerCase() === buscado);
}

/**
 * A new project. `desde`: a file on its own that goes into it as the one that runs. Returns its id, or null if it
 * couldn't be saved.
 */
export function crearProyecto({ nombre, lenguaje, materia = null }, desde = null, ahora = Date.now()) {
  const m = mioActual();
  const archivo = desde ? m.laboratorio.find((a) => a.id === desde && !a.proyecto) : null;
  if (desde && !archivo) return null;
  // Its test cases go with it: in a project, they're the project's.
  const proyecto = sanearProyecto({ id: idDeProyecto(), nombre, lenguaje: archivo?.lenguaje ?? lenguaje, materia: archivo?.materia ?? materia, principal: archivo?.id ?? null, creado: ahora, cambiado: ahora, casos: archivo?.casos });
  if (!proyecto || m.proyectosLab.length >= MAX_PROYECTOS) return null;
  const ok = cambiarMio((x) => ({
    ...x,
    proyectosLab: [...x.proyectosLab, proyecto],
    laboratorio: archivo
      ? x.laboratorio.map((a) => {
        if (a.id !== archivo.id) return a;
        const { casos: _delProyecto, ...resto } = a;
        return { ...resto, proyecto: proyecto.id, cambiado: ahora };
      })
      : x.laboratorio,
  }));
  return ok ? proyecto.id : null;
}

/**
 * A new file in a project: code of its language, a header or data (`ext`). Returns its id, or null if the name is
 * taken, it doesn't fit or couldn't be saved.
 */
export function agregarAlProyecto(proyecto, { nombre, ext, codigo = '' }, ahora = Date.now()) {
  const m = mioActual();
  const p = m.proyectosLab.find((x) => x.id === proyecto);
  if (!p || !esExtension(p.lenguaje, ext) || !nombreLibre(archivosDe(m, proyecto), nombre, p.lenguaje, ext)) return null;
  const archivo = sanearArchivo({ id: idNuevo(), nombre, lenguaje: p.lenguaje, codigo, materia: p.materia, proyecto, ext, creado: ahora, cambiado: ahora });
  if (!archivo || !cabeArchivo(m.laboratorio, archivo.codigo.length)) return null;
  const principal = p.principal ?? (ext === LENGUAJES[p.lenguaje].extension ? archivo.id : null);
  return cambiarMio((x) => ({
    ...x,
    laboratorio: [...x.laboratorio, archivo],
    proyectosLab: principal === p.principal ? x.proyectosLab : x.proyectosLab.map((q) => (q.id === proyecto ? { ...q, principal, cambiado: ahora } : q)),
  }))
    ? archivo.id
    : null;
}

/** Changes its name, course or the file that runs. The course goes to its files too. */
export function cambiarProyecto(id, cambios, ahora = Date.now()) {
  const m = mioActual();
  const viejo = m.proyectosLab.find((p) => p.id === id);
  if (!viejo) return false;
  const nuevo = sanearProyecto({ ...viejo, ...cambios, id, lenguaje: viejo.lenguaje, creado: viejo.creado, cambiado: ahora });
  if (!nuevo) return false;
  return cambiarMio((x) => ({
    ...x,
    proyectosLab: x.proyectosLab.map((p) => (p.id === id ? nuevo : p)),
    laboratorio: 'materia' in cambios ? x.laboratorio.map((a) => (a.proyecto === id ? { ...a, materia: nuevo.materia, cambiado: ahora } : a)) : x.laboratorio,
  }));
}

/**
 * Moves a file into a project (`destino`, its id) or out of the one it's in (null). It goes with the course of the
 * project; out, it keeps the one it had. If it was the one that ran, its old project picks another. Returns null if it
 * moved, or why not: 'ocupado' (that name is taken there), 'lenguaje' (the project is of another language), 'suelto'
 * (a header or data only lives in a project), 'mismo' (it's already there) or 'falla'.
 */
export function moverArchivo(id, destino, ahora = Date.now()) {
  const m = mioActual();
  const a = m.laboratorio.find((x) => x.id === id);
  if (!a) return 'falla';
  const desde = a.proyecto && m.proyectosLab.some((p) => p.id === a.proyecto) ? a.proyecto : null;
  if ((destino ?? null) === desde) return 'mismo';
  const p = destino ? m.proyectosLab.find((x) => x.id === destino) : null;
  if (destino && !p) return 'falla';
  if (p && p.lenguaje !== a.lenguaje) return 'lenguaje';
  if (!p && a.ext) return 'suelto';
  const vecinos = p ? archivosDe(m, p.id) : m.laboratorio.filter((x) => !x.proyecto && x.lenguaje === a.lenguaje && (x.materia ?? null) === (a.materia ?? null));
  if (!nombreLibre(vecinos, a.nombre, a.lenguaje, a.ext ?? null, a.id)) return 'ocupado';
  const movido = sanearArchivo({ ...a, proyecto: p?.id ?? null, materia: p ? p.materia : a.materia, cambiado: ahora });
  if (!movido) return 'falla';
  const viejo = desde ? m.proyectosLab.find((x) => x.id === desde) : null;
  // The one that ran left: the first of its language that stays, or none until one arrives.
  const otroPrincipal = viejo?.principal === a.id ? archivosDe(m, desde).find((x) => x.id !== a.id && (x.ext ?? LENGUAJES[x.lenguaje].extension) === LENGUAJES[viejo.lenguaje].extension)?.id ?? null : undefined;
  const nuevoPrincipal = p && !p.principal && !a.ext ? a.id : undefined;
  const ok = cambiarMio((x) => ({
    ...x,
    laboratorio: x.laboratorio.map((y) => (y.id === id ? movido : y)),
    proyectosLab: x.proyectosLab.map((q) => {
      if (viejo && q.id === viejo.id && otroPrincipal !== undefined) return { ...q, principal: otroPrincipal, cambiado: ahora };
      if (p && q.id === p.id && nuevoPrincipal) return { ...q, principal: nuevoPrincipal, cambiado: ahora };
      return q;
    }),
  }));
  return ok ? null : 'falla';
}

/**
 * The test cases of a file on its own or of a project (`id`), in place of the ones it had. They don't change when it
 * was changed: they travel apart (union.js). False if it isn't there, they don't fit or couldn't be saved.
 */
export function guardarCasos(id, casos) {
  const m = mioActual();
  const limpios = sanearCasos(casos);
  const enArchivos = m.laboratorio.some((a) => a.id === id);
  if ((!enArchivos && !m.proyectosLab.some((p) => p.id === id)) || limpios.length !== casos.length || !cabenCasos(m, id, limpios)) return false;
  const poner = (x) => {
    if (x.id !== id) return x;
    const { casos: _antes, ...resto } = x;
    return limpios.length ? { ...resto, casos: limpios } : resto;
  };
  return cambiarMio((x) => (enArchivos ? { ...x, laboratorio: x.laboratorio.map(poner) } : { ...x, proyectosLab: x.proyectosLab.map(poner) }));
}

/** The project and all its files. */
export const borrarProyecto = (id) => cambiarMio((x) => ({ ...x, proyectosLab: x.proyectosLab.filter((p) => p.id !== id), laboratorio: x.laboratorio.filter((a) => a.proyecto !== id) }));

/** What the engine gets to run a project: every file by its name, and the name of the one that runs. */
export function paraCorrer(mio, proyecto) {
  const p = mio.proyectosLab.find((x) => x.id === proyecto);
  if (!p) return null;
  const archivos = archivosDe(mio, proyecto);
  const principal = archivos.find((a) => a.id === p.principal) ?? archivos.find((a) => (a.ext ?? LENGUAJES[a.lenguaje].extension) === LENGUAJES[p.lenguaje].extension);
  if (!principal) return null;
  return { principal: nombreEnProyecto(principal), archivos: archivos.map((a) => ({ nombre: nombreEnProyecto(a), contenido: a.codigo })) };
}
