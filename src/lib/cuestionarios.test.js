import { describe, expect, it } from 'vitest';
import {
  cuandoAbre, cuandoCierra, cuandoSeVe, duracion, estadoDe, intentoQueVale, intentosEnTexto, leerAcceso, leerCuestionario, leerCuestionarios,
  leerDevolucion, leerIntentos, leerMejorNota, leerNumero, leerOpcionesCombinadas, leerPregunta, leerRevision, MOMENTO, momentoDe, nota, notaDeIntento,
  notaOcultaEnTexto, notaSobre, porQueNoSeVeLaNota, queSePuede, revisionCerradaEnTexto, revisionDe, seVeLaDevolucion,
} from './cuestionarios';
import { aplanarContenido, normalizarEvento } from './datos';

const C = 'https://frro.cvg.utn.edu.ar';
const { durante, alTerminar, despues, alCerrar } = MOMENTO;
const SIEMPRE = durante | alTerminar | despues | alCerrar;

// Every text in some blocks, joined: what a student would read.
const textoDe = (x) => {
  if (Array.isArray(x)) return x.map(textoDe).join(' ');
  if (x && typeof x === 'object') return [x.texto, x.lineas, x.items, x.filas, x.partes].filter(Boolean).map(textoDe).join(' ');
  return typeof x === 'string' ? x : '';
};

const quiz = (extra = {}) => ({
  id: 40, coursemodule: 15, course: 3, name: '<b>Parcial</b> 1', intro: '<p>Leé <strong>bien</strong>.</p><script>robar()</script>', introfiles: [],
  timeopen: 900_000, timeclose: 1_100_000, timelimit: 1800, attempts: 3, grademethod: 1, grade: 10, sumgrades: 4, decimalpoints: 2,
  questiondecimalpoints: -1, hasfeedback: 1, hasquestions: 1,
  reviewattempt: SIEMPRE, reviewcorrectness: SIEMPRE, reviewmarks: SIEMPRE, reviewspecificfeedback: alCerrar, reviewgeneralfeedback: alCerrar,
  reviewrightanswer: alCerrar, reviewoverallfeedback: alTerminar | despues | alCerrar,
  ...extra,
});
const terminado = (extra = {}) => ({ id: 1, numero: 1, estado: 'terminado', empezo: 950_000, termino: 951_320, puntos: 2.5, ...extra });

describe('numbers and words', () => {
  it('reads a number the campus sends in Spanish or in English', () => {
    expect(leerNumero('0,50')).toBe(0.5);
    expect(leerNumero('0.50')).toBe(0.5);
    expect(leerNumero(3)).toBe(3);
    expect(leerNumero('-1')).toBe(-1);
    expect(leerNumero('1.234,5')).toBeNull();
    expect(leerNumero('')).toBeNull();
    expect(leerNumero(null)).toBeNull();
    expect(leerNumero(Number.NaN)).toBeNull();
    expect(leerNumero('7 puntos')).toBeNull();
  });

  it('writes a grade with a comma and the quiz decimals', () => {
    expect(nota(7.5, 2)).toBe('7,50');
    expect(nota(8, 0)).toBe('8');
    expect(nota(1234.5, 1)).toBe('1234,5');
    expect(nota(-0)).toBe('0,00');
    expect(nota(6.255, 2)).toMatch(/^6,2[56]$/);
    expect(notaSobre(6.25, 10, 2)).toBe('6,25 / 10,00');
  });

  it('says a length of time in words', () => {
    expect(duracion(30)).toBe('Menos de un minuto');
    expect(duracion(60)).toBe('1 minuto');
    expect(duracion(1320)).toBe('22 minutos');
    expect(duracion(5400)).toBe('1 hora y 30 minutos');
    expect(duracion(7200)).toBe('2 horas');
    expect(duracion(2 * 86_400 + 3 * 3600 + 59)).toBe('2 días y 3 horas');
    expect(duracion(-5)).toBe('Menos de un minuto');
  });

  it('says when it closes and when it opens, by calendar days', () => {
    const ahora = new Date(2026, 10, 8, 10, 0).getTime() / 1000;
    const a = (dia, hora) => new Date(2026, 10, dia, hora, 0).getTime() / 1000;
    expect(cuandoCierra(a(8, 23), ahora)).toBe('Cierra hoy');
    expect(cuandoCierra(a(9, 8), ahora)).toBe('Cierra mañana');
    expect(cuandoCierra(a(11, 8), ahora)).toBe('Cierra en 3 días');
    expect(cuandoCierra(a(8, 9), ahora)).toBe('Cerró hoy');
    expect(cuandoCierra(a(7, 23), ahora)).toBe('Cerró ayer');
    expect(cuandoCierra(a(4, 12), ahora)).toBe('Cerró hace 4 días');
    expect(cuandoAbre(a(8, 20), ahora)).toBe('Abre hoy');
    expect(cuandoAbre(a(9, 0), ahora)).toBe('Abre mañana');
    expect(cuandoAbre(a(12, 0), ahora)).toBe('Abre en 4 días');
  });

  it('says how many attempts are left', () => {
    expect(intentosEnTexto(1, 0)).toBe('Uno solo');
    expect(intentosEnTexto(3, 0)).toBe('Tenés 3');
    expect(intentosEnTexto(3, 1)).toBe('Hiciste 1 de 3');
    expect(intentosEnTexto(0, 0)).toBe('Sin límite');
    expect(intentosEnTexto(0, 2)).toBe('Hiciste 2, sin límite');
  });
});

