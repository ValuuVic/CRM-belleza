// B3-C1 y B3-C2: peticiones simultáneas de toma y alta de clientes (R3, S8) con la base simulada.
// La base simulada intercala las consultas, retiene los bloqueos FOR UPDATE hasta commit/rollback
// y revierte solo las escrituras de cada transacción. Estas pruebas verifican la LÓGICA de
// transacciones y bloqueos de la API y el estado final de los datos.
// NO verifican el bloqueo real de InnoDB: eso queda pendiente de I1 (integracion-b3.test.js).
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET = 'secreto_de_prueba_b3_concurrencia_no_usar_40c';

const { crearApp } = await import('../src/app.js');
const { firmarToken } = await import('../src/config/jwt.js');
const { pool: poolReal } = await import('../src/config/db.js');
const { crearBdSimulada, levantar, pedir } = await import('./ayuda/bd-simulada.js');

after(() => poolReal.end()); // el pool real se crea al importar; se cierra sin haber conectado

const VALERIA = 4;
const DIEGO = 5;
const CARLOS = 7;

async function entorno(preparar) {
  const bd = crearBdSimulada();
  bd.users.push({ ...bd.users.find((u) => u.id === VALERIA), id: CARLOS, name: 'Vendedor Carlos (simulado)', email: 'carlos@prueba.test' });
  preparar?.(bd);
  const api = await levantar(crearApp({ origenPermitido: 'http://127.0.0.1:5500', pool: bd.pool }));
  const llamar = (vendedor, metodo, ruta, cuerpo) => pedir(`${api.url}/api/clientes${ruta}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${firmarToken(vendedor)}`, ...(cuerpo ? { 'Content-Type': 'application/json' } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  return { bd, llamar, cerrar: () => api.servidor.close() };
}

function llenarCartera(bd, vendedorId, n) {
  for (let i = 0; i < n; i++) {
    bd.clientes.push({ id: 2000 + i, vendedor_id: vendedorId, nombre: `Cartera ${i}`, nit: null, telefono: `6${String(vendedorId).padStart(2, '0')}${String(i).padStart(5, '0')}`, correo: null });
  }
}

const cuenta = (bd, id) => bd.clientes.filter((c) => c.vendedor_id === id).length;
const contar = (rs, status) => rs.filter((r) => r.status === status).length;
// NIT válidos (módulo 11) para las altas simultáneas.
const NITS = ['10002235', '1000260K', '10002979', '10003347', '10003711'];

describe('B3-C1 dos vendedores toman el mismo cliente', () => {
  test('10 peticiones simultáneas de Valeria y Diego → exactamente 1×200 y 9×409; un solo dueño', async () => {
    const e = await entorno();
    try {
      const antesV = cuenta(e.bd, VALERIA);
      const antesD = cuenta(e.bd, DIEGO);
      const rs = await Promise.all(Array.from({ length: 10 }, (_, i) => e.llamar(i % 2 ? DIEGO : VALERIA, 'POST', '/13/tomar')));

      assert.equal(contar(rs, 200), 1, rs.map((r) => r.status).join(','));
      assert.equal(contar(rs, 409), 9);
      for (const r of rs.filter((x) => x.status === 409)) assert.deepEqual(Object.keys(r.json), ['error']);

      const duenio = e.bd.clientes.find((c) => c.id === 13).vendedor_id;
      assert.ok([VALERIA, DIEGO].includes(duenio));
      assert.equal(cuenta(e.bd, VALERIA) + cuenta(e.bd, DIEGO), antesV + antesD + 1);
      assert.equal(e.bd.clientes.filter((c) => c.id === 13).length, 1);

      // Las peticiones se intercalaron de verdad: hubo transacciones abiertas a la vez.
      assert.equal(e.bd.estadisticas.begin, 10);
      assert.equal(e.bd.estadisticas.commit + e.bd.estadisticas.rollback, 10);
      assert.equal(e.bd.estadisticas.abiertas, 0, 'todas las conexiones se liberan');
      assert.equal(e.bd.bloqueos.size, 0, 'no quedan bloqueos retenidos');
    } finally { e.cerrar(); }
  });

  test('las peticiones se ejecutan intercaladas (la prueba anterior no es secuencial)', async () => {
    const e = await entorno();
    try {
      await Promise.all(Array.from({ length: 6 }, (_, i) => e.llamar(i % 2 ? DIEGO : VALERIA, 'POST', '/13/tomar')));
      const primeraEscritura = e.bd.llamadas.findIndex((l) => /^UPDATE clientes SET vendedor_id/.test(l.sql));
      const bloqueosAntes = e.bd.llamadas.slice(0, primeraEscritura).filter((l) => /FROM users WHERE id = \?.*FOR UPDATE/.test(l.sql)).length;
      assert.ok(bloqueosAntes > 1, 'varias transacciones pidieron su bloqueo antes de la primera asignación');
    } finally { e.cerrar(); }
  });
});

describe('B3-C2 creaciones simultáneas cerca del límite', () => {
  test('Carlos con 9 clientes y 3 altas válidas simultáneas → 1×201, 2×409 por cartera llena; termina con 10', async () => {
    const e = await entorno((bd) => llenarCartera(bd, CARLOS, 9));
    try {
      assert.equal(cuenta(e.bd, CARLOS), 9);
      const rs = await Promise.all([0, 1, 2].map((i) => e.llamar(CARLOS, 'POST', '', {
        nombre: `Alta simultánea ${i}`, nit: NITS[i], telefono: `3100000${i}`,
      })));

      assert.equal(contar(rs, 201), 1, rs.map((r) => r.status).join(','));
      assert.equal(contar(rs, 409), 2);
      for (const r of rs.filter((x) => x.status === 409)) assert.match(r.json.error, /máximo de 10/);
      assert.equal(cuenta(e.bd, CARLOS), 10);

      // El cliente que se confirmó existe una sola vez; los rechazados no dejaron filas.
      const creado = rs.find((r) => r.status === 201).json;
      assert.equal(e.bd.clientes.filter((c) => c.id === creado.id && c.vendedor_id === CARLOS).length, 1);
      assert.equal(e.bd.clientes.filter((c) => /^Alta simultánea/.test(c.nombre)).length, 1);
      assert.equal(e.bd.estadisticas.abiertas, 0);
      assert.equal(e.bd.bloqueos.size, 0);
    } finally { e.cerrar(); }
  });

  test('alta y toma simultáneas con 9 clientes → solo una entra; la cartera termina en 10', async () => {
    const e = await entorno((bd) => {
      llenarCartera(bd, CARLOS, 9);
      bd.clientes.push({ id: 50, vendedor_id: null, nombre: 'Disponible C2', nit: null, telefono: '23230050', correo: null });
    });
    try {
      const rs = await Promise.all([
        e.llamar(CARLOS, 'POST', '', { nombre: 'Alta C2', nit: NITS[3], telefono: '31000010' }),
        e.llamar(CARLOS, 'POST', '/50/tomar'),
        e.llamar(CARLOS, 'POST', '', { nombre: 'Alta C2 bis', nit: NITS[4], telefono: '31000011' }),
      ]);
      assert.equal(rs.filter((r) => r.status === 200 || r.status === 201).length, 1, rs.map((r) => r.status).join(','));
      assert.equal(contar(rs, 409), 2);
      assert.equal(cuenta(e.bd, CARLOS), 10);
    } finally { e.cerrar(); }
  });
});

describe('S8 la base simulada no pierde cambios confirmados', () => {
  test('altas simultáneas de varios vendedores con un duplicado: el rollback no deshace las demás', async () => {
    const e = await entorno();
    try {
      const rs = await Promise.all([
        e.llamar(VALERIA, 'POST', '', { nombre: 'V1', nit: 'CF', telefono: '32000001' }),
        e.llamar(DIEGO, 'POST', '', { nombre: 'D1', nit: 'CF', telefono: '32000002' }),
        e.llamar(CARLOS, 'POST', '', { nombre: 'Duplicado', nit: '4521817-K', telefono: '32000003' }), // NIT de Tienda Beta
        e.llamar(VALERIA, 'POST', '', { nombre: 'V2', nit: 'CF', telefono: '32000004' }),
      ]);
      assert.deepEqual(rs.map((r) => r.status), [201, 201, 409, 201]);
      for (const nombre of ['V1', 'D1', 'V2']) assert.equal(e.bd.clientes.filter((c) => c.nombre === nombre).length, 1, nombre);
      assert.ok(!e.bd.clientes.some((c) => c.nombre === 'Duplicado'));
      assert.equal(cuenta(e.bd, VALERIA), 4);
      assert.equal(cuenta(e.bd, DIEGO), 2);
      assert.equal(cuenta(e.bd, CARLOS), 0);
    } finally { e.cerrar(); }
  });

  test('una toma rechazada por cartera llena no revierte la toma confirmada de otro vendedor', async () => {
    const e = await entorno((bd) => {
      llenarCartera(bd, CARLOS, 10);
      bd.clientes.push({ id: 60, vendedor_id: null, nombre: 'Disputado', nit: null, telefono: '23230060', correo: null });
    });
    try {
      const rs = await Promise.all([e.llamar(CARLOS, 'POST', '/60/tomar'), e.llamar(DIEGO, 'POST', '/60/tomar')]);
      assert.deepEqual(rs.map((r) => r.status), [409, 200]);
      assert.equal(e.bd.clientes.find((c) => c.id === 60).vendedor_id, DIEGO);
      assert.equal(cuenta(e.bd, CARLOS), 10);
    } finally { e.cerrar(); }
  });
});
