import { describe, expect, it } from 'vitest';
import { DUDA, FALLO } from '../lib/porMandar';
import { cuandoSeGuardo, textoDelAviso } from './SinInternet';

describe('when what shows was kept', () => {
  it('says today with the hour in 24 hours, and another day with its name', () => {
    const ahora = new Date(2026, 10, 21, 23, 50).getTime();
    expect(cuandoSeGuardo(new Date(2026, 10, 21, 23, 32).getTime(), ahora)).toBe('hoy a las 23:32');
    expect(cuandoSeGuardo(new Date(2026, 10, 19, 8, 5).getTime(), ahora)).toBe('el jueves 19 de noviembre a las 08:05');
  });
});

describe('the news of a message that waited', () => {
  it('says who it went to, how many went, and sends to Mensajes only when something is left to do', () => {
    expect(textoDelAviso({ tipo: 'salio', nombre: 'Laura Méndez' })).toEqual({ texto: 'Salió tu mensaje para Laura Méndez.', aMensajes: false });
    expect(textoDelAviso({ tipo: 'salio', cuantos: 3 })).toEqual({ texto: 'Salieron 3 mensajes que estaban por mandar.', aMensajes: false });
    expect(textoDelAviso({ tipo: DUDA, nombre: 'Laura' })).toEqual({ texto: 'No sabemos si salió tu mensaje para Laura.', aMensajes: true });
    expect(textoDelAviso({ tipo: FALLO })).toEqual({ texto: 'Tu mensaje no salió.', aMensajes: true });
  });
});
