// B6 — calidad de la SPA (F6, S4, S7): login 403/401/422 (B6-09), respuestas tardías de otra sesión
// (B6-08), respuestas en desorden (B6-01), tiempo límite (B6-02, B6-03), indicadores de carga
// (B6-02), recuperación tras un DELETE (B6-05) y borradores de formularios (B6-05, T1.7).
// Vistas (funciones puras) y acciones con localStorage, location y fetch simulados, sin DOM.
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// --- Entorno de navegador simulado (antes de importar los módulos) ---
const almacen = new Map();
globalThis.localStorage = {
  getItem: (k) => (almacen.has(k) ? almacen.get(k) : null),
  setItem: (k, v) => almacen.set(k, String(v)),
  removeItem: (k) => almacen.delete(k),
};
globalThis.location = { hash: '#/cartera' };

// fetch simulado por ruta. Una respuesta puede llevar `espera` (promesa) para retrasarla a voluntad.
let rutas = new Map();
const peticiones = [];
globalThis.fetch = async (url, opciones = {}) => {
  peticiones.push({ url, opciones });
  const clave = `${opciones.method ?? 'GET'} ${url.replace(api.URL_API, '')}`;
  const r = rutas.get(clave);
  if (!r) throw new TypeError(`sin respuesta simulada para ${clave}`);
  const elegida = Array.isArray(r) ? r.shift() : r;
  if (elegida.espera) await elegida.espera;
  return {
    ok: elegida.status >= 200 && elegida.status < 300,
    status: elegida.status,
    text: async () => (elegida.cuerpo === undefined ? '' : JSON.stringify(elegida.cuerpo)),
  };
};
const responder = (metodo, ruta, status, cuerpo, espera) => rutas.set(`${metodo} ${ruta}`, { status, cuerpo, espera });
/** Varias respuestas para la misma ruta, en orden de llegada de las peticiones. */
const responderEnOrden = (metodo, ruta, respuestas) => rutas.set(`${metodo} ${ruta}`, [...respuestas]);
const pausa = () => { let soltar; const espera = new Promise((r) => { soltar = r; }); return { espera, soltar }; };

const estado = await import('../js/estado.js');
const api = await import('../js/api.js');
const sesion = await import('../js/acciones-sesion.js');
const cartera = await import('../js/acciones-cartera.js');
const oportunidades = await import('../js/acciones-oportunidades.js');
const { guardarBorrador } = await import('../js/borradores.js');
const { renderCartera } = await import('../js/vistas/cartera.js');
const { renderOportunidades } = await import('../js/vistas/oportunidades.js');
const { renderOportunidad } = await import('../js/vistas/oportunidad.js');
const { renderActividades } = await import('../js/vistas/actividades.js');
const { renderLogin } = await import('../js/vistas/login.js');

const SESION_A = { token: 'aaa.aaa.aaa', usuario: { id: 4, nombre: 'Vendedora Uno', correo: 'v1@prueba.test' } };
const SESION_B = { token: 'bbb.bbb.bbb', usuario: { id: 5, nombre: 'Vendedor Dos', correo: 'v2@prueba.test' } };
const CLIENTES_A = [{ id: 10, nombre: 'Tienda Beta', nit: '4521817K', telefono: '55551234', correo: null }];
const MENSAJE_403 = 'Su cuenta no tiene acceso a la aplicación de vendedores';

const detalle = (extra = {}) => ({
  id: 100, cliente: { id: 10, nombre: 'Tienda Beta' }, titulo: 'Pedido de temporada', etapa: 'negociacion', probabilidad: 75,
  total: 549.99, fecha_cierre: null, motivo_perdida: null,
  productos: [
    { id: 500, producto_id: 1, nombre: 'Base líquida HD', cantidad: 3, precio_unitario: 150, subtotal: 450 },
    { id: 501, producto_id: 2, nombre: 'Labial mate', cantidad: 3, precio_unitario: 33.33, subtotal: 99.99 },
  ],
  historial: [{ etapa_anterior: null, etapa_nueva: 'prospecto', usuario: 'Vendedora Uno', fecha: '2026-10-01T15:00:00.000Z' }],
  ...extra,
});
const CATALOGO = [{ id: 3, nombre: 'Paleta de sombras', precio: 250, stock: null }];
const e = () => estado.obtenerEstado();

