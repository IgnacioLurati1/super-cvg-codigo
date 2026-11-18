import { enDecimalExacto } from '../../lib/calculadoras/racional';

// How numbers are written on the sheet: with a comma, the real minus sign and fractions as the course writes them.

export const MENOS = '−';
export const conMenos = (texto) => String(texto).replace(/^-/, MENOS).replace(/ -/g, ` ${MENOS}`);

/** A fraction for a table: «12», «0,625», «−3/4». A decimal only when it ends and is short; otherwise the fraction. */
export function fraccion(f, { decimales = true, maxCifras = 14 } = {}) {
  if (f.d === 1n) return conMenos(f.n.toString());
  if (decimales) {
    const d = enDecimalExacto(f);
    if (d && d.length <= maxCifras + 2) return conMenos(d);
  }
  return conMenos(`${f.n}/${f.d}`);
}

/** «a + bM» of the simplex: «3», «−M», «2M − 3», «M/2 + 1». */
export function conM({ a, m }) {
  const parteM = (() => {
    if (m.n === 0n) return '';
    const abs = { n: m.n < 0n ? -m.n : m.n, d: m.d };
    const numero = abs.n === 1n ? '' : abs.n.toString();
    return `${numero}M${abs.d === 1n ? '' : `/${abs.d}`}`;
  })();
  if (!parteM) return fraccion(a, { decimales: false });
  const signoM = m.n < 0n ? MENOS : '';
  if (a.n === 0n) return `${signoM}${parteM}`;
  const absA = { n: a.n < 0n ? -a.n : a.n, d: a.d };
  return `${signoM}${parteM} ${a.n < 0n ? MENOS : '+'} ${fraccion(absA, { decimales: false })}`;
}

/** The same, said: «menos 2 M más 3». */
export function conMDicho(v) {
  return conM(v).replace(new RegExp(MENOS, 'g'), 'menos ').replace(/\+/g, 'más').replace(/M/g, ' M').replace(/\//g, ' sobre ');
}

/** Bits said one by one, so a screen reader doesn't read 10110 as a number. */
export const bitsDichos = (bits) => [...String(bits)].filter((c) => c !== '.' && c !== ' ').join(' ');

/** A big number with spaces every three digits («4 294 967 294»), the way the course writes it. */
export const miles = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

/** A rational, roughly, in JavaScript's scientific notation («1.49e-9»), rounded to `cifras` significant digits. */
export function aproximado(f, cifras = 3) {
  const n = f.n < 0n ? -f.n : f.n;
  if (n === 0n) return '0';
  const escalar = (k) => {
    const p = cifras - k;
    return p >= 0 ? (n * 10n ** BigInt(p)) / f.d : n / (f.d * 10n ** BigInt(-p));
  };
  let k = n.toString().length - f.d.toString().length;
  let q = escalar(k);
  while (q.toString().length > cifras + 1) {
    k += 1;
    q = escalar(k);
  }
  while (q.toString().length < cifras + 1) {
    k -= 1;
    q = escalar(k);
  }
  let r = (q + 5n) / 10n;
  if (r.toString().length > cifras) {
    r /= 10n;
    k += 1;
  }
  const s = r.toString();
  const mantisa = `${s[0]}${s.length > 1 ? `.${s.slice(1)}` : ''}`.replace(/\.?0+$/, '');
  // q has cifras + 1 digits and is x by 10 to the (cifras - k): its first digit is worth 10 to the k.
  const exponente = k;
  return `${f.n < 0n ? '-' : ''}${mantisa}${exponente === 0 ? '' : `e${exponente}`}`;
}
