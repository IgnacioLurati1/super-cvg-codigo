import { useId, useRef, useState } from 'react';
import { proponerTabla } from '../../lib/laboratorio/csv';
import { LENGUAJES } from '../../lib/laboratorio/lenguajes';
import { motorDe, useMotor } from '../../lib/laboratorio/motor';
import { resumenAfuera } from '../../lib/laboratorio/mysql';
import { ACEPTA, comoVolvio, leerArchivo, sumarTablaCsv, usarBase } from '../../lib/laboratorio/tuBase';
import { useUI } from '../ui';
import DibujoBase from './DibujoBase';
import { Pistas } from './Plan';
import RevisarCsv, { PROBLEMAS_CSV } from './RevisarCsv';
import './sql.css';

// The database of SQL, next to the code: its drawing, and what to do with it. The practice one comes first; the student
// can load their own from a file (tuBase.js), which stays only in this tab, and go back to the practice one.

const megas = (n) => `${Math.round(n / (1024 * 1024))} MB`;
const PROBLEMAS = {
  vacio: (l) => `«${l.nombre}» está vacío.`,
  grande: (l) => `«${l.nombre}» pesa más de ${megas(l.tope)}. Probá con uno más chico.`,
  leer: (l) => `No se pudo leer «${l.nombre}». Probá de nuevo.`,
  'no-es-base': (l) => `«${l.nombre}» no es una base de SQLite, o está dañada.`,
};

function Problema({ problema }) {
  return (
    <div className="mensaje mensaje--error laboratorio__problema" role="alert">
      <p>{problema.texto}</p>
      {problema.detalle && <pre className="laboratorio__detalle">{problema.detalle}</pre>}
      {problema.pistas?.length > 0 && <Pistas pistas={problema.pistas} />}
    </div>
  );
}

