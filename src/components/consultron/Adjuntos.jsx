import { useEffect, useRef, useState } from 'react';
import { ACEPTA, adjuntar, sacar } from '../../lib/consultron/adjuntar';
import { useImagenQuieta } from '../../lib/imagenQuieta';

// What the student attaches to Consultron, on the screen (adjuntar.js does the rest): the button, the attachments in
// the box and in the bubble of their question, what went wrong, and dropping files on the talk.

const Archivo = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h4" /></svg>
);

// A photo shows its thumbnail. Its name says what it is: the image is decoration, so with «Sensible a la luz» it stays
// still (imagenQuieta.js).
function Miniatura({ a }) {
  const { src } = useImagenQuieta(a.url);
  return src ? <img className="consultron__miniatura" src={src} alt="" /> : <span className="consultron__miniatura"><Archivo /></span>;
}

/** The paperclip, before where it looks. Its input is hidden: the button opens it. */
export function BotonAdjuntar() {
  const entrada = useRef(null);
  return (
    <>
      <button type="button" className="consultron__adjuntar" aria-label="Adjuntar" title="Adjuntar fotos o archivos" onClick={() => entrada.current?.click()}>
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M21.4 11.1l-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5" /></svg>
      </button>
      <input
        ref={entrada}
        type="file"
        multiple
        accept={ACEPTA}
        hidden
        onChange={(e) => {
          adjuntar(e.target.files ?? []);
          // The same file can be chosen again after taking it out.
          e.target.value = '';
        }}
      />
    </>
  );
}

/** The attachments in the box, before asking: each one goes out with its button, by keyboard too. `campo`: where the
 * focus goes when the last one goes. */
export function AdjuntosCaja({ pendientes, campo }) {
  const botones = useRef(new Map());
  // The one with the focus: if it goes because it couldn't be read, the focus goes to where to write.
  const enfocado = useRef(null);
  useEffect(() => {
    if (enfocado.current && !pendientes.some((a) => a.id === enfocado.current)) {
      enfocado.current = null;
      if (!document.activeElement || document.activeElement === document.body) campo.current?.focus();
    }
  }, [pendientes, campo]);
  const quitar = (i) => {
    const otro = pendientes[i + 1] ?? pendientes[i - 1];
    enfocado.current = null;
    sacar(pendientes[i].id);
    requestAnimationFrame(() => (otro ? botones.current.get(otro.id)?.focus() : campo.current?.focus()));
  };
  return (
    <ul className="consultron__adjuntos" aria-label="Adjuntos">
      {pendientes.map((a, i) => (
        <li key={a.id} className="consultron__adjunto" data-estado={a.estado}>
          <Miniatura a={a} />
          <span className="consultron__adjunto-nombre" title={a.nombre}>{a.nombre}</span>
          {a.estado === 'leyendo' && <span className="solo-lectores">, leyendo</span>}
          <button
            ref={(b) => {
              if (b) botones.current.set(a.id, b);
              else botones.current.delete(a.id);
            }}
            type="button"
            className="consultron__sacar"
            aria-label={`Sacar ${a.nombre}`}
            onFocus={() => { enfocado.current = a.id; }}
            onBlur={(e) => { if (e.relatedTarget) enfocado.current = null; }}
            onClick={() => quitar(i)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 7l10 10M17 7L7 17" /></svg>
          </button>
        </li>
      ))}
    </ul>
  );
}

// Where a marked piece comes from: a page of a PDF, or an HTML summary, which has none.
const dondeMarcado = (pagina) => (pagina ? `Lo que marcaste, página ${pagina}` : 'Lo que marcaste');

/** What the student marked in a PDF or an HTML summary to ask about, in the box before asking, with its button to take it out. */
export function Marcado({ trozo, alSacar }) {
  return (
    <div className="consultron__marcado">
      <p className="consultron__marcado-texto">
        <span className="consultron__marcado-donde">{dondeMarcado(trozo.pagina)}</span>
        <q>{trozo.texto}</q>
      </p>
      <button type="button" className="consultron__sacar" aria-label="Sacar lo que marcaste" onClick={alSacar}>
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 7l10 10M17 7L7 17" /></svg>
      </button>
    </div>
  );
}

/** What went with a question, under its bubble: what was marked in a PDF, and the attachments. */
export function AdjuntosPregunta({ adjuntos }) {
  const marcados = adjuntos.filter((a) => a.clase === 'marcado');
  const archivos = adjuntos.filter((a) => a.clase !== 'marcado');
  return (
    <>
      {marcados.map((a) => (
        <p key={a.id} className="consultron__marcado-texto consultron__marcado-texto--pregunta">
          <span className="consultron__marcado-donde">{dondeMarcado(a.pagina)}</span>
          <q>{a.nombre}</q>
        </p>
      ))}
      {archivos.length > 0 && (
        <ul className="consultron__adjuntos consultron__adjuntos--pregunta" aria-label="Lo que adjuntaste">
          {archivos.map((a) => (
            <li key={a.id} className="consultron__adjunto">
              <Miniatura a={a} />
              <span className="consultron__adjunto-nombre" title={a.nombre}>{a.nombre}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** Why some files didn't go, next to the box. */
export function ProblemasAdjuntos({ problemas }) {
  return (
    <div className="consultron__problemas" role="alert">
      {problemas.map((p, i) => <p key={i}>{p}</p>)}
    </div>
  );
}

/** What the status line says while it reads what was attached (adjuntar.js, `leyendo`) or once it read it (`hecho`). */
export function textoDeAdjuntos(leyendo, hecho) {
  if (leyendo?.clase === 'foto') {
    if (leyendo.fase === 'preparando') return 'Preparando el lector de fotos…';
    // How much is done changes all the time: a screen reader hears only that it's reading.
    return <>Leyendo la foto…<span aria-hidden="true"> {Math.round((leyendo.fraccion ?? 0) * 100)} %</span></>;
  }
  if (leyendo) return leyendo.clase === 'pdf' ? 'Leyendo el PDF…' : 'Leyendo el archivo…';
  return { foto: 'Leyó la foto que adjuntaste.', pdf: 'Leyó el PDF que adjuntaste.', texto: 'Leyó el archivo que adjuntaste.', varios: 'Leyó lo que adjuntaste.' }[hecho] ?? '';
}

const conArchivos = (e) => [...(e.dataTransfer?.types ?? [])].includes('Files');

/** Files dropped on the talk: { arrastrando, props } for its outer element. */
export function useSoltar() {
  const [arrastrando, setArrastrando] = useState(false);
  const props = {
    onDragEnter: (e) => {
      if (!conArchivos(e)) return;
      e.preventDefault();
      setArrastrando(true);
    },
    onDragOver: (e) => {
      if (!conArchivos(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    },
    onDragLeave: (e) => {
      if (!e.currentTarget.contains(e.relatedTarget)) setArrastrando(false);
    },
    onDrop: (e) => {
      if (!conArchivos(e)) return;
      e.preventDefault();
      setArrastrando(false);
      adjuntar(e.dataTransfer.files);
    },
  };
  return { arrastrando, props };
}

/** A photo or a file pasted where the question is written goes as an attachment; a text, as it is. */
export function alPegar(e) {
  const archivos = [...(e.clipboardData?.files ?? [])];
  if (!archivos.length) return;
  e.preventDefault();
  adjuntar(archivos);
}
