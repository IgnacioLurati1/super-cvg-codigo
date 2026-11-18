// What each tool of Consultron in «Código» does (codigo.js, HERRAMIENTAS), here in the browser: the text that goes back
// to the model and the step the student sees («Leyó main.c»). Editing proposes (propuestas.js); running runs the
// proposals in the lab's engine (correrCodigo.js).
import { TOPE_ARCHIVO } from './codigo';
import { cuentas, diferencia } from './diferencia';
import { archivosPara, contenidoPara, proponer, propuestasAhora } from './propuestas';

const lineasDe = (t) => String(t).split('\n').length;

function cambiar(ide, nombre, despues, { nuevo, solo }) {
  const antes = nuevo ? '' : contenidoPara(ide, nombre) ?? '';
  const { suma, quita } = cuentas(diferencia(antes, despues));
  if (!nuevo && !suma && !quita) return { texto: `${nombre} ya estaba así: no cambió nada.`, paso: null };
  const como = proponer(ide, nombre, despues, { nuevo, solo });
  if (!como) return { texto: `No se pudo guardar ${nombre}: puede que sea muy largo.`, paso: { tipo: 'falla', texto: `No pudo cambiar ${nombre}.` } };
  const aplicado = como === 'aplicado';
  // Said here, where the model reads it last. With these only in the instructions, gpt-oss-120b still wrote «Cambié esa
  // línea» about a proposal, «lo corrí y sigue imprimiendo 8.00» without running it, and on «arreglalo» said what it
  // proposed but never why (real service, 17/11). On «mejoralo» it added a #define, never used it, and said it was used
  // in the loop: so a short file goes back as it stays.
  const propuesto = ' El alumno lo ve antes de aplicarlo; leer y correr ya lo usan. Todavía no está cambiado: al contestar, decí «te propongo», no «cambié», «agregué» ni «apliqué». Hablale de vos («si cambiás») y sin jerga: en vez de «macro», «constante».';
  const correrlo = ide.lenguaje === 'sql' ? '' : ' Cuando termines de editar, corré el programa con `correr` antes de contestar.';
  const porque = ' En la respuesta, decile primero por qué hacía falta el cambio, en palabras simples, y contá solo lo que tiene.';
  const queda = despues.length <= 4000 ? `\nAsí queda ${nombre}:\n${despues}\n` : '';
  return {
    texto: `${aplicado ? 'Aplicado' : 'Propuesto'} en ${nombre}: +${suma} −${quita} líneas.${queda}${aplicado ? '' : propuesto}${correrlo}${porque}`,
    paso: { tipo: nuevo ? 'crea' : 'edita', nombre, suma, quita, aplicado },
  };
}

/**
 * Does the tool `nombre` with `args` over `ide` (the lab now). `solo`: «Aplicar solo». `correr(ide, archivos, op)`: runs
 * the program (correrCodigo). `casos(ide, archivos)`: runs the test cases, if the lab has them. Resolves { texto, paso }.
 */
export async function hacerHerramienta(nombre, args, ide, { solo = false, correr, casos = null } = {}) {
  const archivos = archivosPara(ide);
  const existe = (n) => archivos.some((a) => a.nombre === n);
  const noEsta = (n) => ({ texto: `No hay un archivo «${n}». Están: ${archivos.map((a) => a.nombre).join(', ')}.`, paso: null });

  if (nombre === 'listar_archivos') {
    const pendientes = new Set(propuestasAhora(ide.donde).archivos.map((p) => p.nombre));
    const lista = archivos.map((a) => `- ${a.nombre} (${lineasDe(a.contenido)} líneas)${a.nombre === ide.principal ? ', el que corre' : ''}${pendientes.has(a.nombre) ? ', con cambios tuyos sin aplicar' : ''}`);
    // With the error already in the console, gpt-oss-120b answered «por qué falla?» from the list alone, and made up
    // what a variable held (real service, 17/11).
    return { texto: lista.length ? `${lista.join('\n')}\nAntes de contestar, leé con leer_archivo los que hacen falta, aunque la consola ya muestre el error.` : 'No hay archivos.', paso: { tipo: 'lista' } };
  }
  if (nombre === 'leer_archivo') {
    const n = String(args.nombre ?? '');
    if (!existe(n)) return noEsta(n);
    const contenido = contenidoPara(ide, n) ?? archivos.find((a) => a.nombre === n).contenido;
    const recortado = contenido.length > TOPE_ARCHIVO ? `${contenido.slice(0, TOPE_ARCHIVO)}\n[…recortado: tiene ${contenido.length} caracteres]` : contenido;
    return { texto: recortado, paso: { tipo: 'lee', nombre: n } };
  }
  if (nombre === 'editar_archivo') {
    const n = String(args.nombre ?? '');
    if (!existe(n)) return noEsta(n);
    if (typeof args.reemplazo !== 'string') return { texto: 'Falta `reemplazo`.', paso: null };
    const actual = contenidoPara(ide, n) ?? '';
    if (typeof args.buscar === 'string' && args.buscar) {
      const veces = actual.split(args.buscar).length - 1;
      if (veces !== 1) return { texto: veces ? `«buscar» está ${veces} veces en ${n}. Sumá líneas de alrededor para que sea uno solo.` : `«buscar» no está en ${n}. Leelo de nuevo y copiá el tramo tal cual.`, paso: null };
      const i = actual.indexOf(args.buscar);
      return cambiar(ide, n, actual.slice(0, i) + args.reemplazo + actual.slice(i + args.buscar.length), { solo });
    }
    return cambiar(ide, n, args.reemplazo, { solo });
  }
  if (nombre === 'crear_archivo') {
    const n = String(args.nombre ?? '');
    if (existe(n)) return { texto: `Ya hay un ${n}. Para cambiarlo, usá editar_archivo.`, paso: null };
    const no = ide.noSePuedeCrear(n);
    if (no) return { texto: no, paso: null };
    return cambiar(ide, n, String(args.contenido ?? ''), { nuevo: true, solo });
  }
  if (nombre === 'correr') {
    const r = await correr(ide, archivos, { entrada: typeof args.entrada === 'string' ? args.entrada : null });
    return { texto: r.texto, paso: r.omitido ? null : { tipo: 'corre', bien: r.bien, linea: r.linea ?? 0, archivo: r.archivo ?? null, cortado: r.cortado ?? null, ocupado: Boolean(r.ocupado) } };
  }
  if (nombre === 'correr_casos') {
    if (!casos) return { texto: 'Este proyecto no tiene casos de prueba.', paso: { tipo: 'casos', hay: false } };
    const r = await casos(ide, archivos);
    return { texto: r.texto, paso: { tipo: 'casos', hay: true, fallan: r.fallan ?? 0, total: r.total ?? 0 } };
  }
  return { texto: `No conozco la herramienta ${nombre}.`, paso: null };
}
