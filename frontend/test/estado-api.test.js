// B2-12 (sesión), B2-14 (401), B2-16 (sin contraseña, errores de conexión) con localStorage y fetch simulados.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// --- Entorno de navegador simulado (antes de importar los módulos) ---
const almacen = new Map();
globalThis.localStorage = {
  getItem: (k) => (almacen.has(k) ? almacen.get(k) : null),
  setItem: (k, v) => almacen.set(k, String(v)),
  removeItem: (k) => almacen.delete(k),
};
globalThis.location = { hash: '#/cartera' };

let respuestaSimulada;
const peticiones = [];
globalThis.fetch = async (url, opciones) => {
  peticiones.push({ url, opciones });
  if (respuestaSimulada instanceof Error) throw respuestaSimulada;
  const { status, cuerpo } = respuestaSimulada;
  return { ok: status >= 200 && status < 300, status, text: async () => (cuerpo === undefined ? '' : JSON.stringify(cuerpo)) };
};

const estado = await import('../js/estado.js');
const api = await import('../js/api.js');

const SESION = { token: 'aaa.bbb.ccc', usuario: { id: 4, nombre: 'Vendedora Uno', correo: 'v1@prueba.test' } };

beforeEach(() => {
  almacen.clear();
  peticiones.length = 0;
  globalThis.location.hash = '#/cartera';
  estado._reiniciarParaPruebas();
});

describe('estado y sesión (B2-12, B2-16)', () => {
  test('guardarSesion guarda solo token y usuario { id, nombre, correo }', () => {
    estado.guardarSesion({ ...SESION, usuario: { ...SESION.usuario, rol: 'vendedor', password: 'x' }, clave: 'secreta' });
    const guardado = JSON.parse(almacen.get('crm.sesion'));
    assert.deepEqual(guardado, SESION);
    assert.doesNotMatch(almacen.get('crm.sesion'), /secreta|password|clave|rol/);
    assert.deepEqual(estado.obtenerEstado().sesion, SESION);
  });

  test('la sesión guardada se recupera al iniciar', () => {
    almacen.set('crm.sesion', JSON.stringify(SESION));
    estado._reiniciarParaPruebas();
    assert.deepEqual(estado.obtenerEstado().sesion, SESION);
  });

  test('una sesión guardada corrupta o incompleta se ignora', () => {
    for (const crudo of ['{no-json', '{}', '{"token":""}', '{"token":"x"}', 'null']) {
      almacen.set('crm.sesion', crudo);
      estado._reiniciarParaPruebas();
      assert.equal(estado.obtenerEstado().sesion, null, crudo);
    }
  });

  test('cerrarSesion borra el almacenamiento y el estado (B2-13)', () => {
    estado.guardarSesion(SESION);
    estado.cerrarSesion();
    assert.equal(almacen.has('crm.sesion'), false);
    assert.equal(estado.obtenerEstado().sesion, null);
  });

  test('si localStorage falla, la aplicación sigue funcionando', () => {
    const original = globalThis.localStorage;
    globalThis.localStorage = { getItem() { throw new Error('bloqueado'); }, setItem() { throw new Error('bloqueado'); }, removeItem() { throw new Error('bloqueado'); } };
    try {
      estado._reiniciarParaPruebas();
      assert.equal(estado.obtenerEstado().sesion, null);
      assert.doesNotThrow(() => estado.guardarSesion(SESION));
      assert.deepEqual(estado.obtenerEstado().sesion, SESION);
      assert.doesNotThrow(() => estado.cerrarSesion());
    } finally {
      globalThis.localStorage = original;
    }
  });

  test('suscribir notifica cada actualización (estado → render)', () => {
    const vistos = [];
    estado.suscribir((e) => vistos.push(e.ruta));
    estado.actualizar({ ruta: '#/cartera' });
    estado.actualizar((e) => ({ ruta: `${e.ruta}?x` }));
    assert.deepEqual(vistos, ['#/cartera', '#/cartera?x']);
  });
});

describe('api.js', () => {
  test('iniciarSesion envía POST /auth/login con { correo, clave } y sin Authorization', async () => {
    estado.guardarSesion(SESION);
    respuestaSimulada = { status: 200, cuerpo: { token: 't', usuario: SESION.usuario } };
    const r = await api.iniciarSesion('v1@prueba.test', 'secreta');
    assert.equal(r.ok, true);
    const { url, opciones } = peticiones[0];
    assert.equal(url, `${api.URL_API}/auth/login`);
    assert.equal(opciones.method, 'POST');
    assert.deepEqual(JSON.parse(opciones.body), { correo: 'v1@prueba.test', clave: 'secreta' });
    assert.equal(opciones.headers.Authorization, undefined);
    assert.equal(opciones.headers['Content-Type'], 'application/json');
  });

  test('un 401 del login no cierra la sesión ni muestra "sesión expirada"', async () => {
    respuestaSimulada = { status: 401, cuerpo: { error: 'Credenciales incorrectas' } };
    const r = await api.iniciarSesion('v1@prueba.test', 'mala');
    assert.equal(r.status, 401);
    assert.equal(r.datos.error, 'Credenciales incorrectas');
    assert.equal(estado.obtenerEstado().aviso, null);
  });

  test('obtenerClientes envía el token como Bearer y devuelve el array', async () => {
    estado.guardarSesion(SESION);
    respuestaSimulada = { status: 200, cuerpo: [{ id: 1, nombre: 'X', nit: 'CF', telefono: '22223333', correo: null }] };
    const r = await api.obtenerClientes();
    assert.equal(peticiones[0].url, `${api.URL_API}/clientes`);
    assert.equal(peticiones[0].opciones.headers.Authorization, 'Bearer aaa.bbb.ccc');
    assert.ok(Array.isArray(r.datos));
  });

  test('B2-14: un 401 en una ruta protegida borra la sesión, avisa y redirige al login', async () => {
    estado.guardarSesion(SESION);
    respuestaSimulada = { status: 401, cuerpo: { error: 'Autenticación requerida o sesión no válida' } };
    const r = await api.obtenerClientes();
    assert.equal(r.status, 401);
    assert.equal(estado.obtenerEstado().sesion, null);
    assert.equal(almacen.has('crm.sesion'), false);
    assert.equal(globalThis.location.hash, '#/login');
    assert.deepEqual(estado.obtenerEstado().aviso, { tipo: 'warning', texto: api.MENSAJE_SESION_EXPIRADA });
  });

  test('B2-16: un fallo de red devuelve status 0 y el mensaje de conexión, sin lanzar', async () => {
    estado.guardarSesion(SESION);
    respuestaSimulada = new TypeError('Failed to fetch');
    const r = await api.obtenerClientes();
    assert.deepEqual(r, { ok: false, status: 0, datos: { error: api.MENSAJE_SIN_CONEXION }, errorRed: true });
    assert.deepEqual(estado.obtenerEstado().sesion, SESION, 'un error de red no cierra la sesión');
  });

  test('una respuesta que no es JSON no rompe la aplicación', async () => {
    globalThis.fetch = async () => ({ ok: false, status: 502, text: async () => '<html>Bad Gateway</html>' });
    try {
      const r = await api.obtenerClientes();
      assert.deepEqual(r, { ok: false, status: 502, datos: null });
    } finally {
      globalThis.fetch = async (url, opciones) => {
        peticiones.push({ url, opciones });
        const { status, cuerpo } = respuestaSimulada;
        return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(cuerpo) };
      };
    }
  });
});
