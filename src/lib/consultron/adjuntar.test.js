import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The photos are read by a fake reader: the test browser has no WebAssembly OCR. What it «reads» is in the name.
vi.mock('./ocr', () => ({
  leerFoto: vi.fn(async (archivo) => {
    if (archivo.name.startsWith('rota')) throw Object.assign(new Error('foto'), { motivo: 'foto' });
    return archivo.name.startsWith('vacia') ? '' : 'Calcular las subredes de 10.0.0.0/16 para 6 áreas.';
  }),
}));

const {
  ENTERO, MAX_ADJUNTOS, TOPE_ADJUNTO, TOPE_TEXTO, adjuntar, claseDe, docsDeCharla, documentoDe, ejercicioDe, enviar, estadoAdjuntos, leerArchivo,
  paginasDeTexto, piezasPropias, preguntaPorDefecto, previaDe, revisar, sacar, soltarCharla,
} = await import('./adjuntar');
const { elegirCalculo } = await import('./calculos');
const { buscarPiezas } = await import('./fuentes');
const { armarPedido, nombreDeTrozo } = await import('./pedido');

// What a file has that this needs: jsdom's File can't give its text.
let reloj = 0;
const archivo = (name, contenido = 'Un semáforo protege la sección crítica.', { type = '', size } = {}) => ({
  name,
  type,
  size: size ?? contenido.length,
  lastModified: (reloj += 1),
  text: async () => contenido,
});

describe('qué se puede adjuntar', () => {
  it('fotos, PDF y texto, por el nombre o, sin extensión, por el tipo', () => {
    expect(['foto.JPG', 'a.jpeg', 'b.png', 'c.webp'].map((n) => claseDe(archivo(n)))).toEqual(['foto', 'foto', 'foto', 'foto']);
    expect(claseDe(archivo('tp.pdf'))).toBe('pdf');
    expect(['n.txt', 'n.md', 'm.c', 'm.h', 'm.py', 'q.sql', 'd.csv', 'M.java', 'm.js'].every((n) => claseDe(archivo(n)) === 'texto')).toBe(true);
    expect(claseDe(archivo('', '', { type: 'image/png' }))).toBe('foto');
    expect(claseDe(archivo('notas.docx'))).toBeNull();
    expect(claseDe(archivo('foto.heic', '', { type: 'image/heic' }))).toBeNull();
  });

  it('hasta 5 y 20 MB cada uno, y dice por qué no va cada uno', () => {
    const seis = Array.from({ length: 6 }, (_, i) => archivo(`f${i}.txt`));
    const { van, problemas } = revisar(seis);
    expect(van).toHaveLength(MAX_ADJUNTOS);
    expect(problemas).toEqual(['Van hasta 5 archivos por pregunta. Quedó afuera «f5.txt».']);
    expect(revisar([archivo('a.txt'), archivo('b.txt'), archivo('c.txt')], seis.slice(0, 4)).problemas).toEqual(['Van hasta 5 archivos por pregunta. Quedaron afuera «b.txt» y «c.txt».']);
    expect(revisar([archivo('grande.pdf', '', { size: TOPE_ADJUNTO + 1 })]).problemas).toEqual(['«grande.pdf» pesa más de 20 MB. Probá con uno más liviano.']);
    expect(revisar([archivo('justo.pdf', '', { size: TOPE_ADJUNTO })]).van).toHaveLength(1);
    expect(revisar([archivo('notas.docx')]).problemas).toEqual(['No puedo leer «notas.docx». Guardalo como PDF y adjuntalo.']);
    expect(revisar([archivo('foto.heic', 'x', { type: 'image/heic' })]).problemas).toEqual(['No puedo leer «foto.heic». Pasala a JPG o PNG.']);
    expect(revisar([archivo('cosas.zip')]).problemas).toEqual(['No puedo leer «cosas.zip». Van fotos, PDF y archivos de texto.']);
    expect(revisar([archivo('nada.txt', '')]).problemas).toEqual(['«nada.txt» está vacío. Probá con otro.']);
    const ya = archivo('ya.txt');
    expect(revisar([ya], [ya]).problemas).toEqual(['«ya.txt» ya está adjunto.']);
  });
});

