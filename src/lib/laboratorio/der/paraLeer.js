import { leerDer } from './modelo';
import { pasarATablas, tablasEnTexto } from './pasaje';
import { revisarDer } from './revisar';

// A `.der` as Consultron reads it (pages/Laboratorio.jsx): the diagram in words, its pasaje to tables and what is still
// to decide or what the course would mark, instead of the file's JSON (positions and ids, and cut in a big diagram).

const TIPOS = { S: 'solapada', D: 'disyunta' };
const PASAJES = { superclase: 'a superclase', completa: 'jerarquía completa', subclases: 'a subclases' };

function atributoEnTexto(a, clave) {
  const nombre = a.multivaluado ? `{${a.nombre}}` : a.derivado ? `/${a.nombre}` : a.nombre;
  const partes = a.partes?.length ? ` (${a.partes.map((p) => atributoEnTexto(p, '')).join(', ')})` : '';
  const que = [a.clave && clave, a.multivaluado && 'multivaluado', a.derivado && 'derivado'].filter(Boolean);
  return `${nombre}${partes}${que.length ? ` [${que.join(', ')}]` : ''}`;
}

/** The text of a `.der` file in words, or the text as it is when it isn't one. */
export function derParaLeer(texto) {
  const der = leerDer(texto);
  if (!der) return texto;
  const nombreDe = (id) => der.entidades.find((e) => e.id === id)?.nombre ?? der.agregaciones.find((g) => g.id === id)?.nombre ?? '?';
  const lineas = ['Diagrama E-R (lo que muestra la hoja del DER).'];
  if (der.entidades.length) {
    lineas.push('Entidades:');
    for (const e of der.entidades) {
      const atributos = e.atributos.map((a) => atributoEnTexto(a, e.debil ? 'discriminante' : 'identificador')).join(', ');
      lineas.push(`- ${e.nombre}${e.debil ? ' (débil)' : ''}${atributos ? `: ${atributos}` : ''}`);
    }
  }
  if (der.vinculos.length) {
    lineas.push('Vínculos (la cardinalidad junto a una entidad dice cuántas de ella van con una de la otra):');
    for (const v of der.vinculos) {
      const puntas = v.puntas.map((p) => `${nombreDe(p.a)} ${p.card}${p.rol ? ` (${p.rol})` : ''}`).join(', ');
      const atributos = v.atributos.map((a) => atributoEnTexto(a, 'identificador')).join(', ');
      lineas.push(`- ${v.nombre || 'sin nombre'}${v.identificador ? ' (identificador)' : ''}: ${puntas}${atributos ? `. Atributos: ${atributos}` : ''}`);
    }
  }
  if (der.jerarquias.length) {
    lineas.push('Jerarquías:');
    for (const j of der.jerarquias) {
      lineas.push(`- ${nombreDe(j.superclase)} -> ${j.subclases.map(nombreDe).join(', ')} (${TIPOS[j.tipo]}, ${j.total ? 'total' : 'parcial'}; se pasa ${PASAJES[j.pasaje]})`);
    }
  }
  if (der.agregaciones.length) {
    lineas.push('Agregaciones:');
    for (const g of der.agregaciones) lineas.push(`- ${g.nombre}: envuelve el vínculo ${der.vinculos.find((v) => v.id === g.vinculo)?.nombre ?? '?'}`);
  }
  const resultado = pasarATablas(der);
  if (resultado.tablas.length) lineas.push('', 'Pasaje a tablas (con las reglas de la cátedra):', tablasEnTexto(resultado).trimEnd());
  if (resultado.pendientes.length) {
    lineas.push('', 'Falta que el alumno decida:');
    for (const p of resultado.pendientes) lineas.push(`- ${p.texto}`);
  }
  const avisos = [...revisarDer(der), ...resultado.avisos].filter((a, i, todos) => todos.findIndex((b) => b.id === a.id) === i);
  if (avisos.length) {
    lineas.push('', 'Lo que la cátedra marcaría:');
    for (const a of avisos) lineas.push(`- ${a.texto}`);
  }
  return lineas.join('\n');
}
