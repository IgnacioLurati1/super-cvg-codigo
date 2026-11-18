import { useEffect, useMemo, useRef, useState } from 'react';
import Campo from '../components/Campo';
import DetallesAnimados from '../components/DetallesAnimados';
import ElegirMateria, { nombreDeMateria, useMaterias } from '../components/ElegirMateria';
import { Ficha, FinDeRonda } from '../components/FichaDeRepaso';
import { useUI } from '../components/ui';
import { fechaDeClave } from '../lib/datos';
import { useMio } from '../lib/mio';
import { useRepasoDeEjemplo } from '../lib/repasoDeEjemplo';
import { useColorDeMateria } from '../lib/colores';
import { cuantoFalta, deHoy, hoy, MAX_DORSO, MAX_FRENTE, MAX_TARJETAS, nuevasDelDia, paraPracticar, porMateria, proximoDia, repasoParaConsultron, RESPUESTAS, RESPUESTAS_DE_PRACTICA, rondaParaConsultron, semana } from '../lib/repaso';
import { usePantallaDeConsultron } from '../lib/consultron/pantalla';
import { borrarTarjeta, cabeOtra, cambiarTarjeta, crearTarjeta, guardarRespuesta } from '../lib/repasoGuardado';
import { tituloDe, useSeo } from '../lib/seo';
import './panel.css';
import './repaso.css';

/** «hoy», «mañana», «el jueves 14» within a week, «el 2 de diciembre» after. */
function cuandoToca(dia, desde = hoy()) {
  if (dia <= desde) return 'hoy';
  const f = fechaDeClave(dia);
  const dias = Math.round((f - fechaDeClave(desde)) / 86_400_000);
  if (dias === 1) return 'mañana';
  if (dias < 7) return `el ${f.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric' })}`;
  return `el ${f.toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })}`;
}

const cuantas = (n) => (n === 1 ? '1 tarjeta' : `${n} tarjetas`);

/** A course's color as CSS: the one it has in every screen, gray without a course or for one of your own. */
function useColorCss() {
  const colorDe = useColorDeMateria();
  return (materia) => {
    const n = colorDe(materia);
    return n === undefined ? 'var(--borde-control)' : `var(--materia-${n})`;
  };
}

