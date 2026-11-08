// B2-10 y B3-01 a B3-13: rutas de /api/clientes con la base simulada (sin MySQL).
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

// =============================================================================
// B3 — Clientes y cartera (docs/specs/B3-clientes.md), con base simulada.
// Cada bloque usa su propia base para que los cambios de datos no se mezclen.
// Las pruebas contra MySQL real y VerificacionSeeder están en integracion-b3.test.js (I1).
// =============================================================================

const ORIGEN = 'http://127.0.0.1:5500';

/** Base simulada + API levantada; `cerrar()` detiene el servidor. */
async function entorno(preparar = () => {}) {
  const b = crearBdSimulada();
  preparar(b);
  const a = await levantar(crearApp({ origenPermitido: ORIGEN, pool: b.pool }));
  const llamar = (vendedor, metodo, ruta, { cuerpo, crudo, tipo = 'application/json', token = true } = {}) => {
    const headers = token ? { Authorization: `Bearer ${firmarToken(vendedor)}` } : {};
    let body;
    if (crudo !== undefined) { body = crudo; headers['Content-Type'] = tipo; }
    else if (cuerpo !== undefined) { body = JSON.stringify(cuerpo); headers['Content-Type'] = tipo; }
    return pedir(`${a.url}/api/clientes${ruta}`, { method: metodo, headers, body });
  };
  return { bd: b, llamar, cerrar: () => a.servidor.close() };
}

/** Añade `n` clientes ficticios al vendedor indicado (teléfonos únicos, NIT CF). */
function llenarCartera(b, vendedorId, n) {
  for (let i = 0; i < n; i++) {
    b.clientes.push({ id: 1000 + vendedorId * 100 + i, vendedor_id: vendedorId, nombre: `Relleno ${vendedorId}-${i}`, nit: null, telefono: `7${String(vendedorId).padStart(2, '0')}${String(i).padStart(5, '0')}`, correo: null });
  }
}

const CLAVES_CLIENTE = ['id', 'nombre', 'nit', 'telefono', 'correo'];
const nuevo = (extra = {}) => ({ nombre: 'Distribuidora Bella', nit: '10000011', telefono: '23456789', correo: 'contacto@bella.test', ...extra });
const cuenta = (b, vendedorId) => b.clientes.filter((c) => c.vendedor_id === vendedorId).length;
const copia = (b) => JSON.parse(JSON.stringify(b.clientes));

describe('B3-01 consultar cartera propia', () => {
  let e;
  before(async () => { e = await entorno(); });
  after(() => e.cerrar());

  test('200 con solo los clientes del token, sin ajenos ni disponibles, en formato del contrato', async () => {
    const r = await e.llamar(4, 'GET', '');
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.map((c) => c.id), [11, 10]);
    for (const c of r.json) assert.deepEqual(Object.keys(c), CLAVES_CLIENTE);
    assert.doesNotMatch(r.texto, /vendedor_id|Cliente de Otro Vendedor|Cliente Disponible/);
  });

  test('q vacío o con solo espacios equivale al listado completo', async () => {
    assert.deepEqual((await e.llamar(4, 'GET', '?q=')).json.map((c) => c.id), [11, 10]);
    assert.deepEqual((await e.llamar(4, 'GET', '?q=%20%20')).json.map((c) => c.id), [11, 10]);
  });

  test('todas las rutas de clientes exigen token → 401', async () => {
    for (const [metodo, ruta] of [['GET', ''], ['GET', '?q=a'], ['GET', '/disponibles'], ['GET', '/10'], ['POST', ''], ['PATCH', '/10'], ['POST', '/13/tomar']]) {
      const r = await e.llamar(4, metodo, ruta, { token: false, cuerpo: metodo === 'GET' ? undefined : nuevo() });
      assert.equal(r.status, 401, `${metodo} ${ruta}`);
    }
    assert.equal(e.bd.clientes.find((c) => c.id === 13).vendedor_id, null);
  });
});

