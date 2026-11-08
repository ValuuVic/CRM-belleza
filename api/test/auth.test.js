// B2-01 a B2-05: POST /api/auth/login con base de datos simulada.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET = 'secreto_de_prueba_b2_no_usar_en_prod_40c';
process.env.JWT_EXPIRES_IN = '8h';

const { crearApp } = await import('../src/app.js');
const { crearRutasAuth, _HASH_FALSO_PARA_PRUEBAS } = await import('../src/rutas/auth.js');
const { manejadorErrores, rutaNoEncontrada } = await import('../src/middleware/errores.js');
const { pool: poolReal } = await import('../src/config/db.js');
const { crearBdSimulada, levantar, pedir, CLAVE_PRUEBA } = await import('./ayuda/bd-simulada.js');

const bd = crearBdSimulada();
let api;
before(async () => { api = await levantar(crearApp({ origenPermitido: 'http://127.0.0.1:5500', pool: bd.pool })); });
after(async () => { api.servidor.close(); await poolReal.end(); });

const login = (cuerpo, { tipo = 'application/json', crudo } = {}) =>
  pedir(`${api.url}/api/auth/login`, {
    method: 'POST',
    headers: tipo ? { 'Content-Type': tipo } : {},
    body: crudo !== undefined ? crudo : JSON.stringify(cuerpo),
  });

describe('B2-01 inicio de sesión correcto', () => {
  test('un vendedor activo recibe 200 con token HS256 y usuario { id, nombre, correo }', async () => {
    const r = await login({ correo: 'vendedora1@prueba.test', clave: CLAVE_PRUEBA });
    assert.equal(r.status, 200);
    assert.deepEqual(Object.keys(r.json).sort(), ['token', 'usuario']);
    assert.deepEqual(r.json.usuario, { id: 4, nombre: 'Vendedora Uno', correo: 'vendedora1@prueba.test' });

    const decodificado = jwt.decode(r.json.token, { complete: true });
    assert.equal(decodificado.header.alg, 'HS256');
    assert.equal(decodificado.payload.sub, '4');
    assert.ok(decodificado.payload.exp - decodificado.payload.iat === 8 * 3600, 'expira en JWT_EXPIRES_IN (8h)');
    assert.doesNotThrow(() => jwt.verify(r.json.token, process.env.JWT_SECRET, { algorithms: ['HS256'] }));
  });

  test('la respuesta no expone hash, rol ni activo, y el token no contiene datos personales', async () => {
    const r = await login({ correo: 'vendedora1@prueba.test', clave: CLAVE_PRUEBA });
    assert.doesNotMatch(r.texto, /\$2[aby]\$|password|"rol"|"activo"/);
    const payload = jwt.decode(r.json.token);
    assert.deepEqual(Object.keys(payload).sort(), ['exp', 'iat', 'sub']);
  });

  test('el correo se acepta con espacios alrededor y los campos ajenos se ignoran', async () => {
    const r = await login({ correo: '  vendedora1@prueba.test ', clave: CLAVE_PRUEBA, rol: 'administrador', vendedor_id: 5, id: 1 });
    assert.equal(r.status, 200);
    assert.equal(r.json.usuario.id, 4);
    assert.equal(jwt.decode(r.json.token).sub, '4');
  });
});

describe('B2-02 datos inválidos', () => {
  test('correo o clave ausentes, vacíos o de tipo incorrecto → 422 { errores } por campo', async () => {
    const casos = [
      [{}, ['clave', 'correo']],
      [{ correo: 'vendedora1@prueba.test' }, ['clave']],
      [{ clave: CLAVE_PRUEBA }, ['correo']],
      [{ correo: '', clave: '' }, ['clave', 'correo']],
      [{ correo: '   ', clave: CLAVE_PRUEBA }, ['correo']],
      [{ correo: 'no-es-correo', clave: CLAVE_PRUEBA }, ['correo']],
      [{ correo: 123, clave: true }, ['clave', 'correo']],
      [{ correo: ['a@b.test'], clave: { x: 1 } }, ['clave', 'correo']],
      [{ correo: null, clave: null }, ['clave', 'correo']],
      [{ correo: `${'a'.repeat(250)}@b.test`, clave: CLAVE_PRUEBA }, ['correo']],
      [{ correo: 'vendedora1@prueba.test', clave: 'x'.repeat(256) }, ['clave']],
    ];
    for (const [cuerpo, campos] of casos) {
      const r = await login(cuerpo);
      assert.equal(r.status, 422, JSON.stringify(cuerpo));
      assert.deepEqual(Object.keys(r.json), ['errores']);
      assert.deepEqual(Object.keys(r.json.errores).sort(), campos, JSON.stringify(cuerpo));
    }
  });

  test('sin cuerpo JSON → 400 { error }', async () => {
    const casos = [
      { tipo: null, crudo: '' },                                  // sin cuerpo ni Content-Type
      { tipo: 'application/json', crudo: '' },                    // Content-Type JSON sin cuerpo
      { tipo: 'text/plain', crudo: 'correo=a&clave=b' },          // otro tipo de contenido
      { tipo: 'application/x-www-form-urlencoded', crudo: 'correo=a%40b.test&clave=x' },
      { tipo: 'application/json', crudo: '[]' },                  // array
      { tipo: 'application/json', crudo: '["a@b.test","x"]' },
    ];
    for (const c of casos) {
      const r = await login(undefined, c);
      assert.equal(r.status, 400, JSON.stringify(c));
      assert.deepEqual(Object.keys(r.json), ['error'], JSON.stringify(c));
    }
  });

  test('cuerpo JSON vacío enviado por partes (chunked, sin Content-Length) → 400 { error }', async () => {
    const { request } = await import('node:http');
    const { port } = new URL(api.url);
    const r = await new Promise((resolve, reject) => {
      const req = request({ host: '127.0.0.1', port, path: '/api/auth/login', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked' } }, (res) => {
        let d = '';
        res.on('data', (c) => { d += c; });
        res.on('end', () => resolve({ status: res.statusCode, json: JSON.parse(d) }));
      });
      req.on('error', reject);
      req.end();
    });
    assert.equal(r.status, 400);
    assert.deepEqual(Object.keys(r.json), ['error']);
  });

  test('un objeto enviado por partes (chunked) sí se valida: {} → 422 y credenciales correctas → 200', async () => {
    const { request } = await import('node:http');
    const { port } = new URL(api.url);
    const enviar = (cuerpo) => new Promise((resolve, reject) => {
      const req = request({ host: '127.0.0.1', port, path: '/api/auth/login', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked' } }, (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode));
      });
      req.on('error', reject);
      req.write(cuerpo);
      req.end();
    });
    assert.equal(await enviar('{}'), 422);
    assert.equal(await enviar(JSON.stringify({ correo: 'vendedora1@prueba.test', clave: CLAVE_PRUEBA })), 200);
  });

  test('JSON mal formado o un valor que no es objeto → 400 { error }', async () => {
    for (const crudo of ['{"correo": ', '"texto"', 'null', '42', 'true']) {
      const r = await login(undefined, { crudo });
      assert.equal(r.status, 400, crudo);
      assert.deepEqual(Object.keys(r.json), ['error'], crudo);
    }
  });
});

