// Consultas y operaciones de oportunidades (A4, R5, R6, RP-1 a RP-3; B4).
// - Todas las consultas usan SQL fijo con parámetros `?` (S3).
// - Totales y subtotales se calculan en MySQL con los precios ALMACENADOS en cada línea (R6, B4-20).
// - Orden global de bloqueos (servicios/vendedores.js): vendedor → cliente → oportunidad → líneas →
//   productos por id ascendente, para que ninguna pareja de transacciones pueda bloquearse mutuamente.
// - Las funciones que escriben deben ejecutarse dentro de conTransaccion (utils/transaccion.js):
//   si algo falla, el rollback deshace el descuento de stock, la etapa y el historial (RP-3, B4-C3).

import { ErrorValidacion, conflicto, noEncontrado } from '../utils/errores.js';
import { fechaIso as aIso } from '../utils/validaciones.js';
import { PROBABILIDAD, estaCerrada, MENSAJE_CERRADA } from './embudo.js';

export const MENSAJE_OPORTUNIDAD_NO_ENCONTRADA = 'Oportunidad no encontrada';
export const MENSAJE_SIN_PRODUCTOS = 'Agregue al menos un producto antes de ganar la oportunidad';

const SQL_HISTORIAL_INSERTAR =
  'INSERT INTO historial_etapas (oportunidad_id, usuario_id, etapa_anterior, etapa_nueva, created_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP())';

const SQL_RESUMENES =
  'SELECT o.id, o.titulo, o.etapa, o.fecha_cierre, c.id AS cliente_id, c.nombre AS cliente_nombre, COALESCE(ROUND(SUM(op.cantidad * op.precio_unitario), 2), 0) AS total FROM oportunidades o JOIN clientes c ON c.id = o.cliente_id LEFT JOIN oportunidad_productos op ON op.oportunidad_id = o.id WHERE o.vendedor_id = ? GROUP BY o.id, o.titulo, o.etapa, o.fecha_cierre, c.id, c.nombre ORDER BY o.id';
const SQL_RESUMENES_POR_ETAPA =
  'SELECT o.id, o.titulo, o.etapa, o.fecha_cierre, c.id AS cliente_id, c.nombre AS cliente_nombre, COALESCE(ROUND(SUM(op.cantidad * op.precio_unitario), 2), 0) AS total FROM oportunidades o JOIN clientes c ON c.id = o.cliente_id LEFT JOIN oportunidad_productos op ON op.oportunidad_id = o.id WHERE o.vendedor_id = ? AND o.etapa = ? GROUP BY o.id, o.titulo, o.etapa, o.fecha_cierre, c.id, c.nombre ORDER BY o.id';

/** Resumen del listado (decisión de B4): sin productos ni historial. */
function serializarResumen(f) {
  return {
    id: f.id,
    cliente: { id: f.cliente_id, nombre: f.cliente_nombre },
    titulo: f.titulo,
    etapa: f.etapa,
    probabilidad: PROBABILIDAD[f.etapa],
    total: Number(f.total),
    fecha_cierre: aIso(f.fecha_cierre),
  };
}

/** Oportunidades del vendedor (B4-02), opcionalmente filtradas por etapa. */
export async function leerResumenes(db, vendedorId, etapa) {
  const [filas] = etapa
    ? await db.execute(SQL_RESUMENES_POR_ETAPA, [vendedorId, etapa])
    : await db.execute(SQL_RESUMENES, [vendedorId]);
  return filas.map(serializarResumen);
}

/**
 * Detalle en el formato del contrato (esp. §8.3; B4-20, B4-21). Filtra por el vendedor del token
 * (defensa en profundidad, S5): devuelve null si no existe o es de otro vendedor.
 */
export async function leerDetalle(db, id, vendedorId) {
  const [[o]] = await db.execute(
    'SELECT o.id, o.titulo, o.etapa, o.fecha_cierre, o.motivo_perdida, c.id AS cliente_id, c.nombre AS cliente_nombre FROM oportunidades o JOIN clientes c ON c.id = o.cliente_id WHERE o.id = ? AND o.vendedor_id = ?',
    [id, vendedorId],
  );
  if (!o) return null;
  const [lineas] = await db.execute(
    'SELECT op.id, op.producto_id, p.nombre, op.cantidad, op.precio_unitario, ROUND(op.cantidad * op.precio_unitario, 2) AS subtotal FROM oportunidad_productos op JOIN productos p ON p.id = op.producto_id WHERE op.oportunidad_id = ? ORDER BY op.id',
    [id],
  );
  const [[{ total }]] = await db.execute(
    'SELECT COALESCE(ROUND(SUM(cantidad * precio_unitario), 2), 0) AS total FROM oportunidad_productos WHERE oportunidad_id = ?',
    [id],
  );
  const [historial] = await db.execute(
    'SELECT h.etapa_anterior, h.etapa_nueva, h.created_at AS fecha, u.name AS usuario FROM historial_etapas h JOIN users u ON u.id = h.usuario_id WHERE h.oportunidad_id = ? ORDER BY h.created_at, h.id',
    [id],
  );
  return {
    id: o.id,
    cliente: { id: o.cliente_id, nombre: o.cliente_nombre },
    titulo: o.titulo,
    etapa: o.etapa,
    probabilidad: PROBABILIDAD[o.etapa],
    total: Number(total),
    fecha_cierre: aIso(o.fecha_cierre),
    motivo_perdida: o.motivo_perdida ?? null,
    productos: lineas.map((l) => ({
      id: l.id,
      producto_id: l.producto_id,
      nombre: l.nombre,
      cantidad: l.cantidad,
      precio_unitario: Number(l.precio_unitario),
      subtotal: Number(l.subtotal),
    })),
    historial: historial.map((h) => ({
      etapa_anterior: h.etapa_anterior ?? null,
      etapa_nueva: h.etapa_nueva,
      usuario: h.usuario, // nombre de quien hizo el cambio (enunciado §8); sin su id (R8)
      fecha: aIso(h.fecha),
    })),
  };
}

