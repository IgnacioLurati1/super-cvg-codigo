import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import ListaConMas, { cortar, PASO } from './ListaConMas';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const items = (n) => Array.from({ length: n }, (_, i) => ({ id: `i${i}`, nombre: `Cosa ${i}` }));

describe('cortar', () => {
  it('muestra los primeros y dice cuántos faltan', () => {
    const { visibles, faltan } = cortar(items(43), 10);
    expect(visibles.map((i) => i.id)).toEqual(items(10).map((i) => i.id));
    expect(faltan).toBe(33);
  });

  it('una lista corta va entera', () => {
    expect(cortar(items(4), 10)).toEqual({ visibles: items(4), faltan: 0 });
    expect(cortar([], 10)).toEqual({ visibles: [], faltan: 0 });
  });

  it('un adjunto va con su mensaje y no cuenta', () => {
    const lista = [{ id: 'm1' }, { id: 'a1', adjunto: true }, { id: 'm2' }, { id: 'a2', adjunto: true }, { id: 'a3', adjunto: true }, { id: 'm3' }];
    const { visibles, faltan } = cortar(lista, 2, { cuenta: (i) => !i.adjunto });
    expect(visibles.map((i) => i.id)).toEqual(['m1', 'a1', 'm2', 'a2', 'a3']);
    expect(faltan).toBe(1);
  });

  it('el que tiene el foco o recién llegó sigue a la vista, con todo lo de antes', () => {
    const { visibles, faltan } = cortar(items(30), 10, { fijos: ['i14'] });
    expect(visibles).toHaveLength(15);
    expect(visibles.at(-1).id).toBe('i14');
    expect(faltan).toBe(15);
  });
});

function Prueba({ n }) {
  const [lista, setLista] = useState(items(n));
  return (
    <>
      <button type="button" id="bajar" onClick={() => setLista((l) => [...l.slice(0, 9), l[10], l[9], ...l.slice(11)])}>Bajar</button>
      <ListaConMas items={lista} nombre="Tablón" render={(i) => <li key={i.id}><button type="button">{i.nombre}</button></li>} />
    </>
  );
}

describe('la lista con «Ver más»', () => {
  let lugar;
  let raiz;
  const filas = () => [...lugar.querySelectorAll('li')].map((li) => li.textContent);
  const boton = () => lugar.querySelector('.lista__mas button');
  beforeEach(() => {
    lugar = document.createElement('div');
    document.body.append(lugar);
    raiz = createRoot(lugar);
  });
  afterEach(() => {
    act(() => raiz.unmount());
    lugar.remove();
  });

  it('suma de a diez y el foco va a la primera que entra', () => {
    act(() => raiz.render(<Prueba n={23} />));
    expect(filas()).toHaveLength(PASO);
    expect(boton().textContent).toBe('Ver 10 más de Tablón, quedan 13');
    expect(lugar.querySelector('.lista__quedan').textContent).toBe('Quedan 13');
    act(() => boton().click());
    expect(filas()).toHaveLength(20);
    expect(document.activeElement.textContent).toBe('Cosa 10');
    expect(boton().textContent).toBe('Ver los 3 que quedan de Tablón');
    expect(lugar.querySelector('.lista__quedan')).toBeNull();
    act(() => boton().click());
    expect(filas()).toHaveLength(23);
    expect(boton()).toBeNull();
  });

  it('con uno solo de más, lo dice así', () => {
    act(() => raiz.render(<Prueba n={11} />));
    expect(boton().textContent).toBe('Ver el que queda de Tablón');
  });

  it('la fila con el foco que baja más allá de las que se ven no se va', () => {
    act(() => raiz.render(<Prueba n={15} />));
    act(() => lugar.querySelectorAll('li button')[9].focus());
    act(() => lugar.querySelector('#bajar').click());
    expect(filas()).toHaveLength(11);
    expect(filas()[10]).toBe('Cosa 9');
  });
});