beforeEach(() => {
  almacen.clear();
  peticiones.length = 0;
  rutas = new Map();
  globalThis.location.hash = '#/cartera';
  estado._reiniciarParaPruebas();
  api._fijarTiempoLimiteParaPruebas();
});
afterEach(() => api._fijarTiempoLimiteParaPruebas());

// ---------------------------------------------------------------------------
describe('B6-09 login: 403, 401 y 422 no guardan sesión', () => {
  for (const rol of ['administrador', 'supervisor', 'vendedor desactivado']) {
    test(`${rol} con la clave correcta → 403: se muestra el mensaje de la API y no se guarda ningún token`, async () => {
      responder('POST', '/auth/login', 403, { error: MENSAJE_403 });
      const entro = await sesion.enviarLogin({ correo: 'cuenta@prueba.test', clave: 'Clave.Correcta' });
      assert.equal(entro, false);
      assert.equal(e().sesion, null);
      assert.equal(almacen.has('crm.sesion'), false);
      assert.equal(almacen.size, 0);
      assert.equal(e().login.mensaje, MENSAJE_403);
      assert.equal(e().login.cargando, false);
      assert.match(renderLogin(e()), new RegExp(MENSAJE_403));
      assert.doesNotMatch(JSON.stringify(e()), /Clave\.Correcta/); // la contraseña no queda en el estado
    });
  }

  test('401 (credenciales incorrectas) → mensaje, sin token y sin el aviso de «sesión expirada»', async () => {
    responder('POST', '/auth/login', 401, { error: 'Credenciales incorrectas' });
    assert.equal(await sesion.enviarLogin({ correo: 'x@prueba.test', clave: 'mala' }), false);
    assert.equal(e().login.mensaje, 'Credenciales incorrectas');
    assert.equal(e().aviso, null);
    assert.equal(almacen.size, 0);
    assert.equal(globalThis.location.hash, '#/cartera'); // un 401 del login no redirige
  });

  test('422 con errores por campo → errores bajo los campos y sin mensaje general; conserva el correo', async () => {
    responder('POST', '/auth/login', 422, { errores: { correo: 'Escriba un correo válido.' } });
    await sesion.enviarLogin({ correo: '  no-es-correo ', clave: 'x' });
    assert.deepEqual(e().login.errores, { correo: 'Escriba un correo válido.' });
    assert.equal(e().login.mensaje, null);
    assert.equal(e().login.correo, 'no-es-correo');
  });

  test('422 sin errores y respuestas sin texto de error → mensajes por defecto, nunca «[object Object]»', async () => {
    responder('POST', '/auth/login', 422, { error: { raro: true } });
    await sesion.enviarLogin({ correo: 'a@b.test', clave: 'x' });
    assert.equal(e().login.mensaje, sesion.MENSAJE_REVISE_DATOS);
    responder('POST', '/auth/login', 500, { error: { detalle: 'interno' } });
    await sesion.enviarLogin({ correo: 'a@b.test', clave: 'x' });
    assert.equal(e().login.mensaje, sesion.MENSAJE_LOGIN);
    assert.doesNotMatch(renderLogin(e()), /object Object/);
  });

  test('200 → guarda solo token y usuario { id, nombre, correo }, nunca la contraseña', async () => {
    responder('POST', '/auth/login', 200, { token: SESION_A.token, usuario: { ...SESION_A.usuario, rol: 'vendedor' } });
    assert.equal(await sesion.enviarLogin({ correo: 'v1@prueba.test', clave: 'Secreta.2026' }), true);
    assert.deepEqual(JSON.parse(almacen.get('crm.sesion')), SESION_A);
    assert.doesNotMatch(almacen.get('crm.sesion'), /Secreta|clave|rol/);
    assert.equal(e().login.cargando, false);
  });

  test('sin conexión → mensaje de conexión y sin token', async () => {
    await sesion.enviarLogin({ correo: 'v1@prueba.test', clave: 'x' }); // sin ruta simulada: fetch lanza
    assert.equal(e().login.mensaje, api.MENSAJE_SIN_CONEXION);
    assert.equal(almacen.size, 0);
  });
});