describe('the quiz', () => {
  it('reads a quiz with its rules and its review settings', () => {
    const c = leerCuestionario(quiz(), 'Física');
    expect(c).toMatchObject({ id: 40, cmid: 15, materiaId: 3, nombre: 'Parcial 1', abre: 900_000, cierra: 1_100_000, tiempo: 1800, intentos: 3, metodo: 'mas-alta', nota: 10, puntos: 4, decimales: 2, decimalesPregunta: 2, conDevolucion: true, conPreguntas: true });
    expect(textoDe(c.consigna)).toContain('bien');
    expect(JSON.stringify(c.consigna)).not.toContain('robar');
    expect(c.revision).toEqual({ intento: SIEMPRE, correccion: SIEMPRE, puntos: SIEMPRE, especifica: alCerrar, general: alCerrar, correcta: alCerrar, global: alTerminar | despues | alCerrar });
  });

  it('leaves unknown what the campus does not send', () => {
    const sin = quiz();
    for (const campo of ['timelimit', 'attempts', 'grademethod', 'hasquestions', 'reviewattempt', 'reviewmarks']) delete sin[campo];
    const c = leerCuestionario(sin);
    expect(c).toMatchObject({ tiempo: null, intentos: null, metodo: null, conPreguntas: null, revision: null });
    expect(leerCuestionario(quiz({ attempts: 0, timeopen: 0, timeclose: 0, questiondecimalpoints: 1 }))).toMatchObject({ intentos: 0, abre: null, cierra: null, decimalesPregunta: 1 });
    expect(leerCuestionario(quiz({ decimalpoints: 9 })).decimales).toBe(2);
  });

  it('skips a quiz without what identifies it', () => {
    expect(leerCuestionario(quiz({ coursemodule: 0 }))).toBeNull();
    expect(leerCuestionarios({ quizzes: [quiz(), { id: 'x' }, null, quiz({ id: 41, coursemodule: 16 })] }).map((c) => c.cmid)).toEqual([15, 16]);
    expect(leerCuestionarios(null)).toEqual([]);
  });
});

