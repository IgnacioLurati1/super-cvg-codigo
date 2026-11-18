import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { leerDelDom, pantallaAhora, pantallaEnTexto, pideAlgoNuevo, senalaLaPantalla, textoAccesible, usePantallaDeConsultron } from './pantalla';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// The screens drawn in each test, taken out after it.
let abiertas = [];
function render(elemento) {
  const container = document.createElement('div');
  document.body.append(container);
  const raiz = createRoot(container);
  act(() => raiz.render(elemento));
  const unmount = () => {
    act(() => raiz.unmount());
    container.remove();
  };
  abiertas.push(unmount);
  return { container, unmount, rerender: (otro) => act(() => raiz.render(otro)) };
}
afterEach(() => {
  abiertas.forEach((cerrar) => cerrar());
  abiertas = [];
});

// A calculator as Hoja.jsx draws it: the fields above, the sheet with the answer and its steps below.
function Calculadora() {
  return (
    <article data-consultron-pantalla="">
      <h1>Colas M/M/1</h1>
      <p>Una cola con un servidor.</p>
      <label htmlFor="llegadas">Llegadas por hora</label>
      <input id="llegadas" defaultValue="3" />
      <label>
        Servicios por hora
        <input defaultValue="5" />
      </label>
      <label htmlFor="disciplina">Disciplina</label>
      <select id="disciplina" defaultValue="fifo">
        <option value="fifo">Primero en llegar</option>
        <option value="lifo">Último en llegar</option>
      </select>
      <fieldset>
        <legend>Unidad</legend>
        <label><input type="radio" name="u" defaultChecked /> Horas</label>
        <label><input type="radio" name="u" /> Minutos</label>
      </fieldset>
      <label><input type="checkbox" defaultChecked /> Mostrar pasos</label>
      <label><input type="checkbox" /> Cola finita</label>
      <input aria-label="Sin valor" defaultValue="" />
      <input type="hidden" defaultValue="oculto" />
      <button type="button">Calcular</button>
      <section className="calc-hoja">
        <h2 className="solo-lectores">La resolución</h2>
        <div className="calc-hoja__resultado">
          <p className="calc-hoja__respuesta">
            <span aria-hidden="true">ρ = 0,6</span>
            <span className="solo-lectores">La utilización es 0,6</span>
          </p>
        </div>
        <ol className="calc-hoja__pasos">
          <li>
            <h3>Utilización</h3>
            <div>
              Se divide{' '}
              <span className="katex">
                <span className="katex-mathml">
                  <math><semantics><mrow><mi>λ</mi></mrow><annotation encoding="application/x-tex">{'\\rho = \\frac{\\lambda}{\\mu}'}</annotation></semantics></math>
                </span>
                <span className="katex-html" aria-hidden="true">ρ=λμ</span>
              </span>
            </div>
          </li>
          <li>
            <h3>Tabla</h3>
            <table><tbody><tr><th>n</th><th>Pn</th></tr><tr><td>0</td><td>0,4</td></tr></tbody></table>
            <svg role="img" aria-label="Gráfico de la cola"><text>12</text></svg>
            <button type="button">Copiar</button>
            <input defaultValue="no es un dato" aria-label="Dentro de la hoja" />
          </li>
        </ol>
      </section>
    </article>
  );
}

describe('lo que hay en pantalla, leído de la página', () => {
  it('cada campo con su etiqueta y la hoja como la oye un lector de pantalla', () => {
    const { container } = render(<Calculadora />);
    const p = leerDelDom(container.querySelector('article'));
    expect(p.titulo).toBe('Colas M/M/1');
    expect(p.datos).toEqual([
      ['Llegadas por hora', '3'],
      ['Servicios por hora', '5'],
      ['Disciplina', 'Primero en llegar'],
      ['Unidad', 'Horas'],
      ['Mostrar pasos', 'sí'],
    ]);
    expect(p.resultado).toEqual([['', 'La resolución\nLa utilización es 0,6\nUtilización\nSe divide \\rho = \\frac{\\lambda}{\\mu}\nTabla\nn | Pn\n0 | 0,4\nGráfico de la cola']]);
    expect(leerDelDom(null)).toBeNull();
  });

  it('sin nada que leer, texto vacío', () => {
    expect(textoAccesible(null)).toBe('');
    const { container } = render(<div><span aria-hidden="true">dibujo</span><canvas /></div>);
    expect(textoAccesible(container)).toBe('');
  });
});

describe('la pantalla como texto para Consultron', () => {
  it('los datos, el resultado y las notas, cada cosa con su nombre', () => {
    const texto = pantallaEnTexto({ titulo: 'Graficadora', datos: [['f(x)', 'x^2 - 4'], ['Vacío', '  ']], resultado: [['Raíces', 'x = -2 y x = 2'], ['', 'Es una parábola.']], notas: ' La ventana va de -5 a 5. ' });
    expect(texto).toBe(
      'Graficadora de Super CVG, como la tiene ahora el alumno en su pantalla.\n\nDatos que cargó:\n- f(x): x^2 - 4\n\nLo que muestra como resultado, con sus pasos:\n- Raíces: x = -2 y x = 2\nEs una parábola.\n\nLa ventana va de -5 a 5.',
    );
  });

  it('dice lo que falta, y vacía no es nada', () => {
    expect(pantallaEnTexto({ titulo: 'Bisección', datos: [['a', '1']] })).toContain('Todavía no muestra un resultado.');
    expect(pantallaEnTexto({ titulo: 'Bisección', resultado: [['x', '1,5']] })).toContain('Todavía no cargó datos.');
    expect(pantallaEnTexto({ titulo: 'Bisección' })).toBe('');
    expect(pantallaEnTexto()).toBe('');
  });
});