describe('B3-02 NIT NULL se presenta como "CF"', () => {
  let e;
  before(async () => { e = await entorno(); });
  after(() => e.cerrar());

  test('en el listado, el detalle, el alta, la edición y la toma', async () => {
    assert.equal((await e.llamar(4, 'GET', '')).json.find((c) => c.id === 11).nit, 'CF');
    assert.equal((await e.llamar(4, 'GET', '/11')).json.nit, 'CF');
    const alta = await e.llamar(4, 'POST', '', { cuerpo: nuevo({ nit: 'CF' }) });
    assert.equal(alta.status, 201);
    assert.equal(alta.json.nit, 'CF');
    assert.equal((await e.llamar(4, 'PATCH', '/11', { cuerpo: { nombre: 'Almacén Alfa 2' } })).json.nit, 'CF');
    assert.equal((await e.llamar(4, 'POST', '/13/tomar')).json.nit, 'CF');
  });
});

describe('B3-03 búsqueda segura en el servidor', () => {
  let e;
  before(async () => {
    e = await entorno((b) => {
      b.clientes.push({ id: 20, vendedor_id: 4, nombre: 'Belleza 100% Natural', nit: '10000380', telefono: '24242424', correo: null });
      b.clientes.push({ id: 21, vendedor_id: 4, nombre: 'Belleza_Total', nit: null, telefono: '25252525', correo: null });
    });
  });
  after(() => e.cerrar());

  test('filtra por nombre, sin distinguir mayúsculas, solo en la cartera propia', async () => {
    const r = await e.llamar(4, 'GET', '?q=tienda');
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.map((c) => c.id), [10]);
    assert.deepEqual((await e.llamar(4, 'GET', '?q=Otro%20Vendedor')).json, []);
    assert.deepEqual((await e.llamar(5, 'GET', '?q=Tienda')).json, []);
  });

  test('filtra por NIT, también escrito con guion, espacios o en minúsculas', async () => {
    for (const q of ['4521817K', '4521817-k', '4521 817', '817']) {
      const r = await e.llamar(4, 'GET', `?q=${encodeURIComponent(q)}`);
      assert.deepEqual(r.json.map((c) => c.id), [10], q);
    }
  });

  test("' OR 1=1 -- no devuelve clientes ni ejecuta SQL: el valor viaja como parámetro", async () => {
    e.bd.llamadas.length = 0;
    const r = await e.llamar(4, 'GET', `?q=${encodeURIComponent("' OR 1=1 --")}`);
    assert.equal(r.status, 200);
    assert.deepEqual(r.json, []);
    const consulta = e.bd.llamadas.find((l) => /FROM clientes/.test(l.sql));
    assert.doesNotMatch(consulta.sql, /OR 1=1/);
    assert.match(consulta.sql, /vendedor_id = \? AND \(nombre LIKE \? ESCAPE '!' OR nit LIKE \? ESCAPE '!'\)/);
    assert.equal(consulta.params[0], 4);
    assert.equal(consulta.params[1], "%' OR 1=1 --%");
  });

  test('los comodines % y _ se buscan como texto literal', async () => {
    assert.deepEqual((await e.llamar(4, 'GET', '?q=%25')).json.map((c) => c.id), [20]);
    assert.deepEqual((await e.llamar(4, 'GET', '?q=_')).json.map((c) => c.id), [21]);
    assert.deepEqual((await e.llamar(4, 'GET', '?q=!')).json, []);
  });

  test('un texto sin caracteres de NIT no coincide con todos los NIT (patrón NULL)', async () => {
    e.bd.llamadas.length = 0;
    assert.deepEqual((await e.llamar(4, 'GET', '?q=-')).json, []);
    assert.equal(e.bd.llamadas.find((l) => /FROM clientes/.test(l.sql)).params[2], null);
  });

  test('parámetros no admitidos, q repetido o q de más de 100 caracteres → 400', async () => {
    for (const ruta of ['?otro=1', '?q=a&q=b', '?q[x]=1', `?q=${'a'.repeat(101)}`]) {
      const r = await e.llamar(4, 'GET', ruta);
      assert.equal(r.status, 400, ruta);
      assert.deepEqual(Object.keys(r.json), ['error'], ruta);
    }
    assert.equal((await e.llamar(4, 'GET', `?q=${'a'.repeat(100)}`)).status, 200);
  });
});

