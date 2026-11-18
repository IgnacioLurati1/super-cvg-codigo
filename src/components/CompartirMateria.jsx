import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { guardarArchivo } from '../lib/archivos';
import { textoError } from '../lib/errores';
import { useMio } from '../lib/mio';
import { archivoDe, armarPaquete, dejarPaquete, filtrarPaquete, hashDe, leerArchivoPaquete, paqueteVacio } from '../lib/paquete';
import Campo from './Campo';
import DetallesAnimados from './DetallesAnimados';
import '../pages/compartido.css';

// Over this some apps cut a link when it's pasted. It still works, so it warns and doesn't stop.
const LINK_LARGO = 8000;

const contar = (n, uno, varios) => (n === 1 ? `1 ${uno}` : `${n} ${varios}`);

function queLleva(p) {
  const partes = [
    p.secciones.length && contar(p.secciones.length, 'sección oculta', 'secciones ocultas'),
    p.ocultos.length && contar(p.ocultos.length, 'cosa oculta', 'cosas ocultas'),
    Object.keys(p.nombres).length && contar(Object.keys(p.nombres).length, 'nombre nuevo', 'nombres nuevos'),
    Object.keys(p.orden).length && `el orden de ${contar(Object.keys(p.orden).length, 'sección', 'secciones')}`,
    p.fechas.length && contar(p.fechas.length, 'fecha', 'fechas'),
  ].filter(Boolean);
  if (partes.length < 2) return partes.join('');
  return `${partes.slice(0, -1).join(', ')} y ${partes.at(-1)}`;
}

/** A button that asks for a package file and hands it over already checked. Shows its own errors. */
export function ImportarArchivo({ alElegir, texto = 'Importar un archivo', className = 'boton boton--secundario' }) {
  const [error, setError] = useState('');
  const entrada = useRef(null);

  const alCambiar = async (e) => {
    const archivo = e.target.files?.[0];
    e.target.value = ''; // So the same file can be chosen again.
    if (!archivo) return;
    setError('');
    try {
      alElegir(await leerArchivoPaquete(archivo));
    } catch (falla) {
      setError(textoError(falla));
    }
  };

  return (
    <>
      <input ref={entrada} type="file" accept=".json,application/json" hidden aria-label={texto} onChange={alCambiar} />
      <button type="button" className={className} onClick={() => entrada.current.click()}>{texto}</button>
      {error && <div className="mensaje mensaje--error compartir__error" role="alert"><p>{error}</p></div>}
    </>
  );
}

export default function CompartirMateria({ materia, items = [] }) {
  const mio = useMio();
  const navegar = useNavigate();
  const [aviso, setAviso] = useState('');
  const [sinPortapapeles, setSinPortapapeles] = useState(false);
  const campoLink = useRef(null);
  const reloj = useRef(null);

  const paquete = useMemo(() => filtrarPaquete(armarPaquete(materia.id, mio), items), [materia.id, mio, items]);
  const vacio = paqueteVacio(paquete);
  const { link, errorLink } = useMemo(() => {
    if (vacio) return { link: '', errorLink: '' };
    try {
      return { link: `${window.location.origin}${import.meta.env.BASE_URL}compartido${hashDe(paquete)}`, errorLink: '' };
    } catch (falla) {
      return { link: '', errorLink: textoError(falla) };
    }
  }, [paquete, vacio]);

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

  const bajar = () => {
    guardarArchivo(archivoDe(paquete), `orden-super-cvg-${materia.id}.json`);
    avisar('Archivo bajado.');
  };

  const importar = (recibido) => {
    dejarPaquete(recibido);
    navegar('/compartido');
  };

  return (
    <DetallesAnimados className="compartir" claseTitulo="compartir__titulo" titulo="Compartir este orden">
      <div className="compartir__cuerpo">
        {vacio ? (
          <p>Todavía no ordenaste nada en esta materia. Cuando cambies un nombre, ocultes algo o sumes una fecha, lo vas a poder compartir desde acá.</p>
        ) : (
          <>
            <p>Le pasás a la clase cómo dejaste esta materia. Va {queLleva(paquete)}.</p>
            <p>Tus notas, tareas y lo que viste no van. Quien tenga el link puede leer los nombres y las fechas que escribiste.</p>
            {errorLink ? (
              <div className="mensaje mensaje--error" role="alert"><p>{errorLink}</p></div>
            ) : (
              <>
                <div className="compartir__botones">
                  <button type="button" className="boton" onClick={copiar}>Copiar link</button>
                  <button type="button" className="boton boton--secundario" onClick={bajar}>Bajar archivo</button>
                </div>
                {sinPortapapeles && (
                  <Campo etiqueta="Tu link" ayuda="No pudimos copiarlo solo. Copialo de acá.">
                    <input ref={campoLink} className="campo__control" type="text" readOnly value={link} onFocus={(e) => e.target.select()} />
                  </Campo>
                )}
                {link.length > LINK_LARGO && <p className="compartir__nota">Este link es largo y algunas apps lo cortan al pegarlo. Si le llega roto, pasale el archivo.</p>}
              </>
            )}
          </>
        )}
        <p className="compartir__aviso" role="status">{aviso}</p>
        <div className="compartir__importar">
          <p>¿Te pasaron un archivo con un orden? Primero te mostramos qué cambia.</p>
          <ImportarArchivo alElegir={importar} />
        </div>
      </div>
    </DetallesAnimados>
  );
}
