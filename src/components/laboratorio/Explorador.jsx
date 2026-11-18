import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { NOMBRES_DE_LENGUAJE } from '../../lib/laboratorio/adivinar';
import { nombreEnProyecto } from '../../lib/laboratorio/guardado';
import { IDS_DE_LENGUAJE, LENGUAJES } from '../../lib/laboratorio/lenguajes';
import { EXTENSIONES } from '../../lib/laboratorio/saneo';

// The lab's files, on the left as in an editor: the draft first, then by course the projects (folders with their files)
// and the files on their own. What the last run wrote goes under the place it ran, marked with the highlighter. Each row
// opens with a click; «Opciones» (or the right click, Shift+F10 and the menu key) opens what else it can do, beside it.
// Names are written in place. A file goes to another project by dragging it, or with «Mover a» from the keyboard.

const DIBUJOS = {
  carpeta: 'M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2h8.5A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z',
  flecha: 'm9 6 6 6-6 6',
  mas: 'M5 12h.01M12 12h.01M19 12h.01',
  corre: 'M8 5.5v13l10-6.5z',
  nuevo: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M12 11v6M9 14h6',
};
// The kind of each file at a glance, as in an editor: its extension in a small label, in the color of its language.
// The letters come from CSS, so the text of the row is only its name.
const TIPOS = { py: ['Py', 'python'], c: ['C', 'c'], h: ['H', 'c'], sql: ['SQL', 'sql'], der: ['DER', 'sql'], js: ['JS', 'javascript'], json: ['{ }', 'datos'] };
const Tipo = ({ ext }) => {
  const [texto, tipo] = TIPOS[ext] ?? [String(ext ?? '').slice(0, 3).toUpperCase(), 'datos'];
  return <span className="lab-tipo" data-tipo={tipo} data-texto={texto} aria-hidden="true" />;
};

const Dibujo = ({ nombre, clase = '' }) => (
  <svg className={`lab-arbol__dibujo ${clase}`} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d={DIBUJOS[nombre]} />
  </svg>
);

// What a written file is, said after its name: to the eye with a mark, to a screen reader in words.
function marcaDe(escrito, propio) {
  if (!escrito) return null;
  if (escrito.borrado) return { clase: 'borrado', texto: 'lo borró el programa' };
  if (escrito.texto === null) return { clase: 'binario', texto: 'lo escribió el programa, no es texto' };
  return { clase: 'cambiado', texto: propio ? 'lo cambió el programa' : 'lo escribió el programa' };
}

/** A name written in place: Enter saves it, Esc lets it go. `alListo(texto)` answers with an error to show, or null. */
function Nombre({ etiqueta, inicial = '', sufijo = null, extras = null, boton = 'Listo', alListo, alCancelar }) {
  const id = useId();
  const [texto, setTexto] = useState(inicial);
  const [error, setError] = useState('');
  const campo = useRef(null);
  const forma = useRef(null);
  useEffect(() => {
    campo.current?.focus({ preventScroll: true });
    campo.current?.select();
    // Its buttons in view too, at the bottom of a long list.
    forma.current?.scrollIntoView({ block: 'nearest' });
  }, []);
  return (
    <form
      ref={forma}
      className="lab-arbol__form"
      onSubmit={(e) => {
        e.preventDefault();
        const problema = alListo(texto.trim(), new FormData(e.currentTarget));
        if (problema) {
          setError(problema);
          campo.current?.focus();
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          alCancelar();
        }
      }}
    >
      <label className="solo-lectores" htmlFor={`${id}-campo`}>{etiqueta}</label>
      <span className="lab-arbol__campo">
        <input
          ref={campo}
          id={`${id}-campo`}
          className="campo__control"
          type="text"
          maxLength={60}
          autoComplete="off"
          spellCheck={false}
          value={texto}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => {
            setTexto(e.target.value);
            setError('');
          }}
        />
        {sufijo}
      </span>
      {extras}
      {error && <span id={`${id}-error`} className="campo__error" role="alert">{error}</span>}
      <span className="lab-arbol__form-botones">
        <button type="submit" className="boton boton--chico">{boton}</button>
        <button type="button" className="boton boton--secundario boton--chico" onClick={alCancelar}>Cancelar</button>
      </span>
    </form>
  );
}

