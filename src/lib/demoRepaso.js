import { claveDeFecha } from './datos';

// Cards of Repaso for /?demo=1, so the screen shows a day's round, a few new ones and some for later. Made up, on the
// demo's courses (1 and 2) and one without a course.
const dia = (n, ahora) => {
  const f = new Date(ahora);
  f.setDate(f.getDate() + n);
  return claveDeFecha(f);
};

export function tarjetasDeEjemplo(ahora = Date.now()) {
  const t = (n, materia, frente, dorso, vence = null, paso = 0, veces = 0) => ({
    id: `rdemo${String(n).padStart(3, '0')}`,
    materia,
    frente,
    dorso,
    creada: ahora - (20 - n) * 86_400_000,
    vence: vence === null ? null : dia(vence, ahora),
    paso,
    facilidad: 250,
    veces,
    olvidos: 0,
    desde: vence === null ? null : dia(-paso, ahora),
  });
  return [
    t(1, 1, '¿Qué garantiza TCP que UDP no?', '- Entrega en orden\n- Retransmisión de lo perdido\n- Control de flujo y de congestión', 0, 3, 2),
    t(2, 1, '¿Para qué sirve el three-way handshake?', 'Para que los dos extremos acuerden los números de secuencia iniciales antes de mandar datos.', -2, 1, 1),
    t(3, 1, '¿Qué es un socket?', 'Un extremo de una conexión, con una dirección IP y un puerto.', 6, 8, 3),
    t(4, 2, 'Definición de derivada en un punto', 'El límite, cuando h tiende a 0, de (f(a + h) − f(a)) / h, si existe.', 0, 6, 3),
    t(5, 2, '¿Cuándo una función es continua en a?', '- f(a) existe\n- El límite en a existe\n- Los dos son iguales'),
    t(6, 2, 'Teorema de Rolle', 'Si f es continua en [a, b], derivable en (a, b) y f(a) = f(b), hay un c en (a, b) con f′(c) = 0.'),
    t(7, null, 'Fórmula de Little', 'L = λ × W. Clientes en el sistema, tasa de llegada y tiempo medio en el sistema.', 14, 20, 4),
  ];
}
