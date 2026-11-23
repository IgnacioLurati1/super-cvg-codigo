import { useId, useState } from 'react';
import { ErrorConReintento } from '../Filas';
import { cambiarAjustes, useAjustes } from '../../lib/ajustes';
import { useUI } from '../ui';
import { MOTIVOS } from '../../lib/consultron/compu';
import { borrar, cancelarDescarga, cargaAlAbrir, cargar, ponerCargaAlAbrir, TOTAL_MB } from '../../lib/consultron/motor';
import { nubeEnElLugar, permisosDelLugar, permitirNube, POR_DIA, quedanHoy, usePermisosNube } from '../../lib/consultron/nube';

// How the model is, the same in the big screen and in the corner: whether this computer can, the download, the
// loading, and the settings of this computer.

export const gb = (mb) => (mb / 1000).toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const minutos = (s) => (s < 90 ? 'Falta un minuto.' : `Faltan unos ${Math.round(s / 60)} minutos.`);

/** What a screen reader hears when Consultron changes: what is above it changes whole. Always there, so it's heard. */
export function Anuncio({ estado }) {
  const texto = { bajando: 'Bajando Consultron.', preparando: 'Preparando Consultron.', listo: 'Consultron está listo.', borrando: 'Borrando Consultron.' }[estado.fase] ?? '';
  return <p className="solo-lectores" role="status">{texto}</p>;
}

/** Before the first question: whether this computer can, the download and the loading. `nivel`: of its heading.
 * `lugar`: { enResumen }, where Gemini may answer (nube.js). With its permission on, Gemini answers already and this
 * is short; off, beside the model, the offer to turn it on. */
export function Arranque({ estado, nivel = 2, lugar = {}, sinCerrar = false }) {
  const { confirmar } = useUI();
  const permisos = usePermisosNube();
  const conGemini = nubeEnElLugar(permisos, lugar);
  const { avisoBajarConsultron } = useAjustes();
  const Titulo = `h${nivel}`;
  const bajar = async () => {
    const seguir = await confirmar({ titulo: `¿Bajar ${gb(TOTAL_MB)} GB?`, texto: 'Conviene estar con wifi. Si se corta, sigue desde donde quedó.', boton: 'Bajar' });
    if (seguir) cargar();
  };
  // «Usar Gemini» off: its offer beside the model. Before downloading anything, first: it's the better one, and at once.
  const conOfertas = (modelo, { primero = false } = {}) => {
    if (permisos.todo) return modelo;
    const oferta = <OfertaNube key="todo" cual="todo" />;
    return <div className="consultron__opciones">{primero ? [oferta, modelo] : [modelo, oferta]}</div>;
  };
  if (estado.fase === 'quieto' || estado.fase === 'revisando') return <p className="consultron__estado">Revisando tu compu…</p>;
  // This computer (or a phone) can't: Gemini answers. Nothing to show: without «Usar Gemini», the first question asks
  // for it (Charla.jsx, Ignacio 22/11/2026).
  if (estado.fase === 'no-puede') return null;
  // In the browser and not loading: with «Usar Gemini» it loads only when Gemini fails.
  if (estado.fase === 'bajado' && permisos.todo) return null;
  if (estado.fase === 'falla') return conOfertas(<ErrorConReintento key="modelo" texto={estado.error} recargar={cargar} />);
  // «bajado»: it was already in the browser and it's about to load by itself.
  if (estado.fase === 'bajando' || estado.fase === 'preparando' || estado.fase === 'bajado') {
    const bajando = estado.fase === 'bajando';
    return conOfertas(
      <section key="modelo" className="consultron__arranque" aria-labelledby="consultron-arranque">
        <Titulo id="consultron-arranque">{bajando ? 'Bajando Consultron' : 'Preparando Consultron'}</Titulo>
        {bajando && <p>{[`Van ${gb(estado.mb)} de ${gb(TOTAL_MB)} GB.`, Number.isFinite(estado.faltan) && minutos(estado.faltan)].filter(Boolean).join(' ')}</p>}
        <progress className="consultron__barra" max="1" value={bajando ? estado.mb / TOTAL_MB : estado.fraccion} aria-label={bajando ? 'Cuánto bajó' : 'Avance'} />
        {bajando && (
          <div className="consultron__fila">
            <p className="consultron__nota">Podés usar el resto del sitio mientras baja.</p>
            <button type="button" className="boton boton--secundario boton--chico" onClick={cancelarDescarga}>Cancelar</button>
          </div>
        )}
      </section>
    );
  }
  if (estado.fase === 'borrando') return <p className="consultron__estado">Borrando Consultron…</p>;
  // sin-bajar. Gemini answers already: the model, for what Gemini doesn't take.
  if (conGemini) {
    if (!avisoBajarConsultron) return null;
    const sobre = permisosDelLugar(lugar).filter((c) => permisos[c] && SOBRE[c]).map((c) => SOBRE[c]).join(' y ');
    return (
      <section className="consultron__arranque consultron__arranque--corto" aria-label="Consultron en tu compu">
        <p>{permisos.todo || lugar.enResumen ? 'Contesta Gemini. Si no puede, contesta Consultron en tu compu, si lo bajás.' : `Gemini contesta sobre ${sobre}. Para lo demás, bajá Consultron.`}</p>
        <div className="consultron__fila">
          <button type="button" className="boton boton--secundario boton--chico" onClick={bajar}>Bajar Consultron</button>
          {/* In «Ajustes» its own X closes the window: a second «Cerrar» would be a different one. */}
          {!sinCerrar && <button type="button" className="boton boton--secundario boton--chico" onClick={() => cambiarAjustes({ avisoBajarConsultron: false })}>Cerrar</button>}
        </div>
      </section>
    );
  }
  return conOfertas(
    <section key="modelo" className="consultron__arranque" aria-labelledby="consultron-arranque">
      <Titulo id="consultron-arranque">Bajá Consultron</Titulo>
      <p>Responde con tus apuntes y te muestra de dónde sale cada cosa. Arma las cuentas en las calculadoras.</p>
      <p>La primera vez baja {gb(TOTAL_MB)} GB. Después arranca en unos segundos.</p>
      <button type="button" className="boton" onClick={bajar}>Bajar Consultron</button>
    </section>,
    { primero: true },
  );
}

