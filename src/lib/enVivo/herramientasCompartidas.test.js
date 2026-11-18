// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { crearSesion, redesLocales, CADA_CAMBIOS, CADA_CONCIENCIA } from './sesion';
import { LENGUAJES } from '../laboratorio/lenguajes';
import { MAX_CODIGO } from '../laboratorio/saneo';
import {
  borrarProyectoDeLaMesa,
  colorValido,
  comoMio,
  compartirSalida,
  concienciaDePestana,
  crearProyectoDeLaMesa,
  elegirPrincipal,
  guardarCasosDeLaMesa,
  leerCarpeta,
  MAX_ARCHIVOS_MESA,
  MAX_ARCHIVOS_TOTAL,
  MAX_PROYECTOS_MESA,
  MAX_SALIDA,
  MAX_SALIDAS,
  paraGuardarCodigo,
  ponerCodigo,
  prepararProyectos,
  quitarArchivo,
  recortarCodigo,
  renombrarArchivo,
  renombrarProyecto,
  salidas,
  sumarArchivo,
  textosDeLaCarpeta,
  textoDelLaboratorio,
} from './laboratorioCompartido';
import { aplanar, armar, calculadoraDeMesa, elegirCalculadora, memoriaDeMesa } from './calculadoraCompartida';

const abiertas = [];
function armarSesiones(n = 2) {
  const redes = redesLocales(n);
  const sesiones = redes.map((red, k) => crearSesion({ red, yo: { nombre: `Alumno ${k}`, color: '#123456' } }));
  abiertas.push(...sesiones);
  return sesiones;
}
const esperar = (ms = CADA_CAMBIOS + 40) => new Promise((r) => setTimeout(r, ms));
const pestana = (s) => s.doc.getMap('h:p1');

afterEach(() => {
  abiertas.splice(0).forEach((s) => s.cerrar());
});

