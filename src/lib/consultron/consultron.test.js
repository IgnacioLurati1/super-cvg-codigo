import { describe, expect, it } from 'vitest';
import { mensajeDeCarga, revisarCompu } from './compu';
import { elegir, esCharla, indexar, palabras, plegar, trozar } from './fragmentos';
import { NO_ESTA, aclara, armarCharla, armarPedido, citasDe, esPuntual, hastaLoEntero, leerRespuesta, noEsta, partesDeLinea, preguntaAclarada, sinLatex, sinPensar } from './pedido';

const ENCABEZADO = 'APUNTE DE CÁTEDRA DE LEGISLACIÓN ELABORADO POR LA JTP ';
const legislacion = [
  `${ENCABEZADO}1 El período de prueba es un lapso inicial del contrato por tiempo indeterminado. Hasta 5 trabajadores dura 1 año.`,
  `${ENCABEZADO}2 Las horas extraordinarias se pagan con un recargo del 50% en días hábiles y del 100% los sábados después de las 13.`,
  `${ENCABEZADO}3 Las vacaciones anuales dependen de la antigüedad: 14 días corridos hasta 5 años.`,
];
const colas = ['En una cola M/M/1 los arribos son de Poisson y el servicio es exponencial, con un solo servidor.'];

describe('fragmentos de los PDF', () => {
  it('pliega acentos pero no la ñ', () => {
    expect(plegar('Período AÑO Ñandú')).toBe('periodo año ñandu');
  });

  it('cuenta las palabras con contenido, sin las de preguntar ni pedir', () => {
    expect(palabras('¿Qué son las horas extraordinarias? Explicame y armame un resumen')).toEqual(['hora', 'extraordinaria']);
    expect(palabras('Cola M/M/1 de 2 servidores')).toEqual(['cola', 'mm1', '2', 'servidor']);
    expect(palabras('Que es un mm1')).toEqual(['mm1']);
  });

  it('corta cada página en pedazos, sin el encabezado que repiten todas', () => {
    const trozos = trozar('leg', legislacion);
    expect(trozos).toHaveLength(3);
    expect(trozos.map((t) => t.pagina)).toEqual([1, 2, 3]);
    expect(trozos[0].texto.startsWith('1 El período de prueba')).toBe(true);
    expect(trozos.every((t) => t.doc === 'leg')).toBe(true);
  });

  it('parte una página larga en varios pedazos de la misma página, y una oración gigante también', () => {
    const larga = Array.from({ length: 30 }, (_, i) => `La oración número ${i} habla del contrato de trabajo.`).join(' ');
    const trozos = trozar('x', [larga, 'a'.repeat(2500)], 300);
    expect(trozos.filter((t) => t.pagina === 1).length).toBeGreaterThan(3);
    expect(trozos.every((t) => t.texto.length <= 300 + 60)).toBe(true);
    expect(trozos.filter((t) => t.pagina === 2).length).toBeGreaterThanOrEqual(3);
  });

  it('elige los pedazos que más tienen que ver con la pregunta, el mejor primero', () => {
    const indice = indexar([...trozar('leg', legislacion), ...trozar('colas', colas)]);
    const horas = elegir(indice, '¿Qué recargo tienen las horas extra?');
    expect(horas[0].trozo).toMatchObject({ doc: 'leg', pagina: 2 });
    const cola = elegir(indice, '¿Qué es una cola M/M/1?');
    expect(cola[0].trozo.doc).toBe('colas');
  });

  it('un saludo o una charla no es una pregunta de una materia', () => {
    for (const t of ['Hola', '¡Buenas!', 'Que sabes', '¿Qué sabés?', 'qué podés hacer?', 'Gracias, genial', '¿Qué materias leíste?']) expect(esCharla(t), t).toBe(true);
    for (const t of ['Que es un mm1', 'Hola, ¿qué es un semáforo?', 'Explicame la integral', '?', '']) expect(esCharla(t), t).toBe(false);
  });

  it('sin palabras que estén en los apuntes no elige nada', () => {
    const indice = indexar(trozar('leg', legislacion));
    expect(elegir(indice, '¿Cómo se calcula una integral por partes?')).toEqual([]);
    expect(elegir(indice, '¿Qué es?')).toEqual([]);
    expect(elegir(indexar([]), 'contrato')).toEqual([]);
  });

  it('no repite más de dos pedazos de la misma página y respeta el tope', () => {
    const pagina = Array.from({ length: 12 }, (_, i) => `Contrato ${i} de trabajo con contrato y más contrato.`).join(' ');
    const indice = indexar(trozar('d', [1, 2, 3, 4].map((n) => `Hoja ${n}. ${pagina}`), 80));
    const elegidos = elegir(indice, 'contrato', { cuantos: 6, porPagina: 2 });
    expect(elegidos).toHaveLength(6);
    const porPagina = Map.groupBy(elegidos, (e) => e.trozo.pagina);
    expect([...porPagina.values()].every((l) => l.length <= 2)).toBe(true);
  });
});

