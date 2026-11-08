// Integración real de B2 con MySQL y VerificacionSeeder (dependencia I1 de la Parte A).
// Solo lectura. Se ejecuta con `npm run test:bd`.
// - Se omite si no hay configuración DB_*, si MySQL no responde o si faltan las tablas y
//   columnas que crean las migraciones de la Parte A (users.rol, users.activo, clientes).
// - Los casos que necesitan las contraseñas de VerificacionSeeder quedan como `todo` hasta que
//   la Parte A publique la semilla: no se inventan credenciales.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { pool, verificarConexion } from '../src/config/db.js';

after(() => pool.end());

async function motivoOmision() {
  if (!process.env.DB_HOST || !process.env.DB_NAME || !process.env.DB_USER) return 'sin variables DB_* (ejecute npm run test:bd)';
  const estado = await verificarConexion();
  if (!estado.conectado) return `MySQL no disponible (código ${estado.codigo})`;
  const [columnas] = await pool.execute(
    `SELECT TABLE_NAME AS tabla, COLUMN_NAME AS columna FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND ((TABLE_NAME = 'users' AND COLUMN_NAME IN ('rol', 'activo'))
         OR (TABLE_NAME = 'clientes' AND COLUMN_NAME = 'vendedor_id'))`,
  );
  if (columnas.length < 3) return 'I1 pendiente: faltan users.rol, users.activo o clientes.vendedor_id (migraciones de la Parte A)';
  const [[{ n }]] = await pool.execute("SELECT COUNT(*) AS n FROM users WHERE email = 'valeria@crm.test'");
  if (n === 0) return 'I1 pendiente: VerificacionSeeder no está cargado (no existe valeria@crm.test)';
  return false;
}

const omitir = await motivoOmision();

describe('B2 integración con la semilla oficial (I1)', () => {
  test('el esquema de la Parte A tiene las columnas que usa B2', { skip: omitir }, async () => {
    const [filas] = await pool.execute('SELECT id, name AS nombre, email AS correo, rol, activo FROM users LIMIT 1');
    assert.ok(Array.isArray(filas));
  });

  test.todo('B2-01: login de Valeria (valeria@crm.test) con la contraseña de VerificacionSeeder → 200 con id 4');
  test.todo('B2-04: login de administrador y supervisor de la semilla con la contraseña correcta → 403');
  test.todo('B2-10: GET /api/clientes con el token de Valeria → sus 3 clientes (cartera 3 de 10, CLAUDE.md §14)');
});
