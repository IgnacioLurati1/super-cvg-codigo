import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useLocation } from 'react-router-dom';
import { AjustesDeHoy, MateriasEnHoy } from '../components/AjustesDeHoy';
import BrilloPdf from '../components/BrilloPdf';
import Campo from '../components/Campo';
import { BotonConectar } from '../components/Classroom';
import GuardarEnDrive from '../components/GuardarEnDrive';
import EntrarConGoogle from '../components/EntrarConGoogle';
import { Cargando, ErrorConReintento } from '../components/Filas';
import { useUI } from '../components/ui';
import { COLORES_DEL_CODIGO, CONTRASTE_MINIMO, contraste, LAB_TAMANO, LETRAS_DE_CODIGO, SIEMPRE_OSCUROS, cambiarAjustes, cambioDeBordes, cambioDeEstilo, colorActual, cuestaLeerSobre, elegirVista, ponerEstiloDeMenu, useAjustes, volverAjustesOriginales } from '../lib/ajustes';
import { movimientoDe, ponerPosicionDelMenu } from '../lib/ajustes';
import PantallasDelMenu from '../components/PantallasDelMenu';
import QueAvisosVes from '../components/QueAvisosVes';
import { AvisosEnMiniatura, HoyEnMiniatura, MateriaEnMiniatura, MateriasEnMiniatura, VistaPrevia } from '../components/VistaPrevia';
import { IconoMenu, PANTALLAS_DEL_MENU } from '../layouts/Menu';
import { guardarArchivo } from '../lib/archivos';
import { atajosDelSitio } from '../lib/atajos';
import { ATAJOS_DEL_LECTOR } from '../components/lector/atajos';
import { olvidarSacadas } from '../lib/campana';
import { cargarMaterias, cargarPerfil } from '../lib/campus';
import { codigoDeEstilo, leerCodigoDeEstilo } from '../lib/codigoDeEstilo';
import { COLORES } from '../lib/colores';
import { vaciarBodega } from '../lib/bodega';
import { olvidarClassroom } from '../lib/classroom';
import { disponibleGoogle, soltarGoogle, useGoogle } from '../lib/google';
import { instalar, useInstalar } from '../lib/instalar';
import { borrarMio, cambiarMio, exportarMio, importarMio, useMio, usuarioActual } from '../lib/mio';
import { borrarCopiaDrive, hayCopiaDrive, olvidarDrive } from '../lib/sincro';
import { estadoCalendario, olvidarCalendario } from '../lib/calendarioSincro';
import { tituloDe, useSeo } from '../lib/seo';
import { useConsulta } from '../lib/useConsulta';
import { useMarcarVistos } from '../lib/vistos';
import '../styles/codigo.css';
import './configuracion.css';
import './materias.css';
import '../components/consultron/consultron.css';
import { ESTILOS_DE_TARJETA, NOMBRES_DE_TARJETA } from '../lib/tarjetas';

const SECCION_DISPOSITIVOS = 'tus-dispositivos';

