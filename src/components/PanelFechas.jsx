import { useEffect, useMemo, useRef, useState } from 'react';
import { candidatos, buscarFechas, TOPE_ARCHIVOS, TOPE_BYTES, unirHallazgos, yaSumada } from '../lib/cazador';
import { traerArchivo } from '../lib/archivos';
import { claveDia, diaEnTexto, fechaHora } from '../lib/datos';
import { hastaCancelar, textoDeArchivo } from '../lib/leerTexto';
import { agregarFecha, descartarFecha, materiaDe, useMio } from '../lib/mio';
import Campo from './Campo';
import DetallesAnimados from './DetallesAnimados';
import { useUI } from './ui';
import './herramientas.css';

const CUENTA_INICIAL = { revisados: 0, sinTexto: 0, fallaron: 0, grandes: 0 };
const MEGAS = TOPE_BYTES / (1024 * 1024);

let serie = 0;
/** Un número entero único: es lo que `mio.js` guarda como id. */
const idNuevo = () => Date.now() * 1000 + (serie++ % 1000);

const plural = (n, uno, varios) => (n === 1 ? uno : varios);

function fechaEnTexto(sugerencia, anioActual) {
  const anio = new Date(sugerencia.cuando * 1000).getFullYear();
  const texto = sugerencia.sinHora ? diaEnTexto(claveDia(sugerencia.cuando)) : fechaHora(sugerencia.cuando);
  return anio === anioActual ? texto : `${texto}, año ${anio}`;
}

function Sugerencia({ sugerencia, titulo, error, anioActual, alEscribir, alSumar, alDescartar }) {
  const cuando = fechaEnTexto(sugerencia, anioActual);
  return (
    <li className="fechas__item">
      <p className="fechas__cuando">{cuando}</p>
      <p className="fechas__fuente">Salió de {sugerencia.archivos.join(' y ')}.</p>
      <Campo etiqueta="Título" error={error}>
        <input className="campo__control" type="text" maxLength={200} value={titulo} onChange={(e) => alEscribir(e.target.value)} />
      </Campo>
      <div className="herramienta__botones">
        <button type="button" className="boton boton--chico" aria-label={`Sumar al calendario, ${cuando}`} onClick={alSumar}>Sumar al calendario</button>
        <button type="button" className="boton boton--secundario boton--chico" aria-label={`No es, ${cuando}`} onClick={alDescartar}>No es</button>
      </div>
    </li>
  );
}

