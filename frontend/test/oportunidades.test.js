// B4-22 a B4-25: tablero, detalle, transiciones visibles, motivo de pérdida, errores y escapado.
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
globalThis.location = { hash: '#/oportunidades' };

let rutas = new Map();
const peticiones = [];
globalThis.fetch = async (url, opciones = {}) => {
  peticiones.push({ url, opciones });
  const clave = `${opciones.method ?? 'GET'} ${url.replace(api.URL_API, '')}`;
  const r = rutas.get(clave);
  if (!r) throw new TypeError(`sin respuesta simulada para ${clave}`);
  return { ok: r.status >= 200 && r.status < 300, status: r.status, text: async () => (r.cuerpo === undefined ? '' : JSON.stringify(r.cuerpo)) };
};
const responder = (metodo, ruta, status, cuerpo) => rutas.set(`${metodo} ${ruta}`, { status, cuerpo });

const estado = await import('../js/estado.js');
const api = await import('../js/api.js');
const acciones = await import('../js/acciones-oportunidades.js');
const { renderOportunidades } = await import('../js/vistas/oportunidades.js');
const { renderOportunidad } = await import('../js/vistas/oportunidad.js');
const { transicionesVisibles } = await import('../js/util/embudo.js');
const { formatearQuetzales } = await import('../js/util/formato.js');

const SESION = { token: 'aaa.bbb.ccc', usuario: { id: 4, nombre: 'Vendedora Uno', correo: 'v1@prueba.test' } };

const resumen = (id, etapa, extra = {}) => ({ id, cliente: { id: 10, nombre: 'Tienda Beta' }, titulo: `Oportunidad ${id}`, etapa, probabilidad: 0, total: 100, fecha_cierre: null, ...extra });
const detalle = (extra = {}) => ({
  id: 100, cliente: { id: 10, nombre: 'Tienda Beta' }, titulo: 'Pedido de temporada', etapa: 'negociacion', probabilidad: 75,
  total: 549.99, fecha_cierre: null, motivo_perdida: null,
  productos: [
    { id: 500, producto_id: 1, nombre: 'Base líquida HD', cantidad: 3, precio_unitario: 150, subtotal: 450 },
    { id: 501, producto_id: 2, nombre: 'Labial mate', cantidad: 3, precio_unitario: 33.33, subtotal: 99.99 },
  ],
  historial: [
    { etapa_anterior: null, etapa_nueva: 'prospecto', usuario: 'Vendedora Uno', fecha: '2026-10-01T15:00:00.000Z' },
    { etapa_anterior: 'propuesta', etapa_nueva: 'negociacion', usuario: 'Vendedora Uno', fecha: '2026-10-07T15:00:00.000Z' },
  ],
  ...extra,
});
const CATALOGO = [
  { id: 1, nombre: 'Base líquida HD', precio: 150, stock: 10 },
  { id: 2, nombre: 'Labial mate', precio: 33.33, stock: 2 },
  { id: 3, nombre: 'Paleta de sombras', precio: 250, stock: null },
];

/** Estado de vista con el detalle indicado. */
function vistaDetalle(datos, cambios = {}) {
  return { detalle: { ...estado.detalleInicial(), id: String(datos.id), datos, catalogo: CATALOGO, ...cambios } };
}

beforeEach(() => {
  almacen.clear();
  peticiones.length = 0;
  rutas = new Map();
  globalThis.location.hash = '#/oportunidades';
  estado._reiniciarParaPruebas();
  estado.guardarSesion(SESION);
});