// The screen goes by sections, one at a time. The address keeps the open one (#pdf), so a reload or a link opens it, and
// a link to something inside one (#atajos) opens the one that holds it.
const SECCIONES = [
  { id: 'como-se-ve', nombre: 'Cómo se ve' },
  { id: 'pdf', nombre: 'PDF' },
  { id: 'menu', nombre: 'Menú' },
  { id: 'pantallas', nombre: 'Pantallas' },
  { id: 'laboratorio', nombre: 'Laboratorio' },
  { id: 'teclado', nombre: 'Teclado' },
  { id: 'datos', nombre: 'Datos y dispositivos' },
];
// Pantallas goes by screen too, each with its preview: #hoy, #materias, #calendario, #avisos, and what is inside one.
const PANTALLAS_DE_AJUSTES = [
  { id: 'hoy', nombre: 'Hoy' },
  { id: 'materias', nombre: 'Materias' },
  { id: 'calendario', nombre: 'Calendario' },
  { id: 'avisos', nombre: 'Avisos' },
];
const PANTALLA_DE_ANCLA = { 'materias-en-hoy': 'hoy', tarjetas: 'materias' };
const pantallaDe = (hash) => {
  const id = hash.replace(/^#/, '');
  return PANTALLAS_DE_AJUSTES.some((p) => p.id === id) ? id : (PANTALLA_DE_ANCLA[id] ?? PANTALLAS_DE_AJUSTES[0].id);
};
const DENTRO_DE = {
  atajos: 'teclado',
  [SECCION_DISPOSITIVOS]: 'datos',
  ...Object.fromEntries([...PANTALLAS_DE_AJUSTES.map((p) => p.id), ...Object.keys(PANTALLA_DE_ANCLA)].map((id) => [id, 'pantallas'])),
  consultron: 'como-se-ve',
  'pasar-estilo': 'como-se-ve',
};

const seccionDe = (hash) => {
  const id = hash.replace(/^#/, '');
  return SECCIONES.some((s) => s.id === id) ? id : (DENTRO_DE[id] ?? SECCIONES[0].id);
};

// Each style changes only how things look: nothing moves. The drawings use literal colors, like the ones of the themes.
const ESTILOS = [
  { valor: 'original', nombre: 'Original', texto: 'El de siempre, con colores planos.', dibujo: <span className="dibujo-tema" data-cual="original" aria-hidden="true" /> },
  { valor: 'hoja', nombre: 'Hoja', texto: 'Una hoja de carpeta, con renglones y margen.', dibujo: <span className="dibujo-tema" data-cual="hoja" aria-hidden="true" /> },
  { valor: 'profesional', nombre: 'Profesional', texto: 'Degradados en lugar de colores planos.', dibujo: <span className="dibujo-tema" data-cual="profesional" aria-hidden="true" /> },
  { valor: 'batman', nombre: 'Batman', texto: 'Oscuro, en negro y amarillo.', dibujo: <span className="dibujo-tema" data-cual="batman" aria-hidden="true" /> },
  { valor: 'plano', nombre: 'Plano', texto: 'Un plano de ingeniería, azul y con cuadrícula.', dibujo: <span className="dibujo-tema" data-cual="plano" aria-hidden="true" /> },
  { valor: 'pizarron', nombre: 'Pizarrón', texto: 'El del aula, con tiza y marco de madera.', dibujo: <span className="dibujo-tema" data-cual="pizarron" aria-hidden="true" /> },
];

const TEMAS = [
  { valor: 'claro', nombre: 'Claro', dibujo: <span className="dibujo-tema" data-cual="claro" aria-hidden="true" /> },
  { valor: 'oscuro', nombre: 'Oscuro', dibujo: <span className="dibujo-tema" data-cual="oscuro" aria-hidden="true" /> },
  { valor: 'sistema', nombre: 'Del sistema', texto: 'Sigue a tu dispositivo.', dibujo: <span className="dibujo-tema" data-cual="sistema" aria-hidden="true" /> },
];

// A page of a PDF in small, under the same filter as the real ones (configuracion.css): one paper, or two halves.
function DibujoPdf({ papeles }) {
  return (
    <span className="dibujo-pdf" aria-hidden="true">
      {papeles.map((papel) => <span key={papel} className="dibujo-pdf__hoja" data-papel={papel} />)}
    </span>
  );
}

// With the light theme, «Como el tema» shows the light pages the student had (ajustes.js, `pdfClaro`), and says which.
const paginasPdf = (claro) => [
  { valor: 'claro', nombre: 'Claras', texto: 'Como vienen.', dibujo: <DibujoPdf papeles={['claro']} /> },
  { valor: 'sepia', nombre: 'Sepia', texto: 'Papel cálido y letra marrón. Los colores quedan más apagados.', dibujo: <DibujoPdf papeles={['sepia']} /> },
  { valor: 'oscuro', nombre: 'Oscuras', texto: 'Fondo oscuro y letra clara. Las imágenes también cambian de color.', dibujo: <DibujoPdf papeles={['oscuro']} /> },
  { valor: 'tema', nombre: 'Como el tema', texto: `Con el tema oscuro, oscuras. Con el claro, ${claro === 'sepia' ? 'sepia' : 'claras'}.`, dibujo: <DibujoPdf papeles={[claro, 'oscuro']} /> },
];

// The header in small: two screens (four with only the drawings), the first one on view, as each style shows them.
function MuestraMenu({ estilo }) {
  const conDibujo = estilo === 'iconos' || estilo === 'solo-iconos';
  return (
    <span className="muestra-menu" data-estilo={estilo} aria-hidden="true">
      {PANTALLAS_DEL_MENU.slice(0, estilo === 'solo-iconos' ? 4 : 2).map((m, i) => (
        <span key={m.clave} className="muestra-menu__cosa" data-actual={i === 0 || undefined}>
          {conDibujo && <IconoMenu nombre={m.clave} />}
          {estilo !== 'solo-iconos' && m.texto}
        </span>
      ))}
    </span>
  );
}

const ESTILOS_DE_MENU = [
  { valor: 'texto', nombre: 'Palabras', texto: 'El nombre de cada pantalla.' },
  { valor: 'iconos', nombre: 'Íconos y palabras', texto: 'Un dibujo al lado de cada nombre.' },
  { valor: 'solo-iconos', nombre: 'Solo íconos', texto: 'Ocupa menos lugar. Los nombres se ven al pasar el mouse o al abrir el menú en el celular.' },
  { valor: 'pastillas', nombre: 'Pastillas', texto: 'La pantalla en la que estás, pintada con el resaltador.' },
].map((o) => ({ ...o, dibujo: <MuestraMenu estilo={o.valor} /> }));

// Where the menu goes, in small: a bar on top, or a column on the left.
const POSICIONES_DEL_MENU = [
  { valor: 'arriba', nombre: 'Arriba', dibujo: <span className="muestra-lado" data-lado="arriba" aria-hidden="true"><i /><b /></span> },
  { valor: 'izquierda', nombre: 'A la izquierda', texto: 'En pantallas anchas. En el celular queda arriba.', dibujo: <span className="muestra-lado" data-lado="izquierda" aria-hidden="true"><i /><b /></span> },
];

const CONTRASTES = [
  { valor: 'normal', nombre: 'Normal' },
  { valor: 'alto', nombre: 'Alto', texto: 'Bordes más marcados y texto más nítido.' },
];

const DALTONISMOS = [
  { valor: 'ninguno', nombre: 'Ninguno' },
  { valor: 'rojo-verde', nombre: 'Rojo y verde', texto: 'Para protanopia y deuteranopia.' },
  { valor: 'azul-amarillo', nombre: 'Azul y amarillo', texto: 'Para tritanopia.' },
];

const LETRAS = [
  { valor: 'normal', nombre: 'Normal', escala: 1 },
  { valor: 'grande', nombre: 'Grande', escala: 1.12 },
  { valor: 'mas-grande', nombre: 'Más grande', escala: 1.25 },
  { valor: 'enorme', nombre: 'Enorme', escala: 1.5 },
].map((l) => ({
  ...l,
  dibujo: <span className="muestra-letra" style={{ fontSize: `${l.escala * 1.5}rem` }} aria-hidden="true">Aa</span>,
}));

const MOVIMIENTOS = [
  { valor: 'sistema', nombre: 'Como diga tu dispositivo' },
  { valor: 'reducido', nombre: 'Reducir siempre', texto: 'Apaga las transiciones y las animaciones.' },
  { valor: 'ninguno', nombre: 'Sin animaciones', texto: 'Todo quieto y sin el cuaderno en 3D de la pantalla de entrada.' },
];

const COLORES_ACCION = [
  { valor: '#17324d', nombre: 'Tinta' },
  { valor: '#0b5a9e', nombre: 'Azul' },
  { valor: '#0f6470', nombre: 'Petróleo' },
  { valor: '#1f6b3a', nombre: 'Verde' },
  { valor: '#8a1f3d', nombre: 'Bordó' },
  { valor: '#5b3a9d', nombre: 'Violeta' },
];

const COLORES_RESALTADOR = [
  { valor: '#ffe14d', nombre: 'Amarillo' },
  { valor: '#b6f36b', nombre: 'Lima' },
  { valor: '#8fe3ff', nombre: 'Celeste' },
  { valor: '#ffa6d0', nombre: 'Rosa' },
  { valor: '#ffb86b', nombre: 'Naranja' },
  { valor: '#cdb8ff', nombre: 'Lila' },
];

const PANTALLAS = [
  {
    clave: 'hoy',
    titulo: 'Hoy',
    opciones: [
      { valor: 'agenda', nombre: 'Agenda', texto: 'Lo que viene, en orden, de arriba abajo.' },
      { valor: 'tablero', nombre: 'Tablero', texto: 'Bloques separados, para ver todo de un vistazo.' },
      { valor: 'compacta', nombre: 'Compacta', texto: 'Más cosas en menos lugar.' },
    ],
  },
  {
    clave: 'materia',
    titulo: 'Cada materia',
    opciones: [
      { valor: 'secciones', nombre: 'Secciones', texto: 'Como en el campus, una sección abajo de la otra.' },
      { valor: 'tarjetas', nombre: 'Tarjetas', texto: 'Cada sección en su tarjeta.' },
      { valor: 'tabla', nombre: 'Tabla', texto: 'Una fila por cosa, para comparar rápido.' },
    ],
  },
  {
    clave: 'materias',
    titulo: 'Materias',
    opciones: [
      { valor: 'tarjetas', nombre: 'Tarjetas', texto: 'Símbolo y nombre, en una grilla.' },
      { valor: 'lista', nombre: 'Lista', texto: 'Una abajo de la otra.' },
      { valor: 'grandes', nombre: 'Grandes', texto: 'Tarjetas anchas, fáciles de tocar.' },
    ],
  },
  {
    clave: 'calendario',
    titulo: 'Calendario',
    opciones: [
      { valor: 'mes', nombre: 'Mes', texto: 'El mes entero, de un vistazo.' },
      { valor: 'semana', nombre: 'Semana', texto: 'Los siete días, con más detalle.' },
      { valor: 'agenda', nombre: 'Agenda', texto: 'Solo los días con algo, en una lista.' },
    ],
  },
];

// How many blocks each drawing needs. The shape itself is in configuracion.css.
const PIEZAS = { agenda: 4, tablero: 4, compacta: 6, secciones: 3, tarjetas: 4, tabla: 6, lista: 4, grandes: 2, mes: 28, semana: 7 };

// Materias: the look of every card, with a drawing of each (materias.css).
const TEXTOS_DE_TARJETA = {
  simbolo: 'El símbolo al lado del nombre.',
  tenida: 'Toda la tarjeta de su color.',
  franja: 'Una franja de color al costado.',
  portada: 'El símbolo grande arriba.',
  sello: 'El símbolo de fondo, como un sello.',
  minima: 'Solo el nombre.',
};
const TARJETAS = ESTILOS_DE_TARJETA.map((valor) => ({
  valor,
  nombre: NOMBRES_DE_TARJETA[valor],
  texto: TEXTOS_DE_TARJETA[valor],
  dibujo: (
    <span className="dibujo-tarjeta" data-tarjeta={valor} aria-hidden="true">
      <span className="dibujo-tarjeta__simbolo" />
      <span className="dibujo-tarjeta__lineas" />
    </span>
  ),
}));

// Inside a course, the look of each thing it has (ajustes.contenido), with a drawing of two rows (configuracion.css).
const CONTENIDOS_DE_MATERIA = [
  { valor: 'icono', nombre: 'Con ícono', texto: 'El ícono en su cuadrito, como vino.' },
  { valor: 'franja', nombre: 'Franja', texto: 'Una raya del color de cada tipo.' },
  { valor: 'tenida', nombre: 'Teñido', texto: 'Cada fila del color de su tipo.' },
  { valor: 'linea', nombre: 'Una línea', texto: 'Nombre y dato juntos, más cosas a la vista.' },
  { valor: 'mosaico', nombre: 'Mosaico', texto: 'Experimental. Baldosas con el ícono grande, como una carpeta.' },
  { valor: 'notas', nombre: 'Notas', texto: 'Experimental. Papelitos del color de cada tipo, pegados con cinta.' },
].map((o) => ({
  ...o,
  dibujo: (
    <span className="dibujo-contenido" data-contenido={o.valor} aria-hidden="true">
      <span className="dibujo-contenido__fila" data-tono="pdf" />
      <span className="dibujo-contenido__fila" data-tono="actividad" />
    </span>
  ),
}));

// Consultron's chat: how big its letter is, the shape of its messages and the side of its button.
const LETRAS_CONSULTRON = [
  { valor: 'chica', nombre: 'Chica', escala: 0.9 },
  { valor: 'normal', nombre: 'Normal', escala: 1 },
  { valor: 'grande', nombre: 'Grande', escala: 1.15 },
].map((l) => ({ ...l, dibujo: <span className="muestra-letra" style={{ fontSize: `${l.escala * 1.5}rem` }} aria-hidden="true">Aa</span> }));
const FORMAS_CONSULTRON = [
  { valor: 'globos', nombre: 'Globos', texto: 'Tu pregunta en un globo.' },
  { valor: 'charla', nombre: 'Charla', texto: 'Tu pregunta y las respuestas, en globos.' },
  { valor: 'documento', nombre: 'Documento', texto: 'Sin globos, como un apunte.' },
  { valor: 'compacta', nombre: 'Compacta', texto: 'Más mensajes a la vista.' },
];
const LADOS_CONSULTRON = [
  { valor: 'derecha', nombre: 'A la derecha' },
  { valor: 'izquierda', nombre: 'A la izquierda' },
];

const APARICIONES_CONSULTRON = [
  { valor: 'modal', nombre: 'Modal', texto: 'Siempre en el recuadro, desde el botón de abajo.' },
  { valor: 'lateral', nombre: 'Lateral', texto: 'Al costado en los lectores y en Estudiar en vivo.' },
];

/** A question and its answer, drawn with the classes of the chat: it changes with what is chosen. */
function MuestraConsultron() {
  return (
    <div className="consultron-muestra" aria-hidden="true">
      <div className="consultron__hilo">
        <div className="consultron__entrada">
          <p className="consultron__pregunta">¿Qué es un semáforo?</p>
          <div className="consultron__respuesta">
            <span className="consultron__robot"><IconoMenu nombre="consultron" /></span>
            <div className="consultron__cuerpo">
              <div className="consultron__texto"><p>Una variable entera que ordena el acceso de los procesos a un recurso compartido.</p></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Dibujo({ forma }) {
  return (
    <span className="dibujo-vista" data-forma={forma} aria-hidden="true">
      {Array.from({ length: PIEZAS[forma] }, (_, i) => <span key={i} />)}
    </span>
  );
}

function Elecciones({ titulo, ayuda, nombre, opciones, valor, alElegir, parejas, apagado = false }) {
  const id = useId();
  return (
    <fieldset className="ajustes__grupo" aria-describedby={ayuda ? id : undefined} disabled={apagado}>
      <legend className="ajustes__leyenda">{titulo}</legend>
      {ayuda && <p id={id} className="ajustes__ayuda">{ayuda}</p>}
      <div className="elecciones" data-parejas={parejas}>
        {opciones.map((o) => (
          <label key={o.valor} className="eleccion">
            <input type="radio" name={nombre} value={o.valor} checked={valor === o.valor} onChange={() => alElegir(o.valor)} />
            <span className="eleccion__cuerpo">
              <span className="eleccion__nombre">{o.nombre}</span>
              {o.texto && <span className="eleccion__texto">{o.texto}</span>}
              {o.dibujo}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function ElegirColor({ clave, titulo, ayuda, otroColor, opciones, ajustes, poner, alerta, previa }) {
  const control = useRef(null);
  const propio = ajustes[clave];
  // As in Coloración (ColoresDelCodigo): while the picker is dragged the page only paints the color, once a frame, and
  // the settings are saved when it lets go.
  const [borrador, setBorrador] = useState(null);
  const cuadro = useRef(0);
  const probar = (color) => {
    setBorrador(color);
    cancelAnimationFrame(cuadro.current);
    cuadro.current = requestAnimationFrame(() => window.aplicarAjustes?.({ ...ajustes, [clave]: color }));
  };
  const soltar = (color) => {
    cancelAnimationFrame(cuadro.current);
    setBorrador(null);
    if (color !== (propio ?? null)) poner({ [clave]: color });
    else window.aplicarAjustes?.();
  };
  const ultimo = useRef(soltar);
  useLayoutEffect(() => {
    ultimo.current = soltar;
  });
  useEffect(() => {
    const el = control.current;
    const alSoltar = (e) => ultimo.current(e.target.value);
    el?.addEventListener('change', alSoltar);
    return () => {
      cancelAnimationFrame(cuadro.current);
      el?.removeEventListener('change', alSoltar);
    };
  }, []);

  const volver = () => {
    poner({ [clave]: null });
    // The button that had the focus disappears.
    control.current?.focus();
  };

  return (
    <div className="ajustes__color">
      <Elecciones
        titulo={titulo}
        ayuda={ayuda}
        nombre={clave}
        valor={propio}
        alElegir={(v) => poner({ [clave]: v })}
        parejas="color"
        opciones={opciones.map((o) => ({ ...o, dibujo: <span className="muestra-color" style={{ background: o.valor }} aria-hidden="true" /> }))}
      />
      <div className="ajustes__otro">
        <Campo etiqueta={otroColor}>
          <input ref={control} className="ajustes__pozo" type="color" value={borrador ?? colorActual(ajustes, clave)} onChange={(e) => probar(e.target.value)} onBlur={(e) => borrador !== null && soltar(e.target.value)} />
        </Campo>
        <span className="ajustes__previa" aria-hidden="true">{previa}</span>
        {propio && <button type="button" className="boton boton--secundario" onClick={volver}>Volver al original</button>}
      </div>
      {propio && cuestaLeerSobre(propio) && <p className="ajustes__alerta" role="status">{alerta}</p>}
    </div>
  );
}

/** «Pasar tu estilo»: the code of the whole Configuración here, to copy, and a field for a classmate's (codigoDeEstilo.js).
 * Right after using one, a way back to the student's own. */
function PasarEstilo({ ajustes }) {
  const { confirmar, avisar } = useUI();
  const mio = useMio();
  const codigo = codigoDeEstilo(ajustes, mio);
  const [escrito, setEscrito] = useState('');
  const [error, setError] = useState('');
  const [antes, setAntes] = useState(null);
  const [sinPortapapeles, setSinPortapapeles] = useState(false);
  const campo = useRef(null);
  const tuyo = useRef(null);

  useEffect(() => {
    if (sinPortapapeles) tuyo.current?.select();
  }, [sinPortapapeles]);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(codigo);
      setSinPortapapeles(false);
      avisar('Código copiado');
    } catch {
      setSinPortapapeles(true);
    }
  };

  // The device's settings and the student's own of Hoy and the bell; what a course has stays.
  const poner = ({ ajustes: a, hoy, avisosOcultos }) => {
    const bienAjustes = cambiarAjustes(a);
    const bienMio = cambiarMio((d) => ({ ...d, hoy: { ...d.hoy, ...hoy }, avisosOcultos }));
    return bienAjustes && bienMio;
  };

  const usar = async (e) => {
    e.preventDefault();
    const cambio = leerCodigoDeEstilo(escrito, ajustes);
    if (!cambio) {
      setError(escrito.trim() ? 'Ese código no es de un estilo. Revisá que esté completo.' : 'Pegá el código que te pasaron.');
      campo.current?.focus();
      return;
    }
    const nombre = ESTILOS.find((s) => s.valor === cambio.ajustes.estilo).nombre;
    const seguro = await confirmar({
      titulo: '¿Usar este estilo?',
      texto: `Es ${nombre}, con toda su configuración. Tu daltonismo, tu movimiento y Sensible a la luz no cambian.`,
      boton: 'Usar este estilo',
    });
    if (!seguro) return;
    // The way back is to the student's own, even after trying several codes.
    const previo = antes ?? { ajustes, hoy: mio.hoy, avisosOcultos: mio.avisosOcultos };
    if (!poner(cambio)) avisar('No se pudo guardar. Vale hasta que cierres esta pestaña.', 'error');
    else avisar('Estilo cambiado');
    setAntes(previo);
    setEscrito('');
    setError('');
  };

  const volver = () => {
    if (!poner(antes)) avisar('No se pudo guardar. Vale hasta que cierres esta pestaña.', 'error');
    else avisar('Volviste a tu estilo');
    setAntes(null);
  };

  return (
    <div className="pasar-estilo">
      <div className="pasar-estilo__tuyo">
        <p className="pasar-estilo__etiqueta">Tu código</p>
        <div className="pasar-estilo__fila">
          <code className="pasar-estilo__codigo">{codigo}</code>
          <button type="button" className="boton" onClick={copiar}>Copiar</button>
        </div>
      </div>
      {sinPortapapeles && (
        <Campo etiqueta="Tu código, para copiar" ayuda="No pudimos copiarlo solo. Copialo de acá.">
          <input ref={tuyo} className="campo__control" type="text" readOnly value={codigo} onFocus={(e) => e.target.select()} />
        </Campo>
      )}
      <form className="pasar-estilo__usar" onSubmit={usar} noValidate>
        <Campo etiqueta="Código de otro" error={error}>
          <input
            ref={campo}
            className="campo__control"
            type="text"
            value={escrito}
            onChange={(e) => {
              setEscrito(e.target.value);
              if (error) setError('');
            }}
            placeholder="CVG-…"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={120}
          />
        </Campo>
        <button type="submit" className="boton boton--secundario">Usar este estilo</button>
      </form>
      {antes && (
        <div className="ajustes__botones">
          <button type="button" className="boton boton--secundario" onClick={volver}>Volver al tuyo</button>
        </div>
      )}
    </div>
  );
}

function TusDatos() {
  const { confirmar, avisar } = useUI();
  const perfil = useConsulta(cargarPerfil);
  const [problema, setProblema] = useState('');
  const archivo = useRef(null);

  if (perfil.error && !perfil.datos) return <ErrorConReintento texto={perfil.error} recargar={perfil.recargar} />;
  if (!perfil.datos) return <Cargando texto="Buscando tus datos" />;

  const bajar = () => {
    setProblema('');
    const hoy = new Date().toLocaleDateString('sv');
    guardarArchivo(new Blob([exportarMio()], { type: 'application/json' }), `super-cvg-mis-datos-${hoy}.json`);
    avisar('Archivo guardado en tus descargas');
  };

  const restaurar = async (e) => {
    const elegido = e.target.files?.[0];
    e.target.value = '';
    if (!elegido) return;
    setProblema('');
    if (elegido.size > 6_000_000) {
      setProblema('Ese archivo es demasiado grande para ser de Super CVG.');
      return;
    }
    const seguro = await confirmar({
      titulo: '¿Restaurar desde este archivo?',
      texto: 'Lo que tenés ahora en este navegador se reemplaza por lo del archivo.',
      boton: 'Restaurar',
      peligro: true,
    });
    if (!seguro) return;
    try {
      if (importarMio(await elegido.text())) avisar('Restauraste tus datos');
      else setProblema('No se pudo guardar en este navegador. Puede que esté lleno.');
    } catch {
      setProblema('Ese archivo no es de Super CVG.');
    }
  };

  const borrar = async () => {
    setProblema('');
    const seguro = await confirmar({
      titulo: '¿Borrar todo lo tuyo de este navegador?',
      texto: `Se van tus notas, tareas, fechas, tus materias con sus archivos y lo que ocultaste o renombraste. El campus no cambia${estadoCalendario().prendido ? ', y el calendario «Super CVG» de tu Google queda como está' : ''}. Si no bajaste un archivo con tus datos, no se puede recuperar.`,
      boton: 'Borrar todo',
      peligro: true,
    });
    if (!seguro) return;
    // The copy in Drive, only if the student says so. If it can't be deleted, nothing is: they can try again.
    if (disponibleGoogle() && hayCopiaDrive()) {
      const tambien = await confirmar({
        titulo: '¿Borrar también la copia de tu Drive?',
        texto: 'Si la dejás, tus otros dispositivos la siguen usando.',
        boton: 'Borrar la copia',
        volver: 'Dejarla',
        peligro: true,
      });
      if (tambien) {
        // Without the permission, Google's window opens for it.
        try {
          await borrarCopiaDrive();
        } catch (e) {
          if (e.codigo !== 'cancelada') setProblema(e.conocido && e.message ? e.message : 'No se pudo borrar la copia de tu Drive. Probá de nuevo.');
          return;
        }
      }
    }
    // This device stops saving in Drive first: what goes away here must not come back from there.
    olvidarDrive();
    // And it stops passing dates to Google Calendar: the calendar there stays as it is.
    olvidarCalendario();
    // The files of the courses of one's own live apart, in the browser's database.
    const usuario = usuarioActual();
    let archivosBien = true;
    if (usuario !== null) await vaciarBodega(usuario).catch(() => { archivosBien = false; });
    borrarMio();
    olvidarSacadas();
    if (!archivosBien) {
      setProblema('No se pudieron borrar los archivos de tus materias. Probá de nuevo.');
      return;
    }
    avisar('Borramos lo tuyo de este navegador');
  };

  return (
    <>
      <div className="ajustes__botones">
        <button type="button" className="boton boton--secundario" onClick={bajar}>Bajar un archivo</button>
        <button type="button" className="boton boton--secundario" onClick={() => archivo.current?.click()}>Restaurar desde un archivo</button>
        <input ref={archivo} type="file" accept=".json,application/json" hidden onChange={restaurar} />
        <button type="button" className="boton boton--secundario ajustes__borrar" onClick={borrar}>Borrar todo lo mío de este navegador</button>
      </div>
      {problema && <p className="mensaje mensaje--error" role="alert">{problema}</p>}
    </>
  );
}

// Connecting or disconnecting swaps one button for the other: the focus goes to the new one.
function TuClassroom() {
  const google = useGoogle();
  const { avisar } = useUI();
  const [cambio, setCambio] = useState(false);
  const desconectarBoton = useRef(null);
  useEffect(() => {
    if (cambio && google.conectado) desconectarBoton.current?.focus();
  }, [cambio, google.conectado]);
  const desconectar = () => {
    soltarGoogle('classroom');
    olvidarClassroom();
    setCambio(true);
    avisar('Desconectaste Classroom');
  };
  if (google.conectado) {
    return (
      <div className="ajustes__botones">
        <p className="ajustes__estado">{google.email ? <>Conectado como <strong>{google.email}</strong>.</> : 'Conectado.'}</p>
        <button ref={desconectarBoton} type="button" className="boton boton--secundario" onClick={desconectar}>Desconectar</button>
      </div>
    );
  }
  return <BotonConectar enfocar={cambio} alConectar={() => { setCambio(true); avisar('Classroom conectado'); }} />;
}

// «Instalar Super CVG»: the browser installs it from the button (Chrome, Edge, Android), or the steps by hand (Safari on
// iPhone and iPad). Installed, or where the browser can't, it isn't here (lib/instalar.js). An offer works once: after
// the browser's window the card goes, and the focus goes to the section's title.
function InstalarApp() {
  const como = useInstalar();
  const { avisar } = useUI();
  if (!como) return null;
  const tocar = async () => {
    const instalada = await instalar();
    document.getElementById(SECCION_DISPOSITIVOS)?.focus();
    if (instalada) avisar('Super CVG quedó instalada');
  };
  return (
    <div className="instalar">
      <div className="instalar__fila">
        <span className="instalar__texto">
          <span className="instalar__nombre">Instalar Super CVG</span>
          <span id="instalar-ayuda" className="instalar__ayuda">Queda con su ícono entre tus apps y se abre sin la barra del navegador. Con «Seguir conectado» no te pide la contraseña cada vez.</span>
        </span>
        {como === 'boton' && <button type="button" className="boton boton--chico" aria-describedby="instalar-ayuda" onClick={tocar}>Instalar</button>}
      </div>
      {como === 'ios' && (
        <ol className="instalar__pasos">
          <li>
            Tocá Compartir{' '}
            <svg className="instalar__compartir" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M12 3.5v11M8 7.5l4-4 4 4M8.5 10H7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-1.5" />
            </svg>
            . Si no lo ves, buscalo en el menú de los tres puntos.
          </li>
          <li>Elegí «Agregar a inicio» y confirmá con Agregar.</li>
        </ol>
      )}
    </div>
  );
}

// The lab (Laboratorio.jsx): its editor and its database. Each letter shows itself in its option.
const LETRAS_DEL_CODIGO = [
  { valor: 'sistema', nombre: 'La del sistema' },
  { valor: 'jetbrains-mono', nombre: 'JetBrains Mono' },
  { valor: 'fira-code', nombre: 'Fira Code', texto: 'Junta signos como != y =>.' },
  { valor: 'source-code-pro', nombre: 'Source Code Pro' },
  { valor: 'atkinson', nombre: 'Atkinson Hyperlegible', texto: 'Hecha para leer fácil.' },
].map((o) => ({ ...o, dibujo: <span className="ajustes-lab__letra" style={{ fontFamily: LETRAS_DE_CODIGO[o.valor], fontVariantLigatures: o.valor === 'fira-code' ? 'normal' : 'none' }} aria-hidden="true">{'if (a != b) { x => 0 }'}</span> }));

const SANGRIAS = [
  { valor: 4, nombre: '4 espacios' },
  { valor: 2, nombre: '2 espacios' },
];

const BASES = [
  { valor: 'auto', nombre: 'Según el lugar', texto: 'Una al lado de la otra si entran.' },
  { valor: 'lado', nombre: 'Una al lado de la otra' },
  { valor: 'abajo', nombre: 'Una abajo de la otra', texto: 'Con las claves unidas por líneas en el margen.' },
];

/** The size of the code, with a slider. The preview under it follows. */
function TamanoDelCodigo({ valor, alCambiar }) {
  const id = useId();
  return (
    <div className="brillo-pdf">
      <div className="brillo-pdf__cabeza">
        <label htmlFor={id} className="brillo-pdf__nombre">Tamaño de la letra</label>
        <output htmlFor={id} className="brillo-pdf__valor" aria-hidden="true">{valor} px</output>
      </div>
      <input
        id={id}
        className="brillo-pdf__control"
        type="range"
        min={LAB_TAMANO.min}
        max={LAB_TAMANO.max}
        step="1"
        value={valor}
        aria-valuetext={`${valor} píxeles`}
        onChange={(e) => alCambiar(Number(e.target.value))}
      />
    </div>
  );
}

/** The editor in small, with what is chosen: letter, size, line numbers, indentation and the error at the end of its line. */
function MuestraDelEditor({ ajustes }) {
  const sangria = ' '.repeat(ajustes.labSangria);
  const lineas = ['int main(void) {', `${sangria}int total = 0`, `${sangria}printf("%d\\n", total);`, '}'];
  return (
    <div className="ajustes-lab__muestra" aria-hidden="true">
      {lineas.map((l, i) => (
        <div key={i} className="ajustes-lab__fila" data-error={(ajustes.labErrores && i === 1) || undefined}>
          {ajustes.labNumeros && <span className="ajustes-lab__numero">{i + 1}</span>}
          <span className="ajustes-lab__codigo">{l}</span>
          {ajustes.labErrores && i === 1 && <span className="ajustes-lab__lente">Falta un ; al final de la línea.</span>}
        </div>
      ))}
    </div>
  );
}

/** Coloración: the color of each kind of code, over the theme's (styles/codigo.css), with a word that shows it. */
const ATRIBUTOS_DEL_TEMA = ['data-tema', 'data-estilo', 'data-contraste', 'data-luz'];
const temaDeLaPagina = () => ATRIBUTOS_DEL_TEMA.map((a) => document.documentElement.getAttribute(a)).join(' ');
const seguirElTema = (avisar) => {
  const observador = new MutationObserver(avisar);
  observador.observe(document.documentElement, { attributes: true, attributeFilter: ATRIBUTOS_DEL_TEMA });
  return () => observador.disconnect();
};

function ColoresDelCodigo({ ajustes, poner }) {
  const propios = ajustes.labColores;
  const pozos = useRef({});
  const id = useId();
  // The theme's colors are read from the page: a change of theme, style or contrast (also the system's, with this
  // screen open) draws it again, so the swatches and the contrast warning follow.
  useSyncExternalStore(seguirElTema, temaDeLaPagina);
  const estilo = getComputedStyle(document.documentElement);
  const fondo = estilo.getPropertyValue('--superficie').trim();
  const delTema = (clave) => estilo.getPropertyValue(`--codigo-${clave}`).trim();
  const cambiar = (clave, color) => {
    const nuevos = { ...propios };
    if (color) nuevos[clave] = color;
    else delete nuevos[clave];
    poner({ labColores: nuevos });
  };
  // While the picker is dragged only the color of the code changes, once a frame: saving the settings on each step
  // (storage, the whole <html>, every screen that reads them) made it lag. It saves when the picker lets go.
  const [borrador, setBorrador] = useState(null);
  const cuadro = useRef(0);
  const probar = (clave, color) => {
    setBorrador({ clave, color });
    cancelAnimationFrame(cuadro.current);
    cuadro.current = requestAnimationFrame(() => document.documentElement.style.setProperty(`--codigo-${clave}`, color));
  };
  const soltar = (clave, color) => {
    cancelAnimationFrame(cuadro.current);
    setBorrador(null);
    if (color !== (propios[clave] ?? null)) cambiar(clave, color);
    // Back where it was (the picker closed on the same color): the saved one goes back over the one being tried.
    else window.aplicarAjustes?.();
  };
  const ultimo = useRef(soltar);
  useLayoutEffect(() => {
    ultimo.current = soltar;
  });
  useEffect(() => {
    const pozosAhora = Object.entries(pozos.current).filter(([, el]) => el);
    const alSoltar = (e) => ultimo.current(e.target.dataset.clave, e.target.value);
    pozosAhora.forEach(([, el]) => el.addEventListener('change', alSoltar));
    return () => {
      cancelAnimationFrame(cuadro.current);
      pozosAhora.forEach(([, el]) => el.removeEventListener('change', alSoltar));
    };
  }, []);
  const volver = (clave) => {
    cambiar(clave, null);
    // The button that had the focus disappears.
    pozos.current[clave]?.focus();
  };
  return (
    <div className="ajustes-lab__colores">
      {COLORES_DEL_CODIGO.map(({ clave, nombre, ejemplo }) => {
        const enCurso = borrador?.clave === clave ? borrador.color : null;
        const propio = enCurso ?? propios[clave];
        const valor = propio ?? delTema(clave);
        return (
          <div key={clave} className="ajustes-lab__color">
            <label className="campo__etiqueta" htmlFor={`${id}-${clave}`}>{nombre}</label>
            <div className="ajustes__otro ajustes-lab__fila-color">
              <input id={`${id}-${clave}`} ref={(el) => { pozos.current[clave] = el; }} className="ajustes__pozo" type="color" data-clave={clave} value={/^#[0-9a-f]{6}$/i.test(valor) ? valor : '#000000'} onChange={(e) => probar(clave, e.target.value)} onBlur={(e) => enCurso && soltar(clave, e.target.value)} />
              <code className="ajustes__previa ajustes-lab__ejemplo" style={{ color: `var(--codigo-${clave})` }} aria-hidden="true">{ejemplo}</code>
              {propio && <button type="button" className="boton boton--secundario" aria-label={`Volver al original, ${nombre}`} onClick={() => volver(clave)}>Volver al original</button>}
            </div>
            {propio && /^#[0-9a-f]{6}$/i.test(fondo) && contraste(propio, fondo) < CONTRASTE_MINIMO && <p className="ajustes__alerta" role="status">Con este color cuesta leer el código. Probá uno más claro o más oscuro.</p>}
          </div>
        );
      })}
    </div>
  );
}

/** A setting that is on or off, with what it does underneath. */
function Interruptor({ id, nombre, ayuda, prendido, alCambiar }) {
  return (
    <div className="ajuste-si">
      <span className="ajuste-si__texto">
        <label htmlFor={id} className="ajuste-si__nombre">{nombre}</label>
        <span id={`${id}-ayuda`} className="ajuste-si__ayuda">{ayuda}</span>
      </span>
      <input id={id} className="interruptor" type="checkbox" role="switch" checked={prendido} aria-describedby={`${id}-ayuda`} onChange={(e) => alCambiar(e.target.checked)} />
    </div>
  );
}

function Seccion({ id, titulo, bajada, children }) {
  const propio = useId();
  return (
    <section className="bloque ajustes__seccion" aria-labelledby={id ?? propio}>
      <div className="ajustes__cabeza">
        <h2 id={id ?? propio} tabIndex={id ? -1 : undefined}>{titulo}</h2>
        {bajada && <p>{bajada}</p>}
      </div>
      <div className="ajustes__cuerpo">{children}</div>
    </section>
  );
}

function Pestanas({ actual, alElegir }) {
  const mover = (e) => {
    const i = SECCIONES.findIndex((s) => s.id === actual);
    const destino = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: SECCIONES.length - 1 }[e.key];
    if (destino === undefined) return;
    e.preventDefault();
    const otra = SECCIONES[(destino + SECCIONES.length) % SECCIONES.length].id;
    alElegir(otra);
    document.getElementById(`pestana-${otra}`)?.focus();
  };
  return (
    <div className="ajustes__pestanas" role="tablist" aria-label="Secciones de Configuración" onKeyDown={mover}>
      {SECCIONES.map((s) => (
        <button
          key={s.id}
          id={`pestana-${s.id}`}
          type="button"
          role="tab"
          className="ajustes__pestana"
          aria-selected={actual === s.id}
          aria-controls={`ajustes-${s.id}`}
          tabIndex={actual === s.id ? 0 : -1}
          onClick={() => alElegir(s.id)}
        >
          {s.nombre}
        </button>
      ))}
    </div>
  );
}

function Panel({ id, actual, children }) {
  return (
    <div className="ajustes__panel" role="tabpanel" id={`ajustes-${id}`} aria-labelledby={`pestana-${id}`} hidden={actual !== id}>
      {children}
    </div>
  );
}

/** The view of one screen (PANTALLAS), with its drawings. */
function Vista({ clave, ajustes, avisar }) {
  const { titulo, opciones } = PANTALLAS.find((p) => p.clave === clave);
  return (
    <Elecciones
      titulo={clave === 'hoy' || clave === 'calendario' ? 'Vista' : titulo === 'Materias' ? 'Lista' : titulo}
      nombre={`vista-${clave}`}
      valor={ajustes.vistas[clave]}
      alElegir={(vista) => {
        if (!elegirVista(clave, vista)) avisar('No se pudo guardar. Vale hasta que cierres esta pestaña.', 'error');
      }}
      opciones={opciones.map((o) => ({ ...o, dibujo: <Dibujo forma={o.valor} /> }))}
    />
  );
}

/** The screens of Pantallas, one at a time, as tabs inside the tab. */
function Subpestanas({ actual, alElegir }) {
  const mover = (e) => {
    const i = PANTALLAS_DE_AJUSTES.findIndex((p) => p.id === actual);
    const destino = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: PANTALLAS_DE_AJUSTES.length - 1 }[e.key];
    if (destino === undefined) return;
    e.preventDefault();
    const otra = PANTALLAS_DE_AJUSTES[(destino + PANTALLAS_DE_AJUSTES.length) % PANTALLAS_DE_AJUSTES.length].id;
    alElegir(otra);
    document.getElementById(otra)?.focus();
  };
  return (
    <div className="subpestanas" role="tablist" aria-label="Qué pantalla" onKeyDown={mover}>
      {PANTALLAS_DE_AJUSTES.map((p) => (
        <button
          key={p.id}
          // The screen's own anchor (#hoy, #materias…): arriving there shows the pills, with the focus on its own.
          id={p.id}
          type="button"
          role="tab"
          className="subpestana"
          aria-selected={actual === p.id}
          aria-controls={`pantalla-${p.id}`}
          tabIndex={actual === p.id ? 0 : -1}
          onClick={() => alElegir(p.id)}
        >
          {p.nombre}
        </button>
      ))}
    </div>
  );
}

/** One screen of Pantallas: its choices, and beside them (above, on a phone) how it ends up. */
function Subpanel({ id, actual, vista, children }) {
  return (
    <div className="subpanel" role="tabpanel" id={`pantalla-${id}`} aria-labelledby={id} hidden={actual !== id}>
      <h2 className="solo-lectores">{PANTALLAS_DE_AJUSTES.find((p) => p.id === id).nombre}</h2>
      <div className="subpanel__cuerpo">
        <div className="subpanel__ajustes">{children}</div>
        {vista}
      </div>
    </div>
  );
}

// Keys as the keyboard shows them, one after the other or together.
function Teclas({ atajo }) {
  if (atajo.con) {
    return <span className="atajo__teclas">{atajo.con.map((t, i) => <span key={t}>{i > 0 && ' + '}<kbd>{t}</kbd></span>)}</span>;
  }
  return <span className="atajo__teclas">{atajo.teclas.map((t, i) => <span key={t}>{i > 0 && ' y luego '}<kbd>{t}</kbd></span>)}</span>;
}

function Atajos({ prendidos, poner, orden }) {
  return (
    <>
      <Interruptor
        id="atajos-de-una-tecla"
        nombre="Atajos de una tecla"
        ayuda="Con / buscás y con ? ves esta lista. Si usás un lector de pantalla o se te disparan sin querer, apagalos. Los que van con Alt andan siempre."
        prendido={prendidos}
        alCambiar={(atajos) => poner({ atajos })}
      />
      {[...atajosDelSitio(orden), ATAJOS_DEL_LECTOR].map((g) => (
        <div key={g.grupo} className="atajos">
          <h3>{g.grupo}</h3>
          <dl className="atajos__lista">
            {g.lista.map((a) => (
              <div key={`${a.texto}:${(a.con ?? a.teclas).join('+')}`} className="atajo" data-apagado={!prendidos && !a.siempre ? '' : undefined}>
                <dt><Teclas atajo={a} /></dt>
                <dd>{a.texto}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </>
  );
}

export default function Configuracion() {
  useSeo({ titulo: tituloDe('Configuración'), noindex: true });
  const { confirmar, avisar } = useUI();
  const ajustes = useAjustes();
  const google = useGoogle();
  const instalable = useInstalar() !== null;
  const marcarVistos = useMarcarVistos();
  const siempreOscuro = SIEMPRE_OSCUROS.includes(ajustes.estilo);
  const { hash, key } = useLocation();
  const [seccion, setSeccion] = useState(() => seccionDe(hash));
  // Each arrival at the screen reads the address again: a second link to #atajos while another section is open (a new
  // key), or only the # changed by hand (the browser gives it no key of its own).
  const [pantalla, setPantalla] = useState(() => pantallaDe(hash));
  const [llegada, setLlegada] = useState(`${key}${hash}`);
  if (`${key}${hash}` !== llegada) {
    setLlegada(`${key}${hash}`);
    setSeccion(seccionDe(hash));
    setPantalla(pantallaDe(hash));
  }
  const mio = useMio();
  // The student's own courses for the preview of Materias: the same answer the rest of the site already asked for.
  const materias = useConsulta(async () => {
    if (seccion !== 'pantallas') return null;
    await cargarPerfil();
    return cargarMaterias();
  }, [seccion === 'pantallas']);
  const elegirPantalla = (id) => {
    setPantalla(id);
    window.history.replaceState(window.history.state, '', `#${id}`);
  };
  // From Calendario to the courses it shows, which are chosen with Hoy's.
  const irAMateriasEnHoy = () => {
    elegirPantalla('hoy');
    requestAnimationFrame(() => {
      const titulo = document.getElementById('materias-en-hoy');
      titulo?.scrollIntoView({ block: 'start' });
      titulo?.focus({ preventScroll: true });
    });
  };
  // Without the router: a new address would scroll the page and take the focus away from the tabs (CambioDePantalla).
  // Chosen from far down a long one, the page goes to the top of the new one: it would open halfway.
  const elegirSeccion = (id) => {
    const barra = document.querySelector('.ajustes__pestanas');
    const abierta = document.getElementById(`ajustes-${seccion}`);
    const bajo = barra && abierta && abierta.getBoundingClientRect().top < barra.getBoundingClientRect().bottom - 1;
    setSeccion(id);
    window.history.replaceState(window.history.state, '', `#${id}`);
    requestAnimationFrame(() => {
      if (bajo) document.getElementById(`ajustes-${id}`)?.scrollIntoView({ block: 'start' });
      document.getElementById(`pestana-${id}`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  };

  const poner = (cambio) => {
    if (!cambiarAjustes(cambio)) avisar('No se pudo guardar. Vale hasta que cierres esta pestaña.', 'error');
  };

  const volverTodo = async () => {
    const seguro = await confirmar({
      titulo: '¿Volver todo a como venía?',
      texto: 'Estilo, bordes, tema, contraste, colores, letra, movimiento, PDF, menú, vistas, tarjetas, Consultron y Laboratorio vuelven al principio. Sensible a la luz y tus datos no se tocan.',
      boton: 'Volver todo',
    });
    if (!seguro) return;
    volverAjustesOriginales();
    avisar('Volvió todo a como venía');
  };

  return (
    <div className="contenedor pagina ajustes">
      <div className="titular">
        <div>
          <h1>Configuración</h1>
          <p className="titular__fecha">Casi todo se guarda en este dispositivo.</p>
        </div>
      </div>

      <Pestanas actual={seccion} alElegir={elegirSeccion} />

      <Panel id="como-se-ve" actual={seccion}>
        <Seccion titulo="Estilo y tema">
          <Elecciones titulo="Estilo" ayuda="Nada se mueve de lugar." nombre="estilo" parejas="estilo" opciones={ESTILOS} valor={ajustes.estilo} alElegir={(estilo) => poner(cambioDeEstilo(ajustes, estilo))} />
          <Interruptor
            id="bordes"
            nombre="Bordes"
            ayuda="Cada bloque en su recuadro, con cualquier estilo."
            prendido={ajustes.bordes}
            alCambiar={(bordes) => poner(cambioDeBordes(bordes))}
          />
          <Elecciones
            titulo="Tema"
            ayuda={siempreOscuro ? `Con el estilo ${ESTILOS.find((e) => e.valor === ajustes.estilo).nombre}, siempre oscuro.` : undefined}
            nombre="tema"
            opciones={TEMAS}
            valor={siempreOscuro ? 'oscuro' : ajustes.tema}
            alElegir={(tema) => poner({ tema })}
            apagado={siempreOscuro}
          />
        </Seccion>

        <Seccion titulo="Para leer mejor">
          <Elecciones titulo="Contraste" nombre="contraste" opciones={CONTRASTES} valor={ajustes.contraste} alElegir={(contraste) => poner({ contraste })} />
          <div>
            <Elecciones
              titulo="Daltonismo"
              ayuda="Cambia los colores de las materias y de los avisos."
              nombre="daltonismo"
              opciones={DALTONISMOS}
              valor={ajustes.daltonismo}
              alElegir={(daltonismo) => poner({ daltonismo })}
            />
            <div className="ajustes__paleta" aria-hidden="true">
              {Array.from({ length: COLORES }, (_, n) => <span key={n} style={{ background: `var(--materia-${n})` }} />)}
              <i />
              {['error', 'ok', 'aviso'].map((n) => <span key={n} style={{ background: `var(--${n})` }} />)}
            </div>
          </div>
          <Elecciones titulo="Tamaño de letra" nombre="letra" opciones={LETRAS} valor={ajustes.letra} alElegir={(letra) => poner({ letra })} parejas="letra" />
          <Elecciones
            titulo="Movimiento"
            ayuda={ajustes.luz ? 'Con Sensible a la luz, sin animaciones.' : undefined}
            nombre="movimiento"
            opciones={MOVIMIENTOS}
            valor={movimientoDe(ajustes)}
            alElegir={(movimiento) => poner({ movimiento })}
            apagado={ajustes.luz}
          />
          <Interruptor
            id="luz"
            nombre="Sensible a la luz"
            ayuda="Pone el tema y los PDF oscuros, sin destellos ni saltos de brillo y con las imágenes animadas quietas. Después los podés cambiar."
            prendido={ajustes.luz}
            alCambiar={(luz) => poner(luz ? { luz, tema: 'oscuro', pdf: 'oscuro' } : { luz })}
          />
        </Seccion>


        <Seccion titulo="Colores" bajada="Cambian en toda la página.">
          <ElegirColor
            clave="accion"
            titulo="Color principal"
            ayuda="La cabecera y los botones."
            otroColor="Otro color principal"
            opciones={COLORES_ACCION}
            ajustes={ajustes}
            poner={poner}
            alerta="Con este color cuesta leer el texto de los botones. Probá uno más claro o más oscuro."
            previa={<span className="boton">Así queda</span>}
          />
          <ElegirColor
            clave="resaltador"
            titulo="Resaltador"
            ayuda="Marca lo urgente y el día de hoy."
            otroColor="Otro color de resaltador"
            opciones={COLORES_RESALTADOR}
            ajustes={ajustes}
            poner={poner}
            alerta="Con este color cuesta leer lo resaltado. Probá uno más claro o más oscuro."
            previa={<span className="marcado">Así queda</span>}
          />
        </Seccion>

        <Seccion id="consultron" titulo="Consultron" bajada="Cómo se ve su charla, acá y en cada pantalla.">
          <MuestraConsultron />
          <Elecciones titulo="Letra de la charla" nombre="consultron-letra" opciones={LETRAS_CONSULTRON} valor={ajustes.consultronLetra} alElegir={(consultronLetra) => poner({ consultronLetra })} parejas="tres" />
          <Elecciones titulo="Mensajes" nombre="consultron-forma" opciones={FORMAS_CONSULTRON} valor={ajustes.consultronForma} alElegir={(consultronForma) => poner({ consultronForma })} parejas="forma" />
          <Elecciones titulo="Botón de abajo" nombre="consultron-lado" opciones={LADOS_CONSULTRON} valor={ajustes.consultronLado} alElegir={(consultronLado) => poner({ consultronLado })} />
          <Elecciones titulo="Aparición" nombre="consultron-aparicion" opciones={APARICIONES_CONSULTRON} valor={ajustes.consultronAparicion} alElegir={(consultronAparicion) => poner({ consultronAparicion })} />
          <ElegirColor
            clave="consultronColor"
            titulo="Color"
            ayuda="Su botón, su cabecera y tus preguntas."
            otroColor="Otro color de Consultron"
            opciones={COLORES_ACCION}
            ajustes={ajustes}
            poner={poner}
            alerta="Con este color cuesta leer tus preguntas. Probá uno más claro o más oscuro."
            previa={<span className="consultron-muestra"><span className="consultron__pregunta">Así queda</span></span>}
          />
        </Seccion>

        <Seccion id="pasar-estilo" titulo="Pasar tu estilo" bajada="Lleva toda tu configuración, menos daltonismo, movimiento, Sensible a la luz y lo de cada materia.">
          <PasarEstilo ajustes={ajustes} />
        </Seccion>
      </Panel>

      <Panel id="pdf" actual={seccion}>
        <Seccion titulo="Lector de PDF">
          <div className="ajustes__pdf">
            <Elecciones
              titulo="Color de las páginas"
              ayuda="En el lector las pasás a oscuras con la luna o con la tecla O. Al volver quedan claras o sepia, como las tenías."
              nombre="pdf"
              opciones={paginasPdf(ajustes.pdfClaro)}
              valor={ajustes.pdf}
              alElegir={(pdf) => poner({ pdf })}
            />
            {/* Only where dark pages can show: chosen, or with the dark theme. */}
            {(ajustes.pdf === 'oscuro' || ajustes.pdf === 'tema') && <BrilloPdf valor={ajustes.pdfBrillo} alCambiar={(pdfBrillo) => poner({ pdfBrillo })} />}
          </div>
        </Seccion>
      </Panel>

      <Panel id="menu" actual={seccion}>
        <Seccion titulo="Menú" bajada="Los cambios se ven al instante.">
          <Elecciones
            titulo="Posición del menú"
            nombre="menu-posicion"
            opciones={POSICIONES_DEL_MENU}
            valor={ajustes.menu.posicion}
            alElegir={(posicion) => {
              if (!ponerPosicionDelMenu(posicion)) avisar('No se pudo guardar. Vale hasta que cierres esta pestaña.', 'error');
            }}
          />
          <Elecciones
            titulo="Estilo"
            nombre="menu-estilo"
            opciones={ESTILOS_DE_MENU}
            valor={ajustes.menu.estilo}
            alElegir={(estilo) => {
              if (!ponerEstiloDeMenu(estilo)) avisar('No se pudo guardar. Vale hasta que cierres esta pestaña.', 'error');
            }}
          />
          <PantallasDelMenu alFallar={() => avisar('No se pudo guardar. Vale hasta que cierres esta pestaña.', 'error')} />
        </Seccion>

      </Panel>

      <Panel id="pantallas" actual={seccion}>
        <Subpestanas actual={pantalla} alElegir={elegirPantalla} />

        <Subpanel id="hoy" actual={pantalla} vista={<VistaPrevia><HoyEnMiniatura mio={mio} vista={ajustes.vistas.hoy} /></VistaPrevia>}>
          <Vista clave="hoy" ajustes={ajustes} avisar={avisar} />
          <AjustesDeHoy />
          <section className="subpanel__grupo" aria-labelledby="materias-en-hoy">
            <h3 id="materias-en-hoy" className="ajustes__leyenda" tabIndex={-1}>Materias en Hoy, el Calendario y la campana</h3>
            <p className="ajustes__ayuda">Apagá las que no querés ver ahí, como una que ya aprobaste. En el campus seguís inscripto.</p>
            <MateriasEnHoy />
          </section>
          <p className="ajustes__ayuda">Se guarda con tus datos, como tus notas.</p>
        </Subpanel>

        <Subpanel
          id="materias"
          actual={pantalla}
          vista={
            <VistaPrevia>
              <MateriasEnMiniatura vista={ajustes.vistas.materias} tarjeta={ajustes.tarjeta} materias={materias.datos?.enCurso} />
              <MateriaEnMiniatura vista={ajustes.vistas.materia} contenido={ajustes.contenido} />
            </VistaPrevia>
          }
        >
          <Vista clave="materias" ajustes={ajustes} avisar={avisar} />
          <div id="tarjetas" tabIndex={-1}>
            <Elecciones titulo="Tarjetas" ayuda="Para una sola, elegí otra en sus tres puntos." nombre="tarjeta" opciones={TARJETAS} valor={ajustes.tarjeta} alElegir={(tarjeta) => poner({ tarjeta })} />
          </div>
          <Vista clave="materia" ajustes={ajustes} avisar={avisar} />
          <Elecciones titulo="Contenido de cada materia" nombre="contenido" opciones={CONTENIDOS_DE_MATERIA} valor={ajustes.contenido} alElegir={(contenido) => poner({ contenido })} />
          <Interruptor
            id="marcar-vistos"
            nombre="Marcar lo que ya viste"
            ayuda="Un botón en cada archivo para marcarlo como visto, el filtro «Sin ver» y cuánto viste de cada materia."
            prendido={marcarVistos}
            alCambiar={(vistos) => poner({ vistos })}
          />
        </Subpanel>

        <Subpanel id="calendario" actual={pantalla} vista={<VistaPrevia><Dibujo forma={ajustes.vistas.calendario} /></VistaPrevia>}>
          <Vista clave="calendario" ajustes={ajustes} avisar={avisar} />
          <div className="subpanel__grupo">
            <p className="ajustes__leyenda">Materias</p>
            <p className="ajustes__ayuda">Las mismas que en Hoy.</p>
            <button type="button" className="boton boton--secundario boton--chico" onClick={irAMateriasEnHoy}>Elegir materias</button>
          </div>
        </Subpanel>

        <Subpanel id="avisos" actual={pantalla} vista={<VistaPrevia titulo="Así se ve la campana"><AvisosEnMiniatura ocultos={mio.avisosOcultos} /></VistaPrevia>}>
          <QueAvisosVes alFallar={() => avisar('No se pudo guardar.', 'error')} />
          <p className="ajustes__ayuda">Vale también para Avisos de Hoy. Se guarda con tus datos, como tus notas.</p>
        </Subpanel>
      </Panel>

      <Panel id="laboratorio" actual={seccion}>
        <Seccion titulo="Editor">
          <Elecciones titulo="Letra del código" nombre="lab-letra" opciones={LETRAS_DEL_CODIGO} valor={ajustes.labLetra} alElegir={(labLetra) => poner({ labLetra })} />
          <TamanoDelCodigo valor={ajustes.labTamano} alCambiar={(labTamano) => poner({ labTamano })} />
          <MuestraDelEditor ajustes={ajustes} />
          <Interruptor id="lab-autocompletar" nombre="Autocompletar" ayuda="Sugiere nombres y funciones mientras escribís." prendido={ajustes.labAutocompletar} alCambiar={(labAutocompletar) => poner({ labAutocompletar })} />
          <Interruptor id="lab-numeros" nombre="Números de línea" prendido={ajustes.labNumeros} alCambiar={(labNumeros) => poner({ labNumeros })} />
          <Interruptor id="lab-linea-actual" nombre="Resaltar la línea actual" ayuda="La del cursor, con un fondo suave." prendido={ajustes.labLineaActual} alCambiar={(labLineaActual) => poner({ labLineaActual })} />
          <Interruptor id="lab-ajuste" nombre="Ajustar líneas largas" ayuda="Siguen abajo en vez de salirse del ancho." prendido={ajustes.labAjuste} alCambiar={(labAjuste) => poner({ labAjuste })} />
          <Interruptor id="lab-cerrar" nombre="Cerrar paréntesis y comillas" prendido={ajustes.labCerrar} alCambiar={(labCerrar) => poner({ labCerrar })} />
          <Elecciones titulo="Sangría" nombre="lab-sangria" opciones={SANGRIAS} valor={ajustes.labSangria} alElegir={(labSangria) => poner({ labSangria })} />
          <Interruptor id="lab-tab-c" nombre="Tab en C" ayuda="Cada nivel con un Tab en vez de espacios." prendido={ajustes.labTabEnC} alCambiar={(labTabEnC) => poner({ labTabEnC })} />
        </Seccion>

        <Seccion titulo="Coloración">
          <ColoresDelCodigo ajustes={ajustes} poner={poner} />
        </Seccion>

        <Seccion titulo="Errores">
          <Interruptor
            id="lab-errores"
            nombre="Errores en la línea"
            ayuda="Muestra cada error al final de su línea. En C, también los avisos. Se borra al editar la línea."
            prendido={ajustes.labErrores}
            alCambiar={(labErrores) => poner({ labErrores })}
          />
          <Interruptor
            id="lab-revisar"
            nombre="Revisar mientras escribís"
            ayuda="Al dejar de escribir, marca los errores sin correr el programa. Python revisa cuando ya cargó."
            prendido={ajustes.labRevisar}
            alCambiar={(labRevisar) => poner({ labRevisar })}
          />
        </Seccion>

        <Seccion titulo="Base de datos">
          <Elecciones titulo="Tablas" nombre="lab-base" opciones={BASES} valor={ajustes.labBase} alElegir={(labBase) => poner({ labBase })} />
        </Seccion>
      </Panel>

      <Panel id="teclado" actual={seccion}>
        <Seccion id="atajos" titulo="Atajos de teclado" bajada="Para moverte sin el mouse. Los de una tecla no andan mientras escribís en un campo.">
          <Atajos prendidos={ajustes.atajos} poner={poner} orden={ajustes.menu.orden} />
        </Seccion>
      </Panel>

      <Panel id="datos" actual={seccion}>
        {(google.disponible || instalable) && (
          <Seccion
            id={SECCION_DISPOSITIVOS}
            titulo="Tus dispositivos"
            bajada={google.disponible && <>Va por dispositivo. Prendelo <strong>en cada compu, celu o navegador</strong> donde entrás a Super CVG, con la misma cuenta de Google.</>}
          >
            <GuardarEnDrive />
            <EntrarConGoogle />
            <InstalarApp />
          </Seccion>
        )}

        {google.disponible && (
          <Seccion titulo="Classroom" bajada="Tus cursos de Classroom dentro de cada materia, solo para leer. La conexión queda en esta pestaña.">
            <TuClassroom />
          </Seccion>
        )}

        <Seccion titulo="Tus datos" bajada={google.disponible ? 'Tus notas, tareas, fechas y materias quedan en este navegador, y en tu Drive si lo prendiste arriba. El archivo que bajás no lleva los de tus materias.' : 'Tus notas, tareas, fechas y materias quedan solo en este navegador. El archivo que bajás no lleva los de tus materias. Para eso, compartí cada materia.'}>
          <TusDatos />
        </Seccion>

        <Seccion titulo="Empezar de nuevo" bajada="Solo lo visual. Tus datos no se tocan.">
          <div className="ajustes__botones">
            <button type="button" className="boton boton--secundario" onClick={volverTodo}>Volver todo a como venía</button>
          </div>
        </Seccion>
      </Panel>
    </div>
  );
}
