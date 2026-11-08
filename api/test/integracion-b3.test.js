// Integración real de B3 con MySQL y VerificacionSeeder (dependencia I1 de la Parte A).
// Se ejecuta con `npm run test:bd`.
// - Se omite si no hay configuración DB_*, si MySQL no responde o si faltan las tablas, columnas
//   o la semilla que crea la Parte A.
// - Aquí solo hay pruebas de LECTURA: no alteran los datos oficiales de verificación.
// - Las pruebas que modifican datos (altas, ediciones, tomas, duplicados, límite y concurrencia
//   real de InnoDB) quedan como `todo` hasta disponer de una base de pruebas restablecible
//   acordada con la Parte A. Las cifras esperadas salen de docs/especificacion.md §13.3 y
//   docs/specs/B3-clientes.md y la semilla del enunciado §11 (Valeria 3/10, Carlos 9/10, seis clientes disponibles).
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { pool, verificarConexion } from '../src/config/db.js';

async function motivoOmision() {
  if (!process.env.DB_HOST || !process.env.DB_NAME || !process.env.DB_USER) return 'sin variables DB_* (ejecute npm run test:bd)';
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) return 'sin JWT_SECRET válido en .env';
  const estado = await verificarConexion();
  if (!estado.conectado) return `MySQL no disponible (código ${estado.codigo})`;
  const [columnas] = await pool.execute(
    `SELECT COLUMN_NAME AS columna FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'clientes'
        AND COLUMN_NAME IN ('id', 'vendedor_id', 'nombre', 'nit', 'telefono', 'correo')`,
  );
  if (columnas.length < 6) return 'I1 pendiente: falta la tabla clientes con sus columnas (migraciones de la Parte A)';
  const [[{ n }]] = await pool.execute("SELECT COUNT(*) AS n FROM users WHERE email = 'valeria@crm.test'");
  if (n === 0) return 'I1 pendiente: VerificacionSeeder no está cargado (no existe valeria@crm.test)';
  return false;
}

const omitir = await motivoOmision();

let api;
let tokenDe;
before(async () => {
  if (omitir) return;
  const { crearApp } = await import('../src/app.js');
  const { firmarToken } = await import('../src/config/jwt.js');
  const { levantar } = await import('./ayuda/bd-simulada.js'); // solo el ayudante HTTP; usa el pool real
  api = await levantar(crearApp({ origenPermitido: 'http://127.0.0.1:5500', pool }));
  tokenDe = async (correo) => {
    const [[u]] = await pool.execute('SELECT id FROM users WHERE email = ? LIMIT 1', [correo]);
    return firmarToken(u.id);
  };
});
after(async () => { api?.servidor.close(); await pool.end(); });

const pedirComo = async (correo, ruta) => {
  const { pedir } = await import('./ayuda/bd-simulada.js');
  return pedir(`${api.url}/api/clientes${ruta}`, { headers: { Authorization: `Bearer ${await tokenDe(correo)}` } });
};

describe('B3 integración con la semilla oficial (I1)', () => {
  test('el esquema tiene índices únicos sobre clientes.nit y clientes.telefono', { skip: omitir }, async () => {
    const [indices] = await pool.execute(
      `SELECT COLUMN_NAME AS columna FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'clientes' AND NON_UNIQUE = 0
          AND COLUMN_NAME IN ('nit', 'telefono')`,
    );
    assert.deepEqual(indices.map((i) => i.columna).sort(), ['nit', 'telefono']);
  });

  test('B3-01: GET /api/clientes con el token de Valeria → sus 3 clientes', { skip: omitir }, async () => {
    const r = await pedirComo('valeria@crm.test', '');
    assert.equal(r.status, 200);
    assert.equal(r.json.length, 3);
    for (const c of r.json) assert.deepEqual(Object.keys(c), ['id', 'nombre', 'nit', 'telefono', 'correo']);
  });

  test('B3-04: GET /api/clientes/disponibles → los 6 clientes disponibles, solo { id, nombre }', { skip: omitir }, async () => {
    const r = await pedirComo('valeria@crm.test', '/disponibles');
    assert.equal(r.status, 200);
    assert.equal(r.json.length, 6);
    for (const c of r.json) assert.deepEqual(Object.keys(c), ['id', 'nombre']);
  });

  // No se asume el correo de Diego (no figura en la especificación): se usa un cliente asignado
  // a cualquier vendedor distinto de Valeria. Con VerificacionSeeder, Diego tiene 2 (§13.3).
  test('B3-05: Valeria consulta un cliente de otro vendedor → 404', { skip: omitir }, async () => {
    const [[cliente]] = await pool.execute(
      "SELECT c.id FROM clientes c JOIN users u ON u.id = c.vendedor_id WHERE u.email <> 'valeria@crm.test' LIMIT 1",
    );
    assert.ok(cliente, 'la semilla debe tener clientes asignados a otros vendedores');
    assert.equal((await pedirComo('valeria@crm.test', `/${cliente.id}`)).status, 404);
  });

  test('B3-02: los clientes con NIT NULL se devuelven como "CF"', { skip: omitir }, async () => {
    const [filas] = await pool.execute('SELECT id, vendedor_id FROM clientes WHERE nit IS NULL AND vendedor_id IS NOT NULL LIMIT 1');
    if (!filas[0]) return; // la semilla puede no tener clientes CF asignados
    const [[u]] = await pool.execute('SELECT email FROM users WHERE id = ?', [filas[0].vendedor_id]);
    const r = await pedirComo(u.email, `/${filas[0].id}`);
    assert.equal(r.json.nit, 'CF');
  });

  // Requieren una base de pruebas restablecible (modifican datos):
  test.todo('B3-08: NIT duplicado en formato equivalente → 409 por el índice único real');
  test.todo('B3-09: alta con nit "cf" y telefono "+502 5555 1234" → 201, NIT NULL en MySQL');
  test.todo('B3-11: Valeria toma un cliente disponible → 200; Diego lo intenta después → 409');
  test.todo('B3-12: Carlos (9 clientes) registra uno → 201 (10); otro → 409 y sigue en 10');
  test.todo('B3-13: PATCH solo telefono sobre un cliente propio → solo cambia ese campo en MySQL');
  test.todo('B3-C1: 10 tomas simultáneas de Valeria y Diego → 1×200, 9×409, un solo dueño (InnoDB real)');
  test.todo('B3-C2: Carlos con 9 y 3 altas simultáneas → 1×201, 2×409, termina con 10 (InnoDB real)');
});
