import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CALCULADORAS } from '../lib/calculadoras/lista';
import { cargarIndice, cargarMaterias, cargarPerfil } from '../lib/campus';
import { buscar } from '../lib/datos';
import { estaOculto, personalizar, useMio } from '../lib/mio';
import { extension } from './Filas';
import { useAbrirPrevia } from './Previa';
import Simbolo, { Icono, IconoDeItem } from './Simbolo';
import './paleta.css';

const MAXIMO = 12;

// Every screen with a color of the courses' palette. Neighbors never share one.
const PANTALLAS = [
  { a: '/', nombre: 'Hoy', simbolo: 'campana', color: '0' },
  { a: '/calendario', nombre: 'Calendario', simbolo: 'calendario', color: '3' },
  { a: '/materias', nombre: 'Materias', simbolo: 'libro', color: '6' },
  { a: '/inscripcion', nombre: 'Inscribirte a una materia', simbolo: 'formulario', color: '1' },
  { a: '/buscar', nombre: 'Buscar', simbolo: 'brujula', color: '8' },
  { a: '/resumenes', nombre: 'Resúmenes', simbolo: 'documento', color: '4' },
  { a: '/horario', nombre: 'Tu horario', simbolo: 'reloj', color: '7' },
  { a: '/sysacad', nombre: 'Sysacad', simbolo: 'carpeta', color: '2' },
  { a: '/carrera', nombre: 'Tu carrera', simbolo: 'bandera', color: '5' },
  { a: '/mensajes', nombre: 'Mensajes', simbolo: 'sobre', color: '9' },
  { a: '/mensajes/foros', nombre: 'Foros', simbolo: 'burbuja', color: '2' },
  { a: '/configuracion', nombre: 'Configuración', simbolo: 'rombo', color: '0' },
  { a: '/laboratorio', nombre: 'Laboratorio', simbolo: 'codigo', color: '3' },
  { a: '/repaso', nombre: 'Repaso', simbolo: 'marcador', color: '6' },
  { a: '/calculadoras', nombre: 'Calculadoras', simbolo: 'sigma', color: '1' },
  { a: '/disenos', nombre: 'Diseños', simbolo: 'capas', color: '5' },
].map((p) => ({ ...p, clave: `pantalla:${p.a}`, dato: 'Pantalla' }));

// Each calculator, only when something is typed: with nothing, Calculadoras is enough.
const DE_CALCULO = CALCULADORAS.map((c) => ({ a: `/calculadoras/${c.slug}`, nombre: c.nombre, simbolo: 'sigma', color: '1', clave: `pantalla:/calculadoras/${c.slug}`, dato: 'Calculadora' }));

const filaMateria = (m) => ({ clave: `materia:${m.id}`, a: `/materias/${m.id}`, nombre: m.nombre, materia: m, dato: 'Materia' });

function datoDeItem(item) {
  const que = item.tipo === 'archivo' ? extension(item.archivo) : item.tipo === 'enlace' ? (item.video ? 'Video' : 'Enlace') : item.clase;
  return [que, item.materia].filter(Boolean).join(', ');
}

const filaItem = (item) => ({ clave: `item:${item.id}`, nombre: item.nombre, item, dato: datoDeItem(item) });

function armarFilas(consulta, materias, contenido) {
  // With nothing typed, every screen at least.
  if (!consulta.trim()) return [...PANTALLAS, ...materias.map(filaMateria)].slice(0, Math.max(MAXIMO, PANTALLAS.length));
  return [
    ...buscar([...PANTALLAS, ...DE_CALCULO], consulta, MAXIMO),
    ...buscar(materias, consulta, MAXIMO).map(filaMateria),
    ...buscar(contenido, consulta, MAXIMO).map(filaItem),
  ].slice(0, MAXIMO);
}

function SimboloDeFila({ fila }) {
  if (fila.item) return <IconoDeItem item={fila.item} />;
  if (fila.materia) return <Simbolo id={fila.materia.id} nombre={fila.materia.nombre} tamano="fila" />;
  return <Icono nombre={fila.simbolo} color={fila.color} tamano="tipo" />;
}

