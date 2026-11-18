import { describe, expect, it } from 'vitest';
import { CALCULOS } from './calculos';
import { aplanar, ejemploPara, elegirEjemplo, otroEjemplo } from './ejemplos';

const calculo = (slug) => CALCULOS.find((c) => c.slug === slug);

describe('aplanar', () => {
  it('una lista queda igual, sin modelo', () => {
    expect(aplanar([{ nombre: 'Uno', red: 'x' }, { nombre: 'Dos' }])).toEqual([{ nombre: 'Uno', modo: null }, { nombre: 'Dos', modo: null }]);
  });

  it('una por modelo, con su modelo, sea una lista o uno solo', () => {
    expect(aplanar({ poisson: [{ nombre: 'Llamadas' }], basico: { nombre: 'Mussi' } })).toEqual([
      { nombre: 'Llamadas', modo: 'poisson' },
      { nombre: 'Mussi', modo: 'basico' },
    ]);
  });
});

describe('elegirEjemplo', () => {
  const lista = [{ nombre: '8 áreas', modo: null }, { nombre: '5 hosts por subred', modo: null }];

  it('el que comparte más palabras con la pregunta', () => {
    expect(elegirEjemplo(lista, '¿Cuántos hosts entran en cada subred?').nombre).toBe('5 hosts por subred');
  });

  it('sin palabras en común, el primero', () => {
    expect(elegirEjemplo(lista, '¿Qué es una máscara?').nombre).toBe('8 áreas');
    expect(elegirEjemplo([], 'algo')).toBeNull();
  });

  it('cuenta el nombre del modelo', () => {
    const modos = [{ nombre: 'Cinco personas', modo: 'binomial' }, { nombre: 'Llamadas', modo: 'poisson' }];
    expect(elegirEjemplo(modos, '¿Qué es la distribución de Poisson?', { poisson: 'Poisson' })).toEqual({ nombre: 'Llamadas', modo: 'poisson' });
  });
});

describe('ejemploPara', () => {
  it('uno de los «Probá con» de la calculadora, en el modelo de la pregunta', async () => {
    const e = await ejemploPara(calculo('probabilidades'), '¿Para qué sirve la distribución exponencial?');
    expect(e).toMatchObject({ slug: 'probabilidades', clave: 'calc:probabilidades', modo: 'exponencial' });
    expect(['Interrupciones', 'Fusibles']).toContain(e.ejemplo);
  });

  it('todas las calculadoras de Consultron tienen uno', async () => {
    for (const c of CALCULOS) expect(await ejemploPara(c, ''), c.slug).not.toBeNull();
  });
});

describe('otro ejemplo cada vez', () => {
  const lista = [{ nombre: 'a' }, { nombre: 'b' }, { nombre: 'c' }];

  it('deja afuera los que ya dio mientras queden otros', () => {
    for (const azar of [() => 0, () => 0.5, () => 0.99]) expect(otroEjemplo(lista, ['a', 'c'], azar).nombre).toBe('b');
    expect(otroEjemplo(lista, [], () => 0).nombre).toBe('a');
  });

  it('con todos dados, cualquiera menos el último', () => {
    for (const azar of [() => 0, () => 0.5, () => 0.99]) expect(otroEjemplo(lista, ['a', 'b', 'c'], azar).nombre).not.toBe('c');
    expect(otroEjemplo([{ nombre: 'a' }], ['a']).nombre).toBe('a');
    expect(otroEjemplo([], ['a'])).toBeNull();
  });

  it('el de una calculadora, sin repetir el que ya dio', async () => {
    const matriz = CALCULOS.find((c) => c.slug === 'matriz');
    const dados = [];
    for (let i = 0; i < 12; i += 1) dados.push((await ejemploPara(matriz, 'Dame otro ejemplo', { otro: true })).ejemplo);
    for (let i = 1; i < dados.length; i += 1) expect(dados[i]).not.toBe(dados[i - 1]);
    // Its five go by before one comes back.
    expect(new Set(dados.slice(0, 5)).size).toBe(5);
  });
});
