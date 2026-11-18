import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Cargando, ErrorConReintento } from '../components/Filas';
import { useUI } from '../components/ui';
import { cargarMaterias, cargarPerfil } from '../lib/campus';
import { fechaDeClave } from '../lib/datos';
import { textoError } from '../lib/errores';
import { armarSemana, comisionesDeLaMateria, cuatrimestreEl, cuatrimestreQueSigue, DIAS_DE_CLASE, horaEnTexto, hoyClave } from '../lib/facultad';
import { cargarHorarios } from '../lib/horarioDatos';
import { conLosHorarios, copiarMateria, deshacerCopia, estadoDe, hayHorarioEnHash, horarioDeHash, juntarSemanas, semanaCompartida } from '../lib/horarioCompartido';
import { MAX_MATERIAS_DE_LA_FACULTAD, useMio, usuarioActual } from '../lib/mio';
import { tituloDe, useSeo } from '../lib/seo';
import { useConsulta } from '../lib/useConsulta';
import { carrilesDelDia } from './horarioCarriles';
import './panel.css';
import './horario.css';
import './horarioCompartido.css';

// A classmate's week next to the student's, from the link they passed (horarioCompartido.js). The link leaves the
// address before anything: the history would keep it. What it brings is only on this screen, in memory.
const QUIEN = { vos: 'Vos', suya: 'Tu compañero', juntos: 'Juntos' };
// The order of what starts at the same time: together, the student's, the classmate's, and the gaps last.
const ORDEN = { juntos: 0, vos: 1, suya: 2, hueco: 3 };
// A link older than this, in days, may be from another cuatrimestre: the classmate may have changed commissions.
const VIEJO = 120;
const deA = (c) => `${horaEnTexto(c.desde)} a ${horaEnTexto(c.hasta)}`;
const enLista = (cosas) => new Intl.ListFormat('es', { type: 'conjunction' }).format(cosas);
const diaYMes = (clave, hoy) => new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long', ...(clave.slice(0, 4) !== hoy.slice(0, 4) ? { year: 'numeric' } : {}) }).format(fechaDeClave(clave));
const diasEntre = (desde, hasta) => Math.round((fechaDeClave(hasta) - fechaDeClave(desde)) / 86_400_000);

function deHash(hash) {
  try {
    return { compartido: horarioDeHash(hash) };
  } catch (error) {
    return { error: textoError(error) };
  }
}

// The last week opened in this tab: back from Tu horario, it's still here. Only for the same student, and only in
// memory, so it never reaches the disk.
let ultimo = null;
const recordar = (compartido) => {
  ultimo = { compartido, usuario: usuarioActual() };
};

/** Reads without changing anything: React may call this more than once. The effect of the page does the cleaning. */
function entradaInicial() {
  if (hayHorarioEnHash(window.location.hash)) return deHash(window.location.hash);
  const usuario = usuarioActual();
  return ultimo && usuario !== null && ultimo.usuario === usuario ? { compartido: ultimo.compartido } : null;
}

// The week must not stay in the bar or in the history. Keeps history.state: it belongs to the router.
function sacarHash() {
  if (window.location.hash) window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
}

/** One day of the two weeks: on a computer, two lanes (the student's on the left) with the classes they take together
 * across both and the gaps free for both; on a phone, one list in the order of the day. */
