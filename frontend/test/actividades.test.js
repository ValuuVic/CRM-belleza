// B5-16 a B5-20: vista de actividades, alta con fecha de Guatemala, vencidas, «Completar» y errores.
// Vistas (funciones puras) y acciones con localStorage, location y fetch simulados.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// --- Entorno de navegador simulado (antes de importar los módulos) ---
const almacen = new Map();
globalThis.localStorage = {
  getItem: (k) => (almacen.has(k) ? almacen.get(k) : null),
  setItem: (k, v) => almacen.set(k, String(v)),
  removeItem: (k) => almacen.delete(k),
};
globalThis.location = { hash: '#/actividades' };

let rutas = new Map();
const peticiones = [];
let sinConexion = false;
globalThis.fetch = async (url, opciones = {}) => {
  peticiones.push({ url, opciones });
  if (sinConexion) throw new TypeError('Failed to fetch');
  const clave = `${opciones.method ?? 'GET'} ${url.replace(api.URL_API, '')}`;
  const r = rutas.get(clave);
  if (!r) throw new TypeError(`sin respuesta simulada para ${clave}`);
  return { ok: r.status >= 200 && r.status < 300, status: r.status, text: async () => (r.cuerpo === undefined ? '' : JSON.stringify(r.cuerpo)) };
};
const responder = (metodo, ruta, status, cuerpo) => rutas.set(`${metodo} ${ruta}`, { status, cuerpo });

const estado = await import('../js/estado.js');
const api = await import('../js/api.js');
const acciones = await import('../js/acciones-actividades.js');
const { renderActividades } = await import('../js/vistas/actividades.js');
const { localGuatemalaAIso, formatearFecha } = await import('../js/util/formato.js');

const SESION = { token: 'aaa.bbb.ccc', usuario: { id: 4, nombre: 'Vendedora Uno', correo: 'v1@prueba.test' } };
const actividad = (id, extra = {}) => ({
  id, cliente: { id: 10, nombre: 'Tienda Beta' }, tipo: 'llamada', descripcion: `Actividad ${id}`,
  vence_en: '2099-01-01T16:00:00.000Z', completada: false, vencida: false, ...extra,
});
const vista = (cambios = {}) => ({ actividades: { ...estado.actividadesInicial(), cargada: true, ...cambios } });
const act = () => estado.obtenerEstado().actividades;
const ultima = () => peticiones.at(-1);
const cuerpoDe = (p) => JSON.parse(p.opciones.body);

beforeEach(() => {
  almacen.clear();
  peticiones.length = 0;
  rutas = new Map();
  sinConexion = false;
  globalThis.location.hash = '#/actividades';
  estado._reiniciarParaPruebas();
  estado.guardarSesion(SESION);
});

// ---------------------------------------------------------------------------

