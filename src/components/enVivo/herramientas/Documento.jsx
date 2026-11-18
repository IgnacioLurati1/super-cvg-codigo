import { useEffect, useId, useRef, useState } from 'react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import { Extension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { absolutePositionToRelativePosition, relativePositionToAbsolutePosition, ySyncPluginKey } from '@tiptap/y-tiptap';
import * as Y from 'yjs';
import { aHtml, aMarkdown, asegurarFragmento, colorSeguro, fragmentoDe, hrefSeguro, LETRAS, letraSegura, marcaSegura, paraGuardarDocumento, revisar, textoPlano } from '../../../lib/enVivo/documento';
import { pestanas } from '../../../lib/enVivo/mesa';
import { useUI } from '../../ui';
import { atajo } from '../../../lib/enVivo/menuContextual';
import Globo from './Globo';
import { useMenuContextual } from './MenuContextual';
import { Tipografia } from './tipografia';
import { cambiarDocumentoOscuro, useAjustes } from '../../../lib/ajustes';
import { Boton, Icono, Presentes, bajarTexto, nombreArchivo, numeroEn, reservaAbajo, useDesplazamientoSuave, useCambios, useParaConsultron, useSeguir } from './comun';
import './documento.css';
// Kalam's regular weight, for the text written in it: only with the Documento (the site has its bold, for titles).
import '@fontsource/kalam/latin-400.css';

// Documento: rich text that everyone in the tab writes at once (TipTap over the session's Y.Doc), with the others'
// carets and their names. The view is how far down the page is.

const claveMarcas = new PluginKey('vdoc-marcas');

// The others' carets and selections, drawn from what each one marks (two relative positions of Yjs).
function decorar(estado, otros) {
  const ys = ySyncPluginKey.getState(estado);
  if (!ys?.binding || ys.binding.mapping.size === 0 || !ys.doc) return DecorationSet.empty;
  const tope = Math.max(estado.doc.content.size - 1, 0);
  const lista = [];
  otros.forEach((o) => {
    const m = marcaSegura(o.h);
    if (!m) return;
    let ancla;
    let cabeza;
    try {
      ancla = relativePositionToAbsolutePosition(ys.doc, ys.type, m.a, ys.binding.mapping);
      cabeza = relativePositionToAbsolutePosition(ys.doc, ys.type, m.c, ys.binding.mapping);
    } catch {
      return;
    }
    if (ancla == null || cabeza == null) return;
    ancla = Math.min(ancla, tope);
    cabeza = Math.min(cabeza, tope);
    const color = colorSeguro(o.color);
    // Before this browser's own caret (side -1): in an empty block the browser writes after it. Behind it, it was the
    // only thing in the line and the text went outside the block (code) or nowhere.
    lista.push(Decoration.widget(cabeza, () => {
      const caret = document.createElement('span');
      caret.className = 'vdoc-caret';
      caret.setAttribute('aria-hidden', 'true');
      caret.style.setProperty('--color-otro', color);
      // The name is drawn (::after), never text: the page's text and a native edit can't take it.
      const nombre = document.createElement('span');
      nombre.className = 'vdoc-caret__nombre';
      nombre.dataset.nombre = o.nombre || 'Alguien';
      caret.append(nombre);
      return caret;
    }, { key: `${o.id}:${color}:${o.nombre}`, side: -1 }));
    if (ancla !== cabeza) {
      lista.push(Decoration.inline(Math.min(ancla, cabeza), Math.max(ancla, cabeza), { class: 'vdoc-seleccion', style: `--color-otro: ${color}` }));
    }
  });
  return DecorationSet.create(estado.doc, lista);
}

// The others arrive as the meta of a transaction, and stay in the plugin's state for when the text changes.
const marcasDeOtros = Extension.create({
  name: 'marcasDeOtros',
  addProseMirrorPlugins() {
    return [new Plugin({
      key: claveMarcas,
      state: {
        init: () => ({ otros: [], deco: DecorationSet.empty }),
        apply: (tr, viejo, _antes, estado) => {
          const nuevos = tr.getMeta(claveMarcas);
          const otros = nuevos ?? viejo.otros;
          if (!nuevos && !tr.docChanged && !tr.getMeta(ySyncPluginKey)) return viejo;
          return { otros, deco: decorar(estado, otros) };
        },
      },
      props: { decorations: (estado) => claveMarcas.getState(estado).deco },
    })];
  },
});