describe('B2-03 credenciales incorrectas', () => {
  test('correo inexistente y clave incorrecta responden 401 con el mismo cuerpo', async () => {
    const inexistente = await login({ correo: 'nadie@prueba.test', clave: CLAVE_PRUEBA });
    const incorrecta = await login({ correo: 'vendedora1@prueba.test', clave: 'otra-clave' });
    assert.equal(inexistente.status, 401);
    assert.equal(incorrecta.status, 401);
    assert.deepEqual(inexistente.json, incorrecta.json);
    assert.deepEqual(Object.keys(inexistente.json), ['error']);
    assert.doesNotMatch(inexistente.texto, /correo|no existe|usuario/i);
    assert.equal(inexistente.json.token, undefined);
  });

  test('con un correo inexistente se compara la clave contra un hash falso de coste 12', async () => {
    const comparaciones = [];
    const app = express();
    app.use(express.json());
    app.use('/api/auth', crearRutasAuth({
      pool: bd.pool,
      comparar: async (clave, hash) => { comparaciones.push(hash); return false; },
    }));
    app.use(rutaNoEncontrada);
    app.use(manejadorErrores);
    const s = await levantar(app);
    try {
      const r = await pedir(`${s.url}/api/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ correo: 'nadie@prueba.test', clave: 'x' }),
      });
      assert.equal(r.status, 401);
      assert.deepEqual(comparaciones, [_HASH_FALSO_PARA_PRUEBAS]);
      assert.match(_HASH_FALSO_PARA_PRUEBAS, /^\$2[aby]\$12\$/);
    } finally {
      s.servidor.close();
    }
  });
});

describe('B2-04 rol no permitido', () => {
  for (const correo of ['admin@prueba.test', 'supervisora@prueba.test']) {
    test(`${correo} con clave correcta → 403 sin token`, async () => {
      const r = await login({ correo, clave: CLAVE_PRUEBA });
      assert.equal(r.status, 403);
      assert.deepEqual(Object.keys(r.json), ['error']);
      assert.doesNotMatch(r.texto, /token|eyJ/);
    });
    test(`${correo} con clave incorrecta → 401 (no revela el rol)`, async () => {
      const r = await login({ correo, clave: 'otra-clave' });
      assert.equal(r.status, 401);
    });
  }
});

describe('B2-05 cuenta inactiva', () => {
  test('vendedor inactivo con clave correcta → 403 sin token', async () => {
    const r = await login({ correo: 'inactivo@prueba.test', clave: CLAVE_PRUEBA });
    assert.equal(r.status, 403);
    assert.deepEqual(Object.keys(r.json), ['error']);
    assert.doesNotMatch(r.texto, /eyJ/);
  });

  test('vendedor inactivo con clave incorrecta → 401', async () => {
    const r = await login({ correo: 'inactivo@prueba.test', clave: 'otra-clave' });
    assert.equal(r.status, 401);
  });
});

describe('S3 consultas parametrizadas', () => {
  test('el correo se pasa como parámetro, nunca dentro del SQL', async () => {
    const correo = "x'OR'1'='1@prueba.test"; // sin espacios, para que pase la validación de formato
    bd.llamadas.length = 0;
    await login({ correo, clave: 'x' });
    const consulta = bd.llamadas.find((l) => /FROM users WHERE email/.test(l.sql));
    assert.ok(consulta);
    assert.ok(!consulta.sql.includes(correo));
    assert.deepEqual(consulta.params, [correo]);
  });
});
