// Transacciones reutilizables (B1-09; CLAUDE.md §7 y §9; S8).
// Uso:
//   const resultado = await conTransaccion(async (conn) => {
//     const [filas] = await conn.execute('SELECT … FOR UPDATE', [id]);
//     …
//     return valor;
//   });
// Si `trabajo` termina bien se hace COMMIT; si lanza un error se hace ROLLBACK
// y el error se relanza. La conexión se libera siempre.

import { pool as poolPorDefecto } from '../config/db.js';

/**
 * @template T
 * @param {(conn: import('mysql2/promise').PoolConnection) => Promise<T>} trabajo
 * @param {{ getConnection: () => Promise<any> }} [pool] Se puede inyectar en las pruebas.
 * @returns {Promise<T>}
 */
export async function conTransaccion(trabajo, pool = poolPorDefecto) {
  const conn = await pool.getConnection();
  let conexionSana = true;
  try {
    await conn.beginTransaction();
    const resultado = await trabajo(conn);
    await conn.commit();
    return resultado;
  } catch (error) {
    try {
      await conn.rollback();
    } catch {
      // Si el rollback falla, la conexión puede seguir con una transacción abierta y
      // bloqueos FOR UPDATE: no se devuelve al pool, porque el siguiente START TRANSACTION
      // confirmaría implícitamente ese trabajo parcial. Se conserva el error original.
      conexionSana = false;
    }
    throw error;
  } finally {
    if (conexionSana) conn.release();
    else conn.destroy();
  }
}