describe('the attempts', () => {
  const intentos = leerIntentos({ attempts: [
    { id: 2, attempt: 2, state: 'inprogress', timestart: 990_000, timefinish: 0, sumgrades: null, preview: 0 },
    { id: 1, attempt: 1, state: 'finished', timestart: 950_000, timefinish: 951_320, sumgrades: '2,50', preview: 0 },
    { id: 3, attempt: 3, state: 'finished', timestart: 960_000, timefinish: 961_000, sumgrades: 4, preview: 1 },
    { id: 4, attempt: 4, state: 'overdue', timestart: 970_000, timefinish: 0 },
    { id: 5, attempt: 5, state: 'abandoned', timestart: 980_000, timefinish: 0 },
  ] });

  it('reads them in order, without the teacher previews', () => {
    expect(intentos.map((i) => [i.id, i.estado])).toEqual([[1, 'terminado'], [2, 'en-curso'], [4, 'vencido'], [5, 'abandonado']]);
    expect(intentos[0]).toEqual({ id: 1, numero: 1, estado: 'terminado', empezo: 950_000, termino: 951_320, puntos: 2.5 });
    expect(intentos[1]).toMatchObject({ termino: null, puntos: null });
    expect(leerIntentos({})).toEqual([]);
  });

  it('turns the marks of an attempt into the quiz grade', () => {
    const c = leerCuestionario(quiz());
    expect(notaDeIntento(c, terminado())).toBe(6.25);
    expect(notaDeIntento({ ...c, puntos: 3 }, terminado({ puntos: 1 }))).toBe(3.33);
    expect(notaDeIntento(c, terminado({ puntos: null }))).toBeNull();
    expect(notaDeIntento({ ...c, puntos: 0 }, terminado())).toBeNull();
  });

  it('marks the attempt that counts by the grading method', () => {
    const c = leerCuestionario(quiz());
    const dos = [terminado(), terminado({ id: 2, numero: 2, puntos: 3 }), terminado({ id: 3, numero: 3, puntos: 1 })];
    expect(intentoQueVale(c, dos)).toBe(2);
    expect(intentoQueVale({ ...c, metodo: 'primero' }, dos)).toBe(1);
    expect(intentoQueVale({ ...c, metodo: 'ultimo' }, dos)).toBe(3);
    expect(intentoQueVale({ ...c, metodo: 'promedio' }, dos)).toBeNull();
    expect(intentoQueVale(c, [terminado()])).toBeNull();
    expect(intentoQueVale(c, [terminado(), terminado({ id: 2, puntos: null })])).toBeNull();
  });

  it('says where the student is with the quiz', () => {
    expect(estadoDe(intentos, { nota: 6.25 })).toBe('en-curso');
    expect(estadoDe([terminado()], { nota: 6.25 })).toBe('calificado');
    expect(estadoDe([terminado()], { nota: 0 })).toBe('calificado');
    expect(estadoDe([terminado()], { nota: null })).toBe('hecho');
    expect(estadoDe([terminado()], null)).toBe('hecho');
    expect(estadoDe([], null)).toBe('sin-hacer');
    expect(estadoDe(null, null)).toBe('sin-hacer');
  });

  it('reads the best grade and the feedback for it', () => {
    expect(leerMejorNota({ hasgrade: true, grade: 6.25, gradetopass: 6 })).toEqual({ nota: 6.25, aprobar: 6 });
    expect(leerMejorNota({ hasgrade: false, gradetopass: 0 })).toEqual({ nota: null, aprobar: null });
    const devolucion = leerDevolucion({ feedbacktext: '<p>Muy <b>bien</b>.</p><script>robar()</script><img src="x" onerror="robar()">' });
    expect(textoDe(devolucion)).toContain('bien');
    expect(JSON.stringify(devolucion)).not.toContain('robar');
    expect(leerDevolucion({})).toEqual([]);
  });
});

