import { describe, expect, it, vi } from 'vitest';
import { FOTOS_POR_PREGUNTA, TODAS, dePropias, dondeBusca, esFoto, fotosLeidas, lectorDe, leerFotos, materiaDeRuta, notasDeMaterias, valorDePropia } from './donde';

const MATERIAS = { enCurso: [{ id: 7, nombre: 'Física II' }, { id: 8, nombre: 'Redes' }], otras: [{ id: 3, nombre: 'Álgebra' }] };
const archivo = (id, nombre, mime = 'application/pdf') => ({ id, tipo: 'archivo', archivoId: `${id}00000000`.slice(0, 8), nombre, peso: 1200, mime });
const ROBOTICA = {
  id: 'p1',
  nombre: 'Robótica',
  de: null,
  categorias: [
    { id: 'c1', nombre: 'Teoría', bloques: [archivo('b1', 'Motores.pdf'), { id: 'b2', tipo: 'texto', texto: '## Servos\nUn servo se mueve entre 0 y 180 grados con una señal PWM de 50 Hz.' }, { id: 'b3', tipo: 'enlace', url: 'https://example.com', titulo: 'Tienda' }] },
    { id: 'c2', nombre: 'Pizarrón', bloques: [archivo('b4', 'Clase 3.jpg', 'image/jpeg'), { id: 'b5', tipo: 'campus', materiaId: 7, clave: '12' }, { id: 'b6', tipo: 'texto', texto: ' - ' }] },
  ],
};
const DE_FISICA = { id: 'p2', nombre: '', de: 7, categorias: [{ id: 'c3', nombre: 'Mis resueltos', bloques: [archivo('b7', 'Guía 2 resuelta.pdf')] }] };
const MIO = { propias: [ROBOTICA, DE_FISICA], materias: { 8: { nota: 'El profe toma oral en el final.\nLlevar la guía 4 impresa.' }, 7: { nota: '' } } };

describe('dondeBusca', () => {
  it('todas: las que cursa, sus materias propias y lo que sumó a las del campus', () => {
    const d = dondeBusca(TODAS, MATERIAS, MIO);
    expect(d.materias).toEqual(MATERIAS.enCurso);
    expect(d.propias).toEqual([ROBOTICA, DE_FISICA]);
    expect(d.suya).toBeNull();
  });

  it('una del campus: esa y lo que le sumó', () => {
    expect(dondeBusca('7', MATERIAS, MIO)).toEqual({ materias: [MATERIAS.enCurso[0]], propias: [DE_FISICA], suya: null });
    expect(dondeBusca('3', MATERIAS, MIO)).toEqual({ materias: MATERIAS.otras, propias: [], suya: null });
  });

  it('una propia: solo esa', () => {
    expect(dondeBusca(valorDePropia('p1'), MATERIAS, MIO)).toEqual({ materias: [], propias: [ROBOTICA], suya: ROBOTICA });
  });

  it('una que ya no está, o las secciones propias de otra: todas', () => {
    for (const valor of ['99', valorDePropia('borrada'), valorDePropia('p2')]) expect(dondeBusca(valor, MATERIAS, MIO).materias).toEqual(MATERIAS.enCurso);
    expect(dondeBusca(TODAS, MATERIAS, null).propias).toEqual([]);
    expect(dondeBusca(TODAS)).toEqual({ materias: [], propias: [], suya: null });
  });
});

describe('materiaDeRuta', () => {
  it('en una materia arranca buscando en esa, sea del campus o propia', () => {
    expect(materiaDeRuta('/materias/42')).toBe('42');
    expect(materiaDeRuta('/materias/42/notas')).toBe('42');
    expect(materiaDeRuta('/propias/pabc123xyz')).toBe(valorDePropia('pabc123xyz'));
    expect(materiaDeRuta('/propias/pabc123xyz/editar')).toBe(valorDePropia('pabc123xyz'));
    for (const ruta of ['/', '/propias/nueva', '/propias/abrir', '/calendario', undefined, null]) expect(materiaDeRuta(ruta), String(ruta)).toBe(TODAS);
  });
});

