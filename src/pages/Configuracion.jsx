import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AjustesDeHoy, MateriasEnHoy } from '../components/AjustesDeHoy';
import BrilloPdf from '../components/BrilloPdf';
import Campo from '../components/Campo';
import { BotonConectar } from '../components/Classroom';
import GuardarEnDrive from '../components/GuardarEnDrive';
import EntrarConGoogle from '../components/EntrarConGoogle';
import { Cargando, ErrorConReintento } from '../components/Filas';
import { EstadoDescargas, SeccionesQueBaja } from '../components/DescargasInteligentes';
import PasosDeIos from '../components/PasosDeIos';
import { useUI } from '../components/ui';
import { COLORES_DEL_CODIGO, CONTRASTE_MINIMO, contraste, LAB_TAMANO, LETRAS_DE_CODIGO, SIEMPRE_OSCUROS, cambiarAjustes, cambiarLuz, cambiarSegunLaHora, cambioDeBordes, cambioDeEstilo, disenoQueSeVe, editarDiseno, horasDeLaNoche, colorActual, cuestaLeerSobre, elegirVista, ponerEstiloDeMenu, useAjustes, volverAjustesOriginales } from '../lib/ajustes';
import { DESENFOQUE_DEL_FONDO, INTENSIDAD_DEL_FILTRO, TONO_DEL_FILTRO, movimientoDe, ponerAlineacionDelMenu, ponerAnchoDelMenu, ponerPosicionDelMenu } from '../lib/ajustes';
import PantallasDelMenu from '../components/PantallasDelMenu';
import QueAvisosVes from '../components/QueAvisosVes';
import { AvisosEnMiniatura, HoyEnMiniatura, MateriaEnMiniatura, MateriasEnMiniatura, VistaPrevia } from '../components/VistaPrevia';
import { IconoMenu } from '../layouts/Menu';
import BuscarAjuste from '../components/BuscarAjuste';
import MuestraMenu from '../components/MuestraMenu';
import { useAhorro } from '../lib/ahorro';
import { guardarArchivo } from '../lib/archivos';
import { atajosDelSitio } from '../lib/atajos';
import { ATAJOS_DEL_LECTOR } from '../components/lector/atajos';
import { olvidarSacadas } from '../lib/campana';
import { alumnoListo, cargarMaterias, cargarPerfil } from '../lib/campus';
import { codigoDeEstilo, leerCodigoDeEstilo, MAX_ESCRITO } from '../lib/codigoDeEstilo';
import { COLORES } from '../lib/colores';
import { vaciarBodega } from '../lib/bodega';
import { olvidarClassroom } from '../lib/classroom';
import { disponibleGoogle, soltarGoogle, useGoogle } from '../lib/google';
import { instalar, useInstalar } from '../lib/instalar';
import { borrarMio, cambiarMio, exportarMio, importarMio, useMio, usuarioActual } from '../lib/mio';
import { borrarCopiaDrive, hayCopiaDrive, olvidarDrive, useDrive } from '../lib/sincro';
import { estadoCalendario, olvidarCalendario } from '../lib/calendarioSincro';
import { tituloDe, useSeo } from '../lib/seo';
import { useConsulta } from '../lib/useConsulta';
import { useMarcarVistos } from '../lib/vistos';
import { useDisenoEnPrueba } from '../lib/enPrueba';
import '../styles/codigo.css';
import './configuracion.css';
import './materias.css';
import '../components/consultron/consultron.css';
import { ESTILOS_DE_TARJETA, NOMBRES_DE_TARJETA } from '../lib/tarjetas';
import { sinAceleracion } from '../lib/aceleracion';

