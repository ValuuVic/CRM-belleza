// B2-10: GET /api/clientes devuelve solo la cartera del vendedor del token (base simulada).
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET = 'secreto_de_prueba_b2_no_usar_en_prod_40c';

const { crearApp } = await import('../src/app.js');
const { firmarToken } = await import('../src/config/jwt.js');
const { serializarCliente } = await import('../src/rutas/clientes.js');
const { pool: poolReal } = await import('../src/config/db.js');
const { crearBdSimulada, levantar, pedir } = await import('./ayuda/bd-simulada.js');

const bd = crearBdSimulada();
let api;
before(async () => { api = await levantar(crearApp({ origenPermitido: 'http://127.0.0.1:5500', pool: bd.pool })); });
after(async () => { api.servidor.close(); await poolReal.end(); });

const cartera = (id) => pedir(`${api.url}/api/clientes`, { headers: { Authorization: `Bearer ${firmarToken(id)}` } });

describe('B2-10 clientes propios', () => {
  test('devuelve un array plano solo con los clientes del vendedor, en formato §8.2', async () => {
    const r = await cartera(4);
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.json));
    assert.deepEqual(r.json, [
      { id: 11, nombre: 'Almacén Alfa', nit: 'CF', telefono: '22334455', correo: null },
      { id: 10, nombre: 'Tienda Beta', nit: '4521817K', telefono: '55551234', correo: 'compras@beta.test' },
    ]);
  });

  test('no expone clientes de otros vendedores ni clientes disponibles', async () => {
    const r = await cartera(4);
    const nombres = r.json.map((c) => c.nombre);
    assert.ok(!nombres.includes('Cliente de Otro Vendedor'));
    assert.ok(!nombres.includes('Cliente Disponible'));
    const otro = await cartera(5);
    assert.deepEqual(otro.json.map((c) => c.id), [12]);
  });

  test('cada cliente tiene exactamente las claves del contrato, sin vendedor_id', async () => {
    const r = await cartera(4);
    for (const c of r.json) assert.deepEqual(Object.keys(c), ['id', 'nombre', 'nit', 'telefono', 'correo']);
    assert.doesNotMatch(r.texto, /vendedor_id/);
  });

  test('un vendedor sin clientes recibe un array vacío', async () => {
    bd.users.push({ ...bd.users.find((u) => u.id === 4), id: 7, email: 'sin-cartera@prueba.test' });
    const r = await cartera(7);
    assert.equal(r.status, 200);
    assert.deepEqual(r.json, []);
  });

  test('sin token → 401', async () => {
    const r = await pedir(`${api.url}/api/clientes`);
    assert.equal(r.status, 401);
  });

  test('el id del vendedor va como parámetro de la consulta', async () => {
    bd.llamadas.length = 0;
    await cartera(4);
    const consulta = bd.llamadas.find((l) => /FROM clientes/.test(l.sql));
    assert.match(consulta.sql, /WHERE vendedor_id = \?/);
    assert.deepEqual(consulta.params, [4]);
  });
});

describe('serializarCliente (R4)', () => {
  test('NIT NULL se presenta como "CF" y correo ausente como null', () => {
    assert.deepEqual(serializarCliente({ id: 1, nombre: 'X', nit: null, telefono: '22223333', correo: undefined, vendedor_id: 4 }),
      { id: 1, nombre: 'X', nit: 'CF', telefono: '22223333', correo: null });
  });
});
