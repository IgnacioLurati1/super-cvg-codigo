import { afterEach, describe, expect, it, vi } from 'vitest';
import { armarPdf } from '../pdfDeEjemplo';
import { llevarALaSesion } from './apunte';
import { leerPedido, llevarMateria, pedirArchivo } from './materiaMesa';
import { pestanas } from './mesa';
import { anotarOrigen, olvidarOrigenes, origenAnotado, origenDe } from './origenes';
import { recuperacion, recuperar } from './recuperar';
import { CADA_CAMBIOS, CADA_CONCIENCIA, crearSesion, ESPERA_NADIE, redesLocales } from './sesion';

// After a reload, what this browser shared and nobody else has comes back by itself, from where it came.

const grupos = () => [{ nombre: 'Unidad 1', items: [{ tipo: 'archivo', nombre: 'Guía 1', archivo: 'guia-1.pdf', mime: 'application/pdf', traer: async () => pdf() }] }];
vi.mock('./deTusMaterias', () => ({ seccionesDe: async () => grupos() }));
vi.mock('../mio', () => ({ mioActual: () => ({}), usuarioActual: () => 5 }));

// jsdom's Blob has no arrayBuffer(); the browser's does.
if (!Blob.prototype.arrayBuffer) {
  Blob.prototype.arrayBuffer = function arrayBuffer() {
    return new Promise((listo) => {
      const lector = new FileReader();
      lector.onload = () => listo(lector.result);
      lector.readAsArrayBuffer(this);
    });
  };
}

const pdf = () => new Blob([armarPdf([{ parrafos: ['Ley de Ohm.'] }])], { type: 'application/pdf' });
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const PERSONA = '0123456789abcdef';
const abiertas = [];
afterEach(() => {
  abiertas.splice(0).forEach((s) => s.cerrar());
  olvidarOrigenes();
  vi.useRealTimers();
});

// Who shares, and another one only through Realtime (so nobody else gets a copy before the reload).
function conRecarga() {
  const redes = redesLocales(3);
  redes[1].directa = false;
  redes[2].abierta = false;
  const [antes, otro] = redes.slice(0, 2).map((red, k) => crearSesion({ red, yo: { id: k === 0 ? PERSONA : undefined, nombre: `Alumno ${k}` } }));
  abiertas.push(antes, otro);
  return {
    antes,
    otro,
    async recargar() {
      redes[0].mandar = () => {};
      redes[0].cerrar();
      await esperar(20);
      redes[2].abierta = true;
      const despues = crearSesion({ red: redes[2], yo: { id: PERSONA, nombre: 'Alumno 0' } });
      abiertas.push(despues);
      redes.forEach((o) => o.abierta && o.pares?.(new Set(redes.filter((x) => x !== o && x.abierta).map((x) => x.yo))));
      await esperar(CADA_CONCIENCIA + 50);
      return despues;
    },
  };
}
// Past the moment the others have to say they have it.
const pasado = (s) => {
  vi.setSystemTime(Date.now() + ESPERA_NADIE);
  s.avisar();
};
const archivoDe = (s, titulo) => s.doc.getMap(`h:${pestanas(s.doc).find((p) => p.titulo === titulo).id}`).get('archivo');

describe('volver después de recargar', () => {
  it('de dónde vino cada cosa, solo con números', () => {
    expect(origenDe({ id: '7-11-/apunte.pdf', clave: '11', direccion: 'https://campus/x.pdf?token=SECRETO', nombre: 'Apunte' })).toEqual({ m: 7, c: '11' });
    expect(origenDe({ propio: true, archivoId: 'b1', archivo: 'mio.pdf' })).toEqual({ b: 'b1', n: 'mio.pdf' });
    expect(origenDe({ nombre: 'de la compu' })).toBeNull();
    anotarOrigen('m:abc', { m: 'p12' });
    expect(origenAnotado('m:abc')).toEqual({ m: 'p12' });
    expect(JSON.stringify(sessionStorage)).not.toMatch(/SECRETO|campus/);
  });

  it('un archivo del campus que nadie más tenía vuelve solo, del campus, y le llega a los demás', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { antes, otro, recargar } = conRecarga();
    await esperar(CADA_CONCIENCIA + 50);
    llevarALaSesion(antes, pdf(), 'CPM-PERT', { m: 7, c: '11' });
    await esperar(CADA_CAMBIOS + 50);
    const despues = await recargar();
    const traer = vi.fn(async () => pdf());
    recuperar(despues, traer);
    const id = archivoDe(despues, 'CPM-PERT');
    const llega = otro.archivos.pedir(id, PERSONA);
    expect(traer).not.toHaveBeenCalled();
    pasado(despues);
    expect(traer).toHaveBeenCalledWith({ m: 7, c: '11' });
    expect(recuperacion(id)).toBe('trayendo');
    expect((await llega).size).toBe(pdf().size);
    expect(despues.archivos.estado(id).tiene).toBe(true);
    expect(recuperacion(id)).toBeNull();
  });

  it('uno de la compu no tiene cómo volver: pide elegirlo de nuevo', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { antes, recargar } = conRecarga();
    await esperar(CADA_CONCIENCIA + 50);
    llevarALaSesion(antes, pdf(), 'Subido');
    await esperar(CADA_CAMBIOS + 50);
    const despues = await recargar();
    const traer = vi.fn();
    recuperar(despues, traer);
    pasado(despues);
    expect(recuperacion(archivoDe(despues, 'Subido'))).toBe('elegir');
    expect(traer).not.toHaveBeenCalled();
  });

  it('una materia vuelve a atender lo que le piden, buscando cada archivo por su nombre', async () => {
    const { antes, otro, recargar } = conRecarga();
    await esperar(CADA_CONCIENCIA + 50);
    const pestana = llevarMateria(antes, 'Física', grupos(), 7);
    await esperar(CADA_CAMBIOS + 50);
    const despues = await recargar();
    recuperar(despues);
    await esperar(20);
    pedirArchivo(otro.doc, otro.doc.getMap(`h:${pestana}`), otro.yo, 'i0');
    await esperar(CADA_CAMBIOS * 3 + 100);
    const pedido = leerPedido(otro.doc.getMap(`h:${pestana}`), 'i0');
    expect(pedido).toMatchObject({ estado: 'listo' });
    expect(pestanas(otro.doc).some((p) => p.id === pedido.pestana && p.tipo === 'apunte')).toBe(true);
  });
});
