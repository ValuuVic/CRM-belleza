// Validaciones compartidas de B1 (B1-06, B1-07, B1-08) y de las rutas (B2, B3).
// Reglas: docs/especificacion.md §5 R4 (NIT y teléfono) y R8 (fechas).
// normalizarNit, normalizarTelefono y fechaUtc no lanzan excepciones: devuelven { valido, … }.
// exigirCuerpoObjeto y validarCliente (al final del archivo) sí lanzan ErrorHttp/ErrorValidacion,
// porque las usan directamente los manejadores de ruta.

import { ErrorValidacion, peticionInvalida } from './errores.js';

/**
 * Normaliza y valida un NIT guatemalteco (R4).
 * - Elimina espacios y guiones, convierte a mayúsculas y quita los ceros iniciales.
 * - "CF" (consumidor final) es válido y se representa como null.
 * - El último carácter es el dígito verificador (0-9 o K), calculado con módulo 11:
 *   los dígitos del cuerpo se multiplican por pesos n+1 … 2 (de izquierda a derecha),
 *   verificador = (11 - (suma % 11)) % 11, y 10 se representa como "K".
 *
 * @param {unknown} valor
 * @returns {{ valido: boolean, nit: string | null }}
 */
export function normalizarNit(valor) {
  if (typeof valor !== 'string') return { valido: false, nit: null };

  const limpio = valor.replace(/[\s-]/g, '').toUpperCase();
  if (limpio === 'CF') return { valido: true, nit: null };

  const sinCeros = limpio.replace(/^0+/, '');
  if (!/^\d+[\dK]$/.test(sinCeros)) return { valido: false, nit: null };

  const cuerpo = sinCeros.slice(0, -1);
  const verificador = sinCeros.slice(-1);

  let suma = 0;
  for (let i = 0; i < cuerpo.length; i++) {
    suma += Number(cuerpo[i]) * (cuerpo.length + 1 - i);
  }
  const resultado = (11 - (suma % 11)) % 11;
  const esperado = resultado === 10 ? 'K' : String(resultado);

  return esperado === verificador ? { valido: true, nit: sinCeros } : { valido: false, nit: null };
}

/**
 * Normaliza y valida un teléfono guatemalteco (R4).
 * - Elimina separadores: espacios, guiones, puntos y paréntesis.
 * - Elimina el prefijo de Guatemala: "+502", o "502" cuando quedan 11 dígitos.
 * - Debe quedar un número de 8 dígitos que empiece por 2-9.
 *
 * @param {unknown} valor
 * @returns {{ valido: boolean, telefono: string | null }}
 */
export function normalizarTelefono(valor) {
  if (typeof valor !== 'string') return { valido: false, telefono: null };

  let limpio = valor.replace(/[\s\-.()]/g, '');
  if (limpio.startsWith('+502')) limpio = limpio.slice(4);
  else if (/^502\d{8}$/.test(limpio)) limpio = limpio.slice(3);

  return /^[2-9]\d{7}$/.test(limpio)
    ? { valido: true, telefono: limpio }
    : { valido: false, telefono: null };
}

// AAAA-MM-DDTHH:MM[:SS[.mmm]] seguido obligatoriamente de Z o ±HH:MM.
const FECHA_CON_ZONA =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-](\d{2}):(\d{2}))$/;

