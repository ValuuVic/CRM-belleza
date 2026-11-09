// B1-04, B1-05 y B1-10: errores controlados, formato JSON del contrato y errores inesperados.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { crearApp } from '../src/app.js';
import { rutaNoEncontrada, manejadorErrores, RESTRICCIONES_A_CAMPOS } from '../src/middleware/errores.js';
import { ErrorHttp, ErrorValidacion, peticionInvalida, noEncontrado, conflicto } from '../src/utils/errores.js';
import { pool } from '../src/config/db.js';

/** Levanta una app en un puerto libre y devuelve su URL base. */
async function levantar(app) {
  return new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve({ s, url: `http://127.0.0.1:${s.address().port}` }));
  });
}

// App de prueba: las mismas piezas que app.js más rutas que lanzan errores.
function appConErrores() {
  const app = express();
  app.use(express.json());
  app.get('/http/:codigo', (req) => { throw new ErrorHttp(Number(req.params.codigo), 'Mensaje controlado'); });
  app.get('/atajos/400', () => { throw peticionInvalida(); });
  app.get('/atajos/404', () => { throw noEncontrado(); });
  app.get('/atajos/409', () => { throw conflicto(); });
  app.get('/validacion', () => { throw new ErrorValidacion({ nit: 'El NIT no es válido', telefono: 'El teléfono no es válido' }); });
  app.get('/async', async () => { throw conflicto('Rechazo asíncrono'); });
  app.get('/mysql/1062', () => { throw Object.assign(new Error("Duplicate entry 'x' for key 'clientes.nit'"), { errno: 1062, code: 'ER_DUP_ENTRY', sqlMessage: "Duplicate entry 'x' for key 'clientes.nit'" }); });
  app.get('/mysql/3819/:nombre', (req) => {
    const msg = `Check constraint '${req.params.nombre}' is violated.`;
    throw Object.assign(new Error(msg), { errno: 3819, code: 'ER_CHECK_CONSTRAINT_VIOLATED', sqlMessage: msg });
  });
  app.get('/interno', () => { throw new Error('detalle secreto: contraseña=1234 en /ruta/interna.js'); });
  app.get('/sql', () => {
    throw Object.assign(new Error("Unknown column 'secreto' in 'field list'"), {
      errno: 1054, code: 'ER_BAD_FIELD_ERROR', sqlMessage: "Unknown column 'secreto'", sql: 'SELECT secreto FROM users',
    });
  });
  app.get('/no-error', () => { throw 'texto lanzado'; }); // eslint-disable-line no-throw-literal
  app.get('/param/:id', (req, res) => res.json({ id: req.params.id }));
  app.get('/mysql/acceso', () => {
    throw Object.assign(new Error("Access denied for user 'usuario_secreto'@'10.0.0.9' (using password: YES)"), {
      errno: 1045, code: 'ER_ACCESS_DENIED_ERROR', sqlState: '28000',
      sqlMessage: "Access denied for user 'usuario_secreto'@'10.0.0.9'", sql: "SELECT * FROM clientes WHERE nit = '4521817K'",
    });
  });
  app.use(rutaNoEncontrada);
  app.use(manejadorErrores);
  return app;
}

let real;
let prueba;
const errorOriginal = console.error;
const registros = []; // lo que el manejador escribe en el registro del servidor
before(async () => {
  console.error = (...args) => { registros.push(args); }; // se captura en lugar de mostrarlo
  real = await levantar(crearApp({ origenPermitido: 'http://127.0.0.1:5500' }));
  prueba = await levantar(appConErrores());
});
after(async () => {
  console.error = errorOriginal;
  real.s.close();
  prueba.s.close();
  await pool.end();
});

async function pedir(base, ruta, opciones) {
  const r = await fetch(base.url + ruta, opciones);
  const texto = await r.text();
  return { status: r.status, tipo: r.headers.get('content-type') || '', texto, json: texto ? JSON.parse(texto) : null };
}

