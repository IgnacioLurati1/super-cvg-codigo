import { describe, expect, it } from 'vitest';
import { hallarTrozo } from './hallarTrozo';
import { trozar } from './consultron/fragmentos';

const PAGINA = 'Sistemas Operativos, prof. Gómez\nUn monitor es una construcción\nde sincronización que garantiza la exclusión mutua.\nLos semáforos son más generales.';

describe('hallarTrozo', () => {
  it('halla un trozo armado por trozar en el texto de su página, con renglones y acentos', () => {
    const [trozo] = trozar('d', [PAGINA]);
    const lugar = hallarTrozo(PAGINA, trozo.texto);
    expect(PAGINA.slice(lugar.desde, lugar.hasta)).toBe(PAGINA.trim().slice(0, -1));
  });

  it('halla una parte del medio sin importar espacios, mayúsculas ni acentos', () => {
    const lugar = hallarTrozo(PAGINA, 'construccion DE sincronizacion que garantiza');
    expect(PAGINA.slice(lugar.desde, lugar.hasta)).toBe('construcción\nde sincronización que garantiza');
  });

  it('sin el trozo entero, va del principio al final que encuentra', () => {
    const cambiado = 'Un monitor es una construcción de sincronización que asegura siempre la exclusión mutua. Los semáforos son más generales.';
    const lugar = hallarTrozo(PAGINA, cambiado);
    expect(PAGINA.slice(lugar.desde, lugar.hasta)).toBe(PAGINA.slice(PAGINA.indexOf('Un monitor'), -1));
  });

  it('da null si no está, si es muy corto o si la página no tiene texto', () => {
    expect(hallarTrozo(PAGINA, 'algo que no está en ninguna parte de la página')).toBeNull();
    expect(hallarTrozo(PAGINA, 'monitor')).toBeNull();
    expect(hallarTrozo('', 'Un monitor es una construcción')).toBeNull();
  });
});