// ---------------------------------------------------------------------------
describe('B6-08 respuestas de otra sesión se descartan (S4)', () => {
  /** Cierra la sesión A y entra B mientras la petición de A sigue en curso. */
  function cambiarDeSesion() {
    estado.cerrarSesion();
    estado.guardarSesion(SESION_B);
  }

  test('cartera: la lista de A no se escribe en la sesión de B', async () => {
    estado.guardarSesion(SESION_A);
    const p = pausa();
    responder('GET', '/clientes', 200, CLIENTES_A, p.espera);
    const carga = cartera.cargarCartera();
    cambiarDeSesion();
    p.soltar();
    await carga;
    assert.deepEqual(e().cartera.clientes, []);
    assert.equal(e().cartera.cargada, false);
  });

  test('cartera: alta, disponibles y tomar de A no tocan el estado de B', async () => {
    estado.guardarSesion(SESION_A);
    const p = pausa();
    responder('GET', '/clientes/disponibles', 200, [{ id: 13, nombre: 'Cliente Disponible' }], p.espera);
    const ver = cartera.verDisponibles();
    cambiarDeSesion();
    p.soltar();
    await ver;
    assert.deepEqual(e().cartera.disponibles.lista, []);

    estado.cerrarSesion();
    estado.guardarSesion(SESION_A);
    estado.actualizar({ cartera: { ...e().cartera, disponibles: { visible: true, cargando: false, lista: [{ id: 13, nombre: 'Cliente Disponible' }], error: null, tomando: null } } });
    const q = pausa();
    responder('POST', '/clientes/13/tomar', 200, CLIENTES_A[0], q.espera);
    const tomar = cartera.tomar(13);
    cambiarDeSesion();
    q.soltar();
    await tomar;
    assert.equal(e().aviso, null);
    assert.equal(e().cartera.disponibles.tomando, null);
  });

  test('oportunidades: el tablero de A no se escribe en B y crear no cambia la ruta de B', async () => {
    estado.guardarSesion(SESION_A);
    const p = pausa();
    responder('GET', '/oportunidades', 200, [{ id: 1, etapa: 'prospecto', titulo: 'De A', cliente: { id: 10, nombre: 'X' }, total: 0 }], p.espera);
    const carga = oportunidades.cargarTablero();
    cambiarDeSesion();
    p.soltar();
    await carga;
    assert.deepEqual(e().oportunidades.lista, []);

    estado.cerrarSesion();
    estado.guardarSesion(SESION_A);
    estado.actualizar({ oportunidades: { ...e().oportunidades, formulario: { valores: { cliente_id: '', titulo: '' }, errores: {}, mensaje: null, enviando: false, cargandoClientes: false } } });
    const q = pausa();
    responder('POST', '/oportunidades', 201, detalle({ id: 777 }), q.espera);
    const crear = oportunidades.enviarNueva({ cliente_id: '10', titulo: 'Nueva' });
    cambiarDeSesion();
    globalThis.location.hash = '#/cartera';
    q.soltar();
    await crear;
    assert.equal(globalThis.location.hash, '#/cartera');
    assert.equal(e().aviso, null);
  });

  test('un 401 tardío de la sesión anterior no cierra la sesión de quien entró después', async () => {
    estado.guardarSesion(SESION_A);
    const p = pausa();
    responder('GET', '/clientes', 401, { error: 'Autenticación requerida o sesión no válida' }, p.espera);
    const carga = cartera.cargarCartera();
    cambiarDeSesion();
    globalThis.location.hash = '#/cartera';
    p.soltar();
    await carga;
    assert.deepEqual(e().sesion, SESION_B);
    assert.deepEqual(JSON.parse(almacen.get('crm.sesion')), SESION_B);
    assert.equal(globalThis.location.hash, '#/cartera');
    assert.equal(e().aviso, null);
  });

  test('un 401 de la sesión vigente sí la cierra (B2-14 se mantiene)', async () => {
    estado.guardarSesion(SESION_A);
    responder('GET', '/clientes', 401, { error: 'Autenticación requerida o sesión no válida' });
    await cartera.cargarCartera();
    assert.equal(e().sesion, null);
    assert.equal(globalThis.location.hash, '#/login');
    assert.equal(e().aviso.texto, api.MENSAJE_SESION_EXPIRADA);
  });

  test('detalle: la respuesta de A no se muestra a B', async () => {
    estado.guardarSesion(SESION_A);
    const p = pausa();
    responder('GET', '/oportunidades/100', 200, detalle(), p.espera);
    responder('GET', '/productos', 200, CATALOGO);
    const carga = oportunidades.cargarDetalle(100);
    cambiarDeSesion();
    p.soltar();
    await carga;
    assert.equal(e().detalle.datos, null);
  });
});

