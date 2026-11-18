import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { largoOpinion, mandarOpinion, MAX_OPINION, MOTIVOS } from '../lib/opinion';
import { tituloDe, useSeo } from '../lib/seo';
import { useSalirSinGuardar } from '../lib/useSalirSinGuardar';

const miles = (n) => n.toLocaleString('es-AR');
const DEL_CAMPO = new Set(['vacio', 'largo']);

// What is left, for the eye on every key, and for a screen reader only when it starts to matter.
function cuantoQueda(restan) {
  if (restan < 0) return { texto: `Sobran ${miles(-restan)} ${-restan === 1 ? 'carácter' : 'caracteres'}`, tramo: 'sobra' };
  return { texto: `Quedan ${miles(restan)} ${restan === 1 ? 'carácter' : 'caracteres'}`, tramo: restan <= 100 ? 'poco' : 'bien' };
}

export default function Opinar() {
  useSeo({ titulo: tituloDe('Opinar'), descripcion: 'Contanos qué le falta a Super CVG, qué no anda o qué te gusta.' });
  const [texto, setTexto] = useState('');
  const [trampa, setTrampa] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [listo, setListo] = useState(false);
  const campo = useRef(null);
  const cierre = useRef(null);
  const id = useId();

  const [anuncio, setAnuncio] = useState('');
  const restan = MAX_OPINION - largoOpinion(texto);
  const queda = cuantoQueda(restan);
  const escribir = (valor) => {
    const nuevo = cuantoQueda(MAX_OPINION - largoOpinion(valor));
    if (nuevo.tramo !== queda.tramo) setAnuncio(nuevo.tramo === 'bien' ? '' : nuevo.texto);
    setTexto(valor);
    if (DEL_CAMPO.has(motivo)) setMotivo('');
  };

  useSalirSinGuardar(Boolean(texto.trim()) && !listo);
  useEffect(() => {
    if (listo) cierre.current?.focus();
  }, [listo]);

  const errorCampo = DEL_CAMPO.has(motivo) ? MOTIVOS[motivo] : '';
  const errorEnvio = motivo && !errorCampo ? MOTIVOS[motivo] : '';

  const mandar = async (e) => {
    e.preventDefault();
    if (enviando) return;
    setMotivo('');
    // Filled by a bot, not by a person: it looks sent and goes nowhere.
    if (trampa) {
      setListo(true);
      return;
    }
    const local = !largoOpinion(texto) ? 'vacio' : restan < 0 ? 'largo' : '';
    if (local) {
      setMotivo(local);
      campo.current?.focus();
      return;
    }
    setEnviando(true);
    const r = await mandarOpinion(texto);
    setEnviando(false);
    if (r.ok) {
      setTexto('');
      setListo(true);
      return;
    }
    setMotivo(r.motivo);
    if (DEL_CAMPO.has(r.motivo)) campo.current?.focus();
  };

  const otra = () => {
    setListo(false);
    setAnuncio('');
    // The field is back after this render.
    requestAnimationFrame(() => campo.current?.focus());
  };

  return (
    <article className="contenedor pagina opinar" aria-labelledby="opinar-titulo">
      <h1 id="opinar-titulo">Opinar</h1>
      {listo ? (
        <section className="opinar__cierre" aria-labelledby="opinar-listo">
          <h2 id="opinar-listo" ref={cierre} tabIndex={-1}>La recibimos</h2>
          <p>La leemos y nos ayuda a decidir qué arreglar o sumar. Como no sabemos quién la mandó, no podemos contestarte.</p>
          <p>Lo que vayamos cambiando lo ves en <Link to="/novedades">Notas del parche</Link>.</p>
          <button type="button" className="boton boton--secundario" onClick={otra}>Mandar otra</button>
        </section>
      ) : (
        <>
          <p className="opinar__bajada">¿Algo que falta, que no anda o que te gusta? Contalo acá, como se lo dirías a un compañero.</p>
          <form className="opinar__formulario" onSubmit={mandar} noValidate>
            <div className="campo">
              <label className="campo__etiqueta" htmlFor={`${id}-texto`}>Tu opinión</label>
              <span id={`${id}-ayuda`} className="campo__ayuda">Por ejemplo, «En el celular no encuentro dónde bajar la materia».</span>
              <textarea
                ref={campo}
                id={`${id}-texto`}
                className="campo__control opinar__texto"
                name="opinion"
                rows={8}
                value={texto}
                onChange={(e) => escribir(e.target.value)}
                aria-invalid={errorCampo ? true : undefined}
                aria-describedby={[`${id}-ayuda`, `${id}-queda`, errorCampo && `${id}-error`].filter(Boolean).join(' ')}
              />
              <div className="opinar__debajo">
                {errorCampo && <span id={`${id}-error`} className="campo__error" role="alert">{errorCampo}</span>}
                <span id={`${id}-queda`} className="opinar__queda" data-tramo={queda.tramo}>{queda.texto}</span>
              </div>
              <span className="solo-lectores" aria-live="polite">{anuncio}</span>
            </div>
            <div className="campo-trampa" aria-hidden="true" inert>
              <label htmlFor={`${id}-web`}>No completes este campo</label>
              <input id={`${id}-web`} name="sitio_web" tabIndex={-1} autoComplete="off" value={trampa} onChange={(e) => setTrampa(e.target.value)} />
            </div>
            <div className="opinar__pie">
              <button type="submit" className="boton" aria-disabled={enviando ? 'true' : undefined}>{enviando ? 'Mandando' : 'Mandar opinión'}</button>
              <p className="opinar__nota">No va tu cuenta ni nada del campus. Se guarda el texto y el día. Se borra al año.</p>
            </div>
            {errorEnvio && <div className="mensaje mensaje--error" role="alert"><p>{errorEnvio}</p></div>}
          </form>
        </>
      )}
    </article>
  );
}