describe('B3-04 clientes disponibles', () => {
  let e;
  before(async () => {
    e = await entorno((b) => b.clientes.push({ id: 22, vendedor_id: null, nombre: 'Atelier Disponible', nit: '10000755', telefono: '26262626', correo: 'a@b.test' }));
  });
  after(() => e.cerrar());

  test('200 solo con los clientes sin vendedor, cada uno con exactamente { id, nombre }', async () => {
    const r = await e.llamar(4, 'GET', '/disponibles');
    assert.equal(r.status, 200);
    assert.deepEqual(r.json, [{ id: 22, nombre: 'Atelier Disponible' }, { id: 13, nombre: 'Cliente Disponible' }]);
    for (const c of r.json) assert.deepEqual(Object.keys(c), ['id', 'nombre']);
    assert.doesNotMatch(r.texto, /26262626|10000755|a@b\.test/);
  });

  test('con parámetros de consulta → 400', async () => {
    assert.equal((await e.llamar(4, 'GET', '/disponibles?x=1')).status, 400);
  });
});

describe('B3-05 protección de clientes ajenos', () => {
  let e;
  before(async () => { e = await entorno(); });
  after(() => e.cerrar());

  test('GET de un cliente de otro vendedor → 404 idéntico al de un inexistente', async () => {
    const ajeno = await e.llamar(4, 'GET', '/12');
    const inexistente = await e.llamar(4, 'GET', '/999');
    assert.equal(ajeno.status, 404);
    assert.deepEqual(ajeno.json, inexistente.json);
    assert.doesNotMatch(ajeno.texto, /Otro Vendedor|33445566/);
  });

  test('GET de un cliente disponible (sin vendedor) → 404', async () => {
    assert.equal((await e.llamar(4, 'GET', '/13')).status, 404);
  });

  test('PATCH de un cliente ajeno → 404 y la fila no cambia', async () => {
    const antes = copia(e.bd);
    const r = await e.llamar(4, 'PATCH', '/12', { cuerpo: { telefono: '29999999' } });
    assert.equal(r.status, 404);
    assert.deepEqual(r.json, (await e.llamar(4, 'GET', '/999')).json);
    assert.deepEqual(e.bd.clientes, antes);
  });

  test('el detalle propio responde 200 con el formato del contrato', async () => {
    const r = await e.llamar(4, 'GET', '/10');
    assert.equal(r.status, 200);
    assert.deepEqual(r.json, { id: 10, nombre: 'Tienda Beta', nit: '4521817K', telefono: '55551234', correo: 'compras@beta.test' });
  });
});

describe('B3-06 identificador inválido', () => {
  let e;
  before(async () => { e = await entorno(); });
  after(() => e.cerrar());

  test('abc, 0, -1, 1.5, 010 y números enormes → 404 en GET, PATCH y tomar, sin consultar clientes', async () => {
    for (const id of ['abc', '0', '-1', '1.5', '010', '99999999999999999999', '1e3']) {
      e.bd.llamadas.length = 0;
      for (const [metodo, ruta, cuerpo] of [['GET', `/${id}`], ['PATCH', `/${id}`, { telefono: '23456789' }], ['POST', `/${id}/tomar`]]) {
        const r = await e.llamar(4, metodo, ruta, { cuerpo });
        assert.equal(r.status, 404, `${metodo} ${ruta}`);
        assert.deepEqual(Object.keys(r.json), ['error']);
      }
      assert.ok(!e.bd.llamadas.some((l) => /clientes/.test(l.sql)), id);
    }
  });
});

describe('B3-07 validaciones al registrar', () => {
  let e;
  before(async () => { e = await entorno(); });
  after(() => e.cerrar());

  test("NIT '4521817-1' → 422 con errores.nit y sin insertar", async () => {
    const antes = copia(e.bd);
    const r = await e.llamar(4, 'POST', '', { cuerpo: nuevo({ nit: '4521817-1' }) });
    assert.equal(r.status, 422);
    assert.deepEqual(Object.keys(r.json), ['errores']);
    assert.deepEqual(Object.keys(r.json.errores), ['nit']);
    assert.equal(typeof r.json.errores.nit, 'string');
    assert.deepEqual(e.bd.clientes, antes);
  });

  test('campos obligatorios ausentes o inválidos → 422 con un mensaje por campo', async () => {
    const r = await e.llamar(4, 'POST', '', { cuerpo: { correo: 'no-es-correo' } });
    assert.equal(r.status, 422);
    assert.deepEqual(Object.keys(r.json.errores).sort(), ['correo', 'nit', 'nombre', 'telefono']);
    const t = await e.llamar(4, 'POST', '', { cuerpo: nuevo({ telefono: '12345678' }) });
    assert.deepEqual(Object.keys(t.json.errores), ['telefono']);
    const n = await e.llamar(4, 'POST', '', { cuerpo: nuevo({ nombre: 'x'.repeat(151) }) });
    assert.deepEqual(Object.keys(n.json.errores), ['nombre']);
    const tipos = await e.llamar(4, 'POST', '', { cuerpo: { nombre: 5, nit: 12345679, telefono: 23456789 } });
    assert.deepEqual(Object.keys(tipos.json.errores).sort(), ['nit', 'nombre', 'telefono']);
  });

  test('cuerpo ausente, no JSON, array o JSON mal formado → 400', async () => {
    for (const opciones of [{}, { crudo: '[]' }, { crudo: '"x"' }, { crudo: '{"a":' }, { crudo: 'nombre=x', tipo: 'application/x-www-form-urlencoded' }]) {
      const r = await e.llamar(4, 'POST', '', opciones);
      assert.equal(r.status, 400, JSON.stringify(opciones));
      assert.deepEqual(Object.keys(r.json), ['error']);
    }
  });
});

