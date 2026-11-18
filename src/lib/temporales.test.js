// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { largoDelAdjunto, textoConAdjunto } from './adjuntos';
import {
  abrirTemporal, cifrar, clienteTemporales, descifrar, leerFragmento, leerLinkTemporal, linkTemporal, prepararTemporal, TOPE_TEMPORAL, venceEl,
} from './temporales';

const ID = '3f2a9c1e-7b4d-4e8a-9f10-2b3c4d5e6f70';
const OTRO = '00000000-1111-4222-8333-444455556666';
const LLAVE = 'A'.repeat(42) + 'g';
const LINK = `https://supercvg.lutastudios.com/archivo#${ID}.${LLAVE}`;
const SERVICIO = 'https://lomhlulbgfovtnljbqzp.supabase.co/functions/v1/utn';
const archivoDe = (n, nombre = 'apunte.pdf') => new File([new Uint8Array(n).map((_, i) => i % 251)], nombre, { type: 'application/pdf' });
const bytesDe = async (blob) => new Uint8Array(await blob.arrayBuffer());

describe('el link de un archivo sin Drive', () => {
  it('lleva el número y la llave después del #, y se lee igual', () => {
    expect(linkTemporal(ID, LLAVE)).toBe(LINK);
    expect(leerLinkTemporal(LINK)).toEqual({ id: ID, llave: LLAVE });
    expect(leerFragmento(`#${ID}.${LLAVE}`)).toEqual({ id: ID, llave: LLAVE });
  });

  it('cualquier otra cosa no es un archivo', () => {
    const falsos = [
      `http://supercvg.lutastudios.com/archivo#${ID}.${LLAVE}`,
      `https://supercvg.lutastudios.com.otro.example/archivo#${ID}.${LLAVE}`,
      `https://supercvg.lutastudios.com/archivo?id=${ID}#${ID}.${LLAVE}`,
      `https://supercvg.lutastudios.com/archivo#${ID}.${LLAVE.slice(1)}`,
      `https://supercvg.lutastudios.com/archivo#${ID.toUpperCase()}.${LLAVE}`,
      `https://supercvg.lutastudios.com/archivo#${ID}.${LLAVE} y algo más`,
      `https://supercvg.lutastudios.com/archivo#${ID}`,
    ];
    for (const f of falsos) expect(leerLinkTemporal(f), f).toBeNull();
    expect(leerFragmento(`#${ID}`)).toBeNull();
    expect(leerFragmento('#orden=xyz')).toBeNull();
  });

  it('el largo que se reserva alcanza para el link sin Drive', () => {
    const real = new TextEncoder().encode(`\n\n${textoConAdjunto('', { nombre: 'TP.pdf', bytes: 4000, id: ID, llave: LLAVE })}`).length;
    expect(largoDelAdjunto('TP.pdf', 4000)).toBeGreaterThanOrEqual(real);
  });

  it('vence a los 45 días del mensaje', () => {
    expect(venceEl(0).getTime()).toBe(45 * 86_400_000);
  });
});

describe('el candado', () => {
  it('lo que sale no se parece a lo que entra, y con la llave vuelve igual, con su nombre', async () => {
    const archivo = archivoDe(5000);
    const { bytes, llave } = await cifrar(archivo, 'TP 2.pdf');
    expect(llave).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const original = await bytesDe(archivo);
    expect(bytes.length).toBeGreaterThan(original.length);
    expect(Buffer.from(bytes).includes(Buffer.from(original.slice(0, 64)))).toBe(false);
    expect(Buffer.from(bytes).includes(Buffer.from('TP 2.pdf'))).toBe(false);
    const { nombre, blob } = await descifrar(bytes, llave);
    expect(nombre).toBe('TP 2.pdf');
    expect(blob.type).toBe('application/pdf');
    expect(await bytesDe(blob)).toEqual(original);
  });

  it('cada archivo con su llave: otra llave o un byte cambiado no abren', async () => {
    const { bytes } = await cifrar(archivoDe(100), 'a.pdf');
    const otra = await cifrar(archivoDe(100), 'a.pdf');
    await expect(descifrar(bytes, otra.llave)).rejects.toMatchObject({ codigo: 'roto' });
    const tocado = bytes.slice();
    tocado[20] ^= 1;
    await expect(descifrar(tocado, otra.llave)).rejects.toMatchObject({ codigo: 'roto' });
  });

  it('el nombre de adentro se limpia y el tipo sale solo del nombre', async () => {
    const { bytes, llave } = await cifrar(archivoDe(10), 'pagina‮.html');
    const { nombre, blob } = await descifrar(bytes, llave);
    expect(nombre).toBe('pagina.html');
    expect(blob.type).toBe('application/octet-stream');
  });
});

