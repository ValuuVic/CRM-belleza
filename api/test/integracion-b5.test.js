// Integración real de B5 con MySQL y VerificacionSeeder (dependencia I1 de la Parte A).
// Se ejecuta con `npm run test:bd`. ESTADO: PENDIENTE hasta que exista I1.
// - Se omite si no hay configuración DB_*, si MySQL no responde, si falta la tabla `actividades`
//   o si VerificacionSeeder no está cargado. Una prueba omitida NO cuenta como aprobada.
// - Las 4 actividades oficiales salen de la tabla «Actividades» de la sección 11 del enunciado
//   (Proyecto_Final_CRM_Enunciado, página 19), leída con detección de tablas (PyMuPDF, estrategias
//   «lines» y «text», que coinciden) y no con texto plano, que desalinea la columna Cliente (IA-12).
//   La de Ferretería Xela coincide además con el ejemplo de §8.4. Los id dependen del orden de
//   inserción del seeder, así que se identifican por la descripción.
// - Además se comprueba lo que debe cumplirse con cualquier contenido: cada vendedor ve exactamente
//   las de los clientes de su cartera actual, la forma de §8.4, las fechas ISO UTC y `vencida`.
// - Solo LECTURA. El único PATCH envía a una actividad AJENA su mismo valor actual: aunque la API
//   fallara y no respondiera 404, los datos oficiales no cambiarían.
// - Las pruebas que modifican datos quedan como `todo` hasta disponer de una base de pruebas
//   restablecible acordada con la Parte A.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { pool, verificarConexion } from '../src/config/db.js';

const COLUMNAS_ACTIVIDADES = ['id', 'cliente_id', 'vendedor_id', 'tipo', 'descripcion', 'vence_en', 'completada', 'created_at', 'updated_at'];
const ACTIVIDADES_SEMILLA = 4; // docs/especificacion.md §13.1
const CLAVES = ['cliente', 'completada', 'descripcion', 'id', 'tipo', 'vence_en', 'vencida'];
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

// Enunciado §11, tabla «Actividades» (VerificacionSeeder). Vence en UTC.
const SEMILLA = Object.freeze([
  { correo: 'valeria@crm.test', cliente: 'Comercial El Quetzal', tipo: 'llamada', descripcion: 'Confirmar fecha de instalación', vence_en: '2026-10-08T15:00:00.000Z', completada: true },
  { correo: 'valeria@crm.test', cliente: 'Ferretería Xela', tipo: 'tarea', descripcion: 'Enviar propuesta de capacitación', vence_en: '2030-01-15T15:00:00.000Z', completada: false },
  { correo: 'valeria@crm.test', cliente: 'María Coyoy', tipo: 'reunion', descripcion: 'Presentar opciones de soporte', vence_en: '2026-09-01T15:00:00.000Z', completada: false },
  { correo: 'diego@crm.test', cliente: 'Farmacia Los Altos', tipo: 'llamada', descripcion: 'Renovación de licencias', vence_en: '2030-02-01T15:00:00.000Z', completada: false },
]);
const vencidaEsperada = (a, ahora) => !a.completada && Date.parse(a.vence_en) < ahora;

async function motivoOmision() {
  if (!process.env.DB_HOST || !process.env.DB_NAME || !process.env.DB_USER) return 'sin variables DB_* (ejecute npm run test:bd)';
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) return 'sin JWT_SECRET válido';
  const estado = await verificarConexion();
  if (!estado.conectado) return `MySQL no disponible (código ${estado.codigo})`;
  const [tablas] = await pool.execute(
    "SELECT TABLE_NAME AS tabla FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('clientes', 'actividades')",
  );
  if (tablas.length < 2) return 'I1 pendiente: falta la tabla actividades (migraciones de la Parte A)';
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
  pedirComo = (usuarioId, ruta, opciones = {}) => pedir(`${api.url}/api${ruta}`, {
    ...opciones,
    headers: { Authorization: `Bearer ${firmarToken(usuarioId)}`, ...(opciones.headers ?? {}) },
  });
});
after(async () => { api?.servidor.close(); await pool.end(); });

