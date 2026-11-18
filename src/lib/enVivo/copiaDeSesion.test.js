// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { copiaSinCampus, juntarCopias, leerCopia, mismaCopia, pestanasDeCopia } from './copiaDeSesion';
import { MAX_COPIA } from './guardadas';
import { leerCarpeta, sumarArchivo, textosDeLaCarpeta } from './laboratorioCompartido';
import { abrirPestana, escribir, mensajes, pestanas } from './mesa';

const yo = { id: 'a1b2c3d4e5f60718', nombre: 'Ana G.', color: '#1d6fb8' };
const enTexto = (bytes) => new TextDecoder('utf-8', { fatal: false }).decode(bytes);

/** A table with a bit of everything: a document, the Laboratorio, a chat, a course of the campus, the session's
 * Consultron and a notice. */
function mesaCompleta() {
  const doc = new Y.Doc();
  const documento = abrirPestana(doc, 'documento', { titulo: 'Resumen del TP', por: yo.nombre });
  const p = new Y.XmlElement('paragraph');
  p.insert(0, [new Y.XmlText('Teorema de Thevenin')]);
  doc.getMap(`h:${documento}`).get('texto').insert(0, [p]);
  const lab = abrirPestana(doc, 'laboratorio', { titulo: 'Laboratorio', por: yo.nombre });
  const datosLab = doc.getMap(`h:${lab}`);
  sumarArchivo(datosLab, leerCarpeta(datosLab)[0].id, { nombre: 'serie', ext: 'py', codigo: 'print("resistencias en serie")' });
  const materia = abrirPestana(doc, 'materia', {
    titulo: 'Análisis Matemático II',
    datos: { materia: { nombre: 'Análisis Matemático II', secciones: [{ nombre: 'Unidad 1 Integrales dobles', items: [{ id: 'i0', nombre: 'Parcial resuelto 2023', tipo: 'archivo', clase: 'PDF', url: '', abre: true }] }] }, de: yo.id },
    por: yo.nombre,
  });
  doc.getMap(`h:${materia}`).set('p:i0', { estado: 'listo', por: yo.id, nombre: yo.nombre, cuando: 1 });
  const apunte = abrirPestana(doc, 'apunte', { titulo: 'Guía 1.pdf', datos: { archivo: '0123456789abcdef', nombre: 'Guía 1.pdf', de: yo.id }, por: yo.nombre });
  doc.getMap('consultron').set('q:aaaaaaaaaaaa', { pregunta: '¿Qué entra?', respuesta: 'Según Análisis Matemático II, entra Fubini.', de: yo.id, estado: 'listo' });
  doc.getMap('meta').set('cerrada', { pestana: materia, titulo: 'Análisis Matemático II', de: yo.id, nombre: yo.nombre, cuando: 1 });
  escribir(doc, yo, 'Nos vemos a las 18');
  return { doc, documento, lab, materia, apunte };
}

const textoDelDocumento = (doc, id) => doc.getMap(`h:${id}`).get('texto').toString();

describe('la copia de una sesión', () => {
  it('guarda el documento, el Laboratorio, el chat y el apunte sin sus bytes', () => {
    const { doc, documento, lab, apunte } = mesaCompleta();
    const vuelta = leerCopia(copiaSinCampus(doc));
    expect(textoDelDocumento(vuelta, documento)).toContain('Teorema de Thevenin');
    expect(textosDeLaCarpeta(vuelta.getMap(`h:${lab}`)).join('\n')).toContain('resistencias en serie');
    expect(mensajes(vuelta).map((m) => m.texto)).toEqual(['Nos vemos a las 18']);
    expect(vuelta.getMap(`h:${apunte}`).get('archivo')).toBe('0123456789abcdef');
    expect(pestanasDeCopia(vuelta).sort()).toEqual(['Guía 1.pdf', 'Laboratorio', 'Resumen del TP']);
  });

  it('no guarda nada del campus: la materia, el Consultron de la mesa ni los avisos', () => {
    const { doc, materia } = mesaCompleta();
    const bytes = copiaSinCampus(doc);
    expect(enTexto(bytes)).not.toMatch(/Análisis|Integrales|Parcial resuelto|Fubini|Qué entra/);
    const vuelta = leerCopia(bytes);
    expect(pestanas(vuelta).map((p) => p.tipo)).not.toContain('materia');
    expect(vuelta.getMap(`h:${materia}`).get('materia')).toBeNull();
    expect(vuelta.getMap('consultron').get('q:aaaaaaaaaaaa')).toBeNull();
    expect(vuelta.getMap('meta').get('cerrada')).toBeNull();
  });

  it('juntada con la mesa de quien sigue adentro, no le saca la materia a nadie', () => {
    const { doc: viva, materia, documento } = mesaCompleta();
    const vuelta = leerCopia(copiaSinCampus(viva));
    // Who comes back writes something; then both meet again.
    const p = new Y.XmlElement('paragraph');
    p.insert(0, [new Y.XmlText('Y Norton')]);
    vuelta.getMap(`h:${documento}`).get('texto').insert(1, [p]);
    Y.applyUpdate(viva, Y.encodeStateAsUpdate(vuelta, Y.encodeStateVector(viva)));
    Y.applyUpdate(vuelta, Y.encodeStateAsUpdate(viva, Y.encodeStateVector(vuelta)));
    expect(viva.getMap(`h:${materia}`).get('materia').nombre).toBe('Análisis Matemático II');
    expect(pestanas(viva).map((x) => x.tipo)).toContain('materia');
    expect(textoDelDocumento(viva, documento)).toContain('Y Norton');
    expect(textoDelDocumento(vuelta, documento)).toContain('Teorema de Thevenin');
  });

  it('lo borrado sigue borrado', () => {
    const doc = new Y.Doc();
    escribir(doc, yo, 'uno');
    escribir(doc, yo, 'dos');
    doc.getArray('chat').delete(0, 1);
    expect(mensajes(leerCopia(copiaSinCampus(doc))).map((m) => m.texto)).toEqual(['dos']);
  });

  it('una copia rota, cortada o enorme no se lee', () => {
    const bytes = copiaSinCampus(mesaCompleta().doc);
    expect(leerCopia(bytes.slice(0, Math.floor(bytes.length / 2)))).toBeNull();
    expect(leerCopia(crypto.getRandomValues(new Uint8Array(300)))).toBeNull();
    expect(leerCopia(new Uint8Array(0))).toBeNull();
    expect(leerCopia(new Uint8Array(MAX_COPIA + 1))).toBeNull();
    expect(leerCopia('no son bytes')).toBeNull();
  });

  it('dos copias de la misma sesión se juntan', () => {
    const { doc, documento } = mesaCompleta();
    const a = copiaSinCampus(doc);
    const otra = leerCopia(a);
    escribir(otra, yo, 'desde la otra compu');
    const b = copiaSinCampus(otra);
    escribir(doc, yo, 'desde esta');
    const juntas = leerCopia(juntarCopias(copiaSinCampus(doc), b));
    expect(mensajes(juntas).map((m) => m.texto)).toEqual(expect.arrayContaining(['Nos vemos a las 18', 'desde la otra compu', 'desde esta']));
    expect(textoDelDocumento(juntas, documento)).toContain('Teorema de Thevenin');
    expect(juntarCopias(new Uint8Array([1, 2, 3]), b)).not.toBeNull();
    expect(juntarCopias(null, new Uint8Array([1, 2, 3]))).toBeNull();
    expect(mismaCopia(a, copiaSinCampus(leerCopia(a)))).toBe(true);
    expect(mismaCopia(a, b)).toBe(false);
  });
});
