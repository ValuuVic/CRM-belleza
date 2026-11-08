// Modo demostración local de B2 (api/demo/servidor-demo.js): protecciones y funcionamiento.
// No forma parte del contrato de la API; garantiza que la demostración no llegue a producción.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ_API = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEMO = path.join(RAIZ_API, 'demo', 'servidor-demo.js');

const puertoLibre = () => new Promise((resolve) => {
  const s = createServer().listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
});

function arrancar(env) {
  const proceso = spawn(process.execPath, [DEMO], {
    cwd: RAIZ_API,
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let salida = '';
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { proceso.kill(); reject(new Error(`Tiempo agotado:\n${salida}`)); }, 15000);
    const leer = (d) => { salida += d; if (/MODO DEMOSTRACIÓN LOCAL[\s\S]*Detener/.test(salida)) { clearTimeout(t); resolve({ proceso, salida, codigo: null }); } };
    proceso.stdout.on('data', leer);
    proceso.stderr.on('data', leer);
    proceso.on('exit', (codigo) => { clearTimeout(t); resolve({ proceso, salida, codigo }); });
  });
}
const detener = (p) => new Promise((r) => { if (p.exitCode !== null) return r(); p.on('exit', r); p.kill(); });

describe('modo demostración local', () => {
  test('se niega a arrancar con NODE_ENV=production', async () => {
    const r = await arrancar({ NODE_ENV: 'production', DEMO_PUERTO: String(await puertoLibre()) });
    if (r.codigo === null) await detener(r.proceso);
    assert.equal(r.codigo, 1);
    assert.match(r.salida, /no puede ejecutarse con NODE_ENV=production/);
  });

  test('arranca en 127.0.0.1, marca las respuestas y permite login y cartera de 3 clientes', async () => {
    const puerto = await puertoLibre();
    const r = await arrancar({ DEMO_PUERTO: String(puerto) });
    try {
      assert.equal(r.codigo, null, r.salida);
      assert.match(r.salida, new RegExp(`http://127\\.0\\.0\\.1:${puerto}/api`));
      const base = `http://127.0.0.1:${puerto}/api`;
      const [, correo] = /Vendedora:\s+(\S+)/.exec(r.salida);
      const [, clave] = /Contraseña:\s+(\S+)/.exec(r.salida);

      const login = await fetch(`${base}/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://127.0.0.1:5500' },
        body: JSON.stringify({ correo, clave }),
      });
      assert.equal(login.status, 200);
      assert.equal(login.headers.get('x-crm-modo'), 'demostracion-local');
      assert.equal(login.headers.get('access-control-allow-origin'), 'http://127.0.0.1:5500');
      const { token } = await login.json();

      const cartera = await fetch(`${base}/clientes`, { headers: { Authorization: `Bearer ${token}` } });
      const clientes = await cartera.json();
      assert.equal(cartera.status, 200);
      assert.equal(clientes.length, 3);
      assert.ok(clientes.every((c) => Object.keys(c).join() === 'id,nombre,nit,telefono,correo'));
    } finally {
      await detener(r.proceso);
    }
  });

  test('el código de la API real (src/) no importa la demostración ni la base simulada', () => {
    const archivos = [];
    const recorrer = (dir) => {
      for (const n of readdirSync(dir)) {
        const p = path.join(dir, n);
        if (statSync(p).isDirectory()) recorrer(p);
        else if (p.endsWith('.js')) archivos.push(p);
      }
    };
    recorrer(path.join(RAIZ_API, 'src'));
    for (const archivo of archivos) {
      const contenido = readFileSync(archivo, 'utf8');
      assert.doesNotMatch(contenido, /from\s+['"][^'"]*(demo\/|test\/|bd-simulada)/, path.relative(RAIZ_API, archivo));
    }
  });
});
