import { useEffect, useMemo, useRef, useState } from 'react';
import { peso } from '../lib/datos';
import { ARCHIVO_FALLAS, AVISO_BYTES, bajarMateria, cuantosEnlaces, planDeZip } from '../lib/zipMateria';
import { useUI } from './ui';
import './herramientas.css';

const cuenta = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

function cierre(resultado) {
  if (resultado.cancelado) return { texto: 'Cancelaste la descarga. No se guardó nada.' };
  const fallaron = resultado.fallaron.length;
  if (!resultado.bajados) return { error: true, texto: 'No se pudo bajar ningún archivo. Probá de nuevo más tarde.' };
  if (!fallaron) return { texto: 'El ZIP está en tus descargas.' };
  return {
    error: true,
    texto: `El ZIP está en tus descargas, pero ${fallaron === 1 ? 'un archivo no se pudo bajar' : `${fallaron} archivos no se pudieron bajar`}. La lista está adentro, en ${ARCHIVO_FALLAS}.`,
  };
}

// Baja mientras seguís usando la pantalla. Salir de la materia la cancela, porque nada de esto vive fuera de la pantalla.
export default function BajarMateria({ materia, items }) {
  const { confirmar } = useUI();
  const plan = useMemo(() => planDeZip(items, materia), [items, materia]);
  const [bajando, setBajando] = useState(false);
  const [progreso, setProgreso] = useState(null);
  const [final, setFinal] = useState(null);
  const control = useRef(null);
  const preguntando = useRef(false);
  const botonCancelar = useRef(null);
  const destino = useRef(null);
  const montado = useRef(true);

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
      control.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (bajando) botonCancelar.current?.focus();
  }, [bajando]);

  const total = plan.archivos.length;
  if (!total) return null;
  const enlaces = cuantosEnlaces(plan);
  const pesoTotal = peso(plan.bytes);

  const bajar = async () => {
    if (control.current || preguntando.current) return;
    if (plan.bytes > AVISO_BYTES) {
      preguntando.current = true;
      const seguir = await confirmar({
        titulo: `¿Bajar ${pesoTotal}?`,
        texto: 'Es mucho. Conviene estar con wifi y quedarte en esta pantalla hasta que termine.',
        boton: 'Bajar igual',
      });
      preguntando.current = false;
      if (!seguir || !montado.current) return;
    }
    const mio = new AbortController();
    control.current = mio;
    setFinal(null);
    setProgreso({ hechos: 0, total, fallaron: 0 });
    setBajando(true);
    let resultado;
    try {
      resultado = cierre(await bajarMateria(plan, { senal: mio.signal, alProgreso: setProgreso }));
    } catch {
      resultado = { error: true, texto: 'No se pudo armar el ZIP, quizás por falta de memoria. Probá ocultando lo que no necesites.' };
    }
    control.current = null;
    setProgreso(null);
    setBajando(false);
    setFinal(resultado);
    destino.current?.focus();
  };

  return (
    <div className="herramienta">
      <p>
        {cuenta(total, 'archivo', 'archivos')}{pesoTotal ? `, ${pesoTotal}` : ''}{enlaces ? `, y ${cuenta(enlaces, 'enlace', 'enlaces')} en una lista aparte` : ''}.
      </p>
      <p className="herramienta__nota">Baja solo lo que no ocultaste.</p>

      {bajando ? (
        <>
          {progreso && <progress className="herramienta__barra" max={progreso.total} value={progreso.hechos} aria-label="Avance de la descarga" />}
          <div className="herramienta__botones">
            <button ref={botonCancelar} type="button" className="boton boton--secundario" onClick={() => control.current?.abort()}>Cancelar</button>
          </div>
          <p className="herramienta__nota">Podés seguir usando la pantalla. Si salís de esta materia, se cancela.</p>
        </>
      ) : (
        <div className="herramienta__botones">
          <button type="button" className="boton" onClick={bajar}>Bajar la materia en un ZIP</button>
        </div>
      )}

      {bajando && progreso && (
        <p className="herramienta__estado">
          Bajando {Math.min(progreso.hechos + 1, progreso.total)} de {progreso.total}.
          {progreso.fallaron > 0 && ` ${progreso.fallaron === 1 ? 'Uno falló' : `Fallaron ${progreso.fallaron}`}. Sigue con el resto.`}
        </p>
      )}

      {/* Only the start and the end are announced: one message per file would drown a screen reader. */}
      <div ref={destino} tabIndex={-1} className="herramienta__estado herramienta__destino" role="status" aria-live="polite">
        {bajando && <p className="solo-lectores">Bajando la materia.</p>}
        {final && (
          <div className={`mensaje${final.error ? ' mensaje--error' : ' mensaje--ok'}`}>
            <p>{final.texto}</p>
          </div>
        )}
      </div>
    </div>
  );
}
