import { describe, expect, it } from 'vitest';
import { armarCarrera } from '../carrera';
import { mensajeDeEjemplo } from '../demoSysacad';
import { leerPestanas } from '../sysacadPestanas';
import { carreraParaLaPregunta, esDeCarrera, materiaNombrada } from './deLaCarrera';

const carrera = armarCarrera(leerPestanas(mensajeDeEjemplo()).pestanas);

describe('preguntas de su carrera', () => {
  it('las de Ignacio, tal cual, desde cualquier pantalla', () => {
    for (const q of ['que necesito para cursas gestion gerencial', 'Que nota me saque en analisis matematico 1?', 'que materias puedo cursar?', 'cuantas materias me faltan?', 'puedo rendir fisica 2?', 'y en que materia me conviene enfocarme?', 'para que me sirve legislacion?'])
      expect(esDeCarrera(q, carrera.materias), q).toBe(true);
    expect(materiaNombrada('que necesito para cursas gestion gerencial', carrera.materias).nombre).toBe('Gestión Gerencial');
    expect(materiaNombrada('Que nota me saque en analisis matematico 1?', carrera.materias).nombre).toBe('Análisis Matemático I');
  });

  it('no un tema de estudio', () => {
    for (const q of ['¿Qué es una derivada?', 'Explicame la integral por partes', '¿Cómo se calcula el promedio ponderado?', '¿Qué es el protocolo TCP?'])
      expect(esDeCarrera(q, carrera.materias), q).toBe(false);
  });

  it('solo lo que la pregunta necesita', () => {
    expect(carreraParaLaPregunta(carrera, 'que necesito para cursas gestion gerencial')).toContain('- Para cursar Gestión Gerencial te falta regularizar Legislación, regularizar Administración de Sistemas de Información.');
    expect(carreraParaLaPregunta(carrera, 'Que nota me saque en analisis matematico 1?')).toContain('Análisis Matemático I ya la aprobaste, con 8.');
    expect(carreraParaLaPregunta(carrera, 'puedo rendir fisica 2?')).toContain('Sí, ya podés rendir Física II. La cursada ya la regularizaste.');
    const cursar = carreraParaLaPregunta(carrera, 'que materias puedo cursar?');
    expect(cursar).toMatch(/- Podés cursar: .*Legislación/);
    expect(cursar).not.toContain('- Aprobadas');
    expect(carreraParaLaPregunta(carrera, 'cuantas materias me faltan?')).toContain('- Te faltan 22 materias de 34, sin contar electivas.\n- Ya aprobaste 12.');
  });

  it('lo que le conviene, ya ordenado entre lo que puede', () => {
    // The count of Tu carrera: only what asks for it passed, and the chain from there (Simulación, then its two).
    expect(carreraParaLaPregunta(carrera, 'y que me conviene rendir primero?')).toContain('- Te conviene rendir primero: Análisis Matemático II, porque te abre 1 materia ya y frena 4 materias contando la cadena\n- Después, para rendir: Física II (te abre 1 materia ya y frena 1 materia contando la cadena)');
    expect(carreraParaLaPregunta(carrera, 'que me conviene cursar?')).toMatch(/- Te conviene cursar primero: Legislación, porque frena 1 materia contando la cadena/);
  });

  it('cada materia, sin nada que se pueda leer al revés', () => {
    const de = (q) => carreraParaLaPregunta(carrera, q);
    // Legislación is asked for by Gestión Gerencial: that never goes as if it were the other way.
    expect(de('Que necesito para cursar legislacion?')).toContain('Para cursar Legislación no te falta nada. Ya podés cursarla.');
    expect(de('Que necesito para cursar legislacion?')).not.toContain('Gestión Gerencial');
    expect(de('para que me sirve legislacion?')).toMatch(/^- Legislación es requisito para cursar Gestión Gerencial\.$/m);
    expect(de('que me destraba legislacion si la curso?')).toMatch(/^- Legislación es requisito para cursar Gestión Gerencial\. Para cursar Legislación no te falta nada/m);
    expect(de('puedo rendir sistemas operativos?')).toContain('Todavía no podés rendir Sistemas Operativos. Te falta aprobar Física II (o estar anotado para rendir Física II). La cursada ya la regularizaste.');
    expect(de('puedo rendir bases de datos?')).toContain('Todavía no podés rendir Bases de Datos. Primero tenés que terminar de cursarla y regularizarla. Bases de Datos la estás cursando ahora.');
  });
});
