import { useEffect, useId, useState, useSyncExternalStore } from 'react';
import { escucharGuardadas, listarGuardadas, olvidarGuardada } from '../../lib/enVivo/guardadas';
import { escucharMio, usuarioActual } from '../../lib/mio';
import { estadoDrive } from '../../lib/sincro';
import { useUI } from '../ui';

// The sessions this browser kept (lib/enVivo/guardadas.js), to come back with one click, on the entry of Estudiar en
// vivo. With «Guardar en tu Google Drive» on, also the ones from the student's other computers.

const nombreDe = (pestanas) => {
  if (!pestanas.length) return 'Solo el chat';
  if (pestanas.length === 1) return pestanas[0];
  const primeras = pestanas.slice(0, 3);
  const resto = pestanas.length - primeras.length;
  return resto ? `${primeras.join(', ')} y ${resto} más` : `${primeras.slice(0, -1).join(', ')} y ${primeras.at(-1)}`;
};
const fecha = (ms) => {
  const d = new Date(ms);
  return `el ${d.toLocaleDateString('es-AR', { day: 'numeric', month: 'numeric' })} a las ${d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}`;
};
// Ended for everyone: said instead of when it was used. It does not open again: its copy does, in a new session
// (EnVivo.jsx). Only who made it can end it.
const quienTermino = (s) => (s.anfitrion ? 'La terminaste' : s.terminada.por ? `${s.terminada.por} la terminó` : 'Terminó');
const cuandoFue = (s) => (s.terminada ? `${quienTermino(s)} ${fecha(s.terminada.cuando)}` : `Última vez ${fecha(s.cuando)}`);

export default function Guardadas({ alVolver, ocupado }) {
  const alumno = useSyncExternalStore(escucharMio, usuarioActual, () => null);
  const { confirmar, avisar } = useUI();
  const [lista, setLista] = useState([]);
  const id = useId();

  useEffect(() => {
    let vivo = true;
    const leer = () => listarGuardadas(alumno).then((l) => vivo && setLista(l));
    leer();
    const dejar = escucharGuardadas(leer);
    // The ones of the other computers, from Drive (if it is on).
    if (Number.isInteger(alumno)) import('../../lib/enVivo/sesionesEnDrive').then((m) => m.sincronizarSesiones()).catch(() => {});
    return () => {
      vivo = false;
      dejar();
    };
  }, [alumno]);

  if (!lista.length) return null;

  const borrar = async (s) => {
    const enDrive = estadoDrive().prendido;
    const seguro = await confirmar({
      titulo: '¿Borrar esta sesión?',
      texto: enDrive ? 'Se borra de este navegador y de tu Drive. Los demás tienen su copia.' : 'Se borra de este navegador. Los demás tienen su copia.',
      boton: 'Borrar',
      peligro: true,
    });
    if (!seguro) return;
    await olvidarGuardada(alumno, s.id);
    avisar('Sesión borrada');
    if (enDrive) import('../../lib/enVivo/sesionesEnDrive').then((m) => m.programarDrive(500)).catch(() => {});
  };

  return (
    <section className="envivo-guardadas" aria-labelledby={`${id}-t`}>
      <h2 id={`${id}-t`}>Tus sesiones</h2>
      <ul className="envivo-guardadas__lista">
        {lista.map((s) => {
          const nombre = nombreDe(s.pestanas);
          return (
            <li key={s.id} className="envivo-guardadas__sesion">
              <div className="envivo-guardadas__texto">
                <span className="envivo-guardadas__nombre">{nombre}</span>
                <span className="envivo-guardadas__cuando">{cuandoFue(s)}</span>
              </div>
              <div className="envivo-guardadas__acciones">
                <button type="button" className="boton boton--chico" onClick={() => !ocupado && alVolver(s.codigo)} aria-disabled={ocupado || undefined} aria-label={s.terminada ? `Abrir la copia de ${nombre}` : `Volver a ${nombre}`}>{s.terminada ? 'Abrir la copia' : 'Volver'}</button>
                <button type="button" className="boton boton--secundario boton--chico" onClick={() => borrar(s)} aria-label={`Borrar ${nombre}`}>Borrar</button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
