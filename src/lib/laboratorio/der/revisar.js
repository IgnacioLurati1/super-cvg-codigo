// The mistakes the course corrects in a DER, and only those: «Lo que la cátedra corrige en el DER» of parcial-1 in the
// notes (the «errores frecuentes» of the Farmacia final), plus what the same notes say a DER must keep (a weak entity
// and its identifying vínculo, an aggregation over an N a M, no foreign keys drawn, a key that is single-valued).
// The ones that need the narrative (a made-up Id, a ternary of things that don't happen together) are left out.
//
// revisarDer(der) → [{ id, texto, donde }]: `donde` is the id of the entity, vínculo, hierarchy or aggregation to point at.
import { leerCard, sanearDer } from './modelo';
import { claseDeVinculo } from './pasaje';
import { nombreSql } from './sql';

const nombre = (n) => `«${n || 'sin nombre'}»`;

function conClave(atributos) {
  return atributos.some((a) => a.clave || conClave(a.partes));
}

function claves(atributos, fuera = []) {
  for (const a of atributos) {
    if (a.clave) fuera.push(a);
    claves(a.partes, fuera);
  }
  return fuera;
}

export function revisarDer(entrada) {
  const der = sanearDer(entrada);
  if (!der) return [];
  const fuera = [];
  const decir = (id, donde, texto) => fuera.push({ id, texto, donde });
  const entidades = new Map(der.entidades.map((e) => [e.id, e]));
  const nombreDe = (id) => entidades.get(id)?.nombre ?? der.agregaciones.find((g) => g.id === id)?.nombre ?? '';
  const subclases = new Map();
  for (const j of der.jerarquias) for (const s of j.subclases) if (!subclases.has(s)) subclases.set(s, j);

  for (const v of der.vinculos) {
    // «No indicar las cardinalidades de los vínculos.»
    for (const p of v.puntas) if (!p.card) decir(`sin-cardinalidad:${v.id}:${p.a}`, v.id, `A ${nombre(v.nombre)} le falta la cardinalidad del lado de ${nombre(nombreDe(p.a))}.`);
    // A vínculo connects two or more entities, or one with itself.
    if (v.puntas.length < 2) decir(`vinculo-suelto:${v.id}`, v.id, `${nombre(v.nombre)} tiene que unir al menos dos entidades.`);
    // «Marcar claves primarias en los vínculos.»
    if (conClave(v.atributos)) decir(`clave-en-vinculo:${v.id}`, v.id, `${nombre(v.nombre)} tiene un atributo subrayado. Los vínculos no llevan clave.`);
    if (v.identificador && !v.puntas.some((p) => entidades.get(p.a)?.debil)) decir(`identificador-sin-debil:${v.id}`, v.id, `${nombre(v.nombre)} es identificador (doble rombo) pero no une ninguna entidad débil.`);
  }

  for (const e of der.entidades) {
    const j = subclases.get(e.id);
    const tieneClave = conClave(e.atributos);
    if (e.debil) {
      // «No marcar … los discriminantes en las débiles.»
      if (!tieneClave) decir(`debil-sin-discriminante:${e.id}`, e.id, `${nombre(e.nombre)} es débil y le falta el discriminante. Subrayalo.`);
      const identificadores = der.vinculos.filter((v) => v.identificador && v.puntas.some((p) => p.a === e.id));
      if (!identificadores.length) decir(`debil-sin-identificador:${e.id}`, e.id, `${nombre(e.nombre)} es débil pero no tiene vínculo identificador (doble rombo).`);
      // A weak entity always has total participation: at least one owner.
      for (const v of identificadores) {
        for (const p of v.puntas) {
          const card = leerCard(p.card);
          if (p.a !== e.id && card && card.min < 1) decir(`debil-participacion:${v.id}:${p.a}`, v.id, `${nombre(e.nombre)} es débil y participa siempre. Del lado de ${nombre(nombreDe(p.a))} va un mínimo de 1.`);
        }
      }
    } else if (j && tieneClave) {
      // «Armar una jerarquía con subclases que no tienen la misma clave primaria.»
      decir(`jerarquia-con-clave:${e.id}`, e.id, `${nombre(e.nombre)} tiene clave propia. En una jerarquía, las subclases usan la de ${nombre(entidades.get(j.superclase).nombre)}.`);
    } else if (!j && !tieneClave) {
      // «No marcar las claves primarias en las entidades fuertes.»
      decir(`fuerte-sin-clave:${e.id}`, e.id, `${nombre(e.nombre)} no tiene identificador. Subrayá el atributo que la identifica.`);
    }
    // An identifier is single-valued.
    for (const a of claves(e.atributos)) if (a.multivaluado) decir(`clave-multivaluada:${a.id}`, e.id, `${nombre(a.nombre)} es identificador y es multivaluado. Un identificador tiene un solo valor.`);
    // «Las claves foráneas nunca se expresan en el modelo E-R.»
    for (const a of e.atributos) {
      const n = nombreSql(a.nombre);
      const otra = der.entidades.find((o) => o.id !== e.id && o.nombre && [`id_${nombreSql(o.nombre)}`, `${nombreSql(o.nombre)}_id`].includes(n));
      if (otra) decir(`cf-en-der:${a.id}`, e.id, `${nombre(a.nombre)} en ${nombre(e.nombre)} parece una clave foránea de ${nombre(otra.nombre)}. En el DER no se dibujan. Las representa el vínculo.`);
    }
  }

  // A hierarchy splits its superclass in two or more.
  for (const j of der.jerarquias) {
    if (j.subclases.length < 2) decir(`jerarquia-sin-subclases:${j.id}`, j.id, `La jerarquía de «${nombreDe(j.superclase) || 'sin nombre'}» necesita dos subclases o más.`);
  }

  // «Hace referencia a un vínculo N a M.»
  for (const g of der.agregaciones) {
    const v = der.vinculos.find((x) => x.id === g.vinculo);
    if (['1n', '11'].includes(claseDeVinculo(v))) decir(`agregacion-no-nm:${g.id}`, g.id, `La agregación de ${nombre(v.nombre)} tiene que ser sobre un N a M.`);
  }
  return fuera;
}
