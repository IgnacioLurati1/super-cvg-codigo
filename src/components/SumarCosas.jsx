import { useEffect, useMemo, useRef, useState } from 'react';
import { borrarDeBodega, guardarEnBodega } from '../lib/bodega';
import { enlaceSeguro } from '../lib/datos';
import { textoError } from '../lib/errores';
import { usuarioActual } from '../lib/mio';
import { esDelSantoResumen, idArchivo, LIMITES } from '../lib/propiasSaneo';
import Campo from './Campo';
import ElegirDelCampus from './ElegirDelCampus';
import ElegirDelClassroom from './ElegirDelClassroom';
import ElegirDelSanto from './ElegirDelSanto';
import { Icono } from './Simbolo';
import TextoConFormato from './TextoConFormato';
import { useUI } from './ui';

const SANTO = 'https://lutastudios.com/utn';

export function FormTexto({ inicial = '', onGuardar, onCancelar }) {
  const { confirmar } = useUI();
  const [texto, setTexto] = useState(inicial);
  const [error, setError] = useState('');
  const campo = useRef(null);
  // What was written is not lost by a slip of Escape.
  const cancelar = async () => {
    if (texto.trim() && texto !== inicial && !(await confirmar({ titulo: '¿Descartar lo que escribiste?', boton: 'Descartar', peligro: true }))) return;
    onCancelar();
  };
  const guardar = (e) => {
    e.preventDefault();
    if (!texto.trim()) {
      setError('Escribí algo.');
      campo.current?.focus();
      return;
    }
    onGuardar(texto);
  };
  return (
    <form className="editor__form" onSubmit={guardar} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); cancelar(); } }} noValidate>
      <Campo etiqueta="Texto" ayuda="**Negrita**, *cursiva*, # al principio para un título y - para una lista. Los links se marcan solos." error={error}>
        <textarea ref={campo} className="campo__control" value={texto} maxLength={LIMITES.texto} rows={6} autoFocus onChange={(e) => { setTexto(e.target.value); setError(''); }} />
      </Campo>
      {texto.trim() && (
        <div className="editor__muestra">
          <p className="editor__muestra-titulo">Así se ve</p>
          <TextoConFormato texto={texto} />
        </div>
      )}
      <div className="propias__botones">
        <button type="submit" className="boton boton--chico">Guardar texto</button>
        <button type="button" className="boton boton--secundario boton--chico" onClick={cancelar}>Cancelar</button>
      </div>
    </form>
  );
}

export function FormEnlace({ inicial, onGuardar, onCancelar }) {
  const [url, setUrl] = useState(inicial?.url ?? '');
  const [titulo, setTitulo] = useState(inicial?.titulo ?? '');
  const [error, setError] = useState('');
  const campo = useRef(null);
  const larga = url.trim().length > LIMITES.url;
  const limpia = larga ? null : enlaceSeguro(url.trim());
  const guardar = (e) => {
    e.preventDefault();
    if (!limpia) {
      setError(larga ? 'Esa dirección es demasiado larga.' : 'Pegá una dirección que empiece con https://');
      campo.current?.focus();
      return;
    }
    onGuardar({ url: limpia, titulo: titulo.trim() });
  };
  return (
    <form className="editor__form" onSubmit={guardar} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onCancelar(); } }} noValidate>
      <Campo etiqueta="Dirección" ayuda={limpia && esDelSantoResumen(limpia) ? 'Es un apunte de El Santo Resumen.' : 'Empieza con https://. Puede ser un apunte o un consejo de El Santo Resumen.'} error={error}>
        <input ref={campo} className="campo__control" type="url" inputMode="url" value={url} autoComplete="off" spellCheck={false} autoFocus onChange={(e) => { setUrl(e.target.value); setError(''); }} />
      </Campo>
      <Campo etiqueta="Cómo se llama" ayuda="Si lo dejás vacío, se ve la dirección">
        <input className="campo__control" value={titulo} maxLength={LIMITES.titulo} autoComplete="off" onChange={(e) => setTitulo(e.target.value)} />
      </Campo>
      <p className="editor__santo">
        <a href={SANTO} target="_blank" rel="noreferrer">Buscar en El Santo Resumen<span className="solo-lectores">, se abre en otra pestaña</span></a>
      </p>
      <div className="propias__botones">
        <button type="submit" className="boton boton--chico">Guardar enlace</button>
        <button type="button" className="boton boton--secundario boton--chico" onClick={onCancelar}>Cancelar</button>
      </div>
    </form>
  );
}

