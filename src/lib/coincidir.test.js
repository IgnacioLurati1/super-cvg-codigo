import { describe, expect, it } from 'vitest';
import { coincidencias } from './coincidir';

const MATERIAS = ['Análisis Matemático I', 'Física I', 'Física II', 'Bases de Datos', 'Sistemas Operativos', 'Álgebra y Geometría Analítica', 'Comunicación de Datos']
  .map((nombre, i) => ({ valor: `m${i}`, nombre }));
const nombres = (lista) => lista.map((o) => o.nombre);
const marcado = (o) => o.partes.filter((p) => p.marca).map((p) => p.texto);

describe('elegir escribiendo una parte del nombre', () => {
  it('palabras sueltas en cualquier orden, sin mayúsculas ni acentos', () => {
    const [bases] = coincidencias(MATERIAS, 'datos BASES');
    expect(bases.nombre).toBe('Bases de Datos');
    expect(marcado(bases)).toEqual(['Bases', 'Datos']);
    expect(nombres(coincidencias(MATERIAS, 'fisica'))).toEqual(['Física I', 'Física II']);
    const [algebra] = coincidencias(MATERIAS, 'ALGEBRA geo');
    expect(algebra.nombre).toBe('Álgebra y Geometría Analítica');
    expect(marcado(algebra)).toEqual(['Álgebra', 'Geo']);
    expect(algebra.partes.map((p) => p.texto).join('')).toBe('Álgebra y Geometría Analítica');
  });

  it('también por el medio de una palabra, pero primero las que empiezan con lo escrito', () => {
    expect(nombres(coincidencias(MATERIAS, 'sis'))).toEqual(['Sistemas Operativos', 'Análisis Matemático I']);
    expect(nombres(coincidencias(MATERIAS, 'datos'))).toEqual(['Bases de Datos', 'Comunicación de Datos']);
  });

  it('marca cada palabra una vez, donde empieza una palabra si puede', () => {
    expect(marcado(coincidencias([{ nombre: 'Análisis de Sistemas' }], 'sis')[0])).toEqual(['Sis']);
    expect(marcado(coincidencias([{ nombre: 'Bases de Datos' }], 'datos s')[0])).toEqual(['s', 'Datos']);
  });

  it('sin nada escrito, todas y en su orden; con algo que no está, ninguna', () => {
    expect(nombres(coincidencias(MATERIAS, '  '))).toEqual(nombres(MATERIAS));
    expect(coincidencias(MATERIAS, '')[0].partes).toEqual([{ texto: 'Análisis Matemático I', marca: false }]);
    expect(coincidencias(MATERIAS, 'quimica')).toEqual([]);
    expect(coincidencias(MATERIAS, 'bases quimica')).toEqual([]);
  });

  it('un nombre escrito con el acento aparte se marca entero', () => {
    const [o] = coincidencias([{ valor: 'x', nombre: 'Física' }], 'fisica');
    expect(marcado(o)).toEqual(['Física']);
  });
});
