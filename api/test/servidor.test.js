// B1-01 y B1-10: el servidor arranca en el puerto configurado y valida su configuración.
// Se lanza `node src/server.js` como proceso hijo con un entorno controlado (sin .env).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ_API = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVIDOR = path.join(RAIZ_API, 'src', 'server.js');

/** Obtiene un puerto libre del sistema. */
function puertoLibre() {
  return new Promise((resolve, reject) => {
    const s = createServer().listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    }).on('error', reject);
  });
}

// MySQL inalcanzable a propósito (puerto 1 de localhost): el servidor debe arrancar igual (B1-02)
// y no debe mostrar las credenciales en sus mensajes.
// Desde B2, JWT_SECRET es obligatorio: se usa un secreto de prueba de 40 caracteres.
const SECRETO_PRUEBA = 'secreto_de_prueba_b2_no_usar_en_prod_40c';
const BD_FALSA = {
  DB_HOST: '127.0.0.1', DB_PORT: '1', DB_NAME: 'bd_prueba', DB_USER: 'usuario_prueba_b1', DB_PASSWORD: 'clave_prueba_b1',
  JWT_SECRET: SECRETO_PRUEBA,
};

/**
 * Arranca el servidor y espera a que escuche o termine.
 * @returns {Promise<{ salida: string, codigo: number | null, proceso: import('node:child_process').ChildProcess }>}
 */
function arrancar(env, { limiteMs = 15000 } = {}) {
  // Entorno mínimo: no se heredan variables del sistema que puedan contener secretos.
  const entorno = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...env };
  const proceso = spawn(process.execPath, [SERVIDOR], { cwd: RAIZ_API, env: entorno, stdio: ['ignore', 'pipe', 'pipe'] });
  let salida = '';
  return new Promise((resolve, reject) => {
    const temporizador = setTimeout(() => { proceso.kill(); reject(new Error(`Tiempo agotado. Salida:\n${salida}`)); }, limiteMs);
    const leer = (d) => {
      salida += d;
      if (/Escuchando en el puerto/.test(salida)) {
        clearTimeout(temporizador);
        resolve({ salida, codigo: null, proceso });
      }
    };
    proceso.stdout.on('data', leer);
    proceso.stderr.on('data', leer);
    proceso.on('exit', (codigo) => {
      clearTimeout(temporizador);
      resolve({ salida, codigo, proceso });
    });
  });
}

function detener(proceso) {
  return new Promise((resolve) => {
    if (proceso.exitCode !== null) return resolve();
    proceso.on('exit', () => resolve());
    proceso.kill();
  });
}

