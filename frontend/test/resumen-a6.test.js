// A6-09 a A6-12 (Parte A): vista y acciones del resumen mensual de la SPA (docs/specs/A6-resumen.md).
// Vistas (funciones puras) y acciones con localStorage, location y fetch simulados, como las pruebas de la
// Parte B. A6-09 y A6-10 se comprueban además en procesos hijos con otra zona horaria (TZ).
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// --- Entorno de navegador simulado (antes de importar los módulos) ---
const almacen = new Map();
globalThis.localStorage = {
  getItem: (k) => (almacen.has(k) ? almacen.get(k) : null),
  setItem: (k, v) => almacen.set(k, String(v)),
  removeItem: (k) => almacen.delete(k),
};
globalThis.location = { hash: '#/resumen' };

const peticiones = [];
let manejar = null; // (url) => Promise<{ status, cuerpo }> | { status, cuerpo }
globalThis.fetch = async (url, opciones = {}) => {
  peticiones.push({ url, opciones });
  const r = await manejar(url.replace(api.URL_API, ''));
  if (r === 'sin-conexion') throw new TypeError('Failed to fetch');
  return { ok: r.status >= 200 && r.status < 300, status: r.status, text: async () => (r.cuerpo === undefined ? '' : JSON.stringify(r.cuerpo)) };
};

const estado = await import('../js/estado.js');
const api = await import('../js/api.js');
const acciones = await import('../js/acciones-resumen.js');
const { renderResumen, nombreMes } = await import('../js/vistas/resumen.js');
const { formatearQuetzales } = await import('../js/util/formato.js');
const { escaparHtml } = await import('../js/util/escape.js');

const SESION = { token: 'aaa.bbb.ccc', usuario: { id: 4, nombre: 'Valeria López', correo: 'valeria@crm.test' } };
const OCTUBRE = { mes: '2026-10', ventas: 2, total: 9250, pronostico: 2512.88, cartera: { clientes: 3, maximo: 10 } };
const NOVIEMBRE = { mes: '2026-11', ventas: 1, total: 3600, pronostico: 2512.88, cartera: { clientes: 3, maximo: 10 } };
const RELOJ_31_OCT_GT = new Date('2026-11-01T03:30:00Z'); // 31 de octubre, 21:30 en Guatemala

const resumen = () => estado.obtenerEstado().resumen;
const html = () => renderResumen(estado.obtenerEstado());
const respuestaDe = (mes) => (mes === '2026-10' ? OCTUBRE : NOVIEMBRE);
const mesDe = (ruta) => new URL(`http://x${ruta}`).searchParams.get('mes');

/** Respuesta que se resuelve cuando la prueba lo indica. */
function diferida() {
  let resolver;
  const promesa = new Promise((r) => { resolver = r; });
  return { promesa, resolver };
}

beforeEach(() => {
  almacen.clear();
  peticiones.length = 0;
  globalThis.location.hash = '#/resumen';
  estado._reiniciarParaPruebas();
  estado.guardarSesion(SESION);
  manejar = (ruta) => ({ status: 200, cuerpo: respuestaDe(mesDe(ruta)) });
});

describe('A6-09 · vista del resumen (núcleo F5-01)', () => {
  test('muestra el mes, las ventas, el total y el pronóstico en quetzales y la cartera', async () => {
    await acciones.cargarResumen('2026-10');
    const vista = html();
    assert.match(vista, /octubre de 2026/);
    assert.ok(vista.includes(formatearQuetzales(9250)), 'total en quetzales');
    assert.ok(vista.includes(formatearQuetzales(2512.88)), 'pronóstico en quetzales');
    assert.match(formatearQuetzales(9250), /^Q\s?9,250\.00$/);
    assert.match(vista, />3 de 10</);
    assert.match(vista, />2</, 'ventas');
    assert.equal(peticiones.at(-1).url, `${api.URL_API}/reportes/resumen?mes=2026-10`);
    assert.equal(peticiones.at(-1).opciones.headers.Authorization, `Bearer ${SESION.token}`);
  });

  test('el mismo resultado con TZ=Asia/Tokyo y TZ=America/New_York', () => {
    const modulo = (ruta) => new URL(ruta, import.meta.url).href;
    const codigo = `
      globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
      const { renderResumen, nombreMes } = await import(${JSON.stringify(modulo('../js/vistas/resumen.js'))});
      const { mesActualGuatemala } = await import(${JSON.stringify(modulo('../js/acciones-resumen.js'))});
      const estado = { sesion: { token: 't' }, resumen: { mes: '2026-10', cargando: false, error: null, token: 't',
        datos: ${JSON.stringify(OCTUBRE)} } };
      console.log(JSON.stringify({ desfase: new Date('2026-10-15T12:00:00Z').getTimezoneOffset(),
        mes: mesActualGuatemala(new Date('2026-11-01T03:30:00Z')), etiquetas: ['2026-01', '2026-10', '2026-12'].map(nombreMes),
        html: renderResumen(estado) }));`;
    const correr = (tz) => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', codigo], {
      env: { ...process.env, TZ: tz }, cwd: fileURLToPath(new URL('..', import.meta.url)), encoding: 'utf8',
    }));

    const tokio = correr('Asia/Tokyo');
    const nuevaYork = correr('America/New_York');
    assert.notEqual(tokio.desfase, nuevaYork.desfase, 'los procesos hijos sí tienen zonas distintas');
    assert.equal(tokio.mes, '2026-10');
    assert.equal(nuevaYork.mes, '2026-10');
    assert.deepEqual(tokio.etiquetas, ['enero de 2026', 'octubre de 2026', 'diciembre de 2026']);
    assert.deepEqual(nuevaYork.etiquetas, tokio.etiquetas);
    assert.equal(nuevaYork.html, tokio.html);
    assert.match(tokio.html, /octubre de 2026/);
  });
});