describe('B4-22 tablero del embudo', () => {
  const lista = [resumen(1, 'prospecto'), resumen(2, 'calificado'), resumen(3, 'calificado'), resumen(4, 'negociacion'),
    resumen(5, 'ganada', { fecha_cierre: '2026-10-15T16:00:00.000Z', total: 9250 }), resumen(6, 'perdida')];
  const html = renderOportunidades({ oportunidades: { ...estado.tableroInicial(), cargada: true, lista } });

  test('cuatro columnas abiertas con su conteo y una sección de cerradas', () => {
    for (const [id, n] of [['prospecto', 1], ['calificado', 2], ['propuesta', 0], ['negociacion', 1]]) {
      assert.match(html, new RegExp(`id="col-${id}"[\\s\\S]*?badge text-bg-secondary">${n}<`), id);
    }
    assert.match(html, /row-cols-1 row-cols-md-2 row-cols-xl-4/, 'las columnas se apilan en móvil');
    const cerradas = html.slice(html.indexOf('id="titulo-cerradas"'));
    assert.match(cerradas, /Oportunidad 5[\s\S]*Ganada[\s\S]*Q\s?9,250\.00/);
    assert.match(cerradas, /Oportunidad 6[\s\S]*Perdida/);
    assert.doesNotMatch(cerradas, /Oportunidad [1-4]</);
  });

  test('cada oportunidad enlaza a su detalle y muestra el total en quetzales', () => {
    assert.match(html, /href="#&#x2F;oportunidades&#x2F;1"/);
    assert.match(html, /Q\s?100\.00/);
  });

  test('estados de carga y error con reintento', () => {
    assert.match(renderOportunidades({ oportunidades: { ...estado.tableroInicial(), cargando: true } }), /spinner-border[\s\S]*Cargando oportunidades/);
    const error = renderOportunidades({ oportunidades: { ...estado.tableroInicial(), error: 'No se pudo conectar con el servidor.' } });
    assert.match(error, /alert-danger[\s\S]*data-accion="reintentar-oportunidades"/);
  });

  test('formulario de alta con los clientes propios y errores bajo los campos', () => {
    const f = renderOportunidades({ oportunidades: { ...estado.tableroInicial(), cargada: true, clientes: [{ id: 10, nombre: 'Tienda Beta' }],
      formulario: { valores: { cliente_id: '10', titulo: 'Escrito' }, errores: { cliente_id: 'Seleccione un cliente de su cartera' }, mensaje: null, enviando: false } } });
    assert.match(f, /<select id="oportunidad-cliente" name="cliente_id"[\s\S]*<option value="10" selected>Tienda Beta<\/option>/);
    assert.match(f, /id="oportunidad-cliente-error" class="invalid-feedback">Seleccione un cliente de su cartera/);
    assert.match(f, /name="titulo"[^>]*value="Escrito"/);
  });
});

