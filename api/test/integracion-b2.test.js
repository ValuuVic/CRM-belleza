// Integración real de B2 con MySQL y VerificacionSeeder (dependencia I1 de la Parte A).
// Se ejecuta con `npm run test:bd`.
// - Se omite si no hay configuración DB_*, si MySQL no responde o si faltan las tablas y
//   columnas que crean las migraciones de la Parte A (users.rol, users.activo, clientes).
// - Los inicios de sesión reales (B2-01, B2-04, B2-10; B6-26) necesitan la contraseña pública de
//   la semilla en la variable CLAVE_SEMILLA: no se escribe en el código (S2 solo permite publicarla
//   en las semillas, el README y Postman). Los correos de admin y supervisor se leen de la base por
//   su rol, para no inventarlos.
// - La revocación real del JWT (B2-08, B6-20) MODIFICA users.activo y lo restaura al terminar.
//   Solo se ejecuta si se declara CRM_BD_RESTABLECIBLE=si y la base conectada no es la compartida
//   crm_belleza: nunca sobre la base de trabajo ni sobre la semilla compartida.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { pool, verificarConexion } from '../src/config/db.js';

const BASE_COMPARTIDA = 'crm_belleza';

async function motivoOmision() {
  if (!process.env.DB_HOST || !process.env.DB_NAME || !process.env.DB_USER) return 'sin variables DB_* (ejecute npm run test:bd)';
  const estado = await verificarConexion();
  if (!estado.conectado) return `MySQL no disponible (código ${estado.codigo})`;
  const [columnas] = await pool.execute(
    `SELECT TABLE_NAME AS tabla, COLUMN_NAME AS columna FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND ((TABLE_NAME = 'users' AND COLUMN_NAME IN ('rol', 'activo'))
         OR (TABLE_NAME = 'clientes' AND COLUMN_NAME = 'vendedor_id'))`,
  );
  if (columnas.length < 3) return 'I1 pendiente: faltan users.rol, users.activo o clientes.vendedor_id (migraciones de la Parte A)';
  const [[{ n }]] = await pool.execute("SELECT COUNT(*) AS n FROM users WHERE email = 'valeria@crm.test'");
  if (n === 0) return 'I1 pendiente: VerificacionSeeder no está cargado (no existe valeria@crm.test)';
  return false;
}

const omitir = await motivoOmision();
const omitirLogin = omitir
  || (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 ? 'sin JWT_SECRET válido en .env' : false)
  || (process.env.CLAVE_SEMILLA ? false : 'sin CLAVE_SEMILLA (contraseña pública de VerificacionSeeder; ver README)');
// Se compara el nombre REAL de la base conectada (SELECT DATABASE()), sin espacios ni mayúsculas,
// para que variantes como " CRM_Belleza" en DB_NAME no esquiven la protección.
async function esBaseCompartida() {
  const [[{ base }]] = await pool.execute('SELECT DATABASE() AS base');
  return String(base ?? '').trim().toLowerCase() === BASE_COMPARTIDA;
}
const omitirEscritura = omitirLogin
  || (process.env.CRM_BD_RESTABLECIBLE === 'si' ? false : 'modifica users.activo: declare CRM_BD_RESTABLECIBLE=si solo en una base de pruebas restablecible')
  || ((await esBaseCompartida()) ? `no se modifica la base compartida ${BASE_COMPARTIDA}` : false);

let api;
let pedir;
before(async () => {
  if (omitirLogin) return;
  const { crearApp } = await import('../src/app.js');
  const ayuda = await import('./ayuda/bd-simulada.js'); // solo los ayudantes HTTP; usa el pool real
  pedir = ayuda.pedir;
  api = await ayuda.levantar(crearApp({ origenPermitido: 'http://127.0.0.1:5500', pool }));
});
after(async () => { api?.servidor.close(); await pool.end(); });

const login = (correo, clave = process.env.CLAVE_SEMILLA) => pedir(`${api.url}/api/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ correo, clave }),
});
const conToken = (token, ruta) => pedir(`${api.url}/api${ruta}`, { headers: { Authorization: `Bearer ${token}` } });
const correoPorRol = async (rol) => {
  const [[u]] = await pool.execute('SELECT email FROM users WHERE rol = ? AND activo = 1 ORDER BY id LIMIT 1', [rol]);
  return u?.email;
};

describe('B2 integración con la semilla oficial (I1)', () => {
  test('el esquema de la Parte A tiene las columnas que usa B2', { skip: omitir }, async () => {
    const [filas] = await pool.execute('SELECT id, name AS nombre, email AS correo, rol, activo FROM users LIMIT 1');
    assert.ok(Array.isArray(filas));
  });

  test('B2-01: login de Valeria con la contraseña de la semilla → 200 { token, usuario } con id 4', { skip: omitirLogin }, async () => {
    const r = await login('valeria@crm.test');
    assert.equal(r.status, 200, r.texto);
    assert.deepEqual(Object.keys(r.json).sort(), ['token', 'usuario']);
    assert.deepEqual(r.json.usuario, { id: 4, nombre: 'Valeria López', correo: 'valeria@crm.test' });
    const cabecera = JSON.parse(Buffer.from(r.json.token.split('.')[0], 'base64url').toString());
    assert.equal(cabecera.alg, 'HS256');
  });

  test('B2-04 / B6-26: administrador y supervisor de la semilla con la contraseña correcta → 403 sin token', { skip: omitirLogin }, async () => {
    for (const rol of ['administrador', 'supervisor']) {
      const correo = await correoPorRol(rol);
      assert.ok(correo, `la semilla no tiene un ${rol} activo`);
      const r = await login(correo);
      assert.equal(r.status, 403, `${rol}: ${r.texto}`);
      assert.deepEqual(Object.keys(r.json), ['error']);
    }
  });

  test('B2-10: GET /api/clientes con el token obtenido en el login de Valeria → sus 3 clientes (3 de 10)', { skip: omitirLogin }, async () => {
    const { json } = await login('valeria@crm.test');
    const r = await conToken(json.token, '/clientes');
    assert.equal(r.status, 200);
    assert.equal(r.json.length, 3);
  });

  test('B2-08 / B6-20: si la cuenta se desactiva en MySQL, la siguiente petición con su token responde 401', { skip: omitirEscritura }, async () => {
    const { json } = await login('valeria@crm.test');
    const [[antes]] = await pool.execute('SELECT id, activo FROM users WHERE email = ?', ['valeria@crm.test']);
    assert.equal((await conToken(json.token, '/clientes')).status, 200);
    try {
      await pool.execute('UPDATE users SET activo = 0 WHERE id = ?', [antes.id]);
      const r = await conToken(json.token, '/clientes');
      assert.equal(r.status, 401);
      assert.deepEqual(Object.keys(r.json), ['error']);
    } finally {
      await pool.execute('UPDATE users SET activo = ? WHERE id = ?', [antes.activo, antes.id]);
    }
    assert.equal((await conToken(json.token, '/clientes')).status, 200, 'la cuenta se restauró');
  });
});