/** Vendedores activos de la semilla (los únicos que pueden usar la API). */
async function vendedoresActivos() {
  const [filas] = await pool.execute("SELECT id, email FROM users WHERE rol = 'vendedor' AND activo = 1 ORDER BY id");
  return filas;
}

describe('B5 integración con el esquema y VerificacionSeeder (I1 — pendiente)', () => {
  test('las columnas que usa la API existen en actividades', { skip: omitir }, async () => {
    const [filas] = await pool.execute(
      "SELECT COLUMN_NAME AS columna FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'actividades'",
    );
    const reales = filas.map((f) => f.columna);
    for (const c of COLUMNAS_ACTIVIDADES) assert.ok(reales.includes(c), `actividades.${c}`);
  });

  test('descripcion es VARCHAR(500) en utf8mb4 (los 500 caracteres de la API caben, emojis incluidos)', { skip: omitir }, async () => {
    const [[col]] = await pool.execute(
      "SELECT DATA_TYPE AS tipo, CHARACTER_MAXIMUM_LENGTH AS largo, CHARACTER_SET_NAME AS juego FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'actividades' AND COLUMN_NAME = 'descripcion'",
    );
    assert.equal(col.tipo, 'varchar');
    assert.equal(Number(col.largo), 500);
    assert.equal(col.juego, 'utf8mb4');
  });

  test('tipo admite exactamente llamada, reunion y tarea; vence_en es DATETIME', { skip: omitir }, async () => {
    const [filas] = await pool.execute(
      "SELECT COLUMN_NAME AS columna, DATA_TYPE AS tipo, COLUMN_TYPE AS definicion FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'actividades' AND COLUMN_NAME IN ('tipo', 'vence_en')",
    );
    const col = Object.fromEntries(filas.map((f) => [f.columna, f]));
    assert.equal(col.vence_en.tipo, 'datetime');
    if (col.tipo.tipo === 'enum') assert.equal(col.tipo.definicion, "enum('llamada','reunion','tarea')");
  });

  test(`VerificacionSeeder tiene exactamente ${ACTIVIDADES_SEMILLA} actividades`, { skip: omitir }, async () => {
    const [[{ n }]] = await pool.execute('SELECT COUNT(*) AS n FROM actividades');
    assert.equal(Number(n), ACTIVIDADES_SEMILLA);
  });

  test('VerificacionSeeder: Valeria y Diego reciben exactamente sus actividades oficiales, en orden y forma §8.4', { skip: omitir }, async () => {
    for (const correo of ['valeria@crm.test', 'diego@crm.test']) {
      const [[u]] = await pool.execute('SELECT id FROM users WHERE email = ?', [correo]);
      const r = await pedirComo(u.id, '/actividades');
      assert.equal(r.status, 200, correo);
      const ahora = Date.now();
      // Orden aprobado para B5: pendientes primero, por vencimiento ascendente; después completadas.
      const esperadas = SEMILLA.filter((s) => s.correo === correo)
        .sort((a, b) => (a.completada - b.completada) || (Date.parse(a.vence_en) - Date.parse(b.vence_en)))
        .map(({ cliente, tipo, descripcion, vence_en, completada }) => ({
          cliente, tipo, descripcion, vence_en, completada, vencida: vencidaEsperada({ completada, vence_en }, ahora),
        }));
      const obtenidas = r.json.map((a) => ({
        cliente: a.cliente.nombre, tipo: a.tipo, descripcion: a.descripcion, vence_en: a.vence_en, completada: a.completada, vencida: a.vencida,
      }));
      assert.deepEqual(obtenidas, esperadas, correo);
    }
  });

  test('VerificacionSeeder: «Presentar opciones de soporte» está vencida y la completada no (B5-14)', { skip: omitir }, async () => {
    const [[u]] = await pool.execute("SELECT id FROM users WHERE email = 'valeria@crm.test'");
    const r = await pedirComo(u.id, '/actividades');
    const por = (d) => r.json.find((a) => a.descripcion === d);
    assert.equal(por('Presentar opciones de soporte').vencida, true); // 2026-09-01, pendiente
    assert.equal(por('Confirmar fecha de instalación').vencida, false); // fecha pasada, pero completada
    assert.equal(por('Enviar propuesta de capacitación').vencida, false); // 2030
    const pendientes = await pedirComo(u.id, '/actividades?estado=pendiente');
    assert.deepEqual(pendientes.json.map((a) => a.descripcion), ['Presentar opciones de soporte', 'Enviar propuesta de capacitación']);
  });

  test('B5-01: cada vendedor activo ve exactamente las actividades de los clientes de su cartera actual', { skip: omitir }, async () => {
    const vistas = new Set();
    for (const v of await vendedoresActivos()) {
      const r = await pedirComo(v.id, '/actividades');
      assert.equal(r.status, 200, v.email);
      const [esperadas] = await pool.execute(
        'SELECT a.id FROM actividades a JOIN clientes c ON c.id = a.cliente_id WHERE c.vendedor_id = ? ORDER BY a.id',
        [v.id],
      );
      assert.deepEqual(r.json.map((a) => a.id).sort((x, y) => x - y), esperadas.map((f) => f.id), v.email);
      for (const a of r.json) {
        assert.ok(!vistas.has(a.id), `la actividad ${a.id} la ve más de un vendedor`);
        vistas.add(a.id);
      }
    }
  });

  test('§8.4 y R8: forma exacta, fechas ISO UTC y vencida coherente con el reloj', { skip: omitir }, async () => {
    for (const v of await vendedoresActivos()) {
      const r = await pedirComo(v.id, '/actividades');
      const ahora = Date.now();
      for (const a of r.json) {
        assert.deepEqual(Object.keys(a).sort(), CLAVES);
        assert.ok(['llamada', 'reunion', 'tarea'].includes(a.tipo));
        assert.ok(a.vence_en === null || ISO_UTC.test(a.vence_en));
        assert.equal(a.vencida, !a.completada && a.vence_en !== null && Date.parse(a.vence_en) < ahora);
        assert.ok(!/vendedor_id/.test(JSON.stringify(a)));
      }
    }
  });

  test('B5-02 y B5-03: los filtros pendiente y completada coinciden con la columna completada', { skip: omitir }, async () => {
    for (const v of await vendedoresActivos()) {
      const pendientes = await pedirComo(v.id, '/actividades?estado=pendiente');
      const completadas = await pedirComo(v.id, '/actividades?estado=completada');
      assert.ok(pendientes.json.every((a) => a.completada === false));
      assert.ok(completadas.json.every((a) => a.completada === true));
      const todas = await pedirComo(v.id, '/actividades');
      assert.equal(pendientes.json.length + completadas.json.length, todas.json.length);
    }
  });

  test('B5-13: un vendedor no puede modificar una actividad de un cliente ajeno (404, sin cambios)', { skip: omitir }, async () => {
    const [[valeria]] = await pool.execute("SELECT id FROM users WHERE email = 'valeria@crm.test'");
    const [[ajena]] = await pool.execute(
      'SELECT a.id, a.completada FROM actividades a JOIN clientes c ON c.id = a.cliente_id WHERE c.vendedor_id IS NULL OR c.vendedor_id <> ? ORDER BY a.id LIMIT 1',
      [valeria.id],
    );
    if (!ajena) return; // la semilla podría no tener actividades fuera de la cartera de Valeria
    const r = await pedirComo(valeria.id, `/actividades/${ajena.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completada: Boolean(Number(ajena.completada)) }), // su mismo valor actual
    });
    assert.equal(r.status, 404);
  });

  // Requieren una base de pruebas restablecible (modifican datos):
  test.todo('B5-05 y B5-08: crear actividades en MySQL y recuperar vence_en en UTC (ida y vuelta con timezone Z)');
  test.todo('B5-07: guardar 500 caracteres Unicode (emojis y acentos combinados) en VARCHAR(500) utf8mb4 sin error 1406/1366');
  test.todo('B5-09: una fecha sin zona no llega a escribirse en MySQL');
  test.todo('B5-11: marcar como completada y reabrir con la columna real (TINYINT o BOOLEAN)');
  test.todo('B5-15: reasignación de un cliente desde el panel de Laravel y visibilidad de sus actividades');
  test.todo('D17: alta y PATCH de actividades simultáneos a una reasignación del panel, sin interbloqueos de InnoDB');
});
