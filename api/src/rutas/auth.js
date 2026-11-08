// POST /api/auth/login (A1; B2-01 a B2-05; S1, S4).
// - Solo los vendedores activos reciben un JWT.
// - Credenciales incorrectas → 401 con el mismo mensaje para correo inexistente y clave incorrecta.
// - Rol no permitido o cuenta inactiva, con la clave correcta → 403 sin token.
// - Express no crea usuarios ni genera hashes: Laravel los genera y aquí solo se verifican (S1).

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { ErrorHttp, ErrorValidacion } from '../utils/errores.js';
import { exigirCuerpoObjeto } from '../utils/validaciones.js';
import { firmarToken } from '../config/jwt.js';
import { randomBytes } from 'node:crypto';

// Hash falso con el coste por defecto de Laravel (12). Se compara cuando el correo no existe,
// para que el tiempo de respuesta no revele si la cuenta existe (B2-03).
const HASH_FALSO = bcrypt.hashSync(randomBytes(24).toString('hex'), 12);

const CORREO_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LONGITUD_MAXIMA = 255;

/**
 * Valida el cuerpo del login.
 * - 400 si no hay un objeto JSON: sin cuerpo, otro Content-Type, cuerpo vacío
 *   (Express 5 lo entrega como {}), array u otro valor.
 * - 422 { errores } si es un objeto con correo o clave ausentes, vacíos o inválidos.
 */
function validarCuerpo(req) {
  const cuerpo = exigirCuerpoObjeto(req); // utils/validaciones.js (compartida con clientes, B3)
  const errores = {};
  const correo = typeof cuerpo.correo === 'string' ? cuerpo.correo.trim() : cuerpo.correo;
  const { clave } = cuerpo;

  if (correo === undefined || correo === null || correo === '') errores.correo = 'Ingrese su correo electrónico';
  else if (typeof correo !== 'string' || correo.length > LONGITUD_MAXIMA || !CORREO_VALIDO.test(correo)) {
    errores.correo = 'Ingrese un correo electrónico válido';
  }
  if (clave === undefined || clave === null || clave === '') errores.clave = 'Ingrese su contraseña';
  else if (typeof clave !== 'string' || clave.length > LONGITUD_MAXIMA) errores.clave = 'La contraseña no es válida';

  if (Object.keys(errores).length) throw new ErrorValidacion(errores);
  return { correo, clave };
}

/**
 * @param {{ pool: { execute: Function }, comparar?: (clave: string, hash: string) => Promise<boolean> }} deps
 *   comparar: por defecto bcrypt.compare; las pruebas la sustituyen para comprobar el uso del hash falso.
 */
export function crearRutasAuth({ pool, comparar = bcrypt.compare }) {
  const router = Router();

  router.post('/login', async (req, res) => {
    // Solo se leen `correo` y `clave`; cualquier otro campo se ignora (CLAUDE.md §6).
    const { correo, clave } = validarCuerpo(req);

    const [filas] = await pool.execute(
      'SELECT id, name AS nombre, email AS correo, password, rol, activo FROM users WHERE email = ? LIMIT 1',
      [correo],
    );
    const usuario = filas[0];

    const claveCorrecta = await comparar(clave, usuario?.password ?? HASH_FALSO);
    if (!usuario || !claveCorrecta) throw new ErrorHttp(401, 'Credenciales incorrectas');

    if (usuario.rol !== 'vendedor' || !Number(usuario.activo)) {
      throw new ErrorHttp(403, 'Su cuenta no tiene acceso a la aplicación de vendedores');
    }

    res.status(200).json({
      token: firmarToken(usuario.id),
      usuario: { id: usuario.id, nombre: usuario.nombre, correo: usuario.correo },
    });
  });

  return router;
}

// Se exporta solo para las pruebas (B2-03: comparación con hash falso).
export const _HASH_FALSO_PARA_PRUEBAS = HASH_FALSO;
