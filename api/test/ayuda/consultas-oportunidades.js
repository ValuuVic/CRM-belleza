// Tablas y consultas de B4 para la base simulada (bd-simulada.js). No necesita MySQL.
// - Cada consulta se reconoce por su texto EXACTO: si la API cambia una consulta sin actualizar
//   esta simulación, la prueba falla con «Consulta no prevista» en lugar de pasar por accidente.
// - Imita lo necesario de InnoDB y del esquema de docs/especificacion.md §4:
//   bloqueos FOR UPDATE por fila (hasta commit/rollback), índice único (oportunidad_id, producto_id)
//   → errno 1062, CHECK stock >= 0 → errno 3819, y DECIMAL redondeado a 2 decimales.
// - Los datos son FICTICIOS (no son VerificacionSeeder, que es de la Parte A).

const redondear = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const ahora = () => new Date(Math.floor(Date.now() / 1000) * 1000); // DATETIME sin milisegundos

function errorMysql(errno, code, mensaje) {
  return Object.assign(new Error(mensaje), { errno, code, sqlMessage: mensaje, sqlState: errno === 1062 ? '23000' : 'HY000' });
}

const RESUMEN_BASE = 'SELECT o.id, o.titulo, o.etapa, o.fecha_cierre, c.id AS cliente_id, c.nombre AS cliente_nombre, COALESCE(ROUND(SUM(op.cantidad * op.precio_unitario), 2), 0) AS total FROM oportunidades o JOIN clientes c ON c.id = o.cliente_id LEFT JOIN oportunidad_productos op ON op.oportunidad_id = o.id WHERE o.vendedor_id = ?';
const AGRUPAR = ' GROUP BY o.id, o.titulo, o.etapa, o.fecha_cierre, c.id, c.nombre ORDER BY o.id';

export const SQL = Object.freeze({
  productosActivos: 'SELECT id, nombre, precio, stock FROM productos WHERE activo = 1 ORDER BY nombre, id',
  resumenes: RESUMEN_BASE + AGRUPAR,
  resumenesPorEtapa: `${RESUMEN_BASE} AND o.etapa = ?${AGRUPAR}`,
  detalleCabecera: 'SELECT o.id, o.titulo, o.etapa, o.fecha_cierre, o.motivo_perdida, c.id AS cliente_id, c.nombre AS cliente_nombre FROM oportunidades o JOIN clientes c ON c.id = o.cliente_id WHERE o.id = ? AND o.vendedor_id = ?',
  detalleLineas: 'SELECT op.id, op.producto_id, p.nombre, op.cantidad, op.precio_unitario, ROUND(op.cantidad * op.precio_unitario, 2) AS subtotal FROM oportunidad_productos op JOIN productos p ON p.id = op.producto_id WHERE op.oportunidad_id = ? ORDER BY op.id',
  detalleTotal: 'SELECT COALESCE(ROUND(SUM(cantidad * precio_unitario), 2), 0) AS total FROM oportunidad_productos WHERE oportunidad_id = ?',
  detalleHistorial: 'SELECT h.etapa_anterior, h.etapa_nueva, h.created_at AS fecha, u.name AS usuario FROM historial_etapas h JOIN users u ON u.id = h.usuario_id WHERE h.oportunidad_id = ? ORDER BY h.created_at, h.id',
  bloquearPropia: 'SELECT id, etapa FROM oportunidades WHERE id = ? AND vendedor_id = ? FOR UPDATE',
  bloquearClientePropio: 'SELECT id FROM clientes WHERE id = ? AND vendedor_id = ? FOR UPDATE',
  insertarOportunidad: 'INSERT INTO oportunidades (cliente_id, vendedor_id, titulo, etapa, created_at, updated_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())',
  insertarHistorial: 'INSERT INTO historial_etapas (oportunidad_id, usuario_id, etapa_anterior, etapa_nueva, created_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP())',
  actualizarTitulo: 'UPDATE oportunidades SET titulo = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?',
  etapaAbierta: 'UPDATE oportunidades SET etapa = ?, updated_at = UTC_TIMESTAMP() WHERE id = ? AND etapa = ?',
  etapaGanada: "UPDATE oportunidades SET etapa = 'ganada', fecha_cierre = UTC_TIMESTAMP(), motivo_perdida = NULL, updated_at = UTC_TIMESTAMP() WHERE id = ? AND etapa = ?",
  etapaPerdida: "UPDATE oportunidades SET etapa = 'perdida', motivo_perdida = ?, fecha_cierre = UTC_TIMESTAMP(), updated_at = UTC_TIMESTAMP() WHERE id = ? AND etapa = ?",
  lineasParaGanar: 'SELECT producto_id, cantidad FROM oportunidad_productos WHERE oportunidad_id = ? ORDER BY producto_id FOR UPDATE',
  bloquearProducto: 'SELECT id, nombre, stock FROM productos WHERE id = ? FOR UPDATE',
  descontarStock: 'UPDATE productos SET stock = stock - ? WHERE id = ? AND stock IS NOT NULL AND stock >= ?',
  productoParaLinea: 'SELECT id, precio, activo FROM productos WHERE id = ? FOR SHARE',
  insertarLinea: 'INSERT INTO oportunidad_productos (oportunidad_id, producto_id, cantidad, precio_unitario, created_at, updated_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())',
  bloquearLinea: 'SELECT id FROM oportunidad_productos WHERE id = ? AND oportunidad_id = ? FOR UPDATE',
  actualizarLinea: 'UPDATE oportunidad_productos SET cantidad = ?, updated_at = UTC_TIMESTAMP() WHERE id = ? AND oportunidad_id = ?',
  eliminarLinea: 'DELETE FROM oportunidad_productos WHERE id = ? AND oportunidad_id = ?',
});

