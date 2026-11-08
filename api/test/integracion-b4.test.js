// Integración real de B4 con MySQL y VerificacionSeeder (dependencia I1 de la Parte A).
// Se ejecuta con `npm run test:bd`.
// - Se omite si no hay configuración DB_*, si MySQL no responde o si faltan las tablas de la Parte A.
// - Aquí solo hay pruebas de LECTURA: no alteran los datos oficiales de verificación.
// - Las pruebas que modifican datos (crear, líneas, etapas, stock, concurrencia real de InnoDB) y la
//   integración I3 con los reportes del panel quedan como `todo` hasta disponer de una base de
//   pruebas restablecible acordada con la Parte A.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { pool, verificarConexion } from '../src/config/db.js';

const COLUMNAS = {
  productos: ['id', 'nombre', 'precio', 'activo', 'stock'],
  oportunidades: ['id', 'cliente_id', 'vendedor_id', 'titulo', 'etapa', 'motivo_perdida', 'fecha_cierre', 'created_at', 'updated_at'],
  oportunidad_productos: ['id', 'oportunidad_id', 'producto_id', 'cantidad', 'precio_unitario', 'created_at', 'updated_at'],
  historial_etapas: ['id', 'oportunidad_id', 'usuario_id', 'etapa_anterior', 'etapa_nueva', 'created_at'],
};

async function motivoOmision() {
  if (!process.env.DB_HOST || !process.env.DB_NAME || !process.env.DB_USER) return 'sin variables DB_* (ejecute npm run test:bd)';
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) return 'sin JWT_SECRET válido';
  const estado = await verificarConexion();
  if (!estado.conectado) return `MySQL no disponible (código ${estado.codigo})`;
  const [tablas] = await pool.execute(
    `SELECT TABLE_NAME AS tabla FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME IN ('productos', 'oportunidades', 'oportunidad_productos', 'historial_etapas')`,
  );
  if (tablas.length < 4) return 'I1 pendiente: faltan tablas de oportunidades (migraciones de la Parte A)';
  const [[{ n }]] = await pool.execute("SELECT COUNT(*) AS n FROM users WHERE email = 'valeria@crm.test'");
  if (n === 0) return 'I1 pendiente: VerificacionSeeder no está cargado (no existe valeria@crm.test)';
  return false;
}

const omitir = await motivoOmision();

let api;
let pedirComo;
before(async () => {
  if (omitir) return;
  const { crearApp } = await import('../src/app.js');
  const { firmarToken } = await import('../src/config/jwt.js');
  const { levantar, pedir } = await import('./ayuda/bd-simulada.js'); // solo los ayudantes HTTP; usa el pool real
  api = await levantar(crearApp({ origenPermitido: 'http://127.0.0.1:5500', pool }));
  pedirComo = async (correo, ruta) => {
    const [[u]] = await pool.execute('SELECT id FROM users WHERE email = ? LIMIT 1', [correo]);
    return pedir(`${api.url}/api${ruta}`, { headers: { Authorization: `Bearer ${firmarToken(u.id)}` } });
  };
});
after(async () => { api?.servidor.close(); await pool.end(); });

describe('B4 integración con el esquema y la semilla oficial (I1)', () => {
  test('las columnas que usa la API existen en las cuatro tablas', { skip: omitir }, async () => {
    for (const [tabla, columnas] of Object.entries(COLUMNAS)) {
      const [filas] = await pool.execute(
        'SELECT COLUMN_NAME AS columna FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
        [tabla],
      );
      const reales = filas.map((f) => f.columna);
      for (const c of columnas) assert.ok(reales.includes(c), `${tabla}.${c}`);
    }
  });

  test('índice único (oportunidad_id, producto_id) para rechazar productos repetidos (B4-08)', { skip: omitir }, async () => {
    const [filas] = await pool.execute(
      `SELECT INDEX_NAME AS indice, COLUMN_NAME AS columna FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'oportunidad_productos' AND NON_UNIQUE = 0 AND INDEX_NAME <> 'PRIMARY'`,
    );
    const porIndice = {};
    for (const f of filas) (porIndice[f.indice] ??= []).push(f.columna);
    assert.ok(Object.values(porIndice).some((cols) => cols.includes('oportunidad_id') && cols.includes('producto_id')));
  });

  test('B4-01: GET /api/productos con el token de Valeria → solo productos activos', { skip: omitir }, async () => {
    const r = await pedirComo('valeria@crm.test', '/productos');
    assert.equal(r.status, 200);
    const [[{ n }]] = await pool.execute('SELECT COUNT(*) AS n FROM productos WHERE activo = 1');
    assert.equal(r.json.length, n);
    for (const p of r.json) assert.deepEqual(Object.keys(p), ['id', 'nombre', 'precio', 'stock']);
  });

  test('B4-02: GET /api/oportunidades → solo las de Valeria, con totales numéricos', { skip: omitir }, async () => {
    const r = await pedirComo('valeria@crm.test', '/oportunidades');
    assert.equal(r.status, 200);
    const [[{ id }]] = await pool.execute("SELECT id FROM users WHERE email = 'valeria@crm.test'");
    const [[{ n }]] = await pool.execute('SELECT COUNT(*) AS n FROM oportunidades WHERE vendedor_id = ?', [id]);
    assert.equal(r.json.length, n);
    for (const o of r.json) assert.equal(typeof o.total, 'number');
  });

  test('B4-03: Valeria consulta una oportunidad de otro vendedor → 404', { skip: omitir }, async () => {
    const [[ajena]] = await pool.execute(
      "SELECT o.id FROM oportunidades o JOIN users u ON u.id = o.vendedor_id WHERE u.email <> 'valeria@crm.test' LIMIT 1",
    );
    assert.ok(ajena, 'la semilla debe tener oportunidades de otros vendedores');
    assert.equal((await pedirComo('valeria@crm.test', `/oportunidades/${ajena.id}`)).status, 404);
  });

  // Requieren una base de pruebas restablecible (modifican datos):
  test.todo('B4-04: crear oportunidad → prospecto con historial inicial en MySQL');
  test.todo('B4-06 a B4-10: agregar, editar y quitar líneas con precio copiado del catálogo real');
  test.todo('B4-12 a B4-15: transiciones válidas, inválidas, perdida con motivo y ganar sin productos');
  test.todo('B4-16 a B4-18: stock insuficiente (409), descuento y stock NULL contra el CHECK real');
  test.todo('B4-C1: transiciones simultáneas con bloqueos reales de InnoDB');
  test.todo('B4-C2: dos ventas por la última unidad con InnoDB real; stock nunca negativo');
  test.todo('B4-C3: rollback completo de stock, etapa e historial en MySQL');
  test.todo('I3: venta ganada desde la SPA reflejada en el reporte mensual del panel (Parte A)');
});
