// A6 (Parte A): resumen mensual sin base de datos (docs/specs/A6-resumen.md).
// Mes (DA6-1, DA6-2) con el reloj fijado, SQL fijo alineado con embudo.js, contrato de la ruta
// (400, 401, D6) y A6-08 con un pool que falla. Se ejecuta con `npm test`.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

process.env.JWT_SECRET = 'secreto_de_prueba_a6_resumen_no_usar_0123456';

const { crearRutasReportes } = await import('../src/rutas/reportes.js');
const { crearApp } = await import('../src/app.js');
const { rutaNoEncontrada, manejadorErrores } = await import('../src/middleware/errores.js');
const { firmarToken } = await import('../src/config/jwt.js');
const { ETAPAS_ABIERTAS, PROBABILIDAD } = await import('../src/servicios/embudo.js');
const reportes = await import('../src/servicios/reportes.js');
const { levantar, pedir } = await import('./ayuda/bd-simulada.js');

const USUARIOS = {
  1: { id: 1, nombre: 'Alicia', correo: 'admin@crm.test', rol: 'administrador', activo: 1 },
  4: { id: 4, nombre: 'Valeria', correo: 'valeria@crm.test', rol: 'vendedor', activo: 1 },
  7: { id: 7, nombre: 'Iván', correo: 'ivan@crm.test', rol: 'vendedor', activo: 0 },
};

/** Pool mínimo: el usuario del middleware y la sentencia del resumen. `falla` simula un error de MySQL. */
function poolSimulado({ falla = false } = {}) {
  const consultas = [];
  return {
    consultas,
    async execute(sql, params) {
      consultas.push({ sql, params });
      if (/FROM users WHERE id = \?/.test(sql)) return [USUARIOS[params[0]] ? [USUARIOS[params[0]]] : []];
      if (sql === reportes.SQL_RESUMEN) {
        if (falla) {
          const error = new Error("Unknown column 'o.etapa' in 'where clause' (SELECT … FROM oportunidades o)");
          Object.assign(error, { errno: 1054, code: 'ER_BAD_FIELD_ERROR', sql, sqlMessage: 'detalle interno' });
          throw error;
        }
        return [[{ ventas: 2, total: 9250, pronostico: 2512.88, clientes: 3 }]];
      }
      throw new Error(`consulta inesperada: ${sql}`);
    },
  };
}

/** App con solo /api/reportes y el manejo de errores de la Parte B; el reloj se fija en la prueba. */
async function levantarReportes(pool, reloj) {
  const app = express();
  app.use('/api/reportes', crearRutasReportes({ pool, reloj }));
  app.use(rutaNoEncontrada);
  app.use(manejadorErrores);
  return levantar(app);
}

const RELOJ_31_OCT_GT = () => new Date('2026-11-01T03:30:00Z'); // 31 de octubre, 21:30 en Guatemala
const con = (id) => ({ headers: { Authorization: `Bearer ${firmarToken(id)}` } });

describe('A6 · mes de Guatemala (DA6-1, DA6-2)', () => {
  test('mesValido: AAAA-MM con mes 01-12 y año 1000-9999', () => {
    for (const v of ['2026-10', '2026-01', '2026-12', '1000-01', '9999-12']) assert.equal(reportes.mesValido(v), true, v);
    for (const v of ['2026-13', '2026-00', '2026-1', '26-10', '0999-01', '2026-10-01', '', ' 2026-10', 'octubre', undefined, null, ['2026-10']]) {
      assert.equal(reportes.mesValido(v), false, JSON.stringify(v));
    }
  });

  test('rangoMes: [día 1 06:00 UTC, día 1 del mes siguiente 06:00 UTC), también en diciembre', () => {
    assert.deepEqual(reportes.rangoMes('2026-10'), ['2026-10-01 06:00:00', '2026-11-01 06:00:00']);
    assert.deepEqual(reportes.rangoMes('2026-12'), ['2026-12-01 06:00:00', '2027-01-01 06:00:00']);
    assert.deepEqual(reportes.rangoMes('2027-02'), ['2027-02-01 06:00:00', '2027-03-01 06:00:00']);
  });

  test('mesActualGuatemala con el reloj fijado (UTC−6, sin depender de la zona del proceso)', () => {
    assert.equal(reportes.mesActualGuatemala(new Date('2026-11-01T03:30:00Z')), '2026-10');
    assert.equal(reportes.mesActualGuatemala(new Date('2026-11-01T05:59:59Z')), '2026-10');
    assert.equal(reportes.mesActualGuatemala(new Date('2026-11-01T06:00:00Z')), '2026-11');
    assert.equal(reportes.mesActualGuatemala(new Date('2027-01-01T05:00:00Z')), '2026-12');
  });
});

