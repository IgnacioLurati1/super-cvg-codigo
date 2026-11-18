import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { huella } from './datos';

const CLIENTE = 'cliente.apps.googleusercontent.com';
const b64 = (o) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const jwt = (datos) => `${b64({ alg: 'RS256' })}.${b64(datos)}.firma`;
const idToken = (nonce, otros = {}) => jwt({ iss: 'https://accounts.google.com', aud: CLIENTE, sub: '42', email: 'ana@gmail.com', nonce, ...otros });
const responder = (m) => {
  const c = new BroadcastChannel('super-cvg-google');
  c.postMessage(m);
  c.close();
};

// The client comes from the build (or sitio.config.js): each test loads the module again with one.
async function cargar(cliente = CLIENTE) {
  vi.resetModules();
  vi.stubEnv('VITE_GOOGLE_CLIENTE', cliente);
  if (!cliente) {
    const real = await vi.importActual('../../sitio.config.js');
    vi.doMock('../../sitio.config.js', () => ({ ...real, SITIO: { ...real.SITIO, google: '' } }));
  }
  return import('./google');
}

afterEach(() => {
  vi.doUnmock('../../sitio.config.js');
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  sessionStorage.clear();
  localStorage.clear();
  document.querySelectorAll('iframe').forEach((m) => m.remove());
});

