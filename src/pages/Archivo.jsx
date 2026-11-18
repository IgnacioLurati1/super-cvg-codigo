import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAbrirPrevia } from '../components/Previa';
import { Cargando, ErrorConReintento } from '../components/Filas';
import { guardarArchivo } from '../lib/archivos';
import { peso, sinExtension } from '../lib/datos';
import { mimeDe, SIN_TIPO } from '../lib/propiasSaneo';
import { tituloDe, useSeo } from '../lib/seo';
import { abrirTemporal, leerFragmento } from '../lib/temporales';
import { useConsulta } from '../lib/useConsulta';
import './compartido.css';

// A file sent without Drive, from the link of a message read in the campus (temporales.js). The link leaves the address
// at once, and the file is brought and unlocked in memory: it shows in the preview or is downloaded.

const sacarHash = () => {
  if (window.location.hash) window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
};

export default function Archivo() {
  useSeo({ titulo: tituloDe('Archivo de un mensaje'), noindex: true });
  const [link, setLink] = useState(() => leerFragmento(window.location.hash));
  const abrirPrevia = useAbrirPrevia();

  useEffect(() => {
    sacarHash();
    // Another link pasted in this same tab changes only the hash.
    const alCambiar = () => {
      const nuevo = leerFragmento(window.location.hash);
      sacarHash();
      if (nuevo) setLink(nuevo);
    };
    window.addEventListener('hashchange', alCambiar);
    return () => window.removeEventListener('hashchange', alCambiar);
  }, []);

  const { datos: archivo, error, cargando, recargar } = useConsulta(async () => (link ? abrirTemporal(link) : null), [link?.id]);

  const conVista = archivo && mimeDe(archivo.nombre) !== SIN_TIPO;
  const ver = () =>
    abrirPrevia({
      id: `temporal-${link.id}`,
      tipo: 'archivo',
      nombre: sinExtension(archivo.nombre),
      archivo: archivo.nombre,
      peso: 0,
      mime: mimeDe(archivo.nombre),
      traer: async () => archivo.blob,
    });

  return (
    <div className="contenedor pagina">
      <h1>Archivo de un mensaje</h1>
      {!link && (
        <>
          <p>Este link no trae un archivo. Abrí el link completo del mensaje, tal como llegó.</p>
          <p><Link to="/mensajes">Ir a Mensajes</Link></p>
        </>
      )}
      {link && cargando && !archivo && <Cargando texto="Trayendo el archivo" cuantas={1} />}
      {error && !cargando && <ErrorConReintento texto={error} recargar={recargar} />}
      {archivo && (
        <>
          <p><strong>{archivo.nombre}</strong>, {peso(archivo.blob.size)}</p>
          <div className="compartido__botones">
            {conVista && <button type="button" className="boton" onClick={ver}>Abrir</button>}
            <button type="button" className={conVista ? 'boton boton--secundario' : 'boton'} onClick={() => guardarArchivo(archivo.blob, archivo.nombre)}>Bajar archivo</button>
          </div>
        </>
      )}
    </div>
  );
}
