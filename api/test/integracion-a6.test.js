// A6 (Parte A): integración real del resumen mensual con MySQL y VerificacionSeeder.
// Se ejecuta con `npm run test:bd` (o con DB_NAME=crm_belleza_test delante, para incluir A6-06).
// - Se omite si no hay configuración DB_*, si MySQL no responde o si falta la semilla oficial.
// - A6-01 a A6-05 y A6-07 solo LEEN. A6-05 usa a Iván, que ya está desactivado en la semilla.
// - A6-06 gana la op. 4: solo corre contra la base de pruebas restablecible `crm_belleza_test` y la deja
//   como estaba al terminar (después conviene volver a cargar VerificacionSeeder; ver docs/verificacion.md).
// Cifras esperadas: docs/especificacion.md §13.3 y docs/specs/A5-equipos-reportes.md §5.4 (la misma tabla
// de referencia que usa el panel en A5EquiposReportesTest).
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { pool, verificarConexion } from '../src/config/db.js';

async function motivoOmision() {
  if (!process.env.DB_HOST || !process.env.DB_NAME || !process.env.DB_USER) return 'sin variables DB_* (ejecute npm run test:bd)';
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) return 'sin JWT_SECRET válido en .env';
  const estado = await verificarConexion();
  if (!estado.conectado) return `MySQL no disponible (código ${estado.codigo})`;
  const [[{ n }]] = await pool.execute("SELECT COUNT(*) AS n FROM users WHERE email IN ('valeria@crm.test', 'diego@crm.test', 'carlos@crm.test', 'ivan@crm.test')");
  if (Number(n) < 4) return 'VerificacionSeeder no está cargado';
  return false;
}

const omitir = await motivoOmision();
const omitirEscritura = omitir || (process.env.DB_NAME !== 'crm_belleza_test'
  ? 'A6-06 cambia datos: solo corre con DB_NAME=crm_belleza_test (base de pruebas restablecible)'
  : false);

/** Tabla de referencia común con el panel (A5 §5.4). */
const REFERENCIA = [
  { correo: 'valeria@crm.test', mes: '2026-10', ventas: 2, total: 9250, pronostico: 2512.88, clientes: 3 },
  { correo: 'valeria@crm.test', mes: '2026-11', ventas: 1, total: 3600, pronostico: 2512.88, clientes: 3 },
  { correo: 'diego@crm.test', mes: '2026-10', ventas: 1, total: 6000, pronostico: 112.5, clientes: 2 },
  { correo: 'carlos@crm.test', mes: '2026-10', ventas: 1, total: 7200, pronostico: 4125.75, clientes: 9 },
];

let api;
let tokenDe;
let pedir;
before(async () => {
  if (omitir) return;
  const { crearApp } = await import('../src/app.js');
  const { firmarToken } = await import('../src/config/jwt.js');
  const ayuda = await import('./ayuda/bd-simulada.js'); // solo el ayudante HTTP; usa el pool real
  pedir = ayuda.pedir;
  api = await ayuda.levantar(crearApp({ origenPermitido: 'http://127.0.0.1:5500', pool }));
  tokenDe = async (correo) => {
    const [[u]] = await pool.execute('SELECT id FROM users WHERE email = ? LIMIT 1', [correo]);
    return firmarToken(u.id);
  };
});
after(async () => { api?.servidor.close(); await pool.end(); });

const resumenDe = async (correo, consulta = '') => pedir(`${api.url}/api/reportes/resumen${consulta}`, {
  headers: { Authorization: `Bearer ${await tokenDe(correo)}` },
});