// ---------------------------------------------------------------------------
describe('B6-01 respuestas en desorden: solo cuenta la última consulta', () => {
  test('dos búsquedas seguidas en la cartera: la primera, más lenta, no sobrescribe a la segunda', async () => {
    estado.guardarSesion(SESION_A);
    const lenta = pausa();
    responder('GET', '/clientes?q=beta', 200, CLIENTES_A, lenta.espera);
    responder('GET', '/clientes?q=alfa', 200, [{ id: 11, nombre: 'Almacén Alfa', nit: 'CF', telefono: '22334455', correo: null }]);
    responder('GET', '/clientes', 200, [...CLIENTES_A, { id: 11, nombre: 'Almacén Alfa', nit: 'CF', telefono: '22334455', correo: null }]);
    const primera = cartera.buscar('beta');
    const segunda = cartera.buscar('alfa');
    await segunda;
    lenta.soltar();
    await primera;
    assert.equal(e().cartera.busqueda, 'alfa');
    assert.deepEqual(e().cartera.clientes.map((c) => c.id), [11]);
    assert.equal(e().cartera.cargando, false);
  });

  test('dos recargas del tablero: la respuesta vieja se descarta', async () => {
    estado.guardarSesion(SESION_A);
    const lenta = pausa();
    responderEnOrden('GET', '/oportunidades', [
      { status: 200, cuerpo: [{ id: 1, etapa: 'prospecto', titulo: 'Vieja', cliente: { id: 10, nombre: 'X' }, total: 0 }], espera: lenta.espera },
      { status: 200, cuerpo: [{ id: 2, etapa: 'calificado', titulo: 'Nueva', cliente: { id: 10, nombre: 'X' }, total: 0 }] },
    ]);
    const primera = oportunidades.cargarTablero();
    const segunda = oportunidades.cargarTablero();
    await segunda;
    lenta.soltar();
    await primera;
    assert.deepEqual(e().oportunidades.lista.map((o) => o.titulo), ['Nueva']);
  });
});

