// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { buscarEnAjustes, indiceDeAjustes } from './buscarAjustes';

const PESTANAS = { 'como-se-ve': 'Cómo se ve', pdf: 'PDF', pantallas: 'Pantallas' };
const PANTALLAS = { hoy: 'Hoy', materias: 'Materias' };

let raiz;
beforeEach(() => {
  document.body.innerHTML = `
    <div id="raiz">
      <fieldset class="ajustes__panel" id="ajustes-como-se-ve">
        <section class="ajustes__seccion">
          <div class="ajustes__cabeza"><h2>Estilo y tema</h2></div>
          <div class="ajustes__cuerpo">
            <fieldset class="ajustes__grupo">
              <legend>Estilo</legend>
              <label class="eleccion"><input type="radio" name="estilo" value="original" checked><span class="eleccion__nombre">Original</span></label>
              <label class="eleccion"><input type="radio" name="estilo" value="batman"><span class="eleccion__nombre">Batman</span><span class="eleccion__texto">Negro y amarillo.</span></label>
            </fieldset>
            <div class="ajuste-si"><label for="potente" class="ajuste-si__nombre">Versión potente</label><span id="potente-ayuda">Un cielo detrás de la página.</span>
              <input id="potente" type="checkbox" aria-describedby="potente-ayuda"></div>
          </div>
        </section>
      </fieldset>
      <fieldset class="ajustes__panel" id="ajustes-pdf" hidden>
        <fieldset class="ajustes__grupo"><legend>Color de las páginas</legend>
          <label class="eleccion"><input type="radio" name="pdf" value="oscuro"><span class="eleccion__nombre">Oscuras</span></label>
        </fieldset>
        <div hidden><label for="escondido">Letra del sistema</label><input id="escondido"></div>
      </fieldset>
      <fieldset class="ajustes__panel" id="ajustes-pantallas" hidden>
        <div class="subpanel" id="pantalla-materias" hidden>
          <fieldset class="ajustes__grupo"><legend>Tarjetas</legend>
            <label class="eleccion"><input type="radio" name="tarjeta" value="franja"><span class="eleccion__nombre">Franja</span></label>
          </fieldset>
        </div>
      </fieldset>
    </div>`;
  raiz = document.getElementById('raiz');
});

const buscar = (q) => buscarEnAjustes(indiceDeAjustes(raiz, { pestanas: PESTANAS, pantallas: PANTALLAS }), q);

describe('el buscador de Configuración', () => {
  it('encuentra en pestañas cerradas y dice dónde está', () => {
    const [oscuras] = buscar('oscuras');
    expect(oscuras).toMatchObject({ nombre: 'Oscuras', de: 'Color de las páginas', seccion: 'pdf', pantalla: null, donde: 'PDF' });
    const [franja] = buscar('franja');
    expect(franja).toMatchObject({ seccion: 'pantallas', pantalla: 'materias', donde: 'Pantallas › Materias' });
    expect(franja.foco).toBe(raiz.querySelector('input[value="franja"]'));
  });

  it('sin acentos ni mayúsculas, y una palabra tiene que empezar una palabra', () => {
    expect(buscar('VERSION').map((x) => x.nombre)).toEqual(['Versión potente']);
    // «tema» no es «sistema», y lo escondido por otra cosa que la pestaña no aparece.
    expect(buscar('sistema')).toEqual([]);
    // By name first; then what is in that block, by its place.
    expect(buscar('tema').map((x) => x.nombre)).toEqual(['Estilo y tema', 'Estilo', 'Versión potente']);
  });

  it('busca también en la ayuda, y el grupo va antes que sus opciones', () => {
    expect(buscar('cielo').map((x) => x.nombre)).toEqual(['Versión potente']);
    expect(buscar('estilo')[0]).toMatchObject({ nombre: 'Estilo y tema' });
    expect(buscar('amarillo')[0]).toMatchObject({ nombre: 'Batman', de: 'Estilo' });
    const grupo = buscar('estilo').find((x) => x.nombre === 'Estilo');
    expect(grupo.foco).toBe(raiz.querySelector('input[value="original"]'));
  });

  it('nada escrito, nada', () => {
    expect(buscar('   ')).toEqual([]);
  });
});