describe('pantallaAhora', () => {
  it('lee la pantalla marcada', () => {
    render(<Calculadora />);
    const { nombre, texto } = pantallaAhora();
    expect(nombre).toBe('Colas M/M/1');
    expect(texto).toContain('- Llegadas por hora: 3');
    expect(texto).toContain('La utilización es 0,6');
  });

  it('sin pantalla para leer, o sin nada cargado, nada', () => {
    expect(pantallaAhora()).toBeNull();
    render(<article data-consultron-pantalla=""><h1>Vacía</h1></article>);
    expect(pantallaAhora()).toBeNull();
  });

  it('lo que la pantalla dice por sí misma va por encima de lo leído, con lo último que mostró', () => {
    function Graficadora({ f }) {
      usePantallaDeConsultron({ titulo: undefined, datos: [['f(x)', f]], resultado: [['Raíces', 'x = 2']], notas: '' });
      return (
        <article data-consultron-pantalla="">
          <h1>Graficadora 3D</h1>
          <input aria-label="Del dibujo" defaultValue="no va" />
          <canvas />
        </article>
      );
    }
    const { rerender, unmount } = render(<Graficadora f="x - 1" />);
    rerender(<Graficadora f="x - 2" />);
    const { nombre, texto } = pantallaAhora();
    expect(nombre).toBe('Graficadora 3D');
    expect(texto).toContain('- f(x): x - 2');
    expect(texto).toContain('- Raíces: x = 2');
    expect(texto).not.toContain('no va');
    // Closed, it says nothing more.
    unmount();
    expect(pantallaAhora()).toBeNull();
  });

  it('una lista vacía que dice la pantalla no tapa lo leído, y un campo que no está a la vista no se lee', () => {
    function Vacia() {
      usePantallaDeConsultron({ titulo: 'Graficadora', datos: [], resultado: [], notas: '' });
      return (
        <article data-consultron-pantalla="">
          <input aria-label="A la vista" defaultValue="x + 1" />
          <input aria-label="De otra pestaña" defaultValue="oculto" ref={(el) => el && (el.checkVisibility = () => false)} />
        </article>
      );
    }
    const { unmount } = render(<Vacia />);
    const { texto } = pantallaAhora();
    expect(texto).toContain('- A la vista: x + 1');
    expect(texto).not.toContain('oculto');
    unmount();
  });
});

describe('una pregunta que señala la pantalla', () => {
  it('lo suyo o esto con su nombre, esto, acá, lo que le salió y una pista', () => {
    for (const p of ['¿Qué hace mi programa y qué imprime?', '¿Está bien esto?', '¿Por qué me da error?', 'Explicame este gráfico', '¿Qué puse mal acá?', '¿POR QUÉ ME TIRA ESO?', '¿Qué significan estos resultados?', 'arreglá mi código', '¿Qué hay en pantalla?', 'Dame una pista'])
      expect(senalaLaPantalla(p)).toBe(true);
  });

  it('un pedido de escribir algo nuevo no, aunque diga «escribí» o «mi»', () => {
    for (const p of ['escribi un codigo donde dice hola mundo y un bucle de 5 iteraciones diciende soy feo', 'Escribí un programa que imprima mi nombre', 'haceme una función que sume dos números', 'armame un bucle que cuente hasta 10'])
      expect(senalaLaPantalla(p)).toBe(false);
  });

  it('una pregunta del tema no', () => {
    for (const p of ['¿Qué asíntotas tiene y dónde corta a los ejes?', '¿Qué es un semáforo?', '¿Cómo está armado el estudio?', 'Estar en el quórum', 'Las mismas cuentas', '¿Cuándo es mi parcial?', '', null]) expect(senalaLaPantalla(p)).toBe(false);
  });
});

describe('una pregunta que pide algo nuevo', () => {
  it('un verbo de hacer y «un», «una» u «otro»', () => {
    for (const p of ['escribi un codigo donde dice hola mundo y un bucle de 5 iteraciones diciende soy feo', 'Haceme un programa que sume dos números', 'Armame una función que cuente vocales', 'dame otro ejemplo', 'Necesito un script que lea un archivo'])
      expect(pideAlgoNuevo(p)).toBe(true);
  });

  it('una pregunta sobre lo que hay, no', () => {
    for (const p of ['¿Qué asíntotas tiene y dónde corta a los ejes?', '¿Cuál es el dominio?', '¿Cuánto vale la función en P y cuál es el plano tangente?', '¿Qué hace mi programa y qué imprime?', '¿Por qué falla?', 'Armame el estudio completo', '', null])
      expect(pideAlgoNuevo(p)).toBe(false);
  });
});

describe('pedir algo nuevo con «te» al final del verbo', () => {
  it('«inventate», «armate» y «hacete» también', () => {
    for (const p of ['Inventate un programa que sume', 'armate una función', 'hacete un ejemplo']) expect(pideAlgoNuevo(p)).toBe(true);
  });
});

describe('screens over screens', () => {
  it('the last one opened is read, and closing it gives the one under back; «sola» comes along', () => {
    function Abajo() {
      usePantallaDeConsultron({ titulo: 'Repaso', datos: [['Para hoy', '5 tarjetas']] });
      return null;
    }
    function Arriba() {
      usePantallaDeConsultron({ titulo: 'Tu carrera', datos: [['Podés cursar', 'Legislación']], sola: true });
      return null;
    }
    const abajo = render(<Abajo />);
    const arriba = render(<Arriba />);
    expect(pantallaAhora()).toMatchObject({ nombre: 'Tu carrera', sola: true });
    arriba.unmount();
    expect(pantallaAhora()).toMatchObject({ nombre: 'Repaso', sola: false });
    abajo.unmount();
    expect(pantallaAhora()).toBeNull();
  });
});
