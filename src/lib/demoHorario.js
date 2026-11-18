// A made-up schedule for the sample mode (/?demo=1), with the names of the sample courses. Nothing here is a real
// commission or a real teacher.
const A = 0;
const B = 1;
const C = 2;
// A subject without a campus course among the sample ones, to add it from the schedules.
const D = 3;

export const HORARIOS_DEMO = {
  ciclo: 2026,
  revisado: '2026-11-08',
  carreras: [
    { letra: 'K', ciclo: 2026, pagina: 'https://www.frro.utn.edu.ar/26/Ingenieria-en-Sistemas-de-Informacion', soloBasicas: [], faltan: [] },
    { letra: 'V', ciclo: 2026, pagina: 'https://www.frro.utn.edu.ar/25/Ingenieria-Quimica', soloBasicas: [], faltan: [{ texto: '5V01 turno noche', motivo: 'no-abre' }] },
  ],
  materias: ['Materia de ejemplo A', 'Materia de ejemplo B', 'Materia de ejemplo C', 'Ingeniería y calidad de ejemplo'],
  comisiones: [
    {
      codigo: '3K01',
      turno: 'Mañana',
      clases: [1, 2].flatMap((c) => [
        [c, 1, 435, 585, A, 'Docente de ejemplo'],
        [c, 1, 585, 750, B, 'Otra docente'],
        [c, 2, 480, 675, C, 'Docente de ejemplo'],
        [c, 2, 600, 765, D, 'Docente de ejemplo'],
        [c, 3, 435, 630, B, 'Otra docente'],
        [c, 4, 480, 630, A, 'Docente de ejemplo'],
        [c, 4, 680, 795, C, ''],
        [c, 5, 435, 630, C, 'Otro docente'],
      ]),
    },
    {
      codigo: '3K04',
      turno: 'Tarde',
      clases: [1, 2].flatMap((c) => [
        [c, 1, 840, 990, A, 'Docente de tarde'],
        [c, 3, 840, 1035, B, ''],
        [c, 4, 840, 1000, D, ''],
        [c, 5, 840, 1035, C, 'Docente de tarde'],
      ]),
    },
    // Of another career, so the commissions of a subject come by career.
    { codigo: '3V01', turno: 'Noche', clases: [1, 2].map((c) => [c, 2, 1155, 1290, D, 'Docente de noche']) },
  ],
};
