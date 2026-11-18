// The languages of the lab, each with its own engine: a worker that loads it from this site and answers the same
// messages (motor.js). Adding one (C++, Prolog) is one entry here, its worker and its editor mode (Editor.jsx).
//   `extension`: of the file name, `comentario`: how a line is commented out (the join of two versions, guardado.js).
//   `topeSegundos`: how long a run may go before it is stopped, not counting the wait for what the student types.
//   `peso`: what its engine downloads the first time, roughly, to say it before.
//   `lee`: what reads the keyboard, to name the lines given before where the browser can't pause the program.
export const LENGUAJES = {
  python: {
    nombre: 'Python',
    extension: 'py',
    comentario: '#',
    topeSegundos: 30,
    peso: '13 MB',
    lee: 'input()',
    ejemplo: 'nombre = input("¿Cómo te llamás? ")\nprint(f"Hola, {nombre}")\n',
  },
  sql: {
    nombre: 'SQL',
    extension: 'sql',
    comentario: '--',
    topeSegundos: 15,
    peso: '700 KB',
    ejemplo: "select p.id, p.direccion, p.zona\n  , sc.fecha_solicitud, sc.importe_mensual\nfrom propiedad p\ninner join solicitud_contrato sc\n  on sc.id_propiedad=p.id\nwhere sc.estado='en alquiler'\norder by sc.importe_mensual desc;\n",
  },
  c: {
    nombre: 'C',
    extension: 'c',
    comentario: '//',
    topeSegundos: 15,
    peso: '190 KB',
    lee: 'scanf()',
    ejemplo: '#include <stdio.h>\n\nint main(void) {\n    char nombre[50];\n    printf("¿Cómo te llamás? ");\n    scanf("%49s", nombre);\n    printf("Hola, %s\\n", nombre);\n    return 0;\n}\n',
  },
  // Console JavaScript, without HTML or DOM (jsMotor.js).
  javascript: {
    nombre: 'JavaScript',
    extension: 'js',
    comentario: '//',
    topeSegundos: 15,
    peso: '1 MB',
    lee: 'prompt()',
    ejemplo: 'function saludar(nombre) {\n  return `Hola, ${nombre}`;\n}\n\nconst nombre = prompt("¿Cómo te llamás?");\nconsole.log(saludar(nombre));\n',
  },
};

export const IDS_DE_LENGUAJE = Object.keys(LENGUAJES);
export const esLenguaje = (l) => typeof l === 'string' && Object.hasOwn(LENGUAJES, l);

// What a run may print before it is cut: a loop that never ends fills it in a moment.
export const TOPE_SALIDA = 100_000;
// The rows shown of each result of SQL: past that, the statement stops there.
export const TOPE_FILAS = 500;