describe('what the campus lets see', () => {
  const c = leerCuestionario(quiz());

  it('finds the moment of an attempt like the campus', () => {
    expect(momentoDe(c, { estado: 'en-curso' }, 1_000_000)).toBe(durante);
    expect(momentoDe(c, terminado({ termino: 999_950 }), 1_000_000)).toBe(alTerminar);
    expect(momentoDe(c, terminado({ termino: 999_000 }), 1_000_000)).toBe(despues);
    expect(momentoDe(c, terminado(), 1_100_000)).toBe(alCerrar);
  });

  it('says when a part opens', () => {
    const recien = terminado({ termino: 999_950 });
    expect(cuandoSeVe(SIEMPRE, c, recien, 1_000_000)).toEqual({ abierta: true, abre: null });
    expect(cuandoSeVe(despues | alCerrar, c, recien, 1_000_000)).toEqual({ abierta: false, abre: 1_000_070 });
    expect(cuandoSeVe(alCerrar, c, terminado(), 1_000_000)).toEqual({ abierta: false, abre: 1_100_000 });
    expect(cuandoSeVe(alCerrar, { ...c, cierra: null }, terminado(), 1_000_000)).toEqual({ abierta: false, abre: null });
    expect(cuandoSeVe(alCerrar, c, terminado(), 1_200_000)).toEqual({ abierta: true, abre: null });
    expect(cuandoSeVe(0, c, terminado(), 1_200_000)).toEqual({ abierta: false, abre: null });
  });

  it('opens the review only of a finished attempt the campus lets review', () => {
    expect(revisionDe(c, terminado(), null, 1_000_000)).toEqual({ abierta: true, abre: null });
    expect(revisionDe(c, { ...terminado(), estado: 'en-curso' }, null, 1_000_000)).toEqual({ abierta: false, abre: null });
    expect(revisionDe(c, terminado(), { puedeRevisar: false }, 1_000_000)).toEqual({ abierta: false, abre: null });
    const alFinal = { ...c, revision: { ...c.revision, intento: alCerrar } };
    expect(revisionDe(alFinal, terminado(), { puedeRevisar: true }, 1_000_000)).toEqual({ abierta: false, abre: 1_100_000 });
    // Closed quizzes come without their settings: only the campus can say.
    expect(revisionDe({ ...c, revision: null }, terminado(), null, 1_200_000)).toBeNull();
  });

  it('says why a grade does not show', () => {
    expect(porQueNoSeVeLaNota(c, terminado(), 1_000_000)).toEqual({ motivo: 'corregir', abre: null });
    const alFinal = { ...c, revision: { ...c.revision, puntos: alCerrar } };
    expect(porQueNoSeVeLaNota(alFinal, terminado(), 1_000_000)).toEqual({ motivo: 'despues', abre: 1_100_000 });
    expect(porQueNoSeVeLaNota({ ...c, revision: { ...c.revision, puntos: 0 } }, terminado(), 1_000_000)).toEqual({ motivo: 'oculta', abre: null });
    expect(porQueNoSeVeLaNota({ ...c, revision: null }, terminado(), 1_000_000)).toEqual({ motivo: 'no-se-sabe', abre: null });
  });

  it('says it in short words', () => {
    const alCerrarse = revisionCerradaEnTexto(c.cierra, c);
    expect(alCerrarse).toMatch(/^La revisión abre cuando cierre el cuestionario, el .+[^.]\.$/);
    expect(revisionCerradaEnTexto(1_000_070, c)).toBe('La revisión abre en un par de minutos.');
    expect(revisionCerradaEnTexto(null, c)).toBe('La revisión de este intento está cerrada.');
    expect(notaOcultaEnTexto({ motivo: 'despues', abre: c.cierra }, c)).toMatch(/^La nota se ve cuando cierre, el .+[^.]\.$/);
    expect(notaOcultaEnTexto({ motivo: 'despues', abre: 1_000_070 }, c)).toBe('La nota se ve en un par de minutos.');
    expect(notaOcultaEnTexto({ motivo: 'corregir' }, c)).toBe('Falta que la corrijan.');
    expect(notaOcultaEnTexto({ motivo: 'oculta' }, c)).toBe('Este cuestionario no muestra la nota.');
    expect(notaOcultaEnTexto({ motivo: 'no-se-sabe' }, c)).toBe('La nota todavía no se ve.');
    expect(notaOcultaEnTexto({ motivo: 'despues', abre: c.cierra }, c, { corta: true })).toBe('Se ve cuando cierre');
    expect(notaOcultaEnTexto({ motivo: 'corregir' }, c, { corta: true })).toBe('Falta corregir');
    expect(notaOcultaEnTexto({ motivo: 'oculta' }, c, { corta: true })).toBe('No se muestra');
    expect(notaOcultaEnTexto({ motivo: 'no-se-sabe' }, c, { corta: true })).toBe('No se ve todavía');
  });

  it('shows the feedback for the grade only when every attempt shows it', () => {
    expect(seVeLaDevolucion(c, [terminado()], 1_000_000)).toBe(true);
    expect(seVeLaDevolucion(c, [terminado(), { ...terminado({ id: 2 }), estado: 'en-curso' }], 1_000_000)).toBe(false);
    expect(seVeLaDevolucion({ ...c, revision: { ...c.revision, global: alCerrar } }, [terminado()], 1_000_000)).toBe(false);
    expect(seVeLaDevolucion({ ...c, revision: null }, [terminado()], 1_000_000)).toBeNull();
    expect(seVeLaDevolucion(c, [], 1_000_000)).toBeNull();
  });

  it('reads the combined review options', () => {
    expect(leerOpcionesCombinadas({
      alloptions: [{ name: 'marks', value: 2 }, { name: 'overallfeedback', value: 1 }],
      someoptions: [{ name: 'marks', value: 2 }, { name: 'rightanswer', value: 0 }],
    })).toEqual({ notas: true, devolucion: true, algunaNota: true, algunaCorrecta: false });
    expect(leerOpcionesCombinadas({ alloptions: [{ name: 'marks', value: 1 }] }).notas).toBe(false);
    expect(leerOpcionesCombinadas(null)).toEqual({ notas: false, devolucion: false, algunaNota: false, algunaCorrecta: false });
  });

  it('reads the access information', () => {
    const acceso = leerAcceso({
      canattempt: true, canreviewmyattempts: true, preventaccessreasons: ['<b>Todavía</b> no'],
      activerulenames: ['quizaccess_password', 'quizaccess_timelimit', 'quizaccess_password', 'quizaccess_seb'],
    });
    expect(acceso).toEqual({ puedeHacerlo: true, puedeRevisar: true, trabas: ['Todavía no'], reglas: ['Pide una contraseña', 'Se hace con Safe Exam Browser'] });
    expect(leerAcceso({ canattempt: false, canreviewmyattempts: false })).toMatchObject({ puedeHacerlo: false, puedeRevisar: false, trabas: [], reglas: [] });
  });

  it('says what can be done, always on the campus', () => {
    const libre = { puedeHacerlo: true, puedeRevisar: true, trabas: [], reglas: [] };
    expect(queSePuede(c, [{ ...terminado(), estado: 'en-curso' }], libre, 1_000_000)).toEqual({ accion: 'seguir', motivo: null });
    expect(queSePuede(c, [], libre, 800_000)).toEqual({ accion: null, motivo: 'Todavía no abre.' });
    expect(queSePuede(c, [], libre, 1_100_000)).toEqual({ accion: null, motivo: 'Ya cerró.' });
    expect(queSePuede({ ...c, intentos: 1 }, [terminado()], libre, 1_000_000).motivo).toBe('Ya hiciste tu intento.');
    expect(queSePuede(c, [terminado(), terminado({ id: 2 }), terminado({ id: 3 })], libre, 1_000_000).motivo).toBe('Ya hiciste tus 3 intentos.');
    expect(queSePuede({ ...c, conPreguntas: false }, [], libre, 1_000_000).motivo).toBe('Todavía no tiene preguntas.');
    expect(queSePuede(c, [], { ...libre, trabas: ['No'] }, 1_000_000).motivo).toBe('El campus no deja hacerlo ahora.');
    expect(queSePuede(c, [terminado()], libre, 1_000_000)).toEqual({ accion: 'hacer', motivo: null });
    expect(queSePuede({ ...c, intentos: 0 }, [terminado(), terminado({ id: 2 }), terminado({ id: 3 })], null, 1_000_000).accion).toBe('hacer');
  });
});

