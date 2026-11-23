import { Blob as BlobDeNode } from 'node:buffer';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { enLinea, leerFormato } from './formato';
import { fijarUsuario, mioActual } from './mio';
import {
  agregadaDe, agregarBloques, agregarCategoria, borrarBloque, borrarCategoria, borrarPropia, cambiarBloque, crearPropia, esAgregada, moverBloque, moverCategoria, pasarBloque, propiaDe, renombrarCategoria, renombrarPropia, pasarASeccion, seccionesDondeSumar, seccionesTuyas, sumarDondeSea, sumarEnSeccion, sumarPropia, sumarSeccionPropia, unirClassroomPropia,
} from './propias';
import {
  archivoDeMateria, guardarMateria, hashDeMateria, hayMateriaEnHash, leerArchivoMateria, LIMITE_ARCHIVOS, LIMITE_ZIP, materiaDeHash, MAX_ARCHIVOS, nombreDelArchivo, porQueNoEntra, resumenDeMateria, tieneArchivos,
} from './paquetePropia';
import { esDelSantoResumen, LIMITES, linea, mimeDe, parrafos, sanearBloque, sanearPropia, sanearPropias, SIN_TIPO } from './propiasSaneo';
import { categoriasDeCampus, faltaDe, itemDeBloque, itemDeCampus, nombreSinCampus, resumenDePropia } from './propiasVista';

// The Blob of jsdom has no arrayBuffer. The browser's and Node's do.
globalThis.Blob = BlobDeNode;

const borrados = vi.hoisted(() => []);
vi.mock('./bodega', () => ({
  borrarDeBodega: vi.fn(async (usuario, ids) => {
    borrados.push(...ids);
  }),
  guardarEnBodega: vi.fn(async () => {}),
  leerDeBodega: vi.fn(async () => {
    throw new Error('no');
  }),
}));

const propia = (extra = {}) => ({
  id: 'pabc1234',
  nombre: 'Algoritmos Genéticos Resumida',
  base: 7,
  categorias: [
    {
      id: 1,
      nombre: 'Resúmenes',
      bloques: [
        { id: 11, tipo: 'archivo', archivoId: 'arch00001', nombre: 'resumen.pdf', peso: 3, mime: 'text/html' },
        { id: 12, tipo: 'campus', materiaId: 7, clave: '55', nombre: 'Guía 1', clase: 'archivo' },
      ],
    },
    { id: 2, nombre: 'Consejos', bloques: [{ id: 21, tipo: 'enlace', url: 'https://lutastudios.com/utn/consejos', titulo: 'Consejos' }, { id: 22, tipo: 'texto', texto: '# Ojo\n- **final** oral' }] },
  ],
  cambiada: 100,
  ...extra,
});

beforeEach(() => {
  localStorage.clear();
  borrados.length = 0;
  fijarUsuario(null);
  fijarUsuario(5);
});

