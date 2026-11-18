import jetbrains400 from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2?url';
import jetbrains700 from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-700-normal.woff2?url';
import fira400 from '@fontsource/fira-code/files/fira-code-latin-400-normal.woff2?url';
import fira700 from '@fontsource/fira-code/files/fira-code-latin-700-normal.woff2?url';
import source400 from '@fontsource/source-code-pro/files/source-code-pro-latin-400-normal.woff2?url';
import source700 from '@fontsource/source-code-pro/files/source-code-pro-latin-700-normal.woff2?url';
import atkinson400 from '@fontsource/atkinson-hyperlegible-mono/files/atkinson-hyperlegible-mono-latin-400-normal.woff2?url';
import atkinson700 from '@fontsource/atkinson-hyperlegible-mono/files/atkinson-hyperlegible-mono-latin-700-normal.woff2?url';

// The letters of the code that the site serves (LETRAS_DE_CODIGO in ajustes.js), all OFL: only Latin, in woff2, normal
// and bold (the words of each language go bold). Each one is in the page's list of letters, but the browser downloads it
// only when the code is shown in it: whoever keeps the system's one downloads nothing.
const LETRAS = [
  ['JetBrains Mono', jetbrains400, jetbrains700],
  ['Fira Code', fira400, fira700],
  ['Source Code Pro', source400, source700],
  ['Atkinson Hyperlegible Mono', atkinson400, atkinson700],
];

export function sumarLetrasDeCodigo() {
  if (typeof FontFace === 'undefined' || !document.fonts) return;
  for (const [nombre, normal, negrita] of LETRAS) {
    document.fonts.add(new FontFace(nombre, `url(${normal}) format('woff2')`, { weight: '400', style: 'normal', display: 'swap' }));
    document.fonts.add(new FontFace(nombre, `url(${negrita}) format('woff2')`, { weight: '700', style: 'normal', display: 'swap' }));
  }
}
