// Comunicación con la API REST mediante Fetch (B2-12, B2-14, B2-16). La SPA nunca accede a MySQL.

import { obtenerEstado, actualizar, cerrarSesion } from './estado.js';

export const URL_API = 'http://127.0.0.1:3000/api';

export const MENSAJE_SIN_CONEXION = 'No se pudo conectar con el servidor. Compruebe su conexión e inténtelo de nuevo.';
export const MENSAJE_SESION_EXPIRADA = 'Su sesión ha expirado. Inicie sesión nuevamente.';

/** Sesión expirada o revocada (B2-14): borra el token, avisa y vuelve al login. */
function manejarSesionExpirada() {
  cerrarSesion();
  actualizar({ aviso: { tipo: 'warning', texto: MENSAJE_SESION_EXPIRADA } });
  if (globalThis.location) globalThis.location.hash = '#/login';
}

/**
 * Hace una petición a la API.
 * @returns {Promise<{ ok: boolean, status: number, datos: any, errorRed?: boolean }>}
 *   `status` es 0 cuando no se pudo conectar.
 */
export async function pedir(ruta, { metodo = 'GET', cuerpo, protegida = true } = {}) {
  const cabeceras = { Accept: 'application/json' };
  if (cuerpo !== undefined) cabeceras['Content-Type'] = 'application/json';
  const token = obtenerEstado().sesion?.token;
  if (protegida && token) cabeceras.Authorization = `Bearer ${token}`;

  let respuesta;
  try {
    respuesta = await globalThis.fetch(`${URL_API}${ruta}`, {
      method: metodo,
      headers: cabeceras,
      body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
    });
  } catch {
    return { ok: false, status: 0, datos: { error: MENSAJE_SIN_CONEXION }, errorRed: true };
  }

  let datos = null;
  try {
    const texto = await respuesta.text();
    datos = texto ? JSON.parse(texto) : null;
  } catch {
    datos = null;
  }

  if (respuesta.status === 401 && protegida) manejarSesionExpirada();
  return { ok: respuesta.ok, status: respuesta.status, datos };
}

/** POST /api/auth/login con { correo, clave }. No es una ruta protegida: un 401 es "credenciales incorrectas". */
export const iniciarSesion = (correo, clave) => pedir('/auth/login', { metodo: 'POST', cuerpo: { correo, clave }, protegida: false });

/** GET /api/clientes: array plano con la cartera del vendedor. */
export const obtenerClientes = () => pedir('/clientes');
