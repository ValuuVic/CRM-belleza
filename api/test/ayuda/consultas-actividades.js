// Tabla y consultas de B5 (actividades) para la base simulada (bd-simulada.js). No necesita MySQL.
// - Cada consulta se reconoce por su texto EXACTO, copiado aquí a propósito (no se importa de src/):
//   si la API cambia una consulta sin actualizar esta simulación, la prueba falla con
//   «Consulta no prevista» en lugar de pasar por accidente.
// - Imita lo necesario del esquema de docs/especificacion.md §4.7 y de MySQL:
//   tipo ENUM (otro valor → errno 1265), descripcion VARCHAR(500) contada en caracteres (más larga →
//   errno 1406, modo estricto), FK cliente_id (errno 1452), completada TINYINT(1) 0/1, vence_en
//   DATETIME sin fracciones (MySQL redondea los milisegundos al segundo) y bloqueos FOR UPDATE por fila.
// - Los datos son FICTICIOS: no son VerificacionSeeder (Parte A, I1).

export const SQL_B5 = Object.freeze({
  listar: 'SELECT a.id, a.tipo, a.descripcion, a.vence_en, a.completada, c.id AS cliente_id, c.nombre AS cliente_nombre FROM actividades a JOIN clientes c ON c.id = a.cliente_id WHERE c.vendedor_id = ? ORDER BY a.completada, a.vence_en IS NULL, a.vence_en, a.id',
  listarPorEstado: 'SELECT a.id, a.tipo, a.descripcion, a.vence_en, a.completada, c.id AS cliente_id, c.nombre AS cliente_nombre FROM actividades a JOIN clientes c ON c.id = a.cliente_id WHERE c.vendedor_id = ? AND a.completada = ? ORDER BY a.completada, a.vence_en IS NULL, a.vence_en, a.id',
  leer: 'SELECT a.id, a.tipo, a.descripcion, a.vence_en, a.completada, c.id AS cliente_id, c.nombre AS cliente_nombre FROM actividades a JOIN clientes c ON c.id = a.cliente_id WHERE a.id = ? AND c.vendedor_id = ?',
  clienteDeActividad: 'SELECT cliente_id FROM actividades WHERE id = ?',
  bloquearClientePropio: 'SELECT id, nombre FROM clientes WHERE id = ? AND vendedor_id = ? FOR UPDATE',
  bloquearActividad: 'SELECT id, tipo, descripcion, vence_en, completada FROM actividades WHERE id = ? AND cliente_id = ? FOR UPDATE',
  insertar: 'INSERT INTO actividades (cliente_id, vendedor_id, tipo, descripcion, vence_en, completada, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, UTC_TIMESTAMP(), UTC_TIMESTAMP())',
  actualizarCompletada: 'UPDATE actividades SET completada = ?, updated_at = UTC_TIMESTAMP() WHERE id = ? AND cliente_id = ?',
});

const TIPOS = ['llamada', 'reunion', 'tarea'];

function errorMysql(errno, code, mensaje) {
  return Object.assign(new Error(mensaje), { errno, code, sqlMessage: mensaje, sqlState: errno === 1452 ? '23000' : '22001' });
}

/** DATETIME(0): MySQL redondea los milisegundos al segundo más cercano. */
const aDatetime = (fecha) => (fecha === null ? null : new Date(Math.round(fecha.getTime() / 1000) * 1000));
const fecha = (iso) => new Date(iso);

/**
 * Datos ficticios:
 *   vendedora 4 (clientes 10 y 11): 700 pendiente vencida · 701 pendiente futura · 702 pendiente sin
 *     fecha · 703 completada con fecha pasada (no vencida).
 *   vendedor 5 (cliente 12): 704 pendiente vencida, privada.
 *   cliente 13 (disponible): 705, registrada por la vendedora 4 antes de liberarlo → no la ve nadie.
 */
function datosIniciales() {
  return [
    { id: 700, cliente_id: 10, vendedor_id: 4, tipo: 'llamada', descripcion: 'Llamar para confirmar el pedido de bases', vence_en: fecha('2020-01-15T15:00:00Z'), completada: 0 },
    { id: 701, cliente_id: 11, vendedor_id: 4, tipo: 'reunion', descripcion: 'Presentar la nueva línea de labiales', vence_en: fecha('2099-03-01T16:00:00Z'), completada: 0 },
    { id: 702, cliente_id: 10, vendedor_id: 4, tipo: 'tarea', descripcion: 'Enviar el catálogo de temporada', vence_en: null, completada: 0 },
    { id: 703, cliente_id: 11, vendedor_id: 4, tipo: 'llamada', descripcion: 'Seguimiento de la entrega', vence_en: fecha('2020-02-01T16:00:00Z'), completada: 1 },
    { id: 704, cliente_id: 12, vendedor_id: 5, tipo: 'tarea', descripcion: 'Actividad privada de otro vendedor', vence_en: fecha('2020-01-01T16:00:00Z'), completada: 0 },
    { id: 705, cliente_id: 13, vendedor_id: 4, tipo: 'tarea', descripcion: 'Actividad de un cliente liberado', vence_en: null, completada: 0 },
  ];
}

