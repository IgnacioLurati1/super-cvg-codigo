import { describe, expect, it } from 'vitest';
import { altoALaVista, subidaSobreTeclado } from './sobreTeclado';

// A phone 800 tall: the reader from 60 to 650 (the file's buttons under it), the keyboard taking the last 330.
const lector = { top: 60, bottom: 650 };

describe('the note sheet over the keyboard', () => {
  it('stays in its place without a keyboard', () => {
    expect(subidaSobreTeclado(lector, { offsetTop: 0, height: 800 })).toBe(0);
  });

  it('rises by what the keyboard covers of the reader', () => {
    expect(subidaSobreTeclado(lector, { offsetTop: 0, height: 470 })).toBe(180);
    expect(altoALaVista(lector, { offsetTop: 0, height: 470 })).toBe(410);
  });

  it('counts the page the browser moved up to show the field', () => {
    expect(subidaSobreTeclado(lector, { offsetTop: 40, height: 470 })).toBe(140);
    expect(altoALaVista(lector, { offsetTop: 40, height: 470 })).toBe(450);
  });

  it('a keyboard that does not reach the reader leaves it alone', () => {
    expect(subidaSobreTeclado(lector, { offsetTop: 0, height: 700 })).toBe(0);
  });
});
