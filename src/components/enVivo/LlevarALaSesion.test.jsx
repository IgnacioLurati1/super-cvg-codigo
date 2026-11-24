import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { armarPdf } from '../../lib/pdfDeEjemplo';
import { datosDeApunte } from '../../lib/enVivo/apunte';
import { fijarSesionEnVivo, useSesionEnVivo } from '../../lib/enVivo/estado';
import { pestanas } from '../../lib/enVivo/mesa';
import { CADA_CAMBIOS, crearSesion, redesLocales } from '../../lib/enVivo/sesion';
import LlevarALaSesion from './LlevarALaSesion';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
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

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const pdf = new Blob([armarPdf([{ parrafos: ['Ley de Ohm.'] }])], { type: 'application/pdf' });

// As in Previa.jsx: the button only while this tab is in a live session.
function Previa() {
  const enVivo = useSesionEnVivo();
  return enVivo?.sesion ? <LlevarALaSesion sesion={enVivo.sesion} blob={pdf} nombre="Ohm.pdf" /> : <p>sin sesión</p>;
}

let raiz;
let caja;
const sesiones = [];
afterEach(() => {
  act(() => raiz?.unmount());
  caja?.remove();
  fijarSesionEnVivo(null);
  sesiones.splice(0).forEach((s) => s.cerrar());
});

describe('Llevar a la sesión', () => {
  it('sin sesión no aparece; con una, lleva el PDF a la mesa y les llega a los demás', async () => {
    caja = document.createElement('div');
    document.body.append(caja);
    raiz = createRoot(caja);
    act(() => raiz.render(<Previa />));
    expect(caja.querySelector('button')).toBeNull();

    const redes = redesLocales(2);
    const [a, b] = redes.map((red, k) => crearSesion({ red, yo: { nombre: `Alumno ${k}`, color: '#123456' } }));
    sesiones.push(a, b);
    act(() => fijarSesionEnVivo({ sesion: a, codigo: 'X' }));
    const boton = caja.querySelector('button');
    expect(boton.textContent).toBe('Llevar a la sesión');

    await act(async () => {
      boton.click();
      await esperar(20);
    });
    expect(caja.querySelector('button').textContent).toBe('Ya está en la mesa');
    await esperar(CADA_CAMBIOS + 30);
    const [pestana] = pestanas(b.doc);
    expect(pestana).toMatchObject({ tipo: 'apunte', titulo: 'Ohm.pdf' });
    const datos = datosDeApunte(b.doc.getMap(`h:${pestana.id}`));
    const llego = await b.archivos.pedir(datos.archivo, datos.de);
    expect(llego.size).toBe(pdf.size);
  });

  it('desde un resumen, a la mesa va solo cuál es, y un error conocido se dice', async () => {
    const { llevarResumen } = await import('../../lib/enVivo/llevar');
    caja = document.createElement('div');
    document.body.append(caja);
    raiz = createRoot(caja);
    const [a] = redesLocales(1).map((red) => crearSesion({ red, yo: { nombre: 'Ana', color: '#123456' } }));
    sesiones.push(a);
    const id = '0f8fad5b-d9cb-469f-a165-70867728950e';
    act(() => raiz.render(<><LlevarALaSesion sesion={a} llevar={llevarResumen({ id, titulo: 'Ohm', formato: 'pdf', materia: 'fisica-i' })} /><LlevarALaSesion sesion={a} llevar={llevarResumen({ id: 'x', formato: 'pdf' })} /></>));
    const [bien, mal] = caja.querySelectorAll('button');
    await act(async () => {
      bien.click();
      mal.click();
      await esperar(20);
    });
    // The summary's module loads on the click: on a busy machine it takes longer than the 20 ms.
    await act(() => vi.waitFor(() => expect(pestanas(a.doc)).toMatchObject([{ tipo: 'resumen', titulo: 'Ohm' }]), { timeout: 5000 }));
    expect(caja.querySelector('[role="alert"]').textContent).toBe('Este resumen no se puede llevar a la sesión.');
  });
});