/** ORDER BY a.completada, a.vence_en IS NULL, a.vence_en, a.id */
function ordenar(a, b) {
  return (a.completada - b.completada)
    || ((a.vence_en === null) - (b.vence_en === null))
    || ((a.vence_en?.getTime() ?? 0) - (b.vence_en?.getTime() ?? 0))
    || (a.id - b.id);
}

/**
 * @param {{ clientes: any[], bloquear: Function, insertarFila: Function, actualizarFila: Function }} motor
 *   utilidades de bd-simulada.js
 */
export function crearConsultasActividades({ clientes, bloquear, insertarFila, actualizarFila }) {
  const actividades = datosIniciales();
  const cliente = (id) => clientes.find((c) => c.id === id);

  const fila = (a) => {
    const c = cliente(a.cliente_id);
    return { id: a.id, tipo: a.tipo, descripcion: a.descripcion, vence_en: a.vence_en, completada: a.completada, cliente_id: c.id, cliente_nombre: c.nombre };
  };
  const propias = (vendedor) => actividades.filter((a) => cliente(a.cliente_id)?.vendedor_id === vendedor);

  const manejadores = {
    [SQL_B5.listar]: ([vendedor]) => [propias(vendedor).sort(ordenar).map(fila)],
    [SQL_B5.listarPorEstado]: ([vendedor, completada]) => [propias(vendedor).filter((a) => a.completada === completada).sort(ordenar).map(fila)],
    [SQL_B5.leer]: ([id, vendedor]) => [propias(vendedor).filter((a) => a.id === id).map(fila)],
    [SQL_B5.clienteDeActividad]: ([id]) => [actividades.filter((a) => a.id === id).map((a) => ({ cliente_id: a.cliente_id }))],
    [SQL_B5.bloquearClientePropio]: async ([id, vendedor], tx) => {
      const c = cliente(id);
      if (!c) return [[]];
      await bloquear(tx, `clientes:${c.id}`);
      return [c.vendedor_id === vendedor ? [{ id: c.id, nombre: c.nombre }] : []]; // valor actual tras el bloqueo
    },
    [SQL_B5.bloquearActividad]: async ([id, clienteId], tx) => {
      const a = actividades.find((x) => x.id === id);
      if (!a) return [[]];
      await bloquear(tx, `actividades:${a.id}`);
      if (a.cliente_id !== clienteId) return [[]]; // valor actual tras obtener el bloqueo
      return [[{ id: a.id, tipo: a.tipo, descripcion: a.descripcion, vence_en: a.vence_en, completada: a.completada }]];
    },
    [SQL_B5.insertar]: ([clienteId, vendedorId, tipo, descripcion, venceEn], tx) => {
      if (!cliente(clienteId)) throw errorMysql(1452, 'ER_NO_REFERENCED_ROW_2', 'Cannot add or update a child row: a foreign key constraint fails');
      if (!TIPOS.includes(tipo)) throw errorMysql(1265, 'WARN_DATA_TRUNCATED', "Data truncated for column 'tipo'");
      if (typeof descripcion !== 'string' || [...descripcion].length > 500) throw errorMysql(1406, 'ER_DATA_TOO_LONG', "Data too long for column 'descripcion'");
      if (venceEn !== null && !(venceEn instanceof Date)) throw new Error('vence_en debe llegar como Date o null');
      const nueva = insertarFila(tx, actividades, {
        cliente_id: clienteId, vendedor_id: vendedorId, tipo, descripcion, vence_en: aDatetime(venceEn), completada: 0,
      });
      return [{ insertId: nueva.id, affectedRows: 1 }];
    },
    [SQL_B5.actualizarCompletada]: async ([completada, id, clienteId], tx) => {
      const a = actividades.find((x) => x.id === id && x.cliente_id === clienteId);
      if (!a) return [{ affectedRows: 0 }];
      await bloquear(tx, `actividades:${a.id}`);
      actualizarFila(tx, a, { completada });
      return [{ affectedRows: 1 }]; // mysql2 usa FOUND_ROWS: cuenta la fila aunque no cambie
    },
  };

  return {
    actividades,
    /** Devuelve el resultado, o undefined si la consulta no es de B5. */
    async ejecutar(sql, params, tx) {
      const m = Object.hasOwn(manejadores, sql) ? manejadores[sql] : null;
      return m ? m(params ?? [], tx) : undefined;
    },
  };
}