describe('saneo', () => {
  it('deja pasar una materia bien armada y le pone el tipo de archivo según su nombre', () => {
    const limpia = sanearPropia(propia());
    expect(limpia.nombre).toBe('Algoritmos Genéticos Resumida');
    expect(limpia.categorias[0].bloques[0].mime).toBe('application/pdf');
    expect(limpia.categorias[1].bloques).toHaveLength(2);
  });

  it('no deja entrar enlaces peligrosos, ids raros ni bloques desconocidos', () => {
    const limpia = sanearPropia(propia({
      categorias: [{
        id: 1,
        nombre: 'x',
        bloques: [
          { id: 1, tipo: 'enlace', url: 'javascript:alert(1)' },
          { id: 2, tipo: 'archivo', archivoId: '../../etc', nombre: 'a.pdf' },
          { id: 3, tipo: 'campus', materiaId: 'abc', clave: '1' },
          { id: 4, tipo: 'html', html: '<script>' },
          { id: 'x', tipo: 'texto', texto: 'hola' },
          { id: 5, tipo: 'texto', texto: '   ' },
          { id: 6, tipo: 'enlace', url: 'https://ok.com/a' },
          { id: 6, tipo: 'enlace', url: 'https://ok.com/repetido' },
        ],
      }],
    }));
    expect(limpia.categorias[0].bloques.map((b) => b.id)).toEqual([6]);
  });

  it('un archivo que dice ser una página web queda solo para descargar', () => {
    expect(mimeDe('truco.html')).toBe(SIN_TIPO);
    expect(mimeDe('foto.JPG')).toBe('image/jpeg');
    const b = sanearBloque({ id: 1, tipo: 'archivo', archivoId: 'abcdefgh', nombre: 'pagina.svg', mime: 'image/svg+xml' });
    expect(b.mime).toBe(SIN_TIPO);
  });

  it('saca los caracteres invisibles que dan vuelta o disfrazan un nombre', () => {
    expect(linea('fdp.‮exe​  ok', 50)).toBe('fdp.exe ok');
    expect(parrafos('uno\r\n\n\n\ndos\u0007', 50)).toBe('uno\n\ndos');
  });

  it('una materia sin nombre o con un id raro no entra, y hay un tope de materias', () => {
    expect(sanearPropia(propia({ nombre: '  ' }))).toBeNull();
    expect(sanearPropia(propia({ id: 'x' }))).toBeNull();
    const muchas = Array.from({ length: LIMITES.materias + 5 }, (_, i) => propia({ id: `p${String(i).padStart(6, '0')}` }));
    expect(sanearPropias(muchas)).toHaveLength(LIMITES.materias);
  });

  it('lo del campus va por número: su nombre no se guarda ni viaja', () => {
    const b = sanearBloque({ id: 1, tipo: 'campus', materiaId: 7, clave: '55', nombre: 'Guía 1', clase: 'archivo' });
    expect(b).toEqual({ id: 1, tipo: 'campus', materiaId: 7, clave: '55', clase: 'archivo' });
    expect(JSON.stringify(sanearPropia(propia()))).not.toContain('Guía 1');
  });

  it('reconoce los enlaces a El Santo Resumen y nada más', () => {
    expect(esDelSantoResumen('https://lutastudios.com/utn')).toBe(true);
    expect(esDelSantoResumen('https://lutastudios.com/utn/sistemas/algoritmos')).toBe(true);
    expect(esDelSantoResumen('https://lutastudios.com/utnfalso')).toBe(false);
    expect(esDelSantoResumen('http://lutastudios.com/utn')).toBe(false);
    expect(esDelSantoResumen('https://lutastudios.com.malo.com/utn')).toBe(false);
  });
});

describe('formato', () => {
  it('negrita, cursiva y enlaces seguros', () => {
    expect(enLinea('**uno** y *dos* en https://a.com/x.')).toEqual([
      { tipo: 'negrita', texto: 'uno' },
      { tipo: 'texto', texto: ' y ' },
      { tipo: 'cursiva', texto: 'dos' },
      { tipo: 'texto', texto: ' en ' },
      { tipo: 'enlace', texto: 'https://a.com/x', url: 'https://a.com/x' },
      { tipo: 'texto', texto: '.' },
    ]);
  });

  it('lo que no cierra queda como se escribió', () => {
    expect(enLinea('2 * 3 = 6')).toEqual([{ tipo: 'texto', texto: '2 * 3 = 6' }]);
    expect(enLinea('**abierto')).toEqual([{ tipo: 'texto', texto: '**abierto' }]);
  });

  it('títulos, listas y párrafos con sus renglones', () => {
    const bloques = leerFormato('# Unidad 1\n- uno\n- dos\nrenglón a\nrenglón b\n\notro');
    expect(bloques.map((b) => b.tipo)).toEqual(['titulo', 'lista', 'parrafo', 'parrafo']);
    expect(bloques[1].items).toHaveLength(2);
    expect(bloques[2].lineas).toHaveLength(2);
  });

  it('nunca devuelve HTML: una etiqueta queda como texto', () => {
    expect(leerFormato('<img src=x onerror=alert(1)>')[0].lineas[0]).toEqual([{ tipo: 'texto', texto: '<img src=x onerror=alert(1)>' }]);
  });
});

