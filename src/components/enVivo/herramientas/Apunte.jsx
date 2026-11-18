import { useEffect, useRef, useState } from 'react';
import { datosDeApunte, MAX_NOMBRE, sePuedeLlevar, tipoDeBytes } from '../../../lib/enVivo/apunte';
import { renombrarPestana } from '../../../lib/enVivo/mesa';
import { recuperacion } from '../../../lib/enVivo/recuperar';
import EsperaLector from '../../lector/Espera';
import LectorCompartido from './apunte/LectorCompartido';
import ImagenCompartida from './apunte/ImagenCompartida';
import { useCambios } from './useCambios';
import './apunte/apunte.css';

// The Apunte of the table (contract in src/lib/enVivo/herramientas.js): a PDF or a picture someone shared. Its bytes
// come in encrypted parts from whoever has it and stay in this browser's memory only: never on disk, never in the
// cache of read PDFs.

export default function Apunte({ mesa }) {
  useCambios(mesa.datos);
  const datos = datosDeApunte(mesa.datos);
  if (!datos) return <Vacio mesa={mesa} />;
  return <Archivo key={datos.archivo} mesa={mesa} datos={datos} />;
}

function Archivo({ mesa, datos }) {
  const { archivo, de, nombre } = datos;
  const [abierto, setAbierto] = useState(null);
  const [error, setError] = useState('');
  const pedir = mesa.archivos.pedir;

  useEffect(() => {
    let vivo = true;
    pedir(archivo, de)
      .then(async (blob) => {
        const tipo = await tipoDeBytes(blob);
        if (!vivo) return;
        if (!tipo) setError('Este archivo no es un PDF ni una foto.');
        else setAbierto({ blob: tipo === 'pdf' ? blob : new Blob([blob], { type: tipo }), tipo });
      })
      .catch((e) => vivo && setError(e?.conocido ? e.message : 'No llegó el archivo.'));
    return () => {
      vivo = false;
    };
  }, [pedir, archivo, de]);

  // «Guardar en lo mío»: the file itself, a PDF or a PNG/JPG picture (what a section of a course opens).
  const guardable = abierto && ['pdf', 'image/png', 'image/jpeg'].includes(abierto.tipo) ? abierto.blob : null;
  const paraGuardar = mesa.paraGuardar;
  useEffect(() => (guardable ? paraGuardar(() => ({ nombre, archivo: guardable })) : undefined), [guardable, nombre, paraGuardar]);

  if (error) return <p className="apunte-vivo__aviso" role="alert">{error}</p>;
  if (abierto?.tipo === 'pdf') return <LectorCompartido blob={abierto.blob} nombre={nombre} mesa={mesa} />;
  if (abierto) return <ImagenCompartida blob={abierto.blob} nombre={nombre} mesa={mesa} />;

  // Everyone keeps a copy: it comes from whoever has it. Lost only when nobody here has it anymore.
  const { parte = 0, de: total = 0, nadie = false } = mesa.archivos.estado?.(archivo) ?? {};
  const mio = de === mesa.yo.id;
  // Whoever shared it, while here or on their way back from a reload (a session from before `presente` has none).
  const quien = typeof mesa.presente === 'function' ? mesa.presente(de) : null;
  const volver = mio ? recuperacion(archivo) : null;
  let texto = <>Trayendo «{nombre}»{!mio && quien?.nombre ? ` de ${quien.nombre}` : ''}</>;
  if (mio && volver === 'trayendo') texto = <>Recargaste la página. Trayendo «{nombre}» de nuevo.</>;
  else if (mio && volver === 'falla') texto = <>No se pudo traer «{nombre}» de nuevo. Elegilo de tu compu y le llega a todos.</>;
  else if (mio && (volver === 'elegir' || nadie)) texto = <>Recargaste la página y nadie más tenía «{nombre}». Elegilo de nuevo y le llega a todos.</>;
  else if (mio) texto = <>Recargaste la página. Trayendo «{nombre}» de los demás.</>;
  else if (nadie && !quien) texto = <>Quien compartió «{nombre}» se fue de la sesión y nadie más lo tiene.</>;
  else if (nadie) texto = <>Nadie de la sesión tiene «{nombre}». Esperando que {quien.nombre || 'quien lo compartió'} lo vuelva a subir.</>;
  const elegir = mio && (volver === 'elegir' || volver === 'falla' || (nadie && !volver));
  return (
    <div className="apunte-vivo__espera">
      <div className="apunte-vivo__llegando">
        <div role="status">
          <p>{texto}</p>
          {total > 0 && <progress className="apunte-vivo__progreso" max={total} value={parte} aria-label={`Trayendo ${nombre}`} />}
        </div>
        {elegir && <ElegirDeNuevo mesa={mesa} archivo={archivo} nombre={nombre} />}
      </div>
      <EsperaLector />
    </div>
  );
}

// Who shared it from their computer and reloaded, with nobody else having it: the same file again, in the same tab.
function ElegirDeNuevo({ mesa, archivo, nombre }) {
  const campo = useRef(null);
  const [error, setError] = useState('');
  const elegir = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setError('');
    if (!sePuedeLlevar(f, f.name)) {
      setError('Solo se pueden subir PDF o fotos.');
      return;
    }
    try {
      mesa.archivos.compartir(f, nombre, archivo);
    } catch (err) {
      setError(err?.conocido ? err.message : 'No se pudo subir el archivo.');
    }
  };
  return (
    <>
      <button type="button" className="boton" onClick={() => campo.current?.click()}>Elegir el archivo de nuevo</button>
      <input ref={campo} type="file" hidden accept="application/pdf,.pdf,image/png,image/jpeg,image/webp,image/gif" onChange={elegir} />
      {error && <p className="apunte-vivo__aviso" role="alert">{error}</p>}
    </>
  );
}

// A tab opened without a file: whoever wants puts one here from their computer.
function Vacio({ mesa }) {
  const campo = useRef(null);
  const [error, setError] = useState('');
  const subir = (e) => {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    setError('');
    if (!sePuedeLlevar(archivo, archivo.name)) {
      setError('Solo se pueden subir PDF o fotos.');
      return;
    }
    try {
      const nombre = archivo.name.slice(0, MAX_NOMBRE);
      const archivoId = mesa.archivos.compartir(archivo, nombre);
      mesa.doc.transact(() => {
        mesa.datos.set('archivo', archivoId);
        mesa.datos.set('nombre', nombre);
        mesa.datos.set('de', mesa.yo.id);
      });
      renombrarPestana(mesa.doc, mesa.id, nombre);
    } catch (err) {
      setError(err?.conocido ? err.message : 'No se pudo subir el archivo.');
    }
  };
  return (
    <div className="apunte-vivo__vacio">
      <p>Subí un PDF o una foto y lo ven todos los de la sesión.</p>
      <button type="button" className="boton" onClick={() => campo.current?.click()}>Subir un PDF de tu compu</button>
      <input ref={campo} type="file" hidden accept="application/pdf,.pdf,image/png,image/jpeg,image/webp,image/gif" onChange={subir} />
      <p className="apunte-vivo__nota">Hasta 25 MB.</p>
      {error && <p className="apunte-vivo__aviso" role="alert">{error}</p>}
    </div>
  );
}