describe('B5-16 vista con pestañas Pendientes y Completadas', () => {
  test('dos pestañas con la activa marcada y la lista de actividades', () => {
    const html = renderActividades(vista({ lista: [actividad(1), actividad(2, { tipo: 'reunion' })] }));
    assert.match(html, /data-accion="pestana-actividades" data-estado="pendiente"[^>]*>Pendientes</);
    assert.match(html, /data-accion="pestana-actividades" data-estado="completada"[^>]*>Completadas</);
    assert.match(html, /class="nav-link active"[^>]*aria-selected="true" data-accion="pestana-actividades" data-estado="pendiente"/);
    assert.match(html, /Actividad 1[\s\S]*Actividad 2/);
    assert.match(html, />Llamada</);
    assert.match(html, />Reunión</);
  });

  test('cargarActividades pide la pestaña activa al servidor', async () => {
    responder('GET', '/actividades?estado=pendiente', 200, [actividad(1)]);
    await acciones.cargarActividades();
    assert.equal(ultima().url, `${api.URL_API}/actividades?estado=pendiente`);
    assert.equal(ultima().opciones.headers.Authorization, `Bearer ${SESION.token}`);
    assert.deepEqual(act().lista.map((a) => a.id), [1]);
    assert.equal(act().cargada, true);
  });

  test('cambiar a Completadas consulta ?estado=completada y reemplaza la lista', async () => {
    responder('GET', '/actividades?estado=completada', 200, [actividad(9, { completada: true })]);
    await acciones.cambiarPestana('completada');
    assert.equal(act().pestana, 'completada');
    assert.equal(ultima().url, `${api.URL_API}/actividades?estado=completada`);
    assert.deepEqual(act().lista.map((a) => a.id), [9]);
  });

  test('una pestaña desconocida no hace peticiones', async () => {
    await acciones.cambiarPestana('cancelada');
    assert.equal(peticiones.length, 0);
    assert.equal(act().pestana, 'pendiente');
  });

  test('una respuesta tardía de otra pestaña no sobrescribe la lista actual', async () => {
    let soltar;
    const lenta = new Promise((r) => { soltar = r; });
    const fetchOriginal = globalThis.fetch;
    globalThis.fetch = async (url, op) => {
      if (url.endsWith('estado=pendiente')) { await lenta; return { ok: true, status: 200, text: async () => JSON.stringify([actividad(1)]) }; }
      return fetchOriginal(url, op);
    };
    try {
      responder('GET', '/actividades?estado=completada', 200, [actividad(9, { completada: true })]);
      const primera = acciones.cargarActividades();
      await acciones.cambiarPestana('completada');
      soltar();
      await primera;
      assert.deepEqual(act().lista.map((a) => a.id), [9]);
    } finally { globalThis.fetch = fetchOriginal; }
  });

  test('estados de carga, vacío y error con reintento', () => {
    assert.match(renderActividades({ actividades: { ...estado.actividadesInicial(), cargando: true } }), /spinner-border[\s\S]*Cargando actividades/);
    assert.match(renderActividades(vista()), /No tiene actividades pendientes/);
    assert.match(renderActividades(vista({ pestana: 'completada' })), /Todavía no hay actividades completadas/);
    const error = renderActividades(vista({ error: 'No se pudieron cargar las actividades.' }));
    assert.match(error, /alert-danger[\s\S]*data-accion="reintentar-actividades"/);
  });

  test('cerrar sesión limpia las actividades del estado', () => {
    estado.actualizar({ actividades: { ...estado.actividadesInicial(), lista: [actividad(1)] } });
    estado.cerrarSesion();
    assert.deepEqual(act(), estado.actividadesInicial());
  });
});