/** The week ahead: a column a day, as tall as the cards it brings. */
function Semana({ dias }) {
  const max = Math.max(1, ...dias.map((d) => d.cuantas));
  return (
    <div className="repaso-semana">
      <h3 className="repaso-semana__titulo">Esta semana</h3>
      <ol className="repaso-semana__dias">
        {dias.map((d, i) => (
          <li key={d.dia} className={`repaso-semana__dia${i === 0 ? ' repaso-semana__dia--hoy' : ''}${d.cuantas ? '' : ' repaso-semana__dia--nada'}`}>
            <span className="repaso-semana__cuantas" aria-hidden="true">{d.cuantas || ''}</span>
            <span className="repaso-semana__barra" aria-hidden="true" style={{ '--h': d.cuantas / max }} />
            <span className="repaso-semana__nombre">
              {i === 0 ? 'Hoy' : d.fecha.toLocaleDateString('es-AR', { weekday: 'short' }).replace('.', '')}
              <span className="solo-lectores">: {d.cuantas ? cuantas(d.cuantas) : 'ninguna'}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** A round: one card at a time, turned with «Ver la respuesta» (Espacio) and answered with 1 to 4. «No me acordé» sends
 * it to the end of the round. */
function Ronda({ inicial, practica = false, tarjetas, materias, onTerminar }) {
  const [cola, setCola] = useState(inicial);
  const [vuelta, setVuelta] = useState(false);
  const [hechas, setHechas] = useState(0);
  const dia = useMemo(() => hoy(), []);
  const porId = useMemo(() => new Map(tarjetas.map((t) => [t.id, t])), [tarjetas]);
  // A card deleted from another tab meanwhile just leaves the round.
  const actual = porId.get(cola.find((id) => porId.has(id)));
  const total = inicial.filter((id) => porId.has(id)).length;
  const ver = useRef(null);
  const respuestas = useRef(null);
  const fin = useRef(null);
  const colorCss = useColorCss();
  const opciones = practica ? RESPUESTAS_DE_PRACTICA : RESPUESTAS;
  const quedan = cola.filter((id) => porId.has(id)).length;
  // Consultron, open over the round, reads the card in front: the answer only once it was turned.
  usePantallaDeConsultron(actual ? rondaParaConsultron({ tarjeta: actual, materia: nombreDeMateria(materias, actual.materia), vuelta, practica, quedan, total }) : { titulo: practica ? 'Repaso, práctica terminada' : 'Repaso, ronda terminada', datos: [[practica ? 'Practicó' : 'Repasó', cuantas(hechas)]] });

  const responderla = (clave) => {
    if (!actual || !vuelta) return;
    // Practice changes nothing: only the order of this round.
    if (!practica) guardarRespuesta(actual.id, clave, dia);
    setCola((c) => {
      const resto = c.filter((id) => id !== actual.id);
      return clave === 'otra' ? [...resto, actual.id] : resto;
    });
    if (clave !== 'otra') setHechas((n) => n + 1);
    setVuelta(false);
  };

  // The focus follows the round: on «Ver la respuesta», then on the answers, and on the end once there is no more.
  useEffect(() => {
    if (!actual) fin.current?.focus();
    // On «Me acordé»: a second Espacio by habit gives the usual answer, never «No me acordé».
    else if (vuelta) respuestas.current?.querySelector('.repaso-respuesta--bien')?.focus();
    else ver.current?.focus();
  }, [actual, vuelta]);

  // Espacio or Enter turns it; 1 to 4 answer. Not while writing anywhere.
  useEffect(() => {
    const alTeclear = (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      if (e.repeat) {
        if (e.key === 'Enter' || e.key === ' ') e.preventDefault();
        return;
      }
      if (!vuelta && (e.key === ' ' || e.key === 'Enter') && e.target === document.body) {
        e.preventDefault();
        setVuelta(true);
        return;
      }
      const i = ['1', '2', '3', '4'].indexOf(e.key);
      if (vuelta && i >= 0 && i < opciones.length) {
        e.preventDefault();
        responderla(opciones[i].clave);
      }
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  });

  if (!actual) {
    const proxima = proximoDia(tarjetas, dia);
    return (
      <FinDeRonda ref={fin} hechas={hechas} titulo={practica ? 'Práctica terminada' : 'Terminaste por hoy'}>
        <p>
          {practica
            ? `Practicaste ${cuantas(hechas)}. No cambió cuándo te toca cada una.`
            : `Repasaste ${cuantas(hechas)}.${proxima ? ` La próxima vuelta es ${cuandoToca(proxima, dia)}.` : ''}`}
        </p>
        <button type="button" className="boton" onClick={onTerminar}>Volver a Repaso</button>
      </FinDeRonda>
    );
  }

  return (
    <section className="repaso-ronda" aria-labelledby="repaso-ronda-titulo">
      <div className="repaso-ronda__cabeza">
        <h2 id="repaso-ronda-titulo" className="repaso-ronda__titulo">{practica ? 'Práctica' : 'Ronda de hoy'}</h2>
        <p className="repaso-ronda__cuenta">{quedan === 1 ? 'Queda 1' : `Quedan ${quedan}`} de {total}</p>
        <button type="button" className="boton boton--secundario boton--chico" onClick={onTerminar}>Terminar</button>
      </div>
      <div className="repaso-ronda__progreso" aria-hidden="true">
        <span style={{ transform: `scaleX(${hechas / Math.max(1, total)})` }} />
      </div>
      <Ficha key={`${actual.id}-${cola.length}`} tarjeta={actual} materia={nombreDeMateria(materias, actual.materia)} color={colorCss(actual.materia)} vuelta={vuelta} />
      {/* What the card says reaches a screen reader once, when it changes or turns. */}
      <p className="solo-lectores" aria-live="polite">{vuelta ? `Respuesta: ${actual.dorso || 'sin respuesta escrita'}` : `Pregunta: ${actual.frente}`}</p>
      {vuelta ? (
        <div ref={respuestas} role="group" aria-labelledby="repaso-respuestas-pregunta">
          <p id="repaso-respuestas-pregunta" className="repaso-respuestas__pregunta">
            {practica ? '¿Te acordaste? La práctica no cambia cuándo te toca.' : '¿Te acordaste?'}
          </p>
          <div className={`repaso-respuestas${practica ? ' repaso-respuestas--dos' : ''}`}>
          {opciones.map((r, i) => (
            <button key={r.clave} type="button" className={`repaso-respuesta repaso-respuesta--${r.clave}`} aria-keyshortcuts={String(i + 1)} onClick={() => responderla(r.clave)}>
              <span className="repaso-respuesta__texto">{r.texto}</span>
              <span className="repaso-respuesta__cuando">{r.cuando ?? (r.clave === 'otra' ? 'Vuelve hoy' : `Vuelve en ${cuantoFalta(actual, r.clave, dia)}`)}</span>
              <kbd className="repaso-respuesta__tecla" aria-hidden="true">{i + 1}</kbd>
            </button>
          ))}
          </div>
        </div>
      ) : (
        <div className="repaso-ver">
          <button ref={ver} type="button" className="boton" aria-keyshortcuts="Space" onClick={() => setVuelta(true)}>Ver la respuesta</button>
          <span className="repaso-ver__ayuda" aria-hidden="true">o Espacio</span>
        </div>
      )}
    </section>
  );
}

/** A card's form, to write a new one or change one. */
function Formulario({ inicial, materias, boton, onGuardar, onCancelar, referencia }) {
  const [materia, setMateria] = useState(inicial.materia);
  const [frente, setFrente] = useState(inicial.frente);
  const [dorso, setDorso] = useState(inicial.dorso);
  const [error, setError] = useState('');
  const pregunta = useRef(null);
  const guardar = (e) => {
    e.preventDefault();
    if (!frente.trim()) {
      setError('Escribí la pregunta.');
      pregunta.current?.focus();
      return;
    }
    const ok = onGuardar({ materia, frente, dorso });
    if (ok === false) return;
    setError('');
    if (!onCancelar) {
      setFrente('');
      setDorso('');
      pregunta.current?.focus();
    }
  };
  return (
    <form ref={referencia} className="repaso-form" onSubmit={guardar} noValidate aria-labelledby={onCancelar ? undefined : 'repaso-nueva-titulo'}>
      <div className="repaso-form__materia">
        <ElegirMateria valor={materia} materias={materias} alElegir={setMateria} />
      </div>
      <div className="repaso-form__caras">
        <div className="repaso-form__cara">
          <Campo etiqueta="Pregunta" ayuda="Por ejemplo, ¿qué garantiza TCP que UDP no?" error={error}>
            <textarea ref={pregunta} className="campo__control repaso-renglones" rows={4} maxLength={MAX_FRENTE} value={frente} onChange={(e) => setFrente(e.target.value)} />
          </Campo>
        </div>
        <div className="repaso-form__cara">
          <Campo etiqueta="Respuesta" ayuda="Lo que tendrías que acordarte. Una idea por renglón.">
            <textarea className="campo__control repaso-renglones" rows={4} maxLength={MAX_DORSO} value={dorso} onChange={(e) => setDorso(e.target.value)} />
          </Campo>
        </div>
      </div>
      <div className="repaso-form__botones">
        <button type="submit" className="boton">{boton}</button>
        {onCancelar && <button type="button" className="boton boton--secundario" onClick={onCancelar}>Cancelar</button>}
      </div>
    </form>
  );
}

function FilaTarjeta({ tarjeta, materias, dia }) {
  const { confirmar } = useUI();
  const [editando, setEditando] = useState(false);
  const editar = useRef(null);
  const form = useRef(null);
  useEffect(() => {
    if (editando) form.current?.querySelector('textarea')?.focus();
  }, [editando]);
  const cuando = tarjeta.vence === null ? 'Nueva' : `Te toca ${cuandoToca(tarjeta.vence, dia)}`;
  const borrar = async () => {
    const ok = await confirmar({ titulo: '¿Borrar la tarjeta?', texto: tarjeta.frente.slice(0, 140), boton: 'Borrar' });
    if (ok) borrarTarjeta(tarjeta.id);
  };
  if (editando) {
    return (
      <li className="repaso-fila repaso-fila--editando">
        <Formulario
          referencia={form}
          inicial={tarjeta}
          materias={materias}
          boton="Guardar cambios"
          onGuardar={(cambios) => {
            cambiarTarjeta(tarjeta.id, cambios);
            setEditando(false);
            requestAnimationFrame(() => editar.current?.focus());
          }}
          onCancelar={() => {
            setEditando(false);
            requestAnimationFrame(() => editar.current?.focus());
          }}
        />
      </li>
    );
  }
  return (
    <li className="repaso-fila">
      <div className="repaso-fila__texto">
        <p className="repaso-fila__frente">{tarjeta.frente}</p>
        <p className="repaso-fila__cuando">{cuando}</p>
      </div>
      <div className="repaso-fila__botones">
        <button ref={editar} type="button" className="boton boton--secundario boton--chico" onClick={() => setEditando(true)}>
          Editar<span className="solo-lectores"> la tarjeta {tarjeta.frente.slice(0, 60)}</span>
        </button>
        <button type="button" className="boton boton--secundario boton--chico" onClick={borrar}>
          Borrar<span className="solo-lectores"> la tarjeta {tarjeta.frente.slice(0, 60)}</span>
        </button>
      </div>
    </li>
  );
}

export default function Repaso() {
  useSeo({ titulo: tituloDe('Repaso'), noindex: true });
  const mio = useMio();
  const tarjetas = mio.repaso;
  const materias = useMaterias(mio.propias);
  const colorCss = useColorCss();
  const [ronda, setRonda] = useState(null);
  const [aviso, setAviso] = useState('');
  const titulo = useRef(null);
  const dia = hoy();

  useRepasoDeEjemplo(tarjetas);
  const nuevasHechas = nuevasDelDia(tarjetas, dia);
  const paraHoy = deHoy(tarjetas, { dia, nuevasHechas });
  const conteo = porMateria(tarjetas, dia);
  // By course, the ones with something today first, then by name.
  const grupos = [...conteo.keys()]
    .map((m) => ({ materia: m, nombre: nombreDeMateria(materias, m), hoy: deHoy(tarjetas, { dia, materia: m, nuevasHechas }).length, lista: tarjetas.filter((t) => t.materia === m) }))
    .sort((a, b) => (b.hoy > 0) - (a.hoy > 0) || a.nombre.localeCompare(b.nombre, 'es'));

  const proxima = proximoDia(tarjetas, dia);
  const dias = semana(tarjetas, { dia, hoyCuantas: paraHoy.length });
  // Consultron, open over the page, reads the cards (under the round's, while one is going).
  usePantallaDeConsultron(repasoParaConsultron({ grupos, paraHoy: paraHoy.length, semanaDe: dias, proxima: proxima ? cuandoToca(proxima, dia) : '' }));

  const empezar = (materia) => {
    setRonda({ ids: deHoy(tarjetas, { dia, materia, nuevasHechas }).map((t) => t.id) });
    window.scrollTo({ top: 0 });
  };
  // Again, whenever: every card or those of a course, mixed, without touching when each one comes back.
  const practicar = (materia) => {
    setRonda({ ids: paraPracticar(tarjetas, materia), practica: true });
    window.scrollTo({ top: 0 });
  };
  const terminar = () => {
    setRonda(null);
    requestAnimationFrame(() => titulo.current?.focus());
  };
  const crear = (datos) => {
    if (!cabeOtra()) {
      setAviso(`Llegaste a las ${MAX_TARJETAS.toLocaleString('es-AR')} tarjetas. Borrá alguna para sumar otra.`);
      return false;
    }
    const id = crearTarjeta(datos);
    setAviso(id ? 'Guardada.' : 'No se pudo guardar. Probá de nuevo.');
    return Boolean(id);
  };

  if (ronda) {
    return (
      <div className="contenedor pagina repaso-pagina">
        <h1 className="solo-lectores">Repaso</h1>
        <Ronda inicial={ronda.ids} practica={ronda.practica} tarjetas={tarjetas} materias={materias} onTerminar={terminar} />
      </div>
    );
  }

  const capas = Math.min(4, paraHoy.length);
  return (
    <div className="contenedor pagina repaso-pagina">
      <h1 ref={titulo} tabIndex={-1}>Repaso</h1>
      <p className="repaso-pagina__bajada">Tarjetas que vuelven justo antes de que las olvides. Después de cada una decís si te acordaste. Lo que te cuesta vuelve antes.</p>

      {tarjetas.length > 0 && (
        <section className="repaso-hoy" aria-labelledby="repaso-hoy-titulo">
          {paraHoy.length > 0 ? (
            <>
              <div className="repaso-pila" style={{ '--capas': capas }} aria-hidden="true">
                {Array.from({ length: capas }, (_, i) => <span key={i} className="repaso-pila__capa" style={{ '--i': i }} />)}
                <span className="repaso-pila__cifra" style={{ '--i': capas - 1 }}>{paraHoy.length}</span>
              </div>
              <div className="repaso-hoy__texto">
                <h2 id="repaso-hoy-titulo" className="repaso-hoy__titulo">{cuantas(paraHoy.length)} para hoy</h2>
                <div className="repaso-hoy__botones">
                  <button type="button" className="boton" onClick={() => empezar(undefined)}>Empezar la ronda</button>
                  <button type="button" className="boton boton--secundario" onClick={() => practicar(undefined)}>Practicar todas</button>
                </div>
              </div>
            </>
          ) : (
            <div className="repaso-hoy__texto">
              <h2 id="repaso-hoy-titulo" className="repaso-hoy__titulo">Hoy no te toca ninguna</h2>
              {proxima && <p className="repaso-hoy__proxima">La próxima vuelta es {cuandoToca(proxima, dia)}.</p>}
              <button type="button" className="boton boton--secundario" onClick={() => practicar(undefined)}>Practicar igual</button>
            </div>
          )}
          <Semana dias={dias} />
        </section>
      )}

      <section className="repaso-nueva" aria-labelledby="repaso-nueva-titulo">
        <h2 id="repaso-nueva-titulo">{tarjetas.length ? 'Nueva tarjeta' : 'Escribí tu primera tarjeta'}</h2>
        {!tarjetas.length && <p className="repaso-nueva__intro">También podés guardar las preguntas de práctica de Consultron.</p>}
        <Formulario inicial={{ materia: null, frente: '', dorso: '' }} materias={materias} boton="Guardar tarjeta" onGuardar={crear} />
        <p className="repaso-nueva__aviso" role="status">{aviso}</p>
      </section>

      {grupos.length > 0 && (
        <section className="repaso-tuyas" aria-labelledby="repaso-tuyas-titulo">
          <h2 id="repaso-tuyas-titulo">Tus tarjetas</h2>
          {grupos.map((g) => (
            <div key={g.materia ?? 'sin'} className={`repaso-grupo${g.hoy ? ' repaso-grupo--hoy' : ''}`} style={{ '--m': colorCss(g.materia) }}>
              <DetallesAnimados className="repaso-grupo__detalles" claseTitulo="repaso-grupo__titulo" titulo={<>{g.nombre} <span className="repaso-grupo__cuenta">{g.hoy ? `${g.hoy} para hoy, de ${g.lista.length}` : cuantas(g.lista.length)}</span></>}>
                <ul className="repaso-filas">
                  {g.lista.map((t) => <FilaTarjeta key={t.id} tarjeta={t} materias={materias} dia={dia} />)}
                </ul>
              </DetallesAnimados>
              {g.hoy > 0 && grupos.length > 1 ? (
                <button type="button" className="boton boton--secundario boton--chico repaso-grupo__repasar" onClick={() => empezar(g.materia)}>
                  Repasar<span className="solo-lectores"> {g.nombre}</span>
                </button>
              ) : (
                <button type="button" className="boton boton--secundario boton--chico repaso-grupo__repasar" onClick={() => practicar(g.materia)}>
                  Practicar<span className="solo-lectores"> {g.nombre}</span>
                </button>
              )}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
