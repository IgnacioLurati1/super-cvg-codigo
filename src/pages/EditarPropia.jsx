import { useEffect, useId, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import Campo from '../components/Campo';
import { CursoDePropia } from '../components/Classroom';
import { extension } from '../components/Filas';
import { Icono } from '../components/Simbolo';
import SumarCosas, { FormEnlace, FormTexto } from '../components/SumarCosas';
import { useUI } from '../components/ui';
import { dominioDe } from '../lib/datos';
import { useGoogle } from '../lib/google';
import { alternarEn, alternarSeccion, materiaDe, renombrarSeccion, useMio } from '../lib/mio';
import {
  agregarBloques, agregarCategoria, borrarBloque, borrarCategoria, borrarPropia, cambiarBloque, esAgregada, moverBloque, pasarBloque, propiaDe, renombrarCategoria, renombrarPropia,
} from '../lib/propias';
import { esDelSantoResumen, LIMITES } from '../lib/propiasSaneo';
import { resumenDe } from '../lib/santoResumen';
import { faltaDe, iconoSinCampus, itemDeCampus, nombreSinCampus, primeraLinea, TEXTO_FALTA } from '../lib/propiasVista';
import { simboloDeItem, tonoDeItem } from '../lib/simbolos';
import { tituloDe, useSeo } from '../lib/seo';
import { useCampusDePropia } from '../lib/useCampusDePropia';
import { useSeccionesDePropia } from '../lib/useSeccionesDePropia';
import './panel.css';
import './propias.css';

const CLASE = { archivo: 'Archivo', enlace: 'Enlace', actividad: 'Actividad', texto: 'Texto' };

// Moving a node in the document drops its focus: it comes back to the same button, or to its pair at an edge.
const enfocarLuego = (ref, par) => requestAnimationFrame(() => (ref.current?.disabled ? par : ref).current?.focus());

// A campus block has no name of its own: it comes from the campus, like in the course itself.
function nombreDe(b, campus) {
  if (b.tipo === 'texto') return primeraLinea(b.texto) || 'Texto';
  if (b.tipo === 'enlace') return b.titulo || dominioDe(b.url);
  if (b.tipo === 'campus') return itemDeCampus(b, campus.contenidos)?.nombre ?? nombreSinCampus(b);
  return b.nombre;
}

// The drawing and color of a block, as in the course itself. A campus item that isn't there anymore has no color.
function iconoDe(b, campus) {
  let item;
  if (b.tipo === 'campus') item = itemDeCampus(b, campus.contenidos);
  else if (b.tipo === 'archivo') item = { tipo: 'archivo', archivo: b.nombre, mime: b.mime };
  else if (b.tipo === 'enlace') item = { tipo: 'enlace', destino: b.url };
  else item = { tipo: 'texto' };
  return item ? { nombre: simboloDeItem(item), tono: tonoDeItem(item) } : { nombre: iconoSinCampus(b) };
}

function datoDe(b, campus) {
  if (b.tipo === 'archivo') return [extension(b.nombre), 'tuyo'].filter(Boolean).join(', ');
  if (b.tipo === 'enlace') return esDelSantoResumen(b.url) ? 'Apunte de El Santo Resumen' : `Enlace a ${dominioDe(b.url)}`;
  if (b.tipo === 'texto') return 'Texto tuyo';
  const falta = faltaDe(b, campus);
  return falta ? TEXTO_FALTA[falta] : `${CLASE[b.clase] ?? 'Algo'} del campus`;
}

function Bloque({ propia, categoria, bloque, lugar, total, campus, anunciar, onBorrado }) {
  const { confirmar } = useUI();
  const [abierto, setAbierto] = useState(false);
  const [editando, setEditando] = useState(false);
  const [destino, setDestino] = useState('');
  const subir = useRef(null);
  const bajar = useRef(null);
  const opciones = useRef(null);
  const idMover = useId();
  const otras = propia.categorias.filter((c) => c.id !== categoria.id);
  const nombre = nombreDe(bloque, campus);

  const mover = (salto, ref, par) => {
    moverBloque(propia.id, categoria.id, bloque.id, salto);
    anunciar(`Quedó en el lugar ${lugar + salto + 1} de ${total}`);
    enfocarLuego(ref, par);
  };

  const pasar = () => {
    const a = otras.find((c) => String(c.id) === destino);
    if (!a) return;
    if (pasarBloque(propia.id, categoria.id, bloque.id, a.id)) onBorrado(`Pasó a ${a.nombre}`);
    else anunciar(`${a.nombre} ya está llena.`);
  };

  const borrar = async () => {
    // Something of the campus comes back from the campus. A file, a text or a link written by hand does not.
    const tuyo = bloque.tipo !== 'campus';
    if (tuyo && !(await confirmar({ titulo: `¿Borrar ${nombre}?`, texto: bloque.tipo === 'archivo' ? 'El archivo se borra de este navegador.' : undefined, boton: 'Borrar', peligro: true }))) return;
    borrarBloque(propia.id, categoria.id, bloque.id);
    onBorrado(`Sacaste ${nombre}`);
  };

  const dejarDeEditar = () => {
    setEditando(false);
    opciones.current?.focus();
  };

  const guardar = (cambios) => {
    cambiarBloque(propia.id, categoria.id, bloque.id, cambios);
    dejarDeEditar();
  };

  return (
    <li className="fila fila--editable editor__bloque" data-tipo-bloque={bloque.tipo}>
      <div className="fila__linea">
        <div className="fila__principal editor__resumen">
          <Icono {...iconoDe(bloque, campus)} tamano="tipo" />
          <span className="fila__texto">
            <span className="fila__nombre">{nombre}</span>
            <span className="fila__dato">{datoDe(bloque, campus)}</span>
          </span>
        </div>
        <button ref={opciones} type="button" className="fila__opciones" aria-expanded={abierto} aria-label={`Opciones de ${nombre}`} onClick={() => setAbierto((a) => !a)}>
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>
        </button>
      </div>
      {/* What is being written stays even if the options close: only Guardar or Cancelar end it. */}
      {editando && (
        <div className="fila__panel">
          {bloque.tipo === 'texto' && <FormTexto inicial={bloque.texto} onGuardar={(texto) => guardar({ texto })} onCancelar={dejarDeEditar} />}
          {bloque.tipo === 'enlace' && <FormEnlace inicial={bloque} onGuardar={guardar} onCancelar={dejarDeEditar} />}
        </div>
      )}
      {abierto && !editando && (
        <div className="fila__panel">
          <>
              <div className="fila__botones">
                {(bloque.tipo === 'texto' || bloque.tipo === 'enlace') && <button type="button" className="boton boton--secundario boton--chico" onClick={() => setEditando(true)}>Cambiar</button>}
                <button ref={subir} type="button" className="boton boton--secundario boton--chico" disabled={lugar <= 0} onClick={() => mover(-1, subir, bajar)}>Subir</button>
                <button ref={bajar} type="button" className="boton boton--secundario boton--chico" disabled={lugar >= total - 1} onClick={() => mover(1, bajar, subir)}>Bajar</button>
                <button type="button" className="boton boton--secundario boton--chico" onClick={borrar}>Sacar</button>
              </div>
              {otras.length > 0 && (
                <div className="editor__mover">
                  <label className="campo__etiqueta" htmlFor={idMover}>Pasar a otra categoría</label>
                  <div className="editor__mover-fila">
                    <select id={idMover} className="campo__control" value={destino} onChange={(e) => setDestino(e.target.value)}>
                      <option value="">Elegí una</option>
                      {otras.map((c) => <option key={c.id} value={String(c.id)}>{c.nombre}</option>)}
                    </select>
                    <button type="button" className="boton boton--secundario boton--chico" disabled={!destino} onClick={pasar}>Pasar</button>
                  </div>
                </div>
              )}
          </>
        </div>
      )}
    </li>
  );
}

function Categoria({ propia, categoria, lugar, total, onMover, campus, nueva }) {
  const materias = campus.materias ?? [];
  const mio = useMio();
  const google = useGoogle();
  const { confirmar, avisar } = useUI();
  const [nombre, setNombre] = useState(categoria.nombre);
  const [anuncio, setAnuncio] = useState('');
  const titulo = useRef(null);
  const campoNombre = useRef(null);
  const subir = useRef(null);
  const bajar = useRef(null);
  const idNombre = useId();
  // The campus course it was made from.
  const desde = propia.base;

  useEffect(() => {
    if (!nueva) return;
    campoNombre.current?.focus();
    campoNombre.current?.select();
  }, [nueva]);

  const cambiarNombre = (valor) => {
    setNombre(valor);
    if (valor.trim()) renombrarCategoria(propia.id, categoria.id, valor);
  };

  const mover = (salto, ref, par) => {
    if (!onMover(salto)) return;
    setAnuncio(`${categoria.nombre} quedó en el lugar ${lugar + salto + 1} de ${total}`);
    enfocarLuego(ref, par);
  };

  const borrar = async () => {
    const cuantos = categoria.bloques.length;
    const texto = cuantos ? `Se saca todo lo que tiene (${cuantos === 1 ? 'una cosa' : `${cuantos} cosas`}). Tus archivos se borran de este navegador.` : undefined;
    if (!(await confirmar({ titulo: `¿Borrar ${categoria.nombre}?`, texto, boton: 'Borrar', peligro: true }))) return;
    borrarCategoria(propia.id, categoria.id);
    avisar(`Borraste ${categoria.nombre}`);
  };

  // The subject of El Santo Resumen opens on its own when the name says which one, or the campus course it came from.
  const materiaSanto = () => resumenDe(propia.nombre)?.slug ?? resumenDe(materias.find((m) => String(m.id) === String(desde))?.nombre ?? '')?.slug ?? '';

  return (
    <section className="editor__categoria" aria-labelledby={`${idNombre}-titulo`}>
      <h2 id={`${idNombre}-titulo`} ref={titulo} tabIndex={-1} className="solo-lectores">{categoria.nombre}</h2>
      <div className="editor__cabeza">
        <div className="campo editor__nombre">
          <label className="campo__etiqueta" htmlFor={idNombre}>Categoría</label>
          <input
            ref={campoNombre}
            id={idNombre}
            className="campo__control"
            value={nombre}
            maxLength={LIMITES.nombre}
            autoComplete="off"
            onChange={(e) => cambiarNombre(e.target.value)}
            onBlur={() => { if (!nombre.trim()) setNombre(categoria.nombre); }}
          />
        </div>
        <div className="editor__acciones">
          <button ref={subir} type="button" className="boton boton--secundario boton--chico" disabled={lugar <= 0} aria-label={`Subir ${categoria.nombre}`} onClick={() => mover(-1, subir, bajar)}>Subir</button>
          <button ref={bajar} type="button" className="boton boton--secundario boton--chico" disabled={lugar >= total - 1} aria-label={`Bajar ${categoria.nombre}`} onClick={() => mover(1, bajar, subir)}>Bajar</button>
          <button type="button" className="boton boton--secundario boton--chico" aria-label={`Borrar ${categoria.nombre}`} onClick={borrar}>Borrar</button>
        </div>
      </div>

      {categoria.bloques.length > 0 ? (
        <ul className="lista">
          {categoria.bloques.map((b, i) => (
            <Bloque
              key={b.id}
              propia={propia}
              categoria={categoria}
              bloque={b}
              lugar={i}
              total={categoria.bloques.length}
              campus={campus}
              anunciar={setAnuncio}
              onBorrado={(texto) => {
                avisar(texto);
                titulo.current?.focus();
              }}
            />
          ))}
        </ul>
      ) : (
        <p className="editor__vacia">Todavía no tiene nada. Sumale algo con los botones de abajo.</p>
      )}

      <SumarCosas
        nombre={categoria.nombre}
        palabra="categoría"
        bloques={categoria.bloques}
        materias={materias}
        inicialCampus={propia.base}
        classroom={google.disponible ? { nombre: propia.nombre, inicial: propia.classroom ?? (desde === null ? null : materiaDe(mio, desde).classroom) } : null}
        santo={materiaSanto()}
        onSumar={(bloques) => agregarBloques(propia.id, categoria.id, bloques)}
      />
      <p className="solo-lectores" role="status">{anuncio}</p>
    </section>
  );
}

function Tema({ propia, tema, items, oculta, lugar, total, onMover }) {
  const { avisar } = useUI();
  const [nombre, setNombre] = useState(tema.nombre);
  const [anuncio, setAnuncio] = useState('');
  const subir = useRef(null);
  const bajar = useRef(null);
  const idNombre = useId();
  const renombrada = tema.nombre !== tema.original;

  const cambiarNombre = (valor) => {
    setNombre(valor);
    if (valor.trim()) renombrarSeccion(propia.id, tema.id, valor);
  };
  const volverAlNombre = () => {
    renombrarSeccion(propia.id, tema.id, '');
    setNombre(tema.original);
  };
  const mover = (salto, ref, par) => {
    if (!onMover(salto)) return;
    setAnuncio(`${tema.nombre} quedó en el lugar ${lugar + salto + 1} de ${total}`);
    enfocarLuego(ref, par);
  };
  const alternar = () => {
    alternarSeccion(propia.id, tema.id);
    avisar(oculta ? `${tema.nombre} vuelve a verse en la materia` : `Ocultaste ${tema.nombre}`);
  };

  return (
    <section className="editor__categoria" aria-labelledby={`${idNombre}-titulo`} data-oculta={oculta || undefined}>
      <h2 id={`${idNombre}-titulo`} tabIndex={-1} className="solo-lectores">{tema.nombre}</h2>
      <div className="editor__cabeza">
        <div className="campo editor__nombre">
          <label className="campo__etiqueta" htmlFor={idNombre}>Tema de Classroom</label>
          <input
            id={idNombre}
            className="campo__control"
            value={nombre}
            maxLength={LIMITES.nombre}
            autoComplete="off"
            onChange={(e) => cambiarNombre(e.target.value)}
            onBlur={() => { if (!nombre.trim()) setNombre(tema.nombre); }}
          />
        </div>
        <div className="editor__acciones">
          <button ref={subir} type="button" className="boton boton--secundario boton--chico" disabled={lugar <= 0} aria-label={`Subir ${tema.nombre}`} onClick={() => mover(-1, subir, bajar)}>Subir</button>
          <button ref={bajar} type="button" className="boton boton--secundario boton--chico" disabled={lugar >= total - 1} aria-label={`Bajar ${tema.nombre}`} onClick={() => mover(1, bajar, subir)}>Bajar</button>
          <button type="button" className="boton boton--secundario boton--chico" aria-label={`${oculta ? 'Mostrar' : 'Ocultar'} ${tema.nombre}`} onClick={alternar}>{oculta ? 'Mostrar' : 'Ocultar'}</button>
        </div>
      </div>
      {renombrada && <p className="editor__vacia">En Classroom se llama {tema.original}. <button type="button" className="enlace-carpeta" onClick={volverAlNombre}>Volver a ese nombre</button></p>}
      {oculta ? (
        <p className="editor__vacia">Oculto en la materia.</p>
      ) : (
        <ul className="lista">
          {items.map((i) => (
            <li key={i.clave} className="fila fila--editable editor__bloque">
              <div className="fila__linea">
                <div className="fila__principal editor__resumen">
                  <Icono nombre={simboloDeItem(i)} tono={tonoDeItem(i)} tamano="tipo" />
                  <span className="fila__texto">
                    <span className="fila__nombre">{i.nombre}</span>
                    <span className="fila__dato">{i.clase ?? 'De Classroom'}</span>
                  </span>
                </div>
                <button type="button" className="boton boton--secundario boton--chico" aria-label={`Ocultar ${i.nombre}`} onClick={() => { alternarEn(propia.id, 'ocultos', i.clave); avisar(`Ocultaste ${i.nombre}`); }}>Ocultar</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="solo-lectores" role="status">{anuncio}</p>
    </section>
  );
}

function NombrePropia({ propia }) {
  const [nombre, setNombre] = useState(propia.nombre);
  const [error, setError] = useState('');
  return (
    <Campo etiqueta="Nombre de la materia" error={error}>
      <input
        className="campo__control"
        value={nombre}
        maxLength={LIMITES.nombre}
        autoComplete="off"
        onChange={(e) => {
          setNombre(e.target.value);
          if (renombrarPropia(propia.id, e.target.value)) setError('');
          else setError('Ponele un nombre.');
        }}
        onBlur={() => {
          if (!nombre.trim()) {
            setNombre(propia.nombre);
            setError('');
          }
        }}
      />
    </Campo>
  );
}

export default function EditarPropia() {
  const { id } = useParams();
  const propia = propiaDe(useMio(), id);
  useSeo({ titulo: tituloDe('Editar materia'), noindex: true });

  if (!propia) {
    return (
      <div className="contenedor pagina">
        <p className="volver"><Link to="/materias">Materias</Link></p>
        <h1>Materia</h1>
        <p>Esta materia no está en este navegador. Puede que la hayas borrado.</p>
      </div>
    );
  }

  // The student's own sections of a campus course are edited right there.
  if (esAgregada(propia)) return <Navigate to={`/materias/${propia.de}`} replace />;
  return <Editor propia={propia} />;
}

function Editor({ propia }) {
  const navegar = useNavigate();
  const { confirmar, avisar } = useUI();
  // The category just added: its name gets the focus.
  const [nueva, setNueva] = useState(null);
  const [errorCategoria, setErrorCategoria] = useState('');
  const campus = useCampusDePropia(propia);
  const { deClassroom, temas, ordenTodo, marcas, mover } = useSeccionesDePropia(propia);

  // Every section in the order of the course: the categories, and the topics of Classroom with something in them (or
  // hidden, to show them again).
  const secciones = ordenTodo.map((sid) => {
    const categoria = propia.categorias.find((c) => `p${c.id}` === sid);
    if (categoria) return { id: sid, categoria };
    const tema = temas.find((t) => t.id === sid);
    if (!tema) return null;
    const oculta = marcas.secciones.includes(sid);
    const items = deClassroom.filter((i) => i.seccionId === sid && !marcas.ocultos.includes(i.clave));
    return oculta || items.length ? { id: sid, tema, oculta, items } : null;
  }).filter(Boolean);
  const ids = secciones.map((s) => s.id);

  const sumarCategoria = () => {
    setErrorCategoria('');
    const catId = agregarCategoria(propia.id, 'Nueva categoría');
    if (catId) setNueva(catId);
    else setErrorCategoria(`Una materia lleva hasta ${LIMITES.categorias} categorías.`);
  };

  const borrar = async () => {
    if (!(await confirmar({ titulo: `¿Borrar ${propia.nombre}?`, texto: 'Se borra de este navegador con todos sus archivos. Lo del campus sigue en el campus.', boton: 'Borrar materia', peligro: true }))) return;
    borrarPropia(propia.id);
    avisar('Materia borrada');
    navegar('/materias', { replace: true });
  };

  return (
    <div className="contenedor pagina editor">
      <p className="volver"><Link to={`/propias/${propia.id}`}>Volver a {propia.nombre}</Link></p>
      <div className="titular">
        <h1>Editar materia</h1>
        <div className="titular__botones"><Link className="boton" to={`/propias/${propia.id}`}>Listo</Link></div>
      </div>
      <p className="propias__bajada">Los cambios se guardan solos, en este navegador.</p>
      <div className="editor__general">
        <NombrePropia key={propia.id} propia={propia} />
        <CursoDePropia propia={propia} />
      </div>

      {secciones.map((s, i) => (s.categoria ? (
        <Categoria key={s.id} propia={propia} categoria={s.categoria} lugar={i} total={ids.length} onMover={(salto) => mover(s.id, i + salto, ids)} campus={campus} nueva={s.categoria.id === nueva} />
      ) : (
        <Tema key={s.id} propia={propia} tema={s.tema} items={s.items} oculta={s.oculta} lugar={i} total={ids.length} onMover={(salto) => mover(s.id, i + salto, ids)} />
      )))}

      {errorCategoria && <div className="mensaje mensaje--error" role="alert"><p>{errorCategoria}</p></div>}
      <div className="editor__pie">
        <button type="button" className="boton boton--secundario" onClick={sumarCategoria}>Sumar una categoría</button>
        <button type="button" className="boton boton--peligro" onClick={borrar}>Borrar materia</button>
      </div>
    </div>
  );
}