describe('B3-08 NIT o teléfono duplicados', () => {
  let e;
  before(async () => { e = await entorno(); });
  after(() => e.cerrar());

  test('NIT existente escrito en formato equivalente → 409 por el índice único, sin consulta previa', async () => {
    e.bd.llamadas.length = 0;
    const antes = copia(e.bd);
    const r = await e.llamar(4, 'POST', '', { cuerpo: nuevo({ nit: '4521817-k' }) });
    assert.equal(r.status, 409);
    assert.deepEqual(Object.keys(r.json), ['error']);
    assert.ok(!e.bd.llamadas.some((l) => /WHERE nit|nit = \?/.test(l.sql)), 'no debe consultar el NIT antes de insertar');
    assert.ok(e.bd.llamadas.some((l) => /^INSERT INTO clientes/.test(l.sql) && l.transaccion));
    assert.equal(e.bd.estadisticas.rollback, 1);
    assert.deepEqual(e.bd.clientes, antes);
  });

  test('teléfono existente con prefijo y separadores → 409', async () => {
    const r = await e.llamar(4, 'POST', '', { cuerpo: nuevo({ telefono: '+502 3344-5566' }) });
    assert.equal(r.status, 409);
  });

  test('PATCH que duplica el teléfono de otro cliente → 409 sin cambios', async () => {
    const antes = copia(e.bd);
    const r = await e.llamar(4, 'PATCH', '/11', { cuerpo: { telefono: '5555-1234' } });
    assert.equal(r.status, 409);
    assert.deepEqual(e.bd.clientes, antes);
  });

  test('varios clientes con NIT CF no chocan entre sí (NULL no es único)', async () => {
    assert.equal((await e.llamar(4, 'POST', '', { cuerpo: nuevo({ nit: 'CF', telefono: '27272727' }) })).status, 201);
    assert.equal((await e.llamar(4, 'POST', '', { cuerpo: nuevo({ nit: 'cf', telefono: '28282828' }) })).status, 201);
  });
});

describe('B3-09 normalización al registrar', () => {
  let e;
  before(async () => { e = await entorno(); });
  after(() => e.cerrar());

  test('nit "cf" y telefono "+502 5555 1234" → 201 con "CF" y "55551234"; en la base NIT NULL', async () => {
    e.bd.clientes.find((c) => c.id === 10).telefono = '21212121'; // libera 55551234 para este caso
    const r = await e.llamar(4, 'POST', '', { cuerpo: { nombre: '  Distribuidora Bella  ', nit: 'cf', telefono: '+502 5555 1234' } });
    assert.equal(r.status, 201);
    assert.deepEqual(Object.keys(r.json), CLAVES_CLIENTE);
    assert.equal(r.json.nombre, 'Distribuidora Bella');
    assert.equal(r.json.nit, 'CF');
    assert.equal(r.json.telefono, '55551234');
    assert.equal(r.json.correo, null);
    const fila = e.bd.clientes.find((c) => c.id === r.json.id);
    assert.equal(fila.nit, null);
    assert.equal(fila.telefono, '55551234');
  });

  test('el alta devuelve el cliente nuevo aunque se hayan añadido filas con ids altos', async () => {
    e.bd.clientes.push({ id: 500, vendedor_id: 4, nombre: 'Fila añadida a mano', nit: null, telefono: '35353535', correo: null });
    const r = await e.llamar(4, 'POST', '', { cuerpo: nuevo({ nombre: 'Alta tras fila manual', nit: 'CF', telefono: '36363636' }) });
    assert.equal(r.status, 201);
    assert.equal(r.json.nombre, 'Alta tras fila manual');
    assert.ok(r.json.id > 500);
    assert.equal(new Set(e.bd.clientes.map((c) => c.id)).size, e.bd.clientes.length, 'ids únicos');
  });

  test('NIT con ceros iniciales y guion se guarda normalizado; correo vacío → null', async () => {
    const r = await e.llamar(4, 'POST', '', { cuerpo: nuevo({ nit: '00-1000075-5', telefono: '29292929', correo: '' }) });
    assert.equal(r.status, 201);
    assert.equal(r.json.nit, '10000755');
    assert.equal(r.json.correo, null);
  });
});