// Where this browser's caret is, as Yjs relative positions: they stay put while the others write.
function miMarca(editor) {
  const ys = ySyncPluginKey.getState(editor.state);
  if (!ys?.binding || ys.binding.mapping.size === 0) return null;
  const { anchor, head } = editor.state.selection;
  try {
    return {
      a: Y.relativePositionToJSON(absolutePositionToRelativePosition(anchor, ys.type, ys.binding.mapping)),
      c: Y.relativePositionToJSON(absolutePositionToRelativePosition(head, ys.type, ys.binding.mapping)),
    };
  } catch {
    return null;
  }
}

const BAJO = ['aba', 'arr', 'der', 'izq'];
const TECLAS_QUE_MUEVEN = new Set(['PageUp', 'PageDown', 'Home', 'End']);

function Editor({ mesa, fragmento }) {
  const { avisar } = useUI();
  const { marcar } = mesa;
  const [link, setLink] = useState(null);
  const idLink = useId();
  // The page dark, this person's own choice on this device; without one, as it always was.
  const { documentoOscuro } = useAjustes();
  const paginaOscura = documentoOscuro === true;

  const editor = useEditor({
    // Just opened here with «Abrir»: the caret goes in, so what is typed is text (not the site's one-key shortcuts).
    autofocus: mesa.recienAbierta ? 'end' : false,
    extensions: [
      StarterKit.configure({
        undoRedo: false,
        heading: { levels: [1, 2, 3] },
        link: {
          openOnClick: false,
          autolink: true,
          defaultProtocol: 'https',
          isAllowedUri: (url) => Boolean(hrefSeguro(url)),
          HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer nofollow' },
        },
      }),
      Collaboration.configure({ fragment: fragmento }),
      marcasDeOtros,
      Tipografia,
    ],
    editorProps: {
      attributes: { class: 'vdoc-texto', 'aria-label': 'Documento compartido', 'aria-multiline': 'true', role: 'textbox' },
      // A link opens with Ctrl or Cmd: a plain click puts the caret in it, to write.
      handleClick: (_vista, _pos, evento) => {
        const a = evento.target instanceof Element ? evento.target.closest('a') : null;
        if (!a || !(evento.ctrlKey || evento.metaKey)) return false;
        const href = hrefSeguro(a.getAttribute('href'));
        if (href) window.open(href, '_blank', 'noopener,noreferrer');
        return true;
      },
    },
  }, [fragmento]);

  // The others' carets are drawn again when they move.
  const claveOtros = JSON.stringify(mesa.otros.map((o) => [o.id, o.nombre, o.color, o.h]));
  useEffect(() => {
    if (editor && !editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta(claveMarcas, mesa.otros));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, claveOtros]);

  // This browser's caret, for the others.
  useEffect(() => {
    if (!editor) return undefined;
    let ultima = '';
    const publicar = () => {
      const m = miMarca(editor);
      const clave = JSON.stringify(m);
      if (clave === ultima) return;
      ultima = clave;
      marcar(m);
    };
    // A block that changes type (a paragraph made code, a list, a quote) is a new one for Yjs, with the caret in the
    // same place: it goes again from there.
    const alCambiar = ({ transaction }) => {
      if (!transaction.getMeta(ySyncPluginKey)) publicar();
    };
    editor.on('selectionUpdate', publicar);
    editor.on('focus', publicar);
    editor.on('update', alCambiar);
    return () => {
      editor.off('selectionUpdate', publicar);
      editor.off('focus', publicar);
      editor.off('update', alCambiar);
      marcar(null);
    };
  }, [editor, marcar]);

  const estado = useEditorState({
    editor,
    selector: ({ editor: e }) => (e ? {
      h1: e.isActive('heading', { level: 1 }),
      h2: e.isActive('heading', { level: 2 }),
      negrita: e.isActive('bold'),
      cursiva: e.isActive('italic'),
      lista: e.isActive('bulletList'),
      numerada: e.isActive('orderedList'),
      codigo: e.isActive('code'),
      bloque: e.isActive('codeBlock'),
      link: e.isActive('link'),
      letra: letraSegura(e.getAttributes('letra').cual) ?? 'barlow',
      deshacer: e.can().undo(),
      rehacer: e.can().redo(),
      vacio: e.isEmpty,
    } : {}),
  }) ?? {};

  // «Guardar en lo mío»: the document as text with the site's formatting, once it has something.
  const { paraGuardar } = mesa;
  const tieneAlgo = estado.vacio === false;
  useEffect(() => (editor && tieneAlgo
    ? paraGuardar(() => paraGuardarDocumento(editor.getJSON(), pestanas(mesa.doc).find((p) => p.id === mesa.id)?.titulo))
    : undefined), [editor, tieneAlgo, paraGuardar, mesa.doc, mesa.id]);

  // The view: how far down, from 0 to 1, so it means the same on a phone and on a wide screen.
  const hoja = useRef(null);
  const letras = useRef(null);
  const [letrasAbiertas, setLetrasAbiertas] = useState(false);
  const { mover, soltar, vista } = mesa;
  const siguiendo = useRef(false);
  useEffect(() => {
    siguiendo.current = Boolean(vista);
  }, [vista]);
  const suave = useDesplazamientoSuave(Boolean(vista), () => hoja.current);
  useSeguir(vista, (v) => {
    const el = hoja.current;
    if (!el) return;
    suave.ir({ top: numeroEn(v.y, 0, 1, 0) * (el.scrollHeight - el.clientHeight) });
  });
  useEffect(() => mover({ y: 0 }), [mover]);
  const alDesplazar = () => {
    const el = hoja.current;
    const max = el.scrollHeight - el.clientHeight;
    mover({ y: max > 0 ? Math.round((el.scrollTop / max) * 1000) / 1000 : 0 });
  };
  // Moving by hand (wheel, finger, keys, the bar) while following someone lets go of them.
  const aMano = (e) => {
    if (!siguiendo.current) return;
    if (e.type === 'keydown' && !TECLAS_QUE_MUEVEN.has(e.key)) return;
    if (e.type === 'pointerdown' && e.target !== hoja.current) return;
    suave.parar();
    soltar();
  };

  // What the bar and the right click's menu do: the same functions.
  const cadena = () => editor.chain().focus();
  const abrirLink = () => {
    setLink({ valor: editor.getAttributes('link').href ?? '', error: '' });
  };
  // Cut and copy go through the editor's own handling; pasting needs the browser's permission to read.
  const portapapeles = (que) => {
    editor.commands.focus();
    if (!document.execCommand(que)) avisar(que === 'cut' ? `El navegador no deja cortar desde el menú. Usá ${atajo('Mod+X')}.` : `El navegador no deja copiar desde el menú. Usá ${atajo('Mod+C')}.`, 'error');
  };
  const pegar = async () => {
    try {
      const texto = await navigator.clipboard.readText();
      editor.commands.focus();
      if (texto) editor.view.pasteText(texto);
    } catch {
      avisar(`El navegador no deja pegar desde el menú. Usá ${atajo('Mod+V')}.`, 'error');
    }
  };
  const hacer = {
    h1: () => cadena().toggleHeading({ level: 1 }).run(),
    h2: () => cadena().toggleHeading({ level: 2 }).run(),
    texto: () => cadena().setParagraph().run(),
    negrita: () => cadena().toggleBold().run(),
    cursiva: () => cadena().toggleItalic().run(),
    codigo: () => cadena().toggleCode().run(),
    link: () => (link ? setLink(null) : abrirLink()),
    lista: () => cadena().toggleBulletList().run(),
    numerada: () => cadena().toggleOrderedList().run(),
    bloque: () => cadena().toggleCodeBlock().run(),
    // To what is selected, or to what is written next.
    letra: (id) => cadena().ponerLetra(id).run(),
    deshacer: () => cadena().undo().run(),
    rehacer: () => cadena().redo().run(),
  };
  const menu = useMenuContextual(hoja, {
    armar: () => {
      if (!editor) return null;
      const vacia = editor.state.selection.empty;
      const parrafo = !estado.h1 && !estado.h2 && !estado.bloque;
      return {
        etiqueta: 'Formato',
        entradas: [
          { etiqueta: 'Negrita', atajo: 'Mod+B', rol: 'check', marcado: estado.negrita, hacer: hacer.negrita },
          { etiqueta: 'Cursiva', atajo: 'Mod+I', rol: 'check', marcado: estado.cursiva, hacer: hacer.cursiva },
          { etiqueta: 'Código', atajo: 'Mod+E', rol: 'check', marcado: estado.codigo, hacer: hacer.codigo },
          { etiqueta: 'Link', rol: 'check', marcado: estado.link, hacer: hacer.link },
          '-',
          { etiqueta: 'Título', atajo: 'Mod+Alt+1', rol: 'radio', marcado: estado.h1, hacer: hacer.h1 },
          { etiqueta: 'Subtítulo', atajo: 'Mod+Alt+2', rol: 'radio', marcado: estado.h2, hacer: hacer.h2 },
          { etiqueta: 'Texto', atajo: 'Mod+Alt+0', rol: 'radio', marcado: parrafo, hacer: hacer.texto },
          '-',
          { fila: 'Tipografía', items: LETRAS.map((l) => ({ etiqueta: l.nombre, rol: 'radio', marcado: estado.letra === l.id, estilo: { fontFamily: l.pila }, hacer: () => hacer.letra(l.id) })) },
          '-',
          { etiqueta: 'Lista', atajo: 'Mod+Shift+8', rol: 'check', marcado: estado.lista, hacer: hacer.lista },
          { etiqueta: 'Lista numerada', atajo: 'Mod+Shift+7', rol: 'check', marcado: estado.numerada, hacer: hacer.numerada },
          '-',
          { etiqueta: 'Cortar', atajo: 'Mod+X', deshabilitado: vacia, hacer: () => portapapeles('cut') },
          { etiqueta: 'Copiar', atajo: 'Mod+C', deshabilitado: vacia, hacer: () => portapapeles('copy') },
          { etiqueta: 'Pegar', atajo: 'Mod+V', hacer: pegar },
        ],
      };
    },
    // From the keyboard, under the caret.
    lugarTeclado: () => {
      if (!editor) return null;
      const c = editor.view.coordsAtPos(editor.state.selection.head);
      return { x: c.left, y: c.bottom };
    },
    volverFoco: () => editor?.commands.focus(),
  });

  // The typefaces' list closes with a click outside it or with Escape.
  useEffect(() => {
    if (!letrasAbiertas) return undefined;
    const fuera = (e) => {
      if (!letras.current?.contains(e.target)) letras.current?.removeAttribute('open');
    };
    document.addEventListener('pointerdown', fuera, true);
    return () => document.removeEventListener('pointerdown', fuera, true);
  }, [letrasAbiertas]);
  const cerrarLetras = (e) => {
    if (e.key !== 'Escape' || !letras.current?.open) return;
    e.stopPropagation();
    letras.current.removeAttribute('open');
    letras.current.querySelector('summary')?.focus();
  };

  if (!editor) return null;
  const ponerLink = (e) => {
    e.preventDefault();
    const crudo = link.valor.trim();
    const href = hrefSeguro(/^[a-z][a-z0-9+.-]*:/i.test(crudo) ? crudo : `https://${crudo}`);
    if (!href) {
      setLink({ ...link, error: 'Tiene que ser una dirección web, como https://frro.utn.edu.ar.' });
      return;
    }
    if (editor.state.selection.empty && !editor.isActive('link')) {
      cadena().insertContent({ type: 'text', text: crudo, marks: [{ type: 'link', attrs: { href } }] }).run();
    } else {
      cadena().extendMarkRange('link').setLink({ href }).run();
    }
    setLink(null);
  };
  const sacarLink = () => {
    cadena().extendMarkRange('link').unsetLink().run();
    setLink(null);
  };
  const actual = hrefSeguro(editor.getAttributes('link').href);
  // Where the selected text is on screen, for the link's box.
  const anclaSeleccion = () => {
    const { from, to } = editor.state.selection;
    const a = editor.view.coordsAtPos(from);
    const b = editor.view.coordsAtPos(to);
    const left = Math.min(a.left, b.left);
    const right = Math.max(a.right, b.right);
    const top = Math.min(a.top, b.top);
    const bottom = Math.max(a.bottom, b.bottom);
    return { left, right, top, bottom, width: right - left, height: bottom - top };
  };
  const cerrarLink = () => {
    setLink(null);
    editor.commands.focus();
  };

  const bajar = (formato, e) => {
    e.currentTarget.closest('details')?.removeAttribute('open');
    const titulo = pestanas(mesa.doc).find((p) => p.id === mesa.id)?.titulo ?? 'Documento';
    const json = editor.getJSON();
    if (formato === 'md') bajarTexto(aMarkdown(json), nombreArchivo(titulo, 'md'), 'text/markdown;charset=utf-8');
    else bajarTexto(aHtml(json, titulo), nombreArchivo(titulo, 'html'), 'text/html;charset=utf-8');
  };

  return (
    <>
      {/* A click on the bar leaves the caret where it was: the focus stays in the text. */}
      <div className="vh-barra" role="toolbar" aria-label="Formato" onMouseDown={(e) => e.target.closest('summary, .vdoc-bajar:not(.vdoc-letras)') || e.preventDefault()}>
        <div className="vh-grupo">
          <Boton activo={estado.h1} onClick={hacer.h1}>Título</Boton>
          <Boton activo={estado.h2} onClick={hacer.h2}>Subtítulo</Boton>
        </div>
        <div className="vh-grupo">
          {/* Each name in its own typeface. */}
          <details ref={letras} className="vdoc-bajar vdoc-letras" onToggle={(e) => setLetrasAbiertas(e.currentTarget.open)} onKeyDown={cerrarLetras}>
            <summary className="vh-boton" title="Tipografía" aria-label={`Tipografía: ${LETRAS.find((l) => l.id === estado.letra).nombre}`}>
              <span className="vh-boton__texto" style={{ fontFamily: LETRAS.find((l) => l.id === estado.letra).pila }}>{LETRAS.find((l) => l.id === estado.letra).nombre}</span>
              <span className="vdoc-letras__flecha" aria-hidden="true">▾</span>
            </summary>
            <div className="vdoc-bajar__menu" role="group" aria-label="Tipografía">
              {LETRAS.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  className="vh-boton"
                  aria-pressed={estado.letra === l.id}
                  style={{ fontFamily: l.pila }}
                  onClick={() => {
                    letras.current?.removeAttribute('open');
                    hacer.letra(l.id);
                  }}
                >
                  {l.nombre}
                </button>
              ))}
            </div>
          </details>
        </div>
        <div className="vh-grupo">
          <Boton icono="negrita" activo={estado.negrita} onClick={hacer.negrita}>Negrita</Boton>
          <Boton icono="cursiva" activo={estado.cursiva} onClick={hacer.cursiva}>Cursiva</Boton>
          <Boton icono="codigo" activo={estado.codigo} onClick={hacer.codigo}>Código</Boton>
          <Boton icono="enlace" activo={estado.link || Boolean(link)} aria-expanded={Boolean(link)} aria-controls={idLink} onClick={hacer.link}>Link</Boton>
        </div>
        <div className="vh-grupo">
          <Boton icono="lista" activo={estado.lista} onClick={hacer.lista}>Lista</Boton>
          <Boton icono="numerada" activo={estado.numerada} onClick={hacer.numerada}>Lista numerada</Boton>
          <Boton activo={estado.bloque} aria-label="Bloque de código" title="Bloque de código" onClick={hacer.bloque}>{'{ }'}</Boton>
        </div>
        <div className="vh-grupo">
          <Boton icono="deshacer" disabled={!estado.deshacer} onClick={hacer.deshacer}>Deshacer</Boton>
          <Boton icono="rehacer" disabled={!estado.rehacer} onClick={hacer.rehacer}>Rehacer</Boton>
        </div>
        <div className="vh-grupo vh-barra__fin">
          <Boton icono="luna" activo={paginaOscura} onClick={() => cambiarDocumentoOscuro(!paginaOscura)}>Modo oscuro</Boton>
        <details className="vdoc-bajar">
          <summary className="vh-boton"><Icono nombre="bajar" /><span className="vh-boton__texto">Bajar</span></summary>
          <div className="vdoc-bajar__menu">
            <button type="button" className="vh-boton" onClick={(e) => bajar('md', e)}>Markdown (.md)</button>
            <button type="button" className="vh-boton" onClick={(e) => bajar('html', e)}>Página web (.html)</button>
          </div>
        </details>
        </div>
      </div>
      <Presentes otros={mesa.otros} />
      <div
        ref={hoja}
        className="vdoc-hoja"
        onScroll={alDesplazar}
        onWheel={aMano}
        onTouchMove={aMano}
        onKeyDown={aMano}
        onPointerDown={aMano}
      >
        {/* Next to the selected text, not on top of the page. */}
        {link && (
          <Globo dentro={hoja} ancla={anclaSeleccion} alCerrar={cerrarLink} etiqueta="Link" orden={BAJO} reserva={reservaAbajo()} enfocar>
            <form id={idLink} className="vh-globo" noValidate onSubmit={ponerLink}>
              <label>
                Dirección del link
                <input type="url" inputMode="url" value={link.valor} placeholder="https://" aria-invalid={Boolean(link.error)} aria-describedby={link.error ? `${idLink}-error` : undefined} onChange={(e) => setLink({ valor: e.target.value, error: '' })} />
              </label>
              <button type="submit" className="boton boton--chico">Poner link</button>
              {estado.link && <button type="button" className="boton boton--chico boton--secundario" onClick={sacarLink}>Sacar link</button>}
              {actual && <a className="vdoc-abrir" href={actual} target="_blank" rel="noopener noreferrer nofollow">Abrir link</a>}
              {link.error && <p id={`${idLink}-error`} className="vh-globo__error">{link.error}</p>}
            </form>
          </Globo>
        )}
        {menu}
        {/* A click on the empty part of the page writes at the end, as on paper. */}
        <div className={`vdoc-papel${paginaOscura ? ' vdoc-papel--oscuro' : ''}`} onClick={(e) => e.target === e.currentTarget && editor.commands.focus('end')}>
          <EditorContent editor={editor} />
        </div>
      </div>
    </>
  );
}

