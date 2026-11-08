// B2-06 a B2-09: middleware JWT sobre una ruta protegida (GET /api/clientes), con base simulada.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { generateKeyPairSync } from 'node:crypto';

const SECRETO = 'secreto_de_prueba_b2_no_usar_en_prod_40c';
process.env.JWT_SECRET = SECRETO;
process.env.JWT_EXPIRES_IN = '8h';

const { crearApp } = await import('../src/app.js');
const { firmarToken } = await import('../src/config/jwt.js');
const { pool: poolReal } = await import('../src/config/db.js');
const { crearBdSimulada, levantar, pedir } = await import('./ayuda/bd-simulada.js');

let bd;
let api;
before(async () => {
  bd = crearBdSimulada();
  api = await levantar(crearApp({ origenPermitido: 'http://127.0.0.1:5500', pool: bd.pool }));
});
after(async () => { api.servidor.close(); await poolReal.end(); });

const clientes = (cabeceras = {}, ruta = '/api/clientes') => pedir(`${api.url}${ruta}`, { headers: cabeceras });
const bearer = (t) => ({ Authorization: `Bearer ${t}` });
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

describe('B2-06 token obligatorio', () => {
  test('sin cabecera, con otro esquema o con Bearer vacío → 401 { error }', async () => {
    for (const cab of [{}, { Authorization: '' }, { Authorization: 'Bearer' }, { Authorization: 'Bearer ' },
      { Authorization: `Basic ${Buffer.from('a:b').toString('base64')}` }, { Authorization: firmarToken(4) },
      { Authorization: `bearer ${firmarToken(4)}x y` }, { Authorization: `Bearer ${firmarToken(4)} extra` }]) {
      const r = await clientes(cab);
      assert.equal(r.status, 401, JSON.stringify(cab).slice(0, 60));
      assert.deepEqual(Object.keys(r.json), ['error']);
    }
  });

  test('un token válido da acceso (control positivo)', async () => {
    const r = await clientes(bearer(firmarToken(4)));
    assert.equal(r.status, 200);
  });
});

describe('B2-07 firma, expiración y algoritmo', () => {
  test('firma manipulada o payload alterado → 401', async () => {
    const t = firmarToken(4);
    const [h, p, f] = t.split('.');
    const otraFirma = f.slice(0, -2) + (f.endsWith('AA') ? 'BB' : 'AA');
    const otroPayload = b64({ ...JSON.parse(Buffer.from(p, 'base64url')), sub: '5' });
    for (const malo of [`${h}.${p}.${otraFirma}`, `${h}.${otroPayload}.${f}`, `${h}.${p}.`, 'no.es.jwt', t.slice(0, -1)]) {
      assert.equal((await clientes(bearer(malo))).status, 401, malo.slice(-12));
    }
  });

  test('firmado con otro secreto → 401', async () => {
    const t = jwt.sign({ sub: '4' }, 'otro_secreto_de_al_menos_32_caracteres!!', { algorithm: 'HS256', expiresIn: '1h' });
    assert.equal((await clientes(bearer(t))).status, 401);
  });

  test('expirado → 401', async () => {
    const t = jwt.sign({ sub: '4', iat: Math.floor(Date.now() / 1000) - 7200, exp: Math.floor(Date.now() / 1000) - 60 }, SECRETO, { algorithm: 'HS256' });
    assert.equal((await clientes(bearer(t))).status, 401);
  });

  test('alg "none", HS384, HS512 y RS256 → 401', async () => {
    const ahora = Math.floor(Date.now() / 1000);
    const none = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: '4', iat: ahora, exp: ahora + 3600 })}.`;
    const hs384 = jwt.sign({ sub: '4' }, SECRETO, { algorithm: 'HS384', expiresIn: '1h' });
    const hs512 = jwt.sign({ sub: '4' }, SECRETO, { algorithm: 'HS512', expiresIn: '1h' });
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const rs256 = jwt.sign({ sub: '4' }, privateKey, { algorithm: 'RS256', expiresIn: '1h' });
    for (const [nombre, t] of [['none', none], ['HS384', hs384], ['HS512', hs512], ['RS256', rs256]]) {
      assert.equal((await clientes(bearer(t))).status, 401, nombre);
    }
  });

  test('sin sub, sub no numérico o sub inexistente → 401', async () => {
    for (const payload of [{}, { sub: 'abc' }, { sub: '0' }, { sub: '-4' }, { sub: '4.5' }, { sub: '999' }]) {
      const t = jwt.sign(payload, SECRETO, { algorithm: 'HS256', expiresIn: '1h' });
      assert.equal((await clientes(bearer(t))).status, 401, JSON.stringify(payload));
    }
  });
});

describe('JWT_EXPIRES_IN', () => {
  const exp = (t) => { const p = jwt.decode(t); return p.exp - p.iat; };
  test('un valor solo con dígitos son segundos (no milisegundos) y las unidades se respetan', () => {
    const original = process.env.JWT_EXPIRES_IN;
    try {
      process.env.JWT_EXPIRES_IN = '3600';
      assert.equal(exp(firmarToken(4)), 3600);
      process.env.JWT_EXPIRES_IN = ' 8h ';
      assert.equal(exp(firmarToken(4)), 8 * 3600);
      process.env.JWT_EXPIRES_IN = '30m';
      assert.equal(exp(firmarToken(4)), 1800);
      delete process.env.JWT_EXPIRES_IN;
      assert.equal(exp(firmarToken(4)), 8 * 3600, 'por defecto 8h');
    } finally {
      process.env.JWT_EXPIRES_IN = original;
    }
  });
});

describe('B2-08 revocación por estado del usuario', () => {
  test('un token válido deja de servir si la cuenta se desactiva, cambia de rol o se elimina', async () => {
    const t = firmarToken(5);
    assert.equal((await clientes(bearer(t))).status, 200);

    const u = bd.users.find((x) => x.id === 5);
    u.activo = 0;
    assert.equal((await clientes(bearer(t))).status, 401, 'desactivado');
    u.activo = 1;
    assert.equal((await clientes(bearer(t))).status, 200, 'reactivado');

    u.rol = 'supervisor';
    assert.equal((await clientes(bearer(t))).status, 401, 'cambió de rol');
    u.rol = 'vendedor';

    bd.users.splice(bd.users.indexOf(u), 1);
    assert.equal((await clientes(bearer(t))).status, 401, 'eliminado');
    bd.users.push(u);
  });

  test('el middleware consulta la base de datos en cada petición', async () => {
    bd.llamadas.length = 0;
    const t = firmarToken(4);
    await clientes(bearer(t));
    await clientes(bearer(t));
    assert.equal(bd.llamadas.filter((l) => /FROM users WHERE id = \?/.test(l.sql)).length, 2);
  });

  test('administradores y supervisores con un token firmado no acceden → 401', async () => {
    for (const id of [1, 2, 6]) {
      assert.equal((await clientes(bearer(firmarToken(id)))).status, 401, `id ${id}`);
    }
  });
});

describe('B2-09 identidad del vendedor', () => {
  test('vendedor_id o usuario_id en la consulta no cambian la identidad: se usa el sub del token', async () => {
    bd.llamadas.length = 0;
    const r = await clientes(bearer(firmarToken(4)), '/api/clientes?vendedor_id=5&usuario_id=5&id=5');
    assert.equal(r.status, 200);
    assert.ok(r.json.every((c) => c.nombre !== 'Cliente de Otro Vendedor'));
    const consulta = bd.llamadas.find((l) => /FROM clientes WHERE vendedor_id = \?/.test(l.sql));
    assert.deepEqual(consulta.params, [4]);
  });
});
