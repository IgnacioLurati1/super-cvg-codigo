import { useEffect, useRef, useState } from 'react';
import Campo from '../Campo';
import {
  DURACION, MAX_CRONOMETROS, NOMBRE_DEL_MODO, agregar, cambiarDuracion, cronometros, enPalabras, enReloj, iniciar, pausar, quitar, reiniciar,
  renombrar, restante, termino, transcurrido,
} from '../../lib/enVivo/cronometros';
import { useCambios } from './herramientas/comun';
import { useUI } from '../ui';
import Icono from './Iconos';
import './cronometros.css';

// The Cronómetro of the session, in the bar: stopwatches and countdowns, the same for everyone (cronometros.js), in
// the session's own map. When a countdown ends, the table tells everyone, on any tab (Mesa.jsx, useFinDeCuentas).

/** The time now, again a few times a second while something runs. */
function useAhora(corriendo) {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    if (!corriendo) return undefined;
    const t = setInterval(() => setAhora(Date.now()), 250);
    return () => clearInterval(t);
  }, [corriendo]);
  return ahora;
}

function Reloj({ datos, c, ahora, foco, alQuitar }) {
  const [nombre, setNombre] = useState(null);
  const [minutos, setMinutos] = useState(null);
  const terminado = termino(c, ahora);
  const tiempo = c.modo === 'cuenta' ? restante(c, ahora) : transcurrido(c, ahora);
  const arriba = c.modo === 'cuenta';
  const enCero = !c.desde && c.acumulado === 0;

  const guardarNombre = () => {
    if (nombre !== null) renombrar(datos, c.id, nombre);
    setNombre(null);
  };
  const guardarMinutos = () => {
    const n = Math.round(Number(minutos));
    // Only a real change, and only while it is still at zero: someone may have started it meanwhile.
    if (minutos !== null && Number.isFinite(n) && n > 0 && n * 60_000 !== c.duracion && !c.desde && !c.acumulado) cambiarDuracion(datos, c.id, n * 60_000);
    setMinutos(null);
  };

  let estado = '';
  if (terminado) estado = 'Terminó';
  else if (!c.desde && !enCero) estado = 'En pausa';

  return (
    <li className="ev-crono__uno" data-modo={c.modo} data-corriendo={c.desde && !terminado ? '' : undefined} data-termino={terminado ? '' : undefined}>
      <div className="ev-crono__cabeza">
        <input
          className="ev-crono__nombre"
          aria-label={`Nombre de ${c.nombre}`}
          value={nombre ?? c.nombre}
          maxLength={40}
          onChange={(e) => setNombre(e.target.value)}
          onBlur={guardarNombre}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
        <button type="button" className="ev-crono__quitar" aria-label={`Quitar ${c.nombre}`} title="Quitar" onClick={() => alQuitar(c)}>
          <Icono nombre="cerrar" />
        </button>
      </div>
      <p className="ev-crono__reloj" role="timer" aria-label={terminado ? `${c.nombre} terminó` : enPalabras(tiempo, { arriba })}>
        {enReloj(tiempo, { arriba })}
      </p>
      <p className="ev-crono__estado" aria-hidden={!estado || undefined}>{estado || (c.nombre !== NOMBRE_DEL_MODO[c.modo] ? NOMBRE_DEL_MODO[c.modo] : '')}</p>
      {c.modo === 'cuenta' && enCero && (
        <Campo etiqueta="Minutos">
          <input
            className="campo__control ev-crono__minutos"
            type="number"
            inputMode="numeric"
            step={1}
            min={DURACION.min / 60_000}
            max={DURACION.max / 60_000}
            value={minutos ?? Math.round(c.duracion / 60_000)}
            onChange={(e) => setMinutos(e.target.value)}
            onBlur={guardarMinutos}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
        </Campo>
      )}
      <div className="ev-crono__botones">
        {!terminado && (c.desde ? (
          <button type="button" className="boton boton--chico" data-foco={foco || undefined} onClick={() => pausar(datos, c.id)}>Pausar</button>
        ) : (
          <button type="button" className="boton boton--chico" data-foco={foco || undefined} onClick={() => iniciar(datos, c.id)}>{enCero ? 'Empezar' : 'Seguir'}</button>
        ))}
        {!enCero && <button type="button" className="boton boton--chico boton--secundario" onClick={() => reiniciar(datos, c.id)}>Reiniciar</button>}
      </div>
    </li>
  );
}

/** The panel of the bar: every timer of the session, and adding one. */
export default function Cronometros({ datos }) {
  useCambios(datos);
  const lista = cronometros(datos);
  const ahora = useAhora(lista.some((c) => c.desde));
  const lleno = lista.length >= MAX_CRONOMETROS;
  const { confirmar } = useUI();
  const sumar = useRef(null);
  // Removing one removes it for everyone: asked first, and the focus goes to adding one instead of the page.
  const alQuitar = async (c) => {
    if (!(await confirmar({ titulo: `¿Quitar «${c.nombre}» para todos?`, boton: 'Quitar', peligro: true }))) return;
    quitar(datos, c.id);
    sumar.current?.focus();
  };

  return (
    <div className="ev-crono">
      {lista.length === 0 && <p className="ev-crono__nota">Una cuenta regresiva que termina suena y avisa a todos.</p>}
      {lista.length > 0 && (
        <ul className="ev-crono__lista">
          {lista.map((c, i) => <Reloj key={c.id} datos={datos} c={c} ahora={ahora} foco={i === 0} alQuitar={alQuitar} />)}
        </ul>
      )}
      <div className="ev-crono__sumar">
        <button ref={sumar} type="button" className="boton boton--secundario boton--chico" data-foco={lista.length === 0 || undefined} disabled={lleno} onClick={() => agregar(datos, 'cronometro')}>Sumar cronómetro</button>
        <button type="button" className="boton boton--secundario boton--chico" disabled={lleno} onClick={() => agregar(datos, 'cuenta')}>Sumar cuenta regresiva</button>
      </div>
      {lleno && <p className="ev-crono__nota">Entran {MAX_CRONOMETROS}. Quitá uno para sumar otro.</p>}
    </div>
  );
}

/** What the bar's button says: the time of the countdown closest to its end or, without one, of a running stopwatch. */
export function TextoDeLaBarra({ datos }) {
  useCambios(datos);
  const lista = cronometros(datos);
  const ahora = useAhora(lista.some((c) => c.desde));
  const corriendo = lista.filter((c) => c.desde && !termino(c, ahora));
  const cuenta = corriendo.filter((c) => c.modo === 'cuenta').sort((a, b) => restante(a, ahora) - restante(b, ahora))[0];
  // The visible time is part of the button's name (what is said to a reader or by voice): «Cronómetro, 4:05».
  const tiempo = cuenta ? enReloj(restante(cuenta, ahora), { arriba: true }) : corriendo[0] && enReloj(transcurrido(corriendo[0], ahora));
  if (!tiempo) return 'Cronómetro';
  return (
    <>
      <span className="solo-lectores">Cronómetro, </span>
      <span className="ev-crono__barra">{tiempo}</span>
    </>
  );
}
