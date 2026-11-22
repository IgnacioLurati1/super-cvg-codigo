import { describe, expect, it } from 'vitest';
import { dibujoDeItem, simboloDe, simboloDeDepartamento, simboloDeItem, tonoDeItem } from './simbolos';

describe('simboloDe', () => {
  it.each([
    ['Algoritmos Genéticos', 'adn'],
    ['Comunicación de Datos', 'antena'],
    ['LEGISLACION 2026 UTN FRRo', 'balanza'],
    ['Probabilidad y Estadística - (Todas las carreras)', 'barras'],
    ['Análisis Matemático II', 'sigma'],
    ['Física I', 'atomo'],
    ['Inglés Técnico', 'burbuja'],
    ['Gestión de Datos', 'base'],
    ['Paradigmas de Programación', 'codigo'],
    ['Sistemas y Organizaciones', 'maletin'],
    ['Diseño de Sistemas', 'compas'],
  ])('%s', (nombre, simbolo) => {
    expect(simboloDe(nombre, 7)).toBe(simbolo);
  });

  it('una materia que no reconoce igual tiene uno, siempre el mismo', () => {
    expect(simboloDe('Tema raro', 7)).toBe(simboloDe('Tema raro', 7));
    expect(simboloDe('Tema raro', 7)).not.toBe(simboloDe('Tema raro', 8));
  });

  it('sin materia, el del calendario', () => {
    expect(simboloDe('General', 0)).toBe('calendario');
    expect(simboloDe('', null)).toBe('calendario');
  });
});

describe('simboloDeDepartamento', () => {
  it('gives each department of the campus its own, with or without accents, and a folder to any other area', () => {
    expect(['Básicas', 'Civil', 'Eléctrica', 'Mecánica', 'Química', 'Sistemas'].map(simboloDeDepartamento)).toEqual(['sigma', 'puente', 'rayo', 'engranaje', 'matraz', 'codigo']);
    expect(simboloDeDepartamento('Depto Ingeniería en Sistemas de Información')).toBe('codigo');
    expect(simboloDeDepartamento('Ingreso')).toBe('carpeta');
    expect(simboloDeDepartamento('')).toBe('carpeta');
  });
});

describe('tonoDeItem', () => {
  it('cada clase de cosa tiene su color, y un archivo según su extensión', () => {
    expect(tonoDeItem({ tipo: 'archivo', archivo: 'Guía 1.PDF' })).toBe('pdf');
    expect(tonoDeItem({ tipo: 'archivo', archivo: 'notas.xlsx' })).toBe('planilla');
    expect(tonoDeItem({ tipo: 'archivo', archivo: 'clase.pptx' })).toBe('presentacion');
    expect(tonoDeItem({ tipo: 'archivo', archivo: 'pizarron.jpg' })).toBe('imagen');
    expect(tonoDeItem({ tipo: 'archivo', archivo: 'tp.docx' })).toBe('doc');
    expect(tonoDeItem({ tipo: 'archivo', archivo: 'todo.zip' })).toBeNull();
    expect(tonoDeItem({ tipo: 'archivo', nombre: 'Sin extensión', mime: 'application/pdf' })).toBe('pdf');
    expect(tonoDeItem({ tipo: 'archivo', nombre: 'Sin nada' })).toBeNull();
    expect(tonoDeItem({ tipo: 'enlace', video: 'abc' })).toBe('video');
    expect(tonoDeItem({ tipo: 'enlace' })).toBe('enlace');
    expect(tonoDeItem({ tipo: 'texto' })).toBe('texto');
    expect(tonoDeItem({ tipo: 'actividad' })).toBe('actividad');
  });
});

describe('simboloDeItem', () => {
  it('una planilla, una presentación y una imagen tienen su dibujo', () => {
    expect(simboloDeItem({ tipo: 'archivo', archivo: 'notas.csv' })).toBe('planilla');
    expect(simboloDeItem({ tipo: 'archivo', archivo: 'clase.odp' })).toBe('presentacion');
    expect(simboloDeItem({ tipo: 'archivo', archivo: 'foto.png' })).toBe('imagen');
    expect(simboloDeItem({ tipo: 'archivo', archivo: 'guia.pdf' })).toBe('documento');
  });

  it('distingue qué vas a tocar', () => {
    expect(simboloDeItem({ tipo: 'archivo' })).toBe('documento');
    expect(simboloDeItem({ tipo: 'enlace', video: 'abc' })).toBe('video');
    expect(simboloDeItem({ tipo: 'enlace', video: null })).toBe('enlace');
    expect(simboloDeItem({ tipo: 'actividad' })).toBe('actividad');
  });
});

describe('un link a un archivo de Drive', () => {
  const ID = '1AbCdEfGhIjKlMnOpQrStUv';
  const enlace = (destino, extra = {}) => dibujoDeItem({ tipo: 'enlace', destino, ...extra });

  it('se dibuja como el archivo que es, con el simbolito de link, y no como una carpeta', () => {
    expect(enlace(`https://drive.google.com/file/d/${ID}/view`, { nombre: 'Bolton', tituloEnDrive: 'Bolton.pdf' })).toEqual({ simbolo: 'documento', tono: 'pdf', enlace: true });
    expect(enlace(`https://drive.google.com/file/d/${ID}/view?usp=sharing`, { nombre: 'Notas.xlsx' })).toEqual({ simbolo: 'planilla', tono: 'planilla', enlace: true });
    expect(enlace(`https://drive.google.com/open?id=${ID}`, { nombre: 'Foto.jpg' })).toEqual({ simbolo: 'imagen', tono: 'imagen', enlace: true });
    expect(enlace(`https://docs.google.com/presentation/d/${ID}/edit`, { nombre: 'Clase 3' })).toEqual({ simbolo: 'presentacion', tono: 'presentacion', enlace: true });
  });

  it('sin extensión, una hoja con el color de Drive', () => {
    expect(enlace(`https://drive.google.com/file/d/${ID}/view`, { nombre: 'Ingeniería de Control. Bolton. Edicion 2' })).toEqual({ simbolo: 'documento', tono: 'drive', enlace: true });
  });

  it('una carpeta sigue siendo carpeta, y lo que no es de Drive no lleva el simbolito', () => {
    expect(enlace(`https://drive.google.com/drive/folders/${ID}`, { nombre: 'TP.pdf' })).toEqual({ simbolo: 'carpeta', tono: 'drive', enlace: false });
    expect(enlace('https://example.org/apunte.pdf', { nombre: 'apunte.pdf' })).toEqual({ simbolo: 'enlace', tono: 'enlace', enlace: false });
    expect(enlace('https://docs.google.com/forms/d/e/x/viewform')).toEqual({ simbolo: 'formulario', tono: 'formulario', enlace: false });
    expect(dibujoDeItem({ tipo: 'archivo', archivo: 'a.pdf' }).enlace).toBe(false);
  });
});