function Caja({ dialogo, materias, contenido, cargando, fallo, alElegir, alCerrar }) {
  const [consulta, setConsulta] = useState('');
  const [claveActiva, setClaveActiva] = useState(null);
  const campo = useRef(null);
  const lista = useRef(null);
  const conTeclado = useRef(false);
  const id = useId();
  const idLista = `${id}-lista`;
  const idDe = (i) => `${id}-opcion-${i}`;

  useEffect(() => {
    const el = dialogo.current;
    if (!el.open) el.showModal();
    campo.current?.focus();
  }, [dialogo]);

  const filas = useMemo(() => armarFilas(consulta, materias, contenido), [consulta, materias, contenido]);
  // By key and not by position: when the index arrives the list changes, and the row in focus must not turn into another.
  const activa = Math.max(0, filas.findIndex((f) => f.clave === claveActiva));

  useEffect(() => {
    if (!conTeclado.current) return;
    conTeclado.current = false;
    lista.current?.children[activa]?.scrollIntoView({ block: 'nearest' });
  }, [activa]);

  const mover = (paso) => {
    if (!filas.length) return;
    conTeclado.current = true;
    setClaveActiva(filas[(activa + paso + filas.length) % filas.length].clave);
  };

  const alTeclear = (e) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      mover(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      mover(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filas[activa]) alElegir(filas[activa]);
    }
  };

  const hayConsulta = consulta.trim().length > 0;
  let estado = '';
  let estadoVisible = true;
  if (cargando) estado = 'Buscando en tus materias';
  else if (fallo) estado = 'No pudimos revisar tus materias. Las pantallas siguen funcionando. Al volver a abrir probamos de nuevo.';
  else if (hayConsulta && !filas.length) estado = 'No encontramos nada con eso.';
  else if (hayConsulta) {
    estado = filas.length === 1 ? 'Un resultado' : `${filas.length} resultados`;
    estadoVisible = false;
  }

  return (
    <dialog
      ref={dialogo}
      className="paleta"
      aria-label="Buscar en todo el sitio"
      onClose={alCerrar}
      onClick={(e) => { if (e.target === dialogo.current) dialogo.current.close(); }}
    >
      <div className="paleta__caja">
        <div className="paleta__cabeza">
          <input
            ref={campo}
            className="paleta__campo"
            type="text"
            role="combobox"
            aria-label="Buscá una pantalla, una materia o un archivo"
            placeholder="Buscá una pantalla, una materia o un archivo"
            aria-autocomplete="list"
            aria-expanded={filas.length > 0}
            aria-controls={idLista}
            aria-activedescendant={filas.length ? idDe(activa) : undefined}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck="false"
            value={consulta}
            onChange={(e) => { setConsulta(e.target.value); setClaveActiva(null); }}
            onKeyDown={alTeclear}
          />
          <button type="button" className="boton boton--secundario boton--chico paleta__cerrar" onClick={() => dialogo.current.close()}>Cerrar</button>
        </div>
        <ul ref={lista} id={idLista} className="paleta__lista" role="listbox" aria-label="Resultados" hidden={!filas.length}>
          {filas.map((fila, i) => (
            <li
              key={fila.clave}
              id={idDe(i)}
              className="paleta__opcion"
              role="option"
              aria-selected={i === activa}
              onMouseDown={(e) => e.preventDefault()}
              onMouseMove={() => { if (i !== activa) setClaveActiva(fila.clave); }}
              onClick={() => alElegir(fila)}
            >
              <SimboloDeFila fila={fila} />
              <span className="paleta__texto">
                <span className="paleta__nombre">{fila.nombre}</span>
                <span className="paleta__dato">{fila.dato}</span>
              </span>
            </li>
          ))}
        </ul>
        {/* Always in the page, even empty: a screen reader only announces changes in a region it already knew. */}
        <p className={estado && estadoVisible ? 'paleta__estado' : 'solo-lectores'} role="status">{estado}</p>
        <p className="paleta__ayuda" aria-hidden="true">Flechas para moverte, Enter para elegir, Esc para cerrar.</p>
      </div>
    </dialog>
  );
}