const esBisiesto = (a) => (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0;
const diasDelMes = (a, m) => [31, esBisiesto(a) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];

/**
 * Valida una fecha ISO 8601 con zona horaria explícita y la normaliza a UTC (R8).
 * Se rechazan las fechas sin zona ("2026-10-15T10:00"), solo fecha ("2026-10-15"),
 * fechas imposibles ("2026-02-31T…") y cualquier otro formato ambiguo.
 *
 * @param {unknown} valor
 * @returns {{ valido: boolean, fecha: Date | null }}
 */
export function fechaUtc(valor) {
  if (typeof valor !== 'string') return { valido: false, fecha: null };

  const m = FECHA_CON_ZONA.exec(valor);
  if (!m) return { valido: false, fecha: null };

  const [, a, mes, dia, hora, min, seg = '00', , zona, zh, zm] = m;
  const anio = Number(a);
  const nMes = Number(mes);
  const fueraDeRango =
    nMes < 1 || nMes > 12 ||
    Number(dia) < 1 || Number(dia) > diasDelMes(anio, nMes) ||
    Number(hora) > 23 || Number(min) > 59 || Number(seg) > 59 ||
    (zona !== 'Z' && (Number(zh) > 14 || Number(zm) > 59));
  if (fueraDeRango) return { valido: false, fecha: null };

  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? { valido: false, fecha: null } : { valido: true, fecha };
}

/**
 * Exige que el cuerpo de la petición sea un objeto JSON (B2-02, B3-07); si no, 400.
 * Sin cuerpo, otro Content-Type, cuerpo vacío (Express 5 lo entrega como {}), array u otro valor → 400.
 * req.bytesCuerpo lo registra express.json (app.js); si el lector JSON no lo registra
 * (router montado sin la opción `verify`), se usa Content-Length.
 *
 * @returns {Record<string, unknown>} el cuerpo
 */
export function exigirCuerpoObjeto(req) {
  const cuerpo = req.body;
  const bytes = req.bytesCuerpo ?? (Number(req.get('content-length')) || 0);
  const sinCuerpo = !req.is('application/json') || !(bytes > 0);
  if (sinCuerpo || cuerpo === null || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) {
    throw peticionInvalida('El cuerpo de la petición debe ser un objeto JSON');
  }
  return cuerpo;
}

/**
 * Identificador numérico de ruta (B3-06). Devuelve el número o null si no es un entero positivo
 * seguro: "abc", "0", "-1", "1.5", "01" o valores enormes no son identificadores válidos.
 */
export function idValido(valor) {
  if (typeof valor !== 'string' || !/^[1-9]\d{0,15}$/.test(valor)) return null;
  const n = Number(valor);
  return Number.isSafeInteger(n) ? n : null;
}

// Longitudes de las columnas de `clientes` (docs/especificacion.md §4.3).
export const LONGITUD_NOMBRE_CLIENTE = 150;
export const LONGITUD_CORREO_CLIENTE = 150;
const CORREO_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Campos editables de un cliente (esp. §8.2 y B3 §3.2–3.3). Cualquier otro campo se ignora. */
export const CAMPOS_CLIENTE = Object.freeze(['nombre', 'nit', 'telefono', 'correo']);

/**
 * Valida y normaliza los datos de un cliente (R4; B3-07, B3-09, B3-10, B3-13).
 * - Solo se leen nombre, nit, telefono y correo; los demás campos del cuerpo se ignoran.
 * - Alta (parcial = false): nombre, nit y telefono obligatorios; correo opcional.
 * - Edición (parcial = true): solo se validan los campos presentes; si no hay ninguno → 400.
 * - nit "CF" → null; teléfono sin separadores ni prefijo +502; correo null o '' → null.
 *
 * @param {Record<string, unknown>} cuerpo
 * @param {{ parcial?: boolean }} [opciones]
 * @returns {Partial<{ nombre: string, nit: string | null, telefono: string, correo: string | null }>}
 * @throws {ErrorValidacion} 422 con los mensajes por campo.
 */
export function validarCliente(cuerpo, { parcial = false } = {}) {
  const presentes = CAMPOS_CLIENTE.filter((c) => Object.hasOwn(cuerpo, c) && cuerpo[c] !== undefined);
  if (parcial && presentes.length === 0) {
    throw peticionInvalida('Indique al menos un campo para actualizar: nombre, nit, telefono o correo');
  }
  const debeValidar = (campo) => !parcial || presentes.includes(campo);
  const errores = {};
  const valores = {};

  if (debeValidar('nombre')) {
    const nombre = typeof cuerpo.nombre === 'string' ? cuerpo.nombre.trim() : cuerpo.nombre;
    if (nombre === undefined || nombre === null || nombre === '') errores.nombre = 'Ingrese el nombre del cliente';
    else if (typeof nombre !== 'string') errores.nombre = 'El nombre debe ser un texto';
    else if (nombre.length > LONGITUD_NOMBRE_CLIENTE) errores.nombre = `El nombre no puede superar ${LONGITUD_NOMBRE_CLIENTE} caracteres`;
    else valores.nombre = nombre;
  }

  if (debeValidar('nit')) {
    const vacio = cuerpo.nit === undefined || cuerpo.nit === null || (typeof cuerpo.nit === 'string' && cuerpo.nit.trim() === '');
    const r = normalizarNit(cuerpo.nit);
    if (vacio) errores.nit = 'Ingrese el NIT o CF para consumidor final';
    else if (!r.valido) errores.nit = 'El NIT no es válido; revise el número y el dígito verificador, o use CF';
    else valores.nit = r.nit;
  }

  if (debeValidar('telefono')) {
    const vacio = cuerpo.telefono === undefined || cuerpo.telefono === null || (typeof cuerpo.telefono === 'string' && cuerpo.telefono.trim() === '');
    const r = normalizarTelefono(cuerpo.telefono);
    if (vacio) errores.telefono = 'Ingrese el teléfono del cliente';
    else if (!r.valido) errores.telefono = 'El teléfono debe tener 8 dígitos y comenzar con un dígito del 2 al 9';
    else valores.telefono = r.telefono;
  }

  if (debeValidar('correo')) {
    const correo = typeof cuerpo.correo === 'string' ? cuerpo.correo.trim() : cuerpo.correo;
    if (correo === undefined || correo === null || correo === '') valores.correo = null;
    else if (typeof correo !== 'string' || correo.length > LONGITUD_CORREO_CLIENTE || !CORREO_VALIDO.test(correo)) {
      errores.correo = 'Ingrese un correo electrónico válido o deje el campo vacío';
    } else valores.correo = correo;
  }

  if (Object.keys(errores).length) throw new ErrorValidacion(errores);
  return valores;
}
