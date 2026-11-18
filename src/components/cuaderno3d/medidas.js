// Real measurements of the landing's 3D still life, in millimetres. Standard objects with known sizes: every
// number comes from a standard or a typical product value, never from a traced photo. Each one says where it
// comes from.
//
// One axis system for the whole scene (describir.js and escena.js use only this one):
//   origin  centre of the notebook's footprint, on the bottom face of the back cover
//   +x      along the spine, the notebook's long edge (297 mm)
//   +y      up, normal to the notebook
//   +z      from the spine toward the free edge, the short edge (210 mm). The spine sits at z = -105.
// The pencil has a local frame of its own, used only to build its shape: +x from the graphite point to the
// end of the eraser, the cross section in the y-z plane, a flat face pointing to -y.

const PULGADA = 25.4;

export const CUADERNO = {
  // ISO 216, A4.
  largo: 297,
  ancho: 210,
  // 80 g/m² office paper is about 0.1 mm thick (typical caliper of 80 gsm paper, grammage per ISO 536).
  hoja: 0.1,
  // «Cuaderno universitario A4» of 80 sheets, the usual count in Argentina.
  hojas: 80,
  // Polypropylene front cover: 0.5 mm, the usual gauge in spiral notebook covers (sold from 0.4 to 0.6 mm).
  tapa: 0.5,
  // Back board: 1 mm chipboard, the usual rigid back of a spiral notebook.
  contratapa: 1,
};

export const ESPIRAL = {
  // Wire-O 3:1 pitch means three loops per inch.
  paso: PULGADA / 3,
  // A4 punched at 3:1 pitch has 34 holes along the 297 mm edge (the standard A4 3:1 punch layout).
  agujeros: 34,
  // 1/2 in loop, the size wire binding charts give for books up to about 11 mm thick (ours is 9.6 mm).
  diametro: PULGADA / 2,
  // Twin loop wire is about 1 mm thick (0.9 to 1.2 mm in suppliers' specs).
  alambre: 0.9,
  // Each loop is two parallel wires (twin loop), about 2.2 mm apart centre to centre so the pair fits a 4 mm hole.
  par: 2.2,
  // 3:1 punches cut holes about 4 mm along the spine. Across it we use 5 mm (an approximation) so the round
  // loop clears the hole on both faces. Hole centre 4 mm from the spine edge (punch margins run 2.5 to 6.5 mm).
  agujero: [4, 5],
  margen: 4,
};

export const LAPIZ = {
  // Standard unsharpened wood-cased pencil length, 175 mm (the usual European length, also Ignacio's spec).
  largo: 175,
  // Hexagonal pencils measure about 7 mm across the flats (6.9 to 7.2 mm in makers' data sheets).
  entreCaras: 7,
  // Painted edges are slightly rounded: about 0.6 mm radius, by eye on a real pencil. Approximation.
  esquina: 0.6,
  // HB cores are 2.0 to 2.2 mm in diameter.
  mina: 2,
  // Hand sharpeners cut a cone of about 22° included angle (20° to 24° depending on the blade).
  cono: 22,
  // A sharp point still has a small round end, about 0.25 mm. Approximation.
  punta: 0.25,
  // Crimped aluminium ferrule: about 12 mm long and 7.6 mm across on common eraser-tipped pencils.
  virola: { largo: 12, diametro: 7.6 },
  // Eraser plug: about 6.5 mm across, 6 mm showing beyond the ferrule.
  goma: { diametro: 6.5, afuera: 6 },
};

export const NOTA = {
  // 3 × 3 in, the original Post-it size: 76 × 76 mm.
  lado: 76,
  // The adhesive band is about 5/8 in (16 mm) deep on 3 × 3 notes.
  adhesivo: 16,
  hoja: 0.1,
};

// Derived sizes, in one place so the scene and the tests agree.
export const DERIVADAS = (() => {
  const apotema = LAPIZ.entreCaras / 2;
  const sueltas = 4;
  const bloque = (CUADERNO.hojas - sueltas) * CUADERNO.hoja;
  const grueso = CUADERNO.contratapa + CUADERNO.hojas * CUADERNO.hoja + CUADERNO.tapa;
  return {
    apotema,
    // Across the corners of a regular hexagon: flats / cos 30°.
    radioEsquinas: apotema / Math.cos(Math.PI / 6),
    // Top sheets that fan out from the block.
    sueltas,
    bloque,
    grueso,
    // Wire centreline radius of each loop.
    radioAnillo: ESPIRAL.diametro / 2 - ESPIRAL.alambre / 2,
    // Length the punched holes cover, from the first to the last.
    tramoAgujeros: (ESPIRAL.agujeros - 1) * ESPIRAL.paso,
  };
})();
