// What Sysacad Lindo would answer about the tabs of Sysacad, for /?demo=1. Made up, like the rest of the demo: the
// student is the demo's («Ejemplo Rodríguez»). Shaped like the real ones: Sysacad's title row first, with whose and
// when. It goes through the same window and the same check as the real one.
// No imports: the flows (scripts/flujos.mjs) read it from Node too. Lines inside a cell, joined as the extension does
// (ENTRE_LINEAS of sysacadPestanas.js).
const ENTRE_LINEAS = ' · ';
const HORA = 3_600_000;
const DIA = 24 * HORA;

const tabla = (titulo, columnas, filas) => ({ t: 'tabla', titulo, columnas, filas });
// Sysacad's own title row: the page, whose and when.
const alDia = (ms) => new Date(ms).toLocaleString('es-AR', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).replace(',', '');
const deAlumno = (pagina, ms) => ({ t: 'titulo', texto: `${pagina} de Rodríguez, Ejemplo Martín al ${alDia(ms)}` });

const MATERIAS = [
  ['1', 'Análisis Matemático I', 'Aprobada', '8'],
  ['1', 'Álgebra y Geometría Analítica', 'Aprobada', '7'],
  ['1', 'Física I', 'Aprobada', '6'],
  ['1', 'Inglés I', 'Aprobada', '9'],
  ['1', 'Lógica y Estructuras Discretas', 'Aprobada', '8'],
  ['1', 'Algoritmos y Estructuras de Datos', 'Aprobada', '10'],
  ['1', 'Arquitectura de Computadoras', 'Aprobada', '7'],
  ['1', 'Sistemas y Procesos de Negocio', 'Aprobada', '8'],
  ['2', 'Análisis Matemático II', 'Regular', ''],
  ['2', 'Física II', 'Regular', ''],
  ['2', 'Ingeniería y Sociedad', 'Aprobada', '9'],
  ['2', 'Inglés II', 'Aprobada', '8'],
  ['2', 'Sintaxis y Semántica de los Lenguajes', 'Aprobada', '7'],
  ['2', 'Paradigmas de Programación', 'Aprobada', '9'],
  ['2', 'Sistemas Operativos', 'Regular', ''],
  ['2', 'Análisis de Sistemas de Información', 'Cursando', ''],
  ['3', 'Probabilidad y Estadística', 'Cursando', ''],
  ['3', 'Economía', 'Cursando', ''],
  ['3', 'Bases de Datos', 'Cursando', ''],
  ['3', 'Desarrollo de Software', 'Cursando', ''],
  ['3', 'Comunicación de Datos', 'Cursando', ''],
  ['3', 'Análisis Numérico', 'No cursada', ''],
  ['3', 'Diseño de Sistemas de Información', 'No cursada', ''],
];
// Estado académico as Sysacad writes it: the grade, the hours and the record in one cell, the year a subject became
// regular, «Inscripto» while taking it and nothing when it wasn't taken.
const ESTADO = MATERIAS.map(([anio, materia, estado, nota], i) => [
  anio,
  materia,
  estado === 'Aprobada' ? `Aprobada con ${nota} (${i % 3 ? 4 : 5} hs.) Tomo: ${121 + Math.floor(i / 5)} Folio: ${((i * 7) % 40) + 1}`
    : estado === 'Regular' ? 'Regular en 2025'
      : estado === 'Cursando' ? 'Inscripto'
        : '',
  '2023',
]);
// Notas de parciales: the subjects being taken, with their course, room, hours and the grades so far.
const PARCIALES = [
  ['2', 'Análisis de Sistemas de Información', '2 (2K03)', '301 Zeballos 1341', 'Lunes 18:00-20:25', 'Par. 1: 8 (ocho)', '1', ''],
  ['3', 'Probabilidad y Estadística', '1 (3K01)', '202 Zeballos 1341', 'Martes 16:05-18:25', 'Par. 1: 9 (nueve)', '-.-', ''],
  ['3', 'Economía', '1 (3K01)', '504 Zeballos 1341', 'Miércoles 13:35-15:00', '', '-.-', ''],
  ['3', 'Bases de Datos', '1 (3K01)', '501 Zeballos 1341', 'Jueves 14:15-17:25', 'Par. 1: 7 (siete) · Par. 2: 8 (ocho)', '2', ''],
  ['3', 'Desarrollo de Software', '1 (3K01)', '501 Zeballos 1341', 'Viernes 16:05-19:15', 'Par. 1: 6 (seis) · Rec. 1: 8 (ocho)', '-.-', ''],
  ['3', 'Comunicación de Datos', '2 (3K02)', '202 Zeballos 1341', 'Lunes 15:00-16:50, Viernes 13:35-15:00', '', '-.-', ''],
];
// Exámenes, newest first, with the grade in words as Sysacad writes it.
const EXAMENES = [
  ['12/02/2026', 'Ingeniería y Sociedad', 'nueve', '207'],
  ['20/12/2025', 'Paradigmas de Programación', 'nueve', '206'],
  ['05/12/2025', 'Sintaxis y Semántica de los Lenguajes', 'siete', '205'],
  ['28/07/2025', 'Inglés II', 'ocho', '204'],
  ['04/03/2025', 'Física I', 'seis', '103'],
  ['18/02/2025', 'Física I', 'dos', '103'],
  ['16/12/2024', 'Sistemas y Procesos de Negocio', 'ocho', '108'],
  ['02/12/2024', 'Arquitectura de Computadoras', 'siete', '107'],
  ['22/07/2024', 'Algoritmos y Estructuras de Datos', 'diez', '106'],
  ['10/07/2024', 'Lógica y Estructuras Discretas', 'ocho', '105'],
  ['26/02/2024', 'Inglés I', 'nueve', '104'],
  ['19/12/2023', 'Álgebra y Geometría Analítica', 'siete', '102'],
  ['04/12/2023', 'Análisis Matemático I', 'ocho', '101'],
  ['20/11/2023', 'Economía', 'Ausen.', '302'],
].map(([fecha, materia, nota, codigo]) => [fecha, materia, nota, 'Ing. Sist. Inf.', '2023', codigo]);