describe('Laboratorio de la mesa', () => {
  const primero = (datos) => leerCarpeta(datos)[0];
  const principalDe = (p) => p.archivos.find((x) => x.id === p.principal);

  it('el código que escribe uno le llega al otro, con sus proyectos, archivos y el que corre', async () => {
    const [a, b] = armarSesiones();
    prepararProyectos(pestana(a));
    const p = primero(pestana(a));
    expect(p).toMatchObject({ nombre: 'Código de la sesión', lenguaje: 'python' });
    const main = principalDe(p);
    expect(main).toMatchObject({ nombre: 'main', ext: 'py', codigo: LENGUAJES.python.ejemplo });
    main.texto.insert(main.texto.length, 'print(2 + 2)\n');
    const { id: otro } = sumarArchivo(pestana(a), p.id, { nombre: 'algo', ext: 'py', codigo: 'def algo():\n    return 1\n' });
    const sql = crearProyectoDeLaMesa(pestana(a), { nombre: 'Base', lenguaje: 'sql' });
    sumarArchivo(pestana(a), sql, { nombre: 'consulta', ext: 'sql', codigo: 'select 1;' });
    await esperar();
    const enB = leerCarpeta(pestana(b));
    expect(enB.map((x) => `${x.nombre} ${x.lenguaje}`)).toEqual(['Código de la sesión python', 'Base sql']);
    expect(enB[0].archivos.map((x) => `${x.nombre}.${x.ext}`)).toEqual(['main.py', 'algo.py']);
    expect(enB[0].archivos[0].codigo).toBe(`${LENGUAJES.python.ejemplo}print(2 + 2)\n`);
    expect(enB[1].principal).toBe(enB[1].archivos[0].id);

    expect(elegirPrincipal(pestana(b), p.id, otro)).toBe(true);
    expect(renombrarArchivo(pestana(b), otro, 'otro')).toBe(true);
    expect(renombrarProyecto(pestana(b), sql, 'Consultas')).toBe(true);
    await esperar();
    expect(principalDe(primero(pestana(a)))).toMatchObject({ id: otro, nombre: 'otro' });
    // The folder as the page reads the student's.
    const m = comoMio(pestana(a));
    expect(m.proyectosLab.map((x) => [x.nombre, x.lenguaje])).toEqual([['Código de la sesión', 'python'], ['Consultas', 'sql']]);
    expect(m.laboratorio.map((x) => [x.nombre, x.lenguaje, x.proyecto])).toEqual([['main', 'python', p.id], ['otro', 'python', p.id], ['consulta', 'sql', sql]]);
  });

  it('un nombre ocupado, un tipo que no va o de más no entran; el último archivo y el último proyecto quedan', () => {
    const [a] = armarSesiones(1);
    prepararProyectos(pestana(a));
    const p = primero(pestana(a));
    expect(sumarArchivo(pestana(a), p.id, { nombre: 'Main', ext: 'py' })).toEqual({ problema: 'ocupado' });
    expect(sumarArchivo(pestana(a), p.id, { nombre: 'x', ext: 'exe' })).toEqual({ problema: 'tipo' });
    expect(sumarArchivo(pestana(a), p.id, { nombre: ' ', ext: 'py' })).toEqual({ problema: 'nombre' });
    for (let i = 1; i < MAX_ARCHIVOS_MESA; i += 1) expect(sumarArchivo(pestana(a), p.id, { nombre: `a${i}`, ext: 'txt' }).id).toBeTruthy();
    expect(sumarArchivo(pestana(a), p.id, { nombre: 'uno más', ext: 'txt' })).toEqual({ problema: 'muchos' });
    expect(crearProyectoDeLaMesa(pestana(a), { nombre: 'Raro', lenguaje: 'cobol' })).toBeNull();
    for (let i = 1; i < MAX_PROYECTOS_MESA; i += 1) expect(crearProyectoDeLaMesa(pestana(a), { nombre: `P${i}`, lenguaje: 'c' })).toBeTruthy();
    expect(crearProyectoDeLaMesa(pestana(a), { nombre: 'Uno más', lenguaje: 'c' })).toBeNull();
    // Between all the projects, no more files than the folder takes.
    const otro = leerCarpeta(pestana(a))[1].id;
    for (let i = MAX_ARCHIVOS_MESA; i < MAX_ARCHIVOS_TOTAL; i += 1) expect(sumarArchivo(pestana(a), otro, { nombre: `b${i}`, ext: 'c' }).id).toBeTruthy();
    expect(sumarArchivo(pestana(a), otro, { nombre: 'fuera', ext: 'c' })).toEqual({ problema: 'muchos' });

    leerCarpeta(pestana(a)).slice(1).forEach((x) => expect(borrarProyectoDeLaMesa(pestana(a), x.id)).toBe(true));
    expect(borrarProyectoDeLaMesa(pestana(a), p.id)).toBe(false);
    primero(pestana(a)).archivos.slice(1).forEach((x) => expect(quitarArchivo(pestana(a), x.id)).toBe(true));
    expect(quitarArchivo(pestana(a), primero(pestana(a)).archivos[0].id)).toBe(false);
  });

  it('lo que llega roto, de otro tipo o repetido no se usa', () => {
    const [a] = armarSesiones(1);
    prepararProyectos(pestana(a));
    const p = primero(pestana(a));
    const proyectos = pestana(a).get('proyectos');
    proyectos.set('q-malo', new Y.Map([['nombre', 'x'], ['lenguaje', 'python']]));
    proyectos.set('qzzzzzzz', new Y.Map([['nombre', 'y'], ['lenguaje', '<script>']]));
    const mapa = proyectos.get(p.id).get('archivos');
    const uno = (nombre, ext, codigo, cuando = 0) => new Y.Map([['nombre', nombre], ['ext', ext], ['codigo', codigo], ['cuando', cuando]]);
    mapa.set('../x', uno('x', 'py', new Y.Text('mal id')));
    mapa.set('labcdefg', uno('texto', 'py', 'no es Y.Text'));
    mapa.set('lzzzzzzz', uno('raro', 'exe', new Y.Text('')));
    mapa.set('lyyyyyyy', uno('main', 'py', new Y.Text('otro main'), Date.now() + 1000));
    mapa.set('lxxxxxxx', uno('<b>\u0000hola</b>', 'py', new Y.Text('print(1)'), Date.now() + 2000));
    proyectos.get(p.id).set('principal', 'lzzzzzzz');
    proyectos.get(p.id).set('casos', [{ id: 'nada' }, 'x']);
    const carpeta = leerCarpeta(pestana(a));
    expect(carpeta).toHaveLength(1);
    expect(carpeta[0].archivos.map((x) => x.nombre)).toEqual(['main', '<b> hola</b>']);
    // The one that runs is one of code that is there.
    expect(carpeta[0].principal).toBe(carpeta[0].archivos[0].id);
    expect(carpeta[0].casos).toEqual([]);
    expect(guardarCasosDeLaMesa(pestana(a), p.id, [{ id: 'nada' }])).toBe(false);
  });

  it('un código de más que manda otro se corta, para todos, y ponerCodigo cambia solo lo distinto', async () => {
    const [a, b] = armarSesiones();
    prepararProyectos(pestana(a));
    await esperar();
    const deB = principalDe(primero(pestana(b))).texto;
    deB.insert(0, 'y'.repeat(MAX_CODIGO + 500));
    await esperar();
    textosDeLaCarpeta(pestana(a)).forEach(recortarCodigo);
    await esperar();
    expect(principalDe(primero(pestana(a))).texto.length).toBe(MAX_CODIGO);
    expect(deB.length).toBe(MAX_CODIGO);

    const t = principalDe(primero(pestana(a))).texto;
    t.delete(0, t.length);
    t.insert(0, 'uno\ndos\ntres\n');
    const cambios = [];
    t.observe((e) => cambios.push(e.delta));
    ponerCodigo(t, 'uno\nDOS\ntres\n');
    expect(t.toString()).toBe('uno\nDOS\ntres\n');
    expect(cambios).toEqual([[{ retain: 4 }, { delete: 3 }, { insert: 'DOS' }]]);
  });

  it('para guardar: el proyecto que está a la vista, solo su archivo o todos si hay más de uno', () => {
    const [a] = armarSesiones(1);
    prepararProyectos(pestana(a));
    const p = primero(pestana(a));
    expect(paraGuardarCodigo(pestana(a))).toEqual({ nombre: 'Código de la sesión.py', texto: LENGUAJES.python.ejemplo, lenguaje: 'python' });
    sumarArchivo(pestana(a), p.id, { nombre: 'datos', ext: 'txt', codigo: '1 2' });
    expect(paraGuardarCodigo(pestana(a)).archivos).toEqual([
      { nombre: 'main', ext: 'py', codigo: LENGUAJES.python.ejemplo, principal: true },
      { nombre: 'datos', ext: 'txt', codigo: '1 2', principal: false },
    ]);
    const sql = crearProyectoDeLaMesa(pestana(a), { nombre: 'Base', lenguaje: 'sql' });
    const { id } = sumarArchivo(pestana(a), sql, { nombre: 'consulta', ext: 'sql', codigo: 'select 1;' });
    expect(paraGuardarCodigo(pestana(a), id)).toEqual({ nombre: 'Base.sql', texto: 'select 1;', lenguaje: 'sql' });
    const texto = textoDelLaboratorio(pestana(a));
    expect(texto).toContain('Proyecto Código de la sesión, en Python.');
    expect(texto).toContain('Archivo main.py, el que corre:');
    expect(texto).toContain('Archivo datos.txt:\n1 2');
    expect(texto).toContain('Proyecto Base, en SQL.');
  });

  it('las salidas compartidas llegan como texto, cortadas, y las rotas no', async () => {
    const [a, b] = armarSesiones();
    compartirSalida(pestana(a), { id: 'r0', nombre: 'Ana' }, { lenguaje: 'python', texto: 'z'.repeat(MAX_SALIDA + 100), final: 'Terminó en 3 ms.' });
    const datosB = pestana(b);
    datosB.set('salida:r9', 'no es un objeto');
    datosB.set('salida:../x', { texto: 'mal id' });
    datosB.set('salida:r8', { nombre: '<b>Beto</b>\u0000', texto: '<img src=x onerror=alert(1)>', lenguaje: 'brainfuck', cuando: 'ayer' });
    await esperar();
    const lista = salidas(pestana(a));
    expect(lista.map((s) => s.de).sort()).toEqual(['r0', 'r8']);
    const ana = lista.find((s) => s.de === 'r0');
    expect(ana.texto).toHaveLength(MAX_SALIDA);
    const beto = lista.find((s) => s.de === 'r8');
    // Text, as it came: React shows it as text, never as HTML.
    expect(beto).toMatchObject({ nombre: '<b>Beto</b>', texto: '<img src=x onerror=alert(1)>', lenguaje: null, cuando: 0 });
    expect(textoDelLaboratorio(pestana(a))).toContain('Ana (Python), Terminó en 3 ms.');
  });

  it('una salida con resultados llega con sus tablas, revisadas', async () => {
    const [a, b] = armarSesiones();
    const filas = Array.from({ length: 40 }, (_, i) => [12000 + i, `Calle ${i}`, null]);
    compartirSalida(pestana(a), { id: 'r0', nombre: 'Ana' }, {
      lenguaje: 'sql',
      texto: 'id | direccion',
      bloques: [
        { tipo: 'texto', texto: 'Cambiaron 2 filas.' },
        { tipo: 'tabla', linea: 4, columnas: ['id', 'direccion', 'zona'], filas },
      ],
      final: 'Terminó en 3 ms.',
    });
    pestana(b).set('salida:r8', { nombre: 'Beto', texto: 'x', bloques: [{ tipo: 'tabla', linea: 1, columnas: ['a'], filas: [[{ html: '<b>' }], ['<img src=x>'], [Infinity]] }, { tipo: 'script', texto: 'no' }] });
    await esperar();
    const lista = salidas(pestana(a));
    const ana = lista.find((s) => s.de === 'r0');
    expect(ana.bloques[0]).toEqual({ tipo: 'texto', texto: 'Cambiaron 2 filas.' });
    expect(ana.bloques[1]).toMatchObject({ tipo: 'tabla', linea: 4, columnas: ['id', 'direccion', 'zona'], recortada: true });
    expect(ana.bloques[1].filas).toHaveLength(30);
    expect(ana.bloques[1].filas[0]).toEqual([12000, 'Calle 0', null]);
    // Cells only as text or numbers; what isn't a block stays out.
    expect(lista.find((s) => s.de === 'r8').bloques).toEqual([{ tipo: 'tabla', linea: 1, columnas: ['a'], filas: [[null], ['<img src=x>'], ['Infinity']], recortada: false, tope: 30 }]);
  });

  it('no se muestran más de las salidas que entran', () => {
    const [a] = armarSesiones(1);
    for (let i = 0; i < MAX_SALIDAS + 5; i += 1) pestana(a).set(`salida:r${i}`, { nombre: `A${i}`, texto: 'hola', cuando: i + 1 });
    expect(salidas(pestana(a))).toHaveLength(MAX_SALIDAS);
  });

  it('los cursores de los otros van por la pestaña, revisados', async () => {
    const [a, b] = armarSesiones();
    a.marcarLocal('p', 'p1');
    b.marcarLocal('p', 'p1');
    prepararProyectos(pestana(a));
    const t = principalDe(primero(pestana(a))).texto;
    await esperar();
    const marcarB = (estado) => b.marcarLocal('h', { ...b.conciencia.getLocalState().h, p1: estado });
    const deB = concienciaDePestana(b.conciencia, 'p1', marcarB);
    const pos = Y.createRelativePositionFromTypeIndex(principalDe(primero(pestana(b))).texto, 3);
    deB.setLocalStateField('cursor', { anchor: pos, head: pos });
    await esperar(CADA_CONCIENCIA + 60);
    const vistos = concienciaDePestana(a.conciencia, 'p1', () => {}).getStates();
    expect(vistos.size).toBe(1);
    const [estado] = vistos.values();
    expect(estado.user).toMatchObject({ name: 'Alumno 1', color: '#123456' });
    const absoluta = Y.createAbsolutePositionFromRelativePosition(Y.createRelativePositionFromJSON(estado.cursor.anchor), a.doc);
    expect(absoluta.index).toBe(3);
    // The caret says its file: the editor of another file leaves it out.
    expect(absoluta.type).toBe(t);

    // A broken caret or a color that isn't one: the caret is left out, the color is the site's.
    b.marcarLocal('color', 'red; background-image: url(https://x.y/z)');
    marcarB({ cursor: { anchor: { item: { client: 'x' } }, head: null } });
    await esperar(CADA_CONCIENCIA + 60);
    expect(concienciaDePestana(a.conciencia, 'p1', () => {}).getStates().size).toBe(0);
    expect(colorValido('red; background-image: url(https://x.y/z)')).toBe('var(--texto-suave)');
    marcarB({ cursor: { anchor: pos, head: pos } });
    await esperar(CADA_CONCIENCIA + 60);
    expect([...concienciaDePestana(a.conciencia, 'p1', () => {}).getStates().values()][0].user.color).toBe('var(--texto-suave)');
  });
});

