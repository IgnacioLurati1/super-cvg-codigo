import { describe, expect, it } from 'vitest';
import { adivinarTipo, tipoDe, tiposEnTexto } from './tipos';

describe('adivinarTipo', () => {
  it('reads exams, finals and deliveries from the title, with or without accents', () => {
    expect(adivinarTipo('Primer parcial')).toBe('parcial');
    expect(adivinarTipo('Recuperatorio del 2do PARCIAL')).toBe('parcial');
    expect(adivinarTipo('Coloquio integrador')).toBe('parcial');
    expect(adivinarTipo('Examen final de Física')).toBe('final');
    expect(adivinarTipo('Mesa de examen')).toBe('final');
    expect(adivinarTipo('Entrega del TP 3')).toBe('entrega');
    expect(adivinarTipo('Trabajo Práctico 2')).toBe('entrega');
    expect(adivinarTipo('Examen de laboratorio')).toBe('parcial');
  });
  it('a final delivery is a delivery, not a final', () => {
    expect(adivinarTipo('Entrega final del proyecto')).toBe('entrega');
    expect(adivinarTipo('TP final')).toBe('entrega');
  });
  it('says nothing when the title says nothing', () => {
    expect(adivinarTipo('Clase de consulta')).toBeNull();
    expect(adivinarTipo('Finalizar inscripción')).toBeNull();
    expect(adivinarTipo('Partido')).toBeNull();
    expect(adivinarTipo(undefined)).toBeNull();
  });
});

describe('tipoDe', () => {
  it('the chosen kind wins over the title', () => {
    expect(tipoDe({ titulo: 'Parcial', tipo: 'otro' })).toBe('otro');
    expect(tipoDe({ titulo: 'Algo', tipo: 'final' })).toBe('final');
    expect(tipoDe({ titulo: 'Parcial 1' })).toBe('parcial');
    expect(tipoDe({ titulo: 'Algo', tipo: 'inventado' })).toBe('otro');
  });
});

describe('tiposEnTexto', () => {
  it('names the marked kinds of a day, in order', () => {
    expect(tiposEnTexto([{ titulo: 'TP 1' }, { titulo: 'Parcial' }])).toBe('parcial y entrega');
    expect(tiposEnTexto([{ titulo: 'Parcial' }, { titulo: 'Final' }, { titulo: 'TP' }])).toBe('parcial, final y entrega');
    expect(tiposEnTexto([{ titulo: 'Clase' }])).toBe('');
  });
});