// The two Correlatividad pages, as Sysacad shows them: only what is not passed, with «Puede…» or one line per missing
// requirement (and the ordinance, sometimes). Sysacad cuts the subject column at 40 characters.
const CORRELATIVIDAD = ['Año', 'Materia', 'Correlatividad', 'Plan'];
const lineas = (...l) => l.join(ENTRE_LINEAS);
const NO_REG = (m) => `No regularizó ${m}`;
const CURSAR = [
  ['2', 'Análisis Matemático II', 'Puede cursar'],
  ['2', 'Física II', 'Puede cursar'],
  ['2', 'Sistemas Operativos', 'Puede cursar'],
  ['2', 'Análisis de Sistemas de Información', 'Puede cursar'],
  ['2', 'Entornos Gráficos (Elec.)', 'Puede cursar'],
  ['3', 'Probabilidad y Estadística', 'Puede cursar'],
  ['3', 'Economía', 'Puede cursar'],
  ['3', 'Bases de Datos', 'Puede cursar'],
  ['3', 'Desarrollo de Software', 'Puede cursar'],
  ['3', 'Comunicación de Datos', 'Puede cursar'],
  ['3', 'Análisis Numérico', 'No aprobó ni está inscripto a Análisis Matemático II'],
  ['3', 'Diseño de Sistemas de Información', NO_REG('Análisis de Sistemas de Información (Ord. 1878)')],
  ['3', 'Lenguaje de Programación Java (Elec.)', 'Puede cursar'],
  ['4', 'Redes de Datos', NO_REG('Comunicación de Datos (Ord. 1878)')],
  ['4', 'Investigación Operativa', NO_REG('Probabilidad y Estadística (Ord. 1878)')],
  ['4', 'Simulación', lineas(NO_REG('Probabilidad y Estadística'), 'No aprobó ni está inscripto a Análisis Matemático II')],
  ['4', 'Ingeniería y Calidad de Software', lineas(NO_REG('Diseño de Sistemas de Información'), NO_REG('Desarrollo de Software'))],
  ['4', 'Administración de Sistemas de Informació', lineas(NO_REG('Diseño de Sistemas de Información'), NO_REG('Economía'))],
  ['4', 'Legislación', 'Puede cursar'],
  ['5', 'Inteligencia Artificial', NO_REG('Simulación (Ord. 1878)')],
  ['5', 'Ciencia de Datos', NO_REG('Simulación (Ord. 1878)')],
  ['5', 'Gestión Gerencial', lineas(NO_REG('Legislación (Ord. 1878)'), NO_REG('Administración de Sistemas de Información (Ord. 1878)'))],
  ['5', 'Seguridad en los Sistemas de Información', lineas(NO_REG('Redes de Datos'), NO_REG('Administración de Sistemas de Información'), 'No aprobó ni está inscripto a Comunicación de Datos')],
  ['5', 'Proyecto Final', lineas(NO_REG('Ingeniería y Calidad de Software'), 'No cursó Redes de Datos', 'No cursó Administración de Sistemas de Información')],
  ['5', 'Sistemas de Información Integrados para', NO_REG('Administración de Sistemas de Información')],
].map(([anio, materia, correlatividad]) => [anio, materia, correlatividad, '2023']);
// For the final: the regular ones can, or lack another; the rest lack being regular themselves.
const RINDEN = { 'Análisis Matemático II': 'Puede inscribirse', 'Física II': 'Puede inscribirse', 'Sistemas Operativos': 'No aprobó ni está inscripto a Física II' };
const ENTEROS = { 'Administración de Sistemas de Informació': 'Administración de Sistemas de Información', 'Sistemas de Información Integrados para': 'Sistemas de Información Integrados para la Industria (Elec.)' };
const RENDIR = CURSAR.map(([anio, materia, , plan]) => [anio, materia, RINDEN[materia] ?? NO_REG(ENTEROS[materia] ?? materia), plan]);