/** Where a file can go, chosen from a list: the keyboard's way of dragging it. */
function MoverA({ nombre, destinos, alMover, alCancelar }) {
  const id = useId();
  const [error, setError] = useState('');
  const campo = useRef(null);
  useEffect(() => {
    campo.current?.focus();
  }, []);
  return (
    <form
      className="lab-arbol__form"
      onSubmit={(e) => {
        e.preventDefault();
        const valor = String(new FormData(e.currentTarget).get('destino'));
        const problema = alMover(valor === '' ? null : valor);
        if (problema) {
          setError(problema);
          campo.current?.focus();
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          alCancelar();
        }
      }}
    >
      <label className="lab-arbol__etiqueta" htmlFor={`${id}-destino`}>{`Mover ${nombre} a`}</label>
      <select
        ref={campo}
        id={`${id}-destino`}
        name="destino"
        className="campo__control"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={() => setError('')}
      >
        {destinos.map((d) => <option key={d.id ?? ''} value={d.id ?? ''}>{d.nombre}</option>)}
      </select>
      {error && <span id={`${id}-error`} className="campo__error" role="alert">{error}</span>}
      <span className="lab-arbol__form-botones">
        <button type="submit" className="boton boton--chico">Mover</button>
        <button type="button" className="boton boton--secundario boton--chico" onClick={alCancelar}>Cancelar</button>
      </span>
    </form>
  );
}

// The menus of the explorer float over it (popover): a touch anywhere else, Esc, a scroll or another menu closes them.
// From «Opciones» they hang from the button; from the right click, they open where the pointer is.
const abiertoDesde = new WeakMap();

function ubicar(menu) {
  const desde = abiertoDesde.get(menu);
  if (!desde) return;
  const r = menu.getBoundingClientRect();
  const margen = 8;
  let x;
  let y;
  if (desde.punto) {
    ({ x, y } = desde.punto);
    if (y + r.height > innerHeight - margen) y -= r.height;
  } else {
    const b = desde.boton.getBoundingClientRect();
    x = b.right - r.width;
    y = b.bottom + 2;
    if (y + r.height > innerHeight - margen) y = b.top - r.height - 2;
  }
  menu.style.left = `${Math.round(Math.max(margen, Math.min(x, innerWidth - r.width - margen)))}px`;
  menu.style.top = `${Math.round(Math.max(margen, Math.min(y, innerHeight - r.height - margen)))}px`;
}

/** Opens the menu `id` at `punto` ({ x, y }), or under `boton`. The focus goes to its first option; Esc gives it back to `volver`. */
function abrirMenu(id, { punto = null, boton = null, volver = null }) {
  const menu = document.getElementById(id);
  if (!menu) return;
  abiertoDesde.set(menu, { punto, boton, volver: volver ?? boton });
  if (!menu.matches(':popover-open')) menu.showPopover();
  ubicar(menu);
  menu.querySelector('button')?.focus();
}

