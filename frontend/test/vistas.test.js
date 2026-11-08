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

  test('no ofrece crear, editar ni tomar clientes', () => {
    const html = renderCartera(cartera({ clientes }));
    assert.doesNotMatch(html, /<form|<input|Crear|Editar|Tomar|Nuevo/i);
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
