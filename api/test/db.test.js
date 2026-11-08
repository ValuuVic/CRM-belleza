// B1-02 y B1-10: conexión con MySQL desde el pool.
// - La prueba de conexión real se omite si no hay configuración DB_* o MySQL no responde
//   (spec B1 §6). Para ejecutarla: `node --env-file=.env --test` desde api/ con Docker arrancado.
// - La prueba con un servidor inalcanzable siempre se ejecuta y comprueba que no se filtran credenciales.
// Ninguna prueba escribe datos: solo SELECT 1.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import { pool, verificarConexion } from '../src/config/db.js';

after(() => pool.end());

const hayConfiguracion = Boolean(process.env.DB_HOST && process.env.DB_NAME && process.env.DB_USER);
const estado = hayConfiguracion ? await verificarConexion() : { conectado: false, codigo: 'SIN_CONFIGURACION' };
const motivoOmision = !hayConfiguracion
  ? 'sin variables DB_* (ejecute con --env-file=.env)'
  : !estado.conectado ? `MySQL no disponible (código ${estado.codigo})` : false;

describe('B1-02 conexión MySQL', () => {
  test('con credenciales válidas se obtiene una conexión y responde SELECT 1', { skip: motivoOmision }, async () => {
    assert.deepEqual(estado, { conectado: true });
    const [filas] = await pool.query('SELECT 1 AS uno');
    assert.equal(filas[0].uno, 1);
  });

  test('la conexión usa UTC y devuelve DECIMAL como número', { skip: motivoOmision }, async () => {
    // Con timezone 'Z', mysql2 interpreta los DATETIME como UTC.
    const [filas] = await pool.query("SELECT CAST(? AS DECIMAL(10,2)) AS monto, CAST('2026-10-15 10:00:00' AS DATETIME) AS hora", ['9250.00']);
    assert.equal(typeof filas[0].monto, 'number');
    assert.equal(filas[0].monto, 9250);
    assert.equal(filas[0].hora.toISOString(), '2026-10-15T10:00:00.000Z');
  });

  test('con MySQL inalcanzable informa solo un código de error, sin credenciales', async () => {
    const poolFalso = mysql.createPool({
      host: '127.0.0.1', port: 1, user: 'usuario_secreto_b1', password: 'clave_secreta_b1', database: 'bd_secreta_b1',
      timezone: 'Z', decimalNumbers: true, connectTimeout: 2000,
    });
    try {
      const r = await verificarConexion(poolFalso);
      assert.equal(r.conectado, false);
      assert.match(r.codigo, /^[A-Z_]+$/);
      const texto = JSON.stringify(r);
      for (const s of ['usuario_secreto_b1', 'clave_secreta_b1', 'bd_secreta_b1', '127.0.0.1']) assert.ok(!texto.includes(s), s);
    } finally {
      await poolFalso.end();
    }
  });

  test('libera la conexión aunque falle el ping', async () => {
    let liberada = false;
    const r = await verificarConexion({
      getConnection: async () => ({ ping: async () => { throw Object.assign(new Error('x'), { code: 'PROTOCOL_CONNECTION_LOST' }); }, release: () => { liberada = true; } }),
    });
    assert.deepEqual(r, { conectado: false, codigo: 'PROTOCOL_CONNECTION_LOST' });
    assert.equal(liberada, true);
  });
});
