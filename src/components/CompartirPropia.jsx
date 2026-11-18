import { useEffect, useMemo, useRef, useState } from 'react';
import { guardarArchivo } from '../lib/archivos';
import { peso } from '../lib/datos';
import { textoError } from '../lib/errores';
import { archivoDeMateria, hashDeMateria, nombreDelArchivo, porQueNoEntra, tieneArchivos } from '../lib/paquetePropia';
import Campo from './Campo';
import DetallesAnimados from './DetallesAnimados';
import '../pages/compartido.css';

// Over this some apps cut a link when it's pasted. It still works, so it warns and doesn't stop.
const LINK_LARGO = 8000;

/** Passing a course of one's own to someone else: a link if it has no files of its own, a file always. */
export default function CompartirPropia({ propia }) {
  const [aviso, setAviso] = useState('');
  const [error, setError] = useState('');
  const [armando, setArmando] = useState(false);
  const [sinPortapapeles, setSinPortapapeles] = useState(false);
  const campoLink = useRef(null);
  const reloj = useRef(null);
  const conArchivos = tieneArchivos(propia);
  const archivos = propia.categorias.flatMap((c) => c.bloques.filter((b) => b.tipo === 'archivo'));
  const total = archivos.reduce((s, b) => s + b.peso, 0);
  // Checked before building: a ZIP the other student can't open is not worth the wait.
  const noEntra = conArchivos ? porQueNoEntra(propia) : '';

  const { link, errorLink } = useMemo(() => {
    if (conArchivos) return { link: '', errorLink: '' };
    try {
      return { link: `${window.location.origin}${import.meta.env.BASE_URL}propias/abrir${hashDeMateria(propia)}`, errorLink: '' };
    } catch (falla) {
      return { link: '', errorLink: textoError(falla) };
    }
  }, [propia, conArchivos]);

  useEffect(() => () => clearTimeout(reloj.current), []);

  useEffect(() => {
    if (sinPortapapeles) campoLink.current?.select();
  }, [sinPortapapeles]);

  const avisar = (texto) => {
    setAviso(texto);
    clearTimeout(reloj.current);
    reloj.current = setTimeout(() => setAviso(''), 4000);
  };

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setSinPortapapeles(false);
      avisar('Link copiado.');
    } catch {
      setSinPortapapeles(true);
      campoLink.current?.select();
    }
  };

  const bajar = async () => {
    if (armando) return;
    setArmando(true);
    setError('');
    try {
      guardarArchivo(await archivoDeMateria(propia), nombreDelArchivo(propia));
      avisar('Archivo bajado.');
    } catch (falla) {
      setError(textoError(falla));
    }
    setArmando(false);
  };

  return (
    <DetallesAnimados className="compartir" claseTitulo="compartir__titulo" titulo="Compartir esta materia">
      <div className="compartir__cuerpo">
        <p>Quien la reciba la ve tal cual, con todo lo que escribiste. Lo del campus lo abre con su cuenta, si está en esa materia.</p>
        {conArchivos
          ? <p>Lleva {archivos.length === 1 ? 'tu archivo' : `tus ${archivos.length} archivos`} ({peso(total)}), así que va en un archivo.</p>
          : null}
        {noEntra && <div className="mensaje mensaje--error"><p>{noEntra}</p></div>}
        {!conArchivos && errorLink
          && <div className="mensaje mensaje--error" role="alert"><p>{errorLink}</p></div>}
        <div className="compartir__botones">
          {link && <button type="button" className="boton" onClick={copiar}>Copiar link</button>}
          <button type="button" className={link ? 'boton boton--secundario' : 'boton'} onClick={bajar} disabled={Boolean(noEntra)} aria-disabled={armando ? 'true' : undefined}>{armando ? 'Armando el archivo' : 'Bajar archivo'}</button>
        </div>
        {sinPortapapeles && (
          <Campo etiqueta="Tu link" ayuda="No pudimos copiarlo solo. Copialo de acá.">
            <input ref={campoLink} className="campo__control" type="text" spellCheck={false} readOnly value={link} onFocus={(e) => e.target.select()} />
          </Campo>
        )}
        {link.length > LINK_LARGO && <p className="compartir__nota">Este link es largo y algunas apps lo cortan al pegarlo. Si le llega roto, pasale el archivo.</p>}
        {error && <div className="mensaje mensaje--error" role="alert"><p>{error}</p></div>}
        <p className="compartir__aviso" role="status">{aviso}</p>
      </div>
    </DetallesAnimados>
  );
}
