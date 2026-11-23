import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import Simbolo from './Simbolo';
import { Manija } from './Secciones';
import { Cargando, ErrorConReintento } from './Filas';
import { useUI } from './ui';
import { useCalendarioGoogle } from '../lib/calendarioSincro';
import { cargarMaterias, cargarPerfil } from '../lib/campus';
import { BLOQUES_DE_HOY, CUENTAN_EN_HOY, DIAS_DE_HOY, SEMANAS_DE_HOY, cuentaEnHoy, diasDeHoy, fueraDeHoy, moverBloque, ordenDeHoy, semanaDeHoy } from '../lib/hoy';
import { contarEnHoy, diasEnHoy, materiaEnHoy, mostrarEnHoy, ordenarHoy, semanaEnHoy, useMio } from '../lib/mio';
import { useArrastreDeSecciones } from '../lib/useArrastreDeSecciones';
import { useBotonesSinMouse } from '../lib/sinMouse';
import { useConsulta } from '../lib/useConsulta';
import './ajustesDeHoy.css';

// What Configuración offers for Hoy (hoy.js). It is the student's, not the device's: it goes in mio.js, with their data.
const NO_SE_GUARDO = 'No se pudo guardar en este navegador.';
const NOMBRE = Object.fromEntries(BLOQUES_DE_HOY.map((b) => [b.clave, b.nombre]));
const COLUMNAS = [
  { clave: 'principal', titulo: 'Columna principal' },
  { clave: 'costado', titulo: 'Al costado', ayuda: 'Abajo en el celular y en la vista compacta.' },
];
const QUE_CUENTA = {
  entregas: { nombre: 'Entregas y actividades del campus' },
  cuestionarios: { nombre: 'Cuestionarios' },
  classroom: { nombre: 'Tareas de Classroom' },
  propias: { nombre: 'Tus fechas', ayuda: 'Parciales, finales y entregas que sumaste vos, y tus tareas con fecha.' },
};

const SEMANA = { numeros: 'Con números', calendario: 'Como el Calendario' };

const OTRA = { principal: 'costado', costado: 'principal' };
const PASAR = { principal: 'Pasar al costado', costado: 'Pasar a la principal' };
const A_LA_COLUMNA = { principal: 'a la columna principal', costado: 'al costado' };

const idDeManija = (clave) => `hoy-manija-${clave}`;
const idDeFila = (clave) => `hoy-bloque-${clave}`;

/** One column of Hoy: its blocks in order, each with its handle (drag it, arrows, or a tap for «Subir» and «Bajar») and
 * its switch. */