describe('A6 integración con la semilla oficial', () => {
  test('A6-01: Valeria, 2026-10 → exactamente el JSON de §8.5, con números', { skip: omitir }, async () => {
    const r = await resumenDe('valeria@crm.test', '?mes=2026-10');
    assert.equal(r.status, 200);
    assert.deepEqual(r.json, { mes: '2026-10', ventas: 2, total: 9250, pronostico: 2512.88, cartera: { clientes: 3, maximo: 10 } });
    assert.equal(typeof r.json.total, 'number');
    assert.equal(typeof r.json.pronostico, 'number');
  });

  test('A6-02: sin mes → el mes actual de Guatemala; mes inválido → 400', { skip: omitir }, async () => {
    const { mesActualGuatemala } = await import('../src/servicios/reportes.js');
    const r = await resumenDe('valeria@crm.test');
    assert.equal(r.status, 200);
    assert.equal(r.json.mes, mesActualGuatemala(new Date()));
    for (const mes of ['2026-13', '2026-1', '26-10', '']) {
      const malo = await resumenDe('valeria@crm.test', `?mes=${mes}`);
      assert.equal(malo.status, 400, mes);
      assert.deepEqual(malo.json, { error: 'El mes debe tener el formato AAAA-MM' });
    }
  });

  test('A6-03: otros meses y vendedores (§13.3); el pronóstico no depende del mes', { skip: omitir }, async () => {
    const cifras = async (correo, mes) => {
      const { json } = await resumenDe(correo, `?mes=${mes}`);
      return [json.ventas, json.total, json.pronostico, json.cartera.clientes];
    };
    assert.deepEqual(await cifras('valeria@crm.test', '2026-11'), [1, 3600, 2512.88, 3]);
    assert.deepEqual(await cifras('diego@crm.test', '2026-10'), [1, 6000, 112.5, 2]);
    assert.deepEqual(await cifras('carlos@crm.test', '2026-10'), [1, 7200, 4125.75, 9]);
    assert.deepEqual(await cifras('valeria@crm.test', '2026-09'), [0, 0, 2512.88, 3]);
  });

  test('A6-04: solo los datos del vendedor del token, sin ids internos', { skip: omitir }, async () => {
    assert.equal((await resumenDe('valeria@crm.test', '?vendedor_id=6')).status, 400);
    assert.equal((await resumenDe('valeria@crm.test', '?mes=2026-10&mes=2026-11')).status, 400);
    const r = await resumenDe('valeria@crm.test', '?mes=2026-10');
    for (const prohibido of ['vendedor_id', '"id"', 'supervisor_id', 'password']) assert.ok(!r.texto.includes(prohibido), prohibido);
  });

  test('A6-05: sin token → 401; Iván (desactivado) con un token firmado → 401', { skip: omitir }, async () => {
    assert.equal((await pedir(`${api.url}/api/reportes/resumen?mes=2026-10`)).status, 401);
    assert.equal((await resumenDe('ivan@crm.test', '?mes=2026-10')).status, 401);
  });

  test('A6-07: paridad con la tabla de referencia del panel (A5 §5.4)', { skip: omitir }, async () => {
    for (const f of REFERENCIA) {
      const r = await resumenDe(f.correo, `?mes=${f.mes}`);
      assert.deepEqual(r.json, { mes: f.mes, ventas: f.ventas, total: f.total, pronostico: f.pronostico, cartera: { clientes: f.clientes, maximo: 10 } },
        `${f.correo} ${f.mes}`);
    }
  });
});

describe('A6-06 · una venta nueva se refleja (CA-16), solo en crm_belleza_test', () => {
  after(async () => {
    if (omitirEscritura) return;
    // Deja la op. 4 como en la semilla: negociación, sin cierre y sin el historial de la venta.
    await pool.execute("DELETE FROM historial_etapas WHERE oportunidad_id = 4 AND etapa_nueva = 'ganada'");
    await pool.execute("UPDATE oportunidades SET etapa = 'negociacion', fecha_cierre = NULL WHERE id = 4");
  });

  test('ganar la op. 4 suma 1 venta y 2750.5 al mes del cierre, y baja el pronóstico a 450', { skip: omitirEscritura }, async () => {
    const { mesActualGuatemala } = await import('../src/servicios/reportes.js');
    const [[op]] = await pool.execute('SELECT etapa FROM oportunidades WHERE id = 4');
    assert.equal(op.etapa, 'negociacion', 'la op. 4 debe estar en negociación (semilla recién cargada)');

    const mes = mesActualGuatemala(new Date());
    const antes = (await resumenDe('valeria@crm.test', `?mes=${mes}`)).json;

    const ganada = await pedir(`${api.url}/api/oportunidades/4/etapa`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${await tokenDe('valeria@crm.test')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ etapa: 'ganada' }),
    });
    assert.equal(ganada.status, 200);
    assert.equal(mesActualGuatemala(new Date(ganada.json.fecha_cierre)), mes, 'el cierre cae en el mes consultado');

    const despues = (await resumenDe('valeria@crm.test', `?mes=${mes}`)).json;
    assert.equal(despues.ventas, antes.ventas + 1);
    assert.equal(Math.round((despues.total - antes.total) * 100), 275050, 'el total sube 2750.50');
    assert.equal(antes.pronostico, 2512.88);
    assert.equal(despues.pronostico, 450);
  });
});
