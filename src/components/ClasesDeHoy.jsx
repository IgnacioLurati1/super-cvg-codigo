import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { cargarMaterias, cargarPerfil } from '../lib/campus';
import { useColorDeMateria } from '../lib/colores';
import { fechaDeClave } from '../lib/datos';
import { armarSemana, cuatrimestreEl, horaEnTexto, hoyClave, proximoLlamado, sinClasesEl } from '../lib/facultad';
import { cargarHorarios } from '../lib/horarioDatos';
import { fueraDeHoy } from '../lib/hoy';
import { anotarVacios } from '../lib/hoyVacios';
import { useMio } from '../lib/mio';
import { useConsulta } from '../lib/useConsulta';
import './clasesDeHoy.css';

const DIA_MS = 86_400_000;
const diaYMes = (clave) => new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long' }).format(fechaDeClave(clave));
// «del 16 al 19 de noviembre», or with both months when they differ.
const entreFechas = (desde, hasta) =>
  desde.slice(0, 7) === hasta.slice(0, 7) ? `del ${Number(desde.slice(8))} al ${diaYMes(hasta)}` : `del ${diaYMes(desde)} al ${diaYMes(hasta)}`;
const diasHasta = (desde, hasta) => Math.round((fechaDeClave(hasta) - fechaDeClave(desde)) / DIA_MS);
// Exams are worth seeing three weeks ahead.
const AVISO_DE_MESAS = 21;

function useMinuto() {
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const reloj = setInterval(() => setAhora(new Date()), 60_000);
    return () => clearInterval(reloj);
  }, []);
  return ahora;
}

/** Today at the faculty, for Hoy: the classes of the day with the one going on, a day without classes, and the next
 * exam call when it is close. Nothing when there is nothing to say. */
export default function ClasesDeHoy() {
  const mio = useMio();
  const colorDe = useColorDeMateria();
  const ahora = useMinuto();
  const hoy = hoyClave(ahora);
  const cuatri = cuatrimestreEl(hoy);
  const { datos } = useConsulta(async () => {
    await cargarPerfil();
    const [{ enCurso }, horarios] = await Promise.all([cargarMaterias(), cargarHorarios()]);
    return { cursos: enCurso, horarios };
  });
  const semana = datos && cuatri ? armarSemana({ datos: datos.horarios, cursos: datos.cursos, mio, cuatrimestre: cuatri }) : null;

  const libre = sinClasesEl(hoy);
  const minuto = ahora.getHours() * 60 + ahora.getMinutes();
  // The courses the student took out of Hoy don't show their classes here.
  const fuera = fueraDeHoy(mio);
  const deHoy = !libre && semana ? semana.clases.filter((c) => c.dia === ahora.getDay() && !fuera.has(Number(c.cursoId))) : [];
  const llamado = proximoLlamado(hoy);
  const mesas = llamado && diasHasta(hoy, llamado.desde) <= AVISO_DE_MESAS ? llamado : null;
  const sinArmar = semana && !semana.clases.length;
  const vacio = !libre && !deHoy.length && !mesas && !sinArmar;
  // For the preview in Configuración (hoyVacios.js).
  useEffect(() => {
    if (datos) anotarVacios({ facu: vacio });
  }, [datos, vacio]);
  if (!datos || vacio) return null;

  return (
    <section className="bloque clases-hoy" aria-labelledby="clases-hoy-titulo">
      <h2 id="clases-hoy-titulo">En la facu</h2>
      {libre && <p className="clases-hoy__libre">{libre.tipo === 'receso' ? `Estás en el ${libre.titulo.toLocaleLowerCase('es')}.` : `${libre.titulo}, hoy no hay clases.`}</p>}
      {deHoy.length > 0 && (
        <ol className="clases-hoy__lista">
          {deHoy.map((c) => {
            const yaPaso = minuto >= c.hasta;
            const ahoraMismo = minuto >= c.desde && !yaPaso;
            return (
              <li key={c.id} className="clases-hoy__clase" data-materia={colorDe(c.cursoId ?? c.extra)} data-paso={yaPaso ? '' : undefined} aria-current={ahoraMismo ? 'time' : undefined}>
                <span className="clases-hoy__hora">{horaEnTexto(c.desde)} a {horaEnTexto(c.hasta)}</span>
                <span className="clases-hoy__materia">
                  {c.materia}
                  {ahoraMismo && <span className="clases-hoy__ahora">ahora</span>}
                </span>
                {c.aula && <span className="clases-hoy__aula">{c.aula}</span>}
              </li>
            );
          })}
        </ol>
      )}
      {sinArmar && !libre && <p>Elegí la comisión de cada materia y acá ves tus clases de cada día.</p>}
      {mesas && <p className="clases-hoy__mesas">Las mesas de examen son {entreFechas(mesas.desde, mesas.hasta)}.</p>}
      <p className="hoy__mas"><Link to="/horario">{sinArmar ? 'Armar tu horario' : 'Ver tu semana'}</Link></p>
    </section>
  );
}