function Menu({ id, etiqueta, acciones, alCambiar = null }) {
  const lista = useRef(null);
  const ultimo = useRef(alCambiar);
  useEffect(() => {
    ultimo.current = alCambiar;
  });
  useEffect(() => {
    const el = lista.current;
    // Opened by its button (popovertarget): it hangs from it.
    const antes = (e) => {
      if (e.newState !== 'open') return;
      const boton = document.querySelector(`[popovertarget="${CSS.escape(id)}"]`);
      if (!abiertoDesde.get(el)?.punto && boton) {
        abiertoDesde.set(el, { boton, volver: boton });
        const b = boton.getBoundingClientRect();
        el.style.left = 'auto';
        el.style.right = `${Math.round(innerWidth - b.right)}px`;
        el.style.top = `${Math.round(b.bottom + 2)}px`;
      }
    };
    const cambio = (e) => {
      const abierto = e.newState === 'open';
      if (abierto) {
        el.style.right = '';
        ubicar(el);
      } else abiertoDesde.delete(el);
      ultimo.current?.(abierto);
    };
    el.addEventListener('beforetoggle', antes);
    el.addEventListener('toggle', cambio);
    return () => {
      el.removeEventListener('beforetoggle', antes);
      el.removeEventListener('toggle', cambio);
    };
  }, [id]);
  return (
    <ul
      ref={lista}
      id={id}
      popover="auto"
      className="lab-menu"
      aria-label={etiqueta}
      // Leaving it with Tab closes it too.
      onBlur={(e) => {
        if (e.relatedTarget && !lista.current.contains(e.relatedTarget)) lista.current.hidePopover();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          const volver = abiertoDesde.get(lista.current)?.volver;
          lista.current.hidePopover();
          volver?.focus();
          return;
        }
        // Up and down go through the options, as in any menu.
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
        e.preventDefault();
        const botones = [...lista.current.querySelectorAll('button')];
        const i = botones.indexOf(document.activeElement);
        botones[(i + (e.key === 'ArrowDown' ? 1 : -1) + botones.length) % botones.length]?.focus();
      }}
    >
      {acciones.filter(Boolean).map((a) => (
        <li key={a.texto}>
          <button
            type="button"
            className={`lab-menu__accion${a.peligro ? ' lab-menu__accion--peligro' : ''}`}
            onClick={() => {
              lista.current.hidePopover();
              a.hacer();
            }}
          >
            {a.texto}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** «Opciones» of a row: the button and its menu. */
function Opciones({ nombre, menu, acciones }) {
  const [abiertas, setAbiertas] = useState(false);
  return (
    <>
      <button type="button" className="lab-arbol__opciones" aria-label={`Opciones de ${nombre}`} aria-expanded={abiertas} popoverTarget={menu}>
        <Dibujo nombre="mas" />
      </button>
      <Menu id={menu} etiqueta={`Opciones de ${nombre}`} acciones={acciones} alCambiar={setAbiertas} />
    </>
  );
}

/**
 * `archivos` and `proyectos`: the student's (mio.js). `abierto`: the file in the editor (null: the draft). `proyecto`:
 * the project it's in, or null. `escritos`: what the last runs of the place in view wrote (escritos.js), and
 * `verEscrito` the one open. `acc`: what each action does (Laboratorio.jsx); those that write a name answer with the
 * problem to show, or null.
 */
export default function Explorador({ archivos, proyectos, materias, mesa, abierto, proyecto, escritos, verEscrito, acc, encabezado = true, titulo = 'Tus archivos' }) {
  const id = useId();
  const menuDe = (clave) => `${id}-menu-${clave}`;
  // Which name is being written, or where a file is going: one at a time.
  const [editando, setEditando] = useState(null);
  const [plegados, setPlegados] = useState(() => new Set());
  // The file being dragged, and where it would go if let go now (a project's id, or 'fuera').
  const [arrastrado, setArrastrado] = useState(null);
  const [sobre, setSobre] = useState(null);
  // After a name is saved the focus goes to its row (the form it was in is gone).
  const enfocar = useRef(null);
  const setEnfocar = (fila) => {
    enfocar.current = fila;
  };
  const raiz = useRef(null);
  useEffect(() => {
    const el = enfocar.current && raiz.current?.querySelector(`[data-fila="${CSS.escape(enfocar.current)}"]`);
    if (!el) return;
    el.focus();
    enfocar.current = null;
  });

  // A scroll anywhere but inside the menu closes it: it would be left hanging away from its row.
  useEffect(() => {
    const alMover = (e) => {
      const menu = raiz.current?.querySelector('.lab-menu:popover-open');
      if (menu && !menu.contains(e.target)) menu.hidePopover();
    };
    document.addEventListener('scroll', alMover, true);
    return () => document.removeEventListener('scroll', alMover, true);
  }, []);

  // «Nuevo», on top or in the menu of the empty space: in the project open, if there is one; if not, on its own.
  const nuevo = () => setEditando({ clave: proyecto ? `n:${proyecto}` : 'archivo' });

  const grupos = useMemo(() => {
    if (!materias) return [];
    const porMateria = new Map();
    const sumar = (materia, item) => {
      const clave = materia ?? '';
      if (!porMateria.has(clave)) porMateria.set(clave, []);
      porMateria.get(clave).push(item);
    };
    for (const p of proyectos) sumar(p.materia, { tipo: 'proyecto', p, nombre: p.nombre });
    for (const a of archivos) if (!a.proyecto || !proyectos.some((p) => p.id === a.proyecto)) sumar(a.materia, { tipo: 'archivo', a, nombre: a.nombre });
    const orden = [...materias.grupos.flatMap((g) => g.lista.map((m) => m.id)), ...[...porMateria.keys()].filter((k) => k !== '' && !materias.nombres.has(k)), ''];
    return orden.filter((k) => porMateria.has(k)).map((k) => ({
      clave: k,
      nombre: k === '' ? 'Sin materia' : materias.nombres.get(k) ?? (materias.cargadas ? 'Una materia que ya no está' : 'Materia del campus'),
      items: porMateria.get(k).sort((a, b) => (a.tipo === b.tipo ? a.nombre.localeCompare(b.nombre, 'es') : a.tipo === 'proyecto' ? -1 : 1)),
    }));
  }, [archivos, proyectos, materias]);

  const listo = (fila) => (problema) => {
    if (problema) return problema;
    setEditando(null);
    if (fila) setEnfocar(fila);
    return null;
  };

  // Where a file can go: another project of its language, or out of the one it's in (code only: a header or data
  // lives in a project).
  const enProyecto = (a) => (a.proyecto && proyectos.some((p) => p.id === a.proyecto) ? a.proyecto : null);
  const destinosDe = (a) => [
    ...proyectos.filter((p) => p.lenguaje === a.lenguaje && p.id !== enProyecto(a)).map((p) => ({ id: p.id, nombre: p.nombre })),
    ...(enProyecto(a) && !a.ext ? [{ id: null, nombre: 'Fuera de los proyectos' }] : []),
  ];
  const puedeIr = (a, destino) => Boolean(a) && destinosDe(a).some((d) => d.id === destino);
  const moverA = (a, nombre) => ({
    texto: 'Mover a…',
    hacer: () => setEditando({ clave: `m:${a.id}`, nombre }),
  });
  const filaMoviendo = (a, nombre) => (
    <MoverA
      nombre={nombre}
      destinos={destinosDe(a)}
      alMover={(destino) => listo(a.id)(acc.moverArchivo(a, destino))}
      alCancelar={() => {
        setEditando(null);
        setEnfocar(a.id);
      }}
    />
  );
  // Dragging a file: from its row, with the mouse or a finger where the browser lets.
  const arrastrable = (a) => ({
    draggable: true,
    onDragStart: (e) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', a.nombre);
      setArrastrado(a);
    },
    onDragEnd: () => {
      setArrastrado(null);
      setSobre(null);
    },
  });
  const soltarEn = (destino) => ({
    onDragOver: (e) => {
      if (!arrastrado) return;
      e.stopPropagation();
      if (!puedeIr(arrastrado, destino)) {
        e.dataTransfer.dropEffect = 'none';
        setSobre(null);
        return;
      }
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setSobre(destino ?? 'fuera');
    },
    onDrop: (e) => {
      if (!arrastrado || !puedeIr(arrastrado, destino)) return;
      e.preventDefault();
      e.stopPropagation();
      const a = arrastrado;
      setArrastrado(null);
      setSobre(null);
      const problema = acc.moverArchivo(a, destino);
      if (problema) acc.avisarError(problema);
    },
  });

  // The rows of what the program wrote, under the place it ran. Those of a file of the project go marked on its row.
  const escritosSueltos = (propios) => escritos.filter((e) => !propios.has(e.nombre));
  const filaEscrito = (e) => {
    const marca = marcaDe(e, false);
    const clave = `e:${e.nombre}`;
    return (
      <li key={clave} className="lab-arbol__item">
        <div className="lab-arbol__fila" data-marca={marca.clase} data-menu={menuDe(clave)}>
          <button type="button" className="lab-arbol__nombre" data-fila={clave} aria-current={verEscrito === e.nombre ? 'true' : undefined} onClick={() => acc.abrirEscrito(e.nombre)}>
            <Tipo ext={e.nombre.includes('.') ? e.nombre.split('.').pop().toLowerCase() : ''} />
            <span className="lab-arbol__texto">{e.nombre}</span>
            <span className="lab-arbol__marca" aria-hidden="true" />
            <span className="solo-lectores">{`, ${marca.texto}`}</span>
          </button>
          <Opciones
            nombre={e.nombre}
            menu={menuDe(clave)}
            acciones={[
              acc.puedeGuardarEscrito(e) && { texto: 'Guardar en el proyecto', hacer: () => acc.guardarEscrito(e.nombre) },
              { texto: 'Bajar', hacer: () => acc.bajarEscrito(e.nombre) },
              { texto: 'Descartar', hacer: () => acc.descartarEscrito(e.nombre) },
            ]}
          />
        </div>
      </li>
    );
  };

  const filaArchivoDeProyecto = (a, p) => {
    const nombre = nombreEnProyecto(a);
    const esPrincipal = a.id === acc.principalDe(p)?.id;
    const escrito = p.id === proyecto ? escritos.find((e) => e.nombre === nombre) : null;
    const marca = marcaDe(escrito, true);
    const clave = `a:${a.id}`;
    const ext = a.ext ?? LENGUAJES[a.lenguaje].extension;
    return (
      <li key={a.id} className="lab-arbol__item">
        {editando?.clave === clave ? (
          <Nombre
            etiqueta={`Nuevo nombre de ${nombre}`}
            inicial={a.nombre}
            sufijo={<span className="lab-arbol__ext">{`.${ext}`}</span>}
            alListo={(texto) => listo(a.id)(acc.renombrarArchivo(a, texto))}
            alCancelar={() => {
              setEditando(null);
              setEnfocar(a.id);
            }}
          />
        ) : editando?.clave === `m:${a.id}` ? (
          filaMoviendo(a, nombre)
        ) : (
          <div className="lab-arbol__fila" data-marca={marca?.clase} data-menu={menuDe(clave)} data-arrastrado={arrastrado?.id === a.id || undefined} {...(acc.moverArchivo ? arrastrable(a) : {})}>
            <button
              type="button"
              className="lab-arbol__nombre"
              data-fila={a.id}
              aria-current={abierto === a.id && !verEscrito ? 'true' : undefined}
              onClick={() => (escrito ? acc.abrirEscrito(nombre, a.id) : acc.abrir(a.id))}
            >
              <Tipo ext={ext} />
              <span className="lab-arbol__texto">{nombre}</span>
              {esPrincipal && <Dibujo nombre="corre" clase="lab-arbol__corre" />}
              {marca && <span className="lab-arbol__marca" aria-hidden="true" />}
              {(esPrincipal || marca) && <span className="solo-lectores">{[esPrincipal && ', el que corre', marca && `, ${marca.texto}`].filter(Boolean).join('')}</span>}
            </button>
            <Opciones
              nombre={nombre}
              menu={menuDe(clave)}
              acciones={[
                ext === LENGUAJES[p.lenguaje].extension && !esPrincipal && { texto: 'Que corra este', hacer: () => acc.elegirPrincipal(p.id, a.id) },
                { texto: 'Cambiar el nombre', hacer: () => setEditando({ clave }) },
                destinosDe(a).length > 0 && moverA(a, nombre),
                { texto: 'Bajar', hacer: () => acc.bajarArchivo(a) },
                { texto: 'Borrar', peligro: true, hacer: () => acc.borrarArchivo(a) },
              ]}
            />
          </div>
        )}
      </li>
    );
  };

  const filaProyecto = (p) => {
    const suyos = archivos.filter((a) => a.proyecto === p.id);
    const creando = editando?.clave === `n:${p.id}`;
    const desplegado = p.id === proyecto || creando || !plegados.has(p.id);
    const clave = `p:${p.id}`;
    const propios = new Set(suyos.map(nombreEnProyecto));
    const lista = `${id}-${p.id}`;
    const crear = () => setEditando({ clave: `n:${p.id}` });
    return (
      <li key={p.id} className="lab-arbol__item" data-sobre={sobre === p.id || undefined} {...soltarEn(p.id)}>
        {editando?.clave === clave ? (
          <Nombre
            etiqueta={`Nuevo nombre de ${p.nombre}`}
            inicial={p.nombre}
            alListo={(texto) => listo(p.id)(acc.renombrarProyecto(p, texto))}
            alCancelar={() => {
              setEditando(null);
              setEnfocar(p.id);
            }}
          />
        ) : (
          <div className="lab-arbol__fila lab-arbol__fila--proyecto" data-menu={menuDe(clave)}>
            <button
              type="button"
              className="lab-arbol__nombre"
              data-fila={p.id}
              aria-expanded={desplegado}
              aria-controls={lista}
              onClick={() =>
                setPlegados((s) => {
                  const n = new Set(s);
                  if (desplegado && p.id !== proyecto) n.add(p.id);
                  else if (!desplegado) n.delete(p.id);
                  return n;
                })
              }
            >
              <Dibujo nombre="flecha" clase="lab-arbol__flecha" />
              <span className="lab-arbol__carpeta" data-tipo={p.lenguaje}><Dibujo nombre="carpeta" /></span>
              <span className="lab-arbol__texto">{p.nombre}</span>
              <span className="lab-arbol__lenguaje">{NOMBRES_DE_LENGUAJE[p.lenguaje] ?? LENGUAJES[p.lenguaje].nombre}</span>
            </button>
            {/* With the pointer over the row or the focus in it, as in an editor. On a touch screen, the menu has it. */}
            <button type="button" className="lab-arbol__opciones lab-arbol__crear" aria-label={`Nuevo archivo en ${p.nombre}`} title="Nuevo archivo" onClick={crear}>
              <Dibujo nombre="nuevo" />
            </button>
            <Opciones
              nombre={p.nombre}
              menu={menuDe(clave)}
              acciones={[
                { texto: 'Nuevo archivo', hacer: crear },
                { texto: 'Subir un archivo', hacer: () => acc.subirArchivo(p) },
                acc.renombrarProyecto && { texto: 'Cambiar el nombre', hacer: () => setEditando({ clave }) },
                { texto: 'Bajar como zip', hacer: () => acc.bajarProyecto(p) },
                acc.borrarProyecto && { texto: 'Borrar el proyecto', peligro: true, hacer: () => acc.borrarProyecto(p) },
              ]}
            />
          </div>
        )}
        <ul id={lista} className="lab-arbol__hijos" hidden={!desplegado}>
          {suyos.map((a) => filaArchivoDeProyecto(a, p))}
          {p.id === proyecto && escritosSueltos(propios).map(filaEscrito)}
          {creando && (
            <li className="lab-arbol__item">
              <Nombre
                etiqueta={`Nombre del archivo nuevo de ${p.nombre}`}
                boton="Crear"
                extras={
                  <span className="lab-arbol__tipo">
                    <label className="solo-lectores" htmlFor={`${id}-tipo-${p.id}`}>Tipo</label>
                    <select id={`${id}-tipo-${p.id}`} name="ext" className="campo__control" defaultValue={LENGUAJES[p.lenguaje].extension}>
                      {EXTENSIONES[p.lenguaje].map((e) => <option key={e} value={e}>{`.${e}`}</option>)}
                    </select>
                  </span>
                }
                alListo={(texto, datos) => {
                  const r = acc.nuevoArchivo(p, { nombre: texto, ext: String(datos.get('ext')) });
                  return typeof r === 'string' ? r : listo(r?.fila)(null);
                }}
                alCancelar={() => {
                  setEditando(null);
                  setEnfocar(p.id);
                }}
              />
            </li>
          )}
        </ul>
      </li>
    );
  };

  const filaSuelto = (a) => {
    const clave = `a:${a.id}`;
    const ext = LENGUAJES[a.lenguaje].extension;
    const aca = !proyecto && abierto === a.id;
    return (
      <li key={a.id} className="lab-arbol__item">
        {editando?.clave === clave ? (
          <Nombre
            etiqueta={`Nuevo nombre de ${a.nombre}`}
            inicial={a.nombre}
            sufijo={<span className="lab-arbol__ext">{`.${ext}`}</span>}
            alListo={(texto) => listo(a.id)(acc.renombrarArchivo(a, texto))}
            alCancelar={() => {
              setEditando(null);
              setEnfocar(a.id);
            }}
          />
        ) : editando?.clave === `m:${a.id}` ? (
          filaMoviendo(a, `${a.nombre}.${ext}`)
        ) : (
          <div className="lab-arbol__fila" data-menu={menuDe(clave)} data-arrastrado={arrastrado?.id === a.id || undefined} {...arrastrable(a)}>
            <button type="button" className="lab-arbol__nombre" data-fila={a.id} aria-current={aca && !verEscrito ? 'true' : undefined} onClick={() => acc.abrir(a.id)}>
              <Tipo ext={ext} />
              <span className="lab-arbol__texto">
                {a.nombre}
                <span className="lab-arbol__ext">{`.${ext}`}</span>
              </span>
            </button>
            <Opciones
              nombre={a.nombre}
              menu={menuDe(clave)}
              acciones={[
                { texto: 'Pasar a un proyecto', hacer: () => acc.aProyecto(a) },
                { texto: 'Cambiar el nombre', hacer: () => setEditando({ clave }) },
                destinosDe(a).length > 0 && moverA(a, `${a.nombre}.${ext}`),
                { texto: 'Bajar', hacer: () => acc.bajarArchivo(a) },
                { texto: 'Borrar', peligro: true, hacer: () => acc.borrarArchivo(a) },
              ]}
            />
          </div>
        )}
        {aca && escritos.length > 0 && <ul className="lab-arbol__hijos">{escritos.map(filaEscrito)}</ul>}
      </li>
    );
  };

  // The right click, Shift+F10 and the menu key: the menu of the row, or the one of the explorer on an empty space.
  // In a field, the browser's own (to paste a name).
  const porTeclado = useRef(0);
  const menuAca = (e, punto) => {
    if (e.target.closest('input, select, textarea, .lab-menu')) return false;
    const fila = e.target.closest('[data-menu]');
    const menu = fila?.dataset.menu ?? menuDe('general');
    if (!document.getElementById(menu)) return false;
    const volver = fila?.querySelector('.lab-arbol__nombre') ?? (e.target.closest('button') || raiz.current.querySelector('.lab-explorador__botones button'));
    abrirMenu(menu, { punto, volver });
    return true;
  };

  return (
    <section
      ref={raiz}
      className="lab-explorador"
      aria-labelledby={`${id}-titulo`}
      onContextMenu={(e) => {
        // The key's own event comes after the one handled on keydown.
        if (Date.now() - porTeclado.current < 600) {
          e.preventDefault();
          return;
        }
        if (menuAca(e, { x: e.clientX, y: e.clientY })) e.preventDefault();
      }}
      onKeyDown={(e) => {
        if (!((e.shiftKey && e.key === 'F10') || e.key === 'ContextMenu')) return;
        const b = e.target.getBoundingClientRect();
        if (menuAca(e, { x: b.left + 12, y: b.bottom })) {
          e.preventDefault();
          porTeclado.current = Date.now();
        }
      }}
    >
      <div className="lab-explorador__cabeza">
        <h2 id={`${id}-titulo`} className={encabezado ? undefined : 'solo-lectores'}>{titulo}</h2>
        <div className="lab-explorador__botones">
          <button type="button" className="boton boton--secundario boton--chico" onClick={nuevo} aria-expanded={editando?.clave === 'archivo' || editando?.clave === `n:${proyecto}`}>Nuevo</button>
          {acc.nuevoProyecto && <button type="button" className="boton boton--secundario boton--chico" onClick={() => setEditando({ clave: 'proyecto' })} aria-expanded={editando?.clave === 'proyecto'}>Nuevo proyecto</button>}
          {acc.subirZip && <button type="button" className="boton boton--secundario boton--chico" onClick={acc.subirZip}>Subir zip</button>}
        </div>
      </div>
      <div className="lab-explorador__lista" data-sobre={sobre === 'fuera' || undefined} {...soltarEn(null)} onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget) && setSobre(null)}>
        {editando?.clave === 'proyecto' && (
          <Nombre
            etiqueta="Nombre del proyecto nuevo"
            boton="Crear"
            extras={
              <span className="lab-arbol__tipo">
                <label className="solo-lectores" htmlFor={`${id}-lenguaje-nuevo`}>Lenguaje</label>
                <select id={`${id}-lenguaje-nuevo`} name="lenguaje" className="campo__control" defaultValue={acc.lenguajeNuevo}>
                  {IDS_DE_LENGUAJE.map((l) => <option key={l} value={l}>{LENGUAJES[l].nombre}</option>)}
                </select>
              </span>
            }
            alListo={(texto, datos) => {
              const r = acc.nuevoProyecto({ nombre: texto, lenguaje: String(datos.get('lenguaje')) });
              return typeof r === 'string' ? r : listo(r?.fila)(null);
            }}
            alCancelar={() => setEditando(null)}
          />
        )}
        {editando?.clave === 'archivo' && (
          <Nombre
            etiqueta="Nombre del archivo nuevo"
            boton="Crear"
            extras={
              <span className="lab-arbol__tipo">
                <label className="solo-lectores" htmlFor={`${id}-lenguaje-archivo`}>Lenguaje</label>
                <select id={`${id}-lenguaje-archivo`} name="lenguaje" className="campo__control" defaultValue={acc.lenguajeNuevo}>
                  {IDS_DE_LENGUAJE.map((l) => <option key={l} value={l}>{LENGUAJES[l].nombre}</option>)}
                </select>
              </span>
            }
            alListo={(texto, datos) => {
              const r = acc.nuevoSuelto({ nombre: texto, lenguaje: String(datos.get('lenguaje')) });
              return typeof r === 'string' ? r : listo(r?.fila)(null);
            }}
            alCancelar={() => setEditando(null)}
          />
        )}
        {/* The draft: listed while it's in view or has something of the student's. Borrar starts it again. */}
        {mesa && (abierto === null || mesa.tocada || mesa.origen) && (
          <ul className="lab-arbol">
            <li className="lab-arbol__item">
              <div className="lab-arbol__fila" data-menu={menuDe('mesa')}>
                <button type="button" className="lab-arbol__nombre" data-fila="mesa" aria-current={abierto === null && !verEscrito ? 'true' : undefined} onClick={acc.abrirMesa}>
                  <Tipo ext={LENGUAJES[mesa.lenguaje]?.extension} />
                  <span className="lab-arbol__texto">Sin guardar</span>
                  <span className="lab-arbol__dato">{mesa.origen?.apunte ? `De ${mesa.origen.apunte}` : NOMBRES_DE_LENGUAJE[mesa.lenguaje]}</span>
                </button>
                <Opciones nombre="Sin guardar" menu={menuDe('mesa')} acciones={[{ texto: 'Borrar', peligro: true, hacer: acc.borrarMesa }]} />
              </div>
              {abierto === null && escritos.length > 0 && <ul className="lab-arbol__hijos">{escritos.map(filaEscrito)}</ul>}
            </li>
          </ul>
        )}
        {/* A live table: its one project, without courses. */}
        {!materias && <ul className="lab-arbol">{proyectos.map(filaProyecto)}</ul>}
        {grupos.map((g) => (
          <div key={String(g.clave)} className="laboratorio__materia lab-explorador__materia">
            <h3>{g.nombre}</h3>
            <ul className="lab-arbol">{g.items.map((it) => (it.tipo === 'proyecto' ? filaProyecto(it.p) : filaSuelto(it.a)))}</ul>
          </div>
        ))}
        {materias && !grupos.length && <p className="lab-explorador__ayuda">Lo que guardes queda acá, ordenado por materia.</p>}
        {arrastrado && enProyecto(arrastrado) && !arrastrado.ext && <p className="lab-explorador__soltar" aria-hidden="true">Soltalo acá para sacarlo del proyecto.</p>}
      </div>
      <Menu
        id={menuDe('general')}
        etiqueta={titulo}
        acciones={[
          { texto: proyecto ? 'Nuevo archivo en este proyecto' : 'Nuevo archivo', hacer: nuevo },
          acc.nuevoProyecto && { texto: 'Nuevo proyecto', hacer: () => setEditando({ clave: 'proyecto' }) },
          acc.subirZip && { texto: 'Subir zip', hacer: acc.subirZip },
        ]}
      />
    </section>
  );
}
