// What Consultron proposes for the file open in the lab, marked in its own editor before it's applied: the lines that
// go out, struck, and the ones that come in, under them. Above, «Aplicar» and «Descartar» for that file. The editor of
// the lab doesn't know about it: this is added to it from outside (StateEffect.appendConfig), so the lab stays as it is.
// The text in the editor doesn't change until the student applies: then it's one change, which Ctrl+Z undoes. Its look
// is in codigo.css.
import { StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView, WidgetType } from '@codemirror/view';
import { cuentas, diferencia } from '../../lib/consultron/diferencia';

const poner = StateEffect.define();

const QUITA = Decoration.line({ class: 'cvg-dif__quita', attributes: { 'data-dif': 'quita', 'aria-description': 'Línea que quita Consultron' } });

class Sumadas extends WidgetType {
  constructor(lineas) {
    super();
    this.lineas = lineas;
  }

  eq(otro) {
    return otro.lineas.join('\n') === this.lineas.join('\n');
  }

  toDOM() {
    const caja = document.createElement('div');
    caja.className = 'cvg-dif__suma';
    caja.setAttribute('data-dif', 'suma');
    for (const l of this.lineas) {
      const fila = document.createElement('div');
      fila.className = 'cvg-dif__fila';
      // What a screen reader says of each line; the sign is for the eyes.
      fila.setAttribute('role', 'group');
      fila.setAttribute('aria-label', `Línea que suma Consultron: ${l || 'vacía'}`);
      fila.textContent = l || ' ';
      caja.append(fila);
    }
    return caja;
  }

  ignoreEvent() {
    return false;
  }
}

class Barra extends WidgetType {
  constructor(propuesta, suma, quita) {
    super();
    this.propuesta = propuesta;
    this.suma = suma;
    this.quita = quita;
  }

  eq(otro) {
    return otro.propuesta === this.propuesta && otro.suma === this.suma && otro.quita === this.quita;
  }

  toDOM() {
    const barra = document.createElement('div');
    barra.className = 'cvg-dif__barra';
    barra.setAttribute('role', 'group');
    barra.setAttribute('aria-label', 'Cambios de Consultron en este archivo');
    const texto = document.createElement('span');
    texto.textContent = `Consultron propone cambios: +${this.suma} −${this.quita}`;
    barra.append(texto);
    const boton = (nombre, clase, accion) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `boton boton--chico ${clase}`;
      b.textContent = nombre;
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', (e) => {
        e.preventDefault();
        accion();
      });
      return b;
    };
    barra.append(boton('Aplicar', 'cvg-dif__aplicar', () => this.propuesta.alAplicar()), boton('Descartar', 'boton--secundario', () => this.propuesta.alDescartar()));
    return barra;
  }

  ignoreEvent() {
    return true;
  }
}

function decorar(doc, propuesta) {
  if (!propuesta) return Decoration.none;
  const lineas = diferencia(doc.toString(), propuesta.despues);
  const { suma, quita } = cuentas(lineas);
  if (!suma && !quita) return Decoration.none;
  const piezas = [Decoration.widget({ widget: new Barra(propuesta, suma, quita), block: true, side: -2 }).range(0)];
  let ultima = 0;
  let juntas = [];
  const soltar = () => {
    if (!juntas.length) return;
    const pos = ultima ? doc.line(ultima).to : 0;
    piezas.push(Decoration.widget({ widget: new Sumadas(juntas), block: true, side: ultima ? 1 : -1 }).range(pos));
    juntas = [];
  };
  for (const l of lineas) {
    if (l.tipo === 'suma') {
      juntas.push(l.texto);
      continue;
    }
    soltar();
    ultima = l.en;
    if (l.tipo === 'quita') piezas.push(QUITA.range(doc.line(l.en).from));
  }
  soltar();
  return Decoration.set(piezas, true);
}

const campo = StateField.define({
  create: () => ({ propuesta: null, marcas: Decoration.none }),
  update(valor, tr) {
    let { propuesta } = valor;
    let cambia = tr.docChanged;
    for (const e of tr.effects) {
      if (e.is(poner)) {
        propuesta = e.value;
        cambia = true;
      }
    }
    return cambia ? { propuesta, marcas: decorar(tr.state.doc, propuesta) } : valor;
  },
  provide: (f) => EditorView.decorations.from(f, (v) => v.marcas),
});

const configurados = new WeakSet();

/** The editor inside `raiz` (the lab's), or null. */
export function vistaEn(raiz) {
  const contenido = raiz?.querySelector('.cm-content');
  return (contenido && EditorView.findFromDOM(contenido)) || null;
}

/**
 * Marks in the editor inside `raiz` the proposal for its file: { despues, alAplicar, alDescartar }, or null to clear.
 * Only dispatches if it changes.
 */
export function mostrarEnEditor(raiz, propuesta) {
  const v = vistaEn(raiz);
  if (!v) return;
  if (!configurados.has(v)) {
    if (!propuesta) return;
    configurados.add(v);
    v.dispatch({ effects: StateEffect.appendConfig.of(campo) });
  }
  const antes = v.state.field(campo, false)?.propuesta ?? null;
  if (antes === propuesta || (antes && propuesta && antes.despues === propuesta.despues)) return;
  v.dispatch({ effects: poner.of(propuesta) });
}

/** Writes `texto` as the whole file in the editor inside `raiz`, as one change that Ctrl+Z undoes. False if no editor. */
export function escribirEnEditor(raiz, texto) {
  const v = vistaEn(raiz);
  if (!v || v.state.readOnly) return false;
  if (v.state.doc.toString() === texto) return true;
  v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: texto }, userEvent: 'input.consultron' });
  return v.state.doc.toString() === texto;
}