const SECCION_DISPOSITIVOS = 'tus-dispositivos';
const SECCION_AHORRO = 'ahorro-de-datos';
const SECCION_DESCARGAS = 'descargas-inteligentes';

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
const NOMBRES_DE_SECCIONES = Object.fromEntries(SECCIONES.map((s) => [s.id, s.nombre]));
// Pantallas goes by screen too, each with its preview: #hoy, #materias, #calendario, #avisos, and what is inside one.
const PANTALLAS_DE_AJUSTES = [
  { id: 'hoy', nombre: 'Hoy' },
  { id: 'materias', nombre: 'Materias' },
  { id: 'calendario', nombre: 'Calendario' },
  { id: 'avisos', nombre: 'Avisos' },
];
const NOMBRES_DE_PANTALLAS = Object.fromEntries(PANTALLAS_DE_AJUSTES.map((p) => [p.id, p.nombre]));
const PANTALLA_DE_ANCLA = { 'materias-en-hoy': 'hoy', tarjetas: 'materias' };
const pantallaDe = (hash) => {
  const id = hash.replace(/^#/, '');
  return PANTALLAS_DE_AJUSTES.some((p) => p.id === id) ? id : (PANTALLA_DE_ANCLA[id] ?? PANTALLAS_DE_AJUSTES[0].id);
};
const DENTRO_DE = {
  atajos: 'teclado',
  'sin-mouse': 'teclado',
  [SECCION_DISPOSITIVOS]: 'datos',
  [SECCION_AHORRO]: 'datos',
  [SECCION_DESCARGAS]: 'datos',
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
  { valor: 'plano', nombre: 'Plano', texto: 'Un plano de ingeniería, con cuadrícula.', dibujo: <span className="dibujo-tema" data-cual="plano" aria-hidden="true" /> },
  { valor: 'pizarron', nombre: 'Pizarrón', texto: 'El del aula, de tiza en oscuro y de fibrón en claro.', dibujo: <span className="dibujo-tema" data-cual="pizarron" aria-hidden="true" /> },
];

// The data saver (ahorro.js), on this device.
const MODOS_DE_AHORRO = [
  { valor: 'auto', nombre: 'Automático', texto: 'Con el ahorro de datos del celu o una conexión lenta.' },
  { valor: 'siempre', nombre: 'Siempre' },
  { valor: 'nunca', nombre: 'Nunca' },
];

// The themes that are a palette: they apply to every style, also the always-dark ones.
const PALETAS_DEL_TEMA = ['rosa', 'bosque', 'cafe', 'lavanda', 'infierno', 'glaciar', 'cosmico'];

const TEMAS = [
  { valor: 'claro', nombre: 'Claro', dibujo: <span className="dibujo-tema" data-cual="claro" aria-hidden="true" /> },
  { valor: 'oscuro', nombre: 'Oscuro', dibujo: <span className="dibujo-tema" data-cual="oscuro" aria-hidden="true" /> },
  { valor: 'rosa', nombre: 'Rosa oscuro', dibujo: <span className="dibujo-tema" data-cual="rosa" aria-hidden="true" /> },
  { valor: 'bosque', nombre: 'Verde bosque', dibujo: <span className="dibujo-tema" data-cual="bosque" aria-hidden="true" /> },
  { valor: 'cafe', nombre: 'Café', dibujo: <span className="dibujo-tema" data-cual="cafe" aria-hidden="true" /> },
  { valor: 'lavanda', nombre: 'Lavanda', dibujo: <span className="dibujo-tema" data-cual="lavanda" aria-hidden="true" /> },
  { valor: 'infierno', nombre: 'Infierno', dibujo: <span className="dibujo-tema" data-cual="infierno" aria-hidden="true" /> },
  { valor: 'glaciar', nombre: 'Glaciar', dibujo: <span className="dibujo-tema" data-cual="glaciar" aria-hidden="true" /> },
  { valor: 'cosmico', nombre: 'Violeta cósmico', dibujo: <span className="dibujo-tema" data-cual="cosmico" aria-hidden="true" /> },
];

// What the strong version of each theme puts behind the page (styles/potentes.css). With «Seguir a tu dispositivo», the
// one of the theme the device shows.
const POTENTES = {
  claro: 'Un cielo de día, con nubes.',
  oscuro: 'La noche, con la luna y estrellas.',
  rosa: 'Pétalos de cerezo al atardecer.',
  bosque: 'El bosque de noche, con luciérnagas.',
  cafe: 'La luz de una lámpara y las marcas de la taza.',
  lavanda: 'Un cielo lila sobre un campo de lavanda.',
  lavandaNoche: 'El campo de lavanda de noche, bajo la luna.',
  infierno: 'Brasas y chispas.',
  glaciar: 'Aurora boreal y nieve.',
  cosmico: 'El espacio, con estrellas y nebulosas.',
};
// How elaborate the strong version's sky is (lib/fondo): the CSS one, painted, painted with everything, or alive too.
const CALIDADES = [
  { valor: 'baja', nombre: 'Baja', texto: 'La más liviana.' },
  { valor: 'media', nombre: 'Media', texto: 'Un fondo pintado, con mucho más detalle.' },
  { valor: 'alta', nombre: 'Alta', texto: 'Todavía más detalle. Tarda un poco más en aparecer.' },
  { valor: 'ultra', nombre: 'Ultra', texto: 'Con «Movimiento del fondo», el cielo cobra vida. Gasta más batería.' },
];
// The background's filters, with or without the strong version (FILTROS_DEL_FONDO in lib/ajustes.js).
const FILTROS = [
  { valor: 'ninguno', nombre: 'Ninguno' },
  { valor: 'grises', nombre: 'Blanco y negro' },
  { valor: 'sepia', nombre: 'Sepia', texto: 'El tono cálido de una foto vieja.' },
  { valor: 'vivo', nombre: 'Más vivo', texto: 'Colores más fuertes.' },
  { valor: 'suave', nombre: 'Suave', texto: 'Colores apagados, con menos contraste.' },
];
// What moves in each one with «Movimiento del fondo» (lib/fondo/particulas.js).
const SE_MUEVE = {
  claro: 'Las nubes pasan despacio.',
  oscuro: 'Las estrellas titilan y cada tanto pasa una fugaz.',
  rosa: 'Caen pétalos de cerezo.',
  bosque: 'Las luciérnagas vuelan y se prenden.',
  cafe: 'Flota polvo en la luz de la lámpara.',
  lavanda: 'Vuelan pétalos de lavanda.',
  lavandaNoche: 'Luciérnagas sobre la lavanda.',
  infierno: 'Suben brasas.',
  glaciar: 'Cae nieve.',
  cosmico: 'Las estrellas titilan y cada tanto pasa una fugaz.',
};

// The strong version without the graphics card (src/lib/aceleracion.js). Brave gets its own steps: it often keeps
// drawing in software after the switch, so it also says what's left.
function AvisoSinAceleracion() {
  const brave = Boolean(globalThis.navigator?.brave);
  return (
    <p className="ajustes__alerta" role="status">
      {brave ? 'Brave' : 'Tu navegador'} no está usando la placa de video. La versión potente puede andar lenta.{' '}
      {brave ? (
        <>
          En <code>brave://settings/system</code>, prendé «Usar la aceleración de gráficos cuando esté disponible» y reiniciá Brave. Si sigue igual, probá con Chrome o Edge, o apagá la versión potente.
        </>
      ) : (
        'Prendé la aceleración de gráficos en su configuración y reiniciá el navegador.'
      )}
    </p>
  );
}

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

// The bar on top: where its screens go along it, and how wide it is.
const ALINEACIONES_DEL_MENU = [
  { valor: 'izquierda', nombre: 'A la izquierda', texto: 'Al lado de Super CVG.' },
  { valor: 'medio', nombre: 'Al medio' },
  { valor: 'derecha', nombre: 'A la derecha' },
];
const ANCHOS_DEL_MENU = [
  { valor: 'pagina', nombre: 'Como la página' },
  { valor: 'pantalla', nombre: 'Toda la pantalla', texto: 'Entran más pantallas antes de que se pliegue.' },
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

const COLORES_CABECERA = [
  { valor: '#121417', nombre: 'Negro' },
  { valor: '#ffffff', nombre: 'Blanco' },
  { valor: '#17324d', nombre: 'Tinta' },
  { valor: '#0b5a9e', nombre: 'Azul' },
  { valor: '#8a1f3d', nombre: 'Bordó' },
  { valor: '#5b3a9d', nombre: 'Violeta' },
];

// The theme's color with the strong version: mid tones, a glow on the dark themes and a fade that reads on the light ones.
const COLORES_DEL_TEMA = [
  { valor: '#8b5cf6', nombre: 'Violeta' },
  { valor: '#ec4899', nombre: 'Rosa' },
  { valor: '#0ea5e9', nombre: 'Celeste' },
  { valor: '#10b981', nombre: 'Verde' },
  { valor: '#f59e0b', nombre: 'Ámbar' },
  { valor: '#ef4444', nombre: 'Rojo' },
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

/** A page of a PDF as the reader shows it: the same filters (pages/ajustes.css), by the same marks on the root, so it
 * follows the color, «Como el tema» and the slider as they change. */
function MuestraPdf() {
  return (
    <div className="muestra-pdf" aria-hidden="true">
      <div className="muestra-pdf__hoja">
        <p className="muestra-pdf__titulo">Unidad 3: Colas de espera</p>
        <p>
          Un sistema M/M/1 tiene <span className="muestra-pdf__marca">un solo servidor</span> y llegadas que siguen una
          distribución de Poisson. Con una tasa de llegada <em>λ</em> y de servicio <em>μ</em>, la utilización es{' '}
          <span className="muestra-pdf__marca muestra-pdf__marca--celeste">ρ = λ / μ</span>.
        </p>
        <svg className="muestra-pdf__grafico" viewBox="0 0 200 70">
          <path className="muestra-pdf__ejes" d="M10 5v58h185" />
          <path className="muestra-pdf__curva" d="M12 60C70 58 120 50 150 30S180 8 190 6" />
          <path className="muestra-pdf__curva muestra-pdf__curva--roja" d="M12 50L190 50" />
        </svg>
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

// «Según la hora» (ajustes.js): a design for the day and one for the night. What changes on this screen goes into the
// one chosen here; leaving the screen, the hour's shows again.
const HORA_ENTERA = /^\d\d:\d\d$/;
function SegunLaHora({ segun }) {
  const [editando, setEditando] = useState(null);
  useEffect(() => () => editarDiseno(null), []);
  const elegir = (periodo) => {
    setEditando(periodo);
    editarDiseno(periodo);
  };
  const prender = (si) => {
    setEditando(null);
    editarDiseno(null);
    cambiarSegunLaHora(si);
  };
  // Half typed, the field says nothing yet: nothing changes until it is a whole hour.
  const hora = (desde, hasta) => HORA_ENTERA.test(desde) && HORA_ENTERA.test(hasta) && horasDeLaNoche(desde, hasta);
  return (
    <>
      <Interruptor id="segun-la-hora" nombre="Según la hora" ayuda="Un diseño de día y otro de noche." prendido={Boolean(segun)} alCambiar={prender} />
      {segun && (
        <>
          <div className="ajustes__horas">
            <label className="campo">
              <span className="campo__etiqueta">La noche empieza</span>
              <input className="campo__control" type="time" step={300} value={segun.desde} onChange={(e) => hora(e.target.value, segun.hasta)} />
            </label>
            <label className="campo">
              <span className="campo__etiqueta">La noche termina</span>
              <input className="campo__control" type="time" step={300} value={segun.hasta} onChange={(e) => hora(segun.desde, e.target.value)} />
            </label>
          </div>
          {segun.desde === segun.hasta && <p className="ajustes__ayuda" role="status">Con las dos horas iguales, no hay noche.</p>}
          <Elecciones
            titulo="Estás cambiando el de"
            ayuda="Lo que cambies en esta pantalla queda en ese."
            nombre="segun-la-hora-cual"
            opciones={[{ valor: 'dia', nombre: 'Día' }, { valor: 'noche', nombre: 'Noche' }]}
            valor={editando ?? disenoQueSeVe()}
            alElegir={elegir}
          />
        </>
      )}
    </>
  );
}

function Elecciones({ titulo, ayuda, ayudaViva = false, nombre, opciones, valor, alElegir, parejas, apagado = false, pie = null }) {
  const id = useId();
  return (
    <fieldset className="ajustes__grupo" aria-describedby={ayuda ? id : undefined} disabled={apagado}>
      <legend className="ajustes__leyenda">{titulo}</legend>
      {ayuda && <p id={id} className="ajustes__ayuda" aria-live={ayudaViva ? 'polite' : undefined}>{ayuda}</p>}
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
      {pie}
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
      {alerta && propio && cuestaLeerSobre(propio) && <p className="ajustes__alerta" role="status">{alerta}</p>}
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
            maxLength={MAX_ESCRITO}
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
  const perfil = useConsulta(cargarPerfil, [], { alInstante: true });
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
  if (google.conectado || google.sinRed) {
    let estado = 'Conectado.';
    if (!google.conectado) estado = 'Sin internet. Se conecta de nuevo cuando vuelva.';
    else if (google.email) estado = <>Conectado como <strong>{google.email}</strong>.</>;
    return (
      <div className="ajustes__botones">
        <p className="ajustes__estado">{estado}</p>
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
      {como === 'ios' && <PasosDeIos />}
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

/** A slider of the background's filters: how strong the filter is, the tone or the blur. */
function BarraDelFiltro({ nombre, valor, min, max, paso, unidad, ayuda, apagado = false, alCambiar }) {
  const id = useId();
  return (
    <div className="brillo-pdf brillo-pdf--ancho" data-apagado={apagado || undefined}>
      <div className="brillo-pdf__cabeza">
        <label htmlFor={id} className="brillo-pdf__nombre">{nombre}</label>
        <output htmlFor={id} className="brillo-pdf__valor" aria-hidden="true">{valor}{unidad}</output>
      </div>
      <input
        id={id}
        className="brillo-pdf__control"
        type="range"
        min={min}
        max={max}
        step={paso}
        value={valor}
        aria-valuetext={`${valor}${unidad === '°' ? ' grados' : ' por ciento'}`}
        aria-describedby={ayuda ? `${id}-ayuda` : undefined}
        disabled={apagado}
        onChange={(e) => alCambiar(Number(e.target.value))}
      />
      {ayuda && <p id={`${id}-ayuda`} className="brillo-pdf__ayuda">{ayuda}</p>}
    </div>
  );
}

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
const ATRIBUTOS_DEL_TEMA = ['data-tema', 'data-paleta', 'data-estilo', 'data-contraste', 'data-luz'];
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
function Interruptor({ id, nombre, ayuda, prendido, alCambiar, marca }) {
  return (
    <div className="ajuste-si">
      <span className="ajuste-si__texto">
        <span className="ajuste-si__linea">
          <label htmlFor={id} className="ajuste-si__nombre">{nombre}</label>
          {marca && <span className="ajuste-si__marca">{marca}</span>}
        </span>
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

// While a design from Diseños is tried, every option is greyed out: what shows is the design, and a change would be
// saved under it without being seen. A fieldset turns off every control inside at once.
function Panel({ id, actual, bloqueado = false, children }) {
  return (
    <fieldset className="ajustes__panel" role="tabpanel" id={`ajustes-${id}`} aria-labelledby={`pestana-${id}`} hidden={actual !== id} disabled={bloqueado}>
      {children}
    </fieldset>
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
  const enPrueba = useDisenoEnPrueba();
  const drive = useDrive();
  const google = useGoogle();
  const instalable = useInstalar() !== null;
  const ahorrando = useAhorro();
  const marcarVistos = useMarcarVistos();
  const siempreOscuro = SIEMPRE_OSCUROS.includes(ajustes.estilo);
  // The styles that paint the theme's color (estilos.css): the rest don't show it.
  const conBrillo = ['profesional', 'batman'].includes(ajustes.estilo);
  // Batman's yellow beam takes the highlighter's color (animaciones.css): while it's on, that color says so.
  const conFogonazo = ajustes.estilo === 'batman' && ajustes.fogonazo;
  // With «Seguir a tu dispositivo», the theme the device shows now (public/ajustes.js marks it).
  const temaVisible = typeof document === 'undefined' ? 'claro' : document.documentElement.getAttribute('data-tema') === 'oscuro' ? 'oscuro' : 'claro';
  // Batman is always dark: Claro shows the night sky, and Lavanda its field at night (potentes.css).
  const temaPotente = siempreOscuro && ajustes.tema === 'lavanda' ? 'lavandaNoche' : siempreOscuro && ['claro', 'sistema'].includes(ajustes.tema) ? 'oscuro' : ajustes.tema === 'sistema' ? temaVisible : ajustes.tema;
  // With «Movimiento» following the device, the device can ask for less motion: the background stays still then.
  const dispositivoQuieto = typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
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
    await alumnoListo();
    return cargarMaterias();
  }, [seccion === 'pantallas'], { alInstante: true });
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

  // From the search: its tab and its screen of Pantallas, without moving the page (the search brings it into view).
  const raiz = useRef(null);
  const irAlAjuste = ({ seccion: otra, pantalla: suya }) => {
    if (otra !== seccion) setSeccion(otra);
    if (suya && suya !== pantalla) setPantalla(suya);
    window.history.replaceState(window.history.state, '', `#${suya ?? otra}`);
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
    <div ref={raiz} className="contenedor pagina ajustes">
      <div className="titular">
        <div>
          <h1>Configuración</h1>
          <p className="titular__fecha">Casi todo se guarda en este dispositivo.</p>
        </div>
      </div>

      <BuscarAjuste raiz={raiz} pestanas={NOMBRES_DE_SECCIONES} pantallas={NOMBRES_DE_PANTALLAS} alIr={irAlAjuste} />
      <Pestanas actual={seccion} alElegir={elegirSeccion} />
      {enPrueba && (
        <p className="ajustes__en-prueba">
          Estás probando <strong>{enPrueba.nombre}</strong>. Para cambiar algo, usalo o volvé al tuyo desde la barra de abajo.
        </p>
      )}

      <Panel bloqueado={Boolean(enPrueba)} id="como-se-ve" actual={seccion}>
        <Link className="ajustes__a-disenos" to="/disenos">
          <span className="ajustes__a-disenos-muestras" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span className="ajustes__a-disenos-texto">
            <strong>Diseños</strong>
            <span>Probá los estilos que publicaron otros alumnos o publicá el tuyo.</span>
          </span>
          <span className="boton ajustes__a-disenos-boton" aria-hidden="true">Ver diseños</span>
        </Link>

        <Seccion titulo="Estilo y tema">
          <Elecciones titulo="Estilo" ayuda="Nada se mueve de lugar." nombre="estilo" parejas="estilo" opciones={ESTILOS} valor={ajustes.estilo} alElegir={(estilo) => poner(cambioDeEstilo(ajustes, estilo))} />
          <Interruptor
            id="bordes"
            nombre="Bordes"
            ayuda="Cada bloque en su recuadro, con cualquier estilo."
            prendido={ajustes.bordes}
            alCambiar={(bordes) => poner(cambioDeBordes(bordes))}
          />
          {ajustes.estilo === 'batman' && (
            <Interruptor
              id="fogonazo"
              nombre="Fogonazo amarillo"
              ayuda="La luz de la señal cada vez que cambiás de pantalla."
              prendido={ajustes.fogonazo}
              alCambiar={(fogonazo) => poner({ fogonazo })}
            />
          )}
          <Elecciones
            titulo="Tema"
            ayuda={siempreOscuro ? `Con el estilo ${ESTILOS.find((e) => e.valor === ajustes.estilo).nombre}, siempre oscuro.` : undefined}
            nombre="tema"
            opciones={TEMAS}
            valor={siempreOscuro && ajustes.tema !== 'sistema' && !PALETAS_DEL_TEMA.includes(ajustes.tema) ? 'oscuro' : ajustes.tema}
            alElegir={(tema) => poner({ tema })}
            pie={(
              <button
                type="button"
                className="boton boton--secundario boton--chico ajustes__dispositivo"
                aria-pressed={ajustes.tema === 'sistema'}
                onClick={() => poner({ tema: ajustes.tema === 'sistema' ? document.documentElement.getAttribute('data-tema') || 'claro' : 'sistema' })}
              >
                Seguir a tu dispositivo
              </button>
            )}
          />
          <Interruptor
            id="potente"
            nombre="Versión potente"
            marca="Recomendado"
            ayuda={POTENTES[temaPotente]}
            prendido={ajustes.potente}
            alCambiar={(potente) => poner(potente ? { potente, fondoCalidad: 'media', fondoMueve: true } : { potente })}
          />
          {ajustes.potente && (
            <>
              {sinAceleracion() && <AvisoSinAceleracion />}
              <Interruptor
                id="fondo-mueve"
                nombre="Movimiento del fondo"
                ayuda={movimientoDe(ajustes) !== 'sistema' ? 'Queda quieto con «Reducir siempre» o «Sin animaciones».' : dispositivoQuieto ? 'Queda quieto. Tu dispositivo pide menos movimiento.' : SE_MUEVE[temaPotente]}
                prendido={ajustes.fondoMueve}
                alCambiar={(fondoMueve) => poner({ fondoMueve })}
              />
              <Elecciones titulo="Calidad del fondo" nombre="fondo-calidad" opciones={CALIDADES} valor={ajustes.fondoCalidad} alElegir={(fondoCalidad) => poner({ fondoCalidad })} />
              <ElegirColor
                clave="temaColor"
                titulo="Color del tema"
                ayuda={conBrillo ? 'Los bordes, el brillo de la cabecera y el fundido de los títulos.' : 'Los bordes, el brillo de la cabecera y el fundido de los títulos. Se ve con los estilos Profesional y Batman.'}
                otroColor="Otro color del tema"
                opciones={COLORES_DEL_TEMA}
                ajustes={ajustes}
                poner={poner}
                previa={<span className="ajustes__tema-muestra">Así queda</span>}
              />
            </>
          )}
          {/* The background's filters, with or without the strong version: three rows that go together. */}
          <Elecciones
            titulo="Filtro del fondo"
            nombre="fondo-filtro"
            opciones={FILTROS}
            valor={ajustes.fondoFiltro}
            alElegir={(fondoFiltro) => poner({ fondoFiltro })}
            pie={(
              // The slider comes with a filter: a screen reader hears it.
              <div className="ajustes__filtro-barra" aria-live="polite">
                {ajustes.fondoFiltro !== 'ninguno' && (
                  <BarraDelFiltro nombre="Intensidad" valor={ajustes.fondoIntensidad} {...INTENSIDAD_DEL_FILTRO} unidad="%" alCambiar={(fondoIntensidad) => poner({ fondoIntensidad })} />
                )}
              </div>
            )}
          />
          <BarraDelFiltro
            nombre="Tono del fondo"
            valor={ajustes.fondoTono}
            {...TONO_DEL_FILTRO}
            unidad="°"
            apagado={ajustes.fondoFiltro === 'grises'}
            ayuda={ajustes.fondoFiltro === 'grises' ? 'Con blanco y negro no cambia nada.' : 'Gira los colores del fondo.'}
            alCambiar={(fondoTono) => poner({ fondoTono })}
          />
          <BarraDelFiltro
            nombre="Desenfoque del fondo"
            valor={ajustes.fondoDesenfoque}
            {...DESENFOQUE_DEL_FONDO}
            unidad="%"
            ayuda="Gasta más batería."
            alCambiar={(fondoDesenfoque) => poner({ fondoDesenfoque })}
          />
          <SegunLaHora segun={ajustes.segunLaHora} />
        </Seccion>

        <Seccion titulo="Colores" bajada="Cambian en toda la página.">
          <ElegirColor
            clave="accion"
            titulo="Color principal"
            ayuda="Los botones."
            otroColor="Otro color principal"
            opciones={COLORES_ACCION}
            ajustes={ajustes}
            poner={poner}
            alerta="Con este color cuesta leer el texto de los botones. Probá uno más claro o más oscuro."
            previa={<span className="boton">Así queda</span>}
          />
          <ElegirColor
            clave="cabecera"
            titulo="Cabecera"
            ayuda="Sin elegir, va la del estilo."
            otroColor="Otro color de cabecera"
            opciones={COLORES_CABECERA}
            ajustes={ajustes}
            poner={poner}
            alerta="Con este color cuesta leer la cabecera. Probá uno más claro o más oscuro."
          />
          {ajustes.estilo === 'pizarron' && (
            <ElegirColor
              clave="bandeja"
              titulo="Borde de la cabecera"
              ayuda="Sin elegir, va el de madera."
              otroColor="Otro color de borde"
              opciones={COLORES_CABECERA}
              ajustes={ajustes}
              poner={poner}
            />
          )}
          <ElegirColor
            clave="resaltador"
            titulo={conFogonazo ? 'Resaltador y fogonazo' : 'Resaltador'}
            ayuda={conFogonazo ? 'Marca lo urgente, el día de hoy y la luz al cambiar de pantalla.' : 'Marca lo urgente y el día de hoy.'}
            otroColor="Otro color de resaltador"
            opciones={COLORES_RESALTADOR}
            ajustes={ajustes}
            poner={poner}
            alerta="Con este color cuesta leer lo resaltado. Probá uno más claro o más oscuro."
            previa={<span className="marcado">Así queda</span>}
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
            alCambiar={(luz) => { if (!cambiarLuz(luz)) avisar('No se pudo guardar. Vale hasta que cierres esta pestaña.', 'error'); }}
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

      <Panel bloqueado={Boolean(enPrueba)} id="pdf" actual={seccion}>
        <Seccion titulo="Lector de PDF">
          <div className="ajustes__pdf">
            <VistaPrevia>
              <MuestraPdf />
            </VistaPrevia>
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

      <Panel bloqueado={Boolean(enPrueba)} id="menu" actual={seccion}>
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
          {ajustes.menu.posicion === 'arriba' && (
            <>
              <Elecciones
                titulo="Alineación de la barra"
                nombre="menu-alineacion"
                opciones={ALINEACIONES_DEL_MENU}
                valor={ajustes.menu.alineacion}
                alElegir={(alineacion) => {
                  if (!ponerAlineacionDelMenu(alineacion)) avisar('No se pudo guardar. Vale hasta que cierres esta pestaña.', 'error');
                }}
              />
              <Elecciones
                titulo="Ancho de la barra"
                nombre="menu-ancho"
                opciones={ANCHOS_DEL_MENU}
                valor={ajustes.menu.ancho}
                alElegir={(ancho) => {
                  if (!ponerAnchoDelMenu(ancho)) avisar('No se pudo guardar. Vale hasta que cierres esta pestaña.', 'error');
                }}
              />
            </>
          )}
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

      <Panel bloqueado={Boolean(enPrueba)} id="pantallas" actual={seccion}>
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

      <Panel bloqueado={Boolean(enPrueba)} id="laboratorio" actual={seccion}>
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

      <Panel bloqueado={Boolean(enPrueba)} id="teclado" actual={seccion}>
        <Seccion id="sin-mouse" titulo="Sin mouse">
          <Interruptor
            id="modo-sin-mouse"
            nombre="Modo sin mouse"
            ayuda="Muestra botones para lo que se hace arrastrando, como subir y bajar secciones o cambiar el tamaño de Consultron. En un celular están siempre."
            prendido={ajustes.sinMouse}
            alCambiar={(sinMouse) => poner({ sinMouse })}
          />
        </Seccion>

        <Seccion id="atajos" titulo="Atajos de teclado" bajada="Para moverte sin el mouse. Los de una tecla no andan mientras escribís en un campo.">
          <Atajos prendidos={ajustes.atajos} poner={poner} orden={ajustes.menu.orden} />
        </Seccion>
      </Panel>

      <Panel bloqueado={Boolean(enPrueba)} id="datos" actual={seccion}>
        {(google.disponible || instalable) && (
          <Seccion
            id={SECCION_DISPOSITIVOS}
            titulo="Tus dispositivos"
            bajada={google.disponible && <>Va por dispositivo. Prendelo <strong>en cada compu, celu o navegador</strong> donde entrás a Super CVG, con la misma cuenta de Google.</>}
          >
            <GuardarEnDrive />
            {drive.prendido && (
              <Interruptor
                id="misma-en-todos"
                nombre="Misma configuración en todos tus dispositivos"
                ayuda="Apagado, este dispositivo tiene la suya. Lo que cambies acá no llega a los otros."
                prendido={ajustes.mismaEnTodos}
                alCambiar={(mismaEnTodos) => poner({ mismaEnTodos })}
              />
            )}
            <EntrarConGoogle />
            <InstalarApp />
          </Seccion>
        )}

        <Seccion id={SECCION_AHORRO} titulo="Ahorro de datos" bajada="Mientras está prendido, lo que no pediste espera a que lo abras. Las tarjetas de Resúmenes van sin foto.">
          <Elecciones
            titulo="Cuándo"
            ayuda={ajustes.ahorro === 'auto' ? (ahorrando ? 'Ahora está prendido.' : 'Ahora está apagado.') : undefined}
            ayudaViva
            nombre="ahorro"
            opciones={MODOS_DE_AHORRO}
            valor={ajustes.ahorro}
            alElegir={(ahorro) => poner({ ahorro })}
          />
        </Seccion>

        <Seccion id={SECCION_DESCARGAS} titulo="Descargas inteligentes">
          <Interruptor
            id="descargas"
            nombre="Bajar el material del día"
            marca="Recomendado"
            ayuda="Con Super CVG cerrado, baja por wifi el material de las materias que cursás ese día. De noche, las del día siguiente. Hasta 200 MB por día."
            prendido={ajustes.descargas}
            alCambiar={(descargas) => poner({ descargas })}
          />
          <EstadoDescargas prendido={ajustes.descargas} />
          {ajustes.descargas && <SeccionesQueBaja />}
        </Seccion>

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