// The button on a phone, where there is no shortcut, reaches the mounted palette from anywhere.
const pedidos = new Set();

export default function Paleta() {
  const [abierta, setAbierta] = useState(false);
  const [datos, setDatos] = useState({ materias: null, contenido: [], cargando: false, fallo: false });
  const dialogo = useRef(null);
  const yaPedido = useRef(false);
  const navegar = useNavigate();
  const abrirPrevia = useAbrirPrevia();
  const mio = useMio();

  // Costs requests to the campus, so it waits for the first time the palette opens.
  const cargar = useCallback(async () => {
    if (yaPedido.current) return;
    yaPedido.current = true;
    setDatos((d) => ({ ...d, cargando: true, fallo: false }));
    try {
      await cargarPerfil();
      const materias = await cargarMaterias();
      setDatos((d) => ({ ...d, materias }));
      const contenido = await cargarIndice([...materias.enCurso, ...materias.otras]);
      setDatos({ materias, contenido, cargando: false, fallo: false });
    } catch {
      yaPedido.current = false;
      setDatos((d) => ({ ...d, cargando: false, fallo: true }));
    }
  }, []);

  const abrir = useCallback(() => {
    // Over another modal (a preview, a confirmation) the palette would leave it open behind whatever it opens.
    if (dialogo.current?.open || document.querySelector('dialog[open]')) return;
    setAbierta(true);
    cargar();
  }, [cargar]);

  const cerrar = useCallback(() => {
    dialogo.current?.close();
    setAbierta(false);
  }, []);

  useEffect(() => {
    const alTeclear = (e) => {
      if (!esAtajo(e)) return;
      e.preventDefault();
      if (dialogo.current?.open) cerrar();
      else abrir();
    };
    window.addEventListener('keydown', alTeclear, true);
    pedidos.add(abrir);
    return () => {
      window.removeEventListener('keydown', alTeclear, true);
      pedidos.delete(abrir);
    };
  }, [abrir, cerrar]);

  const materias = useMemo(() => (datos.materias ? [...datos.materias.enCurso, ...datos.materias.otras] : []), [datos.materias]);
  const contenido = useMemo(() => personalizar(datos.contenido, mio).filter((i) => !estaOculto(mio, i)), [datos.contenido, mio]);

  // Closes first: the preview is another modal, and it has to remember the element the palette gave the focus back to.
  const elegir = (fila) => {
    cerrar();
    if (fila.item) abrirPrevia(fila.item);
    else navegar(fila.a);
  };

  if (!abierta) return null;
  return (
    <Caja
      dialogo={dialogo}
      materias={materias}
      contenido={contenido}
      cargando={datos.cargando}
      fallo={datos.fallo}
      alElegir={elegir}
      alCerrar={() => setAbierta(false)}
    />
  );
}

/** For phones, where there is no shortcut. */
// Alt+K, and also Ctrl+K or Cmd+K. With the key's position, so Option+K on a Mac (which types «˚») counts too.
// AltGr is Ctrl+Alt on Windows: it writes characters and is left alone.
export function esAtajo(e) {
  if (e.repeat || e.shiftKey) return false;
  if (e.code !== 'KeyK' && e.key?.toLowerCase() !== 'k') return false;
  const conAlt = e.altKey && !e.ctrlKey && !e.metaKey;
  const conControl = (e.ctrlKey || e.metaKey) && !e.altKey;
  return conAlt || conControl;
}

/** The quick menu's button: in the header, and folded, inside «Menú» (`alTocar` closes it). */
export function BotonPaleta({ alTocar }) {
  return (
    <button type="button" className="cabecera__rapido" title="Menú rápido (Alt K)" aria-haspopup="dialog" aria-keyshortcuts="Alt+K" onClick={() => { alTocar?.(); pedidos.forEach((f) => f()); }}>
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.4-4.4" /></svg>
      <span className="cabecera__rapido-texto">Menú rápido</span>
      <kbd className="cabecera__atajo" aria-hidden="true">Alt K</kbd>
    </button>
  );
}
