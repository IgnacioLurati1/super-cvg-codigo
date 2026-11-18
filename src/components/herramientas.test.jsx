import { Blob as BlobDeNode } from 'node:buffer';
import { strToU8, zipSync } from 'fflate';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { traerArchivo, guardarArchivo } from '../lib/archivos';
import { borrarMio, fijarUsuario, materiaDe, mioActual } from '../lib/mio';
import BajarMateria from './BajarMateria';
import PanelFechas from './PanelFechas';

vi.mock('../lib/archivos', () => ({ traerArchivo: vi.fn(), guardarArchivo: vi.fn() }));
const confirmar = vi.fn();
const avisar = vi.fn();
vi.mock('./ui', () => ({ useUI: () => ({ confirmar, avisar }) }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
// El Blob de jsdom no tiene arrayBuffer. El del navegador y el de Node sí.
globalThis.Blob = BlobDeNode;

const MATERIA = { id: 7, nombre: 'Física I' };
const anio = new Date().getFullYear() + 1;
const documento = (...lineas) =>
  new Blob([
    zipSync({
      'word/document.xml': strToU8(
        `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${lineas.map((l) => `<w:p><w:r><w:t>${l}</w:t></w:r></w:p>`).join('')}</w:body></w:document>`,
      ),
    }),
  ]);
const item = (nombre, extra = {}) => ({
  tipo: 'archivo',
  clave: nombre,
  nombre,
  archivo: `${nombre}.docx`,
  seccion: 'Unidad 1',
  seccionId: 1,
  direccion: `https://campus/${nombre}`,
  peso: 1000,
  mime: '',
  ...extra,
});
const mia = () => materiaDe(mioActual(), MATERIA.id);

let lugar;
let raiz;

async function esperar(condicion) {
  for (let i = 0; i < 200; i++) {
    if (condicion()) return;
    await act(async () => {
      await new Promise((r) => setTimeout(r, 2));
    });
  }
  throw new Error(`No pasó. Pantalla: ${lugar.textContent}`);
}
const boton = (texto) => [...lugar.querySelectorAll('button')].find((b) => b.textContent.startsWith(texto));
const tocar = (b) => act(async () => b.click());
const escribir = (input, valor) =>
  act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, valor);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
const mostrar = (ui) => act(async () => raiz.render(ui));

beforeEach(() => {
  vi.clearAllMocks();
  lugar = document.createElement('div');
  document.body.append(lugar);
  raiz = createRoot(lugar);
  act(() => fijarUsuario(99));
});

afterEach(() => {
  act(() => raiz.unmount());
  lugar.remove();
  act(() => {
    borrarMio();
    fijarUsuario(null);
  });
});

describe('cazador de fechas', () => {
  const buscar = async () => {
    await tocar(boton('Buscar fechas en los documentos'));
    await esperar(() => !boton('Cancelar'));
  };

  it('sin documentos para leer lo dice y no ofrece buscar', async () => {
    await mostrar(<PanelFechas materia={MATERIA} items={[item('Apunte'), { tipo: 'enlace', clave: 'e', nombre: 'Cronograma' }]} />);
    expect(boton('Buscar')).toBeUndefined();
    expect(lugar.textContent).toContain('No hay PDF ni Word');
  });

  it('un documento muy pesado queda afuera sin bajarlo', async () => {
    await mostrar(<PanelFechas materia={MATERIA} items={[item('Cronograma', { peso: 20 * 1024 * 1024 })]} />);
    expect(boton('Buscar')).toBeUndefined();
    expect(lugar.textContent).toContain('pesan más de 15 MB');
    expect(traerArchivo).not.toHaveBeenCalled();
  });

  it('sugiere, separa las dudosas, y no suma nada solo', async () => {
    traerArchivo.mockResolvedValue(documento(`Primer parcial 15/3/${anio}`, `Charla con la cátedra sobre temas varios del cuatrimestre, será el 20/3/${anio}`));
    await mostrar(<PanelFechas materia={MATERIA} items={[item('Cronograma'), item('Apunte')]} />);
    await buscar();

    expect(traerArchivo).toHaveBeenCalledTimes(1);
    const fuerte = lugar.querySelector('[data-lista="fuertes"]');
    expect(fuerte.querySelectorAll('li')).toHaveLength(1);
    expect(fuerte.querySelector('input').value).toBe('Primer parcial');
    expect(fuerte.textContent).toContain('Salió de Cronograma.docx.');
    expect(lugar.querySelector('details summary').textContent).toBe('Otras fechas posibles (1)');
    expect(lugar.querySelector('details li input').value).toMatch(/^Charla/);
    expect(lugar.textContent).toContain('Son sugerencias que hay que confirmar');
    expect(mia().fechas).toEqual([]);
  });

  it('suma al calendario con el título editado, y no la vuelve a mostrar', async () => {
    traerArchivo.mockResolvedValue(documento(`Primer parcial 15/3/${anio}`, `Entrega 16/3/${anio}`));
    const items = [item('Cronograma')];
    await mostrar(<PanelFechas materia={MATERIA} items={items} />);
    await buscar();

    const [primera] = lugar.querySelectorAll('[data-lista="fuertes"] input');
    await escribir(primera, 'Parcial de cinemática');
    await tocar(boton('Sumar al calendario'));

    expect(mia().fechas).toHaveLength(1);
    const [guardada] = mia().fechas;
    expect(guardada).toMatchObject({ titulo: 'Parcial de cinemática', sinHora: true, cuando: new Date(anio, 2, 15, 12).getTime() / 1000 });
    expect(Number.isSafeInteger(guardada.id)).toBe(true);
    expect(avisar).toHaveBeenCalledWith('Sumada al calendario.');
    expect(lugar.querySelectorAll('[data-lista="fuertes"] li')).toHaveLength(1);
    // El foco queda en la que tomó su lugar.
    expect(document.activeElement).toBe(lugar.querySelector('[data-lista="fuertes"] input'));

    await tocar(boton('Sumar al calendario'));
    expect(mia().fechas).toHaveLength(2);
    expect(mia().fechas[0].id).not.toBe(mia().fechas[1].id);
    expect(lugar.querySelector('[data-lista="fuertes"]')).toBeNull();
    expect(document.activeElement).toBe(lugar.querySelector('[role="status"]'));

    // Otra búsqueda, de cero, no las trae de vuelta.
    await act(async () => raiz.unmount());
    raiz = createRoot(lugar);
    await mostrar(<PanelFechas materia={MATERIA} items={items} />);
    await buscar();
    expect(lugar.querySelectorAll('li input')).toHaveLength(0);
    expect(lugar.textContent).toContain('No quedan fechas para mirar.');
  });

  it('«No es» se acuerda', async () => {
    traerArchivo.mockResolvedValue(documento(`Primer parcial 15/3/${anio}`));
    const items = [item('Cronograma')];
    await mostrar(<PanelFechas materia={MATERIA} items={items} />);
    await buscar();
    await tocar(boton('No es'));
    expect(mia().descartes).toHaveLength(1);
    expect(mia().fechas).toEqual([]);
    expect(lugar.querySelectorAll('li input')).toHaveLength(0);

    await act(async () => raiz.unmount());
    raiz = createRoot(lugar);
    await mostrar(<PanelFechas materia={MATERIA} items={items} />);
    await buscar();
    expect(lugar.querySelectorAll('li input')).toHaveLength(0);
  });

  it('un título vacío no se suma', async () => {
    traerArchivo.mockResolvedValue(documento(`Primer parcial 15/3/${anio}`));
    await mostrar(<PanelFechas materia={MATERIA} items={[item('Cronograma')]} />);
    await buscar();
    await escribir(lugar.querySelector('li input'), '   ');
    await tocar(boton('Sumar al calendario'));
    expect(mia().fechas).toEqual([]);
    expect(lugar.textContent).toContain('Poné un título para sumarla.');
  });

  it('si no se puede guardar, lo avisa y la deja', async () => {
    traerArchivo.mockResolvedValue(documento(`Primer parcial 15/3/${anio}`));
    await mostrar(<PanelFechas materia={MATERIA} items={[item('Cronograma')]} />);
    await buscar();
    act(() => fijarUsuario(null));
    await tocar(boton('Sumar al calendario'));
    expect(avisar).toHaveBeenCalledWith('No se pudo guardar la fecha.', 'error');
    expect(lugar.querySelectorAll('li input')).toHaveLength(1);
  });

  it('de a diez por vez, uno atrás del otro, y después ofrece seguir', async () => {
    let activos = 0;
    let maximo = 0;
    traerArchivo.mockImplementation(async () => {
      activos++;
      maximo = Math.max(maximo, activos);
      await new Promise((r) => setTimeout(r, 1));
      activos--;
      return documento(`Parcial 15/3/${anio}`);
    });
    const items = Array.from({ length: 23 }, (_, n) => item(`Parcial ${n}`));
    await mostrar(<PanelFechas materia={MATERIA} items={items} />);
    await buscar();
    expect(traerArchivo).toHaveBeenCalledTimes(10);
    expect(maximo).toBe(1);
    // La misma fecha en los diez archivos es una sola sugerencia.
    expect(lugar.querySelectorAll('li input')).toHaveLength(1);
    expect(boton('Seguir con el resto').textContent).toBe('Seguir con el resto (13)');

    await tocar(boton('Seguir con el resto'));
    await esperar(() => !boton('Cancelar'));
    expect(traerArchivo).toHaveBeenCalledTimes(20);
    expect(boton('Seguir con el resto').textContent).toBe('Seguir con el resto (3)');

    await tocar(boton('Seguir con el resto'));
    await esperar(() => !boton('Cancelar'));
    expect(traerArchivo).toHaveBeenCalledTimes(23);
    expect(boton('Seguir con el resto')).toBeUndefined();
  });

  it('se puede cancelar: se queda con lo que halló y deja seguir', async () => {
    let soltar;
    traerArchivo.mockResolvedValueOnce(documento(`Parcial 15/3/${anio}`)).mockImplementationOnce(() => new Promise((r) => {
      soltar = r;
    }));
    await mostrar(<PanelFechas materia={MATERIA} items={[item('Parcial 1'), item('Parcial 2'), item('Parcial 3')]} />);
    await tocar(boton('Buscar fechas'));
    await esperar(() => lugar.textContent.includes('Leyendo 2 de 3.'));
    expect(lugar.querySelector('[role="status"]').getAttribute('aria-live')).toBe('polite');
    expect(document.activeElement).toBe(boton('Cancelar'));

    await tocar(boton('Cancelar'));
    await esperar(() => !boton('Cancelar'));
    expect(lugar.textContent).toContain('Cancelaste la búsqueda.');
    expect(lugar.querySelectorAll('li input')).toHaveLength(1);
    expect(traerArchivo).toHaveBeenCalledTimes(2);
    expect(boton('Seguir con el resto').textContent).toBe('Seguir con el resto (2)');
    soltar(documento(`Final 16/3/${anio}`));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
    expect(lugar.querySelectorAll('li input')).toHaveLength(1);
  });

  it('no encontró nada: lo dice, y explica los escaneados y lo que falló', async () => {
    traerArchivo
      .mockResolvedValueOnce(new Blob(['no es un docx']))
      .mockRejectedValueOnce(new Error('no'))
      .mockResolvedValueOnce(new Blob([new Uint8Array(16 * 1024 * 1024)]))
      .mockResolvedValueOnce(documento('Un texto sin fechas'));
    await mostrar(<PanelFechas materia={MATERIA} items={[item('Parcial 1'), item('Parcial 2'), item('Parcial 3'), item('Parcial 4')]} />);
    await buscar();
    expect(lugar.textContent).toContain('No se encontraron fechas.');
    expect(lugar.textContent).toContain('Los documentos escaneados no se pueden leer');
    expect(lugar.textContent).toContain('Los escaneados son fotos y no se pueden leer');
    expect(lugar.textContent).toContain('Uno no se pudo bajar.');
    expect(lugar.textContent).toContain('Uno quedó afuera por pesar más de 15 MB.');
    expect(lugar.textContent).toContain('Se revisaron 2 documentos.');
  });

  it('salir de la pantalla cancela', async () => {
    traerArchivo.mockImplementation(() => new Promise(() => {}));
    await mostrar(<PanelFechas materia={MATERIA} items={[item('Parcial 1'), item('Parcial 2')]} />);
    await tocar(boton('Buscar fechas'));
    await act(async () => raiz.unmount());
    raiz = createRoot(lugar);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
    expect(traerArchivo).toHaveBeenCalledTimes(1);
  });
});

describe('bajar la materia', () => {
  const archivos = (peso = 1000) => [item('Apunte', { archivo: 'a.pdf', peso }), item('Guía', { archivo: 'b.pdf', peso }), { tipo: 'enlace', clave: 'e', seccion: 'Unidad 1', nombre: 'Video', destino: 'https://a.b/' }];

  it('sin archivos no muestra nada', async () => {
    await mostrar(<BajarMateria materia={MATERIA} items={[{ tipo: 'enlace', clave: 'e', nombre: 'Video', destino: 'https://a.b/' }]} />);
    expect(lugar.textContent).toBe('');
  });

  it('avisa cuánto es antes, baja y lo entrega', async () => {
    traerArchivo.mockResolvedValue(new Blob(['x']));
    await mostrar(<BajarMateria materia={MATERIA} items={archivos(2 * 1024 * 1024)} />);
    expect(lugar.textContent).toContain('2 archivos, 4,0 MB, y 1 enlace en una lista aparte.');
    expect(lugar.textContent).toContain('Baja solo lo que no ocultaste.');
    await tocar(boton('Bajar la materia en un ZIP'));
    await esperar(() => guardarArchivo.mock.calls.length === 1);
    await esperar(() => boton('Bajar la materia'));
    expect(confirmar).not.toHaveBeenCalled();
    expect(guardarArchivo.mock.calls[0][1]).toBe('Física I.zip');
    expect(lugar.textContent).toContain('El ZIP está en tus descargas.');
    expect(document.activeElement).toBe(lugar.querySelector('[role="status"]'));
  });

  it('con más de 300 MB pide confirmar, y si decís que no, no baja', async () => {
    confirmar.mockResolvedValue(false);
    await mostrar(<BajarMateria materia={MATERIA} items={archivos(200 * 1024 * 1024)} />);
    await tocar(boton('Bajar la materia'));
    expect(confirmar).toHaveBeenCalledWith(expect.objectContaining({ titulo: '¿Bajar 400,0 MB?' }));
    expect(traerArchivo).not.toHaveBeenCalled();

    confirmar.mockResolvedValue(true);
    traerArchivo.mockResolvedValue(new Blob(['x']));
    await tocar(boton('Bajar la materia'));
    await esperar(() => guardarArchivo.mock.calls.length === 1);
  });

  it('dice cuántos fallaron', async () => {
    traerArchivo.mockResolvedValueOnce(new Blob(['x'])).mockRejectedValueOnce(new Error('no'));
    await mostrar(<BajarMateria materia={MATERIA} items={archivos()} />);
    await tocar(boton('Bajar la materia'));
    await esperar(() => boton('Bajar la materia'));
    expect(lugar.textContent).toContain('un archivo no se pudo bajar');
    expect(lugar.textContent).toContain('no-se-pudieron-bajar.txt');
  });

  it('si fallan todos, no entrega y lo dice', async () => {
    traerArchivo.mockRejectedValue(new Error('no'));
    await mostrar(<BajarMateria materia={MATERIA} items={archivos()} />);
    await tocar(boton('Bajar la materia'));
    await esperar(() => boton('Bajar la materia'));
    expect(guardarArchivo).not.toHaveBeenCalled();
    expect(lugar.textContent).toContain('No se pudo bajar ningún archivo.');
  });

  it('mientras baja deja seguir, muestra el avance y se puede cancelar', async () => {
    traerArchivo.mockImplementation(() => new Promise(() => {}));
    await mostrar(<BajarMateria materia={MATERIA} items={archivos()} />);
    await tocar(boton('Bajar la materia'));
    await esperar(() => boton('Cancelar'));
    expect(lugar.querySelector('progress').getAttribute('max')).toBe('2');
    expect(lugar.textContent).toContain('Bajando 1 de 2.');
    expect(document.activeElement).toBe(boton('Cancelar'));
    await tocar(boton('Cancelar'));
    await esperar(() => boton('Bajar la materia'));
    expect(lugar.textContent).toContain('Cancelaste la descarga.');
    expect(guardarArchivo).not.toHaveBeenCalled();
  });

  it('salir de la pantalla cancela y no entrega', async () => {
    let soltar;
    traerArchivo.mockImplementation(() => new Promise((r) => {
      soltar = r;
    }));
    await mostrar(<BajarMateria materia={MATERIA} items={[item('Apunte', { archivo: 'a.pdf' })]} />);
    await tocar(boton('Bajar la materia'));
    await act(async () => raiz.unmount());
    raiz = createRoot(lugar);
    soltar(new Blob(['x']));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
    expect(guardarArchivo).not.toHaveBeenCalled();
  });
});
