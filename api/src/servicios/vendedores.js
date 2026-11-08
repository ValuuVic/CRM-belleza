// Bloqueo de la fila del vendedor al inicio de cada escritura (A2, CA-03, S8; B3 y B4).
//
// Orden global de bloqueos de la API (para que ninguna pareja de transacciones forme un ciclo):
//   users (vendedor) → clientes → oportunidades → oportunidad_productos → productos (id ascendente)
// Toda escritura empieza aquí. Además de ordenar los bloqueos, vuelve a exigir que el usuario sea un
// vendedor activo: una cuenta desactivada o borrada entre el middleware y la transacción no puede
// crear, tomar ni modificar nada (401).
//
// IMPORTANTE: debe ser la PRIMERA lectura de la transacción. En REPEATABLE READ la instantánea se fija
// en la primera lectura sin bloqueo; si hubiera una antes, los conteos o las lecturas posteriores sin
// bloqueo podrían ver datos anteriores a la espera del bloqueo.

import { ErrorHttp } from '../utils/errores.js';

const SQL_BLOQUEAR_VENDEDOR = "SELECT id FROM users WHERE id = ? AND rol = 'vendedor' AND activo = 1 FOR UPDATE";
const MENSAJE_NO_AUTENTICADO = 'Autenticación requerida o sesión no válida';

export async function bloquearVendedor(conn, vendedorId) {
  const [filas] = await conn.execute(SQL_BLOQUEAR_VENDEDOR, [vendedorId]);
  if (!filas[0]) throw new ErrorHttp(401, MENSAJE_NO_AUTENTICADO);
}