describe('A6 · SQL fijo, alineado con embudo.js (DA6-4)', () => {
  test('el CASE de probabilidad y las etapas abiertas coinciden con PROBABILIDAD y ETAPAS_ABIERTAS', () => {
    const esperado = `CASE o.etapa ${ETAPAS_ABIERTAS.map((e) => `WHEN '${e}' THEN ${PROBABILIDAD[e]}`).join(' ')} END`;
    assert.equal(reportes.SQL_PROBABILIDAD, esperado);
    assert.equal(reportes.SQL_ETAPAS_ABIERTAS, ETAPAS_ABIERTAS.map((e) => `'${e}'`).join(', '));
    assert.ok(reportes.SQL_RESUMEN.includes(reportes.SQL_PROBABILIDAD), 'la sentencia usa ese CASE');
    assert.ok(reportes.SQL_RESUMEN.includes(`o.etapa IN (${reportes.SQL_ETAPAS_ABIERTAS})`), 'y esas etapas');
  });

  test('una sola sentencia con 8 parámetros y redondeo después de sumar', () => {
    assert.equal((reportes.SQL_RESUMEN.match(/\?/g) ?? []).length, 8);
    assert.match(reportes.SQL_RESUMEN, /ROUND\(COALESCE\(SUM\(l\.cantidad \* l\.precio_unitario\), 0\), 2\)/);
    assert.match(reportes.SQL_RESUMEN, /ROUND\(COALESCE\(SUM\(l\.cantidad \* l\.precio_unitario \* CASE/);
  });
});

describe('A6 · GET /api/reportes/resumen con pool simulado', () => {
  let api;
  let pool;
  before(async () => {
    pool = poolSimulado();
    api = await levantarReportes(pool, RELOJ_31_OCT_GT);
  });
  after(() => api.servidor.close());
  const resumen = (consulta = '', opciones = con(4)) => pedir(`${api.url}/api/reportes/resumen${consulta}`, opciones);

  test('A6-01 (forma): 200 con exactamente { mes, ventas, total, pronostico, cartera } y números', async () => {
    const r = await resumen('?mes=2026-10');
    assert.equal(r.status, 200);
    assert.deepEqual(r.json, { mes: '2026-10', ventas: 2, total: 9250, pronostico: 2512.88, cartera: { clientes: 3, maximo: 10 } });
    assert.deepEqual(Object.keys(r.json), ['mes', 'ventas', 'total', 'pronostico', 'cartera']);
    for (const campo of ['ventas', 'total', 'pronostico']) assert.equal(typeof r.json[campo], 'number', campo);
    assert.match(r.texto, /"total":9250,/, 'el total viaja como número, no como "9250.00"');
  });

  test('el rango y el vendedor (del token) llegan como parámetros', async () => {
    pool.consultas.length = 0;
    await resumen('?mes=2026-10');
    const consulta = pool.consultas.find((c) => c.sql === reportes.SQL_RESUMEN);
    assert.deepEqual(consulta.params, ['2026-10-01 06:00:00', '2026-11-01 06:00:00', 4, '2026-10-01 06:00:00', '2026-11-01 06:00:00', 4, 4, 4]);
  });

  test('A6-02: sin mes, el mes actual de Guatemala (reloj en 2026-11-01 03:30 UTC → 2026-10)', async () => {
    const r = await resumen();
    assert.equal(r.status, 200);
    assert.equal(r.json.mes, '2026-10');
  });

  test('A6-02: mes inválido o vacío → 400 con el mensaje de DA6-1', async () => {
    for (const mes of ['2026-13', '2026-1', '26-10', '', 'octubre', '2026-10-01']) {
      const r = await resumen(`?mes=${encodeURIComponent(mes)}`);
      assert.equal(r.status, 400, mes);
      assert.deepEqual(r.json, { error: 'El mes debe tener el formato AAAA-MM' }, mes);
    }
  });

  test('A6-04 / D6: parámetro desconocido, vendedor en la consulta o mes repetido → 400', async () => {
    for (const consulta of ['?vendedor_id=6', '?mes=2026-10&vendedor_id=6', '?mes=2026-10&mes=2026-11', '?otro=1']) {
      const r = await resumen(consulta);
      assert.equal(r.status, 400, consulta);
      assert.equal(typeof r.json.error, 'string');
    }
  });

  test('A6-05: sin token, token inválido, vendedor desactivado o administrador → 401', async () => {
    assert.equal((await resumen('?mes=2026-10', {})).status, 401);
    assert.equal((await resumen('?mes=2026-10', { headers: { Authorization: 'Bearer a.b.c' } })).status, 401);
    assert.equal((await resumen('?mes=2026-10', con(7))).status, 401, 'Iván está desactivado');
    assert.equal((await resumen('?mes=2026-10', con(1))).status, 401, 'la API es solo para vendedores');
  });
});

describe('A6-08 · error de la base de datos sin detalles internos', () => {
  test('el pool falla en el resumen → 500 con el mensaje genérico, sin SQL ni pila', async () => {
    const api = await levantarReportes(poolSimulado({ falla: true }), RELOJ_31_OCT_GT);
    const errorOriginal = console.error;
    console.error = () => {}; // el manejador registra el error en el servidor; aquí no hace falta verlo
    try {
      const r = await pedir(`${api.url}/api/reportes/resumen?mes=2026-10`, con(4));
      assert.equal(r.status, 500);
      assert.deepEqual(r.json, { error: 'Error interno del servidor' });
      for (const filtrado of ['SELECT', 'oportunidades', 'ER_', 'Unknown column', 'detalle interno', 'at ']) {
        assert.ok(!r.texto.includes(filtrado), `no debe incluir ${filtrado}`);
      }
    } finally {
      console.error = errorOriginal;
      api.servidor.close();
    }
  });
});

describe('A6 · montaje en app.js', () => {
  test('crearApp monta /api/reportes (sin token → 401, no 404)', async () => {
    const api = await levantar(crearApp({ origenPermitido: 'http://127.0.0.1:5500', pool: poolSimulado() }));
    try {
      assert.equal((await pedir(`${api.url}/api/reportes/resumen?mes=2026-10`)).status, 401);
      assert.equal((await pedir(`${api.url}/api/reportes/resumen?mes=2026-10`, con(4))).status, 200);
    } finally {
      api.servidor.close();
    }
  });
});