function Buscador({ materia, items }) {
  const { avisar } = useUI();
  const mia = materiaDe(useMio(), materia.id);
  const { leibles, pesados } = useMemo(() => candidatos(items), [items]);
  const [leidos, setLeidos] = useState(() => new Set());
  const [hallazgos, setHallazgos] = useState([]);
  const [titulos, setTitulos] = useState({});
  const [errores, setErrores] = useState({});
  const [cuenta, setCuenta] = useState(CUENTA_INICIAL);
  const [estado, setEstado] = useState('quieto');
  const [progreso, setProgreso] = useState(null);
  const [anioActual] = useState(() => new Date().getFullYear());
  const control = useRef(null);
  const botonCancelar = useRef(null);
  const destino = useRef(null);
  const contenedor = useRef(null);
  const focoPendiente = useRef(null);

  useEffect(() => () => control.current?.abort(), []);

  useEffect(() => {
    if (estado === 'buscando') botonCancelar.current?.focus();
    else if (estado !== 'quieto') destino.current?.focus();
  }, [estado]);

  // Lo que se sumó o se descartó ya no está: el foco pasa a la que quedó en su lugar.
  useEffect(() => {
    const pedido = focoPendiente.current;
    if (!pedido) return;
    focoPendiente.current = null;
    const campos = contenedor.current?.querySelectorAll(`[data-lista="${pedido.lista}"] input`) ?? [];
    const siguiente = campos[Math.min(pedido.lugar, campos.length - 1)];
    (siguiente ?? destino.current)?.focus();
  });

  const pendientes = leibles.filter((i) => !leidos.has(i.clave));
  const visibles = hallazgos.filter((h) => !mia.descartes.includes(h.huella) && !yaSumada(h, mia.fechas));
  const fuertes = visibles.filter((h) => h.fuerte);
  const otras = visibles.filter((h) => !h.fuerte);
  const buscando = estado === 'buscando';
  const empezo = estado !== 'quieto';

  const buscar = async () => {
    if (control.current) return;
    const mio = new AbortController();
    control.current = mio;
    const tanda = pendientes.slice(0, TOPE_ARCHIVOS);
    setEstado('buscando');
    for (let n = 0; n < tanda.length && !mio.signal.aborted; n++) {
      const item = tanda[n];
      setProgreso({ actual: n + 1, total: tanda.length, nombre: item.nombre || item.archivo });
      let suma = { revisados: 1 };
      try {
        const blob = await hastaCancelar(traerArchivo(item), mio.signal);
        if (blob.size > TOPE_BYTES) {
          suma = { grandes: 1 };
        } else {
          const texto = await hastaCancelar(textoDeArchivo(blob, item, { senal: mio.signal }), mio.signal);
          if (texto.trim()) {
            const halladas = buscarFechas(texto, Math.floor(Date.now() / 1000));
            setHallazgos((lista) => unirHallazgos(lista, halladas, item.archivo || item.nombre));
          } else {
            suma = { revisados: 1, sinTexto: 1 };
          }
        }
      } catch {
        if (mio.signal.aborted) break;
        suma = { fallaron: 1 };
      }
      if (mio.signal.aborted) break;
      setCuenta((c) => ({
        revisados: c.revisados + (suma.revisados ?? 0),
        sinTexto: c.sinTexto + (suma.sinTexto ?? 0),
        fallaron: c.fallaron + (suma.fallaron ?? 0),
        grandes: c.grandes + (suma.grandes ?? 0),
      }));
      setLeidos((l) => new Set(l).add(item.clave));
    }
    control.current = null;
    setProgreso(null);
    setEstado(mio.signal.aborted ? 'cancelado' : 'listo');
  };

  const pedirFoco = (lista, h) => {
    const enLista = lista === 'fuertes' ? fuertes : otras;
    focoPendiente.current = { lista, lugar: enLista.indexOf(h) };
  };

  const tituloDe = (h) => titulos[h.huella] ?? h.titulo;

  const sumar = (h, lista) => {
    const titulo = tituloDe(h).trim();
    if (!titulo) {
      setErrores((e) => ({ ...e, [h.huella]: 'Poné un título para sumarla.' }));
      return;
    }
    pedirFoco(lista, h);
    if (!agregarFecha(materia.id, { id: idNuevo(), titulo, cuando: h.cuando, sinHora: h.sinHora })) {
      focoPendiente.current = null;
      avisar('No se pudo guardar la fecha.', 'error');
      return;
    }
    // Con otro título ya no se la reconoce entre las sumadas. Queda anotada para no volver a sugerirla.
    if (titulo !== h.titulo) descartarFecha(materia.id, h.huella);
    avisar('Sumada al calendario.');
  };

  const descartar = (h, lista) => {
    pedirFoco(lista, h);
    if (!descartarFecha(materia.id, h.huella)) {
      focoPendiente.current = null;
      avisar('No se pudo guardar.', 'error');
    }
  };

  const fila = (h, lista) => (
    <Sugerencia
      key={h.huella}
      sugerencia={h}
      titulo={tituloDe(h)}
      error={errores[h.huella]}
      anioActual={anioActual}
      alEscribir={(valor) => {
        setTitulos((t) => ({ ...t, [h.huella]: valor }));
        if (errores[h.huella]) setErrores((e) => ({ ...e, [h.huella]: undefined }));
      }}
      alSumar={() => sumar(h, lista)}
      alDescartar={() => descartar(h, lista)}
    />
  );

  const nadaQueLeer = !leibles.length && !empezo;
  const encontro = hallazgos.length > 0;

  return (
    <div className="herramienta" ref={contenedor}>
      {nadaQueLeer ? (
        <p className="herramienta__nota">
          {pesados.length
            ? `Los documentos que podrían tener fechas pesan más de ${MEGAS} MB. No se pueden revisar desde acá.`
            : 'No hay PDF ni Word con nombre de cronograma, programa o parcial en esta materia.'}
        </p>
      ) : (
        !empezo && (
          <p className="herramienta__nota">
            Busca en los PDF y Word con nombre de cronograma, programa o parcial, y te sugiere las fechas que encuentra. {leibles.length > TOPE_ARCHIVOS ? `Son ${leibles.length}, de a ${TOPE_ARCHIVOS} por vez.` : `Son ${leibles.length}.`}
          </p>
        )
      )}

      {buscando && (
        <div className="herramienta__botones">
          <button ref={botonCancelar} type="button" className="boton boton--secundario" onClick={() => control.current?.abort()}>Cancelar</button>
        </div>
      )}
      {!buscando && pendientes.length > 0 && (
        <div className="herramienta__botones">
          <button type="button" className={`boton${empezo ? ' boton--secundario' : ''}`} onClick={buscar}>
            {empezo ? `Seguir con el resto (${pendientes.length})` : 'Buscar fechas en los documentos'}
          </button>
        </div>
      )}

      {buscando && progreso && (
        <div className="herramienta__estado">
          <p>Leyendo {progreso.actual} de {progreso.total}.</p>
          <p className="herramienta__archivo">{progreso.nombre}</p>
        </div>
      )}

      {/* Only the start and the end are announced: one message per file would drown a screen reader. */}
      <div ref={destino} tabIndex={-1} className="herramienta__estado herramienta__destino" role="status" aria-live="polite">
        {buscando && <p className="solo-lectores">Buscando fechas en los documentos.</p>}
        {estado === 'cancelado' && <p>Cancelaste la búsqueda.</p>}
        {!buscando && empezo && (
          <p>
            {cuenta.revisados === 0 ? 'No se revisó ningún documento.' : `Se ${plural(cuenta.revisados, 'revisó', 'revisaron')} ${cuenta.revisados} ${plural(cuenta.revisados, 'documento', 'documentos')}.`}
            {' '}
            {encontro && (visibles.length ? `Quedan ${visibles.length} ${plural(visibles.length, 'fecha', 'fechas')} para mirar.` : 'No quedan fechas para mirar.')}
          </p>
        )}
      </div>

      {!buscando && empezo && (cuenta.sinTexto > 0 || cuenta.fallaron > 0 || cuenta.grandes > 0 || pesados.length > 0) && (
        <ul className="herramienta__notas">
          {cuenta.sinTexto > 0 && <li>{cuenta.sinTexto === 1 ? 'Uno no tiene texto para leer' : `${cuenta.sinTexto} no tienen texto para leer`}. Los escaneados son fotos y no se pueden leer.</li>}
          {cuenta.fallaron > 0 && <li>{cuenta.fallaron === 1 ? 'Uno no se pudo bajar' : `${cuenta.fallaron} no se pudieron bajar`}.</li>}
          {cuenta.grandes + pesados.length > 0 && <li>{cuenta.grandes + pesados.length === 1 ? 'Uno quedó afuera' : `${cuenta.grandes + pesados.length} quedaron afuera`} por pesar más de {MEGAS} MB.</li>}
        </ul>
      )}

      {!buscando && empezo && !encontro && estado === 'listo' && (
        <p>No se encontraron fechas. Los documentos escaneados no se pueden leer, así que revisalos vos.</p>
      )}

      {visibles.length > 0 && (
        <p className="herramienta__nota">Son sugerencias que hay que confirmar. Pueden estar mal o ser de otro año, así que revisalas contra el documento.</p>
      )}

      {fuertes.length > 0 && (
        <ul className="fechas__lista" data-lista="fuertes" aria-label="Fechas sugeridas">
          {fuertes.map((h) => fila(h, 'fuertes'))}
        </ul>
      )}

      {otras.length > 0 && (
        <DetallesAnimados className="fechas__otras" titulo={`Otras fechas posibles (${otras.length})`}>
          <ul className="fechas__lista" data-lista="otras" aria-label="Otras fechas posibles">
            {otras.map((h) => fila(h, 'otras'))}
          </ul>
        </DetallesAnimados>
      )}
    </div>
  );
}

// Lo encontrado vive solo en esta pantalla. Con otra materia arranca de cero.
export default function PanelFechas({ materia, items }) {
  return <Buscador key={materia.id} materia={materia} items={items} />;
}