function Dia({ dia, paso, inicio, fin, esHoy }) {
  const idTitulo = `juntos-dia-${dia.dia}`;
  // Each lane with its classes and the ones together, so two classes at once go side by side.
  const enCarril = (clases) => clases.map(([id, c]) => ({ id, desde: c.desde, hasta: c.hasta }));
  const lugaresDe = (propias, prefijo, juntas) => carrilesDelDia(enCarril([...propias.map((c) => [`${prefijo}${c.id}`, c]), ...juntas.map((j) => [`j${j.mia.id}`, j.mia])]), inicio, fin);
  const primeros = [lugaresDe(dia.mias, 'm', dia.juntas), lugaresDe(dia.suyas, 's', dia.juntas)];
  // One together goes across both lanes when it's alone in both. Next to another class in only one of them, it goes
  // once, in the other: a lane split in two can't be read. Next to others in both, in each lane.
  const columnas = new Map(dia.juntas.map((j) => {
    const [a, b] = primeros.map((l) => l.get(`j${j.mia.id}`).carriles === 1);
    return [j, a && b ? [1, 2] : a ? [1] : b ? [2] : [1, 2]];
  }));
  const enColumna = (n) => dia.juntas.filter((j) => columnas.get(j).includes(n));
  const mios = lugaresDe(dia.mias, 'm', enColumna(1));
  const suyos = lugaresDe(dia.suyas, 's', enColumna(2));
  const entradas = [
    ...dia.mias.map((c) => ({ clave: `m${c.id}`, quien: 'vos', clase: c, lugar: mios.get(`m${c.id}`), columna: 1 })),
    ...dia.suyas.map((c) => ({ clave: `s${c.id}`, quien: 'suya', clase: c, lugar: suyos.get(`s${c.id}`), columna: 2 })),
    ...dia.juntas.flatMap((j) => {
      const clave = `j${j.mia.id}`;
      const clase = { ...j.mia, aula: j.mia.aula || j.suya.aula };
      const donde = columnas.get(j);
      const lugar = (n) => (n === 1 ? mios : suyos).get(clave);
      if (donde.length === 2 && lugar(1).carriles === 1 && lugar(2).carriles === 1) return [{ clave, quien: 'juntos', clase, lugar: lugar(1), columna: 1, ancho: 2 }];
      return donde.map((n) => ({ clave: `${clave}-${n}`, quien: 'juntos', clase, lugar: lugar(n), columna: n }));
    }),
    ...dia.huecos.map((h) => ({ clave: `h${h.desde}`, quien: 'hueco', clase: h })),
  ].sort((x, y) => x.clase.desde - y.clase.desde || ORDEN[x.quien] - ORDEN[y.quien]);

  return (
    <section className="horario__dia" data-hoy={esHoy ? '' : undefined} data-vacio={dia.sinClases ? '' : undefined} aria-labelledby={idTitulo}>
      <h2 id={idTitulo} className="horario__nombre-dia">
        {DIAS_DE_CLASE[dia.dia - 1]}
        {esHoy && <span className="horario__hoy">hoy</span>}
      </h2>
      <p className="juntos__quienes" aria-hidden="true"><span>Vos</span><span>Tu compañero</span></p>
      {dia.sinClases ? (
        <div className="juntos__clases">
          <p className="horario__libre juntos__sin-clases">Sin clases los dos</p>
        </div>
      ) : (
        <ol className="juntos__clases">
          {entradas.map((e) => {
            const filas = { '--desde': paso(e.clase.desde), '--hasta': paso(e.clase.hasta) };
            if (e.quien === 'hueco') {
              return (
                <li key={e.clave} className="juntos__hueco" data-corto={e.clase.hasta - e.clase.desde < 45 ? '' : undefined} style={filas}>
                  <span className="juntos__hueco-texto">Libres los dos<span className="solo-lectores">, </span></span>
                  <span className="juntos__hueco-hora">{deA(e.clase)}</span>
                </li>
              );
            }
            const estilo = { ...filas, '--columna': e.columna, '--ancho': e.ancho ?? 1, '--carril': e.lugar.carril, '--carriles': e.lugar.carriles };
            return (
              <li key={e.clave} className="juntos__bloque" data-quien={e.quien} data-amano={e.clase.aMano ? '' : undefined} data-estrecho={e.lugar.carriles > 1 ? '' : undefined} style={estilo}>
                <div className="juntos__clase">
                  <span className="juntos__quien">{QUIEN[e.quien]}<span className="solo-lectores">, </span></span>
                  <span className="juntos__hora">{deA(e.clase)}</span>
                  <span className="juntos__materia">{e.clase.materia}</span>
                  {e.clase.aula && <span className="juntos__aula">{e.clase.aula}</span>}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function SemanaDeDos({ dias, hoy }) {
  const todas = dias.flatMap((d) => [...d.mias, ...d.suyas, ...d.juntas.map((j) => j.mia)]);
  const inicio = Math.floor(Math.min(...todas.map((c) => c.desde)) / 60) * 60;
  const fin = Math.ceil(Math.max(...todas.map((c) => c.hasta)) / 60) * 60;
  const paso = (minutos) => Math.round((minutos - inicio) / 5) + 1;
  const horas = [];
  for (let h = inicio; h < fin; h += 60) horas.push(h);
  const diaDeHoy = new Date().getDay();
  return (
    <div className="horario__semana juntos__semana" style={{ '--filas': (fin - inicio) / 5, '--dias': dias.length }}>
      <ol className="horario__horas" aria-hidden="true">
        {horas.map((h) => <li key={h} style={{ '--desde': paso(h) }}>{horaEnTexto(h)}</li>)}
      </ol>
      {dias.map((d) => <Dia key={d.dia} dia={d} paso={paso} inicio={inicio} fin={fin} esHoy={hoy && d.dia === diaDeHoy} />)}
    </div>
  );
}

/** The gaps both have free, day by day, in words. */
function Libres({ dias }) {
  const conAlgo = dias.filter((d) => d.huecos.length || d.sinClases);
  return (
    <section className="bloque juntos__libres" aria-labelledby="juntos-libres">
      <h2 id="juntos-libres">Libres los dos</h2>
      {conAlgo.length ? (
        <ul className="juntos__lista">
          {conAlgo.map((d) => (
            <li key={d.dia}>
              <strong>{DIAS_DE_CLASE[d.dia - 1]}</strong>
              {d.sinClases ? ', sin clases los dos.' : `, ${enLista(d.huecos.map((h) => `de ${deA(h)}`))}.`}
            </li>
          ))}
        </ul>
      ) : (
        <p>Este cuatrimestre no les queda ningún hueco libre a los dos entre clases.</p>
      )}
    </section>
  );
}

/** A subject of the classmate: what it is for the student and, if it isn't the same, the way to take it like them. */
function FilaSuya({ suya, misMaterias, horarios, extrasLlenas, hecha, onHecha, onDeshecha }) {
  const { avisar, confirmar } = useUI();
  const fila = useRef(null);
  const botonDeshacer = useRef(null);
  const { estado, mia } = estadoDe(suya, misMaterias);
  const c = suya.comision;
  const enLosHorarios = Boolean(c) && comisionesDeLaMateria(horarios, suya.materia).some((o) => o.codigo === c);
  // Something to copy: its commission, or the classes they loaded by hand.
  const hayQue = (c && enLosHorarios) || Boolean(suya.clases);
  const puedePasar = estado === 'otra' && Boolean(c) && hayQue;
  const puedeSumar = estado === 'falta' && hayQue && (mia || !extrasLlenas);

  useEffect(() => {
    if (hecha) botonDeshacer.current?.focus();
  }, [hecha]);

  let dato;
  if (hecha) dato = hecha.texto;
  else if (estado === 'juntos') dato = `Comisión ${c}. La cursan juntos.`;
  else {
    const suyo = c ? `Tu compañero está en la ${c}` : 'Tu compañero cargó sus horarios a mano';
    let tuyo;
    if (estado === 'falta') tuyo = 'Vos no la cursás.';
    else if (!c) tuyo = '';
    else if (mia.codigo) tuyo = `Vos, en la ${mia.codigo}.`;
    else tuyo = mia.aMano ? 'Vos la cargaste a mano.' : 'Vos todavía no elegiste comisión.';
    dato = `${suyo}.${tuyo ? ` ${tuyo}` : ''}`;
    if (c && !enLosHorarios && !suya.clases) dato += ' Su comisión ya no está en los horarios de la facultad.';
    else if (estado === 'falta' && !mia && extrasLlenas) dato += ` Ya sumaste ${MAX_MATERIAS_DE_LA_FACULTAD} materias, el máximo.`;
  }

  const copiar = async () => {
    const pasar = estado === 'otra';
    let texto;
    if (pasar) {
      const aMano = suya.clases ? ' También pasan los horarios que cambió a mano.' : mia.aMano ? ' Lo que cambiaste a mano vuelve a los horarios de la facultad.' : '';
      texto = `${suya.materia} queda en la misma comisión que tu compañero.${aMano}`;
    } else texto = c ? `Queda en tus materias, en la ${c} como tu compañero.` : 'Queda en tus materias, con los horarios que cargó tu compañero.';
    const seguro = await confirmar({ titulo: pasar ? `¿Pasarte a la ${c}?` : `¿Sumar ${suya.materia}?`, texto, boton: pasar ? 'Pasarme' : 'Sumar' });
    if (!seguro) return;
    try {
      const antes = copiarMateria(suya, mia);
      onHecha(suya.id, { antes, texto: pasar ? `Te pasaste a la ${c}.` : 'Quedó en tus materias.' });
    } catch (falla) {
      avisar(textoError(falla), 'error');
    }
  };

  const deshacer = () => {
    try {
      deshacerCopia(hecha.antes);
    } catch (falla) {
      avisar(textoError(falla), 'error');
      return;
    }
    onDeshecha(suya.id);
    avisar('Quedó como estaba.');
    // The button that was pressed is gone: to the one that took its place.
    requestAnimationFrame(() => fila.current?.querySelector('button')?.focus());
  };

  const idDato = `juntos-mat-${suya.id}`;
  return (
    <li ref={fila} className="juntos__mat" data-quien={estado === 'juntos' ? 'juntos' : 'suya'}>
      <span className="juntos__mat-nombre">
        {suya.materia}
        <span id={idDato} className="juntos__mat-dato">{dato}</span>
      </span>
      {hecha ? (
        <button ref={botonDeshacer} type="button" className="boton boton--secundario boton--chico" aria-describedby={idDato} onClick={deshacer}>Deshacer</button>
      ) : (
        <>
          {puedePasar && <button type="button" className="boton boton--secundario boton--chico" aria-label={`Pasarme a la ${c} en ${suya.materia}`} onClick={copiar}>Pasarme a la {c}</button>}
          {puedeSumar && <button type="button" className="boton boton--secundario boton--chico" aria-label={`Sumar ${suya.materia}`} onClick={copiar}>Sumarla</button>}
        </>
      )}
    </li>
  );
}

function Comparar({ compartido }) {
  const mio = useMio();
  const hoy = hoyClave();
  const [cuatri, setCuatri] = useState(() => cuatrimestreQueSigue(hoy));
  // What the student copied, by the classmate's subject: how to undo it, until they leave the screen.
  const [hechas, setHechas] = useState({});
  const { datos, error, cargando, recargar } = useConsulta(async () => {
    await cargarPerfil();
    const [{ enCurso }, horarios] = await Promise.all([cargarMaterias(), cargarHorarios()]);
    return { cursos: enCurso, horarios };
  });

  useEffect(() => {
    if (datos) recordar(compartido);
  }, [datos, compartido]);

  const horarios = datos?.horarios ?? null;
  const suyo = useMemo(() => (horarios ? conLosHorarios(compartido, horarios) : null), [compartido, horarios]);
  const mia = useMemo(() => (datos ? armarSemana({ datos: horarios, cursos: datos.cursos, mio, cuatrimestre: cuatri }) : null), [datos, horarios, mio, cuatri]);
  const suya = useMemo(() => (suyo ? semanaCompartida(suyo.materias, horarios, cuatri) : null), [suyo, horarios, cuatri]);
  const dias = useMemo(() => (mia && suya ? juntarSemanas(mia.clases, suya.clases) : null), [mia, suya]);

  if (error && !datos) return <ErrorConReintento texto={error} recargar={recargar} />;
  if (cargando && !datos) return <Cargando texto="Armando las dos semanas" />;
  if (!datos) return null;

  if (!suyo.materias.length) {
    return (
      <>
        <div className="mensaje mensaje--error" role="alert"><p>Las materias de este horario no están en los horarios de la facultad de este año. Pedile a tu compañero un link nuevo.</p></div>
        <p className="juntos__pie"><Link className="boton boton--secundario" to="/horario">Ir a tu horario</Link></p>
      </>
    );
  }

  const viejo = (compartido.ciclo && compartido.ciclo !== horarios.ciclo) || (compartido.fecha && diasEntre(compartido.fecha, hoy) > VIEJO);
  const hayClases = dias.some((d) => !d.sinClases);
  const extrasLlenas = (mio.horario?.extras?.length ?? 0) >= MAX_MATERIAS_DE_LA_FACULTAD;
  const elegirCuatri = (n) => setCuatri(n);

  return (
    <>
      <p className="juntos__intro">
        Tu semana y la de tu compañero, una al lado de la otra.
        {compartido.fecha && ` Su link es del ${diaYMes(compartido.fecha, hoy)}.`}
      </p>
      {viejo && <p className="horario__aviso" data-tono="viejo">Este horario tiene un tiempo. Si tu compañero cambió de comisión, pedile un link nuevo.</p>}
      {suyo.faltan > 0 && (
        <p className="horario__aviso">
          {suyo.faltan === 1 ? 'Una materia de tu compañero no está' : `${suyo.faltan} materias de tu compañero no están`} en los horarios de la facultad y {suyo.faltan === 1 ? 'quedó' : 'quedaron'} afuera.
        </p>
      )}

      <div className="horario__barra">
        <div className="horario__cuatri">
          <span id="juntos-cuatri" className="campo__etiqueta">Cuatrimestre</span>
          <div className="tipos" role="group" aria-labelledby="juntos-cuatri">
            {[1, 2].map((n) => (
              <button key={n} type="button" className="tipos__opcion" aria-pressed={cuatri === n} onClick={() => elegirCuatri(n)}>
                {n === 1 ? 'Primero' : 'Segundo'}
              </button>
            ))}
          </div>
        </div>
        <ul className="juntos__leyenda" aria-label="Colores">
          {['vos', 'suya', 'juntos'].map((q) => <li key={q}><span className="juntos__muestra" data-quien={q} aria-hidden="true" />{QUIEN[q]}</li>)}
          <li><span className="juntos__muestra" data-quien="hueco" aria-hidden="true" />Libres los dos</li>
        </ul>
      </div>

      {hayClases ? (
        <SemanaDeDos dias={dias} hoy={cuatrimestreEl(hoy) === cuatri} />
      ) : (
        <div className="bloque horario__vacio">
          <h2>Sin clases este cuatrimestre</h2>
          <p>Ninguno de los dos tiene clases en el {cuatri === 1 ? 'primero' : 'segundo'}. Mirá el otro.</p>
        </div>
      )}

      {hayClases && <Libres dias={dias} />}

      <section className="bloque juntos__materias" aria-labelledby="juntos-materias">
        <h2 id="juntos-materias">Sus materias</h2>
        <p className="juntos__ayuda">Podés pasarte a su comisión o sumar las que no cursás. Antes te preguntamos. Lo podés deshacer.</p>
        <ul className="juntos__mat-lista">
          {suyo.materias.map((s) => (
            <FilaSuya
              key={s.id}
              suya={s}
              misMaterias={mia.materias}
              horarios={horarios}
              extrasLlenas={extrasLlenas}
              hecha={hechas[s.id] ?? null}
              onHecha={(id, hecha) => setHechas((h) => ({ ...h, [id]: hecha }))}
              onDeshecha={(id) => setHechas((h) => ({ ...h, [id]: undefined }))}
            />
          ))}
        </ul>
      </section>

      <p className="juntos__pie"><Link className="boton boton--secundario" to="/horario">Ir a tu horario</Link></p>
    </>
  );
}

export default function HorarioCompartido() {
  useSeo({ titulo: tituloDe('Horario compartido'), noindex: true });
  const [entrada, setEntrada] = useState(entradaInicial);
  const [tanda, setTanda] = useState(0);

  useEffect(() => {
    sacarHash();
    // Another link pasted in this same tab changes only the hash: the page doesn't load again.
    const alCambiarHash = () => {
      if (!hayHorarioEnHash(window.location.hash)) return;
      setEntrada(deHash(window.location.hash));
      setTanda((t) => t + 1);
      sacarHash();
    };
    window.addEventListener('hashchange', alCambiarHash);
    return () => window.removeEventListener('hashchange', alCambiarHash);
  }, []);

  return (
    <div className="contenedor pagina horario juntos">
      <div className="titular">
        <h1>Horario compartido</h1>
      </div>
      {entrada?.compartido && <Comparar key={tanda} compartido={entrada.compartido} />}
      {entrada?.error && (
        <>
          <div className="mensaje mensaje--error" role="alert"><p>{entrada.error}</p></div>
          <p className="juntos__pie"><Link className="boton boton--secundario" to="/horario">Ir a tu horario</Link></p>
        </>
      )}
      {!entrada && (
        <div className="juntos__sin-link">
          <p>Acá ves tu semana al lado de la de un compañero, con los huecos que tienen libres los dos.</p>
          <p>Pedile que toque «Compartir mi horario» en Tu horario y te pase el link.</p>
          <p className="juntos__pie"><Link className="boton boton--secundario" to="/horario">Ir a tu horario</Link></p>
        </div>
      )}
    </div>
  );
}