describe('materias propias', () => {
  it('lo tuyo en una sección del campus va atado a su número, y lo de una sección tuya, a ella', () => {
    const texto = { tipo: 'texto', texto: 'Ojo con el parcial' };
    const enCampus = sumarEnSeccion(7, 3, [texto, { tipo: 'enlace', url: 'https://example.org/a', titulo: '' }]);
    expect(enCampus.ids).toHaveLength(2);
    const otra = sumarEnSeccion(7, 3, [texto]);
    expect(otra.propia).toBe(enCampus.propia);
    let propia = agregadaDe(mioActual(), 7);
    expect(propia.categorias).toHaveLength(1);
    expect(propia.categorias[0]).toMatchObject({ campus: 3 });
    expect(propia.categorias[0].bloques.map((b) => b.id)).toEqual([...enCampus.ids, ...otra.ids]);
    // Not a section of its own.
    expect(seccionesTuyas(propia)).toEqual([]);

    const { categoria } = sumarSeccionPropia(7, 'Para el final');
    expect(sumarEnSeccion(7, `p${categoria}`, [texto]).ids).toHaveLength(1);
    expect(sumarEnSeccion(7, 'p123', [texto])).toBeNull();
    expect(sumarEnSeccion(7, 'x', [texto])).toBeNull();
    expect(sumarEnSeccion(7, -1, [texto])).toBeNull();
    expect(sumarEnSeccion(7, 3, [])).toBeNull();
    propia = agregadaDe(mioActual(), 7);
    expect(seccionesTuyas(propia).map((c) => c.nombre)).toEqual(['Para el final']);

    // Moving the student's sections skips the ones tied to the campus.
    const segunda = sumarSeccionPropia(7, 'Resúmenes').categoria;
    sumarEnSeccion(7, 5, [texto]);
    moverCategoria(propia.id, segunda, -1);
    expect(seccionesTuyas(agregadaDe(mioActual(), 7)).map((c) => c.nombre)).toEqual(['Resúmenes', 'Para el final']);
    moverCategoria(propia.id, segunda, -1);
    expect(seccionesTuyas(agregadaDe(mioActual(), 7)).map((c) => c.nombre)).toEqual(['Resúmenes', 'Para el final']);

    // Left empty, the one tied to the campus goes away.
    propia = agregadaDe(mioActual(), 7);
    const atada = propia.categorias.find((c) => c.campus === 5);
    borrarBloque(propia.id, atada.id, atada.bloques[0].id);
    expect(agregadaDe(mioActual(), 7).categorias.some((c) => c.campus === 5)).toBe(false);
  });

  it('lo que llega de afuera va a una sección de una propia o a una tuya de una materia del campus, o a una nueva', () => {
    const texto = { tipo: 'texto', texto: 'Ojo' };
    // A campus course: a new section of the student's, and then that one.
    expect(seccionesDondeSumar(mioActual(), 7)).toEqual([]);
    expect(sumarDondeSea(7, null, 'Compartido', [texto, texto])).toBe(2);
    const [nueva] = seccionesDondeSumar(mioActual(), 7);
    expect(nueva.nombre).toBe('Compartido');
    expect(sumarDondeSea(7, nueva.id, 'Compartido', [texto])).toBe(1);
    expect(seccionesDondeSumar(mioActual(), 7)[0].bloques).toHaveLength(3);
    expect(sumarDondeSea(7, 999, 'Compartido', [texto])).toBe(0);
    // A course of the student's own.
    const id = crearPropia({ nombre: 'Mía' });
    const [general] = seccionesDondeSumar(mioActual(), id);
    expect(sumarDondeSea(id, general.id, 'Compartido', [texto])).toBe(1);
    expect(sumarDondeSea(id, null, 'Compartido', [texto])).toBe(1);
    expect(seccionesDondeSumar(mioActual(), id).map((c) => [c.nombre, c.bloques.length])).toEqual([['General', 1], ['Compartido', 1]]);
    expect(seccionesDondeSumar(mioActual(), null)).toEqual([]);
  });

  it('lo tuyo pasa de sección guardado donde se ve, con su número, y no se va con la sección que deja', () => {
    const { categoria } = sumarSeccionPropia(7, 'Para el final');
    const [texto] = sumarEnSeccion(7, `p${categoria}`, [{ tipo: 'texto', texto: 'Ojo' }]).ids;
    expect(pasarASeccion(7, texto, 3)).toBe(true);
    let propia = agregadaDe(mioActual(), 7);
    expect(propia.categorias.find((c) => c.campus === 3).bloques.map((b) => b.id)).toEqual([texto]);
    expect(propia.categorias.find((c) => c.id === categoria).bloques).toEqual([]);
    // From the campus' section to another one: the empty one tied to the first goes away.
    expect(pasarASeccion(7, texto, 4)).toBe(true);
    propia = agregadaDe(mioActual(), 7);
    expect(propia.categorias.map((c) => c.campus)).toEqual([undefined, 4]);
    expect(pasarASeccion(7, texto, 4)).toBe(true);
    expect(pasarASeccion(7, texto, 'p999')).toBe(false);
    expect(pasarASeccion(7, 12345, 3)).toBe(false);
    expect(pasarASeccion(8, texto, 3)).toBe(false);
    borrarCategoria(propia.id, categoria);
    expect(agregadaDe(mioActual(), 7).categorias.find((c) => c.campus === 4).bloques.map((b) => b.id)).toEqual([texto]);
  });

  it('una categoría atada al campus solo vale en las secciones tuyas, y con un número', () => {
    const base = { id: 'pabcdef12', nombre: 'x', categorias: [{ id: 5, nombre: 'En el campus', campus: 3, bloques: [{ id: 6, tipo: 'texto', texto: 'hola' }] }] };
    expect(sanearPropia({ ...base, de: 7 }).categorias[0].campus).toBe(3);
    expect(sanearPropia(base).categorias[0]).not.toHaveProperty('campus');
    for (const raro of ['3', -1, 1.5, null]) {
      expect(sanearPropia({ ...base, de: 7, categorias: [{ ...base.categorias[0], campus: raro }] }).categorias).toEqual([]);
    }
  });

  it('las secciones tuyas de una materia del campus: una sola «materia» por curso, con su número y sin su nombre', () => {
    expect(sumarSeccionPropia(7, '   ')).toBeNull();
    const una = sumarSeccionPropia(7, 'Para el final');
    const otra = sumarSeccionPropia(7, 'Resúmenes');
    expect(otra.propia).toBe(una.propia);
    const propia = agregadaDe(mioActual(), 7);
    expect(esAgregada(propia)).toBe(true);
    expect(propia).toMatchObject({ de: 7, base: null, nombre: 'Tus secciones' });
    expect(propia.categorias.map((c) => c.nombre)).toEqual(['Para el final', 'Resúmenes']);
    expect(agregadaDe(mioActual(), 8)).toBeNull();
    const mia = crearPropia({ nombre: 'Mía' });
    expect(esAgregada(propiaDe(mioActual(), mia))).toBe(false);
    expect(sanearPropia({ id: 'pabcdef12', nombre: 'x', de: 'drop table' }).de).toBeNull();
    expect(sanearPropia({ id: 'pabcdef12', nombre: 'x', de: '12' }).de).toBe(12);
  });

  it('se crea, se renombra y se borra con sus archivos', () => {
    const id = crearPropia({ nombre: 'Mi materia' });
    expect(propiaDe(mioActual(), id).categorias[0].nombre).toBe('General');
    expect(renombrarPropia(id, '   ')).toBe(false);
    expect(renombrarPropia(id, 'Otra')).toBe(true);
    const cat = propiaDe(mioActual(), id).categorias[0].id;
    agregarBloques(id, cat, [{ tipo: 'archivo', archivoId: 'arch00001', nombre: 'a.pdf', peso: 3 }]);
    expect(borrarPropia(id)).toBe(true);
    expect(mioActual().propias).toEqual([]);
    expect(borrados).toEqual(['arch00001']);
  });

  it('una materia de Classroom guarda solo el número de su curso, que se cambia, se saca y viaja al compartirla', () => {
    const id = crearPropia({ nombre: 'Física II', classroom: '700001' });
    expect(propiaDe(mioActual(), id).classroom).toBe('700001');
    expect(unirClassroomPropia(id, '700002')).toBe(true);
    expect(propiaDe(mioActual(), id).classroom).toBe('700002');
    unirClassroomPropia(id, '');
    expect(propiaDe(mioActual(), id).classroom).toBeNull();
    for (const malo of ['no', 'abc', '1'.repeat(25), 700001]) expect(sanearPropia(propia({ classroom: malo })).classroom).toBeNull();
    const { propia: llegada } = materiaDeHash(hashDeMateria(sanearPropia(propia({ classroom: '700001', categorias: [] }))));
    expect(llegada.classroom).toBe('700001');
  });

  it('categorías: se agregan, se renombran, se mueven y se borran', () => {
    const id = crearPropia({ nombre: 'M', categorias: [{ nombre: 'Uno' }] });
    const dos = agregarCategoria(id, 'Dos');
    renombrarCategoria(id, dos, 'Segunda');
    moverCategoria(id, dos, -1);
    expect(propiaDe(mioActual(), id).categorias.map((c) => c.nombre)).toEqual(['Segunda', 'Uno']);
    moverCategoria(id, dos, -1);
    expect(propiaDe(mioActual(), id).categorias[0].nombre).toBe('Segunda');
    borrarCategoria(id, dos);
    expect(propiaDe(mioActual(), id).categorias.map((c) => c.nombre)).toEqual(['Uno']);
  });

  it('bloques: se agregan, se cambian, se mueven, pasan de categoría y se borran', () => {
    const id = crearPropia({ nombre: 'M', categorias: [{ nombre: 'A' }, { nombre: 'B' }] });
    const [a, b] = propiaDe(mioActual(), id).categorias.map((c) => c.id);
    expect(agregarBloques(id, a, [{ tipo: 'texto', texto: 'uno' }, { tipo: 'texto', texto: 'dos' }, { tipo: 'enlace', url: 'javascript:x' }])).toBe(3);
    // The bad link is dropped by the sanitizer on save.
    let bloques = propiaDe(mioActual(), id).categorias[0].bloques;
    expect(bloques.map((x) => x.texto)).toEqual(['uno', 'dos']);
    cambiarBloque(id, a, bloques[0].id, { texto: 'UNO', tipo: 'enlace' });
    moverBloque(id, a, bloques[0].id, 1);
    bloques = propiaDe(mioActual(), id).categorias[0].bloques;
    expect(bloques.map((x) => x.texto)).toEqual(['dos', 'UNO']);
    expect(pasarBloque(id, a, bloques[1].id, b)).toBe(true);
    expect(propiaDe(mioActual(), id).categorias[1].bloques.map((x) => x.texto)).toEqual(['UNO']);
    borrarBloque(id, a, bloques[0].id);
    expect(propiaDe(mioActual(), id).categorias[0].bloques).toEqual([]);
  });

  it('una materia entera del campus, creada de una vez, no pierde nada por ids repetidos', () => {
    const muchos = Array.from({ length: 280 }, (_, i) => ({ tipo: 'campus', materiaId: 7, clave: String(i + 1), clase: 'archivo' }));
    const id = crearPropia({ nombre: 'M', base: 7, categorias: [{ nombre: 'A', bloques: muchos }, { nombre: 'B', bloques: muchos }] });
    expect(propiaDe(mioActual(), id).categorias.map((c) => c.bloques.length)).toEqual([280, 280]);
  });

  it('no pasa del tope de bloques por categoría', () => {
    const id = crearPropia({ nombre: 'M' });
    const cat = propiaDe(mioActual(), id).categorias[0].id;
    const muchos = Array.from({ length: LIMITES.bloques + 10 }, (_, i) => ({ tipo: 'texto', texto: `t${i}` }));
    expect(agregarBloques(id, cat, muchos)).toBe(LIMITES.bloques);
    expect(agregarBloques(id, cat, [{ tipo: 'texto', texto: 'más' }])).toBe(0);
  });

  it('sin alumno no se guarda nada', () => {
    fijarUsuario(null);
    expect(crearPropia({ nombre: 'M' })).toBeNull();
  });
});