describe('cómo se lee cada uno', () => {
  const leer = (lectores) => ({ foto: async () => '', pdf: async () => [], texto: (a) => a.text(), ...lectores });

  it('un texto tal cual, en páginas cortadas entre líneas, y avisa si es muy largo', async () => {
    expect(await leerArchivo(archivo('a.py', 'def f():\n    return 1\n'), 'texto', { leer: leer() })).toEqual({ paginas: ['def f():\n    return 1\n'], aviso: undefined });
    const largo = await leerArchivo(archivo('datos.csv', 'x,y\n'.repeat(TOPE_TEXTO / 4 + 10)), 'texto', { leer: leer() });
    expect(largo.aviso).toBe('«datos.csv» es muy largo. Leí solo el principio.');
    expect(largo.paginas.join('').length).toBeLessThanOrEqual(TOPE_TEXTO);
    expect(paginasDeTexto('linea\n'.repeat(1000)).every((p) => p.length <= 2706)).toBe(true);
    await expect(leerArchivo(archivo('raro.txt', 'PK\u0000\u0003'), 'texto', { leer: leer() })).rejects.toMatchObject({ problema: '«raro.txt» no es un archivo de texto. Van fotos, PDF y archivos de texto.' });
    await expect(leerArchivo(archivo('blanco.md', '  \n '), 'texto', { leer: leer() })).rejects.toMatchObject({ problema: '«blanco.md» está vacío. Probá con otro.' });
  });

  it('una foto, con el texto que saca el lector, o por qué no', async () => {
    const foto = archivo('ej.jpg');
    expect(await leerArchivo(foto, 'foto', { leer: leer({ foto: async () => 'x² + 3x = 0' }) })).toEqual({ paginas: ['x² + 3x = 0'] });
    await expect(leerArchivo(foto, 'foto', { leer: leer({ foto: async () => ' . ' }) })).rejects.toMatchObject({ problema: 'No encontré texto en «ej.jpg». Probá con una foto más nítida.' });
    // With «Usar Gemini» it stays: Gemini looks at the photo itself.
    expect(await leerArchivo(foto, 'foto', { leer: leer({ foto: async () => ' . ' }), fotoSinTexto: true })).toEqual({ paginas: ['La foto no tiene texto escrito.'] });
    await expect(leerArchivo(foto, 'foto', { leer: leer({ foto: async () => { throw Object.assign(new Error(), { motivo: 'lector' }); } }) })).rejects.toMatchObject({ problema: 'No pude cargar el lector de fotos. Probá de nuevo en un rato.' });
    await expect(leerArchivo(foto, 'foto', { leer: leer({ foto: async () => { throw new Error('rota'); } }) })).rejects.toMatchObject({ problema: 'No pude abrir «ej.jpg». Probá con otra foto.' });
    await expect(leerArchivo(foto, 'foto', { leer: leer({ foto: async () => { throw new DOMException('x', 'AbortError'); } }) })).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('un PDF por página, y dice si es un escaneo o tiene contraseña', async () => {
    const pdf = archivo('tp.pdf');
    expect(await leerArchivo(pdf, 'pdf', { leer: leer({ pdf: async () => ['', 'La página dos tiene texto.'] }) })).toEqual({ paginas: ['', 'La página dos tiene texto.'] });
    await expect(leerArchivo(pdf, 'pdf', { leer: leer({ pdf: async () => ['', ' '] }) })).rejects.toMatchObject({ problema: '«tp.pdf» no tiene texto, parece escaneado. Sacale fotos a las páginas.' });
    await expect(leerArchivo(pdf, 'pdf', { leer: leer({ pdf: async () => { throw Object.assign(new Error(), { name: 'PasswordException' }); } }) })).rejects.toMatchObject({ problema: '«tp.pdf» tiene contraseña. Sacásela y adjuntalo de nuevo.' });
    await expect(leerArchivo(pdf, 'pdf', { leer: leer({ pdf: async () => { throw new Error('roto'); } }) })).rejects.toMatchObject({ problema: 'No pude abrir «tp.pdf». Probá con otro PDF.' });
  });
});

const doc = (id, clase, nombre, paginas) => documentoDe({ id, clase, nombre, archivo: archivo(nombre), mime: 'text/plain', paginas });

describe('cómo se suman a las piezas', () => {
  it('lo corto queda aunque sea muy corto, y el código con sus líneas', () => {
    expect(doc('a1', 'foto', 'ec.jpg', ['x² + 3x = 0']).trozos).toEqual([{ doc: 'adjunto:a1', pagina: 1, texto: 'x² + 3x = 0' }]);
    const codigo = doc('a2', 'texto', 'f.py', ['def f(x):\n    return x * 2\n']);
    expect(codigo.trozos[0].texto).toBe('def f(x):\n    return x * 2');
    expect(codigo.fuente).toMatchObject({ tipo: 'adjunto', clase: 'texto', nombre: 'f.py', adjunto: 'a2' });
    expect(doc('a3', 'pdf', 'uno.pdf', ['Sola línea.']).trozos).toEqual([{ doc: 'adjunto:a3', pagina: 1, texto: 'Sola línea.' }]);
  });

  it('uno corto va entero; de uno largo, lo que coincide con la pregunta o, sin pregunta, el principio', () => {
    const corto = doc('c', 'foto', 'ej.jpg', ['Calcular la media de 2, 4 y 6.']);
    const relleno = (tema, n) => Array.from({ length: n }, (_, i) => `Párrafo ${i} sobre ${tema} con bastante texto para llenar la página del apunte y que no quepa entero.`).join(' ');
    const largo = doc('l', 'pdf', 'largo.pdf', [relleno('colas', 12), relleno('inventarios', 12), `${relleno('colas', 4)} El semáforo protege la sección crítica.`]);
    expect(largo.paginas.join('').length).toBeGreaterThan(ENTERO);
    const conPregunta = piezasPropias([largo], '¿Qué protege el semáforo?', 4);
    expect(conPregunta[0].trozo.texto).toContain('semáforo');
    expect(conPregunta[0].trozo.fuente.nombre).toBe('largo.pdf');
    expect(piezasPropias([largo], '', 2).map((e) => e.trozo.pagina)).toEqual([1, 1]);
    // One of each in turn, up to how many go.
    const juntos = piezasPropias([corto, largo], '', 3);
    expect(juntos.map((e) => e.trozo.doc)).toEqual(['adjunto:c', 'adjunto:l', 'adjunto:l']);
    expect(juntos.every((e) => e.puntaje === Infinity)).toBe(true);
  });

  it('el modelo sabe que es algo que adjuntó, y la pantalla abre la foto o el PDF', () => {
    const foto = { tipo: 'adjunto', clase: 'foto', nombre: 'ej.jpg', adjunto: 'a1', archivo: archivo('ej.jpg'), mime: 'image/jpeg' };
    expect(nombreDeTrozo({ fuente: foto, pagina: 1 })).toBe('foto «ej.jpg» que adjuntó el alumno, su texto leído de la imagen');
    expect(nombreDeTrozo({ fuente: { ...foto, clase: 'pdf', nombre: 'tp.pdf' }, pagina: 3 })).toBe('PDF «tp.pdf» que adjuntó el alumno, pág. 3');
    // What Classroom says, what the student added on their own and the screen beside Consultron say what they are.
    expect(nombreDeTrozo({ fuente: { tipo: 'classroom', clase: 'Tarea', nombre: 'TP 1', materia: 'Física II' }, pagina: 1 })).toBe('tarea «TP 1» del Classroom de Física II');
    expect(nombreDeTrozo({ fuente: { tipo: 'classroom', clase: 'Mensaje', nombre: 'No hay clase' }, pagina: 1 })).toBe('mensaje del tablón «No hay clase» del Classroom');
    expect(nombreDeTrozo({ fuente: { tipo: 'propia', clase: 'foto', nombre: 'Pizarrón', materia: 'Robótica' }, pagina: 1 })).toBe('foto «Pizarrón» que guardó el alumno en Robótica, su texto leído de la imagen');
    expect(nombreDeTrozo({ fuente: { tipo: 'propia', clase: 'texto', nombre: 'Servos', materia: 'Robótica' }, pagina: 1 })).toBe('texto «Servos» que escribió el alumno en Robótica');
    expect(nombreDeTrozo({ fuente: { tipo: 'propia', clase: 'nota', nombre: 'Tu nota', materia: 'Redes' }, pagina: 1 })).toBe('nota que escribió el alumno en Redes');
    expect(nombreDeTrozo({ fuente: { tipo: 'pantalla', nombre: 'Raíces de una función' }, pagina: 1 })).toBe('lo que muestra ahora «Raíces de una función» en la pantalla del alumno');
    expect(armarPedido('¿Qué dice?', [{ trozo: { fuente: { ...foto, clase: 'texto', nombre: 'n.txt' }, pagina: 1, texto: 'Hola' } }])).toBe('Fragmentos:\n\n[1] (archivo «n.txt» que adjuntó el alumno)\nHola\n\nPregunta: ¿Qué dice?\n(Pregunta por lo que adjuntó [1]. Si sus apuntes no lo explican, explicalo con lo que sabés.)');
    const previa = previaDe(foto, 1);
    expect(previa).toMatchObject({ tipo: 'archivo', nombre: 'ej.jpg', mime: 'image/jpeg' });
    expect(previa.abrirEn).toBeUndefined();
    expect(previaDe({ ...foto, clase: 'pdf', mime: 'application/pdf' }, 4).abrirEn).toEqual({ pagina: 4 });
    expect(previaDe({ ...foto, clase: 'texto' }, 1)).toBeNull();
  });

  it('sin pregunta escrita, pregunta qué dice', () => {
    expect(preguntaPorDefecto([{ clase: 'foto' }])).toBe('¿Qué dice esta foto?');
    expect(preguntaPorDefecto([{ clase: 'pdf' }])).toBe('¿Qué dice este archivo?');
    expect(preguntaPorDefecto([{ clase: 'foto' }, { clase: 'foto' }])).toBe('¿Qué dicen estas fotos?');
    expect(preguntaPorDefecto([{ clase: 'foto' }, { clase: 'texto' }])).toBe('¿Qué dicen estos archivos?');
  });

  it('el ejercicio de una foto va a su calculadora, si la pregunta lo pide o la foto viene sola', () => {
    const foto = doc('e', 'foto', 'ej.jpg', ['Calcular las subredes de 10.0.0.0/16 para 6 áreas.']);
    const adjunto = ejercicioDe([foto, doc('k', 'texto', 'red.py', ['ip = "10.0.0.0/16"  # subredes'])]);
    expect(adjunto).toBe('Calcular las subredes de 10.0.0.0/16 para 6 áreas.');
    expect(elegirCalculo('Resolvé este ejercicio', adjunto)).toMatchObject({ calculo: { slug: 'subred' }, pide: true });
    expect(elegirCalculo('', adjunto)).toMatchObject({ calculo: { slug: 'subred' }, pide: true });
    // A question that doesn't ask to solve it is answered with what it says.
    expect(elegirCalculo('¿De qué tema es?', adjunto)).toMatchObject({ calculo: { slug: 'subred' }, pide: false });
    expect(elegirCalculo('Resolvé este ejercicio')).toBeNull();
  });

  it('las preguntas que siguen los buscan junto con los apuntes', async () => {
    const adjunto = doc('b', 'texto', 'notas.md', ['# Sincronización\nEl semáforo protege la sección crítica entre procesos.']);
    const elegidos = await buscarPiezas('¿Qué protege el semáforo?', { santo: [adjunto], leidos: () => [] });
    expect(elegidos[0].trozo.fuente).toMatchObject({ tipo: 'adjunto', nombre: 'notas.md' });
  });
});

describe('los adjuntos de la charla, en memoria', () => {
  let urls;
  beforeEach(() => {
    urls = { creadas: 0, soltadas: [] };
    URL.createObjectURL = vi.fn(() => `blob:prueba/${(urls.creadas += 1)}`);
    URL.revokeObjectURL = vi.fn((u) => urls.soltadas.push(u));
  });
  afterEach(() => {
    soltarCharla();
    for (const a of estadoAdjuntos().pendientes) sacar(a.id);
  });

  it('se leen al adjuntarlos, se sacan, van con la pregunta y se sueltan al borrar', async () => {
    adjuntar([archivo('notas.txt'), archivo('ej.jpg', '', { size: 10 }), archivo('notas.docx')]);
    let ahora = estadoAdjuntos();
    expect(ahora.pendientes.map((a) => [a.nombre, a.clase, a.estado])).toEqual([['notas.txt', 'texto', 'leyendo'], ['ej.jpg', 'foto', 'leyendo']]);
    expect(ahora.pendientes[1].url).toBe('blob:prueba/1');
    expect(ahora.problemas).toEqual(['No puedo leer «notas.docx». Guardalo como PDF y adjuntalo.']);
    await Promise.all(ahora.pendientes.map((a) => a.lectura));
    ahora = estadoAdjuntos();
    expect(ahora.pendientes.map((a) => a.estado)).toEqual(['listo', 'listo']);
    expect(ahora.hecho).toBe('varios');
    expect(ahora.leyendo).toBeNull();

    // Taken out, its thumbnail goes.
    sacar(ahora.pendientes[1].id);
    expect(urls.soltadas).toEqual(['blob:prueba/1']);
    expect(estadoAdjuntos().pendientes).toHaveLength(1);

    // With the question: out of the box, in the talk, for the next questions too.
    const van = enviar();
    expect(van).toHaveLength(1);
    expect(estadoAdjuntos()).toMatchObject({ pendientes: [], problemas: [], hecho: '' });
    expect((await van[0].lectura).fuente.nombre).toBe('notas.txt');
    expect(docsDeCharla().map((d) => d.fuente.nombre)).toEqual(['notas.txt']);
    expect(docsDeCharla([van[0].id])).toEqual([]);

    soltarCharla();
    expect(docsDeCharla()).toEqual([]);
  });

  it('lo que no se puede leer sale de la caja y dice por qué', async () => {
    adjuntar([archivo('vacia.png', '', { size: 10 }), archivo('rota.webp', '', { size: 10 })]);
    await Promise.all(estadoAdjuntos().pendientes.map((a) => a.lectura));
    const ahora = estadoAdjuntos();
    expect(ahora.pendientes).toEqual([]);
    expect(ahora.problemas).toEqual(['No encontré texto en «vacia.png». Probá con una foto más nítida.', 'No pude abrir «rota.webp». Probá con otra foto.']);
    expect(urls.soltadas).toEqual(['blob:prueba/1', 'blob:prueba/2']);
  });

  it('borrar las preguntas suelta también las fotos que fueron con ellas', async () => {
    const { empezar, limpiar, noPudoLeer } = await import('./motor');
    adjuntar([archivo('ej.jpg', '', { size: 10 })]);
    const [foto] = enviar();
    await foto.lectura;
    const id = empezar('¿Qué dice esta foto?', '', [{ id: foto.id, nombre: foto.nombre, clase: foto.clase, url: foto.url }]);
    expect(docsDeCharla()).toHaveLength(1);
    // While it answers, nothing is cleared.
    limpiar();
    expect(docsDeCharla()).toHaveLength(1);
    noPudoLeer(id);
    limpiar();
    expect(docsDeCharla()).toEqual([]);
    expect(urls.soltadas).toEqual([foto.url]);
  });
});
