// Projects of the lab (docs/laboratorio-ide.md): several files that run together, saved with the rest of what's the
// student's and joined between devices like each file.
import { beforeEach, describe, expect, it } from 'vitest';
import { fijarUsuario, mioActual, sanearMio } from '../mio';
import { armar, piezas } from '../union';
import { agregarAlProyecto, borrarProyecto, cambiarArchivo, cambiarProyecto, crearProyecto, guardarArchivoNuevo, moverArchivo, paraCorrer } from './guardado';
import { MAX_PROYECTOS, sanearArchivo, sanearProyectos } from './saneo';

const H = 1_760_000_000_000;

describe('proyectos', () => {
  beforeEach(() => {
    localStorage.clear();
    fijarUsuario(null);
    fijarUsuario(5);
  });

  it('un archivo suelto pasa a ser el que corre de un proyecto nuevo, y se le suman un header y datos', () => {
    const suelto = guardarArchivoNuevo({ nombre: 'main', lenguaje: 'c', codigo: '#include "notas.h"\nint main(void){return 0;}', materia: 7 }, H);
    const p = crearProyecto({ nombre: 'Notas' }, suelto, H + 1);
    expect(p).toMatch(/^q[0-9a-z]{6,24}$/);
    expect(mioActual().proyectosLab).toEqual([{ id: p, nombre: 'Notas', lenguaje: 'c', materia: 7, principal: suelto, creado: H + 1, cambiado: H + 1 }]);
    expect(agregarAlProyecto(p, { nombre: 'notas', ext: 'h', codigo: 'int promedio(int *v, int n);' }, H + 2)).toMatch(/^l/);
    expect(agregarAlProyecto(p, { nombre: 'alumnos', ext: 'dat' }, H + 3)).toMatch(/^l/);
    // The name is taken, or the extension isn't of the language.
    expect(agregarAlProyecto(p, { nombre: 'NOTAS', ext: 'h' })).toBe(null);
    expect(agregarAlProyecto(p, { nombre: 'x', ext: 'py' })).toBe(null);
    expect(agregarAlProyecto(p, { nombre: 'x', ext: 'exe' })).toBe(null);

    const archivos = mioActual().laboratorio;
    expect(archivos.every((a) => a.proyecto === p && a.materia === 7)).toBe(true);
    expect(paraCorrer(mioActual(), p)).toEqual({
      principal: 'main.c',
      archivos: [
        { nombre: 'main.c', contenido: '#include "notas.h"\nint main(void){return 0;}' },
        { nombre: 'notas.h', contenido: 'int promedio(int *v, int n);' },
        { nombre: 'alumnos.dat', contenido: '' },
      ],
    });
  });

  it('uno de JavaScript lleva sus .js y datos en .json, .txt o .csv', () => {
    const p = crearProyecto({ nombre: 'Listas', lenguaje: 'javascript' }, null, H);
    agregarAlProyecto(p, { nombre: 'main', ext: 'js', codigo: "import { contar } from './listas.js';" }, H + 1);
    agregarAlProyecto(p, { nombre: 'listas', ext: 'js', codigo: 'export const contar = () => 0;' }, H + 2);
    for (const [ext, i] of [['json', 3], ['txt', 4], ['csv', 5]]) expect(agregarAlProyecto(p, { nombre: 'datos', ext }, H + i)).toMatch(/^l/);
    expect(agregarAlProyecto(p, { nombre: 'x', ext: 'py' })).toBe(null);
    expect(agregarAlProyecto(p, { nombre: 'x', ext: 'dat' })).toBe(null);
    expect(paraCorrer(mioActual(), p)).toMatchObject({ principal: 'main.js', archivos: [{ nombre: 'main.js' }, { nombre: 'listas.js' }, { nombre: 'datos.json' }, { nombre: 'datos.txt' }, { nombre: 'datos.csv' }] });
  });

  it('un proyecto vacío toma como principal el primer archivo de su lenguaje', () => {
    const p = crearProyecto({ nombre: 'Gráficos', lenguaje: 'python' }, null, H);
    expect(paraCorrer(mioActual(), p)).toBe(null);
    agregarAlProyecto(p, { nombre: 'datos', ext: 'csv', codigo: 'a,b\n1,2' }, H + 1);
    const main = agregarAlProyecto(p, { nombre: 'main', ext: 'py', codigo: 'print(1)' }, H + 2);
    agregarAlProyecto(p, { nombre: 'utiles', ext: 'py' }, H + 3);
    expect(mioActual().proyectosLab[0].principal).toBe(main);
    expect(cambiarProyecto(p, { principal: mioActual().laboratorio.at(-1).id })).toBe(true);
    expect(paraCorrer(mioActual(), p).principal).toBe('utiles.py');
  });

  it('cambiar la materia la lleva a sus archivos; borrar el proyecto se lleva todo', () => {
    const p = crearProyecto({ nombre: 'TP', lenguaje: 'python' }, null, H);
    const a = agregarAlProyecto(p, { nombre: 'main', ext: 'py' }, H);
    const otro = guardarArchivoNuevo({ nombre: 'Suelto', lenguaje: 'sql', codigo: 'SELECT 1;' }, H);
    cambiarProyecto(p, { materia: 9, lenguaje: 'sql' }, H + 5);
    expect(mioActual().proyectosLab[0]).toMatchObject({ materia: 9, lenguaje: 'python', cambiado: H + 5 });
    expect(mioActual().laboratorio.find((x) => x.id === a).materia).toBe(9);
    // Editing a file keeps it in its project, with its extension.
    cambiarArchivo(a, { codigo: 'print(2)' });
    expect(mioActual().laboratorio.find((x) => x.id === a)).toMatchObject({ proyecto: p, codigo: 'print(2)' });
    borrarProyecto(p);
    expect(mioActual().proyectosLab).toEqual([]);
    expect(mioActual().laboratorio.map((x) => x.id)).toEqual([otro]);
  });

  it('el saneo deja solo lo que es de un proyecto y respeta el tope', () => {
    expect(sanearArchivo({ id: 'labc12345', nombre: 'x', lenguaje: 'c', codigo: '', proyecto: 'qabc12345', ext: 'h' })).toMatchObject({ proyecto: 'qabc12345', ext: 'h' });
    // The language's own extension isn't kept; another language's, or something else, neither.
    expect(sanearArchivo({ id: 'labc12345', nombre: 'x', lenguaje: 'c', codigo: '', ext: 'c' })).not.toHaveProperty('ext');
    expect(sanearArchivo({ id: 'labc12345', nombre: 'x', lenguaje: 'sql', codigo: '', ext: 'py', proyecto: '../x' })).not.toHaveProperty('ext');
    expect(sanearArchivo({ id: 'labc12345', nombre: 'x', lenguaje: 'sql', codigo: '', proyecto: '../x' })).not.toHaveProperty('proyecto');
    const muchos = Array.from({ length: MAX_PROYECTOS + 5 }, (_, i) => ({ id: `q${String(i).padStart(7, '0')}`, nombre: `P${i}`, lenguaje: 'python', creado: H + i }));
    expect(sanearProyectos(muchos)).toHaveLength(MAX_PROYECTOS);
    expect(sanearProyectos([{ id: 'malo', nombre: 'x', lenguaje: 'python' }, { id: 'qabc12345', nombre: '', lenguaje: 'python' }])).toEqual([]);
    expect(sanearMio({}).proyectosLab).toEqual([]);
  });

  it('cada proyecto viaja a Drive como un elemento propio y vuelve igual', () => {
    const d = sanearMio({
      proyectosLab: [{ id: 'qabc12345', nombre: 'Notas', lenguaje: 'c', materia: 7, principal: 'labc12345', creado: H, cambiado: H }],
      laboratorio: [{ id: 'labc12345', nombre: 'main', lenguaje: 'c', codigo: 'int main(void){}', proyecto: 'qabc12345', creado: H, cambiado: H }],
    });
    const p = piezas(d);
    expect(p['labp/qabc12345']).toEqual({ nombre: 'Notas', lenguaje: 'c', materia: 7, principal: 'labc12345', creado: H, cambiado: H });
    expect(sanearMio(armar(p))).toEqual(d);
    expect(sanearMio(armar({ ...p, 'labp/../x': {}, 'labp/x': {} })).proyectosLab).toHaveLength(1);
  });
  it('mover un archivo: de suelto a un proyecto, de uno a otro y afuera, con su materia y el que corre', () => {
    const suelto = guardarArchivoNuevo({ nombre: 'utiles', lenguaje: 'python', codigo: 'def f(): pass', materia: 3 }, H);
    const a = crearProyecto({ nombre: 'A', lenguaje: 'python', materia: 7 }, null, H);
    const b = crearProyecto({ nombre: 'B', lenguaje: 'python', materia: 9 }, null, H);
    const mainA = agregarAlProyecto(a, { nombre: 'main', ext: 'py', codigo: 'print(1)' }, H);
    const datos = agregarAlProyecto(a, { nombre: 'datos', ext: 'csv', codigo: 'x' }, H);
    const archivo = (id) => mioActual().laboratorio.find((x) => x.id === id);
    const proyecto = (id) => mioActual().proyectosLab.find((x) => x.id === id);

    // Loose into a project: it takes the project's course; already there, nothing to do.
    expect(moverArchivo(suelto, a, H + 1)).toBe(null);
    expect(archivo(suelto)).toMatchObject({ proyecto: a, materia: 7, cambiado: H + 1 });
    expect(moverArchivo(suelto, a)).toBe('mismo');
    expect(proyecto(a).principal).toBe(mainA);

    // The one that runs, to another project: the old one picks the next of its language, the empty one takes it.
    expect(moverArchivo(mainA, b, H + 2)).toBe(null);
    expect(proyecto(a).principal).toBe(suelto);
    expect(proyecto(b).principal).toBe(mainA);
    expect(archivo(mainA)).toMatchObject({ proyecto: b, materia: 9 });

    // Data goes from project to project, but not out on its own.
    expect(moverArchivo(datos, null)).toBe('suelto');
    expect(moverArchivo(datos, b, H + 3)).toBe(null);
    expect(archivo(datos)).toMatchObject({ proyecto: b, ext: 'csv' });

    // Out: it keeps the course it had, and its old project is left with none that runs.
    expect(moverArchivo(suelto, null, H + 4)).toBe(null);
    expect(archivo(suelto)).not.toHaveProperty('proyecto');
    expect(archivo(suelto).materia).toBe(7);
    expect(proyecto(a).principal).toBe(null);
  });

  it('mover un archivo: no pisa un nombre, no cambia de lenguaje y no toca lo que no está', () => {
    const p = crearProyecto({ nombre: 'P', lenguaje: 'python' }, null, H);
    agregarAlProyecto(p, { nombre: 'main', ext: 'py' }, H);
    const otroMain = guardarArchivoNuevo({ nombre: 'Main', lenguaje: 'python', codigo: '' }, H);
    const sql = guardarArchivoNuevo({ nombre: 'consulta', lenguaje: 'sql', codigo: 'SELECT 1;' }, H);
    const antes = JSON.stringify(mioActual());
    expect(moverArchivo(otroMain, p)).toBe('ocupado');
    expect(moverArchivo(sql, p)).toBe('lenguaje');
    expect(moverArchivo('lnoexiste1', p)).toBe('falla');
    expect(moverArchivo(otroMain, 'qnoexiste1')).toBe('falla');
    expect(JSON.stringify(mioActual())).toBe(antes);

    // Out, next to a loose file of the same name, course and language: it doesn't go either.
    const q = crearProyecto({ nombre: 'Q', lenguaje: 'sql' }, null, H);
    const otraConsulta = agregarAlProyecto(q, { nombre: 'consulta', ext: 'sql' }, H);
    expect(moverArchivo(otraConsulta, null)).toBe('ocupado');
  });
});