/** Datos iniciales ficticios (se pueden ampliar en cada prueba). */
function datosIniciales() {
  const fecha = (iso) => new Date(iso);
  return {
    productos: [
      { id: 1, nombre: 'Base líquida HD', precio: 150, activo: 1, stock: 10 },
      { id: 2, nombre: 'Labial mate', precio: 33.33, activo: 1, stock: 2 },
      { id: 3, nombre: 'Paleta de sombras', precio: 250, activo: 1, stock: null },
      { id: 4, nombre: 'Rímel descontinuado', precio: 80, activo: 0, stock: 5 },
    ],
    oportunidades: [
      { id: 100, cliente_id: 10, vendedor_id: 4, titulo: 'Pedido de temporada Tienda Beta', etapa: 'negociacion', motivo_perdida: null, fecha_cierre: null },
      { id: 101, cliente_id: 12, vendedor_id: 5, titulo: 'Oportunidad privada de otro vendedor', etapa: 'prospecto', motivo_perdida: null, fecha_cierre: null },
      { id: 102, cliente_id: 11, vendedor_id: 4, titulo: 'Venta cerrada Almacén Alfa', etapa: 'ganada', motivo_perdida: null, fecha_cierre: fecha('2026-10-15T16:00:00Z') },
    ],
    oportunidad_productos: [
      { id: 500, oportunidad_id: 100, producto_id: 1, cantidad: 3, precio_unitario: 150 },
      { id: 501, oportunidad_id: 102, producto_id: 3, cantidad: 1, precio_unitario: 250 },
      { id: 502, oportunidad_id: 101, producto_id: 1, cantidad: 1, precio_unitario: 150 },
    ],
    historial_etapas: [
      { id: 900, oportunidad_id: 100, usuario_id: 4, etapa_anterior: null, etapa_nueva: 'prospecto', created_at: fecha('2026-10-01T15:00:00Z') },
      { id: 901, oportunidad_id: 100, usuario_id: 4, etapa_anterior: 'prospecto', etapa_nueva: 'calificado', created_at: fecha('2026-10-03T15:00:00Z') },
      { id: 902, oportunidad_id: 100, usuario_id: 4, etapa_anterior: 'calificado', etapa_nueva: 'propuesta', created_at: fecha('2026-10-05T15:00:00Z') },
      { id: 903, oportunidad_id: 100, usuario_id: 4, etapa_anterior: 'propuesta', etapa_nueva: 'negociacion', created_at: fecha('2026-10-07T15:00:00Z') },
      { id: 904, oportunidad_id: 101, usuario_id: 5, etapa_anterior: null, etapa_nueva: 'prospecto', created_at: fecha('2026-10-02T15:00:00Z') },
      { id: 905, oportunidad_id: 102, usuario_id: 4, etapa_anterior: null, etapa_nueva: 'prospecto', created_at: fecha('2026-09-20T15:00:00Z') },
      { id: 906, oportunidad_id: 102, usuario_id: 4, etapa_anterior: 'negociacion', etapa_nueva: 'ganada', created_at: fecha('2026-10-15T16:00:00Z') },
    ],
  };
}

/**
 * @param {{ users: any[], clientes: any[], bloquear: Function, insertarFila: Function,
 *   actualizarFila: Function, eliminarFila: Function }} motor utilidades de bd-simulada.js
 */