// ---------------------------------------------------------------------------
describe('B6-02 y B6-03 tiempo límite: el indicador siempre se retira', () => {
  /** fetch que nunca responde, salvo que se cancele con su AbortSignal (como el fetch real). */
  function fetchColgado() {
    globalThis.fetch = (url, opciones = {}) => new Promise((_, rechazar) => {
      opciones.signal?.addEventListener('abort', () => rechazar(new DOMException('Abortada', 'AbortError')));
    });
  }
  let fetchOriginal;
  beforeEach(() => { fetchOriginal = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = fetchOriginal; });

  test('pedir cancela la petición al agotarse el tiempo: status 0, tiempoAgotado y mensaje propio', async () => {
    fetchColgado();
    api._fijarTiempoLimiteParaPruebas(20);
    const r = await api.pedir('/productos');
    assert.equal(r.ok, false);
    assert.equal(r.status, 0);
    assert.equal(r.tiempoAgotado, true);
    assert.equal(r.datos.error, api.MENSAJE_TIEMPO_AGOTADO);
  });

  test('una escritura cancelada por tiempo avisa de que pudo completarse (no invita a reintentar a ciegas)', async () => {
    fetchColgado();
    api._fijarTiempoLimiteParaPruebas(20);
    const r = await api.pedir('/oportunidades', { metodo: 'POST', cuerpo: { cliente_id: 1, titulo: 'x' } });
    assert.equal(r.tiempoAgotado, true);
    assert.equal(r.datos.error, api.MENSAJE_TIEMPO_AGOTADO_ESCRITURA);
    assert.match(r.datos.error, /pudo haberse completado/);
  });

  test('cada petición lleva una señal de cancelación', async () => {
    responder('GET', '/productos', 200, []);
    await api.pedir('/productos');
    assert.ok(peticiones.at(-1).opciones.signal instanceof AbortSignal);
  });

  test('la cartera deja de cargar y muestra el mensaje si la API no responde', async () => {
    estado.guardarSesion(SESION_A);
    fetchColgado();
    api._fijarTiempoLimiteParaPruebas(20);
    await cartera.cargarCartera();
    assert.equal(e().cartera.cargando, false);
    assert.equal(e().cartera.error, api.MENSAJE_TIEMPO_AGOTADO);
    assert.match(renderCartera(e()), /tardó demasiado/);
    assert.doesNotMatch(renderCartera(e()), /Cargando clientes/);
  });
});

// ---------------------------------------------------------------------------
describe('B6-02 indicadores de carga en el detalle y en las recargas', () => {
  const conDetalle = (cambios) => ({ ...e(), detalle: { ...estado.detalleInicial(), id: '100', datos: detalle(), catalogo: CATALOGO, ...cambios } });

  for (const [enviando, texto, extra] of [
    ['titulo', 'Guardando…'],
    ['agregar', 'Agregando…'],
    ['linea-500', 'Guardando…'],
    ['quitar-501', 'Quitando…'],
    ['etapa-perdida', 'Confirmando…', { perdida: true }],
  ]) {
    test(`acción «${enviando}» en curso: su botón muestra un spinner y «${texto}»`, () => {
      const html = renderOportunidad(conDetalle({ enviando, ...extra }));
      assert.match(html, new RegExp(`spinner-border[^]*?${texto}`));
      const libre = renderOportunidad(conDetalle({ enviando: null, ...extra }));
      assert.doesNotMatch(libre, new RegExp(texto));
    });
  }

  test('recargas con datos ya mostrados: «Actualizando…» en tablero, actividades y detalle', () => {
    const t = { ...e(), oportunidades: { ...estado.tableroInicial(), cargando: true, cargada: true, lista: [] } };
    assert.match(renderOportunidades(t), /Actualizando…/);
    assert.doesNotMatch(renderOportunidades({ ...t, oportunidades: { ...t.oportunidades, cargando: false } }), /Actualizando…/);
    const lista = [{ id: 1, cliente: { id: 10, nombre: 'X' }, tipo: 'tarea', descripcion: 'd', vence_en: null, completada: false, vencida: false }];
    const a = { ...e(), actividades: { ...estado.actividadesInicial(), cargando: true, cargada: true, lista } };
    assert.match(renderActividades(a), /Actualizando…/);
    assert.match(renderOportunidad(conDetalle({ cargando: true })), /Actualizando…/);
  });
});