describe('B4-23 detalle de la oportunidad', () => {
  const html = renderOportunidad(vistaDetalle(detalle()));

  test('productos con cantidad, precio almacenado, subtotal y total en quetzales', () => {
    assert.match(html, /Base líquida HD[\s\S]*value="3"[\s\S]*Q\s?150\.00[\s\S]*Q\s?450\.00/);
    assert.match(html, /Labial mate[\s\S]*Q\s?33\.33[\s\S]*Q\s?99\.99/);
    assert.match(html, /<tfoot>[\s\S]*Total[\s\S]*Q\s?549\.99/);
  });

  test('historial con etapas, usuario y fecha en hora de Guatemala (UTC−6)', () => {
    const historial = html.slice(html.indexOf('id="titulo-historial"'));
    assert.match(historial, /Creada en <strong>Prospecto<\/strong>/);
    assert.match(historial, /Propuesta → <strong>Negociación<\/strong>/);
    assert.match(historial, /Vendedora Uno · 7&#x2F;10&#x2F;2026, 9:00/, '15:00 UTC se muestra como 9:00 en Guatemala');
  });

  test('cabecera con etapa, probabilidad, cliente y fecha de cierre cuando está cerrada', () => {
    assert.match(html, /Negociación<\/span>[\s\S]*75 %/);
    const ganada = renderOportunidad(vistaDetalle(detalle({ etapa: 'ganada', probabilidad: 100, fecha_cierre: '2026-10-15T16:00:00.000Z' })));
    assert.match(ganada, /Fecha de cierre<\/dt><dd[^>]*>15&#x2F;10&#x2F;2026, 10:00/, '16:00 UTC → 10:00 en Guatemala');
    const perdida = renderOportunidad(vistaDetalle(detalle({ etapa: 'perdida', probabilidad: 0, motivo_perdida: 'Precio alto' })));
    assert.match(perdida, /Motivo de pérdida[\s\S]*Precio alto/);
  });

  test('el formulario de agregar solo ofrece productos que no están en la oportunidad, con su stock', () => {
    const agregar = html.slice(html.indexOf('id="form-agregar-linea"'));
    assert.doesNotMatch(agregar, /<option value="1"|<option value="2"/);
    assert.match(agregar, /<option value="3">Paleta de sombras — Q\s?250\.00 · sin control de inventario<\/option>/);
    assert.match(agregar, /name="cantidad" type="number"[^>]*min="1" max="999"/);
  });

  test('una oportunidad cerrada no ofrece editar título, productos ni etapa', () => {
    const cerrada = renderOportunidad(vistaDetalle(detalle({ etapa: 'ganada' })));
    assert.doesNotMatch(cerrada, /form-titulo|form-agregar-linea|data-formulario="linea"|quitar-linea|cambiar-etapa/);
    assert.match(cerrada, /La oportunidad está cerrada/);
  });

  test('estados de carga y error del detalle', () => {
    assert.match(renderOportunidad({ detalle: { ...estado.detalleInicial(), cargando: true } }), /Cargando oportunidad/);
    assert.match(renderOportunidad({ detalle: { ...estado.detalleInicial(), error: 'Oportunidad no encontrada' } }), /Oportunidad no encontrada[\s\S]*reintentar-detalle/);
  });
});

describe('B4-24 solo se muestran las transiciones permitidas', () => {
  const botones = (etapa) => [...renderOportunidad(vistaDetalle(detalle({ etapa })))
    .matchAll(/data-accion="cambiar-etapa" data-etapa="([a-z]+)"/g)].map((m) => m[1]);

  test('por etapa', () => {
    assert.deepEqual(botones('prospecto'), ['calificado', 'perdida']);
    assert.deepEqual(botones('calificado'), ['prospecto', 'propuesta', 'perdida']);
    assert.deepEqual(botones('propuesta'), ['calificado', 'negociacion', 'perdida']);
    assert.deepEqual(botones('negociacion'), ['propuesta', 'ganada', 'perdida']);
    assert.deepEqual(botones('ganada'), []);
    assert.deepEqual(botones('perdida'), []);
  });

  test('coinciden con transicionesVisibles y con los textos de los botones', () => {
    assert.deepEqual(transicionesVisibles('negociacion').map((t) => t.tipo), ['retroceder', 'ganar', 'perder']);
    const html = renderOportunidad(vistaDetalle(detalle()));
    assert.match(html, /Retroceder a Propuesta[\s\S]*Marcar como ganada[\s\S]*Marcar como perdida/);
  });
});

describe('B4-25 errores y motivo de pérdida', () => {
  test('el formulario del motivo aparece al marcar como perdida, con su error y lo escrito', () => {
    const html = renderOportunidad(vistaDetalle(detalle(), {
      perdida: true, valores: { ...estado.detalleInicial().valores, perdida: 'Muy caro' }, errores: { ...estado.detalleInicial().errores, perdida: 'Indique el motivo de la pérdida' },
    }));
    assert.match(html, /<form id="form-perdida"[\s\S]*name="motivo_perdida"[^>]*value="Muy caro"[^>]*maxlength="255"/);
    assert.match(html, /id="perdida-motivo-error" class="invalid-feedback">Indique el motivo/);
  });

  test('errores 422 de cantidad bajo la línea y del alta bajo sus campos, conservando lo escrito', () => {
    const base = estado.detalleInicial();
    const html = renderOportunidad(vistaDetalle(detalle(), {
      valores: { ...base.valores, lineas: { 500: '1000' }, linea: { producto_id: '3', cantidad: '0' } },
      errores: { ...base.errores, lineas: { 500: 'La cantidad debe ser un número entero entre 1 y 999' }, linea: { cantidad: 'La cantidad debe ser un número entero entre 1 y 999' } },
    }));
    assert.match(html, /id="linea-cantidad-500"[^>]*is-invalid[^>]*value="1000"/);
    assert.match(html, /id="linea-cantidad-500-error"/);
    assert.match(html, /id="linea-cantidad" name="cantidad"[^>]*is-invalid[^>]*value="0"/);
    assert.match(html, /<option value="3" selected>/);
  });

  test('B4-15 a B4-17: un 409 de stock muestra el mensaje y conserva el estado previo', async () => {
    responder('GET', '/oportunidades/100', 200, detalle());
    responder('GET', '/productos', 200, CATALOGO);
    await acciones.cargarDetalle(100);
    responder('PATCH', '/oportunidades/100/etapa', 409, { error: 'Stock insuficiente para: Labial mate (disponible 2, solicitado 3)' });
    await acciones.cambiarEtapa('ganada');
    const d = estado.obtenerEstado().detalle;
    assert.equal(d.datos.etapa, 'negociacion', 'no se muestra como ganada');
    assert.deepEqual(d.mensaje, { tipo: 'danger', texto: 'Stock insuficiente para: Labial mate (disponible 2, solicitado 3)' });
    assert.equal(d.enviando, null);
    assert.match(renderOportunidad({ detalle: d }), /id="mensaje-detalle" class="alert alert-danger" role="alert" tabindex="-1">Stock insuficiente para: Labial mate/);
    const cuerpo = JSON.parse(peticiones.find((p) => p.opciones.method === 'PATCH').opciones.body);
    assert.deepEqual(cuerpo, { etapa: 'ganada' });
  });

  test('ganar con éxito reemplaza el detalle con la respuesta de la API', async () => {
    responder('GET', '/oportunidades/100', 200, detalle());
    responder('GET', '/productos', 200, CATALOGO);
    await acciones.cargarDetalle(100);
    responder('PATCH', '/oportunidades/100/etapa', 200, detalle({ etapa: 'ganada', probabilidad: 100, fecha_cierre: '2026-11-08T10:00:00.000Z' }));
    await acciones.cambiarEtapa('ganada');
    const d = estado.obtenerEstado().detalle;
    assert.equal(d.datos.etapa, 'ganada');
    assert.equal(d.mensaje.tipo, 'success');
  });

  test('marcar como perdida: abre el formulario sin pedir nada; 422 conserva el motivo; éxito lo cierra', async () => {
    responder('GET', '/oportunidades/100', 200, detalle());
    responder('GET', '/productos', 200, CATALOGO);
    await acciones.cargarDetalle(100);
    peticiones.length = 0;
    await acciones.cambiarEtapa('perdida');
    assert.equal(peticiones.length, 0);
    assert.equal(estado.obtenerEstado().detalle.perdida, true);

    responder('PATCH', '/oportunidades/100/etapa', 422, { errores: { motivo_perdida: 'Indique el motivo de la pérdida' } });
    await acciones.confirmarPerdida('   ');
    let d = estado.obtenerEstado().detalle;
    assert.equal(d.errores.perdida, 'Indique el motivo de la pérdida');
    assert.equal(d.valores.perdida, '   ');
    assert.equal(d.perdida, true);

    responder('PATCH', '/oportunidades/100/etapa', 200, detalle({ etapa: 'perdida', probabilidad: 0, motivo_perdida: 'Precio' }));
    await acciones.confirmarPerdida('Precio');
    d = estado.obtenerEstado().detalle;
    assert.equal(d.perdida, false);
    assert.equal(d.datos.etapa, 'perdida');
    assert.deepEqual(JSON.parse(peticiones.at(-1).opciones.body), { etapa: 'perdida', motivo_perdida: 'Precio' });
  });
});

describe('B4 acciones de la SPA', () => {
  test('la SPA nunca envía precios ni totales al agregar o editar líneas (B4-07, B4-20)', async () => {
    responder('GET', '/oportunidades/100', 200, detalle());
    responder('GET', '/productos', 200, CATALOGO);
    await acciones.cargarDetalle(100);
    responder('POST', '/oportunidades/100/productos', 201, detalle());
    await acciones.agregarProducto({ producto_id: '3', cantidad: '2', precio_unitario: '0.01' });
    assert.deepEqual(JSON.parse(peticiones.at(-1).opciones.body), { producto_id: 3, cantidad: 2 });
    responder('PATCH', '/oportunidades/100/productos/500', 200, detalle());
    await acciones.cambiarCantidad('500', '4');
    assert.deepEqual(JSON.parse(peticiones.at(-1).opciones.body), { cantidad: 4 });
  });

  test('quitar una línea (204) vuelve a pedir el detalle confirmado', async () => {
    responder('GET', '/oportunidades/100', 200, detalle());
    responder('GET', '/productos', 200, CATALOGO);
    await acciones.cargarDetalle(100);
    responder('DELETE', '/oportunidades/100/productos/501', 204);
    responder('GET', '/oportunidades/100', 200, detalle({ productos: [detalle().productos[0]], total: 450 }));
    await acciones.quitarProducto('501');
    const d = estado.obtenerEstado().detalle;
    assert.equal(d.datos.total, 450);
    assert.equal(d.datos.productos.length, 1);
  });

  test('un 422 al agregar conserva lo escrito y guarda los errores por campo', async () => {
    responder('GET', '/oportunidades/100', 200, detalle());
    responder('GET', '/productos', 200, CATALOGO);
    await acciones.cargarDetalle(100);
    responder('POST', '/oportunidades/100/productos', 422, { errores: { cantidad: 'La cantidad debe ser un número entero entre 1 y 999' } });
    await acciones.agregarProducto({ producto_id: '3', cantidad: '1000' });
    const d = estado.obtenerEstado().detalle;
    assert.deepEqual(d.valores.linea, { producto_id: '3', cantidad: '1000' });
    assert.deepEqual(Object.keys(d.errores.linea), ['cantidad']);
    assert.equal(d.datos.productos.length, 2, 'el detalle no cambia');
  });

  test('crear una oportunidad carga los clientes propios y, al crearla, abre su detalle', async () => {
    responder('GET', '/clientes', 200, [{ id: 10, nombre: 'Tienda Beta', nit: 'CF', telefono: '22223333', correo: null }]);
    await acciones.abrirNueva();
    assert.deepEqual(estado.obtenerEstado().oportunidades.clientes, [{ id: 10, nombre: 'Tienda Beta' }]);
    responder('POST', '/oportunidades', 201, detalle({ id: 150, etapa: 'prospecto' }));
    await acciones.enviarNueva({ cliente_id: '10', titulo: 'Nueva', vendedor_id: '5' });
    assert.deepEqual(JSON.parse(peticiones.at(-1).opciones.body), { cliente_id: 10, titulo: 'Nueva' });
    assert.equal(globalThis.location.hash, '#/oportunidades/150');
    assert.equal(estado.obtenerEstado().oportunidades.formulario, null);
  });

  test('crear con cliente no válido (422) conserva lo escrito', async () => {
    responder('GET', '/clientes', 200, []);
    await acciones.abrirNueva();
    responder('POST', '/oportunidades', 422, { errores: { cliente_id: 'Seleccione un cliente de su cartera' } });
    await acciones.enviarNueva({ cliente_id: '', titulo: 'Sin cliente' });
    const f = estado.obtenerEstado().oportunidades.formulario;
    assert.deepEqual(f.valores, { cliente_id: '', titulo: 'Sin cliente' });
    assert.deepEqual(Object.keys(f.errores), ['cliente_id']);
    assert.deepEqual(JSON.parse(peticiones.at(-1).opciones.body), { cliente_id: null, titulo: 'Sin cliente' });
  });

  test('un 401 cierra la sesión y reinicia el estado de oportunidades (B2-14)', async () => {
    responder('GET', '/oportunidades', 401, { error: 'Autenticación requerida o sesión no válida' });
    await acciones.cargarTablero();
    assert.equal(estado.obtenerEstado().sesion, null);
    assert.equal(globalThis.location.hash, '#/login');
    assert.deepEqual(estado.obtenerEstado().oportunidades, estado.tableroInicial());
  });

  test('sin conexión: el tablero muestra el mensaje de red', async () => {
    await acciones.cargarTablero();
    assert.equal(estado.obtenerEstado().oportunidades.error, api.MENSAJE_SIN_CONEXION);
  });

  test('formatearQuetzales', () => {
    assert.match(formatearQuetzales(9250), /^Q\s?9,250\.00$/);
    assert.equal(formatearQuetzales(null), '');
  });
});

describe('S7 escapado en tablero y detalle', () => {
  const malo = '<img src=x onerror=alert(1)><script>alert(2)</script>';

  test('títulos, clientes, productos, historial, motivo y mensajes se muestran como texto', () => {
    const tablero = renderOportunidades({ oportunidades: { ...estado.tableroInicial(), cargada: true,
      lista: [resumen('1" onclick="x', 'prospecto', { titulo: malo, cliente: { id: 1, nombre: malo } }), resumen(2, 'ganada', { titulo: malo })],
      clientes: [{ id: '1"><script>', nombre: malo }], formulario: { valores: { cliente_id: '', titulo: malo }, errores: { titulo: malo }, mensaje: { tipo: 'danger" onclick="x', texto: malo }, enviando: false } } });
    const d = detalle({ titulo: malo, cliente: { id: 1, nombre: malo }, motivo_perdida: malo, etapa: 'negociacion',
      productos: [{ id: '5" onclick="x', producto_id: 1, nombre: malo, cantidad: 1, precio_unitario: 1, subtotal: 1 }],
      historial: [{ etapa_anterior: malo, etapa_nueva: malo, usuario: malo, fecha: 'x' }] });
    const vista = renderOportunidad(vistaDetalle(d, { mensaje: { tipo: 'x" onclick="y', texto: malo }, catalogo: [{ id: 9, nombre: malo, precio: 1, stock: 1 }] }));
    for (const html of [tablero, vista]) {
      assert.doesNotMatch(html, /<img|<script|onerror=|" onclick="/);
      assert.match(html, /&lt;img src&#x3D;x onerror&#x3D;alert\(1\)&gt;/);
    }
  });
});