describe('vista', () => {
  const campus = { materiaId: 7, clave: '55', clase: 'archivo', id: 1, tipo: 'campus' };
  const items = [{ clave: '55', nombre: 'Guía 1', materiaId: 7 }];

  it('lo del campus toma su nombre del campus de quien la abre, y si no, dice por qué', () => {
    const contenidos = new Map([[7, items]]);
    expect(itemDeCampus(campus, contenidos).nombre).toBe('Guía 1');
    expect(faltaDe(campus, { contenidos, suyas: new Map([[7, {}]]) })).toBeNull();
    expect(faltaDe({ ...campus, clave: '99' }, { contenidos, suyas: new Map([[7, {}]]) })).toBe('campus');
    expect(faltaDe({ ...campus, materiaId: 8 }, { contenidos, suyas: new Map([[7, {}]]) })).toBe('materia');
    // A course just added is still loading: not foreign.
    expect(faltaDe({ ...campus, materiaId: 8 }, { contenidos, suyas: new Map([[7, {}], [8, {}]]) })).toBe('buscando');
    expect(faltaDe(campus, { contenidos: null, suyas: null, error: 'x' })).toBe('error');
    expect(nombreSinCampus(campus)).toBe('Un archivo del campus');
  });

  it('un archivo tuyo se lee de este navegador y un enlace del Santo se marca', () => {
    const leer = vi.fn(async () => 'bytes');
    const p = sanearPropia(propia());
    const archivo = itemDeBloque(p.categorias[0].bloques[0], { propia: p, categoria: p.categorias[0], leer });
    archivo.traer();
    expect(leer).toHaveBeenCalledWith('arch00001', 'resumen.pdf');
    expect(archivo).toMatchObject({ tipo: 'archivo', mime: 'application/pdf', materia: 'Algoritmos Genéticos Resumida', seccion: 'Resúmenes' });
    expect(itemDeBloque(p.categorias[1].bloques[0], { propia: p, categoria: p.categorias[1], leer })).toMatchObject({ santo: true, dominio: 'lutastudios.com', nombre: 'Consejos' });
  });

  it('las secciones de la original pasan como categorías, con sus cosas por número', () => {
    const cats = categoriasDeCampus({ id: 7 }, [{ seccionId: 1, seccion: 'Unidad 1', clave: '10', nombre: 'Apunte', tipo: 'archivo' }, { seccionId: 1, seccion: 'Unidad 1', clave: '11', tipo: 'enlace' }, { seccionId: 2, seccion: '', clave: '20', tipo: 'actividad' }]);
    expect(cats).toEqual([
      { nombre: 'Unidad 1', bloques: [{ tipo: 'campus', materiaId: 7, clave: '10', clase: 'archivo' }, { tipo: 'campus', materiaId: 7, clave: '11', clase: 'enlace' }] },
      { nombre: 'General', bloques: [{ tipo: 'campus', materiaId: 7, clave: '20', clase: 'actividad' }] },
    ]);
    expect(resumenDePropia(sanearPropia(propia()))).toBe('2 categorías, un archivo tuyo');
    expect(resumenDePropia(sanearPropia(propia({ categorias: [] })))).toBe('Vacía');
  });
});

