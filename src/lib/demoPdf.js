// The files of the sample mode (/?demo=1, only in npm run dev): the «Apunte de ejemplo» and «Guía de ejemplo» of each
// sample course are real PDFs with text written for this, so the reader and the search inside PDFs can be tried.
// Anything else is a few bytes that read as an example.
import { armarPdf } from './pdfDeEjemplo';

const APUNTES = {
  1: [
    { titulo: 'Procesos', parrafos: [
      'Un proceso es un programa en ejecución. Tiene su propio espacio de memoria, sus registros y una lista de archivos abiertos. El sistema operativo guarda todo eso en una estructura que se llama bloque de control del proceso.',
      'Cada proceso pasa por varios estados: nuevo, listo, en ejecución, bloqueado y terminado. Pasa de listo a en ejecución cuando el planificador lo elige, y de en ejecución a bloqueado cuando espera algo, como leer un archivo.',
      'Este apunte es de ejemplo. Sirve para probar el lector: resaltá una frase, sumale una nota y buscá una palabra.',
    ] },
    { titulo: 'Planificación', parrafos: [
      'El planificador decide qué proceso usa el procesador. Con FCFS atiende por orden de llegada. Con Round Robin le da a cada uno un quantum de tiempo y, si no terminó, lo manda al final de la cola.',
      'Un quantum muy corto hace que el sistema pierda tiempo cambiando de contexto. Uno muy largo lo vuelve parecido a FCFS. Elegirlo bien es una pregunta típica del parcial.',
    ] },
    { titulo: 'Semáforos', parrafos: [
      'Un semáforo es un contador que el sistema protege. La operación wait lo baja y, si queda negativo, bloquea al proceso. La operación signal lo sube y despierta a uno de los que esperan.',
      'Con un semáforo binario se protege una sección crítica, donde entra un solo proceso a la vez. Con un semáforo contador se cuida un recurso que tiene varias copias, como los lugares de un buffer.',
      'Para el final conviene repasar el problema del productor y el consumidor. Usa tres semáforos: uno para la exclusión mutua, uno para los lugares libres y uno para los ocupados.',
    ] },
  ],
  2: [
    { titulo: 'Matrices', parrafos: [
      'Una matriz es una tabla de números ordenada en filas y columnas. Dos matrices se suman si tienen el mismo tamaño, y se multiplican si las columnas de la primera coinciden con las filas de la segunda.',
      'El producto de matrices no es conmutativo. En general, A por B no da lo mismo que B por A.',
    ] },
    { titulo: 'Determinantes', parrafos: [
      'El determinante de una matriz cuadrada dice si tiene inversa: si vale cero, no la tiene. En una matriz de dos por dos es el producto de una diagonal menos el de la otra.',
      'Para matrices más grandes se usa el desarrollo por una fila o el método de Gauss, que suele ser más rápido.',
    ] },
    { titulo: 'Sistemas de ecuaciones', parrafos: [
      'Un sistema de ecuaciones lineales se escribe como una matriz por un vector de incógnitas. Si el determinante no es cero, tiene una sola solución.',
      'Con el método de Gauss se lleva la matriz ampliada a una forma escalonada y se despeja de abajo hacia arriba. Es el tema más largo del parcial.',
    ] },
  ],
  3: [
    { titulo: 'Movimiento rectilíneo', parrafos: [
      'En un movimiento rectilíneo uniforme la velocidad no cambia, así que la posición crece lo mismo en cada segundo. El gráfico de posición en función del tiempo es una recta.',
      'Si hay aceleración constante, la velocidad cambia de a poco y la posición sigue una parábola.',
    ] },
    { titulo: 'Caída libre', parrafos: [
      'Un cuerpo que cae sin rozamiento acelera hacia abajo con la gravedad, unos 9,8 metros por segundo cada segundo. No importa su masa: en el vacío, una piedra y una llave caen igual.',
    ] },
    { titulo: 'Tiro oblicuo', parrafos: [
      'En un tiro oblicuo el movimiento se separa en dos: uniforme en horizontal y con aceleración en vertical. El alcance máximo se logra con un ángulo de 45 grados.',
      'Es un ejercicio que suele aparecer en el final, junto con energía.',
    ] },
  ],
};