/** Saves the student's files in this browser, one by one. Returns the blocks of the ones saved and what to tell about
 * the rest (too big, or the browser said no). `alAvanzar(texto)` follows the progress. */
export async function guardarArchivos(lista, alAvanzar = () => {}) {
  const grandes = lista.filter((f) => f.size > LIMITES.archivo);
  const entran = lista.filter((f) => f.size <= LIMITES.archivo);
  const usuario = usuarioActual();
  const bloques = [];
  let falla = '';
  for (const [i, f] of entran.entries()) {
    alAvanzar(entran.length === 1 ? 'Guardando el archivo' : `Guardando ${i + 1} de ${entran.length}`);
    const archivoId = idArchivo();
    try {
      await guardarEnBodega(usuario, archivoId, f);
      bloques.push({ tipo: 'archivo', archivoId, nombre: f.name, peso: f.size });
    } catch (err) {
      falla = textoError(err);
      break;
    }
  }
  alAvanzar('');
  const tope = `${Math.round(LIMITES.archivo / 1024 / 1024)} MB`;
  const avisos = [falla, grandes.length === 1 ? `«${grandes[0].name}» pesa más de ${tope} y no se sumó.` : grandes.length ? `${grandes.length} archivos pesan más de ${tope} y no se sumaron.` : ''].filter(Boolean);
  return { bloques, avisos };
}

/** The files that did not fit go away from the browser too. */
export const soltarSobrantes = (bloques) => {
  if (bloques.length) borrarDeBodega(usuarioActual(), bloques.map((b) => b.archivoId)).catch(() => {});
};

/** Everything that can be added to a section or a category: the student's files, a text, a link, notes of El Santo
 * Resumen and things of another course or of Classroom. `onSumar(bloques)` saves them and returns how many went in.
 * `bloques`: what the place already has, to mark what's already there and to know when it's full. */