describe('lo que va al modelo y cómo se lee la respuesta', () => {
  it('numera cada pedazo con su archivo y su página', () => {
    const pdf = (nombre) => ({ tipo: 'pdf', nombre, materia: 'Legislación' });
    const elegidos = [
      { trozo: { doc: 'a', pagina: 12, texto: 'Hasta 5 trabajadores, 1 año.', fuente: pdf('Apunte U5') } },
      { trozo: { doc: 'b', pagina: 1, texto: 'Vida del autor + 70 años.', fuente: { tipo: 'resumen', nombre: 'Parcial 2', materia: 'Legislación' } } },
      { trozo: { doc: 'c', pagina: 1, texto: 'Ley 11.723.', fuente: { tipo: 'oficial', nombre: 'Propiedad intelectual', materia: 'Legislación' } } },
    ];
    expect(armarPedido('  ¿Cuánto dura?  ', elegidos)).toBe(
      'Fragmentos:\n\n[1] (Apunte U5, Legislación, pág. 12)\nHasta 5 trabajadores, 1 año.\n\n' +
        '[2] (resumen «Parcial 2» de El Santo Resumen, Legislación)\nVida del autor + 70 años.\n\n' +
        '[3] (El Santo Resumen, Legislación: Propiedad intelectual)\nLey 11.723.\n\nPregunta: ¿Cuánto dura?',
    );
  });

  it('a un saludo le pasa las materias que leyó', () => {
    expect(armarCharla(' Hola ', ['Simulación', 'Legislación'])).toBe('Tenés los apuntes de estas materias: Simulación, Legislación.\n\nMensaje: Hola');
    expect(armarCharla('Hola', [])).toBe('Todavía no tenés apuntes de ninguna materia.\n\nMensaje: Hola');
  });

  it('saca lo que el modelo piensa para sí, también a medio escribir', () => {
    expect(sinPensar('<think>mmm</think>\nHola')).toBe('Hola');
    expect(sinPensar('<think>todavía pensando')).toBe('');
    expect(noEsta(` ${NO_ESTA}\n`)).toBe(true);
    expect(noEsta('No lo encuentro en tus apuntes, pero creo que es 5.')).toBe(false);
  });

  it('saca un último renglón que ofrece más', () => {
    expect(sinPensar('Es una distribución.\n\nSi necesitas calcular esto en código, dme el tema y te lo pongo.')).toBe('Es una distribución.');
    expect(sinPensar('Es una distribución.\n\nNo invento nada aquí, pero si querés te lo paso en Python.')).toBe('Es una distribución.');
    expect(sinPensar('Es un protocolo.\n**¿Querés que te muestre un ejemplo?**')).toBe('Es un protocolo.');
    // Only the last line, and never the whole answer.
    expect(sinPensar('Si necesitás más memoria, usá paginación.\n\nEs lo más común.')).toBe('Si necesitás más memoria, usá paginación.\n\nEs lo más común.');
    expect(sinPensar('Si querés que funcione, cerrá el archivo.')).toBe('Si querés que funcione, cerrá el archivo.');
    expect(sinPensar('Se aproxima con la normal si λ > 20. No invento nada, solo te di la definición estándar.')).toBe('Se aproxima con la normal si λ > 20.');
  });

  it('lee negritas, citas sueltas y juntas, y deja como texto un número que no es de un pedazo', () => {
    expect(partesDeLinea('Dura **1 año** [2]. Ver [1, 3] y [1 y 2], no [9].', 3)).toEqual([
      { texto: 'Dura ' },
      { texto: '1 año', fuerte: true },
      { texto: ' ' },
      { cita: 2 },
      { texto: '. Ver ' },
      { cita: 1 },
      { cita: 3 },
      { texto: ' y ' },
      { cita: 1 },
      { cita: 2 },
      { texto: ', no ' },
      { texto: '[9]' },
      { texto: '.' },
    ]);
    expect(partesDeLinea('Si $x$ es constante, $C^2(x) = 0$ [1].', 1)).toEqual([
      { texto: 'Si ' },
      { formula: 'x', bloque: false },
      { texto: ' es constante, ' },
      { formula: 'C^2(x) = 0', bloque: false },
      { texto: ' ' },
      { cita: 1 },
      { texto: '.' },
    ]);
    // A formula of its own line, with fractions inside fractions, goes whole to be drawn. Pesos stay as text.
    const poisson = String.raw`P(X=k) = \frac{e^{-\lambda} \lambda^k}{k!}`;
    expect(partesDeLinea(`$$${poisson}$$`, 0)).toEqual([{ formula: poisson, bloque: true }]);
    expect(partesDeLinea(String.raw`Es \(\rho = \lambda/\mu\).`, 0)).toEqual([{ texto: 'Es ' }, { formula: String.raw`\rho = \lambda/\mu`, bloque: false }, { texto: '.' }]);
    expect(partesDeLinea('Cuesta $500 y $300.', 0)).toEqual([{ texto: 'Cuesta $500 y $300.' }]);
    expect(partesDeLinea(String.raw`Donde **$\lambda$** es la tasa.`, 0)).toEqual([{ texto: 'Donde ' }, { formula: String.raw`\lambda`, bloque: false }, { texto: ' es la tasa.' }]);
  });

  it('arma párrafos, listas con viñetas o números, y títulos en negrita', () => {
    const texto = '### Plazos\nEl período de prueba\nvaría [1].\n\n*   Hasta 5: **1 año** [1].\n*   Más de 100: 6 meses [2].\n\n1. Primero\n2) Segundo\n\nFin.';
    const bloques = leerRespuesta(texto, 2);
    expect(bloques.map((b) => b.tipo)).toEqual(['parrafo', 'parrafo', 'lista', 'lista', 'parrafo']);
    expect(bloques[0]).toMatchObject({ titulo: true, partes: [{ texto: 'Plazos', fuerte: true }] });
    expect(bloques[1].partes.map((p) => p.texto ?? `[${p.cita}]`).join('')).toBe('El período de prueba varía [1].');
    expect(bloques[2]).toMatchObject({ numerada: false });
    expect(bloques[2].items).toHaveLength(2);
    expect(bloques[3]).toMatchObject({ numerada: true });
    expect(bloques[3].items).toHaveLength(2);
    expect(citasDe(texto, 2)).toEqual([1, 2]);
  });

  it('las fórmulas en LaTeX se leen como texto', () => {
    expect(sinLatex('$\\rho = \\lambda/\\mu$ y $L_q = \\frac{\\rho^2}{1-\\rho}$')).toBe('ρ = λ/μ y L_q = (ρ^2)/(1-ρ)');
    expect(sinLatex('$$ \\int u \\, dv = uv - \\int v \\, du $$')).toBe(' ∫ u   dv = uv - ∫ v   du ');
    expect(sinLatex('$X_{n+1} = (aX_n + c) \\bmod m$, con $2^N \\ge C$')).toBe('X_n+1 = (aX_n + c) mod m, con 2^N ≥ C');
    expect(sinLatex('$\\text{salto} = 256 - \\text{último}$')).toBe('salto = 256 - último');
    expect(sinLatex('Sin fórmulas.')).toBe('Sin fórmulas.');
  });

  it('la cursiva sale lisa y el código en línea, marcado', () => {
    expect(partesDeLinea('**down** (o *sleep*) baja `x` [1].', 1)).toEqual([
      { texto: 'down', fuerte: true },
      { texto: ' (o ' },
      { texto: 'sleep' },
      { texto: ') baja ' },
      { texto: 'x', codigo: true },
      { texto: ' ' },
      { cita: 1 },
      { texto: '.' },
    ]);
    expect(partesDeLinea('2 * 3 * 4', 0)).toEqual([{ texto: '2 * 3 * 4' }]);
    // Powers, products and indexes stay as written; pesos aren't math.
    expect(partesDeLinea('2**8 da 256 y 2**10', 3)).toEqual([{ texto: '2**8 da 256 y 2**10' }]);
    expect(partesDeLinea('λ*μ*ρ y (a)*(b)', 0)).toEqual([{ texto: 'λ*μ*ρ y (a)*(b)' }]);
    expect(partesDeLinea('v[2] vale A[1, 2] [1]', 2)).toEqual([{ texto: 'v[2] vale A[1, 2] ' }, { cita: 1 }]);
    expect(sinLatex('Cuesta $500 y el otro $300, con $x$ y 10\\% \\begin{cases}a\\end{cases}')).toBe('Cuesta $500 y el otro $300, con x y 10% a');
  });

  it('los números sueltos en un renglón van con lo de antes', () => {
    const texto = 'ARP da la MAC.\n\n[1]\n[2]\n\n- Uno\n[3]';
    const bloques = leerRespuesta(texto, 3);
    expect(bloques.map((b) => b.tipo)).toEqual(['parrafo', 'lista']);
    expect(bloques[0].partes.filter((x) => x.cita).map((x) => x.cita)).toEqual([1, 2]);
    expect(bloques[1].items[0].at(-1)).toEqual({ cita: 3 });
    expect(leerRespuesta('[4]', 1)).toEqual([{ tipo: 'parrafo', partes: [{ texto: '[4]' }], titulo: false }]);
  });

  it('«esta página» se le dice al modelo', () => {
    const elegidos = [{ trozo: { texto: 'Subredes.', fuente: { tipo: 'calculadora', nombre: 'Subredes', abierta: true } } }];
    expect(armarPedido('¿Qué es esta página?', elegidos)).toMatch(/Pregunta: ¿Qué es esta página\?\n\(«Esta página» es la pantalla que tiene abierta: «Subredes» \[1\]\.\)$/);
  });

  it('lo que marcó en un PDF se le dice al modelo, con su archivo y su página', () => {
    const pdf = { tipo: 'pdf', nombre: 'Apunte uno', materia: 'Materia A', item: {} };
    const elegidos = [
      { trozo: { texto: 'Un monitor garantiza la exclusión mutua.', pagina: 2, fuente: pdf, marcado: true } },
      { trozo: { texto: 'Los semáforos.', pagina: 3, fuente: pdf } },
    ];
    const pedido = armarPedido('Explicame esto', elegidos);
    expect(pedido).toContain('[1] (texto que marcó el alumno en Apunte uno, Materia A, pág. 2)\nUn monitor');
    expect(pedido).toContain('[2] (Apunte uno, Materia A, pág. 3)');
    // It answers about that text alone: the rest is context.
    expect(pedido).toMatch(/Pregunta: Explicame esto\n\(Pregunta por el texto que marcó \[1\]\. Respondé solo sobre ese texto, sin explicar lo que viene antes ni después\. Los demás fragmentos son solo contexto\.\)$/);
    // Without a course: its file and page.
    const solo = armarPedido('¿Y esto?', [{ trozo: { texto: 'Algo.', pagina: 1, fuente: { tipo: 'marcado', nombre: 'Resumen' }, marcado: true } }]);
    expect(solo).toContain('(texto que marcó el alumno en Resumen, pág. 1)');
    expect(solo).not.toContain('Los demás fragmentos');
  });

  it('una pregunta que pide una sola cosa se le dice al modelo, y se responde corta', () => {
    for (const p of ['Dame solo el primer paso', '¿Cuál es el primer paso de un estudio?', 'Explicame el paso 2', 'Decímelo en una oración', 'Nada más la fórmula', '¿Cuál es la última etapa?', 'Una definición breve de proceso']) expect(esPuntual(p), p).toBe(true);
    // Where to look, the subject of the question, or a whole topic: not one thing.
    for (const p of ['¿Qué es una cola M/M/1?', 'Buscá solo en los resúmenes qué es un semáforo', '¿Qué pasa con un solo servidor?', 'Explicame los temas del primer parcial', 'Contame los pasos de un estudio de simulación']) expect(esPuntual(p), p).toBe(false);
    const elegidos = [{ trozo: { texto: 'Los diez pasos.', pagina: 1, fuente: { nombre: 'Apunte', materia: 'Simulación' } } }];
    expect(armarPedido('Dame solo el primer paso', elegidos, { puntual: true })).toMatch(/Pregunta: Dame solo el primer paso\n\(Pide una sola cosa\. .*No sigas con los demás pasos ni con otros temas\.\)$/);
    expect(armarPedido('¿Qué es?', elegidos)).not.toContain('Pide una sola cosa');
  });

  it('«te pedí solo el paso 1» corrige la respuesta anterior', () => {
    for (const p of ['Te pedí solo el paso 1', 'Me refería al primer paso de un estudio', 'No, solo quería la fórmula', 'Pero solo el primero', 'No era eso', '¡Te dije el de Poisson!']) expect(aclara(p), p).toBe(true);
    for (const p of ['¿Qué es un semáforo?', 'No entiendo la paginación', 'Solo en los resúmenes: qué es un monitor', 'Te cuento un ejercicio y lo resolvés']) expect(aclara(p), p).toBe(false);
    const pedido = preguntaAclarada('Dame el primer paso', 'Te pedí solo el paso 1');
    expect(pedido).toMatch(/^Te pedí solo el paso 1\n\(Corrige tu respuesta anterior\. Había preguntado «Dame el primer paso»/);
    expect(pedido).toContain('No repitas lo que ya dijiste.');
  });

  it('una respuesta cortada por el tope vuelve a su última oración entera', () => {
    expect(hastaLoEntero('El primer paso es definir el sistema. El segundo paso es identif')).toBe('El primer paso es definir el sistema.');
    expect(hastaLoEntero('Sale de la tabla [1]. Después se')).toBe('Sale de la tabla [1].');
    expect(hastaLoEntero('Termina bien.')).toBe('Termina bien.');
    // Cut before its first sentence ends, or inside a block of code: as it came.
    expect(hastaLoEntero('Una sola oración que no llegó a terminar')).toBe('Una sola oración que no llegó a terminar');
    expect(hastaLoEntero('Así:\n```python\nprint(1)\nprint(')).toBe('Así:\n```python\nprint(1)\nprint(');
  });

  it('una fórmula que abre en un renglón y cierra en otro es una sola', () => {
    const bloques = leerRespuesta('La fórmula del **costo total**:\n\n$$\nCT(Q) = D/Q · C + Q/2 · (C · i)/D\n$$\n\nDonde $Q(t)$ es el stock y $n$ los pedidos.', 0);
    expect(bloques[1].partes).toEqual([{ formula: 'CT(Q) = D/Q · C + Q/2 · (C · i)/D', bloque: true }]);
    // «$Q(t)$» is math though it has no LaTeX in it.
    expect(bloques[2].partes.filter((p) => p.formula).map((p) => p.formula)).toEqual(['Q(t)', 'n']);
    // With text before and after, and with \[ … \].
    const otra = leerRespuesta(String.raw`Queda así: $$ \rho =` + '\n' + String.raw`\frac{\lambda}{\mu} $$ y listo.` + '\n\n' + String.raw`\[` + '\nx^2\n' + String.raw`\]`, 0);
    expect(otra[0].partes.find((p) => p.formula)).toEqual({ formula: String.raw`\rho = \frac{\lambda}{\mu}`, bloque: true });
    expect(otra[0].partes.at(-1).texto).toBe(' y listo.');
    expect(otra[1].partes).toEqual([{ formula: 'x^2', bloque: true }]);
    // While it's written it isn't closed yet: its text, without the dollars. Nor after a blank line.
    expect(leerRespuesta('Mirá:\n$$\nCT = D/Q', 0).map((b) => b.partes.map((p) => p.texto ?? '').join('')).join('|')).toBe('Mirá: CT = D/Q');
    expect(JSON.stringify(leerRespuesta('$$\nx = 1\n\nOtro párrafo.', 0))).not.toContain('$$');
    // Pesos are not math, and a block of code keeps its dollars.
    expect(partesDeLinea('Sale $500 y el otro $300.', 0)).toEqual([{ texto: 'Sale $500 y el otro $300.' }]);
    expect(partesDeLinea('Entre $100 y $200 pesos por mes', 0).some((p) => p.formula)).toBe(false);
    expect(leerRespuesta('```bash\necho $$\n```\nFin.', 0)[0]).toMatchObject({ tipo: 'codigo', texto: 'echo $$' });
  });

  it('el código va en su bloque, tal cual, también mientras se escribe', () => {
    const texto = 'Así se cuenta [1]:\n\n```sql\nSELECT COUNT(*)\n  FROM alumnos [2];\n```\n\nListo.';
    const bloques = leerRespuesta(texto, 2);
    expect(bloques.map((b) => b.tipo)).toEqual(['parrafo', 'codigo', 'parrafo']);
    expect(bloques[1]).toEqual({ tipo: 'codigo', lenguaje: 'sql', texto: 'SELECT COUNT(*)\n  FROM alumnos [2];' });
    // A number inside the code isn't a source.
    expect(citasDe(texto, 2)).toEqual([1]);
    const aMedias = leerRespuesta('Mirá:\n```Python\nfor i in range(3):\n    print(i)', 1);
    expect(aMedias.at(-1)).toEqual({ tipo: 'codigo', lenguaje: 'python', texto: 'for i in range(3):\n    print(i)' });
    expect(leerRespuesta('```\nx = 1\n```', 0)[0]).toMatchObject({ tipo: 'codigo', lenguaje: '' });
  });
});

describe('si la compu puede', () => {
  const gpu = (features = ['shader-f16']) => ({ requestAdapter: async () => ({ features: new Set(features) }) });
  const compu = (extra = {}) => ({ userAgent: 'Mozilla/5.0 (Windows NT 10.0)', gpu: gpu(), ...extra });

  it('una compu con WebGPU y placa con f16', async () => {
    expect(await revisarCompu(compu())).toEqual({ puede: true });
  });

  it('dice por qué no, sin bajar nada', async () => {
    expect(await revisarCompu(compu({ userAgent: 'Mozilla/5.0 (Linux; Android 14)' }))).toEqual({ puede: false, motivo: 'celular' });
    expect(await revisarCompu(compu({ userAgentData: { mobile: true } }))).toEqual({ puede: false, motivo: 'celular' });
    expect(await revisarCompu(compu({ gpu: undefined }))).toEqual({ puede: false, motivo: 'sin-webgpu' });
    expect(await revisarCompu(compu({ gpu: { requestAdapter: async () => null } }))).toEqual({ puede: false, motivo: 'sin-webgpu' });
    expect(await revisarCompu(compu({ gpu: { requestAdapter: async () => { throw new Error('x'); } } }))).toEqual({ puede: false, motivo: 'sin-webgpu' });
    expect(await revisarCompu(compu({ gpu: gpu([]) }))).toEqual({ puede: false, motivo: 'placa-vieja' });
    // Without hardware acceleration the browser may offer a video card made with the processor: that one doesn't count.
    const deMentira = (donde) => ({ requestAdapter: async () => ({ features: new Set(['shader-f16']), ...donde }) });
    expect(await revisarCompu(compu({ gpu: deMentira({ isFallbackAdapter: true }) }))).toEqual({ puede: false, motivo: 'sin-webgpu' });
    expect(await revisarCompu(compu({ gpu: deMentira({ info: { isFallbackAdapter: true } }) }))).toEqual({ puede: false, motivo: 'sin-webgpu' });
    expect(await revisarCompu(compu({ gpu: deMentira({ info: { isFallbackAdapter: false } }) }))).toEqual({ puede: true });
  });

});

describe('fallas al cargar', () => {
  it('cada una en palabras del alumno', () => {
    expect(mensajeDeCarga({ nombre: 'QuotaExceededError', mensaje: 'Quota exceeded.' })).toMatch(/No hay lugar/);
    expect(mensajeDeCarga({ mensaje: 'Failed to fetch' })).toMatch(/Se cortó la descarga/);
    expect(mensajeDeCarga({ mensaje: 'Cannot initialize runtime because of requested maxStorageBufferBindingSize' })).toMatch(/placa de video/);
    expect(mensajeDeCarga({ mensaje: 'algo raro' })).toBe('Consultron no pudo arrancar. Probá de nuevo.');
  });
});