// The review HTML as the campus renders each question (Moodle 4), with what a student never needs to see.
const pregunta = (tipo, clase, formulacion, extra = {}, resultado = '') => ({
  slot: 1, type: tipo, questionnumber: '1', state: 'gradedwrong', status: 'Incorrecta', mark: '0,00', maxmark: '1,00',
  html: `<div class="que ${tipo} deferredfeedback ${clase}"><div class="info"><h3 class="no">Pregunta <span class="qno">1</span></h3><div class="state">Incorrecta</div><div class="questionflag"><input type="checkbox"></div></div>
    <div class="content"><div class="formulation clearfix"><h4 class="accesshide">Enunciado de la pregunta</h4>${formulacion}</div>
    <div class="outcome clearfix"><h4 class="accesshide">Retroalimentación</h4><div class="feedback">${resultado}</div></div>
    <div class="comment clearfix">Comentario: <p>Repasá la unidad 3.</p></div></div>
    <div class="history"><table><tr><td>Paso 1</td></tr></table></div><script>robar()</script></div>`,
  ...extra,
});

describe('the review of an attempt', () => {
  it('reads a multiple choice question with the student choice and its marks', () => {
    const p = leerPregunta(pregunta('multichoice', 'incorrect', `<div class="qtext"><p>¿Qué es un <b>semáforo</b>?</p></div>
      <div class="ablock"><div class="prompt">Seleccione una:</div><div class="answer">
        <div class="r0"><input type="radio" name="q1" value="0" disabled><div class="d-flex"><span class="answernumber">a. </span><div class="flex-fill">Una variable entera</div></div></div>
        <div class="r1 incorrect"><input type="radio" name="q1" value="1" checked="checked" disabled><div class="d-flex"><span class="answernumber">b. </span><div class="flex-fill">Un <i>proceso</i></div></div> <i class="icon fa fa-remove" title="Incorrecta"></i><div class="specificfeedback">No, es otra cosa.</div></div>
        <div class="qtype_multichoice_clearchoice sr-only"><input type="radio" name="q1" value="-1"><label>Borrar mi elección</label></div>
      </div></div>`, {}, '<div class="specificfeedback">Tu respuesta es incorrecta.</div><div class="generalfeedback"><p>Ver el capítulo 5.</p></div><div class="rightanswer">La respuesta correcta es: Una variable entera</div>'));
    expect(p).toMatchObject({ slot: 1, numero: '1', informacion: false, tipo: 'multichoice', resultado: 'mal', estado: 'Incorrecta', puntos: 0, maximo: 1, correcta: 'Una variable entera', enElCampus: false });
    expect(textoDe(p.texto)).toContain('semáforo');
    expect(p.respuesta.tipo).toBe('opciones');
    expect(p.respuesta.opciones).toEqual([
      { texto: 'a. Una variable entera', elegida: false, varias: false, marca: null, devolucion: [], conImagen: false },
      expect.objectContaining({ texto: 'b. Un proceso', elegida: true, marca: 'mal' }),
    ]);
    expect(textoDe(p.respuesta.opciones[1].devolucion)).toContain('otra cosa');
    // «Tu respuesta es incorrecta.» only repeats the mark.
    expect(p.devolucion).toEqual([]);
    expect(textoDe(p.general)).toContain('capítulo 5');
    expect(textoDe(p.comentario)).toBe('Repasá la unidad 3.');
    expect(JSON.stringify(p)).not.toMatch(/robar|Paso 1|Enunciado|Borrar mi elección/);
  });

  it('reads true or false and keeps the feedback that says something', () => {
    const p = leerPregunta(pregunta('truefalse', 'correct', `<div class="qtext">El kernel corre en modo usuario.</div>
      <div class="ablock"><div class="answer"><div class="r0"><input type="radio" value="1" disabled><label>Verdadero</label></div>
      <div class="r1 correct"><input type="radio" value="0" checked="checked" disabled><label>Falso</label></div></div></div>`,
    { state: 'gradedright', status: 'Correcta', mark: '1,00' }, '<div class="specificfeedback">Bien, corre en modo núcleo.</div><div class="rightanswer">La respuesta correcta es \'Falso\'</div>'));
    expect(p.resultado).toBe('bien');
    expect(p.respuesta.opciones.map((o) => [o.texto, o.elegida, o.marca])).toEqual([['Verdadero', false, null], ['Falso', true, 'bien']]);
    expect(p.correcta).toBe('Falso');
    expect(textoDe(p.devolucion)).toContain('modo núcleo');
  });

  it('reads a written answer and a numerical one with its unit', () => {
    const corta = leerPregunta(pregunta('shortanswer', 'correct', `<div class="qtext">¿Qué estructura es LIFO?</div>
      <div class="ablock"><label>Respuesta:</label><span class="answer"><input type="text" value="Pila" readonly class="form-control correct"> <i class="icon fa fa-check"></i></span></div>`,
    { state: 'gradedright', mark: '1,00' }));
    expect(corta.respuesta).toEqual({ tipo: 'texto', texto: 'Pila', marca: 'bien' });
    const numerica = leerPregunta(pregunta('numerical', 'partiallycorrect', `<div class="qtext">¿Cuánto tarda?</div>
      <div class="ablock"><span class="answer"><input type="text" value="12,5" class="form-control partiallycorrect"></span><select><option value="1">s</option><option value="2" selected="selected">ms</option></select></div>`,
    { state: 'gradedpartial', mark: '0,50' }));
    expect(numerica).toMatchObject({ resultado: 'parcial', puntos: 0.5, respuesta: { tipo: 'texto', texto: '12,5 ms', marca: 'parcial' } });
    const vacia = leerPregunta(pregunta('shortanswer', '', '<div class="qtext">¿Y?</div><span class="answer"><input type="text" value=""></span>', { state: 'gaveup' }));
    expect(vacia).toMatchObject({ resultado: 'sin', respuesta: { tipo: 'texto', texto: '', marca: null } });
  });

  it('reads the pairs of a matching question', () => {
    const p = leerPregunta(pregunta('match', 'partiallycorrect', `<div class="qtext">Uní cada una.</div>
      <table class="answer"><tbody>
        <tr class="r0"><td class="text"><p>FIFO</p></td><td class="control correct"><select><option value="0">Elegir...</option><option value="1" selected="selected">Cola</option><option value="2">Pila</option></select></td></tr>
        <tr class="r1"><td class="text"><p>LIFO</p></td><td class="control incorrect"><select><option value="0">Elegir...</option><option value="1" selected="selected">Cola</option><option value="2">Pila</option></select></td></tr>
        <tr class="r0"><td class="text"><p>Hash</p></td><td class="control"><select><option value="0" selected="selected">Elegir...</option><option value="1">Tabla</option></select></td></tr>
      </tbody></table>`, { state: 'gradedpartial' }, '<div class="numpartscorrect">Ha seleccionado correctamente 1.</div><div class="rightanswer">La respuesta correcta es: FIFO → Cola, LIFO → Pila</div>'));
    expect(p.respuesta).toEqual({ tipo: 'pares', pares: [
      { item: 'FIFO', elegido: 'Cola', marca: 'bien' },
      { item: 'LIFO', elegido: 'Cola', marca: 'mal' },
      { item: 'Hash', elegido: '', marca: null },
    ] });
    expect(textoDe(p.devolucion)).toContain('correctamente 1');
    expect(p.correcta).toBe('FIFO → Cola, LIFO → Pila');
  });

  it('reads an essay waiting for the teacher', () => {
    const p = leerPregunta(pregunta('essay', '', `<div class="qtext">Explicá la exclusión mutua.</div>
      <div class="ablock"><div class="answer"><div class="qtype_essay_response readonly"><p>Que dos procesos <b>no</b> entren juntos.</p><script>robar()</script></div></div>
      <div class="attachments"><a href="${C}/pluginfile.php/1/question/response_attachments/1/esquema.pdf">esquema.pdf</a></div></div>`,
    { state: 'needsgrading', status: 'Sin calificar', mark: undefined }));
    expect(p).toMatchObject({ resultado: 'pendiente', estado: 'Sin calificar', puntos: null, maximo: 1 });
    expect(p.respuesta.tipo).toBe('escrita');
    expect(textoDe(p.respuesta.bloques)).toContain('entren juntos');
    expect(p.respuesta.archivos).toEqual(['esquema.pdf']);
    expect(JSON.stringify(p)).not.toContain('robar');
  });

  it('writes the answers of a gap question inside its statement', () => {
    const p = leerPregunta(pregunta('gapselect', 'incorrect', `<div class="qtext"><p>El sistema libre es
      <span class="control"><select><option value="">&nbsp;</option><option value="1" selected="selected">Linux</option><option value="2">Windows</option></select></span>
      y el cerrado es <span class="control"><select><option value="" selected="selected">&nbsp;</option><option value="2">Windows</option></select></span>.</p></div>`));
    expect(textoDe(p.texto)).toMatch(/\[Linux\].*\[…\]/);
    expect(p.respuesta).toBeNull();
    expect(p.enElCampus).toBe(false);
  });

  it('points to the campus for a kind it does not read, and reads a description as information', () => {
    const arrastrar = leerPregunta(pregunta('ddwtos', '', '<div class="qtext">Arrastrá cada palabra.</div><div class="drags"></div>'));
    expect(arrastrar).toMatchObject({ respuesta: null, enElCampus: true });
    const info = leerPregunta({ slot: 4, type: 'description', html: '<div class="formulation"><div class="qtext">Las preguntas siguientes son de la unidad 2.</div></div>', maxmark: '0,00' });
    expect(info).toMatchObject({ informacion: true, enElCampus: false, numero: '4' });
    expect(leerPregunta({ type: 'multichoice', html: '' })).toBeNull();
  });

  it('notes a picture it does not show', () => {
    const p = leerPregunta(pregunta('multichoice', '', `<div class="qtext"><p>Mirá el diagrama.</p><img src="${C}/pluginfile.php/1/question/questiontext/diagrama.png"></div>
      <div class="answer"><div class="r0"><input type="radio" value="0" checked="checked"><div>Uno</div></div><div class="r1"><input type="radio" value="1"><div><img src="x.png" alt=""></div></div></div>`));
    expect(p.conImagen).toBe(true);
    expect(p.respuesta.opciones).toEqual([expect.objectContaining({ texto: 'Uno', elegida: true }), expect.objectContaining({ texto: '', conImagen: true })]);
    expect(JSON.stringify(p)).not.toContain('diagrama.png');
  });

  it('hides marks and right answers the review does not send', () => {
    const p = leerPregunta({ slot: 2, type: 'multichoice', questionnumber: '2', status: 'Respuesta guardada', maxmark: '2,00', html: '<div class="formulation"><div class="qtext">¿Y?</div><div class="answer"><div class="r0"><input type="radio" value="0" checked="checked"><div>Sí</div></div></div></div>' });
    expect(p).toMatchObject({ resultado: null, estado: 'Respuesta guardada', puntos: null, maximo: 2, correcta: '', devolucion: [], general: [], comentario: [] });
  });

  it('reads a review with its grade, its feedback and its questions in order', () => {
    const r = leerRevision({
      grade: '8,33',
      attempt: { id: 9, attempt: 1, state: 'finished', timestart: 100, timefinish: 4420, sumgrades: 5 },
      additionaldata: [{ id: 'feedback', title: 'Retroalimentación', content: '<p>Muy bien.</p>' }],
      questions: [
        { slot: 3, type: 'description', html: '<div class="qtext">Parte B.</div>' },
        { slot: 1, type: 'shortanswer', questionnumber: '1', maxmark: '1,00', html: '<div class="qtext">¿Y?</div>' },
        { type: 'shortanswer', html: '' },
      ],
    });
    expect(r.intento).toMatchObject({ id: 9, numero: 1, estado: 'terminado', puntos: 5 });
    expect(r.nota).toBeCloseTo(8.33);
    expect(textoDe(r.devolucion)).toContain('Muy bien');
    expect(r.preguntas.map((p) => p.slot)).toEqual([1, 3]);
    expect(leerRevision({ grade: null, questions: [] })).toEqual({ intento: null, nota: null, devolucion: [], preguntas: [] });
  });
});