export default function SumarCosas({ nombre, palabra = 'sección', bloques = [], materias = [], textoCampus = 'Del campus', inicialCampus = null, classroom = null, santo = '', onSumar, onSumado = () => {}, onCerrar = null, enfocar = false }) {
  const { avisar } = useUI();
  const [sumando, setSumando] = useState(null);
  const [estado, setEstado] = useState('');
  const [error, setError] = useState('');
  const archivos = useRef(null);
  const caja = useRef(null);
  const primero = useRef(null);
  const botonTexto = useRef(null);
  const botonEnlace = useRef(null);
  const llena = bloques.length >= LIMITES.bloques;

  useEffect(() => {
    if (enfocar) primero.current?.focus();
  }, [enfocar]);

  // The form goes away: the focus goes back to the button that opened it.
  const cerrarForm = (boton) => {
    setSumando(null);
    requestAnimationFrame(() => (boton.current ?? caja.current)?.focus());
  };

  const sumar = (nuevos, aviso) => {
    const n = onSumar(nuevos);
    if (n < nuevos.length) setError(`No entró todo. Una ${palabra} lleva hasta ${LIMITES.bloques} cosas.`);
    setSumando(null);
    if (n) {
      avisar(aviso(n));
      onSumado(n);
    }
    return n;
  };

  const subirArchivos = async (e) => {
    const lista = [...(e.target.files ?? [])];
    e.target.value = ''; // So the same file can be chosen again.
    if (!lista.length) return;
    setError('');
    const { bloques: nuevos, avisos } = await guardarArchivos(lista, setEstado);
    const n = nuevos.length ? sumar(nuevos, (k) => (k === 1 ? 'Archivo sumado' : `${k} archivos sumados`)) : 0;
    soltarSobrantes(nuevos.slice(n));
    if (avisos.length) setError(avisos.join(' '));
  };

  const yaEstan = useMemo(() => new Set(bloques.filter((b) => b.tipo === 'campus').map((b) => `${b.materiaId}:${b.clave}`)), [bloques]);
  const enlaces = useMemo(() => new Set(bloques.filter((b) => b.tipo === 'enlace').map((b) => b.url)), [bloques]);
  const escribiendo = sumando === 'texto' || sumando === 'enlace';

  return (
    <div ref={caja} className="sumar-cosas" tabIndex={-1}>
      {sumando === 'texto' && (
        <FormTexto
          onGuardar={(texto) => {
            sumar([{ tipo: 'texto', texto }], () => 'Texto sumado');
            cerrarForm(botonTexto);
          }}
          onCancelar={() => cerrarForm(botonTexto)}
        />
      )}
      {sumando === 'enlace' && (
        <FormEnlace
          onGuardar={(enlace) => {
            sumar([{ tipo: 'enlace', ...enlace }], () => 'Enlace sumado');
            cerrarForm(botonEnlace);
          }}
          onCancelar={() => cerrarForm(botonEnlace)}
        />
      )}
      {sumando === 'campus' && (
        <ElegirDelCampus
          materias={materias}
          inicial={inicialCampus}
          yaEstan={yaEstan}
          onAgregar={(nuevos) => sumar(nuevos, (n) => (n === 1 ? 'Sumaste una cosa del campus' : `Sumaste ${n} cosas del campus`))}
          onCerrar={() => setSumando((s) => (s === 'campus' ? null : s))}
        />
      )}
      {sumando === 'classroom' && classroom && (
        <ElegirDelClassroom
          nombre={classroom.nombre}
          inicial={classroom.inicial}
          yaEstan={enlaces}
          onAgregar={(nuevos) => sumar(nuevos, (n) => (n === 1 ? 'Sumaste una cosa del Classroom' : `Sumaste ${n} cosas del Classroom`))}
          onCerrar={() => setSumando((s) => (s === 'classroom' ? null : s))}
        />
      )}
      {sumando === 'santo' && (
        <ElegirDelSanto
          inicial={santo}
          yaEstan={enlaces}
          onAgregar={(nuevos) => sumar(nuevos, (n) => (n === 1 ? 'Sumaste un apunte de El Santo Resumen' : `Sumaste ${n} apuntes de El Santo Resumen`))}
          onCerrar={() => setSumando((s) => (s === 'santo' ? null : s))}
        />
      )}

      {error && <div className="mensaje mensaje--error" role="alert"><p>{error}</p></div>}
      <p className="sumar-cosas__estado" role="status">{estado}</p>

      {!llena && !escribiendo && (
        <div className="sumar-cosas__botones" role="group" aria-label={`Sumar a ${nombre}`}>
          <input ref={archivos} type="file" multiple hidden aria-label="Elegir archivos" onChange={subirArchivos} />
          <button ref={primero} type="button" className="sumar-cosas__opcion" onClick={() => { if (!estado) archivos.current.click(); }} aria-disabled={estado ? 'true' : undefined}>
            <Icono nombre="documento" tono="doc" tamano="mini" />Subir archivos
          </button>
          <button ref={botonTexto} type="button" className="sumar-cosas__opcion" onClick={() => setSumando('texto')}>
            <Icono nombre="texto" tono="texto" tamano="mini" />Un texto
          </button>
          <button ref={botonEnlace} type="button" className="sumar-cosas__opcion" onClick={() => setSumando('enlace')}>
            <Icono nombre="enlace" tono="enlace" tamano="mini" />Un enlace
          </button>
          <button type="button" className="sumar-cosas__opcion" aria-haspopup="dialog" onClick={() => setSumando('santo')}>
            <Icono nombre="libro" tono="pdf" tamano="mini" />De El Santo Resumen
          </button>
          {materias.length > 0 && (
            <button type="button" className="sumar-cosas__opcion" aria-haspopup="dialog" onClick={() => setSumando('campus')}>
              <Icono nombre="actividad" tono="actividad" tamano="mini" />{textoCampus}
            </button>
          )}
          {classroom && (
            <button type="button" className="sumar-cosas__opcion" aria-haspopup="dialog" onClick={() => setSumando('classroom')}>
              <Icono nombre="personas" tono="planilla" tamano="mini" />Del Classroom
            </button>
          )}
          {onCerrar && <button type="button" className="sumar-cosas__cerrar" onClick={onCerrar}>Cerrar</button>}
        </div>
      )}
      {llena && <p className="editor__vacia">Esta {palabra} está llena. Pasá algo a otra o creá una nueva.</p>}
    </div>
  );
}
