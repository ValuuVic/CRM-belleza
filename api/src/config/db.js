// Pool de conexiones MySQL (B1-02).
// - Credenciales solo desde variables de entorno (S2); nunca en el código.
// - timezone 'Z' y decimalNumbers true (CLAUDE.md §4).
// - La API no crea ni modifica tablas (CLAUDE.md §3).

import mysql from 'mysql2/promise';

export const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  timezone: 'Z',
  decimalNumbers: true,
  dateStrings: false,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 5000,
});

/**
 * Comprueba que se pueda obtener una conexión del pool.
 * Nunca devuelve el mensaje original de mysql2, porque puede incluir el usuario
 * o el host ("Access denied for user '…'@'…'"). Solo devuelve el código del error.
 *
 * @param {{ getConnection: () => Promise<any> }} [p]
 * @returns {Promise<{ conectado: true } | { conectado: false, codigo: string }>}
 */
export async function verificarConexion(p = pool) {
  let conn;
  try {
    conn = await p.getConnection();
    await conn.ping();
    return { conectado: true };
  } catch (error) {
    return { conectado: false, codigo: typeof error?.code === 'string' ? error.code : 'ERROR_DESCONOCIDO' };
  } finally {
    conn?.release();
  }
}
