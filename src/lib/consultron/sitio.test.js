import { describe, expect, it } from 'vitest';
import { elegirCalculo } from './calculos';
import { PANTALLAS } from './guia';
import { delSitio, pantallaDe } from './sitio';

const conCalculo = (q, donde = null) => delSitio(q, { donde, calculo: elegirCalculo(q)?.calculo });

describe('Consultron and Super CVG itself', () => {
  it('a question about a calculator is answered with it, without the notes', () => {
    const r = conCalculo('¿Sabés usar la calculadora de cola simple?');
    expect(r.solo).toBe(true);
    expect(r.piezas[0].trozo.fuente).toMatchObject({ tipo: 'calculadora', nombre: 'Cola simple (M/M/1)', a: '/calculadoras/proximo-evento' });
    expect(r.piezas[0].trozo.texto).toMatch(/tiempos entre arribos/i);
    expect(r.piezas[0].trozo.texto).toMatch(/Simulación/);
  });

  it('«esta página» is the screen the student has open', () => {
    const r = delSitio('Que es esta pagina', { donde: '/calculadoras/subred' });
    expect(r.solo).toBe(true);
    expect(r.piezas[0].trozo.fuente).toMatchObject({ tipo: 'calculadora', a: '/calculadoras/subred', abierta: true });
    const consultron = delSitio('¿Qué es esta pantalla?', { donde: '/consultron' });
    expect(consultron.piezas[0].trozo.doc).toBe(pantallaDe('/consultron').doc);
    expect(delSitio('¿qué hago acá?', { donde: '/materias/12' }).piezas[0].trozo.doc).toBe(pantallaDe('/materias/12').doc);
  });

  it('the calculators that there are', () => {
    const r = delSitio('¿Qué calculadoras hay?');
    expect(r.solo).toBe(true);
    expect(r.piezas[0].trozo.fuente.a).toBe('/calculadoras');
    expect(r.piezas[0].trozo.texto).toMatch(/Cola simple \(M\/M\/1\)/);
  });

  it('a question of a subject is not about the site', () => {
    expect(delSitio('¿Qué es un monitor?')).toEqual({ piezas: [], solo: false });
    expect(delSitio('¿Qué son los mensajes ICMP?').piezas).toEqual([]);
    expect(delSitio('¿Qué es una página en memoria virtual?').solo).toBe(false);
    expect(delSitio('¿Cómo hago una integral por partes?').piezas).toEqual([]);
  });

  it('every screen of the guide is found by its address, and links only where it can go', () => {
    for (const p of PANTALLAS.filter((x) => x.ruta)) {
      const direccion = p.ruta.replace(/:[^/]+/g, '7');
      expect(pantallaDe(direccion)?.fuente.nombre, direccion).toBe(p.nombre);
    }
    expect(pantallaDe('/materias/7').fuente.a).toBe(null);
    expect(pantallaDe('/no-existe')).toBe(null);
  });
});