describe('A6-10 · mes inicial de Guatemala', () => {
  test('a las 2026-11-01 03:30 UTC (31 de octubre en Guatemala) se pide 2026-10', async () => {
    assert.equal(acciones.mesActualGuatemala(RELOJ_31_OCT_GT), '2026-10');
    assert.equal(acciones.mesActualGuatemala(new Date('2026-11-01T06:00:00Z')), '2026-11');
    await acciones.entrarResumen(RELOJ_31_OCT_GT);
    assert.equal(mesDe(peticiones.at(-1).url.replace(api.URL_API, '')), '2026-10');
    assert.match(html(), /id="resumen-mes"[^>]*value="2026-10"/);
  });

  test('al volver a entrar se conserva el mes elegido en la misma sesión', async () => {
    await acciones.cambiarMes('2026-11');
    await acciones.entrarResumen(RELOJ_31_OCT_GT);
    assert.equal(resumen().mes, '2026-11');
  });
});

describe('A6-11 · carga, error, reintento, 401 y respuesta vieja', () => {
  test('mientras carga: «Cargando…» y el selector deshabilitado', async () => {
    const espera = diferida();
    manejar = () => espera.promesa;
    const carga = acciones.cargarResumen('2026-10');
    assert.equal(resumen().cargando, true);
    assert.match(html(), /Cargando…/);
    assert.match(html(), /id="resumen-mes"[^>]*disabled/);
    espera.resolver({ status: 200, cuerpo: OCTUBRE });
    await carga;
    assert.equal(resumen().cargando, false);
    assert.doesNotMatch(html(), /disabled/);
  });

  test('un 500 muestra el mensaje y «Reintentar»; reintentar carga el mismo mes', async () => {
    manejar = () => ({ status: 500, cuerpo: { error: 'Error interno del servidor' } });
    await acciones.cargarResumen('2026-11');
    assert.equal(resumen().error, 'Error interno del servidor');
    assert.match(html(), /data-accion="reintentar-resumen"/);

    manejar = (ruta) => ({ status: 200, cuerpo: respuestaDe(mesDe(ruta)) });
    await acciones.reintentar();
    assert.equal(mesDe(peticiones.at(-1).url.replace(api.URL_API, '')), '2026-11');
    assert.deepEqual(resumen().datos, NOVIEMBRE);
    assert.equal(resumen().error, null);
  });

  test('sin conexión: mensaje de la Parte B y reintento', async () => {
    manejar = () => 'sin-conexion';
    await acciones.cargarResumen('2026-10');
    assert.equal(resumen().error, api.MENSAJE_SIN_CONEXION);
    assert.match(html(), /Reintentar/);
  });

  test('un 401 lo gestiona api.js: cierra la sesión y vuelve al login, sin error en el resumen', async () => {
    manejar = () => ({ status: 401, cuerpo: { error: 'Autenticación requerida o sesión no válida' } });
    await acciones.cargarResumen('2026-10');
    assert.equal(estado.obtenerEstado().sesion, null);
    assert.equal(globalThis.location.hash, '#/login');
    assert.equal(resumen().error, null);
  });

  test('una respuesta de un mes que ya no está elegido se descarta', async () => {
    const octubre = diferida();
    manejar = (ruta) => (mesDe(ruta) === '2026-10' ? octubre.promesa : { status: 200, cuerpo: NOVIEMBRE });
    const primera = acciones.cargarResumen('2026-10');
    await acciones.cambiarMes('2026-11');
    octubre.resolver({ status: 200, cuerpo: OCTUBRE });
    await primera;
    assert.equal(resumen().mes, '2026-11');
    assert.deepEqual(resumen().datos, NOVIEMBRE);
    assert.match(html(), /noviembre de 2026/);
  });

  test('un mes vacío o mal formado en el selector no consulta la API', async () => {
    await acciones.cambiarMes('');
    await acciones.cambiarMes('2026-13');
    assert.equal(peticiones.length, 0);
    assert.equal(resumen().error, acciones.MENSAJE_MES);
  });
});

describe('A6-12 · texto escapado y sesión', () => {
  test('el texto de la API pasa por escaparHtml', async () => {
    manejar = () => ({ status: 500, cuerpo: { error: '<img src=x onerror="alert(1)">' } });
    await acciones.cargarResumen('2026-10');
    assert.ok(!html().includes('<img'), 'no se inserta HTML de la API');
    assert.ok(html().includes(escaparHtml('<img src=x onerror="alert(1)">')), 'se muestra como texto');
    assert.equal(nombreMes('<b>2026-10</b>'), '');
  });

  test('no se dibujan datos de la sesión anterior (S4)', async () => {
    await acciones.cargarResumen('2026-10');
    assert.match(html(), /octubre de 2026/);
    estado.cerrarSesion();
    estado.guardarSesion({ ...SESION, token: 'otra.sesion.distinta', usuario: { ...SESION.usuario, id: 5 } });
    const vista = html();
    assert.doesNotMatch(vista, /octubre de 2026/);
    assert.ok(!vista.includes(formatearQuetzales(9250)));
    assert.match(vista, /id="resumen-mes"[^>]*value=""/);
  });

  test('una respuesta que llega después de cambiar de sesión se descarta', async () => {
    const tarde = diferida();
    manejar = () => tarde.promesa;
    const carga = acciones.cargarResumen('2026-10');
    estado.cerrarSesion();
    estado.guardarSesion({ ...SESION, token: 'otra.sesion.distinta' });
    tarde.resolver({ status: 200, cuerpo: OCTUBRE });
    await carga;
    assert.doesNotMatch(html(), /octubre de 2026/);
  });
});
