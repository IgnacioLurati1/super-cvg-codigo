// Convierte un error en un texto para mostrar. Lo que no se reconoce no se muestra tal cual: un mensaje técnico
// en pantalla no le sirve a nadie. `conocido`: las reglas de la base ya tiran sus errores en castellano.
export function textoError(error) {
  if (!error) return '';
  const msj = error.message || String(error);
  if (/Failed to fetch|NetworkError|network/i.test(msj)) return 'No hay conexión. Revisá internet y probá de nuevo.';
  if (/JWT expired|invalid JWT/i.test(msj)) return 'Tu sesión venció. Volvé a entrar.';
  if (/Invalid login credentials/i.test(msj)) return 'El mail o la contraseña no coinciden.';
  if (/Email not confirmed/i.test(msj)) return 'Todavía no confirmaste tu mail. Buscá el mensaje en tu casilla.';
  if (/User already registered/i.test(msj)) return 'Ya hay una cuenta con ese mail. Probá entrar o recuperar la contraseña.';
  if (/Password should be at least/i.test(msj)) return 'La contraseña tiene que tener al menos 8 caracteres.';
  if (/rate limit|too many/i.test(msj)) return 'Demasiados intentos seguidos. Esperá unos minutos.';
  if (/Email address .* is invalid|Unable to validate email address/i.test(msj)) return 'Revisá el mail.';
  if (/Email address not authorized|Error sending .*email/i.test(msj)) return 'No se pudo mandar el mail. Probá en un rato.';
  if (error.conocido || error.code === 'P0001') return msj;
  return 'Algo no salió bien. Probá de nuevo en un rato.';
}