/**
 * Bloquea una oportunidad propia (SELECT … FOR UPDATE). Ajena o inexistente → 404 (S5).
 * Con { abierta: true }, una oportunidad ganada o perdida → 409 (CA-10, B4-19).
 * Va justo después de bloquearVendedor (orden vendedor → oportunidad → productos).
 */
export async function bloquearOportunidadPropia(conn, id, vendedorId, { abierta = false } = {}) {
  const [[o]] = await conn.execute(
    'SELECT id, etapa FROM oportunidades WHERE id = ? AND vendedor_id = ? FOR UPDATE',
    [id, vendedorId],
  );
  if (!o) throw noEncontrado(MENSAJE_OPORTUNIDAD_NO_ENCONTRADA);
  if (abierta && estaCerrada(o.etapa)) throw conflicto(MENSAJE_CERRADA);
  return o;
}

/** Registra un evento de historial (B4-04, B4-12): misma transacción que el cambio. */
export function registrarHistorial(conn, { oportunidadId, usuarioId, anterior, nueva }) {
  return conn.execute(SQL_HISTORIAL_INSERTAR, [oportunidadId, usuarioId, anterior, nueva]);
}

/**
 * Regla propia de stock al ganar (RP-1 a RP-3; B4-15 a B4-18, B4-C2, B4-C3).
 * 1. Sin líneas → 422 errores.etapa.
 * 2. Bloquea cada producto en orden ascendente de id (una consulta fija por producto).
 * 3. Comprueba TODAS las líneas antes de escribir: si alguna no alcanza → 409 sin descontar nada.
 * 4. Descuenta solo los productos con stock numérico; stock NULL no se toca (RP-3).
 *    El UPDATE condicional (stock >= cantidad) es una segunda defensa; el CHECK de MySQL, la tercera.
 */
export async function verificarYDescontarStock(conn, oportunidadId) {
  const [lineas] = await conn.execute(
    'SELECT producto_id, cantidad FROM oportunidad_productos WHERE oportunidad_id = ? ORDER BY producto_id FOR UPDATE',
    [oportunidadId],
  );
  if (lineas.length === 0) throw new ErrorValidacion({ etapa: MENSAJE_SIN_PRODUCTOS });

  const productos = [];
  for (const linea of lineas) {
    const [[p]] = await conn.execute('SELECT id, nombre, stock FROM productos WHERE id = ? FOR UPDATE', [linea.producto_id]);
    // Falla en modo cerrado: una línea sin producto no se trata como «sin control de inventario».
    if (!p) throw new Error('Producto de una línea no encontrado al verificar el stock');
    productos.push({ ...linea, nombre: p.nombre, stock: p.stock });
  }

  const insuficientes = productos.filter((p) => p.stock !== null && p.stock < p.cantidad);
  if (insuficientes.length) {
    throw conflicto(`Stock insuficiente para: ${insuficientes.map((p) => `${p.nombre} (disponible ${p.stock}, solicitado ${p.cantidad})`).join('; ')}`);
  }

  for (const p of productos.filter((x) => x.stock !== null)) {
    const [r] = await conn.execute(
      'UPDATE productos SET stock = stock - ? WHERE id = ? AND stock IS NOT NULL AND stock >= ?',
      [p.cantidad, p.producto_id, p.cantidad],
    );
    if (r.affectedRows !== 1) throw conflicto(`Stock insuficiente para: ${p.nombre}`);
  }
}

/**
 * Aplica una transición ya validada: actualiza la oportunidad y registra el historial.
 * El UPDATE incluye la etapa leída bajo bloqueo (WHERE etapa = ?) como defensa adicional.
 */
export async function aplicarEtapa(conn, { id, anterior, nueva, motivo, usuarioId }) {
  let resultado;
  if (nueva === 'ganada') {
    [resultado] = await conn.execute(
      "UPDATE oportunidades SET etapa = 'ganada', fecha_cierre = UTC_TIMESTAMP(), motivo_perdida = NULL, updated_at = UTC_TIMESTAMP() WHERE id = ? AND etapa = ?",
      [id, anterior],
    );
  } else if (nueva === 'perdida') {
    [resultado] = await conn.execute(
      "UPDATE oportunidades SET etapa = 'perdida', motivo_perdida = ?, fecha_cierre = UTC_TIMESTAMP(), updated_at = UTC_TIMESTAMP() WHERE id = ? AND etapa = ?",
      [motivo, id, anterior],
    );
  } else {
    [resultado] = await conn.execute(
      'UPDATE oportunidades SET etapa = ?, updated_at = UTC_TIMESTAMP() WHERE id = ? AND etapa = ?',
      [nueva, id, anterior],
    );
  }
  if (resultado.affectedRows !== 1) throw conflicto('La oportunidad cambió mientras se procesaba la petición');
  await registrarHistorial(conn, { oportunidadId: id, usuarioId, anterior, nueva });
}
