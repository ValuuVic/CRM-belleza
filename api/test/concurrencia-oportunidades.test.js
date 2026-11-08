// B4-C1 a B4-C3: cambios de etapa simultáneos, competencia por el stock y atomicidad al ganar.
// La base simulada intercala las consultas, retiene los bloqueos FOR UPDATE hasta commit/rollback
// y revierte solo las escrituras de cada transacción. Estas pruebas verifican la LÓGICA de
// transacciones y bloqueos de la API y el estado final de los datos.
// NO verifican el bloqueo real de InnoDB: eso queda pendiente de I1 (integracion-b4.test.js).
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET = 'secreto_de_prueba_b4_concurrencia_no_usar_40c';

const { crearApp } = await import('../src/app.js');
const { firmarToken } = await import('../src/config/jwt.js');
const { pool: poolReal } = await import('../src/config/db.js');
const { crearBdSimulada, levantar, pedir } = await import('./ayuda/bd-simulada.js');

after(() => poolReal.end());

async function entorno(preparar) {
  const bd = crearBdSimulada();
  preparar?.(bd);
  const api = await levantar(crearApp({ origenPermitido: 'http://127.0.0.1:5500', pool: bd.pool }));
  // vendedor: por defecto la vendedora 4; las ventas que compiten por stock usan vendedores distintos.
  const etapa = (id, cuerpo, vendedor = 4) => pedir(`${api.url}/api/oportunidades/${id}/etapa`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${firmarToken(vendedor)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });
  const pedirComo = (metodo, ruta, cuerpo) => pedir(`${api.url}/api${ruta}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${firmarToken(4)}`, ...(cuerpo ? { 'Content-Type': 'application/json' } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  return { bd, etapa, pedirComo, cerrar: () => api.servidor.close() };
}

/** Vendedor 4 → su cliente 10; vendedor 5 → su cliente 12 (datos de bd-simulada). */
function oportunidad(bd, id, etapa, lineas = [], vendedor = 4) {
  bd.oportunidades.push({ id, cliente_id: vendedor === 5 ? 12 : 10, vendedor_id: vendedor, titulo: `Concurrencia ${id}`, etapa, motivo_perdida: null, fecha_cierre: null });
  lineas.forEach(([producto_id, cantidad], i) => {
    const p = bd.productos.find((x) => x.id === producto_id);
    bd.oportunidad_productos.push({ id: id * 10 + i, oportunidad_id: id, producto_id, cantidad, precio_unitario: p.precio });
  });
}

const historialDe = (bd, id) => bd.historial_etapas.filter((h) => h.oportunidad_id === id);
const stock = (bd, id) => bd.productos.find((p) => p.id === id).stock;
const contar = (rs, s) => rs.filter((r) => r.status === s).length;

describe('B4-C1 dos cambios simultáneos de etapa', () => {
  test('10 peticiones prospecto → calificado: 1×200 y 9×409; un solo evento de historial', async () => {
    const e = await entorno((bd) => oportunidad(bd, 700, 'prospecto'));
    try {
      const rs = await Promise.all(Array.from({ length: 10 }, () => e.etapa(700, { etapa: 'calificado' })));
      assert.equal(contar(rs, 200), 1, rs.map((r) => r.status).join(','));
      assert.equal(contar(rs, 409), 9);
      assert.equal(e.bd.oportunidades.find((o) => o.id === 700).etapa, 'calificado');
      assert.equal(historialDe(e.bd, 700).length, 1);
      assert.equal(e.bd.estadisticas.abiertas, 0);
      assert.equal(e.bd.bloqueos.size, 0);
    } finally { e.cerrar(); }
  });

  test('ganar y perder a la vez: solo una cierra la oportunidad; un evento y un único descuento', async () => {
    const e = await entorno((bd) => {
      bd.productos.push({ id: 70, nombre: 'Corrector', precio: 55, activo: 1, stock: 10 });
      oportunidad(bd, 701, 'negociacion', [[70, 4]]);
    });
    try {
      const rs = await Promise.all([
        e.etapa(701, { etapa: 'ganada' }), e.etapa(701, { etapa: 'perdida', motivo_perdida: 'Cancelado por el cliente' }),
        e.etapa(701, { etapa: 'ganada' }), e.etapa(701, { etapa: 'perdida', motivo_perdida: 'Otro' }),
      ]);
      assert.equal(contar(rs, 200), 1, rs.map((r) => r.status).join(','));
      assert.equal(contar(rs, 409), 3);
      const final = e.bd.oportunidades.find((o) => o.id === 701).etapa;
      assert.equal(historialDe(e.bd, 701).length, 1);
      assert.equal(stock(e.bd, 70), final === 'ganada' ? 6 : 10, 'el stock se descuenta como mucho una vez');
    } finally { e.cerrar(); }
  });

  test('las peticiones se intercalan de verdad (la prueba no es secuencial)', async () => {
    const e = await entorno((bd) => oportunidad(bd, 702, 'prospecto'));
    try {
      await Promise.all(Array.from({ length: 5 }, () => e.etapa(702, { etapa: 'calificado' })));
      const primeraEscritura = e.bd.llamadas.findIndex((l) => /^UPDATE oportunidades SET etapa/.test(l.sql));
      // Cada transacción empieza pidiendo el bloqueo del vendedor (orden global de bloqueos).
      const bloqueosAntes = e.bd.llamadas.slice(0, primeraEscritura).filter((l) => /FROM users WHERE id = \?.*FOR UPDATE/.test(l.sql)).length;
      assert.ok(bloqueosAntes > 1, 'varias transacciones pidieron el bloqueo antes de la primera escritura');
    } finally { e.cerrar(); }
  });
});

describe('B4-C2 dos ventas compiten por el mismo stock', () => {
  test('dos vendedores ganan a la vez por la última unidad: 1×200, 1×409 y stock 0 (nunca negativo)', async () => {
    const e = await entorno((bd) => {
      bd.productos.push({ id: 71, nombre: 'Última unidad', precio: 300, activo: 1, stock: 1 });
      oportunidad(bd, 710, 'negociacion', [[71, 1]], 4);
      oportunidad(bd, 711, 'negociacion', [[71, 1]], 5); // otro vendedor: compiten solo por el producto
    });
    try {
      const rs = await Promise.all([e.etapa(710, { etapa: 'ganada' }, 4), e.etapa(711, { etapa: 'ganada' }, 5)]);
      assert.deepEqual(rs.map((r) => r.status).sort(), [200, 409]);
      assert.match(rs.find((r) => r.status === 409).json.error, /Stock insuficiente/);
      assert.equal(stock(e.bd, 71), 0);
      const etapas = [710, 711].map((id) => e.bd.oportunidades.find((o) => o.id === id).etapa).sort();
      assert.deepEqual(etapas, ['ganada', 'negociacion']);
      assert.equal(historialDe(e.bd, 710).length + historialDe(e.bd, 711).length, 1);
    } finally { e.cerrar(); }
  });

  test('ocho ventas de dos vendedores, 2 unidades cada una, sobre stock 7: solo 3 ganan y quedan 1; el stock nunca es negativo', async () => {
    const e = await entorno((bd) => {
      bd.productos.push({ id: 72, nombre: 'Muy pedido', precio: 20, activo: 1, stock: 7 });
      for (let i = 0; i < 8; i++) oportunidad(bd, 720 + i, 'negociacion', [[72, 2]], i % 2 ? 5 : 4);
    });
    try {
      let minimo = Infinity;
      e.bd.ganchos.antes = () => { minimo = Math.min(minimo, stock(e.bd, 72)); };
      const rs = await Promise.all(Array.from({ length: 8 }, (_, i) => e.etapa(720 + i, { etapa: 'ganada' }, i % 2 ? 5 : 4)));
      e.bd.ganchos.antes = null;
      assert.equal(contar(rs, 200), 3, rs.map((r) => r.status).join(','));
      assert.equal(contar(rs, 409), 5);
      assert.equal(stock(e.bd, 72), 1);
      assert.ok(minimo >= 0);
    } finally { e.cerrar(); }
  });

  test('dos vendedores con productos compartidos en orden distinto: sin interbloqueo y sin vender de más', async () => {
    const e = await entorno((bd) => {
      bd.productos.push({ id: 73, nombre: 'A', precio: 10, activo: 1, stock: 1 });
      bd.productos.push({ id: 74, nombre: 'B', precio: 10, activo: 1, stock: 1 });
      oportunidad(bd, 730, 'negociacion', [[73, 1], [74, 1]], 4);
      oportunidad(bd, 731, 'negociacion', [[74, 1], [73, 1]], 5);
    });
    try {
      const rs = await Promise.race([
        Promise.all([e.etapa(730, { etapa: 'ganada' }, 4), e.etapa(731, { etapa: 'ganada' }, 5)]),
        new Promise((_, rechazar) => setTimeout(() => rechazar(new Error('interbloqueo: las peticiones no terminaron')), 5000)),
      ]);
      assert.deepEqual(rs.map((r) => r.status).sort(), [200, 409]);
      assert.deepEqual([stock(e.bd, 73), stock(e.bd, 74)], [0, 0]);
    } finally { e.cerrar(); }
  });

  test('editar una línea mientras otra petición gana: el resultado es coherente con el stock', async () => {
    const e = await entorno((bd) => {
      bd.productos.push({ id: 75, nombre: 'Editable', precio: 10, activo: 1, stock: 3 });
      oportunidad(bd, 750, 'negociacion', [[75, 2]]);
    });
    try {
      const [edicion, ganar] = await Promise.all([
        e.pedirComo('PATCH', '/oportunidades/750/productos/7500', { cantidad: 5 }),
        e.etapa(750, { etapa: 'ganada' }),
      ]);
      const linea = e.bd.oportunidad_productos.find((l) => l.id === 7500);
      if (ganar.status === 200) {
        // Si ganó primero, la edición posterior ve la oportunidad cerrada.
        assert.equal(edicion.status, 409);
        assert.equal(linea.cantidad, 2);
        assert.equal(stock(e.bd, 75), 1);
      } else {
        // Si la edición fue primero, ganar pide 5 con stock 3 → 409 y no descuenta.
        assert.equal(edicion.status, 200);
        assert.equal(ganar.status, 409);
        assert.equal(stock(e.bd, 75), 3);
      }
    } finally { e.cerrar(); }
  });
});

describe('B4-C3 atomicidad al ganar', () => {
  test('varios productos y uno sin stock suficiente: nada se descuenta, no se cierra ni hay historial', async () => {
    const e = await entorno((bd) => {
      bd.productos.push({ id: 80, nombre: 'Suficiente', precio: 10, activo: 1, stock: 10 });
      bd.productos.push({ id: 81, nombre: 'Escaso', precio: 10, activo: 1, stock: 1 });
      bd.productos.push({ id: 82, nombre: 'También suficiente', precio: 10, activo: 1, stock: 10 });
      oportunidad(bd, 800, 'negociacion', [[80, 5], [81, 2], [82, 5]]);
    });
    try {
      const r = await e.etapa(800, { etapa: 'ganada' });
      assert.equal(r.status, 409);
      assert.deepEqual([stock(e.bd, 80), stock(e.bd, 81), stock(e.bd, 82)], [10, 1, 10]);
      assert.equal(e.bd.oportunidades.find((o) => o.id === 800).etapa, 'negociacion');
      assert.equal(historialDe(e.bd, 800).length, 0);
      assert.ok(!e.bd.llamadas.some((l) => /^UPDATE productos/.test(l.sql)), 'no escribe nada antes de verificar todas las líneas');
    } finally { e.cerrar(); }
  });

  test('fallo después del primer descuento → 500 sin detalles y rollback completo', async () => {
    const e = await entorno((bd) => {
      bd.productos.push({ id: 83, nombre: 'Primero', precio: 10, activo: 1, stock: 10 });
      bd.productos.push({ id: 84, nombre: 'Segundo', precio: 10, activo: 1, stock: 10 });
      oportunidad(bd, 810, 'negociacion', [[83, 2], [84, 3]]);
    });
    try {
      let descuentos = 0;
      e.bd.ganchos.antes = (sql) => {
        if (/^UPDATE productos/.test(sql) && ++descuentos === 2) throw Object.assign(new Error('Lost connection'), { errno: 2013 });
      };
      const r = await e.etapa(810, { etapa: 'ganada' });
      e.bd.ganchos.antes = null;
      assert.equal(r.status, 500);
      assert.deepEqual(r.json, { error: 'Error interno del servidor' });
      assert.deepEqual([stock(e.bd, 83), stock(e.bd, 84)], [10, 10]);
      assert.equal(e.bd.oportunidades.find((o) => o.id === 810).etapa, 'negociacion');
      assert.equal(historialDe(e.bd, 810).length, 0);
      assert.equal(e.bd.estadisticas.rollback, 1);
    } finally { e.cerrar(); }
  });

  test('fallo al registrar el historial → rollback del descuento y de la etapa', async () => {
    const e = await entorno((bd) => {
      bd.productos.push({ id: 85, nombre: 'Con historial', precio: 10, activo: 1, stock: 4 });
      oportunidad(bd, 820, 'negociacion', [[85, 4]]);
    });
    try {
      e.bd.fallos.patron = /^INSERT INTO historial_etapas/;
      const r = await e.etapa(820, { etapa: 'ganada' });
      e.bd.fallos.patron = null;
      assert.equal(r.status, 500);
      assert.equal(stock(e.bd, 85), 4);
      const o = e.bd.oportunidades.find((x) => x.id === 820);
      assert.deepEqual([o.etapa, o.fecha_cierre], ['negociacion', null]);
    } finally { e.cerrar(); }
  });
});
