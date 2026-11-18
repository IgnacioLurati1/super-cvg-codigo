import { describe, expect, it } from 'vitest';
import { idaYVuelta } from './idaYVuelta';

const TIPOS = ['dni', 'pasaporte'];
const bien = {
  aFormulario: ({ tipo, numero }) => ({ tipo: TIPOS.includes(tipo) ? tipo : 'otro', otro: TIPOS.includes(tipo) ? '' : tipo, numero }),
  aDatos: ({ tipo, otro, numero }) => ({ tipo: tipo === 'otro' ? otro : tipo, numero }),
};
const ejemplos = [{ tipo: 'dni', numero: '1' }, { tipo: 'libreta', numero: '2' }];

describe('ida y vuelta de un formulario', () => {
  it('pasa si al editar y guardar queda igual, también con «otro»', () => {
    expect(idaYVuelta({ ...bien, ejemplos })).toEqual([]);
  });

  it('agarra la opción que se pierde al editar', () => {
    const mal = { ...bien, aFormulario: ({ tipo, numero }) => ({ tipo: TIPOS.includes(tipo) ? tipo : 'dni', otro: '', numero }) };
    expect(idaYVuelta({ ...mal, ejemplos })).toHaveLength(1);
  });

  it('sin ejemplos no da por bueno', () => {
    expect(idaYVuelta({ ...bien, ejemplos: [] })).toEqual(['sin ejemplos']);
  });
});
