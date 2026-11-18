import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { crearSesion, redesLocales } from '../lib/enVivo/sesion';
import { HERRAMIENTAS } from '../lib/enVivo/herramientas';
import { usePestana } from '../components/enVivo/usePestana';

// Only in `npm run dev`: one tool of the table, twice, in two sessions joined in memory (no Realtime), to work on it
// and look at it. /en-vivo/banco?h=pizarra . Each side can follow the other.

function Lado({ sesion, Herramienta, otro }) {
  const [siguiendo, setSiguiendo] = useState(null);
  const mesa = usePestana(sesion, 'p1', { siguiendo, soltar: () => setSiguiendo(null) });
  useEffect(() => {
    sesion.marcarLocal('p', 'p1');
  }, [sesion]);
  return (
    <section style={{ flex: 1, minWidth: 0, border: '1px solid var(--borde, #ccc)', padding: 8 }}>
      <p>
        {sesion.yo.nombre}{' '}
        <button type="button" onClick={() => setSiguiendo(siguiendo ? null : otro)}>{siguiendo ? 'Dejar de seguir' : 'Seguir al otro'}</button>
      </p>
      <Suspense fallback={<p>Cargando…</p>}>
        <Herramienta mesa={mesa} />
      </Suspense>
    </section>
  );
}

export default function BancoEnVivo() {
  const [params] = useSearchParams();
  const tipo = HERRAMIENTAS[params.get('h')] ? params.get('h') : 'documento';
  const Herramienta = useMemo(() => lazy(HERRAMIENTAS[tipo].cargar), [tipo]);
  // Made in the effect: StrictMode runs it twice, and sessions closed by the first cleanup would stay closed.
  const [sesiones, setSesiones] = useState(null);
  useEffect(() => {
    const redes = redesLocales(2);
    const nuevas = [
      crearSesion({ red: redes[0], yo: { nombre: 'Ana', color: '#b4235a', anfitrion: true } }),
      crearSesion({ red: redes[1], yo: { nombre: 'Beto', color: '#1d6fb8' } }),
    ];
    setSesiones(nuevas); // eslint-disable-line react-hooks/set-state-in-effect
    return () => nuevas.forEach((s) => s.cerrar());
  }, []);
  if (!sesiones) return null;
  return (
    <div className="contenedor">
      <h1>Banco: {HERRAMIENTAS[tipo].nombre}</h1>
      <div style={{ display: 'flex', gap: 12 }}>
        <Lado sesion={sesiones[0]} Herramienta={Herramienta} otro={sesiones[1].yo.id} />
        <Lado sesion={sesiones[1]} Herramienta={Herramienta} otro={sesiones[0].yo.id} />
      </div>
    </div>
  );
}
