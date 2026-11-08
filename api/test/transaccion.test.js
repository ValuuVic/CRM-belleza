// B1-09 y B1-10: confirmación y reversión de transacciones con un pool simulado.
// No necesita MySQL: comprueba el orden de las llamadas sobre la conexión.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { conTransaccion } from '../src/utils/transaccion.js';
import { pool } from '../src/config/db.js';

after(() => pool.end()); // el pool real se crea al importar; se cierra sin haber conectado

function poolSimulado({ fallaRollback = false } = {}) {
  const llamadas = [];
  const conn = {
    beginTransaction: async () => { llamadas.push('begin'); },
    commit: async () => { llamadas.push('commit'); },
    rollback: async () => {
      llamadas.push('rollback');
      if (fallaRollback) throw new Error('fallo en rollback');
    },
    release: () => { llamadas.push('release'); },
    destroy: () => { llamadas.push('destroy'); },
  };
  return { llamadas, conn, pool: { getConnection: async () => { llamadas.push('getConnection'); return conn; } } };
}

describe('B1-09 conTransaccion', () => {
  test('confirma la transacción y libera la conexión cuando todo termina bien', async () => {
    const s = poolSimulado();
    const resultado = await conTransaccion(async (conn) => {
      assert.equal(conn, s.conn);
      s.llamadas.push('trabajo');
      return 42;
    }, s.pool);
    assert.equal(resultado, 42);
    assert.deepEqual(s.llamadas, ['getConnection', 'begin', 'trabajo', 'commit', 'release']);
  });

  test('revierte, libera la conexión y relanza el error si el trabajo falla', async () => {
    const s = poolSimulado();
    const error = new Error('fallo de negocio');
    await assert.rejects(
      conTransaccion(async () => { s.llamadas.push('trabajo'); throw error; }, s.pool),
      (e) => e === error,
    );
    assert.deepEqual(s.llamadas, ['getConnection', 'begin', 'trabajo', 'rollback', 'release']);
  });

  test('si falla el rollback conserva el error original y destruye la conexión en lugar de devolverla al pool', async () => {
    const s = poolSimulado({ fallaRollback: true });
    const error = new Error('fallo de negocio');
    await assert.rejects(conTransaccion(async () => { throw error; }, s.pool), (e) => e === error);
    assert.deepEqual(s.llamadas, ['getConnection', 'begin', 'rollback', 'destroy']);
  });

  test('si fallan el commit y el rollback, la conexión también se destruye', async () => {
    const s = poolSimulado({ fallaRollback: true });
    s.conn.commit = async () => { s.llamadas.push('commit'); throw new Error('conexión perdida'); };
    await assert.rejects(conTransaccion(async () => 'ok', s.pool), /conexión perdida/);
    assert.deepEqual(s.llamadas, ['getConnection', 'begin', 'commit', 'rollback', 'destroy']);
  });

  test('revierte si falla el commit', async () => {
    const s = poolSimulado();
    s.conn.commit = async () => { s.llamadas.push('commit'); throw new Error('fallo en commit'); };
    await assert.rejects(conTransaccion(async () => 'ok', s.pool), /fallo en commit/);
    assert.deepEqual(s.llamadas, ['getConnection', 'begin', 'commit', 'rollback', 'release']);
  });

  test('no ejecuta el trabajo y libera la conexión si falla beginTransaction', async () => {
    const s = poolSimulado();
    s.conn.beginTransaction = async () => { s.llamadas.push('begin'); throw new Error('fallo en begin'); };
    let ejecutado = false;
    await assert.rejects(conTransaccion(async () => { ejecutado = true; }, s.pool), /fallo en begin/);
    assert.equal(ejecutado, false);
    assert.deepEqual(s.llamadas, ['getConnection', 'begin', 'rollback', 'release']);
  });
});