describe('lo que tiene una materia propia', () => {
  const leer = vi.fn(async () => new Blob(['x']));

  it('sus archivos como los abre la vista previa, y sus textos listos para buscar', async () => {
    const { archivos, notas } = dePropias([ROBOTICA, DE_FISICA], { leer, nombres: { 7: 'Física II' } });
    expect(archivos.map((a) => [a.nombre, a.materia, a.seccion, a.mime, a.archivoId])).toEqual([
      ['Motores', 'Robótica', 'Teoría', 'application/pdf', 'b1000000'],
      ['Clase 3', 'Robótica', 'Pizarrón', 'image/jpeg', 'b4000000'],
      ['Guía 2 resuelta', 'Física II', 'Mis resueltos', 'application/pdf', 'b7000000'],
    ]);
    expect(archivos.map(esFoto)).toEqual([false, true, false]);
    await archivos[0].traer();
    expect(leer).toHaveBeenCalledWith('b1000000', 'Motores.pdf');
    // A link, something of the campus and a text with nothing to read are not notes.
    expect(notas).toHaveLength(1);
    expect(notas[0]).toMatchObject({ doc: 'nota:p1-b2', fuente: { tipo: 'propia', clase: 'texto', nombre: 'Servos', materia: 'Robótica', a: '/propias/p1' } });
    expect(notas[0].trozos[0].texto).toContain('señal PWM de 50 Hz');
  });

  it('la nota de cada materia del campus', () => {
    const notas = notasDeMaterias(MATERIAS.enCurso, MIO);
    expect(notas.map((n) => [n.doc, n.fuente])).toEqual([['nota:m8', { tipo: 'propia', clase: 'nota', nombre: 'Tu nota', materia: 'Redes', a: '/materias/8' }]]);
    expect(notas[0].trozos[0].texto).toContain('Llevar la guía 4 impresa.');
    expect(notasDeMaterias(MATERIAS.enCurso, null)).toEqual([]);
  });
});

describe('las fotos de una materia propia', () => {
  const foto = (n) => ({ tipo: 'archivo', archivoId: `foto${n}0000`.slice(0, 8), nombre: `Foto ${n}`, archivo: `Foto ${n}.jpg`, mime: 'image/jpeg', materia: 'Robótica', traer: vi.fn(async () => new Blob(['x'])) });

  it('se leen una sola vez, y la que no se pudo leer no se vuelve a probar', async () => {
    const [buena, mala] = [foto(1), foto(2)];
    const leer = vi.fn(async (archivo) => {
      if (archivo.name === 'Foto 2.jpg') throw Object.assign(new Error('nada'), { problema: 'nada' });
      return { paginas: ['Ley de Ohm: V = I por R.\nLa potencia es P = V por I.'] };
    });
    await leerFotos([buena, mala], { leer });
    await leerFotos([buena, mala], { leer });
    expect(leer).toHaveBeenCalledTimes(2);
    expect(leer.mock.calls[0][1]).toBe('foto');
    const leidas = fotosLeidas([buena, mala]);
    expect(leidas).toHaveLength(1);
    expect(leidas[0].fuente).toEqual({ tipo: 'propia', clase: 'foto', nombre: 'Foto 1', materia: 'Robótica', item: buena });
    expect(leidas[0].trozos[0]).toMatchObject({ doc: 'afoto1000', pagina: 1 });
    expect(leidas[0].trozos[0].texto).toContain('Ley de Ohm');
  });

  it('si se frena la pregunta, no sigue ni la da por leída', async () => {
    const control = new AbortController();
    const [una, otra] = [foto(3), foto(4)];
    const leer = vi.fn(async () => {
      control.abort();
      throw Object.assign(new Error('frenada'), { name: 'AbortError' });
    });
    await leerFotos([una, otra], { leer, senal: control.signal });
    expect(leer).toHaveBeenCalledTimes(1);
    expect(fotosLeidas([una, otra])).toEqual([]);
    const despues = vi.fn(async () => ({ paginas: ['Texto de la foto tres.'] }));
    await leerFotos([una], { leer: despues });
    expect(fotosLeidas([una])).toHaveLength(1);
  });

  it('por pregunta lee pocas fotos, y los PDF van por su lado', async () => {
    const pdfs = { leer: vi.fn(async () => {}), leidos: vi.fn((lista) => lista.map((item) => ({ item, paginas: ['p'] }))) };
    const fotos = { leer: vi.fn(async () => {}), leidas: vi.fn(() => []) };
    const lector = lectorDe({ pdfs, senal: null, fotos });
    const pdf = { tipo: 'archivo', mime: 'application/pdf', nombre: 'Apunte' };
    const muchas = Array.from({ length: FOTOS_POR_PREGUNTA + 3 }, (_, n) => foto(10 + n));
    await lector.leer([pdf, ...muchas.slice(0, 4)]);
    await lector.leer(muchas.slice(4));
    expect(pdfs.leer).toHaveBeenCalledTimes(1);
    expect(pdfs.leer).toHaveBeenCalledWith([pdf]);
    expect(fotos.leer.mock.calls.map(([lote]) => lote.length)).toEqual([4, FOTOS_POR_PREGUNTA - 4]);
    expect(lector.leidos([pdf, ...muchas])).toEqual([{ item: pdf, paginas: ['p'] }]);
    expect(pdfs.leidos).toHaveBeenCalledWith([pdf]);
    expect(fotos.leidas).toHaveBeenCalledWith(muchas);
    // Nothing left to read of the pictures: it doesn't even call.
    await lector.leer(muchas);
    expect(fotos.leer).toHaveBeenCalledTimes(2);
  });
});
