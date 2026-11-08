// Consultas y reglas de actividades comerciales (A5, R2, R8; B5).
// - SQL fijo con parámetros `?` (S3). La propiedad se decide SIEMPRE por el dueño ACTUAL del cliente
//   (clientes.vendedor_id = vendedor del token; R2, B5 §5.5): si el panel reasigna un cliente, sus
//   actividades pasan a verse por el nuevo vendedor y el anterior deja de verlas (B5-15).
//   actividades.vendedor_id solo registra quién la creó y nunca se devuelve (R8).
// - Orden de bloqueos (D17 extendido a B5): vendedor → cliente → actividad. Nunca se bloquea una
//   actividad antes que su cliente (por eso no se usa JOIN … FOR UPDATE): el borrado en cascada
//   del panel (cliente → actividades) sigue el mismo orden.
// - `vencida` se calcula al responder (§8.4): no completada, con vencimiento y anterior a «ahora».

import { ErrorValidacion, noEncontrado } from '../utils/errores.js';
import { fechaIso, fechaUtc, reunir, textoObligatorio } from '../utils/validaciones.js';

export const TIPOS_ACTIVIDAD = Object.freeze(['llamada', 'reunion', 'tarea']);
export const ESTADOS_ACTIVIDAD = Object.freeze(['pendiente', 'completada']);
export const LONGITUD_DESCRIPCION = 500; // actividades.descripcion VARCHAR(500) (§4.7)
export const MENSAJE_ACTIVIDAD_NO_ENCONTRADA = 'Actividad no encontrada';

const MENSAJE_TIPO = `Seleccione un tipo de actividad válido: ${TIPOS_ACTIVIDAD.join(', ')}`;
const MENSAJE_VENCE_EN = 'Indique la fecha de vencimiento en formato ISO 8601 con zona horaria, por ejemplo 2026-12-01T10:00:00-06:00';
const MENSAJE_COMPLETADA = 'El campo completada debe ser true o false';

// Consultas completas como texto literal (sin plantillas), igual que en B3 y B4.
export const SQL_ACTIVIDADES = Object.freeze({
  // Pendientes primero; dentro de cada grupo, las que vencen antes; sin vencimiento al final.
  listar:
    'SELECT a.id, a.tipo, a.descripcion, a.vence_en, a.completada, c.id AS cliente_id, c.nombre AS cliente_nombre FROM actividades a JOIN clientes c ON c.id = a.cliente_id WHERE c.vendedor_id = ? ORDER BY a.completada, a.vence_en IS NULL, a.vence_en, a.id',
  listarPorEstado:
    'SELECT a.id, a.tipo, a.descripcion, a.vence_en, a.completada, c.id AS cliente_id, c.nombre AS cliente_nombre FROM actividades a JOIN clientes c ON c.id = a.cliente_id WHERE c.vendedor_id = ? AND a.completada = ? ORDER BY a.completada, a.vence_en IS NULL, a.vence_en, a.id',
  leer:
    'SELECT a.id, a.tipo, a.descripcion, a.vence_en, a.completada, c.id AS cliente_id, c.nombre AS cliente_nombre FROM actividades a JOIN clientes c ON c.id = a.cliente_id WHERE a.id = ? AND c.vendedor_id = ?',
  clienteDeActividad: 'SELECT cliente_id FROM actividades WHERE id = ?',
  // Las lecturas con bloqueo devuelven lo necesario para responder al PATCH (ver bloquearActividadPropia).
  bloquearClientePropio: 'SELECT id, nombre FROM clientes WHERE id = ? AND vendedor_id = ? FOR UPDATE',
  bloquearActividad: 'SELECT id, tipo, descripcion, vence_en, completada FROM actividades WHERE id = ? AND cliente_id = ? FOR UPDATE',
  insertar: 'INSERT INTO actividades (cliente_id, vendedor_id, tipo, descripcion, vence_en, completada, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, UTC_TIMESTAMP(), UTC_TIMESTAMP())',
  actualizarCompletada: 'UPDATE actividades SET completada = ?, updated_at = UTC_TIMESTAMP() WHERE id = ? AND cliente_id = ?',
});

/** Actividad en el formato del contrato (§8.4). `ahora` en milisegundos (inyectable en pruebas). */
export function serializarActividad(fila, ahora = Date.now()) {
  const completada = Boolean(Number(fila.completada));
  const vence = fila.vence_en instanceof Date ? fila.vence_en : fila.vence_en ? new Date(fila.vence_en) : null;
  return {
    id: fila.id,
    cliente: { id: fila.cliente_id, nombre: fila.cliente_nombre },
    tipo: fila.tipo,
    descripcion: fila.descripcion,
    vence_en: fechaIso(vence),
    completada,
    vencida: !completada && vence !== null && vence.getTime() < ahora,
  };
}