describe('opening a quiz from a course and from Hoy', () => {
  it('a quiz of the course page keeps its course and module', () => {
    const items = aplanarContenido([{ id: 1, name: 'Parciales', modules: [
      { id: 15, modname: 'assign', name: 'TP 2', url: `${C}/mod/assign/view.php?id=15`, modplural: 'Tareas' },
      { id: 16, modname: 'quiz', name: 'Parcial', url: `${C}/mod/quiz/view.php?id=16`, modplural: 'Cuestionarios' },
    ] }], { id: 3, nombre: 'Física' });
    expect(items[0].cuestionario).toBeUndefined();
    expect(items[1].cuestionario).toEqual({ materiaId: 3, cmid: 16 });
  });

  it('a quiz event of Hoy points to its page, only from a campus address', () => {
    const evento = (url, modulename = 'quiz') => normalizarEvento({ id: 1, activityname: 'Parcial', modulename, timesort: 1, course: { id: 3, fullname: 'Física' }, url, action: { url } });
    expect(evento(`${C}/mod/quiz/view.php?id=16`).cuestionario).toEqual({ materiaId: 3, cmid: 16 });
    expect(evento(`${C}/mod/quiz/view.php?id=16`).tarea).toBeNull();
    expect(evento(`${C}/mod/assign/view.php?id=16`, 'assign').cuestionario).toBeNull();
    expect(evento('https://otro.example/mod/quiz/view.php?id=16').cuestionario).toBeNull();
    expect(evento(`${C}/mod/quiz/view.php?id=0`).cuestionario).toBeNull();
  });
});