describe('compartir por link', () => {
  it('ida y vuelta, con un id nuevo', () => {
    const sinArchivos = sanearPropia(propia({ categorias: propia().categorias.slice(1) }));
    const hash = hashDeMateria(sinArchivos);
    expect(hayMateriaEnHash(hash)).toBe(true);
    const { propia: llegada } = materiaDeHash(hash);
    expect(llegada.id).not.toBe(sinArchivos.id);
    expect(llegada.nombre).toBe(sinArchivos.nombre);
    expect(llegada.categorias).toEqual(sinArchivos.categorias);
  });

  it('un link roto o de otra cosa avisa', () => {
    expect(() => materiaDeHash('#materia=@@@')).toThrow(/llegó cortado/);
    expect(() => materiaDeHash('#materia=AAAA')).toThrow(/llegó cortado/);
  });

  it('el nombre del archivo dice si lleva archivos', () => {
    expect(nombreDelArchivo(sanearPropia(propia()))).toBe('materia-algoritmos-geneticos-resumida.zip');
    expect(tieneArchivos(sanearPropia(propia({ categorias: [] })))).toBe(false);
  });
});

describe('compartir por archivo', () => {
  const leer = async () => new Blob([strToU8('%PDF')]);

  it('con archivos arma un ZIP que vuelve con ids nuevos', async () => {
    const original = sanearPropia(propia());
    const zip = await archivoDeMateria(original, leer);
    const llegada = await leerArchivoMateria(zip);
    const archivo = llegada.propia.categorias[0].bloques[0];
    expect(archivo.archivoId).not.toBe('arch00001');
    expect(llegada.archivos.get(archivo.archivoId).type).toBe(SIN_TIPO);
    expect(llegada.archivos.get(archivo.archivoId).size).toBe(4);
    expect(resumenDeMateria(llegada)).toMatchObject({ categorias: 2, archivos: 1, campus: 1, enlaces: 1, textos: 1, materiasDelCampus: [7] });
  });

  it('el ZIP se abre a mano: lleva el manifiesto y cada archivo con su nombre', async () => {
    const zip = await archivoDeMateria(sanearPropia(propia()), leer);
    const nombres = Object.keys(unzipSync(new Uint8Array(await zip.arrayBuffer())));
    expect(nombres).toEqual(['super-cvg-materia.json', 'archivos/arch00001-resumen.pdf']);
  });

  it('antes de armar el ZIP avisa si el otro no lo va a poder abrir', async () => {
    const conArchivos = (n, peso) => sanearPropia(propia({ categorias: [{ id: 1, nombre: 'A', bloques: Array.from({ length: n }, (_, i) => ({ id: i + 1, tipo: 'archivo', archivoId: `arch${String(i).padStart(5, '0')}`, nombre: 'a.pdf', peso })) }] }));
    expect(porQueNoEntra(conArchivos(2, 10))).toBe('');
    expect(porQueNoEntra(conArchivos(MAX_ARCHIVOS, 10))).toBe('');
    expect(porQueNoEntra({ categorias: [conArchivos(MAX_ARCHIVOS, 10).categorias[0], { ...conArchivos(1, 10).categorias[0], bloques: [{ id: 1, tipo: 'archivo', archivoId: 'otroarch1', nombre: 'b.pdf', peso: 1 }] }] })).toMatch(/más de 300 archivos/);
    expect(porQueNoEntra(conArchivos(5, LIMITE_ARCHIVOS / 4))).toMatch(/pasan de 100 MB/);
    await expect(archivoDeMateria(conArchivos(5, LIMITE_ARCHIVOS / 4), leer)).rejects.toThrow(/pasan de 100 MB/);
  });

  it('si falta un archivo en este navegador lo nombra', async () => {
    await expect(archivoDeMateria(sanearPropia(propia()), async () => {
      throw new Error('no');
    })).rejects.toThrow(/Falta «resumen.pdf»/);
  });

  it('sin archivos va el manifiesto solo, y se lee igual', async () => {
    const json = await archivoDeMateria(sanearPropia(propia({ categorias: [] })), leer);
    expect(json.type).toBe('application/json');
    expect((await leerArchivoMateria(json)).propia.nombre).toBe('Algoritmos Genéticos Resumida');
  });

  it('un bloque cuyo archivo no vino queda afuera', async () => {
    const manifiesto = { tipo: 'super-cvg-materia', version: 1, materia: propia() };
    const zip = new Blob([zipSync({ 'super-cvg-materia.json': strToU8(JSON.stringify(manifiesto)) })]);
    const { propia: llegada, archivos } = await leerArchivoMateria(zip);
    expect(llegada.categorias[0].bloques.map((b) => b.tipo)).toEqual(['campus']);
    expect(archivos.size).toBe(0);
    expect((await leerArchivoMateria(zip)).faltaron).toBe(1);
  });

  it('cualquier otra cosa avisa que no es una materia', async () => {
    await expect(leerArchivoMateria(new Blob(['hola']))).rejects.toThrow('Esto no es una materia de Super CVG.');
    await expect(leerArchivoMateria(new Blob([JSON.stringify({ tipo: 'otro' })]))).rejects.toThrow('Esto no es una materia de Super CVG.');
    await expect(leerArchivoMateria(new Blob([zipSync({ 'otro.txt': strToU8('x') })]))).rejects.toThrow('Esto no es una materia de Super CVG.');
    await expect(leerArchivoMateria(new Blob([JSON.stringify({ tipo: 'super-cvg-materia', version: 9 })]))).rejects.toThrow(/versión/);
  });

  it('frena una bomba ZIP por el tamaño que declara, sin inflarla', async () => {
    const manifiesto = strToU8(JSON.stringify({ tipo: 'super-cvg-materia', version: 1, materia: propia() }));
    const bomba = zipSync({ 'super-cvg-materia.json': manifiesto, 'archivos/arch00001-a.pdf': new Uint8Array(LIMITES.archivo + 1) });
    await expect(leerArchivoMateria(new Blob([bomba]))).rejects.toThrow('Esta materia pesa demasiado.');
    await expect(leerArchivoMateria({ size: LIMITE_ZIP + 1 })).rejects.toThrow('Esta materia pesa demasiado.');
  });

  it('guardar: primero los archivos, y si algo falla no queda nada a medias', async () => {
    const zip = await archivoDeMateria(sanearPropia(propia()), leer);
    const llegada = await leerArchivoMateria(zip);
    const guardados = [];
    const id = await guardarMateria(llegada, { guardar: async (u, i) => guardados.push(i), borrar: async () => {} });
    expect(propiaDe(mioActual(), id).nombre).toBe('Algoritmos Genéticos Resumida');
    expect(guardados).toEqual([...llegada.archivos.keys()]);

    const borradosAca = [];
    await expect(guardarMateria(llegada, { guardar: async () => {}, borrar: async (u, ids) => borradosAca.push(...ids), sumar: () => false })).rejects.toThrow(/No se pudo guardar/);
    expect(borradosAca).toEqual([...llegada.archivos.keys()]);
  });

  it('el manifiesto no lleva ni la fecha de cambio ni nada del campus', async () => {
    const json = await archivoDeMateria(sanearPropia(propia({ categorias: propia().categorias.slice(1) })), leer);
    const texto = strFromU8(new Uint8Array(await json.arrayBuffer()));
    expect(JSON.parse(texto).materia.cambiada).toBe(0);
  });
});