// ---------------------------------------------------------------------------
describe('B6-04 diseño a 375 px (regresión de lo medido en el navegador)', () => {
  test('cartera: en pantallas pequeñas el correo va bajo el nombre y su columna se oculta', () => {
    const html = renderCartera({ ...e(), cartera: { ...estado.carteraInicial(), cargada: true, total: 1, clientes: [{ id: 1, nombre: 'Tienda', nit: 'CF', telefono: '22223333', correo: 'a@b.test' }] } });
    assert.match(html, /<th scope="col" class="d-none d-sm-table-cell">Correo<\/th>/);
    assert.match(html, /<td class="text-break d-none d-sm-table-cell">a@b\.test<\/td>/);
    assert.match(html, /<div class="small text-body-secondary d-sm-none">a@b\.test<\/div>/);
  });

  test('detalle: precio y «Quitar» se reubican en móvil; el total sigue alineado con su columna', () => {
    const html = renderOportunidad({ ...e(), detalle: { ...estado.detalleInicial(), id: '100', datos: detalle(), catalogo: CATALOGO } });
    assert.equal((html.match(/data-accion="quitar-linea" data-id="500"/g) ?? []).length, 2); // uno por tamaño de pantalla
    assert.match(html, /btn-outline-danger mt-1 d-sm-none" data-accion="quitar-linea"/);
    assert.match(html, /<td class="text-end d-none d-sm-table-cell"><button/);
    assert.match(html, /<th scope="col" class="text-end d-none d-sm-table-cell">Precio<\/th>/);
    assert.match(html, /Q\s?150\.00 c\/u/);
    assert.match(html, /<th scope="row" colspan="2" class="text-end">Total<\/th><td class="d-none d-sm-table-cell"><\/td>/);
    assert.match(html, /flex-column flex-sm-row/);
  });

  test('la hoja de estilos no esconde el desbordamiento y recorta lo absoluto dentro de las tablas', async () => {
    const { readFile } = await import('node:fs/promises');
    const css = await readFile(new URL('../css/estilos.css', import.meta.url), 'utf8');
    assert.doesNotMatch(css.replace(/\/\*[^]*?\*\//g, ''), /overflow-x\s*:\s*hidden/);
    assert.match(css, /\.table-responsive\s*\{\s*position:\s*relative;/);
  });
});

// ---------------------------------------------------------------------------
describe('B6-05 recuperación tras quitar una línea', () => {
  test('DELETE 204 con relectura fallida: no deja a la vista la línea quitada; ofrece reintentar', async () => {
    estado.guardarSesion(SESION_A);
    responder('GET', '/oportunidades/100', 200, detalle());
    responder('GET', '/productos', 200, CATALOGO);
    await oportunidades.cargarDetalle(100);
    responder('DELETE', '/oportunidades/100/productos/501', 204);
    responder('GET', '/oportunidades/100', 503, { error: 'Servicio no disponible' });
    const ok = await oportunidades.quitarProducto('501');
    assert.equal(ok, true);
    const d = e().detalle;
    assert.equal(d.datos, null);
    assert.match(d.error, /Producto quitado\./);
    assert.match(d.error, /Servicio no disponible/);
    assert.match(renderOportunidad(e()), /data-accion="reintentar-detalle"/);
    assert.doesNotMatch(renderOportunidad(e()), /Labial mate/);
  });
});

// ---------------------------------------------------------------------------
describe('B6-05 borradores: lo escrito sin enviar sobrevive a cualquier render (T1.7)', () => {
  test('guardar un borrador no vuelve a dibujar (no avisa a los oyentes)', () => {
    let renders = 0;
    estado.suscribir(() => { renders += 1; });
    estado.actualizar({ cartera: { ...e().cartera, formulario: { modo: 'crear', id: null, valores: { nombre: '', nit: '', telefono: '', correo: '' }, original: null, errores: {}, mensaje: null, enviando: false, cargando: false } } });
    renders = 0;
    assert.equal(guardarBorrador({ formulario: 'form-cliente', nombre: 'nombre', valor: 'Tienda Nueva' }), true);
    assert.equal(renders, 0);
    assert.equal(e().cartera.formulario.valores.nombre, 'Tienda Nueva');
  });

  test('alta de cliente: cerrar un aviso o recargar la cartera conserva lo escrito', () => {
    estado.actualizar({ cartera: { ...e().cartera, cargada: true, formulario: { modo: 'crear', id: null, valores: { nombre: '', nit: '', telefono: '', correo: '' }, original: null, errores: {}, mensaje: null, enviando: false, cargando: false } } });
    guardarBorrador({ formulario: 'form-cliente', nombre: 'nombre', valor: 'Tienda Nueva' });
    guardarBorrador({ formulario: 'form-cliente', nombre: 'telefono', valor: '77889900' });
    estado.actualizar({ aviso: { tipo: 'info', texto: 'x' } });
    estado.actualizar({ aviso: null }); // «cerrar aviso» redibuja la vista
    const html = renderCartera(e());
    assert.match(html, /value="Tienda Nueva"/);
    assert.match(html, /value="77889900"/);
  });

  test('la búsqueda escrita y no enviada se conserva; al buscar se aplica y el borrador se limpia', async () => {
    estado.guardarSesion(SESION_A);
    guardarBorrador({ formulario: 'form-busqueda', nombre: 'q', valor: 'bet' });
    assert.match(renderCartera(e()), /value="bet"/);
    responder('GET', '/clientes?q=beta', 200, CLIENTES_A);
    responder('GET', '/clientes', 200, CLIENTES_A);
    await cartera.buscar('beta');
    assert.equal(e().cartera.borradorBusqueda, null);
    assert.match(renderCartera(e()), /value="beta"/);
  });

  test('detalle: título, cantidad de una línea, línea nueva y motivo se conservan al quitar otra línea', async () => {
    estado.guardarSesion(SESION_A);
    responder('GET', '/oportunidades/100', 200, detalle());
    responder('GET', '/productos', 200, CATALOGO);
    await oportunidades.cargarDetalle(100);
    guardarBorrador({ formulario: 'form-titulo', nombre: 'titulo', valor: 'Título a medio escribir' });
    guardarBorrador({ formulario: '', dataset: { formulario: 'linea', id: '500' }, nombre: 'cantidad', valor: '7' });
    guardarBorrador({ formulario: 'form-agregar-linea', nombre: 'cantidad', valor: '4' });
    responder('DELETE', '/oportunidades/100/productos/501', 204);
    responder('GET', '/oportunidades/100', 200, detalle({ productos: [detalle().productos[0]], total: 450 }));
    await oportunidades.quitarProducto('501');
    const html = renderOportunidad(e());
    assert.match(html, /value="Título a medio escribir"/);
    assert.match(html, /id="linea-cantidad-500"[^>]*value="7"/);
    assert.match(html, /id="linea-cantidad"[^>]*value="4"/);
  });

  test('la contraseña del login nunca se guarda; el correo sí', () => {
    assert.equal(guardarBorrador({ formulario: 'form-login', nombre: 'clave', valor: 'Secreta.2026' }), false);
    assert.equal(guardarBorrador({ formulario: 'form-login', nombre: 'correo', valor: 'v1@prueba.test' }), true);
    assert.equal(e().login.correo, 'v1@prueba.test');
    assert.doesNotMatch(JSON.stringify(e()), /Secreta/);
    assert.equal(almacen.size, 0); // los borradores no van a localStorage
  });

  test('un formulario que se está enviando o un campo desconocido no se modifican', () => {
    const valores = { cliente_id: '10', tipo: 'tarea', descripcion: 'Enviada', vence_en: '' };
    estado.actualizar({ actividades: { ...e().actividades, formulario: { valores, errores: {}, mensaje: null, enviando: true, cargandoClientes: false } } });
    guardarBorrador({ formulario: 'form-actividad', nombre: 'descripcion', valor: 'Otra' });
    assert.equal(e().actividades.formulario.valores.descripcion, 'Enviada');
    assert.equal(guardarBorrador({ formulario: 'form-actividad', nombre: 'vendedor_id', valor: '9' }), false);
    assert.equal(guardarBorrador({ formulario: 'form-desconocido', nombre: 'x', valor: '1' }), false);
    assert.equal(e().actividades.formulario.valores.vendedor_id, undefined);
  });

  test('sin formulario abierto, un borrador no crea uno', () => {
    guardarBorrador({ formulario: 'form-oportunidad', nombre: 'titulo', valor: 'x' });
    assert.equal(e().oportunidades.formulario, null);
  });
});