describe('la ventana de permiso', () => {
  it('pide solo lectura de Classroom y qué cuenta es, vuelve a la raíz del sitio y trae un estado propio', async () => {
    const g = await cargar();
    const u = new URL(g.direccionDePermiso('estado123', { origen: 'https://supercvg.lutastudios.com', nonce: 'n1' }));
    expect(u.origin + u.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(Object.fromEntries(u.searchParams)).toMatchObject({
      client_id: CLIENTE,
      redirect_uri: 'https://supercvg.lutastudios.com/',
      response_type: 'token id_token',
      state: 'estado123',
      nonce: 'n1',
      prompt: 'select_account',
    });
    const alcances = u.searchParams.get('scope').split(' ');
    expect(alcances.length).toBe(7);
    expect(alcances.slice(0, 5).every((a) => /^https:\/\/www\.googleapis\.com\/auth\/classroom\.[a-z.]+\.readonly$/.test(a))).toBe(true);
    expect(alcances.slice(5)).toEqual(['openid', 'email']);
  });

  it('con la cuenta conocida no pregunta cuál; en silencio, no muestra nada', async () => {
    const g = await cargar();
    const directo = new URL(g.direccionDePermiso('e', { origen: 'https://x.test', nonce: 'n', cuenta: '42' })).searchParams;
    expect(directo.get('login_hint')).toBe('42');
    expect(directo.has('prompt')).toBe(false);
    const callado = new URL(g.direccionDePermiso('e', { origen: 'https://x.test', nonce: 'n', cuenta: '42', silencio: true })).searchParams;
    expect(callado.get('prompt')).toBe('none');
    expect(callado.get('login_hint')).toBe('42');
  });

  it('el id_token vale solo si es para este sitio y este pedido', async () => {
    const g = await cargar();
    expect(g.leerIdToken(idToken('n1'), 'n1')).toEqual({ sub: '42', email: 'ana@gmail.com' });
    expect(g.leerIdToken(idToken('n1'), 'otro')).toBeNull();
    expect(g.leerIdToken(idToken('n1', { aud: 'otro.apps.googleusercontent.com' }), 'n1')).toBeNull();
    expect(g.leerIdToken(idToken('n1', { iss: 'https://otro.test' }), 'n1')).toBeNull();
    expect(g.leerIdToken(idToken('n1', { sub: 'abc' }), 'n1')).toBeNull();
    expect(g.leerIdToken('basura', 'n1')).toBeNull();
    expect(g.leerIdToken(idToken('n1', { email: 'no es un mail' }), 'n1')).toEqual({ sub: '42', email: '' });
  });

  it('sin cliente, Classroom no está y conectar no abre nada', async () => {
    const g = await cargar('');
    const abrir = vi.fn();
    vi.stubGlobal('open', abrir);
    expect(g.disponibleGoogle()).toBe(false);
    await expect(g.conectarGoogle()).rejects.toThrow('Classroom todavía no está disponible.');
    expect(abrir).not.toHaveBeenCalled();
  });
});

describe('la vuelta de Google', () => {
  it('reconoce solo su dirección', async () => {
    const g = await cargar();
    expect(g.esVueltaDeGoogle('#access_token=x&state=s')).toBe(true);
    expect(g.esVueltaDeGoogle('#error=access_denied&state=s')).toBe(true);
    expect(g.esVueltaDeGoogle('#materia=abc')).toBe(false);
    expect(g.esVueltaDeGoogle('')).toBe(false);
  });

  it('borra la dirección antes de pasar el permiso a la pestaña', async () => {
    const g = await cargar();
    const orden = [];
    const historial = { replaceState: (_, __, url) => orden.push(['direccion', url]) };
    class Canal {
      postMessage(m) { orden.push(['mensaje', m]); }
      close() {}
    }
    const lugar = { hash: '#access_token=tok&expires_in=3599&state=s1&scope=x&id_token=a.b.c', pathname: '/', search: '' };
    expect(g.atenderVueltaDeGoogle(lugar, historial, Canal)).toBe(true);
    expect(orden).toEqual([['direccion', '/'], ['mensaje', { state: 's1', token: 'tok', vence: 3599, idToken: 'a.b.c', alcances: 'x', error: null }]]);
    expect(g.atenderVueltaDeGoogle({ hash: '', pathname: '/', search: '' }, historial, Canal)).toBe(false);
  });
});

describe('conectar', () => {
  let g;
  let abierta;
  beforeEach(async () => {
    g = await cargar();
    abierta = null;
    vi.stubGlobal('open', vi.fn((url) => { abierta = new URL(url); return {}; }));
  });

  it('con el estado de su pedido queda conectado en esta pestaña; con otro estado no', async () => {
    const conectando = g.conectarGoogle();
    const estado = abierta.searchParams.get('state');
    expect(estado).toMatch(/^[0-9a-f]{32}$/);
    responder({ state: 'otro', token: 'robado', vence: 3600 });
    responder({ state: estado, token: 'bueno', vence: 3600, idToken: idToken(abierta.searchParams.get('nonce')) });
    await conectando;
    expect(g.tokenGoogle()).toBe('bueno');
    const guardado = JSON.parse(sessionStorage.getItem(g.CLAVE_GOOGLE));
    expect(guardado.vence).toBeGreaterThan(Date.now() + 3_000_000);
    expect(guardado.email).toBe('ana@gmail.com');
    // Only the number of the account, next to the campus key (here it dies with the tab).
    expect(sessionStorage.getItem(g.CLAVE_CUENTA)).toBe('42');
    expect(localStorage.getItem(g.CLAVE_CUENTA)).toBeNull();
  });

  it('con «Seguir conectado», la cuenta sobrevive a la pestaña, como la clave', async () => {
    localStorage.setItem('cl.sesion', 'clave');
    const conectando = g.conectarGoogle();
    responder({ state: abierta.searchParams.get('state'), token: 'bueno', vence: 3600, idToken: idToken(abierta.searchParams.get('nonce')) });
    await conectando;
    expect(localStorage.getItem(g.CLAVE_CUENTA)).toBe('42');
  });

  it('un id_token de otro pedido no deja cuenta', async () => {
    const conectando = g.conectarGoogle();
    responder({ state: abierta.searchParams.get('state'), token: 'bueno', vence: 3600, idToken: idToken('otro-nonce') });
    await conectando;
    expect(g.tokenGoogle()).toBe('bueno');
    expect(g.cuentaGoogle()).toBeNull();
  });

  it('la segunda vez va directo a la cuenta, sin preguntar cuál', async () => {
    sessionStorage.setItem(g.CLAVE_CUENTA, '42');
    const conectando = g.conectarGoogle();
    expect(abierta.searchParams.get('login_hint')).toBe('42');
    expect(abierta.searchParams.has('prompt')).toBe(false);
    g.cancelarConexion();
    await expect(conectando).rejects.toMatchObject({ codigo: 'cancelada' });
  });

  it('si no da permiso, lo dice', async () => {
    const conectando = g.conectarGoogle();
    responder({ state: abierta.searchParams.get('state'), error: 'access_denied' });
    await expect(conectando).rejects.toThrow('No diste permiso en Google. Si querés, probá de nuevo.');
    expect(g.tokenGoogle()).toBeNull();
  });

  it('si el navegador frena la ventana, explica cómo seguir', async () => {
    vi.stubGlobal('open', vi.fn(() => null));
    await expect(g.conectarGoogle()).rejects.toMatchObject({ codigo: 'frenada' });
  });

  it('un permiso vencido no cuenta', async () => {
    sessionStorage.setItem(g.CLAVE_GOOGLE, JSON.stringify({ token: 'viejo', vence: Date.now() - 1 }));
    expect(g.tokenGoogle()).toBeNull();
  });

  it('desconectar lo borra, olvida la cuenta y le avisa a Google; perderlo solo, no', async () => {
    const pedir = vi.fn(async () => ({}));
    vi.stubGlobal('fetch', pedir);
    sessionStorage.setItem(g.CLAVE_GOOGLE, JSON.stringify({ token: 'tok', vence: Date.now() + 100_000 }));
    sessionStorage.setItem(g.CLAVE_CUENTA, '42');
    g.olvidarGoogle();
    expect(g.tokenGoogle()).toBeNull();
    expect(g.cuentaGoogle()).toBe('42');
    expect(pedir).not.toHaveBeenCalled();
    sessionStorage.setItem(g.CLAVE_GOOGLE, JSON.stringify({ token: 'tok', vence: Date.now() + 100_000 }));
    g.olvidarGoogle({ revocar: true });
    expect(g.tokenGoogle()).toBeNull();
    expect(g.cuentaGoogle()).toBeNull();
    expect(pedir).toHaveBeenCalledTimes(1);
    const [url, opciones] = pedir.mock.calls[0];
    expect(url).toBe('https://oauth2.googleapis.com/revoke');
    expect(opciones).toMatchObject({ method: 'POST', credentials: 'omit' });
    expect(String(opciones.body)).toBe('token=tok');
  });
});

describe('dónde queda el permiso', () => {
  let g;
  let abierta;
  beforeEach(async () => {
    g = await cargar();
    vi.stubGlobal('open', vi.fn((url) => { abierta = new URL(url); return {}; }));
  });
  const conectar = async () => {
    const conectando = g.conectarGoogle();
    responder({ state: abierta.searchParams.get('state'), token: 'bueno', vence: 3600, idToken: idToken(abierta.searchParams.get('nonce')) });
    await conectando;
  };
  // A new tab of the same browser: its sessionStorage starts empty, its localStorage is the same.
  const cerrarLaPestana = () => {
    const recordada = localStorage.getItem('cl.sesion');
    sessionStorage.clear();
    return recordada;
  };

  it('sin «Seguir conectado», en la pestaña: al cerrarla se va', async () => {
    sessionStorage.setItem('cl.sesion', 'clave');
    await conectar();
    expect(JSON.parse(sessionStorage.getItem(g.CLAVE_GOOGLE)).token).toBe('bueno');
    expect(localStorage.getItem(g.CLAVE_GOOGLE)).toBeNull();
    cerrarLaPestana();
    expect(g.tokenGoogle()).toBeNull();
  });

  it('con «Seguir conectado», en el navegador: al cerrar la pestaña y volver sigue conectado', async () => {
    localStorage.setItem('cl.sesion', 'clave');
    await conectar();
    expect(sessionStorage.getItem(g.CLAVE_GOOGLE)).toBeNull();
    const guardado = JSON.parse(localStorage.getItem(g.CLAVE_GOOGLE));
    expect(guardado).toMatchObject({ token: 'bueno', email: 'ana@gmail.com' });
    expect(cerrarLaPestana()).toBe('clave');
    expect(g.tokenGoogle()).toBe('bueno');
  });

  it('una pestaña con su propia sesión no usa el permiso que quedó en el navegador', async () => {
    localStorage.setItem('cl.sesion', 'clave-de-ana');
    localStorage.setItem(g.CLAVE_GOOGLE, JSON.stringify({ token: 'de-ana', vence: Date.now() + 100_000 }));
    sessionStorage.setItem('cl.sesion', 'clave-de-beto');
    expect(g.tokenGoogle()).toBeNull();
  });

  it('uno vencido se borra, también del navegador', async () => {
    localStorage.setItem('cl.sesion', 'clave');
    localStorage.setItem(g.CLAVE_GOOGLE, JSON.stringify({ token: 'viejo', vence: Date.now() - 1 }));
    expect(g.tokenGoogle()).toBeNull();
    expect(localStorage.getItem(g.CLAVE_GOOGLE)).toBeNull();
    localStorage.setItem(g.CLAVE_GOOGLE, 'no es JSON');
    expect(g.tokenGoogle()).toBeNull();
    expect(localStorage.getItem(g.CLAVE_GOOGLE)).toBeNull();
  });

  it('desconectar lo borra de los dos lados', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({})));
    localStorage.setItem('cl.sesion', 'clave');
    await conectar();
    sessionStorage.setItem(g.CLAVE_GOOGLE, JSON.stringify({ token: 'otro', vence: Date.now() + 100_000 }));
    g.olvidarGoogle({ revocar: true });
    expect(localStorage.getItem(g.CLAVE_GOOGLE)).toBeNull();
    expect(sessionStorage.getItem(g.CLAVE_GOOGLE)).toBeNull();
  });

  it('Salir lo borra de los dos lados, y entrar de nuevo no hereda el de antes', async () => {
    const { cerrarSesion, iniciarSesion } = await import('./sesion');
    localStorage.setItem('cl.sesion', 'clave');
    await conectar();
    cerrarSesion();
    expect(localStorage.getItem(g.CLAVE_GOOGLE)).toBeNull();
    localStorage.setItem(g.CLAVE_GOOGLE, JSON.stringify({ token: 'quedado', vence: Date.now() + 100_000 }));
    sessionStorage.setItem(g.CLAVE_GOOGLE, JSON.stringify({ token: 'quedado', vence: Date.now() + 100_000 }));
    iniciarSesion('otra-clave', { recordar: true });
    expect(g.tokenGoogle()).toBeNull();
    expect(localStorage.getItem(g.CLAVE_GOOGLE)).toBeNull();
    expect(sessionStorage.getItem(g.CLAVE_GOOGLE)).toBeNull();
  });
});

