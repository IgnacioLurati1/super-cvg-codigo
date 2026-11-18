import { useEffect, useMemo, useRef, useState } from 'react';
import { textoError } from '../lib/errores';
import { armarHorario, hashDeHorario } from '../lib/horarioCompartido';
import Campo from './Campo';
import DetallesAnimados from './DetallesAnimados';
import '../pages/compartido.css';

const contar = (n, uno, varios) => (n === 1 ? `1 ${uno}` : `${n} ${varios}`);
const enLista = (cosas) => new Intl.ListFormat('es', { type: 'conjunction' }).format(cosas);

function queLleva(materias) {
  const n = materias.length;
  const partes = [
    `${contar(n, 'materia', 'materias')} con ${n === 1 ? 'su comisión' : 'sus comisiones'}`,
    materias.some((m) => m.clases) && 'los horarios que cambiaste a mano',
    materias.some((m) => m.aulas || m.clases?.some((k) => k.aula)) && 'tus aulas',
  ].filter(Boolean);
  return `${n === 1 ? 'Va' : 'Van'} ${enLista(partes)}`;
}

/** «Compartir mi horario», in Tu horario: a link with the student's week for a classmate (horarioCompartido.js).
 * `datos`, the faculty's schedules; `cursos`, the campus courses in progress; `mio`, the student's choices. */
export default function CompartirHorario({ datos, cursos, mio }) {
  const [aviso, setAviso] = useState('');
  const [sinPortapapeles, setSinPortapapeles] = useState(false);
  const campoLink = useRef(null);
  const reloj = useRef(null);

  const { paquete, fuera } = useMemo(() => armarHorario({ datos, cursos, mio }), [datos, cursos, mio]);
  const vacio = !paquete.materias.length;
  const { link, errorLink } = useMemo(() => {
    if (vacio) return { link: '', errorLink: '' };
    try {
      return { link: `${window.location.origin}${import.meta.env.BASE_URL}horario/compartido${hashDeHorario(paquete)}`, errorLink: '' };
    } catch (falla) {
      return { link: '', errorLink: textoError(falla) };
    }
  }, [paquete, vacio]);

  useEffect(() => () => clearTimeout(reloj.current), []);

  useEffect(() => {
    if (sinPortapapeles) campoLink.current?.select();
  }, [sinPortapapeles]);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setSinPortapapeles(false);
      setAviso('Link copiado. Pasáselo a tu compañero.');
      clearTimeout(reloj.current);
      reloj.current = setTimeout(() => setAviso(''), 4000);
    } catch {
      setSinPortapapeles(true);
      campoLink.current?.select();
    }
  };

  return (
    <DetallesAnimados className="compartir horario__compartir" claseTitulo="compartir__titulo" titulo="Compartir mi horario">
      <div className="compartir__cuerpo">
        {vacio ? (
          <p>Cuando elijas tus comisiones, vas a poder pasarle tu semana a un compañero.</p>
        ) : (
          <>
            <p>Tu compañero ve tu semana al lado de la suya, con los huecos que tienen libres los dos. {queLleva(paquete.materias)}.</p>
            <p>Nada del campus va en el link. Quien lo tenga ve tus materias, tus comisiones y tus aulas.</p>
            {fuera.length > 0 && (
              <p className="compartir__nota">{enLista(fuera)} {fuera.length === 1 ? 'no va porque no está' : 'no van porque no están'} en los horarios de la facultad.</p>
            )}
            {errorLink ? (
              <div className="mensaje mensaje--error" role="alert"><p>{errorLink}</p></div>
            ) : (
              <>
                <div className="compartir__botones">
                  <button type="button" className="boton" onClick={copiar}>Copiar link</button>
                </div>
                {sinPortapapeles && (
                  <Campo etiqueta="Tu link" ayuda="No pudimos copiarlo solo. Copialo de acá.">
                    <input ref={campoLink} className="campo__control" type="text" readOnly value={link} onFocus={(e) => e.target.select()} />
                  </Campo>
                )}
              </>
            )}
          </>
        )}
        <p className="compartir__aviso" role="status">{aviso}</p>
      </div>
    </DetallesAnimados>
  );
}
