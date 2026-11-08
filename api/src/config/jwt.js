// Firma y verificación de JWT (A2, CLAUDE.md §7, B2-01 y B2-07).
// - Algoritmo HS256 explícito al firmar y al verificar.
// - JWT_SECRET y JWT_EXPIRES_IN solo desde el entorno; server.js valida el secreto al arrancar.
// - Se leen en cada llamada para no fijar el secreto al importar el módulo (las pruebas lo cambian).

import jwt from 'jsonwebtoken';

const ALGORITMO = 'HS256';
const EXPIRACION_POR_DEFECTO = '8h';

const secreto = () => process.env.JWT_SECRET;

/**
 * Expiración configurada. Un valor solo con dígitos ("3600") son SEGUNDOS: jsonwebtoken
 * interpretaría el texto "3600" como 3600 milisegundos, así que se convierte a número.
 * Los valores con unidad ("8h", "30m") se pasan tal cual.
 */
export function expiracion() {
  const valor = (process.env.JWT_EXPIRES_IN ?? '').trim();
  if (!valor) return EXPIRACION_POR_DEFECTO;
  return /^\d+$/.test(valor) ? Number(valor) : valor;
}

/** Firma un token cuyo `sub` es el id del usuario. */
export function firmarToken(usuarioId) {
  return jwt.sign({ sub: String(usuarioId) }, secreto(), {
    algorithm: ALGORITMO,
    expiresIn: expiracion(),
  });
}

/**
 * Verifica firma, expiración y algoritmo. Devuelve el payload o lanza el error de jsonwebtoken.
 * `algorithms: ['HS256']` rechaza los tokens `none`, HS384/HS512 y los asimétricos.
 */
export function verificarToken(token) {
  return jwt.verify(token, secreto(), { algorithms: [ALGORITMO] });
}
