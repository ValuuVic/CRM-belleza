// Ruta no encontrada y manejador global de errores (B1-04, B1-05).
// Contrato (docs/especificacion.md §8.6): { "error": "…" } y 422 { "errores": { campo: "…" } }.
// MySQL 1062 → 409 y 3819 → 422 (CLAUDE.md §4). Los 500 no revelan información interna.

import { ErrorHttp } from '../utils/errores.js';

/**
 * Restricciones CHECK de MySQL → campo del contrato, para responder 3819 como
 * 422 { "errores": { campo } }. Empieza vacía a propósito: los nombres reales los
 * definen las migraciones de la Parte A y se añadirán cuando existan.
 * Las restricciones que no estén aquí se informan en el campo "general".
 * @type {Record<string, string>}
 */
export const RESTRICCIONES_A_CAMPOS = {};

const MENSAJE_500 = 'Error interno del servidor';

export function rutaNoEncontrada(req, res) {
  res.status(404).json({ error: 'Recurso no encontrado' });
}

function campoDeRestriccion(error) {
  const nombre = /constraint '([^']+)'/i.exec(String(error.sqlMessage || error.message || ''))?.[1];
  // Object.hasOwn evita leer claves heredadas del prototipo ("constructor", "toString"…).
  return nombre && Object.hasOwn(RESTRICCIONES_A_CAMPOS, nombre) ? RESTRICCIONES_A_CAMPOS[nombre] : 'general';
}

/**
 * Datos del error que pueden registrarse sin riesgo (S2, S4).
 * Los errores de MySQL incluyen en `message`, `sqlMessage` y `sql` el usuario, el host,
 * el nombre de la base de datos o valores de la consulta, así que solo se registran sus códigos.
 * La pila de otros errores solo se registra fuera de producción.
 */
export function datosRegistrables(error, req) {
  const esMysql = error && (error.errno !== undefined || error.sqlState !== undefined || error.sqlMessage !== undefined);
  const datos = {
    metodo: req?.method,
    ruta: req?.path,
    tipo: error?.name ?? typeof error,
    codigo: error?.code,
    errno: error?.errno,
  };
  if (!esMysql && process.env.NODE_ENV !== 'production' && error?.stack) datos.pila = error.stack;
  return datos;
}

// Express identifica el manejador de errores por sus cuatro parámetros.
// eslint-disable-next-line no-unused-vars
export function manejadorErrores(error, req, res, next) {
  if (res.headersSent) return next(error);

  // Errores del lector de JSON de Express (cuerpo mal formado, demasiado grande, etc.).
  if (error?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'El cuerpo de la petición no es un JSON válido' });
  }
  // Errores controlados de la aplicación.
  if (error instanceof ErrorHttp) {
    return res.status(error.status).json(error.cuerpo);
  }

  // Otros errores 4xx de Express o del lector de JSON (cuerpo demasiado grande, juego de
  // caracteres no admitido, parámetro de ruta mal codificado como /api/clientes/%E0…):
  // el contrato los trata como "petición no interpretable o parámetro inválido" (§8.6).
  if (Number.isInteger(error?.status) && error.status >= 400 && error.status < 500) {
    return res.status(400).json({ error: 'Petición inválida' });
  }

  // Errores de MySQL con traducción en el contrato.
  if (error?.errno === 1062) {
    return res.status(409).json({ error: 'El registro ya existe' });
  }
  if (error?.errno === 3819) {
    return res.status(422).json({ errores: { [campoDeRestriccion(error)]: 'El valor no cumple las restricciones permitidas' } });
  }

  // Error inesperado: se registra en el servidor y se responde sin detalles.
  console.error('[API] Error inesperado:', datosRegistrables(error, req));
  return res.status(500).json({ error: MENSAJE_500 });
}
