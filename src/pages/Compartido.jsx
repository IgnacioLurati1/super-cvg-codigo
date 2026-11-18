import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ImportarArchivo } from '../components/CompartirMateria';
import { Cargando, ErrorConReintento } from '../components/Filas';
import { cargarContenido, cargarMaterias, cargarPerfil } from '../lib/campus';
import { fecha, fechaHora } from '../lib/datos';
import { textoError } from '../lib/errores';
import { useMio } from '../lib/mio';
import { aplicarPaquete, dejarPaquete, hayPaqueteEnHash, paqueteDeHash, paqueteDejado, restaurarMateria, resumirPaquete } from '../lib/paquete';
import { tituloDe, useSeo } from '../lib/seo';
import { useConsulta } from '../lib/useConsulta';
import './compartido.css';

function deHash(hash) {
  try {
    return { paquete: paqueteDeHash(hash) };
  } catch (error) {
    return { error: textoError(error) };
  }
}

/** Reads without changing anything: React may call this more than once. The effect in `Compartido` does the cleaning. */
function entradaInicial() {
  if (hayPaqueteEnHash(window.location.hash)) return deHash(window.location.hash);
  const dejado = paqueteDejado();
  return dejado ? { paquete: dejado } : null;
}

// The package must not stay in the bar or in the history. Keeps history.state: it belongs to the router.
function sacarHash() {
  if (window.location.hash) window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
}

const contar = (n, uno, varios) => (n === 1 ? `1 ${uno}` : `${n} ${varios}`);

function Grupo({ titulo, children }) {
  return (
    <section className="compartido__grupo">
      <h3>{titulo}</h3>
      {children}
    </section>
  );
}

function QueCambia({ resumen }) {
  const { renombrados, ocultos, secciones, orden, fechas } = resumen;
  return (
    <>
      {renombrados.length > 0 && (
        <Grupo titulo={`${contar(renombrados.length, 'nombre cambia', 'nombres cambian')}`}>
          <ul className="compartido__lista">
            {renombrados.map((r) => (
              <li key={r.clave}>
                <span className="compartido__nuevo">{r.nuevo}</span>
                <span className="compartido__campus">En el campus se llama {r.campus}</span>
              </li>
            ))}
          </ul>
        </Grupo>
      )}
      {ocultos.length > 0 && (
        <Grupo titulo={`${contar(ocultos.length, 'cosa se oculta', 'cosas se ocultan')}`}>
          <ul className="compartido__lista">{ocultos.map((o) => <li key={o.clave}>{o.nombre}</li>)}</ul>
        </Grupo>
      )}
      {secciones.length > 0 && (
        <Grupo titulo={`${contar(secciones.length, 'sección se oculta', 'secciones se ocultan')}`}>
          <ul className="compartido__lista">{secciones.map((s) => <li key={s.id}>{s.nombre}</li>)}</ul>
        </Grupo>
      )}
      {orden.length > 0 && (
        <Grupo titulo={`Cambia el orden de ${contar(orden.length, 'sección', 'secciones')}`}>
          <ul className="compartido__lista">{orden.map((s) => <li key={s.id}>{s.nombre}</li>)}</ul>
        </Grupo>
      )}
      {fechas.length > 0 && (
        <Grupo titulo={`${contar(fechas.length, 'fecha se suma', 'fechas se suman')} a tu calendario`}>
          <ul className="compartido__lista">
            {fechas.map((f) => (
              <li key={f.id}>
                <span className="compartido__nuevo">{f.titulo}</span>
                <span className="compartido__campus">{f.sinHora ? fecha(f.cuando) : fechaHora(f.cuando)}</span>
              </li>
            ))}
          </ul>
        </Grupo>
      )}
    </>
  );
}

