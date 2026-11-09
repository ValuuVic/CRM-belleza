// B6-19: el script api/scripts/prueba-concurrencia.js es reproducible y seguro.
// Prueba el SCRIPT (protecciones y ejecución completa), no la lógica de concurrencia de la API, que
// ya cubren concurrencia-clientes.test.js y concurrencia-oportunidades.test.js.
// Se ejecuta como proceso hijo contra servidores efímeros con la base SIMULADA (sin MySQL):
//   - uno que se presenta como la demostración (cabecera X-CRM-Modo: demostracion-local);
//   - otro igual pero sin esa cabecera, como lo haría una API real.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

process.env.JWT_SECRET = 'secreto_de_prueba_b6_script_concurrencia_no_usar';

const { default: express } = await import('express');
const { crearApp } = await import('../src/app.js');
const { pool: poolReal } = await import('../src/config/db.js');
const { crearBdSimulada, levantar, CLAVE_PRUEBA } = await import('./ayuda/bd-simulada.js');

const SCRIPT = fileURLToPath(new URL('../scripts/prueba-concurrencia.js', import.meta.url));
const CREDENCIALES = {
  CONCURRENCIA_CORREO_A: 'vendedora1@prueba.test',
  CONCURRENCIA_CLAVE_A: CLAVE_PRUEBA,
  CONCURRENCIA_CORREO_B: 'vendedor2@prueba.test',
  CONCURRENCIA_CLAVE_B: CLAVE_PRUEBA,
};

/** Servidor con la app real sobre una base simulada nueva; registra cada petición recibida. */
async function servidor({ demo }) {
  const bd = crearBdSimulada();
  const peticiones = [];
  const app = express()
    .use((req, res, next) => { peticiones.push(`${req.method} ${req.path}`); if (demo) res.set('X-CRM-Modo', 'demostracion-local'); next(); })
    .use(crearApp({ origenPermitido: 'http://127.0.0.1:5500', pool: bd.pool }));
  const s = await levantar(app);
  return { bd, peticiones, url: `${s.url}/api`, cerrar: () => s.servidor.close() };
}

/** Ejecuta el script y devuelve { codigo, salida }. */
function ejecutar(args, entorno) {
  return new Promise((resolve) => {
    const env = { ...process.env, ...entorno };
    delete env.CONCURRENCIA_BASE_RESTABLECIBLE;
    if (entorno.CONCURRENCIA_BASE_RESTABLECIBLE) env.CONCURRENCIA_BASE_RESTABLECIBLE = entorno.CONCURRENCIA_BASE_RESTABLECIBLE;
    execFile(process.execPath, [SCRIPT, ...args], { env, timeout: 60_000 }, (error, stdout, stderr) => {
      resolve({ codigo: error ? error.code : 0, salida: `${stdout}${stderr}` });
    });
  });
}

const escrituras = (peticiones) => peticiones.filter((p) => !p.startsWith('GET ') && p !== 'POST /api/auth/login');

let demo;
let real;
before(async () => { demo = await servidor({ demo: true }); real = await servidor({ demo: false }); });
after(() => { demo.cerrar(); real.cerrar(); return poolReal.end(); });