const GUIAS = {
  1: [
    { titulo: 'Ejercicios de procesos', parrafos: [
      'Ejercicio 1. Dibujá el diagrama de estados de un proceso y explicá cada transición.',
      'Ejercicio 2. Tres procesos llegan juntos y duran 5, 3 y 8 milisegundos. Calculá el tiempo de espera promedio con FCFS y con Round Robin de quantum 2.',
      'Ejercicio 3. ¿Qué pasa con el rendimiento si el quantum es más chico que el tiempo de cambio de contexto?',
    ] },
    { titulo: 'Ejercicios de semáforos', parrafos: [
      'Ejercicio 4. Resolvé el problema del productor y el consumidor con un buffer de 10 lugares.',
      'Ejercicio 5. Mostrá un caso de interbloqueo con dos semáforos y explicá cómo evitarlo.',
      'Esta guía es de ejemplo. Los ejercicios 2 y 4 suelen tomarse en el parcial.',
    ] },
    { titulo: 'Simulá Round Robin', parrafos: [
      'Ejercicio 6. Este programa calcula la espera de cada proceso con Round Robin. Seleccioná el código y probalo en el laboratorio. Cambiá el quantum y mirá qué pasa.',
    ], codigo: [
      'def round_robin(duraciones, quantum):',
      '    restante = list(duraciones)',
      '    espera = [0] * len(duraciones)',
      '    reloj = 0',
      '    while any(restante):',
      '        for i, falta in enumerate(restante):',
      '            if falta == 0:',
      '                continue',
      '            uso = min(quantum, falta)',
      '            reloj += uso',
      '            restante[i] -= uso',
      '            if restante[i] == 0:',
      '                espera[i] = reloj - duraciones[i]',
      '    return espera',
      '',
      'quantum = int(input("Quantum: "))',
      'print(round_robin([5, 3, 8], quantum))',
    ] },
  ],
  2: [
    { titulo: 'Ejercicios de matrices', parrafos: [
      'Ejercicio 1. Multiplicá una matriz de dos por tres por una de tres por dos, y explicá por qué al revés da otro tamaño.',
      'Ejercicio 2. Calculá el determinante de una matriz de tres por tres por dos métodos distintos.',
    ] },
    { titulo: 'Ejercicios de sistemas', parrafos: [
      'Ejercicio 3. Resolvé un sistema de tres ecuaciones con el método de Gauss.',
      'Ejercicio 4. Encontrá para qué valores de k el sistema no tiene solución.',
    ] },
  ],
  3: [
    { titulo: 'Ejercicios de cinemática', parrafos: [
      'Ejercicio 1. Un auto va a 72 kilómetros por hora. Pasalo a metros por segundo y calculá cuánto recorre en un minuto.',
      'Ejercicio 2. Desde un balcón de 20 metros se suelta una pelota. Calculá cuánto tarda en llegar al piso.',
    ] },
    { titulo: 'Ejercicios de tiro oblicuo', parrafos: [
      'Ejercicio 3. Se patea una pelota a 15 metros por segundo con un ángulo de 30 grados. Calculá la altura máxima y el alcance.',
      'Ejercicio 4. Explicá por qué dos ángulos complementarios dan el mismo alcance.',
    ] },
  ],
};

const hechos = new Map();
const espera = () => new Promise((ok) => setTimeout(ok, 350));

/** The bytes of a sample file, as if they came from the campus, a moment later. */
export async function archivoDeEjemplo(item) {
  await espera();
  const [, cual, numero] = /^(apunte|guia)-ejemplo-(\d+)\.pdf$/.exec(item?.archivo ?? '') ?? [];
  const paginas = (cual === 'apunte' ? APUNTES : GUIAS)[numero];
  if (!cual || !paginas) return new Blob(['Archivo de ejemplo']);
  if (!hechos.has(item.archivo)) hechos.set(item.archivo, armarPdf(paginas));
  return new Blob([hechos.get(item.archivo)], { type: 'application/pdf' });
}