/** Valida el cuerpo de POST /clientes/:id/actividades. Los demás campos se ignoran (D5). */
export function validarActividad(cuerpo) {
  const tipo = TIPOS_ACTIVIDAD.includes(cuerpo.tipo) ? { valor: cuerpo.tipo } : { error: MENSAJE_TIPO };
  // Se cuentan caracteres Unicode (puntos de código), igual que VARCHAR(500) en utf8mb4.
  const descripcion = textoObligatorio(cuerpo.descripcion, {
    maximo: LONGITUD_DESCRIPCION, vacio: 'Ingrese la descripción de la actividad', etiqueta: 'La descripción',
  });
  let venceEn;
  if (cuerpo.vence_en === undefined || cuerpo.vence_en === null) venceEn = { valor: null }; // sin vencimiento
  else {
    const r = fechaUtc(cuerpo.vence_en); // exige zona horaria explícita; '' o sin zona → 422 (R8)
    venceEn = r.valido ? { valor: r.fecha } : { error: MENSAJE_VENCE_EN };
  }
  return reunir({ tipo, descripcion, vence_en: venceEn });
}

/** `completada` solo admite booleanos JSON (B5-12): "si", "true", 1 o null → 422. */
export function validarCompletada(valor) {
  if (typeof valor !== 'boolean') throw new ErrorValidacion({ completada: MENSAJE_COMPLETADA });
  return valor;
}

/** Actividades de los clientes que el vendedor tiene HOY en su cartera (B5-01 a B5-03). */
export async function leerActividades(db, vendedorId, estado) {
  const [filas] = estado
    ? await db.execute(SQL_ACTIVIDADES.listarPorEstado, [vendedorId, estado === 'completada' ? 1 : 0])
    : await db.execute(SQL_ACTIVIDADES.listar, [vendedorId]);
  const ahora = Date.now();
  return filas.map((f) => serializarActividad(f, ahora));
}

/** Una actividad si su cliente es del vendedor; si no, null (defensa en profundidad, S5). */
export async function leerActividad(db, id, vendedorId) {
  const [[fila]] = await db.execute(SQL_ACTIVIDADES.leer, [id, vendedorId]);
  return fila ? serializarActividad(fila) : null;
}

/**
 * Bloquea una actividad de un cliente propio en el orden cliente → actividad (después de
 * bloquearVendedor). Ajena o inexistente → 404 con el mismo mensaje (S5, B5-13).
 * La primera lectura (sin bloqueo) solo localiza el cliente; la propiedad se confirma con el
 * cliente bloqueado y la actividad se vuelve a comprobar bajo bloqueo.
 * Esa primera lectura fija la instantánea de REPEATABLE READ, así que una lectura posterior SIN
 * bloqueo podría no ver un cambio confirmado entretanto (p. ej. el cliente recién asignado a este
 * vendedor). Por eso devuelve las filas leídas BAJO BLOQUEO y la respuesta se construye con ellas.
 *
 * @returns {Promise<{ cliente: { id, nombre }, actividad: { id, tipo, descripcion, vence_en, completada } }>}
 */
export async function bloquearActividadPropia(conn, id, vendedorId) {
  const [[ubicacion]] = await conn.execute(SQL_ACTIVIDADES.clienteDeActividad, [id]);
  if (!ubicacion) throw noEncontrado(MENSAJE_ACTIVIDAD_NO_ENCONTRADA);
  const [[cliente]] = await conn.execute(SQL_ACTIVIDADES.bloquearClientePropio, [ubicacion.cliente_id, vendedorId]);
  if (!cliente) throw noEncontrado(MENSAJE_ACTIVIDAD_NO_ENCONTRADA);
  const [[actividad]] = await conn.execute(SQL_ACTIVIDADES.bloquearActividad, [id, cliente.id]);
  if (!actividad) throw noEncontrado(MENSAJE_ACTIVIDAD_NO_ENCONTRADA);
  return { cliente, actividad };
}

/** Actualiza `completada` de una actividad ya bloqueada y devuelve su forma §8.4 (B5-11). */
export async function marcarCompletada(conn, { cliente, actividad }, completada) {
  const [r] = await conn.execute(SQL_ACTIVIDADES.actualizarCompletada, [completada ? 1 : 0, actividad.id, cliente.id]);
  // Bajo bloqueo la fila no puede desaparecer; si ocurriera, se aborta (rollback) en vez de responder.
  if (r.affectedRows !== 1) throw new Error('La actividad bloqueada no se pudo actualizar');
  return serializarActividad({
    ...actividad, completada: completada ? 1 : 0, cliente_id: cliente.id, cliente_nombre: cliente.nombre,
  });
}