describe('B5-17 alta de actividades con fecha de Guatemala', () => {
  test('localGuatemalaAIso convierte el valor de datetime-local con -06:00, sin depender del navegador', () => {
    assert.equal(localGuatemalaAIso('2026-12-01T10:00'), '2026-12-01T10:00:00-06:00');
    assert.equal(localGuatemalaAIso('2026-12-31T22:30'), '2026-12-31T22:30:00-06:00');
    assert.equal(localGuatemalaAIso('2026-12-01T10:00:45'), '2026-12-01T10:00:45-06:00');
    assert.equal(localGuatemalaAIso(''), null);
    assert.equal(localGuatemalaAIso('   '), null);
    assert.equal(localGuatemalaAIso(undefined), null);
    assert.equal(localGuatemalaAIso('mañana'), 'mañana'); // la API responde 422 y se muestra bajo el campo
    // Ida y vuelta: lo que se escribe a las 10:00 se muestra a las 10:00 en Guatemala.
    assert.equal(new Date(localGuatemalaAIso('2026-12-01T10:00')).toISOString(), '2026-12-01T16:00:00.000Z');
  });

  test('el formulario ofrece la cartera, los tres tipos, la descripción y la fecha opcional', () => {
    const html = renderActividades(vista({
      clientes: [{ id: 10, nombre: 'Tienda Beta' }, { id: 11, nombre: 'Almacén Alfa' }],
      formulario: { valores: { cliente_id: '', tipo: '', descripcion: '', vence_en: '' }, errores: {}, mensaje: null, enviando: false },
    }));
    assert.match(html, /id="form-actividad"/);
    assert.match(html, /<select id="actividad-cliente" name="cliente_id"[\s\S]*Tienda Beta[\s\S]*Almacén Alfa/);
    assert.match(html, /<option value="llamada">Llamada<\/option>[\s\S]*<option value="reunion">Reunión<\/option>[\s\S]*<option value="tarea">Tarea<\/option>/);
    assert.match(html, /<textarea id="actividad-descripcion" name="descripcion"/);
    assert.match(html, /name="vence_en" type="datetime-local"/);
    assert.match(html, /Vence <span class="text-body-secondary small">\(opcional\)<\/span>/);
  });

  test('abrirNueva carga los clientes de la cartera', async () => {
    responder('GET', '/clientes', 200, [{ id: 10, nombre: 'Tienda Beta', nit: 'CF', telefono: '55551234', correo: null }]);
    await acciones.abrirNueva();
    assert.deepEqual(act().clientes, [{ id: 10, nombre: 'Tienda Beta' }]);
    assert.equal(act().formulario.cargandoClientes, false);
  });

  test('envía POST /clientes/:id/actividades con vence_en en ISO -06:00 y recarga Pendientes', async () => {
    estado.actualizar({ actividades: { ...act(), formulario: { valores: {}, errores: {}, mensaje: null, enviando: false } } });
    responder('POST', '/clientes/10/actividades', 201, actividad(50));
    responder('GET', '/actividades?estado=pendiente', 200, [actividad(50)]);
    await acciones.enviarNueva({ cliente_id: '10', tipo: 'reunion', descripcion: 'Presentar labiales', vence_en: '2026-12-01T10:00' });
    const post = peticiones.find((p) => p.opciones.method === 'POST');
    assert.equal(post.url, `${api.URL_API}/clientes/10/actividades`);
    assert.deepEqual(cuerpoDe(post), { tipo: 'reunion', descripcion: 'Presentar labiales', vence_en: '2026-12-01T10:00:00-06:00' });
    assert.equal(act().formulario, null);
    assert.deepEqual(act().mensaje, { tipo: 'success', texto: 'Actividad registrada.' });
    assert.deepEqual(act().lista.map((a) => a.id), [50]);
  });

  test('sin fecha no envía vence_en; nunca envía vendedor_id ni cliente_id en el cuerpo', async () => {
    estado.actualizar({ actividades: { ...act(), formulario: { valores: {}, errores: {}, mensaje: null, enviando: false } } });
    responder('POST', '/clientes/11/actividades', 201, actividad(51));
    responder('GET', '/actividades?estado=pendiente', 200, []);
    await acciones.enviarNueva({ cliente_id: '11', tipo: 'tarea', descripcion: 'Enviar catálogo', vence_en: '' });
    assert.deepEqual(cuerpoDe(peticiones.find((p) => p.opciones.method === 'POST')), { tipo: 'tarea', descripcion: 'Enviar catálogo' });
  });

  test('sin cliente seleccionado muestra el error junto al campo sin llamar a la API', async () => {
    estado.actualizar({ actividades: { ...act(), formulario: { valores: {}, errores: {}, mensaje: null, enviando: false } } });
    await acciones.enviarNueva({ cliente_id: '', tipo: 'tarea', descripcion: 'x' });
    assert.equal(peticiones.length, 0);
    assert.ok(act().formulario.errores.cliente_id);
  });
});

