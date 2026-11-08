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

// ---------------------------------------------------------------------------
// B3 — acciones de cartera (acciones-cartera.js) con fetch simulado por ruta
// ---------------------------------------------------------------------------
const acciones = await import('../js/acciones-cartera.js');

describe('B3 acciones de cartera', () => {
  let rutas;
  const responder = (metodo, ruta, status, cuerpo) => { rutas.set(`${metodo} ${ruta}`, { status, cuerpo }); };
  beforeEach(() => {
    rutas = new Map();
    globalThis.fetch = async (url, opciones = {}) => {
      peticiones.push({ url, opciones });
      const clave = `${opciones.method ?? 'GET'} ${url.replace(api.URL_API, '')}`;
      const r = rutas.get(clave);
      if (!r) throw new TypeError(`sin respuesta simulada para ${clave}`);
      return { ok: r.status >= 200 && r.status < 300, status: r.status, text: async () => (r.cuerpo === undefined ? '' : JSON.stringify(r.cuerpo)) };
    };
    estado.guardarSesion(SESION);
  });
  const c = () => estado.obtenerEstado().cartera;
  const CLIENTES = [{ id: 1, nombre: 'Uno', nit: 'CF', telefono: '22223333', correo: null }, { id: 2, nombre: 'Dos', nit: '4521817K', telefono: '33334444', correo: 'd@x.test' }];

  test('cargarCartera guarda clientes y total; con búsqueda pide también el listado completo', async () => {
    responder('GET', '/clientes', 200, CLIENTES);
    responder('GET', '/clientes?q=dos', 200, [CLIENTES[1]]);
    await acciones.cargarCartera();
    assert.equal(c().total, 2);
    await acciones.buscar('  dos ');
    assert.deepEqual(c().clientes, [CLIENTES[1]]);
    assert.equal(c().total, 2);
    assert.equal(c().busqueda, 'dos');
    await acciones.limpiarBusqueda();
    assert.equal(c().busqueda, '');
    assert.equal(c().clientes.length, 2);
  });

  test('la búsqueda codifica q en la URL', async () => {
    responder('GET', '/clientes?q=%27+OR+1%3D1+--', 200, []);
    responder('GET', '/clientes', 200, CLIENTES);
    await acciones.buscar("' OR 1=1 --");
    assert.ok(peticiones.some((p) => p.url.endsWith('/clientes?q=%27+OR+1%3D1+--')));
    assert.deepEqual(c().clientes, []);
    assert.equal(c().total, 2);
  });

  test('B3-14: un 422 conserva lo escrito y guarda los errores por campo', async () => {
    acciones.abrirNuevo();
    responder('POST', '/clientes', 422, { errores: { nit: 'El NIT no es válido' } });
    peticiones.length = 0;
    await acciones.enviarFormulario({ nombre: 'Bella', nit: '4521817-1', telefono: '23456789', correo: '' });
    assert.deepEqual(c().formulario.valores, { nombre: 'Bella', nit: '4521817-1', telefono: '23456789', correo: '' });
    assert.deepEqual(c().formulario.errores, { nit: 'El NIT no es válido' });
    assert.equal(c().formulario.enviando, false);
    assert.equal(peticiones.length, 1);
    assert.deepEqual(JSON.parse(peticiones[0].opciones.body), { nombre: 'Bella', nit: '4521817-1', telefono: '23456789' });
  });

  test('un 409 en el alta se muestra como mensaje y conserva los valores', async () => {
    acciones.abrirNuevo();
    responder('POST', '/clientes', 409, { error: 'Su cartera ya tiene el máximo de 10 clientes' });
    await acciones.enviarFormulario({ nombre: 'X', nit: 'CF', telefono: '23456789', correo: 'x@y.test' });
    assert.deepEqual(c().formulario.mensaje, { tipo: 'danger', texto: 'Su cartera ya tiene el máximo de 10 clientes' });
    assert.equal(c().formulario.valores.correo, 'x@y.test');
  });

  test('alta correcta: cierra el formulario, avisa y actualiza la lista', async () => {
    acciones.abrirNuevo();
    responder('POST', '/clientes', 201, { id: 3, nombre: 'Tres', nit: 'CF', telefono: '44445555', correo: null });
    responder('GET', '/clientes', 200, [...CLIENTES, { id: 3, nombre: 'Tres', nit: 'CF', telefono: '44445555', correo: null }]);
    await acciones.enviarFormulario({ nombre: 'Tres', nit: 'cf', telefono: '4444-5555', correo: '' });
    assert.equal(c().formulario, null);
    assert.equal(c().total, 3);
    assert.equal(estado.obtenerEstado().aviso.tipo, 'success');
  });

  test('edición: carga el cliente con GET /:id y envía solo los campos cambiados (B3-13)', async () => {
    responder('GET', '/clientes/2', 200, CLIENTES[1]);
    await acciones.abrirEdicion(2);
    assert.deepEqual(c().formulario.valores, { nombre: 'Dos', nit: '4521817K', telefono: '33334444', correo: 'd@x.test' });
    responder('PATCH', '/clientes/2', 200, { ...CLIENTES[1], telefono: '55556666', correo: null });
    responder('GET', '/clientes', 200, CLIENTES);
    peticiones.length = 0;
    await acciones.enviarFormulario({ nombre: 'Dos', nit: '4521817K', telefono: '5555-6666', correo: '' });
    const patch = peticiones.find((p) => p.opciones.method === 'PATCH');
    assert.deepEqual(JSON.parse(patch.opciones.body), { telefono: '5555-6666', correo: null });
    assert.equal(c().formulario, null);
  });

  test('edición sin cambios: no envía la petición', async () => {
    responder('GET', '/clientes/1', 200, CLIENTES[0]);
    await acciones.abrirEdicion(1);
    peticiones.length = 0;
    await acciones.enviarFormulario({ nombre: 'Uno', nit: 'CF', telefono: '22223333', correo: '' });
    assert.equal(peticiones.length, 0);
    assert.equal(c().formulario.mensaje.tipo, 'info');
  });

  test('editar un cliente que ya no es propio (404) cierra el formulario y avisa', async () => {
    responder('GET', '/clientes/9', 404, { error: 'Cliente no encontrado' });
    responder('GET', '/clientes', 200, CLIENTES);
    await acciones.abrirEdicion(9);
    assert.equal(c().formulario, null);
    assert.deepEqual(estado.obtenerEstado().aviso, { tipo: 'warning', texto: 'Cliente no encontrado' });
  });

  test('tomar: éxito actualiza cartera y disponibles; 409 muestra el mensaje y recarga las listas', async () => {
    responder('GET', '/clientes', 200, CLIENTES);
    await acciones.cargarCartera();
    responder('GET', '/clientes/disponibles', 200, [{ id: 7, nombre: 'Libre' }, { id: 8, nombre: 'Otro' }]);
    await acciones.verDisponibles();
    assert.equal(c().disponibles.lista.length, 2);

    responder('POST', '/clientes/7/tomar', 200, { id: 7, nombre: 'Libre', nit: 'CF', telefono: '77778888', correo: null });
    responder('GET', '/clientes', 200, [...CLIENTES, { id: 7, nombre: 'Libre', nit: 'CF', telefono: '77778888', correo: null }]);
    responder('GET', '/clientes/disponibles', 200, [{ id: 8, nombre: 'Otro' }]);
    await acciones.tomar(7);
    assert.equal(c().total, 3);
    assert.deepEqual(c().disponibles.lista, [{ id: 8, nombre: 'Otro' }]);
    assert.match(estado.obtenerEstado().aviso.texto, /Libre/);

    responder('POST', '/clientes/8/tomar', 409, { error: 'El cliente ya no está disponible' });
    responder('GET', '/clientes/disponibles', 200, []);
    await acciones.tomar(8);
    assert.equal(c().disponibles.error, 'El cliente ya no está disponible');
    assert.deepEqual(c().disponibles.lista, []);
    assert.equal(c().disponibles.tomando, null);
  });

  test('un 401 durante una acción cierra la sesión (B2-14) y reinicia la cartera', async () => {
    acciones.abrirNuevo();
    responder('POST', '/clientes', 401, { error: 'Autenticación requerida o sesión no válida' });
    await acciones.enviarFormulario({ nombre: 'X', nit: 'CF', telefono: '23456789', correo: '' });
    assert.equal(estado.obtenerEstado().sesion, null);
    assert.equal(c().formulario, null);
    assert.equal(globalThis.location.hash, '#/login');
  });

  test('sin conexión: la cartera muestra el mensaje de red', async () => {
    rutas.clear(); // el fetch simulado lanza TypeError
    await acciones.cargarCartera();
    assert.equal(c().error, api.MENSAJE_SIN_CONEXION);
    assert.equal(c().cargando, false);
  });
});