const SOBRE = { resumenes: 'los resúmenes', carrera: 'tu carrera' };
const OFERTA = { todo: 'Gemini, de Google, contesta mejor que Consultron en tu compu.', resumenes: 'Gemini, de Google, contesta mejor sobre los resúmenes.', carrera: 'Gemini, de Google, contesta mejor sobre tu carrera.' };

// What goes to Google with each permission, in a line (the whole of it, in NUBE).
const VA = {
  todo: 'Tu pregunta, lo último que hablaron y lo que hace falta de tus apuntes, PDF, adjuntos, Classroom, fechas, carrera y la pantalla donde estás van a Google, que puede usarlos para mejorar sus productos. Si Gemini no puede, van a Groq.',
  resumenes: 'Tu pregunta y lo que hace falta del resumen van a Google, que puede usarlos para mejorar sus productos.',
  carrera: 'Tu pregunta y lo que hace falta de tu Sysacad (materias, notas y correlativas) van a Google, que puede usarlos para mejorar sus productos.',
};

/** Where Gemini could answer and its permission is off: one button turns it on, with what goes to Google beside it.
 * Nothing turns on by itself. */
export function OfertaNube({ cual }) {
  const id = useId();
  return (
    <section className="consultron__oferta" aria-labelledby={`${id}-titulo`}>
      <p id={`${id}-titulo`} className="consultron__oferta-titulo">{OFERTA[cual]}</p>
      <p id={`${id}-va`}>{VA[cual]} Tenés {POR_DIA} preguntas por día.</p>
      <button type="button" className="boton boton--chico" aria-describedby={`${id}-va`} onClick={() => permitirNube(cual, true)}>{NUBE[cual].nombre}</button>
    </section>
  );
}

/** On or off: loading the model as soon as Super CVG opens, on this computer (motor.js). */
function CargaAlAbrir() {
  const [prendido, setPrendido] = useState(cargaAlAbrir);
  const alCambiar = (e) => {
    setPrendido(e.target.checked);
    ponerCargaAlAbrir(e.target.checked);
  };
  return (
    <div className="consultron__al-abrir">
      <span className="consultron__al-abrir-texto">
        <label htmlFor="consultron-al-abrir" className="consultron__al-abrir-nombre">Cargarlo apenas abrís Super CVG</label>
        <span id="consultron-al-abrir-ayuda">Mientras Super CVG está abierto, ocupa unos 4 GB de la placa de video.</span>
      </span>
      <input id="consultron-al-abrir" className="interruptor" type="checkbox" role="switch" checked={prendido} aria-describedby="consultron-al-abrir-ayuda" onChange={alCambiar} />
    </div>
  );
}

