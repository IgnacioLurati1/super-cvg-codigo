import { useEffect, useId, useState, useSyncExternalStore } from 'react';
import { useUI } from '../ui';
import { listarCharlas } from '../../lib/consultron/charlas';
import { abrirCharla, borrarGuardada, charlaAbierta, escucharCharlas, leerVersionCharlas } from '../../lib/consultron/motor';
import { useMio, usuarioActual } from '../../lib/mio';

// The talks of before, kept in this browser (charlas.js): each with its first question and when, to open it again and
// go on, or to delete it. In the corner, the last few under the empty talk. In Consultron's screen (`lateral`), all of
// them in its side column, with the one on screen marked.

const CORTA = 4;

const dia = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short' });
const hora = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** When a talk was last touched, as a student says it: «hoy, 14:32», «ayer», «3 nov». */
export function cuando(ms, ahora = Date.now()) {
  const fecha = new Date(ms);
  const hoy = new Date(ahora);
  hoy.setHours(0, 0, 0, 0);
  const dias = Math.round((hoy - new Date(fecha).setHours(0, 0, 0, 0)) / 86_400_000);
  if (dias <= 0) return `hoy, ${hora.format(fecha)}`;
  if (dias === 1) return `ayer, ${hora.format(fecha)}`;
  const texto = dia.format(fecha).replace('.', '');
  return fecha.getFullYear() === new Date(ahora).getFullYear() ? texto : `${texto} de ${fecha.getFullYear()}`;
}

/** `lateral`: { titulo, alVaciar }, in the side column of Consultron's screen: every talk, labelled by the column's
 * title (its id), and `alVaciar()` takes the focus when the last one is deleted. */
export default function Charlas({ nivel = 2, ocupado = false, alAbrir, lateral = null }) {
  const version = useSyncExternalStore(escucharCharlas, leerVersionCharlas, leerVersionCharlas);
  // The student changes with the session: their talks, not another's.
  useMio();
  const alumno = usuarioActual();
  const [charlas, setCharlas] = useState({ de: null, lista: [] });
  const [todas, setTodas] = useState(false);
  const { confirmar } = useUI();
  const Titulo = `h${nivel}`;
  const idTitulo = useId();

  useEffect(() => {
    let vivo = true;
    listarCharlas(alumno)
      .then((lista) => {
        if (vivo) setCharlas({ de: alumno, lista });
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [alumno, version]);

  const lista = charlas.de === alumno ? charlas.lista : [];
  if (!lista.length) return null;
  const vistas = todas || lateral ? lista : lista.slice(0, CORTA);
  // Read as it's drawn: the talk on screen gets its id when it's first kept, and that redraws the list.
  const abierta = lateral ? charlaAbierta() : null;

  const abrir = async (id) => {
    if (await abrirCharla(id)) alAbrir?.();
  };
  const borrar = async (c) => {
    if (!(await confirmar({ titulo: '¿Borrar esta charla?', texto: `«${c.primera}»`, boton: 'Borrar', peligro: true }))) return;
    // The button that asked goes away with it: the focus goes to the next talk, or to the title.
    const caja = document.getElementById(lateral ? `${idTitulo}-lista` : idTitulo)?.closest(lateral ? '.charlas__lista' : '.charlas');
    const i = vistas.findIndex((x) => x.id === c.id);
    await borrarGuardada(c.id);
    requestAnimationFrame(() => {
      const quedan = [...(caja?.querySelectorAll('.charlas__abrir') ?? [])].filter((b) => b.isConnected);
      const destino = quedan[Math.min(i, quedan.length - 1)];
      if (destino) destino.focus();
      else if (lateral) lateral.alVaciar?.();
      else document.getElementById(idTitulo)?.focus();
    });
  };

  if (lateral) {
    return (
      <ul id={`${idTitulo}-lista`} className="charlas__lista charlas__lista--lateral" aria-labelledby={lateral.titulo}>
        {vistas.map((c) => (
          <li key={c.id} className="charlas__item">
            <button type="button" className="charlas__abrir" disabled={ocupado} aria-current={c.id === abierta ? 'true' : undefined} onClick={() => abrir(c.id)}>
              <span className="charlas__primera">{c.primera}</span>
              <span className="charlas__cuando">{cuando(c.cambiada)}</span>
            </button>
            <button type="button" className="charlas__borrar" aria-label={`Borrar la charla «${c.primera}»`} onClick={() => borrar(c)}>
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" /></svg>
            </button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <section className="charlas" aria-labelledby={idTitulo}>
      <Titulo id={idTitulo} className="charlas__titulo" tabIndex={-1}>Charlas anteriores</Titulo>
      <ul className="charlas__lista">
        {vistas.map((c) => (
          <li key={c.id} className="charlas__item">
            <button type="button" className="charlas__abrir" disabled={ocupado} onClick={() => abrir(c.id)}>
              <span className="charlas__primera">{c.primera}</span>
              <span className="charlas__cuando">{cuando(c.cambiada)}</span>
            </button>
            <button type="button" className="charlas__borrar" aria-label={`Borrar la charla «${c.primera}»`} onClick={() => borrar(c)}>
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" /></svg>
            </button>
          </li>
        ))}
      </ul>
      {lista.length > CORTA && (
        <button type="button" className="charlas__mas" aria-expanded={todas} onClick={() => setTodas(!todas)}>
          {todas ? 'Ver menos' : `Ver las ${lista.length}`}
        </button>
      )}
    </section>
  );
}