describe('Classroom y Drive con un solo permiso', () => {
  const DRIVE = 'https://www.googleapis.com/auth/drive.appdata';
  let g;
  let abierta;
  beforeEach(async () => {
    g = await cargar();
    sessionStorage.setItem('cl.sesion', `clave-${Math.random()}`);
    vi.stubGlobal('open', vi.fn((url) => { abierta = new URL(url); return {}; }));
  });
  const volver = (alcances) => responder({ state: abierta.searchParams.get('state'), token: 'bueno', vence: 3600, idToken: idToken(abierta.searchParams.get('nonce')), alcances });

  it('guardar en Drive pide solo su carpeta, y no conecta Classroom', async () => {
    const conectando = g.conectarGoogle('drive');
    expect(abierta.searchParams.get('scope').split(' ')).toEqual([DRIVE, 'openid', 'email']);
    expect(abierta.searchParams.get('include_granted_scopes')).toBe('true');
    volver(`${DRIVE} openid email`);
    await conectando;
    expect(g.permisoGoogle('drive')).toBe('bueno');
    expect(g.permisoGoogle('classroom')).toBeNull();
    expect(sessionStorage.getItem(g.CLAVE_USOS)).toBe('drive');
  });

  it('sumar Drive a quien tiene Classroom no le saca Classroom', async () => {
    let conectando = g.conectarGoogle();
    volver(g.ALCANCES.join(' '));
    await conectando;
    conectando = g.conectarGoogle('drive');
    // Google answers with everything it gave: what was asked now and what was given before.
    volver([...g.ALCANCES, DRIVE].join(' '));
    await conectando;
    expect(g.permisoGoogle('classroom')).toBe('bueno');
    expect(g.permisoGoogle('drive')).toBe('bueno');
    expect(sessionStorage.getItem(g.CLAVE_USOS)).toBe('classroom drive');
  });

  it('vincular Google Calendar pide solo los calendarios que crea y la carpeta de Drive para anotar cuál es', async () => {
    const CALENDARIO = 'https://www.googleapis.com/auth/calendar.app.created';
    const conectando = g.conectarGoogle('calendario');
    expect(abierta.searchParams.get('scope').split(' ')).toEqual([CALENDARIO, DRIVE, 'openid', 'email']);
    volver(`${CALENDARIO} openid email`);
    await conectando;
    // Without the Drive part it still works: on this device only.
    expect(g.permisoGoogle('calendario')).toBe('bueno');
    expect(g.permisoGoogle('drive')).toBeNull();
    expect(g.permisoGoogle('classroom')).toBeNull();
    expect(sessionStorage.getItem(g.CLAVE_USOS)).toBe('calendario');
  });

  it('si en Google destildó el calendario, lo dice y no lo vincula', async () => {
    const conectando = g.conectarGoogle('calendario');
    volver(`${DRIVE} openid email`);
    await expect(conectando).rejects.toMatchObject({ codigo: 'incompleto', message: 'Google no dio permiso para tu Google Calendar. Probá de nuevo y dejá marcada esa opción.' });
    expect(g.permisoGoogle('calendario')).toBeNull();
  });

  it('si en Google destildó Drive, lo dice y no lo prende', async () => {
    const conectando = g.conectarGoogle('drive');
    volver('openid email');
    await expect(conectando).rejects.toMatchObject({ codigo: 'incompleto', message: 'Google no dio permiso para guardar en tu Drive. Probá de nuevo y dejá marcada esa opción.' });
    expect(g.permisoGoogle('drive')).toBeNull();
  });

  it('desconectar Classroom con Drive prendido no le avisa a Google; el último uso sí', async () => {
    const pedir = vi.fn(async () => ({}));
    vi.stubGlobal('fetch', pedir);
    sessionStorage.setItem(g.CLAVE_GOOGLE, JSON.stringify({ token: 'tok', vence: Date.now() + 100_000, alcances: [...g.ALCANCES, DRIVE] }));
    sessionStorage.setItem(g.CLAVE_USOS, 'classroom drive');
    g.soltarGoogle('classroom');
    expect(pedir).not.toHaveBeenCalled();
    expect(g.permisoGoogle('drive')).toBe('tok');
    expect(sessionStorage.getItem(g.CLAVE_USOS)).toBe('drive');
    g.soltarGoogle('drive');
    expect(pedir).toHaveBeenCalledTimes(1);
    expect(g.tokenGoogle()).toBeNull();
  });

  it('mandar un archivo pide solo los archivos que crea, y no queda prendido: desconectar el último uso le avisa a Google', async () => {
    const ARCHIVOS = 'https://www.googleapis.com/auth/drive.file';
    let conectando = g.conectarGoogle();
    volver(g.ALCANCES.join(' '));
    await conectando;
    conectando = g.conectarGoogle('adjuntos');
    expect(abierta.searchParams.get('scope').split(' ')).toEqual([ARCHIVOS, 'openid', 'email']);
    expect(abierta.searchParams.get('include_granted_scopes')).toBe('true');
    volver([...g.ALCANCES, ARCHIVOS].join(' '));
    await conectando;
    expect(g.permisoGoogle('adjuntos')).toBe('bueno');
    expect(g.permisoGoogle('drive')).toBeNull();
    expect(sessionStorage.getItem(g.CLAVE_USOS)).toBe('classroom');
    const pedir = vi.fn(async () => ({}));
    vi.stubGlobal('fetch', pedir);
    g.soltarGoogle('classroom');
    expect(pedir).toHaveBeenCalledTimes(1);
    expect(g.permisoGoogle('adjuntos')).toBeNull();
  });

  it('si en Google destildó subir archivos, lo dice', async () => {
    const conectando = g.conectarGoogle('adjuntos');
    volver('openid email');
    await expect(conectando).rejects.toMatchObject({ codigo: 'incompleto', message: 'Google no dio permiso para subir el archivo a tu Drive. Probá de nuevo y dejá marcada esa opción.' });
    expect(g.permisoGoogle('adjuntos')).toBeNull();
  });

  it('la renovación en silencio pide lo de los usos prendidos', async () => {
    sessionStorage.setItem(g.CLAVE_CUENTA, '42');
    sessionStorage.setItem(g.CLAVE_USOS, 'drive');
    const renovando = g.renovarGoogle();
    await vi.waitFor(() => expect(document.querySelector('iframe')).not.toBeNull());
    const p = new URL(document.querySelector('iframe').src).searchParams;
    expect(p.get('scope').split(' ')).toEqual([DRIVE, 'openid', 'email']);
    expect(p.get('prompt')).toBe('none');
    responder({ state: p.get('state'), token: 'nuevo', vence: 3600, idToken: idToken(p.get('nonce')), alcances: `${DRIVE} openid email` });
    expect(await renovando).toBe(true);
    expect(g.permisoGoogle('drive')).toBe('nuevo');
  });

  it('el permiso renovado en una pestaña pasa a las otras del mismo alumno', async () => {
    const clave = sessionStorage.getItem('cl.sesion');
    const otra = new BroadcastChannel('super-cvg-google');
    const recibidos = [];
    otra.onmessage = ({ data }) => { if (data.nuevo) recibidos.push(data); };
    const conectando = g.conectarGoogle('drive');
    volver(`${DRIVE} openid email`);
    await conectando;
    await vi.waitFor(() => expect(recibidos).toHaveLength(1));
    expect(recibidos[0]).toMatchObject({ de: huella(clave), nuevo: { token: 'bueno', alcances: [DRIVE, 'openid', 'email'], usos: ['drive'] } });
    // And one that arrives from another tab is kept if it is newer, without asking Google.
    otra.postMessage({ nuevo: { token: 'de-otra', vence: Date.now() + 3_590_000, alcances: [DRIVE], usos: ['drive'] }, de: huella(clave) });
    await vi.waitFor(() => expect(g.permisoGoogle('drive')).toBe('de-otra'));
    otra.postMessage({ nuevo: { token: 'ajeno', vence: Date.now() + 3_595_000, alcances: [DRIVE] }, de: huella('otra-clave') });
    await new Promise((ok) => setTimeout(ok, 50));
    expect(g.permisoGoogle('drive')).toBe('de-otra');
    otra.close();
  });
});

