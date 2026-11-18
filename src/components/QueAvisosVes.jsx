import { GRUPOS_DE_AVISOS } from '../lib/avisos';
import { hayUsuario, useMio, verAvisos } from '../lib/mio';
import './queAvisosVes.css';

/** Which kinds of campus notification show in the bell and in Hoy, one box each. `alFallar`: it couldn't be saved. */
export default function QueAvisosVes({ alFallar }) {
  const ocultos = useMio().avisosOcultos;
  return (
    <fieldset className="ajustes__grupo">
      <legend className="ajustes__leyenda">Qué avisos ves</legend>
      <p className="ajustes__ayuda">Lo que no ves tampoco suma al número de la campana.</p>
      <div className="avisos-que-ves">
        {GRUPOS_DE_AVISOS.map((g) => (
          <label key={g.clave} className="aviso-que-ves">
            <input
              type="checkbox"
              name={`avisos-${g.clave}`}
              checked={!ocultos.includes(g.clave)}
              disabled={!hayUsuario()}
              onChange={(e) => {
                if (!verAvisos(g.clave, e.target.checked)) alFallar();
              }}
            />
            <span className="aviso-que-ves__texto">
              <span className="aviso-que-ves__nombre">{g.nombre}</span>
              {g.texto && <span className="aviso-que-ves__ayuda">{g.texto}</span>}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
