// Acción de inicio de sesión (B2-11 a B2-14, B6-09; F1). Mismo patrón que acciones-*.js: solo
// cambia el estado; app.js lee el formulario, lo vacía y navega. Separada de app.js para probarla
// sin navegador.
// - La contraseña solo viaja en la petición: nunca se guarda en el estado ni en localStorage.
// - Solo un 200 con token y usuario guarda la sesión. Un 401 (credenciales) o un 403 (cuenta que
//   no es de vendedor o está desactivada) muestran el mensaje de la API y no guardan ningún token.

import { actualizar, guardarSesion } from './estado.js';
import { iniciarSesion } from './api.js';

export const MENSAJE_LOGIN = 'No se pudo iniciar sesión.';
export const MENSAJE_REVISE_DATOS = 'Revise los datos ingresados.';

const mensajeDe = (r, porDefecto) => (typeof r.datos?.error === 'string' && r.datos.error) || porDefecto;

/**
 * Envía { correo, clave } a POST /api/auth/login.
 * @returns {Promise<boolean>} true si se inició la sesión (app.js navega a la cartera).
 */
export async function enviarLogin({ correo, clave }) {
  const correoLimpio = String(correo ?? '').trim();
  actualizar({ aviso: null, login: { cargando: true, correo: correoLimpio, errores: {}, mensaje: null } });
  const r = await iniciarSesion(correoLimpio, String(clave ?? ''));

  if (r.ok && typeof r.datos?.token === 'string' && r.datos.token && r.datos?.usuario && typeof r.datos.usuario === 'object') {
    guardarSesion(r.datos);
    actualizar({ login: { cargando: false, correo: '', errores: {}, mensaje: null } });
    return true;
  }
  const errores = r.status === 422 && r.datos?.errores && typeof r.datos.errores === 'object' ? r.datos.errores : {};
  const conCampos = Object.keys(errores).length > 0;
  const mensaje = r.status === 422
    ? (conCampos ? null : mensajeDe(r, MENSAJE_REVISE_DATOS))
    : mensajeDe(r, MENSAJE_LOGIN);
  actualizar({ login: { cargando: false, correo: correoLimpio, errores, mensaje } });
  return false;
}
