import { useId, useState } from 'react';
import { capturar, casoNuevo, lineasDe, resultadoDe } from '../../lib/laboratorio/casos';
import { guardarCasos } from '../../lib/laboratorio/guardado';
import { LENGUAJES } from '../../lib/laboratorio/lenguajes';
import { MAX_CASOS, MAX_ENTRADA, MAX_ESPERADA, MAX_NOMBRE } from '../../lib/laboratorio/saneo';
import { useUI } from '../ui';
import './casos.css';

// «Casos» (lib/laboratorio/casos.js), a tab of the lab's panel: test cases of the file on its own or of the project,
// saved with it. «Probar todos» runs the program with each one without stopping; each case can also run alone, and
// then what it prints opens in the console. What came out stays only in memory, for the file open.

const ESTADOS = {
  paso: 'Pasó',
  fallo: 'Falló',
  error: 'Error',
  tiempo: 'Tardó demasiado',
  parado: 'Lo paraste',
  corriendo: 'Corriendo',
  nuevo: 'Sin correr',
};
const TOPE_FILAS = 200;

/** A line of the comparison: where it differs, marked; an empty one, said. */
function Linea({ texto, desde }) {
  if (texto === null) return <span className="lab-casos__nada"><span aria-hidden="true">—</span><span className="solo-lectores">No está</span></span>;
  if (texto === '') return <span className="lab-casos__nada">(vacía)</span>;
  if (desde === undefined) return texto;
  return (
    <>
      {texto.slice(0, desde)}
      <mark className="lab-casos__marca">{texto.slice(desde) || ' '}</mark>
    </>
  );
}