export function mensajeDeEjemplo(ahora = Date.now()) {
  return {
    fuente: 'sysacad-lindo',
    para: 'super-cvg',
    v: 2,
    tipo: 'pestanas',
    vinculada: true,
    guarda: true,
    alumno: 'Rodríguez, Ejemplo Martín',
    pestanas: [
      {
        clave: 'estado',
        titulo: 'Estado académico',
        fecha: ahora - 2 * HORA,
        bloques: [
          deAlumno('Estado académico', ahora - 2 * HORA),
          { t: 'texto', texto: 'Ingeniería en Sistemas de Información, plan 2023. Legajo 99999.' },
          tabla(null, ['Año', 'Materia', 'Estado', 'Plan'], ESTADO),
        ],
      },
      {
        clave: 'parciales',
        titulo: 'Notas de parciales',
        fecha: ahora - 26 * HORA,
        bloques: [
          deAlumno('Notas de parciales', ahora - 26 * HORA),
          tabla(null, ['Año', 'Materia', 'Comisión', 'Aula', 'Horarios', 'Notas', 'Inasistencias', 'Obs.'], PARCIALES),
        ],
      },
      {
        clave: 'examenes',
        titulo: 'Exámenes',
        fecha: ahora - 5 * DIA,
        bloques: [
          deAlumno('Exámenes', ahora - 5 * DIA),
          tabla(null, ['Fecha', 'Materia', 'Nota', 'Especialidad', 'Plan', 'Código'], EXAMENES),
        ],
      },
      {
        clave: 'plan',
        titulo: 'Materias del plan',
        fecha: ahora - 12 * DIA,
        bloques: [
          deAlumno('Materias del plan', ahora - 12 * DIA),
          tabla(null, ['Año', 'Materia', 'Dictado', 'Horas'], MATERIAS.map(([anio, materia], i) => [anio, materia, i % 3 ? 'Cuatrimestral' : 'Anual', i % 3 ? '4' : '5'])),
        ],
      },
      {
        clave: 'correlativas-cursar',
        titulo: 'Correlatividad para cursar',
        fecha: ahora - 40 * 60_000,
        bloques: [
          deAlumno('Correlatividades para cursar', ahora - 40 * 60_000),
          tabla(null, CORRELATIVIDAD, CURSAR),
        ],
      },
      {
        clave: 'correlativas-rendir',
        titulo: 'Correlatividad para rendir',
        fecha: ahora - 3 * DIA,
        bloques: [
          deAlumno('Correlatividades para rendir', ahora - 3 * DIA),
          tabla(null, CORRELATIVIDAD, RENDIR),
        ],
      },
      {
        clave: 'certificados',
        titulo: 'Certificados',
        fecha: ahora - 20 * DIA,
        bloques: [
          { t: 'titulo', texto: 'Rodríguez, Ejemplo Martín' },
          { t: 'texto', texto: 'Descarga de certificados' },
          { t: 'texto', texto: 'Alumno regular' },
          { t: 'texto', texto: 'Materias aprobadas con nota' },
          { t: 'texto', texto: 'Examen rendido' },
          { t: 'texto', texto: 'IMPORTANTE: AL GENERAR EL CERTIFICADO DE CURSADO NO SE PODRÁN ELIMINAR LAS INSCRIPCIONES' },
        ],
      },
    ],
  };
}
