import { useEffect } from 'react';
import { SITIO } from '../../sitio.config.js';

// Título y descripción de cada pantalla, también las que no están en sitio.config.js (un producto). `noindex`
// en todo lo privado. Lo que se ve al pegar el link sale de la build: acá va lo que lee Google al renderizar.
export function useSeo({ titulo, descripcion, noindex = false } = {}) {
  useEffect(() => {
    if (titulo) document.title = titulo;
    if (descripcion) document.querySelector('meta[name="description"]')?.setAttribute('content', descripcion);
    let robots = document.querySelector('meta[name="robots"]');
    if (noindex && !robots) {
      robots = document.createElement('meta');
      robots.name = 'robots';
      robots.content = 'noindex';
      document.head.append(robots);
    } else if (!noindex && robots) {
      robots.remove();
    }
  }, [titulo, descripcion, noindex]);
}

// Datos estructurados de una pantalla (LocalBusiness, Product…), con datos reales del sitio: nada inventado.
// No es un script que se ejecute: la CSP no lo frena.
export function useDatosEstructurados(datos) {
  const json = datos ? JSON.stringify({ '@context': 'https://schema.org', ...datos }) : '';
  useEffect(() => {
    if (!json) return undefined;
    // La copia que dejó la build en el HTML: esta la reemplaza.
    document.head.querySelectorAll('script[data-previo]').forEach((viejo) => viejo.remove());
    const s = document.createElement('script');
    s.type = 'application/ld+json';
    s.textContent = json;
    document.head.append(s);
    return () => s.remove();
  }, [json]);
}

export const tituloDe = (pantalla) => `${pantalla} | ${SITIO.nombre}`;
