import { useEffect, useLayoutEffect, useRef } from 'react';
import { cronometros, cuandoTermina, termino } from '../../lib/enVivo/cronometros';

// The countdowns of the session's Cronómetro (`datos`, cronometrosDeLaSesion): when one reaches zero,
// `alTerminar(cronometro)`, once, whether the panel is open or not. One that had already ended when this browser
// looked is not told.
export function useFinDeCuentas(datos, alTerminar) {
  const avisar = useRef(alTerminar);
  useLayoutEffect(() => {
    avisar.current = alTerminar;
  });

  useEffect(() => {
    const clave = (c) => `${c.id}:${c.desde}`;
    const terminadas = (ahora) => cronometros(datos).filter((c) => c.desde && termino(c, ahora));
    const avisadas = new Set(terminadas(Date.now()).map(clave));

    let reloj = null;
    const revisar = () => {
      clearTimeout(reloj);
      const ahora = Date.now();
      for (const c of terminadas(ahora)) {
        if (avisadas.has(clave(c))) continue;
        avisadas.add(clave(c));
        avisar.current(c);
      }
      const proximo = Math.min(...cronometros(datos).map((c) => cuandoTermina(c, ahora) ?? Infinity));
      if (proximo < Infinity) reloj = setTimeout(revisar, Math.max(50, proximo - ahora + 20));
    };
    revisar();
    datos.observe(revisar);
    return () => {
      clearTimeout(reloj);
      datos.unobserve(revisar);
    };
  }, [datos]);
}

/** Three short soft beeps. Silent where the browser doesn't let it play. */
export function sonarFin() {
  try {
    const Contexto = window.AudioContext || window.webkitAudioContext;
    if (!Contexto) return;
    const ctx = new Contexto();
    const t = ctx.currentTime + 0.05;
    [0, 0.3, 0.6].forEach((d) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, t + d);
      g.gain.exponentialRampToValueAtTime(0.15, t + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.2);
      o.connect(g).connect(ctx.destination);
      o.start(t + d);
      o.stop(t + d + 0.22);
    });
    setTimeout(() => ctx.close().catch(() => {}), 1500);
  } catch {
    // No sound: the notice is still there.
  }
}