describe('Calculadora de la mesa', () => {
  it('la calculadora elegida es la misma para todos, y solo una que existe', async () => {
    const [a, b] = armarSesiones();
    elegirCalculadora(pestana(a), 'subred');
    await esperar();
    expect(calculadoraDeMesa(pestana(b)).slug).toBe('subred');
    elegirCalculadora(pestana(b), 'no-existe');
    pestana(b).set('cual', { slug: 'subred' });
    expect(calculadoraDeMesa(pestana(b))).toBeNull();
  });

  it('lo que carga uno lo ve el otro, campo por campo, sin pisarse', async () => {
    const [a, b] = armarSesiones();
    const inicial = { modelo: 'basico', datos: {} };
    const ma = memoriaDeMesa(pestana(a));
    const mb = memoriaDeMesa(pestana(b));
    ma.escribir('calc:x', { modelo: 'basico', datos: { basico: { D: '10', L: '2' } } }, inicial);
    await esperar();
    expect(mb.leer('calc:x', inicial)).toEqual({ modelo: 'basico', datos: { basico: { D: '10', L: '2' } } });
    // The same object while nothing changes (React asks for it often).
    expect(mb.leer('calc:x', { ...inicial })).toBe(mb.leer('calc:x', inicial));

    // At the same time, each one in a field.
    ma.escribir('calc:x', (e) => ({ ...e, datos: { basico: { ...e.datos.basico, D: '12' } } }), inicial);
    mb.escribir('calc:x', (e) => ({ ...e, datos: { basico: { ...e.datos.basico, L: '3' } } }), inicial);
    await esperar();
    expect(ma.leer('calc:x', inicial).datos.basico).toEqual({ D: '12', L: '3' });
    expect(mb.leer('calc:x', inicial).datos.basico).toEqual({ D: '12', L: '3' });
  });

  it('lo que llega roto, de otro tipo o de más no entra', async () => {
    const [a, b] = armarSesiones();
    const inicial = { texto: 'hola', filas: [['a']], n: 1 };
    const datosB = pestana(b);
    datosB.set('v|calc:y|texto', { no: 'texto' });
    datosB.set('v|calc:y|filas', 'no es lista');
    datosB.set('v|calc:y|n', 'x'.repeat(9000));
    datosB.set('v|calc:y|__proto__/polucion', 'sí');
    datosB.set('v|calc:y|extra', 'z'.repeat(9000));
    await esperar();
    const leido = memoriaDeMesa(pestana(a)).leer('calc:y', inicial);
    expect(leido.texto).toBe('hola');
    expect(leido.filas).toEqual([['a']]);
    expect(leido.n).toBe(1);
    expect(leido.extra).toHaveLength(5000);
    expect({}.polucion).toBeUndefined();
    expect(Object.keys(leido)).not.toContain('__proto__');
  });

  it('un estado se parte en campos y se vuelve a armar igual', () => {
    const estado = { a: '1', b: { c: [1, 2], d: { e: 'x/y' } }, vacio: {}, lista: [], nada: null };
    expect(armar(aplanar(estado))).toEqual(estado);
    expect(armar(aplanar('solo texto'))).toBe('solo texto');
  });
});