describe('B5-18 vencimientos', () => {
  test('una actividad vencida lleva la etiqueta «Vencida»; las demás no', () => {
    const html = renderActividades(vista({ lista: [actividad(1, { vencida: true, vence_en: '2020-01-15T15:00:00.000Z' }), actividad(2)] }));
    assert.equal((html.match(/badge text-bg-danger">Vencida</g) || []).length, 1);
    assert.match(html, /list-group-item list-group-item-danger" data-id="1"/);
    assert.match(html, /1 actividad vencida/);
    assert.doesNotMatch(html, /data-id="2"[^>]*>[\s\S]{0,200}Vencida</);
  });

  test('la etiqueta depende de `vencida` de la API, no de la fecha (completada con fecha pasada → sin etiqueta)', () => {
    const html = renderActividades(vista({ pestana: 'completada', lista: [actividad(3, { completada: true, vencida: false, vence_en: '2020-01-01T00:00:00.000Z' })] }));
    assert.doesNotMatch(html, />Vencida</);
    assert.match(html, />Completada</);
  });

  test('las fechas se muestran en hora de Guatemala (16:00 UTC → 10:00)', () => {
    const html = renderActividades(vista({ lista: [actividad(1, { vence_en: '2026-12-01T16:00:00.000Z' })] }));
    assert.match(html, /Vence: 1&#x2F;12&#x2F;2026, 10:00/);
    assert.equal(formatearFecha('2026-11-01T03:30:00.000Z'), formatearFecha('2026-10-31T21:30:00-06:00')); // mismo instante
    assert.match(renderActividades(vista({ lista: [actividad(2, { vence_en: null })] })), /Sin fecha de vencimiento/);
  });
});

describe('B5-19 completar desde la SPA', () => {
  test('«Completar» solo aparece en pendientes', () => {
    const html = renderActividades(vista({ lista: [actividad(1), actividad(2, { completada: true })] }));
    assert.equal((html.match(/data-accion="completar-actividad"/g) || []).length, 1);
    assert.match(html, /data-accion="completar-actividad"\s+data-id="1"/);
  });

  test('envía PATCH { completada: true } y quita la actividad de Pendientes solo tras el 200', async () => {
    estado.actualizar({ actividades: { ...act(), cargada: true, lista: [actividad(1), actividad(2)] } });
    let soltar;
    const espera = new Promise((r) => { soltar = r; });
    const fetchOriginal = globalThis.fetch;
    globalThis.fetch = async (url, op) => { await espera; return fetchOriginal(url, op); };
    responder('PATCH', '/actividades/1', 200, actividad(1, { completada: true }));
    try {
      const promesa = acciones.completar('1');
      await new Promise((r) => setImmediate(r));
      // Mientras espera la respuesta: botones deshabilitados, la actividad sigue en la lista.
      assert.equal(act().completando, 1);
      assert.deepEqual(act().lista.map((a) => a.id), [1, 2]);
      const html = renderActividades(estado.obtenerEstado());
      assert.match(html, /Completando…/);
      assert.equal((html.match(/data-accion="completar-actividad"[^>]*disabled/g) || []).length, 2);
      soltar();
      await promesa;
    } finally { globalThis.fetch = fetchOriginal; }
    const patch = peticiones.find((p) => p.opciones.method === 'PATCH');
    assert.equal(patch.url, `${api.URL_API}/actividades/1`);
    assert.deepEqual(cuerpoDe(patch), { completada: true });
    assert.deepEqual(act().lista.map((a) => a.id), [2]);
    assert.equal(act().completando, null);
    assert.equal(act().mensaje.tipo, 'success');
  });

  test('con 404 o 500 la lista no cambia y se muestra el mensaje', async () => {
    for (const [status, cuerpo, texto] of [[404, { error: 'Actividad no encontrada' }, /ya no pertenece/], [500, { error: 'Error interno del servidor' }, /Error interno/]]) {
      estado.actualizar({ actividades: { ...estado.actividadesInicial(), cargada: true, lista: [actividad(1)] } });
      responder('PATCH', '/actividades/1', status, cuerpo);
      await acciones.completar(1);
      assert.deepEqual(act().lista.map((a) => a.id), [1]);
      assert.equal(act().mensaje.tipo, 'danger');
      assert.match(act().mensaje.texto, texto);
    }
  });

  test('un segundo clic mientras se completa no envía otra petición', async () => {
    estado.actualizar({ actividades: { ...act(), completando: 1, lista: [actividad(1)] } });
    await acciones.completar(1);
    assert.equal(peticiones.length, 0);
  });
});

describe('B5-20 seguridad y errores de interfaz', () => {
  const xss = '<img src=x onerror=alert(1)>';

  test('escapa todos los textos de la API (cliente, descripción, tipo desconocido y mensajes)', () => {
    const html = renderActividades(vista({
      mensaje: { tipo: 'danger', texto: xss },
      lista: [actividad(1, { cliente: { id: 10, nombre: xss }, descripcion: `"><script>alert(2)</script>`, tipo: xss })],
      clientes: [{ id: 10, nombre: xss }],
      formulario: { valores: { cliente_id: '10', tipo: '', descripcion: xss, vence_en: '' }, errores: { descripcion: xss }, mensaje: { tipo: 'danger', texto: xss }, enviando: false },
    }));
    assert.doesNotMatch(html, /<img|<script>|onerror=alert/);
    assert.match(html, /&lt;img src&#x3D;x onerror&#x3D;alert\(1\)&gt;/);
  });

  test('un 422 muestra los errores junto a los campos y conserva lo escrito', async () => {
    estado.actualizar({ actividades: { ...act(), clientes: [{ id: 10, nombre: 'Tienda Beta' }], formulario: { valores: {}, errores: {}, mensaje: null, enviando: false } } });
    responder('POST', '/clientes/10/actividades', 422, { errores: { vence_en: 'Indique la fecha con zona horaria', descripcion: 'La descripción no puede superar 500 caracteres' } });
    await acciones.enviarNueva({ cliente_id: '10', tipo: 'tarea', descripcion: 'Texto escrito', vence_en: '2026-12-01T10:00' });
    const f = act().formulario;
    assert.equal(f.enviando, false);
    assert.deepEqual(f.valores, { cliente_id: '10', tipo: 'tarea', descripcion: 'Texto escrito', vence_en: '2026-12-01T10:00' });
    const html = renderActividades(estado.obtenerEstado());
    assert.match(html, /id="actividad-vence-error" class="invalid-feedback">Indique la fecha con zona horaria/);
    assert.match(html, /id="actividad-descripcion-error" class="invalid-feedback">La descripción no puede superar 500 caracteres/);
    assert.match(html, />Texto escrito<\/textarea>/);
    assert.match(html, /name="vence_en" type="datetime-local"[^>]*value="2026-12-01T10:00"/);
    assert.match(html, /<option value="10" selected>Tienda Beta<\/option>/);
    assert.match(html, /<option value="tarea" selected>Tarea<\/option>/);
  });

  test('un 404 al crear (cliente reasignado) se muestra bajo el campo cliente', async () => {
    estado.actualizar({ actividades: { ...act(), formulario: { valores: {}, errores: {}, mensaje: null, enviando: false } } });
    responder('POST', '/clientes/12/actividades', 404, { error: 'Cliente no encontrado' });
    await acciones.enviarNueva({ cliente_id: '12', tipo: 'tarea', descripcion: 'x' });
    assert.match(act().formulario.errores.cliente_id, /ya no está en su cartera/);
  });

  test('sin conexión: mensaje de error de conexión en la lista y en el formulario', async () => {
    sinConexion = true;
    await acciones.cargarActividades();
    assert.equal(act().error, api.MENSAJE_SIN_CONEXION);
    estado.actualizar({ actividades: { ...act(), formulario: { valores: {}, errores: {}, mensaje: null, enviando: false } } });
    await acciones.enviarNueva({ cliente_id: '10', tipo: 'tarea', descripcion: 'x' });
    assert.equal(act().formulario.mensaje.texto, api.MENSAJE_SIN_CONEXION);
    assert.equal(act().formulario.enviando, false);
  });

  test('un 401 cierra la sesión, avisa y vuelve al login (sesión de B2)', async () => {
    responder('GET', '/actividades?estado=pendiente', 401, { error: 'Autenticación requerida o sesión no válida' });
    await acciones.cargarActividades();
    assert.equal(estado.obtenerEstado().sesion, null);
    assert.equal(globalThis.location.hash, '#/login');
    assert.equal(estado.obtenerEstado().aviso.texto, api.MENSAJE_SESION_EXPIRADA);
    assert.equal(almacen.size, 0);
  });

  test('una respuesta que llega después de cerrar sesión y entrar otra persona se descarta (S4)', async () => {
    let soltar;
    const espera = new Promise((r) => { soltar = r; });
    const fetchOriginal = globalThis.fetch;
    globalThis.fetch = async (url, op) => { await espera; return fetchOriginal(url, op); };
    responder('GET', '/actividades?estado=pendiente', 200, [actividad(1, { descripcion: 'Dato de la sesión A' })]);
    responder('GET', '/clientes', 200, [{ id: 10, nombre: 'Cliente de A' }]);
    try {
      const listado = acciones.cargarActividades();
      const clientes = acciones.abrirNueva();
      estado.cerrarSesion();
      estado.guardarSesion({ token: 'ddd.eee.fff', usuario: { id: 5, nombre: 'Vendedor B', correo: 'b@prueba.test' } });
      soltar();
      await Promise.all([listado, clientes]);
    } finally { globalThis.fetch = fetchOriginal; }
    assert.deepEqual(act().lista, []);
    assert.deepEqual(act().clientes, []);
  });

  test('diseño adaptable: la lista y el formulario usan rejilla y flex que se apilan en móvil', () => {
    const html = renderActividades(vista({
      lista: [actividad(1)],
      formulario: { valores: { cliente_id: '', tipo: '', descripcion: '', vence_en: '' }, errores: {}, mensaje: null, enviando: false },
    }));
    assert.match(html, /col-12 col-md-6/);
    assert.match(html, /d-flex flex-wrap/);
    assert.match(html, /text-break/);
  });
});
