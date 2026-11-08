// B1-03 y B1-10: CORS restringido al origen configurado en CORS_ORIGIN, nunca '*'.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { crearApp } from '../src/app.js';
import { pool } from '../src/config/db.js';

const PERMITIDO = 'http://127.0.0.1:5500';
let servidor;
let base;

before(async () => {
  servidor = await new Promise((resolve) => {
    const s = crearApp({ origenPermitido: PERMITIDO }).listen(0, '127.0.0.1', () => resolve(s));
  });
  base = `http://127.0.0.1:${servidor.address().port}`;
});
after(async () => {
  servidor.close();
  await pool.end();
});

describe('B1-03 CORS', () => {
  test('una petición desde el origen configurado recibe Access-Control-Allow-Origin con ese origen', async () => {
    const r = await fetch(`${base}/api/no-existe`, { headers: { Origin: PERMITIDO } });
    assert.equal(r.headers.get('access-control-allow-origin'), PERMITIDO);
  });

  test('una petición desde otro origen no recibe la cabecera', async () => {
    for (const origen of ['http://evil.test', 'http://127.0.0.1:5501', 'http://localhost:5500', `${PERMITIDO}.evil.test`]) {
      const r = await fetch(`${base}/api/no-existe`, { headers: { Origin: origen } });
      assert.equal(r.headers.get('access-control-allow-origin'), null, origen);
    }
  });

  test('la respuesta nunca usa el origen abierto *', async () => {
    for (const origen of [PERMITIDO, 'http://evil.test', undefined]) {
      const r = await fetch(`${base}/api/no-existe`, origen ? { headers: { Origin: origen } } : {});
      assert.notEqual(r.headers.get('access-control-allow-origin'), '*');
    }
  });

  test('la petición previa OPTIONS del origen permitido se acepta con los métodos y cabeceras previstos', async () => {
    const r = await fetch(`${base}/api/clientes`, {
      method: 'OPTIONS',
      headers: { Origin: PERMITIDO, 'Access-Control-Request-Method': 'PATCH', 'Access-Control-Request-Headers': 'authorization,content-type' },
    });
    assert.equal(r.status, 204);
    assert.equal(r.headers.get('access-control-allow-origin'), PERMITIDO);
    assert.match(r.headers.get('access-control-allow-methods'), /PATCH/);
    assert.match(r.headers.get('access-control-allow-headers').toLowerCase(), /authorization/);
  });

  test('la petición previa OPTIONS de otro origen no recibe permiso', async () => {
    const r = await fetch(`${base}/api/clientes`, {
      method: 'OPTIONS', headers: { Origin: 'http://evil.test', 'Access-Control-Request-Method': 'PATCH' },
    });
    assert.equal(r.headers.get('access-control-allow-origin'), null);
  });

  test('sin origen configurado no se concede permiso a ningún origen', async () => {
    const s = await new Promise((resolve) => {
      const x = crearApp({ origenPermitido: '' }).listen(0, '127.0.0.1', () => resolve(x));
    });
    try {
      const r = await fetch(`http://127.0.0.1:${s.address().port}/api/no-existe`, { headers: { Origin: PERMITIDO } });
      assert.equal(r.headers.get('access-control-allow-origin'), null);
    } finally {
      s.close();
    }
  });
});