export default function Documento({ mesa }) {
  const { datos } = mesa;
  const { confirmar } = useUI();
  useCambios(datos, false);
  const fragmento = fragmentoDe(datos);
  // Made after a moment, in case someone else's is on its way: of two made at once only one stays.
  useEffect(() => {
    if (fragmento) return undefined;
    const reloj = setTimeout(() => asegurarFragmento(datos), 250 + Math.random() * 400);
    return () => clearTimeout(reloj);
  }, [datos, fragmento]);

  // Checked on every change: past the top, or with something the editor cannot show, it is not shown.
  const [estado, setEstado] = useState({ fragmento: null, como: 'ok' });
  useEffect(() => {
    if (!fragmento) return undefined;
    const ver = () => setEstado({ fragmento, como: revisar(fragmento) });
    ver();
    fragmento.observeDeep(ver);
    return () => fragmento.unobserveDeep(ver);
  }, [fragmento]);
  const como = estado.fragmento === fragmento ? estado.como : 'ok';

  useParaConsultron(mesa, () => textoPlano(fragmentoDe(datos)));

  const vaciar = async () => {
    const ok = await confirmar({ titulo: '¿Vaciar el documento?', texto: 'Se borra para todos los de la sesión.', boton: 'Vaciar' });
    if (ok) datos.set('texto', new Y.XmlFragment());
  };

  return (
    <div className="vh-herramienta vdoc">
      {!fragmento && <p className="vh-aviso">Abriendo el documento…</p>}
      {fragmento && como !== 'ok' && (
        <div className="vh-aviso">
          <p>{como === 'grande' ? 'El documento es demasiado largo para mostrarlo.' : 'El documento tiene algo que no se puede mostrar.'}</p>
          <button type="button" className="boton boton--chico boton--peligro" onClick={vaciar}>Vaciar el documento</button>
        </div>
      )}
      {fragmento && como === 'ok' && <Editor mesa={mesa} fragmento={fragmento} />}
    </div>
  );
}
