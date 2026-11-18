import { useId, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import Campo from '../components/Campo';
import { BotonConectar, nombreDeCurso } from '../components/Classroom';
import { ErrorConReintento } from '../components/Filas';
import { useUI } from '../components/ui';
import { cargarContenido, cargarMaterias, cargarPerfil } from '../lib/campus';
import { cargarCursos } from '../lib/classroom';
import { textoError } from '../lib/errores';
import { useGoogle } from '../lib/google';
import { estaOculto, mioActual, personalizar } from '../lib/mio';
import { crearPropia } from '../lib/propias';
import { LIMITES } from '../lib/propiasSaneo';
import { categoriasDeCampus } from '../lib/propiasVista';
import { tituloDe, useSeo } from '../lib/seo';
import { useConsulta } from '../lib/useConsulta';
import './panel.css';
import './propias.css';

export default function NuevaPropia() {
  useSeo({ titulo: tituloDe('Crear una materia'), noindex: true });
  const navegar = useNavigate();
  const { avisar } = useUI();
  const [parametros] = useSearchParams();
  const idTraer = useId();
  const { datos: materias, error: errorMaterias, recargar } = useConsulta(async () => {
    await cargarPerfil();
    const { enCurso, otras } = await cargarMaterias();
    return [...enCurso, ...otras];
  });
  // A course of Classroom can be the base too, once connected: the course then shows its Classroom live.
  const google = useGoogle();
  const { datos: cursos, error: errorCursos } = useConsulta(() => (google.conectado ? cargarCursos() : Promise.resolve([])), [google.conectado]);
  const [nombre, setNombre] = useState('');
  const [tocado, setTocado] = useState(false);
  const [base, setBase] = useState(() => parametros.get('base') ?? '');
  const [traer, setTraer] = useState(true);
  const [error, setError] = useState('');
  const [errorNombre, setErrorNombre] = useState('');
  const [creando, setCreando] = useState(false);
  const campoNombre = useRef(null);
  const lista = useRef(null);

  // A Classroom course stays chosen only while connected.
  const elegida = base.startsWith('c:') && !google.conectado ? '' : base;
  const cursoBase = cursos?.find((c) => `c:${c.id}` === elegida) ?? null;
  const materiaBase = materias?.find((m) => String(m.id) === elegida) ?? null;
  // The name follows the course chosen as the base until the student writes one.
  let nombreVisible = nombre;
  if (!tocado && cursoBase) nombreVisible = cursoBase.nombre.slice(0, LIMITES.nombre);
  else if (!tocado && materiaBase) nombreVisible = `${materiaBase.nombre} resumida`.slice(0, LIMITES.nombre);

  const crear = async (e) => {
    e.preventDefault();
    if (creando) return;
    const final = nombreVisible.trim();
    setError('');
    if (!final) {
      setErrorNombre('Ponele un nombre.');
      campoNombre.current?.focus();
      return;
    }
    setErrorNombre('');
    setCreando(true);
    try {
      let categorias = [{ nombre: 'General' }];
      if (materiaBase && traer) {
        const mio = mioActual();
        const items = personalizar(await cargarContenido(materiaBase), mio).filter((i) => !estaOculto(mio, i));
        const deCampus = categoriasDeCampus(materiaBase, items);
        if (deCampus.length) categorias = deCampus;
      }
      const id = crearPropia({ nombre: final, base: materiaBase?.id ?? null, classroom: cursoBase?.id ?? null, categorias });
      if (!id) {
        setError(mioActual().propias.length >= LIMITES.materias ? `Ya tenés ${LIMITES.materias} materias tuyas. Borrá alguna para crear otra.` : 'No se pudo guardar en este navegador.');
        setCreando(false);
        return;
      }
      avisar('Materia creada');
      navegar(`/propias/${id}/editar`, { replace: true });
    } catch (falla) {
      setError(textoError(falla));
      setCreando(false);
    }
  };

  return (
    <div className="contenedor pagina propias-nueva">
      <p className="volver"><Link to="/materias">Materias</Link></p>
      <h1>Crear una materia</h1>
      <p className="propias__bajada">Queda en este navegador y se la podés pasar a otros. Le sumás categorías, archivos, textos y enlaces.</p>
      <form className="propias-nueva__form" onSubmit={crear} noValidate>
        <Campo etiqueta="Nombre" ayuda="Por ejemplo, Algoritmos Genéticos Resumida" error={errorNombre}>
          <input
            ref={campoNombre}
            className="campo__control"
            value={nombreVisible}
            maxLength={LIMITES.nombre}
            autoComplete="off"
            onChange={(e) => {
              setTocado(true);
              setNombre(e.target.value);
            }}
          />
        </Campo>
        <Campo etiqueta="A partir de" ayuda={google.disponible ? 'Una materia del campus, un curso de Classroom o ninguna para empezar de cero' : 'Una materia del campus, o ninguna para empezar de cero'}>
          <select ref={lista} className="campo__control" value={elegida} onChange={(e) => setBase(e.target.value)}>
            <option value="">Ninguna</option>
            {cursos?.length ? (
              <>
                <optgroup label="Del campus">{materias?.map((m) => <option key={m.id} value={String(m.id)}>{m.nombre}</option>)}</optgroup>
                <optgroup label="De Classroom">{cursos.map((c) => <option key={c.id} value={`c:${c.id}`}>{nombreDeCurso(c)}</option>)}</optgroup>
              </>
            ) : materias?.map((m) => <option key={m.id} value={String(m.id)}>{m.nombre}</option>)}
          </select>
        </Campo>
        {errorMaterias && !materias && <ErrorConReintento texto={errorMaterias} recargar={recargar} />}
        {google.disponible && !google.conectado && (
          <div className="propias-nueva__classroom">
            <p>¿Es una materia de Classroom? Conectalo y elegila en «A partir de».</p>
            <BotonConectar secundario alConectar={() => lista.current?.focus()} />
          </div>
        )}
        {errorCursos && google.conectado && <div className="mensaje mensaje--error" role="alert"><p>{errorCursos}</p></div>}
        {cursoBase && <p className="propias-nueva__nota">Sus temas y materiales se ven en la materia, al día, con tu cuenta de Google. Después le sumás lo tuyo.</p>}
        {materiaBase && (
          <label className="opcion" htmlFor={idTraer}>
            <input id={idTraer} type="checkbox" checked={traer} onChange={(e) => setTraer(e.target.checked)} />
            <span>Traer sus secciones y su contenido. Después sacás lo que no quieras.</span>
          </label>
        )}
        {error && <div className="mensaje mensaje--error" role="alert"><p>{error}</p></div>}
        <div className="propias__botones">
          <button type="submit" className="boton" aria-disabled={creando ? 'true' : undefined}>{creando ? 'Creando' : 'Crear'}</button>
          <Link className="boton boton--secundario" to="/materias">Cancelar</Link>
        </div>
      </form>
    </div>
  );
}