// Each permission says what goes to Google before it turns on. Turning it off doesn't ask. `todo` is the one offered;
// the other two stay for whoever had them on.
const NUBE = {
  todo: {
    nombre: 'Usar Gemini',
    ayuda: 'Contesta Gemini, de Google.',
    titulo: '¿Usar Gemini?',
    texto: `Tu pregunta, lo último que hablaron y lo que hace falta de tus apuntes, PDF, adjuntos, Classroom, fechas, carrera y la pantalla donde estás van a Google. Google puede usarlos para mejorar sus productos. Si Gemini no puede, van a Groq. Tenés ${POR_DIA} preguntas por día.`,
  },
  resumenes: {
    nombre: 'Usar Gemini con los resúmenes',
    ayuda: 'Las preguntas sobre los resúmenes de El Santo Resumen las contesta Gemini, de Google.',
    titulo: '¿Usar Gemini con los resúmenes?',
    texto: `Tu pregunta y lo que hace falta del resumen van a Google. Google puede usarlos para mejorar sus productos. Los apuntes de tus materias no salen de la compu. Tenés ${POR_DIA} preguntas por día.`,
  },
  carrera: {
    nombre: 'Usar Gemini con tu carrera',
    ayuda: 'Las preguntas sobre tu carrera las contesta Gemini, de Google.',
    titulo: '¿Usar Gemini con tu carrera?',
    texto: `Tu pregunta y lo que hace falta de tu Sysacad (materias, notas y correlativas) van a Google. Google puede usarlos para mejorar sus productos. Tenés ${POR_DIA} preguntas por día entre los dos permisos.`,
  },
  // The Consultron of a live session (enVivo/herramientas/Consultron.jsx), chosen there.
  mesa: {
    titulo: '¿Que conteste Gemini en la sesión?',
    texto: `Tu pregunta y lo que hace falta de la mesa van a Google, aunque lo haya puesto otro. Google puede usarlos para mejorar sus productos. Usa tus ${POR_DIA} preguntas del día.`,
  },
};

/** Turns a permission on, once the student read what goes to Google, or off without asking. `confirmar`: useUI's.
 * Resolves with whether it changed. */
export async function cambiarNube(confirmar, cual, si, { sinModelo = false } = {}) {
  const p = NUBE[cual];
  const texto = sinModelo ? p.texto : `${p.texto} Después contesta Consultron en tu compu.`;
  if (si && !(await confirmar({ titulo: p.titulo, texto, boton: 'Usar Gemini' }))) return false;
  permitirNube(cual, si);
  // «Usar Gemini» is the only switch: off, the older permissions go too.
  if (cual === 'todo' && !si) {
    permitirNube('resumenes', false);
    permitirNube('carrera', false);
  }
  return true;
}

function PermisoNube({ cual, prendido, sinModelo }) {
  const { confirmar } = useUI();
  const p = NUBE[cual];
  const alCambiar = (e) => cambiarNube(confirmar, cual, e.target.checked, { sinModelo });
  return (
    <div className="consultron__al-abrir">
      <span className="consultron__al-abrir-texto">
        <label htmlFor={`consultron-gemini-${cual}`} className="consultron__al-abrir-nombre">{p.nombre}</label>
        <span id={`consultron-gemini-${cual}-ayuda`}>{p.ayuda}</span>
      </span>
      <input id={`consultron-gemini-${cual}`} className="interruptor" type="checkbox" role="switch" checked={prendido} aria-describedby={`consultron-gemini-${cual}-ayuda`} onChange={alCambiar} />
    </div>
  );
}

/** `sinModelo`: on a computer that can't run Consultron, where only Gemini answers. */
function PermisosNube({ sinModelo = false }) {
  const permisos = usePermisosNube();
  const quedan = quedanHoy(permisos);
  return (
    <>
      <PermisoNube cual="todo" prendido={Boolean(permisos.todo)} sinModelo={sinModelo} />
      {/* Always in the page, so screen readers announce the count when it appears. */}
      <p className="consultron__nota" role="status">
        {(permisos.todo || permisos.resumenes || permisos.carrera) && quedan !== null
          && (quedan ? `Te ${quedan === 1 ? 'queda 1 pregunta' : `quedan ${quedan} preguntas`} con Gemini hoy.` : `Por hoy no te quedan preguntas con Gemini.${sinModelo ? '' : ' Contesta Consultron en tu compu.'}`)}
      </p>
    </>
  );
}

/** The settings of this computer: in Consultron's window of settings. `nivel`: of its heading. */
export function Pie({ ocupado, sinModelo = false, nivel = 2 }) {
  const { confirmar } = useUI();
  const { todo } = usePermisosNube();
  const Titulo = `h${nivel}`;
  const sacar = async () => {
    const seguro = await confirmar({ titulo: '¿Borrar Consultron de esta compu?', texto: `Libera ${gb(TOTAL_MB)} GB. Para usarlo otra vez, lo bajás de nuevo.`, boton: 'Borrar', peligro: true });
    if (seguro) borrar();
  };
  return (
    <section className="consultron__pie" aria-labelledby="consultron-pie">
      <Titulo id="consultron-pie">En esta compu</Titulo>
      {/* With «Usar Gemini» it loads only when Gemini fails: nothing to choose. */}
      {!todo && !sinModelo && <CargaAlAbrir />}
      <PermisosNube sinModelo={sinModelo} />
      {!sinModelo && <button type="button" className="boton boton--secundario boton--chico" disabled={ocupado} onClick={sacar}>Borrar Consultron de esta compu</button>}
    </section>
  );
}