function Columna({ columna, claves, ocultos, ayudaManija, alAnunciar, alArrastrar, cruce, recibe, pasar }) {
  const mio = useMio();
  const { avisar } = useUI();
  const [moviendo, setMoviendo] = useState(null);
  const conBotones = useBotonesSinMouse();
  const enfocar = useRef(null);
  const titulo = useId();

  const moverA = (clave, lugar) => {
    // Dropped over the other column: AjustesDeHoy passes it there.
    if (cruce.current?.clave === clave) return;
    if (lugar < 0 || lugar >= claves.length || claves.indexOf(clave) === lugar) return;
    if (!ordenarHoy(moverBloque(mio, clave, lugar))) {
      avisar(NO_SE_GUARDO, 'error');
      return;
    }
    alAnunciar(`${NOMBRE[clave]} quedó en el lugar ${lugar + 1} de ${claves.length}.`);
  };
  const arrastre = useArrastreDeSecciones({
    ids: claves,
    elDe: (clave) => document.getElementById(idDeFila(clave)),
    manijaDe: (clave) => document.getElementById(idDeManija(clave)),
    alMover: moverA,
    alTocar: (clave) => setMoviendo((m) => (m === clave ? null : clave)),
  });

  // AjustesDeHoy follows the pointer while a row is dragged: over the other column, it goes there.
  const { arrastrada } = arrastre;
  useEffect(() => {
    alArrastrar(columna.clave, arrastrada);
  }, [alArrastrar, arrastrada, columna.clave]);

  // Moved with «Subir» or «Bajar»: the row changed place and its button lost the focus.
  useLayoutEffect(() => {
    const id = enfocar.current;
    if (!id) return;
    enfocar.current = null;
    document.getElementById(id)?.focus({ preventScroll: true });
  });
  // Escape closes «Subir» and «Bajar», back on the handle.
  useEffect(() => {
    if (moviendo === null) return undefined;
    const alTeclear = (e) => {
      if (e.key !== 'Escape') return;
      setMoviendo(null);
      document.getElementById(idDeManija(moviendo))?.focus();
    };
    document.addEventListener('keydown', alTeclear);
    return () => document.removeEventListener('keydown', alTeclear);
  }, [moviendo]);

  const { clave: col, titulo: nombreColumna, ayuda } = columna;
  return (
    <div className="orden-hoy__columna">
      <h3 id={titulo} className="orden-hoy__titulo">{nombreColumna}</h3>
      {ayuda && <p className="orden-hoy__ayuda">{ayuda}</p>}
      <ul className="orden-hoy" aria-labelledby={titulo} data-columna={col} data-arrastrando={arrastre.arrastrada !== null || undefined} data-recibe={recibe === col || undefined}>
        {claves.map((clave, lugar) => {
          const visible = !ocultos.includes(clave);
          return (
            <li key={clave} id={idDeFila(clave)} className="orden-hoy__fila" data-oculto={visible ? undefined : ''} data-agarrada={arrastre.arrastrada === clave || undefined}>
              <div className="orden-hoy__linea">
                <button
                  id={idDeManija(clave)}
                  type="button"
                  className="orden-hoy__manija"
                  aria-label={`Mover ${NOMBRE[clave]}`}
                  aria-describedby={ayudaManija}
                  aria-expanded={conBotones ? moviendo === clave : undefined}
                  {...arrastre.manija(clave)}
                  onKeyDown={(e) => {
                    // Left and right: to the other column.
                    if ((e.key === 'ArrowRight' && col === 'principal') || (e.key === 'ArrowLeft' && col === 'costado')) {
                      e.preventDefault();
                      pasar(clave, OTRA[col], lugar);
                      return;
                    }
                    arrastre.manija(clave).onKeyDown?.(e);
                  }}
                >
                  <Manija />
                </button>
                <label className="orden-hoy__nombre" htmlFor={`hoy-ver-${clave}`}>{NOMBRE[clave]}</label>
                <input
                  id={`hoy-ver-${clave}`}
                  className="interruptor"
                  type="checkbox"
                  role="switch"
                  checked={visible}
                  data-bloque={clave}
                  onChange={(e) => {
                    if (!mostrarEnHoy(clave, e.target.checked)) avisar(NO_SE_GUARDO, 'error');
                  }}
                />
              </div>
              {moviendo === clave && arrastre.arrastrada === null && (
                <div className="orden-hoy__mover" role="group" aria-label={`Mover ${NOMBRE[clave]}`}>
                  {[['subir', 'Subir', -1], ['bajar', 'Bajar', 1]].map(([que, texto, salto]) => {
                    const destino = lugar + salto;
                    const fuera = destino < 0 || destino >= claves.length;
                    return (
                      <button
                        key={que}
                        id={`hoy-${que}-${clave}`}
                        type="button"
                        className="boton boton--secundario boton--chico"
                        aria-disabled={fuera ? 'true' : undefined}
                        onClick={() => {
                          if (fuera) return;
                          enfocar.current = `hoy-${que}-${clave}`;
                          moverA(clave, destino);
                        }}
                      >
                        {texto}
                      </button>
                    );
                  })}
                  <button id={`hoy-pasar-${clave}`} type="button" className="boton boton--secundario boton--chico" onClick={() => pasar(clave, OTRA[col], lugar)}>
                    {PASAR[col]}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** The blocks of Hoy, their order and which ones show; what enters «Vencimientos»; how far «Próximas fechas» looks. */
export function AjustesDeHoy() {
  const mio = useMio();
  const { avisar } = useUI();
  const ayudaManija = useId();
  const conBotones = useBotonesSinMouse();
  const [anuncio, setAnuncio] = useState('');
  const orden = ordenDeHoy(mio);
  // A row dragged out of its column, over the other one: `recibe` lights that column; dropped there, it goes in at the
  // height it was dropped.
  const [arrastrando, setArrastrando] = useState(null);
  const [recibe, setRecibe] = useState(null);
  const cruce = useRef(null);
  const enCurso = useRef(null);
  const ultimo = useRef(mio);
  useLayoutEffect(() => {
    ultimo.current = mio;
  });
  const pasar = useCallback((clave, col, lugar) => {
    if (!ordenarHoy(moverBloque(ultimo.current, clave, lugar, col))) {
      avisar(NO_SE_GUARDO, 'error');
      return;
    }
    const cuantos = ordenDeHoy(ultimo.current)[col].length + 1;
    setAnuncio(`${NOMBRE[clave]} pasó ${A_LA_COLUMNA[col]}, en el lugar ${Math.min(lugar, cuantos - 1) + 1} de ${cuantos}.`);
    requestAnimationFrame(() => document.getElementById(idDeManija(clave))?.focus({ preventScroll: true }));
  }, [avisar]);
  // A column says a row started (`clave`) or stopped being dragged. Only the column it started in ends it.
  const alArrastrar = useCallback((col, clave) => {
    if (clave) {
      enCurso.current = { col, clave };
      setArrastrando(enCurso.current);
      return;
    }
    if (enCurso.current?.col !== col) return;
    enCurso.current = null;
    const c = cruce.current;
    cruce.current = null;
    setArrastrando(null);
    setRecibe(null);
    if (!c) return;
    const filas = [...document.querySelectorAll(`.orden-hoy[data-columna="${c.a}"] > .orden-hoy__fila`)];
    const lugar = filas.filter((f) => {
      const r = f.getBoundingClientRect();
      return r.top + r.height / 2 < c.y;
    }).length;
    pasar(c.clave, c.a, lugar);
  }, [pasar]);
  useEffect(() => {
    if (!arrastrando) return undefined;
    const otra = OTRA[arrastrando.col];
    const alMover = (e) => {
      const r = document.querySelector(`.orden-hoy[data-columna="${otra}"]`)?.getBoundingClientRect();
      const encima = r && e.clientX >= r.left - 24 && e.clientX <= r.right + 24 && e.clientY >= r.top - 60 && e.clientY <= r.bottom + 60;
      cruce.current = encima ? { clave: arrastrando.clave, a: otra, y: e.clientY } : null;
      setRecibe(encima ? otra : null);
    };
    window.addEventListener('pointermove', alMover);
    return () => window.removeEventListener('pointermove', alMover);
  }, [arrastrando]);
  const cuenta = cuentaEnHoy(mio);
  const dias = diasDeHoy(mio);
  const guardado = (bien) => {
    if (!bien) avisar(NO_SE_GUARDO, 'error');
  };

  return (
    <>
      <fieldset className="ajustes__grupo">
        <legend className="ajustes__leyenda">Bloques</legend>
        <p className="ajustes__ayuda">Arrastralos para ordenarlos o pasarlos de columna. Apagá los que no usás.</p>
        <p id={ayudaManija} hidden>{conBotones ? 'Arrastralo, movelo con las flechas, o tocalo para subirlo, bajarlo o pasarlo de columna.' : 'Arrastralo o movelo con las flechas.'}</p>
        <div className="orden-hoy__columnas">
          {COLUMNAS.map((c) => (
            <Columna
              key={c.clave}
              columna={c}
              claves={orden[c.clave]}
              ocultos={mio.hoy.ocultos}
              ayudaManija={ayudaManija}
              alAnunciar={setAnuncio}
              alArrastrar={alArrastrar}
              cruce={cruce}
              recibe={recibe}
              pasar={pasar}
            />
          ))}
        </div>
        <p className="solo-lectores" role="status">{anuncio}</p>
      </fieldset>

      <fieldset className="ajustes__grupo">
        <legend className="ajustes__leyenda">Qué entra en «Vencimientos»</legend>
        <div className="que-cuenta">
          {CUENTAN_EN_HOY.map((tipo) => (
            <label key={tipo} className="que-cuenta__opcion">
              <input
                type="checkbox"
                checked={cuenta.has(tipo)}
                data-cuenta={tipo}
                onChange={(e) => guardado(contarEnHoy(CUENTAN_EN_HOY.filter((t) => (t === tipo ? e.target.checked : cuenta.has(t)))))}
              />
              <span className="que-cuenta__texto">
                <span>{QUE_CUENTA[tipo].nombre}</span>
                {QUE_CUENTA[tipo].ayuda && <span className="que-cuenta__ayuda">{QUE_CUENTA[tipo].ayuda}</span>}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="ajustes__grupo">
        <legend className="ajustes__leyenda">Hasta cuándo mirar en «Próximas fechas»</legend>
        <div className="elecciones">
          {DIAS_DE_HOY.map((n) => (
            <label key={n} className="eleccion">
              <input type="radio" name="hoy-dias" value={n} checked={dias === n} onChange={() => guardado(diasEnHoy(n))} />
              <span className="eleccion__cuerpo">
                <span className="eleccion__nombre">{n === 7 ? 'Una semana' : n === 14 ? 'Dos semanas' : 'Un mes'}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="ajustes__grupo">
        <legend className="ajustes__leyenda">Semana</legend>
        <div className="elecciones">
          {SEMANAS_DE_HOY.map((forma) => (
            <label key={forma} className="eleccion">
              <input type="radio" name="hoy-semana" value={forma} checked={semanaDeHoy(mio) === forma} onChange={() => guardado(semanaEnHoy(forma))} />
              <span className="eleccion__cuerpo">
                <span className="eleccion__nombre">{SEMANA[forma]}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
    </>
  );
}

/** A list of campus courses, each with its switch: off, it leaves Hoy and the Calendario. */
function ListaDeMaterias({ materias, fuera }) {
  const { avisar } = useUI();
  return (
    <ul className="materias-hoy">
      {materias.map((m) => (
        <li key={m.id} className="materias-hoy__fila">
          <Simbolo id={m.id} nombre={m.nombre} />
          <label className="materias-hoy__nombre" htmlFor={`hoy-materia-${m.id}`}>{m.nombre}</label>
          <input
            id={`hoy-materia-${m.id}`}
            className="interruptor"
            type="checkbox"
            role="switch"
            checked={!fuera.has(m.id)}
            data-materia-hoy={m.id}
            onChange={(e) => {
              if (!materiaEnHoy(m.id, e.target.checked)) avisar(NO_SE_GUARDO, 'error');
            }}
          />
        </li>
      ))}
    </ul>
  );
}

/** The campus courses that show in Hoy and the Calendario. The campus doesn't change. The ones not in progress (an old
 * one still has its dates) go apart, folded unless one of them is out. */
export function MateriasEnHoy() {
  const mio = useMio();
  const conGoogle = useCalendarioGoogle().prendido;
  const materias = useConsulta(async () => {
    await cargarPerfil();
    return cargarMaterias();
  }, [], { alInstante: true });
  if (materias.error && !materias.datos) return <ErrorConReintento texto={materias.error} recargar={materias.recargar} />;
  if (!materias.datos) return <Cargando texto="Buscando tus materias" cuantas={3} />;
  const fuera = fueraDeHoy(mio);
  const { enCurso, otras } = materias.datos;
  return (
    <>
      {!enCurso.length && !otras.length && <p>No tenés materias en el campus.</p>}
      {conGoogle && <p className="ajustes__ayuda">Sus fechas siguen yendo a tu Google Calendar.</p>}
      {enCurso.length > 0 && <ListaDeMaterias materias={enCurso} fuera={fuera} />}
      {otras.length > 0 && (
        <details className="materias-hoy__otras" open={otras.some((m) => fuera.has(m.id)) || !enCurso.length}>
          <summary>{`Las que no estás cursando (${otras.length})`}</summary>
          <ListaDeMaterias materias={otras} fuera={fuera} />
        </details>
      )}
    </>
  );
}