describe('B6-19 protecciones del script de concurrencia', () => {
  test('sin --confirmar-escritura: solo inicia sesión y lee, no escribe nada y termina con código 2', async () => {
    const clientesAntes = JSON.stringify(demo.bd.clientes);
    const desde = demo.peticiones.length;
    const r = await ejecutar([], { ...CREDENCIALES, CONCURRENCIA_URL: demo.url });
    assert.equal(r.codigo, 2, r.salida);
    assert.match(r.salida, /No se ha escrito nada/);
    assert.deepEqual(escrituras(demo.peticiones.slice(desde)), []);
    assert.equal(JSON.stringify(demo.bd.clientes), clientesAntes);
  });

  test('con confirmación, contra una API que no es la demostración y sin declarar base restablecible: se niega', async () => {
    const r = await ejecutar(['--confirmar-escritura'], { ...CREDENCIALES, CONCURRENCIA_URL: real.url });
    assert.equal(r.codigo, 2, r.salida);
    assert.match(r.salida, /Se niega a escribir/);
    assert.deepEqual(escrituras(real.peticiones), []);
  });

  test('sin credenciales en el entorno no hace ninguna petición', async () => {
    const desde = real.peticiones.length;
    const r = await ejecutar(['--confirmar-escritura'], { CONCURRENCIA_URL: real.url, CONCURRENCIA_CORREO_A: '', CONCURRENCIA_CLAVE_A: '', CONCURRENCIA_CORREO_B: '', CONCURRENCIA_CLAVE_B: '' });
    assert.equal(r.codigo, 2);
    assert.match(r.salida, /Faltan variables de entorno/);
    assert.equal(real.peticiones.length, desde);
  });

  test('el código no se conecta a MySQL, no lanza procesos y no contiene contraseñas', async () => {
    const codigo = await readFile(SCRIPT, 'utf8');
    assert.doesNotMatch(codigo, /mysql2|config\/db|child_process|\bexec(Sync|File)?\(|spawn/);
    assert.doesNotMatch(codigo, /Clave\.Prueba|Ventas\d{4}/); // ninguna contraseña de prueba ni la pública de la semilla
    assert.match(codigo, /Promise\.all/);
    assert.match(codigo, /fetch\(/);
  });
});

describe('B6-14 a B6-18 ejecución completa contra la demostración (base simulada)', () => {
  test('los cinco escenarios se aprueban y el estado final de los datos es coherente', async () => {
    const r = await ejecutar(['--confirmar-escritura', '--json'], { ...CREDENCIALES, CONCURRENCIA_URL: demo.url });
    assert.equal(r.codigo, 0, r.salida);
    const linea = r.salida.split('\n').find((l) => l.startsWith('RESULTADO_JSON '));
    const { resultados, modo } = JSON.parse(linea.slice('RESULTADO_JSON '.length));
    assert.equal(modo, 'demostracion-local');
    assert.deepEqual(resultados.map((x) => [x.id, x.estado]), [
      ['B6-14', 'APROBADO'], ['B6-16', 'APROBADO'], ['B6-17', 'APROBADO'], ['B6-18', 'APROBADO'], ['B6-15', 'APROBADO'],
    ]);
    // Comprobación independiente sobre la base: un solo dueño, NIT único, stock 0 y cartera de B en 10.
    const bd = demo.bd;
    assert.ok([4, 5].includes(bd.clientes.find((c) => c.id === 13).vendedor_id));
    const nits = bd.clientes.map((c) => c.nit).filter(Boolean);
    assert.equal(new Set(nits).size, nits.length);
    assert.equal(bd.clientes.filter((c) => c.vendedor_id === 5).length, 10);
    assert.equal(bd.productos.find((p) => p.id === 2).stock, 0); // «Labial mate»: stock 2 → 0
    for (const p of bd.productos) assert.ok(p.stock === null || p.stock >= 0, `stock negativo en ${p.id}`);
  });

  test('una segunda ejecución sobre los mismos datos marca como PENDIENTE lo que ya no se puede preparar (código 1)', async () => {
    const r = await ejecutar(['--confirmar-escritura', '--json'], { ...CREDENCIALES, CONCURRENCIA_URL: demo.url });
    assert.equal(r.codigo, 1, r.salida);
    const { resultados } = JSON.parse(r.salida.split('\n').find((l) => l.startsWith('RESULTADO_JSON ')).slice(15));
    assert.equal(resultados.find((x) => x.id === 'B6-14').estado, 'PENDIENTE'); // ya no hay disponibles
    assert.equal(resultados.find((x) => x.id === 'B6-15').estado, 'PENDIENTE'); // B ya tiene 10
    assert.ok(resultados.every((x) => x.estado !== 'APROBADO' || x.obtenido !== '—'));
  });
});
