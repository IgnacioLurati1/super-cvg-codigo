// Consultron in «Código» runs the program to check it: in the same engine of the lab, in the browser and without
// network, but with its proposals on top and apart from the console, which stays as the student left it.
import { paraLaCorrida } from '../laboratorio/escritos';
import { LENGUAJES } from '../laboratorio/lenguajes';
import { motorDe } from '../laboratorio/motor';

const TOPE_SALIDA = 4000;

const corto = (t, tope = TOPE_SALIDA) => (t.length > tope ? `${t.slice(0, tope)}\n[…recortado]` : t);

/**
 * Runs what's open with `archivos` ([{ nombre, contenido }], the proposals on top). `entrada`: the lines it reads.
 * Resolves { bien, texto, error, linea, archivo, cortado }, `texto` for the model.
 */
export async function correrCodigo(ide, archivos, { entrada = null } = {}) {
  const base = LENGUAJES[ide.lenguaje];
  if (ide.lenguaje === 'sql') return { bien: false, texto: 'En SQL no corro solo: una consulta puede cambiar la base del alumno. Que la corra él.', omitido: true };
  const principal = archivos.find((a) => a.nombre === ide.principal);
  if (!principal) return { bien: false, texto: `No hay un archivo .${base.extension} para correr.` };
  const m = motorDe(ide.lenguaje);
  if (m.corrida) return { bien: false, texto: 'El alumno está corriendo el programa. Probá después.', ocupado: true };
  const lineas = entrada === null ? ide.lineas : String(entrada).split('\n');
  let salida = '';
  let pidio = false;
  // The engines that can wait (C, Python, JavaScript in this browser) ask for each line instead of reading `lineas`:
  // they get it from here, as the student would type it, until there are no more.
  const quedan = [...lineas];
  const r = await m.correr(principal.contenido, {
    nombre: principal.nombre,
    ...(ide.varios ? { archivos: paraLaCorrida(archivos, ide.donde), principal: principal.nombre } : {}),
    lineas,
    alEvento: (d) => {
      if (d.tipo === 'salida') salida += String(d.texto);
      else if (d.tipo === 'pide' && quedan.length) {
        const linea = String(quedan.shift());
        salida += `${linea}
`;
        m.entrada(linea);
      } else if (d.tipo === 'pide') {
        // It wants more than the lines it got: nobody is there to type.
        pidio = true;
        m.cortar('parado');
      }
    },
  });
  if (!r) return { bien: false, texto: 'No se pudo correr.' };
  const conSalida = (t) => (salida.trim() ? `${t}\nSalida:\n${corto(salida)}` : `${t}\nNo imprimió nada.`);
  if (r.falla) return { bien: false, texto: `No se pudo cargar ${base.nombre}.` };
  if (pidio) return { bien: false, cortado: 'entrada', texto: conSalida('Pidió que el alumno escriba algo y no había más líneas. Pasá la entrada en `entrada`, una línea por dato.') };
  if (r.cortado === 'parado') return { bien: false, cortado: 'parado', texto: conSalida('El alumno lo paró.') };
  if (r.cortado === 'tiempo') return { bien: false, cortado: 'tiempo', texto: conSalida(`Pasaron ${base.topeSegundos} segundos y se cortó. Puede tener un bucle que no termina.`) };
  if (r.cortado === 'salida') return { bien: false, cortado: 'salida', texto: conSalida('Imprimió demasiado y se cortó.') };
  if (r.error) {
    const archivo = r.archivo ?? principal.nombre;
    return { bien: false, error: r.error, linea: r.linea, archivo, texto: conSalida(`Error${r.linea > 0 ? ` en la línea ${r.linea} de ${archivo}` : ''}:\n${corto(r.error, 2000)}`) };
  }
  return { bien: true, texto: conSalida(`Terminó bien en ${Math.round(r.ms)} ms.`) };
}