describe('el servicio', () => {
  const respuesta = (status, cuerpo) => new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json' } });

  it('reserva con el peso, sube lo cifrado a la dirección que dio y arma el link', async () => {
    const pedidos = [];
    const fetch = vi.fn(async (url, opciones) => {
      pedidos.push({ url, opciones });
      return respuesta(200, { id: ID, subida: 'https://lomhlulbgfovtnljbqzp.supabase.co/storage/v1/object/upload/sign/x?token=t', vence: '2027-02-12' });
    });
    vi.stubGlobal('fetch', fetch);
    const subidos = [];
    const cliente = clienteTemporales({ subir: async (url, bytes, { alAvanzar }) => { subidos.push({ url, bytes }); alAvanzar(bytes.length); } });
    const avances = [];
    const estado = {};
    const listo = await prepararTemporal(archivoDe(3000), { cliente, nombre: 'TP.pdf', estado, alAvanzar: (a) => avances.push(a) });
    vi.unstubAllGlobals();
    expect(pedidos).toHaveLength(1);
    expect(pedidos[0].url).toBe(`${SERVICIO}?a=cvg-temporal`);
    expect(pedidos[0].opciones).toMatchObject({ method: 'POST', credentials: 'omit', referrerPolicy: 'no-referrer' });
    expect(JSON.parse(pedidos[0].opciones.body)).toEqual({ bytes: subidos[0].bytes.length });
    expect(subidos[0].url).toMatch(/^https:\/\/lomhlulbgfovtnljbqzp\.supabase\.co\//);
    expect(listo.url).toBe(linkTemporal(ID, listo.llave));
    expect(avances.at(-1)).toEqual({ paso: 'subiendo', hecho: 3000, total: 3000 });
    // Once up, trying again only sends the message.
    const otra = vi.fn();
    expect(await prepararTemporal(archivoDe(3000), { cliente: { reservar: otra }, nombre: 'TP.pdf', estado })).toEqual(listo);
    expect(otra).not.toHaveBeenCalled();
  });

  it('una dirección que no es del servicio no se usa', async () => {
    vi.stubGlobal('fetch', async () => respuesta(200, { id: ID, subida: 'https://otro.example/subir' }));
    const subir = vi.fn();
    await expect(prepararTemporal(archivoDe(10), { cliente: clienteTemporales({ subir }), nombre: 'a.pdf' })).rejects.toMatchObject({ codigo: 'caido' });
    vi.unstubAllGlobals();
    expect(subir).not.toHaveBeenCalled();
  });

  it('cada respuesta en palabras del sitio', async () => {
    for (const [status, codigo] of [[404, 'vencido'], [413, 'pesado'], [429, 'muchos'], [507, 'lleno'], [500, 'caido'], [403, 'caido']]) {
      vi.stubGlobal('fetch', async () => respuesta(status, { error: 'x' }));
      await expect(clienteTemporales().reservar(10)).rejects.toMatchObject({ codigo, conocido: true });
    }
    vi.stubGlobal('fetch', async () => { throw new TypeError('Failed to fetch'); });
    await expect(clienteTemporales().reservar(10)).rejects.toMatchObject({ codigo: 'sin-red' });
    vi.unstubAllGlobals();
  });

  it('pasado el tope no se manda nada', async () => {
    const reservar = vi.fn();
    const grande = { size: TOPE_TEMPORAL + 1, arrayBuffer: vi.fn() };
    await expect(prepararTemporal(grande, { cliente: { reservar }, nombre: 'a.pdf' })).rejects.toMatchObject({ codigo: 'pesado' });
    expect(reservar).not.toHaveBeenCalled();
  });

  it('abrir: pide la dirección por el número, trae lo cifrado y lo abre', async () => {
    const { bytes, llave } = await cifrar(archivoDe(700), 'TP.pdf');
    const urls = [];
    vi.stubGlobal('fetch', async (url) => {
      urls.push(url);
      return respuesta(200, { url: 'https://lomhlulbgfovtnljbqzp.supabase.co/storage/v1/object/sign/x?token=t', bytes: bytes.length, vence: '2027-02-12' });
    });
    const traer = vi.fn(async () => new Response(bytes));
    const { nombre } = await abrirTemporal({ id: ID, llave }, { cliente: clienteTemporales({ traer }) });
    vi.unstubAllGlobals();
    expect(urls).toEqual([`${SERVICIO}?a=cvg-temporal&id=${ID}`]);
    expect(traer.mock.calls[0][1]).toMatchObject({ credentials: 'omit', referrerPolicy: 'no-referrer' });
    expect(nombre).toBe('TP.pdf');
  });
});