describe('B1-04 errores controlados', () => {
  test('una ruta inexistente responde 404 en JSON { error }', async () => {
    const r = await pedir(real, '/api/no-existe');
    assert.equal(r.status, 404);
    assert.match(r.tipo, /application\/json/);
    assert.deepEqual(r.json, { error: 'Recurso no encontrado' });
  });

  test('un JSON mal formado responde 400 { error }', async () => {
    const r = await pedir(real, '/api/cualquiera', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"nombre": ',
    });
    assert.equal(r.status, 400);
    assert.deepEqual(Object.keys(r.json), ['error']);
  });

  test('un cuerpo demasiado grande responde 400 { error }', async () => {
    const r = await pedir(real, '/api/cualquiera', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ x: 'a'.repeat(200 * 1024) }),
    });
    assert.equal(r.status, 400);
    assert.deepEqual(Object.keys(r.json), ['error']);
  });

  test('ErrorHttp responde con su código y { error }', async () => {
    for (const codigo of [400, 401, 403, 404, 409]) {
      const r = await pedir(prueba, `/http/${codigo}`);
      assert.equal(r.status, codigo);
      assert.deepEqual(r.json, { error: 'Mensaje controlado' });
    }
  });

  test('los atajos responden 400, 404 y 409', async () => {
    assert.equal((await pedir(prueba, '/atajos/400')).status, 400);
    assert.equal((await pedir(prueba, '/atajos/404')).status, 404);
    assert.equal((await pedir(prueba, '/atajos/409')).status, 409);
    assert.ok((await pedir(prueba, '/atajos/409')).json.error);
  });

  test('los errores lanzados en rutas asíncronas llegan al manejador (Express 5)', async () => {
    const r = await pedir(prueba, '/async');
    assert.equal(r.status, 409);
    assert.deepEqual(r.json, { error: 'Rechazo asíncrono' });
  });

  test('ErrorValidacion responde 422 { errores: { campo: mensaje } }', async () => {
    const r = await pedir(prueba, '/validacion');
    assert.equal(r.status, 422);
    assert.deepEqual(r.json, { errores: { nit: 'El NIT no es válido', telefono: 'El teléfono no es válido' } });
  });

  test('MySQL 1062 responde 409 { error } sin revelar el valor duplicado', async () => {
    const r = await pedir(prueba, '/mysql/1062');
    assert.equal(r.status, 409);
    assert.deepEqual(Object.keys(r.json), ['error']);
    assert.doesNotMatch(r.texto, /Duplicate|clientes\.nit/);
  });

  test('MySQL 3819 de una restricción desconocida responde 422 en el campo general', async () => {
    const r = await pedir(prueba, '/mysql/3819/restriccion_desconocida');
    assert.equal(r.status, 422);
    assert.deepEqual(Object.keys(r.json.errores), ['general']);
    assert.doesNotMatch(r.texto, /restriccion_desconocida|Check constraint/);
  });

  test('un parámetro de ruta mal codificado responde 400 { error } y no 500', async () => {
    const r = await pedir(prueba, '/param/%E0');
    assert.equal(r.status, 400);
    assert.deepEqual(Object.keys(r.json), ['error']);
  });

  test('ErrorHttp solo admite códigos de error general; el 422 exige ErrorValidacion', () => {
    for (const codigo of [422, 500, 200, 418]) {
      assert.throws(() => new ErrorHttp(codigo, 'x'), TypeError, String(codigo));
    }
    assert.equal(new ErrorValidacion({ nit: 'x' }).status, 422);
  });

  test('MySQL 3819 con un nombre que coincide con el prototipo de Object responde en general', async () => {
    for (const nombre of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      const r = await pedir(prueba, `/mysql/3819/${nombre}`);
      assert.equal(r.status, 422);
      assert.deepEqual(Object.keys(r.json.errores), ['general'], nombre);
    }
  });

  test('MySQL 3819 de una restricción registrada responde 422 en su campo', async () => {
    RESTRICCIONES_A_CAMPOS.prueba_stock_chk = 'stock';
    try {
      const r = await pedir(prueba, '/mysql/3819/prueba_stock_chk');
      assert.equal(r.status, 422);
      assert.deepEqual(Object.keys(r.json.errores), ['stock']);
    } finally {
      delete RESTRICCIONES_A_CAMPOS.prueba_stock_chk;
    }
  });

  // Nombres de las migraciones de la Parte A (laravel/database/migrations/2026_11_08_*).
  const CHECK_DE_CAMPOS = {
    chk_clientes_telefono: 'telefono',
    chk_actividades_tipo: 'tipo',
    chk_oportunidad_productos_cantidad: 'cantidad',
    chk_oportunidades_etapa: 'etapa',
    chk_oportunidades_motivo: 'motivo_perdida',
  };
  for (const [nombre, campo] of Object.entries(CHECK_DE_CAMPOS)) {
    test(`MySQL 3819 de ${nombre} responde 422 en errores.${campo}`, async () => {
      const r = await pedir(prueba, `/mysql/3819/${nombre}`);
      assert.equal(r.status, 422);
      assert.deepEqual(Object.keys(r.json.errores), [campo]);
      assert.doesNotMatch(r.texto, /chk_|Check constraint/);
    });
  }

  for (const nombre of ['chk_productos_precio', 'chk_productos_stock', 'chk_oportunidad_productos_precio', 'chk_oportunidades_cierre',
    'chk_historial_etapas_etapa_anterior', 'chk_historial_etapas_etapa_nueva', 'chk_users_rol']) {
    test(`MySQL 3819 de ${nombre} (valor que arma la API) responde 422 en general`, async () => {
      const r = await pedir(prueba, `/mysql/3819/${nombre}`);
      assert.equal(r.status, 422);
      assert.deepEqual(Object.keys(r.json.errores), ['general']);
      assert.doesNotMatch(r.texto, /chk_|Check constraint/);
    });
  }
});

describe('B1-05 errores inesperados', () => {
  for (const ruta of ['/interno', '/sql', '/no-error']) {
    test(`${ruta} responde 500 genérico sin información interna`, async () => {
      const r = await pedir(prueba, ruta);
      assert.equal(r.status, 500);
      assert.deepEqual(r.json, { error: 'Error interno del servidor' });
      assert.doesNotMatch(r.texto, /secreto|contraseña|interna|SELECT|Unknown|stack|\.js/i);
    });
  }

  test('el registro del servidor de un error de MySQL no incluye usuario, host, SQL ni valores', async () => {
    registros.length = 0;
    const r = await pedir(prueba, '/mysql/acceso');
    assert.equal(r.status, 500);
    assert.deepEqual(r.json, { error: 'Error interno del servidor' });
    const texto = JSON.stringify(registros);
    assert.match(texto, /ER_ACCESS_DENIED_ERROR/);
    for (const s of ['usuario_secreto', '10.0.0.9', 'SELECT', '4521817K', 'Access denied']) {
      assert.ok(!texto.includes(s), `el registro revela ${s}`);
    }
  });

  test('las respuestas no incluyen la cabecera X-Powered-By', async () => {
    const r = await fetch(real.url + '/api/no-existe');
    assert.equal(r.headers.get('x-powered-by'), null);
  });
});
