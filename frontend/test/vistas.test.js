// B2-11, B2-15 y B2-16: las vistas generan el HTML esperado y escapan el contenido externo.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { renderLogin } from '../js/vistas/login.js';
import { renderCartera } from '../js/vistas/cartera.js';

const login = (cambios = {}) => ({ login: { cargando: false, correo: '', errores: {}, mensaje: null, ...cambios } });
const cartera = (cambios = {}) => ({ cartera: { cargando: false, clientes: [], error: null, cargada: true, ...cambios } });

describe('B2-11 formulario de login', () => {
  test('tiene correo y contraseña, con autocompletado adecuado y sin valor de contraseña', () => {
    const html = renderLogin(login());
    assert.match(html, /id="form-login"/);
    assert.match(html, /name="correo" type="email"[\s\S]*autocomplete="username"/);
    assert.match(html, /name="clave" type="password"[\s\S]*autocomplete="current-password"/);
    assert.match(html, /name="clave" type="password" class="form-control"\s+value=""/);
  });

  test('muestra los errores 422 por campo y el mensaje general, escapados', () => {
    const html = renderLogin(login({ errores: { correo: '<b>mal</b>' }, mensaje: 'Credenciales <i>incorrectas</i>', correo: '"><script>x</script>' }));
    assert.match(html, /is-invalid/);
    assert.match(html, /&lt;b&gt;mal&lt;&#x2F;b&gt;/);
    assert.match(html, /Credenciales &lt;i&gt;incorrectas&lt;&#x2F;i&gt;/);
    assert.doesNotMatch(html, /<script>x<\/script>|<b>mal<\/b>|<i>incorrectas<\/i>/);
  });

  test('muestra el indicador de carga y desactiva el formulario mientras se envía', () => {
    const html = renderLogin(login({ cargando: true }));
    assert.match(html, /spinner-border/);
    assert.match(html, /Ingresando/);
    assert.equal((html.match(/disabled/g) || []).length, 3);
  });
});

describe('B2-15 cartera de solo lectura', () => {
  const clientes = [
    { id: 1, nombre: 'Comercial El Quetzal', nit: '4521817K', telefono: '55551234', correo: 'compras@elquetzal.test' },
    { id: 2, nombre: 'Consumidor final', nit: 'CF', telefono: '22334455', correo: null },
    { id: 3, nombre: 'Tercero', nit: 'CF', telefono: '33445566', correo: null },
  ];

  test('lista los clientes y muestra el indicador "3 de 10"', () => {
    const html = renderCartera(cartera({ clientes }));
    assert.match(html, /3 de 10/);
    for (const c of clientes) assert.match(html, new RegExp(c.nombre));
    assert.equal((html.match(/<tr>/g) || []).length, 4); // encabezado + 3 filas
  });

  // B3 sustituye la cartera de solo lectura de B2-15: ahora ofrece búsqueda, alta, edición y toma.
  test('ofrece búsqueda, alta, edición por fila y clientes disponibles (B3 §8)', () => {
    const html = renderCartera(cartera({ clientes }));
    assert.match(html, /id="form-busqueda"/);
    assert.match(html, /data-accion="nuevo-cliente"/);
    assert.equal((html.match(/data-accion="editar-cliente"/g) || []).length, 3);
    assert.match(html, /data-accion="ver-disponibles"/);
  });

  test('escapa los textos de la API (B2-16)', () => {
    const html = renderCartera(cartera({ clientes: [{ id: 9, nombre: '<img src=x onerror=alert(1)>', nit: 'CF', telefono: '"22223333"', correo: "a@b.test' onclick='x" }] }));
    assert.doesNotMatch(html, /<img|onerror=|onclick='/);
    assert.match(html, /&lt;img src&#x3D;x onerror&#x3D;alert\(1\)&gt;/);
  });

  test('estados de carga, error con reintento y cartera vacía', () => {
    assert.match(renderCartera(cartera({ cargando: true, cargada: false })), /spinner-border[\s\S]*Cargando clientes/);
    const error = renderCartera(cartera({ error: 'No se pudo conectar con el servidor.' }));
    assert.match(error, /alert-danger[\s\S]*No se pudo conectar[\s\S]*data-accion="reintentar-cartera"/);
    assert.match(renderCartera(cartera()), /Todavía no tiene clientes asignados/);
    assert.match(renderCartera(cartera()), /0 de 10/);
  });

  test('con 10 clientes el indicador se marca como cartera llena', () => {
    const diez = Array.from({ length: 10 }, (_, i) => ({ id: i, nombre: `C${i}`, nit: 'CF', telefono: '22223333', correo: null }));
    const html = renderCartera(cartera({ clientes: diez }));
    assert.match(html, /text-bg-warning[\s\S]*10 de 10/);
  });
});

// ---------------------------------------------------------------------------
// B3 — cartera con búsqueda, formulario y disponibles
// ---------------------------------------------------------------------------
const C = (cambios = {}) => cartera({ total: 2, busqueda: '', formulario: null, disponibles: { visible: false, cargando: false, lista: [], error: null, tomando: null }, ...cambios });
const DOS = [
  { id: 1, nombre: 'Comercial El Quetzal', nit: '4521817K', telefono: '55551234', correo: 'compras@elquetzal.test' },
  { id: 2, nombre: 'Consumidor final', nit: 'CF', telefono: '22334455', correo: null },
];
const formulario = (cambios = {}) => ({ modo: 'crear', id: null, valores: { nombre: '', nit: '', telefono: '', correo: '' }, original: null, errores: {}, mensaje: null, enviando: false, cargando: false, ...cambios });

describe('B3 vista de cartera', () => {
  test('el indicador usa el total de la cartera aunque la búsqueda muestre menos clientes', () => {
    const html = renderCartera(C({ clientes: [DOS[0]], total: 3, busqueda: 'quetzal' }));
    assert.match(html, /3 de 10 clientes/);
    assert.match(html, /id="busqueda-q"[\s\S]*value="quetzal"/);
    assert.match(html, /data-accion="limpiar-busqueda"/);
  });

  test('búsqueda sin resultados muestra el texto buscado escapado', () => {
    const html = renderCartera(C({ clientes: [], busqueda: '<b>x</b>' }));
    assert.match(html, /No se encontraron clientes de su cartera para «&lt;b&gt;x&lt;&#x2F;b&gt;»/);
    assert.doesNotMatch(html, /<b>x<\/b>/);
  });

  test('la búsqueda es un formulario (se ejecuta al enviarlo), con límite de 100 caracteres', () => {
    const html = renderCartera(C({ clientes: DOS }));
    assert.match(html, /<form id="form-busqueda"[\s\S]*name="q" type="search"[\s\S]*maxlength="100"[\s\S]*type="submit"/);
  });

  test('con cartera llena se desactivan «Nuevo cliente» y «Tomar», con aviso', () => {
    const diez = Array.from({ length: 10 }, (_, i) => ({ id: i + 1, nombre: `C${i}`, nit: 'CF', telefono: `2222333${i}`, correo: null }));
    const html = renderCartera(C({ clientes: diez, total: 10, disponibles: { visible: true, cargando: false, lista: [{ id: 50, nombre: 'Libre' }], error: null, tomando: null } }));
    assert.match(html, /data-accion="nuevo-cliente"\s+disabled/);
    assert.match(html, /data-accion="tomar-cliente" data-id="50"[\s\S]*?disabled/);
    assert.match(html, /Su cartera está llena/);
  });

  test('formulario de alta con nombre, NIT, teléfono y correo opcional', () => {
    const html = renderCartera(C({ clientes: DOS, formulario: formulario() }));
    assert.match(html, /<form id="form-cliente"/);
    for (const n of ['nombre', 'nit', 'telefono', 'correo']) assert.match(html, new RegExp(`name="${n}"`));
    assert.match(html, /name="correo" type="email"[^>]*autocomplete="email"(?![^>]*required)/);
    assert.match(html, /Nuevo cliente<\/h2>/);
    assert.match(html, /data-accion="cancelar-formulario"/);
  });

  test('B3-14: errores 422 debajo de cada campo y valores conservados', () => {
    const html = renderCartera(C({
      clientes: DOS,
      formulario: formulario({
        valores: { nombre: 'Bella', nit: '4521817-1', telefono: '123', correo: 'x@y.test' },
        errores: { nit: 'El NIT no es válido', telefono: 'El teléfono debe tener 8 dígitos' },
      }),
    }));
    assert.match(html, /name="nit"[^>]*class="form-control is-invalid"[^>]*value="4521817-1"[^>]*aria-describedby="cliente-nit-ayuda cliente-nit-error"/);
    assert.match(html, /id="cliente-nit-error" class="invalid-feedback">El NIT no es válido</);
    assert.match(html, /id="cliente-telefono-error" class="invalid-feedback">El teléfono debe tener 8 dígitos</);
    assert.match(html, /name="nombre"[^>]*class="form-control"[^>]*value="Bella"/);
    assert.match(html, /name="correo"[^>]*value="x@y.test"/);
    assert.doesNotMatch(html, /cliente-nombre-error|cliente-correo-error/);
  });

  test('mensaje 409 del formulario y estado de envío', () => {
    const html = renderCartera(C({ clientes: DOS, formulario: formulario({ mensaje: { tipo: 'danger', texto: 'El registro ya existe' }, enviando: true }) }));
    assert.match(html, /alert alert-danger" role="alert">El registro ya existe/);
    assert.match(html, /Guardando…/);
    assert.ok((html.match(/disabled/g) || []).length >= 6);
  });

  test('edición con título propio y botón Editar por cliente con su id', () => {
    const html = renderCartera(C({ clientes: DOS, formulario: formulario({ modo: 'editar', id: 1, valores: { nombre: 'Comercial El Quetzal', nit: '4521817K', telefono: '55551234', correo: '' } }) }));
    assert.match(html, /Editar cliente<\/h2>/);
    assert.match(html, /data-accion="editar-cliente" data-id="1"/);
    assert.match(html, /data-accion="editar-cliente" data-id="2"/);
  });

  test('disponibles: lista con botón Tomar, mensaje 409 y estado de carga', () => {
    const d = (cambios) => ({ visible: true, cargando: false, lista: [{ id: 7, nombre: 'Libre Uno' }], error: null, tomando: null, ...cambios });
    const html = renderCartera(C({ clientes: DOS, disponibles: d({ error: 'El cliente ya no está disponible' }) }));
    assert.match(html, /Clientes disponibles/);
    assert.match(html, /Libre Uno[\s\S]*data-accion="tomar-cliente" data-id="7"/);
    assert.match(html, /alert-danger py-2" role="alert">El cliente ya no está disponible/);
    assert.doesNotMatch(html, /data-accion="ver-disponibles"/);
    assert.match(renderCartera(C({ disponibles: d({ cargando: true }) })), /Cargando clientes disponibles/);
    assert.match(renderCartera(C({ disponibles: d({ lista: [] }) })), /No hay clientes disponibles/);
    assert.match(renderCartera(C({ clientes: DOS, disponibles: d({ tomando: 7 }) })), /Tomando…/);
  });

  test('B3-15: nombres con HTML se muestran como texto en tabla, formulario y disponibles', () => {
    const malo = '<script>alert(1)</script><img src=x onerror=alert(2)>';
    const html = renderCartera(C({
      clientes: [{ id: '1" onclick="x', nombre: malo, nit: 'CF', telefono: '22223333', correo: '"><svg onload=1>' }],
      formulario: formulario({ valores: { nombre: malo, nit: '', telefono: '', correo: '' }, errores: { nombre: malo }, mensaje: { tipo: 'danger" onclick="x', texto: malo } }),
      disponibles: { visible: true, cargando: false, lista: [{ id: 9, nombre: malo }], error: malo, tomando: null },
      busqueda: malo,
    }));
    assert.doesNotMatch(html, /<script|<img|<svg|onerror=|onload=|" onclick="/);
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;&#x2F;script&gt;/);
  });
});
