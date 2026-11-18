// Consultron in «Código» runs the student's test cases (casos.js) with its proposals on top: each case in the same
// engine of the lab, its lines answering each read, apart from the console. What the model gets is short: which pass
// and, of each one that doesn't, the first line that differs.
import { capturar, resultadoDe } from '../laboratorio/casos';
import { paraLaCorrida } from '../laboratorio/escritos';
import { motorDe } from '../laboratorio/motor';

const corto = (t, tope = 300) => (t.length > tope ? `${t.slice(0, tope)}…` : t);

/** Runs `casos` with `archivos` ([{ nombre, contenido }]). Resolves { texto, fallan, total }. */
export async function correrCasosDelAgente(ide, archivos, casos) {
  const total = casos.length;
  if (!total) return { texto: 'Este proyecto no tiene casos de prueba.', fallan: 0, total: 0 };
  const principal = archivos.find((a) => a.nombre === ide.principal);
  if (!principal) return { texto: 'No hay un archivo para correr.', fallan: 0, total };
  const m = motorDe(ide.lenguaje);
  const lineas = [];
  let fallan = 0;
  for (const caso of casos) {
    if (m.corrida) return { texto: 'El alumno está corriendo el programa. Probá después.', fallan, total };
    const captura = capturar(caso.entrada ? String(caso.entrada).replace(/\n$/, '').split('\n') : []);
    const r = await m.correr(principal.contenido, {
      nombre: principal.nombre,
      ...(ide.varios ? { archivos: paraLaCorrida(archivos, ide.donde), principal: principal.nombre } : {}),
      lineas: captura.lineas,
      alEvento: (d) => {
        captura.mirar(d);
        if (d.tipo === 'pide') m.entrada(captura.responder());
      },
    });
    const res = resultadoDe(caso, r, captura.texto(), ide.lenguaje);
    if (res.estado === 'paso') {
      lineas.push(`- «${caso.nombre}»: pasó.`);
      continue;
    }
    fallan += 1;
    if (res.estado === 'fallo') {
      const distinta = res.comparacion?.filas?.find((f) => f.tipo !== 'igual');
      lineas.push(distinta ? `- «${caso.nombre}»: falló. Esperaba «${corto(distinta.esperada ?? '(nada)')}» y salió «${corto(distinta.salida ?? '(nada)')}».` : `- «${caso.nombre}»: falló.`);
    } else if (res.estado === 'error') lineas.push(`- «${caso.nombre}»: error. ${corto(res.error ?? '')}`);
    else lineas.push(`- «${caso.nombre}»: ${res.estado === 'tiempo' ? 'se pasó del tiempo' : 'se cortó'}.`);
  }
  return { texto: `Pasaron ${total - fallan} de ${total}.\n${lineas.join('\n')}`, fallan, total };
}