describe('B3-10 protección de identidad', () => {
  let e;
  before(async () => { e = await entorno(); });
  after(() => e.cerrar());

  test('"vendedor_id": 99 en el alta se ignora: el cliente pertenece al vendedor del token', async () => {
    const r = await e.llamar(4, 'POST', '', { cuerpo: nuevo({ vendedor_id: 99, id: 1, created_at: 'x' }) });
    assert.equal(r.status, 201);
    assert.doesNotMatch(r.texto, /vendedor_id/);
    const fila = e.bd.clientes.find((c) => c.id === r.json.id);
    assert.equal(fila.vendedor_id, 4);
    assert.notEqual(r.json.id, 1);
    const insercion = e.bd.llamadas.find((l) => /^INSERT INTO clientes/.test(l.sql));
    assert.equal(insercion.params[0], 4);
    assert.ok(!insercion.params.includes(99));
  });

  test('PATCH con vendedor_id junto a un campo válido no cambia el dueño; solo con vendedor_id → 400', async () => {
    const r = await e.llamar(4, 'PATCH', '/10', { cuerpo: { vendedor_id: 5, nombre: 'Tienda Beta 2' } });
    assert.equal(r.status, 200);
    assert.equal(e.bd.clientes.find((c) => c.id === 10).vendedor_id, 4);
    const solo = await e.llamar(4, 'PATCH', '/10', { cuerpo: { vendedor_id: 5 } });
    assert.equal(solo.status, 400);
    assert.equal(e.bd.clientes.find((c) => c.id === 10).vendedor_id, 4);
  });
});

describe('B3-11 tomar un cliente disponible', () => {
  let e;
  before(async () => { e = await entorno(); });
  after(() => e.cerrar());

  test('200 con el cliente y queda en la cartera; ya no aparece en disponibles', async () => {
    const r = await e.llamar(4, 'POST', '/13/tomar');
    assert.equal(r.status, 200);
    assert.deepEqual(r.json, { id: 13, nombre: 'Cliente Disponible', nit: 'CF', telefono: '44556677', correo: null });
    assert.equal(e.bd.clientes.find((c) => c.id === 13).vendedor_id, 4);
    assert.ok((await e.llamar(4, 'GET', '')).json.some((c) => c.id === 13));
    assert.ok(!(await e.llamar(4, 'GET', '/disponibles')).json.some((c) => c.id === 13));
  });

  test('otro vendedor que intenta tomarlo después → 409 sin cambios', async () => {
    const antes = copia(e.bd);
    const r = await e.llamar(5, 'POST', '/13/tomar');
    assert.equal(r.status, 409);
    assert.deepEqual(Object.keys(r.json), ['error']);
    assert.deepEqual(e.bd.clientes, antes);
  });

  test('volver a tomar un cliente propio → 409; inexistente → 404', async () => {
    assert.equal((await e.llamar(4, 'POST', '/13/tomar')).status, 409);
    assert.equal((await e.llamar(4, 'POST', '/999/tomar')).status, 404);
  });

  test('el cuerpo se ignora: no puede asignarse a otro vendedor', async () => {
    e.bd.clientes.push({ id: 30, vendedor_id: null, nombre: 'Otro Disponible', nit: null, telefono: '23232323', correo: null });
    const r = await e.llamar(4, 'POST', '/30/tomar', { cuerpo: { vendedor_id: 5 } });
    assert.equal(r.status, 200);
    assert.equal(e.bd.clientes.find((c) => c.id === 30).vendedor_id, 4);
  });

  test('usa transacción con bloqueo del vendedor y del cliente, en ese orden, y libera la conexión', async () => {
    e.bd.clientes.push({ id: 31, vendedor_id: null, nombre: 'Tercero Disponible', nit: null, telefono: '23232324', correo: null });
    e.bd.llamadas.length = 0;
    assert.equal((await e.llamar(5, 'POST', '/31/tomar')).status, 200);
    const sqls = e.bd.llamadas.filter((l) => l.transaccion).map((l) => l.sql);
    const i = (re) => sqls.findIndex((s) => re.test(s));
    assert.ok(i(/FROM users WHERE id = \?.*FOR UPDATE/) >= 0);
    assert.ok(i(/FROM users WHERE id = \?.*FOR UPDATE/) < i(/FROM clientes WHERE id = \? FOR UPDATE/));
    assert.ok(i(/FROM clientes WHERE id = \? FOR UPDATE/) < i(/COUNT\(\*\)/));
    assert.ok(i(/COUNT\(\*\)/) < i(/^UPDATE clientes SET vendedor_id = \?.*vendedor_id IS NULL$/));
    assert.equal(e.bd.estadisticas.abiertas, 0);
    assert.equal(e.bd.bloqueos.size, 0);
  });
});