describe('B1-01 servidor Express', () => {
  test('escucha en el puerto configurado y responde JSON', async () => {
    const puerto = await puertoLibre();
    const r = await arrancar({ ...BD_FALSA, PORT: String(puerto), CORS_ORIGIN: 'http://127.0.0.1:5500' });
    try {
      assert.equal(r.codigo, null, `el servidor terminó antes de escuchar:\n${r.salida}`);
      assert.match(r.salida, new RegExp(`Escuchando en el puerto ${puerto}`));
      const resp = await fetch(`http://127.0.0.1:${puerto}/api/no-existe`);
      assert.equal(resp.status, 404);
      assert.deepEqual(await resp.json(), { error: 'Recurso no encontrado' });
    } finally {
      await detener(r.proceso);
    }
  });

  test('B1-02: con MySQL inaccesible arranca, avisa y no muestra credenciales', async () => {
    const puerto = await puertoLibre();
    const r = await arrancar({ ...BD_FALSA, PORT: String(puerto), CORS_ORIGIN: 'http://127.0.0.1:5500' });
    try {
      assert.match(r.salida, /No se pudo conectar con MySQL \(código [A-Z_]+\)/);
      assert.match(r.salida, /Escuchando en el puerto/);
      for (const secreto of [BD_FALSA.DB_USER, BD_FALSA.DB_PASSWORD, BD_FALSA.DB_NAME]) {
        assert.ok(!r.salida.includes(secreto), `la salida revela ${secreto}`);
      }
    } finally {
      await detener(r.proceso);
    }
  });

  test('sin PORT válido termina con código 1 y un mensaje genérico', async () => {
    for (const PORT of [undefined, 'abc', '0', '70000']) {
      const env = { ...BD_FALSA, CORS_ORIGIN: 'http://127.0.0.1:5500' };
      if (PORT !== undefined) env.PORT = PORT;
      const r = await arrancar(env);
      assert.equal(r.codigo, 1, `PORT=${PORT}`);
      assert.match(r.salida, /PORT debe ser un número de puerto válido/);
      assert.ok(!r.salida.includes(BD_FALSA.DB_PASSWORD));
    }
  });

  test('sin CORS_ORIGIN o con "*" termina con código 1', async () => {
    const puerto = await puertoLibre();
    const sinOrigen = await arrancar({ ...BD_FALSA, PORT: String(puerto) });
    assert.equal(sinOrigen.codigo, 1);
    assert.match(sinOrigen.salida, /CORS_ORIGIN es obligatorio/);

    const abierto = await arrancar({ ...BD_FALSA, PORT: String(puerto), CORS_ORIGIN: '*' });
    assert.equal(abierto.codigo, 1);
    assert.match(abierto.salida, /CORS_ORIGIN no puede ser "\*"/);
  });

  test('CORS_ORIGIN que no es un origen http(s) exacto termina con código 1', async () => {
    const puerto = await puertoLibre();
    for (const origen of ['null', 'http://127.0.0.1:5500/', 'http://127.0.0.1:5500/ruta', 'ftp://127.0.0.1', 'no-es-url', 'file:///C:/index.html']) {
      const r = await arrancar({ ...BD_FALSA, PORT: String(puerto), CORS_ORIGIN: origen });
      if (r.codigo === null) await detener(r.proceso);
      assert.equal(r.codigo, 1, origen);
      assert.match(r.salida, /CORS_ORIGIN debe ser un origen http\(s\) exacto/, origen);
    }
  });

  test('CORS_ORIGIN con espacios alrededor se recorta y se aplica', async () => {
    const puerto = await puertoLibre();
    const r = await arrancar({ ...BD_FALSA, PORT: String(puerto), CORS_ORIGIN: '  http://127.0.0.1:5500  ' });
    try {
      assert.equal(r.codigo, null, r.salida);
      const resp = await fetch(`http://127.0.0.1:${puerto}/api/no-existe`, { headers: { Origin: 'http://127.0.0.1:5500' } });
      assert.equal(resp.headers.get('access-control-allow-origin'), 'http://127.0.0.1:5500');
    } finally {
      await detener(r.proceso);
    }
  });

  test('si el puerto está ocupado termina con código 1 sin mostrar detalles internos', async () => {
    // Se ocupa el puerto en todas las interfaces, igual que hace app.listen(PORT).
    // Ocupar solo 127.0.0.1 no basta en Windows: el servidor podía escuchar igualmente.
    const ocupado = await new Promise((resolve) => {
      const s = createServer().listen(0, () => resolve(s));
    });
    try {
      const r = await arrancar({ ...BD_FALSA, PORT: String(ocupado.address().port), CORS_ORIGIN: 'http://127.0.0.1:5500' });
      if (r.codigo === null) await detener(r.proceso);
      assert.equal(r.codigo, 1, `debería terminar con código 1:\n${r.salida}`);
      assert.match(r.salida, /No se pudo iniciar el servidor \(código EADDRINUSE\)/);
      assert.ok(!r.salida.includes(BD_FALSA.DB_PASSWORD));
    } finally {
      ocupado.close();
    }
  });
});

describe('S2 configuración de JWT (B2)', () => {
  test('sin JWT_SECRET o con menos de 32 caracteres termina con código 1 sin mostrar el valor', async () => {
    const puerto = await puertoLibre();
    const sinSecreto = { ...BD_FALSA, PORT: String(puerto), CORS_ORIGIN: 'http://127.0.0.1:5500' };
    delete sinSecreto.JWT_SECRET;
    const r1 = await arrancar(sinSecreto);
    if (r1.codigo === null) await detener(r1.proceso);
    assert.equal(r1.codigo, 1);
    assert.match(r1.salida, /JWT_SECRET es obligatorio/);

    const corto = 'secreto_corto_de_31_caracteres!';
    assert.equal(corto.length, 31);
    const r2 = await arrancar({ ...BD_FALSA, PORT: String(puerto), CORS_ORIGIN: 'http://127.0.0.1:5500', JWT_SECRET: corto });
    if (r2.codigo === null) await detener(r2.proceso);
    assert.equal(r2.codigo, 1);
    assert.match(r2.salida, /JWT_SECRET debe tener al menos 32 caracteres/);
    assert.ok(!r2.salida.includes(corto), 'la salida revela el secreto');
  });

  test('JWT_EXPIRES_IN con formato no válido termina con código 1', async () => {
    const puerto = await puertoLibre();
    const r = await arrancar({ ...BD_FALSA, PORT: String(puerto), CORS_ORIGIN: 'http://127.0.0.1:5500', JWT_EXPIRES_IN: 'ocho horas' });
    if (r.codigo === null) await detener(r.proceso);
    assert.equal(r.codigo, 1);
    assert.match(r.salida, /JWT_EXPIRES_IN debe ser/);
  });

  test('el secreto de prueba no aparece en la salida del arranque correcto', async () => {
    const puerto = await puertoLibre();
    const r = await arrancar({ ...BD_FALSA, PORT: String(puerto), CORS_ORIGIN: 'http://127.0.0.1:5500', JWT_EXPIRES_IN: '8h' });
    try {
      assert.equal(r.codigo, null, r.salida);
      assert.ok(!r.salida.includes(SECRETO_PRUEBA));
    } finally {
      await detener(r.proceso);
    }
  });
});