export function crearConsultasOportunidades({ users, clientes, bloquear, insertarFila, actualizarFila, eliminarFila }) {
  const tablas = datosIniciales();
  const { productos, oportunidades, oportunidad_productos: lineas, historial_etapas: historial } = tablas;

  const opp = (id) => oportunidades.find((o) => o.id === id);
  const producto = (id) => productos.find((p) => p.id === id);
  const lineasDe = (id) => lineas.filter((l) => l.oportunidad_id === id);
  const totalDe = (id) => redondear(lineasDe(id).reduce((s, l) => s + l.cantidad * l.precio_unitario, 0));

  function resumen(o) {
    const c = clientes.find((x) => x.id === o.cliente_id);
    return { id: o.id, titulo: o.titulo, etapa: o.etapa, fecha_cierre: o.fecha_cierre, cliente_id: c.id, cliente_nombre: c.nombre, total: totalDe(o.id) };
  }

  const manejadores = {
    [SQL.productosActivos]: () => [productos.filter((p) => p.activo === 1)
      .sort((a, b) => a.nombre.localeCompare(b.nombre) || a.id - b.id)
      .map(({ id, nombre, precio, stock }) => ({ id, nombre, precio, stock }))],

    [SQL.resumenes]: ([vendedor]) => [oportunidades.filter((o) => o.vendedor_id === vendedor).sort((a, b) => a.id - b.id).map(resumen)],
    [SQL.resumenesPorEtapa]: ([vendedor, etapa]) => [oportunidades.filter((o) => o.vendedor_id === vendedor && o.etapa === etapa).sort((a, b) => a.id - b.id).map(resumen)],

    [SQL.detalleCabecera]: ([id, vendedor]) => {
      const o = opp(id);
      if (!o || o.vendedor_id !== vendedor) return [[]];
      const c = clientes.find((x) => x.id === o.cliente_id);
      return [[{ id: o.id, titulo: o.titulo, etapa: o.etapa, fecha_cierre: o.fecha_cierre, motivo_perdida: o.motivo_perdida, cliente_id: c.id, cliente_nombre: c.nombre }]];
    },
    [SQL.detalleLineas]: ([id]) => [lineasDe(id).sort((a, b) => a.id - b.id).map((l) => ({
      id: l.id, producto_id: l.producto_id, nombre: producto(l.producto_id).nombre, cantidad: l.cantidad,
      precio_unitario: l.precio_unitario, subtotal: redondear(l.cantidad * l.precio_unitario),
    }))],
    [SQL.detalleTotal]: ([id]) => [[{ total: totalDe(id) }]],
    [SQL.detalleHistorial]: ([id]) => [historial.filter((h) => h.oportunidad_id === id)
      .sort((a, b) => a.created_at - b.created_at || a.id - b.id)
      .map((h) => {
        const u = users.find((x) => x.id === h.usuario_id);
        return { etapa_anterior: h.etapa_anterior, etapa_nueva: h.etapa_nueva, fecha: h.created_at, usuario: u.name };
      })],

    [SQL.bloquearPropia]: async ([id, vendedor], tx) => {
      const o = opp(id);
      if (!o) return [[]];
      await bloquear(tx, `oportunidades:${o.id}`);
      // Lectura con bloqueo: valores actuales tras obtener el bloqueo.
      return [o.vendedor_id === vendedor ? [{ id: o.id, etapa: o.etapa }] : []];
    },
    [SQL.bloquearClientePropio]: async ([id, vendedor], tx) => {
      const c = clientes.find((x) => x.id === id);
      if (!c) return [[]];
      await bloquear(tx, `clientes:${c.id}`);
      return [c.vendedor_id === vendedor ? [{ id: c.id }] : []];
    },

    [SQL.insertarOportunidad]: ([cliente_id, vendedor_id, titulo, etapa], tx) => {
      const nueva = insertarFila(tx, oportunidades, { cliente_id, vendedor_id, titulo, etapa, motivo_perdida: null, fecha_cierre: null });
      return [{ insertId: nueva.id, affectedRows: 1 }];
    },
    [SQL.insertarHistorial]: ([oportunidad_id, usuario_id, etapa_anterior, etapa_nueva], tx) => {
      const nueva = insertarFila(tx, historial, { oportunidad_id, usuario_id, etapa_anterior, etapa_nueva, created_at: ahora() });
      return [{ insertId: nueva.id, affectedRows: 1 }];
    },
    [SQL.actualizarTitulo]: async ([titulo, id], tx) => {
      const o = opp(id);
      if (!o) return [{ affectedRows: 0 }];
      await bloquear(tx, `oportunidades:${o.id}`);
      actualizarFila(tx, o, { titulo });
      return [{ affectedRows: 1 }];
    },
    [SQL.etapaAbierta]: (p, tx) => cambiarEtapa(p[1], p[2], { etapa: p[0] }, tx),
    [SQL.etapaGanada]: ([id, anterior], tx) => cambiarEtapa(id, anterior, { etapa: 'ganada', fecha_cierre: ahora(), motivo_perdida: null }, tx),
    [SQL.etapaPerdida]: ([motivo, id, anterior], tx) => cambiarEtapa(id, anterior, { etapa: 'perdida', motivo_perdida: motivo, fecha_cierre: ahora() }, tx),

    [SQL.lineasParaGanar]: async ([id], tx) => {
      const propias = lineasDe(id).sort((a, b) => a.producto_id - b.producto_id);
      for (const l of propias) await bloquear(tx, `oportunidad_productos:${l.id}`);
      return [propias.map(({ producto_id, cantidad }) => ({ producto_id, cantidad }))];
    },
    [SQL.bloquearProducto]: async ([id], tx) => {
      const p = producto(id);
      if (!p) return [[]];
      await bloquear(tx, `productos:${p.id}`);
      return [[{ id: p.id, nombre: p.nombre, stock: p.stock }]];
    },
    [SQL.descontarStock]: async ([cantidad, id, minimo], tx) => {
      const p = producto(id);
      if (!p) return [{ affectedRows: 0 }];
      await bloquear(tx, `productos:${p.id}`);
      if (p.stock === null || p.stock < minimo) return [{ affectedRows: 0 }];
      const nuevo = p.stock - cantidad;
      if (nuevo < 0) throw errorMysql(3819, 'ER_CHECK_CONSTRAINT_VIOLATED', "Check constraint 'productos_stock_check' is violated.");
      actualizarFila(tx, p, { stock: nuevo });
      return [{ affectedRows: 1 }];
    },

    [SQL.productoParaLinea]: async ([id], tx) => {
      const p = producto(id);
      if (!p) return [[]];
      await bloquear(tx, `productos:${p.id}`); // FOR SHARE se simula como bloqueo exclusivo (más estricto)
      return [[{ id: p.id, precio: p.precio, activo: p.activo }]];
    },
    [SQL.insertarLinea]: ([oportunidad_id, producto_id, cantidad, precio_unitario], tx) => {
      if (lineas.some((l) => l.oportunidad_id === oportunidad_id && l.producto_id === producto_id)) {
        throw errorMysql(1062, 'ER_DUP_ENTRY', "Duplicate entry for key 'oportunidad_productos_oportunidad_id_producto_id_unique'");
      }
      if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 999) {
        throw errorMysql(3819, 'ER_CHECK_CONSTRAINT_VIOLATED', "Check constraint 'oportunidad_productos_cantidad_check' is violated.");
      }
      const nueva = insertarFila(tx, lineas, { oportunidad_id, producto_id, cantidad, precio_unitario });
      return [{ insertId: nueva.id, affectedRows: 1 }];
    },
    [SQL.bloquearLinea]: async ([id, oportunidadId], tx) => {
      const l = lineas.find((x) => x.id === id);
      if (!l) return [[]];
      await bloquear(tx, `oportunidad_productos:${l.id}`);
      return [l.oportunidad_id === oportunidadId ? [{ id: l.id }] : []];
    },
    [SQL.actualizarLinea]: ([cantidad, id, oportunidadId], tx) => {
      const l = lineas.find((x) => x.id === id && x.oportunidad_id === oportunidadId);
      if (!l) return [{ affectedRows: 0 }];
      actualizarFila(tx, l, { cantidad });
      return [{ affectedRows: 1 }];
    },
    [SQL.eliminarLinea]: ([id, oportunidadId], tx) => {
      const l = lineas.find((x) => x.id === id && x.oportunidad_id === oportunidadId);
      if (!l) return [{ affectedRows: 0 }];
      eliminarFila(tx, lineas, l);
      return [{ affectedRows: 1 }];
    },
  };

  async function cambiarEtapa(id, anterior, cambios, tx) {
    const o = opp(id);
    if (!o) return [{ affectedRows: 0 }];
    await bloquear(tx, `oportunidades:${o.id}`);
    if (o.etapa !== anterior) return [{ affectedRows: 0 }];
    actualizarFila(tx, o, cambios);
    return [{ affectedRows: 1 }];
  }

  return {
    tablas,
    /** Devuelve el resultado, o undefined si la consulta no es de B4. */
    async ejecutar(sql, params, tx) {
      const m = Object.hasOwn(manejadores, sql) ? manejadores[sql] : null;
      return m ? m(params ?? [], tx) : undefined;
    },
  };
}