describe('A2/CA-03 cuenta desactivada durante la operación', () => {
  let e;
  before(async () => { e = await entorno(); });
  after(() => e.cerrar());

  test('si se desactiva tras el middleware, el bloqueo la rechaza → 401 sin crear ni tomar', async () => {
    const antes = copia(e.bd);
    // Se desactiva justo antes del bloqueo de la transacción (el middleware ya la aceptó).
    e.bd.ganchos.antes = (sql) => { if (/FOR UPDATE/.test(sql) && /FROM users/.test(sql)) e.bd.users.find((u) => u.id === 4).activo = 0; };
    const alta = await e.llamar(4, 'POST', '', { cuerpo: nuevo({ telefono: '34343434' }) });
    e.bd.users.find((u) => u.id === 4).activo = 1;
    const toma = await e.llamar(4, 'POST', '/13/tomar');
    e.bd.ganchos.antes = null;
    assert.equal(alta.status, 401);
    assert.equal(toma.status, 401);
    assert.deepEqual(e.bd.clientes, antes);
  });

  test('los mensajes 400 por parámetros no repiten el nombre enviado', async () => {
    e.bd.users.find((u) => u.id === 4).activo = 1;
    const r = await e.llamar(4, 'GET', '?%3Cscript%3E=1');
    assert.equal(r.status, 400);
    assert.doesNotMatch(r.texto, /script/);
  });
});

describe('B3-12 límite de diez clientes', () => {
  let e;
  before(async () => {
    e = await entorno((b) => {
      b.users.push({ ...b.users.find((u) => u.id === 4), id: 7, name: 'Vendedor Nueve', email: 'nueve@prueba.test' });
      llenarCartera(b, 7, 9);
      b.clientes.push({ id: 40, vendedor_id: null, nombre: 'Disponible Para Lleno', nit: null, telefono: '23232325', correo: null });
    });
  });
  after(() => e.cerrar());

  test('con nueve clientes, el alta → 201 y la cartera llega a diez', async () => {
    assert.equal(cuenta(e.bd, 7), 9);
    const r = await e.llamar(7, 'POST', '', { cuerpo: nuevo({ nit: '10001123', telefono: '30000001' }) });
    assert.equal(r.status, 201);
    assert.equal(cuenta(e.bd, 7), 10);
  });

  test('con diez clientes, otra alta → 409 y la cartera sigue en diez', async () => {
    const antes = copia(e.bd);
    const r = await e.llamar(7, 'POST', '', { cuerpo: nuevo({ nit: '10001492', telefono: '30000002' }) });
    assert.equal(r.status, 409);
    assert.match(r.json.error, /10/);
    assert.equal(cuenta(e.bd, 7), 10);
    assert.deepEqual(e.bd.clientes, antes);
  });

  test('con diez clientes, tomar un disponible → 409 y el cliente sigue disponible', async () => {
    const r = await e.llamar(7, 'POST', '/40/tomar');
    assert.equal(r.status, 409);
    assert.equal(e.bd.clientes.find((c) => c.id === 40).vendedor_id, null);
    assert.equal(cuenta(e.bd, 7), 10);
  });

  test('el conteo se hace dentro de la transacción, tras bloquear la fila del vendedor', async () => {
    e.bd.llamadas.length = 0;
    await e.llamar(7, 'POST', '', { cuerpo: nuevo({ nit: '10001867', telefono: '30000003' }) });
    const tx = e.bd.llamadas.filter((l) => l.transaccion);
    assert.match(tx[0].sql, /^SELECT id FROM users WHERE id = \? AND rol = 'vendedor' AND activo = 1 FOR UPDATE$/);
    assert.deepEqual(tx[0].params, [7]);
    assert.match(tx[1].sql, /COUNT\(\*\) AS n FROM clientes WHERE vendedor_id = \?/);
    assert.ok(!tx.some((l) => /^INSERT/.test(l.sql)), 'no inserta con la cartera llena');
  });
});

