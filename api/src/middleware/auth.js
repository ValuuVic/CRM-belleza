// Middleware de autenticación de vendedores (A2; B2-06 a B2-09; R1, R2, S5).
// 1. Exige `Authorization: Bearer <token>`.
// 2. Verifica firma, expiración y HS256 (config/jwt.js).
// 3. Vuelve a consultar el usuario en CADA petición: si se borró, se desactivó o dejó de ser
//    vendedor, el token deja de servir aunque no haya expirado (§3.4).
// 4. La identidad (`req.vendedor`) sale solo del token verificado y de la base de datos;
//    nunca de req.body, req.query ni req.params.

import { ErrorHttp } from '../utils/errores.js';
import { verificarToken } from '../config/jwt.js';

const noAutenticado = () => new ErrorHttp(401, 'Autenticación requerida o sesión no válida');

export function crearAutenticacion({ pool }) {
  return async function autenticar(req, res, next) {
    const m = /^Bearer ([A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]*)$/.exec(req.get('authorization') ?? '');
    if (!m) throw noAutenticado();

    let payload;
    try {
      payload = verificarToken(m[1]);
    } catch {
      throw noAutenticado(); // firma, expiración o algoritmo no válidos
    }

    const id = Number(payload?.sub);
    if (!Number.isSafeInteger(id) || id <= 0) throw noAutenticado();

    const [filas] = await pool.execute(
      'SELECT id, name AS nombre, email AS correo, rol, activo FROM users WHERE id = ? LIMIT 1',
      [id],
    );
    const usuario = filas[0];
    if (!usuario || usuario.rol !== 'vendedor' || !Number(usuario.activo)) throw noAutenticado();

    req.vendedor = { id: usuario.id, nombre: usuario.nombre, correo: usuario.correo };
    next();
  };
}