function Revision({ paquete, alCambiarPaquete }) {
  const mio = useMio();
  const { datos, error, cargando, recargar } = useConsulta(async () => {
    await cargarPerfil();
    const { enCurso, otras } = await cargarMaterias();
    const materia = [...enCurso, ...otras].find((m) => m.id === paquete.materiaId);
    if (!materia) return { materia: null, items: [] };
    return { materia, items: await cargarContenido(materia) };
  }, [paquete]);

  const [fase, setFase] = useState('revisar');
  const [antes, setAntes] = useState(null);
  const [errorGuardar, setErrorGuardar] = useState('');
  const resultado = useRef(null);

  const resumen = useMemo(() => (datos?.materia ? resumirPaquete(paquete, datos.items, mio) : null), [datos, paquete, mio]);

  // The button that was just pressed disappears: the focus goes to what happened.
  useEffect(() => {
    if (fase !== 'revisar') resultado.current?.focus();
  }, [fase]);

  const aplicar = () => {
    setErrorGuardar('');
    try {
      setAntes(aplicarPaquete(resumen.paquete));
      setFase('aplicado');
    } catch (falla) {
      setErrorGuardar(textoError(falla));
    }
  };

  const deshacer = () => {
    setErrorGuardar('');
    try {
      restaurarMateria(paquete.materiaId, antes);
      setFase('deshecho');
    } catch (falla) {
      setErrorGuardar(textoError(falla));
    }
  };

  if (error && !datos) return <ErrorConReintento texto={error} recargar={recargar} />;
  if (cargando && !datos) return <Cargando texto="Buscando la materia" />;
  if (!datos) return null;

  if (!datos.materia) {
    return (
      <>
        <div className="mensaje mensaje--error"><p>Este orden es de una materia en la que no estás anotado. No se aplicó nada.</p></div>
        <div className="compartido__botones"><ImportarArchivo alElegir={alCambiarPaquete} texto="Cargar otro archivo" /></div>
      </>
    );
  }

  const irALaMateria = <Link className="boton boton--secundario" to={`/materias/${datos.materia.id}`}>Ir a la materia</Link>;

  if (fase === 'aplicado') {
    return (
      <>
        <h2 ref={resultado} tabIndex={-1} className="compartido__resultado">Listo, ya está en {datos.materia.nombre}</h2>
        <p>Si no te gusta cómo quedó, lo podés deshacer ahora.</p>
        {errorGuardar && <div className="mensaje mensaje--error" role="alert"><p>{errorGuardar}</p></div>}
        <div className="compartido__botones">
          <button type="button" className="boton boton--secundario" onClick={deshacer}>Deshacer</button>
          {irALaMateria}
        </div>
      </>
    );
  }

  if (fase === 'deshecho' || fase === 'rechazado') {
    return (
      <>
        <h2 ref={resultado} tabIndex={-1} className="compartido__resultado">{fase === 'deshecho' ? 'Listo, quedó como estaba' : 'No se aplicó nada'}</h2>
        <p>{datos.materia.nombre} sigue con tu orden.</p>
        <div className="compartido__botones">{irALaMateria}</div>
      </>
    );
  }

  if (!resumen.hayCambios) {
    return (
      <>
        <h2>{datos.materia.nombre}</h2>
        <p>Este orden no cambia nada en tu materia. Puede ser que ya lo tengas o que hable de cosas que no están.</p>
        <div className="compartido__botones">{irALaMateria}</div>
      </>
    );
  }

  return (
    <>
      <h2>Esto cambia en {datos.materia.nombre}</h2>
      <div className="mensaje compartido__aviso">
        <p>Lo armó otro alumno, así que conviene mirarlo antes. Puede cambiarle el nombre a un apunte o esconder algo que necesitás.</p>
        <p>No toca tus notas, tus tareas ni lo que ya viste.</p>
      </div>
      <QueCambia resumen={resumen} />
      {errorGuardar && <div className="mensaje mensaje--error" role="alert"><p>{errorGuardar}</p></div>}
      <div className="compartido__botones compartido__botones--pegados">
        <button type="button" className="boton" onClick={aplicar}>Aplicar a mi materia</button>
        <button type="button" className="boton boton--secundario" onClick={() => setFase('rechazado')}>No aplicar</button>
      </div>
    </>
  );
}

export default function Compartido() {
  useSeo({ titulo: tituloDe('Orden compartido'), noindex: true });
  const [entrada, setEntrada] = useState(entradaInicial);
  const [tanda, setTanda] = useState(0);

  const cargar = (paquete) => {
    setEntrada({ paquete });
    setTanda((t) => t + 1);
  };

  useEffect(() => {
    sacarHash();
    dejarPaquete(null);
    // Another link pasted in this same tab changes only the hash: the page doesn't load again.
    const alCambiarHash = () => {
      if (!hayPaqueteEnHash(window.location.hash)) return;
      setEntrada(deHash(window.location.hash));
      setTanda((t) => t + 1);
      sacarHash();
    };
    window.addEventListener('hashchange', alCambiarHash);
    return () => window.removeEventListener('hashchange', alCambiarHash);
  }, []);

  return (
    <div className="contenedor pagina compartido">
      <h1>Orden compartido</h1>
      {entrada?.paquete && <Revision key={tanda} paquete={entrada.paquete} alCambiarPaquete={cargar} />}
      {entrada?.error && (
        <>
          <div className="mensaje mensaje--error" role="alert"><p>{entrada.error}</p></div>
          <div className="compartido__botones"><ImportarArchivo alElegir={cargar} texto="Cargar un archivo" /></div>
        </>
      )}
      {!entrada && (
        <>
          <p>Si un compañero ordenó una materia, te puede pasar ese orden con un link o un archivo. Acá ves qué cambiaría en tu materia antes de aplicarlo.</p>
          <p>Para pasar el tuyo, entrá a la materia y buscá «Compartir este orden».</p>
          <div className="compartido__botones"><ImportarArchivo alElegir={cargar} texto="Cargar un archivo" /></div>
        </>
      )}
    </div>
  );
}