function Comparacion({ comparacion }) {
  const filas = comparacion.filas;
  const primera = filas.findIndex((f) => f.tipo !== 'igual');
  return (
    <div className="lab-casos__tabla-caja">
      <table className="lab-casos__tabla">
        <caption className="solo-lectores">Lo esperado y lo que salió, línea por línea</caption>
        <thead>
          <tr>
            <th scope="col"><span className="solo-lectores">Línea</span></th>
            <th scope="col">Esperado</th>
            <th scope="col">Salió</th>
          </tr>
        </thead>
        <tbody>
          {filas.slice(0, TOPE_FILAS).map((f) => (
            <tr key={f.n} data-tipo={f.tipo}>
              <th scope="row">
                {f.n}
                {f.tipo !== 'igual' && <span className="solo-lectores">, distinta</span>}
              </th>
              <td><Linea texto={f.esperada} desde={f.tipo === 'distinta' ? f.desde : undefined} /></td>
              <td><Linea texto={f.salida} desde={f.tipo === 'distinta' ? f.desde : undefined} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {filas.length > TOPE_FILAS && <p className="laboratorio__ayuda">{`Y ${filas.length - TOPE_FILAS} líneas más.`}</p>}
      {primera >= TOPE_FILAS && <p className="laboratorio__ayuda">{`Difiere desde la línea ${primera + 1}.`}</p>}
    </div>
  );
}

/** What a result says in a sentence. */
function frase(resultado, segundos) {
  if (resultado.estado === 'paso') return 'Salió lo esperado.';
  if (resultado.estado === 'tiempo') return `Pasaron ${segundos} segundos y lo paramos. Si tiene un bucle, fijate que termine.`;
  if (resultado.estado === 'parado') return 'Lo paraste.';
  if (resultado.estado === 'error') return 'Terminó con un error.';
  const f = resultado.comparacion.filas.find((x) => x.tipo !== 'igual');
  if (!f) return 'No salió lo esperado.';
  if (f.tipo === 'falta') return `Le falta la línea ${f.n}.`;
  if (f.tipo === 'sobra') return `Sobra la línea ${f.n}.`;
  return `La línea ${f.n} es distinta.`;
}

/**
 * `dueno`: the file on its own or the project ({ id, casos }), or null for a draft. `lenguaje`, `ocupado` while
 * something runs, `alCorrer(como)` runs the program as the lab does (resolves with how it ended, or nothing if
 * another run took its place) and `alParar`. `guardarEn(id, casos)`: where they go (the table of a live session shares them).
 */
export default function Casos({ dueno, lenguaje, ocupado, alCorrer, alParar, guardarEn = guardarCasos }) {
  const id = useId();
  const { avisar, confirmar } = useUI();
  const casos = dueno?.casos ?? [];
  const [elegido, setElegido] = useState(null);
  // What came out of each case, by its id: { r, salida, entrada } of its last run.
  const [corridas, setCorridas] = useState({});
  const [enCurso, setEnCurso] = useState(null);
  const [probando, setProbando] = useState(false);
  const [resumen, setResumen] = useState('');
  // Another file or project: what came out was of the one before.
  const [deDueno, setDeDueno] = useState(dueno?.id ?? null);
  if (deDueno !== (dueno?.id ?? null)) {
    setDeDueno(dueno?.id ?? null);
    setCorridas({});
    setElegido(null);
    setResumen('');
  }
  const caso = casos.find((c) => c.id === elegido) ?? casos[0] ?? null;
  const segundos = LENGUAJES[lenguaje].topeSegundos;

  // A result is of the input it ran with: changed, it has to run again. What's expected is compared now.
  const resultado = (c) => {
    if (enCurso === c.id) return { estado: 'corriendo' };
    const corrida = corridas[c.id];
    if (!corrida || corrida.entrada !== c.entrada) return { estado: 'nuevo' };
    return resultadoDe(c, corrida.r, corrida.salida, lenguaje);
  };

  const guardar = (lista) => {
    if (!guardarEn(dueno.id, lista)) avisar('No se pudo guardar. Puede que el navegador no tenga más lugar.', 'error');
  };
  const cambiar = (cambios) => guardar(casos.map((c) => (c.id === caso.id ? { ...c, ...cambios } : c)));
  const sumar = () => {
    if (casos.length >= MAX_CASOS) return avisar(`Ya tiene ${MAX_CASOS} casos. Borrá alguno para sumar otro.`, 'error');
    const nuevo = casoNuevo(casos);
    guardar([...casos, nuevo]);
    setElegido(nuevo.id);
    requestAnimationFrame(() => document.getElementById(`${id}-nombre`)?.focus());
    return undefined;
  };
  const borrar = async () => {
    if (!(await confirmar({ titulo: `¿Borrar «${caso.nombre || 'este caso'}»?`, boton: 'Borrar', peligro: true }))) return;
    const i = casos.indexOf(caso);
    const resto = casos.filter((c) => c.id !== caso.id);
    guardar(resto);
    setElegido(resto[Math.min(i, resto.length - 1)]?.id ?? null);
  };

  // One run of a case: what it printed, kept for it. Null if another run took its place.
  const correrCaso = async (c, quieto) => {
    const captura = capturar(lineasDe(c.entrada));
    setEnCurso(c.id);
    const r = await alCorrer({ captura, quieto });
    setEnCurso(null);
    if (!r) return null;
    const corrida = { r: { cortado: r.cortado, error: r.error, falla: r.falla }, salida: captura.texto(), entrada: c.entrada };
    setCorridas((x) => ({ ...x, [c.id]: corrida }));
    return resultadoDe(c, corrida.r, corrida.salida, lenguaje);
  };

  const correrUno = async () => {
    if (ocupado || probando || !caso) return;
    setResumen('');
    // In «Casos» it stays: its result shows here, with what came out (Ignacio).
    await correrCaso(caso, true);
  };

  const probarTodos = async () => {
    if (ocupado || probando || !casos.length) return;
    setProbando(true);
    setResumen('Probando.');
    const lista = [...casos];
    const vistos = [];
    for (const c of lista) {
      const r = await correrCaso(c, true);
      if (!r) break;
      vistos.push({ caso: c, r });
      if (r.estado === 'parado') break;
    }
    setProbando(false);
    const pasaron = vistos.filter((v) => v.r.estado === 'paso').length;
    const cortado = vistos.length < lista.length;
    setResumen(`${cortado ? `Probaste ${vistos.length} de ${lista.length}. ` : ''}${pasaron === vistos.length && !cortado ? `Pasaron los ${lista.length}.` : `Pasaron ${pasaron} de ${vistos.length}.`}`);
    // The first that didn't pass, in view with what differs.
    const mal = vistos.find((v) => v.r.estado !== 'paso' && v.r.estado !== 'parado');
    if (mal) setElegido(mal.caso.id);
  };

  if (!dueno) {
    return <p className="laboratorio__ayuda">Guardá el archivo para sumarle casos de prueba.</p>;
  }

  const actual = caso ? resultado(caso) : null;
  const deshabilitado = ocupado || probando ? 'true' : undefined;

  return (
    <div className="lab-casos">
      <div className="lab-casos__barra">
        <button type="button" className="boton boton--chico" onClick={probarTodos} aria-disabled={deshabilitado || (casos.length ? undefined : 'true')}>
          Probar todos
        </button>
        {probando && (
          <button type="button" className="boton boton--chico boton--secundario" onClick={alParar}>
            Parar
          </button>
        )}
        <p className="lab-casos__resumen" role="status">{resumen}</p>
      </div>

      {!casos.length ? (
        <div className="lab-casos__vacio">
          <p className="laboratorio__ayuda">Cada caso tiene lo que lee tu programa y lo que debería imprimir.</p>
          <button type="button" className="boton boton--chico boton--secundario" onClick={sumar}>Sumar un caso</button>
        </div>
      ) : (
        <div className="lab-casos__cuerpo">
          <div className="lab-casos__lado">
            <ul className="lab-casos__lista" aria-label="Casos de prueba">
              {casos.map((c) => {
                const e = resultado(c).estado;
                return (
                  <li key={c.id}>
                    <button type="button" className="lab-casos__item" aria-current={c.id === caso.id ? 'true' : undefined} onClick={() => setElegido(c.id)}>
                      <span className="lab-casos__estado" data-estado={e}>{ESTADOS[e]}</span>
                      <span className="solo-lectores">, </span>
                      <span className="lab-casos__nombre">{c.nombre || 'Sin nombre'}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <button type="button" className="boton boton--chico boton--secundario" onClick={sumar} aria-disabled={casos.length >= MAX_CASOS ? 'true' : undefined}>
              Sumar un caso
            </button>
          </div>

          <section className="lab-casos__detalle" aria-labelledby={`${id}-titulo`}>
            <h3 id={`${id}-titulo`} className="solo-lectores">{caso.nombre || 'Sin nombre'}</h3>
            {/* What came out first: in a short panel, it's what the student looks for. */}
            {actual && actual.estado !== 'nuevo' && actual.estado !== 'corriendo' && (
              <div className="lab-casos__resultado" data-estado={actual.estado}>
                <p className="lab-casos__frase" role="status">{frase(actual, segundos)}</p>
                {actual.estado === 'error' && <pre className="lab-casos__error">{actual.error}</pre>}
                {actual.estado === 'fallo' && <Comparacion comparacion={actual.comparacion} />}
                {actual.estado !== 'paso' && actual.estado !== 'fallo' && actual.salida && (
                  <>
                    <p className="lab-casos__rotulo">Lo que salió</p>
                    <pre className="lab-casos__salida">{actual.salida}</pre>
                  </>
                )}
                {actual.estado !== 'paso' && actual.estado !== 'parado' && (
                  <button type="button" className="boton boton--chico boton--secundario" onClick={() => cambiar({ esperada: actual.salida.slice(0, MAX_ESPERADA) })}>
                    Usar lo que salió como esperado
                  </button>
                )}
              </div>
            )}
            <div className="lab-casos__fila">
              <div className="lab-casos__campo lab-casos__campo--nombre">
                <label className="campo__etiqueta" htmlFor={`${id}-nombre`}>Nombre</label>
                <input id={`${id}-nombre`} className="campo__control" type="text" autoComplete="off" maxLength={MAX_NOMBRE} value={caso.nombre} onChange={(e) => cambiar({ nombre: e.target.value })} />
              </div>
              <div className="lab-casos__acciones">
                <button type="button" className="boton boton--chico" onClick={correrUno} aria-disabled={deshabilitado}>
                  Correr este caso
                </button>
                <button type="button" className="boton boton--chico boton--secundario" onClick={borrar}>
                  Borrar
                </button>
              </div>
            </div>
            <div className="lab-casos__textos">
              <div className="lab-casos__campo">
                <label className="campo__etiqueta" htmlFor={`${id}-entrada`}>Entrada</label>
                <span id={`${id}-entrada-ayuda`} className="campo__ayuda">{`Una línea por cada vez que lee ${LENGUAJES[lenguaje].lee ?? ''}`.trim()}.</span>
                <textarea id={`${id}-entrada`} className="campo__control lab-casos__texto" rows={4} autoComplete="off" spellCheck={false} maxLength={MAX_ENTRADA} aria-describedby={`${id}-entrada-ayuda`} value={caso.entrada} onChange={(e) => cambiar({ entrada: e.target.value })} />
              </div>
              <div className="lab-casos__campo">
                <label className="campo__etiqueta" htmlFor={`${id}-esperada`}>Salida esperada</label>
                <span id={`${id}-esperada-ayuda`} className="campo__ayuda">Lo que debería imprimir.</span>
                <textarea id={`${id}-esperada`} className="campo__control lab-casos__texto" rows={4} autoComplete="off" spellCheck={false} maxLength={MAX_ESPERADA} aria-describedby={`${id}-esperada-ayuda`} value={caso.esperada} onChange={(e) => cambiar({ esperada: e.target.value })} />
              </div>
            </div>
            <div className="lab-casos__exacto">
              <input id={`${id}-exacto`} type="checkbox" checked={caso.exacto === true} aria-describedby={`${id}-exacto-ayuda`} onChange={(e) => cambiar({ exacto: e.target.checked })} />
              <label htmlFor={`${id}-exacto`}>Comparar exacto</label>
              <span id={`${id}-exacto-ayuda`} className="campo__ayuda">Cuentan los espacios al final de cada línea y las líneas vacías del final.</span>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
