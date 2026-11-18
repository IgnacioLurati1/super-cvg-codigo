import { useEffect, useRef, useState } from 'react';
import { dictar, puedeDictar, textoParaDecir } from '../../lib/consultron/voz';
import { cargarVoces, crearLectura, elegirVoz, partirTexto } from '../../lib/voz';

// Listen to an answer and dictate a question (lib/consultron/voz.js). Only one answer is read at a time.

let leyendo = null;

/** «Escuchar» under an answer, with a voice of the device. Without one it isn't shown. */
export function Escuchar({ texto }) {
  const [voz, setVoz] = useState(null);
  const [activa, setActiva] = useState(false);
  const esta = useRef(null);
  useEffect(() => {
    const synth = window.speechSynthesis;
    if (!synth) return undefined;
    let vivo = true;
    cargarVoces(synth)
      .then((voces) => vivo && setVoz(elegirVoz(voces)))
      .catch(() => {});
    return () => {
      vivo = false;
      if (leyendo === esta.current) leyendo?.parar();
    };
  }, []);
  if (!voz) return null;
  const alternar = () => {
    if (activa) {
      esta.current?.parar();
      return;
    }
    leyendo?.parar();
    let dado = false;
    const lectura = crearLectura({
      synth: window.speechSynthesis,
      siguiente: async () => {
        if (dado) return null;
        dado = true;
        return { pagina: 1, tramos: partirTexto(textoParaDecir(texto)) };
      },
      decir: (t, rapidez) => {
        const dicho = new window.SpeechSynthesisUtterance(t);
        dicho.voice = voz;
        dicho.lang = voz.lang;
        dicho.rate = rapidez;
        return dicho;
      },
      alCambiar: ({ estado }) => {
        if (estado === null && leyendo === lectura) leyendo = null;
        setActiva(estado !== null);
      },
    });
    esta.current = lectura;
    leyendo = lectura;
    lectura.empezar();
  };
  return (
    <button type="button" className="consultron__copiar" onClick={alternar}>
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        {activa ? <path d="M7 7h10v10H7z" /> : <path d="M4 10v4h4l5 4V6L8 10zM16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11" />}
      </svg>
      {activa ? 'Parar' : 'Escuchar'}
    </button>
  );
}

/** The microphone in the box: what's said goes to the question. Only where the browser recognizes speech on the
 * device. `alTexto(texto)`: the question with what was heard. */
export function Dictar({ base, alTexto, campo }) {
  const [puede, setPuede] = useState(null);
  const [oyendo, setOyendo] = useState(false);
  const [aviso, setAviso] = useState('');
  const control = useRef(null);
  // While it starts (the first time it downloads the language), another touch does nothing.
  const empezando = useRef(false);
  useEffect(() => {
    let vivo = true;
    puedeDictar().then((p) => vivo && setPuede(p));
    return () => {
      vivo = false;
      control.current?.parar();
    };
  }, []);
  if (!puede) return null;
  const alternar = async () => {
    if (oyendo) {
      control.current?.parar();
      return;
    }
    if (empezando.current) return;
    empezando.current = true;
    setAviso(puede === 'bajar' ? 'Bajando el dictado, una sola vez…' : '');
    const antes = base ? `${base.replace(/\s+$/, '')} ` : '';
    control.current = await dictar({
      alTexto: (t) => alTexto((antes + t).slice(0, 1000)),
      alTerminar: (error) => {
        control.current = null;
        setOyendo(false);
        setAviso(error ? 'No te pude escuchar. Revisá el permiso del micrófono.' : '');
        campo?.current?.focus();
      },
    });
    empezando.current = false;
    if (!control.current) {
      setAviso('No se pudo empezar a dictar.');
      return;
    }
    setPuede('listo');
    setAviso('');
    setOyendo(true);
  };
  return (
    <>
      <button type="button" className="consultron__adjuntar" aria-label="Dictar la pregunta" title={oyendo ? 'Dejar de dictar' : 'Dictar la pregunta'} aria-pressed={oyendo} data-oyendo={oyendo || undefined} onClick={alternar}>
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3" />
        </svg>
      </button>
      <span className="solo-lectores" role="status">{oyendo ? 'Te escucho.' : aviso}</span>
      {aviso && <span className="consultron__dictado" aria-hidden="true">{aviso}</span>}
    </>
  );
}