export default function Base({ ocupado }) {
  const id = useId();
  const motor = useMotor('sql');
  const { confirmar, avisar } = useUI();
  const elegir = useRef(null);
  const [cargando, setCargando] = useState('');
  const [problema, setProblema] = useState(null);
  const [csv, setCsv] = useState(null);
  const { esquema } = motor;
  const base = motor.base ?? null;
  const libre = Boolean(esquema) && !ocupado && !cargando;
  const existentes = (esquema ?? []).map((t) => t.nombre);

  // How a change of the database ended: it says so here, and if it went well, the drawing changes.
  const contar = (r, nombre, bien) => {
    if (!r) return setProblema({ texto: 'Esperá a que termine lo que está corriendo.' });
    if (r.falla) return setProblema({ texto: 'No se pudo cargar SQL. Revisá la conexión y probá de nuevo.' });
    if (r.cortado === 'tiempo') return setProblema({ texto: `Tardó más de ${LENGUAJES.sql.topeSegundos} segundos y lo paramos. Seguís con la base de antes.` });
    if (r.cortado) return setProblema({ texto: 'Paraste la carga. Seguís con la base de antes.' });
    if (r.error === 'no-es-base') return setProblema({ texto: PROBLEMAS['no-es-base']({ nombre }) });
    if (r.error && r.linea > 0) return setProblema({ texto: `«${nombre}» falló en la línea ${r.linea}. Seguís con la base de antes.`, detalle: r.error, pistas: r.pistas });
    if (r.error) return setProblema({ texto: `No se cargó «${nombre}». Seguís con la base de antes.`, detalle: r.error, pistas: r.pistas });
    setProblema(null);
    // A MySQL script: what SQLite doesn't have was left out, and it says what.
    return avisar(r.afuera?.length ? `${bien} ${resumenAfuera(r.afuera)}` : bien);
  };

  const cambiar = async (hacer, nombre, bien) => {
    setCargando(nombre);
    try {
      contar(await hacer(), nombre, bien);
    } finally {
      setCargando('');
    }
  };

  const alElegir = async (e) => {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    setProblema(null);
    const leido = await leerArchivo(archivo);
    if (leido.problema) return setProblema({ texto: PROBLEMAS[leido.problema](leido) });
    if (leido.tipo === 'csv') {
      const inicial = proponerTabla(leido.texto, leido.nombre, existentes);
      if (inicial.error) return setProblema({ texto: PROBLEMAS_CSV[inicial.error](leido.nombre) });
      return setCsv({ leido, inicial });
    }
    return cambiar(() => usarBase(leido), leido.nombre, `Cargaste «${leido.nombre}».`);
  };

  const reiniciar = async () => {
    if (!libre) return;
    // A script's changes aren't tracked: with tables there, there may be something to lose.
    if ((esquema?.length ?? 0) > 0 && !(await confirmar({ titulo: '¿Reiniciar la base?', texto: 'Vuelve a como estaba al empezar. Se pierden las tablas y los datos que le sumaste.', boton: 'Reiniciar la base' }))) return;
    setProblema(null);
    motorDe('sql').reiniciar();
    avisar(comoVolvio(base));
  };

  const volver = async () => {
    if (!libre) return;
    if (!(await confirmar({ titulo: '¿Volver a la de práctica?', texto: 'Se pierden los cambios que le hiciste a tu base.', boton: 'Volver a la de práctica' }))) return;
    cambiar(() => usarBase(null), 'la base de práctica', 'Volviste a la base de práctica.');
  };

  const vaciar = async () => {
    if (!libre) return;
    if (!(await confirmar({ titulo: '¿Vaciar la base?', texto: 'Se borran todas sus tablas. Después podés volver a la de práctica.', boton: 'Vaciar la base' }))) return;
    cambiar(() => usarBase({ tipo: 'vacia' }), 'la base vacía', 'La base quedó vacía.');
  };

  const propia = Boolean(base?.origen);
  const vacia = base?.origen?.tipo === 'vacia';
  const sumadas = base?.tablas ?? [];
  // Emptied and then filled (with «Crear SQL» or a script): it is the student's base, and it can be emptied again.
  const conTablas = sumadas.length > 0 || (esquema?.length ?? 0) > 0;
  const titulo = vacia ? (conTablas ? 'Tu base' : 'Base vacía') : propia ? 'Tu base' : 'Base de práctica';
  const lista = sumadas.length === 1 ? `la tabla ${sumadas[0]}` : `las tablas ${sumadas.slice(0, -1).join(', ')} y ${sumadas.at(-1)}`;
  const ayuda = vacia
    ? `${sumadas.length ? `Con ${lista} que sumaste. ` : ''}Lo que crees queda hasta que la reinicies o cierres la pestaña.`
    : propia
    ? `Es «${base.origen.nombre}»${sumadas.length ? `, con ${lista}` : ''}. Queda solo en esta pestaña.`
    : `${sumadas.length ? `Con ${lista} que sumaste. ` : ''}Lo que cambies queda hasta que la reinicies o cierres la pestaña.`;

  return (
    <section className="laboratorio__tablas" aria-labelledby={`${id}-titulo`} aria-busy={esquema ? undefined : 'true'}>
      <h2 id={`${id}-titulo`}>{titulo}</h2>
      <p className="laboratorio__ayuda">{ayuda}</p>
      {esquema ? (
        <DibujoBase esquema={esquema} />
      ) : (
        <div className="tablas tablas--esqueleto" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => <span key={i} className="esqueleto" />)}
        </div>
      )}
      <p className="laboratorio__ayuda laboratorio__estado-base" role="status">{cargando ? `Cargando «${cargando}».` : ''}</p>
      {problema && <Problema problema={problema} />}
      <div className="laboratorio__botones-base">
        <button type="button" className="boton boton--secundario boton--chico" onClick={reiniciar} aria-disabled={libre ? undefined : 'true'}>Reiniciar la base</button>
        <button type="button" className="boton boton--secundario boton--chico" onClick={() => libre && elegir.current?.click()} aria-disabled={libre ? undefined : 'true'} aria-describedby={`${id}-cargar`}>
          {propia ? 'Cargar otra' : 'Cargar tu base'}
        </button>
        {(!vacia || conTablas) && <button type="button" className="boton boton--secundario boton--chico" onClick={vaciar} aria-disabled={libre ? undefined : 'true'}>Vaciar la base</button>}
        {(propia || sumadas.length > 0) && (
          <button type="button" className="boton boton--secundario boton--chico" onClick={volver} aria-disabled={libre ? undefined : 'true'}>Volver a la de práctica</button>
        )}
      </div>
      <p id={`${id}-cargar`} className="laboratorio__ayuda">Un .sql, .db o .csv.</p>
      <input ref={elegir} type="file" accept={ACEPTA} hidden onChange={alElegir} />
      {csv && (
        <RevisarCsv
          leido={csv.leido}
          inicial={csv.inicial}
          existentes={existentes}
          alCrear={(tabla) => cambiar(() => sumarTablaCsv(tabla), csv.leido.nombre, `Sumaste la tabla ${tabla.tabla}.`)}
          alCerrar={() => setCsv(null)}
        />
      )}
    </section>
  );
}