describe('sin desconectarse', () => {
  let g;
  beforeEach(async () => {
    g = await cargar();
    sessionStorage.setItem('cl.sesion', 'clave-del-campus');
  });
  const marco = () => document.querySelector('iframe');

  it('otra pestaña abierta presta su permiso', async () => {
    const otra = new BroadcastChannel('super-cvg-google');
    otra.onmessage = ({ data }) => {
      if (data.pide) otra.postMessage({ presta: data.pide, token: 'prestado', vence: Date.now() + 3_000_000, email: 'ana@gmail.com', sub: '42' });
    };
    expect(await g.renovarGoogle()).toBe(true);
    otra.close();
    expect(g.tokenGoogle()).toBe('prestado');
    expect(g.cuentaGoogle()).toBe('42');
    expect(marco()).toBeNull();
  });

  it('presta el suyo solo a una pestaña del mismo alumno', async () => {
    sessionStorage.setItem(g.CLAVE_GOOGLE, JSON.stringify({ token: 'mio', vence: Date.now() + 3_000_000 }));
    // Its channel opens with the first request.
    const propia = g.renovarGoogle();
    const otra = new BroadcastChannel('super-cvg-google');
    const recibidos = [];
    otra.onmessage = ({ data }) => {
      if (data.presta) recibidos.push(data.presta);
    };
    otra.postMessage({ pide: 'ajeno', de: huella('otra-clave'), mejorQue: 0 });
    otra.postMessage({ pide: 'propio', de: huella('clave-del-campus'), mejorQue: 0 });
    // (The modules of earlier tests also answer: the same tab, loaded again.)
    await vi.waitFor(() => expect(recibidos).toContain('propio'));
    expect(recibidos).not.toContain('ajeno');
    otra.close();
    // Nobody had a newer one, and it has no account to ask Google for.
    expect(await propia).toBe(false);
  });

  it('sin otra pestaña, le pide a Google sin mostrar nada, para la misma cuenta', async () => {
    sessionStorage.setItem(g.CLAVE_CUENTA, '42');
    const renovando = g.renovarGoogle();
    await vi.waitFor(() => expect(marco()).not.toBeNull());
    expect(marco().hidden).toBe(true);
    const p = new URL(marco().src).searchParams;
    expect(p.get('prompt')).toBe('none');
    expect(p.get('login_hint')).toBe('42');
    responder({ state: p.get('state'), token: 'nuevo', vence: 3600, idToken: idToken(p.get('nonce')) });
    expect(await renovando).toBe(true);
    expect(g.tokenGoogle()).toBe('nuevo');
    expect(marco()).toBeNull();
  });

  it('guardando en Drive, una sesión nueva renueva sin preguntar para la cuenta que Drive recuerda', async () => {
    // The tab doesn't know the account (no «Seguir conectado»): saving in Drive does.
    sessionStorage.setItem(g.CLAVE_USOS, 'drive');
    g.pistaDeCuenta(() => '42');
    const renovando = g.renovarGoogle();
    await vi.waitFor(() => expect(marco()).not.toBeNull());
    const p = new URL(marco().src).searchParams;
    expect(p.get('prompt')).toBe('none');
    expect(p.get('login_hint')).toBe('42');
    expect(p.get('scope').split(' ')).toEqual(['https://www.googleapis.com/auth/drive.appdata', 'openid', 'email']);
    responder({ state: p.get('state'), token: 'nuevo', vence: 3600, idToken: idToken(p.get('nonce')), alcances: p.get('scope') });
    expect(await renovando).toBe(true);
    expect(g.permisoGoogle('drive')).toBe('nuevo');
    expect(g.cuentaGoogle()).toBe('42');
    g.pistaDeCuenta(() => null);
  });

  it('si Google tendría que preguntar, no insiste: queda para un clic, sin olvidar la cuenta', async () => {
    sessionStorage.setItem(g.CLAVE_CUENTA, '42');
    const renovando = g.renovarGoogle();
    await vi.waitFor(() => expect(marco()).not.toBeNull());
    responder({ state: new URL(marco().src).searchParams.get('state'), error: 'interaction_required' });
    expect(await renovando).toBe(false);
    expect(g.tokenGoogle()).toBeNull();
    expect(g.cuentaGoogle()).toBe('42');
    expect(marco()).toBeNull();
  });

  it('sin una cuenta conectada antes, no intenta nada', async () => {
    expect(await g.renovarGoogle()).toBe(false);
    expect(marco()).toBeNull();
  });
});