describe('B3-13 edición parcial', () => {
  let e;
  before(async () => { e = await entorno(); });
  after(() => e.cerrar());

  test('solo telefono → 200 y los demás campos no cambian', async () => {
    const antes = { ...e.bd.clientes.find((c) => c.id === 10) };
    const r = await e.llamar(4, 'PATCH', '/10', { cuerpo: { telefono: '+502 2468-1357' } });
    assert.equal(r.status, 200);
    assert.deepEqual(r.json, { id: 10, nombre: antes.nombre, nit: antes.nit, telefono: '24681357', correo: antes.correo });
    assert.deepEqual(e.bd.clientes.find((c) => c.id === 10), { ...antes, telefono: '24681357' });
  });

  test('nit a CF, correo vacío lo borra y nombre se recorta', async () => {
    const r = await e.llamar(4, 'PATCH', '/10', { cuerpo: { nit: 'cf', correo: '', nombre: '  Tienda Gamma ' } });
    assert.equal(r.status, 200);
    assert.deepEqual(r.json, { id: 10, nombre: 'Tienda Gamma', nit: 'CF', telefono: '24681357', correo: null });
    assert.equal(e.bd.clientes.find((c) => c.id === 10).nit, null);
  });

  test('valores inválidos → 422 por campo sin cambios', async () => {
    const antes = copia(e.bd);
    const r = await e.llamar(4, 'PATCH', '/10', { cuerpo: { nit: '4521817-1', telefono: '123', nombre: '' } });
    assert.equal(r.status, 422);
    assert.deepEqual(Object.keys(r.json.errores).sort(), ['nit', 'nombre', 'telefono']);
    assert.deepEqual(e.bd.clientes, antes);
  });

  test('cuerpo vacío, sin campos editables o no JSON → 400', async () => {
    for (const opciones of [{ cuerpo: {} }, { cuerpo: { otro: 1 } }, {}, { crudo: '[]' }]) {
      assert.equal((await e.llamar(4, 'PATCH', '/10', opciones)).status, 400, JSON.stringify(opciones));
    }
  });
});

describe('S8 rollback ante un error inesperado', () => {
  let e;
  before(async () => { e = await entorno(); });
  after(() => e.cerrar());

  test('si falla una consulta después del INSERT → 500 sin detalles, rollback y cartera intacta', async () => {
    const antes = copia(e.bd);
    e.bd.fallos.patron = /^SELECT id, nombre, nit, telefono, correo FROM clientes WHERE id = \?$/;
    e.bd.fallos.error = Object.assign(new Error("Access denied for user 'root'@'db'"), { errno: 1105, sqlMessage: 'detalle-secreto' });
    const r = await e.llamar(4, 'POST', '', { cuerpo: nuevo({ telefono: '31313131' }) });
    e.bd.fallos.patron = null;
    assert.equal(r.status, 500);
    assert.deepEqual(r.json, { error: 'Error interno del servidor' });
    assert.doesNotMatch(r.texto, /root|denied|detalle-secreto/);
    assert.deepEqual(e.bd.clientes, antes);
    assert.equal(e.bd.estadisticas.abiertas, 0);
  });

  test('si falla la toma tras asignar → rollback: el cliente sigue disponible', async () => {
    e.bd.fallos.patron = /^SELECT id, nombre, nit, telefono, correo FROM clientes WHERE id = \?$/;
    const r = await e.llamar(4, 'POST', '/13/tomar');
    e.bd.fallos.patron = null;
    assert.equal(r.status, 500);
    assert.equal(e.bd.clientes.find((c) => c.id === 13).vendedor_id, null);
  });
});