describe('sumarPropia', () => {
  it('suma una materia que llegó con su id', () => {
    expect(sumarPropia(sanearPropia(propia()))).toBe(true);
    expect(propiaDe(mioActual(), 'pabc1234').categorias).toHaveLength(2);
  });
});

describe('arreglar una materia propia en el lugar', () => {
  const armar = () => sumarPropia(sanearPropia(propia()));
  const ids = (catId) => propiaDe(mioActual(), 'pabc1234').categorias.find((c) => c.id === catId).bloques.map((b) => b.id);

  it('una categoría va al lugar donde la soltaron', async () => {
    const { ponerCategoria } = await import('./propias');
    armar();
    const tercera = agregarCategoria('pabc1234', 'Finales');
    expect(ponerCategoria('pabc1234', tercera, 0)).toBe(true);
    expect(propiaDe(mioActual(), 'pabc1234').categorias.map((c) => c.nombre)).toEqual(['Finales', 'Resúmenes', 'Consejos']);
    ponerCategoria('pabc1234', tercera, 9);
    expect(propiaDe(mioActual(), 'pabc1234').categorias[0].id).toBe(tercera);
  });

  it('una cosa va antes de otra, en su categoría o en otra, o al final', async () => {
    const { llevarBloque } = await import('./propias');
    armar();
    expect(llevarBloque('pabc1234', 12, 1, 11)).toBe(true);
    expect(ids(1)).toEqual([12, 11]);
    expect(llevarBloque('pabc1234', 12, 2, 22)).toBe(true);
    expect(ids(1)).toEqual([11]);
    expect(ids(2)).toEqual([21, 12, 22]);
    expect(llevarBloque('pabc1234', 11, 2)).toBe(true);
    expect(ids(2)).toEqual([21, 12, 22, 11]);
    expect(llevarBloque('pabc1234', 99, 2)).toBe(false);
    expect(llevarBloque('pabc1234', 21, 99)).toBe(false);
  });

  it('no entra en una categoría llena', async () => {
    const { llevarBloque } = await import('./propias');
    armar();
    agregarBloques('pabc1234', 2, Array.from({ length: LIMITES.bloques }, (_, i) => ({ tipo: 'texto', texto: `t${i}` })));
    expect(llevarBloque('pabc1234', 11, 2)).toBe(false);
    expect(ids(1)).toContain(11);
  });

  it('un archivo propio cambia de nombre y conserva su extensión', async () => {
    const { renombrarArchivo } = await import('./propias');
    armar();
    const archivo = () => propiaDe(mioActual(), 'pabc1234').categorias[0].bloques[0];
    expect(renombrarArchivo('pabc1234', 1, 11, 'Unidad 1')).toBe(true);
    expect(archivo()).toMatchObject({ nombre: 'Unidad 1.pdf', mime: 'application/pdf' });
    expect(renombrarArchivo('pabc1234', 1, 11, 'Unidad 2.PDF')).toBe(true);
    expect(archivo().nombre).toBe('Unidad 2.pdf');
    expect(renombrarArchivo('pabc1234', 1, 11, '   ')).toBe(false);
    expect(renombrarArchivo('pabc1234', 1, 12, 'Lo del campus no')).toBe(false);
    expect(archivo().nombre).toBe('Unidad 2.pdf');
  });

  it('al borrarla se van también sus marcas', async () => {
    const { alternarEn, materiaDe } = await import('./mio');
    armar();
    alternarEn('pabc1234', 'vistos', 'p11');
    expect(materiaDe(mioActual(), 'pabc1234').vistos).toEqual(['p11']);
    borrarPropia('pabc1234');
    expect(mioActual().materias.pabc1234).toBeUndefined();
  });
});
